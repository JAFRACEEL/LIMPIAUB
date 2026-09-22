export type Rol = 'cliente' | 'trabajador' | 'admin'

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
  dni: string
  servicios: string[]
  tarifa_hora: number
  experiencia: string | null
  descripcion: string | null
  disponible_ahora: boolean
  verificado: boolean
  antecedentes: string | null
  referencias: string | null
  rating_avg: number
  rating_n: number
  trabajos_completados: number
  ultima_actividad: string
}

export interface TrabajadorPublico {
  id: string
  nombre: string
  zona: string
  foto_url: string | null
  servicios: string[]
  tarifa_hora: number
  disponible_ahora: boolean
  rating_avg: number
  rating_n: number
  trabajos_completados: number
  descripcion: string | null
}
