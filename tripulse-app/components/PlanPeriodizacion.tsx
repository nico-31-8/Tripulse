'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

const DISCIPLINAS_COLORES: Record<string, string> = {
  'Natacion': '#60a5fa',
  'Ciclismo': '#facc15',
  'Carrera': '#4ade80',
  'Fuerza': '#f87171',
  'Brick': '#c084fc',
}

const FASE_COLORES: Record<string, string> = {
  'Acumulación': '#f97316',
  'Acumulacion': '#f97316',
  'Transmutación': '#eab308',
  'Transmutacion': '#eab308',
  'Realización': '#ef4444',
  'Realizacion': '#ef4444',
  'Recuperación': '#22c55e',
  'Recuperacion': '#22c55e',
}

// Sugerencias por tipo de periodización y fase
const SUGERENCIAS: Record<string, Record<string, any>> = {
  'Tradicional': {
    'General': {
      cargaRelativa: 90,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z1', 'Z2'],
      sesiones: 5,
      descripcion: 'Volumen máximo en Z1-Z2. Fuerza de base. Trabajo técnico de natación.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Volumen técnico', zona: 'Z1-Z2', duracion: '60-90min' },
        { disc: '🚴 Ciclismo', tipo: 'Rodaje largo', zona: 'Z2', duracion: '90-120min' },
        { disc: '🏃 Carrera', tipo: 'Rodaje suave', zona: 'Z1-Z2', duracion: '45-60min' },
        { disc: '🏋️ Fuerza', tipo: 'Fuerza base', zona: 'Volumen alto', duracion: '60min' },
      ]
    },
    'Específica': {
      cargaRelativa: 75,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z3', 'Z4'],
      sesiones: 5,
      descripcion: 'Trabajo de umbral. Series específicas por disciplina. Intensidad media-alta.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Series CSS', zona: 'Z3-Z4', duracion: '60min' },
        { disc: '🚴 Ciclismo', tipo: 'Intervalos umbral', zona: 'Z4', duracion: '75min' },
        { disc: '🏃 Carrera', tipo: 'Tempo run', zona: 'Z3-Z4', duracion: '50min' },
        { disc: '🏋️ Fuerza', tipo: 'Fuerza específica', zona: 'Intensidad media', duracion: '45min' },
      ]
    },
    'Competitiva': {
      cargaRelativa: 55,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z4', 'Z5'],
      sesiones: 4,
      descripcion: 'Simulaciones de carrera. Intensidad alta. Volumen reducido.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Ritmo competición', zona: 'Z4-Z5', duracion: '45min' },
        { disc: '🚴 Ciclismo', tipo: 'Series VO2máx', zona: 'Z5', duracion: '60min' },
        { disc: '🏃 Carrera', tipo: 'Simulación ritmo', zona: 'Z4-Z5', duracion: '40min' },
      ]
    },
    'Taper': {
      cargaRelativa: 30,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z1', 'Z2'],
      sesiones: 3,
      descripcion: 'Reducción drástica de volumen. Mantener algo de intensidad para no perder la forma.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Activación', zona: 'Z1-Z2', duracion: '30min' },
        { disc: '🚴 Ciclismo', tipo: 'Rodaje suave', zona: 'Z1', duracion: '40min' },
        { disc: '🏃 Carrera', tipo: 'Activación', zona: 'Z2', duracion: '25min' },
      ]
    }
  },
  'ATR': {
    'Acumulación': {
      cargaRelativa: 85,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z1', 'Z2', 'Z3'],
      sesiones: 5,
      descripcion: 'Volumen alto. Base aeróbica. Fuerza resistencia. Técnica.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Volumen Z2', zona: 'Z2', duracion: '75min' },
        { disc: '🚴 Ciclismo', tipo: 'Fondo largo', zona: 'Z2', duracion: '120min' },
        { disc: '🏃 Carrera', tipo: 'Rodaje Z2', zona: 'Z2', duracion: '60min' },
        { disc: '🏋️ Fuerza', tipo: 'Fuerza resistencia', zona: 'Volumen', duracion: '60min' },
      ]
    },
    'Transmutación': {
      cargaRelativa: 70,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z3', 'Z4', 'Z5'],
      sesiones: 5,
      descripcion: 'Transforma la base en velocidad específica. Umbral y VO2máx.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Series umbral', zona: 'Z4', duracion: '60min' },
        { disc: '🚴 Ciclismo', tipo: 'Sweetspot', zona: 'Z3-Z4', duracion: '90min' },
        { disc: '🏃 Carrera', tipo: 'Intervalos', zona: 'Z4-Z5', duracion: '55min' },
        { disc: '🏋️ Fuerza', tipo: 'Potencia', zona: 'Intensidad', duracion: '45min' },
      ]
    },
    'Realización': {
      cargaRelativa: 50,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z4', 'Z5', 'Z6'],
      sesiones: 4,
      descripcion: 'Puesta a punto. Volumen bajo, intensidad máxima. Simulaciones.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Ritmo carrera', zona: 'Z4-Z5', duracion: '45min' },
        { disc: '🚴 Ciclismo', tipo: 'Series cortas Z5', zona: 'Z5-Z6', duracion: '60min' },
        { disc: '🏃 Carrera', tipo: 'Simulación', zona: 'Z4-Z5', duracion: '40min' },
      ]
    },
    'Taper': {
      cargaRelativa: 25,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z1', 'Z2'],
      sesiones: 3,
      descripcion: 'Descarga total. Frescura máxima para la competición.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Activación', zona: 'Z1-Z2', duracion: '30min' },
        { disc: '🚴 Ciclismo', tipo: 'Rodaje suave', zona: 'Z1', duracion: '35min' },
        { disc: '🏃 Carrera', tipo: 'Trote suave', zona: 'Z1', duracion: '20min' },
      ]
    }
  },
  'Inversa': {
    'Intensidad': {
      cargaRelativa: 65,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'],
      zonas: ['Z4', 'Z5', 'Z6'],
      sesiones: 4,
      descripcion: 'Alta intensidad desde el inicio. Series cortas y potentes. Fuerza máxima.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Series cortas Z5', zona: 'Z5', duracion: '45min' },
        { disc: '🚴 Ciclismo', tipo: 'Sprints y series', zona: 'Z5-Z6', duracion: '60min' },
        { disc: '🏃 Carrera', tipo: 'Intervalos cortos', zona: 'Z5', duracion: '40min' },
        { disc: '🏋️ Fuerza', tipo: 'Fuerza máxima', zona: 'Alta intensidad', duracion: '60min' },
      ]
    },
    'Desarrollo': {
      cargaRelativa: 75,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z3', 'Z4'],
      sesiones: 5,
      descripcion: 'Umbral sostenido. Sesiones más largas. Se empieza a construir volumen.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Umbral largo', zona: 'Z3-Z4', duracion: '60min' },
        { disc: '🚴 Ciclismo', tipo: 'Tempo largo', zona: 'Z3-Z4', duracion: '90min' },
        { disc: '🏃 Carrera', tipo: 'Tempo run', zona: 'Z3-Z4', duracion: '55min' },
        { disc: '🏋️ Fuerza', tipo: 'Fuerza resistencia', zona: 'Media', duracion: '45min' },
      ]
    },
    'Resistencia específica': {
      cargaRelativa: 90,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z2', 'Z3'],
      sesiones: 6,
      descripcion: 'Volumen máximo. Se aplica la velocidad desarrollada en sesiones largas.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Fondo largo', zona: 'Z2', duracion: '90min' },
        { disc: '🚴 Ciclismo', tipo: 'Rodaje muy largo', zona: 'Z2-Z3', duracion: '150min' },
        { disc: '🏃 Carrera', tipo: 'Rodaje largo', zona: 'Z2', duracion: '75min' },
      ]
    },
    'Taper': {
      cargaRelativa: 30,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z1', 'Z2'],
      sesiones: 3,
      descripcion: 'Reducción drástica. Mantener activación sin acumular fatiga.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Activación', zona: 'Z1-Z2', duracion: '30min' },
        { disc: '🚴 Ciclismo', tipo: 'Rodaje suave', zona: 'Z1', duracion: '40min' },
        { disc: '🏃 Carrera', tipo: 'Trote', zona: 'Z1', duracion: '25min' },
      ]
    }
  },
  'Ondulatoria': {
    'Carga alta': {
      cargaRelativa: 85,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z2', 'Z3', 'Z4'],
      sesiones: 5,
      descripcion: 'Semana de carga máxima del ciclo. Volumen e intensidad altos.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Volumen + umbral', zona: 'Z2-Z4', duracion: '75min' },
        { disc: '🚴 Ciclismo', tipo: 'Fondo con series', zona: 'Z2-Z4', duracion: '105min' },
        { disc: '🏃 Carrera', tipo: 'Largo con ritmo', zona: 'Z2-Z3', duracion: '65min' },
        { disc: '🏋️ Fuerza', tipo: 'Fuerza resistencia', zona: 'Media', duracion: '50min' },
      ]
    },
    'Carga media': {
      cargaRelativa: 65,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z2', 'Z3'],
      sesiones: 4,
      descripcion: 'Semana de carga media. Mantener calidad sin acumular fatiga excesiva.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Técnica y ritmo', zona: 'Z2-Z3', duracion: '55min' },
        { disc: '🚴 Ciclismo', tipo: 'Rodaje moderado', zona: 'Z2-Z3', duracion: '75min' },
        { disc: '🏃 Carrera', tipo: 'Rodaje medio', zona: 'Z2', duracion: '50min' },
      ]
    },
    'Recuperación': {
      cargaRelativa: 35,
      disciplinas: ['Natacion', 'Ciclismo', 'Carrera'],
      zonas: ['Z1', 'Z2'],
      sesiones: 3,
      descripcion: 'Semana de recuperación activa. Volumen muy bajo, intensidad Z1-Z2.',
      detalle: [
        { disc: '🏊 Natación', tipo: 'Técnica suave', zona: 'Z1', duracion: '35min' },
        { disc: '🚴 Ciclismo', tipo: 'Rodaje suave', zona: 'Z1-Z2', duracion: '45min' },
        { disc: '🏃 Carrera', tipo: 'Trote regenerativo', zona: 'Z1', duracion: '30min' },
      ]
    }
  }
}

function getFaseParaSemana(tipoPeriodizacion: string, semanaNum: number, totalSemanas: number): string {
  const pct = semanaNum / totalSemanas

  if (tipoPeriodizacion === 'Tradicional') {
    if (pct <= 0.45) return 'General'
    if (pct <= 0.80) return 'Específica'
    if (pct <= 0.93) return 'Competitiva'
    return 'Taper'
  }

  if (tipoPeriodizacion === 'ATR') {
    // Ciclos de 6 semanas: 3 Acum + 2 Trans + 1 Real, último bloque Taper
    if (pct > 0.90) return 'Taper'
    const semEnCiclo = ((semanaNum - 1) % 6) + 1
    if (semEnCiclo <= 3) return 'Acumulación'
    if (semEnCiclo <= 5) return 'Transmutación'
    return 'Realización'
  }

  if (tipoPeriodizacion === 'Inversa') {
    if (pct <= 0.30) return 'Intensidad'
    if (pct <= 0.70) return 'Desarrollo'
    if (pct <= 0.90) return 'Resistencia específica'
    return 'Taper'
  }

  if (tipoPeriodizacion === 'Ondulatoria') {
    if (pct > 0.92) return 'Recuperación'
    const semEnCiclo = ((semanaNum - 1) % 4) + 1
    if (semEnCiclo === 4) return 'Recuperación'
    if (semEnCiclo === 3) return 'Carga alta'
    return 'Carga media'
  }

  return 'General'
}

function getCargaRelativa(tipoPeriodizacion: string, fase: string): number {
  return SUGERENCIAS[tipoPeriodizacion]?.[fase]?.cargaRelativa || 60
}

interface Props {
  depId: number | string
  macroId?: number
  tipoPeriodizacion: string
  fechaInicio: string
  duracionSemanas: number
  competiciones?: any[]
  vistaDetalle?: 'multi' | 'mes'
  mesActual?: { mes: number, año: number }
}

export default function PlanPeriodizacion({
  depId, macroId, tipoPeriodizacion, fechaInicio,
  duracionSemanas, competiciones = [], vistaDetalle = 'multi', mesActual
}: Props) {
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<number | null>(null)
  const [sesionesReales, setSesionesReales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargarSesiones()
  }, [depId, macroId])

  const cargarSesiones = async () => {
    if (!macroId) { setLoading(false); return }
    const { data: mesos } = await supabase.from('mesociclo').select('id').eq('id_macrociclo', macroId)
    if (!mesos?.length) { setLoading(false); return }
    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesos.map(m => m.id))
    if (!micros?.length) { setLoading(false); return }
    const { data: ses } = await supabase.from('sesion').select('fecha_sesion, disciplina, duracion_minutos, estado').in('id_microciclo', micros.map(m => m.id)).order('fecha_sesion')
    setSesionesReales(ses || [])
    setLoading(false)
  }

  // Generar semanas
  const inicio = new Date(fechaInicio + 'T12:00:00')
  const semanas = Array.from({ length: duracionSemanas }, (_, i) => {
    const lunes = new Date(inicio)
    lunes.setDate(inicio.getDate() + i * 7)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    const fase = getFaseParaSemana(tipoPeriodizacion, i + 1, duracionSemanas)
    const cargaTeorica = getCargaRelativa(tipoPeriodizacion, fase)

    // Sesiones reales de esa semana
    const lunesStr = lunes.toISOString().split('T')[0]
    const domingoStr = domingo.toISOString().split('T')[0]
    const sesSemana = sesionesReales.filter(s => s.fecha_sesion >= lunesStr && s.fecha_sesion <= domingoStr)
    const cargaReal = sesSemana.filter(s => s.estado === 'Realizada').reduce((acc, s) => acc + (s.duracion_minutos || 0), 0)

    // Competición esta semana
    const compSemana = competiciones.find(c => c.fecha >= lunesStr && c.fecha <= domingoStr)

    return {
      num: i + 1,
      lunes: lunesStr,
      domingo: domingoStr,
      fase,
      cargaTeorica,
      cargaReal,
      sesiones: sesSemana,
      compSemana,
      label: `S${i+1}`,
    }
  })

  // Filtrar por mes si estamos en vista mes
  const semanasFiltradas = vistaDetalle === 'mes' && mesActual
    ? semanas.filter(s => {
        const d = new Date(s.lunes)
        return d.getMonth() === mesActual.mes && d.getFullYear() === mesActual.año
      })
    : semanas

  if (!tipoPeriodizacion) return (
    <div className="text-center py-8 text-gray-600 text-sm">
      <p>Este macrociclo no tiene tipo de periodización asignado.</p>
      <p className="text-xs mt-1">Edita el macrociclo para asignar uno.</p>
    </div>
  )

  const semSel = semanaSeleccionada !== null ? semanas.find(s => s.num === semanaSeleccionada) : null
  const sugerencias = semSel ? SUGERENCIAS[tipoPeriodizacion]?.[semSel.fase] : null

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const semana = semanas.find(s => s.label === label)
    if (!semana) return null
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs">
        <p className="text-white font-semibold mb-1">Semana {semana.num} — {semana.fase}</p>
        <p className="text-gray-400">Lunes: {semana.lunes}</p>
        <p className="text-orange-400">Carga teórica: {semana.cargaTeorica}%</p>
        {semana.cargaReal > 0 && <p className="text-green-400">Minutos realizados: {semana.cargaReal}min</p>}
        {semana.compSemana && <p className="text-yellow-400">🏆 {semana.compSemana.nombre}</p>}
        <p className="text-gray-500 mt-1">Pulsa para ver sugerencias</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-white">📋 Plan de periodización — {tipoPeriodizacion}</h3>
          <p className="text-gray-500 text-xs mt-0.5">{duracionSemanas} semanas · Pulsa una semana para ver las sugerencias</p>
        </div>
      </div>

      {/* Leyenda de fases */}
      <div className="flex gap-3 flex-wrap text-xs">
        {[...new Set(semanasFiltradas.map(s => s.fase))].map(fase => (
          <div key={fase} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: FASE_COLORES[fase] || '#6b7280' }} />
            <span className="text-gray-400">{fase}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-3 h-3 rounded-sm bg-gray-600 opacity-60" />
          <span className="text-gray-500">Carga real (min)</span>
        </div>
      </div>

      {/* Gráfica */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={semanasFiltradas} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            onClick={(data) => {
              if (data && data.activeIndex !== undefined && data.activeIndex !== null) {
                const s = semanasFiltradas[data.activeIndex as number]
                if (s) setSemanaSeleccionada(s.num === semanaSeleccionada ? null : s.num)
              }
            }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="label" stroke="#6b7280" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="cargaTeorica" name="Carga teórica" radius={[3,3,0,0]}>
              {semanasFiltradas.map((s, i) => (
                <Cell
                  key={i}
                  fill={s.compSemana ? '#eab308' : FASE_COLORES[s.fase] || '#6b7280'}
                  opacity={semanaSeleccionada === s.num ? 1 : 0.75}
                  stroke={semanaSeleccionada === s.num ? 'white' : 'transparent'}
                  strokeWidth={2}
                />
              ))}
            </Bar>
            <Bar dataKey="cargaReal" name="Realizado (min)" fill="#6b7280" fillOpacity={0.5} radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Panel sugerencias */}
      {semSel && sugerencias && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center"
            style={{ borderLeft: '3px solid ' + (FASE_COLORES[semSel.fase] || '#6b7280') }}>
            <div>
              <p className="font-bold text-white">Semana {semSel.num} — {semSel.fase}</p>
              <p className="text-gray-400 text-xs mt-0.5">{semSel.lunes} → {semSel.domingo}</p>
            </div>
            <div className="text-right">
              <p className="text-orange-400 font-bold">{sugerencias.sesiones} sesiones</p>
              <p className="text-gray-500 text-xs">sugeridas</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-gray-300 text-sm mb-4">{sugerencias.descripcion}</p>
            <div className="flex flex-col gap-2">
              {sugerencias.detalle.map((d: any, i: number) => (
                <div key={i} className="bg-gray-800 rounded-lg px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-white text-sm font-medium">{d.disc} — {d.tipo}</p>
                    <p className="text-gray-500 text-xs mt-0.5">Zona: {d.zona}</p>
                  </div>
                  <span className="text-orange-400 text-sm font-medium">{d.duracion}</span>
                </div>
              ))}
            </div>
            {semSel.compSemana && (
              <div className="mt-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-4 py-3">
                <p className="text-yellow-400 font-medium text-sm">🏆 {semSel.compSemana.nombre} esta semana</p>
                <p className="text-yellow-600 text-xs mt-0.5">Reducir volumen y mantener activación pre-competición</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
