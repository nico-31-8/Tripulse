// ============================================================
// Las baterías de movimiento: FMS y Nine Test
// ============================================================
//
// Lo que se valora mirando el movimiento, en vídeo (pestaña «Movimiento» de
// Tests). Aquí viven las pruebas, sus criterios y las reglas para puntuar, UNA
// vez: el visor, la lista de la batería, el resultado y lo que ve el deportista
// leen de aquí.
//
// DE DÓNDE SALE CADA CRITERIO (no estaban en la biblioteca):
//  · FMS: la hoja de puntuación del libro «Movement» (Cook, 2010) y el montaje
//    de Cook, Burton, Hoogenboom y Voight (Int J Sports Phys Ther, 2014, parte 1).
//  · Nine Test: Flodström, Heijne, Batt y Frohm (Int J Sports Phys Ther, 2016).
// Van resumidos en castellano; el texto oficial está en esas fuentes.
//
// LO QUE NO SALE DE LA FUENTE: la VISTA desde la que se graba la elevación
// diagonal y la rotación sentado del Nine Test es propuesta nuestra.
//
// LAS REGLAS, en las dos baterías: cada prueba de 0 a 3; si duele, 0; en las de
// dos lados cuenta el PEOR. En el FMS, además, cada prueba de dolor anula
// (deja a 0) la prueba a la que acompaña.
//
// PARA QUÉ SIRVE EL TOTAL: para seguir a la persona consigo misma, no para
// predecir lesiones. Ver Motricidad en la biblioteca (Dorrel 2015: el corte del
// FMS en 14 deja pasar a tres de cada cuatro futuros lesionados).

export type Bateria = 'fms' | 'nine'

/** Desde dónde se graba. */
export type Vista = 'perfil' | 'frente' | 'espalda' | 'atras' | 'arriba'

export const NOMBRE_VISTA: Record<Vista, string> = {
  perfil: 'perfil', frente: 'frente', espalda: 'espalda', atras: 'desde atrás', arriba: 'desde arriba',
}

/** Con su preposición, para la frase: «el vídeo de perfil», «el vídeo desde atrás» (no «de desde atrás»). */
export const DE_VISTA: Record<Vista, string> = {
  perfil: 'de perfil', frente: 'de frente', espalda: 'de espalda', atras: 'desde atrás', arriba: 'desde arriba',
}

/** Con qué se comprueba un criterio sobre el fotograma. */
export type Comprobacion = 'angulo' | 'plomada' | 'horizontal' | 'distancia' | 'ojo'

export interface Criterio {
  clave: string
  texto: string
  vista: Vista
  con: Comprobacion
}

export interface Prueba {
  /** Estable: se guarda en la base. «fms.sentadilla», «nine.una_pierna». */
  clave: string
  nombre: string
  /** Se puntúa cada lado y cuenta el peor. */
  bilateral: boolean
  /** Qué lado se puntúa en las de dos lados, si no es obvio. */
  queLado?: string
  vistas: Vista[]
  /** El montaje, en una o dos frases. */
  montaje: string
  /** Lo que pide el 3: se repasa uno a uno sobre el fotograma. */
  criterios: Criterio[]
  notas: { 3: string; 2: string; 1: string }
  /** La prueba de dolor que la anula, si la hay (FMS). */
  dolor?: string
}

/** Una prueba de dolor: sin vídeo, sí o no. Si duele, su prueba vale 0. */
export interface PruebaDolor {
  clave: string
  nombre: string
  bilateral: boolean
  como: string
  anula: string
}

export interface DefBateria {
  id: Bateria
  nombre: string
  pruebas: Prueba[]
  dolores: PruebaDolor[]
  /** Suma de los máximos: 3 por prueba. */
  maximo: number
  reglas: string[]
  fuente: string
}

const FMS_PRUEBAS: Prueba[] = [
  {
    clave: 'fms.sentadilla', nombre: 'Sentadilla profunda', bilateral: false, vistas: ['perfil', 'frente'],
    montaje: 'Pies al ancho de los hombros y pica sobre la cabeza con los brazos estirados. Si no sale el 3, se repite con los talones sobre un alza.',
    criterios: [
      { clave: 'tronco_tibia', texto: 'Tronco paralelo a la tibia o más vertical', vista: 'perfil', con: 'angulo' },
      { clave: 'femur', texto: 'Fémur por debajo de la horizontal', vista: 'perfil', con: 'horizontal' },
      { clave: 'pica', texto: 'Pica alineada sobre los pies', vista: 'perfil', con: 'plomada' },
      { clave: 'rodillas', texto: 'Rodillas alineadas sobre los pies', vista: 'frente', con: 'ojo' },
    ],
    notas: {
      3: 'Se cumple todo, con los talones en el suelo.',
      2: 'Se cumple todo, pero con los talones sobre el alza.',
      1: 'Con el alza falla alguno: tronco y tibia no paralelos, fémur sin bajar de la horizontal, rodillas fuera o la lumbar se flexiona.',
    },
  },
  {
    clave: 'fms.valla', nombre: 'Paso de valla', bilateral: true, queLado: 'la pierna que pasa', vistas: ['frente', 'perfil'],
    montaje: 'Valla a la altura de la tuberosidad de la tibia y pica sobre los hombros, detrás del cuello. Pasa despacio y toca el suelo con el talón.',
    criterios: [
      { clave: 'alineacion', texto: 'Cadera, rodilla y tobillo alineados', vista: 'frente', con: 'ojo' },
      { clave: 'lumbar', texto: 'La lumbar no se mueve', vista: 'perfil', con: 'ojo' },
      { clave: 'pica', texto: 'Pica paralela a la valla', vista: 'frente', con: 'horizontal' },
    ],
    notas: {
      3: 'Se cumple todo.',
      2: 'Se pierde la alineación, se mueve la lumbar o la pica no queda paralela a la valla.',
      1: 'Toca la valla o pierde el equilibrio.',
    },
  },
  {
    clave: 'fms.zancada', nombre: 'Zancada en línea', bilateral: true, queLado: 'la pierna de delante', vistas: ['frente', 'perfil'],
    montaje: 'Entre los pies, la longitud de su tibia, sobre una tabla o una línea. La pica por la espalda, tocando cabeza, columna dorsal y sacro.',
    criterios: [
      { clave: 'contacto', texto: 'La pica no pierde los contactos', vista: 'perfil', con: 'ojo' },
      { clave: 'vertical', texto: 'La pica sigue vertical', vista: 'perfil', con: 'plomada' },
      { clave: 'tronco', texto: 'El tronco no se mueve', vista: 'perfil', con: 'ojo' },
      { clave: 'plano', texto: 'Pica y pies en el mismo plano', vista: 'frente', con: 'ojo' },
      { clave: 'rodilla', texto: 'La rodilla de atrás toca detrás del talón de delante', vista: 'perfil', con: 'ojo' },
    ],
    notas: { 3: 'Se cumple todo.', 2: 'Falla alguno.', 1: 'Pierde el equilibrio.' },
  },
  {
    clave: 'fms.hombro', nombre: 'Movilidad de hombro', bilateral: true, queLado: 'el brazo de arriba', vistas: ['espalda'],
    montaje: 'Se mide su palma, del pliegue de la muñeca a la punta del dedo corazón. Los dos puños a la espalda, uno por arriba y otro por abajo, en un solo movimiento.',
    criterios: [
      { clave: 'distancia', texto: 'Distancia entre los puños, en palmas', vista: 'espalda', con: 'distancia' },
    ],
    notas: { 3: 'Puños a menos de una palma.', 2: 'A menos de palma y media.', 1: 'A más de palma y media.' },
    dolor: 'fms.dolor_hombro',
  },
  {
    clave: 'fms.pierna_recta', nombre: 'Elevación activa de pierna recta', bilateral: true, queLado: 'la pierna que sube', vistas: ['perfil'],
    montaje: 'Boca arriba, con una tabla bajo las rodillas. Se marca la mitad del muslo, entre la espina ilíaca y la rodilla.',
    criterios: [
      { clave: 'tobillo', texto: 'Dónde cae la vertical del tobillo', vista: 'perfil', con: 'plomada' },
      { clave: 'otra', texto: 'La otra pierna sigue apoyada y neutra', vista: 'perfil', con: 'ojo' },
    ],
    notas: {
      3: 'La vertical del tobillo cae entre la mitad del muslo y la cadera.',
      2: 'Entre la mitad del muslo y la rodilla.',
      1: 'Por debajo de la rodilla.',
    },
  },
  {
    clave: 'fms.flexion', nombre: 'Flexión de estabilidad del tronco', bilateral: false, vistas: ['perfil'],
    montaje: 'Boca abajo, manos al ancho de los hombros. Para el 3: ellos, con los pulgares a la altura de la parte alta de la cabeza; ellas, a la barbilla.',
    criterios: [
      { clave: 'bloque', texto: 'El cuerpo sube de una pieza, sin que se quede atrás la lumbar', vista: 'perfil', con: 'ojo' },
    ],
    notas: {
      3: 'Sube de una pieza con las manos arriba (ellos, cabeza; ellas, barbilla).',
      2: 'Solo con las manos más abajo (ellos, barbilla; ellas, clavícula).',
      1: 'No sube de una pieza ni con las manos abajo.',
    },
    dolor: 'fms.dolor_extension',
  },
  {
    clave: 'fms.rotatoria', nombre: 'Estabilidad rotatoria', bilateral: true, vistas: ['perfil'],
    montaje: 'A cuatro patas sobre una tabla. Primero con brazo y pierna del mismo lado; si no sale, en diagonal.',
    criterios: [
      { clave: 'unilateral', texto: 'Repetición correcta del mismo lado', vista: 'perfil', con: 'ojo' },
      { clave: 'diagonal', texto: 'Repetición correcta en diagonal', vista: 'perfil', con: 'ojo' },
    ],
    notas: { 3: 'Repetición correcta del mismo lado.', 2: 'Solo en diagonal.', 1: 'Ni siquiera en diagonal.' },
    dolor: 'fms.dolor_flexion',
  },
]

const FMS_DOLORES: PruebaDolor[] = [
  { clave: 'fms.dolor_hombro', nombre: 'Prueba de dolor de hombro', bilateral: true,
    como: 'La mano en el hombro contrario y subir el codo todo lo posible.', anula: 'fms.hombro' },
  { clave: 'fms.dolor_extension', nombre: 'Prueba de dolor en extensión', bilateral: false,
    como: 'Desde la posición de la flexión, empujar con los brazos arqueando la espalda.', anula: 'fms.flexion' },
  { clave: 'fms.dolor_flexion', nombre: 'Prueba de dolor en flexión', bilateral: false,
    como: 'A cuatro patas, llevar el culo a los talones y el pecho a los muslos, con las manos lejos.', anula: 'fms.rotatoria' },
]

const NINE_PRUEBAS: Prueba[] = [
  {
    clave: 'nine.sentadilla', nombre: 'Sentadilla profunda', bilateral: false, vistas: ['perfil', 'frente'],
    montaje: 'Talones sobre una tabla de 2 cm, brazos arriba y una pica detrás. Si no sale el 3, con la de 4 cm.',
    criterios: [
      { clave: 'linea', texto: 'Cadera, rodilla y pie en línea', vista: 'frente', con: 'ojo' },
      { clave: 'pies', texto: 'Pies paralelos', vista: 'frente', con: 'ojo' },
      { clave: 'talones', texto: 'Talones sobre la tabla', vista: 'perfil', con: 'ojo' },
      { clave: 'femur', texto: 'Fémur por debajo de la horizontal', vista: 'perfil', con: 'horizontal' },
      { clave: 'brazos', texto: 'Brazos junto a las orejas', vista: 'perfil', con: 'ojo' },
      { clave: 'pica', texto: 'La pica no pasa de las puntas de los pies', vista: 'perfil', con: 'plomada' },
    ],
    notas: {
      3: 'Se cumple todo con la tabla de 2 cm.',
      2: 'Se cumple todo, pero con la de 4 cm.',
      1: 'Con la de 4 cm falla alguno.',
    },
  },
  {
    clave: 'nine.una_pierna', nombre: 'Sentadilla a una pierna', bilateral: true, vistas: ['frente'],
    montaje: 'Sentadilla sobre una pierna.',
    criterios: [
      { clave: 'alineados', texto: 'Cadera, rodilla y pie alineados', vista: 'frente', con: 'ojo' },
      { clave: 'pelvis', texto: 'Pelvis horizontal', vista: 'frente', con: 'horizontal' },
      { clave: 'tronco', texto: 'Tronco vertical', vista: 'frente', con: 'plomada' },
    ],
    notas: { 3: 'Se cumple todo.', 2: 'Falla la pelvis o el tronco.', 1: 'Cadera, rodilla y pie no se alinean.' },
  },
  {
    clave: 'nine.zancada', nombre: 'Zancada en línea', bilateral: true, queLado: 'la pierna de delante', vistas: ['frente', 'perfil'],
    montaje: 'Pies en línea; la pica contra la cabeza, la espalda alta y el sacro.',
    criterios: [
      { clave: 'contacto', texto: 'La pica toca cabeza y sacro', vista: 'perfil', con: 'ojo' },
      { clave: 'codo', texto: 'El codo de arriba a 90°', vista: 'perfil', con: 'angulo' },
      { clave: 'tronco', texto: 'El tronco quieto', vista: 'perfil', con: 'ojo' },
      { clave: 'pies', texto: 'Pies en línea', vista: 'frente', con: 'ojo' },
      { clave: 'rodilla_delante', texto: 'La rodilla de delante sobre su pie', vista: 'frente', con: 'ojo' },
      { clave: 'rodilla_atras', texto: 'La rodilla de atrás toca la tabla', vista: 'perfil', con: 'ojo' },
    ],
    notas: {
      3: 'Se cumple todo.',
      2: 'Falla alguno.',
      1: 'Pierde el equilibrio, la rodilla de atrás no toca o se levanta el talón de delante.',
    },
  },
  {
    clave: 'nine.cadera', nombre: 'Flexión activa de cadera', bilateral: true, queLado: 'la pierna que sube', vistas: ['perfil'],
    montaje: 'Boca arriba, sube una pierna con la rodilla estirada. Una pica marca la referencia entre la cadera y la rodilla.',
    criterios: [
      { clave: 'tobillo', texto: 'El tobillo pasa la pica', vista: 'perfil', con: 'plomada' },
      { clave: 'rodillas', texto: 'Las dos rodillas estiradas', vista: 'perfil', con: 'ojo' },
      { clave: 'cuello', texto: 'El cuello neutro', vista: 'perfil', con: 'ojo' },
      { clave: 'otra', texto: 'La otra rodilla sigue apoyada en la tabla', vista: 'perfil', con: 'ojo' },
    ],
    notas: {
      3: 'El tobillo pasa la pica y se cumple lo demás.',
      2: 'El tobillo queda entre la marca y la mitad de la rótula.',
      1: 'No llega a ninguna de las dos.',
    },
  },
  {
    clave: 'nine.piernas_rectas', nombre: 'Elevación de piernas rectas', bilateral: false, vistas: ['perfil'],
    montaje: 'Boca arriba, las dos piernas juntas y estiradas, con el tronco estable.',
    criterios: [
      { clave: 'tronco', texto: 'El tronco estable, la lumbar quieta', vista: 'perfil', con: 'ojo' },
      { clave: 'piernas', texto: 'Piernas juntas y pies flexionados', vista: 'perfil', con: 'ojo' },
      { clave: 'cuello', texto: 'El cuello neutro', vista: 'perfil', con: 'ojo' },
    ],
    notas: {
      3: 'Tronco estable con las piernas juntas en todo el recorrido.',
      2: 'Tronco estable solo hasta 30°.',
      1: 'No estabiliza el tronco a 30°.',
    },
  },
  {
    clave: 'nine.flexion', nombre: 'Flexión', bilateral: false, vistas: ['perfil'],
    montaje: 'Una pica toca la nuca y la espalda; el evaluador, con los dedos en la lumbar.',
    criterios: [
      { clave: 'bloque', texto: 'El cuerpo sube de una pieza', vista: 'perfil', con: 'ojo' },
      { clave: 'contacto', texto: 'Mantiene el contacto con la pica y la lumbar', vista: 'perfil', con: 'ojo' },
    ],
    notas: {
      3: 'Sube de una pieza y mantiene los contactos.',
      2: 'De una pieza, pero pierde algún contacto.',
      1: 'No sube de una pieza.',
    },
  },
  {
    clave: 'nine.diagonal', nombre: 'Elevación diagonal', bilateral: true, vistas: ['atras'],
    montaje: 'A cuatro patas sobre una línea; sube la mano y la pierna contrarias.',
    criterios: [
      { clave: 'linea', texto: 'Mano y pie contrarios sobre la línea', vista: 'atras', con: 'ojo' },
      { clave: 'rotacion', texto: 'Sin rotar la columna', vista: 'atras', con: 'ojo' },
      { clave: 'extension', texto: 'Brazo y pierna extendidos en horizontal', vista: 'atras', con: 'horizontal' },
      { clave: 'abduccion', texto: 'Sin abrir el brazo ni la pierna', vista: 'atras', con: 'ojo' },
      { clave: 'escapula', texto: 'Sin escápula alada', vista: 'atras', con: 'ojo' },
    ],
    notas: {
      3: 'Se cumple todo.',
      2: 'Mano y rodilla contraria a cada lado de la línea; lo demás, bien.',
      1: 'Alguna compensación.',
    },
  },
  {
    clave: 'nine.rotacion', nombre: 'Rotación sentado', bilateral: false, vistas: ['arriba'],
    montaje: 'Sentado, con una pica contra el pecho; gira el tronco despacio.',
    criterios: [
      { clave: 'giro', texto: 'Gira más de 45°', vista: 'arriba', con: 'angulo' },
      { clave: 'picas', texto: 'Las dos picas se tocan', vista: 'arriba', con: 'ojo' },
    ],
    notas: { 3: 'Gira hasta que las dos picas se tocan.', 2: 'Más de 45°, sin que se toquen.', 1: 'Menos de 45°.' },
  },
  {
    clave: 'nine.hombro', nombre: 'Movilidad funcional de hombro', bilateral: true, queLado: 'el brazo de arriba', vistas: ['espalda'],
    montaje: 'Los dos puños a la espalda, uno por arriba y otro por abajo. Se mide la distancia entre ellos en palmas.',
    criterios: [
      { clave: 'distancia', texto: 'Distancia entre los puños, en palmas', vista: 'espalda', con: 'distancia' },
    ],
    notas: { 3: 'Menos de una palma.', 2: 'Entre una palma y palma y media.', 1: 'Palma y media o más.' },
  },
]

export const BATERIAS: Record<Bateria, DefBateria> = {
  fms: {
    id: 'fms', nombre: 'FMS', pruebas: FMS_PRUEBAS, dolores: FMS_DOLORES, maximo: FMS_PRUEBAS.length * 3,
    reglas: [
      'Cada prueba de 0 a 3.',
      'En las de dos lados se puntúan los dos y cuenta el peor.',
      'Si duele durante la prueba, es un 0.',
      'Si su prueba de dolor sale positiva, la prueba vale 0.',
      'Hasta tres intentos.',
    ],
    fuente: 'Cook (2010), hoja de puntuación del libro «Movement»; montaje: Cook, Burton, Hoogenboom y Voight (2014).',
  },
  nine: {
    id: 'nine', nombre: 'Nine Test', pruebas: NINE_PRUEBAS, dolores: [], maximo: NINE_PRUEBAS.length * 3,
    reglas: [
      'Cada prueba de 0 a 3.',
      'Si duele, es un 0.',
      'Tres intentos; vale el de mejor calidad.',
      'En las de dos lados, primero el izquierdo; cuenta el peor.',
      'Descalzo y con ropa deportiva.',
    ],
    fuente: 'Flodström, Heijne, Batt y Frohm (2016).',
  },
}

export function pruebaDe(clave: string): Prueba | null {
  for (const b of Object.values(BATERIAS)) {
    const p = b.pruebas.find(x => x.clave === clave)
    if (p) return p
  }
  return null
}

/* ── Puntuar ──────────────────────────────────────────────────────────────── */

export type Lado = 'unico' | 'izq' | 'der'

/** Lo que se guarda de una prueba (o de una prueba de dolor): una fila por lado. */
export interface RegistroPrueba {
  prueba: string
  lado: Lado
  nota: number | null
  /** Dolió. En una prueba de dolor es su resultado. */
  dolor: boolean
}

export interface NotaPrueba {
  /** La que cuenta. null mientras falte un lado o la propia prueba. */
  nota: number | null
  izq: number | null
  der: number | null
  /** Los dos lados puntuados y distintos. */
  asimetria: boolean
  /** Vale 0 por dolor: en la prueba o en su prueba de dolor. */
  porDolor: boolean
}

const notaValida = (n: unknown): number | null => {
  const v = Number(n)
  return n != null && Number.isInteger(v) && v >= 0 && v <= 3 ? v : null
}

/**
 * La nota que cuenta de una prueba, con las reglas de su batería.
 *
 * Con dolor (en la prueba o en su prueba de dolor) vale 0 aunque falte un lado:
 * ya no hay nada que esperar. Sin dolor, en las de dos lados hacen falta los
 * dos y cuenta el peor.
 */
export function notaDePrueba(p: Prueba, registros: RegistroPrueba[]): NotaPrueba {
  const propios = registros.filter(r => r.prueba === p.clave)
  const dolorPropio = propios.some(r => r.dolor)
  const dolorAsociado = !!p.dolor && registros.some(r => r.prueba === p.dolor && r.dolor)
  const de = (lado: Lado) => notaValida(propios.find(r => r.lado === lado)?.nota)

  const izq = p.bilateral ? de('izq') : null
  const der = p.bilateral ? de('der') : null
  const asimetria = izq != null && der != null && izq !== der

  if (dolorPropio || dolorAsociado) return { nota: 0, izq, der, asimetria, porDolor: true }
  if (!p.bilateral) return { nota: de('unico'), izq: null, der: null, asimetria: false, porDolor: false }
  return { nota: izq != null && der != null ? Math.min(izq, der) : null, izq, der, asimetria, porDolor: false }
}

export interface ResultadoBateria {
  /** La suma de las pruebas que ya tienen nota. */
  total: number
  maximo: number
  hechas: number
  faltan: number
  completa: boolean
  porPrueba: Record<string, NotaPrueba>
  /** Las pruebas con los dos lados distintos, por su nombre. */
  asimetrias: string[]
}

export function resultadoBateria(def: DefBateria, registros: RegistroPrueba[]): ResultadoBateria {
  const porPrueba: Record<string, NotaPrueba> = {}
  let total = 0, hechas = 0
  const asimetrias: string[] = []
  for (const p of def.pruebas) {
    const n = notaDePrueba(p, registros)
    porPrueba[p.clave] = n
    if (n.nota != null) { total += n.nota; hechas++ }
    if (n.asimetria) asimetrias.push(p.nombre)
  }
  const faltan = def.pruebas.length - hechas
  return { total, maximo: def.maximo, hechas, faltan, completa: faltan === 0, porPrueba, asimetrias }
}

/** «12 / 21» o «12 de 21 · faltan 2». */
export function textoTotal(r: ResultadoBateria): string {
  return r.completa ? r.total + ' / ' + r.maximo : r.total + ' de ' + r.maximo + ' · faltan ' + r.faltan
}
