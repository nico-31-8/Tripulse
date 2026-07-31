import { describe, it, expect } from 'vitest'
import {
  minutosPropuesta, metrosPropuesta, rpePropuesta, avisosPropuesta,
  aBloquesPlantilla, ESQUEMA_PROPUESTA, type PropuestaSesion,
} from './propuesta-sesion'

const prop = (p: Partial<PropuestaSesion>): PropuestaSesion => ({
  nombre: 'Sesión', disciplina: 'Carrera', porque: 'porque sí', bloques: [], ...p,
})

// Lo que se blinda aquí no es la aritmética: es que una propuesta con la FORMA
// correcta y el contenido absurdo no llegue al entrenador sin avisar. El modelo
// cumple el esquema siempre; el sentido común no lo garantiza nadie.

describe('volumen de una propuesta', () => {
  it('las series multiplican', () => {
    const p = prop({ bloques: [{ zona: 'AEM', minutos: 8, series: 4 }] })
    expect(minutosPropuesta(p)).toBe(32)
  })
  it('sin series cuenta una vez', () => {
    expect(minutosPropuesta(prop({ bloques: [{ zona: 'AEL', minutos: 40 }] }))).toBe(40)
  })
  it('suma bloques distintos', () => {
    const p = prop({ bloques: [{ zona: 'AER', minutos: 10 }, { zona: 'AEM', minutos: 8, series: 3 }] })
    expect(minutosPropuesta(p)).toBe(34)
  })
  it('los metros van por su lado', () => {
    const p = prop({ disciplina: 'Natacion', bloques: [{ zona: 'AEM', metros: 400, series: 4 }] })
    expect(metrosPropuesta(p)).toBe(1600)
    expect(minutosPropuesta(p)).toBe(0)
  })
})

describe('rpePropuesta — usa el catálogo de zonas, no una escala inventada', () => {
  it('una sesión suave da RPE bajo y una dura RPE alto', () => {
    const suave = rpePropuesta(prop({ bloques: [{ zona: 'AER', minutos: 60 }] }))
    const dura = rpePropuesta(prop({ bloques: [{ zona: 'PAE', minutos: 60 }] }))
    expect(dura).toBeGreaterThan(suave)
  })
  it('pondera por volumen: 50 min suaves pesan más que 5 duros', () => {
    const p = prop({ bloques: [{ zona: 'AER', minutos: 50 }, { zona: 'PAE', minutos: 5 }] })
    expect(rpePropuesta(p)).toBeLessThan(rpePropuesta(prop({ bloques: [{ zona: 'PAE', minutos: 55 }] })))
  })
  it('sin volumen no revienta ni devuelve NaN', () => {
    const r = rpePropuesta(prop({ bloques: [{ zona: 'AEM' }] }))
    expect(Number.isFinite(r)).toBe(true)
    expect(r).toBeGreaterThanOrEqual(1)
  })
  it('acotado a 1-10', () => {
    expect(rpePropuesta(prop({ bloques: [{ zona: 'PALA', minutos: 60 }] }))).toBeLessThanOrEqual(10)
  })
})

describe('avisosPropuesta — la red de seguridad', () => {
  it('una propuesta razonable no genera avisos', () => {
    const p = prop({ bloques: [{ zona: 'AER', minutos: 10 }, { zona: 'AEM', minutos: 8, series: 4 }] })
    expect(avisosPropuesta(p)).toEqual([])
  })
  it('detecta zonas que la app no conoce', () => {
    const p = prop({ bloques: [{ zona: 'Z9', minutos: 30 }] })
    expect(avisosPropuesta(p).join(' ')).toMatch(/no reconoce/i)
  })
  it('detecta bloques sin minutos ni metros', () => {
    const p = prop({ bloques: [{ zona: 'AEM', series: 4 }] })
    expect(avisosPropuesta(p).join(' ')).toMatch(/sin minutos ni metros/i)
  })
  it('avisa de una sesión desproporcionada', () => {
    const p = prop({ bloques: [{ zona: 'AEL', minutos: 400 }] })
    expect(avisosPropuesta(p).join(' ')).toMatch(/h de sesión/i)
  })
  it('avisa si una sesión de natación viene en minutos', () => {
    const p = prop({ disciplina: 'Natacion', bloques: [{ zona: 'AEM', minutos: 45 }] })
    expect(avisosPropuesta(p).join(' ')).toMatch(/natación/i)
  })
  it('una propuesta vacía se detecta', () => {
    expect(avisosPropuesta(prop({ bloques: [] })).join(' ')).toMatch(/no tiene bloques/i)
  })
})

describe('aBloquesPlantilla — encaja con el flujo que ya existe', () => {
  // BloqueP usa `segundos` y `descansoSeg`. Traducirlo mal no rompe nada visible:
  // la sesión se crea igual, pero con los bloques SIN duración.
  it('los minutos se traducen a segundos, que es lo que espera BloqueP', () => {
    const p = prop({ bloques: [{ zona: 'AEM', minutos: 8, series: 4, descansoSeg: 60 }] })
    expect(aBloquesPlantilla(p)).toEqual([
      { zona: 'AEM', series: 4, metros: undefined, segundos: 480, descansoSeg: 60, nota: undefined },
    ])
  })
  it('los metros pasan tal cual y no generan segundos', () => {
    const b = aBloquesPlantilla(prop({ bloques: [{ zona: 'AEM', metros: 400, series: 4 }] }))[0]
    expect(b.metros).toBe(400)
    expect(b.segundos).toBeUndefined()
  })
  it('usa los nombres exactos de BloqueP, no los de la base de datos', () => {
    const b = aBloquesPlantilla(prop({ bloques: [{ zona: 'AEL', minutos: 30, descansoSeg: 90 }] }))[0]
    expect(b).toHaveProperty('segundos')
    expect(b).toHaveProperty('descansoSeg')
    expect(b).not.toHaveProperty('minutos')
    expect(b).not.toHaveProperty('descanso_segundos')
  })
})

describe('el esquema no deja inventar zonas', () => {
  it('la zona es un enum del catálogo real', () => {
    const zonas = (ESQUEMA_PROPUESTA as any).properties.bloques.items.properties.zona.enum as string[]
    expect(zonas).toContain('AEM')
    expect(zonas).toContain('FMH')
    expect(zonas).not.toContain('Z2')
  })
  it('la disciplina también', () => {
    const d = (ESQUEMA_PROPUESTA as any).properties.disciplina.enum as string[]
    expect(d).toEqual(['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'])
  })
  it('obliga a justificar la propuesta', () => {
    expect((ESQUEMA_PROPUESTA as any).required).toContain('porque')
  })
})
