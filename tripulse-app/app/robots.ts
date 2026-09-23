import type { MetadataRoute } from 'next'
import { SITIO, PUBLICAS } from '@/lib/sitio'

// ============================================================
// Qué puede mirar Google
// ============================================================
// TODO CERRADO POR DEFECTO, y se abre lo público a mano. Al revés —abrir todo y
// cerrar lo privado— habría que acordarse de añadir cada pantalla nueva a la
// lista de prohibidas, y la que se olvidara acabaría indexada: no rompería
// nada, pero saldrían en Google pantallas de la app que sin sesión están
// vacías, y eso es lo que Google llama «contenido de poco valor».
//
// `/_next/` sí se abre: son el CSS y el JavaScript. Sin ellos Google ve la
// portada en crudo, sin estilos, y la juzga por eso.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      /* `/$` es solo la raíz: la portada. Sin el dólar valdría para todo.

         Y OJO CON EL SITEMAP: es una dirección más, así que con todo cerrado se
         quedaba fuera. Google iba a leerlo, no tenía permiso, y Search Console
         respondía «No se ha podido obtener» sin decir por qué. Lo mismo con la
         imagen de compartir. El robots.txt no hace falta abrirlo: los
         rastreadores lo leen siempre. */
      allow: [
        '/$', ...PUBLICAS.filter(p => p !== '/'),
        '/sitemap.xml', '/opengraph-image', '/favicon.ico', '/_next/',
      ],
      disallow: '/',
    }],
    sitemap: SITIO + '/sitemap.xml',
  }
}
