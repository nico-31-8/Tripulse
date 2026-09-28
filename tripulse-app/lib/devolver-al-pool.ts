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
import { fechaLarga } from './fechas'
/* `zonasDeSesion` vive en chips-desde-sesiones y no importa nada de aquí: no hay ciclo. */
import { zonasDeSesion } from './chips-desde-sesiones'

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

/**
 * Los chips que se van CON la sesión cuando se borra de verdad.
 *
 * BORRAR Y DEVOLVER AL POOL SON DOS COSAS, y la pantalla ya tenía dos gestos
 * para ellas: arrastrar la sesión arriba la deshace —la unidad vuelve al pool—
 * y la equis la borra. Lo que pasaba es que las dos hacían lo mismo: la equis
 * también devolvía la unidad arriba, así que no había forma de quitar de en
 * medio algo planificado por error. Volvía siempre.
 *
 * Aquí la unidad se va con su sesión. Si lo que quieres es conservarla para
 * otro día, el gesto es el otro.
 *
 * Los chips que NO son de esta sesión se quedan intactos, incluidos los que
 * estén sin programar: esos no los ha tocado nadie.
 */
export function borrarConSuChip(chips: ChipZona[], idSesion: number): ChipZona[] {
  return (chips || []).filter(z => z.id_sesion !== idSesion)
}

export interface QueSeQuita {
  /** La sesión que hay que mandar a la papelera, o null si el chip va solo. */
  idSesion: number | null
  /** Lo que hay que preguntar antes, o null si no hay nada que preguntar. */
  pregunta: string | null
}

/**
 * Quitar un chip del lienzo de periodización: qué se lleva por delante.
 *
 * Un chip SUELTO se va y ya está: no existe en ninguna otra tabla.
 *
 * Uno COLOCADO es una sesión del calendario, y el lienzo rehace los colocados
 * desde el calendario cada vez que se abre (lib/chips-desde-sesiones). O sea
 * que quitarlo de la lista no quitaba nada: volvía solo a la siguiente visita y
 * el clic derecho quedaba mintiendo. Por eso arrastra su sesión a la papelera,
 * que es de donde se recupera si era un error.
 *
 * Se pregunta siempre antes, y si la sesión ya está hecha se dice: ahí no se va
 * un hueco del plan, se van los datos de lo que el atleta hizo.
 */
export function alQuitarChip(
  chip: ChipZona,
  sesion?: { fecha_sesion?: string | null; disciplina?: string | null; estado?: string | null } | null,
): QueSeQuita {
  if (!chip?.hecho || !chip.id_sesion) return { idSesion: null, pregunta: null }
  const que = (chip.disciplina || sesion?.disciplina || '').trim()
  const cuando = fechaLarga(String(sesion?.fecha_sesion || '').slice(0, 10) || null)
  const hecha = (sesion?.estado || '') === 'Realizada'
  return {
    idSesion: chip.id_sesion,
    pregunta: 'Esto ya es una sesión' + (que ? ' de ' + que.toLowerCase() : '') +
      (cuando ? ' del calendario (' + cuando.toLowerCase() + ')' : ' del calendario') + '.' +
      (hecha ? ' Y está marcada como realizada: se va con los datos de lo que hizo.' : '') +
      '\n\nSe manda a la papelera y desde ahí se puede recuperar. ¿La borro?',
  }
}

/**
 * Borrar unidades DEL POOL, sin colocar: se van de la semana y del dibujo de
 * periodización, que son el mismo array (`dibujo_borrador.sesiones_zonas`).
 *
 * Solo toca chips sin colocar. Un chip que ya es una sesión no está en el pool
 * y no se borra por aquí aunque su id llegue en la lista: quitarlo dejaría la
 * sesión en el calendario sin su chip. Esas se borran con la x de su tarjeta,
 * que se lleva el chip con ella (borrarConSuChip).
 */
export function borrarDelPool(chips: ChipZona[], ids: string[]): ChipZona[] {
  const fuera = new Set(ids)
  return (chips || []).filter(z => !(fuera.has(z.id) && !z.hecho))
}

/** Una sesión compleja entera del pool: sus chips de esa semana, sin colocar. */
export function borrarUnidadDelPool(chips: ChipZona[], grupo: string, semana: number): ChipZona[] {
  return (chips || []).filter(z => !(z.grupo === grupo && z.semana === semana && !z.hecho))
}

/**
 * Por qué NO puede volver esta sesión al pool, dicho antes de soltarla.
 *
 * ESTO ESTABA ESCRITO DENTRO DEL MANEJADOR DEL SOLTAR, en cinco `alert()`
 * seguidos, y por eso solo se enteraba uno DESPUÉS de arrastrar media pantalla.
 * Ninguna de las cinco razones necesita el soltar para saberse: todas se saben
 * en cuanto coges la sesión —o incluso al abrir la semana, las dos primeras—.
 * Sacándolas aquí, la tarjeta del pool puede decir que no MIENTRAS arrastras,
 * que es la diferencia entre contar un error y no dejar que ocurra.
 *
 * Las dos primeras comprobaciones, además, son las que evitan destruir trabajo:
 * el pool vive en `dibujo_borrador` y `persistirZonas` no escribe si no hay
 * fila, así que sin ellas soltar aquí mandaba la sesión a la papelera y la
 * unidad no volvía a ninguna parte.
 *
 * Devuelve null si puede volver. Que pueda no quiere decir que sea gratis: si
 * no salió del pool se pierden la duración y las notas, y eso se PREGUNTA
 * aparte (loQueSePierde), porque ahí sí hay que decidir.
 */
export function porQueNoVuelveAlPool(
  s: { id: number; disciplina?: string | null; estado?: string | null; _bloques?: { zona: string }[] | null;
       zona_fuerza?: string | null; zona_resistencia?: string | null },
  pool: { weekIndex: number | null; borradorId: number | null },
  chips: ChipZona[],
): string | null {
  if (pool.weekIndex === null)
    return 'Este deportista no tiene macrociclo, así que esta semana no cae en ningún plan y no hay pool al que devolverla.'
  if (!pool.borradorId)
    return 'No hay lienzo de periodización para este deportista, que es donde vive el pool. Bórrala con la × si no la quieres aquí.'
  if (s.estado === 'Realizada')
    return 'Esta sesión ya está realizada. Si quieres quitarla del calendario, bórrala con la ×.'
  /* Un brick sin enlace no puede volver. El rescate por parecido reconstruye
     chips a partir de las zonas, y un brick no cabe en un par zona+deporte: sus
     bloques y sus transiciones no están en ninguna zona. Volvería roto. */
  if (s.disciplina === 'Brick' && !chipsEnlazados(chips, s.id).length)
    return 'Este brick no salió del pool, así que no hay bloques que devolver. Bórralo con la × y móntalo de nuevo desde el Dibujo.'
  if (!zonasQueVuelven(s).length)
    return 'Esta sesión no tiene ninguna zona, así que no hay unidad que devolver al pool. Bórrala con la × si no la quieres.'
  return null
}

/**
 * Las zonas con las que vuelve: las de sus bloques, o la suya.
 *
 * Aquí y no en la página porque la miran DOS: el aviso de arriba, que tiene que
 * saber si hay algo que devolver antes de soltar, y la vuelta en sí. Si cada
 * uno la calculara a su manera, el aviso diría que sí y la vuelta crearía un
 * chip en blanco.
 */
export function zonasQueVuelven(
  s: { _bloques?: { zona: string }[] | null; disciplina?: string | null;
       zona_fuerza?: string | null; zona_resistencia?: string | null },
): string[] {
  if (s._bloques?.length) return s._bloques.map(b => b.zona)
  return zonasDeSesion(s)
}
