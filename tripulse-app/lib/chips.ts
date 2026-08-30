// Chips de zona del canvas de periodización.
//
// Se dibujan en /planificacion-visual/[id]/dibujo (se guardan como jsonb en
// `dibujo_borrador.sesiones_zonas`) y se arrastran a un día en
// /planificacion-visual/[id]/semana/[fecha], donde se materializan como sesiones.
// El tipo vivía duplicado en las dos páginas; aquí es donde manda.
import type { BrickValor } from './bricks'

export interface ChipZona {
  id: string
  semana: number
  disciplina: string
  zona: string
  hecho?: boolean
  grupo?: string
  // Qué sesión se creó con este chip. Se pone al arrastrarlo a un día y es lo
  // único que permite deshacerlo después: sin esto, devolver una sesión al pool
  // sería adivinar qué chips la formaron. Ver lib/devolver-al-pool.ts.
  id_sesion?: number
  // Solo en chips de brick (disciplina === 'Brick'): un brick no cabe en un par
  // zona+deporte, así que el chip se lleva sus bloques y transiciones encima.
  brick?: BrickValor
}
