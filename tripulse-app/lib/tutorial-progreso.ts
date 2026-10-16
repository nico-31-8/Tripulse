// ============================================================
// TRIPULSE — Lo que cada persona ha visto del tutorial
// ============================================================
// Tabla `tutorial_progreso` (supabase/tutorial-progreso.sql): una fila por
// clave. Una zona guarda 'visto' o 'saltado'; '_pausa' guarda que dijo
// «Ahora no»; '_oferta', lo que contestó a la tarjeta quien ya usaba la app.
// Los consejos (lib/consejos) van con su clave «c:…»: 'saltado' si dijo «Ahora
// no», 'visto' si pulsó su botón. La fecha de la fila dice cuándo puede volver.
//
// Si la tabla no está todavía, o no se puede leer, el progreso sale como «no
// disponible»: nada arranca solo (no se podría recordar que ya lo vio y le
// saldría en cada visita), pero el botón ? sigue funcionando.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { progresoVacio, type Progreso } from './tutorial'

export const CLAVE_PAUSA = '_pausa'
export const CLAVE_OFERTA = '_oferta'

export type EstadoGuardado = 'visto' | 'saltado' | 'pausado' | 'aceptada' | 'rechazada'

/** De las filas guardadas al progreso con el que trabaja el tutorial. */
export function progresoDeFilas(filas: { clave: string; estado: string; actualizado?: string | null }[] | null | undefined): Progreso {
  const p = progresoVacio(true)
  for (const f of filas || []) {
    if (f.clave.startsWith('c:')) {
      if ((f.estado === 'visto' || f.estado === 'saltado') && f.actualizado) p.consejos.set(f.clave, { estado: f.estado, fecha: f.actualizado })
      continue
    }
    if (f.clave === CLAVE_PAUSA) { p.pausado = f.estado === 'pausado'; continue }
    if (f.clave === CLAVE_OFERTA) {
      p.oferta = f.estado === 'aceptada' || f.estado === 'rechazada' ? f.estado : null
      continue
    }
    if (f.estado === 'visto') p.vistos.add(f.clave)
    else if (f.estado === 'saltado') p.saltados.add(f.clave)
  }
  return p
}

export async function cargarProgreso(sb: any, idUsuario: string): Promise<Progreso> {
  try {
    const { data, error } = await sb.from('tutorial_progreso').select('clave, estado, actualizado').eq('id_usuario', idUsuario)
    if (error) return progresoVacio(false)
    return progresoDeFilas(data)
  } catch {
    return progresoVacio(false)
  }
}

/** Guarda una marca. Devuelve el error, o null. No interrumpe a nadie si falla: es el tutorial. */
export async function guardarMarca(sb: any, idUsuario: string, clave: string, estado: EstadoGuardado): Promise<string | null> {
  const { error } = await sb.from('tutorial_progreso').upsert(
    { id_usuario: idUsuario, clave, estado, actualizado: new Date().toISOString() },
    { onConflict: 'id_usuario,clave' },
  )
  return error ? (error.message || 'No se ha podido guardar') : null
}

export async function quitarMarca(sb: any, idUsuario: string, clave: string): Promise<string | null> {
  const { error } = await sb.from('tutorial_progreso').delete().eq('id_usuario', idUsuario).eq('clave', clave)
  return error ? (error.message || 'No se ha podido quitar') : null
}
