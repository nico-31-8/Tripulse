'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

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
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [datosDias, setDatosDias] = useState<any[]>([])
  const [datosSemanas, setDatosSemanas] = useState<any[]>([])
  const [datosMusculo, setDatosMusculo] = useState<any[]>([])
  const [cargaSesiones, setCargaSesiones] = useState<any[]>([])
  const [cargaSemanas, setCargaSemanas] = useState<any[]>([])
  const [cargaMeses, setCargaMeses] = useState<any[]>([])
  const [rango, setRango] = useState(28)
  const [loading, setLoading] = useState(true)
  const [loadingDatos, setLoadingDatos] = useState(false)
  const [pestana, setPestana] = useState<'volumen'|'carga'|'fuerza'>('volumen')
  const [vista, setVista] = useState<'dias'|'semanas'>('semanas')
  const [agrupCarga, setAgrupCarga] = useState<'sesion'|'semana'|'mes'>('semana')
  const [discsActivas, setDiscsActivas] = useState<string[]>(['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'])
  const [subVista, setSubVista] = useState<'barras'|'evolucion'>('barras')
  const [agrupEvol, setAgrupEvol] = useState<'semanas'|'meses'>('semanas')

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
      .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, estado')
      .in('id_microciclo', microIds)
      .eq('estado', 'Realizada')
      .gte('fecha_sesion', desdeStr)
      .order('fecha_sesion')

    if (!sesiones?.length) { setDatosDias([]); setDatosSemanas([]); setCargaSesiones([]); setCargaSemanas([]); setCargaMeses([]); setLoadingDatos(false); return }

    const sesIds = sesiones.map(s => s.id)
    const { data: tareas } = await supabase.from('tarea').select('id, id_sesion').in('id_sesion', sesIds)
    const tareaIds = tareas?.map(t => t.id) || []

    const { data: distancias } = tareaIds.length ? await supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : { data: [] }
    const { data: duraciones } = tareaIds.length ? await supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : { data: [] }
    const { data: ejercicios } = tareaIds.length ? await supabase.from('ejercicios').select('id_tarea, grupo_muscular, series').in('id_tarea', tareaIds) : { data: [] }

    const distMap: Record<number, number> = {}
    distancias?.forEach((d: any) => { distMap[d.id_tarea] = d.metros_planeados })
    const durMap: Record<number, number> = {}
    duraciones?.forEach((d: any) => { durMap[d.id_tarea] = d.tiempo_planeado })

    // Volumen por sesión
    const volSesion = sesiones.map(s => {
      const tareasSes = tareas?.filter(t => t.id_sesion === s.id) || []
      let natacion = 0, ciclismo = 0, carrera = 0, fuerza = 0
      tareasSes.forEach(t => {
        const metros = distMap[t.id]
        const seg = durMap[t.id]
        if (s.disciplina === 'Natacion' && metros) natacion += metros
        if (s.disciplina === 'Ciclismo') {
          if (metros) ciclismo += metros / 1000
          else if (seg) ciclismo += seg / 60 * 0.3
        }
        if (s.disciplina === 'Carrera') {
          if (metros) carrera += metros / 1000
          else if (seg) carrera += seg / 60 * 0.2
        }
        if (s.disciplina === 'Fuerza') fuerza += (s.rpe_reportado || s.rpe_estimado || 5) * (s.duracion_minutos || 0)
      })
      if (!tareasSes.length) {
        if (s.disciplina === 'Ciclismo') ciclismo = (s.duracion_minutos || 0) * 0.3
        if (s.disciplina === 'Carrera') carrera = (s.duracion_minutos || 0) * 0.2
        if (s.disciplina === 'Fuerza') fuerza = (s.rpe_reportado || s.rpe_estimado || 5) * (s.duracion_minutos || 0)
      }
      return {
        fecha: s.fecha_sesion,
        disciplina: s.disciplina,
        Natacion: Math.round(natacion),
        Ciclismo: Math.round(ciclismo * 10) / 10,
        Carrera: Math.round(carrera * 10) / 10,
        Fuerza: Math.round(fuerza),
        ua: Math.round((s.rpe_reportado || s.rpe_estimado || 5) * (s.duracion_minutos || 0)),
        rpe: s.rpe_estimado,
        duracion: s.duracion_minutos,
      }
    })

    // Agrupar por día
    const diasMap: Record<string, any> = {}
    volSesion.forEach(s => {
      const k = s.fecha
      if (!diasMap[k]) diasMap[k] = { fecha: k.slice(5), Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }
      diasMap[k].Natacion += s.Natacion
      diasMap[k].Ciclismo += s.Ciclismo
      diasMap[k].Carrera += s.Carrera
      diasMap[k].Fuerza += s.Fuerza
    })
    setDatosDias(Object.values(diasMap))

    // Agrupar por semana
    const semanasMap: Record<string, any> = {}
    volSesion.forEach(s => {
      const k = getSemana(s.fecha)
      if (!semanasMap[k]) semanasMap[k] = { semana: k.slice(5), Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }
      semanasMap[k].Natacion += s.Natacion
      semanasMap[k].Ciclismo += s.Ciclismo
      semanasMap[k].Carrera += s.Carrera
      semanasMap[k].Fuerza += s.Fuerza
    })
    setDatosSemanas(Object.values(semanasMap))

    // Volumen muscular
    const musculoMap: Record<string, number> = {}
    ejercicios?.forEach((e: any) => {
      if (e.grupo_muscular) musculoMap[e.grupo_muscular] = (musculoMap[e.grupo_muscular] || 0) + (e.series || 0)
    })
    setDatosMusculo(Object.entries(musculoMap).map(([grupo, series]) => ({ grupo, series })).sort((a, b) => b.series - a.series))

    // Carga por sesión
    setCargaSesiones(volSesion.map(s => ({ ...s, fecha: s.fecha.slice(5) })))

    // Carga por semana
    const cSemMap: Record<string, any> = {}
    volSesion.forEach(s => {
      const k = getSemana(s.fecha).slice(5)
      if (!cSemMap[k]) cSemMap[k] = { periodo: k, Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0, total: 0 }
      cSemMap[k][s.disciplina] = (cSemMap[k][s.disciplina] || 0) + s.ua
      cSemMap[k].total += s.ua
    })
    setCargaSemanas(Object.values(cSemMap))

    // Carga por mes
    const cMesMap: Record<string, any> = {}
    volSesion.forEach(s => {
      const k = s.fecha.slice(0, 7)
      if (!cMesMap[k]) cMesMap[k] = { periodo: k, Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0, total: 0 }
      cMesMap[k][s.disciplina] = (cMesMap[k][s.disciplina] || 0) + s.ua
      cMesMap[k].total += s.ua
    })
    setCargaMeses(Object.values(cMesMap))

    setLoadingDatos(false)
  }

  const cambiarRango = (dias: number) => {
    setRango(dias)
    if (seleccionado) verVolumen(seleccionado, dias)
  }

  const toggleDisc = (key: string) => {
    setDiscsActivas(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key])
  }

  const datosVol = vista === 'dias' ? datosDias : datosSemanas
  const xKeyVol = vista === 'dias' ? 'fecha' : 'semana'
  const datosCargaVista = agrupCarga === 'sesion' ? cargaSesiones : agrupCarga === 'semana' ? cargaSemanas : cargaMeses
  const xKeyCarga = agrupCarga === 'sesion' ? 'fecha' : 'periodo'

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Volumen y Carga</h2>
        <p className="text-gray-400 mb-6 text-sm">Metros · Kilómetros · RPE × duración · Volumen muscular</p>

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

        {seleccionado && loadingDatos && (
          <div className="text-center py-16 text-gray-400">Calculando datos...</div>
        )}

        {seleccionado && !loadingDatos && (
          <div className="flex flex-col gap-4">

            {/* Pestañas */}
            <div className="flex gap-2 border-b border-gray-800 pb-0">
              <button onClick={() => setPestana('volumen')}
                className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
                  (pestana === 'volumen' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
                📊 Volumen
              </button>
              <button onClick={() => setPestana('carga')}
                className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
                  (pestana === 'carga' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
                ⚡ Carga (RPE × duración)
              </button>
              <button onClick={() => setPestana('fuerza')}
                className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
                  (pestana === 'fuerza' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
                💪 Fuerza muscular
              </button>
            </div>

            {/* Selector de rango — compartido */}
            <div className="flex gap-2 flex-wrap items-center">
              <p className="text-gray-500 text-xs uppercase tracking-wide mr-1">Período</p>
              {RANGOS.map(r => (
                <button key={r.dias} onClick={() => cambiarRango(r.dias)}
                  className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                    (rango === r.dias ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* PESTAÑA VOLUMEN */}
            {pestana === 'volumen' && (
              <div className="flex flex-col gap-4">
                {/* Selector de subvista */}
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => setSubVista('barras')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (subVista === 'barras' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    📊 Volumen total
                  </button>
                  <button onClick={() => setSubVista('evolucion')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (subVista === 'evolucion' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    📈 Evolución
                  </button>
                </div>

                {/* SUBVISTA EVOLUCIÓN */}
                {subVista === 'evolucion' && (() => {
                  const datosEvol = agrupEvol === 'semanas' ? datosSemanas : (() => {
                    const mesesMap: Record<string, any> = {}
                    datosSemanas.forEach(s => {
                      const mes = s.semana ? s.semana.slice(0,5) : s.fecha?.slice(0,5)
                      if (!mes) return
                      if (!mesesMap[mes]) mesesMap[mes] = { periodo: mes, Natacion: 0, Ciclismo: 0, Carrera: 0 }
                      mesesMap[mes].Natacion += s.Natacion || 0
                      mesesMap[mes].Ciclismo += s.Ciclismo || 0
                      mesesMap[mes].Carrera += s.Carrera || 0
                    })
                    return Object.values(mesesMap)
                  })()

                  const calcCambio = (datos: any[], key: string) => {
                    if (datos.length < 2) return null
                    const ultimo = datos[datos.length - 1]?.[key] || 0
                    const anterior = datos[datos.length - 2]?.[key] || 0
                    if (!anterior) return null
                    return Math.round(((ultimo - anterior) / anterior) * 100)
                  }

                  return (
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-2 items-center">
                        <button onClick={() => setAgrupEvol('semanas')}
                          className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (agrupEvol === 'semanas' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                          Por semanas
                        </button>
                        <button onClick={() => setAgrupEvol('meses')}
                          className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (agrupEvol === 'meses' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                          Por meses
                        </button>
                      </div>

                      {/* Tarjetas de % cambio */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { key: 'Natacion', label: 'Natación', color: '#60a5fa', unidad: 'm' },
                          { key: 'Ciclismo', label: 'Ciclismo', color: '#fbbf24', unidad: 'km' },
                          { key: 'Carrera', label: 'Carrera', color: '#4ade80', unidad: 'km' },
                        ].map(d => {
                          const cambio = calcCambio(datosEvol, d.key)
                          const ultimoVal = datosEvol[datosEvol.length - 1]?.[d.key]
                          return (
                            <div key={d.key} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                              <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                              <p className="font-bold text-lg" style={{ color: d.color }}>
                                {ultimoVal ? Math.round(ultimoVal) + ' ' + d.unidad : '—'}
                              </p>
                              {cambio !== null && (
                                <p className={'text-xs font-medium mt-1 ' + (cambio > 0 ? 'text-green-400' : cambio < 0 ? 'text-red-400' : 'text-gray-400')}>
                                  {cambio > 0 ? '▲' : cambio < 0 ? '▼' : '='} {Math.abs(cambio)}% vs {agrupEvol === 'semanas' ? 'sem anterior' : 'mes anterior'}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Gráfica de líneas */}
                      {datosEvol.length > 0 ? (
                        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                          <p className="text-sm font-medium text-gray-300 mb-3">
                            Evolución del volumen por {agrupEvol === 'semanas' ? 'semana' : 'mes'}
                          </p>
                          <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={datosEvol}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis dataKey={agrupEvol === 'semanas' ? 'semana' : 'periodo'} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                              <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                              <Tooltip contentStyle={tooltipStyle} />
                              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                              <Line type="monotone" dataKey="Natacion" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 4 }} name="Natación (m)" connectNulls />
                              <Line type="monotone" dataKey="Ciclismo" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 4 }} name="Ciclismo (km)" connectNulls />
                              <Line type="monotone" dataKey="Carrera" stroke="#4ade80" strokeWidth={2.5} dot={{ r: 4 }} name="Carrera (km)" connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500">No hay datos suficientes para mostrar la evolución.</div>
                      )}
                    </div>
                  )
                })()}

                {/* SUBVISTA BARRAS — vista original */}
                {subVista === 'barras' && (
                <div className="flex flex-col gap-4">
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => setVista('dias')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (vista === 'dias' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    Por días
                  </button>
                  <button onClick={() => setVista('semanas')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (vista === 'semanas' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    Por semanas
                  </button>
                  <div className="flex gap-2 ml-2">
                    {DISCS.map(d => (
                      <button key={d.key} onClick={() => toggleDisc(d.key)}
                        className={'px-3 py-1 rounded-lg text-xs font-medium transition border ' +
                          (discsActivas.includes(d.key) ? 'text-gray-900 border-transparent' : 'bg-gray-800 text-gray-400 border-gray-700')}
                        style={discsActivas.includes(d.key) ? { background: d.color, borderColor: d.color } : {}}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {datosVol.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No hay sesiones realizadas en este período.</div>
                ) : (
                  <>
                    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                      <p className="text-sm font-medium text-gray-300 mb-3">Volumen combinado por {vista === 'dias' ? 'día' : 'semana'}</p>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={datosVol}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey={xKeyVol} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                          <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                          {DISCS.filter(d => discsActivas.includes(d.key)).map(d => (
                            <Bar key={d.key} dataKey={d.key} fill={d.color} name={d.label} stackId="a" radius={[3,3,0,0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {DISCS.filter(d => discsActivas.includes(d.key) && datosVol.some(r => r[d.key] > 0)).map(d => (
                      <div key={d.key} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                        <p className="text-sm font-medium mb-3" style={{ color: d.color }}>{d.label} — {d.unidad} por {vista === 'dias' ? 'día' : 'semana'}</p>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={datosVol}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey={xKeyVol} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                            <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit={d.unidad} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' ' + d.unidad, d.label]} />
                            <Bar dataKey={d.key} fill={d.color} radius={[4,4,0,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}

                    {datosMusculo.length > 0 && (
                      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                        <p className="text-sm font-medium text-red-400 mb-3">💪 Volumen muscular — series por grupo</p>
                        <ResponsiveContainer width="100%" height={Math.max(200, datosMusculo.length * 40)}>
                          <BarChart data={datosMusculo} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" series" />
                            <YAxis type="category" dataKey="grupo" stroke="#9ca3af" tick={{ fontSize: 10 }} width={140} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' series', 'Volumen']} />
                            <Bar dataKey="series" fill="#f87171" radius={[0,4,4,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
                </div>
                )}
              </div>
            )}

            {/* PESTAÑA FUERZA */}
            {pestana === 'fuerza' && (
              <div className="flex flex-col gap-4">
                {datosMusculo.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">
                    <div className="text-5xl mb-4">💪</div>
                    <p>No hay datos de ejercicios de fuerza todavía.</p>
                    <p className="text-sm mt-2 text-gray-600">Crea sesiones de fuerza con ejercicios para ver el volumen muscular.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Mantenimiento', rango: '< 4 series', color: 'text-blue-400', bg: 'bg-blue-900 border-blue-700' },
                        { label: 'Desarrollo', rango: '4–8 series', color: 'text-green-400', bg: 'bg-green-900 border-green-700' },
                        { label: 'Carga alta', rango: '9–12 series', color: 'text-yellow-400', bg: 'bg-yellow-900 border-yellow-700' },
                        { label: 'Sobrevolumen', rango: '> 12 series', color: 'text-red-400', bg: 'bg-red-900 border-red-700' },
                      ].map(z => (
                        <div key={z.label} className={'rounded-xl p-3 border text-center ' + z.bg}>
                          <p className={'font-bold text-sm ' + z.color}>{z.label}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{z.rango}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                      <p className="text-sm font-medium text-red-400 mb-3">Series por grupo muscular</p>
                      <ResponsiveContainer width="100%" height={Math.max(250, datosMusculo.length * 45)}>
                        <BarChart data={datosMusculo} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" series" />
                          <YAxis type="category" dataKey="grupo" stroke="#9ca3af" tick={{ fontSize: 10 }} width={160} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' series', 'Volumen']} />
                          <Bar dataKey="series" radius={[0,4,4,0]} name="Series"
                            fill="#f87171"
                            label={{ position: 'right', fontSize: 11, fill: '#9ca3af', formatter: (v: any) => v + ' series' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid gap-2">
                      {datosMusculo.map(m => {
                        const estado = m.series < 4 ? { label: 'Mantenimiento', color: 'text-blue-400', bg: 'bg-blue-900 border-blue-700' }
                          : m.series <= 8 ? { label: 'Desarrollo', color: 'text-green-400', bg: 'bg-green-900 border-green-700' }
                          : m.series <= 12 ? { label: 'Carga alta', color: 'text-yellow-400', bg: 'bg-yellow-900 border-yellow-700' }
                          : { label: '⚠️ Sobrevolumen', color: 'text-red-400', bg: 'bg-red-900 border-red-700' }
                        return (
                          <div key={m.grupo} className={'flex justify-between items-center rounded-xl px-4 py-3 border ' + estado.bg}>
                            <p className="font-medium text-sm text-white">{m.grupo}</p>
                            <div className="flex items-center gap-3">
                              <p className={'text-xs ' + estado.color}>{estado.label}</p>
                              <p className="font-bold text-white">{m.series} series</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PESTAÑA CARGA */}
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

                {datosCargaVista.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No hay datos de carga en este período.</div>
                ) : (
                  <>
                    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                      <p className="text-sm font-medium text-gray-300 mb-1">Carga por {agrupCarga === 'sesion' ? 'sesión' : agrupCarga === 'semana' ? 'semana' : 'mes'}</p>
                      <p className="text-xs text-gray-500 mb-3">UA = RPE × duración en minutos</p>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={datosCargaVista}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey={xKeyCarga} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                          <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" UA" />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                          {agrupCarga === 'sesion' ? (
                            <Bar dataKey="ua" name="Carga UA" fill="#f97316" radius={[4,4,0,0]} />
                          ) : (
                            DISCS.map(d => (
                              <Bar key={d.key} dataKey={d.key} fill={d.color} name={d.label} stackId="a" radius={[3,3,0,0]} />
                            ))
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {agrupCarga === 'sesion' && (
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
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

