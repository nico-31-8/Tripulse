'use client'
// ============================================================
// Elegir un grupo muscular
// ============================================================
// El desplegable de siempre, pero partido en familias (lib/familias-grupo):
// «Tren inferior», «Tren superior», «Core y tronco»… Con 22 grupos, la lista
// alfabética obligaba a recorrerla entera con la rueda para encontrar uno.
//
// Es un <optgroup> nativo a propósito: las cabeceras las pinta el navegador,
// no se pueden elegir, las flechas las saltan, y el móvil las enseña en su
// rueda. Un desplegable propio no haría nada de eso gratis. Para cuando no
// sabes en qué grupo está archivado algo sigue estando la lupa
// (components/BuscadorEjercicios), que busca por nombre y descripción.
//
// LO QUE SE ELIGE ES EL GRUPO, NO LA FAMILIA. El valor que sale de aquí es la
// cadena de siempre —«Cuádriceps»—, que es la que se guarda y la que cuenta en
// el reparto de series por grupo. La familia solo parte la lista.

import { porFamilias } from '@/lib/familias-grupo'
import { gruposExistentes } from '@/lib/ejercicio-propio'

export default function SelectorGrupo({
  ejercicios, valor, onCambio, className, vacio = 'Grupo muscular', title, disabled,
}: {
  /** La biblioteca que ya tiene cargada quien llama: de ahí salen los grupos. */
  ejercicios: { grupo_muscular?: string | null }[]
  valor: string
  onCambio: (grupo: string) => void
  className?: string
  /** Lo que dice la opción en blanco: «Grupo muscular», «Sin fijar»… */
  vacio?: string
  title?: string
  disabled?: boolean
}) {
  /* Si lo elegido no está en la biblioteca —porque el ejercicio se borró, o
     porque la fila venía de antes— se añade igualmente: si no, el desplegable
     saldría en blanco y el siguiente clic en cualquier otro campo borraría un
     grupo que nadie quiso tocar. */
  const grupos = gruposExistentes(ejercicios)
  const hay = valor && !grupos.some(g => g === valor) ? [...grupos, valor] : grupos

  return (
    <select value={valor} onChange={e => onCambio(e.target.value)}
      className={className} title={title} disabled={disabled}>
      <option value="">{vacio}</option>
      {porFamilias(hay).map(f => (
        <optgroup key={f.id} label={f.etiqueta}>
          {f.grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
