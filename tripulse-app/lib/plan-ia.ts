// ============================================================
// TRIPULSE — La capa de IA del planificador
// ============================================================
// Los tres escalones de antes generan una semana entera sin tocar un modelo. Este
// la coge YA HECHA y deja que la IA la mejore con lo que una regla no sabe: que
// el atleta lleva dos semanas durmiendo mal, que su punto flojo es la natación,
// que quedan cuatro semanas para la prueba y toca especificidad.
//
// LA IA NO DEVUELVE UN PLAN, DEVUELVE CAMBIOS
// «Cambia la sesión 4 por esta otra, porque…». Es una lista corta y verificable
// en vez de una semana entera que habría que revisar de arriba abajo. Si no
// propone nada, la semana determinista ya era correcta — que es el caso normal.
//
// LA REGLA DE SEGURIDAD: SOLO PUEDE BAJAR
// Un cambio puede llevar una sesión a una zona MÁS SUAVE, nunca a una más dura
// que la que decidieron las reglas. Es asimétrico a propósito. Bajar es la
// decisión que un entrenador toma cuando el atleta llega tocado, y equivocarse
// bajando cuesta una sesión; equivocarse subiendo cuesta una lesión. El
// presupuesto de zonas, el duro-fácil y los mínimos ya los fijó el código y no
// están en discusión.
//
// Y TODO SE VALIDA. La clave tiene que existir en el catálogo, ser de la misma
// disciplina y no duplicar otra sesión de la semana. Lo que no pasa el filtro se
// descarta con su motivo y se queda lo que decidieron las reglas: el peor caso de
// esta capa es que no cambie nada.
import { resolverClave, plantillasDe, opcionesDe } from './plantillas'
import { cargaZona } from './zonas'
import type { SemanaRellena, Relleno } from './plan-relleno'

export interface CambioPropuesto {
  /** Índice de la sesión dentro del relleno, tal y como se le enseñó al modelo. */
  i: number
  clave: string
  porque: string
}

export interface RevisionIA {
  cambios: CambioPropuesto[]
  /** Una frase para el entrenador sobre la semana en conjunto. Opcional. */
  nota?: string
}

export interface CambioAplicado { i: number; antes: string; despues: string; porque: string }
export interface CambioRechazado { i: number; clave: string; motivo: string }

/* Esquema de la herramienta. Las claves NO van como enum: son 73 y crecen, y
   meterlas en el esquema hincharía el prompt en cada llamada. Se validan al
   volver, que es donde de todas formas hay que validarlas. */
export const ESQUEMA_REVISION = {
  type: 'object',
  properties: {
    cambios: {
      type: 'array',
      description: 'Solo las sesiones que cambiarías. Vacío si la semana ya está bien, que es lo normal.',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer', description: 'El número de la sesión, tal y como aparece en la lista.' },
          clave: { type: 'string', description: 'Clave del catálogo, exactamente como aparece en las opciones de esa sesión.' },
          porque: { type: 'string', description: 'Una frase con el dato concreto del atleta que lo justifica. Nada de generalidades.' },
        },
        required: ['i', 'clave', 'porque'],
        additionalProperties: false,
      },
    },
    nota: { type: 'string', description: 'Una frase sobre la semana en conjunto, si hay algo que decir.' },
  },
  required: ['cambios'],
  additionalProperties: false,
} as const

export const INSTRUCCIONES_REVISION = `Eres el copiloto de un entrenador de triatlón dentro de TRIPULSE. Te paso una semana de entrenamiento YA GENERADA por las reglas de la app, y el contexto del deportista.

Tu trabajo NO es rehacer la semana. El reparto de volumen, los días, cuántas sesiones de calidad hay y en qué zona va cada una ya están decididos por las reglas y no se discuten: salen de tablas con fuente y respetan el duro-fácil, los mínimos por disciplina y el presupuesto de zonas.

Lo que sí puedes hacer es CAMBIAR LA SESIÓN CONCRETA de un hueco por otra del catálogo, cuando el contexto del atleta lo pida. Ejemplos de cuándo tiene sentido:
- Su disposición viene mal o arrastra fatiga → llevar una sesión a una variante más suave.
- Su punto flojo es una disciplina → elegir la variante técnica en vez de la estándar.
- Quedan pocas semanas para la prueba → elegir la variante de ritmo de competición.
- Ha repetido mucho una estructura → elegir otra de la misma zona.
- No tiene el material que la sesión pide (potenciómetro, piscina larga, rodillo) → elegir una que no lo necesite.

REGLAS QUE NO PUEDES SALTARTE:
1. Solo puedes elegir de las opciones que te doy en cada sesión. Nada inventado.
2. Puedes bajar de intensidad, NUNCA subir por encima de la zona que ya tiene esa sesión. Si crees que hace falta más carga, dilo en la nota y que lo decida el entrenador.
3. No cambies dos sesiones a la misma cosa: la variedad importa.
4. Si la semana está bien, devuelve la lista de cambios VACÍA. Es la respuesta más frecuente y es una buena respuesta.

En cada justificación, cita el dato del atleta que la sostiene. «Va con fatiga» no vale; «lleva la disposición en Fatiga y el TSB en −28» sí.`

/** El nivel de carga de una zona, 1 (suave) a 7 (máxima). */
const nivelDe = (sigla: string) => cargaZona(sigla).nivel

/**
 * Aplica lo que propuso el modelo, descartando lo que no pase el filtro.
 *
 * Es puro y no sabe nada de red: se le da la semana y la respuesta ya parseada.
 * Así se puede probar entero el comportamiento ante una respuesta absurda, que es
 * lo único que de verdad hay que probar de esta capa.
 */
export function aplicarRevision(
  semana: SemanaRellena,
  revision: RevisionIA | null | undefined,
): { semana: SemanaRellena; aplicados: CambioAplicado[]; rechazados: CambioRechazado[] } {
  const aplicados: CambioAplicado[] = []
  const rechazados: CambioRechazado[] = []
  const relleno: Relleno[] = semana.relleno.map(r => ({ ...r }))
  const yaTocados = new Set<number>()

  for (const c of revision?.cambios || []) {
    const rechazar = (motivo: string) => rechazados.push({ i: c?.i, clave: c?.clave, motivo })

    const original = relleno[c?.i]
    if (!original) { rechazar('Esa sesión no existe en la semana.'); continue }
    if (yaTocados.has(c.i)) { rechazar('Ya había propuesto un cambio para esta sesión.'); continue }
    if (!original.clave) { rechazar('Las sesiones de fuerza las fija la fase del macrociclo, no se cambian aquí.'); continue }
    if (c.clave === original.clave) { rechazar('Es la misma sesión que ya tenía.'); continue }

    const destino = resolverClave(c.clave)
    if (!destino) { rechazar(`«${c.clave}» no existe en el catálogo.`); continue }
    if (destino.plantilla.disciplina !== original.hueco.bloque) {
      rechazar(`Es de ${destino.plantilla.disciplina} y la sesión es de ${original.hueco.bloque}.`); continue
    }

    // La regla asimétrica: bajar sí, subir no. Equivocarse bajando cuesta una
    // sesión; equivocarse subiendo cuesta una lesión.
    if (nivelDe(destino.plantilla.zona) > nivelDe(original.zona)) {
      rechazar(`Sube de ${original.zona} a ${destino.plantilla.zona}, y la intensidad la fijan las reglas. Bajar sí, subir no.`); continue
    }

    if (relleno.some((r, k) => k !== c.i && r.clave === c.clave)) {
      rechazar('Esa sesión ya está en la semana; duplicarla quita variedad.'); continue
    }

    const nombre = destino.variante
      ? `${destino.plantilla.nombre} · ${destino.variante.nombre}`
      : destino.plantilla.nombre
    aplicados.push({ i: c.i, antes: original.nombre, despues: nombre, porque: c.porque })
    yaTocados.add(c.i)
    relleno[c.i] = {
      ...original,
      clave: c.clave,
      nombre,
      zona: destino.plantilla.zona,
      motivo: `${c.porque} (cambio del asistente sobre «${original.nombre}»)`,
    }
  }

  const avisos = [...semana.avisos]
  if (rechazados.length) {
    avisos.push(`${rechazados.length} cambio(s) del asistente descartados: ${[...new Set(rechazados.map(r => r.motivo))].join(' ')}`)
  }
  return { semana: { ...semana, relleno, avisos }, aplicados, rechazados }
}

/**
 * La semana en texto para que el modelo la lea, con las opciones de cada sesión.
 *
 * Se le dan las alternativas EN EL SITIO, no un catálogo aparte: así solo puede
 * elegir de lo que vale para ese hueco y no hay que explicarle las reglas de qué
 * encaja dónde. Y solo se listan las de intensidad igual o menor, que es lo único
 * que se le va a aceptar — pedirle que se contenga es peor que no darle la opción.
 */
export function describirSemanaParaIA(semana: SemanaRellena): string {
  return semana.relleno.map((r, i) => {
    if (!r.clave) return `${i}. ${r.dia} · ${r.nombre} (${r.minutos}′) — fuerza, no se cambia.`
    const opciones = opcionesPermitidas(semana.relleno, i)
    const marcas = [r.hueco.larga && 'larga', r.hueco.calidad && 'calidad', r.hueco.brick && 'brick'].filter(Boolean).join(', ')
    return [
      `${i}. ${r.dia} · ${r.nombre} · ${r.zona} · ${r.minutos}′${marcas ? ` (${marcas})` : ''}`,
      `   Por qué está: ${r.motivo}`,
      `   Puedes cambiarla por: ${opciones.length ? opciones.join(' | ') : '— no hay alternativa de igual o menor intensidad'}`,
    ].join('\n')
  }).join('\n')
}

/**
 * Las claves que se le aceptarían a esta sesión.
 *
 * Necesita la semana ENTERA, no solo el hueco: si se ofrece una sesión que ya
 * está en otro día, `aplicarRevision` la rechaza después por duplicada. Ofrecer
 * algo y luego rechazarlo hace que el modelo parezca tonto cuando la culpa es del
 * prompt — la lista que se le enseña tiene que ser exactamente la que se le
 * acepta, y hay un test que lo comprueba opción por opción.
 */
export function opcionesPermitidas(relleno: Relleno[], i: number): string[] {
  const r = relleno[i]
  if (!r?.clave) return []
  const tope = nivelDe(r.zona)
  const yaEnLaSemana = new Set(relleno.filter((_, k) => k !== i).map(x => x.clave).filter(Boolean))
  return plantillasDe(r.hueco.bloque)
    .filter(p => nivelDe(p.zona) <= tope)
    .flatMap(p => opcionesDe(p).map(o => o.clave))
    .filter(k => k !== r.clave && !yaEnLaSemana.has(k))
}
