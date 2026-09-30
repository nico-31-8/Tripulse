// ============================================================
// TRIPULSE — Un día de test: la sesión que lleva un test pegado
// ============================================================
//
// EL CASO. El entrenador planifica la temporada y el jueves toca test. Hasta
// ahora eso era una sesión normal con una nota escrita a mano: el día del test
// había que ir a Tests o al Laboratorio, buscarlo en la lista, elegir al
// deportista y poner la fecha. Cuatro pasos, a pie de pista, con gente
// esperando.
//
// LA DECISIÓN: LA SESIÓN ENTERA ES EL TEST (la tomó el usuario). No es una
// tarea más dentro de la sesión. Se ve de un vistazo en el calendario, y la
// sesión puede llevar además sus tareas normales — el calentamiento no
// desaparece por esto.
//
// SON DOS CATÁLOGOS Y NO SE PUEDEN MEZCLAR:
//
//   · La BATERÍA (`lib/catalogo-tests`), que se identifica por una clave de
//     texto («6min», «navette») y se dirige en /tests/dirigir.
//   · Los TUYOS (`test_definicion`), del laboratorio o de tests propios, que se
//     identifican por un id numérico.
//
// Por eso lo guardado es una unión y no un par de columnas sueltas: una clave
// de texto y un id numérico no son la misma cosa, y una columna que a veces
// lleve una y a veces el otro es la forma segura de acabar abriendo el test
// equivocado.
//
// LO QUE NO SE GUARDA: EL NOMBRE. Se resuelve al pintarlo —el de la batería
// sale del catálogo, sin consultar nada; el tuyo, de tu lista de tests— para
// que renombrar un test no deje sesiones diciendo el nombre viejo.

import { testPorClave } from './catalogo-tests'

export type OrigenTest = 'bateria' | 'propio'

export type TestDeSesion =
  | { origen: 'bateria'; clave: string }
  | { origen: 'propio'; id: number }

/**
 * Lo guardado en `sesion.test`, leído a la defensiva.
 *
 * Todo lo que no se entienda es `null`: una sesión con basura en esa columna
 * tiene que comportarse como una sesión normal, no reventar la pantalla. Un
 * test borrado se nota más tarde, al no encontrar su nombre, y eso se dice.
 */
export function leerTestDeSesion(bruto: unknown): TestDeSesion | null {
  let d: unknown = bruto
  if (typeof d === 'string') { try { d = JSON.parse(d) } catch { return null } }
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>

  if (o.origen === 'bateria') {
    const clave = String(o.clave ?? '').trim()
    return clave ? { origen: 'bateria', clave } : null
  }
  if (o.origen === 'propio') {
    const id = Number(o.id)
    return Number.isFinite(id) && id > 0 ? { origen: 'propio', id: Math.round(id) } : null
  }
  return null
}

/** Una clave de texto para comparar y para las listas de React. */
export const claveDeTest = (t: TestDeSesion): string =>
  t.origen === 'bateria' ? 'bateria:' + t.clave : 'propio:' + t.id

export const mismoTest = (a: TestDeSesion | null, b: TestDeSesion | null): boolean =>
  !!a && !!b && claveDeTest(a) === claveDeTest(b)

/**
 * Cómo se llama, resuelto en el momento.
 *
 * `null` cuando el test ya no existe —lo archivaste, lo borraste—, y eso la
 * pantalla lo dice en vez de enseñar un hueco: una sesión que promete un test
 * que no está es justo lo que hay que poder ver antes del jueves.
 */
export function nombreDelTest(
  t: TestDeSesion | null,
  mios: { id: number; nombre: string }[] | null | undefined,
): string | null {
  if (!t) return null
  if (t.origen === 'bateria') return testPorClave(t.clave)?.nombre ?? null
  return (mios || []).find(x => Number(x.id) === t.id)?.nombre ?? null
}

/**
 * A dónde lleva el botón de pasarlo, con el deportista y el día ya puestos.
 *
 * ESTO ES LA MITAD DEL VALOR de todo esto: abrir el test montado. Elegirlo otra
 * vez a pie de pista, con gente esperando, es donde se acaba pasando el test
 * que no era o apuntándolo con la fecha de hoy en vez de la de la sesión.
 */
export function enlaceDelTest(
  t: TestDeSesion,
  quien: { deportistas?: number[]; fecha?: string },
): string {
  const p = new URLSearchParams()
  const deps = (quien.deportistas || []).filter(n => Number.isFinite(n) && n > 0)
  if (deps.length) p.set('dep', deps.join(','))
  if (quien.fecha) p.set('fecha', quien.fecha)
  if (t.origen === 'bateria') {
    p.set('test', t.clave)
    return '/tests/dirigir?' + p.toString()
  }
  p.set('test', String(t.id))
  return '/laboratorio?' + p.toString()
}

/**
 * Si el test de esa sesión ya se pasó ese día.
 *
 * TRES ESTADOS, y el tercero importa: `null` es «no se puede saber». Los tests
 * de la batería se guardan en sus tablas por disciplina (`test1_carrera`…) y
 * NO dejan escrito cuál de los diecisiete fue —se comprobó: la columna que
 * podría decirlo está vacía en todas las filas—. Así que de la batería no se
 * afirma que esté hecho ni que falte. Inventarse un ✅ ahí sería peor que no
 * tenerlo: un test dado por hecho no se repite.
 */
export function testHecho(
  t: TestDeSesion | null,
  fecha: string,
  mediciones: { id_definicion: number; fecha: string }[] | null | undefined,
): boolean | null {
  if (!t) return null
  if (t.origen === 'bateria') return null
  return (mediciones || []).some(m => Number(m.id_definicion) === t.id && String(m.fecha) === String(fecha))
}

/**
 * La última vez que ese atleta hizo ese test, si se sabe.
 *
 * Es el dato que dice si el test toca o si lo estás repitiendo demasiado
 * pronto. De la batería, por lo de arriba, no se sabe.
 */
export function ultimaVezDelTest(
  t: TestDeSesion | null,
  antesDe: string,
  mediciones: { id_definicion: number; fecha: string }[] | null | undefined,
): string | null {
  if (!t || t.origen !== 'propio') return null
  const suyas = (mediciones || [])
    .filter(m => Number(m.id_definicion) === t.id && String(m.fecha) < String(antesDe))
    .map(m => String(m.fecha))
    .sort()
  return suyas.length ? suyas[suyas.length - 1] : null
}
