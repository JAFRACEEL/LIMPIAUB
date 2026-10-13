import { describe, it, expect } from 'vitest'
import { borradorVacio, guardarBorrador, leerBorrador, sanitizarParaGuardar, VIGENCIA_BORRADOR_MS, type PedidoBorrador } from './borrador'
import { esFuturo, lomasPronto } from './horario'
import { validarDirecto, validarLugarYHorario, validarNecesidad } from './pasosPedido'
import { armarDetalles, construirSolicitud, entregaEstimada, modalidadesDelPedido, resolverServicio } from './solicitud'
import type { DatosLimpieza } from './flujoLimpieza'

const AHORA = new Date('2026-10-13T20:00:00-05:00') // 8:00 pm en Lima
const casa: DatosLimpieza = { espacio: 'hogar', alcance: 'casa', ambientes: [], puntual: '', tareas: [], reorganizar: false }

function limpiezaHoras(extra: Partial<PedidoBorrador> = {}): PedidoBorrador {
  return {
    ...borradorVacio(),
    servicioId: 'limpieza_basica',
    limpieza: casa,
    confirmado: true,
    modalidad: 'horas',
    horas: 4,
    materiales: 'si',
    direccion: 'Jr. Lima 123',
    zona: 'Iquitos',
    programacion: 'programada',
    fecha: '2026-10-15',
    hora: '09:00',
    ...extra,
  }
}

function tomacorriente(extra: Partial<PedidoBorrador> = {}): PedidoBorrador {
  return {
    ...borradorVacio(),
    texto: 'Quiero arreglar mi tomacorriente',
    servicioId: 'electricidad',
    sugeridoId: 'electricidad',
    confirmado: true,
    modalidad: 'horas',
    horas: 2,
    respuestas: { riesgo_electrico: 'No' },
    direccion: 'Jr. Lima 123',
    zona: 'Iquitos',
    programacion: 'ahora',
    ...extra,
  }
}

describe('horario real', () => {
  it('"lo antes posible" suma el margen y redondea a 5 minutos, en hora de Lima', () => {
    expect(lomasPronto(new Date('2026-10-13T20:02:00-05:00'), 30)).toEqual({ fecha: '2026-10-13', hora: '20:35' })
  })
  it('cruza la medianoche de Lima, no la de UTC', () => {
    expect(lomasPronto(new Date('2026-10-13T23:50:00-05:00'), 30)).toEqual({ fecha: '2026-10-14', hora: '00:20' })
  })
  it('programar exige al menos 30 minutos de anticipación', () => {
    expect(esFuturo('2026-10-13', '20:20', AHORA)).toBe(false)
    expect(esFuturo('2026-10-13', '20:30', AHORA)).toBe(true)
    expect(esFuturo('2026-10-12', '23:00', AHORA)).toBe(false)
  })
})

describe('limpieza por horas (validación de pasos)', () => {
  it('es válida sin elegir básica o profunda y sin descripción', () => {
    expect(validarNecesidad(limpiezaHoras(), 0)).toBeNull()
  })
  it('las horas siguen entre 2 y 12 para limpieza', () => {
    expect(validarNecesidad(limpiezaHoras({ horas: 1 }), 0)).toContain('horas')
    expect(validarNecesidad(limpiezaHoras({ horas: 13 }), 0)).toContain('horas')
  })
  it('pregunta por materiales solo cuando se contrata por horas', () => {
    expect(validarNecesidad(limpiezaHoras({ materiales: '' }), 0)).toContain('materiales')
    expect(validarNecesidad(limpiezaHoras({ materiales: 'no', opcionSinMateriales: '' }), 0)).toContain('materiales')
    expect(validarNecesidad(limpiezaHoras({ materiales: 'no', opcionSinMateriales: 'trae_kit' }), 0)).toBeNull()
  })
  it('pide ambientes solo si eligió "algunos ambientes"', () => {
    const b = limpiezaHoras({ limpieza: { ...casa, alcance: 'ambientes' } })
    expect(validarNecesidad(b, 0)).toContain('ambientes')
  })
})

describe('limpieza por alcance (propuesta)', () => {
  it('con el interruptor apagado no se puede contratar por alcance', () => {
    expect(modalidadesDelPedido(limpiezaHoras({ modalidad: 'cotizacion' }))).toEqual(['horas'])
    expect(validarNecesidad(limpiezaHoras({ modalidad: 'cotizacion' }), 0)).toContain('contratar')
  })
})

describe('reparar un tomacorriente (diagnóstico / precio fijo)', () => {
  it('con las propuestas apagadas NO se sustituye por horas: no se puede contratar', () => {
    expect(modalidadesDelPedido(tomacorriente())).toEqual([])
    expect(validarNecesidad(tomacorriente(), 0)).toContain('todavía no está disponible')
    expect(validarNecesidad(tomacorriente({ modalidad: 'diagnostico' }), 0)).toContain('todavía no está disponible')
    expect(validarNecesidad(tomacorriente({ modalidad: 'horas' }), 0)).toContain('todavía no está disponible')
  })
  it('las horas son solo el bloque de agenda cuando no se cobra por horas', () => {
    const fila = construirSolicitud(tomacorriente({ modalidad: 'diagnostico' }), { clienteId: 'c1', ahora: AHORA, rutasFotos: [] })
    expect(fila.horas).toBe(2)
    expect(fila.modalidad_precio).toBe('diagnostico')
  })
  it('exige contar el problema', () => {
    expect(validarNecesidad(tomacorriente({ texto: '' }), 0)).toContain('Cuéntanos')
  })
  it('conserva la descripción original y si el cliente corrigió el servicio sugerido', () => {
    const fila = construirSolicitud(tomacorriente({ sugeridoId: 'mantenimiento_general' }), { clienteId: 'c1', ahora: AHORA, rutasFotos: [] })
    expect(fila.descripcion_trabajo).toBe('Quiero arreglar mi tomacorriente')
    const necesidad = fila.necesidad as { texto_original: string; corregido_por_cliente: boolean; sugerido_id: string }
    expect(necesidad.texto_original).toBe('Quiero arreglar mi tomacorriente')
    expect(necesidad.corregido_por_cliente).toBe(true)
  })
  it('"lo antes posible" calcula fecha y hora reales, no las pide', () => {
    const fila = construirSolicitud(tomacorriente(), { clienteId: 'c1', ahora: AHORA, rutasFotos: [] })
    expect(fila.fecha).toBe('2026-10-13')
    expect(fila.hora).toBe('20:30')
    expect(fila.programacion).toBe('ahora')
  })
})

describe('reparaciones generales sí admiten horas (cobrar por tiempo tiene sentido)', () => {
  const general = (extra: Partial<PedidoBorrador> = {}) =>
    tomacorriente({ servicioId: 'mantenimiento_general', respuestas: {}, texto: 'Colgar tres cuadros', ...extra })
  it('es contratable por horas y no pide materiales de limpieza ni fotos', () => {
    expect(modalidadesDelPedido(general())).toContain('horas')
    expect(validarNecesidad(general(), 0)).toBeNull()
  })
})

describe('el navegador nunca manda precios ni comisión', () => {
  it('la fila a insertar no trae tarifa, total, comisión ni pago', () => {
    const fila = construirSolicitud(limpiezaHoras(), { clienteId: 'c1', ahora: AHORA, rutasFotos: [] })
    for (const campo of ['tarifa_hora', 'total', 'total_cliente', 'comision_pct', 'pago_confirmado', 'estado', 'ventana_cierra_en']) {
      expect(fila).not.toHaveProperty(campo)
    }
  })
  it('el kit sí viaja como cantidad conocida (S/18) y el servidor lo revalida', () => {
    const fila = construirSolicitud(limpiezaHoras({ materiales: 'no', opcionSinMateriales: 'trae_kit' }), { clienteId: 'c1', ahora: AHORA, rutasFotos: [] })
    expect(fila.con_materiales).toBe(true)
    expect(fila.recargo_materiales).toBe(18)
  })
})

describe('pedido abierto y directo', () => {
  it('sin profesional elegido es abierto', () => {
    const fila = construirSolicitud(limpiezaHoras(), { clienteId: 'c1', ahora: AHORA, rutasFotos: [] })
    expect(fila.modo).toBe('abierto')
    expect(fila).not.toHaveProperty('trabajador_id')
  })
  it('con profesional elegido es directo', () => {
    const fila = construirSolicitud(limpiezaHoras({ trabajadorDirectoId: 'p1' }), { clienteId: 'c1', ahora: AHORA, rutasFotos: [] })
    expect(fila.modo).toBe('directo')
    expect(fila.trabajador_id).toBe('p1')
  })
})

describe('reserva programada', () => {
  it('exige día y hora con anticipación', () => {
    expect(validarLugarYHorario(limpiezaHoras({ fecha: '' }), AHORA)).toContain('día')
    expect(validarLugarYHorario(limpiezaHoras({ hora: '' }), AHORA)).toContain('hora')
    expect(validarLugarYHorario(limpiezaHoras({ fecha: '2026-10-13', hora: '20:10' }), AHORA)).toContain('30 minutos')
    expect(validarLugarYHorario(limpiezaHoras(), AHORA)).toBeNull()
  })
  it('lo antes posible no pide fecha ni hora', () => {
    expect(validarLugarYHorario(limpiezaHoras({ programacion: 'ahora', fecha: '', hora: '' }), AHORA)).toBeNull()
  })
  it('exige dirección y zona (dirección manual, sin GPS)', () => {
    expect(validarLugarYHorario(limpiezaHoras({ direccion: ' ' }), AHORA)).toContain('dirección')
    expect(validarLugarYHorario(limpiezaHoras({ zona: '' }), AHORA)).toContain('zona')
  })
})

describe('servicio con fotos obligatorias', () => {
  it('post obra pide al menos una foto y su pregunta simple de escombros', () => {
    const b = { ...limpiezaHoras(), limpieza: null, servicioId: 'postobra', subtipoId: null }
    expect(validarNecesidad(b, 0)).toContain('escombros')
    const b2 = { ...b, subtipoId: 'fina', respuestas: { estado_inmueble: 'No estoy seguro/a.' } }
    expect(validarNecesidad(b2, 0)).toContain('foto')
    expect(validarNecesidad(b2, 1)).toBeNull()
    expect(resolverServicio(b2)?.subtipo?.id).toBe('fina')
  })
})

describe('borrador durante la autenticación', () => {
  function almacenFalso() {
    const datos = new Map<string, string>()
    return {
      setItem: (k: string, v: string) => void datos.set(k, v),
      getItem: (k: string) => datos.get(k) ?? null,
      removeItem: (k: string) => void datos.delete(k),
    }
  }

  it('conserva lo escrito y lo recupera', () => {
    const a = almacenFalso()
    guardarBorrador(tomacorriente({ paso: 3 }), a, 1000)
    const b = leerBorrador(a, 2000)
    expect(b?.texto).toBe('Quiero arreglar mi tomacorriente')
    expect(b?.paso).toBe(3)
  })
  it('no guarda la dirección ni las notas (pueden identificar la casa)', () => {
    const a = almacenFalso()
    guardarBorrador(tomacorriente({ direccion: 'Jr. Putumayo 123', notas: 'timbre malogrado, vivo con mi mamá' }), a, 1000)
    const crudo = a.getItem('limpi.pedido.v1') ?? ''
    expect(crudo).not.toContain('Putumayo')
    expect(crudo).not.toContain('timbre')
    expect(leerBorrador(a, 2000)?.direccion).toBe('')
  })
  it('un borrador corrupto o de otra versión se ignora', () => {
    const a = almacenFalso()
    a.setItem('limpi.pedido.v1', '{no es json')
    expect(leerBorrador(a, 1)).toBeNull()
    a.setItem('limpi.pedido.v1', JSON.stringify({ v: 2, guardadoEn: 1 }))
    expect(leerBorrador(a, 2)).toBeNull()
  })
  it('caduca a las 2 horas', () => {
    const a = almacenFalso()
    guardarBorrador(tomacorriente(), a, 0)
    expect(leerBorrador(a, VIGENCIA_BORRADOR_MS + 1)).toBeNull()
  })
  it('no guarda respuestas privadas del recojo de ropa', () => {
    const b = {
      ...borradorVacio(),
      servicioId: 'lavado_planchado',
      respuestas: { contacto_recojo: '987654321', persona_entrega: 'Ana', tipo_servicio: 'Solo lavado' },
    }
    const limpio = sanitizarParaGuardar(b)
    expect(limpio.respuestas.contacto_recojo).toBeUndefined()
    expect(limpio.respuestas.tipo_servicio).toBe('Solo lavado')
  })
  it('los datos privados siguen yendo en su propio campo al enviar', () => {
    const b = {
      ...borradorVacio(),
      servicioId: 'lavado_planchado',
      subtipoId: 'recojo',
      respuestas: { tipo_servicio: 'Solo lavado', contacto_recojo: '987654321', rango_prendas: '1 a 10 prendas' },
    }
    const det = armarDetalles(b, [])
    expect(JSON.stringify(det?.respuestas)).not.toContain('987654321')
  })
})

describe('pedido directo a un profesional elegido', () => {
  const pro = { nombre: 'Rosa Tuanama', servicios: ['Limpieza básica del hogar'], kit_propio: false }
  it('sin profesional elegido no aplica', () => {
    expect(validarDirecto(limpiezaHoras(), null)).toBeNull()
  })
  it('si el profesional no se pudo cargar, se explica', () => {
    expect(validarDirecto(limpiezaHoras({ trabajadorDirectoId: 'p1' }), null)).toContain('No pudimos cargar')
  })
  it('el profesional debe ofrecer el servicio', () => {
    const b = tomacorriente({ trabajadorDirectoId: 'p1' })
    expect(validarDirecto(b, pro)).toContain('no ofrece este servicio')
    expect(validarDirecto(limpiezaHoras({ trabajadorDirectoId: 'p1' }), pro)).toBeNull()
  })
  it('si pidió kit, el profesional debe poder traerlo', () => {
    const b = limpiezaHoras({ trabajadorDirectoId: 'p1', materiales: 'no', opcionSinMateriales: 'trae_kit' })
    expect(validarDirecto(b, pro)).toContain('kit')
    expect(validarDirecto(b, { ...pro, kit_propio: true })).toBeNull()
  })
})

describe('lavado con recojo (se conservó del formulario anterior)', () => {
  const recojo = (extra: Partial<PedidoBorrador> = {}): PedidoBorrador => ({
    ...borradorVacio(),
    servicioId: 'lavado_planchado',
    subtipoId: 'recojo',
    programacion: 'programada',
    fecha: '2026-10-15',
    hora: '09:00',
    respuestas: { cantidad_prendas: '10' },
    ...extra,
  })
  it('estima la entrega: 1 día hasta 15 prendas, 2 hasta 30, y se confirma al recoger si son más', () => {
    expect(entregaEstimada(recojo(), AHORA)).toBe('2026-10-16')
    expect(entregaEstimada(recojo({ respuestas: { cantidad_prendas: '25' } }), AHORA)).toBe('2026-10-17')
    expect(entregaEstimada(recojo({ respuestas: { cantidad_prendas: '40' } }), AHORA)).toBeNull()
  })
  it('la entrega estimada viaja en los detalles del pedido', () => {
    const det = armarDetalles(recojo(), [], AHORA)
    expect(det?.respuestas.some((f) => f.etiqueta === 'Fecha estimada de entrega' && f.valor === '2026-10-16')).toBe(true)
  })
  it('no aplica a lavado en domicilio', () => {
    expect(entregaEstimada(recojo({ subtipoId: 'domicilio' }), AHORA)).toBeNull()
  })
})
