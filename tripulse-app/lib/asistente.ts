// Asistente de IA del entrenador (fase 1: leer + aconsejar).
//
// Dos piezas:
//   · METODOLOGIA_ASISTENTE → system prompt estable (se cachea en la API). Codifica
//     cómo funciona TRIPULSE: zonas, carga/TSB, readiness, límites. Lo usa la ruta
//     del servidor (app/api/asistente/route.ts).
//   · construirContextoTexto → arma un resumen compacto del deportista reutilizando
//     la MISMA capa de datos del dashboard (cargarMetricasPanel, analizarWellness).
//     Lo llama el cliente (con su sesión Supabase → respeta RLS) y lo envía a la ruta.

import { ZONAS_RESISTENCIA } from './zonas'
import { cargarMetricasPanel, fmtMin, type MetricasPanel } from './panel-metricas'
import { analizarWellness } from './wellness-analisis'
import { attachZonaPico } from './sicat-zonas'
import { minutosCarga } from './duracion-carga'

const ZONAS_TXT = ZONAS_RESISTENCIA
  .map(z => `  · ${z.sigla} — ${z.nombre} (${z.factor}; RPE ${z.rpeMin === z.rpeMax ? z.rpeMin : `${z.rpeMin}-${z.rpeMax}`})`)
  .join('\n')

export const METODOLOGIA_ASISTENTE = `Eres el asistente de IA del entrenador dentro de TRIPULSE, una plataforma de entrenamiento de triatlón y fuerza. Hablas con el ENTRENADOR (un profesional), no con el deportista: eres su copiloto. Tu trabajo es leer los datos del deportista y ayudar al entrenador a decidir más rápido y mejor —resúmenes, interpretación de la carga y el wellness, propuestas de ajuste, borradores de sesiones o semanas—. Propones; el entrenador decide y valida.

CÓMO FUNCIONA TRIPULSE:
- Disciplinas: Natación, Ciclismo, Carrera, Fuerza y Brick (sesión multideporte con transiciones).
- Carga de una sesión (UA) = RPE × minutos. Los minutos salen de lo que duró de verdad; si no se cronometró, de lo planificado; si tampoco, de la estimación.
- SICAT = coste de entrenamiento individualizado por zona y disciplina. Sus cuatro factores (F1 técnica, F2 DOMS, F3 degradación en duro, F4 cardiovascular) van de 1 a 4: más es MÁS costoso.
- Un brick encarece el bloque que va tras la transición: bici→carrera un 15%, carrera→bici un 10%.
- Zonas de resistencia (9), de menor a mayor intensidad —usa las siglas al proponer intensidades—:
${ZONAS_TXT}
- Estructura del plan: macrociclo → mesociclos → microciclos (semanas) → sesiones → tareas (bloques, cada uno con su zona).

UMBRALES EXACTOS DE LA APP (úsalos SIEMPRE; son los que el entrenador está viendo en pantalla, así que si usas otros le estarás contradiciendo):
- TSB (frescura, CTL − ATL): < −30 Sobrecarga · −30 a −10 Carga productiva · −10 a 5 Transición · 5 a 25 Forma óptima · > 25 Desentrenamiento.
- ACWR (aguda/crónica): < 0,8 Subcarga · 0,8–1,3 Zona óptima · 1,3–1,5 Precaución · > 1,5 Peligro.
- Monotonía semanal: < 1,5 buena variación · 1,5–2,0 moderada · > 2,0 alta monotonía (reestructurar la semana).
- Bienestar (0–100, MÁS ES MEJOR): ≥ 75 Óptimo · 50–75 Aceptable · 25–50 Deteriorado · < 25 Crítico. Ojo: es lo contrario del malestar; un bienestar de 18 es MALO.
- Readiness (disposición): compara la última semana con la línea base del PROPIO atleta. Óptimo / Vigilar / Fatiga / Alerta. Es distinto del bienestar absoluto: se puede estar en bienestar bajo pero estable.
- Índice de percepción (RPE reportado ÷ carga objetiva por FC): < 0,85 Infraperceptor (aguanta más de lo que cree) · 0,85–1,15 Calibrado · > 1,15 Sobreperceptor.
- Índice de planificación: < 0,85 la sesión salió más suave de lo previsto · 0,85–1,15 según plan · > 1,15 más dura de lo previsto.
- Combinación peligrosa: infraperceptor + por encima del plan = riesgo de lesión invisible, el atleta no siente lo que está acumulando.

DISTRIBUCIÓN DE INTENSIDAD (reparto del tiempo entre banda baja / media / alta):
- Polarizado 75–80 / < 10 / 15–20 · Piramidal 75–80 / 10–20 / 5–10 · Umbral 40–55 / 35–50 / 5–15.
- No trates la banda media como un error por defecto. En medias y largas distancias (70.3, Ironman) más trabajo en umbral se asocia a MEJOR rendimiento. Solo señala una desviación si contradice el modelo que el entrenador declaró para ese mesociclo.

CÓMO ES UNA BUENA RESPUESTA:
- Los datos mandan sobre la pregunta. Si el contexto contradice lo que te piden, dilo PRIMERO y luego responde con la alternativa.
- Si ves una señal de alarma (TSB < −30, readiness en Fatiga o Alerta, ACWR fuera de 0,8–1,3, monotonía > 2, dolor persistente), la mencionas aunque no te hayan preguntado por ella.
- Ajusta la forma a lo que te piden:
  · Estado del deportista → veredicto en una línea, los 2–3 números que lo sostienen y la acción que propones. Nada más.
  · Qué entrenar → sesión o semana concreta con siglas de zona y minutos, lista para copiar al calendario. Justifícala en una línea.
  · Por qué pasa algo → 2–3 hipótesis ordenadas por la evidencia que hay en el contexto, y qué dato confirmaría cada una.
  · Decidir (¿bajo la carga?, ¿hace el test?) → recomendación clara, el umbral que la dispara y qué tendría que cambiar para que la respuesta fuera otra.
  · Duda de método → explicación breve, sin datos del deportista.
- En español, empezando por la conclusión. Sin preámbulos ni resúmenes de lo que te acaban de preguntar. Responde solo con la respuesta final, sin exponer tu razonamiento paso a paso.
- Separa lo que es DATO de lo que es TU CRITERIO. No repitas de vuelta lo que el entrenador ya tiene en pantalla.
- Usa las siglas de zona (AEL, AEM, PAE…) al proponer intensidades.

QUÉ NO VES:
- Solo recibes el resumen que viene abajo, no la base de datos entera. No tienes el detalle sesión a sesión más allá de lo que se te dé, ni el histórico completo, ni los comentarios del deportista.
- Si te preguntan por algo que no está en ese resumen, di exactamente QUÉ dato falta y EN QUÉ módulo de TRIPULSE se consulta (Carga, Volumen, Wellness, SICAT, Índices, Tests). No lo estimes ni lo deduzcas.
- No inventes fechas: usa solo la fecha de hoy que se te indica en el contexto.
- Todo número que afirmes tiene que estar en el contexto o ser un cálculo a partir de él. Si lo calculas, enseña el cálculo.

LÍMITES (importante):
- No eres médico ni fisioterapeuta: no hagas diagnósticos ni prescripciones médicas.
- Ante señales de lesión, dolor persistente, enfermedad o fatiga anómala, recomienda al entrenador valorar descanso y, si procede, derivar a un profesional sanitario.
- La decisión final siempre es del entrenador humano; tú asistes.`

// Resumen compacto del deportista para pasarlo como contexto a la API.
export async function construirContextoTexto(supabase: any, dep: any): Promise<string> {
  const p: string[] = []

  // La fecha va SIEMPRE y va primero. Sin ella el modelo la deduce de su
  // entrenamiento y falla todo lo que dependa de "esta semana" o "el martes".
  const hoy = new Date()
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  p.push(`Hoy es ${DIAS[hoy.getDay()]} ${hoy.toISOString().slice(0, 10)}.`)

  p.push(`Deportista: ${dep.nombre}${dep.fc_maxima ? ` · FCmáx ${dep.fc_maxima} ppm` : ''}`)

  let m: MetricasPanel | null = null
  try { m = await cargarMetricasPanel(supabase, dep) } catch { /* sin métricas */ }
  if (m?.carga) p.push(`Frescura (TSB): ${m.carga.tsb} → ${m.carga.label}`)
  if (m?.volumen) {
    const disc = m.volumen.porDisc.map(d => `${d.label} ${m!.volumen!.modo === 'tiempo' ? fmtMin(d.min) : d.n}`).join(', ')
    const tot = m.volumen.modo === 'tiempo' ? fmtMin(m.volumen.total) : `${m.volumen.nSesiones} sesiones`
    p.push(`Volumen de esta semana: ${tot}${disc ? ` (${disc})` : ''}`)
  }
  if (m?.indices) p.push(`Índices: percepción ${m.indices.perTexto}, ejecución vs plan ${m.indices.planTexto} (n=${m.indices.n})`)
  if (m?.agenda?.length) {
    p.push('Próximas sesiones: ' + m.agenda
      .map(a => `${a.etiqueta} ${a.disciplina}${a.zona ? ` [${a.zona}]` : ''}${a.min ? ` ~${fmtMin(a.min)}` : ''}`)
      .join('; '))
  }

  try {
    const { data: wells } = await supabase.from('wellness').select('*')
      .eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(14)
    const an = analizarWellness(wells || [])
    if (an.readiness) p.push(`Wellness / readiness: ${an.readiness.label} — ${an.readiness.recomendacion}`)
  } catch { /* sin wellness */ }

  try {
    const [tc, tn, tci] = await Promise.all([
      supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
      supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
      supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
    ])
    const t = [
      tc.data?.[0]?.vam ? `VAM ${tc.data[0].vam} km/h` : null,
      tci.data?.[0]?.ftp ? `FTP ${tci.data[0].ftp} W` : null,
      tn.data?.[0]?.css ? `CSS ${tn.data[0].css}` : null,
    ].filter(Boolean).join(', ')
    if (t) p.push(`Tests actuales: ${t}`)
  } catch { /* sin tests */ }

  // Sesiones recientes EN CRUDO. Los agregados de arriba no permiten responder a
  // "¿cómo le fue el martes?": con esto sí, y sin ellas el asistente solo puede
  // decir "no lo sé" a media conversación.
  try {
    const desde = new Date(); desde.setDate(desde.getDate() - 21)
    const { data: ses } = await supabase.from('sesion')
      .select('id, fecha_sesion, disciplina, duracion_minutos, duracion_real, rpe_estimado, rpe_reportado, estado')
      .eq('id_deportista', dep.id).eq('estado', 'Realizada')
      .gte('fecha_sesion', desde.toISOString().slice(0, 10))
      .order('fecha_sesion', { ascending: false }).limit(14)
    const conZona = await attachZonaPico(ses || [])
    if (conZona.length) {
      p.push('Sesiones realizadas (21 días, de más reciente a más antigua):')
      conZona.forEach((s: any) => {
        const min = minutosCarga(s)
        const rpe = s.rpe_reportado ?? s.rpe_estimado
        p.push(`  ${s.fecha_sesion} · ${s.disciplina}${s.zonaPico ? ` [${s.zonaPico}]` : ''}` +
          `${min ? ` · ${min} min` : ''}${rpe ? ` · RPE ${rpe}${s.rpe_reportado ? '' : ' (est.)'}` : ''}` +
          `${min && rpe ? ` · ${Math.round(min * rpe)} UA` : ''}`)
      })
    }
  } catch { /* sin sesiones recientes */ }

  try {
    const hoyIso = new Date().toISOString().slice(0, 10)
    const { data: comp } = await supabase.from('competicion').select('nombre, fecha, tipo')
      .eq('id_deportista', dep.id).gte('fecha', hoyIso).order('fecha').limit(1)
    if (comp?.[0]) {
      const dias = Math.ceil((new Date(comp[0].fecha).getTime() - Date.now()) / 86400000)
      p.push(`Próxima competición: ${comp[0].nombre} (${comp[0].tipo}) en ${dias} días`)
    }
  } catch { /* sin competición */ }

  return p.join('\n')
}
