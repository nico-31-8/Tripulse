// ============================================================
// TRIPULSE — Qué semana se va a planificar, y qué hay en ella
// ============================================================
//
// EL PROBLEMA. El planificador tenía una casilla de fecha pelada y por defecto
// el lunes que viene. Para elegir otra semana había que saber que el valor tiene
// que ser un LUNES —si ponías un miércoles, la semana salía torcida— y abrir un
// calendario a buscarla. Y una vez elegida no se sabía nada de ella: si era de
// carga o de descarga, a qué bloque pertenecía, si tenía una competición
// dentro, si ya había sesiones puestas.
//
// O sea que la decisión más importante de la pantalla —para qué semana estoy
// planificando— se tomaba a ciegas.
//
// LO QUE HACE ESTO. Da las semanas candidatas ya calculadas, cada una con lo
// que se sabe de ella. La pantalla las enseña como una lista y el entrenador
// elige mirando, no recordando.
//
// SIEMPRE LUNES, POR CONSTRUCCIÓN. Las fechas salen de `lunesDe(hoy)` más
// semanas enteras, así que no hay forma de elegir un miércoles.

import { lunesDe, sumarSemanas, sumarDias, hoyISO, rangoLegible } from './fechas'

/** Cuántas semanas se ofrecen hacia delante, contando la actual. */
export const CUANTAS = 6

export interface Competicion {
  nombre: string
  fecha: string
  prioridad?: string | null
}

export interface SemanaCandidata {
  /** El lunes, en ISO. Es lo que se manda al volcado. */
  lunes: string
  /** 0 = la semana en curso, 1 = la que viene, 2 = la siguiente… */
  offset: number
  /** «Esta semana», «La que viene», «En 3 semanas». */
  cuando: string
  /** «31 ago – 6 sep». */
  rango: string
  /** Del microciclo, si esa semana está dibujada: Carga, Descarga, Choque… */
  tipo?: string | null
  /** Las UA que el entrenador dibujó para esa semana. */
  ua?: number | null
  /** El objetivo del mesociclo al que pertenece. */
  bloque?: string | null
  /** Cuántas sesiones hay ya puestas. */
  sesiones: number
  /** Competiciones que caen dentro. */
  competiciones: Competicion[]
}

/**
 * Cómo se llama una semana según lo lejos que esté.
 *
 * «Esta semana» y «La que viene» se dicen así porque es como se habla; a partir
 * de ahí el número es más claro que seguir inventando nombres.
 */
export function cuandoEs(offset: number): string {
  if (offset === 0) return 'Esta semana'
  if (offset === 1) return 'La que viene'
  return 'En ' + offset + ' semanas'
}

/** Los lunes candidatos: el de esta semana y los siguientes. */
export function lunesCandidatos(hoy: string = hoyISO(), cuantas: number = CUANTAS): string[] {
  const base = lunesDe(hoy)
  return Array.from({ length: Math.max(1, cuantas) }, (_, i) => sumarSemanas(base, i))
}

/**
 * Si a la semana en curso ya no le quedan días útiles.
 *
 * Planificar el jueves para «esta semana» deja tres días, y normalmente no es
 * lo que se quiere. No se prohíbe —a veces se rescata una semana a medias— pero
 * se avisa, que es distinto de decidir por el entrenador.
 */
export function quedaPocoDeLaSemana(lunes: string, hoy: string = hoyISO()): boolean {
  const dias = diasQueQuedan(lunes, hoy)
  return dias !== null && dias <= 3
}

/** Días de esa semana que van de hoy en adelante, o null si no es la actual. */
export function diasQueQuedan(lunes: string, hoy: string = hoyISO()): number | null {
  const domingo = sumarDias(lunes, 6)
  if (hoy < lunes || hoy > domingo) return null
  let n = 0
  for (let i = 0; i < 7; i++) if (sumarDias(lunes, i) >= hoy) n++
  return n
}

interface Micro { fecha_inicio?: string | null; tipo?: string | null; ua_planificada?: number | null; id_mesociclo?: number | null }
interface Meso { id?: number; objetivo?: string | null; tipo?: string | null }

/**
 * Monta las candidatas con su contexto.
 *
 * Es pura: recibe lo leído de la base y lo cruza. Lo que va a la base lo hace
 * `contextoDeSemanas`, y así esta parte —que es donde se puede equivocar uno—
 * se prueba sin base de datos.
 */
export function construirCandidatas(opciones: {
  hoy?: string
  cuantas?: number
  micros?: Micro[]
  mesos?: Meso[]
  competiciones?: Competicion[]
  /** Sesiones ya puestas, por lunes. */
  sesionesPorLunes?: Record<string, number>
}): SemanaCandidata[] {
  const hoy = opciones.hoy || hoyISO()
  const micros = opciones.micros || []
  const mesos = opciones.mesos || []
  const comps = opciones.competiciones || []
  const yaHay = opciones.sesionesPorLunes || {}

  return lunesCandidatos(hoy, opciones.cuantas ?? CUANTAS).map((lunes, offset) => {
    const domingo = sumarDias(lunes, 6)

    /* El microciclo de esa semana es el que EMPIEZA ese lunes. Buscar por rango
       haría que una semana heredase el tipo de la anterior cuando el dibujo
       tiene huecos, y entonces la pantalla diría «Descarga» de una semana que
       nadie ha dibujado. */
    const micro = micros.find(m => m.fecha_inicio && String(m.fecha_inicio).slice(0, 10) === lunes)
    const meso = micro?.id_mesociclo != null ? mesos.find(x => x.id === micro.id_mesociclo) : undefined

    return {
      lunes,
      offset,
      cuando: cuandoEs(offset),
      rango: rangoLegible(lunes),
      tipo: micro?.tipo ?? null,
      ua: micro?.ua_planificada ?? null,
      bloque: meso?.objetivo || meso?.tipo || null,
      sesiones: yaHay[lunes] ?? 0,
      competiciones: comps
        .filter(c => c.fecha >= lunes && c.fecha <= domingo)
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    }
  })
}

/**
 * Lee de la base lo que hace falta y devuelve las candidatas.
 *
 * TRES CONSULTAS Y NO UNA POR SEMANA. Con seis semanas serían dieciocho idas y
 * vueltas mientras el entrenador espera a que se abra la pantalla.
 *
 * Si algo falla se devuelven las semanas SIN contexto en vez de no devolver
 * nada: sin fechas no hay pantalla, y sin tipo de microciclo sí la hay —solo
 * que más sosa—. Nunca se inventa contexto, se omite.
 */
export async function contextoDeSemanas(
  sb: any, idDeportista: number, hoy: string = hoyISO(), cuantas: number = CUANTAS,
): Promise<SemanaCandidata[]> {
  const lunes = lunesCandidatos(hoy, cuantas)
  const desde = lunes[0]
  const hasta = sumarDias(lunes[lunes.length - 1], 6)

  try {
    const [micros, mesos, comps, ses] = await Promise.all([
      sb.from('microciclo').select('*').eq('id_deportista', idDeportista)
        .gte('fecha_inicio', desde).lte('fecha_inicio', hasta),
      sb.from('mesociclo').select('*').eq('id_deportista', idDeportista),
      sb.from('competicion').select('*').eq('id_deportista', idDeportista)
        .gte('fecha', desde).lte('fecha', hasta),
      sb.from('sesion').select('fecha_sesion').eq('id_deportista', idDeportista)
        .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
        .or('eliminada.is.null,eliminada.eq.false'),
    ])

    /* Cada sesión cae en la semana de su lunes. Contarlas aquí evita una
       consulta por semana. */
    const sesionesPorLunes: Record<string, number> = {}
    for (const s of ses.data || []) {
      const f = String(s.fecha_sesion).slice(0, 10)
      const l = lunesDe(f)
      sesionesPorLunes[l] = (sesionesPorLunes[l] || 0) + 1
    }

    return construirCandidatas({
      hoy, cuantas,
      micros: micros.data || [],
      mesos: mesos.data || [],
      competiciones: (comps.data || []).map((c: any) => ({
        nombre: c.nombre, fecha: String(c.fecha).slice(0, 10), prioridad: c.prioridad,
      })),
      sesionesPorLunes,
    })
  } catch {
    return construirCandidatas({ hoy, cuantas })
  }
}

/** Lo que hay que decirle al entrenador de esa semana, si hay algo. */
export function avisoDe(s: SemanaCandidata, hoy: string = hoyISO()): string | null {
  if (s.competiciones.length) {
    const c = s.competiciones[0]
    const pri = c.prioridad ? ' (' + c.prioridad + ')' : ''
    return 'Compite esta semana: ' + c.nombre + pri + '.'
  }
  if (s.offset === 0 && quedaPocoDeLaSemana(s.lunes, hoy)) {
    const d = diasQueQuedan(s.lunes, hoy)
    return 'Ya empezada: solo ' + (d === 1 ? 'queda 1 día' : 'quedan ' + d + ' días') + '.'
  }
  if (s.sesiones > 0) {
    return 'Ya tiene ' + s.sesiones + (s.sesiones === 1 ? ' sesión puesta' : ' sesiones puestas') + '.'
  }
  if (!s.tipo) return 'Sin dibujar en la periodización.'
  return null
}

/**
 * Cuál viene marcada al abrir.
 *
 * La primera que esté vacía y sin empezar. Si la semana en curso ya va por el
 * jueves, proponerla sería proponer tres días; y si una ya tiene sesiones,
 * planificar encima duplicaría. Si todas tienen algo, la que viene, que es lo
 * que hacía antes.
 */
export function porDefecto(cands: SemanaCandidata[], hoy: string = hoyISO()): string {
  const libre = cands.find(s =>
    s.sesiones === 0 && !(s.offset === 0 && quedaPocoDeLaSemana(s.lunes, hoy)))
  return (libre ?? cands[1] ?? cands[0])?.lunes ?? lunesDe(hoy)
}
