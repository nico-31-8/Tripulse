import { describe, it, expect } from 'vitest'
import {
  nochesPorFecha, horasDeMinutos, textoHoras, quePreguntar, objetivosAGuardar, numeroDePreguntas,
  type NocheReloj,
} from './noches-reloj'

const NOCHE: NocheReloj = { dormido_min: 432, rmssd_ms: 48, fc_media: 52 }

describe('nochesPorFecha', () => {
  it('junta el sueño y la recarga del mismo día', () => {
    const r = nochesPorFecha([
      { tipo: 'sueno', fecha: '2026-09-10', datos: { dormido_min: 432 } },
      { tipo: 'recarga', fecha: '2026-09-10', datos: { rmssd_ms: 48, fc_media: 52 } },
      { tipo: 'sueno', fecha: '2026-09-09', datos: { dormido_min: 401 } },
    ])
    expect(r['2026-09-10']).toEqual(NOCHE)
    expect(r['2026-09-09']).toEqual({ dormido_min: 401, rmssd_ms: null, fc_media: null })
  })
  it('los entrenos no cuentan como noches', () => {
    const r = nochesPorFecha([{ tipo: 'entreno', fecha: '2026-09-10', datos: { duracion_min: 60 } }])
    expect(r['2026-09-10']).toEqual({ dormido_min: null, rmssd_ms: null, fc_media: null })
  })
  it('un dato que no es número se queda sin dato, no en cero', () => {
    const r = nochesPorFecha([{ tipo: 'recarga', fecha: '2026-09-10', datos: { rmssd_ms: null, fc_media: 'x' } }])
    expect(r['2026-09-10'].rmssd_ms).toBeNull()
    expect(r['2026-09-10'].fc_media).toBeNull()
  })
  it('sin filas, nada', () => {
    expect(nochesPorFecha(null)).toEqual({})
  })
})

describe('horasDeMinutos y textoHoras', () => {
  it('pasa los minutos del reloj a horas con dos decimales', () => {
    expect(horasDeMinutos(432)).toBe(7.2)
    expect(horasDeMinutos(445)).toBe(7.42)
  })
  it('sin dato o con cero no inventa unas horas', () => {
    expect(horasDeMinutos(null)).toBeNull()
    expect(horasDeMinutos(0)).toBeNull()
  })
  it('lo enseña como «7 h 12»', () => {
    expect(textoHoras(432)).toBe('7 h 12')
    expect(textoHoras(485)).toBe('8 h 05')
    expect(textoHoras(null)).toBe('—')
  })
})

/* LOS TRES CASOS DE LA MAQUETA, con sus cuentas de preguntas: 10, 7 y 8. */
describe('quePreguntar', () => {
  it('sin reloj conectado: todo como siempre — 10 preguntas', () => {
    const q = quePreguntar({ conectado: false, noche: null, mideManana: false })
    expect(q).toEqual({ modo: 'sin_reloj', horas: true, franjaReloj: false, manana: true })
    expect(numeroDePreguntas(q)).toBe(10)
  })

  it('con reloj y la noche recibida: sin horas, sin HRV ni FC — 7 preguntas', () => {
    const q = quePreguntar({ conectado: true, noche: NOCHE, mideManana: false })
    expect(q).toEqual({ modo: 'noche_recibida', horas: false, franjaReloj: true, manana: false })
    expect(numeroDePreguntas(q)).toBe(7)
  })

  it('con reloj y la noche sin llegar: vuelven las horas, solo ese día — 8 preguntas', () => {
    const q = quePreguntar({ conectado: true, noche: null, mideManana: false })
    expect(q).toEqual({ modo: 'noche_pendiente', horas: true, franjaReloj: false, manana: false })
    expect(numeroDePreguntas(q)).toBe(8)
  })

  it('una noche con recarga pero sin sueño cuenta como no llegada', () => {
    const q = quePreguntar({ conectado: true, noche: { dormido_min: null, rmssd_ms: 48, fc_media: 52 }, mideManana: false })
    expect(q.modo).toBe('noche_pendiente')
    expect(q.horas).toBe(true)
  })

  it('la casilla del entrenador devuelve la medición de la mañana: 9 y 10', () => {
    expect(numeroDePreguntas(quePreguntar({ conectado: true, noche: NOCHE, mideManana: true }))).toBe(9)
    expect(numeroDePreguntas(quePreguntar({ conectado: true, noche: null, mideManana: true }))).toBe(10)
  })

  it('sin reloj, la casilla no cambia nada: ya se preguntaba', () => {
    expect(quePreguntar({ conectado: false, noche: null, mideManana: true }).manana).toBe(true)
  })

  it('«Corregir las horas» devuelve el deslizador aunque la noche haya llegado', () => {
    const q = quePreguntar({ conectado: true, noche: NOCHE, mideManana: false, corrigiendo: true })
    expect(q.horas).toBe(true)
    expect(q.franjaReloj).toBe(true)
  })
})

describe('objetivosAGuardar', () => {
  it('sin reloj: lo tecleado, y nada en las columnas de la noche', () => {
    const q = quePreguntar({ conectado: false, noche: null, mideManana: false })
    expect(objetivosAGuardar({ q, noche: null, horasMano: 7.5, hrvMano: '62', fcMano: '49' })).toEqual({
      horas_sueno: 7.5, sueno_del_reloj: false, hrv: 62, fc_reposo: 49, hrv_noche: null, fc_noche: null,
    })
  })

  /* EL CASO NUEVO: las horas y lo nocturno del reloj, y la mañana vacía. */
  it('con la noche recibida: horas del reloj marcadas como tales, y la HRV en su columna', () => {
    const q = quePreguntar({ conectado: true, noche: NOCHE, mideManana: false })
    expect(objetivosAGuardar({ q, noche: NOCHE, horasMano: null, hrvMano: '', fcMano: '' })).toEqual({
      horas_sueno: 7.2, sueno_del_reloj: true, hrv: null, fc_reposo: null, hrv_noche: 48, fc_noche: 52,
    })
  })

  /* Que se cuele un número viejo del estado del formulario sería un dato falso. */
  it('con reloj y sin la casilla, NO guarda una HRV de la mañana aunque quede algo escrito', () => {
    const q = quePreguntar({ conectado: true, noche: NOCHE, mideManana: false })
    const r = objetivosAGuardar({ q, noche: NOCHE, horasMano: null, hrvMano: '70', fcMano: '45' })
    expect(r.hrv).toBeNull()
    expect(r.fc_reposo).toBeNull()
  })

  it('con la casilla: guarda las dos, cada una en su sitio', () => {
    const q = quePreguntar({ conectado: true, noche: NOCHE, mideManana: true })
    const r = objetivosAGuardar({ q, noche: NOCHE, horasMano: null, hrvMano: '62', fcMano: '47' })
    expect(r).toMatchObject({ hrv: 62, fc_reposo: 47, hrv_noche: 48, fc_noche: 52 })
  })

  it('horas corregidas: van las del deslizador y ya no cuentan como del reloj', () => {
    const q = quePreguntar({ conectado: true, noche: NOCHE, mideManana: false, corrigiendo: true })
    const r = objetivosAGuardar({ q, noche: NOCHE, horasMano: 8, hrvMano: '', fcMano: '' })
    expect(r.horas_sueno).toBe(8)
    expect(r.sueno_del_reloj).toBe(false)
    expect(r.hrv_noche).toBe(48)
  })

  it('noche sin llegar: horas a mano, y lo nocturno que haya llegado igualmente', () => {
    const soloRecarga = { dormido_min: null, rmssd_ms: 50, fc_media: 51.6 }
    const q = quePreguntar({ conectado: true, noche: soloRecarga, mideManana: false })
    const r = objetivosAGuardar({ q, noche: soloRecarga, horasMano: 6.5, hrvMano: '', fcMano: '' })
    expect(r).toEqual({ horas_sueno: 6.5, sueno_del_reloj: false, hrv: null, fc_reposo: null, hrv_noche: 50, fc_noche: 52 })
  })

  it('lo tecleado acepta coma decimal y descarta lo que no es un número', () => {
    const q = quePreguntar({ conectado: false, noche: null, mideManana: false })
    expect(objetivosAGuardar({ q, noche: null, horasMano: 7, hrvMano: '52,5', fcMano: 'abc' }))
      .toMatchObject({ hrv: 52.5, fc_reposo: null })
  })

  it('un cero tecleado no es una HRV: se queda sin dato', () => {
    const q = quePreguntar({ conectado: false, noche: null, mideManana: false })
    expect(objetivosAGuardar({ q, noche: null, horasMano: 7, hrvMano: '0', fcMano: '0' }))
      .toMatchObject({ hrv: null, fc_reposo: null })
  })
})
