// ============================================================
// TRIPULSE — El alta del atleta que llega solo
// ============================================================
// /anamnesis son siete secciones y ochenta campos. Está bien para quien la
// rellena porque su entrenador se la ha pedido: es una historia clínica y su
// valor está en ser exhaustiva.
//
// Pero el atleta que se descarga la app y quiere un plan no viene de un
// entrenador, y esas siete secciones son un muro. Sin pasarlas, `/mi-plan` no
// tiene ni horas, ni días, ni nivel — y ahí es donde empieza a inventarse un
// atleta medio que no es nadie.
//
// ESTE FICHERO SON LAS PREGUNTAS MÍNIMAS. Son las que el planificador de verdad
// lee, ni una más, más el filtro de salud que no se puede saltar. Todo se guarda
// en las MISMAS columnas de `anamnesis`: no hay tabla nueva ni campos paralelos,
// así que quien luego rellene la larga se encuentra esto ya puesto y el
// entrenador lo ve donde siempre.
//
// LO QUE NO SE TOCA: `estado`. Se queda en 'borrador'. Marcarla como 'enviada'
// le diría al entrenador —y al panel de /admin, que cuenta por ese campo— que
// tiene delante la anamnesis completa cuando solo hay seis respuestas.

/* ------------------------------------------------------------------
   EL FILTRO DE SALUD

   Es un PAR-Q recortado a las cuatro banderas rojas que de verdad
   contraindican empezar a entrenar por tu cuenta. Un cuestionario largo aquí
   no se rellena: se pulsa «no» a todo para pasar de pantalla, que es peor que
   no preguntar.

   Cada pregunta escribe en una columna que YA existe en `anamnesis`, la misma
   que rellena el formulario largo. Si el atleta luego hace la anamnesis
   completa, se encuentra estas cuatro ya contestadas.
   ------------------------------------------------------------------ */
export interface PreguntaSalud {
  /** La columna de `anamnesis` donde se guarda. */
  campo: 'salud_cardiaca' | 'salud_razon_medica' | 'salud_medicacion' | 'lesiones_dolor_cronico'
  pregunta: string
  /** Qué implica que la respuesta sea «sí». Se le enseña al atleta. */
  siEsSi: string
}

export const PARQ: PreguntaSalud[] = [
  {
    campo: 'salud_cardiaca',
    pregunta: '¿Te han diagnosticado algo del corazón, o has notado dolor en el pecho al hacer esfuerzo?',
    siEsSi: 'Antes de entrenar fuerte necesitas el visto bueno de un médico.',
  },
  {
    campo: 'salud_razon_medica',
    pregunta: '¿Algún médico te ha dicho alguna vez que no hagas ejercicio, o que solo lo hagas bajo supervisión?',
    siEsSi: 'Eso pesa más que cualquier plan que yo pueda escribirte.',
  },
  {
    campo: 'salud_medicacion',
    pregunta: '¿Tomas medicación para la tensión o para el corazón?',
    siEsSi: 'Algunos fármacos cambian tu pulso, y las zonas por frecuencia cardíaca dejan de valer.',
  },
  {
    campo: 'lesiones_dolor_cronico',
    pregunta: '¿Tienes ahora mismo alguna lesión o algún dolor que empeore al moverte?',
    siEsSi: 'Entrenar encima de eso lo alarga. Primero que lo vea alguien.',
  },
]

export type RespuestasSalud = Partial<Record<PreguntaSalud['campo'], boolean>>

export interface VeredictoSalud {
  /** Todas contestadas: sin esto no se puede continuar. */
  completo: boolean
  /** Las que han salido «sí». */
  banderas: PreguntaSalud[]
  /**
   * Si hay banderas, no se bloquea el alta pero se le pide una segunda
   * confirmación explícita. Bloquear del todo mandaría a la gente a mentir en
   * la pregunta, y entonces no nos habríamos enterado de nada.
   */
  necesitaConfirmar: boolean
}

export function veredictoSalud(r: RespuestasSalud): VeredictoSalud {
  const contestadas = PARQ.filter(p => typeof r[p.campo] === 'boolean')
  const banderas = PARQ.filter(p => r[p.campo] === true)
  return {
    completo: contestadas.length === PARQ.length,
    banderas,
    necesitaConfirmar: banderas.length > 0,
  }
}

/* ------------------------------------------------------------------
   EL PAYLOAD
   ------------------------------------------------------------------ */
export interface EstadoAlta {
  salud: RespuestasSalud
  declaracion: boolean
  nivel: string
  anios: string
  dias: string
  volumen: string
  fuerte: string
  debil: string
}

export const ALTA_VACIA: EstadoAlta = {
  salud: {}, declaracion: false, nivel: '', anios: '', dias: '', volumen: '', fuerte: '', debil: '',
}

/**
 * Lo que se escribe en `anamnesis`.
 *
 * SOLO SUS PROPIOS CAMPOS. Es importante: esta pantalla puede correr sobre una
 * anamnesis larga ya rellena, y un payload con todas las columnas a null
 * borraría el historial médico entero de alguien por pasar por aquí. Por eso la
 * lista es corta y explícita, y hay un test que la fija.
 *
 * Y por eso tampoco lleva `estado`: la fila se queda como estuviera.
 */
export function payloadAlta(e: EstadoAlta): Record<string, unknown> {
  return {
    salud_cardiaca: e.salud.salud_cardiaca ?? null,
    salud_razon_medica: e.salud.salud_razon_medica ?? null,
    salud_medicacion: e.salud.salud_medicacion ?? null,
    lesiones_dolor_cronico: e.salud.lesiones_dolor_cronico ?? null,
    declaracion_responsabilidad: e.declaracion,
    nivel_competitivo: e.nivel || null,
    anios_triatlon: e.anios || null,
    dias_semana: e.dias || null,
    volumen_semanal: e.volumen || null,
    disciplina_fuerte: e.fuerte || null,
    disciplina_debil: e.debil || null,
    updated_at: new Date().toISOString(),
  }
}

/** Los pasos, para la barra de progreso y para saber cuándo se puede avanzar. */
export const PASOS = ['Salud', 'Tu nivel', 'Tu semana', 'Tus disciplinas'] as const

/**
 * ¿Se puede pasar del paso `n`?
 *
 * El de salud es el único que no se puede dejar a medias: es un permiso, no un
 * dato. Los demás piden lo que el planificador necesita para no inventarse
 * nada; los años y la disciplina fuerte son opcionales porque no cambian el
 * plan, solo lo explican.
 */
export function puedeAvanzar(n: number, e: EstadoAlta): boolean {
  const v = veredictoSalud(e.salud)
  switch (n) {
    case 0: return v.completo && e.declaracion
    case 1: return !!e.nivel
    case 2: return !!e.dias && !!e.volumen
    case 3: return true
    default: return false
  }
}
