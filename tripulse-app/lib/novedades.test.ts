import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseNovedades, trozos, ultimaFecha } from './novedades'

const MD = `# Novedades de TRIPULSE

Para qué es esto.

---

## 3 de septiembre de 2026

### La batería de tests

La aplicación pasa de 7 tests a **24**.

- Uno
- Dos, que se parte
  en dos líneas

## 1 de septiembre de 2026

- Modo entrenador
`

describe('trocear el fichero', () => {
  const n = parseNovedades(MD)

  it('coge el título y lo de antes de la primera fecha', () => {
    expect(n.titulo).toBe('Novedades de TRIPULSE')
    expect(n.intro).toEqual([{ tipo: 'parrafo', texto: 'Para qué es esto.' }])
  })

  it('una entrada por fecha, en el orden del fichero', () => {
    /* No se reordena a propósito: hay encabezados como «Antes del 17 de agosto»
       que no son una fecha, y colocarlos mal sería peor que respetar lo que
       escribió quien lo editó. */
    expect(n.entradas.map(e => e.fecha))
      .toEqual(['3 de septiembre de 2026', '1 de septiembre de 2026'])
  })

  it('el separador no se cuela como contenido', () => {
    const texto = JSON.stringify(n)
    expect(texto).not.toContain('---')
  })

  it('títulos, párrafos y listas, cada uno en lo suyo', () => {
    expect(n.entradas[0].cuerpo).toEqual([
      { tipo: 'titulo', texto: 'La batería de tests' },
      { tipo: 'parrafo', texto: 'La aplicación pasa de 7 tests a **24**.' },
      { tipo: 'lista', items: ['Uno', 'Dos, que se parte en dos líneas'] },
    ])
  })

  it('un punto de lista partido en varias líneas se junta', () => {
    /* En el fichero los puntos largos se cortan a 80 columnas. Sin esto, la
       segunda mitad saldría como un párrafo suelto debajo de la lista. */
    expect(n.entradas[0].cuerpo[2]).toMatchObject({ items: ['Uno', 'Dos, que se parte en dos líneas'] })
  })

  it('una entrada que empieza por lista no pierde el primer punto', () => {
    expect(n.entradas[1].cuerpo).toEqual([{ tipo: 'lista', items: ['Modo entrenador'] }])
  })

  it('un fichero vacío no revienta', () => {
    for (const v of ['', '   ', undefined as any, null as any]) {
      const r = parseNovedades(v)
      expect(r.entradas).toEqual([])
      expect(r.titulo).toBe('')
    }
  })

  it('la última fecha es la de arriba', () => {
    expect(ultimaFecha(n)).toBe('3 de septiembre de 2026')
    expect(ultimaFecha(parseNovedades(''))).toBeNull()
  })
})

describe('el formato de dentro de la línea', () => {
  it('separa negrita, código y texto', () => {
    expect(trozos('sube a **24** tests con `vitest` hoy')).toEqual([
      { tipo: 'texto', texto: 'sube a ' },
      { tipo: 'fuerte', texto: '24' },
      { tipo: 'texto', texto: ' tests con ' },
      { tipo: 'codigo', texto: 'vitest' },
      { tipo: 'texto', texto: ' hoy' },
    ])
  })

  it('una línea sin nada especial sale entera', () => {
    expect(trozos('sin formato')).toEqual([{ tipo: 'texto', texto: 'sin formato' }])
    expect(trozos('')).toEqual([])
  })

  it('negrita al principio y al final', () => {
    expect(trozos('**todo**')).toEqual([{ tipo: 'fuerte', texto: 'todo' }])
    expect(trozos('**a** y **b**').filter(t => t.tipo === 'fuerte').map(t => t.texto))
      .toEqual(['a', 'b'])
  })

  it('un asterisco suelto no rompe la línea', () => {
    /* Si la expresión regular se comiera un asterisco impar, el resto de la
       frase desaparecería de la pantalla sin que nada fallase. */
    const r = trozos('esto * aquello y **esto sí**')
    expect(r.map(t => t.texto).join('')).toBe('esto * aquello y esto sí')
  })

  it('nada se pierde por el camino', () => {
    /* La comprobación quita los marcadores de los DOS lados. Un `**` suelto sin
       cierre no es un marcador —no hay nada que marcar— y sale como texto tal
       cual; lo que se vigila aquí es que no desaparezca ninguna letra. */
    const limpio = (s: string) => s.replace(/[*`]/g, '')
    for (const l of ['a**b**c', '`x`', 'texto normal', '**', '``', 'a `b` **c** d', '*suelto*']) {
      const junto = trozos(l).map(t => t.texto).join('')
      expect(limpio(junto), l).toBe(limpio(l))
    }
  })
})

describe('contra el fichero de verdad', () => {
  /* Este es el que importa: el parser puede estar perfecto y el fichero haber
     cambiado de forma. Si alguien reescribe NOVEDADES.md de otra manera, salta
     aquí y no en producción con la pantalla en blanco. */
  const real = parseNovedades(readFileSync('NOVEDADES.md', 'utf8'))

  it('se lee y tiene entradas', () => {
    expect(real.titulo).toContain('Novedades')
    expect(real.entradas.length).toBeGreaterThan(3)
  })

  it('ninguna entrada sale vacía', () => {
    for (const e of real.entradas) {
      expect(e.fecha, e.fecha).toBeTruthy()
      expect(e.cuerpo.length, e.fecha).toBeGreaterThan(0)
    }
  })

  it('la primera entrada es la más reciente', () => {
    expect(real.entradas[0].fecha).toContain('septiembre')
  })

  it('la intro explica para qué es', () => {
    expect(real.intro.length).toBeGreaterThan(0)
  })
})
