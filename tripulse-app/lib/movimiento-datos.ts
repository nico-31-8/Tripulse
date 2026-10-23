// ============================================================
// Lo que se guarda de las baterías de movimiento
// ============================================================
//
// Las consultas del analizador de vídeo: valoraciones, pruebas, el permiso
// para guardar la imagen y los fotogramas. Las reglas para puntuar NO están
// aquí: viven en lib/baterias-movimiento. La base, en
// supabase/valoracion-movimiento.sql.
//
// EL VÍDEO NO SALE DEL DISPOSITIVO. Lo único que se sube es el fotograma
// anotado, y solo si el entrenador ha marcado el permiso del deportista: la base
// rechaza la imagen sin él, así que aquí se mira antes para no intentarlo.
//
// LAS PRUEBAS DE DOS VISTAS (22-10-2026). Seis pruebas se miran desde dos
// cámaras: cada fila guarda un fotograma por vista. La principal va en las
// columnas de siempre (vista, fotograma, medidas, dibujo) y la otra en
// segunda_vista, con si las dos son de la misma repetición
// (supabase/valoracion-movimiento-dos-vistas.sql). Lo junta fundirVistas.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hoyISO } from './fechas'
import type { Bateria, Lado, RegistroPrueba, Vista } from './baterias-movimiento'
import type { Punto } from './geometria-fotograma'

export interface Valoracion {
  id: number
  id_deportista: number
  bateria: Bateria
  fecha: string
  modo: 'video' | 'mano'
  notas: string | null
  actualizada_en: string
}

/** Lo dibujado sobre el fotograma, en píxeles del fotograma: para poder redibujarlo. */
export type TipoTrazo = 'linea' | 'angulo' | 'plomada' | 'horizontal' | 'palma' | 'distancia' | 'suelo'
export interface Trazo { tipo: TipoTrazo; puntos: Punto[] }

/**
 * La curva de una medida del esqueleto a lo largo del vídeo, para las gráficas
 * del informe (v3 del analizador, 17-10-2026): el vídeo no se guarda, así que
 * días después solo queda esto. Un valor por fotograma desde `desde` (o uno de
 * cada `paso`, en un vídeo muy largo), en grados a una décima; null donde la
 * medida no era fiable (punto dudoso o salto del detector). La arma
 * lib/informe-movimiento: aSerieGuardada.
 */
export interface SerieGuardada {
  /** La medida (lib/cuerpo: ClaveGrafica) y el lado del cuerpo. */
  clave: string
  lado: 'i' | 'd'
  desde: number
  fps: number
  v: (number | null)[]
  paso?: number
}

/**
 * Una medida tal como se enseña y se guarda: «Ángulo 1 · 52°». Las del
 * esqueleto «en el vídeo» llevan además su curva (`serie`); en la base va todo
 * en el mismo jsonb, y quien solo lee nombre y valor no nota la diferencia.
 */
export interface Medida { nombre: string; valor: string; serie?: SerieGuardada }

export interface FilaPrueba extends RegistroPrueba {
  id: number
  id_valoracion: number
  criterios: Record<string, boolean> | null
  /**
   * Lo que pesa: las medidas (con las curvas del esqueleto) y lo dibujado. NO
   * viene en las listas (cargarValoraciones carga todas sus valoraciones, y
   * ninguna pantalla lo lee); el informe pide las medidas aparte (cargarMedidas).
   */
  medidas?: Medida[] | null
  dibujo?: Trazo[] | null
  vista: Vista | null
  fotograma: string | null
  /**
   * En las pruebas de dos vistas, la otra: su vista, su imagen y si las dos son
   * de la misma repetición. Sin sus medidas ni lo dibujado, que pesan.
   */
  segunda_vista?: { vista: Vista; fotograma: string | null; misma_repeticion: boolean; medidas?: Medida[] | null } | null
}

/** Las imágenes guardadas de unas filas, de las dos vistas: para pedir sus enlaces. */
export const rutasDe = (filas: FilaPrueba[]): string[] =>
  filas.flatMap(f => [f.fotograma, f.segunda_vista?.fotograma]).filter((r): r is string => !!r)

/** Las imágenes de una fila para enseñarlas: la principal y, si la hay, la de la otra vista. */
export function fotogramasDeFila(f: FilaPrueba): { vista: Vista | null; ruta: string; medidas: Medida[] | null }[] {
  const out: { vista: Vista | null; ruta: string; medidas: Medida[] | null }[] = []
  if (f.fotograma) out.push({ vista: f.vista, ruta: f.fotograma, medidas: f.medidas ?? null })
  if (f.segunda_vista?.fotograma) out.push({ vista: f.segunda_vista.vista, ruta: f.segunda_vista.fotograma, medidas: f.segunda_vista.medidas ?? null })
  return out
}

export const ALMACEN = 'fotogramas'

/** Dónde vive el fotograma: la primera carpeta es el deportista (lo mira la base). */
export const rutaFotograma = (idDep: number, idVal: number, prueba: string, lado: Lado) =>
  `${idDep}/${idVal}/${prueba}-${lado}.jpg`

/** En las pruebas de dos vistas, cada vista tiene el suyo. */
export const rutaFotogramaVista = (idDep: number, idVal: number, prueba: string, lado: Lado, vista: Vista) =>
  `${idDep}/${idVal}/${prueba}-${lado}-${vista}.jpg`

/** El fotograma de una vista: la imagen (si se subió), sus medidas y lo dibujado. */
export interface FotoVista {
  vista: Vista
  fotograma: string | null
  medidas: Medida[] | null
  dibujo: Trazo[] | null
}

/** La otra vista de una prueba de dos (columna segunda_vista), y si las dos son de la misma repetición. */
export interface SegundaVista extends FotoVista { misma_repeticion: boolean }

/** Las vistas guardadas de una fila: la principal y, si la hay, la segunda. */
export function fotosDeFila(f: {
  vista: Vista | null; fotograma: string | null; medidas?: Medida[] | null; dibujo?: Trazo[] | null; segunda_vista?: SegundaVista | null
}): FotoVista[] {
  const out: FotoVista[] = []
  if (f.vista) out.push({ vista: f.vista, fotograma: f.fotograma ?? null, medidas: f.medidas ?? null, dibujo: f.dibujo ?? null })
  const s = f.segunda_vista
  if (s?.vista) out.push({ vista: s.vista, fotograma: s.fotograma ?? null, medidas: s.medidas ?? null, dibujo: s.dibujo ?? null })
  return out
}

/**
 * Junta lo que ya había de una prueba de dos vistas con lo que se guarda ahora.
 * Cada vista nueva pisa a la suya; la imagen, solo si trae una (sin permiso se
 * queda la de antes, como con una vista). La principal (las columnas de
 * siempre) es la primera vista de la prueba que tenga algo, y la otra va en
 * segunda_vista. Las dos son de la misma repetición solo si se guardan juntas
 * con los vídeos alineados. `sueltas`: imágenes de antes que se quedan sin fila.
 */
export function fundirVistas(antes: FotoVista[], nuevas: FotoVista[], orden: Vista[], alineadas: boolean): {
  principal: FotoVista | null; segunda: SegundaVista | null; sueltas: string[]
} {
  const m = new Map<Vista, FotoVista>()
  for (const f of antes) if (orden.includes(f.vista)) m.set(f.vista, f)
  for (const f of nuevas) m.set(f.vista, { ...f, fotograma: f.fotograma ?? m.get(f.vista)?.fotograma ?? null })
  const vp = orden.find(v => m.has(v))
  const principal = vp ? m.get(vp)! : null
  const vs = vp ? orden.find(v => v !== vp && m.has(v)) : undefined
  const juntas = alineadas && nuevas.length === 2 && nuevas[0].vista !== nuevas[1].vista
  const segunda: SegundaVista | null = vs ? { ...m.get(vs)!, misma_repeticion: juntas } : null
  const usadas = new Set([principal?.fotograma, segunda?.fotograma].filter(Boolean))
  const sueltas = [...new Set(antes.map(f => f.fotograma).filter((r): r is string => !!r && !usadas.has(r)))]
  return { principal, segunda, sueltas }
}

/** De la segunda vista, en las listas, solo lo que se enseña: sus medidas y lo dibujado pesan. */
const SEGUNDA_EN_LISTA = 'sv_vista:segunda_vista->>vista, sv_fotograma:segunda_vista->>fotograma, sv_misma:segunda_vista->misma_repeticion'
type FilaConSegunda = Omit<FilaPrueba, 'segunda_vista'> & { sv_vista: Vista | null; sv_fotograma: string | null; sv_misma: boolean | null }

export async function cargarValoraciones(sb: any, idDep: number): Promise<{ valoraciones: Valoracion[]; pruebas: FilaPrueba[]; error?: string }> {
  const [v, p] = await Promise.all([
    sb.from('valoracion_movimiento').select('id, id_deportista, bateria, fecha, modo, notas, actualizada_en')
      .eq('id_deportista', idDep).order('fecha', { ascending: false }).order('id', { ascending: false }),
    sb.from('valoracion_prueba').select('id, id_valoracion, prueba, lado, nota, dolor, criterios, vista, fotograma, ' + SEGUNDA_EN_LISTA)
      .eq('id_deportista', idDep),
  ])
  const error = v.error?.message || p.error?.message
  const pruebas: FilaPrueba[] = ((p.data || []) as FilaConSegunda[]).map(({ sv_vista, sv_fotograma, sv_misma, ...f }) => ({
    ...f, segunda_vista: sv_vista ? { vista: sv_vista, fotograma: sv_fotograma, misma_repeticion: sv_misma === true } : null,
  }))
  return { valoraciones: (v.data || []) as Valoracion[], pruebas, error }
}

/**
 * Las medidas de cada prueba de UNA valoración, por el id de su fila: para el
 * informe, que dibuja sus curvas. `segundas`: las de la otra vista, en las
 * pruebas de dos (de qué momento es su fotograma, lo medido en él).
 */
export async function cargarMedidas(sb: SupabaseClient, idValoracion: number): Promise<{
  medidas: Record<number, Medida[]>; segundas: Record<number, Medida[]>; error?: string
}> {
  const { data, error } = await sb.from('valoracion_prueba').select('id, medidas, segunda_medidas:segunda_vista->medidas').eq('id_valoracion', idValoracion)
  if (error) return { medidas: {}, segundas: {}, error: error.message }
  const medidas: Record<number, Medida[]> = {}
  const segundas: Record<number, Medida[]> = {}
  for (const f of (data || []) as { id: number; medidas: Medida[] | null; segunda_medidas: Medida[] | null }[]) {
    if (Array.isArray(f.medidas)) medidas[f.id] = f.medidas
    if (Array.isArray(f.segunda_medidas)) segundas[f.id] = f.segunda_medidas
  }
  return { medidas, segundas }
}

export async function crearValoracion(sb: any, idDep: number, bateria: Bateria, modo: 'video' | 'mano'): Promise<{ valoracion?: Valoracion; error?: string }> {
  const { data, error } = await sb.from('valoracion_movimiento')
    .insert({ id_deportista: idDep, bateria, modo, fecha: hoyISO() })
    .select('id, id_deportista, bateria, fecha, modo, notas, actualizada_en').single()
  if (error) return { error: error.message }
  return { valoracion: data as Valoracion }
}

export interface PruebaAGuardar {
  idValoracion: number
  idDeportista: number
  prueba: string
  lado: Lado
  nota: number | null
  dolor: boolean
  criterios?: Record<string, boolean> | null
  medidas?: Medida[] | null
  dibujo?: Trazo[] | null
  vista?: Vista | null
  fotograma?: string | null
  /** En las pruebas de dos vistas: la otra (null la quita). */
  segundaVista?: SegundaVista | null
}

/**
 * Guarda una prueba (un lado) y toca su valoración.
 *
 * Tocar la valoración es lo que avisa al director UNA vez por batería: el aviso
 * cuelga de esa tabla y no de esta, que tiene una fila por lado de cada prueba.
 */
export async function guardarPrueba(sb: any, p: PruebaAGuardar): Promise<{ error?: string }> {
  const fila: Record<string, unknown> = {
    id_valoracion: p.idValoracion, id_deportista: p.idDeportista, prueba: p.prueba, lado: p.lado,
    nota: p.dolor ? 0 : p.nota, dolor: p.dolor,
  }
  /* Solo lo que llega: guardar la nota desde la lista no borra el fotograma ni
     lo dibujado que se guardó desde el visor. */
  if (p.criterios !== undefined) fila.criterios = p.criterios
  if (p.medidas !== undefined) fila.medidas = p.medidas
  if (p.dibujo !== undefined) fila.dibujo = p.dibujo
  if (p.vista !== undefined) fila.vista = p.vista
  if (p.fotograma !== undefined) fila.fotograma = p.fotograma
  if (p.segundaVista !== undefined) fila.segunda_vista = p.segundaVista
  const { error } = await sb.from('valoracion_prueba').upsert(fila, { onConflict: 'id_valoracion,prueba,lado' })
  if (error) return { error: error.message }
  await sb.from('valoracion_movimiento').update({ actualizada_en: new Date().toISOString() }).eq('id', p.idValoracion)
  return {}
}

export interface PruebaDosVistasAGuardar {
  idValoracion: number
  idDeportista: number
  prueba: string
  lado: Lado
  nota: number | null
  dolor: boolean
  criterios: Record<string, boolean> | null
  /** Las vistas de la prueba, en su orden: la primera es la principal. */
  orden: Vista[]
  /** Los fotogramas de esta vez: uno por vista con vídeo. */
  fotos: FotoVista[]
  /** Si los dos vídeos estaban alineados: entonces los dos fotogramas son de la misma repetición. */
  alineadas: boolean
}

/**
 * Guarda una prueba de dos vistas: lee lo que ya tenía la fila, lo junta con lo
 * de ahora (fundirVistas) y guarda las dos. Sin fotogramas (sin vídeo), solo la
 * nota y los criterios, como siempre. Las imágenes que se quedan sin fila se
 * borran del almacén.
 */
export async function guardarPruebaDosVistas(sb: SupabaseClient, p: PruebaDosVistasAGuardar): Promise<{ error?: string }> {
  const base: PruebaAGuardar = {
    idValoracion: p.idValoracion, idDeportista: p.idDeportista, prueba: p.prueba, lado: p.lado,
    nota: p.nota, dolor: p.dolor, criterios: p.criterios,
  }
  if (!p.fotos.length) return guardarPrueba(sb, base)
  const { data, error } = await sb.from('valoracion_prueba').select('vista, fotograma, medidas, dibujo, segunda_vista')
    .eq('id_valoracion', p.idValoracion).eq('prueba', p.prueba).eq('lado', p.lado).maybeSingle()
  if (error) return { error: error.message }
  const { principal, segunda, sueltas } = fundirVistas(data ? fotosDeFila(data) : [], p.fotos, p.orden, p.alineadas)
  const r = await guardarPrueba(sb, {
    ...base,
    vista: principal?.vista ?? null, fotograma: principal?.fotograma ?? null,
    medidas: principal?.medidas ?? null, dibujo: principal?.dibujo ?? null, segundaVista: segunda,
  })
  if (!r.error && sueltas.length) await sb.storage.from(ALMACEN).remove(sueltas)
  return r
}

/** Quitar lo puntuado de un lado (para volver a dejarlo pendiente). */
export async function borrarPrueba(sb: any, idValoracion: number, prueba: string, lado: Lado): Promise<{ error?: string }> {
  const { error } = await sb.from('valoracion_prueba').delete()
    .eq('id_valoracion', idValoracion).eq('prueba', prueba).eq('lado', lado)
  return error ? { error: error.message } : {}
}

export async function subirFotograma(sb: any, ruta: string, imagen: Blob): Promise<{ error?: string }> {
  const { error } = await sb.storage.from(ALMACEN).upload(ruta, imagen, { upsert: true, contentType: 'image/jpeg' })
  return error ? { error: error.message } : {}
}

/** Enlaces temporales (una hora) para enseñar los fotogramas: el almacén es privado. */
export async function urlsFotogramas(sb: any, rutas: string[]): Promise<Record<string, string>> {
  const unicas = [...new Set(rutas.filter(Boolean))]
  if (!unicas.length) return {}
  const { data } = await sb.storage.from(ALMACEN).createSignedUrls(unicas, 3600)
  const out: Record<string, string> = {}
  for (const d of (data || []) as { path: string | null; signedUrl: string | null }[]) {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  }
  return out
}

/** El permiso para guardar su imagen: lo marca (o lo quita) el entrenador. */
export async function marcarPermiso(sb: any, idDep: number, si: boolean, quien: string | null): Promise<{ error?: string }> {
  const { error } = await sb.from('deportista').update({
    permiso_fotogramas_en: si ? new Date().toISOString() : null,
    permiso_fotogramas_por: si ? quien : null,
  }).eq('id', idDep)
  return error ? { error: error.message } : {}
}
