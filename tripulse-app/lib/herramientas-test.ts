// ============================================================
// TRIPULSE — Con qué se dirige cada test en vivo
// ============================================================
//
// QUÉ ES ESTO. Un mapa de «este test lleva este instrumento». Nada más. No sabe
// dónde se guarda nada, ni qué fórmula usa cada test, ni si escribe en
// `tests_libres` o en `test1_carrera`.
//
// POR QUÉ VIVE APARTE DEL CATÁLOGO. Estos descriptores estaban dentro de
// `catalogo-tests`, y ahí solo llegaban a los tests de la batería. Pero los
// siete clásicos —Montreal, CSS, rampa, los tres sprints y el 1RM— no están en
// el catálogo a propósito: tienen tabla propia y de ellos salen las zonas. Con
// los descriptores dentro del catálogo, esos siete se quedaban sin instrumento,
// y el día que se les pusiera uno habría acabado habiendo DOS sitios decidiendo
// qué cronómetro lleva cada test. Ese es el fallo que este proyecto lleva
// persiguiendo, así que: un solo sitio, y que no sepa de almacenamiento.
//
// LA IDEA DE TODO ESTO. El número que mide el instrumento CAE EN SU CASILLA. Si
// hay que leerlo en la pantalla y teclearlo debajo, el cronómetro de la app no
// aporta nada sobre el del móvil.
//
// LOS QUE NO LLEVAN NADA NO ES UN OLVIDO. Nueve de los veinticuatro se rellenan
// a mano porque el aparato ya da el número —una alfombra de saltos, un
// potenciómetro, un reloj— o porque el gesto es demasiado rápido para una mano:
// la escalera de Margaria-Kalamen son ~0,5 s entre fotocélulas y el contacto de
// un drop jump ~200 ms. Cronometrar eso a mano daría un número con pinta de
// dato y un error del 40 %.

/** Cómo se nombra un test aquí: su clave del catálogo, o la del clásico. */
export type ClaveTest = string

export type Herramienta =
  /**
   * Duración fija. Lo que se canta es lo que QUEDA, que es lo que se le grita
   * al atleta. El número medido —metros, vatios— se teclea aparte.
   */
  | { tipo: 'cuentaAtras'; segundos: number; que: string }
  /** Cronómetro suelto. Al pararlo, el tiempo cae en `campo`. */
  | { tipo: 'cronometro'; campo: string; unidad: 'seg' | 'min'; que: string }
  /** Una pulsación por repetición: salen cuántas, la mejor y la última. */
  | { tipo: 'vueltas'; repes: string; mejor: string; ultima: string; que: string }
  /** Una pulsación por brazada. */
  | { tipo: 'contador'; campo: string; que: string }
  /**
   * Lleva el protocolo por escalones: canta cuál toca y a qué intensidad, y al
   * bajarse el atleta captura dónde iba.
   *
   * Es el único que no mide tiempo sino que lo ADMINISTRA. En el Montreal y en
   * la rampa el trabajo del entrenador no es cronometrar: es ir cantando «8,5»,
   * «9,0», «9,5» y acordarse de en cuál se cayó y cuántos segundos llevaba.
   */
  | {
      tipo: 'secuenciador'
      /** Dónde cae la intensidad del escalón en que se bajó. */
      campoIntensidad: string
      /** Dónde caen los segundos que aguantó de ese escalón. */
      campoAguanto: string
      /** De qué casilla se lee cuánto dura un escalón. */
      campoDuracion: string
      /** De qué casilla se lee cuánto sube cada escalón. */
      campoIncremento: string
      /** Con qué intensidad empieza el protocolo. */
      inicial: number
      unidad: string
      que: string
    }

/**
 * El mapa. Las claves de los catorce primeros son las del catálogo; las de los
 * siete últimos son las de los tests clásicos, que no están en el catálogo.
 */
export const HERRAMIENTAS: Record<ClaveTest, Herramienta[]> = {
  // ── Batería ───────────────────────────────────────────────
  '6min': [{ tipo: 'cuentaAtras', segundos: 6 * 60, que: 'Los 6 minutos' }],
  t30: [{ tipo: 'cuentaAtras', segundos: 30 * 60, que: 'Los 30 minutos' }],
  milla: [{ tipo: 'cronometro', campo: 'minutos', unidad: 'min', que: 'La milla' }],
  t400: [{ tipo: 'cronometro', campo: 'segundos', unidad: 'seg', que: 'El 400' }],
  rast: [{ tipo: 'cronometro', campo: 'segundos', unidad: 'seg', que: 'El test' }],
  '180m': [{
    tipo: 'vueltas', repes: 'repes', mejor: 'mejor', ultima: 'ultimo',
    que: 'Una pulsación por repetición',
  }],
  swolf: [
    { tipo: 'cronometro', campo: 'segundos', unidad: 'seg', que: 'El largo' },
    { tipo: 'contador', campo: 'brazadas', que: 'Una pulsación por brazada' },
  ],

  // ── Clásicos ──────────────────────────────────────────────
  montreal: [{
    tipo: 'secuenciador',
    campoIntensidad: 'velUltimo', campoAguanto: 'tiempoAguantado',
    campoDuracion: 'durTotal', campoIncremento: 'incrementoVel',
    inicial: 8, unidad: 'km/h', que: 'El protocolo de Montreal',
  }],
  rampa: [{
    tipo: 'secuenciador',
    campoIntensidad: 'potenciaPico', campoAguanto: 'tiempoNoCompletado',
    campoDuracion: 'durEscalones', campoIncremento: 'incrementoPot',
    inicial: 150, unidad: 'W', que: 'La rampa',
  }],
  css: [
    { tipo: 'cronometro', campo: 'tiempoGrande', unidad: 'seg', que: 'El 400' },
    { tipo: 'cronometro', campo: 'tiempoPequeno', unidad: 'seg', que: 'El 200' },
  ],
  'sprint-natacion': [
    { tipo: 'cronometro', campo: 't25', unidad: 'seg', que: 'Los 25 m' },
    { tipo: 'cronometro', campo: 't50', unidad: 'seg', que: 'Los 50 m' },
  ],
  'sprint-carrera': [{ tipo: 'cronometro', campo: 'sprintTiempo', unidad: 'seg', que: 'El sprint' }],

  /* Sin instrumento, y cada uno por su razón:
       · sprint-ciclismo · ftp20 · ftp60 ...... el potenciómetro da el número
       · bosco · dropjump .................... la alfombra lo da
       · escalera ............................ ~0,5 s: hacen falta fotocélulas
       · brick · decoupling .................. salen del reloj, y duran 55 y 90 min
       · rm .................................. no hay nada que cronometrar
       · tec-carrera · tec-natacion · bikefit  se miden sobre vídeo, después */
}

/**
 * Aviso propio del instrumento, cuando el protocolo pide más precisión de la
 * que da una mano. No impide usarlo: informa de lo que vale el número.
 */
export const AVISOS: Record<ClaveTest, string> = {
  'sprint-carrera':
    'El protocolo pide fotocélulas. A mano tu reacción mete ±0,2 s en un tiempo de ~3,5 s: ' +
    'un 6 % de error, y de este número sale la ASR. Sirve para hacerte una idea, no para ' +
    'compararlo con un test anterior tomado de otra forma.',
}

export function herramientasDe(clave: ClaveTest): Herramienta[] {
  return HERRAMIENTAS[clave] ?? []
}

export function avisoDe(clave: ClaveTest): string | null {
  return AVISOS[clave] ?? null
}

/** Todas las casillas que un instrumento de este test va a rellenar. */
export function camposQueRellena(clave: ClaveTest): string[] {
  const cs: string[] = []
  for (const h of herramientasDe(clave)) {
    if (h.tipo === 'cronometro' || h.tipo === 'contador') cs.push(h.campo)
    else if (h.tipo === 'vueltas') cs.push(h.repes, h.mejor, h.ultima)
    else if (h.tipo === 'secuenciador') cs.push(h.campoIntensidad, h.campoAguanto)
  }
  return cs
}

/** Cómo se llama el instrumento para el entrenador. */
export function nombreDe(h: Herramienta): string {
  switch (h.tipo) {
    case 'cuentaAtras': return 'Cuenta atrás'
    case 'cronometro': return 'Cronómetro'
    case 'vueltas': return 'Vueltas'
    case 'contador': return 'Contador'
    case 'secuenciador': return 'Secuenciador'
  }
}

/** La etiqueta que va en la cabecera de la ficha. */
export function etiquetaDe(clave: ClaveTest): string {
  const hs = herramientasDe(clave)
  if (hs.length === 0) return 'Lo da el aparato'
  if (hs.length === 1) return nombreDe(hs[0])
  return hs.map(nombreDe).join(' + ')
}

// ── Qué se puede dirigir a un grupo entero ──────────────────

/**
 * Si este instrumento tiene sentido con UN reloj para todos.
 *
 * Un grupo hace un test: una salida, un protocolo, un reloj. Lo que cambia de
 * una persona a otra es cuándo se baja. Pero eso no vale para todo:
 *
 *   · Cuenta atrás ..... sí. Un reloj para todos.
 *   · Cronómetro ....... sí. Una salida y un botón «llegó» por atleta.
 *   · Secuenciador ..... sí, y es donde más se nota.
 *   · Vueltas .......... NO: cada atleta hace SUS repeticiones a su ritmo.
 *   · Contador ......... NO: las brazadas son de cada uno.
 *
 * Los dos que no se pueden hay que DECIRLO en pantalla, no esconderlos: si el
 * instrumento desaparece sin explicación, el entrenador cree que la app se ha
 * roto en vez de entender que ahí hay que ir de uno en uno.
 */
export function valeEnGrupo(h: Herramienta): boolean {
  return h.tipo === 'cuentaAtras' || h.tipo === 'cronometro' || h.tipo === 'secuenciador'
}

/** Si el test entero se puede llevar con un reloj común. */
export function seDirigeEnGrupo(clave: ClaveTest): boolean {
  const hs = herramientasDe(clave)
  return hs.length > 0 && hs.every(valeEnGrupo)
}

/** Los instrumentos de este test que NO valen en grupo. */
export function sueltosDe(clave: ClaveTest): Herramienta[] {
  return herramientasDe(clave).filter(h => !valeEnGrupo(h))
}
