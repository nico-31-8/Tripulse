'use client'
// ============================================================
// El informe de una batería de movimiento, para descargar o imprimir
// ============================================================
//
// v3 del analizador, paso 2 (17-10-2026). SOLO PARA EL ENTRENADOR: se abre desde
// la pestaña Movimiento de Tests y no sale en Mis tests del deportista; si se lo
// manda, lo decide el entrenador. Lo que dice lo arma lib/informe-movimiento;
// aquí van la hoja y la pregunta de qué gráficas incluir (ninguna, de entrada).
//
// SE IMPRIME CON EL NAVEGADOR. «Descargar en PDF o imprimir» abre su ventana de
// imprimir y ahí se elige «Guardar como PDF»: no hay librería de PDF y nada sale
// del dispositivo. Para que en el papel salga solo la hoja, el informe cuelga de
// <body> (un portal) y su CSS de impresión esconde todo lo demás. Ese CSS va aquí
// mismo, en un <style>: Vercel puede servir el globals.css viejo.
//
// Las curvas pesan y las listas no las traen: se piden al abrir (cargarMedidas),
// con enlaces nuevos de los fotogramas (los de la pestaña caducan a la hora).

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { resultadoBateria, type DefBateria } from '@/lib/baterias-movimiento'
import { cargarMedidas, urlsFotogramas, type FilaPrueba, type Medida, type Valoracion } from '@/lib/movimiento-datos'
import {
  cambiosDesde, enLista, enSegundos, faltanDe, filasDelInforme, fotogramasDelInforme, graficasDisponibles, grados, LIENZO,
  QUE_ES_EL_SIGNO, queTrabajar, textoCambios, textoDolores, textoTambien, trazadoDe, type GraficaDisponible,
} from '@/lib/informe-movimiento'
import { NOMBRE_FIABILIDAD } from '@/lib/cuerpo'
import { fechaConAnio, fechaCorta } from '@/lib/fechas'

/** La tinta de cada nota, en papel. */
const TINTA: Record<number, string> = { 3: '#15803d', 2: '#b45309', 1: '#b91c1c', 0: '#b91c1c' }
const NARANJA = '#ea580c'

const CSS = `
.hoja-informe { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body { padding: 0 !important; }
  body > *:not(.informe-raiz) { display: none !important; }
  .informe-raiz { position: static !important; overflow: visible !important; background: #fff !important; }
  .informe-raiz .informe-flujo { display: block !important; padding: 0 !important; }
  .informe-raiz .no-imprimir { display: none !important; }
  .informe-raiz .hoja-informe { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; }
  .informe-raiz .sin-cortar { break-inside: avoid; }
}
`

/** «0,5 s», «2 s»: las marcas del eje del tiempo. */
const marcaTiempo = (t: number) => String(Math.round(t * 10) / 10).replace('.', ',') + ' s'
const nombreLado = (l: string) => (l === 'izq' ? ' · izquierda' : l === 'der' ? ' · derecha' : '')

/** Espera a las fuentes y a las imágenes de la hoja (hasta 5 s): si no, el papel sale con huecos. */
async function listaParaImprimir(hoja: HTMLElement | null) {
  const imagenes = hoja ? [...hoja.querySelectorAll('img')].filter(i => !i.complete) : []
  const cargadas = Promise.all(imagenes.map(i => new Promise<void>(res => { i.onload = i.onerror = () => res() })))
  await Promise.race([Promise.all([document.fonts?.ready, cargadas]), new Promise(res => setTimeout(res, 5000))])
}

function GraficaInforme({ g }: { g: GraficaDisponible }) {
  const t = trazadoDe(g.serie)
  if (!t) return null
  const { ancho, alto, izq, der, abajo } = LIENZO
  /* El valor junto a su punto; si cae pegado al borde derecho, a su izquierda. */
  const valor = (p: { x: number; y: number; v: number }, encima: boolean) => {
    const pegado = p.x > der - 44
    return (
      <text x={pegado ? p.x - 7 : p.x + 7} y={encima ? p.y - 7 : p.y + 15} textAnchor={pegado ? 'end' : 'start'}
        fontSize="10.5" fontWeight="600" fill="#c2410c" fontFamily="var(--font-geist-mono), ui-monospace, monospace">{grados(p.v)}</text>
    )
  }
  return (
    <figure className="sin-cortar m-0 rounded-lg border border-[#e3e5ea] px-3 pt-2.5 pb-1.5 flex flex-col gap-1">
      <figcaption className="text-[11.5px] leading-snug text-[#4b5160]">
        <b className="text-[#16181d]">{g.nombrePrueba}{nombreLado(g.lado)} · {g.nombre.toLowerCase()} a lo largo del vídeo</b>
        {' · '}mín. {grados(g.min.v)} a los {enSegundos(g.min.t)} · máx. {grados(g.max.v)} a los {enSegundos(g.max.t)}
        {g.fiabilidad !== 'fiable' && (
          <span className={'ml-1.5 inline-block rounded-full px-1.5 text-[10px] font-semibold text-[#92400e] bg-[#fef3c7] '
            + (g.fiabilidad === 'sin_comprobar' ? 'border border-dashed border-[#d97706]' : '')}>{NOMBRE_FIABILIDAD[g.fiabilidad]}</span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full h-auto" role="img"
        aria-label={`${g.nombre} a lo largo del vídeo: ${g.texto}`}>
        <g stroke="#eceef2" strokeWidth="1">
          {t.ejeY.map(m => <line key={m.v} x1={izq} x2={der} y1={m.y} y2={m.y} />)}
        </g>
        <g fill="#6b7280" fontSize="10" textAnchor="end" fontFamily="var(--font-geist-mono), ui-monospace, monospace">
          {t.ejeY.map(m => <text key={m.v} x={izq - 6} y={m.y + 3.5}>{grados(m.v)}</text>)}
        </g>
        <g fill="#8a909c" fontSize="10" textAnchor="middle" fontFamily="var(--font-geist-mono), ui-monospace, monospace">
          {t.ejeX.map(m => <text key={m.t} x={m.x} y={abajo + 18}>{marcaTiempo(m.t)}</text>)}
        </g>
        {t.tramos.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={NARANJA} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        <circle cx={t.min.x} cy={t.min.y} r="3.8" fill={NARANJA} />
        <circle cx={t.max.x} cy={t.max.y} r="3.8" fill="#fff" stroke={NARANJA} strokeWidth="2" />
        {valor(t.min, true)}
        {valor(t.max, false)}
      </svg>
      {(QUE_ES_EL_SIGNO[g.clave] || g.fiabilidad === 'sin_comprobar') && (
        <p className="m-0 text-[10.5px] text-[#6b7280]">
          {[QUE_ES_EL_SIGNO[g.clave], g.fiabilidad === 'sin_comprobar'
            ? 'No sale en los estudios en que se basa la app: sirve para ver cómo cambia a lo largo del movimiento, no para fiarse del número exacto.'
            : ''].filter(Boolean).join(' ')}
        </p>
      )}
    </figure>
  )
}

export default function InformeMovimiento({ def, valoracion, registros, previa, nombre, permiso, urls: urlsDeAntes, onCerrar }: {
  def: DefBateria
  valoracion: Valoracion
  /** Sus pruebas. Las medidas se cargan al abrir; las que ya traigan valen mientras tanto (o si no hay en la base). */
  registros: FilaPrueba[]
  /** La anterior completa de la misma batería, para comparar. */
  previa: { valoracion: Valoracion; registros: FilaPrueba[] } | null
  nombre: string | null
  /** Si dio permiso para guardar imágenes: sin él no hay fotogramas, y se dice por qué. */
  permiso: boolean
  /** Los enlaces de los fotogramas que ya se tengan: se enseñan ya y se renuevan al abrir. */
  urls?: Record<string, string>
  onCerrar: () => void
}) {
  const [medidas, setMedidas] = useState<Record<number, Medida[]> | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>(() => urlsDeAntes ?? {})
  const [error, setError] = useState('')
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set())
  const [preparando, setPreparando] = useState(false)
  const hojaRef = useRef<HTMLElement>(null)

  const rutas = registros.map(r => r.fotograma || '').filter(Boolean)
  const claveRutas = rutas.join('|')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [m, u] = await Promise.all([cargarMedidas(supabase, valoracion.id), urlsFotogramas(supabase, claveRutas ? claveRutas.split('|') : [])])
      if (!vivo) return
      if (m.error) setError('No se han podido cargar las gráficas: ' + m.error)
      setMedidas(m.medidas)
      setUrls(antes => ({ ...antes, ...u }))
    })()
    return () => { vivo = false }
  }, [valoracion.id, claveRutas])

  /* Escape cierra. */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const conMedidas = useMemo(
    () => (medidas ? registros.map(r => ({ ...r, medidas: medidas[r.id] ?? r.medidas ?? null })) : registros),
    [registros, medidas],
  )
  const graficas = useMemo(() => (medidas ? graficasDisponibles(def, conMedidas) : []), [def, conMedidas, medidas])
  const grupos = useMemo(() => {
    const out: { clave: string; titulo: string; graficas: GraficaDisponible[] }[] = []
    for (const g of graficas) {
      const clave = g.prueba + '|' + g.lado
      let grupo = out.find(x => x.clave === clave)
      if (!grupo) out.push(grupo = { clave, titulo: g.nombrePrueba + nombreLado(g.lado), graficas: [] })
      grupo.graficas.push(g)
    }
    return out
  }, [graficas])

  const res = resultadoBateria(def, registros)
  const ant = previa ? resultadoBateria(def, previa.registros) : null
  const delta = ant && ant.completa && res.completa ? res.total - ant.total : null
  const trabajo = queTrabajar(def, registros)
  const cambios = cambiosDesde(def, registros, previa?.registros ?? null)
  const filas = filasDelInforme(def, registros, previa?.registros ?? null)
  const faltan = faltanDe(def, registros)
  const fotos = fotogramasDelInforme(def, conMedidas).filter(f => urls[f.ruta])
  const incluidas = graficas.filter(g => elegidas.has(g.id))
  const fechaAntes = previa ? fechaConAnio(previa.valoracion.fecha) : ''

  const alternar = (id: string) => setElegidas(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const imprimir = async () => {
    setPreparando(true)
    await listaParaImprimir(hojaRef.current)
    setPreparando(false)
    /* El título es el nombre que propone el PDF al guardarlo. */
    const antes = document.title
    document.title = ['Informe', def.nombre, nombre, valoracion.fecha].filter(Boolean).join(' · ')
    const volver = () => { document.title = antes; window.removeEventListener('afterprint', volver) }
    window.addEventListener('afterprint', volver)
    window.print()
  }

  /* Solo se abre al pulsar, ya en el navegador: nunca se pinta en el servidor. */
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="informe-raiz fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-gray-950/95 text-white"
      role="dialog" aria-modal="true" aria-label={'Informe del ' + def.nombre}>
      <style>{CSS}</style>
      <div className="informe-flujo min-h-full px-4 py-5 sm:p-6 flex flex-col gap-5 lg:flex-row-reverse lg:items-start lg:justify-center">

        {/* ── la pregunta: qué gráficas, y descargar ── */}
        <aside className="no-imprimir w-full lg:w-[320px] lg:sticky lg:top-6 flex flex-col gap-3 shrink-0">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 flex flex-col gap-3">
            <div>
              <p className="text-[14px] font-bold">¿Qué gráficas van en el informe?</p>
              <p className="text-[12px] text-gray-400 mt-0.5 leading-snug">Las de las pruebas analizadas de perfil con el esqueleto. Marca las que quieras; ninguna también vale.</p>
            </div>
            {!medidas && !error && <p className="text-[12px] text-gray-500">Cargando las gráficas…</p>}
            {error && <p className="text-[12px] text-red-300" role="alert">{error}</p>}
            {medidas && !error && !graficas.length && (
              <p className="text-[12px] text-gray-500 leading-snug">Ninguna prueba de este {def.nombre} tiene gráfica. Salen al analizar una prueba de perfil con el esqueleto y guardarla.</p>
            )}
            {grupos.map(gr => (
              <div key={gr.clave} className="flex flex-col gap-1.5">
                <p className="text-[11px] uppercase tracking-wider text-gray-500">{gr.titulo}</p>
                {gr.graficas.map(g => (
                  <label key={g.id} className="flex items-start gap-2.5 cursor-pointer text-[12.5px]">
                    <input type="checkbox" checked={elegidas.has(g.id)} onChange={() => alternar(g.id)}
                      className="mt-0.5 w-4 h-4 accent-orange-500 shrink-0" />
                    <span className="min-w-0">
                      {g.nombre}
                      {g.fiabilidad !== 'fiable' && (
                        <span className={'ml-1.5 text-[10.5px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 whitespace-nowrap '
                          + (g.fiabilidad === 'sin_comprobar' ? 'border border-dashed border-amber-400/60' : '')}>{NOMBRE_FIABILIDAD[g.fiabilidad]}</span>
                      )}
                      <span className="block text-[11px] text-gray-500 font-mono">{g.texto}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={imprimir} disabled={preparando} autoFocus
                className="text-[13px] px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold transition disabled:opacity-60">
                {preparando ? 'Preparando…' : 'Descargar en PDF o imprimir'}
              </button>
              <button onClick={onCerrar} className="text-[13px] px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">Cerrar</button>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug">Se abre la ventana de imprimir del navegador: para el PDF, elige «Guardar como PDF» como destino.</p>
          </div>
          <p className="text-[11.5px] text-gray-400 leading-snug rounded-xl border border-dashed border-gray-700 px-3 py-2.5">
            <b className="text-gray-200">Solo lo ves tú.</b> No sale en la ficha del deportista ni en sus tests: lo descargas y, si quieres, se lo mandas.
          </p>
        </aside>

        {/* ── la hoja: lo que se imprime ── */}
        <article ref={hojaRef}
          className="hoja-informe w-full max-w-[820px] rounded-md bg-[#fdfdfc] text-[#16181d] shadow-2xl px-5 py-6 sm:px-10 sm:py-9 flex flex-col gap-6 text-[12.5px] leading-normal">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-[#16181d] pb-3.5">
            <div className="min-w-0">
              <p className="text-[12px] font-bold tracking-[0.04em]" style={{ color: NARANJA }}>TRIPULSE</p>
              <h2 className="text-[22px] font-bold tracking-tight mt-1 mb-0.5">Informe · {def.nombre}</h2>
              <p className="text-[#5b6170]">
                {[nombre, fechaConAnio(valoracion.fecha), valoracion.modo === 'video' ? 'analizado en vídeo' : 'apuntado a mano'].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[38px] font-bold leading-none tracking-tight">
                {res.total}<span className="text-[17px] font-medium text-[#6b7280]"> {res.completa ? '/ ' : 'de '}{res.maximo}</span>
              </p>
              {delta != null && (
                <p className={'text-[12px] font-semibold mt-1 ' + (delta > 0 ? 'text-[#15803d]' : delta < 0 ? 'text-[#b91c1c]' : 'text-[#5b6170]')}>
                  {delta === 0 ? 'Igual que el ' + fechaAntes : (delta > 0 ? '+' : '') + delta + ' desde el ' + fechaAntes}
                </p>
              )}
            </div>
          </header>

          {faltan.length > 0 && (
            <p className="sin-cortar rounded-md bg-[#fef3c7] text-[#78350f] px-3 py-2">
              <b>A medias:</b> falta{faltan.length > 1 ? 'n' : ''} {enLista(faltan.map(n => n.charAt(0).toLowerCase() + n.slice(1)))}. El total de verdad sale cuando estén todas.
            </p>
          )}

          <section className="grid gap-6 sm:grid-cols-2">
            <div className="sin-cortar">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Lo que hay que trabajar</h3>
              {trabajo.puntos.length === 0 ? (
                <p className="m-0">
                  {res.completa ? 'Todas las pruebas a 3: nada por debajo.' : res.hechas ? 'Nada por debajo de 3 en las pruebas hechas.' : 'Todavía no hay ninguna prueba puntuada.'}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {trabajo.puntos.map(p => (
                    <div key={p.prueba} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
                      <span className="w-[22px] h-[22px] rounded-md grid place-items-center font-mono text-[12px] font-bold text-white"
                        style={{ background: TINTA[p.nota] }} aria-label={'Nota ' + p.nota}>{p.nota}</span>
                      <p className="m-0"><b>{p.titulo}.</b> {p.detalle}</p>
                    </div>
                  ))}
                  {trabajo.tambien.length > 0 && <p className="m-0 text-[#5b6170]">{textoTambien(trabajo.tambien)}</p>}
                </div>
              )}
            </div>
            <div className="sin-cortar">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Lo que ha cambiado</h3>
              {!previa ? (
                <p className="m-0">No hay otro {def.nombre} completo anterior con el que comparar.</p>
              ) : !cambios.suben.length && !cambios.bajan.length ? (
                <p className="m-0">Todas las pruebas igual que el {fechaAntes}.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {cambios.suben.length > 0 && <p className="m-0"><b className="text-[#15803d]">Suben</b> desde el {fechaAntes}: {textoCambios(cambios.suben)}.</p>}
                  {cambios.bajan.length > 0 && <p className="m-0"><b className="text-[#b91c1c]">Bajan</b>{cambios.suben.length ? '' : ' desde el ' + fechaAntes}: {textoCambios(cambios.bajan)}.</p>}
                </div>
              )}
              <p className="m-0 mt-2 text-[#5b6170]">{textoDolores(def, registros)}</p>
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Prueba a prueba</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px] text-[#16181d]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-[0.04em] text-[#5b6170]">
                    <th className="text-left font-semibold border-b border-[#d4d7de] px-1 py-1.5">Prueba</th>
                    <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-12">Izq</th>
                    <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-12">Der</th>
                    <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-12">Nota</th>
                    {previa && <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-14 whitespace-nowrap">{fechaCorta(previa.valoracion.fecha)}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(x => (
                    <tr key={x.prueba} className="sin-cortar">
                      <td className="border-b border-[#eceef2] px-1 py-1.5">
                        {x.nombre}{x.porDolor && <span className="text-[10.5px] text-[#b91c1c] font-semibold"> · duele</span>}
                      </td>
                      {x.bilateral ? (
                        <>
                          <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono font-bold" style={{ color: x.izq != null ? TINTA[x.izq] : '#8a909c' }}>{x.izq ?? '—'}</td>
                          <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono font-bold" style={{ color: x.der != null ? TINTA[x.der] : '#8a909c' }}>{x.der ?? '—'}</td>
                        </>
                      ) : (
                        <td colSpan={2} className="border-b border-[#eceef2] px-1 py-1.5 text-center text-[11px] text-[#8a909c]">un solo lado</td>
                      )}
                      <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono font-bold" style={{ color: x.nota != null ? TINTA[x.nota] : '#8a909c' }}>{x.nota ?? '—'}</td>
                      {previa && <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono text-[#8a909c]">{x.antes ?? '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 mt-1.5 text-[11px] text-[#6b7280]">Cada prueba de 0 a 3. En las de dos lados cuenta el peor; si duele, es un 0.</p>
          </section>

          {incluidas.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] m-0">Gráficas</h3>
              {incluidas.map(g => <GraficaInforme key={g.id} g={g} />)}
            </section>
          )}

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Fotogramas</h3>
            {fotos.length === 0 && !medidas ? (
              <p className="m-0 text-[#5b6170]">Cargando los fotogramas…</p>
            ) : fotos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {fotos.map(f => (
                  <figure key={f.ruta} className="sin-cortar m-0 flex flex-col gap-1.5 text-[10.5px] text-[#4b5160]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[f.ruta]} alt={f.titulo} className="w-full h-auto rounded-md border border-[#e3e5ea] bg-[#0b0f14]" />
                    <figcaption>
                      <b className="text-[#16181d]">{f.titulo} · {f.nota ?? '—'}</b>
                      {f.texto && <span className="block">{f.texto}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[#5b6170]">
                {rutas.length ? 'No se han podido cargar los fotogramas: cierra el informe y vuelve a abrirlo.'
                  : permiso ? 'No se guardó ningún fotograma de este ' + def.nombre + '.'
                  : 'Sin fotogramas: para guardarlos hace falta su permiso, que se marca en esta pestaña.'}
              </p>
            )}
          </section>

          <footer className="border-t border-[#d4d7de] pt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10.5px] text-[#6b7280]">
            <span className="max-w-[60ch]">
              Para seguir a la persona consigo misma, no para predecir lesiones: el total sirve para compararla con el mismo evaluador, y que estas baterías prevengan lesiones está sin demostrar
              {def.id === 'fms' ? ' (con el FMS, el corte en 14 deja pasar a tres de cada cuatro futuros lesionados)' : ''}. Criterios: {def.fuente}
            </span>
            <span>tripulse.app</span>
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  )
}
