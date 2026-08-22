import { describe, it, expect } from 'vitest'
import {
  lunesDe, diasDeLaSemana, resumenDeSemana, etiquetaDeSemana, rangoLegible,
  puedeCopiarse, tareaEsDeFuerza, esDisciplinaDeFuerza,
  type SesionSemana, type MicroParaEtiqueta,
} from './semana-sesiones'

/* 2026-08-17 es lunes; 2026-08-23, domingo. */
const L = '2026-08-17'

const ses = (id: number, fecha: string, extra: Partial<SesionSemana> = {}): SesionSemana =>
  ({ id, fecha_sesion: fecha, disciplina: 'Carrera', estado: 'Planificada', id_microciclo: 9, ...extra })

describe('dónde empieza la semana', () => {
  it('un miércoles cae en su lunes', () => {
    expect(lunesDe('2026-08-19')).toBe(L)
  })

  it('el lunes es su propio lunes', () => {
    expect(lunesDe(L)).toBe(L)
  })

  /* EL CASO QUE SIEMPRE SE ROMPE. En JavaScript el domingo es el día 0, así que
     un `- getDay() + 1` ingenuo manda el domingo a la semana SIGUIENTE y la
     sesión del domingo desaparece del panel. El domingo cierra su semana. */
  it('el domingo pertenece a la semana que acaba, no a la que empieza', () => {
    expect(lunesDe('2026-08-23')).toBe(L)
    expect(lunesDe('2026-08-24')).toBe('2026-08-24')
  })

  it('aguanta una fecha con hora pegada detrás', () => {
    expect(lunesDe('2026-08-19T10:30:00')).toBe(L)
  })
})

describe('los siete días', () => {
  it('siempre son siete, aunque no haya nada', () => {
    const d = diasDeLaSemana(L, [])
    expect(d).toHaveLength(7)
    expect(d.map(x => x.letra)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D'])
  })

  it('cada sesión cae en su día', () => {
    const d = diasDeLaSemana(L, [ses(1, '2026-08-17'), ses(2, '2026-08-22'), ses(3, '2026-08-22')])
    expect(d[0].sesiones.map(s => s.id)).toEqual([1])
    expect(d[5].sesiones.map(s => s.id)).toEqual([2, 3])
    expect(d[4].sesiones).toEqual([])
  })

  /* La del domingo es la que más se pierde: si el cálculo del lunes falla, esta
     sesión no sale en ninguna de las dos semanas. */
  it('la del domingo aparece', () => {
    const d = diasDeLaSemana(L, [ses(7, '2026-08-23')])
    expect(d[6].sesiones.map(s => s.id)).toEqual([7])
  })

  it('lo hecho va primero dentro del día', () => {
    const d = diasDeLaSemana(L, [
      ses(1, '2026-08-18', { estado: 'Planificada' }),
      ses(2, '2026-08-18', { estado: 'Realizada' }),
    ])
    expect(d[1].sesiones.map(s => s.id)).toEqual([2, 1])
  })

  it('lo de otras semanas no se cuela', () => {
    const d = diasDeLaSemana(L, [ses(1, '2026-08-16'), ses(2, '2026-08-24')])
    expect(d.every(x => !x.sesiones.length)).toBe(true)
  })

  it('una fecha con hora se compara igual', () => {
    const d = diasDeLaSemana(L, [ses(1, '2026-08-19T08:00:00')])
    expect(d[2].sesiones).toHaveLength(1)
  })
})

describe('el resumen', () => {
  it('cuenta sesiones, hechas y días libres', () => {
    const r = resumenDeSemana(diasDeLaSemana(L, [
      ses(1, '2026-08-17', { estado: 'Realizada' }),
      ses(2, '2026-08-18', { estado: 'Realizada' }),
      ses(3, '2026-08-18'),
      ses(4, '2026-08-22'),
    ]))
    expect(r).toEqual({ sesiones: 4, realizadas: 2, descanso: 4, delAtleta: 0 })
  })

  /* QUIÉN AÑADIÓ LA SESIÓN LO DICE `origen`, NO `id_microciclo`. Aquí se miró
     primero el microciclo y estaba mal: una sesión que se añade el atleta puede
     acabar colgada de un microciclo y sigue siendo suya. El resto de la app
     (mis-sesiones, la vista de mesociclo y la de semana) ya usaba `origen`, así
     que había dos definiciones de lo mismo — y se veía en pantalla: la vista de
     semana marcaba dos sesiones con 🙋 y el panel nuevo, ninguna. */
  it('separa las que se añadió el atleta, por su origen', () => {
    const r = resumenDeSemana(diasDeLaSemana(L, [
      ses(1, '2026-08-17'),
      ses(2, '2026-08-23', { origen: 'deportista' }),
    ]))
    expect(r.delAtleta).toBe(1)
    expect(r.sesiones).toBe(2)
  })

  it('una suya que SÍ cuelga de un microciclo sigue siendo suya', () => {
    const r = resumenDeSemana(diasDeLaSemana(L, [
      ses(1, '2026-08-18', { id_microciclo: 9, origen: 'deportista' }),
    ]))
    expect(r.delAtleta).toBe(1)
  })

  it('una suelta que puso el entrenador NO es del atleta', () => {
    const r = resumenDeSemana(diasDeLaSemana(L, [
      ses(1, '2026-08-18', { id_microciclo: null, origen: 'entrenador' }),
    ]))
    expect(r.delAtleta).toBe(0)
  })

  it('una semana vacía son siete días de descanso', () => {
    expect(resumenDeSemana(diasDeLaSemana(L, []))).toEqual(
      { sesiones: 0, realizadas: 0, descanso: 7, delAtleta: 0 })
  })
})

describe('cómo se llama la semana', () => {
  const micros: MicroParaEtiqueta[] = [
    { id: 1, fecha_inicio: '2026-08-10', tipo: 'Carga', id_mesociclo: 5 },
    { id: 2, fecha_inicio: '2026-08-17', tipo: 'Carga', id_mesociclo: 5 },
    { id: 3, fecha_inicio: '2026-08-24', tipo: 'Carga', id_mesociclo: 5 },
    { id: 4, fecha_inicio: '2026-08-31', tipo: 'Recuperación', id_mesociclo: 5 },
    { id: 5, fecha_inicio: '2026-09-07', tipo: 'Carga', id_mesociclo: 6 },
  ]

  it('dice qué número hace dentro de su bloque', () => {
    const e = etiquetaDeSemana(L, micros)
    expect(e.titulo).toBe('Semana 2 de 4 · 17–23 ago')
    expect(e.tipo).toBe('Carga')
  })

  it('la descarga se ve de un vistazo', () => {
    expect(etiquetaDeSemana('2026-08-31', micros).tipo).toBe('Recuperación')
  })

  /* El número se cuenta DENTRO del mesociclo. La primera del siguiente bloque
     vuelve a ser la 1, no la 5. */
  it('el número se reinicia en cada bloque', () => {
    expect(etiquetaDeSemana('2026-09-07', micros).titulo).toBe('Semana 1 de 1 · 7–13 sep')
  })

  /* Una semana fuera del plan EXISTE igual: el atleta puede tener sesiones
     sueltas antes de que empiece la temporada o después de la carrera. */
  it('sin microciclo que la cubra, se nombra por sus fechas', () => {
    const e = etiquetaDeSemana('2026-12-07', micros)
    expect(e.titulo).toBe('7–13 dic')
    expect(e.tipo).toBe('')
    expect(e.micro).toBeNull()
  })

  it('sin plan ninguno tampoco revienta', () => {
    expect(etiquetaDeSemana(L, []).titulo).toBe('17–23 ago')
  })

  it('el rango se lee bien cuando cambia de mes', () => {
    expect(rangoLegible('2026-08-31')).toBe('31 ago – 6 sep')
    expect(rangoLegible(L)).toBe('17–23 ago')
  })
})

describe('qué se puede copiar', () => {
  const deFuerza = { id: 1, ejercicios: [{ nombre: 'Sentadilla' }] }
  const deResistencia = { id: 2, zona_entrenamiento: 'PAE', ejercicios: [] }

  it('reconoce una tarea de fuerza por sus ejercicios', () => {
    expect(tareaEsDeFuerza(deFuerza)).toBe(true)
    expect(tareaEsDeFuerza(deResistencia)).toBe(false)
    expect(tareaEsDeFuerza({})).toBe(false)
  })

  /* NO ES UNA VALIDACIÓN DE UNIDADES, ES QUE NO HAY DÓNDE PONERLA. La tabla
     pinta el formulario de fuerza O el de resistencia según la disciplina de la
     sesión: son columnas distintas. Una tarea de fuerza copiada a una sesión de
     carrera no tiene fila que la reciba y se perdería al guardar. */
  it('fuerza en sesión de resistencia, no', () => {
    expect(puedeCopiarse(deFuerza, false)).toBe(false)
  })

  it('resistencia en sesión de fuerza, tampoco', () => {
    expect(puedeCopiarse(deResistencia, true)).toBe(false)
  })

  it('cada una en la suya, sí', () => {
    expect(puedeCopiarse(deFuerza, true)).toBe(true)
    expect(puedeCopiarse(deResistencia, false)).toBe(true)
  })

  /* Copiar una tarea de ciclismo a una sesión de carrera SÍ se permite: es
     legítimo (un brick, un cambio de plan) y solo hay que revisar el objetivo.
     La incompatibilidad es de formulario, no de deporte. */
  it('otra disciplina de resistencia sí cabe: el aviso es otra cosa', () => {
    expect(puedeCopiarse({ zona_entrenamiento: 'PAE', disciplina: 'Ciclismo' }, false)).toBe(true)
  })

  it('solo Fuerza usa la tabla de fuerza', () => {
    expect(esDisciplinaDeFuerza('Fuerza')).toBe(true)
    expect(esDisciplinaDeFuerza('Brick')).toBe(false)
    expect(esDisciplinaDeFuerza(null)).toBe(false)
  })
})
