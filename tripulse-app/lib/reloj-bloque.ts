// ============================================================
// El reloj que sabe qué formato está cronometrando
// ============================================================
//
// A pie de pista, un bloque se leía pero no se cronometraba como lo que es. La
// pantalla decía «AMRAP 12′» y al lado le ponía el cronómetro genérico de
// cualquier tarea: contando hacia ARRIBA, igual que si fueran 4 × 400. Con eso,
// dirigir un AMRAP es mirar el reloj y restar de cabeza, y un EMOM es cantar los
// minutos a ojo.
//
// Aquí el reloj sabe el formato. Dado lo que lleva corriendo, dice en qué tramo
// está, cuánto queda de ese tramo y si ya se acabó.
//
// EL TIEMPO ENTRA POR PARÁMETRO, igual que en lib/dirigir-cronometro: un Tabata
// de ocho vueltas se comprueba entero en un milisegundo en vez de esperando
// cuatro minutos, y el mismo número da siempre lo mismo. Quien pinta es el único
// que llama a `Date.now()`.
//
// EL TRAMO ES UN NÚMERO QUE SUBE, y por eso existe: la pantalla se queda con el
// anterior y, en cuanto cambia, pita. Es el mismo trato que los escalones de un
// test de campo (lib/pitido.debePitar), así que no hay una segunda manera de
// decidir cuándo suena.

import type { ConfigBloque, Formato } from './bloque-formato'

export interface FaseBloque {
  /**
   * Qué se está haciendo.
   * · `trabajo` / `pausa` — el Tabata, que alterna.
   * · `cuenta` — hay un tiempo fijo del que descontar (AMRAP, EMOM, el cap).
   * · `libre` — no hay nada que descontar: el reloj cuenta hacia arriba.
   */
  tipo: 'trabajo' | 'pausa' | 'cuenta' | 'libre'
  /** Lo que se enseña grande, en ms. */
  ms: number
  /** Si `ms` va hacia atrás. En `libre` es lo transcurrido y va hacia delante. */
  atras: boolean
  /** «AMRAP», «Minuto 3 de 12», «Trabajo 4/8», «Descanso 4/8». */
  etiqueta: string
  /** En qué tramo va, empezando por 1. Cuando sube, la pantalla pita. */
  tramo: number
  /** Cuántos tramos tiene en total. 0 = no se sabe (va libre). */
  tramos: number
  terminado: boolean
}

const LIBRE = (ms: number, etiqueta: string): FaseBloque =>
  ({ tipo: 'libre', ms, atras: false, etiqueta, tramo: 1, tramos: 0, terminado: false })

const num = (v: unknown, min = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min ? n : 0
}

/**
 * En qué punto del bloque estamos.
 *
 * `lineas` solo importa en el Tabata: sus vueltas se cuentan POR LÍNEA, así que
 * un 20/10 × 8 con tres ejercicios son 24 vueltas, no 8. Con una línea —o sin
 * saberlo— sale lo mismo que antes.
 */
export function faseDeBloque(
  formato: Formato | null | undefined,
  cfg: ConfigBloque,
  transcurridoMs: number,
  lineas = 1,
): FaseBloque {
  const t = Math.max(0, num(transcurridoMs))

  /* ── Un tiempo fijo del que descontar: AMRAP y el cap del for time ── */
  const cuentaAtras = (totalMs: number, etiqueta: string): FaseBloque => {
    if (totalMs <= 0) return LIBRE(t, etiqueta)
    const fin = t >= totalMs
    return {
      tipo: 'cuenta', ms: fin ? 0 : totalMs - t, atras: true,
      etiqueta, tramo: 1, tramos: 1, terminado: fin,
    }
  }

  switch (formato) {
    case 'amrap':
      return cuentaAtras(num(cfg.minutos) * 60_000, 'AMRAP')

    case 'fortime':
      /* Sin límite, un for time es «lo que tardes»: contar hacia atrás desde un
         número que no existe sería inventárselo. */
      return num(cfg.limite) > 0
        ? cuentaAtras(num(cfg.limite) * 60_000, 'Límite')
        : LIBRE(t, 'For time')

    case 'emom': {
      const cada = num(cfg.cada) * 1000
      const total = num(cfg.minutos) * 60_000
      if (cada <= 0 || total <= 0) return LIBRE(t, 'EMOM')
      const tramos = Math.max(1, Math.floor(total / cada))
      if (t >= total) {
        return { tipo: 'cuenta', ms: 0, atras: true, etiqueta: 'EMOM', tramo: tramos, tramos, terminado: true }
      }
      const i = Math.floor(t / cada)
      return {
        tipo: 'cuenta', ms: cada - (t % cada), atras: true,
        /* «Minuto 3 de 12» solo si de verdad son minutos; con otro intervalo,
           decir «minuto» sería mentir y a pie de pista se canta en voz alta. */
        etiqueta: (num(cfg.cada) === 60 ? 'Minuto ' : 'Tramo ') + (i + 1) + ' de ' + tramos,
        tramo: i + 1, tramos, terminado: false,
      }
    }

    case 'tabata': {
      const trabajo = num(cfg.trabajo) * 1000
      const pausa = num(cfg.pausa) * 1000
      const ciclo = trabajo + pausa
      const vueltas = Math.max(1, num(cfg.vueltas)) * Math.max(1, lineas)
      if (ciclo <= 0) return LIBRE(t, 'Tabata')
      const total = ciclo * vueltas
      if (t >= total) {
        return { tipo: 'pausa', ms: 0, atras: true, etiqueta: 'Tabata', tramo: vueltas * 2, tramos: vueltas * 2, terminado: true }
      }
      const v = Math.floor(t / ciclo)
      const dentro = t % ciclo
      const enTrabajo = dentro < trabajo
      /* Dos tramos por vuelta —trabajo y pausa— para que la pantalla pite
         también al empezar a descansar, que es la mitad del Tabata. */
      return {
        tipo: enTrabajo ? 'trabajo' : 'pausa',
        ms: enTrabajo ? trabajo - dentro : ciclo - dentro,
        atras: true,
        etiqueta: (enTrabajo ? 'Trabajo ' : 'Descanso ') + (v + 1) + '/' + vueltas,
        tramo: v * 2 + (enTrabajo ? 1 : 2),
        tramos: vueltas * 2,
        terminado: false,
      }
    }

    /* Las rondas no llevan reloj automático: lo que dura cada una es «lo que
       tardes», y el descanso lo arranca el entrenador cuando acaba la ronda. */
    default:
      return LIBRE(t, '')
  }
}

/** ¿Este formato tiene algo que cronometrar por su cuenta? */
export function tieneReloj(formato: Formato | null | undefined, cfg: ConfigBloque): boolean {
  if (formato === 'amrap' || formato === 'emom' || formato === 'tabata') return true
  return formato === 'fortime' && num(cfg.limite) > 0
}
