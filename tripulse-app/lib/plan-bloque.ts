// ============================================================
// TRIPULSE — Una semana de un bloque, lista para volcar
// ============================================================
// Los tres sitios que generan un bloque entero —el planificador del entrenador
// (PlanificarMesociclo y CadenaMesociclo) y «Mi plan» del deportista
// (MisSemanas, a mano y en el horizonte rodante)— repetían la misma cadena:
// forma → colocación → relleno. Cuatro copias: cualquier arreglo había que
// hacerlo cuatro veces, y bastaba con olvidar una.
//
// Esta es la única copia, y es la que sabe dos cosas que la cadena no sabía y
// que salieron mal el 2026-10-18:
//
//   · QUÉ DISCIPLINAS HACE (`deportista.disciplinas`). Viajan en la base hasta
//     el reparto (lib/plan-semana), que no le da ni un minuto a las demás.
//   · QUÉ DÍAS COMPITE. Ese día no se planifica nada: la carrera ES la sesión.
//     Y si es de las que se afinan (A o B, lib/competicion-prioridad), la
//     víspera tampoco. Le cayó una tirada larga de 90′ el mismo día de su
//     carrera porque la cadena no conocía las fechas.
import { entradaDeSemana, type SemanaDelMeso } from './plan-mesociclo'
import { formaDeSemana, type EntradaSemana } from './plan-semana'
import { colocarSemana, diasPorDefecto, DIAS, type DiaDisponible, type DiaSemana } from './plan-colocacion'
import { rellenarSemana, type SemanaRellena } from './plan-relleno'
import { prioridadDe } from './competicion-prioridad'
import { sumarDias, soloDia } from './fechas'

/** Lo que no cambia de una semana a otra dentro del bloque. */
export type BaseBloque = Omit<EntradaSemana, 'horasSemana' | 'fase'>

/** Una competición del deportista, tal y como sale de la tabla. */
export interface CompeticionDelPlan {
  fecha: string
  nombre?: string | null
  prioridad?: string | null
}

export interface OpcionesSemanaBloque {
  /** Su disponibilidad real. Vacía = los días por defecto de `diasSemana`. */
  disponibilidad: DiaDisponible[]
  competiciones?: CompeticionDelPlan[]
}

/** Un día que esa semana no se planifica, y por qué. */
export interface DiaDeCompeticion {
  dia: DiaSemana
  fecha: string
  /** La competición que se lo lleva. */
  nombre: string
  motivo: string
}

export interface SemanaDelBloque extends SemanaRellena {
  /** Si compite esa semana: qué días se libran y cuántas horas quedan. */
  competicion: { sinSesion: DiaDeCompeticion[]; horasAntes: number; horas: number } | null
}

const nombreDe = (c: CompeticionDelPlan) => c.nombre?.trim() || 'la competición'

/**
 * Los días de la semana que empieza en `lunes` que no llevan sesión.
 *
 * El de la carrera, siempre. La víspera, si la carrera es A o B: B1-02 pide
 * para una B «5–7 días de reducción», y lo mínimo de eso es no llegar a la
 * salida con la tirada larga o las series del día anterior. Una C «se corre
 * como un entrenamiento más; la carga no se toca», así que su víspera se
 * entrena. Sin prioridad cuenta como B, que es el defecto de la app.
 *
 * Se mira hasta el lunes siguiente: una carrera en lunes se lleva el domingo
 * de esta semana.
 */
export function diasDeCompeticion(lunes: string | undefined, competiciones: CompeticionDelPlan[] = []): DiaDeCompeticion[] {
  if (!lunes || !competiciones.length) return []
  const el = (fecha: string) => competiciones.find(c => soloDia(c.fecha) === fecha)
  const fuera: DiaDeCompeticion[] = []
  DIAS.forEach((dia, i) => {
    const fecha = sumarDias(lunes, i)
    const hoy = el(fecha)
    if (hoy) {
      fuera.push({ dia, fecha, nombre: nombreDe(hoy), motivo: 'compite en «' + nombreDe(hoy) + '»' })
      return
    }
    const manana = el(sumarDias(fecha, 1))
    if (manana && prioridadDe(manana) !== 'C') {
      fuera.push({ dia, fecha, nombre: nombreDe(manana), motivo: 'víspera de «' + nombreDe(manana) + '» (prioridad ' + prioridadDe(manana) + ')' })
    }
  })
  return fuera
}

const fmtHoras = (h: number) => String(h).replace('.', ',')

/** En una línea, para la pantalla: «sáb 21 y dom 22 sin sesión por «X» · 8,5 → 5 h». */
export function textoCompeticion(c: SemanaDelBloque['competicion']): string {
  if (!c?.sinSesion.length) return ''
  const dias = c.sinSesion.map(d => d.dia.slice(0, 3).toLowerCase() + ' ' + Number(d.fecha.slice(8, 10))).join(' y ')
  const cuales = [...new Set(c.sinSesion.map(d => '«' + d.nombre + '»'))].join(' y ')
  return `${dias} sin sesión por ${cuales} · ${fmtHoras(c.horasAntes)} → ${fmtHoras(c.horas)} h`
}

export function semanaDelBloque(s: SemanaDelMeso, base: BaseBloque, o: OpcionesSemanaBloque): SemanaDelBloque {
  const disponibles: DiaDisponible[] | number = o.disponibilidad.length ? o.disponibilidad : base.diasSemana
  const fuera = diasDeCompeticion(s.lunes, o.competiciones)

  // De los días que tenía para entrenar, los que se lleva la competición.
  const suyos: DiaSemana[] = typeof disponibles === 'number' ? diasPorDefecto(disponibles) : disponibles.map(d => d.dia)
  const quitados = suyos.filter(d => fuera.some(f => f.dia === d))

  if (!quitados.length) {
    const forma = formaDeSemana(entradaDeSemana(s, base))
    return { ...rellenarSemana({ forma, colocada: colocarSemana(forma, disponibles), nivel: base.nivel, fase: s.fase }), competicion: null }
  }

  // LO QUE TOCABA ESOS DÍAS SE QUITA, NO SE AMONTONA EN LOS DEMÁS. Con la semana
  // entera repartida en los días que quedan, a quien entrena cinco y compite el
  // domingo le caían tres días con ocho horas y media encima justo antes de la
  // carrera. Cada día que se libra se lleva su parte, en escalones de media hora
  // como el resto del bloque.
  const quedan = suyos.length - quitados.length
  const horas = Math.round(s.horasSemana * (quedan / suyos.length) * 2) / 2
  const competicion = { sinSesion: fuera, horasAntes: s.horasSemana, horas }
  const avisos = fuera.map(f => `El ${f.dia.toLowerCase()} ${f.fecha} ${f.motivo}: no lleva sesión.`)
  if (!quedan || horas <= 0) {
    return { relleno: [], sinLlenar: [], avisos: [...avisos, 'La competición se lleva todos sus días de esa semana: no hay nada más que planificar.'], competicion }
  }
  avisos.push(`Lo que tocaba esos días no se mete en los demás: la semana pasa de ${s.horasSemana} h a ${horas} h.`)

  const forma = formaDeSemana(entradaDeSemana({ ...s, horasSemana: horas }, { ...base, diasSemana: Math.max(1, base.diasSemana - quitados.length) }))
  const r = rellenarSemana({
    forma,
    colocada: colocarSemana(forma, disponibles, { sinSesion: fuera.map(f => f.dia) }),
    nivel: base.nivel,
    fase: s.fase,
  })
  return { ...r, avisos: [...avisos, ...r.avisos], competicion }
}
