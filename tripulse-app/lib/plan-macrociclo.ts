// ============================================================
// TRIPULSE — Dibujar la temporada entera, hacia atrás desde la carrera
// ============================================================
// Esto es lo que hoy hace el entrenador a mano en el lienzo, y lo que un atleta
// solo no puede hacer: repartir las semanas que hay hasta su objetivo en fases y
// mesociclos. Sin esto no hay nada que encadenar ni que adaptar — es el cimiento
// del entrenador de IA, y no lo escribe ningún modelo: son las plantillas de
// cuenta atrás de B1-02.
//
// SE TRABAJA HACIA ATRÁS, no hacia adelante. La fecha de la carrera es la única
// que no se puede mover; lo que cede es el principio. Planificar hacia adelante
// y ver qué sale es como se llega a un tapering que cae dos semanas después de
// la meta.
import { sumarDias, diasEntre } from './desplazar'
import { claseDeMeso, type ClaseMeso } from './plan-mesociclo'
import { TIPOS_MESO, type ModeloPeriodizacion } from './periodizacion'
import type { FaseMacro, DistanciaTri } from './distribucion-zonas'

/**
 * Las plantillas de cuenta atrás de B1-02, en semanas.
 *
 * `min` es hasta dónde se puede encoger cada fase cuando no hay tiempo. El
 * tapering tiene el suyo más alto en proporción: es lo último que se recorta
 * porque es lo que hace que llegues fresco, y recortarlo convierte toda la
 * preparación anterior en una carrera con las piernas cargadas.
 */
interface Plantilla {
  taper: { ideal: number; min: number }
  pe: { ideal: number; min: number }
  pg: { ideal: number; min: number }
}

const PLANTILLAS: Record<DistanciaTri, Plantilla> = {
  // B1-03 da 7–10 días de tapering para sprint: una semana.
  sprint: { taper: { ideal: 1, min: 1 }, pe: { ideal: 6, min: 3 }, pg: { ideal: 8, min: 4 } },
  // B1-02 §Plantilla A-race (Olímpico o 70.3): taper 2, PE 8, PG 12.
  olimpico: { taper: { ideal: 2, min: 1 }, pe: { ideal: 8, min: 4 }, pg: { ideal: 12, min: 5 } },
  medio: { taper: { ideal: 2, min: 2 }, pe: { ideal: 8, min: 4 }, pg: { ideal: 12, min: 6 } },
  // B1-02 §Plantilla Ironman: taper 3, PE 9, PG 18. La PG es más larga porque el
  // tejido conectivo necesita 12–16 semanas para adaptarse al volumen.
  largo: { taper: { ideal: 3, min: 2 }, pe: { ideal: 9, min: 5 }, pg: { ideal: 18, min: 8 } },
}

/** Cuánto puede crecer la PG con el tiempo que sobre, antes de meter transición. */
const PG_MAXIMA: Record<DistanciaTri, number> = {
  sprint: 14, olimpico: 18, medio: 20, largo: 26,
}

export interface BloqueMacro {
  nombre: string
  /** Tipo tal y como lo nombra el modelo de periodización elegido. */
  tipo: string
  clase: ClaseMeso
  fase: FaseMacro
  semanas: number
  /** Lunes de su primera semana. */
  lunes: string
}

export interface Temporada {
  desde: string
  /** Domingo de la semana de la carrera. */
  hasta: string
  semanas: number
  bloques: BloqueMacro[]
  avisos: string[]
  /** No hay tiempo ni para los mínimos: no se puede dibujar nada honesto. */
  imposible: boolean
}

export interface EntradaTemporada {
  /** Lunes desde el que se empieza a entrenar. */
  desde: string
  /** Día de la competición A. */
  objetivo: string
  distancia: DistanciaTri
  modelo?: ModeloPeriodizacion
}

/** El nombre que ese modelo le da a un bloque de esa clase. */
function tipoParaClase(modelo: ModeloPeriodizacion, clase: ClaseMeso): string {
  const tipos = TIPOS_MESO[modelo] || TIPOS_MESO.ATR
  // Se busca por CLASE y no por posición: los cuatro modelos ordenan sus bloques
  // distinto, y coger `tipos[0]` daría «Intensidad» como bloque de base en la
  // periodización inversa, que es justo lo contrario de lo que es.
  //
  // Y para el bloque de competición se coge el ÚLTIMO que case, no el primero:
  // el Tradicional tiene «Competitiva» y «Taper», los dos de esa clase, y el
  // que cierra la temporada es el segundo. En todos los modelos el afinamiento
  // es el último de su lista.
  const casan = tipos.filter(t => claseDeMeso(t.tipo) === clase)
  if (!casan.length) return tipos[0].tipo
  return (clase === 'competicion' ? casan[casan.length - 1] : casan[0]).tipo
}

/**
 * Reparte las semanas de una fase en mesociclos de su duración canónica.
 *
 * La acumulación va en bloques de 4 (el 3:1 de B1-03) y la transmutación en
 * bloques de 3 (el 2:1). El resto NO se deja como un bloque suelto de una
 * semana: se reparte entre los que hay, porque un mesociclo de una semana no
 * tiene dónde poner su descarga.
 */
function repartir(semanas: number, canonico: number): number[] {
  if (semanas <= 0) return []
  if (semanas <= canonico) return [semanas]
  const n = Math.max(1, Math.round(semanas / canonico))
  const base = Math.floor(semanas / n)
  const sobra = semanas - base * n
  return Array.from({ length: n }, (_, i) => base + (i < sobra ? 1 : 0))
}

export function planDeTemporada(e: EntradaTemporada): Temporada {
  const modelo = e.modelo || 'ATR'
  const desde = String(e.desde).slice(0, 10)
  const objetivo = String(e.objetivo).slice(0, 10)
  const avisos: string[] = []

  const dias = diasEntre(desde, objetivo)
  // La semana de la carrera cuenta: si corre el domingo, esa semana se entrena.
  const total = Math.floor(dias / 7) + 1
  const hasta = sumarDias(desde, total * 7 - 1)

  const vacia = (motivo: string): Temporada => {
    avisos.push(motivo)
    return { desde, hasta, semanas: Math.max(0, total), bloques: [], avisos, imposible: true }
  }

  if (dias < 0) return vacia('La competición es anterior a la fecha de inicio.')

  const pl = PLANTILLAS[e.distancia]
  const minimo = pl.taper.min + pl.pe.min + pl.pg.min
  if (total < minimo) {
    return vacia(
      'Hacen falta al menos ' + minimo + ' semanas para esta distancia y solo hay ' + total + '. ' +
      'Con menos, lo honesto es preparar otra prueba o mover la fecha.')
  }

  const ideal = pl.taper.ideal + pl.pe.ideal + pl.pg.ideal
  let taper = pl.taper.ideal, pe = pl.pe.ideal, pg = pl.pg.ideal
  let transicion = 0

  if (total < ideal) {
    // No llega. Se recorta en orden: primero la base, luego la específica, y el
    // tapering el último — es lo que hace que llegues fresco.
    let falta = ideal - total
    const recorte = (actual: number, min: number) => {
      const puede = Math.min(falta, actual - min)
      falta -= puede
      return actual - puede
    }
    pg = recorte(pg, pl.pg.min)
    if (falta > 0) pe = recorte(pe, pl.pe.min)
    if (falta > 0) taper = recorte(taper, pl.taper.min)
    avisos.push(
      'Hay ' + total + ' semanas y el plan de libro pide ' + ideal + '. Se ha recortado la base primero y ' +
      'el tapering el último: llegar fresco pesa más que una semana más de volumen.')
  } else if (total > ideal) {
    // Sobra. Crece la BASE, no la calidad: la específica no se sostiene meses.
    const sobra = total - ideal
    const cabe = Math.min(sobra, PG_MAXIMA[e.distancia] - pg)
    pg += cabe
    transicion = sobra - cabe
    if (transicion > 0) {
      avisos.push(
        'Sobran ' + transicion + ' semanas después de estirar la base al máximo. Van a una transición al ' +
        'principio: entrenar suave y sin estructura es mejor que alargar la base más de la cuenta.')
    }
  }

  // ---- Montar los bloques, de principio a fin ----
  const bloques: BloqueMacro[] = []
  let cursor = desde
  const meter = (nombre: string, clase: ClaseMeso, fase: FaseMacro, semanas: number) => {
    if (semanas <= 0) return
    bloques.push({ nombre, tipo: tipoParaClase(modelo, clase), clase, fase, semanas, lunes: cursor })
    cursor = sumarDias(cursor, semanas * 7)
  }

  if (transicion > 0) meter('Transición', 'descarga', 'transicion', transicion)

  // La base en bloques de 4 (el 3:1), y su fase avanza: la primera mitad es PG
  // inicial y la segunda PG avanzada, que es donde entra algo de calidad.
  const bloquesPG = repartir(pg, 4)
  bloquesPG.forEach((s, i) => meter(
    'Base ' + (i + 1),
    'acumulacion',
    i < bloquesPG.length / 2 ? 'pg-inicial' : 'pg-avanzada',
    s))

  const bloquesPE = repartir(pe, 3)
  bloquesPE.forEach((s, i) => meter(
    'Específico ' + (i + 1),
    'transmutacion',
    i < bloquesPE.length / 2 ? 'pe-inicial' : 'pe-avanzada',
    s))

  meter('Tapering', 'competicion', 'tapering', taper)

  return { desde, hasta, semanas: total, bloques, avisos, imposible: false }
}

/** Suma de control: los bloques tienen que cubrir la temporada, ni más ni menos. */
export function semanasCubiertas(t: Temporada): number {
  return t.bloques.reduce((a, b) => a + b.semanas, 0)
}
