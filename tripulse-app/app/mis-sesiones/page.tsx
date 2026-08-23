'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { vivas } from '@/lib/papelera'
import { cargarReferencias } from '@/lib/referencia-zona'
import { usuarioActual } from '@/lib/sesion'
import { estimarDuraciones, duracionSesionTexto } from '@/lib/duracion-carga'
import type { TestsDeportista } from '@/lib/duracion'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const DIAS_SEMANA_COMPLETO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
// Sin 'Brick': un brick necesita sus bloques (cada uno con su deporte y duración) y
// aquí no hay constructor. Sin bloques, su carga no se puede atribuir a ningún deporte
// y desaparecería de volumen, carga y SICAT (ver lib/atribucion). Los bricks se crean
// en planificación (bloques, calendario, semana o canvas).
const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']

// Fecha local YYYY-MM-DD. NO usar toISOString: en husos UTC+ (España) desplaza
// una fecha a medianoche local al día anterior, y fecha_sesion es fecha local.
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Microciclo de la semana de una fecha si cae dentro de un mesociclo del atleta (creándolo
// si no existe). Si la fecha queda fuera de todo plan → null (sesión "libre").
async function resolverMicro(depId: number, fechaStr: string): Promise<number | null> {
  const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
  const macroIds = (macros || []).map((m: any) => m.id)
  if (!macroIds.length) return null
  const { data: mesos } = await supabase.from('mesociclo').select('id, fecha_inicio, duracion_semanas').in('id_macrociclo', macroIds)
  const d = new Date(fechaStr + 'T12:00:00')
  const meso = (mesos || []).find((me: any) => {
    const ini = new Date(me.fecha_inicio + 'T12:00:00'); const fin = new Date(ini); fin.setDate(ini.getDate() + me.duracion_semanas * 7)
    return d >= ini && d < fin
  })
  if (!meso) return null
  const off = (d.getDay() + 6) % 7; const monday = new Date(d); monday.setDate(d.getDate() - off)
  const mondayStr = ymd(monday)
  const { data: micros } = await supabase.from('microciclo').select('id, fecha_inicio').eq('id_mesociclo', meso.id)
  const ex = (micros || []).find((mi: any) => mi.fecha_inicio === mondayStr)
  if (ex) return ex.id
  const { data: nuevo } = await supabase.from('microciclo').insert({ id_mesociclo: meso.id, id_deportista: depId, objetivo: 'Semana del ' + mondayStr, tipo: 'Carga', fecha_inicio: mondayStr, duracion_dias: 7 }).select('id').single()
  return nuevo?.id ?? null
}

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
  const [dep, setDep] = useState<any>(null)
  // Modal añadir sesión (deportista).
  // Con ?anadir=1 se abre solo. Lo usa el botón del panel, que dice "Añadir una
  // sesión que vas a hacer": si lo dice, tiene que añadirla, no dejarte aquí
  // mirando el mismo botón otra vez.
  const [modalAnadir, setModalAnadir] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('anadir') === '1'
  })
  const [fDisc, setFDisc] = useState('Natacion')
  const [fFecha, setFFecha] = useState(() => ymd(new Date()))
  const [fDur, setFDur] = useState('')
  const [fNotas, setFNotas] = useState('')
  const [fModo, setFModo] = useState<'planificada' | 'realizada'>('planificada')
  const [fRpe, setFRpe] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    const { data: d } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
    setDep(d)
    if (!d) { setLoading(false); return }

    /* Las del plan y las libres, en UNA consulta. Antes eran dos ramas y una
       cadena de tres saltos, con las libres colgando de un `if` que solo se
       llegaba a evaluar por casualidad después. */
    const [ses, refs] = await Promise.all([
      vivas(supabase.from('sesion').select('*').eq('id_deportista', d.id)),
      cargarReferencias(supabase, d.id),
    ])
    const todas = ses.data || []
    const testsDep: TestsDeportista = refs.tests
    const durs = await estimarDuraciones(supabase, todas.map((s: any) => s.id), testsDep)
    setSesiones(todas.map((s: any) => ({ ...s, dur_estimada: durs[s.id] })).sort((a: any, b: any) => (a.fecha_sesion < b.fecha_sesion ? -1 : 1)))
    setLoading(false)
  }

  const crearSesion = async () => {
    if (!dep) return
    setGuardando(true)
    const micro = await resolverMicro(dep.id, fFecha)
    const realizada = fModo === 'realizada'
    const { error } = await supabase.from('sesion').insert({
      id_deportista: dep.id,
      id_microciclo: micro,
      origen: 'deportista',
      disciplina: fDisc,
      fecha_sesion: fFecha,
      duracion_minutos: fDur ? Number(fDur) : null,
      estado: realizada ? 'Realizada' : 'Planificada',
      rpe_estimado: !realizada && fRpe ? Number(fRpe) : null,
      rpe_reportado: realizada && fRpe ? Number(fRpe) : null,
      notas_entrenador: fNotas || null,
    })
    if (error) { alert('Error al crear la sesión: ' + error.message); setGuardando(false); return }
    setModalAnadir(false); setFDur(''); setFNotas(''); setFRpe(''); setFModo('planificada')
    await cargar()
    setGuardando(false)
  }

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
      const fechaStr = ymd(dia)
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
      const fechaStr = ymd(fecha)
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
      const fechaStr = ymd(dia)
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

  const hoyStr = ymd(new Date())

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

        <button onClick={() => { setFFecha(ymd(new Date())); setModalAnadir(true) }}
          className="w-full mb-6 border border-dashed border-gray-700 text-gray-300 hover:text-white hover:border-orange-500 rounded-xl py-3 text-sm font-medium transition">
          ＋ Añadir una sesión que vas a hacer
        </button>

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
                          <button key={s.id} onClick={() => router.push('/sesion/' + s.id)} className="flex justify-between items-center hover:bg-gray-800 rounded-lg p-2 transition text-left w-full">
                            <div>
                              <p className="font-medium text-sm">{s.disciplina}</p>
                              <p className="text-gray-400 text-xs">{duracionSesionTexto(s, s.dur_estimada)} · RPE est: {s.rpe_estimado || '—'}</p>
                              {s.notas_entrenador && <p className="text-gray-400 text-xs italic mt-1">"{s.notas_entrenador}"</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              {s.origen === 'deportista' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-900/50 text-orange-300">🙋 Tú</span>}
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
                        <button key={s.id} onClick={() => router.push('/sesion/' + s.id)} className="flex justify-between items-center hover:bg-gray-800 rounded-lg p-2 transition text-left w-full">
                          <div className="flex items-center gap-3">
                            <div className={'w-2 h-10 rounded-full flex-shrink-0 ' + colorDisciplina(s.disciplina)} />
                            <div>
                              <p className="font-medium text-sm">{s.disciplina}</p>
                              <p className="text-gray-400 text-xs">{duracionSesionTexto(s, s.dur_estimada)} · RPE {s.rpe_estimado || '—'}</p>
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
              <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))} className="text-gray-400 hover:text-white px-4 py-1 min-w-[44px] rounded-lg hover:bg-gray-800 transition">←</button>
              <h3 className="font-bold text-lg">{MESES[mesActual.getMonth()]} {mesActual.getFullYear()}</h3>
              <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))} className="text-gray-400 hover:text-white px-4 py-1 min-w-[44px] rounded-lg hover:bg-gray-800 transition">→</button>
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
                      <p className="font-bold text-sm">{duracionSesionTexto(s, s.dur_estimada)}</p>
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
                    onClick={() => router.push('/sesion/' + s.id)}
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

      {/* MODAL — añadir sesión (deportista) */}
      {modalAnadir && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0" onClick={() => setModalAnadir(false)}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800">
              <p className="font-bold text-lg">Añadir sesión</p>
              <button onClick={() => setModalAnadir(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {([['planificada', 'La voy a hacer'], ['realizada', 'Ya la hice']] as [typeof fModo, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setFModo(k)} className={'py-2 rounded-lg text-sm font-medium transition ' + (fModo === k ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>{l}</button>
                ))}
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Disciplina</label>
                <select value={fDisc} onChange={e => setFDisc(e.target.value)} className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500">
                  {DISCIPLINAS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Fecha</label>
                <input type="date" value={fFecha} onChange={e => setFFecha(e.target.value)} className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Duración (min) — opcional</label>
                <input type="number" value={fDur} onChange={e => setFDur(e.target.value)} placeholder="Ej: 60" className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">{fModo === 'realizada' ? 'RPE real (1-10)' : 'RPE estimado (1-10) — opcional'}</label>
                <input type="number" min={1} max={10} value={fRpe} onChange={e => setFRpe(e.target.value)} className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Notas — opcional</label>
                <textarea value={fNotas} onChange={e => setFNotas(e.target.value)} rows={2} placeholder={fModo === 'realizada' ? '¿Cómo fue?' : '¿Qué vas a hacer?'} className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <button onClick={crearSesion} disabled={guardando} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-xl font-bold text-white transition disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Añadir sesión'}
              </button>
              <p className="text-gray-600 text-xs text-center">Tu entrenador la verá marcada como añadida por ti.</p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

