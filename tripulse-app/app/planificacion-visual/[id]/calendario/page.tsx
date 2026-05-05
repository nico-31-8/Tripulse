'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS_SEMANA = ['L','M','X','J','V','S','D']

const COLOR_MESO: Record<string, string> = {
  'Acumulación': 'bg-orange-500', 'Acumulacion': 'bg-orange-500',
  'Transmutación': 'bg-yellow-500', 'Transmutacion': 'bg-yellow-500',
  'Realización': 'bg-red-500', 'Realizacion': 'bg-red-500',
  'Recuperación': 'bg-green-500', 'Recuperacion': 'bg-green-500',
}

const COLOR_DISC: Record<string, string> = {
  'Natacion': 'bg-blue-500', 'Natación': 'bg-blue-500',
  'Ciclismo': 'bg-yellow-400', 'Carrera': 'bg-green-500',
  'Fuerza': 'bg-red-500', 'Brick': 'bg-purple-500',
}

function getDiasDelMes(año: number, mes: number) {
  const primerDia = new Date(año, mes, 1)
  const ultimoDia = new Date(año, mes + 1, 0)
  const dias: (Date | null)[] = []
  let diaSemana = primerDia.getDay()
  diaSemana = diaSemana === 0 ? 6 : diaSemana - 1
  for (let i = 0; i < diaSemana; i++) dias.push(null)
  for (let d = 1; d <= ultimoDia.getDate(); d++) dias.push(new Date(año, mes, d))
  return dias
}

function fechaStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function CalendarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  const [macros, setMacros] = useState<any[]>([])
  const [mesos, setMesos] = useState<any[]>([])
  const [micros, setMicros] = useState<any[]>([])
  const [sesiones, setSesiones] = useState<any[]>([])
  const [rango, setRango] = useState(6)
  const [vista, setVista] = useState<'calendario'|'semanas'>('calendario')
  const [capaCalendario, setCapaCalendario] = useState<'mesos'|'semanas'>('mesos')
  const [mesInicio, setMesInicio] = useState(() => {
    const hoy = new Date()
    return { año: hoy.getFullYear(), mes: hoy.getMonth() }
  })
  const [modalTipo, setModalTipo] = useState<'macro'|'meso'|'micro'|'sesion'|null>(null)
  const [fechaSel, setFechaSel] = useState('')
  const [macroSel, setMacroSel] = useState<any>(null)
  const [mesoSel, setMesoSel] = useState<any>(null)
  const [microSel, setMicroSel] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [macroObj, setMacroObj] = useState('')
  const [macroDuracion, setMacroDuracion] = useState('')
  const [mesoObj, setMesoObj] = useState('')
  const [mesoTipo, setMesoTipo] = useState('')
  const [mesoDuracion, setMesoDuracion] = useState('')
  const [mesoIntensidad, setMesoIntensidad] = useState('')
  const [microObj, setMicroObj] = useState('')
  const [microTipo, setMicroTipo] = useState('')
  const [sesionDisc, setSesionDisc] = useState('')
  const [sesionDuracion, setSesionDuracion] = useState('')
  const [sesionRpe, setSesionRpe] = useState('')
  const [sesionNotas, setSesionNotas] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    const { data: mac } = await supabase.from('macrociclo').select('*').eq('id_deportista', id).order('fecha_inicio')
    setMacros(mac || [])
    if (!mac?.length) return
    const macIds = mac.map(m => m.id)
    const { data: me } = await supabase.from('mesociclo').select('*').in('id_macrociclo', macIds).order('fecha_inicio')
    setMesos(me || [])
    if (!me?.length) return
    const meIds = me.map(m => m.id)
    const { data: mi } = await supabase.from('microciclo').select('*').in('id_mesociclo', meIds).order('fecha_inicio')
    setMicros(mi || [])
    if (!mi?.length) return
    const miIds = mi.map(m => m.id)
    const { data: ses } = await supabase.from('sesion').select('*').in('id_microciclo', miIds).order('fecha_sesion')
    setSesiones(ses || [])
  }

  const mesesAMostrar = Array.from({ length: rango }, (_, i) => {
    const mes = (mesInicio.mes + i) % 12
    const año = mesInicio.año + Math.floor((mesInicio.mes + i) / 12)
    return { mes, año }
  })

  const getMesoDelDia = (f: string) => mesos.find(m => {
    if (!m.fecha_inicio) return false
    const ini = new Date(m.fecha_inicio)
    const fin = new Date(ini); fin.setDate(ini.getDate() + (m.duracion_semanas || 4) * 7)
    const d = new Date(f); return d >= ini && d < fin
  })

  const getMacroDelDia = (f: string) => macros.find(m => {
    if (!m.fecha_inicio) return false
    const ini = new Date(m.fecha_inicio)
    const fin = new Date(ini); fin.setDate(ini.getDate() + (m.duracion_semanas || 16) * 7)
    const d = new Date(f); return d >= ini && d < fin
  })

  const getMicroDelDia = (f: string) => micros.find(m => {
    if (!m.fecha_inicio) return false
    const ini = new Date(m.fecha_inicio)
    const fin = new Date(ini); fin.setDate(ini.getDate() + 7)
    const d = new Date(f); return d >= ini && d < fin
  })

  const getSesionesDia = (f: string) => sesiones.filter(s => s.fecha_sesion === f)

  const abrirModal = (f: string) => {
    setFechaSel(f)
    const macro = getMacroDelDia(f)
    const meso = getMesoDelDia(f)
    const micro = getMicroDelDia(f)
    const ses = getSesionesDia(f)
    if (ses.length > 0) { window.location.href = '/sesion/' + ses[0].id; return }
    if (micro) { setMicroSel(micro); setMesoSel(meso); setMacroSel(macro); setModalTipo('sesion'); return }
    if (meso) { setMesoSel(meso); setMacroSel(macro); setModalTipo('micro'); return }
    if (macro) { setMacroSel(macro); setModalTipo('meso'); return }
    setModalTipo('macro')
  }

  const guardarMacro = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    await supabase.from('macrociclo').insert({ id_deportista: Number(id), objetivo: macroObj, fecha_inicio: fechaSel, duracion_semanas: Number(macroDuracion) })
    setMacroObj(''); setMacroDuracion(''); setModalTipo(null)
    await cargarDatos(); setLoading(false)
  }

  const guardarMeso = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    await supabase.from('mesociclo').insert({ id_macrociclo: macroSel.id, objetivo: mesoObj, tipo: mesoTipo, fecha_inicio: fechaSel, duracion_semanas: Number(mesoDuracion), intensidad_relativa: mesoIntensidad ? Number(mesoIntensidad) : null })
    setMesoObj(''); setMesoTipo(''); setMesoDuracion(''); setMesoIntensidad(''); setModalTipo(null)
    await cargarDatos(); setLoading(false)
  }

  const guardarMicro = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    await supabase.from('microciclo').insert({ id_mesociclo: mesoSel.id, objetivo: microObj, tipo: microTipo, fecha_inicio: fechaSel, duracion_dias: 7 })
    setMicroObj(''); setMicroTipo(''); setModalTipo(null)
    await cargarDatos(); setLoading(false)
  }

  const guardarSesion = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    await supabase.from('sesion').insert({ id_microciclo: microSel.id, disciplina: sesionDisc, fecha_sesion: fechaSel, duracion_minutos: sesionDuracion ? Number(sesionDuracion) : null, rpe_estimado: sesionRpe ? Number(sesionRpe) : null, notas_entrenador: sesionNotas, estado: 'Planificada' })
    setSesionDisc(''); setSesionDuracion(''); setSesionRpe(''); setSesionNotas(''); setModalTipo(null)
    await cargarDatos(); setLoading(false)
  }

  const hoy = new Date().toISOString().split('T')[0]

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500">TRIPULSE</button>
        <div className="flex items-center gap-3">
          <button onClick={() => window.location.href = '/planificacion-visual/' + id} className="text-gray-400 hover:text-white text-sm transition">← Bloques</button>
          <button onClick={() => window.location.href = '/deportistas/' + id} className="text-gray-400 hover:text-white text-sm transition">← Perfil</button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold">Calendario — {deportista.nombre}</h2>
            <p className="text-gray-400 text-sm">Pulsa un día para planificar</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              <button onClick={() => { setVista('calendario'); setCapaCalendario('mesos') }}
                className={'px-3 py-1.5 rounded-md text-xs font-medium transition ' +
                  (vista === 'calendario' && capaCalendario === 'mesos' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                📅 Mesociclos
              </button>
              <button onClick={() => { setVista('calendario'); setCapaCalendario('semanas') }}
                className={'px-3 py-1.5 rounded-md text-xs font-medium transition ' +
                  (vista === 'calendario' && capaCalendario === 'semanas' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                📋 Semanas
              </button>
              <button onClick={() => setVista('semanas')}
                className={'px-3 py-1.5 rounded-md text-xs font-medium transition ' +
                  (vista === 'semanas' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                📝 Lista
              </button>
            </div>
            {vista === 'calendario' && (
              <>
                <div className="flex gap-1">
                  <button onClick={() => setMesInicio(p => { const m = p.mes === 0 ? 11 : p.mes-1; const a = p.mes === 0 ? p.año-1 : p.año; return {mes:m,año:a} })} className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition">◀</button>
                  <button onClick={() => setMesInicio({año: new Date().getFullYear(), mes: new Date().getMonth()})} className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition">Hoy</button>
                  <button onClick={() => setMesInicio(p => { const m = (p.mes+1)%12; const a = p.mes===11 ? p.año+1 : p.año; return {mes:m,año:a} })} className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition">▶</button>
                </div>
                <div className="flex gap-1">
                  {[3,6,12].map(r => (
                    <button key={r} onClick={() => setRango(r)}
                      className={'px-3 py-2 rounded-lg text-xs font-medium transition ' + (rango===r ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                      {r} meses
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex gap-4 flex-wrap mb-5 text-xs">
          {capaCalendario === 'mesos' ? (
            <>
              {[['bg-orange-500','Acumulación'],['bg-yellow-500','Transmutación'],['bg-red-500','Realización'],['bg-green-500','Recuperación']].map(([c,l]) => (
                <div key={l} className="flex items-center gap-1.5"><div className={'w-3 h-3 rounded-sm '+c}/><span className="text-gray-400">{l}</span></div>
              ))}
            </>
          ) : (
            <>
              {[['bg-orange-400','Carga'],['bg-green-400','Recuperación'],['bg-blue-400','Competición']].map(([c,l]) => (
                <div key={l} className="flex items-center gap-1.5"><div className={'w-3 h-3 rounded-sm '+c}/><span className="text-gray-400">{l}</span></div>
              ))}
            </>
          )}
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-white opacity-70"/><span className="text-gray-400">Sesión planificada</span></div>
        </div>

        {/* VISTA CALENDARIO */}
        {vista === 'calendario' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mesesAMostrar.map(({ mes, año }) => (
              <div key={`${año}-${mes}`} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 bg-gray-800">
                  <p className="font-bold">{MESES[mes]} {año}</p>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {DIAS_SEMANA.map(d => <div key={d} className="text-center text-xs text-gray-600 py-1">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {getDiasDelMes(año, mes).map((dia, i) => {
                      if (!dia) return <div key={i} />
                      const f = fechaStr(dia)
                      const meso = getMesoDelDia(f)
                      const micro = getMicroDelDia(f)
                      const ses = getSesionesDia(f)
                      const esHoy = f === hoy
                      return (
                        <button key={f} onClick={() => abrirModal(f)}
                          className={'relative rounded text-xs py-1.5 text-center transition flex flex-col items-center justify-center min-h-8 ' +
                            (esHoy ? 'ring-2 ring-orange-500 font-bold ' : '') +
                            (capaCalendario === 'semanas' && micro ?
                              (micro.tipo === 'Carga' ? 'bg-orange-400 bg-opacity-40 hover:bg-opacity-60 text-white ' :
                               micro.tipo?.includes('Recup') ? 'bg-green-400 bg-opacity-40 hover:bg-opacity-60 text-white ' :
                               'bg-blue-400 bg-opacity-40 hover:bg-opacity-60 text-white ') :
                              capaCalendario === 'mesos' && meso ? (COLOR_MESO[meso.tipo] || 'bg-gray-700') + ' bg-opacity-40 hover:bg-opacity-60 text-white ' :
                              'text-gray-400 hover:bg-gray-800 ')}>
                          <span>{dia.getDate()}</span>
                          {ses.length > 0 && (
                            <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                              {ses.slice(0,3).map((s, i) => (
                                <div key={i} className={'w-1.5 h-1.5 rounded-full ' + (COLOR_DISC[s.disciplina] || 'bg-gray-400')} />
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VISTA SEMANAS */}
        {vista === 'semanas' && (
          <div className="flex flex-col gap-4">
            {macros.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">📋</div>
                <p>No hay macrociclos todavía.</p>
                <p className="text-sm mt-2">Ve al calendario y pulsa un día para crear el primero.</p>
              </div>
            ) : macros.map(mac => {
              const mesosMac = mesos.filter(m => m.id_macrociclo === mac.id)
              return (
                <div key={mac.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-orange-400">{mac.objetivo}</p>
                      <p className="text-gray-400 text-xs">{mac.fecha_inicio} · {mac.duracion_semanas} semanas</p>
                    </div>
                  </div>
                  {mesosMac.map(meso => {
                    const microsMeso = micros.filter(m => m.id_mesociclo === meso.id)
                    return (
                      <div key={meso.id} className="border-b border-gray-800">
                        <div className={'px-5 py-2.5 flex justify-between items-center ' +
                          (meso.tipo?.includes('Acum') ? 'bg-orange-900 bg-opacity-20' :
                           meso.tipo?.includes('Trans') ? 'bg-yellow-900 bg-opacity-20' :
                           meso.tipo?.includes('Real') ? 'bg-red-900 bg-opacity-20' :
                           'bg-green-900 bg-opacity-20')}>
                          <div>
                            <p className="font-medium text-sm">{meso.objetivo}</p>
                            <p className="text-gray-400 text-xs">{meso.tipo} · {meso.duracion_semanas} sem · {meso.fecha_inicio}</p>
                          </div>
                          <button onClick={() => { setMacroSel(mac); setMesoSel(meso); setFechaSel(meso.fecha_inicio || ''); setModalTipo('micro') }}
                            className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-1.5 rounded-lg transition">
                            + Semana
                          </button>
                        </div>
                        {microsMeso.length === 0 && (
                          <p className="text-gray-600 text-xs px-6 py-2">Sin semanas creadas</p>
                        )}
                        {microsMeso.map((micro, idx) => {
                          const sesMicro = sesiones.filter(s => s.id_microciclo === micro.id)
                          return (
                            <div key={micro.id} className="flex justify-between items-center px-6 py-2 hover:bg-gray-800 transition border-t border-gray-800">
                              <div className="flex items-center gap-3">
                                <span className={'text-xs px-2 py-0.5 rounded-full ' +
                                  (micro.tipo === 'Carga' ? 'bg-orange-900 text-orange-300' :
                                   micro.tipo?.includes('Recup') ? 'bg-green-900 text-green-300' :
                                   'bg-blue-900 text-blue-300')}>
                                  Sem {idx+1}
                                </span>
                                <div>
                                  <p className="text-sm text-white">{micro.objetivo}</p>
                                  <p className="text-gray-500 text-xs">{micro.fecha_inicio} · {micro.tipo}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                  {sesMicro.map(s => (
                                    <div key={s.id} className={'w-2 h-2 rounded-full ' + (COLOR_DISC[s.disciplina] || 'bg-gray-500')} title={s.disciplina} />
                                  ))}
                                </div>
                                <button onClick={() => { setMicroSel(micro); setMesoSel(meso); setMacroSel(mac); setFechaSel(micro.fecha_inicio || ''); setModalTipo('sesion') }}
                                  className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded-lg transition">
                                  + Sesión
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                  {mesosMac.length === 0 && (
                    <p className="text-gray-500 text-xs px-5 py-3">Sin mesociclos — ve al calendario y pulsa un día para crear</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODALES */}
      {modalTipo && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold">
                  {modalTipo === 'macro' ? '+ Nuevo macrociclo' :
                   modalTipo === 'meso' ? '+ Nuevo mesociclo' :
                   modalTipo === 'micro' ? '+ Nueva semana' : '+ Nueva sesión'}
                </h3>
                <p className="text-gray-400 text-sm">{fechaSel}</p>
                {modalTipo === 'meso' && <p className="text-orange-400 text-xs mt-0.5">Macro: {macroSel?.objetivo}</p>}
                {modalTipo === 'micro' && <p className="text-orange-400 text-xs mt-0.5">Meso: {mesoSel?.objetivo}</p>}
                {modalTipo === 'sesion' && <p className="text-orange-400 text-xs mt-0.5">Semana: {microSel?.objetivo}</p>}
              </div>
              <button onClick={() => setModalTipo(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            {modalTipo === 'macro' && (
              <form onSubmit={guardarMacro} className="flex flex-col gap-3">
                <input type="text" placeholder="Objetivo del macrociclo" value={macroObj} onChange={e => setMacroObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <input type="number" placeholder="Duración en semanas" value={macroDuracion} onChange={e => setMacroDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear macrociclo'}</button>
              </form>
            )}

            {modalTipo === 'meso' && (
              <form onSubmit={guardarMeso} className="flex flex-col gap-3">
                <input type="text" placeholder="Objetivo del mesociclo" value={mesoObj} onChange={e => setMesoObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <select value={mesoTipo} onChange={e => setMesoTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Tipo</option>
                  <option value="Acumulación">Acumulación</option>
                  <option value="Transmutación">Transmutación</option>
                  <option value="Realización">Realización</option>
                  <option value="Recuperación">Recuperación</option>
                </select>
                <input type="number" placeholder="Duración en semanas" value={mesoDuracion} onChange={e => setMesoDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <input type="number" min="1" max="10" placeholder="Intensidad relativa (1-10)" value={mesoIntensidad} onChange={e => setMesoIntensidad(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear mesociclo'}</button>
              </form>
            )}

            {modalTipo === 'micro' && (
              <form onSubmit={guardarMicro} className="flex flex-col gap-3">
                <input type="text" placeholder="Objetivo de la semana" value={microObj} onChange={e => setMicroObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <select value={microTipo} onChange={e => setMicroTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Tipo</option>
                  <option value="Carga">Carga</option>
                  <option value="Recuperación">Recuperación</option>
                  <option value="Competición">Competición</option>
                </select>
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear semana'}</button>
              </form>
            )}

            {modalTipo === 'sesion' && (
              <form onSubmit={guardarSesion} className="flex flex-col gap-3">
                <select value={sesionDisc} onChange={e => setSesionDisc(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Disciplina</option>
                  <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option><option>Brick</option>
                </select>
                <input type="number" placeholder="Duración en minutos (opcional)" value={sesionDuracion} onChange={e => setSesionDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <input type="number" min="1" max="10" placeholder="RPE estimado (1-10)" value={sesionRpe} onChange={e => setSesionRpe(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Notas para el atleta" value={sesionNotas} onChange={e => setSesionNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear sesión'}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
