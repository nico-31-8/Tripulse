import { describe, it, expect } from 'vitest'
import {
  CATALOGO, HIBRIDO, TODAS, PERFILES, esDisciplinaDeFuerza, disciplinaDeTareaFuerza, disciplinasDe, paraProgramar,
  perfilDe, alternar, guardarPerfil, etiquetaDisciplina, etiquetaConEmoji, cortoDisciplina, normalizar,
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

// ============================================================
// El color y las clases son el mismo color dicho de dos maneras
// ============================================================
// Cada disciplina lleva su color dos veces: en hex, para lo que se pinta con
// `style` (gráficas, chips del dibujo), y en clases de Tailwind, para lo que se
// pinta con `className` (el punto del calendario, las etiquetas). Tienen que
// decir lo mismo: si no, el punto del calendario y la barra de la gráfica de la
// misma sesión salen de colores distintos y nada se rompe al compilar.
describe('el color hex y la clase de Tailwind coinciden', () => {
  /** La paleta de Tailwind, solo los tonos que usa el catálogo. El oráculo. */
  const HEX_DE_CLASE: Record<string, string> = {
    'bg-blue-400': '#60a5fa',
    'bg-amber-400': '#fbbf24',
    'bg-green-400': '#4ade80',
    'bg-red-400': '#f87171',
    'bg-purple-500': '#a855f7',
    'bg-pink-400': '#f472b6',
  }

  for (const d of CATALOGO) {
    it(d.label + ': ' + d.clases.solido + ' es ' + d.color, () => {
      expect(HEX_DE_CLASE[d.clases.solido], 'Añade ' + d.clases.solido + ' a la tabla de arriba con su hex').toBeDefined()
      expect(HEX_DE_CLASE[d.clases.solido]).toBe(d.color)
    })

    /* Y los tres juegos de clases, del mismo color de Tailwind: el chip suave y
       el botón son tonos del mismo, no otro color. */
    it(d.label + ': el chip y el botón son del mismo color que el sólido', () => {
      const color = d.clases.solido.match(/^bg-([a-z]+)-\d+$/)?.[1]
      expect(color, 'El sólido tiene que ser una clase bg-color-tono').toBeTruthy()
      for (const clase of (d.clases.chip + ' ' + d.clases.boton).split(' ')) {
        expect(clase, clase + ' no es del color ' + color).toContain('-' + color + '-')
      }
    })
  }

  it('ninguna disciplina se queda sin clases', () => {
    for (const d of CATALOGO) {
      expect(d.clases.solido, d.label).toBeTruthy()
      expect(d.clases.chip, d.label).toBeTruthy()
      expect(d.clases.boton, d.label).toBeTruthy()
    }
  })
})

// ============================================================
// El icono, el nombre y las tres letras
// ============================================================
describe('cómo se escribe una disciplina', () => {
  it('«🏊 Natación»: el icono y el nombre juntos', () => {
    expect(etiquetaConEmoji('Natacion')).toBe('🏊 Natación')
    expect(etiquetaConEmoji('Natación')).toBe('🏊 Natación')
    expect(etiquetaConEmoji(HIBRIDO)).toBe('⚡ Híbrido')
  })

  it('lo que no está en el catálogo sale sin hueco delante', () => {
    /* Un espacio suelto al principio de la línea se ve. */
    expect(etiquetaConEmoji('Remo')).toBe('Remo')
    expect(etiquetaConEmoji(null)).toBe('')
    expect(etiquetaConEmoji('')).toBe('')
  })

  it('las tres letras, y el nombre tal cual si no las tiene', () => {
    expect(cortoDisciplina('Natacion')).toBe('Nat')
    expect(cortoDisciplina('Natación')).toBe('Nat')
    expect(cortoDisciplina(HIBRIDO)).toBe('Hib')
    expect(cortoDisciplina('Remo')).toBe('Remo')
    expect(cortoDisciplina(null)).toBe('')
  })

  it('ninguna disciplina comparte las tres letras con otra', () => {
    /* Dos «Car» en la misma casilla no se distinguirían. */
    const cortos = CATALOGO.map(d => d.corto)
    expect(new Set(cortos).size).toBe(cortos.length)
    for (const d of CATALOGO) expect(d.corto, d.label).toHaveLength(3)
  })
})
