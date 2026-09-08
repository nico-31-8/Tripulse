import { describe, it, expect } from 'vitest'
import { nivelDeRpe, RPE_ZONA_CLASICA, cargaZona, ZONAS_RESISTENCIA } from './zonas'
import { ZONAS_UI } from './referencia-zona'

/*
  EL FALLO QUE ARREGLA ESTO. El nivel 1–7 de una zona salía del punto medio más
  cercano de [2,5 · 4,5 · 6,5 · 7,5 · 8,5 · 9,5 · 10]. Esos puntos no están
  repartidos —abajo saltan de 2 en 2 y arriba de 1 en 1—, así que entre Z2
  (RPE 4–5) y Z3 (RPE 6–7) quedaba un hueco, y lo que caía dentro se iba hacia
  abajo por el desempate.

  AEL tiene RPE 3–4 → 3,5, que caía en el hueco entre Z1 y Z2: el rodaje suave
  contaba como RECUPERACIÓN. Ya estaba apuntado en lib/duracion.ts, donde se
  rodeó esta función en lugar de arreglarla.

  El nivel no es decorativo: de él salen la altura de la barra del dibujo, la
  duración estimada y qué chip gana en un día con dos sesiones.
*/

describe('cada RPE cae en una zona, sin huecos ni empates', () => {
  it('el punto medio de cada rango da su propia zona', () => {
    RPE_ZONA_CLASICA.forEach(([suelo, techo], i) => {
      expect(nivelDeRpe((suelo + techo) / 2), 'medio de Z' + (i + 1)).toBe(i + 1)
    })
  })

  it('el techo de cada zona es suyo, salvo el de la penúltima', () => {
    RPE_ZONA_CLASICA.forEach(([, techo], i) => {
      // El techo de Z6 es 10, y ese 10 es de Z7 — ver el test de abajo.
      if (i === RPE_ZONA_CLASICA.length - 2) return
      expect(nivelDeRpe(techo), 'techo de Z' + (i + 1)).toBe(i + 1)
    })
  })

  it('EN UNA FRONTERA COMPARTIDA gana la zona de abajo', () => {
    /* Los rangos se tocan: Z3 es 6–7 y Z4 empieza en 7. Un 7 es a la vez el
       techo del tempo y el suelo del umbral, y no hay respuesta «correcta»: hay
       que elegir una y que sea siempre la misma. Se queda con la de abajo, que
       es lo que hacía la regla vieja — así este arreglo no mueve nada que no
       tenga que mover. */
    expect(nivelDeRpe(7)).toBe(3)   // Z3 6–7 vs Z4 7–8
    expect(nivelDeRpe(9)).toBe(5)   // Z5 8–9 vs Z6 9–10
  })

  it('…salvo cuando eso dejaría una zona sin ningún valor posible', () => {
    /* Z7 va de 10 a 10: un solo punto. Si ese 10 se lo quedara Z6 —que es lo que
       diría la regla de arriba— Z7 no ocurriría JAMÁS, y el sprint máximo
       contaría como anaeróbico. La excepción se comprueba aquí para que nadie
       «arregle» la inconsistencia sin darse cuenta de lo que rompe. */
    expect(nivelDeRpe(10)).toBe(7)
    const [suelo, techo] = RPE_ZONA_CLASICA[RPE_ZONA_CLASICA.length - 1]
    expect(suelo, 'Z7 sigue siendo un punto único').toBe(techo)
  })

  it('ningún RPE de 0 a 12 se queda sin zona, y siempre es 1–7', () => {
    for (let r = 0; r <= 120; r++) {
      const n = nivelDeRpe(r / 10)
      expect(n, 'RPE ' + r / 10).toBeGreaterThanOrEqual(1)
      expect(n, 'RPE ' + r / 10).toBeLessThanOrEqual(7)
    }
  })

  it('nunca baja al subir el RPE', () => {
    let previo = 0
    for (let r = 0; r <= 120; r++) {
      const n = nivelDeRpe(r / 10)
      expect(n, 'RPE ' + r / 10).toBeGreaterThanOrEqual(previo)
      previo = n
    }
  })

  it('LOS DOS HUECOS, que son los que cambian', () => {
    // Entre Z1 (…3) y Z2 (4…): 3,5 empataba y ganaba Z1.
    expect(nivelDeRpe(3.5)).toBe(2)
    // Entre Z2 (…5) y Z3 (6…): 5,5 empataba y ganaba Z2 — un tempo como aeróbico.
    expect(nivelDeRpe(5.5)).toBe(3)
  })

  it('el techo de arriba: RPE 10 es neuromuscular, no anaeróbico', () => {
    // El último tramo va de 10 a 10, así que no tiene techo por el que entrar.
    // Sin tratarlo aparte, un 10 cabía en el techo de Z6 y el sprint bajaba.
    expect(nivelDeRpe(9.9)).toBe(6)
    expect(nivelDeRpe(10)).toBe(7)
    expect(nivelDeRpe(11)).toBe(7)
  })
})

describe('qué se mueve de lo que ya existe', () => {
  const nivelViejo = (rpe: number) => {
    const medios = RPE_ZONA_CLASICA.map(([a, b]) => (a + b) / 2)
    let best = 0, bestD = Infinity
    medios.forEach((r, i) => { const d = Math.abs(r - rpe); if (d < bestD) { bestD = d; best = i } })
    return best + 1
  }

  it('SOLO SE MUEVE AEL, y se mueve porque estaba mal', () => {
    const movidas = ZONAS_RESISTENCIA
      .map(z => ({ sigla: z.sigla, rpe: (z.rpeMin + z.rpeMax) / 2 }))
      .filter(z => nivelViejo(z.rpe) !== nivelDeRpe(z.rpe))
      .map(z => z.sigla)
    expect(movidas).toEqual(['AEL'])
  })

  it('AEL pasa de Recuperación a Aeróbica', () => {
    expect(cargaZona('AEL').nivel).toBe(2)
    expect(cargaZona('AEL').nombre).toBe('Aeróbico lipolítico')
  })

  it('las Z1–Z7 clásicas no se mueven: ahí el nivel sale del número, no del RPE', () => {
    for (let n = 1; n <= 7; n++) expect(cargaZona('Z' + n).nivel).toBe(n)
  })

  it('LA CARGA NO SE TOCA: sale del RPE, no del nivel', () => {
    // Es lo que hay que poder decirle al entrenador: las barras y las duraciones
    // estimadas se mueven, los UA de sus sesiones no.
    expect(cargaZona('AEL').rpe).toBe(3.5)
    ZONAS_RESISTENCIA.forEach(z => {
      expect(cargaZona(z.sigla).rpe, z.sigla).toBe((z.rpeMin + z.rpeMax) / 2)
    })
  })
})

describe('los rangos no se separan de los de referencia-zona', () => {
  it('RPE_ZONA_CLASICA dice lo mismo que ZONAS_UI', () => {
    // Están en dos ficheros para no crear una dependencia circular. Este test es
    // lo único que impide que se separen y empiecen a contar distinto.
    expect(RPE_ZONA_CLASICA).toEqual(ZONAS_UI.map(z => z.rpe))
  })
})
