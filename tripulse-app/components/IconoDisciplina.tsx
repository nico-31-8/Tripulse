// ============================================================
// El dibujo de cada deporte
// ============================================================
// Para sitios diminutos, como los chips del lienzo de periodización: ahí un
// chip mide 13 píxeles de alto y la abreviatura («Car», «Fue») se lee peor que
// una silueta.
//
// POR QUÉ NO EL EMOJI DEL CATÁLOGO. `emojiDisciplina` (lib/disciplinas) sigue
// siendo lo que se usa en un texto —«🏃 Carrera»— y no se toca. Pero un emoji
// lo dibuja el sistema: a 13 píxeles sale borroso, cada móvil pinta el suyo y
// no se le puede dar el color del deporte. Esto es un SVG de trazo que hereda
// el color y se lee igual de pequeño.
//
// El color y la etiqueta salen del catálogo, que sigue mandando: aquí solo
// vive la forma.

import { normalizar, colorDisciplina, etiquetaDisciplina } from '@/lib/disciplinas'

/* Trazos a 13×13. Nada de relleno salvo el rayo y la cabeza del corredor:
   a este tamaño una silueta rellena se convierte en una mancha. */
const FORMAS: Record<string, React.ReactElement> = {
  Natacion: (
    <>
      <path d="M1 8.6c1.4 0 1.4-1.4 2.8-1.4S5.2 8.6 6.6 8.6 8 7.2 9.4 7.2s1.4 1.4 2.8 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1 5.2c1.4 0 1.4-1.4 2.8-1.4S5.2 5.2 6.6 5.2 8 3.8 9.4 3.8s1.4 1.4 2.8 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  Ciclismo: (
    <>
      <circle cx="3" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 9 6 4h3l2 5M6 4h2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  Carrera: (
    <>
      <circle cx="8.6" cy="2.4" r="1.5" fill="currentColor" />
      <path d="M9.4 5 6.6 6.6 5.4 9.4M9.4 5l1.8 2.2.6 2.6M9.4 5 7 11.6M2.6 6.2l2.2-1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  Fuerza: (
    <path d="M1.6 4.4v4.2M3.8 3.2v6.6M10.2 3.2v6.6M12.4 4.4v4.2M3.8 6.5h6.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  ),
  /* Dos flechas cruzadas: un brick es justo eso, pasar de un deporte al otro. */
  Brick: (
    <path d="M1.6 4.4h8.2M7.6 2.2l2.4 2.2-2.4 2.2M12.4 9.2H4.2M6.4 7l-2.4 2.2L6.4 11.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  /* El rayo, que ya es el emoji del híbrido en el catálogo. */
  Hibrido: (
    <path d="M8.4 1 3.4 7.6h3.4L5.6 12l5.2-6.8H7.4z" fill="currentColor" />
  ),
}

export default function IconoDisciplina({
  disciplina, tam = 13, color, className,
}: {
  disciplina: string | null | undefined
  tam?: number
  /** Por defecto, el del catálogo. */
  color?: string
  className?: string
}) {
  const forma = FORMAS[normalizar(disciplina)]
  /* Una disciplina sin dibujo no pinta un hueco raro: no pinta nada, y el chip
     se queda como estaba. */
  if (!forma) return null
  return (
    <svg width={tam} height={tam} viewBox="0 0 13 13" className={className}
      style={{ color: color || colorDisciplina(disciplina), flex: '0 0 auto', display: 'block' }}
      role="img" aria-label={etiquetaDisciplina(disciplina)}>
      {forma}
    </svg>
  )
}
