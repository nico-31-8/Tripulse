// ============================================================
// TRIPULSE — «Necesita tu atención»
// ============================================================
// El bloque del panel que le dice al entrenador qué tiene pendiente con el
// atleta que está mirando. No son avisos genéricos: cada uno sale de un dato
// concreto y desaparece solo cuando ese dato cambia.
//
// Estaba dentro de la pantalla, entre las consultas que lo alimentaban y con
// aritmética de fechas escrita a mano. Aquí es una función pura sobre lo que ya
// se ha traído: se puede probar, y sobre todo se puede leer de un vistazo qué
// hace aparecer cada aviso.
import { diasEntre, hoyISO, soloDia, fechaValida } from './fechas'

/** A partir de cuántos días sin tocar la valoración técnica se avisa. */
export const DIAS_VALORACION = 28

/** Con cuánta antelación se avisa de un bloque que arranca. */
export const DIAS_AVISO_MESO = 5

export interface DeportistaSug {
  nombre?: string | null
  tec_fecha_actualizacion?: string | null
}

export interface MesoSug {
  fecha_inicio?: string | null
  objetivo?: string | null
}

/**
 * Lo que el entrenador tiene pendiente con este atleta.
 *
 * `hoy` se puede pasar para poder probarlo: una función que lee el reloj por su
 * cuenta no se puede testear sin congelar el tiempo.
 */
export function sugerenciasDelAtleta(
  dep: DeportistaSug | null | undefined,
  mesos: MesoSug[] | null | undefined,
  anamnesisEstado: string | null | undefined,
  hoy: string = hoyISO(),
): string[] {
  const sug: string[] = []
  if (!dep) return sug

  // ---- La valoración técnica ----
  if (!fechaValida(dep.tec_fecha_actualizacion)) {
    sug.push('Registrar la valoración técnica')
  } else {
    const dias = diasEntre(soloDia(dep.tec_fecha_actualizacion as string), hoy)
    if (dias >= DIAS_VALORACION) {
      sug.push('Actualizar la valoración técnica (' + Math.floor(dias / 7) + ' semanas sin tocar)')
    }
  }

  // ---- Bloques que arrancan ----
  // Solo los que EMPIEZAN, no los que ya empezaron: revisar un mesociclo tiene
  // sentido antes de que corra, no a mitad.
  ;(mesos || []).forEach(meso => {
    if (!fechaValida(meso.fecha_inicio)) return
    const d = diasEntre(hoy, soloDia(meso.fecha_inicio as string))
    if (d >= 0 && d <= DIAS_AVISO_MESO) {
      sug.push('Revisar el mesociclo "' + (meso.objetivo || 'sin nombre') + '" (empieza '
        + (d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días') + ')')
    }
  })

  // ---- La anamnesis, cuando el atleta la ha mandado ----
  if (anamnesisEstado === 'enviada') {
    sug.push('Revisar la anamnesis que envió ' + (dep.nombre || 'tu atleta'))
  }

  return sug
}
