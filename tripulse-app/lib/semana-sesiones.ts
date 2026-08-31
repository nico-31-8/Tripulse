// ============================================================
// TRIPULSE — La semana alrededor de una sesión
// ============================================================
// Cuando montas las tareas de un miércoles, lo que necesitas saber no está en
// ese miércoles: está en el martes que ya llevó series y en el sábado que trae
// tres horas. El editor de sesión enseñaba la sesión sola, así que ese contexto
// había que ir a buscarlo al calendario y volver.
//
// LA SEMANA SE CALCULA POR FECHA, DE LUNES A DOMINGO, y no por el microciclo al
// que cuelga la sesión. Es a propósito y tiene una consecuencia concreta: así
// aparecen también las sesiones que el atleta se añade por su cuenta — y son
// justo las que no esperas y las que más conviene ver antes de mandarle nada.
//
// QUIÉN AÑADIÓ UNA SESIÓN LO DICE `origen`, NO `id_microciclo`. Aquí se miró
// primero el microciclo, y estaba mal: una sesión que se añade el atleta puede
// acabar colgada de un microciclo y sigue siendo suya. El resto de la app
// (mis-sesiones, la vista de mesociclo y la de semana) ya usaba `origen`, así
// que había dos definiciones de lo mismo — que es como empiezan a divergir.
//
// El microciclo sí se usa, pero solo para PONERLE NOMBRE a la semana («Semana 2
// de 4 · Carga»). Si no hay ninguno que la cubra, la semana existe igual y se
// nombra por sus fechas.
import {
  sumarDias, diasEntre, soloDia, lunesDe, rangoLegible,
  DIAS_SEMANA, LETRAS_SEMANA,
} from './fechas'

/* Los nombres de los días y el cálculo del lunes vivían aquí. Se han ido a
   lib/fechas con el resto de primitivas: eran la cuarta implementación de
   «¿en qué lunes cae esta fecha?» que había en el proyecto. Se re-exportan
   porque el panel de la semana los importa de aquí. */
export const LETRAS_DIA = LETRAS_SEMANA
export const NOMBRES_DIA = DIAS_SEMANA
export { lunesDe, rangoLegible }

export interface SesionSemana {
  id: number
  fecha_sesion: string
  disciplina: string | null
  estado: string | null
  /** Sin microciclo = suelta, fuera del plan. NO es lo mismo que «suya». */
  id_microciclo: number | null
  /** 'deportista' = se la añadió él. Es lo que mira toda la app. */
  origen?: string | null
  duracion_minutos?: number | null
  tareas?: any[]
}

export interface DiaSemana {
  /** 'L'…'D' */
  letra: string
  nombre: string
  fecha: string
  /** Día del mes, para la etiqueta. */
  num: number
  sesiones: SesionSemana[]
}

/** Los siete días, en orden, con sus sesiones. Los vacíos van igual. */
export function diasDeLaSemana(lunes: string, sesiones: SesionSemana[]): DiaSemana[] {
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i)
    return {
      letra: LETRAS_DIA[i],
      nombre: NOMBRES_DIA[i],
      fecha,
      num: Number(fecha.slice(8, 10)),
      sesiones: sesiones
        .filter(s => soloDia(s.fecha_sesion) === fecha)
        // Dentro de un día, primero lo hecho: es lo que ya no se puede cambiar.
        .sort((a, b) => (a.estado === 'Realizada' ? 0 : 1) - (b.estado === 'Realizada' ? 0 : 1) || a.id - b.id),
    }
  })
}

export interface ResumenSemana {
  sesiones: number
  realizadas: number
  /** Días sin ninguna sesión. */
  descanso: number
  /** Las que se añadió el atleta (`origen = 'deportista'`). */
  delAtleta: number
}

/** ¿Se la añadió el atleta? Mismo criterio que el resto de la app. */
export function esDelAtleta(s: { origen?: string | null }): boolean {
  return s.origen === 'deportista'
}

export function resumenDeSemana(dias: DiaSemana[]): ResumenSemana {
  let sesiones = 0, realizadas = 0, descanso = 0, delAtleta = 0
  dias.forEach(d => {
    if (!d.sesiones.length) descanso++
    d.sesiones.forEach(s => {
      sesiones++
      if (s.estado === 'Realizada') realizadas++
      if (esDelAtleta(s)) delAtleta++
    })
  })
  return { sesiones, realizadas, descanso, delAtleta }
}

export interface MicroParaEtiqueta {
  id: number
  fecha_inicio: string
  tipo: string | null
  id_mesociclo: number | null
}

export interface EtiquetaSemana {
  /** «Semana 2 de 4» o el rango de fechas si no hay microciclo. */
  titulo: string
  /** «Carga», «Recuperación»… o vacío. */
  tipo: string
  /** El microciclo que cubre esta semana, si lo hay. */
  micro: MicroParaEtiqueta | null
}

/**
 * Cómo se llama esta semana.
 *
 * El número sale de la POSICIÓN del microciclo dentro de su mesociclo: ni
 * mesociclo ni microciclo tienen columna de número, igual que en la cabecera de
 * la ficha de sesión.
 */
export function etiquetaDeSemana(lunes: string, micros: MicroParaEtiqueta[]): EtiquetaSemana {
  const rango = rangoLegible(lunes)
  // El microciclo que cubre este lunes: empieza el mismo día o antes, y no hace
  // más de 6 días que empezó.
  const micro = micros.find(m => {
    const ini = soloDia(m.fecha_inicio)
    const d = diasEntre(ini, lunes)
    return d >= 0 && d <= 6
  }) || null

  if (!micro) return { titulo: rango, tipo: '', micro: null }

  const hermanos = micros
    .filter(m => m.id_mesociclo === micro.id_mesociclo)
    .sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)))
  const n = hermanos.findIndex(m => m.id === micro.id) + 1

  return {
    titulo: n > 0 ? 'Semana ' + n + ' de ' + hermanos.length + ' · ' + rango : rango,
    tipo: micro.tipo || '',
    micro,
  }
}

/**
 * ¿Cabe esta tarea en la sesión que se está editando?
 *
 * NO ES UN CAPRICHO NI UNA VALIDACIÓN DE UNIDADES. La tabla de tareas pinta la
 * de fuerza O la de resistencia según la disciplina de la sesión, y son dos
 * formularios con columnas distintas. Un ejercicio de fuerza copiado a una
 * sesión de carrera no es que quede raro: no tiene ninguna fila donde ir, y se
 * perdería en silencio al guardar.
 *
 * Que se VEA sigue siendo útil («¿qué le puse ayer de piernas?»); lo que no se
 * ofrece es copiarla.
 */
export function tareaEsDeFuerza(t: any): boolean {
  return !!(t?.ejercicios?.length)
}

export function puedeCopiarse(t: any, sesionEsDeFuerza: boolean): boolean {
  return tareaEsDeFuerza(t) === sesionEsDeFuerza
}

/** Las disciplinas que tienen tabla de fuerza. */
export function esDisciplinaDeFuerza(disciplina: string | null | undefined): boolean {
  return disciplina === 'Fuerza'
}

/**
 * La sesión anterior y la siguiente dentro de la semana.
 *
 * Sirve para las flechas del desplegable: estás mirando la del martes y quieres
 * la del miércoles sin cerrar, volver a la cuadrícula y buscarla con el ratón.
 *
 * EL ORDEN ES EL QUE SE VE, no el de los ids ni el de las fechas a pelo: se
 * recorren los días de lunes a domingo y, dentro de cada uno, las sesiones tal
 * como las dejó `diasDeLaSemana` —que pone delante las realizadas—. Si las
 * flechas siguieran otro orden que el de la pantalla, pulsar «siguiente» te
 * llevaría a una tarjeta que está detrás, y eso se siente como un fallo aunque
 * el criterio sea defendible.
 *
 * La semana es el marco de este panel: en los extremos devuelve null y las
 * flechas se apagan. Para cambiar de semana ya están sus propios botones.
 */
export function vecinasDe(
  dias: DiaSemana[],
  id: number | null | undefined,
): { anterior: SesionSemana | null; siguiente: SesionSemana | null } {
  const enOrden = dias.flatMap(d => d.sesiones)
  const i = enOrden.findIndex(s => s.id === id)
  if (i < 0) return { anterior: null, siguiente: null }
  return {
    anterior: enOrden[i - 1] ?? null,
    siguiente: enOrden[i + 1] ?? null,
  }
}

/** «Mié 2 · Carrera», para decir a dónde lleva una flecha antes de pulsarla. */
export function comoSeLlama(dias: DiaSemana[], s: SesionSemana | null): string {
  if (!s) return ''
  const d = dias.find(x => x.sesiones.some(y => y.id === s.id))
  const donde = d ? d.letra + ' ' + d.num : ''
  return [donde, s.disciplina || 'Sesión'].filter(Boolean).join(' · ')
}
