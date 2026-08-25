import { describe, it, expect } from 'vitest'
import { filasDeMensaje, mandarAlGrupo, resumenMensaje } from './grupos-mensaje'

const MIEMBROS = [
  { id_deportista: 1, nombre: 'Ana' },
  { id_deportista: 2, nombre: 'Bea' },
  { id_deportista: 3, nombre: 'Caro' },
]

/* Cliente de mentira. `fallaLote` hace fallar el insert de varias filas (el
   camino rápido) y `fallaA` hace fallar el de una persona concreta, para poder
   probar que el reintento uno a uno entrega a los demás. */
function sbFalso(op: { fallaLote?: boolean; fallaA?: number } = {}) {
  const escritas: any[] = []
  return {
    escritas,
    from(tabla: string) {
      if (tabla !== 'mensajes') throw new Error('tabla inesperada: ' + tabla)
      return {
        insert(v: any) {
          const filas = Array.isArray(v) ? v : [v]
          if (filas.length > 1 && op.fallaLote) return Promise.resolve({ error: { message: 'lote no' } })
          if (filas.length === 1 && op.fallaA === filas[0].id_deportista) {
            return Promise.resolve({ error: { message: 'RLS' } })
          }
          escritas.push(...filas)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

describe('filasDeMensaje', () => {
  it('una fila por miembro, con el mismo texto y cada una a su dueño', () => {
    const filas = filasDeMensaje('e1', MIEMBROS, 'Mañana a las 7 en la piscina')
    expect(filas).toHaveLength(3)
    expect(filas.map(f => f.id_deportista)).toEqual([1, 2, 3])
    expect(new Set(filas.map(f => f.contenido)).size).toBe(1)
    expect(filas.every(f => f.autor === 'entrenador' && f.leido === false)).toBe(true)
    expect(filas.every(f => f.id_entrenador === 'e1')).toBe(true)
  })

  it('recorta los espacios: un mensaje que solo tiene espacios no es un mensaje', () => {
    expect(filasDeMensaje('e1', MIEMBROS, '  hola  ')[0].contenido).toBe('hola')
    expect(filasDeMensaje('e1', MIEMBROS, '   ')).toEqual([])
    expect(filasDeMensaje('e1', MIEMBROS, '')).toEqual([])
  })

  it('sin miembros no hay filas', () => {
    expect(filasDeMensaje('e1', [], 'hola')).toEqual([])
  })
})

describe('mandarAlGrupo', () => {
  it('con todo bien, UNA sola escritura para los tres', async () => {
    const sb = sbFalso()
    const r = await mandarAlGrupo(sb, { idEntrenador: 'e1', miembros: MIEMBROS, texto: 'hola' })
    expect(r.error).toBeNull()
    expect(r.resultados.every(x => x.ok)).toBe(true)
    expect(sb.escritas).toHaveLength(3)
  })

  it('si el lote falla, se reintenta uno a uno y llega a los demás', async () => {
    /* Lo que se prueba es que una persona que la RLS rechaza NO deja a las otras
       dos sin el aviso, y que se puede decir quién fue. */
    const sb = sbFalso({ fallaLote: true, fallaA: 2 })
    const r = await mandarAlGrupo(sb, { idEntrenador: 'e1', miembros: MIEMBROS, texto: 'hola' })
    expect(r.error).toBeNull()
    expect(r.resultados.map(x => x.ok)).toEqual([true, false, true])
    expect(r.resultados[1].error).toBe('RLS')
    expect(sb.escritas.map(f => f.id_deportista)).toEqual([1, 3])
  })

  it('si no llega a nadie, se dice que ha fallado', async () => {
    const sb = sbFalso({ fallaLote: true, fallaA: -1 })
    const soloUno = [{ id_deportista: -1, nombre: 'Ana' }]
    const r = await mandarAlGrupo(sb, { idEntrenador: 'e1', miembros: soloUno, texto: 'hola' })
    expect(r.error).toBeTruthy()
    expect(r.resultados[0].ok).toBe(false)
  })

  it('no se manda nada vacío, y no se toca la base para averiguarlo', async () => {
    const sb = sbFalso()
    for (const t of ['', '   ']) {
      const r = await mandarAlGrupo(sb, { idEntrenador: 'e1', miembros: MIEMBROS, texto: t })
      expect(r.error).toBeTruthy()
    }
    expect(sb.escritas).toHaveLength(0)
  })

  it('sin miembros no se manda', async () => {
    const sb = sbFalso()
    const r = await mandarAlGrupo(sb, { idEntrenador: 'e1', miembros: [], texto: 'hola' })
    expect(r.error).toBe('El grupo no tiene a nadie.')
    expect(sb.escritas).toHaveLength(0)
  })
})

describe('resumenMensaje', () => {
  it('lo dice en corto', () => {
    expect(resumenMensaje(MIEMBROS.map(m => ({ ...m, ok: true })))).toBe('Mandado a 3 deportistas.')
    expect(resumenMensaje([{ id_deportista: 1, nombre: 'Ana', ok: true }])).toBe('Mandado a 1 deportista.')
    expect(resumenMensaje([
      { id_deportista: 1, nombre: 'Ana', ok: true },
      { id_deportista: 2, nombre: 'Bea', ok: false },
    ])).toBe('Mandado a 1 de 2.')
    expect(resumenMensaje([])).toBe('No se mandó nada.')
  })
})
