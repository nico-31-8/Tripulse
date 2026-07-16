'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'

// Mini-maquetas SVG representativas de cada vista (sin assets externos).
function PreviewBloques() {
  const bars = [
    { x: 14, w: 26, h: 40, c: '#f97316' },
    { x: 46, w: 34, h: 62, c: '#eab308' },
    { x: 86, w: 30, h: 80, c: '#ef4444' },
    { x: 122, w: 22, h: 34, c: '#22c55e' },
    { x: 150, w: 34, h: 54, c: '#f97316' },
  ]
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full">
      <line x1="10" y1="100" x2="190" y2="100" stroke="#2f394a" strokeWidth="1.5" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={100 - b.h} width={b.w} height={b.h} rx="5" fill={b.c} opacity="0.9" />
      ))}
    </svg>
  )
}
function PreviewCalendario() {
  const fill: Record<string, string> = { '3': '#3b82f6', '5': '#22c55e', '6': '#f97316', '12': '#3b82f6', '15': '#eab308', '18': '#ef4444', '19': '#22c55e', '24': '#f97316', '26': '#3b82f6' }
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full">
      {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
        <text key={d} x={16 + i * 26} y="16" fontSize="8" fill="#5b6472" textAnchor="middle">{d}</text>
      ))}
      {Array.from({ length: 28 }, (_, i) => {
        const col = i % 7, row = Math.floor(i / 7)
        const c = fill[String(i)]
        return (
          <g key={i}>
            <rect x={4 + col * 26} y={24 + row * 22} width="22" height="18" rx="4" fill={c ? c + '33' : '#12151d'} stroke={c || '#242b38'} strokeWidth="1" />
            {c && <circle cx={15 + col * 26} cy={33 + row * 22} r="2.5" fill={c} />}
          </g>
        )
      })}
    </svg>
  )
}
function PreviewCanvas() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full">
      <defs>
        <linearGradient id="pcfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => <line key={i} x1="10" y1={25 + i * 22} x2="190" y2={25 + i * 22} stroke="#1c2431" strokeWidth="1" />)}
      <path d="M10,80 L45,60 L80,72 L115,34 L150,50 L190,28 L190,100 L10,100 Z" fill="url(#pcfill)" />
      <polyline points="10,80 45,60 80,72 115,34 150,50 190,28" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {[[45, 60], [115, 34], [190, 28]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#0a0b0f" stroke="#a855f7" strokeWidth="2" />
      ))}
    </svg>
  )
}

const VISTAS = [
  {
    key: 'bloques', titulo: 'Bloques', href: (id: string) => '/planificacion-visual/' + id + '/bloques',
    color: '#f97316', Preview: PreviewBloques, video: '/planificacion/bloques.mp4',
    desc: 'La estructura clásica de la temporada.',
    features: ['Macrociclo → meso → semana → sesión', 'Crear y editar cada bloque', 'Ver la carga real superpuesta'],
  },
  {
    key: 'calendario', titulo: 'Calendario', href: (id: string) => '/planificacion-visual/' + id + '/calendario',
    color: '#3b82f6', Preview: PreviewCalendario, video: '/planificacion/calendario.mp4',
    desc: 'Todas las sesiones en un calendario.',
    features: ['Vista mensual de un vistazo', 'Sesiones por día y disciplina', 'Salta a cualquier semana'],
  },
  {
    key: 'canvas', titulo: 'Periodización', href: (id: string) => '/planificacion-visual/' + id + '/dibujo',
    color: '#a855f7', Preview: PreviewCanvas, video: '/planificacion/canvas.mp4',
    desc: 'El lienzo para dibujar la carga.',
    features: ['Dibuja la curva de carga a mano', 'Periodiza por fases visuales', 'Coloca chips de zonas y semanas'],
  },
]

// Tarjeta de vista: SVG en reposo, el vídeo (si existe) se reproduce al pasar el ratón.
function VistaCard({ v, index, onGo }: { v: typeof VISTAS[number]; index: number; onGo: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoOk, setVideoOk] = useState(true)
  const P = v.Preview
  return (
    <button onClick={onGo}
      className="fade-up group relative text-left rounded-3xl border border-gray-800 bg-gray-900/50 overflow-hidden transform-gpu transition-all duration-300 ease-out hover:-translate-y-2 hover:scale-[1.06] hover:z-10 hover:border-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
      style={{ animationDelay: (160 + index * 80) + 'ms' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 24px 60px -20px ' + v.color + '55'; if (videoOk) videoRef.current?.play().catch(() => {}) }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 0 0 transparent'; const vid = videoRef.current; if (vid) { vid.pause(); vid.currentTime = 0 } }}>
      {/* Preview */}
      <div className="relative h-80 overflow-hidden" style={{ background: 'radial-gradient(120% 100% at 50% 0%, ' + v.color + '18, transparent 70%)' }}>
        {/* SVG en reposo (se desvanece al hacer hover si hay vídeo) */}
        <div className={'absolute inset-0 flex items-center justify-center p-6 transition-opacity duration-300 ' + (videoOk ? 'group-hover:opacity-0' : '')}>
          <div className="w-full h-full transition-transform duration-500 ease-out group-hover:scale-105"><P /></div>
        </div>
        {/* Vídeo encima, visible solo al pasar el ratón */}
        {videoOk && (
          <video ref={videoRef} src={v.video} muted loop playsInline preload="auto"
            onError={() => setVideoOk(false)}
            className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}
      </div>

      <div className="p-5 border-t border-gray-800/80">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
          <h3 className="text-lg font-bold tracking-tight">{v.titulo}</h3>
          <span className="ml-auto text-gray-600 group-hover:text-white group-hover:translate-x-0.5 transition-all">→</span>
        </div>
        <p className="text-gray-400 text-sm">{v.desc}</p>
        {/* Detalle que se revela al pasar el ratón */}
        <div className="max-h-0 opacity-0 group-hover:max-h-40 group-hover:opacity-100 transition-all duration-300 ease-out overflow-hidden">
          <ul className="mt-3 pt-3 border-t border-gray-800/70 flex flex-col gap-1.5">
            {v.features.map((f, j) => (
              <li key={j} className="flex items-start gap-2 text-[12.5px] text-gray-400">
                <span className="mt-[3px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: v.color }} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  )
}

export default function PlanificacionVistas({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()
  const [deportista, setDeportista] = useState<any>(null)

  useEffect(() => {
    supabase.from('deportista').select('nombre').eq('id', id).single().then(({ data }) => setDeportista(data))
  }, [id])

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center gap-4 border-b border-gray-800">
        <button onClick={() => router.push('/deportistas/' + id)} className="text-gray-400 hover:text-white text-sm transition">← Perfil</button>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="text-center mb-12">
          <p className="fade-up text-sm font-medium text-orange-400/90 mb-2">Planificación{deportista ? ' · ' + deportista.nombre : ''}</p>
          <h1 className="fade-up text-3xl sm:text-[34px] font-bold tracking-tight mb-2" style={{ animationDelay: '60ms' }}>¿Cómo quieres trabajar la temporada?</h1>
          <p className="fade-up text-gray-500 text-sm" style={{ animationDelay: '110ms' }}>Tres formas de ver y construir la misma planificación.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {VISTAS.map((v, i) => (
            <VistaCard key={v.key} v={v} index={i} onGo={() => router.push(v.href(id))} />
          ))}
        </div>
      </div>
    </main>
  )
}
