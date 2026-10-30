import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { ZONAS, MAX_ZONAS_TRABAJADOR, SERVICIOS_TECNICO } from '../lib/constantes'
import { esCelularValido, esTarifaValida, sonZonasValidas } from '../lib/validadores'
import { Avatar } from './PanelProfesional'
import type { Trabajador } from '../types'

export function EditarPerfilTrabajador({
  trabajador,
  onActualizado,
  abierto: abiertoControlado,
  onCambiarAbierto,
}: {
  trabajador: Trabajador
  onActualizado: () => void
  /** Si se pasan `abierto` y `onCambiarAbierto`, quien lo usa decide cuándo abrir (el botón vive afuera). */
  abierto?: boolean
  onCambiarAbierto?: (abierto: boolean) => void
}) {
  const { recargarPerfil, perfil } = useAuth()
  const [nombre, setNombre] = useState(perfil?.nombre ?? '')
  const [celular, setCelular] = useState(perfil?.telefono ?? '')
  const [direccion, setDireccion] = useState(perfil?.direccion ?? '')
  const [abiertoPropio, setAbiertoPropio] = useState(false)
  const controlado = abiertoControlado !== undefined && !!onCambiarAbierto
  const abierto = controlado ? abiertoControlado : abiertoPropio
  const setAbierto = controlado ? onCambiarAbierto : setAbiertoPropio
  const [tarifaHora, setTarifaHora] = useState(String(trabajador.tarifa_hora))
  const [servicios, setServicios] = useState<string[]>(trabajador.servicios)
  const [zonas, setZonas] = useState<string[]>(trabajador.zonas)
  const [descripcion, setDescripcion] = useState(trabajador.descripcion ?? '')
  const [foto, setFoto] = useState<File | null>(null)
  const [cv, setCv] = useState<File | null>(null)
  const [antecedentesDoc, setAntecedentesDoc] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const fotoVista = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto])
  useEffect(() => () => { if (fotoVista) URL.revokeObjectURL(fotoVista) }, [fotoVista])
  const [error, setError] = useState<string | null>(null)

  function alternarServicio(s: string) {
    setServicios((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  function alternarZona(z: string) {
    setZonas((prev) => {
      if (prev.includes(z)) return prev.filter((x) => x !== z)
      if (prev.length >= MAX_ZONAS_TRABAJADOR) return prev
      return [...prev, z]
    })
  }

  async function guardar() {
    if (nombre.trim().length < 3) {
      setError('Escribe tu nombre completo.')
      return
    }
    if (!esCelularValido(celular)) {
      setError('El celular debe tener 9 dígitos y empezar con 9.')
      return
    }
    const tarifa = Number(tarifaHora)
    if (!esTarifaValida(tarifa)) {
      setError('La tarifa por hora debe estar entre S/ 5 y S/ 100.')
      return
    }
    if (servicios.length === 0) {
      setError('Elige al menos un servicio que ofreces.')
      return
    }
    if (!sonZonasValidas(zonas, MAX_ZONAS_TRABAJADOR)) {
      setError(`Elige entre 1 y ${MAX_ZONAS_TRABAJADOR} zonas de atención.`)
      return
    }

    setEnviando(true)
    setError(null)

    const cambiosPerfil: Record<string, unknown> = {
      nombre: nombre.trim(),
      telefono: celular,
      direccion: direccion.trim() || null,
    }

    if (foto) {
      const extension = foto.name.split('.').pop() ?? 'jpg'
      const ruta = `${trabajador.id}/${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage.from('fotos').upload(ruta, foto, { upsert: true })
      if (errorSubida) {
        setError(traducirError(errorSubida))
        setEnviando(false)
        return
      }
      cambiosPerfil.foto_url = supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl
    }

    const { error: errorPerfil } = await supabase.from('perfiles').update(cambiosPerfil).eq('id', trabajador.id)
    if (errorPerfil) {
      setError(traducirError(errorPerfil))
      setEnviando(false)
      return
    }

    async function subirDocumento(file: File, prefijo: string): Promise<string | null> {
      const extension = file.name.split('.').pop() ?? 'jpg'
      const ruta = `${trabajador.id}/${prefijo}-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, file, { upsert: true })
      return errorSubida ? null : ruta
    }

    const cambios: Record<string, unknown> = {
      tarifa_hora: tarifa,
      servicios,
      zonas,
      descripcion: descripcion.trim() || null,
    }

    if (cv) {
      const ruta = await subirDocumento(cv, 'cv')
      if (!ruta) {
        setError('No pudimos subir tu CV. Intenta de nuevo.')
        setEnviando(false)
        return
      }
      cambios.cv_ruta = ruta
    }

    if (antecedentesDoc) {
      const ruta = await subirDocumento(antecedentesDoc, 'antecedentes')
      if (!ruta) {
        setError('No pudimos subir tu documento de antecedentes. Intenta de nuevo.')
        setEnviando(false)
        return
      }
      cambios.antecedentes_doc_ruta = ruta
    }

    const { error: errorUpdate } = await supabase.from('trabajadores').update(cambios).eq('id', trabajador.id)

    if (errorUpdate) {
      setError(traducirError(errorUpdate))
      setEnviando(false)
      return
    }

    setEnviando(false)
    setFoto(null)
    setCv(null)
    setAntecedentesDoc(null)
    setAbierto(false)
    await recargarPerfil()
    onActualizado()
  }

  if (!abierto) {
    if (controlado) return null
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700"
      >
        Editar mi perfil
      </button>
    )
  }

  return (
    <div id="editar-perfil" className="yavi-tarjeta mt-3 scroll-mt-20 p-4">
      <p className="mb-3 font-semibold">Editar mi perfil</p>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar nombre={nombre} fotoUrl={fotoVista ?? perfil?.foto_url ?? null} className="h-20 w-20 text-2xl" />
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Foto de perfil</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Nombre completo</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoComplete="name" className="input" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Celular (9 dígitos)</span>
          <input
            value={celular}
            onChange={(e) => setCelular(e.target.value.replace(/\D/g, '').slice(0, 9))}
            inputMode="numeric"
            autoComplete="tel"
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Dirección (opcional)</span>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={120} autoComplete="street-address" className="input" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Tarifa por hora (S/ 5 - 100)</span>
          <input
            type="number"
            min={5}
            max={100}
            step="0.5"
            value={tarifaHora}
            onChange={(e) => setTarifaHora(e.target.value)}
            className="input"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Servicios que ofreces</span>
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3">
            {SERVICIOS_TECNICO.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={servicios.includes(s)}
                  onChange={() => alternarServicio(s)}
                  className="h-4 w-4 accent-brand-700"
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">
            📍 Zonas de atención (elige hasta {MAX_ZONAS_TRABAJADOR})
          </span>
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3">
            {ZONAS.map((z) => {
              const seleccionada = zonas.includes(z)
              const deshabilitada = !seleccionada && zonas.length >= MAX_ZONAS_TRABAJADOR
              return (
                <label key={z} className={`flex items-center gap-2 text-sm ${deshabilitada ? 'opacity-40' : ''}`}>
                  <input
                    type="checkbox"
                    checked={seleccionada}
                    disabled={deshabilitada}
                    onChange={() => alternarZona(z)}
                    className="h-4 w-4 accent-brand-700"
                  />
                  {z}
                </label>
              )
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Descripción</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="input min-h-20"
            placeholder="Cuéntales a las clientas sobre ti"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">
            {trabajador.cv_ruta ? 'Reemplazar CV' : 'Subir CV (opcional)'}
          </span>
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={(e) => setCv(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">
            {trabajador.antecedentes_doc_ruta
              ? 'Reemplazar documento de antecedentes'
              : 'Subir documento de antecedentes (opcional)'}
          </span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setAntecedentesDoc(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={guardar}
            className="flex-1 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
