import type { ModalidadPrecio } from './modalidades'
import type { Respuestas } from './catalogoServicios'
import { servicioPorId } from './catalogoServicios'
import type { DatosLimpieza } from './flujoLimpieza'

/**
 * Borrador del pedido del cliente.
 *
 * DÓNDE: vive en memoria y se respalda en sessionStorage (clave `limpi.pedido.v1`), no en
 * localStorage: sobrevive a ir a iniciar sesión o registrarse en la misma pestaña, pero desaparece
 * al cerrar la pestaña. Nunca sale del navegador (no se envía al servidor hasta que el cliente
 * confirma el pedido).
 *
 * QUÉ CONSERVA: el texto con que el cliente describió su problema, el servicio y las opciones
 * elegidas (horas, personas, ambientes, tareas, forma de contratar), día y hora, zona y el
 * profesional elegido, si lo hay.
 *
 * QUÉ NO CONSERVA: dirección y notas (pueden identificar la casa; la dirección se vuelve a
 * precargar desde la cuenta), respuestas privadas (nombre, celular y dirección de entrega del
 * recojo de ropa) ni fotos. El texto libre SÍ se conserva porque es lo que el cliente pidió no
 * perder; por eso la pantalla le pide no escribir datos personales (DNI, claves, teléfonos).
 *
 * CUÁNDO SE ELIMINA: al enviar el pedido, al descartarlo desde el inicio, al cerrar sesión, a las
 * 2 horas (se borra al leerlo vencido) o al cerrar la pestaña.
 */
export interface PedidoBorrador {
  v: 1
  paso: 1 | 2 | 3
  texto: string
  servicioId: string | null
  /** Servicio que sugirió la interpretación antes de que el cliente lo corrigiera. */
  sugeridoId: string | null
  confirmado: boolean
  subtipoId: string | null
  limpieza: DatosLimpieza | null
  respuestas: Respuestas
  modalidad: ModalidadPrecio
  horas: number
  personas: number
  cantidad: number
  materiales: '' | 'si' | 'no'
  opcionSinMateriales: '' | 'trae_kit' | 'compra_kit'
  programacion: 'ahora' | 'programada'
  fecha: string
  hora: string
  direccion: string
  zona: string
  notas: string
  trabajadorDirectoId: string | null
  guardadoEn: number
}

export const CLAVE_BORRADOR = 'limpi.pedido.v1'
export const VIGENCIA_BORRADOR_MS = 2 * 3600_000

export function borradorVacio(): PedidoBorrador {
  return {
    v: 1,
    paso: 1,
    texto: '',
    servicioId: null,
    sugeridoId: null,
    confirmado: false,
    subtipoId: null,
    limpieza: null,
    respuestas: {},
    modalidad: 'horas',
    horas: 2,
    personas: 1,
    cantidad: 1,
    materiales: '',
    opcionSinMateriales: '',
    programacion: 'ahora',
    fecha: '',
    hora: '',
    direccion: '',
    zona: '',
    notas: '',
    trabajadorDirectoId: null,
    guardadoEn: 0,
  }
}

/** Quita lo que no debe persistir: respuestas privadas, dirección y notas. */
export function sanitizarParaGuardar(b: PedidoBorrador): PedidoBorrador {
  const servicio = b.servicioId ? servicioPorId(b.servicioId) : undefined
  const privadas = new Set((servicio?.preguntas ?? []).filter((p) => p.privada).map((p) => p.id))
  const respuestas: Respuestas = {}
  for (const [id, valor] of Object.entries(b.respuestas)) if (!privadas.has(id)) respuestas[id] = valor
  return { ...b, respuestas, direccion: '', notas: '' }
}

export function guardarBorrador(b: PedidoBorrador, almacen: Pick<Storage, 'setItem'> = sessionStorage, ahora = Date.now()) {
  try {
    almacen.setItem(CLAVE_BORRADOR, JSON.stringify({ ...sanitizarParaGuardar(b), guardadoEn: ahora }))
  } catch {
    // Modo privado o sin espacio: el pedido sigue en memoria, solo no sobrevive al cambio de pantalla.
  }
}

export function leerBorrador(
  almacen: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage,
  ahora = Date.now(),
): PedidoBorrador | null {
  try {
    const crudo = almacen.getItem(CLAVE_BORRADOR)
    if (!crudo) return null
    const b = JSON.parse(crudo) as PedidoBorrador
    if (b.v !== 1 || ahora - b.guardadoEn > VIGENCIA_BORRADOR_MS) {
      almacen.removeItem(CLAVE_BORRADOR)
      return null
    }
    // Un servicio que ya no existe o no es el mismo del catálogo invalida el borrador.
    if (b.servicioId && !servicioPorId(b.servicioId)) return null
    return { ...borradorVacio(), ...b }
  } catch {
    return null
  }
}

export function borrarBorrador(almacen: Pick<Storage, 'removeItem'> = sessionStorage) {
  try {
    almacen.removeItem(CLAVE_BORRADOR)
  } catch {
    // nada que borrar
  }
}

/** ¿El borrador tiene algo que valga la pena retomar? */
export function borradorUtil(b: PedidoBorrador | null): boolean {
  return !!b && (b.texto.trim().length > 0 || b.servicioId !== null)
}

export function nombreServicioDeBorrador(b: PedidoBorrador): string | null {
  return b.servicioId ? (servicioPorId(b.servicioId)?.nombre ?? null) : null
}
