// Objetivos de ritmo/tiempo por prueba: cruza las distancias del catálogo (lib/pruebas.ts)
// con las intensidades objetivo por segmento y los tests del deportista (VAM/CSS/FTP).
//
// Fuente de las intensidades de triatlón: base de conocimiento del usuario
// (deporte/Resources/Triatlón/B1-13-Pacing-Estrategia-Carrera.md → Friel 2024).
//   · Ciclismo: % FTP.  · Carrera: % VAM.  · Natación: % de la velocidad CSS (mapeo fisiológico).
// Duatlón: estimado por analogía de duración.

import { pruebaPorId } from './pruebas'
import { zonaResistencia } from './zonas'

export interface SegPacing {
  disc: 'Natación' | 'Ciclismo' | 'Carrera'
  pctMin: number   // % del benchmark de la disciplina (CSS-vel · FTP · VAM)
  pctMax: number
  zona: string     // sigla de zona equivalente (didáctico)
}

export const PACING: Record<string, SegPacing[]> = {
  // ---- Triatlón (B1-13) ----
  'tri-supersprint': [{ disc: 'Natación', pctMin: 100, pctMax: 108, zona: 'PAE' }, { disc: 'Ciclismo', pctMin: 95, pctMax: 105, zona: 'PAE' }, { disc: 'Carrera', pctMin: 78, pctMax: 85, zona: 'AEM' }],
  'tri-sprint': [{ disc: 'Natación', pctMin: 98, pctMax: 105, zona: 'PAE' }, { disc: 'Ciclismo', pctMin: 88, pctMax: 100, zona: 'AEI' }, { disc: 'Carrera', pctMin: 72, pctMax: 80, zona: 'AEM' }],
  'tri-olimpico': [{ disc: 'Natación', pctMin: 95, pctMax: 100, zona: 'AEI' }, { disc: 'Ciclismo', pctMin: 82, pctMax: 92, zona: 'AEI' }, { disc: 'Carrera', pctMin: 68, pctMax: 76, zona: 'AEL' }],
  'tri-media': [{ disc: 'Natación', pctMin: 90, pctMax: 96, zona: 'AEM' }, { disc: 'Ciclismo', pctMin: 75, pctMax: 83, zona: 'AEM' }, { disc: 'Carrera', pctMin: 63, pctMax: 72, zona: 'AEL' }],
  'tri-larga': [{ disc: 'Natación', pctMin: 87, pctMax: 93, zona: 'AEL' }, { disc: 'Ciclismo', pctMin: 65, pctMax: 75, zona: 'AEL' }, { disc: 'Carrera', pctMin: 58, pctMax: 67, zona: 'AEL' }],
  // ---- Duatlón (estimado por analogía de duración) ----
  'du-sprint': [{ disc: 'Carrera', pctMin: 78, pctMax: 85, zona: 'AEI' }, { disc: 'Ciclismo', pctMin: 90, pctMax: 98, zona: 'AEI' }, { disc: 'Carrera', pctMin: 74, pctMax: 82, zona: 'AEM' }],
  'du-estandar': [{ disc: 'Carrera', pctMin: 72, pctMax: 80, zona: 'AEM' }, { disc: 'Ciclismo', pctMin: 85, pctMax: 92, zona: 'AEI' }, { disc: 'Carrera', pctMin: 66, pctMax: 74, zona: 'AEL' }],
  'du-larga': [{ disc: 'Carrera', pctMin: 65, pctMax: 72, zona: 'AEL' }, { disc: 'Ciclismo', pctMin: 70, pctMax: 80, zona: 'AEM' }, { disc: 'Carrera', pctMin: 60, pctMax: 70, zona: 'AEL' }],
}

export const tienePacing = (id: string | null | undefined): boolean => !!id && !!PACING[id]
export const idsConPacing = (): string[] => Object.keys(PACING)

// segundos → "1h05" o "42:30"
function fmtTiempo(seg: number): string {
  if (!isFinite(seg) || seg <= 0) return '—'
  const t = Math.round(seg)
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
function paceKmStr(velKmh: number): string {
  if (velKmh <= 0) return '—'
  const seg = Math.round(3600 / velKmh)
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}
function pace100Str(velMs: number): string {
  if (velMs <= 0) return '—'
  const seg = Math.round(100 / velMs)
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}

export interface FilaObjetivo {
  disc: string
  km: number | null
  zona: string
  zonaNombre: string
  zonaColor: string
  intensidad: string   // ritmo o potencia objetivo
  tiempo: string       // tiempo estimado del segmento
}

export interface Objetivos {
  filas: FilaObjetivo[]
  total: string        // rango total "Xh–Yh"
  faltanTests: boolean
}

// Calcula los objetivos de una prueba. velBici en km/h (para el tiempo de ciclismo).
export function calcularObjetivos(
  pruebaId: string,
  tests: { vam?: number | null; css?: number | null; ftp?: number | null },
  velBici: number,
): Objetivos | null {
  const prueba = pruebaPorId(pruebaId)
  const pac = PACING[pruebaId]
  if (!prueba || !pac) return null

  let totMin = 0, totMax = 0, faltan = false
  const filas: FilaObjetivo[] = pac.map((sp, i) => {
    const km = prueba.segmentos[i]?.km ?? null
    const z = zonaResistencia(sp.zona)
    const fila: FilaObjetivo = { disc: sp.disc, km, zona: sp.zona, zonaNombre: z?.nombre || '', zonaColor: z?.color || '#6b7280', intensidad: '—', tiempo: '—' }
    if (km == null) return fila

    if (sp.disc === 'Carrera') {
      if (!tests.vam) { faltan = true; fila.intensidad = `${sp.pctMin}–${sp.pctMax}% VAM`; return fila }
      const velLo = tests.vam * sp.pctMin / 100, velHi = tests.vam * sp.pctMax / 100 // km/h
      const tHi = km / velLo * 3600, tLo = km / velHi * 3600 // más rápido = menos tiempo
      fila.intensidad = `${paceKmStr(velHi)}–${paceKmStr(velLo)} /km`
      fila.tiempo = `${fmtTiempo(tLo)}–${fmtTiempo(tHi)}`
      totMin += tLo; totMax += tHi
    } else if (sp.disc === 'Ciclismo') {
      const t = km / velBici * 3600
      fila.tiempo = fmtTiempo(t); totMin += t; totMax += t
      fila.intensidad = tests.ftp
        ? `${Math.round(tests.ftp * sp.pctMin / 100)}–${Math.round(tests.ftp * sp.pctMax / 100)} W`
        : `${sp.pctMin}–${sp.pctMax}% FTP`
      if (!tests.ftp) faltan = true
    } else { // Natación
      if (!tests.css) { faltan = true; fila.intensidad = `${sp.pctMin}–${sp.pctMax}% CSS`; return fila }
      const velLo = tests.css * sp.pctMin / 100, velHi = tests.css * sp.pctMax / 100 // m/s
      const tHi = (km * 1000) / velLo, tLo = (km * 1000) / velHi
      fila.intensidad = `${pace100Str(velHi)}–${pace100Str(velLo)} /100m`
      fila.tiempo = `${fmtTiempo(tLo)}–${fmtTiempo(tHi)}`
      totMin += tLo; totMax += tHi
    }
    return fila
  })

  return { filas, total: `${fmtTiempo(totMin)}–${fmtTiempo(totMax)}`, faltanTests: faltan }
}
