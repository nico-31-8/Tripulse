import { describe, it, expect } from 'vitest'
import { intensidadGuardada, queEnsenar, aGuardar, intensidadesPorSesion, queSeMide, intensidadSinSitio } from './intensidad-prescrita'

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

describe('cómo se titula lo que se enseña', () => {
  it('lo pregunta al valor, no a la disciplina: pulso prescrito en carrera es PULSO', () => {
    // El fallo original: la caja se titulaba «Ritmo objetivo» y dentro ponía
    // «140-150 ppm», con un «Ritmo real» al lado pidiendo un ritmo.
    expect(queSeMide('140-150 ppm', 'Carrera')).toBe('Pulso')
    expect(queSeMide('130-145 ppm', 'Ciclismo')).toBe('Pulso')
  })

  it('reconoce las formas de escribir el pulso', () => {
    expect(queSeMide('148 bpm', 'Carrera')).toBe('Pulso')
    expect(queSeMide('pulsaciones 140-150', 'Carrera')).toBe('Pulso')
    expect(queSeMide('FC 140-150', 'Carrera')).toBe('Pulso')
  })

  it('vatios', () => {
    expect(queSeMide('180-220 W', 'Ciclismo')).toBe('Potencia')
    expect(queSeMide('200 vatios', 'Ciclismo')).toBe('Potencia')
  })

  it('ritmo, con la unidad que sea', () => {
    expect(queSeMide('4:30 /km', 'Carrera')).toBe('Ritmo')
    expect(queSeMide('1:38 /100m', 'Natacion')).toBe('Ritmo')
    expect(queSeMide('68 /400m', 'Carrera')).toBe('Ritmo')
    expect(queSeMide('ritmo de 10K', 'Carrera')).toBe('Ritmo')
  })

  it('RPE es esfuerzo, no ritmo', () => {
    expect(queSeMide('RPE 6-7', 'Carrera')).toBe('Esfuerzo')
  })

  it('un porcentaje no es ninguna de las anteriores: es intensidad', () => {
    // «95–105% VAM» no es un ritmo: es un porcentaje de uno.
    expect(queSeMide('95–105% VAM', 'Carrera')).toBe('Intensidad')
    expect(queSeMide('88-94% FTP', 'Ciclismo')).toBe('Intensidad')
  })

  it('sin nada escrito manda la disciplina: eso que se enseña es el cálculo de sus tests', () => {
    expect(queSeMide('', 'Carrera')).toBe('Ritmo')
    expect(queSeMide(null, 'Ciclismo')).toBe('Potencia')
    expect(queSeMide(null, 'Natación')).toBe('Ritmo')
    expect(queSeMide(null, 'Brick')).toBe('Intensidad')
    expect(queSeMide(null, null)).toBe('Intensidad')
  })

  it('texto libre que no dice la unidad cae en la disciplina, no en un rótulo inventado', () => {
    expect(queSeMide('los 400 fuertes', 'Carrera')).toBe('Ritmo')
  })
})

describe('la forma en que llega la medición', () => {
  it('lista, que es como la piden casi todas las pantallas', () => {
    expect(intensidadGuardada({ p_distancia: [{ ritmo_objetivo: '4:30 /km' }] })).toBe('4:30 /km')
  })

  it('objeto suelto: PostgREST devuelve una cosa u otra según vea la relación', () => {
    // Con `[0]` a secas esto daba undefined y la tarea se quedaba sin
    // intensidad sin que nada fallara.
    expect(intensidadGuardada({ p_distancia: { ritmo_objetivo: '140-150 ppm' } })).toBe('140-150 ppm')
    expect(intensidadGuardada({ p_duracion: { ritmo_objetivo: '180-220 W' } })).toBe('180-220 W')
  })

  it('lista vacía o relación ausente no revientan', () => {
    expect(intensidadGuardada({ p_distancia: [], p_duracion: [] })).toBeNull()
    expect(intensidadGuardada({})).toBeNull()
    expect(intensidadGuardada(null)).toBeNull()
  })

  it('un bloque por tiempo cuenta igual que uno por distancia', () => {
    expect(intensidadGuardada({ p_distancia: [], p_duracion: [{ ritmo_objetivo: '130-145 ppm' }] }))
      .toBe('130-145 ppm')
  })
})

describe('cuando lo escrito no tiene dónde guardarse', () => {
  it('en distancia y en tiempo cabe: no hay aviso', () => {
    expect(intensidadSinSitio('p_distancia', '4:30 /km')).toBeNull()
    expect(intensidadSinSitio('p_duracion', '140-150 ppm')).toBeNull()
  })

  it('en repeticiones NO cabe, y se dice en vez de tragárselo', () => {
    const a = intensidadSinSitio('p_repeticiones', '140-150 ppm')
    expect(a).toBeTruthy()
    expect(a).toContain('repeticiones')
  })

  it('sin unidad todavía tampoco, y el aviso dice qué hacer', () => {
    const a = intensidadSinSitio(null, '140-150 ppm')
    expect(a).toContain('unidad')
  })

  it('sin nada escrito no molesta: el aviso es por lo tecleado, no por la unidad', () => {
    expect(intensidadSinSitio('p_repeticiones', '')).toBeNull()
    expect(intensidadSinSitio(null, null)).toBeNull()
    expect(intensidadSinSitio(null, '   ')).toBeNull()
  })
})
