import { describe, it, expect } from 'vitest'
import {
  EQUIVALENCIA, ZONAS_FUENTE, DISTRIBUCION_POR_DISTANCIA, DISTRIBUCION_POR_FASE,
  RITMO_COMPETICION_CARRERA, HUECOS_VAM, repartoPorDistancia, repartoPorFase,
  distanciaDePrueba, ritmoDePrueba, pruebasSinDistribucion, tidDeFase,
  type Disciplina, type DistanciaTri, type FaseMacro,
} from './distribucion-zonas'
import { ZONAS_RESISTENCIA } from './zonas'
import { PRUEBAS } from './pruebas'

const DISCIPLINAS: Disciplina[] = ['Carrera', 'Ciclismo', 'Natacion']
const DISTANCIAS: DistanciaTri[] = ['sprint', 'olimpico', 'medio', 'largo']
const FASES: FaseMacro[] = ['transicion', 'pg-inicial', 'pg-avanzada', 'pe-inicial', 'pe-avanzada', 'tapering']
const SIGLAS = ZONAS_RESISTENCIA.map(z => z.sigla)

describe('el puente entre las zonas de la fuente y las de la app', () => {
  it('toda sigla del puente existe de verdad en lib/zonas.ts', () => {
    ZONAS_FUENTE.forEach(z => DISCIPLINAS.forEach(d => {
      EQUIVALENCIA[z][d].forEach(s => {
        expect(SIGLAS, `${z} · ${d} apunta a '${s}', que no existe`).toContain(s)
      })
    }))
  })

  /* Este es el motivo de que el puente tenga tres columnas. Si algún día alguien
     lo "simplifica" a una sola tabla, este test es el que lo para. */
  it('el «umbral» de la fuente NO cae en la misma zona en los tres deportes', () => {
    expect(EQUIVALENCIA['Z4'].Carrera).toEqual(['AEM'])   // Tuimil Z4 → AEM (B1-00e §2.1)
    expect(EQUIVALENCIA['Z4'].Ciclismo).toEqual(['AEI'])  // Coggan N4 → AEI
    expect(EQUIVALENCIA['Z4'].Natacion).toEqual(['AEI'])  // CSS Z4 → AEI
  })

  it('en carrera, Z3 y Z4 caen las dos en AEM, así que su presupuesto se suma', () => {
    const tabla = DISTRIBUCION_POR_DISTANCIA.olimpico
    const z3 = tabla['Z3'].Carrera, z4 = tabla['Z4'].Carrera
    const aem = repartoPorDistancia('olimpico', 'Carrera').find(f => f.siglas.join() === 'AEM')!
    expect(aem.min).toBe(z3.min + z4.min)
    expect(aem.max).toBe(z3.max + z4.max)
    expect(aem.zonasFuente).toEqual(['Z3', 'Z4'])
  })

  it('en ciclismo NO se suman, porque caen en zonas distintas', () => {
    const franjas = repartoPorDistancia('olimpico', 'Ciclismo')
    expect(franjas.find(f => f.siglas.join() === 'AEM')!.zonasFuente).toEqual(['Z3'])
    expect(franjas.find(f => f.siglas.join() === 'AEI')!.zonasFuente).toEqual(['Z4'])
  })

  it('el cajón anaeróbico se marca como presupuesto compartido, no como uno por sigla', () => {
    const franja = repartoPorDistancia('sprint', 'Natacion').find(f => f.siglas.length > 1)!
    expect(franja.siglas).toEqual(['CLA', 'PLA', 'CALA', 'PALA'])
    // Ciclismo tiene una menos: CLA es Coggan N6 y va aparte.
    const bici = repartoPorDistancia('sprint', 'Ciclismo').find(f => f.siglas.length > 1)!
    expect(bici.siglas).toEqual(['PLA', 'CALA', 'PALA'])
  })
})

describe('las tablas de distribución están bien transcritas', () => {
  /* Una tabla de reparto tiene que poder sumar 100 %. Si los mínimos suman más
     de 100 o los máximos menos, hay un número mal copiado — y sería del tipo de
     error que no revienta nada: solo reparte mal el volumen para siempre. */
  it('cada distancia y disciplina admite un reparto que suma 100 %', () => {
    DISTANCIAS.forEach(d => DISCIPLINAS.forEach(disc => {
      const tabla = DISTRIBUCION_POR_DISTANCIA[d]
      const min = ZONAS_FUENTE.reduce((a, z) => a + tabla[z][disc].min, 0)
      const max = ZONAS_FUENTE.reduce((a, z) => a + tabla[z][disc].max, 0)
      expect(min, `${d}/${disc}: los mínimos suman ${min}`).toBeLessThanOrEqual(100)
      expect(max, `${d}/${disc}: los máximos suman ${max}`).toBeGreaterThanOrEqual(100)
    }))
  })

  it('cada fase del macrociclo también', () => {
    FASES.forEach(f => {
      const zonas = DISTRIBUCION_POR_FASE[f].zonas
      const min = ZONAS_FUENTE.reduce((a, z) => a + zonas[z].min, 0)
      const max = ZONAS_FUENTE.reduce((a, z) => a + zonas[z].max, 0)
      expect(min, `${f}: mínimos ${min}`).toBeLessThanOrEqual(100)
      expect(max, `${f}: máximos ${max}`).toBeGreaterThanOrEqual(100)
    })
  })

  it('ningún rango está del revés', () => {
    DISTANCIAS.forEach(d => DISCIPLINAS.forEach(disc => ZONAS_FUENTE.forEach(z => {
      const rep = DISTRIBUCION_POR_DISTANCIA[d][z][disc]
      expect(rep.min, `${d}/${disc}/${z}`).toBeLessThanOrEqual(rep.max)
    })))
  })

  /* La intensidad sube según acorta la prueba: es la afirmación que sostiene
     todo el módulo («un 800 no se entrena como un Ironman»). */
  it('cuanto más corta la prueba, más volumen de alta intensidad', () => {
    DISCIPLINAS.forEach(disc => {
      const alta = (d: DistanciaTri) =>
        DISTRIBUCION_POR_DISTANCIA[d]['Z5'][disc].max +
        DISTRIBUCION_POR_DISTANCIA[d]['Z6'][disc].max +
        DISTRIBUCION_POR_DISTANCIA[d]['Z7-Z8'][disc].max
      expect(alta('sprint'), disc).toBeGreaterThan(alta('olimpico'))
      expect(alta('olimpico'), disc).toBeGreaterThan(alta('medio'))
      expect(alta('medio'), disc).toBeGreaterThan(alta('largo'))
    })
  })

  it('el tapering mantiene la calidad aunque baje el volumen', () => {
    // B1-00b Parte 5: en tapering Z4–Z6 se mantienen altas; es lo que lo
    // distingue de una semana de descarga cualquiera.
    const tap = DISTRIBUCION_POR_FASE.tapering.zonas
    const pe = DISTRIBUCION_POR_FASE['pe-avanzada'].zonas
    expect(tap['Z5'].max).toBeGreaterThanOrEqual(pe['Z5'].max)
    expect(tidDeFase('tapering')).toBe('Polarizado')
    expect(tidDeFase('pe-avanzada')).toBe('Piramidal')
  })
})

describe('a qué intensidad se compite cada distancia (carrera)', () => {
  /* No se comprueba contra números escritos a mano: se comprueba contra
     lib/zonas.ts. Si alguien mueve un corte de zona, este test lo dice. */
  it('el % de VAM de cada prueba cae dentro de la zona que se le asigna', () => {
    RITMO_COMPETICION_CARRERA.forEach(rc => {
      const z = ZONAS_RESISTENCIA.find(x => x.sigla === rc.zona)!
      expect(z, `zona '${rc.zona}' de ${rc.prueba}`).toBeDefined()
      if (z.vamMin != null) expect(rc.vamMin, `${rc.prueba} por debajo de ${z.sigla}`).toBeGreaterThanOrEqual(z.vamMin)
      if (z.vamMax != null) expect(rc.vamMax, `${rc.prueba} por encima de ${z.sigla}`).toBeLessThanOrEqual(z.vamMax)
    })
  })

  it('un 800 y un maratón no se corren ni de lejos en la misma zona', () => {
    const ochocientos = RITMO_COMPETICION_CARRERA.find(x => x.prueba === '800 m')!
    const maraton = RITMO_COMPETICION_CARRERA.find(x => x.prueba === 'Maratón')!
    expect(ochocientos.zona).toBe('CLA')
    expect(maraton.zona).toBe('AEM')
    expect(ochocientos.vamMin).toBeGreaterThan(maraton.vamMax)
  })

  it('la tabla va de más rápido a más lento sin saltos raros', () => {
    for (let i = 1; i < RITMO_COMPETICION_CARRERA.length; i++) {
      expect(RITMO_COMPETICION_CARRERA[i].vamMax)
        .toBeLessThanOrEqual(RITMO_COMPETICION_CARRERA[i - 1].vamMin)
    }
  })

  /* Los huecos de %VAM son un pendiente documentado (B1-00e §2.3), no una
     invención de este módulo: se comprueban contra lib/zonas.ts. */
  it('los huecos declarados son huecos de verdad en el catálogo de zonas', () => {
    HUECOS_VAM.forEach(h => {
      const dentro = ZONAS_RESISTENCIA.filter(z =>
        z.vamMin != null && z.vamMax != null && z.vamMin < h.hasta && z.vamMax > h.desde)
      expect(dentro.map(z => z.sigla), `el hueco ${h.desde}–${h.hasta} % ya no existe`).toEqual([])
    })
  })
})

describe('de una prueba del catálogo a su distribución', () => {
  it('todo id del mapa existe en lib/pruebas.ts', () => {
    // El mismo fallo silencioso de siempre: un id mal escrito no rompe nada,
    // simplemente esa prueba nunca encuentra su distribución.
    const ids = PRUEBAS.map(p => p.id)
    PRUEBAS.forEach(p => {
      const d = distanciaDePrueba(p.id)
      if (d) expect(ids).toContain(p.id)
    })
    expect(distanciaDePrueba('tri-larga')).toBe('largo')
    expect(distanciaDePrueba('tri-sprint')).toBe('sprint')
  })

  it('las pruebas que la fuente no cubre devuelven null en vez de inventarse un reparto', () => {
    expect(distanciaDePrueba('run-maraton')).toBeNull()
    expect(distanciaDePrueba('cic-granfondo')).toBeNull()
    expect(distanciaDePrueba('no-existe')).toBeNull()
  })

  it('se puede saber cuáles se quedan fuera, para no fingir que están cubiertas', () => {
    const fuera = pruebasSinDistribucion()
    expect(fuera.length).toBeGreaterThan(0)
    expect(fuera).toContain('run-5k')
    expect(fuera).not.toContain('tri-media')
  })

  it('una prueba de carrera pura sí trae su ritmo de competición', () => {
    expect(ritmoDePrueba('run-10k')?.zona).toBe('AEI')
    expect(ritmoDePrueba('run-maraton')?.zona).toBe('AEM')
    expect(ritmoDePrueba('tri-larga')).toBeUndefined()
  })
})

describe('el reparto que sale al final', () => {
  it('cubre las nueve siglas sin repetir ninguna', () => {
    DISCIPLINAS.forEach(disc => {
      const siglas = repartoPorDistancia('olimpico', disc).flatMap(f => f.siglas)
      expect(new Set(siglas).size, disc).toBe(siglas.length)
      expect(siglas.sort()).toEqual([...SIGLAS].sort())
    })
  })

  it('por fase da lo mismo en estructura que por distancia', () => {
    FASES.forEach(f => DISCIPLINAS.forEach(disc => {
      const franjas = repartoPorFase(f, disc)
      expect(franjas.flatMap(x => x.siglas).sort()).toEqual([...SIGLAS].sort())
    }))
  })
})
