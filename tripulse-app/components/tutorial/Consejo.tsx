'use client'
// ============================================================
// Un consejo: el aura en ámbar y su pop-up, sin tapar nada
// ============================================================
// Lo enseña el proveedor (TutorialProvider) cuando toca (lib/consejos). No
// oscurece ni bloquea la pantalla, ni le quita el foco del teclado a nadie.
// Mira dónde está lo que brilla cada poco y al hacer scroll: si no está, o
// si hay una ventana de la página abierta, se esconde y espera.

import { useEffect, useRef, useState } from 'react'
import { esDelDeportista, type Consejo as ConsejoDeDatos } from '@/lib/consejos'
import { colocar, hayVentanaAbierta, objetivoDeConsejo } from './posicion'

export default function Consejo({ consejo, onAhoraNo, onHacer }: {
  consejo: ConsejoDeDatos
  onAhoraNo: () => void
  onHacer: () => void
}) {
  const focoRef = useRef<HTMLDivElement>(null)
  const globoRef = useRef<HTMLDivElement>(null)
  const flechaRef = useRef<HTMLSpanElement>(null)
  const [aLaVista, setALaVista] = useState(false)
  const anclas = consejo.anclas.join('|')

  useEffect(() => {
    let vivo = true
    const lista = anclas.split('|')
    const actualizar = () => {
      if (!vivo) return
      const objetivo = hayVentanaAbierta() ? null : objetivoDeConsejo(lista)
      if (objetivo) colocar(objetivo, focoRef.current, globoRef.current, flechaRef.current)
      setALaVista(!!objetivo)
    }
    const primera = setTimeout(actualizar, 0)
    const cada = setInterval(actualizar, 200)
    /* En captura: así llegan también los scroll de las franjas que se desplazan solas (el lienzo). */
    document.addEventListener('scroll', actualizar, { capture: true, passive: true })
    window.addEventListener('resize', actualizar)
    return () => {
      vivo = false
      clearTimeout(primera); clearInterval(cada)
      document.removeEventListener('scroll', actualizar, { capture: true })
      window.removeEventListener('resize', actualizar)
    }
  }, [anclas])

  return (
    <>
      <div ref={focoRef} aria-hidden data-tutorial className="tp-guia-foco consejo"
        style={{ display: aLaVista ? undefined : 'none' }} />
      <div ref={globoRef} data-tutorial role="dialog" aria-modal="false"
        aria-labelledby="tp-consejo-titulo" aria-describedby="tp-consejo-texto"
        className={'tp-guia-globo fixed bg-gray-900 border border-amber-500/50 p-4 shadow-2xl shadow-black/70' + (aLaVista ? ' visible' : '')}
        style={{ zIndex: 920, visibility: aLaVista ? 'visible' : 'hidden' }}>
        <span ref={flechaRef} aria-hidden className="tp-guia-flecha ambar" />
        <div className="flex items-center gap-2.5 text-[11px] text-gray-400">
          <span className="font-bold tracking-[.08em] uppercase text-amber-400">💡 Consejo</span>
          <span>{esDelDeportista(consejo) ? 'según tus datos' : 'según sus datos'}</span>
        </div>
        <h3 id="tp-consejo-titulo" className="font-bold text-white mt-2 mb-1.5 text-base text-balance">{consejo.titulo}</h3>
        <p id="tp-consejo-texto" className="text-[13.5px] leading-relaxed text-gray-300">{consejo.texto}</p>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onAhoraNo}
            className="text-[13px] bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-lg transition">Ahora no</button>
          <button type="button" onClick={onHacer}
            className="text-[13px] font-bold px-3.5 py-1.5 rounded-lg transition bg-amber-500 hover:bg-amber-400 text-stone-900">{consejo.boton}</button>
        </div>
      </div>
    </>
  )
}
