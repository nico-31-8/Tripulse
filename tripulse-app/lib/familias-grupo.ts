// ============================================================
// Las familias del desplegable de grupo muscular
// ============================================================
//
// La biblioteca clasifica con etiquetas, pero al prescribir se elige por UNA
// cadena, `grupo_muscular` (ver lib/grupo-ejercicio). Con 22 grupos distintos,
// el desplegable era una lista alfabética de 22 líneas con scroll donde
// «Complejos» caía entre «Ciclismo — específico» y «Core y estabilidad».
//
// Esto NO es una clasificación nueva: la lupa ya agrupaba con sus chips (Tren
// superior, Core, Específico…), solo que a mano y solo para ella. Aquí vive la
// lista, y la usan las dos: las cabeceras del desplegable y los chips de la
// lupa dicen lo mismo porque salen del mismo sitio.
//
// LA FAMILIA NO SE GUARDA EN NINGÚN LADO
// Lo que se elige y lo que va a la base sigue siendo el grupo de siempre,
// «Cuádriceps». La familia solo parte la lista en pantalla. Por eso el reparto
// de series por grupo (lib/series-por-grupo) no se entera de que esto existe.
//
// NADIE SE QUEDA FUERA
// Un grupo que no esté en ninguna lista cae en «Otros» y sale igual. Esto
// importa porque los grupos nacen solos: al crear un ejercicio en /fuerza, el
// grupo sale de su primera región (`grupoAlCrear`), y las regiones son más
// cortas que los grupos viejos — «Hombro» además de «Hombro y manguito
// rotador». Por eso cada familia lleva las dos formas, y detrás un patrón
// para lo que venga.

import { COMPLEJOS, FUNCIONAL } from './grupo-ejercicio'
import { SIN_CLASIFICAR } from './series-por-grupo'

export interface Familia {
  id: string
  /** La cabecera del <optgroup>. */
  etiqueta: string
  /** Para el chip de la lupa, donde la etiqueta larga no cabe. */
  corta: string
  /** Los grupos que van en ella, EN ESTE ORDEN (el del cuerpo, no el alfabético). */
  grupos: string[]
  /**
   * La red para lo que no esté escrito arriba. Los de parte del cuerpo van
   * anclados al principio del nombre a propósito: si «cadera» valiera en
   * cualquier posición, «Movilidad de cadera» caería en Tren inferior en vez
   * de en Movilidad, porque esa familia se mira antes.
   */
  patron?: RegExp
}

export const OTROS = 'otros'

export const FAMILIAS: Familia[] = [
  {
    id: 'inferior', etiqueta: 'Tren inferior', corta: 'Tren inferior',
    grupos: ['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Cadera y aductores',
      'Rodilla', 'Rodilla (fortalecimiento)', 'Tobillo y pie'],
    patron: /^(cu[áa]driceps|isquio|gl[úu]teo|cadera|aductor|rodilla|tobillo|gemelo|s[óo]leo|pantorrilla)/i,
  },
  {
    id: 'superior', etiqueta: 'Tren superior', corta: 'Tren superior',
    grupos: ['Pectoral', 'Espalda alta', 'Espalda alta y romboides', 'Hombro',
      'Hombro y manguito rotador', 'Bíceps', 'Tríceps', 'Cuello', 'Cuello y cervical'],
    patron: /^(pectoral|espalda alta|dorsal|romboides|hombro|manguito|b[íi]ceps|tr[íi]ceps|cuello|cervical|trapecio)/i,
  },
  {
    id: 'tronco', etiqueta: 'Core y tronco', corta: 'Core',
    grupos: ['Core', 'Core y estabilidad', 'Espalda baja'],
    patron: /^(core|lumbar|abdomen|abdominal|oblicuo|espalda baja)/i,
  },
  {
    id: 'especifico', etiqueta: 'Específico del deporte', corta: 'Específico',
    grupos: ['Natación — específico', 'Ciclismo — específico', 'Carrera — específico'],
    patron: /espec[íi]fico/i,
  },
  {
    id: 'funcional', etiqueta: 'Funcional y complejos', corta: 'Funcional',
    grupos: [FUNCIONAL, COMPLEJOS],
    patron: /(funcional|complejo)/i,
  },
  {
    id: 'movilidad', etiqueta: 'Movilidad', corta: 'Movilidad',
    grupos: ['Movilidad y flexibilidad'],
    patron: /(movilidad|flexibilidad|estiramiento)/i,
  },
  /* El último y sin patrón: aquí cae lo que no encajó en ninguna. */
  { id: OTROS, etiqueta: 'Otros', corta: 'Otros', grupos: ['Otros', SIN_CLASIFICAR] },
]

const limpio = (s: string | null | undefined) => (s || '').trim()
const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** La familia de un grupo: por nombre, si no por patrón, si no «Otros». */
export function familiaDe(grupo: string | null | undefined): string {
  const g = limpio(grupo)
  if (!g) return OTROS
  const porNombre = FAMILIAS.find(f => f.grupos.some(x => igual(x, g)))
  if (porNombre) return porNombre.id
  return (FAMILIAS.find(f => f.patron?.test(g)) || { id: OTROS }).id
}

/** ¿Este grupo es de esta familia? Para los chips de la lupa. */
export const esDeFamilia = (id: string, grupo: string | null | undefined) => familiaDe(grupo) === id

export interface FamiliaConGrupos {
  id: string
  etiqueta: string
  grupos: string[]
}

/**
 * Los grupos que hay, repartidos en familias y sin las que queden vacías.
 *
 * Dentro de cada una, primero los conocidos en el orden de la familia y
 * después los que cayeron por patrón, alfabéticos. Se devuelve la cadena tal
 * y como viene de la base, no la del catálogo: es la que se guarda.
 */
export function porFamilias(grupos: (string | null | undefined)[]): FamiliaConGrupos[] {
  const hay: string[] = []
  for (const g of grupos || []) {
    const l = limpio(g)
    if (l && !hay.some(x => igual(x, l))) hay.push(l)
  }
  return FAMILIAS.map(f => {
    const suyos = hay.filter(g => familiaDe(g) === f.id)
    const conocidos = f.grupos
      .map(c => suyos.find(s => igual(s, c)))
      .filter((s): s is string => !!s)
    const resto = suyos
      .filter(s => !conocidos.includes(s))
      .sort((a, b) => a.localeCompare(b, 'es'))
    return { id: f.id, etiqueta: f.etiqueta, grupos: [...conocidos, ...resto] }
  }).filter(f => f.grupos.length > 0)
}
