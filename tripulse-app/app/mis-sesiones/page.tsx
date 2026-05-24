'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function MisSesiones() {
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista'|'calendario'>('lista')
  const [mesActual, setMesActual] = useState(new Date())

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: dep } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
      if (dep) {
        const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
      const macroIds = (macros || []).map((m: any) => m.id)
      const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
      const mesoIds = (mesos || []).map((m: any) => m.id)
      const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
      const microIds = (micros || []).map((m: any) => m.id)
      const { data } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).order('fecha_sesion')
        setSesiones(data || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const colorDisciplina = (d: string) => {
    if (!d) return 'bg-gray-500'
    if (d.includes('Nat')) return 'bg-blue-500'
    if (d === 'Ciclismo') return 'bg-yellow-500'
    if (d === 'Carrera') return 'bg-green-500'
    if (d === 'Fuerza') return 'bg-red-500'
    return 'bg-purple-500'
  }

  const colorDisciplinaTexto = (d: string) => {
    if (!d) return 'bg-gray-700 text-gray-300'
    if (d.includes('Nat')) return 'bg-blue-900 text-blue-300'
    if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
    if (d === 'Carrera') return 'bg-green-900 text-green-300'
    if (d === 'Fuerza') return 'bg-red-900 text-red-300'
    return 'bg-purple-900 text-purple-300'
  }

  const getDias14 = () => {
    const dias = []
    const hoy = new Date()
    for (let i = 0; i < 14; i++) {
      const dia = new Date(hoy)
      dia.setDate(hoy.getDate() + i)
      const fechaStr = dia.toISOString().split('T')[0]
      const sesionesDia = sesiones.filter(s => s.fecha_sesion === fechaStr)
      dias.push({ fecha: dia, fechaStr, sesiones: sesionesDia })
    }
    return dias
  }

  const getDiasCalendario = () => {
    const año = mesActual.getFullYear()
    const mes = mesActual.getMonth()
    const primerDia = new Date(año, mes, 1)
    const ultimoDia = new Date(año, mes + 1, 0)
    const dias: any[] = []
    for (let i = 0; i < primerDia.getDay(); i++) dias.push(null)
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const fecha = new Date(año, mes, d)
      const fechaStr = fecha.toISOString().split('T')[0]
      const sesionesDia = sesiones.filter(s => s.fecha_sesion === fechaStr)
      dias.push({ fecha, fechaStr, sesiones: sesionesDia })
    }
    return dias
  }

  const hoyStr = new Date().toISOString().split('T')[0]

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <button onClick={() => window.location.href = '/dashboard-deportista'} className="text-gray-400 hover:text-white text-sm transition">← Mi panel</button>
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Mis sesiones</h2>
          <div className="flex gap-2">
            <button onClick={() => setVista('lista')} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${vista === 'lista' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>📋 Lista</button>
            <button onClick={() => setVista('calendario')} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${vista === 'calendario' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>📅 Calendario</button>
          </div>
        </div>

        {vista === 'lista' && (
          <div>
            <p className="text-gray-400 text-sm mb-4">Proximas 2 semanas</p>
            <div className="grid gap-3">
              {getDias14().map(({ fecha, fechaStr, sesiones: sesionesDia }) => {
                const esHoy = fechaStr === hoyStr
                return (
                  <div key={fechaStr} className={'rounded-xl border ' + (esHoy ? 'border-orange-500 bg-gray-900' : sesionesDia.length > 0 ? 'border-gray-700 bg-gray-900' : 'border-gray-800 bg-gray-900 opacity-40')}>
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className={'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ' + (esHoy ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400')}>
                          {fecha.getDate()}
                        </div>
                        <div>
                          <p className={'font-medium ' + (esHoy ? 'text-orange-400' : 'text-white')}>
                            {DIAS_SEMANA[fecha.getDay()]} {fecha.getDate()} {MESES[fecha.getMonth()]}
                            {esHoy && <span className="ml-2 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">Hoy</span>}
                          </p>
                          {sesionesDia.length === 0 && <p className="text-gray-500 text-xs">Descanso</p>}
                        </div>
                      </div>
                      {sesionesDia.length > 0 && (
                        <div className="flex gap-2 flex-wrap justify-end">
                          {sesionesDia.map(s => (
                            <span key={s.id} className={'text-xs px-2 py-1 rounded-full text-white ' + colorDisciplina(s.disciplina)}>{s.disciplina}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {sesionesDia.length > 0 && (
                      <div className="border-t border-gray-800 px-4 pb-4 pt-3 flex flex-col gap-2">
                        {sesionesDia.map(s => (
                          <button key={s.id} onClick={() => window.location.href = '/sesion/' + s.id} className="flex justify-between items-center hover:bg-gray-800 rounded-lg p-2 transition text-left w-full">
                            <div>
                              <p className="font-medium text-sm">{s.disciplina}</p>
                              <p className="text-gray-400 text-xs">{s.duracion_minutos ? s.duracion_minutos + ' min' : '—'} · RPE est: {s.rpe_estimado || '—'}</p>
                              {s.notas_entrenador && <p className="text-gray-400 text-xs italic mt-1">"{s.notas_entrenador}"</p>}
                            </div>
                            <span className="text-orange-500 text-sm">Ver →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {vista === 'calendario' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))} className="text-gray-400 hover:text-white px-3 py-1 rounded-lg hover:bg-gray-800 transition">←</button>
              <h3 className="font-bold text-lg">{MESES[mesActual.getMonth()]} {mesActual.getFullYear()}</h3>
              <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))} className="text-gray-400 hover:text-white px-3 py-1 rounded-lg hover:bg-gray-800 transition">→</button>
            </div>
            <div className="grid grid-cols-7 mb-2">
              {DIAS_SEMANA.map(d => <div key={d} className="text-center text-gray-500 text-xs py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {getDiasCalendario().map((dia, i) => {
                if (!dia) return <div key={i} />
                const esHoy = dia.fechaStr === hoyStr
                return (
                  <div key={dia.fechaStr} className={'rounded-lg p-1 min-h-14 ' + (esHoy ? 'bg-orange-500 bg-opacity-20 border border-orange-500' : dia.sesiones.length > 0 ? 'bg-gray-800' : 'bg-gray-900')}>
                    <p className={'text-xs font-medium mb-1 ' + (esHoy ? 'text-orange-400' : 'text-gray-400')}>{dia.fecha.getDate()}</p>
                    <div className="flex flex-col gap-0.5">
                      {dia.sesiones.map((s: any) => (
                        <button key={s.id} onClick={() => window.location.href = '/sesion/' + s.id} className={'w-full h-2 rounded-full ' + colorDisciplina(s.disciplina)} title={s.disciplina} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-4 flex-wrap">
              {['Natacion','Ciclismo','Carrera','Fuerza'].map(d => (
                <div key={d} className="flex items-center gap-1">
                  <div className={'w-3 h-3 rounded-full ' + colorDisciplina(d)} />
                  <span className="text-gray-400 text-xs">{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
