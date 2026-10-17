'use client'
// ============================================================
// Lo que comparten los informes del analizador
// ============================================================
//
// El informe de una batería (InformeMovimiento) y el de un análisis libre
// (InformeLibre) son la misma hoja con distinto contenido. Aquí, lo común: el
// marco que se imprime, la pregunta de qué gráficas incluir y la gráfica en
// papel.
//
// SE IMPRIME CON EL NAVEGADOR. «Descargar en PDF o imprimir» abre su ventana de
// imprimir y ahí se elige «Guardar como PDF»: no hay librería de PDF y nada sale
// del dispositivo. Para que en el papel salga solo la hoja, el informe cuelga de
// <body> (un portal) y su CSS de impresión esconde todo lo demás. Ese CSS va aquí
// mismo, en un <style>: Vercel puede servir el globals.css viejo.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { enSegundos, grados, LIENZO, QUE_ES_EL_SIGNO, trazadoDe, type GraficaDisponible } from '@/lib/informe-movimiento'
import { NOMBRE_FIABILIDAD } from '@/lib/cuerpo'

/** La tinta de cada nota, en papel. */
export const TINTA: Record<number, string> = { 3: '#15803d', 2: '#b45309', 1: '#b91c1c', 0: '#b91c1c' }
export const NARANJA = '#ea580c'

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
export const nombreLado = (l: string) => (l === 'izq' ? ' · izquierda' : l === 'der' ? ' · derecha' : '')

/** Espera a las fuentes y a las imágenes de la hoja (hasta 5 s): si no, el papel sale con huecos. */
async function listaParaImprimir(hoja: HTMLElement | null) {
  const imagenes = hoja ? [...hoja.querySelectorAll('img')].filter(i => !i.complete) : []
  const cargadas = Promise.all(imagenes.map(i => new Promise<void>(res => { i.onload = i.onerror = () => res() })))
  await Promise.race([Promise.all([document.fonts?.ready, cargadas]), new Promise(res => setTimeout(res, 5000))])
}

/** Una gráfica guardada, en papel: la curva con sus huecos, los ejes y el mínimo y el máximo. */
export function GraficaInforme({ g, titulo }: { g: GraficaDisponible; titulo?: string }) {
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
        <b className="text-[#16181d]">{titulo ?? g.nombrePrueba + nombreLado(g.lado) + ' · ' + g.nombre.toLowerCase() + ' a lo largo del vídeo'}</b>
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

/**
 * La pregunta de qué gráficas incluir: las guardadas, agrupadas (por prueba y
 * lado en una batería, por vídeo en un análisis libre), cada una con cuánto
 * fiarse. Marcar ninguna también vale.
 */
export function PreguntaGraficas({ graficas, elegidas, onAlternar, cargando, error, vacio }: {
  graficas: GraficaDisponible[]
  elegidas: Set<string>
  onAlternar: (id: string) => void
  cargando: boolean
  error: string
  /** Lo que se dice cuando no hay ninguna. */
  vacio: string
}) {
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
  return (
    <>
      <div>
        <p className="text-[14px] font-bold">¿Qué gráficas van en el informe?</p>
        <p className="text-[12px] text-gray-400 mt-0.5 leading-snug">Las de lo analizado de perfil con el esqueleto. Marca las que quieras; ninguna también vale.</p>
      </div>
      {cargando && !error && <p className="text-[12px] text-gray-500">Cargando las gráficas…</p>}
      {error && <p className="text-[12px] text-red-300" role="alert">{error}</p>}
      {!cargando && !error && !graficas.length && <p className="text-[12px] text-gray-500 leading-snug">{vacio}</p>}
      {grupos.map(gr => (
        <div key={gr.clave} className="flex flex-col gap-1.5">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">{gr.titulo}</p>
          {gr.graficas.map(g => (
            <label key={g.id} className="flex items-start gap-2.5 cursor-pointer text-[12.5px]">
              <input type="checkbox" checked={elegidas.has(g.id)} onChange={() => onAlternar(g.id)}
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
    </>
  )
}

/** Las elegidas, con su conjunto y cómo marcar o desmarcar una. */
export function useElegidas(iniciales: string[] = []) {
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(iniciales))
  const alternar = (id: string) => setElegidas(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  return { elegidas, alternar }
}

/**
 * El marco del informe: el portal con su CSS de impresión, el panel de la
 * derecha (la pregunta, descargar y cerrar) y la hoja, que es lo que se imprime.
 */
export function MarcoInforme({ etiqueta, tituloPdf, pregunta, onCerrar, children }: {
  /** Para quien no ve la pantalla: «Informe del FMS». */
  etiqueta: string
  /** El nombre que propone el PDF al guardarlo. */
  tituloPdf: string
  /** Lo de arriba del panel: la pregunta de qué gráficas incluir. */
  pregunta: ReactNode
  onCerrar: () => void
  /** La hoja. */
  children: ReactNode
}) {
  const [preparando, setPreparando] = useState(false)
  const hojaRef = useRef<HTMLElement>(null)

  /* Escape cierra. */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const imprimir = async () => {
    setPreparando(true)
    await listaParaImprimir(hojaRef.current)
    setPreparando(false)
    const antes = document.title
    document.title = tituloPdf
    const volver = () => { document.title = antes; window.removeEventListener('afterprint', volver) }
    window.addEventListener('afterprint', volver)
    window.print()
  }

  /* Solo se abre al pulsar, ya en el navegador: nunca se pinta en el servidor. */
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="informe-raiz fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-gray-950/95 text-white"
      role="dialog" aria-modal="true" aria-label={etiqueta}>
      <style>{CSS}</style>
      <div className="informe-flujo min-h-full px-4 py-5 sm:p-6 flex flex-col gap-5 lg:flex-row-reverse lg:items-start lg:justify-center">
        <aside className="no-imprimir w-full lg:w-[320px] lg:sticky lg:top-6 flex flex-col gap-3 shrink-0">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 flex flex-col gap-3">
            {pregunta}
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
        <article ref={hojaRef}
          className="hoja-informe w-full max-w-[820px] rounded-md bg-[#fdfdfc] text-[#16181d] shadow-2xl px-5 py-6 sm:px-10 sm:py-9 flex flex-col gap-6 text-[12.5px] leading-normal">
          {children}
        </article>
      </div>
    </div>,
    document.body,
  )
}
