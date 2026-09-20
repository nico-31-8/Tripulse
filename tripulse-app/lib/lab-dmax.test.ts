// ============================================================
// El Dmax, y su red
// ============================================================
//
// El Dmax es la otra forma de leer una curva de lactato. El «umbral a 4
// mmol/L» pregunta por un valor elegido a dedo; el Dmax pregunta dónde se
// dobla la curva de ESTE atleta: se tira una cuerda del primer punto al
// último y se busca el punto que más se separa de ella.
//
// Y COMO TODA ESTADÍSTICA DE AQUÍ, EL PELIGRO NO ES QUE FALLE: ES QUE SALE
// AUNQUE ESTÉ MAL. Un lactato que sube en línea recta también tiene un punto
// que se aparta un pelín de su cuerda, y el Dmax lo devuelve con dos decimales
// y aspecto de umbral. Por eso la mitad de este fichero son los casos en los
// que el número sale y hay que decir algo, o no sale en absoluto.

import { describe, it, expect } from 'vitest'
import {
  dmaxDe, polinomio, enCurva, evaluar, calcular, pegasDe, etiquetaFn2, col,
  gradoDmaxVale, GRADO_CURVA, SUBIDA_MOD, SEPARACION_MINIMA,
  type TestLab,
} from './lab-constructor'
import { leerModelo, paraGuardar } from './lab-guardar'
import { plantillaPorId } from './lab-plantillas'

const pts = (xs: number[], ys: number[]) => xs.map((x, i) => ({ x, y: ys[i] }))

/** Un escalonado de lactato de verdad: 3 min por escalón, +1 km/h. */
const VEL = [10, 11, 12, 13, 14, 15, 16]
const LAC = [1.0, 1.1, 1.3, 1.7, 2.6, 4.2, 7.0]
const CURVA = pts(VEL, LAC)

describe('dónde cae el Dmax', () => {
  /* EL ÚNICO CASO CON RESPUESTA EXACTA CONOCIDA, y por eso está el primero.
     Con y = x³ entre 0 y 3, la cuerda va de (0,0) a (3,27), o sea y = 9x. La
     separación es 9x − x³, su derivada 9 − 3x², y se anula en x = √3. Si el
     barrido que busca el máximo se tuerce, esto lo caza. */
  it('sobre una cúbica, cae donde dice el cálculo a mano: √3', () => {
    const cubica = [0, 0.5, 1, 1.5, 2, 2.5, 3].map(x => ({ x, y: x ** 3 }))
    expect(dmaxDe(cubica, false, 3, 'x', 'y')).toBeCloseTo(Math.sqrt(3), 3)
  })

  /* A mano, con la cuerda de (10; 1,0) a (16; 7,0), que es y = x − 9:
     11 → 0,9 · 12 → 1,7 · 13 → 2,3 · 14 → 2,4 · 15 → 1,8. El 14 gana. */
  it('sobre los escalones medidos, cae en uno de los medidos', () => {
    expect(dmaxDe(CURVA, false, 0, 'vel', 'lac')).toBe(14)
  })

  /* Los dos números NO son el mismo, y esa es justo la razón de ofrecer los
     dos: sobre la curva el umbral puede caer entre dos escalones, que es lo
     que hace un laboratorio. Lo que no puede es salir de otro sitio. */
  it('sobre la curva, cae entre dos escalones', () => {
    const v = dmaxDe(CURVA, false, GRADO_CURVA, 'vel', 'lac')
    expect(v).toBeGreaterThan(13)
    expect(v).toBeLessThan(14)
    expect(v).not.toBe(dmaxDe(CURVA, false, 0, 'vel', 'lac'))
  })

  it('una curva bien medida no tiene nada que avisar', () => {
    const av: string[] = []
    dmaxDe(CURVA, false, GRADO_CURVA, 'vel', 'lac', av)
    expect(av).toEqual([])
  })
})

describe('el Dmax modificado: dónde empieza la cuerda', () => {
  /* La cuerda no sale del primer escalón, sino del ANTERIOR a la primera
     subida de 0,4 mmol/L. Aquí es el 12 (1,3 → 1,7). Con la cuerda de
     (12; 1,3) a (16; 7,0): 13 → 1,025 · 14 → 1,55 · 15 → 1,375. Gana el 14. */
  it('arranca en el escalón anterior a la primera subida de 0,4', () => {
    expect(dmaxDe(CURVA, true, 0, 'vel', 'lac')).toBe(14)
  })

  /* REGRESIÓN, Y DE LAS CARAS. 1,7 − 1,3 vale 0,3999999999999999 en coma
     flotante, así que la subida de 0,4 que el entrenador ve escrita en su hoja
     se colaba por debajo del listón: la cuerda arrancaba un escalón más tarde
     y el umbral salía 15 en vez de 14. Un km/h entero, sin que nada fallara. */
  it('una subida de 0,4 clavada cuenta, aunque la coma flotante diga 0,3999…', () => {
    expect(1.7 - 1.3).toBeLessThan(SUBIDA_MOD)
    expect(dmaxDe(CURVA, true, 0, 'vel', 'lac')).toBe(14)
  })

  it('mueve el umbral respecto al Dmax normal', () => {
    expect(dmaxDe(CURVA, true, GRADO_CURVA, 'vel', 'lac'))
      .not.toBeCloseTo(dmaxDe(CURVA, false, GRADO_CURVA, 'vel', 'lac'), 2)
  })

  it('si el lactato nunca pega el salto, lo dice en vez de inventarse el arranque', () => {
    const suave = pts([10, 11, 12, 13, 14], [1.0, 1.1, 1.2, 1.35, 1.5])
    expect(() => dmaxDe(suave, true, 0, 'vel', 'lac')).toThrow(/nunca sube 0,4/)
  })

  it('si el salto aparece ya al final, tampoco hay curva que medir', () => {
    const tarde = pts([10, 11, 12, 13], [1.0, 1.1, 1.2, 4.0])
    expect(() => dmaxDe(tarde, true, 0, 'vel', 'lac')).toThrow(/aparece ya al final/)
  })
})

// ============================================================
// LA RED
// ============================================================

describe('cuando la curva no se dobla', () => {
  /* Seis escalones clavados en una recta. Sobre los escalones no hay ninguno
     por debajo de la cuerda, así que no hay umbral y se dice. */
  it('sobre los escalones, una recta no tiene Dmax y se niega a dar uno', () => {
    const recta = pts([10, 11, 12, 13, 14, 15], [1, 2, 3, 4, 5, 6])
    expect(() => dmaxDe(recta, false, 0, 'vel', 'lac')).toThrow(/no se dobla hacia arriba/)
  })

  /* SOBRE LA CURVA NO SE PUEDE HACER LO MISMO, y ahí está la trampa: el ajuste
     deja un pelín de ondulación, la separación máxima sale positiva por el
     ruido de la coma flotante, y el Dmax devuelve un número inventado con toda
     la pinta de umbral. Lo que lo delata es CUÁNTO se separa, no dónde. */
  it('sobre la curva sale un número, pero avisa de que ahí no hay codo', () => {
    const casi = pts([10, 11, 12, 13, 14, 15], [1, 2, 3, 4, 5, 6.05])
    const av: string[] = []
    const v = dmaxDe(casi, false, GRADO_CURVA, 'vel', 'lac', av)
    expect(Number.isFinite(v)).toBe(true)
    expect(av.join(' ')).toMatch(/apenas se dobla/)
    expect(av.join(' ')).toMatch(/ahí no hay codo/)
  })

  it('también avisa sobre los escalones, si se separan de risa', () => {
    const casi = pts([10, 11, 12, 13, 14, 15], [1, 2, 3, 4, 5, 6.05])
    const av: string[] = []
    dmaxDe(casi, false, 0, 'vel', 'lac', av)
    expect(av.join(' ')).toMatch(/apenas se dobla/)
  })

  /* El listón no es un número puesto a ojo: se midió. Las curvas que hacen
     codo de verdad se separan del 17 % al 70 % del recorrido del lactato, y
     las que no llegan a doblarse se quedan por debajo del 1 %. */
  it('un codo flojo pero de verdad NO avisa', () => {
    const flojo = pts([10, 11, 12, 13, 14, 15], [1.0, 1.5, 2.1, 2.9, 4.0, 5.4])
    const av: string[] = []
    dmaxDe(flojo, false, 0, 'vel', 'lac', av)
    expect(av).toEqual([])
    expect(SEPARACION_MINIMA).toBeLessThan(0.16)
  })
})

describe('el grado no es un gusto', () => {
  it('solo valen los escalones o el grado 3', () => {
    expect(gradoDmaxVale(0)).toBe(true)
    expect(gradoDmaxVale(GRADO_CURVA)).toBe(true)
    expect(gradoDmaxVale(undefined)).toBe(true)
    expect(gradoDmaxVale(1)).toBe(false)
    expect(gradoDmaxVale(2)).toBe(false)
  })

  /* EL PORQUÉ, DEMOSTRADO Y NO AFIRMADO. Con grado 2 la cuerda une dos puntos
     de una parábola, y el punto de una parábola que más se aparta de una
     cuerda suya cae SIEMPRE en el centro exacto del rango: midieras lo que
     midieras, el «umbral» sería la media del primer y el último escalón. */
  it('con grado 2 el punto saldría siempre en el centro del rango', () => {
    for (const p of [CURVA, pts([8, 9, 10, 11, 12, 13], [0.8, 1.0, 1.4, 2.2, 3.8, 6.5])]) {
      const c = polinomio(p, 2)
      const A = p[0], B = p[p.length - 1]
      const yA = enCurva(c, A.x), yB = enCurva(c, B.x)
      let mx = A.x, ms = -Infinity
      for (let k = 0; k <= 2000; k++) {
        const x = A.x + (B.x - A.x) * k / 2000
        const s = yA + (yB - yA) * (x - A.x) / (B.x - A.x) - enCurva(c, x)
        if (s > ms) { ms = s; mx = x }
      }
      expect(mx).toBeCloseTo((A.x + B.x) / 2, 3)
    }
  })

  it('y por eso el motor no lo deja ni con grado 2 ni con grado 1', () => {
    expect(() => dmaxDe(CURVA, false, 2, 'vel', 'lac')).toThrow(/centro del rango/)
    expect(() => dmaxDe(CURVA, false, 1, 'vel', 'lac')).toThrow(/la propia cuerda/)
  })

  it('con menos de tres escalones no hay curva, solo cuerda', () => {
    expect(() => dmaxDe(pts([10, 11], [1, 4]), false, 0, 'vel', 'lac')).toThrow(/al menos 3 escalones/)
  })
})

describe('la curva ajustada, y lo que hay que saber de ella', () => {
  it('un polinomio exacto se ajusta exacto', () => {
    const c = polinomio([0, 0.5, 1, 1.5, 2, 2.5, 3].map(x => ({ x, y: x ** 3 })), 3)
    expect(c.ajuste).toBeCloseTo(1, 9)
    expect(enCurva(c, 2)).toBeCloseTo(8, 6)
  })

  /* La x se centra y se escala antes de ajustar. Sin eso, el mismo test daría
     un ajuste distinto según la columna estuviera en km/h o en m/s. */
  it('el ajuste no cambia si la columna cambia de unidad', () => {
    const enKmh = polinomio(CURVA, 3)
    const enMs = polinomio(CURVA.map(q => ({ x: q.x / 3.6, y: q.y })), 3)
    expect(enMs.ajuste).toBeCloseTo(enKmh.ajuste, 9)
  })

  /* CON GRADO+1 PUNTOS EL POLINOMIO PASA POR TODOS y el ajuste sale 1 sin que
     eso signifique nada: el aviso tiene que salir justo cuando el número es
     perfecto, que es cuando nadie sospecha. */
  it('con cuatro puntos y grado 3, avisa de que pasa por ellos por narices', () => {
    const cuatro = pts([10, 11, 12, 13], [1.0, 1.4, 2.4, 5.0])
    const av: string[] = []
    dmaxDe(cuatro, false, GRADO_CURVA, 'vel', 'lac', av)
    expect(polinomio(cuatro, 3).ajuste).toBeCloseTo(1, 9)
    expect(av.join(' ')).toMatch(/por narices/)
  })

  it('con los puntos desordenados, avisa de que no caen en la curva', () => {
    const torcido = pts([10, 11, 12, 13, 14, 15], [1.0, 4.0, 1.2, 5.5, 1.4, 6.0])
    const av: string[] = []
    dmaxDe(torcido, false, GRADO_CURVA, 'vel', 'lac', av)
    expect(av.join(' ')).toMatch(/no caen bien en la curva/)
  })

  it('una curva de grado 3 necesita al menos 4 puntos', () => {
    expect(() => polinomio(pts([1, 2, 3], [1, 2, 4]), 3)).toThrow(/al menos 4 puntos/)
  })
})

// ============================================================
// De punta a punta: la fórmula, el test y lo guardado
// ============================================================

const escalonado = (formula: TestLab['resultados'][0]['formula']): TestLab => ({
  nombre: 'Escalonado', deporte: 'Carrera', sueltos: [],
  bloques: [{
    clave: 'e', etiqueta: 'Escalón', modo: 'abierto', veces: 10, duracion: 180,
    columnas: [
      col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 10, paso: 1 }),
      col({ clave: 'lac', etiqueta: 'Lactato', unidad: 'mmol/L' }),
    ],
  }],
  resultados: [{ nombre: 'umbral', unidad: 'km/h', ancla: 'umbral', formula }],
})

const datos = { '@e': 7, lac: LAC.map(String).concat(['', '', '']) }

describe('el Dmax dentro de un test entero', () => {
  it('se monta como resultado y sale el mismo número', () => {
    const t = escalonado([{ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 0 }])
    expect(pegasDe(t)).toEqual([])
    expect(calcular(t, datos)[0].valor).toBe(14)
  })

  it('los avisos del Dmax llegan al resultado, no se quedan dentro', () => {
    const t = escalonado([{ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: GRADO_CURVA }])
    const v = calcular(t, { '@e': 6, lac: ['1', '2', '3', '4', '5', '6.05', '', '', '', ''] })
    expect(v[0].valor).not.toBeNull()
    expect(v[0].avisos?.join(' ')).toMatch(/apenas se dobla/)
  })

  it('si la curva no se dobla, el resultado no trae número y dice por qué', () => {
    const t = escalonado([{ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 0 }])
    const v = calcular(t, { '@e': 6, lac: ['1', '2', '3', '4', '5', '6', '', '', '', ''] })
    expect(v[0].valor).toBeNull()
    expect(v[0].error).toMatch(/no se dobla hacia arriba/)
  })

  /* La fórmula se le da al motor como texto, así que el grado tiene que
     sobrevivir al viaje de ida y vuelta. Un 0 perdido por el camino cambiaría
     el método sin cambiar nada de lo que se ve. */
  it('el texto de la fórmula lleva el grado', () => {
    expect(evaluar('dmax(vel, lac, 0)', { vel: VEL, lac: LAC })).toBe(14)
    expect(evaluar('dmax(vel, lac, 3)', { vel: VEL, lac: LAC })).toBeLessThan(14)
  })

  it('la etiqueta dice sobre qué se ha buscado', () => {
    expect(etiquetaFn2({ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 0 })).toBe('Dmax vel→lac (escalones)')
    expect(etiquetaFn2({ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 3 })).toBe('Dmax vel→lac (curva)')
    expect(etiquetaFn2({ t: 'fn2', v: 'dmaxmod', x: 'vel', y: 'lac', a: 3 })).toBe('Dmax mod vel→lac (curva)')
    expect(etiquetaFn2({ t: 'fn2', v: 'curva', x: 'vel', y: 'lac' })).toBe('se fía la curva vel→lac')
  })

  /* El 0 es un grado, no un hueco. Si se perdiera al guardar, el test
     volvería de la base buscando sobre la curva sin que nadie lo tocara. */
  it('el grado 0 sobrevive a guardar y volver a leer', () => {
    const t = escalonado([{ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 0 }])
    const fila = JSON.parse(JSON.stringify(paraGuardar(t, 'x')))
    const vuelta = leerModelo(fila.modelo)
    expect(vuelta?.resultados[0].formula[0]).toEqual({ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 0 })
    expect(calcular(vuelta as TestLab, datos)[0].valor).toBe(14)
  })

  it('el editor no deja guardar un Dmax con un grado que no mide nada', () => {
    const t = escalonado([{ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 2 }])
    expect(pegasDe(t).some(p => /no mide nada/.test(p.texto))).toBe(true)
  })
})

describe('la plantilla de lactato', () => {
  const plantilla = () => JSON.parse(JSON.stringify(plantillaPorId('lactato')!.test)) as TestLab

  it('trae el Dmax, el modificado y cuánto se fía de la curva', () => {
    const t = plantilla()
    const nombres = t.resultados.map(r => r.nombre)
    expect(nombres).toContain('dmax')
    expect(nombres).toContain('dmax_mod')
    expect(nombres).toContain('se_fia_curva')
    expect(pegasDe(t)).toEqual([])
  })

  /* La plantilla arranca en 8 km/h, así que sus escalones son 8, 9, 10… */
  it('con una curva de verdad, los dos umbrales salen y son distintos', () => {
    const t = plantilla()
    const vals = calcular(t, { '@esc': 7, lactato: LAC.map(String).concat(new Array(5).fill('')) })
    const por = (n: string) => vals[t.resultados.findIndex(r => r.nombre === n)]
    expect(por('dmax').valor).toBeGreaterThan(11)
    expect(por('dmax').valor).toBeLessThan(12)
    expect(por('se_fia_curva').valor).toBeGreaterThan(0.99)
    /* El umbral a 4 mmol/L y el Dmax leen la misma curva y dan números
       distintos: eso no es un fallo, es la razón de enseñar los dos. */
    expect(por('umbral_4').valor).not.toBeCloseTo(por('dmax').valor as number, 1)
  })

  it('los dos pueden gobernar zonas, y el entrenador elige cuál', () => {
    const t = plantilla()
    const conAncla = t.resultados.filter(r => r.ancla === 'umbral').map(r => r.nombre)
    expect(conAncla).toEqual(['umbral_4', 'dmax'])
  })
})
