// ============================================================
// TRIPULSE — El tutorial guiado: el catálogo y sus reglas
// ============================================================
// UN SOLO SITIO PARA TODOS LOS TEXTOS. Son los del guion que aprobó el usuario
// el 16-10-2026 (doc «Guion del tutorial de TRIPULSE»). Si se cambia un texto,
// se cambia aquí y en el guion.
//
// Cómo funciona:
// - Cada zona es una pantalla. Sus `pasos` la enseñan: cada uno hace brillar
//   el elemento que lleva `data-guia="<ancla>"`. Un paso sin ancla sale en el
//   centro. Un paso cuya ancla no está en pantalla se salta solo.
// - Las nueve primeras zonas, en orden, son el recorrido del primer día
//   (CAMINO). Su `salida` lleva a la siguiente parada; solo se añade la
//   primera vez o al «Seguir el recorrido», nunca al repetir con el botón ?.
// - Un paso con `accion` espera a que pulse lo que brilla (con «Hazlo por mí»
//   de reserva). Si además lleva `sale`, ese clic cambia de pantalla y el
//   recorrido de la zona termina ahí.
// - Quién lo ve solo: los entrenadores nuevos. A los que ya usaban la app se
//   les ofrece con una tarjeta; nunca les salta nada solo (decidido el
//   16-10-2026). Todos lo tienen con el botón ? y en 🎓 Tutoriales.
//
// Hay un test que comprueba que cada ancla de aquí existe en el código.

export type ZonaTutorial =
  | 'bienvenida' | 'panel' | 'deportistas' | 'ficha' | 'tests'
  | 'vistas' | 'lienzo' | 'calendario' | 'sesion'

export interface PasoTutorial {
  /** `data-guia` del elemento que brilla. Sin ancla, el pop-up sale en el centro. */
  ancla?: string
  titulo: string
  texto: string
  /** Espera a que pulse lo que brilla. */
  accion?: boolean
  /** Ese clic cambia de pantalla: el recorrido de esta zona acaba ahí. */
  sale?: boolean
  /** Texto del botón principal cuando no es «Siguiente» ni «Terminar». */
  primero?: string
  ultimo?: string
  /** Texto del botón de saltar cuando no es «Saltar». */
  saltar?: string
}

export interface ZonaDelTutorial {
  id: ZonaTutorial
  nombre: string
  pasos: PasoTutorial[]
  /** Hacia la siguiente parada (o el cierre, en la última). */
  salida?: PasoTutorial[]
  /** La que empieza sola al terminar esta. */
  despues?: ZonaTutorial
  /** Vídeo corto que sale en el primer pop-up que se enseñe de la zona. */
  video?: string
}

/** El recorrido del primer día, en orden. */
export const CAMINO: ZonaTutorial[] = [
  'bienvenida', 'panel', 'deportistas', 'ficha', 'tests', 'vistas', 'lienzo', 'calendario', 'sesion',
]

/** Desde cuándo una cuenta cuenta como nueva: a las de antes no les salta nada solo. */
export const TUTORIAL_DESDE = '2026-10-16T00:00:00Z'

export const ZONAS: Record<ZonaTutorial, ZonaDelTutorial> = {
  bienvenida: {
    id: 'bienvenida', nombre: 'Bienvenida', despues: 'panel',
    pasos: [
      { titulo: 'Te damos la bienvenida, {nombre}', texto: 'Te llevamos por las partes principales de la app, una detrás de otra, y en cada una te enseñamos cómo funciona. Puedes parar cuando quieras y seguir otro día.', primero: 'Empezar', saltar: 'Ahora no' },
      { ancla: 'menu', titulo: 'Todo está en el menú', texto: 'Deportistas, planificación, tests, wellness… Pulsa TRIPULSE para abrirlo desde cualquier pantalla. Abajo del todo están los tutoriales.' },
      { ancla: 'ayuda', titulo: 'Si te lo saltas, está aquí', texto: 'El botón ? repite el recorrido de la pantalla en la que estás. Las partes avanzadas solo lo tienen aquí, para no llenarte de avisos.', ultimo: 'Empezar por mi panel →' },
    ],
  },

  panel: {
    id: 'panel', nombre: 'Panel',
    pasos: [
      { ancla: 'panel.primeros', titulo: 'Lo que te falta para arrancar', texto: 'Los pasos que te quedan para tenerlo todo en marcha: invitar a tu primer deportista y crear su plan. Cuando los completas, desaparece.' },
      { ancla: 'panel.hoy', titulo: 'Hoy entrenan', texto: 'Las sesiones de hoy de todo tu equipo. Con «Dirigir» apuntas tiempos y notas a pie de pista mientras entrena.' },
      { ancla: 'panel.elegir', titulo: '¿Con quién trabajamos hoy?', texto: 'Pulsa a un deportista para abrir su panel. El punto de color es su estado y el número naranja, sus mensajes sin leer.' },
      { ancla: 'panel.equipo', titulo: 'Cómo fue la semana de cada uno', texto: 'La semana pasada de todo tu equipo de un vistazo, sin entrar uno por uno.' },
      { ancla: 'panel.primer-deportista', accion: true, titulo: 'Abre el panel de {deportista}', texto: 'Pulsa su cara para entrar.' },
      { ancla: 'panel.atleta', titulo: 'Con quién trabajas', texto: 'El panel es de un deportista cada vez, y se queda elegido en toda la app: Tests, Carga o Wellness se abren ya con sus datos. Para cambiar, pulsa su nombre.' },
      { ancla: 'panel.semana', titulo: 'Su semana, de un vistazo', texto: 'Cada raya es una sesión, del color de su deporte, y a la izquierda los días que faltan para su competición. Púlsala para entrar en su planificación.' },
      { ancla: 'panel.kpis', titulo: 'Cómo está', texto: 'Bienestar, carga, volumen e índices de los últimos días. Cada tarjeta abre su pantalla con el detalle.' },
      { ancla: 'panel.atencion', titulo: 'Lo que pide tu atención', texto: 'Avisos que salen de sus datos. Con «＋ añadir a tareas» guardas el que quieras resolver luego.' },
      { ancla: 'panel.tareas', titulo: 'Tus tareas', texto: 'Apunta lo que tienes pendiente con cada deportista y márcalo cuando lo hagas.' },
      { ancla: 'panel.herramientas', titulo: 'Todo lo demás, aquí', texto: 'Deportistas, comunicación, biblioteca, cobros, tests y zonas propias: todo a un clic desde este desplegable.' },
      { ancla: 'novedades', titulo: 'Qué hay de nuevo', texto: 'Cada cambio en la app se cuenta aquí. Si cambia algún número que ve tu atleta, te decimos cuál y por qué.' },
    ],
    salida: [
      /* Sin deportistas todavía: el atajo de «Primeros pasos». Con deportistas no
         existe, se salta, y la salida va por el menú. */
      { ancla: 'panel.ir-deportistas', accion: true, sale: true, titulo: 'Siguiente parada: Deportistas', texto: 'Pulsa «Ir a Deportistas».' },
      { ancla: 'menu', accion: true, titulo: 'Siguiente parada: Deportistas', texto: 'Abre el menú: pulsa TRIPULSE.' },
      { ancla: 'menu.deportistas', accion: true, sale: true, titulo: 'Entra en Deportistas', texto: 'Aquí tienes a toda tu gente.' },
    ],
  },

  deportistas: {
    id: 'deportistas', nombre: 'Deportistas',
    pasos: [
      { ancla: 'dep.nuevo', titulo: 'Añade a tus deportistas', texto: '«Nuevo deportista» crea su ficha. Con su fecha de nacimiento ya calcula su FC máxima estimada, y puedes planificarle aunque todavía no tenga cuenta.' },
      { ancla: 'dep.invitar', titulo: 'Dale su propia cuenta', texto: '«Invitar» crea un enlace para mandárselo. Con su cuenta ve su plan, apunta lo que hace y te manda el wellness.' },
      { ancla: 'dep.grupo', titulo: '¿Entrenas a varios juntos?', texto: 'Un grupo se planifica una vez y se vuelca al calendario de cada uno. También sirve para pasar tests a gente que no es tuya, sin gastar cupo.' },
      { ancla: 'dep.quitar', titulo: 'Quitar a alguien', texto: 'Si tiene cuenta, se desvincula y conserva su historial. Si es una ficha tuya, se borra entera, y te pide escribir su nombre.' },
      { ancla: 'dep.evaluados', titulo: 'La gente de los tests', texto: 'A quien solo le pasaste un test. No entra en tu panel ni en tu cupo, pero sus resultados se guardan.' },
    ],
    salida: [
      { ancla: 'dep.perfil', accion: true, sale: true, titulo: 'Siguiente parada: la ficha de {deportista}', texto: 'Pulsa «Ver perfil» para abrirla.' },
    ],
  },

  ficha: {
    id: 'ficha', nombre: 'Ficha del deportista',
    pasos: [
      { ancla: 'ficha.foto', titulo: 'Sus datos, a un toque', texto: 'Pulsa su foto para ver todos sus datos personales.' },
      { ancla: 'ficha.pastillas', titulo: 'Lo importante, arriba', texto: 'Su bienestar, su frescura (TSB) y, si los tiene, sus antecedentes médicos. Léelos antes de planificar.' },
      { ancla: 'ficha.pestanas', titulo: 'Todo lo suyo, en seis pestañas', texto: 'Estado, Zonas y tests, Entrenamiento, Disponibilidad, Anamnesis y Material, donde llevas sus zapatillas y bicis con los kilómetros.' },
      { ancla: 'ficha.editar', titulo: 'Sus datos de base', texto: 'FC máxima, FC de reposo y HRV basal. Sin la FC máxima no salen sus zonas por pulso, y con la de reposo se afinan.' },
      { ancla: 'ficha.planificacion', titulo: 'De aquí, a planificar', texto: 'Planificación abre su temporada, y Calendario, sus sesiones día a día.' },
    ],
    salida: [
      { ancla: 'ficha.pestana-zonas', accion: true, titulo: 'Siguiente parada: sus tests', texto: 'Abre la pestaña «Zonas y tests».' },
      { ancla: 'ficha.sistema-zonas', titulo: 'Sus zonas salen de sus tests', texto: 'Aquí ves con qué sistema de zonas trabaja y sus zonas activas, con sus ritmos y pulsos.' },
      { ancla: 'ficha.ver-tests', accion: true, sale: true, titulo: 'Entra en sus tests', texto: 'Pulsa «Ver todos los tests».' },
    ],
  },

  tests: {
    id: 'tests', nombre: 'Tests y zonas',
    pasos: [
      { ancla: 'tests.estado', titulo: 'Cómo está ahora', texto: 'El último valor de cada test, con una flecha si ha mejorado o empeorado desde el anterior.' },
      { ancla: 'tests.intensidades', titulo: 'Sus zonas, listas para usar', texto: '«Ver intensidades» te da el ritmo, el pulso o los vatios de cada zona para prescribir.' },
      { ancla: 'tests.pestanas', titulo: 'Una pestaña por disciplina', texto: 'Carrera, natación, ciclismo, fuerza y triatlón. En Movimiento se analizan en vídeo el FMS y el Nine Test.' },
      { ancla: 'tests.lista', titulo: 'Pulsa el test que vas a pasar', texto: 'Los que llevan ZONAS fijan sus zonas. El punto naranja dice que puedes dirigirlo en vivo, con cronómetro y pitidos.' },
      { ancla: 'tests.grafica', titulo: 'Cómo evoluciona', texto: 'Cada test que apuntas se suma aquí, para ver si mejora.' },
      { ancla: 'tests.otros', titulo: 'Lo que no está en la batería', texto: 'Un test que no está en la lista se apunta aquí a mano.' },
    ],
    salida: [
      { ancla: 'menu', accion: true, titulo: 'Siguiente parada: Planificación', texto: 'Abre el menú otra vez.' },
      { ancla: 'menu.planificacion', accion: true, sale: true, titulo: 'Entra en Planificación', texto: 'Es donde se construye su temporada.' },
    ],
  },

  vistas: {
    id: 'vistas', nombre: 'Planificación',
    pasos: [
      { ancla: 'vistas.bloques', titulo: 'Bloques: la estructura clásica', texto: 'Macrociclo, mesociclo, semana y sesión, uno dentro de otro, con la carga real encima.' },
      { ancla: 'vistas.calendario', titulo: 'Calendario: el día a día', texto: 'Todas sus sesiones en un mes, por día y disciplina. Se crean, se mueven arrastrando y se copian.' },
      { ancla: 'vistas.lienzo', titulo: 'Periodización: dibuja la temporada', texto: 'Dibujas la carga a mano, marcas las fases y colocas las zonas de cada semana. Es por donde se empieza.' },
    ],
    salida: [
      { ancla: 'vistas.lienzo', accion: true, sale: true, titulo: 'Siguiente parada: el lienzo', texto: 'Pulsa Periodización para entrar.' },
    ],
  },

  lienzo: {
    id: 'lienzo', nombre: 'Lienzo de periodización', video: '/planificacion/canvas.mp4',
    pasos: [
      { ancla: 'lienzo.inicio', titulo: 'Empieza por la fecha', texto: 'Pon cuándo empieza su temporada. Luego dibujas arrastrando sobre el lienzo.' },
      { ancla: 'lienzo.lienzo', titulo: 'Dibuja los bloques', texto: 'Arrastra para crear macrociclos y mesociclos. Arrastrando uno lo mueves; con doble clic lo editas.' },
      { ancla: 'lienzo.carga', titulo: 'La carga de cada semana', texto: 'Sube o baja cada barra arrastrándola: es la carga que quieres para esa semana.' },
      { ancla: 'lienzo.semana', titulo: 'Las sesiones de cada semana', texto: 'En cada semana eliges las zonas que tocan, y cada una es un chip. Pulsa varias, o la misma dos veces para repetirla.' },
      { ancla: 'lienzo.competicion', titulo: 'Su competición', texto: 'Márcala aquí y elige si quieres taper antes.' },
      { ancla: 'lienzo.meso', titulo: 'Un mesociclo de cerca', texto: 'Púlsalo y elige «Vista de ciclo»: su calendario, su carga y cómo se reparten las zonas.' },
      { ancla: 'lienzo.capas', titulo: 'Qué ves encima', texto: 'La curva teórica, la tendencia y las capas. Enciende solo lo que te ayude.' },
      { ancla: 'lienzo.generar', titulo: 'Pásalo al calendario', texto: 'El dibujo se guarda solo, pero el calendario no se entera hasta que pulsas «Generar planificación». Después, cada cambio se pasa con «Actualizar planificación».' },
      { ancla: 'lienzo.exportar', titulo: 'Llévatelo', texto: 'Descárgalo como imagen o como informe PDF para enseñárselo a tu atleta.' },
    ],
    salida: [
      { ancla: 'lienzo.calendario', accion: true, sale: true, titulo: 'Siguiente parada: el calendario', texto: 'Pulsa Calendario para ver sus sesiones día a día.' },
    ],
  },

  calendario: {
    id: 'calendario', nombre: 'Calendario', video: '/planificacion/calendario.mp4',
    pasos: [
      { ancla: 'cal.vistas', titulo: 'Cuatro formas de verlo', texto: 'Un mes, por mesociclos, por semanas o en lista. Elige la que te sirva.' },
      { ancla: 'cal.dia', titulo: 'Crea una sesión', texto: 'Pulsa un día para añadirle una sesión.' },
      { ancla: 'cal.sesion', titulo: 'Muévela o cópiala', texto: 'Arrástrala a otro día para moverla. Con 📋 la copias, y luego pulsas el día donde va.' },
      { ancla: 'cal.copiar-semana', titulo: 'Copia una semana entera', texto: 'Con 📋sem copias la semana completa y la pegas donde quieras.' },
      { ancla: 'cal.plantillas', titulo: 'Sesiones ya hechas', texto: 'Elige una plantilla y pulsa el día donde la quieres.' },
      { ancla: 'cal.mover', titulo: 'Mover el plan', texto: 'Desplaza la temporada, un mesociclo o una semana con todas sus sesiones, o cambia lo que dura un mesociclo.' },
      { ancla: 'cal.bloquear', titulo: 'Semanas sin entrenar', texto: 'Marca una semana en la que no puede entrenar, por un viaje o una lesión.' },
      { ancla: 'cal.competicion', titulo: 'Sus competiciones', texto: 'Añade una competición con su tipo de prueba: sale en su calendario y en el del atleta.' },
    ],
    salida: [
      { ancla: 'cal.sesion', accion: true, sale: true, titulo: 'Siguiente parada: una sesión por dentro', texto: 'Pulsa una sesión para abrirla.' },
    ],
  },

  sesion: {
    id: 'sesion', nombre: 'Montar una sesión',
    pasos: [
      { ancla: 'sesion.duracion', titulo: 'Lo que dura', texto: 'Se calcula sola con sus zonas y sus tests. Si no te cuadra, la ajustas a mano, y con ↺ vuelve a la estimada.' },
      { ancla: 'sesion.defecto', titulo: 'Lo que se repite, una vez', texto: 'Lo que pongas aquí se rellena solo en cada fila nueva: el control y la intensidad «@».' },
      { ancla: 'sesion.fila', titulo: 'Cada fila es una tarea', texto: 'Zona, series, distancia o tiempo, descanso e intensidad. La intensidad «@» sale de sus tests: ritmo, pulso o vatios.' },
      { ancla: 'sesion.anadir', titulo: 'Añade más', texto: 'Cada tarea nueva entra al final. Arrastrando una fila la cambias de sitio.' },
      { ancla: 'sesion.guardar', titulo: 'Guárdalas de una vez', texto: 'Las filas nuevas o cambiadas se guardan juntas, en el orden en que las ves.' },
      { ancla: 'sesion.semana', titulo: 'El resto de su semana', texto: 'Las demás sesiones de la semana, para copiar tareas o saltar a otra sin volver al calendario.' },
      { ancla: 'sesion.plantillas', titulo: 'No empieces de cero', texto: 'Coge una sesión ya montada y ajústala.' },
      { ancla: 'sesion.dirigir', titulo: 'A pie de pista', texto: 'Con «Dirigir» apuntas sus tiempos y notas mientras entrena, serie a serie.' },
    ],
    /* La última parada no lleva a ninguna: cierra el recorrido. */
    salida: [
      { titulo: 'Ya conoces lo básico', texto: 'El resto de partes tienen su recorrido en el botón ?, y los tienes todos en 🎓 Tutoriales, abajo del menú.', ultimo: 'Terminar' },
    ],
  },
}

/* ---------------------------------------------------------------
   Lo que se recuerda de cada persona (lo carga lib/tutorial-progreso)
   --------------------------------------------------------------- */

export interface Progreso {
  vistos: Set<string>
  saltados: Set<string>
  /** Dijo «Ahora no» (o «No, gracias» a la tarjeta): nada sale solo. */
  pausado: boolean
  /** Lo que contestó a la tarjeta quien ya usaba la app. */
  oferta: 'aceptada' | 'rechazada' | null
  /** Si la tabla no está (o no se pudo leer), no se puede recordar nada y nada sale solo. */
  disponible: boolean
}

export function progresoVacio(disponible = true): Progreso {
  return { vistos: new Set(), saltados: new Set(), pausado: false, oferta: null, disponible }
}

/** La siguiente parada del recorrido, o null en la última. */
export function siguienteParada(zona: ZonaTutorial): ZonaTutorial | null {
  const i = CAMINO.indexOf(zona)
  return i >= 0 && i < CAMINO.length - 1 ? CAMINO[i + 1] : null
}

/** Los pasos de un recorrido: los de la zona y, si va por el camino, su salida. */
export function pasosDeRecorrido(
  zona: ZonaTutorial,
  { camino, vistos }: { camino: boolean; vistos: Set<string> },
): PasoTutorial[] {
  const z = ZONAS[zona]
  const pasos = [...z.pasos]
  if (camino && z.salida) {
    const sig = siguienteParada(zona)
    /* A una parada ya vista no se lleva a nadie de vuelta; la última cierra. */
    if (!sig || !vistos.has(sig)) pasos.push(...z.salida)
  }
  return pasos
}

/** ¿Pueden salir recorridos solos? Solo a los nuevos, o a quien aceptó la tarjeta. */
export function guiaAutomatica(p: Progreso, esNuevo: boolean): boolean {
  return p.disponible && !p.pausado && (esNuevo || p.oferta === 'aceptada')
}

/** ¿Arranca sola esta zona al entrar? */
export function arrancaSola(zona: ZonaTutorial, p: Progreso, esNuevo: boolean): boolean {
  return guiaAutomatica(p, esNuevo) && !p.vistos.has(zona) && !p.saltados.has(zona)
}

/** La pantalla de cada zona. Los tests de un grupo y el dirigir en vivo no son zonas. */
export function zonaDeRuta(ruta: string): ZonaTutorial | null {
  const r = ruta.replace(/\/+$/, '') || '/'
  if (r === '/dashboard') return 'panel'
  if (r === '/deportistas') return 'deportistas'
  if (/^\/deportistas\/[^/]+$/.test(r)) return 'ficha'
  if (/^\/tests\/[^/]+$/.test(r) && r !== '/tests/dirigir') return 'tests'
  if (/^\/planificacion-visual\/[^/]+$/.test(r)) return 'vistas'
  if (/^\/planificacion-visual\/[^/]+\/dibujo$/.test(r)) return 'lienzo'
  if (/^\/planificacion-visual\/[^/]+\/calendario$/.test(r)) return 'calendario'
  if (/^\/sesion\/[^/]+$/.test(r)) return 'sesion'
  return null
}

/** La zona que arranca sola al entrar en esta pantalla, o null. En el Panel, la bienvenida va antes. */
export function zonaAlEntrar(ruta: string, p: Progreso, esNuevo: boolean): ZonaTutorial | null {
  const z = zonaDeRuta(ruta)
  if (!z) return null
  if (z === 'panel' && arrancaSola('bienvenida', p, esNuevo)) return 'bienvenida'
  return arrancaSola(z, p, esNuevo) ? z : null
}

/** La tarjeta del Panel solo es para quien ya usaba la app y aún no contestó. */
export function mostrarOferta(p: Progreso, esNuevo: boolean): boolean {
  return p.disponible && !esNuevo && p.oferta === null
}

/** La primera parada del recorrido que aún no ha visto. */
export function siguienteDelCamino(p: Progreso): ZonaTutorial | null {
  return CAMINO.find(z => !p.vistos.has(z)) ?? null
}

/** Dónde se ve cada zona. Las que dependen de un deportista necesitan el elegido; la sesión, abrir una. */
export function rutaDeZona(zona: ZonaTutorial, idDeportista: number | null): string | null {
  switch (zona) {
    case 'bienvenida':
    case 'panel': return '/dashboard'
    case 'deportistas': return '/deportistas'
    case 'sesion': return null
    default:
      if (!idDeportista) return null
      if (zona === 'ficha') return '/deportistas/' + idDeportista
      if (zona === 'tests') return '/tests/' + idDeportista
      if (zona === 'vistas') return '/planificacion-visual/' + idDeportista
      if (zona === 'lienzo') return '/planificacion-visual/' + idDeportista + '/dibujo'
      return '/planificacion-visual/' + idDeportista + '/calendario'
  }
}

/** ¿Se creó la cuenta cuando ya existía el tutorial? */
export function esCuentaNueva(creadaEn: string | null | undefined, desde: string = TUTORIAL_DESDE): boolean {
  if (!creadaEn) return false
  const t = Date.parse(creadaEn)
  return Number.isFinite(t) && t >= Date.parse(desde)
}

/**
 * Pone los nombres en el texto. Si falta uno no queda un hueco raro:
 * «la bienvenida, {nombre}» se queda en «la bienvenida» y {deportista} pasa a
 * «tu deportista».
 */
export function rellenar(texto: string, valores: { nombre?: string | null; deportista?: string | null }): string {
  const nombre = (valores.nombre || '').trim()
  const deportista = (valores.deportista || '').trim()
  return texto
    .replace(/,\s*\{nombre\}/g, nombre ? ', ' + nombre : '')
    .replace(/\{nombre\}/g, nombre)
    .replace(/\{deportista\}/g, deportista || 'tu deportista')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
