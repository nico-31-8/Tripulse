import { describe, expect, it } from 'vitest'
import {
  cumplimiento, detalleDeFit, distanciaTexto, fcPorTramos, fcSegundosDe, ritmoDeTrozo, tiempoEnZonas, tiempoTexto,
  tramosDe, zonasFcDe, PAUSA_S, VERSION_DETALLE,
} from './detalle-entreno'
import { leerFit, type RegistroFit } from './fit'
import { carreraDePrueba } from './fit-de-prueba'

/** Un dato por segundo a velocidad constante, con la FC que se diga. */
const constante = (segundos: number, velocidad: number, fc: (s: number) => number | undefined): RegistroFit[] =>
  Array.from({ length: segundos + 1 }, (_, s) => ({ t: 1000 + s, metros: s * velocidad, fc: fc(s) }))

describe('fcSegundosDe', () => {
  it('cuenta los segundos a cada pulsación; una pausa vale un segundo, y la FC imposible no cuenta', () => {
    const r: RegistroFit[] = [
      { t: 0, fc: 140 }, { t: 1, fc: 140 }, { t: 2, fc: 141 },
      /* Antes de una pausa larga: vale 1 s, no los 60 de la pausa. */
      { t: 3, fc: 141 }, { t: 63, fc: 150 },
      { t: 64, fc: 250 }, { t: 65, fc: 20 }, { t: 66 },
    ]
    expect(fcSegundosDe(r)).toEqual({ fc_segundos: { 140: 2, 141: 2, 150: 1 }, segundos_con_fc: 5 })
  })

  it('con datos cada 5 segundos, cada uno vale sus 5', () => {
    const r: RegistroFit[] = [{ t: 0, fc: 140 }, { t: 5, fc: 142 }, { t: 10, fc: 144 }]
    expect(fcSegundosDe(r)).toEqual({ fc_segundos: { 140: 5, 142: 5, 144: 1 }, segundos_con_fc: 11 })
    expect(PAUSA_S).toBeGreaterThanOrEqual(5)
  })
})

describe('tramosDe', () => {
  it('2,5 km a 4 m/s: dos km de 250 s y el trozo de 500 m, con su FC media', () => {
    const t = tramosDe(constante(625, 4, s => (s < 250 ? 140 : 150)), 1000)
    expect(t.map(x => [x.metros, x.segundos, x.fc_media, x.fc_max])).toEqual([[1000, 250, 140, 140], [1000, 250, 150, 150], [500, 125, 150, 150]])
  })

  it('la pausa no cuenta como tiempo del tramo', () => {
    const r = constante(500, 4, () => 145)
    /* Se para 2 minutos a los 100 m: al volver, el mismo sitio dos minutos después. */
    const conPausa = [...r.slice(0, 26), ...r.slice(25).map(x => ({ ...x, t: x.t + 121 }))]
    expect(tramosDe(conPausa, 1000).map(x => x.segundos)).toEqual([250, 250])
  })

  it('sin distancia, o con un trozo final de menos de 50 m, no se inventa nada', () => {
    expect(tramosDe([{ t: 0, fc: 140 }, { t: 1, fc: 141 }], 1000)).toEqual([])
    expect(tramosDe(constante(255, 4, () => 140), 1000).map(x => x.metros)).toEqual([1000])
  })
})

describe('detalleDeFit', () => {
  const fit = leerFit(carreraDePrueba({ km: 2.5, velocidad: 4, fc: s => 130 + Math.floor(s / 125) * 5, vuelta: 1000 }))!

  it('en carrera, las vueltas del reloj, los km y la FC', () => {
    const d = detalleDeFit(fit, 'Carrera')
    expect(d.vueltas.map(v => [v.metros, v.segundos])).toEqual([[1000, 250], [1000, 250], [500, 125]])
    expect(d.tramo_m).toBe(1000)
    expect(d.tramos.map(x => x.metros)).toEqual([1000, 1000, 500])
    expect(d.segundos_con_fc).toBe(626)
    expect(Object.keys(d.fc_segundos).map(Number).sort()).toEqual([130, 135, 140, 145, 150, 155])
    expect(d.motivo).toBeNull()
    expect(d.version).toBe(VERSION_DETALLE)
  })

  it('en bici, de 5 en 5 km; en natación y el resto, sin tramos (solo las vueltas)', () => {
    expect(detalleDeFit(fit, 'Ciclismo').tramo_m).toBeNull()
    expect(detalleDeFit(leerFit(carreraDePrueba({ km: 11, velocidad: 8, fc: () => 130 }))!, 'Ciclismo').tramos.map(x => x.metros)).toEqual([5000, 5000, 1000])
    expect(detalleDeFit(fit, 'Natacion').tramos).toEqual([])
    expect(detalleDeFit(fit, 'Fuerza').tramos).toEqual([])
    expect(detalleDeFit(fit, null).tramos).toEqual([])
  })

  it('un fichero sin vueltas, sin distancia y sin FC dice por qué no hay detalle', () => {
    expect(detalleDeFit({ sesiones: [], vueltas: [], registros: [{ t: 1 }, { t: 2 }] }, 'Carrera').motivo).toMatch(/ni vueltas ni FC/)
  })

  it('lo que se guarda no lleva ni una coordenada', () => {
    const texto = JSON.stringify(detalleDeFit(fit, 'Carrera'))
    expect(texto).not.toMatch(/lat|lon|posici|coord/i)
  })
})

describe('zonasFcDe', () => {
  it('Zonas 2 con FC máx y reposo: cinco zonas por pulso, seguidas, con la reserva', () => {
    const r = zonasFcDe(2, { fcMax: 188, fcReposo: 52 })!
    expect(r.metodo).toBe('karvonen')
    expect(r.zonas.map(z => z.sigla)).toEqual(['AER', 'AEL', 'AEM', 'AEI', 'PAE'])
    expect(r.zonas[0].min).toBe(0)
    for (let i = 1; i < r.zonas.length; i++) expect(r.zonas[i].min).toBe(r.zonas[i - 1].max)
    expect(r.zonas.at(-1)!.max).toBeNull()
  })

  it('sin reposo, con la FC máx a secas; el clásico, Z1 a Z5', () => {
    expect(zonasFcDe(2, { fcMax: 188 })!.metodo).toBe('fcmax')
    const c = zonasFcDe(1, { fcMax: 188, fcReposo: 52 })!
    expect(c.zonas.map(z => z.sigla)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5'])
    expect(c.zonas.map(z => z.nombre)).toEqual(['Recuperación', 'Aeróbica', 'Tempo', 'Umbral', 'VO2máx'])
    expect(zonasFcDe(null, { fcMax: 188 })!.zonas).toHaveLength(5)
  })

  it('sin FC máx no hay zonas: no se inventan', () => {
    expect(zonasFcDe(2, { fcMax: 0, fcReposo: 52 })).toBeNull()
  })
})

describe('el tiempo en zonas', () => {
  const zonas = [
    { sigla: 'A', nombre: 'a', color: '#000', min: 0, max: 130 },
    { sigla: 'B', nombre: 'b', color: '#111', min: 130, max: 150 },
    /* Un hueco de un punto entre bandas, como en el clásico: 150 va a B. */
    { sigla: 'C', nombre: 'c', color: '#222', min: 151, max: null },
  ]

  it('cada pulsación a la zona más alta cuyo principio no supera', () => {
    const t = tiempoEnZonas({ 120: 60, 130: 30, 150: 30, 151: 60, 190: 60 }, zonas)
    expect(t.map(z => [z.sigla, z.segundos, z.pct])).toEqual([['A', 60, 25], ['B', 60, 25], ['C', 120, 50]])
  })

  it('lo prescrito frente a lo hecho', () => {
    const t = tiempoEnZonas({ 120: 30, 140: 150, 160: 60 }, zonas)
    expect(cumplimiento(t, 'B')).toEqual({ en: 63, encima: 25, debajo: 12 })
    expect(cumplimiento(t, 'Z9')).toBeNull()
    expect(cumplimiento(tiempoEnZonas({}, zonas), 'B')).toBeNull()
  })

  it('sin zonas, la FC por tramos de 10 pulsaciones, solo los que tienen algo', () => {
    expect(fcPorTramos({ 128: 10, 131: 20, 139: 5, 150: 7 })).toEqual([
      { desde: 120, hasta: 129, segundos: 10 }, { desde: 130, hasta: 139, segundos: 25 }, { desde: 150, hasta: 159, segundos: 7 },
    ])
  })
})

describe('cómo se escribe', () => {
  it('tiempos, distancias y el ritmo de cada deporte', () => {
    expect([tiempoTexto(3240), tiempoTexto(3735), tiempoTexto(59.6), tiempoTexto(null)]).toEqual(['54:00', '1:02:15', '1:00', '—'])
    expect([distanciaTexto(6620), distanciaTexto(800), distanciaTexto(0)]).toEqual(['6,62 km', '800 m', '—'])
    expect(ritmoDeTrozo(6620, 3240, 'Carrera')).toBe('8:09 /km')
    expect(ritmoDeTrozo(40000, 5070, 'Ciclismo')).toBe('28,4 km/h')
    expect(ritmoDeTrozo(400, 448, 'Natacion')).toBe('1:52 /100 m')
    expect(ritmoDeTrozo(0, 100, 'Carrera')).toBeNull()
  })
})
