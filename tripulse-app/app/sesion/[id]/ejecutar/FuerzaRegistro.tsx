'use client'
import { useState } from 'react'

function segAMmss(seg: number): string {
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return min + ':' + String(s).padStart(2, '0')
}

function getYoutubeId(url: string) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([^&\n?#/]+)/)
  return match ? match[1] : null
}

function esYoutubeShort(url: string) {
  return /youtube\.com\/shorts\//.test(url)
}

export default function FuerzaRegistro({ tarea, ejercicios, seriesFuerza, updateSerieFuerza, getSerieFuerza, historial }: {
  tarea: any
  ejercicios: any[]
  seriesFuerza: Record<number, any[]>
  updateSerieFuerza: (ejId: number, numSerie: number, ejNum: number, campo: string, valor: any) => void
  getSerieFuerza: (ejId: number, numSerie: number, ejNum: number) => any
  historial?: Record<string, { dias: number; series: any[] }>   // "modo mejora": última vez por nombre
}) {
  const [modalVideo, setModalVideo] = useState<string | null>(null)

  if (!ejercicios.length) return (
    <div className="text-gray-500 text-sm text-center py-6 bg-gray-900 rounded-xl border border-gray-800">
      Sin ejercicios planificados para esta tarea.
    </div>
  )

  const inputCls = "bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-orange-500 w-full text-center"

  return (
    <div className="flex flex-col gap-4">
      {ejercicios.map(ej => {
        const numSeries = ej.series || 3
        const tipoSerie = ej.tipo_serie || 'Normal'
        const tieneEj2 = tipoSerie === 'Superserie' || tipoSerie === 'Complex'
        const esDropSet = tipoSerie === 'Drop set'
        const escalones = esDropSet && ej.escalones_drop ? ej.escalones_drop.split(',').map((s: string) => s.trim()) : []

        // Modo mejora: qué hizo la última vez en este ejercicio (serie principal).
        const prev = historial?.[ej.nombre]
        const seriesPrev = prev ? prev.series.filter((s: any) => (s.ejercicio_numero ?? 1) === 1) : []
        const resumenPrev = seriesPrev
          .map((s: any) => s.peso_real ? `${Number(s.peso_real)}×${Number(s.repeticiones_reales) || '?'}` : `${Number(s.repeticiones_reales) || '?'} reps`)
          .join(' · ')
        const rirsPrev = seriesPrev.map((s: any) => s.rir_real).filter((v: any) => v != null)
        const rirPrev = rirsPrev.length
          ? (rirsPrev.every((r: any) => r === rirsPrev[0]) ? String(rirsPrev[0]) : `${Math.min(...rirsPrev)}-${Math.max(...rirsPrev)}`)
          : ''
        // Fantasma por serie (lo que hizo esa misma serie la vez pasada) y "¿ha superado el volumen?".
        const prevSerie = (n: number) => seriesPrev.find((s: any) => s.numero_serie === n)
        const volPrev = seriesPrev.reduce((a: number, s: any) => a + (Number(s.peso_real) || 0) * (Number(s.repeticiones_reales) || 0), 0)
        const volHoy = Array.from({ length: numSeries }, (_, i) => getSerieFuerza(ej.id, i + 1, 1))
          .reduce((a: number, s: any) => a + (Number(s.peso_real) || 0) * (Number(s.repeticiones_reales) || 0), 0)
        const superado = !!prev && volPrev > 0 && volHoy >= volPrev

        return (
          <div key={ej.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
              <div className="flex justify-between items-start">
                <div>
                  <span className={'text-xs px-2 py-0.5 rounded-full mr-2 ' +
                    (tipoSerie === 'Normal' ? 'bg-gray-700 text-gray-300' :
                     tipoSerie === 'Superserie' ? 'bg-orange-900 text-orange-300' :
                     tipoSerie === 'Complex' ? 'bg-purple-900 text-purple-300' :
                     'bg-yellow-900 text-yellow-300')}>
                    {tipoSerie}
                  </span>
                  <span className="font-bold text-white">{ej.nombre}</span>
                  {ej.ejercicio_encadenado_nombre && (
                    <span className="text-orange-400 text-sm"> + {ej.ejercicio_encadenado_nombre}</span>
                  )}
                  {superado && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-600 text-white align-middle">✓ superado</span>}
                </div>
                <span className="text-gray-400 text-xs">{ej.grupo_muscular}</span>
              </div>
              {ej.url_video && (
                <button onClick={() => setModalVideo(ej.url_video)}
                  className="inline-flex items-center gap-1.5 mt-2 bg-red-900 hover:bg-red-800 text-red-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                  <span>▶</span> Ver vídeo
                </button>
              )}
              <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                <span>{numSeries} series</span>
                {ej.repeticiones && <span>{ej.repeticiones} reps obj.</span>}
                {ej.intensidad && <span>{ej.intensidad} kg obj.</span>}
                {ej.descanso_segundos && <span>⏸ {segAMmss(ej.descanso_segundos)}</span>}
              </div>
              {/* Modo mejora: la última vez que hiciste este ejercicio, para superarlo. */}
              {prev && resumenPrev && (
                <div className="flex items-center gap-2 mt-2 text-xs bg-gray-800/80 border border-gray-700 rounded-lg px-2.5 py-1.5 flex-wrap">
                  <span className="text-orange-400 font-semibold">📊 Última vez</span>
                  <span className="text-gray-500">{prev.dias === 0 ? 'hoy' : prev.dias === 1 ? 'ayer' : `hace ${prev.dias} d`}</span>
                  <span className="text-gray-100 font-medium">{resumenPrev}</span>
                  {rirPrev && <span className="text-gray-500">· RIR {rirPrev}</span>}
                  <span className="ml-auto text-orange-300/70">↗ supéralo</span>
                </div>
              )}
            </div>

            <div className="p-3 flex flex-col gap-2">
              {Array.from({ length: numSeries }, (_, serieIdx) => {
                const numSerie = serieIdx + 1
                const s1 = getSerieFuerza(ej.id, numSerie, 1)
                const s2 = getSerieFuerza(ej.id, numSerie, 2)
                const completada = s1.completada

                return (
                  <div key={serieIdx} className={'rounded-xl border transition ' + (completada ? 'bg-green-900/30 border-green-700' : 'bg-gray-800 border-gray-700')}>
                    
                    {/* Normal */}
                    {!esDropSet && !tieneEj2 && (
                      <div className="grid grid-cols-4 gap-2 items-center p-3">
                        <button onClick={() => updateSerieFuerza(ej.id, numSerie, 1, 'completada', !completada)}
                          className={'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ' +
                            (completada ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
                          {completada ? '✓' : numSerie}
                        </button>
                        <input type="number" value={s1.peso_real || ''} placeholder={prevSerie(numSerie)?.peso_real ? String(Number(prevSerie(numSerie).peso_real)) : (ej.intensidad || 'Kg')}
                          onChange={e => updateSerieFuerza(ej.id, numSerie, 1, 'peso_real', e.target.value)}
                          className={inputCls} />
                        <input type="number" value={s1.repeticiones_reales || ''} placeholder={prevSerie(numSerie)?.repeticiones_reales ? String(Number(prevSerie(numSerie).repeticiones_reales)) : (ej.repeticiones || 'Reps')}
                          onChange={e => updateSerieFuerza(ej.id, numSerie, 1, 'repeticiones_reales', e.target.value)}
                          className={inputCls} />
                        <input type="number" min="0" max="4" value={s1.rir_real || ''} placeholder="RIR"
                          onChange={e => updateSerieFuerza(ej.id, numSerie, 1, 'rir_real', e.target.value)}
                          className={inputCls} />
                      </div>
                    )}

                    {/* Superserie / Complex */}
                    {tieneEj2 && (
                      <div className="p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Serie {numSerie}</span>
                          <button onClick={() => updateSerieFuerza(ej.id, numSerie, 1, 'completada', !completada)}
                            className={'text-xs px-3 py-1 rounded-full transition ' + (completada ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400')}>
                            {completada ? '✓ Hecha' : 'Marcar'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-700 rounded-lg p-2">
                            <p className="text-xs text-orange-400 mb-2 truncate font-medium">{ej.nombre}</p>
                            <input type="number" value={s1.peso_real || ''} placeholder={ej.intensidad || 'Kg'} onChange={e => updateSerieFuerza(ej.id, numSerie, 1, 'peso_real', e.target.value)} className={inputCls + ' mb-1'} />
                            <input type="number" value={s1.repeticiones_reales || ''} placeholder={ej.repeticiones || 'Reps'} onChange={e => updateSerieFuerza(ej.id, numSerie, 1, 'repeticiones_reales', e.target.value)} className={inputCls + ' mb-1'} />
                            <input type="number" min="0" max="4" value={s1.rir_real || ''} placeholder="RIR" onChange={e => updateSerieFuerza(ej.id, numSerie, 1, 'rir_real', e.target.value)} className={inputCls} />
                          </div>
                          <div className="bg-gray-700 rounded-lg p-2">
                            <p className="text-xs text-orange-300 mb-2 truncate font-medium">{ej.ejercicio_encadenado_nombre}</p>
                            <input type="number" value={s2.peso_real || ''} placeholder="Kg" onChange={e => updateSerieFuerza(ej.id, numSerie, 2, 'peso_real', e.target.value)} className={inputCls + ' mb-1'} />
                            <input type="number" value={s2.repeticiones_reales || ''} placeholder="Reps" onChange={e => updateSerieFuerza(ej.id, numSerie, 2, 'repeticiones_reales', e.target.value)} className={inputCls + ' mb-1'} />
                            <input type="number" min="0" max="4" value={s2.rir_real || ''} placeholder="RIR" onChange={e => updateSerieFuerza(ej.id, numSerie, 2, 'rir_real', e.target.value)} className={inputCls} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Drop set */}
                    {esDropSet && (
                      <div className="p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Serie {numSerie}</span>
                          <button onClick={() => updateSerieFuerza(ej.id, numSerie, 1, 'completada', !completada)}
                            className={'text-xs px-3 py-1 rounded-full transition ' + (completada ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400')}>
                            {completada ? '✓ Hecha' : 'Marcar'}
                          </button>
                        </div>
                        <div className="flex flex-col gap-2">
                          {escalones.map((kg: string, eIdx: number) => {
                            const sd = getSerieFuerza(ej.id, numSerie, eIdx + 1)
                            return (
                              <div key={eIdx} className="grid grid-cols-3 gap-2 items-center">
                                <div className="bg-yellow-900/50 rounded-lg px-2 py-2 text-center">
                                  <p className="text-xs text-yellow-400">Escalón {eIdx + 1}</p>
                                  <p className="text-sm font-bold">{kg} kg</p>
                                </div>
                                <input type="number" value={sd.repeticiones_reales || ''} placeholder="Reps"
                                  onChange={e => updateSerieFuerza(ej.id, numSerie, eIdx + 1, 'repeticiones_reales', e.target.value)}
                                  className={inputCls} />
                                <input type="number" min="0" max="4" value={sd.rir_real || ''} placeholder="RIR"
                                  onChange={e => updateSerieFuerza(ej.id, numSerie, eIdx + 1, 'rir_real', e.target.value)}
                                  className={inputCls} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Cabecera columnas para normal */}
              {!esDropSet && !tieneEj2 && (
                <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 text-center px-1">
                  <div></div><div>Kg</div><div>Reps</div><div>RIR</div>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {modalVideo && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-2xl border border-gray-700">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <p className="font-medium">Video del ejercicio</p>
              <button onClick={() => setModalVideo(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-4">
              {esYoutubeShort(modalVideo) ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <p className="text-gray-400 text-sm text-center">
                    Este vídeo es un Short de YouTube y no se puede mostrar dentro de la app.
                  </p>
                  <a href={modalVideo} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg text-sm font-medium transition">
                    <span>▶</span> Abrir en YouTube
                  </a>
                </div>
              ) : getYoutubeId(modalVideo) ? (
                <iframe
                  width="100%" height="360"
                  src={`https://www.youtube.com/embed/${getYoutubeId(modalVideo)}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="rounded-lg"
                />
              ) : (
                <p className="text-gray-400 text-center py-8">URL de video no válida</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
