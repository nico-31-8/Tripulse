// ============================================================
// El segundo ejercicio de una superserie cuenta, y nadie se deja sus columnas
// ============================================================
//
// LO QUE PASÓ (8 de octubre de 2026). El entrenador vio que unas flexiones no
// aparecían en el volumen de pectoral. Eran el SEGUNDO ejercicio de una
// superserie «Dominadas + Flexiones», y una superserie se guarda en UNA fila:
// el segundo va colgado en columnas `encadenado_*`, y entre ellas no había
// grupo muscular. Sin grupo no hay a qué sumar, así que sus series no se
// contaban en ningún sitio. Eran 89 series invisibles.
//
// NO FALLABA NADA. El gráfico salía, con todas sus barras, sencillamente más
// bajas de lo que tocaba en los grupos que solo aparecían como segundo
// ejercicio. Y eso es lo peor que puede hacer un gráfico de volumen: en una
// superserie los dos ejercicios suelen ser de grupos OPUESTOS —tirón con
// empuje—, así que perderse el segundo no baja un poco todo: deja un grupo
// entero a cero.
//
// ESTE TEST LEE EL CÓDIGO para la segunda mitad. La regla ya está en un solo
// sitio (`lineasDe`), pero una regla buena no sirve si la consulta no trae las
// columnas: un `select` sin `encadenado_grupo_muscular` no da error, devuelve
// `undefined`, y el segundo ejercicio vuelve a desaparecer.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { lineasDe, seriesPorGrupo, ejerciciosDeGrupo, esSuperserie, COLUMNAS_SERIES, SIN_CLASIFICAR } from './series-por-grupo'

const RAIZ = path.resolve(__dirname, '..')

/** El caso real: ejercicio 477 de la base. */
const dominadasFlexiones = {
  nombre: 'Dominadas',
  grupo_muscular: 'Espalda alta y romboides',
  series: 3,
  tipo_serie: 'Superserie',
  ejercicio_encadenado_id: 93,
  ejercicio_encadenado_nombre: 'Flexiones',
  encadenado_series: 3,
  encadenado_grupo_muscular: 'Pectoral',
}

describe('una superserie son DOS ejercicios al contar', () => {
  it('saca una línea por cada uno, con su grupo', () => {
    const l = lineasDe(dominadasFlexiones)
    expect(l).toHaveLength(2)
    expect(l[0]).toEqual({ grupo: 'Espalda alta y romboides', series: 3, nombre: 'Dominadas' })
    expect(l[1]).toEqual({ grupo: 'Pectoral', series: 3, nombre: 'Flexiones' })
  })

  it('EL CASO QUE LO DESTAPÓ: el pectoral deja de salir a cero', () => {
    const g = seriesPorGrupo([dominadasFlexiones])
    expect(g.find(x => x.grupo === 'Pectoral')?.series).toBe(3)
    expect(g.find(x => x.grupo === 'Espalda alta y romboides')?.series).toBe(3)
  })

  it('y al abrir el grupo sale por su nombre, no por el del primero', () => {
    expect(ejerciciosDeGrupo([dominadasFlexiones], 'Pectoral'))
      .toEqual([{ nombre: 'Flexiones', series: 3, veces: 1 }])
  })

  it('un ejercicio normal sigue dando UNA línea', () => {
    expect(lineasDe({ nombre: 'Sentadilla', grupo_muscular: 'Piernas', series: 4 })).toHaveLength(1)
  })

  /* Estructuralmente son las mismas: una superserie es A y luego B, tantas
     rondas como diga la serie. Poner un 1 por defecto sí sería inventar. */
  it('sin series propias del segundo, se usan las del primero', () => {
    expect(lineasDe({ ...dominadasFlexiones, encadenado_series: null })[1].series).toBe(3)
  })

  it('sin grupo del segundo va a Sin clasificar, no desaparece', () => {
    const l = lineasDe({ ...dominadasFlexiones, encadenado_grupo_muscular: null })
    expect(l).toHaveLength(2)
    expect(l[1].grupo).toBe(SIN_CLASIFICAR)
  })

  /* Una línea de cardio no son series de fuerza, ni la primera ni la segunda. */
  it('el cardio sigue sin contar', () => {
    expect(lineasDe({ nombre: 'Remo', tipo_serie: 'Cardio', series: 4, cardio_modo: 'tiempo' })).toEqual([])
  })

  it('se reconoce por el enlace o por el nombre, no por el tipo_serie', () => {
    expect(esSuperserie({ tipo_serie: 'Superserie' })).toBe(false)
    expect(esSuperserie({ ejercicio_encadenado_id: 93 })).toBe(true)
    expect(esSuperserie({ ejercicio_encadenado_nombre: 'Flexiones' })).toBe(true)
  })
})

describe('nadie cuenta series sin pedir las columnas', () => {
  /* Los cuatro sitios que cuentan series por grupo. Si aparece otro, se añade
     aquí: esta lista ES la respuesta a «quién cuenta volumen de fuerza». */
  const QUIENES = [
    'lib/series-por-grupo.ts',
    'lib/semana-info.ts',
    'app/volumen/page.tsx',
    'app/planificacion-visual/[id]/dibujo/page.tsx',
  ]

  /* EL SELECT VA ESCRITO ENTERO EN CADA SITIO, y no es un descuido: Supabase
     infiere los tipos del literal, así que montándolo con `'...' + CONSTANTE`
     pierde el tipo y el resultado llega como `GenericStringError`. Se probó y
     el compilador lo rechazó. Por eso lo que se comparte es la LISTA (para
     leerla) y lo que vigila que nadie se deje una columna es este test. */
  /* SOLO los select de la tabla `ejercicios`: buscando «cualquier select con
     grupo_muscular» entraba también el de la tabla de objetivos, que tiene esa
     columna y no cuenta series. Se arranca en cada `from('ejercicios')` y se
     coge el primer select que venga detrás. */
  const columnas = (src: string) => {
    const out: string[] = []
    let i = src.indexOf("from('ejercicios')")
    while (i >= 0) {
      const m = /\.select\(\s*'([^']*)'/.exec(src.slice(i, i + 600))
      if (m) out.push(m[1])
      i = src.indexOf("from('ejercicios')", i + 1)
    }
    const cte = /SELECT_EJERCICIOS_SEMANA\s*=\s*\n?\s*'([^']*)'/.exec(src)
    if (cte) out.push(cte[1])
    return out
  }

  it('todos piden las ocho columnas que hace falta mirar', () => {
    const malos: string[] = []
    for (const f of QUIENES) {
      const src = fs.readFileSync(path.join(RAIZ, f), 'utf8')
      for (const sel of columnas(src)) {
        const faltan = COLUMNAS_SERIES.split(',').map(c => c.trim()).filter(c => !sel.includes(c))
        if (faltan.length) malos.push(f + ' → le faltan: ' + faltan.join(', '))
      }
    }
    expect(malos, malos.join(' | ')).toEqual([])
  })

  it('y que no se quede ningún sitio sin mirar', () => {
    /* Si un fichero deja de tener select de ejercicios, o se renombra, esta
       lista se queda vigilando el aire sin que nadie se entere. */
    for (const f of QUIENES) {
      const src = fs.readFileSync(path.join(RAIZ, f), 'utf8')
      expect(columnas(src).length, f + ' ya no tiene ningún select de ejercicios').toBeGreaterThan(0)
    }
  })

  it('la lista compartida lleva las cuatro del encadenado', () => {
    for (const c of ['ejercicio_encadenado_id', 'ejercicio_encadenado_nombre',
                     'encadenado_series', 'encadenado_grupo_muscular']) {
      expect(COLUMNAS_SERIES).toContain(c)
    }
  })

  /* Si alguien vuelve a leer `e.grupo_muscular` y `e.series` directamente para
     contar, el segundo ejercicio desaparece otra vez. La cuenta pasa por
     `lineasDe` y por ningún otro sitio. */
  it('los contadores pasan por lineasDe', () => {
    const src = fs.readFileSync(path.join(RAIZ, 'lib', 'series-por-grupo.ts'), 'utf8')
    const cuerpo = (nombre: string) => {
      const i = src.indexOf('export function ' + nombre)
      return i < 0 ? '' : src.slice(i, src.indexOf('\n}', i))
    }
    for (const fn of ['seriesPorGrupo', 'ejerciciosDeGrupo']) {
      expect(cuerpo(fn), fn + ' no usa lineasDe').toContain('lineasDe(e)')
    }
  })
})
