'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { factorSicat, type SicatResultado } from '@/lib/sicat'
import { cargarBloques, type Bloque } from '@/lib/atribucion'

const DISCIPLINAS = [
  { key: 'Natacion', label: '🏊 Natación', color: '#60a5fa' },
  { key: 'Ciclismo', label: '🚴 Ciclismo', color: '#facc15' },
  { key: 'Carrera', label: '🏃 Carrera', color: '#4ade80' },
  { key: 'Fuerza', label: '🏋️ Fuerza', color: '#f87171' },
]

// Recibe BLOQUES, no sesiones: un brick aporta a la bici y a la carrera por
// separado, cada una con sus minutos reales (ver lib/atribucion).
function calcularCargasDisc(bloques: Bloque[], factor: number) {
  if (!bloques.length) return []
  const mapa: Record<string, number> = {}
  bloques.forEach(b => {
    mapa[b.fecha] = (mapa[b.fecha] || 0) + b.ua * factor
  })
  const fechas = Object.keys(mapa).sort()
  let atl = 0, ctl = 0
  return fechas.map(fecha => {
    const carga = mapa[fecha] || 0
    atl = carga * (2/8) + atl * (1 - 2/8)
    ctl = carga * (2/43) + ctl * (1 - 2/43)
    return { fecha: fecha.slice(5), atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(ctl - atl) }
  })
}

function estadoTSB(tsb: number) {
  if (tsb < -30) return { label: 'Sobrecarga', color: 'text-red-400', bg: 'bg-red-900/40 border-red-700' }
  if (tsb < -10) return { label: 'Carga productiva', color: 'text-orange-400', bg: 'bg-orange-900/40 border-orange-700' }
  if (tsb < 5)   return { label: 'Transición', color: 'text-yellow-400', bg: 'bg-yellow-900/40 border-yellow-700' }
  if (tsb < 25)  return { label: 'Forma óptima', color: 'text-green-400', bg: 'bg-green-900/40 border-green-700' }
  return { label: 'Desentrenamiento', color: 'text-blue-400', bg: 'bg-blue-900/40 border-blue-700' }
}

function semaforo(tsb: number) {
  if (tsb < -30) return '🔴'
  if (tsb < -10) return '🟠'
  if (tsb < 5)   return '🟡'
  if (tsb < 25)  return '🟢'
  return '🔵'
}

interface Props {
  depId: number | string
  diasRango?: number
  sicat?: SicatResultado | null
}

export default function CargaPorDisciplina({ depId, diasRango = 56, sicat = null }: Props) {
  const [bloques, setBloques] = useState<Bloque[]>([])
  const [loading, setLoading] = useState(true)
  const [discActiva, setDiscActiva] = useState('Carrera')

  useEffect(() => {
    if (!depId) return
    cargar()
  }, [depId, diasRango])

  const cargar = async () => {
    setLoading(true)

    const desde = new Date()
    desde.setDate(desde.getDate() - diasRango - 42)
    const desdeStr = desde.toISOString().split('T')[0]

    // Obtener microciclos del deportista
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
    if (!macros?.length) { setBloques([]); setLoading(false); return }
    const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macros.map(m => m.id))
    if (!mesos?.length) { setBloques([]); setLoading(false); return }
    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesos.map(m => m.id))
    if (!micros?.length) { setBloques([]); setLoading(false); return }
    const microIds = micros.map(m => m.id)

    // Una sola consulta sin filtrar por disciplina: el deporte lo pone el bloque.
    const { data: ses } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, duracion_minutos, duracion_real')
      .in('id_microciclo', microIds)
      .eq('estado', 'Realizada')
      .gte('fecha_sesion', desdeStr)
      .order('fecha_sesion')

    setBloques(await cargarBloques(supabase, ses || [], {
      rpe: s => s.rpe_estimado || 5,   // como antes: aquí se usa el RPE planificado
      estimar: false,                  // sin duración manual la sesión pesa 0, como antes
    }))
    setLoading(false)
  }

  const datosPorDisc = useMemo(() => {
    const resultado: Record<string, any[]> = {}
    for (const disc of DISCIPLINAS) {
      const factor = sicat ? factorSicat(disc.key, sicat) : 1
      const suyos = bloques.filter(b => b.disciplina === disc.key)
      resultado[disc.key] = calcularCargasDisc(suyos, factor).slice(-diasRango)
    }
    return resultado
  }, [bloques, sicat, diasRango])

  if (loading) return <div className="text-center py-8 text-gray-500 text-sm">Calculando carga por disciplina...</div>

  const todasVacias = DISCIPLINAS.every(d => !datosPorDisc[d.key]?.length)
  if (todasVacias) return (
    <div className="text-center py-8 text-gray-600 text-sm">
      <p>Sin sesiones realizadas por disciplina todavía.</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">

      {/* Resumen semáforo por disciplina */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DISCIPLINAS.map(disc => {
          const datos = datosPorDisc[disc.key] || []
          const ultimo = datos[datos.length - 1]
          if (!ultimo) return (
            <div key={disc.key} className="bg-gray-800 rounded-xl p-4 border border-gray-700 opacity-40">
              <p className="text-xs text-gray-500 mb-1">{disc.label}</p>
              <p className="text-gray-600 text-sm">Sin datos</p>
            </div>
          )
          const estado = estadoTSB(ultimo.tsb)
          return (
            <button key={disc.key}
              onClick={() => setDiscActiva(disc.key)}
              className={'rounded-xl p-4 border text-left transition ' +
                (discActiva === disc.key ? 'ring-2 ring-white ' : '') + estado.bg}>
              <p className="text-xs text-gray-300 mb-1">{disc.label}</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{semaforo(ultimo.tsb)}</span>
                <span className={'font-bold text-lg ' + estado.color}>{ultimo.tsb > 0 ? '+' : ''}{ultimo.tsb}</span>
              </div>
              <p className={'text-xs font-medium ' + estado.color}>{estado.label}</p>
              <div className="mt-2 flex gap-2 text-xs text-gray-400">
                <span>CTL {ultimo.ctl}</span>
                <span>·</span>
                <span>ATL {ultimo.atl}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Alerta si hay desequilibrio */}
      {(() => {
        const conDatos = DISCIPLINAS.filter(d => datosPorDisc[d.key]?.length)
        const tsbPorDisc = conDatos.map(d => {
          const datos = datosPorDisc[d.key]
          const ultimo = datos[datos.length - 1]
          return { disc: d, tsb: ultimo?.tsb || 0 }
        })
        const sobrecargadas = tsbPorDisc.filter(d => d.tsb < -20)
        const descansadas = tsbPorDisc.filter(d => d.tsb > 10)
        if (sobrecargadas.length > 0 && descansadas.length > 0) {
          return (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-5 py-4">
              <p className="text-red-300 font-semibold text-sm mb-1">⚠️ Desequilibrio detectado entre disciplinas</p>
              <p className="text-gray-400 text-xs">
                Sobrecarga en {sobrecargadas.map(d => d.disc.label).join(', ')} mientras {descansadas.map(d => d.disc.label).join(', ')} está{descansadas.length > 1 ? 'n' : ''} en zona de descanso.
                Revisar distribución de carga semanal.
              </p>
            </div>
          )
        }
        return null
      })()}

      {/* Gráfica de la disciplina activa */}
      {(() => {
        const datos = datosPorDisc[discActiva] || []
        const disc = DISCIPLINAS.find(d => d.key === discActiva)!
        if (!datos.length) return (
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 text-center text-gray-600 text-sm py-8">
            Sin sesiones de {disc.label} en este período
          </div>
        )
        return (
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="font-semibold text-white">{disc.label} — Forma · Fatiga · Frescura</p>
                <p className="text-gray-500 text-xs mt-0.5">{datos.length} días con sesiones realizadas</p>
              </div>
              <div className="flex gap-1">
                {DISCIPLINAS.filter(d => datosPorDisc[d.key]?.length).map(d => (
                  <button key={d.key} onClick={() => setDiscActiva(d.key)}
                    className={'px-2 py-1 rounded text-xs transition ' +
                      (discActiva === d.key ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300')}
                    style={discActiva === d.key ? { color: d.color } : {}}>
                    {d.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="fecha" stroke="#6b7280" tick={{ fontSize: 10 }} interval={Math.floor(datos.length / 6)} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ctl" stroke={disc.color} strokeWidth={2} dot={false} name="CTL (forma)" />
                <Line type="monotone" dataKey="atl" stroke="#f87171" strokeWidth={1.5} dot={false} name="ATL (fatiga)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="tsb" stroke="#4ade80" strokeWidth={2} dot={false} name="TSB (frescura)" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block rounded" style={{ background: disc.color }}></span> CTL forma</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block rounded bg-red-400"></span> ATL fatiga</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block rounded bg-green-400"></span> TSB frescura</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
