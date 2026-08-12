import { describe, it, expect } from 'vitest'
import {
  colocarSemana, huecosDe, diasPorDefecto, resumenColocacion, REGLAS, DIAS,
  type DiaSemana, type SemanaColocada, type Hueco,
} from './plan-colocacion'
import { formaDeSemana, type EntradaSemana } from './plan-semana'

const base = (p: Partial<EntradaSemana> = {}): EntradaSemana => ({
  horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio', ...p,
})

const colocar = (p: Partial<EntradaSemana> = {}, dias?: number) => {
  const e = base(p)
  return colocarSemana(formaDeSemana(e), dias ?? e.diasSemana)
}

/** Todos los huecos colocados, con el índice del día en el que cayeron. */
const conDia = (s: SemanaColocada) =>
  s.dias.flatMap((d, i) => d.huecos.map(h => ({ ...h, i, dia: d.dia })))

describe('las reglas están bien formadas', () => {
  it('cada regla dice de dónde sale y cuánto pesa', () => {
    REGLAS.forEach(r => {
      expect(r.fuente, r.id).toBeTruthy()
      expect(r.texto, r.id).toBeTruthy()
      expect(r.peso, r.id).toBeGreaterThan(0)
    })
    expect(new Set(REGLAS.map(r => r.id)).size).toBe(REGLAS.length)
  })

  /* El orden de los pesos ES el criterio. Si algún día alguien lo toca, que sea
     a sabiendas: romper el duro-fácil tiene que costar más que cualquier otra
     cosa, porque es la única que invalida la sesión entera. */
  it('el duro-fácil es lo más caro de romper', () => {
    const peso = (id: string) => REGLAS.find(r => r.id === id)!.peso
    expect(peso('calidad-mismo-dia')).toBeGreaterThan(peso('calidad-seguida'))
    expect(peso('calidad-seguida')).toBeGreaterThan(peso('carrera-dura-antes-de-bici'))
    expect(peso('carrera-dura-antes-de-bici')).toBeGreaterThan(peso('bici-larga-antes-de-carrera'))
    expect(peso('larga-fuera-del-finde')).toBeLessThan(peso('sin-tiempo'))
  })
})

describe('los días por defecto dejan sitio al duro-fácil', () => {
  it('con tres días no los pone seguidos', () => {
    // Martes-jueves-sábado deja un día libre entre cada uno; lunes-martes-
    // miércoles no dejaría ninguno y la calidad no cabría.
    const d = diasPorDefecto(3)
    const idx = d.map(x => DIAS.indexOf(x))
    for (let i = 1; i < idx.length; i++) expect(idx[i] - idx[i - 1]).toBeGreaterThan(1)
  })

  it('van en orden de la semana y sin repetir', () => {
    for (let n = 1; n <= 7; n++) {
      const d = diasPorDefecto(n)
      expect(d).toHaveLength(n)
      expect(new Set(d).size).toBe(n)
      const idx = d.map(x => DIAS.indexOf(x))
      expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    }
  })

  it('lo que se pida fuera de rango se recorta en vez de reventar', () => {
    expect(diasPorDefecto(0)).toEqual(diasPorDefecto(1))
    expect(diasPorDefecto(99)).toEqual(diasPorDefecto(7))
    expect(diasPorDefecto(NaN as any)).toEqual(diasPorDefecto(1))
  })
})

describe('de la forma de la semana a los huecos', () => {
  it('salen tantos huecos como sesiones dijo el reparto', () => {
    const forma = formaDeSemana(base())
    expect(huecosDe(forma)).toHaveLength(forma.sesionesTotales)
  })

  it('la calidad se reparte entre disciplinas, no se amontona en una', () => {
    const forma = formaDeSemana(base({ nivel: 'avanzado', diasSemana: 7, horasSemana: 12 }))
    const calidades = huecosDe(forma).filter(h => h.calidad)
    expect(calidades.length).toBe(forma.sesionesCalidad)
    expect(new Set(calidades.map(h => h.bloque)).size).toBeGreaterThan(1)
  })

  /* Una sesión larga ya es la carga de ese día: ponerle encima la etiqueta de
     calidad sería contar dos veces el mismo esfuerzo. */
  it('la larga nunca es además la de calidad', () => {
    const forma = formaDeSemana(base({ nivel: 'elite', diasSemana: 7, horasSemana: 20 }))
    huecosDe(forma).forEach(h => expect(h.larga && h.calidad).toBe(false))
  })

  it('la fuerza no lleva sesión larga ni de calidad', () => {
    huecosDe(formaDeSemana(base())).filter(h => h.bloque === 'Fuerza')
      .forEach(h => { expect(h.larga).toBe(false); expect(h.calidad).toBe(false) })
  })
})

describe('el duro-fácil se respeta', () => {
  /* La regla más importante del microciclo (B1-04 Principio 1): dos días duros
     seguidos no dan dos adaptaciones, dan una adaptación y una sesión hecha con
     fatiga. Es la que un plan generado se salta primero. */
  it('nunca hay dos sesiones de calidad en días consecutivos', () => {
    ;['principiante', 'intermedio', 'avanzado', 'elite'].forEach(nivel => {
      [3, 4, 5, 6, 7].forEach(dias => {
        const s = colocar({ nivel: nivel as any, diasSemana: dias, horasSemana: 12 })
        const idxCalidad = s.dias.map((d, i) => d.huecos.some(h => h.calidad) ? i : -1).filter(i => i >= 0)
        for (let k = 1; k < idxCalidad.length; k++) {
          const hueco = DIAS.indexOf(s.dias[idxCalidad[k]].dia) - DIAS.indexOf(s.dias[idxCalidad[k - 1]].dia)
          expect(hueco, `${nivel}/${dias} días: calidad pegada`).toBeGreaterThan(1)
        }
      })
    })
  })

  it('nunca hay dos de calidad el mismo día', () => {
    [3, 4, 5, 6, 7].forEach(dias => {
      const s = colocar({ nivel: 'elite', diasSemana: dias, horasSemana: 15 })
      s.dias.forEach(d => {
        expect(d.huecos.filter(h => h.calidad).length, `${dias} días · ${d.dia}`).toBeLessThanOrEqual(1)
      })
    })
  })

  /* Cuando no cabe, se deja fuera y se dice. Una semana con un hueco es mejor
     que una semana que miente sobre lo que produce. */
  it('si no cabe otra calidad, la deja fuera en vez de pegarla', () => {
    const s = colocar({ nivel: 'elite', diasSemana: 3, horasSemana: 12 })
    if (s.sinColocar.some(h => h.calidad)) {
      expect(s.compromisos.join(' ')).toMatch(/36–48 h|pegada/i)
    }
    const idx = s.dias.map((d, i) => d.huecos.some(h => h.calidad) ? i : -1).filter(i => i >= 0)
    for (let k = 1; k < idx.length; k++) {
      expect(DIAS.indexOf(s.dias[idx[k]].dia) - DIAS.indexOf(s.dias[idx[k - 1]].dia)).toBeGreaterThan(1)
    }
  })
})

describe('el brick es deliberado, no un accidente', () => {
  /* B1-04 Principio 4 se titula literalmente «El Brick es una Sesión Específica,
     No un Accidente». Dejar que emergiera de que la bici y la carrera cayeran el
     mismo día daba TRES bricks por semana sin que ninguno fuera la sesión clave.
     Ahora se monta uno a mano, antes que nada. */
  it('hay exactamente uno por semana', () => {
    ;[3, 4, 5, 6, 7].forEach(dias => {
      const s = colocar({ diasSemana: dias, horasSemana: 12 })
      expect(conDia(s).filter(h => h.brick).length, `${dias} días`).toBe(1)
    })
  })

  it('cae en fin de semana y lleva la bici larga delante', () => {
    const s = colocar({ diasSemana: 6, horasSemana: 12 })
    const dia = s.dias.find(d => d.huecos.some(h => h.brick))!
    expect(['Sábado', 'Domingo']).toContain(dia.dia)
    expect(dia.huecos.some(h => h.bloque === 'Ciclismo' && h.larga)).toBe(true)
  })

  it('la bici va antes que la carrera dentro del día', () => {
    // Es el orden del triatlón: la segunda se corre con las piernas del día de
    // la prueba, que es justo para lo que sirve.
    const s = colocar({ diasSemana: 5, horasSemana: 12 })
    s.dias.forEach(d => {
      const bici = d.huecos.findIndex(h => h.bloque === 'Ciclismo')
      const carrera = d.huecos.findIndex(h => h.bloque === 'Carrera')
      if (bici >= 0 && carrera >= 0) expect(bici, d.dia).toBeLessThan(carrera)
    })
  })

  it('la carrera del brick no es la larga ni la de calidad', () => {
    // Esas dos ya son la carga de su propio día; encadenarlas a la bici larga
    // sería meter dos sesiones clave en la misma.
    const s = colocar({ diasSemana: 6, horasSemana: 12 })
    const brick = conDia(s).find(h => h.brick)!
    expect(brick.larga).toBe(false)
    expect(brick.calidad).toBe(false)
  })
})

describe('la interferencia entre disciplinas', () => {

  it('la sesión larga tira al fin de semana', () => {
    const s = colocar({ diasSemana: 6, horasSemana: 12 })
    const largas = conDia(s).filter(h => h.larga)
    expect(largas.length).toBeGreaterThan(0)
    expect(largas.some(h => h.dia === 'Sábado' || h.dia === 'Domingo')).toBe(true)
  })

  it('cuando dobla una regla, lo cuenta con su fuente', () => {
    const s = colocar({ diasSemana: 3, horasSemana: 14 })
    if (s.compromisos.length) {
      expect(s.compromisos.join(' ')).toMatch(/B1-04|disponibilidad/)
    }
  })

  /* Doblar un día pasa en casi toda semana de triatlón. Sacarlo como compromiso
     lo convertía en ruido: en la semana de Ironman salían nueve avisos y ocho
     eran ese. Lo que se reporta es lo que de verdad es una concesión. */
  it('doblar un día no se reporta como compromiso: es la vida normal', () => {
    const s = colocar({ diasSemana: 7, horasSemana: 16, distancia: 'largo' })
    const conDoble = s.dias.filter(d => d.huecos.length > 1)
    expect(conDoble.length, 'la prueba no vale si nadie dobla').toBeGreaterThan(0)
    expect(s.compromisos.join(' ')).not.toMatch(/Más de una sesión en el mismo día/)
  })
})

describe('la disponibilidad real del atleta', () => {
  const disp = (ds: [DiaSemana, number | null][]) => ds.map(([dia, minutos]) => ({ dia, minutos }))

  it('solo usa los días que el atleta tiene', () => {
    const s = colocarSemana(formaDeSemana(base()), disp([['Martes', null], ['Jueves', null], ['Sábado', null]]))
    expect(s.dias.map(d => d.dia)).toEqual(['Martes', 'Jueves', 'Sábado'])
  })

  it('los ordena por la semana aunque lleguen desordenados', () => {
    const s = colocarSemana(formaDeSemana(base()), disp([['Sábado', null], ['Martes', null], ['Jueves', null]]))
    expect(s.dias.map(d => d.dia)).toEqual(['Martes', 'Jueves', 'Sábado'])
  })

  it('respeta el tiempo de cada día y avisa de lo que no cabe', () => {
    // Media hora al día no da para una semana de 70.3, y eso hay que decirlo.
    const s = colocarSemana(formaDeSemana(base()), disp(DIAS.map(d => [d, 30] as [DiaSemana, number | null])))
    expect(s.sinColocar.length + s.compromisos.length).toBeGreaterThan(0)
  })

  it('sin ningún día no inventa una semana', () => {
    const s = colocarSemana(formaDeSemana(base()), [])
    expect(s.dias).toEqual([])
    expect(s.sinColocar.length).toBeGreaterThan(0)
    expect(s.avisos.join(' ')).toMatch(/ningún día/i)
  })

  it('dice cuándo ha usado la disponibilidad real y cuándo el reparto por defecto', () => {
    const real = colocarSemana(formaDeSemana(base()), disp([['Martes', null], ['Jueves', null]]))
    expect(real.avisos.join(' ')).toMatch(/disponibilidad real/i)
    expect(colocar({}, 6).avisos.join(' ')).not.toMatch(/disponibilidad real/i)
  })
})

describe('no se pierde ni se inventa ninguna sesión', () => {
  it('lo colocado más lo que no cupo es exactamente lo que pidió el reparto', () => {
    ;[3, 4, 5, 6, 7].forEach(dias => ['sprint', 'olimpico', 'medio', 'largo'].forEach(d => {
      const e = base({ diasSemana: dias, distancia: d as any, horasSemana: 12 })
      const forma = formaDeSemana(e)
      const s = colocarSemana(forma, dias)
      const total = s.dias.reduce((a, x) => a + x.huecos.length, 0) + s.sinColocar.length
      expect(total, `${d}/${dias} días`).toBe(forma.sesionesTotales)
    }))
  })

  it('los minutos de cada día son la suma de sus sesiones', () => {
    const s = colocar({ diasSemana: 5 })
    s.dias.forEach(d => {
      expect(d.minutos, d.dia).toBe(d.huecos.reduce((a, h) => a + h.minutos, 0))
    })
  })

  it('el resumen se lee de un vistazo y marca descansos', () => {
    const s = colocar({ diasSemana: 7, horasSemana: 8 })
    const txt = resumenColocacion(s)
    expect(txt).toMatch(/Lunes|Martes/)
    expect(txt).toMatch(/′/)
  })
})
