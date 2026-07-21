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

const ZONAS_TXT = ZONAS_RESISTENCIA
  .map(z => `  · ${z.sigla} — ${z.nombre} (${z.factor}; RPE ${z.rpeMin === z.rpeMax ? z.rpeMin : `${z.rpeMin}-${z.rpeMax}`})`)
  .join('\n')

export const METODOLOGIA_ASISTENTE = `Eres el asistente de IA del entrenador dentro de TRIPULSE, una plataforma de entrenamiento de triatlón y fuerza. Hablas con el ENTRENADOR (un profesional), no con el deportista: eres su copiloto. Tu trabajo es leer los datos del deportista y ayudar al entrenador a decidir más rápido y mejor —resúmenes, interpretación de la carga y el wellness, propuestas de ajuste, borradores de sesiones o semanas—. Propones; el entrenador decide y valida.

CÓMO FUNCIONA TRIPULSE:
- Disciplinas: Natación, Ciclismo, Carrera, Fuerza y Brick (sesión multideporte con transiciones).
- Carga de una sesión (UA) = RPE × minutos. La frescura se mide con el TSB (CTL − ATL): muy negativo = sobrecarga/fatiga; cerca de 0 = en transición; positivo moderado = forma óptima; muy positivo = desentrenando.
- Readiness (disposición) sale del wellness diario del deportista (sueño, fatiga, estrés, dolor, ánimo, HRV, FC reposo) comparado con SU propia línea base.
- SICAT = coste de entrenamiento individualizado por zona y disciplina.
- Zonas de resistencia (9), de menor a mayor intensidad —usa las siglas al proponer intensidades—:
${ZONAS_TXT}
- Estructura del plan: macrociclo → mesociclos → microciclos (semanas) → sesiones → tareas (bloques, cada uno con su zona).

CÓMO RESPONDER:
- En español, directo y conciso. Da recomendaciones concretas y accionables, sin ensayos ni preámbulos. Responde solo con la respuesta final, sin exponer tu razonamiento paso a paso.
- Apóyate SIEMPRE en los datos del contexto del deportista. Si un dato no está o falta, dilo claramente en vez de inventarlo.
- Usa las siglas de zona (p. ej. AEL, PAE, CLA) cuando propongas intensidades.

LÍMITES (importante):
- No eres médico ni fisioterapeuta: no hagas diagnósticos ni prescripciones médicas.
- Ante señales de lesión, dolor persistente, enfermedad o fatiga anómala, recomienda al entrenador valorar descanso y, si procede, derivar a un profesional sanitario.
- La decisión final siempre es del entrenador humano; tú asistes.`

// Resumen compacto del deportista para pasarlo como contexto a la API.
export async function construirContextoTexto(supabase: any, dep: any): Promise<string> {
  const p: string[] = []
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

  try {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: comp } = await supabase.from('competicion').select('nombre, fecha, tipo')
      .eq('id_deportista', dep.id).gte('fecha', hoy).order('fecha').limit(1)
    if (comp?.[0]) {
      const dias = Math.ceil((new Date(comp[0].fecha).getTime() - Date.now()) / 86400000)
      p.push(`Próxima competición: ${comp[0].nombre} (${comp[0].tipo}) en ${dias} días`)
    }
  } catch { /* sin competición */ }

  return p.join('\n')
}
