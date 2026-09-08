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
// QUIÉN PUEDE: CUALQUIER ENTRENADOR. Estuvo limitado a plataforma mientras
// esto se probaba, pero el fichero se escribe PARA un entrenador y hay
// entradas que otros necesitan leer tanto como quien las escribió: cuando se
// corrigió el FTP del test de rampa, las zonas de ciclismo de TODOS bajaron un
// 25 % de un día para otro. Guardarse esa explicación no protege nada; solo
// deja al resto sin saber por qué a su atleta le cambiaron los vatios.
//
// NO SE ABRE AL DEPORTISTA, y no es un descuido: está escrito en el idioma del
// que prescribe —«ya puedes prescribir con tus zonas»— y a quien entrena le
// diría poco y le confundiría bastante. El día que haya novedades escritas
// para él, serán otro texto y no este.
//
// El rol se pregunta a la base con el token de quien pregunta, igual que ya
// hace /api/asistente. No se compara ningún correo escrito en el código: uno a
// fuego se queda viejo el día que cambie y encima queda en el repositorio.
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
  const { data: perfil } = await sb.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (perfil?.rol !== 'entrenador') return json({ error: 'Las novedades son para entrenadores.' }, 403)

  try {
    const md = await readFile(join(process.cwd(), 'NOVEDADES.md'), 'utf8')
    return json({ md })
  } catch {
    /* Si el fichero no está donde se espera, se dice. Devolver texto vacío
       haría que la pantalla enseñara «no hay novedades», que sería falso. */
    return json({ error: 'No se ha podido leer el fichero de novedades.' }, 500)
  }
}
