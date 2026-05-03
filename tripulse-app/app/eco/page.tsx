'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'

const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera']

const TABLA_ECO_ORIGINAL = [
  { factor: 'Dificultad técnica', natacion: 3, ciclismo: 1, carrera: 2 },
  { factor: 'Dolor muscular',     natacion: 1, ciclismo: 1, carrera: 4 },
  { factor: 'Densidad',          natacion: 1, ciclismo: 2, carrera: 3 },
  { factor: 'Coste energético',  natacion: 3, ciclismo: 2, carrera: 3 },
]

function calcularF1(sesiones: any[]) {
  const validas = sesiones.filter(s => s.sensacion_tecnica && s.valoracion_tecnica_entrenador)
  if (!validas.length) return null
  const media = validas.reduce((acc, s) => acc + (s.sensacion_tecnica + s.valoracion_tecnica_entrenador) / 2, 0) / validas.length
  return Math.min(4, Math.max(1, Math.round(5 - media)))
}

function calcularF2(sesiones: any[]) {
  const validas = sesiones.filter(s => s.dolor_muscular)
  if (!validas.length) return null
  const media = validas.reduce((acc, s) => acc + s.dolor_muscular, 0) / validas.length
  return Math.min(4, Math.max(1, Math.round(media * 0.8)))
}

function calcularF3(sesiones: any[]) {
  const duras = sesiones.filter(s => s.rpe_reportado > 7)
  if (!duras.length) return 1
  const degradadas = duras.filter(s => s.sensacion_tecnica < 3)
  const degradacion = degradadas.length / duras.length
  return Math.min(4, Math.max(1, 1 + Math.round(degradacion * 3)))
}

function calcularF4(sesiones: any[], fcUmbral: number) {
  const validas = sesiones.filter(s => s.fc_media && s.rpe_reportado && fcUmbral > 0)
  if (!validas.length) return null
  const fcRel = validas.reduce((acc, s) => acc + s.fc_media / fcUmbral, 0) / validas.length
  const mediaRpe = validas.reduce((acc, s) => acc + s.rpe_reportado, 0) / validas.length
  return Math.min(4, Math.max(1, Math.round((fcRel * 2) + (mediaRpe / 10 * 2))))
}

function calcularCorrectorHRV(sesiones: any[], hrvBasal: number) {
  const validas = sesiones.filter(s => s.hrv_del_dia && hrvBasal > 0)
  if (!validas.length) return 1
  const hrvMedia = validas.reduce((acc, s) => acc + s.hrv_del_dia, 0) / validas.length
  const ratio = hrvMedia / hrvBasal
  return 1 + (1 - ratio) * 0.3
}

function colorPorcentaje(p: number) {
  if (p <= 40) return 'text-green-400'
  if (p <= 70) return 'text-yellow-400'
  if (p <= 90) return 'text-orange-400'
  return 'text-red-400'
}

function bgPorcentaje(p: number) {
  if (p <= 40) return 'bg-green-500'
  if (p <= 70) return 'bg-yellow-500'
  if (p <= 90) return 'bg-orange-500'
  return 'bg-red-500'
}

export default function EcoPage() {
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [scores, setScores] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingScores, setLoadingScores] = useState(false)

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

  const calcularECO = async (dep: any) => {
    setSeleccionado(dep)
    setLoadingScores(true)
    setScores(null)

    const fcUmbral = dep.fc_maxima ? dep.fc_maxima * 0.85 : 0
    const hrvBasal = dep.hrv_basal || 0

    const resultados: any = {}

    for (const disc of DISCIPLINAS) {
      const { data: sesiones } = await supabase
        .from('sesion')
        .select('id, disciplina, rpe_estimado')
        .eq('disciplina', disc)
        .eq('estado', 'Realizada')
        .in('id_microciclo', await getMicrosDeportista(dep.id))

      const sesionIds = (sesiones || []).map((s: any) => s.id)

      if (!sesionIds.length) {
        resultados[disc] = { sesiones: 0, f1: null, f2: null, f3: null, f4: null, total: null }
        continue
      }

      const { data: tareas } = await supabase
        .from('tarea')
        .select('rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular, valoracion_tecnica_entrenador, hrv_del_dia')
        .in('id_sesion', sesionIds)
        .not('rpe_reportado', 'is', null)

      const t = tareas || []
      const f1 = calcularF1(t)
      const f2 = calcularF2(t)
      const f3 = calcularF3(t)
      const f4 = calcularF4(t, fcUmbral)
      const corrector = calcularCorrectorHRV(t, hrvBasal)

      const factoresValidos = [f1, f2, f3, f4].filter(f => f !== null)
      const total = factoresValidos.length === 4
        ? Math.round((f1! + f2! + f3! + f4!) * corrector * 10) / 10
        : null

      resultados[disc] = { sesiones: t.length, f1, f2, f3, f4, total, corrector }
    }

    const totalesValidos = DISCIPLINAS.map(d => resultados[d].total).filter(t => t !== null)
    const maxTotal = totalesValidos.length ? Math.max(...totalesValidos) : 16

    DISCIPLINAS.forEach(d => {
      if (resultados[d].total !== null) {
        resultados[d].porcentaje = Math.round((resultados[d].total / maxTotal) * 100)
      }
    })

    setScores(resultados)
    setLoadingScores(false)
  }

  const getMicrosDeportista = async (depId: number): Promise<number[]> => {
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
    const macroIds = (macros || []).map((m: any) => m.id)
    if (!macroIds.length) return []
    const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
    const mesoIds = (mesos || []).map((m: any) => m.id)
    if (!mesoIds.length) return []
    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
    return (micros || []).map((m: any) => m.id)
  }

  const radarData = scores ? DISCIPLINAS.map(d => ({
    disciplina: d,
    Individual: scores[d]?.porcentaje || 0,
    Poblacional: d === 'Natacion' ? 75 : d === 'Ciclismo' ? 50 : 100,
  })) : []

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Sistema ECO Individual</h2>
        <p className="text-gray-400 mb-6 text-sm">Coste energético individualizado por disciplina · Mínimo 5-6 sesiones por disciplina</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {deportistas.map(d => (
            <button key={d.id} onClick={() => calcularECO(d)}
              className={'rounded-xl p-5 border-2 text-left transition ' +
                (seleccionado?.id === d.id ? 'bg-orange-500 border-orange-400' : 'bg-gray-900 border-gray-700 hover:border-orange-500')}>
              <h3 className="font-bold text-lg">{d.nombre}</h3>
              <p className="text-sm opacity-70">FC máx: {d.fc_maxima || '—'} ppm · HRV basal: {d.hrv_basal || '—'} ms</p>
            </button>
          ))}
        </div>

        {loadingScores && <div className="text-center py-16 text-gray-400">Calculando scores ECO...</div>}

        {scores && seleccionado && !loadingScores && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {DISCIPLINAS.map(disc => {
                const s = scores[disc]
                const icono = disc === 'Natacion' ? '🏊' : disc === 'Ciclismo' ? '🚴' : '🏃'
                return (
                  <div key={disc} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-2xl">{icono}</span>
                        <h3 className="font-bold text-lg mt-1">{disc}</h3>
                        <p className="text-gray-500 text-xs">{s.sesiones} sesiones analizadas</p>
                      </div>
                      {s.porcentaje !== undefined ? (
                        <div className="text-right">
                          <p className={'text-3xl font-bold ' + colorPorcentaje(s.porcentaje)}>{s.porcentaje}%</p>
                          <p className="text-gray-500 text-xs">del máx individual</p>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">Sin datos</p>
                      )}
                    </div>

                    {s.total !== null ? (
                      <>
                        <div className="w-full bg-gray-800 rounded-full h-2 mb-4">
                          <div className={'h-2 rounded-full ' + bgPorcentaje(s.porcentaje || 0)}
                            style={{ width: (s.porcentaje || 0) + '%' }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'F1 Técnica', val: s.f1, max: 4 },
                            { label: 'F2 Dolor', val: s.f2, max: 4 },
                            { label: 'F3 Densidad', val: s.f3, max: 4 },
                            { label: 'F4 Energético', val: s.f4, max: 4 },
                          ].map(({ label, val, max }) => (
                            <div key={label} className="bg-gray-800 rounded-lg p-2">
                              <p className="text-gray-500 text-xs">{label}</p>
                              <p className="font-bold text-white">{val !== null ? val + '/' + max : '—'}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 bg-gray-800 rounded-lg p-2">
                          <p className="text-gray-500 text-xs">Total corregido HRV</p>
                          <p className="font-bold text-orange-400">{s.total}/16 <span className="text-gray-500 text-xs font-normal">(corrector: ×{s.corrector?.toFixed(2)})</span></p>
                        </div>
                      </>
                    ) : (
                      <div className="bg-gray-800 rounded-lg p-4 text-center">
                        <p className="text-gray-500 text-sm">Faltan datos para calcular</p>
                        <p className="text-gray-600 text-xs mt-1">Necesita sesiones realizadas con RPE, FC y sensación técnica</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {radarData.some(d => d.Individual > 0) && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
                <h3 className="font-bold mb-1">Perfil ECO — Individual vs Poblacional</h3>
                <p className="text-gray-500 text-xs mb-4">Comparación con los valores de referencia de la tabla ECO original</p>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="disciplina" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Radar name="Tu perfil" dataKey="Individual" stroke="#f97316" fill="#f97316" fillOpacity={0.3} />
                    <Radar name="Referencia poblacional" dataKey="Poblacional" stroke="#6b7280" fill="#6b7280" fillOpacity={0.1} strokeDasharray="4 4" />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-bold mb-3">Tabla ECO de referencia poblacional</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-700">
                      <th className="text-left py-2 px-3">Factor</th>
                      <th className="text-center py-2 px-3">🏊 Natación</th>
                      <th className="text-center py-2 px-3">🚴 Ciclismo</th>
                      <th className="text-center py-2 px-3">🏃 Carrera</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TABLA_ECO_ORIGINAL.map(r => (
                      <tr key={r.factor} className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300">{r.factor}</td>
                        <td className="py-2 px-3 text-center">{'★'.repeat(r.natacion)}{'☆'.repeat(4-r.natacion)}</td>
                        <td className="py-2 px-3 text-center">{'★'.repeat(r.ciclismo)}{'☆'.repeat(4-r.ciclismo)}</td>
                        <td className="py-2 px-3 text-center">{'★'.repeat(r.carrera)}{'☆'.repeat(4-r.carrera)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-600">
                      <td className="py-2 px-3 font-bold text-white">TOTAL</td>
                      <td className="py-2 px-3 text-center font-bold text-orange-400">9/16 · 75%</td>
                      <td className="py-2 px-3 text-center font-bold text-orange-400">6/16 · 50%</td>
                      <td className="py-2 px-3 text-center font-bold text-orange-400">12/16 · 100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
