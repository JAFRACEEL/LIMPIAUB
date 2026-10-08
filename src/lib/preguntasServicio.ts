import { buscarServicioPorNombre, type PreguntaServicio, type Respuestas } from './catalogoServicios'
import { esCelularValido } from './validadores'

export interface RespuestaResumen {
  etiqueta: string
  valor: string
}

export interface DetallesServicio {
  /** Respuestas visibles también para trabajadoras que aún no fueron elegidas. */
  respuestas: RespuestaResumen[]
  /** Datos personales: solo visibles para la trabajadora asignada (las vistas de pedidos abiertos lo excluyen). */
  privado?: RespuestaResumen[]
  fotos?: string[]
}

/** Preguntas que aplican al servicio y modalidad elegidos, según lo ya respondido. */
export function preguntasVisibles(
  servicioNombre: string,
  subtipoId: string | null,
  respuestas: Respuestas,
): PreguntaServicio[] {
  const servicio = buscarServicioPorNombre(servicioNombre)
  if (!servicio?.preguntas) return []
  return servicio.preguntas.filter((p) => {
    if (p.soloSubtipos && (!subtipoId || !p.soloSubtipos.includes(subtipoId))) return false
    if (p.visibleSi && !p.visibleSi(respuestas)) return false
    return true
  })
}

function vacia(valor: string | string[] | undefined): boolean {
  if (valor === undefined) return true
  if (Array.isArray(valor)) return valor.length === 0
  return valor.trim() === ''
}

/** Devuelve el mensaje de error de la primera pregunta mal respondida, o null. */
export function validarRespuestas(preguntas: PreguntaServicio[], respuestas: Respuestas): string | null {
  for (const p of preguntas) {
    const valor = respuestas[p.id]
    if (p.obligatoria && vacia(valor)) return `Responde: ${p.etiqueta}`
    if (p.tipo === 'cantidad' && !vacia(valor)) {
      const n = Number(valor)
      if (!Number.isInteger(n) || n < 1) return 'La cantidad de prendas debe ser un número entero mayor a 0.'
    }
    if (p.id === 'contacto_recojo' && !vacia(valor) && !esCelularValido(String(valor))) {
      return 'El número de contacto debe ser un celular de 9 dígitos que empiece con 9.'
    }
  }
  return null
}

/**
 * Pares etiqueta/valor listos para guardar y mostrarle a la trabajadora,
 * separando los datos personales (privada) de los que ve cualquier candidata.
 */
export function resumenRespuestas(
  preguntas: PreguntaServicio[],
  respuestas: Respuestas,
): { publico: RespuestaResumen[]; privado: RespuestaResumen[] } {
  const publico: RespuestaResumen[] = []
  const privado: RespuestaResumen[] = []
  for (const p of preguntas) {
    const valor = respuestas[p.id]
    if (vacia(valor)) continue
    const item = { etiqueta: p.etiqueta, valor: Array.isArray(valor) ? valor.join(', ') : String(valor).trim() }
    ;(p.privada ? privado : publico).push(item)
  }
  return { publico, privado }
}

/** Avisos informativos (no bloquean) según las respuestas actuales. */
export function avisosActivos(
  preguntas: PreguntaServicio[],
  respuestas: Respuestas,
  subtipoId: string | null,
): string[] {
  const avisos: string[] = []
  for (const p of preguntas) {
    const valor = respuestas[p.id]
    if (!p.aviso || vacia(valor)) continue
    const texto = p.aviso(valor as string | string[], respuestas, subtipoId)
    if (texto && !avisos.includes(texto)) avisos.push(texto)
  }
  return avisos
}

// Plazos orientativos de entrega para "recojo y entrega". Son una estimación
// para el cliente, no un compromiso: ajustar aquí si el negocio los cambia.
const DIAS_ENTREGA_HASTA_15_PRENDAS = 1
const DIAS_ENTREGA_HASTA_30_PRENDAS = 2

/**
 * Fecha estimada de entrega (YYYY-MM-DD) a partir de la fecha de recojo y la
 * cantidad de prendas, o null si la cantidad es grande o no válida (la
 * entrega se confirma al recoger).
 */
export function estimarFechaEntrega(fechaRecojo: string, cantidadPrendas: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRecojo)) return null
  if (!Number.isInteger(cantidadPrendas) || cantidadPrendas < 1 || cantidadPrendas > 30) return null
  const dias = cantidadPrendas <= 15 ? DIAS_ENTREGA_HASTA_15_PRENDAS : DIAS_ENTREGA_HASTA_30_PRENDAS
  const [a, m, d] = fechaRecojo.split('-').map(Number)
  const fecha = new Date(Date.UTC(a, m - 1, d + dias))
  return fecha.toISOString().slice(0, 10)
}
