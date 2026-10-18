// ============================================================
// TRIPULSE — Una sesión, como entreno para el COROS del deportista
// ============================================================
// El entrenador pulsa «⌚ Su COROS» y cada sesión de carrera o de bici se manda
// al calendario de COROS del deportista. Esto es la TRADUCCIÓN, sin red ni base
// de datos: de las tareas de una sesión al «course» que pide la herramienta
// createScheduledWorkout de COROS, y el estado de cada sesión frente a lo que ya
// se mandó (reloj_envio). La usan la ruta que manda y la que enseña el estado,
// así que las dos ven lo mismo.
//
// LO QUE LE LLEGA AL RELOJ ES LO QUE VE EL DEPORTISTA. La intensidad de cada
// tarea es la de su columna «@»: lo que escribió el entrenador o, si no escribió
// nada, lo que calcula la app (objetivoDeTarea). Se pasa a números solo cuando
// la unidad no deja dudas («4:30 /km», «140-150 ppm», «180–220 W», «95–105%
// VAM»); en la base hay «3:09», «25s», «2:01-2;04» o «a tope», y convertir eso
// sería poner en el reloj un objetivo que el entrenador no ha escrito. Eso va,
// tal cual, a la descripción del entreno.
//
// LO SUAVE SIN SUELO VA POR PULSO (decidido el 18-10-2026). «< 5:26 /km» solo
// tiene techo, y COROS pide los dos extremos de un rango: se manda «FC hasta
// 126» (de 30 a 126, el mínimo que admite), en carrera y en bici.
//
// LO QUE COROS NO DEJA (sus propias reglas, leídas de sus herramientas): solo
// carrera, bici y trail; grupos de intervalos sin anidar y de 1 a 20
// repeticiones; en bici, ni ritmo; nombre de 100 caracteres como mucho. Un 3 ×
// (2 × 400) va desplegado: tres grupos de 2 × 400 con el descanso largo entre
// medias. Un brick son entrenos sueltos el mismo día (de momento, de dos partes
// como mucho: es lo que hay en la base y en las plantillas).

import { intensidadGuardada } from './intensidad-prescrita'
import { objetivoDeTarea } from './objetivo-tarea'
import { referenciaDeZona, type Tests } from './referencia-zona'
import { seriesTarea, bloquesDe } from './bloques-tarea'
import { ZONAS_RESISTENCIA, numZonaClasica } from './zonas'
import { nombreDeZona } from './tarea-vista'
import { mmss, duracionCorta, horasMinutos } from './medicion'
import type { TestConMediciones } from './referencia-propia'

/** Lo que se manda, por disciplina de TRIPULSE: 1 = carrera, 2 = ciclismo. */
export const DEPORTE_COROS: Record<string, 1 | 2> = { Carrera: 1, Ciclismo: 2 }
export const SE_MANDA_A_COROS = ['Carrera', 'Ciclismo', 'Brick']
export const DIAS_POR_DELANTE_COROS = 90
export const REPETICIONES_MAXIMAS_COROS = 20
export const PARTES_MAXIMAS_BRICK = 2
const LARGO_NOMBRE = 100
const LARGO_DESCRIPCION = 1000

/** 1 = pulso, 2 = ritmo, 4 = potencia (los códigos de COROS). */
export type TipoIntensidad = 1 | 2 | 4
/** Lo que admite COROS en un rango absoluto, por tipo. El ritmo en s/km. */
export const LIMITES_COROS: Record<TipoIntensidad, [number, number]> = { 1: [30, 240], 2: [120, 1499], 4: [10, 2000] }

export interface SeccionCoros {
  /** 1 calentamiento, 2 trabajo, 3 recuperación, 4 vuelta a la calma. */
  sectionType: 1 | 2 | 3 | 4
  /** 1 metros, 2 segundos, 4 libre (se acaba con el botón de vuelta). */
  targetType: 1 | 2 | 4
  targetValue?: number
  intensityType?: TipoIntensidad
  intensityValueStart?: number
  intensityValueEnd?: number
}
export interface GrupoCoros { intervalGroup: true; repeats: number; sets: SeccionCoros[] }
export type PasoCoros = SeccionCoros | GrupoCoros
export interface CursoCoros { sportType: 1 | 2; courseName: string; courseDescription: string; sections: PasoCoros[] }
/** Un entreno para un día. Un brick da uno por parte. */
export interface EntrenoCoros { parte: number; disciplina: string; curso: CursoCoros; huella: string }

interface MedicionPlaneada {
  metros_planeados?: number | string | null
  tiempo_planeado?: number | string | null
  ritmo_objetivo?: string | null
}

/** Lo que hace falta de una tarea guardada: justo lo que trae la consulta de la ruta. */
export interface TareaParaCoros {
  id?: number
  orden?: number | null
  /** En un brick, la de cada bloque. */
  disciplina?: string | null
  zona_entrenamiento?: string | null
  series?: number | null
  bloques?: number | null
  descanso_segundos?: number | null
  descanso_bloques_segundos?: number | null
  comentario?: string | null
  zona_copia?: unknown
  formato?: string | null
  p_distancia?: MedicionPlaneada | MedicionPlaneada[] | null
  p_duracion?: MedicionPlaneada | MedicionPlaneada[] | null
}

/** Lo que hace falta del deportista para calcular las intensidades. */
export interface ContextoCoros {
  tests: Tests
  propios?: TestConMediciones[]
  fcMax: number
  fcReposo?: number
}

// ------------------------------------------------------------
// Leer la intensidad de un texto
// ------------------------------------------------------------

export type TipoLeido = 'pulso' | 'ritmo' | 'potencia'
export type Leido =
  | { tipo: TipoLeido; min: number; max: number }
  | { tipo: TipoLeido; abierto: '<' | '>'; valor: number }
  | { tipo: 'porcentaje'; de: 'VAM' | 'FTP' | 'CSS'; min: number | null; max: number | null }

const ritmoSeg = (m: string, s: string | undefined) => Number(m) * 60 + (s === undefined ? 0 : Number(s))
const ordenado = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a])

/**
 * Lo que dice un texto de intensidad, SOLO si la unidad no deja dudas. Todo lo
 * demás es null: «3:09», «25s», «a tope», «76s/ritmo de 3:01».
 */
export function leerIntensidad(texto: string | null | undefined): Leido | null {
  const t = String(texto ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return null

  /* Ritmo: «4:30 /km», «4 /km», «2:54-3 /km», «< 5:26 /km». */
  let m = /^([<>])?\s*(\d{1,2})(?::(\d{2}))?(?:\s*[-–]\s*(\d{1,2})(?::(\d{2}))?)?\s*(?:min\s*)?\/\s*km$/i.exec(t)
  if (m && (m[3] === undefined || Number(m[3]) < 60) && (m[5] === undefined || Number(m[5]) < 60)) {
    const a = ritmoSeg(m[2], m[3])
    if (m[1]) return m[4] ? null : { tipo: 'ritmo', abierto: m[1] as '<' | '>', valor: a }
    const [min, max] = ordenado(a, m[4] ? ritmoSeg(m[4], m[5]) : a)
    return { tipo: 'ritmo', min, max }
  }

  /* Pulso: «140-150 ppm», «< 126 ppm», «150 bpm». */
  m = /^([<>])?\s*(\d{2,3})(?:\s*[-–]\s*(\d{2,3}))?\s*(?:ppm|bpm|lpm|pulsaciones)$/i.exec(t)
  if (m) {
    const a = Number(m[2])
    if (m[1]) return m[3] ? null : { tipo: 'pulso', abierto: m[1] as '<' | '>', valor: a }
    const [min, max] = ordenado(a, m[3] ? Number(m[3]) : a)
    return { tipo: 'pulso', min, max }
  }

  /* Potencia: «180–220 W», «< 138 W». */
  m = /^([<>])?\s*(\d{2,4})(?:\s*[-–]\s*(\d{2,4}))?\s*(?:w|vatios|watts?)$/i.exec(t)
  if (m) {
    const a = Number(m[2])
    if (m[1]) return m[3] ? null : { tipo: 'potencia', abierto: m[1] as '<' | '>', valor: a }
    const [min, max] = ordenado(a, m[3] ? Number(m[3]) : a)
    return { tipo: 'potencia', min, max }
  }

  /* Porcentaje de un test: «95–105% VAM», «< 55% FTP». */
  m = /^([<>])?\s*(\d{2,3})\s*%?(?:\s*[-–]\s*(\d{2,3}))?\s*%\s*(VAM|FTP|CSS)$/i.exec(t)
  if (m) {
    const de = m[4].toUpperCase() as 'VAM' | 'FTP' | 'CSS'
    const a = Number(m[2])
    if (m[1] === '<') return m[3] ? null : { tipo: 'porcentaje', de, min: null, max: a }
    if (m[1] === '>') return m[3] ? null : { tipo: 'porcentaje', de, min: a, max: null }
    const [min, max] = ordenado(a, m[3] ? Number(m[3]) : a)
    return { tipo: 'porcentaje', de, min, max }
  }
  return null
}

/** Un porcentaje de VAM o de FTP, pasado a ritmo o vatios con el test. Sin el test, null. */
export function desdePorcentaje(l: Extract<Leido, { tipo: 'porcentaje' }>, tests: Tests): Leido | null {
  if (l.de === 'VAM' && Number(tests.vam) > 0) {
    const vam = Number(tests.vam)
    const paso = (pct: number) => Math.round(3600 / (vam * pct / 100))
    /* Más porcentaje es más rápido: el ritmo más bajo sale del porcentaje más alto. */
    if (l.min == null && l.max != null) return { tipo: 'ritmo', abierto: '<', valor: paso(l.max) }
    if (l.max == null && l.min != null) return { tipo: 'ritmo', abierto: '>', valor: paso(l.min) }
    if (l.min != null && l.max != null) return { tipo: 'ritmo', min: paso(l.max), max: paso(l.min) }
  }
  if (l.de === 'FTP' && Number(tests.ftp) > 0) {
    const w = (pct: number) => Math.round(Number(tests.ftp) * pct / 100)
    if (l.min == null && l.max != null) return { tipo: 'potencia', abierto: '<', valor: w(l.max) }
    if (l.max == null && l.min != null) return { tipo: 'potencia', abierto: '>', valor: w(l.min) }
    if (l.min != null && l.max != null) return { tipo: 'potencia', min: w(l.min), max: w(l.max) }
  }
  return null
}

const TIPO_COROS: Record<TipoLeido, TipoIntensidad> = { pulso: 1, ritmo: 2, potencia: 4 }
/** En bici COROS no admite ritmo. */
const permitido = (disciplina: string, tipo: TipoLeido) => (disciplina === 'Ciclismo' ? tipo !== 'ritmo' : true)

// ------------------------------------------------------------
// Las tareas
// ------------------------------------------------------------

/** La fila de medición, venga como lista o como objeto (PostgREST da las dos). */
const una = <T,>(rel: T | T[] | null | undefined): T | null => (Array.isArray(rel) ? rel[0] ?? null : rel ?? null)
const positivo = (x: unknown): number => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0 }

const textoDistancia = (m: number) => (m < 1000 ? m + ' m' : String(Math.round(m / 100) / 10).replace('.', ',') + ' km')
/** «45 s», «12 min», «1:30 min», «1h15»: como se escriben las duraciones en el resto de la app. */
export const textoTiempo = (seg: number): string => (seg < 3600 ? duracionCorta(seg) : horasMinutos(Math.round(seg / 60)))
/** «6×800 m», «3×(2×400 m)», «1 h 15», «12 min». */
export function repeticionDe(t: TareaParaCoros): string {
  const m = positivo(una(t?.p_distancia)?.metros_planeados)
  const s = positivo(una(t?.p_duracion)?.tiempo_planeado)
  const valor = m ? textoDistancia(m) : s ? textoTiempo(s) : ''
  const series = seriesTarea(t), bloques = bloquesDe(t)
  if (!valor) return series > 1 ? series + ' series' : ''
  if (bloques > 1) return bloques + '×(' + series + '×' + valor + ')'
  return series > 1 ? series + '×' + valor : valor
}

/** Qué zona es más dura: la última del catálogo de TRIPULSE, o la clásica más alta. */
function dureza(z: string | null | undefined): number {
  if (!z) return -1
  const i = ZONAS_RESISTENCIA.findIndex(x => x.sigla === z)
  if (i >= 0) return i
  const c = numZonaClasica(z)
  return c ? c - 1 : -1
}

interface Intensidad {
  campos?: Pick<SeccionCoros, 'intensityType' | 'intensityValueStart' | 'intensityValueEnd'>
  /** Lo que no cabe en números y va a la descripción. */
  nota?: string
  /** De dónde salió, para decirlo en la descripción (solo si lo calculó la app). */
  calculada?: TipoLeido
  /** El techo de pulso de lo suave sin suelo. */
  tope?: number
}

const rango = (tipo: TipoIntensidad, a: number, b: number): Intensidad['campos'] | null => {
  const [lo, hi] = LIMITES_COROS[tipo]
  const [min, max] = ordenado(Math.round(a), Math.round(b))
  if (min < lo || max > hi) return null
  return { intensityType: tipo, intensityValueStart: min, intensityValueEnd: max }
}

/**
 * El pulso de la zona de la tarea, del catálogo por su sigla. NO con una zona
 * copiada de una clasificación propia del entrenador: buscarla por la sigla
 * daría otra zona (ver objetivoDeTarea).
 */
function pulsoDeZona(t: TareaParaCoros, disciplina: string, ctx: ContextoCoros): Leido | null {
  if (t?.zona_copia) return null
  const l = leerIntensidad(referenciaDeZona(t?.zona_entrenamiento, disciplina, ctx.tests, ctx.fcMax, ctx.fcReposo || 0)?.fc)
  return l && l.tipo === 'pulso' ? l : null
}

/** El techo de pulso de la zona de la tarea: «< 126 ppm» o el alto de «126–145 ppm». */
function topeDePulso(t: TareaParaCoros, disciplina: string, ctx: ContextoCoros): number | null {
  const l = pulsoDeZona(t, disciplina, ctx)
  if (!l || l.tipo === 'porcentaje') return null
  if ('abierto' in l) return l.abierto === '<' ? l.valor : null
  return l.max
}

/** La intensidad de una tarea para COROS, o la nota que va en su lugar. */
export function intensidadDeTarea(t: TareaParaCoros, disciplina: string, ctx: ContextoCoros): Intensidad {
  const escrito = intensidadGuardada(t)
  const calculado = escrito ? null : objetivoDeTarea(t, disciplina, ctx.tests, ctx.propios || [], ctx.fcMax, ctx.fcReposo || 0)
  const texto = escrito || calculado?.texto || null
  if (!texto) return {}

  let l = leerIntensidad(texto)
  if (l?.tipo === 'porcentaje') l = desdePorcentaje(l, ctx.tests)
  const deLaApp = (tipo: TipoLeido) => (escrito ? undefined : tipo)

  /* Sin nada que se pueda poner en el reloj, o de un tipo que ese deporte no
     admite: el pulso de su zona si es lo que la app calcularía, y si no, la nota. */
  if (!l || l.tipo === 'porcentaje' || !permitido(disciplina, l.tipo)) {
    if (!escrito) {
      const lf = pulsoDeZona(t, disciplina, ctx)
      if (lf && lf.tipo === 'pulso' && !('abierto' in lf)) {
        const c = rango(1, lf.min, lf.max)
        if (c) return { campos: c, calculada: 'pulso' }
      }
    }
    return { nota: texto }
  }

  if ('abierto' in l) {
    if (l.abierto === '<') {
      /* Lo suave sin suelo: por pulso, con solo techo. */
      const tope = topeDePulso(t, disciplina, ctx)
      if (tope) {
        const c = rango(1, LIMITES_COROS[1][0], tope)
        if (c) return { campos: c, tope }
      }
      /* Sin pulso conocido: los vatios y el pulso sí tienen suelo natural; el ritmo, no. */
      if (l.tipo === 'potencia' || l.tipo === 'pulso') {
        const tipo = TIPO_COROS[l.tipo]
        const c = rango(tipo, LIMITES_COROS[tipo][0], l.valor)
        if (c) return { campos: c, calculada: deLaApp(l.tipo) }
      }
      return { nota: texto }
    }
    /* «Más de»: hasta el tope de COROS (en ritmo, el más rápido que admite). */
    const tipo = TIPO_COROS[l.tipo]
    const c = l.tipo === 'ritmo' ? rango(2, LIMITES_COROS[2][0], l.valor) : rango(tipo, l.valor, LIMITES_COROS[tipo][1])
    return c ? { campos: c, calculada: deLaApp(l.tipo) } : { nota: texto }
  }

  const c = rango(TIPO_COROS[l.tipo], l.min, l.max)
  return c ? { campos: c, calculada: deLaApp(l.tipo) } : { nota: texto }
}

interface Pasos { pasos: PasoCoros[]; notas: string[]; calculadas: Set<TipoLeido>; topes: number[] }

/** Las secciones de una tarea: una sola, o los grupos de intervalos desplegados. */
export function pasosDeTarea(t: TareaParaCoros, disciplina: string, ctx: ContextoCoros, papel: 1 | 2 | 4): Pasos {
  const m = positivo(una(t?.p_distancia)?.metros_planeados)
  const s = positivo(una(t?.p_duracion)?.tiempo_planeado)
  const intens = intensidadDeTarea(t, disciplina, ctx)
  const base: SeccionCoros = {
    sectionType: papel,
    targetType: m ? 1 : s ? 2 : 4,
    ...(m ? { targetValue: m } : s ? { targetValue: s } : {}),
    ...(intens.campos || {}),
  }

  const notas: string[] = []
  const rep = repeticionDe(t)
  if (intens.nota) notas.push((rep ? rep + ': ' : '') + intens.nota)
  const comentario = String(t?.comentario ?? '').trim()
  if (comentario) notas.push((rep ? rep + ': ' : '') + comentario)
  const calculadas = new Set<TipoLeido>(intens.calculada ? [intens.calculada] : [])
  const topes = intens.tope ? [intens.tope] : []

  const series = seriesTarea(t), bloques = bloquesDe(t)
  if (series === 1 && bloques === 1) return { pasos: [base], notas, calculadas, topes }

  const descanso = positivo(t?.descanso_segundos)
  const descansoBloques = positivo(t?.descanso_bloques_segundos)
  const sets: SeccionCoros[] = [
    { ...base, sectionType: 2 },
    ...(descanso ? [{ sectionType: 3 as const, targetType: 2 as const, targetValue: descanso }] : []),
  ]
  const pasos: PasoCoros[] = []
  for (let b = 0; b < bloques; b++) {
    /* Si una serie pasa de 20 repeticiones, en grupos de 20 seguidos. */
    for (let quedan = series; quedan > 0; quedan -= REPETICIONES_MAXIMAS_COROS) {
      const repeats = Math.min(REPETICIONES_MAXIMAS_COROS, quedan)
      pasos.push(repeats === 1 ? { ...base, sectionType: 2 } : { intervalGroup: true, repeats, sets: sets.map(x => ({ ...x })) })
    }
    if (b < bloques - 1 && descansoBloques) pasos.push({ sectionType: 3, targetType: 2, targetValue: descansoBloques })
  }
  return { pasos, notas, calculadas, topes }
}

// ------------------------------------------------------------
// La sesión entera
// ------------------------------------------------------------

export interface SesionParaCoros {
  id: number
  fecha_sesion: string
  disciplina: string | null
  estado?: string | null
  notas_entrenador?: string | null
}

const ordenadas = (tareas: TareaParaCoros[]) => [...(tareas || [])].sort((a, b) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0))
const NOMBRE_DISCIPLINA: Record<string, string> = { Carrera: 'Carrera', Ciclismo: 'Ciclismo' }
const recortar = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…')

/** Las partes de un brick: los bloques seguidos de una misma disciplina que COROS admite. */
export function partesDeBrick(tareas: TareaParaCoros[]): { disciplina: string; tareas: TareaParaCoros[] }[] {
  const partes: { disciplina: string; tareas: TareaParaCoros[] }[] = []
  for (const t of ordenadas(tareas)) {
    const d = String(t?.disciplina || '')
    if (!DEPORTE_COROS[d]) continue
    const ultima = partes[partes.length - 1]
    if (ultima && ultima.disciplina === d) ultima.tareas.push(t)
    else partes.push({ disciplina: d, tareas: [t] })
  }
  return partes
}

/** Por qué una sesión no se puede mandar a COROS, o null si se puede. Solo mira la sesión. */
export function porQueNoVaACoros(s: SesionParaCoros, tareas: TareaParaCoros[]): string | null {
  const d = String(s.disciplina || '')
  if (!SE_MANDA_A_COROS.includes(d)) return 'COROS solo deja mandar carrera, bici y trail.'
  if (!(tareas || []).length) return 'No tiene tareas: no hay nada que mandar.'
  if ((tareas || []).some(t => t?.formato)) return 'Lleva un bloque con formato (AMRAP, EMOM…), y COROS no lo admite.'
  if (d === 'Brick') {
    const n = partesDeBrick(tareas).length
    if (!n) return 'Ninguna parte de este brick es de carrera o de bici.'
    if (n > PARTES_MAXIMAS_BRICK) return 'Este brick tiene ' + n + ' partes, y de momento van los de dos como mucho.'
  }
  return null
}

/** Calentamiento y vuelta a la calma: la primera y la última tarea, si son de recuperación. */
function papelDe(i: number, total: number, t: TareaParaCoros): 1 | 2 | 4 {
  const suave = t?.zona_entrenamiento === 'AER' || t?.zona_entrenamiento === 'Z1'
  if (!suave || seriesTarea(t) > 1 || bloquesDe(t) > 1) return 2
  if (i === 0 && total >= 2) return 1
  if (i === total - 1 && total >= 3) return 4
  return 2
}

function cursoDe(disciplina: string, tareas: TareaParaCoros[], ctx: ContextoCoros, nombre: string, notasSesion: string[]): CursoCoros {
  const lista = ordenadas(tareas)
  const pasos: PasoCoros[] = []
  const notas: string[] = []
  const calculadas = new Set<TipoLeido>()
  const topes: number[] = []
  lista.forEach((t, i) => {
    const p = pasosDeTarea(t, disciplina, ctx, papelDe(i, lista.length, t))
    pasos.push(...p.pasos)
    notas.push(...p.notas)
    p.calculadas.forEach(x => calculadas.add(x))
    topes.push(...p.topes)
  })

  const fuentes: string[] = []
  if (calculadas.has('ritmo')) fuentes.push('Ritmos sacados de tus tests.')
  if (calculadas.has('potencia')) fuentes.push('Vatios sacados de tus tests.')
  if (calculadas.has('pulso')) fuentes.push(Number(ctx.fcReposo) > 0 ? 'Pulso según tu FC máxima y de reposo.' : 'Pulso según tu FC máxima.')
  if (topes.length) fuentes.push('Lo suave, por pulso: por debajo de ' + Math.min(...topes) + '.')

  const descripcion = [...notasSesion, ...notas, ...fuentes].filter(Boolean).join(' ').trim()
  return {
    sportType: DEPORTE_COROS[disciplina],
    courseName: recortar(nombre, LARGO_NOMBRE),
    courseDescription: recortar(descripcion || 'Sesión de TRIPULSE.', LARGO_DESCRIPCION),
    sections: pasos,
  }
}

/** «Carrera · 6×800 m potencia aeróbica»: la disciplina y la tarea más dura. */
export function nombreDeEntreno(disciplina: string, tareas: TareaParaCoros[]): string {
  const lista = ordenadas(tareas)
  if (!lista.length) return NOMBRE_DISCIPLINA[disciplina] || disciplina
  const principal = lista.reduce((a, b) => (dureza(b?.zona_entrenamiento) > dureza(a?.zona_entrenamiento) ? b : a))
  const zona = nombreDeZona(principal?.zona_entrenamiento).toLowerCase()
  const que = [repeticionDe(principal), zona].filter(Boolean).join(' ')
  return [NOMBRE_DISCIPLINA[disciplina] || disciplina, que].filter(Boolean).join(' · ')
}

/** La huella de un entreno: si cambia, la sesión ya no daría lo que se mandó. */
export function huellaDe(curso: CursoCoros): string {
  const s = JSON.stringify(curso)
  /* cyrb53: corta, estable y sin depender de crypto (corre igual en el navegador). */
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/** Los entrenos de COROS de una sesión (uno; dos en un brick). Vacío si no va. */
export function entrenosDeSesion(s: SesionParaCoros, tareas: TareaParaCoros[], ctx: ContextoCoros): EntrenoCoros[] {
  if (porQueNoVaACoros(s, tareas)) return []
  const notasSesion = [String(s.notas_entrenador ?? '').trim()].filter(Boolean)
  const d = String(s.disciplina)
  if (d !== 'Brick') {
    const curso = cursoDe(d, tareas, ctx, nombreDeEntreno(d, tareas), notasSesion)
    return [{ parte: 1, disciplina: d, curso, huella: huellaDe(curso) }]
  }
  const partes = partesDeBrick(tareas)
  const sinNatacion = (tareas || []).some(t => t?.disciplina && !DEPORTE_COROS[String(t.disciplina)])
  const laDe = (d: string) => (d === 'Carrera' ? 'la carrera' : 'la bici')
  return partes.map((p, i) => {
    const brick = partes.length < 2 ? ''
      : i === 0 ? 'Brick: al acabar, ' + laDe(partes[1].disciplina) + ' sin parar.'
        : 'Brick: justo después de ' + laDe(partes[i - 1].disciplina) + '.'
    const avisos = [brick, sinNatacion && i === 0 ? 'La natación del brick no va: COROS no la admite.' : ''].filter(Boolean)
    const nombre = (partes.length > 1 ? 'Brick ' + (i + 1) + '/' + partes.length : 'Brick') + ' · ' + nombreDeEntreno(p.disciplina, p.tareas)
    const curso = cursoDe(p.disciplina, p.tareas, ctx, nombre, [...notasSesion, ...avisos])
    return { parte: i + 1, disciplina: p.disciplina, curso, huella: huellaDe(curso) }
  })
}

// ------------------------------------------------------------
// El estado frente a lo que ya se mandó
// ------------------------------------------------------------

/** Una fila de reloj_envio. */
export interface EnvioCoros {
  id: number
  id_sesion: number | null
  parte: number
  fecha: string
  id_externo: string
  huella: string
  nombre: string
  enviado_en: string
}

export type EstadoCoros =
  | { k: 'no' | 'hecha' | 'pasada' | 'lejos'; motivo: string }
  | { k: 'va' }
  | { k: 'cambia'; envios: EnvioCoros[] }
  | { k: 'ya'; envios: EnvioCoros[] }
  | { k: 'movida'; viejos: EnvioCoros[] }

const diaMs = (iso: string) => Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z')
const diasEntre = (a: string, b: string) => Math.round((diaMs(b) - diaMs(a)) / 86400000)

/**
 * Cómo está una sesión frente a su COROS. `envios` son las filas de ESA sesión.
 *
 * - `va`: nunca se mandó.
 * - `ya`: lo que hay en su COROS ese día es lo que daría hoy la sesión.
 * - `cambia`: está ese día, pero la sesión ya no daría lo mismo (se reemplaza).
 * - `movida`: está en su COROS, pero en otro día: COROS no deja moverla.
 */
export function estadoEnCoros(
  s: SesionParaCoros, tareas: TareaParaCoros[], entrenos: EntrenoCoros[], envios: EnvioCoros[], hoy: string,
): EstadoCoros {
  const motivo = porQueNoVaACoros(s, tareas)
  if (motivo) return { k: 'no', motivo }
  if (s.estado === 'Realizada') return { k: 'hecha', motivo: 'Ya la hizo: lo que está hecho no se cambia en su COROS.' }
  const fecha = String(s.fecha_sesion).slice(0, 10)
  if (fecha < hoy) return { k: 'pasada', motivo: 'Los días que ya pasaron no se mandan.' }
  if (diasEntre(hoy, fecha) > DIAS_POR_DELANTE_COROS) return { k: 'lejos', motivo: 'COROS deja mandar hasta ' + DIAS_POR_DELANTE_COROS + ' días por delante.' }

  const deEseDia = envios.filter(e => e.fecha === fecha)
  if (deEseDia.length) {
    const igual = entrenos.every(en => deEseDia.some(e => e.parte === en.parte && e.huella === en.huella))
      && deEseDia.length === entrenos.length
    return igual ? { k: 'ya', envios: deEseDia } : { k: 'cambia', envios: deEseDia }
  }
  if (envios.length) return { k: 'movida', viejos: envios }
  return { k: 'va' }
}

/** Lo que sigue en su COROS en un día que ya no es el de su sesión (o sin sesión). */
export function siguenEnSuCoros(envios: EnvioCoros[], fechaDeSesion: (id: number) => string | null): EnvioCoros[] {
  return envios.filter(e => {
    if (e.id_sesion == null) return true
    const f = fechaDeSesion(e.id_sesion)
    return !f || f.slice(0, 10) !== e.fecha
  })
}

export const MANDABLE: EstadoCoros['k'][] = ['va', 'cambia', 'movida']

/**
 * El número que COROS le da al entreno puesto en el calendario («idInPlan»),
 * del texto con que contesta. Hace falta para cambiarlo después. COROS contesta
 * en texto para un chat y no dice cómo: se buscan las formas razonables y, si
 * no está, null (el entreno se apunta con un número provisional, ver
 * ID_PROVISIONAL). La primera respuesta de verdad dirá cuál es.
 */
export function idEnPlanDe(texto: string | null | undefined): string | null {
  const t = String(texto ?? '')
  /* Son números CORTOS («idInPlan: 36»): el calendario de la primera cuenta real
     (18-10-2026) los da así. Se esperaban de 64 bits y se exigían tres cifras,
     y los tres primeros envíos se quedaron con el número provisional. */
  const m = /id\s*_?\s*in\s*_?\s*plan["'`]?\s*(?:[:=]|is|es)?\s*["'`]?(\d{1,25})/i.exec(t)
  return m ? m[1] : null
}

// ------------------------------------------------------------
// Su calendario de COROS (queryTrainingSchedule)
// ------------------------------------------------------------
// El formato, tal como lo devolvió la primera cuenta real el 18-10-2026:
//
//   Training Schedule
//   ========================
//
//   2026-10-20
//   P10634                      ← el nombre del entreno
//   Plan ID: 480313964264341803 ← solo si es de un plan de COROS
//   idInPlan: 36
//   Distance: 3.27 km
//   Estimated Time: 30:00
//   Load: 50 TL
//
// Lo que se manda desde TRIPULSE es un entreno suelto: sale sin «Plan ID» y
// con el nombre que le pusimos.

export interface EntradaCalendarioCoros {
  fecha: string
  nombre: string
  /** De un plan de COROS (no lo mandó TRIPULSE). */
  dePlan: boolean
  idInPlan: string
}

/** Si el texto es el calendario de COROS: si no lo es, no se saca ninguna conclusión de él. */
export const esCalendarioCoros = (texto: string | null | undefined) => /^\s*Training Schedule\b/i.test(String(texto ?? ''))

/** Los entrenos de su calendario de COROS, con su día, su nombre y su número. */
export function leerCalendarioCoros(texto: string | null | undefined): EntradaCalendarioCoros[] {
  if (!esCalendarioCoros(texto)) return []
  const out: EntradaCalendarioCoros[] = []
  let fecha: string | null = null
  let actual: { nombre: string; dePlan: boolean; idInPlan: string | null } | null = null
  const cerrar = () => {
    if (fecha && actual?.idInPlan) out.push({ fecha, nombre: actual.nombre, dePlan: actual.dePlan, idInPlan: actual.idInPlan })
    actual = null
  }
  const CONOCIDAS = ['plan id', 'idinplan', 'distance', 'estimated time', 'load']
  for (const linea of String(texto).split(/\r?\n/)) {
    const t = linea.trim()
    if (!t || /^=+$/.test(t) || /^Training Schedule\b/i.test(t)) continue
    const f = /^(\d{4}-\d{2}-\d{2})$/.exec(t)
    if (f) { cerrar(); fecha = f[1]; continue }
    if (!fecha) continue
    const kv = /^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/.exec(t)
    const clave = kv ? kv[1].toLowerCase() : ''
    /* Un dato del entreno: una clave conocida, o una desconocida mientras el
       entreno aún no tiene su número. Detrás de un entreno completo, una línea
       con dos puntos es el nombre del siguiente («Easy Run: 30 min»). */
    const esDato = !!kv && !!actual && (CONOCIDAS.includes(clave) || !actual.idInPlan)
    if (esDato && actual) {
      if (clave === 'plan id') actual.dePlan = true
      else if (clave === 'idinplan') actual.idInPlan = (/\d+/.exec(kv![2]) || [null])[0]
      continue
    }
    cerrar()
    actual = { nombre: t, dePlan: false, idInPlan: null }
  }
  cerrar()
  return out
}

/** Lo que tiene ese día en su COROS que no mandó TRIPULSE (ni ninguno de los que se mandaron). */
export function ajenosDelDia(calendario: EntradaCalendarioCoros[], fecha: string, envios: EnvioCoros[]): EntradaCalendarioCoros[] {
  const nuestros = envios.filter(e => e.fecha === fecha)
  return calendario.filter(c => c.fecha === fecha
    && !nuestros.some(e => e.id_externo === c.idInPlan)
    && !(!c.dePlan && nuestros.some(e => e.nombre === c.nombre)))
}

/**
 * El número de COROS de un envío que se quedó con el provisional: el entreno
 * suelto de ese día con el mismo nombre que nadie más tiene ya.
 */
export function idDeCalendario(calendario: EntradaCalendarioCoros[], envio: Pick<EnvioCoros, 'fecha' | 'nombre'>, yaUsados: string[]): string | null {
  const c = calendario.find(x => x.fecha === envio.fecha && !x.dePlan && x.nombre === envio.nombre && !yaUsados.includes(x.idInPlan))
  return c ? c.idInPlan : null
}

/** El número provisional de un entreno que COROS puso pero sin decir el suyo. */
export const ID_PROVISIONAL = 'sin-id:'
export const esIdProvisional = (id: string | null | undefined) => String(id ?? '').startsWith(ID_PROVISIONAL)

/** La fecha de COROS: «20261020». */
export const fechaCoros = (iso: string) => String(iso).slice(0, 10).replace(/-/g, '')

// ------------------------------------------------------------
// Cómo se enseña un entreno («Así le llegará»)
// ------------------------------------------------------------

export const NOMBRE_SECCION: Record<SeccionCoros['sectionType'], string> = {
  1: 'Calentamiento', 2: 'Trabajo', 3: 'Recuperación', 4: 'Vuelta a la calma',
}

/** Lo que hay que hacer en la sección: «800 m», «15 min», o libre. */
export function textoObjetivo(s: SeccionCoros): string {
  if (s.targetType === 1 && s.targetValue) return textoDistancia(s.targetValue)
  if (s.targetType === 2 && s.targetValue) return textoTiempo(s.targetValue)
  return 'Libre, hasta el botón de vuelta'
}

/** A cuánto: «3:22–3:43 /km», «FC hasta 126», «190–225 W». null sin intensidad. */
export function textoIntensidad(s: SeccionCoros): string | null {
  const a = s.intensityValueStart, b = s.intensityValueEnd
  if (!s.intensityType || a == null || b == null) return null
  if (s.intensityType === 2) return a === b ? mmss(a) + ' /km' : mmss(a) + '–' + mmss(b) + ' /km'
  if (s.intensityType === 1) return a <= LIMITES_COROS[1][0] ? 'FC hasta ' + b : a === b ? 'FC ' + a : 'FC ' + a + '–' + b
  return a <= LIMITES_COROS[4][0] ? 'hasta ' + b + ' W' : a === b ? a + ' W' : a + '–' + b + ' W'
}
