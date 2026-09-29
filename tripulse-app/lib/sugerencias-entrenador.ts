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
 * Un material con su cuenta ya hecha.
 *
 * A PROPÓSITO NO SE IMPORTA `lib/material`: este fichero solo depende de
 * `lib/fechas`, y traerse el material arrastraría detrás la capa de atribución
 * entera. Quien llama ya tiene la cuenta hecha; aquí solo se decide la frase.
 */
export interface MaterialSug {
  /** Como se llama para una persona: el apodo si lo tiene. */
  nombre: string
  estado: string
  contador: number
  limite: number | null
  restante: number | null
  pasado: number
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
  /* Va detrás de `hoy` para no romper a quien ya llamaba con cuatro. */
  material: MaterialSug[] = [],
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

  /* ---- El material que toca cambiar ----
     Sale del kilometraje, asi que se va solo cuando se jubila o se reinicia el
     contador: no hay nada que marcar como leido. */
  for (const m of material) {
    if (m.estado === 'pasado') {
      sug.push('Cambiar «' + m.nombre + '»: ' + m.contador.toLocaleString('es-ES')
        + ' km, ' + m.pasado + ' por encima del límite')
    } else if (m.estado === 'aviso') {
      sug.push('«' + m.nombre + '» llega al límite: quedan ' + m.restante + ' km')
    }
  }

  // ---- La anamnesis, cuando el atleta la ha mandado ----
  if (anamnesisEstado === 'enviada') {
    sug.push('Revisar la anamnesis que envió ' + (dep.nombre || 'tu atleta'))
  }

  return sug
}
