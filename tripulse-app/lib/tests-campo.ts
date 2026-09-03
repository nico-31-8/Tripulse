// ============================================================
// Tests de campo: metes el dato bruto y sale el resultado
// ============================================================
//
// Lo que el entrenador apunta a pie de pista es lo que VE: los metros que
// recorrió, las repeticiones que sacó, los centímetros que saltó. El número que
// sirve —la potencia, el 1RM— sale de una fórmula que hoy tiene que hacer él de
// cabeza o buscar en el móvil.
//
// Todo lo de aquí es puro: entra un dato bruto, sale un número. Sin base de
// datos y sin pantalla, para poder comprobarlo contra los ejemplos de la fuente.
//
// FUENTES, y están citadas porque un número de estos acaba decidiendo cargas:
//   · Sayers (potencia del CMJ) y Margaria-Kalamen → fukuda-02-tests-potencia-fuerza.md
//   · Protocolo y cautelas del 1RM → acsm-02-tests-fitness-salud.md
// Las dos notas están en el vault del proyecto.

// ── Salto vertical ──────────────────────────────────────────

/**
 * Potencia pico de un CMJ, en vatios (Sayers).
 *
 *     P (W) = 60,7 × altura(cm) + 45,3 × peso(kg) − 2055
 *
 * HACE FALTA EL PESO, y no es un detalle que se pueda saltar: mover 60 kg
 * treinta centímetros y mover 90 kg los mismos treinta centímetros no es la
 * misma potencia. Sin peso devuelve null en vez de calcular con uno inventado.
 */
export function potenciaCMJ(alturaCm: number | null | undefined, pesoKg: number | null | undefined): number | null {
  const h = Number(alturaCm), p = Number(pesoKg)
  if (!isFinite(h) || !isFinite(p) || h <= 0 || p <= 0) return null
  return Math.round(60.7 * h + 45.3 * p - 2055)
}

/**
 * La altura que corresponde a un tiempo de vuelo, en centímetros.
 *
 *     h = g × t² / 8
 *
 * Para las alfombras y las apps que miden vuelo en vez de altura. Es física, no
 * una estimación estadística: el cuerpo sube y baja lo mismo, así que la mitad
 * del vuelo es la subida.
 */
export function alturaDeVuelo(segundos: number | null | undefined): number | null {
  const t = Number(segundos)
  if (!isFinite(t) || t <= 0) return null
  return Math.round((9.807 * t * t / 8) * 1000) / 10
}

/**
 * EUR: cuánto aprovecha el ciclo estiramiento-acortamiento.
 *
 *     EUR = CMJ / squat jump
 *
 * Cuánto le suma bajar rápido antes de saltar. Por debajo de 1,00 el
 * contramovimiento no aporta nada.
 */
export function eur(cmjCm: number | null | undefined, sjCm: number | null | undefined): number | null {
  const c = Number(cmjCm), s = Number(sjCm)
  if (!isFinite(c) || !isFinite(s) || c <= 0 || s <= 0) return null
  return Math.round((c / s) * 100) / 100
}

/**
 * Qué dice ese EUR, en una frase.
 *
 * LOS CORTES SON LOS DE LA BATERÍA DE TESTS: «>1,1 buen contramovimiento · ~1,0
 * mejorable · <1,0 priorizar pliometría». La primera versión de esto los puse a
 * ojo —metí un 1,25 para «le falta fuerza máxima»— y estaba inventado: ese
 * diagnóstico necesita mirar TAMBIÉN el squat jump, porque un EUR alto con SJ
 * alto no dice lo mismo que un EUR alto con SJ bajo. Para eso está `leeIE`
 * junto al valor del SJ, no un umbral suelto aquí.
 */
export function leeEUR(v: number | null): string {
  if (v == null) return ''
  if (v < 1) return 'El contramovimiento no le suma nada: priorizar pliometría.'
  if (v <= 1.1) return 'Mejorable: aprovecha poco el rebote.'
  return 'Buen contramovimiento.'
}

// ── Escalera de Margaria-Kalamen ────────────────────────────

/**
 * Potencia anaeróbica de la escalera, en vatios.
 *
 *     P (W) = peso(kg) × 9,807 × altura vertical(m) / tiempo(s)
 *
 * La altura es la que se sube de verdad entre el escalón 3 y el 9 —1,02 m o
 * 2,04 m según cómo se monte—, no la del tramo entero.
 */
export function potenciaEscalera(
  pesoKg: number | null | undefined,
  alturaM: number | null | undefined,
  segundos: number | null | undefined,
): number | null {
  const p = Number(pesoKg), h = Number(alturaM), t = Number(segundos)
  if (![p, h, t].every(isFinite) || p <= 0 || h <= 0 || t <= 0) return null
  return Math.round(p * 9.807 * h / t)
}

// ── 1RM estimado a partir de repeticiones ───────────────────

export interface RangoRM {
  epley: number
  brzycki: number
  /** El menor de los dos, redondeado. */
  min: number
  /** El mayor. */
  max: number
  /** Cuánto se separan, en kilos. Crece con las repeticiones. */
  horquilla: number
  /** Aviso cuando la estimación empieza a no ser de fiar. */
  aviso: string | null
}

/**
 * El 1RM que sale de hacer `reps` con `peso`, por las dos fórmulas.
 *
 *     Epley:   1RM = peso × (1 + reps/30)
 *     Brzycki: 1RM = peso / (1,0278 − 0,0278 × reps)
 *
 * SE DEVUELVEN LAS DOS Y SU RANGO, no una media: un número único escondería
 * detrás de una precisión que no existe que son dos modelos distintos.
 *
 * OJO CON LO QUE SIGNIFICA EL ANCHO DEL RANGO: NO mide fiabilidad. Las dos
 * fórmulas SE CRUZAN en las 10 repeticiones —Epley va por encima hasta ahí y
 * Brzycki se dispara después— así que a 10 reps coinciden casi exactamente y el
 * rango sale estrechísimo justo donde la estimación empieza a ser mala:
 *
 *     reps   Epley  Brzycki   diferencia
 *        3    88,0     84,7        +3,3
 *        8   101,3     99,3        +2,0
 *       10   106,7    106,7         0,0   ← se cruzan
 *       12   112,0    115,2        −3,2
 *       15   120,0    131,0       −11,0
 *
 * La fiabilidad la da el NÚMERO DE REPETICIONES, no el hueco: «a menos reps,
 * mejor predicción del 1RM» (ACSM). De ahí que el aviso mire las reps.
 *
 * Brzycki se dispara cerca de 37 repeticiones (el denominador se va a cero), así
 * que por encima de 15 no se estima: ahí ya no se está midiendo fuerza máxima
 * sino resistencia muscular, que es otra cualidad.
 */
export function rmDeReps(pesoKg: number | null | undefined, reps: number | null | undefined): RangoRM | null {
  const p = Number(pesoKg), r = Number(reps)
  if (!isFinite(p) || !isFinite(r) || p <= 0 || r < 1) return null
  if (r > 15) return null

  // Una repetición ya ES el 1RM: estimarlo sería estimar lo que se midió.
  if (r === 1) {
    return { epley: p, brzycki: p, min: p, max: p, horquilla: 0, aviso: null }
  }

  const epley = p * (1 + r / 30)
  const brzycki = p / (1.0278 - 0.0278 * r)
  const e = Math.round(epley * 10) / 10
  const b = Math.round(brzycki * 10) / 10
  const min = Math.min(e, b), max = Math.max(e, b)

  return {
    epley: e, brzycki: b, min, max,
    horquilla: Math.round((max - min) * 10) / 10,
    aviso: r > 10
      ? 'Con más de 10 repeticiones la estimación pierde fiabilidad. Repite con menos peso y menos reps si quieres afinar.'
      : null,
  }
}

/** «entre 98 y 102 kg», o «100 kg» si las dos coinciden. */
export function textoRM(r: RangoRM | null): string {
  if (!r) return '—'
  if (r.min === r.max) return r.min + ' kg'
  return 'entre ' + r.min + ' y ' + r.max + ' kg'
}

/**
 * El porcentaje de un 1RM, para prescribir con el rango.
 *
 * Devuelve los dos extremos: si el 1RM está entre 98 y 102, el 80% está entre
 * 78 y 82. Dar un solo número aquí sería fingir que se conoce el 1RM exacto.
 */
export function kilosAlPorcentaje(r: RangoRM | null, pct: number): { min: number; max: number } | null {
  if (!r || !isFinite(pct) || pct <= 0) return null
  return {
    min: Math.round(r.min * pct / 100 * 2) / 2,
    max: Math.round(r.max * pct / 100 * 2) / 2,
  }
}

// ============================================================
// Carrera
// ============================================================

/**
 * VAM del test de 6 minutos, en km/h.
 *
 *     VAM = metros / 1000 × 10
 *
 * Que es la media, sin más: 1500 m en 6 min son 15 km/h. El test dura seis
 * minutos precisamente para que la media SEA la VAM; en uno más largo la
 * velocidad media cae por debajo y ya no vale esta cuenta.
 */
export function vamDe6Min(metros: number | null | undefined): number | null {
  const m = Number(metros)
  if (!isFinite(m) || m <= 0) return null
  return Math.round(m / 100 * 10) / 10
}

/**
 * VAM estimada desde una milla, en km/h.
 *
 *     VAM = 96,54 / minutos
 *
 * Sale de que 1609 m en X minutos son 1,609/X × 60 km/h. Es para cuando no hay
 * pista donde medir metros exactos.
 */
export function vamDeMilla(minutos: number | null | undefined): number | null {
  const t = Number(minutos)
  if (!isFinite(t) || t <= 0) return null
  return Math.round(96.54 / t * 10) / 10
}

/**
 * Ritmo umbral desde un T30, en segundos por kilómetro.
 *
 *     ritmo umbral = ritmo medio × 1,03
 *
 * Treinta minutos al máximo se sostienen un poco POR ENCIMA del umbral, así que
 * el umbral de verdad es un 3 % más lento que lo que hizo. El ×1,03 va sobre el
 * ritmo (segundos), no sobre la velocidad: más segundos es más lento.
 */
export function umbralDeT30(ritmoMedioSegKm: number | null | undefined): number | null {
  const p = Number(ritmoMedioSegKm)
  if (!isFinite(p) || p <= 0) return null
  return Math.round(p * 1.03)
}

// ============================================================
// Ciclismo
// ============================================================

/**
 * FTP desde un test de 20 minutos, en vatios.
 *
 *     FTP = media de los 20' × 0,95
 *
 * Veinte minutos al máximo se sostienen por encima del FTP; el 5 % es la
 * corrección clásica. Es otro camino al mismo número que da la rampa, y por eso
 * los dos tienen que llegar parecido: si no, uno de los dos tests se hizo mal.
 */
export function ftpDe20Min(mediaW: number | null | undefined): number | null {
  const w = Number(mediaW)
  if (!isFinite(w) || w <= 0) return null
  return Math.round(w * 0.95)
}

/**
 * PAM estimada a partir del FTP.
 *
 *     PAM ≈ FTP × 1,28
 *
 * Es una ESTIMACIÓN y no una medida: sirve cuando solo se ha hecho el test de
 * 20 minutos y hace falta un techo aeróbico para las zonas altas. Si se ha
 * hecho la rampa, la PAM de la rampa manda — esa se midió.
 */
export function pamDeFtp(ftp: number | null | undefined): number | null {
  const w = Number(ftp)
  if (!isFinite(w) || w <= 0) return null
  return Math.round(w * 1.28)
}

// ============================================================
// Natación
// ============================================================

/**
 * Ritmo umbral desde un 400 máximo, en segundos por 100 m.
 *
 *     ritmo umbral = T400 / 4 + 5
 *
 * El cuarto del 400 es el ritmo medio por 100; los cinco segundos son lo que se
 * afloja para sostenerlo. Es la alternativa al CSS cuando solo se puede hacer
 * una distancia.
 */
export function umbralDeT400(segundos: number | null | undefined): number | null {
  const t = Number(segundos)
  if (!isFinite(t) || t <= 0) return null
  return Math.round(t / 4 + 5)
}

// ============================================================
// Reserva de velocidad
// ============================================================

/**
 * ASR: reserva de velocidad, en km/h.
 *
 *     ASR = MSS − vVO2max
 *
 * Orienta el plan entero, y por eso está marcada con estrella en la batería:
 * dice si al atleta le falta MOTOR (VAM baja, ASR pequeña) o CILINDRADA (VAM
 * decente pero sin punta). Dos corredores con la misma VAM y distinta ASR no
 * entrenan igual.
 */
export function asr(mss: number | null | undefined, vam: number | null | undefined): number | null {
  const s = Number(mss), v = Number(vam)
  if (!isFinite(s) || !isFinite(v) || s <= 0 || v <= 0) return null
  if (s <= v) return null   // Una punta por debajo de la VAM es un dato mal medido.
  return Math.round((s - v) * 10) / 10
}

// ============================================================
// Índices de salto (Bosco)
// ============================================================

/**
 * Índice de elasticidad, en porcentaje.
 *
 *     IE = (CMJ − SJ) / SJ × 100
 *
 * OJO, Y ESTÁ AVISADO EN LA PROPIA BATERÍA: hay una variante que divide entre
 * CMJ en vez de entre SJ. Da otro número, y mezclarlas hace que la evolución de
 * un atleta parezca que sube o baja cuando lo único que cambió fue la fórmula.
 * Aquí se divide entre SJ, y no se cambia.
 *
 * Referencias: ~10 % normal (hombres ~11 %, mujeres ~5-6 %) · por debajo del
 * 10 % reutiliza poco · por encima del 12-15 % buen aprovechamiento.
 */
export function indiceElasticidad(cmjCm: number | null | undefined, sjCm: number | null | undefined): number | null {
  const c = Number(cmjCm), s = Number(sjCm)
  if (!isFinite(c) || !isFinite(s) || c <= 0 || s <= 0) return null
  return Math.round((c - s) / s * 1000) / 10
}

/** Qué dice ese IE. */
export function leeIE(v: number | null): string {
  if (v == null) return ''
  if (v < 10) return 'Reutiliza poco la energía elástica: pliometría y fuerza pesada.'
  if (v > 15) return 'Buen aprovechamiento elástico.'
  if (v > 12) return 'Aprovechamiento correcto, tirando a bueno.'
  return 'Aprovechamiento normal.'
}

/**
 * RSI: reactividad en el drop jump.
 *
 *     RSI = altura / tiempo de contacto
 *
 * Mide lo rápido que devuelve el suelo, no lo alto que salta: saltar mucho
 * apoyando medio segundo no es reactividad, es fuerza. El contacto entra en
 * MILISEGUNDOS porque es como lo dan las alfombras, y se pasa a segundos aquí.
 *
 * Referencias: recreativo 1,0-2,0 · equipo élite 2,0-3,0 · por encima de 2,5
 * excelente · por debajo de 1,5 necesita reactividad.
 */
export function rsi(alturaCm: number | null | undefined, contactoMs: number | null | undefined): number | null {
  const h = Number(alturaCm), t = Number(contactoMs)
  if (!isFinite(h) || !isFinite(t) || h <= 0 || t <= 0) return null
  return Math.round((h / 100) / (t / 1000) * 100) / 100
}

/** Qué dice ese RSI. */
export function leeRSI(v: number | null): string {
  if (v == null) return ''
  if (v < 1.5) return 'Necesita trabajo de reactividad.'
  if (v > 2.5) return 'Reactividad excelente.'
  if (v >= 2) return 'Nivel de equipo élite.'
  return 'Nivel recreativo.'
}

// ============================================================
// Funcionales de triatlón
// ============================================================

export interface Banda {
  /** El texto que se enseña. */
  texto: string
  /** 'bien' | 'normal' | 'mal', para el color. */
  nivel: 'bien' | 'normal' | 'mal'
}

/**
 * Deterioro del brick, en porcentaje.
 *
 *     % det = (ritmo en brick − ritmo aislado) / aislado × 100
 *
 * Cuánto se le cae la carrera por venir de la bici. Los ritmos van en SEGUNDOS
 * por kilómetro, así que un porcentaje positivo es ir más lento — que es lo
 * normal. Negativo significaría correr más rápido después de la bici, y eso
 * casi siempre es que el test aislado se hizo sin apretar.
 *
 * Referencias: muy bien por debajo del 4 % · bien 4-8 % · normal 8-15 % · mal
 * por encima del 15 %.
 */
export function deterioroBrick(
  ritmoBrickSeg: number | null | undefined,
  ritmoAisladoSeg: number | null | undefined,
): number | null {
  const b = Number(ritmoBrickSeg), a = Number(ritmoAisladoSeg)
  if (!isFinite(b) || !isFinite(a) || b <= 0 || a <= 0) return null
  return Math.round((b - a) / a * 1000) / 10
}

export function leeDeterioro(v: number | null): Banda | null {
  if (v == null) return null
  if (v < 0) return { texto: 'Corrió más rápido tras la bici: revisa el test aislado.', nivel: 'normal' }
  if (v < 4) return { texto: 'Muy bien: apenas se le cae la carrera.', nivel: 'bien' }
  if (v < 8) return { texto: 'Bien.', nivel: 'bien' }
  if (v <= 15) return { texto: 'Normal.', nivel: 'normal' }
  return { texto: 'Se le cae mucho: falta trabajo de transición.', nivel: 'mal' }
}

/**
 * Deriva cardiaca de una sesión larga, en porcentaje.
 *
 *     deriva = (FC últimos 20' − FC primeros 20') / primeros × 100
 *
 * A ritmo o potencia CONSTANTE. Si el ritmo cayó, la deriva no mide eficiencia
 * aeróbica, mide que aflojó — y ahí el número no dice nada.
 *
 * Referencias: por debajo del 5 % excelente · 5-8 % adecuado · por encima del
 * 10 % base aeróbica insuficiente.
 */
export function decoupling(
  fcPrimeros: number | null | undefined,
  fcUltimos: number | null | undefined,
): number | null {
  const p = Number(fcPrimeros), u = Number(fcUltimos)
  if (!isFinite(p) || !isFinite(u) || p <= 0 || u <= 0) return null
  return Math.round((u - p) / p * 1000) / 10
}

export function leeDecoupling(v: number | null): Banda | null {
  if (v == null) return null
  if (v < 5) return { texto: 'Excelente: la base aeróbica aguanta.', nivel: 'bien' }
  if (v <= 8) return { texto: 'Adecuado.', nivel: 'normal' }
  if (v <= 10) return { texto: 'Justo. Vigilar la base aeróbica.', nivel: 'normal' }
  return { texto: 'Base aeróbica insuficiente: más volumen fácil.', nivel: 'mal' }
}

// ============================================================
// Velocidad máxima (MSS)
// ============================================================

/**
 * MSS en km/h a partir de un sprint LANZADO.
 *
 *     MSS = metros / segundos × 3,6
 *
 * LANZADO quiere decir que llega ya a tope al primer sensor. Si se cronometra
 * desde parado el número sale bajo, porque incluye la aceleración — y entonces
 * la ASR que salga de ahí también sale baja. No es un detalle de protocolo: es
 * la diferencia entre medir la punta y medir la media de la salida.
 */
export function mss(metros: number | null | undefined, segundos: number | null | undefined): number | null {
  const d = Number(metros), t = Number(segundos)
  if (!isFinite(d) || !isFinite(t) || d <= 0 || t <= 0) return null
  return Math.round(d / t * 3.6 * 10) / 10
}

// ============================================================
// Técnica de natación
// ============================================================

/**
 * SWOLF: brazadas + segundos de un largo.
 *
 * Es una suma de dos cosas con unidades distintas, y ahí está toda la gracia:
 * si baja las brazadas alargando cada una pero tarda más, el SWOLF no mejora.
 * Solo baja cuando nada más eficiente de verdad.
 *
 * LAS REFERENCIAS SON DE 25 m —recreativo <40, competitivo <33— así que un
 * SWOLF de piscina de 50 no se compara con uno de 25. Por eso el largo entra
 * como dato y `leeSWOLF` calla si no es 25.
 */
export function swolf(
  brazadas: number | null | undefined,
  segundos: number | null | undefined,
): number | null {
  const b = Number(brazadas), s = Number(segundos)
  if (!isFinite(b) || !isFinite(s) || b <= 0 || s <= 0) return null
  return Math.round((b + s) * 10) / 10
}

/** Qué dice ese SWOLF. Solo para largos de 25 m. */
export function leeSWOLF(v: number | null, largoM: number = 25): string {
  if (v == null) return ''
  if (largoM !== 25) return 'Las referencias del SWOLF son de piscina de 25 m.'
  if (v < 33) return 'Nivel competitivo.'
  if (v < 40) return 'Entre recreativo y competitivo.'
  return 'Nivel recreativo: hay margen técnico.'
}

// ============================================================
// Fuerza relativa
// ============================================================

/**
 * Cuántas veces su peso levanta.
 *
 *     ratio = 1RM / peso corporal
 *
 * Es la referencia que pide la batería para el 1RM de sentadilla, y en triatlón
 * es la que importa: lo que hay que mover por la carrera es el propio cuerpo.
 * Un 1RM de 100 kg no dice lo mismo en alguien de 60 kg que en alguien de 90.
 */
export function ratioFuerzaPeso(
  rmKg: number | null | undefined,
  pesoKg: number | null | undefined,
): number | null {
  const r = Number(rmKg), p = Number(pesoKg)
  if (!isFinite(r) || !isFinite(p) || r <= 0 || p <= 0) return null
  return Math.round(r / p * 100) / 100
}

// ============================================================
// Tablas de referencia (VAM y CSS)
// ============================================================
//
// Las de la batería, tal cual, con sus cortes por sexo. Están aquí y no en la
// pantalla porque el mismo número lo van a querer leer la ficha del deportista,
// el modo dirigir y el informe: si cada uno se trae su tabla, tres sitios
// distintos acabarán llamando «avanzado» a cosas distintas.

export type Nivel = 'principiante' | 'medio' | 'avanzado' | 'élite' | 'pro'

export type Sexo = 'Hombre' | 'Mujer' | string | null | undefined

/** VAM en km/h. Más es mejor: cada corte es el suelo de ese nivel. */
export const REF_VAM: Record<'Hombre' | 'Mujer', { nivel: Nivel; desde: number }[]> = {
  Hombre: [
    { nivel: 'pro', desde: 20 },
    { nivel: 'élite', desde: 18 },
    { nivel: 'avanzado', desde: 16 },
    { nivel: 'medio', desde: 13 },
    { nivel: 'principiante', desde: 0 },
  ],
  Mujer: [
    { nivel: 'pro', desde: 18 },
    { nivel: 'élite', desde: 16 },
    { nivel: 'avanzado', desde: 14 },
    { nivel: 'medio', desde: 11 },
    { nivel: 'principiante', desde: 0 },
  ],
}

/** CSS en SEGUNDOS por 100 m. Menos es mejor: cada corte es el techo del nivel. */
export const REF_CSS: Record<'Hombre' | 'Mujer', { nivel: Nivel; hasta: number }[]> = {
  Hombre: [
    { nivel: 'pro', hasta: 80 },
    { nivel: 'élite', hasta: 90 },
    { nivel: 'avanzado', hasta: 105 },
    { nivel: 'medio', hasta: 120 },
    { nivel: 'principiante', hasta: Infinity },
  ],
  Mujer: [
    { nivel: 'pro', hasta: 90 },
    { nivel: 'élite', hasta: 105 },
    { nivel: 'avanzado', hasta: 120 },
    { nivel: 'medio', hasta: 135 },
    { nivel: 'principiante', hasta: Infinity },
  ],
}

/**
 * En qué nivel cae esa VAM.
 *
 * DEVUELVE null SI NO SE SABE EL SEXO, y eso incluye «Prefiero no decirlo», que
 * es una respuesta legítima del alta. Las dos tablas son distintas de verdad
 * —13 km/h es «medio» en una y «avanzado» en la otra— así que elegir una por
 * defecto sería inventarse el nivel de alguien. La pantalla enseña las dos
 * columnas y que decida quien mira.
 */
export function nivelVAM(vam: number | null | undefined, sexo: Sexo): Nivel | null {
  const v = Number(vam)
  if (!isFinite(v) || v <= 0) return null
  if (sexo !== 'Hombre' && sexo !== 'Mujer') return null
  return REF_VAM[sexo].find(r => v >= r.desde)?.nivel ?? null
}

/** En qué nivel cae ese CSS, en segundos por 100 m. Mismo criterio con el sexo. */
export function nivelCSS(segPor100: number | null | undefined, sexo: Sexo): Nivel | null {
  const s = Number(segPor100)
  if (!isFinite(s) || s <= 0) return null
  if (sexo !== 'Hombre' && sexo !== 'Mujer') return null
  return REF_CSS[sexo].find(r => s <= r.hasta)?.nivel ?? null
}
