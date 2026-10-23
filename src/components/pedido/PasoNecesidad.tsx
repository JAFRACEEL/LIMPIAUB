import { useMemo, useState } from 'react'
import { modalidadesDeServicio, servicioPorId } from '../../lib/catalogoServicios'
import { avisosActivos } from '../../lib/preguntasServicio'
import { interpretar, type Alternativa, type Interpretacion } from '../../lib/interpretar'
import { servicioContratable, HORAS_MAX, HORAS_MIN, PERSONAS_MAX } from '../../lib/modalidades'
import { ETIQUETA_SERVICIO_CORTA } from '../../lib/sinonimos'
import { borradorParaServicio, cambiarServicio, datosLimpiezaIniciales, usaFlujoLimpieza } from '../../lib/iniciarPedido'
import { fotosRequeridas, problemaDeOficio } from '../../lib/pasosPedido'
import { oficiosFueraDeGenerales } from '../../lib/interpretar'
import { estadoServicio, type Cobertura } from '../../lib/disponibilidad'
import {
  detalleDelPedido,
  modalidadesDelPedido,
  pideKit,
  preguntasDelPedido,
  resolverServicio,
} from '../../lib/solicitud'
import type { PedidoBorrador } from '../../lib/borrador'
import { PreguntaCampo } from '../PreguntaCampo'
import { Contador } from '../Contador'
import { AlcanceServicio } from '../AlcanceServicio'
import { BloqueLimpieza } from './BloqueLimpieza'
import { SelectorModalidad } from './SelectorModalidad'
import { KitMateriales } from './KitMateriales'

type Cambio = Partial<PedidoBorrador> | ((b: PedidoBorrador) => PedidoBorrador)

function etiquetaCorta(servicioId: string) {
  return ETIQUETA_SERVICIO_CORTA[servicioId] ?? servicioPorId(servicioId)?.nombre ?? servicioId
}

/** Servicios que hoy se pueden contratar, uno por rubro, para el "Cambiar". */
function opcionesDeCambio(alternativas: Alternativa[]): Alternativa[] {
  return alternativas.filter((a) => {
    const s = servicioPorId(a.servicioId)
    return !!s && servicioContratable(s.habilitado, modalidadesDeServicio(a.servicioId))
  })
}

export function PasoNecesidad({
  b,
  actualizar,
  fotos,
  onFotos,
  puedeTraerKit,
  cobertura,
  serviciosDirecto,
  onInicio,
}: {
  b: PedidoBorrador
  actualizar: (c: Cambio) => void
  fotos: File[]
  onFotos: (f: File[]) => void
  puedeTraerKit: boolean
  cobertura: Cobertura | null
  /** En un pedido directo, solo los servicios que ofrece ese profesional. */
  serviciosDirecto: string[] | null
  onInicio: () => void
}) {
  const [cambiando, setCambiando] = useState(false)
  const [editandoTexto, setEditandoTexto] = useState(b.texto.trim().length < 3)
  const [borradorTexto, setBorradorTexto] = useState(b.texto)
  // Abierto/cerrado lo decide la persona, no el largo del texto: si dependiera de él, el cuadro se cerraba
  // (y el teclado con él) al escribir la tercera letra.
  const [detallesAbierto, setDetallesAbierto] = useState(b.texto.trim().length < 3)
  const [elegida, setElegida] = useState<{ servicioId: string; confirmacion: string; aviso?: string; modalidadSugerida?: 'diagnostico' | 'cotizacion' | 'fijo' | 'horas' } | null>(null)

  const interpretacion: Interpretacion | null = useMemo(
    () => (!b.servicioId && b.texto.trim().length >= 3 ? interpretar(b.texto) : null),
    [b.servicioId, b.texto],
  )
  const alternativas = useMemo(
    () =>
      opcionesDeCambio(interpretacion?.alternativas ?? interpretar('xyz').alternativas).filter((a) => {
        const nombre = servicioPorId(a.servicioId)?.nombre
        return !serviciosDirecto || (!!nombre && serviciosDirecto.includes(nombre))
      }),
    [interpretacion, serviciosDirecto],
  )

  function elegirServicio(servicioId: string, extra: Parameters<typeof borradorParaServicio>[1] = {}) {
    actualizar((actual) => ({
      ...borradorParaServicio(servicioId, {
        texto: actual.texto,
        sugeridoId: actual.sugeridoId ?? servicioId,
        trabajadorDirectoId: actual.trabajadorDirectoId,
        ...extra,
      }),
      direccion: actual.direccion,
      zona: actual.zona,
      programacion: actual.programacion,
      fecha: actual.fecha,
      hora: actual.hora,
      notas: actual.notas,
    }))
    setCambiando(false)
    setElegida(null)
  }

  // ------------------------------------------------------------------
  // A. Todavía no hay servicio confirmado: entender y confirmar
  // ------------------------------------------------------------------
  if (!b.servicioId || cambiando) {
    const textoCorto = b.texto.trim().length < 3

    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">{cambiando ? 'Elige el servicio' : '¿Qué necesitas solucionar?'}</h1>

        {(editandoTexto || textoCorto) && !cambiando ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">Cuéntanos qué pasa en tu casa</span>
              <textarea
                value={borradorTexto}
                onChange={(e) => setBorradorTexto(e.target.value)}
                rows={3}
                maxLength={500}
                className="input min-h-24"
                placeholder="Ej. Quiero arreglar mi tomacorriente"
              />
            </label>
            <button
              type="button"
              disabled={borradorTexto.trim().length < 3}
              onClick={() => {
                actualizar({ texto: borradorTexto.trim(), servicioId: null, confirmado: false })
                setEditandoTexto(false)
                setElegida(null)
              }}
              className="rounded-xl bg-brand-700 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        ) : (
          !cambiando && (
            <blockquote className="rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
              “{b.texto.trim()}”
              <button type="button" onClick={() => { setBorradorTexto(b.texto); setEditandoTexto(true) }} className="ml-2 text-xs font-semibold text-brand-700 underline">
                Editar
              </button>
            </blockquote>
          )
        )}

        {/* Confirmación de lo entendido */}
        {!cambiando && !editandoTexto && interpretacion && !elegida && (
          <div className="flex flex-col gap-3">
            {interpretacion.estado === 'claro' && (
              <Confirmar
                pregunta={interpretacion.confirmacion}
                onSi={() =>
                  elegirServicio(interpretacion.servicioId, {
                    limpieza: interpretacion.limpieza,
                    modalidadSugerida: interpretacion.modalidadSugerida,
                  })
                }
                onCambiar={() => setCambiando(true)}
              />
            )}
            {interpretacion.estado === 'aclarar' && (
              <Opciones
                pregunta={interpretacion.pregunta}
                opciones={interpretacion.opciones.map((o) => ({
                  etiqueta: o.etiqueta,
                  onClick: () => setElegida({ servicioId: o.servicioId, confirmacion: o.confirmacion, aviso: o.aviso, modalidadSugerida: o.modalidadSugerida }),
                }))}
                onCambiar={() => setCambiando(true)}
              />
            )}
            {interpretacion.estado === 'ambiguo' && (
              <Opciones
                pregunta={interpretacion.pregunta}
                opciones={interpretacion.opciones.map((o) => ({
                  etiqueta: o.etiqueta,
                  onClick: () => setElegida({ servicioId: o.servicioId, confirmacion: o.confirmacion }),
                }))}
                onCambiar={() => setCambiando(true)}
              />
            )}
            {interpretacion.estado === 'desconocido' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">No estamos seguros de haberte entendido.</p>
                <p className="mt-1">Elige el servicio que más se parece y guardamos lo que escribiste.</p>
                <button type="button" onClick={() => setCambiando(true)} className="mt-3 w-full rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white">
                  Elegir servicio
                </button>
              </div>
            )}
          </div>
        )}

        {!cambiando && elegida && (
          <div className="flex flex-col gap-3">
            <Confirmar
              pregunta={elegida.confirmacion}
              aviso={elegida.aviso}
              onSi={() => elegirServicio(elegida.servicioId, { modalidadSugerida: elegida.modalidadSugerida })}
              onCambiar={() => setElegida(null)}
              textoCambiar="Volver"
            />
          </div>
        )}

        {cambiando && (
          <ul className="flex flex-col gap-2">
            {alternativas.map((a) => (
              <li key={a.servicioId}>
                <button
                  type="button"
                  onClick={() => (b.servicioId ? actualizar((actual) => cambiarServicio(actual, a.servicioId)) : elegirServicio(a.servicioId))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3.5 text-left text-base"
                >
                  {a.etiqueta}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => setCambiando(false)} className="mt-1 w-full text-center text-sm font-medium text-neutral-500 underline">
                Volver
              </button>
            </li>
          </ul>
        )}
      </div>
    )
  }

  // ------------------------------------------------------------------
  // B. Servicio confirmado: solo las preguntas necesarias
  // ------------------------------------------------------------------
  const r = resolverServicio(b)
  if (!r) return null
  // Un servicio que hoy no se puede contratar (forma de cobro no disponible o sin profesionales) se explica y se detiene aquí.
  const estado = estadoServicio(r.servicio.id, cobertura)
  if (!estado.contratable) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">{etiquetaCorta(r.servicio.id)}</h1>
        {b.texto.trim() && <p className="text-sm text-neutral-500">“{b.texto.trim()}”</p>}
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="text-base font-semibold">Todavía no se puede contratar</p>
          <p className="mt-2">{estado.texto}</p>
          <p className="mt-2 text-amber-900">No te pedimos horas como reemplazo ni cobramos nada. Lo que escribiste queda guardado un rato por si vuelves.</p>
        </div>
        <button type="button" onClick={() => setCambiando(true)} className="rounded-xl bg-brand-700 px-4 py-3.5 text-base font-semibold text-white">
          Elegir otro servicio
        </button>
        <button type="button" onClick={onInicio} className="text-center text-sm font-semibold text-brand-800 underline">
          Volver al inicio
        </button>
      </div>
    )
  }

  const esLimpiezaFlujo = usaFlujoLimpieza(b.servicioId) && !!b.limpieza
  const preguntas = preguntasDelPedido(b)
  const avisos = avisosActivos(preguntas, b.respuestas, r.subtipo?.id ?? null)
  const disponibles = modalidadesDelPedido(b)
  const fotosCfg = fotosRequeridas(b)
  const detalle = detalleDelPedido(b)
  const simple = r.servicio.preguntaSubtipoSimple
  const requiereTexto = !!r.servicio.requiereDescripcionTrabajo

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{esLimpiezaFlujo ? 'Limpieza' : etiquetaCorta(r.servicio.id)}</h1>
          {r.servicio.descripcion && <p className="mt-1 text-sm text-neutral-600">{r.servicio.descripcion}</p>}
          {b.texto.trim() && <p className="mt-1 text-sm text-neutral-500">“{b.texto.trim()}”</p>}
        </div>
        <button type="button" onClick={() => setCambiando(true)} className="shrink-0 text-sm font-semibold text-brand-700 underline">
          Cambiar
        </button>
      </div>

      {problemaDeOficio(b) && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">{problemaDeOficio(b)}</p>
          <button
            type="button"
            onClick={() => actualizar((actual) => cambiarServicio(actual, oficiosFueraDeGenerales(actual.texto)[0]))}
            className="mt-2 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white"
          >
            Pedirlo como {etiquetaCorta(oficiosFueraDeGenerales(b.texto)[0])}
          </button>
        </div>
      )}

      {esLimpiezaFlujo && b.limpieza && (
        <BloqueLimpieza
          datos={b.limpieza}
          modalidad={b.modalidad}
          onChange={(d) => actualizar({ limpieza: d })}
          onCambiarEspacio={(espacio) => {
            if (espacio === 'obra') {
              actualizar((actual) => ({
                ...borradorParaServicio('postobra', { texto: actual.texto, sugeridoId: actual.sugeridoId, trabajadorDirectoId: actual.trabajadorDirectoId }),
                direccion: actual.direccion,
                zona: actual.zona,
                programacion: actual.programacion,
                fecha: actual.fecha,
                hora: actual.hora,
                notas: actual.notas,
              }))
            } else {
              actualizar((actual) => ({
                ...actual,
                limpieza: { ...(actual.limpieza ?? datosLimpiezaIniciales()), espacio: espacio },
                servicioId: actual.servicioId === 'postobra' ? 'limpieza_basica' : actual.servicioId,
              }))
            }
          }}
        />
      )}

      {b.servicioId === 'postobra' && (
        <button
          type="button"
          onClick={() => actualizar((actual) => ({ ...borradorParaServicio('limpieza_basica', { texto: actual.texto, sugeridoId: actual.sugeridoId, trabajadorDirectoId: actual.trabajadorDirectoId }), direccion: actual.direccion, zona: actual.zona, programacion: actual.programacion, fecha: actual.fecha, hora: actual.hora, notas: actual.notas }))}
          className="self-start text-sm font-semibold text-brand-700 underline"
        >
          ← No es después de una obra
        </button>
      )}

      {simple && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-neutral-700">{simple.pregunta}</legend>
          {simple.opciones.map((o) => (
            <label
              key={o.etiqueta}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                b.subtipoId === o.subtipoId && b.respuestas.__simple === o.etiqueta ? 'border-brand-700 bg-brand-50' : 'border-neutral-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="subtipo_simple"
                checked={b.subtipoId === o.subtipoId && b.respuestas.__simple === o.etiqueta}
                onChange={() => actualizar({ subtipoId: o.subtipoId, respuestas: { ...b.respuestas, __simple: o.etiqueta } })}
                className="mt-0.5 h-4 w-4 accent-brand-700"
              />
              <span>
                {o.etiqueta}
                {o.aviso && b.respuestas.__simple === o.etiqueta && <span className="mt-1 block text-xs text-amber-800">{o.aviso}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {(!simple || b.subtipoId) && preguntas.length > 0 && (
        <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4">
          {preguntas.map((p) => (
            <PreguntaCampo
              key={p.id}
              pregunta={p}
              valor={b.respuestas[p.id]}
              onChange={(v) => actualizar({ respuestas: { ...b.respuestas, [p.id]: v } })}
            />
          ))}
          {avisos.map((a) => (
            <p key={a} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {a}
            </p>
          ))}
        </div>
      )}

      {/* Lo que escribió ya se ve arriba: solo se pide de nuevo si falta o si quiere editarlo. */}
      <details
        open={detallesAbierto}
        onToggle={(e) => setDetallesAbierto(e.currentTarget.open)}
        className="rounded-xl border border-neutral-200 bg-white px-4 py-3"
      >
        <summary className="cursor-pointer text-sm font-medium text-brand-800">
          {b.texto.trim().length < 3
            ? requiereTexto
              ? 'Cuéntanos qué pasa'
              : 'Algo más que debamos saber (opcional)'
            : 'Editar o agregar detalles'}
        </summary>
        <textarea
          value={b.texto}
          onChange={(e) => actualizar({ texto: e.target.value })}
          maxLength={1000}
          className="input mt-2 min-h-20 w-full"
          placeholder={requiereTexto ? 'Ej. El enchufe de la sala hace chispas' : 'Ej. Tengo un perro en casa'}
          aria-label={requiereTexto ? 'Cuéntanos qué pasa' : 'Detalles del pedido'}
        />
      </details>

      <SelectorModalidad
        disponibles={disponibles}
        valor={b.modalidad}
        limpieza={esLimpiezaFlujo}
        onChange={(m) => actualizar({ modalidad: m })}
      />

      {b.modalidad === 'horas' && (
        <div className="grid grid-cols-2 gap-4">
          <Contador etiqueta="Horas" valor={b.horas} min={HORAS_MIN} max={HORAS_MAX} onChange={(v) => actualizar({ horas: v })} unidad="h" ayuda={`Pagas el tiempo de trabajo. Mínimo ${HORAS_MIN} horas.`} />
          <Contador etiqueta="Personas" valor={b.personas} min={1} max={PERSONAS_MAX} onChange={(v) => actualizar({ personas: v })} ayuda="Cuántas personas necesitas trabajando." />
        </div>
      )}
      {b.modalidad === 'fijo' && (
        <Contador etiqueta="Cantidad" valor={b.cantidad} min={1} max={20} onChange={(v) => actualizar({ cantidad: v })} ayuda="Cuántas unidades necesitas (equipos, puntos, etc.)." />
      )}

      {pideKit(b) && (
        <KitMateriales b={b} onChange={(c) => actualizar(c)} puedeTraerKit={puedeTraerKit} />
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-neutral-700">
          {fotosCfg.etiqueta}
          {fotosCfg.obligatorias ? ' *' : ''} — máx. {fotosCfg.maximo}
        </span>
        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-neutral-400 bg-white px-4 py-3 text-sm font-semibold text-brand-800">
          {fotos.length === 0 ? 'Agregar fotos' : fotos.length === 1 ? '1 foto elegida · cambiar' : `${fotos.length} fotos elegidas · cambiar`}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => onFotos(Array.from(e.target.files ?? []).slice(0, fotosCfg.maximo))}
          />
        </label>
      </div>

      {detalle && <AlcanceServicio incluye={detalle.incluye} noIncluye={detalle.noIncluye} condiciones={detalle.notas} />}
    </div>
  )
}

function Confirmar({
  pregunta,
  aviso,
  onSi,
  onCambiar,
  textoCambiar = 'Cambiar',
}: {
  pregunta: string
  aviso?: string
  onSi: () => void
  onCambiar: () => void
  textoCambiar?: string
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <p className="text-lg font-semibold text-brand-950">{pregunta}</p>
      {aviso && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-brand-900">{aviso}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onSi} className="rounded-xl bg-brand-700 px-3 py-3.5 text-base font-semibold text-white">
          Sí, continuar
        </button>
        <button type="button" onClick={onCambiar} className="rounded-xl border border-neutral-300 bg-white px-3 py-3.5 text-base font-semibold text-neutral-700">
          {textoCambiar}
        </button>
      </div>
    </div>
  )
}

function Opciones({
  pregunta,
  opciones,
  onCambiar,
}: {
  pregunta: string
  opciones: { etiqueta: string; onClick: () => void }[]
  onCambiar: () => void
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <p className="text-lg font-semibold text-brand-950">{pregunta}</p>
      <div className="mt-3 flex flex-col gap-2">
        {opciones.map((o) => (
          <button key={o.etiqueta} type="button" onClick={o.onClick} className="rounded-xl border border-brand-300 bg-white px-4 py-3.5 text-left text-base font-medium text-brand-950">
            {o.etiqueta}
          </button>
        ))}
        <button type="button" onClick={onCambiar} className="mt-1 text-center text-sm font-medium text-neutral-600 underline">
          Es otra cosa
        </button>
      </div>
    </div>
  )
}

