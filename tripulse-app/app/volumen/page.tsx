'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const RANGOS = [
  { label: '2 sem', dias: 14 },
  { label: '4 sem', dias: 28 },
  { label: '8 sem', dias: 56 },
  { label: 'Todo', dias: 365 },
]

const DISCS = [
  { key: 'Natacion', label: 'Natación', color: '#60a5fa', unidad: 'm' },
  { key: 'Ciclismo', label: 'Ciclismo', color: '#fbbf24', unidad: 'km' },
  { key: 'Carrera', label: 'Carrera', color: '#4ade80', unidad: 'km' },
  { key: 'Fuerza', label: 'Fuerza', color: '#f87171', unidad: 'UA' },
]

const tooltipStyle = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }

function getSemana(fecha: string) {
  const d = new Date(fecha)
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return lunes.toISOString().split('T')[0]
}

export default function VolumenPage() {
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [datosDias, setDatosDias] = useState<any[]>([])
  const [datosSemanas, setDatosSemanas] = useState<any[]>([])
  const [datosMusculo, setDatosMusculo] = useState<any[]>([])
  const [rango, setRango] = useState(28)
  const [loading, setLoading] = useState(true)
  const [loadingDatos, setLoadingDatos] = useState(false)
  const [vista, setVista] = useState<'dias'|'semanas'>('semanas')
  const [pestana, setPestana] = useState<'volumen'|'carga'>('volumen')
  const [datosCarga, setDatosCarga] = useState<any[]>([])
  const [discsActivas, setDiscsActivas] = useState<string[]>(['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'])
  const [agrupCarga, setAgrupCarga] = useState<'sesion'|'semana'|'mes'>('semana')

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(deps || [])
      setLoading(false)
    }
    cargar()
  }, [])

  const verVolumen = async (dep: any, dias: number) => {
    setSeleccionado(dep)
    setLoadingDatos(true)

    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeStr = desde.toISOString().split('T')[0]

    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
    const macroIds = (macros || []).map((m: any) => m.id)
    if (!macroIds.length) { setDatosDias([]); setDatosSemanas([]); setLoadingDatos(false); return }

    const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
    const mesoIds = (mesos || []).map((m: any) => m.id)
    if (!mesoIds.length) { setDatosDias([]); setDatosSemanas([]); setLoadingDatos(false); return }

    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
    const microIds = (micros || []).map((m: any) => m.id)
    if (!microIds.length) { setDatosDias([]); setDatosSemanas([]); setLoadingDatos(false); return }

    const { data: sesiones } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, duracion_minutos, estado')
      .in('id_microciclo', microIds)
      .eq('estado', 'Realizada')
      .gte('fecha_sesion', desdeStr)
      .order('fecha_sesion')

    if (!sesiones?.length) { setDatosDias([]); setDatosSemanas([]); setLoadingDatos(false); return }

    const sesIds = sesiones.map(s => s.id)
    const { data: tareas } = await supabase.from('tarea').select('id, id_sesion').in('id_sesion', sesIds)
    const tareaIds = tareas?.map(t => t.id) || []
    const { data: distancias } = tareaIds.length ? await supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : { data: [] }
    const { data: duraciones } = tareaIds.length ? await supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : { data: [] }
    const { data: ejercicios } = tareaIds.length ? await supabase.from('ejercicios').select('id_tarea, grupo_muscular, series').in('id_tarea', tareaIds) : { data: [] }

    const distMap: Record<number, number> = {}
    distancias?.forEach(d => { distMap[d.id_tarea] = d.metros_planeados })
    const durMap: Record<number, number> = {}
    duraciones?.forEach(d => { durMap[d.id_tarea] = d.tiempo_planeado })

    // Calcular volumen por sesión
    const volSesion = sesiones.map(s => {
      const tareasSes = tareas?.filter(t => t.id_sesion === s.id) || []
      let natacion = 0, ciclismo = 0, carrera = 0, fuerza = 0
      tareasSes.forEach(t => {
        const metros = distMap[t.id]
        const seg = durMap[t.id]
        if (s.disciplina === 'Natacion' && metros) natacion += metros
        if (s.disciplina === 'Ciclismo') {
          if (metros) ciclismo += metros / 1000
          else if (seg) ciclismo += Math.round(seg / 60 * 0.3)
        }
        if (s.disciplina === 'Carrera') {
          if (metros) carrera += metros / 1000
          else if (seg) carrera += Math.round(seg / 60 * 0.2)
        }
        if (s.disciplina === 'Fuerza') fuerza += (s.rpe_estimado || 5) * (s.duracion_minutos || 0)
      })
      if (!tareasSes.length) {
        if (s.disciplina === 'Ciclismo') ciclismo = Math.round((s.duracion_minutos || 0) * 0.3)
        if (s.disciplina === 'Carrera') carrera = Math.round((s.duracion_minutos || 0) * 0.2)
        if (s.disciplina === 'Fuerza') fuerza = (s.rpe_estimado || 5) * (s.duracion_minutos || 0)
      }
      return { fecha: s.fecha_sesion, Natacion: Math.round(natacion), Ciclismo: Math.round(ciclismo * 10) / 10, Carrera: Math.round(carrera * 10) / 10, Fuerza: Math.round(fuerza) }
    })

    // Agrupar por día
    const diasMap: Record<string, any> = {}
    volSesion.forEach(s => {
      if (!diasMap[s.fecha]) diasMap[s.fecha] = { fecha: s.fecha.slice(5), Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }
      diasMap[s.fecha].Natacion += s.Natacion
      diasMap[s.fecha].Ciclismo += s.Ciclismo
      diasMap[s.fecha].Carrera += s.Carrera
      diasMap[s.fecha].Fuerza += s.Fuerza
    })
    setDatosDias(Object.values(diasMap))

    // Agrupar por semana
    const semanasMap: Record<string, any> = {}
    volSesion.forEach(s => {
      const sem = getSemana(s.fecha)
      if (!semanasMap[sem]) semanasMap[sem] = { semana: sem.slice(5), Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }
      semanasMap[sem].Natacion += s.Natacion
      semanasMap[sem].Ciclismo += s.Ciclismo
      semanasMap[sem].Carrera += s.Carrera
      semanasMap[sem].Fuerza += s.Fuerza
    })
    setDatosSemanas(Object.values(semanasMap))

    // Volumen muscular fuerza
    const musculoMap: Record<string, number> = {}
    ejercicios?.forEach(e => {
      if (e.grupo_muscular) musculoMap[e.grupo_muscular] = (musculoMap[e.grupo_muscular] || 0) + (e.series || 0)
    })
    setDatosMusculo(Object.entries(musculoMap).map(([grupo, series]) => ({ grupo, series })).sort((a, b) => b.series - a.series))

    // Carga por sesión (RPE × duración)
    const cargaSesiones = sesiones.map(s => ({
      fecha: s.fecha_sesion.slice(5),
      fechaFull: s.fecha_sesion,
      disciplina: s.disciplina,
      ua: Math.round((s.rpe_estimado || 5) * (s.duracion_minutos || 0)),
      rpe: s.rpe_estimado,
      duracion: s.duracion_minutos,
      semana: getSemana(s.fecha_sesion).slice(5),
      mes: s.fecha_sesion.slice(0, 7),
    }))

    // Agrupar por semana para carga
    const cargaSemMap: Record<string, any> = {}
    cargaSesiones.forEach(s => {
      const k = s.semana
      if (!cargaSemMap[k]) cargaSemMap[k] = { periodo: k, Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0, total: 0 }
      cargaSemMap[k][s.disciplina] = (cargaSemMap[k][s.disciplina] || 0) + s.ua
      cargaSemMap[k].total += s.ua
    })

    // Agrupar por mes para carga
    const cargaMesMap: Record<string, any> = {}
    cargaSesiones.forEach(s => {
      const k = s.mes
      if (!cargaMesMap[k]) cargaMesMap[k] = { periodo: k, Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0, total: 0 }
      cargaMesMap[k][s.disciplina] = (cargaMesMap[k][s.disciplina] || 0) + s.ua
      cargaMesMap[k].total += s.ua
    })

    setDatosCarga({ sesiones: cargaSesiones, semanas: Object.values(cargaSemMap), meses: Object.values(cargaMesMap) } as any)
    setLoadingDatos(false)
  }

  const cambiarRango = (dias: number) => {
    setRango(dias)
    if (seleccionado) verVolumen(seleccionado, dias)
  }

  const toggleDisc = (key: string) => {
    setDiscsActivas(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key])
  }

  const datos = vista === 'dias' ? datosDias : datosSemanas
  const xKey = vista === 'dias' ? 'fecha' : 'semana'
  const datosCargaVista = (datosCarga as any)?.[agrupCarga === 'sesion' ? 'sesiones' : agrupCarga === 'semana' ? 'semanas' : 'meses'] || []
  const xKeyCarga = agrupCarga === 'sesion' ? 'fecha' : 'periodo'

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Volumen de entrenamiento</h2>
        <p className="text-gray-400 mb-6 text-sm">Metros · Kilómetros · Carga UA · Volumen muscular</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {deportistas.map(d => (
            <button key={d.id} onClick={() => { setRango(28); verVolumen(d, 28) }}
              className={'rounded-xl p-5 border-2 text-left transition ' +
                (seleccionado?.id === d.id ? 'bg-orange-500 border-orange-400' : 'bg-gray-900 border-gray-700 hover:border-orange-500')}>
              <h3 className="font-bold text-lg">{d.nombre}</h3>
              <p className="text-sm opacity-70">{d.sexo || 'Sin especificar'}</p>
            </button>
          ))}
          {deportistas.length === 0 && (
            <div className="col-span-2 text-center py-12 text-gray-500">
              <div className="text-5xl mb-4">📊</div>
              <p>No tienes deportistas todavía.</p>
            </div>
          )}
        </div>

        {seleccionado && (
          <div>
            {loadingDatos ? (
              <div className="text-center py-16 text-gray-400">Calculando volumen...</div>
            ) : datos.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">📊</div>
                <p>No hay sesiones realizadas en este período.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">

                {/* Pestañas */}
                <div className="flex gap-2 border-b border-gray-800 pb-3">
                  <button onClick={() => setPestana('volumen')}
                    className={'px-4 py-2 rounded-t-lg text-sm font-medium transition ' + (pestana === 'volumen' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                    📊 Volumen
                  </button>
                  <button onClick={() => setPestana('carga')}
                    className={'px-4 py-2 rounded-t-lg text-sm font-medium transition ' + (pestana === 'carga' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                    ⚡ Carga (RPE × duración)
                  </button>
                </div>

                {/* Controles */}
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex gap-2">
                    <button onClick={() => setVista('dias')}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (vista === 'dias' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                      Por días
                    </button>
                    <button onClick={() => setVista('semanas')}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (vista === 'semanas' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                      Por semanas
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {RANGOS.map(r => (
                      <button key={r.dias} onClick={() => cambiarRango(r.dias)}
                        className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                          (rango === r.dias ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selector disciplinas */}
                <div className="flex flex-wrap gap-2">
                  {DISCS.map(d => (
                    <button key={d.key} onClick={() => toggleDisc(d.key)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition border ' +
                        (discsActivas.includes(d.key) ? 'text-gray-900 border-transparent' : 'bg-gray-800 text-gray-400 border-gray-700')}
                      style={discsActivas.includes(d.key) ? { background: d.color, borderColor: d.color } : {}}>
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Gráfica combinada */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <p className="text-sm font-medium text-gray-300 mb-3">
                    Volumen combinado por {vista === 'dias' ? 'día' : 'semana'}
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={datos}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                      {DISCS.filter(d => discsActivas.includes(d.key)).map(d => (
                        <Bar key={d.key} dataKey={d.key} fill={d.color} name={d.label} radius={[3,3,0,0]} stackId="a" />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Gráficas individuales */}
                {DISCS.filter(d => discsActivas.includes(d.key) && datos.some(r => r[d.key] > 0)).map(d => (
                  <div key={d.key} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <p className="text-sm font-medium mb-3" style={{ color: d.color }}>{d.label} — {d.unidad} por {vista === 'dias' ? 'día' : 'semana'}</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={datos}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit={d.unidad} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' ' + d.unidad, d.label]} />
                        <Bar dataKey={d.key} fill={d.color} radius={[4,4,0,0]} name={d.label} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}

                {/* Volumen muscular fuerza */}
                {datosMusculo.length > 0 && (
                  <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <p className="text-sm font-medium text-red-400 mb-3">💪 Volumen muscular — series por grupo</p>
                    <ResponsiveContainer width="100%" height={Math.max(200, datosMusculo.length * 40)}>
                      <BarChart data={datosMusculo} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" series" />
                        <YAxis type="category" dataKey="grupo" stroke="#9ca3af" tick={{ fontSize: 10 }} width={140} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' series', 'Volumen']} />
                        <Bar dataKey="series" fill="#f87171" radius={[0,4,4,0]} name="Series" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {datosMusculo.map(m => (
                        <div key={m.grupo} className={'rounded-lg px-3 py-2 text-xs ' +
                          (m.series < 4 ? 'bg-blue-900 border border-blue-700' :
                           m.series <= 8 ? 'bg-green-900 border border-green-700' :
                           m.series <= 12 ? 'bg-yellow-900 border border-yellow-700' :
                           'bg-red-900 border border-red-700')}>
                          <p className="font-medium text-white truncate">{m.grupo}</p>
                          <p className={'text-xs ' + (m.series < 4 ? 'text-blue-400' : m.series <= 8 ? 'text-green-400' : m.series <= 12 ? 'text-yellow-400' : 'text-red-400')}>
                            {m.series} series · {m.series < 4 ? 'Mantenimiento' : m.series <= 8 ? 'Desarrollo' : m.series <= 12 ? 'Carga alta' : '⚠️ Sobrevolumen'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* VISTA CARGA */}
              {pestana === 'carga' && (
                <div className="flex flex-col gap-4">
                  <div className="flex gap-2 flex-wrap items-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wide mr-1">Agrupar por</p>
                    {[{k:'sesion',l:'Sesión'},{k:'semana',l:'Semana'},{k:'mes',l:'Mes'}].map(a => (
                      <button key={a.k} onClick={() => setAgrupCarga(a.k as any)}
                        className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                          (agrupCarga === a.k ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                        {a.l}
                      </button>
                    ))}
                  </div>

                  <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <p className="text-sm font-medium text-gray-300 mb-1">Carga por {agrupCarga === 'sesion' ? 'sesión' : agrupCarga === 'semana' ? 'semana' : 'mes'}</p>
                    <p className="text-xs text-gray-500 mb-3">UA = RPE × duración (min)</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={datosCargaVista}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey={xKeyCarga} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" UA" />
                        <Tooltip contentStyle={tooltipStyle}
                          formatter={(v: any, name: string) => [v + ' UA', name]}
                          labelFormatter={(l: string) => 'Período: ' + l} />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                        {agrupCarga === 'sesion' ? (
                          <Bar dataKey="ua" name="Carga UA" radius={[4,4,0,0]}
                            fill="#f97316"
                            label={false} />
                        ) : (
                          DISCS.map(d => (
                            <Bar key={d.key} dataKey={d.key} fill={d.color} name={d.label} stackId="a" radius={[3,3,0,0]} />
                          ))
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {agrupCarga === 'sesion' && datosCargaVista.length > 0 && (
                    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                      <p className="text-sm font-medium text-gray-300 mb-3">Detalle por sesión</p>
                      <div className="grid gap-2">
                        {[...datosCargaVista].reverse().slice(0, 10).map((s: any, i: number) => (
                          <div key={i} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400 text-xs w-12">{s.fecha}</span>
                              <span className={'text-xs px-2 py-0.5 rounded-full ' +
                                (s.disciplina === 'Natacion' ? 'bg-blue-900 text-blue-300' :
                                 s.disciplina === 'Ciclismo' ? 'bg-yellow-900 text-yellow-300' :
                                 s.disciplina === 'Carrera' ? 'bg-green-900 text-green-300' :
                                 'bg-red-900 text-red-300')}>
                                {s.disciplina}
                              </span>
                              <span className="text-gray-400 text-xs">{s.duracion} min · RPE {s.rpe}</span>
                            </div>
                            <span className="text-orange-400 font-bold text-sm">{s.ua} UA</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
