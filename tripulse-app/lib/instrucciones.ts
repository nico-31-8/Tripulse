// ============================================================
// TRIPULSE — Las instrucciones de un ejercicio, en piezas
// ============================================================
// `ejercicios_biblioteca.instrucciones` es un texto con saltos de línea. Los
// pasos vienen numerados DENTRO del propio texto («1) Zancada larga…»), así que
// quien los pinte tiene que usar una lista sin numerar: numerarla otra vez daría
// «1. 1) Zancada larga».
//
// Y la última línea de muchos ejercicios no es un paso: es el aviso de qué
// comprobar — «Si notas el estiramiento en la lumbar y no en la ingle, has
// perdido la retroversión». Colado como un paso más se lee como «y luego haz
// esto», que es lo contrario de lo que dice. Por eso sale aparte.

export interface Instrucciones {
  pasos: string[]
  aviso: string
}

export function partirInstrucciones(txt: string | null | undefined): Instrucciones {
  const lineas = String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return {
    pasos: lineas.filter(l => /^\d+\)/.test(l)),
    aviso: lineas.filter(l => !/^\d+\)/.test(l)).join(' '),
  }
}
