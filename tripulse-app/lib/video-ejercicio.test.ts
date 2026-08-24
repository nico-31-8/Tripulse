import { describe, it, expect } from 'vitest'
import { idsDeBiblioteca, conVideosResueltos, conVideos, conVideosEnTareas } from './video-ejercicio'

const BIBLIOTECA = [
  { id: 7, url_video: 'https://v/sentadilla' },
  { id: 9, url_video: null },
  { id: 22, url_video: 'https://v/press' },
]

/* Un supabase de mentira que filtra de verdad: si el `in` no se usara bien, el
   test pasaría igual con uno que devuelve siempre todo. */
const sbFalso = () => ({
  from: (tabla: string) => {
    if (tabla !== 'ejercicios_biblioteca') throw new Error('tabla inesperada: ' + tabla)
    return {
      select: () => ({
        in: (col: string, ids: string[]) => {
          if (col !== 'id') throw new Error('columna inesperada: ' + col)
          return { data: BIBLIOTECA.filter(b => ids.includes(String(b.id))) }
        },
      }),
    }
  },
})

describe('idsDeBiblioteca', () => {
  it('junta el del ejercicio y el del encadenado, sin repetir', () => {
    expect(idsDeBiblioteca([
      { ejercicio_id: 7, ejercicio_encadenado_id: 22 },
      { ejercicio_id: 7 },
      { ejercicio_encadenado_id: 22 },
    ])).toEqual(['7', '22'])
  })

  it('sin ids, lista vacía (y entonces no se consulta nada)', () => {
    expect(idsDeBiblioteca([{ url_video: 'https://v/x' }])).toEqual([])
    expect(idsDeBiblioteca([])).toEqual([])
    expect(idsDeBiblioteca(null)).toEqual([])
  })
})

describe('conVideosResueltos', () => {
  const porId = new Map<string, string | null>([['7', 'https://v/sentadilla'], ['9', null], ['22', 'https://v/press']])

  it('el vídeo sale de la BIBLIOTECA, no de la copia guardada', () => {
    const [f] = conVideosResueltos([{ ejercicio_id: 7, url_video: 'https://v/VIEJO' }], porId)
    expect(f.video).toBe('https://v/sentadilla')
  })

  it('resuelve también el del encadenado, que antes no se enseñaba nunca', () => {
    const [f] = conVideosResueltos([{ ejercicio_id: 7, ejercicio_encadenado_id: 22 }], porId)
    expect(f.videoEncadenado).toBe('https://v/press')
  })

  it('el id puede llegar como texto: se compara como texto', () => {
    const [f] = conVideosResueltos([{ ejercicio_id: '7' }], porId)
    expect(f.video).toBe('https://v/sentadilla')
  })

  it('una fila vieja sin id se queda con su copia: el arreglo no le quita nada a nadie', () => {
    const [f] = conVideosResueltos([{ url_video: 'https://v/copia' }], porId)
    expect(f.video).toBe('https://v/copia')
  })

  it('si la biblioteca dice que ese ejercicio no tiene vídeo, no se rescata la copia vieja', () => {
    /* Es a propósito: si el entrenador BORRA una URL mal pegada, la copia no
       puede resucitarla. Vaciarla es la otra mitad de poder editarla. */
    const [f] = conVideosResueltos([{ ejercicio_id: 9, url_video: 'https://v/mal-pegada' }], porId)
    expect(f.video).toBeNull()
  })

  it('un id que ya no está en la biblioteca cae a la copia', () => {
    const [f] = conVideosResueltos([{ ejercicio_id: 999, url_video: 'https://v/copia' }], porId)
    expect(f.video).toBe('https://v/copia')
  })

  it('sin nada, null y no undefined', () => {
    const [f] = conVideosResueltos([{}], porId)
    expect(f.video).toBeNull()
    expect(f.videoEncadenado).toBeNull()
  })
})

describe('conVideos contra la base', () => {
  it('una sola consulta y cada fila con lo suyo', async () => {
    const filas = await conVideos([
      { ejercicio_id: 7, url_video: 'https://v/VIEJO' },
      { ejercicio_id: 22, ejercicio_encadenado_id: 7 },
      { ejercicio_id: 9 },
    ], sbFalso())
    expect(filas[0].video).toBe('https://v/sentadilla')
    expect(filas[1].video).toBe('https://v/press')
    expect(filas[1].videoEncadenado).toBe('https://v/sentadilla')
    expect(filas[2].video).toBeNull()
  })

  it('sin ids no toca la base', async () => {
    /* Si consultara, el supabase de mentira explotaría al no recibir `in`. */
    const filas = await conVideos([{ url_video: 'https://v/copia' }], null)
    expect(filas[0].video).toBe('https://v/copia')
  })
})

describe('conVideosEnTareas', () => {
  it('cada ejercicio se resuelve dentro de SU tarea', async () => {
    const tareas = await conVideosEnTareas([
      { id: 1, ejercicios: [{ ejercicio_id: 7 }] },
      { id: 2, ejercicios: [{ ejercicio_id: 22 }, { ejercicio_id: 9 }] },
      { id: 3, ejercicios: [] },
      { id: 4 },
    ], sbFalso())

    expect(tareas[0].ejercicios[0].video).toBe('https://v/sentadilla')
    expect(tareas[1].ejercicios[0].video).toBe('https://v/press')
    expect(tareas[1].ejercicios[1].video).toBeNull()
    expect(tareas[2].ejercicios).toEqual([])
    expect(tareas[3].id).toBe(4)
  })

  it('no reordena ni pierde tareas', async () => {
    const tareas = await conVideosEnTareas([
      { id: 10, ejercicios: [{ ejercicio_id: 7, nombre: 'Sentadilla' }] },
      { id: 11, ejercicios: [{ ejercicio_id: 22, nombre: 'Press' }] },
    ], sbFalso())
    expect(tareas.map((t: any) => t.id)).toEqual([10, 11])
    expect(tareas.map((t: any) => t.ejercicios[0].nombre)).toEqual(['Sentadilla', 'Press'])
  })

  it('sin ejercicios con id, devuelve las tareas tal cual', async () => {
    const original = [{ id: 1, ejercicios: [{ url_video: 'https://v/copia' }] }]
    const tareas = await conVideosEnTareas(original, null)
    expect(tareas).toBe(original)
  })
})
