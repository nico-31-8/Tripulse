'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { vivas } from '@/lib/papelera'
import { usuarioActual } from '@/lib/sesion'
import { estimarDuraciones, duracionSesionTexto, minutosEfectivos } from '@/lib/duracion-carga'
import { ritmoObjetivoTexto } from '@/lib/referencia-zona'
import type { TestsDeportista } from '@/lib/duracion'

function secAMinSeg(seg: number): string {
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const colorDisciplina = (d: string) => {
  if (!d) return 'bg-gray-700 text-gray-300'
  if (d.includes('Nat')) return 'bg-blue-900 text-blue-300'
  if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
  if (d === 'Carrera') return 'bg-green-900 text-green-300'
  if (d === 'Fuerza') return 'bg-red-900 text-red-300'
  return 'bg-purple-900 text-purple-300'
}

const colorBar = (d: string) => {
  if (d.includes('Nat')) return 'bg-blue-500'
  if (d === 'Ciclismo') return 'bg-yellow-500'
  if (d === 'Carrera') return 'bg-green-500'
  if (d === 'Fuerza') return 'bg-red-500'
  return 'bg-purple-500'
}

export default function MisAnalisis() {
  const router = useRouter()
  const [sesiones, setSesiones] = useState<any[]>([])
  const [sesionSel, setSesionSel] = useState<any>(null)
  const [tareasSel, setTareasSel] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTareas, setLoadingTareas] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data: dep } = await supabase.from('deportista').select('id').eq('id_usuario', user.id).maybeSingle()
      if (!dep) { setLoading(false); return }

      /* Las últimas 20 realizadas: del plan y libres, en UNA consulta. Antes
         eran tres para la cadena y dos más para las dos ramas, y encima el
         `limit(20)` se aplicaba a CADA rama por separado y se recortaba
         después: con 20 del plan y 20 libres se pedían 40 para tirar la mitad. */
      const { data: ses } = await vivas(supabase.from('sesion').select('*')
        .eq('id_deportista', dep.id).eq('estado', 'Realizada'))
        .order('fecha_sesion', { ascending: false }).limit(20)

      const [tc, tn, tci] = await Promise.all([
        supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
        supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
        supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
      ])
      const testsDep: TestsDeportista = { vam: tc.data?.[0]?.vam, css: tn.data?.[0]?.css, ftp: tci.data?.[0]?.ftp }
      const durs = await estimarDuraciones(supabase, (ses || []).map((s: any) => s.id), testsDep)
      setSesiones((ses || []).map((s: any) => ({ ...s, dur_estimada: durs[s.id] })))
      setLoading(false)
    }
    cargar()
  }, [])

  const verAnalisis = async (ses: any) => {
    setSesionSel(ses)
    setLoadingTareas(true)
    const { data: tareas } = await supabase
      .from('tarea')
      .select('*, p_distancia(*), p_duracion(*), p_repeticiones(*)')
      .eq('id_sesion', ses.id)
      .order('orden', { ascending: true })
    setTareasSel(tareas || [])
    setLoadingTareas(false)
  }

  const rpeColor = (real: number, plan: number) => {
    if (!plan) return 'text-gray-300'
    if (real > plan + 1) return 'text-red-400'
    if (real < plan - 1) return 'text-green-400'
    return 'text-orange-400'
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => sesionSel ? setSesionSel(null) : router.push('/dashboard-deportista')}
          className="text-gray-400 hover:text-white text-sm transition">
          {sesionSel ? '← Volver a sesiones' : '← Mi panel'}
        </button>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {!sesionSel ? (
          <>
            <h2 className="text-2xl font-bold mb-1">Mis análisis</h2>
            <p className="text-gray-400 text-sm mb-6">Últimas 20 sesiones realizadas — pulsa una para ver el análisis</p>

            {sesiones.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">📊</div>
                <p>No tienes sesiones realizadas todavía.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sesiones.map(s => {
                  const ua = (s.rpe_reportado || s.rpe_estimado || 5) * (minutosEfectivos(s, s.dur_estimada) || 0)
                  return (
                    <button key={s.id} onClick={() => verAnalisis(s)}
                      className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-orange-500 transition text-left w-full">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={'w-1 h-12 rounded-full flex-shrink-0 ' + colorBar(s.disciplina)} />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={'text-xs px-2 py-0.5 rounded-full ' + colorDisciplina(s.disciplina)}>{s.disciplina}</span>
                              <span className="text-gray-400 text-xs">{s.fecha_sesion}</span>
                            </div>
                            <p className="text-gray-300 text-sm">
                              {duracionSesionTexto(s, s.dur_estimada)} ·
                              RPE plan {s.rpe_estimado || '—'} →
                              <span className={' font-bold ' + rpeColor(s.rpe_reportado, s.rpe_estimado)}>
                                {s.rpe_reportado || '—'}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-orange-400 font-bold">{ua > 0 ? Math.round(ua) + ' UA' : '—'}</p>
                          <p className="text-gray-600 text-xs">Ver análisis →</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Cabecera sesión seleccionada */}
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <span className={'text-xs px-2 py-1 rounded-full font-medium ' + colorDisciplina(sesionSel.disciplina)}>{sesionSel.disciplina}</span>
                <span className="text-gray-400 text-sm">{sesionSel.fecha_sesion}</span>
                <span className="text-green-400 text-xs bg-green-900 px-2 py-0.5 rounded-full">Realizada</span>
              </div>

              {/* RPE planificado vs real */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-800 rounded-xl p-3 text-center">
                  <p className="text-gray-500 text-xs mb-1">RPE planificado</p>
                  <p className="text-2xl font-bold text-gray-300">{sesionSel.rpe_estimado || '—'}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-3 text-center">
                  <p className="text-gray-500 text-xs mb-1">RPE real</p>
                  <p className={'text-2xl font-bold ' + rpeColor(sesionSel.rpe_reportado, sesionSel.rpe_estimado)}>
                    {sesionSel.rpe_reportado || '—'}
                  </p>
                </div>
              </div>

              {/* Notas entrenador */}
              {sesionSel.notas_entrenador && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-gray-500 text-xs mb-1">Notas del entrenador</p>
                  <p className="text-gray-300 text-sm italic">"{sesionSel.notas_entrenador}"</p>
                </div>
              )}
            </div>

            {/* Tareas */}
            <h3 className="font-bold mb-3 text-gray-300">Tareas — Planificado vs Real</h3>

            {loadingTareas ? (
              <div className="text-center py-8 text-gray-500">Cargando tareas...</div>
            ) : tareasSel.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Esta sesión no tiene tareas registradas.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {tareasSel.map((t, i) => {
                  const pd = Array.isArray(t.p_distancia) ? t.p_distancia[0] : t.p_distancia
                  const pu = Array.isArray(t.p_duracion) ? t.p_duracion[0] : t.p_duracion
                  const pr = Array.isArray(t.p_repeticiones) ? t.p_repeticiones[0] : t.p_repeticiones

                  return (
                    <div key={t.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                      <div className="px-4 py-3 bg-gray-800 flex items-center gap-2">
                        <span className="text-orange-400 font-bold text-sm">#{i+1}</span>
                        {t.zona_entrenamiento && (
                          <span className="text-xs bg-black/30 px-2 py-0.5 rounded-full">{t.zona_entrenamiento}</span>
                        )}
                        {t.disciplina && (
                          <span className={'text-xs px-2 py-0.5 rounded-full ' + colorDisciplina(t.disciplina)}>{t.disciplina}</span>
                        )}
                        {t.series && <span className="text-gray-400 text-xs ml-auto">{t.series} series</span>}
                      </div>

                      <div className="p-4">
                        {/* RPE y sensación de la tarea */}
                        {(t.rpe_reportado || t.sensacion_tecnica) && (
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {t.rpe_reportado && (
                              <div className="bg-gray-800 rounded-lg p-2 text-center">
                                <p className="text-gray-500 text-xs">RPE tarea</p>
                                <p className="font-bold text-orange-400">{t.rpe_reportado}/10</p>
                              </div>
                            )}
                            {t.sensacion_tecnica && (
                              <div className="bg-gray-800 rounded-lg p-2 text-center">
                                <p className="text-gray-500 text-xs">Sensación</p>
                                <p className="font-bold text-blue-400">{t.sensacion_tecnica}/5</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Distancia */}
                        {pd && (
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-gray-800 rounded-lg p-2 text-center">
                              <p className="text-gray-500 text-xs">Distancia plan</p>
                              <p className="font-bold text-sm">{pd.metros_planeados ? pd.metros_planeados + 'm' : '—'}</p>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-2 text-center">
                              <p className="text-gray-500 text-xs">Distancia real</p>
                              <p className={'font-bold text-sm ' + (pd.metros_reales ? 'text-green-400' : 'text-gray-500')}>
                                {pd.metros_reales ? pd.metros_reales + 'm' : '—'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Ritmo objetivo. Se guarda como TEXTO con su unidad dentro
                            («180–220 W»); pasarlo por un m:ss daba «NaN:NaN /km». */}
                        {(() => {
                          const ritmo = ritmoObjetivoTexto(pd?.ritmo_objetivo, t.disciplina)
                          if (!ritmo) return null
                          return (
                            <div className="bg-orange-950 border border-orange-800 rounded-lg p-3 mb-2">
                              <p className="text-orange-400 text-xs mb-1">Ritmo objetivo</p>
                              <p className="font-bold text-white">{ritmo}</p>
                            </div>
                          )
                        })()}

                        {/* Duración */}
                        {pu && (
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-gray-800 rounded-lg p-2 text-center">
                              <p className="text-gray-500 text-xs">Duración plan</p>
                              <p className="font-bold text-sm">{pu.tiempo_planeado ? secAMinSeg(pu.tiempo_planeado) + ' min' : '—'}</p>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-2 text-center">
                              <p className="text-gray-500 text-xs">Duración real</p>
                              <p className={'font-bold text-sm ' + (pu.tiempo_real ? 'text-green-400' : 'text-gray-500')}>
                                {pu.tiempo_real ? secAMinSeg(pu.tiempo_real) + ' min' : '—'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Potencia */}
                        {pu?.potencia_objetivo && (
                          <div className="bg-orange-950 border border-orange-800 rounded-lg p-3 mb-2">
                            <p className="text-orange-400 text-xs mb-1">Potencia objetivo</p>
                            <p className="font-bold text-white">{pu.potencia_objetivo} W</p>
                          </div>
                        )}

                        {/* Repeticiones */}
                        {pr && (
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-gray-800 rounded-lg p-2 text-center">
                              <p className="text-gray-500 text-xs">Reps plan</p>
                              <p className="font-bold text-sm">{pr.repeticiones_planteadas || '—'}</p>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-2 text-center">
                              <p className="text-gray-500 text-xs">Reps reales</p>
                              <p className={'font-bold text-sm ' + (pr.repeticiones_reales ? 'text-green-400' : 'text-gray-500')}>
                                {pr.repeticiones_reales || '—'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Comentario */}
                        {t.comentario && (
                          <p className="text-gray-500 text-xs italic mt-2">"{t.comentario}"</p>
                        )}

                        {/* Notas post */}
                        {t.notas_post && (
                          <div className="bg-gray-800 rounded-lg p-2 mt-2">
                            <p className="text-gray-500 text-xs">Tus notas</p>
                            <p className="text-gray-300 text-sm">{t.notas_post}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

