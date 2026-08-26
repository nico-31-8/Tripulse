import { describe, it, expect } from 'vitest'
import {
  EJERCICIO_NUEVO_VACIO, type EjercicioNuevo, gruposExistentes, queLeFalta, filaDe, SIN_CLASIFICAR,
} from './ejercicio-propio'

const e = (p: Partial<EjercicioNuevo>): EjercicioNuevo => ({ ...EJERCICIO_NUEVO_VACIO, ...p })

describe('los grupos que ya existen', () => {
  it('salen sin repetir y en orden', () => {
    const bib = [
      { grupo_muscular: 'Glúteos' }, { grupo_muscular: 'Core' },
      { grupo_muscular: 'Glúteos' }, { grupo_muscular: 'Cuádriceps' },
    ]
    expect(gruposExistentes(bib)).toEqual(['Core', 'Cuádriceps', 'Glúteos'])
  })

  it('los vacíos y los nulos no cuentan como grupo', () => {
    expect(gruposExistentes([{ grupo_muscular: null }, { grupo_muscular: '  ' }, { grupo_muscular: 'Core' }]))
      .toEqual(['Core'])
  })
})

describe('qué le falta para poder guardarse', () => {
  it('sin nombre no hay ejercicio', () => {
    expect(queLeFalta(e({}))).toMatch(/nombre/i)
  })

  it('un nombre de dos letras no sirve', () => {
    expect(queLeFalta(e({ nombre: 'ab' }))).toMatch(/corto/i)
  })

  it('con nombre basta: lo demás se rellena luego', () => {
    expect(queLeFalta(e({ nombre: 'Prensa inclinada' }))).toBe(null)
  })

  /* El «la última vez» casa los ejercicios POR NOMBRE. Dos filas distintas con
     el mismo nombre mezclarían dos progresiones en una. */
  it('un nombre repetido se rechaza', () => {
    expect(queLeFalta(e({ nombre: 'Sentadilla' }), ['Sentadilla'])).toMatch(/ya hay/i)
  })

  it('y se rechaza aunque cambien tildes o mayúsculas', () => {
    expect(queLeFalta(e({ nombre: 'zancada búlgara' }), ['Zancada Bulgara'])).toMatch(/ya hay/i)
  })

  it('los espacios de los lados no hacen que un nombre sea distinto', () => {
    expect(queLeFalta(e({ nombre: '  Sentadilla  ' }), ['Sentadilla'])).toMatch(/ya hay/i)
  })
})

describe('la fila que va a la base', () => {
  it('lleva el dueño puesto', () => {
    expect(filaDe(e({ nombre: 'Prensa' }), 42).id_deportista).toBe(42)
  })

  /* El grupo es lo único de este formulario que sale en una pantalla del
     entrenador: agrupa el reparto de series de la semana. Sin grupo, la fila
     tiene que caer en el mismo cajón que usa esa pantalla, no en null. */
  it('sin grupo cae en «Sin clasificar», no en null', () => {
    expect(filaDe(e({ nombre: 'Prensa' }), 1).grupo_muscular).toBe(SIN_CLASIFICAR)
  })

  it('el grupo elegido viaja tal cual', () => {
    expect(filaDe(e({ nombre: 'Prensa', grupoMuscular: 'Cuádriceps' }), 1).grupo_muscular).toBe('Cuádriceps')
  })

  /* `tipo` es text[] en la base. Mandarlo como cadena suelta lo rechaza. */
  it('el tipo va como lista, no como texto', () => {
    expect(filaDe(e({ nombre: 'Prensa', tipo: 'Movilidad' }), 1).tipo).toEqual(['Movilidad'])
  })

  it('sin tipo va una lista vacía', () => {
    expect(filaDe(e({ nombre: 'Prensa', tipo: '' }), 1).tipo).toEqual([])
  })

  it('una descripción en blanco se guarda como null', () => {
    expect(filaDe(e({ nombre: 'Prensa', descripcion: '   ' }), 1).descripcion).toBe(null)
  })

  it('el nombre se guarda sin los espacios de los lados', () => {
    expect(filaDe(e({ nombre: '  Prensa  ' }), 1).nombre).toBe('Prensa')
  })
})
