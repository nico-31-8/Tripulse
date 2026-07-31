// ============================================================
// Sesiones que propone el asistente
// ============================================================
// El modelo no devuelve prosa que luego parseamos: devuelve un OBJETO con esta
// forma, obligado por el esquema. Parsear texto se rompe el día que cambie una
// coma; un esquema no.
//
// La forma no es casual: `bloques` es exactamente el `BloqueP[]` que ya consume
// `aplicarBloques()` desde el flujo de "plantilla en la mano" del calendario. Así
// la propuesta entra por el MISMO camino que usa el entrenador a mano —con sus
// validaciones y su RLS— en vez de abrir una vía nueva de escritura.
//
// Regla que no se toca: la IA NUNCA escribe en la base de datos. Propone; la app
// escribe cuando el entrenador da el último clic.
import { ZONAS_RESISTENCIA, ZONAS_FUERZA, cargaZona } from './zonas'

export interface BloquePropuesto {
  zona: string
  /** Minutos del bloque. Para natación se usa `metros` en su lugar. */
  minutos?: number | null
  metros?: number | null
  series?: number | null
  descansoSeg?: number | null
  nota?: string | null
}

export interface PropuestaSesion {
  nombre: string
  disciplina: string
  bloques: BloquePropuesto[]
  /** Por qué esta sesión y no otra, en una frase. Es lo que el entrenador juzga. */
  porque: string
}

/* Esquema para structured output. Las zonas van como enum a partir del catálogo
   real: si se le deja escribir texto libre, inventa siglas que la app no conoce. */
export const ESQUEMA_PROPUESTA = {
  type: 'object',
  properties: {
    nombre: { type: 'string', description: 'Nombre corto y descriptivo, p. ej. "Series de umbral 4×400"' },
    disciplina: { type: 'string', enum: ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'] },
    porque: { type: 'string', description: 'Una frase justificando la sesión con los datos del atleta (TSB, disposición, competición, volumen).' },
    bloques: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          zona: { type: 'string', enum: [...ZONAS_RESISTENCIA.map(z => z.sigla), ...ZONAS_FUERZA.map(z => z.sigla)] },
          minutos: { type: ['number', 'null'], description: 'Minutos del bloque. Usar esto salvo en natación.' },
          metros: { type: ['number', 'null'], description: 'Metros. Solo en natación.' },
          series: { type: ['number', 'null'] },
          descansoSeg: { type: ['number', 'null'] },
          nota: { type: ['string', 'null'] },
        },
        required: ['zona'],
        additionalProperties: false,
      },
    },
  },
  required: ['nombre', 'disciplina', 'bloques', 'porque'],
  additionalProperties: false,
} as const

/** Minutos totales de la propuesta, contando series. */
export function minutosPropuesta(p: PropuestaSesion): number {
  return p.bloques.reduce((a, b) => a + (Number(b.minutos) || 0) * Math.max(1, Number(b.series) || 1), 0)
}

/** Metros totales (natación). */
export function metrosPropuesta(p: PropuestaSesion): number {
  return p.bloques.reduce((a, b) => a + (Number(b.metros) || 0) * Math.max(1, Number(b.series) || 1), 0)
}

/** RPE medio ponderado por volumen, con el mismo criterio que el resto de la app. */
export function rpePropuesta(p: PropuestaSesion): number {
  let peso = 0, suma = 0
  p.bloques.forEach(b => {
    const v = ((Number(b.minutos) || 0) || (Number(b.metros) || 0) / 50) * Math.max(1, Number(b.series) || 1)
    if (v <= 0) return
    peso += v
    suma += cargaZona(b.zona).rpe * v
  })
  return peso ? Math.min(10, Math.max(1, Math.round(suma / peso))) : 5
}

/**
 * Revisa una propuesta ANTES de enseñarla. El modelo puede devolver algo con la
 * forma correcta y el contenido absurdo; esto es la red de seguridad que evita
 * que el entrenador tenga que detectarlo a ojo.
 */
export function avisosPropuesta(p: PropuestaSesion): string[] {
  const avisos: string[] = []
  if (!p.bloques.length) avisos.push('La propuesta no tiene bloques.')

  // `cargaZona` cae a un valor por defecto con siglas que no conoce, así que no
  // sirve para detectarlas: hay que mirar los catálogos directamente.
  const desconocidas = p.bloques.filter(b => !ZONAS_RESISTENCIA.some(z => z.sigla === b.zona) && !ZONAS_FUERZA.some(z => z.sigla === b.zona))
  if (desconocidas.length) avisos.push('Zonas que la app no reconoce: ' + desconocidas.map(b => b.zona).join(', ') + '.')

  const sinVolumen = p.bloques.filter(b => !b.minutos && !b.metros)
  if (sinVolumen.length) avisos.push(`${sinVolumen.length} bloque(s) sin minutos ni metros: habrá que completarlos.`)

  const min = minutosPropuesta(p)
  if (min > 300) avisos.push(`Son ${Math.round(min / 60)} h de sesión: comprueba que es lo que querías.`)

  if (p.disciplina === 'Natacion' && !metrosPropuesta(p) && min) {
    avisos.push('Sesión de natación medida en minutos y no en metros.')
  }
  return avisos
}

/**
 * Pasa la propuesta al formato `BloqueP` que ya consume `aplicarBloques()`.
 *
 * Ojo con los nombres: `BloqueP` usa `segundos` (no minutos) y `descansoSeg`
 * (no descanso_segundos). Traducir mal aquí no rompe nada visible — la sesión se
 * crea igual, pero con los bloques sin duración.
 */
export function aBloquesPlantilla(p: PropuestaSesion) {
  return p.bloques.map(b => ({
    zona: b.zona,
    series: b.series ?? undefined,
    metros: b.metros ?? undefined,
    segundos: b.minutos ? Math.round(b.minutos * 60) : undefined,
    descansoSeg: b.descansoSeg ?? undefined,
    nota: b.nota ?? undefined,
  }))
}
