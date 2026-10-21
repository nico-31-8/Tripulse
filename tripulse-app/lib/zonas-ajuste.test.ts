import { describe, it, expect } from 'vitest'
import {
  leerAjustes, leerAjustesDeVarios, limiteAjustado, zonaAjustada, zonaEstaAjustada, clasificacionAjustada,
  borradorDe, ajustesDeBorrador, mismoBorrador, fronterasDe, pctDe, fronteraMovida, esfuerzoDeHito,
  moverFrontera, zonaALaPlantilla, ajustesParaGuardar, reanclarCopia, PASO_ESCRITO, type Borrador, type AjusteZona,
  asaHacia, historial, puedeDeshacer, HISTORIAL_VACIO, PASOS_DESHACER, type AccionHistorial,
  imanes, arrastrarFrontera, pasoFrontera, escribirLimite, pegadas, pegarZonas, separarZonas,
} from './zonas-ajuste'
import { evaluar, type Evaluacion } from './clasificaciones-zonas'
import { hitosDisponibles } from './hitos'
import { fuenteDeClasificacion, zonasDe, copiaPrescrita } from './prescripcion-zona'
import type { Clasificacion, ZonaEntrenador, Limite } from './zonas-entrenador'
import type { TestConMediciones } from './referencia-propia'
import type { DefinicionTest } from './test-definicion'
import type { Bloque } from './formula'

// Los porcentajes de una zona para un deportista (decidido el 20-10-2026):
// la clasificación es la plantilla y a cada persona se le corrigen los suyos.

const v = (n: string): Bloque => ({ t: 'var', v: n })
const PRUEBA: DefinicionTest = {
  nombre: 'Prueba de esfuerzo', deporte: 'Carrera',
  campos: [{ clave: 'vt1', etiqueta: 'VT1' }, { clave: 'vt2', etiqueta: 'VT2' }, { clave: 'vo2', etiqueta: 'VO2máx' }],
  resultados: [
    { nombre: 'VT1', unidad: 'km/h', ancla: 'umbral_aer', formula: [v('vt1')], graf: true },
    { nombre: 'VT2', unidad: 'km/h', ancla: 'umbral', formula: [v('vt2')], graf: true },
    { nombre: 'VO2máx', unidad: 'km/h', ancla: 'vo2max', formula: [v('vo2')], graf: true },
  ],
}
const prueba = (datos: Record<string, number>): TestConMediciones => ({
  id: 9, nombre: 'Prueba de esfuerzo', deporte: 'Carrera', def: PRUEBA,
  mediciones: [{ fecha: '2026-10-02', datos }],
})
const VT1 = 'propia:9:0', VT2 = 'propia:9:1', VO2 = 'propia:9:2'
const l = (ref: string, pct: number): Limite => ({ ref, pct })
const zona = (id: number, sigla: string, desde: Limite | null, hasta: Limite | null, orden: number): ZonaEntrenador => ({
  id, idClasificacion: 1, deporte: 'Carrera', sigla, nombre: sigla, desde, hasta, rpeMin: 5, rpeMax: null, color: '#4ade80', orden,
})

/* La de la maqueta del laboratorio: seis zonas, cada una empieza donde acaba la anterior. */
const LAB: Clasificacion = {
  id: 1, nombre: 'Laboratorio', deporte: 'Carrera', hitos: [VT1, VT2, VO2], orden: 0,
  zonas: [
    zona(11, 'REG', null, l(VT1, 100), 0),
    zona(12, 'BASE', l(VT1, 100), l(VT1, 115), 1),
    zona(13, 'TEMPO', l(VT1, 115), l(VT2, 95), 2),
    zona(14, 'UMB', l(VT2, 95), l(VT2, 105), 3),
    zona(15, 'VO2', l(VT2, 105), l(VO2, 100), 4),
    zona(16, 'MAX', l(VO2, 100), null, 5),
  ],
}
const ANA = [prueba({ vt1: 12, vt2: 15, vo2: 17.5 })]
const evAna = (c: Clasificacion = LAB) => evaluar(c, hitosDisponibles('Carrera', ANA), {}, ANA)
const texto = (ev: Evaluacion, sigla: string) => ev.zonas.find(z => z.zona.sigla === sigla)?.texto
const fr = (nombre: string) => fronterasDe(LAB).find(f => f.nombre === nombre)!

describe('leer lo guardado', () => {
  it('una fila por zona; lo que no tiene la forma no cuenta', () => {
    const m = leerAjustes([
      { id_zona: 14, desde: { ref: VT2, pct: 93 }, hasta: null },
      { id_zona: 15, desde: { ref: 'vt2', pct: 93 }, hasta: { ref: VT2, pct: 0 } },
      { id_zona: 0, desde: { ref: VT2, pct: 93 } },
      { id_zona: 16, desde: null, hasta: null },
    ])
    expect([...m.keys()]).toEqual([14])
    expect(m.get(14)).toEqual({ idZona: 14, desde: { ref: VT2, pct: 93 }, hasta: null })
  })

  it('las de varios deportistas, cada uno con las suyas', () => {
    const m = leerAjustesDeVarios([
      { id_deportista: 7, id_zona: 14, desde: { ref: VT2, pct: 93 } },
      { id_deportista: 7, id_zona: 15, hasta: { ref: VO2, pct: 98 } },
      { id_deportista: 8, id_zona: 14, hasta: { ref: VT2, pct: 104 } },
    ])
    expect([...m.get(7)!.keys()]).toEqual([14, 15])
    expect(m.get(8)!.get(14)!.hasta).toEqual({ ref: VT2, pct: 104 })
  })
})

describe('aplicar lo suyo', () => {
  it('su % si cuelga del mismo hito; si la zona cambió de hito, el de la plantilla', () => {
    expect(limiteAjustado(l(VT2, 95), l(VT2, 93))).toEqual(l(VT2, 93))
    expect(limiteAjustado(l(VT2, 95), l(VT1, 93))).toEqual(l(VT2, 95))
    expect(limiteAjustado(l(VT2, 95), null)).toEqual(l(VT2, 95))
    /* Si la plantilla ya no tiene ese límite, no se inventa uno. */
    expect(limiteAjustado(null, l(VT2, 93))).toBeNull()
  })

  it('la clasificación sin nada suyo es la misma; con algo, solo cambia esa zona', () => {
    expect(clasificacionAjustada(LAB, new Map())).toBe(LAB)
    const a: AjusteZona = { idZona: 14, desde: l(VT2, 93), hasta: null }
    const c = clasificacionAjustada(LAB, new Map([[14, a]]))
    expect(c).not.toBe(LAB)
    expect(c.zonas[3].desde).toEqual(l(VT2, 93))
    expect(c.zonas[3].hasta).toEqual(l(VT2, 105))
    expect(c.zonas[2]).toBe(LAB.zonas[2])
    expect(zonaEstaAjustada(LAB.zonas[3], a)).toBe(true)
    expect(zonaAjustada(LAB.zonas[3], { idZona: 14, desde: l(VT2, 95), hasta: null })).toBe(LAB.zonas[3])
  })

  it('su escalera sale con sus porcentajes', () => {
    /* TEMPO de Ana: del 115 % de su VT1 (13,8) al 95 % de su VT2 (14,25). */
    expect(texto(evAna(), 'TEMPO')).toBe('4:13–4:21 /km')
    const c = clasificacionAjustada(LAB, new Map([[13, { idZona: 13, desde: l(VT1, 110), hasta: null }]]))
    /* Ahora desde el 110 % (13,2 km/h): su ritmo lento pasa a 4:33. */
    expect(texto(evAna(c), 'TEMPO')).toBe('4:13–4:33 /km')
  })

  it('al prescribirle, la copia que se congela lleva SUS porcentajes', () => {
    const c = clasificacionAjustada(LAB, new Map([[14, { idZona: 14, desde: l(VT2, 93), hasta: l(VT2, 100) }]]))
    const f = fuenteDeClasificacion(c, hitosDisponibles('Carrera', ANA), {}, ANA)
    const umb = zonasDe(f).find(z => z.sigla === 'UMB')!
    const copia = copiaPrescrita(f, umb, null, null)!
    expect(copia.desde).toMatchObject({ ref: VT2, pct: 93 })
    expect(copia.hasta).toMatchObject({ ref: VT2, pct: 100 })
  })
})

describe('las fronteras', () => {
  it('cada zona que empieza donde acaba la anterior comparte frontera con ella', () => {
    expect(fronterasDe(LAB).map(f => f.nombre)).toEqual(['REG | BASE', 'BASE | TEMPO', 'TEMPO | UMB', 'UMB | VO2', 'VO2 | MAX'])
    expect(fr('TEMPO | UMB')).toEqual({ claves: [{ idZona: 13, lado: 'hasta' }, { idZona: 14, lado: 'desde' }], ref: VT2, nombre: 'TEMPO | UMB' })
  })

  it('con un hueco en la plantilla, cada borde va suelto', () => {
    const conHueco: Clasificacion = { ...LAB, zonas: LAB.zonas.map(z => (z.sigla === 'TEMPO' ? { ...z, desde: l(VT1, 116) } : z)) }
    const n = fronterasDe(conHueco).map(f => f.nombre)
    expect(n).toContain('Acaba BASE')
    expect(n).toContain('Empieza TEMPO')
    expect(n).not.toContain('BASE | TEMPO')
  })

  it('una zona sin guardar todavía no tiene fronteras que ajustar', () => {
    const nueva: Clasificacion = { ...LAB, zonas: [...LAB.zonas.slice(0, 5), { ...LAB.zonas[5], id: undefined }] }
    expect(fronterasDe(nueva).map(f => f.nombre)).toEqual(['REG | BASE', 'BASE | TEMPO', 'TEMPO | UMB', 'UMB | VO2', 'Acaba VO2'])
  })
})

describe('mover una frontera', () => {
  it('mueve las dos zonas que la comparten', () => {
    const { borrador, pct } = moverFrontera(LAB, fr('BASE | TEMPO'), 112.3, {}, evAna())
    expect(pct).toBe(112.5)
    expect(borrador).toEqual({ 12: { hasta: 112.5 }, 13: { desde: 112.5 } })
    expect(fronteraMovida(borrador, fr('BASE | TEMPO'))).toBe(true)
    expect(pctDe(LAB, borrador, { idZona: 13, lado: 'desde' })).toBe(112.5)
  })

  it('ninguna zona queda del revés: no pasa del otro extremo de sus zonas', () => {
    /* TEMPO acaba en el 95 % de su VT2 = 14,25 km/h = el 118,75 % de su VT1.
       Más allá, TEMPO quedaría del revés: se queda en 118 (medio punto antes). */
    const { pct } = moverFrontera(LAB, fr('BASE | TEMPO'), 140, {}, evAna())
    expect(pct).toBe(118)
    /* Y hacia abajo, BASE empieza en el 100 % de su VT1: se queda en 100,5. */
    expect(moverFrontera(LAB, fr('BASE | TEMPO'), 80, {}, evAna()).pct).toBe(100.5)
  })

  it('volver al % de la plantilla deja de contar como ajuste', () => {
    const una = moverFrontera(LAB, fr('UMB | VO2'), 103, {}, evAna()).borrador
    expect(una).toEqual({ 14: { hasta: 103 }, 15: { desde: 103 } })
    expect(moverFrontera(LAB, fr('UMB | VO2'), 105, una, evAna()).borrador).toEqual({})
  })

  it('escribiendo, de décima en décima', () => {
    expect(moverFrontera(LAB, fr('UMB | VO2'), 103.27, {}, evAna(), PASO_ESCRITO).pct).toBe(103.3)
  })

  it('sin su número no se puede mover (no hay dónde ponerla)', () => {
    const sinPrueba = evaluar(LAB, hitosDisponibles('Carrera', []), {}, [])
    const r = moverFrontera(LAB, fr('UMB | VO2'), 103, {}, sinPrueba)
    expect(r.borrador).toEqual({})
    expect(r.pct).toBe(105)
  })

  it('también en un ritmo, donde un número más bajo es ir más fuerte', () => {
    /* Natación en s/100: el esfuerzo es el inverso. 100 % de 90 s es 1:30; el 105 % va más fuerte. */
    const T = 'propia:5:0'
    const c: Clasificacion = {
      id: 2, nombre: 'Piscina', deporte: 'Natacion', hitos: [T], orden: 0,
      zonas: [
        { ...zona(21, 'SUAVE', null, l(T, 95), 0), deporte: 'Natacion' },
        { ...zona(22, 'RITMO', l(T, 95), l(T, 105), 1), deporte: 'Natacion' },
      ],
    }
    const ev = {
      unidad: 's/100', inverso: true, avisos: [], faltan: [], zonas: [],
      hitos: [{ id: T, hito: { id: T, corto: 'T100', largo: 'T100', unidad: 's/100', inverso: true, tipo: 'propia' as const }, valor: 90, fecha: null }],
    } as unknown as Evaluacion
    expect(esfuerzoDeHito(ev, T)).toBeCloseTo(1 / 90, 10)
    const f = fronterasDe(c).find(x => x.nombre === 'SUAVE | RITMO')!
    expect(moverFrontera(c, f, 97, {}, ev).borrador).toEqual({ 21: { hasta: 97 }, 22: { desde: 97 } })
    /* No puede pasar del final de RITMO (105 %). */
    expect(moverFrontera(c, f, 120, {}, ev).pct).toBe(104.5)
  })
})

describe('volver a la plantilla', () => {
  it('una zona vuelve con sus dos fronteras, también en las vecinas', () => {
    let b: Borrador = {}
    b = moverFrontera(LAB, fr('BASE | TEMPO'), 112, b, evAna()).borrador
    b = moverFrontera(LAB, fr('TEMPO | UMB'), 93, b, evAna()).borrador
    b = moverFrontera(LAB, fr('UMB | VO2'), 103, b, evAna()).borrador
    expect(Object.keys(b).sort()).toEqual(['12', '13', '14', '15'])
    const tras = zonaALaPlantilla(LAB, b, 13)
    /* TEMPO y sus vecinas por esas fronteras vuelven; UMB | VO2 sigue movida. */
    expect(tras).toEqual({ 14: { hasta: 103 }, 15: { desde: 103 } })
  })
})

describe('del borrador a lo guardado y vuelta', () => {
  it('el borrador de lo guardado solo lleva lo que de verdad le aplica', () => {
    const guardado = new Map<number, AjusteZona>([
      [14, { idZona: 14, desde: l(VT2, 93), hasta: l(VT2, 105) }],
      [15, { idZona: 15, desde: l(VT1, 120), hasta: null }],
    ])
    /* El 105 de UMB es el de la plantilla; el de VO2 cuelga de otro hito. */
    expect(borradorDe([LAB], guardado)).toEqual({ 14: { desde: 93 } })
  })

  it('ida y vuelta', () => {
    const b: Borrador = { 14: { desde: 93, hasta: 100 } }
    expect(borradorDe([LAB], ajustesDeBorrador(b, [LAB]))).toEqual(b)
    expect(mismoBorrador(b, { 14: { hasta: 100, desde: 93 } })).toBe(true)
    expect(mismoBorrador(b, {})).toBe(false)
  })

  it('al guardar: una fila con solo lo movido, y se borra lo que vuelve a la plantilla', () => {
    const b: Borrador = { 13: { hasta: 93 }, 14: { desde: 93 } }
    const r = ajustesParaGuardar([LAB], b, 7, [14, 16], '2026-10-20T10:00:00.000Z')
    expect(r.filas).toEqual([
      { id_zona: 13, id_deportista: 7, desde: null, hasta: { ref: VT2, pct: 93 }, ajustado_en: '2026-10-20T10:00:00.000Z' },
      { id_zona: 14, id_deportista: 7, desde: { ref: VT2, pct: 93 }, hasta: null, ajustado_en: '2026-10-20T10:00:00.000Z' },
    ])
    /* La 16 tenía algo guardado y ya no: se borra. La 14 sigue ajustada: no. */
    expect(r.borrar).toEqual([16])
  })
})

describe('volcar a otra persona: cada uno con los suyos', () => {
  const copiaDe = (c: Clasificacion, sigla: string, min: number | null = null, max: number | null = null) => {
    const f = fuenteDeClasificacion(c, hitosDisponibles('Carrera', ANA), {}, ANA)
    return copiaPrescrita(f, zonasDe(f).find(z => z.sigla === sigla)!, min, max)!
  }
  const TEMPO = LAB.zonas[2], UMB = LAB.zonas[3]
  const suyo = (idZona: number, desde: Limite | null, hasta: Limite | null): AjusteZona => ({ idZona, desde, hasta })

  it('la zona mandada entera llega con SUS porcentajes', () => {
    const copia = copiaDe(LAB, 'UMB')
    const r = reanclarCopia(copia, UMB, null, suyo(14, l(VT2, 93), l(VT2, 100)))
    expect(r.desde).toEqual({ ref: VT2, pct: 93, corto: copia.desde!.corto })
    expect(r.hasta).toEqual({ ref: VT2, pct: 100, corto: copia.hasta!.corto })
    /* La de un hito lleva además su tramo afinable: el de esa persona. */
    expect([r.pctMin, r.pctMax]).toEqual([93, 100])
    expect(r.sigla).toBe('UMB')
  })

  it('quien no tiene nada suyo la recibe tal cual', () => {
    const copia = copiaDe(LAB, 'UMB')
    expect(reanclarCopia(copia, UMB, null, null)).toBe(copia)
  })

  it('la de dos hitos también, sin inventarse un tramo', () => {
    const copia = copiaDe(LAB, 'TEMPO')
    const r = reanclarCopia(copia, TEMPO, null, suyo(13, null, l(VT2, 93)))
    expect(r.desde).toMatchObject({ ref: VT1, pct: 115 })
    expect(r.hasta).toMatchObject({ ref: VT2, pct: 93 })
    expect([r.pctMin, r.pctMax, r.refId]).toEqual([0, 0, ''])
  })

  it('si la ficha del grupo tenía los suyos, se parte de ellos', () => {
    const deLaFicha = suyo(14, l(VT2, 96), null)
    const copia = copiaDe(clasificacionAjustada(LAB, new Map([[14, deLaFicha]])), 'UMB')
    expect(copia.desde).toMatchObject({ pct: 96 })
    /* Quien no tiene nada suyo recibe la plantilla, no los de la ficha. */
    const r = reanclarCopia(copia, UMB, deLaFicha, null)
    expect(r.desde).toMatchObject({ ref: VT2, pct: 95 })
    expect([r.pctMin, r.pctMax]).toEqual([95, 105])
  })

  it('lo afinado a mano se respeta: ese número lo escribió el entrenador', () => {
    const copia = copiaDe(LAB, 'UMB', 98, 100)
    expect(copia.desde).toMatchObject({ pct: 98 })
    expect(reanclarCopia(copia, UMB, null, suyo(14, l(VT2, 93), l(VT2, 100)))).toBe(copia)
  })

  it('si la zona cambió desde que se mandó, también', () => {
    const copia = copiaDe(LAB, 'UMB')
    expect(reanclarCopia(copia, { ...UMB, desde: l(VT2, 94) }, null, suyo(14, l(VT2, 93), null))).toBe(copia)
  })

  it('una zona de la app no se toca', () => {
    const copia = { sigla: 'AEM', nombre: 'AEM', color: '#000', rpe: 4, nivel: 2, pctMin: 70, pctMax: 80, refId: 'app:vam', refEtiqueta: 'VAM' }
    expect(reanclarCopia(copia, UMB, null, suyo(14, l(VT2, 93), null))).toBe(copia)
  })
})

/*
  Lo que encontró el usuario el 20-10-2026 con «Zonas Miguel», tal como está en
  la base: N2 acaba en el 115 % del VT1 y N3 empieza en el 116 % (no comparten
  frontera), y N5 va del 100 % al 100 % de su VO2. Al llevar N3 | N4 hasta el
  VT2, quedó encima de «Empieza N3»: se cogía siempre la de encima, que no
  puede ir a la izquierda, y parecía que no se podía mover ninguna.
*/
const MIGUEL: Clasificacion = {
  id: 3, nombre: 'Zonas Miguel', deporte: 'Carrera', hitos: [VT1, VT2, VO2], orden: 0,
  zonas: [
    zona(24, 'N1', null, l(VT1, 100), 0),
    zona(25, 'N2', l(VT1, 100), l(VT1, 115), 1),
    zona(26, 'N3', l(VT1, 116), l(VT2, 95), 2),
    zona(27, 'N4', l(VT2, 95), l(VT2, 105), 3),
    zona(28, 'N5', l(VO2, 100), l(VO2, 100), 4),
  ],
}
/* Los números de Nico: VT1 12, VT2 14 y VO2 15,5 km/h. */
const NICO = [prueba({ vt1: 12, vt2: 14, vo2: 15.5 })]
const evNico = (c: Clasificacion = MIGUEL) => evaluar(c, hitosDisponibles('Carrera', NICO), {}, NICO)

describe('dos asas en el mismo sitio', () => {
  const ev = evNico()
  const fs = fronterasDe(MIGUEL)
  const i = (nombre: string) => fs.findIndex(f => f.nombre === nombre)

  it('en el orden de la escalera, el principio de cada zona va antes que su final', () => {
    expect(fs.map(f => f.nombre)).toEqual(['N1 | N2', 'Acaba N2', 'Empieza N3', 'N3 | N4', 'Acaba N4', 'Empieza N5', 'Acaba N5'])
  })

  it('la de encima no puede ir a la izquierda; la de debajo, sí', () => {
    const b = moverFrontera(MIGUEL, fs[i('N3 | N4')], 100, {}, ev).borrador
    /* N3 empieza a 13,92 km/h (el 116 % de 12) y acaba ya a 14: casi sin anchura. */
    expect(moverFrontera(MIGUEL, fs[i('N3 | N4')], 97, b, ev).pct).toBe(100)
    expect(moverFrontera(MIGUEL, fs[i('Empieza N3')], 110, b, ev).pct).toBe(110)
  })

  it('hacia la izquierda se coge la que empieza la zona; hacia la derecha, la que la acaba', () => {
    const juntas = [i('N3 | N4'), i('Empieza N3')]
    expect(asaHacia(juntas, -1)).toBe(i('Empieza N3'))
    expect(asaHacia(juntas, 1)).toBe(i('N3 | N4'))
    /* La N5, del 100 % al 100 %: sus dos asas en el mismo punto. */
    expect(asaHacia([i('Acaba N5'), i('Empieza N5')], -1)).toBe(i('Empieza N5'))
    expect(moverFrontera(MIGUEL, fs[i('Empieza N5')], 98, {}, ev).pct).toBe(98)
    expect(asaHacia([], 1)).toBeNull()
  })
})

describe('deshacer', () => {
  const B = (pct: number): Borrador => ({ 14: { desde: pct } })
  const cambio = (pct: number, grupo: string | null, clasif = 1): AccionHistorial =>
    ({ tipo: 'cambiar', hacer: () => B(pct), base: {}, grupo, clasif })
  const deshacer: AccionHistorial = { tipo: 'deshacer', clasif: 1 }
  const tras = (...as: AccionHistorial[]) => as.reduce(historial, HISTORIAL_VACIO)

  it('un arrastre entero es un paso: se deshace de una vez', () => {
    const h = tras(cambio(94, 'arrastre-1'), cambio(93, 'arrastre-1'), cambio(92, 'arrastre-1'))
    expect(h.borrador).toEqual(B(92))
    const d = historial(h, deshacer)
    expect(d.borrador).toEqual({})
    expect(puedeDeshacer(d, 1)).toBe(false)
  })

  it('cada flecha es un paso, y se deshace tantas veces como haga falta', () => {
    /* Las flechas van sin grupo: cada una es su propio paso, aunque vengan seguidas. */
    let h = tras(cambio(94.5, null), cambio(94, null), cambio(93.5, null))
    expect(h.atras).toEqual([{}, B(94.5), B(94)])
    h = historial(h, deshacer); expect(h.borrador).toEqual(B(94))
    h = historial(h, deshacer); expect(h.borrador).toEqual(B(94.5))
    h = historial(h, deshacer); expect(h.borrador).toEqual({})
    /* Sin nada más atrás, no hace nada. */
    expect(historial(h, deshacer)).toBe(h)
  })

  it('lo que no cambia nada no es un paso', () => {
    const h = tras(cambio(94, 'paso-1'))
    expect(historial(h, cambio(94, 'paso-2'))).toBe(h)
  })

  it('un arrastre que vuelve a donde empezó no deja nada; si sigue moviéndose, sí', () => {
    let h = tras(cambio(94, 'arrastre-1'))
    h = historial(h, { tipo: 'cambiar', hacer: () => ({}), base: {}, grupo: 'arrastre-1', clasif: 1 })
    expect(puedeDeshacer(h, 1)).toBe(false)
    h = historial(h, cambio(93, 'arrastre-1'))
    expect(h.atras).toEqual([{}])
  })

  it('después de guardar también se deshace, y vuelve como cambio sin guardar', () => {
    let h = tras(cambio(93, 'casilla-14desde'))
    h = historial(h, { tipo: 'guardado' })
    expect(h.borrador).toBeNull()
    h = historial(h, deshacer)
    /* Lo guardado ahora es el 93; lo deshecho, la plantilla: hay que volver a guardar. */
    expect(h.borrador).toEqual({})
    expect(mismoBorrador(h.borrador!, B(93))).toBe(false)
  })

  it('lo de otra clasificación no se deshace desde aquí', () => {
    const h = tras(cambio(93, 'paso-1', 1))
    expect(puedeDeshacer(h, 2)).toBe(false)
    expect(historial(h, { tipo: 'deshacer', clasif: 2 })).toBe(h)
    /* Un cambio en otra empieza su propia cuenta, y deshacerlo no toca lo de la primera. */
    const h2 = historial(h, { tipo: 'cambiar', hacer: b => ({ ...b, 30: { hasta: 90 } }), base: {}, grupo: 'paso-2', clasif: 2 })
    expect(puedeDeshacer(h2, 1)).toBe(false)
    expect(historial(h2, { tipo: 'deshacer', clasif: 2 }).borrador).toEqual(B(93))
  })

  it('otro deportista empieza de cero', () => {
    expect(historial(tras(cambio(93, 'paso-1')), { tipo: 'empezar' })).toEqual(HISTORIAL_VACIO)
  })

  it('se guardan como mucho PASOS_DESHACER pasos', () => {
    const muchos = Array.from({ length: PASOS_DESHACER + 5 }, (_, k) => cambio(50 + k, 'paso-' + k))
    expect(tras(...muchos).atras).toHaveLength(PASOS_DESHACER)
  })

  it('con la escalera de verdad: arrastrar dos fronteras y deshacer una a una', () => {
    const mover = (nombre: string, pct: number, grupo: string): AccionHistorial =>
      ({ tipo: 'cambiar', hacer: b => moverFrontera(LAB, fr(nombre), pct, b, evAna()).borrador, base: {}, grupo, clasif: 1 })
    let h = tras(mover('BASE | TEMPO', 113, 'arrastre-1'), mover('BASE | TEMPO', 112, 'arrastre-1'), mover('UMB | VO2', 103, 'arrastre-2'))
    expect(h.borrador).toEqual({ 12: { hasta: 112 }, 13: { desde: 112 }, 14: { hasta: 103 }, 15: { desde: 103 } })
    h = historial(h, deshacer)
    expect(h.borrador).toEqual({ 12: { hasta: 112 }, 13: { desde: 112 } })
    h = historial(h, deshacer)
    expect(h.borrador).toEqual({})
  })
})

/*
  Juntar dos zonas (pedido el 20-10-2026): «que donde acabe una empiece otra».
  En «Zonas Miguel», N2 acaba en el 115 % del VT1 y N3 empieza en el 116 %, y
  N4 acaba en el 105 % del VT2 mientras N5 empieza en el 100 % del VO2. Al
  arrastrar un borde cerca del de la zona de al lado se pega exacto, y desde
  entonces las dos se mueven a la vez.
*/
describe('juntar dos zonas', () => {
  const ev = evNico()
  const de = (b: Borrador, nombre: string) => fronterasDe(MIGUEL, b, ev).find(f => f.nombre === nombre)!
  const avisos = (b: Borrador) => evNico(clasificacionAjustada(MIGUEL, ajustesDeBorrador(b, [MIGUEL]))).avisos
  const entre = (b: Borrador, x: string, y: string) =>
    avisos(b).filter(a => a.tipo !== 'reves' && a.siglas.includes(x) && a.siglas.includes(y))
  /* Con N3 | N4 en su VT2 (14 km/h), N3 ya no queda del revés. */
  const conN3 = moverFrontera(MIGUEL, fronterasDe(MIGUEL)[3], 100, {}, ev).borrador

  it('dos bordes en el mismo punto son una sola frontera; separados, dos', () => {
    expect(fronterasDe(MIGUEL, {}, ev).map(f => f.nombre)).toContain('Acaba N2')
    const juntas = fronterasDe(MIGUEL, { 25: { hasta: 112 }, 26: { desde: 112 } }, ev).map(f => f.nombre)
    expect(juntas).toContain('N2 | N3')
    expect(juntas).not.toContain('Acaba N2')
    expect(juntas).not.toContain('Empieza N3')
  })

  it('arrastrado cerca del borde de la de al lado, se pega exacto y quedan juntas', () => {
    expect(imanes(MIGUEL, conN3, de(conN3, 'Empieza N3'), ev)).toEqual([13.8])
    /* N2 acaba a 13,8 km/h (el 115 % de 12). Se suelta a 13,83: se pega. */
    const b = arrastrarFrontera(MIGUEL, de(conN3, 'Empieza N3'), 13.83, conN3, ev, 0.05)
    expect(b[26].desde).toBe(115)
    expect(de(b, 'N2 | N3').claves).toEqual([{ idZona: 25, lado: 'hasta' }, { idZona: 26, lado: 'desde' }])
    expect(entre(b, 'N2', 'N3')).toEqual([])
    /* Y ya se mueven a la vez. */
    const luego = moverFrontera(MIGUEL, de(b, 'N2 | N3'), 112, b, ev).borrador
    expect([luego[25].hasta, luego[26].desde]).toEqual([112, 112])
  })

  it('más lejos no se pega: va de medio en medio punto', () => {
    const b = arrastrarFrontera(MIGUEL, de(conN3, 'Empieza N3'), 13.9, conN3, ev, 0.05)
    /* 13,9 km/h = el 115,8 % → 116, que es el de la plantilla. */
    expect(b[26].desde).toBeUndefined()
    expect(fronterasDe(MIGUEL, b, ev).map(f => f.nombre)).toContain('Empieza N3')
  })

  it('entre dos hitos: N5 empieza donde acaba N4, con el % de SU VO2', () => {
    /* N4 acaba a 14,7 km/h (el 105 % de 14) = el 94,84 % de su VO2 (15,5). */
    const b = arrastrarFrontera(MIGUEL, de({}, 'Empieza N5'), 14.72, {}, ev, 0.05)
    expect(b[28].desde).toBeCloseTo(94.83871, 5)
    expect(de(b, 'N4 | N5').claves).toEqual([{ idZona: 27, lado: 'hasta' }, { idZona: 28, lado: 'desde' }])
    expect(entre(b, 'N4', 'N5')).toEqual([])
    /* Juntas, se mueven a la vez y siguen sin hueco: N4 al 104 % de su VT2. */
    const luego = moverFrontera(MIGUEL, de(b, 'N4 | N5'), 104, b, ev).borrador
    expect(luego[27].hasta).toBe(104)
    expect(luego[28].desde).toBeCloseTo((104 * 14) / 15.5, 5)
    expect(entre(luego, 'N4', 'N5')).toEqual([])
    expect(fronterasDe(MIGUEL, luego, ev).map(f => f.nombre)).toContain('N4 | N5')
  })

  it('con las flechas, el asa se para en el borde de la de al lado', () => {
    const b: Borrador = { ...conN3, 25: { hasta: 110.5 }, 26: { ...conN3[26], desde: 112 } }
    /* De 112 con Mayúsculas iría a 109,5, pero N2 acaba en 110,5: se para ahí. */
    const tras = pasoFrontera(MIGUEL, de(b, 'Empieza N3'), -1, true, b, ev)
    expect(tras[26].desde).toBe(110.5)
    expect(fronterasDe(MIGUEL, tras, ev).map(f => f.nombre)).toContain('N2 | N3')
    /* Lejos de nada, un paso normal. */
    expect(pasoFrontera(MIGUEL, de(b, 'Empieza N3'), 1, false, b, ev)[26].desde).toBe(112.5)
  })

  it('escribiendo el % de N5 en su casilla (de su VO2), N4 se va al mismo punto', () => {
    const juntas = arrastrarFrontera(MIGUEL, de({}, 'Empieza N5'), 14.7, {}, ev, 0.05)
    const b = escribirLimite(MIGUEL, de(juntas, 'N4 | N5'), { idZona: 28, lado: 'desde' }, 95, juntas, ev)
    expect(b[28].desde).toBeCloseTo(95, 5)
    /* El 95 % de 15,5 = 14,725 km/h = el 105,18 % de su VT2. */
    expect(b[27].hasta).toBeCloseTo(105.178571, 5)
    expect(entre(b, 'N4', 'N5')).toEqual([])
    /* Y en la de su propio hito, como siempre: de décima en décima. */
    expect(escribirLimite(MIGUEL, de(juntas, 'N4 | N5'), { idZona: 27, lado: 'hasta' }, 104.27, juntas, ev)[27].hasta).toBe(104.3)
  })

  it('«↺ General» en una zona juntada devuelve también el borde de su vecina', () => {
    const b: Borrador = { 25: { hasta: 112 }, 26: { desde: 112, hasta: 100 }, 27: { desde: 100 } }
    expect(zonaALaPlantilla(MIGUEL, b, 26, ev)).toEqual({})
  })
})

/*
  Pegar y separar con un botón (pedido el 20-10-2026: «¿cómo hago para
  separarlo, o si están separados juntarlos?»). Arrastrando se pegan, pero
  pegadas se mueven siempre juntas: separarlas necesitaba su propio gesto.
*/
describe('pegar y separar dos zonas', () => {
  it('separar: la siguiente empieza medio punto después, y son dos asas', () => {
    const ev = evAna()
    expect(pegadas(LAB, {}, ev, 12, 13)).toBe(true)
    const b = separarZonas(LAB, {}, ev, 12, 13)
    expect(b).toEqual({ 13: { desde: 115.5 } })
    expect(pegadas(LAB, b, ev, 12, 13)).toBe(false)
    expect(fronterasDe(LAB, b, ev).map(f => f.nombre)).toEqual(expect.arrayContaining(['Acaba BASE', 'Empieza TEMPO']))
    /* Y pegar las devuelve a donde estaban. */
    expect(pegarZonas(LAB, b, ev, 12, 13)).toEqual({})
  })

  it('pegar entre hitos distintos: N5 empieza donde acaba N4, con el % de su VO2', () => {
    const ev = evNico()
    const b = pegarZonas(MIGUEL, {}, ev, 27, 28)
    expect(b[28].desde).toBeCloseTo(94.83871, 5)
    expect(pegadas(MIGUEL, b, ev, 27, 28)).toBe(true)
  })

  it('si la siguiente no puede ir (quedaría del revés), se mueve el final de la anterior', () => {
    /* Con la plantilla, N3 le queda del revés a Nico: no puede empezar en el 115 %. */
    const ev = evNico()
    const b = pegarZonas(MIGUEL, {}, ev, 25, 26)
    expect(b).toEqual({ 25: { hasta: 116 } })
    expect(pegadas(MIGUEL, b, ev, 25, 26)).toBe(true)
  })

  it('lo que ya está como se pide no se toca', () => {
    const ev = evAna()
    const separadas = separarZonas(LAB, {}, ev, 12, 13)
    expect(separarZonas(LAB, separadas, ev, 12, 13)).toBe(separadas)
    const juntas = {}
    expect(pegarZonas(LAB, juntas, ev, 12, 13)).toBe(juntas)
  })
})
