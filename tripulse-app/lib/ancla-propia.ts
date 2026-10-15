// ============================================================
// TRIPULSE — Que un test PROPIO pueda fijar las zonas del atleta
// ============================================================
//
// LA PREGUNTA ESTRECHA, Y SOLO ESA. Aquí se contesta si un resultado propio
// puede ser la referencia de LA APP —la VAM, el FTP, el CSS—, esa que mueve las
// zonas que calcula la aplicación entera.
//
// NO ES LA ÚNICA FORMA DE QUE UN RESULTADO SIRVA. Un 1:13 el 100 sacado de un
// 6×100 es una referencia perfectamente buena para colgarle zonas propias, y a
// la vez NO es un CSS. Ese camino es otro —lib/referencia-propia— y no pasa por
// aquí ni tiene ninguna de estas restricciones. Confundir los dos fue el error
// de encuadre del que salió todo esto.
//
// UNA SOLA PUERTA, Y SE ELIGE A PROPÓSITO: la opción «Sustituir su VAM / FTP /
// CSS» del desplegable «¿Para qué sirve?» (ancla `app`). Hasta el 2026-10-14 la
// puerta la abría el TIPO: un «VO₂máx» de carrera podía ser su VAM, un «umbral»
// de bici su FTP. El entrenador no veía esa regla, y marcar «umbral» para colgar
// zonas propias no debería decir nada de la casilla de la app. Ahora los tipos
// (VT1, VT2, VO₂máx, una marca…) son hitos para TUS zonas y nada más, y la
// casilla de la app se pide con su nombre.
//
// SOLO HAY TRES COLUMNAS DE ANCLA, una por deporte: `test1_carrera.vam`,
// `test2_natacion.css` y `test3_ciclismo.ftp`. Y cada una guarda una magnitud
// concreta:
//
//   · vam — velocidad aeróbica máxima. Es un VO₂máx, no un umbral.
//   · ftp — potencia de umbral funcional. Es un umbral, no un VO₂máx.
//   · css — velocidad crítica de nado, que es la estimación de umbral.
//
// Lo que antes impedía la regla —meter un umbral de carrera en la columna `vam`
// y bajar todas sus zonas sin que nada fallara— ahora lo dice la explicación de
// la opción, con todas las letras, en el momento de elegirla.
//
// Y LAS UNIDADES. El resultado de un test propio lleva la unidad que el
// entrenador escribió, en texto libre. Guardar 4,3 «m/s» en una columna que
// espera km/h deja una VAM de 4,3 y unas zonas absurdas, calculadas y enseñadas
// tan tranquilas. Así que la unidad se reconoce o no se ofrece el botón.

import { DESTINOS, type Ancla as AnclaColumna, type Destino, type Propuesta } from './zonas-desde-test'
import { normalizar } from './disciplinas'
import { ANCLAS, tipoDeAncla, type Ancla, type DefinicionTest, type ResultadoTest } from './test-definicion'
import { calcularResultados } from './test-definicion'

const COLUMNA_DE: Record<string, AnclaColumna> = {
  Carrera: 'vam',
  Ciclismo: 'ftp',
  Natacion: 'css',
}

/* «Natación» y «Natacion» conviven en la base; la regla la pone el catálogo.
   Antes era `startsWith('Nat')`, que también habría dicho que «Natural» es
   natación, y era la TERCERA copia de la misma regla en la app. */
const normalizaDeporte = (d: string): string => normalizar(String(d ?? '').trim())

// ------------------------------------------------------------
// Qué dice cada opción de «¿Para qué sirve?»
// ------------------------------------------------------------
//
// UN SOLO SITIO para la etiqueta y la explicación: las leen /tests-propios y
// /laboratorio, y dos copias de «qué es un VT1» acabarían diciendo cosas
// distintas. Las definiciones son las de la base de conocimiento (B1-00 y
// B1-00b): VT1 ≈ LT1 ≈ 2 mmol/L; VT2 ≈ LT2 ≈ 4 mmol/L, lo que se sostiene de 30
// a 60 min; la VAM, la velocidad mínima con la que se llega al VO₂máx.

/** Si en ese deporte hay casilla de la app que sustituir. */
export const haySustituto = (deporte: string): boolean => !!COLUMNA_DE[normalizaDeporte(deporte)]

/** Lo que se lee en el desplegable. La de sustituir dice cuál: su VAM, su FTP, su CSS. */
export function etiquetaAncla(a: Ancla, deporte: string): string {
  if (a !== 'app') return ANCLAS[a]?.etiqueta ?? ''
  const col = COLUMNA_DE[normalizaDeporte(deporte)]
  return col
    ? 'Sustituir su ' + DESTINOS[col].nombre + ' (la de la app)'
    : 'Sustituir la de la app (solo carrera, ciclismo o natación)'
}

/** Qué es cada tipo, dicho para el entrenador. */
const QUE_ES: Record<Exclude<Ancla, 'app' | 'nada'>, string> = {
  umbral_aer: 'El primer umbral (VT1, LT1): donde el lactato empieza a subir —sobre 2 mmol/L— y la respiración se acelera por primera vez. Por debajo queda el rodaje fácil.',
  umbral: 'El segundo umbral (VT2, LT2): lo más fuerte que aguanta de 30 a 60 minutos, sobre 4 mmol/L. El FTP en bici y el CSS en el agua son este umbral.',
  vo2max: 'La velocidad o la potencia más baja con la que llega a su VO₂máx: la VAM corriendo, la PAM en bici. Sale de un test de 5–6 minutos o de una prueba progresiva. Apúntala en km/h o en W, no en ml/kg/min: de un consumo de oxígeno no sale un ritmo.',
  sprint: 'Lo más rápido que va (MSS) o su potencia pico (MPP): esfuerzos de pocos segundos.',
  propio: 'Un umbral que sacas con tu propio método y que no es ninguno de los de arriba: el de tu test de 30 minutos, el de tu protocolo de pista…',
  especifica: 'Una marca de rendimiento, no un umbral: el ritmo de su 6×100, su mejor 800…',
}

const ES_HITO = 'Sirve de hito para tus zonas propias: en Zonas propias lo añades a una clasificación y le cuelgas zonas («del VT1 al VT1 + 15 %»). No toca las zonas de la app.'

/* Qué va en la casilla de la app y qué pasa si se pone otra cosa. Es lo que
   antes impedía la regla en silencio; ahora se dice al elegir. */
const QUE_VA: Record<AnclaColumna, string> = {
  vam: 'su VAM, la velocidad más baja con la que llega a su VO₂máx (la de un test de 5–6 minutos). Si pones un umbral, todas sus zonas de la app bajarán',
  ftp: 'su FTP, lo más fuerte que aguanta una hora. Si pones su PAM o un VO₂máx, todas sus zonas de bici subirán',
  css: 'su CSS, su ritmo umbral en el agua. Si pones un ritmo de 100 o 200 m a tope, todas sus zonas de natación irán más rápido de lo que aguanta',
}

/** Si es uno de los tipos que solo sirven de hito para tus zonas (ni la app, ni seguimiento). */
export const esHitoPropio = (a: Ancla | undefined): boolean => !!a && a !== 'app' && a !== 'nada'

/** Qué es esa opción, sin la coletilla de para qué sirve (el glosario la dice una vez por grupo). */
export function queEsAncla(a: Ancla, deporte: string): string {
  if (a === 'nada') return 'Solo se guarda y se pinta en su gráfica. No sirve de hito ni mueve ninguna zona.'
  if (a === 'app') {
    const col = COLUMNA_DE[normalizaDeporte(deporte)]
    if (!col) return 'Solo en carrera, ciclismo y natación: son los deportes con zonas de la app.'
    return 'Pasa a ser su ' + DESTINOS[col].nombre + ': cuando lo fijes desde una de sus mediciones, las zonas de la app ' +
      'de ese deportista (Z1–Z7 y Zonas 2) se calculan con este número. Aquí solo va ' + QUE_VA[col] +
      '. También sirve de hito para tus zonas propias.'
  }
  return QUE_ES[a] ?? ''
}

/** Para qué sirve un hito de tus zonas: una vez por grupo en el glosario. */
export const PARA_QUE_HITO = ES_HITO

/** Qué significa elegir esa opción, en ese deporte: lo que se lee debajo del desplegable. */
export const explicarAncla = (a: Ancla, deporte: string): string =>
  esHitoPropio(a) ? queEsAncla(a, deporte) + ' ' + ES_HITO : queEsAncla(a, deporte)

// ------------------------------------------------------------
// Las unidades
// ------------------------------------------------------------

/**
 * De la unidad que escribió el entrenador a la que guarda la columna.
 *
 * `null` cuando no se reconoce, y entonces NO se ofrece fijar las zonas. Es
 * deliberado: adivinar aquí es lo que deja una VAM de 4,3 km/h en la base.
 */
export function conversionA(columna: AnclaColumna, unidad: string): ((n: number) => number) | null {
  const u = String(unidad ?? '').toLowerCase().replace(/\s+/g, '')

  if (columna === 'vam') {
    if (['km/h', 'kmh', 'kph'].includes(u)) return n => n
    if (['m/s', 'ms'].includes(u)) return n => Math.round(n * 3.6 * 100) / 100
    return null
  }
  if (columna === 'ftp') {
    if (['w', 'vatios', 'watts', 'watt'].includes(u)) return n => Math.round(n)
    return null
  }
  // css se guarda en m/s.
  if (['m/s', 'ms'].includes(u)) return n => n
  if (['km/h', 'kmh'].includes(u)) return n => Math.round(n / 3.6 * 1000) / 1000
  /* Segundos por 100 m: es como se lee un CSS en el vaso, y es INVERSO —a más
     segundos, menos velocidad—. Sin esta conversión, un 85 se guardaría como
     85 m/s. */
  if (['s/100m', 'seg/100m', 's/100', 'seg/100'].includes(u)) {
    return n => (n > 0 ? Math.round((100 / n) * 1000) / 1000 : 0)
  }
  return null
}

/** Las unidades que se aceptan en cada deporte, para poder decírselo. */
export const UNIDADES_OK: Record<string, string> = {
  Carrera: 'km/h o m/s',
  Ciclismo: 'W',
  Natacion: 'm/s, km/h o s/100m',
}

// ------------------------------------------------------------
// Si un resultado puede fijar las zonas
// ------------------------------------------------------------

export interface Veredicto {
  /** `null` si puede. Si no, el motivo, escrito para el entrenador. */
  motivo: string | null
  destino: Destino | null
}

export function puedeFijar(deporte: string, r: ResultadoTest): Veredicto {
  const dep = normalizaDeporte(deporte)
  const columna = COLUMNA_DE[dep]
  if (!columna) {
    return { motivo: 'Las zonas de la app solo salen de carrera, ciclismo o natación.', destino: null }
  }

  if (tipoDeAncla(r.ancla) === 'seguimiento') {
    return { motivo: 'Está marcado como solo seguimiento.', destino: null }
  }

  if (r.ancla !== 'app') {
    /* Un VT1, un umbral, una marca suya… son hitos para SUS zonas, y lo son
       igual de bien. Que además pase a ser su VAM se pide con su opción: así
       nadie mete un umbral en la casilla de la VAM por haber marcado «umbral»
       para colgarle zonas. Se dice así de claro para que no parezca que no vale. */
    return {
      motivo: 'Es un hito para tus zonas propias. Para que pase a ser su ' + DESTINOS[columna].nombre +
        ' y mueva las zonas de la app, elige «' + etiquetaAncla('app', dep) + '».',
      destino: null,
    }
  }

  if (!conversionA(columna, r.unidad)) {
    return {
      motivo: 'No se reconoce la unidad «' + (r.unidad || '—') + '». Para ' +
        dep.toLowerCase() + ' hace falta ' + UNIDADES_OK[dep] + '.',
      destino: null,
    }
  }

  return { motivo: null, destino: DESTINOS[columna] }
}

// ------------------------------------------------------------
// La propuesta
// ------------------------------------------------------------

/**
 * Qué se guardaría si se pulsara. `null` si no se puede o no hay número.
 *
 * Se calcula desde `calcularResultados`, las MISMAS cuentas que el entrenador
 * ve en pantalla: si un día cambia una fórmula, cambia en los dos sitios porque
 * solo hay uno.
 */
export function propuestaPropia(
  def: DefinicionTest,
  indice: number,
  datos: Record<string, unknown>,
): Propuesta | null {
  const r = def?.resultados?.[indice]
  if (!r) return null

  const v = puedeFijar(def.deporte, r)
  if (!v.destino) return null

  const calc = calcularResultados(def, datos)[indice]
  if (!calc || calc.error || calc.valor == null) return null

  const convertir = conversionA(v.destino.columna, r.unidad)!
  const valor = convertir(calc.valor)
  if (!Number.isFinite(valor) || valor <= 0) return null

  return {
    /* `aporte` existe para los tests de serie, donde describe POR QUÉ ese test
       vale. Aquí el porqué lo puso el entrenador al declarar el ancla, así que
       se rellena con eso y se deja constancia de que es estimado: una fórmula
       propia no tiene detrás la validación que tienen los tests del catálogo. */
    aporte: {
      ancla: v.destino.columna,
      salida: r.nombre,
      convertir,
      estimado: true,
      porque: 'Lo marcaste para sustituir su ' + v.destino.nombre + ' al crear el test.',
    },
    destino: v.destino,
    valor,
    texto: String(valor).replace('.', ',') + ' ' + v.destino.unidad,
  }
}

/**
 * La etiqueta que se guarda en `origen`, para saber de dónde salió el número.
 *
 * Lleva el id del test y no solo su nombre: los nombres se cambian, y dentro de
 * dos meses «Cooper» puede ser otro test distinto.
 */
export const origenDe = (idDefinicion: number): string => 'propio:' + idDefinicion
