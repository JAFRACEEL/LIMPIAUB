import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ACCESOS_PRINCIPALES, CATALOGO_SERVICIOS } from '../lib/catalogoServicios'
import { estadoServicio } from '../lib/disponibilidad'
import { useCobertura } from '../lib/useCobertura'
import { ETIQUETA_SERVICIO_CORTA } from '../lib/sinonimos'
import { borradorVacio, borradorUtil, borrarBorrador, guardarBorrador, leerBorrador } from '../lib/borrador'
import { borradorParaServicio } from '../lib/iniciarPedido'
import { Logo } from '../components/Logo'
import { IconoServicio, tonoServicio } from '../components/IconoServicio'
import { Aviso } from '../components/ui'

const EJEMPLOS = [
  'Quiero pintar mi pared con hongo',
  'Quiero cambiar una loseta rota',
  'Quiero arreglar mi tomacorriente',
  'Quiero que limpien mi cocina',
]

/** Inicio del cliente: parte de la necesidad, no de un menú. Se puede explorar sin cuenta. */
export function Inicio() {
  const navigate = useNavigate()
  const { session, perfil } = useAuth()
  const [texto, setTexto] = useState('')
  const [verTodos, setVerTodos] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(() => leerBorrador())
  const cobertura = useCobertura()

  // Un servicio sin forma de contratar disponible o sin profesionales se muestra, pero NO se puede contratar.
  const estado = (id: string) => estadoServicio(id, cobertura)

  const accesos = ACCESOS_PRINCIPALES

  // El resto de servicios habilitados, una sola entrada por rubro (las variantes de limpieza viven dentro de "Limpieza").
  const otros = useMemo(() => {
    const principales = new Set<string>(ACCESOS_PRINCIPALES.map((a) => ETIQUETA_SERVICIO_CORTA[a.servicioId]))
    const vistos = new Set<string>()
    const lista: { servicioId: string; etiqueta: string }[] = []
    for (const s of CATALOGO_SERVICIOS) {
      const etiqueta = ETIQUETA_SERVICIO_CORTA[s.id] ?? s.nombre
      if (principales.has(etiqueta) || vistos.has(etiqueta) || s.habilitado === false) continue
      vistos.add(etiqueta)
      lista.push({ servicioId: s.id, etiqueta })
    }
    return lista
  }, [])

  function contar() {
    const t = texto.trim()
    if (t.length < 3) return
    guardarBorrador({ ...borradorVacio(), texto: t })
    navigate('/pedir')
  }

  function irAServicio(servicioId: string) {
    const e = estado(servicioId)
    if (!e.contratable) {
      setAviso(e.texto ?? 'Este servicio todavía no está disponible.')
      return
    }
    setAviso(null)
    guardarBorrador(borradorParaServicio(servicioId, { texto: texto.trim() }))
    navigate('/pedir')
  }

  const nombre = perfil?.nombre.split(' ')[0]

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-4">
      {pendiente && borradorUtil(pendiente) && (
        <div className="yavi-tarjeta mb-5 border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <button type="button" onClick={() => navigate('/pedir')} className="flex w-full items-center justify-between text-left">
            <span>
              <span className="block font-semibold">Tienes un pedido sin enviar</span>
              <span className="block text-brand-800">Sigue donde lo dejaste</span>
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            onClick={() => {
              borrarBorrador()
              setPendiente(null)
            }}
            className="mt-2 text-xs font-semibold underline"
          >
            Descartar este pedido
          </button>
        </div>
      )}

      {!session && <Logo className="mx-auto -mb-3 -mt-2 w-60" />}
      <p className="text-sm font-medium text-navy-700">{nombre ? `Hola, ${nombre}` : 'Bienvenido a YAVI'}</p>
      <h1 className="mb-3 text-3xl font-extrabold leading-tight text-neutral-900">¿Qué necesitas solucionar hoy?</h1>

      <div className="yavi-tarjeta p-3">
      <label className="flex flex-col gap-1">
        <span className="sr-only">Cuéntanos qué pasa</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Cuéntanos qué pasa en tu casa…"
          className="input min-h-28 text-base"
        />
      </label>

      <p className="mt-2 text-xs text-neutral-500">No escribas aquí DNI, claves ni datos de pago. Guardamos tu texto solo en este navegador mientras armas el pedido.</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {EJEMPLOS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setTexto(e)}
            className="rounded-full border border-navy-100 bg-navy-50 px-3 py-1.5 text-left text-xs font-medium text-navy-800 shadow-xs"
          >
            {e}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={contar}
        disabled={texto.trim().length < 3}
        className="mt-4 w-full rounded-2xl bg-brand-700 px-4 py-4 text-base font-bold text-white disabled:opacity-45"
      >
        Continuar
      </button>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-navy-700">O elige un servicio</h2>
      <div className="grid grid-cols-2 gap-3">
        {accesos.map((a) => {
          const e = estado(a.servicioId)
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => irAServicio(a.servicioId)}
              aria-disabled={!e.contratable}
              className="yavi-categoria"
            >
              <span className="yavi-burbuja" data-tono={tonoServicio(a.servicioId) === 'azul' ? 'azul' : undefined}>
                <IconoServicio servicioId={a.servicioId} />
              </span>
              <span>
                <span className="block text-base font-bold">{a.etiqueta}</span>
                {!e.contratable && <span className="block text-xs font-medium text-amber-800">Aún no disponible</span>}
              </span>
            </button>
          )
        })}
      </div>
      {aviso && (
        <Aviso tipo="alerta" className="mt-3">
          {aviso}
        </Aviso>
      )}

      {otros.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            aria-expanded={verTodos}
            className="yavi-boton-secundario w-full"
          >
            {verTodos ? 'Ocultar servicios' : 'Ver todos los servicios'}
          </button>
          {verTodos && (
            <ul className="mt-2 grid grid-cols-1 gap-2">
              {otros.map((o) => (
                <li key={o.servicioId}>
                  <button
                    type="button"
                    onClick={() => irAServicio(o.servicioId)}
                    aria-disabled={!estado(o.servicioId).contratable}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold shadow-sm ${
                      estado(o.servicioId).contratable ? 'border-neutral-200 bg-white' : 'border-dashed border-neutral-300 bg-neutral-100 text-neutral-500 shadow-none'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                        <IconoServicio servicioId={o.servicioId} className="h-5 w-5" />
                      </span>
                      {o.etiqueta}
                    </span>
                    {!estado(o.servicioId).contratable && <span className="text-xs font-medium text-amber-800">Aún no disponible</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!session && (
        <p className="mt-8 text-center text-sm text-neutral-500">
          Puedes mirar y armar tu pedido sin cuenta. Te la pedimos solo al enviarlo.{' '}
          <Link to="/login" className="font-semibold text-brand-700">
            Ya tengo cuenta
          </Link>
        </p>
      )}
      {session && perfil?.rol === 'cliente' && (
        <p className="mt-8 text-center text-sm">
          <Link to="/buscar" className="font-semibold text-brand-700">
            Ver profesionales
          </Link>
        </p>
      )}
    </div>
  )
}
