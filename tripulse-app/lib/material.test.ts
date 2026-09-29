import { describe, it, expect } from 'vitest'
import { kmDeMaterial, siLeSumo, comoSeLlama, valeParaLaSesion, type Material } from './material'

const zapas = (extra: Partial<Material> = {}): Material => ({
  id: 1, tipo: 'zapatillas', disciplina: 'Carrera', nombre: 'Nike Pegasus 41', ...extra,
})

const uso = (fecha: string, metros: number) => ({ fecha, metros })

describe('kmDeMaterial', () => {
  it('suma los metros de sus sesiones, en kilómetros', () => {
    const k = kmDeMaterial(zapas(), [uso('2026-09-01', 10000), uso('2026-09-03', 12500)])
    expect(k.total).toBe(22.5)
    expect(k.contador).toBe(22.5)
  })

  /* Casi ninguna zapatilla entra en la aplicación a cero: sin esto, el aviso de
     jubilación llegaría cientos de kilómetros tarde. */
  it('cuenta los kilómetros que ya traía', () => {
    const k = kmDeMaterial(zapas({ km_inicial: 120 }), [uso('2026-09-01', 10000)])
    expect(k.total).toBe(130)
  })

  it('sin sesiones son los que traía, y nada más', () => {
    expect(kmDeMaterial(zapas({ km_inicial: 120 }), []).total).toBe(120)
    expect(kmDeMaterial(zapas(), null).total).toBe(0)
  })

  describe('el límite', () => {
    it('sin límite no hay estado que dar', () => {
      const k = kmDeMaterial(zapas(), [uso('2026-09-01', 900000)])
      expect(k.estado).toBe('sin-limite')
      expect(k.limite).toBeNull()
      expect(k.restante).toBeNull()
      expect(k.fraccion).toBe(0)
    })

    it('lejos del límite, en orden', () => {
      const k = kmDeMaterial(zapas({ km_limite: 700 }), [uso('2026-09-01', 312000)])
      expect(k.estado).toBe('ok')
      expect(k.restante).toBe(388)
      expect(k.pasado).toBe(0)
    })

    /* El aviso salta en el último 10 %: con 700 km, a partir de 630. Antes sería
       ruido durante medio año; después, ya ha corrido con ellas rotas. */
    it('avisa en el último tramo', () => {
      expect(kmDeMaterial(zapas({ km_limite: 700 }), [uso('2026-09-01', 629000)]).estado).toBe('ok')
      expect(kmDeMaterial(zapas({ km_limite: 700 }), [uso('2026-09-01', 630000)]).estado).toBe('aviso')
      expect(kmDeMaterial(zapas({ km_limite: 400 }), [uso('2026-09-01', 368000)]).estado).toBe('aviso')
    })

    it('pasado el límite lo dice, y cuánto', () => {
      const k = kmDeMaterial(zapas({ km_limite: 700 }), [uso('2026-09-01', 742000)])
      expect(k.estado).toBe('pasado')
      expect(k.pasado).toBe(42)
      expect(k.restante).toBe(0)
      /* La barra no se sale de la caja. */
      expect(k.fraccion).toBe(1)
    })

    it('justo en el límite todavía no se ha pasado', () => {
      const k = kmDeMaterial(zapas({ km_limite: 700 }), [uso('2026-09-01', 700000)])
      expect(k.estado).toBe('aviso')
      expect(k.pasado).toBe(0)
    })
  })

  describe('el reinicio', () => {
    /* El caso del usuario: la cadena de la bici. Se cambia y el límite vuelve a
       empezar, pero la bici NO pierde sus kilómetros. */
    const bici = (extra: Partial<Material> = {}): Material => ({
      id: 2, tipo: 'bicicleta', disciplina: 'Ciclismo', nombre: 'Canyon Ultimate',
      km_limite: 4000, reinicio_fecha: '2026-06-30', ...extra,
    })
    const rodadas = [uso('2026-01-10', 2000000), uso('2026-05-10', 1500000), uso('2026-08-10', 620000)]

    it('el total NO se reinicia: la bici conserva lo que ha rodado', () => {
      expect(kmDeMaterial(bici(), rodadas).total).toBe(4120)
    })

    it('el contador del límite cuenta desde el reinicio', () => {
      const k = kmDeMaterial(bici(), rodadas)
      expect(k.contador).toBe(620)
      expect(k.restante).toBe(3380)
      expect(k.estado).toBe('ok')
      expect(k.reiniciado).toBe(true)
    })

    /* Los kilómetros que ya traía son de antes del reinicio por definición: si
       se contaran otra vez, la cadena nueva nacería con 120 km encima. */
    it('los kilómetros que ya traía no vuelven a contar tras un reinicio', () => {
      const k = kmDeMaterial(bici({ km_inicial: 120 }), rodadas)
      expect(k.total).toBe(4240)
      expect(k.contador).toBe(620)
    })

    it('una sesión del mismo día del reinicio no cuenta para el contador nuevo', () => {
      const k = kmDeMaterial(bici(), [uso('2026-06-30', 50000), uso('2026-07-01', 30000)])
      expect(k.contador).toBe(30)
    })

    it('sin reinicio, el contador y el total son lo mismo', () => {
      const k = kmDeMaterial(zapas({ km_limite: 700, km_inicial: 50 }), [uso('2026-09-01', 100000)])
      expect(k.total).toBe(150)
      expect(k.contador).toBe(150)
      expect(k.reiniciado).toBe(false)
    })
  })
})

describe('siLeSumo', () => {
  it('dice cómo quedaría antes de guardar', () => {
    const m = zapas({ km_limite: 400 })
    const antes = kmDeMaterial(m, [uso('2026-09-01', 368000)])
    const despues = siLeSumo(antes, 10000)
    expect(despues.contador).toBe(378)
    expect(despues.restante).toBe(22)
    expect(despues.estado).toBe('aviso')
  })

  it('caza el momento en que se pasa', () => {
    const antes = kmDeMaterial(zapas({ km_limite: 400 }), [uso('2026-09-01', 395000)])
    expect(antes.estado).toBe('aviso')
    expect(siLeSumo(antes, 10000).estado).toBe('pasado')
  })

  it('sin límite no inventa uno', () => {
    const antes = kmDeMaterial(zapas(), [uso('2026-09-01', 10000)])
    const despues = siLeSumo(antes, 10000)
    expect(despues.estado).toBe('sin-limite')
    expect(despues.total).toBe(20)
  })

  /* El total sube igual que el contador: sumarle a uno y no al otro dejaría la
     tarjeta diciendo dos cosas distintas del mismo entreno. */
  it('sube el total y el contador a la vez', () => {
    const antes = kmDeMaterial(zapas({ km_limite: 4000, reinicio_fecha: '2026-06-30' }),
      [uso('2026-01-01', 2000000), uso('2026-08-01', 500000)])
    const despues = siLeSumo(antes, 40000)
    expect(despues.total).toBe(2540)
    expect(despues.contador).toBe(540)
  })
})

describe('comoSeLlama', () => {
  it('el apodo manda, porque es lo que se reconoce', () => {
    expect(comoSeLlama(zapas({ apodo: 'las de placa' }))).toBe('las de placa')
  })
  it('sin apodo, el nombre', () => {
    expect(comoSeLlama(zapas())).toBe('Nike Pegasus 41')
    expect(comoSeLlama(zapas({ apodo: '   ' }))).toBe('Nike Pegasus 41')
  })
})

describe('valeParaLaSesion', () => {
  it('solo el material de ese deporte', () => {
    expect(valeParaLaSesion(zapas(), 'Carrera')).toBe(true)
    expect(valeParaLaSesion(zapas(), 'Ciclismo')).toBe(false)
  })
  it('lo jubilado no sale a elegir', () => {
    expect(valeParaLaSesion(zapas({ jubilado: true }), 'Carrera')).toBe(false)
  })
  it('da igual cómo venga escrita la disciplina', () => {
    expect(valeParaLaSesion(zapas(), 'carrera')).toBe(true)
  })
})
