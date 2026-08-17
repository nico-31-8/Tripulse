import { describe, it, expect } from 'vitest'
import { cadenaDeMesos, ajustarSemana, ajustarCadena, CUMPLIMIENTO_MINIMO, SALTO_MAXIMO } from './plan-cadena'
import { UMBRALES_TSB, UMBRALES_ACWR } from './panel-metricas'

const MESOS = [
  { id: 20, objetivo: 'Específico', tipo: 'Transmutación', fecha_inicio: '2026-09-14', duracion_semanas: 3 },
  { id: 10, objetivo: 'Carga', tipo: 'Acumulación', fecha_inicio: '2026-08-17', duracion_semanas: 4 },
]
const OPC = { horasReferencia: 10, distancia: 'medio' as const, competicion: '2026-10-11' }

describe('encadenar los bloques', () => {
  const c = cadenaDeMesos(MESOS, OPC)

  /* Por FECHA, no por id: un mesociclo insertado después puede ir antes en el
     calendario, y encadenar por id daría una progresión que sube y baja. */
  it('los ordena por fecha, no por id', () => {
    expect(c[0].mesoId).toBe(10)
    expect(c[c.length - 1].mesoId).toBe(20)
  })

  it('es una sola tira con numeración global', () => {
    expect(c).toHaveLength(7)                       // 4 + 3
    expect(c.map(s => s.global)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(c.map(s => s.n)).toEqual([1, 2, 3, 4, 1, 2, 3])   // dentro de su bloque
  })

  it('cada semana sabe cuántas quedan hasta la carrera', () => {
    expect(c[0].hastaMeta).toBe(7)
    expect(c[6].hastaMeta).toBe(1)
  })

  it('sin competición, no se inventa la cuenta', () => {
    expect(cadenaDeMesos(MESOS, { ...OPC, competicion: null })[0].hastaMeta).toBeNull()
  })

  it('las dos descargas siguen ahí, una por bloque', () => {
    expect(c.filter(s => s.esDescarga).map(s => s.global)).toEqual([4, 7])
  })
})

// Una semana que pedía subir del 100 % al 107 %.
const semanaQueSube = { cargaRelativa: 1.075, esDescarga: false, clase: 'acumulacion' as const, horasSemana: 11 }

describe('ajustar a lo que pasó', () => {
  it('sin datos no toca nada', () => {
    const a = ajustarSemana(semanaQueSube, {}, 1.0)
    expect(a.cargaAjustada).toBe(1.075)
    expect(a.motivos).toEqual([])
  })

  /* No saber cómo llegó el atleta no es motivo para recortarle la semana. */
  it('con cumplimiento alto tampoco', () => {
    expect(ajustarSemana(semanaQueSube, { cumplimiento: 0.95, acwr: 1.1, tsb: -15 }, 1.0).motivos).toEqual([])
  })

  it('TSB en sobrecarga convierte la semana en descarga', () => {
    const a = ajustarSemana(semanaQueSube, { tsb: UMBRALES_TSB.sobrecarga - 5 }, 1.0)
    expect(a.convertidaEnDescarga).toBe(true)
    expect(a.cargaAjustada).toBeLessThan(0.6)
    expect(a.motivos[0]).toMatch(/Pasa a descarga por TSB -35 \(Sobrecarga\)/)
    expect(a.horasAjustadas).toBeLessThan(semanaQueSube.horasSemana)
  })

  it('ACWR en peligro, igual', () => {
    const a = ajustarSemana(semanaQueSube, { acwr: UMBRALES_ACWR.precaucion + 0.2 }, 1.0)
    expect(a.convertidaEnDescarga).toBe(true)
    expect(a.motivos[0]).toMatch(/ACWR 1\.70 \(Peligro\)/)
  })

  /* El tapering ya es volumen bajo por diseño. Recortarlo más por un TSB
     negativo sería recortar justo lo que lo está haciendo bajar. */
  it('no toca el tapering ni una semana que ya era de descarga', () => {
    const taper = { cargaRelativa: 0.5, esDescarga: false, clase: 'competicion' as const, horasSemana: 5 }
    expect(ajustarSemana(taper, { tsb: -40 }, 0.6).convertidaEnDescarga).toBe(false)
    const desc = { ...semanaQueSube, esDescarga: true, cargaRelativa: 0.575 }
    expect(ajustarSemana(desc, { tsb: -40 }, 1.075).convertidaEnDescarga).toBe(false)
  })

  it('ACWR en precaución no descarga, pero impide subir', () => {
    const a = ajustarSemana(semanaQueSube, { acwr: 1.4 }, 1.0)
    expect(a.convertidaEnDescarga).toBe(false)
    expect(a.cargaAjustada).toBe(1.0)
    expect(a.motivos[0]).toMatch(/No sube.*precaución/)
  })

  it('si la semana anterior no se hizo, no se progresa sobre ella', () => {
    const a = ajustarSemana(semanaQueSube, { cumplimiento: 0.4 }, 1.0)
    expect(a.cargaAjustada).toBe(1.0)
    expect(a.motivos[0]).toMatch(/se hizo el 40 %/)
    expect(a.motivos[0]).toMatch(/base que no existe/)
  })

  it('justo en el mínimo de cumplimiento todavía cuenta como hecha', () => {
    expect(ajustarSemana(semanaQueSube, { cumplimiento: CUMPLIMIENTO_MINIMO }, 1.0).motivos).toEqual([])
  })

  /* LA REGLA ASIMÉTRICA. Que hiciera menos de lo previsto no es permiso para
     pedirle más ahora. */
  it('nunca sube la carga, ni con el atleta fresquísimo', () => {
    const a = ajustarSemana(semanaQueSube, { cumplimiento: 1.2, acwr: 0.5, tsb: 30 }, 1.0)
    expect(a.cargaAjustada).toBeLessThanOrEqual(1.075)
  })

  it('con dos señales gana la más exigente, no la suma', () => {
    const a = ajustarSemana(semanaQueSube, { tsb: -40, cumplimiento: 0.3 }, 1.0)
    expect(a.cargaAjustada).toBe(0.55)   // la descarga, no 0.55 × algo
  })
})

describe('la cadena ajustada', () => {
  const cadena = cadenaDeMesos(MESOS, OPC)

  /* La semana 2 se recorta por fatiga. La 3 no tiene métricas propias, así que
     ninguna de sus reglas dispara — y sin el tope de salto volvía al 107 % como
     si la semana anterior hubiera ido bien. Sube, pero por un escalón que
     alguien puede subir. */
  it('tras un recorte, la siguiente sube por un escalón, no de golpe', () => {
    const r = ajustarCadena(cadena, { [cadena[1].lunes!]: { tsb: -40 } })
    expect(r[1].ajuste.convertidaEnDescarga).toBe(true)

    const s3 = r[2].ajuste
    expect(s3.cargaOriginal).toBe(1.075)
    expect(s3.cargaAjustada).toBeLessThan(0.7)                       // no vuelve al patrón
    expect(s3.cargaAjustada).toBeGreaterThan(r[1].ajuste.cargaAjustada) // pero avanza
    expect(s3.cargaAjustada / r[1].ajuste.cargaAjustada).toBeCloseTo(SALTO_MAXIMO, 2)
    expect(s3.motivos[0]).toMatch(/Techo por el recorte de la semana anterior/)
  })

  /* Después de la descarga PLANIFICADA el salto es el objetivo: existe justo
     para que el bloque siguiente pueda arrancar arriba. */
  it('tras la descarga de un bloque, el siguiente arranca donde diga el patrón', () => {
    const r = ajustarCadena(cadena, {})
    expect(r[3].esDescarga).toBe(true)
    expect(r[4].ajuste.cargaAjustada).toBe(r[4].cargaRelativa)
    expect(r[4].ajuste.motivos).toEqual([])
  })

  it('sin estado de nadie, la cadena sale intacta', () => {
    const r = ajustarCadena(cadena, {})
    expect(r.map(s => s.ajuste.cargaAjustada)).toEqual(cadena.map(s => s.cargaRelativa))
    expect(r.every(s => !s.ajuste.motivos.length)).toBe(true)
  })

  it('cada semana ajustada dice por qué', () => {
    const r = ajustarCadena(cadena, { [cadena[2].lunes!]: { cumplimiento: 0.2 } })
    const tocada = r.find(s => s.ajuste.motivos.length)!
    expect(tocada.lunes).toBe(cadena[2].lunes)
    expect(tocada.ajuste.motivos[0].length).toBeGreaterThan(30)
  })
})
