import { describe, it, expect } from 'vitest'
import {
  formaDeSemana, topeCalidad, bloqueDeTexto, sesionesPrescritasFuerza, BLOQUES,
  type EntradaSemana, type NivelAtleta, type Bloque,
} from './plan-semana'
import { ZONAS_RESISTENCIA } from './zonas'
import type { DistanciaTri, FaseMacro } from './distribucion-zonas'

const DISTANCIAS: DistanciaTri[] = ['sprint', 'olimpico', 'medio', 'largo']
const FASES: FaseMacro[] = ['transicion', 'pg-inicial', 'pg-avanzada', 'pe-inicial', 'pe-avanzada', 'tapering']
const NIVELES: NivelAtleta[] = ['principiante', 'intermedio', 'avanzado', 'elite']

/* Rangos de B1-04 Principio 5. Se repiten aquí a proposito: es el test el que
   tiene que sostener la tabla, no al reves. */
const RANGOS: Record<DistanciaTri, Record<Bloque, [number, number]>> = {
  sprint:   { Natacion: [20, 25], Ciclismo: [40, 45], Carrera: [30, 35], Fuerza: [0, 5] },
  olimpico: { Natacion: [18, 22], Ciclismo: [42, 48], Carrera: [28, 34], Fuerza: [0, 5] },
  medio:    { Natacion: [15, 20], Ciclismo: [45, 52], Carrera: [28, 33], Fuerza: [0, 5] },
  largo:    { Natacion: [12, 18], Ciclismo: [50, 58], Carrera: [25, 32], Fuerza: [0, 3] },
}

const base = (p: Partial<EntradaSemana> = {}): EntradaSemana => ({
  horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio', ...p,
})

const pctDe = (f: ReturnType<typeof formaDeSemana>, b: Bloque) =>
  f.bloques.find(x => x.bloque === b)!.pct

describe('el reparto entre disciplinas respeta B1-04', () => {
  it('cada disciplina cae dentro de su rango, en las cuatro distancias', () => {
    DISTANCIAS.forEach(d => {
      const f = formaDeSemana(base({ distancia: d, fase: 'pe-inicial' }))
      BLOQUES.forEach(b => {
        const [lo, hi] = RANGOS[d][b]
        expect(pctDe(f, b), `${d}/${b} = ${pctDe(f, b)} %`).toBeGreaterThanOrEqual(lo - 0.05)
        expect(pctDe(f, b), `${d}/${b} = ${pctDe(f, b)} %`).toBeLessThanOrEqual(hi + 0.05)
      })
    })
  })

  it('el reparto suma 100 %', () => {
    DISTANCIAS.forEach(d => FASES.forEach(fase => {
      const f = formaDeSemana(base({ distancia: d, fase }))
      const total = f.bloques.reduce((a, b) => a + b.pct, 0)
      expect(total, `${d}/${fase} suma ${total}`).toBeGreaterThan(99)
      expect(total, `${d}/${fase} suma ${total}`).toBeLessThan(101)
    }))
  })

  /* La respuesta a «¿los tres deportes por igual?»: no, y no de lejos. */
  it('la bici se lleva siempre la mayor parte, y crece segun alarga la prueba', () => {
    DISTANCIAS.forEach(d => {
      const f = formaDeSemana(base({ distancia: d }))
      const bici = pctDe(f, 'Ciclismo')
      expect(bici, d).toBeGreaterThan(pctDe(f, 'Natacion'))
      expect(bici, d).toBeGreaterThan(pctDe(f, 'Carrera'))
    })
    const bici = (d: DistanciaTri) => pctDe(formaDeSemana(base({ distancia: d })), 'Ciclismo')
    expect(bici('largo')).toBeGreaterThan(bici('medio'))
    expect(bici('medio')).toBeGreaterThan(bici('olimpico'))
    expect(bici('olimpico')).toBeGreaterThan(bici('sprint'))
  })

  it('la natacion pesa menos cuanto mas larga es la prueba', () => {
    const nat = (d: DistanciaTri) => pctDe(formaDeSemana(base({ distancia: d })), 'Natacion')
    expect(nat('sprint')).toBeGreaterThan(nat('olimpico'))
    expect(nat('olimpico')).toBeGreaterThan(nat('medio'))
    expect(nat('medio')).toBeGreaterThan(nat('largo'))
  })
})

describe('la disciplina floja sesga el reparto, pero no lo rompe', () => {
  it('sube a la floja hasta su maximo y baja a las otras', () => {
    const normal = formaDeSemana(base())
    const flojo = formaDeSemana(base({ disciplinaDebil: 'natación' }))
    expect(pctDe(flojo, 'Natacion')).toBeGreaterThan(pctDe(normal, 'Natacion'))
    expect(pctDe(flojo, 'Ciclismo')).toBeLessThanOrEqual(pctDe(normal, 'Ciclismo'))
  })

  /* La barandilla: por muy floja que sea una disciplina, el rango es el rango.
     Un plan que vuelca la semana entera en el punto debil deja de preparar la
     prueba que se va a competir. */
  it('NUNCA se sale del rango, por mucho que se insista', () => {
    DISTANCIAS.forEach(d => ['natación', 'ciclismo', 'carrera'].forEach(debil => {
      const f = formaDeSemana(base({ distancia: d, disciplinaDebil: debil }))
      BLOQUES.forEach(b => {
        const [lo, hi] = RANGOS[d][b]
        expect(pctDe(f, b), `${d} · debil ${debil} · ${b}`).toBeGreaterThanOrEqual(lo - 0.05)
        expect(pctDe(f, b), `${d} · debil ${debil} · ${b}`).toBeLessThanOrEqual(hi + 0.05)
      })
      const total = f.bloques.reduce((a, x) => a + x.pct, 0)
      expect(total).toBeGreaterThan(99)
      expect(total).toBeLessThan(101)
    }))
  })

  it('lee la disciplina como la escribe la anamnesis, con tildes o sin ellas', () => {
    expect(bloqueDeTexto('natación')).toBe('Natacion')
    expect(bloqueDeTexto('NATACION')).toBe('Natacion')
    expect(bloqueDeTexto(' bici ')).toBe('Ciclismo')
    expect(bloqueDeTexto('correr')).toBe('Carrera')
    expect(bloqueDeTexto('')).toBeNull()
    expect(bloqueDeTexto(null)).toBeNull()
    expect(bloqueDeTexto('remo')).toBeNull()
  })
})

describe('las sesiones', () => {
  it('ninguna disciplina con volumen baja del minimo de 2 semanales', () => {
    // B1-04 Principio 5. Por debajo de dos, una disciplina no se sostiene.
    ;[6, 8, 10, 14, 20].forEach(h => {
      const f = formaDeSemana(base({ horasSemana: h }))
      f.bloques.filter(b => b.bloque !== 'Fuerza' && b.minutos > 0).forEach(b => {
        expect(b.sesiones, `${h} h · ${b.etiqueta}`).toBeGreaterThanOrEqual(2)
      })
    })
  })

  it('con muchas horas no se dispara el numero de sesiones', () => {
    const f = formaDeSemana(base({ horasSemana: 25, diasSemana: 7 }))
    f.bloques.filter(b => b.bloque !== 'Fuerza').forEach(b => {
      expect(b.sesiones, b.etiqueta).toBeLessThanOrEqual(5)
    })
  })

  /* Dividir el volumen por la duracion tipo daba 13 sesiones para 16 h en siete
     dias: seis dias con doble. Un entrenador con ese volumen hace unas diez, mas
     largas — y en una prueba larga eso ademas es lo especifico. */
  it('con mucho volumen y pocos dias hace menos sesiones y mas largas', () => {
    const f = formaDeSemana(base({ horasSemana: 16, diasSemana: 7, distancia: 'largo' }))
    expect(f.sesionesTotales).toBeLessThanOrEqual(Math.floor(7 * 1.5))
    expect(f.avisos.join(' ')).toMatch(/mas largas|más largas/i)
    // El volumen NO cambia: solo se reparte en menos trozos.
    const bici = f.bloques.find(b => b.bloque === 'Ciclismo')!
    expect(bici.minutosPorSesion * bici.sesiones).toBeCloseTo(bici.minutos, -1)
  })

  it('el recorte nunca baja del minimo de 2 sesiones por disciplina', () => {
    ;[[20, 3], [16, 4], [25, 5]].forEach(([h, d]) => {
      const f = formaDeSemana(base({ horasSemana: h, diasSemana: d }))
      f.bloques.filter(b => b.bloque !== 'Fuerza' && b.minutos > 0).forEach(b => {
        expect(b.sesiones, `${h} h / ${d} dias · ${b.etiqueta}`).toBeGreaterThanOrEqual(2)
      })
    })
  })

  it('cuando ni recortando caben, lo dice y sugiere doblar natacion', () => {
    const f = formaDeSemana(base({ horasSemana: 12, diasSemana: 3 }))
    expect(f.avisos.join(' ')).toMatch(/doblar/i)
    expect(f.avisos.join(' ')).toMatch(/nataci/i)   // la que dobla sin coste
  })
})

describe('la calidad la limita el duro-facil, no el nivel', () => {
  /* B1-04 Principio 1: una sesion dura pide 36-48 h antes de que otra produzca
     adaptacion. Es la barandilla que mas se salta un plan generado, porque sobre
     el papel meter calidad siempre parece que suma. */
  it('el tope es uno de cada dos dias', () => {
    expect(topeCalidad(7)).toBe(4)
    expect(topeCalidad(6)).toBe(3)
    expect(topeCalidad(4)).toBe(2)
    expect(topeCalidad(2)).toBe(1)
    expect(topeCalidad(0)).toBe(1)
  })

  it('un elite con tres dias no mete seis sesiones de calidad', () => {
    const f = formaDeSemana(base({ nivel: 'elite', diasSemana: 3, horasSemana: 12 }))
    expect(f.sesionesCalidad).toBeLessThanOrEqual(topeCalidad(3))
    expect(f.avisos.join(' ')).toMatch(/duro-fácil|duro-facil/i)
  })

  it('nunca pasa del tope, en ninguna combinacion', () => {
    NIVELES.forEach(nivel => [1, 2, 3, 4, 5, 6, 7].forEach(dias => {
      const f = formaDeSemana(base({ nivel, diasSemana: dias, horasSemana: 12 }))
      expect(f.sesionesCalidad, `${nivel} con ${dias} dias`).toBeLessThanOrEqual(topeCalidad(dias))
      expect(f.sesionesCalidad, `${nivel} con ${dias} dias`).toBeLessThanOrEqual(f.sesionesTotales)
    }))
  })

  it('arranca por el extremo bajo del rango del nivel', () => {
    // Subir la calidad es decision del entrenador; el generador se equivoca solo
    // hacia el lado barato.
    const f = formaDeSemana(base({ nivel: 'avanzado', diasSemana: 7 }))
    expect(f.sesionesCalidad).toBe(3)   // avanzado es 3-4
  })
})

describe('la fuerza sigue a la fase', () => {
  it('en transicion no hay fuerza, y su volumen vuelve a los otros', () => {
    const f = formaDeSemana(base({ fase: 'transicion' }))
    expect(f.bloques.find(b => b.bloque === 'Fuerza')!.minutos).toBe(0)
    expect(f.bloques.find(b => b.bloque === 'Fuerza')!.sesiones).toBe(0)
    const total = f.bloques.reduce((a, b) => a + b.pct, 0)
    expect(total).toBeGreaterThan(99)
  })

  it('en las fases con fuerza si aparece, y sin pasarse', () => {
    ;(['pg-inicial', 'pg-avanzada', 'pe-inicial', 'pe-avanzada', 'tapering'] as FaseMacro[]).forEach(fase => {
      const f = formaDeSemana(base({ fase }))
      const fu = f.bloques.find(b => b.bloque === 'Fuerza')!
      expect(fu.sesiones, fase).toBeGreaterThanOrEqual(1)
      expect(fu.sesiones, fase).toBeLessThanOrEqual(3)
    })
  })

  /* B1-04 da la fuerza como «0–5 %», un rango que incluye el cero. Si se coge el
     punto medio, un atleta de 10 h se queda en 15 min de fuerza a la semana: ni
     una sesion. Se coge el maximo porque B3-01 documenta que de ese bloque salen
     las mejoras de economia, o sea que en las fases que la llevan no es opcional. */
  it('coge el maximo de su rango, no el punto medio', () => {
    const f = formaDeSemana(base({ distancia: 'medio' }))
    expect(pctDe(f, 'Fuerza')).toBe(5)      // el rango de 70.3 es 0-5 %
    const largo = formaDeSemana(base({ distancia: 'largo' }))
    expect(pctDe(largo, 'Fuerza')).toBe(3)  // en Ironman baja a 0-3 %
  })

  /* El fallo que destapo el test: 15 minutos de gimnasio no son una sesion. */
  it('con poco volumen no prescribe una sesion de fuerza ridicula: dice que no cabe', () => {
    const f = formaDeSemana(base({ horasSemana: 5, fase: 'pg-avanzada' }))
    const fu = f.bloques.find(b => b.bloque === 'Fuerza')!
    expect(fu.sesiones).toBe(0)
    expect(fu.minutos).toBe(0)
    expect(f.avisos.join(' ')).toMatch(/no llega ni para la sesión más corta/i)
  })

  it('avisa cuando el techo de volumen deja menos fuerza de la que pide B3-01', () => {
    // La adaptacion anatomica son 2-3 sesiones y el 5 % de una semana normal solo
    // da para una. Las dos fuentes chocan y se dice, en vez de elegir en silencio.
    const f = formaDeSemana(base({ horasSemana: 10, fase: 'pg-inicial' }))
    const fu = f.bloques.find(b => b.bloque === 'Fuerza')!
    expect(fu.sesiones).toBe(1)
    expect(f.avisos.join(' ')).toMatch(/B3-01 pide/i)
  })

  it('lee cuantas sesiones pide una plantilla de fuerza aunque venga en texto', () => {
    expect(sesionesPrescritasFuerza('2–3')).toBe(2)
    expect(sesionesPrescritasFuerza('1–2')).toBe(1)
    expect(sesionesPrescritasFuerza('2 — no más: el volumen de resistencia es prioritario')).toBe(2)
    expect(sesionesPrescritasFuerza('1')).toBe(1)
    expect(sesionesPrescritasFuerza(null)).toBe(0)
  })
})

describe('el presupuesto de zonas', () => {
  it('cubre las nueve siglas en las tres disciplinas', () => {
    const f = formaDeSemana(base())
    const siglas = ZONAS_RESISTENCIA.map(z => z.sigla).sort()
    ;(['Natacion', 'Ciclismo', 'Carrera'] as const).forEach(d => {
      expect(f.zonas[d].flatMap(x => x.siglas).sort(), d).toEqual(siglas)
    })
  })

  it('la fase mueve la intensidad: en tapering hay mas calidad que en pretemporada', () => {
    const alta = (fase: FaseMacro) => {
      const f = formaDeSemana(base({ fase }))
      return f.zonas.Carrera.filter(x => x.siglas.some(s => ['PAE', 'CLA', 'PLA'].includes(s)))
        .reduce((a, x) => a + x.max, 0)
    }
    expect(alta('tapering')).toBeGreaterThan(alta('pg-inicial'))
  })

  it('trae el modelo de distribucion de intensidad de la fase', () => {
    expect(formaDeSemana(base({ fase: 'pg-inicial' })).tid).toBe('Polarizado')
    expect(formaDeSemana(base({ fase: 'pe-avanzada' })).tid).toBe('Piramidal')
  })
})

describe('cuando los datos no dan', () => {
  it('sin volumen declarado no inventa una semana, lo dice', () => {
    const f = formaDeSemana(base({ horasSemana: 0 }))
    expect(f.minutosTotales).toBe(0)
    expect(f.avisos.join(' ')).toMatch(/volumen semanal/i)
    expect(f.bloques.every(b => b.minutos === 0)).toBe(true)
  })

  it('sin dias declarados avisa en vez de asumir una semana completa', () => {
    const f = formaDeSemana(base({ diasSemana: 0 }))
    expect(f.avisos.join(' ')).toMatch(/cuántos días|cuantos dias/i)
  })

  it('con uno o dos dias avisa de que eso no es repartir, es priorizar', () => {
    const f = formaDeSemana(base({ diasSemana: 2 }))
    expect(f.avisos.join(' ')).toMatch(/prioriza/i)
  })

  it('una semana normal entra sin forzar ninguna barandilla', () => {
    const f = formaDeSemana(base({ horasSemana: 10, diasSemana: 6, nivel: 'intermedio' }))
    expect(f.avisos).toEqual([])
  })

  it('el resumen se puede leer sin volver a calcular nada', () => {
    const f = formaDeSemana(base())
    expect(f.resumen).toMatch(/Media \(70\.3\)/)
    expect(f.resumen).toMatch(/Ciclismo/)
    expect(f.resumen).toMatch(/calidad/)
  })
})
