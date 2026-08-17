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
import { cargarMetricasPanel, fmtMin, escalaTSBTexto, escalaACWRTexto, type MetricasPanel } from './panel-metricas'
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
- TSB (frescura, CTL − ATL): ${escalaTSBTexto()}.
- ACWR (aguda/crónica): ${escalaACWRTexto()}.
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

EL ATLETA MANDA SOBRE LA TEORÍA:
- Lo que propongas tiene que ser POSIBLE para este atleta con lo que tiene. Si el contexto dice que NO tiene potenciómetro, no prescribas vatios: usa RPE o pulso. Sin pulsómetro, RPE y sensaciones. Si no puedes prescribir una intensidad de forma medible con su material, dilo.
- Respeta sus días y horas disponibles. Una semana de seis sesiones para quien declara cuatro días no es un plan, es un plan que no va a hacer.
- Ajusta el volumen a lo que ya maneja. Saltar de golpe por encima de su volumen semanal habitual es la forma más rápida de lesionarlo.
- Su nivel y sus años de práctica cambian la respuesta: lo que es una progresión sensata en alguien de seis años es una barbaridad en su primera temporada.
- Prioriza su disciplina débil cuando el momento de la temporada lo permita, sin descuidar la fuerte.
- Si la anamnesis está SIN RELLENAR, dilo antes de proponer nada serio: estarías planificando a ciegas. Propón igualmente, pero avisa de qué te falta y de qué asumiste.

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

  // ---- QUIÉN ES ESTE ATLETA (de la anamnesis) ----
  // El asistente sabía cuánto entrena y cómo está, pero no QUIÉN ES: ni qué
  // prepara, ni cuántos días puede, ni si tiene con qué. Podía proponer una serie
  // por vatios a alguien sin potenciómetro, o natación a quien no pisa una
  // piscina — y el entrenador tenía que cazarlo al leerlo.
  // La anamnesis ya recogía todo esto; simplemente no llegaba hasta aquí.
  try {
    const { data: an } = await supabase.from('anamnesis')
      .select('estado, anios_triatlon, nivel_competitivo, distancias_completadas, ' +
              'disciplina_fuerte, disciplina_debil, deporte_anterior, volumen_semanal, dias_semana, ' +
              'tiene_potenciometro, usa_pulsometro, mide_hrv, horas_sueno, nivel_estres, ' +
              'prueba_objetivo, prueba_fecha, prueba_distancia, objetivo_principal, mensaje_entrenador')
      .eq('id_deportista', dep.id).maybeSingle()

    // «Enviada» no significa «completa»: la parte de salud y la de entrenamiento
    // se rellenan por separado, y hay atletas con la anamnesis enviada y toda la
    // parte de entrenamiento en blanco. Si solo se mirara el estado, el asistente
    // se quedaría sin el dato Y sin el aviso de que falta — silencio, que es el
    // peor de los dos mundos.
    const utiles = an ? [an.anios_triatlon, an.nivel_competitivo, an.dias_semana, an.volumen_semanal,
      an.prueba_objetivo, an.objetivo_principal, an.disciplina_debil,
      an.tiene_potenciometro, an.usa_pulsometro].filter(v => v != null && v !== '').length : 0

    if (an && an.estado === 'enviada' && utiles > 0) {
      const perfil: string[] = []
      if (an.anios_triatlon != null) perfil.push(`${an.anios_triatlon} años en triatlón`)
      if (an.nivel_competitivo) perfil.push(`nivel ${an.nivel_competitivo}`)
      if (an.distancias_completadas) perfil.push(`ha hecho ${an.distancias_completadas}`)
      if (an.deporte_anterior) perfil.push(`viene de ${an.deporte_anterior}`)
      if (an.disciplina_fuerte) perfil.push(`fuerte en ${an.disciplina_fuerte}`)
      if (an.disciplina_debil) perfil.push(`flojo en ${an.disciplina_debil}`)
      if (perfil.length) p.push('Perfil del atleta: ' + perfil.join(', '))

      const capacidad: string[] = []
      if (an.dias_semana != null) capacidad.push(`${an.dias_semana} días/semana`)
      if (an.volumen_semanal != null) capacidad.push(`${an.volumen_semanal} h/semana habituales`)
      if (an.horas_sueno != null) capacidad.push(`duerme ${an.horas_sueno} h`)
      if (an.nivel_estres != null) capacidad.push(`estrés vital ${an.nivel_estres}`)
      if (capacidad.length) p.push('Con lo que cuenta: ' + capacidad.join(', '))

      // El material se dice SIEMPRE, también lo que NO tiene: es una restricción
      // dura sobre lo que se le puede mandar, no un dato de color.
      const tiene: string[] = [], noTiene: string[] = []
      ;([['potenciómetro', an.tiene_potenciometro], ['pulsómetro', an.usa_pulsometro], ['medición de HRV', an.mide_hrv]] as [string, any][])
        .forEach(([n, v]) => { if (v === true) tiene.push(n); else if (v === false) noTiene.push(n) })
      if (tiene.length || noTiene.length) {
        p.push('Material: ' + [tiene.length ? 'tiene ' + tiene.join(', ') : null,
                              noTiene.length ? 'NO tiene ' + noTiene.join(', ') : null].filter(Boolean).join('; '))
      }

      const meta: string[] = []
      if (an.prueba_objetivo) meta.push(an.prueba_objetivo + (an.prueba_distancia ? ` (${an.prueba_distancia})` : ''))
      if (an.prueba_fecha) meta.push(`el ${an.prueba_fecha}`)
      if (an.objetivo_principal) meta.push(`objetivo: ${an.objetivo_principal}`)
      if (meta.length) p.push('Lo que prepara: ' + meta.join(' '))
      if (an.mensaje_entrenador) p.push(`Lo que le dijo a su entrenador: «${an.mensaje_entrenador}»`)
    } else {
      // Decirlo en voz alta importa: sin esto el asistente se inventaría el
      // contexto en vez de avisar de que no lo tiene.
      p.push(an
        ? 'Anamnesis: enviada, pero SIN la parte de entrenamiento. No se conoce su objetivo, su nivel, sus días disponibles ni su material.'
        : 'Anamnesis: SIN RELLENAR. No se conoce su objetivo, su nivel, sus días disponibles ni su material.')
    }
  } catch { /* sin anamnesis */ }

  return p.join('\n')
}
