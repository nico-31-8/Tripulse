// ============================================================
// TRIPULSE — Series por grupo muscular
// ============================================================
//
// Cuántas series se han hecho de cada grupo. Es la medida con la que se controla
// el volumen de fuerza, y hasta ahora estaba escrita DOS VECES, cada una con sus
// reglas:
//
//   /volumen  →  if (e.grupo_muscular) ... + (e.series || 0)
//   el canvas →  (e.grupo_muscular || 'Sin clasificar') ... + (e.series || 1)
//
// O sea, la misma pregunta con dos respuestas distintas:
//
//   · Un ejercicio SIN grupo desaparecía del gráfico de /volumen y salía como
//     «Sin clasificar» en el del canvas. En /volumen el total era menor que el
//     de verdad y nada lo decía, que es la peor forma de equivocarse.
//   · Una fila sin número de series contaba 0 en una y 1 en la otra.
//
// Aquí se decide una vez:
//
//   SIN GRUPO NO ES DESAPARECER. Va a «Sin clasificar», que además es lo que
//   escribe el atleta cuando se crea un ejercicio y no dice de qué es. Un montón
//   visible se puede arreglar; uno invisible no se sabe ni que está.
//
//   SIN SERIES CUENTA 0, NO 1. Contar una desconocida como una es inventarse un
//   dato. El grupo sigue apareciendo, así que el hueco se ve en vez de taparse.

import { leerConfig, leerResultado, ordenarLineas, seriesDeLinea, type LineaBloque } from './bloque-formato'

export const SIN_CLASIFICAR = 'Sin clasificar'

export interface EjercicioSeries {
  grupo_muscular?: string | null
  series?: number | null
  /** Para saber si es una línea de cardio, que no son series de fuerza. */
  tipo_serie?: string | null
  cardio_modo?: string | null
  /* ============================================================
     El segundo ejercicio de una superserie
     ============================================================
     NO TIENE FILA PROPIA: una superserie es UNA fila de `ejercicios` con el
     segundo colgado en columnas `encadenado_*`. Por eso sus series no se
     contaban en ningún sitio: no había grupo al que sumárselas.

     Son dos ejercicios de verdad, normalmente de grupos OPUESTOS —dominadas
     con flexiones, remo con press—, así que perderse el segundo no es perder
     un poco de cada cosa: es dejar un grupo entero a cero. */
  ejercicio_encadenado_id?: number | null
  ejercicio_encadenado_nombre?: string | null
  encadenado_series?: number | null
  encadenado_grupo_muscular?: string | null
}

/**
 * Las columnas que hay que traer de `ejercicios` para poder contar bien.
 *
 * ESTÁ AQUÍ, al lado de quien las usa, y hay un test que recorre el código y
 * exige que todo el que cuente series las pida. Un `select` al que le falte
 * `encadenado_grupo_muscular` no da error: devuelve `undefined`, el segundo
 * ejercicio cae en «Sin clasificar» o desaparece, y nadie se entera.
 */
export const COLUMNAS_SERIES =
  'grupo_muscular, series, tipo_serie, cardio_modo, ejercicio_encadenado_id, ejercicio_encadenado_nombre, encadenado_series, encadenado_grupo_muscular' as const

export interface GrupoSeries {
  grupo: string
  /** Las series del periodo entero. */
  series: number
  /**
   * Lo que el entrenador dijo que debería llevar ese grupo a la semana.
   *
   * `null` cuando no lo ha dicho, que es lo normal y no es un fallo: entonces
   * manda la banda genérica. Un objetivo inventado sería peor que ninguno.
   */
  objetivo?: number | null
  /**
   * Las de una semana media de ese periodo.
   *
   * Es el número que hay que MIRAR. El volumen de fuerza se piensa siempre por
   * semana —nadie dice «hago 40 series de glúteo», dice «hago 10 a la semana»—,
   * y el gráfico sumaba el periodo elegido sin decir cuál era: las mismas «5
   * series» eran 2,5 por semana con el botón de 2 sem y 0,6 con el de 8. La
   * barra se veía igual en los dos casos.
   */
  porSemana: number
}

/**
 * Las series de cada grupo, de más a menos.
 *
 * El nombre del grupo se usa TAL CUAL como clave: «Glúteos» y «Gluteo» son dos
 * grupos distintos porque son dos cadenas distintas. Por eso el formulario de
 * crear un ejercicio ofrece los que ya existen en vez de dejar escribir libre.
 */
/**
 * UNA LÍNEA DE CARDIO NO SON SERIES DE FUERZA.
 *
 * No tiene grupo muscular, así que caía en «Sin clasificar»: cuatro series de
 * remo salían como cuatro series de fuerza sin clasificar en el volumen por
 * músculo. Su trabajo ya cuenta donde toca, en la duración y la carga.
 *
 * Está suelto y exportado porque lo miran DOS: el recuento por grupo y el
 * desglose que se abre al pulsar un grupo. Con la regla copiada, el desglose
 * sumaría distinto que la fila de la que cuelga — y entonces el entrenador deja
 * de fiarse de los dos números, no solo del que está mal.
 */
export const esCardio = (e: EjercicioSeries | null | undefined): boolean =>
  e?.tipo_serie === 'Cardio' || !!e?.cardio_modo

/** Las series de un ejercicio, 0 si no es un número que valga. */
const seriesDe = (e: EjercicioSeries | null | undefined): number => cuantas(e?.series)
const cuantas = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Si la fila lleva un segundo ejercicio colgado. */
export const esSuperserie = (e: EjercicioSeries | null | undefined): boolean =>
  e?.ejercicio_encadenado_id != null || !!(e?.ejercicio_encadenado_nombre || '').trim()

/** Una línea de las que cuentan: un ejercicio con su grupo y sus series. */
export interface LineaQueCuenta {
  grupo: string
  series: number
  nombre: string
}

/**
 * EN QUÉ SE CONVIERTE UNA FILA AL CONTAR: en una línea, o en DOS si es
 * superserie. Es el único sitio que lo decide, y de aquí comen el volumen, el
 * dibujo de la planificación y el panel de la semana.
 *
 * Antes cada contador leía `grupo_muscular` y `series` de la fila y ya está,
 * así que de «Dominadas + Flexiones» solo contaba las dominadas y el pectoral
 * se quedaba a cero.
 *
 * SI NO SE SABE CUÁNTAS VECES SE HACE EL SEGUNDO, se usan las del primero. No
 * es inventarse un dato: una superserie es A y luego B, tantas rondas como
 * diga la serie, así que estructuralmente son las mismas. Lo que sí sería
 * inventar es poner un 1 por defecto, y por eso no se hace.
 */
export function lineasDe(
  e: (EjercicioSeries & { nombre?: string | null }) | null | undefined,
): LineaQueCuenta[] {
  if (!e || esCardio(e)) return []
  const out: LineaQueCuenta[] = [{
    grupo: (e.grupo_muscular || '').trim() || SIN_CLASIFICAR,
    series: cuantas(e.series),
    nombre: (e.nombre || '').trim() || 'Sin nombre',
  }]
  if (esSuperserie(e)) {
    out.push({
      grupo: (e.encadenado_grupo_muscular || '').trim() || SIN_CLASIFICAR,
      series: cuantas(e.encadenado_series ?? e.series),
      nombre: (e.ejercicio_encadenado_nombre || '').trim() || 'Sin nombre',
    })
  }
  return out
}

export interface EjercicioDelGrupo {
  nombre: string
  series: number
  /** En cuántas líneas distintas aparece, que no es lo mismo que sus series. */
  veces: number
}

/**
 * De qué ejercicios se compone un grupo, de más series a menos.
 *
 * Es lo que se abre al pulsar el nombre: «Hombro · 6» no dice si son seis de
 * press militar o dos de tres ejercicios distintos, y para decidir qué mandar
 * esa diferencia lo es todo.
 *
 * Lo que no tiene nombre se junta en «Sin nombre» en vez de perderse: si se
 * tirara, el desglose sumaría menos que la fila y no habría forma de saber por
 * qué.
 */
export function ejerciciosDeGrupo(
  ejercicios: (EjercicioSeries & { nombre?: string | null })[] | null | undefined,
  grupo: string,
): EjercicioDelGrupo[] {
  const buscado = (grupo || '').trim() || SIN_CLASIFICAR
  const mapa = new Map<string, { series: number; veces: number }>()

  for (const e of ejercicios || []) {
    for (const l of lineasDe(e)) {
      if (l.grupo.toLowerCase() !== buscado.toLowerCase()) continue
      const a = mapa.get(l.nombre) || { series: 0, veces: 0 }
      a.series += l.series
      a.veces += 1
      mapa.set(l.nombre, a)
    }
  }

  return [...mapa.entries()]
    .map(([nombre, x]) => ({ nombre, series: x.series, veces: x.veces }))
    .sort((a, b) => (b.series - a.series) || a.nombre.localeCompare(b.nombre, 'es'))
}

export function seriesPorGrupo(
  ejercicios: EjercicioSeries[] | null | undefined,
  /* Cuántos días abarca lo que se le pasa. Por defecto una semana, que es lo
     que mira el canvas. /volumen le pasa los de su selector. */
  diasDelPeriodo = 7,
): GrupoSeries[] {
  const semanas = Math.max(1, (Number(diasDelPeriodo) || 7) / 7)
  const mapa = new Map<string, number>()
  for (const e of ejercicios || []) {
    for (const l of lineasDe(e)) mapa.set(l.grupo, (mapa.get(l.grupo) || 0) + l.series)
  }
  return [...mapa.entries()]
    .map(([grupo, series]) => ({ grupo, series, porSemana: Math.round((series / semanas) * 10) / 10 }))
    /* De más a menos, y a igualdad por nombre: sin el segundo criterio, dos
       grupos con las mismas series se colocaban según el orden en que llegaran
       de la base y el gráfico bailaba entre recargas. */
    .sort((a, b) => (b.series - a.series) || a.grupo.localeCompare(b.grupo, 'es'))
}

/**
 * Trae las series por grupo de un atleta en los últimos `dias`.
 *
 * Solo sesiones REALIZADAS: esto es lo que se ha hecho, no lo que hay puesto en
 * el calendario. Y de la papelera no sale nada, igual que en el resto de la app.
 */
/**
 * En un AMRAP hecho, las series de cada línea son las rondas que hizo el
 * atleta, no las que se estimaron al programarlo: lo guardado en `series` es
 * esa estimación, y el resultado es lo que de verdad pasó. En el resto de
 * formatos lo guardado ya es exacto (4 rondas son 4 rondas).
 */
export function conRondasHechas(
  tareas: { id: number; formato?: string | null; formato_config?: unknown; resultado?: unknown }[],
  ejs: (EjercicioSeries & { id_tarea?: number | null; id?: number | null; orden?: number | null })[],
): EjercicioSeries[] {
  const amrap = new Map(tareas.filter(t => t.formato === 'amrap' && leerResultado(t.resultado)).map(t => [t.id, t]))
  if (!amrap.size) return ejs
  return ejs.map(e => {
    const t = e.id_tarea != null ? amrap.get(e.id_tarea) : undefined
    if (!t) return e
    const lineas = ordenarLineas(ejs.filter(x => x.id_tarea === t.id) as LineaBloque[])
    const i = lineas.findIndex(l => l.id === e.id)
    return { ...e, series: seriesDeLinea('amrap', leerConfig(t.formato_config), lineas, Math.max(0, i), leerResultado(t.resultado)) }
  })
}

export async function cargarSeriesDeGrupos(
  sb: any,
  idDeportista: number,
  dias: number,
  desdeISO: string,
): Promise<GrupoSeries[]> {
  const { data: ses } = await sb.from('sesion')
    .select('id, eliminada')
    .eq('id_deportista', idDeportista).eq('estado', 'Realizada')
    .gte('fecha_sesion', desdeISO)

  const ids = (ses || []).filter((s: any) => !s.eliminada).map((s: any) => s.id)
  if (!ids.length) return []

  const { data: tareas } = await sb.from('tarea').select('id, formato, formato_config, resultado').in('id_sesion', ids)
  const idsTarea = (tareas || []).map((t: any) => t.id)
  if (!idsTarea.length) return []

  const { data: ejs } = await sb.from('ejercicios')
    .select('id, id_tarea, orden, nombre, grupo_muscular, series, tipo_serie, cardio_modo, ejercicio_encadenado_id, ejercicio_encadenado_nombre, encadenado_series, encadenado_grupo_muscular').in('id_tarea', idsTarea)

  return seriesPorGrupo(conRondasHechas(tareas || [], ejs || []), dias)
}

/**
 * Pega los objetivos del entrenador a lo que se ha hecho.
 *
 * Un grupo con objetivo pero SIN nada hecho también sale, con cero. Es el caso
 * que más importa ver: le dijiste que hiciera seis series de glúteo y no ha
 * hecho ninguna. Si solo se listaran los grupos entrenados, ese hueco sería
 * justo el que no aparece.
 */
export function conObjetivos(
  grupos: GrupoSeries[],
  objetivos: Record<string, number> | null | undefined,
): GrupoSeries[] {
  const obj = objetivos || {}
  const salida = grupos.map(g => ({ ...g, objetivo: obj[g.grupo] ?? null }))

  for (const [grupo, series] of Object.entries(obj)) {
    if (!salida.some(g => g.grupo === grupo)) {
      salida.push({ grupo, series: 0, porSemana: 0, objetivo: series })
    }
  }
  return salida.sort((a, b) => (b.porSemana - a.porSemana) || a.grupo.localeCompare(b.grupo, 'es'))
}

/** Qué parte del objetivo lleva cumplida, en tanto por ciento. Null si no hay objetivo. */
export function cumplimientoDe(g: GrupoSeries): number | null {
  if (g.objetivo == null || g.objetivo <= 0) return null
  return Math.round((g.porSemana / g.objetivo) * 100)
}

export async function cargarObjetivos(sb: any, idDeportista: number): Promise<Record<string, number>> {
  const { data } = await sb.from('objetivo_series')
    .select('grupo_muscular, series_semana').eq('id_deportista', idDeportista)
  const mapa: Record<string, number> = {}
  for (const o of data || []) mapa[o.grupo_muscular] = Number(o.series_semana)
  return mapa
}

/**
 * Fija o quita el objetivo de un grupo.
 *
 * `null` lo borra en vez de guardar un cero: cero series es una prescripción
 * («no toques ese grupo»), y no decir nada es otra cosa. Guardar cero por «no
 * lo sé» convertiría un silencio en una orden.
 */
export async function fijarObjetivo(
  sb: any,
  idDeportista: number,
  grupo: string,
  series: number | null,
): Promise<string | null> {
  if (series == null) {
    const { error } = await sb.from('objetivo_series').delete()
      .eq('id_deportista', idDeportista).eq('grupo_muscular', grupo)
    return error?.message || null
  }
  const { error } = await sb.from('objetivo_series')
    .upsert({ id_deportista: idDeportista, grupo_muscular: grupo, series_semana: series, actualizado_en: new Date().toISOString() },
      { onConflict: 'id_deportista,grupo_muscular' })
  return error?.message || null
}

/** El total, para poder decir porcentajes sin volver a sumar por otro lado. */
export function totalSeries(grupos: GrupoSeries[]): number {
  return grupos.reduce((a, g) => a + g.series, 0)
}

/** El porcentaje que se lleva un grupo. 0 si no hay nada, sin dividir por cero. */
export function porcentajeDe(series: number, total: number): number {
  return total > 0 ? Math.round((series / total) * 100) : 0
}

/**
 * ============================================================
 * Las bandas dependen de PARA QUÉ entrena la persona
 * ============================================================
 *
 * Un mismo número dice lo contrario según el objetivo. Doce series semanales de
 * cuádriceps son una semana normal tirando a corta para quien busca hipertrofia,
 * y son el techo de todo lo que un triatleta debería hacer en su bloque más
 * duro. Con un solo juego de umbrales, a uno se le pinta un aviso rojo estando
 * donde debe y al otro se le dice «carga alta» como si fuera una meta.
 *
 * DE DÓNDE SALEN ESTOS NÚMEROS
 * Ni el vault ni la NSCA dan «series por grupo y semana»: dan series POR
 * EJERCICIO Y SESIÓN. Así que están derivados, y conviene saberlo antes de
 * tocarlos.
 *
 * Resistencia — de B3-01-Fuerza-General-Triatlon:
 *   · Mantenimiento y competición: 1–2 sesiones/sem × 2–3 series  →   2–6
 *   · Adaptación anatómica:        2–3 sesiones/sem × 2–3 series  →   4–9
 *   · Fuerza máxima:               2 sesiones/sem × 3–5 series, y su propia
 *     sesión tipo mete dos ejercicios al mismo grupo (sentadilla 4 + step-up 3)
 *                                                                 →  hasta 14
 *   El propio vault avisa: «2 sesiones/semana, no más — el volumen de
 *   resistencia es prioritario». Por encima de 12 se está quitando pierna a las
 *   sesiones de carrera, que es lo que se venía a proteger.
 *
 * Hipertrofia — de Hoffman 2002 y NSCA (3–5 series por ejercicio), con una
 *   semana normal de 2 sesiones por grupo y 2 ejercicios por sesión:
 *                                              2 × 2 × 4          →  ~16
 *   Con tres sesiones se va a ~24. De ahí el rango 10–20 como zona de trabajo.
 *
 * Son derivados, no citados. Si tienes otros que prefieras, se cambian aquí y
 * cambian en toda la app.
 */
export const OBJETIVOS = [
  {
    id: 'resistencia',
    label: 'Deportes de resistencia',
    bandas: [
      { id: 'mantenimiento', label: 'Mantenimiento', rango: '< 4 / semana', hasta: 4 },
      { id: 'desarrollo', label: 'Desarrollo', rango: '4–8 / semana', hasta: 8 },
      { id: 'carga-alta', label: 'Carga alta', rango: '9–12 / semana', hasta: 12 },
      { id: 'sobrevolumen', label: 'Sobrevolumen', rango: '> 12 / semana', hasta: Infinity },
    ],
  },
  {
    id: 'hipertrofia',
    label: 'Hipertrofia',
    bandas: [
      { id: 'mantenimiento', label: 'Por debajo', rango: '< 10 / semana', hasta: 10 },
      { id: 'desarrollo', label: 'Desarrollo', rango: '10–20 / semana', hasta: 20 },
      { id: 'carga-alta', label: 'Carga alta', rango: '20–26 / semana', hasta: 26 },
      { id: 'sobrevolumen', label: 'Sobrevolumen', rango: '> 26 / semana', hasta: Infinity },
    ],
  },
] as const

export type ObjetivoId = typeof OBJETIVOS[number]['id']
export type Banda = typeof OBJETIVOS[number]['bandas'][number]

export const OBJETIVO_POR_DEFECTO: ObjetivoId = 'resistencia'

export function bandasDe(objetivo: ObjetivoId | string): readonly Banda[] {
  return (OBJETIVOS.find(o => o.id === objetivo) || OBJETIVOS[0]).bandas
}

/**
 * En qué banda cae un grupo según sus series SEMANALES.
 *
 * Los umbrales estaban escritos dos veces en /volumen: en las cuatro tarjetas
 * de la leyenda y otra vez en la lista de abajo. Y la lista clasificaba con el
 * TOTAL del periodo contra unos umbrales que son semanales, así que con «4 sem»
 * elegidas un grupo con 5 series —1,25 por semana, mantenimiento— salía
 * etiquetado como «Desarrollo» en verde.
 */
export function bandaDe(seriesSemanales: number, objetivo: ObjetivoId | string = OBJETIVO_POR_DEFECTO): Banda {
  const bandas = bandasDe(objetivo)
  const n = Number(seriesSemanales) || 0
  return bandas.find(b => n < b.hasta) || bandas[bandas.length - 1]
}

/** «2,5» / «5». Sin decimal cuando es redondo, para no pintar «5,0». */
export function seriesTexto(n: number): string {
  return (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/**
 * De cuánto tiempo es la media, con todas las letras.
 *
 * El rótulo tiene que llevarlo. Un «2,5 series/semana» sacado de un año dice
 * algo muy distinto de uno sacado de dos semanas, y sin el periodo delante los
 * dos se leen igual.
 */
export function periodoTexto(dias: number): string {
  const d = Number(dias) || 0
  if (d >= 360) return 'último año'
  const semanas = Math.round(d / 7)
  return semanas === 1 ? 'última semana' : 'últimas ' + semanas + ' semanas'
}
