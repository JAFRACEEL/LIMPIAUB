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

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!triggerSecret || req.headers.get('x-push-secret') !== triggerSecret) {
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

  const userIds = Array.isArray(payload.user_ids) ? payload.user_ids.filter(Boolean) : []
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
    url: payload.url ?? '/',
  })

  let enviados = 0
  const idsAEliminar: string[] = []

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          cuerpoNotificacion,
        )
        enviados += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          idsAEliminar.push(sub.id)
        }
      }
    }),
  )

  if (idsAEliminar.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', idsAEliminar)
  }

  return new Response(JSON.stringify({ enviados, eliminados: idsAEliminar.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
