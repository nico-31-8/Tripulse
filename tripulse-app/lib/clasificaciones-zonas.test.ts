import { describe, it, expect } from 'vitest'
import {
  evaluar, escalera, avisosDeZona, hitoConPct, explicarLimites, mayuscula,
} from './clasificaciones-zonas'
import { hitosDisponibles } from './hitos'
import type { Clasificacion, ZonaEntrenador, Limite } from './zonas-entrenador'
import type { TestConMediciones } from './referencia-propia'
import type { DefinicionTest } from './test-definicion'
import type { Bloque } from './formula'

const v = (n: string): Bloque => ({ t: 'var', v: n })
const op = (o: string): Bloque => ({ t: 'op', v: o })
const num = (n: number): Bloque => ({ t: 'num', v: n })

/* Una prueba de esfuerzo de carrera: tres hitos en km/h. */
const PRUEBA: DefinicionTest = {
  nombre: 'Prueba de esfuerzo', deporte: 'Carrera',
  campos: [{ clave: 'vt1', etiqueta: 'VT1' }, { clave: 'vt2', etiqueta: 'VT2' }, { clave: 'vo2', etiqueta: 'VO2máx' }],
  resultados: [
    { nombre: 'VT1', unidad: 'km/h', ancla: 'umbral_aer', formula: [v('vt1')], graf: true },
    { nombre: 'VT2', unidad: 'km/h', ancla: 'umbral', formula: [v('vt2')], graf: true },
    { nombre: 'VO2máx', unidad: 'km/h', ancla: 'vo2max', formula: [v('vo2')], graf: true },
  ],
}
const prueba = (datos: Record<string, number>): TestConMediciones => ({
  id: 9, nombre: 'Prueba de esfuerzo', deporte: 'Carrera', def: PRUEBA,
  mediciones: [{ fecha: '2026-10-02', datos }],
})
const VT1 = 'propia:9:0', VT2 = 'propia:9:1', VO2 = 'propia:9:2'
const l = (ref: string, pct: number): Limite => ({ ref, pct })

const zona = (sigla: string, desde: Limite | null, hasta: Limite | null, orden: number): ZonaEntrenador => ({
  deporte: 'Carrera', sigla, nombre: sigla, desde, hasta, rpeMin: 5, rpeMax: null, color: '#4ade80', orden,
})

/* La de la maqueta: del laboratorio, seis zonas. */
const LAB: Clasificacion = {
  id: 1, nombre: 'Laboratorio · VT1–VT2–VO2máx', deporte: 'Carrera', hitos: [VT1, VT2, VO2], orden: 0,
  zonas: [
    zona('REG', null, l(VT1, 100), 0),
    zona('BASE', l(VT1, 100), l(VT1, 115), 1),
    zona('TEMPO', l(VT1, 115), l(VT2, 95), 2),
    zona('UMB', l(VT2, 95), l(VT2, 105), 3),
    zona('VO2', l(VT2, 105), l(VO2, 100), 4),
    zona('MAX', l(VO2, 100), null, 5),
  ],
}

const ANA = [prueba({ vt1: 12, vt2: 15, vo2: 17.5 })]
const LUIS = [prueba({ vt1: 13.5, vt2: 14.5, vo2: 17 })]
const disp = (propios: TestConMediciones[]) => hitosDisponibles('Carrera', propios)

const deAna = () => evaluar(LAB, disp(ANA), {}, ANA)
const deLuis = () => evaluar(LAB, disp(LUIS), {}, LUIS)
const texto = (ev: ReturnType<typeof evaluar>, sigla: string) => ev.zonas.find(z => z.zona.sigla === sigla)?.texto

// ============================================================

describe('cómo se dice de dónde sale una zona', () => {
  it('el hito con su porcentaje', () => {
    expect(hitoConPct('VT1', 100)).toBe('su VT1')
    expect(hitoConPct('VT1', 115)).toBe('su VT1 + 15 %')
    expect(hitoConPct('VT2', 95, 'tu')).toBe('tu VT2 − 5 %')
    expect(hitoConPct('VT2', 97.5)).toBe('su VT2 − 2,5 %')
  })

  it('las cuatro formas de una zona', () => {
    const c = (ref: string, pct: number, corto: string) => ({ ref, pct, corto })
    expect(explicarLimites(c(VT1, 115, 'VT1'), c(VT2, 95, 'VT2'))).toBe('entre su VT1 + 15 % y su VT2 − 5 %')
    expect(explicarLimites(null, c(VT1, 100, 'VT1'), 'tu')).toBe('por debajo de tu VT1')
    expect(explicarLimites(c(VO2, 100, 'VO2máx'), null)).toBe('por encima de su VO2máx')
    expect(explicarLimites(c(VT2, 95, 'VT2'), c(VT2, 105, 'VT2'))).toBe('entre el 95 y el 105 % de su VT2')
    expect(explicarLimites(c(VT2, 100, 'VT2'), c(VT2, 100, 'VT2'))).toBe('al 100 % de su VT2')
    expect(explicarLimites(null, null)).toBe('')
  })

  it('para la frase sola, la primera en mayúscula', () => {
    expect(mayuscula('por debajo de tu VT1')).toBe('Por debajo de tu VT1')
    expect(mayuscula('')).toBe('')
  })
})

describe('a quien le encaja', () => {
  it('ANA: CADA ZONA EMPIEZA DONDE ACABA LA ANTERIOR, sin avisos', () => {
    const ev = deAna()
    expect(ev.avisos).toEqual([])
    expect(ev.faltan).toEqual([])
    expect(ev.zonas.every(z => z.estado === 'ok')).toBe(true)
  })

  it('lo que le sale en cada una', () => {
    const ev = deAna()
    expect(texto(ev, 'REG')).toBe('más lento de 5:00 /km')
    expect(texto(ev, 'BASE')).toBe('4:21–5:00 /km')
    expect(texto(ev, 'TEMPO')).toBe('4:13–4:21 /km')
    expect(texto(ev, 'UMB')).toBe('3:49–4:13 /km')
    expect(texto(ev, 'VO2')).toBe('3:26–3:49 /km')
    expect(texto(ev, 'MAX')).toBe('más rápido de 3:26 /km')
  })

  it('cada hito con su número y su fecha', () => {
    const ev = deAna()
    expect(ev.hitos.map(h => [h.hito?.corto, h.valor, h.fecha])).toEqual([
      ['VT1', 12, '2026-10-02'], ['VT2', 15, '2026-10-02'], ['VO2máx', 17.5, '2026-10-02'],
    ])
    expect(ev.unidad).toBe('km/h')
    expect(ev.inverso).toBe(false)
  })
})

describe('a quien no le encaja', () => {
  /* Luis tiene el VT1 y el VT2 muy juntos (13,5 y 14,5): su VT1 + 15 % pasa su
     VT2 − 5 %. Con estos porcentajes pasa en cuanto el VT2 está menos de un 21 %
     por encima del VT1. */
  it('TEMPO LE QUEDA AL REVÉS, y se dice con sus números', () => {
    const ev = deLuis()
    const reves = ev.avisos.filter(a => a.tipo === 'reves')
    expect(reves).toHaveLength(1)
    expect(reves[0].titulo).toBe('TEMPO le queda al revés')
    expect(reves[0].detalle).toBe(
      'Empieza en su VT1 + 15 % (3:52 /km) y acaba en su VT2 − 5 % (4:21 /km): el principio va más fuerte que el final.')
    expect(ev.zonas.find(z => z.zona.sigla === 'TEMPO')?.estado).toBe('reves')
  })

  it('Y SE PISAN LAS QUE SE PISAN, con el tramo en el que le tocan dos', () => {
    const pisan = deLuis().avisos.filter(a => a.tipo === 'pisan')
    expect(pisan.map(a => a.siglas)).toEqual([['BASE', 'UMB'], ['BASE', 'VO2']])
    expect(pisan[0].detalle).toBe('En 3:56–4:21 /km le tocan las dos.')
    expect(pisan[1].detalle).toBe('En 3:52–3:56 /km le tocan las dos.')
  })

  it('UNA ZONA AL REVÉS NO CUENTA TAMBIÉN COMO PISADA: sería decir dos veces lo mismo', () => {
    expect(deLuis().avisos.filter(a => a.siglas.includes('TEMPO')).map(a => a.tipo)).toEqual(['reves'])
  })

  it('las que se tocan justo en el borde no se pisan', () => {
    // REG acaba en su VT1 y BASE empieza en su VT1: el mismo número.
    expect(deLuis().avisos.some(a => a.siglas.includes('REG'))).toBe(false)
  })

  it('cada zona sabe sus avisos, para marcarla con ⚠ al elegirla', () => {
    const ev = deLuis()
    expect(avisosDeZona(ev, 'BASE')).toHaveLength(2)
    expect(avisosDeZona(ev, 'MAX')).toHaveLength(0)
    expect(avisosDeZona(null, 'BASE')).toEqual([])
  })
})

describe('los huecos', () => {
  it('UN TRAMO EN EL QUE NO LE TOCA NINGUNA ZONA', () => {
    const conHueco: Clasificacion = {
      ...LAB, zonas: [zona('BASE', l(VT1, 100), l(VT1, 110), 0), zona('TEMPO', l(VT1, 115), l(VT2, 95), 1)],
    }
    const huecos = evaluar(conHueco, disp(ANA), {}, ANA).avisos.filter(a => a.tipo === 'hueco')
    expect(huecos).toHaveLength(1)
    expect(huecos[0].titulo).toBe('Entre BASE y TEMPO hay un hueco')
    // 110 % de 12 = 13,2 km/h (4:33) y 115 % = 13,8 (4:21).
    expect(huecos[0].detalle).toBe('En 4:21–4:33 /km no le toca ninguna zona.')
  })

  it('LAS ZONAS DE NATACIÓN DE HOY TIENEN DOS, y la escalera lo dice', () => {
    /* El 6×100 real: SUA 88–94, UMB 98–102, MAX 103–107 de su Ritmo100 (76 s).
       Entre el 94 y el 98 % no le toca ninguna. Es información, no un error:
       puede ser a propósito, pero hasta ahora no había forma de verlo. */
    const RITMO100: DefinicionTest = {
      nombre: '6x100', deporte: 'Natacion', campos: [{ clave: 'suma', etiqueta: 'Suma' }],
      resultados: [{ nombre: 'Ritmo100', unidad: 's/100', ancla: 'especifica', formula: [v('suma'), op('/'), num(6)], graf: true }],
    }
    const nadador: TestConMediciones[] = [{ id: 2, nombre: '6x100', deporte: 'Natacion', def: RITMO100, mediciones: [{ fecha: '2026-09-08', datos: { suma: 456 } }] }]
    const R = 'propia:2:0'
    const nat: Clasificacion = {
      id: 2, nombre: '6x100 · Ritmo100', deporte: 'Natacion', hitos: [R], orden: 0,
      zonas: [zona('SUA', l(R, 88), l(R, 94), 0), zona('UMB', l(R, 98), l(R, 102), 1), zona('MAX', l(R, 103), l(R, 107), 2)]
        .map(z => ({ ...z, deporte: 'Natacion' })),
    }
    const ev = evaluar(nat, hitosDisponibles('Natacion', nadador), {}, nadador)
    expect(ev.inverso).toBe(true)
    expect(texto(ev, 'SUA')).toBe('1:21–1:26 /100')
    expect(ev.avisos.map(a => a.detalle)).toEqual([
      'En 1:18–1:21 /100 no le toca ninguna zona.',
      'En 1:14–1:15 /100 no le toca ninguna zona.',
    ])
  })
})

describe('cuando le falta un hito', () => {
  it('LAS ZONAS QUE LO NECESITAN SALEN SIN DATO, y se dice cuál falta', () => {
    const sinVo2 = [prueba({ vt1: 12, vt2: 15 })]
    const ev = evaluar(LAB, disp(sinVo2), {}, sinVo2)
    expect(ev.faltan).toEqual(['VO2máx'])
    expect(ev.zonas.filter(z => z.estado === 'sin-dato').map(z => z.zona.sigla)).toEqual(['VO2', 'MAX'])
    expect(texto(ev, 'VO2')).toBe('')
    // Y lo demás sigue: no se inventa nada ni se avisa de lo que no se sabe.
    expect(texto(ev, 'UMB')).toBe('3:49–4:13 /km')
    expect(ev.avisos).toEqual([])
  })

  it('sin la prueba hecha, todo sin dato y sin escalera', () => {
    const ev = evaluar(LAB, disp([]), {}, [])
    expect(ev.zonas.every(z => z.estado === 'sin-dato')).toBe(true)
    expect(escalera(ev)).toBeNull()
  })
})

describe('el hito de la app también vale', () => {
  it('la VAM, en % como los demás', () => {
    const conVam: Clasificacion = {
      id: 3, nombre: 'Sobre la VAM', deporte: 'Carrera', hitos: ['app:vam'], orden: 0,
      zonas: [zona('LENTO', null, l('app:vam', 70), 0), zona('MEDIO', l('app:vam', 70), l('app:vam', 85), 1)],
    }
    const ev = evaluar(conVam, hitosDisponibles('Carrera', []), { vam: 16 }, [])
    // 70 % de 16 = 11,2 km/h → 5:21 /km.
    expect(texto(ev, 'LENTO')).toBe('más lento de 5:21 /km')
    expect(ev.avisos).toEqual([])
  })
})

describe('la escalera', () => {
  it('cada zona en su carril, de menos a más, y los extremos abiertos marcados', () => {
    const e = escalera(deAna())!
    expect(e.carriles.map(c => c.sigla)).toEqual(['REG', 'BASE', 'TEMPO', 'UMB', 'VO2', 'MAX'])
    const izq = e.carriles.map(c => c.izq)
    expect([...izq].sort((a, b) => a - b)).toEqual(izq)
    expect(e.carriles[0].abiertoIzq).toBe(true)
    expect(e.carriles[0].izq).toBe(0)
    expect(e.carriles[5].abiertoDer).toBe(true)
    expect(e.carriles[5].izq + e.carriles[5].ancho).toBeCloseTo(100, 5)
  })

  it('LOS HITOS VAN DONDE EMPIEZAN Y ACABAN SUS ZONAS', () => {
    const e = escalera(deAna())!
    const marca = (corto: string) => e.marcas.find(m => m.corto === corto)!.pos
    const carril = (s: string) => e.carriles.find(c => c.sigla === s)!
    expect(marca('VT1')).toBeCloseTo(carril('BASE').izq, 5)
    expect(marca('VO2máx')).toBeCloseTo(carril('MAX').izq, 5)
    expect(marca('VT1')).toBeLessThan(marca('VT2'))
    expect(marca('VT2')).toBeLessThan(marca('VO2máx'))
  })

  it('el eje en ritmo arriba y km/h debajo', () => {
    const e = escalera(deAna())!
    expect(e.ticks.some(t => t.arriba === '5:00' && t.abajo === '12')).toBe(true)
    expect(e.leyenda).toContain('min/km')
    const pos = e.ticks.map(t => t.pos)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it('LA DE LUIS ENSEÑA EL REVÉS Y LO QUE SE PISA', () => {
    const e = escalera(deLuis())!
    const carril = (s: string) => e.carriles.find(c => c.sigla === s)!
    expect(carril('TEMPO').estado).toBe('reves')
    expect(carril('TEMPO').ancho).toBeGreaterThan(0)
    expect(carril('BASE').pisada).toBe(true)
    expect(carril('UMB').pisada).toBe(true)
    expect(carril('REG').pisada).toBe(false)
  })

  it('EN UN RITMO, MÁS RÁPIDO VA A LA DERECHA igual que en km/h', () => {
    /* En s/100 el número más pequeño es el más fuerte. Si se pintara el número
       tal cual, la escalera de natación iría al revés que la de carrera. */
    const RITMO100: DefinicionTest = {
      nombre: '6x100', deporte: 'Natacion', campos: [{ clave: 'suma', etiqueta: 'Suma' }],
      resultados: [{ nombre: 'Ritmo100', unidad: 's/100', ancla: 'especifica', formula: [v('suma'), op('/'), num(6)], graf: true }],
    }
    const nadador: TestConMediciones[] = [{ id: 2, nombre: '6x100', deporte: 'Natacion', def: RITMO100, mediciones: [{ fecha: '2026-09-08', datos: { suma: 456 } }] }]
    const R = 'propia:2:0'
    const nat: Clasificacion = {
      id: 2, nombre: 'Nat', deporte: 'Natacion', hitos: [R], orden: 0,
      zonas: [zona('SUA', l(R, 88), l(R, 94), 0), zona('MAX', l(R, 103), l(R, 107), 1)].map(z => ({ ...z, deporte: 'Natacion' })),
    }
    const e = escalera(evaluar(nat, hitosDisponibles('Natacion', nadador), {}, nadador))!
    expect(e.carriles[0].izq).toBeLessThan(e.carriles[1].izq)
    // Y las marcas del eje, en ritmo: de más lento a más rápido.
    expect(e.ticks.length).toBeGreaterThan(2)
    expect(e.ticks[0].arriba > e.ticks[e.ticks.length - 1].arriba).toBe(true)
  })
})
