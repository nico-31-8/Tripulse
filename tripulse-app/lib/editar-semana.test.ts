import { describe, it, expect } from 'vitest'
import {
  MIN_MINUTOS, MAX_MINUTOS, acotarMinutos,
  moverA, cambiarDuracion, quitar, minutosTotales, resumenEdicion, textoResumen, enHoras,
  type RellenoEditable,
} from './editar-semana'
import { DIAS } from './plan-colocacion'

const s = (dia: string, minutos: number, nombre = 'x'): RellenoEditable => ({
  dia: dia as any, minutos, nombre, zona: 'AEL', clave: 'c', nivel: 'intermedio',
  motivo: 'porque sí', hueco: { bloque: 'resistencia' } as any,
})

const SEMANA: RellenoEditable[] = [s('Lunes', 60), s('Miércoles', 90), s('Sábado', 120)]

describe('mover de día', () => {
  it('cambia el día y lo marca como tocado', () => {
    const r = moverA(SEMANA, 1, 'Jueves')
    expect(r[1].dia).toBe('Jueves')
    expect(r[1].editado).toBe(true)
  })

  it('no toca a las demás', () => {
    const r = moverA(SEMANA, 1, 'Jueves')
    expect(r[0]).toEqual(SEMANA[0])
    expect(r[2]).toEqual(SEMANA[2])
  })

  it('NO modifica la lista que recibe', () => {
    /* El «antes» tiene que seguir estando para poder comparar, y React necesita
       ver una lista nueva para repintar. */
    const copia = JSON.parse(JSON.stringify(SEMANA))
    moverA(SEMANA, 1, 'Jueves')
    expect(SEMANA).toEqual(copia)
  })

  it('moverla a donde ya está no la marca como tocada', () => {
    /* Si contase, pulsar sin querer el día actual diría que has cambiado la
       semana cuando no has cambiado nada. */
    const r = moverA(SEMANA, 0, 'Lunes')
    expect(r).toBe(SEMANA)
  })

  it('un día que no existe se ignora', () => {
    expect(moverA(SEMANA, 0, 'Lunesss' as any)).toBe(SEMANA)
  })

  it('un índice fuera de la lista se ignora', () => {
    expect(moverA(SEMANA, 99, 'Jueves')).toBe(SEMANA)
    expect(moverA([], 0, 'Jueves')).toEqual([])
  })

  it('los siete días, en el orden en que se enseñan', () => {
    expect(DIAS).toHaveLength(7)
    expect(DIAS[0]).toBe('Lunes')
    expect(DIAS[6]).toBe('Domingo')
  })
})

describe('cambiar la duración', () => {
  it('la cambia y la marca', () => {
    const r = cambiarDuracion(SEMANA, 0, 75)
    expect(r[0].minutos).toBe(75)
    expect(r[0].editado).toBe(true)
  })

  it('ACOTA lo imposible en vez de aceptarlo', () => {
    /* Una sesión de 6000 minutos se volcaría al calendario tan tranquila y le
       rompería la carga de la semana. Un dedo que resbala no puede llegar a la
       base. */
    expect(cambiarDuracion(SEMANA, 0, 6000)[0].minutos).toBe(MAX_MINUTOS)
    expect(cambiarDuracion(SEMANA, 0, 1)[0].minutos).toBe(MIN_MINUTOS)
    expect(cambiarDuracion(SEMANA, 0, -30)[0].minutos).toBe(MIN_MINUTOS)
  })

  it('lo que no es un número se ignora del todo', () => {
    for (const v of ['', 'abc', null, undefined, NaN]) {
      expect(cambiarDuracion(SEMANA, 0, v), String(v)).toBe(SEMANA)
    }
  })

  it('poner la que ya tenía no la marca', () => {
    expect(cambiarDuracion(SEMANA, 0, 60)).toBe(SEMANA)
  })

  it('acotarMinutos redondea y no inventa', () => {
    expect(acotarMinutos(59.6)).toBe(60)
    expect(acotarMinutos('90')).toBe(90)
    expect(acotarMinutos('hola')).toBeNull()
  })
})

describe('quitar', () => {
  it('se lleva solo esa', () => {
    const r = quitar(SEMANA, 1)
    expect(r).toHaveLength(2)
    expect(r.map(x => x.dia)).toEqual(['Lunes', 'Sábado'])
  })

  it('un índice que no existe no quita nada', () => {
    expect(quitar(SEMANA, 99)).toBe(SEMANA)
  })

  it('quitarlas todas deja una semana vacía, no rota', () => {
    let r = SEMANA
    while (r.length) r = quitar(r, 0)
    expect(r).toEqual([])
    expect(minutosTotales(r)).toBe(0)
  })
})

describe('el resumen de lo cambiado', () => {
  it('cuenta las tocadas y las quitadas por separado', () => {
    let r = moverA(SEMANA, 0, 'Martes')
    r = cambiarDuracion(r, 1, 60)
    r = quitar(r, 2)
    const res = resumenEdicion(SEMANA, r)
    expect(res.tocadas).toBe(2)
    expect(res.quitadas).toBe(1)
  })

  it('la diferencia de tiempo es negativa si ahora hay menos', () => {
    const r = quitar(SEMANA, 2)          // se van 120 min
    const res = resumenEdicion(SEMANA, r)
    expect(res.minutosAntes).toBe(270)
    expect(res.minutosAhora).toBe(150)
    expect(res.diferencia).toBe(-120)
  })

  it('sin tocar nada, no hay nada que contar', () => {
    const res = resumenEdicion(SEMANA, SEMANA)
    expect(res.hayCambios).toBe(false)
    expect(textoResumen(res)).toBeNull()
  })

  it('el texto dice qué pasó y cuánto queda', () => {
    const r = quitar(cambiarDuracion(SEMANA, 0, 30), 2)
    const t = textoResumen(resumenEdicion(SEMANA, r))!
    expect(t).toContain('1 sesión cambiada')
    expect(t).toContain('1 quitada')
    expect(t).toContain('2 h en total')
    expect(t).toContain('-2,5 h')
  })

  it('quitar y alargar puede dejar el mismo tiempo, y se dice', () => {
    /* El número de sesiones cambió aunque el total no. Decir solo el total
       escondería que la semana es otra. */
    let r = quitar(SEMANA, 0)              // -60
    r = cambiarDuracion(r, 0, 150)         // +60
    const res = resumenEdicion(SEMANA, r)
    expect(res.diferencia).toBe(0)
    expect(textoResumen(res)).toContain('el mismo tiempo')
    expect(textoResumen(res)).toContain('1 quitada')
  })
})

describe('las horas', () => {
  it('se escriben con coma y una décima', () => {
    expect(enHoras(270)).toBe('4,5 h')
    expect(enHoras(60)).toBe('1 h')
    expect(enHoras(0)).toBe('0 h')
    expect(enHoras(-90)).toBe('-1,5 h')
  })
})
