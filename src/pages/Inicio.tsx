import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ACCESOS_PRINCIPALES, CATALOGO_SERVICIOS } from '../lib/catalogoServicios'
import { estadoServicio } from '../lib/disponibilidad'
import { useCobertura } from '../lib/useCobertura'
import { ETIQUETA_SERVICIO_CORTA } from '../lib/sinonimos'
import { borradorVacio, borradorUtil, borrarBorrador, guardarBorrador, leerBorrador } from '../lib/borrador'
import { borradorParaServicio } from '../lib/iniciarPedido'

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
    <div className="mx-auto max-w-lg px-4 pb-8 pt-6">
      {pendiente && borradorUtil(pendiente) && (
        <div className="mb-5 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          <button type="button" onClick={() => navigate('/pedir')} className="flex w-full items-center justify-between text-left">
            <span>
              <span className="block font-semibold">Tienes un pedido sin enviar</span>
              <span className="block text-teal-800">Sigue donde lo dejaste</span>
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

      <p className="text-sm text-neutral-500">{nombre ? `Hola, ${nombre}` : 'Bienvenido a Limpi'}</p>
      <h1 className="mb-3 text-2xl font-bold">¿Qué necesitas solucionar hoy?</h1>

      <label className="flex flex-col gap-1">
        <span className="sr-only">Cuéntanos qué pasa</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Cuéntanos qué pasa en tu casa…"
          className="input min-h-24 text-base"
        />
      </label>

      <p className="mt-1 text-xs text-neutral-500">No escribas aquí DNI, claves ni datos de pago. Guardamos tu texto solo en este navegador mientras armas el pedido.</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {EJEMPLOS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setTexto(e)}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-left text-xs text-neutral-600"
          >
            {e}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={contar}
        disabled={texto.trim().length < 3}
        className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40"
      >
        Continuar
      </button>

      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">O elige un servicio</h2>
      <div className="grid grid-cols-2 gap-3">
        {accesos.map((a) => {
          const e = estado(a.servicioId)
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => irAServicio(a.servicioId)}
              aria-disabled={!e.contratable}
              className={`flex min-h-24 flex-col items-start justify-between rounded-2xl border p-4 text-left shadow-sm ${
                e.contratable ? 'border-neutral-200 bg-white active:bg-neutral-50' : 'border-dashed border-neutral-300 bg-neutral-100 text-neutral-500'
              }`}
            >
              <span className={`text-2xl ${e.contratable ? '' : 'opacity-50'}`} aria-hidden="true">
                {a.icono}
              </span>
              <span>
                <span className="block text-base font-semibold">{a.etiqueta}</span>
                {!e.contratable && <span className="block text-xs font-medium text-amber-800">Aún no disponible</span>}
              </span>
            </button>
          )
        })}
      </div>
      {aviso && (
        <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {aviso}
        </p>
      )}

      {otros.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            aria-expanded={verTodos}
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-teal-800"
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
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm ${
                      estado(o.servicioId).contratable ? 'border-neutral-200 bg-white' : 'border-dashed border-neutral-300 bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {o.etiqueta}
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
          <Link to="/login" className="font-semibold text-teal-700">
            Ya tengo cuenta
          </Link>
        </p>
      )}
      {session && perfil?.rol === 'cliente' && (
        <p className="mt-8 text-center text-sm">
          <Link to="/buscar" className="font-semibold text-teal-700">
            Ver profesionales
          </Link>
        </p>
      )}
    </div>
  )
}
