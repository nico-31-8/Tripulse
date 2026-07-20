'use client'
// Banner de invitaciones a un club, para el dashboard (entrenador y deportista).
//
// Vive FUERA del módulo Comunidad a propósito: puedes aceptar entrar a un club
// sin haberte hecho "social" antes. Usa RPCs security-definer que casan por email
// (mis_invitaciones / responder_invitacion) — no exponen la tabla de perfiles ni
// requieren social=activo. Si no hay invitaciones pendientes, no pinta nada.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Inv { id: string; id_club: string; nombre_club: string; rol_club: string }
const ROL: Record<string, string> = { admin: 'administrador/a', entrenador: 'entrenador/a', deportista: 'deportista' }

export default function InvitacionesClub() {
  const [invs, setInvs] = useState<Inv[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('mis_invitaciones').then(({ data }) => setInvs((data as Inv[]) || []))
  }, [])

  const responder = async (inv: Inv, aceptar: boolean) => {
    setBusy(inv.id)
    const { error } = await supabase.rpc('responder_invitacion', { _id_invitacion: inv.id, _aceptar: aceptar })
    setBusy(null)
    if (error) { setMsg('No se ha podido procesar la invitación. ' + error.message); return }
    setInvs(prev => prev.filter(i => i.id !== inv.id))
    setMsg(aceptar ? '✓ Ya formas parte de ' + inv.nombre_club : 'Invitación a ' + inv.nombre_club + ' rechazada')
  }

  if (invs.length === 0 && !msg) return null

  return (
    <div className="mb-5 rounded-2xl border border-indigo-500/40 bg-indigo-500/[0.07] p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg flex-shrink-0">✉️</span>
        <div className="min-w-0">
          <p className="font-semibold text-indigo-200 text-sm leading-tight">
            {invs.length > 0 ? (invs.length === 1 ? 'Te han invitado a un club' : 'Tienes ' + invs.length + ' invitaciones a clubes') : 'Invitaciones a clubes'}
          </p>
          <p className="text-indigo-300/60 text-xs">Únete para aparecer en su equipo. Tus datos de entrenamiento siguen siendo privados.</p>
        </div>
      </div>

      {invs.length > 0 && (
        <div className="flex flex-col gap-2">
          {invs.map(inv => (
            <div key={inv.id} className="flex items-center gap-3 rounded-xl bg-gray-900/60 border border-gray-800 px-3.5 py-2.5">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center text-base flex-shrink-0">🛡️</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm truncate">{inv.nombre_club}</p>
                <p className="text-gray-500 text-xs">Como {ROL[inv.rol_club] || inv.rol_club}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => responder(inv, false)} disabled={busy === inv.id}
                  className="text-gray-400 hover:text-red-400 text-xs px-2.5 py-1.5 rounded-lg transition disabled:opacity-40">Rechazar</button>
                <button onClick={() => responder(inv, true)} disabled={busy === inv.id}
                  className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                  {busy === inv.id ? '…' : 'Unirme'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && <p className="text-indigo-300/80 text-xs mt-2.5">{msg}</p>}
    </div>
  )
}
