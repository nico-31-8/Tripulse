// ============================================================
// Devolver una sesión al pool de unidades de la semana
// ============================================================
//
// Arrastrar una unidad del pool a un día crea una sesión y saca la unidad del
// pool (`hecho: true`). Hasta ahora eso era de ida y sin vuelta: si te
// equivocabas de día o de unidad, la sesión se borraba a la papelera y el chip
// se quedaba marcado como hecho para siempre. La unidad desaparecía del plan de
// la semana sin estar en ningún sitio: ni en el pool ni en un día.
//
// Esto es la vuelta.
//
// EL PROBLEMA DE VERDAD ERA SABER QUÉ CHIP HIZO QUÉ SESIÓN
// No se guardaba en ningún lado. Ahora sí: al crear la sesión, cada chip que la
// formó se queda con su `id_sesion`. Con eso la vuelta es exacta —se des-marcan
// esos chips y ya está, con su grupo y sus bloques de brick intactos.
//
// Pero las sesiones colocadas ANTES de este cambio no tienen ese enlace, y las
// creadas a mano con «+ Sesión» tampoco lo tendrán nunca. Para esas se busca por
// parecido: un chip hecho de esta semana, misma disciplina y misma zona, que no
// esté ya enlazado a otra sesión. Y si tampoco aparece, se crea uno nuevo.
//
// Se busca antes de crear a propósito. Al revés saldrían dos chips para la misma
// unidad: el viejo marcado con su ✓ en el canvas —diciendo «ya programada»,
// que ya sería mentira— y el nuevo al lado.

import type { ChipZona } from './chips'

export interface SesionQueVuelve {
  id: number
  disciplina: string
  /** Las zonas de sus bloques, o la de fuerza simple. En orden. */
  zonas: string[]
}

/** Los chips que se crearon a partir de esta sesión, si se sabe. */
export function chipsEnlazados(chips: ChipZona[], idSesion: number): ChipZona[] {
  return chips.filter(z => z.id_sesion === idSesion)
}

/**
 * Qué se pierde al devolver una sesión que NO salió del pool.
 *
 * Un chip solo sabe de una zona y un deporte. Todo lo demás que llevara la
 * sesión encima no cabe, así que se dice antes en vez de descubrirlo después.
 */
export function loQueSePierde(s: { duracion_minutos?: number | null; notas_entrenador?: string | null }): string[] {
  const perdido: string[] = []
  if (s.duracion_minutos) perdido.push('la duración (' + s.duracion_minutos + ' min)')
  if ((s.notas_entrenador || '').trim()) perdido.push('las notas')
  return perdido
}

/**
 * El array de chips tal y como queda tras devolver la sesión al pool.
 *
 * No toca la base: devuelve el array nuevo y quien llama lo persiste.
 */
export function devolverAlPool(chips: ChipZona[], sesion: SesionQueVuelve, semana: number): ChipZona[] {
  const enlazados = chipsEnlazados(chips, sesion.id)

  // Camino bueno: la sesión salió del pool y sabemos de qué chips.
  if (enlazados.length) {
    return chips.map(z => z.id_sesion === sesion.id ? { ...z, hecho: false, id_sesion: undefined } : z)
  }

  // Camino de rescate: buscar un chip hecho que encaje por cada zona.
  const salida = [...chips]
  const yaUsados = new Set<string>()
  const nuevos: ChipZona[] = []

  /* Una sesión de varias zonas era UNA unidad compleja, no tres sueltas. Si
     vuelve deshecha en tres chips, el entrenador tiene que volver a
     seleccionarlos y fusionarlos para dejarlo como estaba. El grupo sale del id
     de la sesión y no de un aleatorio para que la misma vuelta dé siempre lo
     mismo, que es lo que hace que se pueda probar. */
    const grupo = sesion.zonas.length > 1 ? 'gv' + sesion.id : undefined

  sesion.zonas.forEach((zona, i) => {
    const iEncaje = salida.findIndex(z =>
      z.hecho && z.id_sesion === undefined && z.semana === semana &&
      z.disciplina === sesion.disciplina && z.zona === zona && !yaUsados.has(z.id))

    if (iEncaje >= 0) {
      yaUsados.add(salida[iEncaje].id)
      salida[iEncaje] = { ...salida[iEncaje], hecho: false, grupo }
      return
    }
    // Nada que rescatar: se inventa el chip a partir de la sesión.
    nuevos.push({
      id: 'v' + sesion.id + '-' + i,
      semana,
      disciplina: sesion.disciplina,
      zona,
      hecho: false,
      grupo,
    })
  })

  return [...salida, ...nuevos]
}
