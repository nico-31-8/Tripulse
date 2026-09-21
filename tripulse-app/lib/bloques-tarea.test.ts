// ============================================================
// Una tarea en bloques: 3 × (2 × 400)
// ============================================================
//
// Dos cosas se comprueban aquí, y la segunda importa tanto como la primera:
//
//   1. Que 3 × (2 × 400) cuenta como seis 400 —2.400 m— en todos los sitios
//      que suman: volumen, duración, total de la ficha, hoja de grupo.
//   2. Que una tarea SIN bloques sale exactamente igual que antes. Esto se ha
//      metido en el corazón del cálculo de la duración y del volumen, y las
//      450 tareas que ya existen no pueden moverse ni un segundo.

import { describe, it, expect, vi } from 'vitest'

/* `plantillas-propias` arrastra el cliente de la base al importarse, y aquí
   solo se prueba una función pura suya. Mismo apaño que sicat-zonas.test. */
vi.mock('./supabase', () => ({ supabase: { auth: { onAuthStateChange: () => {} } } }))

import {
  bloquesDe, hayBloques, seriesTarea, vecesDe, descansoTotalDe, repeticionTexto,
} from './bloques-tarea'
import { calcularDuracionEstimada, type TareaDuracion } from './duracion'
import { conVolumen, type TareaCruda } from './sesion-volumen'
import { totalDeTarea, vistaDeTarea } from './tarea-vista'
import { detalleDeTarea } from './grupos-dia'
import { bloquesDesdeTareas } from './plantillas-propias'

describe('cuántos bloques', () => {
  it('un número mayor que uno es un número de bloques', () => {
    expect(bloquesDe({ bloques: 3 })).toBe(3)
    expect(hayBloques({ bloques: 3 })).toBe(true)
  })

  /* Un «1 bloque» es una tarea normal, y un cero o un negativo guardados a
     mano no pueden dejar el volumen en nada. */
  it('uno, cero, negativo o nada es una tarea normal', () => {
    for (const b of [1, 0, -2, null, undefined, NaN]) {
      expect(bloquesDe({ bloques: b as number })).toBe(1)
      expect(hayBloques({ bloques: b as number })).toBe(false)
    }
  })

  it('las series de un bloque, y una si no hay', () => {
    expect(seriesTarea({ series: 2 })).toBe(2)
    expect(seriesTarea({})).toBe(1)
    expect(seriesTarea({ series: 0 })).toBe(1)
  })
})

describe('cuántas veces se hace', () => {
  it('3 × (2 × 400) son seis 400', () => {
    expect(vecesDe({ series: 2, bloques: 3 })).toBe(6)
  })

  it('sin bloques, las series de siempre', () => {
    expect(vecesDe({ series: 6 })).toBe(6)
    expect(vecesDe({ series: 6, bloques: 1 })).toBe(6)
    expect(vecesDe({})).toBe(1)
  })
})

describe('el descanso', () => {
  /* 3 × (2 × 400) con 1:00 y 3:00: un descanso corto dentro de cada bloque
     —tres en total— y dos largos entre bloques. El último 400 no descansa. */
  it('tres cortos y dos largos', () => {
    expect(descansoTotalDe({ series: 2, bloques: 3, descanso_segundos: 60, descanso_bloques_segundos: 180 }))
      .toBe(3 * 60 + 2 * 180)
  })

  /* LA GARANTÍA. Sin bloques tiene que salir la cuenta de toda la vida:
     (series − 1) descansos. Si esto cambiara, se moverían las duraciones de
     todas las sesiones que ya existen. */
  it('sin bloques, la cuenta de siempre', () => {
    for (const s of [1, 2, 6, 10]) {
      expect(descansoTotalDe({ series: s, descanso_segundos: 90 })).toBe((s - 1) * 90)
    }
  })

  it('un descanso largo sin bloques no cuenta', () => {
    expect(descansoTotalDe({ series: 4, descanso_segundos: 60, descanso_bloques_segundos: 300 })).toBe(3 * 60)
  })
})

describe('cómo se lee', () => {
  /* Los paréntesis NO son adorno: sin ellos, «3 × 2 × 400» se lee como seis
     400 seguidos, y lo que distingue esta sesión es justo el descanso largo. */
  it('en bloques, con paréntesis', () => {
    expect(repeticionTexto({ series: 2, bloques: 3 }, '400 m')).toBe('3 × (2 × 400 m)')
    expect(repeticionTexto({ series: 1, bloques: 3 }, '1 km')).toBe('3 × (1 km)')
  })

  it('sin bloques, lo de siempre', () => {
    expect(repeticionTexto({ series: 4 }, '400 m')).toBe('4 × 400 m')
    expect(repeticionTexto({ series: 1 }, '30 min')).toBe('30 min')
    expect(repeticionTexto({}, '30 min')).toBe('30 min')
  })
})

// ============================================================
// Que CUENTE en todos los sitios
// ============================================================

/** 400 m por serie, con su descanso. `bloques` opcional. */
const cuatrocientos = (extra: Partial<TareaDuracion> = {}): TareaDuracion => ({
  disciplina: 'Carrera', series: 2, descanso_segundos: 60,
  p_distancia: [{ metros_planeados: 400 }], ...extra,
})

describe('la duración', () => {
  /* Por tiempo, para no depender de los tests del atleta: 3 × (2 × 60 s) con
     0:30 y 2:00. Trabajo 6 × 60 = 360; descanso 3 × 30 + 2 × 120 = 330. */
  it('suma el trabajo de todos los bloques y los descansos largos', () => {
    const t: TareaDuracion = {
      disciplina: 'Carrera', series: 2, bloques: 3, descanso_segundos: 30, descanso_bloques_segundos: 120,
      p_duracion: [{ tiempo_planeado: 60 }],
    }
    expect(calcularDuracionEstimada([t], {}).segundos).toBe(6 * 60 + 3 * 30 + 2 * 120)
  })

  it('sin bloques, lo mismo que antes', () => {
    const t: TareaDuracion = { disciplina: 'Carrera', series: 2, descanso_segundos: 30, p_duracion: [{ tiempo_planeado: 60 }] }
    expect(calcularDuracionEstimada([t], {}).segundos).toBe(2 * 60 + 30)
  })

  it('con el ritmo del atleta, tres bloques duran bastante más que uno', () => {
    const uno = calcularDuracionEstimada([cuatrocientos()], { vam: 16 }).segundos
    const tres = calcularDuracionEstimada([cuatrocientos({ bloques: 3, descanso_bloques_segundos: 180 })], { vam: 16 }).segundos
    expect(tres).toBeGreaterThan(3 * uno)
  })
})

describe('el volumen', () => {
  const sesiones = [{ id: 1 }]
  const volumen = (t: Partial<TareaCruda>) => conVolumen(
    sesiones,
    [{ id: 10, id_sesion: 1, series: 2, disciplina: 'Carrera', descanso_segundos: 60, ...t }],
    [{ id_tarea: 10, metros_planeados: 400 }], [], [], {},
  )[0]

  /* EL NÚMERO QUE NO PUEDE MENTIR. 3 × (2 × 400) son 2.400 m. Un sitio que se
     olvide de los bloques dice 800, y no da ningún error. */
  it('3 × (2 × 400) son 2.400 m, no 800', () => {
    expect(volumen({ bloques: 3 }).metros_total).toBe(2400)
  })

  it('sin bloques, 800 como siempre', () => {
    expect(volumen({}).metros_total).toBe(800)
  })
})

describe('lo que se enseña', () => {
  const t = {
    disciplina: 'Carrera', series: 2, bloques: 3, descanso_segundos: 60, descanso_bloques_segundos: 180,
    zona_entrenamiento: 'PAE', p_distancia: [{ metros_planeados: 400 }],
  }

  it('el total de la ficha es el de los seis 400', () => {
    expect(totalDeTarea(t)).toBe('2.4 km')
    expect(totalDeTarea({ ...t, bloques: null })).toBe('800 m')
  })

  it('la ficha dice los bloques y el descanso largo, solo cuando los hay', () => {
    const con = vistaDeTarea(t, {}, 0).campos.map(c => c.k)
    expect(con).toContain('Bloques')
    expect(con).toContain('Entre bloques')
    const sin = vistaDeTarea({ ...t, bloques: null }, {}, 0).campos.map(c => c.k)
    expect(sin).not.toContain('Bloques')
    expect(sin).not.toContain('Entre bloques')
  })

  /* La hoja de grupo arma su línea con los campos de la ficha. */
  it('la hoja de grupo lo escribe con paréntesis', () => {
    expect(detalleDeTarea(vistaDeTarea(t, {}, 0).campos)).toBe('3 × (2 × 400 m)')
    expect(detalleDeTarea(vistaDeTarea({ ...t, bloques: null }, {}, 0).campos)).toBe('2 × 400 m')
  })

  /* Una plantilla no sabe de bloques: entra como 6 × 400. Se pierde el
     descanso largo, pero el volumen —lo que no puede mentir— es el mismo. */
  it('al guardar como plantilla, el volumen se conserva', () => {
    const [b] = bloquesDesdeTareas([t])
    expect(b.series).toBe(6)
    expect(b.metros).toBe(400)
  })
})
