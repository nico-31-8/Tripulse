// ============================================================
// TRIPULSE — Qué relojes se pueden conectar, en un solo sitio
// ============================================================
// El desplegable de «Conectar un reloj», los pasos de cada uno, lo que trae y
// si sus datos ya llegan al wellness salen de aquí. Añadir una marca, o pasar
// una de «próximamente» a disponible, es tocar esta lista y nada más.

export type Proveedor = 'polar' | 'coros' | 'garmin'

/**
 * - `disponible`: se conecta y sus datos llegan.
 * - `pruebas`: se conecta, pero sus datos todavía no llegan al wellness. Es el
 *   estado de una marca hasta que la primera cuenta real enseña la forma de sus
 *   respuestas (COROS lo estuvo hasta el 17-10-2026).
 * - `proximamente`: sale en la lista, apagado, para que quien lo tenga sepa que
 *   está en camino.
 */
export type EstadoReloj = 'disponible' | 'pruebas' | 'proximamente'

export interface RelojCatalogo {
  id: Proveedor
  nombre: string
  estado: EstadoReloj
  /** En una línea, lo que trae. Va en el desplegable. */
  trae: string
  /** Los pasos para conectarlo: [qué hacer, detalle]. */
  pasos: [string, string][]
  /** Lo que llega según el aparato: [en negrita, el resto]. */
  queLlega: [string, string][]
  /** «¿No llega nada?»: lo que hay que revisar, en el orden en que suele fallar. */
  siNoLlega: [string, string][]
  /** Dónde se guardan sus sesiones, para decir «lo que no esté en … no nos llega». */
  cuenta: string
  /**
   * Qué decir en su perfil cuando todavía no ha llegado ningún entreno. Cada
   * marca hace una cosa: Polar solo da los que se suban DESPUÉS de conectar;
   * COROS da los de las últimas cuatro semanas al conectar.
   */
  sinEntrenos?: string
  /** Aviso para `pruebas` y `proximamente`. */
  nota?: string
  /** Solo Polar: su conexión caduca al año y hay que avisar antes. */
  caducaAlAno?: boolean
}

export const RELOJES: RelojCatalogo[] = [
  {
    id: 'polar',
    nombre: 'Polar',
    estado: 'disponible',
    trae: 'Sueño, HRV nocturna y entrenos',
    caducaAlAno: true,
    pasos: [
      ['Ten a mano tu cuenta de Polar Flow.', 'La misma con la que entras en la app de Polar donde ves tus entrenos.'],
      ['Pulsa «Conectar Polar».', 'Te lleva a Polar: entras y das permiso. Después vuelves aquí solo.'],
      ['Acepta los consentimientos en account.polar.com.', 'Es el paso que se olvida: sin él Polar no deja leer nada, aunque aquí salga «conectado».'],
      ['Sincroniza tu reloj con la app de Polar, como siempre.', 'Lo que no esté en Polar Flow no nos llega.'],
    ],
    queLlega: [
      ['Con un reloj o pulsera Polar con el que duermes:', 'tu sueño y tu HRV cada noche, y tus entrenos. Al conectar llegan las noches de las últimas cuatro semanas.'],
      ['Con una banda de pecho o de brazo Polar:', 'tus entrenos, si los grabas con un reloj Polar o con la app de Polar. La de brazo puede grabar sola y pasarlos al móvil después. El sueño y la HRV no: con la banda no se duerme.'],
      ['Si tu banda Polar va con un Garmin u otra marca,', 'esas sesiones se guardan en esa marca y no llegan aquí.'],
      ['Los entrenos, solo los que subas a Polar Flow después de conectar.', 'Los de antes no.'],
    ],
    siNoLlega: [
      ['Acepta los consentimientos en account.polar.com.', 'Sin ellos Polar no deja leer nada.'],
      ['Sincroniza el reloj con la app de Polar.', 'Lo que no esté en Polar Flow no nos llega.'],
      ['Pulsa «Sincronizar ahora»', 'aquí abajo.'],
    ],
    cuenta: 'Polar Flow',
    sinEntrenos: 'Polar solo comparte los entrenos que subas a Polar Flow a partir de ahora, no los de antes de conectar.',
  },
  {
    id: 'coros',
    nombre: 'COROS',
    /* Disponible desde el 17-10-2026, con la primera cuenta real: el sueño, la
       HRV del sueño y la FC en reposo se traducen (lib/coros), y desde el
       19-10-2026 también los entrenos, con su detalle desde el 20 (el FIT). */
    estado: 'disponible',
    trae: 'Sueño, HRV del sueño, FC en reposo y entrenos',
    pasos: [
      ['Ten a mano tu cuenta de COROS.', 'La misma con la que entras en la app de COROS.'],
      ['Pulsa «Conectar COROS».', 'Te lleva a COROS: entras y das permiso. Después vuelves aquí solo.'],
      ['Sincroniza tu reloj con la app de COROS, como siempre.', 'Lo que no esté en tu cuenta de COROS no nos llega.'],
    ],
    queLlega: [
      ['Con un reloj COROS con el que duermes:', 'tu sueño, tu HRV del sueño y tu FC en reposo de cada día. Al conectar llegan los de las últimas cuatro semanas.'],
      ['Tus entrenos:', 'al conectar llegan los de las últimas cuatro semanas, y después cada uno que sincronices, con sus vueltas y su FC.'],
      ['Si tu banda va con un reloj de otra marca,', 'esas sesiones se guardan en esa marca y no llegan aquí.'],
    ],
    siNoLlega: [
      ['Sincroniza el reloj con la app de COROS.', 'Lo que no esté en tu cuenta de COROS no nos llega.'],
      ['Pulsa «Sincronizar ahora»', 'aquí abajo.'],
    ],
    cuenta: 'tu cuenta de COROS',
    sinEntrenos: 'Al conectar llegan los de las últimas cuatro semanas. Si no sale ninguno, sincroniza el reloj con la app de COROS y pulsa «Sincronizar ahora».',
  },
  {
    id: 'garmin',
    nombre: 'Garmin',
    estado: 'proximamente',
    trae: 'Sueño, HRV y entrenos',
    nota: 'En cuanto Garmin nos dé acceso. Mientras tanto, el wellness se rellena a mano como siempre.',
    pasos: [],
    queLlega: [],
    siNoLlega: [],
    cuenta: 'Garmin Connect',
  },
]

export const relojPorId = (id: string | null | undefined): RelojCatalogo | undefined =>
  RELOJES.find(r => r.id === id)

/** El nombre bien escrito (COROS en mayúsculas), aunque llegue en minúsculas de la base. */
export function nombreReloj(id: string | null | undefined): string {
  const r = relojPorId(id)
  if (r) return r.nombre
  const s = String(id || '')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Reloj'
}

/** Si lo que trae ese reloj ya se puede usar en el wellness. */
export const datosListos = (id: string | null | undefined): boolean => relojPorId(id)?.estado === 'disponible'

/** La vuelta de la marca llega a /perfil como ?reloj=polar-conectado, coros-error… */
export function leerVuelta(v: string | null | undefined): { proveedor: Proveedor; ok: boolean } | null {
  const m = /^([a-z]+)-(conectado|error)$/.exec(v || '')
  const r = m ? relojPorId(m[1]) : undefined
  return m && r ? { proveedor: r.id, ok: m[2] === 'conectado' } : null
}

/** Si se puede pulsar «Conectar». */
export const sePuedeConectar = (id: string | null | undefined): boolean => {
  const e = relojPorId(id)?.estado
  return e === 'disponible' || e === 'pruebas'
}
