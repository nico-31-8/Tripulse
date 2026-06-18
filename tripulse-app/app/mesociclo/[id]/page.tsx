'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

const DISCIPLINAS = [
  { key: 'Natacion', icono: '🏊', color: 'text-blue-400' },
  { key: 'Ciclismo', icono: '🚴', color: 'text-yellow-400' },
  { key: 'Carrera', icono: '🏃', color: 'text-green-400' },
]

export default function PaginaMesociclo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [mesociclo, setMesociclo] = useState<any>(null)
  const [microciclos, setMicrociclos] = useState<any[]>([])
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [valoraciones, setValoraciones] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarValoraciones, setMostrarValoraciones] = useState(false)
  const [objetivo, setObjetivo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [tipo, setTipo] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingVal, setLoadingVal] = useState(false)
  const [error, setError] = useState('')
  const [errorVal, setErrorVal] = useState('')
  // valoraciones pendientes: { [depId_disciplina]: { valoracion, notas } }
  const [draft, setDraft] = useState<Record<string, { valoracion: number; notas: string }>>({})

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: meso } = await supabase.from('mesociclo').select('*').eq('id', id).single()
    setMesociclo(meso)
    const { data: micro } = await supabase.from('microciclo').select('*').eq('id_mesociclo', id).order('fecha_inicio', { ascending: true })
    setMicrociclos(micro || [])
    if (meso) {
      // Cargar deportistas del macrociclo
      const { data: macro } = await supabase.from('macrociclo').select('id_deportista').eq('id', meso.id_macrociclo).single()
      if (macro) {
        const { data: dep } = await supabase.from('deportista').select('id, nombre').eq('id', macro.id_deportista)
        setDeportistas(dep || [])
      }
    }
    const { data: vals } = await supabase.from('valoracion_tecnica_mesociclo').select('*').eq('id_mesociclo', id)
    setValoraciones(vals || [])
    // Inicializar draft con valores existentes
    const initDraft: Record<string, { valoracion: number; notas: string }> = {}
    ;(vals || []).forEach((v: any) => {
      initDraft[`${v.id_deportista}_${v.disciplina}`] = { valoracion: v.valoracion, notas: v.notas || '' }
    })
    setDraft(initDraft)
  }

  const crearMicrociclo = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.from('microciclo').insert({
      id_mesociclo: Number(id),
      objetivo,
      fecha_inicio: fechaInicio,
      duracion_dias: 7,
      tipo
    })
    if (error) { setError('Error: ' + error.message) }
    else { setObjetivo(''); setFechaInicio(''); setTipo(''); setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  const guardarValoraciones = async () => {
    setLoadingVal(true)
    setErrorVal('')
    for (const dep of deportistas) {
      for (const disc of DISCIPLINAS) {
        const key = `${dep.id}_${disc.key}`
        if (!draft[key]) continue
        const { valoracion, notas } = draft[key]
        // Buscar si ya existe
        const existe = valoraciones.find(v => v.id_deportista === dep.id && v.disciplina === disc.key)
        if (existe) {
          await supabase.from('valoracion_tecnica_mesociclo').update({ valoracion, notas }).eq('id', existe.id)
        } else {
          await supabase.from('valoracion_tecnica_mesociclo').insert({ id_mesociclo: Number(id), id_deportista: dep.id, disciplina: disc.key, valoracion, notas })
        }
      }
    }
    await cargarDatos()
    setLoadingVal(false)
    setMostrarValoraciones(false)
  }

  const getValoracion = (depId: number, disciplina: string) => {
    const key = `${depId}_${disciplina}`
    return draft[key] || { valoracion: 3, notas: '' }
  }

  const setDraftVal = (depId: number, disciplina: string, campo: string, valor: any) => {
    const key = `${depId}_${disciplina}`
    setDraft(prev => ({ ...prev, [key]: { ...( prev[key] || { valoracion: 3, notas: '' }), [campo]: valor } }))
  }

  if (!mesociclo) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        <a href={`/macrociclo/${mesociclo.id_macrociclo}`} className="text-gray-400 hover:text-white text-sm transition">← Macrociclo</a>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Cabecera mesociclo */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">{mesociclo.objetivo}</h2>
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{mesociclo.tipo}</span>
          </div>
          <p className="text-gray-400 text-sm">Inicio: {mesociclo.fecha_inicio} · {mesociclo.duracion_semanas} semanas · Intensidad: {mesociclo.intensidad_relativa || '—'}/10</p>
        </div>

        {/* Sección valoración técnica */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 mb-8 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div>
              <h3 className="font-bold text-lg">Valoración técnica del entrenador</h3>
              <p className="text-gray-500 text-xs mt-0.5">Una valoración por disciplina al cierre del mesociclo — alimenta el Factor F1 del SICAT</p>
            </div>
            <button
              onClick={() => setMostrarValoraciones(!mostrarValoraciones)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-orange-500 text-gray-300 hover:text-white text-sm px-4 py-2 rounded-lg transition"
            >
              {mostrarValoraciones ? 'Cerrar' : valoraciones.length > 0 ? 'Editar' : 'Valorar'}
            </button>
          </div>

          {/* Resumen de valoraciones existentes */}
          {!mostrarValoraciones && valoraciones.length > 0 && (
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 gap-4">
                {deportistas.map(dep => (
                  <div key={dep.id}>
                    <p className="text-sm font-semibold text-gray-300 mb-2">{dep.nombre}</p>
                    <div className="grid grid-cols-3 gap-3">
                      {DISCIPLINAS.map(disc => {
                        const val = valoraciones.find(v => v.id_deportista === dep.id && v.disciplina === disc.key)
                        return (
                          <div key={disc.key} className="bg-gray-800 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">{disc.icono} {disc.key}</p>
                            {val ? (
                              <>
                                <p className={`text-xl font-bold ${disc.color}`}>{val.valoracion}<span className="text-gray-500 text-sm font-normal">/5</span></p>
                                {val.notas && <p className="text-gray-500 text-xs mt-1 truncate">{val.notas}</p>}
                              </>
                            ) : (
                              <p className="text-gray-600 text-sm">Sin valorar</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!mostrarValoraciones && valoraciones.length === 0 && (
            <div className="px-6 py-5 text-center text-gray-600 text-sm">
              Aún no hay valoraciones técnicas para este mesociclo.
            </div>
          )}

          {/* Formulario de valoración */}
          {mostrarValoraciones && (
            <div className="px-6 py-5 flex flex-col gap-6">
              {errorVal && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm">{errorVal}</div>}
              {deportistas.map(dep => (
                <div key={dep.id}>
                  <p className="font-semibold text-gray-200 mb-3">{dep.nombre}</p>
                  <div className="flex flex-col gap-4">
                    {DISCIPLINAS.map(disc => {
                      const val = getValoracion(dep.id, disc.key)
                      return (
                        <div key={disc.key} className="bg-gray-800 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span>{disc.icono}</span>
                            <span className={`font-semibold text-sm ${disc.color}`}>{disc.key}</span>
                            <span className="ml-auto text-orange-400 font-bold text-lg">{val.valoracion}/5</span>
                          </div>
                          <input
                            type="range" min={1} max={5} value={val.valoracion}
                            onChange={e => setDraftVal(dep.id, disc.key, 'valoracion', Number(e.target.value))}
                            className="w-full accent-orange-500 mb-2"
                          />
                          <div className="flex justify-between text-gray-500 text-xs mb-3">
                            <span>Técnica muy deficiente</span>
                            <span>Técnica excelente</span>
                          </div>
                          <input
                            type="text"
                            placeholder="Notas (opcional)"
                            value={val.notas}
                            onChange={e => setDraftVal(dep.id, disc.key, 'notas', e.target.value)}
                            className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <button
                onClick={guardarValoraciones}
                disabled={loadingVal}
                className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50 text-sm"
              >
                {loadingVal ? 'Guardando...' : 'Guardar valoraciones'}
              </button>
            </div>
          )}
        </div>

        {/* Semanas */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Semanas</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nueva semana'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {mostrarForm && (
          <form onSubmit={crearMicrociclo} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Nueva semana</h4>
            <input type="text" placeholder="Objetivo de la semana" value={objetivo} onChange={e => setObjetivo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
              <option value="">Tipo de semana</option>
              <option value="Carga">Carga</option>
              <option value="Recuperación">Recuperacion</option>
              <option value="Competición">Competicion</option>
            </select>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Fecha de inicio</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required />
            </div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar semana'}</button>
          </form>
        )}
        {microciclos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">📆</div>
            <p>No hay semanas todavia. Crea la primera.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {microciclos.map((m, i) => (
              <a key={m.id} href={`/microciclo/${m.id}`} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition block">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-lg">Semana {i + 1} — {m.objetivo}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.tipo === 'Carga' ? 'bg-orange-900 text-orange-300' : m.tipo === 'Recuperación' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>{m.tipo}</span>
                    </div>
                    <p className="text-gray-400 text-sm">Inicio: {m.fecha_inicio}</p>
                  </div>
                  <span className="text-orange-500 text-sm">Ver sesiones →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
