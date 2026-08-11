import { describe, it, expect } from 'vitest'
import {
  PLANTILLAS_FUERZA, plantillaFuerzaPorId, fuerzaDeFase, seriesTotales,
  DIAS_ULTIMA_FUERZA, type PlantillaFuerza,
} from './plantillas-fuerza'
import { DISTRIBUCION_POR_FASE, type FaseMacro } from './distribucion-zonas'
import { ZONAS_FUERZA } from './zonas'

/* Las zonas de fuerza declaran sus rangos como texto ('6–12 rep', '3–5 min').
   Para poder comprobarlos hay que leerlos. Ojo al guion: es raya (–), no menos. */
function rango(txt: string | null | undefined): [number, number] | null {
  const m = txt?.match(/(\d+)\s*[–-]\s*(\d+)/)
  return m ? [Number(m[1]), Number(m[2])] : null
}
function rangoSegundos(txt: string | null | undefined): [number, number] | null {
  const r = rango(txt)
  if (!r) return null
  const mult = /min/.test(txt || '') ? 60 : 1
  return [r[0] * mult, r[1] * mult]
}

/** Todo lo que en una plantilla se sale de lo que orienta su zona. */
function divergencias(p: PlantillaFuerza): string[] {
  const fuera: string[] = []
  p.bloques.forEach(b => {
    const z = ZONAS_FUERZA.find(x => x.sigla === b.zona)
    if (!z) return
    const s = rango(z.series)
    if (s && (b.series < s[0] || b.series > s[1])) {
      fuera.push(`${b.ejercicio}: ${b.series} series, ${z.sigla} orienta ${z.series}`)
    }
    const r = rango(z.repTiempo)
    if (r && b.repeticiones != null && (b.repeticiones < r[0] || b.repeticiones > r[1])) {
      fuera.push(`${b.ejercicio}: ${b.repeticiones} rep, ${z.sigla} orienta ${z.repTiempo}`)
    }
    const d = rangoSegundos(z.descanso)
    if (d && (b.descansoSeg < d[0] || b.descansoSeg > d[1])) {
      fuera.push(`${b.ejercicio}: ${b.descansoSeg}″ de descanso, ${z.sigla} orienta ${z.descanso}`)
    }
  })
  return fuera
}

describe('el catálogo de fuerza está bien formado', () => {
  it('no hay ids repetidos', () => {
    const ids = PLANTILLAS_FUERZA.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('toda zona existe en ZONAS_FUERZA', () => {
    const siglas = ZONAS_FUERZA.map(z => z.sigla)
    PLANTILLAS_FUERZA.forEach(p => p.bloques.forEach(b => {
      expect(siglas, `${p.id}: zona '${b.zona}'`).toContain(b.zona)
    }))
  })

  it('toda fase existe en la tabla del macrociclo', () => {
    const fases = Object.keys(DISTRIBUCION_POR_FASE)
    PLANTILLAS_FUERZA.forEach(p => p.fases.forEach(f => {
      expect(fases, `${p.id}: fase '${f}'`).toContain(f)
    }))
  })

  /* Mismo fallo que en resistencia: un bloque sin repeticiones ni segundos se
     crea igual y no vale nada. En fuerza además es más fácil de colar, porque
     hay ejercicios legítimamente isométricos. */
  it('ningún bloque se queda sin dosis', () => {
    PLANTILLAS_FUERZA.forEach(p => p.bloques.forEach(b => {
      expect(!!b.repeticiones || !!b.segundos, `${p.id} · ${b.ejercicio}`).toBe(true)
      expect(b.series, `${p.id} · ${b.ejercicio}`).toBeGreaterThan(0)
      expect(b.descansoSeg, `${p.id} · ${b.ejercicio}`).toBeGreaterThan(0)
    }))
  })

  it('cada plantilla cita su fuente y dice para qué sirve', () => {
    PLANTILLAS_FUERZA.forEach(p => {
      expect(p.fuente, `${p.id}`).toBeTruthy()
      expect(p.objetivo, `${p.id}`).toBeTruthy()
      expect(p.sesionesSemana, `${p.id}`).toBeTruthy()
    })
  })

  it('lo marcado como propuesta explica qué parte es nuestra', () => {
    PLANTILLAS_FUERZA.forEach(p => {
      if (p.origen === 'propuesta') expect(p.aviso, `${p.id}`).toBeTruthy()
    })
  })
})

describe('la dosificación respeta las zonas de la app', () => {
  /* Esta es la regla que de verdad importa, y es la misma que gobierna el
     catálogo de resistencia: se puede diverger de lo que orienta la zona, pero
     entonces hay que decirlo. Lo que no vale es diverger en silencio. */
  it('toda divergencia respecto a su zona está documentada en el aviso', () => {
    PLANTILLAS_FUERZA.forEach(p => {
      const fuera = divergencias(p)
      if (fuera.length) {
        expect(p.aviso, `${p.id} se sale de su zona y no lo explica:\n  ${fuera.join('\n  ')}`).toBeTruthy()
      }
    })
  })

  it('las repeticiones y los descansos encajan sin excepción', () => {
    // Series sí puede divergir (el tapering baja a 2 a propósito). Repeticiones
    // y descanso no: son los que definen la cualidad que se entrena.
    PLANTILLAS_FUERZA.forEach(p => p.bloques.forEach(b => {
      const z = ZONAS_FUERZA.find(x => x.sigla === b.zona)!
      const r = rango(z.repTiempo)
      if (r && b.repeticiones != null) {
        expect(b.repeticiones, `${p.id} · ${b.ejercicio} · rep`).toBeGreaterThanOrEqual(r[0])
        expect(b.repeticiones, `${p.id} · ${b.ejercicio} · rep`).toBeLessThanOrEqual(r[1])
      }
      const d = rangoSegundos(z.descanso)
      if (d) {
        expect(b.descansoSeg, `${p.id} · ${b.ejercicio} · descanso`).toBeGreaterThanOrEqual(d[0])
        expect(b.descansoSeg, `${p.id} · ${b.ejercicio} · descanso`).toBeLessThanOrEqual(d[1])
      }
    }))
  })

  it('la única divergencia viva es la del tapering, y es deliberada', () => {
    const conDivergencia = PLANTILLAS_FUERZA.filter(p => divergencias(p).length > 0).map(p => p.id)
    expect(conDivergencia).toEqual(['fue-mantenimiento'])
  })
})

describe('la fuerza sigue la secuencia de la temporada', () => {
  /* B3-01 §2.2: adaptación anatómica → fuerza máxima → potencia → resistencia
     de fuerza. Saltarse la fuerza máxima hace que todo lo posterior rinda
     mucho menos, así que el orden no es decorativo. */
  it('cada fase del macro tiene su trabajo de fuerza, en el orden correcto', () => {
    const esperado: [FaseMacro, string][] = [
      ['pg-inicial', 'fue-aa'],
      ['pg-avanzada', 'fue-fm'],
      ['pe-inicial', 'fue-potencia'],
      ['pe-avanzada', 'fue-resistencia'],
      ['tapering', 'fue-mantenimiento'],
    ]
    esperado.forEach(([fase, id]) => {
      expect(fuerzaDeFase(fase).map(p => p.id), `fase ${fase}`).toContain(id)
    })
  })

  it('en transición no toca fuerza', () => {
    expect(fuerzaDeFase('transicion')).toEqual([])
  })

  it('el volumen de fuerza baja según se acerca la competición', () => {
    const s = (id: string) => seriesTotales(plantillaFuerzaPorId(id)!)
    expect(s('fue-aa')).toBeGreaterThan(s('fue-resistencia'))
    expect(s('fue-resistencia')).toBeGreaterThan(s('fue-mantenimiento'))
  })

  it('la carga sube y las repeticiones bajan de adaptación a fuerza máxima', () => {
    const aa = plantillaFuerzaPorId('fue-aa')!
    const fm = plantillaFuerzaPorId('fue-fm')!
    const repsMedias = (p: PlantillaFuerza) => {
      const con = p.bloques.filter(b => b.repeticiones != null)
      return con.reduce((a, b) => a + b.repeticiones!, 0) / con.length
    }
    expect(repsMedias(aa)).toBeGreaterThan(repsMedias(fm) * 2)
  })

  it('la última sesión de fuerza va 10–14 días antes de la competición A', () => {
    // B3-01 §3.4. A partir de ahí, solo core y movilidad.
    expect(DIAS_ULTIMA_FUERZA).toEqual({ min: 10, max: 14 })
  })
})
