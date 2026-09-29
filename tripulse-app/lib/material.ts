// ============================================================
// Material: zapatillas, bicicletas y sus kilómetros
// ============================================================
//
// Cada deportista tiene su armario. Al cerrar una sesión elige con qué la hizo,
// y cada material va acumulando los kilómetros de SU deporte. Cuando llega al
// límite que se le puso, avisa.
//
// LOS KILÓMETROS SE CALCULAN, NO SE GUARDAN. Un contador guardado se queda
// mintiendo en cuanto se corrige la distancia de una sesión, y las distancias se
// corrigen: el atleta apunta 10 km y luego mira el reloj y eran 10,8. Aquí se
// suman las sesiones cada vez, así que una corrección de ayer se nota hoy.
//
// EL REINICIO ES UNA FECHA, NO UN CERO. Una bicicleta puede llevar el límite de
// su cadena: 4.000 km y a cambiarla. Al cambiarla el límite vuelve a empezar,
// pero la bici sigue teniendo los 4.180 km que ha rodado. Por eso se guarda
// CUÁNDO se reinició y no se toca el histórico: el total sigue siendo el total,
// y el contador del límite cuenta desde esa fecha.
//
// Y POR ESO CADA MATERIAL LLEVA SU DEPORTE. No es una etiqueta para pintar un
// color: es lo que decide qué kilómetros le tocan. En un brick de 40 km de bici
// y 10 de carrera, la bici suma 40 y las zapatillas 10 — nunca los 50.

/** Cuánto le queda, en tanto por uno, para empezar a avisar. */
const AVISA_AL = 0.9

export interface Material {
  id: number
  /** zapatillas · bicicleta · neopreno · otro. Solo decide el icono. */
  tipo: string
  /** El deporte cuyos kilómetros suma. Esto sí decide. */
  disciplina: string
  nombre: string
  /** «las de placa». Es lo que se lee al elegir en la sesión. */
  apodo?: string | null
  /** Los que ya traía encima al darlo de alta. Casi nunca es cero. */
  km_inicial?: number | null
  /** null = sin límite. Lo decide la persona, material a material. */
  km_limite?: number | null
  /** Desde cuándo cuenta el límite. null = desde siempre. */
  reinicio_fecha?: string | null
  /** El total que llevaba al reiniciar. Solo para contarlo, no para la cuenta. */
  reinicio_km?: number | null
  jubilado?: boolean | null
}

/** Una sesión en la que se usó el material, con los metros de SU deporte. */
export interface UsoDeMaterial {
  fecha: string
  metros: number
}

export type EstadoMaterial = 'sin-limite' | 'ok' | 'aviso' | 'pasado'

export interface KmDeMaterial {
  /** Todo lo que lleva encima desde que existe, incluidos los que ya traía. */
  total: number
  /** Lo que cuenta para el límite: desde el último reinicio, o todo. */
  contador: number
  limite: number | null
  /** Lo que le queda para el límite. null si no tiene. Nunca negativo. */
  restante: number | null
  /** Cuánto se ha pasado. 0 si no se ha pasado. */
  pasado: number
  estado: EstadoMaterial
  /** Para la barra, entre 0 y 1. Sin límite, 0. */
  fraccion: number
  /** ¿Hay un reinicio por medio? Cambia lo que se enseña. */
  reiniciado: boolean
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const redondea = (km: number): number => Math.round(km * 10) / 10

/**
 * Los kilómetros de un material y en qué estado está.
 *
 * `usos` son las sesiones en las que se eligió, cada una con los metros que le
 * tocan a ESTE material (los de su deporte). Quien llama hace ese reparto con la
 * capa de atribución, que es la única que sabe deshacer un brick en bloques.
 */
export function kmDeMaterial(m: Material, usos: UsoDeMaterial[] | null | undefined): KmDeMaterial {
  const lista = usos || []
  const inicial = num(m.km_inicial)
  const total = redondea(inicial + lista.reduce((a, u) => a + num(u.metros), 0) / 1000)

  /* El contador del límite. Con reinicio cuenta solo lo de después, y sin los
     kilómetros que ya traía: esos son de antes por definición. */
  const reiniciado = !!m.reinicio_fecha
  const contador = reiniciado
    ? redondea(lista.filter(u => u.fecha > m.reinicio_fecha!).reduce((a, u) => a + num(u.metros), 0) / 1000)
    : total

  const limite = num(m.km_limite) > 0 ? num(m.km_limite) : null
  if (limite === null) {
    return { total, contador, limite: null, restante: null, pasado: 0, estado: 'sin-limite', fraccion: 0, reiniciado }
  }

  const restante = redondea(Math.max(0, limite - contador))
  const pasado = redondea(Math.max(0, contador - limite))
  const fraccion = Math.min(1, contador / limite)

  return {
    total, contador, limite, restante, pasado, reiniciado, fraccion,
    estado: contador > limite ? 'pasado' : fraccion >= AVISA_AL ? 'aviso' : 'ok',
  }
}

/**
 * Lo que se lee al elegir en la sesión: el apodo si lo tiene, y si no el nombre.
 *
 * «las de placa» se reconoce antes que «Adizero Adios Pro 3», y a las once de la
 * noche después de entrenar eso es la diferencia entre elegir bien y elegir la
 * primera.
 */
export function comoSeLlama(m: Material): string {
  return (m.apodo || '').trim() || m.nombre
}

/**
 * Cómo quedaría si le sumo estos metros, sin guardar nada.
 *
 * Es para avisar ANTES: «con estos 10 km, las de placa llegan a 378 de 400». El
 * aviso después de guardar llega tarde — ya ha corrido con ellas.
 *
 * Parte de la cuenta ya hecha en vez de rehacerla desde las sesiones: lo único
 * que se mueve es el contador, y el estado sale de él.
 */
export function siLeSumo(km: KmDeMaterial, metros: number): KmDeMaterial {
  const mas = num(metros) / 1000
  const total = redondea(km.total + mas)
  const contador = redondea(km.contador + mas)
  if (km.limite === null) {
    return { ...km, total, contador }
  }
  const fraccion = Math.min(1, contador / km.limite)
  return {
    ...km, total, contador, fraccion,
    restante: redondea(Math.max(0, km.limite - contador)),
    pasado: redondea(Math.max(0, contador - km.limite)),
    estado: contador > km.limite ? 'pasado' : fraccion >= AVISA_AL ? 'aviso' : 'ok',
  }
}

/** ¿Sale en el desplegable de una sesión de este deporte? */
export function valeParaLaSesion(m: Material, disciplina: string): boolean {
  if (m.jubilado) return false
  return String(m.disciplina || '').toLowerCase() === String(disciplina || '').toLowerCase()
}
