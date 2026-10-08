import { useState } from 'react'
import {
  CATALOGO_SERVICIOS,
  type DetalleServicio,
  type FotosServicio,
  type ServicioCatalogo,
} from '../lib/catalogoServicios'

export interface ResultadoServicio {
  servicio: string
  /** Id de la modalidad elegida (subtipo), si el servicio las tiene. */
  subtipoId: string | null
  subtitulo: string | null
  seccion: 'limpieza' | 'mantenimiento'
  requiereDescripcionTrabajo: boolean
  pideMateriales: boolean
  fotos: FotosServicio | null
}

type Resultado = ResultadoServicio

function ListaDetalle({ detalle }: { detalle: DetalleServicio }) {
  return (
    <>
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
    </>
  )
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
  const [subtipoId, setSubtipoId] = useState<string | null>(null)
  const [verDetallesId, setVerDetallesId] = useState<string | null>(null)
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
    setSubtipoId(null)
    setVerDetallesId(null)
    setAcepta(false)
    if (!s.subtipos && !s.opciones) setDetalle(s.detalle ?? null)
    else setDetalle(null)
  }

  function elegirSubtipo(id: string, nombre: string, detalleSubtipo: DetalleServicio) {
    setSubtipoId(id)
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
      subtipoId,
      subtitulo,
      seccion: servicio.seccion,
      requiereDescripcionTrabajo: Boolean(servicio.requiereDescripcionTrabajo),
      pideMateriales: servicio.pideMateriales !== false,
      fotos: servicio.fotos ?? null,
    }
    setConfirmado(resultado)
    onConfirmar(resultado)
  }

  function cambiar() {
    setConfirmado(null)
    setServicio(null)
    setSubtitulo(null)
    setSubtipoId(null)
    setVerDetallesId(null)
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

  // Paso: elegir subtipo o modalidad (Oficinas, Airbnb, Post obra, Lavado)
  if (servicio?.subtipos && !subtitulo) {
    return (
      <div className="rounded-xl border border-neutral-300 p-3">
        <p className="text-sm font-semibold text-neutral-800">{servicio.nombre}</p>
        {servicio.descripcion && <p className="mt-1 text-sm text-neutral-600">{servicio.descripcion}</p>}
        <p className="mb-2 mt-3 text-sm font-medium text-neutral-700">
          {servicio.preguntaSubtipo ?? `${servicio.nombre} — ¿qué tipo de limpieza necesitas?`}
        </p>
        <div className="flex flex-col gap-2">
          {servicio.subtipos.map((s) => (
            <div key={s.id} className="rounded-lg border border-neutral-300 p-2">
              <button
                type="button"
                onClick={() => elegirSubtipo(s.id, s.nombre, s.detalle)}
                className="w-full text-left text-sm hover:text-teal-700"
              >
                <span className="font-medium">{s.nombre}</span>
                {s.descripcion && <span className="mt-0.5 block text-xs text-neutral-500">{s.descripcion}</span>}
              </button>
              <button
                type="button"
                onClick={() => setVerDetallesId(verDetallesId === s.id ? null : s.id)}
                aria-expanded={verDetallesId === s.id}
                className="mt-1 text-xs font-medium text-teal-700 underline"
              >
                {verDetallesId === s.id ? 'Ocultar detalles' : 'Ver detalles'}
              </button>
              {verDetallesId === s.id && <ListaDetalle detalle={s.detalle} />}
            </div>
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

        <ListaDetalle detalle={detalle} />

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
