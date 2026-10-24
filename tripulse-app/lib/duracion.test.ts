import { describe, it, expect } from 'vitest'
import { calcularDuracionEstimada, medirDuracion, tramosDeSesion, TOPE_TAREA_SEG, type TareaDuracion, type TestsDeportista, type TramoSesion } from './duracion'

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

  it('carrera por distancia sin VAM → se estima prestada, y marca faltanTests', () => {
    /* Ya no se descarta: se estima con el ritmo de referencia y se confiesa.
       `faltanTests` sigue en alto porque el test sigue haciendo falta — lo que
       cambia no es que sobre, es que mientras no esté se da un número
       aproximado en vez de un cero que decía que la sesión no cuesta nada. */
    const t: TareaDuracion = { disciplina: 'Carrera', series: 1, p_distancia: [{ metros_planeados: 5000 }] }
    const r = calcularDuracionEstimada([t], {})
    expect(r.faltanTests).toBe(true)
    expect(r.estimable).toBe(true)
    expect(r.usoReferencia).toBe(true)
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

describe('el ritmo de referencia cuando falta el test', () => {
  const mil = (disc: string) => ([{
    disciplina: disc, series: 1, zona_entrenamiento: 'Z2',
    p_distancia: [{ metros_planeados: 1000 }],
  }])

  it('ENCENDIDO por defecto, y SIEMPRE confesado', () => {
    /* Esto estaba al revés, y el test de antes decía: «si alguien invierte el
       valor por defecto, aquí salta — aparecerían duraciones en la pantalla
       del deportista y en el cálculo de nutrición sin que nadie lo haya
       decidido». Saltó, y la decisión la tomó el entrenador el 4 de octubre de
       2026: que se encienda en todas.

       EL MOTIVO, que es el que hay que conservar: estando solo en el dibujo,
       el mismo dato salía contado de dos maneras —una semana de carrera por
       distancia de un atleta sin tests tenía barra en el dibujo y ninguna
       duración en la ficha—, y eso hace desconfiar de todos los números.

       LO QUE SIGUE SIENDO INNEGOCIABLE es la segunda mitad: estimar sin
       confesarlo convierte una suposición en un dato. Por eso aquí se
       comprueban las dos cosas a la vez. */
    const r = calcularDuracionEstimada(mil('Carrera'), { sexo: 'Hombre' })
    expect(r.estimable).toBe(true)
    expect(r.minutos).toBeGreaterThan(0)
    expect(r.usoReferencia).toBe(true)
    expect(r.faltanTests).toBe(true)
  })

  it('y se puede apagar a propósito, para quien no quiera suposiciones', () => {
    const r = calcularDuracionEstimada(mil('Carrera'), { sexo: 'Hombre' }, { conReferencia: false })
    expect(r.estimable).toBe(false)
    expect(r.minutos).toBe(0)
    expect(r.usoReferencia).toBe(false)
  })

  it('CON TEST NO SE PRESTA NADA: el ritmo es el suyo y no se marca', () => {
    /* La confesión tiene que distinguir: un número sacado de SU test es tan
       bueno como uno cronometrado, y marcarlo igual que el prestado haría que
       se ignorasen los dos. */
    const r = calcularDuracionEstimada(mil('Carrera'), { vam: 16, sexo: 'Hombre' })
    expect(r.estimable).toBe(true)
    expect(r.usoReferencia).toBe(false)
    expect(r.faltanTests).toBe(false)
  })

  it('encendido, estima y lo confiesa', () => {
    const r = calcularDuracionEstimada(mil('Carrera'), { sexo: 'Hombre' }, { conReferencia: true })
    expect(r.estimable).toBe(true)
    expect(r.minutos).toBeGreaterThan(0)
    expect(r.usoReferencia).toBe(true)
    /* Sigue marcando que faltan tests: la estimación no sustituye al test, solo
       evita el cero. */
    expect(r.faltanTests).toBe(true)
  })

  it('con el test de la persona NO se marca como referencia', () => {
    const r = calcularDuracionEstimada(mil('Carrera'), { vam: 15 }, { conReferencia: true })
    expect(r.usoReferencia).toBe(false)
    expect(r.faltanTests).toBe(false)
  })

  it('el test de la persona MANDA sobre la referencia', () => {
    /* Si la referencia pisara al test, un atleta con VAM medida vería sus
       duraciones calculadas con la media de la población. */
    const suyo = calcularDuracionEstimada(mil('Carrera'), { vam: 20 }, { conReferencia: true })
    const ref = calcularDuracionEstimada(mil('Carrera'), { sexo: 'Hombre' }, { conReferencia: true })
    expect(suyo.segundos).toBeLessThan(ref.segundos)
  })

  it('un kilómetro en Z2 sale en un tiempo de persona, no de coche ni de tortuga', () => {
    /* Guarda de cordura sobre la unidad: si la VAM se metiera en m/s en vez de
       km/h, o el CSS al revés, aquí saldría algo absurdo y nada más fallaría. */
    const r = calcularDuracionEstimada(mil('Carrera'), { sexo: 'Hombre' }, { conReferencia: true })
    expect(r.minutos).toBeGreaterThan(4)
    expect(r.minutos).toBeLessThan(12)
  })

  it('natación también, y con su unidad', () => {
    const r = calcularDuracionEstimada(mil('Natacion'), { sexo: 'Mujer' }, { conReferencia: true })
    expect(r.usoReferencia).toBe(true)
    /* Mil metros nadando: entre un cuarto de hora y una hora larga. */
    expect(r.minutos).toBeGreaterThan(14)
    expect(r.minutos).toBeLessThan(70)
  })

  it('el CICLISMO por distancia sigue sin estimarse, ni con el interruptor', () => {
    /* Y es a propósito: en bici la velocidad depende del desnivel, del viento y
       de si va en grupo mucho más que del FTP. Suponer una media no sería
       aproximar, sería inventar. */
    const r = calcularDuracionEstimada(mil('Ciclismo'), { ftp: 250 }, { conReferencia: true })
    expect(r.estimable).toBe(false)
    expect(r.usoReferencia).toBe(false)
    expect(r.avisoCiclismo).toBe(true)
  })

  it('sin sexo declarado también estima', () => {
    /* «Prefiero no decirlo» no puede dejar al atleta sin gráfica. */
    const r = calcularDuracionEstimada(mil('Carrera'), { sexo: 'Prefiero no decirlo' }, { conReferencia: true })
    expect(r.estimable).toBe(true)
    expect(r.usoReferencia).toBe(true)
  })

  it('la fuerza nunca usa referencia: no la necesita', () => {
    const r = calcularDuracionEstimada([{
      disciplina: 'Fuerza', series: 3, ejercicios: [{ repeticiones: 10 }],
    }], {}, { conReferencia: true })
    expect(r.estimable).toBe(true)
    expect(r.usoReferencia).toBe(false)
  })
})

/* EL CASO QUE LO TRAJO (15-10-2026). Una sesión de carrera con «4 × 1.000.000 m»
   —1.000 km por serie; se quería poner 1.000 m— se estimaba en ~240 horas, y a
   RPE 8 dejaba la barra de su semana en el lienzo en 134.359 con las de al lado
   en 1.500. Una tarea así no se suma: se avisa. */
describe('una tarea imposible no se suma', () => {
  const calentamiento: TareaDuracion = { disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL', p_distancia: [{ metros_planeados: 1200 }] }
  const milKm: TareaDuracion = { disciplina: 'Carrera', series: 4, zona_entrenamiento: 'PAE', p_distancia: [{ metros_planeados: 1_000_000 }] }

  it('4 × 1.000 km de carrera: no cuenta, y lo dice', () => {
    const solo = calcularDuracionEstimada([calentamiento], tests)
    const r = calcularDuracionEstimada([calentamiento, milKm], tests)
    expect(r.datoImposible).toBe(true)
    expect(r.segundos).toBe(solo.segundos)        // lo demás de la sesión sigue contando
    expect(r.estimable).toBe(true)
    expect(r.minutos).toBeLessThan(30)
  })

  it('si todo lo que tiene es imposible, queda sin estimar y avisada, no a cero callado', () => {
    const r = calcularDuracionEstimada([milKm], tests)
    expect(r.estimable).toBe(false)
    expect(r.datoImposible).toBe(true)
  })

  it('una sesión normal no se marca', () => {
    expect(calcularDuracionEstimada([calentamiento], tests).datoImposible).toBe(false)
  })

  /* El tope es UN DÍA, no una sesión larga: un fondo de 40 km o una tirada de
     seis horas en bici por tiempo siguen contando enteros. */
  it('lo largo pero posible sigue contando', () => {
    const fondo: TareaDuracion = { disciplina: 'Carrera', series: 1, zona_entrenamiento: 'AEL', p_distancia: [{ metros_planeados: 40_000 }] }
    const tirada: TareaDuracion = { disciplina: 'Ciclismo', series: 1, p_duracion: [{ tiempo_planeado: 6 * 3600 }] }
    const r = calcularDuracionEstimada([fondo, tirada], tests)
    expect(r.datoImposible).toBe(false)
    expect(r.segundos).toBeGreaterThan(6 * 3600)
  })

  it('vale igual para la fuerza: 10.000 repeticiones por serie no son una sesión', () => {
    const t: TareaDuracion = { disciplina: 'Fuerza', series: 4, ejercicios: [{ repeticiones: 10_000 }] }
    const r = calcularDuracionEstimada([t], tests)
    expect(r.datoImposible).toBe(true)
    expect(r.estimable).toBe(false)
  })

  it('el tope es un día entero', () => {
    expect(TOPE_TAREA_SEG).toBe(86_400)
  })
})

// ============================================================
// La sesión en el tiempo (la gráfica de la sesión)
// ============================================================

describe('tramosDeSesion', () => {
  const vam = { vam: 20, css: 1.4 }
  const carrera = (series: number, metros: number, descanso: number | null, extra: Partial<TareaDuracion> = {}): TareaDuracion =>
    ({ disciplina: 'Carrera', zona_entrenamiento: 'CLA', series, descanso_segundos: descanso, p_distancia: [{ metros_planeados: metros }], ...extra })
  const fuerza = (): TareaDuracion => ({ disciplina: 'Fuerza', series: 3, descanso_segundos: 90, ejercicios: [{ repeticiones: 8 }] })
  const suma = (tr: TramoSesion[]) => tr.filter(x => !x.supuesto).reduce((s, x) => s + x.segundos, 0)
  const comoSeLee = (tr: TramoSesion[]) => tr.map(x => (x.tipo === 'trabajo' ? 'serie' : x.cual + ' ' + x.segundos))

  /* LA GARANTÍA: la gráfica y la cabecera de la sesión no pueden dar dos
     duraciones distintas. Antes la gráfica tenía su propia cuenta (una serie de
     cada tarea, ritmo de tabla, sin descansos) y decía 29 minutos donde la
     cabecera decía 26. */
  it.each([
    ['series y un 3.000', [carrera(3, 400, 120), carrera(1, 3000, 180, { zona_entrenamiento: 'AEI' }), carrera(2, 400, 120)]],
    ['en bloques', [carrera(2, 400, 60, { bloques: 3, descanso_bloques_segundos: 180 }), carrera(1, 2000, null, { zona_entrenamiento: 'AEL' })]],
    ['por tiempo, en bici', [{ disciplina: 'Ciclismo', zona_entrenamiento: 'AEM', series: 4, descanso_segundos: 120, p_duracion: [{ tiempo_planeado: 480 }] }]],
    ['natación', [{ disciplina: 'Natacion', zona_entrenamiento: 'AEI', series: 8, descanso_segundos: 20, p_distancia: [{ metros_planeados: 100 }] }]],
    ['fuerza con carrera detrás', [fuerza(), fuerza(), carrera(4, 200, 60)]],
    ['un AMRAP entre medias', [fuerza(), { disciplina: 'Hibrido', formato: 'amrap', formato_config: { minutos: 12 }, ejercicios: [{ repeticiones: 10 }] }, fuerza()]],
  ] as [string, TareaDuracion[]][])('%s: suma lo mismo que la duración', (_, tareas) => {
    expect(suma(tramosDeSesion(tareas, vam))).toBeCloseTo(calcularDuracionEstimada(tareas, vam).segundos, 6)
  })

  it('cada descanso en su sitio: entre series, detrás de la última si viene otra, y al final nada', () => {
    const tr = tramosDeSesion([carrera(3, 400, 120), carrera(1, 3000, 180), carrera(2, 400, 120)], vam)
    expect(comoSeLee(tr)).toEqual([
      'serie', 'entre 120', 'serie', 'entre 120', 'serie', 'final 120',
      'serie', 'final 180',
      'serie', 'entre 120', 'serie',
    ])
  })

  it('en bloques: el largo entre bloques y, detrás del último, el paso a la siguiente', () => {
    const tr = tramosDeSesion([carrera(2, 400, 60, { bloques: 2, descanso_bloques_segundos: 180 }), carrera(1, 1000, null)], vam)
    expect(comoSeLee(tr)).toEqual(['serie', 'entre 60', 'serie', 'bloque 180', 'serie', 'entre 60', 'serie', 'final 180', 'serie'])
  })

  it('en fuerza, el cambio de ejercicio entre tareas y ningún descanso detrás de la última serie', () => {
    const tr = tramosDeSesion([fuerza(), fuerza()], {})
    expect(comoSeLee(tr)).toEqual(['serie', 'entre 90', 'serie', 'entre 90', 'serie', 'cambio 90', 'serie', 'entre 90', 'serie', 'entre 90', 'serie'])
  })

  it('va en el orden de la sesión aunque las tareas lleguen desordenadas', () => {
    const tr = tramosDeSesion([carrera(1, 3000, 180, { orden: 2 }), carrera(2, 400, 120, { orden: 1 })], vam)
    expect(tr.map(x => x.tarea)).toEqual([1, 1, 1, 1, 0])
    expect(comoSeLee(tr)).toEqual(['serie', 'entre 120', 'serie', 'final 120', 'serie'])
  })

  /* La bici por distancia no se puede pasar a minutos (lib/duracion lo explica):
     se dibuja con un ancho orientativo, marcado, y no suma. */
  it('lo que no se puede estimar va marcado y no suma', () => {
    const bici: TareaDuracion = { disciplina: 'Ciclismo', zona_entrenamiento: 'AEL', series: 1, p_distancia: [{ metros_planeados: 40000 }] }
    const tareas = [carrera(2, 400, 60), bici]
    const tr = tramosDeSesion(tareas, vam)
    expect(tr.filter(x => x.tarea === 1).every(x => x.supuesto)).toBe(true)
    expect(tr.filter(x => x.tarea === 1)[0].segundos).toBeGreaterThan(0)
    expect(suma(tr)).toBeCloseTo(calcularDuracionEstimada(tareas, vam).segundos, 6)
  })
})
