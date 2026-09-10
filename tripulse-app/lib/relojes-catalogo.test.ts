import { describe, it, expect } from 'vitest'
import { RELOJES, relojPorId, nombreReloj, datosListos, sePuedeConectar, leerVuelta } from './relojes-catalogo'

describe('catálogo de relojes', () => {
  it('cada marca que se puede conectar trae sus pasos y lo que llega', () => {
    for (const r of RELOJES.filter(x => sePuedeConectar(x.id))) {
      expect(r.pasos.length, r.id).toBeGreaterThan(0)
      expect(r.queLlega.length, r.id).toBeGreaterThan(0)
      expect(r.siNoLlega.length, r.id).toBeGreaterThan(0)
    }
  })

  it('las que no están del todo explican por qué', () => {
    for (const r of RELOJES.filter(x => x.estado !== 'disponible')) expect(r.nota, r.id).toBeTruthy()
  })

  it('sin marcas repetidas', () => {
    expect(new Set(RELOJES.map(r => r.id)).size).toBe(RELOJES.length)
  })

  it('solo Polar avisa de que caduca al año', () => {
    expect(RELOJES.filter(r => r.caducaAlAno).map(r => r.id)).toEqual(['polar'])
  })

  it('el nombre bien escrito, venga como venga', () => {
    expect(nombreReloj('coros')).toBe('COROS')
    expect(nombreReloj('polar')).toBe('Polar')
    expect(nombreReloj('suunto')).toBe('Suunto')
    expect(nombreReloj(null)).toBe('Reloj')
  })

  it('los datos llegan al wellness solo desde las disponibles', () => {
    expect(datosListos('polar')).toBe(true)
    expect(datosListos('coros')).toBe(false)
    expect(datosListos('garmin')).toBe(false)
    expect(datosListos(undefined)).toBe(false)
  })

  it('se conecta lo disponible y lo que está en pruebas; lo próximo no', () => {
    expect(sePuedeConectar('polar')).toBe(true)
    expect(sePuedeConectar('coros')).toBe(true)
    expect(sePuedeConectar('garmin')).toBe(false)
    expect(relojPorId('nada')).toBeUndefined()
  })
})

describe('leerVuelta', () => {
  it('lee la marca y si fue bien', () => {
    expect(leerVuelta('polar-conectado')).toEqual({ proveedor: 'polar', ok: true })
    expect(leerVuelta('coros-error')).toEqual({ proveedor: 'coros', ok: false })
  })

  it('lo que no es una vuelta conocida no es nada', () => {
    expect(leerVuelta(null)).toBeNull()
    expect(leerVuelta('')).toBeNull()
    expect(leerVuelta('suunto-conectado')).toBeNull()
    expect(leerVuelta('polar-otracosa')).toBeNull()
    expect(leerVuelta('POLAR-conectado')).toBeNull()
    expect(leerVuelta('xpolar-conectado ')).toBeNull()
  })
})
