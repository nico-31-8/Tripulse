// ============================================================
// El texto de las novedades, solo para quien puede verlo
// ============================================================
//
// POR QUÉ ESTO ES UNA RUTA Y NO SE LEE EN LA PÁGINA. La página lo leía en el
// servidor y lo mandaba dentro del HTML, y el filtro de quién puede verlo
// estaba en el navegador. Eso NO es restringir: el texto viajaba igual a
// cualquiera que abriese la dirección, y solo se le escondía al pintarlo. Basta
// con mirar el código fuente de la página para leerlo entero.
//
// Aquí el candado está antes de que el texto salga: si quien pregunta no es de
// plataforma, no se le manda nada.
//
// QUIÉN PUEDE. Se pregunta a `soy_plataforma()`, que ya existe y decide contra
// la tabla `plataforma_admin`. No se compara ningún correo escrito en el
// código: un correo a fuego se queda viejo el día que cambie, no se puede
// añadir a nadie sin desplegar, y encima quedaría en el repositorio. Dar de
// alta a otra persona es meter una fila en esa tabla.
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'No autenticado.' }, 401)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Sesión no válida.' }, 401)

  /* La comprobación la hace la base con el token de quien pregunta, no nosotros
     con un dato que nos hayan mandado. */
  const { data: puede } = await sb.rpc('soy_plataforma')
  if (!puede) return json({ error: 'Todavía no disponible.' }, 403)

  try {
    const md = await readFile(join(process.cwd(), 'NOVEDADES.md'), 'utf8')
    return json({ md })
  } catch {
    /* Si el fichero no está donde se espera, se dice. Devolver texto vacío
       haría que la pantalla enseñara «no hay novedades», que sería falso. */
    return json({ error: 'No se ha podido leer el fichero de novedades.' }, 500)
  }
}
