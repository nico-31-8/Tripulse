'use client'
import { useState } from 'react'

const modulos = [
  { icon: '👥', titulo: 'Deportistas', href: '/deportistas' },
  { icon: '📅', titulo: 'Planificacion', href: '/deportistas' },
  { icon: '📊', titulo: 'Sistema ECO', href: '/deportistas' },
  { icon: '💚', titulo: 'Wellness', href: '/deportistas' },
  { icon: '🏋️', titulo: 'Tests', href: '/tests' },
  { icon: '📈', titulo: 'Carga', href: '/deportistas' },
]

export default function Sidebar() {
  const [expandido, setExpandido] = useState(false)

  return (
    <div onMouseEnter={() => setExpandido(true)} onMouseLeave={() => setExpandido(false)} className={`fixed left-0 top-0 h-full bg-gray-900 border-r border-gray-800 z-50 flex flex-col transition-all duration-300 ${expandido ? 'w-48' : 'w-14'}`}>
      <div className="px-3 py-4 border-b border-gray-800">
        <span className="text-orange-500 font-bold text-lg">{expandido ? 'TRIPULSE' : 'T'}</span>
      </div>
      <nav className="flex-1 py-4">
        {modulos.map(m => (
          <button key={m.titulo} onClick={() => window.location.href = m.href} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">{m.icon}</span>
            {expandido && <span className="text-gray-300 text-sm whitespace-nowrap">{m.titulo}</span>}
          </button>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="w-full flex items-center gap-3 hover:bg-gray-800 px-1 py-2 rounded transition">
          <span className="text-xl">🏠</span>
          {expandido && <span className="text-gray-300 text-sm">Dashboard</span>}
        </button>
      </div>
    </div>
  )
}
