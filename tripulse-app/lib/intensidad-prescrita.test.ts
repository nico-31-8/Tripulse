import { describe, it, expect } from 'vitest'
import { intensidadGuardada, queEnsenar, aGuardar, intensidadesPorSesion } from './intensidad-prescrita'

/* Mismo apaño que en duracion-carga.test: como supabase llega por parámetro,
   la función se puede probar entera sin conexión. `order` está porque la
   consulta de tareas la usa. */
function fakeSupabase(tablas: Record<string, any[]>) {
  return {
    from(tabla: string) {
      let filas = [...(tablas[tabla] ?? [])]
      const q: any = {
        select: () => q,
        in: (col: string, vals: any[]) => { filas = filas.filter(f => vals.includes(f[col])); return q },
        order: (col: string) => { filas.sort((a, b) => (a[col] ?? 0) - (b[col] ?? 0)); return q },
        then: (resolve: any) => resolve({ data: filas, error: null }),
      }
      return q
    },
  }
}

describe('intensidadGuardada', () => {
  it('la lee de un bloque por metros', () => {
    expect(intensidadGuardada({ p_distancia: [{ ritmo_objetivo: '4:00 /km' }] })).toBe('4:00 /km')
  })

  it('y también de uno por tiempo, que es lo que se perdía', () => {
    expect(intensidadGuardada({ p_duracion: [{ ritmo_objetivo: '95–105% VAM' }] })).toBe('95–105% VAM')
  })

  it('null cuando no hay nada', () => {
    expect(intensidadGuardada({ p_distancia: [{ metros_planeados: 5000 }] })).toBeNull()
    expect(intensidadGuardada({})).toBeNull()
    expect(intensidadGuardada(null)).toBeNull()
  })

  it('una cadena en blanco no cuenta como intensidad', () => {
    expect(intensidadGuardada({ p_distancia: [{ ritmo_objetivo: '   ' }] })).toBeNull()
  })
})

describe('queEnsenar', () => {
  it('lo escrito manda, y el cálculo baja a gris', () => {
    expect(queEnsenar('95–105% VAM', '4:12 /km')).toEqual({ principal: '95–105% VAM', gris: '4:12 /km' })
  })

  it('sin nada escrito, lo calculado ES la prescripción y no se enseña dos veces', () => {
    expect(queEnsenar('', '4:12 /km')).toEqual({ principal: '4:12 /km', gris: null })
    expect(queEnsenar(null, '4:12 /km')).toEqual({ principal: '4:12 /km', gris: null })
  })

  it('si coinciden, el gris sobra', () => {
    expect(queEnsenar('4:12 /km', '4:12 /km')).toEqual({ principal: '4:12 /km', gris: null })
  })

  /* Este es el que arregla lo que pedía el entrenador: prescribir a mano
     AUNQUE el atleta tenga el test hecho. Antes, escribir lo mismo que proponía
     la app se interpretaba como «no ha escrito nada» y desaparecía al recargar. */
  it('escribir a propósito el valor sugerido se respeta', () => {
    expect(queEnsenar('4:12 /km', '4:12 /km').principal).toBe('4:12 /km')
  })

  it('con algo escrito y sin tests, no hay gris', () => {
    expect(queEnsenar('4:30 /km', null)).toEqual({ principal: '4:30 /km', gris: null })
    expect(queEnsenar('4:30 /km', '')).toEqual({ principal: '4:30 /km', gris: null })
  })

  it('sin nada de nada, no se pinta nada', () => {
    expect(queEnsenar(null, null)).toEqual({ principal: null, gris: null })
    expect(queEnsenar('  ', '  ')).toEqual({ principal: null, gris: null })
  })

  it('los espacios de los lados no hacen que dos iguales parezcan distintos', () => {
    expect(queEnsenar(' 4:12 /km ', '4:12 /km').gris).toBeNull()
  })
})

describe('aGuardar', () => {
  /* La regla entera: si el entrenador no escribe, NO se guarda la sugerencia.
     Guardarla es lo que hacía imposible distinguir después quién dijo qué. */
  it('guarda lo escrito', () => {
    expect(aGuardar('4:30 /km')).toBe('4:30 /km')
  })

  it('null cuando no se escribió nada', () => {
    expect(aGuardar('')).toBeNull()
    expect(aGuardar('   ')).toBeNull()
    expect(aGuardar(null)).toBeNull()
    expect(aGuardar(undefined)).toBeNull()
  })

  it('recorta los espacios de los lados', () => {
    expect(aGuardar('  180–220 W  ')).toBe('180–220 W')
  })
})

describe('intensidadesPorSesion', () => {
  const base = {
    tarea: [
      { id: 1, id_sesion: 10, orden: 1 },
      { id: 2, id_sesion: 10, orden: 2 },
      { id: 3, id_sesion: 20, orden: 1 },
    ],
    p_distancia: [{ id_tarea: 1, ritmo_objetivo: '4:00 /km' }],
    p_duracion: [{ id_tarea: 2, ritmo_objetivo: '95–105% VAM' }],
  }

  it('junta las de cada sesión, vengan de la tabla que vengan', async () => {
    const out = await intensidadesPorSesion(fakeSupabase(base), [10, 20])
    expect(out[10]).toEqual(['4:00 /km', '95–105% VAM'])
  })

  it('respeta el orden de los bloques', async () => {
    const out = await intensidadesPorSesion(fakeSupabase({
      ...base,
      tarea: [{ id: 2, id_sesion: 10, orden: 2 }, { id: 1, id_sesion: 10, orden: 1 }],
    }), [10])
    expect(out[10]).toEqual(['4:00 /km', '95–105% VAM'])
  })

  it('una sesión sin ninguna intensidad no aparece en el mapa', async () => {
    const out = await intensidadesPorSesion(fakeSupabase(base), [10, 20])
    expect(out[20]).toBeUndefined()
  })

  it('sin sesiones no consulta nada', async () => {
    expect(await intensidadesPorSesion(fakeSupabase(base), [])).toEqual({})
  })

  it('sin tareas devuelve vacío', async () => {
    expect(await intensidadesPorSesion(fakeSupabase({ tarea: [] }), [10])).toEqual({})
  })

  it('las cadenas en blanco no cuentan', async () => {
    const out = await intensidadesPorSesion(fakeSupabase({
      tarea: [{ id: 1, id_sesion: 10, orden: 1 }],
      p_distancia: [{ id_tarea: 1, ritmo_objetivo: '  ' }],
    }), [10])
    expect(out).toEqual({})
  })
})
