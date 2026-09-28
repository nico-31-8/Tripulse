// ============================================================
// Qué se puede hacer con una unidad del pool de la semana
// ============================================================
//
// Las dos preguntas que se hacía la semana con un `alert()` al final del
// manejador: «¿puedo fusionar estas zonas?» y «¿cabe esta unidad en un día?».
//
// ESTÁN AQUÍ PORQUE LAS MIRAN DOS. La pantalla las pregunta MIENTRAS arrastras
// o seleccionas —para poner en rojo el sitio que no puede recibirlo y apagar el
// botón que no va a funcionar— y las vuelve a preguntar al soltar o al pulsar,
// como red. Si cada sitio tuviera su copia, el botón acabaría encendido con el
// aviso puesto, o al revés. Es el mismo trato que `queFaltaAlBrick`.
//
// Las dos devuelven null cuando SÍ se puede, y si no, la frase exacta que hay
// que enseñar. Nadie escribe esas frases en otro sitio.

import type { ChipZona } from './chips'

/**
 * Por qué NO se pueden fusionar estas zonas en una unidad compleja.
 *
 * Con menos de dos seleccionadas no hay nada que decir todavía: el botón está
 * apagado y punto. Un aviso ahí sería regañar por ir a medias.
 *
 * EL ORDEN IMPORTA, y no es el que había. Antes se miraba primero la
 * disciplina, así que al seleccionar un brick y un ciclismo te decía «solo se
 * pueden fusionar zonas de la misma disciplina» — verdad, pero te mandaba a
 * buscar otro brick, que tampoco habría valido. El brick manda: un brick ya ES
 * una unidad de varios bloques, y fusionarlo rompería la atribución (acabaría
 * con tareas de disciplina 'Brick', sin deporte al que apuntar el volumen).
 */
export function porQueNoSeFusiona(sel: ChipZona[]): string | null {
  if (sel.length < 2) return null
  if (sel.some(z => z.disciplina === 'Brick'))
    return 'Un brick ya es una unidad: edítalo desde el Dibujo para cambiar sus bloques.'
  if (!sel.every(z => z.disciplina === sel[0].disciplina))
    return 'Solo se pueden fusionar zonas de la misma disciplina.'
  return null
}

/** ¿Se pueden fusionar? La misma verdad, dicha en un booleano. */
export const sePuedeFusionar = (sel: ChipZona[]): boolean =>
  sel.length >= 2 && porQueNoSeFusiona(sel) === null

/**
 * Por qué NO cabe esta unidad en un día.
 *
 * Un brick se arrastra solo: agrupado con otras zonas, el camino normal crearía
 * tareas con disciplina 'Brick' y su volumen se quedaría sin atribuir a ningún
 * deporte.
 *
 * Y DICE CUÁL DE LAS DOS COSAS PASA. La comprobación de antes rechazaba con «un
 * brick se arrastra solo» también al chip de brick que venía SIN bloques —que
 * iba solo, así que el aviso mandaba a deshacer un grupo que no existía—.
 */
export function porQueNoCabeEnUnDia(unidad: ChipZona[]): string | null {
  const bricks = unidad.filter(c => c.disciplina === 'Brick')
  if (!bricks.length) return null
  if (unidad.length > 1)
    return 'Un brick se arrastra solo, no agrupado con otras zonas.'
  if (!bricks[0].brick?.bloques?.length)
    return 'Este brick no lleva bloques dentro, así que no hay nada que programar. Móntalo otra vez desde el Dibujo.'
  return null
}
