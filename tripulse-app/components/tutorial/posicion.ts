// ============================================================
// Dónde está lo que brilla y dónde va el pop-up
// ============================================================
// Lo comparten el recorrido (Recorrido.tsx) y los consejos (Consejo.tsx). Se
// llama en cada fotograma, fuera de React.

export const HOJA_PX = 640

/** El elemento de un ancla, si está a la vista de verdad (no escondido ni fuera por un lado). */
export function buscarAncla(ancla: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>('[data-guia="' + ancla.replace(/"/g, '') + '"]')
  for (const el of Array.from(els)) {
    if (!el.getClientRects().length) continue
    if (getComputedStyle(el).visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    /* Un contenedor vacío (lo que pinta un componente cuando no tiene nada) no se enseña. */
    if (r.width < 2 || r.height < 2) continue
    if (r.right <= 0 || r.left >= window.innerWidth) continue
    return el
  }
  return null
}

export interface Objetivo { rect: DOMRect; radio: number }

/**
 * Lo que se ve de un elemento: su caja recortada por los contenedores con
 * scroll que lo envuelven. Una semana del lienzo que queda fuera de su franja
 * está en la página, pero no a la vista.
 */
function cajaVisible(el: HTMLElement): DOMRect | null {
  if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return null
  const r = el.getBoundingClientRect()
  let l = r.left, t = r.top, de = r.right, ab = r.bottom
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
    const c = p.getBoundingClientRect()
    if (cs.overflowX !== 'visible') { l = Math.max(l, c.left); de = Math.min(de, c.right) }
    if (cs.overflowY !== 'visible') { t = Math.max(t, c.top); ab = Math.min(ab, c.bottom) }
  }
  l = Math.max(l, 0); de = Math.min(de, window.innerWidth)
  if (de - l < 2 || ab - t < 2) return null
  return new DOMRect(l, t, de - l, ab - t)
}

/**
 * Lo que brilla en un consejo: la primera de sus anclas que esté a la vista.
 * Las de un elemento concreto (`data-consejo`, con «:») pueden ser varias
 * piezas —los siete días de una semana— y brilla la caja que las junta.
 */
export function objetivoDeConsejo(anclas: string[]): Objetivo | null {
  for (const a of anclas) {
    if (!a.includes(':')) {
      const el = buscarAncla(a)
      const r = el && cajaVisible(el)
      if (el && r) return { rect: r, radio: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8 }
      continue
    }
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-consejo="' + a.replace(/"/g, '') + '"]'))
    const cajas = els.map(cajaVisible).filter((r): r is DOMRect => !!r)
    if (!cajas.length) continue
    const l = Math.min(...cajas.map(r => r.left)), t = Math.min(...cajas.map(r => r.top))
    const de = Math.max(...cajas.map(r => r.right)), ab = Math.max(...cajas.map(r => r.bottom))
    return { rect: new DOMRect(l, t, de - l, ab - t), radio: els.length === 1 ? parseFloat(getComputedStyle(els[0]).borderTopLeftRadius) || 8 : 12 }
  }
  return null
}

/** El elemento de un ancla de consejo (el primero a la vista), para pulsarlo o llevar la vista hasta él. */
export function elementoDeConsejo(ancla: string): HTMLElement | null {
  if (!ancla.includes(':')) return buscarAncla(ancla)
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-consejo="' + ancla.replace(/"/g, '') + '"]'))
  return els.find(el => !!cajaVisible(el)) ?? els[0] ?? null
}

/**
 * ¿Hay una ventana de la página abierta? Las de la app son capas
 * `fixed inset-0`; el consejo no sale encima de ninguna.
 */
export function hayVentanaAbierta(): boolean {
  const capas = document.querySelectorAll<HTMLElement>('.fixed.inset-0, dialog[open], [aria-modal="true"]')
  for (const el of Array.from(capas)) {
    if (el.closest('[data-tutorial]')) continue
    if (!el.getClientRects().length) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    return true
  }
  return false
}

export function colocar(
  objetivo: HTMLElement | Objetivo | null,
  foco: HTMLDivElement | null, globo: HTMLDivElement | null, flecha: HTMLSpanElement | null,
) {
  if (!globo) return
  let r: DOMRect | null = null
  if (objetivo && foco) {
    const esEl = objetivo instanceof HTMLElement
    r = esEl ? objetivo.getBoundingClientRect() : objetivo.rect
    const pad = 6
    const rad = esEl ? parseFloat(getComputedStyle(objetivo).borderTopLeftRadius) || 8 : objetivo.radio
    foco.style.left = (r.left - pad) + 'px'
    foco.style.top = (r.top - pad) + 'px'
    foco.style.width = (r.width + pad * 2) + 'px'
    foco.style.height = (r.height + pad * 2) + 'px'
    foco.style.borderRadius = Math.min(rad + pad, 28) + 'px'
  }
  const W = window.innerWidth, H = window.innerHeight
  if (W < HOJA_PX) {
    /* Móvil: hoja abajo, de lado a lado. */
    globo.style.left = '0px'
    globo.style.right = '0px'
    globo.style.top = 'auto'
    globo.style.bottom = '0px'
    globo.style.width = 'auto'
    globo.style.borderRadius = '20px 20px 0 0'
    globo.style.paddingBottom = 'calc(18px + env(safe-area-inset-bottom, 0px))'
    if (flecha) flecha.style.display = 'none'
    return
  }
  globo.style.right = 'auto'
  globo.style.bottom = 'auto'
  globo.style.borderRadius = '16px'
  globo.style.paddingBottom = ''
  globo.style.width = r ? 'min(360px, calc(100vw - 24px))' : 'min(440px, calc(100vw - 24px))'
  const gw = globo.offsetWidth, gh = globo.offsetHeight, m = 14
  if (!r) {
    globo.style.left = Math.max(12, (W - gw) / 2) + 'px'
    globo.style.top = Math.max(16, (H - gh) / 2) + 'px'
    if (flecha) flecha.style.display = 'none'
    return
  }
  /* Si lo que brilla queda por encima o por debajo de la pantalla, el pop-up se
     queda en ese borde con la flecha apuntando hacia allí. */
  const cabeAbajo = H - r.bottom - m - 8 >= gh
  const cabeArriba = r.top - m - 8 >= gh
  const abajo = cabeAbajo || (!cabeArriba && H - r.bottom > r.top)
  let top = abajo ? r.bottom + m : r.top - m - gh
  top = Math.min(Math.max(8, top), H - gh - 8)
  const left = Math.min(Math.max(12, r.left + r.width / 2 - gw / 2), W - gw - 12)
  globo.style.left = left + 'px'
  globo.style.top = top + 'px'
  if (flecha) {
    const fx = Math.min(Math.max(20, r.left + r.width / 2 - left), gw - 20)
    flecha.style.display = 'block'
    flecha.style.left = (fx - 7) + 'px'
    flecha.style.top = abajo ? '-8px' : 'auto'
    flecha.style.bottom = abajo ? 'auto' : '-8px'
    flecha.style.transform = abajo ? 'rotate(45deg)' : 'rotate(225deg)'
  }
}

/** Que el elemento se vea, y en el móvil que quede por encima de la hoja. */
export function asomar(el: HTMLElement, globo: HTMLDivElement | null) {
  if (getComputedStyle(el).position === 'fixed' || el.closest('[data-guia-fijo]')) return
  const r = el.getBoundingClientRect(), H = window.innerHeight
  const hoja = window.innerWidth < HOJA_PX
  const reserva = hoja ? Math.min(globo?.offsetHeight || 260, H * 0.5) + 24 : 24
  if (r.top >= 70 && r.bottom <= H - reserva) return
  const destino = hoja ? H * 0.26 : H * 0.38
  const centro = r.top + Math.min(r.height, H * 0.5) / 2
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollBy({ top: centro - destino, behavior: quieto ? 'auto' : 'smooth' })
}
