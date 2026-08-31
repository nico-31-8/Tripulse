// ============================================================
// Atajos para escribir la intensidad de un bloque
// ============================================================
//
// La casilla del «@» es texto libre y lo seguirá siendo: el entrenador prescribe
// en el lenguaje que quiera. El problema no era la libertad, era el folio en
// blanco — una caja vacía con un gris dentro que parece un valor puesto y no
// dice qué formato admite.
//
// Estos atajos dejan la unidad escrita y el cursor delante. Tú pones el número.
//
// LOS ATAJOS DEPENDEN DE LA DISCIPLINA, Y ESO NO ES UN ADORNO
// «% VAM» solo significa algo en carrera. En bici la referencia es el FTP y en
// natación el CSS (lo mismo que ya hace lib/pacing y lib/grupos). Y el ritmo se
// mide por kilómetro corriendo y por 100 metros nadando: ofrecer «/km» en un
// bloque de natación es ofrecer una unidad que nadie usa en el vaso.
//
// POR QUÉ NO SE RELLENAN CON RAYITAS
// La primera versión insertaba «—:—— /km» y seleccionaba la primera raya. Queda
// bien en una maqueta y es incómodo de verdad: hay que ir saltando huecos, y en
// el móvil eso es pelearse con el cursor. Se inserta SOLO la unidad y el cursor
// va delante, así que escribes «4:30» y queda «4:30 /km» sin tocar nada más.

export interface AtajoIntensidad {
  /** Lo que se lee en el botón. */
  etiqueta: string
  /** Lo que se mete en la casilla si estaba vacía. */
  texto: string
  /** Dónde queda el cursor dentro de `texto`. */
  cursor: number
  /** Una frase para el `title`, que explique qué es. */
  ayuda: string
}

const RITMO_KM: AtajoIntensidad = {
  etiqueta: 'ritmo /km', texto: ' /km', cursor: 0,
  ayuda: 'Ritmo por kilómetro: 4:30 /km',
}
const RITMO_100: AtajoIntensidad = {
  etiqueta: 'ritmo /100m', texto: ' /100m', cursor: 0,
  ayuda: 'Ritmo por 100 metros: 1:38 /100m',
}
/* El «ritmo de…»: la barra y nada más, para la distancia que sea. En pista se
   prescribe por 400 y en el vaso a veces por 50; poner un botón por cada
   distancia sería una fila interminable, y dejar la barra puesta ya quita el
   trabajo de acordarse del formato. */
const RITMO_OTRA: AtajoIntensidad = {
  etiqueta: 'ritmo /…', texto: ' /', cursor: 0,
  ayuda: 'Ritmo por la distancia que quieras: 68 /400m, 45 /50m',
}
const PULSO: AtajoIntensidad = {
  etiqueta: 'pulso', texto: ' ppm', cursor: 0,
  ayuda: 'Pulsaciones por minuto: 148–158 ppm',
}
const VATIOS: AtajoIntensidad = {
  etiqueta: 'vatios', texto: ' W', cursor: 0,
  ayuda: 'Potencia: 180–220 W',
}
const RPE: AtajoIntensidad = {
  etiqueta: 'RPE', texto: 'RPE ', cursor: 4,
  ayuda: 'Esfuerzo percibido del 1 al 10: RPE 6–7',
}

/** El test de referencia de cada deporte. El mismo reparto que en lib/grupos. */
const PORCENTAJE: Record<string, AtajoIntensidad> = {
  Carrera:   { etiqueta: '% VAM', texto: '% VAM', cursor: 0, ayuda: 'Porcentaje de tu VAM: 90–95% VAM' },
  Ciclismo:  { etiqueta: '% FTP', texto: '% FTP', cursor: 0, ayuda: 'Porcentaje de tu FTP: 88–94% FTP' },
  Natacion:  { etiqueta: '% CSS', texto: '% CSS', cursor: 0, ayuda: 'Porcentaje de tu CSS: 95–100% CSS' },
}

/** «Natación» y «Natacion» conviven en la base; aquí se tratan igual. */
function normal(disciplina: string | null | undefined): string {
  const d = String(disciplina || '').trim()
  return d === 'Natación' ? 'Natacion' : d
}

/**
 * Los atajos que tienen sentido en un bloque de esa disciplina.
 *
 * Sin disciplina —o en un brick, que encadena varias— se ofrece lo transversal:
 * el pulso y el RPE valen en cualquier deporte, y el «ritmo de…» sirve para lo
 * que sea. El porcentaje no, porque no se sabría de qué test.
 */
export function atajosDe(disciplina: string | null | undefined): AtajoIntensidad[] {
  const d = normal(disciplina)
  const pct = PORCENTAJE[d]

  if (d === 'Carrera')  return [RITMO_KM, RITMO_OTRA, pct, PULSO, RPE]
  if (d === 'Natacion') return [RITMO_100, RITMO_OTRA, pct, RPE]
  if (d === 'Ciclismo') return [VATIOS, pct, PULSO, RPE]

  return [RITMO_OTRA, PULSO, RPE]
}

export interface Aplicado {
  texto: string
  cursor: number
}

/**
 * Qué queda en la casilla al pulsar un atajo.
 *
 * Con algo ya escrito se AÑADE la unidad al final en vez de borrarlo. Es lo que
 * pasa de verdad: escribes «4:30», te das cuenta de que no has puesto la unidad
 * y le das al botón. Borrarte lo tecleado ahí sería lo peor que podría hacer.
 */
export function aplicarAtajo(valorActual: string | null | undefined, atajo: AtajoIntensidad): Aplicado {
  const actual = String(valorActual ?? '').trim()
  if (!actual) return { texto: atajo.texto, cursor: atajo.cursor }

  // Ya lleva esa unidad: no se duplica ni se toca nada.
  if (actual.endsWith(atajo.texto.trim())) {
    return { texto: actual, cursor: actual.length }
  }

  /* El RPE va delante del número, así que añadirlo al final daría «6 RPE».
     Cuando el atajo es un prefijo se antepone. */
  const esPrefijo = atajo.cursor >= atajo.texto.length
  const texto = esPrefijo ? atajo.texto + actual : actual + atajo.texto
  return { texto, cursor: texto.length }
}
