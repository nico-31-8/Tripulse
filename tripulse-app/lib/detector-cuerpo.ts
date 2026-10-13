// ============================================================
// El detector del cuerpo (MediaPipe), en el navegador
// ============================================================
//
// Lo que pone el esqueleto en el analizador de vídeo. Es el detector del
// bikefit: el modelo «heavy» de MediaPipe Pose, el más preciso, y su motor,
// servidos desde la propia app (public/mediapipe) y NUNCA de un CDN: la CSP de
// producción solo deja cargar scripts y datos de aquí. Lo que sí necesita es
// compilar WebAssembly, y eso la CSP ya lo permite ('unsafe-eval').
//
// TODO CORRE EN ESTE DISPOSITIVO: el vídeo no sale. Lo que se baja es el
// detector, una vez (unos 42 MB entre motor y modelo), y luego queda en la
// caché del navegador.
//
// SOLO EL MOTOR CON SIMD. MediaPipe trae otro para navegadores sin SIMD (iPhone
// con iOS anterior al 16.4); no se sirve, por no subir 11 MB que casi nadie
// usaría. A esos se les dice que no se puede (SIN_SIMD).
//
// MODO VIDEO: los fotogramas se pasan en orden y el modelo suaviza de uno a
// otro. Exige que el tiempo de cada llamada sea mayor que el de la anterior, y
// el detector vive mientras la página: al volver a pasar un vídeo (o abrir
// otro) el reloj da un salto hacia delante en vez de volver a cero.

import type { Cuerpo } from './cuerpo'

const MODELO = '/mediapipe/modelos/pose_landmarker_heavy.task'
const MOTOR = {
  wasmLoaderPath: '/mediapipe/wasm/vision_wasm_internal.js',
  wasmBinaryPath: '/mediapipe/wasm/vision_wasm_internal.wasm',
}

/** El error de un navegador sin SIMD: no hay motor para él. */
export const SIN_SIMD = 'SIN_SIMD'

/** Lo que se usa del detector de MediaPipe. */
export interface Detector {
  detectForVideo(imagen: HTMLCanvasElement, ms: number): { landmarks: { x: number; y: number; visibility?: number }[][] }
}

/**
 * Un reloj que solo avanza: devuelve el tiempo del fotograma más un desfase
 * que salta hacia delante cada vez que el tiempo pedido no supera al último.
 */
export function relojQueAvanza() {
  let ultimo = -Infinity
  let desfase = 0
  return (ms: number): number => {
    let t = desfase + ms
    if (t <= ultimo) {
      desfase += ultimo - t + 1000
      t = desfase + ms
    }
    ultimo = t
    return t
  }
}

const reloj = relojQueAvanza()
let promesa: Promise<Detector> | null = null

async function bajarModelo(alProgreso?: (bajado: number, total: number) => void): Promise<Uint8Array> {
  const r = await fetch(MODELO)
  if (!r.ok || !r.body) throw new Error('No se ha podido bajar el modelo (' + r.status + ').')
  const total = Number(r.headers.get('content-length')) || 0
  const lector = r.body.getReader()
  const trozos: Uint8Array[] = []
  let bajado = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    trozos.push(value)
    bajado += value.length
    alProgreso?.(bajado, total)
  }
  const todo = new Uint8Array(bajado)
  let o = 0
  for (const t of trozos) { todo.set(t, o); o += t.length }
  return todo
}

/**
 * El detector, cargado una vez por página. Primero con la tarjeta gráfica; si
 * el navegador no la deja usar, con el procesador (más lento, pero va).
 */
export function cargarDetector(alProgreso?: (bajado: number, total: number) => void): Promise<Detector> {
  if (promesa) return promesa
  const cargando = (async (): Promise<Detector> => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
    if (!(await FilesetResolver.isSimdSupported())) throw new Error(SIN_SIMD)
    const modelo = await bajarModelo(alProgreso)
    const opciones = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetBuffer: modelo, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    })
    try {
      return (await PoseLandmarker.createFromOptions(MOTOR, opciones('GPU'))) as unknown as Detector
    } catch {
      return (await PoseLandmarker.createFromOptions(MOTOR, opciones('CPU'))) as unknown as Detector
    }
  })()
  promesa = cargando
  /* Si falla (sin conexión), que el siguiente intento empiece de cero. */
  cargando.catch(() => { if (promesa === cargando) promesa = null })
  return cargando
}

/**
 * Los 33 puntos del cuerpo en la imagen, en píxeles de ancho × alto: MediaPipe
 * los da de 0 a 1 por separado en x y en y, y usarlos así deformaría cualquier
 * ángulo en un vídeo que no sea cuadrado. null si no ve a nadie.
 */
export function detectar(d: Detector, imagen: HTMLCanvasElement, ancho: number, alto: number, ms: number): Cuerpo | null {
  const r = d.detectForVideo(imagen, reloj(ms))
  const puntos = r.landmarks?.[0]
  if (!puntos?.length) return null
  return puntos.map(p => ({ x: p.x * ancho, y: p.y * alto, v: p.visibility ?? 0 }))
}
