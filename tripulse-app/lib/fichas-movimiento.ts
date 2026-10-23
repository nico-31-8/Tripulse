// ============================================================
// Cómo se pasa cada prueba del FMS y del Nine Test
// ============================================================
//
// Pedido el 22-10-2026: «no sé ni qué material, ni qué hay que utilizar, ni
// cómo, en cada apartado», y «el material total de cada test especificado antes
// de hacerlo». La maqueta la aprobó el usuario ese mismo día
// (https://claude.ai/artifact/8S5PqF6zrBbC1PiXKpUsHg).
//
// Aquí está lo que necesita quien pasa la batería: el material de toda la
// batería, para tenerlo listo antes de empezar, y la ficha de cada prueba
// (material, preparación, lo que se le dice y cómo se graba). Las pruebas, sus
// criterios y cómo se puntúan siguen en lib/baterias-movimiento.
//
// DE DÓNDE SALE:
//  · FMS: Cook, Burton, Hoogenboom y Voight (Int J Sports Phys Ther, 2014),
//    partes 1 y 2: material, montaje, instrucciones e intentos de cada prueba.
//  · Nine Test: Flodström, Heijne, Batt y Frohm (Int J Sports Phys Ther, 2016)
//    da las tablas de 2 y 4 cm, los criterios, la ropa, los tres intentos y el
//    orden de los lados. LAS POSICIONES SALEN DE LAS FOTOS de su apéndice: su
//    texto no las describe, y el artículo que sí (Frohm y otros, 2012) es de pago.
//  · Las distancias de grabación, «el móvil, bajo» y lo marcado como propuesta
//    son nuestros.
//
// LAS PRUEBAS DE DOS VISTAS (22-10-2026, con su maqueta: https://claude.ai/artifact/71YoXvZLYsux3qZ11uNshV).
// Seis se miran desde dos cámaras. Con dos móviles se graban a la vez (la misma
// repetición desde los dos lados) y el visor los alinea; con uno, se mueve entre
// intentos. Cómo repartir los intentos con un móvil es propuesta nuestra: las
// fuentes no lo dicen. Lo dice grabarDosVistas.

import { DE_VISTA, type Bateria, type Prueba, type Vista } from './baterias-movimiento'

export interface FichaPrueba {
  material: string[]
  /** Lo que se prepara antes: medidas, dónde va la pica… */
  preparacion: string[]
  /** Lo que se le dice, paso a paso. */
  pasos: string[]
  /** Cuántos intentos, en qué orden van los lados y qué se mira al final. */
  intentos: string
  /** Desde dónde se graba cada vista que pide la prueba («De perfil: …»). */
  grabar: string[]
  ojo?: string
  /** Si lo del «ojo» es propuesta nuestra: la fuente no lo dice. */
  ojoPropio?: boolean
  /** Las posiciones salen de las fotos del artículo, no de su texto. */
  deLaFoto?: boolean
  /** La vista no es la de la foto del artículo, y por qué. */
  vistaNueva?: string
}

export interface MaterialBateria {
  grupo: 'Material' | 'La persona' | 'Para grabar'
  cosa: string
  medida: string
  /** En qué pruebas se usa. */
  para: string
  /** Lo que vale si no tienes el de verdad. */
  casera?: string
}

export interface ReglaPaso { regla: string; detalle: string }

/** Lo que vale para todas las pruebas: cómo se graba, sea la que sea. */
export const GRABAR_SIEMPRE = 'Móvil quieto y recto, a unos 3 m, con el cuerpo entero y el suelo en el encuadre.'

export const MATERIAL: Record<Bateria, MaterialBateria[]> = {
  fms: [
    { grupo: 'Material', cosa: 'La tabla «2×6» del FMS', medida: 'Un listón de unos 4 cm de grueso, 14 cm de ancho y 1,2–1,5 m de largo.',
      para: 'sentadilla (bajo los talones, si no sale el 3), zancada (encima), pierna recta (bajo las rodillas) y estabilidad rotatoria (encima).',
      casera: 'Para la zancada vale una línea de cinta en el suelo.' },
    { grupo: 'Material', cosa: 'Una pica', medida: 'Un palo recto de 1,2 m o algo más.', para: 'sentadilla, valla, zancada y pierna recta.',
      casera: 'Vale el palo de una escoba.' },
    { grupo: 'Material', cosa: 'La valla', medida: 'Dos soportes y una cuerda elástica que se pueda poner a la altura que haga falta.', para: 'paso de valla.',
      casera: 'Una goma elástica atada entre dos sillas o dos palos.' },
    { grupo: 'Material', cosa: 'Una cinta métrica', medida: 'Para medir su tibia y su mano.', para: 'valla y zancada (la tibia) y hombro (la mano).' },
    { grupo: 'Material', cosa: 'Cinta adhesiva o un rotulador', medida: 'Para marcar en la tabla la distancia de la zancada.', para: 'zancada.' },
    { grupo: 'La persona', cosa: 'Descalza y con ropa ajustada', medida: 'Pantalón corto o mallas: hay que ver rodillas y cadera.', para: 'todas.' },
    { grupo: 'La persona', cosa: 'Un sitio para tumbarse', medida: 'Suelo firme; si es duro, una esterilla fina.', para: 'pierna recta, flexión y estabilidad rotatoria.' },
    { grupo: 'Para grabar', cosa: 'Uno o dos móviles, y algo para dejarlos quietos', medida: 'Un trípode, o algo para dejarlos a la altura de la cadera, con unos 3 m libres. Con dos, la sentadilla, la valla y la zancada se graban desde sus dos vistas a la vez.',
      para: 'todas, menos las de dolor.', casera: 'El segundo puede ser el móvil del deportista. De apoyo vale una silla.' },
  ],
  nine: [
    { grupo: 'Material', cosa: 'Dos tablas para los talones', medida: 'Una de 2 cm de alto y otra de 4 cm.', para: 'sentadilla profunda (la de 4 cm, si no sale el 3).',
      casera: 'Dos listones o tablillas de esas alturas.' },
    { grupo: 'Material', cosa: 'Una tabla larga', medida: 'Una plancha en la que quepan los dos pies en línea y la rodilla de atrás. El artículo no da sus medidas.',
      para: 'zancada en línea (encima) y flexión activa de cadera (la rodilla de abajo, apoyada en ella).' },
    { grupo: 'Material', cosa: 'Dos picas', medida: 'Palos rectos de algo más de un metro.', para: 'sentadilla, zancada, flexión activa de cadera, flexión y rotación sentado, que usa las dos.',
      casera: 'Vale el palo de una escoba.' },
    { grupo: 'Material', cosa: 'Cinta adhesiva', medida: 'Para una línea recta en el suelo.', para: 'elevación diagonal.' },
    { grupo: 'Material', cosa: 'Una cinta métrica', medida: 'Para medir su mano.', para: 'movilidad funcional de hombro.' },
    { grupo: 'La persona', cosa: 'Descalza, con top o camiseta de tirantes y pantalón corto o mallas', medida: 'Así lo pide el artículo: hay que ver los hombros, la espalda y las rodillas.', para: 'todas.' },
    { grupo: 'La persona', cosa: 'Un sitio para tumbarse', medida: 'Suelo firme; si es duro, una esterilla fina.', para: 'flexión activa de cadera, elevación de piernas, flexión y elevación diagonal.' },
    { grupo: 'Para grabar', cosa: 'Uno o dos móviles, y algo para dejarlos quietos', medida: 'Un trípode, o algo para dejarlos a la altura de la cadera, con unos 3 m libres. Con dos, la sentadilla, la zancada y la elevación diagonal se graban desde sus dos vistas a la vez.',
      para: 'todas.', casera: 'El segundo puede ser el móvil del deportista. De apoyo vale una silla.' },
    { grupo: 'Para grabar', cosa: 'Algo para grabar desde arriba', medida: 'Una silla a la que subirte, o un palo de selfi.', para: 'rotación sentado.' },
  ],
}

/** Cómo se pasa la batería entera: lo que cambia entre una y otra. */
export const COMO_SE_PASA: Record<Bateria, { reglas: ReglaPaso[]; fuente: string }> = {
  fms: {
    reglas: [
      { regla: 'Sin enseñarle la técnica ni corregirle.', detalle: 'El FMS mira cómo se mueve, no cuánto aprende en el momento.' },
      { regla: 'Hasta tres intentos.', detalle: 'En las de dos lados se puntúan los dos y cuenta el peor.' },
      { regla: 'Si duele, es un 0.', detalle: 'Y si su prueba de dolor sale positiva, la prueba vale 0 aunque la haya hecho bien.' },
      { regla: 'Si dudas entre dos notas, la más baja.', detalle: '' },
    ],
    fuente: 'Cook y otros (2014), partes 1 y 2.',
  },
  nine: {
    reglas: [
      { regla: 'Antes de cada prueba, enséñale la posición de inicio y la de final.', detalle: 'En el artículo se hace con una foto de cada una.' },
      { regla: 'Tres intentos, y vale el de mejor calidad.', detalle: 'Si el primero sale mal, puedes corregirle con palabras antes del segundo y del tercero.' },
      { regla: 'En las de dos lados, primero el izquierdo.', detalle: 'Cuenta el peor.' },
      { regla: 'Si duele, es un 0.', detalle: '' },
    ],
    fuente: 'Flodström y otros (2016). Las posiciones, de las fotos de su apéndice: la descripción completa está en Frohm y otros (2012), de pago.',
  },
}

/** Lo que se le dice en cada prueba de dolor del FMS. */
export const DICE_DOLOR: Record<string, string> = {
  'fms.dolor_hombro': 'Pon la mano en el hombro contrario y sube el codo todo lo que puedas.',
  'fms.dolor_extension': 'Desde boca abajo, empuja con los brazos y arquea la espalda hacia arriba.',
  'fms.dolor_flexion': 'A cuatro patas, lleva el culo a los talones y el pecho a los muslos, con las manos estiradas lo más lejos posible.',
}

const VISTA_DIAGONAL = 'En la foto del artículo sale de perfil; desde atrás es propuesta nuestra, para ver si gira o abre.'
const VISTA_ROTACION = 'En la foto del artículo sale de frente; desde arriba es propuesta nuestra: es la única vista donde se mide el giro.'

export const FICHAS: Record<string, FichaPrueba> = {
  // ---------- FMS ----------
  'fms.sentadilla': {
    material: ['La pica.', 'La tabla, para los talones (solo si no sale el 3).'],
    preparacion: ['Pies al ancho de los hombros y apuntando al frente.'],
    pasos: ['Coge la pica con los codos doblados a 90° y súbela por encima de la cabeza con los brazos estirados.',
      'Baja todo lo que puedas, con el tronco erguido, los talones en el suelo y la pica en su sitio.',
      'Aguanta un segundo abajo y sube.'],
    intentos: 'Hasta 3. Si no sale el 3, se repite con los talones sobre la tabla.',
    grabar: ['De perfil: el tronco, el fémur y la pica.', 'De frente: las rodillas.', 'Que salgan la pica y los pies enteros.'],
    ojo: 'Si dudas, míralo de perfil. Y ante la duda, la nota más baja.',
  },
  'fms.valla': {
    material: ['La valla.', 'La pica.', 'La cinta métrica.'],
    preparacion: ['Mide su tibia: del suelo a la tuberosidad (el bulto de debajo de la rótula).', 'Pon la cuerda a esa altura.'],
    pasos: ['Pies juntos, con las puntas tocando la base de la valla.', 'La pica detrás del cuello, sobre los hombros.',
      'Pasa una pierna por encima de la cuerda, despacio y con el tronco erguido. Toca el suelo con el talón sin apoyar el peso, y vuelve.'],
    intentos: 'Hasta 3 lentos con cada pierna. Se puntúa la que pasa.',
    grabar: ['De frente: cadera, rodilla y tobillo en línea, y la pica paralela a la cuerda.', 'De perfil: la lumbar.'],
    ojo: 'Que no bloquee la rodilla de apoyo. Si toca la cuerda o pierde el equilibrio, es un 1.',
  },
  'fms.zancada': {
    material: ['La tabla (o una línea de cinta en el suelo).', 'La pica.', 'La cinta métrica y algo para marcar.'],
    preparacion: ['Mide su tibia: del suelo a la tuberosidad.', 'Marca esa distancia en la tabla, desde la punta del pie de atrás.'],
    pasos: ['Pon la pica a la espalda, tocando la cabeza, la espalda alta y el centro de los glúteos. Agárrala con la mano contraria al pie de delante a la altura del cuello, y con la otra, a la altura de la lumbar.',
      'Pies en línea sobre la tabla y apuntando al frente: la punta del de atrás al principio y el talón del de delante en la marca.',
      'Baja la rodilla de atrás hasta tocar la tabla detrás del talón de delante, con el tronco erguido, y sube.'],
    intentos: 'Hasta 3 lentos con cada pierna delante. Se puntúa la de delante.',
    grabar: ['De perfil: los contactos de la pica, que siga vertical y la rodilla de atrás.', 'De frente: la pica y los pies en el mismo plano.'],
    ojo: 'Quédate cerca por si pierde el equilibrio, que sería un 1.',
  },
  'fms.hombro': {
    material: ['La cinta métrica.'],
    preparacion: ['Mide su mano: del pliegue de la muñeca a la punta del dedo corazón. Esa es su «palma».'],
    pasos: ['Cierra los puños, con el pulgar dentro.',
      'En un solo movimiento, lleva un puño por encima del hombro y el otro por debajo, a la espalda, lo más cerca que puedas.',
      'Quédate donde llegaste: no los acerques después.'],
    intentos: 'Hasta 3 con cada brazo arriba; se puntúa el de arriba. Mide la distancia entre los dos puntos de hueso más cercanos, en palmas.',
    grabar: ['De espalda, con los dos puños a la vista.'],
    ojo: 'Si la distancia es justo una palma, la nota más baja.',
  },
  'fms.pierna_recta': {
    material: ['La tabla.', 'La pica.'],
    preparacion: ['Boca arriba, con los brazos a los lados (palmas arriba), la cabeza en el suelo y las rodillas sobre la tabla.',
      'Busca la mitad entre la espina ilíaca (el hueso de delante de la cadera) y la mitad de la rótula de la pierna que se queda abajo, y pon ahí la pica, vertical.'],
    pasos: ['Sube despacio esta pierna, con la rodilla estirada y la punta del pie hacia ti.',
      'La otra rodilla, pegada a la tabla y con los dedos mirando al techo. La cabeza, en el suelo.'],
    intentos: 'Con las dos piernas; se puntúa la que sube. Al final del recorrido mira dónde queda el tobillo; si no pasa la pica, bájala hasta el tobillo y mira dónde cae.',
    grabar: ['De perfil, desde el lado de la pierna que sube, con las dos piernas y la pica a la vista. El móvil, bajo: a la altura de su cadera tumbada.'],
    ojo: 'Que la pierna de abajo no rote hacia fuera ni despegue la rodilla. Si cae justo en la mitad del muslo, la nota más baja.',
  },
  'fms.flexion': {
    material: ['Nada.'],
    preparacion: ['Boca abajo, pies juntos, rodillas estiradas y los dedos de los pies apoyados.',
      'Manos al ancho de los hombros. En hombres, con los pulgares a la altura de la parte alta de la frente; en mujeres, a la altura de la barbilla.'],
    pasos: ['Sube haciendo una flexión, todo el cuerpo de una vez, como una tabla.', 'No muevas las manos antes de subir.'],
    intentos: 'Hasta 3. Si no sale, se bajan las manos (en hombres, a la barbilla; en mujeres, a la clavícula) y se repite.',
    grabar: ['De perfil, con la cabeza y los pies en el encuadre. El móvil, bajo.'],
    ojo: 'El pecho y la tripa tienen que despegarse a la vez: si la lumbar se queda atrás, no sube de una pieza.',
  },
  'fms.rotatoria': {
    material: ['La tabla.'],
    preparacion: ['A cuatro patas sobre la tabla, que queda entre las manos y las rodillas. Hombros y caderas a 90°, rodillas dobladas a 90°, las puntas de los pies apoyadas y la espalda plana.'],
    pasos: ['Estira a la vez el brazo y la pierna del mismo lado, sin subirlos más de un palmo (unos 15 cm).',
      'Junta el codo y la rodilla por debajo del cuerpo, y vuelve a estirar.'],
    intentos: 'Hasta 3 por lado; se puntúa el brazo que se mueve. Si no sale, en diagonal (brazo y pierna contrarios), hasta 3. Se prueban los dos lados aunque uno saque un 3.',
    grabar: ['De perfil, desde el lado que se mueve. El móvil, bajo.'],
    ojo: 'Brazo y pierna, siempre encima de la tabla y sin echar el peso hacia un lado.',
  },

  // ---------- Nine Test ----------
  'nine.sentadilla': {
    material: ['La tabla de 2 cm y la de 4 cm.', 'Una pica.'],
    preparacion: ['Talones sobre la tabla de 2 cm, con los pies paralelos.'],
    pasos: ['Sube la pica por encima de la cabeza, con los brazos estirados junto a las orejas.', 'Baja todo lo que puedas, con los talones en la tabla.', 'Sube.'],
    intentos: '3, y vale el mejor. Si no sale el 3, se repite con la tabla de 4 cm.',
    grabar: ['De perfil: el fémur, los brazos, los talones y que la pica no pase de las puntas de los pies.', 'De frente: cadera, rodilla y pie en línea, y los pies paralelos.'],
    deLaFoto: true,
  },
  'nine.una_pierna': {
    material: ['Nada.'],
    preparacion: ['De pie sobre una pierna, con las manos en la cintura y la otra pierna doblada hacia atrás.'],
    pasos: ['Baja en sentadilla sobre la pierna de apoyo, despacio.', 'Sube sin apoyar la otra.'],
    intentos: '3 con cada pierna, primero la izquierda; cuenta la peor.',
    grabar: ['De frente: cadera, rodilla y pie; la pelvis y el tronco.'],
    ojo: 'El artículo no dice hasta dónde bajar. Pídele siempre la misma profundidad, en los dos lados y en cada visita, para poder compararlas.',
    ojoPropio: true,
    deLaFoto: true,
  },
  'nine.zancada': {
    material: ['La tabla larga.', 'Una pica.'],
    preparacion: ['Pies en línea sobre la tabla, los dos apuntando al frente.',
      'La pica a la espalda, vertical: una mano detrás de la nuca con el codo hacia fuera a 90°, y la otra en la lumbar, con los nudillos contra la columna.'],
    pasos: ['Baja la rodilla de atrás hasta tocar la tabla, con el talón de delante apoyado.', 'La pica, tocando la cabeza y el sacro, y el tronco quieto.', 'Sube.'],
    intentos: '3 con cada pierna delante, primero la izquierda; cuenta la peor.',
    grabar: ['De perfil: los contactos de la pica, el codo a 90° y la rodilla de atrás.', 'De frente: los pies en línea y la rodilla de delante sobre su pie.'],
    ojo: 'El artículo no da la distancia entre los pies. Proponemos la del FMS, el largo de su tibia, para repetirla igual cada vez.',
    ojoPropio: true,
    deLaFoto: true,
  },
  'nine.cadera': {
    material: ['Una pica.', 'La tabla larga.'],
    preparacion: ['Boca arriba, con las piernas estiradas y la cabeza apoyada. La rodilla de la pierna que se queda abajo, apoyada en la tabla.',
      'La pica, vertical, en la mitad entre la espina ilíaca (el hueso de delante de la cadera) y la mitad de la rótula.'],
    pasos: ['Sube una pierna estirada todo lo que puedas.', 'La otra rodilla sigue apoyada en la tabla y el cuello, relajado.'],
    intentos: '3 con cada pierna, primero la izquierda; cuenta la peor.',
    grabar: ['De perfil, con las dos piernas y la pica a la vista. El móvil, bajo.'],
    deLaFoto: true,
  },
  'nine.piernas_rectas': {
    material: ['Nada: tus dedos.'],
    preparacion: ['Boca arriba, piernas juntas y estiradas, con la punta de los pies hacia la cara.', 'Pon los dedos bajo su lumbar, para notar si se despega.'],
    pasos: ['Sube y baja las dos piernas juntas, despacio, sin que la espalda se despegue de mis dedos.'],
    intentos: '3, y vale el mejor.',
    grabar: ['De perfil, con la cadera y las piernas enteras. El móvil, bajo.'],
    ojo: 'El 3 es mantener la lumbar en todo el recorrido, con los talones llegando al suelo; el 2, solo con las piernas a 30° o más; el 1, ni a 30°.',
    deLaFoto: true,
  },
  'nine.flexion': {
    material: ['Una pica.'],
    preparacion: ['Boca abajo, en posición de flexión, con las manos bajo los hombros.', 'La pica a lo largo de la espalda, tocando la nuca; tus dedos, en su lumbar.'],
    pasos: ['Sube haciendo una flexión, todo el cuerpo de una pieza y mirando al suelo.', 'Que la pica no se despegue de la cabeza, ni la espalda de mis dedos.'],
    intentos: '3, y vale el mejor.',
    grabar: ['De perfil, con la pica y tus dedos a la vista. El móvil, bajo.'],
    ojo: 'El artículo no dice dónde van las manos; en la foto, bajo los hombros. Ponlas siempre igual.',
    ojoPropio: true,
    deLaFoto: true,
  },
  'nine.diagonal': {
    material: ['Cinta adhesiva para la línea.'],
    preparacion: ['A cuatro patas, con la mano y la rodilla que se quedan apoyadas sobre la línea.'],
    pasos: ['Estira a la vez un brazo hacia delante y la pierna contraria hacia atrás, hasta la horizontal.', 'Sin girar la espalda ni abrir el brazo o la pierna hacia fuera.', 'Aguanta y vuelve.'],
    intentos: '3 por lado, primero el izquierdo; cuenta el peor.',
    grabar: ['Desde atrás: si gira la espalda, si abre el brazo o la pierna, y la escápula.', 'De perfil: el brazo y la pierna en horizontal.'],
    ojo: 'Si con los apoyos sobre la línea no sale, se prueba con la mano y la rodilla a cada lado de la línea: eso es un 2.',
    deLaFoto: true,
    vistaNueva: VISTA_DIAGONAL,
  },
  'nine.rotacion': {
    material: ['Dos picas.', 'Algo para grabar desde arriba.'],
    preparacion: ['Sentado en el suelo, con las piernas cruzadas.', 'Una pica cruzada contra el pecho, sujeta con los brazos; la otra, vertical delante, como referencia.'],
    pasos: ['Gira el tronco despacio todo lo que puedas, sin mover las piernas y con la pica pegada al pecho.'],
    intentos: '3, y vale el mejor.',
    grabar: ['Desde arriba: el móvil en alto, encima de su cabeza y apuntando al suelo (subido a una silla o con un palo de selfi).'],
    ojo: 'El 3 es girar hasta que las dos picas se toquen; el 2, más de 45° sin que se toquen; el 1, menos de 45°.',
    deLaFoto: true,
    vistaNueva: VISTA_ROTACION,
  },
  'nine.hombro': {
    material: ['La cinta métrica.'],
    preparacion: ['Mide su mano: del pliegue de la muñeca a la punta del dedo corazón. Esa es su «palma».'],
    pasos: ['Cierra los puños.', 'En un solo movimiento, lleva un puño por encima del hombro y el otro por debajo, a la espalda.'],
    intentos: '3 con cada brazo arriba, primero el izquierdo; cuenta el peor. Mide la distancia entre los puños, en palmas.',
    grabar: ['De espalda, con los dos puños a la vista.'],
    deLaFoto: true,
  },
}

export const fichaDe = (clave: string): FichaPrueba | null => FICHAS[clave] ?? null

/** La vista desde la que se miran más criterios; si empatan, la primera de la prueba. */
export function vistaPrincipal(p: Prueba): Vista {
  const cuantos = (v: Vista) => p.criterios.filter(c => c.vista === v).length
  return p.vistas.reduce((a, v) => (cuantos(v) > cuantos(a) ? v : a), p.vistas[0])
}

/**
 * Cómo grabar una prueba que se mira desde dos cámaras: con dos móviles, a la
 * vez; con uno, moviéndolo entre intentos (los dos primeros desde la vista con
 * más criterios y el tercero desde la otra, para no pasar de los tres intentos).
 * null en las de una vista.
 */
export function grabarDosVistas(p: Prueba): { conDos: string; conUno: string; palmada: string } | null {
  if (p.vistas.length !== 2) return null
  const principal = vistaPrincipal(p)
  const otra = p.vistas.find(v => v !== principal)!
  return {
    conDos: 'Uno ' + DE_VISTA[p.vistas[0]] + ' y otro ' + DE_VISTA[p.vistas[1]] + ', grabando a la vez: así ves la misma repetición desde los dos lados.',
    conUno: (p.bilateral ? 'Con cada lado, mueve' : 'Mueve') + ' el móvil entre intentos: el 1.º y el 2.º ' + DE_VISTA[principal]
      + ' y el 3.º ' + DE_VISTA[otra] + '. Así no pasas de los tres intentos de la prueba.',
    palmada: 'Con dos móviles, una palmada al empezar a grabar: si la app no los alinea sola, sirve para alinearlos a mano.',
  }
}
