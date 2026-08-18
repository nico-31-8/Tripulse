import { describe, it, expect } from 'vitest'
import {
  claseDeMeso, cargasDe, semanasDelMesociclo, entradaDeSemana,
  semanasHasta, pisaElTapering, DIAS_TAPER, cargasDeUA,
} from './plan-mesociclo'

describe('a qué familia pertenece cada mesociclo', () => {
  /* Los cuatro modelos llaman distinto a lo mismo: la «Acumulación» del ATR y la
     «General» del Tradicional son el mismo bloque. */
  it('reconoce los tipos de los cuatro modelos', () => {
    expect(claseDeMeso('Acumulación')).toBe('acumulacion')
    expect(claseDeMeso('General')).toBe('acumulacion')
    expect(claseDeMeso('Carga alta')).toBe('acumulacion')
    expect(claseDeMeso('Transmutación')).toBe('transmutacion')
    expect(claseDeMeso('Específica')).toBe('transmutacion')
    expect(claseDeMeso('Realización')).toBe('competicion')
    expect(claseDeMeso('Taper')).toBe('competicion')
    expect(claseDeMeso('Recuperación')).toBe('descarga')
  })

  it('en la inversa, intensidad y desarrollo van del revés', () => {
    // Empieza por la intensidad y construye volumen hacia la prueba.
    expect(claseDeMeso('Intensidad')).toBe('transmutacion')
    expect(claseDeMeso('Desarrollo')).toBe('acumulacion')
  })

  it('con o sin tildes, y un tipo raro cae en acumulación', () => {
    expect(claseDeMeso('acumulacion')).toBe('acumulacion')
    expect(claseDeMeso('ACUMULACIÓN')).toBe('acumulacion')
    // Ante la duda, un bloque de carga normal: suponer que está afinando cuando
    // lo más probable es que esté construyendo sería peor.
    expect(claseDeMeso('lo que sea')).toBe('acumulacion')
    expect(claseDeMeso(null)).toBe('acumulacion')
  })
})

describe('la carga relativa de cada semana', () => {
  it('la acumulación de 4 semanas es el 3:1 de B1-03', () => {
    expect(cargasDe('acumulacion', 4, 'medio')).toEqual([0.90, 1.00, 1.075, 0.575])
  })

  it('la transmutación de 3 es el 2:1', () => {
    expect(cargasDe('transmutacion', 3, 'medio')).toEqual([0.85, 1.00, 0.55])
  })

  /* LA REGLA QUE NO SE NEGOCIA. Quitar la descarga de un bloque de cuatro no da
     un bloque de tres: da tres semanas de fatiga sin sitio donde asimilarla. */
  it('la descarga es siempre la última y nunca es la que se cae', () => {
    for (const n of [2, 3, 4, 5, 6, 8]) {
      const c = cargasDe('acumulacion', n, 'medio')
      expect(c, 'n=' + n).toHaveLength(n)
      expect(c[c.length - 1], 'n=' + n).toBeLessThan(0.7)
      expect(Math.max(...c.slice(0, -1)), 'n=' + n).toBeGreaterThan(0.9)
    }
  })

  it('acortando se conservan las semanas más duras, no las primeras', () => {
    // De [0.90, 1.00, 1.075] + descarga, con 3 semanas quedan las dos de arriba.
    expect(cargasDe('acumulacion', 3, 'medio')).toEqual([1.00, 1.075, 0.575])
  })

  it('alargando, la subida se reparte en vez de repetir la semana pico', () => {
    const c = cargasDe('acumulacion', 6, 'medio')
    const subida = c.slice(0, -1)
    expect(subida).toHaveLength(5)
    expect(subida[0]).toBe(0.90)
    expect(subida[4]).toBe(1.075)
    // Creciente y sin dos iguales seguidas.
    subida.forEach((v, i) => { if (i) expect(v).toBeGreaterThan(subida[i - 1]) })
  })

  /* Un bloque de una semana no puede ser solo descarga: sin nada que asimilar,
     descargar no significa nada. */
  it('un bloque de una semana es una semana plena', () => {
    expect(cargasDe('acumulacion', 1, 'medio')).toEqual([1.00])
    expect(cargasDe('transmutacion', 1, 'medio')).toEqual([1.00])
  })

  it('el tapering depende de la distancia y va bajando', () => {
    const sprint = cargasDe('competicion', 2, 'sprint')
    const largo = cargasDe('competicion', 2, 'largo')
    expect(sprint[0]).toBeGreaterThan(largo[0])   // el Ironman recorta más
    expect(sprint[1]).toBeLessThan(sprint[0])
  })

  it('la descarga suelta es un 55 % en todas sus semanas', () => {
    expect(cargasDe('descarga', 2, 'medio')).toEqual([0.55, 0.55])
  })
})

describe('las semanas de un mesociclo', () => {
  const meso = semanasDelMesociclo({
    tipo: 'Acumulación', semanas: 4, horasReferencia: 10, distancia: 'medio', lunes: '2026-08-17',
  })

  it('escala las horas y las redondea a media hora', () => {
    // 10 h de referencia × [0.90, 1.00, 1.075, 0.575] al escalón de media hora.
    expect(meso.map(s => s.horasSemana)).toEqual([9, 10, 11, 6])
  })

  it('pone las fechas de cada lunes', () => {
    expect(meso.map(s => s.lunes)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07'])
  })

  it('etiqueta lo que es cada semana', () => {
    expect(meso.map(s => s.etiqueta)).toEqual([
      'Entrada progresiva', 'Carga plena', 'Sobrecarga controlada', 'Descarga',
    ])
    expect(meso.filter(s => s.esDescarga)).toHaveLength(1)
  })

  it('todas comparten la fase, que sale de la clase del bloque', () => {
    expect(new Set(meso.map(s => s.fase)).size).toBe(1)
    expect(meso[0].fase).toBe('pg-avanzada')
    expect(semanasDelMesociclo({ tipo: 'Taper', semanas: 2, horasReferencia: 10, distancia: 'medio' })[0].fase).toBe('tapering')
  })

  /* El puente con el planificador que ya existe: esta capa no genera semanas,
     produce la entrada que la otra ya sabe consumir. */
  it('produce la entrada del planificador de semanas', () => {
    const e = entradaDeSemana(meso[2], { diasSemana: 6, distancia: 'medio', nivel: 'intermedio' })
    expect(e.horasSemana).toBe(11)
    expect(e.fase).toBe('pg-avanzada')
    expect(e.diasSemana).toBe(6)
  })
})

describe('cuántas semanas quedan', () => {
  it('cuenta semanas completas, con signo', () => {
    expect(semanasHasta('2026-08-17', '2026-10-05')).toBe(7)
    expect(semanasHasta('2026-08-17', '2026-08-23')).toBe(0)
    expect(semanasHasta('2026-10-05', '2026-08-17')).toBeLessThan(0)
  })

  /* Meter un bloque de carga dentro del tapering es el error que más caro sale:
     se llega a la carrera con fatiga que ya no hay tiempo de soltar. */
  it('avisa si el bloque acaba dentro del tapering de la carrera', () => {
    // 70.3: 16 días de taper. Un bloque que acabe 10 días antes lo pisa.
    expect(pisaElTapering('2026-09-25', '2026-10-05', 'medio')).toBe(true)
    // Acabando 30 días antes, no.
    expect(pisaElTapering('2026-09-05', '2026-10-05', 'medio')).toBe(false)
  })

  it('una carrera ya pasada no cuenta como tapering pisado', () => {
    expect(pisaElTapering('2026-10-10', '2026-10-05', 'medio')).toBe(false)
  })

  it('el sprint afina menos días que el Ironman', () => {
    expect(DIAS_TAPER.sprint).toBeLessThan(DIAS_TAPER.largo)
  })
})

describe('cuando el entrenador ya dibujó la UA, manda él', () => {
  /* La pieza que evita dos verdades sobre el mismo bloque: el patrón dice «la
     tercera al 107 %», el lienzo dice «la tercera, 350 UA». Manda el lienzo. */
  it('la forma sale de la UA dibujada, normalizada por el pico', () => {
    expect(cargasDeUA([275, 350, 300, 200])).toEqual([0.786, 1, 0.857, 0.571])
  })

  it('con menos de dos semanas con UA no hay forma que deducir', () => {
    // Normalizar un número por sí mismo daría un bloque plano al 100 %.
    expect(cargasDeUA([350])).toBeNull()
    expect(cargasDeUA([null, 350, null])).toBeNull()
    expect(cargasDeUA([])).toBeNull()
  })

  it('el mesociclo usa la UA por encima del patrón', () => {
    const conUA = semanasDelMesociclo({
      tipo: 'Acumulación', semanas: 4, horasReferencia: 10, distancia: 'medio',
      lunes: '2026-08-17', uaPorSemana: [275, 350, 300, 200],
    })
    // 10 h × la forma dibujada, no × [0.90, 1.00, 1.075, 0.575]
    expect(conUA.map(s => s.horasSemana)).toEqual([8, 10, 8.5, 5.5])
  })

  it('sin UA sigue el patrón de B1-03', () => {
    const sinUA = semanasDelMesociclo({
      tipo: 'Acumulación', semanas: 4, horasReferencia: 10, distancia: 'medio', lunes: '2026-08-17',
    })
    expect(sinUA.map(s => s.horasSemana)).toEqual([9, 10, 11, 6])
  })

  /* Con la forma dibujada, la descarga es la semana que DE VERDAD baja: si el
     entrenador puso el valle en la segunda, es la segunda. */
  it('la descarga es donde el entrenador la puso, no donde decía el patrón', () => {
    const s = semanasDelMesociclo({
      tipo: 'Acumulación', semanas: 4, horasReferencia: 10, distancia: 'medio',
      uaPorSemana: [350, 180, 340, 330],
    })
    expect(s.map(x => x.esDescarga)).toEqual([false, true, false, false])
  })
})
