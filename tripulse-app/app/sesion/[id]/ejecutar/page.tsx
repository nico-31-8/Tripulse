'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import FuerzaRegistro from './FuerzaRegistro'

function segAMmss(seg: number): string {
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return min + ':' + String(s).padStart(2, '0')
}

function mmssASeg(str: string): number {
  if (!str) return 0
  const p = str.split(':')
  if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0)
  return parseInt(str) || 0
}

const COLOR_ZONA: Record<string, string> = {
  'Z1': 'bg-gray-700 border-gray-500',
  'Z2': 'bg-blue-900 border-blue-600',
  'Z3': 'bg-green-900 border-green-600',
  'Z4': 'bg-yellow-900 border-yellow-600',
  'Z5': 'bg-orange-900 border-orange-600',
  'Z6': 'bg-red-900 border-red-600',
  'Z7': 'bg-purple-900 border-purple-600',
}

const VAM_ZONAS: Record<string, [number,number]> = { Z1:[0.45,0.60], Z2:[0.60,0.70], Z3:[0.70,0.80], Z4:[0.80,0.90], Z5:[0.90,1.00], Z6:[1.00,1.15], Z7:[1.15,1.30] }
const FTP_ZONAS: Record<string, [number,number]> = { Z1:[0.45,0.55], Z2:[0.56,0.75], Z3:[0.76,0.90], Z4:[0.91,1.05], Z5:[1.06,1.20], Z6:[1.21,1.50], Z7:[1.51,2.00] }
const CSS_ZONAS: Record<string, [number,number]> = { Z1:[0.55,0.65], Z2:[0.65,0.75], Z3:[0.76,0.85], Z4:[0.86,0.95], Z5:[0.96,1.05], Z6:[1.06,1.20], Z7:[1.21,1.40] }
function calcularRango(zona: string, disciplina: string, tests: any): string {
  if (!zona || !disciplina || !tests) return ''
  const z = zona.toUpperCase()
  if (disciplina === 'Carrera' && tests.vam && VAM_ZONAS[z]) {
    const [p1, p2] = VAM_ZONAS[z]
    const v1 = tests.vam * p1, v2 = tests.vam * p2
    const fmt = (v: number) => { const s = 3600/v; return Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0') }
    return fmt(v2) + '–' + fmt(v1) + ' /km'
  }
  if (disciplina === 'Ciclismo' && tests.ftp && FTP_ZONAS[z]) {
    const [p1, p2] = FTP_ZONAS[z]
    return Math.round(tests.ftp*p1) + '–' + Math.round(tests.ftp*p2) + ' W'
  }
  if ((disciplina === 'Natacion' || disciplina === 'Natación') && tests.css && CSS_ZONAS[z]) {
    const [p1, p2] = CSS_ZONAS[z]
    const fmt = (v: number) => { const s = 100/v; return Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0') }
    return fmt(p2) + '–' + fmt(p1) + ' /100m'
  }
  return ''
}
export default function EjecutarSesion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [sesion, setSesion] = useState<any>(null)
  const [tareas, setTareas] = useState<any[]>([])
  const [fase, setFase] = useState<'preview'|'ejecutar'|'post'|'resumen'>('preview')
  const [tareaActual, setTareaActual] = useState(0)
  const [resultados, setResultados] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(true)
  const [ejerciciosPorTarea, setEjerciciosPorTarea] = useState<Record<number, any[]>>({})
  const [guardando, setGuardando] = useState(false)
  const [tests, setTests] = useState<any>(null)

  // Post sesión
  const [rpe, setRpe] = useState(5)
  const [sensacion, setSensacion] = useState(3)
  const [dolor, setDolor] = useState(1)
  const [notasPost, setNotasPost] = useState('')
  const [fcMedia, setFcMedia] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: ses } = await supabase.from('sesion').select('*').eq('id', id).single()
    setSesion(ses)
    if (ses?.id_microciclo) {
      const { data: micro } = await supabase.from('microciclo').select('id_mesociclo').eq('id', ses.id_microciclo).single()
      if (micro) {
        const { data: meso } = await supabase.from('mesociclo').select('id_macrociclo').eq('id', micro.id_mesociclo).single()
        if (meso) {
          const { data: macro } = await supabase.from('macrociclo').select('id_deportista').eq('id', meso.id_macrociclo).single()
          if (macro) {
            const depId = macro.id_deportista
            const [t1, t2, t3] = await Promise.all([
              supabase.from('test1_carrera').select('vam').eq('id_deportista', depId).order('fecha', { ascending: false }).limit(1),
              supabase.from('test2_natacion').select('velocidad_critica_natacion').eq('id_deportista', depId).order('fecha', { ascending: false }).limit(1),
              supabase.from('test3_ciclismo').select('ftp').eq('id_deportista', depId).order('fecha', { ascending: false }).limit(1),
            ])
            setTests({ vam: t1.data?.[0]?.vam || null, css: t2.data?.[0]?.velocidad_critica_natacion || null, ftp: t3.data?.[0]?.ftp || null })
          }
        }
      }
    }
    const { data: tar } = await supabase.from('tarea').select('*, p_distancia(*), p_duracion(*), p_repeticiones(*), ejercicios(*)').eq('id_sesion', id).order('orden')
    setTareas(tar || [])
    // Cargar ejercicios de todas las tareas
    if (tar && tar.length > 0) {
      const tareaIds = tar.map((t: any) => t.id)
      const { data: ejs } = await supabase.from('ejercicios').select('*').in('id_tarea', tareaIds)
      const ejMap: Record<number, any[]> = {}
      tareaIds.forEach((tid: number) => { ejMap[tid] = [] })
      ejs?.forEach((e: any) => {
        if (!ejMap[e.id_tarea]) ejMap[e.id_tarea] = []
        ejMap[e.id_tarea].push(e)
      })
      setEjerciciosPorTarea(ejMap)
    }
    setLoading(false)
  }

  const [seriesFuerza, setSeriesFuerza] = useState<Record<number, any[]>>({})

  const updateSerieFuerza = (ejercicioId: number, numSerie: number, ejNum: number, campo: string, valor: any) => {
    setSeriesFuerza(prev => {
      const key = ejercicioId
      const arr = prev[key] ? [...prev[key]] : []
      const idx = arr.findIndex(s => s.numero_serie === numSerie && s.ejercicio_numero === ejNum)
      if (idx >= 0) arr[idx] = { ...arr[idx], [campo]: valor }
      else arr.push({ numero_serie: numSerie, ejercicio_numero: ejNum, [campo]: valor })
      return { ...prev, [key]: arr }
    })
  }

  const getSerieFuerza = (ejercicioId: number, numSerie: number, ejNum: number) => {
    return seriesFuerza[ejercicioId]?.find(s => s.numero_serie === numSerie && s.ejercicio_numero === ejNum) || {}
  }

  const updateResultado = (tareaId: number, campo: string, valor: string) => {
    setResultados(prev => ({ ...prev, [tareaId]: { ...prev[tareaId], [campo]: valor } }))
  }

  const guardarYCerrar = async () => {
    setGuardando(true)
    // Guardar series de fuerza
    for (const [ejId, series] of Object.entries(seriesFuerza)) {
      for (const serie of series) {
        await supabase.from('series_realizadas').insert({
          id_ejercicio: Number(ejId),
          numero_serie: serie.numero_serie,
          peso_real: serie.peso_real ? Number(serie.peso_real) : null,
          repeticiones_reales: serie.repeticiones_reales ? Number(serie.repeticiones_reales) : null,
          rir_real: serie.rir_real ? Number(serie.rir_real) : null,
          completada: serie.completada || false,
          ejercicio_numero: serie.ejercicio_numero || 1,
        })
      }
    }

    // Guardar resultados de cada tarea con detalle por series
    for (const tarea of tareas) {
      const r = resultados[tarea.id]
      if (!r) continue
      // Construir resumen de series
      const seriesData = Object.keys(r)
        .filter(k => k.startsWith('serie_'))
        .map((k, i) => {
          const s = r[k]
          const parts = []
          if (s.tiempo) parts.push('T:' + s.tiempo)
          if (s.metros) parts.push(s.metros + 'm')
          if (s.ritmo) parts.push(s.ritmo)
          if (s.sensacion) parts.push('S:' + s.sensacion + '/5')
          return 'S' + (i+1) + '[' + parts.join(' ') + ']'
        }).join(' | ')
      if (seriesData) {
        await supabase.from('tarea').update({
          sensacion_general: seriesData
        }).eq('id', tarea.id)
      }
      // Guardar métricas agregadas de la primera serie si existen
      const s0 = r['serie_0']
      if (s0) {
        if (tarea.p_distancia?.[0] && s0.metros) await supabase.from('p_distancia').update({ metros_reales: Number(s0.metros) }).eq('id_tarea', tarea.id)
        if (tarea.p_duracion?.[0] && s0.tiempo) await supabase.from('p_duracion').update({ tiempo_real: mmssASeg(s0.tiempo) }).eq('id_tarea', tarea.id)
      }
    }
    // Marcar sesión como realizada y guardar post-sesión
    await supabase.from('sesion').update({ estado: 'Realizada' }).eq('id', id)
    // Guardar RPE y sensación en la primera tarea
    if (tareas.length > 0) {
      await supabase.from('tarea').update({
        rpe_reportado: rpe,
        sensacion_tecnica: sensacion,
        dolor_muscular: dolor,
        notas_post: notasPost,
        fc_media: fcMedia ? Number(fcMedia) : null,
      }).eq('id_sesion', Number(id))
    }
    setFase('resumen')
    setGuardando(false)
  }

  const completarSinDatos = async () => {
    setGuardando(true)
    await supabase.from('sesion').update({ estado: 'Realizada' }).eq('id', id)
    setFase('post')
    setGuardando(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>
  if (!sesion) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Sesión no encontrada</div>

  const colorDisciplina = (d: string) => {
    if (d?.includes('Nat')) return 'bg-blue-600'
    if (d === 'Ciclismo') return 'bg-yellow-600'
    if (d === 'Carrera') return 'bg-green-600'
    return 'bg-orange-600'
  }

  const getTipoMedicion = (tarea: any) => {
    if (tarea.p_duracion?.[0]) return 'duracion'
    if (tarea.p_distancia?.[0]) return 'distancia'
    if (tarea.p_repeticiones?.[0]) return 'repeticiones'
    return null
  }

  const getObjetivo = (tarea: any) => {
    if (tarea.p_duracion?.[0]) return segAMmss(tarea.p_duracion[0].tiempo_planeado) + ' min'
    if (tarea.p_distancia?.[0]) {
      const m = tarea.p_distancia[0].metros_planeados
      return m >= 1000 ? (m/1000).toFixed(1) + ' km' : m + ' m'
    }
    if (tarea.p_repeticiones?.[0]) return tarea.p_repeticiones[0].repeticiones_planteadas + ' reps'
    return '—'
  }

  // VISTA PREVIA
  if (fase === 'preview') return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 px-4 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.history.back()} className="text-gray-400 text-sm">← Volver</button>
        <h1 className="text-orange-500 font-bold">TRIPULSE</h1>
        <div className="w-16" />
      </nav>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <div className="mb-6">
          <span className={'text-xs px-3 py-1 rounded-full text-white font-medium ' + colorDisciplina(sesion.disciplina)}>{sesion.disciplina}</span>
          <h2 className="text-2xl font-bold mt-2">{sesion.fecha_sesion}</h2>
          <div className="flex gap-4 text-gray-400 text-sm mt-1">
            {sesion.duracion_minutos && <span>⏱ {sesion.duracion_minutos} min</span>}
            {sesion.rpe_estimado && <span>💪 RPE est: {sesion.rpe_estimado}</span>}
          </div>
          {sesion.notas_entrenador && (
            <div className="bg-gray-900 rounded-xl p-4 mt-3 border border-gray-700">
              <p className="text-xs text-gray-500 mb-1">Notas del entrenador</p>
              <p className="text-gray-300 text-sm italic">"{sesion.notas_entrenador}"</p>
            </div>
          )}
        </div>

        <h3 className="font-bold text-lg mb-3">Plan de entrenamiento</h3>
        <div className="flex flex-col gap-3 mb-8">
          {tareas.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay tareas planificadas.</p>
          ) : tareas.map((t, i) => (
            <div key={t.id} className={'rounded-xl p-4 border ' + (COLOR_ZONA[t.zona_entrenamiento] || 'bg-gray-900 border-gray-700')}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-orange-400 font-bold text-sm">#{i+1}</span>
                  {t.zona_entrenamiento && <span className="text-xs bg-black bg-opacity-30 px-2 py-0.5 rounded-full">{t.zona_entrenamiento}</span>}
                </div>
                <span className="text-xs text-gray-400">{t.disciplina}</span>
              </div>
              <div className="flex gap-4 text-sm">
                {t.series && <span>🔁 {t.series} series</span>}
                <span>🎯 {getObjetivo(t)}</span>
                {t.descanso_segundos && <span>⏸ {segAMmss(t.descanso_segundos)}</span>}
              </div>
              {t.comentario && <p className="text-gray-400 text-xs mt-2">{t.comentario}</p>}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <button onClick={() => setFase('ejecutar')}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition">
            ▶ Iniciar entreno con registro
          </button>
          <button onClick={completarSinDatos} disabled={guardando}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-medium transition disabled:opacity-50">
            ✓ Entreno completado (sin registro)
          </button>
        </div>
      </div>
    </main>
  )

  // MODO EJECUCIÓN
  if (fase === 'ejecutar') {
    const tarea = tareas[tareaActual]
    if (!tarea) return null
    const tipo = getTipoMedicion(tarea)
    const r = resultados[tarea?.id] || {}
    const esUltima = tareaActual === tareas.length - 1

    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col">
        <nav className="bg-gray-900 px-4 py-4 flex justify-between items-center border-b border-gray-800">
          <button onClick={() => setFase('preview')} className="text-gray-400 text-sm">← Plan</button>
          <span className="text-orange-500 font-bold text-sm">{tareaActual + 1} / {tareas.length}</span>
          <button onClick={() => setFase('post')} className="text-gray-400 text-sm">Finalizar</button>
        </nav>

        {/* Barra de progreso */}
        <div className="h-1 bg-gray-800">
          <div className="h-1 bg-orange-500 transition-all" style={{ width: ((tareaActual + 1) / tareas.length * 100) + '%' }} />
        </div>

        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col">
          {/* Tarea actual */}
          <div className={'rounded-xl p-5 border mb-6 ' + (COLOR_ZONA[tarea?.zona_entrenamiento] || 'bg-gray-900 border-gray-700')}>
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-orange-400">Tarea {tareaActual + 1}</span>
              {tarea?.zona_entrenamiento && <span className="text-sm bg-black bg-opacity-40 px-3 py-1 rounded-full">{tarea.zona_entrenamiento}</span>}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {tarea?.series && (
                <div className="bg-black bg-opacity-30 rounded-lg p-2">
                  <p className="text-xs text-gray-400">Series</p>
                  <p className="font-bold text-lg">{tarea.series}</p>
                </div>
              )}
              <div className="bg-black bg-opacity-30 rounded-lg p-2">
                <p className="text-xs text-gray-400">Objetivo</p>
                <p className="font-bold text-lg">{getObjetivo(tarea)}</p>
              </div>
              {tarea?.descanso_segundos && (
                <div className="bg-black bg-opacity-30 rounded-lg p-2">
                  <p className="text-xs text-gray-400">Descanso</p>
                  <p className="font-bold text-lg">{segAMmss(tarea.descanso_segundos)}</p>
                </div>
              )}
            </div>
            {/* Ritmo / Potencia objetivo */}
            {(() => {
              const ritmoGuardado = tarea?.p_distancia?.[0]?.ritmo_objetivo || tarea?.p_duracion?.[0]?.ritmo_objetivo
              const ritmoCalculado = calcularRango(tarea?.zona_entrenamiento || '', tarea?.disciplina || sesion?.disciplina || '', tests)
              const ritmoMostrar = ritmoGuardado || ritmoCalculado
              if (!ritmoMostrar) return null
              return (
                <div className="mt-3 bg-black bg-opacity-30 rounded-lg px-4 py-2 flex justify-between items-center">
                  <p className="text-xs text-gray-400">
                    {(tarea?.disciplina || sesion?.disciplina) === 'Carrera' ? 'Ritmo objetivo' :
                     (tarea?.disciplina || sesion?.disciplina) === 'Ciclismo' ? 'Potencia objetivo' :
                     (tarea?.disciplina || sesion?.disciplina) === 'Natacion' ? 'Ritmo obj /100m' : 'Referencia'}
                  </p>
                  <p className="font-bold text-orange-300 text-lg">{ritmoMostrar}</p>
                </div>
              )
            })()}
            {tarea?.comentario && <p className="text-gray-300 text-sm mt-3 italic">{tarea.comentario}</p>}
          </div>

          {/* FUERZA: Registro por ejercicio y serie */}
          {tarea && (tarea.disciplina === 'Fuerza' || sesion.disciplina === 'Fuerza') && (
            <div className="flex flex-col gap-4 mb-6">
              <FuerzaRegistro
                tarea={tarea}
                ejercicios={ejerciciosPorTarea[tarea?.id] || []}
                seriesFuerza={seriesFuerza}
                updateSerieFuerza={updateSerieFuerza}
                getSerieFuerza={getSerieFuerza}
              />
            </div>
          )}

          {/* RESISTENCIA: Registro por series */}
          {tarea && tarea.disciplina !== 'Fuerza' && sesion.disciplina !== 'Fuerza' && (
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-6">
            <div className="flex justify-between items-center mb-4">
              <p className="font-medium text-gray-300">Registro por serie (opcional)</p>
              <span className="text-xs text-gray-500">{tarea?.series || 1} series</span>
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: tarea?.series || 1 }, (_, serieIdx) => {
                const serieKey = 'serie_' + serieIdx
                const serieData = r[serieKey] || {}
                const completada = serieData.completada
                return (
                  <div key={serieIdx} className={'rounded-xl p-4 border transition ' + (completada ? 'bg-green-900 border-green-600' : 'bg-gray-800 border-gray-700')}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-sm">Serie {serieIdx + 1}</span>
                      <button onClick={() => updateResultado(tarea.id, serieKey, { ...serieData, completada: !completada })}
                        className={'text-xs px-3 py-1 rounded-full transition ' + (completada ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
                        {completada ? '✓ Hecha' : 'Marcar'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {tipo === 'duracion' && (
                        <div>
                          <label className="text-gray-400 text-xs mb-1 block">Tiempo (mm:ss)</label>
                          <input type="text" placeholder={tarea?.p_duracion?.[0] ? segAMmss(tarea.p_duracion[0].tiempo_planeado) : '—'}
                            value={serieData.tiempo || ''}
                            onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, tiempo: e.target.value })}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm text-center outline-none focus:ring-1 focus:ring-orange-500" />
                        </div>
                      )}
                      {tipo === 'distancia' && (
                        <div>
                          <label className="text-gray-400 text-xs mb-1 block">Metros</label>
                          <input type="number" placeholder={tarea?.p_distancia?.[0]?.metros_planeados}
                            value={serieData.metros || ''}
                            onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, metros: e.target.value })}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm text-center outline-none focus:ring-1 focus:ring-orange-500" />
                        </div>
                      )}
                      <div>
                        <label className="text-gray-400 text-xs mb-1 flex justify-between">
                          <span>Ritmo / Potencia</span>
                          {(tarea?.p_distancia?.[0]?.ritmo_objetivo || tarea?.p_duracion?.[0]?.ritmo_objetivo) && (
                            <span className="text-orange-400 font-medium">Objetivo: {tarea?.p_distancia?.[0]?.ritmo_objetivo || tarea?.p_duracion?.[0]?.ritmo_objetivo}</span>
                          )}
                        </label>
                        <input type="text" placeholder={tarea?.p_distancia?.[0]?.ritmo_objetivo || tarea?.p_duracion?.[0]?.ritmo_objetivo || "Ritmo real"}
                          value={serieData.ritmo || ''}
                          onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, ritmo: e.target.value })}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-orange-500" />
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs mb-1 block">Sensación (1-5)</label>
                        <input type="number" min="1" max="5" placeholder="3"
                          value={serieData.sensacion || ''}
                          onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, sensacion: e.target.value })}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm text-center outline-none focus:ring-1 focus:ring-orange-500" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Resumen rápido */}
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-500">
                {Object.keys(r).filter(k => k.startsWith('serie_') && r[k]?.completada).length} / {tarea?.series || 1} series completadas
              </p>
            </div>
          </div>

          )}

          {/* Navegación tareas */}
          <div className="flex gap-3 mt-auto">
            {tareaActual > 0 && (
              <button onClick={() => setTareaActual(prev => prev - 1)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-xl font-medium transition">
                ← Anterior
              </button>
            )}
            {!esUltima ? (
              <button onClick={() => setTareaActual(prev => prev + 1)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold transition">
                Siguiente →
              </button>
            ) : (
              <button onClick={() => setFase('post')}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold transition">
                ✓ Finalizar entreno
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  // RESUMEN POST-SESIÓN
  if (fase === 'resumen') return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 px-4 py-4 flex items-center border-b border-gray-800">
        <h1 className="text-orange-500 font-bold mx-auto">Resumen de sesión</h1>
      </nav>
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {/* Cabecera */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-bold text-lg">¡Sesión completada!</p>
              <p className="text-gray-400 text-sm">{sesion.disciplina} · {sesion.fecha_sesion}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">RPE planificado</p>
              <p className="font-bold text-lg text-gray-300">{sesion.rpe_estimado || '—'}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">RPE real</p>
              <p className={'font-bold text-lg ' + (rpe > (sesion.rpe_estimado || 5) ? 'text-red-400' : rpe < (sesion.rpe_estimado || 5) ? 'text-green-400' : 'text-orange-400')}>{rpe}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">Sensación técnica</p>
              <p className="font-bold text-lg text-blue-400">{sensacion}/5</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">FC media</p>
              <p className="font-bold text-lg text-red-400">{fcMedia || '—'} ppm</p>
            </div>
          </div>
          {notasPost && (
            <div className="mt-3 bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-1">Tus notas</p>
              <p className="text-gray-300 text-sm italic">"{notasPost}"</p>
            </div>
          )}
        </div>

        {/* Tareas planificado vs real */}
        <h3 className="font-bold mb-3 text-gray-300">Tareas — Planificado vs Real</h3>
        <div className="flex flex-col gap-3 mb-6">
          {tareas.map((t, i) => {
            const r = resultados[t.id] || {}
            const pd = t.p_distancia?.[0]
            const pu = t.p_duracion?.[0]
            const pr = t.p_repeticiones?.[0]
            const s0 = r['serie_0'] || {}
            const seriesCompletadas = Object.keys(r).filter(k => k.startsWith('serie_') && r[k]?.completada).length
            const totalSeries = t.series || 1

            return (
              <div key={t.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-3 bg-gray-800 flex items-center gap-2">
                  <span className="text-orange-400 font-bold text-sm">#{i+1}</span>
                  {t.zona_entrenamiento && <span className="text-xs bg-black bg-opacity-30 px-2 py-0.5 rounded-full">{t.zona_entrenamiento}</span>}
                  <span className="text-gray-400 text-xs">{t.disciplina}</span>
                  {seriesCompletadas > 0 && (
                    <span className="ml-auto text-xs text-green-400">{seriesCompletadas}/{totalSeries} series ✓</span>
                  )}
                </div>
                <div className="p-4 grid grid-cols-2 gap-3">
                  {pd && (
                    <>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Distancia plan</p>
                        <p className="font-bold text-sm">{pd.metros_planeados ? pd.metros_planeados + 'm' : '—'}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Distancia real</p>
                        <p className={'font-bold text-sm ' + (s0.metros ? 'text-green-400' : 'text-gray-500')}>{s0.metros ? s0.metros + 'm' : '—'}</p>
                      </div>
                    </>
                  )}
                  {pd?.ritmo_objetivo && (
                    <>
                      <div className="bg-orange-950 border border-orange-800 rounded-lg p-2 text-center">
                        <p className="text-orange-400 text-xs">Ritmo objetivo</p>
                        <p className="font-bold text-sm text-white">{(() => { const s = pd.ritmo_objetivo; const m = Math.floor(s/60); const ss = s%60; return m+':'+(ss<10?'0':'')+ss })()}/km</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Ritmo real</p>
                        <p className={'font-bold text-sm ' + (s0.ritmo ? 'text-green-400' : 'text-gray-500')}>{s0.ritmo || '—'}</p>
                      </div>
                    </>
                  )}
                  {pu && (
                    <>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Duración plan</p>
                        <p className="font-bold text-sm">{pu.tiempo_planeado ? Math.floor(pu.tiempo_planeado/60)+'min' : '—'}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Duración real</p>
                        <p className={'font-bold text-sm ' + (s0.tiempo ? 'text-green-400' : 'text-gray-500')}>{s0.tiempo || '—'}</p>
                      </div>
                    </>
                  )}
                  {pr && (
                    <>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Reps plan</p>
                        <p className="font-bold text-sm">{pr.repeticiones_planteadas || '—'}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Series completadas</p>
                        <p className={'font-bold text-sm ' + (seriesCompletadas > 0 ? 'text-green-400' : 'text-gray-500')}>{seriesCompletadas}/{totalSeries}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={() => window.location.href = '/dashboard-deportista'}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition">
          Volver al panel →
        </button>
      </div>
    </main>
  )

  // POST SESIÓN
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 px-4 py-4 flex items-center border-b border-gray-800">
        <h1 className="text-orange-500 font-bold mx-auto">Post sesión</h1>
      </nav>
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <p className="text-gray-400 text-sm mb-6">¡Bien hecho! Registra cómo te has sentido.</p>

        <div className="flex flex-col gap-5">
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">RPE — Esfuerzo percibido</label>
              <span className="text-orange-400 font-bold text-xl">{rpe}</span>
            </div>
            <input type="range" min="1" max="10" value={rpe} onChange={e => setRpe(Number(e.target.value))} className="w-full accent-orange-500" />
            <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Muy fácil</span><span>Máximo</span></div>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">Sensación técnica</label>
              <span className="text-blue-400 font-bold text-xl">{sensacion}/5</span>
            </div>
            <input type="range" min="1" max="5" value={sensacion} onChange={e => setSensacion(Number(e.target.value))} className="w-full accent-blue-500" />
            <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Muy mala</span><span>Perfecta</span></div>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">Dolor muscular</label>
              <span className="text-yellow-400 font-bold text-xl">{dolor}/5</span>
            </div>
            <input type="range" min="1" max="5" value={dolor} onChange={e => setDolor(Number(e.target.value))} className="w-full accent-yellow-500" />
            <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Sin dolor</span><span>Mucho</span></div>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">FC media de la sesión (ppm)</label>
              <span className="text-red-400 font-bold text-xl">{fcMedia || '—'}</span>
            </div>
            <p className="text-gray-500 text-xs mb-3">Consulta tu reloj Garmin — dato necesario para calcular la carga real</p>
            <input
              type="number"
              placeholder="Ej: 148"
              value={fcMedia}
              onChange={e => setFcMedia(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500"
              min="40" max="220"
            />
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <label className="font-medium block mb-2">Notas (opcional)</label>
            <textarea value={notasPost} onChange={e => setNotasPost(e.target.value)} rows={3}
              placeholder="¿Cómo fue el entreno? ¿Algo que destacar?"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

          <button onClick={guardarYCerrar} disabled={guardando}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition disabled:opacity-50">
            {guardando ? 'Guardando...' : '✓ Guardar y finalizar'}
          </button>
        </div>
      </div>
    </main>
  )
}
