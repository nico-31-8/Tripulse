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
//
// DOS VISTAS (22-10-2026, con su maqueta: https://claude.ai/artifact/71YoXvZLYsux3qZ11uNshV).
// Seis pruebas se miran desde dos cámaras: cada criterio en su vista, y la nota
// junta las dos. Ahí el visor lleva un vídeo por vista (useVideoAnalisis, una
// vez por vídeo): «los dos a la vez» (en el móvil, el otro pequeño en una
// esquina) o «uno a uno». Si se grabaron a la vez con dos móviles, se alinean:
// solos (lib/alinear-videos encaja el sube y baja del cuerpo, que se ve igual
// desde las dos cámaras) o a mano, y desde ahí un solo mando mueve los dos. Al
// guardar va un fotograma por vista, y si los vídeos estaban alineados quedan
// como de la misma repetición. Con una vista, el visor es el de siempre.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DE_VISTA, type DefBateria, type Lado, type Prueba, type Vista } from '@/lib/baterias-movimiento'
import {
  guardarPrueba, guardarPruebaDosVistas, rutaFotograma, rutaFotogramaVista, subirFotograma,
  fotogramasDeFila, type FilaPrueba, type FotoVista, type Valoracion,
} from '@/lib/movimiento-datos'
import { COMO_SE_USA, NOMBRE_HERRAMIENTA, type Herramienta } from '@/lib/trazos-fotograma'
import { TEXTO_ALZA } from '@/lib/nota-sugerida'
import { claveDe, centroDe } from '@/lib/pista-trazos'
import type { ClaveGrafica } from '@/lib/cuerpo'
import { alinear, curvaCadera, fotogramaMasBajo } from '@/lib/alinear-videos'
import { cambiarAnalisisLibre, guardarFotogramaLibre, type AnalisisLibre, type FotogramaLibre } from '@/lib/analisis-libre'
import { fechaLarga, hoyISO } from '@/lib/fechas'
import { FichaCorta, colorVista } from './FichaPrueba'
import { useVideoAnalisis, FPS, segundos, type VideoAnalisis } from './useVideoAnalisis'
import { BotonesCuerpo, CambiarVideo, EligeVideo, LienzoVideo, MandosVideo, PanelesVideo, mandoDe, mayuscula, type Mando } from './VideoAnalisis'

const HERRAMIENTAS: Herramienta[] = ['mover', 'linea', 'angulo', 'plomada', 'horizontal', 'palma', 'distancia', 'suelo']
const NOMBRE_LADO: Record<Lado, string> = { unico: '', izq: 'izquierda', der: 'derecha' }
const VISTAS: Vista[] = ['perfil', 'frente', 'espalda', 'atras', 'arriba']
/** Con dos vídeos, cada uno un poco menos alto: arriba va lo de alinearlos. */
const ALTO_DOS = 'min(58vh, 820px)'

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

/**
 * La altura de la cadera en los dos vídeos, una encima de la otra: sin alinear
 * no coinciden; alineados, van a la vez. Cada valle es lo más bajo de una
 * repetición. `d`: el desfase (lo que el vídeo 1 va por delante del 0).
 */
function GraficaCaderas({ c0, c1, d, k0, k1, colores }: {
  c0: (number | null)[]; c1: (number | null)[]; d: number; k0: number; k1: number; colores: [string, string]
}) {
  const desde = Math.min(0, -d), hasta = Math.max(c0.length, c1.length - d, 1)
  const X = (k: number) => 4 + ((k - desde) / Math.max(1, hasta - desde)) * 592
  const Y = (z: number) => 35 + Math.max(-2.5, Math.min(2.5, z)) * 11
  const trozos = (c: (number | null)[], corre: number) => {
    const out: string[] = []
    let actual: string[] = []
    c.forEach((z, k) => {
      if (z == null) { if (actual.length > 1) out.push(actual.join(' ')); actual = []; return }
      actual.push(X(k - corre).toFixed(1) + ',' + Y(z).toFixed(1))
    })
    if (actual.length > 1) out.push(actual.join(' '))
    return out
  }
  return (
    <svg viewBox="0 0 600 70" className="w-full h-auto" role="img" aria-label="La altura de la cadera en los dos vídeos">
      <line x1={4} y1={66} x2={596} y2={66} stroke="rgba(255,255,255,.12)" />
      {trozos(c0, 0).map((p, i) => <polyline key={'a' + i} points={p} fill="none" stroke={colores[0]} strokeWidth={2} strokeLinejoin="round" />)}
      {trozos(c1, d).map((p, i) => <polyline key={'b' + i} points={p} fill="none" stroke={colores[1]} strokeWidth={2} strokeLinejoin="round" />)}
      <line x1={X(k0)} x2={X(k0)} y1={2} y2={64} stroke="#fff" strokeOpacity={0.7} />
      {k1 - d !== k0 && <line x1={X(k1 - d)} x2={X(k1 - d)} y1={2} y2={64} stroke={colores[1]} strokeOpacity={0.8} strokeDasharray="3 3" />}
    </svg>
  )
}

export default function Analizador(props: PropsAnalizador) {
  const { idDeportista, permiso, urls, onCerrar } = props
  const bat = props.modo === 'libre' ? null : props
  const libre = props.modo === 'libre' ? props : null
  const prueba = bat?.prueba ?? null
  const guardadas = bat?.guardadas ?? []
  /** Las pruebas que se miran desde dos cámaras: un vídeo por vista. */
  const dosVistas = !!prueba && prueba.vistas.length === 2
  const [lado, setLado] = useState<Lado>(bat?.ladoInicial ?? 'unico')
  /** En un análisis libre, sus notas (se guardan al salir del cuadro). */
  const [notas, setNotas] = useState(libre?.analisis.notas ?? '')
  const [avisoNotas, setAvisoNotas] = useState('')
  const [herr, setHerr] = useState<Herramienta>('angulo')
  /** Lo que ya tenía guardado el lado con que se abre. */
  const deInicio = guardadas.find(x => x.lado === (bat?.ladoInicial ?? 'unico'))
  const [nota, setNota] = useState<number | null>(deInicio?.nota ?? null)
  const [dolor, setDolor] = useState(!!deInicio?.dolor)
  const [criterios, setCriterios] = useState<Record<string, boolean>>(deInicio?.criterios || {})
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  /** En las sentadillas: si se hizo con el alza (FMS) o con la tabla de 4 cm (Nine Test). Cambia la nota que apunta. */
  const [alza, setAlza] = useState(false)
  /** Con dos vídeos: cuál se mira (0 o 1, en el orden de la prueba) y si se ven los dos a la vez. */
  const [activa, setActiva] = useState<0 | 1>(0)
  const [aLaVez, setALaVez] = useState(true)
  /** Lo que el vídeo 1 va por delante del 0, en fotogramas; null sin alinear. */
  const [desfase, setDesfase] = useState<number | null>(null)
  const [alineando, setAlineando] = useState<null | 'mano' | 'buscando'>(null)
  const [avisoSinc, setAvisoSinc] = useState('')

  /** Otro archivo en un vídeo: fuera los avisos, y la alineación ya no vale. */
  const alCambiarArchivo = () => { setError(''); setAviso(''); setDesfase(null); setAlineando(null); setAvisoSinc('') }
  const comun = { lado, prueba, alza, herr, setHerr, alCambiarArchivo }
  const v0 = useVideoAnalisis({ ...comun, vistaInicial: props.modo === 'libre' ? props.analisis.vista : props.prueba.vistas[0] })
  const v1 = useVideoAnalisis({ ...comun, vistaInicial: prueba?.vistas[1] ?? prueba?.vistas[0] ?? 'perfil' })
  const videos: [VideoAnalisis, VideoAnalisis] = [v0, v1]
  /** El vídeo que se mira: donde dibujan las herramientas y del que salen los paneles del lateral. */
  const v = dosVistas ? videos[activa] : v0
  const quien: 0 | 1 = dosVistas ? activa : 0
  const otroI: 0 | 1 = quien === 0 ? 1 : 0
  const otro = dosVistas ? videos[otroI] : null
  const alineados = dosVistas && desfase != null && v0.media?.tipo === 'video' && v1.media?.tipo === 'video'

  const guardada = guardadas.find(g => g.lado === lado) || null

  /** Al cambiar de lado: lo que ya tenía guardado ese lado. El dibujo lo deja en blanco cada vídeo (useVideoAnalisis). */
  const cambiarLado = (l: Lado) => {
    const g = guardadas.find(x => x.lado === l)
    setLado(l); setNota(g?.nota ?? null); setDolor(!!g?.dolor); setCriterios(g?.criterios || {}); setAviso(''); setError('')
  }

  /* ── Dos vídeos alineados: un solo mando ── */

  /** El fotograma del otro vídeo que va con el k de este (`de`). */
  const enElOtro = (de: 0 | 1, k: number) => (de === 0 ? k + (desfase ?? 0) : k - (desfase ?? 0))
  const ultimoDe = (x: VideoAnalisis) => Math.max(0, Math.ceil(x.duracion * FPS) - 1)
  /** Lleva el vídeo `de` al fotograma k y, si están alineados, el otro al suyo. */
  const irAmbos = (de: 0 | 1, k: number) => {
    videos[de].irA(k)
    if (alineados) videos[de === 0 ? 1 : 0].irA(enElOtro(de, k))
  }
  const ocupado = v0.ocupadoVisor || v1.ocupadoVisor
  /** La rueda sobre un vídeo: lo pone delante y pasa fotogramas en él (y en el otro, si están alineados). */
  const pasoDesde = (i: 0 | 1, n: number) => {
    if (activa !== i) setActiva(i)
    if (!alineados) { videos[i].paso(n); return }
    const el = videos[i].elVideo()
    if (el && !ocupado) irAmbos(i, claveDe(el.currentTime, FPS) + n)
  }
  const mando: Mando = !alineados ? mandoDe(v) : {
    paso: n => {
      const el = v.elVideo()
      if (el && !ocupado) irAmbos(quien, claveDe(el.currentTime, FPS) + n)
    },
    alternar: () => {
      const a = v.elVideo(), b = otro?.elVideo()
      if (!a || ocupado) return
      if (a.paused) {
        const k = enElOtro(quien, claveDe(a.currentTime, FPS))
        if (b && otro && k >= 0 && k <= ultimoDe(otro)) {
          b.currentTime = centroDe(k, FPS)
          b.playbackRate = v.vel
          b.play().catch(() => {})
        }
        a.playbackRate = v.vel
        a.play().catch(() => {})
      } else {
        a.pause(); b?.pause()
        /* Parados, cada uno en su fotograma exacto. */
        irAmbos(quien, claveDe(a.currentTime, FPS))
      }
    },
    irA: k => irAmbos(quien, k),
    cambiarVel: x => { v0.cambiarVel(x); v1.cambiarVel(x) },
    enMarcha: v0.enMarcha || v1.enMarcha,
    ocupado,
  }

  /* Reproduciendo los dos: cada cuarto de segundo se mira que el otro no se haya
     ido más de dos fotogramas, y si el que se mira se para, el otro también. */
  useEffect(() => {
    if (!alineados || !(v0.enMarcha || v1.enMarcha)) return
    const id = window.setInterval(() => {
      const a = (quien === 0 ? v0 : v1).elVideo(), b = (quien === 0 ? v1 : v0).elVideo()
      if (!a || !b) return
      if (a.paused) { if (!b.paused) b.pause(); return }
      const esperado = a.currentTime + (quien === 0 ? 1 : -1) * (desfase ?? 0) / FPS
      if (esperado < 0 || esperado > (b.duration || 0)) { if (!b.paused) b.pause(); return }
      if (b.paused) { b.currentTime = esperado; b.play().catch(() => {}); return }
      if (Math.abs(b.currentTime - esperado) > 2 / FPS) b.currentTime = esperado
    }, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alineados, v0.enMarcha, v1.enMarcha, quien, desfase])

  /* ← → para pasar fotogramas y espacio para reproducir, en el ordenador. */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!v.elVideo() || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); mando.paso(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); mando.paso(1) }
      else if (e.key === ' ') { e.preventDefault(); mando.alternar() }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  /** «Alinear solos»: el cuerpo en los dos vídeos (si falta) y lib/alinear-videos. */
  const alinearSolos = async () => {
    if (!dosVistas || ocupado) return
    setAlineando('buscando'); setAvisoSinc('')
    const c0 = v0.hayCuerpo ? v0.cuerpos : await v0.detectarCuerpo()
    const c1 = c0 ? (v1.hayCuerpo ? v1.cuerpos : await v1.detectarCuerpo()) : null
    if (!c0 || !c1) {
      setAlineando(null)
      setAvisoSinc('No se ve a nadie en uno de los dos vídeos: alinéalos a mano.')
      return
    }
    const al = alinear(c0, c1)
    if (!al) {
      setAlineando('mano')
      setAvisoSinc('No se han podido alinear solos: los dos movimientos no encajan lo bastante. Alinéalos a mano.')
      return
    }
    setDesfase(al.desfase); setAlineando(null)
    v1.irA(v0.clave + al.desfase)
  }
  /** A mano: los dos están en el mismo instante. */
  const estanALaVez = () => { setDesfase(v1.clave - v0.clave); setAlineando(null); setAvisoSinc('') }
  /** Afinar la alineación un fotograma: se mueve el vídeo 1. */
  const empujar = (n: number) => {
    const d = (desfase ?? 0) + n
    setDesfase(d)
    v1.irA(v0.clave + d)
  }
  const textoDesfase = () => {
    if (!prueba || desfase == null) return ''
    if (desfase === 0) return 'Los dos empezaron a grabar a la vez.'
    return 'El vídeo ' + DE_VISTA[prueba.vistas[1]] + ' empezó a grabar ' + segundos(Math.abs(desfase) / FPS) + (desfase > 0 ? ' antes.' : ' después.')
  }
  const curvas = useMemo(
    () => (dosVistas && v0.hayCuerpo && v1.hayCuerpo ? [curvaCadera(v0.cuerpos), curvaCadera(v1.cuerpos)] as const : null),
    [dosVistas, v0.hayCuerpo, v1.hayCuerpo, v0.cuerpos, v1.cuerpos],
  )

  /** «Ir al punto más bajo»: en las sentadillas y zancadas, con esqueleto. */
  const conMasBajo = !!prueba && /sentadilla|zancada|una_pierna/.test(prueba.clave)
  const masBajo = conMasBajo && v.hayCuerpo
    ? () => { const k = fotogramaMasBajo(v.cuerpos, v.clave); if (k != null) mando.irA(k) }
    : null
  /** Con dos alineados, dónde va el otro vídeo (o que se sale del suyo). */
  const otroInfo = alineados && otro ? (() => {
    const k = enElOtro(quien, v.clave)
    return { etiqueta: mayuscula(DE_VISTA[otro.vista]), tiempo: Math.max(0, k) / FPS, fuera: k < 0 || k > ultimoDe(otro) }
  })() : null

  const ponCriterio = (cual: string) => setCriterios(c => {
    const ahora = c[cual]
    const sig = { ...c }
    if (ahora === undefined) sig[cual] = true
    else if (ahora === true) sig[cual] = false
    else delete sig[cual]
    return sig
  })

  /** La línea de pie del fotograma: qué es. */
  const pieDe = (vistaPie: Vista | null) => (bat
    ? [bat.bateria.nombre, bat.prueba.nombre, vistaPie ? DE_VISTA[vistaPie] : '', NOMBRE_LADO[lado], fechaLarga(bat.valoracion.fecha).toLowerCase()]
    : [libre?.analisis.titulo, libre?.nombreDeportista, fechaLarga(hoyISO()).toLowerCase()]
  ).filter(Boolean).join(' · ')

  const guardar = async () => {
    if (!bat || !prueba) return
    if (nota == null && !dolor) { setError('Pon la nota, o marca que duele.'); return }
    setGuardando(true); setError(''); setAviso('')
    if (dosVistas) { await guardarDosVistas(); return }
    let fotograma: string | undefined = undefined
    let sinImagen = ''
    if (v0.media && v0.nat) {
      if (!permiso) sinImagen = 'sin imagen: falta su permiso'
      else {
        const blob = await v0.componer(pieDe(null))
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
      ...(v0.media && v0.nat ? { medidas: v0.medidasParaGuardar(), dibujo: v0.visibles, vista: v0.vista } : {}),
      ...(fotograma ? { fotograma } : {}),
    })
    setGuardando(false)
    if (r.error) { setError('No se ha podido guardar: ' + r.error); return }
    setAviso('Guardado' + (fotograma ? ', con el fotograma.' : sinImagen ? ' · ' + sinImagen + '.' : '.'))
    bat.onGuardado()
  }

  /** Con dos vistas: un fotograma por vídeo cargado, y si estaban alineados. */
  const guardarDosVistas = async () => {
    if (!bat || !prueba) return
    const fotos: FotoVista[] = []
    const problemas: string[] = []
    for (const x of videos) {
      if (!x.media || !x.nat) continue
      let ruta: string | null = null
      if (permiso) {
        const blob = await x.componer(pieDe(x.vista))
        if (blob) {
          const r = rutaFotogramaVista(idDeportista, bat.valoracion.id, prueba.clave, lado, x.vista)
          const sub = await subirFotograma(supabase, r, blob)
          if (sub.error) problemas.push('la imagen ' + DE_VISTA[x.vista] + ' no se ha subido (' + sub.error + ')')
          else ruta = r
        }
      }
      fotos.push({ vista: x.vista, fotograma: ruta, medidas: x.medidasParaGuardar(), dibujo: x.visibles })
    }
    const r = await guardarPruebaDosVistas(supabase, {
      idValoracion: bat.valoracion.id, idDeportista, prueba: prueba.clave, lado, nota, dolor, criterios,
      orden: prueba.vistas, fotos, alineadas: alineados,
    })
    setGuardando(false)
    if (r.error) { setError('No se ha podido guardar: ' + r.error); return }
    const conImagen = fotos.filter(f => f.fotograma).length
    const dicho = conImagen === 2 ? ', con los dos fotogramas' + (alineados ? ' (de la misma repetición)' : '')
      : conImagen === 1 ? ', con el fotograma ' + DE_VISTA[fotos.find(f => f.fotograma)!.vista]
      : fotos.length && !permiso ? ' · sin imagen: falta su permiso' : ''
    setAviso('Guardado' + dicho + (problemas.length ? ' · ' + problemas.join(' · ') : '') + '.')
    bat.onGuardado()
  }

  /* En un análisis libre: cada fotograma que se quiera, con sus medidas; la imagen, con permiso. */
  const guardarLibre = async () => {
    if (!libre) return
    if (!v0.media || !v0.nat) { setError('Elige el vídeo o la foto, y ve al fotograma que quieras guardar.'); return }
    setGuardando(true); setError(''); setAviso('')
    /* Se compone siempre: sin permiso no se sube, pero vale para el informe de ahora (no sale del dispositivo). */
    const blob = await v0.componer(pieDe(null))
    const r = await guardarFotogramaLibre(supabase, {
      analisis: libre.analisis, segundo: v0.media.tipo === 'video' ? v0.clave / FPS : null,
      medidas: v0.medidasParaGuardar(), dibujo: v0.visibles, imagen: permiso ? blob : null,
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
  const notaVisible = dolor ? 0 : nota
  /** La propuesta de nota de la app: de perfil, que es donde mide. */
  const conSugerencia = (dosVistas ? videos.find(x => x.sugerencia && x.sugerencia.criterios.length) : null) ?? v
  const sugerencia = conSugerencia.sugerencia
  /** Lo que ve la app de un criterio, en el vídeo de su vista. */
  const vistoDe = (criterio: string, vistaC: Vista) =>
    (dosVistas && prueba ? videos[prueba.vistas.indexOf(vistaC) === 1 ? 1 : 0] : v0).vistoDe(criterio)
  const cargados = videos.filter(x => x.media && x.nat).length
  const fotosGuardadas = guardada ? fotogramasDeFila(guardada).filter(f => urls[f.ruta]) : []

  /** El botón de un criterio: se cumple, no, o sin marcar; con lo que ve la app. */
  const botonCriterio = (c: Prueba['criterios'][number], tenue: boolean, alPulsar: () => void) => {
    const m = criterios[c.clave]
    const visto = vistoDe(c.clave, c.vista)
    return (
      <li key={c.clave}>
        <button onClick={alPulsar} title="Pulsa: se cumple, no se cumple, sin marcar"
          className={'w-full text-left flex gap-2.5 items-start rounded-lg px-2 py-1.5 transition hover:bg-gray-800 ' + (tenue ? 'opacity-60' : '')}>
          <span className={'w-5 flex-none font-bold ' + (m === true ? 'text-green-400' : m === false ? 'text-red-400' : 'text-gray-600')}>
            {m === true ? '✓' : m === false ? '✗' : '·'}
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
  }

  const ficha = prueba ? (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-left"><FichaCorta prueba={prueba} /></div>
  ) : (
    <p className="text-[12.5px] text-gray-400">Lo que quieras analizar. Guardas los fotogramas que elijas, cada uno con sus medidas, y puedes cambiar de vídeo sin salir.</p>
  )

  /* ── Con dos vistas: alinear, cuál se mira y los dos vídeos ── */
  const barraSinc = dosVistas && v0.media?.tipo === 'video' && v1.media?.tipo === 'video' && prueba ? (
    <div className={'mx-4 mt-3 rounded-xl border px-3 py-2.5 flex flex-col gap-2 ' + (alineados
      ? 'border-green-500/30 bg-green-500/[0.06]' : 'border-amber-400/35 bg-amber-400/[0.06]')}>
      {alineados ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/35">Alineados</span>
          <p className="text-[12.5px] text-gray-200 flex-1 min-w-[12rem]">{textoDesfase()} Si no cuadra del todo, afínalo fotograma a fotograma.</p>
          <button onClick={() => empujar(-1)} disabled={ocupado} className="text-[12px] px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 transition">‹ 1 fotograma</button>
          <button onClick={() => empujar(1)} disabled={ocupado} className="text-[12px] px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 transition">1 fotograma ›</button>
          <button onClick={() => setDesfase(null)} className="text-[12px] text-gray-400 hover:text-white underline decoration-dotted underline-offset-4">Desalinear</button>
        </div>
      ) : alineando === 'mano' ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold">Alinear a mano</p>
          <p className="text-[12.5px] text-gray-300">
            Toca un vídeo y llévalo a un momento que se vea en los dos: lo más bajo de una repetición, o la palmada del principio. Luego el otro, al mismo momento, y pulsa «Están a la vez».
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={estanALaVez} className="text-[13px] font-semibold px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition">Están a la vez</button>
            <button onClick={() => { setAlineando(null); setAvisoSinc('') }} className="text-[12px] text-gray-400 hover:text-white underline decoration-dotted underline-offset-4">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-200 border border-amber-400/40">
            {alineando === 'buscando' ? 'Buscando el desfase…' : 'Sin alinear'}
          </span>
          <p className="text-[12.5px] text-gray-200 flex-1 min-w-[12rem]">Si se grabaron a la vez con dos móviles, alinéalos para ver la misma repetición en los dos.</p>
          <button onClick={() => void alinearSolos()} disabled={alineando === 'buscando' || ocupado}
            className="text-[13px] font-semibold px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-50 transition">Alinear solos</button>
          <button onClick={() => { setAlineando('mano'); setAvisoSinc('') }} disabled={alineando === 'buscando'}
            className="text-[12.5px] px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-50 transition">A mano</button>
        </div>
      )}
      {curvas && (
        <div className="flex flex-col gap-1">
          <GraficaCaderas c0={curvas[0]} c1={curvas[1]} d={alineados ? desfase! : 0} k0={v0.clave} k1={v1.clave}
            colores={[colorVista(prueba.vistas[0]), colorVista(prueba.vistas[1])]} />
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
            {prueba.vistas.map(vx => (
              <span key={vx} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: colorVista(vx) }} />La cadera, {DE_VISTA[vx]}
              </span>
            ))}
            <span>Cada valle es lo más bajo de una repetición{alineados ? '.' : ': sin alinear, no coinciden.'}</span>
          </p>
        </div>
      )}
      {alineando === 'buscando' && (
        <p className="text-[11.5px] text-gray-300" role="status">
          Buscando el cuerpo:{' '}
          {videos.map((x, i) => {
            const d = x.deteccion
            const va = d?.fase === 'buscando' ? d.hechos + ' de ' + d.total : d?.fase === 'bajando' ? 'bajando el detector'
              : d?.fase === 'preparando' ? 'preparando' : x.hayCuerpo ? 'listo' : 'espera'
            return <span key={i}>{(i ? ' · ' : '') + DE_VISTA[prueba.vistas[i]] + ', ' + va}</span>
          })}
        </p>
      )}
      {avisoSinc && <p className="text-[12px] text-amber-200" role="status">{avisoSinc}</p>}
      {!alineados && alineando === null && (
        <p className="text-[11px] text-gray-500">«Alinear solos» busca el cuerpo en los dos vídeos, si falta, y encaja su sube y baja: se ve igual desde las dos cámaras.</p>
      )}
    </div>
  ) : null

  const pestanasVistas = dosVistas && prueba ? (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué vídeo miras">
      {prueba.vistas.map((vx, i) => (
        <button key={vx} onClick={() => setActiva(i as 0 | 1)} aria-pressed={activa === i}
          className={'flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border transition ' + (activa === i
            ? 'bg-gray-800 border-gray-600 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
          <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: colorVista(vx) }} />
          {mayuscula(DE_VISTA[vx])}{videos[i].media ? ' ✓' : ''}
        </button>
      ))}
    </div>
  ) : null

  /** Cada vídeo en su sitio: los dos a la vez (en el móvil, el otro pequeño en una esquina) o uno a uno. */
  const panelDos = (i: 0 | 1) => {
    const x = videos[i]
    const vx = prueba!.vistas[i]
    const esActiva = activa === i
    const visible = aLaVez || esActiva
    const enEsquina = aLaVez && !esActiva
    const color = colorVista(vx)
    return (
      <div key={i}
        className={'relative rounded-xl border-2 flex justify-center items-center min-w-0 '
          + (!visible ? 'hidden ' : '')
          + (esActiva && aLaVez ? 'border-[color:var(--color-vista)] ' : enEsquina ? 'border-gray-800 max-lg:border-[color:var(--color-vista)] ' : 'border-transparent ')
          + (enEsquina ? 'max-lg:absolute max-lg:top-4 max-lg:right-4 max-lg:w-[34%] max-lg:z-10 max-lg:bg-gray-950 lg:p-1 ' : 'p-1 ')}
        style={{ '--color-vista': color } as React.CSSProperties}
        onPointerDownCapture={e => {
          /* En el ordenador, empezar a dibujar en el otro lo pone delante. En el móvil, el
             pequeño de la esquina cambia con su toque entero (su botón): si cambiara al
             apoyar el dedo, al levantarlo caería en el nuevo pequeño y volvería a cambiar. */
          if (!esActiva && !(e.target as HTMLElement).closest('[data-esquina]')) setActiva(i)
        }}>
        {x.media ? (
          <div className="w-full flex justify-center">
            <LienzoVideo v={x} altoMax={ALTO_DOS} onRueda={n => pasoDesde(i, n)} zoomOcultoEnMovil={enEsquina}>
              <span className="absolute left-1.5 top-1.5 z-10 pointer-events-none text-[11px] px-2 py-0.5 rounded-full bg-black/65 inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: color }} />{mayuscula(DE_VISTA[vx])}
              </span>
            </LienzoVideo>
          </div>
        ) : enEsquina ? (
          <>
            <div className="max-lg:hidden w-full flex justify-center"><EligeVideo v={x} /></div>
            <p className="lg:hidden px-2 py-6 text-center text-[11px] text-gray-300">
              <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: color }} />
              {mayuscula(DE_VISTA[vx])}: sin vídeo
            </p>
          </>
        ) : (
          <EligeVideo v={x} ficha={i === 0 ? ficha : null} />
        )}
        {enEsquina && (
          <button data-esquina onClick={() => setActiva(i)} aria-label={'Ver grande el vídeo ' + DE_VISTA[vx]}
            className="lg:hidden absolute inset-0 z-20 rounded-xl" />
        )}
      </div>
    )
  }

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
                <button key={l} onClick={() => cambiarLado(l)}
                  className={'text-[12.5px] px-3 py-1.5 rounded-lg border transition ' + (lado === l
                    ? 'bg-orange-500/15 border-orange-500/50 text-orange-300 font-semibold'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>
                  {l === 'izq' ? 'Izquierda' : 'Derecha'}{g ? ' ✓ ' + (g.dolor ? '0' : g.nota ?? '—') : ''}
                </button>
              )
            })}
          </div>
        )}
        {dosVistas && (
          <div className="flex gap-0.5 p-0.5 rounded-lg bg-gray-950 border border-gray-800" role="group" aria-label="Cómo ver los dos vídeos">
            {([[true, 'Los dos a la vez'], [false, 'Uno a uno']] as const).map(([x, t]) => (
              <button key={t} onClick={() => setALaVez(x)} aria-pressed={aLaVez === x}
                className={'text-[12px] px-2.5 py-1 rounded-md transition ' + (aLaVez === x
                  ? 'bg-orange-500/15 text-orange-300 font-semibold' : 'text-gray-400 hover:text-white')}>
                {t}
              </button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        <span className="hidden md:inline text-[11.5px] text-gray-500">
          {permiso ? (dosVistas ? 'Los vídeos no salen de este dispositivo · se guardan solo los fotogramas' : 'El vídeo no sale de este dispositivo · se guarda solo el fotograma')
            : bat ? 'Sin su permiso: se guarda la nota, no la imagen' : 'Sin su permiso: se guardan las medidas, no la imagen'}
        </span>
        <button onClick={onCerrar} className="text-[13px] px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">Cerrar</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[64px_minmax(0,1fr)_340px]">
        {/* ── herramientas ── */}
        <nav aria-label="Herramientas" className="flex lg:flex-col gap-1.5 p-2 border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900/60 overflow-x-auto">
          {HERRAMIENTAS.map(h => (
            <button key={h} onClick={() => { setHerr(h); v0.soltarEnCurso(); v1.soltarEnCurso() }} title={COMO_SE_USA[h]}
              className={'flex-none w-14 py-2 rounded-xl text-[10.5px] font-semibold border transition ' + (herr === h
                ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800')}>
              {NOMBRE_HERRAMIENTA[h]}
            </button>
          ))}
          <span className="hidden lg:block h-px bg-gray-800 my-1" />
          <button onClick={v.deshacer} disabled={!v.trazos.length && !v.enCurso} title="Quitar lo último"
            className="flex-none w-14 py-2 rounded-xl text-[10.5px] font-semibold text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition">deshacer</button>
          <button onClick={v.borrarDibujo} disabled={!v.trazos.length && !v.enCurso} title="Borrar todo lo dibujado"
            className="flex-none w-14 py-2 rounded-xl text-[10.5px] font-semibold text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition">borrar</button>
        </nav>

        {/* ── el fotograma ── */}
        <div className={'flex flex-col min-w-0 lg:min-h-0' + (dosVistas ? ' lg:overflow-y-auto' : '')}>
          {dosVistas ? (
            <>
              {barraSinc}
              <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
                {pestanasVistas}
                {v.media && (
                  <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <BotonesCuerpo v={v} />
                    <CambiarVideo v={v} />
                  </div>
                )}
              </div>
              {v.deteccion?.fase === 'error' && <p className="px-4 pt-1.5 text-[12px] text-red-300" role="alert">{v.deteccion.mensaje}</p>}
              {v.errorVideo && <p className="px-4 pt-1.5 text-[12px] text-red-300" role="alert">{v.errorVideo}</p>}
              <div className={'relative p-3' + (aLaVez ? ' lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start' : '')}>
                {panelDos(0)}
                {panelDos(1)}
              </div>
              {aLaVez && v0.media && v1.media && (
                <p className="px-4 -mt-1 pb-1 text-[11px] text-gray-500">
                  <span className="lg:hidden">Toca el pequeño para verlo grande.</span>
                  <span className="max-lg:hidden">Dibujas en el que tiene el borde de color; toca el otro para pasar a él.</span>
                </p>
              )}
              <MandosVideo v={v} mando={mando} ayuda={COMO_SE_USA[herr]} masBajo={masBajo} otro={otroInfo} />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
                {(prueba ? prueba.vistas : VISTAS).map(vx => (
                  <button key={vx} onClick={() => v0.setVista(vx)}
                    className={'text-[12.5px] px-3 py-1.5 rounded-lg border transition ' + (v0.vista === vx
                      ? 'bg-gray-800 border-gray-600 text-white' : 'border-gray-800 text-gray-500 hover:text-gray-300')}>
                    {mayuscula(DE_VISTA[vx])}
                  </button>
                ))}
                {v0.media && (
                  <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <BotonesCuerpo v={v0} />
                    <CambiarVideo v={v0} />
                  </div>
                )}
              </div>
              {v0.deteccion?.fase === 'error' && <p className="px-4 pt-1.5 text-[12px] text-red-300" role="alert">{v0.deteccion.mensaje}</p>}
              {v0.errorVideo && <p className="px-4 pt-1.5 text-[12px] text-red-300" role="alert">{v0.errorVideo}</p>}
              <div className="flex-1 min-h-0 flex items-center justify-center p-3">
                {!v0.media ? <EligeVideo v={v0} ficha={ficha} /> : <LienzoVideo v={v0} onRueda={n => mando.paso(n)} />}
              </div>
              <MandosVideo v={v0} mando={mando} ayuda={COMO_SE_USA[herr]} masBajo={masBajo} />
            </>
          )}
        </div>

        {/* ── el panel: medidas, criterios, nota ── */}
        <aside className="border-t lg:border-t-0 lg:border-l border-gray-800 bg-gray-900/60 p-4 flex flex-col gap-4 lg:overflow-y-auto">
          {/* Con el vídeo puesto, la ficha sigue a mano, plegada para no tapar las medidas. */}
          {bat && prueba && (v0.media || v1.media) && (
            <details className="group rounded-xl border border-gray-800 bg-gray-900 p-3.5">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[13.5px] font-semibold flex justify-between items-center">
                Cómo se hace esta prueba <span className="text-gray-500 text-[12px]"><span className="group-open:hidden">▾</span><span className="hidden group-open:inline">▴</span></span>
              </summary>
              <div className="mt-2.5"><FichaCorta prueba={prueba} /></div>
            </details>
          )}
          {dosVistas && v.media && (
            <p className="-mb-2 text-[11.5px] text-gray-400 flex items-center gap-1.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: colorVista(v.vista) }} />
              Del vídeo {DE_VISTA[v.vista]}
            </p>
          )}
          <PanelesVideo v={v} lado={lado} prueba={prueba} irA={mando.irA} />

          {bat && prueba && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5">
              <p className="text-[13.5px] font-semibold">{bat.bateria.nombre} · {prueba.nombre}{lado !== 'unico' ? ' · ' + NOMBRE_LADO[lado] : ''}</p>
              {prueba.queLado && <p className="text-[11px] text-gray-500">Se puntúa {prueba.queLado}.</p>}
              {dosVistas ? (
                <div className="mt-2.5 flex flex-col gap-2">
                  {prueba.vistas.map((vx, i) => {
                    const cs = prueba.criterios.filter(c => c.vista === vx)
                    return (
                      <div key={vx} className="rounded-lg border px-1 py-1.5 transition"
                        style={{ borderColor: activa === i ? colorVista(vx) + '80' : 'rgba(255,255,255,.06)' }}>
                        <p className="px-1.5 text-[11.5px] font-semibold flex items-center gap-1.5">
                          <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: colorVista(vx) }} />
                          {mayuscula(DE_VISTA[vx])}
                          <span className="font-normal text-gray-500">{cs.length === 1 ? '1 criterio' : cs.length + ' criterios'}</span>
                        </p>
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {cs.map(c => botonCriterio(c, false, () => { ponCriterio(c.clave); setActiva(i as 0 | 1) }))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {prueba.criterios.map(c => botonCriterio(c, c.vista !== v0.vista, () => ponCriterio(c.clave)))}
                </ul>
              )}

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
                  {sugerencia.clave != null && conSugerencia.media?.tipo === 'video' && (
                    <button onClick={() => {
                      const i = videos.indexOf(conSugerencia) === 1 ? 1 : 0
                      if (dosVistas && !alineados) setActiva(i)
                      if (alineados) irAmbos(i, sugerencia.clave!); else conSugerencia.irA(sugerencia.clave!)
                    }}
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

          {fotosGuardadas.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3.5">
              <p className="text-[12.5px] text-gray-400 mb-2">
                Guardado de este lado{fotosGuardadas.length === 2 && guardada?.segunda_vista?.misma_repeticion ? ' · de la misma repetición' : ''}
              </p>
              <div className={fotosGuardadas.length === 2 ? 'grid grid-cols-2 gap-2' : ''}>
                {fotosGuardadas.map(f => (
                  <figure key={f.ruta} className="m-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[f.ruta]} alt={'Fotograma guardado de ' + (prueba?.nombre ?? '') + (f.vista ? ' ' + DE_VISTA[f.vista] : '')} className="w-full rounded-lg" />
                    {fotosGuardadas.length === 2 && f.vista && <figcaption className="text-[11px] text-gray-500 mt-1">{mayuscula(DE_VISTA[f.vista])}</figcaption>}
                  </figure>
                ))}
              </div>
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
                {guardando ? 'Guardando…'
                  : dosVistas ? (permiso && cargados === 2 ? 'Guardar la nota y los dos fotogramas' : permiso && cargados === 1 ? 'Guardar la nota y el fotograma' : 'Guardar la nota')
                  : v0.media && permiso ? 'Guardar la nota y el fotograma' : 'Guardar la nota'}
              </button>
              {dosVistas && alineados && cargados === 2 && (
                <p className="text-[11px] text-gray-500 -mt-1">Los dos del mismo instante: {DE_VISTA[prueba!.vistas[0]]} a los {segundos(v0.clave / FPS)}, {DE_VISTA[prueba!.vistas[1]]} a los {segundos(v1.clave / FPS)}.</p>
              )}
              {prueba?.bilateral && aviso && otroLado && !guardadaOtro && (
                <button onClick={() => cambiarLado(otroLado)} className="h-10 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[13px] transition">
                  Pasar al lado {otroLado === 'izq' ? 'izquierdo' : 'derecho'}
                </button>
              )}
            </>) : (<>
              <button onClick={guardarLibre} disabled={guardando || !v0.media}
                className="h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold transition disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar este fotograma'}
              </button>
              <button onClick={() => libre?.onInforme([v0.graf.clave, v0.graf.encima])} disabled={!libre?.yaGuardados}
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
