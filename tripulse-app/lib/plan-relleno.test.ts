import { describe, it, expect } from 'vitest'
import {
  rellenarSemana, elegirPlantilla, nivelDePlantilla, clavesValidas, resumenRelleno,
  type EntradaRelleno,
} from './plan-relleno'
import { formaDeSemana, type EntradaSemana } from './plan-semana'
import { colocarSemana } from './plan-colocacion'
import { resolverClave, plantillasDe, opcionesDe } from './plantillas'
import { fuerzaDeFase } from './plantillas-fuerza'

const base = (p: Partial<EntradaSemana> = {}): EntradaSemana => ({
  horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio', ...p,
})

const llenar = (p: Partial<EntradaSemana> = {}, usadas: string[] = []) => {
  const e = base(p)
  const forma = formaDeSemana(e)
  const colocada = colocarSemana(forma, e.diasSemana)
  return rellenarSemana({ forma, colocada, nivel: e.nivel, fase: e.fase, usadas } as EntradaRelleno)
}

describe('toda sesión sale del catálogo, ninguna se inventa', () => {
  /* La propiedad que hace segura toda la cadena: el planificador ELIGE de una
     lista cerrada. Cuando la IA entre encima, su peor caso sera elegir regular
     — nunca producir algo que la app no sepa aplicar. */
  it('todas las claves resuelven de verdad', () => {
    ;['sprint', 'olimpico', 'medio', 'largo'].forEach(d =>
      [3, 4, 5, 6, 7].forEach(dias => {
        const s = llenar({ distancia: d as any, diasSemana: dias, horasSemana: 12 })
        expect(clavesValidas(s), `${d} / ${dias} dias`).toBe(true)
        s.relleno.filter(r => r.clave).forEach(r => {
          const res = resolverClave(r.clave)!
          expect(res.plantilla.disciplina, r.clave).toBe(r.hueco.bloque)
          expect(res.plantilla.zona, r.clave).toBe(r.zona)
        })
      }))
  })

  it('cada hueco colocado acaba lleno o explicado, ninguno se pierde', () => {
    ;[3, 5, 7].forEach(dias => {
      const e = base({ diasSemana: dias, horasSemana: 12 })
      const forma = formaDeSemana(e)
      const colocada = colocarSemana(forma, dias)
      const s = rellenarSemana({ forma, colocada, nivel: e.nivel, fase: e.fase })
      const puestos = colocada.dias.reduce((a, d) => a + d.huecos.length, 0)
      expect(s.relleno.length + s.sinLlenar.length, `${dias} dias`).toBe(puestos)
    })
  })

  it('cada elección dice por qué', () => {
    llenar().relleno.forEach(r => {
      expect(r.motivo, r.nombre).toBeTruthy()
      expect(r.nombre, r.clave).toBeTruthy()
    })
  })
})

describe('la zona que le toca a cada hueco', () => {
  it('la sesión larga va a la zona base, no a una zona alta', () => {
    // Una tirada larga en zona alta no es una tirada larga, es una carrera.
    llenar().relleno.filter(r => r.hueco.larga).forEach(r => {
      expect(['AER', 'AEL'], `${r.nombre} en ${r.zona}`).toContain(r.zona)
    })
  })

  it('la de calidad va a una zona dura, que es para lo que existe', () => {
    const s = llenar({ nivel: 'avanzado', diasSemana: 7, horasSemana: 12 })
    const calidades = s.relleno.filter(r => r.hueco.calidad)
    expect(calidades.length).toBeGreaterThan(0)
    calidades.forEach(r => {
      expect(['AER', 'AEL'], `${r.nombre} de calidad en ${r.zona}`).not.toContain(r.zona)
    })
  })

  /* CUATRO COSAS QUE SOLO SE VIERON IMPRIMIENDO LA SEMANA. Los 16 tests pasaban
     y salia «Potencia neuromuscular, 96 minutos» como sesion de calidad de un
     70.3 — PLA son esfuerzos de ocho segundos. La raiz: se elegia «la zona mas
     dura con algo de presupuesto», y las zonas anaerobicas tienen una miga (0-1 %)
     que basta para colarse. */
  it('las zonas lácticas y alácticas NO se reparten solas', () => {
    ;['sprint', 'olimpico', 'medio', 'largo'].forEach(d => {
      const s = llenar({ distancia: d as any, diasSemana: 6, horasSemana: 12 })
      s.relleno.filter(r => r.clave).forEach(r => {
        expect(['CLA', 'PLA', 'CALA', 'PALA'], `${d}: ${r.nombre} en ${r.zona}`).not.toContain(r.zona)
      })
    })
  })

  it('una recuperación nunca dura más de una hora', () => {
    // Una rodadura de recuperacion de 96 minutos no es una recuperacion.
    ;[6, 10, 16].forEach(h => {
      llenar({ horasSemana: h, diasSemana: 6 }).relleno
        .filter(r => r.zona === 'AER')
        .forEach(r => expect(r.minutos, `${h} h · ${r.nombre}`).toBeLessThanOrEqual(60))
    })
  })

  it('la carrera del brick no va en recuperación', () => {
    // Existe para correr con las piernas del dia de la prueba, y eso no se
    // entrena trotando suave.
    const brick = llenar({ diasSemana: 6 }).relleno.find(r => r.hueco.brick)!
    expect(brick).toBeDefined()
    expect(['AEL', 'AEM']).toContain(brick.zona)
  })

  /* Con «la zona de calidad con mas presupuesto» a secas, en una distribucion
     piramidal AEM gana siempre: el atleta no pisaba el umbral en toda la semana
     y el presupuesto de AEI existia sin usarse nunca. */
  it('las sesiones de calidad de la semana no repiten zona entre ellas', () => {
    ;[['avanzado', 7], ['intermedio', 6]].forEach(([n, d]) => {
      const zonas = llenar({ nivel: n as any, diasSemana: d as number, horasSemana: 12 })
        .relleno.filter(r => r.hueco.calidad).map(r => r.zona)
      expect(new Set(zonas).size, `${n}/${d}: ${zonas.join(', ')}`).toBe(zonas.length)
    })
  })

  it('el grueso del volumen cae en las zonas suaves', () => {
    // Es lo que pide cualquier modelo de distribucion de intensidad: la mayor
    // parte del tiempo por debajo del umbral.
    const s = llenar({ diasSemana: 6, horasSemana: 12 })
    const suave = s.relleno.filter(r => ['AER', 'AEL', 'AEM'].includes(r.zona))
      .reduce((a, r) => a + r.minutos, 0)
    const total = s.relleno.reduce((a, r) => a + r.minutos, 0)
    expect(suave / total).toBeGreaterThan(0.6)
  })
})

describe('no repetir lo que se acaba de hacer', () => {
  /* Sin esto el catalogo entero da igual: el algoritmo cogeria siempre la
     primera opcion y el atleta veria la misma sesion todas las semanas por
     muchas variantes que haya. */
  it('elige la que hace más que no se usa', () => {
    const todas = plantillasDe('Ciclismo').filter(p => p.zona === 'AEM').flatMap(p => opcionesDe(p).map(o => o.clave))
    expect(todas.length).toBeGreaterThan(1)
    // Con la primera recien usada, tiene que coger otra.
    const r = elegirPlantilla('Ciclismo', 'AEM', [todas[0]])
    expect(r!.clave).not.toBe(todas[0])
  })

  it('cuando ya se han hecho todas, vuelve por la más antigua', () => {
    const todas = plantillasDe('Ciclismo').filter(p => p.zona === 'AEM').flatMap(p => opcionesDe(p).map(o => o.clave))
    // `usadas` va de mas reciente a mas antigua: la ultima del array es la mas vieja.
    const r = elegirPlantilla('Ciclismo', 'AEM', [...todas])
    expect(r!.clave).toBe(todas[todas.length - 1])
  })

  it('dentro de la misma semana tampoco repite', () => {
    const s = llenar({ diasSemana: 7, horasSemana: 14 })
    const claves = s.relleno.filter(r => r.clave).map(r => r.clave)
    expect(new Set(claves).size, 'hay sesiones repetidas en la misma semana').toBe(claves.length)
  })

  it('con una sola opción lo dice, en vez de fingir que eligió', () => {
    // Es el aviso que señala donde hace falta ampliar el catalogo. La zona de
    // ejemplo se BUSCA en vez de escribirse: este test uso AER en ciclismo hasta
    // que esa zona paso de 1 opcion a 4, y entonces fallo por la razon correcta.
    const unaSola = (['Natacion', 'Ciclismo', 'Carrera'] as const).flatMap(d =>
      [...new Set(plantillasDe(d).map(p => p.zona))]
        .map(z => ({ d, z, n: plantillasDe(d).filter(p => p.zona === z).reduce((a, p) => a + opcionesDe(p).length, 0) })))
      .find(x => x.n === 1)
    expect(unaSola, 'ya no queda ninguna zona con una sola opción — actualiza este test').toBeDefined()
    expect(elegirPlantilla(unaSola!.d, unaSola!.z, [])!.motivo).toMatch(/única/i)
  })

  it('el aviso de «sin alternativa» sale cuando toca', () => {
    const s = llenar()
    const hayUnicas = s.relleno.some(x => x.motivo.includes('la única'))
    expect(s.avisos.some(a => a.includes('Sin alternativa'))).toBe(hayUnicas)
  })

  it('una zona sin plantillas no revienta, se reporta', () => {
    expect(elegirPlantilla('Ciclismo', 'NO-EXISTE', [])).toBeNull()
  })
})

describe('cuánto repite un atleta de verdad', () => {
  /* EL TEST QUE VIGILA LA VARIEDAD, y vigila el numero que importa — no cuantas
     plantillas hay, sino cuantas veces sale la misma sesion.

     El catalogo tenia la variedad puesta AL REVES: yo puse variantes donde la
     literatura documenta metodos, y B1-00d describe cinco formas de hacer un
     VO2max y una de rodar suave. Resultado: la rodadura de recuperacion en bici
     salia 12,8 veces en un bloque de 12 semanas con UNA sola opcion, mientras
     AEI y PAE tenian 3-4 opciones para menos de tres usos.

     Nueve variantes bien colocadas —no «mas plantillas» en todas partes— lo
     bajaron todo por debajo de 3,5. */
  const repeticiones = () => {
    const SEMANAS = 12
    const f = formaDeSemana(base())
    const out: { zona: string; disc: string; rep: number }[] = []
    ;(['Natacion', 'Ciclismo', 'Carrera'] as const).forEach(d => {
      const b = f.bloques.find(x => x.bloque === d)!
      if (!b.minutos) return
      f.zonas[d].forEach(fr => {
        const ses = (b.minutos * ((fr.min + fr.max) / 2) / 100 / b.minutosPorSesion) * SEMANAS
        if (ses < 1) return
        const op = plantillasDe(d).filter(p => fr.siglas.includes(p.zona))
          .reduce((a, p) => a + opcionesDe(p).length, 0)
        if (op) out.push({ zona: fr.siglas.join('+'), disc: d, rep: ses / op })
      })
    })
    return out
  }

  it('ninguna sesión sale más de 3,5 veces en un bloque de 12 semanas', () => {
    repeticiones().forEach(x => {
      expect(x.rep, `${x.zona} en ${x.disc} sale ${x.rep.toFixed(1)} veces — le faltan variantes`)
        .toBeLessThan(3.5)
    })
  })

  it('las zonas donde se pasa el tiempo tienen al menos tres alternativas', () => {
    // AER y AEL son el grueso del volumen en las tres disciplinas: son las que
    // mas se repiten y las que menos documenta la literatura.
    ;(['Natacion', 'Ciclismo', 'Carrera'] as const).forEach(d =>
      ['AER', 'AEL'].forEach(z => {
        const op = plantillasDe(d).filter(p => p.zona === z)
          .reduce((a, p) => a + opcionesDe(p).length, 0)
        expect(op, `${z} en ${d}`).toBeGreaterThanOrEqual(3)
      }))
  })
})

describe('la fuerza', () => {
  it('coge la plantilla de su fase del macrociclo', () => {
    ;(['pg-inicial', 'pg-avanzada', 'pe-inicial', 'pe-avanzada', 'tapering'] as const).forEach(fase => {
      const s = llenar({ fase })
      const fu = s.relleno.find(r => r.hueco.bloque === 'Fuerza')
      if (fu) expect(fu.claveFuerza, fase).toBe(fuerzaDeFase(fase)[0].id)
    })
  })

  it('en transición no hay fuerza que rellenar', () => {
    const s = llenar({ fase: 'transicion' })
    expect(s.relleno.filter(r => r.hueco.bloque === 'Fuerza')).toHaveLength(0)
  })
})

describe('el nivel', () => {
  it('los cuatro niveles del atleta caben en los tres del catálogo', () => {
    expect(nivelDePlantilla('principiante')).toBe('principiante')
    expect(nivelDePlantilla('intermedio')).toBe('intermedio')
    expect(nivelDePlantilla('avanzado')).toBe('avanzado')
    expect(nivelDePlantilla('elite')).toBe('avanzado')
  })

  it('el nivel llega a todas las sesiones', () => {
    const s = llenar({ nivel: 'principiante' })
    s.relleno.forEach(r => expect(r.nivel).toBe('principiante'))
  })
})

describe('el resumen', () => {
  it('se lee por días', () => {
    const txt = resumenRelleno(llenar({ diasSemana: 6 }))
    expect(txt).toMatch(/Sábado|Domingo/)
    expect(txt).toMatch(/′/)
  })
})
