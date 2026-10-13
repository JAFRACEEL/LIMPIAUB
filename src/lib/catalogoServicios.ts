import type { ModalidadPrecio } from './modalidades'

export interface DetalleServicio {
  incluye: string[]
  noIncluye: string[]
  notas?: string[]
}

export interface SubtipoServicio {
  id: string
  nombre: string
  /** Frase corta que se muestra bajo el nombre de la modalidad. */
  descripcion?: string
  detalle: DetalleServicio
}

export interface OpcionServicio {
  id: string
  nombre: string
}

export type Respuestas = Record<string, string | string[]>

export interface PreguntaServicio {
  id: string
  etiqueta: string
  tipo: 'opcion' | 'multi' | 'texto' | 'cantidad'
  opciones?: string[]
  obligatoria?: boolean
  placeholder?: string
  /** Solo para tipo 'texto': true = área de varias líneas, si no una sola línea. */
  multilinea?: boolean
  /** true = dato personal: solo lo ve la trabajadora ya asignada, nunca en pedidos abiertos. */
  privada?: boolean
  /** Si se indica, la pregunta solo aplica a estas modalidades (ids de subtipo). */
  soloSubtipos?: string[]
  visibleSi?: (respuestas: Respuestas) => boolean
  /** Aviso informativo (no bloquea) según lo respondido. */
  aviso?: (valor: string | string[], respuestas: Respuestas, subtipoId: string | null) => string | null
}

export interface FotosServicio {
  obligatorias: boolean
  maximo: number
  etiqueta: string
}

export interface ServicioCatalogo {
  id: string
  nombre: string
  seccion: 'limpieza' | 'mantenimiento'
  /** Breve descripción que se ve al entrar al servicio. */
  descripcion?: string
  /** Texto de la pregunta cuando hay que elegir una modalidad (subtipos). */
  preguntaSubtipo?: string
  detalle?: DetalleServicio
  subtipos?: SubtipoServicio[]
  opciones?: OpcionServicio[]
  preguntas?: PreguntaServicio[]
  fotos?: FotosServicio
  /** false = no aplica la pregunta de materiales de limpieza (p. ej. lavado). */
  pideMateriales?: boolean
  requiereDescripcionTrabajo?: boolean
  /** false = ficha aún no lista: no se ofrece contratación. Por defecto true. */
  habilitado?: boolean
  /**
   * Para servicios con subtipos que el cliente no debería tener que distinguir
   * por nombre técnico: una pregunta en lenguaje cotidiano que decide el subtipo.
   */
  preguntaSubtipoSimple?: { pregunta: string; opciones: { etiqueta: string; subtipoId: string; aviso?: string }[] }
  /** Subtipo que se usa cuando el cliente no tiene que elegir (clasificación interna). */
  subtipoPorDefecto?: string
}

const SERVICIOS_CON_LAVADO = ['Solo lavado', 'Lavado y secado', 'Lavado, secado y doblado', 'Lavado y planchado']
const SERVICIOS_CON_PLANCHADO = ['Solo planchado', 'Lavado y planchado']
const SERVICIOS_CON_SECADO = ['Lavado y secado', 'Lavado, secado y doblado']
const TIPOS_SERVICIO_LAVADO = [
  'Solo lavado',
  'Lavado y secado',
  'Lavado, secado y doblado',
  'Solo planchado',
  'Lavado y planchado',
]

function esUno(valor: string | string[] | undefined, lista: string[]): boolean {
  return typeof valor === 'string' && lista.includes(valor)
}

const AVISO_PRENDAS_DELICADAS =
  'El cliente deberá informar previamente sobre cualquier prenda que requiera cuidados especiales, restricciones de temperatura, lavado manual, separación de colores u otras indicaciones particulares.'

const NO_INCLUYE_LAVADO = [
  'Limpieza en seco profesional.',
  'Lavado especializado de cuero, gamuza u otros materiales que requieran tratamiento profesional.',
  'Tratamiento de prendas que indiquen exclusivamente limpieza especializada.',
  'Reparación o modificación de prendas.',
  'Costura.',
  'Teñido de prendas.',
  'Eliminación garantizada de manchas permanentes.',
  'Tratamientos especializados que no formen parte del lavado convencional.',
]

const NOTAS_LAVADO_COMUNES = [
  'El cliente deberá informar si existen prendas delicadas o que requieran cuidados especiales.',
  'Se respetarán, cuando existan, las instrucciones indicadas en las etiquetas de las prendas.',
  'No se incluyen prendas que requieran limpieza profesional especializada.',
  'Si una prenda requiere un procedimiento que no puede realizarse de manera segura con el servicio contratado, se te avisará antes de iniciar el trabajo.',
  'Las condiciones y el precio quedan visibles antes de confirmar la solicitud.',
]

export const CATALOGO_SERVICIOS: ServicioCatalogo[] = [
  {
    id: 'limpieza_basica',
    nombre: 'Limpieza básica del hogar',
    seccion: 'limpieza',
    detalle: {
      incluye: [
        'Barrido, aspirado y/o trapeado de pisos.',
        'Limpieza de polvo en muebles y superficies accesibles.',
        'Limpieza exterior de muebles.',
        'Limpieza de mesas, repisas y superficies de uso cotidiano.',
        'Limpieza de baños: inodoro, lavatorio, ducha, espejos y superficies.',
        'Limpieza básica de cocina: lavadero, encimeras, mesa y superficies exteriores.',
        'Limpieza exterior de electrodomésticos.',
        'Limpieza de dormitorios y áreas comunes.',
        'Limpieza de espejos y vidrios interiores de fácil acceso.',
        'Recojo de residuos domésticos.',
        'Orden básico de objetos que se encuentren a la vista.',
      ],
      noIncluye: [
        'Vaciar cajones, armarios, alacenas o muebles.',
        'Reorganización interna de pertenencias.',
        'Movimiento o reubicación de muebles pesados.',
        'Limpieza de residuos de construcción.',
        'Trabajos en altura o zonas que representen riesgo.',
        'Trabajos que requieran maquinaria o productos especializados.',
      ],
    },
  },
  {
    id: 'limpieza_profunda_reorganizacion',
    nombre: 'Limpieza y reorganización profunda',
    seccion: 'limpieza',
    detalle: {
      incluye: [
        'Limpieza detallada de los ambientes.',
        'Retiro temporal de objetos ubicados dentro de cajones, armarios, clósets, alacenas, cómodas, repisas y otros muebles de almacenamiento.',
        'Limpieza interior y exterior de dichos espacios.',
        'Limpieza de polvo y suciedad acumulada en zonas que normalmente no se atienden durante una limpieza básica.',
        'Reorganización y colocación ordenada de los objetos retirados.',
        'Limpieza detallada de baños y cocina.',
        'Limpieza de puertas, marcos, zócalos y superficies accesibles.',
        'Limpieza de espejos y vidrios interiores de fácil acceso.',
      ],
      noIncluye: [
        'No se desechan objetos personales sin autorización del cliente.',
        'No se cambian de ubicación pertenencias importantes sin autorización.',
        'No incluye movimiento, levantamiento ni reubicación de muebles pesados.',
        'No incluye movimiento de electrodomésticos grandes.',
        'La reorganización se limita a objetos que puedan manipularse de manera segura.',
        'No incluye residuos de construcción o remodelación.',
        'No incluye trabajos en altura o situaciones que representen riesgo.',
      ],
    },
  },
  {
    id: 'oficinas_comercios',
    nombre: 'Limpieza de oficinas y comercios',
    seccion: 'limpieza',
    subtipoPorDefecto: 'rutinaria',
    subtipos: [
      {
        id: 'rutinaria',
        nombre: 'Limpieza rutinaria',
        detalle: {
          incluye: [
            'Barrido, aspirado y trapeado de pisos.',
            'Limpieza de polvo en superficies accesibles.',
            'Limpieza exterior de escritorios y mobiliario.',
            'Limpieza de áreas comunes.',
            'Limpieza de baños.',
            'Limpieza básica de zonas de alimentación o kitchenette.',
            'Limpieza de espejos y vidrios interiores accesibles.',
            'Vaciado de papeleras.',
            'Recojo de residuos comunes.',
            'Acondicionamiento general de los ambientes.',
          ],
          noIncluye: [
            'Movimiento de mobiliario pesado.',
            'Reorganización de documentos, archivos o pertenencias.',
            'Limpieza interna de equipos electrónicos.',
            'Limpieza postobra.',
            'Trabajos en altura.',
            'Manipulación de residuos peligrosos, químicos, biológicos o industriales.',
          ],
        },
      },
      {
        id: 'profunda',
        nombre: 'Limpieza profunda',
        detalle: {
          incluye: [
            'Todo lo correspondiente a la limpieza rutinaria.',
            'Limpieza detallada de mobiliario.',
            'Limpieza de puertas y marcos.',
            'Limpieza de zócalos y esquinas.',
            'Limpieza de superficies menos atendidas durante el mantenimiento rutinario.',
            'Limpieza profunda de baños.',
            'Limpieza profunda de áreas comunes.',
            'Eliminación de suciedad acumulada.',
          ],
          noIncluye: [
            'Movimiento de mobiliario pesado.',
            'Limpieza postobra.',
            'Trabajos especializados en altura.',
            'Manipulación o reorganización de documentos confidenciales.',
            'Manipulación de residuos peligrosos o industriales.',
          ],
        },
      },
    ],
  },
  {
    id: 'alojamientos_airbnb',
    nombre: 'Limpieza de alojamientos y Airbnb',
    seccion: 'limpieza',
    subtipoPorDefecto: 'rutinaria',
    subtipos: [
      {
        id: 'rutinaria',
        nombre: 'Limpieza rutinaria / entre huéspedes',
        detalle: {
          incluye: [
            'Barrido, aspirado y trapeado.',
            'Limpieza de dormitorios.',
            'Limpieza de baños.',
            'Limpieza básica de cocina.',
            'Limpieza de mesas y superficies.',
            'Limpieza exterior de muebles y electrodomésticos.',
            'Limpieza de espejos.',
            'Recojo de residuos.',
            'Orden y acondicionamiento general.',
            'Cambio de ropa de cama cuando el propietario proporcione ropa limpia.',
            'Colocación de toallas o artículos proporcionados por el propietario.',
          ],
          noIncluye: [
            'Lavado de ropa de cama, salvo contratación adicional.',
            'Reorganización profunda de muebles o pertenencias.',
            'Movimiento de muebles pesados.',
            'Limpieza postobra.',
            'Reposición de productos que no hayan sido proporcionados por el propietario.',
          ],
        },
      },
      {
        id: 'profunda',
        nombre: 'Limpieza profunda',
        detalle: {
          incluye: [
            'Todo lo correspondiente a la limpieza rutinaria.',
            'Limpieza detallada de muebles y superficies.',
            'Limpieza de puertas, marcos y zócalos.',
            'Limpieza profunda de cocina y baños.',
            'Limpieza de espacios de almacenamiento accesibles previamente autorizados.',
            'Limpieza de zonas con suciedad acumulada.',
          ],
          noIncluye: [
            'Movimiento de muebles pesados.',
            'Retiro de residuos de construcción.',
            'Trabajos en altura que representen riesgo.',
            'Reparaciones o mantenimiento del inmueble.',
          ],
        },
      },
    ],
  },
  {
    id: 'postevento',
    nombre: 'Limpieza postevento o postfiesta',
    seccion: 'limpieza',
    detalle: {
      incluye: [
        'Recojo de residuos comunes.',
        'Recolección de botellas, vasos, platos descartables y otros elementos utilizados durante el evento.',
        'Barrido, aspirado y trapeado.',
        'Limpieza de mesas y superficies.',
        'Limpieza de baños.',
        'Limpieza básica de cocina.',
        'Retiro de restos de alimentos.',
        'Acondicionamiento general del espacio.',
      ],
      noIncluye: [
        'Retiro de grandes volúmenes de residuos.',
        'Desmontaje de estructuras utilizadas durante el evento.',
        'Movimiento de mobiliario pesado.',
        'Limpieza de sustancias peligrosas.',
        'Reparación de daños ocasionados durante el evento.',
      ],
      notas: [
        'La existencia de suciedad extraordinaria o situaciones fuera de una limpieza posterior a un evento habitual deberá ser informada previamente.',
      ],
    },
  },
  {
    id: 'postobra',
    nombre: 'Limpieza post obra',
    seccion: 'limpieza',
    preguntaSubtipoSimple: {
      pregunta: '¿Todavía quedan escombros o residuos pesados?',
      opciones: [
        { etiqueta: 'Sí, todavía hay escombros o residuos pesados', subtipoId: 'pesada' },
        { etiqueta: 'No, solo queda polvo y suciedad de obra', subtipoId: 'fina' },
        {
          etiqueta: 'No estoy seguro/a',
          subtipoId: 'pesada',
          aviso: 'Sube fotos del inmueble para que validemos qué tipo de limpieza necesitas.',
        },
      ],
    },
    descripcion:
      'Servicio especializado para inmuebles que han pasado por una construcción, remodelación, ampliación o trabajos de obra.',
    preguntaSubtipo: 'Elige la modalidad que necesitas',
    fotos: {
      obligatorias: true,
      maximo: 6,
      etiqueta: 'Fotos actuales del inmueble o de las áreas que necesitan limpieza',
    },
    subtipos: [
      {
        id: 'pesada',
        nombre: 'Limpieza post obra pesada',
        descripcion: 'Retiro de residuos y escombros.',
        detalle: {
          incluye: [
            'Recojo y embolsado de residuos de obra.',
            'Recojo de restos de cemento, yeso, mortero, cerámicos, madera, cartón, plástico y materiales similares.',
            'Recojo de restos pequeños de construcción o remodelación.',
            'Retiro de envolturas, cajas y embalajes dejados por los trabajos de obra.',
            'Barrido de polvo grueso y residuos acumulados.',
            'Despeje general de pisos y ambientes.',
            'Acopio y organización de los residuos en un punto determinado para su retiro.',
            'Limpieza inicial de las áreas intervenidas para dejarlas libres de residuos pesados.',
          ],
          noIncluye: [
            'Demolición de paredes, pisos, techos u otras estructuras.',
            'Picado o retiro de cemento, mayólica, porcelanato u otros materiales que continúen adheridos estructuralmente.',
            'Desmontaje de instalaciones eléctricas, sanitarias o estructuras.',
            'Retiro de materiales peligrosos o contaminantes.',
            'Manipulación de residuos químicos.',
            'Movimiento de maquinaria, equipos industriales o elementos extremadamente pesados.',
            'Transporte o disposición final de grandes cantidades de escombros fuera del inmueble, salvo que este servicio haya sido solicitado y cotizado adicionalmente.',
            'Uso de camión, motocarro u otro vehículo para eliminación de escombros, salvo contratación adicional.',
          ],
          notas: [
            'Si necesitas que los escombros sean transportados y eliminados fuera de la propiedad, indícalo en la solicitud. Ese servicio se evalúa y se cotiza adicionalmente según la cantidad de residuos y el transporte requerido.',
            'Este servicio requiere mayor esfuerzo físico y experiencia que una limpieza convencional.',
          ],
        },
      },
      {
        id: 'fina',
        nombre: 'Limpieza fina post obra',
        descripcion: 'Limpieza final para habitar o entregar.',
        detalle: {
          incluye: [
            'Eliminación de polvo fino generado por la obra.',
            'Barrido, aspirado y trapeado de pisos.',
            'Limpieza de superficies.',
            'Limpieza de puertas y marcos.',
            'Limpieza de ventanas y vidrios accesibles.',
            'Limpieza de zócalos.',
            'Limpieza exterior de interruptores, tomacorrientes y accesorios.',
            'Limpieza de mesones y superficies de cocina.',
            'Limpieza de muebles empotrados que se encuentren vacíos.',
            'Limpieza de baños.',
            'Limpieza de lavatorios, inodoros, duchas y griferías instaladas.',
            'Limpieza de repisas y superficies fijas.',
            'Retiro de polvo sobre muebles empotrados.',
            'Eliminación de pequeños residuos restantes de la obra.',
            'Limpieza general final del inmueble para dejarlo listo para ser ocupado.',
          ],
          noIncluye: [
            'Retiro de grandes cantidades de escombros.',
            'Sacos de cemento, ladrillos, bloques, madera u otros residuos pesados de construcción.',
            'Demolición o desmontaje.',
            'Retiro de cemento, pintura, pegamento u otros materiales fuertemente adheridos que requieran herramientas especializadas o puedan dañar la superficie.',
            'Pulido, encerado o tratamiento especializado de pisos.',
            'Limpieza de fachadas o ventanas exteriores en altura que requieran equipos especiales.',
            'Trabajos en altura sin las condiciones y equipos de seguridad correspondientes.',
            'Movimiento o reubicación de muebles pesados.',
            'Reparaciones de pintura, gasfitería, electricidad, carpintería u otros trabajos de mantenimiento.',
            'Transporte de escombros fuera del inmueble.',
          ],
          notas: ['Pensada para inmuebles donde ya se retiraron los escombros principales y solo queda polvo fino y suciedad de obra.'],
        },
      },
    ],
    preguntas: [
      {
        id: 'estado_inmueble',
        etiqueta: '¿En qué estado se encuentra actualmente el inmueble?',
        tipo: 'opcion',
        obligatoria: true,
        opciones: [
          'La obra terminó y todavía existen escombros o residuos pesados.',
          'Los escombros ya fueron retirados y necesito la limpieza final.',
          'Todavía se están realizando algunos trabajos.',
          'No estoy seguro/a.',
        ],
        aviso: (valor, _respuestas, subtipoId) => {
          if (valor === 'Todavía se están realizando algunos trabajos.') {
            return 'Lo ideal es reservar cuando la obra ya terminó; si todavía hay trabajos en curso, la limpieza puede quedar incompleta. Cuéntanos en las notas qué falta.'
          }
          if (valor === 'Los escombros ya fueron retirados y necesito la limpieza final.' && subtipoId === 'pesada') {
            return 'Por lo que nos cuentas, quizá te convenga la Limpieza fina post obra. Puedes cambiar de modalidad o enviar las fotos para que validemos.'
          }
          if (
            valor === 'La obra terminó y todavía existen escombros o residuos pesados.' &&
            subtipoId === 'fina'
          ) {
            return 'Si todavía hay escombros, quizá te convenga la Limpieza post obra pesada. Puedes cambiar de modalidad o enviar las fotos para que validemos.'
          }
          if (valor === 'No estoy seguro/a.') {
            return 'Sube fotos del inmueble para que validemos que elegiste el tipo de servicio correcto.'
          }
          return null
        },
      },
      {
        id: 'retiro_escombros',
        etiqueta: '¿Necesita que los escombros sean retirados y transportados fuera de la propiedad?',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['pesada'],
        opciones: ['Sí', 'No'],
        aviso: (valor) =>
          valor === 'Sí'
            ? 'El traslado y disposición de escombros puede generar un costo adicional y estará sujeto a evaluación según el volumen de residuos y el transporte requerido.'
            : null,
      },
    ],
  },
  {
    id: 'organizacion_espacios',
    nombre: 'Organización de espacios',
    seccion: 'limpieza',
    detalle: {
      incluye: [
        'Organización de clósets.',
        'Armarios.',
        'Cajones.',
        'Cómodas.',
        'Cocinas.',
        'Alacenas.',
        'Despensas.',
        'Repisas.',
        'Dormitorios.',
        'Otros espacios de almacenamiento.',
      ],
      noIncluye: ['No incluye limpieza profunda del inmueble.', 'No incluye movimiento de muebles pesados.', 'No incluye mudanzas.'],
      notas: [
        'No se desechan pertenencias sin autorización del cliente.',
        'Cuando sea necesario decidir qué objetos conservar, trasladar o eliminar, la decisión corresponderá al cliente.',
      ],
    },
  },
  {
    id: 'lavado_planchado',
    nombre: 'Lavado y planchado',
    seccion: 'limpieza',
    pideMateriales: false,
    preguntaSubtipoSimple: {
      pregunta: '¿Cómo prefieres el servicio?',
      opciones: [
        { etiqueta: 'Que vayan a mi casa a lavar o planchar', subtipoId: 'domicilio' },
        { etiqueta: 'Que recojan mi ropa y me la entreguen', subtipoId: 'recojo' },
      ],
    },
    preguntaSubtipo: '¿Cómo desea recibir el servicio?',
    subtipos: [
      {
        id: 'domicilio',
        nombre: 'Servicio en domicilio',
        descripcion:
          'El prestador realiza el lavado y/o planchado directamente en tu domicilio, utilizando los equipos disponibles en el lugar.',
        detalle: {
          incluye: [
            'Lavado y/o planchado de tus prendas en tu domicilio, con los equipos que tengas disponibles.',
            'Secado y doblado, según el servicio que elijas.',
          ],
          noIncluye: NO_INCLUYE_LAVADO,
          notas: [
            ...NOTAS_LAVADO_COMUNES,
            'Debes indicar qué equipos tienes disponibles (lavadora, secadora, plancha y tabla de planchar).',
            'Si el prestador debe llevar los productos de lavado, podrá aplicarse un costo adicional.',
            'Con cantidades grandes de prendas, el precio o el tiempo del servicio podrán estar sujetos a evaluación.',
          ],
        },
      },
      {
        id: 'recojo',
        nombre: 'Servicio con recojo y entrega',
        descripcion:
          'Recogemos las prendas en el domicilio indicado, realizamos el servicio solicitado y posteriormente las entregamos nuevamente al cliente.',
        detalle: {
          incluye: [
            'Recojo de las prendas en la dirección que indiques.',
            'Lavado, secado, doblado y/o planchado según el servicio elegido.',
            'Entrega de las prendas limpias en la dirección que indiques.',
          ],
          noIncluye: NO_INCLUYE_LAVADO,
          notas: [
            ...NOTAS_LAVADO_COMUNES,
            'Las prendas se registran (cantidad y, de ser posible, fotos) antes de ser retiradas.',
            'El tiempo de entrega depende de la cantidad de prendas y del tipo de servicio seleccionado.',
          ],
        },
      },
    ],
    preguntas: [
      {
        id: 'tipo_servicio',
        etiqueta: '¿Qué servicio necesita?',
        tipo: 'opcion',
        obligatoria: true,
        opciones: TIPOS_SERVICIO_LAVADO,
      },
      // ----- En domicilio: equipos (solo los que aplican al servicio elegido)
      {
        id: 'tiene_lavadora',
        etiqueta: '¿Tu domicilio cuenta con lavadora?',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['domicilio'],
        opciones: ['Sí', 'No'],
        visibleSi: (r) => esUno(r.tipo_servicio, SERVICIOS_CON_LAVADO),
      },
      {
        id: 'tiene_secadora',
        etiqueta: '¿Cuenta con secadora?',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['domicilio'],
        opciones: ['Sí', 'No'],
        visibleSi: (r) => esUno(r.tipo_servicio, SERVICIOS_CON_SECADO),
      },
      {
        id: 'tiene_plancha',
        etiqueta: '¿Cuenta con plancha?',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['domicilio'],
        opciones: ['Sí', 'No'],
        visibleSi: (r) => esUno(r.tipo_servicio, SERVICIOS_CON_PLANCHADO),
      },
      {
        id: 'tiene_tabla',
        etiqueta: '¿Cuenta con tabla o superficie adecuada para planchar?',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['domicilio'],
        opciones: ['Sí', 'No'],
        visibleSi: (r) => esUno(r.tipo_servicio, SERVICIOS_CON_PLANCHADO),
      },
      {
        id: 'productos_lavado',
        etiqueta: '¿Quién proporcionará los productos necesarios para el servicio?',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['domicilio'],
        opciones: ['El cliente proporcionará los productos.', 'Deseo que el prestador lleve los productos.'],
        visibleSi: (r) => esUno(r.tipo_servicio, SERVICIOS_CON_LAVADO),
        aviso: (valor) =>
          valor === 'Deseo que el prestador lleve los productos.'
            ? 'Si el prestador lleva los productos, podrá existir un costo adicional de acuerdo con los productos requeridos.'
            : null,
      },
      {
        id: 'rango_prendas',
        etiqueta: 'Cantidad aproximada de prendas que desea lavar y/o planchar',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['domicilio'],
        opciones: ['1 a 10 prendas', '11 a 20 prendas', '21 a 30 prendas', 'Más de 30 prendas'],
        aviso: (valor) =>
          valor === 'Más de 30 prendas'
            ? 'Con más de 30 prendas, el precio o el tiempo del servicio podrán estar sujetos a evaluación.'
            : null,
      },
      // ----- Recojo y entrega
      {
        id: 'cantidad_prendas',
        etiqueta: 'Cantidad aproximada de prendas',
        tipo: 'cantidad',
        obligatoria: true,
        soloSubtipos: ['recojo'],
        placeholder: 'Ej. 15',
        aviso: (valor) =>
          typeof valor === 'string' && Number(valor) > 30
            ? 'Con más de 30 prendas, el precio o el tiempo del servicio podrán estar sujetos a evaluación.'
            : null,
      },
      {
        id: 'tipos_prenda',
        etiqueta: 'Tipo de prendas (marca las que apliquen)',
        tipo: 'multi',
        soloSubtipos: ['recojo'],
        opciones: [
          'Prendas blancas',
          'Prendas de colores',
          'Prendas oscuras',
          'Ropa de cama',
          'Toallas',
          'Prendas delicadas',
          'Prendas que requieren cuidados especiales',
        ],
      },
      {
        id: 'observaciones_prendas',
        etiqueta: 'Observaciones o indicaciones especiales sobre las prendas (opcional)',
        tipo: 'texto',
        multilinea: true,
        soloSubtipos: ['recojo'],
        placeholder: 'Escribe aquí',
      },
      {
        id: 'persona_entrega',
        etiqueta: 'Persona que entregará las prendas',
        tipo: 'texto',
        privada: true,
        obligatoria: true,
        soloSubtipos: ['recojo'],
        placeholder: 'Nombre completo',
      },
      {
        id: 'contacto_recojo',
        etiqueta: 'Número de contacto (celular de 9 dígitos)',
        tipo: 'texto',
        privada: true,
        obligatoria: true,
        soloSubtipos: ['recojo'],
        placeholder: '9XXXXXXXX',
      },
      {
        id: 'direccion_entrega_opcion',
        etiqueta: 'Dirección de entrega',
        tipo: 'opcion',
        obligatoria: true,
        soloSubtipos: ['recojo'],
        opciones: ['La misma dirección de recojo.', 'Otra dirección.'],
      },
      {
        id: 'direccion_entrega',
        etiqueta: 'Otra dirección de entrega',
        tipo: 'texto',
        privada: true,
        obligatoria: true,
        soloSubtipos: ['recojo'],
        placeholder: 'Jirón / calle, número, referencia',
        visibleSi: (r) => r.direccion_entrega_opcion === 'Otra dirección.',
      },
      // ----- Ambas modalidades
      {
        id: 'prendas_delicadas',
        etiqueta: '¿Tiene prendas delicadas o que requieran cuidados especiales?',
        tipo: 'opcion',
        obligatoria: true,
        opciones: ['Sí', 'No'],
        aviso: () => AVISO_PRENDAS_DELICADAS,
      },
      {
        id: 'detalle_prendas_delicadas',
        etiqueta: 'Indica el tipo de prenda y las instrucciones de lavado',
        tipo: 'texto',
        multilinea: true,
        obligatoria: true,
        placeholder: 'Ej. Blusa de seda: lavar a mano con agua fría',
        visibleSi: (r) => r.prendas_delicadas === 'Sí',
      },
    ],
    detalle: {
      incluye: [],
      noIncluye: NO_INCLUYE_LAVADO,
      notas: NOTAS_LAVADO_COMUNES,
    },
  },
  {
    id: 'electricidad',
    nombre: 'Electricidad',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: [
        'Instalación o cambio de luminarias.',
        'Interruptores.',
        'Tomacorrientes.',
        'Ventiladores.',
        'Instalaciones eléctricas menores.',
        'Diagnóstico de averías eléctricas domésticas.',
        'Reparaciones eléctricas menores.',
      ],
      noIncluye: [],
      notas: ['Los trabajos de mayor complejidad deberán ser evaluados previamente y podrán requerir una cotización independiente.'],
    },
    preguntas: [
      {
        id: 'riesgo_electrico',
        etiqueta: '¿Notas chispas, olor a quemado o calor en el tablero o en el punto afectado?',
        tipo: 'opcion',
        opciones: ['No', 'Sí'],
        aviso: (valor) =>
          valor === 'Sí'
            ? 'Por seguridad, no uses ese punto y, si puedes, baja la llave del tablero hasta que llegue el profesional.'
            : null,
      },
    ],
  },
  {
    // FICHA PROVISIONAL: el alcance está redactado sin técnicos reales todavía. Revisarlo con quienes se
    // inscriban antes de abrir este servicio. Mientras no haya profesionales registrados no se ofrece
    // para contratar (ver disponibilidad.ts y la vista v_cobertura_servicios).
    id: 'aire_acondicionado',
    nombre: 'Aire acondicionado',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: [
        'Limpieza y mantenimiento de equipos tipo split o de ventana de uso doméstico.',
        'Revisión del funcionamiento del equipo.',
        'Evaluación de fallas (por ejemplo, si no enfría, gotea o hace ruido).',
        'Instalación o cambio de ubicación de equipos tipo split, según evaluación.',
      ],
      noIncluye: [
        'Repuestos, gas refrigerante y materiales, salvo que el profesional los incluya expresamente en su propuesta.',
        'Equipos industriales, centrales o sistemas de gran tamaño.',
        'Trabajos eléctricos o de albañilería necesarios para instalar el equipo, salvo que se indique.',
      ],
      notas: [
        'El alcance y el precio final los define el profesional según el estado del equipo. Cualquier cambio necesita tu aprobación antes de realizarse.',
      ],
    },
    preguntas: [
      {
        id: 'tipo_aire',
        etiqueta: '¿Qué necesitas con tu aire acondicionado?',
        tipo: 'opcion',
        obligatoria: true,
        opciones: ['Limpieza o mantenimiento', 'No enfría o tiene una falla', 'Instalación o cambio de lugar', 'Otra cosa'],
      },
      {
        id: 'cantidad_equipos',
        etiqueta: '¿Cuántos equipos son?',
        tipo: 'cantidad',
        obligatoria: true,
        placeholder: 'Ej. 1',
      },
    ],
  },
  {
    id: 'gasfiteria',
    nombre: 'Gasfitería',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: ['Grifos.', 'Lavatorios.', 'Inodoros.', 'Duchas.', 'Tuberías.', 'Fugas de agua.', 'Desagües.', 'Accesorios sanitarios.'],
      noIncluye: [],
      notas: ['Los trabajos que impliquen romper paredes, pisos o realizar modificaciones mayores deberán evaluarse previamente.'],
    },
  },
  {
    id: 'pintura',
    nombre: 'Pintura',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: [
        'Pintado de paredes.',
        'Repintado.',
        'Retoques.',
        'Pintura de ambientes interiores.',
        'Pintura de superficies exteriores accesibles.',
        'Preparación básica de superficies.',
      ],
      noIncluye: [],
      notas: [
        'Los trabajos que requieran reparación extensa de superficies, equipos especiales o trabajos en altura deberán evaluarse previamente.',
      ],
    },
  },
  {
    id: 'albanileria',
    nombre: 'Albañilería',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: [
        'Reparaciones de paredes.',
        'Resanes.',
        'Reparaciones de pisos.',
        'Colocación o reposición de mayólicas.',
        'Trabajos menores con cemento o mortero.',
      ],
      noIncluye: [],
      notas: ['Las remodelaciones, ampliaciones o trabajos estructurales deberán ser evaluados y cotizados independientemente.'],
    },
  },
  {
    id: 'carpinteria',
    nombre: 'Carpintería',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: [
        'Reparación de puertas.',
        'Reparación de muebles.',
        'Repisas.',
        'Armarios.',
        'Ajustes.',
        'Mantenimiento de elementos de madera.',
        'Instalaciones menores de carpintería.',
      ],
      noIncluye: [],
    },
  },
  {
    id: 'cerrajeria',
    nombre: 'Cerrajería',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: ['Cerraduras.', 'Picaportes.', 'Cerrojos.', 'Manijas.', 'Reparaciones o ajustes relacionados con sistemas de cierre.'],
      noIncluye: [],
      notas: ['El cliente deberá especificar el problema antes de solicitar el servicio.'],
    },
  },
  {
    id: 'vidrieria_aluminio',
    nombre: 'Vidriería y aluminio',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    detalle: {
      incluye: [
        'Ventanas.',
        'Puertas de vidrio.',
        'Mamparas.',
        'Cambio o instalación de vidrios.',
        'Marcos y perfiles de aluminio.',
        'Sistemas corredizos.',
        'Accesorios relacionados.',
      ],
      noIncluye: [],
      notas: [
        'El cliente deberá adjuntar fotografías y, cuando corresponda, indicar las medidas aproximadas.',
        'Determinados trabajos podrán requerir una visita previa para realizar la cotización.',
      ],
    },
  },
  {
    id: 'mantenimiento_general',
    nombre: 'Mantenimiento y reparaciones generales',
    seccion: 'mantenimiento',
    requiereDescripcionTrabajo: true,
    descripcion:
      'Para arreglos pequeños de la casa que no son de un oficio. Si es de electricidad, gasfitería u otro oficio, pídelo en ese servicio.',
    detalle: {
      incluye: [
        'Colgar cuadros, espejos livianos o cortinas.',
        'Instalar accesorios livianos: percheros, ganchos, toalleros.',
        'Ajustes domésticos menores: tornillos, topes, fijaciones.',
        'Pequeños arreglos que no requieran un oficio específico.',
      ],
      noIncluye: [
        'Electricidad: enchufes, interruptores, focos, cableado.',
        'Gasfitería: grifos, fugas, desagües, inodoros, tuberías.',
        'Aire acondicionado.',
        'Cerrajería: cerraduras, chapas, candados.',
        'Pintura y trabajos de albañilería (mayólicas, resanes, cemento).',
        'Carpintería (puertas, roperos, muebles, repisas) y vidriería o aluminio.',
        'Trabajos en altura o que representen riesgo.',
      ],
      notas: [
        'Este servicio se cobra por horas. Los oficios de arriba no se pueden pedir aquí ni por horas: tienen su propio servicio y su propia forma de cobro.',
      ],
    },
  },
]

export function buscarServicio(id: string): ServicioCatalogo | undefined {
  return CATALOGO_SERVICIOS.find((s) => s.id === id)
}

export function buscarServicioPorNombre(nombre: string): ServicioCatalogo | undefined {
  return CATALOGO_SERVICIOS.find((s) => s.nombre === nombre)
}

export const NOMBRES_SERVICIOS = CATALOGO_SERVICIOS.map((s) => s.nombre)

/**
 * Formas de cobro que admite cada servicio (se filtran por las que hoy son operativas, ver modalidades.ts).
 *
 * "horas" solo figura donde cobrar por tiempo tiene sentido (limpieza, lavado, organización,
 * reparaciones generales). En oficios como electricidad, gasfitería o aire acondicionado el cobro es por
 * diagnóstico o precio fijo: mientras eso no esté operativo NO se sustituye por horas.
 *
 * El servidor tiene su propia copia (tabla servicio_modalidades de la migración 0015); una prueba
 * (catalogoServicios.test.ts) verifica que ambas coincidan.
 */
export const MODALIDADES_POR_SERVICIO: Record<string, ModalidadPrecio[]> = {
  limpieza_basica: ['horas', 'cotizacion'],
  limpieza_profunda_reorganizacion: ['horas', 'cotizacion'],
  oficinas_comercios: ['horas', 'cotizacion'],
  alojamientos_airbnb: ['horas', 'cotizacion'],
  postevento: ['horas', 'cotizacion'],
  postobra: ['horas', 'cotizacion'],
  organizacion_espacios: ['horas', 'cotizacion'],
  lavado_planchado: ['horas'],
  electricidad: ['diagnostico', 'fijo'],
  gasfiteria: ['diagnostico', 'fijo'],
  aire_acondicionado: ['diagnostico', 'fijo'],
  pintura: ['cotizacion', 'diagnostico'],
  albanileria: ['diagnostico', 'cotizacion'],
  carpinteria: ['cotizacion', 'diagnostico'],
  cerrajeria: ['fijo', 'diagnostico'],
  vidrieria_aluminio: ['cotizacion', 'diagnostico'],
  mantenimiento_general: ['horas', 'fijo'],
}

export function modalidadesDeServicio(id: string): ModalidadPrecio[] {
  return MODALIDADES_POR_SERVICIO[id] ?? ['horas']
}

/** Accesos principales del inicio. "limpieza" agrupa las 8 clasificaciones internas de limpieza. */
export const ACCESOS_PRINCIPALES = [
  { id: 'limpieza', etiqueta: 'Limpieza', icono: '🧹', servicioId: 'limpieza_basica' },
  { id: 'aire_acondicionado', etiqueta: 'Aire acondicionado', icono: '❄️', servicioId: 'aire_acondicionado' },
  { id: 'gasfiteria', etiqueta: 'Gasfitería', icono: '🚰', servicioId: 'gasfiteria' },
  { id: 'electricidad', etiqueta: 'Electricidad', icono: '💡', servicioId: 'electricidad' },
] as const

export function servicioPorId(id: string): ServicioCatalogo | undefined {
  return CATALOGO_SERVICIOS.find((s) => s.id === id)
}
