// ============================================================
// TRIPULSE — A cuánto tiene que ir el atleta en una tarea guardada
// ============================================================
//
// LO PREGUNTAN DOS PANTALLAS DEL ATLETA: el briefing de la sesión y la de
// ejecución, la que tiene delante mientras entrena. La de ejecución calculaba
// por su cuenta, solo con la sigla, e ignoraba la copia: un AEL afinado al 70 %
// salía como el 65–75 del catálogo, y una zona de una clasificación (TEMPO, del
// VT1 + 15 % al VT2 − 5 %) salía sin ritmo. Justo en la pantalla donde más falta
// hace. Ahora las dos preguntan aquí.
//
// EL ORDEN, de mejor a peor dato:
//   · la copia — lo que se mandó, con los números de hoy del atleta
//   · una zona de una clasificación sin sus números — su RPE, que es suyo
//   · la zona por su sigla — ritmo, pulsaciones o RPE (lib/referencia-zona)

import type { SupabaseClient } from '@supabase/supabase-js'
import { objetivoDeZona, deDondeSale, type ObjetivoZona, type Tests } from './referencia-zona'
import { leerCopia, objetivoDeCopia, esCopiaDeLimites, testsDeCopia, type TareaConZona } from './prescripcion-zona'
import { testDeFila, type FilaTest, type TestConMediciones } from './referencia-propia'

export interface ObjetivoTarea {
  texto: string
  /** 'copia' = de la referencia con la que se prescribió. */
  de: ObjetivoZona['de'] | 'copia'
}

const nEs = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

export function objetivoDeTarea(
  t: TareaConZona | null | undefined,
  disciplina: string,
  tests: Tests | null | undefined,
  propios: TestConMediciones[] | null | undefined,
  fcMax: number,
  fcReposo = 0,
): ObjetivoTarea | null {
  const c = leerCopia(t?.zona_copia)
  const deCopia = objetivoDeCopia(c, disciplina, tests, propios)
  if (deCopia) return { texto: deCopia, de: 'copia' }
  /* Buscarla en el catálogo por su sigla daría nada, o peor, otra zona. */
  if (c && esCopiaDeLimites(c) && c.rpe) return { texto: 'RPE ' + nEs(c.rpe), de: 'esfuerzo' }
  return objetivoDeZona(t?.zona_entrenamiento, disciplina, tests || {}, fcMax, fcReposo)
}

/** De dónde sale ese número, para el `title` de la línea en gris. */
export const deDondeSaleTarea = (de: ObjetivoTarea['de']): string =>
  de === 'copia' ? 'De la referencia con la que se prescribió' : deDondeSale(de)

/**
 * Los tests del entrenador que hacen falta para enseñar esas tareas, con las
 * mediciones de ese atleta.
 *
 * SOLO LOS QUE HACEN FALTA: la mayoría de las sesiones no cuelgan de ninguno, y
 * serían dos consultas por apertura para nada. El atleta puede leerlos —los
 * suyos y la definición del test— desde que se abrieron los permisos.
 */
export async function cargarTestsDeTareas(
  sb: SupabaseClient,
  idDeportista: number,
  tareas: TareaConZona[] | null | undefined,
): Promise<TestConMediciones[]> {
  const ids = [...new Set((tareas || []).flatMap(t => testsDeCopia(leerCopia(t.zona_copia))))]
  if (!ids.length) return []
  const [{ data: defs }, { data: meds }] = await Promise.all([
    sb.from('test_definicion').select('*').in('id', ids),
    sb.from('test_medicion').select('id_definicion, fecha, datos').eq('id_deportista', idDeportista).in('id_definicion', ids),
  ])
  const porTest: Record<number, { fecha: string; datos: Record<string, unknown> }[]> = {}
  for (const m of (meds || []) as { id_definicion: number; fecha: string; datos: Record<string, unknown> | null }[]) {
    (porTest[m.id_definicion] ||= []).push({ fecha: m.fecha, datos: m.datos || {} })
  }
  /* La fila la lee «testDeFila», que entiende los DOS modelos de test. */
  return ((defs || []) as FilaTest[]).map(d => testDeFila(d, porTest[d.id] || []))
}
