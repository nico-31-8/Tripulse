import { describe, it, expect } from 'vitest'
import { semanasDeSaltos, separacionMinima, dolorTrasSaltos, seriesDeTests, type SesionAnidada } from './pliometria-avance-datos'
import { decidirAvance } from './pliometria-avance'
import { DATOS_VACIOS } from './pliometria-escalon'
import type { EjercicioBib } from './pliometria'

const HOY = '2026-10-22'   // jueves; la semana empieza el 19

const BIB: EjercicioBib[] = [
  { id: 1, nombre: 'Pogos', tipo: ['Pliometría'], nivel_pliometria: 'a', parte_pliometria: 'inferior' },
  { id: 2, nombre: 'Drop jump', tipo: ['Fuerza', 'Pliometría'], nivel_pliometria: 'c', parte_pliometria: 'inferior' },
  { id: 3, nombre: 'Pase de pecho con balón', tipo: ['Pliometría'], nivel_pliometria: 'a', parte_pliometria: 'superior' },
  { id: 4, nombre: 'Sentadilla', tipo: ['Fuerza'] },
]

/* Una de fuerza con pogos (3 × 10) y drop jumps desde 30 cm (3 × 8). */
const fuerza = (fecha: string, estado = 'Realizada', altura = '30'): SesionAnidada => ({
  fecha_sesion: fecha, disciplina: 'Fuerza', estado,
  tarea: [{ series: 1, ejercicios: [
    { ejercicio_id: 1, series: 3, repeticiones: 10 },
    { ejercicio_id: 2, series: 3, repeticiones: 8, control_tipo: 'altura', control_valor: altura },
    { ejercicio_id: 4, series: 4, repeticiones: 6 },
  ] }],
})
/* Una de carrera con pogos como drill: 4 × 15 contactos. */
const carrera = (fecha: string, minutos: number, estado = 'Realizada'): SesionAnidada => ({
  fecha_sesion: fecha, disciplina: 'Carrera', estado, duracion_minutos: minutos,
  tarea: [{ tecnica_id: 1, series: 4, p_repeticiones: [{ repeticiones_planteadas: 15 }] }],
})

describe('los contactos de cada semana', () => {
  it('cuenta con la misma cuenta que el contador de la sesión, por nivel', () => {
    const { semanas } = semanasDeSaltos([fuerza('2026-10-13')], BIB, HOY)
    const s = semanas[6]
    expect(s.lunes).toBe('2026-10-12')
    expect(s).toMatchObject({ sesiones: 1, pies: 54, porNivel: { a: 30, c: 24 }, altura: 30 })
  })

  it('los lanzamientos van aparte, y no hacen sesión de saltos', () => {
    const lanzar: SesionAnidada = { fecha_sesion: '2026-10-14', disciplina: 'Fuerza', estado: 'Realizada', tarea: [{ ejercicios: [{ ejercicio_id: 3, series: 3, repeticiones: 8 }] }] }
    const { semanas } = semanasDeSaltos([lanzar], BIB, HOY)
    expect(semanas[6]).toMatchObject({ sesiones: 0, pies: 0, lanzamientos: 24 })
  })

  it('esta semana cuenta lo hecho y lo prescrito de hoy en adelante; lo de antes sin hacer, no', () => {
    const r = semanasDeSaltos([
      fuerza('2026-10-19'),                 // hecha: cuenta
      fuerza('2026-10-20', 'Pendiente'),    // antes de hoy y sin hacer: no
      carrera('2026-10-24', 40, 'Pendiente'), // de hoy en adelante: cuenta
    ], BIB, HOY)
    expect(r.semanas[7]).toMatchObject({ sesiones: 2, pies: 114, carrera: 40 })
    expect(r.fechasHechas).toEqual(['2026-10-19'])
    expect(r.proxima).toBe('2026-10-24')
  })

  it('la próxima puede ser la semana que viene; lo de la que viene no cuenta en esta', () => {
    const r = semanasDeSaltos([fuerza('2026-10-27', 'Pendiente')], BIB, HOY)
    expect(r.proxima).toBe('2026-10-27')
    expect(r.semanas.every(s => s.pies === 0)).toBe(true)
  })

  it('las semanas pasadas solo cuentan lo hecho, y la papelera nada', () => {
    const r = semanasDeSaltos([fuerza('2026-10-06', 'Pendiente'), { ...fuerza('2026-10-07'), eliminada: true }], BIB, HOY)
    expect(r.semanas[5].pies).toBe(0)
  })

  it('los minutos de carrera y las disciplinas que hace', () => {
    const r = semanasDeSaltos([carrera('2026-10-13', 50), { fecha_sesion: '2026-10-15', disciplina: 'Ciclismo', estado: 'Realizada', duracion_minutos: 90 }], BIB, HOY)
    expect(r.semanas[6].carrera).toBe(50)
    expect(r.hace.sort()).toEqual(['Carrera', 'Ciclismo'])
  })

  it('la caída de la semana es la más alta prescrita', () => {
    const r = semanasDeSaltos([fuerza('2026-10-13', 'Realizada', '30'), fuerza('2026-10-16', 'Realizada', '40')], BIB, HOY)
    expect(r.semanas[6].altura).toBe(40)
  })
})

describe('los días entre sesiones', () => {
  it('la menor de las dos últimas semanas', () => {
    expect(separacionMinima(['2026-10-13', '2026-10-16', '2026-10-19', '2026-10-20'], HOY)).toBe(1)
    expect(separacionMinima(['2026-10-19', '2026-10-19'], HOY)).toBe(0)
  })

  it('con una sola no hay separación, y lo de hace tres semanas no cuenta', () => {
    expect(separacionMinima(['2026-10-19'], HOY)).toBeNull()
    expect(separacionMinima(['2026-09-30', '2026-10-01', '2026-10-19'], HOY)).toBeNull()
  })
})

describe('el dolor del wellness', () => {
  const semana = (desde: string, valores: number[]) => valores.map((v, i) => ({ fecha: new Date(Date.parse(desde) + i * 86400000).toISOString().slice(0, 10), dolor_muscular: v }))

  it('el de los dos días siguientes a su última sesión, contra su mediana de 4 semanas', () => {
    const w = semana('2026-09-28', [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 4])
    expect(dolorTrasSaltos(w, ['2026-10-18'], HOY)).toEqual({ despues: 5, mediana: 2 })
  })

  it('con menos de 7 registros no hay mediana', () => {
    expect(dolorTrasSaltos(semana('2026-10-16', [3, 3, 3]), ['2026-10-16'], HOY).mediana).toBeNull()
  })

  it('una sesión de hace más de dos semanas ya no dice nada', () => {
    expect(dolorTrasSaltos(semana('2026-09-28', Array(20).fill(2)), ['2026-10-01'], HOY).despues).toBeNull()
  })
})

describe('sus tests', () => {
  it('el CMJ del Bosco y el RSI del drop jump, guardado o calculado', () => {
    const t = seriesDeTests([
      { clave: 'bosco', fecha: '2026-10-01', resultados: { cmj: '33,5' } },
      { clave: 'dropjump', fecha: '2026-10-02', resultados: { rsi: 1.9 }, brutos: { contacto: '210' } },
      { clave: 'dropjump', fecha: '2026-10-09', resultados: { salto: 42 }, brutos: { contacto: '200' } },
    ])
    expect(t.cmj).toEqual([{ fecha: '2026-10-01', valor: 33.5 }])
    expect(t.rsi).toEqual([{ fecha: '2026-10-02', valor: 1.9 }, { fecha: '2026-10-09', valor: 2.1 }])
  })
})

describe('de punta a punta', () => {
  it('cuatro semanas de pogos que suben bien dan «subir el volumen»', () => {
    const ses = ['2026-09-28', '2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19']
      .map((f, i) => ({ ...carrera(f, 40), tarea: [{ tecnica_id: 1, series: 4, p_repeticiones: [{ repeticiones_planteadas: 12 + i }] }] }))
    const s = semanasDeSaltos(ses, BIB, HOY)
    const v = decidirAvance({
      hoy: HOY, nivel: 'a', puestoEn: null, comprobaciones: {}, datos: DATOS_VACIOS, experiencia: 'intermedio', edad: 30,
      disciplinas: null, haceEnSesiones: s.hace, semanas: s.semanas, separacionDias: separacionMinima(s.fechasSaltos, HOY),
      dolor: { despues: null, mediana: null }, cmj: [], rsi: [], proximaSaltos: s.proxima,
    })
    expect(v.imp.tipo).toBe('corre')
    expect(v.porSesion).toBe(72)
    expect(v.accion).toBe('Subir el volumen')
  })
})
