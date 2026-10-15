import { describe, it, expect, vi } from 'vitest'
import { insertarMedicion } from './insertar-medicion'

/* Cliente que apunta cada insert y puede rechazar los que llevan intensidad. */
function sbFalso(o: { rechazaIntensidad?: boolean; rechazaTodo?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = []
  return {
    inserts,
    from: () => ({
      insert: async (fila: Record<string, unknown>) => {
        inserts.push(fila)
        if (o.rechazaTodo) return { error: { message: 'RLS' } }
        if (o.rechazaIntensidad && 'ritmo_objetivo' in fila) return { error: { message: 'invalid input syntax for type numeric' } }
        return { error: null }
      },
    }),
  }
}

describe('insertarMedicion', () => {
  it('con intensidad, UNA sola escritura que la lleva dentro', async () => {
    const sb = sbFalso()
    expect(await insertarMedicion(sb, 'p_distancia', { id_tarea: 1, metros_planeados: 400 }, '3:50 /km')).toBeNull()
    expect(sb.inserts).toEqual([{ id_tarea: 1, metros_planeados: 400, ritmo_objetivo: '3:50 /km' }])
  })

  it('sin intensidad, la fila tal cual', async () => {
    const sb = sbFalso()
    await insertarMedicion(sb, 'p_duracion', { id_tarea: 1, tiempo_planeado: 600 }, null)
    expect(sb.inserts).toEqual([{ id_tarea: 1, tiempo_planeado: 600 }])
  })

  /* LA GARANTÍA DE SIEMPRE: lo accesorio no se lleva por delante el tiempo. */
  it('si con la intensidad falla, se guarda igual sin ella', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sb = sbFalso({ rechazaIntensidad: true })
    expect(await insertarMedicion(sb, 'p_duracion', { id_tarea: 1, tiempo_planeado: 600 }, '140-150 ppm')).toBeNull()
    expect(sb.inserts.at(-1)).toEqual({ id_tarea: 1, tiempo_planeado: 600 })
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('si falla también sin ella, devuelve el error', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await insertarMedicion(sbFalso({ rechazaTodo: true }), 'p_distancia', { id_tarea: 1 }, 'x')).toEqual({ message: 'RLS' })
    aviso.mockRestore()
  })
})
