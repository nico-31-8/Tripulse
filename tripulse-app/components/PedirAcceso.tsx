'use client'
// ============================================================
// La ventana de «Pedir acceso» a un deportista con candado
// ============================================================
// La usan la entrada del dashboard y Deportistas cuando un director está en el
// espacio de otro entrenador. La petición le llega al entrenador arriba de su
// panel (components/AvisosDirector), con el mensaje si lo hay.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function PedirAcceso({ idDeportista, nombre, nombreEntrenador, onCerrar, onHecho }: {
  idDeportista: number
  nombre: string
  nombreEntrenador: string
  onCerrar: () => void
  onHecho: () => void
}) {
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const pila = (nombreEntrenador || '').split(' ')[0] || 'su entrenador'

  const pedir = async () => {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('director_pedir_acceso', { _id_deportista: idDeportista, _mensaje: mensaje })
    setOcupado(false)
    if (e) { setError(e.message); return }
    onHecho()
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4 text-left" onClick={onCerrar}>
      <form className="bg-gray-900 rounded-2xl p-6 border border-gray-700 w-full max-w-md flex flex-col gap-3"
        onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); pedir() }}>
        <h3 className="font-bold text-lg">Pedir acceso a {nombre}</h3>
        <p className="text-sm text-gray-400">Le llega a {pila}, arriba de su panel. Hasta que diga que sí, de {nombre.split(' ')[0]} solo ves el nombre.</p>
        <label htmlFor="msg-acceso" className="text-xs text-gray-400">Mensaje para {pila} (opcional)</label>
        <textarea id="msg-acceso" rows={3} maxLength={300} value={mensaje} onChange={e => setMensaje(e.target.value)}
          placeholder="Quiero revisar su bloque de umbral antes de la competición."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-y" />
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCerrar} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition">Cancelar</button>
          <button type="submit" disabled={ocupado} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-sm font-semibold transition disabled:opacity-50">Pedir acceso</button>
        </div>
      </form>
    </div>
  )
}
