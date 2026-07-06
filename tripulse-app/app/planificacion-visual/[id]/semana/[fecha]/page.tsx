'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'

const DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
const DIAS_CORTO = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

const COLOR_DISC: Record<string, string> = {
  Natacion: 'bg-blue-900 text-blue-300', Natación: 'bg-blue-900 text-blue-300',
  Ciclismo: 'bg-yellow-900 text-yellow-300',
  Carrera: 'bg-green-900 text-green-300',
  Fuerza: 'bg-red-900 text-red-300',
  Brick: 'bg-purple-900 text-purple-300',
}

function fechaStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function diasDeSemana(lunes: string): { fecha: string; dia: string; diaCorto: string; dayNum: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return { fecha: fechaStr(d), dia: DIAS[i], diaCorto: DIAS_CORTO[i], dayNum: d.getDate() }
  })
}

export default function SemanaPage({ params }: { params: Promise<{ id: string; fecha: string }> }) {
  const { id, fecha } = use(params)
  useRequireEntrenador()
  const [dep, setDep] = useState<any>(null)
  const [microciclo, setMicrociclo] = useState<any>(null)
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<string | null>(null) // fecha seleccionada
  const [disc, setDisc] = useState('')
  const [duracion, setDuracion] = useState('')
  const [rpe, setRpe] = useState('')
  const [notas, setNotas] = useState('')
  const [cronometro, setCronometro] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [uaProg, setUaProg] = useState(0)
  const [uaReal, setUaReal] = useState(0)

  const dias = diasDeSemana(fecha)
  const hoy = fechaStr(new Date())

  useEffect(() => { cargar() }, [id, fecha])

  const cargar = async () => {
    setLoading(true)
    const { data: depData } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDep(depData)

    // Buscar el microciclo que corresponde a esta semana
    let sesiones_cargadas: any[] = []
    const { data: macs } = await supabase.from('macrociclo').select('id').eq('id_deportista', id)
    if (macs?.length) {
      const macIds = macs.map((m: any) => m.id)
      const { data: mes } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macIds)
      if (mes?.length) {
        const mesIds = mes.map((m: any) => m.id)
        const { data: micros } = await supabase.from('microciclo').select('*').in('id_mesociclo', mesIds)
        const micro = micros?.find((m: any) => m.fecha_inicio === fecha)
        setMicrociclo(micro || null)
        if (micro) {
          const { data: ses } = await supabase.from('sesion').select('*').eq('id_microciclo', micro.id).eq('eliminada', false).order('fecha_sesion')
          sesiones_cargadas = ses || []
          setSesiones(sesiones_cargadas)
        }
      }
    }

    // Calcular UA programada y real
    const sesIds = sesiones_cargadas.map((s: any) => s.id)
    if (sesIds.length > 0) {
      const { data: tareasData } = await supabase.from('tarea').select('id, id_sesion, series').in('id_sesion', sesIds)
      const tareaIds = (tareasData || []).map((t: any) => t.id)
      const [{ data: dists }, { data: durs }] = await Promise.all([
        tareaIds.length ? supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : { data: [] },
        tareaIds.length ? supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : { data: [] },
      ])
      let progTotal = 0
      sesiones_cargadas.forEach((s: any) => {
        const tarSes = (tareasData || []).filter((t: any) => t.id_sesion === s.id)
        tarSes.forEach((t: any) => {
          const dist = (dists || []).find((d: any) => d.id_tarea === t.id)
          const dur = (durs || []).find((d: any) => d.id_tarea === t.id)
          const vol = ((dist?.metros_planeados || 0) + (dur?.tiempo_planeado || 0)) * (t.series || 1)
          progTotal += vol
        })
        if (tarSes.length === 0) progTotal += (s.rpe_estimado || 5) * (s.duracion_minutos || 0)
      })
      setUaProg(Math.round(progTotal))
      let realTotal = 0
      sesiones_cargadas.filter((s: any) => s.rpe_reportado).forEach((s: any) => {
        realTotal += (s.rpe_reportado || 0) * (s.duracion_minutos || 0)
      })
      setUaReal(Math.round(realTotal))
    } else {
      setUaProg(0)
      setUaReal(0)
    }
    setLoading(false)
  }

  const crearSesion = async (fechaDia: string) => {
    if (!disc) { alert('Elige una disciplina'); return }
    setGuardando(true)

    let microId = microciclo?.id
    // Si no hay microciclo para esta semana, crearlo automaticamente
    if (!microId) {
      const { data: macs } = await supabase.from('macrociclo').select('id').eq('id_deportista', id)
      if (!macs?.length) { alert('No hay macrociclo para este deportista'); setGuardando(false); return }
      const macIds = macs.map((m: any) => m.id)
      const { data: mes } = await supabase.from('mesociclo').select('id, fecha_inicio, duracion_semanas').in('id_macrociclo', macIds)
      // Encontrar el meso que contiene esta fecha
      const mesoContenedor = mes?.find((me: any) => {
        const ini = new Date(me.fecha_inicio + 'T12:00:00')
        const fin = new Date(ini); fin.setDate(ini.getDate() + me.duracion_semanas * 7)
        const d = new Date(fecha + 'T12:00:00')
        return d >= ini && d < fin
      })
      if (!mesoContenedor) { alert('Esta semana no pertenece a ningun mesociclo. Genera la planificacion primero desde el Dibujo.'); setGuardando(false); return }
      const { data: nuevoMicro } = await supabase.from('microciclo').insert({
        id_mesociclo: mesoContenedor.id,
        objetivo: 'Semana del ' + fecha,
        tipo: 'Carga',
        fecha_inicio: fecha,
        duracion_dias: 7,
      }).select().single()
      if (!nuevoMicro) { alert('Error creando semana'); setGuardando(false); return }
      setMicrociclo(nuevoMicro)
      microId = nuevoMicro.id
    }

    await supabase.from('sesion').insert({
      id_microciclo: microId,
      disciplina: disc,
      fecha_sesion: fechaDia,
      duracion_minutos: duracion ? Number(duracion) : null,
      rpe_estimado: rpe ? Number(rpe) : null,
      notas_entrenador: notas,
      estado: 'Planificada',
      usar_cronometro: cronometro,
    })

    setDisc(''); setDuracion(''); setRpe(''); setNotas(''); setCronometro(false)
    setModal(null)
    await cargar()
    setGuardando(false)
  }

  const borrarSesion = async (sesId: number) => {
    if (!confirm('Mover esta sesion a la papelera?')) return
    await supabase.from('sesion').update({ eliminada: true }).eq('id', sesId)
    setSesiones(p => p.filter(s => s.id !== sesId))
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-gray-300 text-sm font-medium">{dep?.nombre} — Semana del {fecha}</span>
          <button onClick={() => window.location.href = `/planificacion-visual/${id}/dibujo?editar=1`} className="text-gray-400 hover:text-white text-sm transition">← Volver al Dibujo</button>
          <button onClick={() => window.location.href = '/planificacion-visual/' + id + '/calendario'} className="text-gray-400 hover:text-white text-sm transition">Calendario</button>
        </div>
      </nav>

      <div className="flex-1 p-6">
        {/* Header semana */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Semana del {fecha}</h2>
            {microciclo && (
              <p className="text-gray-400 text-sm mt-0.5">{microciclo.objetivo} · {microciclo.tipo}
                {microciclo.ua_planificada && <span className="text-orange-400 ml-2">{microciclo.ua_planificada} UA planificadas</span>}
              </p>
            )}
          </div>
          {microciclo && (
            <div className="flex gap-2">
              <span className={'text-xs px-3 py-1 rounded-full font-medium ' +
                (microciclo.tipo === 'Carga' ? 'bg-orange-900 text-orange-300' :
                 microciclo.tipo?.includes('Recup') ? 'bg-green-900 text-green-300' :
                 microciclo.tipo === 'Taper' ? 'bg-purple-900 text-purple-300' :
                 'bg-blue-900 text-blue-300')}>
                {microciclo.tipo}
              </span>
            </div>
          )}
        </div>

        {/* Barra UA planificada vs programada */}
        {microciclo && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm font-medium">Carga de la semana {!microciclo.ua_planificada && <span className="text-gray-600 text-xs ml-1">(sin UA planificada)</span>}</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-green-400">■ {uaReal.toLocaleString()} real</span>
                <span className="text-blue-400">■ {uaProg.toLocaleString()} prog</span>
                <span className="text-orange-400">■ {microciclo.ua_planificada ? microciclo.ua_planificada.toLocaleString() : '—'} plan</span>
              </div>
            </div>
            <div className="bg-gray-800 rounded-full h-3 overflow-hidden mb-2">
              {(() => {
                const plan = microciclo.ua_planificada || 0
                const pctProg = plan > 0 ? Math.min(100, Math.round(uaProg / plan * 100)) : 0
                const pctReal = pctProg > 0 ? Math.min(100, Math.round(uaReal / uaProg * pctProg)) : 0
                return (
                  <div className="h-full rounded-full relative" style={{ width: pctProg + '%', backgroundColor: '#3B82F6', transition: 'width 0.4s' }}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: (pctProg > 0 ? (uaReal / Math.max(uaProg, 1) * 100) : 0) + '%', backgroundColor: '#22C55E', transition: 'width 0.4s' }} />
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-between items-center">
              {(() => {
                const plan = microciclo.ua_planificada || 0
                const pct = plan > 0 ? Math.min(100, Math.round(uaProg / plan * 100)) : 0
                const restante = Math.max(0, plan - uaProg)
                return (
                  <>
                    <span className="font-bold text-lg" style={{ color: pct >= 100 ? '#22C55E' : pct >= 70 ? '#EAB308' : '#3B82F6' }}>{pct}%</span>
                    <span className="text-gray-500 text-xs">
                      {pct >= 100 ? '✓ Semana completa' : restante.toLocaleString() + ' UA por programar'}
                    </span>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* Grid 7 dias */}
        <div className="grid grid-cols-7 gap-3">
          {dias.map(({ fecha: fechaDia, dia, diaCorto, dayNum }) => {
            const sesiones_dia = sesiones.filter(s => s.fecha_sesion === fechaDia)
            const esHoy = fechaDia === hoy
            return (
              <div key={fechaDia} className={'rounded-2xl border flex flex-col overflow-hidden ' +
                (esHoy ? 'border-orange-500' : 'border-gray-800')}>
                {/* Header dia */}
                <div className={'px-3 py-2.5 border-b ' + (esHoy ? 'bg-orange-500/20 border-orange-500/30' : 'bg-gray-900 border-gray-800')}>
                  <p className={'text-xs font-medium ' + (esHoy ? 'text-orange-400' : 'text-gray-400')}>{diaCorto}</p>
                  <p className={'text-lg font-bold ' + (esHoy ? 'text-orange-300' : 'text-white')}>{dayNum}</p>
                </div>

                {/* Sesiones del dia */}
                <div className="flex-1 p-2 bg-gray-900 flex flex-col gap-1.5 min-h-48">
                  {sesiones_dia.map(s => (
                    <div key={s.id} className="group relative">
                      <button
                        onClick={() => window.location.href = '/sesion/' + s.id}
                        className={'w-full text-left rounded-xl p-2.5 transition hover:opacity-90 ' + (COLOR_DISC[s.disciplina] || 'bg-gray-700 text-gray-300')}>
                        <p className="text-xs font-bold">{s.disciplina}</p>
                        <p className="text-xs opacity-80">{s.duracion_minutos ? s.duracion_minutos + 'min' : '—'} · RPE {s.rpe_estimado || '—'}</p>
                        {s.estado === 'Realizada' && <p className="text-xs opacity-60 mt-0.5">✓ Realizada</p>}
                      </button>
                      <button
                        onClick={() => borrarSesion(s.id)}
                        className="absolute top-1 right-1 text-white/0 group-hover:text-white/60 hover:text-white transition text-sm leading-none">
                        x
                      </button>
                    </div>
                  ))}

                  {/* Boton añadir */}
                  <button
                    onClick={() => setModal(fechaDia)}
                    className="w-full mt-auto rounded-xl border border-dashed border-gray-700 hover:border-orange-500/50 hover:bg-orange-500/5 py-2.5 text-gray-600 hover:text-orange-400 text-xs transition text-center">
                    + Sesion
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Resumen semana */}
        {sesiones.length > 0 && (
          <div className="mt-6 bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-bold text-sm mb-3 text-gray-300">Resumen de la semana</h3>
            <div className="flex gap-4 flex-wrap">
              <div>
                <p className="text-2xl font-bold text-white">{sesiones.length}</p>
                <p className="text-gray-500 text-xs">sesiones</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{sesiones.reduce((a, s) => a + (s.duracion_minutos || 0), 0)}min</p>
                <p className="text-gray-500 text-xs">volumen total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{sesiones.filter(s => s.estado === 'Realizada').length}/{sesiones.length}</p>
                <p className="text-gray-500 text-xs">realizadas</p>
              </div>
              {['Natacion','Natación','Ciclismo','Carrera','Fuerza'].map(d => {
                const n = sesiones.filter(s => s.disciplina === d || s.disciplina === d).length
                if (!n) return null
                return (
                  <div key={d} className="flex items-center gap-1.5">
                    <div className={'w-2 h-2 rounded-full ' +
                      (d.includes('Nat') ? 'bg-blue-400' : d === 'Ciclismo' ? 'bg-yellow-400' : d === 'Carrera' ? 'bg-green-400' : 'bg-red-400')} />
                    <span className="text-gray-400 text-xs">{d}: <span className="text-white font-medium">{n}</span></span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva sesion */}
      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="font-bold text-xl">Nueva sesion</h3>
                <p className="text-gray-400 text-sm mt-0.5">{modal}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">x</button>
            </div>
            <div className="flex flex-col gap-4">
              <select value={disc} onChange={e => setDisc(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" required>
                <option value="">Disciplina</option>
                <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option><option>Brick</option>
              </select>
              <input type="number" placeholder="Duracion en minutos (opcional)" value={duracion} onChange={e => setDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">RPE estimado (1-10)</label>
                <input type="number" min="1" max="10" value={rpe} onChange={e => setRpe(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 w-full" />
              </div>
              <textarea placeholder="Notas para el atleta (opcional)" value={notas} onChange={e => setNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
              <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                <input type="checkbox" checked={cronometro} onChange={e => setCronometro(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                <label className="text-white text-sm">Activar cronometro</label>
              </div>
              <button onClick={() => crearSesion(modal)} disabled={guardando || !disc}
                className="bg-orange-500 hover:bg-orange-600 py-3 rounded-xl font-bold text-white transition disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Crear sesion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
