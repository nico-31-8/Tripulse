// Catálogo de tipos de prueba/competición para deportes de resistencia y multideporte.
// Distancias oficiales de referencia (World Triathlon / World Aquatics / World Athletics / UCI).
// Las marcadas `aprox` varían según organizador.

export interface Segmento {
  disc: string        // 'Natación' | 'Ciclismo' | 'Carrera' | 'BTT' | 'Trail' | 'Esquí' | 'Nado-carrera'
  km: number | null   // null = distancia variable / no aplica
  nota?: string
}

export interface Prueba {
  id: string
  nombre: string
  categoria: string
  segmentos: Segmento[]
  aprox?: boolean     // distancias variables según prueba
}

export const CATEGORIAS_PRUEBA = [
  'Triatlón', 'Duatlón', 'Otros multideporte', 'Carrera', 'Natación', 'Ciclismo',
] as const

const S = (disc: string, km: number | null, nota?: string): Segmento => ({ disc, km, nota })

export const PRUEBAS: Prueba[] = [
  // ---- Triatlón (nadar · bici · correr) ----
  { id: 'tri-supersprint', nombre: 'Triatlón Super-sprint', categoria: 'Triatlón', aprox: true, segmentos: [S('Natación', 0.4), S('Ciclismo', 10), S('Carrera', 2.5)] },
  { id: 'tri-sprint', nombre: 'Triatlón Sprint', categoria: 'Triatlón', segmentos: [S('Natación', 0.75), S('Ciclismo', 20), S('Carrera', 5)] },
  { id: 'tri-olimpico', nombre: 'Triatlón Olímpico / estándar', categoria: 'Triatlón', segmentos: [S('Natación', 1.5), S('Ciclismo', 40), S('Carrera', 10)] },
  { id: 'tri-media', nombre: 'Triatlón Media / Half (70.3)', categoria: 'Triatlón', segmentos: [S('Natación', 1.9), S('Ciclismo', 90), S('Carrera', 21.1)] },
  { id: 'tri-larga', nombre: 'Triatlón Larga / Ironman (140.6)', categoria: 'Triatlón', segmentos: [S('Natación', 3.8), S('Ciclismo', 180), S('Carrera', 42.2)] },
  { id: 'tri-relevo-mixto', nombre: 'Triatlón Relevo mixto', categoria: 'Triatlón', aprox: true, segmentos: [S('Natación', 0.3), S('Ciclismo', 6.8), S('Carrera', 1.8)] },
  { id: 'tri-cross', nombre: 'Triatlón Cross / Xterra', categoria: 'Triatlón', aprox: true, segmentos: [S('Natación', 1), S('BTT', 25), S('Trail', 8)] },
  { id: 'tri-invierno', nombre: 'Triatlón de invierno', categoria: 'Triatlón', aprox: true, segmentos: [S('Carrera', 8), S('BTT', 13), S('Esquí', 11)] },

  // ---- Duatlón (correr · bici · correr) ----
  { id: 'du-sprint', nombre: 'Duatlón Sprint', categoria: 'Duatlón', segmentos: [S('Carrera', 5), S('Ciclismo', 20), S('Carrera', 2.5)] },
  { id: 'du-estandar', nombre: 'Duatlón Estándar', categoria: 'Duatlón', segmentos: [S('Carrera', 10), S('Ciclismo', 40), S('Carrera', 5)] },
  { id: 'du-larga', nombre: 'Duatlón Larga (Powerman)', categoria: 'Duatlón', aprox: true, segmentos: [S('Carrera', 10), S('Ciclismo', 150), S('Carrera', 30)] },
  { id: 'du-cross', nombre: 'Duatlón Cross', categoria: 'Duatlón', aprox: true, segmentos: [S('Carrera', null), S('BTT', null), S('Carrera', null)] },

  // ---- Otros multideporte ----
  { id: 'acuatlon', nombre: 'Acuatlón (correr · nadar · correr)', categoria: 'Otros multideporte', aprox: true, segmentos: [S('Carrera', 2.5), S('Natación', 1), S('Carrera', 2.5)] },
  { id: 'aquabike-media', nombre: 'Aquabike Media', categoria: 'Otros multideporte', segmentos: [S('Natación', 1.9), S('Ciclismo', 90)] },
  { id: 'aquabike-larga', nombre: 'Aquabike Larga', categoria: 'Otros multideporte', segmentos: [S('Natación', 3.8), S('Ciclismo', 180)] },
  { id: 'swimrun', nombre: 'Swimrun (ÖTILLÖ)', categoria: 'Otros multideporte', aprox: true, segmentos: [S('Nado-carrera', null, 'tramos alternos')] },

  // ---- Carrera a pie ----
  { id: 'run-5k', nombre: '5 km', categoria: 'Carrera', segmentos: [S('Carrera', 5)] },
  { id: 'run-10k', nombre: '10 km', categoria: 'Carrera', segmentos: [S('Carrera', 10)] },
  { id: 'run-15k', nombre: '15 km', categoria: 'Carrera', segmentos: [S('Carrera', 15)] },
  { id: 'run-media', nombre: 'Media maratón (21,097 km)', categoria: 'Carrera', segmentos: [S('Carrera', 21.097)] },
  { id: 'run-maraton', nombre: 'Maratón (42,195 km)', categoria: 'Carrera', segmentos: [S('Carrera', 42.195)] },
  { id: 'run-50k', nombre: 'Ultra 50 km', categoria: 'Carrera', segmentos: [S('Carrera', 50)] },
  { id: 'run-100k', nombre: 'Ultra 100 km', categoria: 'Carrera', segmentos: [S('Carrera', 100)] },
  { id: 'run-trail', nombre: 'Trail (corto/medio)', categoria: 'Carrera', aprox: true, segmentos: [S('Trail', null)] },
  { id: 'run-ultratrail', nombre: 'Ultra-trail', categoria: 'Carrera', aprox: true, segmentos: [S('Trail', null)] },
  { id: 'run-cross', nombre: 'Cross (campo a través)', categoria: 'Carrera', aprox: true, segmentos: [S('Carrera', null)] },

  // ---- Natación ----
  { id: 'nat-oa-5k', nombre: 'Aguas abiertas 5 km', categoria: 'Natación', segmentos: [S('Natación', 5)] },
  { id: 'nat-oa-10k', nombre: 'Aguas abiertas 10 km (maratón)', categoria: 'Natación', segmentos: [S('Natación', 10)] },
  { id: 'nat-oa-25k', nombre: 'Aguas abiertas 25 km', categoria: 'Natación', segmentos: [S('Natación', 25)] },
  { id: 'nat-travesia', nombre: 'Travesía (distancia variable)', categoria: 'Natación', aprox: true, segmentos: [S('Natación', null)] },
  { id: 'nat-1500', nombre: 'Piscina 1500 m', categoria: 'Natación', segmentos: [S('Natación', 1.5)] },
  { id: 'nat-800', nombre: 'Piscina 800 m', categoria: 'Natación', segmentos: [S('Natación', 0.8)] },
  { id: 'nat-400', nombre: 'Piscina 400 m', categoria: 'Natación', segmentos: [S('Natación', 0.4)] },

  // ---- Ciclismo ----
  { id: 'cic-granfondo', nombre: 'Gran fondo / Marcha', categoria: 'Ciclismo', aprox: true, segmentos: [S('Ciclismo', null)] },
  { id: 'cic-cri', nombre: 'Contrarreloj (CRI)', categoria: 'Ciclismo', aprox: true, segmentos: [S('Ciclismo', null)] },
  { id: 'cic-criterium', nombre: 'Critérium', categoria: 'Ciclismo', aprox: true, segmentos: [S('Ciclismo', null)] },
  { id: 'cic-ruta', nombre: 'Ruta en línea', categoria: 'Ciclismo', aprox: true, segmentos: [S('Ciclismo', null)] },
  { id: 'cic-gravel', nombre: 'Gravel', categoria: 'Ciclismo', aprox: true, segmentos: [S('Ciclismo', null)] },
  { id: 'cic-xco', nombre: 'BTT Cross-country (XCO)', categoria: 'Ciclismo', aprox: true, segmentos: [S('BTT', null)] },
  { id: 'cic-xcm', nombre: 'BTT Maratón (XCM)', categoria: 'Ciclismo', aprox: true, segmentos: [S('BTT', null)] },
  { id: 'cic-ciclocross', nombre: 'Ciclocross', categoria: 'Ciclismo', aprox: true, segmentos: [S('Ciclismo', null)] },
]

export const pruebaPorId = (id: string | null | undefined): Prueba | null =>
  PRUEBAS.find(p => p.id === id) || null

const EMOJI_DISC: Record<string, string> = {
  'Natación': '🏊', 'Ciclismo': '🚴', 'Carrera': '🏃',
  'BTT': '🚵', 'Trail': '⛰️', 'Esquí': '🎿', 'Nado-carrera': '🏊',
}

// "1,9" (coma decimal, sin decimales si es entero)
function fmtKm(km: number): string {
  return (Number.isInteger(km) ? String(km) : km.toFixed(km < 10 ? 3 : 1).replace(/\.?0+$/, '')).replace('.', ',')
}

// Resumen de segmentos: "1,9 km 🏊 · 90 km 🚴 · 21,1 km 🏃"
export function resumenSegmentos(p: Prueba): string {
  return p.segmentos
    .map(s => {
      const e = EMOJI_DISC[s.disc] || ''
      if (s.km == null) return `${s.disc}${s.nota ? ' (' + s.nota + ')' : ''} ${e}`.trim()
      return `${fmtKm(s.km)} km ${e}`.trim()
    })
    .join(' · ')
}
