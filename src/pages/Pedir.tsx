import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import {
  borradorVacio,
  borrarBorrador,
  guardarBorrador,
  leerBorrador,
  type PedidoBorrador,
} from '../lib/borrador'
import { lomasPronto } from '../lib/horario'
import { validarDirecto, validarLugarYHorario, validarNecesidad } from '../lib/pasosPedido'
import { coberturaEnZona, estadoServicio } from '../lib/disponibilidad'
import { useCobertura } from '../lib/useCobertura'
import { construirSolicitud, esRecojo, resolverServicio } from '../lib/solicitud'
import { formatoSoles } from '../lib/precios'
import type { TrabajadorPublico } from '../types'
import { PasoNecesidad } from '../components/pedido/PasoNecesidad'
import { PasoLugarHorario } from '../components/pedido/PasoLugarHorario'
import { PasoResumen, precioDirecto } from '../components/pedido/PasoResumen'

type Cambio = Partial<PedidoBorrador> | ((b: PedidoBorrador) => PedidoBorrador)

/** Reserva en pasos cortos: necesidad → dirección y horario → resumen y envío. */
export function Pedir() {
  const navigate = useNavigate()
  const { session, perfil } = useAuth()
  const [params] = useSearchParams()
  const trabajadorParam = params.get('trabajador')

  const [b, setB] = useState<PedidoBorrador>(() => {
    const guardado = leerBorrador() ?? borradorVacio()
    return trabajadorParam ? { ...guardado, trabajadorDirectoId: trabajadorParam } : guardado
  })
  const [fotos, setFotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [directo, setDirecto] = useState<TrabajadorPublico | null>(null)
  const [disponibleDirecto, setDisponibleDirecto] = useState<boolean | null>(null)
  const [verificando, setVerificando] = useState(false)
  const arriba = useRef<HTMLDivElement>(null)
  // Candado contra doble toque: el estado de React tarda un ciclo en deshabilitar el botón.
  const enviandoRef = useRef(false)
  const cobertura = useCobertura()

  const servicioResuelto = resolverServicio(b)?.servicio ?? null
  // El servicio elegido hoy no se puede contratar (forma de cobro no disponible o sin profesionales).
  const bloqueado = !!servicioResuelto && !estadoServicio(servicioResuelto.id, cobertura).contratable
  // Sin profesionales en la zona elegida (solo aplica a pedidos abiertos).
  const profesionalesEnZona = servicioResuelto && !b.trabajadorDirectoId ? coberturaEnZona(servicioResuelto.nombre, b.zona, cobertura) : null

  const actualizar = useCallback((c: Cambio) => {
    setError(null)
    setB((prev) => (typeof c === 'function' ? c(prev) : { ...prev, ...c }))
  }, [])

  // El borrador sobrevive a iniciar sesión o registrarse (se borra al enviar).
  useEffect(() => {
    guardarBorrador(b)
  }, [b])

  // Dirección y zona precargadas desde la cuenta, siempre editables.
  useEffect(() => {
    if (!perfil) return
    setB((prev) => {
      if (prev.direccion && prev.zona) return prev
      const direccion = prev.direccion || perfil.direccion || ''
      const zona = prev.zona || perfil.zona || ''
      // La dirección no se guarda en el borrador: si volvemos de iniciar sesión y la cuenta no tiene una, se pide de nuevo.
      return { ...prev, direccion, zona, paso: !direccion && prev.paso === 3 ? 2 : prev.paso }
    })
  }, [perfil])

  // Pedido directo: carga a ese profesional (requiere sesión para ver el listado).
  useEffect(() => {
    if (!b.trabajadorDirectoId || !session) {
      setDirecto(null)
      return
    }
    let activo = true
    supabase
      .from('v_trabajadores_publicos')
      .select('*')
      .eq('id', b.trabajadorDirectoId)
      .maybeSingle()
      .then(({ data }) => {
        if (activo) setDirecto((data as TrabajadorPublico | null) ?? null)
      })
    return () => {
      activo = false
    }
  }, [b.trabajadorDirectoId, session])

  // Disponibilidad real del profesional elegido en ese horario.
  useEffect(() => {
    const cuando = b.programacion === 'ahora' ? lomasPronto(new Date()) : { fecha: b.fecha, hora: b.hora }
    if (!directo || !cuando.fecha || !cuando.hora) {
      setDisponibleDirecto(null)
      return
    }
    let activo = true
    setVerificando(true)
    supabase
      .rpc('trabajador_disponible_en', {
        p_trabajador_id: directo.id,
        p_fecha: cuando.fecha,
        p_hora: cuando.hora,
        p_horas: b.modalidad === 'horas' ? b.horas : 2,
      })
      .then(({ data, error: e }) => {
        if (!activo) return
        setDisponibleDirecto(e ? null : Boolean(data))
        setVerificando(false)
      })
    return () => {
      activo = false
    }
  }, [directo, b.programacion, b.fecha, b.hora, b.horas, b.modalidad])

  function irAPaso(paso: 1 | 2 | 3) {
    actualizar({ paso })
    arriba.current?.scrollIntoView({ block: 'start' })
  }

  function atras() {
    if (b.paso > 1) irAPaso((b.paso - 1) as 1 | 2)
    else if (b.servicioId) actualizar({ servicioId: null, confirmado: false, limpieza: null, subtipoId: null, respuestas: {} })
    else navigate('/')
  }

  function problemaDeZona(): string | null {
    if (profesionalesEnZona === 0 && servicioResuelto) {
      return `Todavía no hay profesionales de ${servicioResuelto.nombre} en ${b.zona}. Prueba con otra zona.`
    }
    return null
  }

  function continuar() {
    const problema =
      b.paso === 1
        ? // Sin sesión no se puede cargar al profesional elegido: eso se revisa al volver de iniciar sesión.
          ((session ? validarDirecto(b, directo) : null) ?? validarNecesidad(b, fotos.length))
        : (validarLugarYHorario(b, new Date()) ?? problemaDeZona())
    if (problema) {
      setError(problema)
      return
    }
    setError(null)
    irAPaso((b.paso + 1) as 2 | 3)
  }

  async function enviar() {
    if (enviandoRef.current) return
    if (!session || !perfil) {
      // Se pide cuenta recién ahora; el borrador queda guardado.
      guardarBorrador(b)
      navigate('/login?volver=/pedir')
      return
    }
    if (perfil.rol !== 'cliente') {
      setError('Esta cuenta es de profesional. Entra con una cuenta de cliente para pedir un servicio.')
      return
    }
    const problema = validarDirecto(b, directo) ?? validarNecesidad(b, fotos.length) ?? validarLugarYHorario(b, new Date()) ?? problemaDeZona()
    if (problema) {
      setError(problema)
      return
    }
    if (bloqueado) {
      setError('Este servicio todavía no se puede contratar.')
      return
    }
    if (b.trabajadorDirectoId) {
      if (disponibleDirecto === false) {
        setError('Ese profesional no está libre en el horario elegido. Cambia el horario o envía tu pedido a otros profesionales.')
        return
      }
    }

    enviandoRef.current = true
    setEnviando(true)
    setError(null)

    const rutasFotos: string[] = []
    for (const [i, archivo] of fotos.entries()) {
      const extension = archivo.name.split('.').pop() ?? 'jpg'
      const ruta = `${perfil.id}/servicio-${Date.now()}-${i}.${extension}`
      const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, archivo, { upsert: true })
      if (errorSubida) {
        setError(`No pudimos subir la foto ${i + 1} (${traducirError(errorSubida)}). Quítala o intenta de nuevo.`)
        setEnviando(false)
        enviandoRef.current = false
        return
      }
      rutasFotos.push(ruta)
    }

    const fila = construirSolicitud(b, { clienteId: perfil.id, ahora: new Date(), rutasFotos })
    const { data, error: errorInsert } = await supabase.from('reservas').insert(fila).select('id').single()
    if (errorInsert) {
      setError(traducirError(errorInsert))
      setEnviando(false)
        enviandoRef.current = false
      return
    }

    borrarBorrador()
    setEnviando(false)
        enviandoRef.current = false
    navigate(`/reservas?nuevo=${data.id}`)
  }

  const etiquetaPrincipal = (() => {
    if (b.paso < 3) return 'Continuar'
    if (!session) return 'Entrar para enviar mi pedido'
    if (enviando) return 'Enviando…'
    if (directo && b.modalidad === 'horas') return `Pedir a ${directo.nombre.split(' ')[0]} por ${formatoSoles(precioDirecto(b, directo).total)}`
    return 'Buscar profesionales'
  })()

  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-4">
      <div ref={arriba} />
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={atras} className="-ml-2 rounded-lg px-2 py-2 text-sm font-semibold text-teal-800">
          ← Atrás
        </button>
        {b.servicioId && (
          <span className="text-xs font-medium text-neutral-500" aria-live="polite">
            Paso {b.paso} de 3
          </span>
        )}
      </div>
      {b.servicioId && (
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
          <div className="h-full bg-teal-700 transition-all" style={{ width: `${(b.paso / 3) * 100}%` }} />
        </div>
      )}

      {directo && (
        <p className="mb-4 rounded-xl bg-teal-50 px-4 py-2 text-sm text-teal-900">
          Pedido directo para <strong>{directo.nombre}</strong>. Tiene 15 minutos para responder.
        </p>
      )}

      {directo && b.servicioId && validarDirecto(b, directo) && (
        <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">{validarDirecto(b, directo)}</p>
          <button type="button" onClick={() => actualizar({ trabajadorDirectoId: null })} className="mt-2 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white">
            Enviar a otros profesionales
          </button>
        </div>
      )}

      {(!b.servicioId || b.paso === 1) && (
        <PasoNecesidad
          b={b}
          actualizar={actualizar}
          fotos={fotos}
          onFotos={setFotos}
          puedeTraerKit={directo ? directo.kit_propio : true}
          cobertura={cobertura}
          serviciosDirecto={b.trabajadorDirectoId && directo ? directo.servicios : null}
          onInicio={() => navigate('/')}
        />
      )}
      {b.servicioId && b.paso === 2 && (
        <PasoLugarHorario
          b={b}
          actualizar={actualizar}
          directo={directo}
          disponibleDirecto={disponibleDirecto}
          verificando={verificando}
          recojo={esRecojo(b)}
          sinProfesionalesEnZona={profesionalesEnZona === 0 ? servicioResuelto?.nombre ?? null : null}
          onPasarAAbierto={() => actualizar({ trabajadorDirectoId: null })}
        />
      )}
      {b.servicioId && b.paso === 3 && (
        <PasoResumen b={b} directo={directo} haySesion={!!session} esCliente={perfil?.rol === 'cliente'} error={error} />
      )}

      {error && b.paso !== 3 && b.servicioId && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {b.servicioId && !(bloqueado && b.paso === 1) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur">
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              onClick={b.paso < 3 ? continuar : enviar}
              disabled={enviando}
              className="w-full rounded-xl bg-teal-700 px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
            >
              {etiquetaPrincipal}
            </button>
            {b.paso === 3 && session && perfil?.rol === 'cliente' && (
              <p className="mt-2 text-center text-xs text-neutral-500">Te avisaremos cuando alguien responda. Aún no se cobra nada.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
