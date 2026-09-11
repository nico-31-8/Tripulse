import { describe, it, expect } from 'vitest'
import { moverItem, renumerar, ultimoOrden, persistirOrden } from './tareas-orden'

describe('moverItem', () => {
  it('mueve un elemento hacia delante sin mutar el original', () => {
    const arr = ['a', 'b', 'c', 'd']
    expect(moverItem(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(arr).toEqual(['a', 'b', 'c', 'd'])
  })
  it('mueve un elemento hacia atrás', () => {
    expect(moverItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('índices iguales o fuera de rango → devuelve el mismo array', () => {
    const arr = ['a', 'b', 'c']
    expect(moverItem(arr, 1, 1)).toBe(arr)
    expect(moverItem(arr, -1, 0)).toBe(arr)
    expect(moverItem(arr, 0, 5)).toBe(arr)
  })
})

describe('renumerar', () => {
  it('deja orden = posición', () => {
    expect(renumerar([{ id: 3, orden: 3 }, { id: 1, orden: 1 }, { id: 2, orden: 2 }]).map(t => t.orden)).toEqual([1, 2, 3])
  })
  it('no toca las que ya están en su sitio', () => {
    const a = { id: 1, orden: 1 }
    expect(renumerar([a, { id: 2, orden: 5 }])[0]).toBe(a)
  })
})

describe('ultimoOrden', () => {
  it('sin tareas, 0: la primera es la 1', () => {
    expect(ultimoOrden([])).toBe(0)
  })
  it('con un hueco por una borrada, sigue detrás de la última y no empata', () => {
    expect(ultimoOrden([{ orden: 1 }, { orden: 2 }, { orden: 4 }]) + 1).toBe(5)
  })
  it('las viejas sin orden cuentan por su sitio', () => {
    expect(ultimoOrden([{ orden: null }, { orden: null }, { orden: null }])).toBe(3)
    expect(ultimoOrden([{ orden: 1 }, { orden: null }])).toBe(2)
  })
})

/* Una base de mentira: guarda el orden de cada tarea y responde como Supabase.
   `espera` retrasa cada escritura, para ver que dos tandas no se mezclan. */
function baseDeMentira(inicial: Record<number, number>, espera?: (id: number, orden: number) => number) {
  const orden = { ...inicial }
  const escrituras: [number, number][] = []
  const supabase = {
    from: () => ({
      update: (v: { orden: number }) => ({
        eq: async (_col: string, id: number) => {
          if (espera) await new Promise(r => setTimeout(r, espera(id, v.orden)))
          orden[id] = v.orden
          escrituras.push([id, v.orden])
          return { error: null }
        },
      }),
    }),
  }
  const enOrden = () => Object.keys(orden).map(Number).sort((a, b) => orden[a] - orden[b])
  return { supabase, orden, escrituras, enOrden }
}

/* Lo que hace la pantalla al soltar: mover, renumerar para la pantalla, guardar. */
async function arrastrar(pantalla: { id: number; orden: number }[], supabase: unknown, de: number, a: number) {
  const nuevo = renumerar(moverItem(pantalla, de, a))
  const r = await persistirOrden(supabase, nuevo)
  return { nuevo, r }
}

describe('persistirOrden', () => {
  it('EL FALLO: mover una tarea y devolverla a su sitio se guarda', async () => {
    const db = baseDeMentira({ 1: 1, 2: 2, 3: 3 })
    let pantalla = [{ id: 1, orden: 1 }, { id: 2, orden: 2 }, { id: 3, orden: 3 }]

    ;({ nuevo: pantalla } = await arrastrar(pantalla, db.supabase, 2, 0))   // C arriba
    expect(db.enOrden()).toEqual([3, 1, 2])

    ;({ nuevo: pantalla } = await arrastrar(pantalla, db.supabase, 0, 2))   // y de vuelta
    expect(db.enOrden()).toEqual([1, 2, 3])
    expect(pantalla.map(t => t.id)).toEqual(db.enOrden())
  })

  it('escribe todas, aunque la pantalla crea que ya están en su sitio', async () => {
    const db = baseDeMentira({ 1: 2, 2: 1 })   // la base tiene otro orden que la pantalla
    await persistirOrden(db.supabase, [{ id: 1 }, { id: 2 }])
    expect(db.orden).toEqual({ 1: 1, 2: 2 })
  })

  it('varios arrastres seguidos acaban en lo que se ve', async () => {
    const db = baseDeMentira({ 10: 1, 20: 2, 30: 3, 40: 4 })
    let pantalla = [10, 20, 30, 40].map((id, i) => ({ id, orden: i + 1 }))
    for (const [de, a] of [[3, 0], [1, 3], [2, 1], [0, 2], [3, 0]]) {
      ;({ nuevo: pantalla } = await arrastrar(pantalla, db.supabase, de, a))
      expect(db.enOrden()).toEqual(pantalla.map(t => t.id))
    }
  })

  it('dos tandas lanzadas a la vez no se mezclan: gana la última', async () => {
    /* La primera tanda escribe despacio; sin la fila, parte de ella llegaría
       después de la segunda y dejaría una mezcla. */
    const db = baseDeMentira({ 1: 1, 2: 2, 3: 3 }, (_id, orden) => (orden === 1 ? 30 : 5))
    const primera = persistirOrden(db.supabase, [{ id: 3 }, { id: 1 }, { id: 2 }])
    const segunda = persistirOrden(db.supabase, [{ id: 2 }, { id: 3 }, { id: 1 }])
    await Promise.all([primera, segunda])
    expect(db.enOrden()).toEqual([2, 3, 1])
  })

  it('si una escritura falla, lo dice', async () => {
    const supabase = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'RLS' } }) }) }) }
    expect(await persistirOrden(supabase, [{ id: 1 }])).toEqual({ ok: false })
  })

  it('si la red revienta, también lo dice y la siguiente tanda sigue funcionando', async () => {
    const roto = { from: () => ({ update: () => ({ eq: async () => { throw new Error('sin red') } }) }) }
    expect(await persistirOrden(roto, [{ id: 1 }])).toEqual({ ok: false })
    const db = baseDeMentira({ 1: 2, 2: 1 })
    expect(await persistirOrden(db.supabase, [{ id: 1 }, { id: 2 }])).toEqual({ ok: true })
    expect(db.orden).toEqual({ 1: 1, 2: 2 })
  })
})
