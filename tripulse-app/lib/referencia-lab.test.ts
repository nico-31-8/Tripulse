// ============================================================
// Prescribir con un número del laboratorio
// ============================================================
//
// LO QUE HABÍA. Un test del laboratorio podía hacer UNA cosa con su número:
// fijarle al atleta la VAM, el FTP o el CSS. Nada más. No aparecía al elegir
// referencia para prescribir una tarea, ni al montarse zonas propias — y no es
// que saliera vacío: es que no salía. Sacabas el umbral de una curva de
// lactato, lo veías, lo pintabas en su gráfica, y después tenías que copiar el
// número a mano para mandar «40 min al 95 %».
//
// LA CAUSA, que es la de siempre: cada pantalla leía la fila de la base por su
// cuenta con `leerDefinicion`, que solo entiende el modelo viejo. Un test del
// laboratorio guarda su forma en `modelo` y deja los campos viejos vacíos a
// propósito, así que desaparecía en tres pantallas a la vez sin que fallara
// nada. Y encima el laboratorio le decía al entrenador «◈ Referencia tuya»:
// una promesa sin ningún sitio donde cumplirse.
//
// LA REGLA. `testDeFila` es el único que lee la fila, y entiende los dos
// modelos. Lo demás —qué resultado vale de referencia, cuánto vale hoy, hacia
// dónde va el porcentaje— se escribe una sola vez para los dos.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { opcionesDeRef, testDeFila, valorDe, tramoDe } from './referencia-propia'
import { paraGuardar } from './lab-guardar'
import { col, fnB, type TestLab } from './lab-constructor'

const op = (o: string) => ({ t: 'op' as const, v: o })
const num = (n: number) => ({ t: 'num' as const, v: n })

/** Un escalonado de lactato: de la curva sale un umbral en km/h. */
const LACTATO: TestLab = {
  nombre: 'Escalonado con lactato', deporte: 'Carrera', sueltos: [],
  bloques: [{
    clave: 'e', etiqueta: 'Escalón', modo: 'cerrado', veces: 4, duracion: 180, columnas: [
      col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 10, paso: 1 }),
      col({ clave: 'lactato', etiqueta: 'Lactato', unidad: 'mmol/L' }),
    ],
  }],
  resultados: [
    { nombre: 'umbral_4', unidad: 'km/h', ancla: 'umbral', formula: [{ t: 'fn2', v: 'interpola', x: 'vel', y: 'lactato', a: 4 }] },
    { nombre: 'lactato_pico', unidad: 'mmol/L', formula: [fnB('maximo', 'lactato')] },
  ],
}

/** Como lo devolvería la base: `modelo` lleno y los campos viejos vacíos. */
const filaDe = (t: TestLab, id = 7) => ({ id, ...paraGuardar(t, 'entrenador-1') })

/* Lactato 2 · 3 · 5 · 7 a 10 · 11 · 12 · 13 km/h → el 4 cae entre el 11 y el 12. */
const MEDICION = { fecha: '2026-09-01', datos: { lactato: ['2', '3', '5', '7'] } }

describe('un test del laboratorio se puede elegir como referencia', () => {
  const lab = testDeFila(filaDe(LACTATO), [MEDICION])

  it('sale en la lista, con su nombre y el del resultado', () => {
    const o = opcionesDeRef([lab], 'Carrera')
    expect(o.map(x => x.etiqueta)).toEqual(['Escalonado con lactato · umbral_4'])
  })

  it('y el índice que guarda es el del resultado dentro del test', () => {
    /* De esto cuelga la zona: si el índice no fuera el de verdad, un día
       apuntaría al lactato pico y nadie se enteraría. */
    expect(opcionesDeRef([lab], 'Carrera')[0].ref).toEqual({ idDefinicion: 7, indice: 0 })
  })

  it('los de «solo seguimiento» no se ofrecen', () => {
    /* El lactato pico es el segundo resultado y no lleva ancla. */
    expect(opcionesDeRef([lab], 'Carrera')).toHaveLength(1)
  })

  it('sigue filtrando por deporte', () => {
    expect(opcionesDeRef([lab], 'Natacion')).toHaveLength(0)
  })

  it('vale lo que da SU motor, no otro', () => {
    const v = valorDe(lab, 0)
    expect(v).toBeTruthy()
    /* Entre 11 km/h (3 mmol) y 12 (5): el 4 cae justo en medio. */
    expect(v!.valor).toBeCloseTo(11.5, 6)
    expect(v!.unidad).toBe('km/h')
    expect(v!.fecha).toBe('2026-09-01')
  })

  it('y de ahí sale el tramo de la zona', () => {
    /* Lo que se prescribe de verdad: el 90–95 % de ese umbral. */
    const t = tramoDe(valorDe(lab, 0)!, 90, 95)
    expect(t!.desde).toBeCloseTo(10.35, 6)
    expect(t!.hasta).toBeCloseTo(10.925, 6)
  })

  it('sin medición no hay referencia, y no se inventa una', () => {
    expect(valorDe(testDeFila(filaDe(LACTATO), []), 0)).toBeNull()
  })

  it('si ese día no salió el número, tira de la anterior', () => {
    /* Una medición a medias no puede dejar sin zona a quien tiene la del mes
       pasado. Aquí el lactato no llega a 4, así que `interpola` se niega —no
       extrapola— y hay que bajar a la de antes. */
    const flojo = { fecha: '2026-09-20', datos: { lactato: ['1', '1.5', '2', '2.5'] } }
    const v = valorDe(testDeFila(filaDe(LACTATO), [MEDICION, flojo]), 0)
    expect(v!.fecha).toBe('2026-09-01')
  })
})

describe('las fórmulas que miran a la vez anterior', () => {
  /* `antes()` es del laboratorio y necesita los datos EN BRUTO de la medición
     pasada. Si no se le pasaran, un resultado montado así no daría número
     justo aquí, que es donde se decide si la referencia existe. */
  const MEJORA: TestLab = {
    nombre: 'Salto', deporte: 'Fuerza',
    sueltos: [col({ clave: 'altura', etiqueta: 'Altura', unidad: 'cm' })],
    bloques: [],
    resultados: [
      { nombre: 'mejor', unidad: 'cm', ancla: 'especifica', formula: [{ t: 'var', v: 'altura' }] },
      { nombre: 'ganado', unidad: 'cm', ancla: 'especifica', formula: [
        { t: 'var', v: 'altura' }, op('-'), { t: 'antes', v: 'mejor' },
      ] },
    ],
  }

  it('el resultado que compara con la anterior da número', () => {
    const t = testDeFila(filaDe(MEJORA, 9), [
      { fecha: '2026-08-01', datos: { altura: '30' } },
      { fecha: '2026-09-01', datos: { altura: '34' } },
    ])
    expect(valorDe(t, 1)!.valor).toBeCloseTo(4, 6)
  })

  it('y en la primera medición no hay anterior, así que no hay referencia', () => {
    const t = testDeFila(filaDe(MEJORA, 9), [{ fecha: '2026-08-01', datos: { altura: '30' } }])
    expect(valorDe(t, 1)).toBeNull()
    /* Pero el resultado que no mira atrás sigue valiendo. */
    expect(valorDe(t, 0)!.valor).toBeCloseTo(30, 6)
  })
})

describe('el modelo viejo no se toca', () => {
  it('un test de /tests-propios se sigue leyendo igual', () => {
    const fila = {
      id: 3, nombre: '6×100', deporte: 'Natacion',
      campos: [{ clave: 'segundos', etiqueta: 'Segundos' }],
      resultados: [{ nombre: 'ritmo100', unidad: 's/100m', ancla: 'especifica', inverso: true, formula: [
        { t: 'var', v: 'segundos' }, op('/'), num(6),
      ] }],
    }
    const t = testDeFila(fila, [{ fecha: '2026-09-01', datos: { segundos: '438' } }])
    expect(t.lab).toBeNull()
    expect(opcionesDeRef([t], 'Natacion').map(x => x.etiqueta)).toEqual(['6×100 · ritmo100'])
    const v = valorDe(t, 0)!
    expect(v.valor).toBeCloseTo(73, 6)
    /* En segundos por 100, bajar es mejorar: el 95 % es MÁS LENTO. */
    expect(v.inverso).toBe(true)
    expect(tramoDe(v, 95, 100)!.desde).toBeCloseTo(76.842, 3)
  })
})

// ------------------------------------------------------------
// EL ALAMBRE: este test lee el código
// ------------------------------------------------------------

const RAIZ = path.resolve(__dirname, '..')

function fuentes(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) fuentes(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

describe('nadie lee la fila de un test por su cuenta', () => {
  it('quien usa los tests del entrenador pasa por testDeFila', () => {
    /* Las tres pantallas que los usan armaban el objeto a mano con
       `leerDefinicion`, y por eso los del laboratorio se caían en las tres a la
       vez. Quien vuelva a hacerlo aquí se entera. */
    const malas: string[] = []
    for (const f of fuentes(path.join(RAIZ, 'app')).concat(fuentes(path.join(RAIZ, 'components')))) {
      const src = fs.readFileSync(f, 'utf8')
      if (!/TestConMediciones/.test(src)) continue
      /* Las dos caras de lo mismo: hay que usar el lector bueno, y no puede
         quedar por ahí una llamada al que solo entiende el modelo viejo. */
      if (!/testDeFila\(/.test(src)) malas.push(path.relative(RAIZ, f) + ' (no usa testDeFila)')
      if (/leerDefinicion\(/.test(src)) malas.push(path.relative(RAIZ, f) + ' (lee la fila a mano)')
    }
    expect(malas, 'arman el test a mano: ' + malas.join(', ')).toEqual([])
  })
})
