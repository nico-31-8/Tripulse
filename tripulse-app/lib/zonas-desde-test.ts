// ============================================================
// TRIPULSE — Que las zonas puedan salir de más de un test
// ============================================================
//
// EL PROBLEMA. Cada disciplina tiene UN número del que cuelgan todas sus zonas:
// la VAM en carrera, el CSS en natación, el FTP en ciclismo. Hasta ahora ese
// número solo lo podía fijar un test por disciplina —el Montreal, el CSS de dos
// distancias y la rampa—, porque son los únicos que escriben en `test1_carrera`,
// `test2_natacion` y `test3_ciclismo`.
//
// Pero hay más tests que miden exactamente lo mismo. El de 6 minutos da una VAM.
// El FTP de 60 minutos da un FTP —y es el PATRÓN ORO, el que menos corrección
// necesita— y sin embargo era el que menos autoridad tenía en la app: se
// guardaba en `tests_libres` y las zonas ni se enteraban. Un entrenador que
// hiciera ese test, viera el número y esperase que los ritmos del atleta se
// movieran, se quedaba esperando sin que nada avisara.
//
// LA REGLA. Un test puede fijar el ancla de su disciplina solo si mide LA MISMA
// MAGNITUD. No vale «se le parece»:
//
//   · El T30 NO entra. Da ritmo umbral, que no es la VAM: son dos velocidades
//     distintas y meter una donde va la otra desplazaría todas las zonas.
//   · Los 180 m repetidos NO entran. Dan una caída entre repeticiones.
//   · El T400 SÍ entra, porque su ritmo umbral es lo mismo que estima el CSS
//     —el propio documento lo presenta como la alternativa cuando solo se puede
//     nadar una distancia—, pero se marca como estimado.
//
// SE PIDE, NO SE HACE SOLO. Guardar el test nunca mueve las zonas: hay que
// pulsar. Un test puede salir mal —el atleta venía tocado, la pista estaba
// mojada— y que eso reescriba en silencio los ritmos de las próximas semanas
// sería el peor fallo posible de esta pantalla.
//
// Y SE APUNTA DE DÓNDE SALIÓ, en la columna `origen`. Sin eso, dentro de dos
// meses hay una VAM de 15,4 en la tabla y no hay forma de saber si vino de un
// Montreal o de un test de 6 minutos, que no son igual de fiables.

import type { TestCampo, Valores, Contexto } from './catalogo-tests'
import { resultadosDe } from './catalogo-tests'

export type Ancla = 'vam' | 'css' | 'ftp'

export interface Destino {
  tabla: 'test1_carrera' | 'test2_natacion' | 'test3_ciclismo'
  columna: Ancla
  /** La unidad que guarda ESA COLUMNA, que no siempre es la que enseña el test. */
  unidad: string
  /** Cómo se llama para el entrenador. */
  nombre: string
}

export const DESTINOS: Record<Ancla, Destino> = {
  vam: { tabla: 'test1_carrera', columna: 'vam', unidad: 'km/h', nombre: 'VAM' },
  css: { tabla: 'test2_natacion', columna: 'css', unidad: 'm/s', nombre: 'CSS' },
  ftp: { tabla: 'test3_ciclismo', columna: 'ftp', unidad: 'W', nombre: 'FTP' },
}

export interface Aporte {
  ancla: Ancla
  /** De qué salida del test se coge el número. */
  salida: string
  /**
   * De la unidad del test a la de la columna.
   *
   * AQUÍ ES DONDE ESTO SE PUEDE ROMPER SIN QUE NADA FALLE. El T400 da segundos
   * por 100 m y la columna `css` guarda metros por segundo. Meter 85 donde van
   * 1,18 no rompe nada: deja un CSS de 85 m/s y las zonas de ese nadador salen
   * absurdas, pero la app las calcula igual y las enseña tan tranquila.
   */
  convertir: (n: number) => number
  /** Si el número es una estimación y no una medida directa. */
  estimado?: boolean
  /** Por qué este test vale para esto. Se le enseña al entrenador. */
  porque: string
}

export const APORTAN: Record<string, Aporte> = {
  '6min': {
    ancla: 'vam', salida: 'vam', convertir: n => n,
    porque: 'El test de 6 minutos mide la VAM directamente: el test dura seis minutos precisamente para que la media SEA la VAM.',
  },
  milla: {
    ancla: 'vam', salida: 'vam', convertir: n => n, estimado: true,
    porque: 'La milla estima la VAM a partir del tiempo. Es menos directa que el Montreal o que el test de 6 minutos.',
  },
  t400: {
    ancla: 'css', salida: 'ritmoUmbral',
    /* s/100m → m/s. Sin esta línea el CSS saldría en el orden de 85 y las zonas
       de natación de ese atleta no tendrían ningún sentido. */
    convertir: n => Math.round((100 / n) * 1000) / 1000,
    estimado: true,
    porque: 'El ritmo umbral del T400 estima lo mismo que mide el CSS. El documento lo presenta como la alternativa cuando solo se puede nadar una distancia.',
  },
  ftp20: {
    ancla: 'ftp', salida: 'ftp', convertir: n => n,
    porque: 'El test de 20 minutos da un FTP por el camino clásico: la media por 0,95.',
  },
  ftp60: {
    ancla: 'ftp', salida: 'ftp', convertir: n => n,
    porque: 'Sesenta minutos al máximo ES el FTP, sin corregir nada. Es el patrón oro.',
  },
}

/** Si este test puede fijar el ancla de su disciplina. */
export function aporteDe(test: TestCampo): Aporte | null {
  return APORTAN[test.clave] ?? null
}

export interface Propuesta {
  aporte: Aporte
  destino: Destino
  /** El número tal como se guardaría, ya convertido. */
  valor: number
  /** Cómo se enseña en el botón, en la unidad de la columna. */
  texto: string
}

/**
 * Qué se guardaría si se pulsase, o null si todavía no hay número.
 *
 * Se calcula desde las MISMAS salidas que ve el entrenador en pantalla, no
 * repitiendo la fórmula aquí: si un día cambia el cálculo del FTP de 20
 * minutos, cambia en los dos sitios a la vez porque solo hay uno.
 */
export function propuestaDe(test: TestCampo, valores: Valores, ctx: Contexto): Propuesta | null {
  const aporte = aporteDe(test)
  if (!aporte) return null
  const r = resultadosDe(test, valores, ctx).find(x => x.salida.clave === aporte.salida)
  if (!r || r.valor == null) return null

  const valor = aporte.convertir(r.valor)
  if (!Number.isFinite(valor) || valor <= 0) return null

  const destino = DESTINOS[aporte.ancla]
  return {
    aporte, destino, valor,
    texto: String(valor).replace('.', ',') + ' ' + destino.unidad,
  }
}

/** La fila que se escribe. Solo el ancla: lo demás de ese test no va aquí. */
export function filaDeZonas(
  idDeportista: number, fecha: string, p: Propuesta, claveTest: string,
): Record<string, unknown> {
  return {
    id_deportista: idDeportista,
    fecha,
    [p.destino.columna]: p.valor,
    origen: claveTest,
  }
}

export interface ResultadoFijar {
  error: string | null
  /** Si se guardó pero SIN dejar constancia de qué test fue. */
  sinOrigen?: boolean
}

interface ClienteMinimo {
  from(tabla: string): {
    insert(fila: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>
  }
}

/**
 * Escribe el ancla en la tabla de su disciplina.
 *
 * REINTENTA SIN `origen` SI ESA COLUMNA NO EXISTE. PostgREST tira la consulta
 * entera si nombras una columna que no está, así que con el SQL sin correr esto
 * fallaría del todo. Y el orden entre desplegar y correr SQL ya nos ha mordido
 * una vez: es mejor guardar el número sin la etiqueta y decirlo, que no guardar
 * nada. Se devuelve `sinOrigen` para que la pantalla lo avise.
 */
export async function fijarZonas(
  supabase: ClienteMinimo,
  idDeportista: number, fecha: string, p: Propuesta, claveTest: string,
): Promise<ResultadoFijar> {
  if (!fecha) return { error: 'Un test sin fecha no sirve para ordenar nada.' }

  const fila = filaDeZonas(idDeportista, fecha, p, claveTest)
  const { error } = await supabase.from(p.destino.tabla).insert(fila)
  if (!error) return { error: null }

  if (/origen/i.test(error.message)) {
    const { origen, ...sinEsa } = fila
    void origen
    const segundo = await supabase.from(p.destino.tabla).insert(sinEsa)
    if (segundo.error) return { error: segundo.error.message }
    return { error: null, sinOrigen: true }
  }
  return { error: error.message }
}
