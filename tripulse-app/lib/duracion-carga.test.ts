import { describe, it, expect } from 'vitest'
import { estimarDuraciones, minutosEfectivos, duracionSesionTexto } from './duracion-carga'
import type { ResultadoDuracion } from './duracion'

const est = (minutos: number, estimable = true): ResultadoDuracion =>
  ({ segundos: minutos * 60, minutos, estimable, avisoCiclismo: false, faltanTests: false })

// Este módulo decide qué minutos ve el entrenador en toda la app (volumen, carga,
// calendario). Lo que hay que blindar es la PRECEDENCIA: lo que el atleta midió de
// verdad manda siempre sobre lo que estimamos nosotros.

describe('minutosEfectivos — manual manda sobre estimación', () => {
  it('con duración manual usa esa aunque haya estimación', () => {
    expect(minutosEfectivos(50, est(45))).toBe(50)
  })
  it('sin manual cae a la estimación', () => {
    expect(minutosEfectivos(null, est(45))).toBe(45)
  })
  it('sin manual y sin estimación devuelve null (no cero: cero es una sesión de 0 min)', () => {
    expect(minutosEfectivos(null, undefined)).toBeNull()
    expect(minutosEfectivos(undefined, undefined)).toBeNull()
  })
  it('una estimación no estimable no se usa', () => {
    expect(minutosEfectivos(null, est(45, false))).toBeNull()
  })
  it('una estimación de 0 minutos no se usa', () => {
    expect(minutosEfectivos(null, est(0))).toBeNull()
  })
})

describe('duracionSesionTexto — la tilde distingue medido de estimado', () => {
  it('manual va sin tilde', () => {
    expect(duracionSesionTexto(50, est(45))).toBe('50 min')
  })
  it('estimado va con tilde, para que el entrenador sepa que es un cálculo nuestro', () => {
    expect(duracionSesionTexto(null, est(45))).toBe('~45 min')
  })
  it('sin nada, raya', () => {
    expect(duracionSesionTexto(null, undefined)).toBe('—')
    expect(duracionSesionTexto(null, est(45, false))).toBe('—')
  })
})

// ------------------------------------------------------------
// estimarDuraciones recibe supabase como parámetro, así que se puede probar entera.
// ------------------------------------------------------------
function fakeSupabase(tablas: Record<string, any[]>) {
  return {
    from(tabla: string) {
      let filas = [...(tablas[tabla] ?? [])]
      const q: any = {
        select: () => q,
        in: (col: string, vals: any[]) => { filas = filas.filter(f => vals.includes(f[col])); return q },
        eq: (col: string, val: any) => { filas = filas.filter(f => f[col] === val); return q },
        then: (resolve: any) => resolve({ data: filas, error: null }),
      }
      return q
    },
  }
}

const TESTS = { vam: 16, css: 1.4, ftp: 250 }

describe('estimarDuraciones — carga en lote', () => {
  it('sin sesiones no consulta nada y devuelve vacío', async () => {
    expect(await estimarDuraciones(fakeSupabase({}), [], TESTS)).toEqual({})
  })

  it('devuelve una entrada por sesión pedida, aunque alguna no tenga tareas', async () => {
    const sb = fakeSupabase({
      tarea: [{ id: 1, id_sesion: 10, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' }],
      p_duracion: [{ id_tarea: 1, tiempo_planeado: 1800 }],
    })
    const out = await estimarDuraciones(sb, [10, 11], TESTS)
    expect(Object.keys(out).map(Number).sort()).toEqual([10, 11])
    expect(out[11].estimable).toBe(false)
  })

  it('no mezcla las tareas de una sesión con las de otra', async () => {
    const sb = fakeSupabase({
      tarea: [
        { id: 1, id_sesion: 10, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' },
        { id: 2, id_sesion: 20, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' },
      ],
      p_duracion: [
        { id_tarea: 1, tiempo_planeado: 1800 },   // 30 min
        { id_tarea: 2, tiempo_planeado: 3600 },   // 60 min
      ],
    })
    const out = await estimarDuraciones(sb, [10, 20], TESTS)
    expect(out[10].minutos).toBe(30)
    expect(out[20].minutos).toBe(60)
  })

  it('no mezcla los parámetros de una tarea con los de otra de la misma sesión', async () => {
    const sb = fakeSupabase({
      tarea: [
        { id: 1, id_sesion: 10, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' },
        { id: 2, id_sesion: 10, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' },
      ],
      p_duracion: [
        { id_tarea: 1, tiempo_planeado: 600 },
        { id_tarea: 2, tiempo_planeado: 900 },
      ],
    })
    const out = await estimarDuraciones(sb, [10], TESTS)
    expect(out[10].minutos).toBe(25)   // 10 + 15, no 2×10 ni 2×15
  })

  it('las series multiplican: una tarea de fuerza repetida cuesta más', async () => {
    const conSeries = (series: number) => fakeSupabase({
      tarea: [{ id: 1, id_sesion: 10, disciplina: 'Fuerza', series, descanso_segundos: 60 }],
      ejercicios: [{ id_tarea: 1, repeticiones: 10 }],
    })
    const una = (await estimarDuraciones(conSeries(1), [10], TESTS))[10]
    const cuatro = (await estimarDuraciones(conSeries(4), [10], TESTS))[10]
    expect(cuatro.minutos).toBeGreaterThan(una.minutos)
    expect(una.estimable).toBe(true)
  })

  it('una sesión sin ningún parámetro no es estimable', async () => {
    const sb = fakeSupabase({
      tarea: [{ id: 1, id_sesion: 10, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' }],
    })
    const out = await estimarDuraciones(sb, [10], TESTS)
    expect(out[10].estimable).toBe(false)
    expect(out[10].minutos).toBe(0)
  })

  it('marca que faltan tests cuando hay distancia de carrera y no hay VAM', async () => {
    const sb = fakeSupabase({
      tarea: [{ id: 1, id_sesion: 10, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' }],
      p_distancia: [{ id_tarea: 1, metros_planeados: 5000 }],
    })
    const conTest = (await estimarDuraciones(sb, [10], TESTS))[10]
    const sinTest = (await estimarDuraciones(
      fakeSupabase({
        tarea: [{ id: 1, id_sesion: 10, disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL' }],
        p_distancia: [{ id_tarea: 1, metros_planeados: 5000 }],
      }), [10], { vam: null, css: null, ftp: null }))[10]
    expect(conTest.estimable).toBe(true)
    expect(sinTest.faltanTests).toBe(true)
  })
})
