// ============================================================
// TRIPULSE — Laboratorio: por dónde se empieza un test
// ============================================================
//
// POR QUÉ HAY PLANTILLAS. Un editor que lo permite todo es un editor donde no
// sabes por dónde empezar, y ese es el riesgo real de «que se pueda montar
// cualquier test». Eliges la más parecida y la cambias.
//
// PERO NO ENCIERRAN. La hoja en blanco está al lado y, una vez dentro, en una
// plantilla se toca absolutamente todo: son un punto de partida, no un molde.
//
// Las siete cubren las formas que existen de verdad: repeticiones
// cronometradas, escalonado abierto, ritmo por pitidos, una sola medida, mejor
// de varios intentos, por lado, y hasta que falla.

import { col, fnB, type TestLab } from './lab-constructor'

export interface Plantilla {
  id: string
  nombre: string
  descripcion: string
  distintivo: string
  test: TestLab
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'reps',
    nombre: 'Repeticiones cronometradas',
    descripcion: 'Un 6×100 nadando: el reloj te cierra cada 100 y las brazadas las escribes después.',
    distintivo: 'suma · media · caída',
    test: {
      nombre: '6×100 crol', deporte: 'Natación',
      sueltos: [col({ clave: 'fc_final', etiqueta: 'Pulso al acabar', unidad: 'ppm' })],
      bloques: [{
        clave: 'rep', etiqueta: 'Cada 100', modo: 'cerrado', veces: 6, duracion: 0,
        columnas: [
          col({ clave: 't100', etiqueta: 'Tiempo', unidad: 's', instrumento: 'crono-seg' }),
          col({ clave: 'brazadas', etiqueta: 'Ciclos de brazada', unidad: 'ud' }),
        ],
      }],
      resultados: [
        { nombre: 'total', unidad: 's', formula: [fnB('suma', 't100')] },
        { nombre: 'media100', unidad: 's', formula: [fnB('media', 't100')] },
        { nombre: 'caida', unidad: 's', formula: [fnB('ultima', 't100'), { t: 'op', v: '-' }, fnB('primera', 't100')] },
        { nombre: 'sin_salida', unidad: 's', formula: [fnB('media', 't100', 2, 0)] },
      ],
    },
  },
  {
    id: 'vam',
    nombre: 'VAM — test escalonado',
    descripcion: 'Montreal: la velocidad sube sola, pita al cambiar y marcas hasta qué escalón llegó cada uno.',
    distintivo: 'abierto · en grupo',
    test: {
      nombre: 'VAM (Montreal)', deporte: 'Carrera',
      sueltos: [
        col({ clave: 'inicio', etiqueta: 'Empieza en', unidad: 'km/h', clase: 'dada', valor: '8' }),
        col({ clave: 'incremento', etiqueta: 'Sube cada escalón', unidad: 'km/h', clase: 'dada', valor: '0.5' }),
        col({ clave: 'duracion', etiqueta: 'Dura cada escalón', unidad: 's', clase: 'dada', valor: '60' }),
        col({ clave: 'aguanto', etiqueta: 'Segundos del escalón en que se bajó', unidad: 's' }),
      ],
      bloques: [{
        clave: 'esc', etiqueta: 'Escalón completado', modo: 'abierto', veces: 20,
        duracion: 60, duracionUd: 's', pitaCambio: true, avisoAntes: 5, ritmo: 'no', ritmoCada: 0,
        columnas: [col({
          clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada',
          tipo: 'progresion', desde: 8, paso: 0.5, desdeRef: 'inicio', pasoRef: 'incremento',
        })],
      }],
      resultados: [
        { nombre: 'ultimo', unidad: 'km/h', formula: [fnB('ultima', 'vel')] },
        /* La corrección de Montreal por el escalón que no terminó. El
           incremento y la duración salen de SUS CASILLAS, no de un número
           escrito aquí: cambiarlos para un atleta lento tiene que mover la VAM. */
        { nombre: 'vam', unidad: 'km/h', formula: [
          fnB('ultima', 'vel'), { t: 'op', v: '+' }, { t: 'var', v: 'aguanto' },
          { t: 'op', v: '/' }, { t: 'var', v: 'duracion' }, { t: 'op', v: '*' }, { t: 'var', v: 'incremento' },
        ] },
        { nombre: 'escalones', unidad: 'ud', formula: [fnB('cuantas', 'vel')] },
      ],
    },
  },
  {
    id: 'navette',
    nombre: 'Course navette',
    descripcion: 'El clásico del pitido: suena cada vez que hay que tocar el cono, y el hueco se acorta solo al subir la velocidad.',
    distintivo: 'ritmo por metros',
    test: {
      nombre: 'Course navette (20 m)', deporte: 'Carrera',
      sueltos: [
        col({ clave: 'inicio', etiqueta: 'Empieza en', unidad: 'km/h', clase: 'dada', valor: '8.5' }),
        col({ clave: 'incremento', etiqueta: 'Sube cada palier', unidad: 'km/h', clase: 'dada', valor: '0.5' }),
      ],
      bloques: [{
        clave: 'palier', etiqueta: 'Palier completado', modo: 'abierto', veces: 21,
        duracion: 60, duracionUd: 's', pitaCambio: true, avisoAntes: 0, ritmo: 'metros', ritmoCada: 20,
        columnas: [col({
          clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada',
          tipo: 'progresion', desde: 8.5, paso: 0.5, desdeRef: 'inicio', pasoRef: 'incremento',
        })],
      }],
      resultados: [
        { nombre: 'vfinal', unidad: 'km/h', formula: [fnB('ultima', 'vel')] },
        { nombre: 'paliers', unidad: 'ud', formula: [fnB('cuantas', 'vel')] },
      ],
    },
  },
  {
    id: 'lactato',
    nombre: 'Escalonado con lactato',
    descripcion: 'Igual que la VAM, pero midiendo lactato y pulso en cada escalón.',
    distintivo: 'columna dada + medidas',
    test: {
      nombre: 'Escalonado con lactato', deporte: 'Carrera', sueltos: [],
      bloques: [{
        clave: 'esc', etiqueta: 'Escalón', modo: 'abierto', veces: 12,
        duracion: 180, duracionUd: 'min', pitaCambio: true, avisoAntes: 10, ritmo: 'no', ritmoCada: 0,
        columnas: [
          col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 8, paso: 1 }),
          col({ clave: 'lactato', etiqueta: 'Lactato', unidad: 'mmol/L' }),
          col({ clave: 'fc', etiqueta: 'Pulso', unidad: 'ppm' }),
        ],
      }],
      resultados: [
        { nombre: 'vel_final', unidad: 'km/h', formula: [fnB('ultima', 'vel')] },
        { nombre: 'lactato_pico', unidad: 'mmol/L', formula: [fnB('maximo', 'lactato')] },
        /* El umbral clásico cae ENTRE dos escalones, así que hay que buscarlo
           en la recta que los une. Y si el lactato no llegó a 4, esto se niega
           a devolver un número: extrapolarlo sería inventárselo. */
        { nombre: 'umbral_4', unidad: 'km/h', formula: [{ t: 'fn2', v: 'interpola', x: 'vel', y: 'lactato', a: 4 }] },
        { nombre: 'escalones', unidad: 'ud', formula: [fnB('cuantas', 'vel')] },
      ],
    },
  },
  {
    id: 'rast',
    nombre: 'Sprints repetidos (RAST)',
    descripcion: 'Seis sprints de 35 m. La potencia de cada uno la calcula la app, y de ahí salen la máxima, la media y la fatiga.',
    distintivo: 'columna calculada',
    test: {
      nombre: 'RAST', deporte: 'Carrera',
      sueltos: [col({ clave: 'peso', etiqueta: 'Peso del atleta', unidad: 'kg', clase: 'dada', valor: '70' })],
      bloques: [{
        clave: 's', etiqueta: 'Sprint', modo: 'cerrado', veces: 6, duracion: 0,
        columnas: [
          col({ clave: 'ts', etiqueta: 'Tiempo', unidad: 's', instrumento: 'crono-seg' }),
          /* P = peso · d² / t³ con d = 35 m, o sea peso · 1225 / t³. SE CALCULA
             POR SPRINT: la media de las seis potencias no es la potencia de la
             media de los seis tiempos, porque el cubo no es lineal. Con tiempos
             de 4,8 a 6,1 s se van un 4 %. */
          col({
            clave: 'pot', etiqueta: 'Potencia', unidad: 'W', clase: 'calculada',
            formula: [
              { t: 'var', v: 'peso' }, { t: 'op', v: '*' }, { t: 'num', v: 1225 },
              { t: 'op', v: '/' }, { t: 'op', v: '(' }, { t: 'var', v: 'ts' },
              { t: 'op', v: '^' }, { t: 'num', v: 3 }, { t: 'op', v: ')' },
            ],
          }),
        ],
      }],
      resultados: [
        { nombre: 'p_max', unidad: 'W', formula: [fnB('maximo', 'pot')] },
        { nombre: 'p_media', unidad: 'W', formula: [fnB('media', 'pot')] },
        { nombre: 'fatiga', unidad: 'W/s', formula: [
          { t: 'op', v: '(' }, fnB('maximo', 'pot'), { t: 'op', v: '-' }, fnB('minimo', 'pot'), { t: 'op', v: ')' },
          { t: 'op', v: '/' }, fnB('suma', 'ts'),
        ] },
      ],
    },
  },
  {
    id: 'ift',
    nombre: '30-15 IFT',
    descripcion: 'Treinta segundos corriendo y quince andando, con la velocidad subiendo. El reloj canta los dos tramos.',
    distintivo: 'repetición en tramos',
    test: {
      nombre: '30-15 IFT', deporte: 'Carrera',
      sueltos: [col({ clave: 'inicio', etiqueta: 'Empieza en', unidad: 'km/h', clase: 'dada', valor: '8' })],
      bloques: [{
        clave: 'e', etiqueta: 'Escalón completado', modo: 'abierto', veces: 25,
        duracion: 45, duracionUd: 's',
        /* La repetición no es todo lo mismo: 30 s corriendo y 15 andando. El
           reloj canta cada tramo, que es lo que el atleta necesita oír. */
        tramos: [{ nombre: 'Correr', segundos: 30 }, { nombre: 'Andar', segundos: 15 }],
        pitaCambio: true, avisoAntes: 0, ritmo: 'no', ritmoCada: 0,
        columnas: [col({
          clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada',
          tipo: 'progresion', desde: 8, paso: 0.5, desdeRef: 'inicio',
        })],
      }],
      resultados: [
        { nombre: 'vift', unidad: 'km/h', formula: [fnB('ultima', 'vel')] },
        { nombre: 'escalones', unidad: 'ud', formula: [fnB('cuantas', 'vel')] },
      ],
    },
  },
  {
    id: 'perfil',
    nombre: 'Perfil fuerza-velocidad',
    descripcion: 'Cuatro sprints con cuatro cargas. De la recta que forman salen F0, V0 y la potencia máxima — y te dice cuánto se fía de ella.',
    distintivo: 'recta ajustada',
    test: {
      nombre: 'Perfil fuerza-velocidad', deporte: 'Ciclismo', sueltos: [],
      bloques: [{
        clave: 's', etiqueta: 'Sprint', modo: 'cerrado', veces: 4, duracion: 0,
        columnas: [
          col({ clave: 'carga', etiqueta: 'Carga', unidad: 'N', clase: 'dada', tipo: 'lista', etiquetas: ['100', '200', '300', '400'] }),
          col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'm/s' }),
        ],
      }],
      /* vel = V0 − (V0/F0)·carga. El corte es V0, y F0 sale de −V0/pendiente.
         `se_fia` no es adorno: con los puntos torcidos la recta sale igual, y
         es lo único que lo delata. Además avisa sola. */
      resultados: [
        { nombre: 'v0', unidad: 'm/s', formula: [{ t: 'fn2', v: 'corte', x: 'carga', y: 'vel' }] },
        { nombre: 'pend', unidad: '', formula: [{ t: 'fn2', v: 'pendiente', x: 'carga', y: 'vel' }] },
        { nombre: 'f0', unidad: 'N', formula: [
          { t: 'op', v: '-' }, { t: 'ref', v: 'v0' }, { t: 'op', v: '/' }, { t: 'ref', v: 'pend' },
        ] },
        { nombre: 'p_max', unidad: 'W', formula: [
          { t: 'ref', v: 'f0' }, { t: 'op', v: '*' }, { t: 'ref', v: 'v0' }, { t: 'op', v: '/' }, { t: 'num', v: 4 },
        ] },
        { nombre: 'se_fia', unidad: 'de 1', formula: [{ t: 'fn2', v: 'ajuste', x: 'carga', y: 'vel' }] },
      ],
    },
  },
  {
    id: 'una',
    nombre: 'Una sola medida',
    descripcion: 'Un salto, un dinamómetro, una marca. Una casilla y ya.',
    distintivo: 'sin bloques',
    test: {
      nombre: 'CMJ', deporte: 'Fuerza',
      sueltos: [col({ clave: 'altura', etiqueta: 'Altura del salto', unidad: 'cm' })],
      bloques: [],
      resultados: [{ nombre: 'cmj', unidad: 'cm', formula: [{ t: 'var', v: 'altura' }] }],
    },
  },
  {
    id: 'mejor3',
    nombre: 'Mejor de varios intentos',
    descripcion: 'Tres saltos y te quedas con el mejor. Vale igual para el 1RM por intentos.',
    distintivo: 'maximo · media',
    test: {
      nombre: 'CMJ — mejor de 3', deporte: 'Fuerza', sueltos: [],
      bloques: [{
        clave: 'int', etiqueta: 'Intento', modo: 'cerrado', veces: 3, duracion: 0,
        columnas: [col({ clave: 'altura', etiqueta: 'Altura', unidad: 'cm' })],
      }],
      resultados: [
        { nombre: 'mejor', unidad: 'cm', formula: [fnB('maximo', 'altura')] },
        { nombre: 'media3', unidad: 'cm', formula: [fnB('media', 'altura')] },
      ],
    },
  },
  {
    id: 'iso',
    nombre: 'Isometría por lado',
    descripcion: 'Derecha e izquierda con el mismo protocolo, y la asimetría calculada sola.',
    distintivo: 'columna dada de texto',
    test: {
      nombre: 'Isometría de cuádriceps', deporte: 'Fuerza', sueltos: [],
      bloques: [{
        clave: 'lado', etiqueta: 'Lado', modo: 'cerrado', veces: 2, duracion: 0,
        columnas: [
          col({ clave: 'pierna', etiqueta: 'Pierna', clase: 'dada', tipo: 'lista', etiquetas: ['Derecha', 'Izquierda'] }),
          col({ clave: 'pico', etiqueta: 'Pico de fuerza', unidad: 'N' }),
          col({ clave: 'sosten', etiqueta: 'Tiempo de sostén', unidad: 's', instrumento: 'crono-seg' }),
        ],
      }],
      resultados: [
        { nombre: 'pico_max', unidad: 'N', formula: [fnB('maximo', 'pico')] },
        { nombre: 'asimetria', unidad: '%', formula: [
          { t: 'op', v: '(' }, fnB('maximo', 'pico'), { t: 'op', v: '-' }, fnB('minimo', 'pico'), { t: 'op', v: ')' },
          { t: 'op', v: '/' }, fnB('maximo', 'pico'), { t: 'op', v: '*' }, { t: 'num', v: 100 },
        ] },
      ],
    },
  },
  {
    id: 'rm',
    nombre: 'Fuerza máxima por intentos',
    descripcion: 'Vas subiendo el peso hasta que falla. El número de intentos no se sabe de antemano.',
    distintivo: 'abierto · maximo',
    test: {
      nombre: '1RM sentadilla', deporte: 'Fuerza', sueltos: [],
      bloques: [{
        clave: 'int', etiqueta: 'Intento', modo: 'abierto', veces: 8, duracion: 0,
        columnas: [
          col({ clave: 'peso', etiqueta: 'Peso levantado', unidad: 'kg' }),
          col({ clave: 'rir', etiqueta: 'RIR', unidad: '' }),
        ],
      }],
      resultados: [
        { nombre: 'rm', unidad: 'kg', formula: [fnB('maximo', 'peso')] },
        { nombre: 'intentos', unidad: 'ud', formula: [fnB('cuantas', 'peso')] },
      ],
    },
  },
]

export const plantillaPorId = (id: string): Plantilla | undefined => PLANTILLAS.find(p => p.id === id)
