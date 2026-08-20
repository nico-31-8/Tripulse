// ============================================================
// TRIPULSE — Rehacer el plan: cuándo se puede y qué cuesta
// ============================================================
// Si el plan que te ha salido no te convence, tienes que poder tirarlo. Lo que
// no puede es salir gratis siempre: un atleta que rehace su temporada cada dos
// días no entrena nunca, solo planifica.
//
// LA REGLA NO ES UN TEMPORIZADOR A SECAS, y esa es la decisión de diseño:
//
//   · SIN semanas generadas → gratis, las veces que haga falta. Es un borrador.
//     Nadie ha entrenado nada todavía y equivocarse en la fecha o la distancia
//     al crearlo es lo más normal del mundo. Bloquear esto 24 h castiga justo
//     el caso legítimo.
//   · CON semanas generadas → una cada 7 días. Aquí sí hay algo que se tira:
//     sesiones planificadas, y sobre todo la coherencia de lo que llevaba.
//
// Y LO YA ENTRENADO NO SE BORRA NUNCA. Se suelta del plan y se queda en su
// calendario: es historia del atleta, no del plan.
import { diasEntre } from './desplazar'

/** Días entre rehacer y rehacer, cuando ya hay semanas puestas. */
export const DIAS_ESPERA = 7

export interface EstadoPlan {
  idMacrociclo: number | null
  /** Sesiones colgando del plan que aún no se han entrenado. */
  planificadas: number
  /** Sesiones ya realizadas. Estas nunca se tocan. */
  realizadas: number
  /** Cuándo se creó, si la tabla lo guarda. */
  creado: string | null
}

export interface Veredicto {
  puede: boolean
  /** Días que faltan para poder, si toca esperar. */
  faltan: number
  /** Por qué sí o por qué no, en la primera persona del atleta. */
  motivo: string
  /** Qué se va a perder. Vacío si no se pierde nada. */
  consecuencia: string
}

export function puedeRehacer(e: EstadoPlan, hoy: string): Veredicto {
  if (!e.idMacrociclo) {
    return { puede: true, faltan: 0, motivo: 'No tienes plan: no hay nada que rehacer.', consecuencia: '' }
  }

  const conservadas = e.realizadas > 0
    ? ' Las ' + e.realizadas + ' que ya has entrenado se quedan en tu calendario: eso no se borra.'
    : ''

  // Un plan sin estrenar es un borrador. Rehacerlo no cuesta nada porque no ha
  // costado nada.
  if (e.planificadas === 0) {
    return {
      puede: true, faltan: 0,
      motivo: 'Todavía no has generado ninguna semana, así que esto es un borrador.',
      consecuencia: conservadas.trim(),
    }
  }

  // Sin fecha de creación no se puede contar el plazo. Se deja pasar en vez de
  // bloquear: negar por no saber sería castigar al atleta por un hueco nuestro.
  if (!e.creado) {
    return {
      puede: true, faltan: 0,
      motivo: 'Vas a rehacer tu plan.',
      consecuencia: 'Se borran las ' + e.planificadas + ' sesiones que tenías por delante.' + conservadas,
    }
  }

  const dias = diasEntre(String(e.creado).slice(0, 10), hoy)
  if (dias >= DIAS_ESPERA) {
    return {
      puede: true, faltan: 0,
      motivo: 'Tu plan tiene ' + dias + ' días. Puedes rehacerlo.',
      consecuencia: 'Se borran las ' + e.planificadas + ' sesiones que tenías por delante.' + conservadas,
    }
  }

  const faltan = DIAS_ESPERA - dias
  return {
    puede: false,
    faltan,
    motivo: 'Ya has empezado este plan y lo creaste hace ' + dias +
      (dias === 1 ? ' día' : ' días') + '. Podrás rehacerlo en ' + faltan +
      (faltan === 1 ? ' día' : ' días') + '.',
    consecuencia: 'Rehacerlo cada dos días es la mejor forma de no entrenar nunca. ' +
      'Si algo concreto no te encaja, díselo a tu entrenador en el chat: una sesión suelta sí se puede cambiar hoy.',
  }
}

/**
 * Borra el plan de un atleta y devuelve qué se llevó por delante.
 *
 * Las sesiones NO se borran a ciegas: las realizadas se sueltan del microciclo
 * y se quedan, y las planificadas se van. Si se borrara todo, el atleta perdería
 * el registro de lo que entrenó — que es justo lo único que no es del plan sino
 * suyo.
 */
export async function borrarPlan(sb: any, idDeportista: number, idMacrociclo: number) {
  const { data: mesos } = await sb.from('mesociclo').select('id').eq('id_macrociclo', idMacrociclo)
  const ids = (mesos || []).map((m: any) => m.id)

  let sueltas = 0, borradas = 0
  if (ids.length) {
    // Primero se salvan las realizadas, DESPUÉS se borra el resto. Al revés, la
    // clave ajena del microciclo se las llevaría por delante.
    const { data: hechas } = await sb.from('sesion').select('id')
      .in('id_microciclo', ids).eq('estado', 'Realizada')
    if (hechas?.length) {
      await sb.from('sesion')
        .update({ id_microciclo: null, id_deportista: idDeportista })
        .in('id', hechas.map((s: any) => s.id))
      sueltas = hechas.length
    }

    const { data: restantes } = await sb.from('sesion').select('id').in('id_microciclo', ids)
    borradas = restantes?.length || 0
    if (borradas) await sb.from('sesion').delete().in('id_microciclo', ids)

    await sb.from('microciclo').delete().in('id_mesociclo', ids)
    await sb.from('mesociclo').delete().eq('id_macrociclo', idMacrociclo)
  }
  const { error } = await sb.from('macrociclo').delete().eq('id', idMacrociclo)
  return { sueltas, borradas, error: error?.message || null }
}

/** El estado del plan actual: lo que necesita `puedeRehacer`. */
export async function estadoDelPlan(sb: any, idDeportista: number): Promise<EstadoPlan> {
  const { data: macros } = await sb.from('macrociclo').select('*')
    .eq('id_deportista', idDeportista).order('fecha_inicio', { ascending: false }).limit(1)
  const macro = (macros || [])[0]
  if (!macro) return { idMacrociclo: null, planificadas: 0, realizadas: 0, creado: null }

  const { data: mesos } = await sb.from('mesociclo').select('id').eq('id_macrociclo', macro.id)
  const ids = (mesos || []).map((m: any) => m.id)

  let planificadas = 0, realizadas = 0
  if (ids.length) {
    const { data: ses } = await sb.from('sesion').select('estado').in('id_microciclo', ids)
    ;(ses || []).forEach((s: any) => { s.estado === 'Realizada' ? realizadas++ : planificadas++ })
  }

  return {
    idMacrociclo: macro.id,
    planificadas,
    realizadas,
    // `created_at` puede no existir en esta tabla: el esquema completo no está
    // en el repo. Si no está, `puedeRehacer` lo trata como «no se puede contar».
    creado: macro.created_at || macro.fecha_creacion || null,
  }
}
