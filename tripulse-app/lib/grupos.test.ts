import { describe, it, expect } from 'vitest'
import {
  crearGrupo, meterEnGrupo, sacarDelGrupo, contarMiembros, borrarGrupo,
  renombrarGrupo, sistemaZonasMayoritario,
  faltaEsquema, testsQueFaltan, ERROR_FALTA_ESQUEMA,
} from './grupos'

/* Cliente de mentira: apunta cada operación para poder afirmar qué se hizo y, sobre
   todo, qué NO se hizo. */
function sbFalso(opciones: { fallaMiembros?: boolean; fallaGrupo?: any; previos?: any[]; filas?: any[] } = {}) {
  const ops: any[] = []
  const api = (tabla: string) => ({
    insert(valores: any) {
      ops.push({ op: 'insert', tabla, valores })
      if (tabla === 'grupo_entreno_miembro' && opciones.fallaMiembros) {
        return Promise.resolve({ error: { message: 'no se pudo meter' } })
      }
      return {
        select: () => ({
          single: () => Promise.resolve(
            opciones.fallaGrupo
              ? { data: null, error: opciones.fallaGrupo }
              : { data: { id: 'g1' }, error: null }),
        }),
      }
    },
    delete() { return { eq: (c: string, v: any) => { ops.push({ op: 'delete', tabla, c, v }); return Promise.resolve({ error: null }) } } },
    update(valores: any) {
      const q: any = { _v: valores }
      q.eq = () => q; q.in = () => { ops.push({ op: 'update', tabla, valores }); return Promise.resolve({ error: null }) }
      q.then = (r: any) => { ops.push({ op: 'update', tabla, valores }); return Promise.resolve({ error: null }).then(r) }
      return q
    },
    select() {
      const q: any = {}
      q.eq = () => q; q.in = () => q; q.is = () => q; q.order = () => q
      q.then = (r: any) => Promise.resolve({ data: opciones.previos ?? opciones.filas ?? [], error: null }).then(r)
      return q
    },
  })
  return { ops, from: (t: string) => api(t) }
}

describe('crearGrupo', () => {
  it('no crea nada sin nombre ni sin deportistas', async () => {
    const sb = sbFalso()
    expect((await crearGrupo(sb, 'u1', '   ', [1])).error).toMatch(/nombre/i)
    expect((await crearGrupo(sb, 'u1', 'Escuela', [])).error).toMatch(/deportista/i)
    expect(sb.ops).toHaveLength(0)
  })

  it('crea el grupo y mete a los miembros', async () => {
    const sb = sbFalso()
    const r = await crearGrupo(sb, 'u1', '  Escuela  ', [3, 7])
    expect(r).toEqual({ id: 'g1', error: null })
    const ins = sb.ops.filter(o => o.op === 'insert')
    expect(ins[0].valores.nombre).toBe('Escuela')          // recortado
    expect(ins[1].valores).toEqual([
      { id_grupo: 'g1', id_deportista: 3 },
      { id_grupo: 'g1', id_deportista: 7 },
    ])
  })

  /* Lo importante: si los miembros fallan, no puede quedarse un grupo vacío que el
     entrenador tendría que limpiar a mano, y encima pareciendo que fue bien. */
  it('si fallan los miembros, deshace el grupo', async () => {
    const sb = sbFalso({ fallaMiembros: true })
    const r = await crearGrupo(sb, 'u1', 'Escuela', [3])
    expect(r.id).toBeNull()
    expect(sb.ops.some(o => o.op === 'delete' && o.tabla === 'grupo_entreno' && o.v === 'g1')).toBe(true)
  })

  it('si falta la migración lo dice, en vez de un error de Postgres', async () => {
    const sb = sbFalso({ fallaGrupo: { message: 'relation "grupo_entreno" does not exist', code: '42P01' } })
    expect((await crearGrupo(sb, 'u1', 'Escuela', [3])).error).toBe(ERROR_FALTA_ESQUEMA)
  })
})

describe('meterEnGrupo', () => {
  /* La clave es (grupo, deportista): a quien ya estuvo hay que REABRIRLE la fila,
     porque un insert chocaria contra la clave primaria. */
  it('reabre a quien ya estuvo y solo inserta a los nuevos', async () => {
    const sb = sbFalso({ previos: [{ id_deportista: 3 }] })
    expect(await meterEnGrupo(sb, 'g1', [3, 9])).toBeNull()
    const upd = sb.ops.find(o => o.op === 'update')
    const ins = sb.ops.find(o => o.op === 'insert')
    expect(upd.valores.hasta).toBeNull()
    expect(ins.valores).toEqual([{ id_grupo: 'g1', id_deportista: 9 }])
  })

  it('con lista vacía no toca nada', async () => {
    const sb = sbFalso()
    expect(await meterEnGrupo(sb, 'g1', [])).toBeNull()
    expect(sb.ops).toHaveLength(0)
  })
})

describe('sacarDelGrupo', () => {
  /* No borra: cierra con fecha. Lo que ya entrenó con el grupo sigue teniendo
     sentido y se puede saber quién estaba dentro en marzo. */
  it('cierra la fila con fecha en vez de borrarla', async () => {
    const sb = sbFalso()
    await sacarDelGrupo(sb, 'g1', 3)
    expect(sb.ops.some(o => o.op === 'delete')).toBe(false)
    const upd = sb.ops.find(o => o.op === 'update')
    expect(upd.valores.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('contarMiembros', () => {
  it('cuenta por grupo en una sola consulta', async () => {
    const sb = sbFalso({ filas: [{ id_grupo: 'a' }, { id_grupo: 'a' }, { id_grupo: 'b' }] })
    expect(await contarMiembros(sb, ['a', 'b'])).toEqual({ a: 2, b: 1 })
  })

  it('sin ids no consulta', async () => {
    const sb = sbFalso()
    expect(await contarMiembros(sb, [])).toEqual({})
    expect(sb.ops).toHaveLength(0)
  })
})

describe('testsQueFaltan', () => {
  /* En un grupo esto decide quién ve ritmos y quién solo ve el porcentaje teórico. */
  it('los tres cuando no hay nada', () => {
    expect(testsQueFaltan(null)).toEqual(['VAM', 'FTP', 'CSS'])
    expect(testsQueFaltan({})).toEqual(['VAM', 'FTP', 'CSS'])
  })

  it('ninguno cuando están los tres', () => {
    expect(testsQueFaltan({ vam: 16, ftp: 240, css: 1.3 })).toEqual([])
  })

  /* Un 0 no es un test hecho: es un test sin valor, y con 0 no sale ningún ritmo. */
  it('un cero cuenta como que falta', () => {
    expect(testsQueFaltan({ vam: 0, ftp: 240, css: 1.3 })).toEqual(['VAM'])
  })
})

describe('sistemaZonasMayoritario', () => {
  it('gana el que usan más miembros', () => {
    expect(sistemaZonasMayoritario([1, 1, 2])).toBe(1)
    expect(sistemaZonasMayoritario([2, 2, 1])).toBe(2)
  })

  /* En empate gana el 2: es donde viven las siglas y todo lo nuevo. */
  it('en empate gana el 2', () => {
    expect(sistemaZonasMayoritario([1, 2])).toBe(2)
  })

  /* Un null es el sistema 1: así lo lee la app en todas partes
     (sistema_zonas || 1). Contarlo como otra cosa aquí crearía dos verdades. */
  it('null cuenta como sistema 1, igual que en el resto de la app', () => {
    expect(sistemaZonasMayoritario([null, null, 2])).toBe(1)
    expect(sistemaZonasMayoritario([undefined, 1])).toBe(1)
  })

  it('sin miembros todavía, el 2', () => {
    expect(sistemaZonasMayoritario([])).toBe(2)
    expect(sistemaZonasMayoritario(null as any)).toBe(2)
  })
})

describe('renombrarGrupo', () => {
  it('no acepta un nombre vacío', async () => {
    const sb = sbFalso()
    expect(await renombrarGrupo(sb, 'g1', '   ')).toMatch(/nombre/i)
    expect(sb.ops).toHaveLength(0)
  })

  /* La cabecera del calendario lee el nombre de la FICHA: cambiar solo el grupo lo
     dejaría llamándose de dos formas distintas según dónde mires. */
  it('renombra el grupo y también su ficha', async () => {
    const sb = sbFalso()
    expect(await renombrarGrupo(sb, 'g1', '  Escuela  ', 55)).toBeNull()
    const upds = sb.ops.filter(o => o.op === 'update')
    expect(upds.map(u => u.tabla)).toEqual(['grupo_entreno', 'deportista'])
    expect(upds.every(u => u.valores.nombre === 'Escuela')).toBe(true)
  })

  it('sin ficha creada todavía, solo renombra el grupo', async () => {
    const sb = sbFalso()
    await renombrarGrupo(sb, 'g1', 'Escuela', null)
    expect(sb.ops.filter(o => o.op === 'update')).toHaveLength(1)
  })
})

describe('borrarGrupo', () => {
  it('borra por id', async () => {
    const sb = sbFalso()
    expect(await borrarGrupo(sb, 'g1')).toBeNull()
    expect(sb.ops).toEqual([{ op: 'delete', tabla: 'grupo_entreno', c: 'id', v: 'g1' }])
  })
})

describe('faltaEsquema', () => {
  it('reconoce la tabla que no existe', () => {
    expect(faltaEsquema({ code: '42P01', message: 'relation "grupo_entreno" does not exist' })).toBe(true)
    expect(faltaEsquema({ code: 'PGRST205', message: '' })).toBe(true)
    expect(faltaEsquema({ message: "Could not find the table 'public.grupo_entreno' in the schema cache" })).toBe(true)
  })

  /* El caso que se vio en pantalla: el SQL estaba aplicado y el error era de
     políticas, pero como el mensaje llevaba dentro el nombre de la tabla salía
     «faltan las tablas de grupos». Mandaba a ejecutar algo ya ejecutado y tapaba el
     problema de verdad. */
  it('NO confunde un error de políticas con una tabla que falta', () => {
    expect(faltaEsquema({
      code: '42P17',
      message: 'infinite recursion detected in policy for relation "grupo_entreno"',
    })).toBe(false)
  })

  it('tampoco confunde RLS ni claves duplicadas', () => {
    expect(faltaEsquema({
      code: '42501',
      message: 'new row violates row-level security policy for table "grupo_entreno"',
    })).toBe(false)
    expect(faltaEsquema({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(faltaEsquema(null)).toBe(false)
  })
})
