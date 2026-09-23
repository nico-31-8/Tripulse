// ============================================================
// Estirar y encoger un bloque del lienzo
// ============================================================
//
// En el lienzo de periodización se podía mover un macro o un meso entero, pero
// para cambiar su duración había que abrir su ficha y escribir el número de
// semanas. Ahora se agarra un borde y se arrastra.
//
// LA REGLA: EL BORDE SE PARA, NO ATROPELLA. Un macro no puede comerse al de al
// lado ni encoger por debajo de sus mesos; un meso no puede salirse de su macro
// ni pisar a su hermano. En vez de avisar con un diálogo, o de empujar lo que
// haya delante, el borde simplemente deja de avanzar donde empezaría a romper
// algo. Así arrastrar nunca destruye nada y no hay que deshacer.
//
// Esto es SOLO EL DIBUJO (`dibujo_borrador`). Las filas de verdad y sus
// sesiones se tocan al pulsar «Generar planificación», que ya sabe mover y
// redimensionar (ver lib/desplazar y supabase/desplazar-ciclo.sql).

export type Borde = 'ini' | 'fin'

export interface Tramo {
  /** Primera semana, 0 = la primera del lienzo. */
  si: number
  /** Última semana, incluida. */
  sf: number
}

export interface Limites {
  min: number
  max: number
}

export interface Alrededor {
  /** Los de su mismo nivel, SIN contarse a sí mismo. */
  hermanos?: Tramo[]
  /** El bloque que lo contiene: el macro de un meso. */
  dentroDe?: Tramo | null
  /** Los que van dentro de él: los mesos de un macro. */
  contiene?: Tramo[]
  /** Semanas que tiene el lienzo. */
  totalSem: number
}

/**
 * Entre qué semanas se puede mover el borde que estás arrastrando.
 *
 * Devuelve siempre un rango válido (min ≤ max): en el peor caso, el borde se
 * queda donde está.
 */
export function limitesRedimension(item: Tramo, borde: Borde, o: Alrededor): Limites {
  const hermanos = o.hermanos || []
  const contiene = o.contiene || []
  const ultima = Math.max(0, (o.totalSem || 1) - 1)

  if (borde === 'ini') {
    /* Hacia atrás, hasta el hermano que acabe justo antes (o el principio de su
       macro, o el del lienzo). Hacia delante, sin comerse a su primer hijo. */
    const traseros = hermanos.filter(h => h.sf < item.si).map(h => h.sf + 1)
    const min = Math.max(o.dentroDe?.si ?? 0, ...traseros, 0)
    const primerHijo = contiene.length ? Math.min(...contiene.map(h => h.si)) : item.sf
    const max = Math.min(item.sf, primerHijo)
    return { min: Math.min(min, max), max }
  }

  const delanteros = hermanos.filter(h => h.si > item.sf).map(h => h.si - 1)
  const max = Math.min(o.dentroDe?.sf ?? ultima, ...delanteros, ultima)
  const ultimoHijo = contiene.length ? Math.max(...contiene.map(h => h.sf)) : item.si
  const min = Math.max(item.si, ultimoHijo)
  return { min, max: Math.max(max, min) }
}

/** El tramo que queda al soltar el borde en esa semana. */
export function redimensionar(item: Tramo, borde: Borde, wi: number, lim: Limites): Tramo {
  const semana = Math.min(Math.max(Math.round(wi), lim.min), lim.max)
  return borde === 'ini' ? { ...item, si: semana } : { ...item, sf: semana }
}

/** ¿Cambia algo? Para no repintar ni guardar cuando el borde no se ha movido. */
export const mismoTramo = (a: Tramo, b: Tramo) => a.si === b.si && a.sf === b.sf
