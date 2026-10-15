'use client'
// ============================================================
// Los avisos del director, arriba del panel
// ============================================================
// Tres cosas, y solo salen si hay algo (un aviso que siempre está deja de verse):
//
// 1. TE PIDEN PERMISO (solo entrenador): un director que quiere dirigirle, o
//    que le pide abrir a uno de sus deportistas. Se responde aquí mismo.
// 2. LOS CAMBIOS de su director en sus deportistas (al entrenador) o en su
//    plan (al deportista). Se quitan con «Entendido»; lo cambiado se queda
//    marcado en la propia sesión.
// 3. LAS NOVEDADES de la relación: respuestas a un director, alguien que se
//    registra con su invitación, alguien que deja de trabajar con él.
//
// Las frases salen de lib/avisos-director: un solo sitio las escribe.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'
import { textoAviso, esCambio, type AvisoDirector, type Papel } from '@/lib/avisos-director'

type Vinculo = { id_vinculo: number; id_director: string; nombre: string | null; estado: string }
type Peticion = { id_director: string; nombre_director: string | null; id_deportista: number; nombre_deportista: string | null; estado: string; mensaje: string | null }

const pila = (n?: string | null) => (n || '').trim().split(' ')[0] || ''

export default function AvisosDirector({ papel, className = '' }: { papel: Papel; className?: string }) {
  const router = useRouter()
  const [avisos, setAvisos] = useState<AvisoDirector[]>([])
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    /* Si las funciones no existen todavía, o falla la red, aquí no sale nada:
       es un aviso, no puede tumbar el panel. */
    /* Las tres a la vez: las del entrenador no dependen de los avisos. */
    const esEntrenador = papel === 'entrenador'
    const [a, v, p] = await Promise.all([
      supabase.rpc('mis_avisos_director', { _solo_sin_leer: true, _limite: 30 }),
      esEntrenador ? supabase.rpc('entrenador_mis_directores') : Promise.resolve(null),
      esEntrenador ? supabase.rpc('entrenador_accesos') : Promise.resolve(null),
    ])
    setAvisos(a.error ? [] : ((a.data || []) as AvisoDirector[]))
    if (esEntrenador && v && p) {
      setVinculos(v.error ? [] : ((v.data || []) as Vinculo[]).filter(x => x.estado === 'pendiente'))
      setPeticiones(p.error ? [] : ((p.data || []) as Peticion[]).filter(x => x.estado === 'pendiente'))
    }
  }, [papel])

  useEffect(() => { cargar() }, [cargar])

  const hacer = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setOcupado(true); setError('')
    const { error: e } = await fn()
    setOcupado(false)
    if (e) { setError(e.message); return }
    cargar()
  }
  const entendido = (ids: number[]) => hacer(() => supabase.rpc('marcar_avisos_director_leidos', { _ids: ids }))

  const hoy = hoyISO()
  const cambios = avisos.filter(esCambio)
  const novedades = avisos.filter(a => !esCambio(a))
  /* Al deportista, todo junto: para él no hay diferencia entre «cambiaron mi
     sesión» y «mi entrenador abrió mi plan a alguien». */
  const bloques = papel === 'deportista'
    ? [{ clave: 'plan', titulo: 'Novedades de tu plan', lista: avisos }]
    : [
        { clave: 'cambios', titulo: 'Tu director ha cambiado ' + cambios.length + (cambios.length === 1 ? ' cosa' : ' cosas'), lista: cambios },
        { clave: 'novedades', titulo: novedades.length === 1 ? 'Una novedad' : novedades.length + ' novedades', lista: novedades },
      ]

  const hayAlgo = vinculos.length || peticiones.length || avisos.length
  if (!hayAlgo) return null

  return (
    <div className={'w-full flex flex-col gap-3 text-left ' + className}>
      {(vinculos.length > 0 || peticiones.length > 0) && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="w-9 h-9 rounded-xl bg-amber-500/15 grid place-items-center text-lg flex-shrink-0">🔑</span>
            <p className="text-sm font-semibold text-white">Te piden permiso</p>
          </div>
          {vinculos.map(v => (
            <div key={'v' + v.id_vinculo} className="rounded-xl bg-black/25 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-100"><b className="text-white">{v.nombre || 'Un director'}</b> quiere dirigirte.</p>
                <p className="text-xs text-gray-400 mt-0.5">Aceptar no le abre ningún deportista: cada uno se lo abres tú cuando te lo pida.</p>
              </div>
              <div className="flex gap-2">
                <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_responder_vinculo', { _id_vinculo: v.id_vinculo, _aceptar: true }))}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition disabled:opacity-50">Aceptar</button>
                <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_responder_vinculo', { _id_vinculo: v.id_vinculo, _aceptar: false }))}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition disabled:opacity-50">Rechazar</button>
              </div>
            </div>
          ))}
          {peticiones.map(p => (
            <div key={'p' + p.id_director + '-' + p.id_deportista} className="rounded-xl bg-black/25 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-100"><b className="text-white">{p.nombre_director || 'Tu director'}</b> te pide acceso a <b className="text-white">{p.nombre_deportista}</b>.</p>
                {p.mensaje && <p className="text-sm text-gray-200 italic mt-0.5">«{p.mensaje}»</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  Podrá ver y cambiar su plan, sus tests y su salud. No verá vuestro chat ni tus cobros.
                  {pila(p.nombre_deportista) && <> {pila(p.nombre_deportista)} recibirá un aviso.</>}
                </p>
              </div>
              <div className="flex gap-2">
                <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_dar_acceso', { _id_director: p.id_director, _id_deportista: p.id_deportista }))}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition disabled:opacity-50">Darle acceso</button>
                <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_negar_acceso', { _id_director: p.id_director, _id_deportista: p.id_deportista }))}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition disabled:opacity-50">No darlo</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {bloques.filter(b => b.lista.length > 0).map(b => (
        <section key={b.clave} className="rounded-2xl border border-teal-400/30 bg-teal-500/[0.07] px-4 py-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="w-9 h-9 rounded-xl bg-teal-500/15 grid place-items-center text-lg flex-shrink-0">{b.clave === 'novedades' ? '🧭' : '✏️'}</span>
            <p className="text-sm font-semibold text-white flex-1 min-w-0">{b.titulo}</p>
            {b.clave === 'novedades' && papel === 'entrenador' && (
              <button onClick={() => router.push('/entrenadores')}
                className="hidden sm:block text-xs text-teal-200 hover:text-white underline-offset-2 hover:underline transition">Mis entrenadores →</button>
            )}
            <button disabled={ocupado} onClick={() => entendido(b.lista.map(a => a.id))}
              className="flex-shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg bg-teal-400/15 hover:bg-teal-400/25 border border-teal-400/40 text-teal-50 transition disabled:opacity-50">
              Entendido
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {b.lista.slice(0, 5).map(a => {
              const t = textoAviso(a, papel, hoy)
              return (
                <li key={a.id} className="rounded-xl bg-black/25 px-3 py-2.5">
                  <p className="text-sm text-gray-100">{t.titulo}</p>
                  {t.detalle.length > 0 && (
                    <ul className="mt-1 pl-4 list-disc text-xs text-gray-400 space-y-0.5">
                      {t.detalle.map(d => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                  {t.firma && <p className="text-xs text-teal-200 mt-1">{t.firma}</p>}
                </li>
              )
            })}
          </ul>
          {b.lista.length > 5 && (
            <p className="text-xs text-gray-400">Y {b.lista.length - 5} más.</p>
          )}
        </section>
      ))}

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  )
}
