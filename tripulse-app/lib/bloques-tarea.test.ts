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
  bloquesDe, hayBloques, seriesTarea, vecesDe, descansoTotalDe, descansoFinalDe, repeticionTexto,
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

  /* Sin bloques, DENTRO de la tarea, la cuenta de toda la vida: (series − 1)
     descansos. El de detrás de la última serie va aparte (descansoFinalDe) y
     solo cuenta si viene otra tarea: eso lo decide quien recorre la sesión. */
  it('sin bloques, la cuenta de siempre', () => {
    for (const s of [1, 2, 6, 10]) {
      expect(descansoTotalDe({ series: s, descanso_segundos: 90 })).toBe((s - 1) * 90)
    }
  })

  it('un descanso largo sin bloques no cuenta', () => {
    expect(descansoTotalDe({ series: 4, descanso_segundos: 60, descanso_bloques_segundos: 300 })).toBe(3 * 60)
  })
})

describe('el descanso de detrás de la última serie', () => {
  /* «3 × 400, 2:00» y debajo un 3.000: entre el tercer 400 y el 3.000 también
     se descansan los 2:00 (lo pidió el entrenador el 24-10-2026). */
  it('sin bloques, el corto', () => {
    expect(descansoFinalDe({ series: 3, descanso_segundos: 120 })).toBe(120)
  })

  it('una serie sola: su descanso solo puede ser el de después', () => {
    expect(descansoFinalDe({ series: 1, descanso_segundos: 180 })).toBe(180)
  })

  it('en bloques, el largo, que es el que va detrás de cada bloque; sin largo, el corto', () => {
    expect(descansoFinalDe({ series: 2, bloques: 3, descanso_segundos: 60, descanso_bloques_segundos: 180 })).toBe(180)
    expect(descansoFinalDe({ series: 2, bloques: 3, descanso_segundos: 60 })).toBe(60)
  })

  it('sin descanso, nada; y un largo sin bloques no es el de detrás', () => {
    expect(descansoFinalDe({ series: 4 })).toBe(0)
    expect(descansoFinalDe({ series: 4, descanso_segundos: 60, descanso_bloques_segundos: 300 })).toBe(60)
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

describe('la duración de la sesión, con el descanso de detrás de la última serie', () => {
  const tresMil = (extra: Partial<TareaDuracion> = {}): TareaDuracion => ({
    disciplina: 'Carrera', series: 1, descanso_segundos: 180, p_distancia: [{ metros_planeados: 3000 }], ...extra,
  })
  const vam = { vam: 20 }
  const sola = (t: TareaDuracion) => calcularDuracionEstimada([t], vam).segundos

  /* Una tarea suelta cuenta como la última de su sesión. Lo que añade tener
     otra detrás es JUSTO su descanso final, ni un segundo más. */
  it('lo que añade tener otra tarea detrás es su descanso final', () => {
    const a = cuatrocientos({ series: 3, descanso_segundos: 120 })
    const b = tresMil()
    expect(calcularDuracionEstimada([a, b], vam).segundos).toBeCloseTo(sola(a) + sola(b) + 120, 6)
    expect(calcularDuracionEstimada([b, a], vam).segundos).toBeCloseTo(sola(a) + sola(b) + 180, 6)
  })

  it('al final de la sesión no se descansa', () => {
    const t = cuatrocientos({ series: 3, descanso_segundos: 120 })
    expect(sola(t) - 3 * sola(cuatrocientos({ series: 1, descanso_segundos: null }))).toBeCloseTo(2 * 120, 6)
  })

  /* La de la captura del entrenador (22-10-2026): 1.000 m de AEL, cuatro
     técnicas de 2 × 25 m, 3 × 400 con 2:00, 3.000 con 3:00 y 2 × 400 con
     2:00, con VAM 20. Antes 26 minutos: faltaban el 2:00 del tercer 400 y el
     3:00 del 3.000. */
  it('la sesión de 400 y 3.000 pasa de 26 a 31 minutos', () => {
    const t = (zona: string, series: number, metros: number, descanso: number | null): TareaDuracion =>
      ({ disciplina: 'Carrera', zona_entrenamiento: zona, series, descanso_segundos: descanso, p_distancia: [{ metros_planeados: metros }] })
    const sesion = [
      t('AEL', 1, 1000, null),
      t('AER', 2, 25, null), t('AER', 2, 25, null), t('AER', 2, 25, null), t('AER', 2, 25, null),
      t('CLA', 3, 400, 120),
      t('AEI', 1, 3000, 180),
      t('CLA', 2, 400, 120),
    ]
    expect(calcularDuracionEstimada(sesion, vam).minutos).toBe(31)
    const porSeparado = sesion.reduce((s, x) => s + sola(x), 0)
    expect(calcularDuracionEstimada(sesion, vam).segundos - porSeparado).toBeCloseTo(120 + 180, 6)
  })

  /* El orden de verdad es `orden`, no el de la lista: varias pantallas piden
     las tareas sin ordenar, y la última se quedaría con el descanso de otra. */
  it('la última es la de mayor orden, aunque llegue antes en la lista', () => {
    const a = cuatrocientos({ orden: 1, series: 3, descanso_segundos: 120 })
    const b = tresMil({ orden: 2 })
    expect(calcularDuracionEstimada([b, a], vam).segundos).toBeCloseTo(calcularDuracionEstimada([a, b], vam).segundos, 6)
    expect(calcularDuracionEstimada([b, a], vam).segundos).toBeCloseTo(sola(a) + sola(b) + 120, 6)
  })

  /* Para quien cuenta tarea a tarea (el reparto de lib/atribucion). */
  it('con hayMasDetras, la última de la lista también descansa', () => {
    expect(calcularDuracionEstimada([tresMil()], vam, { hayMasDetras: true }).segundos).toBeCloseTo(sola(tresMil()) + 180, 6)
  })

  /* En fuerza el paso al ejercicio siguiente ya es la transición de 90 s: el
     descanso de la última serie no se suma encima. */
  it('en fuerza no cambia nada', () => {
    const f = (): TareaDuracion => ({ disciplina: 'Fuerza', series: 3, descanso_segundos: 60, ejercicios: [{ repeticiones: 10 }] })
    expect(calcularDuracionEstimada([f(), f()], {}).segundos).toBe(2 * calcularDuracionEstimada([f()], {}).segundos + 90)
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
