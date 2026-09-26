export interface DetalleServicio {
  incluye: string[]
  noIncluye: string[]
  notas?: string[]
}

export interface SubtipoServicio {
  id: string
  nombre: string
  detalle: DetalleServicio
}

export interface OpcionServicio {
  id: string
  nombre: string
}

export interface ServicioCatalogo {
  id: string
  nombre: string
  seccion: 'limpieza' | 'mantenimiento'
  detalle?: DetalleServicio
  subtipos?: SubtipoServicio[]
  opciones?: OpcionServicio[]
  requiereDescripcionTrabajo?: boolean
}

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
    nombre: 'Limpieza postobra pesada',
    seccion: 'limpieza',
    detalle: {
      incluye: [
        'Retiro de polvo fino generado por la obra.',
        'Limpieza de pisos y superficies.',
        'Retiro de pequeños residuos de construcción.',
        'Limpieza de restos superficiales de cemento, yeso, pintura o pegamento cuando puedan retirarse de manera segura.',
        'Limpieza de puertas, ventanas, marcos y zócalos.',
        'Limpieza de baños y ambientes intervenidos.',
        'Acondicionamiento general del espacio después de una obra o remodelación.',
      ],
      noIncluye: [
        'Retiro de desmonte pesado.',
        'Traslado de sacos de cemento, ladrillos, bloques u otros materiales pesados.',
        'Demolición.',
        'Movimiento de estructuras o equipos pesados.',
        'Trabajos peligrosos en altura.',
        'Retiro de sustancias químicas o materiales peligrosos.',
        'Trabajos que requieran maquinaria especializada.',
      ],
      notas: ['Este servicio requiere mayor esfuerzo físico y experiencia que una limpieza convencional.'],
    },
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
    opciones: [
      { id: 'solo_lavado', nombre: 'Solo lavado' },
      { id: 'lavado_secado', nombre: 'Lavado y secado' },
      { id: 'lavado_secado_doblado', nombre: 'Lavado, secado y doblado' },
      { id: 'solo_planchado', nombre: 'Solo planchado' },
      { id: 'lavado_planchado', nombre: 'Lavado y planchado' },
    ],
    detalle: {
      incluye: [],
      noIncluye: ['No se incluyen prendas que requieran limpieza profesional especializada.'],
      notas: [
        'El cliente deberá informar si existen prendas delicadas o que requieran cuidados especiales.',
        'Durante la reserva deberá indicarse si el domicilio dispone de lavadora, secadora, plancha y demás equipos necesarios.',
        'También deberá definirse quién proporcionará los productos de lavado.',
      ],
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
    detalle: {
      incluye: [
        'Ajustes domésticos.',
        'Instalaciones sencillas.',
        'Fijación de accesorios.',
        'Pequeñas reparaciones.',
        'Otros trabajos menores que no requieran una especialidad técnica específica.',
      ],
      noIncluye: [],
      notas: [
        'Si el trabajo corresponde claramente a electricidad, gasfitería, pintura, albañilería, carpintería, cerrajería o vidriería y aluminio, deberá solicitarse dentro de la especialidad correspondiente.',
      ],
    },
  },
]

export function buscarServicio(id: string): ServicioCatalogo | undefined {
  return CATALOGO_SERVICIOS.find((s) => s.id === id)
}

export const NOMBRES_SERVICIOS = CATALOGO_SERVICIOS.map((s) => s.nombre)
