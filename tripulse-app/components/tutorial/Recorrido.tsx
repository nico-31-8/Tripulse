'use client'
// ============================================================
// El recorrido: el foco con aura y el pop-up que va paso a paso
// ============================================================
// Lo monta TutorialProvider con los pasos de una zona (lib/tutorial). Aquí solo
// se pinta y se avanza:
// - Cada paso busca su elemento por `data-guia`. Si tarda en aparecer (la
//   pantalla aún carga) lo espera un poco; si no llega, el paso se salta.
// - El foco oscurece todo menos ese elemento, y el aura late alrededor. Con
//   «reducir movimiento» no late: se queda fija.
// - Un paso de ACCIÓN deja tocar la pantalla, pero solo lo que brilla: lo
//   demás no responde mientras tanto. «Hazlo por mí» lo pulsa por él.
// - En el móvil el pop-up sale abajo, como una hoja.
// Las posiciones se recalculan en cada fotograma: así siguen al elemento si la
// página se mueve, carga algo o se abre un menú.

import { useCallback, useEffect, useRef, useState } from 'react'
import { CAMINO, siguienteParada, rellenar, type PasoTutorial, type ZonaTutorial, ZONAS } from '@/lib/tutorial'

/** 'sigue' = pulsó lo que lleva a la siguiente parada; 'salida' = «Lo sigo otro día». */
export type FinDelRecorrido = 'visto' | 'sigue' | 'saltado' | 'pausa' | 'salida'

const ESPERA_PRIMERO_MS = 3000
const ESPERA_TRAS_ACCION_MS = 2500
const ESPERA_MS = 1200

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

export default function Recorrido({ zona, pasos, numInfo, nombre, onFin, onModal }: {
  zona: ZonaTutorial
  pasos: PasoTutorial[]
  /** Cuántos pasos son de la propia zona; los demás son la salida a la siguiente parada. */
  numInfo: number
  nombre: string
  onFin: (r: FinDelRecorrido) => void
  /** true mientras el paso tapa la app; false en un paso de acción, que deja tocarla. */
  onModal: (modal: boolean) => void
}) {
  const [i, setI] = useState(0)
  /* El paso ya resuelto: su elemento, y el primero que se enseñó (ahí va el vídeo).
     Mientras se busca el siguiente, el elemento sigue siendo el anterior: así el
     foco se queda donde estaba y luego se desliza. */
  const [res, setRes] = useState<{ i: number; el: HTMLElement | null; primero: number } | null>(null)
  const [visibleDe, setVisibleDe] = useState(-1)
  const listo = res?.i === i
  const el = res?.el ?? null
  const primeroMostrado = res?.primero ?? null
  const visible = listo && visibleDe === i
  const dir = useRef(1)
  const vieneDeAccion = useRef(false)
  const inicio = useRef(true)
  const terminado = useRef(false)
  const focoRef = useRef<HTMLDivElement>(null)
  const globoRef = useRef<HTMLDivElement>(null)
  const flechaRef = useRef<HTMLSpanElement>(null)
  const priRef = useRef<HTMLButtonElement>(null)
  const elPrevio = useRef<HTMLElement | null>(null)

  const paso = pasos[i]
  const enSalida = i >= numInfo
  const quieto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* Las funciones del proveedor por referencia: si cambian, los efectos no se reinician a mitad de un paso. */
  const onFinRef = useRef(onFin)
  const onModalRef = useRef(onModal)
  useEffect(() => { onFinRef.current = onFin; onModalRef.current = onModal })

  const fin = useCallback((r: FinDelRecorrido) => {
    if (terminado.current) return
    terminado.current = true
    onFinRef.current(r)
  }, [])

  /* Busca el elemento del paso; si no aparece a tiempo, el paso se salta. */
  useEffect(() => {
    let vivo = true
    const p = pasos[i]
    if (!p) return
    const espera = inicio.current ? ESPERA_PRIMERO_MS : vieneDeAccion.current ? ESPERA_TRAS_ACCION_MS : ESPERA_MS
    const t0 = Date.now()
    let t: ReturnType<typeof setTimeout>
    const resolver = (e: HTMLElement | null) => {
      inicio.current = false; vieneDeAccion.current = false
      setRes(prev => ({ i, el: e, primero: prev?.primero ?? i }))
    }
    const buscar = () => {
      if (!vivo) return
      if (!p.ancla) { resolver(null); return }
      const e = buscarAncla(p.ancla)
      if (e) { resolver(e); return }
      if (Date.now() - t0 > espera) {
        const sig = i + dir.current
        if (sig >= 0 && sig < pasos.length) setI(sig)
        else if (dir.current > 0) fin('visto')
        else { dir.current = 1; setI(Math.min(i + 1, pasos.length - 1)) }
        return
      }
      t = setTimeout(buscar, 100)
    }
    t = setTimeout(buscar, 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [i, pasos, fin])

  /* Al estar listo: que se vea el elemento, que entre el pop-up y el foco en el botón principal. */
  useEffect(() => {
    if (!listo) return
    if (el) asomar(el, globoRef.current)
    const r = requestAnimationFrame(() => setVisibleDe(i))
    priRef.current?.focus({ preventScroll: true })
    return () => cancelAnimationFrame(r)
  }, [listo, i, el])

  /* Coloca el foco y el pop-up en cada fotograma. */
  useEffect(() => {
    if (!listo) return
    let raf = 0
    const foco = focoRef.current
    if (foco && el && elPrevio.current && !quieto) {
      foco.classList.add('anima')
      setTimeout(() => foco.classList.remove('anima'), 420)
    }
    elPrevio.current = el
    /* Una vez ya, sin esperar al primer fotograma: si la pestaña no está pintando,
       los fotogramas no llegan y el pop-up se quedaría donde cayó. */
    colocar(el, focoRef.current, globoRef.current, flechaRef.current)
    const tick = () => {
      colocar(el, focoRef.current, globoRef.current, flechaRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [listo, el, quieto])

  /* La app se puede tocar solo en un paso de acción. */
  useEffect(() => { onModalRef.current(!paso?.accion) }, [paso])
  useEffect(() => () => onModalRef.current(false), [])

  const avanzar = useCallback(() => {
    dir.current = 1
    if (i < pasos.length - 1) setI(i + 1)
    else fin('visto')
  }, [i, pasos.length, fin])

  const atras = useCallback(() => {
    if (i === 0) return
    dir.current = -1
    setI(i - 1)
  }, [i])

  const saltar = useCallback(() => {
    if (zona === 'bienvenida' && i === 0) fin('pausa')
    else fin(enSalida ? 'salida' : 'saltado')
  }, [zona, i, enSalida, fin])

  /* Paso de acción: solo responde lo que brilla (y el pop-up). */
  useEffect(() => {
    if (!listo || !paso?.accion || !el) return
    const dentroDe = (n: Element | null | undefined, t: EventTarget | null) => !!n && t instanceof Node && n.contains(t)
    const filtro = (e: Event) => {
      if (dentroDe(globoRef.current, e.target)) return
      if (dentroDe(el, e.target)) {
        if (e.type === 'click') {
          vieneDeAccion.current = true
          /* Si cambia de pantalla, se cierra ya: el clic sigue su camino y navega. */
          if (paso.sale) fin('sigue')
          else setTimeout(avanzar, 0)
        }
        return
      }
      e.preventDefault()
      e.stopPropagation()
    }
    const tipos = ['pointerdown', 'mousedown', 'click'] as const
    tipos.forEach(t => document.addEventListener(t, filtro, true))
    return () => tipos.forEach(t => document.removeEventListener(t, filtro, true))
  }, [listo, paso, el, avanzar, fin])

  /* Teclado: Esc salta, las flechas mueven (en un paso de acción, la derecha no). */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); saltar() }
      else if (e.key === 'ArrowRight' && listo && !paso?.accion) { e.preventDefault(); avanzar() }
      else if (e.key === 'ArrowLeft' && listo) { e.preventDefault(); atras() }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [saltar, avanzar, atras, listo, paso])

  if (!paso) return null

  const ultimo = i === pasos.length - 1
  const deportista = el?.dataset.guiaNombre || null
  const titulo = rellenar(paso.titulo, { nombre, deportista })
  const texto = rellenar(paso.texto, { nombre, deportista })
  const sig = siguienteParada(zona)
  const zonaInfo = ZONAS[zona]
  const conVideo = !!zonaInfo.video && primeroMostrado === i && !enSalida

  const textoPrincipal = paso.accion ? 'Hazlo por mí'
    : ultimo ? (paso.ultimo || 'Terminar')
      : i === 0 && paso.primero ? paso.primero : 'Siguiente →'
  const textoSaltar = paso.saltar || (enSalida ? 'Lo sigo otro día' : 'Saltar')

  const principal = () => {
    if (paso.accion) {
      const e = el || (paso.ancla ? buscarAncla(paso.ancla) : null)
      e?.click()
    } else avanzar()
  }

  return (
    <>
      {/* La capa: tapa la pantalla (o la deja tocar, en un paso de acción). */}
      <div aria-hidden className="fixed inset-0"
        style={{ zIndex: 900, background: !el && listo ? 'rgba(3,7,18,.76)' : 'transparent', pointerEvents: paso.accion ? 'none' : 'auto' }} />
      {/* Se queda en el elemento anterior mientras busca el siguiente: así se desliza de uno a otro. */}
      {el && (
        <div ref={focoRef} aria-hidden className={'tp-guia-foco' + (paso.accion ? ' accion' : '')} />
      )}
      {listo && (
        <div ref={globoRef} role="dialog" aria-modal={paso.accion ? 'false' : 'true'} aria-labelledby="tp-guia-titulo" aria-describedby="tp-guia-texto"
          className={'tp-guia-globo fixed bg-gray-900 border border-orange-500/40 p-4 shadow-2xl shadow-black/70' + (visible ? ' visible' : '')}
          style={{ zIndex: 920 }}>
          <span ref={flechaRef} aria-hidden className="tp-guia-flecha" />
          {!el && <p className="text-orange-500 font-bold text-[13px] tracking-wide mb-2.5">TRIPULSE</p>}
          {conVideo && (
            <video src={zonaInfo.video} muted loop autoPlay playsInline aria-hidden
              className="w-full rounded-lg mb-3 bg-black object-cover" style={{ aspectRatio: '16 / 9' }} />
          )}
          <div className="flex items-center gap-2.5 text-[11px] text-gray-400">
            <span className="font-bold tracking-[.08em] uppercase text-orange-400">
              {enSalida ? (sig ? 'Siguiente parada' : 'Fin del recorrido') : zonaInfo.nombre}
            </span>
            {!enSalida && numInfo > 1 && (
              <span className="flex items-center gap-1" aria-hidden>
                {Array.from({ length: numInfo }, (_, k) => (
                  <i key={k} className={'block h-1.5 rounded-full transition-all ' + (k === i ? 'w-4 bg-orange-500' : 'w-1.5 bg-gray-700')} />
                ))}
              </span>
            )}
            <span className="ml-auto tabular-nums">
              {enSalida
                ? (sig ? 'parada ' + (CAMINO.indexOf(sig) + 1) + ' de ' + CAMINO.length : '')
                : (numInfo > 1 ? (i + 1) + ' de ' + numInfo : '')}
            </span>
          </div>
          <h3 id="tp-guia-titulo" className={'font-bold text-white mt-2 mb-1.5 text-balance ' + (el ? 'text-base' : 'text-xl')}>{titulo}</h3>
          <p id="tp-guia-texto" className="text-[13.5px] leading-relaxed text-gray-300">{texto}</p>
          <div className="flex items-center justify-end gap-2 mt-4">
            <button type="button" onClick={saltar}
              className="mr-auto text-[13px] text-gray-400 hover:text-white transition py-1.5">{textoSaltar}</button>
            {i > 0 && (
              <button type="button" onClick={atras}
                className="text-[13px] bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-lg transition">Atrás</button>
            )}
            <button ref={priRef} type="button" onClick={principal}
              className={'text-[13px] font-bold px-3.5 py-1.5 rounded-lg transition ' +
                (paso.accion ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200' : 'bg-orange-600 hover:bg-orange-700 text-white')}>
              {textoPrincipal}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------
   Posiciones (fuera de React: se llaman en cada fotograma)
   --------------------------------------------------------------- */

const HOJA_PX = 640

function colocar(el: HTMLElement | null, foco: HTMLDivElement | null, globo: HTMLDivElement | null, flecha: HTMLSpanElement | null) {
  if (!globo) return
  let r: DOMRect | null = null
  if (el && foco) {
    r = el.getBoundingClientRect()
    const pad = 6
    const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8
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
function asomar(el: HTMLElement, globo: HTMLDivElement | null) {
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
