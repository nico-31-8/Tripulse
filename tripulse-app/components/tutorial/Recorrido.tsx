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
// - En el móvil el pop-up sale abajo, como una hoja (arriba, si lo que brilla
//   es la barra de abajo del deportista: posicion.ts).
// Las posiciones se recalculan en cada fotograma: así siguen al elemento si la
// página se mueve, carga algo o se abre un menú.

import { useCallback, useEffect, useRef, useState } from 'react'
import { esBienvenida, numeroDeParada, siguienteParada, rellenar, type PasoTutorial, type ZonaTutorial, ZONAS } from '@/lib/tutorial'
import { buscarAncla, colocar, asomar } from './posicion'

/** 'sigue' = pulsó lo que lleva a la siguiente parada; 'salida' = «Lo sigo otro día». */
export type FinDelRecorrido = 'visto' | 'sigue' | 'saltado' | 'pausa' | 'salida'

const ESPERA_PRIMERO_MS = 3000
const ESPERA_TRAS_ACCION_MS = 2500
const ESPERA_MS = 1200
/* Con la pantalla ya pintada (se ve otro paso de la zona), lo que falta no va a
   llegar: los primeros pasos de quien ya los completó, la sesión de hoy si no
   tiene. Esperarlo entero dejaba la app quieta y sin nada a la vista. */
const ESPERA_PRIMERO_CON_PANTALLA_MS = 1500
const ESPERA_CON_PANTALLA_MS = 500

export default function Recorrido({ zona, pasos, numInfo, nombre, onFin, onModal }: {
  zona: ZonaTutorial
  pasos: PasoTutorial[]
  /** Cuántos pasos son de la propia zona; los demás son la salida a la siguiente parada. */
  numInfo: number
  nombre: string
  /** `va`: la parada a la que lleva el paso que lo cerró, si no es la siguiente. */
  onFin: (r: FinDelRecorrido, va?: ZonaTutorial) => void
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

  const fin = useCallback((r: FinDelRecorrido, va?: ZonaTutorial) => {
    if (terminado.current) return
    terminado.current = true
    onFinRef.current(r, va)
  }, [])

  /* Busca el elemento del paso; si no aparece a tiempo, el paso se salta. */
  useEffect(() => {
    let vivo = true
    const p = pasos[i]
    if (!p) return
    const primero = inicio.current, trasAccion = vieneDeAccion.current
    const espera = primero ? ESPERA_PRIMERO_MS : trasAccion ? ESPERA_TRAS_ACCION_MS : ESPERA_MS
    /* Tras una acción no se acorta: lo que se espera es lo que esa acción abre (un menú). */
    const breve = primero ? ESPERA_PRIMERO_CON_PANTALLA_MS : ESPERA_CON_PANTALLA_MS
    const pantallaPintada = () => pasos.some((q, k) => k !== i && k < numInfo && !!q.ancla && !!buscarAncla(q.ancla))
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
      const pasado = Date.now() - t0
      const yaPintada = !trasAccion && pasado > breve && pantallaPintada()
      if (pasado > espera || yaPintada) {
        let sig = i + dir.current
        /* Con la pantalla ya pintada, los que vienen detrás y tampoco están se saltan de una vez. */
        const falta = (k: number) => { const a = pasos[k]?.ancla; return !!a && !buscarAncla(a) }
        if (yaPintada) while (sig >= 0 && sig < pasos.length && falta(sig)) sig += dir.current
        if (sig >= 0 && sig < pasos.length) setI(sig)
        else if (dir.current > 0) fin('visto')
        else { dir.current = 1; setI(Math.min(i + 1, pasos.length - 1)) }
        return
      }
      t = setTimeout(buscar, 100)
    }
    t = setTimeout(buscar, 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [i, pasos, numInfo, fin])

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
    if (esBienvenida(zona) && i === 0) fin('pausa')
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
          if (paso.sale) fin('sigue', paso.va)
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
  /* A dónde lleva la salida: la siguiente parada o, si este paso se la salta, la suya. */
  const destino = paso.va ?? siguienteParada(zona)
  const parada = destino ? numeroDeParada(destino) : null
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
              {enSalida ? (destino ? 'Siguiente parada' : 'Fin del recorrido') : zonaInfo.nombre}
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
                ? (parada ? 'parada ' + parada.n + ' de ' + parada.de : '')
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
