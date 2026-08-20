// ============================================================
// TRIPULSE — El entrenador de IA que habla con el DEPORTISTA
// ============================================================
// El asistente de `lib/asistente.ts` habla con el entrenador: le da datos y le
// aconseja, dando por hecho que quien lee sabe lo que es un TSB. Este habla con
// el atleta, y eso cambia dos cosas de raíz:
//
//   1. EL IDIOMA. «Tu ACWR está en 1,42» no significa nada para quien entrena.
//      «Has subido la carga muy rápido esta semana» sí.
//   2. EL RIESGO. Un entrenador filtra lo que le dice el asistente; el atleta
//      no tiene a nadie detrás. Así que aquí no se improvisa doctrina: lo que
//      diga tiene que caber dentro de las reglas con las que ya se le generó el
//      plan, y donde no llegue, decirlo.
import { ZONAS_RESISTENCIA } from './zonas'
import { escalaTSBTexto } from './panel-metricas'

/** Las zonas en el idioma del atleta: qué se siente, no qué porcentaje es. */
const ZONAS_EN_CRISTIANO = ZONAS_RESISTENCIA.map(z =>
  `${z.sigla} (${z.nombre}): RPE ${z.rpeMin}-${z.rpeMax}, esfuerzos de ${z.duracion}`).join('\n')

export const METODOLOGIA_ENTRENADOR_IA = `Eres el entrenador de TRIPULSE. Hablas DIRECTAMENTE con el deportista, no con su entrenador — no tiene ninguno, tú eres el suyo.

CÓMO HABLAS
- Tuteas, en español, con frases cortas. Como un entrenador en el borde de la piscina, no como un informe.
- NUNCA sueltas siglas de métricas sin traducir. Nada de "tu ACWR es 1,42" ni "TSB -18": eso se dice "has subido la carga muy rápido" o "vienes cargado de la semana pasada". Si necesitas dar un número, que sea uno que él pueda usar: minutos, ritmo, repeticiones, sensación del 1 al 10.
- Las zonas SÍ se nombran (AER, AEL, AEM...), porque son las que ve en su plan, pero siempre con lo que se siente al lado: "AEL, ritmo de conversación".
- No adornas. Si la respuesta es "descansa", es "descansa".

QUÉ PUEDES HACER
- Explicarle qué le toca hoy y por qué.
- Explicarle una sesión, una zona, un ejercicio, para qué sirve una semana de descarga.
- Decirle qué hacer si se salta un día, si llega tarde o si se encuentra mal.
- Ajustar una sesión concreta a la baja: menos series, menos tiempo, cambiarla por suave.

QUÉ NO HACES, NUNCA
- No le subes la carga por tu cuenta. Si crees que va sobrado, se lo dices y le explicas cómo pedirlo, pero el plan no se endurece en un chat.
- No cambias su periodización entera desde aquí. Si lo que pide es replanificar (cambia de objetivo, se lesiona, se va tres semanas), le dices que eso se hace desde su plan y qué botón tocar.
- No diagnosticas. Dolor que no cede, dolor agudo, dolor que cambia cómo pisa o dolor en el pecho: eso es un médico o un fisio, y lo dices sin rodeos y sin dramatizar.
- No te inventas datos suyos. Si no está en el contexto que te doy, dices que no lo ves.

LAS DOS ASIMETRÍAS QUE MANDAN
- Ante la duda, MENOS. Equivocarse bajando cuesta una sesión; equivocarse subiendo cuesta una lesión.
- Una semana de descarga NO es una semana perdida. Es donde ocurre la mejora. Si te dice que se encuentra bien y quiere apretar en la descarga, tu trabajo es explicarle por qué no.

SUS ZONAS
${ZONAS_EN_CRISTIANO}

CÓMO LEER SU CARGA (para ti, no para repetírselo con estas palabras)
${escalaTSBTexto()}

SI TE PREGUNTA ALGO QUE NO SABES
Dilo. "Eso no lo veo desde aquí" es una respuesta buena. Inventarse un dato de su entrenamiento es la peor cosa que puedes hacer, porque él no tiene forma de comprobarlo.`

/**
 * El contexto del atleta en su propio idioma.
 *
 * Deliberadamente MÁS CORTO que el del entrenador: aquí no hacen falta las 14
 * últimas sesiones en crudo ni los índices. Hace falta lo que le permite
 * contestar «¿qué hago hoy?» y «¿por qué?».
 */
export function contextoParaAtleta(datos: {
  nombre?: string | null
  hoy: string
  bloque?: { nombre: string; tipo: string; semanaN: number; semanas: number; esDescarga: boolean } | null
  competicion?: { nombre: string; fecha: string; semanas: number } | null
  sesionesHoy?: { disciplina: string; zona?: string | null; minutos?: number | null }[]
  proximas?: { fecha: string; disciplina: string; zona?: string | null }[]
  ultimas?: { fecha: string; disciplina: string; minutos?: number | null; rpe?: number | null; hecha: boolean }[]
  horasSemana?: number | null
  diasSemana?: number | null
}): string {
  const l: string[] = []
  l.push(`Hoy es ${datos.hoy}.`)
  if (datos.nombre) l.push(`Hablas con ${datos.nombre}.`)
  if (datos.horasSemana) l.push(`Dice que puede entrenar ${datos.horasSemana} h a la semana en ${datos.diasSemana || '?'} días.`)

  if (datos.bloque) {
    const b = datos.bloque
    l.push(`Está en el bloque «${b.nombre}» (${b.tipo}), semana ${b.semanaN} de ${b.semanas}.` +
      (b.esDescarga ? ' ESTA SEMANA ES DE DESCARGA: volumen bajo a propósito.' : ''))
  } else {
    l.push('No tiene plan montado ahora mismo.')
  }

  if (datos.competicion) {
    l.push(`Su competición: ${datos.competicion.nombre}, el ${datos.competicion.fecha}. Quedan ${datos.competicion.semanas} semanas.`)
  }

  if (datos.sesionesHoy?.length) {
    l.push('HOY le toca: ' + datos.sesionesHoy
      .map(s => `${s.disciplina}${s.zona ? ' en ' + s.zona : ''}${s.minutos ? ' (' + s.minutos + ' min)' : ''}`)
      .join(' · '))
  } else {
    l.push('Hoy no tiene nada programado.')
  }

  if (datos.proximas?.length) {
    l.push('Lo que viene: ' + datos.proximas
      .map(s => `${s.fecha} ${s.disciplina}${s.zona ? ' ' + s.zona : ''}`).join(' · '))
  }

  if (datos.ultimas?.length) {
    const hechas = datos.ultimas.filter(s => s.hecha).length
    l.push(`De sus últimas ${datos.ultimas.length} sesiones ha hecho ${hechas}.`)
    l.push('Detalle: ' + datos.ultimas
      .map(s => `${s.fecha} ${s.disciplina}${s.minutos ? ' ' + s.minutos + 'min' : ''}${s.rpe ? ' RPE' + s.rpe : ''}${s.hecha ? '' : ' (sin hacer)'}`)
      .join(' · '))
  }

  return l.join('\n')
}

/** Arranques del chat, para que no se quede mirando un hueco vacío. */
export const SUGERENCIAS_ATLETA = [
  '¿Qué me toca hoy y por qué?',
  'Esta semana la veo muy fácil',
  'No he podido entrenar dos días, ¿qué hago?',
  '¿Para qué sirve la semana suave?',
]
