// ============================================================
// TRIPULSE — El bloque mientras se escribe, y cómo se guarda
// ============================================================
//
// El editor trabaja con TEXTOS (lo que hay en las casillas: «2:00», «21-15-9»,
// «6») y la base con números y filas. Aquí vive la traducción en los dos
// sentidos, una sola vez: guardar, editar, duplicar y copiar desde otra semana
// son la misma conversión, como en lib/copiar-tarea para las líneas sueltas.
//
// Ver lib/bloque-formato para qué es un bloque.

import {
  CONFIG_INICIAL, leerConfig, leerEsquema, ordenarLineas, seriesDeLinea, esCardioLinea,
  medidaDeLinea, cantidadDeLinea,
  type Formato, type ConfigBloque, type MedidaLinea, type LineaBloque,
} from './bloque-formato'
import { modalidadDe } from './cardio-fuerza'
import { mmssASegundos } from './medicion'

export interface LineaBorrador {
  tipo: 'Ejercicio' | 'Cardio'
  /** Grupo de la biblioteca: filtra el desplegable de ejercicios. */
  grupo: string
  /** Id en `ejercicios_biblioteca`. */
  ejercicioId: string
  medida: MedidaLinea
  cantidad: string
  kg: string
  cardioModo: string
  cardioZona: string
  cardioObjetivo: string
}

export interface BloqueBorrador {
  /** Para React: un bloque nuevo aún no tiene id. */
  clave: string
  /** Con él, guardar actualiza esa tarea; sin él, crea una. */
  idTarea?: number
  /** Las líneas sueltas que este bloque sustituye al guardarse (agrupar). */
  reemplaza?: number[]
  formato: Formato
  config: ConfigBloque
  /* Lo que se escribe en las casillas de texto. Se guarda aparte del número
     para que escribir «2:» no se convierta en «2:00» mientras se teclea. */
  descansoTexto: string
  cadaTexto: string
  esquemaTexto: string
  lineas: LineaBorrador[]
  comentario: string
  zonaFuerzaTarea: string
  orden: number
}

/** Un ejercicio de la biblioteca, lo que hace falta de él. */
export interface EjercicioBib {
  id: number
  nombre: string
  grupo_muscular?: string | null
  url_video?: string | null
}

const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')
let contador = 0
const nuevaClave = () => 'b' + Date.now().toString(36) + (++contador)

export const lineaVacia = (): LineaBorrador => ({
  tipo: 'Ejercicio', grupo: '', ejercicioId: '', medida: 'reps', cantidad: '', kg: '',
  cardioModo: '', cardioZona: '', cardioObjetivo: '',
})

export function bloqueVacio(formato: Formato, orden: number): BloqueBorrador {
  return {
    clave: nuevaClave(), formato, config: { ...CONFIG_INICIAL },
    descansoTexto: mmss(CONFIG_INICIAL.descanso), cadaTexto: mmss(CONFIG_INICIAL.cada),
    esquemaTexto: CONFIG_INICIAL.esquema.join('-'),
    lineas: [lineaVacia()], comentario: '', zonaFuerzaTarea: '', orden,
  }
}

/** La configuración de verdad, leyendo las casillas de texto. */
export function configDeBorrador(b: BloqueBorrador): ConfigBloque {
  return leerConfig({
    ...b.config,
    descanso: mmssASegundos(b.descansoTexto),
    cada: mmssASegundos(b.cadaTexto) || 60,
    esquema: leerEsquema(b.esquemaTexto),
  })
}

/**
 * Si en este formato cada línea lleva su cantidad.
 *
 * En Tabata se hace lo que se pueda, y en un for time con esquema (21-15-9)
 * las repeticiones las pone el esquema: pedir una cantidad por línea sería
 * pedir un número que no se va a usar.
 */
export const pideCantidad = (formato: Formato, cfg: ConfigBloque): boolean =>
  !(formato === 'tabata' || (formato === 'fortime' && cfg.esquema.length > 0))

/** Lo que falta para poder guardarlo, o null si está listo. */
export function faltaEnBloque(b: BloqueBorrador): string | null {
  if (!b.lineas.length) return 'Añade al menos una línea'
  const cfg = configDeBorrador(b)
  const cantidad = pideCantidad(b.formato, cfg)
  for (let i = 0; i < b.lineas.length; i++) {
    const l = b.lineas[i]
    const n = 'la línea ' + (i + 1)
    if (l.tipo === 'Cardio') {
      if (!modalidadDe(l.cardioModo)) return 'Elige la modalidad de ' + n
    } else if (!l.ejercicioId) return 'Elige el ejercicio de ' + n
    if (cantidad && !(valorLinea(l) > 0)) return 'Pon cuánto en ' + n
  }
  if (b.formato === 'fortime' && !cfg.esquema.length && !cfg.rondas) return 'Pon el esquema o las rondas'
  return null
}

/** La cantidad de una línea como número. Los segundos aceptan «1:30». */
const valorLinea = (l: LineaBorrador): number =>
  l.medida === 'seg' ? mmssASegundos(l.cantidad) : Number(String(l.cantidad).replace(',', '.'))

const medidaCardio = (m: MedidaLinea) => m === 'seg' ? 'segundos' : m === 'cal' ? 'calorias' : 'metros'
const medidaDeCardio = (m: string | null | undefined): MedidaLinea => m === 'segundos' ? 'seg' : m === 'calorias' ? 'cal' : 'm'

/**
 * Las filas que se guardan: la tarea y una fila de `ejercicios` por línea.
 *
 * Cada línea lleva sus `series` —las que cuenta el reparto de series por
 * grupo muscular (lib/series-por-grupo)— calculadas del bloque. Y las de
 * repeticiones rellenan también `repeticiones`, para que todo lo que ya lee
 * esa columna las encuentre.
 */
export function filasDeBloque(
  b: BloqueBorrador,
  biblioteca: EjercicioBib[],
  extra: { disciplina: string; zona: string | null },
): { tarea: Record<string, unknown>; ejercicios: Record<string, unknown>[] } {
  const cfg = configDeBorrador(b)
  const cantidad = pideCantidad(b.formato, cfg)
  const guardadas: LineaBloque[] = b.lineas.map(l => l.tipo === 'Cardio'
    ? { cardio_modo: l.cardioModo, cardio_medida: medidaCardio(l.medida), cardio_valor: cantidad ? valorLinea(l) : null }
    : { medida: l.medida, cantidad: cantidad ? valorLinea(l) : null })

  const ejercicios = b.lineas.map((l, i) => {
    const comun = {
      orden: i + 1,
      series: seriesDeLinea(b.formato, cfg, guardadas, i),
      descanso_segundos: null,
      notas_ejecucion: '',
    }
    if (l.tipo === 'Cardio') {
      const m = modalidadDe(l.cardioModo)
      return {
        ...comun, ejercicio_id: null, nombre: m?.nombre || 'Cardio', grupo_muscular: null, tipo_serie: 'Cardio',
        cardio_modo: l.cardioModo, cardio_medida: medidaCardio(l.medida),
        cardio_valor: cantidad && valorLinea(l) > 0 ? Math.round(valorLinea(l)) : null,
        cardio_zona: l.cardioZona || null, cardio_objetivo: l.cardioObjetivo || null,
        medida: null, cantidad: null, repeticiones: null, intensidad: null,
      }
    }
    const bib = biblioteca.find(e => e.id === Number(l.ejercicioId))
    const n = cantidad && valorLinea(l) > 0 ? valorLinea(l) : null
    return {
      ...comun, ejercicio_id: bib?.id ?? null, nombre: bib?.nombre || 'Ejercicio',
      grupo_muscular: bib?.grupo_muscular ?? null, tipo_serie: 'Normal', url_video: bib?.url_video || null,
      medida: l.medida, cantidad: n,
      repeticiones: l.medida === 'reps' && n != null ? Math.round(n) : null,
      intensidad: Number(String(l.kg).replace(',', '.')) > 0 ? Number(String(l.kg).replace(',', '.')) : null,
    }
  })

  return {
    tarea: {
      disciplina: extra.disciplina,
      zona_entrenamiento: extra.zona,
      formato: b.formato,
      formato_config: cfg,
      /* Sin series ni bloques propios: los pone el formato. Dejarlos puestos
         haría que el cálculo de las líneas sueltas multiplicara el bloque. */
      series: null, bloques: null, descanso_bloques_segundos: null,
      descanso_segundos: b.formato === 'rondas' ? cfg.descanso : null,
      comentario: b.comentario || null,
    },
    ejercicios,
  }
}

/** Una línea guardada, de vuelta a las casillas. */
function lineaDesdeGuardada(e: LineaBloque, biblioteca: EjercicioBib[]): LineaBorrador {
  if (esCardioLinea(e)) {
    const medida = medidaDeCardio(e.cardio_medida)
    const v = Number(e.cardio_valor) || 0
    return {
      ...lineaVacia(), tipo: 'Cardio', medida,
      cantidad: v ? (medida === 'seg' && v >= 60 ? mmss(v) : String(v)) : '',
      cardioModo: e.cardio_modo || '', cardioZona: e.cardio_zona || '', cardioObjetivo: e.cardio_objetivo || '',
    }
  }
  const bib = biblioteca.find(b => b.id === Number(e.ejercicio_id))
    || biblioteca.find(b => b.nombre.trim().toLowerCase() === String(e.nombre || '').trim().toLowerCase())
  const medida = medidaDeLinea(e)
  const n = cantidadDeLinea(e)
  return {
    ...lineaVacia(), tipo: 'Ejercicio', medida,
    grupo: bib?.grupo_muscular || e.grupo_muscular || '', ejercicioId: bib ? String(bib.id) : '',
    cantidad: n ? (medida === 'seg' && n >= 60 ? mmss(n) : String(n)) : '',
    kg: Number(e.intensidad) > 0 ? String(Number(e.intensidad)) : '',
  }
}

/**
 * Una tarea-bloque guardada, de vuelta al editor.
 *
 * `copia` = duplicar o traer de otra semana: sin `idTarea`, guardar crea una
 * nueva y la de origen no se toca.
 */
export function bloqueDesdeTarea(
  t: { id?: number; formato?: string | null; formato_config?: unknown; comentario?: string | null; zona_entrenamiento?: string | null; orden?: number | null; ejercicios?: LineaBloque[] | null },
  opts: { copia: boolean; orden: number; biblioteca: EjercicioBib[] },
): BloqueBorrador {
  const cfg = leerConfig(t.formato_config)
  const formato = (['rondas', 'amrap', 'emom', 'fortime', 'tabata'] as const).find(f => f === t.formato) ?? 'rondas'
  return {
    clave: nuevaClave(),
    idTarea: opts.copia ? undefined : t.id,
    formato, config: cfg,
    descansoTexto: mmss(cfg.descanso), cadaTexto: mmss(cfg.cada), esquemaTexto: cfg.esquema.join('-'),
    lineas: ordenarLineas(t.ejercicios).map(e => lineaDesdeGuardada(e, opts.biblioteca)),
    comentario: t.comentario || '',
    zonaFuerzaTarea: t.zona_entrenamiento || '',
    orden: opts.orden,
  }
}

/**
 * AGRUPAR: unas líneas sueltas ya guardadas pasan a ser un bloque.
 *
 * No se borra nada al agrupar: se abre el bloque en el editor con esas líneas
 * y la lista de lo que sustituye. Solo al guardarlo desaparecen las sueltas,
 * así que cancelar lo deja todo como estaba. En un bloque de rondas, las
 * rondas son las series que tenían (la mayor, si no coincidían).
 */
export function bloqueDesdeSueltas(
  tareas: { id: number; series?: number | null; orden?: number | null; comentario?: string | null; zona_entrenamiento?: string | null; p_duracion?: { tiempo_planeado?: number | null }[] | null; ejercicios?: LineaBloque[] | null }[],
  formato: Formato,
  biblioteca: EjercicioBib[],
): BloqueBorrador {
  const orden = Math.min(...tareas.map(t => Number(t.orden) || 0))
  const rondas = Math.max(1, ...tareas.map(t => Number(t.series) || Number(t.ejercicios?.[0]?.series) || 1))
  const b = bloqueVacio(formato, orden)
  b.config.rondas = rondas
  b.reemplaza = tareas.map(t => t.id)
  b.zonaFuerzaTarea = tareas[0]?.zona_entrenamiento || ''
  b.lineas = tareas.flatMap(t => ordenarLineas(t.ejercicios).map(e => {
    const l = lineaDesdeGuardada(e, biblioteca)
    /* Un ejercicio por tiempo guardaba sus segundos en la tarea, no en la línea. */
    const seg = t.p_duracion?.[0]?.tiempo_planeado
    if (l.tipo === 'Ejercicio' && !l.cantidad && Number(seg) > 0) { l.medida = 'seg'; l.cantidad = String(seg) }
    return l
  }))
  if (!b.lineas.length) b.lineas = [lineaVacia()]
  return b
}

/**
 * SOLTAR: un bloque guardado vuelve a ser líneas sueltas, una tarea por línea,
 * con tantas series como veces se hacía en el bloque. Lo contrario de agrupar.
 */
export function sueltasDesdeBloque(
  t: { formato?: string | null; formato_config?: unknown; zona_entrenamiento?: string | null; disciplina?: string | null; ejercicios?: LineaBloque[] | null },
): { tarea: Record<string, unknown>; ejercicio: Record<string, unknown> }[] {
  const cfg = leerConfig(t.formato_config)
  const formato = (['rondas', 'amrap', 'emom', 'fortime', 'tabata'] as const).find(f => f === t.formato) ?? 'rondas'
  const lineas = ordenarLineas(t.ejercicios)
  return lineas.map((e, i) => {
    const series = Math.max(1, seriesDeLinea(formato, cfg, lineas, i))
    const resto: Record<string, unknown> = { ...e }
    delete resto.id
    delete resto.orden
    const reps = !esCardioLinea(e) && medidaDeLinea(e) === 'reps'
      ? (cantidadDeLinea(e) || (formato === 'fortime' ? cfg.esquema[0] : 0) || null)
      : null
    return {
      tarea: {
        disciplina: t.disciplina, zona_entrenamiento: t.zona_entrenamiento ?? null,
        formato: null, formato_config: null, series,
        descanso_segundos: formato === 'rondas' ? cfg.descanso : null,
      },
      ejercicio: {
        ...resto, id_tarea: undefined, orden: null, series,
        repeticiones: reps ?? e.repeticiones ?? null,
        cantidad: reps ?? e.cantidad ?? null,
      },
    }
  })
}
