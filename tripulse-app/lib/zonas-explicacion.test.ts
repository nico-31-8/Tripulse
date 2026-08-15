import { describe, it, expect } from 'vitest'
import { ZONAS_RESISTENCIA, ZONAS_FUERZA } from './zonas'
import {
  EXPLICACION_RESISTENCIA, EXPLICACION_FUERZA, explicacionDe,
  porcentajeSemanal, DISTANCIAS, SIGLAS_RESISTENCIA, SIGLAS_FUERZA, sesionesDeZona,
} from './zonas-explicacion'
import { todasLasClaves } from './plantillas'
import type { Disciplina } from './distribucion-zonas'

const DISCIPLINAS: Disciplina[] = ['Carrera', 'Ciclismo', 'Natacion']

describe('cobertura', () => {
  /* Una zona sin explicación no rompe nada: el botón simplemente no enseña
     nada al pulsarla, que es peor que no tener botón. */
  it('las 9 zonas de resistencia del catálogo tienen explicación', () => {
    ZONAS_RESISTENCIA.forEach(z =>
      expect(EXPLICACION_RESISTENCIA[z.sigla], `falta ${z.sigla}`).toBeDefined())
  })

  it('y las 10 de fuerza', () => {
    ZONAS_FUERZA.forEach(z =>
      expect(EXPLICACION_FUERZA[z.sigla], `falta ${z.sigla}`).toBeDefined())
  })

  /* Y al revés: una explicación de una sigla que no existe es texto que nadie
     va a ver nunca, normalmente porque alguien renombró la zona y no esto. */
  it('no hay explicaciones de zonas que no existen', () => {
    Object.keys(EXPLICACION_RESISTENCIA).forEach(s =>
      expect(SIGLAS_RESISTENCIA, `sobra ${s}`).toContain(s))
    Object.keys(EXPLICACION_FUERZA).forEach(s =>
      expect(SIGLAS_FUERZA, `sobra ${s}`).toContain(s))
  })

  it('explicacionDe resuelve las dos familias, y tolera vacío', () => {
    expect(explicacionDe('AEM')?.paraQue).toMatch(/umbral aeróbico/)
    expect(explicacionDe('FMI')?.paraQue).toMatch(/economía/)
    expect(explicacionDe(null)).toBeUndefined()
    expect(explicacionDe('inventada')).toBeUndefined()
  })
})

describe('lo que tiene que llevar cada ficha', () => {
  it('toda zona dice para qué sirve, con qué hitos y cuándo', () => {
    Object.entries({ ...EXPLICACION_RESISTENCIA, ...EXPLICACION_FUERZA }).forEach(([s, e]) => {
      expect(e.paraQue.length, s).toBeGreaterThan(20)
      expect(e.hitos.length, s).toBeGreaterThan(1)
      expect(e.cuando.length, s).toBeGreaterThan(20)
    })
  })

  /* Al botón se entra desde la zona, no desde la disciplina: un entrenador que
     pulsa AEI mientras monta una sesión de natación tiene que ver la dosis de
     natación. Si falta una columna, ese entrenador se queda sin respuesta. */
  it('las de resistencia dan dosis para las tres disciplinas', () => {
    ZONAS_RESISTENCIA.forEach(z => {
      const d = EXPLICACION_RESISTENCIA[z.sigla].dosis
      expect(d, z.sigla).toBeDefined()
      expect(d!.carrera, `${z.sigla} sin carrera`).toBeTruthy()
      expect(d!.ciclismo, `${z.sigla} sin ciclismo`).toBeTruthy()
      expect(d!.natacion, `${z.sigla} sin natación`).toBeTruthy()
    })
  })

  /* Las de fuerza NO llevan dosis a propósito: series, repeticiones, carga y
     descanso ya están en ZONAS_FUERZA. Este test fija esa decisión para que
     nadie la deshaga «añadiendo lo que falta». */
  it('las de fuerza no repiten la dosis que ya está en el catálogo', () => {
    ZONAS_FUERZA.forEach(z =>
      expect(EXPLICACION_FUERZA[z.sigla].dosis, z.sigla).toBeUndefined())
  })
})

describe('las sesiones del catálogo por zona', () => {
  it('cada clave del catálogo cae en una zona y solo en una', () => {
    // Si una clave no apareciera, el entrenador vería «3 sesiones» donde hay 4
    // y no tendría forma de saber que le falta una.
    const todas = SIGLAS_RESISTENCIA.flatMap(s => sesionesDeZona(s).map(x => x.clave))
    expect([...todas].sort()).toEqual([...todasLasClaves()].sort())
    expect(new Set(todas).size).toBe(todas.length)
  })

  it('la variante se nombra con su plantilla, no suelta', () => {
    const s = sesionesDeZona('AEI').find(x => x.clave === 'cic-aei/over-unders')
    expect(s?.nombre).toBe('Intervalos al FTP · Over-unders')
    expect(s?.disciplina).toBe('Ciclismo')
  })

  it('las zonas que se usan de verdad tienen más de una opción', () => {
    // La variedad estaba puesta al revés: AER y AEL son las que más salen y
    // tenían una sola sesión. Que no vuelva a pasar sin que nadie lo note.
    ;['AER', 'AEL', 'AEM', 'AEI'].forEach(s =>
      expect(sesionesDeZona(s).length, s).toBeGreaterThan(3))
  })
})

describe('el % semanal sale del reparto, no del texto', () => {
  it('las 9 siglas tienen presupuesto en las tres disciplinas y las cuatro distancias', () => {
    DISTANCIAS.forEach(({ id }) => {
      DISCIPLINAS.forEach(disc => {
        SIGLAS_RESISTENCIA.forEach(sigla => {
          const f = porcentajeSemanal(sigla, id, disc)
          expect(f, `${sigla} · ${id} · ${disc}`).toBeDefined()
          expect(f!.min).toBeLessThanOrEqual(f!.max)
        })
      })
    })
  })

  it('el presupuesto anaeróbico es compartido, no uno por sigla', () => {
    // Si esto deja de ser cierto es que EQUIVALENCIA cambió, y la pantalla
    // estaría dando a CALA todo el cajón que comparte con PLA y PALA.
    const f = porcentajeSemanal('CALA', 'olimpico', 'Ciclismo')!
    expect(f.siglas.length).toBeGreaterThan(1)
    expect(f.siglas).toContain('PLA')
  })

  it('una zona de fuerza no tiene reparto semanal', () => {
    expect(porcentajeSemanal('FMI', 'medio', 'Carrera')).toBeUndefined()
  })

  it('el volumen base pesa más en larga que en sprint', () => {
    // La comprobación de que el número que se enseña significa algo: si el
    // reparto se leyera de la tabla equivocada, esto se caería.
    const largo = porcentajeSemanal('AEL', 'largo', 'Ciclismo')!
    const sprint = porcentajeSemanal('AEL', 'sprint', 'Ciclismo')!
    expect(largo.max).toBeGreaterThan(sprint.max)
  })
})
