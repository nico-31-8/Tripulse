'use client'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

const MODELOS: Record<string, {
  descripcion: string
  ideal: string
  curva: { semana: number, volumen: number, intensidad: number }[]
}> = {
  'Tradicional': {
    descripcion: 'Volumen alto al principio que va bajando, intensidad que sube progresivamente hacia la competición.',
    ideal: 'Deportistas con poca base aeróbica o temporadas largas (+20 semanas)',
    curva: [
      { semana: 1, volumen: 95, intensidad: 20 },
      { semana: 2, volumen: 90, intensidad: 25 },
      { semana: 3, volumen: 85, intensidad: 30 },
      { semana: 4, volumen: 80, intensidad: 35 },
      { semana: 5, volumen: 75, intensidad: 42 },
      { semana: 6, volumen: 70, intensidad: 50 },
      { semana: 7, volumen: 62, intensidad: 58 },
      { semana: 8, volumen: 55, intensidad: 65 },
      { semana: 9, volumen: 48, intensidad: 72 },
      { semana: 10, volumen: 40, intensidad: 80 },
      { semana: 11, volumen: 30, intensidad: 88 },
      { semana: 12, volumen: 20, intensidad: 60 },
    ]
  },
  'Inversa': {
    descripcion: 'Empieza con alta intensidad y bajo volumen, el volumen aumenta progresivamente mientras la intensidad baja.',
    ideal: 'Deportistas con buena base aeróbica o temporadas cortas (-16 semanas)',
    curva: [
      { semana: 1, volumen: 20, intensidad: 90 },
      { semana: 2, volumen: 25, intensidad: 85 },
      { semana: 3, volumen: 32, intensidad: 78 },
      { semana: 4, volumen: 40, intensidad: 70 },
      { semana: 5, volumen: 50, intensidad: 62 },
      { semana: 6, volumen: 60, intensidad: 55 },
      { semana: 7, volumen: 70, intensidad: 48 },
      { semana: 8, volumen: 80, intensidad: 42 },
      { semana: 9, volumen: 88, intensidad: 38 },
      { semana: 10, volumen: 92, intensidad: 35 },
      { semana: 11, volumen: 85, intensidad: 40 },
      { semana: 12, volumen: 20, intensidad: 25 },
    ]
  },
  'ATR': {
    descripcion: 'Bloques cortos de Acumulación, Transmutación y Realización encadenados. Curva en olas progresivas.',
    ideal: 'Deportistas con experiencia y temporadas con varias competiciones',
    curva: [
      // Ciclo 1
      { semana: 1, volumen: 70, intensidad: 30 },
      { semana: 2, volumen: 80, intensidad: 35 },
      { semana: 3, volumen: 85, intensidad: 40 },
      { semana: 4, volumen: 65, intensidad: 60 },
      { semana: 5, volumen: 55, intensidad: 70 },
      { semana: 6, volumen: 40, intensidad: 85 },
      // Ciclo 2
      { semana: 7, volumen: 75, intensidad: 35 },
      { semana: 8, volumen: 85, intensidad: 42 },
      { semana: 9, volumen: 90, intensidad: 48 },
      { semana: 10, volumen: 68, intensidad: 68 },
      { semana: 11, volumen: 55, intensidad: 80 },
      { semana: 12, volumen: 35, intensidad: 90 },
      // Taper
      { semana: 13, volumen: 20, intensidad: 50 },
    ]
  },
  'Ondulatoria': {
    descripcion: 'La carga oscila cada semana con patrón 3:1 (tres semanas de carga progresiva, una de recuperación). El techo de cada ola sube gradualmente.',
    ideal: 'Deportistas que compiten frecuentemente o no toleran cargas mantenidas',
    curva: [
      { semana: 1, volumen: 60, intensidad: 50 },
      { semana: 2, volumen: 70, intensidad: 55 },
      { semana: 3, volumen: 75, intensidad: 60 },
      { semana: 4, volumen: 35, intensidad: 30 },
      { semana: 5, volumen: 65, intensidad: 55 },
      { semana: 6, volumen: 75, intensidad: 62 },
      { semana: 7, volumen: 82, intensidad: 68 },
      { semana: 8, volumen: 38, intensidad: 32 },
      { semana: 9, volumen: 70, intensidad: 62 },
      { semana: 10, volumen: 80, intensidad: 70 },
      { semana: 11, volumen: 88, intensidad: 76 },
      { semana: 12, volumen: 20, intensidad: 25 },
    ]
  }
}

interface Props {
  modelo: string
  semanas?: number
  mostrarInfo?: boolean
}

export default function GraficaPeriodizacion({ modelo, semanas, mostrarInfo = true }: Props) {
  const data = MODELOS[modelo]
  if (!data) return null

  const COLORES_MODELO: Record<string, string> = {
    'Tradicional': '#f97316',
    'Inversa': '#60a5fa',
    'ATR': '#4ade80',
    'Ondulatoria': '#a78bfa',
  }
  const color = COLORES_MODELO[modelo] || '#f97316'

  return (
    <div className="flex flex-col gap-3">
      {mostrarInfo && (
        <div className="bg-gray-800 rounded-xl p-4 border-l-2" style={{ borderColor: color }}>
          <p className="text-white text-sm font-medium mb-1">{modelo}</p>
          <p className="text-gray-400 text-xs mb-2">{data.descripcion}</p>
          <p className="text-gray-500 text-xs">✓ Ideal para: {data.ideal}</p>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl p-3">
        <div className="flex gap-4 mb-2 text-xs">
          <span className="flex items-center gap-1 text-gray-400">
            <span className="w-3 h-0.5 inline-block rounded" style={{ background: color }}></span> Volumen
          </span>
          <span className="flex items-center gap-1 text-gray-400">
            <span className="w-3 h-0.5 inline-block rounded bg-red-400"></span> Intensidad
          </span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data.curva} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
            <XAxis dataKey="semana" stroke="#4b5563" tick={{ fontSize: 9 }} tickLine={false} label={{ value: 'semanas', position: 'insideBottomRight', offset: -5, fontSize: 9, fill: '#6b7280' }} />
            <YAxis domain={[0, 100]} stroke="#4b5563" tick={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 11 }}
              formatter={(val: any, name: string) => [val + '%', name === 'volumen' ? 'Volumen' : 'Intensidad']}
              labelFormatter={(l) => 'Semana ' + l}
            />
            <Area type="monotone" dataKey="volumen" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} name="volumen" />
            <Area type="monotone" dataKey="intensidad" stroke="#f87171" fill="#f87171" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 4" name="intensidad" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
