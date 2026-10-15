import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { modoDeQuitar, nombreCoincide, quitarDeportista } from './quitar-deportista'

describe('qué se hace al quitar', () => {
  /* Con cuenta, sus datos son suyos: el entrenador solo puede soltarlo. */
  it('con cuenta propia se desvincula', () => {
    expect(modoDeQuitar({ id_usuario: 'a1c21ffd-dcba-4e67-9147-b9b43ddd6e9b' })).toBe('desvincular')
  })

  it('sin cuenta (una ficha del entrenador) se borra', () => {
    expect(modoDeQuitar({ id_usuario: null })).toBe('borrar')
    expect(modoDeQuitar({})).toBe('borrar')
  })
})

describe('escribir su nombre para borrar', () => {
  /* Igual que la base (lower(btrim(...))): si la pantalla fuera más estricta
     que la base, el botón no se encendería con algo que la base aceptaría. */
  it('da igual mayúsculas y espacios alrededor, como en la base', () => {
    expect(nombreCoincide('  pepe garcía ', 'Pepe García')).toBe(true)
  })

  it('otro nombre, a medias o vacío, no', () => {
    expect(nombreCoincide('Pepe', 'Pepe García')).toBe(false)
    expect(nombreCoincide('', '')).toBe(false)
    expect(nombreCoincide('   ', 'Pepe')).toBe(false)
    expect(nombreCoincide(null, 'Pepe')).toBe(false)
  })
})

describe('quitarDeportista', () => {
  const sb = (respuesta: { data?: unknown; error?: any }) => {
    const llamadas: any[] = []
    return {
      llamadas,
      rpc: (fn: string, args: any) => { llamadas.push({ fn, args }); return Promise.resolve({ data: null, error: null, ...respuesta }) },
    }
  }

  /* Lo que se hizo lo dice la base: aunque se mande un nombre, a quien tiene
     cuenta solo se le desvincula. */
  it('devuelve lo que hizo la base', async () => {
    expect(await quitarDeportista(sb({ data: 'borrado' }), 6, 'Pepe')).toEqual({ hecho: 'borrar', error: null })
    expect(await quitarDeportista(sb({ data: 'desvinculado' }), 28, 'Ana')).toEqual({ hecho: 'desvincular', error: null })
  })

  it('manda el id y el nombre con los nombres que espera la función', async () => {
    const s = sb({ data: 'borrado' })
    await quitarDeportista(s, 6, 'Pepe')
    expect(s.llamadas).toEqual([{ fn: 'quitar_deportista', args: { _id: 6, _nombre: 'Pepe' } }])
  })

  it('si falta la función, dice qué falta en vez del error de PostgREST', async () => {
    const r = await quitarDeportista(sb({ error: { code: 'PGRST202', message: 'Could not find the function public.quitar_deportista' } }), 6)
    expect(r.error).toMatch(/quitar-deportista\.sql/)
  })

  it('los errores de la base llegan tal cual: ya vienen escritos para el entrenador', async () => {
    const r = await quitarDeportista(sb({ error: { code: 'P0001', message: 'Para borrarla hay que escribir su nombre tal cual' } }), 6, 'x')
    expect(r).toEqual({ hecho: null, error: 'Para borrarla hay que escribir su nombre tal cual' })
  })
})

/* La función de la base es la que manda, y estos son los nombres que llama la
   app. Si alguien la renombra en el SQL sin tocar esto, el botón falla. */
describe('la función de la base', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'supabase', 'quitar-deportista.sql'), 'utf8')

  it('existe con los parámetros que manda la app', () => {
    expect(sql).toMatch(/create or replace function quitar_deportista\(_id bigint, _nombre text default null\)/)
  })

  it('está cerrada a quien no tiene sesión', () => {
    expect(sql).toMatch(/revoke execute on function quitar_deportista\(bigint, text\) from anon/)
  })

  it('no lleva comentarios de línea (el usuario la pega en el editor de Supabase)', () => {
    expect(sql).not.toMatch(/--/)
  })
})
