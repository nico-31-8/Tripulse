import { describe, it, expect } from 'vitest'
import {
  ANCLA_DE, idApp, idPropia, leerIdPropia, referenciasDe, buscarReferencia,
  zonasDe, buscarZona, rangoInicial, acotar, seSale, estaAfinada,
  tramoDe, textoTramo, copiaPrescrita, leerCopia, cargaDeTarea, COLUMNAS_ZONA, tareaPico, objetivoDeCopia, cuelgaDeTestPropio,
  type Referencia, type ZonaOfrecida,
} from './prescripcion-zona'
import { cargaZona } from './zonas'
import type { TestConMediciones } from './referencia-propia'
import type { ZonaEntrenador } from './zonas-entrenador'
import type { DefinicionTest, ResultadoTest } from './test-definicion'
import type { Bloque } from './formula'

const v = (n: string): Bloque => ({ t: 'var', v: n })
const op = (o: string): Bloque => ({ t: 'op', v: o })
const num = (n: number): Bloque => ({ t: 'num', v: n })

/* El 6×100 real del usuario: la suma de los seis, dividida entre seis. */
const RITMO100: ResultadoTest = {
  nombre: 'Ritmo100', unidad: 's/100', ancla: 'especifica',
  formula: [v('suma'), op('/'), num(6)], graf: true,
}

const DEF_6X100: DefinicionTest = {
  nombre: '6x100', deporte: 'Natacion',
  campos: [{ clave: 'suma', etiqueta: 'Segundos sumados' }],
  resultados: [RITMO100],
}

const TEST_6X100: TestConMediciones = {
  id: 2, nombre: '6x100', deporte: 'Natacion', def: DEF_6X100,
  mediciones: [{ fecha: '2026-09-08', datos: { suma: 456 } }],   // → 76 s/100
}

/* Sus zonas, tal como están guardadas: colgando del Ritmo100. */
const REF_RITMO = { idDefinicion: 2, indice: 0 }
const mia = (extra: Partial<ZonaEntrenador> = {}): ZonaEntrenador => ({
  deporte: 'Natacion', sigla: 'SUA', nombre: 'Suave', pctMin: 88, pctMax: 94,
  rpeMin: 3, rpeMax: 4, color: '#a78bfa', orden: 0, ref: REF_RITMO, ...extra,
})
const MIAS: ZonaEntrenador[] = [
  mia(),
  mia({ sigla: 'UMB', nombre: 'Umbral', pctMin: 98, pctMax: 102, rpeMin: 6, rpeMax: 7, orden: 1 }),
  mia({ sigla: 'MAX', nombre: 'Máximo', pctMin: 103, pctMax: 107, rpeMin: 8, rpeMax: null, orden: 2 }),
]

const TESTS_APP = { vam: 16, ftp: 245, css: 1.28 }

const refCarrera = () => referenciasDe('Carrera', TESTS_APP, [])[0]
const refNatApp  = () => referenciasDe('Natacion', TESTS_APP, [])[0]
const refPropia  = () => referenciasDe('Natacion', TESTS_APP, [TEST_6X100])[1]

// ============================================================

describe('el identificador de una referencia', () => {
  it('va y vuelve', () => {
    expect(idApp('vam')).toBe('app:vam')
    expect(idPropia(7, 0)).toBe('propia:7:0')
    expect(leerIdPropia('propia:7:0')).toEqual({ idDefinicion: 7, indice: 0 })
  })

  it('EL RESULTADO 0 NO SE PIERDE POR SER CERO', () => {
    // El primer resultado de un test tiene índice 0, que es falsy. Es el mismo
    // sitio donde ya nos mordió al leer las zonas desde la base.
    expect(leerIdPropia('propia:7:0')?.indice).toBe(0)
  })

  it('lo que no es una referencia propia vuelve nulo', () => {
    expect(leerIdPropia('app:vam')).toBeNull()
    expect(leerIdPropia('propia:7')).toBeNull()
    expect(leerIdPropia('')).toBeNull()
    expect(leerIdPropia('propia:x:0')).toBeNull()
  })
})

describe('qué referencias tiene un atleta', () => {
  it('la de la app de ese deporte, siempre la primera', () => {
    const r = referenciasDe('Carrera', TESTS_APP, [TEST_6X100])
    expect(r).toHaveLength(1)
    expect(r[0].etiqueta).toBe('Su VAM')
    expect(r[0].valor).toBe(16)
  })

  it('más las suyas del mismo deporte', () => {
    const r = referenciasDe('Natacion', TESTS_APP, [TEST_6X100])
    expect(r.map(x => x.etiqueta)).toEqual(['Su CSS', '6x100 · Ritmo100'])
    expect(r[1].valor).toBe(76)
    expect(r[1].fecha).toBe('2026-09-08')
  })

  it('UN TEST DE OTRO DEPORTE NO SE OFRECE', () => {
    // Daría un ritmo de piscina salido de una velocidad de asfalto.
    expect(referenciasDe('Ciclismo', TESTS_APP, [TEST_6X100]).map(x => x.tipo)).toEqual(['app'])
  })

  it('EL CSS SE PASA A SEGUNDOS POR 100 AQUÍ, una sola vez', () => {
    /* En la base se guarda en m/s y sus zonas se cuentan en segundos sobre él.
       Convertirlo en cada pantalla que lo enseñe es cómo una acaba enseñando
       1,28 donde otra enseña 1:18. */
    const css = refNatApp()
    expect(css.valor).toBeCloseTo(78.125, 3)
    expect(css.unidad).toBe('s/100')
    expect(css.modo).toBe('seg')
  })

  it('SIN TEST, LA REFERENCIA SE SIGUE OFRECIENDO — marcada como no medida', () => {
    /* Lo que cuelga de ella son las ZONAS, y mandar un AEL tiene sentido
       aunque todavía no se le pueda calcular el ritmo. Atar «puedo elegir
       zona» a «tiene el test hecho» dejaba sin poder prescribir nada a un
       atleta nuevo, que es justo cuando más se le manda. Cinco de los ocho
       atletas en Zonas 2 de la base real estaban en ese caso. */
    const sinTest = referenciasDe('Carrera', null, [])
    expect(sinTest).toHaveLength(1)
    expect(sinTest[0].medida).toBe(false)
    expect(referenciasDe('Carrera', { vam: 0 }, [])[0].medida).toBe(false)
    expect(referenciasDe('Carrera', TESTS_APP, [])[0].medida).toBe(true)
  })

  it('y con ella se pueden elegir zonas igual', () => {
    expect(zonasDe(referenciasDe('Carrera', null, [])[0], []).length).toBeGreaterThan(0)
  })

  it('PERO NO SE INVENTA UN RITMO', () => {
    const sinTest = referenciasDe('Carrera', null, [])[0]
    expect(tramoDe(sinTest, 65, 75)).toBeNull()
  })

  it('NI SIQUIERA EN EL MODO DE SEGUNDOS, donde no se nota', () => {
    /* Con el CSS sin medir, «0 + 10» daría 10 s/100 tan tranquilo: un ritmo
       de récord mundial salido de un atleta que no ha hecho el test. La
       división por cero del otro modo al menos se ve venir. */
    const css = referenciasDe('Natacion', null, [])[0]
    expect(css.modo).toBe('seg')
    expect(tramoDe(css, 10, 20)).toBeNull()
  })

  it('sin medición, una referencia propia tampoco se ofrece', () => {
    const sinMedir = { ...TEST_6X100, mediciones: [] }
    expect(referenciasDe('Natacion', TESTS_APP, [sinMedir]).map(x => x.tipo)).toEqual(['app'])
  })

  it('«Natación» con tilde es el mismo deporte', () => {
    expect(referenciasDe('Natación', TESTS_APP, [TEST_6X100])).toHaveLength(2)
  })

  it('se reconoce la que la tarea tenía guardada', () => {
    const r = referenciasDe('Natacion', TESTS_APP, [TEST_6X100])
    expect(buscarReferencia(r, 'propia:2:0')?.valor).toBe(76)
    expect(buscarReferencia(r, 'propia:9:0')).toBeNull()
    expect(buscarReferencia(r, null)).toBeNull()
  })
})

describe('qué zonas cuelgan de cada referencia', () => {
  it('de la VAM, las del catálogo con sus % de VAM', () => {
    const z = zonasDe(refCarrera(), MIAS)
    expect(buscarZona(z, 'AEL')?.rango).toEqual([65, 75])
    expect(buscarZona(z, 'PAE')?.rango).toEqual([95, 105])
  })

  it('DEL FTP, LAS MISMAS SIGLAS CON OTROS NÚMEROS', () => {
    /* AEL es 65–75 % de la VAM y 56–75 % del FTP. Si el rango no dependiera de
       la referencia, un tempo de bici saldría con los % de correr. */
    const z = zonasDe(referenciasDe('Ciclismo', TESTS_APP, [])[0], MIAS)
    expect(buscarZona(z, 'AEL')?.rango).toEqual([56, 75])
  })

  it('del CSS, el desfase en segundos y no un porcentaje', () => {
    const z = zonasDe(refNatApp(), MIAS)
    expect(buscarZona(z, 'AEL')?.rango).toEqual([10, 20])
    expect(buscarZona(z, 'AEI')?.rango).toEqual([-3, 3])
  })

  it('la que no tiene tramo en ese deporte no se ofrece', () => {
    // PLA en natación es «series ≤25 m, velocidad máxima»: no es un desfase.
    expect(buscarZona(zonasDe(refNatApp(), MIAS), 'PLA')).toBeNull()
    expect(buscarZona(zonasDe(refCarrera(), MIAS), 'PLA')).not.toBeNull()
  })

  it('de una referencia propia, SOLO las zonas que apuntan a ella', () => {
    const z = zonasDe(refPropia(), MIAS)
    expect(z.map(x => x.sigla)).toEqual(['SUA', 'UMB', 'MAX'])
    expect(z.every(x => x.origen === 'propia')).toBe(true)
  })

  it('LAS DEL CATÁLOGO NO CUELGAN DE UNA REFERENCIA PROPIA', () => {
    /* Un «AEL» está definido como % de la VAM. Sobre un ritmo de 100 que se
       inventó el entrenador no significa nada, aunque el número se calculara. */
    expect(buscarZona(zonasDe(refPropia(), MIAS), 'AEL')).toBeNull()
  })

  it('una zona que apunta a otra referencia no aparece', () => {
    const otra = [mia({ sigla: 'OTR', ref: { idDefinicion: 9, indice: 0 } })]
    expect(zonasDe(refPropia(), otra)).toHaveLength(0)
  })

  it('una zona sin RPE no se ofrece', () => {
    // Sin RPE no hay nivel, y sin nivel no hay carga ni altura de barra.
    expect(zonasDe(refPropia(), [mia({ rpeMin: null })])).toHaveLength(0)
  })

  it('el RPE y el nivel salen de la misma escalera que el resto de la app', () => {
    const sua = buscarZona(zonasDe(refPropia(), MIAS), 'SUA')!
    expect(sua.rpe).toBe(3.5)
    expect(sua.nivel).toBe(2)
    const ael = buscarZona(zonasDe(refCarrera(), MIAS), 'AEL')!
    expect([ael.rpe, ael.nivel]).toEqual([cargaZona('AEL').rpe, cargaZona('AEL').nivel])
  })
})

describe('con qué porcentaje arranca una zona', () => {
  const z = (rango: [number | null, number | null]): ZonaOfrecida =>
    ({ sigla: 'X', nombre: 'X', color: '#fff', rpe: 5, nivel: 3, rango, origen: 'app' })

  it('con el suyo entero', () => {
    expect(rangoInicial(z([65, 75]))).toEqual([65, 75])
  })

  it('UNA ZONA SIN SUELO NO ARRANCA EN SU TECHO', () => {
    /* AER es «hasta 65 %». Rellenar los dos lados con 65 mandaría la
       recuperación justo en su borde más duro, que es lo contrario de lo que
       es. Se usa la regla que la app ya tiene (máximo × 0,92), no una nueva. */
    expect(rangoInicial(z([null, 65]))).toEqual([60, 65])
  })

  it('una zona sin techo arranca en su suelo, como hace la app', () => {
    expect(rangoInicial(z([150, null]))).toEqual([150, 150])
  })

  it('sin zona no hay rango', () => {
    expect(rangoInicial(null)).toBeNull()
    expect(rangoInicial(z([null, null]))).toBeNull()
  })
})

describe('afinar el porcentaje', () => {
  it('dentro de la zona vale', () => {
    expect(acotar(70, [65, 75])).toBe(70)
    expect(acotar(65, [65, 75])).toBe(65)
    expect(acotar(75, [65, 75])).toBe(75)
  })

  it('FUERA DE LA ZONA SE VUELVE AL BORDE', () => {
    /* Un AEL al 60 % no es un AEL. Si se dejara pasar, su RPE y su nivel
       —de los que salen la carga y la barra del dibujo— dirían una cosa y el
       ritmo mandado sería otra, sin que nada fallara. */
    expect(acotar(60, [65, 75])).toBe(65)
    expect(acotar(95, [65, 75])).toBe(75)
  })

  it('un extremo abierto no acota por ese lado', () => {
    expect(acotar(20, [null, 65])).toBe(20)
    expect(acotar(80, [null, 65])).toBe(65)
    expect(acotar(400, [150, null])).toBe(400)
    expect(acotar(100, [150, null])).toBe(150)
  })

  it('acota también en negativo: el CSS de natación va en segundos', () => {
    // AEI es «CSS ±3 s»: el tramo va de −3 a +3.
    expect(acotar(-9, [-3, 3])).toBe(-3)
    expect(acotar(0, [-3, 3])).toBe(0)
  })

  it('sin rango o sin valor no se toca nada', () => {
    expect(acotar(60, null)).toBe(60)
    expect(acotar(null, [65, 75])).toBeNull()
  })

  it('se puede saber que se sale sin corregirlo, para pintarlo', () => {
    expect(seSale(60, [65, 75])).toBe(true)
    expect(seSale(70, [65, 75])).toBe(false)
    expect(seSale(20, [null, 65])).toBe(false)
  })

  it('se distingue la zona entera de una afinada', () => {
    const z: ZonaOfrecida = { sigla: 'AEL', nombre: '', color: '', rpe: 3.5, nivel: 2, rango: [65, 75], origen: 'app' }
    expect(estaAfinada(65, 75, z)).toBe(false)
    expect(estaAfinada(70, 70, z)).toBe(true)
    expect(estaAfinada(null, null, z)).toBe(false)
  })
})

describe('qué le sale al atleta', () => {
  it('en carrera, la VAM por el porcentaje', () => {
    const t = tramoDe(refCarrera(), 65, 75)!
    expect(t.desde).toBeCloseTo(10.4, 3)
    expect(t.hasta).toBeCloseTo(12, 3)
    expect(t.unidad).toBe('km/h')
  })

  it('en bici, vatios', () => {
    const t = tramoDe(referenciasDe('Ciclismo', TESTS_APP, [])[0], 56, 75)!
    expect(Math.round(t.desde)).toBe(137)
    expect(Math.round(t.hasta)).toBe(184)
  })

  it('EN UNA REFERENCIA DE TIEMPO, EL % DIVIDE', () => {
    /* El 88 % de 76 s es más LENTO, no más rápido. Multiplicando saldrían 67 s
       —por debajo de su marca— y el nadador estaría haciendo su serie suave
       por encima de su máximo sostenible, con la app tan tranquila. */
    const t = tramoDe(refPropia(), 88, 94)!
    expect(t.desde).toBeCloseTo(80.85, 2)
    expect(t.hasta).toBeCloseTo(86.36, 2)
    expect(t.inverso).toBe(true)
  })

  it('EL CSS SUMA SEGUNDOS, NO MULTIPLICA', () => {
    // «CSS +10 a +20 s» sobre 78,125 s/100.
    const t = tramoDe(refNatApp(), 10, 20)!
    expect(t.desde).toBeCloseTo(88.125, 3)
    expect(t.hasta).toBeCloseTo(98.125, 3)
  })

  it('un desfase negativo va más rápido', () => {
    const t = tramoDe(refNatApp(), -8, -4)!
    expect(t.desde).toBeCloseTo(70.125, 3)
    expect(t.hasta).toBeCloseTo(74.125, 3)
  })

  it('DESDE Y HASTA VIENEN ORDENADOS POR EL NÚMERO, no por el %', () => {
    /* Es una sola regla para los tres casos: en vatios el % bajo da el número
       bajo y en un ritmo lo da alto. Quien pinta no tiene que saber cuál es. */
    const ritmo = tramoDe(refPropia(), 88, 94)!
    const vatios = tramoDe(referenciasDe('Ciclismo', TESTS_APP, [])[0], 56, 75)!
    expect(ritmo.desde).toBeLessThan(ritmo.hasta)
    expect(vatios.desde).toBeLessThan(vatios.hasta)
  })

  it('sin referencia o sin porcentaje no se inventa nada', () => {
    expect(tramoDe(null, 65, 75)).toBeNull()
    expect(tramoDe(refCarrera(), null, 75)).toBeNull()
    expect(tramoDe(refCarrera(), 0, 75)).toBeNull()
  })

  it('un desfase que dejaría el ritmo en cero no devuelve un número', () => {
    const raro: Referencia = { ...refNatApp(), valor: 5 }
    expect(tramoDe(raro, -80, -60)).toBeNull()
  })
})

describe('la copia que se congela en la tarea', () => {
  it('lleva la zona, el % mandado y de dónde salió', () => {
    const ref = refPropia()
    const z = buscarZona(zonasDe(ref, MIAS), 'SUA')!
    const c = copiaPrescrita(ref, z, 90, 90)!
    expect(c).toEqual({
      sigla: 'SUA', nombre: 'Suave', color: '#a78bfa', rpe: 3.5, nivel: 2,
      pctMin: 90, pctMax: 90, refId: 'propia:2:0', refEtiqueta: '6x100 · Ritmo100',
    })
  })

  it('NO LLEVA EL RITMO, y es la decisión que sostiene lo demás', () => {
    /* El ritmo depende de los tests del atleta. Congelándolo, un test nuevo no
       movería nada; dejándolo vivo, se recalcula solo sin reescribir lo que se
       mandó. Es el mismo criterio que la app usa con los ejercicios de fuerza:
       el nombre se congela, el vídeo se resuelve en vivo. */
    const c = copiaPrescrita(refPropia(), buscarZona(zonasDe(refPropia(), MIAS), 'SUA')!, 88, 94)!
    expect(Object.keys(c).sort()).toEqual(
      ['color', 'nivel', 'nombre', 'pctMax', 'pctMin', 'refEtiqueta', 'refId', 'rpe', 'sigla'])
  })

  it('el porcentaje se acota también al congelar', () => {
    const z = buscarZona(zonasDe(refCarrera(), MIAS), 'AEL')!
    expect(copiaPrescrita(refCarrera(), z, 50, 95)).toMatchObject({ pctMin: 65, pctMax: 75 })
  })

  it('si vienen al revés, se ordenan', () => {
    const z = buscarZona(zonasDe(refCarrera(), MIAS), 'AEL')!
    expect(copiaPrescrita(refCarrera(), z, 72, 68)).toMatchObject({ pctMin: 68, pctMax: 72 })
  })

  it('sin porcentaje, se congela el de la zona entera', () => {
    const z = buscarZona(zonasDe(refCarrera(), MIAS), 'AEL')!
    expect(copiaPrescrita(refCarrera(), z, null, null)).toMatchObject({ pctMin: 65, pctMax: 75 })
  })

  it('sin zona o sin referencia no hay copia', () => {
    expect(copiaPrescrita(refCarrera(), null, 65, 75)).toBeNull()
    expect(copiaPrescrita(null, null, 65, 75)).toBeNull()
  })

  it('LA COPIA ENCAJA EN cargaZona SIN TRADUCIRLA', () => {
    /* Es todo el sentido de esto: las ~29 pantallas que llaman a cargaZona no
       tienen que aprender nada de referencias ni de porcentajes. */
    const c = copiaPrescrita(refPropia(), buscarZona(zonasDe(refPropia(), MIAS), 'SUA')!, 90, 90)!
    const carga = cargaZona('SUA', c)
    expect(carga.origen).toBe('copia')
    expect(carga.rpe).toBe(3.5)
    expect(carga.nivel).toBe(2)
    expect(carga.nombre).toBe('Suave')
  })
})

describe('leer la copia de la base', () => {
  it('va y vuelve entera', () => {
    const c = copiaPrescrita(refPropia(), buscarZona(zonasDe(refPropia(), MIAS), 'MAX')!, 105, 105)!
    expect(leerCopia(JSON.parse(JSON.stringify(c)))).toEqual(c)
  })

  it('SIN SIGLA NO ES UNA COPIA', () => {
    /* Media copia es peor que ninguna: sin sigla, cargaZona la ignora y
       resuelve por catálogo, que es exactamente lo que hacía antes de esto. */
    expect(leerCopia({ rpe: 5, nivel: 3 })).toBeNull()
    expect(leerCopia({ sigla: '   ' })).toBeNull()
    expect(leerCopia(null)).toBeNull()
    expect(leerCopia('SUA')).toBeNull()
  })

  it('lo que falte se rellena sin inventar números', () => {
    const c = leerCopia({ sigla: 'SUA' })!
    expect(c.nombre).toBe('SUA')
    expect(c.rpe).toBe(0)
    expect(c.pctMin).toBe(0)
    expect(c.refId).toBe('')
  })

  it('las 450 tareas de antes no tienen copia, y eso está bien', () => {
    // NULL = resuélvela por catálogo, como toda la vida.
    expect(leerCopia(undefined)).toBeNull()
  })
})

describe('el ancla de cada deporte', () => {
  it('carrera la VAM, bici el FTP, natación el CSS en segundos', () => {
    expect(ANCLA_DE.Carrera.ancla).toBe('vam')
    expect(ANCLA_DE.Ciclismo.ancla).toBe('ftp')
    expect(ANCLA_DE.Natacion.modo).toBe('seg')
  })

  it('la fuerza no tiene referencia: sus zonas no son un % de nada', () => {
    expect(ANCLA_DE.Fuerza).toBeUndefined()
    expect(referenciasDe('Fuerza', TESTS_APP, [TEST_6X100])).toHaveLength(0)
  })
})

describe('el tramo escrito para una persona', () => {
  const t = (desde: number, hasta: number, unidad: string, inverso = false) =>
    textoTramo({ desde, hasta, unidad, inverso })

  it('en carrera, un ritmo — y LO MÁS RÁPIDO PRIMERO', () => {
    // 10,4–12 km/h son 5:46 y 5:00: el número alto de km/h es el ritmo bajo.
    expect(t(10.4, 12, 'km/h')).toBe('5:00–5:46 /km')
  })

  it('en bici, vatios', () => {
    expect(t(137.2, 183.75, 'W')).toBe('137–184 W')
    expect(t(184, 184, 'W')).toBe('184 W')
  })

  it('en natación, m:ss por 100 — también lo más rápido primero', () => {
    expect(t(80.85, 86.36, 's/100', true)).toBe('1:21–1:26 /100')
    expect(t(76, 76, 's/100', true)).toBe('1:16 /100')
  })

  it('UNA UNIDAD QUE ESCRIBIÓ EL ENTRENADOR SE ENSEÑA TAL CUAL', () => {
    // Interpretarla para adornarla es donde se cuelan los números que mienten.
    expect(t(4.2, 4.8, 'pts')).toBe('4,2–4,8 pts')
  })

  it('sin tramo, nada', () => {
    expect(textoTramo(null)).toBe('')
  })

  it('LO QUE VE EL ENTRENADOR ES LO QUE VE EL ATLETA', () => {
    /* Es el sentido de que esto viva en la librería: el editor y el briefing
       llaman a la misma función, así que no pueden discrepar. */
    const ref = referenciasDe('Natacion', TESTS_APP, [TEST_6X100])[1]
    expect(textoTramo(tramoDe(ref, 88, 94))).toBe('1:21–1:26 /100')
  })
})

describe('la puerta para las tareas guardadas', () => {
  const zonaSUA = () => buscarZona(zonasDe(refPropia(), MIAS), 'SUA')!

  it('una tarea de siempre, sin copia, pesa lo mismo que pesaba', () => {
    /* Es la mitad importante: las 450 tareas que ya existen tienen zona_copia a
       null y tienen que seguir dando exactamente el mismo número. */
    const t = { zona_entrenamiento: 'AEL', zona_copia: null }
    expect(cargaDeTarea(t)).toEqual(cargaZona('AEL'))
    expect(cargaDeTarea({ zona_entrenamiento: 'Z3' })).toEqual(cargaZona('Z3'))
  })

  it('con copia, manda la copia', () => {
    const c = copiaPrescrita(refPropia(), zonaSUA(), 90, 90)!
    const carga = cargaDeTarea({ zona_entrenamiento: 'SUA', zona_copia: JSON.parse(JSON.stringify(c)) })
    expect(carga.origen).toBe('copia')
    expect(carga.rpe).toBe(3.5)
    expect(carga.nivel).toBe(2)
  })

  it('UNA ZONA PROPIA SIN COPIA VIENE MARCADA, no disfrazada de Z2', () => {
    /* Si una pantalla se olvidara de pedir zona_copia, esto es lo que pasaría:
       el número sigue siendo plausible pero se sabe que es un respaldo. */
    const carga = cargaDeTarea({ zona_entrenamiento: 'SUA' })
    expect(carga.origen).toBe('supuesta')
  })

  it('una tarea vacía o nula no revienta', () => {
    expect(cargaDeTarea(null).origen).toBe('supuesta')
    expect(cargaDeTarea({}).origen).toBe('supuesta')
  })

  it('las columnas que hay que pedir están dichas en un sitio', () => {
    // Pedir solo zona_entrenamiento es cómo una pantalla se queda a medias.
    expect(COLUMNAS_ZONA).toContain('zona_entrenamiento')
    expect(COLUMNAS_ZONA).toContain('zona_copia')
  })
})

describe('la zona que representa a una sesión', () => {
  const t = (sigla: string, copia?: unknown) => ({ zona_entrenamiento: sigla, zona_copia: copia })

  it('la más dura de sus tareas', () => {
    expect(tareaPico([t('AER'), t('PAE'), t('AEL')])?.zona_entrenamiento).toBe('PAE')
  })

  it('UNA ZONA PROPIA NO SE COLA ENTRE LAS SUAVES', () => {
    /* Es el fallo que este ayudante existe para evitar: reduciendo sobre siglas
       sueltas, «MAX» no está en el catálogo, su respaldo dice nivel 2 y una
       sesión de series se etiquetaría como aeróbica suave. */
    const max = copiaPrescrita(refPropia(), buscarZona(zonasDe(refPropia(), MIAS), 'MAX')!, 103, 107)!
    const pico = tareaPico([t('AEL'), t('MAX', JSON.parse(JSON.stringify(max)))])
    expect(pico?.zona_entrenamiento).toBe('MAX')
  })

  it('sin la copia, esa misma tarea SÍ se colaría — y por eso hay que pedirla', () => {
    expect(tareaPico([t('AEL'), t('MAX')])?.zona_entrenamiento).toBe('AEL')
  })

  it('las tareas sin zona no cuentan', () => {
    expect(tareaPico([{ zona_entrenamiento: null }, t('AER')])?.zona_entrenamiento).toBe('AER')
    expect(tareaPico([])).toBeNull()
    expect(tareaPico(null)).toBeNull()
  })
})

describe('el objetivo de una tarea ya prescrita', () => {
  const copiaSUA = (min: number, max: number) =>
    copiaPrescrita(refPropia(), buscarZona(zonasDe(refPropia(), MIAS), 'SUA')!, min, max)!
  const copiaAEL = (min: number, max: number) =>
    copiaPrescrita(refCarrera(), buscarZona(zonasDe(refCarrera(), MIAS), 'AEL')!, min, max)!

  it('sale de la referencia con la que se mandó', () => {
    expect(objetivoDeCopia(copiaSUA(88, 94), 'Natacion', TESTS_APP, [TEST_6X100])).toBe('1:21–1:26 /100')
  })

  it('UN AEL AFINADO AL 70 ENSEÑA EL RITMO DEL 70', () => {
    /* No el del 65–75 del catálogo: si se mandó fino, el atleta tiene que ver
       lo fino. Por eso esto vale también para las zonas de la app. */
    expect(objetivoDeCopia(copiaAEL(70, 70), 'Carrera', TESTS_APP, [])).toBe('5:21 /km')
    expect(objetivoDeCopia(copiaAEL(65, 75), 'Carrera', TESTS_APP, [])).toBe('5:00–5:46 /km')
  })

  it('SIN LA REFERENCIA NO SE INVENTA OTRA', () => {
    // El test se archivó: caer hacia la de la app daría un ritmo que no es el
    // que se mandó. Mejor ninguno que uno que miente.
    expect(objetivoDeCopia(copiaSUA(88, 94), 'Natacion', TESTS_APP, [])).toBe('')
  })

  it('sin copia, nada — y ahí manda el camino de siempre', () => {
    expect(objetivoDeCopia(null, 'Carrera', TESTS_APP, [])).toBe('')
  })

  it('se sabe si una tarea necesita los tests del entrenador', () => {
    const propia = { zona_entrenamiento: 'SUA', zona_copia: JSON.parse(JSON.stringify(copiaSUA(88, 94))) }
    const deLaApp = { zona_entrenamiento: 'AEL', zona_copia: JSON.parse(JSON.stringify(copiaAEL(65, 75))) }
    expect(cuelgaDeTestPropio(propia)).toBe(true)
    expect(cuelgaDeTestPropio(deLaApp)).toBe(false)
    expect(cuelgaDeTestPropio({ zona_entrenamiento: 'AEL' })).toBe(false)
  })
})
