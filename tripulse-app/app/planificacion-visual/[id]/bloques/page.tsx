'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import GraficaCarga from '@/components/GraficaCarga'
import GraficaPeriodizacion from '@/components/GraficaPeriodizacion'

const COLOR_MESO: Record<string, string> = {
  'Acumulación': 'bg-orange-500', 'Acumulacion': 'bg-orange-500',
  'Transmutación': 'bg-yellow-500', 'Transmutacion': 'bg-yellow-500',
  'Realización': 'bg-red-500', 'Realizacion': 'bg-red-500',
  'Recuperación': 'bg-green-500', 'Recuperacion': 'bg-green-500',
}
const COLOR_MICRO: Record<string, string> = {
  'Carga': 'bg-orange-400',
  'Recuperación': 'bg-green-400', 'Recuperacion': 'bg-green-400',
  'Competición': 'bg-blue-400', 'Competicion': 'bg-blue-400',
}
const COLOR_DISC: Record<string, string> = {
  'Natacion': 'bg-blue-500', 'Natación': 'bg-blue-500',
  'Ciclismo': 'bg-yellow-500', 'Carrera': 'bg-green-500',
  'Fuerza': 'bg-red-500', 'Brick': 'bg-purple-500',
}
const DIAS = ['Lun','Mar','Mie','Jue','Vie','Sab','Dom']

function fechaLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return y+'-'+m+'-'+dd
}

function Modal({ titulo, onClose, children }: { titulo: string, onClose: () => void, children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function MacroCard({ mac, onClick, onEditar, onBorrar }: { mac: any, onClick: () => void, onEditar: (mac: any) => void, onBorrar: (id: number) => void }) {
  const [mesos, setMesos] = useState<any[]>([])
  useEffect(() => {
    supabase.from('mesociclo').select('*').eq('id_macrociclo', mac.id).order('fecha_inicio').then(({ data }) => setMesos(data || []))
  }, [mac.id])
  return (
    <div onClick={onClick} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left w-full cursor-pointer">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-lg">{mac.objetivo}</h3>
          <p className="text-gray-400 text-sm">Inicio: {mac.fecha_inicio} · {mac.duracion_semanas} semanas{mac.tipo_periodizacion ? ' · ' + mac.tipo_periodizacion : ''}</p>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); onEditar(mac) }} className="text-gray-500 hover:text-orange-400 text-sm transition px-2 py-1 rounded-lg hover:bg-gray-800">✏️</button>
          <button onClick={e => { e.stopPropagation(); onBorrar(mac.id) }} className="text-gray-500 hover:text-red-400 text-sm transition px-2 py-1 rounded-lg hover:bg-gray-800">🗑</button>
          <span className="text-orange-500 text-sm">Ver →</span>
        </div>
      </div>
      {mesos.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs mb-2">Bloques</p>
          <div className="flex gap-1 items-end">
            {mesos.map(m => (
              <div key={m.id} className={'rounded-md ' + (COLOR_MESO[m.tipo]||'bg-gray-600')}
                style={{ width: Math.max(30,(m.duracion_semanas||4)*20)+'px', height: Math.max(24,(m.intensidad_relativa||5)*8)+'px' }}
                title={m.objetivo+' — '+m.tipo} />
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {mesos.map(m => (
              <div key={m.id} style={{ width: Math.max(30,(m.duracion_semanas||4)*20)+'px' }}>
                <p className="text-gray-500 text-xs truncate">{m.tipo?.slice(0,4)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PlanificacionVisual({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()
  const [deportista, setDeportista] = useState<any>(null)
  const [macros, setMacros] = useState<any[]>([])
  const [nivel, setNivel] = useState<'macro'|'meso'|'micro'|'sesiones'>('macro')
  const [macroSel, setMacroSel] = useState<any>(null)
  const [mesos, setMesos] = useState<any[]>([])
  const [mesoSel, setMesoSel] = useState<any>(null)
  const [micros, setMicros] = useState<any[]>([])
  const [microSel, setMicroSel] = useState<any>(null)
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [panelAbierto, setPanelAbierto] = useState(true)
  const [mostrarGraficaPanel, setMostrarGraficaPanel] = useState(false)
  const [macroExpandido, setMacroExpandido] = useState<number | null>(null)
  const [mesoExpandido, setMesoExpandido] = useState<number | null>(null)
  const [navMesos, setNavMesos] = useState<Record<number, any[]>>({})
  const [navMicros, setNavMicros] = useState<Record<number, any[]>>({})
  const [modalMeso, setModalMeso] = useState(false)
  const [modalMicro, setModalMicro] = useState(false)
  const [modalSesion, setModalSesion] = useState(false)
  const [diaSeleccionado, setDiaSeleccionado] = useState('')
  const [mesoObj, setMesoObj] = useState('')
  const [mesoTipo, setMesoTipo] = useState('')
  const [mesoFecha, setMesoFecha] = useState('')
  const [mesoDuracion, setMesoDuracion] = useState('')
  const [mesoIntensidad, setMesoIntensidad] = useState('')
  const [microObj, setMicroObj] = useState('')
  const [microTipo, setMicroTipo] = useState('')
  const [microFecha, setMicroFecha] = useState('')
  const [sesionDisc, setSesionDisc] = useState('')
  const [sesionDuracion, setSesionDuracion] = useState('')
  const [sesionRpe, setSesionRpe] = useState('')
  const [sesionNotas, setSesionNotas] = useState('')
  const [sesionCronometro, setSesionCronometro] = useState(false)
  const [modalEditarMacro, setModalEditarMacro] = useState(false)
  const [macroEditando, setMacroEditando] = useState<any>(null)
  const [editMacroObj, setEditMacroObj] = useState("")
  const [editMacroDuracion, setEditMacroDuracion] = useState("")
  const [editMacroFecha, setEditMacroFecha] = useState("")
  const [editMacroPeriodizacion, setEditMacroPeriodizacion] = useState("")
  const [tipoPeriodizacion, setTipoPeriodizacion] = useState('')

  useEffect(() => {
    supabase.from('deportista').select('*').eq('id', id).single().then(({ data }) => setDeportista(data))
    supabase.from('macrociclo').select('*').eq('id_deportista', id).order('fecha_inicio').then(({ data }) => setMacros(data || []))
  }, [id])

  const cargarNavMesos = async (macroId: number) => {
    if (navMesos[macroId]) return
    const { data } = await supabase.from('mesociclo').select('*').eq('id_macrociclo', macroId).order('fecha_inicio')
    setNavMesos(prev => ({ ...prev, [macroId]: data || [] }))
  }

  const cargarNavMicros = async (mesoId: number) => {
    if (navMicros[mesoId]) return
    const { data } = await supabase.from('microciclo').select('*').eq('id_mesociclo', mesoId).order('fecha_inicio')
    setNavMicros(prev => ({ ...prev, [mesoId]: data || [] }))
  }

  const verMesos = async (mac: any) => {
    setMacroSel(mac)
    const { data } = await supabase.from('mesociclo').select('*').eq('id_macrociclo', mac.id).order('fecha_inicio')
    setMesos(data || [])
    setNivel('meso')
  }

  const verMicros = async (meso: any) => {
    setMesoSel(meso)
    const { data } = await supabase.from('microciclo').select('*').eq('id_mesociclo', meso.id).order('fecha_inicio')
    setMicros(data || [])
    setNivel('micro')
  }

  const verSesiones = async (micro: any) => {
    setMicroSel(micro)
    const { data } = await supabase.from('sesion').select('*').eq('id_microciclo', micro.id).eq('eliminada', false).order('fecha_sesion')
    setSesiones(data || [])
    setNivel('sesiones')
  }

  const volver = () => {
    if (nivel === 'sesiones') setNivel('micro')
    else if (nivel === 'micro') setNivel('meso')
    else if (nivel === 'meso') setNivel('macro')
  }

  const guardarMeso = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error: errMeso } = await supabase.from('mesociclo').insert({
      id_macrociclo: macroSel.id, objetivo: mesoObj, tipo: mesoTipo,
      fecha_inicio: mesoFecha, duracion_semanas: Number(mesoDuracion),
      intensidad_relativa: mesoIntensidad ? Number(mesoIntensidad) : null
    })
    if (errMeso) { alert('Error: ' + errMeso.message); setLoading(false); return }
    const { data: mesoData } = await supabase.from('mesociclo').select('*').eq('id_macrociclo', macroSel.id).order('fecha_inicio')
    setMesos(mesoData || [])
    setMesoObj(''); setMesoTipo(''); setMesoFecha(''); setMesoDuracion(''); setMesoIntensidad('')
    setLoading(false)
  }

  const guardarMicro = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await supabase.from('microciclo').insert({ id_mesociclo: mesoSel.id, objetivo: microObj, tipo: microTipo, fecha_inicio: microFecha, duracion_dias: 7 })
    const { data } = await supabase.from('microciclo').select('*').eq('id_mesociclo', mesoSel.id).order('fecha_inicio')
    setMicros(data || [])
    setModalMicro(false)
    setMicroObj(''); setMicroTipo(''); setMicroFecha('')
    setLoading(false)
  }

  const guardarSesion = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await supabase.from('sesion').insert({
      id_microciclo: microSel.id, disciplina: sesionDisc, fecha_sesion: diaSeleccionado,
      duracion_minutos: sesionDuracion ? Number(sesionDuracion) : null,
      rpe_estimado: sesionRpe ? Number(sesionRpe) : null,
      notas_entrenador: sesionNotas, estado: 'Planificada', usar_cronometro: sesionCronometro
    })
    const { data } = await supabase.from('sesion').select('*').eq('id_microciclo', microSel.id).order('fecha_sesion')
    setSesiones(data || [])
    setModalSesion(false)
    setSesionDisc(''); setSesionDuracion(''); setSesionRpe(''); setSesionNotas(''); setSesionCronometro(false)
    setLoading(false)
  }

  const abrirModalSesion = (fecha: string) => { setDiaSeleccionado(fecha); setModalSesion(true) }

  const abrirEditarMacro = (mac: any) => {
    setMacroEditando(mac)
    setEditMacroObj(mac.objetivo || "")
    setEditMacroDuracion(mac.duracion_semanas || "")
    setEditMacroFecha(mac.fecha_inicio || "")
    setEditMacroPeriodizacion(mac.tipo_periodizacion || "")
    setModalEditarMacro(true)
  }

  const guardarEditarMacro = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await supabase.from("macrociclo").update({
      objetivo: editMacroObj,
      duracion_semanas: Number(editMacroDuracion),
      fecha_inicio: editMacroFecha,
      tipo_periodizacion: editMacroPeriodizacion || null,
    }).eq("id", macroEditando.id)
    const { data } = await supabase.from("macrociclo").select("*").eq("id_deportista", id).order("fecha_inicio")
    setMacros(data || [])
    setModalEditarMacro(false)
    setMacroEditando(null)
    setLoading(false)
  }

  const borrarMacro = async (macId: number) => {
    setLoading(true)
    // Borrar en cascada
    const { data: mesos } = await supabase.from("mesociclo").select("id").eq("id_macrociclo", macId)
    if (mesos?.length) {
      const { data: micros } = await supabase.from("microciclo").select("id").in("id_mesociclo", mesos.map(m => m.id))
      if (micros?.length) {
        await supabase.from("sesion").delete().in("id_microciclo", micros.map(m => m.id))
        await supabase.from("microciclo").delete().in("id_mesociclo", mesos.map(m => m.id))
      }
      await supabase.from("mesociclo").delete().eq("id_macrociclo", macId)
    }
    await supabase.from("macrociclo").delete().eq("id", macId)
    const { data } = await supabase.from("macrociclo").select("*").eq("id_deportista", id).order("fecha_inicio")
    setMacros(data || [])
    setLoading(false)
  }

  const diasSemana = (fechaInicio: string) => {
    const inicio = new Date(fechaInicio + 'T12:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio)
      d.setDate(inicio.getDate() + i)
      const str = fechaLocal(d)
      return { str, dia: DIAS[i], sesiones: sesiones.filter(s => s.fecha_sesion === str) }
    })
  }

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  const fcUmbral = deportista.fc_maxima ? Math.round(deportista.fc_maxima * 0.85) : 150
  const hoy = fechaLocal(new Date())

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center gap-4 border-b border-gray-800">
        <button onClick={() => router.push('/planificacion-visual/' + id + '/calendario')} className="text-orange-400 hover:text-orange-300 text-xs transition">📅 Calendario</button>
        <button onClick={() => router.push('/planificacion-visual/' + id + '/dibujo')} className="text-orange-400 hover:text-orange-300 text-xs transition">✏️ Dibujo</button>
        <button onClick={() => router.push('/planificacion-visual/' + id)} className="text-gray-400 hover:text-white text-sm transition">← Vistas</button>
        <button onClick={() => router.push('/deportistas/' + id)} className="text-gray-400 hover:text-white text-sm transition">← Perfil</button>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-4">

        {/* Panel lateral */}
        <div className={`flex-shrink-0 transition-all duration-300 ${panelAbierto ? 'w-56' : 'w-10'}`}>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden sticky top-6">
            <button onClick={() => setPanelAbierto(!panelAbierto)}
              className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-800 transition border-b border-gray-800">
              {panelAbierto && <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Navegación</span>}
              <span className="text-gray-400 text-sm">{panelAbierto ? '◀' : '▶'}</span>
            </button>

            {panelAbierto && (
              <div className="py-2 max-h-96 overflow-y-auto">
                {macros.map(mac => (
                  <div key={mac.id}>
                    <button
                      onClick={async () => {
                        const n = macroExpandido === mac.id ? null : mac.id
                        setMacroExpandido(n)
                        if (n) await cargarNavMesos(mac.id)
                        await verMesos(mac)
                      }}
                      className={'w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition flex justify-between items-center ' +
                        (macroSel?.id === mac.id ? 'text-orange-400 font-medium' : 'text-gray-300')}>
                      <span className="truncate">{mac.objetivo}</span>
                      <span className="text-gray-600 ml-1">{macroExpandido === mac.id ? '▾' : '▸'}</span>
                    </button>
                    {macroExpandido === mac.id && navMesos[mac.id]?.map(meso => (
                      <div key={meso.id}>
                        <button
                          onClick={async () => {
                            const n = mesoExpandido === meso.id ? null : meso.id
                            setMesoExpandido(n)
                            if (n) await cargarNavMicros(meso.id)
                            await verMicros(meso)
                          }}
                          className={'w-full text-left pl-5 pr-3 py-1.5 text-xs hover:bg-gray-800 transition flex justify-between items-center ' +
                            (mesoSel?.id === meso.id ? 'text-orange-300 font-medium' : 'text-gray-400')}>
                          <span className="truncate">{meso.objetivo}</span>
                          <span className="text-gray-600 ml-1">{mesoExpandido === meso.id ? '▾' : '▸'}</span>
                        </button>
                        {mesoExpandido === meso.id && navMicros[meso.id]?.map((micro, idx) => (
                          <button key={micro.id} onClick={() => verSesiones(micro)}
                            className={'w-full text-left pl-8 pr-3 py-1 text-xs hover:bg-gray-800 transition ' +
                              (microSel?.id === micro.id ? 'text-orange-200' : 'text-gray-500 hover:text-gray-300')}>
                            Sem {idx + 1} · {micro.tipo?.slice(0,3)}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
                {macros.length === 0 && <p className="text-gray-600 text-xs px-3 py-2">Sin macrociclos</p>}
              </div>
            )}

            {panelAbierto && (
              <div className="border-t border-gray-800 px-3 py-2">
                <button onClick={() => setMostrarGraficaPanel(v => !v)}
                  className={'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition ' +
                    (mostrarGraficaPanel ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700')}>
                  <span>📊</span>
                  <span>{mostrarGraficaPanel ? 'Ocultar carga' : 'Ver carga real'}</span>
                </button>
              </div>
            )}

            {panelAbierto && (
              <div className="border-t border-gray-800 p-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide px-1 mb-2">Calendario</p>
                {nivel === 'macro' && macros.map(mac => (
                  <div key={mac.id} className="mb-2">
                    <p className="text-xs text-gray-500 px-1 truncate">{mac.objetivo}</p>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {(navMesos[mac.id] || []).map(meso => (
                        <button key={meso.id} onClick={() => verMicros(meso)}
                          className={'w-full text-left px-2 py-1 rounded text-xs truncate ' +
                            (meso.tipo?.includes('Acum') ? 'bg-orange-900 text-orange-300' :
                             meso.tipo?.includes('Trans') ? 'bg-yellow-900 text-yellow-300' :
                             meso.tipo?.includes('Real') ? 'bg-red-900 text-red-300' :
                             'bg-green-900 text-green-300')}>
                          {meso.objetivo?.slice(0,18)} · {meso.duracion_semanas}sem
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {nivel === 'meso' && mesoSel && (
                  <div>
                    <p className="text-xs text-gray-500 px-1 truncate mb-1">{mesoSel.objetivo}</p>
                    <div className="flex flex-col gap-0.5">
                      {micros.map((micro, idx) => (
                        <button key={micro.id} onClick={() => verSesiones(micro)}
                          className={'w-full text-left px-2 py-1 rounded text-xs ' +
                            (microSel?.id === micro.id ? 'bg-orange-500 text-white' :
                             micro.tipo?.includes('Carga') ? 'bg-orange-900 text-orange-300 hover:bg-orange-800' :
                             micro.tipo?.includes('Recup') ? 'bg-green-900 text-green-300 hover:bg-green-800' :
                             'bg-blue-900 text-blue-300 hover:bg-blue-800')}>
                          Sem {idx+1} · {micro.fecha_inicio?.slice(5)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {nivel === 'sesiones' && microSel && (
                  <div>
                    <p className="text-xs text-gray-500 px-1 truncate mb-1">{microSel.objetivo}</p>
                    <div className="grid grid-cols-7 gap-0.5">
                      {['L','M','X','J','V','S','D'].map(d => (
                        <div key={d} className="text-center text-xs text-gray-600">{d}</div>
                      ))}
                      {diasSemana(microSel.fecha_inicio || '').map(({ str, sesiones: ses }) => {
                        const tieneSesion = ses.length > 0
                        const esHoyDia = str === hoy
                        return (
                          <button key={str}
                            onClick={() => tieneSesion ? router.push('/sesion/' + ses[0].id) : abrirModalSesion(str)}
                            className={'rounded text-xs py-1 text-center transition ' +
                              (esHoyDia ? 'bg-orange-500 text-white font-bold' :
                               tieneSesion ? 'bg-blue-800 text-blue-200 hover:bg-blue-700' :
                               'bg-gray-800 text-gray-500 hover:bg-gray-700')}>
                            {new Date(str + 'T12:00:00').getDate()}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 px-1">Pulsa día para añadir sesión</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 min-w-0">

          {mostrarGraficaPanel && deportista && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-bold text-white">📊 Carga real — {deportista.nombre}</h3>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {macroSel ? `Macrociclo: ${macroSel.objetivo}` : 'Todos los macrociclos'} · Solo sesiones con RPE reportado
                  </p>
                </div>
                <button onClick={() => setMostrarGraficaPanel(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
              </div>
              <GraficaCarga depId={Number(id)} fcUmbral={fcUmbral} modo="semana" fechaInicio={macroSel?.fecha_inicio || undefined} altura={280} />
            </div>
          )}

          <div className="flex items-center gap-2 mb-2 text-sm text-gray-400 flex-wrap">
            <button onClick={() => setNivel('macro')} className="hover:text-orange-400">Macrociclos</button>
            {nivel !== 'macro' && <><span>›</span><button onClick={() => setNivel('meso')} className="hover:text-orange-400">{macroSel?.objetivo}</button></>}
            {(nivel === 'micro' || nivel === 'sesiones') && <><span>›</span><button onClick={() => setNivel('micro')} className="hover:text-orange-400">{mesoSel?.objetivo}</button></>}
            {nivel === 'sesiones' && <><span>›</span><span className="text-white">{microSel?.objetivo}</span></>}
          </div>
          {nivel !== 'macro' && <button onClick={volver} className="text-gray-400 hover:text-white text-sm mb-4 block">← Volver</button>}

          {nivel === 'macro' && (
            <div>
              <h2 className="text-2xl font-bold mb-1">Planificacion — {deportista.nombre}</h2>
              <p className="text-gray-400 text-sm mb-4">Pulsa un macrociclo para ver sus bloques</p>
              <div className="flex gap-4 mb-4 flex-wrap">
                {[['bg-orange-500','Acumulacion'],['bg-yellow-500','Transmutacion'],['bg-red-500','Realizacion'],['bg-green-500','Recuperacion']].map(([c,l]) => (
                  <div key={l} className="flex items-center gap-1"><div className={'w-3 h-3 rounded-sm '+c}/><span className="text-gray-400 text-xs">{l}</span></div>
                ))}
              </div>
              {macros.length === 0
                ? <div className="text-center py-16 text-gray-500"><div className="text-5xl mb-4">📅</div><p>No hay macrociclos todavia.</p></div>
                : <div className="grid gap-4">{macros.map(m => <MacroCard key={m.id} mac={m} onClick={() => verMesos(m)} onEditar={abrirEditarMacro} onBorrar={borrarMacro} />)}</div>
              }
            </div>
          )}

          {nivel === 'meso' && (
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-1">{macroSel?.objetivo}</h2>
                  <p className="text-gray-400 text-sm">{macroSel?.duracion_semanas} semanas · Inicio: {macroSel?.fecha_inicio}{macroSel?.tipo_periodizacion ? ' · ' + macroSel?.tipo_periodizacion : ''}</p>
                </div>
                <button onClick={() => setModalMeso(true)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">+ Nuevo mesociclo</button>
              </div>
              <p className="text-gray-500 text-sm mb-4">Pulsa un bloque para ver sus semanas</p>
              {mesos.length === 0
                ? <p className="text-gray-500">No hay mesociclos. Crea el primero.</p>
                : <div className="flex gap-4 items-end flex-wrap">
                    {mesos.map(m => (
                      <button key={m.id} onClick={() => verMicros(m)}
                        className={'rounded-xl p-4 border-2 border-transparent hover:border-white transition text-left flex flex-col justify-end ' + (COLOR_MESO[m.tipo]||'bg-gray-700')}
                        style={{ width: Math.max(120,(m.duracion_semanas||4)*40)+'px', height: Math.max(80,(m.intensidad_relativa||5)*16)+'px' }}>
                        <p className="text-white font-bold text-sm truncate">{m.objetivo}</p>
                        <p className="text-white text-xs opacity-80">{m.tipo}</p>
                        <p className="text-white text-xs opacity-60">{m.duracion_semanas} sem · {m.intensidad_relativa||'—'}/10</p>
                      </button>
                    ))}
                  </div>
              }
            </div>
          )}

          {nivel === 'micro' && (
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-1">{mesoSel?.objetivo}</h2>
                  <p className="text-gray-400 text-sm">{mesoSel?.tipo} · {mesoSel?.duracion_semanas} semanas</p>
                </div>
                <button onClick={() => setModalMicro(true)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">+ Nueva semana</button>
              </div>
              <p className="text-gray-500 text-sm mb-4">Pulsa una semana para ver sus sesiones</p>
              {micros.length === 0
                ? <p className="text-gray-500">No hay semanas. Crea la primera.</p>
                : <div className="flex gap-3 flex-wrap">
                    {micros.map((m,i) => (
                      <button key={m.id} onClick={() => verSesiones(m)}
                        className={'rounded-xl p-4 border-2 border-transparent hover:border-white transition text-left w-36 ' + (COLOR_MICRO[m.tipo]||'bg-gray-700')}>
                        <p className="text-white font-bold">Sem {i+1}</p>
                        <p className="text-white text-xs opacity-80 truncate">{m.objetivo}</p>
                        <p className="text-white text-xs opacity-60">{m.tipo}</p>
                        <p className="text-white text-xs opacity-50">{m.fecha_inicio}</p>
                      </button>
                    ))}
                  </div>
              }
            </div>
          )}

          {nivel === 'sesiones' && (
            <div>
              <h2 className="text-2xl font-bold mb-1">{microSel?.objetivo}</h2>
              <p className="text-gray-400 text-sm mb-4">{microSel?.tipo} · Inicio: {microSel?.fecha_inicio}</p>
              <p className="text-gray-500 text-xs mb-4">Pulsa un dia para añadir una sesion</p>
              <div className="grid grid-cols-7 gap-2">
                {diasSemana(microSel?.fecha_inicio||'').map(({ str, dia, sesiones: ses }) => (
                  <div key={str} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                    <button onClick={() => abrirModalSesion(str)} className="w-full p-3 hover:bg-gray-800 transition text-left">
                      <p className="text-gray-400 text-xs font-medium">{dia}</p>
                      <p className="text-gray-600 text-xs">{str.slice(5)}</p>
                      {ses.length === 0 && <p className="text-gray-700 text-xs mt-1">+ Añadir</p>}
                    </button>
                    {ses.length > 0 && (
                      <div className="px-2 pb-2 flex flex-col gap-1">
                        {ses.map((s: any) => (
                          <button key={s.id} onClick={() => router.push('/sesion/'+s.id)}
                            className={'w-full rounded-lg p-2 text-left hover:opacity-80 transition '+(COLOR_DISC[s.disciplina]||'bg-gray-700')}>
                            <p className="text-white text-xs font-bold">{s.disciplina}</p>
                            <p className="text-white text-xs opacity-80">{s.duracion_minutos?s.duracion_minutos+'min':'—'}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalEditarMacro && macroEditando && (
        <Modal titulo="Editar macrociclo" onClose={() => setModalEditarMacro(false)}>
          <form onSubmit={guardarEditarMacro} className="flex flex-col gap-4">
            <input type="text" placeholder="Objetivo" value={editMacroObj} onChange={e => setEditMacroObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha de inicio</label><input type="date" value={editMacroFecha} onChange={e => setEditMacroFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <input type="number" placeholder="Duración en semanas" value={editMacroDuracion} onChange={e => setEditMacroDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <div><label className="text-gray-400 text-sm mb-1 block">Tipo de periodización</label>
            <select value={editMacroPeriodizacion} onChange={e => setEditMacroPeriodizacion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full">
              <option value="">Sin especificar</option>
              <option value="Tradicional">Tradicional</option>
              <option value="Inversa">Inversa</option>
              <option value="ATR">ATR</option>
              <option value="Ondulatoria">Ondulatoria</option>
            </select></div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? "Guardando..." : "Guardar cambios"}</button>
          </form>
        </Modal>
      )}

      {modalMeso && (
        <Modal titulo="Nuevo mesociclo" onClose={() => setModalMeso(false)}>
          <form onSubmit={guardarMeso} className="flex flex-col gap-4">
            <input type="text" placeholder="Objetivo (ej: Bloque de base)" value={mesoObj} onChange={e => setMesoObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <select value={mesoTipo} onChange={e => setMesoTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
              <option value="">Tipo de mesociclo</option>
              {macroSel?.tipo_periodizacion === 'Tradicional' ? (<>
                <option value="General">General</option>
                <option value="Específica">Específica</option>
                <option value="Competitiva">Competitiva</option>
                <option value="Taper">Taper</option>
              </>) : macroSel?.tipo_periodizacion === 'Inversa' ? (<>
                <option value="Intensidad">Intensidad</option>
                <option value="Desarrollo">Desarrollo</option>
                <option value="Resistencia específica">Resistencia específica</option>
                <option value="Taper">Taper</option>
              </>) : macroSel?.tipo_periodizacion === 'Ondulatoria' ? (<>
                <option value="Carga alta">Carga alta</option>
                <option value="Carga media">Carga media</option>
                <option value="Recuperación">Recuperación</option>
              </>) : (<>
                <option value="Acumulación">Acumulación</option>
                <option value="Transmutación">Transmutación</option>
                <option value="Realización">Realización</option>
                <option value="Recuperación">Recuperación</option>
              </>)}
            </select>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha de inicio</label><input type="date" value={mesoFecha} onChange={e => setMesoFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <input type="number" placeholder="Duracion en semanas" value={mesoDuracion} onChange={e => setMesoDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <div><label className="text-gray-400 text-sm mb-1 block">Intensidad relativa (1-10)</label><input type="number" min="1" max="10" value={mesoIntensidad} onChange={e => setMesoIntensidad(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" /></div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar mesociclo'}</button>
          </form>
        </Modal>
      )}

      {modalMicro && (
        <Modal titulo="Nueva semana" onClose={() => setModalMicro(false)}>
          <form onSubmit={guardarMicro} className="flex flex-col gap-4">
            <input type="text" placeholder="Objetivo de la semana" value={microObj} onChange={e => setMicroObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <select value={microTipo} onChange={e => setMicroTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
              <option value="">Tipo de semana</option>
              <option value="Carga">Carga</option>
              <option value="Recuperación">Recuperación</option>
              <option value="Competicion">Competicion</option>
            </select>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha de inicio</label><input type="date" value={microFecha} onChange={e => setMicroFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar semana'}</button>
          </form>
        </Modal>
      )}

      {modalSesion && (
        <Modal titulo={'Sesion del ' + diaSeleccionado} onClose={() => setModalSesion(false)}>
          <form onSubmit={guardarSesion} className="flex flex-col gap-4">
            <select value={sesionDisc} onChange={e => setSesionDisc(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
              <option value="">Disciplina</option>
              <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option><option>Brick</option>
            </select>
            <input type="number" placeholder="Duracion en minutos (opcional)" value={sesionDuracion} onChange={e => setSesionDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
            <div><label className="text-gray-400 text-sm mb-1 block">RPE estimado (1-10)</label><input type="number" min="1" max="10" value={sesionRpe} onChange={e => setSesionRpe(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" /></div>
            <textarea placeholder="Notas para el atleta (opcional)" value={sesionNotas} onChange={e => setSesionNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
            <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
              <input type="checkbox" checked={sesionCronometro} onChange={e => setSesionCronometro(e.target.checked)} className="w-4 h-4 accent-orange-500" />
              <label className="text-white text-sm">Activar cronometro</label>
            </div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar sesion'}</button>
          </form>
        </Modal>
      )}
    </main>
  )
}
