'use client'
// ============================================================
// El botón ? en una pantalla con dos recorridos: cuál quiere ver
// ============================================================
// Hoy solo la sesión: «Lo básico» (la parada 9 del primer día) y «Herramientas»
// (la avanzada). Las opciones y sus textos salen de lib/tutorial (opcionesDeAyuda,
// `etiquetaAyuda` y `resumen` de cada zona).

import { useEffect, useRef } from 'react'
import { ZONAS, type ZonaTutorial } from '@/lib/tutorial'

export default function EleccionDeAyuda({ opciones, onElegir, onCerrar }: {
  opciones: ZonaTutorial[]
  onElegir: (z: ZonaTutorial) => void
  onCerrar: () => void
}) {
  const primero = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    primero.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ zIndex: 930 }} data-tutorial>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/60 cursor-default" />
      <div role="dialog" aria-modal="true" aria-labelledby="tp-eleccion-titulo"
        className="relative w-full sm:w-[400px] bg-gray-900 border border-orange-500/40 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl shadow-black/70">
        <h2 id="tp-eleccion-titulo" className="font-bold text-white text-[17px]">¿Qué quieres ver?</h2>
        <div className="flex flex-col gap-2 mt-4">
          {opciones.map((z, k) => (
            <button key={z} ref={k === 0 ? primero : undefined} type="button" onClick={() => onElegir(z)}
              className="text-left rounded-xl border border-gray-700 hover:border-orange-500 bg-gray-800/60 hover:bg-gray-800 px-4 py-3 transition">
              <span className="block text-[14px] font-semibold text-white">{ZONAS[z].etiquetaAyuda || ZONAS[z].nombre}</span>
              {ZONAS[z].resumen && <span className="block text-[12.5px] text-gray-400 mt-0.5 leading-snug">{ZONAS[z].resumen}</span>}
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={onCerrar} className="text-[13px] text-gray-400 hover:text-white transition py-1.5">Cancelar</button>
        </div>
      </div>
    </div>
  )
}
