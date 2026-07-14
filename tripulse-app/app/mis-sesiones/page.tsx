'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { estimarDuraciones, duracionSesionTexto } from '@/lib/duracion-carga'
import type { TestsDeportista } from '@/lib/duracion'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const DIAS_SEMANA_COMPLETO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function MisSesiones() {
  const router = useRouter()
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista'|'calendario'|'semana'>('lista')
  const [mesActual, setMesActual] = useState(new Date())
  const [semanaBase, setSemanaBase] = useState(() => {
    const hoy = new Date()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
    lunes.setHours(0,0,0,0)
    return lunes
  })
  // Modal calendario
  const [diaModal, setDiaModal] = useState<{ fechaStr: string, sesiones: any[] } | null>(null)

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: dep } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
      if (dep) {
        const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
        const macroIds = (macros || []).map((m: any) => m.id)
        if (!macroIds.length) { setLoading(false); return }
        const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
        const mesoIds = (mesos || []).map((m: any) => m.id)
        if (!mesoIds.length) { setLoading(false); return }
        const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
        const microIds = (micros || []).map((m: any) => m.id)
        if (!microIds.length) { setLoading(false); return }
        const { data } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).or('eliminada.is.null,eliminada.eq.false').order('fecha_sesion')
        const [tc, tn, tci] = await Promise.all([
          supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
          supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
          supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
        ])
        const testsDep: TestsDeportista = { vam: tc.data?.[0]?.vam, css: tn.data?.[0]?.css, ftp: tci.data?.[0]?.ftp }
        const durs = await estimarDuraciones(supabase, (data || []).map((s: any) => s.id), testsDep)
        setSesiones((data || []).map((s: any) => ({ ...s, dur_estimada: durs[s.id] })))
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

  const estadoColor = (estado: string) => {
    if (estado === 'Realizada') return 'bg-green-900 text-green-300'
    if (estado === 'Cancelada') return 'bg-red-900 text-red-300'
    return 'bg-gray-700 text-gray-400'
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

  const getDiasSemana = () => {
    const dias = []
    for (let i = 0; i < 7; i++) {
      const dia = new Date(semanaBase)
      dia.setDate(semanaBase.getDate() + i)
      const fechaStr = dia.toISOString().split('T')[0]
      const sesionesDia = sesiones.filter(s => s.fecha_sesion === fechaStr)
      dias.push({ fecha: dia, fechaStr, sesiones: sesionesDia })
    }
    return dias
  }

  const semanaAnterior = () => {
    const nueva = new Date(semanaBase)
    nueva.setDate(semanaBase.getDate() - 7)
    setSemanaBase(nueva)
  }

  const semanaSiguiente = () => {
    const nueva = new Date(semanaBase)
    nueva.setDate(semanaBase.getDate() + 7)
    setSemanaBase(nueva)
  }

  const semanaActual = () => {
    const hoy = new Date()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
    lunes.setHours(0,0,0,0)
    setSemanaBase(lunes)
  }

  const hoyStr = new Date().toISOString().split('T')[0]

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard-deportista')} className="text-gray-400 hover:text-white text-sm transition">← Mi panel</button>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Mis sesiones</h2>
          <div className="flex gap-2">
            <button onClick={() => setVista('lista')} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${vista === 'lista' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>📋</button>
            <button onClick={() => setVista('semana')} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${vista === 'semana' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>📅 Semana</button>
            <button onClick={() => setVista('calendario')} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${vista === 'calendario' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>🗓 Mes</button>
          </div>
        </div>

        {/* VISTA LISTA */}
        {vista === 'lista' && (
          <div>
            <p className="text-gray-400 text-sm mb-4">Próximas 2 semanas</p>
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
                          <button key={s.id} onClick={() => router.push('/sesion/' + s.id + '/ejecutar')} className="flex justify-between items-center hover:bg-gray-800 rounded-lg p-2 transition text-left w-full">
                            <div>
                              <p className="font-medium text-sm">{s.disciplina}</p>
                              <p className="text-gray-400 text-xs">{duracionSesionTexto(s.duracion_minutos, s.dur_estimada)} · RPE est: {s.rpe_estimado || '—'}</p>
                              {s.notas_entrenador && <p className="text-gray-400 text-xs italic mt-1">"{s.notas_entrenador}"</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={'text-xs px-2 py-0.5 rounded-full ' + estadoColor(s.estado)}>{s.estado}</span>
                              <span className="text-orange-500 text-sm">→</span>
                            </div>
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

        {/* VISTA SEMANA DESLIZABLE */}
        {vista === 'semana' && (
          <div>
            {/* Navegación semana */}
            <div className="flex justify-between items-center mb-4">
              <button onClick={semanaAnterior} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition text-sm">← Anterior</button>
              <div className="text-center">
                <p className="font-bold text-sm">
                  {getDiasSemana()[0].fecha.getDate()} {MESES[getDiasSemana()[0].fecha.getMonth()]} — {getDiasSemana()[6].fecha.getDate()} {MESES[getDiasSemana()[6].fecha.getMonth()]}
                </p>
                <button onClick={semanaActual} className="text-orange-400 text-xs hover:text-orange-300 transition">Semana actual</button>
              </div>
              <button onClick={semanaSiguiente} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition text-sm">Siguiente →</button>
            </div>

            {/* Tira horizontal de 7 días */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
              {getDiasSemana().map(({ fecha, fechaStr, sesiones: sesionesDia }) => {
                const esHoy = fechaStr === hoyStr
                const tieneSesion = sesionesDia.length > 0
                return (
                  <div key={fechaStr}
                    className={'flex-shrink-0 w-[calc(100%/7-8px)] min-w-[80px] rounded-xl border p-2 text-center cursor-pointer transition ' +
                      (esHoy ? 'border-orange-500 bg-orange-950' : tieneSesion ? 'border-gray-700 bg-gray-900 hover:border-orange-500' : 'border-gray-800 bg-gray-900 opacity-50')}
                    onClick={() => tieneSesion && setDiaModal({ fechaStr, sesiones: sesionesDia })}
                  >
                    <p className={'text-xs mb-1 ' + (esHoy ? 'text-orange-400 font-bold' : 'text-gray-500')}>
                      {DIAS_SEMANA[fecha.getDay()]}
                    </p>
                    <p className={'text-lg font-bold mb-2 ' + (esHoy ? 'text-orange-400' : 'text-white')}>
                      {fecha.getDate()}
                    </p>
                    {tieneSesion ? (
                      <div className="flex flex-col gap-1">
                        {sesionesDia.map(s => (
                          <div key={s.id} className={'w-full h-1.5 rounded-full ' + colorDisciplina(s.disciplina)} />
                        ))}
                        <p className="text-xs text-gray-400 mt-1">{sesionesDia.length} sesión{sesionesDia.length > 1 ? 'es' : ''}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">—</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Detalle de sesiones de la semana */}
            <div className="flex flex-col gap-3">
              {getDiasSemana().filter(d => d.sesiones.length > 0).map(({ fecha, fechaStr, sesiones: sesionesDia }) => {
                const esHoy = fechaStr === hoyStr
                return (
                  <div key={fechaStr} className={'rounded-xl border bg-gray-900 ' + (esHoy ? 'border-orange-500' : 'border-gray-800')}>
                    <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                      <span className={'font-bold text-sm ' + (esHoy ? 'text-orange-400' : 'text-white')}>
                        {DIAS_SEMANA_COMPLETO[fecha.getDay()]} {fecha.getDate()}
                      </span>
                      {esHoy && <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">Hoy</span>}
                    </div>
                    <div className="px-4 py-3 flex flex-col gap-2">
                      {sesionesDia.map(s => (
                        <button key={s.id} onClick={() => router.push('/sesion/' + s.id + '/ejecutar')} className="flex justify-between items-center hover:bg-gray-800 rounded-lg p-2 transition text-left w-full">
                          <div className="flex items-center gap-3">
                            <div className={'w-2 h-10 rounded-full flex-shrink-0 ' + colorDisciplina(s.disciplina)} />
                            <div>
                              <p className="font-medium text-sm">{s.disciplina}</p>
                              <p className="text-gray-400 text-xs">{duracionSesionTexto(s.duracion_minutos, s.dur_estimada)} · RPE {s.rpe_estimado || '—'}</p>
                              {s.notas_entrenador && <p className="text-gray-400 text-xs italic">"{s.notas_entrenador}"</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={'text-xs px-2 py-0.5 rounded-full ' + estadoColor(s.estado)}>{s.estado}</span>
                            <span className="text-orange-500">→</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              {getDiasSemana().every(d => d.sesiones.length === 0) && (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-3xl mb-3">😴</p>
                  <p>Semana de descanso</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISTA CALENDARIO MENSUAL */}
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
                const tieneSesion = dia.sesiones.length > 0
                return (
                  <div key={dia.fechaStr}
                    onClick={() => tieneSesion && setDiaModal({ fechaStr: dia.fechaStr, sesiones: dia.sesiones })}
                    className={'rounded-xl p-1.5 min-h-14 transition ' +
                      (esHoy ? 'bg-orange-500/20 border border-orange-500' :
                       tieneSesion ? 'bg-gray-800 hover:bg-gray-700 cursor-pointer border border-transparent hover:border-orange-500' :
                       'bg-gray-900 border border-transparent')}>
                    <p className={'text-xs font-medium mb-1 ' + (esHoy ? 'text-orange-400' : 'text-gray-400')}>{dia.fecha.getDate()}</p>
                    <div className="flex flex-col gap-0.5">
                      {dia.sesiones.map((s: any) => (
                        <div key={s.id} className={'w-full h-1.5 rounded-full ' + colorDisciplina(s.disciplina)} />
                      ))}
                    </div>
                    {tieneSesion && (
                      <p className="text-gray-600 text-center text-xs mt-0.5">···</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Leyenda */}
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

      {/* MODAL — detalle del día */}
      {diaModal && (
        <div className="fixed inset-0 bg-black/75 flex items-end justify-center z-50 px-4 pb-4"
          onClick={() => setDiaModal(null)}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {/* Cabecera */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800">
              <div>
                <p className="font-bold text-lg">
                  {(() => {
                    const d = new Date(diaModal.fechaStr + 'T12:00:00')
                    return `${DIAS_SEMANA_COMPLETO[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`
                  })()}
                </p>
                <p className="text-gray-400 text-xs">{diaModal.sesiones.length} sesión{diaModal.sesiones.length > 1 ? 'es' : ''} planificada{diaModal.sesiones.length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setDiaModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            {/* Sesiones */}
            <div className="px-5 py-4 flex flex-col gap-3 max-h-96 overflow-y-auto">
              {diaModal.sesiones.map(s => (
                <div key={s.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className={'w-3 h-3 rounded-full flex-shrink-0 ' + colorDisciplina(s.disciplina)} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorDisciplinaTexto(s.disciplina)}`}>{s.disciplina}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${estadoColor(s.estado)}`}>{s.estado}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-900 rounded-lg p-2 text-center">
                      <p className="text-gray-500 text-xs">Duración</p>
                      <p className="font-bold text-sm">{duracionSesionTexto(s.duracion_minutos, s.dur_estimada)}</p>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-2 text-center">
                      <p className="text-gray-500 text-xs">RPE estimado</p>
                      <p className="font-bold text-sm">{s.rpe_estimado || '—'}/10</p>
                    </div>
                  </div>

                  {s.notas_entrenador && (
                    <div className="bg-gray-900 rounded-lg p-3 mb-3">
                      <p className="text-gray-500 text-xs mb-1">Notas del entrenador</p>
                      <p className="text-gray-300 text-sm italic">"{s.notas_entrenador}"</p>
                    </div>
                  )}

                  <button
                    onClick={() => router.push('/sesion/' + s.id + '/ejecutar')}
                    className={'w-full py-2.5 rounded-xl font-medium text-sm transition ' +
                      (s.estado === 'Realizada'
                        ? 'bg-gray-700 text-gray-400 cursor-default'
                        : 'bg-orange-500 hover:bg-orange-600 text-white')}
                    disabled={s.estado === 'Realizada'}
                  >
                    {s.estado === 'Realizada' ? '✓ Sesión completada' : '▶ Iniciar sesión'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

