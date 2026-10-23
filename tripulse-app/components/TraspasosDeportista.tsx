'use client'
// ============================================================
// Un traspaso que tiene que contestar el deportista, en su panel
// ============================================================
// Cuando su entrenador pide pasarlo a otro (lib/envios, fase 2), el deportista
// tiene que estar de acuerdo: son sus datos. Le sale aquí qué propone y qué
// pasa si acepta, con «Aceptar» o «Seguir con <su entrenador>». Hasta que
// contestan los dos sigue con el de siempre. Si no hay nada, no se pinta.
//
// Dos piezas, como AvisosEnvios: la que pinta (TraspasosDeportistaVista) y la
// que carga y contesta (la de por defecto, la que va en el panel).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { misTraspasosPendientes, contestarTraspasoDeportista, primerNombre, haceCuanto, type TraspasoPendiente } from '@/lib/envios'

export interface PropsVista {
  traspasos: TraspasoPendiente[]
  /** Lo que se acaba de contestar desde aquí, con lo que pasó. */
  contestados: Record<number, { texto: string; bien: boolean }>
  trabajando: number | null
  onResponder: (t: TraspasoPendiente, aceptar: boolean) => void
  className?: string
}

export function TraspasosDeportistaVista({ traspasos, contestados, trabajando, onResponder, className = '' }: PropsVista) {
  if (!traspasos.length) return null
  return (
    <div className={'flex flex-col gap-3 ' + className}>
      {traspasos.map(t => {
        const de = primerNombre(t.de_nombre) || 'Tu entrenador'
        const para = t.para_nombre || 'otro entrenador'
        const hecho = contestados[t.id]
        return (
          <section key={t.id} aria-label="Cambio de entrenador"
            className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] px-4 py-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={'text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border ' + (hecho
                ? (hecho.bien ? 'text-emerald-200 bg-emerald-400/10 border-emerald-400/40' : 'text-gray-300 bg-white/[0.05] border-gray-700')
                : t.ya_acepte ? 'text-emerald-200 bg-emerald-400/10 border-emerald-400/40' : 'text-amber-200 bg-amber-400/10 border-amber-400/40')}>
                {hecho ? (hecho.bien ? 'Hecho' : 'Sin cambios') : t.ya_acepte ? 'Has aceptado' : 'Tienes que contestar'}
              </span>
              <span className="text-[12px] text-gray-500">{haceCuanto(t.creado_en)}</span>
            </div>
            {hecho ? (
              <p role="status" className="text-[15px] text-white font-semibold">{hecho.texto}</p>
            ) : t.ya_acepte ? (
              <p className="text-[15px] text-white font-semibold">Falta que acepte {primerNombre(para) || para}. Mientras, sigues con {de}.</p>
            ) : (
              <>
                <h3 className="text-[16px] text-white font-semibold text-balance">{de} propone que pases a entrenar con {para}</h3>
                {t.mensaje && <p className="text-[13px] text-gray-300 italic">«{t.mensaje}»</p>}
                <ul className="list-disc pl-5 text-[13.5px] text-gray-300 flex flex-col gap-0.5">
                  <li>Tu historial, tus tests y tu plan van contigo.</li>
                  <li>{de} deja de verlos.</li>
                  <li>Sales de los grupos de {de}.</li>
                  <li>{primerNombre(para) || para} no verá tus mensajes con {de}.</li>
                </ul>
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <button type="button" onClick={() => onResponder(t, true)} disabled={!!trabajando}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50 min-h-[44px]">
                    {trabajando === t.id ? 'Un momento…' : 'Aceptar'}
                  </button>
                  <button type="button" onClick={() => onResponder(t, false)} disabled={!!trabajando}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50 min-h-[44px]">
                    Seguir con {de}
                  </button>
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

export default function TraspasosDeportista({ className = '', onCambio }: {
  className?: string
  /** Ya entrena con otro: el panel vuelve a cargar su ficha. */
  onCambio?: () => void
}) {
  const [traspasos, setTraspasos] = useState<TraspasoPendiente[]>([])
  const [contestados, setContestados] = useState<Record<number, { texto: string; bien: boolean }>>({})
  const [trabajando, setTrabajando] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    /* Sin la migración la función no existe: no hay nada que enseñar. */
    misTraspasosPendientes(supabase).then(r => { if (vivo && !r.error) setTraspasos(r.traspasos) })
    return () => { vivo = false }
  }, [])

  const responder = async (t: TraspasoPendiente, aceptar: boolean) => {
    if (trabajando) return
    const de = primerNombre(t.de_nombre) || 'tu entrenador'
    const para = t.para_nombre || 'otro entrenador'
    if (!confirm(aceptar
      ? '¿Pasar a entrenar con ' + para + '?\n\n' + de + ' dejará de ver tus datos, y saldrás de sus grupos.'
      : '¿Seguir con ' + de + '?\n\nLa propuesta se retira: no cambia nada.')) return
    setTrabajando(t.id)
    const r = await contestarTraspasoDeportista(supabase, t.id, aceptar)
    setTrabajando(null)
    // Un fallo al contestar va en ventana, como un fallo al guardar (política de avisos).
    if (r.error) {
      alert('No se ha podido ' + (aceptar ? 'aceptar' : 'contestar') + '.\n\n'
        + (/no tiene sitio/i.test(r.error) ? primerNombre(para) + ' no tiene sitio ahora mismo para más deportistas. Díselo, o espera a que haga sitio.' : r.error))
      return
    }
    const estado = r.resultado?.estado
    setContestados(prev => ({
      ...prev,
      [t.id]: !aceptar ? { texto: 'Sigues con ' + de + '.', bien: false }
        : estado === 'aceptado' ? { texto: 'Ya entrenas con ' + para + '.', bien: true }
          : estado === 'cancelado' ? { texto: 'Ya no se puede: la propuesta se ha retirado.', bien: false }
            : { texto: 'Has aceptado. Falta que acepte ' + (primerNombre(para) || para) + ': mientras, sigues con ' + de + '.', bien: true },
    }))
    if (aceptar && estado === 'aceptado') onCambio?.()
  }

  return <TraspasosDeportistaVista className={className} traspasos={traspasos} contestados={contestados}
    trabajando={trabajando} onResponder={responder} />
}
