// Recomendación de recuperación post-sesión, calculada en vivo (no se guarda).
// Se muestra al deportista en el resumen de la sesión completada.
// Cruza dos ejes: cuánto vació la sesión (RPE real + duración + ayuno) y qué viene
// después (otra sesión hoy / competición cerca). Basado en el marco 4R —
// ver ia/deporte/wiki/topics/nutricion-post-entrenamiento.md.

export interface ContextoRecuperacion {
  duracionMin: number
  rpeReal: number | null       // rpe_reportado (1-10); null si no se registró
  disciplina: string
  ayuno: boolean               // se hizo en ayunas
  pesoKg: number | null
  otraSesionHoy: boolean       // queda otra sesión planificada hoy
  diasHastaComp: number | null // días hasta la próxima competición; null = ninguna cercana
}

export interface RecomendacionRecuperacion {
  nivel: 'minima' | 'estandar' | 'alta'
  carboG: number | null        // g aproximados de carbohidrato a reponer ya
  proteinaG: number | null     // g aproximados de proteína
  titulo: string               // encabezado corto
  mensaje: string              // mensaje principal en lenguaje normal
  ejemplos: string             // ejemplos de comida
  hidratacion: string          // nota de hidratación ('' si no aplica)
  extra: string[]              // avisos adicionales (ayuno, competición, doble sesión)
}

// g/kg de carbohidrato a reponer en la ventana inmediata, por nivel de desgaste.
const CARBO_GKG = { minima: 0, estandar: 1.0, alta: 1.2 }
const PROTEINA_GKG = 0.3

export function recomendarRecuperacion(ctx: ContextoRecuperacion): RecomendacionRecuperacion {
  const { duracionMin, rpeReal, ayuno, pesoKg, otraSesionHoy, diasHastaComp } = ctx

  // --- Eje 1: cuánto vació la sesión ---
  let nivel: 'minima' | 'estandar' | 'alta'
  const dura = (rpeReal != null && rpeReal >= 7) || duracionMin > 150 || ayuno
  const suave = (rpeReal != null ? rpeReal <= 4 : duracionMin < 60) && duracionMin < 75
  if (dura) nivel = 'alta'
  else if (suave) nivel = 'minima'
  else nivel = 'estandar'

  // Si queda otra sesión hoy, aunque haya sido suave hay que reponer de verdad.
  if (otraSesionHoy && nivel === 'minima') nivel = 'estandar'

  // --- Macros aproximados ---
  let gkg = CARBO_GKG[nivel]
  if (otraSesionHoy) gkg = Math.max(gkg, 1.2)   // doble sesión → reposición prioritaria
  const carboG = nivel === 'minima' || !pesoKg ? null : Math.round(pesoKg * gkg)
  const proteinaG = nivel === 'minima' || !pesoKg ? null : Math.min(25, Math.max(20, Math.round(pesoKg * PROTEINA_GKG)))

  // --- Eje 2: urgencia según lo que viene después ---
  const extra: string[] = []
  let titulo = ''
  let mensaje = ''

  if (nivel === 'minima') {
    titulo = 'Recuperación ligera'
    mensaje = 'Sesión suave: con tu comida habitual es suficiente, no necesitas nada especial. Hidrátate con normalidad.'
  } else if (otraSesionHoy) {
    titulo = 'Reposición prioritaria — tienes otra sesión hoy'
    mensaje = pesoKg
      ? `Repón ya (en los próximos 45 min) ~${carboG} g de carbohidrato y ~${proteinaG} g de proteína, y mantén el carbohidrato en las horas hasta la siguiente sesión. La ventana importa: llegar bien repuesto marca la diferencia en la segunda sesión.`
      : 'Repón cuanto antes carbohidrato + proteína (en los próximos 45 min) y mantenlo hasta la siguiente sesión. La ventana importa: llegar repuesto marca la diferencia en la segunda sesión.'
  } else {
    titulo = 'Recuperación'
    mensaje = pesoKg
      ? `En los próximos 45 min toma ~${carboG} g de carbohidrato y ~${proteinaG} g de proteína para reponer glucógeno y reparar el músculo.`
      : 'En los próximos 45 min toma una comida con carbohidrato y proteína para reponer glucógeno y reparar el músculo.'
  }

  // Ejemplos de comida (para nivel estándar/alta)
  const ejemplos = nivel === 'minima' ? '' :
    'Ej.: arroz o pasta con pollo/pescado, un batido de leche con fruta y avena, o yogur griego con miel y plátano.'

  // Hidratación (solo si la sesión fue de verdad)
  const hidratacion = nivel === 'minima' ? '' :
    'Rehidrátate con ~1,5 L por cada kg de peso perdido durante la sesión; añade algo de sal o bebida con electrolitos si sudaste mucho.'

  // Avisos adicionales
  if (ayuno) extra.push('Hiciste esta sesión en ayunas: no alargues el ayuno, come en cuanto termines.')
  if (diasHastaComp != null && diasHastaComp <= 2) {
    extra.push(`Competición en ${diasHastaComp === 0 ? 'menos de un día' : diasHastaComp + ' día' + (diasHastaComp > 1 ? 's' : '')}: prioriza comidas ricas en carbohidrato y bajas en fibra para llenar los depósitos de glucógeno.`)
  } else if (diasHastaComp != null && diasHastaComp <= 7) {
    extra.push('Estás en semana de competición: prioriza recuperar bien, dormir y no dejar déficit de energía.')
  }

  return { nivel, carboG, proteinaG, titulo, mensaje, ejemplos, hidratacion, extra }
}
