// ============================================================
// TRIPULSE — El avatar de una persona: su letra y sus dos colores
// ============================================================
//
// No hay fotos: cada deportista se reconoce por su inicial sobre un degradado, y
// el degradado SALE DE SU NOMBRE, así que es siempre el mismo. Eso es lo que lo
// hace útil —en la lista de la semana reconoces a alguien por el color antes de
// leer— y lo que hace que tenga que estar escrito una sola vez: dos versiones
// con paletas distintas darían dos colores para la misma persona según la
// pantalla.
//
// Estaba copiado en CINCO: /comunicacion, /dashboard, la ficha del deportista,
// /eco y /wellness-entrenador. Las cinco idénticas, de momento.

/** Ocho parejas. Se elige por el nombre, no al azar: el color tiene que repetirse. */
const COLORES: [string, string][] = [
  ['#f97316', '#ea580c'],
  ['#3b82f6', '#4f46e5'],
  ['#22c55e', '#0d9488'],
  ['#a855f7', '#7c3aed'],
  ['#06b6d4', '#2563eb'],
  ['#ec4899', '#be185d'],
  ['#eab308', '#d97706'],
  ['#ef4444', '#b91c1c'],
]

/**
 * Los dos colores de alguien, sacados de su nombre.
 *
 * Se suman los códigos de sus letras: es estable, no necesita guardar nada y
 * reparte bien. Sin nombre, la pareja del «?», que también es estable.
 */
export function coloresDe(nombre: string | null | undefined): [string, string] {
  /* Se recorta antes de sumar: en esta base hay nombres con un espacio de
     sobra, y «Ana» y «Ana » no son dos personas de dos colores. */
  const n = (nombre || '').trim() || '?'
  const suma = [...n].reduce((a, c) => a + c.charCodeAt(0), 0)
  return COLORES[suma % COLORES.length]
}

/** La letra que se ve. En mayúscula, y un «?» si no hay nombre. */
export function inicialDe(nombre: string | null | undefined): string {
  return (nombre || '?').trim()[0]?.toUpperCase() || '?'
}

/** El degradado entero, listo para un `background`. */
export function fondoDe(nombre: string | null | undefined): string {
  const [c1, c2] = coloresDe(nombre)
  return 'linear-gradient(145deg,' + c1 + ',' + c2 + ')'
}
