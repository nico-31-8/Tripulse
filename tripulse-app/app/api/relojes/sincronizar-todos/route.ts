// Traer lo de todos los relojes conectados, sin que nadie abra la app.
//
// La lanza Vercel Cron dos veces al día (vercel.json): por la mañana, para
// tener la noche, y por la noche, para los entrenos de la tarde. Vercel manda
// en la cabecera la variable CRON_SECRET; sin ella, o con otra, no se hace
// nada.
//
// Habla con la base SIN SESIÓN y con la llave del servidor
// (RELOJ_LLAVE_SERVIDOR), a través de las funciones reloj_servidor_* de
// supabase/relojes-servidor.sql. Cada conexión que lleva más de tres horas
// sin traer nada se sincroniza igual que cuando el deportista pulsa
// «Sincronizar ahora» (lib/relojes-sincronizar). Un fallo queda apuntado en
// SU conexión, como siempre: lo ve en su perfil, y su entrenador en «Su
// reloj». Aquí solo se cuenta, sin datos de nadie.

import { timingSafeEqual } from 'node:crypto'
import * as Sentry from '@sentry/nextjs'
import { json, clienteAnonimo } from '@/lib/relojes-servidor'
import { sincronizarTodos } from '@/lib/relojes-sincronizar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/* 300 s, lo que deja Vercel también en el plan gratuito. Pasados 150 ya no se empieza ninguno más. */
export const maxDuration = 300

const igual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || !igual(req.headers.get('authorization') || '', 'Bearer ' + secreto)) {
    return json({ error: 'No autorizado.' }, 401)
  }
  const llave = process.env.RELOJ_LLAVE_SERVIDOR
  if (!llave) {
    Sentry.captureMessage('Sincronización automática de relojes: falta RELOJ_LLAVE_SERVIDOR', 'error')
    return json({ error: 'Falta la llave del servidor.' }, 500)
  }

  const r = await sincronizarTodos(clienteAnonimo(), llave)
  if (!r.ok) {
    Sentry.captureMessage('Sincronización automática de relojes: ' + r.error, 'error')
    return json({ error: r.error }, 500)
  }

  const { pendientes, resultados, sinTiempo } = r.todos
  for (const x of resultados) if (x.inesperado) Sentry.captureException(x.inesperado)
  const resumen = {
    pendientes,
    traidas: resultados.filter(x => x.ok).length,
    conAviso: resultados.filter(x => x.ok && x.mensaje).length,
    fallidas: resultados.filter(x => !x.ok).length,
    sinTiempo,
    /* Solo el número interno del deportista, la marca y la frase: nada de lo que llegó. */
    fallos: resultados.filter(x => !x.ok).map(x => ({ deportista: x.id_deportista, marca: x.proveedor, motivo: x.mensaje })),
  }
  console.log('[relojes] sincronización automática ' + JSON.stringify(resumen))
  return json(resumen)
}
