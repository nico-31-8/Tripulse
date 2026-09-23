import type { MetadataRoute } from 'next'
import { SITIO, PUBLICAS } from '@/lib/sitio'

// El mapa que se le da a Google: las páginas públicas y nada más. Las de dentro
// de la app piden sesión, así que no hay nada que enseñar.
//
// La prioridad no es una nota: es en qué orden mirarlas cuando el rastreador
// tiene prisa. La portada primero; los textos legales, los últimos.
const PRIORIDAD: Record<string, number> = {
  '/': 1, '/registro': 0.8, '/login': 0.5, '/terminos': 0.2, '/privacidad': 0.2,
}

export default function sitemap(): MetadataRoute.Sitemap {
  const hoy = new Date()
  return PUBLICAS.map(ruta => ({
    url: SITIO + (ruta === '/' ? '' : ruta),
    lastModified: hoy,
    changeFrequency: 'monthly' as const,
    priority: PRIORIDAD[ruta] ?? 0.5,
  }))
}
