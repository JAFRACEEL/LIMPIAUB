import { NavLink } from 'react-router-dom'

const ICONOS = {
  inicio: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z',
  servicios: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 4v2h8V8H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z',
  cuenta: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z',
}

const ITEMS = [
  { a: '/', t: 'Inicio', i: ICONOS.inicio, fin: true },
  { a: '/reservas', t: 'Mis servicios', i: ICONOS.servicios, fin: false },
  { a: '/cuenta', t: 'Cuenta', i: ICONOS.cuenta, fin: false },
]

/** Navegación principal del cliente en el celular: tres destinos, siempre a mano. */
export function BarraInferior() {
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200/70 bg-white/95 shadow-[0_-8px_20px_-12px_rgb(120_53_15/0.3)] backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => (
          <li key={item.a} className="flex-1">
            <NavLink
              to={item.a}
              end={item.fin}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  isActive ? 'text-brand-700' : 'text-neutral-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-8 w-14 items-center justify-center rounded-full ${isActive ? 'bg-brand-100 shadow-sm' : ''}`}>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                      <path d={item.i} />
                    </svg>
                  </span>
                  {item.t}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
