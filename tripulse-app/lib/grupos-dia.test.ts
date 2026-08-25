import { describe, it, expect } from 'vitest'
import { hojaDelDia, zonasDe, leFaltaElTest, hechasDe, detalleDeTarea } from './grupos-dia'
import type { ReferenciasDeUno } from './referencia-zona'

const MIEMBROS = [
  { id_deportista: 1, nombre: 'Ana' },
  { id_deportista: 2, nombre: 'Bea' },
  { id_deportista: 3, nombre: 'Caro' },
]

const refs = new Map<number, ReferenciasDeUno>([
  [1, { tests: { vam: 18, css: 1.4, ftp: 280 }, fcMax: 190, sistema: 2, nombre: 'Ana' }],
  [2, { tests: { vam: 15, css: 1.1, ftp: 210 }, fcMax: 185, sistema: 2, nombre: 'Bea' }],
  // Caro no tiene ningún test.
  [3, { tests: { vam: null, css: null, ftp: null }, fcMax: 180, sistema: 2, nombre: 'Caro' }],
])

const tarea = (orden: number, zona: string) => ({ orden, zona_entrenamiento: zona })

const sesion = (id: number, dep: number, extra: any = {}) => ({
  id, id_deportista: dep, id_emision: 'e1', disciplina: 'Carrera',
  estado: 'Planificada', fecha_sesion: '2026-08-25',
  tareas: [tarea(1, 'AER'), tarea(2, 'PAE'), tarea(3, 'AER')],
  ...extra,
})

describe('zonasDe', () => {
  it('en el orden de la prescripción y sin repetir', () => {
    expect(zonasDe([tarea(2, 'PAE'), tarea(1, 'AER'), tarea(3, 'AER')])).toEqual(['AER', 'PAE'])
  })

  it('sin tareas o sin zona, lista vacía', () => {
    expect(zonasDe([])).toEqual([])
    expect(zonasDe(null)).toEqual([])
    expect(zonasDe([{ orden: 1 }])).toEqual([])
  })
})

describe('leFaltaElTest', () => {
  it('mira el test que toca según el deporte', () => {
    const soloVam = { tests: { vam: 18, css: null, ftp: null }, fcMax: 0, sistema: 2, nombre: 'x' }
    expect(leFaltaElTest('Carrera', soloVam)).toBe(false)
    expect(leFaltaElTest('Natacion', soloVam)).toBe(true)
    expect(leFaltaElTest('Ciclismo', soloVam)).toBe(true)
  })

  it('«Natación» con tilde cuenta igual que sin ella', () => {
    const soloCss = { tests: { vam: null, css: 1.2, ftp: null }, fcMax: 0, sistema: 2, nombre: 'x' }
    expect(leFaltaElTest('Natación', soloCss)).toBe(false)
    expect(leFaltaElTest('Natacion', soloCss)).toBe(false)
  })

  it('a la fuerza no le falta ningún test: no se traduce a un ritmo', () => {
    const nada = { tests: { vam: null, css: null, ftp: null }, fcMax: 0, sistema: 2, nombre: 'x' }
    expect(leFaltaElTest('Fuerza', nada)).toBe(false)
  })

  it('sin referencias, le falta', () => {
    expect(leFaltaElTest('Carrera', undefined)).toBe(true)
  })
})

describe('hojaDelDia', () => {
  it('junta en UN bloque lo que salió de la misma emisión', () => {
    const h = hojaDelDia([sesion(10, 1), sesion(11, 2), sesion(12, 3)], MIEMBROS, refs)
    expect(h).toHaveLength(1)
    expect(h[0].esDelGrupo).toBe(true)
    expect(h[0].quien.map(q => q.nombre)).toEqual(['Ana', 'Bea', 'Caro'])
  })

  it('las tareas se enseñan UNA vez: es la misma prescripción repartida', () => {
    const h = hojaDelDia([sesion(10, 1), sesion(11, 2)], MIEMBROS, refs)
    expect(h[0].tareas).toHaveLength(3)
    expect(h[0].zonas).toEqual(['AER', 'PAE'])
  })

  it('CADA UNO con sus números, que es el sentido de la pantalla', () => {
    const h = hojaDelDia([sesion(10, 1), sesion(11, 2)], MIEMBROS, refs)
    const [ana, bea] = h[0].quien
    expect(ana.porZona[0].ritmo).toBeTruthy()
    expect(bea.porZona[0].ritmo).toBeTruthy()
    // Ana tiene VAM 18 y Bea 15: sus ritmos NO pueden coincidir.
    expect(ana.porZona[0].ritmo).not.toBe(bea.porZona[0].ritmo)
  })

  it('a quien no tiene test se le da el PORCENTAJE, no un ritmo inventado', () => {
    /* Sin VAM no se puede decir «5:08 /km», pero «< 65% VAM» sí es cierto y le
       sirve al atleta. Lo que no puede pasar es que salga un ritmo concreto
       sacado de la nada, o el de otro. */
    const h = hojaDelDia([sesion(12, 3)], MIEMBROS, refs)
    const caro = h[0].quien[0]
    expect(caro.sinTest).toBe(true)
    expect(caro.porZona.every(z => /%/.test(z.ritmo || ''))).toBe(true)
    expect(caro.porZona.every(z => !z.ritmo?.includes('/km'))).toBe(true)
  })

  it('con test SÍ sale un ritmo de verdad', () => {
    const h = hojaDelDia([sesion(10, 1)], MIEMBROS, refs)
    expect(h[0].quien[0].porZona.every(z => z.ritmo?.includes('/km'))).toBe(true)
  })

  it('lo que uno se añade por su cuenta va APARTE, no dentro de lo del grupo', () => {
    /* Agrupar por día juntaría cosas que no tienen nada que ver: si hoy toca
       serie y uno se ha metido una tirada larga suya, eso no es lo del grupo. */
    const suya = sesion(20, 2, { id_emision: null, disciplina: 'Ciclismo' })
    const h = hojaDelDia([sesion(10, 1), sesion(11, 2), suya], MIEMBROS, refs)
    expect(h).toHaveLength(2)
    expect(h[0].esDelGrupo).toBe(true)
    expect(h[1].esDelGrupo).toBe(false)
    expect(h[1].quien).toHaveLength(1)
    expect(h[1].quien[0].nombre).toBe('Bea')
  })

  it('dos emisiones el mismo día son dos bloques', () => {
    const otra = sesion(30, 1, { id_emision: 'e2', disciplina: 'Natacion' })
    const h = hojaDelDia([sesion(10, 1), otra], MIEMBROS, refs)
    expect(h).toHaveLength(2)
    expect(h.every(b => b.esDelGrupo)).toBe(true)
  })

  it('el orden de las filas es el del grupo, no el de la consulta', () => {
    const h = hojaDelDia([sesion(12, 3), sesion(10, 1), sesion(11, 2)], MIEMBROS, refs)
    expect(h[0].quien.map(q => q.nombre)).toEqual(['Ana', 'Bea', 'Caro'])
  })

  it('si a una copia le faltan las tareas, se cogen de otra en vez de decir que está vacía', () => {
    const sinTareas = sesion(10, 1, { tareas: [] })
    const h = hojaDelDia([sinTareas, sesion(11, 2)], MIEMBROS, refs)
    expect(h[0].tareas).toHaveLength(3)
  })

  it('sin sesiones, hoja vacía', () => {
    expect(hojaDelDia([], MIEMBROS, refs)).toEqual([])
  })
})

describe('hechasDe', () => {
  it('cuenta las realizadas del bloque', () => {
    const h = hojaDelDia([
      sesion(10, 1, { estado: 'Realizada' }),
      sesion(11, 2),
      sesion(12, 3, { estado: 'Realizada' }),
    ], MIEMBROS, refs)
    expect(hechasDe(h[0])).toEqual({ hechas: 2, total: 3 })
  })
})

describe('detalleDeTarea', () => {
  const c = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => ({ k, v }))

  it('series por valor cuando hay más de una', () => {
    expect(detalleDeTarea(c({ Series: '4', 'Por serie': '400 m', Total: '1,6 km' }))).toBe('4 × 400 m')
  })

  it('una sola serie no se anuncia', () => {
    expect(detalleDeTarea(c({ Series: '1', 'Por serie': '30 min' }))).toBe('30 min')
  })

  it('sin valor por serie, el total', () => {
    expect(detalleDeTarea(c({ Series: '1', 'Por serie': '—', Total: '10 km' }))).toBe('10 km')
  })

  it('sin nada de eso, se dice cuántas series y no un número suelto', () => {
    /* Antes salía «Recuperación 1»: el 1 era el número de series, sin etiqueta. */
    expect(detalleDeTarea(c({ Series: '3', 'Por serie': '—', Total: '—' }))).toBe('3 series')
    expect(detalleDeTarea(c({ Series: '1', 'Por serie': '—', Total: '—' }))).toBe('')
  })

  it('sin campos, vacío', () => {
    expect(detalleDeTarea(null)).toBe('')
  })
})
