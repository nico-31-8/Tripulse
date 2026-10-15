import { describe, it, expect } from 'vitest'
import { hitosDisponibles, valorHito, mismaUnidad, esIdHito, leerIdApp, leerIdPropia, buscarHito } from './hitos'
import type { TestConMediciones } from './referencia-propia'
import type { DefinicionTest } from './test-definicion'

const PRUEBA: DefinicionTest = {
  nombre: 'Prueba de esfuerzo', deporte: 'Carrera',
  campos: [{ clave: 'vt1', etiqueta: 'VT1' }, { clave: 'fc', etiqueta: 'FC VT1' }],
  resultados: [
    { nombre: 'VT1', unidad: 'km/h', ancla: 'umbral_aer', formula: [{ t: 'var', v: 'vt1' }], graf: true },
    { nombre: 'FC en VT1', unidad: 'lpm', ancla: 'umbral_aer', formula: [{ t: 'var', v: 'fc' }], graf: true },
    { nombre: 'Notas', unidad: '', ancla: 'nada', formula: [{ t: 'var', v: 'vt1' }], graf: false },
  ],
}
const MEDIDO: TestConMediciones[] = [{
  id: 9, nombre: 'Prueba de esfuerzo', deporte: 'Carrera', def: PRUEBA,
  mediciones: [{ fecha: '2026-09-01', datos: { vt1: 11.5, fc: 150 } }, { fecha: '2026-10-02', datos: { vt1: 12, fc: 152 } }],
}]

describe('cómo se escribe un hito', () => {
  it('los de la app y los de un test', () => {
    expect(leerIdApp('app:css')).toBe('css')
    expect(leerIdApp('app:pam')).toBeNull()
    expect(leerIdPropia('propia:9:0')).toEqual({ idDefinicion: 9, indice: 0 })
    expect(esIdHito('app:vam')).toBe(true)
    expect(esIdHito('propia:9:1')).toBe(true)
    expect(esIdHito('VT1')).toBe(false)
    expect(esIdHito(7)).toBe(false)
  })
})

describe('qué hitos hay', () => {
  it('EL DE LA APP PRIMERO, y luego los resultados que valen como referencia', () => {
    const h = hitosDisponibles('Carrera', MEDIDO)
    expect(h.map(x => x.id)).toEqual(['app:vam', 'propia:9:0', 'propia:9:1'])
    expect(h[1]).toMatchObject({ corto: 'VT1', largo: 'Prueba de esfuerzo · VT1', unidad: 'km/h', inverso: false, tipo: 'propia' })
  })

  it('el de seguimiento no es un hito', () => {
    expect(buscarHito(hitosDisponibles('Carrera', MEDIDO), 'propia:9:2')).toBeNull()
  })

  it('FILTRADOS POR DEPORTE: uno de carrera no sale en natación', () => {
    expect(hitosDisponibles('Natación', MEDIDO).map(x => x.id)).toEqual(['app:css'])
  })

  it('el CSS como hito va en el sentido de un ritmo', () => {
    expect(hitosDisponibles('Natacion', [])[0]).toMatchObject({ unidad: 's/100', inverso: true })
  })
})

describe('cuánto vale', () => {
  it('EL DE UN TEST, CON SU ÚLTIMA MEDICIÓN Y SU FECHA', () => {
    expect(valorHito('propia:9:0', {}, MEDIDO)).toEqual({ valor: 12, fecha: '2026-10-02' })
  })

  it('los de la app; el CSS pasado a segundos por 100', () => {
    expect(valorHito('app:vam', { vam: 16 }, [])).toEqual({ valor: 16, fecha: null })
    expect(valorHito('app:css', { css: 1.25 }, [])?.valor).toBe(80)
  })

  it('sin medir, null; y un cero no es un número', () => {
    expect(valorHito('app:ftp', { ftp: 0 }, [])).toBeNull()
    expect(valorHito('app:vam', null, [])).toBeNull()
    expect(valorHito('propia:7:0', {}, MEDIDO)).toBeNull()
    expect(valorHito('basura', {}, MEDIDO)).toBeNull()
  })
})

describe('una clasificación, una unidad', () => {
  const [vam, vt1, fc] = hitosDisponibles('Carrera', MEDIDO)
  it('la VAM y un VT1 en km/h se mezclan; un VT1 en lpm, no', () => {
    expect(mismaUnidad(vam, vt1)).toBe(true)
    expect(mismaUnidad(vt1, fc)).toBe(false)
  })

  it('sin fijarse en mayúsculas ni espacios, pero sí en el sentido', () => {
    expect(mismaUnidad({ ...vt1, unidad: 'Km / h' }, vam)).toBe(true)
    expect(mismaUnidad({ ...vt1, inverso: true }, vam)).toBe(false)
  })
})
