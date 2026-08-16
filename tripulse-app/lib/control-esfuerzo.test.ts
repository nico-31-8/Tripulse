import { describe, it, expect } from 'vitest'
import {
  CONTROLES, controlDe, siguienteControl, textoControl, controlDeEjercicio,
} from './control-esfuerzo'

describe('el catálogo', () => {
  it('tiene los cuatro y no se repiten', () => {
    expect(CONTROLES.map(c => c.id)).toEqual(['rir', 'rpe', 'vel', 'pct1rm'])
  })

  /* Con VBT y con %1RM no hay nada que anotar al terminar la serie. Si esto
     cambiara, la pantalla de ejecución pediría un número que no existe. */
  it('solo se anotan RIR y RPE, y esos llevan tope', () => {
    CONTROLES.forEach(c => {
      expect(c.seAnota, c.id).toBe(c.id === 'rir' || c.id === 'rpe')
      if (c.seAnota) expect(c.max, c.id).toBeGreaterThan(0)
    })
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
