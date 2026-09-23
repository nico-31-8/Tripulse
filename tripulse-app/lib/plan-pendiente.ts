// ============================================================
// Lo dibujado que todavía no está en el plan
// ============================================================
//
// El lienzo son DOS COSAS y es fácil confundirlas:
//
//   · EL DIBUJO — las barras, las UA y los chips. Se autoguarda solo, en
//     `dibujo_borrador`, y no lo ve nadie más: ni el atleta, ni el calendario,
//     ni las gráficas de carga. Es la hoja de trabajo del entrenador.
//   · EL PLAN — las filas de `macrociclo`, `mesociclo` y `microciclo`, con las
//     sesiones colgando. Eso sí lo ve el atleta.
//
// El puente entre los dos es el botón «Generar planificación». Estirar una
// barra cambia el dibujo y deja el plan como estaba, y eso NO SE VEÍA: el
// lienzo dice «Guardado 09:43» —que es verdad, el dibujo está guardado— y es
// fácil entender que ya está todo hecho. Aquí se compara lo uno con lo otro
// para poder avisar.
//
// SE COMPARA LO QUE ESCRIBE «GENERAR», no todo. Las semanas que no caen dentro
// de ningún mesociclo no llegan a la base, así que cambiarles la carga no es un
// cambio pendiente: es un cambio que no va a ninguna parte.

import { semanasEntre } from './fechas'
import { tipoMicrociclo } from './microciclo-tipos'

export interface FotoMacro { si: number; sf: number; nombre: string; tipo: string }
export interface FotoMeso extends FotoMacro { intensidad: number }
export interface FotoSemana { i: number; ua: number; tipo: string }

export interface FotoPlan {
  macros: FotoMacro[]
  mesos: FotoMeso[]
  semanas: FotoSemana[]
}

const txt = (v: unknown) => String(v ?? '').trim()
const num = (v: unknown) => Number(v) || 0

const ordena = <T extends { si?: number; i?: number }>(xs: T[]) =>
  [...xs].sort((a, b) => (a.si ?? a.i ?? 0) - (b.si ?? b.i ?? 0))

export interface DibujoMacro { si: number; sf: number; nombre?: string | null; tipo?: string | null }
export interface DibujoMeso extends DibujoMacro { intensidad?: number | null }
export interface DibujoSemana { i: number; ua?: number | null; tipo?: string | null }

/** La foto de lo que hay dibujado ahora mismo. */
export function fotoDelDibujo(
  macros: DibujoMacro[], mesos: DibujoMeso[], semanas: DibujoSemana[],
): FotoPlan {
  /* Solo las semanas que caen dentro de un mesociclo: son las únicas que
     «Generar» escribe. */
  const dentro = (i: number) => mesos.some(m => i >= m.si && i <= m.sf)
  return {
    macros: ordena((macros || []).map(m => ({ si: m.si, sf: m.sf, nombre: txt(m.nombre), tipo: txt(m.tipo) }))),
    mesos: ordena((mesos || []).map(m => ({
      si: m.si, sf: m.sf, nombre: txt(m.nombre), tipo: txt(m.tipo), intensidad: num(m.intensidad),
    }))),
    semanas: ordena((semanas || []).filter(s => dentro(s.i)).map(s => ({
      i: s.i, ua: num(s.ua), tipo: txt(tipoMicrociclo(s.tipo || undefined)),
    }))),
  }
}

export interface FilaCiclo {
  fecha_inicio?: string | null
  duracion_semanas?: number | null
  objetivo?: string | null
  tipo?: string | null
  tipo_periodizacion?: string | null
  intensidad_relativa?: number | null
  ua_planificada?: number | null
}

/**
 * La foto del plan que hay en la base, en semanas del lienzo.
 *
 * Las fechas se pasan a índice de semana con la misma cuenta que usa el lienzo
 * para pintar: así los dos lados hablan el mismo idioma y se pueden comparar.
 */
export function fotoDelPlan(
  fechaInicio: string,
  macsDb: FilaCiclo[], mesosDb: FilaCiclo[], microsDb: FilaCiclo[],
): FotoPlan | null {
  if (!fechaInicio || !(macsDb || []).length) return null
  const semDe = (f: unknown) => semanasEntre(fechaInicio, String(f ?? '').slice(0, 10))
  const tramo = (c: FilaCiclo) => {
    const si = semDe(c.fecha_inicio)
    return { si, sf: si + Math.max(1, num(c.duracion_semanas) || 1) - 1 }
  }
  return {
    macros: ordena((macsDb || []).map(c => ({ ...tramo(c), nombre: txt(c.objetivo), tipo: txt(c.tipo_periodizacion) }))),
    mesos: ordena((mesosDb || []).map(c => ({
      ...tramo(c), nombre: txt(c.objetivo), tipo: txt(c.tipo), intensidad: num(c.intensidad_relativa),
    }))),
    semanas: ordena((microsDb || []).map(c => ({
      i: semDe(c.fecha_inicio), ua: num(c.ua_planificada), tipo: txt(tipoMicrociclo(c.tipo || undefined)),
    }))),
  }
}

/** Cuántos elementos no cuadran entre las dos listas. */
function cuantosCambian<T>(a: T[], b: T[]): number {
  const bs = b.map(x => JSON.stringify(x))
  const as = a.map(x => JSON.stringify(x))
  const sobranDeA = [...as]
  const sobranDeB = [...bs]
  for (const x of as) {
    const k = sobranDeB.indexOf(x)
    if (k >= 0) { sobranDeB.splice(k, 1); sobranDeA.splice(sobranDeA.indexOf(x), 1) }
  }
  /* Un bloque cambiado sobra en los dos lados, y es UN cambio, no dos. */
  return Math.max(sobranDeA.length, sobranDeB.length)
}

export interface Pendiente {
  hay: boolean
  /** Para el aviso, ya en castellano. */
  frase: string
}

/**
 * Qué falta por llevar al plan.
 *
 * Sin plan detrás, lo pendiente es todo: el dibujo entero está sin generar.
 */
export function loPendiente(dibujo: FotoPlan, plan: FotoPlan | null): Pendiente {
  if (!plan) {
    const hay = dibujo.macros.length > 0
    return { hay, frase: hay ? 'Este dibujo todavía no se ha convertido en plan.' : '' }
  }
  const macros = cuantosCambian(dibujo.macros, plan.macros)
  const mesos = cuantosCambian(dibujo.mesos, plan.mesos)
  const semanas = cuantosCambian(dibujo.semanas, plan.semanas)
  if (!macros && !mesos && !semanas) return { hay: false, frase: '' }

  const partes: string[] = []
  if (macros) partes.push(macros === 1 ? '1 macrociclo' : macros + ' macrociclos')
  if (mesos) partes.push(mesos === 1 ? '1 mesociclo' : mesos + ' mesociclos')
  if (semanas) partes.push(semanas === 1 ? 'la carga de 1 semana' : 'la carga de ' + semanas + ' semanas')
  const lista = partes.length > 1
    ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1]
    : partes[0]
  return { hay: true, frase: 'Has cambiado ' + lista + ' desde la última vez.' }
}
