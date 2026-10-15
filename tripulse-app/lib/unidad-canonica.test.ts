import { describe, it, expect } from 'vitest'
import { unidadCanonica } from './referencia-propia'
import { textoTramo, textoPunto, textoAbierto } from './prescripcion-zona'
import { evaluar, escalera } from './clasificaciones-zonas'
import { hitosDisponibles } from './hitos'
import type { Clasificacion, Limite, ZonaEntrenador } from './zonas-entrenador'
import type { TestConMediciones } from './referencia-propia'
import { leerModelo } from './lab-guardar'

describe('la unidad, escrita como la escriba el entrenador', () => {
  it('km/h en cualquier forma es km/h', () => {
    for (const u of ['km/h', 'Km/h', 'KM/H', 'Km/H', ' km / h ', 'kmh', 'KPH']) {
      expect(unidadCanonica(u), u).toBe('km/h')
    }
  })

  it('los vatios y el ritmo en el 100, igual', () => {
    for (const u of ['W', 'w', 'vatios', 'Watts']) expect(unidadCanonica(u), u).toBe('W')
    for (const u of ['s/100', 's/100m', 'seg/100m', 'S/100M']) expect(unidadCanonica(u), u).toBe('s/100')
  })

  it('lo demás se queda como lo escribió', () => {
    expect(unidadCanonica('lpm')).toBe('lpm')
    expect(unidadCanonica(' Lpm ')).toBe('Lpm')
    expect(unidadCanonica('')).toBe('')
  })

  it('UN «Km/h» SE LEE COMO RITMO, igual que un «km/h»', () => {
    /* Antes solo valía la de minúsculas: un «Km/h» salía como «12–13,8 Km/h»
       y su escalera sin ritmos, sin que nada fallara. */
    expect(textoTramo({ desde: 12, hasta: 13.8, unidad: 'Km/h', inverso: false })).toBe('4:21–5:00 /km')
    expect(textoPunto(12, 'KM/H')).toBe('5:00 /km')
    expect(textoAbierto(12, 'Km/H', false, 'bajo')).toBe('más lento de 5:00 /km')
    expect(textoTramo({ desde: 200, hasta: 250, unidad: 'vatios', inverso: false })).toBe('200–250 W')
  })
})

describe('el caso real: «Zonas Miguel» con los números de Nico', () => {
  /* Un test del laboratorio con tres casillas sueltas y tres resultados que son
     esas casillas, con las unidades escritas «Km/h» y «KM/H», como en la base.
     VT1 12, VT2 14 y VO2 15,5 km/h. */
  const modelo = {
    sueltos: [
      { clase: 'medida', clave: 'vt1', valor: '', unidad: 'KM/H', etiqueta: 'VT1', instrumento: 'mano' },
      { clase: 'medida', clave: 'vt2', valor: '', unidad: 'Km/H', etiqueta: 'VT2', instrumento: 'mano' },
      { clase: 'medida', clave: 'vo2max', valor: '', unidad: 'Km/H', etiqueta: 'VO2Max', instrumento: 'mano' },
    ],
    bloques: [],
    resultados: [
      { ancla: 'umbral_aer', nombre: 'VT1', unidad: 'Km/h', formula: [{ t: 'var', v: 'vt1' }] },
      { ancla: 'umbral', nombre: 'VT2', unidad: 'Km/H', formula: [{ t: 'var', v: 'vt2' }] },
      { ancla: 'vo2max', nombre: 'VO2', unidad: 'Km/h', formula: [{ t: 'var', v: 'vo2max' }] },
    ],
  }
  const lab = leerModelo(modelo, 'Test Laboratorio Miguel', 'Carrera')!
  const nico: TestConMediciones[] = [{
    id: 25, nombre: 'Test Laboratorio Miguel', deporte: 'Carrera',
    def: { nombre: 'Test Laboratorio Miguel', deporte: 'Carrera', campos: [], resultados: [] },
    lab,
    mediciones: [{ fecha: '2026-10-14', datos: { vt1: '12', vt2: '14', vo2max: '15.5' } }],
  }]
  const V1 = 'propia:25:0', V2 = 'propia:25:1', VO = 'propia:25:2'
  const l = (ref: string, pct: number): Limite => ({ ref, pct })
  const z = (sigla: string, desde: Limite | null, hasta: Limite | null, orden: number): ZonaEntrenador =>
    ({ deporte: 'Carrera', sigla, nombre: sigla, desde, hasta, rpeMin: 5, rpeMax: null, color: '#a78bfa', orden })
  const miguel: Clasificacion = {
    id: 3, nombre: 'Zonas Miguel', deporte: 'Carrera', hitos: [V1, V2, VO], orden: 0,
    zonas: [
      z('N1', null, l(V1, 100), 0),
      z('N2', l(V1, 100), l(V1, 115), 1),
      z('N3', l(V1, 116), l(V2, 95), 2),
      z('N4', l(V2, 95), l(V2, 105), 3),
      z('N5', l(VO, 100), l(VO, 100), 4),
    ],
  }
  const ev = () => evaluar(miguel, hitosDisponibles('Carrera', nico), {}, nico)

  it('SALE CON SUS NÚMEROS, Y EN RITMO', () => {
    const e = ev()
    expect(e.hitos.map(h => h.valor)).toEqual([12, 14, 15.5])
    expect(e.zonas.find(x => x.zona.sigla === 'N1')?.texto).toBe('más lento de 5:00 /km')
    expect(e.zonas.find(x => x.zona.sigla === 'N2')?.texto).toBe('4:21–5:00 /km')
    const esc = escalera(e)!
    expect(esc.leyenda).toContain('min/km')
    expect(esc.ticks.some(t => t.arriba.includes(':'))).toBe(true)
  })

  it('Y LE AVISA DE LO QUE NO ENCAJA: N3 al revés, N2 y N4 se pisan, hueco antes de N5', () => {
    /* Con el VT2 solo un 17 % por encima del VT1, su VT1 + 16 % (13,9 km/h)
       pasa su VT2 − 5 % (13,3 km/h). */
    const avisos = ev().avisos
    expect(avisos.filter(a => a.tipo === 'reves').map(a => a.siglas)).toEqual([['N3']])
    expect(avisos.filter(a => a.tipo === 'pisan').map(a => a.siglas)).toEqual([['N2', 'N4']])
    expect(avisos.filter(a => a.tipo === 'hueco').map(a => a.siglas)).toEqual([['N4', 'N5']])
  })
})
