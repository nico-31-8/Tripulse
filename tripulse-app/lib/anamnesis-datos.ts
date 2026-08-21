// ============================================================
// TRIPULSE — Traducir la anamnesis a números que el plan entienda
// ============================================================
// LA ANAMNESIS GUARDA TEXTO. El atleta elige «8–12h» y «5–6 días» de un
// desplegable, y eso es lo que hay en la fila: cadenas, no números.
//
// El planificador necesita números. Durante un tiempo hizo esto:
//
//     Number(anamnesis.volumen_semanal) || 8      →  Number('8–12h') es NaN  →  8
//     Number(anamnesis.dias_semana)     || 5      →  Number('5–6 días') es NaN →  5
//
// O sea: TODOS los atletas entrenaban 8 horas en 5 días, dijeran lo que dijeran,
// y encima sin aviso — el cartel de «no tienes la anamnesis rellena» no salta
// porque la anamnesis SÍ está, solo que no se leía. Nada petaba; el número
// mentía. Este fichero existe para que la traducción viva en un solo sitio.
//
// POR QUÉ CADA RANGO SE RESUELVE COMO SE RESUELVE
//   · HORAS → el punto medio. Es un presupuesto, y la capa de adaptación lo
//     corrige en los dos sentidos: si no llega, baja sola; si va sobrado, lo
//     propone. Equivocarse por poco arriba o por poco abajo cuesta lo mismo.
//   · DÍAS → el extremo BAJO. No es un presupuesto, es la semana del atleta.
//     «3–4 días» significa «tres seguro, cuatro si puedo»: colocar cuatro
//     sesiones a quien solo tiene tres garantizadas produce una sesión que no
//     se puede hacer, y una sesión imposible se salta, y saltarse sesiones
//     dispara el recorte de volumen. El error se realimenta.

import type { NivelAtleta } from './plan-semana'

/* ------------------------------------------------------------------
   LAS OPCIONES, EN UN SOLO SITIO

   Las rellenan dos pantallas —/alta (corta) y /anamnesis (completa)— y las lee
   este fichero. Si cada una tuviera su propia lista, bastaría con que alguien
   escribiera «5-8 h» en una para que el atleta guardara un texto que la otra no
   entiende y el plan volviera a tirar del valor por defecto en silencio. Es
   exactamente el fallo que este fichero viene a cerrar, así que las listas
   viven aquí y los tests las recorren enteras.
   ------------------------------------------------------------------ */
export const OPCIONES_VOLUMEN = ['Menos de 5h', '5–8h', '8–12h', 'Más de 12h'] as const
export const OPCIONES_DIAS = ['1–2 días', '3–4 días', '5–6 días', 'Todos los días'] as const
export const OPCIONES_NIVEL = ['Popular / Recreativo', 'Amateur competitivo', 'Élite'] as const
export const OPCIONES_DISCIPLINA = ['Natación', 'Ciclismo', 'Carrera'] as const
export const OPCIONES_ANIOS = ['Es mi primer año', '1–2 años', '3–5 años', 'Más de 5 años'] as const

/** Un número que ya venía siendo número se respeta tal cual. */
function yaEsNumero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

/**
 * Todos los números que aparecen en el texto, en orden.
 *
 * Sirve tanto para «5–8h» (guion largo, el que pone el desplegable) como para
 * «5-8h» (guion normal, el que sale si alguien lo escribe a mano) porque no
 * mira el separador: se queda con las cifras.
 */
function cifras(txt: string): number[] {
  return (txt.match(/\d+(?:[.,]\d+)?/g) || []).map(n => Number(n.replace(',', '.')))
}

/**
 * Horas semanales que el atleta declara manejar.
 *
 * Devuelve null si no hay nada que leer, para que quien llama decida su propio
 * valor por defecto y pueda avisar de que está usando uno.
 */
export function horasDeAnamnesis(v: unknown): number | null {
  const n = yaEsNumero(v)
  if (n !== null) return n
  if (typeof v !== 'string') return null
  const t = v.toLowerCase()
  const c = cifras(t)
  if (!c.length) return null

  // «Menos de 5h» y «Más de 12h» son abiertos por un lado: no hay medio que
  // calcular, así que se cede un escalón hacia dentro del rango.
  if (t.includes('menos')) return Math.max(1, c[0] - 1)
  if (t.includes('más') || t.includes('mas ') || t.startsWith('mas')) return c[0] + 1
  if (c.length >= 2) return (c[0] + c[1]) / 2
  return c[0]
}

/**
 * Días de entrenamiento por semana.
 *
 * Extremo bajo del rango, a propósito (ver cabecera). «Todos los días» no trae
 * cifras, así que se resuelve por texto.
 */
export function diasDeAnamnesis(v: unknown): number | null {
  const n = yaEsNumero(v)
  if (n !== null) return Math.round(n)
  if (typeof v !== 'string') return null
  const t = v.toLowerCase()
  if (t.includes('todos')) return 7
  const c = cifras(t)
  if (!c.length) return null
  return Math.round(c[0])
}

/** El nivel que declara la anamnesis, traducido al del planificador. */
export function nivelDeAnamnesis(txt: unknown): NivelAtleta {
  const t = String(txt ?? '').toLowerCase()
  if (t.includes('elite') || t.includes('élite') || t.includes('profesional')) return 'elite'
  if (t.includes('avanzad')) return 'avanzado'
  if (t.includes('inicia') || t.includes('principi') || t.includes('popular')) return 'principiante'
  return 'intermedio'
}

/**
 * ¿Tiene esta anamnesis lo mínimo para dibujar un plan?
 *
 * No se mira `estado`. El alta corta rellena cuatro campos y deja la fila en
 * 'borrador' a propósito: marcarla como 'enviada' le diría al entrenador que
 * tiene delante la anamnesis clínica completa cuando solo hay cuatro respuestas.
 * Así que «está lista» se deduce de los datos, que es lo que de verdad importa,
 * y no de una etiqueta que significaría otra cosa.
 */
export function altaCompleta(an: any): boolean {
  if (!an) return false
  return horasDeAnamnesis(an.volumen_semanal) !== null
    && diasDeAnamnesis(an.dias_semana) !== null
    && !!an.nivel_competitivo
    && an.declaracion_responsabilidad === true
}
