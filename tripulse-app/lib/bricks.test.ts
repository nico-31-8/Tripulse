import { describe, it, expect } from 'vitest'
import { queFaltaAlBrick, brickValido, type BrickValor } from './bricks'

// ============================================================
// Qué le falta al brick, dicho una sola vez
// ============================================================
// La frase estaba escrita a mano en SEIS sitios —el constructor y los cinco
// modales que lo llevan dentro— y decía solo la mitad: «un brick necesita al
// menos dos bloques con duración». Con dos bloques y uno sin minutos, el aviso
// hablaba de BLOQUES cuando lo que faltaba eran los MINUTOS, y el entrenador se
// quedaba mirando el bloque que sí los tenía.
describe('queFaltaAlBrick', () => {
  const bloque = (disciplina: string, minutos: number) => ({ disciplina, minutos, zona: 'AER' } as any)
  const brick = (...bloques: any[]) => ({ bloques, transiciones: [] } as unknown as BrickValor)

  it('con un solo bloque pide otra disciplina', () => {
    expect(queFaltaAlBrick(brick(bloque('Ciclismo', 40)))).toMatch(/otra disciplina/)
    expect(queFaltaAlBrick(brick())).toMatch(/otra disciplina/)
  })

  it('con dos bloques y uno sin minutos habla de MINUTOS, no de bloques', () => {
    const falta = queFaltaAlBrick(brick(bloque('Ciclismo', 40), bloque('Carrera', 0))) || ''
    expect(falta).toMatch(/minutos/)
    expect(falta).not.toMatch(/disciplina/)
  })

  it('dice cuántos están sin minutos cuando es más de uno', () => {
    expect(queFaltaAlBrick(brick(bloque('Ciclismo', 0), bloque('Carrera', 0)))).toMatch(/2 bloques/)
  })

  it('un brick completo no le falta nada', () => {
    expect(queFaltaAlBrick(brick(bloque('Ciclismo', 40), bloque('Carrera', 20)))).toBeNull()
  })

  /* La única verdad: si `brickValido` y `queFaltaAlBrick` discreparan, el
     constructor enseñaría un aviso con el guardar activo, o al revés. */
  it('brickValido dice exactamente lo mismo', () => {
    const casos = [
      brick(),
      brick(bloque('Ciclismo', 40)),
      brick(bloque('Ciclismo', 40), bloque('Carrera', 0)),
      brick(bloque('Ciclismo', 40), bloque('Carrera', 20)),
      brick(bloque('', 40), bloque('Carrera', 20)),
    ]
    for (const c of casos) expect(brickValido(c)).toBe(queFaltaAlBrick(c) === null)
  })

  it('no revienta con un valor a medio hacer', () => {
    expect(queFaltaAlBrick({} as BrickValor)).toMatch(/otra disciplina/)
    expect(brickValido({} as BrickValor)).toBe(false)
  })
})
