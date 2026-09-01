import { describe, it, expect } from 'vitest'
import {
  estadoGrupoInicial, darSalida, marcar, desmarcar, siguienteSerie, pararGrupo,
  msComun, dentro, filasDeAtleta, horquilla, marcasTotales,
} from './dirigir-grupo'

const T0 = 1_000_000
const IDS = [11, 22, 33]
const nuevo = () => estadoGrupoInicial(IDS, 4)

describe('el reloj común', () => {
  it('arranca parado y con todos sin marcar', () => {
    const e = nuevo()
    expect(e.modo).toBe('parado')
    expect(dentro(e)).toBe(0)
    expect(e.entradas[11]).toHaveLength(4)
  })

  it('el reloj solo corre después de dar la salida', () => {
    const e = nuevo()
    expect(msComun(e, T0 + 5000)).toBe(0)
    expect(msComun(darSalida(e, T0), T0 + 5000)).toBe(5000)
  })

  it('marcar sella el tiempo desde la salida, no la hora del día', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 212_000)
    expect(e.entradas[11][0]).toBe(212_000)
  })

  it('sin salida dada no se puede marcar', () => {
    const e = marcar(nuevo(), 11, T0)
    expect(e.entradas[11][0]).toBeNull()
  })

  it('cuenta cuántos han entrado', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 212_000)
    e = marcar(e, 22, T0 + 218_000)
    expect(dentro(e)).toBe(2)
  })

  /* Si te adelantas con el dedo, tocar otra vez lo vuelve a sellar. */
  it('volver a tocar corrige el tiempo', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 200_000)
    e = marcar(e, 11, T0 + 212_000)
    expect(e.entradas[11][0]).toBe(212_000)
  })

  it('y se puede quitar del todo', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 200_000)
    e = desmarcar(e, 11)
    expect(e.entradas[11][0]).toBeNull()
    expect(dentro(e)).toBe(0)
  })

  it('un atleta que no está en el grupo no rompe nada', () => {
    const e = darSalida(nuevo(), T0)
    expect(marcar(e, 99, T0 + 1000)).toBe(e)
    expect(desmarcar(e, 99)).toBe(e)
  })
})

describe('el descanso de cada uno, que es la gracia de todo esto', () => {
  /* Salen juntos, Marta entra a 3:32 y Diego a 3:38. La salida siguiente es a
     5:00. Marta descansa 1:28 y Diego 1:22: seis segundos menos, exactamente
     los que le sacó de ventaja. */
  it('lo calcula desde SU entrada hasta la salida común siguiente', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 212_000)   // 3:32
    e = marcar(e, 22, T0 + 218_000)   // 3:38
    e = siguienteSerie(e, T0 + 300_000) // salida a 5:00
    expect(e.descansos[11][0]).toBe(88_000)
    expect(e.descansos[22][0]).toBe(82_000)
  })

  it('el que entró antes descansa más, siempre', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 200_000)
    e = marcar(e, 22, T0 + 230_000)
    e = siguienteSerie(e, T0 + 300_000)
    expect(e.descansos[11][0]).toBeGreaterThan(e.descansos[22][0] as number)
  })

  /* No se sabe cuándo terminó, ni si terminó. Inventarle un descanso desde la
     salida sería inventarse el dato entero. */
  it('a quien no entró no se le inventa un descanso', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 200_000)
    e = siguienteSerie(e, T0 + 300_000)
    expect(e.descansos[33][0]).toBeNull()
  })

  it('la serie avanza y el reloj se reinicia', () => {
    let e = darSalida(nuevo(), T0)
    e = siguienteSerie(e, T0 + 300_000)
    expect(e.serie).toBe(1)
    expect(msComun(e, T0 + 300_000)).toBe(0)
    expect(msComun(e, T0 + 310_000)).toBe(10_000)
  })

  it('parar del todo cierra el descanso de la serie en curso', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 200_000)
    e = pararGrupo(e, T0 + 280_000)
    expect(e.modo).toBe('parado')
    expect(e.descansos[11][0]).toBe(80_000)
    // Y NO avanza de serie: el entrenamiento se acabó, no continúa.
    expect(e.serie).toBe(0)
  })
})

describe('un entrenamiento entero de tres series', () => {
  const correr = () => {
    let e = darSalida(nuevo(), T0)
    let t = T0
    for (let s = 0; s < 3; s++) {
      e = marcar(e, 11, t + 210_000)
      e = marcar(e, 22, t + 216_000)
      e = marcar(e, 33, t + 224_000)
      t += 300_000
      e = s < 2 ? siguienteSerie(e, t) : pararGrupo(e, t)
    }
    return e
  }

  it('cada atleta acumula sus tres tiempos', () => {
    const e = correr()
    expect(e.entradas[11].filter(Boolean)).toHaveLength(3)
    expect(e.entradas[33][2]).toBe(224_000)
  })

  it('y sus tres descansos, distintos entre ellos', () => {
    const e = correr()
    expect(e.descansos[11][0]).toBe(90_000)
    expect(e.descansos[33][0]).toBe(76_000)
  })

  it('la horquilla dice si el grupo va junto', () => {
    const e = correr()
    expect(horquilla(e, 0)).toBe(14_000)   // 224 − 210
  })

  it('con menos de dos entradas no hay horquilla que dar', () => {
    let e = darSalida(nuevo(), T0)
    expect(horquilla(e, 0)).toBeNull()
    e = marcar(e, 11, T0 + 200_000)
    expect(horquilla(e, 0)).toBeNull()
  })
})

describe('filasDeAtleta — lo que se guarda', () => {
  const conDatos = () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 212_000)
    e = marcar(e, 22, T0 + 218_000)
    e = siguienteSerie(e, T0 + 300_000)
    e = marcar(e, 11, T0 + 300_000 + 215_000)
    e = pararGrupo(e, T0 + 600_000)
    return e
  }

  it('una fila por serie marcada de ESE atleta', () => {
    expect(filasDeAtleta(conDatos(), 11, 77)).toHaveLength(2)
    expect(filasDeAtleta(conDatos(), 22, 88)).toHaveLength(1)
  })

  it('cada uno va contra la tarea de SU sesión', () => {
    expect(filasDeAtleta(conDatos(), 11, 77)[0].id_tarea).toBe(77)
    expect(filasDeAtleta(conDatos(), 22, 88)[0].id_tarea).toBe(88)
  })

  it('los segundos van enteros y numerados desde 1', () => {
    const f = filasDeAtleta(conDatos(), 11, 77)
    expect(f[0]).toMatchObject({ numero_serie: 1, tiempo_real: 212, descanso_real: 88 })
    expect(f[1].numero_serie).toBe(2)
  })

  it('quien no entró en una serie no genera fila para esa serie', () => {
    expect(filasDeAtleta(conDatos(), 22, 88).map(f => f.numero_serie)).toEqual([1])
  })

  it('deja dicho quién lo apuntó', () => {
    expect(filasDeAtleta(conDatos(), 11, 77)[0].anotado_por).toBe('entrenador')
  })

  it('sin nada marcado no sale ninguna fila', () => {
    expect(filasDeAtleta(nuevo(), 11, 77)).toEqual([])
    expect(filasDeAtleta(nuevo(), 999, 77)).toEqual([])
  })
})

describe('marcasTotales', () => {
  it('cuenta todas las marcas de todas las series', () => {
    let e = darSalida(nuevo(), T0)
    e = marcar(e, 11, T0 + 200_000)
    e = marcar(e, 22, T0 + 210_000)
    e = siguienteSerie(e, T0 + 300_000)
    e = marcar(e, 11, T0 + 500_000)
    expect(marcasTotales(e)).toBe(3)
  })
  it('sin nada marcado, cero: se sale sin preguntar', () => {
    expect(marcasTotales(nuevo())).toBe(0)
    expect(marcasTotales(darSalida(nuevo(), T0))).toBe(0)
  })
})
