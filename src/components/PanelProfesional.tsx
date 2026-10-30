import { useEffect, useState, type ReactNode } from 'react'
import { especialidad, iniciales } from '../lib/panelProfesional'

/** Piezas del panel del profesional (perfil, interruptores, estadísticas, barra inferior). Estilos en src/index.css. */

const ICONOS = {
  monedas: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  documento: 'M7 3h7l4 4v14H7V3ZM14 3v4h4M9.5 12h6M9.5 16h6',
  estrella: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  tendencia: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  calendario: 'M4 6h16v14H4V6ZM4 10h16M8 3v4M16 3v4',
  kit: 'M4 10h16l-1.5 10h-13L4 10ZM9 10l3-6M15 10l-1-6',
  campana: 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0',
  casa: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z',
  lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  persona: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 21c0-3.3 3.6-6 8-6s8 2.7 8 6',
}

export type NombreIcono = keyof typeof ICONOS

export function Icono({ nombre, className = 'h-5 w-5' }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONOS[nombre]} />
    </svg>
  )
}

/** Foto circular del usuario; si no hay o no carga, sus iniciales sobre el azul YAVI. */
export function Avatar({ nombre, fotoUrl, className = 'h-12 w-12 text-base' }: { nombre: string; fotoUrl: string | null; className?: string }) {
  const [fallo, setFallo] = useState(false)
  // Si cambia la foto (p. ej. tras editar el perfil) se vuelve a intentar cargarla.
  useEffect(() => setFallo(false), [fotoUrl])

  if (fotoUrl && !fallo) {
    return (
      <img
        src={fotoUrl}
        alt={`Foto de ${nombre || 'tu perfil'}`}
        onError={() => setFallo(true)}
        className={`shrink-0 rounded-full object-cover shadow-md ring-2 ring-white ${className}`}
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={`Sin foto: iniciales de ${nombre || 'tu perfil'}`}
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold tracking-wide text-white shadow-md ring-2 ring-white ${className}`}
      style={{ backgroundImage: 'linear-gradient(145deg, #2f5fc0 0%, #0d2f72 100%)' }}
    >
      {iniciales(nombre)}
    </span>
  )
}

export function TarjetaPerfil({
  nombre,
  fotoUrl,
  servicios,
  onEditar,
  editando,
}: {
  nombre: string
  fotoUrl: string | null
  servicios: string[]
  onEditar: () => void
  editando: boolean
}) {
  return (
    <section aria-labelledby="panel-nombre" className="yavi-tarjeta flex items-center gap-4 p-4">
      <Avatar nombre={nombre} fotoUrl={fotoUrl} className="h-28 w-28 text-4xl" />
      <div className="min-w-0 flex-1">
        <h2 id="panel-nombre" className="break-words text-xl font-extrabold leading-tight text-neutral-900">
          {nombre || 'Tu perfil'}
        </h2>
        <p className="mt-0.5 break-words text-sm text-neutral-600">{servicios.length > 0 ? especialidad(servicios) : 'Profesional YAVI'}</p>
        <button
          type="button"
          onClick={onEditar}
          aria-expanded={editando}
          aria-controls="editar-perfil"
          className="mt-3 rounded-xl border-2 border-brand-600 bg-white px-4 py-2 text-sm font-bold text-brand-700"
        >
          Editar perfil
        </button>
      </div>
    </section>
  )
}

/** Interruptor accesible: la perilla queda siempre dentro de la pista (4 px de margen a cada lado). */
export function Interruptor({
  activo,
  onCambiar,
  deshabilitado,
  etiquetaId,
}: {
  activo: boolean
  onCambiar: () => void
  deshabilitado?: boolean
  etiquetaId: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-labelledby={etiquetaId}
      onClick={onCambiar}
      disabled={deshabilitado}
      className={`relative h-8 w-14 shrink-0 overflow-hidden rounded-full shadow-inner transition-colors disabled:opacity-60 ${
        activo ? 'bg-green-700' : 'bg-neutral-400'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          activo ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function BurbujaIcono({
  children,
  tono = 'naranja',
  pequena = false,
}: {
  children: ReactNode
  tono?: 'naranja' | 'verde'
  pequena?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full ${pequena ? 'h-7 w-7' : 'h-10 w-10'} ${
        tono === 'verde' ? 'bg-green-100' : 'bg-brand-100 text-brand-700'
      }`}
    >
      {children}
    </span>
  )
}

export function TarjetaInterruptor({
  id,
  icono,
  titulo,
  texto,
  info,
  ...interruptor
}: {
  id: string
  icono: ReactNode
  titulo: string
  texto: ReactNode
  /** Explicación breve que se muestra al tocar el botón (i) junto al título. */
  info?: ReactNode
  activo: boolean
  onCambiar: () => void
  deshabilitado?: boolean
}) {
  const [verInfo, setVerInfo] = useState(false)
  return (
    <div className="yavi-tarjeta p-3.5">
      <div className="flex items-center gap-3">
        {icono}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p id={id} className="text-base font-bold leading-tight text-neutral-900">
              {titulo}
            </p>
            {info && (
              <button
                type="button"
                onClick={() => setVerInfo((v) => !v)}
                aria-expanded={verInfo}
                aria-controls={`${id}-info`}
                aria-label={`Más información sobre ${titulo}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-500 text-xs font-bold text-neutral-600"
              >
                i
              </button>
            )}
          </div>
          <p className="mt-0.5 text-sm leading-snug text-neutral-600">{texto}</p>
        </div>
        <Interruptor {...interruptor} etiquetaId={id} />
      </div>
      {info && verInfo && (
        <p id={`${id}-info`} className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm leading-snug text-neutral-700">
          {info}
        </p>
      )}
    </div>
  )
}

export function Estadistica({ icono, titulo, valor }: { icono: NombreIcono; titulo: string; valor: ReactNode }) {
  return (
    <div className="yavi-tarjeta flex min-w-0 flex-col gap-1.5 px-2 py-3">
      <dt className="flex items-center gap-1 text-[11px] font-medium text-neutral-700">
        <BurbujaIcono pequena>
          <Icono nombre={icono} className="h-3.5 w-3.5" />
        </BurbujaIcono>
        <span className="min-w-0 leading-tight [overflow-wrap:normal]">{titulo}</span>
      </dt>
      <dd className="break-words pl-1 text-lg font-extrabold leading-tight text-neutral-900">{valor}</dd>
    </div>
  )
}

export function Ganancia({ icono, titulo, monto }: { icono: NombreIcono; titulo: string; monto: string }) {
  return (
    <div className="yavi-tarjeta flex items-center gap-3 px-3 py-3.5">
      <BurbujaIcono>
        <Icono nombre={icono} className="h-5 w-5" />
      </BurbujaIcono>
      <div className="min-w-0">
        <dt className="text-sm leading-tight text-neutral-700">
          {titulo}
          <span className="block text-xs text-neutral-600">Neto</span>
        </dt>
        <dd className="mt-0.5 break-words text-xl font-extrabold leading-tight text-brand-700">{monto}</dd>
      </div>
    </div>
  )
}

export type PestanaProfesional = 'panel' | 'servicios' | 'perfil'

const PESTANAS: { id: PestanaProfesional; texto: string; icono: NombreIcono }[] = [
  { id: 'panel', texto: 'Panel', icono: 'casa' },
  { id: 'servicios', texto: 'Servicios', icono: 'lista' },
  { id: 'perfil', texto: 'Perfil', icono: 'persona' },
]

/** Barra inferior del profesional: las tres zonas de su panel (no hay rutas aparte, se navega dentro de la página). */
export function BarraProfesional({ activa, onElegir }: { activa: PestanaProfesional; onElegir: (p: PestanaProfesional) => void }) {
  return (
    <nav
      aria-label="Secciones del panel"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200/70 bg-white/95 shadow-[0_-8px_20px_-12px_rgb(120_53_15/0.3)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {PESTANAS.map((p) => {
          const esActiva = activa === p.id
          return (
            <li key={p.id} className="flex-1">
              <button
                type="button"
                onClick={() => onElegir(p.id)}
                aria-current={esActiva ? 'page' : undefined}
                className={`relative flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-sm font-semibold ${
                  esActiva ? 'text-brand-700' : 'text-neutral-600'
                }`}
              >
                <Icono nombre={p.icono} className="h-6 w-6" />
                {p.texto}
                {esActiva && <span aria-hidden="true" className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-brand-600" />}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
