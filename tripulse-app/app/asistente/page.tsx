'use client'
import AsistenteEntrenador from '@/components/AsistenteEntrenador'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'

export default function AsistentePage() {
  /* La ruta /api/asistente ya comprueba el rol, así que no había fuga; lo que
     pasaba es que sin sesión se pintaba el copiloto entero y no contestaba. */
  useRequireEntrenador()
  return <AsistenteEntrenador />
}
