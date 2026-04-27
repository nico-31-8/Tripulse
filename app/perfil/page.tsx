'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function PerfilEntrenador() {
  const [perfil, setPerfil] = useState<any>(null)
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(p)
      setCodigo(p?.codigo_entrenador || '')
    }
    cargar()
  }, [])

  const guardarCodigo = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMensaje('')
    const codigoLimpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (codigoLimpio.length < 4) { setMensaje('El codigo debe tener al menos 4 caracteres'); setLoading(false); return }
    const { error } = await supabase.from('perfiles').update({ codigo_entrenador: codigoLimpio }).eq('id', perfil.id)
    if (error) {
      if (error.message.includes('unique')) setMensaje('Este codigo ya esta en uso, elige otro')
      else setMensaje('Error: ' + error.message)
    } else {
      setPerfil({ ...perfil, codigo_entrenador: codigoLimpio })
      setCodigo(codigoLimpio)
      setMensaje('Codigo guardado correctamente')
    }
    setLoading(false)
  }

  const copiar = () => {
    navigator.clipboard.writeText(perfil?.codigo_entrenador || '')
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (!perfil) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-1">Mi perfil</h2>
          <p className="text-gray-400 text-sm">{perfil.email}</p>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <h3 className="text-xl font-bold mb-2">Codigo de entrenador</h3>
          <p className="text-gray-400 text-sm mb-4">Comparte este codigo con tus deportistas para que puedan vincularse contigo al registrarse.</p>

          {perfil.codigo_entrenador ? (
            <div className="mb-4">
              <div className="flex items-center gap-3 bg-gray-800 rounded-xl p-4">
                <span className="text-3xl font-bold text-orange-400 tracking-widest flex-1">{perfil.codigo_entrenador}</span>
                <button onClick={copiar} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition">
                  {copiado ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-2">Tus deportistas introducen este codigo al registrarse</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl p-4 mb-4 text-center">
              <p className="text-gray-400 text-sm">Todavia no tienes codigo. Crea uno abajo.</p>
            </div>
          )}

          <form onSubmit={guardarCodigo} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Ej: NICO2026, TRICLUB, SPORTLAB"
              value={codigo}
              onChange={e => setCodigo(e.target.value.toUpperCase())}
              className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-mono tracking-wider"
              maxLength={12}
              required
            />
            <p className="text-gray-500 text-xs">Solo letras y numeros, entre 4 y 12 caracteres</p>
            {mensaje && <p className={mensaje.includes('correctamente') ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>{mensaje}</p>}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
              {loading ? 'Guardando...' : perfil.codigo_entrenador ? 'Actualizar codigo' : 'Crear codigo'}
            </button>
          </form>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-xl font-bold mb-4">Mis deportistas vinculados</h3>
          <DeportistasVinculados entrenadorId={perfil.id} />
        </div>
      </div>
    </main>
  )
}

function DeportistasVinculados({ entrenadorId }: { entrenadorId: string }) {
  const [deportistas, setDeportistas] = useState<any[]>([])

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from('deportista').select('*').eq('id_entrenador', entrenadorId)
      setDeportistas(data || [])
    }
    cargar()
  }, [entrenadorId])

  if (deportistas.length === 0) return <p className="text-gray-400 text-sm">No tienes deportistas vinculados todavia.</p>

  return (
    <div className="grid gap-3">
      {deportistas.map(d => (
        <div key={d.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3">
          <div>
            <p className="font-medium">{d.nombre}</p>
            <p className="text-gray-400 text-xs">{d.fecha_nacimiento || 'Sin fecha de nacimiento'}</p>
          </div>
          <button onClick={() => window.location.href = '/deportistas/' + d.id} className="text-orange-500 text-sm hover:underline">Ver perfil →</button>
        </div>
      ))}
    </div>
  )
}
