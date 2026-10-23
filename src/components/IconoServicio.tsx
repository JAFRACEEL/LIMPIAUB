// Íconos de línea con el mismo trazo para todas las categorías (y para las que se sumen después).
const TRAZOS: Record<string, string> = {
  limpieza: 'M20 3l-8 8M10 10l4 4-3 6H5l1-4 4-6Z',
  aire: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5',
  gasfiteria: 'M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3Z',
  electricidad: 'M13 2 5 13h6l-1 9 8-12h-6l1-8Z',
  pintura: 'M5 4h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM18 6.5h2v4h-8v3M10 13.5h4V21h-4z',
  albanileria: 'M3 5h18v5H3zM3 14h18v5H3zM8 5v5M14 5v5M11 14v5M17 14v5',
  carpinteria: 'M15 3l6 6-3 3-6-6 3-3ZM12 9 4 17a2 2 0 0 0 3 3l8-8',
  cerrajeria: 'M8 19a4 4 0 1 1 3.4-6.1L20 4M16 8l3 3M13.5 10.5l2.5 2.5',
  vidrieria: 'M4 3h16v18H4zM12 3v18M4 12h16',
  mantenimiento: 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6 2.6-2.5Z',
  lavado: 'M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0Z',
  ordenar: 'M3 8l9-5 9 5v8l-9 5-9-5V8ZM12 13v8M3 8l9 5 9-5',
  general: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z',
}

const TIPO: Record<string, string> = {
  limpieza_basica: 'limpieza',
  limpieza_profunda_reorganizacion: 'limpieza',
  oficinas_comercios: 'limpieza',
  alojamientos_airbnb: 'limpieza',
  postevento: 'limpieza',
  postobra: 'limpieza',
  organizacion_espacios: 'ordenar',
  lavado_planchado: 'lavado',
  aire_acondicionado: 'aire',
  gasfiteria: 'gasfiteria',
  electricidad: 'electricidad',
  pintura: 'pintura',
  albanileria: 'albanileria',
  carpinteria: 'carpinteria',
  cerrajeria: 'cerrajeria',
  vidrieria_aluminio: 'vidrieria',
  mantenimiento_general: 'mantenimiento',
}

const AZULES = new Set(['aire', 'gasfiteria', 'vidrieria', 'ordenar'])

export function tonoServicio(servicioId: string): 'naranja' | 'azul' {
  return AZULES.has(TIPO[servicioId] ?? 'general') ? 'azul' : 'naranja'
}

export function IconoServicio({ servicioId, className = 'h-6 w-6' }: { servicioId: string; className?: string }) {
  const d = TRAZOS[TIPO[servicioId] ?? 'general']
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
