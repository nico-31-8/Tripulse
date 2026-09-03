import { describe, it, expect } from 'vitest'
import {
  APORTAN, DESTINOS, aporteDe, propuestaDe, filaDeZonas, fijarZonas,
} from './zonas-desde-test'
import { CATALOGO } from './catalogo-tests'

const t = (clave: string) => CATALOGO.find(x => x.clave === clave)!
const CTX = { pesoKg: 70, sexo: 'Hombre' as const }

function sbFalso(op: { falla?: string; fallaSiempre?: boolean } = {}) {
  const escritas: any[] = []
  return {
    escritas,
    from(tabla: string) {
      return {
        insert(fila: any) {
          if (op.fallaSiempre) return Promise.resolve({ error: { message: 'RLS' } })
          if (op.falla && JSON.stringify(fila).includes(op.falla)) {
            return Promise.resolve({ error: { message: "column \"" + op.falla + "\" does not exist" } })
          }
          escritas.push({ ...fila, _tabla: tabla })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

describe('quién puede fijar las zonas y quién no', () => {
  it('los cinco que miden la misma magnitud', () => {
    expect(Object.keys(APORTAN).sort()).toEqual(['6min', 'ftp20', 'ftp60', 'milla', 't400'])
  })

  it('el T30 NO puede: da ritmo umbral, que no es la VAM', () => {
    /* Son dos velocidades distintas. Meter el ritmo umbral donde va la VAM
       desplazaría TODAS las zonas de carrera de ese atleta hacia abajo, y no
       fallaría nada: los ritmos saldrían, solo que mal. */
    expect(aporteDe(t('t30'))).toBeNull()
  })

  it('tampoco los que miden otra cosa', () => {
    for (const c of ['180m', 'rast', 'swolf', 'bosco', 'dropjump', 'brick', 'decoupling', 'escalera']) {
      expect(aporteDe(t(c)), c).toBeNull()
    }
  })

  it('cada aporte apunta a una salida QUE EXISTE en su test', () => {
    /* Si la clave de la salida está mal escrita, `propuestaDe` devuelve null
       para siempre: el botón no sale nunca y nada avisa de por qué. */
    for (const [clave, a] of Object.entries(APORTAN)) {
      const claves = t(clave).salidas.map(s => s.clave)
      expect(claves, clave).toContain(a.salida)
    }
  })

  it('cada ancla va a la tabla de la que salen sus zonas', () => {
    expect(DESTINOS.vam.tabla).toBe('test1_carrera')
    expect(DESTINOS.css.tabla).toBe('test2_natacion')
    expect(DESTINOS.ftp.tabla).toBe('test3_ciclismo')
  })
})

describe('el número que se guarda', () => {
  it('6 minutos: 1.540 m son 15,4 km/h y van tal cual', () => {
    const p = propuestaDe(t('6min'), { metros: '1540' }, CTX)!
    expect(p.valor).toBe(15.4)
    expect(p.destino.columna).toBe('vam')
    expect(p.aporte.estimado).toBeUndefined()
  })

  it('la milla se marca como estimada', () => {
    const p = propuestaDe(t('milla'), { minutos: '5.5' }, CTX)!
    expect(p.valor).toBe(17.6)
    expect(p.aporte.estimado).toBe(true)
  })

  it('EL T400 SE CONVIERTE: la columna css guarda m/s, no s/100m', () => {
    /* 300 s de 400 → umbral 80 s/100m → 1,25 m/s. Sin convertir se guardaría un
       CSS de 80, que es sesenta y cuatro veces el ritmo real de un nadador. No
       rompería nada: las zonas saldrían calculadas y absurdas. */
    const p = propuestaDe(t('t400'), { segundos: '300' }, CTX)!
    expect(p.valor).toBe(1.25)
    expect(p.texto).toBe('1,25 m/s')
  })

  it('un CSS convertido cae donde caen los CSS de verdad', () => {
    /* Guarda de cordura: cualquier nadador está entre 0,6 y 2,5 m/s. */
    for (const seg of ['260', '300', '360', '420']) {
      const p = propuestaDe(t('t400'), { segundos: seg }, CTX)!
      expect(p.valor, seg).toBeGreaterThan(0.6)
      expect(p.valor, seg).toBeLessThan(2.5)
    }
  })

  it('los dos FTP van en vatios y sin tocar', () => {
    expect(propuestaDe(t('ftp20'), { media: '250' }, CTX)!.valor).toBe(238)
    expect(propuestaDe(t('ftp60'), { media: '238' }, CTX)!.valor).toBe(238)
  })

  it('sin dato, no hay propuesta: el botón no aparece', () => {
    expect(propuestaDe(t('6min'), {}, CTX)).toBeNull()
    expect(propuestaDe(t('6min'), { metros: '' }, CTX)).toBeNull()
  })

  it('un test que no aporta nunca da propuesta', () => {
    expect(propuestaDe(t('t30'), { metros: '9000' }, CTX)).toBeNull()
  })
})

describe('la fila', () => {
  it('lleva SOLO el ancla, la fecha y de dónde salió', () => {
    /* Nada más de ese test entra en la tabla de zonas: los metros del test de 6
       minutos no son «velocidad del último escalón». */
    const p = propuestaDe(t('6min'), { metros: '1540' }, CTX)!
    expect(filaDeZonas(7, '2026-09-03', p, '6min')).toEqual({
      id_deportista: 7, fecha: '2026-09-03', vam: 15.4, origen: '6min',
    })
  })
})

describe('guardar', () => {
  it('escribe en la tabla de la disciplina', async () => {
    const sb = sbFalso()
    const p = propuestaDe(t('ftp60'), { media: '241' }, CTX)!
    const r = await fijarZonas(sb as any, 4, '2026-09-03', p, 'ftp60')
    expect(r.error).toBeNull()
    expect(sb.escritas[0]).toMatchObject({ _tabla: 'test3_ciclismo', ftp: 241, origen: 'ftp60' })
  })

  it('sin fecha no se guarda', async () => {
    const sb = sbFalso()
    const p = propuestaDe(t('6min'), { metros: '1540' }, CTX)!
    expect((await fijarZonas(sb as any, 4, '', p, '6min')).error).toBeTruthy()
    expect(sb.escritas).toHaveLength(0)
  })

  it('si la columna `origen` todavía no existe, guarda sin ella y lo dice', async () => {
    /* PostgREST tira la consulta ENTERA si nombras una columna que no está. Con
       el SQL sin correr, esto fallaría del todo y el entrenador vería un error
       sin entender por qué. El orden entre desplegar y correr SQL ya nos mordió
       una vez con el FTP. */
    const sb = sbFalso({ falla: 'origen' })
    const p = propuestaDe(t('6min'), { metros: '1540' }, CTX)!
    const r = await fijarZonas(sb as any, 4, '2026-09-03', p, '6min')
    expect(r.error).toBeNull()
    expect(r.sinOrigen).toBe(true)
    expect(sb.escritas[0]).toMatchObject({ vam: 15.4 })
    expect(sb.escritas[0].origen).toBeUndefined()
  })

  it('un error que NO es el de la columna se devuelve tal cual', async () => {
    const sb = sbFalso({ fallaSiempre: true })
    const p = propuestaDe(t('6min'), { metros: '1540' }, CTX)!
    const r = await fijarZonas(sb as any, 4, '2026-09-03', p, '6min')
    expect(r.error).toBe('RLS')
    expect(r.sinOrigen).toBeUndefined()
  })
})
