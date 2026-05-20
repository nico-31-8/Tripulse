'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function getLunesDeSemana(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function colorCumplimiento(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

function textoCumplimiento(pct: number): string {
  if (pct >= 80) return 'text-green-400'
  if (pct >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function etiquetaCumplimiento(pct: number): string {
  if (pct >= 80) return 'Excelente'
  if (pct >= 60) return 'Aceptable'
  if (pct > 0) return 'Bajo'
  return 'Sin datos'
}

interface Props {
  depId: number | string
}

export default function Adherencia({ depId }: Props) {
  const [semanas, setSemanas] = useState<any[]>([])
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<string | null>(null)
  const [totalPlan, setTotalPlan] = useState(0)
  const [totalReal, setTotalReal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [depId])

  const cargar = async () => {
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
    if (!macros?.length) { setLoading(false); return }
    const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macros.map(m => m.id))
    if (!mesos?.length) { setLoading(false); return }
    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesos.map(m => m.id))
    if (!micros?.length) { setLoading(false); return }

    const { data: sesiones } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, duracion_minutos, estado, rpe_estimado')
      .in('id_microciclo', micros.map(m => m.id))
      .order('fecha_sesion')

    if (!sesiones?.length) { setLoading(false); return }

    // Agrupar por semana
    const mapa: Record<string, any[]> = {}
    sesiones.forEach(s => {
      const lunes = getLunesDeSemana(s.fecha_sesion)
      if (!mapa[lunes]) mapa[lunes] = []
      mapa[lunes].push(s)
    })

    const semanasOrdenadas = Object.keys(mapa).sort().reverse().slice(0, 12).map(lunes => {
      const ses = mapa[lunes]
      const planificadas = ses.length
      const realizadas = ses.filter(s => s.estado === 'Realizada').length
      const pct = planificadas > 0 ? Math.round((realizadas / planificadas) * 100) : 0
      const domingo = new Date(lunes + 'T12:00:00')
      domingo.setDate(domingo.getDate() + 6)
      return {
        lunes,
        domingo: domingo.toISOString().split('T')[0],
        planificadas,
        realizadas,
        pct,
        sesiones: ses
      }
    })

    const totalP = sesiones.length
    const totalR = sesiones.filter(s => s.estado === 'Realizada').length
    setTotalPlan(totalP)
    setTotalReal(totalR)
    setSemanas(semanasOrdenadas)
    setLoading(false)
  }

  if (loading) return <div className="text-center py-8 text-gray-500 text-sm">Calculando adherencia...</div>

  if (!semanas.length) return (
    <div className="text-center py-8 text-gray-600 text-sm">
      <p>No hay sesiones planificadas todavía.</p>
    </div>
  )

  const pctGlobal = totalPlan > 0 ? Math.round((totalReal / totalPlan) * 100) : 0
  const semSel = semanas.find(s => s.lunes === semanaSeleccionada)

  const COLOR_DISC: Record<string, string> = {
    'Natacion': 'bg-blue-900 text-blue-300',
    'Natación': 'bg-blue-900 text-blue-300',
    'Ciclismo': 'bg-yellow-900 text-yellow-300',
    'Carrera': 'bg-green-900 text-green-300',
    'Fuerza': 'bg-red-900 text-red-300',
    'Brick': 'bg-purple-900 text-purple-300',
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Resumen global */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Adherencia global</p>
        <div className="flex items-end gap-4 mb-3">
          <p className={'text-5xl font-bold ' + textoCumplimiento(pctGlobal)}>{pctGlobal}%</p>
          <div className="mb-1">
            <p className={'text-sm font-medium ' + textoCumplimiento(pctGlobal)}>{etiquetaCumplimiento(pctGlobal)}</p>
            <p className="text-gray-500 text-xs">{totalReal} de {totalPlan} sesiones completadas</p>
          </div>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2.5">
          <div className={'h-2.5 rounded-full transition-all ' + colorCumplimiento(pctGlobal)}
            style={{ width: pctGlobal + '%' }} />
        </div>
      </div>

      {/* Gráfica de barras por semana */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Últimas {semanas.length} semanas — pulsa para ver detalle</p>
        <div className="flex items-end gap-1.5 h-32">
          {[...semanas].reverse().map(s => (
            <div key={s.lunes} className="flex-1 flex flex-col items-center gap-1 cursor-pointer"
              onClick={() => setSemanaSeleccionada(s.lunes === semanaSeleccionada ? null : s.lunes)}>
              <p className={'text-xs font-medium ' + textoCumplimiento(s.pct)}>{s.pct}%</p>
              <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                <div
                  className={'w-full rounded-t-md transition-all ' + colorCumplimiento(s.pct) +
                    (semanaSeleccionada === s.lunes ? ' ring-2 ring-white' : ' opacity-80 hover:opacity-100')}
                  style={{ height: Math.max(4, s.pct * 0.8) + 'px' }}
                />
              </div>
              <p className="text-gray-600 text-xs">{s.lunes.slice(5)}</p>
            </div>
          ))}
        </div>

        {/* Leyenda */}
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> ≥80%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block"></span> 60-79%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> &lt;60%</span>
        </div>
      </div>

      {/* Detalle semana seleccionada */}
      {semSel && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
            <div>
              <p className="font-bold text-white">Semana del {semSel.lunes} al {semSel.domingo}</p>
              <p className={'text-sm mt-0.5 ' + textoCumplimiento(semSel.pct)}>
                {semSel.realizadas}/{semSel.planificadas} sesiones · {semSel.pct}% — {etiquetaCumplimiento(semSel.pct)}
              </p>
            </div>
            <button onClick={() => setSemanaSeleccionada(null)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
          </div>
          <div className="p-4 flex flex-col gap-2">
            {semSel.sesiones.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (COLOR_DISC[s.disciplina] || 'bg-gray-700 text-gray-300')}>
                    {s.disciplina}
                  </span>
                  <span className="text-gray-400 text-sm">{s.fecha_sesion}</span>
                  {s.duracion_minutos && <span className="text-gray-500 text-xs">{s.duracion_minutos}min</span>}
                </div>
                <span className={'text-xs font-medium px-2 py-0.5 rounded-full ' +
                  (s.estado === 'Realizada' ? 'bg-green-900 text-green-300' :
                   s.estado === 'Cancelada' ? 'bg-red-900 text-red-300' :
                   'bg-gray-700 text-gray-400')}>
                  {s.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
