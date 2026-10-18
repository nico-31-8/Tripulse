import { describe, it, expect } from 'vitest'
import { ritmoObjetivoTexto, objetivoDeZona, deDondeSale, referenciaDeZona } from './referencia-zona'
import { ZONAS_RESISTENCIA } from './zonas'

/*
  El fallo que motiva estos tests: `ritmo_objetivo` se guarda como TEXTO con la
  unidad dentro (lo que devuelve `prescripcion()`), pero dos pantallas del atleta
  lo leían como segundos y lo pasaban por un m:ss. `Math.floor('180–220 W' / 60)`
  es NaN, así que la caja naranja ponía «NaN:NaN /km».
*/
describe('ritmoObjetivoTexto', () => {
  it('devuelve el texto tal cual: ya trae su unidad dentro', () => {
    expect(ritmoObjetivoTexto('4:12–4:30 /km', 'Carrera')).toBe('4:12–4:30 /km')
    expect(ritmoObjetivoTexto('180–220 W', 'Ciclismo')).toBe('180–220 W')
    expect(ritmoObjetivoTexto('> 2:05 /100m', 'Natacion')).toBe('> 2:05 /100m')
    expect(ritmoObjetivoTexto('Por APR (sprint)', 'Ciclismo')).toBe('Por APR (sprint)')
  })

  it('NUNCA devuelve NaN, que era lo que se veía en pantalla', () => {
    for (const v of ['4:12–4:30 /km', '180–220 W', '> 2:05 /100m', 'CSS +20s', '85–95% VAM']) {
      expect(ritmoObjetivoTexto(v, 'Carrera')).not.toContain('NaN')
    }
  })

  it('una fila antigua guardada en segundos sí se formatea, y con su unidad', () => {
    expect(ritmoObjetivoTexto(252, 'Carrera')).toBe('4:12 /km')
    expect(ritmoObjetivoTexto('252', 'Carrera')).toBe('4:12 /km')
    expect(ritmoObjetivoTexto(125, 'Natacion')).toBe('2:05 /100m')
    expect(ritmoObjetivoTexto(125, 'Natación')).toBe('2:05 /100m')
  })

  it('rellena el segundo a dos cifras', () => {
    expect(ritmoObjetivoTexto(245, 'Carrera')).toBe('4:05 /km')
    expect(ritmoObjetivoTexto(240, 'Carrera')).toBe('4:00 /km')
  })

  it('sin disciplina cae a /km, que es el caso mayoritario', () => {
    expect(ritmoObjetivoTexto(252)).toBe('4:12 /km')
    expect(ritmoObjetivoTexto(252, null)).toBe('4:12 /km')
  })

  it('vacío es null, para que la caja naranja no se pinte', () => {
    expect(ritmoObjetivoTexto(null)).toBeNull()
    expect(ritmoObjetivoTexto(undefined)).toBeNull()
    expect(ritmoObjetivoTexto('')).toBeNull()
    expect(ritmoObjetivoTexto('   ')).toBeNull()
    expect(ritmoObjetivoTexto(0)).toBeNull()
  })
})

describe('el objetivo de una zona cuando el atleta no tiene tests', () => {
  const CON_VAM = { vam: 15, css: null, ftp: null }
  const SIN_NADA = { vam: null, css: null, ftp: null }

  it('con el test que toca, manda el ritmo', () => {
    const o = objetivoDeZona('Z2', 'Carrera', CON_VAM, 190)
    expect(o?.de).toBe('tests')
    expect(o?.texto).toContain('/km')
  })

  it('SIN test pero con FC máxima, las pulsaciones: sigue siendo un número que mira en el reloj', () => {
    const o = objetivoDeZona('Z2', 'Carrera', SIN_NADA, 190)
    expect(o?.de).toBe('fc')
    expect(o?.texto).toContain('ppm')
  })

  it('sin test y sin FC máxima, el RPE: no necesita nada y ya lo usa al reportar', () => {
    const o = objetivoDeZona('Z2', 'Carrera', SIN_NADA, 0)
    expect(o?.de).toBe('esfuerzo')
    expect(o?.texto).toMatch(/^RPE /)
  })

  it('NUNCA vuelve vacío por no tener tests: ese era el agujero', () => {
    // Antes, sin test la caja entera no se pintaba y el atleta abría un rodaje
    // de 40 minutos sin ninguna referencia de a cuánto ir.
    for (const d of ['Carrera', 'Ciclismo', 'Natacion']) {
      for (const z of ['Z1', 'Z2', 'Z4', 'Z5']) {
        const o = objetivoDeZona(z, d, SIN_NADA, 0)
        expect(o, d + ' ' + z).not.toBeNull()
        expect(o!.texto.length).toBeGreaterThan(0)
      }
    }
  })

  it('el porcentaje se queda fuera: es un porcentaje de un número que no tiene', () => {
    const o = objetivoDeZona('Z2', 'Carrera', SIN_NADA, 0)
    expect(o?.texto).not.toContain('% VAM')
  })

  it('una zona que no existe no inventa nada', () => {
    expect(objetivoDeZona('ZX', 'Carrera', CON_VAM, 190)).toBeNull()
    expect(objetivoDeZona('', 'Carrera', CON_VAM, 190)).toBeNull()
    expect(objetivoDeZona(null, 'Carrera', CON_VAM, 190)).toBeNull()
  })

  it('la explicación dice la verdad sobre de dónde salió', () => {
    expect(deDondeSale('tests')).toContain('tests')
    expect(deDondeSale('fc')).toContain('frecuencia cardiaca')
    expect(deDondeSale('esfuerzo')).toContain('esfuerzo')
    // Las dos de respaldo avisan de que le falta el test.
    expect(deDondeSale('fc')).toContain('test')
    expect(deDondeSale('esfuerzo')).toContain('test')
  })
})

/*
  EL MISMO AGUJERO, EN EL SISTEMA QUE SE USA DE VERDAD. Los tests de arriba solo
  miraban Z1–Z5, y en los últimos 120 días hubo ~330 tareas de carrera y bici en
  Zonas 2 frente a 3 en el clásico.

  En Zonas 2 el ritmo salía de `prescripcion()`, que sin el test no devuelve
  null: devuelve la zona en porcentaje («56–75% FTP», «65–75% VAM») o la
  etiqueta del catálogo («CSS +10–20s»). Así que el ritmo nunca faltaba, la
  cadena no bajaba a las pulsaciones y el atleta leía un porcentaje de un número
  que no tiene, firmado «Lo que sale de tus tests».
*/
describe('Zonas 2 sin el test que toca: el mismo respaldo que el clásico', () => {
  const SIGLAS = ZONAS_RESISTENCIA.map(z => z.sigla)
  /* A cada deporte le falta SU test y tiene los otros dos: tener la VAM no
     sirve para dar vatios. */
  const SIN_SU_TEST: [string, { vam: number | null; ftp: number | null; css: number | null }][] = [
    ['Carrera', { vam: null, ftp: 250, css: 1.25 }],
    ['Ciclismo', { vam: 17, ftp: null, css: 1.25 }],
    ['Natacion', { vam: 17, ftp: 250, css: null }],
    ['Natación', { vam: 17, ftp: 250, css: null }],
  ]
  const conPulso = (sigla: string) => {
    const z = ZONAS_RESISTENCIA.find(x => x.sigla === sigla)!
    return z.fcMin != null || z.fcMax != null
  }

  it('el caso que se vio: AEL en bici sin FTP, con FC máxima y de reposo → sus pulsaciones', () => {
    expect(objetivoDeZona('AEL', 'Ciclismo', { vam: 17, ftp: null, css: 1.25 }, 188, 50))
      .toEqual({ texto: '126–145 ppm', de: 'fc' })
  })

  it('con FC máxima, las pulsaciones en cada zona que tiene banda de pulso; en las que no, el RPE', () => {
    for (const [d, tests] of SIN_SU_TEST) {
      for (const z of SIGLAS) {
        const o = objetivoDeZona(z, d, tests, 188)
        if (conPulso(z)) {
          expect(o, d + ' ' + z).toMatchObject({ de: 'fc' })
          expect(o!.texto, d + ' ' + z).toMatch(/ ppm$/)
        } else {
          // CLA, PLA, CALA, PALA: el esfuerzo acaba antes de que el corazón llegue.
          expect(o, d + ' ' + z).toMatchObject({ de: 'esfuerzo' })
          expect(o!.texto, d + ' ' + z).toMatch(/^RPE \d/)
        }
      }
    }
  })

  it('sin FC máxima, el RPE', () => {
    for (const [d, tests] of SIN_SU_TEST) {
      for (const z of SIGLAS) {
        const o = objetivoDeZona(z, d, tests, 0)
        expect(o, d + ' ' + z).toMatchObject({ de: 'esfuerzo' })
        expect(o!.texto, d + ' ' + z).toMatch(/^RPE \d/)
      }
    }
  })

  it('NUNCA el porcentaje ni la etiqueta del catálogo: son de un número que no tiene', () => {
    for (const [d, tests] of SIN_SU_TEST) {
      for (const z of SIGLAS) {
        for (const fcMax of [0, 188]) {
          const t = objetivoDeZona(z, d, tests, fcMax)!.texto
          const donde = d + ' ' + z + ' fcMax ' + fcMax
          expect(t, donde).not.toMatch(/%/)
          expect(t, donde).not.toMatch(/VAM|FTP|CSS|APR/)
          expect(t, donde).not.toBe(ZONAS_RESISTENCIA.find(x => x.sigla === z)!.css)
          // Solo puede ser algo que el atleta mire mientras entrena.
          expect(t, donde).toMatch(/ ppm$|^RPE \d/)
        }
      }
    }
  })

  it('`de` dice la verdad: sin el test nunca es «de tus tests»', () => {
    for (const [d, tests] of SIN_SU_TEST) {
      for (const z of SIGLAS) {
        for (const fcMax of [0, 188]) {
          const o = objetivoDeZona(z, d, tests, fcMax, fcMax ? 50 : 0)!
          expect(o.de, d + ' ' + z + ' fcMax ' + fcMax).not.toBe('tests')
          // Y lo que se le dice confiesa que le falta el test.
          expect(deDondeSale(o.de)).toContain('aún no tienes el test')
        }
      }
    }
  })

  it('la referencia no trae ritmo sin el test, igual que en el clásico', () => {
    /* Lo que dice el contrato de `ritmo` («null sin test») y lo que da por
       supuesto quien lo lee: el «@» del editor, el cartel de /apuntar. */
    expect(referenciaDeZona('AEL', 'Ciclismo', { vam: 17, css: 1.25 }, 188)?.ritmo).toBeNull()
    expect(referenciaDeZona('AEL', 'Carrera', { ftp: 250, css: 1.25 }, 188)?.ritmo).toBeNull()
    expect(referenciaDeZona('AEL', 'Natacion', { vam: 17, ftp: 250 }, 188)?.ritmo).toBeNull()
    expect(referenciaDeZona('Z2', 'Ciclismo', { vam: 17, css: 1.25 }, 188)?.ritmo).toBeNull()
  })

  it('el porcentaje sigue ahí, aparte, para quien prescribe', () => {
    /* Para el entrenador sí es un dato: el panel de la semana y la hoja del día
       del grupo lo enseñan cuando falta el test. Va en su campo, no en `ritmo`. */
    expect(referenciaDeZona('AEL', 'Carrera', {}, 188)?.relativo).toBe('65–75% VAM')
    expect(referenciaDeZona('AER', 'Carrera', {}, 188)?.relativo).toBe('< 65% VAM')
    expect(referenciaDeZona('AEL', 'Ciclismo', {}, 188)?.relativo).toBe('56–75% FTP')
    expect(referenciaDeZona('AEL', 'Natacion', {}, 188)?.relativo).toBe('CSS +10–20s')
    // Es la zona, no depende de si hay test.
    expect(referenciaDeZona('AEL', 'Carrera', { vam: 17 }, 188)?.relativo).toBe('65–75% VAM')
    // En el clásico es lo mismo que su porcentaje.
    const z2 = referenciaDeZona('Z2', 'Carrera', {}, 188)
    expect(z2?.relativo).toBe('60–70% VAM')
    expect(z2?.relativo).toBe(z2?.porcentaje)
  })

  it('con el test SÍ sale su número, y lo dice', () => {
    expect(objetivoDeZona('AEL', 'Ciclismo', { ftp: 250 }, 188)).toEqual({ texto: '140–188 W', de: 'tests' })
    expect(objetivoDeZona('AEL', 'Carrera', { vam: 17 }, 188)).toMatchObject({ de: 'tests' })
    expect(objetivoDeZona('AEL', 'Carrera', { vam: 17 }, 188)!.texto).toMatch(/\/km$/)
    expect(objetivoDeZona('AEL', 'Natacion', { css: 1.25 }, 188)).toMatchObject({ de: 'tests' })
    expect(objetivoDeZona('AEL', 'Natación', { css: 1.25 }, 188)!.texto).toMatch(/\/100m$/)
  })

  it('un deporte sin referencia (brick, fuerza) no se inventa un ritmo', () => {
    // prescripcion() da «—» ahí: no es un objetivo, es un guion.
    const o = objetivoDeZona('AEL', 'Brick', { vam: 17, ftp: 250, css: 1.25 }, 188)
    expect(o?.de).toBe('fc')
    expect(o?.texto).not.toBe('—')
  })
})
