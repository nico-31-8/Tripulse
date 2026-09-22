'use client'
// ============================================================
// Qué disciplinas se le programan a un deportista
// ============================================================
// En la ficha del deportista, pestaña Entrenamiento. El entrenador marca y
// desmarca, o pulsa un atajo (Triatlón, HYROX…), y los menús con los que le
// programa sesiones solo ofrecen esas. La lógica —qué se guarda, qué atajo
// coincide, que no se pueda quitar la última— vive en lib/disciplinas.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CATALOGO, PERFILES, disciplinasDe, perfilDe, alternar, guardarPerfil } from '@/lib/disciplinas'

export default function DisciplinasDeportista({ idDeportista, valor, onCambio }: {
  idDeportista: number
  /** `deportista.disciplinas`: null = todas. */
  valor: string[] | null | undefined
  onCambio: (v: string[] | null) => void
}) {
  const [error, setError] = useState('')
  const marcadas = disciplinasDe({ disciplinas: valor })
  const perfil = perfilDe(valor)

  /* Se pinta ya y se guarda detrás. Si la base dice que no, vuelve a como
     estaba y lo dice: un chip marcado que no se ha guardado es mentir. */
  const guardar = async (nuevo: string[] | null) => {
    const antes = valor ?? null
    onCambio(nuevo)
    setError('')
    const { error: e } = await supabase.from('deportista').update({ disciplinas: nuevo }).eq('id', idDeportista)
    if (e) { onCambio(antes); setError('No se ha guardado: ' + e.message) }
  }

  return (
    <div className="tp-card p-5">
      <h3 className="font-semibold mb-1 text-[15px]">Qué disciplinas le programas</h3>
      <p className="text-gray-500 text-xs mb-4 max-w-prose">
        Al crearle sesiones solo te saldrán estas. Lo que ya tiene programado no cambia, y él puede seguir apuntándose cualquier deporte.
      </p>

      <p className="text-[11px] font-semibold text-gray-500 mb-2">Atajos</p>
      <div className="flex gap-2 flex-wrap mb-4">
        {PERFILES.map(p => (
          <button key={p.id} type="button" onClick={() => guardar(guardarPerfil(p))} aria-pressed={perfil === p.id}
            className={'px-3 py-1.5 rounded-full text-xs font-semibold border transition ' + (perfil === p.id
              ? 'border-orange-500 bg-orange-500/15 text-orange-300'
              : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-200')}>
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] font-semibold text-gray-500 mb-2">Disciplinas</p>
      <div className="flex gap-2 flex-wrap">
        {CATALOGO.map(d => {
          const on = marcadas.includes(d.id)
          const ultima = on && marcadas.length === 1
          return (
            <button key={d.id} type="button" onClick={() => guardar(alternar(valor, d.id))}
              aria-pressed={on} disabled={ultima}
              title={ultima ? 'Tiene que quedar al menos una' : on ? 'Pulsa para quitarla' : 'Pulsa para añadirla'}
              className={'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border transition disabled:cursor-not-allowed ' +
                (on ? 'text-white' : 'border-gray-800 bg-gray-900 text-gray-500 hover:text-gray-300 hover:border-gray-600')}
              style={on ? { borderColor: d.color, background: d.color + '22' } : undefined}>
              <span aria-hidden>{d.emoji}</span>
              {d.label}
              <span className={'text-xs ' + (on ? '' : 'invisible')} style={{ color: d.color }} aria-hidden>✓</span>
            </button>
          )
        })}
      </div>

      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
    </div>
  )
}
