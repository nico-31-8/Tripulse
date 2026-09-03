import { describe, it, expect } from 'vitest'
import {
  mss, swolf, leeSWOLF, ratioFuerzaPeso, nivelVAM, nivelCSS,
  potenciaCMJ, alturaDeVuelo, eur, leeEUR, potenciaEscalera,
  rmDeReps, textoRM, kilosAlPorcentaje,
  vamDe6Min, vamDeMilla, umbralDeT30, ftpDe20Min, pamDeFtp, umbralDeT400, asr,
  indiceElasticidad, leeIE, rsi, leeRSI,
  deterioroBrick, leeDeterioro, decoupling, leeDecoupling,
} from './tests-campo'

describe('potenciaCMJ — Sayers', () => {
  /* 60,7 × 40 + 45,3 × 70 − 2055 = 2428 + 3171 − 2055 = 3544 */
  it('aplica la fórmula del vault', () => {
    expect(potenciaCMJ(40, 70)).toBe(3544)
  })

  /* Mover 90 kg los mismos centímetros no es la misma potencia que mover 60.
     Por eso el peso no es opcional. */
  it('el peso cambia el resultado, y mucho', () => {
    expect(potenciaCMJ(40, 90)).toBeGreaterThan(potenciaCMJ(40, 70)!)
  })

  it('saltar más da más potencia', () => {
    expect(potenciaCMJ(45, 70)).toBeGreaterThan(potenciaCMJ(40, 70)!)
  })

  it('sin peso no se inventa uno', () => {
    expect(potenciaCMJ(40, null)).toBeNull()
    expect(potenciaCMJ(40, 0)).toBeNull()
  })

  it('sin altura tampoco', () => {
    expect(potenciaCMJ(null, 70)).toBeNull()
    expect(potenciaCMJ(-5, 70)).toBeNull()
  })
})

describe('alturaDeVuelo', () => {
  /* h = 9,807 × 0,5² / 8 = 0,30647 m = 30,6 cm */
  it('convierte medio segundo de vuelo en 30,6 cm', () => {
    expect(alturaDeVuelo(0.5)).toBe(30.6)
  })

  it('más vuelo, más altura', () => {
    expect(alturaDeVuelo(0.6)).toBeGreaterThan(alturaDeVuelo(0.5)!)
  })

  it('sin vuelo no hay altura', () => {
    expect(alturaDeVuelo(0)).toBeNull()
    expect(alturaDeVuelo(null)).toBeNull()
  })
})

describe('eur — cuánto le suma el contramovimiento', () => {
  it('es el cociente entre los dos saltos', () => {
    expect(eur(40, 35)).toBe(1.14)
  })

  it('igual a 1 cuando el contramovimiento no aporta nada', () => {
    expect(eur(35, 35)).toBe(1)
  })

  it('sin uno de los dos saltos no hay cociente', () => {
    expect(eur(40, null)).toBeNull()
    expect(eur(null, 35)).toBeNull()
    expect(eur(40, 0)).toBeNull()
  })

  it('lo traduce a una frase que dice qué le falta', () => {
    /* Los cortes son los de la bateria de tests, no los que me invente en la
       primera version: >1,1 bueno, ~1,0 mejorable, <1,0 pliometria. */
    expect(leeEUR(0.95)).toContain('no le suma')
    expect(leeEUR(1.05)).toContain('Mejorable')
    expect(leeEUR(1.2)).toContain('Buen contramovimiento')
    expect(leeEUR(null)).toBe('')
  })
})

describe('potenciaEscalera — Margaria-Kalamen', () => {
  /* 70 × 9,807 × 1,02 / 0,5 = 1400,5 → 1400 */
  it('aplica la fórmula del vault', () => {
    expect(potenciaEscalera(70, 1.02, 0.5)).toBe(1400)
  })

  it('tardar menos es más potencia', () => {
    expect(potenciaEscalera(70, 1.02, 0.4)).toBeGreaterThan(potenciaEscalera(70, 1.02, 0.5)!)
  })

  it('si falta cualquiera de los tres, no hay número', () => {
    expect(potenciaEscalera(null, 1.02, 0.5)).toBeNull()
    expect(potenciaEscalera(70, null, 0.5)).toBeNull()
    expect(potenciaEscalera(70, 1.02, 0)).toBeNull()
  })
})

describe('rmDeReps — las dos fórmulas y su rango', () => {
  /* Epley:   80 × (1 + 8/30)   = 101,3
     Brzycki: 80 / (1,0278 − 0,2224) = 99,3 */
  it('calcula las dos', () => {
    const r = rmDeReps(80, 8)!
    expect(r.epley).toBe(101.3)
    expect(r.brzycki).toBe(99.3)
  })

  it('el rango va del menor al mayor', () => {
    const r = rmDeReps(80, 8)!
    expect(r.min).toBe(99.3)
    expect(r.max).toBe(101.3)
  })

  /* LAS DOS FÓRMULAS SE CRUZAN EN LAS 10 REPETICIONES. Lo escribí al revés
     —«se separan más cuantas más reps»— y este test lo cazó. Epley va por
     encima hasta 10 y Brzycki se dispara después, así que a 10 coinciden casi
     exactamente: el rango sale estrechísimo JUSTO donde la estimación empieza
     a ser mala. Por eso el ancho del rango no mide fiabilidad y el aviso mira
     las repeticiones. */
  it('Epley va por encima con pocas reps', () => {
    const r = rmDeReps(80, 3)!
    expect(r.epley).toBeGreaterThan(r.brzycki)
  })

  it('y Brzycki se dispara con muchas', () => {
    const r = rmDeReps(80, 15)!
    expect(r.brzycki).toBeGreaterThan(r.epley)
  })

  it('en 10 repeticiones se cruzan y casi coinciden', () => {
    expect(rmDeReps(80, 10)!.horquilla).toBeLessThan(0.5)
  })

  it('una repetición ya ES el 1RM: no se estima lo que se midió', () => {
    const r = rmDeReps(100, 1)!
    expect(r.min).toBe(100)
    expect(r.max).toBe(100)
    expect(r.horquilla).toBe(0)
  })

  it('avisa cuando pasa de 10 repeticiones', () => {
    expect(rmDeReps(80, 8)!.aviso).toBeNull()
    expect(rmDeReps(60, 12)!.aviso).toContain('fiabilidad')
  })

  /* Brzycki se dispara cerca de 37 reps, y a partir de 15 ya no se mide fuerza
     máxima sino resistencia muscular, que es otra cualidad. */
  it('por encima de 15 repeticiones no estima', () => {
    expect(rmDeReps(50, 16)).toBeNull()
    expect(rmDeReps(50, 40)).toBeNull()
  })

  it('sin peso o sin reps, nada', () => {
    expect(rmDeReps(null, 8)).toBeNull()
    expect(rmDeReps(80, 0)).toBeNull()
    expect(rmDeReps(0, 8)).toBeNull()
  })
})

describe('textoRM', () => {
  it('enseña el rango', () => {
    expect(textoRM(rmDeReps(80, 8))).toBe('entre 99.3 y 101.3 kg')
  })
  it('un solo número cuando no hay rango', () => {
    expect(textoRM(rmDeReps(100, 1))).toBe('100 kg')
  })
  it('una raya cuando no hay dato', () => {
    expect(textoRM(null)).toBe('—')
  })
})

describe('kilosAlPorcentaje', () => {
  /* Si el 1RM está entre 99,3 y 101,3, el 80% está entre 79,5 y 81. Dar un solo
     número aquí seria fingir que se conoce el 1RM exacto. */
  it('devuelve los dos extremos, redondeados a medio kilo', () => {
    const k = kilosAlPorcentaje(rmDeReps(80, 8), 80)!
    expect(k.min).toBe(79.5)
    expect(k.max).toBe(81)
  })

  it('sin 1RM no hay porcentaje', () => {
    expect(kilosAlPorcentaje(null, 80)).toBeNull()
  })

  it('un porcentaje imposible no devuelve nada', () => {
    expect(kilosAlPorcentaje(rmDeReps(80, 8), 0)).toBeNull()
  })
})

describe('carrera', () => {
  /* 1500 m en 6 min son 15 km/h. */
  it('el test de 6 min es la media, sin más', () => {
    expect(vamDe6Min(1500)).toBe(15)
    expect(vamDe6Min(1620)).toBe(16.2)
  })

  it('la milla: 96,54 / minutos', () => {
    expect(vamDeMilla(6)).toBe(16.1)   // 96,54/6 = 16,09
  })

  /* Treinta minutos al máximo se sostienen POR ENCIMA del umbral, así que el
     umbral es un 3 % más lento. Sobre el ritmo en segundos: más es más lento. */
  it('el T30 deja el umbral un 3 % más lento', () => {
    expect(umbralDeT30(240)).toBe(247)
    expect(umbralDeT30(240)!).toBeGreaterThan(240)
  })

  it('sin dato, nada', () => {
    expect(vamDe6Min(0)).toBeNull()
    expect(vamDeMilla(null)).toBeNull()
    expect(umbralDeT30(-1)).toBeNull()
  })
})

describe('ciclismo', () => {
  it('el FTP de 20 min es el 95 % de la media', () => {
    expect(ftpDe20Min(300)).toBe(285)
  })

  it('y la PAM estimada, un 28 % por encima del FTP', () => {
    expect(pamDeFtp(285)).toBe(365)
  })

  /* Los dos caminos al FTP tienen que llegar parecido. Una rampa de 380 W de
     PAM da 285 de FTP, y un 20' de 300 W de media da los mismos 285. */
  it('la rampa y el test de 20 min llegan al mismo sitio', () => {
    expect(ftpDe20Min(300)).toBe(285)
    expect(Math.round(380 * 0.75)).toBe(285)
  })

  it('sin dato, nada', () => {
    expect(ftpDe20Min(0)).toBeNull()
    expect(pamDeFtp(null)).toBeNull()
  })
})

describe('natación', () => {
  /* 400 en 5:20 (320 s) → 320/4 + 5 = 85 s por 100. */
  it('el T400 da el ritmo umbral por 100', () => {
    expect(umbralDeT400(320)).toBe(85)
  })
  it('sin tiempo, nada', () => {
    expect(umbralDeT400(null)).toBeNull()
  })
})

describe('asr — motor o cilindrada', () => {
  it('es la punta menos la VAM', () => {
    expect(asr(28, 18)).toBe(10)
  })

  /* Una punta por debajo de la VAM no es una reserva pequeña: es un dato mal
     medido, y devolver un negativo lo colaría como si fuera real. */
  it('una punta por debajo de la VAM no devuelve un negativo', () => {
    expect(asr(16, 18)).toBeNull()
    expect(asr(18, 18)).toBeNull()
  })

  it('sin uno de los dos, nada', () => {
    expect(asr(28, null)).toBeNull()
  })
})

describe('índices de salto', () => {
  /* IE = (40 − 35)/35 × 100 = 14,3 % */
  it('el índice de elasticidad divide entre SJ', () => {
    expect(indiceElasticidad(40, 35)).toBe(14.3)
  })

  /* La batería avisa de que existe la variante dividiendo entre CMJ. Si se
     usara esa, 40 y 35 darían 12,5 y no 14,3: mezclarlas haría que la evolución
     de un atleta pareciera moverse cuando lo que cambió fue la fórmula. */
  it('y NO entre CMJ, que daría otro número', () => {
    expect(indiceElasticidad(40, 35)).not.toBe(12.5)
  })

  it('lo traduce a lo que hay que entrenar', () => {
    expect(leeIE(8)).toContain('pliometría')
    expect(leeIE(16)).toContain('Buen aprovechamiento')
    expect(leeIE(null)).toBe('')
  })

  /* RSI = 0,30 m / 0,180 s = 1,67 */
  it('el RSI cuenta el contacto en milisegundos', () => {
    expect(rsi(30, 180)).toBe(1.67)
  })

  it('saltar lo mismo apoyando más es peor RSI', () => {
    expect(rsi(30, 250)!).toBeLessThan(rsi(30, 180)!)
  })

  it('lee los baremos de la batería', () => {
    expect(leeRSI(1.2)).toContain('reactividad')
    expect(leeRSI(2.2)).toContain('élite')
    expect(leeRSI(2.8)).toContain('excelente')
    expect(leeRSI(1.7)).toContain('recreativo')
  })

  it('los umbrales del EUR son los del documento', () => {
    expect(leeEUR(0.95)).toContain('pliometría')
    expect(leeEUR(1.05)).toContain('Mejorable')
    expect(leeEUR(1.2)).toContain('Buen contramovimiento')
  })
})

describe('funcionales de triatlón', () => {
  /* Corre a 4:00 (240 s) aislado y a 4:12 (252 s) en brick → 5 %. */
  it('el deterioro del brick sale en porcentaje', () => {
    expect(deterioroBrick(252, 240)).toBe(5)
  })

  it('lee los baremos', () => {
    expect(leeDeterioro(3)!.nivel).toBe('bien')
    expect(leeDeterioro(6)!.nivel).toBe('bien')
    expect(leeDeterioro(12)!.nivel).toBe('normal')
    expect(leeDeterioro(20)!.nivel).toBe('mal')
  })

  /* Correr más rápido tras la bici casi siempre significa que el test aislado
     se hizo sin apretar, no que mejore con la fatiga. */
  it('un deterioro negativo avisa de que el test aislado no valía', () => {
    expect(leeDeterioro(-3)!.texto).toContain('test aislado')
  })

  /* 140 → 148 ppm = 5,7 % */
  it('la deriva cardiaca sale en porcentaje', () => {
    expect(decoupling(140, 148)).toBe(5.7)
  })

  it('lee los baremos de la deriva', () => {
    expect(leeDecoupling(3)!.nivel).toBe('bien')
    expect(leeDecoupling(7)!.nivel).toBe('normal')
    expect(leeDecoupling(14)!.nivel).toBe('mal')
    expect(leeDecoupling(14)!.texto).toContain('volumen fácil')
  })

  it('sin datos no hay banda', () => {
    expect(leeDeterioro(null)).toBeNull()
    expect(leeDecoupling(null)).toBeNull()
    expect(decoupling(null, 148)).toBeNull()
  })
})

describe('mss — la punta de velocidad', () => {
  it('30 m lanzados en 3,5 s son 30,9 km/h', () => {
    expect(mss(30, 3.5)).toBe(30.9)
    expect(mss(60, 6.5)).toBe(33.2)
  })

  it('sin uno de los dos, null', () => {
    expect(mss(30, null)).toBeNull()
    expect(mss(0, 3.5)).toBeNull()
  })

  it('alimenta la ASR, y por eso importa que el sprint sea lanzado', () => {
    /* Mismos 30 m: lanzado 3,5 s, desde parado 4,3 s. La MSS cae 5 km/h y la
       ASR entera se va con ella. El protocolo no es cosmético. */
    expect(asr(mss(30, 3.5), 18)).toBe(12.9)
    expect(asr(mss(30, 4.3), 18)).toBe(7.1)
  })
})

describe('swolf', () => {
  it('suma brazadas y segundos', () => {
    expect(swolf(18, 20)).toBe(38)
    expect(swolf(15, 17)).toBe(32)
  })

  it('NO mejora si baja brazadas a costa de tardar más', () => {
    /* Es justo lo que el SWOLF existe para detectar: 18+20 y 15+23 son lo
       mismo. Una métrica que solo contase brazadas premiaría la segunda. */
    expect(swolf(18, 20)).toBe(swolf(15, 23))
  })

  it('las referencias son de 25 m y calla en otra piscina', () => {
    expect(leeSWOLF(32)).toContain('competitivo')
    expect(leeSWOLF(45)).toContain('recreativo')
    expect(leeSWOLF(32, 50)).toContain('25 m')
    expect(leeSWOLF(null)).toBe('')
  })
})

describe('ratioFuerzaPeso', () => {
  it('cuántas veces su peso levanta', () => {
    expect(ratioFuerzaPeso(120, 70)).toBe(1.71)
    expect(ratioFuerzaPeso(100, 100)).toBe(1)
  })

  it('el mismo 1RM no vale lo mismo en dos cuerpos', () => {
    expect(ratioFuerzaPeso(100, 60)).toBeGreaterThan(ratioFuerzaPeso(100, 90)!)
  })

  it('sin peso no se inventa', () => {
    expect(ratioFuerzaPeso(120, null)).toBeNull()
  })
})

describe('niveles de referencia', () => {
  it('VAM: los cortes de la batería, y son distintos por sexo', () => {
    expect(nivelVAM(21, 'Hombre')).toBe('pro')
    expect(nivelVAM(19, 'Hombre')).toBe('élite')
    expect(nivelVAM(17, 'Hombre')).toBe('avanzado')
    expect(nivelVAM(14, 'Hombre')).toBe('medio')
    expect(nivelVAM(12, 'Hombre')).toBe('principiante')
    expect(nivelVAM(19, 'Mujer')).toBe('pro')
    expect(nivelVAM(15, 'Mujer')).toBe('avanzado')
  })

  it('13 km/h es «medio» en una tabla y «avanzado» en la otra: por eso no se elige por defecto', () => {
    expect(nivelVAM(13, 'Hombre')).toBe('medio')
    expect(nivelVAM(15, 'Mujer')).toBe('avanzado')
    expect(nivelVAM(15, 'Hombre')).toBe('medio')
  })

  it('sin sexo NO se adivina, y «Prefiero no decirlo» es una respuesta del alta', () => {
    expect(nivelVAM(17, 'Prefiero no decirlo')).toBeNull()
    expect(nivelVAM(17, null)).toBeNull()
    expect(nivelCSS(85, '')).toBeNull()
  })

  it('CSS: menos segundos es mejor nivel', () => {
    expect(nivelCSS(78, 'Hombre')).toBe('pro')
    expect(nivelCSS(85, 'Hombre')).toBe('élite')
    expect(nivelCSS(100, 'Hombre')).toBe('avanzado')
    expect(nivelCSS(130, 'Hombre')).toBe('principiante')
    expect(nivelCSS(85, 'Mujer')).toBe('pro')
    expect(nivelCSS(130, 'Mujer')).toBe('medio')
  })

  it('el CSS en m/s se convierte antes de leer el nivel', () => {
    /* cssDeDosDistancias da m/s y la tabla está en s/100m. Cruzarlas sin
       convertir daría «principiante» a todo el mundo, porque 1,25 nunca va a
       ser menor que 80. */
    const ms = 1.25
    expect(nivelCSS(100 / ms, 'Hombre')).toBe('pro')
  })
})
