// ============================================================
// TRIPULSE — Cuándo toca testarse dentro del plan
// ============================================================
// El planificador nunca programaba un test, y eso es un agujero de verdad: las
// zonas se prescriben desde la VAM, el FTP y el CSS, y sin volver a medirlos se
// quedan congeladas en el día del alta. Un atleta que mejora sigue entrenando
// con los ritmos del que era hace tres meses — es decir, entrenando por debajo
// de donde está, que es la forma silenciosa de dejar de progresar.
//
// FUENTE: B1-12 Parte 5, «Calendario de tests en el macrociclo».
//
// LOS DOS PRINCIPIOS QUE MANDAN SOBRE EL RESTO (B1-12 §5.2):
//   1. NUNCA en semana de carga máxima. El atleta llega fatigado y el resultado
//      subestima lo que de verdad puede: se le recortan las zonas por haber
//      testado cansado, y entrena aún más flojo. El error se realimenta.
//   2. NINGÚN test máximo durante el tapering. Ahí lo que se busca es llegar
//      fresco, y un test máximo es exactamente lo contrario.
import { claseDeMeso } from './plan-mesociclo'
import { diasEntre } from './desplazar'
import type { DistanciaTri } from './distribucion-zonas'

export type Disciplina = 'Natacion' | 'Ciclismo' | 'Carrera'

export interface TestSugerido {
  disciplina: Disciplina
  /** Nombre corto del protocolo, tal y como lo llama B1-12. */
  protocolo: string
  /** Qué sale de él. Es lo que hace que merezca la pena. */
  mide: string
  /** Minutos aproximados, calentamiento incluido. */
  minutos: number
}

export const TESTS: Record<Disciplina, TestSugerido> = {
  Carrera: { disciplina: 'Carrera', protocolo: 'Test de 6 minutos', mide: 'VAM', minutos: 40 },
  Ciclismo: { disciplina: 'Ciclismo', protocolo: 'Ramp test', mide: 'FTP y PAM', minutos: 45 },
  // B1-12 §3.1: el CSS son 400 m y 200 m seguidos, y es la excepción a lo de no
  // testar dos cosas el mismo día.
  Natacion: { disciplina: 'Natacion', protocolo: 'Test CSS (400 m + 200 m)', mide: 'CSS', minutos: 45 },
}

export interface SemanaParaTest {
  /** Lunes de la semana. */
  lunes: string
  /** Índice de la semana dentro del plan, desde 0. */
  n: number
  tipoMeso: string | null
  esDescarga: boolean
  /** Primera semana de su mesociclo. */
  primeraDelBloque: boolean
}

export interface EncargoTests {
  lunes: string
  n: number
  tests: TestSugerido[]
  motivo: string
}

/**
 * En qué semanas del plan toca testarse, y de qué.
 *
 * `semanas` viene en orden. `competicion` es la fecha de la carrera A, para
 * respetar las tres semanas de silencio antes de ella.
 */
export function testsDelPlan(
  semanas: SemanaParaTest[], competicion?: string | null, _distancia?: DistanciaTri,
): EncargoTests[] {
  if (!semanas.length) return []
  const out: EncargoTests[] = []

  const enTapering = (lunes: string) => {
    if (!competicion) return false
    const dias = diasEntre(lunes, competicion)
    // Las tres semanas previas: B1-12 §5.1 «Durante tapering, ningún test».
    return dias >= 0 && dias <= 21
  }

  const añadir = (s: SemanaParaTest, tests: TestSugerido[], motivo: string) => {
    if (enTapering(s.lunes)) return
    if (out.some(o => o.lunes === s.lunes)) return
    out.push({ lunes: s.lunes, n: s.n, tests, motivo })
  }

  // 1. La primera semana del plan: sin esto no hay zonas de las que partir.
  añadir(semanas[0], [TESTS.Carrera, TESTS.Ciclismo, TESTS.Natacion],
    'Es el punto de partida: sin estos números tus zonas son una estimación.')

  /* 2. Las semanas de descarga de cada bloque. Es donde B1-12 §5.2 manda
     testar: llegas fresco y el número dice lo que de verdad puedes. Testar en
     la semana dura mide tu cansancio, no tu forma. */
  const descargas = semanas.filter(s => s.esDescarga && s.n > 0)
  descargas.forEach((s, i) => {
    // La natación mejora más rápido que el resto en las primeras semanas
    // (B1-12 §3.1), así que se revisa en todas; la bici y la carrera, alternas.
    const completa = i % 2 === 1
    añadir(s,
      completa ? [TESTS.Natacion, TESTS.Ciclismo, TESTS.Carrera] : [TESTS.Natacion, TESTS.Ciclismo],
      completa
        ? 'Revisión completa: vienes de descargar, así que el número será el bueno.'
        : 'Semana suave: buen momento para ver si el nado y la bici han cambiado.')
  })

  /* 3. Seis semanas antes de la carrera: la última calibración útil. Más tarde
     ya no da tiempo a que el resultado cambie nada del plan. */
  if (competicion) {
    const seis = semanas.find(s => {
      const d = diasEntre(s.lunes, competicion)
      return d >= 35 && d <= 48
    })
    if (seis) añadir(seis, [TESTS.Carrera, TESTS.Ciclismo],
      'Última calibración antes de afinar: a partir de aquí ya no da tiempo a cambiar el plan.')
  }

  return out.sort((a, b) => a.lunes.localeCompare(b.lunes))
}

/**
 * Si esa semana lleva test, cuántos minutos se le van en ello.
 *
 * Se descuentan del volumen de la semana: un test es entrenamiento, y sumarlo
 * por encima de lo planificado convierte una semana de descarga en una normal
 * — justo la semana en la que no se puede.
 */
export function minutosDeTests(e: EncargoTests | undefined): number {
  return (e?.tests || []).reduce((a, t) => a + t.minutos, 0)
}
