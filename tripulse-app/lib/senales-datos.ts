// Los datos que necesita el motor de señales (lib/senales), en una función.
//
// Va aparte para que `senales.ts` no sepa de Supabase y se pueda probar entero
// con datos a mano. Aquí solo se pide y se ordena.

import { senalesDeAtleta, type ResultadoSenales } from './senales'
import { cargarReferencias } from './referencia-zona'
import { estimarDuraciones, minutosCarga } from './duracion-carga'
import { vivas } from './papelera'
import { hoyISO, sumarDias } from './fechas'
import type { RegistroWellness } from './wellness-analisis'
import type { ResultadoDuracion } from './duracion'

/** Días de historia que se miran. Cubre la base de wellness (3-4 semanas) y el mes de la sesión larga. */
const DIAS = 45

export async function cargarSenales(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, idDeportista: number, hoy: string = hoyISO(),
): Promise<ResultadoSenales> {
  const desde = sumarDias(hoy, -DIAS)

  const [wellQ, sesQ] = await Promise.all([
    supabase.from('wellness').select('*').eq('id_deportista', idDeportista)
      .gte('fecha', desde).order('fecha', { ascending: false }),
    /* Todas, no solo las realizadas: las que se quedaron sin hacer son parte de
       lo que hay que mirar. La papelera no cuenta. */
    vivas(supabase.from('sesion')
      .select('id, fecha_sesion, estado, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real')
      .eq('id_deportista', idDeportista).gte('fecha_sesion', desde).lte('fecha_sesion', hoy)),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ses: any[] = sesQ?.data || []
  let estimaciones: Record<number, ResultadoDuracion> = {}
  if (ses.length) {
    try {
      const { tests } = await cargarReferencias(supabase, idDeportista)
      estimaciones = await estimarDuraciones(supabase, ses.map(s => s.id), tests)
    } catch { /* sin estimación se usa la duración apuntada */ }
  }

  return senalesDeAtleta({
    wellness: (wellQ?.data || []) as RegistroWellness[],
    sesiones: ses.map(s => ({
      fecha_sesion: String(s.fecha_sesion).slice(0, 10),
      estado: s.estado,
      rpe_estimado: s.rpe_estimado,
      rpe_reportado: s.rpe_reportado,
      minutos: minutosCarga(s, estimaciones[s.id]),
    })),
    hoy,
  })
}
