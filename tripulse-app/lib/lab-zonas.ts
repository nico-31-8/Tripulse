// ============================================================
// TRIPULSE — Laboratorio: que un resultado gobierne las zonas
// ============================================================
//
// EL QUIÉN PUEDE NO SE DECIDE AQUÍ. Quién puede ocupar la casilla de la VAM, el
// FTP o el CSS lo decide `lib/ancla-propia`, que es quien ya lo decide para
// /tests-propios. Aquí solo se calcula el número con el motor del laboratorio y
// se le da hecho. Dos sitios contestando a «¿puede este test fijar las zonas?»
// acabarían contestando distinto, y el día que no coincidieran, un umbral de
// carrera entraría en la casilla de la VAM y bajaría TODAS las zonas del atleta
// sin que nada fallara.
//
// LA RESTRICCIÓN QUE MANDA, recordada aquí porque es la que más duele: solo hay
// tres columnas de ancla y cada una guarda una magnitud concreta. `vam` es un
// VO₂máx; `ftp` y `css` son umbrales. Así que solo cabe un ancla por deporte, y
// un «umbral» de carrera se rechaza explicando por qué.

import { calcular, type Resultado, type TestLab, type Datos } from './lab-constructor'
import { puedeFijar, conversionA, origenDe, type Veredicto } from './ancla-propia'
import type { Propuesta } from './zonas-desde-test'
import type { ResultadoTest } from './test-definicion'

export { origenDe }
export type { Veredicto }

/**
 * Lo que `ancla-propia` necesita saber de un resultado: su ancla y su unidad.
 *
 * Se arma un objeto con la forma que espera en vez de cambiar su firma: la
 * pregunta que contesta —«¿esta magnitud cabe en esa casilla?»— no depende de
 * la fórmula ni del modelo con el que se montó el test.
 */
const comoViejo = (r: Resultado): ResultadoTest => ({
  nombre: r.nombre,
  unidad: r.unidad,
  ancla: r.ancla || 'nada',
  formula: [],
  graf: r.graf !== false,
  ...(typeof r.inverso === 'boolean' ? { inverso: r.inverso } : {}),
})

/** Si este resultado puede fijar la referencia de la app, y si no, por qué. */
export const puedeFijarLab = (deporte: string, r: Resultado): Veredicto =>
  puedeFijar(deporte, comoViejo(r))

/**
 * Qué se guardaría si se pulsara. `null` si no se puede o no hay número.
 *
 * El valor sale de `calcular`, las MISMAS cuentas que el entrenador está viendo
 * en pantalla: si un día cambia una fórmula, cambia en los dos sitios porque
 * solo hay uno.
 */
export function propuestaLab(test: TestLab, indice: number, datos: Datos): Propuesta | null {
  const r = test?.resultados?.[indice]
  if (!r) return null

  const v = puedeFijarLab(test.deporte, r)
  if (!v.destino) return null

  const calc = calcular(test, datos)[indice]
  if (!calc || calc.error || calc.valor == null) return null

  const convertir = conversionA(v.destino.columna, r.unidad)
  /* Sin conversión reconocida no hay propuesta. Adivinar aquí es lo que deja
     una VAM de 4,3 km/h calculada y enseñada tan tranquila. */
  if (!convertir) return null

  const valor = convertir(calc.valor)
  if (!Number.isFinite(valor) || valor <= 0) return null

  return {
    aporte: {
      ancla: v.destino.columna,
      salida: r.nombre,
      convertir,
      /* Estimado a propósito: una fórmula que se ha montado el entrenador no
         tiene detrás la validación que tienen los tests del catálogo. */
      estimado: true,
      porque: 'Lo declaraste como ' + (r.ancla === 'vo2max' ? 'VO₂máx' : 'umbral') + ' al crear el test.',
    },
    destino: v.destino,
    valor,
    texto: String(valor).replace('.', ',') + ' ' + v.destino.unidad,
  }
}
