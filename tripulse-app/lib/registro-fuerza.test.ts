import { describe, it, expect } from 'vitest'
import {
  serieTieneAlgo, seriesConDatos, ejerciciosQueCuentan, tareaDe, ejercicioDe, seriesDe,
  volumenHoy, resumenRegistro, guardarRegistroFuerza, SERIE_VACIA,
  seMidePorTiempo, ejerciciosDesdeSesion, resumenDeEjercicios, actualizarRegistroFuerza,
  type EjercicioRegistro,
} from './registro-fuerza'

const serie = (peso = '', reps = '', control = '', tiempo = '') => ({ peso, reps, control, tiempo })

const SENTADILLA: EjercicioRegistro = {
  ejercicioId: 7, nombre: 'Sentadilla', grupoMuscular: 'Pierna', porTiempo: false, controlTipo: 'rir',
  series: [serie('80', '8', '2'), serie('80', '8', '2'), serie('75', '6', '1')],
}

const PLANCHA: EjercicioRegistro = {
  ejercicioId: 9, nombre: 'Plancha', grupoMuscular: 'Core', porTiempo: true, controlTipo: 'rpe',
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

describe('seMidePorTiempo', () => {
  it('caza los isométricos por como se llaman', () => {
    for (const n of ['Plancha', 'Plancha lateral', 'Isométrico de cuádriceps', 'Hollow hold', 'Puente estático']) {
      expect(seMidePorTiempo(n)).toBe(true)
    }
  })

  it('lo normal va por repeticiones', () => {
    for (const n of ['Sentadilla', 'Press banca', 'Dominadas', 'Hip thrust']) {
      expect(seMidePorTiempo(n)).toBe(false)
    }
  })

  it('es una SUPOSICIÓN, no un dato: por eso el atleta puede cambiarla', () => {
    /* La biblioteca no guarda si un ejercicio va por tiempo, así que no hay
       dónde mirarlo. Esto solo acierta el valor inicial de la casilla. */
    expect(seMidePorTiempo('Isquios excéntricos 5s')).toBe(false)
    expect(seMidePorTiempo(null)).toBe(false)
  })
})

describe('ejerciciosDesdeSesion', () => {
  const EJS = [
    { id: 1, nombre: 'Sentadilla', ejercicio_id: 7, grupo_muscular: 'Pierna', series: 3, repeticiones: 8, intensidad: 80 },
    { id: 2, nombre: 'Plancha', ejercicio_id: 9, grupo_muscular: 'Core', series: 2 },
  ]
  const SERIES = new Map<number, any[]>([
    [1, [
      { numero_serie: 2, peso_real: 80, repeticiones_reales: 8, control_real: 2, ejercicio_numero: 1 },
      { numero_serie: 1, peso_real: 80, repeticiones_reales: 8, control_real: 2, ejercicio_numero: 1 },
      { numero_serie: 1, peso_real: 40, repeticiones_reales: 10, ejercicio_numero: 2 },
    ]],
    [2, [{ numero_serie: 1, tiempo_real: 45, ejercicio_numero: 1 }]],
  ])

  it('trae los ejercicios con lo que se hizo aquel día', () => {
    const r = ejerciciosDesdeSesion(EJS, SERIES)
    expect(r.map(e => e.nombre)).toEqual(['Sentadilla', 'Plancha'])
    expect(r[0].series.map(s => s.peso)).toEqual(['80', '80'])
    expect(r[0].ejercicioId).toBe(7)
  })

  it('ordena las series por su número, no por como vengan de la base', () => {
    const r = ejerciciosDesdeSesion([EJS[0]], SERIES)
    expect(r[0].series).toHaveLength(2)
  })

  it('deja fuera las del encadenado: son de otro ejercicio', () => {
    const r = ejerciciosDesdeSesion([EJS[0]], SERIES)
    expect(r[0].series.every(s => s.peso === '80')).toBe(true)
  })

  it('la plancha viene por tiempo', () => {
    const r = ejerciciosDesdeSesion(EJS, SERIES)
    expect(r[1].porTiempo).toBe(true)
    expect(r[1].series[0].tiempo).toBe('45')
  })

  it('sin series registradas cae a lo prescrito, no a filas en blanco', () => {
    /* Es una sesión que se planificó y no se llegó a rellenar. Repetirla vacía
       sería peor que repetirla con lo que ponía. */
    const r = ejerciciosDesdeSesion([EJS[0]], new Map())
    expect(r[0].series).toHaveLength(3)
    expect(r[0].series[0]).toMatchObject({ peso: '80', reps: '8' })
  })

  it('sin nombre no es un ejercicio', () => {
    expect(ejerciciosDesdeSesion([{ id: 9 }], new Map())).toEqual([])
  })
})

describe('resumenDeEjercicios', () => {
  it('los nombres, y un «+N» si son muchos', () => {
    expect(resumenDeEjercicios(['Sentadilla', 'Press banca'])).toBe('Sentadilla · Press banca')
    expect(resumenDeEjercicios(['A', 'B', 'C', 'D', 'E'])).toBe('A · B · C · +2')
  })

  it('sin nada, se dice', () => {
    expect(resumenDeEjercicios([])).toBe('Sin ejercicios')
    expect(resumenDeEjercicios([null, '  '])).toBe('Sin ejercicios')
  })
})

describe('actualizarRegistroFuerza', () => {
  const base = { fecha: '2026-08-25', duracionMinutos: 50, rpe: 7, notas: null }

  function sbEdicion(op: { fallaInsert?: string } = {}) {
    const ops: any[] = []
    let n = 500
    return {
      ops,
      from(tabla: string) {
        return {
          insert(v: any) {
            const filas = Array.isArray(v) ? v : [v]
            if (op.fallaInsert === tabla) {
              return {
                select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'no va' } }) }),
                then: (r: any) => r({ error: { message: 'no va' } }),
              }
            }
            ops.push({ op: 'insert', tabla, n: filas.length })
            const res = { data: { id: ++n }, error: null }
            return { select: () => ({ single: () => Promise.resolve(res) }), then: (r: any) => r({ error: null }) }
          },
          select() {
            const q: any = {
              eq: () => Promise.resolve({ data: [{ id: 1 }, { id: 2 }] }),
              in: () => Promise.resolve({ data: [{ id: 11 }] }),
            }
            return q
          },
          delete() {
            return { in: (_c: string, ids: any[]) => { ops.push({ op: 'delete', tabla, ids }); return Promise.resolve({ error: null }) } }
          },
          update() { return { eq: () => { ops.push({ op: 'update', tabla }); return Promise.resolve({ error: null }) } } },
        }
      },
    }
  }

  it('escribe lo nuevo y DESPUÉS borra lo viejo', async () => {
    const sb = sbEdicion()
    const r = await actualizarRegistroFuerza(sb, 400, { ...base, ejercicios: [SENTADILLA] })
    expect(r.error).toBeNull()
    const orden = sb.ops.map(o => o.op + ':' + o.tabla)
    const primerBorrado = orden.findIndex(x => x.startsWith('delete'))
    const ultimoInsert = orden.map((x, i) => x.startsWith('insert') ? i : -1).filter(i => i >= 0).pop()!
    expect(ultimoInsert).toBeLessThan(primerBorrado)
  })

  it('si el insert falla NO se borra nada, y se dice', async () => {
    /* Al revés —borrar primero— un fallo a mitad dejaría al atleta sin el
       registro de un entrenamiento que sí hizo. */
    const sb = sbEdicion({ fallaInsert: 'ejercicios' })
    const r = await actualizarRegistroFuerza(sb, 400, { ...base, ejercicios: [SENTADILLA] })
    expect(r.error).toContain('No se ha borrado nada')
    expect(sb.ops.some(o => o.op === 'delete')).toBe(false)
  })

  it('sin ejercicios no se vacía la sesión por accidente', async () => {
    const sb = sbEdicion()
    const r = await actualizarRegistroFuerza(sb, 400, { ...base, ejercicios: [] })
    expect(r.error).toBeTruthy()
    expect(sb.ops).toHaveLength(0)
  })

  it('actualiza la cabecera al final', async () => {
    const sb = sbEdicion()
    await actualizarRegistroFuerza(sb, 400, { ...base, ejercicios: [SENTADILLA] })
    expect(sb.ops.filter(o => o.op === 'update' && o.tabla === 'sesion')).toHaveLength(1)
  })
})

describe('la escala viaja con el ejercicio', () => {
  it('se guarda la que se eligió, no un RIR por defecto', () => {
    const enRpe = { ...SENTADILLA, controlTipo: 'rpe' as const }
    expect(ejercicioDe(enRpe, 50).control_tipo).toBe('rpe')
    expect(seriesDe(enRpe, 60).every(s => s.control_tipo === 'rpe')).toBe(true)
  })

  it('con encoder también: m/s y % de pérdida son escalas normales aquí', () => {
    const conEncoder = { ...SENTADILLA, controlTipo: 'vel_ms' as const, series: [serie('72.5', '5', '0.62')] }
    expect(seriesDe(conEncoder, 60)[0].control_real).toBe(0.62)
    expect(seriesDe(conEncoder, 60)[0].control_tipo).toBe('vel_ms')
  })

  it('al traer una sesión vieja, la escala es la de AQUEL día', () => {
    /* Si lo anotaba en RPE en julio, repetirlo hoy no puede convertirlo en RIR:
       el número significaría otra cosa. */
    const ejs = [{ id: 1, nombre: 'Sentadilla', ejercicio_id: 7, series: 2, control_tipo: 'rpe' }]
    const series = new Map<number, any[]>([[1, [
      { numero_serie: 1, peso_real: 80, repeticiones_reales: 8, control_real: 8, control_tipo: 'rpe', ejercicio_numero: 1 },
    ]]])
    expect(ejerciciosDesdeSesion(ejs, series)[0].controlTipo).toBe('rpe')
  })

  it('la de la SERIE manda sobre la del ejercicio: es lo que de verdad se anotó', () => {
    const ejs = [{ id: 1, nombre: 'Press banca', series: 1, control_tipo: 'rir' }]
    const series = new Map<number, any[]>([[1, [
      { numero_serie: 1, peso_real: 70, repeticiones_reales: 5, control_real: 0.6, control_tipo: 'vel_ms', ejercicio_numero: 1 },
    ]]])
    expect(ejerciciosDesdeSesion(ejs, series)[0].controlTipo).toBe('vel_ms')
  })

  it('sin nada guardado cae a RIR, que es lo más común', () => {
    const ejs = [{ id: 1, nombre: 'Fondos', series: 2 }]
    expect(ejerciciosDesdeSesion(ejs, new Map())[0].controlTipo).toBe('rir')
  })
})
