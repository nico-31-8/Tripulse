// ============================================================
// TRIPULSE — Variantes del catálogo de plantillas
// ============================================================
// El catálogo base tiene UNA sesión por zona y disciplina. Está bien para un
// entrenador, que la varía él. No está bien para un plan generado: con una sola
// estructura por zona, el atleta hace el mismo martes durante tres meses, y en
// entrenamiento lo que se abandona por aburrimiento no lo salva la fisiología.
//
// Esto añade las OTRAS formas de hacer la misma zona. No son plantillas nuevas:
// mismo objetivo fisiológico, otra estructura.
//
// FUENTES — el mismo criterio que el catálogo base:
//   · B1-00d — Sesiones Tipo por Zona (ciclismo y natación). Documenta 3–4
//     métodos por zona, no uno. De ahí sale casi todo lo de estas dos.
//   · B1-00b — Métodos de Entrenamiento por Zona en las 3 disciplinas. Es la que
//     da los métodos de CARRERA que B1-00c no detalla (continuo variable, 30/30
//     de Billat, 1K–2K, pruebas repetidas).
//   · B1-00c — Tabla 3 (Tuimil) para los rangos de carrera.
//
// REGLA DE ORIGEN (la misma del catálogo base, aplicada a las variantes):
//   · 'documentado' → la fuente da el método Y un rango de volumen usable, así
//     que los tres niveles salen del rango sin inventar nada.
//   · 'propuesta'   → la fuente da el método pero un solo tamaño, o no lo da y
//     lo construimos desde el rango de la zona. Lleva `aviso` explicando qué
//     parte es nuestra.
//
// DÓNDE HAY VARIANTES Y DÓNDE NO — es una decisión, no un olvido: están en
// AER/AEL/AEM/AEI/PAE, que es donde el atleta pasa el 90 % del tiempo y donde
// la monotonía muerde de verdad. Las zonas lácticas y alácticas se usan pocas
// veces al mes y su literatura no da variedad estructural; meter variantes ahí
// sería relleno.
import type { VarianteSesion } from './plantillas-tipos'

// ------------------------------------------------------------
// 🚴 CICLISMO — B1-00d Parte 1
// ------------------------------------------------------------

// La zona con MÁS repeticiones de todo el catálogo y la que tenía menos
// alternativas: con el reparto real, la rodadura sale unas 13 veces en un bloque
// de 12 semanas y hasta ahora había UNA sola sesión. Esta es la corrección del
// sesgo de fondo del catálogo: puse variantes donde la literatura documenta
// métodos —y describe cinco formas de hacer un VO₂max y una de rodar suave—, no
// donde el atleta pasa el tiempo.
const CIC_AER: VarianteSesion[] = [
  {
    id: 'tecnica-pedaleo',
    nombre: 'Pedaleo técnico',
    objetivo: 'La rodadura suave aprovechada para pedalear mejor. Con la carga baja sobra cabeza para corregir el gesto, y la eficiencia de pedaleo es de las pocas cosas que se ganan sin pagar fatiga.',
    origen: 'documentado', fuente: 'B1-00b · Z1 ciclismo («Rodadura suave: pedaleo técnico, trabajo de pedaling efficiency»)',
    // B1-00b Z1: 30–90 min, cadencia libre, < 55 % FTP.
    principal: {
      principiante: [
        { zona: 'AER', segundos: 15 * 60, nota: 'Entrar rodando' },
        { zona: 'AER', series: 6, segundos: 60, descansoSeg: 60, nota: 'Drills: una pierna sola, alternando; y pedaleo redondo consciente' },
        { zona: 'AER', segundos: 10 * 60 },
      ],
      intermedio: [
        { zona: 'AER', segundos: 20 * 60, nota: 'Entrar rodando' },
        { zona: 'AER', series: 8, segundos: 60, descansoSeg: 60, nota: 'Drills: una pierna sola, alternando; y pedaleo redondo consciente' },
        { zona: 'AER', segundos: 15 * 60 },
      ],
      avanzado: [
        { zona: 'AER', segundos: 25 * 60, nota: 'Entrar rodando' },
        { zona: 'AER', series: 10, segundos: 60, descansoSeg: 60, nota: 'Drills: una pierna sola, alternando; y pedaleo redondo consciente' },
        { zona: 'AER', segundos: 20 * 60 },
      ],
    },
  },
  {
    id: 'cadencia',
    nombre: 'Rodaje de cadencia alta',
    objetivo: 'Rodar suave girando muy rápido (100–110 rpm). Trabaja la coordinación neuromuscular del pedaleo sin meter carga, que es justo lo que se busca en un día fácil.',
    origen: 'propuesta', fuente: 'B1-00b · Z1 ciclismo (duración y «cadencia libre») · B1-00d Z5 (el rango de 95–110 rpm)',
    aviso: 'B1-00b da la Z1 de ciclismo con «cadencia libre» y no describe una sesión de cadencia alta como método propio. La estructura es nuestra: respeta la duración y la intensidad de Z1 y toma el rango de cadencia alta que B1-00d usa en sus intervalos.',
    principal: {
      principiante: [
        { zona: 'AER', segundos: 10 * 60 },
        { zona: 'AER', series: 5, segundos: 3 * 60, descansoSeg: 2 * 60, nota: '100–110 rpm sin subir la potencia; si sube, bajar desarrollo' },
        { zona: 'AER', segundos: 10 * 60 },
      ],
      intermedio: [
        { zona: 'AER', segundos: 15 * 60 },
        { zona: 'AER', series: 6, segundos: 4 * 60, descansoSeg: 2 * 60, nota: '100–110 rpm sin subir la potencia; si sube, bajar desarrollo' },
        { zona: 'AER', segundos: 15 * 60 },
      ],
      avanzado: [
        { zona: 'AER', segundos: 15 * 60 },
        { zona: 'AER', series: 8, segundos: 5 * 60, descansoSeg: 2 * 60, nota: '100–110 rpm sin subir la potencia; si sube, bajar desarrollo' },
        { zona: 'AER', segundos: 20 * 60 },
      ],
    },
  },
  {
    id: 'activacion',
    nombre: 'Activación (víspera)',
    objetivo: 'Rodaje corto con unas aceleraciones muy breves. Es la sesión del día antes: despierta el sistema nervioso sin dejar nada de fatiga.',
    origen: 'propuesta', fuente: 'B1-00b · Z1 ciclismo (recuperación activa) · B1-08 (el tapering mantiene la densidad de calidad con volumen bajo)',
    aviso: 'La sesión de víspera no viene descrita como método en las notas de zonas. La estructura es nuestra: volumen corto de Z1 con aceleraciones de pocos segundos, que es la forma habitual de activar sin fatigar, y encaja con lo que B1-08 dice del tapering (menos volumen, la calidad no desaparece).',
    principal: {
      principiante: [
        { zona: 'AER', segundos: 20 * 60 },
        { zona: 'PAE', series: 3, segundos: 20, descansoSeg: 3 * 60, nota: 'Aceleraciones cortas, sin llegar a apretar de verdad' },
        { zona: 'AER', segundos: 5 * 60 },
      ],
      intermedio: [
        { zona: 'AER', segundos: 25 * 60 },
        { zona: 'PAE', series: 4, segundos: 20, descansoSeg: 3 * 60, nota: 'Aceleraciones cortas, sin llegar a apretar de verdad' },
        { zona: 'AER', segundos: 5 * 60 },
      ],
      avanzado: [
        { zona: 'AER', segundos: 30 * 60 },
        { zona: 'PAE', series: 5, segundos: 20, descansoSeg: 3 * 60, nota: 'Aceleraciones cortas, sin llegar a apretar de verdad' },
        { zona: 'AER', segundos: 5 * 60 },
      ],
    },
  },
]

const CIC_AEL: VarianteSesion[] = [
  {
    id: 'bloques-tempo',
    nombre: 'Fondo con bloques de tempo',
    objetivo: 'Base y estímulo de umbral aeróbico en la misma salida. Es la respuesta de la fuente para quien no tiene horas: mete calidad dentro del fondo en vez de pedir otro día.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z2 («Fondo con bloques de tempo»)',
    // B1-00d Z2: "Z2 continuo + 3–4 × 10 min Z3 intercalados, 90–150 min"
    principal: {
      principiante: [
        { zona: 'AEL', segundos: 30 * 60, nota: 'Rodar de entrada' },
        { zona: 'AEM', series: 3, segundos: 10 * 60, descansoSeg: 10 * 60, nota: 'Bloques intercalados; entre ellos se sigue rodando en AEL' },
        { zona: 'AEL', segundos: 20 * 60 },
      ],
      intermedio: [
        { zona: 'AEL', segundos: 40 * 60, nota: 'Rodar de entrada' },
        { zona: 'AEM', series: 4, segundos: 10 * 60, descansoSeg: 10 * 60, nota: 'Bloques intercalados; entre ellos se sigue rodando en AEL' },
        { zona: 'AEL', segundos: 20 * 60 },
      ],
      avanzado: [
        { zona: 'AEL', segundos: 50 * 60, nota: 'Rodar de entrada' },
        { zona: 'AEM', series: 4, segundos: 10 * 60, descansoSeg: 12 * 60, nota: 'Bloques intercalados; entre ellos se sigue rodando en AEL' },
        { zona: 'AEL', segundos: 30 * 60 },
      ],
    },
  },
  {
    id: 'montana',
    nombre: 'Fondo en montaña',
    objetivo: 'El mismo fondo, pero con el terreno poniendo la intensidad: llano en AEL y subidas moderadas en AEM. Para quien entrena en carretera con desnivel.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z2 («Fondo en montaña»)',
    // B1-00d Z2: "Z2 en llano, Z3 en subidas moderadas, 90–180 min"
    principal: {
      principiante: [
        { zona: 'AEL', segundos: 60 * 60, nota: 'Llano' },
        { zona: 'AEM', series: 4, segundos: 5 * 60, descansoSeg: 6 * 60, nota: 'Subidas moderadas; la bajada y el llano son la recuperación' },
      ],
      intermedio: [
        { zona: 'AEL', segundos: 80 * 60, nota: 'Llano' },
        { zona: 'AEM', series: 5, segundos: 8 * 60, descansoSeg: 8 * 60, nota: 'Subidas moderadas; la bajada y el llano son la recuperación' },
      ],
      avanzado: [
        { zona: 'AEL', segundos: 100 * 60, nota: 'Llano' },
        { zona: 'AEM', series: 6, segundos: 10 * 60, descansoSeg: 8 * 60, nota: 'Subidas moderadas; la bajada y el llano son la recuperación' },
      ],
    },
  },
]

const CIC_AEL_EXTRA: VarianteSesion[] = [
  {
    id: 'progresivo',
    nombre: 'Fondo progresivo',
    objetivo: 'El mismo fondo acabando más fuerte de lo que se empezó. La última parte se rueda ya cansado y a intensidad de competición, que es exactamente lo que pasa el día de la prueba.',
    origen: 'propuesta', fuente: 'B1-00b · Z2 ciclismo (el rango del fondo) · B1-00b Z3 («pace-setting: aprender a rodar a ritmo de carrera»)',
    aviso: 'El fondo progresivo no aparece como método con nombre propio en las notas. La estructura es nuestra: se toma el rango del fondo de Z2 y se dedica el último tercio a Z3, aplicando el principio de pace-setting que B1-00b sí documenta para esa zona.',
    principal: {
      principiante: [
        { zona: 'AEL', segundos: 60 * 60 },
        { zona: 'AEM', segundos: 25 * 60, nota: 'Último tercio, sin parar' },
      ],
      intermedio: [
        { zona: 'AEL', segundos: 90 * 60 },
        { zona: 'AEM', segundos: 35 * 60, nota: 'Último tercio, sin parar' },
      ],
      avanzado: [
        { zona: 'AEL', segundos: 130 * 60 },
        { zona: 'AEM', segundos: 45 * 60, nota: 'Último tercio, sin parar' },
      ],
    },
  },
]

const CIC_AEM: VarianteSesion[] = [
  {
    id: 'continuo',
    nombre: 'Tempo continuo',
    objetivo: 'Un solo bloque en vez de fraccionado. Más exigente mentalmente y más parecido a lo que se hace en competición larga, donde no hay pausas.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z3 («Tempo continuo»)',
    // B1-00d Z3: "1 bloque, 20–60 min"
    principal: {
      principiante: [{ zona: 'AEM', segundos: 20 * 60 }],
      intermedio: [{ zona: 'AEM', segundos: 40 * 60 }],
      avanzado: [{ zona: 'AEM', segundos: 60 * 60 }],
    },
  },
  {
    id: 'sweet-spot',
    nombre: 'Sweet Spot',
    objetivo: 'El extremo alto del tempo (87–93 % FTP): la mejor relación entre adaptación conseguida y tiempo invertido. La sesión de calidad de quien entrena poco.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z3 («Sweet Spot», 87–93 % FTP)',
    // B1-00d Z3: "2 × 20 min o 3 × 15 min, pausa 5 min"
    principal: {
      principiante: [{ zona: 'AEM', series: 2, segundos: 15 * 60, descansoSeg: 5 * 60, nota: '87–93 % FTP — el extremo alto de la zona' }],
      intermedio: [{ zona: 'AEM', series: 3, segundos: 15 * 60, descansoSeg: 5 * 60, nota: '87–93 % FTP — el extremo alto de la zona' }],
      avanzado: [{ zona: 'AEM', series: 2, segundos: 20 * 60, descansoSeg: 5 * 60, nota: '87–93 % FTP — el extremo alto de la zona' }],
    },
  },
  {
    id: 'fartlek',
    nombre: 'Fartlek en ruta',
    objetivo: 'Entrar y salir del tempo según el terreno, sin cronómetro. Para quien entrena en carretera y no puede sostener bloques exactos.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z3 («Fartlek en ruta») · B1-00b Z3',
    // B1-00b Z3 ciclismo: "terreno ondulado, subidas moderadas, 30–60 min"
    principal: {
      principiante: [
        { zona: 'AEM', series: 5, segundos: 3 * 60, descansoSeg: 3 * 60, nota: 'Subidas y repechos' },
        { zona: 'AEL', segundos: 15 * 60, nota: 'El llano entre medias' },
      ],
      intermedio: [
        { zona: 'AEM', series: 6, segundos: 4 * 60, descansoSeg: 4 * 60, nota: 'Subidas y repechos' },
        { zona: 'AEL', segundos: 20 * 60, nota: 'El llano entre medias' },
      ],
      avanzado: [
        { zona: 'AEM', series: 8, segundos: 4 * 60, descansoSeg: 4 * 60, nota: 'Subidas y repechos' },
        { zona: 'AEL', segundos: 25 * 60, nota: 'El llano entre medias' },
      ],
    },
  },
]

const CIC_AEI: VarianteSesion[] = [
  {
    id: 'continuo',
    nombre: 'FTP continuo',
    objetivo: 'Un bloque único al umbral, sin pausas. B1-00d la reserva a atletas con el FTP bien establecido: sostener 40 min seguidos es otra cosa que 4 × 10.',
    origen: 'propuesta', fuente: 'B1-00d · Ciclismo Z4 («FTP continuo», 1 × 30–45 min)',
    aviso: 'La fuente da esta sesión SOLO para atletas avanzados y en un rango de 30–45 min. Los niveles principiante e intermedio son una extensión nuestra acortando el bloque: por debajo de 20 min continuos al FTP el estímulo se queda corto, y por encima de 45 hay que tener el FTP muy fiable.',
    principal: {
      principiante: [{ zona: 'AEI', segundos: 20 * 60 }],
      intermedio: [{ zona: 'AEI', segundos: 30 * 60 }],
      avanzado: [{ zona: 'AEI', segundos: 45 * 60 }],
    },
  },
  {
    id: 'over-unders',
    nombre: 'Over-unders',
    objetivo: 'Alternar por debajo y por encima del umbral sin parar. Enseña a tolerar lactato mientras se sigue pedaleando: es lo que pasa de verdad en las subidas de una competición.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z4 («Over-unders» de Coggan)',
    // B1-00d Z4: "3 min al 95% FTP + 1 min al 108% FTP · bloques de 8–12 min ·
    // 5 min Z1 entre bloques · 3–4 bloques". El 95 % cae en AEI y el 108 % en PAE:
    // por eso son dos bloques y no uno. Las series están calculadas para que el
    // total cuadre con los bloques de la fuente.
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento (la sesión no tiene pausas dentro del bloque)' }],
    principal: {
      // 3 bloques de 8′ = 6 repeticiones de (3′ + 1′)
      principiante: [
        { zona: 'AEI', series: 6, segundos: 3 * 60, nota: '«Under» 95 % FTP · 3 bloques de 2 repeticiones, 5′ suaves entre bloques' },
        { zona: 'PAE', series: 6, segundos: 60, nota: '«Over» 108 % FTP · va detrás de cada «under», sin pausa entre los dos' },
      ],
      // 3 bloques de 12′ = 9 repeticiones
      intermedio: [
        { zona: 'AEI', series: 9, segundos: 3 * 60, nota: '«Under» 95 % FTP · 3 bloques de 3 repeticiones, 5′ suaves entre bloques' },
        { zona: 'PAE', series: 9, segundos: 60, nota: '«Over» 108 % FTP · va detrás de cada «under», sin pausa entre los dos' },
      ],
      // 4 bloques de 12′ = 12 repeticiones
      avanzado: [
        { zona: 'AEI', series: 12, segundos: 3 * 60, nota: '«Under» 95 % FTP · 4 bloques de 3 repeticiones, 5′ suaves entre bloques' },
        { zona: 'PAE', series: 12, segundos: 60, nota: '«Over» 108 % FTP · va detrás de cada «under», sin pausa entre los dos' },
      ],
    },
  },
]

const CIC_PAE: VarianteSesion[] = [
  {
    id: 'largos',
    nombre: 'Intervalos largos VO₂max',
    objetivo: 'Bloques de 6–8 min en vez de 3–5. Más tiempo acumulado cerca del VO₂max por repetición, a cambio de menos repeticiones.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z5 («Intervalos largos VO₂max»)',
    // B1-00d Z5: "3–5 × 6–8 min, recuperación 1:1 a 1:1,2"
    principal: {
      principiante: [{ zona: 'PAE', series: 3, segundos: 6 * 60, descansoSeg: 6 * 60, nota: '95–110 rpm' }],
      intermedio: [{ zona: 'PAE', series: 4, segundos: 6 * 60, descansoSeg: 7 * 60, nota: '95–110 rpm' }],
      avanzado: [{ zona: 'PAE', series: 5, segundos: 8 * 60, descansoSeg: 8 * 60, nota: '95–110 rpm' }],
    },
  },
  {
    id: '40-20',
    nombre: 'Protocolo 40/20',
    objetivo: 'Micro-intervalos: el corazón llega al mismo pico de VO₂max pero la pierna acumula bastante menos carga. En triatlón importa, porque después hay que correr.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z5 («Protocolo noruego 40/20»)',
    // B1-00d Z5: "40 s al 110% FTP / 20 s al 55% FTP · 3 series de 8–10 rep ·
    // 5 min Z1 entre series". El 110 % FTP cae en PAE.
    principal: {
      principiante: [{ zona: 'PAE', series: 24, segundos: 40, descansoSeg: 20, nota: '40″ al 110 % FTP / 20″ suaves · 3 series de 8, con 5′ suaves entre series' }],
      intermedio: [{ zona: 'PAE', series: 27, segundos: 40, descansoSeg: 20, nota: '40″ al 110 % FTP / 20″ suaves · 3 series de 9, con 5′ suaves entre series' }],
      avanzado: [{ zona: 'PAE', series: 30, segundos: 40, descansoSeg: 20, nota: '40″ al 110 % FTP / 20″ suaves · 3 series de 10, con 5′ suaves entre series' }],
    },
  },
  {
    id: '30-30',
    nombre: 'Protocolo 30/30',
    objetivo: 'La versión de Billat de los micro-intervalos: más corta y más asequible que el 40/20, con el mismo principio.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z5 («Protocolo 30/30, adaptado de Billat»)',
    // B1-00d Z5: "30 s al 115% FTP / 30 s al 55% FTP, 15–25 min total"
    principal: {
      principiante: [{ zona: 'PAE', series: 15, segundos: 30, descansoSeg: 30, nota: '30″ al 115 % FTP / 30″ suaves' }],
      intermedio: [{ zona: 'PAE', series: 20, segundos: 30, descansoSeg: 30, nota: '30″ al 115 % FTP / 30″ suaves' }],
      avanzado: [{ zona: 'PAE', series: 25, segundos: 30, descansoSeg: 30, nota: '30″ al 115 % FTP / 30″ suaves' }],
    },
  },
]

const CIC_CLA: VarianteSesion[] = [
  {
    id: 'treinta-seg',
    nombre: 'Sprints de 30 s',
    objetivo: 'Más repeticiones y más cortas que los sprints subumbrales. Acumula menos volumen total pero pega más fuerte por repetición.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z6 («Sprints de 30 s»)',
    // B1-00d Z6: "8–12 × 30 s, recuperación 2–4 min completa"
    principal: {
      principiante: [{ zona: 'CLA', series: 8, segundos: 30, descansoSeg: 4 * 60 }],
      intermedio: [{ zona: 'CLA', series: 10, segundos: 30, descansoSeg: 3 * 60 }],
      avanzado: [{ zona: 'CLA', series: 12, segundos: 30, descansoSeg: 2 * 60 }],
    },
  },
  {
    id: 'subida',
    nombre: 'Aceleraciones en subida',
    objetivo: 'La misma zona con la cuesta poniendo la resistencia. La bajada es la recuperación, así que la sesión se organiza sola.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z6 («Aceleraciones en subida»)',
    // B1-00d Z6: "5–8 × 60 s cuesta arriba, recuperación = bajada (2–3 min)"
    principal: {
      principiante: [{ zona: 'CLA', series: 5, segundos: 60, descansoSeg: 3 * 60, nota: 'Cuesta arriba; la bajada es la recuperación' }],
      intermedio: [{ zona: 'CLA', series: 6, segundos: 60, descansoSeg: 3 * 60, nota: 'Cuesta arriba; la bajada es la recuperación' }],
      avanzado: [{ zona: 'CLA', series: 8, segundos: 60, descansoSeg: 2 * 60, nota: 'Cuesta arriba; la bajada es la recuperación' }],
    },
  },
]

const CIC_CALA: VarianteSesion[] = [
  {
    id: 'cuesta-abajo',
    nombre: 'Sprints cuesta abajo',
    objetivo: 'Sprint con cadencia altísima aprovechando el descenso. Trabaja la coordinación neuromuscular a velocidad de pedaleo que en llano no se alcanza.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z7 («Sprints cuesta abajo»)',
    // B1-00d Z7: "6–10 s en ligero descenso, recuperación 4–5 min, 6–8 sprints"
    principal: {
      principiante: [{ zona: 'CALA', series: 6, segundos: 6, descansoSeg: 5 * 60, nota: 'Ligero descenso, cadencia máxima' }],
      intermedio: [{ zona: 'CALA', series: 7, segundos: 8, descansoSeg: 5 * 60, nota: 'Ligero descenso, cadencia máxima' }],
      avanzado: [{ zona: 'CALA', series: 8, segundos: 10, descansoSeg: 4 * 60, nota: 'Ligero descenso, cadencia máxima' }],
    },
  },
]

// ------------------------------------------------------------
// 🏊 NATACIÓN — B1-00d Parte 2
// ------------------------------------------------------------

const NAT_AER: VarianteSesion[] = [
  {
    id: 'recuperacion',
    nombre: 'Recuperación activa',
    objetivo: 'Nado continuo sin drills, para el día después de una sesión dura. El objetivo es mover, no aprender.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z1 («Sesión de recuperación activa»)',
    // B1-00d Z1: "1.000–1.500m continuo o con pausa mínima"
    principal: {
      principiante: [{ zona: 'AER', metros: 1000, nota: 'Continuo, sin pausas' }],
      intermedio: [{ zona: 'AER', metros: 1200, nota: 'Continuo, sin pausas' }],
      avanzado: [{ zona: 'AER', metros: 1500, nota: 'Continuo, sin pausas' }],
    },
  },
]

const NAT_AER_EXTRA: VarianteSesion[] = [
  {
    id: 'tecnica-extensiva',
    nombre: 'Técnica extensiva',
    objetivo: 'Volumen de drills, no cuatro al principio. La fuente lo explica bien: la técnica siempre acaba siendo Z1 porque la concentración que exige limita la intensidad sola.',
    origen: 'documentado', fuente: 'B1-00b · Z1 natación («Técnica extensiva», 1.000–2.500 m)',
    principal: {
      principiante: [
        { zona: 'AER', series: 8, metros: 50, descansoSeg: 20, nota: 'Drills: catch-up, zipper, fist' },
        { zona: 'AER', metros: 600, nota: 'Nado completo pensando en lo que se acaba de hacer' },
      ],
      intermedio: [
        { zona: 'AER', series: 12, metros: 50, descansoSeg: 20, nota: 'Drills: catch-up, zipper, fist, puño cerrado, un brazo' },
        { zona: 'AER', metros: 1000, nota: 'Nado completo pensando en lo que se acaba de hacer' },
      ],
      avanzado: [
        { zona: 'AER', series: 16, metros: 50, descansoSeg: 20, nota: 'Drills: catch-up, zipper, fist, puño cerrado, un brazo' },
        { zona: 'AER', metros: 1700, nota: 'Nado completo pensando en lo que se acaba de hacer' },
      ],
    },
  },
]

const NAT_AEL: VarianteSesion[] = [
  {
    id: 'continuo',
    nombre: 'Continuo largo',
    objetivo: 'Un solo bloque sin pausas. Exige control de ritmo: en cuanto te desvías a AEM ya no es esta sesión.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z2 («Continuo largo»)',
    // B1-00d Z2: "1 × 2.000–3.000m. Solo si el atleta puede mantener el ritmo Z2
    // sin desviarse a Z3"
    principal: {
      principiante: [{ zona: 'AEL', metros: 2000, nota: 'Sin pausa; si el ritmo se te va hacia arriba, para la serie' }],
      intermedio: [{ zona: 'AEL', metros: 2500, nota: 'Sin pausa; si el ritmo se te va hacia arriba, para la serie' }],
      avanzado: [{ zona: 'AEL', metros: 3000, nota: 'Sin pausa; si el ritmo se te va hacia arriba, para la serie' }],
    },
  },
  {
    id: 'fartlek',
    nombre: 'Fartlek de natación',
    objetivo: 'Alternar base y tempo sin pausa. Mete variación sin montar intervalos formales, y rompe la monotonía del continuo largo.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z2 («Fartlek de natación»)',
    // B1-00d Z2: "Alternar 200m Z2 + 100m Z3, 1.500–2.400m, sin pausa"
    principal: {
      principiante: [
        { zona: 'AEL', series: 5, metros: 200, nota: 'Alterna con el bloque siguiente, sin pausa' },
        { zona: 'AEM', series: 5, metros: 100 },
      ],
      intermedio: [
        { zona: 'AEL', series: 6, metros: 200, nota: 'Alterna con el bloque siguiente, sin pausa' },
        { zona: 'AEM', series: 6, metros: 100 },
      ],
      avanzado: [
        { zona: 'AEL', series: 8, metros: 200, nota: 'Alterna con el bloque siguiente, sin pausa' },
        { zona: 'AEM', series: 8, metros: 100 },
      ],
    },
  },
]

const NAT_AEL_EXTRA: VarianteSesion[] = [
  {
    id: 'pull-kick',
    nombre: 'Series con pull y pies',
    objetivo: 'La misma base partida en tren superior y patada. Aísla cada mitad de la brazada, y en triatlón el pull tiene sentido extra: se compite con neopreno, que hace justo eso.',
    origen: 'propuesta', fuente: 'B1-00b · Z2 natación (rango y «foco en stroke rate estable») · B1-15 (el neopreno eleva las piernas)',
    aviso: 'B1-00b da la Z2 de natación como series largas extensivas y no describe el trabajo con pull-buoy y tabla como método propio. El reparto entre nado completo, pull y pies es nuestro: respeta el volumen y el ritmo de la zona.',
    principal: {
      principiante: [
        { zona: 'AEL', series: 3, metros: 200, descansoSeg: 30, nota: 'Nado completo' },
        { zona: 'AEL', series: 3, metros: 200, descansoSeg: 30, nota: 'Con pull-buoy' },
        { zona: 'AEL', series: 4, metros: 50, descansoSeg: 30, nota: 'Solo pies, con tabla' },
      ],
      intermedio: [
        { zona: 'AEL', series: 4, metros: 200, descansoSeg: 30, nota: 'Nado completo' },
        { zona: 'AEL', series: 4, metros: 200, descansoSeg: 30, nota: 'Con pull-buoy' },
        { zona: 'AEL', series: 6, metros: 50, descansoSeg: 30, nota: 'Solo pies, con tabla' },
      ],
      avanzado: [
        { zona: 'AEL', series: 5, metros: 300, descansoSeg: 30, nota: 'Nado completo' },
        { zona: 'AEL', series: 5, metros: 200, descansoSeg: 30, nota: 'Con pull-buoy' },
        { zona: 'AEL', series: 8, metros: 50, descansoSeg: 30, nota: 'Solo pies, con tabla' },
      ],
    },
  },
]

const NAT_AEM: VarianteSesion[] = [
  {
    id: 'descenso',
    nombre: 'Series en descenso',
    objetivo: 'Cada serie más rápida que la anterior: se empieza en base y se acaba en umbral. Enseña a gestionar el ritmo, que es lo que falla en la salida de un triatlón.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z3 («Descenso en series»)',
    // B1-00d Z3: "3 × 400m en descenso Z2→Z3→Z4, pausa 45 s"
    principal: {
      principiante: [
        { zona: 'AEL', metros: 300, descansoSeg: 45, nota: '1ª — la más suave' },
        { zona: 'AEM', metros: 300, descansoSeg: 45, nota: '2ª — un punto más' },
        { zona: 'AEI', metros: 300, nota: '3ª — la más rápida' },
      ],
      intermedio: [
        { zona: 'AEL', metros: 400, descansoSeg: 45, nota: '1ª — la más suave' },
        { zona: 'AEM', metros: 400, descansoSeg: 45, nota: '2ª — un punto más' },
        { zona: 'AEI', metros: 400, nota: '3ª — la más rápida' },
      ],
      avanzado: [
        { zona: 'AEL', metros: 500, descansoSeg: 45, nota: '1ª — la más suave' },
        { zona: 'AEM', metros: 500, descansoSeg: 45, nota: '2ª — un punto más' },
        { zona: 'AEI', metros: 500, nota: '3ª — la más rápida' },
      ],
    },
  },
  {
    id: 't-pace',
    nombre: 'T-pace largo',
    objetivo: 'Series de 600–800m en vez de 300–400. Menos repeticiones y más largas: se parece más a nadar una competición.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z3 («T-pace largo»)',
    // B1-00d Z3: "2–3 × 600m / 1–2 × 800m, pausa 60 s"
    principal: {
      principiante: [{ zona: 'AEM', series: 2, metros: 600, descansoSeg: 60 }],
      intermedio: [{ zona: 'AEM', series: 3, metros: 600, descansoSeg: 60 }],
      avanzado: [{ zona: 'AEM', series: 2, metros: 800, descansoSeg: 60 }],
    },
  },
  {
    id: 'continuo',
    nombre: 'Nado continuo a tempo',
    objetivo: 'Un bloque único a ritmo de competición larga, sin pausas donde reorganizar la brazada.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z3 («Nado continuo a tempo»)',
    // B1-00d Z3: "1 × 800–1.200m. Solo atletas con buen nivel técnico"
    principal: {
      principiante: [{ zona: 'AEM', metros: 800 }],
      intermedio: [{ zona: 'AEM', metros: 1000 }],
      avanzado: [{ zona: 'AEM', metros: 1200 }],
    },
  },
]

const NAT_AEI: VarianteSesion[] = [
  {
    id: 'largas',
    nombre: 'Series a CSS largas',
    objetivo: 'Series de 300–400m en vez de 100. Es el formato que B1-00d recomienda para 70.3 e Ironman, donde importa sostener más que repetir.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z4 («Series a CSS largas»)',
    // B1-00d Z4: "4–5 × 300m / 3–4 × 400m, pausa 20–30 s"
    principal: {
      principiante: [{ zona: 'AEI', series: 4, metros: 300, descansoSeg: 30 }],
      intermedio: [{ zona: 'AEI', series: 5, metros: 300, descansoSeg: 25 }],
      avanzado: [{ zona: 'AEI', series: 4, metros: 400, descansoSeg: 25 }],
    },
  },
  {
    id: 'descenso',
    nombre: 'CSS en descenso',
    objetivo: 'Bloques de 150m que empiezan en tempo y acaban en umbral, sin pausa dentro del bloque. Mucho estrés metabólico en poco volumen.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z4 («CSS sets en descenso»)',
    // B1-00d Z4: "4 × [50m Z3 + 50m Z4 + 50m Z4] sin pausa, 20 s entre bloques"
    principal: {
      principiante: [
        { zona: 'AEM', series: 4, metros: 50, nota: 'Primer 50 de cada bloque' },
        { zona: 'AEI', series: 8, metros: 50, descansoSeg: 20, nota: 'Los otros dos 50 del bloque, sin pausa dentro; 20″ entre bloques' },
      ],
      intermedio: [
        { zona: 'AEM', series: 5, metros: 50, nota: 'Primer 50 de cada bloque' },
        { zona: 'AEI', series: 10, metros: 50, descansoSeg: 20, nota: 'Los otros dos 50 del bloque, sin pausa dentro; 20″ entre bloques' },
      ],
      avanzado: [
        { zona: 'AEM', series: 6, metros: 50, nota: 'Primer 50 de cada bloque' },
        { zona: 'AEI', series: 12, metros: 50, descansoSeg: 20, nota: 'Los otros dos 50 del bloque, sin pausa dentro; 20″ entre bloques' },
      ],
    },
  },
]

const NAT_PAE: VarianteSesion[] = [
  {
    id: 'doscientos',
    nombre: 'Intervalos de 200m',
    objetivo: 'Series el doble de largas que las de 100, con más pausa. Más tiempo por repetición cerca del VO₂max.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z5 («Intervalos de 200m intensivos»)',
    // B1-00d Z5: "5–8 × 200m, pausa 45–60 s"
    principal: {
      principiante: [{ zona: 'PAE', series: 5, metros: 200, descansoSeg: 60 }],
      intermedio: [{ zona: 'PAE', series: 6, metros: 200, descansoSeg: 50 }],
      avanzado: [{ zona: 'PAE', series: 8, metros: 200, descansoSeg: 45 }],
    },
  },
  {
    id: 'piramide',
    nombre: 'Pirámide intensiva',
    objetivo: 'Subir y bajar de distancia dentro de la misma sesión. Cada repetición se siente distinta, que es justo lo contrario de 8 × 100.',
    origen: 'propuesta', fuente: 'B1-00d · Natación Z5 («Pirámide intensiva»)',
    aviso: 'La fuente da la pirámide en un solo tamaño (50-100-150-200-150-100-50, 800m). El nivel intermedio es ese exacto; principiante y avanzado son escalados nuestros quitando y añadiendo escalones por los extremos.',
    principal: {
      principiante: [
        { zona: 'PAE', metros: 50, descansoSeg: 30 }, { zona: 'PAE', metros: 100, descansoSeg: 35 },
        { zona: 'PAE', metros: 150, descansoSeg: 40 },
        { zona: 'PAE', metros: 100, descansoSeg: 35 }, { zona: 'PAE', metros: 50 },
      ],
      intermedio: [
        { zona: 'PAE', metros: 50, descansoSeg: 30 }, { zona: 'PAE', metros: 100, descansoSeg: 35 },
        { zona: 'PAE', metros: 150, descansoSeg: 40 }, { zona: 'PAE', metros: 200, descansoSeg: 45 },
        { zona: 'PAE', metros: 150, descansoSeg: 40 }, { zona: 'PAE', metros: 100, descansoSeg: 35 },
        { zona: 'PAE', metros: 50 },
      ],
      avanzado: [
        { zona: 'PAE', metros: 100, descansoSeg: 35 }, { zona: 'PAE', metros: 150, descansoSeg: 40 },
        { zona: 'PAE', metros: 200, descansoSeg: 45 }, { zona: 'PAE', metros: 250, descansoSeg: 50 },
        { zona: 'PAE', metros: 200, descansoSeg: 45 }, { zona: 'PAE', metros: 150, descansoSeg: 40 },
        { zona: 'PAE', metros: 100 },
      ],
    },
  },
  {
    id: 'desafio-50',
    nombre: 'Desafío de sprint',
    objetivo: 'Muchos 50 al máximo sostenible con pausa corta. El reto es que el último se parezca al primero.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z5 («Desafío de sprint»)',
    // B1-00d Z5: "15 × 50m al máximo sostenible, pausa 30 s"
    principal: {
      principiante: [{ zona: 'PAE', series: 10, metros: 50, descansoSeg: 30, nota: 'Máximo SOSTENIBLE: si el último cae mucho, era demasiado rápido' }],
      intermedio: [{ zona: 'PAE', series: 12, metros: 50, descansoSeg: 30, nota: 'Máximo SOSTENIBLE: si el último cae mucho, era demasiado rápido' }],
      avanzado: [{ zona: 'PAE', series: 15, metros: 50, descansoSeg: 30, nota: 'Máximo SOSTENIBLE: si el último cae mucho, era demasiado rápido' }],
    },
  },
]

const NAT_PLA: VarianteSesion[] = [
  {
    id: 'salida',
    nombre: 'Sprints de salida',
    objetivo: 'Simula la salida del triatlón: arrancar a tope desde parado, repetido, con poca pausa. La diferencia con la sesión base es justo esa pausa corta.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z6/Z7 («Sprints de salida»)',
    // B1-00d Z6/Z7: "15–25m, pausa 45–60 s, 8–12 repeticiones"
    principal: {
      principiante: [{ zona: 'PLA', series: 8, metros: 20, descansoSeg: 60, nota: 'Desde la pared, como en una salida' }],
      intermedio: [{ zona: 'PLA', series: 10, metros: 20, descansoSeg: 50, nota: 'Desde la pared, como en una salida' }],
      avanzado: [{ zona: 'PLA', series: 12, metros: 25, descansoSeg: 45, nota: 'Desde la pared, como en una salida' }],
    },
  },
]

const NAT_CALA: VarianteSesion[] = [
  {
    id: 'resistido',
    nombre: 'Nado resistido',
    objetivo: 'Con goma atada a la pared: fuerza específica de brazada. Se nada poco y se descansa mucho, porque lo que se entrena es la aplicación de fuerza, no el metabolismo.',
    origen: 'propuesta', fuente: 'B1-00d · Natación Z6/Z7 («Nado resistido»)',
    aviso: 'La fuente lo agrupa en el cajón anaeróbico Z6/Z7 sin separar capacidad de potencia, igual que pasa con toda la parte aláctica de natación. Se coloca en CALA por su duración (20–30m con recuperación completa), pero la asignación de zona es nuestra.',
    principal: {
      principiante: [{ zona: 'CALA', series: 6, metros: 20, descansoSeg: 3 * 60, nota: 'Con goma atada a la pared' }],
      intermedio: [{ zona: 'CALA', series: 7, metros: 25, descansoSeg: 3 * 60, nota: 'Con goma atada a la pared' }],
      avanzado: [{ zona: 'CALA', series: 8, metros: 30, descansoSeg: 4 * 60, nota: 'Con goma atada a la pared' }],
    },
  },
]

// ------------------------------------------------------------
// 🏃 CARRERA — B1-00b Parte 3 (métodos por zona) + B1-00c Tabla 3 (rangos)
// ------------------------------------------------------------

const CAR_AER: VarianteSesion[] = [
  {
    id: 'tecnica',
    nombre: 'Técnica de carrera (drills)',
    objetivo: 'Los drills de carrera, que mejoran la economía —y la economía es rendimiento sin pedir más forma física. Van al principio y con el atleta fresco: hechos con fatiga se automatiza el gesto malo.',
    origen: 'documentado', fuente: 'B6-03 Parte 6 («Ejercicios de Técnica de Carrera»)',
    // B6-03: "Los drills deben hacerse al inicio de cada sesión, en 2 × 20–30 m
    // cada uno". Catálogo: A-skip, B-skip, ankling, bounding, high knees, carioca.
    // Los niveles son cuántos drills entran, no más metros de cada uno.
    calentamiento: [{ zona: 'AER', segundos: 10 * 60, nota: 'Trote suave antes de los drills' }],
    principal: {
      principiante: [
        { zona: 'AER', series: 8, metros: 25, descansoSeg: 60, nota: '4 drills × 2 pasadas: A-skip, ankling, high knees, carioca' },
        { zona: 'AER', segundos: 20 * 60, nota: 'Rodaje suave después' },
      ],
      intermedio: [
        { zona: 'AER', series: 12, metros: 25, descansoSeg: 60, nota: '6 drills × 2 pasadas: A-skip, B-skip, ankling, bounding, high knees, carioca' },
        { zona: 'AER', segundos: 30 * 60, nota: 'Rodaje suave después' },
      ],
      avanzado: [
        { zona: 'AER', series: 12, metros: 30, descansoSeg: 60, nota: '6 drills × 2 pasadas, a 30 m: A-skip, B-skip, ankling, bounding, high knees, carioca' },
        { zona: 'AER', segundos: 40 * 60, nota: 'Rodaje suave después' },
      ],
    },
    vuelta: [{ zona: 'AER', segundos: 5 * 60, nota: 'Vuelta a la calma' }],
  },
  {
    id: 'strides',
    nombre: 'Rodaje con progresivos',
    objetivo: 'Rodaje suave rematado con progresivos a ritmo de 5K. Mantiene el gesto rápido sin meter carga: es la sesión que se puede poner el día antes de una serie sin comprometerla.',
    origen: 'documentado', fuente: 'B6-03 Parte 6 («Strides»: 80–100 m a ritmo 5K, descanso completo)',
    // El ritmo de 5K son 95–97 % de la VAM (B1-00c, «Relaciones VAM con el
    // rendimiento»), que en lib/zonas.ts es PAE. Por eso los progresivos van en
    // PAE y no en AER: la sesión es suave, los progresivos no.
    principal: {
      principiante: [
        { zona: 'AER', segundos: 30 * 60 },
        { zona: 'PAE', series: 4, metros: 80, descansoSeg: 180, nota: 'A ritmo de 5K, con recuperación completa. Foco en la postura, no en apretar' },
      ],
      intermedio: [
        { zona: 'AER', segundos: 40 * 60 },
        { zona: 'PAE', series: 6, metros: 100, descansoSeg: 180, nota: 'A ritmo de 5K, con recuperación completa. Foco en la postura, no en apretar' },
      ],
      avanzado: [
        { zona: 'AER', segundos: 50 * 60 },
        { zona: 'PAE', series: 8, metros: 100, descansoSeg: 180, nota: 'A ritmo de 5K, con recuperación completa. Foco en la postura, no en apretar' },
      ],
    },
    vuelta: [{ zona: 'AER', segundos: 5 * 60, nota: 'Vuelta a la calma' }],
  },
]

const CAR_AER_EXTRA: VarianteSesion[] = [
  {
    id: 'regenerativo',
    nombre: 'Trote regenerativo',
    objetivo: 'El trote muy corto del día después de una sesión larga o dura. No busca adaptación —la Z1 no la produce sola—, busca mover la pierna para que llegue mejor a la siguiente.',
    origen: 'documentado', fuente: 'B1-00b · Z1 carrera («Continuo lento K1»: para atletas de 70.3+, salidas de recuperación activa al día siguiente de sesión larga)',
    // B1-00b Z1: 20–60 min, < 70 % FCmax, conversación fácil. Es el extremo corto
    // del rango; la sesión base ya cubre el largo.
    principal: {
      principiante: [{ zona: 'AER', segundos: 20 * 60, nota: 'Conversación fácil. Si cuesta hablar, es demasiado rápido' }],
      intermedio: [{ zona: 'AER', segundos: 30 * 60, nota: 'Conversación fácil. Si cuesta hablar, es demasiado rápido' }],
      avanzado: [{ zona: 'AER', segundos: 40 * 60, nota: 'Conversación fácil. Si cuesta hablar, es demasiado rápido' }],
    },
  },
]

const CAR_AEL: VarianteSesion[] = [
  {
    id: 'ritmo-competicion',
    nombre: 'Tirada con ritmo de competición',
    objetivo: 'La tirada larga con bloques al ritmo del día de la prueba metidos dentro. Se aprende a encontrar ese ritmo cuando ya llevas kilómetros encima, que es la única vez que hace falta encontrarlo.',
    origen: 'propuesta', fuente: 'B1-00b · Z2 carrera (el rango de la tirada) · B1-00b Z3 («pace-setting: aprender a correr a ritmo de carrera específico»)',
    aviso: 'La tirada con bloques a ritmo no viene como método propio. La estructura es nuestra: rango de la tirada de Z2 con bloques de Z3 intercalados, aplicando el pace-setting que B1-00b documenta como aplicación directa de esa zona en triatlón. Se distingue de la progresiva en que aquí los bloques van repartidos, no todo al final.',
    principal: {
      principiante: [
        { zona: 'AEL', segundos: 20 * 60 },
        { zona: 'AEM', series: 2, segundos: 10 * 60, descansoSeg: 5 * 60, nota: 'A ritmo de competición; entre bloques se sigue trotando' },
        { zona: 'AEL', segundos: 15 * 60 },
      ],
      intermedio: [
        { zona: 'AEL', segundos: 25 * 60 },
        { zona: 'AEM', series: 3, segundos: 10 * 60, descansoSeg: 5 * 60, nota: 'A ritmo de competición; entre bloques se sigue trotando' },
        { zona: 'AEL', segundos: 20 * 60 },
      ],
      avanzado: [
        { zona: 'AEL', segundos: 30 * 60 },
        { zona: 'AEM', series: 3, segundos: 15 * 60, descansoSeg: 5 * 60, nota: 'A ritmo de competición; entre bloques se sigue trotando' },
        { zona: 'AEL', segundos: 25 * 60 },
      ],
    },
  },
  {
    id: 'terreno',
    nombre: 'Tirada por terreno',
    objetivo: 'La misma tirada en ondulado o en blando. El desnivel mete la intensidad sin pedir velocidad y la tierra baja el impacto, así que es la forma de sostener volumen cuando la pierna va justa.',
    origen: 'propuesta', fuente: 'B1-00c Tabla 3 · Tuimil Z2 (rango) · B1-00d Ciclismo Z2 («fondo en montaña», el principio de dejar que el terreno ponga la intensidad)',
    aviso: 'Las notas de carrera dan la tirada en llano y no describen la variante por terreno. Se traslada el principio que B1-00d sí documenta en ciclismo —el desnivel sube la zona sin cambiar el esfuerzo percibido— respetando el rango de la tirada de Tuimil Z2. El menor impacto del terreno blando es criterio propio.',
    principal: {
      principiante: [
        { zona: 'AEL', segundos: 40 * 60, nota: 'Llano y bajadas' },
        { zona: 'AEM', series: 4, segundos: 3 * 60, descansoSeg: 4 * 60, nota: 'Las subidas: sin apretar, dejando que suba sola la pulsación' },
      ],
      intermedio: [
        { zona: 'AEL', segundos: 55 * 60, nota: 'Llano y bajadas' },
        { zona: 'AEM', series: 5, segundos: 4 * 60, descansoSeg: 5 * 60, nota: 'Las subidas: sin apretar, dejando que suba sola la pulsación' },
      ],
      avanzado: [
        { zona: 'AEL', segundos: 70 * 60, nota: 'Llano y bajadas' },
        { zona: 'AEM', series: 6, segundos: 5 * 60, descansoSeg: 5 * 60, nota: 'Las subidas: sin apretar, dejando que suba sola la pulsación' },
      ],
    },
  },
  {
    id: 'progresiva',
    nombre: 'Tirada progresiva',
    objetivo: 'La misma tirada larga, pero acabando más rápido de lo que se empezó. Se corre la última parte cansado y a ritmo de competición, que es exactamente lo que pasa el día de la carrera.',
    origen: 'propuesta', fuente: 'B1-00c Tabla 3 · Tuimil Z2 (rango de la tirada) · B1-00b Z3 («continuo variable», el principio de alternar dentro de un continuo)',
    aviso: 'Ni B1-00b ni B1-00c dan la tirada progresiva como método con nombre propio. La estructura es nuestra: se toma el rango de la tirada de Tuimil Z2 y se dedica el último tercio a AEM, aplicando el principio del «continuo variable» que sí está documentado en Z3.',
    principal: {
      principiante: [
        { zona: 'AEL', segundos: 40 * 60 },
        { zona: 'AEM', segundos: 20 * 60, nota: 'Último tercio, sin parar' },
      ],
      intermedio: [
        { zona: 'AEL', segundos: 60 * 60 },
        { zona: 'AEM', segundos: 30 * 60, nota: 'Último tercio, sin parar' },
      ],
      avanzado: [
        { zona: 'AEL', segundos: 80 * 60 },
        { zona: 'AEM', segundos: 40 * 60, nota: 'Último tercio, sin parar' },
      ],
    },
  },
]

const CAR_AEM: VarianteSesion[] = [
  {
    id: 'variable',
    nombre: 'Continuo variable',
    objetivo: 'Alternar tempo y base sin parar del todo. Más tolerable que el continuo puro y con la misma adaptación.',
    origen: 'documentado', fuente: 'B1-00b · Z3 carrera («Continuo variable»)',
    // B1-00b Z3: "Tramos 3–5 min Z3 / 2–3 min Z2, 20–50 min"
    principal: {
      principiante: [
        { zona: 'AEM', series: 5, segundos: 3 * 60, nota: 'Alterna con el bloque siguiente, sin parar' },
        { zona: 'AEL', series: 5, segundos: 2 * 60 },
      ],
      intermedio: [
        { zona: 'AEM', series: 6, segundos: 4 * 60, nota: 'Alterna con el bloque siguiente, sin parar' },
        { zona: 'AEL', series: 6, segundos: 150 },
      ],
      avanzado: [
        { zona: 'AEM', series: 6, segundos: 5 * 60, nota: 'Alterna con el bloque siguiente, sin parar' },
        { zona: 'AEL', series: 6, segundos: 3 * 60 },
      ],
    },
  },
]

const CAR_AEM_INT: VarianteSesion[] = [
  {
    id: 'continuo-k4',
    nombre: 'Continuo corto (K4)',
    objetivo: 'El mismo trabajo de umbral pero de una tacada, sin fraccionar. La fuente lo da como método hermano del interválico largo, en la misma zona.',
    origen: 'documentado', fuente: 'B1-00b · Z4 carrera («Continuo corto, K4») · B1-00c Tabla 3 Z4',
    // B1-00b Z4: "12–45 min continuo, 1 bloque al 80–85% VAM"
    principal: {
      principiante: [{ zona: 'AEM', segundos: 15 * 60, nota: '80–85 % VAM, sin pausas' }],
      intermedio: [{ zona: 'AEM', segundos: 25 * 60, nota: '80–85 % VAM, sin pausas' }],
      avanzado: [{ zona: 'AEM', segundos: 40 * 60, nota: '80–85 % VAM, sin pausas' }],
    },
  },
]

const CAR_AEI: VarianteSesion[] = [
  {
    id: '30-30',
    nombre: '30/30 (Billat)',
    objetivo: 'Micro-intervalos en carrera: acumula tiempo cerca del VO₂max con mucho menos estrés articular que las series largas. Útil cuando la pierna no aguanta más impacto.',
    origen: 'documentado', fuente: 'B1-00b · Z5 carrera («30/30, Billat»)',
    // B1-00b Z5: "30 s al 100% VAM / 30 s al 60% VAM, activa, 10–20 repeticiones"
    principal: {
      principiante: [{ zona: 'AEI', series: 10, segundos: 30, descansoSeg: 30, nota: '30″ al 100 % VAM / 30″ trotando al 60 %' }],
      intermedio: [{ zona: 'AEI', series: 15, segundos: 30, descansoSeg: 30, nota: '30″ al 100 % VAM / 30″ trotando al 60 %' }],
      avanzado: [{ zona: 'AEI', series: 20, segundos: 30, descansoSeg: 30, nota: '30″ al 100 % VAM / 30″ trotando al 60 %' }],
    },
  },
  {
    id: '1k-2k',
    nombre: 'Series de 1K–2K',
    objetivo: 'La sesión clásica de pista. Mismas distancias que la base pero con la recuperación bastante más corta: eso la hace otra sesión, no la misma más fácil.',
    origen: 'documentado', fuente: 'B1-00b · Z5 carrera («Interv. 1K–2K»)',
    // B1-00b Z5: "1.000–2.000m, recuperación 90 s–3 min, 3–6 reps, 95–100% VAM"
    principal: {
      principiante: [{ zona: 'AEI', series: 3, metros: 1000, descansoSeg: 150 }],
      intermedio: [{ zona: 'AEI', series: 4, metros: 1000, descansoSeg: 120 }],
      avanzado: [{ zona: 'AEI', series: 3, metros: 2000, descansoSeg: 180 }],
    },
  },
]

const CAR_PAE: VarianteSesion[] = [
  {
    id: 'corto',
    nombre: 'Interválico corto',
    objetivo: 'Series de 200–500m en vez de 400–800, más rápidas y con el doble de recuperación. Trabaja el extremo alto de la potencia aeróbica.',
    origen: 'documentado', fuente: 'B1-00b · Z6 carrera («Interv. aeróbico corto»)',
    // B1-00b Z6: "30 s–90 s / 200–500m, recuperación 1:2, 6–10 reps a 106–115% VAM"
    principal: {
      principiante: [{ zona: 'PAE', series: 6, metros: 200, descansoSeg: 60, nota: '106–115 % VAM' }],
      intermedio: [{ zona: 'PAE', series: 8, metros: 300, descansoSeg: 100, nota: '106–115 % VAM' }],
      avanzado: [{ zona: 'PAE', series: 10, metros: 400, descansoSeg: 140, nota: '106–115 % VAM' }],
    },
  },
  {
    id: 'cuestas',
    nombre: 'Series en cuesta',
    objetivo: 'La misma zona con la pendiente poniendo la carga. Menos velocidad para el mismo esfuerzo, así que menos impacto: es la forma de meter calidad cuando la pierna está tocada.',
    origen: 'propuesta', fuente: 'B1-00c Tabla 3 · Tuimil Z6 (duración y recuperación) · B1-00d Ciclismo Z6 (el principio de usar la cuesta, documentado en bici)',
    aviso: 'Las series en cuesta no aparecen como método propio en las notas de carrera: B1-00b y B1-00c dan la Z6 en llano. La estructura respeta la duración (30 s–3 min) y la recuperación de Tuimil Z6, y traslada a carrera el uso de la pendiente que B1-00d sí documenta en ciclismo. La bajada trotando es la recuperación.',
    principal: {
      principiante: [{ zona: 'PAE', series: 6, segundos: 45, descansoSeg: 120, nota: 'Cuesta arriba; se baja trotando' }],
      intermedio: [{ zona: 'PAE', series: 8, segundos: 60, descansoSeg: 150, nota: 'Cuesta arriba; se baja trotando' }],
      avanzado: [{ zona: 'PAE', series: 10, segundos: 90, descansoSeg: 180, nota: 'Cuesta arriba; se baja trotando' }],
    },
  },
]

const CAR_CLA: VarianteSesion[] = [
  {
    id: 'pruebas-repetidas',
    nombre: 'Pruebas repetidas',
    objetivo: 'Menos repeticiones, más largas y con recuperación completa entre ellas. Cada una se corre entera, no se dosifica para llegar a la siguiente.',
    origen: 'documentado', fuente: 'B1-00b · Z7 carrera («Pruebas repetidas»)',
    // B1-00b Z7: "200–400m, 3–5 min entre cada, 3–6 repeticiones"
    principal: {
      principiante: [{ zona: 'CLA', series: 3, metros: 200, descansoSeg: 4 * 60 }],
      intermedio: [{ zona: 'CLA', series: 4, metros: 300, descansoSeg: 5 * 60 }],
      avanzado: [{ zona: 'CLA', series: 6, metros: 400, descansoSeg: 5 * 60 }],
    },
  },
]

// ------------------------------------------------------------
// El mapa: id de plantilla → sus variantes
// ------------------------------------------------------------
// Las plantillas que no aparecen aquí no tienen variantes, y eso es correcto:
// ver la nota de la cabecera sobre dónde tiene sentido meterlas.
export const VARIANTES: Record<string, VarianteSesion[]> = {
  // Ciclismo
  'cic-aer': CIC_AER,
  'cic-ael': [...CIC_AEL, ...CIC_AEL_EXTRA],
  'cic-aem': CIC_AEM,
  'cic-aei': CIC_AEI,
  'cic-pae': CIC_PAE,
  'cic-cla': CIC_CLA,
  'cic-cala': CIC_CALA,
  // Natación
  'nat-aer': [...NAT_AER, ...NAT_AER_EXTRA],
  'nat-ael': [...NAT_AEL, ...NAT_AEL_EXTRA],
  'nat-aem': NAT_AEM,
  'nat-aei': NAT_AEI,
  'nat-pae': NAT_PAE,
  'nat-pla': NAT_PLA,
  'nat-cala': NAT_CALA,
  // Carrera
  'car-aer': [...CAR_AER, ...CAR_AER_EXTRA],
  'car-ael': CAR_AEL,
  'car-aem': CAR_AEM,
  'car-aem-int': CAR_AEM_INT,
  'car-aei': CAR_AEI,
  'car-pae': CAR_PAE,
  'car-cla': CAR_CLA,
}
