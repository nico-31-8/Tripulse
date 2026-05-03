'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

const COLOR_TIPO_MESO: Record<string, string> = {
  'Acumulación': 'bg-orange-500',
  'Acumulacion': 'bg-orange-500',
  'Transmutación': 'bg-yellow-500',
  'Transmutacion': 'bg-yellow-500',
  'Realización': 'bg-red-500',
  'Realizacion': 'bg-red-500',
  'Recuperación': 'bg-green-500',
  'Recuperacion': 'bg-green-500',
}

const COLOR_TIPO_MICRO: Record<string, string> = {
  'Carga': 'bg-orange-400',
  'Recuperación': 'bg-green-400',
  'Recuperacion': 'bg-green-400',
  'Competición': 'bg-blue-400',
  'Competicion': 'bg-blue-400',
}

const COLOR_DISCIPLINA: Record<string, string> = {
  'Natacion': 'bg-blue-500',
  'Natación': 'bg-blue-500',
  'Ciclismo': 'bg-yellow-500',
  'Carrera': 'bg-green-500',
  'Fuerza': 'bg-red-500',
  'Brick': 'bg-purple-500',
}

const DIAS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

export default function PlanificacionVisual({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  const [macrociclos, setMacrociclos] = useState<any[]>([])
  const [nivel, setNivel] = useState<'macro' | 'meso' | 'micro' | 'sesiones'>('macro')
  const [macroSel, setMacroSel] = useState<any>(null)
  const [mesociclos, setMesociclos] = useState<any[]>([])
  const [mesoSel, setMesoSel] = useState<any>(null)
  const [microciclos, setMicrociclos] = useState<any[]>([])
  const [microSel, setMicroSel] = useState<any>(null)
  const [sesiones, setSesiones] = useState<any[]>([])

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    const { data: mac } = await supabase.from('macrociclo').select('*').eq('id_deportista', id).order('fecha_inicio')
    setMacrociclos(mac || [])
  }

  const verMesociclos = async (macro: any) => {
    setMacroSel(macro)
    const { data } = await supabase.from('mesociclo').select('*').eq('id_macrociclo', macro.id).order('fecha_inicio')
    setMesociclos(data || [])
    setNivel('meso')
  }

  const verMicrociclos = async (meso: any) => {
    setMesoSel(meso)
    const { data } = await supabase.from('microciclo').select('*').eq('id_mesociclo', meso.id).order('fecha_inicio')
    setMicrociclos(data || [])
    setNivel('micro')
  }

  const verSesiones = async (micro: any) => {
    setMicroSel(micro)
    const { data } = await supabase.from('sesion').select('*').eq('id_microciclo', micro.id).order('fecha_sesion')
    setSesiones(data || [])
    setNivel('sesiones')
  }

  const volver = () => {
    if (nivel === 'sesiones') setNivel('micro')
    else if (nivel === 'micro') setNivel('meso')
    else if (nivel === 'meso') setNivel('macro')
  }

  const intensidadAltura = (intensidad: number | null) => {
    if (!intensidad) return 'h-8'
    if (intensidad <= 3) return 'h-6'
    if (intensidad <= 5) return 'h-10'
    if (intensidad <= 7) return 'h-14'
    return 'h-20'
  }

  const getSesionesPorDia = (fechaInicio: string) => {
    const inicio = new Date(fechaInicio)
    const dias: any[] = []
    for (let i = 0; i < 7; i++) {
      const dia = new Date(inicio)
      dia.setDate(inicio.getDate() + i)
      const fechaStr = dia.toISOString().split('T')[0]
      const sesionesDia = sesiones.filter(s => s.fecha_sesion === fechaStr)
      dias.push({ fecha: fechaStr, sesiones: sesionesDia })
    }
    return dias
  }

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/deportistas/' + id} className="text-gray-400 hover:text-white text-sm transition">← Perfil deportista</button>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6 text-sm text-gray-400">
          <button onClick={() => setNivel('macro')} className="hover:text-orange-400 transition">Macrociclos</button>
          {nivel !== 'macro' && <><span>→</span><button onClick={() => setNivel('meso')} className="hover:text-orange-400 transition">{macroSel?.objetivo}</button></>}
          {(nivel === 'micro' || nivel === 'sesiones') && <><span>→</span><button onClick={() => setNivel('micro')} className="hover:text-orange-400 transition">{mesoSel?.objetivo}</button></>}
          {nivel === 'sesiones' && <><span>→</span><span className="text-white">{microSel?.objetivo}</span></>}
        </div>

        {nivel !== 'macro' && (
          <button onClick={volver} className="mb-6 text-gray-400 hover:text-white text-sm transition flex items-center gap-1">← Volver</button>
        )}

        {nivel === 'macro' && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Planificacion — {deportista.nombre}</h2>
            <p className="text-gray-400 text-sm mb-6">Pulsa un macrociclo para ver sus bloques de entrenamiento</p>

            <div className="flex gap-3 mb-4 flex-wrap">
              {[['bg-orange-500','Acumulacion'],['bg-yellow-500','Transmutacion'],['bg-red-500','Realizacion'],['bg-green-500','Recuperacion']].map(([color, label]) => (
                <div key={label} className="flex items-center gap-1">
                  <div className={'w-3 h-3 rounded-sm ' + color} />
                  <span className="text-gray-400 text-xs">{label}</span>
                </div>
              ))}
            </div>

            {macrociclos.length === 0 ? (
              <div className="text-center py-16 text-gray-500"><div className="text-5xl mb-4">📅</div><p>No hay macrociclos todavia.</p></div>
            ) : (
              <div className="grid gap-4">
                {macrociclos.map(async (mac) => {
                  return (
                    <MacroCard key={mac.id} mac={mac} onClick={() => verMesociclos(mac)} />
                  )
                })}
              </div>
            )}
          </div>
        )}

        {nivel === 'meso' && (
          <div>
            <h2 className="text-2xl font-bold mb-1">{macroSel?.objetivo}</h2>
            <p className="text-gray-400 text-sm mb-6">{macroSel?.duracion_semanas} semanas · Inicio: {macroSel?.fecha_inicio}</p>
            <p className="text-gray-500 text-sm mb-4">Pulsa un mesociclo para ver sus semanas</p>
            {mesociclos.length === 0 ? (
              <div className="text-center py-12 text-gray-500"><p>No hay mesociclos en este macrociclo.</p></div>
            ) : (
              <div className="flex gap-3 items-end flex-wrap">
                {mesociclos.map(meso => (
                  <button key={meso.id} onClick={() => verMicrociclos(meso)}
                    className={'rounded-xl p-4 border-2 border-transparent hover:border-white transition text-left flex flex-col justify-end ' + (COLOR_TIPO_MESO[meso.tipo] || 'bg-gray-700')}
                    style={{ width: Math.max(120, (meso.duracion_semanas || 4) * 40) + 'px', height: Math.max(80, (meso.intensidad_relativa || 5) * 16) + 'px' }}>
                    <p className="text-white font-bold text-sm truncate">{meso.objetivo}</p>
                    <p className="text-white text-opacity-80 text-xs">{meso.tipo}</p>
                    <p className="text-white text-opacity-60 text-xs">{meso.duracion_semanas} sem · Int: {meso.intensidad_relativa || '—'}/10</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {nivel === 'micro' && (
          <div>
            <h2 className="text-2xl font-bold mb-1">{mesoSel?.objetivo}</h2>
            <p className="text-gray-400 text-sm mb-6">{mesoSel?.tipo} · {mesoSel?.duracion_semanas} semanas</p>
            <p className="text-gray-500 text-sm mb-4">Pulsa una semana para ver sus sesiones</p>
            {microciclos.length === 0 ? (
              <div className="text-center py-12 text-gray-500"><p>No hay semanas en este mesociclo.</p></div>
            ) : (
              <div className="flex gap-3 items-end flex-wrap">
                {microciclos.map((micro, i) => (
                  <button key={micro.id} onClick={() => verSesiones(micro)}
                    className={'rounded-xl p-4 border-2 border-transparent hover:border-white transition text-left ' + (COLOR_TIPO_MICRO[micro.tipo] || 'bg-gray-700')}
                    style={{ width: '140px', height: Math.max(80, 80) + 'px' }}>
                    <p className="text-white font-bold text-sm">Sem {i + 1}</p>
                    <p className="text-white text-xs opacity-80">{micro.objetivo}</p>
                    <p className="text-white text-xs opacity-60">{micro.tipo}</p>
                    <p className="text-white text-xs opacity-60">{micro.fecha_inicio}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {nivel === 'sesiones' && (
          <div>
            <h2 className="text-2xl font-bold mb-1">{microSel?.objetivo}</h2>
            <p className="text-gray-400 text-sm mb-6">{microSel?.tipo} · Inicio: {microSel?.fecha_inicio}</p>
            <div className="grid grid-cols-7 gap-2">
              {DIAS.map((dia, i) => {
                const diasSemana = getSesionesPorDia(microSel?.fecha_inicio || '')
                const diaData = diasSemana[i]
                return (
                  <div key={dia} className="bg-gray-900 rounded-xl p-3 border border-gray-800 min-h-24">
                    <p className="text-gray-400 text-xs font-medium mb-2">{dia}</p>
                    {diaData?.sesiones.length === 0 ? (
                      <p className="text-gray-700 text-xs">Descanso</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {diaData?.sesiones.map((s: any) => (
                          <button key={s.id} onClick={() => window.location.href = '/sesion/' + s.id}
                            className={'w-full rounded-lg p-2 text-left hover:opacity-80 transition ' + (COLOR_DISCIPLINA[s.disciplina] || 'bg-gray-700')}>
                            <p className="text-white text-xs font-bold">{s.disciplina}</p>
                            <p className="text-white text-xs opacity-80">{s.duracion_minutos ? s.duracion_minutos + 'min' : '—'}</p>
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
      </div>
    </main>
  )
}

function MacroCard({ mac, onClick }: { mac: any, onClick: () => void }) {
  const [mesociclos, setMesociclos] = useState<any[]>([])

  useEffect(() => {
    supabase.from('mesociclo').select('*').eq('id_macrociclo', mac.id).order('fecha_inicio').then(({ data }) => setMesociclos(data || []))
  }, [mac.id])

  return (
    <button onClick={onClick} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left w-full">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-lg">{mac.objetivo}</h3>
          <p className="text-gray-400 text-sm">Inicio: {mac.fecha_inicio} · {mac.duracion_semanas} semanas</p>
        </div>
        <span className="text-orange-500 text-sm">Ver detalle →</span>
      </div>
      {mesociclos.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs mb-2">Bloques de entrenamiento</p>
          <div className="flex gap-1 items-end">
            {mesociclos.map(meso => (
              <div key={meso.id}
                className={'rounded-md flex items-end justify-center ' + (COLOR_TIPO_MESO[meso.tipo] || 'bg-gray-600')}
                style={{
                  width: Math.max(30, (meso.duracion_semanas || 4) * 20) + 'px',
                  height: Math.max(24, (meso.intensidad_relativa || 5) * 8) + 'px'
                }}
                title={meso.objetivo + ' — ' + meso.tipo}>
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {mesociclos.map(meso => (
              <div key={meso.id} style={{ width: Math.max(30, (meso.duracion_semanas || 4) * 20) + 'px' }}>
                <p className="text-gray-500 text-xs truncate">{meso.tipo?.slice(0,4)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </button>
  )
}
