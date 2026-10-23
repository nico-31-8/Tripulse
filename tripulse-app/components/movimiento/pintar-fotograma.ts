// ============================================================
// Pintar sobre el fotograma: lo dibujado a mano y el esqueleto
// ============================================================
//
// Lo usan el lienzo del visor, la lupa y la imagen que se guarda, en
// coordenadas del fotograma. Salió del visor (Analizador) el 22-10-2026, al
// separar lo de cada vídeo para poder tener dos.

import { CRUCES, HUESOS, indice, otroLado, PARTES, type Cuerpo, type LadoCuerpo } from '@/lib/cuerpo'
import { etiquetaDe, inclinacionSuelo } from '@/lib/trazos-fotograma'
import { inclinacionDe, type Punto } from '@/lib/geometria-fotograma'
import type { Vista } from '@/lib/baterias-movimiento'
import type { Trazo } from '@/lib/movimiento-datos'

export const NARANJA = '#f97316'
export const REF = '#8ecbff'
export const ROJO = '#f2545b'
export const BLANCO = '#f3f6f9'
export const AMBAR = '#f0b429'

/**
 * Pinta los trazos en coordenadas del fotograma. Lo usan el lienzo, la lupa y la
 * imagen que se guarda. `escala`: el zoom del visor, para que con zoom las
 * líneas y las letras no engorden.
 */
export function pintarTrazos(ctx: CanvasRenderingContext2D, trazos: Trazo[], enCurso: Trazo | null, W: number, H: number, perdidos: Punto[] = [], escala = 1) {
  const lw = Math.max(2, Math.round(Math.max(W, H) / 420)) / escala
  const fs = Math.max(13, Math.round(Math.max(W, H) / 52)) / escala
  const todos = enCurso ? [...trazos, enCurso] : trazos
  /* La plomada y la horizontal van con el suelo, si se ha marcado: (ux, uy) es su dirección. */
  const incl = inclinacionSuelo(trazos)
  const ux = Math.cos(incl), uy = Math.sin(incl)
  const largo = W + H
  for (const t of todos) {
    const esRef = t.tipo === 'plomada' || t.tipo === 'horizontal' || t.tipo === 'palma' || t.tipo === 'suelo'
    const color = esRef ? REF : NARANJA
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.setLineDash(t.tipo === 'plomada' || t.tipo === 'horizontal' ? [lw * 4, lw * 3] : [])
    const p = t.puntos
    ctx.beginPath()
    if (t.tipo === 'plomada' && p[0]) { ctx.moveTo(p[0].x + uy * largo, p[0].y - ux * largo); ctx.lineTo(p[0].x - uy * largo, p[0].y + ux * largo) }
    else if (t.tipo === 'horizontal' && p[0]) { ctx.moveTo(p[0].x - ux * largo, p[0].y - uy * largo); ctx.lineTo(p[0].x + ux * largo, p[0].y + uy * largo) }
    else if (t.tipo === 'suelo' && p.length === 2) {
      /* El suelo, de lado a lado de la imagen (también mientras se marca). */
      const s = inclinacionDe(p[0], p[1]), sx = Math.cos(s), sy = Math.sin(s)
      ctx.moveTo(p[0].x - sx * largo, p[0].y - sy * largo); ctx.lineTo(p[0].x + sx * largo, p[0].y + sy * largo)
    } else if (t.tipo === 'angulo' && p.length === 3) {
      ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.lineTo(p[2].x, p[2].y)
    } else if (p.length >= 2) { ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y) }
    ctx.stroke()
    ctx.setLineDash([])
    /* El arco del ángulo, por el lado corto. */
    if (t.tipo === 'angulo' && p.length === 3) {
      const a0 = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x)
      let d = Math.atan2(p[2].y - p[1].y, p[2].x - p[1].x) - a0
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      ctx.beginPath()
      ctx.arc(p[1].x, p[1].y, lw * 14, a0, a0 + d, d < 0)
      ctx.stroke()
    }
    for (const q of p) { ctx.beginPath(); ctx.arc(q.x, q.y, lw * 2.4, 0, 2 * Math.PI); ctx.fill() }
    const et = etiquetaDe(t, trazos)
    if (et) {
      const ancla = t.tipo === 'angulo' ? p[1] : t.tipo === 'plomada' || t.tipo === 'horizontal' ? p[0]
        : { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }
      ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`
      const ancho = ctx.measureText(et).width + fs * 0.8
      const x = Math.min(Math.max(ancla.x + lw * 6, 2), W - ancho - 2)
      const y = Math.min(Math.max(ancla.y - fs * 1.6, 2), H - fs * 1.5)
      ctx.fillStyle = 'rgba(0,0,0,.72)'
      ctx.fillRect(x, y, ancho, fs * 1.45)
      ctx.fillStyle = color
      ctx.fillText(et, x + fs * 0.4, y + fs * 1.08)
    }
  }
  /* Los que el seguimiento ha perdido: un aro rojo para que se vea cuál arrastrar. */
  ctx.strokeStyle = ROJO
  ctx.lineWidth = lw
  for (const q of perdidos) { ctx.beginPath(); ctx.arc(q.x, q.y, lw * 7, 0, 2 * Math.PI); ctx.stroke() }
}

/**
 * Pinta el esqueleto. De perfil, el lado medido en blanco y el otro apagado
 * detrás; desde las otras vistas, los dos en blanco. Lo que el modelo adivina,
 * en ámbar, y el primero con su «dudoso · arrástralo». `rodilla`: el ángulo
 * que se escribe junto a la rodilla medida.
 */
export function pintarCuerpo(
  ctx: CanvasRenderingContext2D, c: Cuerpo, medido: LadoCuerpo, vista: Vista, dudososIdx: number[], W: number, H: number,
  rodilla: { texto: string; dudosa: boolean } | null,
  escala = 1,
) {
  const lw = Math.max(2, Math.round(Math.max(W, H) / 420)) / escala
  const fs = Math.max(13, Math.round(Math.max(W, H) / 52)) / escala
  const dePerfil = vista === 'perfil'
  const linea = (a?: Punto, b?: Punto) => {
    if (!a || !b) return
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  }
  const caja = (texto: string, x: number, y: number, color: string) => {
    ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`
    const ancho = ctx.measureText(texto).width + fs * 0.8
    const bx = Math.min(Math.max(x, 2), W - ancho - 2), by = Math.min(Math.max(y, 2), H - fs * 1.5)
    ctx.fillStyle = 'rgba(0,0,0,.72)'
    ctx.fillRect(bx, by, ancho, fs * 1.45)
    ctx.fillStyle = color
    ctx.fillText(texto, bx + fs * 0.4, by + fs * 1.08)
  }
  ctx.lineCap = 'round'
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(243,246,249,.4)'
  ctx.lineWidth = lw * 0.8
  for (const p of CRUCES) linea(c[indice(p, 'i')], c[indice(p, 'd')])
  /* Primero el lado de atrás, para que el medido quede encima. */
  const lados: LadoCuerpo[] = dePerfil ? [otroLado(medido), medido] : ['i', 'd']
  for (const l of lados) {
    const principal = !dePerfil || l === medido
    ctx.strokeStyle = principal ? BLANCO : 'rgba(156,163,175,.6)'
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = principal ? lw * 1.1 : lw * 0.8
    for (const [a, b] of HUESOS) linea(c[indice(a, l)], c[indice(b, l)])
    for (const p of PARTES) {
      const q = c[indice(p, l)]
      if (q) { ctx.beginPath(); ctx.arc(q.x, q.y, principal ? lw * 2.2 : lw * 1.6, 0, 2 * Math.PI); ctx.fill() }
    }
  }
  if (rodilla && dePerfil) {
    const k = c[indice('rodilla', medido)]
    if (k) caja(rodilla.texto, k.x + lw * 6, k.y - fs * 1.6, rodilla.dudosa ? AMBAR : BLANCO)
  }
  ctx.strokeStyle = AMBAR
  ctx.fillStyle = AMBAR
  ctx.lineWidth = lw
  dudososIdx.forEach((i, n) => {
    const q = c[i]
    if (!q) return
    ctx.beginPath(); ctx.arc(q.x, q.y, lw * 6, 0, 2 * Math.PI); ctx.stroke()
    ctx.beginPath(); ctx.arc(q.x, q.y, lw * 1.6, 0, 2 * Math.PI); ctx.fill()
    if (n === 0) caja('dudoso · arrástralo', q.x + lw * 8, q.y + lw * 2, AMBAR)
  })
}
