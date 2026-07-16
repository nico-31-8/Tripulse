// Atleta "activo" del entrenador: se elige una vez en el hub y todos los módulos
// (carga, volumen, wellness, SICAT, índices…) abren por defecto sobre él.
// Persistido en localStorage para sobrevivir a recargas y navegación por el menú lateral.

const KEY = 'tripulse_atleta_activo'

export function getAtletaActivo(): number | null {
  if (typeof window === 'undefined') return null
  const v = localStorage.getItem(KEY)
  return v ? Number(v) : null
}

export function setAtletaActivo(id: number | null) {
  if (typeof window === 'undefined') return
  if (id == null) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, String(id))
}
