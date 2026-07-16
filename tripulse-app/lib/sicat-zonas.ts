// ============================================================
// SICAT · Coste por ZONA y DISCIPLINA (extensión del SICAT de disciplina).
// Descubre, con datos reales del atleta, cuánto le cuesta cada tipo de entreno
// (zona pico de la sesión) en cada disciplina de resistencia. El coste de cada
// sesión es un compuesto de: DOMS 48h + caída de HRV al día siguiente + RPE
// reportado (mismas señales que el SICAT, pero agrupadas por zona).
// 1.0× = el coste medio del propio atleta.
// ============================================================
import { supabase } from './supabase'
import { cargaZona } from './zonas'
import { getMicrosDeportista, DISCIPLINAS_SICAT, type DisciplinaSicat } from './sicat'

export type Confianza = 'alta' | 'media' | 'baja'

export interface CeldaZona {
  disciplina: DisciplinaSicat
  zona: string
  n: number
  costeMedio: number     // 0–100
  multiplicador: number  // veces el coste medio global del atleta
  confianza: Confianza
}

export interface SicatZonasResultado {
  celdas: CeldaZona[]
  costeMedioGlobal: number | null
  nSesiones: number
}

const W = { doms: 0.40, hrv: 0.35, rpe: 0.25 }

// Coste 0–100 de una sesión con las señales disponibles (pesos redistribuidos si falta alguna).
function costeSesion(d0: number | null, d24: number | null, d48: number | null, hrvNext: number | null, hrvBasal: number, rpe: number | null): number | null {
  const señales: { v: number; w: number }[] = []

  // DOMS (1–7) ponderado en el tiempo → normalizado 0–1
  const doms: { v: number; w: number }[] = []
  if (d0 != null) doms.push({ v: d0, w: 0.2 })
  if (d24 != null) doms.push({ v: d24, w: 0.4 })
  if (d48 != null) doms.push({ v: d48, w: 0.4 })
  if (doms.length) {
    const ws = doms.reduce((s, p) => s + p.w, 0)
    const val = doms.reduce((s, p) => s + p.v * p.w, 0) / ws
    señales.push({ v: Math.min(1, Math.max(0, (val - 1) / 6)), w: W.doms })
  }
  // Caída de HRV vs basal (0–15% → 0–1)
  if (hrvNext != null && hrvBasal > 0) {
    const drop = Math.max(0, (hrvBasal - hrvNext) / hrvBasal)
    señales.push({ v: Math.min(1, drop / 0.15), w: W.hrv })
  }
  // RPE reportado (1–10 → 0–1)
  if (rpe != null) señales.push({ v: Math.min(1, rpe / 10), w: W.rpe })

  if (!señales.length) return null
  const ws = señales.reduce((s, x) => s + x.w, 0)
  const coste = señales.reduce((s, x) => s + x.v * x.w, 0) / ws
  return Math.round(coste * 100 * 10) / 10
}

export async function calcularSicatZonas(dep: any): Promise<SicatZonasResultado> {
  const hrvBasal = dep.hrv_basal || 0
  const micros = await getMicrosDeportista(dep.id)
  if (!micros.length) return { celdas: [], costeMedioGlobal: null, nSesiones: 0 }

  const { data: ses } = await supabase.from('sesion')
    .select('id, disciplina, rpe_reportado, fecha_sesion')
    .eq('estado', 'Realizada').in('id_microciclo', micros)
  // Los bricks entran aunque 'Brick' no sea una disciplina SICAT: sus BLOQUES sí lo son.
  const sesiones = (ses || []).filter((s: any) =>
    ((DISCIPLINAS_SICAT as readonly string[]).includes(s.disciplina) || s.disciplina === 'Brick') && s.fecha_sesion)
  if (!sesiones.length) return { celdas: [], costeMedioGlobal: null, nSesiones: 0 }

  const sesIds = sesiones.map((s: any) => s.id)
  const { data: tareas } = await supabase.from('tarea')
    .select('id_sesion, zona_entrenamiento, disciplina, rpe_reportado, orden').in('id_sesion', sesIds).order('orden')
  const zonasPorSesion: Record<number, string[]> = {}
  const bloquesPorSesion: Record<number, any[]> = {}
  ;(tareas || []).forEach((t: any) => {
    if (!t.zona_entrenamiento) return
    ;(zonasPorSesion[t.id_sesion] ||= []).push(t.zona_entrenamiento)
    ;(bloquesPorSesion[t.id_sesion] ||= []).push(t)
  })

  // Wellness del rango (sesión + 2 días) para DOMS 24/48h y HRV del día siguiente.
  const fechas = sesiones.map((s: any) => s.fecha_sesion).sort()
  const desde = fechas[0]
  const hd = new Date(fechas[fechas.length - 1] + 'T12:00:00'); hd.setDate(hd.getDate() + 2)
  const hasta = hd.toISOString().slice(0, 10)
  const { data: well } = await supabase.from('wellness').select('fecha, dolor_muscular, hrv').eq('id_deportista', dep.id).gte('fecha', desde).lte('fecha', hasta)
  const wByF: Record<string, any> = {}
  ;(well || []).forEach((w: any) => { wByF[w.fecha] = w })
  const addDays = (f: string, n: number) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

  const acc: Record<string, number[]> = {}
  const todos: number[] = []
  for (const s of sesiones as any[]) {
    const zonas = zonasPorSesion[s.id]
    if (!zonas || !zonas.length) continue
    const f = s.fecha_sesion
    // El coste sale del wellness (DOMS 24/48h, HRV) que es del DÍA, más el RPE reportado.
    const costeCon = (rpe: number | null) => costeSesion(
      wByF[f]?.dolor_muscular ?? null,
      wByF[addDays(f, 1)]?.dolor_muscular ?? null,
      wByF[addDays(f, 2)]?.dolor_muscular ?? null,
      wByF[addDays(f, 1)]?.hrv ?? null,
      hrvBasal,
      rpe,
    )

    // Un brick reparte su coste entre sus bloques: cada uno con su deporte, su zona y
    // su propio RPE si el atleta lo reportó bloque a bloque.
    if (s.disciplina === 'Brick') {
      for (const b of bloquesPorSesion[s.id] || []) {
        if (!(DISCIPLINAS_SICAT as readonly string[]).includes(b.disciplina)) continue
        const coste = costeCon(b.rpe_reportado ?? s.rpe_reportado ?? null)
        if (coste == null) continue
        ;(acc[`${b.disciplina}|${b.zona_entrenamiento}`] ||= []).push(coste)
        todos.push(coste)
      }
      continue
    }

    // Sesión normal: una celda, con la zona pico (comportamiento de siempre).
    const zonaPico = zonas.reduce((best, z) => (cargaZona(z).nivel > cargaZona(best).nivel ? z : best), zonas[0])
    const coste = costeCon(s.rpe_reportado ?? null)
    if (coste == null) continue
    ;(acc[`${s.disciplina}|${zonaPico}`] ||= []).push(coste)
    todos.push(coste)
  }

  const costeMedioGlobal = todos.length ? todos.reduce((a, b) => a + b, 0) / todos.length : null
  const celdas: CeldaZona[] = []
  if (costeMedioGlobal) {
    for (const key of Object.keys(acc)) {
      const [disc, zona] = key.split('|')
      const arr = acc[key]
      const cm = arr.reduce((a, b) => a + b, 0) / arr.length
      celdas.push({
        disciplina: disc as DisciplinaSicat, zona, n: arr.length,
        costeMedio: Math.round(cm * 10) / 10,
        multiplicador: Math.round((cm / costeMedioGlobal) * 100) / 100,
        confianza: arr.length >= 5 ? 'alta' : arr.length >= 3 ? 'media' : 'baja',
      })
    }
  }
  return { celdas, costeMedioGlobal: costeMedioGlobal != null ? Math.round(costeMedioGlobal * 10) / 10 : null, nSesiones: todos.length }
}

// Multiplicador de ponderación de carga para una (disciplina, zona). null si la celda
// tiene pocos datos (n<3) → el consumidor debe caer al factor SICAT de disciplina.
export function factorSicatZona(disciplina: string, zona: string, res: SicatZonasResultado | null): number | null {
  if (!res) return null
  const c = res.celdas.find(x => x.disciplina === disciplina && x.zona === zona)
  if (!c || c.n < 3) return null
  return c.multiplicador
}

// Adjunta a cada sesión su `zonaPico` (zona de mayor nivel entre sus tareas), para poder
// ponderar la carga por zona. Las sesiones deben traer `id`. Sin tareas con zona → null.
export async function attachZonaPico(sesiones: any[]): Promise<any[]> {
  const ids = sesiones.map(s => s.id).filter(Boolean)
  if (!ids.length) return sesiones.map(s => ({ ...s, zonaPico: null }))
  const { data: tareas } = await supabase.from('tarea').select('id_sesion, zona_entrenamiento').in('id_sesion', ids)
  const porSes: Record<number, string[]> = {}
  ;(tareas || []).forEach((t: any) => { if (t.zona_entrenamiento) (porSes[t.id_sesion] ||= []).push(t.zona_entrenamiento) })
  return sesiones.map(s => {
    const zs = porSes[s.id]
    const zonaPico = zs && zs.length ? zs.reduce((b, z) => (cargaZona(z).nivel > cargaZona(b).nivel ? z : b), zs[0]) : null
    return { ...s, zonaPico }
  })
}
