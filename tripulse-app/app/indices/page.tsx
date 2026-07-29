'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'

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
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingSes, setLoadingSes] = useState(false)
  const [rango, setRango] = useState(30)

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(deps || [])
      setLoading(false)
      const d0 = (deps || []).find(d => d.id === getAtletaActivo())
      if (d0) verIndices(d0)
    }
    cargar()
  }, [])

  const verIndices = async (dep: any) => {
    setSeleccionado(dep)
    setAtletaActivo(dep.id)
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

  const sesionesConDatos = sesiones.filter(s => s.indices)
  const sesionesRango = rango === 365 ? sesionesConDatos : sesionesConDatos.filter(s => {
    const d = new Date(s.fecha_sesion)
    const limite = new Date(); limite.setDate(limite.getDate() - rango)
    return d >= limite
  })

  const mediaPercepcion = sesionesRango.length ? sesionesRango.reduce((acc, s) => acc + s.indices.indicePer, 0) / sesionesRango.length : null
  const mediaPlanificacion = sesionesRango.filter(s => s.indices.indicePlan !== null).length ?
    sesionesRango.filter(s => s.indices.indicePlan !== null).reduce((acc, s) => acc + s.indices.indicePlan, 0) /
    sesionesRango.filter(s => s.indices.indicePlan !== null).length : null

  const semaforoMediaPer = semaforo(mediaPercepcion, 'percepcion')
  const semaforoMediaPlan = semaforo(mediaPlanificacion, 'planificacion')
  const lecturaMedia = semaforoMediaPer && semaforoMediaPlan ? lecturaDoble(semaforoMediaPer, semaforoMediaPlan) : null

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-44 pr-5 h-[54px] flex justify-between items-center border-b border-gray-800 gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight leading-none">Índices</h2>
          {seleccionado && (
            <span className="text-[12.5px] text-gray-500 truncate">
              {seleccionado.nombre}
              <button onClick={() => setSeleccionado(null)} className="ml-2 text-orange-400 hover:text-orange-300 transition">cambiar</button>
            </span>
          )}
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition flex-none">← Dashboard</button>
      </nav>
      <div className="max-w-[1400px] mx-auto px-6 py-6">

        {/* Qué mide este módulo. No es carga ni volumen: es si el esfuerzo que reporta
            el atleta cuadra con su pulsómetro, y si lo planificado cuadra con lo que
            costó. Va siempre visible: con un atleta activo la pantalla de selección se
            salta, y ahí es justo donde hace falta entender qué se está mirando. */}
        <p className="text-gray-400 text-sm mb-6 max-w-2xl">
          ¿El esfuerzo que dice el atleta cuadra con lo que dice su pulsómetro? ¿Y lo que planificaste
          con lo que de verdad costó? El semáforo cruza las dos preguntas.
        </p>

        {!seleccionado && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => verIndices(d)}
                className="tp-card tp-tile p-5" style={{ ['--c' as any]: '#f97316' }}>
                <h3 className="font-bold text-[15px] tracking-tight">{d.nombre}</h3>
                <p className="text-[12px] text-gray-500 mt-1">FC máx {d.fc_maxima || '—'} · umbral est. {d.fc_maxima ? Math.round(d.fc_maxima * 0.85) : '—'} ppm</p>
              </button>
            ))}
          </div>
        )}

        {/* Selector de rango */}
        {seleccionado && !loadingSes && sesiones.length > 0 && (
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex gap-2 flex-wrap items-center">
              <p className="text-gray-500 text-xs uppercase tracking-wide mr-1">Período de análisis</p>
              {[{l:'7 días',v:7},{l:'14 días',v:14},{l:'30 días',v:30},{l:'Todo',v:365}].map(r => (
                <button key={r.v} onClick={() => setRango(r.v)}
                  className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                    (rango === r.v ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                  {r.l}
                </button>
              ))}
              <span className="text-gray-600 text-xs ml-2">{sesionesRango.length} sesiones con datos</span>
            </div>

            {sesionesRango.length > 0 && (
              <div className="tp-card p-5">
                <p className="text-sm font-medium text-gray-300 mb-4">Media del período</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Media percepción */}
                  <div className={'rounded-xl p-4 border ' + semaforoMediaPer.bg}>
                    <p className="text-xs text-gray-400 mb-1">Índice percepción medio</p>
                    <p className="text-3xl font-bold mb-1">{mediaPercepcion ? mediaPercepcion.toFixed(2) : '—'}</p>
                    <p className="font-medium text-sm">{semaforoMediaPer.texto}</p>
                    {'desc' in semaforoMediaPer && <p className="text-xs text-gray-400 mt-1">{(semaforoMediaPer as any).desc}</p>}
                  </div>
                  {/* Media planificación */}
                  <div className={'rounded-xl p-4 border ' + semaforoMediaPlan.bg}>
                    <p className="text-xs text-gray-400 mb-1">Índice planificación medio</p>
                    <p className="text-3xl font-bold mb-1">{mediaPlanificacion ? mediaPlanificacion.toFixed(2) : '—'}</p>
                    <p className="font-medium text-sm">{semaforoMediaPlan.texto}</p>
                    {'desc' in semaforoMediaPlan && <p className="text-xs text-gray-400 mt-1">{(semaforoMediaPlan as any).desc}</p>}
                  </div>
                </div>
                {lecturaMedia && (
                  <div className="mt-4 bg-gray-800 rounded-xl p-4">
                    <p className={'font-bold ' + lecturaMedia.color}>{lecturaMedia.texto}</p>
                    <p className="text-gray-400 text-sm mt-1">{lecturaMedia.accion}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
              <div key={s.id} className="tp-card p-5">
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

