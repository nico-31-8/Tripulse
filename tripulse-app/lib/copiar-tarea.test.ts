import { describe, it, expect } from 'vitest'
import {
  filaResistenciaDesde, filaFuerzaDesde, avisaOtraDisciplina, segAMmss,
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
     en modo simple, disciplina…). Lo que la tarea no diga se queda como esté. */
  it('respeta lo que trae la fila de partida', () => {
    const f = filaResistenciaDesde(tareaRes(), {
      base: { ...BASE_R, intensidadPersonalizada: 'lo que hubiera' }, orden: 1, copia: true })
    expect(f.intensidadPersonalizada).toBe('lo que hubiera')
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
