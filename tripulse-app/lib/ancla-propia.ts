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
// LA MISMA REGLA QUE YA SE APLICA A LOS DE SERIE (ver lib/zonas-desde-test):
// un test solo puede fijar el ancla si mide LA MISMA MAGNITUD. Allí se dice que
// el T30 no entra porque da ritmo umbral y eso no es la VAM. Aquí pasa igual, y
// más veces, porque el sistema de anclas del test propio es más rico que lo que
// la base sabe guardar.
//
// SOLO HAY TRES COLUMNAS DE ANCLA, una por deporte: `test1_carrera.vam`,
// `test2_natacion.css` y `test3_ciclismo.ftp`. Y cada una guarda una magnitud
// concreta:
//
//   · vam — velocidad aeróbica máxima. Es un VO₂máx, no un umbral.
//   · ftp — potencia de umbral funcional. Es un umbral, no un VO₂máx.
//   · css — velocidad crítica de nado, que es la estimación de umbral.
//
// De ahí sale la tabla de abajo, y de ahí que un «umbral» de CARRERA no se
// pueda guardar: metido en la columna `vam` desplazaría todas las zonas de ese
// atleta hacia abajo, sin que nada fallara. Se dice que no y se explica.
//
// Y LAS UNIDADES. El resultado de un test propio lleva la unidad que el
// entrenador escribió, en texto libre. Guardar 4,3 «m/s» en una columna que
// espera km/h deja una VAM de 4,3 y unas zonas absurdas, calculadas y enseñadas
// tan tranquilas. Así que la unidad se reconoce o no se ofrece el botón.

import { DESTINOS, type Ancla as AnclaColumna, type Destino, type Propuesta } from './zonas-desde-test'
import { tipoDeAncla, type Ancla, type DefinicionTest, type ResultadoTest } from './test-definicion'
import { calcularResultados } from './test-definicion'

/**
 * Qué ancla del test propio puede escribir en cada deporte.
 *
 * Una sola por deporte, y no es una simplificación: es que la columna guarda
 * esa magnitud y no otra.
 */
export const ANCLA_QUE_CABE: Record<string, Ancla> = {
  Carrera: 'vo2max',
  Ciclismo: 'umbral',
  Natacion: 'umbral',
}

const COLUMNA_DE: Record<string, AnclaColumna> = {
  Carrera: 'vam',
  Ciclismo: 'ftp',
  Natacion: 'css',
}

const normalizaDeporte = (d: string): string => {
  const s = String(d ?? '').trim()
  return s.startsWith('Nat') ? 'Natacion' : s
}

const cabeColumna = (dep: string): AnclaColumna => COLUMNA_DE[dep]

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
    return { motivo: 'Las zonas solo salen de carrera, ciclismo o natación.', destino: null }
  }

  if (tipoDeAncla(r.ancla) === 'seguimiento') {
    return { motivo: 'Está marcado como solo seguimiento.', destino: null }
  }

  const cabe = ANCLA_QUE_CABE[dep]

  if (r.ancla === 'especifica') {
    /* Una marca suya SÍ es una referencia —puede colgarle sus zonas—, lo que no
       puede es ocupar la casilla de la app, que espera una magnitud concreta.
       Se dice así de claro para que no parezca que su marca no vale. */
    return {
      motivo: 'Una marca tuya sirve para colgarle TUS zonas, pero no para ser el ' +
        DESTINOS[cabeColumna(dep)].nombre + ' de la app: esa casilla espera un ' +
        (cabe === 'vo2max' ? 'VO₂máx' : 'umbral') + ' medido.',
      destino: null,
    }
  }
  if (r.ancla !== cabe) {
    /* El caso que más va a pasar: un «umbral» de carrera. La columna de carrera
       guarda la VAM, que es otra velocidad; meterlo ahí bajaría todas sus zonas
       sin que nada fallara. */
    return {
      motivo: 'En ' + dep.toLowerCase() + ' la referencia del atleta es ' +
        DESTINOS[columna].nombre + ', y eso es un ' +
        (cabe === 'vo2max' ? 'VO₂máx' : 'umbral') + '. Este resultado mide otra cosa.',
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
      porque: 'Lo declaraste como ' + (r.ancla === 'vo2max' ? 'VO₂máx' : 'umbral') +
        ' al crear el test.',
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
