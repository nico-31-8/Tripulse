import { describe, it, expect } from 'vitest'
import {
  ANCLAS, tipoDeAncla, leerDefinicion, leerFormula, calcularResultados,
  pegasDe, sePuedeGuardar, pegaDe, seriesDe, menosEsMejor, hitosDe,
  TEST_VACIO, type DefinicionTest,
} from './test-definicion'
import type { Bloque } from './formula'

const v = (n: string): Bloque => ({ t: 'var', v: n })
const r = (n: string): Bloque => ({ t: 'ref', v: n })
const op = (o: string): Bloque => ({ t: 'op', v: o })
const num = (n: number): Bloque => ({ t: 'num', v: n })

/** El Cooper del que salen tres cosas: dos encadenadas y una suelta. */
const COOPER: DefinicionTest = {
  nombre: 'Test de Cooper',
  deporte: 'Carrera',
  campos: [
    { clave: 'metros', etiqueta: 'Metros en 12 minutos' },
    { clave: 'pulso_final', etiqueta: 'Pulsaciones al acabar' },
  ],
  resultados: [
    { nombre: 'VAM', unidad: 'km/h', ancla: 'vo2max', formula: [v('metros'), op('/'), num(200)], graf: true },
    { nombre: 'ritmo', unidad: 'min/km', ancla: 'nada', formula: [num(60), op('/'), r('VAM')], graf: true },
    { nombre: 'vUAn', unidad: 'km/h', ancla: 'umbral', formula: [r('VAM'), op('*'), num(0.85)], graf: true },
    { nombre: 'FC_final', unidad: 'ppm', ancla: 'nada', formula: [v('pulso_final')], graf: true },
  ],
}

describe('las anclas', () => {
  it('cada una sabe de qué tipo es', () => {
    expect(tipoDeAncla('vo2max')).toBe('hito')
    expect(tipoDeAncla('umbral')).toBe('hito')
    expect(tipoDeAncla('especifica')).toBe('especifica')
    expect(tipoDeAncla('nada')).toBe('seguimiento')
  })

  it('una que no existe cae en seguimiento, que es lo inofensivo', () => {
    // Nunca en «hito»: eso la dejaría gobernando las zonas de alguien.
    expect(tipoDeAncla('inventada')).toBe('seguimiento')
    expect(tipoDeAncla('')).toBe('seguimiento')
  })

  it('solo los hitos pueden gobernar zonas', () => {
    expect(hitosDe(COOPER).map(h => h.resultado.nombre)).toEqual(['VAM', 'vUAn'])
  })
})

describe('leer lo guardado', () => {
  it('un test normal', () => {
    const d = leerDefinicion(COOPER)
    expect(d.nombre).toBe('Test de Cooper')
    expect(d.campos).toHaveLength(2)
    expect(d.resultados).toHaveLength(4)
  })

  it('viniendo como texto: no todos los clientes parsean el jsonb', () => {
    expect(leerDefinicion(JSON.stringify(COOPER)).resultados).toHaveLength(4)
  })

  it('null, basura o texto roto dan un test vacío, no una pantalla rota', () => {
    expect(leerDefinicion(null)).toEqual(TEST_VACIO)
    expect(leerDefinicion('{roto')).toEqual(TEST_VACIO)
    expect(leerDefinicion(42)).toEqual(TEST_VACIO)
  })

  it('UN ANCLA QUE NO EXISTE SE DEGRADA A SEGUIMIENTO', () => {
    // Lo guardado no manda sobre el código. Si mañana se retira un ancla, lo
    // que había con ella no puede seguir gobernando las zonas de nadie.
    const d = leerDefinicion({ ...COOPER, resultados: [{ ...COOPER.resultados[0], ancla: 'lo_que_sea' }] })
    expect(d.resultados[0].ancla).toBe('nada')
  })

  it('los campos y resultados sin nombre se caen', () => {
    const d = leerDefinicion({
      nombre: 'x', campos: [{ clave: '', etiqueta: 'y' }, { clave: 'ok', etiqueta: 'z' }],
      resultados: [{ nombre: '', formula: [] }],
    })
    expect(d.campos).toHaveLength(1)
    expect(d.resultados).toHaveLength(0)
  })

  it('los bloques que no son bloques se tiran', () => {
    expect(leerFormula([{ t: 'var', v: 'x' }, { t: 'zzz', v: 'x' }, { t: 'num', v: 'no' }, null]))
      .toEqual([{ t: 'var', v: 'x' }])
  })

  it('un número guardado como texto se recupera como número', () => {
    expect(leerFormula([{ t: 'num', v: '200' }])).toEqual([{ t: 'num', v: 200 }])
  })
})

describe('calcular los resultados', () => {
  const datos = { metros: 3200, pulso_final: 178 }

  it('LOS ENCADENADOS USAN LOS ANTERIORES', () => {
    const out = calcularResultados(COOPER, datos)
    expect(out[0].valor).toBe(16)        // VAM = 3200 / 200
    expect(out[1].valor).toBe(3.75)      // ritmo = 60 / VAM
    expect(out[2].valor).toBeCloseTo(13.6, 6)  // vUAn = VAM × 0,85
  })

  it('los sueltos van por su cuenta', () => {
    expect(calcularResultados(COOPER, datos)[3].valor).toBe(178)
  })

  it('cambiar la fórmula de uno mueve a los que dependen de él', () => {
    const otro = { ...COOPER, resultados: COOPER.resultados.map((x, i) =>
      i === 0 ? { ...x, formula: [v('metros'), op('/'), num(100)] } : x) }
    const out = calcularResultados(otro, datos)
    expect(out[0].valor).toBe(32)
    expect(out[1].valor).toBe(1.875)     // el ritmo se ha movido detrás
  })

  it('UN RESULTADO QUE FALLA NO TUMBA A LOS DEMÁS', () => {
    const roto = { ...COOPER, resultados: COOPER.resultados.map((x, i) =>
      i === 0 ? { ...x, formula: [v('no_existe')] } : x) }
    const out = calcularResultados(roto, datos)
    expect(out[0].error).toContain('no existe')
    expect(out[1].error).toContain('no existe «VAM»')  // este dependía de él
    expect(out[3].valor).toBe(178)                     // este no, y sigue vivo
  })

  it('sin fórmula lo dice, no devuelve cero', () => {
    const sinF = { ...COOPER, resultados: [{ ...COOPER.resultados[0], formula: [] }] }
    expect(calcularResultados(sinF, datos)[0]).toEqual({ valor: null, error: 'sin fórmula' })
  })

  it('UN CAMPO SIN RELLENAR NO VALE CERO', () => {
    // Es el fallo que este proyecto persigue: un número en vez de un aviso.
    const out = calcularResultados(COOPER, { metros: null, pulso_final: 178 })
    expect(out[0].error).toContain('falta rellenar')
    expect(out[0].valor).toBeNull()
  })

  it('referenciar hacia adelante falla, y es correcto que falle', () => {
    const alReves: DefinicionTest = {
      ...COOPER,
      resultados: [
        { nombre: 'a', unidad: '', ancla: 'nada', formula: [r('b')], graf: false },
        { nombre: 'b', unidad: '', ancla: 'nada', formula: [num(1)], graf: false },
      ],
    }
    expect(calcularResultados(alReves, datos)[0].error).toContain('no existe «b»')
  })
})

describe('qué impide guardar', () => {
  it('el Cooper se puede guardar', () => {
    expect(pegasDe(COOPER)).toEqual([])
    expect(sePuedeGuardar(COOPER)).toBe(true)
  })

  it('un test vacío enseña TODO lo que le falta de golpe, no de uno en uno', () => {
    const p = pegasDe(TEST_VACIO)
    expect(p).toHaveLength(3)
    expect(p.map(x => x.texto).join(' ')).toContain('nombre')
    expect(p.map(x => x.texto).join(' ')).toContain('campo')
    expect(p.map(x => x.texto).join(' ')).toContain('resultado')
  })

  it('una fórmula que usa un campo que no existe', () => {
    const d = { ...COOPER, resultados: [{ ...COOPER.resultados[0], formula: [v('inventado')] }] }
    expect(pegaDe(pegasDe(d), 'resultado', 0)).toContain('no es ningún campo')
  })

  it('UNA REFERENCIA HACIA ADELANTE se explica y se dice cómo arreglarla', () => {
    const d: DefinicionTest = {
      ...COOPER,
      resultados: [
        { nombre: 'a', unidad: '', ancla: 'nada', formula: [r('b')], graf: false },
        { nombre: 'b', unidad: '', ancla: 'nada', formula: [num(1)], graf: false },
      ],
    }
    expect(pegaDe(pegasDe(d), 'resultado', 0)).toContain('súbelo')
  })

  it('una referencia a algo que no existe se distingue de la anterior', () => {
    const d = { ...COOPER, resultados: [{ ...COOPER.resultados[0], formula: [r('fantasma')] }] }
    expect(pegaDe(pegasDe(d), 'resultado', 0)).toContain('no existe')
  })

  it('nombres repetidos entre campos y resultados', () => {
    const d = { ...COOPER, campos: [{ clave: 'VAM', etiqueta: 'x' }] }
    expect(pegasDe(d).some(p => p.texto.includes('Ya hay otro'))).toBe(true)
  })

  it('un nombre con espacios se caza antes de guardar', () => {
    const d = { ...COOPER, resultados: [{ ...COOPER.resultados[0], nombre: 'Ritmo medio' }] }
    expect(pegaDe(pegasDe(d), 'resultado', 0)).toContain('guion bajo')
  })
})

describe('las series de las gráficas', () => {
  const meds = [
    { fecha: '2026-06-02', datos: { metros: 3050, pulso_final: 182 } },
    { fecha: '2026-03-14', datos: { metros: 2900, pulso_final: 186 } },
    { fecha: '2026-09-05', datos: { metros: 3200, pulso_final: 178 } },
  ]

  it('salen ordenadas por fecha aunque lleguen desordenadas', () => {
    const s = seriesDe(COOPER, meds)
    expect(s[0].puntos.map(p => p.fecha)).toEqual(['2026-03-14', '2026-06-02', '2026-09-05'])
  })

  it('una serie por resultado, cada una con su unidad', () => {
    const s = seriesDe(COOPER, meds)
    expect(s.map(x => x.nombre)).toEqual(['VAM', 'ritmo', 'vUAn', 'FC_final'])
    expect(s[0].unidad).toBe('km/h')
    expect(s[1].unidad).toBe('min/km')
  })

  it('SE RECALCULA DESDE LOS CAMPOS: corregir una fórmula corrige el historial', () => {
    const otro = { ...COOPER, resultados: COOPER.resultados.map((x, i) =>
      i === 0 ? { ...x, formula: [v('metros'), op('/'), num(100)] } : x) }
    expect(seriesDe(otro, meds)[0].puntos.map(p => p.valor)).toEqual([29, 30.5, 32])
  })

  it('solo salen los marcados con gráfica', () => {
    const d = { ...COOPER, resultados: COOPER.resultados.map((x, i) => ({ ...x, graf: i === 0 })) }
    expect(seriesDe(d, meds).map(x => x.nombre)).toEqual(['VAM'])
  })

  it('EL RITMO MEJORA BAJANDO, y la gráfica tiene que saberlo', () => {
    // Sin esto, cada mejora en min/km se pintaría en rojo.
    expect(menosEsMejor('ritmo', 'min/km')).toBe(true)
    expect(menosEsMejor('VAM', 'km/h')).toBe(false)
    const s = seriesDe(COOPER, meds)
    expect(s[0].delta).toBeGreaterThan(0)   // la VAM sube
    expect(s[0].mejora).toBe(true)
    expect(s[1].delta).toBeLessThan(0)      // el ritmo baja
    expect(s[1].mejora).toBe(true)          // …y también es mejor
  })

  it('sin cambio no se dice ni mejor ni peor', () => {
    const iguales = [
      { fecha: '2026-01-01', datos: { metros: 3000, pulso_final: 180 } },
      { fecha: '2026-02-01', datos: { metros: 3000, pulso_final: 180 } },
    ]
    expect(seriesDe(COOPER, iguales)[0].delta).toBe(0)
    expect(seriesDe(COOPER, iguales)[0].mejora).toBeNull()
  })

  it('con una sola medición no hay tendencia que inventar', () => {
    const s = seriesDe(COOPER, [meds[0]])
    expect(s[0].puntos).toHaveLength(1)
    expect(s[0].delta).toBeNull()
  })

  it('sin mediciones no revienta', () => {
    expect(seriesDe(COOPER, []).every(s => s.puntos.length === 0)).toBe(true)
  })

  it('LAS MEDICIONES QUE NO SE PUEDEN CALCULAR SE SALTAN, no rompen la línea', () => {
    // Una medición a la que le falta un campo no debe dejar la gráfica en blanco.
    const conHueco = [...meds, { fecha: '2026-10-01', datos: { pulso_final: 170 } }]
    const s = seriesDe(COOPER, conHueco)
    expect(s[0].puntos).toHaveLength(3)          // la VAM se salta la mala
    expect(s[3].puntos).toHaveLength(4)          // la FC sí la tiene
  })
})
