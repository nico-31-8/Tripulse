// ============================================================
// El análisis libre de movimiento (v3 del analizador, paso 3)
// ============================================================
//
// Un análisis sin batería: el mismo visor, sin criterios ni nota. Lleva un
// nombre, desde dónde está grabado, las notas del entrenador y los fotogramas
// que se guardan, cada uno con sus medidas (y las curvas del esqueleto, como en
// las baterías), lo dibujado y, con permiso, su imagen. La base, en
// supabase/analisis-libre.sql.
//
// DE QUIÉN ES: siempre de un deportista. Una persona de fuera es un EVALUADO
// (deportista con solo_test, decidido el 17-10-2026): «Análisis sueltos» son los
// análisis libres de los evaluados. Los evaluados no gastan cupo.
//
// QUIÉN LO VE: solo quien le valora (su entrenador, y el director al que se lo
// haya abierto). El propio deportista no: lo dice la base, no la pantalla.
//
// EL VÍDEO NO SALE DEL DISPOSITIVO: se sube solo la imagen del fotograma, y solo
// con el permiso marcado en su ficha. Va al almacén de las baterías, en
// «{id_deportista}/libre-{id_analisis}/…», que el deportista no puede leer.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hoyISO } from './fechas'
import type { Vista } from './baterias-movimiento'
import { fiabilidadDe, MEDIDAS_GRAFICA, NOMBRE_MEDIDA, type ClaveGrafica } from './cuerpo'
import { extremosDeSerie, grados, MINIMO_PUNTOS, NOMBRE_FOTOGRAMA, puntosDeSerie, type GraficaDisponible } from './informe-movimiento'
import { ALMACEN, subirFotograma, type Medida, type SerieGuardada, type Trazo } from './movimiento-datos'

export interface AnalisisLibre {
  id: number
  id_deportista: number
  titulo: string
  vista: Vista
  notas: string | null
  fecha: string
  actualizada_en: string
}

export interface FotogramaLibre {
  id: number
  id_analisis: number
  id_deportista: number
  /** En qué momento del vídeo; null en una foto. */
  segundo: number | null
  /** Lo que pesa (las curvas): no viene en las listas, sí al abrir un análisis. */
  medidas?: Medida[] | null
  dibujo?: Trazo[] | null
  imagen: string | null
  created_at: string
}

export const LARGO_TITULO = 120
export const LARGO_NOTAS = 4000

const CAMPOS_ANALISIS = 'id, id_deportista, titulo, vista, notas, fecha, actualizada_en'

/* ---------------------------------------------------------------
   Leer
   --------------------------------------------------------------- */

/** Sus análisis libres, el último arriba, con sus fotogramas sin lo que pesa (para contarlos y enseñar la imagen). */
export async function cargarAnalisisLibres(sb: SupabaseClient, idDep: number): Promise<{ analisis: AnalisisLibre[]; fotogramas: FotogramaLibre[]; error?: string }> {
  const [a, f] = await Promise.all([
    sb.from('analisis_libre').select('id, id_deportista, titulo, vista, notas, fecha, actualizada_en')
      .eq('id_deportista', idDep).order('fecha', { ascending: false }).order('id', { ascending: false }),
    sb.from('analisis_libre_fotograma').select('id, id_analisis, id_deportista, segundo, imagen, created_at')
      .eq('id_deportista', idDep).order('id'),
  ])
  return {
    analisis: (a.data || []) as AnalisisLibre[],
    fotogramas: (f.data || []) as FotogramaLibre[],
    error: a.error?.message || f.error?.message,
  }
}

/** Los fotogramas de UN análisis, con sus medidas y lo dibujado: al abrirlo. */
export async function cargarFotogramasLibres(sb: SupabaseClient, idAnalisis: number): Promise<{ fotogramas: FotogramaLibre[]; error?: string }> {
  const { data, error } = await sb.from('analisis_libre_fotograma')
    .select('id, id_analisis, id_deportista, segundo, medidas, dibujo, imagen, created_at')
    .eq('id_analisis', idAnalisis).order('id')
  return { fotogramas: (data || []) as FotogramaLibre[], error: error?.message }
}

export interface Suelto { analisis: AnalisisLibre; nombre: string; fotogramas: number }

/**
 * Los análisis sueltos de un entrenador: los de sus evaluados. Para la portada
 * de Tests. Los evaluados son siempre de quien los crea (la base no deja crear
 * fichas para otro), así que va con su propio id, no con el del espacio.
 */
export async function cargarSueltos(sb: SupabaseClient, idEntrenador: string): Promise<{ sueltos: Suelto[]; error?: string }> {
  const { data, error } = await sb.from('analisis_libre')
    .select('id, id_deportista, titulo, vista, notas, fecha, actualizada_en, deportista!inner(nombre, solo_test, id_entrenador), analisis_libre_fotograma(count)')
    .eq('deportista.solo_test', true).eq('deportista.id_entrenador', idEntrenador)
    .order('fecha', { ascending: false }).order('id', { ascending: false })
  if (error) return { sueltos: [], error: error.message }
  type Fila = AnalisisLibre & { deportista: { nombre: string } | { nombre: string }[]; analisis_libre_fotograma: { count: number }[] }
  return {
    sueltos: ((data || []) as unknown as Fila[]).map(({ deportista, analisis_libre_fotograma, ...a }) => ({
      analisis: a,
      nombre: (Array.isArray(deportista) ? deportista[0]?.nombre : deportista?.nombre) || '',
      fotogramas: analisis_libre_fotograma?.[0]?.count ?? 0,
    })),
  }
}

/* ---------------------------------------------------------------
   Escribir
   --------------------------------------------------------------- */

export async function crearAnalisisLibre(sb: SupabaseClient, d: { idDeportista: number; titulo: string; vista: Vista }): Promise<{ analisis?: AnalisisLibre; error?: string }> {
  const titulo = d.titulo.trim().slice(0, LARGO_TITULO)
  if (!titulo) return { error: 'Ponle un nombre: qué vas a analizar.' }
  const { data, error } = await sb.from('analisis_libre')
    .insert({ id_deportista: d.idDeportista, titulo, vista: d.vista, fecha: hoyISO() })
    .select(CAMPOS_ANALISIS).single()
  if (error) return { error: error.message }
  return { analisis: data as AnalisisLibre }
}

/** Cambiar el nombre, desde dónde está grabado o las notas. Toca la fecha de cambio (el aviso al entrenador si lo cambia su director). */
export async function cambiarAnalisisLibre(sb: SupabaseClient, id: number, cambios: { titulo?: string; vista?: Vista; notas?: string | null }): Promise<{ error?: string }> {
  const fila: Record<string, unknown> = { actualizada_en: new Date().toISOString() }
  if (cambios.titulo !== undefined) {
    const t = cambios.titulo.trim().slice(0, LARGO_TITULO)
    if (!t) return { error: 'El nombre no puede quedar vacío.' }
    fila.titulo = t
  }
  if (cambios.vista !== undefined) fila.vista = cambios.vista
  if (cambios.notas !== undefined) fila.notas = cambios.notas?.trim() ? cambios.notas.slice(0, LARGO_NOTAS) : null
  const { error } = await sb.from('analisis_libre').update(fila).eq('id', id)
  return error ? { error: error.message } : {}
}

/** Dónde va la imagen de un fotograma: dentro de la carpeta de su análisis (lo exige la base). */
export const rutaImagenLibre = (idDep: number, idAnalisis: number, nombre: string) => `${idDep}/libre-${idAnalisis}/${nombre}.jpg`

/**
 * Guarda un fotograma. La imagen, si llega (con permiso), se sube primero; si
 * falla, el fotograma se guarda igual, sin ella, y se dice por qué.
 */
export async function guardarFotogramaLibre(sb: SupabaseClient, d: {
  analisis: AnalisisLibre; segundo: number | null; medidas: Medida[]; dibujo: Trazo[]; imagen: Blob | null
}): Promise<{ fotograma?: FotogramaLibre; sinImagen?: string; error?: string }> {
  let imagen: string | null = null
  let sinImagen: string | undefined
  if (d.imagen) {
    const ruta = rutaImagenLibre(d.analisis.id_deportista, d.analisis.id, crypto.randomUUID())
    const r = await subirFotograma(sb, ruta, d.imagen)
    if (r.error) sinImagen = 'la imagen no se ha subido (' + r.error + ')'
    else imagen = ruta
  }
  const { data, error } = await sb.from('analisis_libre_fotograma')
    .insert({
      id_analisis: d.analisis.id, id_deportista: d.analisis.id_deportista,
      segundo: d.segundo == null ? null : Math.round(d.segundo * 1000) / 1000,
      medidas: d.medidas, dibujo: d.dibujo, imagen,
    })
    .select('id, id_analisis, id_deportista, segundo, medidas, dibujo, imagen, created_at').single()
  if (error) {
    if (imagen) await sb.storage.from(ALMACEN).remove([imagen])
    return { error: error.message }
  }
  await sb.from('analisis_libre').update({ actualizada_en: new Date().toISOString() }).eq('id', d.analisis.id)
  return { fotograma: data as FotogramaLibre, sinImagen }
}

/** Borra un fotograma y su imagen. */
export async function borrarFotogramaLibre(sb: SupabaseClient, f: FotogramaLibre): Promise<{ error?: string }> {
  const { error } = await sb.from('analisis_libre_fotograma').delete().eq('id', f.id)
  if (error) return { error: error.message }
  if (f.imagen) await sb.storage.from(ALMACEN).remove([f.imagen])
  return {}
}

/** Borra un análisis entero (sus fotogramas van detrás en la base) y las imágenes que tenga. */
export async function borrarAnalisisLibre(sb: SupabaseClient, a: AnalisisLibre, fotogramas: FotogramaLibre[]): Promise<{ error?: string }> {
  const { error } = await sb.from('analisis_libre').delete().eq('id', a.id)
  if (error) return { error: error.message }
  const imagenes = fotogramas.filter(f => f.id_analisis === a.id && f.imagen).map(f => f.imagen as string)
  if (imagenes.length) await sb.storage.from(ALMACEN).remove(imagenes)
  return {}
}

/* ---------------------------------------------------------------
   Lo que se enseña de los fotogramas
   --------------------------------------------------------------- */

/** «a los 3,20 s», lo que apuntó el visor de ese fotograma; vacío si no lo apuntó. */
export function textoDeFotograma(f: Pick<FotogramaLibre, 'medidas'>): string {
  const m = (f.medidas ?? []).find(x => x?.nombre === NOMBRE_FOTOGRAMA)
  return typeof m?.valor === 'string' ? m.valor : ''
}

/** Las medidas de ESE momento: sin la del fotograma ni lo de todo el vídeo (eso va en las gráficas y en los recorridos). */
export function medidasDelMomento(f: Pick<FotogramaLibre, 'medidas'>): Medida[] {
  return (f.medidas ?? []).filter(m => m && m.nombre !== NOMBRE_FOTOGRAMA && !m.nombre.includes(' en el vídeo') && m.nombre !== 'Nota sugerida')
}

/** «1», «1 y 3», «1, 2 y 4». */
const numeros = (ns: number[]) => (ns.length < 2 ? String(ns[0] ?? '') : ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1])

/**
 * Lo recorrido en todo el vídeo («Rodilla en el vídeo (esqueleto) · de 70° a
 * 172°»), sin repetir: guardar tres fotogramas del mismo vídeo apunta tres veces
 * lo mismo. Con los fotogramas en que salió.
 */
export function recorridosDelAnalisis(fotogramas: Pick<FotogramaLibre, 'medidas'>[]): { nombre: string; valor: string; fotogramas: string }[] {
  const vistos = new Map<string, { nombre: string; valor: string; ns: number[] }>()
  fotogramas.forEach((f, i) => {
    for (const m of f.medidas ?? []) {
      if (!m?.nombre?.includes(' en el vídeo')) continue
      const k = m.nombre + '|' + m.valor
      const v = vistos.get(k)
      if (v) v.ns.push(i + 1)
      else vistos.set(k, { nombre: m.nombre, valor: m.valor, ns: [i + 1] })
    }
  })
  return [...vistos.values()].map(v => ({ nombre: v.nombre, valor: v.valor, fotogramas: numeros(v.ns) }))
}

/** La huella de una curva: dos fotogramas del mismo vídeo guardan la misma. */
const huella = (s: SerieGuardada) => [s.clave, s.lado, s.desde, s.fps, s.paso ?? 1, s.v.join(',')].join('|')

const esSerieValida = (s: unknown): s is SerieGuardada => {
  const x = s as SerieGuardada | null
  return !!x && (MEDIDAS_GRAFICA as unknown[]).includes(x.clave) && (x.lado === 'i' || x.lado === 'd')
    && Number.isFinite(x.desde) && x.fps > 0 && Array.isArray(x.v)
}

/**
 * Las gráficas que se pueden incluir en su informe: las curvas guardadas con
 * sus fotogramas, SIN REPETIR (los fotogramas del mismo vídeo traen la misma),
 * agrupadas por los fotogramas de los que salen. Es lo que pregunta el informe.
 */
export function graficasDelAnalisis(fotogramas: Pick<FotogramaLibre, 'medidas'>[]): GraficaDisponible[] {
  const porHuella = new Map<string, { s: SerieGuardada; ns: number[] }>()
  fotogramas.forEach((f, i) => {
    for (const m of f.medidas ?? []) {
      if (!esSerieValida(m?.serie)) continue
      const h = huella(m.serie)
      const v = porHuella.get(h)
      if (v) { if (!v.ns.includes(i + 1)) v.ns.push(i + 1) }
      else porHuella.set(h, { s: m.serie, ns: [i + 1] })
    }
  })
  const out: GraficaDisponible[] = []
  for (const [h, { s, ns }] of porHuella) {
    const clave = s.clave as ClaveGrafica
    const e = extremosDeSerie(s)
    if (!e || puntosDeSerie(s).filter(Boolean).length < MINIMO_PUNTOS) continue
    const grupo = 'fot:' + ns.join(',')
    out.push({
      id: h, prueba: grupo, nombrePrueba: (ns.length > 1 ? 'Fotogramas ' : 'Fotograma ') + numeros(ns), lado: 'unico',
      clave, nombre: NOMBRE_MEDIDA[clave], texto: 'de ' + grados(e.min.v) + ' a ' + grados(e.max.v),
      fiabilidad: fiabilidadDe(clave), min: e.min, max: e.max, serie: s,
    })
  }
  /* Por grupo (en el orden de los fotogramas) y, dentro, en el de las medidas. */
  const primero = (g: GraficaDisponible) => Number(g.prueba.slice(4).split(',')[0])
  return out.sort((a, b) => primero(a) - primero(b) || MEDIDAS_GRAFICA.indexOf(a.clave) - MEDIDAS_GRAFICA.indexOf(b.clave))
}

/** Las que salen marcadas al descargar desde el visor: las medidas que se estaban mirando. */
export function marcadasDeEntrada(graficas: GraficaDisponible[], mirando: (ClaveGrafica | null)[]): string[] {
  const claves = mirando.filter((c): c is ClaveGrafica => !!c)
  if (!claves.length) return []
  /* De cada medida mirada, la del último vídeo guardado (la última que aparece). */
  const out = new Map<ClaveGrafica, string>()
  for (const g of graficas) if (claves.includes(g.clave)) out.set(g.clave, g.id)
  return [...out.values()]
}
