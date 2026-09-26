import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { ZONAS, DATOS_PAGO, fechaHoyLima } from '../lib/constantes'
import { calcularTotal } from '../lib/calculos'
import { SelectorServicio } from '../components/SelectorServicio'
import type { TrabajadorPublico } from '../types'

const RECARGO_KIT_TRABAJADORA = 18

type Materiales = '' | 'si' | 'no'
type OpcionSinMateriales = '' | 'trae_kit' | 'compra_kit'

export function Reservar() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [searchParams] = useSearchParams()
  const trabajadorId = searchParams.get('trabajador')

  const [trabajadorDirecto, setTrabajadorDirecto] = useState<TrabajadorPublico | null>(null)
  const [cargandoTrabajador, setCargandoTrabajador] = useState(!!trabajadorId)

  const [servicio, setServicio] = useState('')
  const [subtituloServicio, setSubtituloServicio] = useState<string | null>(null)
  const [seccionServicio, setSeccionServicio] = useState<'limpieza' | 'mantenimiento' | null>(null)
  const [requiereDescripcionTrabajo, setRequiereDescripcionTrabajo] = useState(false)
  const [descripcionTrabajo, setDescripcionTrabajo] = useState('')
  const [fotoReferencia, setFotoReferencia] = useState<File | null>(null)

  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [horas, setHoras] = useState('2')
  const [direccion, setDireccion] = useState(perfil?.direccion ?? '')
  const [zona, setZona] = useState(perfil?.zona ?? '')
  const [notas, setNotas] = useState('')
  const [pagoMetodo, setPagoMetodo] = useState('')
  const [materiales, setMateriales] = useState<Materiales>('')
  const [opcionSinMateriales, setOpcionSinMateriales] = useState<OpcionSinMateriales>('')

  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [disponibleDirecto, setDisponibleDirecto] = useState<boolean | null>(null)
  const [verificandoDisponibilidad, setVerificandoDisponibilidad] = useState(false)

  useEffect(() => {
    if (!trabajadorId) {
      setCargandoTrabajador(false)
      return
    }
    let activo = true
    supabase
      .from('v_trabajadores_publicos')
      .select('*')
      .eq('id', trabajadorId)
      .maybeSingle()
      .then(({ data, error: errorCarga }) => {
        if (!activo) return
        if (errorCarga || !data) {
          setError('No pudimos cargar a esta trabajadora. Intenta reservar sin elegirla directamente.')
        } else {
          setTrabajadorDirecto(data)
        }
        setCargandoTrabajador(false)
      })
    return () => {
      activo = false
    }
  }, [trabajadorId])

  useEffect(() => {
    if (!trabajadorDirecto || !fecha || !hora || !horas) {
      setDisponibleDirecto(null)
      return
    }
    let activo = true
    setVerificandoDisponibilidad(true)
    const numHoras = Number(horas)
    supabase
      .rpc('trabajador_disponible_en', {
        p_trabajador_id: trabajadorDirecto.id,
        p_fecha: fecha,
        p_hora: hora,
        p_horas: Number.isFinite(numHoras) ? numHoras : 2,
      })
      .then(({ data, error: errorRpc }) => {
        if (!activo) return
        setDisponibleDirecto(errorRpc ? null : Boolean(data))
        setVerificandoDisponibilidad(false)
      })
    return () => {
      activo = false
    }
  }, [trabajadorDirecto, fecha, hora, horas])

  const puedeTraerKit = trabajadorDirecto ? trabajadorDirecto.kit_propio : true

  const conMateriales = seccionServicio === 'limpieza' && materiales === 'no' && opcionSinMateriales === 'trae_kit'
  const recargoMateriales = conMateriales ? RECARGO_KIT_TRABAJADORA : 0
  const tarifaEstimada = trabajadorDirecto?.tarifa_hora ?? null
  const totalEstimado =
    tarifaEstimada !== null && horas ? calcularTotal(tarifaEstimada, Number(horas), recargoMateriales) : null

  function validar(): string | null {
    if (!perfil) return 'No pudimos identificar tu cuenta. Vuelve a iniciar sesión e intenta de nuevo.'
    if (trabajadorId && !trabajadorDirecto) {
      return 'No pudimos cargar a la trabajadora elegida. Recarga la página antes de reservar.'
    }
    if (trabajadorDirecto && disponibleDirecto === false) {
      return 'Esta trabajadora no está disponible en el horario elegido. Cambia el horario o envíalo como pedido abierto.'
    }
    if (!servicio) return 'Elige el servicio que necesitas.'
    if (requiereDescripcionTrabajo && !descripcionTrabajo.trim()) {
      return 'Describe el trabajo que necesitas.'
    }
    if (!fecha) return 'Elige la fecha.'
    if (!hora) return 'Elige la hora.'
    const numHoras = Number(horas)
    if (!Number.isFinite(numHoras) || numHoras < 2 || numHoras > 12) return 'Las horas deben estar entre 2 y 12.'
    if (!direccion.trim()) return 'Escribe la dirección donde se hará el servicio.'
    if (!zona) return 'Elige la zona.'
    if (!pagoMetodo) return 'Elige el método de pago.'
    if (seccionServicio === 'limpieza') {
      if (!materiales) return '¿Tu espacio tiene materiales de limpieza? Elige Sí o No.'
      if (materiales === 'no' && !opcionSinMateriales) return 'Elige cómo resolver los materiales de limpieza.'
      if (conMateriales && !puedeTraerKit) {
        return 'Esta trabajadora no ofrece traer su propio kit de limpieza.'
      }
    }
    return null
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const mensaje = validar()
    if (mensaje || !perfil) {
      setError(mensaje ?? 'No pudimos identificar tu cuenta. Vuelve a iniciar sesión e intenta de nuevo.')
      return
    }
    setError(null)
    setEnviando(true)

    const notasFinal = [
      notas.trim(),
      opcionSinMateriales === 'compra_kit' ? 'Cliente quiere comprar un kit de limpieza propio; coordinar entrega por WhatsApp.' : '',
    ]
      .filter(Boolean)
      .join(' · ')

    let fotoReferenciaRuta: string | null = null
    if (fotoReferencia) {
      const extension = fotoReferencia.name.split('.').pop() ?? 'jpg'
      const ruta = `${perfil.id}/foto-referencia-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, fotoReferencia, {
        upsert: true,
      })
      if (errorSubida) {
        setError(
          `No pudimos subir la foto de referencia (${traducirError(errorSubida)}). Quítala o intenta de nuevo.`,
        )
        setEnviando(false)
        return
      }
      fotoReferenciaRuta = ruta
    }

    const payload: Record<string, unknown> = {
      cliente_id: perfil.id,
      servicio,
      subtipo_servicio: subtituloServicio,
      descripcion_trabajo: requiereDescripcionTrabajo ? descripcionTrabajo.trim() : null,
      foto_referencia_ruta: fotoReferenciaRuta,
      fecha,
      hora,
      horas: Number(horas),
      direccion,
      zona,
      notas: notasFinal || null,
      pago_metodo: pagoMetodo,
      con_materiales: conMateriales,
      recargo_materiales: recargoMateriales,
    }

    if (trabajadorDirecto) {
      payload.trabajador_id = trabajadorDirecto.id
      payload.tarifa_hora = trabajadorDirecto.tarifa_hora
      payload.modo = 'directo'
      payload.ventana_cierra_en = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    } else {
      payload.modo = 'abierto'
      payload.ventana_cierra_en = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    }

    const { error: errorInsert } = await supabase.from('reservas').insert(payload)

    if (errorInsert) {
      setError(traducirError(errorInsert))
      setEnviando(false)
      return
    }

    setEnviando(false)
    navigate('/reservas')
  }

  if (cargandoTrabajador) return <div className="p-6 text-center text-neutral-500">Cargando…</div>

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Reservar un servicio</h1>
      {trabajadorDirecto ? (
        <p className="mb-6 text-neutral-500">
          Le estás pidiendo el servicio directamente a <strong>{trabajadorDirecto.nombre}</strong>. Tiene 15
          minutos para aceptar.
        </p>
      ) : (
        <p className="mb-6 text-neutral-500">
          Tu pedido se enviará a las trabajadoras disponibles en tu zona. Elegirás entre las que acepten.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Campo etiqueta="Servicio">
          <SelectorServicio
            serviciosPermitidos={trabajadorDirecto ? trabajadorDirecto.servicios : undefined}
            onConfirmar={(r) => {
              setServicio(r.servicio)
              setSubtituloServicio(r.subtitulo)
              setSeccionServicio(r.seccion)
              setRequiereDescripcionTrabajo(r.requiereDescripcionTrabajo)
              if (r.seccion !== 'limpieza') {
                setMateriales('')
                setOpcionSinMateriales('')
              }
              if (!r.requiereDescripcionTrabajo) {
                // Si el nuevo servicio no pide descripción/foto (p. ej. se
                // cambió de mantenimiento a limpieza), no debe arrastrarse
                // lo que se había adjuntado para el servicio anterior.
                setDescripcionTrabajo('')
                setFotoReferencia(null)
              }
            }}
            onCambiar={() => {
              setServicio('')
              setSubtituloServicio(null)
              setSeccionServicio(null)
              setRequiereDescripcionTrabajo(false)
              setDescripcionTrabajo('')
              setFotoReferencia(null)
            }}
          />
        </Campo>

        {requiereDescripcionTrabajo && (
          <>
            <Campo etiqueta="Describe el trabajo que necesitas">
              <textarea
                required
                value={descripcionTrabajo}
                onChange={(e) => setDescripcionTrabajo(e.target.value)}
                className="input min-h-20"
                placeholder="Cuéntanos qué necesitas que se haga"
              />
            </Campo>
            <Campo etiqueta="Foto de referencia (opcional)">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFotoReferencia(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </Campo>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Fecha">
            <input
              required
              type="date"
              min={fechaHoyLima()}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="input"
            />
          </Campo>
          <Campo etiqueta="Hora">
            <input required type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="input" />
          </Campo>
        </div>

        <Campo etiqueta="Horas (2 - 12)">
          <input
            required
            type="number"
            min={2}
            max={12}
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            className="input"
          />
        </Campo>

        {trabajadorDirecto && verificandoDisponibilidad && (
          <p className="text-xs text-neutral-500">Verificando disponibilidad de la trabajadora…</p>
        )}
        {trabajadorDirecto && disponibleDirecto === false && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">
              Este profesional no se encuentra disponible en el horario seleccionado.
            </p>
            <p className="mt-1">Elige otra fecha u hora, o envía el pedido abierto a otras trabajadoras disponibles.</p>
            <button
              type="button"
              onClick={() => {
                setTrabajadorDirecto(null)
                setDisponibleDirecto(null)
              }}
              className="mt-2 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Enviar como pedido abierto a otras trabajadoras
            </button>
          </div>
        )}

        <Campo etiqueta="Dirección">
          <input
            required
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className="input"
            placeholder="Jirón / calle, número, referencia"
          />
        </Campo>

        <Campo etiqueta="Zona">
          <select value={zona} onChange={(e) => setZona(e.target.value)} className="input" required>
            <option value="">Elige la zona</option>
            {ZONAS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Notas (opcional)">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="input min-h-20"
            placeholder="Algo que debamos saber para este servicio"
          />
        </Campo>

        <Campo etiqueta="Método de pago">
          <select value={pagoMetodo} onChange={(e) => setPagoMetodo(e.target.value)} className="input" required>
            <option value="">Elige una opción</option>
            <option value="yape">Yape</option>
            <option value="plin">Plin</option>
            <option value="transferencia">Transferencia bancaria</option>
          </select>
        </Campo>

        {(pagoMetodo === 'yape' || pagoMetodo === 'plin' || pagoMetodo === 'transferencia') && (
          <div className="rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
            <p className="font-medium">Datos para el abono:</p>
            <p className="mt-1">{DATOS_PAGO[pagoMetodo]}</p>
          </div>
        )}

        {seccionServicio === 'limpieza' && (
          <>
            <Campo etiqueta="¿Tu espacio tiene materiales de limpieza?">
              <select
                value={materiales}
                onChange={(e) => {
                  setMateriales(e.target.value as Materiales)
                  setOpcionSinMateriales('')
                }}
                className="input"
                required
              >
                <option value="">Elige una opción</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </Campo>

            {materiales === 'no' && (
              <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3">
                <label className={`flex items-start gap-2 text-sm ${!puedeTraerKit ? 'opacity-40' : ''}`}>
                  <input
                    type="radio"
                    name="opcionMateriales"
                    disabled={!puedeTraerKit}
                    checked={opcionSinMateriales === 'trae_kit'}
                    onChange={() => setOpcionSinMateriales('trae_kit')}
                    className="mt-0.5 h-4 w-4 accent-teal-700"
                  />
                  <span>
                    La trabajadora trae su kit (+S/ {RECARGO_KIT_TRABAJADORA.toFixed(2)})
                    {!puedeTraerKit && trabajadorDirecto && ' — no disponible con esta trabajadora'}
                    {!puedeTraerKit && !trabajadorDirecto && ' — solo se te mostrarán trabajadoras que ofrecen esto'}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="opcionMateriales"
                    checked={opcionSinMateriales === 'compra_kit'}
                    onChange={() => setOpcionSinMateriales('compra_kit')}
                    className="mt-0.5 h-4 w-4 accent-teal-700"
                  />
                  <span>Quiero comprar un kit que quede en mi casa</span>
                </label>

                {opcionSinMateriales === 'compra_kit' && (
                  <div className="mt-1 rounded-lg bg-neutral-100 p-3 text-sm text-neutral-600">
                    <p className="mb-1 font-medium">Kit básico sugerido:</p>
                    <p>Escoba, recogedor, trapeador, balde, guantes, detergente y desinfectante multiuso.</p>
                    <p className="mt-2">Coordinamos la entrega por WhatsApp. Este kit no se cobra en la app.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {totalEstimado !== null && (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">
            Total estimado: S/ {totalEstimado.toFixed(2)}
          </p>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : 'Confirmar pedido'}
        </button>
      </form>
    </div>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-neutral-700">{etiqueta}</span>
      {children}
    </label>
  )
}
