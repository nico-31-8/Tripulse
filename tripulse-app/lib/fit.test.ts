import { describe, expect, it } from 'vitest'
import { leerFit } from './fit'
import { FIT, carreraDePrueba, datos, definir, fitDePrueba, semicirculos } from './fit-de-prueba'

describe('leerFit', () => {
  it('lee los datos de cada segundo con su escala: FC, metros, m/s y cadencia', () => {
    const fit = leerFit(fitDePrueba([
      definir(0, 20, [[253, FIT.U32], [3, FIT.U8], [5, FIT.U32], [6, FIT.U16], [4, FIT.U8], [7, FIT.U16]]),
      datos(0, [1_000, 140, 123_456, 3_250, 82, 210]),
      datos(0, [1_001, 141, 123_781, 3_300, 83, 215]),
    ]))
    expect(fit?.registros).toEqual([
      { t: 1_000, fc: 140, metros: 1234.56, velocidad: 3.25, cadencia: 82, potencia: 210 },
      { t: 1_001, fc: 141, metros: 1237.81, velocidad: 3.3, cadencia: 83, potencia: 215 },
    ])
  })

  it('las coordenadas no se leen: ni en los datos de cada segundo, ni en las vueltas, ni en la sesión', () => {
    const lat = semicirculos(43.3712), lon = semicirculos(-8.3959)
    const fit = leerFit(fitDePrueba([
      definir(0, 20, [[253, FIT.U32], [0, FIT.S32], [1, FIT.S32], [3, FIT.U8]]),
      datos(0, [1_000, lat, lon, 150]),
      definir(1, 19, [[253, FIT.U32], [2, FIT.U32], [3, FIT.S32], [4, FIT.S32], [5, FIT.S32], [6, FIT.S32], [8, FIT.U32]]),
      datos(1, [1_600, 1_000, lat, lon, lat, lon, 600_000]),
      definir(2, 18, [[253, FIT.U32], [3, FIT.S32], [4, FIT.S32], [5, FIT.ENUM], [9, FIT.U32]]),
      datos(2, [1_600, lat, lon, 1, 200_000]),
    ]))
    expect(fit).not.toBeNull()
    const todo = JSON.stringify(fit)
    for (const x of [lat, lon, Math.abs(lat), Math.abs(lon)]) expect(todo).not.toContain(String(x))
    expect(fit!.registros[0]).toEqual({ t: 1_000, fc: 150 })
    expect(Object.keys(fit!.vueltas[0]).sort()).toEqual(['fin', 'inicio', 'segundos'])
    expect(fit!.sesiones[0]).toEqual({ deporte: 1, metros: 2000 })
  })

  it('las vueltas y la sesión, con la velocidad «ampliada» si la trae', () => {
    const fit = leerFit(fitDePrueba([
      definir(0, 19, [[254, FIT.U16], [2, FIT.U32], [253, FIT.U32], [7, FIT.U32], [8, FIT.U32], [9, FIT.U32], [13, FIT.U16], [110, FIT.U32], [15, FIT.U8], [16, FIT.U8], [17, FIT.U8], [19, FIT.U16], [21, FIT.U16]]),
      datos(0, [0, 1_000, 1_980, 1_000_000, 980_000, 200_000, 2_040, 2_041, 139, 152, 81, 230, 12]),
      definir(1, 18, [[5, FIT.ENUM], [6, FIT.ENUM], [8, FIT.U32], [9, FIT.U32]]),
      datos(1, [2, 0, 3_600_000, 3_000_000]),
    ]))
    expect(fit?.vueltas).toEqual([{ inicio: 1_000, fin: 1_980, segundosTotales: 1000, segundos: 980, metros: 2000, velocidad: 2.041, fcMedia: 139, fcMax: 152, cadencia: 81, potencia: 230, desnivel: 12 }])
    /* El subdeporte 0 («genérico») es un valor de verdad, no un vacío. */
    expect(fit?.sesiones).toEqual([{ deporte: 2, subdeporte: 0, segundos: 3600, metros: 30000 }])
  })

  it('lo que el reloj no midió (el «no válido» de cada tipo) no se convierte en un cero', () => {
    const fit = leerFit(fitDePrueba([
      definir(0, 20, [[253, FIT.U32], [3, FIT.U8], [5, FIT.U32], [6, FIT.U16]]),
      datos(0, [1_000, undefined, undefined, undefined]),
    ]))
    expect(fit?.registros).toEqual([{ t: 1_000 }])
  })

  it('con el orden de bytes al revés (big endian) lee lo mismo', () => {
    const campos: [number, number][] = [[253, FIT.U32], [3, FIT.U8], [5, FIT.U32], [6, FIT.U16]]
    const normal = leerFit(fitDePrueba([definir(0, 20, campos), datos(0, [1_000, 140, 123_456, 3_250])]))
    const alReves = leerFit(fitDePrueba([definir(0, 20, campos, { grande: true }), datos(0, [1_000, 140, 123_456, 3_250])]))
    expect(alReves).toEqual(normal)
    expect(alReves?.registros[0].metros).toBe(1234.56)
  })

  it('la hora comprimida: sobre la última hora leída, y pasando por encima de los 32 segundos', () => {
    const fit = leerFit(fitDePrueba([
      definir(0, 20, [[253, FIT.U32], [3, FIT.U8]]),
      datos(0, [1_000_030, 140]),
      definir(1, 20, [[3, FIT.U8]]),
      datos(1, [141], { comprimida: (1_000_031) & 0x1f }),
      datos(1, [142], { comprimida: (1_000_034) & 0x1f }),
    ]))
    expect(fit?.registros.map(r => [r.t, r.fc])).toEqual([[1_000_030, 140], [1_000_031, 141], [1_000_034, 142]])
  })

  it('se salta los campos de desarrollador y sigue leyendo bien lo que viene después', () => {
    const fit = leerFit(fitDePrueba([
      definir(0, 20, [[253, FIT.U32], [3, FIT.U8]], { dev: [4, 1] }),
      datos(0, [1_000, 150], { dev: [4, 1] }),
      datos(0, [1_001, 151], { dev: [4, 1] }),
    ]))
    expect(fit?.registros).toEqual([{ t: 1_000, fc: 150 }, { t: 1_001, fc: 151 }])
  })

  it('los mensajes que no interesan se saltan', () => {
    const fit = leerFit(fitDePrueba([
      definir(0, 0, [[0, FIT.ENUM], [1, FIT.U16], [4, FIT.U32]]),
      datos(0, [4, 255, 12345]),
      definir(1, 21, [[253, FIT.U32], [0, FIT.ENUM], [1, FIT.ENUM]]),
      datos(1, [999, 0, 4]),
      definir(2, 20, [[253, FIT.U32], [3, FIT.U8]]),
      datos(2, [1_000, 150]),
    ]))
    expect(fit).toEqual({ sesiones: [], vueltas: [], registros: [{ t: 1_000, fc: 150 }] })
  })

  it('lo que no es un FIT, o está cortado, da null: mejor ningún detalle que uno inventado', () => {
    const bueno = fitDePrueba([definir(0, 20, [[253, FIT.U32], [3, FIT.U8]]), datos(0, [1_000, 150])])
    expect(leerFit(bueno)).not.toBeNull()
    const sinFirma = bueno.slice(); sinFirma[9] = 0x58
    expect(leerFit(sinFirma)).toBeNull()
    expect(leerFit(bueno.slice(0, bueno.length - 6))).toBeNull()
    expect(leerFit(new Uint8Array(5))).toBeNull()
    /* Datos de una definición que no existe: la cabecera (14) + la definición
       (1 + 1 + 1 + 2 + 1 + 3 = 9) deja el byte de los datos en el 23. */
    const sinDefinicion = fitDePrueba([definir(0, 20, [[253, FIT.U32]]), datos(0, [1])])
    expect(sinDefinicion[23]).toBe(0x00)
    sinDefinicion[23] = 0x05
    expect(leerFit(sinDefinicion)).toBeNull()
  })

  it('una carrera entera inventada: un dato por segundo, sus vueltas y su sesión', () => {
    const fit = leerFit(carreraDePrueba({ km: 2, velocidad: 4, fc: s => 130 + Math.floor(s / 100), vuelta: 1000 }))
    expect(fit?.registros).toHaveLength(501)
    expect(fit?.vueltas.map(v => [v.metros, v.segundos])).toEqual([[1000, 250], [1000, 250]])
    expect(fit?.sesiones[0]).toMatchObject({ deporte: 1, metros: 2000, segundos: 500 })
    expect(fit?.registros.at(-1)).toMatchObject({ metros: 2000, fc: 135 })
  })
})
