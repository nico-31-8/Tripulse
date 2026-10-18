import { describe, it, expect } from 'vitest'
import {
  leerIntensidad, desdePorcentaje, intensidadDeTarea, pasosDeTarea, entrenosDeSesion, porQueNoVaACoros,
  estadoEnCoros, siguenEnSuCoros, nombreDeEntreno, huellaDe, repeticionDe, textoTiempo, fechaCoros,
  idEnPlanDe, esIdProvisional, ID_PROVISIONAL, textoObjetivo, textoIntensidad,
  leerCalendarioCoros, esCalendarioCoros, ajenosDelDia, idDeCalendario,
  type ContextoCoros, type EnvioCoros, type GrupoCoros, type SeccionCoros, type SesionParaCoros,
} from './coros-envio'

/* El deportista de la maqueta: VAM 17 km/h, FTP 250 W, FC máx 188 y de reposo 50. */
const CTX: ContextoCoros = { tests: { vam: 17, ftp: 250, css: 1.25 }, propios: [], fcMax: 188, fcReposo: 50 }
const SIN_NADA: ContextoCoros = { tests: { vam: null, ftp: null, css: null }, propios: [], fcMax: 0, fcReposo: 0 }

let ids = 1
const tarea = (o: Record<string, unknown>) => {
  const { metros, segundos, arroba, ...resto } = o as { metros?: number; segundos?: number; arroba?: string }
  return {
    id: ids++, orden: ids, series: 1, descanso_segundos: null, bloques: null, descanso_bloques_segundos: null,
    comentario: null, zona_copia: null, formato: null,
    p_distancia: metros ? [{ metros_planeados: metros, ritmo_objetivo: arroba ?? null }] : [],
    p_duracion: segundos ? [{ tiempo_planeado: segundos, ritmo_objetivo: metros ? null : arroba ?? null }] : [],
    ...resto,
  }
}
const sesion = (o: Partial<SesionParaCoros> = {}): SesionParaCoros =>
  ({ id: 1, fecha_sesion: '2026-10-20', disciplina: 'Carrera', estado: 'Planificada', notas_entrenador: null, ...o })

describe('leer lo que se escribe en el «@»', () => {
  it('el ritmo, solo con «/km»: un valor, un rango y los minutos a secas', () => {
    expect(leerIntensidad('4:30 /km')).toEqual({ tipo: 'ritmo', min: 270, max: 270 })
    expect(leerIntensidad('4 /km')).toEqual({ tipo: 'ritmo', min: 240, max: 240 })
    expect(leerIntensidad('2:54-3 /km')).toEqual({ tipo: 'ritmo', min: 174, max: 180 })
    expect(leerIntensidad('2:54-3:01 /km')).toEqual({ tipo: 'ritmo', min: 174, max: 181 })
    expect(leerIntensidad('< 5:26 /km')).toEqual({ tipo: 'ritmo', abierto: '<', valor: 326 })
  })

  it('el pulso y los vatios, con su unidad', () => {
    expect(leerIntensidad('120-140 ppm')).toEqual({ tipo: 'pulso', min: 120, max: 140 })
    expect(leerIntensidad('150 bpm')).toEqual({ tipo: 'pulso', min: 150, max: 150 })
    expect(leerIntensidad('< 126 ppm')).toEqual({ tipo: 'pulso', abierto: '<', valor: 126 })
    expect(leerIntensidad('180–220 W')).toEqual({ tipo: 'potencia', min: 180, max: 220 })
    expect(leerIntensidad('< 138 W')).toEqual({ tipo: 'potencia', abierto: '<', valor: 138 })
  })

  it('el porcentaje de un test, que solo vale con el test', () => {
    expect(leerIntensidad('95–105% VAM')).toEqual({ tipo: 'porcentaje', de: 'VAM', min: 95, max: 105 })
    expect(leerIntensidad('< 55% FTP')).toEqual({ tipo: 'porcentaje', de: 'FTP', min: null, max: 55 })
    expect(desdePorcentaje({ tipo: 'porcentaje', de: 'VAM', min: 95, max: 105 }, CTX.tests))
      .toEqual({ tipo: 'ritmo', min: 202, max: 223 })
    expect(desdePorcentaje({ tipo: 'porcentaje', de: 'FTP', min: 56, max: 75 }, CTX.tests))
      .toEqual({ tipo: 'potencia', min: 140, max: 188 })
    expect(desdePorcentaje({ tipo: 'porcentaje', de: 'FTP', min: 56, max: 75 }, SIN_NADA.tests)).toBeNull()
  })

  /* Lo que hay de verdad en la base y no se puede convertir sin adivinar. */
  it('lo que no lleva una unidad clara no se convierte', () => {
    for (const t of ['3:09', '25s', '2:01-2;04', 'a tope', 'A tope', '76s/ritmo de 3:01', 'RPE 4–6', '', null]) {
      expect(leerIntensidad(t), String(t)).toBeNull()
    }
  })
})

describe('la intensidad de una tarea', () => {
  it('lo escrito por el entrenador, tal cual, y sin decir que sale de los tests', () => {
    const r = intensidadDeTarea(tarea({ zona_entrenamiento: 'AEL', metros: 3000, arroba: '4:10 /km' }), 'Carrera', CTX)
    expect(r.campos).toEqual({ intensityType: 2, intensityValueStart: 250, intensityValueEnd: 250 })
    expect(r.calculada).toBeUndefined()
  })

  it('sin nada escrito, lo que calcula la app: en carrera el ritmo; en bici los vatios', () => {
    expect(intensidadDeTarea(tarea({ zona_entrenamiento: 'AEL', metros: 5000 }), 'Carrera', CTX))
      .toEqual({ campos: { intensityType: 2, intensityValueStart: 282, intensityValueEnd: 326 }, calculada: 'ritmo' })
    expect(intensidadDeTarea(tarea({ zona_entrenamiento: 'AEM', segundos: 720 }), 'Ciclismo', CTX))
      .toEqual({ campos: { intensityType: 4, intensityValueStart: 190, intensityValueEnd: 225 }, calculada: 'potencia' })
  })

  /* La decisión 1 de la maqueta: lo suave sin suelo va por pulso, con solo techo. */
  it('lo suave sin suelo (AER) va por pulso, de 30 hasta su techo, en carrera y en bici', () => {
    expect(intensidadDeTarea(tarea({ zona_entrenamiento: 'AER', segundos: 900 }), 'Carrera', CTX))
      .toEqual({ campos: { intensityType: 1, intensityValueStart: 30, intensityValueEnd: 126 }, tope: 126 })
    expect(intensidadDeTarea(tarea({ zona_entrenamiento: 'AER', segundos: 900 }), 'Ciclismo', CTX))
      .toEqual({ campos: { intensityType: 1, intensityValueStart: 30, intensityValueEnd: 126 }, tope: 126 })
  })

  it('en bici y sin test de FTP, el pulso de su zona', () => {
    const r = intensidadDeTarea(tarea({ zona_entrenamiento: 'AEM', segundos: 720 }), 'Ciclismo', { ...CTX, tests: { vam: 17 } })
    expect(r.campos).toEqual({ intensityType: 1, intensityValueStart: 145, intensityValueEnd: 160 })
    expect(r.calculada).toBe('pulso')
  })

  it('lo escrito que no se puede convertir va a la descripción, no se sustituye por otro número', () => {
    const r = intensidadDeTarea(tarea({ zona_entrenamiento: 'PLA', metros: 600, arroba: '2:01-2;04' }), 'Carrera', CTX)
    expect(r.campos).toBeUndefined()
    expect(r.nota).toBe('2:01-2;04')
  })

  it('un ritmo escrito en una sesión de bici no va: COROS no admite ritmo en bici', () => {
    const r = intensidadDeTarea(tarea({ zona_entrenamiento: 'AEL', segundos: 3600, arroba: '3:30 /km' }), 'Ciclismo', CTX)
    expect(r.campos).toBeUndefined()
    expect(r.nota).toBe('3:30 /km')
  })

  it('sin tests ni FC máxima no hay número que mandar: va como nota', () => {
    const r = intensidadDeTarea(tarea({ zona_entrenamiento: 'AEL', metros: 5000 }), 'Carrera', SIN_NADA)
    expect(r.campos).toBeUndefined()
    expect(r.nota).toBeTruthy()
  })

  it('un número fuera de lo que admite COROS no se manda', () => {
    const r = intensidadDeTarea(tarea({ zona_entrenamiento: 'AEL', metros: 3000, arroba: '1:30 /km' }), 'Carrera', CTX)
    expect(r.campos).toBeUndefined()
    expect(r.nota).toBe('1:30 /km')
  })
})

describe('las secciones de una tarea', () => {
  it('series con descanso: un grupo de intervalos con el trabajo y la recuperación', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 800, series: 6, descanso_segundos: 120 }), 'Carrera', CTX, 2)
    expect(p.pasos).toEqual([{
      intervalGroup: true, repeats: 6, sets: [
        { sectionType: 2, targetType: 1, targetValue: 800, intensityType: 2, intensityValueStart: 202, intensityValueEnd: 223 },
        { sectionType: 3, targetType: 2, targetValue: 120 },
      ],
    }])
  })

  it('más de 20 repeticiones: en grupos de 20 seguidos', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'AEI', metros: 200, series: 25, descanso_segundos: 30 }), 'Carrera', CTX, 2)
    expect(p.pasos.map(x => (x as GrupoCoros).repeats)).toEqual([20, 5])
  })

  it('3 × (2 × 400): desplegado, con el descanso largo entre bloques y no después del último', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 400, series: 2, bloques: 3, descanso_segundos: 60, descanso_bloques_segundos: 180 }), 'Carrera', CTX, 2)
    expect(p.pasos.map(x => ('intervalGroup' in x ? 'grupo ' + x.repeats : 'rec ' + (x as SeccionCoros).targetValue)))
      .toEqual(['grupo 2', 'rec 180', 'grupo 2', 'rec 180', 'grupo 2'])
  })

  it('sin metros ni tiempo, una sección libre (se acaba con el botón de vuelta)', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'AEL' }), 'Carrera', CTX, 2)
    expect(p.pasos[0]).toMatchObject({ sectionType: 2, targetType: 4 })
    expect((p.pasos[0] as SeccionCoros).targetValue).toBeUndefined()
  })

  it('el comentario de la tarea va a la descripción con su repetición', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 200, series: 4, comentario: 'A tope' }), 'Carrera', CTX, 2)
    expect(p.notas).toEqual(['4×200 m: A tope'])
  })
})

describe('la sesión entera', () => {
  const SERIES = [
    tarea({ orden: 1, zona_entrenamiento: 'AER', segundos: 900 }),
    tarea({ orden: 2, zona_entrenamiento: 'PAE', metros: 800, series: 6, descanso_segundos: 120 }),
    tarea({ orden: 3, zona_entrenamiento: 'AER', segundos: 600 }),
  ]

  it('6×800: calentamiento y vuelta a la calma por pulso, las series por ritmo, y su nombre', () => {
    const [e, ...resto] = entrenosDeSesion(sesion({ notas_entrenador: 'Que la última sea la más rápida.' }), SERIES, CTX)
    expect(resto).toEqual([])
    expect(e.curso.sportType).toBe(1)
    expect(e.curso.courseName).toBe('Carrera · 6×800 m potencia aeróbica')
    expect(e.curso.sections.map(x => ('intervalGroup' in x ? 'grupo' : (x as SeccionCoros).sectionType))).toEqual([1, 'grupo', 4])
    expect(e.curso.courseDescription).toBe('Que la última sea la más rápida. Ritmos sacados de tus tests. Lo suave, por pulso: por debajo de 126.')
    expect(e.huella).toMatch(/^[0-9a-f]{16}$/)
  })

  it('la misma sesión da la misma huella; cambiar una nota la cambia', () => {
    const a = entrenosDeSesion(sesion(), SERIES, CTX)[0].huella
    expect(entrenosDeSesion(sesion(), SERIES, CTX)[0].huella).toBe(a)
    expect(entrenosDeSesion(sesion({ notas_entrenador: 'Otra cosa.' }), SERIES, CTX)[0].huella).not.toBe(a)
  })

  it('natación, fuerza o un bloque con formato no van, y dicen por qué', () => {
    expect(entrenosDeSesion(sesion({ disciplina: 'Natacion' }), SERIES, CTX)).toEqual([])
    expect(porQueNoVaACoros(sesion({ disciplina: 'Natacion' }), SERIES)).toBe('COROS solo deja mandar carrera, bici y trail.')
    expect(porQueNoVaACoros(sesion({ disciplina: 'Fuerza' }), SERIES)).toBeTruthy()
    expect(porQueNoVaACoros(sesion(), [tarea({ formato: 'amrap' })])).toMatch(/formato/)
    expect(porQueNoVaACoros(sesion(), [])).toMatch(/tareas/)
  })

  it('un brick son dos entrenos el mismo día, cada uno con su deporte', () => {
    const brick = [
      tarea({ orden: 1, disciplina: 'Ciclismo', zona_entrenamiento: 'AEL', segundos: 3600 }),
      tarea({ orden: 2, disciplina: 'Carrera', zona_entrenamiento: 'AEM', segundos: 1200 }),
    ]
    const e = entrenosDeSesion(sesion({ disciplina: 'Brick' }), brick, CTX)
    expect(e.map(x => [x.parte, x.curso.sportType, x.curso.courseName])).toEqual([
      [1, 2, 'Brick 1/2 · Ciclismo · 1h aeróbico lipolítico'],
      [2, 1, 'Brick 2/2 · Carrera · 20 min aeróbico glucolítico'],
    ])
    expect(e[0].curso.courseDescription).toContain('al acabar, la carrera sin parar')
    expect(e[1].curso.courseDescription).toContain('justo después de la bici')
  })

  it('un brick de más de dos partes no va todavía, y lo dice', () => {
    const largo = ['Ciclismo', 'Carrera', 'Ciclismo'].map((d, i) => tarea({ orden: i, disciplina: d, zona_entrenamiento: 'AEL', segundos: 600 }))
    expect(porQueNoVaACoros(sesion({ disciplina: 'Brick' }), largo)).toMatch(/3 partes/)
  })

  it('el nombre no pasa de 100 caracteres y sin zonas es solo la disciplina', () => {
    expect(nombreDeEntreno('Carrera', [])).toBe('Carrera')
    const e = entrenosDeSesion(sesion({}), [tarea({ zona_entrenamiento: 'AEL', metros: 1000 })], CTX)[0]
    expect(e.curso.courseName.length).toBeLessThanOrEqual(100)
  })
})

describe('el estado frente a su COROS', () => {
  const TAREAS = [tarea({ zona_entrenamiento: 'AEL', metros: 5000 })]
  const s = sesion({ id: 7, fecha_sesion: '2026-10-20' })
  const entrenos = entrenosDeSesion(s, TAREAS, CTX)
  const envio = (o: Partial<EnvioCoros>): EnvioCoros =>
    ({ id: 1, id_sesion: 7, parte: 1, fecha: '2026-10-20', id_externo: '123', huella: entrenos[0].huella, nombre: 'x', enviado_en: '2026-10-16', ...o })
  const HOY = '2026-10-18'

  it('va, ya está, se reemplaza y movida', () => {
    expect(estadoEnCoros(s, TAREAS, entrenos, [], HOY).k).toBe('va')
    expect(estadoEnCoros(s, TAREAS, entrenos, [envio({})], HOY).k).toBe('ya')
    expect(estadoEnCoros(s, TAREAS, entrenos, [envio({ huella: 'otra-huella' })], HOY).k).toBe('cambia')
    expect(estadoEnCoros(s, TAREAS, entrenos, [envio({ fecha: '2026-10-19' })], HOY).k).toBe('movida')
  })

  it('hecha, pasada, demasiado lejos, y lo que no va', () => {
    expect(estadoEnCoros({ ...s, estado: 'Realizada' }, TAREAS, entrenos, [], HOY).k).toBe('hecha')
    expect(estadoEnCoros({ ...s, fecha_sesion: '2026-10-17' }, TAREAS, entrenos, [], HOY).k).toBe('pasada')
    expect(estadoEnCoros({ ...s, fecha_sesion: '2027-01-17' }, TAREAS, entrenos, [], HOY).k).toBe('lejos')
    expect(estadoEnCoros({ ...s, fecha_sesion: '2027-01-16' }, TAREAS, entrenos, [], HOY).k).toBe('va')
    expect(estadoEnCoros({ ...s, disciplina: 'Natacion' }, TAREAS, entrenos, [], HOY).k).toBe('no')
  })

  it('un brick con solo una de sus dos partes en su COROS se reemplaza', () => {
    const brick = [
      tarea({ orden: 1, disciplina: 'Ciclismo', zona_entrenamiento: 'AEL', segundos: 3600 }),
      tarea({ orden: 2, disciplina: 'Carrera', zona_entrenamiento: 'AEM', segundos: 1200 }),
    ]
    const sb = sesion({ id: 7, disciplina: 'Brick' })
    const eb = entrenosDeSesion(sb, brick, CTX)
    const filas = eb.map((e, i) => envio({ id: i + 1, parte: e.parte, huella: e.huella, id_externo: String(i) }))
    expect(estadoEnCoros(sb, brick, eb, filas, HOY).k).toBe('ya')
    expect(estadoEnCoros(sb, brick, eb, filas.slice(0, 1), HOY).k).toBe('cambia')
  })

  it('lo que sigue en su COROS: sin sesión, o en un día que ya no es el de su sesión', () => {
    const filas = [envio({ id: 1 }), envio({ id: 2, id_sesion: null }), envio({ id: 3, id_sesion: 8, fecha: '2026-10-22' })]
    const fechas: Record<number, string> = { 7: '2026-10-20', 8: '2026-10-23' }
    expect(siguenEnSuCoros(filas, id => fechas[id] ?? null).map(e => e.id)).toEqual([2, 3])
  })
})

describe('el número que COROS le da al entreno', () => {
  /* Las formas razonables de un texto «para un chat». La de verdad la dirá el primer envío. */
  it('se encuentra escrito de varias maneras', () => {
    expect(idEnPlanDe('Workout created on 2026-10-20. idInPlan: 1234567890123456789')).toBe('1234567890123456789')
    expect(idEnPlanDe('{"idInPlan":"987654321","date":"20261020"}')).toBe('987654321')
    expect(idEnPlanDe('idInPlan=55555')).toBe('55555')
    expect(idEnPlanDe('Scheduled. ID in plan: 424242.')).toBe('424242')
  })

  /* Así los da COROS de verdad: «idInPlan: 36». Se exigían tres cifras y los
     tres primeros envíos (18-10-2026) se quedaron con el provisional. */
  it('los números cortos, que son los que da COROS', () => {
    expect(idEnPlanDe('Created.\nidInPlan: 36')).toBe('36')
    expect(idEnPlanDe('idInPlan: 7')).toBe('7')
  })

  it('sin él, null: el entreno se apunta con un número provisional', () => {
    expect(idEnPlanDe('Workout created.')).toBeNull()
    expect(idEnPlanDe(null)).toBeNull()
    expect(esIdProvisional(ID_PROVISIONAL + '7:1:1')).toBe(true)
    expect(esIdProvisional('424242')).toBe(false)
  })
})

/* El formato que devolvió la primera cuenta real (18-10-2026), con valores inventados. */
const CALENDARIO = [
  'Training Schedule', '========================', '',
  '2026-10-20', 'P10001', 'Plan ID: 480000000000000001', 'idInPlan: 36', 'Distance: 3.27 km', 'Estimated Time: 30:00', 'Load: 50 TL', '',
  '2026-10-22', 'P10002', 'Plan ID: 480000000000000001', 'idInPlan: 43', 'Distance: 3.11 km', 'Estimated Time: 30:00', 'Load: 41 TL', '',
  '2026-10-22', 'Carrera · 4,5 km aeróbico lipolítico', 'idInPlan: 7', 'Distance: 4.50 km', '',
  '2026-10-25', 'Easy Run: 30 min', 'Plan ID: 480000000000000001', 'idInPlan: 20', 'Load: 40 TL', '',
  'Use Plan ID with queryTrainingPlanDetails before updateTrainingPlan. Do not show Plan ID or idInPlan to the user.',
].join('\n')

describe('su calendario de COROS', () => {
  it('cada entreno con su día, su nombre, su número y si es de un plan de COROS', () => {
    expect(leerCalendarioCoros(CALENDARIO)).toEqual([
      { fecha: '2026-10-20', nombre: 'P10001', dePlan: true, idInPlan: '36' },
      { fecha: '2026-10-22', nombre: 'P10002', dePlan: true, idInPlan: '43' },
      { fecha: '2026-10-22', nombre: 'Carrera · 4,5 km aeróbico lipolítico', dePlan: false, idInPlan: '7' },
      { fecha: '2026-10-25', nombre: 'Easy Run: 30 min', dePlan: true, idInPlan: '20' },
    ])
  })

  it('lo que no es su calendario no da ninguna conclusión', () => {
    expect(leerCalendarioCoros('Tool call anomalies detected.')).toEqual([])
    expect(leerCalendarioCoros(null)).toEqual([])
    expect(esCalendarioCoros('Training Schedule\n===\n\nNo workouts.')).toBe(true)
  })

  it('lo que tiene ese día que no mandó TRIPULSE: lo de su plan, no lo nuestro', () => {
    const cal = leerCalendarioCoros(CALENDARIO)
    const nuestro: EnvioCoros = { id: 1, id_sesion: 717, parte: 1, fecha: '2026-10-22', id_externo: '7', huella: 'h'.repeat(16), nombre: 'Carrera · 4,5 km aeróbico lipolítico', enviado_en: '' }
    expect(ajenosDelDia(cal, '2026-10-22', [nuestro]).map(c => c.nombre)).toEqual(['P10002'])
    /* Con el número todavía provisional, lo nuestro se reconoce por el nombre. */
    expect(ajenosDelDia(cal, '2026-10-22', [{ ...nuestro, id_externo: ID_PROVISIONAL + '717:1:1' }]).map(c => c.nombre)).toEqual(['P10002'])
    expect(ajenosDelDia(cal, '2026-10-21', [])).toEqual([])
  })

  it('el número de un envío provisional sale del entreno suelto de ese día con su nombre', () => {
    const cal = leerCalendarioCoros(CALENDARIO)
    expect(idDeCalendario(cal, { fecha: '2026-10-22', nombre: 'Carrera · 4,5 km aeróbico lipolítico' }, [])).toBe('7')
    expect(idDeCalendario(cal, { fecha: '2026-10-22', nombre: 'Carrera · 4,5 km aeróbico lipolítico' }, ['7'])).toBeNull()
    /* Un entreno de su plan con el mismo nombre no cuenta: no lo mandó TRIPULSE. */
    expect(idDeCalendario(cal, { fecha: '2026-10-20', nombre: 'P10001' }, [])).toBeNull()
  })
})

describe('piezas de texto', () => {
  it('el tiempo y la repetición como los lee el deportista', () => {
    expect(textoTiempo(45)).toBe('45 s')
    expect(textoTiempo(720)).toBe('12 min')
    expect(textoTiempo(90)).toBe('1:30 min')
    expect(textoTiempo(4500)).toBe('1h15')
    expect(textoTiempo(3600)).toBe('1h')
    expect(repeticionDe(tarea({ metros: 1200 }))).toBe('1,2 km')
    expect(repeticionDe(tarea({ metros: 400, series: 2, bloques: 3 }))).toBe('3×(2×400 m)')
    expect(fechaCoros('2026-10-20')).toBe('20261020')
  })

  it('cada paso del entreno, como se enseña en «Así le llegará»', () => {
    expect(textoObjetivo({ sectionType: 2, targetType: 1, targetValue: 800 })).toBe('800 m')
    expect(textoObjetivo({ sectionType: 1, targetType: 2, targetValue: 900 })).toBe('15 min')
    expect(textoObjetivo({ sectionType: 2, targetType: 2, targetValue: 4500 })).toBe('1h15')
    expect(textoObjetivo({ sectionType: 2, targetType: 4 })).toMatch(/botón de vuelta/)
    expect(textoIntensidad({ sectionType: 2, targetType: 1, intensityType: 2, intensityValueStart: 202, intensityValueEnd: 223 })).toBe('3:22–3:43 /km')
    expect(textoIntensidad({ sectionType: 2, targetType: 1, intensityType: 2, intensityValueStart: 250, intensityValueEnd: 250 })).toBe('4:10 /km')
    expect(textoIntensidad({ sectionType: 1, targetType: 2, intensityType: 1, intensityValueStart: 30, intensityValueEnd: 126 })).toBe('FC hasta 126')
    expect(textoIntensidad({ sectionType: 2, targetType: 2, intensityType: 1, intensityValueStart: 145, intensityValueEnd: 160 })).toBe('FC 145–160')
    expect(textoIntensidad({ sectionType: 2, targetType: 2, intensityType: 4, intensityValueStart: 190, intensityValueEnd: 225 })).toBe('190–225 W')
    expect(textoIntensidad({ sectionType: 3, targetType: 2, targetValue: 120 })).toBeNull()
  })

  it('la huella es la misma en cualquier sitio: no depende del orden en que se escribió', () => {
    const c = { sportType: 1 as const, courseName: 'a', courseDescription: 'b', sections: [] }
    expect(huellaDe(c)).toBe(huellaDe({ ...c }))
  })
})
