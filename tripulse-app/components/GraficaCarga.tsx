'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { cargarBloques } from '@/lib/atribucion'

// Solo deportes: un brick no es una disciplina, se reparte entre las suyas.
const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']

const DISC_COLORS: Record<string, string> = {
  'Natacion': '#60a5fa',
  'Ciclismo': '#facc15',
  'Carrera': '#4ade80',
  'Fuerza': '#f87171',
}

const DISC_LABELS: Record<string, string> = {
  'Natacion': '🏊 Natación',
  'Ciclismo': '🚴 Ciclismo',
  'Carrera': '🏃 Carrera',
  'Fuerza': '🏋️ Fuerza',
}

function getLunesDeSemana(fecha: string): string {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return y+'-'+m+'-'+dd
}

function getEtiquetaSemana(lunes: string): string {
  const d = new Date(lunes)
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')
}

interface Props {
  depId: number | string
  fcUmbral: number
  modo: 'dia' | 'semana'
  fechaInicio?: string
  fechaFin?: string
  altura?: number
}

export default function GraficaCarga({ depId, fcUmbral, modo, fechaInicio, fechaFin, altura = 280 }: Props) {
  const [datos, setDatos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [disciplinasActivas, setDisciplinasActivas] = useState<string[]>(DISCIPLINAS)

  useEffect(() => {
    if (!depId || !fcUmbral) return
    cargar()
  }, [depId, fcUmbral, modo, fechaInicio, fechaFin])

  const cargar = async () => {
    setLoading(true)
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
    if (!macros?.length) { setDatos([]); setLoading(false); return }
    const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macros.map((m: any) => m.id))
    if (!mesos?.length) { setDatos([]); setLoading(false); return }
    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesos.map((m: any) => m.id))
    if (!micros?.length) { setDatos([]); setLoading(false); return }

    let query = supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, duracion_minutos')
      .in('id_microciclo', micros.map((m: any) => m.id))
      .eq('estado', 'Realizada')
      .order('fecha_sesion')

    if (fechaInicio) query = query.gte('fecha_sesion', fechaInicio)
    if (fechaFin) query = query.lte('fecha_sesion', fechaFin)

    const { data: sesiones } = await query
    if (!sesiones?.length) { setDatos([]); setLoading(false); return }

    const sesIds = sesiones.map((s: any) => s.id)
    const { data: tareas } = await supabase
      .from('tarea')
      .select('id_sesion, rpe_reportado, fc_media')
      .in('id_sesion', sesIds)
      .not('rpe_reportado', 'is', null)

    const sesionesConCarga = sesiones.map((s: any) => {
      const tareasS = (tareas || []).filter((t: any) => t.id_sesion === s.id)
      const tareasConFC = tareasS.filter((t: any) => t.fc_media)
      const fcMediaProm = tareasConFC.length
        ? tareasConFC.reduce((acc: number, t: any) => acc + t.fc_media, 0) / tareasConFC.length
        : null
      const rpeProm = tareasS.length
        ? tareasS.reduce((acc: number, t: any) => acc + (t.rpe_reportado || 0), 0) / tareasS.length
        : null
      if (!rpeProm) return null
      const fcRelativa = fcMediaProm && fcUmbral > 0 ? fcMediaProm / fcUmbral : null
      const cargaObjetiva = fcRelativa ? fcRelativa * 10 : rpeProm
      const uac = Math.round(((cargaObjetiva + rpeProm) / 2) * (s.duracion_minutos || 0))
      return { id: s.id, fecha: s.fecha_sesion, uac: uac > 0 ? uac : 0 }
    }).filter(Boolean) as { id: number, fecha: string, uac: number }[]

    // El UAC es de sesión (mezcla FC media y RPE reportado), así que no se
    // recalcula: se REPARTE entre los bloques según su peso en UA. En una sesión
    // normal hay un solo bloque y el reparto es la identidad; en un brick, cada
    // deporte se lleva lo suyo (ver lib/atribucion).
    // usarRpeDeBloque: aquí la UA solo sirve de PESO para repartir. En una sesión normal
    // hay un bloque y el peso es 1 pase lo que pase; en un brick, usar el RPE real de
    // cada bloque es exactamente lo que hace que la bici y la carrera se lleven lo suyo.
    const bloques = await cargarBloques(supabase, sesiones, { estimar: false, usarRpeDeBloque: true })
    const uaPorSesion: Record<number, number> = {}
    bloques.forEach(b => { uaPorSesion[b.id_sesion] = (uaPorSesion[b.id_sesion] || 0) + b.ua })

    const mapa: Record<string, Record<string, number>> = {}
    sesionesConCarga.forEach(s => {
      const clave = modo === 'dia' ? s.fecha : getLunesDeSemana(s.fecha)
      if (!mapa[clave]) mapa[clave] = {}
      const suyos = bloques.filter(b => b.id_sesion === s.id)
      const totalUA = uaPorSesion[s.id] || 0
      if (!suyos.length || totalUA <= 0) {
        const disc = sesiones.find((x: any) => x.id === s.id)?.disciplina || 'Carrera'
        mapa[clave][disc] = (mapa[clave][disc] || 0) + s.uac
        return
      }
      suyos.forEach(b => {
        mapa[clave][b.disciplina] = (mapa[clave][b.disciplina] || 0) + s.uac * (b.ua / totalUA)
      })
    })

    const resultado = Object.entries(mapa)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, discs]) => {
        const fila: any = {
          label: modo === 'dia'
            ? String(new Date(clave).getDate()).padStart(2,'0')+'/'+String(new Date(clave).getMonth()+1).padStart(2,'0')
            : getEtiquetaSemana(clave),
        }
        DISCIPLINAS.forEach(d => { fila[d] = Math.round(discs[d] || 0) })
        fila.total = DISCIPLINAS.reduce((a, d) => a + fila[d], 0)
        return fila
      })

    setDatos(resultado)
    setLoading(false)
  }

  const toggleDisc = (disc: string) => {
    setDisciplinasActivas(prev =>
      prev.includes(disc) ? prev.filter(d => d !== disc) : [...prev, disc]
    )
  }

  const mediaTotal = datos.length
    ? Math.round(datos.reduce((acc, d) => acc + d.total, 0) / datos.length)
    : 0

  const disciplinasPresentes = DISCIPLINAS.filter(d => datos.some(row => row[d] > 0))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const total = payload.reduce((acc: number, p: any) => acc + (p.value || 0), 0)
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs">
        <p className="text-gray-400 mb-2">{modo === 'dia' ? 'Día' : 'Semana'} {label}</p>
        {payload.filter((p: any) => p.value > 0).map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.fill }}>{DISC_LABELS[p.dataKey] || p.dataKey}</span>
            <span className="text-white font-bold">{p.value} UAC</span>
          </div>
        ))}
        <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between">
          <span className="text-gray-400">Total</span>
          <span className="text-orange-400 font-bold">{total} UAC</span>
        </div>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Calculando carga...</div>

  if (!datos.length) return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-600 text-sm gap-2">
      <span className="text-3xl">📊</span>
      <p>Sin sesiones realizadas con datos post-sesión en este periodo</p>
      <p className="text-xs text-gray-700">El deportista necesita completar el RPE post-sesión</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap items-center">
        {disciplinasPresentes.map(disc => (
          <button key={disc} onClick={() => toggleDisc(disc)}
            className={'text-xs px-3 py-1.5 rounded-lg transition border ' +
              (disciplinasActivas.includes(disc) ? 'text-gray-900 border-transparent font-medium' : 'bg-gray-800 text-gray-500 border-gray-700')}
            style={disciplinasActivas.includes(disc) ? { background: DISC_COLORS[disc], borderColor: DISC_COLORS[disc] } : {}}>
            {DISC_LABELS[disc]}
          </button>
        ))}
        <div className="ml-auto text-xs text-gray-500 flex items-center gap-1">
          Media: <span className="text-orange-400 font-semibold ml-1">{mediaTotal} UAC</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={datos} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="label" stroke="#6b7280" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <ReferenceLine y={mediaTotal} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1.5} />
          {disciplinasPresentes.filter(d => disciplinasActivas.includes(d)).map((disc, idx, arr) => (
            <Bar key={disc} dataKey={disc} stackId="carga" fill={DISC_COLORS[disc]}
              radius={idx === arr.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {disciplinasPresentes.map(disc => {
          const total = datos.reduce((acc, d) => acc + (d[disc] || 0), 0)
          const totalGlobal = datos.reduce((acc, d) => acc + d.total, 0)
          const porcentaje = totalGlobal > 0 ? Math.round((total / totalGlobal) * 100) : 0
          return (
            <div key={disc} className="bg-gray-800 rounded-lg p-2">
              <p className="text-gray-500 text-xs">{DISC_LABELS[disc]}</p>
              <p className="font-bold text-sm" style={{ color: DISC_COLORS[disc] }}>{total} UAC</p>
              <p className="text-gray-600 text-xs">{porcentaje}% del total</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
