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
// - Quién lo ve solo: las cuentas nuevas. A los que ya usaban la app se les
//   ofrece con una tarjeta; nunca les salta nada solo (decidido el
//   16-10-2026). Todos lo tienen con el botón ? y en 🎓 Tutoriales.
// - El deportista (fase 4) tiene su propio recorrido (CAMINO_DEPORTISTA) y
//   sus propias zonas, que empiezan por «d-». La misma pantalla (/perfil,
//   /sesion/…) es otra zona para él: zonaDeRuta mira el rol.
//
// Hay un test que comprueba que cada ancla de aquí existe en el código.

import { hoyISO, lunesDe } from './fechas'

export type ZonaTutorial =
  | 'bienvenida' | 'panel' | 'deportistas' | 'ficha' | 'tests'
  | 'vistas' | 'lienzo' | 'calendario' | 'sesion'
  /* Las avanzadas (fase 3): solo con el botón ? o desde 🎓 Tutoriales. */
  | 'herramientas' | 'bloques' | 'semana' | 'planificador' | 'grupo' | 'wellness'
  | 'carga' | 'volumen' | 'sicat' | 'indices' | 'comunicacion' | 'biblioteca' | 'asistente'
  | 'tests-propios' | 'zonas-propias' | 'cobros' | 'perfil' | 'papelera'
  /* El deportista (fase 4): su recorrido del primer día y las suyas con el botón ?. */
  | 'd-bienvenida' | 'd-hoy' | 'd-sesiones' | 'd-sesion' | 'd-wellness' | 'd-analisis'
  | 'd-apuntar' | 'd-entreno' | 'd-tests' | 'd-chat' | 'd-disponibilidad' | 'd-perfil'
  | 'd-anamnesis' | 'd-mi-plan' | 'd-comunidad'

/** Quién hace el recorrido: cada uno tiene el suyo. */
export type RolTutorial = 'entrenador' | 'deportista'

export interface PasoTutorial {
  /** `data-guia` del elemento que brilla. Sin ancla, el pop-up sale en el centro. */
  ancla?: string
  titulo: string
  texto: string
  /** Espera a que pulse lo que brilla. */
  accion?: boolean
  /** Ese clic cambia de pantalla: el recorrido de esta zona acaba ahí. */
  sale?: boolean
  /** La parada a la que lleva, cuando no es la siguiente (se salta una que aún no puede ver). */
  va?: ZonaTutorial
  /** Texto del botón principal cuando no es «Siguiente» ni «Terminar». */
  primero?: string
  ultimo?: string
  /** Texto del botón de saltar cuando no es «Saltar». */
  saltar?: string
  /** Solo en el móvil (la barra de abajo) o solo en el ordenador (el menú). */
  solo?: 'movil' | 'ordenador'
  /** Solo para quien tiene entrenador, o para quien entrena sin él (Mi plan). */
  si?: 'con-entrenador' | 'sin-entrenador'
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
  /** En el botón ? de una pantalla con dos recorridos: cómo se llama esta opción y qué enseña. */
  etiquetaAyuda?: string
  resumen?: string
}

/** El recorrido del primer día, en orden. */
export const CAMINO: ZonaTutorial[] = [
  'bienvenida', 'panel', 'deportistas', 'ficha', 'tests', 'vistas', 'lienzo', 'calendario', 'sesion',
]

/** Las avanzadas, agrupadas como en el guion, para 🎓 Tutoriales. Una pantalla, un recorrido. */
export const GRUPOS_AVANZADOS: { titulo: string; zonas: ZonaTutorial[] }[] = [
  { titulo: 'Montar una sesión', zonas: ['herramientas'] },
  { titulo: 'Bloques y vista de semana', zonas: ['bloques', 'semana'] },
  { titulo: 'Planificador', zonas: ['planificador'] },
  { titulo: 'Grupos', zonas: ['grupo'] },
  { titulo: 'Wellness', zonas: ['wellness'] },
  { titulo: 'Carga, Volumen, SICAT e Índices', zonas: ['carga', 'volumen', 'sicat', 'indices'] },
  { titulo: 'Comunicación', zonas: ['comunicacion'] },
  { titulo: 'Biblioteca de Fuerza', zonas: ['biblioteca'] },
  { titulo: 'Asistente IA', zonas: ['asistente'] },
  { titulo: 'Tests propios y zonas propias', zonas: ['tests-propios', 'zonas-propias'] },
  { titulo: 'Cobros, Perfil y Papelera', zonas: ['cobros', 'perfil', 'papelera'] },
]

export const AVANZADAS: ZonaTutorial[] = GRUPOS_AVANZADOS.flatMap(g => g.zonas)

/** El recorrido del primer día del deportista (fase 4). «Más» va como salida de la última. */
export const CAMINO_DEPORTISTA: ZonaTutorial[] = ['d-bienvenida', 'd-hoy', 'd-sesiones', 'd-sesion', 'd-wellness', 'd-analisis']

/** Las del deportista que solo salen con el botón ?. */
export const AVANZADAS_DEPORTISTA: ZonaTutorial[] = [
  'd-apuntar', 'd-entreno', 'd-tests', 'd-chat', 'd-disponibilidad', 'd-perfil', 'd-anamnesis', 'd-mi-plan', 'd-comunidad',
]

export const caminoDe = (rol: RolTutorial): ZonaTutorial[] => (rol === 'deportista' ? CAMINO_DEPORTISTA : CAMINO)
export const avanzadasDe = (rol: RolTutorial): ZonaTutorial[] => (rol === 'deportista' ? AVANZADAS_DEPORTISTA : AVANZADAS)
/** La bienvenida de cada uno: va antes que su primera pantalla. */
export const bienvenidaDe = (rol: RolTutorial): ZonaTutorial => (rol === 'deportista' ? 'd-bienvenida' : 'bienvenida')

/** Las avanzadas nunca salen solas: solo con el botón ? o desde la lista (decidido el 15-10-2026). */
export const esAvanzada = (z: ZonaTutorial): boolean => AVANZADAS.includes(z) || AVANZADAS_DEPORTISTA.includes(z)

/** La bienvenida: su «Ahora no» del primer paso deja todo para el botón ?. */
export const esBienvenida = (z: ZonaTutorial): boolean => z === 'bienvenida' || z === 'd-bienvenida'

/** El camino al que pertenece una parada, del entrenador o del deportista. */
const caminoDeZona = (z: ZonaTutorial): ZonaTutorial[] | null =>
  CAMINO.includes(z) ? CAMINO : CAMINO_DEPORTISTA.includes(z) ? CAMINO_DEPORTISTA : null

/** «Parada 3 de 9»: el número de una parada en su camino, o null si no es una parada. */
export function numeroDeParada(z: ZonaTutorial): { n: number; de: number } | null {
  const c = caminoDeZona(z)
  return c ? { n: c.indexOf(z) + 1, de: c.length } : null
}

/** Desde cuándo una cuenta cuenta como nueva: a las de antes no les salta nada solo. */
export const TUTORIAL_DESDE = '2026-10-16T00:00:00Z'
/** Lo mismo para el deportista: el día que se sube su recorrido (fase 4). */
export const TUTORIAL_DEPORTISTA_DESDE = '2026-10-16T00:00:00Z'

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
      { ancla: 'ficha.editar', titulo: 'Sus datos de base', texto: 'FC máxima, HRV basal y su técnica en cada deporte, que es su valoración técnica. Sin la FC máxima no salen sus zonas por pulso.' },
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
    etiquetaAyuda: 'Lo básico', resumen: 'Cómo se monta: sus filas, lo que dura y cómo se guarda.',
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

  /* ---------------------------------------------------------------
     Zonas avanzadas (fase 3): solo con el botón ? o desde 🎓 Tutoriales,
     nunca solas. Sin salida. Un paso cuya ancla no está en pantalla (el
     brick en una sesión que no lo es, «Corregir» en una sin hacer…) se
     quita al empezar, para que el «x de n» diga la verdad.
     --------------------------------------------------------------- */

  herramientas: {
    id: 'herramientas', nombre: 'Herramientas de la sesión',
    etiquetaAyuda: 'Herramientas', resumen: 'Bloques, serie a serie, días de test, bricks, nutrición y corregir lo que apuntó.',
    pasos: [
      /* El guion juntaba aquí dos botones: el 🔁 de resistencia y la casilla de fuerza. */
      { ancla: 'herr.bloques', titulo: 'Series en bloques', texto: 'Repite una tarea en bloques: 3 × (2 × 400). El descanso entre bloques va aparte del de entre series.' },
      { ancla: 'herr.agrupar', titulo: 'Varias en un bloque', texto: 'Marca varias filas y agrúpalas en un bloque: por rondas, AMRAP, EMOM, For time o Tabata.' },
      { ancla: 'herr.serie', titulo: 'Cada serie, distinta', texto: 'Escribe las repeticiones, el peso y el esfuerzo de cada serie. Tu deportista lo ve igual.' },
      { ancla: 'herr.ultima', titulo: 'Lo que hizo la última vez', texto: 'En cada ejercicio ves lo que levantó la última vez, para decidir el de hoy.' },
      { ancla: 'herr.zonas', titulo: 'Tus zonas en una tarea', texto: 'Cada tarea puede usar tus zonas propias en vez de las de la app.' },
      { ancla: 'herr.info', titulo: 'Cómo va su semana', texto: 'Series por grupo muscular, horas y cuánto va suave, mientras decides qué mandar.' },
      { ancla: 'herr.test', titulo: 'Día de test', texto: 'Convierte la sesión en un test: tu deportista lo abre ya montado.' },
      { ancla: 'herr.brick', titulo: 'Bricks', texto: 'Encadenas disciplinas con sus transiciones, y cada bloque cuenta en su deporte.' },
      { ancla: 'herr.nutricion', titulo: 'Qué come y bebe', texto: 'Lo que debe tomar antes, durante y después de esta sesión.' },
      { ancla: 'herr.corregir', titulo: 'Si apuntó algo mal', texto: 'Lo corriges tú: dala por hecha, corrige lo que apuntó o devuélvela a planificada.' },
    ],
  },

  bloques: {
    id: 'bloques', nombre: 'Bloques',
    pasos: [
      { ancla: 'bloq.capas', titulo: 'Por capas', texto: 'Macrociclo, mesociclo y semana, uno dentro de otro. Pulsa uno para entrar.' },
      { ancla: 'bloq.crear', titulo: 'Crea a mano', texto: 'Si prefieres no dibujar, aquí creas cada bloque a mano.' },
      { ancla: 'bloq.carga', titulo: 'Lo planeado y lo hecho', texto: 'La carga real se pinta encima de la planificada.' },
    ],
  },

  semana: {
    id: 'semana', nombre: 'Vista de semana',
    pasos: [
      { ancla: 'sem.pool', titulo: 'Esperando su día', texto: 'Lo que dibujaste en el lienzo espera aquí. Arrástralo a un día para crear la sesión.' },
      { ancla: 'sem.fusionar', titulo: 'Varias en una', texto: 'Marca varias y fusiónalas en una sesión compleja.' },
      { ancla: 'sem.dias', titulo: '¿Te equivocaste de día?', texto: 'Arrastra una sesión de vuelta arriba y vuelve a esperar su día. Las hechas no vuelven.' },
    ],
  },

  planificador: {
    id: 'planificador', nombre: 'Planificador',
    pasos: [
      { ancla: 'plan.deportista', titulo: 'Para quién', texto: 'Monta una semana para el deportista que elijas.' },
      { ancla: 'plan.forma', titulo: 'Cómo la quieres', texto: 'Eliges la forma y la monta con sus reglas: duro y fácil, el reparto entre deportes y los días que tiene.' },
      { ancla: 'plan.porque', titulo: 'Por qué cae ahí', texto: 'Cada sesión explica por qué va ese día.' },
      { ancla: 'plan.retocar', titulo: 'Retócala', texto: 'Cambia o quita lo que quieras. Lo que tocas queda marcado como tuyo.' },
      { ancla: 'plan.reglas', titulo: 'Compárala', texto: 'Si la ajustó la IA, ves la que montaron las reglas solas.' },
      { ancla: 'plan.volcar', titulo: 'Pásala a su calendario', texto: 'Hasta que no la vuelcas, no se crea nada en su calendario.' },
    ],
  },

  grupo: {
    id: 'grupo', nombre: 'Grupos',
    pasos: [
      { ancla: 'grupo.miembros', titulo: 'Los miembros', texto: 'Quién está en el grupo y cómo va cada sesión: hecha, cancelada, sin hacer o no mandada.' },
      { ancla: 'grupo.plan', titulo: 'Se planifica como una persona', texto: 'El grupo tiene su calendario y su lienzo. Lo que planificas se manda a cada miembro.' },
      { ancla: 'grupo.traer', titulo: 'Alguien nuevo en el grupo', texto: 'Le copia lo que el grupo tiene planificado de hoy en adelante.' },
      { ancla: 'grupo.zonas', titulo: 'Las zonas del grupo', texto: 'Mira qué sistema de zonas usan sus miembros y pone el grupo igual.' },
      { ancla: 'grupo.dia', titulo: 'Lo de hoy, en una pantalla', texto: 'Qué toca hoy y los ritmos de cada uno.' },
      { ancla: 'grupo.test', titulo: 'Un test para todos', texto: 'Mete los resultados de todo el grupo de una vez.' },
    ],
  },

  wellness: {
    id: 'wellness', nombre: 'Wellness',
    pasos: [
      { ancla: 'well.lista', titulo: 'Tu equipo, de peor a mejor', texto: 'Arriba sale quien peor está hoy.' },
      { ancla: 'well.filtros', titulo: 'Lo que pide atención', texto: 'Filtra por quien necesita atención o por quien no lo ha rellenado hoy.' },
      { ancla: 'well.detalle', titulo: 'Su veredicto', texto: 'Qué dicen sus datos hoy, y cada valor comparado con lo suyo de siempre.' },
    ],
  },

  carga: {
    id: 'carga', nombre: 'Carga',
    pasos: [
      { ancla: 'carga.vistas', titulo: 'Su carga, de tres formas', texto: 'Global, por disciplina y día a día.' },
      { ancla: 'carga.forma', titulo: 'Frescura o carga', texto: 'Por encima de cero llega con frescura; por debajo, con carga acumulada.' },
    ],
  },

  volumen: {
    id: 'volumen', nombre: 'Volumen',
    pasos: [
      { ancla: 'vol.vistas', titulo: 'Cuánto entrena', texto: 'Por semanas, meses o días. Pulsa una barra para ver ese periodo por dentro.' },
      { ancla: 'vol.series', titulo: 'Objetivo de series', texto: 'En fuerza, fijas cuántas series por semana debería llevar cada grupo.' },
    ],
  },

  sicat: {
    id: 'sicat', nombre: 'SICAT',
    pasos: [
      { ancla: 'sicat.como', titulo: 'El coste de cada zona', texto: 'El SICAT calcula lo que le cuesta cada zona en cada deporte. Aquí te lo explica.' },
    ],
  },

  indices: {
    id: 'indices', nombre: 'Índices',
    pasos: [
      { ancla: 'ind.semaforo', titulo: 'Cómo vivió cada sesión', texto: 'Cruza lo que sintió con lo que marcó su pulso, y lo que hizo con lo que planeaste. Te dice si fue una sesión perfecta, si se frenó antes de tiempo o si se pasó.' },
    ],
  },

  comunicacion: {
    id: 'comunicacion', nombre: 'Comunicación',
    pasos: [
      { ancla: 'com.lista', titulo: 'Todas tus conversaciones', texto: 'Una por deportista, con lo que tienes sin leer arriba.' },
      { ancla: 'com.feedback', titulo: 'Cómo le fue', texto: 'Lo que te cuenta al cerrar cada sesión llega aquí como tarjeta.' },
      { ancla: 'com.responder', titulo: 'Responde citándolo', texto: 'Tu respuesta va enlazada a esa sesión, y con «Ver sesión» la abres.' },
    ],
  },

  biblioteca: {
    id: 'biblioteca', nombre: 'Biblioteca de Fuerza',
    pasos: [
      { ancla: 'bib.buscar', titulo: 'Encuentra el ejercicio', texto: 'Por tipo, región, lesión o momento, o por su nombre.' },
      { ancla: 'bib.ejercicio', titulo: 'Cómo se hace', texto: 'Cada ejercicio lleva su vídeo.' },
      { ancla: 'bib.anadir', titulo: 'Tus ejercicios', texto: 'Los que añades son tuyos. Si editas uno común, se guarda una copia tuya y el original no cambia.' },
      { ancla: 'bib.esconder', titulo: 'Lo que no usas', texto: 'Escóndelo de tus listas sin borrarlo para nadie.' },
      { ancla: 'bib.tests', titulo: 'Tests de fuerza', texto: 'Los tests de valoración, con su protocolo.' },
    ],
  },

  asistente: {
    id: 'asistente', nombre: 'Asistente IA',
    pasos: [
      { ancla: 'asis.preguntas', titulo: 'Pregúntale', texto: 'Parte de una pregunta hecha, como «¿Cómo está de frescura y qué le pondría hoy?», o escribe la tuya.' },
      { ancla: 'asis.deportista', titulo: 'Qué mira', texto: 'Lee los datos del deportista que tienes elegido: su carga, su wellness, sus tests y su competición.' },
      { ancla: 'asis.respuesta', titulo: 'Propone, decides tú', texto: 'Te aconseja y puede proponerte una sesión, pero no toca su calendario: eso lo haces tú.' },
    ],
  },

  'tests-propios': {
    id: 'tests-propios', nombre: 'Tests propios',
    pasos: [
      { ancla: 'tp.inicio', titulo: 'Tus tests', texto: 'Los que has creado tú, con «Crear un test nuevo» y «Pasar un test» a la vista.' },
      { ancla: 'tp.laboratorio', titulo: 'Construye cualquier test', texto: 'Por bloques de repeticiones y columnas: datos que das, que mides o que salen de una fórmula.' },
      { ancla: 'tp.pasar', titulo: 'Pásalo con reloj', texto: 'Puedes cronometrarlo, que cante una intensidad que sube sola, o apuntarlo a mano.' },
    ],
  },

  'zonas-propias': {
    id: 'zonas-propias', nombre: 'Zonas propias',
    pasos: [
      { ancla: 'zp.inicio', titulo: 'Tus zonas', texto: 'Crea tus clasificaciones de zonas, de hito en hito, y úsalas en las tareas.' },
    ],
  },

  cobros: {
    id: 'cobros', nombre: 'Cobros',
    pasos: [
      { ancla: 'cobros.libreta', titulo: 'Tu libreta', texto: 'Cargos y pagos de cada deportista, mes a mes, y lo que tiene vencido.' },
      { ancla: 'cobros.tarifa', titulo: 'Lo que cobras', texto: 'Pon su tarifa una vez. Si es mensual, la cuota sale sola cada mes; si cobras por sesión, te propone el cargo de las que hizo ese mes.' },
      { ancla: 'cobros.pago', titulo: 'Cuando te paga', texto: 'Apúntalo y su deuda baja.' },
    ],
  },

  perfil: {
    id: 'perfil', nombre: 'Perfil',
    pasos: [
      { ancla: 'perfil.codigo', titulo: 'Tu código de entrenador', texto: 'Con él, un deportista se une a ti al registrarse.' },
    ],
  },

  papelera: {
    id: 'papelera', nombre: 'Papelera',
    pasos: [
      { ancla: 'papelera.lista', titulo: 'Nada se pierde', texto: 'Las sesiones borradas, tuyas o del atleta, esperan aquí. Recupéralas o bórralas del todo.' },
    ],
  },

  /* ---------------------------------------------------------------
     El deportista (fase 4). Guion aprobado el 16-10-2026, pestaña
     «Deportista» del doc. Se usa sobre todo en el móvil: la salida de cada
     parada va por la barra de abajo, y en el ordenador por el menú (los
     pasos llevan `solo`).
     --------------------------------------------------------------- */

  'd-bienvenida': {
    id: 'd-bienvenida', nombre: 'Bienvenida', despues: 'd-hoy',
    pasos: [
      { titulo: 'Te damos la bienvenida, {nombre}', texto: 'Aquí ves las sesiones que te tocan, las haces y cuentas cómo fueron. Te enseñamos cada parte, una detrás de otra, y puedes parar cuando quieras.', primero: 'Empezar', saltar: 'Ahora no' },
      { ancla: 'dnav.barra', solo: 'movil', titulo: 'Todo está aquí abajo', texto: 'Hoy, tus sesiones, tu wellness y tus análisis. En «Más» está el resto: apuntar, tus tests, el chat y tu perfil.' },
      { ancla: 'menu', solo: 'ordenador', titulo: 'Todo está en el menú', texto: 'Tus sesiones, tu wellness, tus análisis y el resto. Pulsa TRIPULSE para abrirlo desde cualquier pantalla.' },
      { ancla: 'ayuda', titulo: 'Si te lo saltas, está aquí', texto: 'El botón ? repite lo que te enseñamos de la pantalla en la que estás.', ultimo: 'Empezar por hoy →' },
    ],
  },

  'd-hoy': {
    id: 'd-hoy', nombre: 'Hoy',
    pasos: [
      { ancla: 'dhoy.primeros', titulo: 'Lo que te falta para empezar', texto: 'Rellenar tu anamnesis y unirte a tu entrenador. Cuando lo completas, desaparece.' },
      { ancla: 'dhoy.wellness', titulo: 'Cómo amaneces', texto: 'Un minuto cada mañana: cómo has dormido, el cansancio, el estrés y el ánimo. Con eso tu entrenador ajusta lo que te manda.' },
      { ancla: 'dhoy.sesion', titulo: 'Lo que toca hoy', texto: 'Lo que tienes que hacer y a qué zona. «Empezar sesión» la abre entera.' },
      { ancla: 'dhoy.semana', titulo: 'Tu semana', texto: 'Un punto por sesión, del color de su deporte. Las que ya hiciste, más intensas.' },
      { ancla: 'dhoy.progreso', titulo: 'Cómo vas', texto: 'Tu próxima carrera y cuánto de lo planificado has hecho en las cuatro últimas semanas.' },
      { ancla: 'dhoy.apuntar', titulo: 'Lo que haces por tu cuenta', texto: 'Apunta lo que has hecho fuera del plan, o lo que vas a hacer, para que también cuente.' },
      { ancla: 'dhoy.reloj', titulo: 'Tu reloj', texto: 'Si lo conectas, tu sueño y tu HRV llegan solos y no tienes que escribirlos.' },
    ],
    salida: [
      { ancla: 'dnav.sesiones', accion: true, sale: true, solo: 'movil', titulo: 'Siguiente parada: tus sesiones', texto: 'Pulsa «Sesiones».' },
      { ancla: 'menu', accion: true, solo: 'ordenador', titulo: 'Siguiente parada: tus sesiones', texto: 'Abre el menú: pulsa TRIPULSE.' },
      { ancla: 'menu.d-sesiones', accion: true, sale: true, solo: 'ordenador', titulo: 'Siguiente parada: tus sesiones', texto: 'Pulsa «Mis sesiones».' },
    ],
  },

  'd-sesiones': {
    id: 'd-sesiones', nombre: 'Sesiones',
    pasos: [
      { ancla: 'dses.vistas', titulo: 'Como mejor lo veas', texto: 'Por semanas, por meses o en lista.' },
      { ancla: 'dses.sesion', titulo: 'Lo que te manda', texto: 'Con su zona y su ritmo, sin abrirla. Púlsala para verla entera.' },
      { ancla: 'dses.notas', titulo: 'Lo que te dice', texto: 'Si tu entrenador te deja una nota en una sesión, la ves aquí.' },
      { ancla: 'dses.carrera', titulo: 'Tu carrera', texto: 'Con su cuenta atrás y sus notas: la hora de salida o dónde se recoge el dorsal.' },
      { ancla: 'dses.tuyas', titulo: 'Lo que apuntas tú', texto: 'Las que te apuntas tú llevan «🙋 Tú»: esas las corriges o las borras. Las de tu entrenador, no.' },
    ],
    salida: [
      { ancla: 'dses.sesion', accion: true, sale: true, titulo: 'Siguiente parada: una sesión por dentro', texto: 'Pulsa una sesión para abrirla.' },
      /* Si aún no tiene ninguna, el paso de arriba se salta solo y se sigue por el wellness. */
      { ancla: 'dnav.wellness', accion: true, sale: true, va: 'd-wellness', solo: 'movil', titulo: 'Siguiente parada: tu wellness', texto: 'Cuando tengas sesiones, las abres desde aquí. Ahora, pulsa «Wellness».' },
      { ancla: 'menu', accion: true, va: 'd-wellness', solo: 'ordenador', titulo: 'Siguiente parada: tu wellness', texto: 'Cuando tengas sesiones, las abres desde aquí. Ahora, abre el menú: pulsa TRIPULSE.' },
      { ancla: 'menu.d-wellness', accion: true, sale: true, va: 'd-wellness', solo: 'ordenador', titulo: 'Siguiente parada: tu wellness', texto: 'Pulsa «Wellness».' },
    ],
  },

  'd-sesion': {
    id: 'd-sesion', nombre: 'Una sesión por dentro',
    pasos: [
      { ancla: 'dsesion.nota', titulo: 'Lo que te dice', texto: 'Va arriba: es lo primero que tienes que leer.' },
      { ancla: 'dsesion.tareas', titulo: 'Qué hacer y a qué ritmo', texto: 'Cada bloque con su zona y su intensidad: ritmo, pulso o vatios, según tus tests.' },
      { ancla: 'dsesion.empezar', titulo: 'Hazla con la app', texto: 'El modo entreno te lleva serie a serie, con lo que te toca en cada una.' },
      { ancla: 'dsesion.registrar', titulo: 'O cuéntalo al acabar', texto: 'Si la haces sin el móvil, al terminar pones cuánto duró y cómo fue.' },
      /* Sin ancla: la ventana del «¿Cómo fue?» solo se abre al terminar. */
      { titulo: 'Cuéntale cómo fue', texto: 'Al terminar te pregunta tu esfuerzo (RPE), la sensación y si te duele algo. Así tu entrenador ve cómo te sienta lo que te manda.' },
    ],
    salida: [
      { ancla: 'dnav.wellness', accion: true, sale: true, solo: 'movil', titulo: 'Siguiente parada: tu wellness', texto: 'Pulsa «Wellness».' },
      { ancla: 'menu', accion: true, solo: 'ordenador', titulo: 'Siguiente parada: tu wellness', texto: 'Abre el menú: pulsa TRIPULSE.' },
      { ancla: 'menu.d-wellness', accion: true, sale: true, solo: 'ordenador', titulo: 'Siguiente parada: tu wellness', texto: 'Pulsa «Wellness».' },
    ],
  },

  'd-wellness': {
    id: 'd-wellness', nombre: 'Wellness',
    pasos: [
      { ancla: 'dwell.registro', titulo: 'Cada mañana, un minuto', texto: 'Cómo has dormido, el cansancio, el estrés, el dolor y el ánimo. En cada barra, más alto es mejor.' },
      { ancla: 'dwell.reloj', titulo: 'Lo que ya trae tu reloj', texto: 'Con un reloj conectado, el sueño, la HRV y el pulso de la noche llegan solos.' },
      { ancla: 'dwell.analisis', titulo: 'Cómo estás estos días', texto: 'Lo de estos días frente a lo tuyo de siempre, contado en una frase.' },
      { ancla: 'dwell.historial', titulo: 'Tu evolución', texto: 'Cada mañana que lo rellenas se suma aquí.' },
    ],
    salida: [
      { ancla: 'dnav.analisis', accion: true, sale: true, solo: 'movil', titulo: 'Siguiente parada: tus análisis', texto: 'Pulsa «Análisis».' },
      { ancla: 'menu', accion: true, solo: 'ordenador', titulo: 'Siguiente parada: tus análisis', texto: 'Abre el menú: pulsa TRIPULSE.' },
      { ancla: 'menu.d-analisis', accion: true, sale: true, solo: 'ordenador', titulo: 'Siguiente parada: tus análisis', texto: 'Pulsa «Mis análisis».' },
    ],
  },

  /* La última parada: «Más» no es una pantalla, es un panel que se abre en la
     misma, así que su recorrido va como salida de esta y termina el camino. */
  'd-analisis': {
    id: 'd-analisis', nombre: 'Análisis',
    pasos: [
      { ancla: 'dana.lista', titulo: 'Lo que has hecho', texto: 'Tus sesiones realizadas, de la más reciente a la más antigua.' },
      { ancla: 'dana.comparar', titulo: 'Lo que te mandaron y lo que hiciste', texto: 'Abre una para compararlo: duración, distancia, ritmo y esfuerzo.' },
    ],
    salida: [
      { ancla: 'dnav.mas', accion: true, solo: 'movil', titulo: 'Lo demás está en «Más»', texto: 'Pulsa «Más».' },
      { ancla: 'dmas.apuntar', solo: 'movil', titulo: 'Apunta lo que haces', texto: 'Lo que haces por tu cuenta, o la fuerza serie a serie mientras entrenas.' },
      { ancla: 'dmas.chat', solo: 'movil', si: 'con-entrenador', titulo: 'Habla con tu entrenador', texto: 'Lo que le cuentas al cerrar cada sesión también le llega aquí.' },
      /* Quien entrena sin entrenador: su plan, en el sitio del chat. En el móvil no está en «Más»: está en el menú. */
      { ancla: 'menu', solo: 'movil', si: 'sin-entrenador', titulo: 'Tu plan, solo', texto: 'Está en el menú TRIPULSE, en «Mi plan»: la app te monta las semanas hasta tu carrera y las ajusta con lo que vas haciendo.' },
      { ancla: 'dmas.perfil', solo: 'movil', titulo: 'Tu perfil', texto: 'Conecta tu reloj y únete a tu entrenador con su código.' },
      { ancla: 'menu', accion: true, solo: 'ordenador', titulo: 'Lo demás, en el menú', texto: 'Abre el menú: pulsa TRIPULSE.' },
      { ancla: 'menu.d-chat', solo: 'ordenador', si: 'con-entrenador', titulo: 'Habla con tu entrenador', texto: 'Lo que le cuentas al cerrar cada sesión también le llega aquí.' },
      { ancla: 'menu.d-mi-plan', solo: 'ordenador', si: 'sin-entrenador', titulo: 'Tu plan, solo', texto: 'La app te monta las semanas hasta tu carrera y las ajusta con lo que vas haciendo.' },
      { ancla: 'menu.perfil', solo: 'ordenador', titulo: 'Tu perfil', texto: 'Conecta tu reloj y únete a tu entrenador con su código.' },
      { titulo: 'Ya conoces lo básico', texto: 'Cada pantalla tiene su ayuda en el botón ?, y en 🎓 Tutoriales están todas.', ultimo: 'Terminar' },
    ],
  },

  /* Las del deportista que solo salen con el botón ?. El modo entreno, también:
     a mitad de una sesión no es momento de pop-ups (decidido el 16-10-2026). */
  'd-apuntar': {
    id: 'd-apuntar', nombre: 'Apuntar',
    pasos: [
      { ancla: 'dap.que', titulo: '¿Hecha o por hacer?', texto: 'Es lo primero que eliges: lo que ya hiciste o lo que vas a hacer.' },
      { ancla: 'dap.deporte', titulo: 'El deporte', texto: 'Pulsa el tuyo.' },
      { ancla: 'dap.series', titulo: 'Fuerza serie a serie', texto: 'Apunta cada serie mientras entrenas, con su descanso y lo que hiciste la última vez.' },
      { ancla: 'dap.final', titulo: 'Los minutos y el RPE', texto: 'Van al final: es cuando se saben.' },
    ],
  },
  'd-entreno': {
    id: 'd-entreno', nombre: 'Modo entreno',
    pasos: [
      { ancla: 'dent.serie', titulo: 'La serie de ahora', texto: 'Lo que te toca y a qué intensidad.' },
      { ancla: 'dent.marcar', titulo: 'Márcala', texto: 'O escribe lo que hiciste: cuenta igual.' },
      { ancla: 'dent.tests', titulo: 'Lo de tus tests', texto: 'Si te mandan un %, aquí ves el ritmo que te sale.' },
      { ancla: 'dent.terminar', titulo: 'Al terminar', texto: 'Tu esfuerzo (en un brick, de cada parte), el dolor y tus notas.' },
    ],
  },
  'd-tests': {
    id: 'd-tests', nombre: 'Mis tests',
    pasos: [
      { ancla: 'dtest.lista', titulo: 'Tus tests', texto: 'Los que te han pasado, por deporte, con su fecha. De ellos salen tus zonas.' },
    ],
  },
  'd-chat': {
    id: 'd-chat', nombre: 'Chat',
    pasos: [
      { ancla: 'dchat.conversacion', titulo: 'Con tu entrenador', texto: 'Aquí habláis los dos.' },
      { ancla: 'dchat.feedback', titulo: 'Lo que cuentas de cada sesión', texto: 'Lo que escribes al cerrarla aparece aquí, y tu entrenador te contesta sobre esa sesión.' },
    ],
  },
  'd-disponibilidad': {
    id: 'd-disponibilidad', nombre: 'Disponibilidad',
    pasos: [
      { ancla: 'ddisp.anadir', titulo: 'Cuándo puedes entrenar', texto: 'Añade los días y horas que tienes. Con eso tu entrenador reparte tu semana.' },
    ],
  },
  'd-perfil': {
    id: 'd-perfil', nombre: 'Mi perfil',
    pasos: [
      { ancla: 'dper.reloj', titulo: 'Conecta tu reloj', texto: 'Tu sueño y tu HRV llegan solos.' },
      { ancla: 'dper.entrenador', titulo: 'Tu entrenador', texto: 'Únete a tu entrenador con el código que te dé.' },
      { ancla: 'dper.privacidad', titulo: 'Tus datos', texto: 'Lo que se guarda de ti y cómo descargarlo o borrarlo.' },
    ],
  },
  'd-anamnesis': {
    id: 'd-anamnesis', nombre: 'Anamnesis',
    pasos: [
      { ancla: 'danam.secciones', titulo: 'Lo que necesita saber', texto: 'Tu salud, tus lesiones, tu deporte y tus objetivos: lo que tu entrenador necesita antes de planificarte.' },
    ],
  },
  'd-mi-plan': {
    id: 'd-mi-plan', nombre: 'Mi plan',
    pasos: [
      { ancla: 'dplan.inicio', titulo: 'Tu plan, solo', texto: 'Si entrenas sin entrenador, la app te monta la temporada hasta tu carrera y la ajusta con lo que haces.' },
    ],
  },
  'd-comunidad': {
    id: 'd-comunidad', nombre: 'Comunidad',
    pasos: [
      { ancla: 'dcom.inicio', titulo: 'La comunidad', texto: 'Si quieres, entras. Tus entrenamientos siguen siendo privados.' },
    ],
  },
}

/* ---------------------------------------------------------------
   Lo que se recuerda de cada persona (lo carga lib/tutorial-progreso)
   --------------------------------------------------------------- */

/** Lo que contestó a un consejo (lib/consejos) y cuándo: con la fecha se sabe cuándo puede volver. */
export interface MarcaConsejo { estado: 'visto' | 'saltado'; fecha: string }

export interface Progreso {
  vistos: Set<string>
  saltados: Set<string>
  /** Dijo «Ahora no» (o «No, gracias» a la tarjeta): nada sale solo. */
  pausado: boolean
  /** Lo que contestó a la tarjeta quien ya usaba la app. */
  oferta: 'aceptada' | 'rechazada' | null
  /** Si la tabla no está (o no se pudo leer), no se puede recordar nada y nada sale solo. */
  disponible: boolean
  /** Los consejos contestados, por su clave (lib/consejos: claveConsejo). */
  consejos: Map<string, MarcaConsejo>
}

export function progresoVacio(disponible = true): Progreso {
  return { vistos: new Set(), saltados: new Set(), pausado: false, oferta: null, disponible, consejos: new Map() }
}

/** La siguiente parada del recorrido, o null en la última. */
export function siguienteParada(zona: ZonaTutorial): ZonaTutorial | null {
  const c = caminoDeZona(zona)
  if (!c) return null
  const i = c.indexOf(zona)
  return i < c.length - 1 ? c[i + 1] : null
}

/** ¿Va este paso en este aparato y para esta persona? (`solo` y `si`) */
export function pasoQueVale(p: PasoTutorial, { movil = false, conEntrenador = true }: { movil?: boolean; conEntrenador?: boolean } = {}): boolean {
  if (p.solo && (p.solo === 'movil') !== movil) return false
  if (p.si && (p.si === 'con-entrenador') !== conEntrenador) return false
  return true
}

/** Los pasos de un recorrido: los de la zona y, si va por el camino, su salida. */
export function pasosDeRecorrido(
  zona: ZonaTutorial,
  { camino, vistos, movil, conEntrenador }: { camino: boolean; vistos: Set<string>; movil?: boolean; conEntrenador?: boolean },
): PasoTutorial[] {
  const z = ZONAS[zona]
  const pasos = [...z.pasos]
  if (camino && z.salida) {
    const sig = siguienteParada(zona)
    /* A una parada ya vista no se lleva a nadie de vuelta; la última cierra. */
    if (!sig || !vistos.has(sig)) pasos.push(...z.salida)
  }
  return pasos.filter(p => pasoQueVale(p, { movil, conEntrenador }))
}

/** ¿Pueden salir recorridos solos? Solo a los nuevos, o a quien aceptó la tarjeta. */
export function guiaAutomatica(p: Progreso, esNuevo: boolean): boolean {
  return p.disponible && !p.pausado && (esNuevo || p.oferta === 'aceptada')
}

/** ¿Arranca sola esta zona al entrar? */
export function arrancaSola(zona: ZonaTutorial, p: Progreso, esNuevo: boolean): boolean {
  return !esAvanzada(zona) && guiaAutomatica(p, esNuevo) && !p.vistos.has(zona) && !p.saltados.has(zona)
}

/** Las pantallas del deportista. La misma ruta (/sesion/…, /perfil) es otra cosa para él. */
function zonaDelDeportista(r: string): ZonaTutorial | null {
  if (/^\/sesion\/[^/]+$/.test(r)) return 'd-sesion'
  if (/^\/sesion\/[^/]+\/ejecutar$/.test(r)) return 'd-entreno'
  if (/^\/wellness\/[^/]+$/.test(r)) return 'd-wellness'
  if (/^\/chat\/[^/]+$/.test(r)) return 'd-chat'
  const fijas: Record<string, ZonaTutorial> = {
    '/dashboard-deportista': 'd-hoy', '/mis-sesiones': 'd-sesiones', '/mis-analisis': 'd-analisis',
    '/apuntar': 'd-apuntar', '/mis-tests': 'd-tests', '/disponibilidad': 'd-disponibilidad', '/perfil': 'd-perfil',
    '/anamnesis': 'd-anamnesis', '/mi-plan': 'd-mi-plan', '/comunidad': 'd-comunidad',
  }
  return fijas[r] ?? null
}

/** La pantalla de cada zona. Los tests de un grupo y el dirigir en vivo no son zonas. */
export function zonaDeRuta(ruta: string, rol: RolTutorial = 'entrenador'): ZonaTutorial | null {
  const r = ruta.replace(/\/+$/, '') || '/'
  if (rol === 'deportista') return zonaDelDeportista(r)
  if (r === '/dashboard') return 'panel'
  if (r === '/deportistas') return 'deportistas'
  if (/^\/deportistas\/[^/]+$/.test(r)) return 'ficha'
  if (/^\/tests\/[^/]+$/.test(r) && r !== '/tests/dirigir') return 'tests'
  if (/^\/planificacion-visual\/[^/]+$/.test(r)) return 'vistas'
  if (/^\/planificacion-visual\/[^/]+\/dibujo$/.test(r)) return 'lienzo'
  if (/^\/planificacion-visual\/[^/]+\/calendario$/.test(r)) return 'calendario'
  if (/^\/sesion\/[^/]+$/.test(r)) return 'sesion'
  /* Las avanzadas. Dirigir un grupo en vivo, su día y su test no son zonas. */
  if (/^\/planificacion-visual\/[^/]+\/bloques$/.test(r)) return 'bloques'
  if (/^\/planificacion-visual\/[^/]+\/semana\/[^/]+$/.test(r)) return 'semana'
  if (/^\/grupo\/[^/]+$/.test(r)) return 'grupo'
  const fijas: Record<string, ZonaTutorial> = {
    '/planificador': 'planificador', '/wellness-entrenador': 'wellness', '/carga': 'carga', '/volumen': 'volumen',
    '/eco': 'sicat', '/indices': 'indices', '/comunicacion': 'comunicacion', '/fuerza': 'biblioteca',
    '/asistente': 'asistente', '/tests-propios': 'tests-propios', '/zonas-propias': 'zonas-propias',
    '/cobros': 'cobros', '/perfil': 'perfil', '/papelera': 'papelera',
  }
  return fijas[r] ?? null
}

/**
 * Lo que ofrece el botón ? en una pantalla. En la sesión, dos: lo básico y
 * las herramientas (decidido en el guion). En las demás, el suyo o ninguno.
 */
export function opcionesDeAyuda(ruta: string, rol: RolTutorial = 'entrenador'): ZonaTutorial[] {
  const z = zonaDeRuta(ruta, rol)
  if (!z) return []
  return z === 'sesion' ? ['sesion', 'herramientas'] : [z]
}

/** La zona que arranca sola al entrar en esta pantalla, o null. En su primera pantalla, la bienvenida va antes. */
export function zonaAlEntrar(ruta: string, p: Progreso, esNuevo: boolean, rol: RolTutorial = 'entrenador'): ZonaTutorial | null {
  const z = zonaDeRuta(ruta, rol)
  if (!z) return null
  const b = bienvenidaDe(rol)
  if (z === ZONAS[b].despues && arrancaSola(b, p, esNuevo)) return b
  return arrancaSola(z, p, esNuevo) ? z : null
}

/** Una zona pedida que espera a que cargue su pantalla: desde la lista, o siguiendo el camino. */
export interface Pendiente { zona: ZonaTutorial; camino: boolean }

/**
 * Al pulsar lo que lleva a la siguiente parada, esa parada queda pedida: tiene
 * que arrancar al llegar aunque no le salgan recorridos solos (quien dijo «No,
 * gracias» y luego pulsó «Seguir →»). Antes dependía de lo automático y el
 * camino se cortaba en la segunda parada. Si el paso lleva `va` (se salta una
 * parada que aún no puede ver), la pedida es esa.
 */
export function pendienteAlSeguir(zona: ZonaTutorial, va?: ZonaTutorial | null): Pendiente | null {
  const sig = va ?? siguienteParada(zona)
  return sig ? { zona: sig, camino: true } : null
}

/**
 * Qué arranca al entrar en una pantalla, y qué queda pedido. Lo pedido manda;
 * por una pantalla sin recorrido (de paso, como elegir deportista) se sigue
 * esperando; en otra pantalla con recorrido se olvida.
 */
export function queArrancaAlEntrar(
  ruta: string, pendiente: Pendiente | null, p: Progreso, esNuevo: boolean, rol: RolTutorial = 'entrenador',
): { zona: ZonaTutorial | null; camino: boolean; pendiente: Pendiente | null } {
  const aqui = zonaDeRuta(ruta, rol)
  let pedido = pendiente
  if (pedido) {
    /* Una bienvenida se cumple en la pantalla que va después de ella. */
    if (aqui === pedido.zona || (aqui && ZONAS[pedido.zona].despues === aqui)) {
      return { zona: pedido.zona, camino: pedido.camino, pendiente: null }
    }
    if (aqui) pedido = null
  }
  return { zona: zonaAlEntrar(ruta, p, esNuevo, rol), camino: true, pendiente: pedido }
}

/** La tarjeta del Panel solo es para quien ya usaba la app y aún no contestó. */
export function mostrarOferta(p: Progreso, esNuevo: boolean): boolean {
  return p.disponible && !esNuevo && p.oferta === null
}

/** La primera parada del recorrido que aún no ha visto. */
export function siguienteDelCamino(p: Progreso, rol: RolTutorial = 'entrenador'): ZonaTutorial | null {
  return caminoDe(rol).find(z => !p.vistos.has(z)) ?? null
}

/**
 * Dónde se ve cada zona. Las que dependen de un deportista necesitan el elegido
 * (para el deportista, él mismo); la sesión, abrir una.
 */
export function rutaDeZona(zona: ZonaTutorial, idDeportista: number | null): string | null {
  switch (zona) {
    case 'd-bienvenida':
    case 'd-hoy': return '/dashboard-deportista'
    case 'd-sesiones': return '/mis-sesiones'
    case 'd-sesion':
    case 'd-entreno': return null
    case 'd-wellness': return idDeportista ? '/wellness/' + idDeportista : null
    case 'd-chat': return idDeportista ? '/chat/' + idDeportista : null
    case 'd-analisis': return '/mis-analisis'
    case 'd-apuntar': return '/apuntar'
    case 'd-tests': return '/mis-tests'
    case 'd-disponibilidad': return '/disponibilidad'
    case 'd-perfil': return '/perfil'
    case 'd-anamnesis': return '/anamnesis'
    case 'd-mi-plan': return '/mi-plan'
    case 'd-comunidad': return '/comunidad'
    case 'bienvenida':
    case 'panel': return '/dashboard'
    case 'deportistas': return '/deportistas'
    case 'sesion':
    case 'herramientas':
    case 'grupo': return null
    case 'planificador': return '/planificador'
    case 'wellness': return '/wellness-entrenador'
    case 'carga': return '/carga'
    case 'volumen': return '/volumen'
    case 'sicat': return '/eco'
    case 'indices': return '/indices'
    case 'comunicacion': return '/comunicacion'
    case 'biblioteca': return '/fuerza'
    case 'asistente': return '/asistente'
    case 'tests-propios': return '/tests-propios'
    case 'zonas-propias': return '/zonas-propias'
    case 'cobros': return '/cobros'
    case 'perfil': return '/perfil'
    case 'papelera': return '/papelera'
    default:
      if (!idDeportista) return null
      if (zona === 'ficha') return '/deportistas/' + idDeportista
      if (zona === 'tests') return '/tests/' + idDeportista
      if (zona === 'vistas') return '/planificacion-visual/' + idDeportista
      if (zona === 'lienzo') return '/planificacion-visual/' + idDeportista + '/dibujo'
      if (zona === 'bloques') return '/planificacion-visual/' + idDeportista + '/bloques'
      if (zona === 'semana') return '/planificacion-visual/' + idDeportista + '/semana/' + lunesDe(hoyISO())
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
