/**
 * Reglas y sinónimos para entender lo que escribe el cliente. Es DATA
 * configurable: para sumar una palabra o una variante local basta con editar
 * esta lista (no hace falta tocar el motor en interpretar.ts).
 *
 * Convenciones del texto de las reglas:
 * - Todo va en minúsculas y SIN tildes ("baño" se escribe "bano"): el motor
 *   normaliza lo que escribe el cliente de la misma forma.
 * - "pint*" significa "cualquier palabra que empiece con pint" (pintar, pintura…).
 * - Una clave con varias palabras ("toma corriente") exige todas, en cualquier orden.
 * - El motor tolera errores de tecleo en palabras de 5 letras o más.
 */

export interface OpcionAclaracion {
  etiqueta: string
  servicioId: string
  /** Texto de confirmación después de elegir esta opción. */
  confirmacion: string
  /** Aviso informativo (nunca un diagnóstico) que se muestra al continuar. */
  aviso?: string
  /** Modalidad que conviene si está operativa; si no, el flujo cae a "por horas". */
  modalidadSugerida?: 'diagnostico' | 'cotizacion' | 'fijo' | 'horas'
}

export interface ReglaInterpretacion {
  id: string
  servicioId: string
  claves: string[]
  /** Peso de cada coincidencia (por defecto 1). Las claves específicas pesan más. */
  peso?: number
  /** Pregunta al cliente con esta redacción: "¿Necesitas …?" */
  confirmacion: string
  /** Si el pedido es ambiguo por naturaleza, se pregunta antes de proponer un servicio. */
  aclarar?: { pregunta: string; opciones: OpcionAclaracion[] }
  modalidadSugerida?: OpcionAclaracion['modalidadSugerida']
}

/** Reglas ordenadas de lo específico a lo general. */
export const REGLAS: ReglaInterpretacion[] = [
  // ---- Humedad / hongo: nunca se asume que "solo hay que pintar" ----
  {
    id: 'hongo_pared',
    servicioId: 'pintura',
    claves: ['hongo', 'hongos', 'moho', 'humedad', 'humedo', 'humeda', 'salitre', 'mancha negra', 'manchas negras', 'filtracion'],
    peso: 4,
    confirmacion: '¿Necesitas ayuda con una pared que tiene hongo o humedad?',
    aclarar: {
      pregunta: 'Mencionas hongo o humedad en la pared. ¿Qué prefieres?',
      opciones: [
        {
          etiqueta: 'Que la revisen primero, antes de pintar',
          servicioId: 'albanileria',
          confirmacion: '¿Necesitas que revisen una pared con hongo o humedad antes de pintarla?',
          aviso: 'Un profesional revisará la pared y te dirá qué se puede hacer. Pintar encima sin revisar puede no solucionar el problema.',
          modalidadSugerida: 'diagnostico',
        },
        {
          etiqueta: 'Solo necesito pintar',
          servicioId: 'pintura',
          confirmacion: '¿Necesitas pintar una pared?',
          aviso: 'Si la pared tiene humedad, el hongo puede volver a salir. El profesional puede avisarte al ver el lugar.',
        },
      ],
    },
  },
  // ---- Albañilería ----
  {
    id: 'loseta_rota',
    servicioId: 'albanileria',
    claves: ['loseta', 'losetas', 'mayolica', 'mayolicas', 'mallolica', 'mallolicas', 'baldosa', 'baldosas', 'ceramico', 'ceramica', 'piso roto', 'piso levantado'],
    peso: 3,
    confirmacion: '¿Necesitas cambiar una loseta rota?',
  },
  {
    id: 'pared_rota',
    servicioId: 'albanileria',
    claves: ['grieta', 'grietas', 'rajadura', 'rajaduras', 'hueco', 'resane', 'resanar', 'tarrajeo', 'cemento', 'ladrillo', 'contrapiso', 'muro roto', 'pared rota'],
    peso: 3,
    confirmacion: '¿Necesitas reparar una pared o un piso (grieta, hueco o resane)?',
  },
  // ---- Electricidad ----
  {
    id: 'tomacorriente',
    servicioId: 'electricidad',
    claves: ['tomacorriente', 'tomacorrientes', 'tomacoriente', 'enchufe', 'enchufes', 'toma corriente', 'toma de corriente'],
    peso: 3,
    confirmacion: '¿Necesitas arreglar un tomacorriente (enchufe)?',
  },
  {
    id: 'interruptor',
    servicioId: 'electricidad',
    claves: ['interruptor', 'interruptores', 'switch', 'llave de luz', 'pulsador'],
    peso: 3,
    confirmacion: '¿Necesitas arreglar o cambiar un interruptor?',
  },
  {
    id: 'foco',
    servicioId: 'electricidad',
    claves: ['foco', 'focos', 'lampara', 'lamparas', 'luminaria', 'luminarias', 'fluorescente', 'reflector', 'ventilador'],
    peso: 3,
    confirmacion: '¿Necesitas cambiar o instalar un foco, lámpara o ventilador?',
  },
  {
    id: 'electricidad_general',
    servicioId: 'electricidad',
    claves: ['luz', 'luces', 'apagon', 'cable', 'cables', 'corto', 'cortocircuito', 'breaker', 'termica', 'tablero', 'electrico', 'electrica', 'electricista', 'electricidad', 'corriente', 'chispa', 'chispas', 'se fue la luz'],
    peso: 2,
    confirmacion: '¿Tienes un problema con la electricidad de tu casa?',
  },
  // ---- Gasfitería ----
  {
    id: 'desague',
    servicioId: 'gasfiteria',
    claves: ['desague', 'desagues', 'atoro', 'atorado', 'atorada', 'tapado', 'tapada', 'destapar', 'buzon', 'rebalsa'],
    peso: 3,
    confirmacion: '¿Necesitas destapar un desagüe?',
  },
  {
    id: 'fuga',
    servicioId: 'gasfiteria',
    claves: ['fuga', 'fugas', 'gotera', 'goteras', 'gotea', 'goteo', 'filtra agua', 'se filtra', 'sale agua'],
    peso: 3,
    confirmacion: '¿Tienes una fuga o gotera de agua?',
  },
  {
    id: 'cano',
    servicioId: 'gasfiteria',
    claves: ['cano', 'canos', 'grifo', 'grifos', 'llave de agua', 'lavadero', 'lavatorio', 'lavamanos', 'ducha', 'inodoro', 'wc', 'water', 'tuberia', 'tuberias', 'terma', 'tanque', 'cisterna', 'gasfitero', 'gasfiteria', 'gasfitera'],
    peso: 3,
    confirmacion: '¿Necesitas arreglar o instalar algo de agua (caño, lavadero, inodoro o tubería)?',
  },
  // ---- Aire acondicionado ----
  {
    id: 'aire',
    servicioId: 'aire_acondicionado',
    claves: ['aire acondicionado', 'aire acondicionados', 'split', 'minisplit', 'ac', 'aire', 'no enfria', 'enfria', 'climatizador'],
    peso: 3,
    confirmacion: '¿Necesitas ayuda con tu aire acondicionado?',
  },
  // ---- Pintura ----
  {
    id: 'pintura',
    servicioId: 'pintura',
    claves: ['pint*', 'repintar', 'brocha', 'empastar', 'esmalte', 'barniz'],
    peso: 3,
    confirmacion: '¿Necesitas pintar una pared o un ambiente?',
  },
  // ---- Carpintería ----
  {
    id: 'carpinteria',
    servicioId: 'carpinteria',
    claves: ['puerta', 'puertas', 'ropero', 'closet', 'mueble', 'muebles', 'repisa', 'repisas', 'cajon', 'cajones', 'madera', 'bisagra', 'bisagras', 'escritorio', 'carpintero', 'carpinteria'],
    peso: 2,
    confirmacion: '¿Necesitas arreglar o instalar algo de madera (puerta, mueble o repisa)?',
  },
  // ---- Cerrajería ----
  {
    id: 'cerrajeria',
    servicioId: 'cerrajeria',
    claves: ['cerradura', 'cerraduras', 'chapa', 'chapas', 'candado', 'picaporte', 'cerrojo', 'cerrajero', 'cerrajeria', 'llave', 'llaves', 'duplicado'],
    peso: 2,
    confirmacion: '¿Necesitas arreglar o cambiar una cerradura (chapa)?',
  },
  // ---- Vidriería y aluminio ----
  {
    id: 'vidrio',
    servicioId: 'vidrieria_aluminio',
    claves: ['ventana', 'ventanas', 'vidrio', 'vidrios', 'luna', 'mampara', 'mamparas', 'aluminio', 'corrediza', 'corredizo'],
    peso: 2,
    confirmacion: '¿Necesitas arreglar o cambiar una ventana, vidrio o mampara?',
  },
  // ---- Lavado y planchado ----
  {
    id: 'lavado',
    servicioId: 'lavado_planchado',
    claves: ['lavar ropa', 'lavanderia', 'planchar', 'planchado', 'plancha', 'ropa sucia', 'lavado'],
    peso: 3,
    confirmacion: '¿Necesitas que laven o planchen ropa?',
  },
  // ---- Organización ----
  {
    id: 'organizar',
    servicioId: 'organizacion_espacios',
    claves: ['ordenar', 'organizar', 'organizacion', 'ordenen', 'organicen', 'acomodar', 'acomoden'],
    peso: 3,
    confirmacion: '¿Necesitas ayuda para ordenar o reorganizar un espacio?',
  },
  // ---- Mantenimiento general (último recurso) ----
  {
    id: 'general',
    servicioId: 'mantenimiento_general',
    claves: ['arreglar', 'arreglo', 'reparar', 'reparacion', 'colgar', 'instalar', 'armar', 'taladrar', 'cuadro', 'cortina', 'cortinas', 'tornillo', 'ajustar'],
    peso: 1,
    confirmacion: '¿Necesitas una reparación o instalación sencilla en tu casa?',
  },
]

// ---------------- Limpieza ----------------
// "Limpieza" es una puerta de entrada del cliente. Se traduce a las
// clasificaciones internas del catálogo según el tipo de espacio.

export const CLAVES_LIMPIEZA = ['limpi*', 'aseo', 'asear', 'barrer', 'trapear', 'trapeo', 'fregar', 'desinfectar', 'sacudir', 'lustrar']

export type EspacioLimpieza = 'hogar' | 'oficina' | 'alojamiento' | 'evento' | 'obra'

/** Palabras que cambian el tipo de espacio (y por tanto la clasificación interna). */
export const ESPACIOS: { espacio: EspacioLimpieza; claves: string[] }[] = [
  { espacio: 'obra', claves: ['obra', 'construccion', 'remodelacion', 'escombros', 'post obra', 'postobra', 'polvo de obra', 'recien construido'] },
  { espacio: 'evento', claves: ['fiesta', 'postfiesta', 'evento', 'cumpleanos', 'matrimonio', 'boda', 'reunion', 'despues de la fiesta', 'quinceanero'] },
  { espacio: 'alojamiento', claves: ['airbnb', 'hospedaje', 'alojamiento', 'hostal', 'hotel', 'huespedes', 'departamento turistico'] },
  { espacio: 'oficina', claves: ['oficina', 'oficinas', 'local', 'tienda', 'negocio', 'comercio', 'consultorio', 'restaurante', 'empresa'] },
]

export const AMBIENTES: { etiqueta: string; claves: string[] }[] = [
  { etiqueta: 'Cocina', claves: ['cocina'] },
  { etiqueta: 'Baños', claves: ['bano', 'banos', 'servicio higienico', 'sshh', 'inodoro sucio'] },
  { etiqueta: 'Dormitorios', claves: ['dormitorio', 'dormitorios', 'cuarto', 'cuartos', 'habitacion', 'habitaciones'] },
  { etiqueta: 'Sala y comedor', claves: ['sala', 'comedor', 'living'] },
  { etiqueta: 'Patio o terraza', claves: ['patio', 'terraza', 'balcon'] },
  { etiqueta: 'Lavandería', claves: ['lavanderia'] },
]

/** Cosas puntuales: no es "la casa" ni un ambiente completo. */
export const OBJETOS_PUNTUALES = [
  'alfombra', 'alfombras', 'sofa', 'sillon', 'sillones', 'colchon', 'refrigeradora', 'refri', 'congeladora',
  'horno', 'microondas', 'campana', 'lavadora', 'persianas', 'cortinas', 'tanque', 'cisterna', 'ventanales', 'vidrios', 'ventana', 'ventanas',
]

export const PALABRAS_CASA_COMPLETA = ['casa', 'hogar', 'departamento', 'depa', 'vivienda', 'todo']

/** Tareas que el cliente puede pedir expresamente. Reorganizar NUNCA va incluido por defecto. */
export const TAREA_REORGANIZAR = 'Reorganizar pertenencias (cajones, closets o alacenas)'
export const CLAVES_REORGANIZAR = ['reorganizar', 'reorganicen', 'ordenar cajones', 'ordenar closet', 'ordenar ropero', 'vaciar cajones', 'sacar todo']

/** Nombres alternativos que se muestran en "Cambiar" para elegir a mano. */
export const ETIQUETA_SERVICIO_CORTA: Record<string, string> = {
  limpieza_basica: 'Limpieza',
  limpieza_profunda_reorganizacion: 'Limpieza',
  oficinas_comercios: 'Limpieza',
  alojamientos_airbnb: 'Limpieza',
  postevento: 'Limpieza',
  postobra: 'Limpieza',
  organizacion_espacios: 'Ordenar espacios',
  lavado_planchado: 'Lavado y planchado',
  aire_acondicionado: 'Aire acondicionado',
  gasfiteria: 'Gasfitería',
  electricidad: 'Electricidad',
  pintura: 'Pintura',
  albanileria: 'Albañilería',
  carpinteria: 'Carpintería',
  cerrajeria: 'Cerrajería',
  vidrieria_aluminio: 'Vidriería y aluminio',
  mantenimiento_general: 'Reparaciones generales',
}
