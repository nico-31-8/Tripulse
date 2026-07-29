import { describe, it, expect } from 'vitest'
import { calcularDuracionEstimada, medirDuracion, type TareaDuracion, type TestsDeportista } from './duracion'

const tests: TestsDeportista = { vam: 15, css: 1.4, ftp: 250 }

describe('calcularDuracionEstimada', () => {
  it('sin tareas → no estimable, 0 minutos', () => {
    const r = calcularDuracionEstimada([], tests)
    expect(r.estimable).toBe(false)
    expect(r.segundos).toBe(0)
    expect(r.minutos).toBe(0)
  })

  it('tarea de fuerza con reps → estimable y minutos coherentes', () => {
    const t: TareaDuracion = { disciplina: 'Fuerza', series: 3, descanso_segundos: 60, ejercicios: [{ repeticiones: 10 }] }
    const r = calcularDuracionEstimada([t], tests)
    expect(r.estimable).toBe(true)
    expect(r.minutos).toBeGreaterThan(0)
    expect(r.minutos).toBe(Math.round(r.segundos / 60))
  })

  it('dos tareas de fuerza suman más que el doble de una (transición entre ejercicios)', () => {
    const t = (): TareaDuracion => ({ disciplina: 'Fuerza', series: 3, descanso_segundos: 60, ejercicios: [{ repeticiones: 10 }] })
    const uno = calcularDuracionEstimada([t()], tests).segundos
    const dos = calcularDuracionEstimada([t(), t()], tests).segundos
    expect(dos).toBeGreaterThan(uno * 2)
  })

  it('tarea con tiempo planeado → estimable directamente', () => {
    const t: TareaDuracion = { disciplina: 'Carrera', series: 1, p_duracion: [{ tiempo_planeado: 1800 }] }
    const r = calcularDuracionEstimada([t], tests)
    expect(r.estimable).toBe(true)
    expect(r.segundos).toBe(1800)
  })

  it('carrera por distancia sin VAM → marca faltanTests', () => {
    const t: TareaDuracion = { disciplina: 'Carrera', series: 1, p_distancia: [{ metros_planeados: 5000 }] }
    const r = calcularDuracionEstimada([t], {})
    expect(r.faltanTests).toBe(true)
    expect(r.estimable).toBe(false)
  })

  it('ciclismo por distancia → marca avisoCiclismo (no estimable por metros)', () => {
    const t: TareaDuracion = { disciplina: 'Ciclismo', series: 1, p_distancia: [{ metros_planeados: 20000 }] }
    const r = calcularDuracionEstimada([t], {})
    expect(r.avisoCiclismo).toBe(true)
  })
})

// ------------------------------------------------------------
// medirDuracion — el reloj del modo entreno y su salvaconducto
// ------------------------------------------------------------
describe('medirDuracion', () => {
  const T0 = 1_800_000_000_000          // instante arbitrario
  const tras = (min: number) => T0 + min * 60_000

  it('mide los minutos entre Empezar y Finalizar', () => {
    const d = medirDuracion(T0, tras(52), 45)
    expect(d.medidos).toBe(52)
    expect(d.minutos).toBe(52)
    expect(d.fiable).toBe(true)
  })

  it('acepta pasarse bastante de lo planificado: uno se entretiene', () => {
    expect(medirDuracion(T0, tras(90), 45).fiable).toBe(true)
  })

  it('acepta quedarse corto: dejar la sesión a medias es legítimo', () => {
    const d = medirDuracion(T0, tras(18), 45)
    expect(d.minutos).toBe(18)
    expect(d.fiable).toBe(true)
  })

  // El salvaconducto: si se dejó la sesión abierta, NO se propone el número medido.
  it('si se olvidó de parar, no propone nada y lo dice', () => {
    const d = medirDuracion(T0, tras(300), 45)   // 5 h para una sesión de 45 min
    expect(d.minutos).toBeNull()
    expect(d.fiable).toBe(false)
    expect(d.medidos).toBe(300)                   // se conserva para poder enseñárselo
  })

  it('una pestaña olvidada de un día entero nunca cuela', () => {
    expect(medirDuracion(T0, tras(1440), 240).fiable).toBe(false)
  })

  it('lo que es desproporcionado depende de lo planificado', () => {
    // 3 h son basura en una sesión de 45 min y normales en una tirada de 3 h
    expect(medirDuracion(T0, tras(180), 45).fiable).toBe(false)
    expect(medirDuracion(T0, tras(180), 180).fiable).toBe(true)
  })

  it('sin duración planificada usa un techo propio de 4 h', () => {
    expect(medirDuracion(T0, tras(200), 0).fiable).toBe(true)
    expect(medirDuracion(T0, tras(260), 0).fiable).toBe(false)
  })

  it('sin hora de inicio no inventa una duración', () => {
    const d = medirDuracion(null, tras(52), 45)
    expect(d.minutos).toBeNull()
    expect(d.medidos).toBe(0)
  })

  it('un fin anterior al inicio (reloj cambiado) no da negativos', () => {
    expect(medirDuracion(tras(30), T0, 45)).toEqual({ minutos: null, medidos: 0, fiable: false })
  })
})
