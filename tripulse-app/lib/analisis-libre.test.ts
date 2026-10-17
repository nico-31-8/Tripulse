import { describe, it, expect } from 'vitest'
import {
  graficasDelAnalisis, marcadasDeEntrada, medidasDelMomento, recorridosDelAnalisis, rutaImagenLibre, textoDeFotograma,
  type FotogramaLibre,
} from './analisis-libre'
import { aSerieGuardada, medidaDelFotograma } from './informe-movimiento'
import type { Medida } from './movimiento-datos'

const curva = (n: number, abajo: number, arriba: number) =>
  Array.from({ length: n }, (_, k) => ({ clave: k, valor: abajo + (arriba - abajo) * Math.abs(Math.cos(k / 8)) }))

const rodillaA = aSerieGuardada('rodilla', 'd', curva(60, 70, 172), 30)!
const caderaA = aSerieGuardada('cadera', 'd', curva(60, 60, 170), 30)!
const rodillaB = aSerieGuardada('rodilla', 'd', curva(45, 95, 170), 30)!

const conCurva = (nombre: string, serie: ReturnType<typeof aSerieGuardada>): Medida => ({ nombre, valor: 'de 70° a 172°', serie: serie! })
const f = (medidas: Medida[]): Pick<FotogramaLibre, 'medidas'> => ({ medidas })

/* Tres fotogramas: los dos primeros del mismo vídeo (traen las mismas curvas), el tercero de otro. */
const fotos = [
  f([medidaDelFotograma(1.2, false), { nombre: 'Ángulo 1', valor: '52°' }, conCurva('Rodilla en el vídeo (esqueleto)', rodillaA), conCurva('Cadera en el vídeo (esqueleto)', caderaA)]),
  f([medidaDelFotograma(3.2, false), { nombre: 'Rodilla (esqueleto)', valor: '70° · fiable' }, conCurva('Rodilla en el vídeo (esqueleto)', rodillaA), conCurva('Cadera en el vídeo (esqueleto)', caderaA)]),
  f([medidaDelFotograma(null, false), { nombre: 'Rodilla en el vídeo (esqueleto)', valor: 'de 95° a 170°', serie: rodillaB }]),
]

describe('lo que se enseña de cada fotograma', () => {
  it('de qué momento es, y sus medidas sin las de todo el vídeo', () => {
    expect(textoDeFotograma(fotos[0])).toBe('a los 1,20 s')
    expect(textoDeFotograma(fotos[2])).toBe('una foto')
    expect(textoDeFotograma(f([]))).toBe('')
    expect(medidasDelMomento(fotos[0]).map(m => m.nombre)).toEqual(['Ángulo 1'])
    expect(medidasDelMomento(fotos[1]).map(m => m.nombre)).toEqual(['Rodilla (esqueleto)'])
  })

  it('lo recorrido en el vídeo sale una vez, con los fotogramas en que se apuntó', () => {
    expect(recorridosDelAnalisis(fotos)).toEqual([
      { nombre: 'Rodilla en el vídeo (esqueleto)', valor: 'de 70° a 172°', fotogramas: '1 y 2' },
      { nombre: 'Cadera en el vídeo (esqueleto)', valor: 'de 70° a 172°', fotogramas: '1 y 2' },
      { nombre: 'Rodilla en el vídeo (esqueleto)', valor: 'de 95° a 170°', fotogramas: '3' },
    ])
  })
})

describe('las gráficas del informe libre', () => {
  it('sin repetir las del mismo vídeo, agrupadas por los fotogramas de los que salen', () => {
    const g = graficasDelAnalisis(fotos)
    expect(g.map(x => [x.nombrePrueba, x.nombre])).toEqual([
      ['Fotogramas 1 y 2', 'Rodilla'], ['Fotogramas 1 y 2', 'Cadera'], ['Fotograma 3', 'Rodilla'],
    ])
    expect(new Set(g.map(x => x.id)).size).toBe(3)
    const v = curva(60, 70, 172).map(p => p.valor)
    expect(g[0]).toMatchObject({ lado: 'unico', fiabilidad: 'fiable', texto: `de ${Math.round(Math.min(...v))}° a ${Math.round(Math.max(...v))}°` })
    expect(g[1].fiabilidad).toBe('margen')
  })

  it('lo que no es una curva, o tiene muy pocos puntos, no se ofrece', () => {
    const corta = aSerieGuardada('rodilla', 'd', curva(2, 70, 172), 30)!
    expect(graficasDelAnalisis([f([conCurva('x', corta), { nombre: 'y', valor: 'z' }])])).toEqual([])
    expect(graficasDelAnalisis([f([{ nombre: 'x', valor: 'y', serie: { clave: 'frontal' } as never }])])).toEqual([])
  })

  it('salen marcadas las medidas que se estaban mirando, del último vídeo', () => {
    const g = graficasDelAnalisis(fotos)
    expect(marcadasDeEntrada(g, ['rodilla', null])).toEqual([g[2].id])
    expect(marcadasDeEntrada(g, ['cadera', 'rodilla']).sort()).toEqual([g[1].id, g[2].id].sort())
    expect(marcadasDeEntrada(g, [null, null])).toEqual([])
  })
})

describe('la imagen va en la carpeta de su análisis', () => {
  it('como exige la base', () => {
    expect(rutaImagenLibre(14, 5, 'abc')).toBe('14/libre-5/abc.jpg')
  })
})
