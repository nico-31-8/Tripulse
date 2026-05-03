'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function calcularIndices(tarea: any, fcUmbral: number, rpeEstimado: number) {
  if (!tarea.fc_media || !tarea.rpe_reportado || !fcUmbral) return null
  const fcRelativa = tarea.fc_media / fcUmbral
  const cargaObjetiva = fcRelativa * 10
  const indicePer = tarea.rpe_reportado / cargaObjetiva
  const indicePlan = rpeEstimado > 0 ? cargaObjetiva / rpeEstimado : null
  return { fcRelativa, cargaObjetiva, indicePer, indicePlan }
}

function semaforo(valor: number | null, tipo: 'percepcion' | 'planificacion') {
  if (valor === null) return { color: 'gray', texto: 'Sin datos', bg: 'bg-gray-800 border-gray-600' }
  if (tipo === 'percepcion') {
    if (valor < 0.85) return { color: 'green', texto: 'Infraperceptor', bg: 'bg-green-900 border-green-500', desc: 'Aguanta más de lo que cree' }
    if (valor <= 1.15) return { color: 'yellow', texto: 'Calibrado', bg: 'bg-yellow-900 border-yellow-500', desc: 'Percepción ajustada' }
    return { color: 'red', texto: 'Sobreperceptor', bg: 'bg-red-900 border-red-500', desc: 'Se frena antes de lo necesario' }
  } else {
    if (valor < 0.85) return { color: 'green', texto: 'Por debajo', bg: 'bg-green-900 border-green-500', desc: 'Sesión más suave de lo previsto' }
    if (valor <= 1.15) return { color: 'yellow', texto: 'Según el plan', bg: 'bg-yellow-900 border-yellow-500', desc: 'Carga ejecutada como se diseñó' }
    return { color: 'red', texto: 'Por encima', bg: 'bg-red-900 border-red-500', desc: 'Sesión más dura de lo previsto' }
  }
}

function lecturaDoble(per: any, plan: any) {
  if (!per || !plan) return null
  if (per.color === 'yellow' && plan.color === 'yellow') return { texto: 'Sesión perfecta', accion: 'Continuar con la programación', color: 'text-green-400' }
  if (per.color === 'yellow' && plan.color === 'green') return { texto: 'Sesión suave bien vivida', accion: 'Valorar incremento de carga', color: 'text-green-400' }
  if (per.color === 'yellow' && plan.color === 'red') return { texto: 'Bien vivida pero excedida', accion: 'Más recuperación semana siguiente', color: 'text-orange-400' }
  if (per.color === 'red' && plan.color === 'yellow') return { texto: 'Techo psicológico', accion: 'Trabajar gestión del esfuerzo percibido', color: 'text-orange-400' }
  if (per.color === 'red' && plan.color === 'red') return { texto: 'Doble problema', accion: 'Revisar planificación y gestión mental', color: 'text-red-400' }
  if (per.color === 'green' && plan.color === 'red') return { texto: '⚠️ ALERTA MÁXIMA', accion: 'Reducir carga inmediatamente — riesgo lesión', color: 'text-red-400' }
  if (per.color === 'green' && plan.color === 'yellow') return { texto: 'Margen oculto', accion: 'Valorar incremento progresivo con cautela', color: 'text-yellow-400' }
  if (per.color === 'green' && plan.color === 'green') return { texto: 'Sesión muy suave', accion: 'Semana de recuperación bien ejecutada', color: 'text-green-400' }
  return null
}

export default function IndicesPage() {
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingSes, setLoadingSes] = useState(false)

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

  const verIndices = async (dep: any) => {
    setSeleccionado(dep)
    setLoadingSes(true)
    const fcUmbral = dep.fc_maxima ? dep.fc_maxima * 0.85 : 0

    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
    const macroIds = (macros || []).map((m: any) => m.id)
    if (!macroIds.length) { setSesiones([]); setLoadingSes(false); return }

    const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
    const mesoIds = (mesos || []).map((m: any) => m.id)
    if (!mesoIds.length) { setSesiones([]); setLoadingSes(false); return }

    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
    const microIds = (micros || []).map((m: any) => m.id)
    if (!microIds.length) { setSesiones([]); setLoadingSes(false); return }

    const { data: ses } = await supabase
      .from('sesion')
      .select('*')
      .in('id_microciclo', microIds)
      .eq('estado', 'Realizada')
      .order('fecha_sesion', { ascending: false })
      .limit(20)

    const sesConIndices = await Promise.all((ses || []).map(async s => {
      const { data: tareas } = await supabase
        .from('tarea')
        .select('rpe_reportado, fc_media, sensacion_tecnica')
        .eq('id_sesion', s.id)
        .not('rpe_reportado', 'is', null)
      const tarea = tareas?.[0]
      const indices = tarea ? calcularIndices(tarea, fcUmbral, s.rpe_estimado || 0) : null
      const per = indices ? semaforo(indices.indicePer, 'percepcion') : null
      const plan = indices ? semaforo(indices.indicePlan, 'planificacion') : null
      const lectura = per && plan ? lecturaDoble(per, plan) : null
      return { ...s, tarea, indices, per, plan, lectura }
    }))

    setSesiones(sesConIndices)
    setLoadingSes(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Análisis de Índices</h2>
        <p className="text-gray-400 mb-6 text-sm">Índice de percepción · Índice de planificación · Semáforo de doble dimensión</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {deportistas.map(d => (
            <button key={d.id} onClick={() => verIndices(d)}
              className={'rounded-xl p-5 border-2 text-left transition ' +
                (seleccionado?.id === d.id ? 'bg-orange-500 border-orange-400' : 'bg-gray-900 border-gray-700 hover:border-orange-500')}>
              <h3 className="font-bold text-lg">{d.nombre}</h3>
              <p className="text-sm opacity-70">FC máx: {d.fc_maxima || '—'} ppm · FC umbral est: {d.fc_maxima ? Math.round(d.fc_maxima * 0.85) : '—'} ppm</p>
            </button>
          ))}
        </div>

        {loadingSes && <div className="text-center py-16 text-gray-400">Calculando índices...</div>}

        {!loadingSes && seleccionado && sesiones.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">📊</div>
            <p>No hay sesiones realizadas con datos suficientes.</p>
            <p className="text-sm mt-2 text-gray-600">Necesita sesiones con RPE reportado y FC media registrados.</p>
          </div>
        )}

        {!loadingSes && sesiones.length > 0 && (
          <div className="grid gap-4">
            {sesiones.map(s => (
              <div key={s.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg">{s.fecha_sesion}</span>
                      <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">{s.disciplina}</span>
                    </div>
                    <p className="text-gray-400 text-sm">RPE planificado: {s.rpe_estimado || '—'} · Duración: {s.duracion_minutos || '—'} min</p>
                  </div>
                  {s.lectura && (
                    <div className="text-right">
                      <p className={'font-bold text-sm ' + s.lectura.color}>{s.lectura.texto}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{s.lectura.accion}</p>
                    </div>
                  )}
                </div>

                {s.indices ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className={'rounded-lg p-4 border ' + (s.per?.bg || 'bg-gray-800 border-gray-700')}>
                      <p className="text-xs text-gray-300 uppercase tracking-wide mb-1">Índice de percepción</p>
                      <p className="text-2xl font-bold text-white">{s.indices.indicePer?.toFixed(2)}</p>
                      <p className="font-medium text-sm mt-1">{s.per?.texto}</p>
                      <p className="text-xs opacity-75 mt-0.5">{s.per?.desc}</p>
                      <div className="mt-2 text-xs text-gray-400">
                        <span>RPE real: {s.tarea?.rpe_reportado} · </span>
                        <span>Carga objetiva: {s.indices.cargaObjetiva?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className={'rounded-lg p-4 border ' + (s.plan?.bg || 'bg-gray-800 border-gray-700')}>
                      <p className="text-xs text-gray-300 uppercase tracking-wide mb-1">Índice de planificación</p>
                      <p className="text-2xl font-bold text-white">{s.indices.indicePlan?.toFixed(2) || '—'}</p>
                      <p className="font-medium text-sm mt-1">{s.plan?.texto}</p>
                      <p className="text-xs opacity-75 mt-0.5">{s.plan?.desc}</p>
                      <div className="mt-2 text-xs text-gray-400">
                        <span>FC relativa: {(s.indices.fcRelativa * 100).toFixed(0)}% · </span>
                        <span>RPE plan: {s.rpe_estimado || '—'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <p className="text-gray-500 text-sm">Sin datos de RPE o FC para calcular índices</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">Referencia — Semáforo de doble dimensión</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 px-3">Percepción</th>
                  <th className="text-left py-2 px-3">Planificación</th>
                  <th className="text-left py-2 px-3">Lectura</th>
                  <th className="text-left py-2 px-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { per: '🟡 Calibrado', plan: '🟡 Según plan', lectura: 'Sesión perfecta', accion: 'Continuar con la programación' },
                  { per: '🟡 Calibrado', plan: '🟢 Por debajo', lectura: 'Sesión suave bien vivida', accion: 'Valorar incremento de carga' },
                  { per: '🟡 Calibrado', plan: '🔴 Por encima', lectura: 'Bien vivida pero excedida', accion: 'Más recuperación la semana siguiente' },
                  { per: '🔴 Sobreperceptor', plan: '🟡 Según plan', lectura: 'Techo psicológico', accion: 'Trabajar gestión del esfuerzo percibido' },
                  { per: '🔴 Sobreperceptor', plan: '🔴 Por encima', lectura: 'Doble problema', accion: 'Revisar planificación y gestión mental' },
                  { per: '🟢 Infraperceptor', plan: '🔴 Por encima', lectura: '⚠️ ALERTA MÁXIMA', accion: 'Reducir carga — riesgo lesión invisible' },
                  { per: '🟢 Infraperceptor', plan: '🟡 Según plan', lectura: 'Margen oculto', accion: 'Valorar incremento progresivo con cautela' },
                  { per: '🟢 Infraperceptor', plan: '🟢 Por debajo', lectura: 'Sesión muy suave', accion: 'Semana de recuperación bien ejecutada' },
                ].map((r, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-2 px-3">{r.per}</td>
                    <td className="py-2 px-3">{r.plan}</td>
                    <td className="py-2 px-3 font-medium text-white">{r.lectura}</td>
                    <td className="py-2 px-3 text-gray-400">{r.accion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
