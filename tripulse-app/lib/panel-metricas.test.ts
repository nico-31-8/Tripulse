import { describe, it, expect } from 'vitest'
import { diasDeLaSemanaActual } from './panel-metricas'
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
