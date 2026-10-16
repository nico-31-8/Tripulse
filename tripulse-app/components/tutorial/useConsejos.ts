'use client'
// Para las pantallas: «estos son mis consejos de ahora» (null mientras cargan).
// El proveedor decide si sale alguno, cuál y cuándo (lib/consejos).
//
// Una pantalla solo los calcula si `useTutorial()?.consejosActivos`: a quien
// no le salen, no le cuesta ni una consulta.

import { useEffect, useRef } from 'react'
import { claveConsejo, type Consejo, type ZonaConConsejos } from '@/lib/consejos'
import { useTutorial } from './TutorialProvider'

export function useConsejos(zona: ZonaConConsejos, lista: Consejo[] | null, acciones?: Record<string, () => void>) {
  const t = useTutorial()
  const poner = t?.ponerConsejos
  const quitar = t?.quitarConsejos
  const ultima = useRef(lista)
  const accionesRef = useRef(acciones)
  useEffect(() => { ultima.current = lista; accionesRef.current = acciones })
  /* Se vuelven a pasar solo si cambia lo que dicen, no en cada pintado. */
  const huella = lista ? lista.map(c => claveConsejo(c) + '|' + c.titulo + '|' + c.texto + '|' + c.anclas.join(',')).join('#') : null
  useEffect(() => {
    if (!poner || !quitar) return
    if (huella == null || !ultima.current) { quitar(zona); return }
    poner({ zona, lista: ultima.current, acciones: accionesRef })
    return () => quitar(zona)
  }, [poner, quitar, zona, huella])
}
