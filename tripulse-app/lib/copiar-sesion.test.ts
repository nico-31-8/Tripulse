import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  copiarSesiones, leerOrigen, escribirCopias, idsEnOrden, comoLista, limpiar,
  SIN_COPIAR_SESION, SIN_COPIAR_TAREA, SIN_COPIAR_HIJA,
} from './copiar-sesion'

type Fila = Record<string, any>

/* Un cliente de mentira que apunta cada operación. Las inserciones devuelven
   ids nuevos y, con `desordena`, en orden inverso: la base no promete el orden
   de lo que devuelve, y emparejar por posición colgaría los metros de una tarea
   en otra. */
function sbFalso(datos: Record<string, Fila[]>, o: { falla?: string; desordena?: boolean; devuelveMenos?: string } = {}) {
  const ops: { op: 'select' | 'insert'; tabla: string; v?: Fila[]; cols?: string }[] = []
  let n = 1000
  const from = (tabla: string) => ({
    select(cols?: string) {
      const filtros: [string, any[]][] = []
      const q: any = {
        in(c: string, vals: any[]) { filtros.push([c, vals]); return q },
        order() { return q },
        then(res: any, rej: any) {
          ops.push({ op: 'select', tabla, cols })
          const filas = (datos[tabla] || []).filter(f => filtros.every(([c, vals]) => vals.map(Number).includes(Number(f[c]))))
          return Promise.resolve({ data: filas, error: null }).then(res, rej)
        },
      }
      return q
    },
    insert(v: Fila[]) {
      ops.push({ op: 'insert', tabla, v })
      const resultado = () => {
        if (o.falla === tabla) return { data: null, error: { message: 'RLS en ' + tabla } }
        let creadas = v.map(() => ({ id: ++n }))
        if (o.devuelveMenos === tabla) creadas = creadas.slice(1)
        if (o.desordena) creadas = creadas.slice().reverse()
        return { data: creadas, error: null }
      }
      return {
        select: () => Promise.resolve(resultado()),
        then: (res: any, rej: any) => Promise.resolve({ error: resultado().error }).then(res, rej),
      }
    },
  })
  return { ops, from, inserciones: (t: string) => ops.filter(x => x.op === 'insert' && x.tabla === t) }
}

/* Una sesión YA ENTRENADA: lleva lo que se planeó y lo que pasó, y la copia
   tiene que quedarse solo con lo primero. */
const SESION: Fila = {
  id: 1, created_at: 'ayer', fecha_sesion: '2026-03-04', id_microciclo: 5, id_deportista: 7,
  origen: 'deportista', id_emision: null,
  estado: 'Realizada', eliminada: false, notas_atleta: 'piernas cargadas', duracion_real: 55,
  hora_inicio: '2026-03-04T07:00:00Z', rpe_reportado: 8, rpe_origen: 'atleta', notas_post: 'bien',
  propuesta_ia: { nombre: 'x' }, cambiada_por: 'u1', cambiada_en: 'hoy',
  disciplina: 'Carrera', duracion_minutos: 60, rpe_estimado: 6, notas_entrenador: 'suave',
  usar_cronometro: true, modo_fuerza: null, zona_fuerza: null, modo_resistencia: 'compleja',
  zona_resistencia: null, transiciones: [{ despues_de: 1, segundos: 90 }],
  valores_por_defecto: { descanso: 90 }, test: { tipo: 'bateria', id: 'cooper' },
  nutricion_carbo_gh: 60, nutricion_notas: 'gel a los 40',
}

const TAREAS: Fila[] = [
  /* Llega primero la de orden 2, como podría devolverla la base. */
  {
    id: 12, id_sesion: 1, orden: 2, created_at: 'ayer', id_deportista: 7,
    disciplina: 'Carrera', zona_entrenamiento: 'N3', zona_copia: { sigla: 'N3', fuente: 'clasif:9' },
    tecnica_id: null, series: 6, descanso_segundos: 90, comentario: null, bloques: null,
    fc_media: 161, rpe_reportado: 8, duracion_real: 31, resultado: { rondas: 3 }, comentario_leido: true,
    sensacion_tecnica: 4, dolor_muscular: 2, sensacion_general: 'bien', notas_post: 'x',
    valoracion_tecnica_entrenador: 3, hrv_del_dia: 55,
    p_distancia: [{ id: 31, id_tarea: 12, id_deportista: 7, metros_planeados: 400, ritmo_objetivo: '3:50 /km', metros_reales: 410, ritmo_medio: 228 }],
    p_duracion: [], p_repeticiones: [], ejercicios: [],
  },
  {
    id: 11, id_sesion: 1, orden: 1, created_at: 'ayer', id_deportista: 7,
    disciplina: 'Carrera', zona_entrenamiento: 'AEL', zona_copia: null, tecnica_id: 44,
    series: 1, descanso_segundos: null, comentario: 'skipping', bloques: null,
    /* Un embed uno a uno llega como objeto, no como lista. */
    p_distancia: null,
    p_duracion: { id: 41, id_tarea: 11, tiempo_planeado: 900, tiempo_real: 880, potencia_objetivo: null, potencia_real: null, ritmo_objetivo: '5:00 /km' },
    p_repeticiones: [], ejercicios: [],
  },
]

const FUERZA: Fila = { id: 2, fecha_sesion: '2026-03-05', id_microciclo: 5, id_deportista: 7, disciplina: 'Fuerza', estado: 'Planificada', modo_fuerza: 'compleja' }
const TAREA_FUERZA: Fila = {
  id: 21, id_sesion: 2, orden: 1, disciplina: 'Fuerza', zona_entrenamiento: 'F2', series: 4,
  p_distancia: [], p_duracion: [],
  p_repeticiones: [{ id: 51, id_tarea: 21, repeticiones_planteadas: 8, repeticiones_planteadas_max: 10, repeticiones_reales: 9 }],
  ejercicios: [
    { id: 62, id_tarea: 21, nombre: 'Peso muerto', orden: 2, series: 4, repeticiones: 8, series_detalle: [{ reps: 8 }] },
    { id: 61, id_tarea: 21, nombre: 'Sentadilla', orden: 1, series: 4, repeticiones: 8, ejercicio_id: 300 },
  ],
}

const datos = () => ({ sesion: [SESION, FUERZA], tarea: [...TAREAS, TAREA_FUERZA] })
const destino = (origen: number, fecha: string) =>
  ({ origen, campos: { fecha_sesion: fecha, id_microciclo: 6, id_deportista: 7, origen: 'entrenador' }, idDeportista: 7 })

describe('copiarSesiones', () => {
  it('copia la sesión, sus tareas y lo que cuelga, cada cosa a su tarea', async () => {
    const sb = sbFalso(datos(), { desordena: true })
    const r = await copiarSesiones(sb, [destino(1, '2026-03-11')])
    expect(r.error).toBeNull()
    expect(r.ids).toEqual([1001])

    const [tar] = sb.inserciones('tarea')
    /* En su orden, no en el que llegaron. */
    expect(tar.v!.map(t => t.orden)).toEqual([1, 2])
    expect(tar.v!.every(t => t.id_sesion === 1001)).toBe(true)

    /* Los ids volvieron al revés y aun así cada hija va a la suya: la de orden
       1 (tiempo) es la 1002 y la de orden 2 (metros) la 1003. */
    expect(sb.inserciones('p_duracion')[0].v![0]).toMatchObject({ id_tarea: 1002, tiempo_planeado: 900 })
    expect(sb.inserciones('p_distancia')[0].v![0]).toMatchObject({ id_tarea: 1003, metros_planeados: 400 })
  })

  it('copia lo que se le olvidaba al calendario', async () => {
    const sb = sbFalso(datos())
    await copiarSesiones(sb, [destino(1, '2026-03-11')])
    const [ses] = sb.inserciones('sesion')
    expect(ses.v![0]).toMatchObject({
      test: { tipo: 'bateria', id: 'cooper' },
      valores_por_defecto: { descanso: 90 },
      transiciones: [{ despues_de: 1, segundos: 90 }],
      nutricion_carbo_gh: 60, nutricion_notas: 'gel a los 40',
      usar_cronometro: true, modo_resistencia: 'compleja',
    })
    const [tar] = sb.inserciones('tarea')
    expect(tar.v![0].tecnica_id).toBe(44)
    expect(tar.v![1].zona_copia).toEqual({ sigla: 'N3', fuente: 'clasif:9' })
    /* El objetivo es prescripción: dentro del mismo atleta viaja. */
    expect(sb.inserciones('p_distancia')[0].v![0].ritmo_objetivo).toBe('3:50 /km')
    expect(sb.inserciones('p_duracion')[0].v![0].ritmo_objetivo).toBe('5:00 /km')
  })

  it('no copia nada de lo que el atleta hizo', async () => {
    const sb = sbFalso(datos())
    await copiarSesiones(sb, [destino(1, '2026-03-11')])
    const ses = sb.inserciones('sesion')[0].v![0]
    expect(ses.estado).toBe('Planificada')
    for (const k of ['rpe_reportado', 'duracion_real', 'notas_atleta', 'hora_inicio', 'notas_post', 'rpe_origen', 'propuesta_ia', 'cambiada_por', 'id', 'created_at']) {
      expect(ses).not.toHaveProperty(k)
    }
    const t = sb.inserciones('tarea')[0].v![1]
    for (const k of ['fc_media', 'rpe_reportado', 'duracion_real', 'resultado', 'comentario_leido', 'sensacion_tecnica', 'dolor_muscular', 'hrv_del_dia', 'p_distancia', 'id']) {
      expect(t).not.toHaveProperty(k)
    }
    expect(sb.inserciones('p_distancia')[0].v![0]).not.toHaveProperty('metros_reales')
    expect(sb.inserciones('p_distancia')[0].v![0]).not.toHaveProperty('ritmo_medio')
    expect(sb.inserciones('p_duracion')[0].v![0]).not.toHaveProperty('tiempo_real')
  })

  it('el destino manda en la fecha, el microciclo y de quién es', async () => {
    const sb = sbFalso(datos())
    await copiarSesiones(sb, [destino(1, '2026-03-11')])
    expect(sb.inserciones('sesion')[0].v![0]).toMatchObject({ fecha_sesion: '2026-03-11', id_microciclo: 6, id_deportista: 7, origen: 'entrenador' })
    expect(sb.inserciones('tarea')[0].v!.every(t => t.id_deportista === 7)).toBe(true)
    expect(sb.inserciones('p_distancia')[0].v![0].id_deportista).toBe(7)
  })

  it('la fuerza viaja con su rango de repeticiones y sus ejercicios en orden', async () => {
    const sb = sbFalso(datos())
    await copiarSesiones(sb, [destino(2, '2026-03-12')])
    expect(sb.inserciones('p_repeticiones')[0].v![0]).toEqual({ repeticiones_planteadas: 8, repeticiones_planteadas_max: 10, id_tarea: 1002, id_deportista: 7 })
    const ejs = sb.inserciones('ejercicios')[0].v!
    expect(ejs.map(e => e.nombre)).toEqual(['Sentadilla', 'Peso muerto'])
    expect(ejs[0].ejercicio_id).toBe(300)
    expect(ejs[1].series_detalle).toEqual([{ reps: 8 }])
  })

  /* Lo que hacía lenta la semana: un viaje por fila. Ahora, pegar varias
     sesiones es UNA inserción por tabla, sean las que sean. */
  it('una semana entera son cuatro escrituras, no una por tarea', async () => {
    const sb = sbFalso(datos(), { desordena: true })
    const r = await copiarSesiones(sb, [destino(1, '2026-03-11'), destino(2, '2026-03-12'), destino(1, '2026-03-13')])
    expect(r.error).toBeNull()
    expect(r.ids).toEqual([1001, 1002, 1003])
    expect(sb.ops.filter(x => x.op === 'select')).toHaveLength(2)
    for (const t of ['sesion', 'tarea', 'p_distancia', 'p_duracion', 'p_repeticiones', 'ejercicios']) {
      expect(sb.inserciones(t)).toHaveLength(1)
    }
    expect(sb.inserciones('sesion')[0].v!.map(s => s.fecha_sesion)).toEqual(['2026-03-11', '2026-03-12', '2026-03-13'])
    /* Cada tarea en su sesión: dos de la primera, una de la de fuerza, dos de la tercera. */
    expect(sb.inserciones('tarea')[0].v!.map(t => t.id_sesion)).toEqual([1001, 1001, 1002, 1003, 1003])
    /* Y los metros de la tercera, en la tarea de la tercera. */
    expect(sb.inserciones('p_distancia')[0].v!.map(p => p.id_tarea)).toEqual([1005, 1008])
  })

  it('sin ritmo cuando se copia a otra persona', async () => {
    const sb = sbFalso(datos())
    await copiarSesiones(sb, [destino(1, '2026-03-11')], { sinRitmo: true })
    expect(sb.inserciones('p_distancia')[0].v![0]).not.toHaveProperty('ritmo_objetivo')
    expect(sb.inserciones('p_duracion')[0].v![0]).not.toHaveProperty('ritmo_objetivo')
    expect(sb.inserciones('p_distancia')[0].v![0].metros_planeados).toBe(400)
  })

  it('sin idDeportista se lo deja al disparador', async () => {
    const sb = sbFalso(datos())
    await copiarSesiones(sb, [{ origen: 1, campos: { fecha_sesion: '2026-03-11', id_microciclo: 6, origen: 'entrenador' } }])
    expect(sb.inserciones('sesion')[0].v![0]).not.toHaveProperty('id_deportista')
    expect(sb.inserciones('tarea')[0].v![0]).not.toHaveProperty('id_deportista')
  })

  it('una sesión sin tareas se crea igual y no escribe nada más', async () => {
    const sb = sbFalso({ sesion: [{ id: 9, disciplina: 'Natacion' }], tarea: [] })
    const r = await copiarSesiones(sb, [destino(9, '2026-03-11')])
    expect(r).toEqual({ ids: [1001], error: null })
    expect(sb.ops.filter(x => x.op === 'insert').map(x => x.tabla)).toEqual(['sesion'])
  })

  it('si no se puede crear la sesión, lo dice y no sigue', async () => {
    const sb = sbFalso(datos(), { falla: 'sesion' })
    const r = await copiarSesiones(sb, [destino(1, '2026-03-11')])
    expect(r.ids).toEqual([null])
    expect(r.error).toMatch(/RLS en sesion/)
    expect(sb.inserciones('tarea')).toHaveLength(0)
  })

  it('si fallan las tareas, la sesión existe y se dice qué faltó', async () => {
    const sb = sbFalso(datos(), { falla: 'tarea' })
    const r = await copiarSesiones(sb, [destino(1, '2026-03-11')])
    expect(r.ids).toEqual([1001])
    expect(r.error).toMatch(/tareas no/)
  })

  it('si fallan los metros o las repeticiones, también se dice', async () => {
    const sb = sbFalso(datos(), { falla: 'p_distancia' })
    const r = await copiarSesiones(sb, [destino(1, '2026-03-11')])
    expect(r.error).toMatch(/no todo lo que llevan dentro/)
  })

  /* Si la base devuelve menos filas de las mandadas no se empareja a ciegas. */
  it('si las cuentas no cuadran, no cuelga nada de nadie', async () => {
    const sb = sbFalso(datos(), { devuelveMenos: 'tarea' })
    const r = await copiarSesiones(sb, [destino(1, '2026-03-11')])
    expect(r.error).toMatch(/no se pudo comprobar/)
    expect(sb.inserciones('p_distancia')).toHaveLength(0)
  })

  it('un origen que ya no existe no tumba a los demás', async () => {
    const sb = sbFalso(datos())
    const r = await copiarSesiones(sb, [destino(99, '2026-03-11'), destino(2, '2026-03-12')])
    expect(r.ids).toEqual([null, 1001])
    expect(r.error).toMatch(/ya no existe/)
  })

  it('sin destinos no consulta nada', async () => {
    const sb = sbFalso(datos())
    expect(await copiarSesiones(sb, [])).toEqual({ ids: [], error: null })
    expect(sb.ops).toHaveLength(0)
  })

  /* Para copiar lo mismo a varias personas: se lee una vez. */
  it('leerOrigen + escribirCopias: un origen leído sirve para varios destinos', async () => {
    const sb = sbFalso(datos())
    const origen = await leerOrigen(sb, [1])
    await escribirCopias(sb, origen, [destino(1, '2026-03-11')])
    await escribirCopias(sb, origen, [destino(1, '2026-03-18')])
    expect(sb.ops.filter(x => x.op === 'select')).toHaveLength(2)
    expect(sb.inserciones('sesion')).toHaveLength(2)
  })
})

describe('idsEnOrden', () => {
  it('ordena de menor a mayor, que es el orden en que se crearon', () => {
    expect(idsEnOrden([{ id: 7 }, { id: 5 }, { id: 6 }], 3)).toEqual([5, 6, 7])
  })
  it('si faltan o sobran, null', () => {
    expect(idsEnOrden([{ id: 1 }], 2)).toBeNull()
    expect(idsEnOrden(null, 1)).toBeNull()
  })
  it('cero de cero es una lista vacía', () => {
    expect(idsEnOrden([], 0)).toEqual([])
  })
})

describe('comoLista y limpiar', () => {
  it('un embed llega como lista, objeto o nada', () => {
    expect(comoLista([{ a: 1 }])).toEqual([{ a: 1 }])
    expect(comoLista({ a: 1 })).toEqual([{ a: 1 }])
    expect(comoLista(null)).toEqual([])
    expect(comoLista(undefined)).toEqual([])
  })
  it('limpiar quita lo de la lista y deja lo demás', () => {
    expect(limpiar({ id: 1, metros_planeados: 400, metros_reales: 410 }, SIN_COPIAR_HIJA)).toEqual({ metros_planeados: 400 })
    expect(limpiar(null, SIN_COPIAR_HIJA)).toEqual({})
  })
})

/*
  LA LISTA ES DE LO QUE NO SE COPIA, así que una columna nueva viaja sola. Eso
  está bien si es de prescripción, y mal si guarda lo que el atleta hizo. Para
  que nadie tenga que acordarse, este test lee los .sql del repo: cada columna
  que se añade a estas seis tablas tiene que estar decidida, aquí abajo como
  «se copia» o en las listas de lib/copiar-sesion como «no se copia».
*/
const SE_COPIA: Record<string, string[]> = {
  sesion: [
    'disciplina', 'duracion_minutos', 'rpe_estimado', 'notas_entrenador', 'usar_cronometro',
    'modo_fuerza', 'zona_fuerza', 'modo_resistencia', 'zona_resistencia', 'transiciones',
    'valores_por_defecto', 'test',
    'nutricion_carbo_gh', 'nutricion_agua_mlh', 'nutricion_sodio_mgh', 'nutricion_cafeina_mg',
    'nutricion_cafeina_timing', 'nutricion_ayuno', 'nutricion_notas',
  ],
  tarea: [
    'zona_entrenamiento', 'orden', 'disciplina', 'series', 'descanso_segundos', 'comentario',
    'hora', 'tecnica_id', 'zona_copia', 'bloques', 'descanso_bloques_segundos', 'formato', 'formato_config',
  ],
  p_distancia: ['metros_planeados', 'ritmo_objetivo'],
  p_duracion: ['tiempo_planeado', 'potencia_objetivo', 'ritmo_objetivo'],
  p_repeticiones: ['repeticiones_planteadas', 'repeticiones_planteadas_max'],
  ejercicios: [
    'nombre', 'grupo_muscular', 'series', 'repeticiones', 'intensidad', 'descanso_segundos',
    'notas_ejecucion', 'tipo_serie', 'ejercicio_encadenado_id', 'ejercicio_encadenado_nombre',
    'escalones_drop', 'url_video', 'control_tipo', 'control_valor', 'encadenado_series',
    'encadenado_repeticiones', 'encadenado_intensidad', 'ejercicio_id', 'cardio_modo',
    'cardio_medida', 'cardio_valor', 'cardio_zona', 'cardio_objetivo', 'medida', 'cantidad',
    'orden', 'repeticiones_max', 'encadenado_repeticiones_max', 'encadenado_grupo_muscular',
    'encadenado_control_tipo', 'encadenado_control_valor', 'encadenado_notas_ejecucion',
    'series_detalle', 'encadenado_series_detalle',
  ],
}
const NO_SE_COPIA: Record<string, Set<string>> = {
  sesion: SIN_COPIAR_SESION, tarea: SIN_COPIAR_TAREA,
  p_distancia: SIN_COPIAR_HIJA, p_duracion: SIN_COPIAR_HIJA, p_repeticiones: SIN_COPIAR_HIJA, ejercicios: SIN_COPIAR_HIJA,
}

/* Las columnas que había en la base el 15-10-2026, sacadas de information_schema. */
const ESQUEMA: Record<string, string[]> = {
  sesion: ['id', 'id_microciclo', 'fecha_sesion', 'duracion_minutos', 'rpe_estimado', 'disciplina', 'estado', 'notas_entrenador', 'notas_atleta', 'created_at', 'usar_cronometro', 'duracion_real', 'hora_inicio', 'rpe_reportado', 'eliminada', 'id_deportista', 'modo_fuerza', 'zona_fuerza', 'nutricion_carbo_gh', 'nutricion_agua_mlh', 'nutricion_sodio_mgh', 'nutricion_cafeina_mg', 'nutricion_cafeina_timing', 'nutricion_ayuno', 'nutricion_notas', 'origen', 'transiciones', 'modo_resistencia', 'zona_resistencia', 'propuesta_ia', 'id_emision', 'rpe_origen', 'valores_por_defecto', 'notas_post', 'test', 'cambiada_por', 'cambiada_en'],
  tarea: ['id', 'id_sesion', 'zona_entrenamiento', 'orden', 'disciplina', 'fc_media', 'duracion_real', 'series', 'descanso_segundos', 'comentario', 'hora', 'rpe_reportado', 'sensacion_tecnica', 'dolor_muscular', 'sensacion_general', 'notas_post', 'valoracion_tecnica_entrenador', 'hrv_del_dia', 'created_at', 'comentario_leido', 'id_deportista', 'tecnica_id', 'zona_copia', 'bloques', 'descanso_bloques_segundos', 'formato', 'formato_config', 'resultado'],
  p_distancia: ['id', 'id_tarea', 'metros_planeados', 'metros_reales', 'ritmo_objetivo', 'ritmo_medio', 'id_deportista'],
  p_duracion: ['id', 'id_tarea', 'tiempo_planeado', 'tiempo_real', 'potencia_objetivo', 'potencia_real', 'id_deportista', 'ritmo_objetivo'],
  p_repeticiones: ['id', 'id_tarea', 'repeticiones_planteadas', 'repeticiones_reales', 'id_deportista', 'repeticiones_planteadas_max'],
  ejercicios: ['id', 'id_tarea', 'nombre', 'grupo_muscular', 'series', 'repeticiones', 'intensidad', 'descanso_segundos', 'notas_ejecucion', 'tipo_serie', 'ejercicio_encadenado_id', 'ejercicio_encadenado_nombre', 'escalones_drop', 'url_video', 'id_deportista', 'control_tipo', 'control_valor', 'encadenado_series', 'encadenado_repeticiones', 'encadenado_intensidad', 'ejercicio_id', 'cardio_modo', 'cardio_medida', 'cardio_valor', 'cardio_zona', 'cardio_objetivo', 'medida', 'cantidad', 'orden', 'repeticiones_max', 'encadenado_repeticiones_max', 'encadenado_grupo_muscular', 'encadenado_control_tipo', 'encadenado_control_valor', 'encadenado_notas_ejecucion', 'series_detalle', 'encadenado_series_detalle'],
}

const decidida = (tabla: string, col: string) => SE_COPIA[tabla].includes(col) || NO_SE_COPIA[tabla].has(col)

describe('cada columna está decidida: se copia o no', () => {
  it('todas las de la base de hoy', () => {
    const sinDecidir = Object.entries(ESQUEMA).flatMap(([t, cols]) => cols.filter(c => !decidida(t, c)).map(c => t + '.' + c))
    expect(sinDecidir).toEqual([])
  })

  it('ninguna está en las dos listas a la vez', () => {
    const enLasDos = Object.entries(SE_COPIA).flatMap(([t, cols]) => cols.filter(c => NO_SE_COPIA[t].has(c)).map(c => t + '.' + c))
    expect(enLasDos).toEqual([])
  })

  it('y cualquiera que añada un .sql del repo', () => {
    const dir = path.resolve(__dirname, '..', 'supabase')
    const sinDecidir: string[] = []
    let vistas = 0
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8')
      for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?([^;]*)/gi)) {
        const tabla = m[1].toLowerCase()
        if (!(tabla in SE_COPIA)) continue
        for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) {
          vistas++
          const col = c[1].toLowerCase()
          if (!decidida(tabla, col)) sinDecidir.push(f + ': ' + tabla + '.' + col)
        }
      }
    }
    /* Que el test lea de verdad: si un cambio de formato lo dejara ciego,
       pasaría siempre. */
    expect(vistas).toBeGreaterThan(30)
    expect(sinDecidir).toEqual([])
  })
})

/* La copia vive en un sitio. Con una por pantalla, cada una se olvidaba de una
   columna distinta. */
describe('nadie más copia tareas a mano', () => {
  const RAIZ = path.resolve(__dirname, '..')
  for (const rel of [
    'app/planificacion-visual/[id]/calendario/page.tsx',
    'app/mesociclo/[id]/vista/page.tsx',
    'lib/grupos-volcado.ts',
  ]) {
    it(rel + ' pasa por copiarSesiones', () => {
      const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8')
      expect(src).toMatch(/copiarSesiones|escribirCopias/)
      expect(src).not.toMatch(/from\(['"]tarea['"]\)\s*\.insert/)
      expect(src).not.toMatch(/from\(['"](p_distancia|p_duracion|p_repeticiones|ejercicios)['"]\)\s*\.insert/)
    })
  }
})
