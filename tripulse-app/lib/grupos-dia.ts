// ============================================================
// TRIPULSE — La hoja del día de un grupo
// ============================================================
//
// Lo que un entrenador necesita al borde de la piscina: QUÉ toca hoy y, al lado
// de cada nombre, SUS números. Hasta ahora eso eran diez fichas abiertas una a
// una, y el dato ya estaba calculado en cada sesión — solo faltaba juntarlo.
//
// LO QUE AGRUPA ES LA EMISIÓN, no la fecha. Cuando mandas un entrenamiento al
// grupo se crea una sesión por persona, todas con el mismo `id_emision`: eso es
// lo que dice «esto es LA MISMA sesión, repartida». Agrupar solo por día juntaría
// cosas que no tienen nada que ver — el que se añade una carrera por su cuenta
// esa tarde no está haciendo lo del grupo.
//
// Y por eso las sesiones sin emisión salen aparte y por persona: son suyas, no
// del grupo. Enseñarlas importa igual (si hoy toca serie y uno se ha metido una
// tirada larga por su cuenta, quieres verlo antes de mandarle a hacer series),
// pero no son la misma cosa.

import { referenciaDeZona, type ReferenciasDeUno } from './referencia-zona'

export interface SesionDia {
  id: number
  id_deportista: number
  id_emision: string | null
  disciplina: string | null
  estado: string | null
  fecha_sesion: string
  tareas?: any[]
}

export interface NumerosDeUno {
  id_deportista: number
  nombre: string
  /** Una entrada por zona de la sesión, con lo que esa zona significa para él. */
  porZona: { zona: string; ritmo: string | null; fc: string | null; rpe: string }[]
  /** Si le falta el test que hace falta para esta disciplina. */
  sinTest: boolean
  estado: string | null
  idSesion: number
}

export interface BloqueDia {
  /** La emisión, o `libre:<id>` para lo que cada uno se añade. */
  clave: string
  esDelGrupo: boolean
  disciplina: string
  /** Las zonas de la sesión, en orden y sin repetir. */
  zonas: string[]
  /** Las tareas, tal y como se prescribieron. Se enseñan UNA vez. */
  tareas: any[]
  quien: NumerosDeUno[]
}

/** Las zonas de una sesión, en el orden en que se prescribieron y sin repetir. */
export function zonasDe(tareas: any[] | null | undefined): string[] {
  const vistas = new Set<string>()
  const out: string[] = []
  for (const t of [...(tareas || [])].sort((a, b) => (a?.orden || 0) - (b?.orden || 0))) {
    const z = t?.zona_entrenamiento
    if (z && !vistas.has(z)) { vistas.add(z); out.push(z) }
  }
  return out
}

/** ¿Le falta a esta persona el test que hace falta para poner números aquí? */
export function leFaltaElTest(disciplina: string | null | undefined, ref: ReferenciasDeUno | undefined): boolean {
  if (!ref) return true
  const d = disciplina || ''
  if (d.startsWith('Nat')) return !ref.tests.css
  if (d === 'Ciclismo') return !ref.tests.ftp
  if (d === 'Carrera') return !ref.tests.vam
  // Fuerza, brick y demás no se traducen a un ritmo: no falta nada.
  return false
}

/**
 * Monta la hoja: qué se entrena hoy y qué números le tocan a cada uno.
 *
 * `miembros` manda el ORDEN de las filas — el mismo que en la página del grupo,
 * para que leer las dos seguidas no obligue a buscar a nadie.
 */
export function hojaDelDia(
  sesiones: SesionDia[],
  miembros: { id_deportista: number; nombre: string }[],
  refs: Map<number, ReferenciasDeUno>,
): BloqueDia[] {
  const delGrupo = new Map<string, SesionDia[]>()
  const libres: SesionDia[] = []

  for (const s of sesiones || []) {
    if (s.id_emision) {
      const l = delGrupo.get(String(s.id_emision))
      if (l) l.push(s); else delGrupo.set(String(s.id_emision), [s])
    } else {
      libres.push(s)
    }
  }

  const orden = new Map(miembros.map((m, i) => [Number(m.id_deportista), i]))
  const nombreDe = (idDep: number) =>
    miembros.find(m => Number(m.id_deportista) === Number(idDep))?.nombre || 'Deportista'

  const numerosDe = (s: SesionDia, zonas: string[]): NumerosDeUno => {
    const ref = refs.get(Number(s.id_deportista))
    const disc = s.disciplina || ''
    return {
      id_deportista: s.id_deportista,
      nombre: nombreDe(s.id_deportista),
      idSesion: s.id,
      estado: s.estado ?? null,
      sinTest: leFaltaElTest(disc, ref),
      porZona: zonas.map(z => {
        const r = ref ? referenciaDeZona(z, disc, ref.tests, ref.fcMax) : null
        return { zona: z, ritmo: r?.ritmo ?? null, fc: r?.fc ?? null, rpe: r?.rpe ?? '' }
      }),
    }
  }

  const bloques: BloqueDia[] = []

  for (const [emision, lista] of delGrupo) {
    /* Las tareas se enseñan una sola vez porque son la misma prescripción
       repartida. Se cogen de la primera copia que las tenga: puede que alguna
       venga sin ellas si el reparto falló a medias, y entonces enseñar «sesión
       vacía» sería mentir sobre lo que se mandó. */
    const conTareas = lista.find(s => (s.tareas || []).length) || lista[0]
    const tareas = [...(conTareas?.tareas || [])].sort((a, b) => (a?.orden || 0) - (b?.orden || 0))
    const zonas = zonasDe(tareas)
    bloques.push({
      clave: emision,
      esDelGrupo: true,
      disciplina: conTareas?.disciplina || '',
      zonas,
      tareas,
      quien: lista
        .slice()
        .sort((a, b) => (orden.get(Number(a.id_deportista)) ?? 99) - (orden.get(Number(b.id_deportista)) ?? 99))
        .map(s => numerosDe(s, zonas)),
    })
  }

  for (const s of libres) {
    const tareas = [...(s.tareas || [])].sort((a, b) => (a?.orden || 0) - (b?.orden || 0))
    const zonas = zonasDe(tareas)
    bloques.push({
      clave: 'libre:' + s.id,
      esDelGrupo: false,
      disciplina: s.disciplina || '',
      zonas,
      tareas,
      quien: [numerosDe(s, zonas)],
    })
  }

  // Primero lo del grupo, que es lo que vas a dirigir; lo de cada uno, después.
  return bloques.sort((a, b) => Number(b.esDelGrupo) - Number(a.esDelGrupo))
}

/** «6 de 8 lo han hecho» para la cabecera de un bloque. */
export function hechasDe(b: BloqueDia): { hechas: number; total: number } {
  return {
    hechas: b.quien.filter(q => q.estado === 'Realizada').length,
    total: b.quien.length,
  }
}

/**
 * La línea de una tarea en la hoja: «4 × 400 m», «30 min», «3 series».
 *
 * Sale de los campos de `vistaDeTarea`, pero unir sus valores a pelo daba cosas
 * como «Recuperación 1» — un uno suelto que era el número de series sin decirlo.
 * Aquí se arma la frase: las series solo si son más de una, y el valor por serie
 * si lo hay; si no, el total; si tampoco, se dice «N series», que al menos se
 * entiende.
 */
export function detalleDeTarea(campos: { k: string; v: string }[] | null | undefined): string {
  const de = (k: string) => {
    const v = (campos || []).find(c => c.k === k)?.v
    return v && v !== '—' ? v : ''
  }
  const series = de('Series')
  const porSerie = de('Por serie') || de('Tiempo') || de('Repeticiones')
  const total = de('Total')

  if (porSerie) return series && series !== '1' ? series + ' × ' + porSerie : porSerie
  if (total) return total
  return series && series !== '1' ? series + ' series' : ''
}
