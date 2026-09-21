'use client'
// ============================================================
// Pitido y vibración: los dos interruptores de los tests con reloj
// ============================================================
// Estaban copiados en tres pantallas (la ficha de un atleta, la de grupo y el
// laboratorio). Ahora viven aquí, y cada pantalla solo llama a
// `avisarEscalon()` (lib/pitido), que ya mira lo que haya elegido el
// entrenador.
//
// Lo elegido se guarda en ESTE navegador: es una preferencia del móvil con el
// que se pasa el test, no del test. Hay pistas donde el pitido molesta, y una
// app que suena sin que puedas callarla se acaba dejando de usar.
import { useEffect, useState } from 'react'
import {
  pitidoEncendido, ponPitido, despertarAudio, sonarEscalon,
  vibracionEncendida, ponVibracion, puedeVibrar, vibrar,
} from '@/lib/pitido'

export default function InterruptoresAviso({ textoSonido = 'Pita al cambiar de escalón', conVibracion = true, className = '' }: {
  /** Lo que dice el botón del sonido cuando está encendido. */
  textoSonido?: string
  /** Si hay escalones: sin ellos no hay cambio que avisar vibrando. */
  conVibracion?: boolean
  className?: string
}) {
  const [suena, setSuena] = useState(true)
  const [vibra, setVibra] = useState(true)
  const [puedeVib, setPuedeVib] = useState(false)

  /* Se lee DESPUÉS de montar: en el servidor no hay localStorage ni se sabe si
     el móvil vibra, y leerlo en el render daría una cosa en el HTML y otra al
     hidratar. La regla del compilador avisa de poner estado en un efecto, y
     aquí es justo lo que toca. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuena(pitidoEncendido())
    setVibra(vibracionEncendida())
    setPuedeVib(puedeVibrar())
  }, [])

  const boton = 'text-[11.5px] text-gray-500 hover:text-gray-300 transition'

  return (
    <div className={'self-center flex items-center justify-center gap-x-4 gap-y-1 flex-wrap ' + className}>
      {/* Al encenderlo suena una vez, para saber cómo va a sonar y que el
          volumen del móvil está bien. */}
      <button type="button" className={boton}
        onClick={() => { const v = !suena; setSuena(v); ponPitido(v); if (v) { despertarAudio(); sonarEscalon() } }}
        title={suena ? 'Suena al cambiar de escalón' : 'Sin sonido'}>
        {suena ? '🔊 ' + textoSonido : '🔇 Sin sonido'}
      </button>
      {/* Solo donde el móvil sabe vibrar: en iPhone el navegador no deja, y un
          botón que no hace nada es peor que no tenerlo. */}
      {conVibracion && puedeVib && (
        <button type="button" className={boton}
          onClick={() => { const v = !vibra; setVibra(v); ponVibracion(v); if (v) vibrar() }}
          title={vibra ? 'Vibra al cambiar de escalón' : 'Sin vibración'}>
          {vibra ? '📳 Vibra al cambiar de escalón' : '📴 Sin vibración'}
        </button>
      )}
    </div>
  )
}
