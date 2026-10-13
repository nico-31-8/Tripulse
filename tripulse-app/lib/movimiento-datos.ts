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

/** Una medida tal como se enseña y se guarda: «Ángulo 1 · 52°». */
export interface Medida { nombre: string; valor: string }

export interface FilaPrueba extends RegistroPrueba {
  id: number
  id_valoracion: number
  criterios: Record<string, boolean> | null
  medidas: Medida[] | null
  dibujo: Trazo[] | null
  vista: Vista | null
  fotograma: string | null
}

export const ALMACEN = 'fotogramas'

/** Dónde vive el fotograma: la primera carpeta es el deportista (lo mira la base). */
export const rutaFotograma = (idDep: number, idVal: number, prueba: string, lado: Lado) =>
  `${idDep}/${idVal}/${prueba}-${lado}.jpg`

export async function cargarValoraciones(sb: any, idDep: number): Promise<{ valoraciones: Valoracion[]; pruebas: FilaPrueba[]; error?: string }> {
  const [v, p] = await Promise.all([
    sb.from('valoracion_movimiento').select('id, id_deportista, bateria, fecha, modo, notas, actualizada_en')
      .eq('id_deportista', idDep).order('fecha', { ascending: false }).order('id', { ascending: false }),
    sb.from('valoracion_prueba').select('id, id_valoracion, prueba, lado, nota, dolor, criterios, medidas, dibujo, vista, fotograma')
      .eq('id_deportista', idDep),
  ])
  const error = v.error?.message || p.error?.message
  return { valoraciones: (v.data || []) as Valoracion[], pruebas: (p.data || []) as FilaPrueba[], error }
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
  const { error } = await sb.from('valoracion_prueba').upsert(fila, { onConflict: 'id_valoracion,prueba,lado' })
  if (error) return { error: error.message }
  await sb.from('valoracion_movimiento').update({ actualizada_en: new Date().toISOString() }).eq('id', p.idValoracion)
  return {}
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
