'use client'
// Si la pantalla es estrecha, para las veces que no basta con CSS.
//
// Casi todo lo del móvil se resuelve con `sm:` de Tailwind y no hace falta esto.
// Hace falta cuando lo que cambia no es el aspecto sino el COMPORTAMIENTO: en el
// calendario, tocar un día abre cosas distintas según quepa o no la lista de
// sesiones dentro de la casilla.
//
// El corte es el `sm` de Tailwind (640 px) para que la decisión de JavaScript y
// la del CSS no puedan discrepar: si una dijera «móvil» y la otra «escritorio»,
// tocar un día abriría lo que no toca en la franja de en medio.

import { useEffect, useState } from 'react'

/** El `sm` de Tailwind. Si algún día se cambia allí, se cambia aquí. */
export const CORTE_MOVIL = 639

export function useEsMovil(): boolean {
  /* Arranca en `false` a propósito: en el servidor no hay pantalla, y es la
     rama que menos daño hace si por un instante se acierta mal —abrir el modal
     de crear— frente a bloquear un camino que sí existe. */
  const [esMovil, setEsMovil] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: ' + CORTE_MOVIL + 'px)')
    const mirar = () => setEsMovil(mq.matches)
    mirar()
    /* Se escucha el cambio porque girar el teléfono cruza el corte, y con él
       cambia lo que hace tocar un día. */
    mq.addEventListener('change', mirar)
    return () => mq.removeEventListener('change', mirar)
  }, [])

  return esMovil
}
