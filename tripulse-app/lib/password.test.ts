import { describe, it, expect } from 'vitest'
import { revisarPassword, errorAlEnviar, pistaDeDiferencia, MINIMO } from './password'

describe('revisarPassword', () => {
  it('no dice nada con los dos campos vacíos', () => {
    const r = revisarPassword('', '')
    expect(r.error).toBeNull()
    expect(r.valida).toBe(false)
  })

  it('no regaña por la repetición mientras aún se escribe la primera', () => {
    expect(revisarPassword('secreta1', '').error).toBeNull()
  })

  it('avisa del largo en cuanto hay algo escrito', () => {
    expect(revisarPassword('abc', '').error).toContain(String(MINIMO))
  })

  it('avisa de que no coinciden', () => {
    expect(revisarPassword('secreta1', 'secreta2').error).toBe('Las dos contraseñas no son iguales.')
  })

  it('da por válido el par correcto', () => {
    const r = revisarPassword('secreta1', 'secreta1')
    expect(r).toMatchObject({ largoOk: true, coincide: true, valida: true, error: null })
  })

  it('dos vacías no cuentan como que coinciden', () => {
    expect(revisarPassword('', '').coincide).toBe(false)
  })

  it('el largo manda sobre el coincidir: primero el mínimo', () => {
    expect(revisarPassword('abc', 'abc').error).toContain(String(MINIMO))
  })

  it('respeta los espacios: no los recorta para dar por buena la contraseña', () => {
    expect(revisarPassword('secreta1 ', 'secreta1').valida).toBe(false)
  })
})

describe('pistaDeDiferencia', () => {
  it('detecta el espacio de más al final', () => {
    expect(pistaDeDiferencia('secreta1 ', 'secreta1')).toContain('espacio')
  })

  it('detecta el espacio de más al principio', () => {
    expect(pistaDeDiferencia(' secreta1', 'secreta1')).toContain('espacio')
  })

  it('calla si son iguales', () => {
    expect(pistaDeDiferencia('secreta1', 'secreta1')).toBeNull()
  })

  it('calla si de verdad son distintas', () => {
    expect(pistaDeDiferencia('secreta1', 'otracosa')).toBeNull()
  })

  it('no confunde dos campos de solo espacios con una diferencia de espaciado', () => {
    expect(pistaDeDiferencia('  ', ' ')).toBeNull()
  })
})

describe('errorAlEnviar', () => {
  it('pide la confirmación si está vacía', () => {
    expect(errorAlEnviar('secreta1', '')).toContain('otra vez')
  })

  it('pide el mínimo si es corta', () => {
    expect(errorAlEnviar('abc', 'abc')).toContain(String(MINIMO))
  })

  it('avisa del espacio en vez de decir solo «no son iguales»', () => {
    expect(errorAlEnviar('secreta1 ', 'secreta1')).toContain('espacio')
  })

  it('no hay error cuando está todo bien', () => {
    expect(errorAlEnviar('secreta1', 'secreta1')).toBeNull()
  })
})
