'use client'
import { useState, useEffect, use, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import TareasTabla from './tareas-tabla'
import SessionLoadChart from '@/components/SessionLoadChart'

export default function PaginaSesion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [sesion, setSesion] = useState<any>(null)
  const [tareas, setTareas] = useState<any[]>([])
  const [deportistaId, setDeportistaId] = useState<number | null>(null)
  const [esDeportista, setEsDeportista] = useState(false)
  const [vistaTabla, setVistaTabla] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarPostSesion, setMostrarPostSesion] = useState(false)
  const [zona, setZona] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [series, setSeries] = useState('')
  const [descanso, setDescanso] = useState('')
  const [comentario, setComentario] = useState('')
  const [tipoMedicion, setTipoMedicion] = useState('')
  const [metros, setMetros] = useState('')
  const [tiempo, setTiempo] = useState('')
  const [tiempoDisplay, setTiempoDisplay] = useState('')
  const [repeticiones, setRepeticiones] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cronometroActivo, setCronometroActivo] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [sesionIniciada, setSesionIniciada] = useState(false)
  const intervalRef = useRef<any>(null)
  const [rpeReal, setRpeReal] = useState(5)
  const [fcMedia, setFcMedia] = useState('')
  const [sensacionTecnica, setSensacionTecnica] = useState(3)
  const [dolorMuscular, setDolorMuscular] = useState(1)
  const [notasPost, setNotasPost] = useState('')
  const [hrvDia, setHrvDia] = useState('')
  const [ejerciciosBiblioteca, setEjerciciosBiblioteca] = useState<any[]>([])
  const [grupoMuscularSel, setGrupoMuscularSel] = useState('')
  const [ejercicioSel, setEjercicioSel] = useState<any>(null)
  const [repsFuerza, setRepsFuerza] = useState('')
  const [seriesFuerza, setSeriesFuerza] = useState('')
  const [descansoFuerza, setDescansoFuerza] = useState('')
  const [rir, setRir] = useState('')
  const [configSerie, setConfigSerie] = useState('')
  const [modalVideoFuerza, setModalVideoFuerza] = useState<string | null>(null)
  const mmssASegundos = (str: string): number => {
    const partes = str.split(':')
    if (partes.length === 2) {
      const min = parseInt(partes[0]) || 0
      const seg = parseInt(partes[1]) || 0
      return min * 60 + seg
    }
    return parseInt(str) || 0
  }

  const formatearMmss = (str: string): string => {
    const limpio = str.replace(/[^0-9:]/g, '')
    if (limpio.includes(':')) return limpio
    if (limpio.length >= 3) {
      const min = limpio.slice(0, -2)
      const seg = limpio.slice(-2)
      return min + ':' + seg
    }
    return limpio
  }

  const mostrarMedicion = (t: any): string => {
    if (t.p_duracion?.[0]?.tiempo_planeado) {
      const seg = t.p_duracion[0].tiempo_planeado
      const min = Math.floor(seg / 60)
      const s = seg % 60
      return s > 0 ? min + ':' + String(s).padStart(2,'0') + ' min' : min + ' min'
    }
    if (t.p_distancia?.[0]?.metros_planeados) {
      const m = t.p_distancia[0].metros_planeados
      return m >= 1000 ? (m/1000).toFixed(1) + ' km' : m + ' m'
    }
    if (t.p_repeticiones?.[0]?.repeticiones_planteadas) {
      return t.p_repeticiones[0].repeticiones_planteadas + ' reps'
    }
    return ''
  }

  useEffect(() => { cargarDatos() }, [id])

  useEffect(() => {
    if (cronometroActivo) {
      intervalRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [cronometroActivo])

  const cargarDatos = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
      setEsDeportista(p?.rol === 'deportista')
    }
    const { data: ses } = await supabase.from('sesion').select('*').eq('id', id).single()
    setSesion(ses)
    const { data: tar } = await supabase.from('tarea').select('*, p_duracion(tiempo_planeado), p_distancia(metros_planeados)').eq('id_sesion', id).order('orden')
    setTareas(tar || [])
    if (ses) {
      const { data: micro } = await supabase.from('microciclo').select('id_mesociclo').eq('id', ses.id_microciclo).single()
      if (micro) {
        const { data: meso } = await supabase.from('mesociclo').select('id_macrociclo').eq('id', micro.id_mesociclo).single()
        if (meso) {
          const { data: macro } = await supabase.from('macrociclo').select('id_deportista').eq('id', meso.id_macrociclo).single()
          if (macro) setDeportistaId(macro.id_deportista)
        }
      }
    }
  }

  const formatTiempo = (seg: number) => {
    const h = Math.floor(seg/3600)
    const m = Math.floor((seg%3600)/60)
    const s = seg%60
    if (h > 0) return h+':'+m.toString().padStart(2,'0')+':'+s.toString().padStart(2,'0')
    return m.toString().padStart(2,'0')+':'+s.toString().padStart(2,'0')
  }

  const iniciarSesion = async () => {
    setSesionIniciada(true)
    if (sesion.usar_cronometro) setCronometroActivo(true)
    await supabase.from('sesion').update({ hora_inicio: new Date().toISOString() }).eq('id', id)
  }

  const finalizarSesion = () => {
    setCronometroActivo(false)
    setMostrarPostSesion(true)
  }

  const guardarPostSesion = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const duracionReal = sesion.usar_cronometro ? Math.round(segundos/60) : null
    await supabase.from('sesion').update({ estado: 'Realizada', duracion_real: duracionReal }).eq('id', id)
    await supabase.from('tarea').update({
      rpe_reportado: rpeReal,
      fc_media: fcMedia ? Number(fcMedia) : null,
      sensacion_tecnica: sensacionTecnica,
      dolor_muscular: dolorMuscular,
      notas_post: notasPost,
      hrv_del_dia: hrvDia ? Number(hrvDia) : null
    }).eq('id_sesion', id)
    await cargarDatos()
    setMostrarPostSesion(false)
    setLoading(false)
    if (esDeportista) window.location.href = '/dashboard-deportista'
  }

  const crearTareaFuerza = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ejercicioSel) return
    setLoading(true)
    setError('')
    const orden = tareas.length + 1
    const { data: tarea, error: errorTarea } = await supabase.from('tarea').insert({
      id_sesion: Number(id),
      zona_entrenamiento: null,
      disciplina: 'Fuerza',
      series: seriesFuerza ? Number(seriesFuerza) : null,
      descanso_segundos: descansoFuerza ? Number(descansoFuerza) : null,
      comentario: configSerie || null,
      orden
    }).select().single()
    if (errorTarea) { setError('Error: ' + errorTarea.message); setLoading(false); return }
    if (tarea) {
      await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre_ejercicio: ejercicioSel.nombre,
        grupo_muscular: ejercicioSel.grupo_muscular,
        series: seriesFuerza ? Number(seriesFuerza) : null,
        repeticiones: repsFuerza ? Number(repsFuerza) : null,
        descanso: descansoFuerza ? Number(descansoFuerza) : null,
        notas_ejecucion: (rir ? 'RIR: ' + rir : '') + (configSerie ? ' · ' + configSerie : ''),
        url_video: ejercicioSel.url_video || null
      })
    }
    const tareaLocal = {
      ...tarea,
      p_duracion: [],
      p_distancia: [],
      p_repeticiones: repsFuerza ? [{ repeticiones_planteadas: Number(repsFuerza) }] : [],
    }
    setTareas(prev => [...prev, tareaLocal])
    setGrupoMuscularSel(''); setEjercicioSel(null); setRepsFuerza('')
    setSeriesFuerza(''); setDescansoFuerza(''); setRir(''); setConfigSerie('')
    setMostrarForm(false)
    setLoading(false)
  }

  const crearTarea = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const orden = tareas.length + 1
    const { data: tarea, error: errorTarea } = await supabase.from('tarea').insert({
      id_sesion: Number(id),
      zona_entrenamiento: zona,
      disciplina: disciplina || null,
      series: series ? Number(series) : null,
      descanso_segundos: descanso ? Number(descanso) : null,
      comentario,
      orden
    }).select().single()
    if (errorTarea) { setError('Error: ' + errorTarea.message); setLoading(false); return }
    if (tipoMedicion === 'distancia' && tarea) await supabase.from('p_distancia').insert({ id_tarea: tarea.id, metros_planeados: Number(metros) })
    else if (tipoMedicion === 'duracion' && tarea) await supabase.from('p_duracion').insert({ id_tarea: tarea.id, tiempo_planeado: mmssASegundos(tiempoDisplay) })
    else if (tipoMedicion === 'repeticiones' && tarea) await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: Number(repeticiones) })
    setZona(''); setDisciplina(''); setSeries(''); setDescanso(''); setComentario('')
    const _tipo = tipoMedicion; const _metros = metros; const _tiempo = tiempo; const _reps = repeticiones
    setTipoMedicion(''); setMetros(''); setTiempo(''); setTiempoDisplay(''); setRepeticiones('')
    setMostrarForm(false)
    const tareaLocal = {
      ...tarea,
      p_duracion: _tipo === 'duracion' ? [{ tiempo_planeado: Number(_tiempo) }] : [],
      p_distancia: _tipo === 'distancia' ? [{ metros_planeados: Number(_metros) }] : [],
      p_repeticiones: _tipo === 'repeticiones' ? [{ repeticiones_planteadas: Number(_reps) }] : [],
    }
    setTareas(prev => { const next = [...prev, tareaLocal]; console.log("tareas actualizadas:", next.length); return next; })
    setLoading(false)
  }

  const colorDisciplina = (d: string) => {
    if (!d) return 'bg-gray-700 text-gray-300'
    if (d.includes('Nat')) return 'bg-blue-900 text-blue-300'
    if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
    if (d === 'Carrera') return 'bg-green-900 text-green-300'
    if (d === 'Fuerza') return 'bg-red-900 text-red-300'
    return 'bg-purple-900 text-purple-300'
  }

  if (!sesion) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/microciclo/' + sesion.id_microciclo} className="text-gray-400 hover:text-white text-sm transition">← Semana</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className={'text-xs px-2 py-1 rounded-full font-medium ' + colorDisciplina(sesion.disciplina)}>{sesion.disciplina}</span>
            <span className={'text-xs px-2 py-1 rounded-full ' + (sesion.estado === 'Realizada' ? 'bg-green-900 text-green-300' : sesion.estado === 'Cancelada' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300')}>{sesion.estado}</span>
            {sesion.usar_cronometro && <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">⏱ Cronometro</span>}
          </div>
          <h2 className="text-2xl font-bold">{sesion.fecha_sesion}</h2>
          <p className="text-gray-400 text-sm mt-1">{sesion.duracion_minutos ? sesion.duracion_minutos + ' min' : '—'} · RPE est: {sesion.rpe_estimado || '—'}</p>
          {sesion.notas_entrenador && <p className="text-gray-300 text-sm mt-2 italic bg-gray-800 rounded-lg px-3 py-2">"{sesion.notas_entrenador}"</p>}
        </div>

        {sesion.estado !== 'Realizada' && esDeportista && (
          <div className="mb-6">
            {!sesionIniciada ? (
              <button onClick={iniciarSesion} className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold text-lg transition">▶ Iniciar sesion</button>
            ) : (
              <div className="bg-gray-900 rounded-xl p-6 border border-green-500">
                {sesion.usar_cronometro && (
                  <div className="text-center mb-4">
                    <p className="text-gray-400 text-sm mb-1">Tiempo transcurrido</p>
                    <p className="text-5xl font-bold text-green-400 font-mono">{formatTiempo(segundos)}</p>
                  </div>
                )}
                <button onClick={finalizarSesion} className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition">✓ Finalizar sesion</button>
              </div>
            )}
          </div>
        )}

        {sesion.estado === 'Realizada' && (
          <div className="bg-green-900 border border-green-500 rounded-xl p-4 mb-6 text-center">
            <p className="text-green-300 font-bold">✓ Sesion completada</p>
            {sesion.duracion_real && <p className="text-green-400 text-sm">{sesion.duracion_real} min realizados</p>}
          </div>
        )}

        {mostrarPostSesion && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-orange-500 max-h-screen overflow-y-auto">
              <h3 className="text-xl font-bold mb-4">Post-sesion — Como fue?</h3>
              {sesion.usar_cronometro && <p className="text-green-400 text-sm mb-4">Duracion: {formatTiempo(segundos)} ({Math.round(segundos/60)} min)</p>}
              <form onSubmit={guardarPostSesion} className="flex flex-col gap-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">RPE real</label><span className="text-orange-400 font-bold">{rpeReal}/10</span></div>
                  <input type="range" min={1} max={10} value={rpeReal} onChange={e => setRpeReal(Number(e.target.value))} className="w-full accent-orange-500" />
                  <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Muy facil</span><span>Maximo</span></div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4">
                  <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">Sensacion tecnica</label><span className="text-orange-400 font-bold">{sensacionTecnica}/5</span></div>
                  <input type="range" min={1} max={5} value={sensacionTecnica} onChange={e => setSensacionTecnica(Number(e.target.value))} className="w-full accent-orange-500" />
                  <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Muy mala</span><span>Excelente</span></div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4">
                  <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">Dolor muscular</label><span className="text-orange-400 font-bold">{dolorMuscular}/5</span></div>
                  <input type="range" min={1} max={5} value={dolorMuscular} onChange={e => setDolorMuscular(Number(e.target.value))} className="w-full accent-orange-500" />
                  <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Sin dolor</span><span>Mucho</span></div>
                </div>
                <input type="number" placeholder="FC media (ppm) — opcional" value={fcMedia} onChange={e => setFcMedia(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <input type="number" placeholder="HRV del dia (ms) — opcional" value={hrvDia} onChange={e => setHrvDia(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Notas (opcional)" value={notasPost} onChange={e => setNotasPost(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={3} />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-bold transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar y finalizar'}</button>
              </form>
            </div>
          </div>
        )}

        

        <SessionLoadChart tareas={tareas} />

        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Tareas</h3>
          <div className="flex gap-2">
            <button onClick={() => setVistaTabla(false)} className={'px-3 py-2 rounded-lg text-sm transition ' + (!vistaTabla ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>📋 Formulario</button>
            <button onClick={() => setVistaTabla(true)} className={'px-3 py-2 rounded-lg text-sm transition ' + (vistaTabla ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>📊 Tabla</button>
          </div>
        </div>

        {vistaTabla && deportistaId ? (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <TareasTabla sesionId={Number(id)} deportistaId={deportistaId} disciplinaSesion={sesion.disciplina} esDeportista={esDeportista} />
          </div>
        ) : (
          <div>
            {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
            {sesion.estado !== 'Realizada' && !esDeportista && (
              <div className="mb-4">
                <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
                  {mostrarForm ? 'Cancelar' : '+ Nueva tarea'}
                </button>
              </div>
            )}
            {mostrarForm && !esDeportista && sesion.disciplina === 'Fuerza' && (
              <form onSubmit={crearTareaFuerza} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
                <h4 className="font-bold">Nuevo ejercicio de fuerza</h4>
                <select value={grupoMuscularSel} onChange={e => { setGrupoMuscularSel(e.target.value); setEjercicioSel(null) }} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Grupo muscular</option>
                  {[...new Set(ejerciciosBiblioteca.map(e => e.grupo_muscular))].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {grupoMuscularSel && (
                  <div>
                    <select value={ejercicioSel?.id || ''} onChange={e => setEjercicioSel(ejerciciosBiblioteca.find(ej => ej.id === Number(e.target.value)) || null)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required>
                      <option value="">Selecciona ejercicio</option>
                      {ejerciciosBiblioteca.filter(ej => ej.grupo_muscular === grupoMuscularSel).map(ej => <option key={ej.id} value={ej.id}>{ej.nombre}</option>)}
                    </select>
                    {ejercicioSel?.url_video && (
                      <button type="button" onClick={() => setModalVideoFuerza(ejercicioSel.url_video)} className="mt-2 flex items-center gap-2 text-red-400 hover:text-red-300 text-sm transition">
                        <span>▶</span> Ver video del ejercicio
                      </button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Series" value={seriesFuerza} onChange={e => setSeriesFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                  <input type="number" placeholder="Repeticiones" value={repsFuerza} onChange={e => setRepsFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Descanso (seg)" value={descansoFuerza} onChange={e => setDescansoFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  <input type="number" placeholder="RIR (0-4)" min="0" max="4" value={rir} onChange={e => setRir(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <input type="text" placeholder="Configuración de serie (ej: 4x8, pirámide, cluster...)" value={configSerie} onChange={e => setConfigSerie(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <button type="submit" disabled={loading || !ejercicioSel} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar ejercicio'}</button>
              </form>
            )}

            {mostrarForm && !esDeportista && sesion.disciplina !== 'Fuerza' && (
              <form onSubmit={crearTarea} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
                <h4 className="font-bold">Nueva tarea</h4>
                <input type="text" placeholder="Zona (ej: Z2, Z4)" value={zona} onChange={e => setZona(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <select value={disciplina} onChange={e => setDisciplina(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Disciplina (opcional)</option>
                  <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option>
                </select>
                <input type="number" placeholder="Series" value={series} onChange={e => setSeries(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <input type="number" placeholder="Descanso (seg)" value={descanso} onChange={e => setDescanso(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <select value={tipoMedicion} onChange={e => setTipoMedicion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Tipo de medicion</option>
                  <option value="distancia">Distancia (m)</option>
                  <option value="duracion">Duracion (seg)</option>
                  <option value="repeticiones">Repeticiones</option>
                </select>
                {tipoMedicion === 'distancia' && <input type="number" placeholder="Metros" value={metros} onChange={e => setMetros(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
                {tipoMedicion === 'duracion' && (
                <div>
                  <input
                    type="text"
                    placeholder="Duración mm:ss (ej: 10:30)"
                    value={tiempoDisplay}
                    onChange={e => {
                      const val = formatearMmss(e.target.value)
                      setTiempoDisplay(val)
                      setTiempo(String(mmssASegundos(val)))
                    }}
                    className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full font-mono"
                    maxLength={6}
                  />
                  {tiempoDisplay && tiempoDisplay.includes(':') && (
                    <p className="text-gray-500 text-xs mt-1">{mmssASegundos(tiempoDisplay)} segundos</p>
                  )}
                </div>
              )}
                {tipoMedicion === 'repeticiones' && <input type="number" placeholder="Repeticiones" value={repeticiones} onChange={e => setRepeticiones(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
                <textarea placeholder="Comentario" value={comentario} onChange={e => setComentario(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar tarea'}</button>
              </form>
            )}
            {tareas.length === 0 ? (
              <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">📋</div><p>No hay tareas todavia.</p></div>
            ) : (
              <div className="grid gap-3">
                {tareas.map((t, i) => (
                  <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <div className="flex items-start gap-3">
                      <span className="bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{i+1}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {t.zona_entrenamiento && <span className="text-orange-400 font-bold text-sm">{t.zona_entrenamiento}</span>}
                          {t.disciplina && <span className={'text-xs px-2 py-0.5 rounded-full ' + colorDisciplina(t.disciplina)}>{t.disciplina}</span>}
                        </div>
                        <p className="text-gray-300 text-sm">{t.series ? t.series+' series' : ''}{t.series && t.descanso_segundos ? ' · '+t.descanso_segundos+'s' : ''}</p>
                        {mostrarMedicion(t) && <p className="text-blue-400 text-sm font-medium">{mostrarMedicion(t)}</p>}
                        {t.comentario && <p className="text-gray-400 text-sm mt-1">{t.comentario}</p>}
                        {t.rpe_reportado && <p className="text-green-400 text-xs mt-2">✓ RPE: {t.rpe_reportado}/10 · Sensacion: {t.sensacion_tecnica}/5</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {modalVideoFuerza && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md border border-gray-700 p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <p className="font-medium">Video del ejercicio</p>
              <button onClick={() => setModalVideoFuerza(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="text-6xl mb-4">▶️</div>
            <a href={modalVideoFuerza} target="_blank" rel="noopener noreferrer"
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition inline-flex items-center gap-2">
              <span>▶</span> Ver en YouTube
            </a>
          </div>
        </div>
      )}
    </main>
  )
}
