// ============================================================
// TRIPULSE — El tope de llamadas de las rutas que cuestan dinero
// ============================================================
//
// Las cuatro rutas de /api/ comprobaban QUIÉN llama pero no CUÁNTAS veces. Cada
// llamada a /api/plan/generar escribe una semana entera con el modelo, la juzga
// y reintenta: es lo más caro que hace la app. Sin tope, un bucle en una consola
// del navegador —con una sesión legítima— se come el saldo en minutos.
//
// La cuenta la lleva la base (ver supabase/cuota-api.sql). Aquí solo se pregunta
// y se traduce el «no» a algo que la persona entienda.
//
// SI LA CONSULTA FALLA, SE DEJA PASAR.
// Es la decisión importante de este fichero. Un tope que se cae y bloquea la app
// convierte un problema de facturación en una caída total. Se prefiere gastar de
// más un rato antes que dejar a todo el mundo fuera porque una tabla no
// responde. El caso que esto protege —un bucle— es raro; una base con hipo, no.

/** Cuántas llamadas por hora y usuario admite cada ruta. */
export const TOPES: Record<string, number> = {
  /* Genera una semana entera, la juzga y reintenta. La más cara con diferencia,
     y nadie planifica veinte semanas en una hora trabajando de verdad. */
  'plan/generar': 20,
  'plan': 30,
  /* Conversaciones: se llaman muchas más veces por su naturaleza, y cada
     llamada es bastante más barata. */
  'asistente': 60,
  'entrenador': 60,
}

export interface Cuota {
  ok: boolean
  usos?: number
  max?: number
  renueva?: string
}

/** «Vuelve a las 18:00». Con la hora local de quien lee, no en UTC. */
export function cuandoRenueva(iso: string | undefined): string {
  if (!iso) return 'dentro de un rato'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'dentro de un rato'
  return 'a las ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

/** El mensaje que ve la persona. Dice el tope y cuándo vuelve, no un «no». */
export function mensajeDeTope(c: Cuota, que: string): string {
  return 'Has llegado al tope de ' + (c.max ?? '?') + ' ' + que + ' por hora. '
    + 'Se te renueva ' + cuandoRenueva(c.renueva) + '. '
    + 'Es para que un fallo o un clic repetido no dispare el gasto sin que nadie lo vea.'
}

/**
 * Suma una llamada y dice si se pasó del tope.
 *
 * `sb` tiene que ser el cliente AUTENTICADO como la persona (con su token): la
 * función de la base lee `auth.uid()`, así que con el cliente anónimo contaría
 * todo en el mismo saco.
 */
export async function consumirCuota(sb: any, ruta: string): Promise<Cuota> {
  const max = TOPES[ruta] ?? 60
  const { data, error } = await sb.rpc('consumir_cuota', { _ruta: ruta, _max: max })

  // Si la cuenta no está disponible, se deja pasar. Ver la cabecera.
  if (error || !data) return { ok: true }

  return data as Cuota
}
