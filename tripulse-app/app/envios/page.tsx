'use client'
// ============================================================
// Envíos: lo que te han mandado otros entrenadores, y lo que has mandado tú
// ============================================================
// Antes de aceptar se ve QUÉ es: los bloques de la plantilla, los resultados
// del test, la tabla de zonas. Si algo choca con un nombre que ya tienes, se
// elige cómo se llamará lo nuevo. Aceptar crea copias tuyas, en un solo paso
// (supabase/envios-entrenadores.sql). Ver lib/envios.
//
// Un traspaso de un deportista no es una copia: si tiene cuenta, contesta
// también él, y el chip dice a quién le falta contestar (envios-traspaso.sql).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import {
  COLUMNAS_ENVIO, contestar, cancelar, marcarRespuestasVistas, marcarAvisosVistos, conflictosDe, copiasPreviasDe,
  etiquetaTipo, haceCuanto, dondeQueda, textoEstado, primerNombre, faltaLaTabla, puedoContestar, traspasoContestado, textoCupo,
  type Envio, type LoQueTengo, type NombresAlAceptar,
} from '@/lib/envios'
import { ChipEstado, PreviewContenido } from '@/components/envios/VistaEnvio'
import ElegirQueMandar from '@/components/envios/ElegirQueMandar'
import EnviarAEntrenador, { type QueEnviar } from '@/components/EnviarAEntrenador'

type Pestana = 'recibidos' | 'enviados'

export default function PaginaEnvios() {
  const router = useRouter()
  useRequireEntrenador()

  const [uid, setUid] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sinTabla, setSinTabla] = useState(false)
  const [recibidos, setRecibidos] = useState<Envio[]>([])
  const [enviados, setEnviados] = useState<Envio[]>([])
  const [pestana, setPestana] = useState<Pestana>('recibidos')
  const [sel, setSel] = useState<number | null>(null)
  const [mio, setMio] = useState<Omit<LoQueTengo, 'copiasPrevias'> | null>(null)
  /* Tu cupo, para decir antes de aceptar un traspaso cuántos te quedarían. */
  const [miCupo, setMiCupo] = useState<{ cupo: number | null; tengo: number } | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [trabajando, setTrabajando] = useState(false)
  const [hecho, setHecho] = useState<Record<number, string>>({})
  /* «📨 Mandar algo»: primero se elige qué (ElegirQueMandar) y luego a quién
     (EnviarAEntrenador). Lo que se acaba de mandar se abre en Enviados. */
  const [eligiendo, setEligiendo] = useState(false)
  const [nuevo, setNuevo] = useState<QueEnviar | null>(null)
  const [recienEnviado, setRecienEnviado] = useState<number | null>(null)

  /* Lo que ya tienes, para saber qué nombres chocarían al aceptar. */
  const cargarMio = useCallback(async (id: string) => {
    const [{ data: ts }, { data: cs }, { data: ps }, { data: yo }, { count: tengo }] = await Promise.all([
      supabase.from('test_definicion').select('id, nombre').eq('id_entrenador', id).eq('archivado', false),
      supabase.from('zona_clasificacion').select('nombre').eq('id_entrenador', id).eq('archivada', false),
      supabase.from('plantilla_sesion').select('nombre, disciplina').eq('id_entrenador', id),
      supabase.from('perfiles').select('cupo_deportistas').eq('id', id).maybeSingle(),
      /* Lo mismo que cuenta la base para el cupo: los que no son solo de tests. */
      supabase.from('deportista').select('id', { count: 'exact', head: true }).eq('id_entrenador', id).eq('solo_test', false),
    ])
    const plantillas: Record<string, string[]> = {}
    for (const p of (ps || []) as { nombre: string; disciplina: string }[]) (plantillas[p.disciplina] ||= []).push(p.nombre)
    setMio({
      tests: ((ts || []) as { id: number; nombre: string }[]).map(t => ({ id: Number(t.id), nombre: t.nombre })),
      clasificaciones: ((cs || []) as { nombre: string }[]).map(c => c.nombre),
      plantillas,
    })
    const cupo = (yo as { cupo_deportistas?: number | null } | null)?.cupo_deportistas
    setMiCupo({ cupo: cupo == null ? null : Number(cupo), tengo: tengo ?? 0 })
  }, [])

  /* Quien lo mandó ya ha visto la respuesta: se va su aviso del panel. */
  const verEnviados = useCallback((lista: Envio[]) => {
    const ids = lista.filter(e => (e.estado === 'aceptado' || e.estado === 'rechazado') && !e.respuesta_vista_en).map(e => e.id)
    if (ids.length) marcarRespuestasVistas(supabase, ids)
  }, [])

  /* Y quien recibió un traspaso ya ha visto en qué quedó (lo cerró otro). */
  const verRecibidos = useCallback((lista: Envio[]) => {
    const ids = lista.filter(e => e.tipo === 'deportista' && e.estado !== 'pendiente' && !e.aviso_para_visto_en).map(e => e.id)
    if (ids.length) marcarAvisosVistos(supabase, ids)
  }, [])

  const pedirListas = useCallback(async (id: string): Promise<{ r: Envio[]; s: Envio[] } | null> => {
    const [rec, env] = await Promise.all([
      supabase.from('envio_entrenador').select(COLUMNAS_ENVIO).eq('para', id).order('creado_en', { ascending: false }).limit(100),
      supabase.from('envio_entrenador').select(COLUMNAS_ENVIO).eq('de', id).order('creado_en', { ascending: false }).limit(100),
    ])
    if (faltaLaTabla(rec.error) || faltaLaTabla(env.error)) return null
    return { r: (rec.data || []) as Envio[], s: (env.data || []) as Envio[] }
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const user = await usuarioActual()
      if (!vivo) return
      if (!user) { router.push('/login'); return }
      setUid(user.id)
      const listas = await pedirListas(user.id)
      if (!vivo) return
      if (!listas) { setSinTabla(true); setCargando(false); return }
      const { r, s } = listas
      setRecibidos(r)
      setEnviados(s)
      /* La dirección manda: «Ver qué es» del panel trae ?id=, y ?ver=enviados
         abre la otra pestaña. Se lee del navegador, como en el resto de la app. */
      const p = new URLSearchParams(window.location.search)
      const pedido = Number(p.get('id')) || null
      const enEnviados = p.get('ver') === 'enviados' || (!!pedido && s.some(e => e.id === pedido) && !r.some(e => e.id === pedido))
      setPestana(enEnviados ? 'enviados' : 'recibidos')
      setSel(pedido)
      if (enEnviados) verEnviados(s)
      else verRecibidos(r)
      setCargando(false)
      if (r.some(e => e.estado === 'pendiente')) await cargarMio(user.id)
    })()
    return () => { vivo = false }
  }, [router, cargarMio, verEnviados, verRecibidos, pedirListas])

  /* Al cerrar la ventana de enviar: si se mandó algo, a Enviados con eso abierto. */
  const cerrarNuevo = async () => {
    setNuevo(null)
    const id = recienEnviado
    setRecienEnviado(null)
    if (!id || !uid) return
    const listas = await pedirListas(uid)
    if (!listas) return
    setRecibidos(listas.r)
    setEnviados(listas.s)
    setPestana('enviados')
    setSel(id)
  }

  const lista = pestana === 'recibidos' ? recibidos : enviados
  const actual = lista.find(e => e.id === sel) ?? null
  /* Lo que te toca contestar: un traspaso que ya aceptaste espera al deportista. */
  const pendientes = recibidos.filter(puedoContestar).length

  /* Un traspaso no pregunta nombres: lo hace el último que acepta, que puede
     ser el deportista, y la base les pone el «(Ana)» si chocan. */
  const conflictos = useMemo(() => {
    if (!actual || pestana !== 'recibidos' || actual.estado !== 'pendiente' || actual.tipo === 'deportista' || !mio) return null
    return conflictosDe(actual, { ...mio, copiasPrevias: copiasPreviasDe(recibidos, actual.de) })
  }, [actual, pestana, mio, recibidos])

  const cambiarPestana = (p: Pestana) => {
    setPestana(p)
    setSel(null)
    if (p === 'enviados') verEnviados(enviados)
    else verRecibidos(recibidos)
  }

  const nombreDe = (clave: string, propuesto: string) => nombres[clave] ?? propuesto

  const responder = async (e: Envio, aceptar: boolean) => {
    if (trabajando) return
    const de = primerNombre(e.de_nombre) || 'quien te lo mandó'
    if (!aceptar && !confirm(e.tipo === 'deportista'
      ? '¿Rechazar el traspaso de ' + (e.contenido.deportista?.nombre || 'este deportista') + '?\n\nSigue con ' + de + ', y ' + de + ' verá que lo has rechazado.'
      : '¿Rechazar «' + e.titulo + '»?\n\nNo se crea nada, y ' + de + ' verá que lo has rechazado.')) return
    if (e.tipo === 'deportista') {
      setTrabajando(true)
      const r = await contestar(supabase, e.id, aceptar)
      setTrabajando(false)
      if (r.error) { alert('No se ha podido ' + (aceptar ? 'aceptar' : 'rechazar') + '.\n\n' + r.error); return }
      const ahora = new Date().toISOString()
      const estado = r.resultado?.estado
      /* Si falta el deportista sigue pendiente, con tu «sí» apuntado. */
      setRecibidos(prev => prev.map(x => x.id !== e.id ? x
        : !aceptar ? { ...x, estado: 'rechazado', rechaza: 'entrenador', contestado_en: ahora }
          : estado === 'pendiente' ? { ...x, acepta_entrenador_en: ahora }
            : estado === 'cancelado' ? { ...x, estado: 'cancelado', contestado_en: ahora }
              : { ...x, estado: 'aceptado', acepta_entrenador_en: ahora, contestado_en: ahora, resultado: { deportista: e.id_deportista ?? undefined } }))
      setHecho(prev => ({ ...prev, [e.id]: traspasoContestado(e, aceptar, r.resultado as { estado?: string; motivo?: string } | null) }))
      if (aceptar && uid) cargarMio(uid)
      return
    }
    const n: NombresAlAceptar = {}
    if (aceptar && conflictos) {
      if (conflictos.plantilla) n.plantilla = nombreDe('plantilla', conflictos.plantilla)
      if (conflictos.clasificacion) n.clasificacion = nombreDe('clasificacion', conflictos.clasificacion)
      /* En unos «varios», cada parte por su posición. */
      const ps = Object.entries(conflictos.plantillas)
      if (ps.length) n.plantillas = Object.fromEntries(ps.map(([i, propuesto]) => [i, nombreDe('p:' + i, propuesto)]))
      const cs = Object.entries(conflictos.clasificaciones)
      if (cs.length) n.clasificaciones = Object.fromEntries(cs.map(([i, propuesto]) => [i, nombreDe('c:' + i, propuesto)]))
      const t = Object.entries(conflictos.tests)
      if (t.length) n.tests = Object.fromEntries(t.map(([id, propuesto]) => [id, nombreDe('t:' + id, propuesto)]))
    }
    setTrabajando(true)
    const r = await contestar(supabase, e.id, aceptar, n)
    setTrabajando(false)
    if (r.error) { alert('No se ha podido ' + (aceptar ? 'aceptar' : 'rechazar') + '.\n\n' + r.error); return }
    const ahora = new Date().toISOString()
    setRecibidos(prev => prev.map(x => x.id === e.id
      ? { ...x, estado: aceptar ? 'aceptado' : 'rechazado', contestado_en: ahora, resultado: aceptar ? { plantilla: r.resultado?.plantilla, clasificacion: r.resultado?.clasificacion, tests: r.resultado?.tests } : null }
      : x))
    setHecho(prev => ({
      ...prev,
      [e.id]: aceptar
        ? 'Aceptado. ' + dondeQueda(e) + ((r.resultado?.reusados?.length ?? 0) > 0 ? ' El test ya lo tenías de otro envío: no se ha duplicado.' : '')
        : 'Rechazado: no se ha creado nada.',
    }))
    setNombres({})
    if (aceptar && uid) cargarMio(uid)
  }

  const cancelarEnvio = async (e: Envio) => {
    if (trabajando) return
    const para = primerNombre(e.para_nombre) || 'ese entrenador'
    if (!confirm(e.tipo === 'deportista'
      ? '¿Cancelar el traspaso de ' + (e.contenido.deportista?.nombre || 'este deportista') + ' a ' + para + '?\n\nSigue contigo, y ya no se podrá aceptar.'
      : '¿Cancelar el envío de «' + e.titulo + '» a ' + para + '?\n\nYa no podrá aceptarlo.')) return
    setTrabajando(true)
    const err = await cancelar(supabase, e.id)
    setTrabajando(false)
    if (err) { alert('No se ha podido cancelar.\n\n' + err); return }
    setEnviados(prev => prev.map(x => x.id === e.id ? { ...x, estado: 'cancelado', contestado_en: new Date().toISOString() } : x))
  }

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  const papel = pestana === 'recibidos' ? 'recibe' : 'manda'

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm transition">← Volver</button>
      </nav>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold mb-1">📨 Envíos</h2>
            <p className="text-gray-400 text-sm max-w-[70ch]">
              Lo que te han mandado otros entrenadores, y lo que has mandado tú. Lo que se manda es una copia: aceptarlo
              crea algo tuyo, que puedes cambiar sin tocar lo del otro.
            </p>
          </div>
          {!sinTabla && (
            <button type="button" onClick={() => setEligiendo(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition">
              📨 Mandar algo
            </button>
          )}
        </div>

        {sinTabla ? (
          <p className="text-amber-200 text-sm bg-amber-400/10 border border-amber-400/30 rounded-xl px-4 py-3">
            Falta aplicar supabase/envios-entrenadores.sql en la base de datos.
          </p>
        ) : (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-950/40 flex-wrap">
              <div role="tablist" aria-label="Recibidos o enviados" className="inline-flex gap-1 p-1 rounded-lg bg-gray-950 border border-gray-800">
                {(['recibidos', 'enviados'] as Pestana[]).map(p => (
                  <button key={p} role="tab" aria-selected={pestana === p} onClick={() => cambiarPestana(p)}
                    className={'text-[13px] px-3 py-1.5 rounded-md transition ' + (pestana === p
                      ? 'bg-orange-500/15 text-orange-200 font-semibold shadow-[inset_0_0_0_1px_rgba(249,115,22,.4)]'
                      : 'text-gray-400 hover:text-white')}>
                    {p === 'recibidos' ? 'Recibidos' + (pendientes ? ' · ' + pendientes : '') : 'Enviados'}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-500">
                {pestana === 'recibidos'
                  ? 'Te llegan también al panel.'
                  : 'Se manda desde una sesión, el panel de plantillas, Tests propios, Zonas propias o Deportistas.'}
              </span>
            </div>

            <div className="lg:grid lg:grid-cols-[340px_1fr] min-h-[420px]">
              {/* ── La lista ── (en el móvil, solo si no hay uno abierto) */}
              <ul className={(actual ? 'hidden lg:flex' : 'flex') + ' flex-col lg:border-r border-gray-800'}>
                {lista.length === 0 ? (
                  <li className="px-4 py-8 text-sm text-gray-500 leading-relaxed">
                    {pestana === 'recibidos'
                      ? 'Todavía no te han mandado nada. Cuando otro entrenador te mande una sesión, un test, unas zonas o un deportista, saldrá aquí y en tu panel.'
                      : 'Todavía no has mandado nada. Busca el botón «Enviar» en una sesión, en tus plantillas, en Tests propios o en Zonas propias, o «Pasar a otro entrenador» en Deportistas.'}
                  </li>
                ) : lista.map(e => (
                  <li key={e.id}>
                    <button type="button" onClick={() => setSel(e.id)} aria-current={e.id === sel}
                      className={'w-full text-left px-4 py-3 border-b border-gray-800 flex flex-col gap-1.5 transition ' + (e.id === sel
                        ? 'bg-orange-500/[0.08] shadow-[inset_0_0_0_1px_rgba(249,115,22,.35)]'
                        : 'hover:bg-white/[0.03]')}>
                      <span className="flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-white/[0.07] text-gray-200">{etiquetaTipo(e)}</span>
                        <span>{haceCuanto(e.creado_en)}</span>
                      </span>
                      <span className="text-[13.5px] text-white leading-snug">{e.titulo}</span>
                      <span className="text-xs text-gray-400">
                        {pestana === 'recibidos' ? 'De ' + (e.de_nombre || 'otro entrenador') : 'A ' + (e.para_nombre || e.para_correo || 'otro entrenador')}
                      </span>
                      <ChipEstado e={e} papel={papel} />
                    </button>
                  </li>
                ))}
              </ul>

              {/* ── El detalle ── */}
              <section className={(actual ? 'flex' : 'hidden lg:flex') + ' flex-col gap-4 px-4 sm:px-5 py-4 min-w-0'}>
                {!actual ? (
                  <p className="text-sm text-gray-500 py-8">{lista.length ? 'Elige un envío de la lista.' : ''}</p>
                ) : (
                  <>
                    <button type="button" onClick={() => setSel(null)} className="lg:hidden self-start text-gray-400 hover:text-white text-sm transition">
                      ← Todos los envíos
                    </button>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">
                          {papel === 'recibe'
                            ? 'De ' + (actual.de_nombre || 'otro entrenador')
                            : 'A ' + (actual.para_nombre || 'otro entrenador') + (actual.para_correo ? ' · ' + actual.para_correo : '')}
                          {' · '}{haceCuanto(actual.creado_en)}
                        </p>
                        <h3 className="text-lg font-semibold text-balance">{actual.titulo}</h3>
                      </div>
                      <ChipEstado e={actual} papel={papel} />
                    </div>
                    {actual.mensaje && <p className="text-sm text-gray-300 italic">«{actual.mensaje}»</p>}

                    <PreviewContenido e={actual} papel={papel} cupo={miCupo} />

                    {/* ── Contestar (lo recibido que te toca contestar) ── */}
                    {papel === 'recibe' && puedoContestar(actual) && (
                      <div className="flex flex-col gap-3 pt-1">
                        {conflictos && (conflictos.plantilla || conflictos.clasificacion || Object.keys(conflictos.tests).length > 0
                          || Object.keys(conflictos.plantillas).length > 0 || Object.keys(conflictos.clasificaciones).length > 0) && (
                          <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-3 flex flex-col gap-2.5">
                            <p className="text-sm text-amber-100 font-semibold">Ya tienes algo con el mismo nombre. Elige cómo se llamará lo nuevo:</p>
                            {conflictos.plantilla && (
                              <label className="flex flex-wrap items-center gap-2 text-[13px] text-amber-100/90">
                                La plantilla se llamará
                                <input value={nombreDe('plantilla', conflictos.plantilla)} maxLength={80}
                                  onChange={ev => setNombres(p => ({ ...p, plantilla: ev.target.value }))}
                                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white min-w-[14rem] flex-1 max-w-full" />
                              </label>
                            )}
                            {conflictos.clasificacion && (
                              <label className="flex flex-wrap items-center gap-2 text-[13px] text-amber-100/90">
                                Las zonas se llamarán
                                <input value={nombreDe('clasificacion', conflictos.clasificacion)} maxLength={80}
                                  onChange={ev => setNombres(p => ({ ...p, clasificacion: ev.target.value }))}
                                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white min-w-[14rem] flex-1 max-w-full" />
                              </label>
                            )}
                            {Object.entries(conflictos.plantillas).map(([i, propuesto]) => (
                              <label key={'p' + i} className="flex flex-wrap items-center gap-2 text-[13px] text-amber-100/90">
                                La plantilla «{actual.contenido.plantillas?.[Number(i)]?.nombre}» se llamará
                                <input value={nombreDe('p:' + i, propuesto)} maxLength={80}
                                  onChange={ev => setNombres(p => ({ ...p, ['p:' + i]: ev.target.value }))}
                                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white min-w-[14rem] flex-1 max-w-full" />
                              </label>
                            ))}
                            {Object.entries(conflictos.clasificaciones).map(([i, propuesto]) => (
                              <label key={'c' + i} className="flex flex-wrap items-center gap-2 text-[13px] text-amber-100/90">
                                Las zonas «{actual.contenido.clasificaciones?.[Number(i)]?.clasificacion?.nombre}» se llamarán
                                <input value={nombreDe('c:' + i, propuesto)} maxLength={80}
                                  onChange={ev => setNombres(p => ({ ...p, ['c:' + i]: ev.target.value }))}
                                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white min-w-[14rem] flex-1 max-w-full" />
                              </label>
                            ))}
                            {Object.entries(conflictos.tests).map(([id, propuesto]) => (
                              <label key={id} className="flex flex-wrap items-center gap-2 text-[13px] text-amber-100/90">
                                El test «{(actual.contenido.tests || []).find(t => String(t.id) === id)?.nombre}» se llamará
                                <input value={nombreDe('t:' + id, propuesto)} maxLength={80}
                                  onChange={ev => setNombres(p => ({ ...p, ['t:' + id]: ev.target.value }))}
                                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white min-w-[14rem] flex-1 max-w-full" />
                              </label>
                            ))}
                          </div>
                        )}
                        {conflictos && conflictos.yaLosTiene.length > 0 && (
                          <p className="text-xs text-sky-200/90 bg-sky-400/10 border border-sky-400/30 rounded-lg px-3 py-2">
                            {conflictos.yaLosTiene.length === 1 ? 'El test ya te lo mandó' : 'Los tests ya te los mandó'} {primerNombre(actual.de_nombre) || 'este entrenador'} en otro envío:
                            si no ha cambiado, se usa el que tienes y no se duplica.
                          </p>
                        )}
                        {/* Un traspaso con el cupo lleno no se puede aceptar: se dice por qué. */}
                        {(() => {
                          const cupoLleno = actual.tipo === 'deportista' && !actual.contenido.deportista?.solo_test && !!textoCupo(miCupo)?.lleno
                          return (
                            <div className="flex items-center gap-2 flex-wrap">
                              <button type="button" onClick={() => responder(actual, true)} disabled={trabajando || cupoLleno}
                                className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition disabled:opacity-50">
                                {trabajando ? 'Un momento…' : 'Aceptar'}
                              </button>
                              <button type="button" onClick={() => responder(actual, false)} disabled={trabajando}
                                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50">
                                Rechazar
                              </button>
                              {cupoLleno && <span className="text-amber-300 text-xs">Con el cupo lleno no puedes aceptarlo.</span>}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* ── Lo ya contestado (o el traspaso que espera al deportista) ── */}
                    {papel === 'recibe' && !puedoContestar(actual) && (
                      <div className="flex flex-col gap-2">
                        <p role="status" className={'text-sm ' + (actual.estado === 'aceptado' ? 'text-emerald-300' : 'text-gray-400')}>
                          {hecho[actual.id] ?? (actual.tipo === 'deportista'
                            ? (actual.estado === 'aceptado' ? dondeQueda(actual) : textoEstado(actual, 'recibe') + '.')
                            : actual.estado === 'aceptado' ? 'Lo aceptaste. ' + dondeQueda(actual) : textoEstado(actual, 'recibe') + '.')}
                        </p>
                        {actual.estado === 'aceptado' && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {actual.tipo === 'deportista' && actual.id_deportista && (actual.contenido.deportista?.solo_test ? (
                              <button type="button" onClick={() => router.push('/tests/' + actual.id_deportista)}
                                className="text-orange-300 hover:text-orange-200 text-sm underline underline-offset-4 transition">Ver sus tests →</button>
                            ) : (
                              <button type="button" onClick={() => router.push('/deportistas/' + actual.id_deportista)}
                                className="text-orange-300 hover:text-orange-200 text-sm underline underline-offset-4 transition">Ir a su ficha →</button>
                            ))}
                            {((actual.tipo === 'test' || actual.tipo === 'varios' || actual.tipo === 'deportista') && (actual.contenido.tests?.length ?? 0) > 0) && (
                              <button type="button" onClick={() => router.push('/tests-propios')}
                                className="text-orange-300 hover:text-orange-200 text-sm underline underline-offset-4 transition">Ir a Tests propios →</button>
                            )}
                            {(actual.tipo === 'zonas' || ((actual.tipo === 'varios' || actual.tipo === 'deportista') && (actual.contenido.clasificaciones?.length ?? 0) > 0)) && (
                              <button type="button" onClick={() => router.push('/zonas-propias')}
                                className="text-orange-300 hover:text-orange-200 text-sm underline underline-offset-4 transition">Ir a Zonas propias →</button>
                            )}
                            {actual.tipo === 'deportista' && (actual.contenido.ejercicios?.length ?? 0) > 0 && (
                              <button type="button" onClick={() => router.push('/fuerza')}
                                className="text-orange-300 hover:text-orange-200 text-sm underline underline-offset-4 transition">Ir a tu biblioteca →</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Lo enviado ── */}
                    {papel === 'manda' && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-sm text-gray-400">{textoEstado(actual, 'manda')}.</p>
                        {actual.estado === 'pendiente' && (
                          <button type="button" onClick={() => cancelarEnvio(actual)} disabled={trabajando}
                            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm px-4 py-2 rounded-lg transition disabled:opacity-50">
                            Cancelar el envío
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
      {eligiendo && (
        <ElegirQueMandar onCerrar={() => setEligiendo(false)}
          onElegir={q => { setEligiendo(false); setNuevo(q) }} />
      )}
      {nuevo && <EnviarAEntrenador que={nuevo} onCerrar={cerrarNuevo} onEnviado={setRecienEnviado} />}
    </main>
  )
}
