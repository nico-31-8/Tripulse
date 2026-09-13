import { describe, it, expect } from 'vitest'
import { rpeDeSesion, rellenarRpeTareas } from './rpe-sesion'

describe('rpeDeSesion', () => {
  it('sesión normal: el que da el atleta', () => {
    expect(rpeDeSesion(7)).toBe(7)
    expect(rpeDeSesion('6')).toBe(6)
  })

  it('brick: la media de sus bloques, con un decimal', () => {
    expect(rpeDeSesion(5, [6, 8])).toBe(7)
    expect(rpeDeSesion(5, [6, 7, 7])).toBe(6.7)
  })

  it('en un brick, un bloque sin dato no cuenta como cero', () => {
    expect(rpeDeSesion(5, [8, null, undefined])).toBe(8)
  })

  it('brick sin ningún bloque apuntado: el general', () => {
    expect(rpeDeSesion(6, [null, null])).toBe(6)
  })

  it('lo que no es un RPE no se guarda', () => {
    expect(rpeDeSesion(null)).toBeNull()
    expect(rpeDeSesion('')).toBeNull()
    expect(rpeDeSesion(11)).toBeNull()
    expect(rpeDeSesion(-1)).toBeNull()
    expect(rpeDeSesion(NaN)).toBeNull()
  })
})

/* Un doble que recuerda lo que se pidió, para ver que el filtro «solo las que no
   tienen» va de verdad en la consulta y no se pisa el RPE de ningún bloque. */
function dobleSupabase() {
  const llamadas: { tabla: string; cambios: unknown; filtros: string[] }[] = []
  const supabase = {
    from: (tabla: string) => ({
      update: (cambios: unknown) => {
        const l = { tabla, cambios, filtros: [] as string[] }
        llamadas.push(l)
        const q = {
          eq: (c: string, v: unknown) => { l.filtros.push(c + '=' + v); return q },
          is: (c: string, v: unknown) => { l.filtros.push(c + ' is ' + v); return Promise.resolve({ error: null }) },
        }
        return q
      },
    }),
  }
  return { supabase, llamadas }
}

describe('rellenarRpeTareas', () => {
  it('copia a las tareas de esa sesión, SOLO a las que no lo tienen', async () => {
    const { supabase, llamadas } = dobleSupabase()
    await rellenarRpeTareas(supabase, 42, 7)
    expect(llamadas).toEqual([{ tabla: 'tarea', cambios: { rpe_reportado: 7 }, filtros: ['id_sesion=42', 'rpe_reportado is null'] }])
  })

  it('sin RPE o sin sesión, no escribe nada', async () => {
    const { supabase, llamadas } = dobleSupabase()
    await rellenarRpeTareas(supabase, 42, null)
    await rellenarRpeTareas(supabase, 0, 7)
    expect(llamadas).toEqual([])
  })
})
