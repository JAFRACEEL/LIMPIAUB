import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

// El navegador exige la clave pública como Uint8Array, pero Supabase y el
// resto de la app la manejan como texto (base64url).
function base64UrlAUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binario.length))
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

export function soportaPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
}

export function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function esStandalone(): boolean {
  const conMatchMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return conMatchMedia || iosStandalone
}

// En iPhone, Push solo funciona si la PWA está instalada en la pantalla de
// inicio (Safari no da permiso de notificaciones a una pestaña normal).
export function requiereInstalarComoApp(): boolean {
  return esIOS() && !esStandalone()
}

export async function obtenerSuscripcionActual(): Promise<PushSubscription | null> {
  if (!soportaPush()) return null
  try {
    const registro = await navigator.serviceWorker.ready
    return await registro.pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function tieneSuscripcionGuardada(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return (count ?? 0) > 0
}

// El navegador solo sabe si HAY una suscripción push activa, no de quién es:
// si otra persona ya inició sesión antes en este mismo dispositivo, esa
// suscripción sigue ahí después de cerrar sesión y "pertenece" (en la base
// de datos) a esa otra cuenta. Confirmamos contra el servidor, no solo
// contra el navegador.
export async function suscripcionLePerteneceA(userId: string): Promise<boolean> {
  const suscripcion = await obtenerSuscripcionActual()
  if (!suscripcion) return false
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', suscripcion.endpoint)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function activarNotificaciones(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!soportaPush()) {
    return { ok: false, error: 'Este navegador no soporta notificaciones push.' }
  }
  if (requiereInstalarComoApp()) {
    return { ok: false, error: 'Primero instala YAVI en tu pantalla de inicio.' }
  }

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') {
    return { ok: false, error: 'No diste permiso para las notificaciones.' }
  }

  try {
    const registro = await navigator.serviceWorker.ready
    let suscripcion = await registro.pushManager.getSubscription()
    if (suscripcion) {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', suscripcion.endpoint)
        .eq('user_id', userId)
        .maybeSingle()
      if (!data) {
        // Es de otra cuenta que usó este mismo dispositivo (o quedó
        // huérfana): el endpoint es único por fila, así que no se puede
        // simplemente reasignar. Hay que renovarla antes de guardarla.
        await suscripcion.unsubscribe()
        suscripcion = null
      }
    }
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlAUint8Array(VAPID_PUBLIC_KEY as string),
      })
    }

    const json = suscripcion.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: suscripcion.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' },
    )
    if (error) return { ok: false, error: error.message }

    return { ok: true }
  } catch {
    return { ok: false, error: 'No pudimos activar las notificaciones. Intenta de nuevo.' }
  }
}

export async function desactivarNotificaciones(userId: string): Promise<void> {
  const suscripcion = await obtenerSuscripcionActual()
  if (suscripcion) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', suscripcion.endpoint).eq('user_id', userId)
    await suscripcion.unsubscribe()
  }
}

// Para no insistir en cada login: una vez que la persona activó las
// notificaciones o dijo explícitamente "ahora no", no la volvemos a
// interrumpir con la pantalla de activación (puede reabrirla desde el menú).
function claveDecidido(userId: string): string {
  return `limpi_notif_decidido_${userId}`
}

export function notifYaDecidido(userId: string): boolean {
  try {
    return localStorage.getItem(claveDecidido(userId)) === '1'
  } catch {
    return false
  }
}

export function marcarNotifDecidido(userId: string): void {
  try {
    localStorage.setItem(claveDecidido(userId), '1')
  } catch {
    // localStorage no disponible (modo privado, etc.): no es crítico, en el
    // peor caso se vuelve a mostrar la pantalla en el próximo login.
  }
}
