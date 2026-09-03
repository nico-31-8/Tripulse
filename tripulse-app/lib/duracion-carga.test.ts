import { describe, it, expect } from 'vitest'
import {
  estimarDuraciones, minutosEfectivos, duracionSesionTexto, minutosCarga, origenMinutos,
  minutosPlanificados, cargaPlanificada, cargaReal, mmss, mmssCorto,
} from './duracion-carga'
import type { ResultadoDuracion } from './duracion'

const est = (minutos: number, estimable = true): ResultadoDuracion =>
  ({ segundos: minutos * 60, minutos, estimable, avisoCiclismo: false, faltanTests: false, usoReferencia: false })

// Este módulo decide qué minutos ve el entrenador en toda la app (volumen, carga,
// calendario). Lo que hay que blindar es la PRECEDENCIA: lo que el atleta midió de
// verdad manda siempre sobre lo que estimamos nosotros.

describe('minutosEfectivos — lo cronometrado manda, luego lo manual, luego la estimación', () => {
  it('lo que el atleta cronometró gana a todo lo demás', () => {
    expect(minutosEfectivos({ duracion_real: 38, duracion_minutos: 50 }, est(45))).toBe(38)
  })
  it('con duración manual usa esa aunque haya estimación', () => {
    expect(minutosEfectivos({ duracion_minutos: 50 }, est(45))).toBe(50)
  })
  it('sin manual cae a la estimación', () => {
    expect(minutosEfectivos({}, est(45))).toBe(45)
  })
  it('sin nada de nada devuelve null (no cero: cero es una sesión de 0 min)', () => {
    expect(minutosEfectivos({}, undefined)).toBeNull()
    expect(minutosEfectivos(null, undefined)).toBeNull()
    expect(minutosEfectivos(undefined, undefined)).toBeNull()
  })
  it('una estimación no estimable no se usa', () => {
    expect(minutosEfectivos({}, est(45, false))).toBeNull()
  })
  it('una estimación de 0 minutos no se usa', () => {
    expect(minutosEfectivos({}, est(0))).toBeNull()
  })
  it('mismo veredicto que minutosCarga, que es de quien no se puede discrepar', () => {
    const casos = [
      { duracion_real: 38, duracion_minutos: 50 },
      { duracion_real: null, duracion_minutos: 50 },
      { duracion_real: 0, duracion_minutos: 50 },
      {},
    ]
    for (const s of casos) {
      expect(minutosEfectivos(s, est(45))).toBe(minutosCarga(s, est(45)))
    }
  })
})

describe('duracionSesionTexto — la tilde distingue medido de estimado', () => {
  it('lo cronometrado va sin tilde y pisa a lo planificado', () => {
    expect(duracionSesionTexto({ duracion_real: 38, duracion_minutos: 50 }, est(45))).toBe('38 min')
  })
  it('manual va sin tilde', () => {
    expect(duracionSesionTexto({ duracion_minutos: 50 }, est(45))).toBe('50 min')
  })
  it('estimado va con tilde, para que se sepa que es un cálculo nuestro', () => {
    expect(duracionSesionTexto({}, est(45))).toBe('~45 min')
  })
  it('sin nada, raya', () => {
    expect(duracionSesionTexto({}, undefined)).toBe('—')
    expect(duracionSesionTexto(null, undefined)).toBe('—')
    expect(duracionSesionTexto({}, est(45, false))).toBe('—')
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

// ------------------------------------------------------------
// minutosCarga — la duración que usan los motores de carga y volumen
// ------------------------------------------------------------
// Blinda la prioridad: lo que PASÓ manda sobre lo planificado, y lo planificado
// sobre lo que estimamos nosotros. Antes cada módulo leía duracion_minutos a pelo:
// una sesión sin duración manual valía 0 UA y no sumaba a CTL/ATL/TSB.
describe('minutosCarga', () => {
  const estim = (minutos: number): ResultadoDuracion =>
    ({ segundos: minutos * 60, minutos, estimable: true, avisoCiclismo: false, faltanTests: false, usoReferencia: false })

  it('lo que duró de verdad manda sobre todo lo demás', () => {
    expect(minutosCarga({ duracion_real: 52, duracion_minutos: 45 }, estim(90))).toBe(52)
  })
  it('sin duración real, manda la manual', () => {
    expect(minutosCarga({ duracion_real: null, duracion_minutos: 45 }, estim(90))).toBe(45)
  })
  it('sin real ni manual, se usa la estimación en vez de tirar la sesión', () => {
    expect(minutosCarga({ duracion_real: null, duracion_minutos: null }, estim(92))).toBe(92)
  })

  // El agujero que motivó el helper.
  it('una sesión solo estimada YA NO vale cero', () => {
    const s = { duracion_real: null, duracion_minutos: null }
    expect(minutosCarga(s, estim(92))).toBeGreaterThan(0)
  })
  it('sin ninguna de las tres devuelve 0, no null: es un multiplicando', () => {
    expect(minutosCarga({ duracion_real: null, duracion_minutos: null })).toBe(0)
    expect(minutosCarga(null)).toBe(0)
  })
  it('los módulos que no cargan tareas pueden no pasar estimación', () => {
    expect(minutosCarga({ duracion_real: null, duracion_minutos: 60 })).toBe(60)
  })
  it('una estimación no estimable no cuenta', () => {
    const noEst: ResultadoDuracion = { segundos: 0, minutos: 0, estimable: false, avisoCiclismo: false, faltanTests: true, usoReferencia: false }
    expect(minutosCarga({ duracion_real: null, duracion_minutos: null }, noEst)).toBe(0)
  })
  it('ceros y negativos no se cuelan como valor válido', () => {
    expect(minutosCarga({ duracion_real: 0, duracion_minutos: 40 })).toBe(40)
    expect(minutosCarga({ duracion_real: -5, duracion_minutos: 40 })).toBe(40)
  })
})

describe('origenMinutos — de dónde salió el número', () => {
  const estim = (m: number): ResultadoDuracion => ({ segundos: m*60, minutos: m, estimable: true, avisoCiclismo: false, faltanTests: false, usoReferencia: false })
  it('distingue las tres procedencias', () => {
    expect(origenMinutos({ duracion_real: 52, duracion_minutos: 45 })).toBe('real')
    expect(origenMinutos({ duracion_real: null, duracion_minutos: 45 })).toBe('manual')
    expect(origenMinutos({ duracion_real: null, duracion_minutos: null }, estim(90))).toBe('estimada')
  })
  it('null cuando no hay nada que enseñar', () => {
    expect(origenMinutos({ duracion_real: null, duracion_minutos: null })).toBeNull()
  })
})

/*
  Había CUATRO `segAMmss` y no eran la misma función: tres siempre devolvían
  «m:ss» y la cuarta se comía el «:00». Mismo nombre, dos comportamientos. Estos
  tests fijan que siguen siendo DOS y cuál es cuál, para que nadie las «unifique»
  creyendo que son una.
*/
describe('mmss y mmssCorto son distintas a propósito', () => {
  it('mmss siempre lleva los dos puntos: es para MOSTRAR', () => {
    expect(mmss(120)).toBe('2:00')
    expect(mmss(90)).toBe('1:30')
    expect(mmss(45)).toBe('0:45')
    expect(mmss(185)).toBe('3:05')
    expect(mmss(0)).toBe('0:00')
  })

  it('mmssCorto se come el «:00»: es para una CASILLA que se teclea', () => {
    expect(mmssCorto(120)).toBe('2')
    expect(mmssCorto(90)).toBe('1:30')
    expect(mmssCorto(45)).toBe('0:45')
    expect(mmssCorto(185)).toBe('3:05')
  })

  it('solo se diferencian en el minuto exacto', () => {
    for (const seg of [45, 90, 185, 3599]) expect(mmss(seg)).toBe(mmssCorto(seg))
    for (const seg of [60, 120, 600]) expect(mmss(seg)).not.toBe(mmssCorto(seg))
  })
})

describe('«Programado» mide lo que se mandó, no lo que costó', () => {
  it('IGNORA la duración real, aunque exista', () => {
    /* ESTE ES EL FALLO QUE HACÍA ILEGIBLE LA GRÁFICA DEL DIBUJO. Antes esto
       devolvía 8 x 158 = 1264, porque `minutosCarga` prefiere lo cronometrado.
       Así, una semana pasada se dibujaba con lo que COSTÓ y la siguiente con lo
       que se piensa hacer, las dos en la misma barra y la misma escala. */
    const s = { rpe_estimado: 8, duracion_real: 158, duracion_minutos: null }
    expect(cargaPlanificada(s, est(40))).toBe(8 * 40)
  })

  it('la duración a mano manda sobre la estimación', () => {
    /* Lo que el entrenador escribió ES lo que mandó. */
    const s = { rpe_estimado: 6, duracion_minutos: 75, duracion_real: 200 }
    expect(cargaPlanificada(s, est(40))).toBe(6 * 75)
  })

  it('sin nada a mano, la estimación', () => {
    expect(cargaPlanificada({ rpe_estimado: 5 }, est(30))).toBe(150)
  })

  it('sin minutos de ninguna clase, cero', () => {
    expect(cargaPlanificada({ rpe_estimado: 9 })).toBe(0)
  })

  it('«Realizado» SÍ usa la duración real: es su trabajo', () => {
    /* Las dos capas tienen que seguir siendo distintas. Si esta también
       ignorase lo cronometrado, no quedaría ninguna que dijera lo que pasó. */
    const s = { rpe_estimado: 8, rpe_reportado: 9, duracion_real: 158 }
    expect(cargaReal(s, est(40))).toBe(9 * 158)
  })

  it('la misma sesión da distinto en cada capa, y eso es lo correcto', () => {
    const s = { rpe_estimado: 5, rpe_reportado: 8, duracion_real: 120 }
    const mandado = cargaPlanificada(s, est(60))
    const costado = cargaReal(s, est(60))
    expect(mandado).toBe(5 * 60)    // lo que se pidió
    expect(costado).toBe(8 * 120)   // lo que salió
    expect(mandado).not.toBe(costado)
  })

  it('minutosPlanificados y minutosCarga solo se diferencian en la real', () => {
    const sinReal = { duracion_minutos: 45 }
    expect(minutosPlanificados(sinReal, est(30))).toBe(minutosCarga(sinReal, est(30)))
    const conReal = { duracion_minutos: 45, duracion_real: 90 }
    expect(minutosPlanificados(conReal, est(30))).toBe(45)
    expect(minutosCarga(conReal, est(30))).toBe(90)
  })
})
