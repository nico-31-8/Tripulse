'use client'
// ============================================================
// El visor del analizador de vídeo (fase 1: el entrenador analiza)
// ============================================================
//
// Un Kinovea para una prueba de una batería de movimiento: se elige el vídeo
// (o una foto) con la cámara del propio móvil, se pasa fotograma a fotograma,
// se dibuja encima y se pone la nota. La app no puntúa sola: mide y deja
// constancia.
//
// EL VÍDEO NO SALE DEL DISPOSITIVO: se abre como archivo local. Al guardar se
// sube solo el fotograma con lo dibujado, y solo si el deportista tiene marcado
// su permiso (la base, además, la rechaza sin él).
//
// LA CÁMARA NO SE ABRE AQUÍ. La política de permisos de la app la cierra salvo
// en la medición del pulso; el móvil ofrece grabar desde su propia cámara al
// elegir el archivo, y eso es lo que se usa.
//
// Los puntos se colocan AL SOLTAR el dedo, con una lupa mientras se apunta:
// con el dedo encima no se ve dónde cae, y es lo que más falla en el móvil.
//
// LOS PUNTOS SIGUEN AL CUERPO (como en Kinovea). Un ángulo, una línea o una
// distancia dibujados sobre el vídeo buscan su sitio en cada fotograma nuevo,
// al avanzar o al reproducir (lib/seguimiento-puntos), y cada trazo recuerda
// dónde estaba en cada uno (lib/pista-trazos). Si un punto se pierde, el vídeo
// se para ahí y se corrige arrastrándolo. De ahí sale la gráfica del ángulo a
// lo largo del movimiento, con su mínimo y su máximo.
//
// CÓMO LLEGA CADA FOTOGRAMA. Parado (‹ ›, la barra, «ir»), al acabar cada salto
// (`seeked`): no depende de que la pantalla se pinte. Reproduciendo, con
// requestVideoFrameCallback, que avisa de cada fotograma que se enseña; sin él
// (un navegador viejo) se sigue solo pasando de uno en uno.
//
// SE SALTA AL CENTRO DEL FOTOGRAMA, no a su borde. El navegador da el tiempo
// redondeado (0,66666 por 0,666667) y sumarle 1/30 dejaba a veces el vídeo
// justo antes del fotograma siguiente: pulsabas › y no pasaba nada.
//
// EL ESQUELETO (fase 2). «Detectar el cuerpo» pasa el vídeo entero por el
// detector de MediaPipe (lib/detector-cuerpo), fotograma a fotograma, y la app
// coloca las articulaciones y mide sola los ángulos de perfil, cada uno con
// cuánto fiarse (lib/cuerpo). El punto que el modelo adivina sale en ámbar y se
// corrige arrastrándolo con «mover». La app no pone la nota: mide.
//
// CORREGIR EL ESQUELETO (v3, 17-10-2026). El punto arrastrado ya no vale solo
// para ese fotograma: el seguimiento lo lleva hacia delante y hacia atrás hasta
// que se pierde o la app lo vuelve a ver bien (lib/corregir-esqueleto). Debajo
// del vídeo, los tramos dudosos en ámbar y lo corregido en naranja; en el panel,
// cada corrección con su «deshacer». Y la gráfica deja elegir la medida, el lado
// y otra encima; las que no están comprobadas (tobillo, hombro, codo) lo avisan.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DE_VISTA, type DefBateria, type Lado, type Prueba, type Vista } from '@/lib/baterias-movimiento'
import {
  guardarPrueba, rutaFotograma, subirFotograma, type FilaPrueba, type Medida, type TipoTrazo, type Trazo, type Valoracion,
} from '@/lib/movimiento-datos'
import {
  anadirTrazo, COMO_SE_USA, etiquetaDe, inclinacionSuelo, medidasDe, NOMBRE_HERRAMIENTA, nombresDe, PUNTOS_POR_TRAZO,
  textoRecorrido, textoValor, valorDe, type Herramienta,
} from '@/lib/trazos-fotograma'
import { sugerirNota, TEXTO_ALZA, textoParaGuardar } from '@/lib/nota-sugerida'
import {
  centroDe, claveDe, empezarPista, enFotograma, extremosDe, moverPunto, pasoDePista, serieDe, visiblesEn, type TrazoVivo,
} from '@/lib/pista-trazos'
import { aGris, avanzar, tomarPlantilla, type Gris, type Plantilla, type PuntoSeguido } from '@/lib/seguimiento-puntos'
import {
  conAjustes, CRUCES, descruzar, DIBUJADOS, dudosos, HUESOS, indice, ladoAMedir, medidasCuerpo, NOMBRE_FIABILIDAD, otroLado, PARTES,
  serieCuerpo, fiabilidadDe, MEDIDAS_GRAFICA, NOMBRE_CORTO, NOMBRE_MEDIDA, nombrePunto, tramosDudosos,
  type ClaveGrafica, type Cuerpo, type Fiabilidad, type LadoCuerpo,
} from '@/lib/cuerpo'
import {
  ajustesDe, COINCIDE_PROPORCION, conPuestos, correccionesDe, corregirPunto, deshacerCorreccion, propagar, type PistasCuerpo,
} from '@/lib/corregir-esqueleto'
import { aSerieGuardada, medidaDelFotograma } from '@/lib/informe-movimiento'
import { cambiarAnalisisLibre, guardarFotogramaLibre, type AnalisisLibre, type FotogramaLibre } from '@/lib/analisis-libre'
import { cargarDetector, detectar, SIN_SIMD, type Detector } from '@/lib/detector-cuerpo'
import { inclinacionDe, type Punto } from '@/lib/geometria-fotograma'
import { fechaLarga, hoyISO } from '@/lib/fechas'
import { FichaCorta } from './FichaPrueba'

const NARANJA = '#f97316'
const REF = '#8ecbff'
const ROJO = '#f2545b'
const BLANCO = '#f3f6f9'
const AMBAR = '#f0b429'
/** El color de cada medida del esqueleto según cuánto fiarse. */
const COLOR_FIABILIDAD: Record<Fiabilidad, string> = {
  fiable: 'text-green-300', margen: 'text-amber-300', sin_comprobar: 'text-amber-300', no: 'text-gray-500',
}
const PASTILLA_FIABILIDAD: Record<Fiabilidad, string> = {
  fiable: 'bg-green-500/15 text-green-300', margen: 'bg-amber-500/15 text-amber-300',
  sin_comprobar: 'bg-amber-500/10 text-amber-300 border border-dashed border-amber-400/60', no: 'bg-red-500/15 text-red-300',
}
const LADO_CUERPO: Record<LadoCuerpo, string> = { i: 'izquierdo', d: 'derecho' }
/** Primera letra en mayúscula: «De perfil», «Desde atrás». */
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Paso de un fotograma. El navegador no dice los fps del vídeo; 30 es lo que graba casi cualquier móvil. */
const FPS = 30
const VELOCIDADES = [0.1, 0.25, 0.5, 1]
const HERRAMIENTAS: Herramienta[] = ['mover', 'linea', 'angulo', 'plomada', 'horizontal', 'palma', 'distancia', 'suelo']
const NOMBRE_LADO: Record<Lado, string> = { unico: '', izq: 'izquierda', der: 'derecha' }
/** El seguimiento trabaja con el fotograma reducido a este lado mayor: va más rápido y el margen de búsqueda cubre más movimiento. */
const LADO_SEGUIR = 720
/** Más fotogramas que esto entre uno y el siguiente ya es un salto (arrastrar la barra), no reproducir: no se sigue. */
const SALTO_MAXIMO = 4
/** Con menos fotogramas seguidos no hay recorrido que enseñar. */
const MINIMO_SERIE = 3
const CON_FOTOGRAMAS = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype

const segundos = (s: number) => s.toFixed(2).replace('.', ',') + ' s'

/** Pinta los trazos en coordenadas del fotograma. Lo usan el lienzo, la lupa y la imagen que se guarda. */
function pintarTrazos(ctx: CanvasRenderingContext2D, trazos: Trazo[], enCurso: Trazo | null, W: number, H: number, perdidos: Punto[] = []) {
  const lw = Math.max(2, Math.round(Math.max(W, H) / 420))
  const fs = Math.max(13, Math.round(Math.max(W, H) / 52))
  const todos = enCurso ? [...trazos, enCurso] : trazos
  /* La plomada y la horizontal van con el suelo, si se ha marcado: (ux, uy) es su dirección. */
  const incl = inclinacionSuelo(trazos)
  const ux = Math.cos(incl), uy = Math.sin(incl)
  const largo = W + H
  for (const t of todos) {
    const esRef = t.tipo === 'plomada' || t.tipo === 'horizontal' || t.tipo === 'palma' || t.tipo === 'suelo'
    const color = esRef ? REF : NARANJA
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.setLineDash(t.tipo === 'plomada' || t.tipo === 'horizontal' ? [lw * 4, lw * 3] : [])
    const p = t.puntos
    ctx.beginPath()
    if (t.tipo === 'plomada' && p[0]) { ctx.moveTo(p[0].x + uy * largo, p[0].y - ux * largo); ctx.lineTo(p[0].x - uy * largo, p[0].y + ux * largo) }
    else if (t.tipo === 'horizontal' && p[0]) { ctx.moveTo(p[0].x - ux * largo, p[0].y - uy * largo); ctx.lineTo(p[0].x + ux * largo, p[0].y + uy * largo) }
    else if (t.tipo === 'suelo' && p.length === 2) {
      /* El suelo, de lado a lado de la imagen (también mientras se marca). */
      const s = inclinacionDe(p[0], p[1]), sx = Math.cos(s), sy = Math.sin(s)
      ctx.moveTo(p[0].x - sx * largo, p[0].y - sy * largo); ctx.lineTo(p[0].x + sx * largo, p[0].y + sy * largo)
    } else if (t.tipo === 'angulo' && p.length === 3) {
      ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.lineTo(p[2].x, p[2].y)
    } else if (p.length >= 2) { ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y) }
    ctx.stroke()
    ctx.setLineDash([])
    /* El arco del ángulo, por el lado corto. */
    if (t.tipo === 'angulo' && p.length === 3) {
      const a0 = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x)
      let d = Math.atan2(p[2].y - p[1].y, p[2].x - p[1].x) - a0
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      ctx.beginPath()
      ctx.arc(p[1].x, p[1].y, lw * 14, a0, a0 + d, d < 0)
      ctx.stroke()
    }
    for (const q of p) { ctx.beginPath(); ctx.arc(q.x, q.y, lw * 2.4, 0, 2 * Math.PI); ctx.fill() }
    const et = etiquetaDe(t, trazos)
    if (et) {
      const ancla = t.tipo === 'angulo' ? p[1] : t.tipo === 'plomada' || t.tipo === 'horizontal' ? p[0]
        : { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }
      ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`
      const ancho = ctx.measureText(et).width + fs * 0.8
      const x = Math.min(Math.max(ancla.x + lw * 6, 2), W - ancho - 2)
      const y = Math.min(Math.max(ancla.y - fs * 1.6, 2), H - fs * 1.5)
      ctx.fillStyle = 'rgba(0,0,0,.72)'
      ctx.fillRect(x, y, ancho, fs * 1.45)
      ctx.fillStyle = color
      ctx.fillText(et, x + fs * 0.4, y + fs * 1.08)
    }
  }
  /* Los que el seguimiento ha perdido: un aro rojo para que se vea cuál arrastrar. */
  ctx.strokeStyle = ROJO
  ctx.lineWidth = lw
  for (const q of perdidos) { ctx.beginPath(); ctx.arc(q.x, q.y, lw * 7, 0, 2 * Math.PI); ctx.stroke() }
}

/**
 * Pinta el esqueleto. De perfil, el lado medido en blanco y el otro apagado
 * detrás; desde las otras vistas, los dos en blanco. Lo que el modelo adivina,
 * en ámbar, y el primero con su «dudoso · arrástralo». `rodilla`: el ángulo
 * que se escribe junto a la rodilla medida.
 */
function pintarCuerpo(
  ctx: CanvasRenderingContext2D, c: Cuerpo, medido: LadoCuerpo, vista: Vista, dudososIdx: number[], W: number, H: number,
  rodilla: { texto: string; dudosa: boolean } | null,
) {
  const lw = Math.max(2, Math.round(Math.max(W, H) / 420))
  const fs = Math.max(13, Math.round(Math.max(W, H) / 52))
  const dePerfil = vista === 'perfil'
  const linea = (a?: Punto, b?: Punto) => {
    if (!a || !b) return
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  }
  const caja = (texto: string, x: number, y: number, color: string) => {
    ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`
    const ancho = ctx.measureText(texto).width + fs * 0.8
    const bx = Math.min(Math.max(x, 2), W - ancho - 2), by = Math.min(Math.max(y, 2), H - fs * 1.5)
    ctx.fillStyle = 'rgba(0,0,0,.72)'
    ctx.fillRect(bx, by, ancho, fs * 1.45)
    ctx.fillStyle = color
    ctx.fillText(texto, bx + fs * 0.4, by + fs * 1.08)
  }
  ctx.lineCap = 'round'
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(243,246,249,.4)'
  ctx.lineWidth = lw * 0.8
  for (const p of CRUCES) linea(c[indice(p, 'i')], c[indice(p, 'd')])
  /* Primero el lado de atrás, para que el medido quede encima. */
  const lados: LadoCuerpo[] = dePerfil ? [otroLado(medido), medido] : ['i', 'd']
  for (const l of lados) {
    const principal = !dePerfil || l === medido
    ctx.strokeStyle = principal ? BLANCO : 'rgba(156,163,175,.6)'
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = principal ? lw * 1.1 : lw * 0.8
    for (const [a, b] of HUESOS) linea(c[indice(a, l)], c[indice(b, l)])
    for (const p of PARTES) {
      const q = c[indice(p, l)]
      if (q) { ctx.beginPath(); ctx.arc(q.x, q.y, principal ? lw * 2.2 : lw * 1.6, 0, 2 * Math.PI); ctx.fill() }
    }
  }
  if (rodilla && dePerfil) {
    const k = c[indice('rodilla', medido)]
    if (k) caja(rodilla.texto, k.x + lw * 6, k.y - fs * 1.6, rodilla.dudosa ? AMBAR : BLANCO)
  }
  ctx.strokeStyle = AMBAR
  ctx.fillStyle = AMBAR
  ctx.lineWidth = lw
  dudososIdx.forEach((i, n) => {
    const q = c[i]
    if (!q) return
    ctx.beginPath(); ctx.arc(q.x, q.y, lw * 6, 0, 2 * Math.PI); ctx.stroke()
    ctx.beginPath(); ctx.arc(q.x, q.y, lw * 1.6, 0, 2 * Math.PI); ctx.fill()
    if (n === 0) caja('dudoso · arrástralo', q.x + lw * 8, q.y + lw * 2, AMBAR)
  })
}

type Serie = { clave: number; valor: number }[]

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
function GraficaRecorrido({ nombre, tipo, serie, clave, onIr, extra }: {
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

interface PropsComunes {
  idDeportista: number
  permiso: boolean
  /** Los fotogramas guardados, con su enlace temporal. */
  urls: Record<string, string>
  onCerrar: () => void
}

/** Una prueba de una batería (FMS o Nine Test): criterios y nota. */
export interface PropsBateria extends PropsComunes {
  modo?: 'bateria'
  bateria: DefBateria
  prueba: Prueba
  ladoInicial: Lado
  valoracion: Valoracion
  /** Lo ya guardado de ESTA prueba en esta valoración, una fila por lado. */
  guardadas: FilaPrueba[]
  onGuardado: () => void
}

/** Un análisis libre (v3, paso 3): sin criterios ni nota; se guardan los fotogramas que se quieran, y las notas. */
export interface PropsLibre extends PropsComunes {
  modo: 'libre'
  analisis: AnalisisLibre
  nombreDeportista: string | null
  /** Cuántos fotogramas tiene ya: para numerar el que se guarda. */
  yaGuardados: number
  /** Guardado un fotograma: la imagen local va para el informe de ahora, aunque no se haya subido. */
  onFotograma: (f: FotogramaLibre, imagenLocal: string | null) => void
  onNotas: (notas: string | null) => void
  /** «Descargar el informe», con las medidas de la gráfica que se están mirando (salen marcadas). */
  onInforme: (mirando: (ClaveGrafica | null)[]) => void
}

export type PropsAnalizador = PropsBateria | PropsLibre

const VISTAS: Vista[] = ['perfil', 'frente', 'espalda', 'atras', 'arriba']

export default function Analizador(props: PropsAnalizador) {
  const { idDeportista, permiso, urls, onCerrar } = props
  const bat = props.modo === 'libre' ? null : props
  const libre = props.modo === 'libre' ? props : null
  const prueba = bat?.prueba ?? null
  const guardadas = bat?.guardadas ?? []
  const [lado, setLado] = useState<Lado>(bat?.ladoInicial ?? 'unico')
  const [media, setMedia] = useState<{ url: string; tipo: 'video' | 'imagen'; nombre: string } | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [vista, setVista] = useState<Vista>(props.modo === 'libre' ? props.analisis.vista : props.prueba.vistas[0])
  /** En un análisis libre, sus notas (se guardan al salir del cuadro). */
  const [notas, setNotas] = useState(libre?.analisis.notas ?? '')
  const [avisoNotas, setAvisoNotas] = useState('')
  const [herr, setHerr] = useState<Herramienta>('angulo')
  const [trazos, setTrazosEstado] = useState<TrazoVivo[]>([])
  const [enCurso, setEnCurso] = useState<Trazo | null>(null)
  const [provisional, setProvisional] = useState<Punto | null>(null)
  /** Lo que se arrastra con «mover»: el punto p del trazo t, o el punto c del esqueleto. */
  const [arrastre, setArrastre] = useState<{ t: number; p: number } | { c: number } | null>(null)
  const [lupa, setLupa] = useState<{ p: Punto; k: number; cx: number; cy: number } | null>(null)
  const [nota, setNota] = useState<number | null>(null)
  const [dolor, setDolor] = useState(false)
  const [criterios, setCriterios] = useState<Record<string, boolean>>({})
  const [tiempo, setTiempo] = useState(0)
  const [duracion, setDuracion] = useState(0)
  const [enMarcha, setEnMarcha] = useState(false)
  const [vel, setVel] = useState(0.25)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  /** El fotograma que se está viendo (su número, tiempo × 30). */
  const [clave, setClave] = useState(0)
  const [seguir, setSeguir] = useState(true)
  const [avisoSeguir, setAvisoSeguir] = useState('')
  /** El esqueleto de cada fotograma (en una foto, el 0). */
  const [cuerpos, setCuerpos] = useState<Record<number, Cuerpo>>({})
  /** Lo corregido a mano y lo que se siguió de ello, punto a punto (lib/corregir-esqueleto). Encima del detector. */
  const [pistasCuerpo, setPistasCuerpo] = useState<PistasCuerpo>({})
  const ajustesCuerpo = useMemo(() => ajustesDe(pistasCuerpo), [pistasCuerpo])
  /** Mientras el seguimiento lleva un punto corregido: cuál y por dónde va. */
  const [siguiendoCuerpo, setSiguiendoCuerpo] = useState<{ punto: number; clave: number } | null>(null)
  /** Qué se ha hecho con la última corrección, cuando no hay que corregir nada más. */
  const [avisoCuerpo, setAvisoCuerpo] = useState('')
  /** Lo que se dibuja «A lo largo del vídeo»: la medida, el lado (null = el que se mide) y otra encima. */
  const [graf, setGraf] = useState<{ clave: ClaveGrafica; lado: LadoCuerpo | null; encima: ClaveGrafica | null }>({ clave: 'rodilla', lado: null, encima: null })
  const [verCuerpo, setVerCuerpo] = useState(true)
  /** En las sentadillas: si se hizo con el alza (FMS) o con la tabla de 4 cm (Nine Test). Cambia la nota que apunta. */
  const [alza, setAlza] = useState(false)
  const [deteccion, setDeteccion] = useState<
    | { fase: 'bajando'; bajado: number; total: number }
    | { fase: 'preparando' }
    | { fase: 'buscando'; hechos: number; total: number }
    | { fase: 'error'; mensaje: string }
    | null
  >(null)
  /** «Parar»: acaba la búsqueda del cuerpo y se queda lo hallado. */
  const pararRef = useRef(false)
  /** Lo mismo para el seguimiento de un punto corregido, y si está en marcha (fuera de los renders). */
  const pararSeguirRef = useRef(false)
  const siguiendoRef = useRef(false)
  /** Si el punto del esqueleto se ha movido de verdad: un toque sin arrastrar no es una corrección. */
  const movidoRef = useRef(false)
  /* Lo que el seguimiento del punto corregido lee al día, fuera de los renders. */
  const cuerposRef = useRef(cuerpos)
  const pistasRef = useRef(pistasCuerpo)
  useEffect(() => { cuerposRef.current = cuerpos; pistasRef.current = pistasCuerpo })
  /** Cada búsqueda tiene su número; otro vídeo o cerrar lo cambian, y la vieja se retira sin tocar nada. */
  const corridaRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const lienzoRef = useRef<HTMLCanvasElement>(null)
  const lupaRef = useRef<HTMLCanvasElement>(null)
  /* El seguimiento corre fotograma a fotograma, fuera de los renders de React:
     lo que necesita al día lo lee de aquí. */
  const trazosRef = useRef<TrazoVivo[]>([])
  const claveRef = useRef(0)
  const seguirRef = useRef(true)
  const idRef = useRef(0)
  /** El último fotograma visto, en gris, y con qué recorte se busca cada punto («id:índice»). */
  const segRef = useRef<{ clave: number; gris: Gris; esc: number; plantillas: Map<string, Plantilla> } | null>(null)
  const capturaRef = useRef<HTMLCanvasElement | null>(null)
  /** Dos memorias que se turnan: la del fotograma anterior y la del que llega. */
  const memoriasRef = useRef<Float32Array[]>([])
  const alFotogramaRef = useRef<(s: number) => void>(() => {})

  const ponTrazos = (f: TrazoVivo[] | ((ts: TrazoVivo[]) => TrazoVivo[])) => {
    const nuevos = typeof f === 'function' ? f(trazosRef.current) : f
    trazosRef.current = nuevos
    setTrazosEstado(nuevos)
  }

  const guardada = guardadas.find(g => g.lado === lado) || null

  /* Al cambiar de lado: lo que ya tenía guardado ese lado, y el dibujo en blanco
     (lo dibujado es de otro fotograma). El vídeo se queda: a veces los dos lados
     están en el mismo. */
  useEffect(() => {
    const g = guardadas.find(x => x.lado === lado)
    setNota(g?.nota ?? null)
    setDolor(!!g?.dolor)
    setCriterios(g?.criterios || {})
    ponTrazos([]); setEnCurso(null); setAviso(''); setError(''); setAvisoSeguir('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lado])

  /* El archivo local se suelta al cambiarlo o al cerrar. */
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url) }, [media])

  /* ← → para pasar fotogramas y espacio para reproducir, en el ordenador. */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const v = videoRef.current
      if (!v || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); paso(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); paso(1) }
      else if (e.key === ' ') { e.preventDefault(); alternar() }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  const enCursoVisible: Trazo | null = provisional && herr !== 'mover'
    ? { tipo: herr, puntos: [...(enCurso?.tipo === herr ? enCurso.puntos : []), provisional] }
    : enCurso

  /** Cada trazo donde está en este fotograma. Es lo que se pinta, se mide y se guarda. */
  const visibles = visiblesEn(trazos, clave)
  /** Los puntos que el seguimiento ha perdido y siguen sin corregir en lo que se ve. */
  const perdidosAhora: Punto[] = trazos.flatMap(t => {
    const e = t.pista ? enFotograma(t.pista, clave) : null
    return e?.perdidos ? e.perdidos.map(j => e.p[j]).filter(Boolean) : []
  })
  /** Lo que mide cada trazo seguido, fotograma a fotograma: la gráfica y su mínimo y máximo. */
  const nombres = nombresDe(visibles)
  const recorridos = trazos.flatMap((t, i) => {
    if (!t.pista || !nombres[i]) return []
    const serie = serieDe(t.pista, p => valorDe({ tipo: t.tipo, puntos: p }, visibles))
    return serie.length >= MINIMO_SERIE ? [{ id: t.id, nombre: nombres[i], tipo: t.tipo, serie }] : []
  })
  /** Los trazos seguidos que en este fotograma no tienen sitio propio: se ven donde se quedaron. */
  const fueraDelTramo = trazos.some(t => t.pista && !t.pista[clave])

  /* El esqueleto de este fotograma, con lo corregido, y lo que se mide de él. */
  const hayCuerpo = Object.keys(cuerpos).length > 0
  const ladoMedido = ladoAMedir(lado, Object.values(cuerpos))
  const cuerpoAhora = cuerpos[clave] ? conAjustes(cuerpos[clave], ajustesCuerpo[clave]) : null
  /** La inclinación del suelo marcado: con ella, las verticales y horizontales no salen torcidas si el móvil lo estaba. */
  const incl = inclinacionSuelo(visibles)
  const medidasC = cuerpoAhora ? medidasCuerpo(cuerpoAhora, ladoMedido, vista, incl) : []
  const rodillaC = medidasC.find(m => m.clave === 'rodilla')
  const dudososAhora = cuerpoAhora ? dudosos(cuerpoAhora, ladoMedido, vista) : []
  /* «A lo largo del vídeo»: la medida elegida del lado elegido, y otra encima si se ha pedido. */
  const ladoGraf: LadoCuerpo = graf.lado ?? ladoMedido
  const serieGraf = hayCuerpo && vista === 'perfil' ? serieCuerpo(cuerpos, ajustesCuerpo, ladoGraf, vista, graf.clave, incl) : []
  const serieEncima = hayCuerpo && vista === 'perfil' && graf.encima ? serieCuerpo(cuerpos, ajustesCuerpo, ladoGraf, vista, graf.encima, incl) : []
  /** Las que se dibujan sin estar comprobadas: llevan su aviso. */
  const conMargen = [graf.clave, graf.encima].filter((c): c is ClaveGrafica => !!c && fiabilidadDe(c) === 'sin_comprobar')
  /** Debajo del vídeo: los tramos con algún punto dudoso, y lo corregido. */
  const tramos = hayCuerpo && vista === 'perfil' ? tramosDudosos(cuerpos, ajustesCuerpo, ladoMedido, vista) : []
  const correcciones = correccionesDe(pistasCuerpo)
  const siguienteTramo = tramos.find(t => t.desde > clave) ?? tramos[0] ?? null
  /** Lo que la app sugiere de la nota (lib/nota-sugerida); null en las pruebas que son a ojo y en un análisis libre. */
  const sugerencia = prueba ? sugerirNota({
    prueba, vista, trazos: visibles, cuerpos, ajustes: ajustesCuerpo, ladoMedido, inclinacion: incl, alza, clave,
  }) : null
  const vistoDe = (criterio: string) => sugerencia?.criterios.find(c => c.clave === criterio) || null
  const buscandoCuerpo = deteccion != null && deteccion.fase !== 'error'
  /** Mientras se busca el cuerpo o se sigue una corrección, el vídeo es suyo: los mandos se quedan quietos. */
  const ocupadoVisor = buscandoCuerpo || !!siguiendoCuerpo
  /** Para pintar el esqueleto (si se ve) en el lienzo, la lupa y la imagen que se guarda. */
  const pintaCuerpo = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    if (!cuerpoAhora || !verCuerpo) return
    pintarCuerpo(ctx, cuerpoAhora, ladoMedido, vista, dudososAhora, W, H,
      rodillaC && rodillaC.valor != null ? { texto: rodillaC.texto, dudosa: rodillaC.dudosa } : null)
  }

  /* El lienzo, en píxeles del fotograma: el esqueleto debajo y lo dibujado a mano encima. */
  useEffect(() => {
    const c = lienzoRef.current
    if (!c || !nat) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    pintaCuerpo(ctx, nat.w, nat.h)
    pintarTrazos(ctx, visibles, enCursoVisible, nat.w, nat.h, perdidosAhora)
  })

  /* ── El seguimiento ── */

  /** Lo que se ve ahora, reducido y en gris. `propia`: una memoria de quien llama (el seguimiento de una corrección lleva las suyas). */
  const capturar = (propia?: Float32Array): { gris: Gris; esc: number } | null => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return null
    const esc = Math.min(1, LADO_SEGUIR / Math.max(v.videoWidth, v.videoHeight))
    const w = Math.round(v.videoWidth * esc), h = Math.round(v.videoHeight * esc)
    if (!capturaRef.current) capturaRef.current = document.createElement('canvas')
    const c = capturaRef.current
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    const enUso = segRef.current?.gris.v
    let destino = propia && propia.length === w * h ? propia : memoriasRef.current.find(m => m.length === w * h && m !== enUso)
    if (!destino) {
      destino = new Float32Array(w * h)
      memoriasRef.current = [...memoriasRef.current.filter(m => m.length === w * h), destino].slice(-2)
    }
    try {
      ctx.drawImage(v, 0, 0, w, h)
      return { gris: aGris(ctx.getImageData(0, 0, w, h).data, w, h, destino), esc }
    } catch { return null }
  }

  /** Que el seguimiento tenga el fotograma de ahora, para poder empezar desde él. */
  const asegurarCaptura = () => {
    if (segRef.current?.clave === claveRef.current) return
    const cap = capturar()
    if (cap) segRef.current = { clave: claveRef.current, gris: cap.gris, esc: cap.esc, plantillas: new Map() }
  }

  /** Para y salta al fotograma k (a su centro). */
  const irA = (k: number) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const ultimo = Math.max(0, Math.ceil((v.duration || 0) * FPS) - 1)
    v.currentTime = centroDe(Math.max(0, Math.min(k, ultimo)), FPS)
  }

  /**
   * Cada fotograma que se ve: se apunta cuál es y, si viene justo después (o
   * antes) de otro, los puntos seguidos buscan su sitio en él.
   */
  const alFotograma = (s: number) => {
    const k = claveDe(s, FPS)
    claveRef.current = k
    setClave(k)
    /* Mientras el seguimiento lleva un punto del esqueleto, los saltos son suyos. */
    if (siguiendoRef.current || !seguirRef.current) { segRef.current = null; return }
    const cap = capturar()
    if (!cap) return
    const prev = segRef.current
    const plantillas = prev && prev.esc === cap.esc ? prev.plantillas : new Map<string, Plantilla>()
    const desdeK = prev && prev.esc === cap.esc && prev.clave !== k && Math.abs(k - prev.clave) <= SALTO_MAXIMO ? prev : null
    const nombres = nombresDe(trazosRef.current)
    const perdidos: string[] = []
    let cambio = false
    const nuevos = trazosRef.current.map((t, i) => {
      if (!t.pista) return t
      const suya = (j: number) => t.id + ':' + j
      if (t.pista[k]) {
        /* Ya se sabe dónde está: si se sigue desde aquí, con recortes de aquí. */
        t.puntos.forEach((_, j) => plantillas.delete(suya(j)))
        return t
      }
      if (!desdeK) return t
      const dado = pasoDePista(t.pista, desdeK.clave, k, (j, q) => {
        const x = q.x * cap.esc, y = q.y * cap.esc
        const pl = plantillas.get(suya(j)) ?? tomarPlantilla(desdeK.gris, x, y)
        const r = pl ? avanzar(desdeK.gris, cap.gris, { x, y, plantilla: pl }) : null
        if (!r?.bien) { plantillas.delete(suya(j)); return null }
        plantillas.set(suya(j), r.s.plantilla)
        return { x: r.s.x / cap.esc, y: r.s.y / cap.esc }
      })
      if (!dado) return t
      cambio = true
      if (dado.nuevosPerdidos) perdidos.push('«' + (nombres[i] || 'un trazo') + '»')
      return { ...t, pista: dado.pista }
    })
    segRef.current = { clave: k, gris: cap.gris, esc: cap.esc, plantillas }
    if (cambio) ponTrazos(nuevos)
    if (perdidos.length) {
      if (videoRef.current && !videoRef.current.paused) irA(k)
      setHerr('mover')
      setAvisoSeguir(`Se ha perdido un punto de ${perdidos.join(' y ')} a los ${segundos(s)}: es el del aro rojo. Arrástralo a su sitio y sigue con › o ▶.`)
    }
  }
  useEffect(() => { alFotogramaRef.current = alFotograma })

  /* Reproduciendo, cada fotograma que se enseña. Parado, los trae `seeked`. */
  useEffect(() => {
    const v = videoRef.current
    if (!v || media?.tipo !== 'video' || !CON_FOTOGRAMAS) return
    let id = v.requestVideoFrameCallback(function cada(_, meta) {
      if (!v.paused) alFotogramaRef.current(meta.mediaTime)
      id = v.requestVideoFrameCallback(cada)
    })
    return () => v.cancelVideoFrameCallback(id)
  }, [media])

  const cambiarSeguir = () => {
    const si = !seguirRef.current
    seguirRef.current = si
    setSeguir(si)
    setAvisoSeguir('')
    if (si && media?.tipo === 'video') {
      ponTrazos(ts => ts.map(t => empezarPista(t, claveRef.current)))
      asegurarCaptura()
    } else segRef.current = null
  }

  /* La lupa: 2,5 aumentos de lo que se ve, con lo dibujado encima. */
  useEffect(() => {
    if (!lupa || !nat) return
    const c = lupaRef.current
    const ctx = c?.getContext('2d')
    const el = media?.tipo === 'video' ? videoRef.current : imgRef.current
    if (!c || !ctx || !el) return
    const S = c.width
    const R = (120 / 2.5) / lupa.k
    const x0 = lupa.p.x - R / 2, y0 = lupa.p.y - R / 2
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, S, S)
    try { ctx.drawImage(el, x0, y0, R, R, 0, 0, S, S) } catch { /* el fotograma aún no está */ }
    ctx.save()
    ctx.scale(S / R, S / R)
    ctx.translate(-x0, -y0)
    pintaCuerpo(ctx, nat.w, nat.h)
    pintarTrazos(ctx, visibles, enCursoVisible, nat.w, nat.h, perdidosAhora)
    ctx.restore()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(S / 2, S / 2 - 12); ctx.lineTo(S / 2, S / 2 + 12)
    ctx.moveTo(S / 2 - 12, S / 2); ctx.lineTo(S / 2 + 12, S / 2)
    ctx.stroke()
  })

  const elegirArchivo = (f: File | undefined) => {
    if (!f) return
    corridaRef.current++
    setMedia({ url: URL.createObjectURL(f), tipo: f.type.startsWith('image/') ? 'imagen' : 'video', nombre: f.name })
    setNat(null); ponTrazos([]); setEnCurso(null); setError(''); setAviso(''); setAvisoSeguir('')
    setTiempo(0); setDuracion(0)
    segRef.current = null; claveRef.current = 0; setClave(0)
    setCuerpos({}); setPistasCuerpo({}); setDeteccion(null); setVerCuerpo(true); setAvisoCuerpo('')
  }

  /* Si se cierra a mitad de buscar el cuerpo, que la búsqueda se retire. */
  useEffect(() => () => { corridaRef.current++ }, [])

  const paso = (n: number) => {
    const v = videoRef.current
    if (v && !ocupadoVisor) irA(claveDe(v.currentTime, FPS) + n)
  }
  const alternar = () => {
    const v = videoRef.current
    if (!v || ocupadoVisor) return
    if (v.paused) { v.playbackRate = vel; v.play().catch(() => {}) } else v.pause()
  }

  /** Salta a un tiempo y espera a que el fotograma esté (o dos segundos, por si no llega). */
  const saltarYEsperar = (v: HTMLVideoElement, t: number) => new Promise<void>(res => {
    const fin = () => { v.removeEventListener('seeked', fin); res() }
    v.addEventListener('seeked', fin)
    v.currentTime = t
    setTimeout(fin, 2000)
  })

  /**
   * Pasa el vídeo entero por el detector, fotograma a fotograma, y vuelve al
   * fotograma en el que se estaba. En una foto, una vez. Se puede parar a mitad:
   * lo buscado hasta ahí se queda.
   */
  const detectarCuerpo = async () => {
    if (!media || !nat || ocupadoVisor) return
    pararRef.current = false
    const corrida = ++corridaRef.current
    setDeteccion({ fase: 'preparando' })
    let det: Detector
    try {
      det = await cargarDetector((bajado, total) => {
        if (corrida === corridaRef.current) setDeteccion({ fase: 'bajando', bajado, total })
      })
    } catch (e) {
      if (corrida !== corridaRef.current) return
      setDeteccion({
        fase: 'error',
        mensaje: (e as Error).message === SIN_SIMD
          ? 'Este navegador es demasiado antiguo para detectar el cuerpo. Prueba desde un ordenador o actualízalo.'
          : 'No se ha podido cargar el detector. Comprueba la conexión y vuelve a probar.',
      })
      return
    }
    if (corrida !== corridaRef.current) return
    setCuerpos({}); setPistasCuerpo({}); setVerCuerpo(true); setAvisoCuerpo('')
    const lienzo = document.createElement('canvas')
    const f = Math.min(1, 1280 / Math.max(nat.w, nat.h))
    lienzo.width = Math.round(nat.w * f); lienzo.height = Math.round(nat.h * f)
    const ctx = lienzo.getContext('2d')
    /* Se le pasa un lienzo y no el vídeo: drawImage endereza los vídeos girados del móvil. */
    const leer = (fuente: CanvasImageSource, ms: number) => {
      if (!ctx) return null
      ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height)
      try { return detectar(det, lienzo, nat.w, nat.h, ms) } catch { return null }
    }

    if (media.tipo === 'imagen') {
      const c = imgRef.current ? leer(imgRef.current, 0) : null
      if (c) { setCuerpos({ 0: c }); setDeteccion(null) }
      else setDeteccion({ fase: 'error', mensaje: 'No se ve a nadie en la foto.' })
      return
    }

    const v = videoRef.current
    if (!v || !Number.isFinite(v.duration)) { setDeteccion({ fase: 'error', mensaje: 'No se sabe cuánto dura este vídeo.' }); return }
    v.pause()
    const vuelta = claveRef.current
    const total = Math.max(1, Math.ceil(v.duration * FPS))
    const hallados: Record<number, Cuerpo> = {}
    /* Cada fotograma con las piernas donde estaban en el anterior: de perfil, el detector a veces las cruza. */
    let anterior: Cuerpo | null = null
    for (let k = 0; k < total; k++) {
      await saltarYEsperar(v, centroDe(k, FPS))
      if (corrida !== corridaRef.current) return
      if (pararRef.current) break
      const leido = leer(v, (k / FPS) * 1000)
      if (leido) {
        const c = descruzar(anterior, leido)
        hallados[k] = c
        anterior = c
        setCuerpos({ ...hallados })
      }
      setDeteccion({ fase: 'buscando', hechos: k + 1, total })
    }
    setDeteccion(Object.keys(hallados).length ? null : { fase: 'error', mensaje: 'No se ve a nadie en el vídeo.' })
    irA(vuelta)
  }
  /**
   * Tras arrastrar un punto del esqueleto: el seguimiento lo lleva fotograma a
   * fotograma hacia delante y luego hacia atrás (lib/corregir-esqueleto dice
   * cuándo parar), y lo va poniendo según avanza. Si se pierde, el vídeo se
   * queda en ese fotograma para corregirlo otra vez; si no, vuelve a donde estaba.
   */
  const seguirCorreccion = async (punto: number, k: number, p: Punto) => {
    const v = videoRef.current
    if (!v || !nat || siguiendoRef.current || !Number.isFinite(v.duration) || !v.videoWidth) return
    v.pause()
    const esc = Math.min(1, LADO_SEGUIR / Math.max(v.videoWidth, v.videoHeight))
    const n = Math.round(v.videoWidth * esc) * Math.round(v.videoHeight * esc)
    const base = capturar(new Float32Array(n))
    const plantilla = base ? tomarPlantilla(base.gris, p.x * esc, p.y * esc) : null
    const nombre = nombrePunto(punto).toLowerCase()
    if (!base || !plantilla) {
      setAvisoCuerpo(`Ahí la imagen no tiene nada que seguir (ropa lisa, una sombra): tu corrección de ${nombre} vale solo para el fotograma ${k}.`)
      return
    }
    siguiendoRef.current = true
    pararSeguirRef.current = false
    setSiguiendoCuerpo({ punto, clave: k })
    const corrida = corridaRef.current
    const total = Math.max(1, Math.ceil(v.duration * FPS))
    /* Dos memorias por sentido, que se turnan; la del fotograma corregido no se toca: es de donde salen los dos. */
    const memorias = [new Float32Array(n), new Float32Array(n)]
    const correr = (paso: 1 | -1) => {
      let anterior: Gris = base.gris
      let estado: PuntoSeguido = { x: p.x * esc, y: p.y * esc, plantilla }
      let turno = 0
      return propagar({
        inicio: k, paso, primero: 0, ultimo: total - 1,
        ocupado: kk => !!pistasRef.current[punto]?.[kk],
        seguir: async kk => {
          await saltarYEsperar(v, centroDe(kk, FPS))
          if (corrida !== corridaRef.current) return null
          const cap = capturar(memorias[turno])
          turno = 1 - turno
          if (!cap) return null
          const r = avanzar(anterior, cap.gris, estado)
          if (!r.bien) return null
          anterior = cap.gris
          estado = r.s
          const donde = { x: r.s.x / esc, y: r.s.y / esc }
          /* Se pone según avanza: así se ve el punto ir con el cuerpo. */
          setPistasCuerpo(ps => conPuestos(ps, punto, [{ clave: kk, p: donde, desde: kk - paso }]))
          setSiguiendoCuerpo({ punto, clave: kk })
          return donde
        },
        detectado: kk => cuerposRef.current[kk]?.[punto],
        tolerancia: COINCIDE_PROPORCION * Math.max(nat.w, nat.h),
        parar: () => pararSeguirRef.current || corrida !== corridaRef.current,
      })
    }
    const adelante = await correr(1)
    const atras = await correr(-1)
    siguiendoRef.current = false
    setSiguiendoCuerpo(null)
    if (corrida !== corridaRef.current) return
    const puestos = [...adelante.puestos, ...atras.puestos]
    setPistasCuerpo(ps => conPuestos(ps, punto, puestos))
    const claves = [k, ...puestos.map(s => s.clave)]
    const desde = Math.min(...claves), hasta = Math.max(...claves)
    const dicho = puestos.length
      ? `Tu corrección de ${nombre} (fotograma ${k}) se ha seguido del ${desde} al ${hasta}`
      : `Tu corrección de ${nombre} (fotograma ${k}) no se ha podido seguir a los de al lado`
    const perdido = adelante.fin === 'perdido' ? adelante : atras.fin === 'perdido' ? atras : null
    if (perdido) {
      irA(perdido.en)
      setHerr('mover')
      setAvisoSeguir(`${dicho}. En el ${perdido.en} el punto se ha vuelto a perder: arrástralo a su sitio y seguirá desde ahí.`)
    } else {
      irA(k)
      setAvisoCuerpo(dicho + (adelante.fin === 'parado' || atras.fin === 'parado' ? '. Lo has parado ahí.' : '. Fuera de ese tramo manda lo que ve la app.'))
    }
  }

  const cambiarVel = (x: number) => {
    setVel(x)
    if (videoRef.current) videoRef.current.playbackRate = x
  }

  const aNatural = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const k = r.width / (nat?.w || 1)
    const cx = e.clientX - r.left, cy = e.clientY - r.top
    return { p: { x: cx / k, y: cy / k }, k, cx, cy }
  }

  const alPulsar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!nat || siguiendoRef.current) return
    movidoRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    const a = aNatural(e)
    setLupa(a)
    if (herr === 'mover') {
      let mejor: { t: number; p: number } | { c: number } | null = null
      let dmin = 24 / a.k
      visibles.forEach((t, ti) => t.puntos.forEach((q, pi) => {
        const d = Math.hypot(q.x - a.p.x, q.y - a.p.y)
        if (d < dmin) { dmin = d; mejor = { t: ti, p: pi } }
      }))
      /* Y los puntos del esqueleto, si se ve. */
      if (cuerpoAhora && verCuerpo) {
        for (const i of DIBUJADOS) {
          const q = cuerpoAhora[i]
          const d = q ? Math.hypot(q.x - a.p.x, q.y - a.p.y) : Infinity
          if (d < dmin) { dmin = d; mejor = { c: i } }
        }
      }
      setArrastre(mejor)
      return
    }
    setProvisional(a.p)
  }

  const alMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!lupa) return
    const a = aNatural(e)
    setLupa(a)
    if (herr === 'mover' && arrastre && 'c' in arrastre) {
      /* Un punto del esqueleto: aquí lo pone el entrenador. Al soltar se sigue desde aquí (seguirCorreccion). */
      const k = claveRef.current, c = arrastre.c
      movidoRef.current = true
      setPistasCuerpo(ps => corregirPunto(ps, c, k, a.p))
    } else if (herr === 'mover' && arrastre && 't' in arrastre) {
      /* En uno que se sigue, corregir es poner ese fotograma a mano: lo que se
         siguió desde aquí se borra y se vuelve a seguir desde el punto bueno.
         Solo ese punto coge recorte nuevo; los demás siguen con el suyo, que
         cada recorte nuevo mete un poco de error. */
      const t = trazosRef.current[arrastre.t]
      if (t?.pista) { segRef.current?.plantillas.delete(t.id + ':' + arrastre.p); asegurarCaptura() }
      ponTrazos(ts => ts.map((x, ti) => ti !== arrastre.t ? x : moverPunto(x, claveRef.current, arrastre.p, a.p)))
    } else if (herr !== 'mover') setProvisional(a.p)
  }

  const alSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (herr !== 'mover' && provisional) {
      const a = aNatural(e)
      const tipo = herr
      const puntos = [...(enCurso?.tipo === tipo ? enCurso.puntos : []), a.p]
      if (puntos.length >= PUNTOS_POR_TRAZO[tipo]) {
        idRef.current += 1
        const nuevo: TrazoVivo = { id: idRef.current, tipo, puntos }
        const conPista = media?.tipo === 'video' && seguirRef.current
        ponTrazos(ts => anadirTrazo(ts, conPista ? empezarPista(nuevo, claveRef.current) : nuevo))
        if (conPista) asegurarCaptura()
        setEnCurso(null)
      } else setEnCurso({ tipo, puntos })
    }
    /* El aviso de punto perdido se quita al soltar, no al empezar a arrastrar:
       si cambiara a mitad, el vídeo se movería bajo el dedo. */
    if (arrastre) { setAvisoSeguir(''); setAvisoCuerpo('') }
    if (arrastre && 'c' in arrastre && movidoRef.current && media?.tipo === 'video') {
      void seguirCorreccion(arrastre.c, claveRef.current, aNatural(e).p)
    }
    movidoRef.current = false
    setProvisional(null); setArrastre(null); setLupa(null)
  }

  const deshacer = () => {
    if (enCurso) { setEnCurso(enCurso.puntos.length > 1 ? { ...enCurso, puntos: enCurso.puntos.slice(0, -1) } : null); return }
    ponTrazos(ts => ts.slice(0, -1))
    setAvisoSeguir('')
  }

  const ponCriterio = (cual: string) => setCriterios(c => {
    const ahora = c[cual]
    const sig = { ...c }
    if (ahora === undefined) sig[cual] = true
    else if (ahora === true) sig[cual] = false
    else delete sig[cual]
    return sig
  })

  /** El fotograma con lo dibujado y una línea de pie que dice qué es. */
  const componer = async (): Promise<Blob | null> => {
    const el = media?.tipo === 'video' ? videoRef.current : imgRef.current
    if (!el || !nat) return null
    const f = Math.min(1, 1280 / Math.max(nat.w, nat.h))
    const w = Math.round(nat.w * f), h = Math.round(nat.h * f)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(el, 0, 0, w, h)
    ctx.save(); ctx.scale(f, f); pintaCuerpo(ctx, nat.w, nat.h); pintarTrazos(ctx, visibles, null, nat.w, nat.h); ctx.restore()
    const banda = Math.max(22, Math.round(h * 0.045))
    ctx.fillStyle = 'rgba(0,0,0,.62)'
    ctx.fillRect(0, h - banda, w, banda)
    ctx.fillStyle = '#e5e7eb'
    ctx.font = `600 ${Math.round(banda * 0.5)}px system-ui, sans-serif`
    const pie = (bat
      ? [bat.bateria.nombre, bat.prueba.nombre, NOMBRE_LADO[lado], fechaLarga(bat.valoracion.fecha).toLowerCase()]
      : [libre?.analisis.titulo, libre?.nombreDeportista, fechaLarga(hoyISO()).toLowerCase()]
    ).filter(Boolean).join(' · ')
    ctx.fillText(pie, Math.round(banda * 0.4), h - Math.round(banda * 0.32))
    return await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.86))
  }

  /** Lo que se guarda de este fotograma: de cuál es, lo dibujado, lo seguido y lo del esqueleto (con sus curvas). */
  const medidasParaGuardar = (): Medida[] => {
    /* Lo del fotograma en el que se está, y de lo seguido, lo que recorrió en el vídeo. */
    const enElVideo: Medida[] = recorridos.map(r => {
      const e = extremosDe(r.serie)!
      return { nombre: r.nombre + ' en el vídeo', valor: textoRecorrido(r.tipo, e.min.valor, e.max.valor) }
    })
    /* Del esqueleto, cada medida de este fotograma con cuánto fiarse. */
    const delEsqueleto: Medida[] = cuerpoAhora && verCuerpo
      ? medidasC.filter(m => m.valor != null).map(m => ({
        nombre: m.nombre + ' (esqueleto)',
        valor: m.texto + ' · ' + NOMBRE_FIABILIDAD[m.fiabilidad] + (m.dudosa ? ' · punto dudoso' : ''),
      }))
      : []
    /* Y cada medida en todo el vídeo; si no es del todo fiable, lo dice («Rodilla en
       el vídeo (esqueleto)», como antes). Las del lado que se mide van TODAS y con su
       curva: el informe (lib/informe-movimiento) pregunta luego cuáles dibujar, y del
       vídeo no queda nada más. Del otro lado, solo lo que se esté mirando en la gráfica. */
    const enElVideoCuerpo = (c: ClaveGrafica, l: LadoCuerpo, serie: Serie): Medida | null => {
      const e = serie.length >= MINIMO_SERIE ? extremosDe(serie) : null
      if (!e) return null
      const f = fiabilidadDe(c)
      const curva = l === ladoMedido ? aSerieGuardada(c, l, serie, FPS) : null
      return {
        nombre: NOMBRE_MEDIDA[c] + ' en el vídeo (esqueleto' + (l !== ladoMedido ? ', lado ' + LADO_CUERPO[l] : '') + ')',
        valor: textoRecorrido('angulo', e.min.valor, e.max.valor) + (f === 'fiable' ? '' : ' · ' + NOMBRE_FIABILIDAD[f]),
        ...(curva ? { serie: curva } : {}),
      }
    }
    if (verCuerpo && hayCuerpo && vista === 'perfil') {
      for (const c of MEDIDAS_GRAFICA) {
        const m = enElVideoCuerpo(c, ladoMedido, serieCuerpo(cuerpos, ajustesCuerpo, ladoMedido, vista, c, incl))
        if (m) delEsqueleto.push(m)
      }
      if (ladoGraf !== ladoMedido) {
        for (const m of [enElVideoCuerpo(graf.clave, ladoGraf, serieGraf), graf.encima ? enElVideoCuerpo(graf.encima, ladoGraf, serieEncima) : null]) {
          if (m) delEsqueleto.push(m)
        }
      }
    }
    /* De qué fotograma salen las medidas y la imagen, y si es el que miró la app: el informe lo dice debajo de ella. */
    const delFotograma = media?.tipo === 'video'
      ? medidaDelFotograma(clave / FPS, sugerencia?.clave === clave)
      : medidaDelFotograma(null, false)
    /* La nota que sugirió la app, al lado de la que se pone: para ver con el tiempo cuántas veces coinciden. */
    if (sugerencia && sugerencia.criterios.length && prueba) {
      delEsqueleto.push({ nombre: 'Nota sugerida', valor: textoParaGuardar(sugerencia, prueba, alza) })
    }
    return [delFotograma, ...medidasDe(visibles), ...enElVideo, ...delEsqueleto]
  }

  const guardar = async () => {
    if (!bat || !prueba) return
    if (nota == null && !dolor) { setError('Pon la nota, o marca que duele.'); return }
    setGuardando(true); setError(''); setAviso('')
    let fotograma: string | undefined = undefined
    let sinImagen = ''
    if (media && nat) {
      if (!permiso) sinImagen = 'sin imagen: falta su permiso'
      else {
        const blob = await componer()
        if (blob) {
          const ruta = rutaFotograma(idDeportista, bat.valoracion.id, prueba.clave, lado)
          const r = await subirFotograma(supabase, ruta, blob)
          if (r.error) sinImagen = 'la imagen no se ha subido (' + r.error + ')'
          else fotograma = ruta
        }
      }
    }
    const r = await guardarPrueba(supabase, {
      idValoracion: bat.valoracion.id, idDeportista, prueba: prueba.clave, lado, nota, dolor, criterios,
      ...(media && nat ? { medidas: medidasParaGuardar(), dibujo: visibles, vista } : {}),
      ...(fotograma ? { fotograma } : {}),
    })
    setGuardando(false)
    if (r.error) { setError('No se ha podido guardar: ' + r.error); return }
    setAviso('Guardado' + (fotograma ? ', con el fotograma.' : sinImagen ? ' · ' + sinImagen + '.' : '.'))
    bat.onGuardado()
  }

  /* En un análisis libre: cada fotograma que se quiera, con sus medidas; la imagen, con permiso. */
  const guardarLibre = async () => {
    if (!libre) return
    if (!media || !nat) { setError('Elige el vídeo o la foto, y ve al fotograma que quieras guardar.'); return }
    setGuardando(true); setError(''); setAviso('')
    /* Se compone siempre: sin permiso no se sube, pero vale para el informe de ahora (no sale del dispositivo). */
    const blob = await componer()
    const r = await guardarFotogramaLibre(supabase, {
      analisis: libre.analisis, segundo: media.tipo === 'video' ? clave / FPS : null,
      medidas: medidasParaGuardar(), dibujo: visibles, imagen: permiso ? blob : null,
    })
    setGuardando(false)
    if (r.error || !r.fotograma) { setError('No se ha podido guardar: ' + (r.error || 'sin respuesta')); return }
    const n = libre.yaGuardados + 1
    setAviso('Guardado el fotograma ' + n + (r.fotograma.imagen ? ', con su imagen.'
      : r.sinImagen ? ' · ' + r.sinImagen + '.' : ' · sin imagen: falta su permiso. Sale en el informe de ahora, pero no se guarda.'))
    libre.onFotograma(r.fotograma, blob ? URL.createObjectURL(blob) : null)
  }

  /* Las notas de un análisis libre, al salir del cuadro (si han cambiado). */
  const guardarNotas = async () => {
    if (!libre) return
    const ahora = notas.trim() ? notas : null
    if ((ahora ?? '') === (libre.analisis.notas ?? '')) return
    const r = await cambiarAnalisisLibre(supabase, libre.analisis.id, { notas: ahora })
    if (r.error) { setAvisoNotas('No se han podido guardar: ' + r.error); return }
    setAvisoNotas('Notas guardadas.')
    libre.onNotas(ahora)
  }

  const otroLado: Lado | null = prueba?.bilateral ? (lado === 'izq' ? 'der' : 'izq') : null
  const guardadaOtro = otroLado ? guardadas.find(g => g.lado === otroLado) : null
  const medidas = medidasDe(visibles)
  const notaVisible = dolor ? 0 : nota
  const haySeguidos = trazos.some(t => t.pista)
  /* Una sola línea de ayuda del seguimiento, la que toque ahora. */
  const ayudaSeguir = !seguir ? ''
    : !CON_FOTOGRAMAS ? 'En este navegador los puntos se siguen pasando de uno en uno (›), no al reproducir.'
    : !haySeguidos ? 'Los ángulos, líneas y distancias que dibujes irán con el cuerpo al avanzar el vídeo.'
    : fueraDelTramo ? 'Fotograma sin seguir: los puntos están donde se quedaron. Recolócalos aquí o avanza desde el tramo seguido.'
    : 'Los puntos van con el cuerpo al avanzar. Si uno se va, arrástralo con «mover». Con pegatinas en las articulaciones va mucho mejor.'

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col" role="dialog" aria-modal="true"
      aria-label={'Analizar ' + (prueba?.nombre ?? libre?.analisis.titulo ?? '')}>
      {/* ── cabecera ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-800 bg-gray-900">
        {bat ? (
          <p className="text-[13px] text-gray-400 min-w-0">
            {bat.bateria.nombre} › <b className="text-white font-semibold">{bat.prueba.nombre}</b>
          </p>
        ) : (
          <p className="text-[13px] text-gray-400 min-w-0">
            Análisis libre › <b className="text-white font-semibold">{libre?.analisis.titulo}</b>
            {libre?.nombreDeportista && <span className="ml-2 text-[11.5px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 whitespace-nowrap">{libre.nombreDeportista}</span>}
          </p>
        )}
        {prueba?.bilateral && (
          <div className="flex gap-1">
            {(['izq', 'der'] as Lado[]).map(l => {
              const g = guardadas.find(x => x.lado === l)
              return (
                <button key={l} onClick={() => setLado(l)}
                  className={'text-[12.5px] px-3 py-1.5 rounded-lg border transition ' + (lado === l
                    ? 'bg-orange-500/15 border-orange-500/50 text-orange-300 font-semibold'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>
                  {l === 'izq' ? 'Izquierda' : 'Derecha'}{g ? ' ✓ ' + (g.dolor ? '0' : g.nota ?? '—') : ''}
                </button>
              )
            })}
          </div>
        )}
        <span className="flex-1" />
        <span className="hidden md:inline text-[11.5px] text-gray-500">
          {permiso ? 'El vídeo no sale de este dispositivo · se guarda solo el fotograma'
            : bat ? 'Sin su permiso: se guarda la nota, no la imagen' : 'Sin su permiso: se guardan las medidas, no la imagen'}
        </span>
        <button onClick={onCerrar} className="text-[13px] px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">Cerrar</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[64px_minmax(0,1fr)_340px]">
        {/* ── herramientas ── */}
        <nav aria-label="Herramientas" className="flex lg:flex-col gap-1.5 p-2 border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900/60 overflow-x-auto">
          {HERRAMIENTAS.map(h => (
            <button key={h} onClick={() => { setHerr(h); setEnCurso(null) }} title={COMO_SE_USA[h]}
              className={'flex-none w-14 py-2 rounded-xl text-[10.5px] font-semibold border transition ' + (herr === h
                ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800')}>
              {NOMBRE_HERRAMIENTA[h]}
            </button>
          ))}
          <span className="hidden lg:block h-px bg-gray-800 my-1" />
          <button onClick={deshacer} disabled={!trazos.length && !enCurso} title="Quitar lo último"
            className="flex-none w-14 py-2 rounded-xl text-[10.5px] font-semibold text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition">deshacer</button>
          <button onClick={() => { ponTrazos([]); setEnCurso(null); setAvisoSeguir('') }} disabled={!trazos.length && !enCurso} title="Borrar todo lo dibujado"
            className="flex-none w-14 py-2 rounded-xl text-[10.5px] font-semibold text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition">borrar</button>
        </nav>

        {/* ── el fotograma ── */}
        <div className="flex flex-col min-w-0 lg:min-h-0">
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            {(prueba ? prueba.vistas : VISTAS).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={'text-[12.5px] px-3 py-1.5 rounded-lg border transition ' + (vista === v
                  ? 'bg-gray-800 border-gray-600 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
                {mayuscula(DE_VISTA[v])}
              </button>
            ))}
            {media && (
              <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {/* El esqueleto: detectarlo, ver cómo va, o enseñarlo y esconderlo. */}
                {nat && siguiendoCuerpo ? (
                  <span className="flex items-center gap-2 text-[12px] text-orange-200" role="status">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    Siguiendo {nombrePunto(siguiendoCuerpo.punto).toLowerCase()} · fotograma {siguiendoCuerpo.clave}
                    <button onClick={() => { pararSeguirRef.current = true }}
                      className="px-2 py-1 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition">Parar</button>
                  </span>
                ) : nat && (deteccion && deteccion.fase !== 'error' ? (
                  <span className="flex items-center gap-2 text-[12px] text-gray-300" role="status">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    {deteccion.fase === 'buscando' ? `Buscando el cuerpo · ${deteccion.hechos} de ${deteccion.total}`
                      : deteccion.fase === 'bajando' && deteccion.total > 0 && deteccion.bajado < deteccion.total
                        ? `Bajando el detector (solo la primera vez) · ${Math.round(deteccion.bajado / 1e6)} de ${Math.round(deteccion.total / 1e6)} MB`
                        : 'Preparando el detector…'}
                    {deteccion.fase === 'buscando' && (
                      <button onClick={() => { pararRef.current = true }}
                        className="px-2 py-1 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition">Parar</button>
                    )}
                  </span>
                ) : hayCuerpo ? (
                  <span className="flex items-center gap-2">
                    <button onClick={() => setVerCuerpo(x => !x)} aria-pressed={verCuerpo}
                      className={'flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition ' + (verCuerpo
                        ? 'border-white/40 bg-white/10 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
                      <span aria-hidden="true" className={'w-2 h-2 rounded-full ' + (verCuerpo ? 'bg-white' : 'bg-gray-600')} />
                      Esqueleto
                    </button>
                    <button onClick={detectarCuerpo} title="Volver a buscar el cuerpo en todo el vídeo (se pierden las correcciones)"
                      className="text-[12px] text-gray-500 hover:text-white underline decoration-dotted underline-offset-4">otra vez</button>
                  </span>
                ) : (
                  <button onClick={detectarCuerpo}
                    title="La app coloca las articulaciones en todo el vídeo y mide sola. Corre en este dispositivo: la primera vez baja el detector (unos 42 MB) y después queda guardado."
                    className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-white hover:bg-gray-700 transition">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full bg-white" />
                    Detectar el cuerpo
                  </button>
                ))}
                <label className="text-[12px] text-gray-400 hover:text-white cursor-pointer underline decoration-dotted underline-offset-4">
                  Cambiar de vídeo
                  <input type="file" accept="video/*,image/*" className="sr-only" onChange={e => elegirArchivo(e.target.files?.[0])} />
                </label>
              </div>
            )}
          </div>
          {deteccion?.fase === 'error' && <p className="px-4 pt-1.5 text-[12px] text-red-300" role="alert">{deteccion.mensaje}</p>}

          <div className="flex-1 min-h-0 flex items-center justify-center p-3">
            {!media ? (
              <div className="w-full max-w-md rounded-2xl border border-dashed border-gray-700 p-6 text-center flex flex-col gap-3">
                <p className="text-[15px] font-semibold">Elige el vídeo {DE_VISTA[vista]}</p>
                {/* En una prueba de batería, su ficha: lo que se le dice, el material y cómo se graba. */}
                {prueba ? (
                  <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-left"><FichaCorta prueba={prueba} /></div>
                ) : (
                  <p className="text-[12.5px] text-gray-400">Lo que quieras analizar. Guardas los fotogramas que elijas, cada uno con sus medidas, y puedes cambiar de vídeo sin salir.</p>
                )}
                <p className="text-[12px] text-gray-500">Móvil quieto y recto (el nivel de la cámara ayuda), a la altura de la cadera y a unos 3 m, con el cuerpo entero dentro. También vale una foto.</p>
                <label className="self-center bg-orange-500 hover:bg-orange-400 text-white text-[14px] font-semibold px-5 py-3 rounded-xl cursor-pointer transition">
                  Elegir vídeo o foto
                  <input type="file" accept="video/*,image/*" className="sr-only" onChange={e => elegirArchivo(e.target.files?.[0])} />
                </label>
                <p className="text-[11.5px] text-gray-500">El vídeo no sale de este dispositivo.</p>
              </div>
            ) : (
              /* La caja del vídeo, con la proporción del vídeo SIEMPRE: el dibujo va encima y se
                 estira con ella. Antes llevaba el alto fijo y el ancho recortado al de la pantalla,
                 y con un vídeo en horizontal en el móvil la caja salía alta y estrecha: el vídeo se
                 veía con bandas negras, pero el dibujo se estiraba a lo alto y no caía encima. Ahora
                 el ancho es el que quepa sin pasarse ni del ancho ni del alto, y el alto sale de él. */
              <div className="relative max-w-full" style={nat
                ? { aspectRatio: nat.w + ' / ' + nat.h, width: `min(100%, calc(min(68vh, 900px) * ${nat.w / nat.h}))` }
                : { height: 'min(68vh, 900px)' }}>
                {media.tipo === 'video' ? (
                  <video ref={videoRef} src={media.url} playsInline muted preload="auto"
                    className="absolute inset-0 w-full h-full rounded-lg bg-black object-contain"
                    onLoadedMetadata={e => { const v = e.currentTarget; setNat({ w: v.videoWidth, h: v.videoHeight }); setDuracion(v.duration || 0); v.playbackRate = vel }}
                    onTimeUpdate={e => {
                      const t = e.currentTarget.currentTime
                      setTiempo(t)
                      if (!CON_FOTOGRAMAS) { claveRef.current = claveDe(t, FPS); setClave(claveRef.current) }
                    }}
                    onSeeked={e => {
                      const t = e.currentTarget.currentTime
                      setTiempo(t)
                      if (e.currentTarget.paused) alFotograma(t)
                    }}
                    onPlay={() => setEnMarcha(true)}
                    onPause={e => { setEnMarcha(false); alFotograma(e.currentTarget.currentTime) }}
                    onError={() => setError('Este navegador no puede abrir este vídeo. Prueba desde el móvil con el que se grabó, o grábalo en «más compatible» (H.264).')} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img ref={imgRef} src={media.url} alt="La foto que vas a analizar"
                    className="absolute inset-0 w-full h-full rounded-lg bg-black object-contain"
                    onLoad={e => { const i = e.currentTarget; setNat({ w: i.naturalWidth, h: i.naturalHeight }) }} />
                )}
                {nat && (
                  <canvas ref={lienzoRef} width={nat.w} height={nat.h}
                    className="absolute inset-0 w-full h-full rounded-lg cursor-crosshair"
                    style={{ touchAction: 'none' }}
                    onPointerDown={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} />
                )}
                {lupa && (
                  <canvas ref={lupaRef} width={240} height={240} aria-hidden="true"
                    className="absolute pointer-events-none rounded-full border-2 border-white/80 shadow-lg"
                    style={{ width: 120, height: 120, left: Math.max(0, lupa.cx - 140), top: Math.max(0, lupa.cy - 140) }} />
                )}
              </div>
            )}
          </div>

          {media && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              <p className="text-[11.5px] text-gray-500">{COMO_SE_USA[herr]}</p>
              {media.tipo === 'video' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => paso(-1)} disabled={ocupadoVisor} title="Fotograma anterior (←)" className="h-9 min-w-9 px-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 transition">‹</button>
                    <button onClick={alternar} disabled={ocupadoVisor} title="Reproducir (espacio)" className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold disabled:opacity-40 transition">{enMarcha ? 'Pausa' : '▶'}</button>
                    <button onClick={() => paso(1)} disabled={ocupadoVisor} title="Fotograma siguiente (→)" className="h-9 min-w-9 px-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 transition">›</button>
                    <div className="flex gap-1 ml-1">
                      {VELOCIDADES.map(x => (
                        <button key={x} onClick={() => cambiarVel(x)}
                          className={'text-[11.5px] font-mono px-2 py-1.5 rounded-md border transition ' + (vel === x
                            ? 'border-orange-500/50 bg-orange-500/15 text-orange-300' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
                          ×{String(x).replace('.', ',')}
                        </button>
                      ))}
                    </div>
                    <button onClick={cambiarSeguir} aria-pressed={seguir}
                      title="Los ángulos, líneas y distancias buscan su sitio en cada fotograma al avanzar o reproducir"
                      className={'flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-md border transition ' + (seguir
                        ? 'border-orange-500/50 bg-orange-500/15 text-orange-300' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
                      <span aria-hidden="true" className={'w-2 h-2 rounded-full ' + (seguir ? 'bg-orange-400' : 'bg-gray-600')} />
                      Seguir los puntos
                    </button>
                    <span className="ml-auto font-mono text-[12px] text-gray-400 tabular-nums">
                      <b className="text-gray-200">{tiempo.toFixed(2).replace('.', ',')} s</b> / {duracion.toFixed(2).replace('.', ',')} s
                    </span>
                  </div>
                  <input type="range" min={0} max={duracion || 0} step={1 / FPS} value={tiempo} disabled={ocupadoVisor}
                    onChange={e => irA(claveDe(Number(e.target.value), FPS))}
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
                            <button key={'d' + t.desde} onClick={() => irA(t.desde)} disabled={ocupadoVisor}
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
                          <button onClick={() => irA(siguienteTramo.desde)} disabled={ocupadoVisor}
                            className="flex-none text-[11.5px] text-amber-300 hover:text-white underline decoration-dotted underline-offset-4 disabled:opacity-40">
                            Siguiente tramo dudoso →
                          </button>
                        )}
                      </div>
                    )
                  })()}
                  {/* Alto fijo: que cambiar de mensaje no mueva el vídeo. */}
                  <div className="min-h-[2.9em] text-[11.5px] leading-snug">
                    {avisoSeguir
                      ? <p className="text-red-300" role="alert">{avisoSeguir}</p>
                      : avisoCuerpo ? <p className="text-orange-200/90" role="status">{avisoCuerpo}</p>
                      : ayudaSeguir && <p className={fueraDelTramo && haySeguidos ? 'text-amber-300/90' : 'text-gray-500'}>{ayudaSeguir}</p>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── el panel: medidas, criterios, nota ── */}
        <aside className="border-t lg:border-t-0 lg:border-l border-gray-800 bg-gray-900/60 p-4 flex flex-col gap-4 lg:overflow-y-auto">
          {/* Con el vídeo puesto, la ficha sigue a mano, plegada para no tapar las medidas. */}
          {bat && prueba && media && (
            <details className="group rounded-xl border border-gray-800 bg-gray-900 p-3.5">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[13.5px] font-semibold flex justify-between items-center">
                Cómo se hace esta prueba <span className="text-gray-500 text-[12px]"><span className="group-open:hidden">▾</span><span className="hidden group-open:inline">▴</span></span>
              </summary>
              <div className="mt-2.5"><FichaCorta prueba={prueba} /></div>
            </details>
          )}
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
                  <button onClick={() => irA(c.fotograma)} disabled={ocupadoVisor} title="Ir a ese fotograma"
                    className="text-left text-[12.5px] hover:text-white disabled:opacity-60">{nombrePunto(c.punto)} · fotograma {c.fotograma}</button>
                  <button onClick={() => { setPistasCuerpo(ps => deshacerCorreccion(ps, c.punto, c.fotograma)); setAvisoSeguir(''); setAvisoCuerpo('') }} disabled={ocupadoVisor}
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

          {bat && prueba && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5">
              <p className="text-[13.5px] font-semibold">{bat.bateria.nombre} · {prueba.nombre}{lado !== 'unico' ? ' · ' + NOMBRE_LADO[lado] : ''}</p>
              {prueba.queLado && <p className="text-[11px] text-gray-500">Se puntúa {prueba.queLado}.</p>}
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {prueba.criterios.map(c => {
                  const v = criterios[c.clave]
                  /* Lo que ve la app de este criterio, si lo puede medir. La marca la sigue poniendo el entrenador. */
                  const visto = vistoDe(c.clave)
                  return (
                    <li key={c.clave}>
                      <button onClick={() => ponCriterio(c.clave)} title="Pulsa: se cumple, no se cumple, sin marcar"
                        className={'w-full text-left flex gap-2.5 items-start rounded-lg px-2 py-1.5 transition hover:bg-gray-800 ' + (c.vista === vista ? '' : 'opacity-60')}>
                        <span className={'w-5 flex-none font-bold ' + (v === true ? 'text-green-400' : v === false ? 'text-red-400' : 'text-gray-600')}>
                          {v === true ? '✓' : v === false ? '✗' : '·'}
                        </span>
                        <span className="text-[12.5px] leading-snug">
                          {c.texto}
                          <span className="block text-[10.5px] text-gray-500">{DE_VISTA[c.vista]}{c.con === 'ojo' ? ' · a ojo' : ''}</span>
                          {visto && (
                            <span className={'block text-[10.5px] mt-0.5 ' + (visto.veredicto === 'cumple' ? 'text-green-300'
                              : visto.veredicto === 'no' ? 'text-red-300' : visto.veredicto === 'limite' ? 'text-amber-300' : 'text-sky-300')}>
                              La app ve: {visto.veredicto === 'cumple' ? 'se cumple · ' : visto.veredicto === 'no' ? 'no se cumple · '
                                : visto.veredicto === 'limite' ? 'en el límite · ' : ''}{visto.texto}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {sugerencia && (
                <div className="mt-3 rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 py-2.5 flex flex-col gap-1.5">
                  <p className="text-[12.5px] text-sky-100 flex items-center gap-2 flex-wrap">
                    {sugerencia.nota != null
                      ? <span>La app apunta a <b className="font-mono text-[15px] text-white">{sugerencia.nota}</b></span>
                      : <b className="font-semibold">Lo que ve la app</b>}
                    {sugerencia.limite && <span className="text-[10.5px] px-1.5 py-px rounded-full bg-amber-500/15 text-amber-300 font-semibold">en el límite</span>}
                  </p>
                  <p className="text-[12px] text-gray-300 leading-snug">{sugerencia.explicacion}</p>
                  {sugerencia.falta.length > 0 && (
                    <div className="text-[11px] text-gray-400 leading-snug">
                      <p className="text-gray-500">Lo que no ve la app:</p>
                      <ul className="list-disc pl-4">{sugerencia.falta.map(f => <li key={f}>{f}</li>)}</ul>
                    </div>
                  )}
                  {TEXTO_ALZA[prueba.clave] && (
                    <label className="flex items-center gap-2 text-[12px] text-gray-300 cursor-pointer select-none">
                      <input type="checkbox" checked={alza} onChange={e => setAlza(e.target.checked)} className="accent-sky-400" />
                      {TEXTO_ALZA[prueba.clave]}
                    </label>
                  )}
                  {sugerencia.clave != null && media?.tipo === 'video' && (
                    <button onClick={() => irA(sugerencia.clave!)}
                      className="self-start text-[11.5px] text-sky-300 hover:text-white underline decoration-dotted underline-offset-4">
                      Ver el fotograma que ha mirado ({segundos(sugerencia.clave / FPS)})
                    </button>
                  )}
                  <p className="text-[10.5px] text-gray-500 leading-snug">Es una propuesta: la nota la pones tú. Se guarda al lado de la tuya, para ver con el tiempo cuántas veces coincidís.</p>
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5 mt-3">
                {[3, 2, 1, 0].map(n => (
                  <button key={n} onClick={() => { if (n === 0) { setDolor(true); setNota(0) } else { setDolor(false); setNota(n) } }}
                    title={sugerencia?.nota === n && notaVisible !== n ? 'La que apunta la app' : undefined}
                    className={'h-11 rounded-xl border font-mono text-lg font-bold transition ' + (notaVisible === n
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : sugerencia?.nota === n
                        ? 'bg-gray-800 border-dashed border-sky-400/70 text-sky-200 hover:text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-gray-500 leading-snug">
                <span><b className="text-gray-300">3</b> · {prueba.notas[3]}</span>
                <span><b className="text-gray-300">2</b> · {prueba.notas[2]}</span>
                <span><b className="text-gray-300">1</b> · {prueba.notas[1]}</span>
                <span><b className="text-gray-300">0</b> · Duele durante la prueba.</span>
              </div>
              {prueba.bilateral && (
                <p className="text-[11.5px] text-gray-400 mt-2">
                  En las de dos lados cuenta el peor.
                  {guardadaOtro && <> El {otroLado === 'izq' ? 'izquierdo' : 'derecho'} ya tiene un <b className="text-gray-200">{guardadaOtro.dolor ? 0 : guardadaOtro.nota}</b>.</>}
                </p>
              )}
            </div>
          )}

          {libre && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13.5px] font-semibold">Tus notas</p>
                <span className="text-[11px] text-gray-500">{libre.yaGuardados === 1 ? '1 fotograma guardado' : libre.yaGuardados + ' fotogramas guardados'}</span>
              </div>
              <textarea value={notas} onChange={e => { setNotas(e.target.value); setAvisoNotas('') }} onBlur={guardarNotas}
                maxLength={4000} rows={4} aria-label="Tus notas del análisis"
                placeholder="Lo que ves, para ti y para el informe: «a partir de 60 kg baja con el tronco mucho más inclinado»."
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-[12.5px] text-gray-100 placeholder:text-gray-500 resize-y" />
              {avisoNotas && <p className="text-[11px] text-gray-400" role="status">{avisoNotas}</p>}
              <p className="text-[11px] text-gray-500 leading-snug">Sin criterios ni nota: guarda los fotogramas que quieras enseñar, cada uno con sus medidas. Solo lo ves tú.</p>
            </div>
          )}

          {guardada?.fotograma && urls[guardada.fotograma] && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5">
              <p className="text-[12.5px] text-gray-400 mb-2">Guardado de este lado</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[guardada.fotograma]} alt={'Fotograma guardado de ' + (prueba?.nombre ?? '')} className="w-full rounded-lg" />
            </div>
          )}

          {!permiso && (
            <p className="text-[11.5px] text-amber-300/90">
              {bat ? 'Sin su permiso marcado se guarda la nota, pero no la imagen. Se marca en la pestaña Movimiento.'
                : 'Sin su permiso marcado se guardan las medidas, pero no la imagen (sí sale en el informe de ahora). Se marca en la pestaña Movimiento.'}
            </p>
          )}
          {error && <p className="text-[12.5px] text-red-300" role="alert">{error}</p>}
          {aviso && <p className="text-[12.5px] text-green-300" role="status">{aviso}</p>}

          <div className="flex flex-col gap-2 mt-auto">
            {bat ? (<>
              <button onClick={guardar} disabled={guardando}
                className="h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold transition disabled:opacity-50">
                {guardando ? 'Guardando…' : media && permiso ? 'Guardar la nota y el fotograma' : 'Guardar la nota'}
              </button>
              {prueba?.bilateral && aviso && otroLado && !guardadaOtro && (
                <button onClick={() => setLado(otroLado)} className="h-10 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[13px] transition">
                  Pasar al lado {otroLado === 'izq' ? 'izquierdo' : 'derecho'}
                </button>
              )}
            </>) : (<>
              <button onClick={guardarLibre} disabled={guardando || !media}
                className="h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold transition disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar este fotograma'}
              </button>
              <button onClick={() => libre?.onInforme([graf.clave, graf.encima])} disabled={!libre?.yaGuardados}
                title={libre?.yaGuardados ? undefined : 'Guarda algún fotograma primero: el informe se hace con los guardados'}
                className="h-10 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[13px] transition disabled:opacity-40">
                Descargar el informe
              </button>
            </>)}
          </div>
        </aside>
      </div>
    </div>
  )
}
