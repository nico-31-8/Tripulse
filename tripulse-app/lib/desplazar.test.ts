import { describe, it, expect } from 'vitest'
import {
  sumarDias, diasEntre, finDeCiclo, microsAfectados, previsualizar,
  previsualizarDuracion, aplicarDuracion, aplicarDesplazamiento,
  type CicloFila, type SesionFila,
} from './desplazar'

// Un plan de juguete: 1 macro → 2 mesos → 4 micros, arrancando en jueves
// (que es justo el error del que nace esta función: empezar el 13 en vez del 17).
const macros: CicloFila[] = [{ id: 1, fecha_inicio: '2026-08-13', duracion_semanas: 4, objetivo: 'Base' }]
const mesos: CicloFila[] = [
  { id: 10, id_macrociclo: 1, fecha_inicio: '2026-08-13', duracion_semanas: 2, objetivo: 'Acumulación' },
  { id: 11, id_macrociclo: 1, fecha_inicio: '2026-08-27', duracion_semanas: 2, objetivo: 'Transformación' },
]
const micros: CicloFila[] = [
  { id: 100, id_mesociclo: 10, fecha_inicio: '2026-08-13' },
  { id: 101, id_mesociclo: 10, fecha_inicio: '2026-08-20' },
  { id: 102, id_mesociclo: 11, fecha_inicio: '2026-08-27' },
  { id: 103, id_mesociclo: 11, fecha_inicio: '2026-09-03' },
]
const sesiones: SesionFila[] = [
  { id: 1000, id_microciclo: 100, fecha_sesion: '2026-08-13', estado: 'Realizada' },
  { id: 1001, id_microciclo: 100, fecha_sesion: '2026-08-14' },
  { id: 1002, id_microciclo: 101, fecha_sesion: '2026-08-21' },
  { id: 1003, id_microciclo: 102, fecha_sesion: '2026-08-28' },
  { id: 1004, id_microciclo: null, fecha_sesion: '2026-08-14' },   // libre: no es del plan
]
const competiciones = [{ id: 1, nombre: 'Media de Gijón', fecha: '2026-09-20' }]

const base = { macros, mesos, micros, sesiones, competiciones }

describe('aritmética de fechas', () => {
  it('suma y resta sin saltar de día', () => {
    expect(sumarDias('2026-08-13', 4)).toBe('2026-08-17')
    expect(sumarDias('2026-08-17', -4)).toBe('2026-08-13')
    expect(sumarDias('2026-02-27', 2)).toBe('2026-03-01')  // año no bisiesto
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('cuenta los días entre dos fechas, con signo', () => {
    expect(diasEntre('2026-08-13', '2026-08-17')).toBe(4)
    expect(diasEntre('2026-08-17', '2026-08-13')).toBe(-4)
    expect(diasEntre('2026-08-13', '2026-08-13')).toBe(0)
  })

  it('tolera fechas con hora pegada detrás', () => {
    // `competicion.fecha` llega a veces como timestamp: por eso el .slice(0,10).
    expect(diasEntre('2026-08-13T00:00:00+02:00', '2026-08-17')).toBe(4)
  })

  it('el fin de un microciclo es una semana; el de un meso, las suyas', () => {
    expect(finDeCiclo({ id: 1, fecha_inicio: '2026-08-13' }, 'microciclo')).toBe('2026-08-20')
    expect(finDeCiclo({ id: 1, fecha_inicio: '2026-08-13', duracion_semanas: 2 }, 'mesociclo')).toBe('2026-08-27')
  })
})

describe('qué arrastra cada nivel', () => {
  it('un microciclo, solo el suyo', () => {
    expect(microsAfectados('microciclo', 100, mesos, micros)).toEqual([100])
  })
  it('un mesociclo, los de dentro', () => {
    expect(microsAfectados('mesociclo', 10, mesos, micros)).toEqual([100, 101])
  })
  it('el macrociclo, todos', () => {
    expect(microsAfectados('macrociclo', 1, mesos, micros)).toEqual([100, 101, 102, 103])
  })
})

describe('mover todo el plan cuatro días (el caso real)', () => {
  const p = previsualizar({ ...base, nivel: 'macrociclo', id: 1, nuevaFecha: '2026-08-17' })

  it('calcula el salto', () => {
    expect(p.dias).toBe(4)
    expect(p.de).toBe('2026-08-13')
    expect(p.a).toBe('2026-08-17')
    expect(p.vacio).toBe(false)
  })

  it('mueve las cuatro semanas y los dos mesos', () => {
    expect(p.micros).toBe(4)
    expect(p.mesos).toBe(2)
  })

  /* La realizada se queda: el atleta entrenó ese día. La libre ni se toca,
     porque no cuelga de ningún microciclo. */
  it('deja fuera la realizada y la sesión libre', () => {
    expect(p.sesiones.map(s => s.id)).toEqual([1001, 1002, 1003])
    expect(p.hechas.map(s => s.id)).toEqual([1000])
  })

  it('avisa de la realizada que se queda descolgada', () => {
    expect(p.avisos.join(' ')).toMatch(/1 sesión ya realizada se queda/)
  })
})

describe('lo que de verdad hay que ver antes de confirmar', () => {
  /* La competición no se mueve con el plan. Atrasar cuatro días es perder
     cuatro días de preparación, y eso no se descubre en noviembre. */
  it('la competición no se mueve, y se dice cuánto margen se pierde', () => {
    const p = previsualizar({ ...base, nivel: 'macrociclo', id: 1, nuevaFecha: '2026-08-17' })
    const c = p.competiciones[0]
    expect(c.nombre).toBe('Media de Gijón')
    expect(c.margenAntes).toBe(diasEntre('2026-09-10', '2026-09-20'))   // 4 semanas desde el 13
    expect(c.margenDespues).toBe(c.margenAntes - 4)
    expect(p.avisos.join(' ')).toMatch(/pierdes 4 días de preparación/)
  })

  it('adelantar el plan no dice que pierdas preparación', () => {
    const p = previsualizar({ ...base, nivel: 'macrociclo', id: 1, nuevaFecha: '2026-08-10' })
    expect(p.dias).toBe(-3)
    expect(p.avisos.join(' ')).not.toMatch(/pierdes/)
    expect(p.competiciones[0].margenDespues).toBeGreaterThan(p.competiciones[0].margenAntes)
  })

  it('las competiciones anteriores al ciclo no se listan', () => {
    const p = previsualizar({
      ...base, nivel: 'macrociclo', id: 1, nuevaFecha: '2026-08-17',
      competiciones: [{ id: 9, nombre: 'Ya pasó', fecha: '2026-07-01' }],
    })
    expect(p.competiciones).toEqual([])
  })

  it('mover un mesociclo del medio avisa del hueco y del solape', () => {
    const p = previsualizar({ ...base, nivel: 'mesociclo', id: 10, nuevaFecha: '2026-08-20' })
    const txt = p.avisos.join(' ')
    expect(txt).toMatch(/Se solapará con «Transformación»/)
    expect(txt).toMatch(/Dejará 7 días sin plan/)
  })

  it('avisa si la nueva fecha ya pasó', () => {
    const p = previsualizar({ ...base, nivel: 'macrociclo', id: 1, nuevaFecha: '2026-08-01', hoy: '2026-08-15' })
    expect(p.avisos.join(' ')).toMatch(/anterior a hoy/)
  })
})

describe('cambiar la duración de un mesociclo', () => {
  const dur = (p: Partial<Parameters<typeof previsualizarDuracion>[0]> = {}) =>
    previsualizarDuracion({ id: 10, semanas: 1, arrastrar: true, sobrante: 'liberar', mesos, micros, sesiones, ...p })

  it('acortar de 2 a 1 saca la segunda semana con lo que tenga dentro', () => {
    const p = dur({ semanas: 1 })
    expect(p.delta).toBe(-1)
    expect(p.fuera.map(f => f.fecha_inicio)).toEqual(['2026-08-20'])
    expect(p.sesionesFuera.map(s => s.id)).toEqual([1002])
    expect(p.avisos.join(' ')).toMatch(/1 semana sale del mesociclo, con 1 sesión dentro/)
  })

  /* La razón por la que «liberar» es la opción por defecto: a la papelera, la
     carga de esa semana desaparece de las gráficas sin explicación. */
  it('avisa si mandarías a la papelera algo ya realizado', () => {
    const p = previsualizarDuracion({
      id: 10, semanas: 1, arrastrar: true, sobrante: 'papelera', mesos, micros,
      sesiones: [{ id: 1002, id_microciclo: 101, fecha_sesion: '2026-08-21', estado: 'Realizada' }],
    })
    expect(p.hechasFuera).toHaveLength(1)
    expect(p.avisos.join(' ')).toMatch(/desaparecen de las gráficas/)
  })

  it('no avisa de la papelera si nada de lo que sale está hecho', () => {
    expect(dur({ semanas: 1, sobrante: 'papelera' }).avisos.join(' ')).not.toMatch(/gráficas/)
  })

  it('con arrastre, el mesociclo siguiente se mueve; sin él, queda hueco', () => {
    expect(dur({ semanas: 1 }).mesosMovidos).toBe(1)
    expect(dur({ semanas: 1 }).avisos.join(' ')).toMatch(/1 mesociclo posterior se mueve 7 días hacia adelante/)
    const sin = dur({ semanas: 1, arrastrar: false })
    expect(sin.mesosMovidos).toBe(0)
    expect(sin.avisos.join(' ')).toMatch(/hueco de 7 días/)
  })

  it('alargar no saca ninguna semana, y empuja lo de detrás', () => {
    const p = dur({ semanas: 3 })
    expect(p.delta).toBe(1)
    expect(p.fuera).toEqual([])
    expect(p.avisos.join(' ')).toMatch(/se mueven?.*7 días hacia atrás/)
  })

  it('alargar sin arrastrar avisa del solape', () => {
    expect(dur({ semanas: 3, arrastrar: false }).avisos.join(' ')).toMatch(/solapará 7 días/)
  })

  it('el último mesociclo no arrastra a nadie', () => {
    const p = dur({ id: 11, semanas: 1 })
    expect(p.mesosMovidos).toBe(0)
    expect(p.avisos.join(' ')).not.toMatch(/posterior/)
  })

  it('la misma duración no es una operación, y menos de una semana no vale', () => {
    expect(dur({ semanas: 2 }).vacio).toBe(true)
    expect(dur({ semanas: 0 }).avisos.join(' ')).toMatch(/menos de una semana/)
    expect(dur({ id: 999, semanas: 1 }).vacio).toBe(true)
  })
})

describe('la llamada a la base', () => {
  const sbCon = (respuesta: any) => ({ rpc: async () => respuesta })

  it('devuelve cuántas sesiones salieron, para poder decirlo', () => {
    // El dibujo lo usa para avisar al final: acortar un bloque saca sesiones
    // del plan, y hacerlo en silencio es la mitad del problema.
    return aplicarDuracion(sbCon({ data: [{ sesiones_afectadas: 3 }], error: null }), 10, 3, false, 'liberar')
      .then(r => { expect(r).toEqual({ error: null, sesiones: 3 }) })
  })

  /* Sin la migración, PostgREST devuelve «Could not find the function...», que
     no le dice a nadie qué tiene que hacer. */
  it('si falta la migración, lo dice con esas palabras', async () => {
    const err = { message: 'Could not find the function public.redimensionar_mesociclo' }
    const r = await aplicarDuracion(sbCon({ data: null, error: err }), 10, 3, false, 'liberar')
    expect(r.error).toMatch(/Falta ejecutar supabase\/desplazar-ciclo\.sql/)

    const d = await aplicarDesplazamiento(
      sbCon({ error: { message: 'Could not find the function public.desplazar_ciclo' } }), 'mesociclo', 10, 7)
    expect(d).toMatch(/Falta ejecutar supabase\/desplazar-ciclo\.sql/)
  })

  it('cualquier otro error se pasa tal cual', async () => {
    const r = await aplicarDesplazamiento(sbCon({ error: { message: 'Sin permiso sobre ese plan' } }), 'mesociclo', 10, 7)
    expect(r).toBe('Sin permiso sobre ese plan')
  })

  it('mover cero días no llama a nadie', async () => {
    let llamado = false
    const sb = { rpc: async () => { llamado = true; return { error: null } } }
    expect(await aplicarDesplazamiento(sb, 'mesociclo', 10, 0)).toBeNull()
    expect(llamado).toBe(false)
  })
})

describe('los casos en los que no hay que hacer nada', () => {
  it('mover a la misma fecha no es una operación', () => {
    const p = previsualizar({ ...base, nivel: 'macrociclo', id: 1, nuevaFecha: '2026-08-13' })
    expect(p.dias).toBe(0)
    expect(p.vacio).toBe(true)
    expect(p.avisos.join(' ')).toMatch(/No hay nada que mover/)
  })

  it('un id que no existe no revienta', () => {
    const p = previsualizar({ ...base, nivel: 'mesociclo', id: 999, nuevaFecha: '2026-08-17' })
    expect(p.vacio).toBe(true)
    expect(p.avisos.join(' ')).toMatch(/No se encuentra el ciclo/)
  })
})
