// ============================================================
// TRIPULSE — Que el plan reaccione a lo que el atleta HACE
// ============================================================
// Hasta aquí el plan se adaptaba a lo que el atleta DECLARA —sus horas, sus
// días, su nivel— y a la fase en la que está. Nada más. Si se salta tres
// sesiones o vuelve con RPE 9 de las suaves, el plan seguía como si nada.
//
// LO QUE SE MIRA, Y POR QUÉ SOLO ESTO
// Dos señales, las dos salen de la tabla `sesion` sin inventar nada:
//   · ADHERENCIA: cuántas de las que le puse ha hecho. Es la señal más honesta
//     que existe, porque no depende de que rellene nada.
//   · ESFUERZO: el RPE que reporta frente al que el plan esperaba. Dice si va
//     sobrado o ahogado.
//
// Se dejan fuera a propósito el wellness y la HRV: son buenos indicadores pero
// dependen de que los rellene a diario, y ajustar el plan de alguien a partir
// de un dato que a veces está y a veces no produce un plan que da bandazos.
//
// LAS TRES REGLAS QUE GOBIERNAN TODO ESTO
//   1. NUNCA con una sola semana. Una semana mala es una gripe, un viaje o un
//      niño malo. Dos seguidas ya es una tendencia.
//   2. BAJAR es barato, SUBIR es caro. Bajar se hace solo; subir se PROPONE y
//      lo decide el atleta. Equivocarse bajando cuesta una sesión; equivocarse
//      subiendo cuesta una lesión.
//   3. UN CAMBIO POR VEZ, y pequeño. Recortar el 40 % de golpe porque una
//      quincena ha ido mal es cambiar un problema por otro.
import { diasEntre } from './desplazar'

export interface SesionVista {
  fecha: string
  /** 'Realizada' o cualquier otra cosa. */
  estado?: string | null
  /** Lo que el plan esperaba que costara. */
  rpeEsperado?: number | null
  /** Lo que el atleta dijo que costó. */
  rpeReportado?: number | null
}

export interface Adaptacion {
  /** Multiplicador sobre las horas de referencia. 1 = déjalo como está. */
  factorHoras: number
  /** Días sugeridos, si la adherencia dice que no llega a los que declaró. */
  diasSugeridos: number | null
  /** Lo que se ha hecho solo, en la primera persona del atleta. */
  aplicado: string[]
  /** Lo que NO se hace solo porque implica subir: se le propone. */
  propuesto: string[]
  /** Datos que sostienen lo anterior, para poder explicarlo. */
  adherencia: number | null
  semanas: number
}

const SIN_CAMBIOS = (semanas: number, adherencia: number | null): Adaptacion =>
  ({ factorHoras: 1, diasSugeridos: null, aplicado: [], propuesto: [], adherencia, semanas })

/**
 * Cuántas semanas cubren estas sesiones.
 *
 * Se cuentan los DÍAS que abarcan, extremos incluidos, y se redondea hacia
 * arriba. Con `round(dias/7)+1` seis días sueltos salían como dos semanas, y
 * eso disparaba el ajuste con una sola semana de datos — justo lo que la regla
 * de las dos semanas viene a impedir.
 */
function semanasDe(sesiones: SesionVista[]): number {
  if (sesiones.length < 2) return sesiones.length ? 1 : 0
  const fechas = sesiones.map(s => s.fecha).sort()
  const dias = diasEntre(fechas[0], fechas[fechas.length - 1])
  return Math.max(1, Math.ceil((dias + 1) / 7))
}

export function adaptar(sesiones: SesionVista[], diasDeclarados: number): Adaptacion {
  const semanas = semanasDe(sesiones)

  /* Regla 1: con menos de dos semanas no se toca nada. Una semana mala es una
     gripe, un viaje o un niño malo — no una tendencia. */
  if (semanas < 2 || sesiones.length < 4) return SIN_CAMBIOS(semanas, null)

  const hechas = sesiones.filter(s => s.estado === 'Realizada')
  const adherencia = Math.round((hechas.length / sesiones.length) * 100)

  const a = SIN_CAMBIOS(semanas, adherencia)

  // ---- Adherencia ----
  if (adherencia < 60) {
    /* Un plan que no se sigue es peor que uno más pequeño que sí. No se recorta
       hasta lo que hace exactamente: se baja un escalón y se vuelve a mirar.
       Bajar de golpe al 55 % porque una quincena fue mala es cambiar un
       problema por otro. */
    a.factorHoras = 0.8
    a.diasSugeridos = Math.max(3, Math.round((hechas.length / semanas)))
    a.aplicado.push(
      'Has hecho el ' + adherencia + ' % de lo que tenías. He bajado el volumen un 20 %: ' +
      'un plan que no se sigue no sirve de nada, y prefiero uno más corto que hagas entero.')
  } else if (adherencia < 80) {
    a.factorHoras = 0.9
    a.aplicado.push(
      'Te has dejado alguna sesión (' + adherencia + ' % hechas). He aflojado un 10 % para que quepa mejor.')
  }

  // ---- Esfuerzo ----
  const conRpe = hechas.filter(s => s.rpeReportado != null && s.rpeEsperado != null)
  if (conRpe.length >= 4) {
    const desvio = conRpe.reduce((sum, s) => sum + ((s.rpeReportado || 0) - (s.rpeEsperado || 0)), 0) / conRpe.length

    if (desvio >= 1.5) {
      /* Le está costando bastante más de lo previsto. Puede ser fatiga
         acumulada o que el plan le viene grande; en los dos casos la respuesta
         es la misma y no hace falta distinguirlas para acertar. */
      a.factorHoras = Math.min(a.factorHoras, 0.85)
      a.aplicado.push(
        'Las sesiones te están costando más de lo que tocaba. He bajado un poco la carga: ' +
        'si sigue pasando la semana que viene, hablémoslo.')
    } else if (desvio <= -1.5 && adherencia >= 90) {
      /* Regla 2: subir NO se hace solo. Se propone y decide él. Un plan que se
         endurece por su cuenta es la forma más rápida de lesionar a alguien
         que iba bien. */
      a.propuesto.push(
        'Lo estás haciendo todo y te está costando menos de lo previsto. ' +
        'Si quieres, podemos subir el volumen. Dímelo y lo ajusto.')
    }
  }

  return a
}

/** Las horas de una semana después de adaptar, al escalón de media hora. */
export function horasAdaptadas(horas: number, a: Adaptacion): number {
  return Math.round(horas * a.factorHoras * 2) / 2
}
