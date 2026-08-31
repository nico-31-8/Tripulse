import { describe, it, expect } from 'vitest'
import {
  filaResistenciaDesde, filaFuerzaDesde, avisaOtraDisciplina, segAMmss, intensidadDeTarea,
} from './copiar-tarea'

const BASE_R = {
  orden: 1, zona: '', disciplina: 'Carrera', series: '', descanso: '',
  tipoMedicion: '', valorMedicion: '', intensidadPersonalizada: '', comentario: '',
  esTecnica: false, tecnicaId: '',
}
const BASE_F = {
  orden: 1, grupoMuscularSel: '', ejercicioSelId: '', tipoSerie: 'Normal', series: '',
  medida: 'reps' as const, controlTipo: 'rir' as const, repsFuerza: '', kgFuerza: '', rir: '',
  descanso: '', comentario: '', grupoMuscular2: '', ejercicioSelId2: '',
  series2: '', repsFuerza2: '', kgFuerza2: '', escalonDrop: '', zonaFuerzaTarea: '',
}

const tareaRes = (extra: any = {}) => ({
  id: 77, zona_entrenamiento: 'PAE', disciplina: 'Ciclismo', series: 5,
  descanso_segundos: 180, comentario: 'Cadencia 90–95.', tecnica_id: null,
  p_duracion: [{ tiempo_planeado: 300 }], p_distancia: [], p_repeticiones: [],
  ...extra,
})

const BIBLIO = [
  { id: 3, nombre: 'Sentadilla trasera', grupo_muscular: 'Tren inferior' },
  { id: 9, nombre: 'Elevación de gemelo', grupo_muscular: 'Tren inferior' },
]
const tareaFue = (extra: any = {}) => ({
  id: 88, zona_entrenamiento: 'FMH', series: 4, descanso_segundos: 120,
  comentario: 'Bajar controlado.', p_duracion: [], p_distancia: [], p_repeticiones: [],
  ejercicios: [{
    nombre: 'Sentadilla trasera', grupo_muscular: 'Tren inferior', tipo_serie: 'Normal',
    repeticiones: 8, intensidad: 70, control_tipo: 'rir', control_valor: '2',
    ejercicio_encadenado_id: null, escalones_drop: null,
  }],
  ...extra,
})

describe('una tarea de resistencia vuelve al formulario', () => {
  it('con todas sus casillas', () => {
    const f = filaResistenciaDesde(tareaRes(), { base: BASE_R, orden: 3, copia: false })
    expect(f.zona).toBe('PAE')
    expect(f.disciplina).toBe('Ciclismo')
    expect(f.series).toBe('5')
    expect(f.descanso).toBe('180')
    expect(f.tipoMedicion).toBe('seg')
    expect(f.valorMedicion).toBe('300')
    expect(f.comentario).toBe('Cadencia 90–95.')
    expect(f.orden).toBe(3)
  })

  /* LA ÚNICA DIFERENCIA ENTRE EDITAR Y COPIAR, y de ella depende que copiar no
     toque la sesión de origen: con idTarea el guardado hace UPDATE sobre la
     tarea de la otra sesión. Sin él, INSERT en esta. */
  it('editar lleva idTarea; copiar NO', () => {
    expect(filaResistenciaDesde(tareaRes(), { base: BASE_R, orden: 1, copia: false }).idTarea).toBe(77)
    expect(filaResistenciaDesde(tareaRes(), { base: BASE_R, orden: 1, copia: true }).idTarea).toBeUndefined()
  })

  it('la medición sale de la tabla que la tenga', () => {
    const dist = filaResistenciaDesde(
      tareaRes({ p_duracion: [], p_distancia: [{ metros_planeados: 400 }] }),
      { base: BASE_R, orden: 1, copia: true })
    expect(dist.tipoMedicion).toBe('m')
    expect(dist.valorMedicion).toBe('400')
  })

  it('sin medición, las casillas quedan vacías y no en «undefined»', () => {
    const f = filaResistenciaDesde(
      tareaRes({ p_duracion: [], p_distancia: [], p_repeticiones: [] }),
      { base: BASE_R, orden: 1, copia: true })
    expect(f.tipoMedicion).toBe('')
    expect(f.valorMedicion).toBe('')
  })

  /* «Técnica» no es una zona: la tarea guarda AER y `tecnica_id` aparte. Si esto
     no se dedujera, copiar un bloque técnico lo convertiría en un AER suelto y
     el trabajo técnico se perdería sin avisar. */
  it('un bloque de técnica se reconoce por tecnica_id', () => {
    const f = filaResistenciaDesde(
      tareaRes({ zona_entrenamiento: 'AER', tecnica_id: 12 }),
      { base: BASE_R, orden: 1, copia: true })
    expect(f.esTecnica).toBe(true)
    expect(f.tecnicaId).toBe('12')
    expect(f.zona).toBe('AER')
  })

  it('los campos vacíos no se convierten en la cadena «null»', () => {
    const f = filaResistenciaDesde(
      { id: 1, series: null, descanso_segundos: null, comentario: null, zona_entrenamiento: null },
      { base: BASE_R, orden: 1, copia: true })
    expect(f.series).toBe('')
    expect(f.descanso).toBe('')
    expect(f.comentario).toBe('')
    expect(f.zona).toBe('')
  })

  /* La fila vacía trae los valores por defecto de la sesión (zona de la sesión
     en modo simple, disciplina…), pero lo que la TAREA diga gana siempre.

     Este test pinaba antes lo contrario para `intensidadPersonalizada`, y era
     un espejismo: la casilla no se guardaba ni se leía, así que «respetar la
     fila de partida» solo describía que el campo no se tocaba nunca. Ahora que
     hace el viaje de ida y vuelta, lo que hay que fijar es que la tarea manda. */
  it('lo que trae la tarea gana a la fila de partida', () => {
    const f = filaResistenciaDesde(
      { ...tareaRes(), p_distancia: [{ metros_planeados: 5000, ritmo_objetivo: '4:00 /km' }] },
      { base: { ...BASE_R, intensidadPersonalizada: 'lo que hubiera' }, orden: 1, copia: true })
    expect(f.intensidadPersonalizada).toBe('4:00 /km')
  })

  it('si la tarea no dice nada, la casilla queda vacía y no arrastra la anterior', () => {
    const f = filaResistenciaDesde(tareaRes(), {
      base: { ...BASE_R, intensidadPersonalizada: 'lo que hubiera' }, orden: 1, copia: true })
    expect(f.intensidadPersonalizada).toBe('')
  })
})

describe('una tarea de fuerza vuelve al formulario', () => {
  it('con ejercicio, grupo, carga y control', () => {
    const f = filaFuerzaDesde(tareaFue(), { base: BASE_F, orden: 2, copia: true, ejerciciosBiblioteca: BIBLIO })
    expect(f.ejercicioSelId).toBe('3')
    expect(f.grupoMuscularSel).toBe('Tren inferior')
    expect(f.series).toBe('4')
    expect(f.repsFuerza).toBe('8')
    expect(f.kgFuerza).toBe('70')
    expect(f.controlTipo).toBe('rir')
    expect(f.rir).toBe('2')
    expect(f.zonaFuerzaTarea).toBe('FMH')
  })

  /* El control no es siempre RIR: son cuatro escalas. Copiar una prescrita por
     %1RM y que volviera como RIR cambiaría lo que se le pide al atleta. */
  it('el control se copia con su escala, no siempre RIR', () => {
    const f = filaFuerzaDesde(
      tareaFue({ ejercicios: [{ ...tareaFue().ejercicios[0], control_tipo: 'pct1rm', control_valor: '80' }] }),
      { base: BASE_F, orden: 1, copia: true, ejerciciosBiblioteca: BIBLIO })
    expect(f.controlTipo).toBe('pct1rm')
    expect(f.rir).toBe('80')
  })

  /* Un ejercicio por tiempo guarda los segundos en p_duracion, y la casilla de
     «reps» es la que los lleva. La casilla acepta «45» o «1:30», NO «1:30 min»:
     con el texto de leer, mmssASegundos no entiende nada al volver a guardar. */
  it('un ejercicio por tiempo vuelve en formato editable', () => {
    const f = filaFuerzaDesde(
      tareaFue({ p_duracion: [{ tiempo_planeado: 90 }] }),
      { base: BASE_F, orden: 1, copia: true, ejerciciosBiblioteca: BIBLIO })
    expect(f.medida).toBe('tiempo')
    expect(f.repsFuerza).toBe('1:30')
  })

  it('menos de un minuto va en segundos sueltos', () => {
    const f = filaFuerzaDesde(
      tareaFue({ p_duracion: [{ tiempo_planeado: 45 }] }),
      { base: BASE_F, orden: 1, copia: true, ejerciciosBiblioteca: BIBLIO })
    expect(f.repsFuerza).toBe('45')
  })

  it('el encadenado trae también su grupo, o su desplegable saldría vacío', () => {
    const f = filaFuerzaDesde(
      tareaFue({ ejercicios: [{ ...tareaFue().ejercicios[0], tipo_serie: 'Superserie', ejercicio_encadenado_id: 9 }] }),
      { base: BASE_F, orden: 1, copia: true, ejerciciosBiblioteca: BIBLIO })
    expect(f.ejercicioSelId2).toBe('9')
    expect(f.grupoMuscular2).toBe('Tren inferior')
  })

  it('una tarea de fuerza sin fila en ejercicios no revienta', () => {
    const f = filaFuerzaDesde({ id: 1, ejercicios: [], comentario: 'Sentadillas 4x8' },
      { base: BASE_F, orden: 1, copia: true, ejerciciosBiblioteca: BIBLIO })
    expect(f.ejercicioSelId).toBe('')
    expect(f.comentario).toBe('Sentadillas 4x8')
  })

  it('editar lleva idTarea; copiar no', () => {
    expect(filaFuerzaDesde(tareaFue(), { base: BASE_F, orden: 1, copia: false, ejerciciosBiblioteca: BIBLIO }).idTarea).toBe(88)
    expect(filaFuerzaDesde(tareaFue(), { base: BASE_F, orden: 1, copia: true, ejerciciosBiblioteca: BIBLIO }).idTarea).toBeUndefined()
  })
})

describe('el aviso de otra disciplina', () => {
  it('avisa si la fila viene de otro deporte', () => {
    expect(avisaOtraDisciplina({ disciplina: 'Ciclismo' }, 'Carrera')).toBe(true)
  })

  it('no avisa si coincide', () => {
    expect(avisaOtraDisciplina({ disciplina: 'Carrera' }, 'Carrera')).toBe(false)
  })

  /* En un brick mezclar deportes es lo normal: el aviso saldría en todas las
     filas y dejaría de leerse justo donde sí importa. */
  it('en un brick no avisa nunca', () => {
    expect(avisaOtraDisciplina({ disciplina: 'Ciclismo' }, 'Brick')).toBe(false)
  })

  it('una fila sin deporte todavía no avisa', () => {
    expect(avisaOtraDisciplina({ disciplina: '' }, 'Carrera')).toBe(false)
  })
})

describe('los segundos, en texto', () => {
  it('los minutos redondos van sin los :00', () => {
    expect(segAMmss(120)).toBe('2')
  })
  it('con segundos sueltos, mm:ss', () => {
    expect(segAMmss(90)).toBe('1:30')
    expect(segAMmss(185)).toBe('3:05')
  })
})

/*
  La casilla del «@» (intensidad propia) devuelve lo guardado, tal cual.

  ESTE BLOQUE FIJABA ANTES LO CONTRARIO, y merece la pena contar por qué cambió.
  La columna guardaba dos cosas con la misma pinta: lo que escribía el
  entrenador, o —con la casilla vacía— la sugerencia de la app guardándose sola.
  Para distinguirlas se comparaba lo guardado con la sugerencia y, si coincidía,
  se borraba la casilla.

  El precio no se veía: prescribir a propósito el MISMO valor que proponía la
  app era imposible. Se escribía, se guardaba, y al recargar había desaparecido.
  Y eso es justo lo que hace un entrenador que quiere clavar un ritmo que hoy
  coincide con el del test pero no quiere que se mueva cuando el atleta mejore.

  Ya no hay nada que adivinar: solo se guarda lo escrito (`aGuardar`).
*/
describe('intensidadDeTarea', () => {
  it('devuelve lo que escribió el entrenador', () => {
    const t = { zona_entrenamiento: 'Z3', disciplina: 'Carrera', p_distancia: [{ ritmo_objetivo: '4:00 /km' }] }
    expect(intensidadDeTarea(t)).toBe('4:00 /km')
  })

  it('aunque coincida con lo que propondría la zona: escribirlo es una decisión', () => {
    const t = { zona_entrenamiento: 'Z3', disciplina: 'Carrera', p_distancia: [{ ritmo_objetivo: '4:12–4:30 /km' }] }
    expect(intensidadDeTarea(t)).toBe('4:12–4:30 /km')
  })

  /* p_duracion NO tenía esa columna, y por eso un bloque por tiempo perdía la
     intensidad: «30 min a 4:30/km» le llegaba al deportista como «30 min». La
     añade supabase/intensidad-en-bloques-por-tiempo.sql. Antes aquí había un
     test fijando que NO se leyera de ahí; era correcto describir la base de
     entonces, y ha dejado de serlo a propósito. */
  it('también la lee de un bloque por tiempo', () => {
    const t = { zona_entrenamiento: 'Z3', disciplina: 'Carrera', p_duracion: [{ ritmo_objetivo: '180–220 W' }] }
    expect(intensidadDeTarea(t)).toBe('180–220 W')
  })

  it('sin nada guardado, vacío', () => {
    expect(intensidadDeTarea({ p_distancia: [{ ritmo_objetivo: null }] })).toBe('')
    expect(intensidadDeTarea({ p_distancia: [{}] })).toBe('')
    expect(intensidadDeTarea({})).toBe('')
    expect(intensidadDeTarea({ p_distancia: [{ ritmo_objetivo: '   ' }] })).toBe('')
  })

  it('al editar, la intensidad propia vuelve a la fila', () => {
    const t = {
      id: 7, orden: 2, zona_entrenamiento: 'Z3', disciplina: 'Carrera',
      p_distancia: [{ metros_planeados: 5000, ritmo_objetivo: '4:00 /km' }],
    }
    const f = filaResistenciaDesde(t, { base: BASE_R, orden: 2, copia: false })
    expect(f.intensidadPersonalizada).toBe('4:00 /km')
    expect(f.idTarea).toBe(7)
  })

  it('al copiar también viaja: es la misma prescripción', () => {
    const t = {
      id: 7, orden: 2, zona_entrenamiento: 'Z3', disciplina: 'Carrera',
      p_distancia: [{ metros_planeados: 5000, ritmo_objetivo: '4:00 /km' }],
    }
    const f = filaResistenciaDesde(t, { base: BASE_R, orden: 1, copia: true })
    expect(f.intensidadPersonalizada).toBe('4:00 /km')
    expect(f.idTarea).toBeUndefined()
  })

  it('y una por tiempo también, que era la que se quedaba por el camino', () => {
    const t = {
      id: 8, orden: 1, zona_entrenamiento: 'Z2', disciplina: 'Carrera',
      p_duracion: [{ tiempo_planeado: 1800, ritmo_objetivo: '4:30 /km' }],
    }
    const f = filaResistenciaDesde(t, { base: BASE_R, orden: 1, copia: false })
    expect(f.intensidadPersonalizada).toBe('4:30 /km')
  })
})

/*
  El viaje de ida y vuelta del encadenado. Antes los tres números se quedaban en
  el camino: se escribían dentro de las notas y al reabrir la fila volvían
  vacíos, así que editar una superserie perdía la mitad de la prescripción.
*/
describe('los números del encadenado vuelven a la fila', () => {
  const conEncadenado = (extra: any = {}) => ({
    id: 9, orden: 1, series: 4,
    ejercicios: [{
      nombre: 'Sentadilla', grupo_muscular: 'Pierna', series: 4, repeticiones: 8, intensidad: 80,
      ejercicio_encadenado_id: 22, ejercicio_encadenado_nombre: 'Press banca',
      ...extra,
    }],
  })
  const BIB = [
    { id: 11, nombre: 'Sentadilla', grupo_muscular: 'Pierna' },
    { id: 22, nombre: 'Press banca', grupo_muscular: 'Pecho' },
  ]

  it('los tres vuelven', () => {
    const f = filaFuerzaDesde(
      conEncadenado({ encadenado_series: 3, encadenado_repeticiones: 10, encadenado_intensidad: 40 }),
      { base: BASE_F, orden: 1, copia: false, ejerciciosBiblioteca: BIB })
    expect(f.ejercicioSelId2).toBe('22')
    expect(f.series2).toBe('3')
    expect(f.repsFuerza2).toBe('10')
    expect(f.kgFuerza2).toBe('40')
  })

  it('al copiar también viajan: es la misma prescripción', () => {
    const f = filaFuerzaDesde(
      conEncadenado({ encadenado_series: 3, encadenado_repeticiones: 10, encadenado_intensidad: 40 }),
      { base: BASE_F, orden: 1, copia: true, ejerciciosBiblioteca: BIB })
    expect(f.series2).toBe('3')
    expect(f.idTarea).toBeUndefined()
  })

  it('una tarea anterior a la migración vuelve con los huecos vacíos, no rota', () => {
    const f = filaFuerzaDesde(conEncadenado(), { base: BASE_F, orden: 1, copia: false, ejerciciosBiblioteca: BIB })
    expect(f.ejercicioSelId2).toBe('22')
    expect(f.series2).toBe('')
    expect(f.repsFuerza2).toBe('')
    expect(f.kgFuerza2).toBe('')
  })

  it('un 0 no se confunde con vacío', () => {
    const f = filaFuerzaDesde(
      conEncadenado({ encadenado_intensidad: 0 }),
      { base: BASE_F, orden: 1, copia: false, ejerciciosBiblioteca: BIB })
    expect(f.kgFuerza2).toBe('0')
  })
})
