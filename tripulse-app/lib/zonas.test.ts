import { describe, it, expect } from 'vitest'
import {
  zonaResistencia, prescripcion, pctVamZona, velNatacionZona, ritmoObjetivo,
  tablaIntensidades, cargaZona, esSupuesta, ZONAS_RESISTENCIA, ZONAS_FUERZA,
} from './zonas'

describe('zonaResistencia', () => {
  it('encuentra una zona por sigla', () => {
    expect(zonaResistencia('AER')?.sigla).toBe('AER')
  })
  it('devuelve null para sigla desconocida o vacía', () => {
    expect(zonaResistencia('NOPE')).toBeNull()
    expect(zonaResistencia(null)).toBeNull()
  })
})

describe('prescripcion — natación (regresión del bug de ritmo)', () => {
  const aer = zonaResistencia('AER')!  // CSS +20s o más lento (borde abierto)
  const aem = zonaResistencia('AEM')!  // CSS +4–8s (rango)

  it('con CSS calcula un ritmo concreto por 100m, NO la etiqueta relativa', () => {
    const r = prescripcion(aer, 'Natacion', { css: 1.4 })
    expect(r).toMatch(/\/100m/)
    expect(r).not.toBe(aer.css) // ya no devuelve "CSS +20s o más lento"
  })
  it('AER (borde abierto) da un ritmo con ">"', () => {
    expect(prescripcion(aer, 'Natacion', { css: 1.4 })).toMatch(/^>/)
  })
  it('acepta la disciplina escrita con acento (Natación)', () => {
    expect(prescripcion(aem, 'Natación', { css: 1.4 })).toMatch(/\/100m/)
  })
  it('sin CSS cae a la etiqueta relativa del catálogo', () => {
    expect(prescripcion(aer, 'Natacion', {})).toBe(aer.css)
  })
})

describe('prescripcion — carrera y ciclismo', () => {
  const aem = zonaResistencia('AEM')!

  it('carrera con VAM da ritmo /km; sin VAM da % VAM', () => {
    expect(prescripcion(aem, 'Carrera', { vam: 15 })).toMatch(/\/km/)
    expect(prescripcion(aem, 'Carrera', {})).toMatch(/% VAM/)
  })
  it('ciclismo con FTP da vatios; sin FTP da % FTP', () => {
    expect(prescripcion(aem, 'Ciclismo', { ftp: 250 })).toMatch(/W$/)
    expect(prescripcion(aem, 'Ciclismo', {})).toMatch(/% FTP/)
  })
})

describe('velNatacionZona', () => {
  it('una zona más lenta que el CSS da una velocidad menor que el CSS', () => {
    const css = 1.4
    const v = velNatacionZona('AER', css) // AER = CSS+20 → más lento
    expect(v).not.toBeNull()
    expect(v!).toBeLessThan(css)
  })
  it('las zonas de sprint (sin desfase) devuelven null', () => {
    expect(velNatacionZona('PLA', 1.4)).toBeNull()
    expect(velNatacionZona('CALA', 1.4)).toBeNull()
  })
  it('sin CSS válido devuelve null', () => {
    expect(velNatacionZona('AER', 0)).toBeNull()
  })
})

describe('pctVamZona', () => {
  it('devuelve un % para una zona con bordes', () => {
    expect(pctVamZona('AEM')!).toBeGreaterThan(0)
  })
  it('null para sigla desconocida', () => {
    expect(pctVamZona('NOPE')).toBeNull()
  })
})

describe('cargaZona', () => {
  it('mapea una sigla Zonas2 a nivel/RPE dentro de rango', () => {
    const c = cargaZona('AEM')
    expect(c.nivel).toBeGreaterThanOrEqual(1)
    expect(c.nivel).toBeLessThanOrEqual(7)
    expect(c.rpe).toBeGreaterThan(0)
  })
  it('mapea el sistema clásico Z1–Z7', () => {
    expect(cargaZona('Z3').nivel).toBe(3)
  })
  it('sigla desconocida cae al fallback (nivel 2)', () => {
    expect(cargaZona('???').nivel).toBe(2)
  })

  it('UN Z9 NO ES UN Z7', () => {
    /* Antes se acotaba al rango: un «Z9» salía como Z7, el bloque más duro que
       existe, sin decir nada. Y un Z9 no lo escribe un entrenador —lo escribe
       el asistente cuando se equivoca—, que es justo cuando hay que enterarse. */
    expect(cargaZona('Z9').origen).toBe('supuesta')
    expect(cargaZona('Z0').origen).toBe('supuesta')
    expect(cargaZona('Z7').nivel).toBe(7)
    expect(cargaZona('Z1').nivel).toBe(1)
  })

  it('la z minúscula y con espacio siguen valiendo', () => {
    // Hay una tarea guardada con «z6»: si dejara de resolverse, esa sesión
    // cambiaría de carga sin que nadie hubiera tocado nada.
    expect(cargaZona('z6').nivel).toBe(6)
    expect(cargaZona('Z 4').nivel).toBe(4)
  })

  it('DICE DE DÓNDE SALE CADA RESPUESTA', () => {
    expect(cargaZona('Z3').origen).toBe('clasica')
    expect(cargaZona('AEM').origen).toBe('app')
    expect(cargaZona('FMH').origen).toBe('app')
    expect(cargaZona('???').origen).toBe('supuesta')
    expect(cargaZona(null).origen).toBe('supuesta')
  })

  it('EL RESPALDO VIENE MARCADO — es el arreglo entero', () => {
    /* El número no cambia: sigue siendo nivel 2 y RPE 4,5, porque casi todo lo
       que llama aquí multiplica y un cero borraría de la semana una sesión que
       sí se hizo. Lo que cambia es que ya no se puede confundir con un dato. */
    const c = cargaZona('TMP')
    expect(esSupuesta(c)).toBe(true)
    expect(c.rpe).toBe(4.5)
    expect(c.nombre).toBe('Zona desconocida')
    expect(esSupuesta(cargaZona('AEL'))).toBe(false)
  })

  it('CON LA COPIA, UNA ZONA PROPIA SE RESUELVE BIEN', () => {
    /* Es lo que hace que las treinta pantallas que llaman aquí dejen de mentir
       con un tempo del entrenador: no tienen que aprender nada de zonas
       propias, la respuesta viaja con la tarea. */
    const copia = { sigla: 'TMP', nombre: 'Tempo largo', color: '#a78bfa', rpe: 6.5, nivel: 3 }
    const c = cargaZona('TMP', copia)
    expect(c.origen).toBe('copia')
    expect(c.rpe).toBe(6.5)
    expect(c.nivel).toBe(3)
    expect(c.nombre).toBe('Tempo largo')
    expect(esSupuesta(c)).toBe(false)
  })

  it('LA COPIA MANDA TAMBIÉN SOBRE EL CATÁLOGO', () => {
    /* Lo que se mandó en marzo se mandó con lo que la zona valía en marzo.
       Si el catálogo pudiera pisarla, cambiar una zona reescribiría el pasado. */
    const copia = { sigla: 'AEL', nombre: 'Mi AEL', color: '#fff', rpe: 9, nivel: 6 }
    expect(cargaZona('AEL', copia).rpe).toBe(9)
  })

  it('una copia vacía no es una copia', () => {
    const c = cargaZona('AEL', { sigla: '  ', nombre: '', color: '', rpe: 0, nivel: 0 })
    expect(c.origen).toBe('app')
  })

  it('SIN COPIA, TODAS SIGUEN DANDO EXACTAMENTE LO MISMO', () => {
    /* GUARDIÁN. De estos números cuelgan la carga (RPE × minutos), la curva de
       forma, la altura de las barras del dibujo y la duración estimada de todas
       las sesiones YA GUARDADAS. Si una sola se mueve, se mueve el historial
       entero de todos los atletas, hacia atrás y sin avisar. Están escritos uno
       a uno a propósito: una fórmula aquí no vigilaría nada, se limitaría a
       repetir el cambio. */
    const foto = [...ZONAS_RESISTENCIA.map(z => z.sigla), ...ZONAS_FUERZA.map(z => z.sigla),
                  'Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7']
      .map(s => s + ':' + cargaZona(s).nivel + '/' + cargaZona(s).rpe)
    expect(foto).toEqual([
      'AER:1/2', 'AEL:2/3.5', 'AEM:2/5', 'AEI:3/6.5', 'PAE:4/7.5',
      'CLA:5/8.5', 'PLA:6/9.5', 'CALA:6/9.5', 'PALA:7/10',
      'AFG:3/5.5', 'FMI:5/9', 'FMH:4/8', 'FEC:4/8', 'FEA:5/9',
      'RFMIX1:4/8', 'RFLA:5/9', 'RFMIX2:4/7.5', 'RFAE:3/6', 'FLEX:1/2',
      'Z1:1/2.5', 'Z2:2/4.5', 'Z3:3/6.5', 'Z4:4/7.5', 'Z5:5/8.5', 'Z6:6/9.5', 'Z7:7/10',
    ])
  })
})

describe('tablaIntensidades', () => {
  it('devuelve las 9 zonas de resistencia con sus columnas', () => {
    const t = tablaIntensidades({ vam: 15, css: 1.4, ftp: 250 }, 190)
    expect(t).toHaveLength(ZONAS_RESISTENCIA.length)
    for (const col of ['sigla', 'natacion', 'carrera', 'ciclismo', 'fc', 'rpe']) {
      expect(t[0]).toHaveProperty(col)
    }
  })
  it('con CSS, la natación de una zona con desfase muestra ritmo /100m', () => {
    const t = tablaIntensidades({ css: 1.4 }, null)
    expect(t.find(r => r.sigla === 'AEM')!.natacion).toMatch(/\/100m/)
  })
})

// ------------------------------------------------------------
// ritmoObjetivo — la traducción zona → ritmo con LOS tests del atleta
// ------------------------------------------------------------
// Es lo que convierte una plantilla en el entreno de una persona concreta. Lo usan
// el editor del entrenador y el briefing del deportista, así que aquí se blinda que
// las dos pantallas digan lo mismo.
describe('ritmoObjetivo', () => {
  const tests = { vam: 16, css: 1.4, ftp: 250 }

  it('traduce una zona del catálogo Zonas 2', () => {
    expect(ritmoObjetivo('AEM', 'Carrera', tests)).toBeTruthy()
  })

  it('el mismo entreno da ritmos distintos según los tests del atleta', () => {
    const rapido = ritmoObjetivo('Z2', 'Carrera', { vam: 18 })
    const lento = ritmoObjetivo('Z2', 'Carrera', { vam: 12 })
    expect(rapido).not.toBe(lento)
    expect(rapido).toBeTruthy()
  })

  it('ciclismo clásico devuelve vatios sobre el FTP', () => {
    expect(ritmoObjetivo('Z4', 'Ciclismo', { ftp: 250 })).toBe('245 W')   // 98% de 250
  })

  it('natación clásica devuelve ritmo por 100 m', () => {
    expect(ritmoObjetivo('Z2', 'Natacion', { css: 1.4 })).toContain('/100m')
  })

  it('acepta «Natación» con tilde, que es como llega de algunas pantallas', () => {
    expect(ritmoObjetivo('Z2', 'Natación', { css: 1.4 }))
      .toBe(ritmoObjetivo('Z2', 'Natacion', { css: 1.4 }))
  })

  it('sin el test de esa disciplina no inventa un ritmo', () => {
    expect(ritmoObjetivo('Z4', 'Ciclismo', { ftp: null })).toBe('')
    expect(ritmoObjetivo('Z4', 'Carrera', { vam: null })).toBe('')
  })

  it('sin zona, sin disciplina o sin tests devuelve vacío', () => {
    expect(ritmoObjetivo(null, 'Carrera', tests)).toBe('')
    expect(ritmoObjetivo('Z2', null, tests)).toBe('')
    expect(ritmoObjetivo('Z2', 'Carrera', null)).toBe('')
  })

  it('una zona desconocida no revienta', () => {
    expect(ritmoObjetivo('XXX', 'Carrera', tests)).toBe('')
  })

  it('más zona = más rápido en carrera (el ritmo baja)', () => {
    const seg = (r: string) => { const [m, s] = r.split(' ')[0].split(':').map(Number); return m * 60 + s }
    expect(seg(ritmoObjetivo('Z5', 'Carrera', tests))).toBeLessThan(seg(ritmoObjetivo('Z2', 'Carrera', tests)))
  })
})
