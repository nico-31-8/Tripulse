import { describe, it, expect } from 'vitest'
import {
  estadoInicial, pulsar, parar, msDeSerie, msDeDescanso, descansoPasado,
  reloj, relojCorto, filasDe, hechas, notasDe, avisoAlSalir, conNota, type Estado,
} from './dirigir-sesion'

/* El reloj se pasa por argumento, así que se puede probar un entrenamiento
   entero sin esperar ni un segundo de verdad. */
const T0 = 1_000_000

describe('el ciclo serie → descanso → serie', () => {
  it('arranca parado y sin nada apuntado', () => {
    const e = estadoInicial(4)
    expect(e.modo).toBe('parado')
    expect(e.series).toHaveLength(4)
    expect(hechas(e.series)).toBe(0)
  })

  it('pulsar una serie la pone en marcha', () => {
    const e = pulsar(estadoInicial(4), 0, T0)
    expect(e.modo).toBe('serie')
    expect(e.indice).toBe(0)
  })

  /* Lo que hace que esto se pueda usar de pie: al parar la serie no hay que
     acordarse de arrancar nada, el descanso ya está contando. */
  it('al pararla arranca el descanso solo', () => {
    let e = pulsar(estadoInicial(4), 0, T0)
    e = pulsar(e, 0, T0 + 200_000)
    expect(e.modo).toBe('descanso')
    expect(e.series[0].ms).toBe(200_000)
    expect(e.indice).toBe(0)
  })

  it('al empezar la siguiente, el descanso se cierra y queda apuntado', () => {
    let e = pulsar(estadoInicial(4), 0, T0)
    e = pulsar(e, 0, T0 + 200_000)     // para la 1 → descanso
    e = pulsar(e, 1, T0 + 290_000)     // empieza la 2 → cierra 90 s de descanso
    expect(e.series[0].descansoMs).toBe(90_000)
    expect(e.modo).toBe('serie')
    expect(e.indice).toBe(1)
  })

  it('un entrenamiento entero encadena bien', () => {
    let e = estadoInicial(3)
    let t = T0
    for (let i = 0; i < 3; i++) {
      e = pulsar(e, i, t); t += 200_000
      e = pulsar(e, i, t); t += 90_000
    }
    e = parar(e, t)
    expect(e.series.map(s => s.ms)).toEqual([200_000, 200_000, 200_000])
    expect(e.series[0].descansoMs).toBe(90_000)
    expect(e.series[1].descansoMs).toBe(90_000)
    // El último descanso también se cierra al parar del todo.
    expect(e.series[2].descansoMs).toBe(90_000)
    expect(e.modo).toBe('parado')
  })
})

describe('empezar por donde sea', () => {
  /* El primer mil lo cronometró el atleta y el entrenador llega al segundo:
     tiene que poder arrancar ahí sin tocar el primero. */
  it('se puede empezar por una serie del medio', () => {
    const e = pulsar(estadoInicial(4), 2, T0)
    expect(e.indice).toBe(2)
    expect(e.series[0].ms).toBeNull()
    expect(e.series[1].ms).toBeNull()
  })

  it('saltar de una serie a otra sin pararla cierra la primera', () => {
    let e = pulsar(estadoInicial(4), 0, T0)
    e = pulsar(e, 2, T0 + 100_000)
    // La 0 se queda sin tiempo: no se paró, se abandonó. Mejor vacía que un
    // número que nadie midió a propósito.
    expect(e.series[0].ms).toBeNull()
    expect(e.indice).toBe(2)
  })
})

describe('rehacer una serie', () => {
  it('borra su tiempo y vuelve a empezar', () => {
    let e = pulsar(estadoInicial(4), 0, T0)
    e = pulsar(e, 0, T0 + 200_000)     // hecha
    e = pulsar(e, 1, T0 + 290_000)     // descanso cerrado
    e = pulsar(e, 0, T0 + 300_000)     // rehacer la 1
    expect(e.series[0].ms).toBeNull()
    expect(e.modo).toBe('serie')
    expect(e.indice).toBe(0)
  })

  /* Su descanso describía el hueco DESPUÉS de un tiempo que ya no existe. */
  it('y también su descanso, que colgaba de nada', () => {
    let e = pulsar(estadoInicial(4), 0, T0)
    e = pulsar(e, 0, T0 + 200_000)
    e = pulsar(e, 1, T0 + 290_000)
    expect(e.series[0].descansoMs).toBe(90_000)
    e = pulsar(e, 0, T0 + 300_000)
    expect(e.series[0].descansoMs).toBeNull()
  })
})

describe('lo que enseña el reloj', () => {
  it('la serie en marcha cuenta desde que arrancó', () => {
    const e = pulsar(estadoInicial(4), 1, T0)
    expect(msDeSerie(e, 1, T0 + 45_000)).toBe(45_000)
  })

  it('las demás enseñan lo que tengan guardado', () => {
    let e = pulsar(estadoInicial(4), 0, T0)
    e = pulsar(e, 0, T0 + 200_000)
    expect(msDeSerie(e, 0, T0 + 999_999)).toBe(200_000)
    expect(msDeSerie(e, 3, T0 + 999_999)).toBeNull()
  })

  it('el descanso en marcha también corre', () => {
    let e = pulsar(estadoInicial(4), 0, T0)
    e = pulsar(e, 0, T0 + 200_000)
    expect(msDeDescanso(e, 0, T0 + 230_000)).toBe(30_000)
  })

  it('un índice fuera de rango no revienta', () => {
    const e = estadoInicial(2)
    expect(pulsar(e, 9, T0)).toBe(e)
    expect(pulsar(e, -1, T0)).toBe(e)
  })
})

describe('descansoPasado', () => {
  it('avisa cuando se pasa del prescrito', () => {
    expect(descansoPasado(95_000, 90)).toBe(true)
    expect(descansoPasado(85_000, 90)).toBe(false)
  })
  it('sin descanso prescrito no hay nada que comparar', () => {
    expect(descansoPasado(95_000, null)).toBe(false)
    expect(descansoPasado(95_000, 0)).toBe(false)
  })
  it('sin descanso medido tampoco', () => {
    expect(descansoPasado(null, 90)).toBe(false)
  })
})

describe('formato', () => {
  it('la serie lleva décima: en 100 m de natación un segundo entero la esconde', () => {
    expect(reloj(212_400)).toBe('3:32.4')
    expect(reloj(59_900)).toBe('0:59.9')
    expect(reloj(null)).toBe('—:——')
  })
  it('el descanso se lee en segundos', () => {
    expect(relojCorto(90_000)).toBe('1:30')
    expect(relojCorto(45_000)).toBe('45 s')
    expect(relojCorto(null)).toBe('—')
  })
})

describe('filasDe — lo que se guarda', () => {
  const conDatos = (): Estado => {
    let e = estadoInicial(3)
    let t = T0
    e = pulsar(e, 0, t); t += 200_000
    e = pulsar(e, 0, t); t += 90_000
    e = pulsar(e, 1, t); t += 205_000
    e = parar(e, t)
    return e
  }

  it('una fila por serie cronometrada', () => {
    expect(filasDe(conDatos().series, 7)).toHaveLength(2)
  })

  /* Una serie sin cronometrar no es una de cero segundos: es una de la que no
     se sabe nada. Guardarla haría que cualquier media contara un cero. */
  it('las que no se cronometraron no se guardan', () => {
    expect(filasDe(conDatos().series, 7).some(f => f.numero_serie === 3)).toBe(false)
  })

  it('los segundos van enteros, que es lo que admite la columna', () => {
    const f = filasDe(conDatos().series, 7)
    expect(f[0].tiempo_real).toBe(200)
    expect(f[0].descanso_real).toBe(90)
  })

  it('numera desde 1, como se ve en pantalla', () => {
    expect(filasDe(conDatos().series, 7).map(f => f.numero_serie)).toEqual([1, 2])
  })

  it('deja dicho quién lo apuntó', () => {
    expect(filasDe(conDatos().series, 7)[0].anotado_por).toBe('entrenador')
    expect(filasDe(conDatos().series, 7, 'deportista')[0].anotado_por).toBe('deportista')
  })

  it('la última sin descanso lo deja en null, no en cero', () => {
    let e = pulsar(estadoInicial(2), 0, T0)
    e = pulsar(e, 0, T0 + 100_000)
    e = parar(e, T0 + 100_000)
    expect(filasDe(e.series, 7)[0].descanso_real).toBe(0)
    // Y una serie que nunca tuvo descanso medido:
    const suelta = filasDe([{ ms: 100_000, descansoMs: null, nota: '' }], 7)
    expect(suelta[0].descanso_real).toBeNull()
  })

  it('sin nada cronometrado no se guarda ninguna fila', () => {
    expect(filasDe(estadoInicial(4).series, 7)).toEqual([])
  })
})

describe('notasDe', () => {
  it('junta las notas con su número de serie', () => {
    const s = [
      { ms: 1, descansoMs: null, nota: 'se le fue' },
      { ms: 1, descansoMs: null, nota: '' },
      { ms: 1, descansoMs: null, nota: 'molestia gemelo' },
    ]
    expect(notasDe(s)).toBe('S1: se le fue · S3: molestia gemelo')
  })
  it('sin notas, cadena vacía', () => {
    expect(notasDe(estadoInicial(3).series)).toBe('')
  })
  it('los espacios sueltos no cuentan como nota', () => {
    expect(notasDe([{ ms: 1, descansoMs: null, nota: '   ' }])).toBe('')
  })
})

describe('avisoAlSalir', () => {
  /* Entrar por error y salir tiene que ser instantáneo. Preguntar siempre
     convierte el aviso en un trámite que se pulsa sin leer, y el día que sí
     había algo tampoco se lee. */
  it('sin nada apuntado no dice nada: se sale directo', () => {
    expect(avisoAlSalir(0, 0, false)).toBeNull()
  })

  it('avisa de las series', () => {
    expect(avisoAlSalir(3, 0, false)).toContain('3 series cronometradas')
  })

  it('en singular cuando es una', () => {
    expect(avisoAlSalir(1, 0, false)).toContain('1 serie cronometrada')
    expect(avisoAlSalir(0, 1, false)).toContain('1 nota')
  })

  it('junta lo que haya en una frase legible', () => {
    const t = avisoAlSalir(4, 2, true)!
    expect(t).toContain('4 series cronometradas, 2 notas y el RPE')
  })

  it('una nota sola también cuenta como trabajo que se pierde', () => {
    expect(avisoAlSalir(0, 1, false)).not.toBeNull()
  })

  it('y el RPE solo', () => {
    expect(avisoAlSalir(0, 0, true)).toContain('el RPE')
  })

  it('dice claramente que no se guarda', () => {
    expect(avisoAlSalir(1, 0, false)).toContain('sin guardar')
  })
})

describe('conNota', () => {
  it('cuenta las que tienen texto', () => {
    expect(conNota([
      { ms: 1, descansoMs: null, nota: 'se le fue' },
      { ms: 1, descansoMs: null, nota: '' },
      { ms: null, descansoMs: null, nota: 'ojo rodilla' },
    ])).toBe(2)
  })
  it('los espacios sueltos no son una nota', () => {
    expect(conNota([{ ms: 1, descansoMs: null, nota: '  ' }])).toBe(0)
  })
})
