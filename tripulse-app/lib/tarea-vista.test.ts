import { describe, it, expect } from 'vitest'
import { valorPorSerie, totalDeTarea, vistaDeTarea, zonasDeSesion, nombreDeZona, textoEncadenado } from './tarea-vista'

const SIN_TESTS = {}
const CON_TESTS = { vam: 18, ftp: 260, css: 1.25 }

const res = (extra: any = {}) => ({
  id: 1, zona_entrenamiento: 'PAE', disciplina: 'Ciclismo', series: 5,
  descanso_segundos: 180, comentario: '', tecnica_id: null,
  p_duracion: [{ tiempo_planeado: 300 }], p_distancia: [], p_repeticiones: [],
  ejercicios: [], ...extra,
})

describe('cuánto es cada serie y cuánto es todo', () => {
  it('el total multiplica por las series', () => {
    expect(valorPorSerie(res())).toBe('5 min')
    expect(totalDeTarea(res())).toBe('25 min')
  })

  /* Que estos dos números salgan de un solo sitio es la razón de este fichero:
     si la tabla contara el total y la previa el valor por serie, comparar dos
     sesiones daría una conclusión falsa — que es justo para lo que sirve el
     panel de la semana. */
  it('en distancia, igual', () => {
    const t = res({ p_duracion: [], p_distancia: [{ metros_planeados: 100 }], series: 8 })
    expect(valorPorSerie(t)).toBe('100 m')
    expect(totalDeTarea(t)).toBe('800 m')
  })

  it('a partir del kilómetro cambia de unidad', () => {
    const t = res({ p_duracion: [], p_distancia: [{ metros_planeados: 200 }], series: 6 })
    expect(totalDeTarea(t)).toBe('1.2 km')
  })

  it('sin series, se cuenta una', () => {
    expect(totalDeTarea(res({ series: null }))).toBe('5 min')
  })

  it('sin medición, un guion y no «NaN»', () => {
    const t = res({ p_duracion: [], p_distancia: [], p_repeticiones: [] })
    expect(valorPorSerie(t)).toBe('—')
    expect(totalDeTarea(t)).toBe('—')
  })

  it('las repeticiones también suman', () => {
    const t = res({ p_duracion: [], p_repeticiones: [{ repeticiones_planteadas: 20 }], series: 3 })
    expect(totalDeTarea(t)).toBe('60 reps')
  })
})

describe('la tarea de resistencia, para leerla', () => {
  it('el objetivo sale con el test hecho', () => {
    const v = vistaDeTarea(res(), CON_TESTS, 190)
    const obj = v.campos.find(c => c.k === 'Objetivo')
    expect(obj?.v).toMatch(/W/)
  })

  /* SIN TEST NO SE INVENTA UN NÚMERO. Se enseña el porcentaje, que sí es cierto:
     un ritmo sacado de un FTP que no existe es peor que no decir nada. */
  it('sin test, el porcentaje en vez de un ritmo inventado', () => {
    const v = vistaDeTarea(res(), SIN_TESTS, 190)
    const obj = v.campos.find(c => c.k === 'Objetivo')
    expect(obj?.v).not.toMatch(/W|\/km/)
    expect(obj?.v).toBeTruthy()
  })

  /* El panel de la semana es del ENTRENADOR, y para él el porcentaje sí dice
     algo. Pero no es el número del atleta, así que no se destaca como si lo
     fuera. En Zonas 2 llegaba por el campo del ritmo y salía destacado; en el
     clásico, no. */
  it('sin test, el porcentaje de la zona y sin destacar, en los dos sistemas', () => {
    const z2 = vistaDeTarea(res(), SIN_TESTS, 190).campos.find(c => c.k === 'Objetivo')
    expect(z2?.v).toBe('106–120% FTP')
    expect(z2?.destaca).toBeFalsy()
    const clasica = vistaDeTarea(res({ zona_entrenamiento: 'Z5' }), SIN_TESTS, 190).campos.find(c => c.k === 'Objetivo')
    expect(clasica?.v).toBe('106–120% FTP')
    expect(clasica?.destaca).toBeFalsy()
  })

  it('siempre lleva series, por serie, total y descanso', () => {
    const claves = vistaDeTarea(res(), CON_TESTS, 190).campos.map(c => c.k)
    expect(claves).toEqual(expect.arrayContaining(['Series', 'Por serie', 'Total', 'Descanso']))
  })

  it('el comentario hace de título y entonces no se repite debajo', () => {
    const v = vistaDeTarea(res({ comentario: 'Cadencia 90–95.' }), CON_TESTS, 190)
    expect(v.titulo).toBe('Cadencia 90–95.')
    expect(v.comentario).toBe('')
  })

  it('un comentario largo se recorta arriba y se enseña entero abajo', () => {
    const largo = 'A'.repeat(90)
    const v = vistaDeTarea(res({ comentario: largo }), CON_TESTS, 190)
    expect(v.titulo).toHaveLength(60)
    expect(v.comentario).toBe(largo)
  })

  it('sin comentario, el título es el nombre de la zona', () => {
    expect(vistaDeTarea(res(), CON_TESTS, 190).titulo).toBe('Potencia aeróbica')
  })

  /* Un bloque de técnica guarda AER a propósito, para que cuente como el volumen
     suave que es. Pero enseñarlo como «Recuperación» a secas engaña: parece un
     rodaje flojo cuando es trabajo técnico, y eso cambia lo que le pones al día
     siguiente. */
  it('la técnica se ve como técnica, no como un rodaje suave', () => {
    const v = vistaDeTarea(res({ zona_entrenamiento: 'AER', tecnica_id: 12 }), CON_TESTS, 190)
    expect(v.titulo).toBe('Técnica')
    expect(v.nombreZona).toMatch(/Técnica/)
    // Y sigue diciendo qué zona cuenta, que es lo que ve el gráfico de carga.
    expect(v.nombreZona).toMatch(/Recuperación/)
  })

  it('sin nada dentro no revienta', () => {
    const v = vistaDeTarea({ id: 1 }, SIN_TESTS, 0)
    expect(v.esFuerza).toBe(false)
    expect(v.campos.length).toBeGreaterThan(0)
  })
})

describe('la tarea de fuerza, para leerla', () => {
  const fue = (extra: any = {}) => ({
    id: 2, zona_entrenamiento: 'FMH', series: 4, descanso_segundos: 120, comentario: '',
    p_duracion: [], p_distancia: [], p_repeticiones: [],
    ejercicios: [{
      nombre: 'Sentadilla trasera', grupo_muscular: 'Tren inferior', tipo_serie: 'Normal',
      series: 4, repeticiones: 8, intensidad: 70, control_tipo: 'rir', control_valor: '2',
      ...extra,
    }],
  })

  it('el título es el ejercicio, no la zona', () => {
    expect(vistaDeTarea(fue(), SIN_TESTS, 0).titulo).toBe('Sentadilla trasera')
  })

  it('lleva carga y control', () => {
    const v = vistaDeTarea(fue(), SIN_TESTS, 0)
    expect(v.campos.find(c => c.k === 'Carga')?.v).toBe('70 kg')
    expect(v.campos.find(c => c.k === 'Control')?.v).toBeTruthy()
  })

  /* «Control», no «RIR»: son cuatro escalas y con la etiqueta fija un %1RM salía
     bajo el nombre equivocado. */
  it('el control lleva su escala, sea la que sea', () => {
    const v = vistaDeTarea(fue({ control_tipo: 'pct1rm', control_valor: '80' }), SIN_TESTS, 0)
    expect(v.campos.find(c => c.k === 'Control')?.v).toMatch(/80/)
  })

  it('un ejercicio por tiempo enseña tiempo y no repeticiones', () => {
    const t = { ...fue(), p_duracion: [{ tiempo_planeado: 45 }] }
    const v = vistaDeTarea(t, SIN_TESTS, 0)
    expect(v.campos.some(c => c.k === 'Tiempo')).toBe(true)
    expect(v.campos.some(c => c.k === 'Repeticiones')).toBe(false)
  })

  it('el encadenado se nombra', () => {
    const v = vistaDeTarea(fue({ tipo_serie: 'Superserie', ejercicio_encadenado_nombre: 'Gemelo de pie' }), SIN_TESTS, 0)
    expect(v.encadenado).toBe('Gemelo de pie')
  })

  it('se reconoce como fuerza y dice su disciplina', () => {
    const v = vistaDeTarea(fue(), SIN_TESTS, 0)
    expect(v.esFuerza).toBe(true)
    expect(v.disciplina).toBe('Fuerza')
  })
})

describe('las zonas de una sesión', () => {
  it('sin repetir y sin huecos', () => {
    expect(zonasDeSesion([
      { zona_entrenamiento: 'AER' }, { zona_entrenamiento: 'PAE' },
      { zona_entrenamiento: 'AER' }, { zona_entrenamiento: null },
    ])).toEqual(['AER', 'PAE'])
  })

  it('una sesión sin tareas no da zonas', () => {
    expect(zonasDeSesion([])).toEqual([])
  })

  it('el nombre sale tanto de resistencia como de fuerza', () => {
    expect(nombreDeZona('PAE')).toBe('Potencia aeróbica')
    expect(nombreDeZona('FMH')).toBe('Fuerza Máxima Hipertrofia')
    expect(nombreDeZona('loquesea')).toBe('')
  })
})

/*
  Los tres números del 2.º ejercicio de una superserie vivían como texto dentro
  de `notas_ejecucion` (« | EJ2: Press banca 3x10 @40kg »). Ya tienen columnas,
  y el texto que se enseña se arma en un solo sitio.
*/
describe('textoEncadenado', () => {
  it('nombre y los tres números', () => {
    expect(textoEncadenado({
      ejercicio_encadenado_nombre: 'Press banca',
      encadenado_series: 3, encadenado_repeticiones: 10, encadenado_intensidad: 40,
    })).toBe('Press banca · 3×10 · 40 kg')
  })

  it('una tarea vieja, sin las columnas, sigue enseñando el nombre', () => {
    expect(textoEncadenado({ ejercicio_encadenado_nombre: 'Press banca' })).toBe('Press banca')
  })

  it('sin encadenado, vacío', () => {
    expect(textoEncadenado({})).toBe('')
    expect(textoEncadenado(null)).toBe('')
    expect(textoEncadenado({ ejercicio_encadenado_nombre: null, encadenado_series: 3 })).toBe('')
  })

  it('con solo una parte de los números no se inventa el resto', () => {
    const n = 'Press banca'
    expect(textoEncadenado({ ejercicio_encadenado_nombre: n, encadenado_series: 3 })).toBe('Press banca · 3 series')
    expect(textoEncadenado({ ejercicio_encadenado_nombre: n, encadenado_series: 1 })).toBe('Press banca · 1 serie')
    expect(textoEncadenado({ ejercicio_encadenado_nombre: n, encadenado_repeticiones: 10 })).toBe('Press banca · 10 reps')
    expect(textoEncadenado({ ejercicio_encadenado_nombre: n, encadenado_intensidad: 40 })).toBe('Press banca · 40 kg')
  })

  it('un 0 es un dato, no un hueco', () => {
    expect(textoEncadenado({
      ejercicio_encadenado_nombre: 'Plancha', encadenado_series: 3,
      encadenado_repeticiones: 10, encadenado_intensidad: 0,
    })).toBe('Plancha · 3×10 · 0 kg')
  })
})

/* Pliometría (21-10-2026): sus repeticiones son contactos, y en carrera se
   enseña con su nivel en vez de «Técnica · cuenta como AER». */
describe('una tarea de pliometría', () => {
  const pogo = { tipo: ['Pliometría'], nivel_pliometria: 'a', parte_pliometria: 'inferior' }

  it('en carrera: «Pliometría» con su nivel, y en contactos', () => {
    const t = res({
      zona_entrenamiento: 'AER', disciplina: 'Carrera', series: 3, tecnica_id: 7, tecnica: pogo,
      p_duracion: [], p_repeticiones: [{ repeticiones_planteadas: 20 }],
    })
    expect(valorPorSerie(t)).toBe('20 contactos')
    expect(totalDeTarea(t)).toBe('60 contactos')
    const v = vistaDeTarea(t, SIN_TESTS, 0)
    expect(v.titulo).toBe('Pliometría')
    expect(v.nombreZona).toBe('Pliometría · a, bajo, a dos pies, en el sitio')
  })

  it('una de técnica sigue como siempre', () => {
    const t = res({ zona_entrenamiento: 'AER', tecnica_id: 8, tecnica: { tipo: ['Técnica'] } })
    expect(vistaDeTarea(t, SIN_TESTS, 0).titulo).toBe('Técnica')
  })

  it('en fuerza: por su grupo, con los contactos y la altura', () => {
    const t = res({
      zona_entrenamiento: 'F1', disciplina: 'Fuerza', p_duracion: [],
      ejercicios: [{ nombre: 'Drop jump', grupo_muscular: 'Pliometría', series: 4, repeticiones: 6, control_tipo: 'altura', control_valor: '30' }],
    })
    const campos = Object.fromEntries(vistaDeTarea(t, SIN_TESTS, 0).campos.map(c => [c.k, c.v]))
    expect(campos.Contactos).toBe('6 contactos')
    expect(campos.Control).toBe('30 cm')
  })
})
