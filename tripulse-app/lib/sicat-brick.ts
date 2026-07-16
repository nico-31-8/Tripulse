// ============================================================
// TRIPULSE — SICAT de bricks: el factor de concatenación del ATLETA
// ============================================================
// B1-04 cuantifica la interferencia bici→carrera en un 10-15%, pero dice algo que
// obliga a individualizarlo: ese rango es «en atletas SIN entrenamiento brick».
// Un atleta rodado sufre menos. Así que el 1,15 es solo el punto de partida.
//
// Cómo se aprende: se compara lo que el atleta reporta del bloque que va DESPUÉS de
// una transición contra lo que reporta de ese mismo deporte y zona EN FRESCO (sesión
// normal). Si corre AEM suelto a RPE 6 y post-bici a RPE 8, su factor es 8/6 = 1,33.
//
// Ojo con el doble conteo (ver lib/atribucion): este factor sirve para PREDECIR lo que
// costará un brick planificado. En un brick ya realizado NO se aplica, porque el RPE
// reportado de cada bloque ya lleva dentro el coste de la concatenación.
import { FACTOR_POR_NIVEL, interferencia, type NivelInterferencia } from './bricks'

// Mínimo de muestras a cada lado para fiarse. Con menos, se usa el valor de B1-04:
// aprender de dos sesiones es peor que no aprender.
const MIN_MUESTRAS = 3

// El factor aprendido se acota: fuera de aquí es ruido, no fisiología.
// El techo (1,40) deja sitio a un atleta que sufra bastante más que el 15% estándar
// sin permitir que un par de RPE raros disparen la carga.
const FACTOR_MIN = 1.0
const FACTOR_MAX = 1.4

export interface FactorBrickPar {
  de: string
  a: string
  factor: number              // el que se debe usar (aprendido, o el de B1-04)
  aprendido: boolean          // false = no hay datos suficientes, es el de la fuente
  porDefecto: number          // lo que dice B1-04 para este par
  nBrick: number              // muestras post-transición
  nFresco: number             // muestras del mismo deporte+zona en fresco
  rpeBrick: number | null     // RPE medio post-transición
  rpeFresco: number | null    // RPE medio en fresco
}

export type FactorBrickResultado = Record<string, FactorBrickPar>

export const clavePar = (de: string, a: string) => de + '→' + a

function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

// Calcula el factor de concatenación real del atleta para cada par de deportes que
// haya encadenado alguna vez.
export async function calcularFactorBrick(supabase: any, depId: number): Promise<FactorBrickResultado> {
  const out: FactorBrickResultado = {}

  const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
  const macroIds = (macros || []).map((m: any) => m.id)
  const { data: mesos } = macroIds.length
    ? await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds) : { data: [] }
  const mesoIds = (mesos || []).map((m: any) => m.id)
  const { data: micros } = mesoIds.length
    ? await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds) : { data: [] }
  const microIds = (micros || []).map((m: any) => m.id)

  const sesChain = microIds.length
    ? (await supabase.from('sesion').select('id, disciplina, transiciones')
        .in('id_microciclo', microIds).eq('estado', 'Realizada')).data || [] : []
  const sesLibres = (await supabase.from('sesion').select('id, disciplina, transiciones')
    .eq('id_deportista', depId).is('id_microciclo', null).eq('estado', 'Realizada')).data || []
  const sesiones = [...sesChain, ...sesLibres]
  if (!sesiones.length) return out

  const { data: tareas } = await supabase.from('tarea')
    .select('id_sesion, disciplina, zona_entrenamiento, rpe_reportado, orden')
    .in('id_sesion', sesiones.map((s: any) => s.id))
    .not('rpe_reportado', 'is', null)
    .order('orden')

  const porSesion: Record<number, any[]> = {}
  ;(tareas || []).forEach((t: any) => { (porSesion[t.id_sesion] ||= []).push(t) })

  // 1. En fresco: bloques de sesiones NORMALES, indexados por deporte+zona.
  const fresco: Record<string, number[]> = {}
  // 2. Post-transición: bloques de bricks que van tras una transición.
  const postTrans: Record<string, { rpe: number; de: string; zona: string }[]> = {}

  for (const s of sesiones as any[]) {
    const bloques = porSesion[s.id] || []
    if (!bloques.length) continue

    if (s.disciplina !== 'Brick') {
      // Sesión normal = el atleta llega fresco a ella. Es la referencia.
      bloques.forEach(b => {
        if (!b.disciplina || !b.zona_entrenamiento) return
        ;(fresco[b.disciplina + '|' + b.zona_entrenamiento] ||= []).push(b.rpe_reportado)
      })
      continue
    }

    const trans = s.transiciones || []
    bloques.forEach((b, i) => {
      if (i === 0) return
      const previo = bloques[i - 1]
      const hay = trans.some((x: any) => x.despues_de === (previo?.orden ?? i))
      if (!hay || !b.disciplina || !b.zona_entrenamiento || !previo?.disciplina) return
      ;(postTrans[b.disciplina + '|' + b.zona_entrenamiento] ||= [])
        .push({ rpe: b.rpe_reportado, de: previo.disciplina, zona: b.zona_entrenamiento })
    })
  }

  // 3. Por cada par (de → a), comparar post-transición contra fresco a igualdad de zona.
  const pares: Record<string, { brick: number[]; fresco: number[] }> = {}
  Object.entries(postTrans).forEach(([clave, entradas]) => {
    const [disc] = clave.split('|')
    entradas.forEach(e => {
      const enFresco = fresco[disc + '|' + e.zona]
      // Sin referencia en fresco de esa misma zona no hay nada que comparar: un RPE
      // alto podría ser de la zona, no de la concatenación.
      if (!enFresco || !enFresco.length) return
      const k = clavePar(e.de, disc)
      ;(pares[k] ||= { brick: [], fresco: [] })
      pares[k].brick.push(e.rpe)
      pares[k].fresco.push(...enFresco)
    })
  })

  Object.entries(pares).forEach(([k, v]) => {
    const [de, a] = k.split('→')
    const inter = interferencia(de, a)
    const porDefecto = inter ? FACTOR_POR_NIVEL[inter.nivel as NivelInterferencia] : 1
    const mB = media(v.brick)
    const mF = media(v.fresco)
    const suficientes = v.brick.length >= MIN_MUESTRAS && v.fresco.length >= MIN_MUESTRAS

    let factor = porDefecto
    let aprendido = false
    if (suficientes && mB && mF && mF > 0) {
      factor = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, mB / mF))
      aprendido = true
    }

    out[k] = {
      de, a, factor, aprendido, porDefecto,
      nBrick: v.brick.length, nFresco: v.fresco.length,
      rpeBrick: mB, rpeFresco: mF,
    }
  })

  return out
}

// Resolver listo para pasar a `expandirEnBloques({ factorPar })`: usa el factor del
// atleta si lo hemos aprendido, y si no el de B1-04.
export function factorPersonalizado(res: FactorBrickResultado | null) {
  return (de: string, a: string): number | null => {
    if (!res) return null
    return res[clavePar(de, a)]?.factor ?? null
  }
}
