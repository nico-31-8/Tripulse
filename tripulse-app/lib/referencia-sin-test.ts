// ============================================================
// TRIPULSE — Qué velocidad suponer cuando el atleta no tiene test
// ============================================================
//
// EL PROBLEMA. Para convertir «5 × 1000 m en Z2» en minutos hace falta saber a
// qué velocidad corre esa persona, y eso sale de su VAM. Sin test no hay VAM, y
// hasta ahora la tarea valía CERO: se caía de la cuenta sin decir nada. Una
// semana entera de carrera podía dibujarse como una barra vacía, indistinguible
// de una semana de descanso.
//
// Cero no es «no lo sé». Cero es una afirmación, y era falsa.
//
// LO QUE SE HACE EN SU LUGAR. Suponer una velocidad de referencia —la media de
// la población, por sexo— y MARCAR el resultado como aproximado. Una barra
// aproximada y etiquetada sirve para ver la forma del bloque; una barra
// silenciosamente corta hace tomar decisiones malas.
//
// POR QUÉ EL NIVEL «MEDIO» Y NO «PRINCIPIANTE». Coger el nivel más bajo
// parecería lo prudente, pero sesgaría TODAS las estimaciones hacia abajo, que
// es el mismo fallo que estamos arreglando solo que más suave. El medio de la
// distribución es el menos equivocado cuando no se sabe nada.
//
// ESTO NUNCA DEBE SUSTITUIR A UN TEST. El número que sale es de la población,
// no de la persona: puede irse un 30 % en cualquier dirección. Sirve para que
// la gráfica tenga forma mientras no haya test, y para que la pantalla pueda
// decir «hazle un test y esto dejará de ser una suposición».
//
// FUENTE: las mismas tablas de referencia de la batería (`tests-campo`), §1 y
// §3 del documento.

import { REF_VAM, REF_CSS, type Sexo } from './tests-campo'

/** El nivel del que se toma la referencia. Ver la nota de arriba. */
export const NIVEL_REFERENCIA = 'medio' as const

/**
 * El punto medio de la banda de un nivel, para no coger su suelo.
 *
 * La banda «medio» de VAM en hombres va de 13 a 16: usar 13 sería usar el peor
 * de los medios. Se coge 14,5.
 */
function medioDeBandaVAM(sexo: 'Hombre' | 'Mujer'): number {
  const tabla = REF_VAM[sexo]
  const i = tabla.findIndex(r => r.nivel === NIVEL_REFERENCIA)
  const suelo = tabla[i].desde
  /* El techo es el suelo del nivel de encima, que en la tabla va justo antes
     porque está ordenada de mejor a peor. */
  const techo = i > 0 ? tabla[i - 1].desde : suelo + 3
  return Math.round(((suelo + techo) / 2) * 10) / 10
}

function medioDeBandaCSS(sexo: 'Hombre' | 'Mujer'): number {
  const tabla = REF_CSS[sexo]
  const i = tabla.findIndex(r => r.nivel === NIVEL_REFERENCIA)
  const techo = tabla[i].hasta
  const suelo = i > 0 ? tabla[i - 1].hasta : techo - 15
  return Math.round((suelo + techo) / 2)
}

/**
 * VAM de referencia en km/h.
 *
 * Con el sexo sin declarar —«Prefiero no decirlo» es una opción real del
 * formulario— se coge el punto medio entre las dos. No se elige una por
 * defecto: suponerle a alguien un sexo para calcularle los ritmos sería una
 * decisión de la app que nadie ha pedido.
 */
export function vamDeReferencia(sexo: Sexo): number {
  if (sexo === 'Hombre') return medioDeBandaVAM('Hombre')
  if (sexo === 'Mujer') return medioDeBandaVAM('Mujer')
  return Math.round(((medioDeBandaVAM('Hombre') + medioDeBandaVAM('Mujer')) / 2) * 10) / 10
}

/** Ritmo de referencia en segundos por 100 m. */
export function ritmoCSSDeReferencia(sexo: Sexo): number {
  if (sexo === 'Hombre') return medioDeBandaCSS('Hombre')
  if (sexo === 'Mujer') return medioDeBandaCSS('Mujer')
  return Math.round((medioDeBandaCSS('Hombre') + medioDeBandaCSS('Mujer')) / 2)
}

/**
 * CSS de referencia en METROS POR SEGUNDO, que es como lo guarda la app.
 *
 * OJO CON LA UNIDAD. La tabla del documento va en segundos por 100 m —números
 * del orden de 110— y `test2_natacion.css` guarda m/s —del orden de 1,2—.
 * Confundirlas daría un nadador a 110 m/s y una estimación de duración
 * absurdamente corta, sin que nada fallara.
 */
export function cssDeReferencia(sexo: Sexo): number {
  const seg = ritmoCSSDeReferencia(sexo)
  return Math.round((100 / seg) * 1000) / 1000
}

/** La frase que se le enseña al entrenador cuando se ha usado la referencia. */
export function porQueAproximado(disciplina: 'Carrera' | 'Natacion'): string {
  const que = disciplina === 'Carrera' ? 'la VAM' : 'el CSS'
  return 'Estimado con un ritmo de referencia porque falta ' + que + '. ' +
    'Hazle el test y dejará de ser una suposición.'
}
