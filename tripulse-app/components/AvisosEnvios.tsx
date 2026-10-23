'use client'
// ============================================================
// Envíos de otros entrenadores, en tu panel
// ============================================================
// Lo que te han mandado (una plantilla, un test, unas zonas), para aceptarlo o
// rechazarlo sin salir del panel, y la respuesta a lo que mandaste tú, hasta
// que pulsas «Entendido». Todo junto y con el detalle, en /envios. Si no hay
// nada, no se pinta. Ver lib/envios.
//
// Dos piezas: la que pinta (AvisosEnviosVista, con los datos que le den) y la
// que los carga y contesta (la de por defecto, la que va en el panel).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import {
  COLUMNAS_ENVIO, contestar, marcarRespuestasVistas, etiquetaTipo, haceCuanto, dondeQueda, primerNombre, faltaLaTabla,
  type Envio,
} from '@/lib/envios'

export interface PropsVista {
  recibidos: Envio[]
  respuestas: Envio[]
  /** Lo que se acaba de contestar desde aquí, con lo que pasó. */
  contestados: Record<number, string>
  trabajando: number | null
  onResponder: (e: Envio, aceptar: boolean) => void
  onEntendido: () => void
  onVer: (id: number | null) => void
  className?: string
}

export function AvisosEnviosVista({ recibidos, respuestas, contestados, trabajando, onResponder, onEntendido, onVer, className = '' }: PropsVista) {
  const pendientes = recibidos.filter(e => !contestados[e.id]).length
  if (!recibidos.length && !respuestas.length) return null

  return (
    <section aria-label="Envíos de otros entrenadores" className={'w-full text-left rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] px-4 py-3 flex flex-col gap-2.5 ' + className}>
      <div className="flex items-center gap-3 flex-wrap">
        <span aria-hidden className="w-9 h-9 rounded-xl bg-sky-500/15 grid place-items-center text-lg flex-shrink-0">📨</span>
        <h3 className="text-sm font-semibold text-white flex-1">{recibidos.length ? 'Te han enviado' : 'Te han contestado'}</h3>
        {recibidos.length > 0 && (
          <span className={'text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border ' + (pendientes
            ? 'text-amber-200 bg-amber-400/10 border-amber-400/40'
            : 'text-emerald-200 bg-emerald-400/10 border-emerald-400/40')}>
            {pendientes ? pendientes + ' por revisar' : 'Todo revisado'}
          </span>
        )}
      </div>

      {recibidos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {recibidos.map(e => (
            <li key={e.id} className={'rounded-xl bg-black/25 border px-3 py-2.5 flex flex-col gap-1.5 ' + (contestados[e.id] ? 'border-transparent' : 'border-sky-400/25')}>
              <p className="flex items-center gap-2 flex-wrap text-[12.5px] text-gray-400">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-white/[0.07] text-gray-200">{etiquetaTipo(e)}</span>
                {e.de_nombre || 'Otro entrenador'} · {haceCuanto(e.creado_en)}
              </p>
              <p className="text-[14px] text-white">{e.titulo}</p>
              {e.mensaje && <p className="text-[12.5px] text-gray-400 italic">«{e.mensaje}»</p>}
              {contestados[e.id] ? (
                <p role="status" className="text-[12.5px] text-emerald-300">{contestados[e.id]}</p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => onResponder(e, true)} disabled={!!trabajando}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[13px] px-3.5 py-1.5 rounded-lg transition disabled:opacity-50">
                    {trabajando === e.id ? 'Un momento…' : 'Aceptar'}
                  </button>
                  <button type="button" onClick={() => onResponder(e, false)} disabled={!!trabajando}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-[13px] px-3.5 py-1.5 rounded-lg transition disabled:opacity-50">
                    Rechazar
                  </button>
                  <button type="button" onClick={() => onVer(e.id)}
                    className="text-gray-400 hover:text-white text-[12.5px] underline decoration-dotted underline-offset-4 px-1 transition">
                    Ver qué es
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {respuestas.length > 0 && (
        <div className={'flex flex-col gap-1.5 ' + (recibidos.length ? 'pt-2 border-t border-white/[0.08]' : '')}>
          {respuestas.map(e => (
            <p key={e.id} className="text-[13px] text-gray-300">
              <span className={e.estado === 'aceptado' ? 'text-emerald-300' : 'text-red-300'}>{e.estado === 'aceptado' ? '✓' : '✕'}</span>{' '}
              {primerNombre(e.para_nombre) || 'El otro entrenador'} ha {e.estado === 'aceptado' ? 'aceptado' : 'rechazado'} «{e.titulo}».
            </p>
          ))}
          <button type="button" onClick={onEntendido}
            className="self-start text-gray-400 hover:text-white text-[12.5px] border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1 transition">
            Entendido
          </button>
        </div>
      )}

      <button type="button" onClick={() => onVer(null)}
        className="self-start text-gray-400 hover:text-white text-[12.5px] underline decoration-dotted underline-offset-4 transition">
        Ver todo en Envíos →
      </button>
    </section>
  )
}

export default function AvisosEnvios({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [recibidos, setRecibidos] = useState<Envio[]>([])
  const [respuestas, setRespuestas] = useState<Envio[]>([])
  /* Lo que se acaba de contestar desde aquí: se queda a la vista con lo que
     pasó, en vez de desaparecer sin más. */
  const [contestados, setContestados] = useState<Record<number, string>>({})
  const [trabajando, setTrabajando] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const user = await usuarioActual()
      if (!vivo || !user) return
      const [rec, res] = await Promise.all([
        supabase.from('envio_entrenador').select(COLUMNAS_ENVIO)
          .eq('para', user.id).eq('estado', 'pendiente').order('creado_en', { ascending: false }).limit(10),
        supabase.from('envio_entrenador').select(COLUMNAS_ENVIO)
          .eq('de', user.id).in('estado', ['aceptado', 'rechazado']).is('respuesta_vista_en', null)
          .order('contestado_en', { ascending: false }).limit(10),
      ])
      /* Sin la tabla (la migración sin aplicar) no hay nada que enseñar. */
      if (!vivo || faltaLaTabla(rec.error) || faltaLaTabla(res.error)) return
      setRecibidos((rec.data || []) as Envio[])
      setRespuestas((res.data || []) as Envio[])
    })()
    return () => { vivo = false }
  }, [])

  const responder = async (e: Envio, aceptar: boolean) => {
    if (trabajando) return
    if (!aceptar && !confirm('¿Rechazar «' + e.titulo + '»?\n\nNo se crea nada, y ' + (primerNombre(e.de_nombre) || 'quien te lo mandó') + ' verá que lo has rechazado.')) return
    setTrabajando(e.id)
    const r = await contestar(supabase, e.id, aceptar)
    setTrabajando(null)
    // Un fallo al aceptar va en ventana, como un fallo al guardar (política de avisos).
    if (r.error) { alert('No se ha podido ' + (aceptar ? 'aceptar' : 'rechazar') + '.\n\n' + r.error); return }
    setContestados(prev => ({
      ...prev,
      [e.id]: aceptar
        ? 'Aceptado. ' + dondeQueda(e) + ((r.resultado?.reusados?.length ?? 0) > 0 ? ' El test ya lo tenías: no se ha duplicado.' : '')
        : 'Rechazado: no se ha creado nada.',
    }))
  }

  const entendido = async () => {
    const ids = respuestas.map(r => r.id)
    setRespuestas([])
    await marcarRespuestasVistas(supabase, ids)
  }

  return (
    <AvisosEnviosVista className={className} recibidos={recibidos} respuestas={respuestas} contestados={contestados}
      trabajando={trabajando} onResponder={responder} onEntendido={entendido}
      onVer={id => router.push(id ? '/envios?id=' + id : '/envios')} />
  )
}
