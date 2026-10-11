'use client'
// ============================================================
// La etiqueta «cambiada por Pedro» de una sesión
// ============================================================
// Sale en cualquier sitio donde se pinte una sesión que haya cambiado un
// director. Turquesa, como todo lo de la dirección. No sale si nadie de la
// dirección la ha tocado (cambiada_por vacío), que es el caso de casi todas.
import { useNombreCambiadaPor } from '@/lib/cambiada-por'

export default function EtiquetaCambiada({ por, compacta = false, className = '' }: {
  por?: string | null
  /** Para calendarios y listas apretadas: solo el icono y el nombre de pila. */
  compacta?: boolean
  className?: string
}) {
  const nombre = useNombreCambiadaPor(por)
  if (!por) return null
  const pila = (nombre || '').trim().split(' ')[0]
  const titulo = nombre ? 'Cambiada por ' + nombre + ', desde la dirección' : 'Cambiada desde la dirección'
  return (
    <span title={titulo}
      className={'inline-flex items-center gap-1 rounded-full bg-teal-500/15 text-teal-200 border border-teal-400/30 font-semibold whitespace-nowrap '
        + (compacta ? 'text-[9.5px] px-1.5 py-px ' : 'text-[11px] px-2 py-0.5 ')
        + className}>
      <span aria-hidden>✎</span>
      {compacta ? (pila || 'dirección') : (pila ? 'cambiada por ' + pila : 'cambiada por la dirección')}
    </span>
  )
}
