import { describe, it, expect } from 'vitest'
import {
  MIN_MINUTOS, MAX_MINUTOS, acotarMinutos,
  moverA, cambiarDuracion, quitar, minutosTotales, resumenEdicion, textoResumen, enHoras,
  alternativasDe, cambiarSesion,
  type RellenoEditable,
} from './editar-semana'
import { DIAS } from './plan-colocacion'
import { plantillasDe, opcionesDe, resolverClave } from './plantillas'

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

describe('cambiar continua por series', () => {
  const bici = (zona: string): RellenoEditable => ({
    dia: 'Martes' as any, minutos: 75, nombre: 'Intervalos al FTP', zona,
    clave: 'cic-aei', nivel: 'intermedio', motivo: 'la que más tiempo lleva sin usarse',
    hueco: { bloque: 'Ciclismo' } as any,
  })

  it('ofrece las del MISMO hueco: misma disciplina y misma zona', () => {
    /* Aquí está la diferencia entre continua y por series: en ciclismo AEI el
       catálogo tiene «Intervalos al FTP», «FTP continuo» y «Over-unders». */
    const alt = alternativasDe(bici('AEI'), plantillasDe, opcionesDe)
    expect(alt.length).toBeGreaterThan(1)
    const nombres = alt.map(a => a.nombre).join(' ')
    expect(nombres).toContain('continuo')
    expect(nombres).toContain('Over-unders')
  })

  it('NO ofrece las de otra zona', () => {
    /* Cambiar de zona no es cambiar la forma de la sesión, es cambiar lo que
       entrena. El reparto de intensidades lo decidió el generador contando
       zonas: sacar una de Z4 para meter otra de Z2 lo rompería en silencio. */
    const alt = alternativasDe(bici('AEI'), plantillasDe, opcionesDe)
    const deOtras = alternativasDe(bici('AER'), plantillasDe, opcionesDe)
    expect(alt.map(a => a.clave)).not.toEqual(expect.arrayContaining(deOtras.map(a => a.clave)))
  })

  it('la fuerza no tiene alternativas: no sale del mismo catálogo', () => {
    const f = { ...bici('AEI'), hueco: { bloque: 'Fuerza' } as any }
    expect(alternativasDe(f, plantillasDe, opcionesDe)).toEqual([])
  })

  it('sin zona o sin hueco, ninguna, en vez de reventar', () => {
    expect(alternativasDe({ ...bici('AEI'), zona: '' }, plantillasDe, opcionesDe)).toEqual([])
    expect(alternativasDe({ ...bici('AEI'), hueco: undefined } as any, plantillasDe, opcionesDe)).toEqual([])
  })

  it('cambiarla actualiza clave y nombre, y la marca', () => {
    const lista = [bici('AEI')]
    const r = cambiarSesion(lista, 0, 'cic-aei/over-unders', 'Intervalos al FTP · Over-unders')
    expect(r[0].clave).toBe('cic-aei/over-unders')
    expect(r[0].nombre).toContain('Over-unders')
    expect(r[0].editado).toBe(true)
  })

  it('REESCRIBE el motivo, que si no mentiría', () => {
    /* El que había explicaba por qué la eligió el generador. En cuanto la
       cambias eso deja de ser cierto, y el entrenador lo lee dentro de dos
       semanas y se cree la razón. */
    const lista = [bici('AEI')]
    const r = cambiarSesion(lista, 0, 'cic-aei/ftp-continuo', 'FTP continuo')
    expect(r[0].motivo).not.toContain('sin usarse')
    expect(r[0].motivo).toContain('elegido tú')
  })

  it('la que ya está puesta no cuenta como cambio', () => {
    const lista = [bici('AEI')]
    expect(cambiarSesion(lista, 0, 'cic-aei', 'Intervalos al FTP')).toBe(lista)
  })

  it('sin clave o con índice malo, no toca nada', () => {
    const lista = [bici('AEI')]
    expect(cambiarSesion(lista, 0, '', 'x')).toBe(lista)
    expect(cambiarSesion(lista, 9, 'otra', 'x')).toBe(lista)
  })

  it('las claves que ofrece son claves de verdad del catálogo', () => {
    /* Si ofreciera una clave inventada, el volcado crearía la sesión sin
       bloques: en el calendario saldría una sesión vacía. */
    for (const a of alternativasDe(bici('AEI'), plantillasDe, opcionesDe)) {
      expect(resolverClave(a.clave), a.clave).toBeTruthy()
    }
  })
})
