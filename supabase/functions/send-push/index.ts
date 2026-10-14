// Limpi: envía notificaciones Web Push a los dispositivos suscritos de una
// lista de usuarios. La llama Postgres (fn_enviar_push, via pg_net) cada vez
// que pasa algo que la app necesita avisar aunque esté cerrada.
//
// Variables de entorno requeridas (Project Settings > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:correo@... o https://...)
//   PUSH_TRIGGER_SECRET  (mismo valor que app_config.push_function_secret)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ya los provee Supabase automáticamente)

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

interface Payload {
  user_ids: string[]
  titulo: string
  cuerpo: string
  url?: string
}

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@limpi.pe'
const triggerSecret = Deno.env.get('PUSH_TRIGGER_SECRET') ?? ''
// Si el servicio push no responde, no esperamos para siempre (la función tiene un tope de tiempo de ejecución).
const timeoutMs = Number(Deno.env.get('PUSH_TIMEOUT_MS') ?? '10000')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Comparación sin atajos por longitud/primer carácter distinto (el secreto compartido no debe poder adivinarse midiendo tiempos). */
function secretosIguales(a: string, b: string): boolean {
  let diferencia = a.length ^ b.length
  const largo = Math.max(a.length, b.length)
  for (let i = 0; i < largo; i++) diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diferencia === 0
}

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!triggerSecret || !secretosIguales(req.headers.get('x-push-secret') ?? '', triggerSecret)) {
    return new Response('No autorizado', { status: 401 })
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response('VAPID no configurado', { status: 500 })
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }
  // Un JSON válido pero que no es un objeto (null, número, lista, texto) no es un aviso: 400, no un error 500.
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return new Response('Cuerpo inválido', { status: 400 })
  }
  if (
    (payload.titulo !== undefined && typeof payload.titulo !== 'string') ||
    (payload.cuerpo !== undefined && typeof payload.cuerpo !== 'string')
  ) {
    return new Response('Título o cuerpo inválidos', { status: 400 })
  }

  // Solo identificadores con forma de uuid: lo demás nunca llega a la base (que respondería con un error interno).
  const userIds = Array.isArray(payload.user_ids)
    ? payload.user_ids.filter((id): id is string => typeof id === 'string' && UUID.test(id))
    : []
  if (userIds.length === 0 || !payload.titulo || !payload.cuerpo) {
    return new Response(JSON.stringify({ enviados: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const cuerpoNotificacion = JSON.stringify({
    titulo: payload.titulo,
    cuerpo: payload.cuerpo,
    url: typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/',
  })

  let enviados = 0
  let fallidos = 0
  const idsAEliminar: string[] = []

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          cuerpoNotificacion,
          { timeout: timeoutMs },
        )
        enviados += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          // Suscripción vencida o dada de baja por el navegador: se borra para no insistir.
          idsAEliminar.push(sub.id)
        } else {
          // Otro error del servicio push (límite, caída, VAPID rechazado, red): se conserva la suscripción y queda registro.
          // Solo se registra el origen del endpoint: la ruta completa es un secreto de esa suscripción.
          fallidos += 1
          let origen = 'desconocido'
          try {
            origen = new URL(sub.endpoint).origin
          } catch {
            // endpoint mal formado
          }
          console.error('send-push: fallo del servicio push', JSON.stringify({ statusCode: statusCode ?? null, origen }))
        }
      }
    }),
  )

  if (idsAEliminar.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', idsAEliminar)
  }

  return new Response(JSON.stringify({ enviados, eliminados: idsAEliminar.length, fallidos }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
