import { describe, it, expect } from 'vitest'
import { queFaltaAlBrick, brickValido, guardarBrick, ERROR_MIGRACION, type BrickValor } from './bricks'

// ============================================================
// Qué le falta al brick, dicho una sola vez
// ============================================================
// La frase estaba escrita a mano en SEIS sitios —el constructor y los cinco
// modales que lo llevan dentro— y decía solo la mitad: «un brick necesita al
// menos dos bloques con duración». Con dos bloques y uno sin minutos, el aviso
// hablaba de BLOQUES cuando lo que faltaba eran los MINUTOS, y el entrenador se
// quedaba mirando el bloque que sí los tenía.
describe('queFaltaAlBrick', () => {
  const bloque = (disciplina: string, minutos: number) => ({ disciplina, minutos, zona: 'AER' } as any)
  const brick = (...bloques: any[]) => ({ bloques, transiciones: [] } as unknown as BrickValor)

  it('con un solo bloque pide otra disciplina', () => {
    expect(queFaltaAlBrick(brick(bloque('Ciclismo', 40)))).toMatch(/otra disciplina/)
    expect(queFaltaAlBrick(brick())).toMatch(/otra disciplina/)
  })

  it('con dos bloques y uno sin minutos habla de MINUTOS, no de bloques', () => {
    const falta = queFaltaAlBrick(brick(bloque('Ciclismo', 40), bloque('Carrera', 0))) || ''
    expect(falta).toMatch(/minutos/)
    expect(falta).not.toMatch(/disciplina/)
  })

  it('dice cuántos están sin minutos cuando es más de uno', () => {
    expect(queFaltaAlBrick(brick(bloque('Ciclismo', 0), bloque('Carrera', 0)))).toMatch(/2 bloques/)
  })

  it('un brick completo no le falta nada', () => {
    expect(queFaltaAlBrick(brick(bloque('Ciclismo', 40), bloque('Carrera', 20)))).toBeNull()
  })

  /* La única verdad: si `brickValido` y `queFaltaAlBrick` discreparan, el
     constructor enseñaría un aviso con el guardar activo, o al revés. */
  it('brickValido dice exactamente lo mismo', () => {
    const casos = [
      brick(),
      brick(bloque('Ciclismo', 40)),
      brick(bloque('Ciclismo', 40), bloque('Carrera', 0)),
      brick(bloque('Ciclismo', 40), bloque('Carrera', 20)),
      brick(bloque('', 40), bloque('Carrera', 20)),
    ]
    for (const c of casos) expect(brickValido(c)).toBe(queFaltaAlBrick(c) === null)
  })

  it('no revienta con un valor a medio hacer', () => {
    expect(queFaltaAlBrick({} as BrickValor)).toMatch(/otra disciplina/)
    expect(brickValido({} as BrickValor)).toBe(false)
  })
})

// ============================================================
// Guardar el brick: tres esperas, y sin duplicar si no puede borrar
// ============================================================
/* Un supabase de mentira que apunta qué se le pide y en qué orden. Las tareas
   insertadas reciben ids desde 900 en el orden en que se mandan. */
function falso(op: { errorBorrar?: string; errorSesion?: any; alReves?: boolean } = {}) {
  const llamadas: string[] = []
  const escrito: Record<string, any> = {}
  let id = 900
  const sb = {
    from(tabla: string) {
      return {
        select() { llamadas.push(tabla + ':select'); return this },
        delete() {
          llamadas.push(tabla + ':delete')
          const r = { error: tabla === 'tarea' && op.errorBorrar ? { message: op.errorBorrar } : null }
          return { eq: () => Promise.resolve(r), in: () => Promise.resolve(r) }
        },
        insert(filas: any[]) {
          llamadas.push(tabla + ':insert')
          escrito[tabla] = filas
          const creadas = filas.map(f => ({ ...f, id: id++ }))
          const r = { data: op.alReves ? [...creadas].reverse() : creadas, error: null }
          return { select: () => Promise.resolve(r), then: (ok: any, ko: any) => Promise.resolve({ error: null }).then(ok, ko) }
        },
        update(valores: any) {
          llamadas.push(tabla + ':update')
          escrito[tabla] = valores
          return { eq: () => Promise.resolve({ error: op.errorSesion || null }) }
        },
      }
    },
  }
  return { sb, llamadas, escrito }
}

describe('guardarBrick', () => {
  const v = {
    bloques: [
      { disciplina: 'Ciclismo', zona: 'AER', minutos: 40 },
      { disciplina: 'Carrera', zona: 'UAN', minutos: 15 },
    ],
    transiciones: [{ despues_de: 1, segundos: 90 }],
  } as BrickValor

  /* El tiempo de la tarea se borra con ella (cascada en la base): pedir antes
     los ids y borrarlo aparte eran dos esperas que no hacían nada. */
  it('borra las tareas de la sesión sin pedir antes sus ids ni borrar su tiempo aparte', async () => {
    const { sb, llamadas, escrito } = falso()
    expect(await guardarBrick(sb, 7, v)).toBeNull()
    expect(llamadas[0]).toBe('tarea:delete')
    expect(llamadas).not.toContain('p_duracion:delete')
    expect(llamadas.filter(l => l === 'tarea:insert')).toHaveLength(1)
    expect(escrito.tarea.map((t: any) => [t.disciplina, t.orden])).toEqual([['Ciclismo', 1], ['Carrera', 2]])
    expect(escrito.sesion).toEqual({ transiciones: v.transiciones })
  })

  it('cada bloque se lleva SU tiempo aunque las tareas vuelvan en otro orden', async () => {
    const { sb, escrito } = falso({ alReves: true })
    await guardarBrick(sb, 7, v)
    expect(escrito.p_duracion).toEqual(expect.arrayContaining([
      { id_tarea: 900, tiempo_planeado: 2400 },
      { id_tarea: 901, tiempo_planeado: 900 },
    ]))
    expect(escrito.p_duracion).toHaveLength(2)
  })

  it('si no puede borrar las viejas no escribe nada (antes las duplicaba)', async () => {
    const { sb, llamadas } = falso({ errorBorrar: 'violates foreign key constraint' })
    expect(await guardarBrick(sb, 7, v)).toMatch(/foreign key/)
    expect(llamadas).toEqual(['tarea:delete'])
  })

  it('una sesión recién creada no tiene nada que borrar: ni lo intenta', async () => {
    const { sb, llamadas } = falso()
    expect(await guardarBrick(sb, 7, v, { recienCreada: true })).toBeNull()
    expect(llamadas).not.toContain('tarea:delete')
    expect(llamadas[0]).toBe('tarea:insert')
  })

  it('sin la columna de transiciones lo dice con la migración que falta', async () => {
    const { sb } = falso({ errorSesion: { message: 'column sesion.transiciones does not exist', code: '42703' } })
    expect(await guardarBrick(sb, 7, v)).toBe(ERROR_MIGRACION)
  })
})
