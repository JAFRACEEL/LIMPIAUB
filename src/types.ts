import type { DetallesServicio } from './lib/preguntasServicio'
import type { ModalidadPrecio } from './lib/modalidades'
export type Rol = 'cliente' | 'trabajador' | 'admin'
export type Genero = 'femenino' | 'masculino' | 'otro' | 'prefiero_no_decir'
export type Nacionalidad = 'peruana' | 'extranjera'
export type TipoDocumento = 'dni' | 'carne_extranjeria' | 'cpp' | 'ctm' | 'carne_mre' | 'pasaporte'
export type EstadoMigratorio = 'no_aplica' | 'pendiente_validacion' | 'validado' | 'rechazado'

export interface Perfil {
  id: string
  rol: Rol
  nombre: string
  telefono: string
  zona: string
  direccion: string | null
  foto_url: string | null
  creado_en: string
}

export interface Trabajador {
  id: string
  genero: Genero
  nacionalidad: Nacionalidad
  tipo_documento: TipoDocumento
  numero_documento: string
  zonas: string[]
  servicios: string[]
  tarifa_hora: number
  kit_propio: boolean
  experiencia: string | null
  cv_ruta: string | null
  descripcion: string | null
  disponible_ahora: boolean
  verificado: boolean
  verificacion_rechazada: boolean
  motivo_rechazo: string | null
  antecedentes: string | null
  antecedentes_doc_ruta: string | null
  cuenta_autorizacion_migratoria: boolean | null
  estado_migratorio: EstadoMigratorio
  doc_migratorio_numero: string | null
  doc_migratorio_vencimiento: string | null
  doc_migratorio_frontal_ruta: string | null
  doc_migratorio_posterior_ruta: string | null
  doc_migratorio_constancia_ruta: string | null
  habilitado_trabajar: boolean
  referencia1_nombre: string | null
  referencia1_celular: string | null
  referencia2_nombre: string | null
  referencia2_celular: string | null
  rating_avg: number
  rating_n: number
  trabajos_completados: number
  ultima_actividad: string
}

export interface TrabajadorPublico {
  id: string
  nombre: string
  zonas: string[]
  foto_url: string | null
  servicios: string[]
  tarifa_hora: number
  kit_propio: boolean
  disponible_ahora: boolean
  rating_avg: number
  rating_n: number
  trabajos_completados: number
  descripcion: string | null
}

export type EstadoReserva =
  | 'solicitada'
  | 'aceptada'
  | 'en_camino'
  | 'en_curso'
  | 'completada'
  | 'cancelada'
  | 'rechazada'
export type ModoReserva = 'abierto' | 'directo'
export type MetodoPago = 'yape' | 'plin' | 'transferencia' | 'efectivo'

export interface Reserva {
  id: string
  cliente_id: string
  trabajador_id: string | null
  servicio: string
  subtipo_servicio: string | null
  descripcion_trabajo: string | null
  foto_referencia_ruta: string | null
  detalles_servicio: DetallesServicio | null
  fecha: string
  hora: string
  horas: number
  direccion: string
  zona: string
  notas: string | null
  tarifa_hora: number | null
  total: number | null
  comision_pct: number
  estado: EstadoReserva
  pago_metodo: MetodoPago | null
  pago_confirmado: boolean
  en_camino_en: string | null
  hora_llegada: string | null
  inicio_real: string | null
  fin_estimado: string | null
  fin_real: string | null
  ubicacion_lat: number | null
  ubicacion_lng: number | null
  ubicacion_actualizada_en: string | null
  creado_en: string
  modo: ModoReserva
  elegir_por_mi: boolean
  ventana_cierra_en: string | null
  zona_ampliada: boolean
  con_materiales: boolean
  recargo_materiales: number
  modalidad_precio: ModalidadPrecio
  personas: number
  cantidad: number
  programacion: 'ahora' | 'programada'
  necesidad: { texto_original?: string; servicio_id?: string } | null
  /** Todo lo que paga el cliente; `total` es mano de obra + kit (base de la comisión). */
  total_cliente: number | null
}

export type TipoPropuesta = 'servicio' | 'presupuesto_reparacion' | 'adicional'
export type EstadoPropuesta = 'ofrecida' | 'aceptada' | 'rechazada' | 'reemplazada' | 'vencida'

export interface Propuesta {
  id: string
  reserva_id: string
  trabajador_id: string
  tipo: TipoPropuesta
  modalidad: ModalidadPrecio
  version: number
  estado: EstadoPropuesta
  tarifa_hora: number | null
  horas: number | null
  personas: number | null
  cantidad: number | null
  mano_obra: number
  materiales: number
  movilidad: number
  otros: number
  descuento_visita: number
  total_propuesta: number
  alcance: string | null
  incluye: string[]
  no_incluye: string[]
  condiciones: string[]
  vigente_hasta: string | null
  creado_en: string
  respondido_en: string | null
}

export type EstadoPago = 'pendiente_verificacion' | 'confirmado' | 'rechazado'

export interface Pago {
  id: string
  reserva_id: string
  metodo: MetodoPago
  monto: number
  estado: EstadoPago
  referencia: string | null
  evidencia_ruta: string | null
  motivo_rechazo: string | null
  creado_en: string
  verificado_en: string | null
}

export interface Candidatura {
  id: string
  reserva_id: string
  trabajador_id: string
  creado_en: string
  estado: 'pendiente' | 'elegida' | 'liberada'
}

export interface CandidaturaConTrabajador extends Candidatura {
  trabajadores: TrabajadorPublico
}

export interface PedidoAbierto {
  id: string
  servicio: string
  subtipo_servicio: string | null
  descripcion_trabajo: string | null
  foto_referencia_ruta: string | null
  detalles_servicio: DetallesServicio | null
  zona: string
  fecha: string
  hora: string
  horas: number
  con_materiales: boolean
  recargo_materiales: number
  comision_pct: number
  ventana_cierra_en: string | null
  zona_ampliada: boolean
  creado_en: string
  personas?: number
  modalidad_precio?: ModalidadPrecio
  programacion?: 'ahora' | 'programada'
}

export interface TrabajadorContacto {
  id: string
  nombre: string
  telefono: string
  foto_url: string | null
  rating_avg: number
  rating_n: number
  tarifa_hora: number
  trabajos_completados: number
}

export type EstadoPrestamoKit = 'emitido' | 'retirado' | 'pagado' | 'perdida'

export interface PrestamoKit {
  id: string
  trabajador_id: string
  monto: number
  saldo: number
  codigo_retiro: string
  bodega: string
  estado: EstadoPrestamoKit
  creado_en: string
}

export interface PrestamoKitMovimiento {
  id: string
  prestamo_id: string
  reserva_id: string
  monto: number
  creado_en: string
}

export interface Calificacion {
  id: string
  reserva_id: string
  de_id: string
  para_id: string
  estrellas: number
  comentario: string | null
  creado_en: string
}
