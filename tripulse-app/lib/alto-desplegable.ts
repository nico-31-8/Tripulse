'use client'
// Cuánto mide de verdad lo que hay dentro de un desplegable.
//
// Los desplegables de la app (`.tp-collapse`) se abren animando `max-height`,
// porque la altura automática no se puede animar. Eso obliga a escribir un
// número, y ese número se venía poniendo a ojo: 460 px en el panel, 920 en ECO,
// 420 en la ficha del deportista.
//
// El día que el contenido crece por debajo de ese número, `overflow:hidden` se
// lo traga SIN DEJAR RASTRO: ni barra de desplazamiento, ni puntos suspensivos,
// ni nada que diga que falta algo. Pasó en el panel al pasar las herramientas a
// una sola columna en el móvil: «Tests propios» y «Zonas propias» quedaron
// fuera de los 460 px y dejaron de existir.
//
// Así que en vez de adivinar el alto, se mide. Y se vuelve a medir cuando
// cambia, porque girar el teléfono cambia el número de columnas y con él el
// alto, y porque hay contenidos que crecen cuando terminan de cargar.

import { useCallback, useState } from 'react'

export function useAltoDeContenido() {
  const [alto, setAlto] = useState(0)

  /* Ref de función y no `useRef` + `useEffect`: el desplegable del panel no
     existe hasta que ha cargado el atleta activo, y un efecto que corre una
     sola vez al montar se encontraría un `null` y no volvería a mirar — el
     desplegable se quedaría abriéndose a cero, que es peor que recortar.
     Así el observador se engancha justo cuando el elemento aparece y se
     suelta cuando se va (la limpieza de los refs de función, en React 19). */
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    /* `offsetHeight` y no `scrollHeight`: incluye el padding y el borde del
       propio elemento, que es lo que hay que reservar. */
    const ro = new ResizeObserver(() => setAlto(el.offsetHeight))
    /* Dispara una primera vez nada más empezar a observar: de ahí sale la
       medida inicial, sin tener que llamarlo a mano. */
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, alto }
}
