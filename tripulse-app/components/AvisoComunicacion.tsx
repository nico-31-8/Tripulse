'use client'
// ============================================================
// TRIPULSE — Aviso de «tienes cosas sin revisar» en el panel principal
// ============================================================
// Mensajes de los atletas y comentarios de sesión sin leer, de TODOS sus
// atletas, no solo del que tenga abierto. Lleva a Comunicación, que es donde se
// leen y donde dejan de contar. Si solo hay uno con cosas pendientes, abre
// directamente su conversación.
//
// Sin nada pendiente no se pinta: un aviso que siempre está deja de verse.

import { useRouter } from 'next/navigation'
import { textoPendientes, atletasConPendientes, type Pendientes } from '@/lib/pendientes-comunicacion'

export default function AvisoComunicacion({ pendientes, deportistas, className = '' }: {
  pendientes: Pendientes
  deportistas: { id: number; nombre?: string | null }[]
  className?: string
}) {
  const router = useRouter()
  const texto = textoPendientes(pendientes)
  const atletas = atletasConPendientes(pendientes, deportistas)
  if (!texto || !atletas.length) return null

  const abrir = (id?: number) => router.push('/comunicacion' + (id ? '?dep=' + id : ''))

  return (
    <div role="status"
      className={'w-full rounded-2xl border border-orange-500/25 bg-orange-500/[0.07] px-4 py-3 flex items-center gap-3 text-left ' + className}>
      <span aria-hidden className="w-9 h-9 rounded-xl bg-orange-500/15 grid place-items-center text-lg flex-shrink-0">💬</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug">Tienes {texto} sin revisar</p>
        <p className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
          {atletas.map(a => (
            <button key={a.id} type="button" onClick={() => abrir(a.id)}
              className="hover:text-orange-300 transition underline-offset-2 hover:underline">
              {a.nombre.split(' ')[0]} <span className="tabular-nums text-orange-300/90 font-semibold">{a.total}</span>
            </button>
          ))}
        </p>
      </div>
      <button type="button" onClick={() => abrir(atletas.length === 1 ? atletas[0].id : undefined)}
        className="flex-shrink-0 text-sm font-semibold px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition">
        Revisar →
      </button>
    </div>
  )
}
