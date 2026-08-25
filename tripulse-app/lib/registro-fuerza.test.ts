import { describe, it, expect } from 'vitest'
import {
  serieTieneAlgo, seriesConDatos, ejerciciosQueCuentan, tareaDe, ejercicioDe, seriesDe,
  volumenHoy, resumenRegistro, guardarRegistroFuerza, SERIE_VACIA,
  type EjercicioRegistro,
} from './registro-fuerza'

const serie = (peso = '', reps = '', control = '', tiempo = '') => ({ peso, reps, control, tiempo })

const SENTADILLA: EjercicioRegistro = {
  ejercicioId: 7, nombre: 'Sentadilla', grupoMuscular: 'Pierna', porTiempo: false,
  series: [serie('80', '8', '2'), serie('80', '8', '2'), serie('75', '6', '1')],
}

const PLANCHA: EjercicioRegistro = {
  ejercicioId: 9, nombre: 'Plancha', grupoMuscular: 'Core', porTiempo: true,
  series: [serie('', '', '', '45'), serie('', '', '', '40')],
}

function sbFalso(op: { falla?: string } = {}) {
  const escritas: any[] = []
  let n = 100
  return {
    escritas,
    from(tabla: string) {
      return {
        insert(v: any) {
          const filas = Array.isArray(v) ? v : [v]
          if (op.falla === tabla) return { select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'no va' } }) }), then: undefined, error: { message: 'no va' } } as any
          escritas.push(...filas.map((f: any) => ({ ...f, _tabla: tabla })))
          const res = { data: { id: ++n }, error: null }
          return {
            select: () => ({ single: () => Promise.resolve(res) }),
            // Para el insert de series, que no pide select
            then: (r: any) => r({ error: null }),
          }
        },
        delete() { return { eq: (_c: string, id: any) => { escritas.push({ _tabla: tabla, _borrada: id }); return Promise.resolve({ error: null }) } } },
      }
    },
  }
}

describe('serieTieneAlgo', () => {
  it('una fila en blanco no es una serie que se hizo', () => {
    expect(serieTieneAlgo(SERIE_VACIA)).toBe(false)
    expect(serieTieneAlgo(serie('80', ''))).toBe(true)
    expect(serieTieneAlgo(serie('', '8'))).toBe(true)
  })

  it('en los de tiempo cuenta el tiempo, no las reps', () => {
    expect(serieTieneAlgo(serie('', '', '', '45'), true)).toBe(true)
    expect(serieTieneAlgo(serie('', '8'), true)).toBe(false)
  })
})

describe('seriesConDatos', () => {
  it('RENUMERA: si dejó la 2 en blanco, hizo dos series, no «la 1 y la 3»', () => {
    const conHueco = { ...SENTADILLA, series: [serie('80', '8'), SERIE_VACIA, serie('75', '6')] }
    const filas = seriesDe(conHueco, 500)
    expect(filas.map(f => f.numero_serie)).toEqual([1, 2])
    expect(filas.map(f => f.peso_real)).toEqual([80, 75])
  })

  it('sin nada, ninguna', () => {
    expect(seriesConDatos({ ...SENTADILLA, series: [SERIE_VACIA, SERIE_VACIA] })).toEqual([])
  })
})

describe('ejerciciosQueCuentan', () => {
  it('un ejercicio añadido y sin rellenar no se guarda', () => {
    const vacio = { ...SENTADILLA, nombre: 'Prensa', series: [SERIE_VACIA] }
    expect(ejerciciosQueCuentan([SENTADILLA, vacio]).map(e => e.nombre)).toEqual(['Sentadilla'])
  })
})

describe('las filas que se escriben', () => {
  it('la tarea lleva el número de series que de verdad hizo', () => {
    expect(tareaDe(SENTADILLA, 1, 1)).toEqual({ id_sesion: 1, disciplina: 'Fuerza', orden: 1, series: 3 })
  })

  it('el ejercicio guarda el id de biblioteca, para el vídeo', () => {
    const e = ejercicioDe(SENTADILLA, 50)
    expect(e.ejercicio_id).toBe(7)
    expect(e.nombre).toBe('Sentadilla')
    expect(e.series).toBe(3)
    // La primera serie marca la referencia: aquí no hay prescripción de la que salga.
    expect(e.repeticiones).toBe(8)
    expect(e.intensidad).toBe(80)
  })

  it('en los de tiempo no se inventan repeticiones', () => {
    const e = ejercicioDe(PLANCHA, 50)
    expect(e.repeticiones).toBeNull()
    const s = seriesDe(PLANCHA, 60)
    expect(s.map(x => x.tiempo_real)).toEqual([45, 40])
    expect(s.every(x => x.repeticiones_reales === null)).toBe(true)
  })

  it('las series se marcan como hechas y del ejercicio principal', () => {
    const s = seriesDe(SENTADILLA, 60)
    expect(s.every(x => x.completada === true && x.ejercicio_numero === 1)).toBe(true)
    expect(s.map(x => x.control_real)).toEqual([2, 2, 1])
    expect(s.every(x => x.control_tipo === 'rir')).toBe(true)
  })

  it('sin control anotado, control_tipo queda a null y no miente sobre la escala', () => {
    const sinRir = { ...SENTADILLA, series: [serie('80', '8')] }
    expect(seriesDe(sinRir, 60)[0].control_tipo).toBeNull()
    expect(ejercicioDe(sinRir, 50).control_tipo).toBeNull()
  })
})

describe('volumenHoy', () => {
  it('kg × reps', () => {
    expect(volumenHoy(SENTADILLA)).toBe(80 * 8 + 80 * 8 + 75 * 6)
  })

  it('en los de tiempo, segundos', () => {
    expect(volumenHoy(PLANCHA)).toBe(85)
  })
})

describe('resumenRegistro', () => {
  it('cuenta ejercicios y series', () => {
    expect(resumenRegistro([SENTADILLA, PLANCHA])).toBe('2 ejercicios · 5 series')
    expect(resumenRegistro([SENTADILLA])).toBe('1 ejercicio · 3 series')
    expect(resumenRegistro([])).toBe('Nada que guardar todavía')
  })
})

describe('guardarRegistroFuerza', () => {
  const base = {
    idDeportista: 14, fecha: '2026-08-25', idMicrociclo: null,
    duracionMinutos: 50, rpe: 7, notas: null,
  }

  it('escribe sesión, tarea, ejercicio y series', async () => {
    const sb = sbFalso()
    const r = await guardarRegistroFuerza(sb, { ...base, ejercicios: [SENTADILLA] })
    expect(r.error).toBeNull()
    expect(r.guardados).toBe(1)
    const tablas = sb.escritas.map(e => e._tabla)
    expect(tablas).toContain('sesion')
    expect(tablas).toContain('tarea')
    expect(tablas).toContain('ejercicios')
    expect(tablas.filter(t => t === 'series_realizadas')).toHaveLength(3)
  })

  it('la sesión nace REALIZADA y como del deportista', async () => {
    const sb = sbFalso()
    await guardarRegistroFuerza(sb, { ...base, ejercicios: [SENTADILLA] })
    const s = sb.escritas.find(e => e._tabla === 'sesion')
    expect(s.estado).toBe('Realizada')
    expect(s.origen).toBe('deportista')
    expect(s.disciplina).toBe('Fuerza')
    expect(s.rpe_reportado).toBe(7)
  })

  it('sin ejercicios no se crea nada, ni una sesión vacía', async () => {
    const sb = sbFalso()
    const r = await guardarRegistroFuerza(sb, { ...base, ejercicios: [] })
    expect(r.error).toBeTruthy()
    expect(sb.escritas).toHaveLength(0)
  })

  it('sin fecha tampoco', async () => {
    const sb = sbFalso()
    const r = await guardarRegistroFuerza(sb, { ...base, fecha: '', ejercicios: [SENTADILLA] })
    expect(r.error).toBe('Falta el día.')
    expect(sb.escritas).toHaveLength(0)
  })

  it('si falla a mitad se BORRA la sesión: media sesión es peor que ninguna', async () => {
    /* Una sesión con la mitad del trabajo contaría igual como entrenamiento en
       la carga, pero con la mitad de las series. */
    const sb = sbFalso({ falla: 'tarea' })
    const r = await guardarRegistroFuerza(sb, { ...base, ejercicios: [SENTADILLA] })
    expect(r.error).toBeTruthy()
    expect(r.idSesion).toBeNull()
    expect(sb.escritas.some(e => e._borrada != null)).toBe(true)
  })
})
