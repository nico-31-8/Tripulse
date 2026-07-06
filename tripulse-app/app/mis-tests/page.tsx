'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function MisTests() {
  const [deportista, setDeportista] = useState<any>(null)
  const [tests, setTests] = useState<any>({ carrera: [], natacion: [], ciclismo: [], fuerza: [] })
  const [loading, setLoading] = useState(true)
  const [pestana, setPestana] = useState<'carrera'|'natacion'|'ciclismo'|'fuerza'>('carrera')

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: dep } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
      if (!dep) { setLoading(false); return }
      setDeportista(dep)

      const [t1, t2, t3, tf] = await Promise.all([
        supabase.from('test1_carrera').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }),
        supabase.from('test2_natacion').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }),
        supabase.from('test3_ciclismo').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }),
        supabase.from('test_fuerza').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }),
      ])
      setTests({ carrera: t1.data || [], natacion: t2.data || [], ciclismo: t3.data || [], fuerza: tf.data || [] })
      setLoading(false)
    }
    cargar()
  }, [])

  const PESTANAS = [
    { key: 'carrera', label: '🏃 Carrera', color: 'text-green-400' },
    { key: 'natacion', label: '🏊 Natación', color: 'text-blue-400' },
    { key: 'ciclismo', label: '🚴 Ciclismo', color: 'text-yellow-400' },
    { key: 'fuerza', label: '💪 Fuerza', color: 'text-red-400' },
  ]

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard-deportista'} className="text-gray-400 hover:text-white text-sm transition">← Mi panel</button>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Mis tests</h2>
        <p className="text-gray-400 mb-6 text-sm">Resultados y zonas de entrenamiento generadas por tu entrenador</p>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-gray-800 mb-6">
          {PESTANAS.map(p => (
            <button key={p.key} onClick={() => setPestana(p.key as any)}
              className={'px-4 py-2.5 text-sm font-medium transition border-b-2 ' +
                (pestana === p.key ? 'border-orange-500 ' + p.color : 'border-transparent text-gray-400 hover:text-white')}>
              {p.label}
            </button>
          ))}
        </div>

        {/* CARRERA */}
        {pestana === 'carrera' && (
          <div className="flex flex-col gap-4">
            {tests.carrera.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">🏃</div>
                <p>No tienes tests de carrera todavía.</p>
              </div>
            ) : tests.carrera.map((t: any) => (
              <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-lg text-green-400">VAM: {t.vam} km/h</p>
                    <p className="text-gray-400 text-sm">{t.fecha}</p>
                  </div>
                  <span className="bg-green-900 text-green-300 text-xs px-3 py-1 rounded-full">Test carrera</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Vel. último escalón</p>
                    <p className="font-bold">{t.velocidad_ultimo_escalon} km/h</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Tiempo aguantado</p>
                    <p className="font-bold">{t.tiempo_aguantado_ultimo}s</p>
                  </div>
                </div>
                {t.vam && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Zonas de carrera</p>
                    <div className="grid gap-1.5">
                      {[
                        { z: 1, nombre: 'Recuperación', pct: [0, 65], color: 'bg-gray-700' },
                        { z: 2, nombre: 'Aeróbica', pct: [65, 75], color: 'bg-blue-900' },
                        { z: 3, nombre: 'Tempo', pct: [76, 85], color: 'bg-green-900' },
                        { z: 4, nombre: 'Umbral', pct: [86, 95], color: 'bg-yellow-900' },
                        { z: 5, nombre: 'VO₂máx', pct: [96, 105], color: 'bg-orange-900' },
                        { z: 6, nombre: 'Anaeróbica', pct: [106, 120], color: 'bg-red-900' },
                      ].map(z => {
                        const vMin = (t.vam * z.pct[0] / 100)
                        const vMax = (t.vam * z.pct[1] / 100)
                        const pMin = vMin > 0 ? Math.floor(60/vMin) + ':' + String(Math.round((60/vMin%1)*60)).padStart(2,'0') : '—'
                        const pMax = vMax > 0 ? Math.floor(60/vMax) + ':' + String(Math.round((60/vMax%1)*60)).padStart(2,'0') : '—'
                        return (
                          <div key={z.z} className={'flex justify-between items-center px-3 py-2 rounded-lg ' + z.color}>
                            <span className="text-xs font-medium">Z{z.z} {z.nombre}</span>
                            <span className="text-xs text-gray-300">{pMin} – {pMax} /km</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* NATACIÓN */}
        {pestana === 'natacion' && (
          <div className="flex flex-col gap-4">
            {tests.natacion.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">🏊</div>
                <p>No tienes tests de natación todavía.</p>
              </div>
            ) : tests.natacion.map((t: any) => (
              <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-lg text-blue-400">CSS: {t.css ? (t.css * 100).toFixed(1) + 's/100m' : '—'}</p>
                    <p className="text-gray-400 text-sm">{t.fecha}</p>
                  </div>
                  <span className="bg-blue-900 text-blue-300 text-xs px-3 py-1 rounded-full">Test natación</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">{t.distancia_grande}m</p>
                    <p className="font-bold">{t.tiempo_distancia_grande}s</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">{t.distancia_pequena}m</p>
                    <p className="font-bold">{t.tiempo_distancia_pequena}s</p>
                  </div>
                </div>
                {t.css && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Zonas de natación</p>
                    <div className="grid gap-1.5">
                      {[
                        { z: 1, nombre: 'Recuperación', pct: [0, 65], color: 'bg-gray-700' },
                        { z: 2, nombre: 'Aeróbica', pct: [65, 75], color: 'bg-blue-900' },
                        { z: 3, nombre: 'Tempo', pct: [76, 85], color: 'bg-green-900' },
                        { z: 4, nombre: 'Umbral', pct: [86, 95], color: 'bg-yellow-900' },
                        { z: 5, nombre: 'VO₂máx', pct: [96, 105], color: 'bg-orange-900' },
                      ].map(z => {
                        const vMin = t.css * z.pct[0] / 100
                        const vMax = t.css * z.pct[1] / 100
                        const p100Min = vMin > 0 ? Math.round(100/vMin) : 0
                        const p100Max = vMax > 0 ? Math.round(100/vMax) : 0
                        return (
                          <div key={z.z} className={'flex justify-between items-center px-3 py-2 rounded-lg ' + z.color}>
                            <span className="text-xs font-medium">Z{z.z} {z.nombre}</span>
                            <span className="text-xs text-gray-300">{p100Max}s – {p100Min}s /100m</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CICLISMO */}
        {pestana === 'ciclismo' && (
          <div className="flex flex-col gap-4">
            {tests.ciclismo.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">🚴</div>
                <p>No tienes tests de ciclismo todavía.</p>
              </div>
            ) : tests.ciclismo.map((t: any) => (
              <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-lg text-yellow-400">FTP: {t.ftp} W</p>
                    <p className="text-gray-400 text-sm">{t.fecha}</p>
                  </div>
                  <span className="bg-yellow-900 text-yellow-300 text-xs px-3 py-1 rounded-full">Test ciclismo</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Potencia pico</p>
                    <p className="font-bold">{t.potencia_pico} W</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Incremento/escalón</p>
                    <p className="font-bold">{t.incremento_potencia} W</p>
                  </div>
                </div>
                {t.ftp && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Zonas de potencia</p>
                    <div className="grid gap-1.5">
                      {[
                        { z: 1, nombre: 'Recuperación', pct: [0, 55], color: 'bg-gray-700' },
                        { z: 2, nombre: 'Aeróbica', pct: [56, 75], color: 'bg-blue-900' },
                        { z: 3, nombre: 'Tempo', pct: [76, 90], color: 'bg-green-900' },
                        { z: 4, nombre: 'Umbral', pct: [91, 105], color: 'bg-yellow-900' },
                        { z: 5, nombre: 'VO₂máx', pct: [106, 120], color: 'bg-orange-900' },
                        { z: 6, nombre: 'Anaeróbica', pct: [121, 150], color: 'bg-red-900' },
                      ].map(z => {
                        const wMin = Math.round(t.ftp * z.pct[0] / 100)
                        const wMax = Math.round(t.ftp * z.pct[1] / 100)
                        return (
                          <div key={z.z} className={'flex justify-between items-center px-3 py-2 rounded-lg ' + z.color}>
                            <span className="text-xs font-medium">Z{z.z} {z.nombre}</span>
                            <span className="text-xs text-gray-300">{wMin} – {wMax} W</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* FUERZA */}
        {pestana === 'fuerza' && (
          <div className="flex flex-col gap-4">
            {tests.fuerza.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">💪</div>
                <p>No tienes tests de fuerza todavía.</p>
              </div>
            ) : (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-700 bg-gray-800">
                      <th className="text-left py-3 px-4">Ejercicio</th>
                      <th className="text-left py-3 px-4">Grupo</th>
                      <th className="text-center py-3 px-4">Peso</th>
                      <th className="text-center py-3 px-4">Reps</th>
                      <th className="text-center py-3 px-4">1RM est.</th>
                      <th className="text-left py-3 px-4">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.fuerza.map((t: any) => (
                      <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800">
                        <td className="py-3 px-4 font-medium">{t.ejercicio}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{t.grupo_muscular}</td>
                        <td className="py-3 px-4 text-center">{t.peso_kg} kg</td>
                        <td className="py-3 px-4 text-center">{t.repeticiones}</td>
                        <td className="py-3 px-4 text-center font-bold text-red-400">{t.rm_estimado} kg</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{t.fecha}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

