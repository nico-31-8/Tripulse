import { describe, it, expect } from 'vitest'
import {
  leerIntensidad, desdePorcentaje, intensidadDeTarea, pasosDeTarea, entrenosDeSesion, porQueNoVaACoros,
  estadoEnCoros, siguenEnSuCoros, nombreDeEntreno, huellaDe, repeticionDe, textoTiempo, fechaCoros,
  idEnPlanDe, esIdProvisional, ID_PROVISIONAL, textoObjetivo, textoIntensidad,
  leerCalendarioCoros, esCalendarioCoros, ajenosDelDia, idDeCalendario, ritmoSinUnidad,
  type ContextoCoros, type EnvioCoros, type GrupoCoros, type SeccionCoros, type SesionParaCoros, type PasoCoros,
} from './coros-envio'

/* El primer trabajo de un paso, vaya en grupo o suelto. */
const trabajoDe = (x: PasoCoros): SeccionCoros => ('intervalGroup' in x ? x.sets[0] : x)
/* Un paso en una palabra: «grupo 6», «serie» o «descanso 120». */
const comoSeLee = (x: PasoCoros): string =>
  'intervalGroup' in x ? 'grupo ' + x.repeats : x.sectionType === 3 ? 'descanso ' + x.targetValue : 'serie'

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

  it('una barra de más no lo estropea', () => {
    expect(leerIntensidad('8:50 / /km')).toEqual({ tipo: 'ritmo', min: 530, max: 530 })
  })
})

/* Lo que había en las primeras sesiones mandadas de verdad (18-10-2026): tres de
   cuatro tareas llegaron al reloj sin aviso de ritmo por no llevar «/km». */
describe('el ritmo sin «/km» en carrera', () => {
  const porKm = (min: number, max = min) => ({ leido: { tipo: 'ritmo', min, max }, comoTiempo: false })
  const deSerie = (min: number, max = min) => ({ leido: { tipo: 'ritmo', min, max }, comoTiempo: true })

  it('en un tramo largo es el ritmo por km', () => {
    expect(ritmoSinUnidad('8:30-8:50', 4500)).toEqual(porKm(510, 530))
    expect(ritmoSinUnidad('8:30 – 8:50', 4500)).toEqual(porKm(510, 530))
  })

  it('en una serie corta es el tiempo de la serie, y en un tramo largo el de todo el tramo', () => {
    expect(ritmoSinUnidad('1:20', 400)).toEqual(deSerie(200))
    expect(ritmoSinUnidad('1:18-1:22', 400)).toEqual(deSerie(195, 205))
    expect(ritmoSinUnidad('22:30', 4500)).toEqual(deSerie(300))
  })

  it('en un km las dos lecturas coinciden', () => {
    expect(ritmoSinUnidad('4:00', 1000)).toEqual(porKm(240))
  })

  it('si valen las dos, decide la referencia; sin ella, no se adivina', () => {
    expect(ritmoSinUnidad('7:40-8:10', 1500)).toBeNull()
    expect(ritmoSinUnidad('7:40-8:10', 1500, 530)).toEqual(porKm(460, 490))
    expect(ritmoSinUnidad('3:20', 800, 330)).toEqual(deSerie(250))
    /* A la misma distancia de las dos: no se elige. */
    expect(ritmoSinUnidad('6:00', 2000, 255)).toBeNull()
  })

  it('por tiempo (sin metros), solo como ritmo, y solo si es creíble', () => {
    expect(ritmoSinUnidad('4:30', 0)).toEqual(porKm(270))
    expect(ritmoSinUnidad('0:45', 0)).toBeNull()
    expect(ritmoSinUnidad('< 9:00', 3000)).toEqual({ leido: { tipo: 'ritmo', abierto: '<', valor: 540 }, comoTiempo: false })
  })

  it('lo que no es un m:ss no se toca', () => {
    for (const t of ['5', '5-6', '2:01-2;04', '8:75', 'a tope', '', null]) expect(ritmoSinUnidad(t, 1000, 300), String(t)).toBeNull()
  })

  it('en la tarea: va al reloj; si era el tiempo de la serie, lo escrito queda en la descripción', () => {
    expect(intensidadDeTarea(tarea({ zona_entrenamiento: 'AEL', metros: 4500, arroba: '8:30-8:50' }), 'Carrera', SIN_NADA))
      .toEqual({ campos: { intensityType: 2, intensityValueStart: 510, intensityValueEnd: 530 } })
    expect(intensidadDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 400, series: 8, arroba: '1:20' }), 'Carrera', SIN_NADA))
      .toEqual({ campos: { intensityType: 2, intensityValueStart: 200, intensityValueEnd: 200 }, nota: '1:20' })
    /* Con sus tests decide el ritmo de su zona: 3:20 /km está en su PAE (3:22–3:43). */
    expect(intensidadDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 800, arroba: '3:20' }), 'Carrera', CTX).campos)
      .toEqual({ intensityType: 2, intensityValueStart: 200, intensityValueEnd: 200 })
  })

  it('en bici no: COROS no admite ritmo', () => {
    const r = intensidadDeTarea(tarea({ zona_entrenamiento: 'AEL', segundos: 3600, arroba: '8:30-8:50' }), 'Ciclismo', SIN_NADA)
    expect(r.campos).toBeUndefined()
    expect(r.nota).toBe('8:30-8:50')
  })

  it('sin tests, decide lo que el entrenador escribió con «/km» en la misma sesión', () => {
    const tareas = [
      tarea({ zona_entrenamiento: 'AEL', metros: 1000, arroba: '8:50 / /km' }),
      tarea({ zona_entrenamiento: 'PAE', metros: 1500, series: 2, descanso_segundos: 120, arroba: '7:40-8:10' }),
    ]
    const [e] = entrenosDeSesion(sesion(), tareas, SIN_NADA)
    expect(e.curso.sections[0]).toMatchObject({ intensityType: 2, intensityValueStart: 530, intensityValueEnd: 530 })
    expect(trabajoDe(e.curso.sections[1])).toMatchObject({ intensityType: 2, intensityValueStart: 460, intensityValueEnd: 490 })
    expect(e.curso.courseDescription).not.toContain('7:40')
    /* Sola, sin nada escrito con «/km» al lado, no se adivina. */
    const [solo] = entrenosDeSesion(sesion(), [tareas[1]], SIN_NADA)
    expect(trabajoDe(solo.curso.sections[0]).intensityType).toBeUndefined()
    expect(solo.curso.courseDescription).toContain('7:40-8:10')
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
  it('series con descanso y otra tarea detrás: un grupo con el trabajo y la recuperación, también la de la última', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 800, series: 6, descanso_segundos: 120 }), 'Carrera', CTX, 2, true)
    expect(p.pasos).toEqual([{
      intervalGroup: true, repeats: 6, sets: [
        { sectionType: 2, targetType: 1, targetValue: 800, intensityType: 2, intensityValueStart: 202, intensityValueEnd: 223 },
        { sectionType: 3, targetType: 2, targetValue: 120 },
      ],
    }])
  })

  /* La misma regla que la duración (lib/bloques-tarea: descansoFinalDe): al
     final del entreno no se descansa. Antes el grupo dejaba 2:00 sueltos al
     acabar, que la app no contaba. */
  it('la última tarea del entreno no deja un descanso suelto al final', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 800, series: 6, descanso_segundos: 120 }), 'Carrera', CTX, 2, false)
    expect(p.pasos.map(comoSeLee)).toEqual(['grupo 5', 'serie'])
    expect(trabajoDe(p.pasos[1])).toMatchObject({ sectionType: 2, targetValue: 800, intensityValueStart: 202 })
  })

  /* Lo que pidió el entrenador el 24-10-2026: el 3:00 de detrás de un 3.000 no
     llegaba al reloj, porque una serie sola nunca llevaba descanso. */
  it('una serie sola con descanso: el descanso va detrás si viene otra tarea, y al final no', () => {
    const tresMil = () => tarea({ zona_entrenamiento: 'AEI', metros: 3000, descanso_segundos: 180 })
    expect(pasosDeTarea(tresMil(), 'Carrera', CTX, 2, true).pasos.map(comoSeLee)).toEqual(['serie', 'descanso 180'])
    expect(pasosDeTarea(tresMil(), 'Carrera', CTX, 2, false).pasos.map(comoSeLee)).toEqual(['serie'])
  })

  it('más de 20 repeticiones: en grupos de 20 seguidos', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'AEI', metros: 200, series: 25, descanso_segundos: 30 }), 'Carrera', CTX, 2, true)
    expect(p.pasos.map(x => (x as GrupoCoros).repeats)).toEqual([20, 5])
  })

  /* Entre bloques, UN descanso: el largo. Antes cada bloque era un grupo con el
     corto dentro, y entre bloques se descansaba 1:00 + 3:00, cuando la duración
     de la app contaba solo los 3:00 (descansoTotalDe). */
  it('3 × (2 × 400): desplegado, con el descanso largo entre bloques y sin el corto delante', () => {
    const t = () => tarea({ zona_entrenamiento: 'PAE', metros: 400, series: 2, bloques: 3, descanso_segundos: 60, descanso_bloques_segundos: 180 })
    const bloque = ['serie', 'descanso 60', 'serie']
    expect(pasosDeTarea(t(), 'Carrera', CTX, 2, false).pasos.map(comoSeLee))
      .toEqual([...bloque, 'descanso 180', ...bloque, 'descanso 180', ...bloque])
    /* Con otra tarea detrás, el del último bloque es el paso a la siguiente: el largo. */
    expect(pasosDeTarea(t(), 'Carrera', CTX, 2, true).pasos.map(comoSeLee))
      .toEqual([...bloque, 'descanso 180', ...bloque, 'descanso 180', ...bloque, 'descanso 180'])
  })

  it('sin metros ni tiempo, una sección libre (se acaba con el botón de vuelta)', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'AEL' }), 'Carrera', CTX, 2, false)
    expect(p.pasos[0]).toMatchObject({ sectionType: 2, targetType: 4 })
    expect((p.pasos[0] as SeccionCoros).targetValue).toBeUndefined()
  })

  it('el comentario de la tarea va a la descripción con su repetición', () => {
    const p = pasosDeTarea(tarea({ zona_entrenamiento: 'PAE', metros: 200, series: 4, comentario: 'A tope' }), 'Carrera', CTX, 2, false)
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

/* El formato que devolvió la primera cuenta real (18-10-2026), con valores
   inventados. Lo mandado desde TRIPULSE lleva la marca de entreno suelto. */
const SUELTO = 'Standalone workout (scheduled from the workout library)'
const CALENDARIO = [
  'Training Schedule', '========================', '',
  '2026-10-20', 'P10001', 'Plan ID: 480000000000000001', 'idInPlan: 36', 'Distance: 3.27 km', 'Estimated Time: 30:00', 'Load: 50 TL', '',
  '2026-10-22', 'P10002', 'Plan ID: 480000000000000001', 'idInPlan: 43', 'Distance: 3.11 km', 'Estimated Time: 30:00', 'Load: 41 TL', '',
  '2026-10-22', 'Carrera · 4,5 km aeróbico lipolítico', SUELTO, 'idInPlan: 7', 'Distance: 4.50 km', '',
  '2026-10-24', 'Carrera · 2×1,5 km potencia aeróbica', SUELTO, 'idInPlan: 8', 'Distance: 6.00 km', '',
  '2026-10-25', 'Easy Run: 30 min', 'Plan ID: 480000000000000001', 'idInPlan: 20', 'Load: 40 TL', '',
  'Use Plan ID with queryTrainingPlanDetails before updateTrainingPlan. Do not show Plan ID or idInPlan to the user.',
].join('\n')

/* Por si COROS da la marca en lugar del nombre: así no se ha visto, pero no se descarta. */
const CALENDARIO_SIN_NOMBRE = [
  'Training Schedule', '========================', '',
  '2026-10-22', 'P10002', 'Plan ID: 480000000000000001', 'idInPlan: 43', 'Load: 41 TL',
  SUELTO, 'idInPlan: 7', 'Distance: 4.50 km', '',
  '2026-10-24', SUELTO, 'idInPlan: 8', '',
  '2026-10-24', SUELTO, 'idInPlan: 9', '',
].join('\n')

const envio = (fecha: string, id_externo: string, nombre: string): EnvioCoros =>
  ({ id: 1, id_sesion: 717, parte: 1, fecha, id_externo, huella: 'h'.repeat(16), nombre, enviado_en: '' })

describe('su calendario de COROS', () => {
  it('cada entreno con su día, su nombre, su número y si es de un plan de COROS', () => {
    expect(leerCalendarioCoros(CALENDARIO)).toEqual([
      { fecha: '2026-10-20', nombre: 'P10001', dePlan: true, idInPlan: '36' },
      { fecha: '2026-10-22', nombre: 'P10002', dePlan: true, idInPlan: '43' },
      { fecha: '2026-10-22', nombre: 'Carrera · 4,5 km aeróbico lipolítico', dePlan: false, idInPlan: '7' },
      { fecha: '2026-10-24', nombre: 'Carrera · 2×1,5 km potencia aeróbica', dePlan: false, idInPlan: '8' },
      { fecha: '2026-10-25', nombre: 'Easy Run: 30 min', dePlan: true, idInPlan: '20' },
    ])
  })

  /* La ventana del 18-10-2026 daba «Standalone workout (…)» como un entreno
     ajeno los tres días que se le había mandado algo. */
  it('la marca de entreno suelto nunca es el nombre de otro entreno', () => {
    const nombres = leerCalendarioCoros(CALENDARIO).map(c => c.nombre)
    expect(nombres.some(n => /standalone/i.test(n))).toBe(false)
    expect(leerCalendarioCoros(CALENDARIO_SIN_NOMBRE)).toEqual([
      { fecha: '2026-10-22', nombre: 'P10002', dePlan: true, idInPlan: '43' },
      { fecha: '2026-10-22', nombre: '', dePlan: false, idInPlan: '7' },
      { fecha: '2026-10-24', nombre: '', dePlan: false, idInPlan: '8' },
      { fecha: '2026-10-24', nombre: '', dePlan: false, idInPlan: '9' },
    ])
  })

  it('lo que no es su calendario no da ninguna conclusión', () => {
    expect(leerCalendarioCoros('Tool call anomalies detected.')).toEqual([])
    expect(leerCalendarioCoros(null)).toEqual([])
    expect(esCalendarioCoros('Training Schedule\n===\n\nNo workouts.')).toBe(true)
  })

  it('lo que tiene ese día que no mandó TRIPULSE: lo de su plan, no lo nuestro', () => {
    const cal = leerCalendarioCoros(CALENDARIO)
    const nuestro = envio('2026-10-22', '7', 'Carrera · 4,5 km aeróbico lipolítico')
    expect(ajenosDelDia(cal, '2026-10-22', [nuestro]).map(c => c.nombre)).toEqual(['P10002'])
    /* Con el número todavía provisional, lo nuestro se reconoce por el nombre. */
    const provisional = { ...nuestro, id_externo: ID_PROVISIONAL + '717:1:1' }
    expect(ajenosDelDia(cal, '2026-10-22', [provisional]).map(c => c.nombre)).toEqual(['P10002'])
    expect(ajenosDelDia(cal, '2026-10-24', [envio('2026-10-24', ID_PROVISIONAL + '718:1:1', 'Carrera · 2×1,5 km potencia aeróbica')])).toEqual([])
    expect(ajenosDelDia(cal, '2026-10-21', [])).toEqual([])
    /* Aunque COROS lo devuelva con otras mayúsculas o sin tildes. */
    expect(ajenosDelDia(cal, '2026-10-22', [{ ...provisional, nombre: 'CARRERA · 4,5 km aerobico lipolitico' }]).map(c => c.nombre)).toEqual(['P10002'])
  })

  it('un entreno de su plan con el mismo número que uno nuestro sigue siendo suyo', () => {
    const cal = leerCalendarioCoros(CALENDARIO)
    expect(ajenosDelDia(cal, '2026-10-22', [envio('2026-10-22', '43', 'Otro')]).map(c => c.nombre))
      .toEqual(['P10002', 'Carrera · 4,5 km aeróbico lipolítico'])
  })

  it('sin nombre, los sueltos son nuestros solo si cuadran con los provisionales de ese día', () => {
    const cal = leerCalendarioCoros(CALENDARIO_SIN_NOMBRE)
    const prov = (fecha: string, n: number) => envio(fecha, ID_PROVISIONAL + n + ':1:1', 'Carrera · ' + n)
    expect(ajenosDelDia(cal, '2026-10-22', [prov('2026-10-22', 717)]).map(c => c.idInPlan)).toEqual(['43'])
    /* Dos sueltos y uno nuestro: no se sabe cuál es, y se dicen los dos. */
    expect(ajenosDelDia(cal, '2026-10-24', [prov('2026-10-24', 718)]).map(c => c.idInPlan)).toEqual(['8', '9'])
    expect(ajenosDelDia(cal, '2026-10-24', [prov('2026-10-24', 718), { ...prov('2026-10-24', 719), parte: 2 }])).toEqual([])
    /* Uno nuestro con su número que ya no está no se queda con uno sin nombre. */
    expect(ajenosDelDia(cal, '2026-10-22', [envio('2026-10-22', '99', 'Carrera')]).map(c => c.idInPlan)).toEqual(['43', '7'])
  })

  it('el número de un envío provisional sale del entreno suelto de ese día con su nombre', () => {
    const cal = leerCalendarioCoros(CALENDARIO)
    expect(idDeCalendario(cal, { fecha: '2026-10-22', nombre: 'Carrera · 4,5 km aeróbico lipolítico' }, [])).toBe('7')
    expect(idDeCalendario(cal, { fecha: '2026-10-22', nombre: 'Carrera · 4,5 km aeróbico lipolítico' }, ['7'])).toBeNull()
    expect(idDeCalendario(cal, { fecha: '2026-10-24', nombre: 'carrera · 2×1,5 km potencia aerobica' }, [])).toBe('8')
    /* Un entreno de su plan con el mismo nombre no cuenta: no lo mandó TRIPULSE. */
    expect(idDeCalendario(cal, { fecha: '2026-10-20', nombre: 'P10001' }, [])).toBeNull()
    /* Sin nombre no se adivina: podría ser uno suyo. */
    expect(idDeCalendario(leerCalendarioCoros(CALENDARIO_SIN_NOMBRE), { fecha: '2026-10-22', nombre: 'Carrera · 4,5 km aeróbico lipolítico' }, [])).toBeNull()
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
