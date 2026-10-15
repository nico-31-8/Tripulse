// ============================================================
// TRIPULSE — Laboratorio: un dato que se apunta tal cual
// ============================================================
//
// LO MISMO QUE EN /tests-propios (lib/test-definicion, `campoTalCual`), con el
// modelo del laboratorio: el VT1 del informe de una prueba de esfuerzo no se
// calcula, se escribe. Aquí un resultado sale siempre de casillas, así que
// «tal cual» es una casilla suelta y un resultado que es solo esa casilla. Se
// crean juntos, se renombran juntos y se borran juntos.
//
// NO SE GUARDA NINGUNA MARCA: se deduce. Un resultado es tal cual si su fórmula
// es una casilla suelta medida —no dada, no calculada, no de parciales— que no
// usa nadie más. Así un test de antes montado así se ve igual, y ponerle una
// fórmula de verdad lo deja de ser solo.
//
// LAS FUNCIONES CAMBIAN EL TEST QUE RECIBEN: son para `mut`, que ya trabaja
// sobre una copia. Es como se escribe todo lo demás del laboratorio.

import { col, buscaCol, camposDe, todasLasColumnas, type TestLab } from './lab-constructor'

/** La casilla que ese resultado apunta tal cual, o `null` si sale de una fórmula de verdad. */
export function sueltoTalCual(t: TestLab | null | undefined, i: number): string | null {
  const f = t?.resultados?.[i]?.formula || []
  if (f.length !== 1 || f[0].t !== 'var') return null
  const clave = f[0].v
  const c = (t!.sueltos || []).find(x => x.clave === clave)
  /* Solo una que se apunta: una dada viene puesta, una calculada sale de otras,
     y una de parciales es una lista, no un número. */
  if (!c || c.clase !== 'medida' || c.instrumento === 'parciales') return null
  const usanResultados = t!.resultados.some((r, k) => k !== i && camposDe(r.formula).includes(clave))
  const usanColumnas = todasLasColumnas(t!).some(x => camposDe(x.c.formula || []).includes(clave)
    || x.c.desdeRef === clave || x.c.pasoRef === clave)
  return usanResultados || usanColumnas ? null : clave
}

/**
 * Los nombres del próximo dato tal cual: el del resultado y el de su casilla.
 *
 * APARTE DE AÑADIRLO, y a propósito: quien llama necesita la clave ANTES de
 * cambiar el test —para abrirle hueco en las cajas de cada persona—, y dentro
 * de `mut` React puede ejecutar el cambio más tarde.
 */
export function nombresDatoTalCual(t: TestLab): { nombre: string; clave: string } {
  const usado = (s: string) => !!buscaCol(t, s) || t.resultados.some(r => r.nombre === s)
  let n = t.resultados.length + 1
  while (usado('dato_' + n) || usado('dato_' + n + '_valor')) n++
  const nombre = 'dato_' + n
  /* La casilla no se llama como el resultado —las fórmulas nombran a los dos—,
     así que lleva su coletilla. Lo que se ve al pasarlo es su etiqueta, y esa
     sí es el nombre del dato. */
  return { nombre, clave: nombre + '_valor' }
}

/** Añade un dato tal cual: su casilla suelta y su resultado. Devuelve la clave de la casilla. */
export function anadirDatoTalCual(t: TestLab, n = nombresDatoTalCual(t)): string {
  t.sueltos.push(col({ clave: n.clave, etiqueta: n.nombre }))
  t.resultados.push({ nombre: n.nombre, unidad: '', formula: [{ t: 'var', v: n.clave }] })
  return n.clave
}

/**
 * Renombra un resultado: los que lo encadenan lo siguen y, si es tal cual, lo
 * que se ve en su casilla al pasarlo también —salvo que el entrenador la
 * hubiera escrito a mano—.
 */
export function renombrarResultadoLab(t: TestLab, i: number, nuevo: string): void {
  const r = t.resultados[i]
  if (!r) return
  const viejo = r.nombre
  const clave = sueltoTalCual(t, i)
  r.nombre = nuevo
  for (const x of t.resultados) for (const b of x.formula) if (b.t === 'ref' && b.v === viejo) b.v = nuevo
  if (!clave) return
  const c = t.sueltos.find(x => x.clave === clave)
  if (c && (!c.etiqueta || c.etiqueta === viejo)) c.etiqueta = nuevo
}

/** La unidad de un resultado; si es tal cual, también la de su casilla, que es la que se ve al pasarlo. */
export function unidadResultadoLab(t: TestLab, i: number, unidad: string): void {
  const r = t.resultados[i]
  if (!r) return
  const clave = sueltoTalCual(t, i)
  r.unidad = unidad
  const c = clave ? t.sueltos.find(x => x.clave === clave) : null
  if (c) c.unidad = unidad
}

/** Quita un resultado y, si era tal cual, su casilla: sola no la usaría nadie. */
export function quitarResultadoLab(t: TestLab, i: number): void {
  const clave = sueltoTalCual(t, i)
  t.resultados.splice(i, 1)
  if (clave) t.sueltos = t.sueltos.filter(x => x.clave !== clave)
}
