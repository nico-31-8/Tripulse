// El constructor del laboratorio. Todo lo que se comprueba aquí nació de una
// decisión tomada a mano, así que cada bloque dice cuál.
import { describe, it, expect } from 'vitest'
import {
  evaluar, recorta, textoDe, etiquetaFn, valorDado, hechasDe, calcular, pegasDe,
  relojesDe, intervaloRitmo, escalonAhora, protoVacio, medVacia, esFuncion,
  clavesRepetidas, nuevaClave, buscaCol, col, fnB, FUNCIONES,
  type TestLab, type Datos,
} from './lab-constructor'
import { PLANTILLAS, plantillaPorId } from './lab-plantillas'

const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const SEIS = ['74.2', '75', '76.1', '77.4', '79', '80.5']

describe('las funciones y su tramo', () => {
  const vars = { t100: SEIS }

  it('cada una devuelve lo suyo', () => {
    expect(evaluar('suma(t100)', vars)).toBeCloseTo(462.2, 5)
    expect(evaluar('media(t100)', vars)).toBeCloseTo(77.0333, 3)
    expect(evaluar('minimo(t100)', vars)).toBe(74.2)
    expect(evaluar('maximo(t100)', vars)).toBe(80.5)
    expect(evaluar('cuantas(t100)', vars)).toBe(6)
    expect(evaluar('ultima(t100) - primera(t100)', vars)).toBeCloseTo(6.3, 5)
  })

  /* En un 6×100 la primera sale de pared y no compara con las demás. Y el
     índice de fatiga son dos tramos: 1–3 contra 4–6. */
  it('el tramo recorta lo que se pide', () => {
    expect(evaluar('media(t100, 2, 3)', vars)).toBeCloseTo(75.55, 4)
    expect(evaluar('media(t100, 2, 0)', vars)).toBeCloseTo(77.6, 4)   // sin la primera
    expect(evaluar('media(t100, 1, -1)', vars)).toBeCloseTo(76.34, 4) // sin la última
    expect(evaluar('media(t100, 1, 3)', vars)).toBeCloseTo(75.1, 4)
    expect(evaluar('media(t100, 4, 0)', vars)).toBeCloseTo(78.9667, 3)
  })

  /* El troceador saca «-» y «1» como dos piezas: sin leer el signo aparte, un
     «hasta» negativo se toma por un menos suelto y la fórmula se queja de un
     paréntesis sin cerrar. Pasó de verdad. */
  it('el signo del tramo no se pierde', () => {
    expect(() => evaluar('media(t100, 1, -1)', vars)).not.toThrow()
    expect(recorta([1, 2, 3, 4], 'x', 1, -1)).toEqual([1, 2, 3])
    expect(recorta([1, 2, 3, 4], 'x', 2, 0)).toEqual([2, 3, 4])
  })

  it('un tramo que no cabe falla, y dice por qué', () => {
    expect(() => evaluar('media(t100, 7, 9)', vars)).toThrow(/desde la 7/)
  })

  it('una columna que se repite no es un número, y al revés', () => {
    expect(() => evaluar('t100 + 1', vars)).toThrow(/se repite/)
    expect(() => evaluar('t100 * 2', { t100: ['74.2'] })).toThrow(/suma\(t100\)/)
    expect(() => evaluar('suma(peso)', { peso: '70' })).toThrow(/no se repite/)
  })

  /* `n in FUNCIONES` daría true para lo que hay en el prototipo de cualquier
     objeto, y una casilla llamada «toString» se trataría como función. */
  it('lo del prototipo NO es una función', () => {
    for (const n of ['toString', 'constructor', 'valueOf', '__proto__']) expect(esFuncion(n), n).toBe(false)
    for (const f of Object.keys(FUNCIONES)) expect(esFuncion(f), f).toBe(true)
  })

  it('se escribe como se lee', () => {
    expect(textoDe([fnB('media', 't100', 2, 3)])).toBe('media(t100, 2, 3)')
    expect(etiquetaFn({ t: 'fn', v: 'media', de: 't100', d: 2 })).toMatch(/sin la 1/)
    expect(etiquetaFn({ t: 'fn', v: 'media', de: 't100', h: -1 })).toMatch(/sin la última/)
  })
})

describe('las columnas dadas', () => {
  it('la progresión sale sola', () => {
    const c = col({ clave: 'v', clase: 'dada', tipo: 'progresion', desde: 8, paso: 0.5 })
    expect(valorDado(c, 0, {})).toBe(8)
    expect(valorDado(c, 4, {})).toBe(10)
  })

  /* Si el 0,5 va escrito dentro de la fórmula, cambiarle el incremento a un
     atleta lento deja la fórmula con el viejo y la VAM sale mal en silencio. */
  it('leyendo de una casilla, cambiarla mueve toda la columna', () => {
    const c = col({ clave: 'v', clase: 'dada', tipo: 'progresion', desde: 8, paso: 0.5, desdeRef: 'ini', pasoRef: 'inc' })
    expect(valorDado(c, 4, { ini: '10', inc: '1' })).toBe(14)
    expect(valorDado(c, 4, { ini: '10', inc: '0.4' })).toBe(11.6)
  })

  it('la lista se queda donde acaba', () => {
    const c = col({ clave: 'lado', clase: 'dada', tipo: 'lista', etiquetas: ['Derecha', 'Izquierda'] })
    expect(valorDado(c, 0, {})).toBe('Derecha')
    expect(valorDado(c, 5, {})).toBe('')
  })
})

describe('hasta dónde llegó', () => {
  const bl = { clave: 'esc', etiqueta: '', modo: 'abierto' as const, veces: 20, duracion: 60, columnas: [] }

  /* Sin marcador, un escalonado SIN columnas medidas —una VAM: solo anotas
     hasta dónde llegó— daría cero repeticiones y no calcularía nada. */
  it('en un bloque abierto manda el marcador', () => {
    expect(hechasDe(bl, {})).toBe(0)
    expect(hechasDe(bl, { '@esc': 9 })).toBe(9)
    expect(hechasDe(bl, { '@esc': 99 })).toBe(20)
  })

  it('en uno cerrado son todas, marque lo que marque', () => {
    expect(hechasDe({ ...bl, modo: 'cerrado', veces: 6 }, { '@esc': 2 })).toBe(6)
  })
})

describe('la VAM, de punta a punta', () => {
  const vam = () => clon(plantillaPorId('vam')!.test)

  const datos = (proto: Datos, mio: Datos): Datos => ({ ...proto, ...mio })

  it('se puede guardar tal cual viene', () => {
    expect(pegasDe(vam())).toEqual([])
  })

  /* Montreal: la velocidad del último escalón COMPLETO más la parte del que no
     terminó. Si se marca el que iba en vez del último completo, sale un escalón
     alta — por eso la pantalla lo dice al capturar. */
  it('calcula la corrección del escalón parcial', () => {
    const t = vam()
    const p = protoVacio(t)
    const v = calcular(t, datos(p, { '@esc': 9, aguanto: '40' }))
    expect(v[0].valor).toBeCloseTo(12, 5)          // último completo: 8 + 0,5×8
    expect(v[1].valor).toBeCloseTo(12.3333, 3)     // + 40/60 × 0,5
    expect(v[2].valor).toBe(9)
  })

  it('cambiar el protocolo mueve la VAM de todos', () => {
    const t = vam()
    const p = { ...protoVacio(t), incremento: '0.4' }
    expect(calcular(t, datos(p, { '@esc': 9, aguanto: '40' }))[1].valor).toBeCloseTo(11.4667, 3)
    expect(calcular(t, datos(p, { '@esc': 12, aguanto: '0' }))[1].valor).toBeCloseTo(12.4, 3)
  })

  it('sin marcar hasta dónde llegó, avisa en vez de inventarse un número', () => {
    const t = vam()
    const v = calcular(t, datos(protoVacio(t), {}))
    expect(v[0].valor).toBeNull()
    expect(v[0].error).toMatch(/marca hasta dónde llegó/)
  })
})

describe('el protocolo se comparte y lo medido se reparte', () => {
  it('cada uno lleva lo suyo y el protocolo es de todos', () => {
    const t = clon(plantillaPorId('vam')!.test)
    const proto = protoVacio(t)
    expect(Object.keys(proto).sort()).toEqual(['duracion', 'incremento', 'inicio'])
    /* `aguanto` se mide, así que NO está en el protocolo: si lo estuviera, los
       segundos del que se bajó primero se le pegarían a todos los demás. */
    expect(proto.aguanto).toBeUndefined()
    expect(Object.keys(medVacia(t))).toContain('aguanto')
  })
})

describe('el reloj', () => {
  it('dice en palabras lo que va a hacer', () => {
    expect(relojesDe(clon(plantillaPorId('vam')!.test))[0]).toMatch(/escalones de 60 s/)
    expect(relojesDe(clon(plantillaPorId('navette')!.test))[0]).toMatch(/pita cada 20 m/)
    expect(relojesDe(clon(plantillaPorId('una')!.test))).toEqual([])
  })

  it('el escalón sale del tiempo', () => {
    const bl = clon(plantillaPorId('vam')!.test).bloques[0]
    expect(escalonAhora(bl, 0)).toBe(1)
    expect(escalonAhora(bl, 59_999)).toBe(1)
    expect(escalonAhora(bl, 60_000)).toBe(2)
    expect(escalonAhora(bl, 999_999_999)).toBe(bl.veces)
  })

  /* La course navette: el hueco entre pitidos se acorta SOLO porque la
     velocidad sube. Es lo que evita escribir a mano la tabla de tiempos. */
  it('el ritmo por metros se acorta al subir la velocidad', () => {
    const t = clon(plantillaPorId('navette')!.test)
    const bl = t.bloques[0], p = protoVacio(t)
    const i1 = intervaloRitmo(bl, 1, p), i8 = intervaloRitmo(bl, 8, p)
    expect(i1).toBeCloseTo(20 / (8.5 / 3.6) * 1000, 0)
    expect(i8).toBeLessThan(i1)
  })

  it('pedir metros sin velocidad no deja guardar', () => {
    const t = clon(plantillaPorId('lactato')!.test)
    t.bloques[0].ritmo = 'metros'; t.bloques[0].ritmoCada = 20
    t.bloques[0].columnas = t.bloques[0].columnas.filter(c => c.clase !== 'dada')
    expect(pegasDe(t).some(p => /pitar por metros/.test(p.texto))).toBe(true)
  })
})

describe('validar', () => {
  const base = (): TestLab => clon(plantillaPorId('reps')!.test)

  it('una clave repetida se ve', () => {
    const t = base()
    t.sueltos.push(col({ clave: 't100', etiqueta: 'Otra' }))
    expect(clavesRepetidas(t)).toContain('t100')
    expect(pegasDe(t).some(p => /dos veces/.test(p.texto))).toBe(true)
  })

  it('una casilla no se puede llamar como una función', () => {
    const t = base()
    t.sueltos[0].clave = 'media'
    expect(pegasDe(t).some(p => /función de serie/.test(p.texto))).toBe(true)
  })

  it('usar una columna repetida como número suelto no deja guardar', () => {
    const t = base()
    t.resultados[0].formula = [{ t: 'var', v: 't100' }]
    expect(pegasDe(t).some(p => /se repite/.test(p.texto))).toBe(true)
  })

  it('una función sobre algo que se mide una vez, tampoco', () => {
    const t = base()
    t.resultados[0].formula = [fnB('suma', 'fc_final')]
    expect(pegasDe(t).some(p => /una sola vez/.test(p.texto))).toBe(true)
  })

  it('las claves nuevas no chocan', () => {
    const t = base()
    expect(nuevaClave(t, 't100')).toBe('t1002')
    expect(buscaCol(t, 't100')?.bl).toBeTruthy()
    expect(buscaCol(t, 'fc_final')?.bl).toBeNull()
  })
})

/* GUARDIÁN. Las siete plantillas tienen que poder guardarse y calcularse sin
   reventar: son la puerta de entrada, y una rota es lo primero que vería
   cualquiera que abra la pantalla. */
describe('las plantillas', () => {
  it('todas se pueden guardar', () => {
    for (const p of PLANTILLAS) expect(pegasDe(clon(p.test)), p.id).toEqual([])
  })

  it('todas calculan sin reventar, aunque falten datos', () => {
    for (const p of PLANTILLAS) {
      const t = clon(p.test)
      const vals = calcular(t, { ...protoVacio(t), ...medVacia(t) })
      expect(vals.length, p.id).toBe(t.resultados.length)
      for (const v of vals) expect(v.valor === null || Number.isFinite(v.valor), p.id).toBe(true)
    }
  })

  it('cada fórmula apunta a algo que existe', () => {
    for (const p of PLANTILLAS) {
      const t = clon(p.test)
      for (const r of t.resultados) {
        for (const b of r.formula) {
          if (b.t === 'var' || b.t === 'fn') {
            const clave = b.t === 'fn' ? b.de : b.v
            expect(buscaCol(t, clave), p.id + ' → ' + clave).toBeTruthy()
          }
        }
      }
    }
  })
})
