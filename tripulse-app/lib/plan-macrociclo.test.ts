import { describe, it, expect } from 'vitest'
import { planDeTemporada, semanasCubiertas } from './plan-macrociclo'
import { claseDeMeso } from './plan-mesociclo'

const LUNES = '2026-01-05'
const enSemanas = (n: number) => {
  const d = new Date(LUNES + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n * 7 - 1)   // el domingo de la semana n
  return d.toISOString().slice(0, 10)
}

describe('la temporada se dibuja hacia atrás', () => {
  /* B1-02 §Plantilla A-race (Olímpico o 70.3): taper 2, PE 8, PG 12 = 22. */
  it('con las 22 semanas de libro salen las tres fases enteras', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'olimpico' })
    expect(t.imposible).toBe(false)
    expect(t.semanas).toBe(22)
    expect(semanasCubiertas(t)).toBe(22)

    const porFase = (f: string) => t.bloques.filter(b => b.fase.startsWith(f)).reduce((a, b) => a + b.semanas, 0)
    expect(porFase('pg')).toBe(12)
    expect(porFase('pe')).toBe(8)
    expect(porFase('tapering')).toBe(2)
  })

  it('el Ironman lleva más base: es el tejido conectivo, no el capricho', () => {
    // Cada uno en SU horizonte de libro. A 30 semanas los dos habrían estirado
    // la base y el olímpico ya estaría topado, que es otra cosa distinta.
    const im = planDeTemporada({ desde: LUNES, objetivo: enSemanas(30), distancia: 'largo' })
    const ol = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'olimpico' })
    const base = (t: any) => t.bloques.filter((b: any) => b.fase.startsWith('pg')).reduce((a: number, b: any) => a + b.semanas, 0)
    expect(base(im)).toBe(18)
    expect(base(ol)).toBe(12)
  })

  it('los bloques van seguidos y acaban en la semana de la carrera', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'olimpico' })
    expect(t.bloques[0].lunes).toBe(LUNES)
    // Sin huecos: cada uno empieza donde acaba el anterior.
    t.bloques.forEach((b, i) => {
      if (!i) return
      const ant = t.bloques[i - 1]
      const finAnt = new Date(ant.lunes + 'T00:00:00Z')
      finAnt.setUTCDate(finAnt.getUTCDate() + ant.semanas * 7)
      expect(b.lunes, b.nombre).toBe(finAnt.toISOString().slice(0, 10))
    })
    // Y el último es el tapering.
    expect(t.bloques[t.bloques.length - 1].fase).toBe('tapering')
  })
})

describe('cuando no llega el tiempo', () => {
  /* LO QUE NO SE RECORTA. Recortar el tapering convierte toda la preparación
     anterior en una carrera con las piernas cargadas. */
  it('se recorta la base primero y el tapering el último', () => {
    const corto = planDeTemporada({ desde: LUNES, objetivo: enSemanas(14), distancia: 'olimpico' })
    expect(corto.imposible).toBe(false)
    expect(semanasCubiertas(corto)).toBe(14)

    const taper = corto.bloques.filter(b => b.fase === 'tapering').reduce((a, b) => a + b.semanas, 0)
    const pg = corto.bloques.filter(b => b.fase.startsWith('pg')).reduce((a, b) => a + b.semanas, 0)
    expect(taper).toBe(2)          // intacto
    expect(pg).toBeLessThan(12)    // la base es la que cede
    expect(corto.avisos.join(' ')).toMatch(/tapering el último/)
  })

  it('el tapering solo cede cuando ya no queda nada más que recortar', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(10), distancia: 'olimpico' })
    expect(semanasCubiertas(t)).toBe(10)
    expect(t.bloques.filter(b => b.fase === 'tapering').reduce((a, b) => a + b.semanas, 0)).toBe(1)
  })

  /* Por debajo del mínimo no se dibuja un plan malo: se dice que no da tiempo.
     Un plan de libro comprimido a la mitad no es un plan, es una lesión. */
  it('por debajo del mínimo no inventa un plan', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(4), distancia: 'largo' })
    expect(t.imposible).toBe(true)
    expect(t.bloques).toEqual([])
    expect(t.avisos.join(' ')).toMatch(/Hacen falta al menos/)
  })

  it('una carrera ya pasada no es un plan', () => {
    const t = planDeTemporada({ desde: '2026-06-01', objetivo: '2026-01-01', distancia: 'medio' })
    expect(t.imposible).toBe(true)
    expect(t.avisos.join(' ')).toMatch(/anterior a la fecha de inicio/)
  })
})

describe('cuando sobra tiempo', () => {
  /* Crece la BASE, no la calidad: la específica no se sostiene durante meses. */
  it('el tiempo de más va a la base, no a la parte específica', () => {
    const largo = planDeTemporada({ desde: LUNES, objetivo: enSemanas(30), distancia: 'olimpico' })
    const pg = largo.bloques.filter(b => b.fase.startsWith('pg')).reduce((a, b) => a + b.semanas, 0)
    const pe = largo.bloques.filter(b => b.fase.startsWith('pe')).reduce((a, b) => a + b.semanas, 0)
    expect(pg).toBeGreaterThan(12)
    expect(pe).toBe(8)
    expect(semanasCubiertas(largo)).toBe(30)
  })

  it('si sobra mucho, lo que no cabe en la base es transición al principio', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(45), distancia: 'olimpico' })
    expect(t.bloques[0].fase).toBe('transicion')
    expect(semanasCubiertas(t)).toBe(45)
    expect(t.avisos.join(' ')).toMatch(/transición al principio/)
  })
})

describe('los bloques hablan el idioma del modelo elegido', () => {
  it('en ATR son Acumulación / Transmutación / Realización', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'olimpico', modelo: 'ATR' })
    expect(t.bloques.find(b => b.clase === 'acumulacion')!.tipo).toBe('Acumulación')
    expect(t.bloques.find(b => b.clase === 'competicion')!.tipo).toBe('Realización')
  })

  it('en Tradicional son General / Específica / Taper', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'olimpico', modelo: 'Tradicional' })
    expect(t.bloques.find(b => b.clase === 'acumulacion')!.tipo).toBe('General')
    expect(t.bloques.find(b => b.clase === 'competicion')!.tipo).toBe('Taper')
  })

  /* En la inversa se empieza por la intensidad, así que coger `tipos[0]` daría
     «Intensidad» como bloque de base: justo lo contrario de lo que es. */
  it('en la Inversa el bloque de base no es el primero de su lista', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'olimpico', modelo: 'Inversa' })
    expect(t.bloques.find(b => b.clase === 'acumulacion')!.tipo).toBe('Desarrollo')
  })

  it('y el tipo de cada bloque vuelve a su clase', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'medio' })
    t.bloques.forEach(b => expect(claseDeMeso(b.tipo), b.nombre).toBe(b.clase))
  })
})

describe('cómo se parten las fases en mesociclos', () => {
  it('la base va en bloques de unas 4 semanas y la específica de unas 3', () => {
    const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(22), distancia: 'olimpico' })
    const pg = t.bloques.filter(b => b.fase.startsWith('pg'))
    const pe = t.bloques.filter(b => b.fase.startsWith('pe'))
    expect(pg).toHaveLength(3)
    pg.forEach(b => expect(b.semanas).toBe(4))
    expect(pe.length).toBeGreaterThan(1)
  })

  /* Un mesociclo de una semana no tiene dónde poner su descarga, así que el
     resto se reparte entre los bloques en vez de quedarse suelto. */
  it('no deja bloques sueltos de una semana', () => {
    for (const n of [15, 17, 19, 23, 25, 27]) {
      const t = planDeTemporada({ desde: LUNES, objetivo: enSemanas(n), distancia: 'olimpico' })
      const sueltos = t.bloques.filter(b => b.semanas === 1 && b.fase !== 'tapering' && b.fase !== 'transicion')
      expect(sueltos, 'n=' + n).toEqual([])
      expect(semanasCubiertas(t), 'n=' + n).toBe(n)
    }
  })
})
