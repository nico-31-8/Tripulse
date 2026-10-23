'use client'
// ============================================================
// Las piezas de pantalla de un vídeo del visor
// ============================================================
//
// Lo que se ve de UN vídeo: la caja con el vídeo y el dibujo encima, lo que va
// encima de ella (detectar el cuerpo, cambiar de vídeo), los mandos de debajo y
// los paneles del lateral (medidas, cuánto fiarse, correcciones, gráficas).
// Salieron del visor (Analizador) el 22-10-2026 para poder tener dos vídeos;
// el estado de cada uno vive en useVideoAnalisis.
//
// LOS MANDOS (`Mando`). Con un vídeo, o con dos sin alinear, mueven el vídeo
// que se está mirando. Con dos alineados, el visor les pasa unos que mueven
// los dos a la vez.

import { useEffect, useRef, type ReactNode } from 'react'
import { DE_VISTA, type Lado, type Prueba } from '@/lib/baterias-movimiento'
import type { TipoTrazo } from '@/lib/movimiento-datos'
import { textoValor } from '@/lib/trazos-fotograma'
import { claveDe, extremosDe } from '@/lib/pista-trazos'
import { MEDIDAS_GRAFICA, NOMBRE_CORTO, NOMBRE_FIABILIDAD, fiabilidadDe, nombrePunto, type ClaveGrafica, type Fiabilidad, type LadoCuerpo } from '@/lib/cuerpo'
import { factorRueda, pasosRueda, ZOOM_MAX } from '@/lib/zoom-visor'
import { NARANJA, REF } from './pintar-fotograma'
import { FPS, LADO_CUERPO, MINIMO_SERIE, segundos, VELOCIDADES, type Serie, type VideoAnalisis } from './useVideoAnalisis'

/** Primera letra en mayúscula: «De perfil», «Desde atrás». */
export const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** El color de cada medida del esqueleto según cuánto fiarse. */
const COLOR_FIABILIDAD: Record<Fiabilidad, string> = {
  fiable: 'text-green-300', margen: 'text-amber-300', sin_comprobar: 'text-amber-300', no: 'text-gray-500',
}
const PASTILLA_FIABILIDAD: Record<Fiabilidad, string> = {
  fiable: 'bg-green-500/15 text-green-300', margen: 'bg-amber-500/15 text-amber-300',
  sin_comprobar: 'bg-amber-500/10 text-amber-300 border border-dashed border-amber-400/60', no: 'bg-red-500/15 text-red-300',
}

/** Lo que mueven los mandos: el vídeo que se mira, o los dos a la vez si están alineados. */
export interface Mando {
  paso: (n: number) => void
  alternar: () => void
  irA: (k: number) => void
  cambiarVel: (x: number) => void
  enMarcha: boolean
  /** Mientras se busca el cuerpo o se sigue una corrección, el vídeo es suyo: los mandos se quedan quietos. */
  ocupado: boolean
}

/** Los mandos de un vídeo solo. */
export const mandoDe = (v: VideoAnalisis): Mando => ({
  paso: v.paso, alternar: v.alternar, irA: v.irA, cambiarVel: v.cambiarVel, enMarcha: v.enMarcha, ocupado: v.ocupadoVisor,
})

/** De un mínimo y un máximo a la altura en la gráfica (0 arriba, 100 abajo), con un poco de aire. */
const escalaDe = (e: { min: { valor: number }; max: { valor: number } }) => {
  const holgura = Math.max(1, (e.max.valor - e.min.valor) * 0.12)
  const v0 = e.min.valor - holgura, v1 = e.max.valor + holgura
  return (v: number) => (1 - (v - v0) / (v1 - v0)) * 100
}

/**
 * El valor de un trazo seguido a lo largo del vídeo: la línea, el mínimo, el
 * máximo y dónde estás. Con `extra`, otra medida encima, en azul y con su propia
 * escala: lo que se compara es cuándo se mueve cada una, no sus grados.
 */
export function GraficaRecorrido({ nombre, tipo, serie, clave, onIr, extra }: {
  nombre: string
  tipo: TipoTrazo
  serie: Serie
  clave: number
  onIr: (clave: number) => void
  extra?: { nombre: string; serie: Serie }
}) {
  const ext = extremosDe(serie)
  if (!ext) return null
  const extE = extra ? extremosDe(extra.serie) : null
  const todas = extra && extE ? [...serie, ...extra.serie] : serie
  const k0 = Math.min(...todas.map(s => s.clave)), k1 = Math.max(...todas.map(s => s.clave))
  const X = (k: number) => ((k - k0) / Math.max(1, k1 - k0)) * 100
  const Y = escalaDe(ext)
  const YE = extE ? escalaDe(extE) : null
  const ahora = serie.find(s => s.clave === clave)
  const ahoraE = extra?.serie.find(s => s.clave === clave)
  const dentro = clave >= k0 && clave <= k1
  const alPulsar = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const k = k0 + ((e.clientX - r.left) / r.width) * (k1 - k0)
    let mejor = todas[0]
    for (const s of todas) if (Math.abs(s.clave - k) < Math.abs(mejor.clave - k)) mejor = s
    onIr(mejor.clave)
  }
  const extremo = (lbl: string, s: { clave: number; valor: number }, azul = false) => (
    <button onClick={() => onIr(s.clave)} title={'Ir a ese fotograma'}
      className="flex items-baseline gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-gray-800 transition text-left">
      <span className="text-gray-500">{lbl}</span>
      <b className={'font-mono ' + (azul ? 'text-sky-300' : 'text-orange-300')}>{textoValor(tipo, s.valor)}</b>
      <span className="font-mono text-gray-500">{segundos(s.clave / FPS)}</span>
      <span className="text-gray-400 underline decoration-dotted underline-offset-2">ir</span>
    </button>
  )
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-[12.5px]">
        <span className="text-gray-400">{nombre}</span>
        <span className="font-mono text-orange-300">{ahora ? textoValor(tipo, ahora.valor) : '—'}</span>
      </div>
      {extra && (
        <div className="flex justify-between gap-3 text-[12.5px] -mt-1">
          <span className="text-gray-400">{extra.nombre}</span>
          <span className="font-mono text-sky-300">{ahoraE ? textoValor(tipo, ahoraE.valor) : '—'}</span>
        </div>
      )}
      <div onClick={alPulsar} role="presentation" title="Pulsa para ir a ese momento"
        className={'relative rounded-lg bg-black/40 border border-gray-800 cursor-pointer ' + (extra ? 'h-20' : 'h-16')}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <polyline fill="none" stroke={NARANJA} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round"
            points={serie.map(s => X(s.clave).toFixed(2) + ',' + Y(s.valor).toFixed(2)).join(' ')} />
          {extra && YE && (
            <polyline fill="none" stroke={REF} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round"
              points={extra.serie.map(s => X(s.clave).toFixed(2) + ',' + YE(s.valor).toFixed(2)).join(' ')} />
          )}
          {dentro && <line x1={X(clave)} x2={X(clave)} y1="0" y2="100" stroke="#e5e7eb" strokeOpacity="0.55" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {[ext.min, ext.max].map((s, i) => (
          <span key={i} className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full border border-black" aria-hidden="true"
            style={{ left: X(s.clave) + '%', top: Y(s.valor) + '%', background: i ? '#fdba74' : NARANJA }} />
        ))}
        {extE && YE && [extE.min, extE.max].map((s, i) => (
          <span key={'e' + i} className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full border border-black" aria-hidden="true"
            style={{ left: X(s.clave) + '%', top: YE(s.valor) + '%', background: i ? '#bae6fd' : REF }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px]">
        {extremo('mín.', ext.min)}
        {extremo('máx.', ext.max)}
      </div>
      {extE && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px]">
          {extremo('mín.', extE.min, true)}
          {extremo('máx.', extE.max, true)}
        </div>
      )}
    </div>
  )
}

/** El esqueleto: detectarlo, ver cómo va la búsqueda, o enseñarlo y esconderlo. */
export function BotonesCuerpo({ v }: { v: VideoAnalisis }) {
  const { nat, siguiendoCuerpo, deteccion } = v
  if (!nat) return null
  if (siguiendoCuerpo) {
    return (
      <span className="flex items-center gap-2 text-[12px] text-orange-200" role="status">
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
        Siguiendo {nombrePunto(siguiendoCuerpo.punto).toLowerCase()} · fotograma {siguiendoCuerpo.clave}
        <button onClick={v.pararSeguimiento}
          className="px-2 py-1 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition">Parar</button>
      </span>
    )
  }
  if (deteccion && deteccion.fase !== 'error') {
    return (
      <span className="flex items-center gap-2 text-[12px] text-gray-300" role="status">
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-white animate-pulse" />
        {deteccion.fase === 'buscando' ? `Buscando el cuerpo · ${deteccion.hechos} de ${deteccion.total}`
          : deteccion.fase === 'bajando' && deteccion.total > 0 && deteccion.bajado < deteccion.total
            ? `Bajando el detector (solo la primera vez) · ${Math.round(deteccion.bajado / 1e6)} de ${Math.round(deteccion.total / 1e6)} MB`
            : 'Preparando el detector…'}
        {deteccion.fase === 'buscando' && (
          <button onClick={v.pararDeteccion}
            className="px-2 py-1 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition">Parar</button>
        )}
      </span>
    )
  }
  if (v.hayCuerpo) {
    return (
      <span className="flex items-center gap-2">
        <button onClick={() => v.setVerCuerpo(x => !x)} aria-pressed={v.verCuerpo}
          className={'flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition ' + (v.verCuerpo
            ? 'border-white/40 bg-white/10 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
          <span aria-hidden="true" className={'w-2 h-2 rounded-full ' + (v.verCuerpo ? 'bg-white' : 'bg-gray-600')} />
          Esqueleto
        </button>
        <button onClick={() => void v.detectarCuerpo()} title="Volver a buscar el cuerpo en todo el vídeo (se pierden las correcciones)"
          className="text-[12px] text-gray-500 hover:text-white underline decoration-dotted underline-offset-4">otra vez</button>
      </span>
    )
  }
  return (
    <button onClick={() => void v.detectarCuerpo()}
      title="La app coloca las articulaciones en todo el vídeo y mide sola. Corre en este dispositivo: la primera vez baja el detector (unos 42 MB) y después queda guardado."
      className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-white hover:bg-gray-700 transition">
      <span aria-hidden="true" className="w-2 h-2 rounded-full bg-white" />
      Detectar el cuerpo
    </button>
  )
}

/** «Cambiar de vídeo»: otro archivo para este mismo vídeo. */
export function CambiarVideo({ v }: { v: VideoAnalisis }) {
  return (
    <label className="text-[12px] text-gray-400 hover:text-white cursor-pointer underline decoration-dotted underline-offset-4">
      Cambiar de vídeo
      <input type="file" accept="video/*,image/*" className="sr-only" onChange={e => v.elegirArchivo(e.target.files?.[0])} />
    </label>
  )
}

/** Sin vídeo todavía: elegirlo, con lo que haga falta saber al lado (`ficha`). */
export function EligeVideo({ v, ficha }: { v: VideoAnalisis; ficha?: ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-dashed border-gray-700 p-6 text-center flex flex-col gap-3">
      <p className="text-[15px] font-semibold">Elige el vídeo {DE_VISTA[v.vista]}</p>
      {ficha}
      <p className="text-[12px] text-gray-500">Móvil quieto y recto (el nivel de la cámara ayuda), a la altura de la cadera y a unos 3 m, con el cuerpo entero dentro. También vale una foto.</p>
      <label className="self-center bg-orange-500 hover:bg-orange-400 text-white text-[14px] font-semibold px-5 py-3 rounded-xl cursor-pointer transition">
        Elegir vídeo o foto
        <input type="file" accept="video/*,image/*" className="sr-only" onChange={e => v.elegirArchivo(e.target.files?.[0])} />
      </label>
      <p className="text-[11.5px] text-gray-500">El vídeo no sale de este dispositivo.</p>
    </div>
  )
}

/**
 * La caja del vídeo, con la proporción del vídeo SIEMPRE: el dibujo va encima y se
 * estira con ella. Antes llevaba el alto fijo y el ancho recortado al de la pantalla,
 * y con un vídeo en horizontal en el móvil la caja salía alta y estrecha: el vídeo se
 * veía con bandas negras, pero el dibujo se estiraba a lo alto y no caía encima. Ahora
 * el ancho es el que quepa sin pasarse ni del ancho ni del alto, y el alto sale de él.
 * `altoMax`: lo más alto que puede ser (con dos vídeos a la vez, cada uno algo menos).
 * `children`: lo que va encima, en la caja (la etiqueta de la vista).
 *
 * EL ZOOM Y LA RUEDA (22-10-2026, lib/zoom-visor). Dentro de la caja, el vídeo y
 * el dibujo van en una capa que se escala y se corre; la caja no cambia y
 * recorta. La lupa va fuera de esa capa, para no escalarse con ella. La rueda
 * pasa fotogramas (`onRueda`, que con dos vídeos alineados mueve los dos) y
 * Ctrl + rueda acerca o aleja donde apuntas; se escucha a mano porque React la
 * escucha sin poder frenar el scroll de la página. `zoomOcultoEnMovil`: el
 * vídeo pequeño de la esquina, en el móvil, no lleva los botones.
 */
export function LienzoVideo({ v, altoMax = 'min(68vh, 900px)', children, onRueda, zoomOcultoEnMovil = false }: {
  v: VideoAnalisis
  altoMax?: string
  children?: ReactNode
  onRueda?: (pasos: number) => void
  zoomOcultoEnMovil?: boolean
}) {
  /* Todo sacado de `v` antes de pintar: el compilador de React, al ver una ref
     de `v` en `ref={…}`, toma lo demás de `v` por refs. */
  const {
    media, nat, lupa, zoom, zoomCon, quitarZoom, refVideo, refImagen, refLienzo, refLupa, alPulsar, alMover, alSoltar,
    alCargarVideo, alTiempo, alSaltar, setEnMarcha, alPausar, setErrorVideo, alCargarImagen,
  } = v
  const cajaRef = useRef<HTMLDivElement>(null)
  /** Lo que la rueda lleva girado sin llegar a un fotograma (el panel táctil manda giros pequeños). */
  const acumuladoRef = useRef(0)
  const ruedaRef = useRef<(ev: WheelEvent) => void>(() => {})
  useEffect(() => {
    ruedaRef.current = (ev: WheelEvent) => {
      const caja = cajaRef.current
      if (!caja) return
      const r = caja.getBoundingClientRect()
      if (ev.ctrlKey || ev.metaKey) { zoomCon(factorRueda(ev.deltaY), ev.clientX - r.left, ev.clientY - r.top, r.width, r.height); return }
      const { pasos, resto } = pasosRueda(acumuladoRef.current, ev.deltaY, ev.deltaMode)
      acumuladoRef.current = resto
      if (pasos) onRueda?.(pasos)
    }
  })
  useEffect(() => {
    const caja = cajaRef.current
    if (!caja) return
    const alRodar = (ev: WheelEvent) => { ev.preventDefault(); ruedaRef.current(ev) }
    caja.addEventListener('wheel', alRodar, { passive: false })
    return () => caja.removeEventListener('wheel', alRodar)
  }, [media?.url])
  if (!media) return null
  /** Acercar o alejar con los botones: alrededor del centro. */
  const botonZoom = (factor: number) => {
    const r = cajaRef.current?.getBoundingClientRect()
    if (r) zoomCon(factor, r.width / 2, r.height / 2, r.width, r.height)
  }
  return (
    <div ref={cajaRef} className="relative max-w-full overflow-hidden rounded-lg bg-black" style={nat
      ? { aspectRatio: nat.w + ' / ' + nat.h, width: `min(100%, calc(${altoMax} * ${nat.w / nat.h}))` }
      : { height: altoMax }}>
      <div className="absolute inset-0 origin-top-left"
        style={zoom.z > 1 ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})` } : undefined}>
        {media.tipo === 'video' ? (
          <video ref={refVideo} src={media.url} playsInline muted preload="auto"
            className="absolute inset-0 w-full h-full bg-black object-contain"
            onLoadedMetadata={e => alCargarVideo(e.currentTarget)}
            onTimeUpdate={e => alTiempo(e.currentTarget.currentTime)}
            onSeeked={e => alSaltar(e.currentTarget)}
            onPlay={() => setEnMarcha(true)}
            onPause={e => alPausar(e.currentTarget.currentTime)}
            onError={() => setErrorVideo('Este navegador no puede abrir este vídeo. Prueba desde el móvil con el que se grabó, o grábalo en «más compatible» (H.264).')} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={refImagen} src={media.url} alt="La foto que vas a analizar"
            className="absolute inset-0 w-full h-full bg-black object-contain"
            onLoad={e => alCargarImagen(e.currentTarget)} />
        )}
        {nat && (
          <canvas ref={refLienzo} width={nat.w} height={nat.h}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            style={{ touchAction: 'none' }}
            onPointerDown={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} />
        )}
      </div>
      {lupa && (
        <canvas ref={refLupa} width={240} height={240} aria-hidden="true"
          className="absolute pointer-events-none rounded-full border-2 border-white/80 shadow-lg"
          style={{ width: 120, height: 120, left: Math.max(0, lupa.cx + zoom.x - 140), top: Math.max(0, lupa.cy + zoom.y - 140) }} />
      )}
      {nat && (
        <div className={'absolute right-1.5 bottom-1.5 z-10 flex items-center gap-0.5 rounded-lg bg-black/65 p-0.5 text-[12px] text-gray-200'
          + (zoomOcultoEnMovil ? ' max-lg:hidden' : '')} role="group" aria-label="Zoom">
          <button onClick={() => botonZoom(1 / 1.5)} disabled={zoom.z <= 1} aria-label="Alejar" title="Alejar (Ctrl + rueda)"
            className="w-7 h-7 rounded-md hover:bg-white/10 disabled:opacity-35 transition">−</button>
          <span className="min-w-[2.4rem] text-center font-mono tabular-nums" aria-live="polite">×{zoom.z.toFixed(1).replace('.', ',')}</span>
          <button onClick={() => botonZoom(1.5)} disabled={zoom.z >= ZOOM_MAX} aria-label="Acercar" title="Acercar (Ctrl + rueda)"
            className="w-7 h-7 rounded-md hover:bg-white/10 disabled:opacity-35 transition">+</button>
          {zoom.z > 1 && (
            <button onClick={quitarZoom} title="Volver a ver el vídeo entero" className="px-2 h-7 rounded-md hover:bg-white/10 transition">Ajustar</button>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Los mandos de debajo del vídeo: paso a paso, reproducir, velocidad, seguir
 * los puntos, la barra con los tramos dudosos y la línea de ayuda. `ayuda`: lo
 * que hace la herramienta elegida. `masBajo`: ir al punto más bajo de la
 * repetición (con esqueleto). `otro`: con dos alineados, dónde va el otro vídeo.
 */
export function MandosVideo({ v, mando, ayuda, masBajo, otro }: {
  v: VideoAnalisis
  mando: Mando
  ayuda: string
  masBajo?: (() => void) | null
  otro?: { etiqueta: string; tiempo: number; fuera: boolean } | null
}) {
  const { media, tramos, correcciones, siguienteTramo, clave, duracion, tiempo } = v
  if (!media) return null
  const ocupado = mando.ocupado
  return (
    <div className="px-4 pb-3 flex flex-col gap-2">
      <p className="text-[11.5px] text-gray-500">{ayuda}</p>
      <p className="text-[11px] text-gray-500">
        <span className="hidden pointer-fine:inline">Rueda del ratón: fotograma a fotograma. Ctrl + rueda: zoom donde apuntas; con zoom, arrastra con «mover» (o con la rueda pulsada) para moverte.</span>
        <span className="pointer-fine:hidden">Pellizca con dos dedos para acercar y alejar; con dos dedos, te mueves.</span>
      </p>
      {media.tipo === 'video' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => mando.paso(-1)} disabled={ocupado} title="Fotograma anterior (←)" className="h-9 min-w-9 px-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 transition">‹</button>
            <button onClick={mando.alternar} disabled={ocupado} title="Reproducir (espacio)" className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold disabled:opacity-40 transition">{mando.enMarcha ? 'Pausa' : '▶'}</button>
            <button onClick={() => mando.paso(1)} disabled={ocupado} title="Fotograma siguiente (→)" className="h-9 min-w-9 px-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 transition">›</button>
            <div className="flex gap-1 ml-1">
              {VELOCIDADES.map(x => (
                <button key={x} onClick={() => mando.cambiarVel(x)}
                  className={'text-[11.5px] font-mono px-2 py-1.5 rounded-md border transition ' + (v.vel === x
                    ? 'border-orange-500/50 bg-orange-500/15 text-orange-300' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
                  ×{String(x).replace('.', ',')}
                </button>
              ))}
            </div>
            <button onClick={v.cambiarSeguir} aria-pressed={v.seguir}
              title="Los ángulos, líneas y distancias buscan su sitio en cada fotograma al avanzar o reproducir"
              className={'flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-md border transition ' + (v.seguir
                ? 'border-orange-500/50 bg-orange-500/15 text-orange-300' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
              <span aria-hidden="true" className={'w-2 h-2 rounded-full ' + (v.seguir ? 'bg-orange-400' : 'bg-gray-600')} />
              Seguir los puntos
            </button>
            {masBajo && (
              <button onClick={masBajo} disabled={ocupado}
                className="text-[11.5px] text-gray-400 hover:text-white underline decoration-dotted underline-offset-4 disabled:opacity-40">
                Ir al punto más bajo
              </button>
            )}
            <span className="ml-auto font-mono text-[12px] text-gray-400 tabular-nums text-right">
              <b className="text-gray-200">{tiempo.toFixed(2).replace('.', ',')} s</b> / {duracion.toFixed(2).replace('.', ',')} s
              {otro && (
                <span className={'block text-[11px] ' + (otro.fuera ? 'text-amber-300' : 'text-gray-500')}>
                  {otro.etiqueta}: {otro.fuera ? 'fuera de su vídeo' : otro.tiempo.toFixed(2).replace('.', ',') + ' s'}
                </span>
              )}
            </span>
          </div>
          <input type="range" min={0} max={duracion || 0} step={1 / FPS} value={tiempo} disabled={ocupado}
            onChange={e => mando.irA(claveDe(Number(e.target.value), FPS))}
            aria-label="Posición del vídeo" className="w-full accent-orange-500" />
          {tramos.length + correcciones.length > 0 && (() => {
            const total = Math.max(1, Math.ceil(duracion * FPS))
            const pos = (k: number) => Math.min(100, (k / total) * 100) + '%'
            const ancho = (a: number, b: number) => Math.max(0.6, ((b - a + 1) / total) * 100) + '%'
            return (
              <div className="flex items-center gap-2.5">
                <div className="relative flex-1 h-3 rounded bg-gray-800/80 overflow-hidden"
                  title="En ámbar, los tramos con algún punto dudoso; en naranja, lo seguido desde tus correcciones">
                  {tramos.map(t => (
                    <button key={'d' + t.desde} onClick={() => mando.irA(t.desde)} disabled={ocupado}
                      aria-label={'Ir al tramo dudoso del ' + t.desde + ' al ' + t.hasta}
                      className="absolute inset-y-0 bg-amber-400/45 hover:bg-amber-400/70 border-x border-amber-400/80 transition"
                      style={{ left: pos(t.desde), width: ancho(t.desde, t.hasta) }} />
                  ))}
                  {correcciones.map(c => (
                    <span key={'c' + c.punto + ':' + c.fotograma} aria-hidden="true" className="absolute bottom-0 h-1 bg-orange-500"
                      style={{ left: pos(c.desde), width: ancho(c.desde, c.hasta) }} />
                  ))}
                  {correcciones.map(c => (
                    <span key={'r' + c.punto + ':' + c.fotograma} aria-hidden="true" className="absolute top-0.5 w-2 h-2 -ml-1 rotate-45 bg-orange-400"
                      style={{ left: pos(c.fotograma) }} />
                  ))}
                  <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: pos(clave) }} />
                </div>
                {siguienteTramo && (
                  <button onClick={() => mando.irA(siguienteTramo.desde)} disabled={ocupado}
                    className="flex-none text-[11.5px] text-amber-300 hover:text-white underline decoration-dotted underline-offset-4 disabled:opacity-40">
                    Siguiente tramo dudoso →
                  </button>
                )}
              </div>
            )
          })()}
          {/* Alto fijo: que cambiar de mensaje no mueva el vídeo. */}
          <div className="min-h-[2.9em] text-[11.5px] leading-snug">
            {v.avisoSeguir
              ? <p className="text-red-300" role="alert">{v.avisoSeguir}</p>
              : v.avisoCuerpo ? <p className="text-orange-200/90" role="status">{v.avisoCuerpo}</p>
              : v.ayudaSeguir && <p className={v.fueraDelTramo && v.haySeguidos ? 'text-amber-300/90' : 'text-gray-500'}>{v.ayudaSeguir}</p>}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Los paneles del lateral que son de un vídeo: las medidas de este fotograma,
 * cuánto fiarse de cada una, las correcciones y las gráficas a lo largo del
 * vídeo. `irA`: ir a un fotograma (con dos alineados, mueve los dos).
 */
export function PanelesVideo({ v, lado, prueba, irA }: { v: VideoAnalisis; lado: Lado; prueba: Prueba | null; irA: (k: number) => void }) {
  const { media, medidas, vista, hayCuerpo, verCuerpo, cuerpoAhora, medidasC, ladoMedido, correcciones, recorridos, graf, setGraf, ladoGraf, conMargen, serieGraf, serieEncima, clave } = v
  return (
    <>
      {media && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5">
          <p className="text-[13.5px] font-semibold mb-2">Medidas en este fotograma</p>
          {medidas.length === 0 ? (
            <p className="text-[12px] text-gray-500">Dibuja un ángulo o una línea y su medida sale aquí.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {medidas.map(m => (
                <div key={m.nombre} className="flex justify-between gap-3 text-[12.5px]">
                  <span className="text-gray-400">{m.nombre}</span>
                  <span className="font-mono text-orange-300 text-right">{m.valor}</span>
                </div>
              ))}
            </div>
          )}
          {vista === 'frente' && <p className="text-[11px] text-gray-500 mt-2">De frente, los ángulos de una cámara no son fiables: sirven para ver, y lo demás se juzga a ojo.</p>}
        </div>
      )}

      {hayCuerpo && verCuerpo && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5 flex flex-col gap-2.5">
          <div>
            <p className="text-[13.5px] font-semibold">Cuánto fiarse de cada medida</p>
            {vista === 'perfil' && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Esqueleto del lado {LADO_CUERPO[ladoMedido]}: {lado === 'unico' ? 'el más cercano a la cámara' : prueba?.queLado || 'el que se puntúa'}.
              </p>
            )}
          </div>
          {!cuerpoAhora ? (
            <p className="text-[12px] text-gray-500">En este fotograma no hay esqueleto: no se vio a nadie, o la búsqueda se paró antes.</p>
          ) : medidasC.map(m => (
            <div key={m.clave} className={'rounded-lg bg-gray-800/60 border border-gray-800 px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 ' + (m.fiabilidad === 'no' ? 'opacity-85' : '')}>
              <span className="text-[12.5px]">{m.nombre}</span>
              <span className={'font-mono text-[13.5px] font-semibold text-right ' + (m.dudosa ? 'text-amber-300' : COLOR_FIABILIDAD[m.fiabilidad])}>{m.texto}</span>
              <span className="col-span-2 text-[11px] text-gray-500 leading-snug">
                <span className={'inline-block mr-1.5 px-1.5 py-px rounded-full text-[10.5px] font-semibold ' + PASTILLA_FIABILIDAD[m.fiabilidad]}>
                  {NOMBRE_FIABILIDAD[m.fiabilidad]}
                </span>
                {m.dudosa ? 'Sale de un punto que el modelo adivina: arrástralo a su sitio con «mover».' : m.porque}
              </span>
            </div>
          ))}
          <p className="text-[11px] text-gray-500 leading-snug">
            La app no pone la nota: mide. Si un punto está mal, arrástralo con «mover»: desde ahí se sigue solo, hacia delante y hacia atrás, hasta que se vuelve a perder.
          </p>
        </div>
      )}

      {hayCuerpo && correcciones.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5 flex flex-col gap-2">
          <p className="text-[13.5px] font-semibold">Tus correcciones</p>
          {correcciones.map(c => (
            <div key={c.punto + ':' + c.fotograma} className="rounded-lg bg-gray-800/60 border border-gray-800 px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 items-baseline">
              <button onClick={() => irA(c.fotograma)} disabled={v.ocupadoVisor} title="Ir a ese fotograma"
                className="text-left text-[12.5px] hover:text-white disabled:opacity-60">{nombrePunto(c.punto)} · fotograma {c.fotograma}</button>
              <button onClick={() => v.deshacerUnaCorreccion(c.punto, c.fotograma)} disabled={v.ocupadoVisor}
                className="text-[12px] text-sky-300 hover:text-white disabled:opacity-40">deshacer</button>
              <span className="col-span-2 text-[11px] text-gray-500">
                {c.desde === c.hasta ? 'Solo ese fotograma.' : 'Se ha seguido del ' + c.desde + ' al ' + c.hasta + '.'}
              </span>
            </div>
          ))}
          <p className="text-[11px] text-gray-500 leading-snug">«Deshacer» vuelve a lo que vio la app, pero solo en el tramo que salió de esa corrección.</p>
        </div>
      )}

      {media?.tipo === 'video' && (recorridos.length > 0 || (verCuerpo && hayCuerpo && vista === 'perfil')) && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5 flex flex-col gap-3">
          <p className="text-[13.5px] font-semibold">A lo largo del vídeo</p>
          {verCuerpo && hayCuerpo && vista === 'perfil' && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1" role="group" aria-label="Qué medida del esqueleto se dibuja">
                {MEDIDAS_GRAFICA.map(c => {
                  const sinComprobar = fiabilidadDe(c) === 'sin_comprobar'
                  const activa = graf.clave === c
                  return (
                    <button key={c} onClick={() => setGraf(g => ({ ...g, clave: c, encima: g.encima === c ? null : g.encima }))} aria-pressed={activa}
                      className={'text-[11.5px] px-2 py-1 rounded-md border transition ' + (sinComprobar ? 'border-dashed ' : '') + (activa
                        ? 'border-orange-500/60 bg-orange-500/15 text-orange-300' : 'border-gray-700 text-gray-400 hover:text-white')}>
                      {NOMBRE_CORTO[c]}{sinComprobar && <span className="ml-1 text-[9.5px] text-amber-300">con margen</span>}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-gray-500">
                <span>Lado</span>
                {(['i', 'd'] as LadoCuerpo[]).map(l => (
                  <button key={l} onClick={() => setGraf(g => ({ ...g, lado: l }))} aria-pressed={ladoGraf === l}
                    className={'px-2 py-1 rounded-md border transition ' + (ladoGraf === l ? 'border-gray-500 bg-gray-800 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
                    {l === 'i' ? 'Izquierdo' : 'Derecho'}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-1.5">
                  Encima
                  <select value={graf.encima ?? ''} onChange={e => setGraf(g => ({ ...g, encima: (e.target.value || null) as ClaveGrafica | null }))}
                    className="bg-gray-800 border border-gray-700 rounded-md px-1.5 py-1 text-[11.5px] text-gray-200">
                    <option value="">ninguna</option>
                    {MEDIDAS_GRAFICA.filter(c => c !== graf.clave).map(c => (
                      <option key={c} value={c}>{NOMBRE_CORTO[c]}{fiabilidadDe(c) === 'sin_comprobar' ? ' (con margen)' : ''}</option>
                    ))}
                  </select>
                </label>
              </div>
              {conMargen.length > 0 && (
                <p role="note" className="rounded-lg border border-amber-400/40 bg-amber-400/[0.07] px-3 py-2 text-[11.5px] text-amber-100/90 leading-snug">
                  <b className="text-amber-300">⚠ {conMargen.map(c => NOMBRE_CORTO[c]).join(' y ')} {conMargen.length > 1 ? 'van' : 'va'} con margen.</b>{' '}
                  Los estudios en los que se basa la app comprueban la rodilla, el tronco y la tibia vistos de perfil, y dan la cadera y el fémur con más margen. El tobillo, el hombro y el codo no están comprobados: sirven para ver cómo cambian a lo largo del movimiento, no para fiarse del número exacto.
                </p>
              )}
              {serieGraf.length >= MINIMO_SERIE ? (
                <GraficaRecorrido nombre={NOMBRE_CORTO[graf.clave] + ' · lado ' + LADO_CUERPO[ladoGraf]} tipo="angulo" serie={serieGraf} clave={clave} onIr={irA}
                  extra={graf.encima && serieEncima.length >= MINIMO_SERIE ? { nombre: NOMBRE_CORTO[graf.encima], serie: serieEncima } : undefined} />
              ) : (
                <p className="text-[12px] text-gray-500">De esta medida hay pocos fotogramas fiables en este lado para dibujarla.</p>
              )}
              {graf.encima && serieGraf.length >= MINIMO_SERIE && serieEncima.length < MINIMO_SERIE && (
                <p className="text-[11px] text-gray-500">De {NOMBRE_CORTO[graf.encima].toLowerCase()} hay pocos fotogramas fiables en este lado: no se dibuja encima.</p>
              )}
            </div>
          )}
          {recorridos.map(r => (
            <GraficaRecorrido key={r.id} nombre={r.nombre} tipo={r.tipo} serie={r.serie} clave={clave} onIr={irA} />
          ))}
          <p className="text-[11px] text-gray-500 leading-snug">
            Al guardar, el mínimo y el máximo van con las medidas. La imagen es la del fotograma en el que estés: ve al que quieras enseñar antes de guardar.
          </p>
        </div>
      )}
    </>
  )
}
