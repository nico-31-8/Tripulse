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
  faseTraspaso, puedoContestar, chipEstado, traspasoContestado, textoCupo, loQueUsa, textoLoQueUsa, sinLoSuyo,
  pedirTraspaso, entrenadorTieneSitio, misTraspasosPendientes, contestarTraspasoDeportista, COLUMNAS_ENVIO,
  type Envio, type ZonaEnviada, type LoQueTengo, type LoQueUsaEntrada,
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

describe('el traspaso de un deportista', () => {
  const marta = { id: 29, nombre: 'Marta López', tiene_cuenta: true, solo_test: false }
  const traspaso = (e: Partial<Envio> = {}): Envio => envio({
    tipo: 'deportista', titulo: 'Traspaso de Marta López', contenido: { deportista: marta, con_lo_suyo: true, tests: [], clasificaciones: [] },
    id_deportista: 29, deportista_usuario: 'u-marta', acepta_entrenador_en: null, acepta_deportista_en: null, rechaza: null, ...e,
  })
  const ya = '2026-10-23T11:00:00Z'

  it('en qué va: dos respuestas, la del entrenador y la del deportista', () => {
    expect(faseTraspaso(traspaso())).toBe('pendiente')
    expect(faseTraspaso(traspaso({ acepta_entrenador_en: ya }))).toBe('falta-deportista')
    expect(faseTraspaso(traspaso({ acepta_deportista_en: ya }))).toBe('falta-entrenador')
    expect(faseTraspaso(traspaso({ estado: 'aceptado', acepta_entrenador_en: ya, acepta_deportista_en: ya }))).toBe('aceptado')
    expect(faseTraspaso(traspaso({ estado: 'rechazado', rechaza: 'deportista' }))).toBe('rechazado')
    expect(faseTraspaso(traspaso({ estado: 'cancelado' }))).toBe('cancelado')
  })

  it('a quien lo recibe le toca contestar hasta que acepta; luego espera al deportista', () => {
    expect(puedoContestar(traspaso())).toBe(true)
    expect(puedoContestar(traspaso({ acepta_deportista_en: ya }))).toBe(true)
    expect(puedoContestar(traspaso({ acepta_entrenador_en: ya }))).toBe(false)
    expect(puedoContestar(traspaso({ estado: 'aceptado' }))).toBe(false)
    expect(puedoContestar(envio({}))).toBe(true)
    expect(puedoContestar(envio({ estado: 'rechazado' }))).toBe(false)
  })

  /* Los textos de la maqueta aprobada. */
  it('contado a Luis, que lo recibe', () => {
    expect(textoEstado(traspaso(), 'recibe')).toBe('Por revisar')
    expect(textoEstado(traspaso({ acepta_entrenador_en: ya }), 'recibe')).toBe('Falta que conteste Marta. Hasta entonces sigue con Ana')
    expect(textoEstado(traspaso({ acepta_deportista_en: ya }), 'recibe')).toMatch(/^Marta ya ha dicho que sí/)
    expect(textoEstado(traspaso({ estado: 'aceptado' }), 'recibe')).toBe('Marta ya está en tu lista')
    expect(textoEstado(traspaso({ estado: 'rechazado', rechaza: 'deportista' }), 'recibe')).toBe('Marta prefiere seguir con Ana: no cambia nada')
    expect(textoEstado(traspaso({ estado: 'rechazado', rechaza: 'entrenador' }), 'recibe')).toBe('Lo rechazaste: no cambia nada')
  })

  it('contado a Ana, que lo pidió', () => {
    expect(textoEstado(traspaso(), 'manda')).toBe('Esperando a Luis y a Marta')
    expect(textoEstado(traspaso({ deportista_usuario: null }), 'manda')).toBe('Luis todavía no ha contestado')
    expect(textoEstado(traspaso({ acepta_entrenador_en: ya }), 'manda')).toBe('Luis lo ha aceptado. Falta que conteste Marta')
    expect(textoEstado(traspaso({ acepta_deportista_en: ya }), 'manda')).toBe('Marta lo ha aceptado. Falta que conteste Luis')
    expect(textoEstado(traspaso({ estado: 'aceptado' }), 'manda')).toBe('Marta ya está con Luis')
    expect(textoEstado(traspaso({ estado: 'rechazado', rechaza: 'deportista' }), 'manda')).toBe('Marta prefiere seguir contigo')
    expect(textoEstado(traspaso({ estado: 'rechazado', rechaza: 'entrenador' }), 'manda')).toBe('Luis lo ha rechazado')
  })

  it('el chip dice a quién le falta; lo demás, como siempre', () => {
    expect(chipEstado(traspaso({ acepta_entrenador_en: ya }), 'manda')).toEqual({ texto: 'Falta Marta', tono: 'ambar' })
    expect(chipEstado(traspaso({ acepta_entrenador_en: ya }), 'recibe')).toEqual({ texto: 'Falta Marta', tono: 'ambar' })
    expect(chipEstado(traspaso({ acepta_deportista_en: ya }), 'manda')).toEqual({ texto: 'Falta Luis', tono: 'ambar' })
    expect(chipEstado(traspaso({ acepta_deportista_en: ya }), 'recibe')).toEqual({ texto: 'Por revisar', tono: 'ambar' })
    expect(chipEstado(traspaso({ estado: 'rechazado', rechaza: 'deportista' }), 'manda')).toEqual({ texto: 'Marta dijo que no', tono: 'rojo' })
    expect(chipEstado(traspaso({ estado: 'aceptado' }), 'recibe')).toEqual({ texto: 'Aceptado', tono: 'bien' })
    expect(chipEstado(envio({}), 'manda')).toEqual({ texto: 'Sin contestar', tono: 'ambar' })
    expect(chipEstado(envio({ estado: 'cancelado' }), 'recibe')).toEqual({ texto: 'Cancelado', tono: 'neutro' })
  })

  it('lo que se le dice a quien acaba de contestar', () => {
    expect(traspasoContestado(traspaso(), false, null)).toBe('Rechazado: Marta sigue con Ana.')
    expect(traspasoContestado(traspaso(), true, { estado: 'pendiente' })).toBe('Aceptado. Falta que conteste Marta: hasta entonces sigue con Ana.')
    expect(traspasoContestado(traspaso(), true, { estado: 'cancelado', motivo: 'Ese deportista ya no es de quien te lo pasaba' }))
      .toBe('Ya no se puede: Ese deportista ya no es de quien te lo pasaba.')
    expect(traspasoContestado(traspaso(), true, { estado: 'aceptado' })).toBe('Aceptado. Marta ya está en tu lista de deportistas.')
  })

  it('dónde queda y qué es: con lo suyo, dice adónde llegó', () => {
    expect(etiquetaTipo(traspaso())).toBe('Deportista')
    const t = { id: 3, nombre: '30-15 IFT', deporte: 'Carrera', campos: [], resultados: [], modelo: null }
    const z = { clasificacion: { nombre: 'Zonas 30-15', deporte: 'Carrera', hitos: [] }, zonas: [] }
    expect(dondeQueda(traspaso({ contenido: { deportista: marta, tests: [t], clasificaciones: [z] } })))
      .toBe('Marta ya está en tu lista de deportistas. Lo que usaba te ha llegado a tus Tests propios y tus Zonas propias.')
  })

  it('lo que no viaja: tus cobros, vuestros mensajes y tus grupos', () => {
    const { viaja, noViaja } = queViaja('deportista', 'Luis Pérez')
    expect(viaja.join(' ')).toMatch(/historial/)
    expect(noViaja).toEqual(['Tus cobros: siguen en tu libreta', 'Vuestros mensajes: Luis empieza de cero', 'Tus grupos: sale de ellos'])
    expect(queViaja('deportista').noViaja[1]).toBe('Vuestros mensajes: su nuevo entrenador empieza de cero')
  })

  it('el cupo: cuántos te quedarían, o que está lleno; sin cupo, nada', () => {
    expect(textoCupo(null)).toBeNull()
    expect(textoCupo({ cupo: null, tengo: 40 })).toBeNull()
    expect(textoCupo({ cupo: 10, tengo: 7 })).toEqual({ texto: 'Ocupa un sitio de tu cupo: te quedarían 2 libres.', lleno: false })
    expect(textoCupo({ cupo: 10, tengo: 8 })?.texto).toBe('Ocupa un sitio de tu cupo: te quedaría 1 libre.')
    expect(textoCupo({ cupo: 10, tengo: 9 })?.texto).toBe('Ocupa un sitio de tu cupo: no te quedaría ninguno libre.')
    expect(textoCupo({ cupo: 2, tengo: 2 })).toEqual({ texto: 'Tu cupo está lleno (2 de 2 deportistas): para aceptarlo tienes que hacer sitio.', lleno: true })
  })

  it('las columnas nuevas van en lo que piden las pantallas', () => {
    for (const c of ['id_deportista', 'deportista_usuario', 'acepta_entrenador_en', 'acepta_deportista_en', 'rechaza']) {
      expect(COLUMNAS_ENVIO.split(', ')).toContain(c)
    }
  })
})

describe('lo tuyo que usa un deportista (la misma regla que pedir_traspaso)', () => {
  const base = (p: Partial<LoQueUsaEntrada> = {}): LoQueUsaEntrada => ({
    misTests: [{ id: 3, nombre: '30-15 IFT' }, { id: 4, nombre: 'Cooper' }, { id: 5, nombre: 'Archivado' }],
    misClasificaciones: [
      { id: 10, nombre: 'Zonas 30-15', hitos: ['propia:3:0'] },
      { id: 11, nombre: 'Zonas Cooper', hitos: ['propia:4:0'] },
      { id: 12, nombre: 'Zonas mixtas', hitos: ['propia:3:0', 'propia:4:0'] },
    ],
    misZonas: [
      { id: 100, id_clasificacion: 10, ref_definicion: null, desde: null, hasta: { ref: 'propia:3:0', pct: 80 } },
      { id: 110, id_clasificacion: 11, ref_definicion: null, desde: null, hasta: { ref: 'propia:4:0', pct: 80 } },
      { id: 120, id_clasificacion: 12, ref_definicion: null, desde: { ref: 'app:vam', pct: 50 }, hasta: null },
    ],
    mediciones: [], ajustes: [], sesiones: [], ...p,
  })

  it('sin nada suyo, nada', () => {
    expect(loQueUsa(base())).toEqual({ tests: [], zonas: [], ejercicios: [] })
  })

  it('un test tuyo con mediciones suyas va, con las zonas que salen de él (y sus otros tests)', () => {
    expect(loQueUsa(base({ mediciones: [{ id_definicion: 3 }] }))).toEqual({
      tests: [{ id: 3, nombre: '30-15 IFT' }, { id: 4, nombre: 'Cooper' }],
      zonas: [{ id: 10, nombre: 'Zonas 30-15' }, { id: 12, nombre: 'Zonas mixtas' }],
      ejercicios: [],
    })
  })

  it('un test que no es tuyo no va, aunque tenga mediciones suyas', () => {
    expect(loQueUsa(base({ mediciones: [{ id_definicion: 99 }] }))).toEqual({ tests: [], zonas: [], ejercicios: [] })
  })

  it('cuentan también sus ajustes de zona y sus días de test; también un test archivado', () => {
    expect(loQueUsa(base({ ajustes: [{ id_zona: 110, desde: null, hasta: { ref: 'propia:5:0', pct: 90 } }] }))).toEqual({
      tests: [{ id: 4, nombre: 'Cooper' }, { id: 5, nombre: 'Archivado' }],
      zonas: [{ id: 11, nombre: 'Zonas Cooper' }],
      ejercicios: [],
    })
    /* Su día de test del Cooper: van sus zonas, y «Zonas mixtas» se lleva también el 30-15. */
    expect(loQueUsa(base({ sesiones: [{ test: { origen: 'propio', id: 4 } }, { test: { origen: 'bateria', clave: 'cooper' } }] }))).toEqual({
      tests: [{ id: 3, nombre: '30-15 IFT' }, { id: 4, nombre: 'Cooper' }],
      zonas: [{ id: 11, nombre: 'Zonas Cooper' }, { id: 12, nombre: 'Zonas mixtas' }],
      ejercicios: [],
    })
  })

  it('unas zonas que salen de un test que no es tuyo, o sin zonas, se quedan (como en la base)', () => {
    const r = loQueUsa(base({
      misClasificaciones: [
        { id: 10, nombre: 'Zonas 30-15', hitos: ['propia:3:0', 'propia:77:0'] },
        { id: 13, nombre: 'Vacía', hitos: ['propia:3:0'] },
      ],
      mediciones: [{ id_definicion: 3 }],
    }))
    expect(r).toEqual({ tests: [{ id: 3, nombre: '30-15 IFT' }], zonas: [], ejercicios: [] })
  })

  it('una zona archivada no cuenta para el cálculo, pero un ajuste en ella sí lleva su clasificación', () => {
    const r = loQueUsa(base({
      misZonas: [
        { id: 100, id_clasificacion: 10, ref_definicion: null, desde: null, hasta: { ref: 'propia:3:0', pct: 80 } },
        { id: 101, id_clasificacion: 10, ref_definicion: 4, desde: null, hasta: null, archivada: true },
      ],
      ajustes: [{ id_zona: 101, desde: { ref: 'app:vam', pct: 70 }, hasta: null }],
    }))
    expect(r).toEqual({ tests: [{ id: 3, nombre: '30-15 IFT' }], zonas: [{ id: 10, nombre: 'Zonas 30-15' }], ejercicios: [] })
  })

  /* Los ejercicios de tu biblioteca (supabase/envios-traspaso-ejercicios.sql). */
  it('van los ejercicios tuyos que tiene en sus sesiones: fuerza, encadenado y técnica; una vez cada uno, por nombre', () => {
    const r = loQueUsa(base({
      misEjercicios: [{ id: 50, nombre: 'Sentadilla búlgara' }, { id: 51, nombre: 'Hip thrust' }, { id: 52, nombre: 'Skipping' }, { id: 53, nombre: 'No lo usa' }],
      usosDeEjercicios: [
        { ejercicio_id: 50, ejercicio_encadenado_id: 51 },
        { ejercicio_id: 50, ejercicio_encadenado_id: null },
        { tecnica_id: 52 },
        /* Del común o de otro: no son tuyos y ya los lee el nuevo. */
        { ejercicio_id: 900, ejercicio_encadenado_id: 901 },
      ],
    }))
    expect(r.ejercicios).toEqual([{ id: 51, nombre: 'Hip thrust' }, { id: 50, nombre: 'Sentadilla búlgara' }, { id: 52, nombre: 'Skipping' }])
    expect(r.tests).toEqual([])
  })

  it('se dice como en la maqueta', () => {
    expect(textoLoQueUsa({ tests: [{ nombre: '30-15 IFT' }], zonas: [{ nombre: 'Zonas 30-15' }] })).toBe('El test «30-15 IFT» y las zonas «Zonas 30-15»')
    expect(textoLoQueUsa({ tests: [{ nombre: 'A' }, { nombre: 'B' }], zonas: [] })).toBe('Los tests «A» y «B»')
    expect(textoLoQueUsa({ tests: [], zonas: [{ nombre: 'Z' }] })).toBe('Las zonas «Z»')
  })

  it('con ejercicios: se nombran tres y se cuentan los demás', () => {
    expect(textoLoQueUsa({ tests: [{ nombre: '30-15 IFT' }], zonas: [{ nombre: 'Zonas 30-15' }], ejercicios: [{ nombre: 'Hip thrust' }] }))
      .toBe('El test «30-15 IFT», las zonas «Zonas 30-15» y un ejercicio tuyo («Hip thrust»)')
    expect(textoLoQueUsa({ tests: [], zonas: [], ejercicios: [{ nombre: 'A' }, { nombre: 'B' }, { nombre: 'C' }, { nombre: 'D' }, { nombre: 'E' }] }))
      .toBe('5 ejercicios tuyos («A», «B», «C» y 2 más)')
  })

  it('lo que no tendrá quien lo recibe sin la casilla, según lo que viaje', () => {
    expect(sinLoSuyo({ tests: [1], zonas: [1], ejercicios: [1] }, 'Luis'))
      .toBe('Si no, Luis no podrá apuntarle mediciones nuevas con esos tests, no podrá usar esas zonas y verá sus sesiones sin el vídeo ni la técnica de esos ejercicios.')
    expect(sinLoSuyo({ tests: [], zonas: [], ejercicios: [1] }, 'Luis')).toBe('Si no, Luis verá sus sesiones sin el vídeo ni la técnica de esos ejercicios.')
    expect(sinLoSuyo({ tests: [], zonas: [] }, 'Luis')).toBe('')
  })
})

describe('las llamadas del traspaso', () => {
  const sb = (respuesta: { data?: unknown; error?: { code?: string; message?: string } | null }) => {
    const llamadas: { fn: string; args: unknown }[] = []
    return {
      llamadas,
      rpc: (fn: string, args?: unknown) => { llamadas.push({ fn, args }); return Promise.resolve({ data: null, error: null, ...respuesta }) },
    }
  }

  it('pedirlo, preguntar el sitio y contestar como deportista llaman a sus funciones con sus nombres', async () => {
    const s = sb({ data: 12 })
    expect(await pedirTraspaso(s, 'luis', 29, true, '  Se muda  ')).toEqual({ id: 12, error: null })
    await pedirTraspaso(s, 'luis', 30, false)
    await contestarTraspasoDeportista(s, 12, true)
    expect(s.llamadas).toEqual([
      { fn: 'pedir_traspaso', args: { _para: 'luis', _id_deportista: 29, _con_lo_suyo: true, _mensaje: 'Se muda' } },
      { fn: 'pedir_traspaso', args: { _para: 'luis', _id_deportista: 30, _con_lo_suyo: false, _mensaje: null } },
      { fn: 'contestar_traspaso_deportista', args: { _id: 12, _aceptar: true } },
    ])
  })

  it('el sitio: sí, no, o no se sabe (null) si la base no contesta un sí o un no', async () => {
    expect(await entrenadorTieneSitio(sb({ data: true }), 'luis')).toBe(true)
    expect(await entrenadorTieneSitio(sb({ data: false }), 'luis')).toBe(false)
    expect(await entrenadorTieneSitio(sb({ data: null }), 'luis')).toBeNull()
    expect(await entrenadorTieneSitio(sb({ error: { message: 'x' } }), 'luis')).toBeNull()
  })

  it('lo que tiene que contestar el deportista, con sus campos', async () => {
    const r = await misTraspasosPendientes(sb({ data: [{ id: '12', de_nombre: 'Ana Rivas', para_nombre: 'Luis Pérez', mensaje: null, creado_en: '2026-10-23T10:00:00Z', ya_acepte: false }] }))
    expect(r).toEqual({ traspasos: [{ id: 12, de_nombre: 'Ana Rivas', para_nombre: 'Luis Pérez', mensaje: null, creado_en: '2026-10-23T10:00:00Z', ya_acepte: false }], error: null })
    expect((await misTraspasosPendientes(sb({ error: { message: 'x' } }))).traspasos).toEqual([])
  })

  it('sin la migración del traspaso, dice cuál falta', () => {
    expect(errorDeEnvio({ code: 'PGRST202', message: 'Could not find the function public.pedir_traspaso(_con_lo_suyo, _id_deportista, _mensaje, _para)' }))
      .toMatch(/envios-traspaso\.sql/)
    expect(errorDeEnvio({ code: 'PGRST202', message: 'Could not find the function public.enviar_a_entrenador' })).toMatch(/envios-entrenadores\.sql/)
  })
})

describe('el SQL del traspaso', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'envios-traspaso.sql'), 'utf8')
  const ensayo = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'envios-traspaso-ensayo.sql'), 'utf8')

  it('no lleva «--», ni la migración ni su ensayo', () => {
    expect(sql).not.toContain('--')
    expect(ensayo).not.toContain('--')
  })

  /* Lo que se ensayó es lo que se aplicó: el ensayo lleva la migración entera. */
  it('el ensayo lleva la migración tal cual, y acaba deshaciéndolo todo', () => {
    expect(ensayo).toContain(sql)
    expect(ensayo.trim()).toMatch(/raise exception 'INFORME:%'[\s\S]*end \$fin\$;$/)
  })

  it('las funciones que llama la app, cerradas a anon y abiertas a quien ha entrado', () => {
    for (const [fn, firma] of [
      ['entrenador_tiene_sitio', 'uuid'],
      ['pedir_traspaso', 'uuid, bigint, boolean, text'],
      ['contestar_traspaso_deportista', 'bigint, boolean'],
      ['mis_traspasos_pendientes', ''],
      ['contestar_envio', 'bigint, boolean, jsonb'],
    ]) {
      expect(sql).toContain('revoke execute on function public.' + fn + '(' + firma + ') from anon;')
      expect(sql).toContain('grant execute on function public.' + fn + '(' + firma + ') to authenticated;')
    }
  })

  it('el traspaso en sí no lo llama nadie desde fuera: solo el último que acepta', () => {
    expect(sql).toContain('revoke all on function public.envio_hacer_traspaso(bigint) from public, anon, authenticated;')
    expect(sql).not.toMatch(/grant execute on function public\.envio_hacer_traspaso/)
  })

  it('las mediciones se mueven a las copias, no se duplican', () => {
    expect(sql).toMatch(/update test_medicion m set id_definicion = \(_mapa->>_k\)::bigint/)
    expect(sql).not.toMatch(/insert into test_medicion/)
  })

  it('los cobros, de su entrenador; y el chat, cada uno el suyo', () => {
    for (const t of ['cargo', 'cobro', 'tarifa', 'cobros_lista']) {
      expect(sql).toContain('alter table public.' + t + ' add column if not exists id_entrenador uuid')
      expect(sql).toContain('create policy ' + t + '_solo_su_entrenador on public.' + t)
    }
    expect(sql).toMatch(/create policy mensajes_rw on public\.mensajes[\s\S]*?using \(\(id_entrenador = \(select auth\.uid\(\)\)\)/)
  })
})

describe('los ejercicios de tu biblioteca en un traspaso', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'envios-traspaso-ejercicios.sql'), 'utf8')
  const ensayo = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'envios-traspaso-ejercicios-ensayo.sql'), 'utf8')

  it('dónde quedan: también en tu biblioteca', () => {
    const e = envio({
      tipo: 'deportista',
      contenido: { deportista: { id: 29, nombre: 'Marta López', tiene_cuenta: true, solo_test: false }, ejercicios: [{ id: 50, nombre: 'Hip thrust' }] },
    })
    expect(dondeQueda(e)).toBe('Marta ya está en tu lista de deportistas. Lo que usaba te ha llegado a tu biblioteca de ejercicios.')
  })

  it('no lleva «--», ni la migración ni su ensayo; y el ensayo la lleva tal cual y lo deshace todo', () => {
    expect(sql).not.toContain('--')
    expect(ensayo).not.toContain('--')
    expect(ensayo).toContain(sql)
    expect(ensayo.trim()).toMatch(/raise exception 'INFORME:%'[\s\S]*end \$fin\$;$/)
  })

  it('el ayudante y el traspaso no los llama nadie desde fuera; pedirlo, quien ha entrado', () => {
    expect(sql).toContain('revoke all on function public.envio_copiar_ejercicios(uuid, envio_entrenador) from public, anon, authenticated;')
    expect(sql).toContain('revoke all on function public.envio_hacer_traspaso(bigint) from public, anon, authenticated;')
    expect(sql).not.toMatch(/grant execute on function public\.(envio_copiar_ejercicios|envio_hacer_traspaso)/)
    expect(sql).toContain('revoke execute on function public.pedir_traspaso(uuid, bigint, boolean, text) from anon;')
    expect(sql).toContain('grant execute on function public.pedir_traspaso(uuid, bigint, boolean, text) to authenticated;')
  })

  /* La copia es un ejercicio suyo NUEVO: con origen_id taparía al del común en su lista (lib/biblioteca-propia). */
  it('la copia no lleva origen_id, y sus sesiones pasan a ella: el ejercicio, el encadenado y la técnica', () => {
    const insercion = sql.match(/insert into ejercicios_biblioteca \(([^)]*)\)/)?.[1] || ''
    expect(insercion).toContain('id_entrenador')
    expect(insercion).not.toContain('origen_id')
    expect(insercion).not.toContain('id_deportista')
    expect(sql).toMatch(/update ejercicios x set ejercicio_id = /)
    expect(sql).toMatch(/update ejercicios x set ejercicio_encadenado_id = /)
    expect(sql).toMatch(/update tarea t set tecnica_id = /)
  })

  it('solo los tuyos: ni los del común ni los de un deportista', () => {
    expect(sql).toMatch(/where b\.id_entrenador = _yo and b\.id_deportista is null\s+and b\.id in/)
  })
})
