import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
/* `envios` usa la zona pico de `plantillas-propias`, que arrastra el cliente
   de la base al importarse: aquí no hace falta (igual que en bloques-tarea). */
vi.mock('./supabase', () => ({ supabase: { auth: { onAuthStateChange: () => {} } } }))

import {
  nombreLibre, primerNombre, haceCuanto, correoValido, destinatariosPrevios, zonasDesconocidas,
  plantillaParaEnviar, textoEstado, conflictosDe, copiasPreviasDe, nombresDeHitos, resultadosDe,
  textoZona, textoRpe, etiquetaTipo, dondeQueda, queViaja, errorDeEnvio, faltaLaTabla,
  buscarEntrenador, enviar, contestar, cancelar, marcarRespuestasVistas,
  testsDeHitos, motivoNoSeManda, casaConBusqueda,
  listaY, resumenVarios, zonasDeTest, enviarVarios,
  type Envio, type ZonaEnviada, type LoQueTengo,
} from './envios'

describe('elegir qué mandar desde la página Envíos', () => {
  const mios = [{ id: 7, nombre: 'Prueba de esfuerzo' }, { id: 8, nombre: '30-15 IFT' }]

  it('de qué tests salen unas zonas: una vez cada uno, y los de la app no cuentan', () => {
    expect(testsDeHitos(['propia:7:0', 'propia:7:1', 'app:vam', 'propia:8:0'], mios)).toEqual({ nombres: ['Prueba de esfuerzo', '30-15 IFT'], ajenos: false })
    expect(testsDeHitos(['app:css'], mios)).toEqual({ nombres: [], ajenos: false })
    expect(testsDeHitos(null, mios)).toEqual({ nombres: [], ajenos: false })
  })

  it('un hito de un test que no es tuyo (compartido en la dirección) lo marca', () => {
    expect(testsDeHitos(['propia:99:0', 'propia:8:0'], mios)).toEqual({ nombres: ['30-15 IFT'], ajenos: true })
  })

  /* Las mismas reglas que la base: si la pantalla dejara pulsar algo que la
     base rechaza, el aviso llegaría tarde. */
  it('lo que no se puede mandar dice por qué; lo demás, null', () => {
    expect(motivoNoSeManda({ tipo: 'plantilla', disciplina: 'Carrera', bloques: [{ zona: 'PAE', metros: 1000 }] })).toBeNull()
    expect(motivoNoSeManda({ tipo: 'plantilla', disciplina: 'Fuerza', bloques: [{ zona: 'X', segundos: 60 }] })).toMatch(/natación, ciclismo o carrera/)
    expect(motivoNoSeManda({ tipo: 'plantilla', disciplina: 'Natacion', bloques: [] })).toMatch(/bloques/)
    expect(motivoNoSeManda({ tipo: 'test' })).toBeNull()
    expect(motivoNoSeManda({ tipo: 'zonas', zonas: 0, testsAjenos: false })).toBe('Todavía no tiene zonas')
    expect(motivoNoSeManda({ tipo: 'zonas', zonas: 3, testsAjenos: true })).toMatch(/no es tuyo/)
    expect(motivoNoSeManda({ tipo: 'zonas', zonas: 3, testsAjenos: false })).toBeNull()
  })

  it('buscar por el nombre: sin tildes ni mayúsculas; sin nada escrito, todo', () => {
    expect(casaConBusqueda('Natación técnica', 'natacion')).toBe(true)
    expect(casaConBusqueda('Zonas 30-15', '  ')).toBe(true)
    expect(casaConBusqueda('Zonas 30-15', 'css')).toBe(false)
  })
})

describe('nombreLibre (la misma regla que la base: envio_nombre_libre)', () => {
  /* Los mismos casos que se probaron en el ensayo de la base, con el mismo
     resultado: si la pantalla propusiera otro nombre, el que se guarda no
     sería el que el entrenador vio. */
  it('si no lo tiene, el suyo; si lo tiene, «(Ana)»; si también, «(Ana 2)»', () => {
    expect(nombreLibre('X', [], 'Ana Rivas')).toBe('X')
    expect(nombreLibre('X', ['x'], 'Ana Rivas')).toBe('X (Ana)')
    expect(nombreLibre('X', ['X', 'x (ana)'], 'Ana Rivas')).toBe('X (Ana 2)')
  })

  it('sin nombre, «Sin nombre»; sin quien lo manda, «(copia)»', () => {
    expect(nombreLibre('', null, 'Ana')).toBe('Sin nombre')
    expect(nombreLibre('X', ['X'], null)).toBe('X (copia)')
  })

  it('nunca pasa de 80 letras: se recorta lo justo para que quepa el paréntesis', () => {
    const largo = 'n'.repeat(80)
    const r = nombreLibre(largo, [largo], 'Ana')
    expect(r).toHaveLength(80)
    expect(r.endsWith(' (Ana)')).toBe(true)
  })

  it('el primer nombre, para el paréntesis', () => {
    expect(primerNombre('  Ana   Rivas ')).toBe('Ana')
    expect(primerNombre(null)).toBe('')
  })
})

describe('haceCuanto', () => {
  const ahora = new Date('2026-10-23T12:00:00Z')
  it('ahora, minutos, horas, ayer y días', () => {
    expect(haceCuanto('2026-10-23T11:59:40Z', ahora)).toBe('ahora')
    expect(haceCuanto('2026-10-23T11:55:00Z', ahora)).toBe('hace 5 min')
    expect(haceCuanto('2026-10-23T09:00:00Z', ahora)).toBe('hace 3 h')
    expect(haceCuanto('2026-10-22T10:00:00Z', ahora)).toBe('ayer')
    expect(haceCuanto('2026-10-19T12:00:00Z', ahora)).toBe('hace 4 días')
  })
  it('más de una semana, la fecha; sin fecha, nada', () => {
    expect(haceCuanto('2026-10-01T12:00:00Z', ahora)).toMatch(/1.*oct/)
    expect(haceCuanto(null, ahora)).toBe('')
    expect(haceCuanto('basura', ahora)).toBe('')
  })
})

describe('correoValido', () => {
  it('pide algo@algo.algo, con espacios alrededor da igual', () => {
    expect(correoValido(' luis.perez@ejemplo.com ')).toBe(true)
    expect(correoValido('luis.perez')).toBe(false)
    expect(correoValido('luis@ejemplo')).toBe(false)
    expect(correoValido('')).toBe(false)
  })
})

describe('destinatariosPrevios', () => {
  it('uno por persona, el último primero, y sin los que no tienen correo', () => {
    const r = destinatariosPrevios([
      { para: 'l', para_nombre: 'Luis', para_correo: 'l@x.es', creado_en: '2026-10-01' },
      { para: 'c', para_nombre: 'Carmen', para_correo: 'c@x.es', creado_en: '2026-10-20' },
      { para: 'l', para_nombre: 'Luis', para_correo: 'l@x.es', creado_en: '2026-10-22' },
      { para: 'j', para_nombre: 'Jorge', para_correo: null, creado_en: '2026-10-23' },
    ])
    expect(r.map(x => x.id)).toEqual(['l', 'c'])
  })
  it('como mucho los que se pidan', () => {
    const filas = Array.from({ length: 12 }, (_, i) => ({ para: 'p' + i, para_nombre: null, para_correo: i + '@x.es', creado_en: '2026-10-' + String(10 + i) }))
    expect(destinatariosPrevios(filas, 8)).toHaveLength(8)
    /* Sin nombre guardado, sale el correo. */
    expect(destinatariosPrevios(filas, 1)[0].nombre).toBe('11@x.es')
  })
})

describe('la plantilla que se manda', () => {
  it('las zonas que la app no conoce son las propias de quien la manda', () => {
    expect(zonasDesconocidas([{ zona: 'AEL', segundos: 900 }, { zona: 'SUA', metros: 100 }, { zona: 'SUA', metros: 50 }, { zona: 'Z3', segundos: 60 }]))
      .toEqual(['SUA'])
  })
  it('lleva la zona pico y el nombre sin espacios; sin objetivo, null', () => {
    const p = plantillaParaEnviar({ nombre: '  6 × 1000  ', disciplina: 'Carrera', objetivo: '  ', bloques: [
      { zona: 'AEL', segundos: 900 }, { zona: 'PAE', series: 6, metros: 1000, descansoSeg: 120 }, { zona: 'AER', segundos: 600 },
    ] })
    expect(p.nombre).toBe('6 × 1000')
    expect(p.zona).toBe('PAE')
    expect(p.objetivo).toBeNull()
  })
})

const envio = (e: Partial<Envio>): Envio => ({
  id: 1, de: 'ana', para: 'luis', tipo: 'test', titulo: 'T', contenido: {}, mensaje: null,
  de_nombre: 'Ana Rivas', para_nombre: 'Luis Pérez', para_correo: 'luis@x.es', estado: 'pendiente',
  resultado: null, creado_en: '2026-10-23T10:00:00Z', contestado_en: null, respuesta_vista_en: null, ...e,
})

describe('textos', () => {
  it('el estado, contado a quien lo recibe y a quien lo mandó', () => {
    expect(textoEstado(envio({}), 'recibe')).toBe('Por revisar')
    expect(textoEstado(envio({}), 'manda')).toBe('Luis todavía no ha contestado')
    expect(textoEstado(envio({ estado: 'aceptado' }), 'manda')).toBe('Luis lo ha aceptado')
    expect(textoEstado(envio({ estado: 'cancelado' }), 'recibe')).toBe('Ana lo canceló')
  })
  it('unas zonas sin test propio no dicen «y test»', () => {
    expect(etiquetaTipo(envio({ tipo: 'zonas', contenido: { tests: [] } }))).toBe('Zonas')
    expect(etiquetaTipo(envio({ tipo: 'zonas', contenido: { tests: [{ id: 2, nombre: 'T', deporte: 'Carrera', campos: [], resultados: [], modelo: null }] } }))).toBe('Zonas y test')
  })
  it('dónde queda lo aceptado; la plantilla dice en qué disciplina buscarla', () => {
    expect(dondeQueda(envio({ tipo: 'plantilla', contenido: { disciplina: 'Natacion' } }))).toMatch(/natación/)
    expect(dondeQueda(envio({ tipo: 'test' }))).toMatch(/Tests propios/)
  })
  it('lo que viaja: las mediciones nunca', () => {
    expect(queViaja('test').noViaja.join(' ')).toMatch(/mediciones/)
    expect(queViaja('zonas').noViaja.join(' ')).toMatch(/mediciones/)
    expect(queViaja('plantilla').noViaja.join(' ')).toMatch(/RPE/)
  })
})

describe('nombres repetidos al aceptar', () => {
  const tengo = (p: Partial<LoQueTengo> = {}): LoQueTengo => ({ tests: [], clasificaciones: [], plantillas: {}, copiasPrevias: {}, ...p })
  const testDeAna = { id: 2, nombre: '30-15 IFT', deporte: 'Carrera', campos: [], resultados: [], modelo: null }

  it('un test con un nombre que ya tiene: se propone «(Ana)»', () => {
    const c = conflictosDe(envio({ tipo: 'test', contenido: { tests: [testDeAna] } }), tengo({ tests: [{ id: 9, nombre: '30-15 ift' }] }))
    expect(c.tests).toEqual({ 2: '30-15 IFT (Ana)' })
  })

  it('el que ya le llegó de Ana no choca: se usará ese', () => {
    const c = conflictosDe(envio({ tipo: 'zonas', contenido: { tests: [testDeAna] } }),
      tengo({ tests: [{ id: 9, nombre: '30-15 IFT (Ana)' }], copiasPrevias: { 2: 9 } }))
    expect(c.tests).toEqual({})
    expect(c.yaLosTiene).toEqual(['2'])
  })

  it('…salvo que esa copia ya no esté (archivada o borrada)', () => {
    const c = conflictosDe(envio({ tipo: 'test', contenido: { tests: [testDeAna] } }),
      tengo({ tests: [{ id: 5, nombre: '30-15 IFT' }], copiasPrevias: { 2: 9 } }))
    expect(c.yaLosTiene).toEqual([])
    expect(c.tests).toEqual({ 2: '30-15 IFT (Ana)' })
  })

  it('una plantilla solo choca con las de su disciplina', () => {
    const e = envio({ tipo: 'plantilla', contenido: { nombre: 'Series', disciplina: 'Carrera', bloques: [] } })
    expect(conflictosDe(e, tengo({ plantillas: { Natacion: ['Series'] } })).plantilla).toBeNull()
    expect(conflictosDe(e, tengo({ plantillas: { Carrera: ['series'] } })).plantilla).toBe('Series (Ana)')
  })

  it('unas zonas con el nombre de otras suyas', () => {
    const e = envio({ tipo: 'zonas', contenido: { clasificacion: { nombre: 'Zonas 30-15', deporte: 'Carrera', hitos: [] }, zonas: [], tests: [] } })
    expect(conflictosDe(e, tengo({ clasificaciones: ['Zonas 30-15'] })).clasificacion).toBe('Zonas 30-15 (Ana)')
    expect(conflictosDe(e, tengo()).clasificacion).toBeNull()
  })

  it('las copias previas salen de los envíos ACEPTADOS de ese mismo entrenador', () => {
    const r = copiasPreviasDe([
      { de: 'ana', estado: 'aceptado', resultado: { tests: { 2: 9 } } },
      { de: 'ana', estado: 'rechazado', resultado: { tests: { 3: 10 } } },
      { de: 'otro', estado: 'aceptado', resultado: { tests: { 4: 11 } } },
    ], 'ana')
    expect(r).toEqual({ 2: 9 })
  })
})

describe('cómo se leen las zonas que llegan', () => {
  const tests = [
    { id: 7, nombre: 'Prueba de esfuerzo', deporte: 'Carrera', campos: [], resultados: [{ nombre: 'VT1' }, { nombre: 'VT2' }], modelo: null },
    /* Uno del laboratorio: sus resultados viven en el modelo. */
    { id: 8, nombre: '30-15 IFT', deporte: 'Carrera', campos: [], resultados: [], modelo: { nombre: '30-15 IFT', sueltos: [], bloques: [], resultados: [{ nombre: 'vift' }] } },
  ]
  const nombres = nombresDeHitos(tests)
  const zona = (z: Partial<ZonaEnviada>): ZonaEnviada => ({
    sigla: 'Z2', nombre: 'Aeróbico', pct_min: null, pct_max: null, rpe_min: 3, rpe_max: 4, color: '#38bdf8', orden: 1,
    deporte: 'Carrera', ref_definicion: null, ref_indice: null, desde: null, hasta: null, ...z,
  })

  it('los resultados de un test, de los dos modelos', () => {
    expect(resultadosDe(tests[0])).toEqual(['VT1', 'VT2'])
    expect(resultadosDe(tests[1])).toEqual(['vift'])
    expect(nombres['propia:8:0']).toBe('vift')
  })

  it('una zona entre dos hitos, desde uno, o hasta otro', () => {
    expect(textoZona(zona({ desde: { ref: 'propia:7:0', pct: 100 }, hasta: { ref: 'propia:7:1', pct: 95 } }), nombres)).toBe('100 % de VT1 → 95 % de VT2')
    expect(textoZona(zona({ desde: { ref: 'propia:7:1', pct: 105 } }), nombres)).toBe('desde 105 % de VT2')
    expect(textoZona(zona({ hasta: { ref: 'app:vam', pct: 60 } }), nombres)).toBe('hasta 60 % de VAM')
  })

  it('las de antes (un hito, con % mínimo y máximo)', () => {
    expect(textoZona(zona({ ref_definicion: 8, ref_indice: 0, pct_min: 85, pct_max: 95 }), nombres)).toBe('85–95 % de vift')
    expect(textoZona(zona({ pct_min: 60, pct_max: 75 }), nombres)).toBe('60–75 % de la referencia de la app')
  })

  it('el RPE, rango o número suelto', () => {
    expect(textoRpe(zona({}))).toBe('3–4')
    expect(textoRpe(zona({ rpe_max: null }))).toBe('3')
  })
})

describe('las llamadas a la base', () => {
  const sb = (respuesta: { data?: unknown; error?: { code?: string; message?: string } | null }) => {
    const llamadas: { fn: string; args: unknown }[] = []
    return {
      llamadas,
      rpc: (fn: string, args: unknown) => { llamadas.push({ fn, args }); return Promise.resolve({ data: null, error: null, ...respuesta }) },
    }
  }

  it('buscar manda el correo sin espacios y devuelve uno o nadie', async () => {
    const s = sb({ data: [{ id: 'u1', nombre: 'Luis Pérez' }] })
    expect(await buscarEntrenador(s, '  luis@x.es ')).toEqual({ entrenador: { id: 'u1', nombre: 'Luis Pérez' }, error: null })
    expect(s.llamadas).toEqual([{ fn: 'envio_buscar_entrenador', args: { _email: 'luis@x.es' } }])
    expect((await buscarEntrenador(sb({ data: [] }), 'nadie@x.es')).entrenador).toBeNull()
  })

  it('enviar una plantilla va sin id; un test o unas zonas, sin plantilla', async () => {
    const s = sb({ data: 41 })
    const pl = plantillaParaEnviar({ nombre: 'S', disciplina: 'Carrera', bloques: [{ zona: 'PAE', metros: 1000 }] })
    expect(await enviar(s, 'luis', { tipo: 'plantilla', plantilla: pl }, '  hola  ')).toEqual({ id: 41, error: null })
    await enviar(s, 'luis', { tipo: 'zonas', id: 3 })
    expect(s.llamadas).toEqual([
      { fn: 'enviar_a_entrenador', args: { _para: 'luis', _tipo: 'plantilla', _id: null, _plantilla: pl, _mensaje: 'hola' } },
      { fn: 'enviar_a_entrenador', args: { _para: 'luis', _tipo: 'zonas', _id: 3, _plantilla: null, _mensaje: null } },
    ])
  })

  it('contestar, cancelar y el visto llaman a sus funciones con sus nombres', async () => {
    const s = sb({ data: { estado: 'aceptado', plantilla: 5 } })
    expect((await contestar(s, 7, true, { plantilla: 'Mis series' })).resultado).toEqual({ estado: 'aceptado', plantilla: 5 })
    await contestar(s, 8, false)
    await cancelar(s, 9)
    await marcarRespuestasVistas(s, [1, 2])
    await marcarRespuestasVistas(s, [])
    expect(s.llamadas).toEqual([
      { fn: 'contestar_envio', args: { _id: 7, _aceptar: true, _nombres: { plantilla: 'Mis series' } } },
      { fn: 'contestar_envio', args: { _id: 8, _aceptar: false, _nombres: {} } },
      { fn: 'cancelar_envio', args: { _id: 9 } },
      { fn: 'envio_respuesta_vista', args: { _ids: [1, 2] } },
    ])
  })

  it('el error, con palabras de entrenador; sin la migración, dice cuál falta', async () => {
    expect(errorDeEnvio({ code: 'PGRST202', message: 'Could not find the function public.enviar_a_entrenador' })).toMatch(/envios-entrenadores\.sql/)
    expect(errorDeEnvio({ message: 'Ese test no es tuyo, o está archivado' })).toBe('Ese test no es tuyo, o está archivado')
    expect((await enviar(sb({ error: { message: 'Elige a otro entrenador' } }), 'yo', { tipo: 'test', id: 1 })).error).toBe('Elige a otro entrenador')
    expect(faltaLaTabla({ code: 'PGRST205', message: "Could not find the table 'public.envio_entrenador' in the schema cache" })).toBe(true)
    expect(faltaLaTabla({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(faltaLaTabla(null)).toBe(false)
  })
})

describe('varias cosas en un mismo envío', () => {
  const envioV = (contenido: Envio['contenido']): Envio => ({
    id: 9, de: 'ana', para: 'luis', tipo: 'varios', titulo: 'T', contenido, mensaje: null,
    de_nombre: 'Ana Rivas', para_nombre: 'Luis Pérez', para_correo: 'luis@x.es', estado: 'pendiente',
    resultado: null, creado_en: '2026-10-23T10:00:00Z', contestado_en: null, respuesta_vista_en: null,
  })
  const test = (id: number, nombre: string) => ({ id, nombre, deporte: 'Carrera', campos: [], resultados: [], modelo: null })
  const zonas = (nombre: string) => ({ clasificacion: { nombre, deporte: 'Carrera', hitos: [] }, zonas: [] })
  const pl = (nombre: string, disciplina = 'Carrera') => ({ nombre, disciplina, bloques: [{ zona: 'PAE', metros: 1000 }] })

  it('«a», «a y b», «a, b y c»', () => {
    expect(listaY([])).toBe('')
    expect(listaY(['a'])).toBe('a')
    expect(listaY(['a', 'b'])).toBe('a y b')
    expect(listaY(['a', 'b', 'c'])).toBe('a, b y c')
  })

  it('el resumen cuenta cada cosa, en singular o en plural', () => {
    expect(resumenVarios({ tests: [test(1, 'T')], clasificaciones: [zonas('Z')], plantillas: [pl('A'), pl('B')] }))
      .toBe('1 test, 1 clasificación de zonas y 2 plantillas')
    expect(resumenVarios({ tests: [test(1, 'T'), test(2, 'U')] })).toBe('2 tests')
    expect(resumenVarios(null)).toBe('nada')
  })

  it('las zonas que salen de un test: las que lo usan de hito', () => {
    const cs = [{ id: 1, hitos: ['propia:8:0'] }, { id: 2, hitos: ['app:vam'] }, { id: 3, hitos: ['propia:80:0', 'propia:8:1'] }, { id: 4, hitos: null }]
    expect(zonasDeTest(8, cs).map(c => c.id)).toEqual([1, 3])
  })

  it('se llama «Varios» y dice dónde queda cada cosa', () => {
    const e = envioV({ tests: [test(1, 'T')], clasificaciones: [zonas('Z')], plantillas: [] })
    expect(etiquetaTipo(e)).toBe('Varios')
    expect(dondeQueda(e)).toBe('Está en tus Tests propios y tus Zonas propias.')
    expect(dondeQueda(envioV({ plantillas: [pl('A')], tests: [], clasificaciones: [] }))).toBe('Está en tus plantillas.')
  })

  /* Como hace la base al aceptar: lo que se va creando también cuenta. */
  it('los nombres chocan con lo tuyo y también entre ellos, en el orden en que vienen', () => {
    const e = envioV({
      tests: [test(1, 'Rampa'), test(2, 'rampa')],
      plantillas: [pl('Series'), pl('Series'), pl('Series', 'Natacion')],
      clasificaciones: [zonas('Zonas 30-15'), zonas('Otras')],
    })
    const c = conflictosDe(e, { tests: [], clasificaciones: ['zonas 30-15'], plantillas: { Carrera: ['Series'] }, copiasPrevias: {} })
    expect(c.tests).toEqual({ 2: 'rampa (Ana)' })
    expect(c.plantillas).toEqual({ 0: 'Series (Ana)', 1: 'Series (Ana 2)' })
    expect(c.clasificaciones).toEqual({ 0: 'Zonas 30-15 (Ana)' })
    /* Los de un envío suelto no se tocan. */
    expect(c.plantilla).toBeNull()
    expect(c.clasificacion).toBeNull()
  })

  it('enviarVarios llama a su función con sus nombres', async () => {
    const llamadas: { fn: string; args: unknown }[] = []
    const sb = { rpc: (fn: string, args: unknown) => { llamadas.push({ fn, args }); return Promise.resolve({ data: 77, error: null }) } }
    const p = plantillaParaEnviar(pl('Series'))
    expect(await enviarVarios(sb, 'luis', { plantillas: [p], tests: [8], clasificaciones: [2] }, ' hola ')).toEqual({ id: 77, error: null })
    expect(llamadas).toEqual([{ fn: 'enviar_varios_a_entrenador', args: { _para: 'luis', _plantillas: [p], _tests: [8], _clasificaciones: [2], _mensaje: 'hola' } }])
  })
})

describe('el SQL de «varios»', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'envios-varios.sql'), 'utf8')

  it('no lleva «--»', () => {
    expect(sql).not.toContain('--')
  })

  it('la función nueva, cerrada a anon y abierta a quien ha entrado; las reescritas, igual', () => {
    for (const firma of ['enviar_varios_a_entrenador(uuid, jsonb, bigint[], bigint[], text)', 'enviar_a_entrenador(uuid, text, bigint, jsonb, text)', 'contestar_envio(bigint, boolean, jsonb)']) {
      expect(sql).toContain('revoke execute on function public.' + firma + ' from anon;')
      expect(sql).toContain('grant execute on function public.' + firma + ' to authenticated;')
    }
  })

  it('los ayudantes nuevos no los puede llamar nadie desde fuera', () => {
    for (const firma of ['envio_destino(uuid, uuid, text)', 'envio_fotos_tests(bigint[])', 'envio_foto_clasificacion(uuid, bigint)',
      'envio_copiar_tests(uuid, public.envio_entrenador, jsonb)', 'envio_copiar_plantilla(uuid, jsonb, text, text)',
      'envio_copiar_clasificacion(uuid, jsonb, jsonb, jsonb, text, text)']) {
      expect(sql).toContain('revoke all on function public.' + firma + ' from public, anon, authenticated;')
    }
  })

  it('«varios» entra en los tipos que admite la tabla', () => {
    expect(sql).toContain("check (tipo in ('plantilla', 'test', 'zonas', 'varios'))")
  })
})

describe('el SQL de la migración', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'envios-entrenadores.sql'), 'utf8')

  /* La regla del proyecto: el SQL que se pega no lleva comentarios de guiones. */
  it('no lleva «--»', () => {
    expect(sql).not.toContain('--')
  })

  it('las cinco funciones que llama la app existen, cerradas a anon y abiertas a quien ha entrado', () => {
    for (const [fn, firma] of [
      ['envio_buscar_entrenador', 'text'],
      ['enviar_a_entrenador', 'uuid, text, bigint, jsonb, text'],
      ['contestar_envio', 'bigint, boolean, jsonb'],
      ['cancelar_envio', 'bigint'],
      ['envio_respuesta_vista', 'bigint[]'],
    ]) {
      expect(sql).toMatch(new RegExp('create or replace function public\\.' + fn + '\\('))
      expect(sql).toContain('revoke execute on function public.' + fn + '(' + firma + ') from anon;')
      expect(sql).toContain('grant execute on function public.' + fn + '(' + firma + ') to authenticated;')
    }
  })

  it('las que mandan son security definer con search_path fijo', () => {
    const definers = sql.match(/security definer set search_path = public/g) || []
    expect(definers.length).toBe(5)
  })

  it('la tabla solo se lee: nadie escribe a mano', () => {
    expect(sql).toContain('revoke insert, update, delete, truncate on public.envio_entrenador from authenticated;')
    expect(sql).toMatch(/create policy envio_entrenador_lee on public\.envio_entrenador\s+for select/)
    expect(sql).not.toMatch(/create policy [a-z_]+ on public\.envio_entrenador\s+for (insert|update|delete|all)/)
  })
})
