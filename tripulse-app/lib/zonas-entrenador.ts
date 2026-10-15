// ============================================================
// TRIPULSE — Las zonas que se crea el entrenador
// ============================================================
//
// NO SUSTITUYEN A LAS DE LA APP: SE SUMAN. En la misma sesión puede haber un
// bloque en AEL y el siguiente en una zona propia. Por eso lo primero que hace
// este fichero es resolver una sigla contra las DOS bibliotecas, y por eso una
// sigla propia no puede llamarse como una de la app.
//
// VAN EN CLASIFICACIONES. Una clasificación es una forma de partir un deporte
// —la del laboratorio, la de pista, la de técnica—: tiene sus hitos (VT1, VT2,
// VO2máx; o la VAM de la app) y sus zonas. Cada zona tiene DOS límites, y cada
// uno elige su hito y su %: una zona puede ir del VT1 + 15 % al VT2 − 5 %. Un
// límite vacío es «sin límite»: por debajo de su VT1, por encima de su VO2máx.
//
// EL RPE ES OBLIGATORIO, Y NO ES UN CAPRICHO. De él salen dos cosas:
//   · la carga  — RPE × minutos
//   · el nivel 1–7, y con él la altura de la barra del dibujo, la duración
//     estimada y qué zona representa a una sesión de varios bloques.
// Una zona sin RPE no es que calcule mal la carga: es que no existe para media
// aplicación. Así que sin RPE no se ofrece.
//
// EL RESPALDO NO FINGE. Hoy `cargaZona()` devuelve nivel 2 y RPE 4,5 —los de
// Z2— cuando no reconoce una sigla, sin decir nada. Aquí no: lo que no se
// reconoce vuelve marcado como desconocido, y quien llama decide. Un tempo
// contado como aeróbico suave en silencio es el fallo que este proyecto lleva
// persiguiendo.

import { ZONAS_RESISTENCIA, ZONAS_FUERZA, nivelDeRpe, cargaZona, type CopiaZona } from './zonas'
import { ANCLA_DE, esIdHito, idApp, idPropia, leerIdApp, leerIdPropia } from './hitos'
import { normDeporte } from './referencia-propia'

/** Un límite de una zona: el % de un hito. `null` en su lugar = sin límite. */
export interface Limite {
  /** 'app:vam' · 'propia:9:0' (ver lib/hitos). */
  ref: string
  /** Del esfuerzo, no una multiplicación: el 95 % de un ritmo es más lento. */
  pct: number
}

export interface ZonaEntrenador {
  id?: number
  /** A qué clasificación pertenece. `null` = suelta (ver `leerClasificaciones`). */
  idClasificacion?: number | null
  /* EL DEPORTE IMPORTA, y mucho: los hitos de una zona son de un deporte y no
     son intercambiables. Las zonas de la app ya llevan porcentajes distintos
     por deporte (AEL es 65-75 % de VAM pero 56-75 % de FTP). Siempre es el de
     su clasificación: se copia al guardar. */
  deporte: string
  sigla: string
  nombre: string
  /** Por dónde empieza: el límite de menos esfuerzo. `null` = por debajo de todo. */
  desde: Limite | null
  /** Por dónde acaba: el de más esfuerzo. `null` = por encima de todo. */
  hasta: Limite | null
  rpeMin: number | null
  /** `null` = un número suelto en vez de un rango. Lo elige el entrenador. */
  rpeMax: number | null
  color: string
  orden: number
}

/** Una forma de partir un deporte en zonas, con sus hitos y sus zonas. */
export interface Clasificacion {
  id?: number
  idEntrenador?: string
  nombre: string
  deporte: string
  /** De qué hitos tira. Una clasificación, una unidad (ver lib/hitos). */
  hitos: string[]
  orden: number
  zonas: ZonaEntrenador[]
  /**
   * Montada en pantalla con zonas que no tienen clasificación: las que guarde
   * la app publicada hasta que se suba esta. No existe en la base hasta que
   * se guarda, y por eso no se ofrece al prescribir.
   */
  suelta?: boolean
}

export const COLORES_ZONA = [
  '#a78bfa', '#f472b6', '#67e8f9', '#fbbf24', '#4ade80', '#fb923c', '#94a3b8',
]

export const DEPORTES_ZONA = ['Carrera', 'Ciclismo', 'Natacion']

export const ZONA_NUEVA = (orden: number, deporte = 'Carrera'): ZonaEntrenador => ({
  deporte, sigla: '', nombre: '', desde: null, hasta: null,
  rpeMin: null, rpeMax: null, color: COLORES_ZONA[orden % COLORES_ZONA.length], orden,
})

export const CLASIFICACION_NUEVA = (orden: number, deporte = 'Carrera'): Clasificacion => ({
  nombre: '', deporte, hitos: [], orden, zonas: [],
})

const txt = (v: unknown): string => String(v ?? '').trim()
const numOn = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Todas las siglas que la app ya usa: resistencia, fuerza y las clásicas. */
export function siglasDeLaApp(): string[] {
  return [
    ...ZONAS_RESISTENCIA.map(z => z.sigla),
    ...ZONAS_FUERZA.map(z => z.sigla),
    ...Array.from({ length: 7 }, (_, i) => 'Z' + (i + 1)),
  ]
}

/** Si los dos límites existen y cuelgan del mismo hito: la zona que se puede afinar. */
export const esDeUnHito = (z: Pick<ZonaEntrenador, 'desde' | 'hasta'> | null | undefined): boolean =>
  !!z?.desde && !!z?.hasta && z.desde.ref === z.hasta.ref

/**
 * La zona que viene después de la última: empieza donde acaba ella.
 *
 * Es como se monta una escalera —cada zona encima de la anterior—, así que
 * «+ Añadir zona» la deja ya enganchada y el entrenador solo mueve el techo.
 * Sin zonas, la primera es la de abajo del todo: por debajo del primer hito.
 */
export function zonaSiguiente(c: Clasificacion): ZonaEntrenador {
  const z = ZONA_NUEVA(c.zonas.length, c.deporte)
  const ultima = c.zonas[c.zonas.length - 1]
  const primero = c.hitos[0]
  if (!primero) return z
  if (!ultima) return { ...z, hasta: { ref: primero, pct: 100 } }
  if (ultima.hasta) {
    return { ...z, desde: { ...ultima.hasta }, hasta: { ref: ultima.hasta.ref, pct: ultima.hasta.pct + 10 } }
  }
  /* La última no tiene techo: la nueva no puede ir encima. Se deja en el
     primer hito y que el entrenador la coloque. */
  return { ...z, desde: { ref: primero, pct: 100 }, hasta: { ref: primero, pct: 110 } }
}

// ------------------------------------------------------------
// Qué produce una zona
// ------------------------------------------------------------

export interface FichaZona {
  /** El RPE representativo: el punto medio del rango. */
  rpe: number | null
  /** El 1–7 equivalente. Null si no hay RPE, porque ahí no se inventa nada. */
  nivel: number | null
}

export function fichaDe(z: ZonaEntrenador | null | undefined): FichaZona {
  const min = numOn(z?.rpeMin)
  if (min === null) return { rpe: null, nivel: null }
  const max = numOn(z?.rpeMax)
  const rpe = max !== null ? (min + max) / 2 : min
  return { rpe, nivel: nivelDeRpe(rpe) }
}

/** «RPE 5–6» o «RPE 4», según lo que eligiera el entrenador. */
export const textoRpe = (z: ZonaEntrenador): string => {
  const min = numOn(z.rpeMin)
  if (min === null) return '—'
  const max = numOn(z.rpeMax)
  return max !== null && max !== min ? 'RPE ' + min + '–' + max : 'RPE ' + min
}

// ------------------------------------------------------------
// Validar
// ------------------------------------------------------------

/**
 * Si dos zonas comparten clasificación, que es donde una sigla no se repite.
 * Las sueltas, como antes: por deporte.
 */
const mismaClasificacion = (a: ZonaEntrenador, b: ZonaEntrenador): boolean =>
  (a.idClasificacion ?? null) === (b.idClasificacion ?? null)
  && (a.idClasificacion != null || txt(a.deporte) === txt(b.deporte))

/**
 * Por qué una zona no se puede usar todavía. `null` si está lista.
 *
 * LA SIGLA QUE CHOCA CON UNA DE LA APP NO SE USARÍA NUNCA: la resolución mira
 * primero las de serie, así que la propia quedaría inalcanzable — la eliges en
 * el desplegable y se guarda la otra, sin error y sin aviso.
 */
export function motivoNoUsable(
  z: ZonaEntrenador,
  indice: number,
  /** Las de su clasificación (o todas: se comparan solo las de la misma). */
  todas: ZonaEntrenador[],
  /*
   * Los hitos que SIGUEN EXISTIENDO en su clasificación, si quien llama los
   * sabe. Sin ellos no se comprueban, y es a propósito: quien resuelve una
   * sigla a mitad de una sesión no tiene los tests cargados ni debería. La
   * comprobación vive donde se editan, que es donde se puede arreglar.
   */
  hitosValidos?: string[],
): string | null {
  const s = txt(z.sigla)
  if (!s) return 'Ponle una sigla'
  if (/\s/.test(s)) return 'Sin espacios'
  if (s.length > 8) return 'Muy larga: máximo 8 letras'
  if (siglasDeLaApp().some(x => x.toUpperCase() === s.toUpperCase())) return 'Ya es una zona de la app'
  /* Repetida SOLO dentro de su clasificación: «UMB» puede estar en la del
     laboratorio y en la de pista, y el índice único de la tabla dice lo mismo. */
  if ((todas || []).some((x, k) => k !== indice && mismaClasificacion(x, z)
      && txt(x.sigla).toUpperCase() === s.toUpperCase())) return 'Repetida en esta clasificación'
  if (!txt(z.deporte)) return 'Elige el deporte'
  if (!txt(z.nombre)) return 'Ponle un nombre'

  const min = numOn(z.rpeMin)
  if (min === null) return 'Sin RPE no calcula carga ni tiene nivel'
  if (min > 10) return 'El RPE va de 1 a 10'
  const max = numOn(z.rpeMax)
  if (max !== null && (max > 10 || max < min)) return 'El RPE de arriba no puede ser menor que el de abajo'

  /* Una zona sin ningún límite sería «todo»: no es una zona. */
  if (!z.desde && !z.hasta) return 'Ponle al menos un límite: desde o hasta'
  for (const [l, cual] of [[z.desde, 'desde'], [z.hasta, 'hasta']] as const) {
    if (!l) continue
    if (!esIdHito(l.ref)) return 'Elige el hito del «' + cual + '»'
    if (numOn(l.pct) === null) return 'Falta el % del «' + cual + '»'
    /* Se puede quedar apuntando a la nada de dos formas: archivando el test, o
       quitando el hito de la clasificación después de usarlo. Las dos dejarían
       un porcentaje sin nada detrás. */
    if (hitosValidos && !hitosValidos.includes(l.ref)) return 'Su hito del «' + cual + '» ya no está en la clasificación'
  }
  /* Con el mismo hito arriba y abajo, al revés es al revés para todo el mundo.
     Con dos hitos distintos depende de los números de cada uno: eso no se
     prohíbe aquí, se avisa al verlo con cada atleta (lib/clasificaciones-zonas). */
  if (esDeUnHito(z) && Number(z.hasta!.pct) < Number(z.desde!.pct)) {
    return 'El % del «hasta» no puede ser menor que el del «desde»'
  }

  return null
}

export const esUsable = (z: ZonaEntrenador, i: number, todas: ZonaEntrenador[], hitosValidos?: string[]): boolean =>
  motivoNoUsable(z, i, todas, hitosValidos) === null

/** Las que se pueden ofrecer en un desplegable. */
export const usables = (todas: ZonaEntrenador[], deporte?: string): ZonaEntrenador[] => {
  const dep = txt(deporte)
  return (todas || []).filter((z, i) => esUsable(z, i, todas) && (!dep || txt(z.deporte) === dep))
}

/**
 * Por qué una clasificación no se puede guardar todavía. `null` si está lista.
 *
 * La unidad de los hitos se comprueba donde se eligen (lib/hitos, `mismaUnidad`):
 * aquí no están cargados los tests y no se puede saber.
 */
export function motivoClasificacion(c: Clasificacion): string | null {
  if (!txt(c.nombre)) return 'Ponle un nombre'
  if (txt(c.nombre).length > 80) return 'Nombre muy largo: máximo 80 letras'
  if (!txt(c.deporte)) return 'Elige el deporte'
  if (!c.hitos.length) return 'Añade al menos un hito'
  if (c.hitos.length > 12) return 'Demasiados hitos: doce como mucho'
  if (c.hitos.some(h => !esIdHito(h))) return 'Hay un hito mal escrito'
  if (new Set(c.hitos).size !== c.hitos.length) return 'Hay un hito repetido'
  return null
}

// ------------------------------------------------------------
// Resolver una sigla
// ------------------------------------------------------------

export type Origen = 'app' | 'mia' | 'copia' | 'desconocida'

export interface ZonaResuelta {
  sigla: string
  nombre: string
  color: string
  rpe: number
  nivel: number
  origen: Origen
}

/**
 * Busca una sigla en las dos bibliotecas. `null` si no está en ninguna.
 *
 * Primero las de la app y después las del entrenador, y ese orden es el motivo
 * de que una sigla propia no pueda llamarse como una de serie: si pudiera,
 * quedaría enterrada para siempre.
 */
export function buscar(sigla: string, mias: ZonaEntrenador[], deporte?: string): ZonaResuelta | null {
  const s = txt(sigla)
  if (!s) return null

  /* LA PARTE DE LA APP SE DELEGA EN cargaZona. Antes se resolvía aquí a mano,
     mirando solo los dos catálogos, y eso dejaba fuera Z1…Z7: una sesión que
     mezclara un Z3 con una zona propia marcaba el Z3 como DESCONOCIDO. El mismo
     concepto contestado en dos sitios, otra vez. Ahora hay uno. */
  const c = cargaZona(s)
  if (c.origen !== 'supuesta') {
    return { sigla: s, nombre: c.nombre, color: c.color, rpe: c.rpe, nivel: c.nivel, origen: 'app' }
  }

  /* LA SIGLA SOLA NO IDENTIFICA UNA ZONA PROPIA: puede estar en dos
     clasificaciones del mismo deporte. Con el deporte se filtra; si aun así
     hay dos, no se elige: devolver «la primera» sería elegir a cara o cruz.
     Las tareas no pasan por aquí: llevan su copia, que dice cuál fue. */
  const dep = txt(deporte)
  const candidatas = (mias || [])
    .map((z, i) => ({ z, i }))
    .filter(({ z, i }) => txt(z.sigla).toUpperCase() === s.toUpperCase()
      && (!dep || txt(z.deporte) === dep)
      && esUsable(z, i, mias))
  if (candidatas.length !== 1) return null

  const z = candidatas[0].z, f = fichaDe(z)
  return { sigla: txt(z.sigla), nombre: z.nombre, color: z.color, rpe: f.rpe!, nivel: f.nivel!, origen: 'mia' }
}

/* La copia congelada vive en lib/zonas, que es de donde la lee cargaZona. Se
   reexporta para no obligar a nadie a saber en cuál de los dos ficheros está. */
export type { CopiaZona }

export function copiaDe(sigla: string, mias: ZonaEntrenador[], deporte?: string): CopiaZona | null {
  const z = buscar(sigla, mias, deporte)
  return z ? { sigla: z.sigla, nombre: z.nombre, color: z.color, rpe: z.rpe, nivel: z.nivel } : null
}

/**
 * Con qué se pinta y se cuenta un bloque ya guardado.
 *
 * LA COPIA MANDA, y es la decisión que sostiene todo lo demás:
 *
 *   · Borrar una zona no reescribe el pasado. Sin la copia, borrar «TMP»
 *     mandaría al respaldo TODAS las sesiones que ya la usaban, hacia atrás y
 *     sin avisar.
 *   · Cambiarle el % tampoco: lo que se mandó en marzo se mandó con lo que la
 *     zona valía en marzo.
 *   · Un atleta que cambia de entrenador conserva su historial aunque el nuevo
 *     no tenga esas zonas.
 *
 * Es el mismo criterio que la app ya usa con los ejercicios de fuerza: el
 * nombre se congela en la prescripción y el vídeo se resuelve en vivo por id.
 * Lo que decidió el entrenador se congela; lo que depende del atleta —el ritmo,
 * que sale de sus tests— se calcula al enseñarlo.
 */
export function resolverBloque(
  sigla: string,
  copia: CopiaZona | null | undefined,
  mias: ZonaEntrenador[],
  deporte?: string,
): ZonaResuelta {
  if (copia && txt(copia.sigla)) {
    return { ...copia, origen: 'copia' }
  }
  const viva = buscar(sigla, mias, deporte)
  if (viva) return viva

  /* NO SE FINGE QUE SE CONOCE, pero tampoco se devuelve un cero. Las dos cosas
     son suposiciones; la diferencia es que un cero borraría de la semana una
     sesión que sí se hizo, y eso se confunde con descanso. Se da el mismo
     número que cargaZona -y del mismo sitio, para que no puedan discrepar- y se
     marca «desconocida» para que quien pinte lo diga y quien sume pueda
     excluirlo. */
  const c = cargaZona(sigla)
  return {
    sigla: txt(sigla), nombre: c.nombre, color: c.color,
    rpe: c.rpe, nivel: c.nivel, origen: 'desconocida',
  }
}

/** La carga de un bloque: RPE × minutos, igual que en el resto de la app. */
export const cargaDe = (z: ZonaResuelta, minutos: number): number =>
  Math.round((z.rpe || 0) * (Number(minutos) || 0))

// ------------------------------------------------------------
// Ida y vuelta con la base
// ------------------------------------------------------------

/** Una fila tal como llega de la base: de cada campo se comprueba la forma al leerlo. */
type FilaBase = Record<string, unknown>

/** Un límite desde el jsonb de la base. Lo que no tenga la forma vuelve nulo. */
export function leerLimite(v: unknown): Limite | null {
  const l = v as { ref?: unknown; pct?: unknown } | null
  if (!l || typeof l !== 'object') return null
  const pct = numOn(l.pct)
  return esIdHito(l.ref) && pct !== null ? { ref: l.ref, pct } : null
}

/**
 * Los límites que dicen las columnas de antes: un % de abajo, uno de arriba y
 * una referencia (la de la app si no dice otra).
 *
 * Y OJO CON EL NULO: Number(null) es 0, que es un índice válido, así que hay
 * que descartarlo a mano antes de mirar si es entero. Las dos columnas de la
 * referencia van juntas o no van: media referencia —un test sin decir qué
 * resultado— apuntaría al primero por accidente.
 */
function limitesDeAntes(f: FilaBase | null | undefined): { desde: Limite | null; hasta: Limite | null } {
  const conRef = Number(f?.ref_definicion) > 0 && f?.ref_indice != null && Number.isInteger(Number(f?.ref_indice))
  const deporte = normDeporte(txt(f?.deporte) || 'Carrera')
  const ref = conRef
    ? idPropia(Number(f?.ref_definicion), Number(f?.ref_indice))
    : ANCLA_DE[deporte] ? idApp(ANCLA_DE[deporte].ancla) : null
  if (!ref) return { desde: null, hasta: null }
  const a = numOn(f?.pct_min), b = numOn(f?.pct_max)
  return { desde: a !== null ? { ref, pct: a } : null, hasta: b !== null ? { ref, pct: b } : null }
}

/** Rehace las zonas desde las filas de `zona_entrenador`. */
export function leerZonas(filas: any[] | null | undefined): ZonaEntrenador[] {
  return (filas || []).map((f, i) => {
    let desde = leerLimite(f?.desde)
    let hasta = leerLimite(f?.hasta)
    const antes = limitesDeAntes(f)
    if (!desde && !hasta) {
      /* Una zona de antes de las clasificaciones, o una que acaba de guardar
         la app publicada: solo trae sus columnas de siempre. */
      desde = antes.desde
      hasta = antes.hasta
    } else if (esDeUnHito({ desde, hasta }) && antes.desde && antes.hasta
        && (antes.desde.ref !== desde!.ref || antes.desde.pct !== desde!.pct || antes.hasta.pct !== hasta!.pct)) {
      /* LAS DOS VERSIONES NO CUADRAN, y solo hay una forma de que pase: la app
         publicada —que solo conoce las columnas de antes— cambió el % de una
         zona de un hito mientras esta no estaba subida. Esta las escribe
         siempre iguales, así que lo de las columnas de antes es lo último que
         se tocó. */
      desde = antes.desde
      hasta = antes.hasta
    }
    return {
      id: f?.id,
      idClasificacion: Number(f?.id_clasificacion) > 0 ? Number(f.id_clasificacion) : null,
      deporte: txt(f?.deporte) || 'Carrera',
      sigla: txt(f?.sigla),
      nombre: txt(f?.nombre),
      desde,
      hasta,
      rpeMin: numOn(f?.rpe_min),
      rpeMax: numOn(f?.rpe_max),
      color: txt(f?.color) || COLORES_ZONA[i % COLORES_ZONA.length],
      /* Number(undefined) es NaN y `?? i` no lo cambia: NaN no es nulo. */
      orden: Number.isFinite(Number(f?.orden)) ? Number(f.orden) : i,
    }
  }).sort((a, b) => a.orden - b.orden)
}

/**
 * La fila que se escribe. La sigla se guarda en mayúsculas, siempre.
 *
 * LAS COLUMNAS DE ANTES SE SIGUEN ESCRIBIENDO en las zonas de un solo hito, y
 * solo en esas: son las que la app publicada sabe leer hasta que se suba esta.
 * Una zona de dos hitos no tiene «un» porcentaje, y ahí van vacías —la app
 * publicada la ve como sin terminar y no la ofrece, que es lo correcto—.
 */
export function paraGuardar(z: ZonaEntrenador, idEntrenador: string, idClasificacion?: number | null) {
  const desde = leerLimite(z.desde), hasta = leerLimite(z.hasta)
  let pctMin: number | null = null, pctMax: number | null = null
  let refDef: number | null = null, refInd: number | null = null
  if (desde && hasta && desde.ref === hasta.ref) {
    const propia = leerIdPropia(desde.ref)
    const app = leerIdApp(desde.ref)
    /* Una columna de referencia vacía significa «la de la app DE SU DEPORTE»:
       solo se escribe así si el hito es justo ese. */
    const esLaSuya = app !== null && ANCLA_DE[normDeporte(z.deporte)]?.ancla === app
    if (propia || esLaSuya) {
      pctMin = desde.pct
      pctMax = hasta.pct
      refDef = propia ? propia.idDefinicion : null
      refInd = propia ? propia.indice : null
    }
  }
  return {
    id_entrenador: idEntrenador,
    id_clasificacion: idClasificacion ?? z.idClasificacion ?? null,
    deporte: txt(z.deporte) || 'Carrera',
    sigla: txt(z.sigla).toUpperCase(),
    nombre: txt(z.nombre),
    desde,
    hasta,
    pct_min: pctMin,
    pct_max: pctMax,
    rpe_min: numOn(z.rpeMin),
    rpe_max: numOn(z.rpeMax),
    color: txt(z.color) || COLORES_ZONA[0],
    orden: Number(z.orden) || 0,
    ref_definicion: refDef,
    ref_indice: refInd,
  }
}

/**
 * Las clasificaciones, cada una con sus zonas.
 *
 * LAS ZONAS SUELTAS NO SE PIERDEN. Las guarda sin clasificación la app
 * publicada mientras no se suba esta; se agrupan como se agrupaban antes —por
 * deporte y por la referencia de la que cuelgan— en una clasificación marcada
 * `suelta`, que existe en la base en cuanto se guarda. Una zona que apunta a
 * una clasificación que no llegó (archivada) no se enseña.
 */
export function leerClasificaciones(
  filasC: FilaBase[] | null | undefined,
  filasZ: FilaBase[] | null | undefined,
): Clasificacion[] {
  const zonas = leerZonas(filasZ)
  const out: Clasificacion[] = (filasC || []).map((f, i) => ({
    id: Number(f?.id) > 0 ? Number(f.id) : undefined,
    idEntrenador: txt(f?.id_entrenador) || undefined,
    nombre: txt(f?.nombre),
    deporte: txt(f?.deporte) || 'Carrera',
    hitos: Array.isArray(f?.hitos) ? (f.hitos as unknown[]).filter(esIdHito) : [],
    orden: Number.isFinite(Number(f?.orden)) ? Number(f.orden) : i,
    zonas: [] as ZonaEntrenador[],
  })).sort((a, b) => a.orden - b.orden)

  const porId = new Map<number, Clasificacion>()
  for (const c of out) if (c.id) porId.set(c.id, c)

  const sueltas: Clasificacion[] = []
  for (const z of zonas) {
    if (z.idClasificacion != null) {
      porId.get(z.idClasificacion)?.zonas.push(z)
      continue
    }
    const hito = (z.desde ?? z.hasta)?.ref ?? ''
    let s = sueltas.find(x => x.deporte === z.deporte && (x.hitos[0] ?? '') === hito)
    if (!s) {
      s = { nombre: '', deporte: z.deporte, hitos: hito ? [hito] : [], orden: out.length + sueltas.length, zonas: [], suelta: true }
      sueltas.push(s)
    }
    s.zonas.push(z)
  }
  return [...out, ...sueltas]
}

/** La fila de `zona_clasificacion` que se escribe. */
export function clasificacionParaGuardar(c: Clasificacion, idEntrenador: string) {
  return {
    id_entrenador: idEntrenador,
    nombre: txt(c.nombre),
    deporte: txt(c.deporte) || 'Carrera',
    hitos: (c.hitos || []).filter(esIdHito),
    orden: Number(c.orden) || 0,
  }
}
