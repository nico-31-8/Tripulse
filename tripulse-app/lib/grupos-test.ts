// ============================================================
// TRIPULSE — Un test a todo el grupo de una sentada
// ============================================================
//
// La forma de esta pantalla sale del test REAL, no de la pantalla individual:
// el equipo hace UN test, con UN protocolo, y de ahí salen N resultados. Por eso
// el protocolo va arriba una sola vez y debajo hay una fila por persona con lo
// único que cambia de una a otra.
//
// Y esa división no me la he inventado: mirando qué guarda cada tabla, la mitad
// de los campos son del protocolo (cuánto sube cada escalón, cuánto dura, qué
// distancias se nadan) y son iguales para todos porque todos hacen el mismo
// test. Solo dos por persona son de la persona.
//
// Se guarda en las MISMAS tablas que la pantalla individual y con las mismas
// fórmulas (lib/tests-formulas), así que un test metido aquí es indistinguible
// de uno metido allí: recalcula las zonas de esa persona igual.

import { vamDeMontreal, cssDeDosDistancias, ftpDeRampa } from './tests-formulas'

export type ClaveTest = 'carrera' | 'natacion' | 'ciclismo'

export interface CampoTest {
  clave: string
  etiqueta: string
  /** Lo que se enseña bajo la casilla cuando está vacía. */
  ayuda?: string
  sufijo?: string
}

export interface DefinicionTest {
  clave: ClaveTest
  nombre: string
  tabla: string
  /** El nombre del número que sale, para la cabecera de la columna. */
  resultado: string
  /** Los campos iguales para todo el grupo, y su valor por defecto. */
  protocolo: (CampoTest & { porDefecto: string })[]
  /** Los que cambian de una persona a otra. */
  porPersona: CampoTest[]
}

export const TESTS_GRUPO: Record<ClaveTest, DefinicionTest> = {
  carrera: {
    clave: 'carrera',
    nombre: 'Montreal (VAM)',
    tabla: 'test1_carrera',
    resultado: 'VAM',
    protocolo: [
      { clave: 'incrementoVel', etiqueta: 'Sube cada escalón', sufijo: 'km/h', porDefecto: '0.5' },
      { clave: 'durTotal', etiqueta: 'Dura cada escalón', sufijo: 'seg', porDefecto: '60' },
    ],
    porPersona: [
      { clave: 'velUltimo', etiqueta: 'Último escalón', sufijo: 'km/h' },
      { clave: 'tiempoAguantado', etiqueta: 'Aguantó', sufijo: 'seg' },
    ],
  },
  natacion: {
    clave: 'natacion',
    nombre: 'CSS (dos distancias)',
    tabla: 'test2_natacion',
    resultado: 'CSS',
    protocolo: [
      { clave: 'distanciaGrande', etiqueta: 'Distancia larga', sufijo: 'm', porDefecto: '400' },
      { clave: 'distanciaPequena', etiqueta: 'Distancia corta', sufijo: 'm', porDefecto: '200' },
    ],
    porPersona: [
      { clave: 'tiempoGrande', etiqueta: 'Tiempo en la larga', sufijo: 'seg' },
      { clave: 'tiempoPequeno', etiqueta: 'Tiempo en la corta', sufijo: 'seg' },
    ],
  },
  ciclismo: {
    clave: 'ciclismo',
    nombre: 'Rampa (FTP)',
    tabla: 'test3_ciclismo',
    resultado: 'FTP',
    protocolo: [
      { clave: 'incrementoPot', etiqueta: 'Sube cada escalón', sufijo: 'W', porDefecto: '20' },
      { clave: 'durEscalones', etiqueta: 'Dura cada escalón', sufijo: 'seg', porDefecto: '60' },
    ],
    porPersona: [
      { clave: 'potenciaPico', etiqueta: 'Último escalón', sufijo: 'W' },
      { clave: 'tiempoNoCompletado', etiqueta: 'Aguantó', sufijo: 'seg' },
    ],
  },
}

export type Valores = Record<string, string>

/**
 * El número que sale de juntar el protocolo con lo de una persona.
 *
 * Devuelve null mientras falte algo, que es lo normal mientras se está
 * escribiendo: la pantalla enseña una raya y no un número a medias.
 */
export function resultadoDe(clave: ClaveTest, protocolo: Valores, persona: Valores): number | null {
  const v = { ...protocolo, ...persona }
  if (clave === 'carrera') return vamDeMontreal(v as any)
  if (clave === 'natacion') return cssDeDosDistancias(v as any)
  return ftpDeRampa(v as any)
}

/** Los nombres de columna reales de cada campo, por tabla. */
const COLUMNAS: Record<ClaveTest, Record<string, string>> = {
  carrera: {
    incrementoVel: 'incremento_velocidad',
    durTotal: 'duracion_total_escalon',
    velUltimo: 'velocidad_ultimo_escalon',
    tiempoAguantado: 'tiempo_aguantado_ultimo',
  },
  natacion: {
    distanciaGrande: 'distancia_grande',
    distanciaPequena: 'distancia_pequena',
    tiempoGrande: 'tiempo_distancia_grande',
    tiempoPequeno: 'tiempo_distancia_pequena',
  },
  ciclismo: {
    incrementoPot: 'incremento_potencia',
    durEscalones: 'duracion_escalones',
    potenciaPico: 'potencia_pico',
    tiempoNoCompletado: 'tiempo_escalon_no_completado',
  },
}

/** Dónde va el número que se calcula. */
const COLUMNA_RESULTADO: Record<ClaveTest, string> = {
  carrera: 'vam', natacion: 'css', ciclismo: 'ftp',
}

export interface FilaPersona {
  id_deportista: number
  nombre: string
  valores: Valores
}

/**
 * Las filas que hay que escribir.
 *
 * SE SALTA A QUIEN NO TENGA EL TEST COMPLETO, y no es un descuido: en un grupo
 * siempre falta alguien, o alguien se retira a mitad. Guardar su fila a medias
 * dejaría un test sin resultado que luego aparece en su historial como si
 * hubiera hecho algo. Mejor que no tenga test a que tenga uno falso.
 *
 * Pura y aparte para poder probarla sin base.
 */
export function filasDeTest(
  clave: ClaveTest, fecha: string, protocolo: Valores, personas: FilaPersona[],
): { fila: any; id_deportista: number; nombre: string }[] {
  const cols = COLUMNAS[clave]
  const salida: { fila: any; id_deportista: number; nombre: string }[] = []

  for (const p of personas || []) {
    const res = resultadoDe(clave, protocolo, p.valores || {})
    if (res == null) continue

    const fila: any = { id_deportista: p.id_deportista, fecha }
    for (const [k, col] of Object.entries(cols)) {
      const v = (p.valores || {})[k] ?? protocolo[k]
      if (v !== undefined && v !== '') fila[col] = Number(v)
    }
    fila[COLUMNA_RESULTADO[clave]] = res
    salida.push({ fila, id_deportista: p.id_deportista, nombre: p.nombre })
  }
  return salida
}

export interface ResultadoGuardado {
  id_deportista: number
  nombre: string
  ok: boolean
  error?: string
}

/**
 * Guarda los tests del grupo.
 *
 * De una vez, y si el lote falla se reintenta uno a uno: con ocho personas, que
 * una falle no puede tirar las otras siete ni dejarte sin saber cuál fue. Mismo
 * criterio que en el mensaje al grupo y en la emisión de sesiones.
 */
export async function guardarTestsDelGrupo(
  sb: any,
  opciones: { clave: ClaveTest; fecha: string; protocolo: Valores; personas: FilaPersona[] },
): Promise<{ resultados: ResultadoGuardado[]; error: string | null }> {
  const { clave, fecha, protocolo, personas } = opciones
  if (!fecha) return { resultados: [], error: 'Falta la fecha del test.' }

  const listas = filasDeTest(clave, fecha, protocolo, personas)
  if (!listas.length) {
    return { resultados: [], error: 'Ningún test está completo todavía.' }
  }

  const tabla = TESTS_GRUPO[clave].tabla
  const { error } = await sb.from(tabla).insert(listas.map(l => l.fila))
  if (!error) {
    return { resultados: listas.map(l => ({ id_deportista: l.id_deportista, nombre: l.nombre, ok: true })), error: null }
  }

  const resultados: ResultadoGuardado[] = []
  for (const l of listas) {
    const { error: e } = await sb.from(tabla).insert(l.fila)
    resultados.push({ id_deportista: l.id_deportista, nombre: l.nombre, ok: !e, error: e?.message })
  }
  if (!resultados.some(r => r.ok)) {
    return { resultados, error: error.message || 'No se pudo guardar ninguno.' }
  }
  return { resultados, error: null }
}

/** «3 tests guardados» / «3 de 5 · 2 sin terminar». */
export function resumenTests(resultados: ResultadoGuardado[], totalPersonas: number): string {
  const ok = resultados.filter(r => r.ok).length
  const sinTerminar = totalPersonas - resultados.length
  const partes = [ok + (ok === 1 ? ' test guardado' : ' tests guardados')]
  const fallidos = resultados.length - ok
  if (fallidos) partes.push(fallidos + ' con error')
  if (sinTerminar > 0) partes.push(sinTerminar + ' sin terminar')
  return partes.join(' · ') + '.'
}
