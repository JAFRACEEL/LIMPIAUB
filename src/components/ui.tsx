import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Piezas compartidas del sistema YAVI. Los estilos viven en src/index.css. */

type Variante = 'primario' | 'secundario' | 'peligro'

export function Boton({ variante = 'primario', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  const base = 'w-full rounded-2xl px-4 py-3.5 text-base font-semibold disabled:opacity-45'
  const estilos: Record<Variante, string> = {
    primario: 'bg-brand-700',
    secundario: 'yavi-boton-secundario',
    peligro: 'border border-red-300 bg-white text-red-700 shadow-sm',
  }
  return <button {...props} className={`${base} ${estilos[variante]} ${className}`} />
}

export function Aviso({ tipo = 'info', children, className = '' }: { tipo?: 'info' | 'exito' | 'alerta' | 'error'; children: ReactNode; className?: string }) {
  return (
    <p role={tipo === 'error' ? 'alert' : 'status'} data-tipo={tipo} className={`yavi-aviso ${className}`}>
      {children}
    </p>
  )
}

export function EstadoVacio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="yavi-tarjeta flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span className="yavi-burbuja" data-tono="azul" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
        </svg>
      </span>
      <p className="text-base font-semibold text-neutral-900">{titulo}</p>
      {texto && <p className="text-sm text-neutral-600">{texto}</p>}
      {children}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{texto}</span>
      <div className="yavi-esqueleto h-20" />
      <div className="yavi-esqueleto h-20" />
    </div>
  )
}
