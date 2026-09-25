import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { COMPLEJOS, FUNCIONAL, esComplejo, grupoAlCrear, grupoAlEditar } from './grupo-ejercicio'

describe('el grupo de un ejercicio nuevo', () => {
  it('un complejo va a Complejos aunque tenga regiones', () => {
    expect(grupoAlCrear(['Fuerza', COMPLEJOS], ['Cuádriceps', 'Hombro'])).toBe(COMPLEJOS)
  })

  it('el resto, a su primera región, como siempre', () => {
    expect(grupoAlCrear(['Fuerza'], ['Glúteos', 'Isquiotibiales'])).toBe('Glúteos')
  })

  it('sin región: Movilidad u Otros', () => {
    expect(grupoAlCrear(['Movilidad'], [])).toBe('Movilidad y flexibilidad')
    expect(grupoAlCrear(['Fuerza'], [])).toBe('Otros')
    expect(grupoAlCrear(null, null)).toBe('Otros')
  })
})

describe('el grupo al editar', () => {
  it('al marcarlo como complejo, pasa a Complejos', () => {
    expect(grupoAlEditar('Hombro y manguito rotador', ['Fuerza', COMPLEJOS], ['Hombro'])).toBe(COMPLEJOS)
  })

  it('al quitarle la etiqueta, vuelve a su región', () => {
    /* «Hombro y manguito rotador», no «Hombro»: la región se traduce al
       grupo que ya existe en la biblioteca. Antes devolvía la región tal cual
       y así nacían los gemelos. */
    expect(grupoAlEditar(COMPLEJOS, ['Fuerza'], ['Hombro'])).toBe('Hombro y manguito rotador')
  })

  /* Los de disciplina no tienen región a propósito: rehacerles el grupo los
     mandaría a «Otros». */
  it('si no entra ni sale de Complejos, no se toca', () => {
    expect(grupoAlEditar('Natación — específico', ['Fuerza'], [])).toBeNull()
    expect(grupoAlEditar(COMPLEJOS, ['Fuerza', COMPLEJOS], ['Hombro'])).toBeNull()
  })
})

describe('el grupo Funcional (estaciones de HYROX, gimnásticos)', () => {
  it('funciona igual que Complejos', () => {
    expect(grupoAlCrear(['Fuerza', FUNCIONAL], ['Cuádriceps'])).toBe(FUNCIONAL)
    expect(grupoAlEditar('Cuádriceps', ['Fuerza', FUNCIONAL], ['Cuádriceps'])).toBe(FUNCIONAL)
    expect(grupoAlEditar(FUNCIONAL, ['Fuerza'], ['Cuádriceps'])).toBe('Cuádriceps')
  })

  it('pasar de Complejos a Funcional cambia el grupo', () => {
    expect(grupoAlEditar(COMPLEJOS, ['Fuerza', FUNCIONAL], [])).toBe(FUNCIONAL)
  })
})

describe('qué es un complejo', () => {
  it('lo dice la etiqueta', () => {
    expect(esComplejo(['Fuerza', COMPLEJOS])).toBe(true)
    expect(esComplejo(['Fuerza'])).toBe(false)
    expect(esComplejo(undefined)).toBe(false)
  })
})

// ============================================================
// QUE NO VUELVAN A NACER GRUPOS GEMELOS
// ============================================================
// ESTE TEST LEE EL CÓDIGO. El grupo de un ejercicio nuevo sale de su primera
// REGIÓN (grupoAlCrear), y las regiones de /fuerza se llaman más corto que los
// grupos de la biblioteca. Así nació «Espalda alta» al lado de «Espalda alta y
// romboides», con los remos repartidos entre los dos; se fusionaron a mano el
// 25/09/2026 y el desplegable pasó de 22 grupos a 20.
//
// Si mañana alguien añade una región a /fuerza y no la mapea, este test salta
// en vez de dejar que el gemelo aparezca solo con el siguiente ejercicio.
describe('las regiones de /fuerza no abren grupos nuevos', () => {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../app/fuerza/page.tsx'), 'utf8')
  const bloque = fuente.match(/const REGIONES = \[([\s\S]*?)\]/)
  const regiones = [...(bloque?.[1] || '').matchAll(/'([^']+)'/g)].map(m => m[1])

  /* Los 20 grupos que existen hoy en la biblioteca, comprobados contra la base
     el 25/09/2026 después de la fusión. Un ejercicio nuevo puede caer en
     «Otros» —si no le pones región, no hay grupo que ponerle—, pero no debería
     inventarse uno. */
  const GRUPOS_REALES = [
    'Bíceps', 'Cadera y aductores', 'Carrera — específico', 'Ciclismo — específico',
    'Complejos', 'Core y estabilidad', 'Cuádriceps', 'Cuello y cervical',
    'Espalda alta y romboides', 'Espalda baja', 'Funcional', 'Glúteos',
    'Hombro y manguito rotador', 'Isquiotibiales', 'Movilidad y flexibilidad',
    'Natación — específico', 'Pectoral', 'Rodilla (fortalecimiento)',
    'Tobillo y pie', 'Tríceps',
  ]

  it('se leen las regiones del fichero', () => {
    expect(regiones.length).toBeGreaterThan(10)
  })

  it.each(regiones)('la región %s cae en un grupo que ya existe', region => {
    expect(GRUPOS_REALES).toContain(grupoAlCrear(['Fuerza'], [region]))
  })

  it('las regiones cortas van al grupo largo, no a uno nuevo', () => {
    expect(grupoAlCrear(['Fuerza'], ['Core'])).toBe('Core y estabilidad')
    expect(grupoAlCrear(['Fuerza'], ['Rodilla'])).toBe('Rodilla (fortalecimiento)')
    expect(grupoAlCrear(['Fuerza'], ['Espalda alta'])).toBe('Espalda alta y romboides')
  })

  it('sin región sigue cayendo en Otros, que es decir «hay que clasificarlo»', () => {
    expect(grupoAlCrear(['Fuerza'], [])).toBe('Otros')
    expect(grupoAlCrear(['Movilidad'], [])).toBe('Movilidad y flexibilidad')
  })
})
