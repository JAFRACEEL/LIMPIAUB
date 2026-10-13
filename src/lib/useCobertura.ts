import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { coberturaDesdeFilas, type Cobertura } from './disponibilidad'

/**
 * Cuántos profesionales habilitados ofrece cada servicio (y en qué zona). Solo conteos, sin datos
 * personales, legibles sin cuenta. Si no se puede leer devuelve null y la interfaz NO bloquea nada
 * por cobertura (el servidor sigue siendo la barrera).
 */
export function useCobertura(): Cobertura | null {
  const [cobertura, setCobertura] = useState<Cobertura | null>(null)
  useEffect(() => {
    let activo = true
    supabase
      .from('v_cobertura_servicios')
      .select('servicio, zona, profesionales')
      .then(({ data, error }) => {
        if (!activo || error || !data) return
        setCobertura(coberturaDesdeFilas(data as { servicio: string; zona: string; profesionales: number }[]))
      })
    return () => {
      activo = false
    }
  }, [])
  return cobertura
}
