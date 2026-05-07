'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function segAMmss(seg: number): string {
  if (!seg) return '—'
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return min + ':' + String(s).padStart(2, '0')
}

export default function DatosReales({ sesionId, disciplina }: { sesionId: number, disciplina: string }) {
  const [tareas, setTareas] = useState<any[]>([])
  const [seriesReales, setSeriesReales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargar()
  }, [sesionId])

  const cargar = async () => {
    const { data: tar } = await supabase
      .from('tarea')
      .select('*, p_distancia(*), p_duracion(*), p_repeticiones(*), ejercicios(*)')
      .eq('id_sesion', sesionId)
      .order('orden')

    if (tar?.length) {
      // Cargar ejercicios manualmente
      const tareaIds = tar.map(t => t.id)
      const { data: ejs } = await supabase.from('ejercicios').select('*').in('id_tarea', tareaIds)
      const tarConEjs = tar.map(t => ({
        ...t,
        ejercicios: ejs?.filter(e => e.id_tarea === t.id) || []
      }))
      setTareas(tarConEjs)

      // Cargar series realizadas
      const ejIds = ejs?.map(e => e.id) || []
      if (ejIds.length) {
        const { data: sr } = await supabase.from('series_realizadas').select('*').in('id_ejercicio', ejIds).order('numero_serie')
        setSeriesReales(sr || [])
      }
    }
    setLoading(false)
  }

  const tienePostSesion = tareas.some(t =>
    t.rpe_reportado || t.fc_media || t.sensacion_tecnica || t.dolor_muscular
  )

  const tieneDatosEjecucion = tareas.some(t =>
    t.p_distancia?.[0]?.metros_reales ||
    t.p_duracion?.[0]?.tiempo_real ||
    t.sensacion_general ||
    seriesReales.length > 0
  )

  if (loading) return null
  if (!tienePostSesion && !tieneDatosEjecucion) return null

  const esFuerza = disciplina === 'Fuerza'

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-lg text-orange-400">📊 Datos registrados por el deportista</h3>

      {/* Post sesión general */}
      {tienePostSesion && (
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="font-medium text-gray-300 mb-3 text-sm">Valoración post-sesión</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tareas.find(t => t.rpe_reportado) && (
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">RPE real</p>
                <p className="text-2xl font-bold text-orange-400">{tareas.find(t => t.rpe_reportado)?.rpe_reportado}/10</p>
              </div>
            )}
            {tareas.find(t => t.sensacion_tecnica) && (
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Sensación técnica</p>
                <p className="text-2xl font-bold text-blue-400">{tareas.find(t => t.sensacion_tecnica)?.sensacion_tecnica}/5</p>
              </div>
            )}
            {tareas.find(t => t.dolor_muscular) && (
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Dolor muscular</p>
                <p className="text-2xl font-bold text-yellow-400">{tareas.find(t => t.dolor_muscular)?.dolor_muscular}/5</p>
              </div>
            )}
            {tareas.find(t => t.fc_media) && (
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">FC media</p>
                <p className="text-2xl font-bold text-red-400">{tareas.find(t => t.fc_media)?.fc_media} ppm</p>
              </div>
            )}
          </div>
          {tareas.find(t => t.notas_post) && (
            <p className="text-gray-400 text-sm mt-3 italic">"{tareas.find(t => t.notas_post)?.notas_post}"</p>
          )}
        </div>
      )}

      {/* Datos de ejecución resistencia */}
      {!esFuerza && tieneDatosEjecucion && (
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="font-medium text-gray-300 mb-3 text-sm">Ejecución por tarea</p>
          <div className="flex flex-col gap-3">
            {tareas.map((t, i) => {
              const distReal = t.p_distancia?.[0]?.metros_reales
              const durReal = t.p_duracion?.[0]?.tiempo_real
              const seriesData = t.sensacion_general

              if (!distReal && !durReal && !seriesData) return null

              return (
                <div key={t.id} className="bg-gray-800 rounded-xl p-4">
                  <p className="font-medium text-sm mb-2 text-orange-400">Tarea {i + 1} — {t.zona_entrenamiento || t.disciplina}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                    {distReal && (
                      <div>
                        <p className="text-xs text-gray-500">Distancia real</p>
                        <p className="font-medium text-blue-400">{distReal >= 1000 ? (distReal/1000).toFixed(1) + ' km' : distReal + ' m'}</p>
                      </div>
                    )}
                    {durReal && (
                      <div>
                        <p className="text-xs text-gray-500">Tiempo real</p>
                        <p className="font-medium text-blue-400">{segAMmss(durReal)}</p>
                      </div>
                    )}
                  </div>
                  {/* Series detalladas */}
                  {seriesData && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">Series registradas</p>
                      <div className="flex flex-col gap-1">
                        {seriesData.split(' | ').map((s: string, idx: number) => (
                          <p key={idx} className="text-xs text-gray-300 bg-gray-700 rounded px-2 py-1">{s}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Datos de ejecución fuerza */}
      {esFuerza && seriesReales.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="font-medium text-gray-300 mb-3 text-sm">Series realizadas</p>
          <div className="flex flex-col gap-4">
            {tareas.map(t => {
              const ejsConSeries = t.ejercicios.filter((ej: any) =>
                seriesReales.some(sr => sr.id_ejercicio === ej.id)
              )
              if (!ejsConSeries.length) return null
              return (
                <div key={t.id}>
                  {ejsConSeries.map((ej: any) => {
                    const srEj = seriesReales.filter(sr => sr.id_ejercicio === ej.id)
                    return (
                      <div key={ej.id} className="mb-3">
                        <p className="font-medium text-sm text-orange-400 mb-2">{ej.nombre}</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-700">
                                <th className="text-left py-1 px-2">Serie</th>
                                <th className="text-center py-1 px-2">Kg</th>
                                <th className="text-center py-1 px-2">Reps</th>
                                <th className="text-center py-1 px-2">RIR</th>
                                <th className="text-center py-1 px-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {srEj.filter(sr => sr.ejercicio_numero === 1).map((sr: any) => (
                                <tr key={sr.id} className={'border-b border-gray-800 ' + (sr.completada ? 'bg-green-900 bg-opacity-20' : '')}>
                                  <td className="py-1.5 px-2 font-medium">{sr.numero_serie}</td>
                                  <td className="py-1.5 px-2 text-center text-yellow-400">{sr.peso_real ? sr.peso_real + ' kg' : '—'}</td>
                                  <td className="py-1.5 px-2 text-center text-blue-400">{sr.repeticiones_reales || '—'}</td>
                                  <td className="py-1.5 px-2 text-center text-gray-400">{sr.rir_real ?? '—'}</td>
                                  <td className="py-1.5 px-2 text-center">{sr.completada ? '✓' : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Ejercicio 2 si hay superserie */}
                        {ej.ejercicio_encadenado_nombre && srEj.some(sr => sr.ejercicio_numero === 2) && (
                          <div className="mt-2">
                            <p className="text-xs text-orange-300 mb-1">+ {ej.ejercicio_encadenado_nombre}</p>
                            <table className="w-full text-xs">
                              <tbody>
                                {srEj.filter(sr => sr.ejercicio_numero === 2).map((sr: any) => (
                                  <tr key={sr.id} className="border-b border-gray-800">
                                    <td className="py-1.5 px-2 font-medium">{sr.numero_serie}</td>
                                    <td className="py-1.5 px-2 text-center text-yellow-400">{sr.peso_real ? sr.peso_real + ' kg' : '—'}</td>
                                    <td className="py-1.5 px-2 text-center text-blue-400">{sr.repeticiones_reales || '—'}</td>
                                    <td className="py-1.5 px-2 text-center text-gray-400">{sr.rir_real ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
