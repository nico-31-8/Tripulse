'use client'
// ============================================================
// Los análisis libres de un deportista, en la pestaña Movimiento
// ============================================================
//
// v3 del analizador, paso 3 (17-10-2026; maqueta aprobada). Junto al FMS y el
// Nine Test, analizar cualquier vídeo sin batería: el mismo visor
// (components/movimiento/Analizador en modo libre), sin criterios ni nota. Aquí:
// la lista, cada análisis abierto (sus fotogramas, sus notas, borrar, poner dos
// al lado) y la entrada al visor y al informe.
//
// Van aparte de las baterías: no tienen total ni comparación automática con la
// fecha anterior, porque cada uno mide lo que el entrenador quiera.
//
// SOLO LOS VE QUIEN LE VALORA (lo dice la base): el deportista no los ve en Mis
// tests. Una persona de fuera es un evaluado: su análisis vive en la página de
// tests de su ficha, y se llega desde «Análisis sueltos» (la portada de Tests).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DE_VISTA } from '@/lib/baterias-movimiento'
import { urlsFotogramas } from '@/lib/movimiento-datos'
import {
  borrarAnalisisLibre, borrarFotogramaLibre, cambiarAnalisisLibre, cargarAnalisisLibres, cargarFotogramasLibres,
  graficasDelAnalisis, LARGO_NOTAS, LARGO_TITULO, marcadasDeEntrada, medidasDelMomento, textoDeFotograma,
  type AnalisisLibre, type FotogramaLibre,
} from '@/lib/analisis-libre'
import { fechaLarga } from '@/lib/fechas'
import { getEspacio } from '@/lib/espacio'
import type { ClaveGrafica } from '@/lib/cuerpo'
import Analizador from './Analizador'
import InformeLibre from './InformeLibre'
import NuevoAnalisisLibre from './NuevoAnalisisLibre'

const cuantos = (n: number) => (n === 1 ? '1 fotograma' : n + ' fotogramas')

/** Un fotograma en pequeño: la imagen (o que no la hay), cuándo es y sus primeras medidas. */
function Miniatura({ f, n, img, onBorrar }: { f: FotogramaLibre; n: number; img: string | null; onBorrar?: () => void }) {
  const medidas = medidasDelMomento(f)
  const cuando = textoDeFotograma(f)
  return (
    <figure className="m-0 flex flex-col gap-1.5 rounded-xl border border-gray-800 bg-gray-900/60 p-2">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={'Fotograma ' + n} className="w-full aspect-[3/4] object-contain rounded-lg bg-black" />
      ) : (
        <div className="w-full aspect-[3/4] rounded-lg border border-dashed border-gray-700 grid place-items-center text-center text-[11px] text-gray-500 p-2">
          Sin imagen{f.imagen ? '' : ': falta su permiso'}
        </div>
      )}
      <figcaption className="text-[11.5px] flex flex-col gap-0.5 min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <b className="text-gray-200">Fotograma {n}</b>
          {onBorrar && <button onClick={onBorrar} className="text-[11px] text-gray-500 hover:text-red-300 transition">borrar</button>}
        </span>
        {cuando && <span className="text-gray-500">{cuando}</span>}
        {medidas.slice(0, 4).map(m => (
          <span key={m.nombre} className="flex justify-between gap-2 text-gray-400">
            <span className="truncate" title={m.nombre}>{m.nombre}</span>
            <span className="font-mono text-orange-300 whitespace-nowrap">{m.valor.split(' · ')[0]}</span>
          </span>
        ))}
        {medidas.length > 4 && <span className="text-gray-600">y {medidas.length - 4} más</span>}
      </figcaption>
    </figure>
  )
}

export default function AnalisisLibres({ idDeportista, nombre, permiso, mostrar, pedirNuevo, abrir }: {
  idDeportista: number
  nombre: string | null
  /** Si dio permiso para guardar imágenes (su ficha). */
  permiso: boolean
  /** Con una batería abierta la lista no se enseña (pero lo abierto se conserva). */
  mostrar: boolean
  /** Cada vez que cambia, se abre «Nuevo análisis libre» (el botón de arriba, junto al FMS y el Nine Test). */
  pedirNuevo: number
  /** Abrir uno al llegar (desde «Análisis sueltos» o recién creada una persona externa), y si con el visor ya abierto. */
  abrir: { id: number; analizar: boolean } | null
}) {
  const [analisis, setAnalisis] = useState<AnalisisLibre[]>([])
  const [fotosLista, setFotosLista] = useState<FotogramaLibre[]>([])
  const [error, setError] = useState('')
  const [abiertoId, setAbiertoId] = useState<number | null>(null)
  /** Los fotogramas del abierto, con sus medidas. */
  const [fotos, setFotos] = useState<FotogramaLibre[]>([])
  const [cargandoFotos, setCargandoFotos] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  /** Las imágenes compuestas en esta sesión (también las que no se subieron), por id de fotograma. */
  const [locales, setLocales] = useState<Record<number, string>>({})
  const [visor, setVisor] = useState(false)
  const [informe, setInforme] = useState<{ marcadas: string[] } | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [comparaId, setComparaId] = useState<number | null>(null)
  const [fotosCompara, setFotosCompara] = useState<FotogramaLibre[]>([])
  const [borrando, setBorrando] = useState<{ tipo: 'analisis' } | { tipo: 'fotograma'; f: FotogramaLibre; n: number } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [notas, setNotas] = useState('')
  const [avisoNotas, setAvisoNotas] = useState('')
  const [titulo, setTitulo] = useState<string | null>(null)

  /* «Nuevo análisis libre» desde el botón de arriba: el contador cambia y se abre (sin efecto: se ajusta al pintar). */
  const [pedidoVisto, setPedidoVisto] = useState(pedirNuevo)
  if (pedirNuevo !== pedidoVisto) { setPedidoVisto(pedirNuevo); setNuevo(true) }

  /* Las imágenes locales se sueltan al salir. */
  const localesRef = useRef(locales)
  useEffect(() => { localesRef.current = locales })
  useEffect(() => () => { Object.values(localesRef.current).forEach(u => URL.revokeObjectURL(u)) }, [])

  const abierto = analisis.find(a => a.id === abiertoId) || null
  const compara = analisis.find(a => a.id === comparaId) || null
  const imagenDe = (f: FotogramaLibre) => (f.imagen && urls[f.imagen]) || locales[f.id] || null
  /* Dentro del espacio de otro entrenador no se crean personas externas: serían suyas, no de él. */
  const externaPosible = !getEspacio()

  const abrirAnalisis = useCallback(async (a: AnalisisLibre, analizar = false) => {
    setAbiertoId(a.id); setNotas(a.notas ?? ''); setAvisoNotas(''); setTitulo(null)
    setComparaId(null); setFotosCompara([]); setFotos([]); setCargandoFotos(true); setVisor(analizar)
    const r = await cargarFotogramasLibres(supabase, a.id)
    setCargandoFotos(false)
    if (r.error) { setError('No se han podido cargar sus fotogramas: ' + r.error); return }
    setFotos(r.fotogramas)
    const u = await urlsFotogramas(supabase, r.fotogramas.map(f => f.imagen || ''))
    setUrls(x => ({ ...x, ...u }))
  }, [])

  /* Lo que había que abrir al llegar, una vez: cuando la lista ya está. */
  const abrirRef = useRef(abrir)
  const cargar = useCallback(async () => {
    const r = await cargarAnalisisLibres(supabase, idDeportista)
    if (r.error) setError('No se han podido cargar sus análisis libres: ' + r.error)
    setAnalisis(r.analisis)
    setFotosLista(r.fotogramas)
    const pedido = abrirRef.current
    abrirRef.current = null
    const a = pedido ? r.analisis.find(x => x.id === pedido.id) : null
    if (a) abrirAnalisis(a, pedido?.analizar)
  }, [idDeportista, abrirAnalisis])
  /* La regla ve una llamada que acaba en setState; el estado se pone DESPUÉS de
     que conteste la base, que es el caso que ella misma admite. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  const alCrear = ({ analisis: a, idDeportista: idDep, nuevaFicha }: { analisis: AnalisisLibre; idDeportista: number; nuevaFicha: boolean }) => {
    setNuevo(false)
    /* Una persona externa tiene su propia página de tests: allí vive su análisis. Se
       entra de nuevo (no con el router): la página lee al nacer qué abrir. */
    if (nuevaFicha || idDep !== idDeportista) { window.location.assign(`/tests/${idDep}?pestana=movimiento&libre=${a.id}&nuevo=1`); return }
    setAnalisis(xs => [a, ...xs])
    abrirAnalisis(a, true)
  }

  const alGuardarFotograma = (f: FotogramaLibre, local: string | null) => {
    setFotos(xs => [...xs, f])
    setFotosLista(xs => [...xs, { ...f, medidas: undefined, dibujo: undefined }])
    if (local) setLocales(x => ({ ...x, [f.id]: local }))
    if (f.imagen) urlsFotogramas(supabase, [f.imagen]).then(u => setUrls(x => ({ ...x, ...u })))
  }

  const cambiarEnLista = (id: number, cambios: Partial<AnalisisLibre>) =>
    setAnalisis(xs => xs.map(a => (a.id === id ? { ...a, ...cambios } : a)))

  const guardarNotas = async () => {
    if (!abierto) return
    const ahora = notas.trim() ? notas : null
    if ((ahora ?? '') === (abierto.notas ?? '')) return
    const r = await cambiarAnalisisLibre(supabase, abierto.id, { notas: ahora })
    if (r.error) { setAvisoNotas('No se han podido guardar: ' + r.error); return }
    setAvisoNotas('Notas guardadas.')
    cambiarEnLista(abierto.id, { notas: ahora })
  }

  const guardarTitulo = async () => {
    if (!abierto || titulo == null) return
    const t = titulo.trim()
    if (!t || t === abierto.titulo) { setTitulo(null); return }
    const r = await cambiarAnalisisLibre(supabase, abierto.id, { titulo: t })
    if (r.error) { setError('No se ha podido cambiar el nombre: ' + r.error); return }
    cambiarEnLista(abierto.id, { titulo: t.slice(0, LARGO_TITULO) })
    setTitulo(null)
  }

  const elegirCompara = async (id: number | null) => {
    setComparaId(id); setFotosCompara([])
    if (id == null) return
    const r = await cargarFotogramasLibres(supabase, id)
    if (r.error) { setError('No se ha podido cargar el otro análisis: ' + r.error); return }
    setFotosCompara(r.fotogramas)
    const u = await urlsFotogramas(supabase, r.fotogramas.map(f => f.imagen || ''))
    setUrls(x => ({ ...x, ...u }))
  }

  const confirmarBorrado = async () => {
    if (!borrando || !abierto) return
    setOcupado(true)
    if (borrando.tipo === 'fotograma') {
      const r = await borrarFotogramaLibre(supabase, borrando.f)
      setOcupado(false)
      if (r.error) { setError('No se ha podido borrar el fotograma: ' + r.error); return }
      setFotos(xs => xs.filter(x => x.id !== borrando.f.id))
      setFotosLista(xs => xs.filter(x => x.id !== borrando.f.id))
    } else {
      const r = await borrarAnalisisLibre(supabase, abierto, fotosLista)
      setOcupado(false)
      if (r.error) { setError('No se ha podido borrar el análisis: ' + r.error); return }
      setAnalisis(xs => xs.filter(a => a.id !== abierto.id))
      setFotosLista(xs => xs.filter(f => f.id_analisis !== abierto.id))
      setAbiertoId(null); setFotos([])
    }
    setBorrando(null)
  }

  const abrirInforme = (mirando: (ClaveGrafica | null)[]) =>
    setInforme({ marcadas: marcadasDeEntrada(graficasDelAnalisis(fotos), mirando) })

  return (
    <>
      {mostrar && (abierto ? (
        /* ── un análisis abierto ── */
        <div className="tp-card p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button onClick={() => { setAbiertoId(null); setFotos([]) }} className="text-[12px] text-gray-400 hover:text-white transition">← Sus análisis libres</button>
              {titulo == null ? (
                <p className="text-[16px] font-bold mt-1 flex flex-wrap items-baseline gap-x-2">
                  {abierto.titulo}
                  <button onClick={() => setTitulo(abierto.titulo)} className="text-[11.5px] font-normal text-gray-500 hover:text-white underline decoration-dotted underline-offset-4">cambiar el nombre</button>
                </p>
              ) : (
                <input value={titulo} onChange={e => setTitulo(e.target.value)} onBlur={guardarTitulo} autoFocus maxLength={LARGO_TITULO}
                  onKeyDown={e => { if (e.key === 'Enter') guardarTitulo(); if (e.key === 'Escape') setTitulo(null) }}
                  aria-label="Nombre del análisis"
                  className="mt-1 w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-[15px] font-bold text-white" />
              )}
              <p className="text-[12px] text-gray-500 mt-0.5">{fechaLarga(abierto.fecha)} · {DE_VISTA[abierto.vista]} · {cuantos(fotos.length)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setVisor(true)} className="text-[12.5px] px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold transition">
                {fotos.length ? 'Añadir fotogramas' : 'Elegir el vídeo'}
              </button>
              <button onClick={() => setInforme({ marcadas: [] })} disabled={!fotos.length}
                className="text-[12.5px] px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition disabled:opacity-40">Descargar el informe</button>
              <button onClick={() => setBorrando({ tipo: 'analisis' })}
                className="text-[12.5px] px-3 py-2 rounded-lg bg-gray-800 hover:bg-red-950 border border-gray-700 hover:border-red-800 text-gray-300 hover:text-red-300 transition">Borrar</button>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-gray-400">Tus notas</span>
            <textarea value={notas} onChange={e => { setNotas(e.target.value); setAvisoNotas('') }} onBlur={guardarNotas}
              maxLength={LARGO_NOTAS} rows={3} placeholder="Lo que ves, para ti y para el informe."
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-[13px] text-gray-100 placeholder:text-gray-500 resize-y" />
            {avisoNotas && <span className="text-[11px] text-gray-400" role="status">{avisoNotas}</span>}
          </label>

          {error && <p className="text-[12.5px] text-red-300" role="alert">{error}</p>}

          {cargandoFotos ? (
            <p className="text-[12.5px] text-gray-500">Cargando los fotogramas…</p>
          ) : !fotos.length ? (
            <p className="text-[12.5px] text-gray-500">Todavía no hay fotogramas. Elige el vídeo, ve al momento que quieras enseñar y pulsa «Guardar este fotograma».</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-400">
                <span>Poner al lado de</span>
                <select value={comparaId ?? ''} onChange={e => elegirCompara(e.target.value ? Number(e.target.value) : null)}
                  className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-[12px] text-gray-200 max-w-full">
                  <option value="">ninguno</option>
                  {analisis.filter(a => a.id !== abierto.id).map(a => (
                    <option key={a.id} value={a.id}>{a.titulo} · {fechaLarga(a.fecha)}</option>
                  ))}
                </select>
              </div>
              <div className={'grid gap-4 ' + (compara ? 'md:grid-cols-2' : '')}>
                <div className="flex flex-col gap-2 min-w-0">
                  {compara && <p className="text-[12.5px] font-semibold text-gray-300">{abierto.titulo} <span className="font-normal text-gray-500">· {fechaLarga(abierto.fecha)}</span></p>}
                  <div className={'grid gap-2 ' + (compara ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
                    {fotos.map((f, i) => (
                      <Miniatura key={f.id} f={f} n={i + 1} img={imagenDe(f)} onBorrar={() => setBorrando({ tipo: 'fotograma', f, n: i + 1 })} />
                    ))}
                  </div>
                </div>
                {compara && (
                  <div className="flex flex-col gap-2 min-w-0">
                    <p className="text-[12.5px] font-semibold text-gray-300">{compara.titulo} <span className="font-normal text-gray-500">· {fechaLarga(compara.fecha)}</span></p>
                    {!fotosCompara.length ? (
                      <p className="text-[12px] text-gray-500">Sin fotogramas, o cargándolos.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {fotosCompara.map((f, i) => <Miniatura key={f.id} f={f} n={i + 1} img={imagenDe(f)} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── la lista ── */
        <div className="tp-card p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13.5px] font-semibold">Sus análisis libres {analisis.length > 0 && <span className="text-orange-400">{analisis.length}</span>}</p>
            <button onClick={() => setNuevo(true)}
              className="text-[12.5px] px-3 py-1.5 rounded-lg border border-dashed border-sky-300/45 bg-sky-300/[0.06] text-sky-300 hover:text-white transition">＋ Análisis libre</button>
          </div>
          {error && <p className="text-[12.5px] text-red-300" role="alert">{error}</p>}
          {analisis.length === 0 ? (
            <p className="text-[12.5px] text-gray-500 leading-snug">
              Ninguno todavía. Es el mismo visor que el de las baterías —ángulos, líneas, seguimiento, esqueleto y gráficas—, pero sin criterios ni nota:
              para la técnica de carrera, una sentadilla con carga o lo que quieras mirar.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {analisis.map(a => (
                <button key={a.id} onClick={() => abrirAnalisis(a)}
                  className="grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2.5 items-center rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-orange-500/40 px-3 py-2.5 text-left transition">
                  <span aria-hidden="true" className="w-2 h-2 rounded-full bg-sky-300" />
                  <span className="min-w-0">
                    <span className="block text-[13px] truncate">{a.titulo}</span>
                    <span className="block text-[11px] text-gray-500">{fechaLarga(a.fecha)} · {DE_VISTA[a.vista]} · {cuantos(fotosLista.filter(f => f.id_analisis === a.id).length)}</span>
                  </span>
                  <span className="text-[12px] text-gray-400">Abrir</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-500 leading-snug">
            Van aparte de las baterías: no tienen total ni comparación automática, porque cada uno mide lo que quieras. Dentro de uno puedes ponerlo al lado de otro. Solo los ves tú.
            {externaPosible && <> Los de gente que no es de tu equipo, en <Link href="/tests?sueltos=1" className="text-sky-300 hover:text-white underline decoration-dotted underline-offset-4">tus análisis sueltos</Link>.</>}
          </p>
        </div>
      ))}

      {nuevo && (
        <NuevoAnalisisLibre deportista={{ id: idDeportista, nombre: nombre || 'Este deportista', permiso }} externaPosible={externaPosible}
          onCreado={alCrear} onCerrar={() => setNuevo(false)} />
      )}

      {visor && abierto && (
        <Analizador modo="libre" analisis={abierto} nombreDeportista={nombre} yaGuardados={fotos.length}
          idDeportista={idDeportista} permiso={permiso} urls={urls}
          onFotograma={alGuardarFotograma} onNotas={n => { cambiarEnLista(abierto.id, { notas: n }); setNotas(n ?? '') }}
          onInforme={abrirInforme} onCerrar={() => setVisor(false)} />
      )}

      {informe && abierto && (
        <InformeLibre analisis={abierto} nombre={nombre} fotogramas={fotos} urls={urls} locales={locales}
          marcadas={informe.marcadas} cargando={cargandoFotos} onCerrar={() => setInforme(null)} />
      )}

      {borrando && abierto && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] px-4"
          onClick={e => { if (e.target === e.currentTarget && !ocupado) setBorrando(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="borrar-libre-titulo" className="bg-gray-900 rounded-2xl p-6 border border-gray-700 w-full max-w-md">
            <h3 id="borrar-libre-titulo" className="font-bold text-lg mb-2">
              {borrando.tipo === 'analisis' ? '¿Borrar «' + abierto.titulo + '»?' : '¿Borrar el fotograma ' + borrando.n + '?'}
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              {borrando.tipo === 'analisis'
                ? 'Se borran sus ' + cuantos(fotos.length) + ', con sus imágenes y medidas, y tus notas. No se puede deshacer.'
                : 'Se borra con su imagen y sus medidas. No se puede deshacer.'}
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setBorrando(null)} disabled={ocupado}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm transition disabled:opacity-40">Cancelar</button>
              <button onClick={confirmarBorrado} disabled={ocupado}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-40">
                {ocupado ? 'Borrando…' : 'Borrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
