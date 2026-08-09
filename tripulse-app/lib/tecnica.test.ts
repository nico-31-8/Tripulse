import { describe, it, expect } from 'vitest'
import { conTecnica, filtrarDrills, esDeTecnica } from './tecnica'

// Los datos reales: la biblioteca etiqueta «Natación» CON tilde (lo hace
// biblioteca-fase2-migracion.sql) y la disciplina de una tarea se guarda «Natacion»
// SIN ella. Este desajuste es el motivo de que el filtro normalice.
const LIB = [
  { id: 1, nombre: 'Sculling',    tipo: ['Técnica'],          disciplina: ['Natación'] },
  { id: 2, nombre: 'Nado palas',  tipo: ['Fuerza', 'Técnica'], disciplina: ['Natación'] },
  { id: 3, nombre: 'A-skip',      tipo: ['Fuerza', 'Técnica'], disciplina: ['Carrera'] },
  { id: 4, nombre: 'Box jump',    tipo: ['Fuerza'],           disciplina: ['Carrera'] },
  { id: 5, nombre: 'Pallof',      tipo: ['Fuerza'],           disciplina: ['Natación'] },
  { id: 6, nombre: 'Sin etiquetas', tipo: [],                 disciplina: [] },
]

describe('filtrarDrills', () => {
  it('«Natacion» sin tilde encuentra los de «Natación» con tilde', () => {
    expect(filtrarDrills(LIB, 'Natacion').map(e => e.nombre)).toEqual(['Sculling', 'Nado palas'])
  })

  it('deja fuera la fuerza pura aunque sea de la misma disciplina', () => {
    expect(filtrarDrills(LIB, 'Carrera').map(e => e.nombre)).toEqual(['A-skip'])
  })

  it('un ejercicio que es fuerza Y técnica cuenta como técnica', () => {
    expect(esDeTecnica(LIB[1])).toBe(true)
    expect(esDeTecnica(LIB[3])).toBe(false)
  })

  it('sin disciplina devuelve todos los de técnica', () => {
    expect(filtrarDrills(LIB, '')).toHaveLength(3)
  })

  it('aguanta etiquetas vacías y listas nulas sin reventar', () => {
    expect(filtrarDrills(LIB, 'Ciclismo')).toEqual([])
    expect(filtrarDrills(null as any, 'Carrera')).toEqual([])
    expect(esDeTecnica(null)).toBe(false)
  })

  // Si algún día alguien etiqueta «Tecnica» sin tilde a mano, tiene que seguir
  // saliendo. El desajuste no puede volverse invisible.
  it('encuentra la etiqueta escrita sin tilde', () => {
    const raro = [{ id: 9, nombre: 'Manual', tipo: ['Tecnica'], disciplina: ['Carrera'] }]
    expect(filtrarDrills(raro, 'Carrera')).toHaveLength(1)
  })
})

// Cliente de mentira que apunta qué se le ha pedido, para poder afirmar que NO se
// consulta cuando no hace falta.
function sbFalso(filas: any[]) {
  const llamadas: any[] = []
  return {
    llamadas,
    from(tabla: string) {
      return {
        select() {
          return {
            in(_col: string, ids: any[]) {
              llamadas.push({ tabla, ids })
              return Promise.resolve({ data: filas.filter(f => ids.map(String).includes(String(f.id))) })
            },
          }
        },
      }
    },
  }
}

const BIBLIOTECA = [
  { id: 7, nombre: 'Fist drill', descripcion: 'Propiocepción del antebrazo', ejecucion: '1) Puños cerrados.', url_video: null },
  { id: 9, nombre: 'A-skip', descripcion: 'Elevación de rodilla', ejecucion: null, url_video: 'http://v' },
]

describe('conTecnica', () => {
  it('no consulta nada si ninguna tarea lleva técnica', async () => {
    const sb = sbFalso(BIBLIOTECA)
    const tareas = [{ id: 1, zona_entrenamiento: 'AEM' }, { id: 2, zona_entrenamiento: 'PAE' }]
    const r = await conTecnica(tareas, sb)
    expect(sb.llamadas).toHaveLength(0)
    expect(r).toEqual(tareas)
  })

  it('trabaja con null sin reventar', async () => {
    const sb = sbFalso(BIBLIOTECA)
    expect(await conTecnica(null, sb)).toEqual([])
    expect(sb.llamadas).toHaveLength(0)
  })

  // Este es el caso de verdad: mientras la columna no exista, tecnica_id llega
  // undefined en TODAS las filas y esto tiene que comportarse como si nada.
  it('sin la columna todavía creada, se comporta igual que antes', async () => {
    const sb = sbFalso(BIBLIOTECA)
    const tareas = [{ id: 1, tecnica_id: undefined }]
    expect(await conTecnica(tareas, sb)).toEqual(tareas)
    expect(sb.llamadas).toHaveLength(0)
  })

  it('engancha el ejercicio a la tarea que lo lleva', async () => {
    const sb = sbFalso(BIBLIOTECA)
    const r = await conTecnica([
      { id: 1, tecnica_id: 7, zona_entrenamiento: 'AER' },
      { id: 2, zona_entrenamiento: 'AEM' },
    ], sb)
    expect(r[0].tecnica.nombre).toBe('Fist drill')
    expect(r[0].zona_entrenamiento).toBe('AER')   // la zona real no se toca
    expect(r[1].tecnica).toBeUndefined()
  })

  it('pide cada id una sola vez aunque se repita', async () => {
    const sb = sbFalso(BIBLIOTECA)
    await conTecnica([{ id: 1, tecnica_id: 7 }, { id: 2, tecnica_id: 7 }, { id: 3, tecnica_id: 9 }], sb)
    expect(sb.llamadas).toHaveLength(1)
    expect(sb.llamadas[0].ids).toEqual([7, 9])
  })

  it('compara ids como texto: un 7 y un "7" son el mismo ejercicio', async () => {
    const sb = sbFalso(BIBLIOTECA)
    const r = await conTecnica([{ id: 1, tecnica_id: '7' }], sb)
    expect(r[0].tecnica?.nombre).toBe('Fist drill')
  })

  // Si el ejercicio se borró de la biblioteca, la tarea sigue existiendo. Debe
  // quedarse sin nombre, no romper la pantalla entera.
  it('un ejercicio que ya no está deja la técnica en null, no revienta', async () => {
    const sb = sbFalso(BIBLIOTECA)
    const r = await conTecnica([{ id: 1, tecnica_id: 999 }], sb)
    expect(r[0].tecnica).toBeNull()
  })
})
