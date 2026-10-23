import { describe, it, expect } from 'vitest'
import { BATERIAS, DE_VISTA, pruebaDe } from './baterias-movimiento'
import { FICHAS, MATERIAL, COMO_SE_PASA, DICE_DOLOR, fichaDe, grabarDosVistas, vistaPrincipal } from './fichas-movimiento'

const todas = Object.values(BATERIAS).flatMap(b => b.pruebas)

describe('cada prueba tiene su ficha', () => {
  it('con material, preparación, lo que se le dice, intentos y cómo se graba', () => {
    for (const p of todas) {
      const f = fichaDe(p.clave)
      expect(f, p.clave).not.toBeNull()
      expect(f!.material.length, p.clave).toBeGreaterThan(0)
      expect(f!.preparacion.length, p.clave).toBeGreaterThan(0)
      expect(f!.pasos.length, p.clave).toBeGreaterThan(0)
      expect(f!.intentos.trim(), p.clave).not.toBe('')
      expect(f!.grabar.length, p.clave).toBeGreaterThan(0)
    }
  })

  /* Si una prueba pide grabarla desde un sitio, su ficha tiene que decir cómo:
     la vista nueva de la diagonal (de perfil) no puede quedarse sin explicar. */
  it('dice cómo se graba cada vista que pide la prueba', () => {
    for (const p of todas) {
      const grabar = FICHAS[p.clave].grabar.map(g => g.toLowerCase())
      for (const v of p.vistas) expect(grabar.some(g => g.startsWith(DE_VISTA[v])), p.clave + ' · ' + v).toBe(true)
    }
  })

  it('no hay fichas de pruebas que no existen', () => {
    const claves = new Set(todas.map(p => p.clave))
    for (const k of Object.keys(FICHAS)) expect(claves.has(k), k).toBe(true)
  })

  it('cada prueba de dolor dice lo que se le pide', () => {
    for (const d of BATERIAS.fms.dolores) expect(DICE_DOLOR[d.clave], d.clave).toBeTruthy()
  })

  it('lo que es propuesta nuestra lleva su «ojo»; y las del Nine Test dicen que salen de las fotos', () => {
    for (const [k, f] of Object.entries(FICHAS)) if (f.ojoPropio) expect(f.ojo, k).toBeTruthy()
    for (const p of BATERIAS.nine.pruebas) expect(FICHAS[p.clave].deLaFoto, p.clave).toBe(true)
    expect(FICHAS['nine.diagonal'].vistaNueva).toBeTruthy()
    expect(FICHAS['nine.rotacion'].vistaNueva).toBeTruthy()
  })
})

describe('el material de la batería, antes de empezar', () => {
  it('cada batería trae el material, lo de la persona y lo de grabar, y cada cosa dice para qué es', () => {
    for (const b of Object.keys(BATERIAS) as (keyof typeof BATERIAS)[]) {
      const m = MATERIAL[b]
      for (const g of ['Material', 'La persona', 'Para grabar']) expect(m.some(x => x.grupo === g), b + ' · ' + g).toBe(true)
      for (const x of m) {
        expect(x.cosa.trim(), b).not.toBe('')
        expect(x.medida.trim(), b + ' · ' + x.cosa).not.toBe('')
        expect(x.para.trim(), b + ' · ' + x.cosa).not.toBe('')
      }
      expect(COMO_SE_PASA[b].reglas.length, b).toBeGreaterThan(0)
    }
  })

  it('las tablas de 2 y 4 cm del Nine Test y la de la rotación desde arriba están en la lista', () => {
    expect(MATERIAL.nine.some(x => /2 cm/.test(x.medida) && /4 cm/.test(x.medida))).toBe(true)
    expect(MATERIAL.nine.some(x => /rotación sentado/.test(x.para))).toBe(true)
  })
})

describe('las pruebas que se miran desde dos cámaras', () => {
  it('dicen cómo grabarlas con dos móviles y con uno; las de una vista, no', () => {
    for (const p of todas) {
      const g = grabarDosVistas(p)
      if (p.vistas.length === 2) {
        expect(g, p.clave).not.toBeNull()
        for (const v of p.vistas) expect(g!.conUno.includes(DE_VISTA[v]), p.clave + ' · ' + v).toBe(true)
      } else expect(g, p.clave).toBeNull()
    }
    expect(todas.filter(p => p.vistas.length === 2).length).toBe(6)
  })

  it('con un móvil, los dos primeros intentos van desde la vista con más criterios', () => {
    expect(vistaPrincipal(pruebaDe('fms.sentadilla')!)).toBe('perfil')
    expect(vistaPrincipal(pruebaDe('fms.valla')!)).toBe('frente')
    expect(vistaPrincipal(pruebaDe('fms.zancada')!)).toBe('perfil')
    expect(vistaPrincipal(pruebaDe('nine.diagonal')!)).toBe('atras')
    expect(grabarDosVistas(pruebaDe('fms.valla')!)!.conUno)
      .toMatch(/^Con cada lado, mueve el móvil entre intentos: el 1.º y el 2.º de frente y el 3.º de perfil/)
  })

  it('el material pide uno o dos móviles', () => {
    for (const b of ['fms', 'nine'] as const) {
      expect(MATERIAL[b].some(x => x.grupo === 'Para grabar' && /dos móviles/.test(x.cosa)), b).toBe(true)
    }
  })
})
