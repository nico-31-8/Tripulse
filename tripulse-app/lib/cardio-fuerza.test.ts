import { describe, it, expect } from 'vitest'
import {
  MODALIDADES_CARDIO, modalidadDe, hayCardio, medidaDe,
  segundosDeCardio, metrosDeCardio, metrosSeQuedanFuera, textoCardio,
} from './cardio-fuerza'

describe('el catálogo de modalidades', () => {
  it('no hay dos con el mismo id', () => {
    const ids = MODALIDADES_CARDIO.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /* La que dice ser una disciplina de verdad tiene que serlo bajo techo: la
     cinta ES correr y el rodillo ES ir en bici. Lo demás no, y por eso sus
     metros no entran en el volumen de nadie. */
  it('solo las que son la disciplina de verdad la declaran', () => {
    expect(modalidadDe('cinta')?.disciplina).toBe('Carrera')
    expect(modalidadDe('rodillo')?.disciplina).toBe('Ciclismo')
    expect(modalidadDe('natacion')?.disciplina).toBe('Natacion')
    expect(modalidadDe('remo')?.disciplina).toBeNull()
    expect(modalidadDe('ski')?.disciplina).toBeNull()
    expect(modalidadDe('assault')?.disciplina).toBeNull()
  })

  /* Una modalidad que se prescribe por metros y no es ninguna disciplina
     necesita su regla gruesa, o la sesión duraría menos de lo que dura. */
  it('las de metros sin disciplina traen con qué estimar el tiempo', () => {
    for (const m of MODALIDADES_CARDIO) {
      if (m.medida === 'metros' && !m.disciplina) expect(m.msAprox, m.id).toBeGreaterThan(0)
    }
  })

  it('una modalidad inventada no existe', () => {
    expect(modalidadDe('teletransporte')).toBeNull()
    expect(modalidadDe('')).toBeNull()
    expect(modalidadDe(null)).toBeNull()
  })
})

describe('cuándo hay cardio', () => {
  /* MODALIDAD **Y** CANTIDAD. Un «Remo» sin metros no es media prescripción:
     es una que no se puede hacer, y colarla sumaría un cero a la duración sin
     que nadie lo notara. */
  it('hace falta modalidad y cantidad', () => {
    expect(hayCardio({ modo: 'remo', valor: 300 })).toBe(true)
    expect(hayCardio({ modo: 'remo' })).toBe(false)
    expect(hayCardio({ modo: 'remo', valor: 0 })).toBe(false)
    expect(hayCardio({ valor: 300 })).toBe(false)
    expect(hayCardio(null)).toBe(false)
  })

  it('por defecto se mide en metros', () => {
    expect(medidaDe({ modo: 'remo', valor: 300 })).toBe('metros')
    expect(medidaDe({ modo: 'assault', valor: 30, medida: 'segundos' })).toBe('segundos')
    expect(medidaDe({ modo: 'remo', valor: 300, medida: 'lo que sea' })).toBe('metros')
  })
})

describe('cuánto dura', () => {
  it('por tiempo, lo que ponga', () => {
    expect(segundosDeCardio({ modo: 'assault', valor: 30, medida: 'segundos' })).toBe(30)
  })

  /* 300 m de remo a 3,6 m/s son 83 s. Sale de la regla gruesa de la
     modalidad, porque de remo no hay test de nada. */
  it('por metros y sin test, con la regla gruesa de la máquina', () => {
    expect(segundosDeCardio({ modo: 'remo', valor: 300 })).toBe(Math.round(300 / 3.6))
  })

  /* Si la modalidad ES una disciplina, manda el ritmo del atleta: 400 m a
     4 m/s son 100 s, y no lo que diga ninguna tabla. */
  it('por metros y con disciplina, manda el ritmo del atleta', () => {
    expect(segundosDeCardio({ modo: 'cinta', valor: 400 }, 4)).toBe(100)
  })

  /* `null` NO es cero: es «no se sabe». Una cinta sin el test del atleta no
     puede estimar, y sumar 0 haría durar la sesión menos de lo que dura. */
  it('sin ritmo y sin regla, dice que no sabe en vez de decir cero', () => {
    expect(segundosDeCardio({ modo: 'cinta', valor: 400 })).toBeNull()
    expect(segundosDeCardio({ modo: 'cinta', valor: 400 }, 0)).toBeNull()
    expect(segundosDeCardio(null)).toBeNull()
  })
})

describe('adónde van los metros', () => {
  it('la cinta suma a carrera, y por todas las series', () => {
    expect(metrosDeCardio({ modo: 'cinta', valor: 400 }, 4)).toEqual({ disciplina: 'Carrera', metros: 1600 })
  })

  /* LA DECISIÓN QUE MÁS IMPORTA. 5.000 m de remo no son 5.000 m de carrera ni
     de bici: meterlos en el volumen de una disciplina de triatlón corrompería
     el número con el que el entrenador decide. Cuentan en duración y en carga,
     no en metros de nadie. */
  it('el remo y el ski no suman metros a ninguna disciplina', () => {
    expect(metrosDeCardio({ modo: 'remo', valor: 500 }, 4)).toBeNull()
    expect(metrosDeCardio({ modo: 'ski', valor: 500 })).toBeNull()
    expect(metrosSeQuedanFuera({ modo: 'remo', valor: 500 })).toBe(true)
    expect(metrosSeQuedanFuera({ modo: 'cinta', valor: 500 })).toBe(false)
  })

  it('lo prescrito por tiempo no suma metros a nadie', () => {
    expect(metrosDeCardio({ modo: 'cinta', valor: 120, medida: 'segundos' })).toBeNull()
    expect(metrosSeQuedanFuera({ modo: 'remo', valor: 120, medida: 'segundos' })).toBe(false)
  })

  it('pero sí duran, que es lo que hace que cuenten', () => {
    expect(segundosDeCardio({ modo: 'remo', valor: 500 })).toBeGreaterThan(0)
  })
})

describe('cómo se lee', () => {
  it('modalidad, cantidad, zona y objetivo', () => {
    expect(textoCardio({ modo: 'remo', valor: 300, zona: 'AEM' })).toBe('Remo 300 m · AEM')
    expect(textoCardio({ modo: 'assault', valor: 30, medida: 'segundos' })).toBe('Assault bike 30 s')
    expect(textoCardio({ modo: 'cinta', valor: 1500 })).toBe('Cinta 1,5 km')
    expect(textoCardio({ modo: 'rodillo', valor: 300, medida: 'segundos', zona: 'AEL' })).toBe('Rodillo / bici estática 5 min · AEL')
    expect(textoCardio({ modo: 'remo', valor: 500, objetivo: '2:00/500' })).toBe('Remo 500 m @ 2:00/500')
  })

  /* Una zona que ya no exista no se pinta: enseñaría una sigla que no lleva
     ningún ritmo detrás. */
  it('una zona inventada no se enseña', () => {
    expect(textoCardio({ modo: 'remo', valor: 300, zona: 'ZZZ' })).toBe('Remo 300 m')
  })

  it('sin cardio no hay texto', () => {
    expect(textoCardio({ modo: 'remo' })).toBe('')
    expect(textoCardio(null)).toBe('')
  })
})
