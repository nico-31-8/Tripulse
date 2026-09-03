import { describe, it, expect } from 'vitest'
import { vamDeMontreal, cssDeDosDistancias, ftpDeRampa, pamDeRampa, FACTOR_FTP_RAMPA, ritmoDeVam, ritmoDeCss } from './tests-formulas'

describe('vamDeMontreal', () => {
  it('el escalón completo cuenta entero', () => {
    // Aguantó los 60 s del escalón de 18 km/h → la VAM ES 18.
    expect(vamDeMontreal({ velUltimo: 18, durTotal: 60, tiempoAguantado: 60, incrementoVel: 0.5 })).toBe(18)
  })

  it('el escalón a medias cuenta a medias', () => {
    // Media mitad del escalón de 0,5 km/h → 18 − 0,25.
    expect(vamDeMontreal({ velUltimo: 18, durTotal: 60, tiempoAguantado: 30, incrementoVel: 0.5 })).toBe(17.8)
  })

  it('acepta cadenas, que es lo que da un formulario', () => {
    expect(vamDeMontreal({ velUltimo: '18', durTotal: '60', tiempoAguantado: '60', incrementoVel: '0.5' })).toBe(18)
  })

  it('a medias no es un test: null, no un número inventado', () => {
    expect(vamDeMontreal({ velUltimo: 18, durTotal: 60, tiempoAguantado: '', incrementoVel: 0.5 })).toBeNull()
    expect(vamDeMontreal({ velUltimo: '', durTotal: '', tiempoAguantado: '', incrementoVel: '' })).toBeNull()
  })
})

describe('cssDeDosDistancias', () => {
  it('la pendiente entre las dos distancias', () => {
    // 400 m en 300 s y 200 m en 140 s → 200 m en 160 s = 1,25 m/s.
    expect(cssDeDosDistancias({ distanciaGrande: 400, distanciaPequena: 200, tiempoGrande: 300, tiempoPequeno: 140 })).toBe(1.25)
  })

  it('si los tiempos no tienen sentido, no hay CSS', () => {
    /* Con los dos tiempos iguales la división sería entre cero (infinito), y con
       el corto más lento que el largo saldría negativo. Ninguna de las dos es un
       CSS: son un dato mal metido, y enseñar «-2,5 m/s» sería peor que no
       enseñar nada. */
    expect(cssDeDosDistancias({ distanciaGrande: 400, distanciaPequena: 200, tiempoGrande: 300, tiempoPequeno: 300 })).toBeNull()
    expect(cssDeDosDistancias({ distanciaGrande: 400, distanciaPequena: 200, tiempoGrande: 140, tiempoPequeno: 300 })).toBeNull()
  })

  it('las distancias al revés tampoco', () => {
    expect(cssDeDosDistancias({ distanciaGrande: 200, distanciaPequena: 400, tiempoGrande: 300, tiempoPequeno: 140 })).toBeNull()
  })
})

describe('pamDeRampa — el último escalón', () => {
  it('el escalón completo cuenta entero', () => {
    expect(pamDeRampa({ potenciaPico: 300, incrementoPot: 20, tiempoNoCompletado: 60, durEscalones: 60 })).toBe(300)
  })

  it('a mitad del escalón, la mitad del incremento', () => {
    expect(pamDeRampa({ potenciaPico: 300, incrementoPot: 20, tiempoNoCompletado: 30, durEscalones: 60 })).toBe(290)
  })

  it('sin datos, null', () => {
    expect(pamDeRampa({ potenciaPico: 300, incrementoPot: 20, tiempoNoCompletado: '', durEscalones: 60 })).toBeNull()
  })
})

/* ESTE BLOQUE EXISTE PORQUE LA FUNCIÓN DEVOLVÍA LA PAM Y SE GUARDABA COMO FTP.
   El 0,75 no se aplicaba en ninguna parte del código, así que el FTP de todos
   los ciclistas era un tercio más alto — y las zonas salen de ahí. */
describe('ftpDeRampa — es el 75 % de la PAM', () => {
  it('300 W de PAM son 225 de FTP, no 300', () => {
    const e = { potenciaPico: 300, incrementoPot: 20, tiempoNoCompletado: 60, durEscalones: 60 }
    expect(pamDeRampa(e)).toBe(300)
    expect(ftpDeRampa(e)).toBe(225)
  })

  it('siempre es menor que la PAM', () => {
    const e = { potenciaPico: 300, incrementoPot: 20, tiempoNoCompletado: 30, durEscalones: 60 }
    expect(ftpDeRampa(e)!).toBeLessThan(pamDeRampa(e)!)
  })

  it('el factor es el de la batería de tests', () => {
    expect(FACTOR_FTP_RAMPA).toBe(0.75)
  })

  it('sin datos, null', () => {
    expect(ftpDeRampa({ potenciaPico: 300, incrementoPot: 20, tiempoNoCompletado: '', durEscalones: 60 })).toBeNull()
  })
})

describe('cómo se leen', () => {
  it('la VAM en minutos por kilómetro', () => {
    expect(ritmoDeVam(18)).toBe('3:20 /km')
    expect(ritmoDeVam(15)).toBe('4:00 /km')
  })

  it('el CSS en minutos por cien metros', () => {
    expect(ritmoDeCss(1.25)).toBe('1:20 /100m')
  })

  it('sin número, una raya', () => {
    expect(ritmoDeVam(null)).toBe('—')
    expect(ritmoDeVam(0)).toBe('—')
    expect(ritmoDeCss(null)).toBe('—')
  })
})
