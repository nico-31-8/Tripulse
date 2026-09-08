// ============================================================
// TRIPULSE — Las zonas que se crea el entrenador
// ============================================================
//
// NO SUSTITUYEN A LAS DE LA APP: SE SUMAN. En la misma sesión puede haber un
// bloque en AEL y el siguiente en una zona propia. Por eso lo primero que hace
// este fichero es resolver una sigla contra las DOS bibliotecas, y por eso una
// sigla propia no puede llamarse como una de la app.
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
import { mismaRef, type RefPropia } from './referencia-propia'

export interface ZonaEntrenador {
  id?: number
  /* EL DEPORTE IMPORTA, y mucho: los % de la zona son de UNA referencia -la
     VAM, el FTP o el CSS- y esas no son intercambiables. Las zonas de la app
     ya llevan porcentajes distintos por deporte (AEL es 65-75 % de VAM pero
     56-75 % de FTP). Sin esto, un «Tempo largo» al 82-88 % daria un ritmo
     razonable corriendo y unos vatios equivocados en bici, sin avisar. */
  deporte: string
  sigla: string
  nombre: string
  /** El rango, en % de la referencia — la de la app o la propia, ver `ref`. */
  pctMin: number
  pctMax: number
  /*
   * DE QUÉ NÚMERO ES ESE PORCENTAJE.
   *
   * `null` = la referencia de la app para su deporte: la VAM, el FTP, el CSS.
   * Es lo que hacían todas antes de que esto existiera, y por eso es el valor
   * por defecto: las zonas ya guardadas siguen significando lo mismo.
   *
   * Si no, un resultado de un test propio. Un 1:13 el 100 sacado de un 6×100 no
   * es un CSS ni se le parece, y aun así es una referencia perfectamente buena
   * para colgarle zonas.
   */
  ref: RefPropia | null
  rpeMin: number | null
  /** `null` = un número suelto en vez de un rango. Lo elige el entrenador. */
  rpeMax: number | null
  color: string
  orden: number
}

export const COLORES_ZONA = [
  '#a78bfa', '#f472b6', '#67e8f9', '#fbbf24', '#4ade80', '#fb923c', '#94a3b8',
]

export const DEPORTES_ZONA = ['Carrera', 'Ciclismo', 'Natacion']

export const ZONA_NUEVA = (orden: number, deporte = 'Carrera'): ZonaEntrenador => ({
  deporte, sigla: '', nombre: '', pctMin: 70, pctMax: 80, ref: null,
  rpeMin: null, rpeMax: null, color: COLORES_ZONA[orden % COLORES_ZONA.length], orden,
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
 * Por qué una zona no se puede usar todavía. `null` si está lista.
 *
 * LA SIGLA QUE CHOCA CON UNA DE LA APP NO SE USARÍA NUNCA: la resolución mira
 * primero las de serie, así que la propia quedaría inalcanzable — la eliges en
 * el desplegable y se guarda la otra, sin error y sin aviso.
 */
export function motivoNoUsable(
  z: ZonaEntrenador,
  indice: number,
  todas: ZonaEntrenador[],
  /*
   * Las referencias propias que valen PARA ESTE DEPORTE, si quien llama las
   * sabe. Sin ellas la referencia no se comprueba, y eso es a propósito: quien
   * resuelve una sigla a mitad de una sesión no tiene los tests cargados ni
   * debería. La comprobación vive donde se editan, que es donde se puede
   * arreglar.
   */
  refsValidas?: RefPropia[],
): string | null {
  const s = txt(z.sigla)
  if (!s) return 'Ponle una sigla'
  if (/\s/.test(s)) return 'Sin espacios'
  if (s.length > 8) return 'Muy larga: máximo 8 letras'
  if (siglasDeLaApp().some(x => x.toUpperCase() === s.toUpperCase())) return 'Ya es una zona de la app'
  /* Repetida SOLO dentro del mismo deporte: «TMP» de carrera y «TMP» de bici
     son dos zonas distintas con la misma etiqueta, y el indice unico de la
     tabla dice lo mismo. */
  if ((todas || []).some((x, k) => k !== indice
      && txt(x.deporte) === txt(z.deporte)
      && txt(x.sigla).toUpperCase() === s.toUpperCase())) return 'Repetida en este deporte'
  if (!txt(z.deporte)) return 'Elige el deporte'
  if (!txt(z.nombre)) return 'Ponle un nombre'

  const min = numOn(z.rpeMin)
  if (min === null) return 'Sin RPE no calcula carga ni tiene nivel'
  if (min > 10) return 'El RPE va de 1 a 10'
  const max = numOn(z.rpeMax)
  if (max !== null && (max > 10 || max < min)) return 'El RPE de arriba no puede ser menor que el de abajo'

  const pMin = Number(z.pctMin), pMax = Number(z.pctMax)
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMin <= 0 || pMax <= 0) return 'Faltan los porcentajes'
  if (pMax < pMin) return 'El porcentaje de arriba no puede ser menor que el de abajo'

  /* Se puede quedar apuntando a la nada de dos formas: archivando el test, o
     cambiándole el deporte a la zona después de elegirla. Las dos dejarían un
     porcentaje sin nada detrás. */
  if (z.ref && refsValidas && !refsValidas.some(r => mismaRef(r, z.ref))) {
    return 'Su referencia ya no existe o es de otro deporte'
  }

  return null
}

export const esUsable = (z: ZonaEntrenador, i: number, todas: ZonaEntrenador[], refsValidas?: RefPropia[]): boolean =>
  motivoNoUsable(z, i, todas, refsValidas) === null

/** Las que se pueden ofrecer en un desplegable. */
export const usables = (todas: ZonaEntrenador[], deporte?: string): ZonaEntrenador[] => {
  const dep = txt(deporte)
  return (todas || []).filter((z, i) => esUsable(z, i, todas) && (!dep || txt(z.deporte) === dep))
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

  /* LA SIGLA SOLA NO IDENTIFICA UNA ZONA PROPIA: su clave es sigla + deporte.
     Con el deporte se filtra; sin el, solo vale si no hay ambiguedad. Devolver
     «la primera» cuando hay dos seria elegir a cara o cruz entre unos vatios y
     un ritmo. */
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

/** Rehace las zonas desde las filas de `zona_entrenador`. */
export function leerZonas(filas: any[] | null | undefined): ZonaEntrenador[] {
  return (filas || []).map((f, i) => ({
    id: f?.id,
    deporte: txt(f?.deporte) || 'Carrera',
    sigla: txt(f?.sigla),
    nombre: txt(f?.nombre),
    pctMin: Number(f?.pct_min) || 0,
    pctMax: Number(f?.pct_max) || 0,
    rpeMin: numOn(f?.rpe_min),
    rpeMax: numOn(f?.rpe_max),
    color: txt(f?.color) || COLORES_ZONA[i % COLORES_ZONA.length],
    orden: Number(f?.orden) ?? i,
    /* Las dos columnas van juntas o no van: media referencia -un test sin
       decir qué resultado- apuntaría al primero por accidente. Y ojo con el
       nulo: Number(null) es 0, que es un índice válido, así que hay que
       descartarlo a mano antes de mirar si es entero. */
    ref: Number(f?.ref_definicion) > 0 && f?.ref_indice != null && Number.isInteger(Number(f.ref_indice))
      ? { idDefinicion: Number(f.ref_definicion), indice: Number(f.ref_indice) }
      : null,
  })).sort((a, b) => a.orden - b.orden)
}

/** La fila que se escribe. La sigla se guarda en mayúsculas, siempre. */
export function paraGuardar(z: ZonaEntrenador, idEntrenador: string) {
  return {
    id_entrenador: idEntrenador,
    deporte: txt(z.deporte) || 'Carrera',
    sigla: txt(z.sigla).toUpperCase(),
    nombre: txt(z.nombre),
    pct_min: Number(z.pctMin),
    pct_max: Number(z.pctMax),
    rpe_min: numOn(z.rpeMin),
    rpe_max: numOn(z.rpeMax),
    color: txt(z.color) || COLORES_ZONA[0],
    orden: Number(z.orden) || 0,
    ref_definicion: z.ref?.idDefinicion ?? null,
    ref_indice: z.ref ? z.ref.indice : null,
  }
}

/**
 * El rango de ritmo de una zona para un atleta, en km/h.
 *
 * Se devuelven los dos números y no un texto: cómo se enseñe —km/h, min/km,
 * vatios— depende del deporte, y eso ya lo sabe hacer quien pinta.
 */
export function rangoDe(z: ZonaEntrenador, referencia: number): { min: number; max: number } | null {
  const ref = Number(referencia)
  if (!Number.isFinite(ref) || ref <= 0) return null
  const a = Number(z.pctMin), b = Number(z.pctMax)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return { min: ref * a / 100, max: ref * b / 100 }
}
