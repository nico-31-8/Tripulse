'use client'
// ============================================================
// Un vídeo del visor: todo lo que va con él
// ============================================================
//
// El visor (Analizador) puede llevar dos vídeos a la vez: las pruebas que se
// miran desde dos cámaras (22-10-2026). Lo que va con UN vídeo vive aquí: el
// archivo, lo dibujado y su seguimiento, el esqueleto y sus correcciones, la
// reproducción y la imagen que se guarda. El visor llama a este hook una vez
// por vídeo y se queda con lo que es de la prueba (el lado, la nota, los
// criterios) y con lo que junta a los dos (alinearlos y moverlos a la vez).
//
// Se movió tal cual del visor; lo que explica su cabecera (cómo llega cada
// fotograma, el seguimiento de puntos, el esqueleto y sus correcciones) vale
// para lo de aquí.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lado, Prueba, Vista } from '@/lib/baterias-movimiento'
import type { Medida, Trazo } from '@/lib/movimiento-datos'
import {
  anadirTrazo, inclinacionSuelo, medidasDe, nombresDe, PUNTOS_POR_TRAZO, textoRecorrido, valorDe, type Herramienta,
} from '@/lib/trazos-fotograma'
import { sugerirNota, textoParaGuardar } from '@/lib/nota-sugerida'
import {
  centroDe, claveDe, empezarPista, enFotograma, extremosDe, moverPunto, pasoDePista, serieDe, visiblesEn, type TrazoVivo,
} from '@/lib/pista-trazos'
import { aGris, avanzar, tomarPlantilla, type Gris, type Plantilla, type PuntoSeguido } from '@/lib/seguimiento-puntos'
import {
  conAjustes, descruzar, DIBUJADOS, dudosos, ladoAMedir, medidasCuerpo, NOMBRE_FIABILIDAD,
  serieCuerpo, fiabilidadDe, MEDIDAS_GRAFICA, NOMBRE_MEDIDA, nombrePunto, tramosDudosos,
  type ClaveGrafica, type Cuerpo, type LadoCuerpo,
} from '@/lib/cuerpo'
import {
  ajustesDe, COINCIDE_PROPORCION, conPuestos, correccionesDe, corregirPunto, deshacerCorreccion, propagar, type PistasCuerpo,
} from '@/lib/corregir-esqueleto'
import { aSerieGuardada, medidaDelFotograma } from '@/lib/informe-movimiento'
import { cargarDetector, detectar, SIN_SIMD, type Detector } from '@/lib/detector-cuerpo'
import type { Punto } from '@/lib/geometria-fotograma'
import { desplazar, pellizco, SIN_ZOOM, zoomEn, type Zoom } from '@/lib/zoom-visor'
import { pintarCuerpo, pintarTrazos } from './pintar-fotograma'

export const LADO_CUERPO: Record<LadoCuerpo, string> = { i: 'izquierdo', d: 'derecho' }
/** Paso de un fotograma. El navegador no dice los fps del vídeo; 30 es lo que graba casi cualquier móvil. */
export const FPS = 30
export const VELOCIDADES = [0.1, 0.25, 0.5, 1]
/** El seguimiento trabaja con el fotograma reducido a este lado mayor: va más rápido y el margen de búsqueda cubre más movimiento. */
const LADO_SEGUIR = 720
/** Más fotogramas que esto entre uno y el siguiente ya es un salto (arrastrar la barra), no reproducir: no se sigue. */
const SALTO_MAXIMO = 4
/** Con menos fotogramas seguidos no hay recorrido que enseñar. */
export const MINIMO_SERIE = 3
export const CON_FOTOGRAMAS = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype

export const segundos = (s: number) => s.toFixed(2).replace('.', ',') + ' s'

export type Serie = { clave: number; valor: number }[]

export interface ConfigVideo {
  /** De dónde se mira al empezar: la vista de su panel, o la primera de la prueba. */
  vistaInicial: Vista
  lado: Lado
  /** La prueba de la batería; null en un análisis libre. */
  prueba: Prueba | null
  /** Si la sentadilla se hizo con el alza o la tabla: cambia la nota que apunta la app. */
  alza: boolean
  herr: Herramienta
  setHerr: (h: Herramienta) => void
  /** Al elegir otro archivo: el visor borra sus avisos (y la alineación con el otro vídeo). */
  alCambiarArchivo?: () => void
}

export type VideoAnalisis = ReturnType<typeof useVideoAnalisis>

export function useVideoAnalisis(cfg: ConfigVideo) {
  const [media, setMedia] = useState<{ url: string; tipo: 'video' | 'imagen'; nombre: string } | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [vista, setVista] = useState<Vista>(cfg.vistaInicial)
  /** Si el navegador no puede abrir el archivo. */
  const [errorVideo, setErrorVideo] = useState('')
  const [trazos, setTrazosEstado] = useState<TrazoVivo[]>([])
  const [enCurso, setEnCurso] = useState<Trazo | null>(null)
  const [provisional, setProvisional] = useState<Punto | null>(null)
  /** Lo que se arrastra con «mover»: el punto p del trazo t, o el punto c del esqueleto. */
  const [arrastre, setArrastre] = useState<{ t: number; p: number } | { c: number } | null>(null)
  const [lupa, setLupa] = useState<{ p: Punto; k: number; cx: number; cy: number } | null>(null)
  /** El zoom de este vídeo (lib/zoom-visor): en píxeles de su caja. */
  const [zoom, setZoom] = useState<Zoom>(SIN_ZOOM)
  /* Los dedos (o el ratón) que están tocando, en píxeles de la caja; el pellizco y arrastrar la vista. */
  const punterosRef = useRef(new Map<number, Punto>())
  const pellizcoRef = useRef<{ zoom: Zoom; a: Punto; b: Punto } | null>(null)
  const vistaRef = useRef<{ zoom: Zoom; desde: Punto } | null>(null)
  const [tiempo, setTiempo] = useState(0)
  const [duracion, setDuracion] = useState(0)
  const [enMarcha, setEnMarcha] = useState(false)
  const [vel, setVel] = useState(0.25)
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

  /* Al cambiar de lado, el dibujo en blanco: lo dibujado es de otro fotograma.
     El vídeo se queda: a veces los dos lados están en el mismo. */
  useEffect(() => {
    ponTrazos([]); setEnCurso(null); setAvisoSeguir('')
  }, [cfg.lado])

  /* El archivo local se suelta al cambiarlo o al cerrar. */
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url) }, [media])

  const enCursoVisible: Trazo | null = provisional && cfg.herr !== 'mover'
    ? { tipo: cfg.herr, puntos: [...(enCurso?.tipo === cfg.herr ? enCurso.puntos : []), provisional] }
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
  const ladoMedido = ladoAMedir(cfg.lado, Object.values(cuerpos))
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
  const sugerencia = cfg.prueba ? sugerirNota({
    prueba: cfg.prueba, vista, trazos: visibles, cuerpos, ajustes: ajustesCuerpo, ladoMedido, inclinacion: incl, alza: cfg.alza, clave,
  }) : null
  const vistoDe = (criterio: string) => sugerencia?.criterios.find(c => c.clave === criterio) || null
  const buscandoCuerpo = deteccion != null && deteccion.fase !== 'error'
  /** Mientras se busca el cuerpo o se sigue una corrección, el vídeo es suyo: los mandos se quedan quietos. */
  const ocupadoVisor = buscandoCuerpo || !!siguiendoCuerpo
  /** Para pintar el esqueleto (si se ve) en el lienzo, la lupa y la imagen que se guarda. */
  const pintaCuerpo = (ctx: CanvasRenderingContext2D, W: number, H: number, escala = 1) => {
    if (!cuerpoAhora || !verCuerpo) return
    pintarCuerpo(ctx, cuerpoAhora, ladoMedido, vista, dudososAhora, W, H,
      rodillaC && rodillaC.valor != null ? { texto: rodillaC.texto, dudosa: rodillaC.dudosa } : null, escala)
  }

  /* El lienzo, en píxeles del fotograma: el esqueleto debajo y lo dibujado a mano encima. */
  useEffect(() => {
    const c = lienzoRef.current
    if (!c || !nat) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    pintaCuerpo(ctx, nat.w, nat.h, zoom.z)
    pintarTrazos(ctx, visibles, enCursoVisible, nat.w, nat.h, perdidosAhora, zoom.z)
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
      cfg.setHerr('mover')
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
    setNat(null); ponTrazos([]); setEnCurso(null); setErrorVideo(''); setAvisoSeguir(''); setZoom(SIN_ZOOM)
    cfg.alCambiarArchivo?.()
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
   * lo buscado hasta ahí se queda. Devuelve lo hallado (null si nada): con ello
   * se alinean dos vídeos.
   */
  const detectarCuerpo = async (): Promise<Record<number, Cuerpo> | null> => {
    if (!media || !nat || ocupadoVisor) return null
    pararRef.current = false
    const corrida = ++corridaRef.current
    setDeteccion({ fase: 'preparando' })
    let det: Detector
    try {
      det = await cargarDetector((bajado, total) => {
        if (corrida === corridaRef.current) setDeteccion({ fase: 'bajando', bajado, total })
      })
    } catch (e) {
      if (corrida !== corridaRef.current) return null
      setDeteccion({
        fase: 'error',
        mensaje: (e as Error).message === SIN_SIMD
          ? 'Este navegador es demasiado antiguo para detectar el cuerpo. Prueba desde un ordenador o actualízalo.'
          : 'No se ha podido cargar el detector. Comprueba la conexión y vuelve a probar.',
      })
      return null
    }
    if (corrida !== corridaRef.current) return null
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
      if (c) { setCuerpos({ 0: c }); setDeteccion(null); return { 0: c } }
      setDeteccion({ fase: 'error', mensaje: 'No se ve a nadie en la foto.' })
      return null
    }

    const v = videoRef.current
    if (!v || !Number.isFinite(v.duration)) { setDeteccion({ fase: 'error', mensaje: 'No se sabe cuánto dura este vídeo.' }); return null }
    v.pause()
    const vuelta = claveRef.current
    const total = Math.max(1, Math.ceil(v.duration * FPS))
    const hallados: Record<number, Cuerpo> = {}
    /* Cada fotograma con las piernas donde estaban en el anterior: de perfil, el detector a veces las cruza. */
    let anterior: Cuerpo | null = null
    for (let k = 0; k < total; k++) {
      await saltarYEsperar(v, centroDe(k, FPS))
      if (corrida !== corridaRef.current) return null
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
    return Object.keys(hallados).length ? hallados : null
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
      cfg.setHerr('mover')
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

  /**
   * Dónde cae en la caja (sin el zoom) y su tamaño. El lienzo está escalado y
   * corrido por el zoom: su esquina es la de la caja más (zoom.x, zoom.y).
   */
  const enCaja = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { p: { x: e.clientX - r.left + zoom.x, y: e.clientY - r.top + zoom.y }, w: r.width / zoom.z, h: r.height / zoom.z }
  }

  const alPulsar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!nat || siguiendoRef.current) return
    const caja = enCaja(e)
    punterosRef.current.set(e.pointerId, caja.p)
    e.currentTarget.setPointerCapture(e.pointerId)
    /* Dos dedos: pellizco. Lo que el primero empezaba a dibujar se suelta. */
    if (punterosRef.current.size === 2) {
      const [a, b] = [...punterosRef.current.values()]
      pellizcoRef.current = { zoom, a, b }
      vistaRef.current = null
      setProvisional(null); setArrastre(null); setLupa(null)
      return
    }
    if (punterosRef.current.size > 2) return
    movidoRef.current = false
    /* Con zoom, el botón de la rueda arrastra la vista con cualquier herramienta. */
    if (e.button === 1 && zoom.z > 1) { vistaRef.current = { zoom, desde: caja.p }; return }
    const a = aNatural(e)
    setLupa(a)
    if (cfg.herr === 'mover') {
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
      /* Con «mover» y zoom, arrastrar donde no hay ningún punto mueve la vista. */
      if (!mejor && zoom.z > 1) { vistaRef.current = { zoom, desde: caja.p }; setLupa(null); return }
      setArrastre(mejor)
      return
    }
    setProvisional(a.p)
  }

  const alMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (punterosRef.current.has(e.pointerId)) {
      const caja = enCaja(e)
      punterosRef.current.set(e.pointerId, caja.p)
      const pz = pellizcoRef.current
      if (pz) {
        const [a, b] = [...punterosRef.current.values()]
        if (a && b) setZoom(pellizco(pz, a, b, caja.w, caja.h))
        return
      }
      const vv = vistaRef.current
      if (vv) { setZoom(desplazar(vv.zoom, caja.p.x - vv.desde.x, caja.p.y - vv.desde.y, caja.w, caja.h)); return }
    }
    if (!lupa) return
    const a = aNatural(e)
    setLupa(a)
    if (cfg.herr === 'mover' && arrastre && 'c' in arrastre) {
      /* Un punto del esqueleto: aquí lo pone el entrenador. Al soltar se sigue desde aquí (seguirCorreccion). */
      const k = claveRef.current, c = arrastre.c
      movidoRef.current = true
      setPistasCuerpo(ps => corregirPunto(ps, c, k, a.p))
    } else if (cfg.herr === 'mover' && arrastre && 't' in arrastre) {
      /* En uno que se sigue, corregir es poner ese fotograma a mano: lo que se
         siguió desde aquí se borra y se vuelve a seguir desde el punto bueno.
         Solo ese punto coge recorte nuevo; los demás siguen con el suyo, que
         cada recorte nuevo mete un poco de error. */
      const t = trazosRef.current[arrastre.t]
      if (t?.pista) { segRef.current?.plantillas.delete(t.id + ':' + arrastre.p); asegurarCaptura() }
      ponTrazos(ts => ts.map((x, ti) => ti !== arrastre.t ? x : moverPunto(x, claveRef.current, arrastre.p, a.p)))
    } else if (cfg.herr !== 'mover') setProvisional(a.p)
  }

  const alSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    punterosRef.current.delete(e.pointerId)
    /* Acabar un pellizco o un arrastre de la vista no dibuja nada. */
    if (pellizcoRef.current) { if (punterosRef.current.size < 2) pellizcoRef.current = null; return }
    if (vistaRef.current) { vistaRef.current = null; return }
    if (cfg.herr !== 'mover' && provisional) {
      const a = aNatural(e)
      const tipo = cfg.herr
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

  /** El fotograma con lo dibujado y una línea de pie que dice qué es (`pie`). */
  const componer = async (pie: string): Promise<Blob | null> => {
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
    if (sugerencia && sugerencia.criterios.length && cfg.prueba) {
      delEsqueleto.push({ nombre: 'Nota sugerida', valor: textoParaGuardar(sugerencia, cfg.prueba, cfg.alza) })
    }
    return [delFotograma, ...medidasDe(visibles), ...enElVideo, ...delEsqueleto]
  }

  const medidas = medidasDe(visibles)
  const haySeguidos = trazos.some(t => t.pista)
  /* Una sola línea de ayuda del seguimiento, la que toque ahora. */
  const ayudaSeguir = !seguir ? ''
    : !CON_FOTOGRAMAS ? 'En este navegador los puntos se siguen pasando de uno en uno (›), no al reproducir.'
    : !haySeguidos ? 'Los ángulos, líneas y distancias que dibujes irán con el cuerpo al avanzar el vídeo.'
    : fueraDelTramo ? 'Fotograma sin seguir: los puntos están donde se quedaron. Recolócalos aquí o avanza desde el tramo seguido.'
    : 'Los puntos van con el cuerpo al avanzar. Si uno se va, arrástralo con «mover». Con pegatinas en las articulaciones va mucho mejor.'

  /* ── Lo que el visor pinta con este vídeo ── */

  const alCargarVideo = (el: HTMLVideoElement) => { setNat({ w: el.videoWidth, h: el.videoHeight }); setDuracion(el.duration || 0); el.playbackRate = vel }
  const alTiempo = (t: number) => {
    setTiempo(t)
    if (!CON_FOTOGRAMAS) { claveRef.current = claveDe(t, FPS); setClave(claveRef.current) }
  }
  const alSaltar = (el: HTMLVideoElement) => { setTiempo(el.currentTime); if (el.paused) alFotograma(el.currentTime) }
  const alPausar = (t: number) => { setEnMarcha(false); alFotograma(t) }
  const alCargarImagen = (el: HTMLImageElement) => setNat({ w: el.naturalWidth, h: el.naturalHeight })
  const borrarDibujo = () => { ponTrazos([]); setEnCurso(null); setAvisoSeguir('') }
  /** Al cambiar de herramienta, lo que se estaba dibujando a medias se suelta. */
  const soltarEnCurso = () => setEnCurso(null)
  /** Acercar o alejar alrededor de un punto de la caja (w × h): la rueda con Ctrl y los botones. */
  const zoomCon = (factor: number, cx: number, cy: number, w: number, h: number) => setZoom(z => zoomEn(z, factor, cx, cy, w, h))
  const quitarZoom = () => setZoom(SIN_ZOOM)
  /* Las refs no salen del hook: el visor engancha los elementos con estas, y pide el vídeo con elVideo(). */
  const refVideo = useCallback((el: HTMLVideoElement | null) => { videoRef.current = el }, [])
  const refImagen = useCallback((el: HTMLImageElement | null) => { imgRef.current = el }, [])
  const refLienzo = useCallback((el: HTMLCanvasElement | null) => { lienzoRef.current = el }, [])
  const refLupa = useCallback((el: HTMLCanvasElement | null) => { lupaRef.current = el }, [])
  /** El elemento del vídeo, para moverlo junto con el otro. Solo en manejadores y efectos. */
  const elVideo = () => videoRef.current
  const pararDeteccion = () => { pararRef.current = true }
  const pararSeguimiento = () => { pararSeguirRef.current = true }
  const deshacerUnaCorreccion = (punto: number, fotograma: number) => {
    setPistasCuerpo(ps => deshacerCorreccion(ps, punto, fotograma)); setAvisoSeguir(''); setAvisoCuerpo('')
  }

  return {
    vista, setVista, media, nat, errorVideo, setErrorVideo, elegirArchivo,
    refVideo, refImagen, refLienzo, refLupa, elVideo, lupa, zoom, zoomCon, quitarZoom,
    trazos, enCurso, soltarEnCurso, visibles, medidas, recorridos, fueraDelTramo, haySeguidos, ayudaSeguir, deshacer, borrarDibujo,
    cuerpos, hayCuerpo, cuerpoAhora, verCuerpo, setVerCuerpo, medidasC, ladoMedido, ladoGraf, serieGraf, serieEncima, conMargen,
    graf, setGraf, tramos, correcciones, siguienteTramo, deshacerUnaCorreccion, sugerencia, vistoDe,
    deteccion, detectarCuerpo, pararDeteccion, siguiendoCuerpo, pararSeguimiento, avisoCuerpo, avisoSeguir, buscandoCuerpo, ocupadoVisor,
    tiempo, duracion, enMarcha, setEnMarcha, vel, cambiarVel, clave, seguir, cambiarSeguir,
    irA, paso, alternar, alPulsar, alMover, alSoltar,
    alCargarVideo, alTiempo, alSaltar, alPausar, alCargarImagen,
    componer, medidasParaGuardar,
  }
}
