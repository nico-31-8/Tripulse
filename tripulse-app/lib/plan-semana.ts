// ============================================================
// TRIPULSE — La forma de la semana
// ============================================================
// Primer escalón del planificador. NO llama a ninguna IA: decide cuánto volumen
// va a cada deporte, cuántas sesiones de cada uno, cuántas pueden ser de calidad
// y qué presupuesto de zonas hay. Puro cálculo.
//
// POR QUÉ ASÍ Y NO PIDIÉNDOSELO AL MODELO
// Lo que hace segura una semana no es la creatividad, son los límites: no pasar
// del volumen que el atleta maneja, no meter dos días duros seguidos, no bajar
// del mínimo de sesiones que sostiene una disciplina. A un prompt se le convence
// de saltarse cualquiera de esas tres; a este fichero no. La IA entra DESPUÉS, y
// su trabajo es solo elegir qué plantilla llena cada hueco que este motor dejó.
//
// Es también lo que hace que el plan se pueda explicar: cada número de aquí sale
// de una tabla con fuente, no de una opinión.
//
// FUENTES
//   · B1-04 Principio 5 — reparto de volumen entre disciplinas por distancia
//   · B1-04 Principio 5 — mínimos y óptimo de sesiones por disciplina
//   · B1-04 Principio 2 — sesiones de calidad por nivel
//   · B1-04 Principio 1 — duro-fácil: 36–48 h entre sesiones de calidad
//   · B1-11 — con tiempo limitado se prioriza por debilidad del atleta
//   · lib/distribucion-zonas.ts — el presupuesto por zona (B1-00b)
import {
  repartoPorDistancia, repartoPorFase, tidDeFase, ETIQUETA_DISTANCIA,
  type DistanciaTri, type FaseMacro, type Disciplina, type FranjaReparto,
} from './distribucion-zonas'
import { fuerzaDeFase } from './plantillas-fuerza'

export type NivelAtleta = 'principiante' | 'intermedio' | 'avanzado' | 'elite'

/** Las tres de resistencia más la fuerza, que también come volumen. */
export type Bloque = Disciplina | 'Fuerza'

export const BLOQUES: Bloque[] = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']

export const ETIQUETA_BLOQUE: Record<Bloque, string> = {
  Natacion: 'Natación', Ciclismo: 'Ciclismo', Carrera: 'Carrera', Fuerza: 'Fuerza',
}

// ------------------------------------------------------------
// Reparto de volumen entre disciplinas — B1-04 Principio 5
// ------------------------------------------------------------
// La bici se lleva casi la mitad en todas las distancias, y su peso crece según
// alarga la prueba. No es una preferencia: es donde está el tiempo de carrera.
export interface Franja { min: number; max: number }

const REPARTO_DISCIPLINA: Record<DistanciaTri, Record<Bloque, Franja>> = {
  sprint:   { Natacion: { min: 20, max: 25 }, Ciclismo: { min: 40, max: 45 }, Carrera: { min: 30, max: 35 }, Fuerza: { min: 0, max: 5 } },
  olimpico: { Natacion: { min: 18, max: 22 }, Ciclismo: { min: 42, max: 48 }, Carrera: { min: 28, max: 34 }, Fuerza: { min: 0, max: 5 } },
  medio:    { Natacion: { min: 15, max: 20 }, Ciclismo: { min: 45, max: 52 }, Carrera: { min: 28, max: 33 }, Fuerza: { min: 0, max: 5 } },
  largo:    { Natacion: { min: 12, max: 18 }, Ciclismo: { min: 50, max: 58 }, Carrera: { min: 25, max: 32 }, Fuerza: { min: 0, max: 3 } },
}

// B1-04 Principio 5: por debajo de 2 sesiones semanales una disciplina no se
// sostiene; el óptimo está en 3–4. El tope de 5 es nuestro, para que un atleta
// con muchas horas no acabe con seis nados de media hora.
const MIN_SESIONES = 2
const MAX_SESIONES = 5

// Duración de referencia de una sesión, para repartir los minutos en sesiones.
// Salen de las sesiones tipo de B1-00d y de la semana tipo de B1-04.
const MINUTOS_TIPO: Record<Bloque, number> = {
  Natacion: 60, Ciclismo: 90, Carrera: 60, Fuerza: 45,
}

// Suelo de una sesión de fuerza. La más corta de B3-01 es la de mantenimiento
// —3 ejercicios × 2 series con 2 min de descanso— y no baja de aquí. Por debajo
// no se prescribe: se dice que no cabe.
const MIN_FUERZA = 25

/** El primer número de «2–3», «1–2», «2 — no más: …». 0 si no hay ninguno. */
export function sesionesPrescritasFuerza(txt: string | null | undefined): number {
  const m = String(txt ?? '').match(/\d+/)
  return m ? Number(m[0]) : 0
}

// B1-04 Principio 2. Una sesión de calidad es Z4–Z5: la que produce la
// adaptación y la que cuesta 36–48 h de recuperación.
const CALIDAD_POR_NIVEL: Record<NivelAtleta, { min: number; max: number }> = {
  principiante: { min: 1, max: 2 },
  intermedio: { min: 2, max: 3 },
  avanzado: { min: 3, max: 4 },
  elite: { min: 4, max: 6 },
}

// ------------------------------------------------------------
// Entrada y salida
// ------------------------------------------------------------

export interface EntradaSemana {
  /** Horas semanales que el atleta declara manejar (anamnesis `volumen_semanal`). */
  horasSemana: number
  /** Días disponibles a la semana (anamnesis `dias_semana`). */
  diasSemana: number
  distancia: DistanciaTri
  fase: FaseMacro
  nivel: NivelAtleta
  /** Anamnesis `disciplina_debil`. Sesga el reparto DENTRO del rango, nunca fuera. */
  disciplinaDebil?: string | null
}

export interface RepartoBloque {
  bloque: Bloque
  etiqueta: string
  pct: number
  minutos: number
  sesiones: number
  /** Minutos por sesión, redondeados. Lo que de verdad mira un entrenador. */
  minutosPorSesion: number
}

export interface FormaSemana {
  minutosTotales: number
  bloques: RepartoBloque[]
  sesionesTotales: number
  sesionesCalidad: number
  /** Presupuesto de zonas por disciplina, cruzando distancia y fase. */
  zonas: Record<Disciplina, FranjaReparto[]>
  tid: string
  /** Las barandillas que se activaron. Vacío = la semana entra sin forzar nada. */
  avisos: string[]
  /** Para poder explicar el plan sin volver a calcularlo. */
  resumen: string
}

const sinTildes = (s: any) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** «natación» → 'Natacion'. La anamnesis lo guarda en texto libre. */
export function bloqueDeTexto(txt: string | null | undefined): Bloque | null {
  const t = sinTildes(txt)
  if (!t) return null
  if (t.startsWith('nata')) return 'Natacion'
  if (t.startsWith('cicl') || t.startsWith('bici')) return 'Ciclismo'
  if (t.startsWith('carr') || t.startsWith('corr') || t.startsWith('run')) return 'Carrera'
  if (t.startsWith('fuer')) return 'Fuerza'
  return null
}

/**
 * Reparte 100 puntos entre los bloques respetando los rangos de B1-04.
 *
 * Sin debilidad declarada, cada uno se queda en el punto medio de su franja y el
 * resto se ajusta proporcionalmente hasta sumar 100. Con debilidad, ESA sube a su
 * máximo y la diferencia se descuenta de las demás sin bajarlas de su mínimo:
 * B1-11 dice que con tiempo limitado se prioriza por la debilidad del atleta,
 * pero el rango es el rango — si no cabe, se coge lo que quepa y se avisa.
 */
export const RESISTENCIA: Bloque[] = ['Natacion', 'Ciclismo', 'Carrera']

/**
 * Los rangos de reparto de B1-04 para una distancia.
 *
 * Se exportan para que el VERIFICADOR pueda juzgar una semana que no ha generado
 * él: la de la IA, o una que el entrenador haya editado a mano. La misma tabla
 * que sirve para repartir sirve para comprobar si un reparto cualquiera vale.
 */
export function rangoDisciplina(distancia: DistanciaTri): Record<Bloque, Franja> {
  return REPARTO_DISCIPLINA[distancia]
}

/** El mínimo y el máximo de sesiones por disciplina (B1-04 Principio 5). */
export const LIMITES_SESIONES = { min: MIN_SESIONES, max: MAX_SESIONES }

/** Empuja `sobre` hasta que sumen `objetivo`, sin salirse de sus franjas. */
function ajustarA(
  objetivo: number,
  sobre: Bloque[],
  pct: Record<Bloque, number>,
  franjas: Record<Bloque, Franja>,
): number {
  let sobra = sobre.reduce((a, b) => a + pct[b], 0) - objetivo
  for (let vuelta = 0; vuelta < 12 && Math.abs(sobra) > 0.01; vuelta++) {
    const conHolgura = sobre.filter(b => sobra > 0 ? pct[b] > franjas[b].min : pct[b] < franjas[b].max)
    if (!conHolgura.length) break
    const paso = sobra / conHolgura.length
    conHolgura.forEach(b => {
      const nuevo = Math.min(franjas[b].max, Math.max(franjas[b].min, pct[b] - paso))
      sobra -= (pct[b] - nuevo)
      pct[b] = nuevo
    })
  }
  return sobra
}

function repartirPorcentajes(
  distancia: DistanciaTri,
  debil: Bloque | null,
  hayFuerza: boolean,
  avisos: string[],
): Record<Bloque, number> {
  const franjas = REPARTO_DISCIPLINA[distancia]
  const pct: Record<Bloque, number> = {} as any

  // LA FUERZA COGE SU MÁXIMO, no el punto medio, y esto merece explicación.
  // B1-04 la da como «0–5 %», un rango que incluye el cero. Pero B3-01 documenta
  // que de ahí salen las mejoras de economía (−3 a −5 % de VO₂ al mismo ritmo),
  // así que en las fases que la llevan no es opcional. Con el punto medio, un
  // atleta de 10 h se quedaba en 15 minutos de fuerza a la semana: ni una sesión.
  pct.Fuerza = hayFuerza ? franjas.Fuerza.max : 0

  RESISTENCIA.forEach(b => { pct[b] = (franjas[b].min + franjas[b].max) / 2 })
  const sobra = ajustarA(100 - pct.Fuerza, RESISTENCIA, pct, franjas)
  if (Math.abs(sobra) > 0.5) {
    avisos.push(`El reparto por disciplina de ${ETIQUETA_DISTANCIA[distancia]} no cuadra el 100 % dentro de sus rangos (sobran ${sobra.toFixed(1)} puntos). Se deja lo más cerca posible.`)
  }

  if (debil && debil !== 'Fuerza') {
    const margen = franjas[debil].max - pct[debil]
    if (margen > 0.01) {
      pct[debil] = franjas[debil].max
      const otros = RESISTENCIA.filter(b => b !== debil)
      const resto = ajustarA(100 - pct.Fuerza - pct[debil], otros, pct, franjas)
      if (Math.abs(resto) > 0.5) {
        // Lo que no se pudo quitar se devuelve, para no inflar el total.
        pct[debil] -= resto
        avisos.push(`No se puede volcar del todo la semana hacia ${ETIQUETA_BLOQUE[debil]}: las otras disciplinas ya están en su mínimo para ${ETIQUETA_DISTANCIA[distancia]}.`)
      }
    }
  }
  return pct
}

/**
 * Cuántas sesiones de calidad caben de verdad.
 *
 * B1-04 Principio 1: una sesión dura necesita 36–48 h antes de que otra produzca
 * adaptación, así que no caben dos seguidas. Con los días disponibles en la mano,
 * el techo real es uno de cada dos. Es la barandilla que más se salta un plan
 * generado, porque sobre el papel meter calidad siempre parece que suma.
 */
export function topeCalidad(diasSemana: number): number {
  return Math.max(1, Math.ceil(diasSemana / 2))
}

export function formaDeSemana(e: EntradaSemana): FormaSemana {
  const avisos: string[] = []
  const dias = Math.max(1, Math.min(7, Math.round(e.diasSemana || 0)))
  if (!e.diasSemana || e.diasSemana < 1) avisos.push('No consta cuántos días puede entrenar: se asume 1 y el plan no vale de mucho hasta que se rellene.')
  if (dias < 3) avisos.push(`Con ${dias} día(s) a la semana no se sostienen las tres disciplinas. El plan prioriza, no reparte.`)

  const minutosTotales = Math.round(Math.max(0, e.horasSemana || 0) * 60)
  if (minutosTotales <= 0) avisos.push('No consta el volumen semanal: sin él no se puede repartir nada.')

  const debil = bloqueDeTexto(e.disciplinaDebil)
  // La fuerza sigue a la fase, no al reparto: en transición no toca ninguna.
  const plantillasFuerza = fuerzaDeFase(e.fase)
  const pct = repartirPorcentajes(e.distancia, debil, plantillasFuerza.length > 0, avisos)

  const bloques: RepartoBloque[] = BLOQUES.map(b => {
    const minutos = Math.round(minutosTotales * pct[b] / 100)
    let sesiones = 0
    if (minutos > 0) {
      sesiones = Math.round(minutos / MINUTOS_TIPO[b])
      if (b === 'Fuerza') {
        // Por debajo de MIN_FUERZA no da ni para la sesión de mantenimiento más
        // corta de B3-01 (3 ejercicios × 2 series), así que se deja en cero y se
        // dice, en vez de prescribir quince minutos de gimnasio.
        sesiones = minutos < MIN_FUERZA ? 0 : Math.max(1, Math.min(3, sesiones))
      } else {
        sesiones = Math.max(MIN_SESIONES, Math.min(MAX_SESIONES, sesiones))
      }
    }
    return {
      bloque: b,
      etiqueta: ETIQUETA_BLOQUE[b],
      pct: Math.round(pct[b] * 10) / 10,
      minutos: b === 'Fuerza' && sesiones === 0 ? 0 : minutos,
      sesiones,
      minutosPorSesion: sesiones ? Math.round(minutos / sesiones) : 0,
    }
  })

  const fuerza = bloques.find(b => b.bloque === 'Fuerza')!
  if (plantillasFuerza.length && fuerza.sesiones === 0) {
    avisos.push(`Con ${Math.round(minutosTotales / 6) / 10} h a la semana, el ${REPARTO_DISCIPLINA[e.distancia].Fuerza.max} % que B1-04 reserva a la fuerza son ${Math.round(minutosTotales * REPARTO_DISCIPLINA[e.distancia].Fuerza.max / 100)} min: no llega ni para la sesión más corta de B3-01. O se le quita tiempo a otra disciplina o esta fase se queda sin fuerza.`)
  } else if (plantillasFuerza.length && fuerza.sesiones < sesionesPrescritasFuerza(plantillasFuerza[0].sesionesSemana)) {
    avisos.push(`B3-01 pide ${plantillasFuerza[0].sesionesSemana} sesiones de ${plantillasFuerza[0].nombre.toLowerCase()} y en este volumen solo cabe ${fuerza.sesiones}. Es el techo del ${REPARTO_DISCIPLINA[e.distancia].Fuerza.max} % de B1-04.`)
  }

  // MENOS SESIONES Y MÁS LARGAS cuando no caben en los días que hay.
  //
  // Doblar es normal en triatlón —la natación se combina el mismo día sin coste
  // (B1-04 Principio 3)— pero hay un límite. Dividir el volumen entre el número
  // de sesiones que salga de la duración tipo daba 13 sesiones para 16 h en siete
  // días: seis días con doble. Un entrenador con ese volumen hace unas diez, más
  // largas, que además es lo que pide una prueba larga.
  //
  // Se recorta por la disciplina que más sesiones tenga, nunca por debajo del
  // mínimo de 2, y los minutos se reparten entre las que quedan.
  const TOPE = Math.floor(dias * 1.5)
  let sesionesTotales = bloques.reduce((a, b) => a + b.sesiones, 0)
  let recortadas = 0
  while (sesionesTotales > TOPE) {
    const candidata = bloques
      .filter(b => b.bloque !== 'Fuerza' && b.sesiones > MIN_SESIONES)
      .sort((a, b) => b.sesiones - a.sesiones)[0]
    if (!candidata) break
    candidata.sesiones--
    candidata.minutosPorSesion = Math.round(candidata.minutos / candidata.sesiones)
    sesionesTotales--
    recortadas++
  }
  if (recortadas) {
    avisos.push(`${recortadas} sesión(es) menos y más largas: con ${dias} día(s) no caben más sin que casi todos lleven doble. El volumen es el mismo.`)
  }
  if (sesionesTotales > dias * 1.5) {
    avisos.push(`Aun así salen ${sesionesTotales} sesiones para ${dias} día(s): más de la mitad llevarán doble. Lo barato es doblar natación, que no carga el tren inferior (B1-04, interferencia baja).`)
  }

  const rango = CALIDAD_POR_NIVEL[e.nivel] || CALIDAD_POR_NIVEL.intermedio
  const tope = topeCalidad(dias)
  // Se arranca por el extremo BAJO del rango del nivel. Subir la calidad es una
  // decisión del entrenador mirando cómo responde el atleta; un generador que
  // empieza por arriba solo puede equivocarse hacia el lado caro.
  let sesionesCalidad = rango.min
  if (sesionesCalidad > tope) {
    avisos.push(`Un ${e.nivel} lleva ${rango.min}–${rango.max} sesiones de calidad, pero con ${dias} día(s) solo caben ${tope} sin poner dos duras seguidas (B1-04, duro-fácil). Se queda en ${tope}.`)
    sesionesCalidad = tope
  }
  if (sesionesCalidad > sesionesTotales) sesionesCalidad = sesionesTotales

  // El presupuesto de zonas: la distancia dice el reparto de fondo, la fase lo
  // mueve. Se cruzan promediando, que es lo que hace un entrenador al pasar de
  // preparación general a específica sin cambiar de objetivo.
  const zonas = {} as Record<Disciplina, FranjaReparto[]>
  ;(['Natacion', 'Ciclismo', 'Carrera'] as Disciplina[]).forEach(d => {
    const porDist = repartoPorDistancia(e.distancia, d)
    const porFase = repartoPorFase(e.fase, d)
    zonas[d] = porDist.map((f, i) => ({
      siglas: f.siglas,
      min: Math.round((f.min + porFase[i].min) / 2),
      max: Math.round((f.max + porFase[i].max) / 2),
      zonasFuente: f.zonasFuente,
    }))
  })

  const conVolumen = bloques.filter(b => b.minutos > 0)
  const resumen = [
    `${ETIQUETA_DISTANCIA[e.distancia]} · ${Math.round(minutosTotales / 6) / 10} h en ${sesionesTotales} sesiones sobre ${dias} día(s).`,
    conVolumen.map(b => `${b.etiqueta} ${b.pct}% (${b.sesiones}×${b.minutosPorSesion}′)`).join(' · ') + '.',
    `${sesionesCalidad} de calidad. Distribución ${tidDeFase(e.fase).toLowerCase()}.`,
  ].join(' ')

  return { minutosTotales, bloques, sesionesTotales, sesionesCalidad, zonas, tid: tidDeFase(e.fase), avisos, resumen }
}
