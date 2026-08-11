import { describe, it, expect } from 'vitest'
import {
  ZONAS_CLASICAS, ZONAS_RESISTENCIA, zonaClasica, numZonaClasica, pctMedioClasica,
} from './zonas'

const NUMS = [1, 2, 3, 4, 5, 6, 7]

describe('la tabla del sistema clasico Z1-Z7', () => {
  /* EL FALLO QUE ESTO EVITA, y que estuvo vivo en produccion.
     La tabla estaba copiada en tres sitios y la columna de VAM de la ficha de
     sesion se habia separado de la de la pantalla de ejecucion. Para un atleta
     de VAM 16, el MISMO Z4 daba 3:57-4:21/km en una pantalla y 4:10-4:41/km en
     la otra. No reventaba nada: el ritmo cambiaba segun por donde entrases.
     Estos numeros son los de Tuimil (B1-00c Tabla 3), que es la que tenia bien
     la pantalla de ejecucion. */
  it('los % de VAM son los de Tuimil, que es la doctrina del vault', () => {
    expect(ZONAS_CLASICAS[2].vamPct).toEqual([60, 70])
    expect(ZONAS_CLASICAS[3].vamPct).toEqual([70, 80])
    expect(ZONAS_CLASICAS[4].vamPct).toEqual([80, 90])
    expect(ZONAS_CLASICAS[5].vamPct).toEqual([90, 100])
    expect(ZONAS_CLASICAS[6].vamPct).toEqual([100, 115])
  })

  it('NO son los de la tabla mala, que estaba desplazada hacia arriba', () => {
    // La copia rota decia Z4 = 86-95 % (y era, letra por letra, la columna de
    // natacion). Si alguien la reintroduce, esto salta.
    expect(ZONAS_CLASICAS[4].vamPct).not.toEqual([86, 95])
    expect(ZONAS_CLASICAS[4].vamPct).not.toEqual(ZONAS_CLASICAS[4].cssPct)
  })

  /* El ciclismo es Coggan en los DOS sistemas de la app (B1-00e Parte 1: los
     ftpMin/ftpMax de Zonas 2 son los 7 niveles de Coggan sin desviacion). Asi
     que las dos tablas tienen que decir lo mismo, y esta es la comprobacion
     cruzada mas fuerte que se puede hacer sin escribir numeros a mano. */
  it('los % de FTP coinciden con los de Zonas 2, porque los dos son Coggan', () => {
    const pares: [number, string][] = [
      [2, 'AEL'], [3, 'AEM'], [4, 'AEI'], [5, 'PAE'], [6, 'CLA'],
    ]
    pares.forEach(([num, sigla]) => {
      const z2 = ZONAS_RESISTENCIA.find(z => z.sigla === sigla)!
      expect(ZONAS_CLASICAS[num].ftpPct[0], `${sigla} min`).toBe(z2.ftpMin)
      expect(ZONAS_CLASICAS[num].ftpPct[1], `${sigla} max`).toBe(z2.ftpMax)
    })
  })

  it('las tres columnas van de menos a mas y sin huecos', () => {
    ;(['ftpPct', 'vamPct', 'cssPct'] as const).forEach(campo => {
      NUMS.forEach(n => {
        const [lo, hi] = ZONAS_CLASICAS[n][campo]
        expect(lo, `${campo} Z${n} del reves`).toBeLessThan(hi)
        if (n > 1) {
          const anterior = ZONAS_CLASICAS[n - 1][campo][1]
          // Se admite pegado (70→70) o con el +1 de convencion (75→76), pero
          // nunca un salto: un ritmo que no cae en ninguna zona no se prescribe.
          expect(lo - anterior, `hueco entre Z${n - 1} y Z${n} en ${campo}`).toBeLessThanOrEqual(1)
          expect(lo - anterior, `solape entre Z${n - 1} y Z${n} en ${campo}`).toBeGreaterThanOrEqual(0)
        }
      })
    })
  })

  it('Z1 tiene un rango real, no uno que empieza en cero', () => {
    // Empezaba en 0 y por eso su punto medio no significaba nada y habia que
    // escribirlo a mano en lib/duracion.ts. Con un rango de verdad se calcula
    // como los demas.
    NUMS.forEach(n => (['ftpPct', 'vamPct', 'cssPct'] as const).forEach(c => {
      expect(ZONAS_CLASICAS[n][c][0], `Z${n} ${c}`).toBeGreaterThan(0)
    }))
  })
})

describe('resolver una zona clasica', () => {
  it('acepta la sigla en cualquier caja y con espacios', () => {
    expect(numZonaClasica('Z4')).toBe(4)
    expect(numZonaClasica('z4')).toBe(4)
    expect(numZonaClasica(' Z4 ')).toBe(4)
    expect(zonaClasica('Z4')?.vamPct).toEqual([80, 90])
  })

  it('una sigla de Zonas 2 no es una zona clasica', () => {
    // Las dos conviven: si esto devolviera algo, un atleta de Zonas 2 se
    // llevaria los porcentajes del sistema que no es el suyo.
    expect(numZonaClasica('AEI')).toBeNull()
    expect(numZonaClasica('PAE')).toBeNull()
    expect(zonaClasica('AEI')).toBeNull()
  })

  it('lo que no existe devuelve null en vez de reventar', () => {
    expect(numZonaClasica('Z8')).toBeNull()
    expect(numZonaClasica('Z0')).toBeNull()
    expect(numZonaClasica('')).toBeNull()
    expect(numZonaClasica(null)).toBeNull()
    expect(numZonaClasica(undefined)).toBeNull()
  })
})

describe('el punto medio que usa la estimacion de duracion', () => {
  it('es el punto medio de verdad, no un numero escrito aparte', () => {
    NUMS.forEach(n => {
      const [lo, hi] = ZONAS_CLASICAS[n].vamPct
      expect(pctMedioClasica(n, 'vamPct')).toBe(Math.round((lo + hi) / 2))
    })
  })

  /* Los valores que tenia lib/duracion.ts escritos a mano salian de la tabla
     rota, asi que estimaba a un 5 % mas de velocidad de la que dice la doctrina
     y las sesiones de carrera por distancia salian mas cortas de lo real. */
  it('la correccion baja las velocidades estimadas de carrera', () => {
    const antiguos: Record<number, number> = { 1: 60, 2: 70, 3: 80, 4: 90, 5: 100, 6: 113, 7: 135 }
    NUMS.forEach(n => {
      expect(pctMedioClasica(n, 'vamPct'), `Z${n}`).toBeLessThan(antiguos[n])
    })
    expect(pctMedioClasica(4, 'vamPct')).toBe(85)
  })

  it('una zona que no existe no rompe la estimacion', () => {
    expect(pctMedioClasica(9, 'vamPct')).toBe(0)
  })
})
