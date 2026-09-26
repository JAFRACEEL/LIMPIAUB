import { useState } from 'react'
import { CATALOGO_SERVICIOS, type DetalleServicio, type ServicioCatalogo } from '../lib/catalogoServicios'

interface Resultado {
  servicio: string
  subtitulo: string | null
  seccion: 'limpieza' | 'mantenimiento'
  requiereDescripcionTrabajo: boolean
}

export function SelectorServicio({
  serviciosPermitidos,
  onConfirmar,
  onCambiar,
}: {
  serviciosPermitidos?: string[]
  onConfirmar: (resultado: Resultado) => void
  onCambiar: () => void
}) {
  const [confirmado, setConfirmado] = useState<Resultado | null>(null)
  const [servicio, setServicio] = useState<ServicioCatalogo | null>(null)
  const [subtitulo, setSubtitulo] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<DetalleServicio | null>(null)
  const [acepta, setAcepta] = useState(false)

  const catalogo = serviciosPermitidos
    ? CATALOGO_SERVICIOS.filter((s) => serviciosPermitidos.includes(s.nombre))
    : CATALOGO_SERVICIOS
  const limpieza = catalogo.filter((s) => s.seccion === 'limpieza')
  const mantenimiento = catalogo.filter((s) => s.seccion === 'mantenimiento')

  function elegirServicio(s: ServicioCatalogo) {
    setServicio(s)
    setSubtitulo(null)
    setAcepta(false)
    if (!s.subtipos && !s.opciones) setDetalle(s.detalle ?? null)
    else setDetalle(null)
  }

  function elegirSubtipo(nombre: string, detalleSubtipo: DetalleServicio) {
    setSubtitulo(nombre)
    setDetalle(detalleSubtipo)
  }

  function elegirOpcion(nombre: string) {
    setSubtitulo(nombre)
    setDetalle(servicio?.detalle ?? null)
  }

  function confirmar() {
    if (!servicio) return
    const resultado: Resultado = {
      servicio: servicio.nombre,
      subtitulo,
      seccion: servicio.seccion,
      requiereDescripcionTrabajo: Boolean(servicio.requiereDescripcionTrabajo),
    }
    setConfirmado(resultado)
    onConfirmar(resultado)
  }

  function cambiar() {
    setConfirmado(null)
    setServicio(null)
    setSubtitulo(null)
    setDetalle(null)
    setAcepta(false)
    // El padre debe olvidar el servicio ya confirmado: si no, alguien podría
    // abrir el selector de nuevo, arrepentirse de elegir otro, y enviar el
    // formulario con el servicio viejo aunque en pantalla ya no se ve elegido.
    onCambiar()
  }

  if (confirmado) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-teal-800">{confirmado.servicio}</p>
          {confirmado.subtitulo && <p className="text-xs text-teal-700">{confirmado.subtitulo}</p>}
        </div>
        <button type="button" onClick={cambiar} className="shrink-0 text-xs font-semibold text-teal-700 underline">
          Cambiar servicio
        </button>
      </div>
    )
  }

  // Paso: elegir subtipo (Oficinas, Airbnb)
  if (servicio?.subtipos && !subtitulo) {
    return (
      <div className="rounded-xl border border-neutral-300 p-3">
        <p className="mb-2 text-sm font-medium text-neutral-700">
          {servicio.nombre} — ¿qué tipo de limpieza necesitas?
        </p>
        <div className="flex flex-col gap-2">
          {servicio.subtipos.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => elegirSubtipo(s.nombre, s.detalle)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm hover:border-teal-600"
            >
              {s.nombre}
            </button>
          ))}
        </div>
        <button type="button" onClick={cambiar} className="mt-2 text-xs text-neutral-500 underline">
          Elegir otro servicio
        </button>
      </div>
    )
  }

  // Paso: elegir opción (Lavado y planchado)
  if (servicio?.opciones && !subtitulo) {
    return (
      <div className="rounded-xl border border-neutral-300 p-3">
        <p className="mb-2 text-sm font-medium text-neutral-700">{servicio.nombre} — elige una opción</p>
        <div className="flex flex-col gap-2">
          {servicio.opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => elegirOpcion(o.nombre)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm hover:border-teal-600"
            >
              {o.nombre}
            </button>
          ))}
        </div>
        <button type="button" onClick={cambiar} className="mt-2 text-xs text-neutral-500 underline">
          Elegir otro servicio
        </button>
      </div>
    )
  }

  // Paso: modal de alcance del servicio
  if (servicio && detalle) {
    return (
      <div className="rounded-xl border border-neutral-300 bg-white p-4">
        <p className="mb-1 font-semibold">{servicio.nombre}</p>
        {subtitulo && <p className="mb-2 text-sm text-neutral-500">{subtitulo}</p>}

        {detalle.incluye.length > 0 && (
          <>
            <p className="mt-2 text-sm font-medium text-neutral-700">¿Qué incluye?</p>
            <ul className="mt-1 list-inside list-disc text-sm text-neutral-600">
              {detalle.incluye.map((linea, i) => (
                <li key={i}>{linea}</li>
              ))}
            </ul>
          </>
        )}

        {detalle.noIncluye.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium text-neutral-700">¿Qué no incluye?</p>
            <ul className="mt-1 list-inside list-disc text-sm text-neutral-600">
              {detalle.noIncluye.map((linea, i) => (
                <li key={i}>{linea}</li>
              ))}
            </ul>
          </>
        )}

        {detalle.notas && detalle.notas.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium text-neutral-700">Notas importantes</p>
            <ul className="mt-1 list-inside list-disc text-sm text-neutral-600">
              {detalle.notas.map((linea, i) => (
                <li key={i}>{linea}</li>
              ))}
            </ul>
          </>
        )}

        <label className="mt-4 flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-teal-700"
          />
          He leído y entiendo el alcance del servicio.
        </label>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!acepta}
            onClick={confirmar}
            className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Continuar con la reserva
          </button>
          <button type="button" onClick={cambiar} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700">
            Elegir otro
          </button>
        </div>
      </div>
    )
  }

  // Paso inicial: lista de las dos secciones
  return (
    <div className="flex flex-col gap-4">
      {limpieza.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-700">Servicios de limpieza</p>
          <div className="flex flex-col gap-2">
            {limpieza.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => elegirServicio(s)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm hover:border-teal-600"
              >
                {s.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {mantenimiento.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-700">Servicios de mantenimiento para el hogar</p>
          <div className="flex flex-col gap-2">
            {mantenimiento.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => elegirServicio(s)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm hover:border-teal-600"
              >
                {s.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {catalogo.length === 0 && (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
          Esta trabajadora no tiene servicios registrados.
        </p>
      )}
    </div>
  )
}
