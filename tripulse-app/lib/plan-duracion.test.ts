import { describe, it, expect, vi } from 'vitest'
import { ajustarAMinutos, segundosDe } from './plan-duracion'
import { bloquesPorClave, resolverClave, todasLasClaves, NIVELES } from './plantillas'
import { semanasDelMesociclo, type SemanaDelMeso } from './plan-mesociclo'
import { semanaDelBloque, type BaseBloque } from './plan-bloque'
import { volcarSemana } from './plan-volcado'
import type { BloqueP, NivelPlantilla } from './plantillas-tipos'
import type { TestsDeportista } from './duracion'

const SUAVES = ['AER', 'AEL']
const disciplinaDe = (clave: string) => resolverClave(clave)!.plantilla.disciplina
const minutosDe = (clave: string, bloques: BloqueP[], ritmos: TestsDeportista = {}) =>
  Math.round(segundosDe(bloques, disciplinaDe(clave), ritmos) / 60)
const ajustar = (clave: string, minutos: number, nivel: NivelPlantilla = 'intermedio', ritmos: TestsDeportista = {}) =>
  ajustarAMinutos(clave, nivel, minutos, ritmos)!
/** El bloque de series de una zona, en lo que se escribió. */
const deZona = (bloques: BloqueP[], zona: string) => bloques.find(b => b.zona === zona)!

/** Una base vacía que acepta lo que se le escriba: la semana entra entera. */
function baseVacia() {
  let id = 1
  const from = () => {
    const q: any = {}
    for (const m of ['select', 'eq', 'in', 'is', 'or', 'gte', 'lte', 'order', 'limit', 'not']) q[m] = () => q
    q.then = (res: any) => res({ data: [], error: null })
    q.insert = () => ({ select: () => ({ single: async () => ({ data: { id: id++ }, error: null }) }) })
    return q
  }
  return { from }
}

// ------------------------------------------------------------
// Lo que pasó
// ------------------------------------------------------------
describe('la duración del plan llega al calendario', () => {
  /* EL 2026-10-18, con la deportista 20. Su bloque «General» de seis semanas
     pedía 7 → 7,5 → 8 → 8 → 8,5 h y 4,5 h la de descarga, y el calendario
     recibió las seis semanas calcadas, unas 8 h 20′ cada una: las plantillas
     se escribían con su volumen fijo y los minutos del plan se tiraban.

     Se mide lo que de verdad se ESCRIBE —lo que le llega a aplicarBloques—, no
     lo que el plan cree que va a pasar: lo que fallaba era justo esa costura. */
  const bloque = semanasDelMesociclo({ tipo: 'General', semanas: 6, horasReferencia: 8, distancia: 'olimpico', lunes: '2026-10-19' })
  const base: BaseBloque = { diasSemana: 5, distancia: 'olimpico', nivel: 'intermedio', disciplinaDebil: null, disciplinas: null }
  const delPlan = (s: SemanaDelMeso) => semanaDelBloque(s, base, { disponibilidad: [] }).relleno.filter(r => !r.claveFuerza)

  async function escrito(s: SemanaDelMeso): Promise<number> {
    let seg = 0
    const aplicar = vi.fn(async (_sb: any, _id: number, disciplina: string, bloques: BloqueP[]) => {
      seg += segundosDe(bloques, disciplina)
      return null
    })
    const r = await volcarSemana(baseVacia(), { idDeportista: 20, lunes: s.lunes!, relleno: delPlan(s), aplicarBloques: aplicar, nivel: 'intermedio' })
    expect(r.creadas).toBeGreaterThan(0)
    return Math.round(seg / 60)
  }
  const planeado = (s: SemanaDelMeso) => delPlan(s).reduce((a, r) => a + r.minutos, 0)

  it('la semana de descarga dura bastante menos que la de sobrecarga', async () => {
    const sobrecarga = bloque[4], descarga = bloque[5]
    expect(sobrecarga.etiqueta).toMatch(/sobrecarga/i)
    expect(descarga.esDescarga).toBe(true)
    expect(await escrito(descarga)).toBeLessThan(await escrito(sobrecarga) * 0.65)
  })

  it('cada semana del bloque dura lo que dice el plan (±10 %)', async () => {
    for (const s of bloque) {
      expect(Math.abs(await escrito(s) - planeado(s)), `semana ${s.n}: ${planeado(s)}′ planeados`).toBeLessThanOrEqual(planeado(s) * 0.1)
    }
  })
})

// ------------------------------------------------------------
// Las reglas
// ------------------------------------------------------------
describe('cómo se ajusta una sesión a sus minutos', () => {
  it('el calentamiento y la vuelta a la calma no se tocan', () => {
    const tal = bloquesPorClave('cic-aem', 'intermedio')!
    for (const m of [45, 70, 120]) {
      const a = ajustar('cic-aem', m)
      expect(a.bloques[0]).toEqual(tal[0])
      expect(a.bloques[a.bloques.length - 1]).toEqual(tal[tal.length - 1])
    }
  })

  /* B1-04, la semana de descarga: «2×8 min Z4» donde la de carga hacía 4×8.
     Lo que define una serie de calidad es cuánto mide y cuánto se descansa; el
     volumen se mueve con cuántas. */
  it('en las series duras cambia cuántas, no cuánto mide cada una ni su descanso', () => {
    const tal = deZona(bloquesPorClave('car-aei', 'intermedio')!, 'AEI')
    const corta = deZona(ajustar('car-aei', 45).bloques, 'AEI')
    expect(corta.series).toBeLessThan(tal.series!)
    expect(corta.metros).toBe(tal.metros)
    expect(corta.descansoSeg).toBe(tal.descansoSeg)
  })

  it('lo suave cambia de duración', () => {
    expect(ajustar('car-ael', 45).bloques).toEqual([{ zona: 'AEL', segundos: 45 * 60 }])
    expect(ajustar('car-ael', 75).bloques).toEqual([{ zona: 'AEL', segundos: 75 * 60 }])
  })

  /* Natación y carrera se escriben en metros. Los mismos minutos son más metros
     para quien nada más rápido: los metros salen de SU ritmo. */
  it('en natación los metros salen de su CSS', () => {
    const rapida = ajustar('nat-ael/continuo', 45, 'intermedio', { css: 1.5 })
    const lenta = ajustar('nat-ael/continuo', 45, 'intermedio', { css: 1.0 })
    expect(deZona(rapida.bloques, 'AEL').metros!).toBeGreaterThan(deZona(lenta.bloques, 'AEL').metros!)
    expect(Math.abs(minutosDe('nat-ael/continuo', rapida.bloques, { css: 1.5 }) - 45)).toBeLessThanOrEqual(3)
    expect(Math.abs(minutosDe('nat-ael/continuo', lenta.bloques, { css: 1.0 }) - 45)).toBeLessThanOrEqual(3)
  })

  /* El techo es lo que la plantilla documenta para un avanzado, en número de
     series Y en volumen: un 2×20′ de tempo no se convierte en 3×20′ (la fuente
     da «2 × 20 min / 3 × 15 min»), y un VO₂max no pasa de seis series. */
  it('nunca más series ni más volumen duro de lo documentado', () => {
    const tempo = ajustar('cic-aem', 200).bloques.filter(b => b.zona === 'AEM')
    expect(tempo.reduce((a, b) => a + (b.series || 1) * (b.segundos || 0), 0)).toBeLessThanOrEqual(45 * 60)
    expect(deZona(ajustar('cic-pae', 150).bloques, 'PAE').series).toBeLessThanOrEqual(6)
  })

  it('lo duro no baja de la mitad de su nivel, y si no cabe lo dice', () => {
    const a = ajustar('nat-aei', 15)
    expect(deZona(a.bloques, 'AEI').series).toBeGreaterThanOrEqual(5)
    expect(a.aviso).toMatch(/15′/)
  })

  /* Las semanas tipo de B1-04 lo hacen así: «4×5 min Z5 + volumen Z2». */
  it('lo que le sobra a una de calidad va en AEL al final, antes de la vuelta a la calma', () => {
    const a = ajustar('cic-aem', 120)
    expect(a.bloques[a.bloques.length - 2].zona).toBe('AEL')
    expect(Math.abs(a.minutos - 120)).toBeLessThanOrEqual(5)
    expect(a.aviso).toBeUndefined()
  })

  /* Una recuperación de más de una hora ya no es una recuperación (B1-00d: 30–60
     min). Si el plan le da más, no se le inventa volumen: se queda en su tope y
     el parte lo dice. */
  it('a una suave no se le inventa volumen: se queda en su tope y lo dice', () => {
    const a = ajustar('car-aer', 100)
    expect(a.minutos).toBe(60)
    expect(a.aviso).toMatch(/100′/)
    expect(a.aviso).toMatch(/60′/)
  })

  it('una serie que se queda en una sola repetición no arrastra el descanso', () => {
    const aem = deZona(ajustar('cic-aem', 55).bloques, 'AEM')
    expect(aem.series ?? 1).toBe(1)
    expect(aem.descansoSeg).toBeUndefined()
  })

  /* Su forma va escrita en la nota («3 series de 9», la pirámide 50-100-150…):
     estirarlas la dejaría mintiendo. Se elige entre sus tres niveles. */
  it.each(['nat-pae/piramide', 'cic-pae/40-20', 'cic-aei/over-unders'])('%s no se deforma: sale uno de sus niveles', clave => {
    const niveles = NIVELES.map(n => JSON.stringify(bloquesPorClave(clave, n.id)))
    for (const m of [20, 45, 60, 90]) {
      const a = ajustar(clave, m).bloques.filter(b => !(b.zona === 'AEL' && (b.series ?? 1) === 1))
      expect(niveles).toContain(JSON.stringify(a))
    }
  })

  it('lo que no se puede cronometrar se deja como está', () => {
    // La natación anaeróbica no tiene ritmo sobre el CSS (lib/zonas).
    expect(ajustar('nat-pla', 60).bloques).toEqual(bloquesPorClave('nat-pla', 'intermedio'))
  })

  it('sin minutos, la plantilla tal cual; y una clave que no existe no devuelve nada', () => {
    expect(ajustar('cic-aem', 0).bloques).toEqual(bloquesPorClave('cic-aem', 'intermedio'))
    expect(ajustarAMinutos('cic-inventada', 'intermedio', 60)).toBeUndefined()
  })
})

// ------------------------------------------------------------
// Todo el catálogo, no solo los ejemplos
// ------------------------------------------------------------
describe('en todo el catálogo', () => {
  /* Los ejemplos de arriba son los que se me ocurrieron. Esto recorre las 73
     sesiones en los tres niveles, encogidas y estiradas, y vigila lo que no se
     puede romper en ninguna. */
  const casos = todasLasClaves().flatMap(clave => NIVELES.flatMap(({ id: nivel }) => {
    const tal = bloquesPorClave(clave, nivel)!
    const base = minutosDe(clave, tal)
    return [0.4, 0.7, 1.3, 2].map(f => ({ clave, nivel, tal, objetivo: Math.max(10, Math.round(base * f)) }))
  }))

  it('cada bloque sale entero: repeticiones enteras y medidas positivas', () => {
    for (const { clave, nivel, objetivo } of casos) {
      for (const b of ajustar(clave, objetivo, nivel).bloques) {
        const donde = `${clave} ${nivel} ${objetivo}′`
        if (b.series != null) expect(Number.isInteger(b.series) && b.series >= 1, donde).toBe(true)
        expect((b.metros ?? b.segundos ?? 0) > 0, donde).toBe(true)
      }
    }
  })

  it('las series duras conservan lo que mide cada repetición y su descanso', () => {
    for (const { clave, nivel, objetivo } of casos) {
      const r = resolverClave(clave)!
      const todas = NIVELES.flatMap(n => bloquesPorClave(clave, n.id)!)
      for (const b of ajustar(clave, objetivo, nivel).bloques) {
        if (SUAVES.includes(b.zona) || (b.series ?? 1) === 1) continue
        const igual = todas.some(t => t.zona === b.zona && t.metros === b.metros && t.segundos === b.segundos && t.descansoSeg === b.descansoSeg)
        expect(igual, `${r.plantilla.id} ${clave} ${nivel} ${objetivo}′: ${JSON.stringify(b)}`).toBe(true)
      }
    }
  })

  it('o cuadra con sus minutos (±10′), o dice por qué no', () => {
    for (const { clave, nivel, objetivo } of casos) {
      const a = ajustar(clave, objetivo, nivel)
      const cronometrable = segundosDe(a.bloques, disciplinaDe(clave)) > 0 && a.bloques.every(b => segundosDe([b], disciplinaDe(clave)) > 0)
      if (!cronometrable || a.aviso) continue
      expect(Math.abs(a.minutos - objetivo), `${clave} ${nivel}: ${objetivo}′ → ${a.minutos}′`).toBeLessThanOrEqual(10)
    }
  })
})
