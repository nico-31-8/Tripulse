// ============================================================
// Novedades — qué ha cambiado en la aplicación
// ============================================================
//
// ES UN COMPONENTE DE SERVIDOR, y es el primero de la aplicación. Lo es porque
// necesita LEER UN FICHERO del proyecto —`NOVEDADES.md`— y eso en el navegador
// no existe. Se lee aquí, en el servidor, y se le pasa el texto ya troceado al
// componente que lo pinta.
//
// POR QUÉ NO SE COPIA EL TEXTO A UN FICHERO DE DATOS. Porque entonces habría
// dos versiones: la que tú lees para presentar la aplicación y la que ven tus
// entrenadores dentro. Se separarían la primera semana que alguien edite una y
// no la otra. Una sola fuente.
import { readFile } from 'fs/promises'
import { join } from 'path'
import { parseNovedades } from '@/lib/novedades'
import VistaNovedades from '@/components/VistaNovedades'

export const metadata = { title: 'Novedades · TRIPULSE' }

/* Se vuelve a leer en cada carga en vez de quedarse fijo en el build: así, si
   algún día el fichero se edita sin desplegar, la pantalla lo refleja. Es un
   fichero pequeño y local; leerlo no cuesta nada. */
export const dynamic = 'force-dynamic'

export default async function PaginaNovedades() {
  let md = ''
  try {
    md = await readFile(join(process.cwd(), 'NOVEDADES.md'), 'utf8')
  } catch {
    /* Si el fichero no está donde se espera —otra raíz en el servidor, un
       despliegue que no lo copió— la pantalla lo dice en vez de quedarse en
       blanco. Un hueco mudo se lee como «no hay novedades», que sería falso. */
  }
  return <VistaNovedades novedades={parseNovedades(md)} />
}
