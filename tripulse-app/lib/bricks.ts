// ============================================================
// TRIPULSE — Bricks: ejemplos de sistema e interferencia entre disciplinas
// ============================================================
// Fuente: deporte/Resources/Triatlón/Bloque1-Periodizacion/B1-04-Microciclo-Semanal.md
// (Principio 3 «Interferencia» y Principio 4 «El Brick es una Sesión Específica,
// No un Accidente»). Friel (2024); evidencia bici→run en Sports (MDPI), vía ROUVY (2024).
//
// Un brick es un FORMATO, no una disciplina (ver lib/atribucion). Aquí solo vive
// el catálogo: qué ejemplos existen y cuánto se encarece el bloque posterior a
// una transición según el par de deportes.
import { ZONAS_RESISTENCIA, cargaZona } from './zonas'

// ------------------------------------------------------------
// Interferencia entre disciplinas consecutivas (B1-04, Principio 3)
// ------------------------------------------------------------
// La tabla de B1-04 da el NIVEL de interferencia de cada par, y cuantifica solo
// uno: bici→carrera, «10-15% más lenta». Ese es el único número medido de la
// fuente y es el que ancla la escala; el resto son interpolaciones de su escala
// ordinal, pensadas para tocarse aquí en un solo sitio.
//
// En fase 2 esto se individualiza con el SICAT del atleta (un atleta con mucho
// entrenamiento brick sufre menos interferencia que uno sin él: la propia fuente
// dice que el 10-15% es «en atletas sin entrenamiento brick»).
export type NivelInterferencia = 'alto' | 'medio-alto' | 'medio' | 'bajo'

export const FACTOR_POR_NIVEL: Record<NivelInterferencia, number> = {
  'alto': 1.15,        // ← único anclado en dato: «la carrera post-bici es 10-15% más lenta»
  'medio-alto': 1.10,
  'medio': 1.05,
  'bajo': 1.00,
}

export interface Interferencia {
  de: string
  a: string
  nivel: NivelInterferencia
  porque: string
}

export const INTERFERENCIA: Interferencia[] = [
  { de: 'Ciclismo', a: 'Carrera', nivel: 'alto', porque: 'Comparten cuádriceps, glúteos e isquiotibiales. La carrera post-bici es 10-15% más lenta en atletas sin entrenamiento brick. Brick esencial.' },
  { de: 'Carrera', a: 'Ciclismo', nivel: 'medio-alto', porque: 'El daño muscular excéntrico de la carrera limita la producción de potencia en bici.' },
  { de: 'Natacion', a: 'Ciclismo', nivel: 'bajo', porque: 'La natación no carga el tren inferior: se puede combinar el mismo día sin gran interferencia.' },
  { de: 'Natacion', a: 'Carrera', nivel: 'bajo', porque: 'La natación no carga el tren inferior: se puede combinar el mismo día sin gran interferencia.' },
  { de: 'Natacion', a: 'Natacion', nivel: 'bajo', porque: 'Doble sesión de natación el mismo día es viable sin gran fatiga musculoesquelética.' },
]

export function interferencia(de: string, a: string): Interferencia | null {
  return INTERFERENCIA.find(i => i.de === de && i.a === a) || null
}

// Cuánto se encarece el bloque `a` por venir justo después del bloque `de`.
// Pares que B1-04 no cubre → 1 (neutro): preferimos no inventar coste.
export function factorConcatenacion(de: string | null | undefined, a: string | null | undefined): number {
  if (!de || !a) return 1
  const i = interferencia(de, a)
  return i ? FACTOR_POR_NIVEL[i.nivel] : 1
}

// ------------------------------------------------------------
// Ejemplos de brick (B1-04, Principio 4 — «Tipos de brick»)
// ------------------------------------------------------------
// Son un PUNTO DE PARTIDA: rellenan el constructor y a partir de ahí se edita.
// Donde B1-04 da un rango («30-45 min») usamos un valor central; donde no dice
// zona, se elige la más conservadora para el objetivo y se marca abajo.
//
// Equivalencia de zonas clásicas → catálogo Zonas 2 (lib/zonas.ts):
//   Z2 → AEL (aeróbico lipolítico) · Z3 → AEM (aeróbico glucolítico)
//   Z4 → AEI (aeróbico intenso)    · Z5 → PAE (potencia aeróbica)
export interface BloquePlantilla {
  disciplina: string
  minutos: number
  zona: string
}

export interface PlantillaBrick {
  id: string
  nombre: string
  formato: string        // el texto tal cual de la tabla de B1-04
  objetivo: string
  fase: string
  bloques: BloquePlantilla[]
  transicionSeg: number
  nota?: string          // dónde hemos rellenado algo que B1-04 no concreta
}

export const PLANTILLAS_BRICK: PlantillaBrick[] = [
  {
    id: 'corto',
    nombre: 'Brick corto',
    formato: '30-45 min bici + 15-20 min run',
    objetivo: 'Activar el patrón neuromuscular de la carrera post-bici',
    fase: 'PE inicial, cualquier fase',
    bloques: [
      { disciplina: 'Ciclismo', minutos: 40, zona: 'AEL' },
      { disciplina: 'Carrera', minutos: 18, zona: 'AEL' },
    ],
    transicionSeg: 90,
    nota: 'B1-04 no fija zona para este brick: se propone AEL (Z2) por ser de activación.',
  },
  {
    id: 'transicion',
    nombre: 'Brick de transición',
    formato: '60-90 min bici Z2-Z3 + 20-30 min run a ritmo carrera',
    objetivo: 'Simular la transición real y practicar el pacing',
    fase: 'PE media',
    bloques: [
      { disciplina: 'Ciclismo', minutos: 75, zona: 'AEM' },
      { disciplina: 'Carrera', minutos: 25, zona: 'AEM' },
    ],
    transicionSeg: 90,
  },
  {
    id: 'largo',
    nombre: 'Brick largo',
    formato: '2-4 h bici + 30-60 min run',
    objetivo: 'Simular la carga de media o larga distancia',
    fase: 'PE avanzada · 70.3 / IM',
    bloques: [
      { disciplina: 'Ciclismo', minutos: 180, zona: 'AEL' },
      { disciplina: 'Carrera', minutos: 45, zona: 'AEL' },
    ],
    transicionSeg: 120,
    nota: 'B1-04 no fija zona: se propone AEL (Z2), la del trabajo de larga distancia.',
  },
  {
    id: 'calidad',
    nombre: 'Brick de calidad',
    formato: '60 min bici con intervalos Z4-Z5 + 20 min run Z4',
    objetivo: 'Entrenar la capacidad de correr fuerte tras un esfuerzo intenso en bici',
    fase: 'Sprint / Olímpico · PE',
    bloques: [
      { disciplina: 'Ciclismo', minutos: 60, zona: 'AEI' },
      { disciplina: 'Carrera', minutos: 20, zona: 'AEI' },
    ],
    transicionSeg: 60,
  },
  {
    id: 'inverso',
    nombre: 'Brick inverso',
    formato: 'Run + Bici',
    objetivo: 'Velocidad en carrera con piernas frescas; puede mejorar la economía de carrera',
    fase: 'PE · atletas limitados en carrera',
    bloques: [
      { disciplina: 'Carrera', minutos: 20, zona: 'AEI' },
      { disciplina: 'Ciclismo', minutos: 60, zona: 'AEL' },
    ],
    transicionSeg: 90,
    nota: 'B1-04 solo dice «Run + Bici»: duraciones y zonas son una propuesta de partida.',
  },
]

// Ejemplos que encajan con la secuencia de disciplinas elegida (en ese orden).
export function plantillasPara(disciplinas: string[]): PlantillaBrick[] {
  if (disciplinas.length < 2) return []
  return PLANTILLAS_BRICK.filter(p =>
    p.bloques.length === disciplinas.length &&
    p.bloques.every((b, i) => b.disciplina === disciplinas[i]))
}

// Disciplinas que pueden encadenarse en un brick. Fuerza queda fuera: B1-04 trata
// el brick como combinación de disciplinas de resistencia.
export const DISCIPLINAS_BRICK = ['Natacion', 'Ciclismo', 'Carrera'] as const

export const ZONAS_BRICK = ZONAS_RESISTENCIA

// ------------------------------------------------------------
// El brick en la base de datos
// ------------------------------------------------------------
// Bloques  → tabla `tarea` (una por bloque, con su disciplina/zona/orden y su
//            duración en `p_duracion`). Así los cálculos por deporte los ven.
// Transiciones → `sesion.transiciones` (jsonb). NO son tareas a propósito:
//            contarían como carga y volumen de alguna disciplina.
export interface BrickBloque {
  disciplina: string
  minutos: number
  zona: string
}

export interface BrickValor {
  bloques: BrickBloque[]
  transiciones: { despues_de: number; segundos: number; nota?: string | null }[]
}

export const BRICK_VACIO: BrickValor = { bloques: [], transiciones: [] }

// Un brick son al menos dos esfuerzos encadenados.
export function brickValido(v: BrickValor): boolean {
  return v.bloques.length >= 2 && v.bloques.every(b => b.disciplina && b.minutos > 0)
}

// RPE estimado del brick: media de las zonas ponderada por minutos, y el
// sobrecoste de cada transición aplicado al bloque que la sigue (igual criterio
// que lib/atribucion, para que lo planificado y lo calculado no se contradigan).
export function rpeBrick(v: BrickValor): number {
  const total = v.bloques.reduce((a, b) => a + (b.minutos || 0), 0)
  if (!total) return 5
  const suma = v.bloques.reduce((acc, b, i) => {
    const previo = v.bloques[i - 1]
    const hayTrans = i > 0 && v.transiciones.some(t => t.despues_de === i)
    const f = hayTrans && previo ? factorConcatenacion(previo.disciplina, b.disciplina) : 1
    return acc + cargaZona(b.zona).rpe * (b.minutos || 0) * f
  }, 0)
  return Math.min(10, Math.max(1, Math.round(suma / total)))
}

// Zona más dura del brick. El canvas pinta un chip por sesión y necesita UNA zona
// que lo represente: la que marca el día es la más exigente, no la primera.
export function zonaPicoBrick(v: BrickValor): string {
  if (!v.bloques.length) return 'AEL'
  return v.bloques.reduce((mejor, b) =>
    cargaZona(b.zona).nivel > cargaZona(mejor).nivel ? b.zona : mejor, v.bloques[0].zona)
}

// Materializa el brick de una sesión ya creada: reemplaza sus tareas por los
// bloques y guarda las transiciones. Idempotente (borra y reescribe).
export async function guardarBrick(supabase: any, idSesion: number, v: BrickValor): Promise<string | null> {
  const { data: previas } = await supabase.from('tarea').select('id').eq('id_sesion', idSesion)
  const previasIds = (previas || []).map((t: any) => t.id)
  if (previasIds.length) {
    await supabase.from('p_duracion').delete().in('id_tarea', previasIds)
    await supabase.from('tarea').delete().eq('id_sesion', idSesion)
  }

  const { data: creadas, error } = await supabase.from('tarea').insert(
    v.bloques.map((b, i) => ({
      id_sesion: idSesion,
      disciplina: b.disciplina,
      zona_entrenamiento: b.zona,
      orden: i + 1,
    })),
  ).select()
  if (error) return error.message

  // Cada bloque lleva su duración: es lo que reparte el volumen entre deportes.
  const durs = (creadas || []).map((t: any) => {
    const b = v.bloques[t.orden - 1]
    return b ? { id_tarea: t.id, tiempo_planeado: b.minutos * 60 } : null
  }).filter(Boolean)
  if (durs.length) {
    const { error: eDur } = await supabase.from('p_duracion').insert(durs)
    if (eDur) return eDur.message
  }

  const { error: eSes } = await supabase.from('sesion')
    .update({ transiciones: v.transiciones }).eq('id', idSesion)
  if (eSes) return faltaMigracion(eSes) ? ERROR_MIGRACION : eSes.message
  return null
}

// La columna `sesion.transiciones` la añade supabase/brick-transiciones.sql. Si no
// se ha ejecutado, PostgREST responde con 'column not found' (PGRST204 / 42703).
export const ERROR_MIGRACION =
  'Falta la columna sesion.transiciones: ejecuta supabase/brick-transiciones.sql en el SQL Editor de Supabase.'

function faltaMigracion(e: any): boolean {
  const t = ((e?.message || '') + (e?.code || '')).toLowerCase()
  return t.includes('transiciones') || t.includes('pgrst204') || t.includes('42703')
}

// Reconstruye el BrickValor de una sesión existente (para editarla).
export async function cargarBrick(supabase: any, idSesion: number): Promise<BrickValor> {
  const { data: ses } = await supabase.from('sesion').select('transiciones').eq('id', idSesion).single()
  const { data: tareas } = await supabase.from('tarea')
    .select('id, disciplina, zona_entrenamiento, orden').eq('id_sesion', idSesion).order('orden')
  const ids = (tareas || []).map((t: any) => t.id)
  const { data: durs } = ids.length
    ? await supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', ids)
    : { data: [] }
  return {
    bloques: (tareas || []).map((t: any) => ({
      disciplina: t.disciplina,
      zona: t.zona_entrenamiento || 'AEL',
      minutos: Math.round(((durs || []).find((d: any) => d.id_tarea === t.id)?.tiempo_planeado || 0) / 60),
    })),
    transiciones: ses?.transiciones || [],
  }
}
