import { describe, it, expect } from 'vitest'
import { resultadoDe, filasDeTest, guardarTestsDelGrupo, resumenTests, TESTS_GRUPO } from './grupos-test'

const PROTO_CARRERA = { incrementoVel: '0.5', durTotal: '60' }
const PERSONAS = [
  { id_deportista: 1, nombre: 'Ana', valores: { velUltimo: '18', tiempoAguantado: '60' } },
  { id_deportista: 2, nombre: 'Bea', valores: { velUltimo: '17', tiempoAguantado: '30' } },
]

function sbFalso(op: { fallaLote?: boolean; fallaA?: number } = {}) {
  const escritas: any[] = []
  return {
    escritas,
    from(tabla: string) {
      return {
        insert(v: any) {
          const filas = Array.isArray(v) ? v : [v]
          if (filas.length > 1 && op.fallaLote) return Promise.resolve({ error: { message: 'lote no' } })
          if (filas.length === 1 && op.fallaA === filas[0].id_deportista) {
            return Promise.resolve({ error: { message: 'RLS' } })
          }
          escritas.push(...filas.map((f: any) => ({ ...f, _tabla: tabla })))
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

describe('resultadoDe', () => {
  it('junta el protocolo del grupo con lo de cada persona', () => {
    expect(resultadoDe('carrera', PROTO_CARRERA, { velUltimo: '18', tiempoAguantado: '60' })).toBe(18)
    expect(resultadoDe('carrera', PROTO_CARRERA, { velUltimo: '18', tiempoAguantado: '30' })).toBe(17.8)
  })

  it('mientras falte algo, null: la pantalla enseña una raya, no medio número', () => {
    expect(resultadoDe('carrera', PROTO_CARRERA, { velUltimo: '18' })).toBeNull()
    expect(resultadoDe('carrera', PROTO_CARRERA, {})).toBeNull()
  })

  it('los tres deportes', () => {
    expect(resultadoDe('natacion',
      { distanciaGrande: '400', distanciaPequena: '200' },
      { tiempoGrande: '300', tiempoPequeno: '140' })).toBe(1.25)
    /* 290 W es la PAM (el último escalón, contado en proporción). El FTP es su
       75 %: 217,5 → 218.

       ESTE TEST DECÍA 290 Y ERA EL ERROR PUESTO POR ESCRITO. La rampa guardaba
       la PAM en la columna `ftp` porque el 0,75 no se aplicaba en ningún sitio,
       así que el FTP de todos los ciclistas iba un tercio alto — y las zonas
       salen de ahí. Lo destapó comparar la app con la batería de tests del
       proyecto, que lo dice en una línea: «FTP = último min × 0,75». */
    expect(resultadoDe('ciclismo',
      { incrementoPot: '20', durEscalones: '60' },
      { potenciaPico: '300', tiempoNoCompletado: '30' })).toBe(218)
  })
})

describe('filasDeTest', () => {
  it('mezcla protocolo y persona en las columnas de verdad', () => {
    const [f] = filasDeTest('carrera', '2026-08-25', PROTO_CARRERA, [PERSONAS[0]])
    expect(f.fila).toEqual({
      id_deportista: 1,
      fecha: '2026-08-25',
      incremento_velocidad: 0.5,
      duracion_total_escalon: 60,
      velocidad_ultimo_escalon: 18,
      tiempo_aguantado_ultimo: 60,
      vam: 18,
    })
  })

  it('SE SALTA a quien no lo terminó, en vez de guardarle un test sin resultado', () => {
    /* En un grupo siempre falta alguien o alguien se retira. Una fila a medias
       aparecería luego en su historial como si hubiera hecho el test. */
    const conHueco = [...PERSONAS, { id_deportista: 3, nombre: 'Caro', valores: { velUltimo: '16' } }]
    const filas = filasDeTest('carrera', '2026-08-25', PROTO_CARRERA, conHueco)
    expect(filas).toHaveLength(2)
    expect(filas.map(f => f.id_deportista)).toEqual([1, 2])
  })

  it('cada uno con SU número, no el del primero', () => {
    const filas = filasDeTest('carrera', '2026-08-25', PROTO_CARRERA, PERSONAS)
    expect(filas.map(f => f.fila.vam)).toEqual([18, 16.8])
  })

  it('natación guarda las distancias del protocolo en cada fila', () => {
    const [f] = filasDeTest('natacion', '2026-08-25',
      { distanciaGrande: '400', distanciaPequena: '200' },
      [{ id_deportista: 9, nombre: 'Ana', valores: { tiempoGrande: '300', tiempoPequeno: '140' } }])
    expect(f.fila.distancia_grande).toBe(400)
    expect(f.fila.tiempo_distancia_grande).toBe(300)
    expect(f.fila.css).toBe(1.25)
  })

  it('sin nadie completo, ninguna fila', () => {
    expect(filasDeTest('carrera', '2026-08-25', PROTO_CARRERA, [])).toEqual([])
  })
})

describe('guardarTestsDelGrupo', () => {
  it('van a la tabla del deporte, de una sola vez', async () => {
    const sb = sbFalso()
    const r = await guardarTestsDelGrupo(sb, { clave: 'carrera', fecha: '2026-08-25', protocolo: PROTO_CARRERA, personas: PERSONAS })
    expect(r.error).toBeNull()
    expect(sb.escritas).toHaveLength(2)
    expect(sb.escritas.every(f => f._tabla === 'test1_carrera')).toBe(true)
  })

  it('si el lote falla, se reintenta uno a uno y se guarda lo que se pueda', async () => {
    const sb = sbFalso({ fallaLote: true, fallaA: 2 })
    const r = await guardarTestsDelGrupo(sb, { clave: 'carrera', fecha: '2026-08-25', protocolo: PROTO_CARRERA, personas: PERSONAS })
    expect(r.error).toBeNull()
    expect(r.resultados.map(x => x.ok)).toEqual([true, false])
    expect(sb.escritas).toHaveLength(1)
  })

  it('sin fecha no se guarda: un test sin día no sirve para ordenar nada', async () => {
    const sb = sbFalso()
    const r = await guardarTestsDelGrupo(sb, { clave: 'carrera', fecha: '', protocolo: PROTO_CARRERA, personas: PERSONAS })
    expect(r.error).toBeTruthy()
    expect(sb.escritas).toHaveLength(0)
  })

  it('si nadie lo ha terminado, se dice y no se escribe', async () => {
    const sb = sbFalso()
    const r = await guardarTestsDelGrupo(sb, {
      clave: 'carrera', fecha: '2026-08-25', protocolo: PROTO_CARRERA,
      personas: [{ id_deportista: 1, nombre: 'Ana', valores: {} }],
    })
    expect(r.error).toBe('Ningún test está completo todavía.')
    expect(sb.escritas).toHaveLength(0)
  })
})

describe('resumenTests', () => {
  it('cuenta los guardados y los que faltan', () => {
    expect(resumenTests([{ id_deportista: 1, nombre: 'Ana', ok: true }], 1)).toBe('1 test guardado.')
    expect(resumenTests([
      { id_deportista: 1, nombre: 'Ana', ok: true },
      { id_deportista: 2, nombre: 'Bea', ok: true },
    ], 5)).toBe('2 tests guardados · 3 sin terminar.')
    expect(resumenTests([
      { id_deportista: 1, nombre: 'Ana', ok: true },
      { id_deportista: 2, nombre: 'Bea', ok: false },
    ], 2)).toBe('1 test guardado · 1 con error.')
  })
})

describe('el catálogo', () => {
  it('los tres deportes, con protocolo y campos por persona', () => {
    for (const c of ['carrera', 'natacion', 'ciclismo'] as const) {
      const d = TESTS_GRUPO[c]
      expect(d.protocolo.length).toBeGreaterThan(0)
      expect(d.porPersona.length).toBeGreaterThan(0)
      expect(d.tabla).toMatch(/^test[123]_/)
      // Todo campo del protocolo trae un valor por defecto: nadie debería tener
      // que recordar que un escalón de Montreal dura 60 segundos.
      expect(d.protocolo.every(p => p.porDefecto !== '')).toBe(true)
    }
  })
})
