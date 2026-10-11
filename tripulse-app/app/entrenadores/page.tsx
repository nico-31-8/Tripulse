'use client'
// ============================================================
// Mis entrenadores · la página del DIRECTOR
// ============================================================
// La única pantalla nueva de la figura de director. Desde aquí:
//   · ve con quién trabaja y cuántos deportistas le han abierto,
//   · entra en el espacio de un entrenador (la app pasa a ser la suya),
//   · invita a un entrenador nuevo o busca a uno que ya usa TRIPULSE,
//   · lee las respuestas de sus entrenadores.
//
// Todo pasa por funciones de la base (director_* en
// supabase/director-1-base.sql): las tablas no se leen directamente.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { hoyISO } from '@/lib/fechas'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { setEspacio } from '@/lib/espacio'
import { setAtletaActivo } from '@/lib/atletaActivo'
import { textoAviso, type AvisoDirector } from '@/lib/avisos-director'
import { fondoDe, inicialDe } from '@/lib/avatar'

type Relacion = {
  id_vinculo: number; id_entrenador: string; nombre: string | null; estado: string; origen: string
  n_deportistas: number | null; n_con_acceso: number | null; n_pedidos: number | null
}
type Invitacion = { codigo: string; nombre: string | null; email: string | null; caduca: string | null }
type Encontrado = { id: string; nombre: string | null; estado: 'libre' | 'contigo' | 'pendiente' | 'ocupado' }

export default function MisEntrenadores() {
  useRequireEntrenador()
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [esDirector, setEsDirector] = useState(false)
  const [relaciones, setRelaciones] = useState<Relacion[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [novedades, setNovedades] = useState<AvisoDirector[]>([])
  const [nuevas, setNuevas] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  // Añadir entrenador
  const [modal, setModal] = useState<null | 'nuevo' | 'buscar'>(null)
  const [fNombre, setFNombre] = useState('')
  const [fCorreo, setFCorreo] = useState('')
  const [codigoCreado, setCodigoCreado] = useState<string | null>(null)
  const [encontrado, setEncontrado] = useState<Encontrado | null | 'nadie'>(null)
  const [errorModal, setErrorModal] = useState('')

  const cargar = useCallback(async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    const { data: soy } = await supabase.rpc('soy_director')
    setEsDirector(!!soy)
    if (!soy) { setCargando(false); return }
    const [r, i, n] = await Promise.all([
      supabase.rpc('director_mis_entrenadores'),
      supabase.rpc('director_mis_invitaciones'),
      supabase.rpc('mis_avisos_director', { _solo_sin_leer: false, _limite: 30 }),
    ])
    const fallos = [r.error, i.error, n.error].filter(Boolean).map(e => e!.message)
    setError(fallos.join(' · '))
    setRelaciones((r.data || []) as Relacion[])
    setInvitaciones((i.data || []) as Invitacion[])
    const lista = ((n.data || []) as AvisoDirector[])
    setNovedades(lista)
    /* Las que no había leído se marcan al verlas aquí, que es donde viven. Se
       quedan resaltadas mientras siga en la página. */
    const sinLeer = lista.filter(a => !a.leido_en).map(a => a.id)
    if (sinLeer.length) {
      setNuevas(new Set(sinLeer))
      supabase.rpc('marcar_avisos_director_leidos', { _ids: sinLeer }).then(() => {})
    }
    setCargando(false)
  }, [router])

  useEffect(() => { cargar() }, [cargar])

  const hacer = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setOcupado(true); setError('')
    const { error: e } = await fn()
    setOcupado(false)
    if (e) { setError(e.message); return false }
    await cargar()
    return true
  }

  const entrar = (r: Relacion) => {
    setAtletaActivo(null)
    setEspacio({ id: r.id_entrenador, nombre: r.nombre || '' })
    router.push('/dashboard')
  }
  const terminar = (r: Relacion) => {
    const quien = r.nombre || 'este entrenador'
    if (!confirm('¿Dejar de trabajar con ' + quien + '?\n\nDejarás de ver a todos sus deportistas en el acto. Lo que ya cambiaste se queda como está.')) return
    hacer(() => supabase.rpc('director_terminar', { _id_vinculo: r.id_vinculo }))
  }
  const copiar = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).then(() => {
      setCopiado(codigo); setTimeout(() => setCopiado(null), 1800)
    }).catch(() => {})
  }

  const abrirModal = (t: 'nuevo' | 'buscar') => {
    setModal(t); setFNombre(''); setFCorreo(''); setCodigoCreado(null); setEncontrado(null); setErrorModal('')
  }
  const crearInvitacion = async () => {
    setErrorModal('')
    const { data, error: e } = await supabase.rpc('director_invitar_entrenador', { _nombre: fNombre, _email: fCorreo })
    if (e) { setErrorModal(e.message); return }
    setCodigoCreado(String(data))
    cargar()
  }
  const buscar = async () => {
    setErrorModal(''); setEncontrado(null)
    const { data, error: e } = await supabase.rpc('director_buscar_entrenador', { _email: fCorreo })
    if (e) { setErrorModal(e.message); return }
    const fila = (data || [])[0] as Encontrado | undefined
    setEncontrado(fila || 'nadie')
  }
  const solicitar = async (id: string) => {
    setErrorModal('')
    const { error: e } = await supabase.rpc('director_solicitar', { _id_entrenador: id })
    if (e) { setErrorModal(e.message); return }
    setEncontrado(prev => (prev && prev !== 'nadie') ? { ...prev, estado: 'pendiente' } : prev)
    cargar()
  }

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>

  const hoy = hoyISO()

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-8">
        {!esDirector ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-xl font-bold mb-2">Mis entrenadores</h2>
            <p className="text-gray-400 text-sm">Esta página es para directores: entrenadores que dirigen a otros entrenadores. La marca de director la pone la plataforma; si la necesitas, escríbenos a hola@tripulse.app.</p>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-xl">
                <h2 className="text-2xl font-bold">Mis entrenadores</h2>
                <p className="text-gray-400 text-sm mt-1">Entra en el espacio de cada uno. Ves a todos sus deportistas, pero cada uno te lo tiene que abrir su entrenador.</p>
              </div>
              <button onClick={() => abrirModal('nuevo')}
                className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-semibold transition">＋ Añadir entrenador</button>
            </header>

            {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

            <section className="grid sm:grid-cols-2 gap-3">
              {relaciones.length === 0 && invitaciones.length === 0 && (
                <div className="sm:col-span-2 rounded-2xl border border-dashed border-gray-700 p-6 text-sm text-gray-400">
                  Todavía no trabajas con ningún entrenador. Pulsa «Añadir entrenador»: puedes invitar a uno nuevo o pedírselo a uno que ya use TRIPULSE.
                </div>
              )}
              {relaciones.map(r => (
                <article key={r.id_vinculo} className="tp-card p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-2xl grid place-items-center text-lg font-bold text-white flex-shrink-0"
                      style={{ background: r.estado === 'activo' ? fondoDe(r.nombre || '?') : '#1f2937' }}>
                      {inicialDe(r.nombre || '?')}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{r.nombre || 'Entrenador'}</p>
                      <p className="text-xs text-gray-400">
                        {r.estado === 'activo' ? 'Trabajáis juntos'
                          : r.estado === 'pendiente' ? 'Solicitud enviada'
                          : r.estado === 'rechazado' ? 'No aceptó trabajar contigo'
                          : 'Ya no trabajáis juntos'}
                      </p>
                    </div>
                  </div>

                  {r.estado === 'activo' && (
                    <>
                      <p className="text-[12.5px] text-gray-400">
                        <b className="text-white tabular-nums">{r.n_deportistas ?? 0}</b> deportistas · <b className="text-white tabular-nums">{r.n_con_acceso ?? 0}</b> abiertos
                        {(r.n_pedidos ?? 0) > 0 && <> · <b className="text-amber-200 tabular-nums">{r.n_pedidos}</b> pedido{r.n_pedidos === 1 ? '' : 's'}</>}
                      </p>
                      <button onClick={() => entrar(r)}
                        className="w-full bg-orange-500 hover:bg-orange-600 rounded-lg py-2 text-sm font-semibold transition">Entrar en su espacio</button>
                      <button onClick={() => terminar(r)} disabled={ocupado}
                        className="self-start text-[11.5px] text-red-300/80 hover:text-red-200 underline underline-offset-2 transition">Dejar de trabajar juntos</button>
                    </>
                  )}
                  {r.estado === 'pendiente' && (
                    <>
                      <p className="text-[12.5px] text-gray-400">Esperando a que acepte. Hasta entonces no ves nada suyo.</p>
                      <button onClick={() => terminar(r)} disabled={ocupado}
                        className="self-start text-[11.5px] text-gray-400 hover:text-white underline underline-offset-2 transition">Retirar la solicitud</button>
                    </>
                  )}
                  {(r.estado === 'rechazado' || r.estado === 'terminado') && (
                    <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('director_solicitar', { _id_entrenador: r.id_entrenador }))}
                      className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg py-2 text-sm transition">Pedirle trabajar juntos otra vez</button>
                  )}
                </article>
              ))}
              {invitaciones.map(i => (
                <article key={i.codigo} className="tp-card p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-2xl grid place-items-center text-lg font-bold text-gray-500 bg-gray-800 flex-shrink-0">{inicialDe(i.nombre || '?')}</span>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{i.nombre || 'Invitación'}</p>
                      <p className="text-xs text-gray-400 truncate">Invitación enviada: todavía no se ha registrado</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-gray-700 bg-gray-900 pl-3 pr-2 py-2">
                    <span className="font-mono font-semibold tracking-widest select-all">{i.codigo}</span>
                    <button onClick={() => copiar(i.codigo)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">
                      {copiado === i.codigo ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-[12px] text-gray-500">Al registrarse con este código quedará trabajando contigo.{i.email ? ' Es para ' + i.email + '.' : ''}</p>
                </article>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Novedades</h3>
              {novedades.length === 0 ? (
                <p className="text-sm text-gray-500 border border-dashed border-gray-800 rounded-xl px-4 py-3">Aquí te llegan las respuestas de tus entrenadores.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {novedades.map(a => {
                    const t = textoAviso(a, 'entrenador', hoy)
                    const nueva = nuevas.has(a.id)
                    return (
                      <li key={a.id} className={'rounded-xl border px-4 py-3 ' + (nueva ? 'border-orange-500/40 bg-orange-500/[0.07]' : 'border-gray-800 bg-gray-900')}>
                        <p className="text-sm text-gray-100">{nueva && <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2 align-middle" />}{t.titulo}</p>
                        {t.detalle.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{t.detalle.join(' · ')}</p>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4" onClick={() => setModal(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700 w-full max-w-md flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg">Añadir entrenador</h3>
            <div className="flex gap-1 p-1 rounded-xl bg-gray-800" role="tablist">
              {(['nuevo', 'buscar'] as const).map(t => (
                <button key={t} role="tab" aria-selected={modal === t} onClick={() => abrirModal(t)}
                  className={'flex-1 py-2 rounded-lg text-sm font-semibold transition ' + (modal === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>
                  {t === 'nuevo' ? 'Es nuevo en TRIPULSE' : 'Ya usa TRIPULSE'}
                </button>
              ))}
            </div>

            {modal === 'nuevo' && !codigoCreado && (
              <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); crearInvitacion() }}>
                <p className="text-sm text-gray-400">Le creas la invitación. Cuando se registre con ese código, quedará trabajando contigo.</p>
                <label className="text-xs text-gray-400 mt-1" htmlFor="inv-nombre">Nombre</label>
                <input id="inv-nombre" value={fNombre} onChange={e => setFNombre(e.target.value)} maxLength={80} autoComplete="off"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
                <label className="text-xs text-gray-400 mt-1" htmlFor="inv-correo">Correo</label>
                <input id="inv-correo" type="email" value={fCorreo} onChange={e => setFCorreo(e.target.value)} maxLength={120} autoComplete="off"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
                {errorModal && <p className="text-xs text-red-300">{errorModal}</p>}
                <div className="flex gap-2 justify-end mt-2">
                  <button type="button" onClick={() => setModal(null)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition">Cancelar</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-sm font-semibold transition">Crear invitación</button>
                </div>
              </form>
            )}
            {modal === 'nuevo' && codigoCreado && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-300">Invitación creada para <b className="text-white">{fNombre}</b>. La app todavía no manda el correo, así que el código se lo pasas tú.</p>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-gray-600 bg-gray-800 pl-3 pr-2 py-2">
                  <span className="font-mono font-semibold tracking-widest text-lg select-all">{codigoCreado}</span>
                  <button onClick={() => copiar(codigoCreado)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 transition">{copiado === codigoCreado ? 'Copiado' : 'Copiar'}</button>
                </div>
                <p className="text-xs text-gray-500">Entrará sin cupo de deportistas: se lo pone la plataforma. Hasta que se registre lo verás aquí como «Invitación enviada».</p>
                <div className="flex justify-end"><button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-sm font-semibold transition">Hecho</button></div>
              </div>
            )}

            {modal === 'buscar' && (
              <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); buscar() }}>
                <p className="text-sm text-gray-400">Escribe el correo con el que entra en TRIPULSE. Le llegará una solicitud y tiene que aceptarla; después, cada deportista te lo abre él o ella.</p>
                <label className="text-xs text-gray-400 mt-1" htmlFor="busca-correo">Correo</label>
                <div className="flex gap-2">
                  <input id="busca-correo" type="email" value={fCorreo} onChange={e => { setFCorreo(e.target.value); setEncontrado(null) }} maxLength={120} autoComplete="off"
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
                  <button type="submit" className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold transition">Buscar</button>
                </div>
                {encontrado === 'nadie' && <p className="text-sm text-gray-400 mt-1">No hay ningún entrenador con ese correo. Si es nuevo, invítalo desde la otra pestaña.</p>}
                {encontrado && encontrado !== 'nadie' && (
                  <div className="mt-1 rounded-xl bg-gray-800 px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <b className="text-sm">{encontrado.nombre || 'Entrenador'}</b>
                    {encontrado.estado === 'libre' && (
                      <button type="button" onClick={() => solicitar(encontrado.id)} className="text-sm px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 font-semibold transition">Enviar solicitud</button>
                    )}
                    {encontrado.estado === 'contigo' && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200">Ya trabajáis juntos</span>}
                    {encontrado.estado === 'pendiente' && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-200">Solicitud enviada</span>}
                    {encontrado.estado === 'ocupado' && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-700 text-gray-300">Ya trabaja con otro director</span>}
                  </div>
                )}
                {errorModal && <p className="text-xs text-red-300">{errorModal}</p>}
                <div className="flex justify-end mt-2"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition">Cerrar</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
