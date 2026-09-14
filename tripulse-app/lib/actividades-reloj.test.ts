import { describe, it, expect } from 'vitest'
import {
  actividadDeMedicion, actividadesDeMediciones, horaDe, nombreDeporte,
  distanciaTexto, ritmoTexto, totales, type FilaMedicion,
} from './actividades-reloj'

/** Una fila tal como la escribe `medicionDeEntreno` (lib/polar). */
const fila = (datos: Record<string, unknown> = {}, o: Partial<FilaMedicion> = {}): FilaMedicion => ({
  id: 1, proveedor: 'polar', fecha: '2026-09-12', id_externo: 'abc',
  datos: {
    inicio: '2026-09-12T07:12:31.000', desfase_utc_min: 120, duracion_min: 62,
    disciplina: 'Carrera', deporte: 'RUNNING', deporte_detalle: 'TRAIL_RUNNING',
    fc_media: 148, fc_max: 176, distancia_m: 12400, calorias: 720, carga_polar: 187,
    ...datos,
  },
  ...o,
})

describe('traducir lo que manda el reloj', () => {
  it('una fila de Polar entera', () => {
    expect(actividadDeMedicion(fila())).toEqual({
      id: 1, proveedor: 'polar', fecha: '2026-09-12', hora: '07:12',
      disciplina: 'Carrera', deporte: 'TRAIL_RUNNING', minutos: 62, metros: 12400,
      fcMedia: 148, fcMax: 176, calorias: 720, cargaDelReloj: 187,
    })
  })

  it('sin fecha no hay actividad', () => {
    expect(actividadDeMedicion(fila({}, { fecha: null }))).toBeNull()
    expect(actividadDeMedicion({ id: 1, fecha: '2026-09-12' })).not.toBeNull()
  })

  it('lo que falta se queda en null, no en cero', () => {
    const a = actividadDeMedicion(fila({ distancia_m: null, fc_media: undefined, calorias: 0 }))!
    expect(a.metros).toBeNull()
    expect(a.fcMedia).toBeNull()
    /* Cero calorías no es «quemó cero»: es que no vino. */
    expect(a.calorias).toBeNull()
  })

  it('un número que llega como texto se entiende', () => {
    const a = actividadDeMedicion(fila({ fc_media: '148', distancia_m: '12400.5' }))!
    expect(a.fcMedia).toBe(148)
    expect(a.metros).toBe(12400.5)
  })

  it('lo que no es un número no se cuela', () => {
    const a = actividadDeMedicion(fila({ fc_media: 'sin datos', duracion_min: NaN }))!
    expect(a.fcMedia).toBeNull()
    expect(a.minutos).toBeNull()
  })

  it('una disciplina que no es de las nuestras no se fuerza', () => {
    /* Un triatlón del reloj no es Carrera: se queda sin disciplina y se dice. */
    const a = actividadDeMedicion(fila({ disciplina: 'Triatlon', deporte: 'TRIATHLON', deporte_detalle: null }))!
    expect(a.disciplina).toBeNull()
    expect(a.deporte).toBe('TRIATHLON')
  })

  it('sin datos ninguno, sigue habiendo actividad', () => {
    const a = actividadDeMedicion({ id: 7, fecha: '2026-09-12', proveedor: 'coros' })!
    expect(a).toMatchObject({ id: 7, proveedor: 'coros', hora: null, disciplina: null, minutos: null })
  })

  it('la carga vale llamarse como la llame la marca', () => {
    expect(actividadDeMedicion(fila({ carga_polar: null, carga: 55 }))!.cargaDelReloj).toBe(55)
  })
})

describe('ordenar', () => {
  it('lo más reciente primero, y dentro del día la hora manda', () => {
    const as = actividadesDeMediciones([
      fila({ inicio: '2026-09-12T07:00:00' }, { id: 1 }),
      fila({}, { id: 2, fecha: '2026-09-14' }),
      fila({ inicio: '2026-09-12T19:00:00' }, { id: 3 }),
    ])
    expect(as.map(a => a.id)).toEqual([2, 3, 1])
  })

  it('las que no se entienden se caen sin tirar la lista', () => {
    expect(actividadesDeMediciones([fila(), { id: 2 }, fila({}, { id: 3 })]).length).toBe(2)
  })
})

describe('cómo se lee', () => {
  it('la hora sale del inicio, que viene en su hora local', () => {
    expect(horaDe('2026-09-12T07:12:31.000')).toBe('07:12')
    expect(horaDe('2026-09-12')).toBeNull()
    expect(horaDe(null)).toBeNull()
  })

  it('el reloj grita y aquí no', () => {
    expect(nombreDeporte('ROAD_BIKING')).toBe('Road biking')
    expect(nombreDeporte(null)).toBeNull()
  })

  it('en natación, metros; en el resto, kilómetros', () => {
    /* Sin punto en los millares de cuatro cifras: es la norma en español, y es
       lo que hace `toLocaleString('es-ES')`. Con cinco ya lo pone. */
    expect(distanciaTexto(1900, 'Natacion')).toBe('1900 m')
    expect(distanciaTexto(25000, 'Natacion')).toBe('25.000 m')
    expect(distanciaTexto(12400, 'Carrera')).toBe('12,4 km')
    expect(distanciaTexto(800, 'Carrera')).toBe('800 m')
    expect(distanciaTexto(null)).toBe('—')
  })

  it('el ritmo se lee como se lee en cada deporte', () => {
    expect(ritmoTexto({ minutos: 50, metros: 10000, disciplina: 'Carrera' })).toBe('5:00 /km')
    expect(ritmoTexto({ minutos: 30, metros: 1500, disciplina: 'Natacion' })).toBe('2:00 /100 m')
    expect(ritmoTexto({ minutos: 60, metros: 30000, disciplina: 'Ciclismo' })).toBe('30,0 km/h')
  })

  it('sin distancia no hay ritmo inventado', () => {
    expect(ritmoTexto({ minutos: 60, metros: null, disciplina: 'Carrera' })).toBeNull()
    expect(ritmoTexto({ minutos: null, metros: 10000, disciplina: 'Carrera' })).toBeNull()
  })
})

describe('totales', () => {
  it('suma lo que hay y cuenta lo que no se pudo clasificar', () => {
    const as = actividadesDeMediciones([
      fila({ duracion_min: 60, distancia_m: 10000 }, { id: 1 }),
      fila({ duracion_min: 30, distancia_m: null, disciplina: 'Triatlon' }, { id: 2 }),
    ])
    expect(totales(as)).toEqual({ actividades: 2, minutos: 90, metros: 10000, sinDisciplina: 1 })
  })

  it('sin nada, ceros y ninguna sin clasificar', () => {
    expect(totales([])).toEqual({ actividades: 0, minutos: 0, metros: 0, sinDisciplina: 0 })
  })
})
