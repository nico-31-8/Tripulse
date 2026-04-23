'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

export default function PaginaSesion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [sesion, setSesion] = useState<any>(null)
  const [tareas, setTareas] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [zona, setZona] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [series, setSeries] = useState('')
  const [descanso, setDescanso] = useState('')
  const [comentario, setComentario] = useState('')
  const [tipoMedicion, setTipoMedicion] = useState('')
  const [metros, setMetros] = useState('')
  const [tiempo, setTiempo] = useState('')
  const [repeticiones, setRepeticiones] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: ses } = await supabase.from('sesion').select('*').eq('id', id).single()
    setSesion(ses)
    const { data: tar } = await supabase.from('tarea').select('*').eq('id_sesion', id).order('orden', { ascending: true })
    setTareas(tar || [])
  }

  const crearTarea = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const orden = tareas.length + 1
    const { data: tarea, error: errorTarea } = await supabase.from('tarea').insert({
      id_sesion: Number(id),
      zona_entrenamiento: zona,
      disciplina,
      series: series ? Number(series) : null,
      descanso_segundos: descanso ? Number(descanso) : null,
      comentario,
      orden
    }).select().single()

    if (errorTarea) { setError('Error: ' + errorTarea.message); setLoading(false); return }

    if (tipoMedicion === 'distancia' && tarea) {
      await supabase.from('p_distancia').insert({ id_tarea: tarea.id, metros_planeados: Number(metros) })
    } else if (tipoMedicion === 'duracion' && tarea) {
      await supabase.from('p_duracion').insert({ id_tarea: tarea.id, tiempo_planeado: Number(tiempo) })
    } else if (tipoMedicion === 'repeticiones' && tarea) {
      await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: Number(repeticiones) })
    }

    setZona(''); setDisciplina(''); setSeries(''); setDescanso(''); setComentario('')
    setTipoMedicion(''); setMetros(''); setTiempo(''); setRepeticiones('')
    setMostrarForm(false)
    cargarDatos()
    setLoading(false)
  }

  const colorDisciplina = (d: string) => {
    if (d === 'Natacion') return 'bg-blue-900 text-blue-300'
    if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
    if (d === 'Carrera') return 'bg-green-900 text-green-300'
    if (d === 'Fuerza') return 'bg-red-900 text-red-300'
    return 'bg-purple-900 text-purple-300'
  }

  if (!sesion) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <a href={`/microciclo/${sesion.id_microciclo}`} className="text-gray-400 hover:text-white text-sm transition">← Semana</a>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${colorDisciplina(sesion.disciplina)}`}>{sesion.disciplina}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${sesion.estado === 'Realizada' ? 'bg-green-900 text-green-300' : sesion.estado === 'Cancelada' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}`}>{sesion.estado}</span>
              </div>
              <h2 className="text-2xl font-bold mt-2">{sesion.fecha_sesion}</h2>
              <p className="text-gray-400 text-sm mt-1">{sesion.duracion_minutos ? `${sesion.duracion_minutos} min` : '—'} · RPE estimado: {sesion.rpe_estimado || '—'}</p>
              {sesion.notas_entrenador && <p className="text-gray-300 text-sm mt-2 italic">"{sesion.notas_entrenador}"</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Tareas</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nueva tarea'}
          </button>
        </div>

        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {mostrarForm && (
          <form onSubmit={crearTarea} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Nueva tarea</h4>
            <input type="text" placeholder="Zona de entrenamiento (ej: Z2, Z4)" value={zona} onChange={e => setZona(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
            <select value={disciplina} onChange={e => setDisciplina(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Disciplina (opcional)</option>
              <option value="Natacion">Natacion</option>
              <option value="Ciclismo">Ciclismo</option>
              <option value="Carrera">Carrera</option>
              <option value="Fuerza">Fuerza</option>
            </select>
            <input type="number" placeholder="Series (opcional)" value={series} onChange={e => setSeries(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
            <input type="number" placeholder="Descanso entre series (segundos)" value={descanso} onChange={e => setDescanso(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
            <select value={tipoMedicion} onChange={e => setTipoMedicion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Tipo de medicion</option>
              <option value="distancia">Distancia (metros)</option>
              <option value="duracion">Duracion (segundos)</option>
              <option value="repeticiones">Repeticiones</option>
            </select>
            {tipoMedicion === 'distancia' && <input type="number" placeholder="Metros planificados" value={metros} onChange={e => setMetros(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
            {tipoMedicion === 'duracion' && <input type="number" placeholder="Tiempo planificado (segundos)" value={tiempo} onChange={e => setTiempo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
            {tipoMedicion === 'repeticiones' && <input type="number" placeholder="Repeticiones planificadas" value={repeticiones} onChange={e => setRepeticiones(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
            <textarea placeholder="Comentario o instrucciones" value={comentario} onChange={e => setComentario(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar tarea'}</button>
          </form>
        )}

        {tareas.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">📋</div>
            <p>No hay tareas todavia. Añade la primera.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tareas.map((t, i) => (
              <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex items-start gap-3">
                  <span className="bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {t.zona_entrenamiento && <span className="text-orange-400 font-bold text-sm">{t.zona_entrenamiento}</span>}
                      {t.disciplina && <span className={`text-xs px-2 py-0.5 rounded-full ${colorDisciplina(t.disciplina)}`}>{t.disciplina}</span>}
                    </div>
                    <p className="text-gray-300 text-sm">
                      {t.series ? `${t.series} series` : ''}{t.series && t.descanso_segundos ? ` · ${t.descanso_segundos}s descanso` : ''}
                    </p>
                    {t.comentario && <p className="text-gray-400 text-sm mt-1">{t.comentario}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
