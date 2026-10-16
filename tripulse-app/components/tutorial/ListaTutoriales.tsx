'use client'
// ============================================================
// 🎓 Tutoriales: todos los recorridos, con lo ya visto
// ============================================================
// Se abre desde el menú (abajo del todo) o con el botón ? en una pantalla sin
// recorrido. Arriba, por dónde va el recorrido del primer día y «Seguir»; debajo
// cada parada con su estado y «Ver». Las que dependen de un deportista se abren
// con el que tiene elegido; la sesión, desde una sesión.

import { useEffect } from 'react'
import { CAMINO, ZONAS, rutaDeZona, siguienteDelCamino, type Progreso, type ZonaTutorial } from '@/lib/tutorial'
import { getAtletaActivo } from '@/lib/atletaActivo'

export default function ListaTutoriales({ progreso, onCerrar, onVer }: {
  progreso: Progreso
  onCerrar: () => void
  onVer: (zona: ZonaTutorial, camino: boolean) => void
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const atleta = getAtletaActivo()
  const hechas = CAMINO.filter(z => progreso.vistos.has(z)).length
  const proxima = siguienteDelCamino(progreso)
  const motivo = (z: ZonaTutorial): string | null => {
    if (rutaDeZona(z, atleta)) return null
    return z === 'sesion' ? 'Abre una sesión y pulsa ?' : 'Elige antes un deportista en el Panel'
  }

  return (
    <div className="fixed inset-0 flex items-end sm:items-stretch sm:justify-end" style={{ zIndex: 800 }}>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/50 cursor-default" />
      <aside role="dialog" aria-modal="true" aria-labelledby="tp-tutoriales-titulo"
        className="relative w-full sm:w-[380px] max-h-[85vh] sm:max-h-none sm:m-3 bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/70 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 id="tp-tutoriales-titulo" className="font-bold text-[17px]">🎓 Tutoriales</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 hover:text-white text-2xl leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <p className="text-[13px] text-gray-400 leading-relaxed">
            Cada pantalla tiene su recorrido, y el botón ? lo repite cuando quieras. Estos son los del primer día, en orden.
          </p>

          <div className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/[0.06] px-4 py-3">
            <div className="flex justify-between text-[13px] font-semibold">
              <span>Recorrido del primer día</span>
              <span className="tabular-nums text-gray-300">{hechas} de {CAMINO.length}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden my-2.5">
              <div className="h-full bg-orange-500 transition-all" style={{ width: (hechas / CAMINO.length * 100) + '%' }} />
            </div>
            {!proxima ? (
              <p className="text-[12.5px] text-gray-300">Completado.</p>
            ) : (
              <div className="flex items-center justify-between gap-3 text-[12.5px] text-gray-300">
                <span>Siguiente parada: <b className="text-white">{ZONAS[proxima].nombre}</b></span>
                {motivo(proxima)
                  ? <span className="text-gray-500 text-right">{motivo(proxima)}</span>
                  : <button type="button" onClick={() => onVer(proxima, true)}
                      className="flex-shrink-0 bg-orange-600 hover:bg-orange-700 text-white font-semibold px-3 py-1.5 rounded-lg transition">Seguir →</button>}
              </div>
            )}
          </div>

          <ul className="mt-3">
            {CAMINO.map((z, k) => {
              const visto = progreso.vistos.has(z)
              const saltado = !visto && progreso.saltados.has(z)
              const m = motivo(z)
              return (
                <li key={z} className="flex items-center gap-2.5 py-2.5 border-t border-white/[0.04] text-[13.5px] min-h-[44px]">
                  <span className="w-5 text-gray-500 text-xs tabular-nums">{k + 1}</span>
                  <span className="flex-1 min-w-0 text-gray-200">{ZONAS[z].nombre}</span>
                  <span className={'text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ' +
                    (visto ? 'bg-green-500/10 text-green-400' : saltado ? 'bg-white/5 text-gray-400' : 'border border-orange-500/40 text-orange-300')}>
                    {visto ? 'Visto' : saltado ? 'Saltado' : 'Pendiente'}
                  </span>
                  <button type="button" disabled={!!m} title={m || undefined} onClick={() => onVer(z, false)}
                    className="text-xs bg-gray-800 border border-gray-700 hover:border-orange-500 disabled:opacity-40 disabled:hover:border-gray-700 text-gray-200 px-2.5 py-1 rounded-lg transition">
                    Ver
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
            Las partes avanzadas (SICAT, volumen, grupos, el planificador…) tendrán pronto su recorrido.
          </p>
        </div>
      </aside>
    </div>
  )
}
