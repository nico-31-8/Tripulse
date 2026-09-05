import { describe, it, expect, vi } from 'vitest'
import {
  estadoFuerza, estadoResistencia, cuantasListas, guardarEnOrden,
  sinGuardar, filasGuardadas, textoParte, hayQueContarlo, type Parte,
} from './guardar-varias-tareas'
import type { FilaFuerza, FilaResistencia } from './copiar-tarea'

const filaF = (extra: Partial<FilaFuerza> = {}): FilaFuerza => ({
  orden: 1, grupoMuscularSel: '', ejercicioSelId: '', tipoSerie: 'Normal',
  series: '', medida: 'reps', controlTipo: 'rir', repsFuerza: '', kgFuerza: '',
  rir: '', descanso: '', comentario: '', grupoMuscular2: '', ejercicioSelId2: '',
  series2: '', repsFuerza2: '', kgFuerza2: '', escalonDrop: '', zonaFuerzaTarea: '',
  ...extra,
})

const filaR = (extra: Partial<FilaResistencia> = {}): FilaResistencia => ({
  orden: 1, zona: 'Z2', disciplina: 'Carrera', series: '', descanso: '',
  tipoMedicion: '', valorMedicion: '', intensidadPersonalizada: '', comentario: '',
  esTecnica: false, tecnicaId: '',
  ...extra,
})

describe('qué filas se pueden guardar — fuerza', () => {
  it('con ejercicio elegido, lista', () => {
    expect(estadoFuerza(filaF({ ejercicioSelId: '12' }))).toBe('lista')
  })

  it('editando una tarea que ya existe NO se exige ejercicio', () => {
    // Las de plantilla y las del planificador llevan el ejercicio en el
    // comentario y no tienen fila en `ejercicios`. Ya se podían editar.
    expect(estadoFuerza(filaF({ idTarea: 40 }))).toBe('lista')
  })

  it('la fila recién añadida y sin tocar es vacía: se salta sin ruido', () => {
    expect(estadoFuerza(filaF())).toBe('vacia')
  })

  it('empezada pero sin ejercicio es INCOMPLETA, no vacía: hay que decirlo', () => {
    expect(estadoFuerza(filaF({ series: '4', repsFuerza: '8' }))).toBe('incompleta')
    expect(estadoFuerza(filaF({ grupoMuscularSel: 'Pierna' }))).toBe('incompleta')
  })

  it('los valores que trae de fábrica no cuentan como tocada', () => {
    // tipoSerie, medida y controlTipo vienen puestos de nuevaFilaF().
    expect(estadoFuerza(filaF({ tipoSerie: 'Normal', medida: 'reps', controlTipo: 'rir' }))).toBe('vacia')
  })

  it('los espacios no son contenido', () => {
    expect(estadoFuerza(filaF({ comentario: '   ' }))).toBe('vacia')
  })
})

describe('qué filas se pueden guardar — resistencia', () => {
  it('con algo escrito, lista', () => {
    expect(estadoResistencia(filaR({ valorMedicion: '5000' }))).toBe('lista')
    expect(estadoResistencia(filaR({ comentario: 'suave' }))).toBe('lista')
  })

  it('técnica sin drill elegido es incompleta: es su único requisito duro', () => {
    expect(estadoResistencia(filaR({ esTecnica: true, tecnicaId: '' }))).toBe('incompleta')
    expect(estadoResistencia(filaR({ esTecnica: true, tecnicaId: '3' }))).toBe('lista')
  })

  it('zona y disciplina NO cuentan como tocada: vienen puestas de la sesión', () => {
    // Si contaran, cada fila añadida y olvidada crearía una tarea fantasma.
    expect(estadoResistencia(filaR({ zona: 'Z2', disciplina: 'Carrera' }))).toBe('vacia')
  })
})

describe('cuántas guardaría el botón', () => {
  it('cuenta solo las listas', () => {
    const filas = [filaF({ ejercicioSelId: '1' }), filaF(), filaF({ series: '4' }), filaF({ ejercicioSelId: '2' })]
    expect(cuantasListas(filas, estadoFuerza)).toBe(2)
  })

  it('sin filas, cero', () => {
    expect(cuantasListas([], estadoFuerza)).toBe(0)
  })
})

describe('guardar en orden', () => {
  const listas = () => [filaF({ ejercicioSelId: '1' }), filaF({ ejercicioSelId: '2' }), filaF({ ejercicioSelId: '3' })]

  it('el orden arranca después de las tareas que ya tiene la sesión', async () => {
    const escribir = vi.fn(async (_f: FilaFuerza, _orden: number) => ({}))
    await guardarEnOrden(listas(), 4, estadoFuerza, escribir)
    expect(escribir.mock.calls.map((c: any) => c[1])).toEqual([5, 6, 7])
  })

  it('en una sesión vacía empieza por 1', async () => {
    const escribir = vi.fn(async (_f: FilaFuerza, _orden: number) => ({}))
    await guardarEnOrden([filaF({ ejercicioSelId: '1' })], 0, estadoFuerza, escribir)
    expect(escribir.mock.calls[0][1]).toBe(1)
  })

  it('se escriben de una en una, no todas a la vez: el orden es el de la sesión', async () => {
    const visto: string[] = []
    const escribir = async (f: FilaFuerza) => {
      visto.push('entra ' + f.ejercicioSelId)
      await new Promise(r => setTimeout(r, f.ejercicioSelId === '1' ? 15 : 0))
      visto.push('sale ' + f.ejercicioSelId)
      return {}
    }
    await guardarEnOrden(listas(), 0, estadoFuerza, escribir)
    expect(visto).toEqual(['entra 1', 'sale 1', 'entra 2', 'sale 2', 'entra 3', 'sale 3'])
  })

  it('una fila que EDITA no gasta número de orden: conserva su sitio', async () => {
    const escribir = vi.fn(async (f: FilaFuerza) => ({ creada: !f.idTarea }))
    const filas = [filaF({ idTarea: 9 }), filaF({ ejercicioSelId: '2' })]
    await guardarEnOrden(filas, 3, estadoFuerza, escribir)
    expect(escribir.mock.calls.map((c: any) => c[1])).toEqual([4, 4])
  })

  it('las vacías y las incompletas ni se intentan', async () => {
    const escribir = vi.fn(async (_f: FilaFuerza, _orden: number) => ({}))
    const filas = [filaF({ ejercicioSelId: '1' }), filaF(), filaF({ series: '4' })]
    const p = await guardarEnOrden(filas, 0, estadoFuerza, escribir)
    expect(escribir).toHaveBeenCalledTimes(1)
    expect(p.vacias).toEqual([1])
    expect(p.incompletas).toEqual([2])
  })

  it('saltarse una no descoloca el orden de la siguiente', async () => {
    const escribir = vi.fn(async (_f: FilaFuerza, _orden: number) => ({}))
    await guardarEnOrden([filaF({ ejercicioSelId: '1' }), filaF(), filaF({ ejercicioSelId: '3' })], 0, estadoFuerza, escribir)
    expect(escribir.mock.calls.map((c: any) => c[1])).toEqual([1, 2])
  })

  it('si una falla, las siguientes se siguen intentando', async () => {
    const escribir = async (f: FilaFuerza) => (f.ejercicioSelId === '2' ? { error: 'sin permiso' } : {})
    const p = await guardarEnOrden(listas(), 0, estadoFuerza, escribir)
    expect(p.guardadas).toEqual([0, 2])
    expect(p.fallidas.map(x => x.i)).toEqual([1])
  })

  it('la que falla no gasta número: no deja un hueco en el orden', async () => {
    const escribir = vi.fn(async (f: FilaFuerza) => (f.ejercicioSelId === '1' ? { error: 'no' } : {}))
    await guardarEnOrden(listas(), 0, estadoFuerza, escribir)
    expect(escribir.mock.calls.map((c: any) => c[1])).toEqual([1, 1, 2])
  })

  it('una excepción se trata como fallo de esa fila, no revienta el lote', async () => {
    const escribir = async (f: FilaFuerza) => {
      if (f.ejercicioSelId === '2') throw new Error('se cayó la red')
      return {}
    }
    const p = await guardarEnOrden(listas(), 0, estadoFuerza, escribir)
    expect(p.guardadas).toEqual([0, 2])
    expect(p.fallidas[0].error).toBe('se cayó la red')
  })

  it('lo que falla vuelve entero, para reintentarlo tal cual', async () => {
    const filas = listas()
    const p = await guardarEnOrden(filas, 0, estadoFuerza, async () => ({ error: 'x' }))
    expect(p.fallidas[0].fila).toBe(filas[0])
  })

  it('sin filas no escribe nada', async () => {
    const escribir = vi.fn(async (_f: FilaFuerza, _orden: number) => ({}))
    const p = await guardarEnOrden([], 2, estadoFuerza, escribir)
    expect(escribir).not.toHaveBeenCalled()
    expect(p.guardadas).toEqual([])
  })
})

describe('qué se queda en pantalla', () => {
  it('solo desaparece lo que llegó a la base', () => {
    const filas = [filaF({ ejercicioSelId: 'a' }), filaF({ ejercicioSelId: 'b' }), filaF({ ejercicioSelId: 'c' })]
    const p: Parte<FilaFuerza> = { guardadas: [0, 2], fallidas: [], incompletas: [], vacias: [] }
    expect(sinGuardar(filas, p).map(f => f.ejercicioSelId)).toEqual(['b'])
  })

  it('devuelve los objetos guardados, para poder quitarlos por identidad', () => {
    // Por posición no: si se borra una fila mientras se guarda, los índices se
    // corren y se acabaría borrando el trabajo de una que nadie guardó.
    const filas = [filaF({ ejercicioSelId: 'a' }), filaF({ ejercicioSelId: 'b' }), filaF({ ejercicioSelId: 'c' })]
    const p: Parte<FilaFuerza> = { guardadas: [0, 2], fallidas: [], incompletas: [], vacias: [] }
    const salvadas = filasGuardadas(filas, p)
    expect(salvadas[0]).toBe(filas[0])
    expect(salvadas[1]).toBe(filas[2])
  })

  it('un índice que ya no existe no se cuela como undefined', () => {
    const filas = [filaF({ ejercicioSelId: 'a' })]
    const p: Parte<FilaFuerza> = { guardadas: [0, 5], fallidas: [], incompletas: [], vacias: [] }
    expect(filasGuardadas(filas, p)).toEqual([filas[0]])
  })

  it('lo fallido y lo incompleto se queda para poder reintentarlo', () => {
    const filas = [filaF({ ejercicioSelId: 'a' }), filaF({ ejercicioSelId: 'b' }), filaF()]
    const p: Parte<FilaFuerza> = {
      guardadas: [0], fallidas: [{ i: 1, fila: filas[1], error: 'x' }], incompletas: [], vacias: [2],
    }
    expect(sinGuardar(filas, p)).toHaveLength(2)
  })
})

describe('el parte que se le enseña al entrenador', () => {
  const parte = (p: Partial<Parte<any>>): Parte<any> =>
    ({ guardadas: [], fallidas: [], incompletas: [], vacias: [], ...p })

  it('todo bien, y en singular cuando toca', () => {
    expect(textoParte(parte({ guardadas: [0, 1, 2] }))).toBe('3 tareas guardadas')
    expect(textoParte(parte({ guardadas: [0] }))).toBe('1 tarea guardada')
  })

  it('las filas vacías no se mencionan: saltarlas es lo esperado', () => {
    expect(textoParte(parte({ guardadas: [0], vacias: [1, 2] }))).toBe('1 tarea guardada')
  })

  it('lo que falló se dice, con su motivo', () => {
    const t = textoParte(parte({ guardadas: [0], fallidas: [{ i: 1, fila: {}, error: 'sin permiso' }] }))
    expect(t).toContain('1 tarea guardada')
    expect(t).toContain('1 no se pudo guardar')
    expect(t).toContain('sin permiso')
  })

  it('lo incompleto también: si no, se cierra la sesión creyendo que se guardaron todas', () => {
    expect(textoParte(parte({ guardadas: [0], incompletas: [1] }))).toContain('1 fila sin terminar')
  })

  it('solo se interrumpe al entrenador si hay algo que contar', () => {
    expect(hayQueContarlo(parte({ guardadas: [0, 1], vacias: [2] }))).toBe(false)
    expect(hayQueContarlo(parte({ incompletas: [0] }))).toBe(true)
    expect(hayQueContarlo(parte({ fallidas: [{ i: 0, fila: {}, error: 'x' }] }))).toBe(true)
  })
})
