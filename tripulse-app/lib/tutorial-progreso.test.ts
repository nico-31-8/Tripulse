import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { progresoDeFilas, cargarProgreso, guardarMarca, CLAVE_PAUSA, CLAVE_OFERTA } from './tutorial-progreso'

describe('de las filas al progreso', () => {
  it('zonas vistas y saltadas, la pausa y la oferta', () => {
    const p = progresoDeFilas([
      { clave: 'bienvenida', estado: 'visto' },
      { clave: 'panel', estado: 'saltado' },
      { clave: CLAVE_PAUSA, estado: 'pausado' },
      { clave: CLAVE_OFERTA, estado: 'rechazada' },
    ])
    expect([...p.vistos]).toEqual(['bienvenida'])
    expect([...p.saltados]).toEqual(['panel'])
    expect(p.pausado).toBe(true)
    expect(p.oferta).toBe('rechazada')
    expect(p.disponible).toBe(true)
  })

  it('sin filas: todo por ver', () => {
    const p = progresoDeFilas([])
    expect(p.vistos.size + p.saltados.size).toBe(0)
    expect(p.pausado).toBe(false)
    expect(p.oferta).toBeNull()
  })
})

describe('cargar', () => {
  const sb = (respuesta: { data?: unknown; error?: unknown }) => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: null, ...respuesta }) }) }),
  })

  /* Antes de aplicar la tabla, o si la base falla: nada arranca solo. */
  it('si la tabla no está, el progreso sale como no disponible', async () => {
    const p = await cargarProgreso(sb({ error: { code: '42P01', message: 'relation "tutorial_progreso" does not exist' } }), 'u1')
    expect(p.disponible).toBe(false)
  })

  it('con la tabla, lo guardado', async () => {
    const p = await cargarProgreso(sb({ data: [{ clave: 'panel', estado: 'visto' }] }), 'u1')
    expect(p.disponible).toBe(true)
    expect(p.vistos.has('panel')).toBe(true)
  })
})

describe('guardar', () => {
  it('es un upsert por persona y clave', async () => {
    const llamadas: { t: string; fila: unknown; op: unknown }[] = []
    const sb = { from: (t: string) => ({ upsert: (fila: unknown, op: unknown) => { llamadas.push({ t, fila, op }); return Promise.resolve({ error: null }) } }) }
    expect(await guardarMarca(sb, 'u1', 'panel', 'visto')).toBeNull()
    expect(llamadas[0].t).toBe('tutorial_progreso')
    expect(llamadas[0].fila).toMatchObject({ id_usuario: 'u1', clave: 'panel', estado: 'visto' })
    expect(llamadas[0].op).toEqual({ onConflict: 'id_usuario,clave' })
  })
})

describe('la tabla', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'supabase', 'tutorial-progreso.sql'), 'utf8')

  it('acepta los estados que escribe la app', () => {
    for (const e of ['visto', 'saltado', 'pausado', 'aceptada', 'rechazada']) expect(sql).toContain("'" + e + "'")
  })
  it('solo la ve y la toca su dueño, y anon fuera', () => {
    expect(sql).toMatch(/using \(id_usuario = \(select auth\.uid\(\)\)\)/)
    expect(sql).toMatch(/revoke all on public\.tutorial_progreso from anon/)
  })
  it('no lleva comentarios de línea (el usuario la pega en el editor de Supabase)', () => {
    expect(sql).not.toMatch(/--/)
  })
})
