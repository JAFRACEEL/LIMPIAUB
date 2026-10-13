import { modalidadesDeServicio } from './catalogoServicios'
import {
  AMBIENTES,
  CLAVES_LIMPIEZA,
  CLAVES_REORGANIZAR,
  ESPACIOS,
  ETIQUETA_SERVICIO_CORTA,
  OBJETOS_PUNTUALES,
  PALABRAS_CASA_COMPLETA,
  REGLAS,
  type EspacioLimpieza,
  type OpcionAclaracion,
  type ReglaInterpretacion,
} from './sinonimos'

/**
 * Entiende lo que escribe el cliente con reglas y sinónimos (sin IA externa).
 *
 * Principios:
 * - Solo PROPONE un servicio y pide confirmación; no diagnostica ni fija precio.
 * - Si hay dos lecturas parecidas, devuelve `ambiguo` para preguntar.
 * - Si no entiende, devuelve `desconocido` y se elige a mano.
 */

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'mi', 'mis', 'en', 'con', 'que', 'y', 'a', 'para'])

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function distancia(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > 2) return 3
  let anterior = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const actual = [i]
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      actual[j] = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + costo)
    }
    anterior = actual
  }
  return anterior[n]
}

function palabraCoincide(token: string, clave: string): boolean {
  if (clave.endsWith('*')) return token.startsWith(clave.slice(0, -1))
  if (token === clave) return true
  // Tolerancia a errores de tecleo solo en palabras largas, para no confundir "luz" con "luna".
  if (clave.length >= 5 && token.length >= 5) {
    const tolerancia = clave.length >= 9 ? 2 : 1
    return distancia(token, clave) <= tolerancia
  }
  return false
}

/** ¿La clave (palabra o frase) aparece en el texto ya normalizado? */
export function contiene(textoNormalizado: string, clave: string): boolean {
  const tokens = textoNormalizado.split(' ').filter(Boolean)
  const palabras = clave.split(' ').filter((p) => p && !PALABRAS_VACIAS.has(p))
  if (palabras.length === 0) return false
  return palabras.every((p) => tokens.some((t) => palabraCoincide(t, p)))
}

function puntaje(textoNormalizado: string, regla: ReglaInterpretacion): number {
  const peso = regla.peso ?? 1
  const aciertos = regla.claves.filter((c) => contiene(textoNormalizado, c)).length
  if (aciertos === 0) return 0
  return peso * (1 + 0.25 * (aciertos - 1))
}

export interface PrefillLimpieza {
  espacio: EspacioLimpieza
  alcance: 'casa' | 'ambientes' | 'puntual'
  ambientes: string[]
  puntual: string
  /** El cliente pidió expresamente reorganizar pertenencias. */
  reorganizar: boolean
}

export interface Alternativa {
  servicioId: string
  etiqueta: string
}

export type Interpretacion =
  | {
      estado: 'claro'
      servicioId: string
      confirmacion: string
      limpieza?: PrefillLimpieza
      modalidadSugerida?: OpcionAclaracion['modalidadSugerida']
      alternativas: Alternativa[]
    }
  | {
      estado: 'aclarar'
      pregunta: string
      opciones: OpcionAclaracion[]
      alternativas: Alternativa[]
    }
  | {
      estado: 'ambiguo'
      pregunta: string
      opciones: { servicioId: string; etiqueta: string; confirmacion: string }[]
      alternativas: Alternativa[]
    }
  | { estado: 'desconocido'; alternativas: Alternativa[] }

/** Servicios que se ofrecen en "Cambiar", sin repetir las variantes internas de limpieza. */
export function alternativasBase(): Alternativa[] {
  const vistos = new Set<string>()
  const lista: Alternativa[] = []
  for (const [servicioId, etiqueta] of Object.entries(ETIQUETA_SERVICIO_CORTA)) {
    if (vistos.has(etiqueta)) continue
    vistos.add(etiqueta)
    lista.push({ servicioId, etiqueta })
  }
  return lista
}

export function esLimpieza(servicioId: string): boolean {
  return ETIQUETA_SERVICIO_CORTA[servicioId] === 'Limpieza'
}

function espacioDe(texto: string): EspacioLimpieza {
  for (const { espacio, claves } of ESPACIOS) {
    if (claves.some((c) => contiene(texto, c))) return espacio
  }
  return 'hogar'
}

export const SERVICIO_POR_ESPACIO: Record<EspacioLimpieza, string> = {
  hogar: 'limpieza_basica',
  oficina: 'oficinas_comercios',
  alojamiento: 'alojamientos_airbnb',
  evento: 'postevento',
  obra: 'postobra',
}

function prefillLimpieza(texto: string, original: string): PrefillLimpieza {
  const espacio = espacioDe(texto)
  const ambientes = AMBIENTES.filter((a) => a.claves.some((c) => contiene(texto, c))).map((a) => a.etiqueta)
  const hayObjeto = OBJETOS_PUNTUALES.some((o) => contiene(texto, o))
  const casaCompleta = PALABRAS_CASA_COMPLETA.some((p) => contiene(texto, p))
  const reorganizar = CLAVES_REORGANIZAR.some((c) => contiene(texto, c))
  let alcance: PrefillLimpieza['alcance'] = 'casa'
  if (hayObjeto && !casaCompleta) alcance = 'puntual'
  else if (ambientes.length > 0 && !casaCompleta) alcance = 'ambientes'
  return { espacio, alcance, ambientes, puntual: alcance === 'puntual' ? original.trim() : '', reorganizar }
}

function confirmacionLimpieza(p: PrefillLimpieza): string {
  if (p.espacio === 'obra') return '¿Necesitas limpieza después de una obra o remodelación?'
  if (p.espacio === 'evento') return '¿Necesitas limpieza después de una fiesta o evento?'
  if (p.espacio === 'alojamiento') return '¿Necesitas limpieza de un alojamiento o Airbnb?'
  if (p.espacio === 'oficina') return '¿Necesitas limpieza de una oficina o local?'
  if (p.alcance === 'puntual') return '¿Quieres que limpien algo puntual?'
  if (p.alcance === 'ambientes' && p.ambientes.length > 0) {
    const lista = p.ambientes.map((a) => a.toLowerCase()).join(' y ')
    return `¿Quieres que limpien ${lista === 'cocina' ? 'tu cocina' : `estos ambientes: ${lista}`}?`
  }
  return '¿Quieres que limpien tu casa?'
}

/** Servicio interno de limpieza según lo expreso del texto (reorganizar solo si lo pidió). */
export function servicioLimpiezaPrefill(p: PrefillLimpieza): string {
  if (p.espacio === 'hogar' && p.reorganizar) return 'limpieza_profunda_reorganizacion'
  return SERVICIO_POR_ESPACIO[p.espacio]
}

/**
 * Oficios (electricidad, gasfitería, etc.) que el texto menciona y que NO se pueden contratar por horas.
 * "Reparaciones generales" usa esto para no ser un atajo: si la descripción es de un oficio, se pide ese servicio.
 */
export function oficiosFueraDeGenerales(texto: string): string[] {
  const normal = normalizar(texto)
  const ids = new Set<string>()
  for (const regla of REGLAS) {
    if (regla.servicioId === 'mantenimiento_general') continue
    if (modalidadesDeServicio(regla.servicioId).includes('horas')) continue
    if (puntaje(normal, regla) > 0) ids.add(regla.servicioId)
  }
  return [...ids]
}

export function interpretar(texto: string): Interpretacion {
  const normal = normalizar(texto)
  const alternativas = alternativasBase()
  if (normal.length < 3) return { estado: 'desconocido', alternativas }

  const candidatos = REGLAS.map((regla) => ({ regla, puntos: puntaje(normal, regla) }))
    .filter((c) => c.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)

  const puntosLimpieza = CLAVES_LIMPIEZA.filter((c) => contiene(normal, c)).length > 0 ? 3 : 0
  const mejor = candidatos[0]

  // Limpieza: verbo de limpiar (o espacio de obra/evento) sin una especialidad técnica más fuerte.
  const espacioTexto = espacioDe(normal)
  const pidioLimpieza = puntosLimpieza > 0 || (espacioTexto === 'evento' && contiene(normal, 'despues')) || espacioTexto === 'obra'
  const hayTecnico = mejor && mejor.puntos > puntosLimpieza
  if (pidioLimpieza && !hayTecnico) {
    const lavado = candidatos.find((c) => c.regla.id === 'lavado')
    if (!lavado) {
      const pre = prefillLimpieza(normal, texto)
      return {
        estado: 'claro',
        servicioId: servicioLimpiezaPrefill(pre),
        confirmacion: confirmacionLimpieza(pre),
        limpieza: pre,
        alternativas,
      }
    }
  }

  if (!mejor) {
    return { estado: 'desconocido', alternativas }
  }

  // Reglas que por naturaleza piden aclarar (p. ej. hongo en la pared).
  if (mejor.regla.aclarar) {
    return {
      estado: 'aclarar',
      pregunta: mejor.regla.aclarar.pregunta,
      opciones: mejor.regla.aclarar.opciones,
      alternativas,
    }
  }

  // Dos servicios distintos con puntaje parecido: preguntar en vez de adivinar.
  const otro = candidatos.find((c) => c.regla.servicioId !== mejor.regla.servicioId)
  if (otro && otro.puntos >= mejor.puntos * 0.7) {
    return {
      estado: 'ambiguo',
      pregunta: '¿Cuál se parece más a lo que necesitas?',
      opciones: [mejor, otro].map((c) => ({
        servicioId: c.regla.servicioId,
        etiqueta: ETIQUETA_SERVICIO_CORTA[c.regla.servicioId] ?? c.regla.servicioId,
        confirmacion: c.regla.confirmacion,
      })),
      alternativas,
    }
  }

  return {
    estado: 'claro',
    servicioId: mejor.regla.servicioId,
    confirmacion: mejor.regla.confirmacion,
    modalidadSugerida: mejor.regla.modalidadSugerida,
    alternativas,
  }
}
