import { describe, it, expect } from 'vitest'
import { diaDe, textoAviso, esCambio, type AvisoDirector } from './avisos-director'

/* El lunes 12 de octubre de 2026 como «hoy»: el 16 es viernes. */
const HOY = '2026-10-12'

const aviso = (o: Partial<AvisoDirector>): AvisoDirector => ({
  id: 1, tipo: 'sesion', de: 'd', de_nombre: 'Pedro Martín', sobre: null, sobre_nombre: null,
  id_deportista: 7, deportista_nombre: 'Ana Ruiz', id_sesion: 3, fecha: '2026-10-16',
  cambios: [], creado_en: '', actualizado_en: '', leido_en: null, ...o,
})

describe('diaDe', () => {
  it('dice hoy, mañana y ayer', () => {
    expect(diaDe('2026-10-12', HOY)).toBe('hoy')
    expect(diaDe('2026-10-13', HOY)).toBe('mañana')
    expect(diaDe('2026-10-11', HOY)).toBe('ayer')
  })
  it('dentro de la semana, el día sin mes', () => {
    expect(diaDe('2026-10-16', HOY)).toBe('el viernes 16')
    expect(diaDe('2026-10-16', HOY, false)).toBe('viernes 16')
  })
  it('si queda lejos o es otro mes, con el mes', () => {
    expect(diaDe('2026-11-03', HOY)).toBe('el martes 3 de noviembre')
    expect(diaDe('2026-10-30', HOY)).toBe('el viernes 30 de octubre')
  })
  it('sin fecha no inventa una', () => {
    expect(diaDe(null, HOY)).toBe('un día')
  })
})

describe('textoAviso · sesión', () => {
  const cambio = aviso({ cambios: ['datos', 'bloques'] })
  it('al entrenador le dice quién, qué sesión y de quién', () => {
    const t = textoAviso(cambio, 'entrenador', HOY)
    expect(t.titulo).toBe('Pedro Martín cambió la sesión del viernes 16 de Ana Ruiz')
    expect(t.detalle).toEqual(['Ha cambiado los datos de la sesión', 'Ha cambiado los bloques'])
    expect(t.firma).toBeUndefined()
  })
  it('al deportista le habla de SU sesión y firma quién lo hizo', () => {
    const t = textoAviso(cambio, 'deportista', HOY)
    expect(t.titulo).toBe('Tu sesión del viernes 16 ha cambiado')
    expect(t.firma).toBe('Lo ha hecho Pedro Martín, desde la dirección.')
  })
  it('movida, nueva y borrada tienen su propia frase', () => {
    expect(textoAviso(aviso({ cambios: ['movida'] }), 'entrenador', HOY).titulo)
      .toBe('Pedro Martín movió una sesión de Ana Ruiz al viernes 16')
    expect(textoAviso(aviso({ cambios: ['movida'], fecha: HOY }), 'deportista', HOY).titulo)
      .toBe('Una sesión tuya se ha movido para hoy')
    expect(textoAviso(aviso({ cambios: ['nueva', 'bloques'], fecha: HOY }), 'deportista', HOY).titulo)
      .toBe('Tienes una sesión nueva hoy')
    expect(textoAviso(aviso({ cambios: ['borrada'] }), 'deportista', HOY).titulo)
      .toBe('Se ha quitado tu sesión del viernes 16')
  })
  it('corregir solo lo que hizo no se cuenta como cambiar la sesión', () => {
    expect(textoAviso(aviso({ cambios: ['lo_que_hizo'] }), 'deportista', HOY).titulo)
      .toBe('Se ha corregido lo que hiciste en tu sesión del viernes 16')
  })
})

describe('textoAviso · acceso y relación', () => {
  it('al deportista le dice a QUIÉN ha abierto su entrenador', () => {
    const t = textoAviso(aviso({ tipo: 'acceso', de_nombre: 'Laura Gómez', sobre: 'p', sobre_nombre: 'Pedro Martín', cambios: ['concedido'] }), 'deportista', HOY)
    expect(t.titulo).toBe('Laura Gómez ha dado acceso a Pedro Martín a tu plan')
    expect(t.detalle.join(' ')).toContain('chat')
  })
  it('al director, la respuesta de su entrenador', () => {
    expect(textoAviso(aviso({ tipo: 'acceso', de_nombre: 'Laura Gómez', cambios: ['denegado'] }), 'entrenador', HOY).titulo)
      .toBe('Laura Gómez no te ha abierto a Ana Ruiz')
    expect(textoAviso(aviso({ tipo: 'acceso', de_nombre: 'Laura Gómez', cambios: ['concedido'] }), 'entrenador', HOY).titulo)
      .toBe('Laura Gómez te ha abierto a Ana Ruiz')
  })
  it('la invitación usada', () => {
    expect(textoAviso(aviso({ tipo: 'vinculo', de_nombre: 'Rosa Ríos', cambios: ['alta'] }), 'entrenador', HOY).titulo)
      .toBe('Rosa Ríos se ha registrado con tu invitación: ya trabajáis juntos')
  })
  it('separa los cambios de las respuestas', () => {
    expect(esCambio(aviso({ tipo: 'sesion' }))).toBe(true)
    expect(esCambio(aviso({ tipo: 'acceso' }))).toBe(false)
    expect(esCambio(aviso({ tipo: 'vinculo' }))).toBe(false)
  })
})
