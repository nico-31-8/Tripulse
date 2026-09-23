// ============================================================
// La dirección de la app, en un solo sitio
// ============================================================
// Se usa en tres sitios que tienen que decir lo mismo: los metadatos de la
// página (para el enlace que se comparte por WhatsApp), el robots.txt y el
// sitemap. Si cada uno llevara la dirección escrita a mano, el día que cambie
// se arreglarían dos y se quedaría uno mintiendo.
//
// La app vive en tripulse.app desde el 23/09/2026. La vieja
// `tripulse-eight.vercel.app` sigue funcionando y no hay que quitarla, pero la
// que se le dice a Google es esta.

/** Sin barra al final: las rutas ya la traen. */
export const SITIO = 'https://tripulse.app'

/**
 * Las páginas que se pueden ver SIN haber entrado.
 *
 * Son las únicas que tiene sentido que Google visite: el resto de la app pide
 * sesión y, sin ella, es una pantalla en blanco que redirige.
 */
export const PUBLICAS = ['/', '/registro', '/login', '/terminos', '/privacidad'] as const
