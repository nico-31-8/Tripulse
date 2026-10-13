import { describe, it, expect } from 'vitest'
import {
  BATERIAS, DE_VISTA, NOMBRE_VISTA, pruebaDe, notaDePrueba, resultadoBateria, textoTotal, type RegistroPrueba,
} from './baterias-movimiento'

const r = (prueba: string, lado: 'unico' | 'izq' | 'der', nota: number | null, dolor = false): RegistroPrueba =>
  ({ prueba, lado, nota, dolor })

describe('las baterías', () => {
  it('el FMS son 7 pruebas sobre 21 y el Nine Test 9 sobre 27', () => {
    expect(BATERIAS.fms.pruebas).toHaveLength(7)
    expect(BATERIAS.fms.maximo).toBe(21)
    expect(BATERIAS.nine.pruebas).toHaveLength(9)
    expect(BATERIAS.nine.maximo).toBe(27)
  })

  it('las claves no se repiten y cada prueba trae su montaje, sus criterios y sus tres notas', () => {
    const claves = Object.values(BATERIAS).flatMap(b => [...b.pruebas.map(p => p.clave), ...b.dolores.map(d => d.clave)])
    expect(new Set(claves).size).toBe(claves.length)
    for (const b of Object.values(BATERIAS)) {
      for (const p of b.pruebas) {
        expect(p.clave.startsWith(b.id + '.'), p.clave).toBe(true)
        expect(p.montaje.length, p.clave).toBeGreaterThan(10)
        expect(p.criterios.length, p.clave).toBeGreaterThan(0)
        expect(p.vistas.length, p.clave).toBeGreaterThan(0)
        expect([p.notas[3], p.notas[2], p.notas[1]].every(Boolean), p.clave).toBe(true)
        // Cada criterio se mira desde una de las vistas que se graban.
        for (const c of p.criterios) expect(p.vistas, p.clave + ' · ' + c.clave).toContain(c.vista)
      }
    }
  })

  it('cada prueba de dolor del FMS anula una prueba que la tiene como suya', () => {
    expect(BATERIAS.fms.dolores).toHaveLength(3)
    for (const d of BATERIAS.fms.dolores) expect(pruebaDe(d.anula)?.dolor).toBe(d.clave)
    expect(BATERIAS.nine.dolores).toHaveLength(0)
  })
})

describe('notaDePrueba', () => {
  const sentadilla = pruebaDe('fms.sentadilla')!
  const zancada = pruebaDe('fms.zancada')!
  const hombro = pruebaDe('fms.hombro')!

  it('una prueba de un solo lado: su nota', () => {
    expect(notaDePrueba(sentadilla, [r('fms.sentadilla', 'unico', 3)]).nota).toBe(3)
    expect(notaDePrueba(sentadilla, []).nota).toBeNull()
  })

  it('de dos lados: cuenta el peor, y se marca la asimetría', () => {
    const n = notaDePrueba(zancada, [r('fms.zancada', 'izq', 2), r('fms.zancada', 'der', 3)])
    expect(n).toEqual({ nota: 2, izq: 2, der: 3, asimetria: true, porDolor: false })
  })

  it('con un lado sin puntuar todavía no hay nota', () => {
    expect(notaDePrueba(zancada, [r('fms.zancada', 'izq', 3)]).nota).toBeNull()
  })

  it('si duele, es un 0 aunque falte el otro lado', () => {
    const n = notaDePrueba(zancada, [r('fms.zancada', 'izq', null, true)])
    expect(n.nota).toBe(0)
    expect(n.porDolor).toBe(true)
  })

  it('si su prueba de dolor sale positiva, vale 0 aunque los lados sean buenos', () => {
    const regs = [r('fms.hombro', 'izq', 3), r('fms.hombro', 'der', 3), r('fms.dolor_hombro', 'der', null, true)]
    expect(notaDePrueba(hombro, regs)).toMatchObject({ nota: 0, porDolor: true })
    // Sin dolor, cuenta lo de siempre.
    const sin = [r('fms.hombro', 'izq', 3), r('fms.hombro', 'der', 3), r('fms.dolor_hombro', 'der', null, false)]
    expect(notaDePrueba(hombro, sin).nota).toBe(3)
  })

  it('una nota fuera de 0-3 se lee como sin puntuar', () => {
    expect(notaDePrueba(sentadilla, [r('fms.sentadilla', 'unico', 5)]).nota).toBeNull()
  })
})

describe('resultadoBateria', () => {
  it('el FMS a medias: suma lo que hay y dice cuántas faltan', () => {
    const regs = [
      r('fms.sentadilla', 'unico', 3),
      r('fms.valla', 'izq', 2), r('fms.valla', 'der', 2),
      r('fms.zancada', 'izq', 2), r('fms.zancada', 'der', 3),
      r('fms.hombro', 'izq', 3), r('fms.hombro', 'der', 2),
      r('fms.pierna_recta', 'izq', 3), r('fms.pierna_recta', 'der', 3),
    ]
    const res = resultadoBateria(BATERIAS.fms, regs)
    expect(res.total).toBe(12)
    expect(res.hechas).toBe(5)
    expect(res.faltan).toBe(2)
    expect(res.completa).toBe(false)
    expect(res.asimetrias).toEqual(['Zancada en línea', 'Movilidad de hombro'])
    expect(textoTotal(res)).toBe('12 de 21 · faltan 2')
  })

  it('el Nine Test entero', () => {
    const notas: Record<string, number> = {
      'nine.sentadilla': 2, 'nine.piernas_rectas': 2, 'nine.flexion': 3, 'nine.rotacion': 3,
    }
    const regs: RegistroPrueba[] = Object.entries(notas).map(([k, n]) => r(k, 'unico', n))
    regs.push(r('nine.una_pierna', 'izq', 3), r('nine.una_pierna', 'der', 1))
    regs.push(r('nine.zancada', 'izq', 2), r('nine.zancada', 'der', 2))
    regs.push(r('nine.cadera', 'izq', 3), r('nine.cadera', 'der', 3))
    regs.push(r('nine.diagonal', 'izq', 2), r('nine.diagonal', 'der', 2))
    regs.push(r('nine.hombro', 'izq', 3), r('nine.hombro', 'der', 2))
    const res = resultadoBateria(BATERIAS.nine, regs)
    expect(res.total).toBe(20)
    expect(res.completa).toBe(true)
    expect(textoTotal(res)).toBe('20 / 27')
    expect(res.porPrueba['nine.una_pierna']).toMatchObject({ nota: 1, asimetria: true })
  })
})

describe('el nombre de cada vista en una frase', () => {
  it('lleva su preposición y nunca se dobla («de desde atrás»)', () => {
    for (const v of Object.keys(NOMBRE_VISTA) as (keyof typeof NOMBRE_VISTA)[]) {
      expect(DE_VISTA[v]).toMatch(/^(de|desde) /)
      expect(DE_VISTA[v]).not.toMatch(/^de desde/)
    }
    expect(DE_VISTA.atras).toBe('desde atrás')
  })
})
