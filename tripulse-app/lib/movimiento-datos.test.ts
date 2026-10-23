import { describe, it, expect } from 'vitest'
import { fotosDeFila, fundirVistas, rutaFotograma, rutaFotogramaVista, type FotoVista } from './movimiento-datos'

const foto = (vista: FotoVista['vista'], fotograma: string | null, marca: string = vista): FotoVista => ({
  vista, fotograma, medidas: [{ nombre: 'Fotograma', valor: marca }], dibujo: [],
})
const ORDEN: FotoVista['vista'][] = ['perfil', 'frente']

describe('las pruebas de dos vistas: qué se guarda', () => {
  it('las dos de una vez y alineadas: la de perfil es la principal y las dos son de la misma repetición', () => {
    const r = fundirVistas([], [foto('frente', 'f.jpg'), foto('perfil', 'p.jpg')], ORDEN, true)
    expect(r.principal?.vista).toBe('perfil')
    expect(r.segunda?.vista).toBe('frente')
    expect(r.segunda?.misma_repeticion).toBe(true)
    expect(r.sueltas).toEqual([])
  })

  it('sin alinear, no son de la misma repetición', () => {
    const r = fundirVistas([], [foto('perfil', 'p.jpg'), foto('frente', 'f.jpg')], ORDEN, false)
    expect(r.segunda?.misma_repeticion).toBe(false)
  })

  it('solo una vista nueva: la otra se queda como estaba, pero ya no es de la misma repetición', () => {
    const antes = [foto('perfil', 'p.jpg', 'perfil viejo'), foto('frente', 'f.jpg', 'frente viejo')]
    const r = fundirVistas(antes, [foto('frente', 'f2.jpg', 'frente nuevo')], ORDEN, true)
    expect(r.principal?.medidas?.[0].valor).toBe('perfil viejo')
    expect(r.segunda?.medidas?.[0].valor).toBe('frente nuevo')
    expect(r.segunda?.fotograma).toBe('f2.jpg')
    expect(r.segunda?.misma_repeticion).toBe(false)
    expect(r.sueltas).toEqual(['f.jpg'])
  })

  it('si antes solo había la de frente, al llegar la de perfil esta pasa a principal y la de frente a segunda', () => {
    const r = fundirVistas([foto('frente', 'f.jpg', 'frente viejo')], [foto('perfil', 'p.jpg')], ORDEN, false)
    expect(r.principal?.vista).toBe('perfil')
    expect(r.segunda?.vista).toBe('frente')
    expect(r.segunda?.medidas?.[0].valor).toBe('frente viejo')
    expect(r.sueltas).toEqual([])
  })

  it('sin permiso (sin imagen nueva) se queda la imagen de antes, con las medidas nuevas', () => {
    const r = fundirVistas([foto('perfil', 'p.jpg', 'viejo')], [foto('perfil', null, 'nuevo')], ORDEN, false)
    expect(r.principal?.fotograma).toBe('p.jpg')
    expect(r.principal?.medidas?.[0].valor).toBe('nuevo')
    expect(r.segunda).toBeNull()
  })

  it('la imagen de antes con la ruta vieja se queda suelta cuando su vista trae otra', () => {
    const vieja = rutaFotograma(1, 2, 'fms.sentadilla', 'unico')
    const nueva = rutaFotogramaVista(1, 2, 'fms.sentadilla', 'unico', 'perfil')
    expect(nueva).not.toBe(vieja)
    const r = fundirVistas([foto('perfil', vieja)], [foto('perfil', nueva)], ORDEN, false)
    expect(r.principal?.fotograma).toBe(nueva)
    expect(r.sueltas).toEqual([vieja])
  })

  it('una fila guardada se lee con sus dos vistas, y sin vídeo no tiene ninguna', () => {
    const fila = {
      vista: 'perfil' as const, fotograma: 'p.jpg', medidas: null, dibujo: null,
      segunda_vista: { ...foto('frente', 'f.jpg'), misma_repeticion: true },
    }
    expect(fotosDeFila(fila).map(f => f.vista)).toEqual(['perfil', 'frente'])
    expect(fotosDeFila({ vista: null, fotograma: null })).toEqual([])
  })
})
