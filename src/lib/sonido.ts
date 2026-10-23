// Alarma cuando la app está abierta (el aviso con la app cerrada lo da la notificación push).
// Se usa un elemento <audio> con un tono generado aquí mismo (sin archivos): en iPhone suena de forma
// confiable, también en la app instalada. Los navegadores solo dejan sonar después de un toque de la
// persona, por eso `prepararSonido` lo "desbloquea" con el primer toque en la pantalla.

const FRECUENCIA_MUESTREO = 22050

/** Timbre agradable de ~3 s: un arpegio de campanita que se repite dos veces. Devuelve un WAV mono de 16 bits. */
function generarWav(): Blob {
  const segundos = 3
  const n = Math.floor(FRECUENCIA_MUESTREO * segundos)
  const datos = new Float32Array(n)
  // Notas del arpegio (Do mayor, octava alta) y el momento en que entra cada una.
  const notas: [number, number][] = [
    [659.25, 0],
    [783.99, 0.16],
    [987.77, 0.32],
    [1318.51, 0.5],
  ]
  for (const inicioRepeticion of [0, 1.5]) {
    for (const [hz, retraso] of notas) {
      const desde = inicioRepeticion + retraso
      const largo = 0.9
      for (let i = Math.floor(desde * FRECUENCIA_MUESTREO); i < Math.min(n, Math.floor((desde + largo) * FRECUENCIA_MUESTREO)); i++) {
        const t = i / FRECUENCIA_MUESTREO - desde
        const ataque = Math.min(1, t / 0.005)
        const caida = Math.exp(-t / 0.22)
        const onda = Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(2 * Math.PI * hz * 2 * t) + 0.12 * Math.sin(2 * Math.PI * hz * 3 * t)
        datos[i] += onda * ataque * caida * 0.42
      }
    }
  }
  const pcm = new Int16Array(n)
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, datos[i])) * 0.9 * 32767)
  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(buffer)
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)))
  texto(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length * 2, true)
  texto(8, 'WAVE')
  texto(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, FRECUENCIA_MUESTREO, true)
  v.setUint32(28, FRECUENCIA_MUESTREO * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  texto(36, 'data')
  v.setUint32(40, pcm.length * 2, true)
  pcm.forEach((m, i) => v.setInt16(44 + i * 2, m, true))
  return new Blob([buffer], { type: 'audio/wav' })
}

let audio: HTMLAudioElement | null = null
let desbloqueado = false
let preparado = false

function elemento(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null
  if (!audio) {
    audio = new Audio(URL.createObjectURL(generarWav()))
    audio.preload = 'auto'
    audio.volume = 1
  }
  return audio
}

/** Llamar una vez al abrir el panel: deja el audio listo en cuanto la persona toca la pantalla. */
export function prepararSonido() {
  if (preparado || typeof window === 'undefined') return
  preparado = true
  // iPhone: que suene aunque el interruptor de silencio esté puesto (iOS 17+; en otros navegadores no existe).
  try {
    const sesion = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (sesion) sesion.type = 'playback'
  } catch {
    // no soportado
  }
  const despertar = () => {
    if (desbloqueado) return
    const a = elemento()
    if (!a) return
    // Se reproduce sin volumen un instante: eso es lo que desbloquea el audio en Safari.
    a.muted = true
    a.play()
      .then(() => {
        a.pause()
        a.currentTime = 0
        a.muted = false
        desbloqueado = true
      })
      .catch(() => {
        a.muted = false
      })
  }
  for (const evento of ['pointerdown', 'touchend', 'click'] as const) {
    window.addEventListener(evento, despertar, { passive: true })
  }
}

function sonar(repetir: boolean) {
  const a = elemento()
  if (!a) return
  try {
    a.loop = repetir
    a.muted = false
    a.currentTime = 0
    void a.play().catch(() => {
      // Bloqueado hasta que la persona toque la pantalla: el botón "Toca aquí" lo resuelve.
      desbloqueado = false
    })
  } catch {
    // Sin audio: no es crítico, la pantalla completa sigue avisando.
  }
}

function vibrarPatron() {
  try {
    navigator.vibrate?.([400, 200, 400])
  } catch {
    // iPhone/Safari no permite vibrar desde una página web.
  }
}

/** Un solo aviso corto (pedido directo o nuevo mientras la app está abierta). */
export function reproducirSonidoAlerta() {
  if (temporizador === null) sonar(false)
}

let temporizador: number | null = null
const DURACION_MAXIMA_MS = 600_000
const CADA_MS = 1000

/** Suena y vibra en bucle, como una llamada, hasta `detenerAlarma()` (responder o minimizar) o 10 minutos. */
export function iniciarAlarma() {
  if (temporizador !== null) return
  const inicio = Date.now()
  sonar(true)
  vibrarPatron()
  let tic = 0
  temporizador = window.setInterval(() => {
    if (Date.now() - inicio > DURACION_MAXIMA_MS) {
      detenerAlarma()
      return
    }
    // Vigilancia: si Safari paró el audio (o terminó el tono), se vuelve a lanzar hasta que respondan.
    if (audio && (audio.paused || audio.ended)) sonar(true)
    tic++
    if (tic % 2 === 0) vibrarPatron()
  }, CADA_MS)
}

export function detenerAlarma() {
  if (temporizador !== null) {
    window.clearInterval(temporizador)
    temporizador = null
  }
  try {
    audio?.pause()
    if (audio) audio.currentTime = 0
    navigator.vibrate?.(0)
  } catch {
    // no soportado
  }
}

/** ¿Está el audio desbloqueado? En iPhone solo lo está después de un toque en la pantalla. */
export function audioListo(): boolean {
  return desbloqueado
}

/** Desbloquea el audio desde un botón (cuenta como toque) y suena una vez para confirmar. */
export function activarSonido() {
  const a = elemento()
  if (!a) return
  a.muted = false
  a.loop = false
  a.currentTime = 0
  a.play()
    .then(() => {
      desbloqueado = true
    })
    .catch(() => {
      // sigue bloqueado
    })
}
