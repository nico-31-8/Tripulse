import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { FAMILIAS, OTROS, familiaDe, esDeFamilia, porFamilias } from './familias-grupo'

/** Los 22 grupos que hay hoy en la biblioteca, con la familia que les toca. */
const REALES: [string, string][] = [
  ['Bíceps', 'superior'],
  ['Cadera y aductores', 'inferior'],
  ['Carrera — específico', 'especifico'],
  ['Ciclismo — específico', 'especifico'],
  ['Complejos', 'funcional'],
  ['Core y estabilidad', 'tronco'],
  ['Cuádriceps', 'inferior'],
  ['Cuello y cervical', 'superior'],
  ['Espalda alta', 'superior'],
  ['Espalda alta y romboides', 'superior'],
  ['Espalda baja', 'tronco'],
  ['Funcional', 'funcional'],
  ['Glúteos', 'inferior'],
  ['Hombro y manguito rotador', 'superior'],
  ['Isquiotibiales', 'inferior'],
  ['Movilidad y flexibilidad', 'movilidad'],
  ['Natación — específico', 'especifico'],
  ['Otros', OTROS],
  ['Pectoral', 'superior'],
  ['Rodilla (fortalecimiento)', 'inferior'],
  ['Tobillo y pie', 'inferior'],
  ['Tríceps', 'superior'],
]

describe('cada grupo en su familia', () => {
  it.each(REALES)('%s → %s', (grupo, familia) => {
    expect(familiaDe(grupo)).toBe(familia)
  })

  it('ningún grupo está en dos familias', () => {
    const vistos = new Map<string, string>()
    for (const f of FAMILIAS) {
      for (const g of f.grupos) {
        const clave = g.toLowerCase()
        expect(vistos.get(clave) ?? f.id).toBe(f.id)
        vistos.set(clave, f.id)
      }
    }
  })

  it('«Otros» es la última y no tiene patrón: si lo tuviera, se comería a las de abajo', () => {
    expect(FAMILIAS[FAMILIAS.length - 1].id).toBe(OTROS)
    expect(FAMILIAS[FAMILIAS.length - 1].patron).toBeUndefined()
  })
})

describe('lo que no está escrito', () => {
  it('un grupo que nadie ha clasificado cae en Otros, no desaparece', () => {
    expect(familiaDe('Prensa de mi gimnasio')).toBe(OTROS)
    expect(porFamilias(['Prensa de mi gimnasio']).map(f => f.id)).toEqual([OTROS])
  })

  it('las variantes las pilla el patrón', () => {
    expect(familiaDe('Gemelos y sóleo')).toBe('inferior')
    expect(familiaDe('Lumbares')).toBe('tronco')
    expect(familiaDe('Hombro (prevención)')).toBe('superior')
  })

  it('«Movilidad de cadera» es movilidad, no tren inferior', () => {
    /* Por esto los patrones de parte del cuerpo van anclados al principio:
       Tren inferior se mira ANTES que Movilidad. */
    expect(familiaDe('Movilidad de cadera')).toBe('movilidad')
    expect(familiaDe('Estiramiento de hombro')).toBe('movilidad')
  })

  it('sin grupo, Otros', () => {
    expect(familiaDe(null)).toBe(OTROS)
    expect(familiaDe('  ')).toBe(OTROS)
  })
})

describe('el reparto para el desplegable', () => {
  const grupos = REALES.map(([g]) => g)

  it('salen las familias en su orden y sin las vacías', () => {
    expect(porFamilias(['Cuádriceps', 'Movilidad y flexibilidad']).map(f => f.etiqueta))
      .toEqual(['Tren inferior', 'Movilidad'])
  })

  it('dentro de la familia manda el orden del cuerpo, no el alfabético', () => {
    const inf = porFamilias(grupos).find(f => f.id === 'inferior')!
    expect(inf.grupos).toEqual([
      'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Cadera y aductores',
      'Rodilla (fortalecimiento)', 'Tobillo y pie',
    ])
  })

  it('no se pierde ni se repite ninguno', () => {
    const salen = porFamilias(grupos).flatMap(f => f.grupos)
    expect([...salen].sort()).toEqual([...grupos].sort())
  })

  it('los que caen por patrón van detrás de los conocidos, en orden', () => {
    const inf = porFamilias(['Tobillo y pie', 'Gemelos', 'Aductores', 'Cuádriceps'])
      .find(f => f.id === 'inferior')!
    expect(inf.grupos).toEqual(['Cuádriceps', 'Tobillo y pie', 'Aductores', 'Gemelos'])
  })

  it('se devuelve la cadena de la base tal cual, que es la que se guarda', () => {
    expect(porFamilias(['cuádriceps']).flatMap(f => f.grupos)).toEqual(['cuádriceps'])
  })

  it('sin repetidos ni espacios de más', () => {
    expect(porFamilias(['Pectoral', ' Pectoral ', '', null]).flatMap(f => f.grupos)).toEqual(['Pectoral'])
  })

  it('esDeFamilia es lo que usan los chips de la lupa', () => {
    expect(esDeFamilia('tronco', 'Espalda baja')).toBe(true)
    expect(esDeFamilia('superior', 'Espalda baja')).toBe(false)
  })
})

// ============================================================
// ESTE TEST LEE EL CÓDIGO
// ============================================================
// Los grupos nacen solos: al crear un ejercicio en /fuerza, el suyo sale de la
// primera región que le marques (`grupoAlCrear`). O sea que cada región es un
// grupo que puede aparecer en el desplegable mañana. Si alguien añade una
// región nueva y no la clasifica, saltaría aquí en vez de aparecer en «Otros»
// sin que nadie se entere.
describe('las regiones de /fuerza tienen familia', () => {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../app/fuerza/page.tsx'), 'utf8')
  const bloque = fuente.match(/const REGIONES = \[([\s\S]*?)\]/)
  const regiones = [...(bloque?.[1] || '').matchAll(/'([^']+)'/g)].map(m => m[1])

  it('se leen las regiones del fichero', () => {
    expect(regiones.length).toBeGreaterThan(10)
  })

  it.each(regiones)('%s no cae en Otros', region => {
    expect(familiaDe(region)).not.toBe(OTROS)
  })
})
