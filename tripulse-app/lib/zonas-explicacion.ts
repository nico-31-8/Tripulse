// ============================================================
// TRIPULSE — Qué es cada zona y para qué sirve
// ============================================================
// `lib/zonas.ts` dice a qué RITMO se entrena cada zona. Esto dice PARA QUÉ, que
// es lo que no estaba en ninguna parte de la app: un entrenador veía «AEM» en un
// desplegable y tenía que saberse de memoria que ahí es donde está el MLSS.
//
// TRES COSAS SEPARADAS, y conviene que sigan estándolo:
//   · `explicacion`  → la cualidad. Texto, y solo vive aquí.
//   · el ritmo       → `tablaIntensidades()` de lib/zonas.ts, con los tests del
//                      atleta. NO se repite aquí: repetido se separa.
//   · el % semanal   → `repartoPorDistancia()` de lib/distribucion-zonas.ts.
//                      Depende de la prueba, no de la zona, así que tampoco.
//
// FUENTES DEL TEXTO
//   · Cualidades y adaptaciones → B1-00 Parte 2 (Coggan/Friel/Seiler)
//   · Dosis de carrera          → B1-00c Tabla 3 (Tuimil / Billat)
//   · Dosis de bici y natación  → B1-00d (sesiones tipo por zona)
//   · Fuerza                    → B3-01 (economía, stiffness, fases)
// Donde la fuente no llega, se dice. No se rellena con criterio propio.
import { ZONAS_RESISTENCIA, ZONAS_FUERZA } from './zonas'
import { PLANTILLAS, opcionesDe, type PlantillaSesion } from './plantillas'
import {
  repartoPorDistancia, ETIQUETA_DISTANCIA,
  type DistanciaTri, type Disciplina, type FranjaReparto,
} from './distribucion-zonas'

/** Dosis típica de una sesión de esa zona, por disciplina. */
export interface DosisZona {
  carrera?: string
  ciclismo?: string
  natacion?: string
  /** Lo que aplica a las tres, o el límite de lo documentado. */
  nota?: string
}

export interface ExplicacionZona {
  /** Una frase: qué persigue la zona. */
  paraQue: string
  /** Qué cambia en el cuerpo. Es la parte de «hitos fisiológicos». */
  hitos: string[]
  /** Cuándo se usa en una temporada de triatlón. */
  cuando: string
  /** El error que se comete con esta zona. Solo donde hay uno de verdad. */
  ojo?: string
  /** Para el entrenador que viene de otro sistema. */
  equivalencia?: string
  dosis?: DosisZona
}

// ------------------------------------------------------------
// Las 9 zonas de resistencia
// ------------------------------------------------------------
export const EXPLICACION_RESISTENCIA: Record<string, ExplicacionZona> = {
  AER: {
    paraQue: 'Acelerar la recuperación. Es la única zona que no persigue una adaptación.',
    hitos: [
      'Perfusión sanguínea y aclarado del lactato residual de la sesión anterior',
      'Movimiento sin daño mecánico ni señal de fatiga nueva',
    ],
    cuando: 'El día después de una sesión dura, y entre bloques de calidad.',
    ojo: 'Subirla «total, si va suave» la convierte en fatiga sin beneficio. Y al revés: rodar aquí creyendo que construyes base no construye base — eso es AEL.',
    equivalencia: 'Z1 de Coggan · Z1 de Tuimil',
    dosis: {
      carrera: 'Trote continuo 30–60′. Nunca fraccionado.',
      ciclismo: 'Rodadura 30–60′, cadencia libre 80–90 rpm.',
      natacion: '1.000–1.500 m continuo o con pausa mínima. Es la sesión de técnica y drills.',
    },
  },

  AEL: {
    paraQue: 'La base aeróbica. La zona más importante del triatlón, y más cuanto más larga es la prueba.',
    hitos: [
      'Biogénesis mitocondrial (vía PGC-1α): más mitocondrias, más capacidad de usar oxígeno',
      'Capilarización muscular — más superficie de intercambio',
      'Aumento del volumen sistólico',
      'Oxidación de grasas: un élite quema 1,5–2,0 g/min aquí; un no entrenado, 0,5–0,7',
    ],
    cuando: 'El grueso del volumen de la semana. En larga distancia, casi la mitad del tiempo total.',
    ojo: 'El marcador de que vas bien es que hablas con frases completas y la FC no deriva. Si deriva, te has ido a AEM sin enterarte.',
    equivalencia: 'Z2 de Coggan · Z2 de Tuimil',
    dosis: {
      carrera: 'Tiradas de 60–150′ / 8–25 km, continuo.',
      ciclismo: 'Fondo de 90–300′ a 85–95 rpm. Es el 40–60 % del volumen total de bici.',
      natacion: '2×1.500 / 3×1.000 / 1×2.000 → 2.000–3.000 m, pausa 30–60 s.',
      nota: 'Para quien va justo de tiempo: fondo con 3–4×10′ de AEM dentro, que combina base y estímulo.',
    },
  },

  AEM: {
    paraQue: 'Subir el umbral aeróbico (VT1) — o sea, el techo de la zona anterior.',
    hitos: [
      'Aquí está el MLSS: la intensidad más alta a la que el lactato todavía se estabiliza',
      'La glucólisis aeróbica pasa a mandar sobre las grasas',
      'Lactato de 2,5 a 4 mmol/L, tamponado',
      'Mejora la economía de movimiento a intensidades submáximas',
    ],
    cuando: 'Tempo, y ritmo real de competición en larga distancia — un Ironman se corre en esta banda.',
    ojo: 'Es el «agujero negro» de Seiler. Bastante dura para acumular fatiga, no bastante intensa para dar las adaptaciones de PAE. El amateur que siempre está cansado y nunca mejora vive aquí.',
    equivalencia: 'Z3 de Coggan · Z3 y Z4 de Tuimil',
    dosis: {
      carrera: 'Continuo 20–60′ / 5–15 km. Fraccionado: 3–12′ × 1.000–4.000 m, recuperación 1:0,5.',
      ciclismo: 'Tempo continuo 20–60′, o 2×20′ / 3×15′ con 5–8′ suaves. Sweet spot 87–93 % FTP.',
      natacion: '4–6×400 m o 5–8×300 m, pausa 30–45 s → 1.200–2.400 m de trabajo.',
      nota: 'El fraccionado da la misma adaptación que el continuo y se tolera mejor.',
    },
  },

  AEI: {
    paraQue: 'El umbral anaeróbico. El FTP y el CSS son, por definición, el techo de esta zona.',
    hitos: [
      'Máxima producción de lactato que todavía puedes aclarar',
      'Transportadores de lactato MCT-1 y MCT-4, y capacidad de tamponamiento',
      'Entran las fibras intermedias (tipo IIa)',
      'El FTP es el predictor aislado más fuerte del rendimiento en el sector de bici (Suriano & Bishop, 2010)',
    ],
    cuando: 'Sprint y olímpico se compiten cerca o por encima de aquí. 1–2 sesiones/semana en corto, 1 en 70.3, 1 cada dos semanas en Ironman.',
    equivalencia: 'Z4 de Coggan · Z5 de Tuimil',
    dosis: {
      carrera: '600–2.000 m × 90 s–6′, recuperación 1:1.',
      ciclismo: '2×20′ / 3×15′ / 4×10′ → 40–45′ de trabajo. Over-unders: 3′ al 95 % + 1′ al 108 %, bloques de 8–12′.',
      natacion: '10–15×100 m (pausa 10–20 s) · 6–8×200 m (15–25 s) · 4–5×300 m (20–30 s) → 1.000–1.600 m.',
      nota: 'La pausa corta en natación es deliberada: mantiene el estrés metabólico.',
    },
  },

  PAE: {
    paraQue: 'El VO₂máx. Subir el techo del que cuelga todo lo demás.',
    hitos: [
      'El consumo de oxígeno llega a su máximo o lo roza — aquí vive la vVO₂máx',
      'Volumen sistólico en su valor máximo',
      'Reclutamiento completo de fibras musculares',
      'En larga distancia sube el techo y arrastra el umbral hacia arriba',
    ],
    cuando: 'Crítica en sprint y olímpico, donde se corre muy cerca del VO₂máx.',
    ojo: 'La que más se estropea por empezar pasado. Si el primer intervalo es el mejor de la serie, ibas rápido.',
    equivalencia: 'Z5 de Coggan · Z6 de Tuimil',
    dosis: {
      carrera: '200–800 m × 30 s–3′, recuperación 1:1,5 a 1:2.',
      ciclismo: '4–6×3–5′ a 1:1 → 15–25′ de trabajo. Largos: 3–5×6–8′. Micro: 40/20 al 110 % FTP, o 30/30 al 115 %.',
      natacion: '6–10×100 m u 8–12×75 m, pausa 30–45 s.',
      nota: 'Aquí acaba lo documentado en natación: por encima de PAE la literatura no separa más zonas.',
    },
  },

  CLA: {
    paraQue: 'Tolerar el lactato y tamponarlo.',
    hitos: [
      'Glucólisis anaeróbica predominante, por encima de 8–12 mmol/L',
      'Tolerancia al lactato y capacidad de tamponar',
      'Fatiga neuromuscular y metabólica alta',
    ],
    cuando: 'La salida de la natación, un cambio de ritmo, el último kilómetro de un sprint u olímpico.',
    ojo: 'Mucha fatiga por poca adaptación. En larga distancia apenas mueve el rendimiento medio: poca y bien colocada.',
    equivalencia: 'Z6 de Coggan · Z7.1 de Tuimil',
    dosis: {
      carrera: '200–500 m × 30–90 s, recuperación 2–5′.',
      ciclismo: '6–10×1–2′ con 3–5′ de recuperación completa → 8–16′ de trabajo. O 8–12×30 s con 2–4′.',
      natacion: '6–15×25–75 m con pausa de 1–5′ (recuperación completa).',
    },
  },

  PLA: {
    paraQue: 'La máxima tasa de producción de energía por vía glucolítica.',
    hitos: [
      'Potencia anaeróbica láctica',
      'Reclutamiento de fibras rápidas bajo fatiga',
    ],
    cuando: 'Repeticiones cortas y máximas con descanso largo. En triatlón, salidas y arranques; poco más.',
    equivalencia: 'Z7 de Coggan · Z7.2 de Tuimil',
    dosis: {
      carrera: '10–30 s a tope, recuperación 3–5′ entre repeticiones.',
      ciclismo: 'Aceleraciones en subida de 45–60 s, bajando entre ellas.',
      natacion: 'Series de 25 m o menos a velocidad máxima.',
      nota: 'Necesita un test de sprint (MSS / MPP) para poder prescribirse.',
    },
  },

  CALA: {
    paraQue: 'Sostener la potencia de fosfocreatina un poco más, y poder repetirla.',
    hitos: [
      'Sistema ATP-PCr; sin acumulación relevante de lactato si el descanso es completo',
      'Mecánica a velocidad alta sin la fatiga de las zonas lácticas',
    ],
    cuando: 'Series de 10–15 m en natación, aceleraciones en carrera. Buen trabajo de técnica a velocidad.',
    ojo: 'La recuperación larga no es opcional: si la acortas, ya no estás entrenando esta zona.',
    equivalencia: 'Z8 de Tuimil · Coggan la mete en su nivel 7',
    dosis: {
      carrera: 'Sprints de 30–60 m con recuperación completa de 5–8′.',
      ciclismo: '5–8 sprints de 6–10 s con 4–8′ entre ellos.',
      natacion: '10–15 m desde pared.',
      nota: 'Necesita un test de sprint (MSS / MPP) para poder prescribirse.',
    },
  },

  PALA: {
    paraQue: 'Potencia pico y coordinación intermuscular.',
    hitos: [
      'Máximo reclutamiento de unidades motoras, fibras tipo IIx',
      'Energía de fosfocreatina pura, por debajo de 5 s',
    ],
    cuando: 'Salidas y arranques. En triatlón rara vez se entrena directa: el trabajo de fuerza y la pliometría ya la desarrollan.',
    equivalencia: 'Z8 de Tuimil · Coggan la mete en su nivel 7',
    dosis: {
      carrera: 'Sprints por debajo de 5 s con recuperación completa.',
      ciclismo: 'Arranques desde parado de 8–12 s, 5–6 repeticiones, 5–8′ entre ellas.',
      natacion: 'Salidas explosivas, menos de 10 m.',
      nota: 'Necesita un test de sprint (MSS / MPP) para poder prescribirse.',
    },
  },
}

// ------------------------------------------------------------
// Las 10 zonas de fuerza y flexibilidad
// ------------------------------------------------------------
// Aquí no hay `dosis` por disciplina: las series, repeticiones, carga y descanso
// ya están en `ZONAS_FUERZA` (lib/zonas.ts) y las sesiones por semana en
// `PLANTILLAS_FUERZA`. Escribirlas otra vez sería la copia número dos.
export const EXPLICACION_FUERZA: Record<string, ExplicacionZona> = {
  AFG: {
    paraQue: 'Preparar tendones, ligamentos y articulaciones para aguantar la fuerza máxima que viene después.',
    hitos: [
      'Resistencia del tejido conectivo',
      'Técnica de los patrones básicos con carga baja',
      'Corrección de desequilibrios antes de cargar de verdad',
    ],
    cuando: 'Las primeras 4 semanas de la preparación general.',
    ojo: 'No es la fase donde se mejora el rendimiento: es la fase donde no te lesionas en la siguiente. Ejecución controlada, 2 s subiendo y 2 s bajando.',
  },

  FMI: {
    paraQue: 'El bloque que de verdad importa. De aquí sale casi toda la mejora de economía.',
    hitos: [
      'Adaptación neural: sincronización y reclutamiento de unidades motoras, no tamaño',
      'Stiffness tendinoso: el tendón devuelve más energía elástica por zancada',
      '−3 a −5 % de VO₂ al mismo ritmo (Beattie 2017)',
      '+5–8 % de potencia pico en bici (Rønnestad 2010)',
    ],
    cuando: 'Preparación general avanzada. Dos sesiones por semana como máximo: el volumen de resistencia es prioritario.',
    ojo: 'Intención de máxima velocidad al subir aunque la barra vaya lenta — es lo que la hace neural. Y los 3–5 min de descanso no son opcionales: acortarlos la convierte en otra cosa.',
  },

  FMH: {
    paraQue: 'Aumentar la sección transversal del músculo.',
    hitos: [
      'Hipertrofia por volumen y tiempo bajo tensión',
      'Base estructural cuando el atleta viene de cero',
    ],
    cuando: 'Con cuentagotas en triatlón, y en el mantenimiento de tapering (2 series, carga alta).',
    ojo: 'Ganar masa cuesta caro en una prueba donde se arrastra el peso muchas horas. Su sitio son atletas muy poco desarrollados y correcciones de desequilibrios.',
  },

  FEC: {
    paraQue: 'Convertir la fuerza máxima en fuerza aplicada a la velocidad de la zancada y del pedaleo.',
    hitos: [
      'Potencia en gestos cíclicos, que es la forma en la que el triatlón produce fuerza',
      'Transferencia de lo ganado en FMI al gesto deportivo',
    ],
    cuando: 'Preparación específica inicial, 1–2 sesiones por semana.',
    ojo: 'La carga es baja a propósito: lo que se entrena es la velocidad de ejecución, no el peso. Si esta fase no se hace, lo ganado en fuerza máxima no llega al rendimiento.',
  },

  FEA: {
    paraQue: 'Un esfuerzo único y máximo: saltos, lanzamientos, arrancadas.',
    hitos: [
      'Tasa de desarrollo de fuerza (RFD)',
      'Ciclo estiramiento-acortamiento',
    ],
    cuando: 'Poco relevante en triatlón puro; sí en la salida de natación y en el trabajo preventivo de tejido.',
  },

  RFMIX1: {
    paraQue: 'Sostener la producción de fuerza cuando ya hay fatiga.',
    hitos: [
      'Resistencia a la fatiga neuromuscular',
      'Mantiene lo ganado sin generar una fatiga que estropee la resistencia',
    ],
    cuando: 'Preparación específica avanzada. Es lo que hace falta en los últimos kilómetros.',
  },

  RFLA: {
    paraQue: 'Aguantar produciendo fuerza con lactato alto.',
    hitos: [
      'Tolerancia al lactato en el músculo que trabaja',
      'Es la traducción a gimnasio de lo que pasa en la zona CLA',
    ],
    cuando: 'Muy exigente y con transferencia limitada en larga distancia.',
    ojo: 'Colocarla lejos de las sesiones de calidad: la fatiga que deja compite con ellas.',
  },

  RFMIX2: {
    paraQue: 'Series largas y continuas: circuitos, cuestas largas, desarrollos duros en bici.',
    hitos: [
      'Resistencia de fuerza con demanda cardiovascular a la vez',
      'Es el puente entre el gimnasio y el terreno',
    ],
    cuando: 'Cuando el trabajo de fuerza empieza a parecerse al deporte.',
  },

  RFAE: {
    paraQue: 'Resistencia local con demanda aeróbica: poco pico de fuerza y mucha repetición.',
    hitos: [
      'Resistencia muscular local',
      'Tolerancia al trabajo repetido con carga baja',
    ],
    cuando: 'Sostén, y reintroducción tras un parón o una lesión. No es una fase de mejora del rendimiento.',
  },

  FLEX: {
    paraQue: 'Rango de movimiento útil.',
    hitos: [
      'Movilidad de cadera y columna torácica, que es lo que limita la posición aerodinámica en bici',
      'Movilidad de hombro para la entrada del crol y la posición de streamline',
      'Dorsiflexión de tobillo, que condiciona la mecánica de carrera y la sentadilla',
    ],
    cuando: 'Sesión aparte, o al final de la de fuerza. En los últimos 10–14 días antes de la competición A es, con el core, lo único que queda.',
    ojo: 'El estiramiento estático largo antes de una sesión de calidad baja la producción de fuerza. Va después, nunca antes.',
  },
}

// ------------------------------------------------------------
// Acceso
// ------------------------------------------------------------

export function explicacionDe(sigla: string | null | undefined): ExplicacionZona | undefined {
  if (!sigla) return undefined
  return EXPLICACION_RESISTENCIA[sigla] ?? EXPLICACION_FUERZA[sigla]
}

/**
 * El % del volumen semanal que le toca a una zona, para una prueba objetivo.
 *
 * No se escribe: se lee de `distribucion-zonas.ts`. Ojo con el rango que
 * devuelve: cuando `siglas` trae más de una, el presupuesto es COMPARTIDO entre
 * todas ellas, no uno para cada una. Le pasa a todo el cajón anaeróbico.
 *
 * `undefined` solo si la sigla no es de resistencia (las de fuerza no tienen
 * reparto: su dosis son series y repeticiones, no % del tiempo semanal).
 */
export function porcentajeSemanal(
  sigla: string, distancia: DistanciaTri, disciplina: Disciplina,
): FranjaReparto | undefined {
  return repartoPorDistancia(distancia, disciplina).find(f => f.siglas.includes(sigla))
}

/**
 * Las sesiones del catálogo que entrenan esa zona.
 *
 * El rango de la dosis dice «200–800 m»; esto enseña las sesiones concretas que
 * ya están escritas, para no obligar al entrenador a leer un rango y luego
 * buscarlas a mano. Base y variantes por igual: para quien elige, una variante
 * es una sesión distinta.
 */
export interface SesionDeZona {
  clave: string
  nombre: string
  disciplina: PlantillaSesion['disciplina']
}

export function sesionesDeZona(sigla: string): SesionDeZona[] {
  return PLANTILLAS
    .filter(p => p.zona === sigla)
    .flatMap(p => opcionesDe(p).map(o => ({
      clave: o.clave,
      // La base ya se llama por la sesión; la variante solo dice en qué cambia,
      // así que suelta no se entiende («Over-unders» ¿de qué?).
      nombre: o.esBase ? o.nombre : p.nombre + ' · ' + o.nombre,
      disciplina: p.disciplina,
    })))
}

/** Las cuatro distancias con su etiqueta, para pintar el selector. */
export const DISTANCIAS: { id: DistanciaTri; label: string }[] =
  (['sprint', 'olimpico', 'medio', 'largo'] as DistanciaTri[])
    .map(id => ({ id, label: ETIQUETA_DISTANCIA[id] }))

/** Las siglas que la app conoce, en el orden del catálogo. */
export const SIGLAS_RESISTENCIA = ZONAS_RESISTENCIA.map(z => z.sigla)
export const SIGLAS_FUERZA = ZONAS_FUERZA.map(z => z.sigla)
