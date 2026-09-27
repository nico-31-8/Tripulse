// La inicial de alguien sobre su degradado. Estaba escrito igual en tres
// pantallas (/comunicacion, /eco, /wellness-entrenador) y a trozos en otras dos.
// El color sale del nombre y vive en lib/avatar, para que la misma persona sea
// del mismo color en toda la app.
import { fondoDe, inicialDe } from '@/lib/avatar'

export default function Avatar({ nombre, size = 44, className = '' }: {
  nombre: string | null | undefined
  /** El lado, en píxeles. La letra se escala con él. */
  size?: number
  className?: string
}) {
  return (
    <span
      className={'rounded-[30%] grid place-items-center font-bold text-white flex-shrink-0 ' + className}
      style={{ width: size, height: size, fontSize: size * 0.38, background: fondoDe(nombre) }}>
      {inicialDe(nombre)}
    </span>
  )
}
