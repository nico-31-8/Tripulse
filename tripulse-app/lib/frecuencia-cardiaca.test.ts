import { describe, it, expect } from 'vitest'
import {
  TABLA_NSCA, UMBRAL_SOBRE_FCMAX, hayReserva, fcrDesdeFcmax,
  ppmDePctFcmax, bandaFC, deDondeSaleLaFC, fcReposoDe,
} from './frecuencia-cardiaca'

/*
  La fuente es la tabla 20.1 de NSCA Essentials cap. 20, que está en el vault.
  Todo lo de aquí se comprueba contra ella; si algún día se toca la tabla, estos
  tests deberían caerse y obligar a mirar por qué.
*/

describe('la tabla de la NSCA', () => {
  it('va de menos a más en las dos columnas', () => {
    for (let i = 1; i < TABLA_NSCA.length; i++) {
      expect(TABLA_NSCA[i][0]).toBeGreaterThan(TABLA_NSCA[i - 1][0])
      expect(TABLA_NSCA[i][1]).toBeGreaterThan(TABLA_NSCA[i - 1][1])
    }
  })

  it('el %FCmáx siempre va por delante del %FCR — que es justo el punto', () => {
    // Si fueran iguales no haría falta convertir nada. La diferencia es la que
    // hace que un 70 % de FCmáx NO sea un 70 % de esfuerzo.
    TABLA_NSCA.forEach(([fcr, max]) => expect(max).toBeGreaterThan(fcr))
  })

  it('los puntos de la tabla se devuelven exactos', () => {
    TABLA_NSCA.forEach(([fcr, max]) => expect(fcrDesdeFcmax(max)).toBeCloseTo(fcr, 6))
  })
})

describe('pasar de %FCmáx a %FCR', () => {
  it('interpola entre dos puntos', () => {
    // 70 % FCmáx cae entre 66 (=50 FCR) y 74 (=60 FCR): a mitad de camino.
    expect(fcrDesdeFcmax(70)).toBeCloseTo(55, 6)
  })

  it('NO extrapola fuera de la tabla: se queda en los extremos', () => {
    // Estirar la recta daría negativos por abajo y más de 100 por arriba.
    expect(fcrDesdeFcmax(40)).toBe(50)
    expect(fcrDesdeFcmax(0)).toBe(50)
    expect(fcrDesdeFcmax(120)).toBe(90)
  })

  it('nunca baja al subir', () => {
    let previo = -1
    for (let p = 0; p <= 120; p++) {
      const v = fcrDesdeFcmax(p)
      expect(v).toBeGreaterThanOrEqual(previo)
      previo = v
    }
  })

  it('un valor imposible no rompe nada', () => {
    expect(fcrDesdeFcmax(NaN)).toBe(0)
  })
})

describe('cuándo se puede usar Karvonen', () => {
  it('hacen falta las dos', () => {
    expect(hayReserva({ fcMax: 190, fcReposo: 60 })).toBe(true)
    expect(hayReserva({ fcMax: 190 })).toBe(false)
    expect(hayReserva({ fcMax: 190, fcReposo: null })).toBe(false)
    expect(hayReserva({ fcMax: 0, fcReposo: 60 })).toBe(false)
  })

  it('y en el orden correcto: un reposo por encima de la máxima es un dedazo', () => {
    expect(hayReserva({ fcMax: 190, fcReposo: 200 })).toBe(false)
    expect(hayReserva({ fcMax: 190, fcReposo: 190 })).toBe(false)
  })
})

describe('las pulsaciones de un porcentaje', () => {
  it('sin FC de reposo se aplica sobre la máxima, como se hacía', () => {
    expect(ppmDePctFcmax(70, { fcMax: 190 })).toBe(133)
  })

  it('con FC de reposo va por Karvonen', () => {
    // 70 %FCmáx → 55 %FCR. 60 + 0,55 × 130 = 131,5 → 132.
    expect(ppmDePctFcmax(70, { fcMax: 190, fcReposo: 60 })).toBe(132)
  })

  it('PARA UN ATLETA CORRIENTE APENAS CAMBIA, y eso es correcto', () => {
    // La tabla codifica un reposo típico, así que los dos métodos coinciden casi.
    // Si la diferencia fuese grande aquí, sería la conversión la que está mal.
    const sin = ppmDePctFcmax(80, { fcMax: 190 })
    const con = ppmDePctFcmax(80, { fcMax: 190, fcReposo: 60 })
    expect(Math.abs(sin - con)).toBeLessThanOrEqual(4)
  })

  it('DONDE CAMBIA ES EN QUIEN SE SALE DE LO TÍPICO', () => {
    // Un atleta muy entrenado, 45 de reposo: el %FCmáx le manda más alto de lo
    // que le toca. Esto es lo que la corrección viene a arreglar.
    const sin = ppmDePctFcmax(70, { fcMax: 190 })
    const con = ppmDePctFcmax(70, { fcMax: 190, fcReposo: 45 })
    expect(sin).toBe(133)
    expect(con).toBe(125)
  })

  it('sin FCmáx no se inventa nada', () => {
    expect(ppmDePctFcmax(70, { fcMax: 0 })).toBe(0)
  })
})

describe('la banda de una zona', () => {
  const ana = { fcMax: 190, fcReposo: 60 }

  it('las siglas traen su % ya en FCmáx', () => {
    const b = bandaFC(70, 80, 'fcmax', { fcMax: 190 })
    expect(b?.texto).toBe('133–152 ppm')
    expect(b?.metodo).toBe('fcmax')
  })

  it('las clásicas vienen en % del umbral y se convierten', () => {
    // Z2 es 75–85 % del umbral, y el umbral es el 85 % de la FCmáx.
    const b = bandaFC(75, 85, 'umbral', { fcMax: 190 })
    expect(b?.min).toBe(Math.round(190 * 75 * UMBRAL_SOBRE_FCMAX / 100))
    expect(b?.max).toBe(Math.round(190 * 85 * UMBRAL_SOBRE_FCMAX / 100))
  })

  it('LOS DOS SISTEMAS PASAN POR EL MISMO SITIO', () => {
    // Era el fallo: cada rama calculaba a su manera. Con el mismo % efectivo,
    // los dos tienen que dar el mismo número.
    const porSigla = bandaFC(85 * UMBRAL_SOBRE_FCMAX, null, 'fcmax', ana)
    const porClasica = bandaFC(85, null, 'umbral', ana)
    expect(porSigla?.min).toBe(porClasica?.min)
  })

  it('con reposo lo dice, para no atribuirle a la máxima lo que no es', () => {
    expect(bandaFC(70, 80, 'fcmax', ana)?.metodo).toBe('karvonen')
    expect(bandaFC(70, 80, 'fcmax', { fcMax: 190 })?.metodo).toBe('fcmax')
    expect(deDondeSaleLaFC('karvonen')).toContain('reserva')
    expect(deDondeSaleLaFC('fcmax')).toContain('máxima')
  })

  it('con un solo extremo sale un «menor que» o un «mayor que»', () => {
    expect(bandaFC(null, 70, 'fcmax', { fcMax: 190 })?.texto).toBe('< 133 ppm')
    expect(bandaFC(93, null, 'fcmax', { fcMax: 190 })?.texto).toBe('> 177 ppm')
  })

  it('SIN BANDA ES UN RESULTADO, NO UN FALLO', () => {
    // CLA, PLA y CALA no llevan FC: el esfuerzo acaba antes de que el corazón
    // llegue, y un número ahí sería peor que ninguno.
    expect(bandaFC(null, null, 'fcmax', ana)).toBeNull()
    expect(bandaFC(0, 0, 'fcmax', ana)).toBeNull()
  })

  it('sin FCmáx tampoco hay banda', () => {
    expect(bandaFC(70, 80, 'fcmax', { fcMax: 0, fcReposo: 60 })).toBeNull()
  })
})

describe('de dónde se saca la FC de reposo', () => {
  const w = (...v: number[]) => v.map(fc_reposo => ({ fc_reposo }))

  it('EL WELLNESS MANDA SOBRE LA ANAMNESIS: uno es de cada mañana y el otro de una vez', () => {
    expect(fcReposoDe(w(52, 54, 53), { fc_reposo: 70 })).toBe(53)
  })

  it('se usa la MEDIANA, no la media: una mañana mala no debe mover la zona', () => {
    // Con la media, ese 90 subiría el reposo casi 10 pulsaciones.
    expect(fcReposoDe(w(50, 51, 52, 53, 90))).toBe(52)
  })

  it('con menos de tres mediciones no se saca mediana de nada', () => {
    expect(fcReposoDe(w(52, 54), { fc_reposo: 70 })).toBe(70)
  })

  it('sin wellness tira de la anamnesis', () => {
    expect(fcReposoDe([], { fc_reposo: 58 })).toBe(58)
    expect(fcReposoDe(null, { fc_reposo: 58 })).toBe(58)
  })

  it('sin nada devuelve 0, y entonces no hay Karvonen', () => {
    expect(fcReposoDe([], null)).toBe(0)
    expect(hayReserva({ fcMax: 190, fcReposo: fcReposoDe([], null) })).toBe(false)
  })

  it('los valores imposibles se tiran antes de contarlos', () => {
    // Un 5 o un 300 es un dedazo. Colarlos en la mediana movería la zona base.
    expect(fcReposoDe(w(5, 52, 54, 53, 300))).toBe(53)
    expect(fcReposoDe([], { fc_reposo: 300 })).toBe(0)
  })

  it('una o dos sueltas valen más que nada, pero no se promedian', () => {
    expect(fcReposoDe(w(52), null)).toBe(52)
  })
})
