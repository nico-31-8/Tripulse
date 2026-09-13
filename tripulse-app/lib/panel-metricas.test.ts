import { describe, it, expect } from 'vitest'
import { diasDeLaSemanaActual, cargaActual, serieForma, formaFiable, HISTORIA_MINIMA_FORMA, TAU_ATL, TAU_CTL } from './panel-metricas'
import { sumarDias, indiceDia } from './fechas'
import { calcularCargas, estadoTSB } from './panel-metricas'

describe('calcularCargas', () => {
  it('sin sesiones → array vacío', () => {
    expect(calcularCargas([])).toEqual([])
  })

  it('agrupa por día: dos sesiones el mismo día se suman', () => {
    const r = calcularCargas([
      { fecha_sesion: '2026-07-01', rpe_estimado: 6, duracion_minutos: 60 },
      { fecha_sesion: '2026-07-01', rpe_estimado: 4, duracion_minutos: 30 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].carga).toBe(6 * 60 + 4 * 30)
  })

  it('prioriza rpe_reportado sobre rpe_estimado', () => {
    const r = calcularCargas([{ fecha_sesion: '2026-07-01', rpe_reportado: 8, rpe_estimado: 3, duracion_minutos: 60 }])
    expect(r[0].carga).toBe(8 * 60)
  })

  it('una entrada por día, ordenadas; el TSB del primer día de carga es negativo', () => {
    const r = calcularCargas([
      { fecha_sesion: '2026-07-03', rpe_estimado: 5, duracion_minutos: 60 },
      { fecha_sesion: '2026-07-01', rpe_estimado: 5, duracion_minutos: 60 },
      { fecha_sesion: '2026-07-02', rpe_estimado: 5, duracion_minutos: 60 },
    ])
    expect(r).toHaveLength(3)
    expect(r[0].tsb).toBeLessThan(0) // ATL sube más rápido que CTL
  })
})

describe('estadoTSB', () => {
  it('mapea el TSB a su estado', () => {
    expect(estadoTSB(-40).label).toBe('Sobrecarga')
    expect(estadoTSB(-20).label).toBe('Carga productiva')
    // Estas dos etiquetas cambiaron al unificar las cuatro copias de estadoTSB:
    // aquí ponía «En transición» y «Desentrenando», y las tres copias de pantalla
    // (y el prompt del asistente) decían «Transición» y «Desentrenamiento». Ganó
    // la mayoría, que además es lo que el usuario veía.
    expect(estadoTSB(0).label).toBe('Transición')
    expect(estadoTSB(10).label).toBe('Forma óptima')
    expect(estadoTSB(30).label).toBe('Desentrenamiento')
  })
})

describe('la semana del panel', () => {
  /* EL BUG QUE ESTE TEST HABRÍA CAZADO, y que estuvo VIVO en producción.
     La versión anterior construía un Date local, le hacía setHours(0,0,0,0) y lo
     serializaba con toISOString(). Medianoche local en España son las 22:00 UTC
     del día ANTERIOR, así que el «lunes» salía siendo domingo: la columna L del
     panel enseñaba el domingo y el sábado aparecía marcado como «D · HOY».

     Y lo caro no era la etiqueta: ese lunes alimenta las consultas que traen las
     sesiones de la semana, así que el recuento y el volumen salían contados
     sobre domingo→sábado. */
  it('empieza en LUNES, mire cuando se mire', () => {
    // Un año entero de días, incluidos los dos cambios de hora.
    for (let i = 0; i < 365; i++) {
      const hoy = sumarDias('2026-01-01', i)
      const dias = diasDeLaSemanaActual(hoy)
      expect(indiceDia(dias[0]), 'el primer día de la semana de ' + hoy).toBe(0)
    }
  })

  it('son siete días seguidos', () => {
    const d = diasDeLaSemanaActual('2026-08-22')
    expect(d).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
      '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  /* Si hoy no cayera dentro de su propia semana, «· HOY» se marcaría en la
     columna equivocada — que es exactamente lo que se veía. */
  it('hoy siempre cae dentro de su semana', () => {
    for (let i = 0; i < 365; i++) {
      const hoy = sumarDias('2026-01-01', i)
      expect(diasDeLaSemanaActual(hoy), hoy).toContain(hoy)
    }
  })

  it('el domingo cierra su semana, no abre la siguiente', () => {
    expect(diasDeLaSemanaActual('2026-08-23')[0]).toBe('2026-08-17')
    expect(diasDeLaSemanaActual('2026-08-24')[0]).toBe('2026-08-24')
  })
})

describe('cargaActual', () => {
  const ses = (fecha: string, rpe: number, min: number) =>
    ({ fecha_sesion: fecha, rpe_reportado: rpe, duracion_minutos: min })

  it('sin sesiones no hay estado de forma', () => {
    expect(cargaActual([])).toBeNull()
  })

  /* La condición sube más despacio que la fatiga (43 días contra 8), así que
     tras una sola sesión dura el TSB tiene que ser NEGATIVO. Si saliera positivo,
     las constantes estarían cambiadas y la ficha diría «fresco» el día después
     de una paliza. */
  it('tras una sesión dura, la fatiga manda y el TSB sale negativo', () => {
    const r = cargaActual([ses('2026-08-20', 8, 90)])!
    expect(r.atl).toBeGreaterThan(r.ctl)
    expect(r.tsb).toBeLessThan(0)
  })

  it('dos sesiones el mismo día se suman, no se componen dos veces', () => {
    const juntas = cargaActual([ses('2026-08-20', 5, 60), ses('2026-08-20', 5, 60)])!
    const una = cargaActual([ses('2026-08-20', 5, 120)])!
    expect(juntas.atl).toBe(una.atl)
    expect(juntas.ctl).toBe(una.ctl)
  })

  /* LA RAZÓN DE QUE ESTA FUNCIÓN EXISTA. La ficha del deportista tenía la misma
     EWMA escrita a mano con sus constantes copiadas. Este test las ata a la
     serie que pinta el resto de la app: si divergieran, el mismo atleta tendría
     dos TSB según la pantalla. */
  it('coincide con el último punto de la serie', () => {
    const s = [ses('2026-08-18', 6, 60), ses('2026-08-19', 7, 75), ses('2026-08-20', 5, 45)]
    expect(cargaActual(s)!.tsb).toBe(calcularCargas(s).slice(-1)[0].tsb)
  })

  it('el orden de llegada da igual: manda la fecha', () => {
    const a = cargaActual([ses('2026-08-18', 6, 60), ses('2026-08-20', 9, 120)])!
    const b = cargaActual([ses('2026-08-20', 9, 120), ses('2026-08-18', 6, 60)])!
    expect(a).toEqual(b)
  })
})

describe('serieForma — la curva, en un solo sitio', () => {
  /* Las cuatro copias que había estaban escritas con las constantes a mano.
     Este test las ata: 8 días la fatiga, 43 la condición. Que la fatiga se mueva
     CINCO VECES más rápido es lo que hace que el modelo signifique algo — con
     taus parecidos, el TSB sería siempre ~0 y no diría nada. */
  it('las constantes son las que son', () => {
    expect(TAU_ATL).toBe(8)
    expect(TAU_CTL).toBe(43)
    expect(TAU_CTL / TAU_ATL).toBeGreaterThan(4)
  })

  it('la fatiga sube más rápido que la condición', () => {
    const s = serieForma({ '2026-08-20': 500 })
    expect(s[0].atl).toBeGreaterThan(s[0].ctl)
    expect(s[0].tsb).toBe(s[0].ctl - s[0].atl)
  })

  /* Sin carga nueva, las dos decaen — pero la fatiga mucho antes, y por eso el
     TSB se vuelve POSITIVO tras unos días de descanso. Es justo lo que el
     entrenador mira antes de una carrera. */
  it('descansando, el TSB acaba en positivo', () => {
    const dias: Record<string, number> = { '2026-08-01': 600 }
    for (let i = 2; i <= 20; i++) dias['2026-08-' + String(i).padStart(2, '0')] = 0
    const s = serieForma(dias)
    expect(s[0].tsb).toBeLessThan(0)
    expect(s[s.length - 1].tsb).toBeGreaterThan(0)
  })

  it('el orden lo pone la fecha, no el de las claves', () => {
    const a = serieForma({ '2026-08-20': 100, '2026-08-18': 900 })
    const b = serieForma({ '2026-08-18': 900, '2026-08-20': 100 })
    expect(a).toEqual(b)
    expect(a[0].fecha).toBe('2026-08-18')
  })

  it('sin días no hay serie', () => {
    expect(serieForma({})).toEqual([])
  })

  /* EL FALLO (2026-09-11). Se recorrían solo los días con sesión, así que un
     hueco de cinco días de descanso contaba como uno: la fatiga no bajaba lo que
     tenía que bajar. Con los datos de Bruno, TSB −183 en vez de −93. */
  it('los días de descanso cuentan aunque no vengan en la lista', () => {
    const conHueco = serieForma({ '2026-08-01': 600, '2026-08-06': 0 })
    const explicito = serieForma({ '2026-08-01': 600, '2026-08-02': 0, '2026-08-03': 0, '2026-08-04': 0, '2026-08-05': 0, '2026-08-06': 0 })
    expect(conHueco).toEqual(explicito)
    expect(conHueco).toHaveLength(6)
  })

  it('tras cinco días de descanso la fatiga ha bajado de verdad', () => {
    const s = serieForma({ '2026-08-01': 600, '2026-08-06': 300 })
    // Antes: un solo paso de decaimiento entre el 1 y el 6 → ATL 225 el día 6.
    // Con los cinco días: ATL 111 (150 × 0,75⁵ + 75).
    expect(s[s.length - 1].atl).toBe(111)
  })

  it('`hasta` estira la serie hasta hoy: los días sin entrenar desde la última sesión también cuentan', () => {
    const s = serieForma({ '2026-08-01': 600 }, '2026-08-11')
    expect(s).toHaveLength(11)
    expect(s[s.length - 1].fecha).toBe('2026-08-11')
    expect(s[s.length - 1].atl).toBeLessThan(s[0].atl)
    // Y un `hasta` anterior a la última sesión no recorta nada.
    expect(serieForma({ '2026-08-01': 600, '2026-08-03': 100 }, '2026-08-02')).toHaveLength(3)
  })
})

describe('forma sin base', () => {
  /* La condición es una media de ~42 días que arranca en cero: con menos
     historia, cualquier semana normal sale como sobrecarga. */
  it('hacen falta 42 días de historia', () => {
    expect(HISTORIA_MINIMA_FORMA).toBe(42)
    expect(formaFiable(serieForma({ '2026-08-01': 300 }, '2026-08-20'))).toBe(false)
    expect(formaFiable(serieForma({ '2026-07-01': 300 }, '2026-08-20'))).toBe(true)
  })

  it('cargaActual dice cuántos días lleva y si ya es fiable', () => {
    const c = cargaActual([{ fecha_sesion: '2026-08-01', rpe_reportado: 5, duracion_minutos: 60 }], '2026-08-21')!
    expect(c.dias).toBe(21)
    expect(c.fiable).toBe(false)
  })

  /* Y que las dos caras públicas sigan dando lo mismo que el núcleo: si alguien
     tocara una y no la otra, el mismo atleta tendría dos TSB. */
  it('calcularCargas y cargaActual salen del mismo núcleo', () => {
    const ses = [
      { fecha_sesion: '2026-08-18', rpe_reportado: 6, duracion_minutos: 60 },
      { fecha_sesion: '2026-08-20', rpe_reportado: 8, duracion_minutos: 90 },
    ]
    const serie = calcularCargas(ses)
    expect(cargaActual(ses)!.tsb).toBe(serie[serie.length - 1].tsb)
  })
})
