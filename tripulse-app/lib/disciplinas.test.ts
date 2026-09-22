import { describe, it, expect } from 'vitest'
import {
  HIBRIDO, TODAS, PERFILES, esDisciplinaDeFuerza, disciplinaDeTareaFuerza, disciplinasDe, paraProgramar,
  perfilDe, alternar, guardarPerfil, etiquetaDisciplina, normalizar,
} from './disciplinas'

describe('qué se programa con la tabla de fuerza', () => {
  it('Fuerza e Híbrido; el resto no', () => {
    expect(esDisciplinaDeFuerza('Fuerza')).toBe(true)
    expect(esDisciplinaDeFuerza(HIBRIDO)).toBe(true)
    for (const d of ['Carrera', 'Natacion', 'Natación', 'Ciclismo', 'Brick', '', null, undefined]) {
      expect(esDisciplinaDeFuerza(d)).toBe(false)
    }
  })
})

describe('con qué disciplina se guarda una tarea de fuerza', () => {
  /* Si una tarea de una sesión híbrida se guardara como 'Fuerza', las gráficas
     por bloque contarían el híbrido como fuerza. */
  it('la de la sesión si es híbrida; si no, Fuerza', () => {
    expect(disciplinaDeTareaFuerza(HIBRIDO)).toBe(HIBRIDO)
    expect(disciplinaDeTareaFuerza('Fuerza')).toBe('Fuerza')
    expect(disciplinaDeTareaFuerza(null)).toBe('Fuerza')
  })
})

describe('las disciplinas de un deportista', () => {
  /* Los que ya existían no tienen nada guardado: tienen que seguir viéndolo todo. */
  it('sin elegir, todas', () => {
    expect(disciplinasDe({ disciplinas: null })).toEqual(TODAS)
    expect(disciplinasDe({ disciplinas: [] })).toEqual(TODAS)
    expect(disciplinasDe(null)).toEqual(TODAS)
  })

  it('las elegidas, en el orden del catálogo', () => {
    expect(disciplinasDe({ disciplinas: ['Fuerza', 'Carrera'] })).toEqual(['Carrera', 'Fuerza'])
  })

  it('la natación con tilde de las sesiones viejas cuenta como natación', () => {
    expect(disciplinasDe({ disciplinas: ['Natación'] })).toEqual(['Natacion'])
    expect(normalizar('Natación')).toBe('Natacion')
  })

  it('lo que no existe se ignora, y si no queda nada son todas', () => {
    expect(disciplinasDe({ disciplinas: ['Esquí'] })).toEqual(TODAS)
  })
})

describe('recortar un menú a las del deportista', () => {
  const corredor = { disciplinas: ['Carrera', 'Fuerza'] }

  it('quita las que no hace', () => {
    expect(paraProgramar(corredor, ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'])).toEqual(['Carrera', 'Fuerza'])
  })

  it('respeta las opciones de cada pantalla', () => {
    /* Si la pantalla no ofrece Fuerza, no aparece por estar marcada. */
    expect(paraProgramar(corredor, ['Natacion', 'Ciclismo', 'Carrera'])).toEqual(['Carrera'])
  })

  /* Editar la sesión de natación de alguien que ya no nada: el menú no puede
     decir otra cosa que lo que la sesión es. */
  it('la disciplina actual se queda aunque no esté marcada', () => {
    expect(paraProgramar(corredor, ['Natacion', 'Carrera', 'Fuerza'], 'Natacion')).toEqual(['Natacion', 'Carrera', 'Fuerza'])
    expect(paraProgramar(corredor, ['Natación', 'Carrera'], 'Natacion')).toEqual(['Natación', 'Carrera'])
  })

  it('nunca deja el menú vacío', () => {
    const nadador = { disciplinas: ['Natacion'] }
    expect(paraProgramar(nadador, ['Carrera', 'Fuerza'])).toEqual(['Carrera', 'Fuerza'])
  })

  it('sin elegir, el menú no cambia', () => {
    expect(paraProgramar(null, ['Natacion', 'Carrera', HIBRIDO])).toEqual(['Natacion', 'Carrera', HIBRIDO])
  })
})

describe('marcar y desmarcar', () => {
  it('desmarcar una de todas guarda la lista sin ella', () => {
    expect(alternar(null, 'Natacion')).toEqual(TODAS.filter(d => d !== 'Natacion'))
  })

  /* Guardar «todas» como lista haría que una disciplina nueva no le saliera. */
  it('volver a tenerlas todas guarda null', () => {
    const sinNatacion = TODAS.filter(d => d !== 'Natacion')
    expect(alternar(sinNatacion, 'Natacion')).toBeNull()
  })

  it('no deja quitar la última', () => {
    expect(alternar(['Carrera'], 'Carrera')).toEqual(['Carrera'])
  })

  it('los atajos guardan su lista, y «Todo» guarda null', () => {
    const hyrox = PERFILES.find(p => p.id === 'hyrox')!
    expect(guardarPerfil(hyrox)).toEqual(['Carrera', 'Fuerza', HIBRIDO])
    expect(guardarPerfil(PERFILES.find(p => p.id === 'todo')!)).toBeNull()
  })

  it('reconoce el atajo que coincide', () => {
    expect(perfilDe(['Fuerza', 'Carrera'])).toBe('atletismo')
    expect(perfilDe(null)).toBe('todo')
    expect(perfilDe(['Carrera', 'Natacion'])).toBeNull()
  })
})

describe('nombres', () => {
  it('Híbrido con tilde en pantalla, sin ella en la base', () => {
    expect(HIBRIDO).toBe('Hibrido')
    expect(etiquetaDisciplina(HIBRIDO)).toBe('Híbrido')
    expect(etiquetaDisciplina('Natación')).toBe('Natación')
  })
})
