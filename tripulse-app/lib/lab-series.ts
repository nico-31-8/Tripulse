// ============================================================
// TRIPULSE — Laboratorio: cómo va un test con el tiempo
// ============================================================
//
// LOS RESULTADOS SE RECALCULAN, NUNCA SE GUARDAN. Cada medición guarda lo que
// se midió en bruto, y la gráfica sale de pasar esos datos por la fórmula de
// hoy. Así, corregir una fórmula corrige el historial entero. Guardando los
// resultados quedarían congelados con la fórmula vieja y, al mirar la línea, no
// habría forma de saber cuáles se calcularon con cuál.
//
// UNA GRÁFICA POR RESULTADO, y no todas en la misma: la VAM va en km/h y el
// ritmo en min/km. En un eje común la línea del ritmo sería una raya plana
// pegada al suelo y no compararía nada.

import { calcular, type Resultado, type TestLab } from './lab-constructor'
import { menosEsMejor } from './test-definicion'
import type { Medicion } from './lab-guardar'

/**
 * Si en esta unidad bajar es mejorar.
 *
 * ES EL ÚNICO SITIO DONDE SE DECIDE ESTO en el laboratorio, y se apoya en la
 * misma regla que /tests-propios: la flecha de la gráfica y el porcentaje de
 * una zona colgada de aquí tienen que estar de acuerdo. Si una dice que mejoró
 * y el otro va al revés, uno de los dos miente y no hay forma de saber cuál.
 */
export const esInverso = (r: Resultado): boolean =>
  typeof r.inverso === 'boolean' ? r.inverso : menosEsMejor(r.nombre, r.unidad)

export interface Punto { fecha: string; valor: number }

export interface Serie {
  nombre: string
  unidad: string
  puntos: Punto[]
  /** Cuánto ha cambiado desde el punto anterior. */
  delta: number | null
  /** Si ese cambio es a mejor. `null` cuando no cambió o no hay con qué comparar. */
  mejora: boolean | null
  /** Lo que hay que saber antes de fiarse del último punto. */
  avisos: string[]
}

/**
 * Una serie por resultado marcado para gráfica.
 *
 * Las mediciones a las que les falta algo NO rompen la línea: simplemente no
 * ponen punto. Un test a medias es un test que no se puede dibujar, no un
 * agujero que haya que rellenar con un cero — que además saldría como una
 * caída en picado.
 */
export function seriesDe(test: TestLab, mediciones: Medicion[]): Serie[] {
  const orden = [...(mediciones || [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  const calculado = orden.map(m => ({ fecha: m.fecha, vals: calcular(test, m.datos || {}) }))

  return (test.resultados || []).map((r, i) => {
    const puntos: Punto[] = []
    for (const c of calculado) {
      const v = c.vals[i]
      if (!v || v.error || v.valor == null || !Number.isFinite(v.valor)) continue
      puntos.push({ fecha: c.fecha, valor: v.valor })
    }

    let delta: number | null = null, mejora: boolean | null = null
    if (puntos.length >= 2) {
      const ult = puntos[puntos.length - 1].valor, prev = puntos[puntos.length - 2].valor
      delta = ult - prev
      mejora = delta === 0 ? null : (esInverso(r) ? delta < 0 : delta > 0)
    }

    /* Los avisos del ÚLTIMO punto, que es el que se está mirando. Si la recta
       de su perfil no ajustaba, eso tiene que seguir dicho aquí: el número ya
       está dibujado y con aspecto de dato firme. */
    const ultimo = calculado[calculado.length - 1]?.vals?.[i]
    return {
      nombre: r.nombre, unidad: r.unidad, puntos, delta, mejora,
      avisos: ultimo?.avisos || [],
    }
  }).filter((_, i) => test.resultados[i].graf !== false)
}

/** Los resultados que podrían gobernar zonas, con su sitio en la lista. */
export const conAncla = (test: TestLab): { indice: number; r: Resultado }[] =>
  (test.resultados || [])
    .map((r, indice) => ({ indice, r }))
    .filter(x => !!x.r.ancla && x.r.ancla !== 'nada')
