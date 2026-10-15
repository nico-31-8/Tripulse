'use client'
// ============================================================
// Quitar un deportista: el modal que pregunta antes
// ============================================================
// Lo abren la lista de Deportistas y la ficha de cada uno. Qué se hace lo
// decide la base según tenga cuenta (lib/quitar-deportista): aquí se dice en
// voz alta antes de pulsar, y para BORRAR hay que escribir su nombre, porque
// eso no se puede deshacer.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { modoDeQuitar, nombreCoincide, quitarDeportista, type ModoQuitar } from '@/lib/quitar-deportista'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'

export default function QuitarDeportista({ deportista, onCerrar, onHecho }: {
  deportista: { id: number; nombre: string; id_usuario?: string | null }
  onCerrar: () => void
  onHecho: (hecho: ModoQuitar) => void
}) {
  const modo = modoDeQuitar(deportista)
  const [escrito, setEscrito] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const puede = modo === 'desvincular' || nombreCoincide(escrito, deportista.nombre)

  // Escape cierra, como en el resto de ventanas.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !trabajando) onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar, trabajando])

  const confirmar = async () => {
    if (!puede || trabajando) return
    setTrabajando(true)
    const r = await quitarDeportista(supabase, deportista.id, modo === 'borrar' ? escrito : null)
    setTrabajando(false)
    // Un fallo al guardar va en ventana (ver la política de avisos).
    if (r.error) { alert('No se ha podido ' + (modo === 'borrar' ? 'borrar' : 'desvincular') + '.\n\n' + r.error); return }
    /* Si era el atleta abierto en el panel, se olvida: si no, el panel y los
       módulos intentarían abrir a alguien que ya no está. */
    if (getAtletaActivo() === deportista.id) setAtletaActivo(null)
    onHecho(r.hecho ?? modo)
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] px-4"
      onClick={() => { if (!trabajando) onCerrar() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="quitar-titulo"
        className="bg-gray-900 rounded-2xl p-6 border border-gray-700 w-full max-w-md"
        onClick={e => e.stopPropagation()}>
        <h3 id="quitar-titulo" className="font-bold text-lg mb-2 text-balance">
          {modo === 'desvincular' ? '¿Desvincular a ' + deportista.nombre + '?' : '¿Borrar a ' + deportista.nombre + ' y todo lo suyo?'}
        </h3>

        {modo === 'desvincular' ? (
          <p className="text-gray-400 text-sm leading-relaxed">
            Deja de ser tu deportista: sale de tu lista y te libera un hueco del cupo. Conserva su cuenta,
            su plan y su historial, y puede volver contigo con un código. Tú dejas de ver sus datos y su
            libreta de cobros.
          </p>
        ) : (
          <>
            <p className="text-gray-400 text-sm leading-relaxed">
              No tiene cuenta propia: esta ficha es tuya y se borra entera, con su plan, sus sesiones, sus
              tests, su wellness, su material y sus cobros. No se puede deshacer.
            </p>
            <label htmlFor="quitar-nombre" className="block text-gray-300 text-[13px] mt-4 mb-1.5">
              Escribe «{deportista.nombre}» para confirmar
            </label>
            <input id="quitar-nombre" type="text" value={escrito} onChange={e => setEscrito(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmar() }}
              autoFocus autoComplete="off" spellCheck={false}
              className="w-full bg-gray-800 text-white px-4 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-red-500 border border-gray-700" />
          </>
        )}

        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onCerrar} disabled={trabajando}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm transition disabled:opacity-40">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={!puede || trabajando}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-40 disabled:hover:bg-red-600">
            {trabajando ? (modo === 'borrar' ? 'Borrando…' : 'Desvinculando…') : (modo === 'borrar' ? 'Borrar' : 'Desvincular')}
          </button>
        </div>
      </div>
    </div>
  )
}
