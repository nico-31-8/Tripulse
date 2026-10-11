'use client'
// ============================================================
// Deportistas → Directores (lo ve el ENTRENADOR)
// ============================================================
// Con quién trabaja como director y qué deportista tiene abierto. Plegable, como
// Evaluados, y solo sale si hay un director o una solicitud. Aquí se abre, se
// cierra y se corta: el que manda sobre cada deportista es su entrenador.
//
// Un entrenador tiene UN SOLO director (lo garantiza la base), así que aquí hay
// como mucho una relación: la activa o la solicitud pendiente.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Vinculo = { id_vinculo: number; id_director: string; nombre: string | null; estado: string; con_marca: boolean }
type Acceso = { id_director: string; id_deportista: number; estado: string; mensaje: string | null }

export default function SeccionDirectores({ deportistas }: { deportistas: { id: number; nombre: string }[] }) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [abierto, setAbierto] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [v, a] = await Promise.all([
      supabase.rpc('entrenador_mis_directores'),
      supabase.rpc('entrenador_accesos'),
    ])
    /* Si las funciones no están (o falla la red), la sección no sale: es una
       herramienta más, no puede tumbar la lista de deportistas. */
    setVinculos(v.error ? [] : (v.data || []) as Vinculo[])
    setAccesos(a.error ? [] : (a.data || []) as Acceso[])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const hacer = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setOcupado(true); setError('')
    const { error: e } = await fn()
    setOcupado(false)
    if (e) { setError(e.message); return }
    cargar()
  }

  if (!vinculos.length) return null
  const activo = vinculos.find(v => v.estado === 'activo')
  const pendiente = vinculos.find(v => v.estado === 'pendiente')
  const estadoDe = (idDep: number) => activo ? accesos.find(a => a.id_director === activo.id_director && a.id_deportista === idDep) : undefined

  const terminar = (v: Vinculo) => {
    if (!confirm('¿Dejar de trabajar con ' + (v.nombre || 'tu director') + '?\n\nDejará de ver a todos tus deportistas en el acto. Los que tenía abiertos recibirán un aviso. Lo que ya cambió se queda como está.')) return
    hacer(() => supabase.rpc('director_terminar', { _id_vinculo: v.id_vinculo }))
  }

  return (
    <section className="mt-10">
      <button onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        className="text-gray-500 hover:text-gray-300 text-[12.5px] transition">
        {abierto ? '▴ Directores' : '▾ Directores'}
        <span className="text-gray-600"> · {activo ? (activo.nombre || 'tu director') : 'solicitud pendiente'}</span>
      </button>
      {abierto && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-gray-500 text-xs">Solo tú abres y cierras cada deportista. Tu director nunca ve vuestro chat ni tus cobros, y cada cambio que haga te llega como aviso.</p>

          {pendiente && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm"><b>{pendiente.nombre || 'Un director'}</b> quiere dirigirte.</p>
                <p className="text-xs text-gray-400">Aceptar no le abre ningún deportista: cada uno se lo abres tú.</p>
              </div>
              <div className="flex gap-2">
                <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_responder_vinculo', { _id_vinculo: pendiente.id_vinculo, _aceptar: true }))}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 transition disabled:opacity-50">Aceptar</button>
                <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_responder_vinculo', { _id_vinculo: pendiente.id_vinculo, _aceptar: false }))}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition disabled:opacity-50">Rechazar</button>
              </div>
            </div>
          )}

          {activo && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-800">
                <p className="text-sm">Tu director: <b>{activo.nombre || '—'}</b>{!activo.con_marca && <span className="text-xs text-gray-500"> · en pausa (ya no es director)</span>}</p>
                <button disabled={ocupado} onClick={() => terminar(activo)}
                  className="text-[11.5px] text-red-300/80 hover:text-red-200 underline underline-offset-2 transition">Dejar de trabajar juntos</button>
              </div>
              {deportistas.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">No tienes deportistas todavía.</p>
              ) : (
                <ul className="divide-y divide-gray-800">
                  {deportistas.map(d => {
                    const a = estadoDe(d.id)
                    return (
                      <li key={d.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{d.nombre}</span>
                        <span className="flex items-center gap-2 text-xs">
                          {a?.estado === 'concedido' ? (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 font-semibold">Con acceso</span>
                              <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_quitar_acceso', { _id_director: activo.id_director, _id_deportista: d.id }))}
                                className="text-gray-400 hover:text-white underline underline-offset-2">Quitar</button>
                            </>
                          ) : a?.estado === 'pendiente' ? (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 font-semibold" title={a.mensaje || undefined}>Te lo ha pedido</span>
                              <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_dar_acceso', { _id_director: activo.id_director, _id_deportista: d.id }))}
                                className="text-orange-300 hover:text-orange-200 underline underline-offset-2">Dar</button>
                              <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_negar_acceso', { _id_director: activo.id_director, _id_deportista: d.id }))}
                                className="text-gray-400 hover:text-white underline underline-offset-2">No</button>
                            </>
                          ) : (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400 font-semibold">🔒 Sin acceso</span>
                              <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_dar_acceso', { _id_director: activo.id_director, _id_deportista: d.id }))}
                                className="text-orange-300 hover:text-orange-200 underline underline-offset-2">Dar acceso</button>
                            </>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}
    </section>
  )
}
