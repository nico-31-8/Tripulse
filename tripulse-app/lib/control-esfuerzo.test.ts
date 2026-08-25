import { describe, it, expect } from 'vitest'
import {
  CONTROLES, controlDe, siguienteControl, textoControl, controlDeEjercicio,
} from './control-esfuerzo'

describe('el catálogo', () => {
  it('tiene los cinco y no se repiten', () => {
    expect(CONTROLES.map(c => c.id)).toEqual(['rir', 'rpe', 'vel', 'vel_ms', 'pct1rm'])
  })

  /* Qué se anota al TERMINAR la serie y qué no:
       · RIR, RPE y m/s → sí, hay un número delante que apuntar.
       · % vel          → no: el encoder corta la serie, no se puntúa al final.
       · % 1RM          → no: es carga, y lo levantado ya va en kilos.
     Si esto se descuadrara, la pantalla de ejecución pediría un número que no
     existe, o se callaría uno que sí. */
  it('se anotan RIR, RPE y m/s; % vel y % 1RM no', () => {
    const anotables = CONTROLES.filter(c => c.seAnota).map(c => c.id)
    expect(anotables).toEqual(['rir', 'rpe', 'vel_ms'])
  })

  /* El tope es de las ESCALAS, no de las medidas. RIR llega a 5 y RPE a 10
     porque son puntuaciones; los m/s no tienen techo que poner — una barra
     puede moverse a lo que se mueva. */
  it('las escalas llevan tope y la medida no', () => {
    expect(controlDe('rir').max).toBe(5)
    expect(controlDe('rpe').max).toBe(10)
    expect(controlDe('vel_ms').max).toBeUndefined()
  })

  it('el ciclo de controles vuelve al principio', () => {
    expect(siguienteControl('rir')).toBe('rpe')
    expect(siguienteControl('pct1rm')).toBe('rir')
  })

  it('un tipo desconocido cae a RIR en vez de reventar', () => {
    expect(controlDe('inventado').id).toBe('rir')
    expect(controlDe(null).id).toBe('rir')
  })
})

describe('cómo se escribe', () => {
  /* El número va detrás en los que puntúan la serie y delante en los que son un
     porcentaje: «RIR 2» pero «75 % 1RM». Al revés se lee mal en los dos casos. */
  it('pone el número donde toca según el tipo', () => {
    expect(textoControl('rir', 2)).toBe('RIR 2')
    expect(textoControl('rpe', '8')).toBe('RPE 8')
    expect(textoControl('pct1rm', 75)).toBe('75 % 1RM')
    expect(textoControl('vel', 20)).toBe('20 % vel')
  })

  it('sin valor devuelve vacío, no un guion', () => {
    // Quien pinta decide si eso es un «—» o un hueco.
    expect(textoControl('rir', null)).toBe('')
    expect(textoControl('rir', '')).toBe('')
    expect(textoControl('rir', '  ')).toBe('')
  })
})

describe('rescatar lo viejo', () => {
  it('lee las columnas nuevas cuando están', () => {
    expect(controlDeEjercicio({ control_tipo: 'pct1rm', control_valor: '80' })).toBe('80 % 1RM')
  })

  /* Antes de que existieran las columnas, el RIR se concatenaba dentro de las
     notas como «RIR: 2». Esas sesiones siguen ahí. */
  it('y si no, saca el RIR del texto de las notas', () => {
    expect(controlDeEjercicio({ notas_ejecucion: 'RIR: 2 · tempo controlado' })).toBe('RIR 2')
    expect(controlDeEjercicio({ notas_ejecucion: '4:00 por serie' })).toBe('')
  })

  it('las columnas nuevas mandan sobre el texto viejo', () => {
    expect(controlDeEjercicio({
      control_tipo: 'rpe', control_valor: '9', notas_ejecucion: 'RIR: 2',
    })).toBe('RPE 9')
  })

  it('sin ejercicio no revienta', () => {
    expect(controlDeEjercicio(null)).toBe('')
    expect(controlDeEjercicio({})).toBe('')
  })
})

describe('la velocidad medida (m/s)', () => {
  /* `vel` es el PORCENTAJE de pérdida —dice cuándo cortar la serie— y `vel_ms`
     es la velocidad que marca el encoder. El porcentaje sale de comparar esa
     velocidad con la de la primera repetición, así que guardar solo el
     porcentaje tira el dato de origen. */
  it('es una escala aparte de la pérdida de velocidad', () => {
    expect(controlDe('vel').corto).toBe('% vel')
    expect(controlDe('vel_ms').corto).toBe('m/s')
  })

  it('el atleta SÍ la anota: hay un número delante', () => {
    expect(controlDe('vel_ms').seAnota).toBe(true)
    expect(controlDe('vel').seAnota).toBe(false)
  })

  it('no tiene tope, porque es una medida y no una escala de 1 a 10', () => {
    expect(controlDe('vel_ms').max).toBeUndefined()
    expect(controlDe('rir').max).toBe(5)
  })

  it('el número va delante: «0,62 m/s», no «m/s 0,62»', () => {
    expect(textoControl('vel_ms', '0.62')).toBe('0.62 m/s')
    expect(textoControl('rir', '2')).toBe('RIR 2')
  })

  it('entra en la rotación de escalas sin dejar a ninguna fuera', () => {
    const vistas = new Set<string>()
    let t: any = 'rir'
    for (let i = 0; i < CONTROLES.length; i++) { vistas.add(t); t = siguienteControl(t) }
    expect(vistas.size).toBe(CONTROLES.length)
    expect(vistas.has('vel_ms')).toBe(true)
    // Y vuelve al principio: la rotación no se queda atascada.
    expect(t).toBe('rir')
  })
})
