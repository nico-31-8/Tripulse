// ============================================================
// TRIPULSE — Que el modelo monte la semana entera
// ============================================================
// La otra capa de IA (plan-ia.ts) coge la semana de las reglas y cambia alguna
// sesión. Esta le deja montarla desde cero.
//
// LO QUE LO HACE POSIBLE ES EL JUEZ, NO EL PROMPT
// Sin `plan-verificador.ts` esto sería una apuesta: el modelo devuelve una semana
// y nadie sabe si vale. Con él, el ciclo es genera → se comprueba → si falla se
// le devuelven los incumplimientos → y si sigue fallando se usa la semana
// determinista, que es válida por construcción. El peor caso es pagar una llamada
// y quedarse donde estabas.
//
// LA ZONA NO SE LE PREGUNTA, SE DEDUCE
// El modelo elige una CLAVE del catálogo («cic-aei/over-unders») y la zona sale
// de ahí. Preguntársela abriría la puerta a que dijera una zona y eligiera una
// plantilla de otra, que es un error que después habría que cazar. Lo que no se
// pregunta no se puede contestar mal.
//
// QUÉ APORTA FRENTE A LAS REGLAS
// Semanas que el motor determinista no sabe hacer: un atleta que viaja de jueves
// a domingo, uno que solo tiene piscina martes y jueves, una semana con dos
// competiciones. El motor coloca bien el caso normal y no sabe salirse de él.
import { DIAS, type DiaSemana, type DiaDisponible } from './plan-colocacion'
import { plantillasDe, opcionesDe, resolverClave, volumenPrincipal, type NivelPlantilla } from './plantillas'
import { PLANTILLAS_FUERZA, plantillaFuerzaPorId, fuerzaDeFase } from './plantillas-fuerza'
import { ETIQUETA_BLOQUE, RESISTENCIA, rangoDisciplina, LIMITES_SESIONES, type Bloque, type EntradaSemana, type FormaSemana } from './plan-semana'
import { ETIQUETA_DISTANCIA, DISTRIBUCION_POR_FASE, type Disciplina } from './distribucion-zonas'
import { nivelDePlantilla } from './plan-relleno'
import type { Relleno } from './plan-relleno'
import type { SesionAVerificar } from './plan-verificador'

export interface SesionIA {
  dia: DiaSemana
  /** Clave del catálogo: `cic-aei/over-unders` o, en fuerza, `fue-fm`. */
  clave: string
  minutos: number
  calidad?: boolean
  larga?: boolean
  brick?: boolean
}

export interface SemanaIA {
  sesiones: SesionIA[]
  /** Qué ha intentado hacer con la semana. Va a pantalla. */
  razonamiento?: string
}

export const ESQUEMA_SEMANA = {
  type: 'object',
  properties: {
    sesiones: {
      type: 'array',
      minItems: 1,
      description: 'Todas las sesiones de la semana, en cualquier orden.',
      items: {
        type: 'object',
        properties: {
          dia: { type: 'string', enum: [...DIAS] },
          clave: { type: 'string', description: 'Exactamente una de las claves del catálogo que se te ha dado.' },
          minutos: { type: 'integer', description: 'Duración total de la sesión.' },
          calidad: { type: 'boolean', description: 'Sesión de calidad (Z4–Z5): la que produce la adaptación y pide 36–48 h de margen.' },
          larga: { type: 'boolean', description: 'La sesión larga de su disciplina esta semana.' },
          brick: { type: 'boolean', description: 'Va encadenada a la bici del mismo día, sin pausa.' },
        },
        required: ['dia', 'clave', 'minutos'],
        additionalProperties: false,
      },
    },
    razonamiento: { type: 'string', description: 'En dos o tres frases: qué semana has montado y por qué, con los datos del atleta.' },
  },
  required: ['sesiones'],
  additionalProperties: false,
} as const

/**
 * El catálogo entero, agrupado, para que el modelo elija.
 *
 * Se le dan las claves EXACTAS con su nombre y su volumen orientativo. Es lo que
 * convierte «inventarse una sesión» en algo imposible en vez de algo que hay que
 * detectar después.
 */
export function catalogoParaIA(nivel: NivelPlantilla): string {
  const bloques = (RESISTENCIA as Disciplina[]).map(d => {
    const filas = plantillasDe(d).flatMap(p => opcionesDe(p).map(o => {
      const vol = volumenPrincipal(p, nivel, o.varianteId)
      return `    ${o.clave}  ·  ${o.esBase ? p.nombre : p.nombre + ' · ' + o.nombre}  (${p.zona}, ${vol})`
    }))
    return `  ${ETIQUETA_BLOQUE[d as Bloque]}:\n${filas.join('\n')}`
  })
  const fuerza = PLANTILLAS_FUERZA.map(p => `    ${p.id}  ·  ${p.nombre}  (fases: ${p.fases.join(', ')})`)
  return [...bloques, `  Fuerza:\n${fuerza.join('\n')}`].join('\n\n')
}

export const INSTRUCCIONES_GENERACION = `Eres el planificador de TRIPULSE, una plataforma de entrenamiento de triatlón. Montas UNA semana de entrenamiento para un deportista concreto.

CÓMO SE MONTA
Eliges sesiones de un catálogo cerrado. Cada una lleva su clave exacta, el día, y cuántos minutos dura. La zona sale de la clave: no la eliges aparte.

LAS REGLAS QUE NO SE NEGOCIAN — tu semana se comprueba contra ellas y si falla te la devuelvo:
1. Solo claves del catálogo que te doy. Nada inventado, ni siquiera algo parecido.
2. Duro-fácil: dos sesiones de calidad NUNCA en días de calendario seguidos. Una sesión dura necesita 36–48 h antes de que otra produzca adaptación. Y nunca dos el mismo día.
3. Mínimo 2 sesiones por disciplina que entrenes. Por debajo, esa disciplina no se sostiene.
4. El reparto de volumen entre los tres deportes tiene que caer en el rango de la prueba objetivo. Te lo doy con números.
5. El volumen total no puede pasarse más de un 20 % de lo que el atleta maneja. Saltar por encima de su volumen habitual es la forma más rápida de lesionarlo.
6. Solo los días que tiene disponibles, y sin pasarte de sus minutos si te los doy.

LO QUE SE ESPERA DE TI, Y NO DE UNA TABLA
Las reglas de arriba las sabe hacer un algoritmo. Tú estás aquí para lo que él no puede: leer el contexto del atleta y montar la semana que le toca A ÉL esta semana. Su disposición, su punto flojo, lo que se ha saltado, cuánto queda para la prueba, lo que te haya dicho a ti.

Aprovecha que puedes salirte del molde cuando el caso lo pide: doblar sesiones el mismo día, concentrar la carga en dos días si solo tiene dos, dejar un deporte casi fuera una semana concreta si hay una razón. El algoritmo no sabe hacer eso.

DETALLES QUE IMPORTAN
- Marca 'calidad' solo las de Z4–Z5 de verdad. Marcar de calidad un rodaje suave desordena el resto.
- Marca 'larga' la sesión larga de bici y la de carrera. Suelen ir en fin de semana.
- Si pones bici y carrera el mismo día, encadénalas: marca 'brick' en la carrera. Es la sesión específica del triatlón, no un accidente.
- Las sesiones de recuperación son cortas. Una rodadura de recuperación de hora y media no recupera.`

/** El encargo: a quién, para qué y con qué límites. */
export function encargoParaIA(o: {
  entrada: EntradaSemana
  forma: FormaSemana
  dias: DiaDisponible[] | number
  contexto?: string
}): string {
  const { entrada: e, forma } = o
  const rango = rangoDisciplina(e.distancia)
  const reparto = ([...RESISTENCIA, 'Fuerza'] as Bloque[])
    .map(b => `${ETIQUETA_BLOQUE[b]} ${rango[b].min}–${rango[b].max} %`).join(' · ')

  const dias = Array.isArray(o.dias)
    ? o.dias.map(d => d.minutos != null ? `${d.dia} (${d.minutos}′)` : d.dia).join(', ')
    : `${o.dias} días a la semana, elige tú cuáles`

  const fuerza = fuerzaDeFase(e.fase)[0]

  return [
    o.contexto ? `EL DEPORTISTA:\n${o.contexto}` : 'No hay datos del deportista más allá de los de abajo.',
    '',
    'EL ENCARGO:',
    `- Prueba objetivo: ${ETIQUETA_DISTANCIA[e.distancia]}`,
    `- Fase del plan: ${DISTRIBUCION_POR_FASE[e.fase].etiqueta} (distribución ${DISTRIBUCION_POR_FASE[e.fase].tid.toLowerCase()})`,
    `- Volumen: ${e.horasSemana} h (${forma.minutosTotales} min). Puedes moverte un 20 % como mucho.`,
    `- Días disponibles: ${dias}`,
    `- Reparto por deporte que exige esta prueba: ${reparto}`,
    `- Sesiones por disciplina: mínimo ${LIMITES_SESIONES.min}, y más de ${LIMITES_SESIONES.max} no aporta.`,
    fuerza ? `- En esta fase la fuerza que toca es «${fuerza.nombre}» (clave ${fuerza.id}).` : '- En esta fase no toca fuerza.',
    e.disciplinaDebil ? `- Su punto flojo es ${e.disciplinaDebil}.` : '',
    '',
    'EL CATÁLOGO (elige solo de aquí):',
    catalogoParaIA(nivelDePlantilla(e.nivel)),
  ].filter(Boolean).join('\n')
}

/**
 * Pasa lo que devuelve el modelo a algo que el verificador pueda juzgar.
 *
 * Lo que no se pueda interpretar se descarta AQUÍ y se cuenta: llegar al
 * verificador con basura haría que sus mensajes hablaran de otra cosa.
 */
export function aVerificables(s: SemanaIA | null | undefined): { sesiones: SesionAVerificar[]; descartadas: string[] } {
  const sesiones: SesionAVerificar[] = []
  const descartadas: string[] = []

  for (const x of s?.sesiones || []) {
    if (!x?.clave || !DIAS.includes(x.dia)) { descartadas.push(`Sesión sin clave o con día inválido (${x?.dia}).`); continue }
    const minutos = Math.round(Number(x.minutos) || 0)

    if (x.clave.startsWith('fue-')) {
      const p = plantillaFuerzaPorId(x.clave)
      if (!p) { descartadas.push(`«${x.clave}» no es una plantilla de fuerza.`); continue }
      sesiones.push({
        dia: x.dia, bloque: 'Fuerza', clave: '', claveFuerza: x.clave,
        zona: p.bloques[0]?.zona || '', minutos, calidad: false, larga: false, brick: false,
      })
      continue
    }

    const r = resolverClave(x.clave)
    if (!r) { descartadas.push(`«${x.clave}» no existe en el catálogo.`); continue }
    sesiones.push({
      dia: x.dia,
      bloque: r.plantilla.disciplina as Bloque,
      clave: x.clave,
      // La zona sale de la plantilla, nunca de lo que diga el modelo.
      zona: r.plantilla.zona,
      minutos,
      calidad: !!x.calidad, larga: !!x.larga, brick: !!x.brick,
    })
  }
  return { sesiones, descartadas }
}

/**
 * De la semana del modelo al formato que pinta la pantalla y vuelca el
 * calendario. Se reutiliza `Relleno` entero para que a partir de aquí dé igual
 * quién montó la semana.
 */
export function aRelleno(sesiones: SesionAVerificar[], nivel: NivelPlantilla, razonamiento?: string): Relleno[] {
  return sesiones.map(s => {
    const r = s.clave ? resolverClave(s.clave) : undefined
    const nombre = s.claveFuerza
      ? (plantillaFuerzaPorId(s.claveFuerza)?.nombre || 'Fuerza')
      : r ? (r.variante ? `${r.plantilla.nombre} · ${r.variante.nombre}` : r.plantilla.nombre) : s.clave
    return {
      dia: s.dia,
      hueco: { bloque: s.bloque, minutos: s.minutos, calidad: s.calidad, larga: s.larga, brick: s.brick },
      clave: s.clave,
      claveFuerza: s.claveFuerza,
      nombre,
      zona: s.zona,
      nivel,
      minutos: s.minutos,
      motivo: razonamiento
        ? 'Semana montada por el asistente. ' + razonamiento
        : 'Semana montada por el asistente.',
    }
  })
}

/** Lo que se le manda para que arregle lo que no pasó el examen. */
export function encargoDeArreglo(anterior: SemanaIA, parte: string, descartadas: string[]): string {
  return [
    'La semana que has montado no pasa las reglas. Esto es lo que devolviste:',
    JSON.stringify(anterior.sesiones, null, 1),
    '',
    descartadas.length ? 'Además, esto no se pudo ni interpretar:\n' + descartadas.map(d => '- ' + d).join('\n') : '',
    '',
    parte,
    '',
    'Devuelve la semana ENTERA corregida, no solo los cambios. Cambia lo mínimo necesario para arreglar los errores.',
  ].filter(Boolean).join('\n')
}
