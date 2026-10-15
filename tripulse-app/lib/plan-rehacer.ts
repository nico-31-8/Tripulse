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
// NADA SE BORRA DE VERDAD. Lo ya entrenado se suelta del plan y se queda en su
// calendario —es historia del atleta, no del plan—, y lo planificado va a la
// papelera, igual que cuando se borra una sesión desde cualquier otra pantalla.
// Este era el único sitio de la app donde «borrar» significaba borrar.
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
      consecuencia: 'Las ' + e.planificadas + ' sesiones que tenías por delante van a la papelera.' + conservadas,
    }
  }

  const dias = diasEntre(String(e.creado).slice(0, 10), hoy)
  if (dias >= DIAS_ESPERA) {
    return {
      puede: true, faltan: 0,
      motivo: 'Tu plan tiene ' + dias + ' días. Puedes rehacerlo.',
      consecuencia: 'Las ' + e.planificadas + ' sesiones que tenías por delante van a la papelera.' + conservadas,
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
 * y se quedan tal cual, y las planificadas van a la papelera. Si se borrara
 * todo, el atleta perdería el registro de lo que entrenó — que es justo lo
 * único que no es del plan sino suyo.
 */
export async function borrarPlan(sb: any, idDeportista: number, idMacrociclo: number) {
  /* LAS SESIONES CUELGAN DE LOS MICROCICLOS, no de los mesociclos. Aquí se
     buscaban con los ids de los MESOciclos (`in('id_microciclo', idsMeso)`), así
     que no se encontraba ninguna: ni las realizadas para soltarlas ni las
     planificadas para la papelera. Y al borrar los microciclos, su clave ajena
     (`on delete cascade`) se llevaba TODAS las sesiones del plan, también las ya
     entrenadas, y sin pasar por la papelera: justo lo que este fichero promete
     que no pasa. Ahora los microciclos vienen dentro de cada mesociclo. */
  const { data: mesos } = await sb.from('mesociclo').select('id, microciclo(id)').eq('id_macrociclo', idMacrociclo)
  const ids = (mesos || []).flatMap((m: any) => (m.microciclo || []).map((x: any) => x.id))

  const s = await soltarSesiones(sb, idDeportista, ids)
  if (s.error) return s

  /* El plan, con UNA orden: sus mesociclos y sus semanas cuelgan de él con ON
     DELETE CASCADE y se van con él (eran tres borrados en fila). A estas
     alturas ya no le cuelga ninguna sesión. */
  const { error } = await sb.from('macrociclo').delete().eq('id', idMacrociclo)
  return { ...s, error: error?.message || null }
}

/** Lo que se dice al terminar: qué ha pasado con sus sesiones. */
export function resumenDelBorrado(r: { sueltas: number; borradas: number }): string {
  const partes: string[] = []
  if (r.sueltas) {
    partes.push(r.sueltas === 1
      ? '1 sesión hecha sigue en el calendario, fuera del plan'
      : r.sueltas + ' sesiones hechas siguen en el calendario, fuera del plan')
  }
  if (r.borradas) {
    partes.push(r.borradas === 1
      ? '1 planificada está en la papelera'
      : r.borradas + ' planificadas están en la papelera')
  }
  return 'Borrado.' + (partes.length ? ' ' + partes.join('; ') + '.' : '')
}

/**
 * Lo mismo con UN mesociclo: el que se borra en el lienzo de periodización.
 * Sus sesiones hechas se quedan en el calendario y las planificadas van a la
 * papelera, igual que al borrar el plan entero.
 */
export async function borrarMesociclo(sb: any, idDeportista: number, idMesociclo: number) {
  const { data: micros } = await sb.from('microciclo').select('id').eq('id_mesociclo', idMesociclo)
  const s = await soltarSesiones(sb, idDeportista, (micros || []).map((m: any) => m.id))
  if (s.error) return s
  const { error } = await sb.from('mesociclo').delete().eq('id', idMesociclo)
  return { ...s, error: error?.message || null }
}

/**
 * Saca las sesiones de unas semanas del plan ANTES de borrarlas.
 *
 * Y NO SOLO POR CUIDAR LO ENTRENADO: es que borrar una sesión de fuerza hecha
 * ni siquiera se puede. Sus series apuntadas cuelgan del ejercicio, sin
 * cascada, así que la base para el borrado entero —comprobado el 15-10-2026
 * con el plan de Dani Diaz: «violates foreign key constraint
 * series_realizadas_id_ejercicio_fkey»—. El lienzo y la vista de bloques
 * borraban así, a ciegas, y fallaban sin decirlo: el plan desaparecía de la
 * pantalla y volvía al recargar. Soltándolas antes, la cascada ya no llega a
 * ninguna sesión.
 */
async function soltarSesiones(sb: any, idDeportista: number, ids: number[]) {
  let sueltas = 0, borradas = 0
  let idsPapelera: number[] = []
  if (ids.length) {
    /* Las realizadas se salvan y el resto va a la papelera, y las dos cosas
       se hacen ANTES de borrar nada: la clave ajena del microciclo se llevaría
       por delante a cualquiera que siguiera colgando de él.

       Las dos a la vez y cada una en UNA escritura que devuelve lo que tocó
       (eran cuatro esperas: pedir las hechas, soltarlas, pedir el resto,
       marcarlo). Se puede porque no se pisan: una es «Realizada» y la otra
       todo lo que no lo es —incluidas las que no tienen estado, que con un
       `neq` a secas se quedarían colgando y se irían con la cascada—. */
    const [hechas, restantes] = await Promise.all([
      sb.from('sesion')
        .update({ id_microciclo: null, id_deportista: idDeportista })
        .in('id_microciclo', ids).eq('estado', 'Realizada')
        .select('id'),
      /* Las planificadas van a la PAPELERA, no al vacío.
         Antes esto era un `delete` de verdad: irreversible, y encima el único
         sitio de la app donde borrar una sesión no significaba `eliminada =
         true`. En todas las demás pantallas «borrar» es recuperable, así que
         aquí también. Se despegan del microciclo además de marcarse, porque el
         microciclo se borra justo después y la clave ajena se las llevaría. */
      sb.from('sesion')
        .update({ eliminada: true, id_microciclo: null, id_deportista: idDeportista })
        .in('id_microciclo', ids).or('estado.is.null,estado.neq.Realizada')
        .select('id'),
    ])
    if (hechas.error || restantes.error) {
      /* Si alguna no se ha podido despegar, NO se borra el plan: la cascada se
         la llevaría, y una sesión entrenada no vuelve. */
      return { sueltas: 0, borradas: 0, idsPapelera: [] as number[], error: (hechas.error || restantes.error).message as string }
    }
    sueltas = hechas.data?.length || 0
    borradas = restantes.data?.length || 0
    idsPapelera = (restantes.data || []).map((x: any) => Number(x.id))
  }
  return { sueltas, borradas, idsPapelera, error: null as string | null }
}

/** El estado del plan actual: lo que necesita `puedeRehacer`. */
export async function estadoDelPlan(sb: any, idDeportista: number): Promise<EstadoPlan> {
  /* UNA consulta: el plan con sus mesociclos, sus microciclos y el estado de
     sus sesiones dentro. Eran tres en fila y, además, la de las sesiones las
     buscaba con los ids de los MESOciclos como si fueran de microciclos: no
     encontraba ninguna, y un plan con semanas generadas parecía un borrador que
     se podía rehacer gratis (ver borrarPlan, que tenía el mismo fallo). Las de
     la papelera no cuentan: ya no cuelgan del plan. */
  const { data: macros } = await sb.from('macrociclo').select('*, mesociclo(id, microciclo(id, sesion(estado, eliminada)))')
    .eq('id_deportista', idDeportista).order('fecha_inicio', { ascending: false }).limit(1)
  const macro = (macros || [])[0]
  if (!macro) return { idMacrociclo: null, planificadas: 0, realizadas: 0, creado: null }

  let planificadas = 0, realizadas = 0
  for (const me of macro.mesociclo || []) {
    for (const mi of me.microciclo || []) {
      for (const s of mi.sesion || []) {
        if (s.eliminada) continue
        if (s.estado === 'Realizada') realizadas++; else planificadas++
      }
    }
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
