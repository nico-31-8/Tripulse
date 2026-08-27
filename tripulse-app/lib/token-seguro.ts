// ============================================================
// TRIPULSE — Tokens que no se pueden adivinar
// ============================================================
//
// El enlace de invitación de un deportista se generaba así:
//
//   Math.random().toString(36).substring(2) + Date.now().toString(36)
//
// Dos problemas, y el segundo es peor que el primero:
//
// · `Math.random()` NO es criptográfico. En V8 es un xorshift128+ cuyo estado
//   interno se puede reconstruir observando unas pocas salidas. Quien tenga dos
//   o tres enlaces puede calcular los siguientes.
//
// · `Date.now()` no es aleatorio EN ABSOLUTO: es la hora. Si sabes más o menos
//   cuándo se generó un enlace, esa mitad del token la tienes casi entera.
//
// Y ese token da de alta a alguien como deportista de un entrenador, o sea una
// cuenta real dentro de la app. Es exactamente el sitio donde no se improvisa.
//
// NO HAY VUELTA ATRÁS A Math.random.
// Si `crypto` no estuviera, esto revienta a propósito. Un generador débil de
// repuesto sería peor que un fallo: el fallo se ve y se arregla; el token débil
// se queda ahí funcionando y nadie se entera.

/** Alfabeto sin caracteres que se confunden al leerlos o dictarlos. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/**
 * Un token imposible de adivinar, apto para URLs.
 *
 * 32 caracteres de este alfabeto son ~190 bits. Para comparar: el de antes
 * rondaba los 50 bits contando generosamente, y la mitad eran la hora.
 */
export function tokenSeguro(largo = 32): string {
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined

  if (!c?.getRandomValues) {
    throw new Error('Este navegador no tiene generador criptográfico y no se va a inventar uno más débil.')
  }

  const bytes = new Uint8Array(largo)
  c.getRandomValues(bytes)

  /* El sesgo de módulo aquí es despreciable: 256 entre 55 deja un resto que
     hace unos caracteres un pelo más probables que otros. Con 32 posiciones eso
     no mueve la aguja de 190 bits. Lo que importaba era la fuente, no el
     reparto. */
  let salida = ''
  for (const b of bytes) salida += ALFABETO[b % ALFABETO.length]
  return salida
}
