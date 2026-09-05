import { describe, it, expect, vi } from 'vitest'
import {
  leer, hayAlguno, cuantosFijados, fijar, paraGuardar,
  paraFilaResistencia, paraFilaFuerza, guardar, SIN_FIJAR,
} from './valores-por-defecto'

describe('leer lo guardado', () => {
  it('un objeto normal', () => {
    const v = leer({ resistencia: { unidad: 'm', series: '4' }, fuerza: { control: 'RPE' } })
    expect(v.resistencia.unidad).toBe('m')
    expect(v.fuerza.control).toBe('RPE')
  })

  it('la columna en texto: no todos los clientes devuelven jsonb ya parseado', () => {
    const v = leer(JSON.stringify({ resistencia: { unidad: 'km' }, fuerza: {} }))
    expect(v.resistencia.unidad).toBe('km')
  })

  it('una sesión anterior a la columna empieza sin nada fijado, no rota', () => {
    expect(leer(null)).toEqual(SIN_FIJAR)
    expect(leer(undefined)).toEqual(SIN_FIJAR)
    expect(leer(0)).toEqual(SIN_FIJAR)
  })

  it('un texto que no es JSON tampoco rompe el editor', () => {
    expect(leer('{roto')).toEqual(SIN_FIJAR)
  })

  it('las claves que no reconoce se van: lo guardado no manda sobre el código', () => {
    const v = leer({ resistencia: { unidad: 'm', inventada: 'x' }, fuerza: {} })
    expect(v.resistencia).toEqual({ unidad: 'm' })
  })

  it('los valores vacíos no se guardan como fijados', () => {
    const v = leer({ resistencia: { unidad: '', series: '   ', descanso: '1:30' }, fuerza: {} })
    expect(v.resistencia).toEqual({ descanso: '1:30' })
  })
})

describe('fijar y desfijar', () => {
  it('fijar guarda el valor', () => {
    const v = fijar(SIN_FIJAR, 'resistencia', 'unidad', 'm')
    expect(v.resistencia.unidad).toBe('m')
  })

  it('vaciar BORRA la clave: «sin fijar» es la ausencia, no una cadena en blanco', () => {
    const puesto = fijar(SIN_FIJAR, 'resistencia', 'unidad', 'm')
    const quitado = fijar(puesto, 'resistencia', 'unidad', '')
    expect('unidad' in quitado.resistencia).toBe(false)
  })

  it('no muta el objeto de entrada', () => {
    const a = fijar(SIN_FIJAR, 'fuerza', 'control', 'RIR')
    fijar(a, 'fuerza', 'control', 'RPE')
    expect(a.fuerza.control).toBe('RIR')
  })

  it('las dos tablas no se pisan', () => {
    let v = fijar(SIN_FIJAR, 'resistencia', 'series', '4')
    v = fijar(v, 'fuerza', 'series', '3')
    expect(v.resistencia.series).toBe('4')
    expect(v.fuerza.series).toBe('3')
  })

  it('sin nada fijado se guarda null, no un objeto vacío', () => {
    expect(paraGuardar(SIN_FIJAR)).toBeNull()
    expect(paraGuardar(fijar(SIN_FIJAR, 'fuerza', 'medida', 'tiempo'))).not.toBeNull()
  })

  it('cuenta cuántos hay fijados, para saber si la franja dice algo', () => {
    expect(hayAlguno(SIN_FIJAR)).toBe(false)
    expect(cuantosFijados({ unidad: 'm', series: '4' })).toBe(2)
    expect(cuantosFijados({})).toBe(0)
  })
})

describe('con qué nace una fila de resistencia', () => {
  const v = leer({ resistencia: { unidad: 'm', series: '4', descanso: '1:30' }, fuerza: {} })

  it('lo fijado viaja a la fila', () => {
    const f = paraFilaResistencia(v, { disciplinaSesion: 'Carrera' })
    expect(f.tipoMedicion).toBe('m')
    expect(f.series).toBe('4')
    expect(f.descanso).toBe('1:30')
  })

  it('LO NO FIJADO NI SE MENCIONA: la fila conserva lo que ya hacía', () => {
    // Es la diferencia entre `{}` y `{ zona: '' }`. Con la segunda, un campo sin
    // fijar pisaría el valor que la fila traía de la sesión.
    const f = paraFilaResistencia(v, { disciplinaSesion: 'Carrera' })
    expect('zona' in f).toBe(false)
    expect(f.zona).toBeUndefined()
  })

  it('sin nada fijado no aporta nada, y la fila nace como siempre', () => {
    expect(paraFilaResistencia(SIN_FIJAR, {})).toEqual({})
    expect(paraFilaResistencia(null, {})).toEqual({})
  })

  it('LA ZONA DE LA SESIÓN GANA a la de la franja', () => {
    // zona_resistencia no es un valor por defecto: es un dato que leen el
    // mesociclo, el calendario y la vista semana. La franja no lo pisa.
    const conZona = fijar(v, 'resistencia', 'zona', 'UMB')
    expect(paraFilaResistencia(conZona, { zonaSesion: 'AER' }).zona).toBe('AER')
  })

  it('sin zona en la sesión (modo compleja), la franja hace de respaldo', () => {
    const conZona = fijar(v, 'resistencia', 'zona', 'UMB')
    expect(paraFilaResistencia(conZona, { zonaSesion: '' }).zona).toBe('UMB')
    expect(paraFilaResistencia(conZona, {}).zona).toBe('UMB')
  })

  it('la disciplina de la sesión manda, salvo en un brick', () => {
    const conDisc = fijar(v, 'resistencia', 'disciplina', 'Ciclismo')
    expect(paraFilaResistencia(conDisc, { disciplinaSesion: 'Carrera' }).disciplina).toBe('Carrera')
    // En un brick, «Brick» NO es un deporte: cada bloque lleva el suyo, y sin la
    // franja hay que elegirlo bloque a bloque.
    expect(paraFilaResistencia(conDisc, { disciplinaSesion: 'Brick' }).disciplina).toBe('Ciclismo')
  })

  it('un brick sin disciplina fijada deja la casilla vacía, como hasta ahora', () => {
    expect('disciplina' in paraFilaResistencia(v, { disciplinaSesion: 'Brick' })).toBe(false)
  })
})

describe('con qué nace una fila de fuerza', () => {
  const v = leer({
    resistencia: {},
    fuerza: { grupoMuscular: 'Pierna', tipoSerie: 'Drop set', medida: 'tiempo', control: 'RPE', series: '3', descanso: '2:00' },
  })

  it('lo fijado viaja a sus campos de la fila', () => {
    const f = paraFilaFuerza(v, {})
    expect(f.grupoMuscularSel).toBe('Pierna')
    expect(f.tipoSerie).toBe('Drop set')
    expect(f.medida).toBe('tiempo')
    expect(f.controlTipo).toBe('RPE')
    expect(f.series).toBe('3')
    expect(f.descanso).toBe('2:00')
  })

  it('el ejercicio NO se predetermina: repetirlo en toda la sesión no tiene sentido', () => {
    const f = paraFilaFuerza(v, {})
    expect('ejercicioSelId' in f).toBe(false)
  })

  it('la zona de la sesión gana, igual que en resistencia', () => {
    const conZona = fijar(v, 'fuerza', 'zona', 'FMX')
    expect(paraFilaFuerza(conZona, { zonaSesion: 'FRE' }).zonaFuerzaTarea).toBe('FRE')
    expect(paraFilaFuerza(conZona, {}).zonaFuerzaTarea).toBe('FMX')
  })

  it('sin nada fijado no aporta nada', () => {
    expect(paraFilaFuerza(SIN_FIJAR, {})).toEqual({})
  })
})

describe('guardar', () => {
  const sb = (error: any) => ({
    from: () => ({ update: () => ({ eq: async () => ({ error }) }) }),
  })

  it('sin error devuelve null', async () => {
    expect(await guardar(sb(null), 1, SIN_FIJAR)).toBeNull()
  })

  it('SI FALTA LA COLUMNA no revienta el editor: se avisa y se sigue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await guardar(sb({ message: 'column "valores_por_defecto" does not exist' }), 1, SIN_FIJAR)
    expect(r).toContain('does not exist')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('la intensidad, que es lo que más se repite en una sesión de una zona', () => {
  it('viaja al «@» de la fila', () => {
    const v = leer({ resistencia: { intensidad: '140-150 ppm' }, fuerza: {} })
    expect(paraFilaResistencia(v, {}).intensidadPersonalizada).toBe('140-150 ppm')
  })

  it('sin fijar, la casilla nace vacía y sigue saliendo la sugerencia de la zona', () => {
    // La sugerencia es el texto de fondo, no un valor guardado: eso se corrigió
    // el 30/08 y no se vuelve atrás. La franja escribe solo lo que tecleas tú.
    expect('intensidadPersonalizada' in paraFilaResistencia(leer({}), {})).toBe(false)
  })

  it('en fuerza, el número del control hace lo mismo', () => {
    const v = leer({ resistencia: {}, fuerza: { control: 'rir', controlValor: '2' } })
    const f = paraFilaFuerza(v, {})
    expect(f.controlTipo).toBe('rir')
    expect(f.rir).toBe('2')
  })

  it('el valor del control sin la escala se guarda igual: la fila ya nace en RIR', () => {
    const v = leer({ resistencia: {}, fuerza: { controlValor: '8' } })
    expect(paraFilaFuerza(v, {}).rir).toBe('8')
    expect('controlTipo' in paraFilaFuerza(v, {})).toBe(false)
  })
})
