// ============================================================
// TRIPULSE — El RPE de una sesión, en los DOS sitios donde se lee
// ============================================================
// El esfuerzo que el atleta dice que le costó una sesión se guarda en dos
// columnas: `sesion.rpe_reportado` (la sesión entera, el sRPE de Foster) y
// `tarea.rpe_reportado` (cada bloque). Y la app lee de las dos:
//
//   · de la SESIÓN: la carga real, la forma (CTL/ATL/TSB), el ACWR, la
//     monotonía, el resumen semanal real vs planificado, Volumen y el asistente.
//   · de las TAREAS: el SICAT, los índices de percepción y la gráfica de carga.
//
// Cada forma de cerrar una sesión escribía solo en una: el cierre del atleta
// (modo entreno y «Ya la he hecho») en las tareas; lo que apunta él por su
// cuenta y el modo entrenador, en la sesión. Así, media app calculaba la carga
// «real» con el RPE PLANIFICADO, y la otra media no veía las sesiones libres.
// Aquí vive lo que hace falta para que se escriban siempre las dos.

/** Un RPE válido (0-10), o null. Una casilla vacía es «no lo dijo», no un 0. */
const valido = (v: unknown): number | null => {
  if (typeof v === 'string' && !v.trim()) return null
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
}

/**
 * El RPE de la SESIÓN a partir de lo que se apunta al cerrarla.
 *
 * Sesión normal: el que da el atleta. Brick: cada bloque tiene el suyo, y el de
 * la sesión es su media (con un decimal; la columna lo admite). Ponderar por los
 * minutos de cada bloque lo afinaría, pero el reparto fino por bloque ya lo hace
 * el SICAT con su atribución: esto es el número de la sesión entera.
 */
export function rpeDeSesion(rpeGlobal: unknown, bloques?: unknown[]): number | null {
  const deBloques = (bloques || []).map(valido).filter((v): v is number => v != null)
  if (deBloques.length) return Math.round((deBloques.reduce((a, b) => a + b, 0) / deBloques.length) * 10) / 10
  return valido(rpeGlobal)
}

/**
 * Copia el RPE de la sesión a sus tareas que NO tienen el suyo.
 *
 * Para los caminos que solo lo escribían en la sesión: lo que apunta el atleta
 * por su cuenta y el modo entrenador. Nunca pisa el de un bloque que ya lo
 * tenga: en un brick, cada bloque puede haber costado distinto.
 */
export async function rellenarRpeTareas(
  // Lo reciben igual el cliente del navegador y el del servidor, y un doble en las pruebas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (t: string) => any }, idSesion: number, rpe: unknown,
): Promise<void> {
  const v = valido(rpe)
  if (v == null || !idSesion) return
  /* Es una copia para que lo lean los dos lados: si falla, el registro del
     atleta ya está guardado y no se le puede dar por perdido por esto. */
  try {
    await supabase.from('tarea').update({ rpe_reportado: v }).eq('id_sesion', idSesion).is('rpe_reportado', null)
  } catch { /* ver arriba */ }
}
