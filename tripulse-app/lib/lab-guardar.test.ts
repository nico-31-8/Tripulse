// Leer y escribir el modelo nuevo. Lo importante aquí no es que un test bueno
// dé la vuelta entero —que también— sino que uno ROTO no reviente la pantalla
// ni se cuele hasta el cálculo.
import { describe, it, expect } from 'vitest'
import { leerModelo, paraGuardar, leerMediciones, medicionDe } from './lab-guardar'
import { calcular, pegasDe, protoVacio, medVacia, type TestLab } from './lab-constructor'
import { PLANTILLAS, plantillaPorId } from './lab-plantillas'

const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

describe('el viaje de ida y vuelta', () => {
  it('las nueve plantillas sobreviven a guardarlas y volverlas a leer', () => {
    for (const p of PLANTILLAS) {
      const fila = paraGuardar(clon(p.test), 'uuid-del-entrenador')
      const vuelta = leerModelo(fila.modelo)
      expect(vuelta, p.id).not.toBeNull()
      expect(pegasDe(vuelta!), p.id).toEqual([])
      /* Y sigue calculando lo mismo, que es lo que de verdad importa. */
      const d = { ...protoVacio(vuelta!), ...medVacia(vuelta!) }
      expect(calcular(vuelta!, d).length, p.id).toBe(p.test.resultados.length)
    }
  })

  it('un 6×100 da la vuelta con sus números intactos', () => {
    const t = clon(plantillaPorId('reps')!.test)
    const vuelta = leerModelo(paraGuardar(t, 'x').modelo)!
    const datos = { ...protoVacio(vuelta), ...medVacia(vuelta), t100: ['74', '75', '76', '77', '78', '80'] }
    expect(calcular(vuelta, datos)[0].valor).toBeCloseTo(460, 3)
  })

  it('la VAM conserva que el incremento sale de una casilla', () => {
    const t = clon(plantillaPorId('vam')!.test)
    const vuelta = leerModelo(paraGuardar(t, 'x').modelo)!
    const vel = vuelta.bloques[0].columnas[0]
    expect(vel.pasoRef).toBe('incremento')
    expect(vel.desdeRef).toBe('inicio')
  })

  it('el RAST conserva la fórmula de su columna calculada', () => {
    const t = clon(plantillaPorId('rast')!.test)
    const vuelta = leerModelo(paraGuardar(t, 'x').modelo)!
    const pot = vuelta.bloques[0].columnas.find(c => c.clave === 'pot')!
    expect(pot.clase).toBe('calculada')
    expect(pot.formula?.length).toBeGreaterThan(0)
    const datos = { ...protoVacio(vuelta), ...medVacia(vuelta), ts: ['4.8', '5', '5.2', '5.5', '5.8', '6.1'] }
    expect(calcular(vuelta, datos)[1].valor).toBeCloseTo(567.3, 0)
  })

  it('el 30-15 conserva sus tramos', () => {
    const vuelta = leerModelo(paraGuardar(clon(plantillaPorId('ift')!.test), 'x').modelo)!
    expect(vuelta.bloques[0].tramos).toEqual([{ nombre: 'Correr', segundos: 30 }, { nombre: 'Andar', segundos: 15 }])
  })

  it('el perfil conserva las funciones de dos columnas', () => {
    const vuelta = leerModelo(paraGuardar(clon(plantillaPorId('perfil')!.test), 'x').modelo)!
    expect(vuelta.resultados[0].formula[0]).toEqual({ t: 'fn2', v: 'corte', x: 'carga', y: 'vel' })
  })
})

describe('lo guardado no manda sobre el código', () => {
  it('lo que no es del modelo nuevo devuelve null', () => {
    expect(leerModelo(null)).toBeNull()
    expect(leerModelo('no soy json')).toBeNull()
    expect(leerModelo(42)).toBeNull()
    /* Un test del modelo VIEJO: tiene campos, no sueltos ni bloques. Así es
       como se distingue uno de otro sin una bandera aparte. */
    expect(leerModelo({ campos: [], resultados: [] })).toBeNull()
  })

  it('un jsonb que llega como texto se entiende igual', () => {
    const fila = paraGuardar(clon(plantillaPorId('una')!.test), 'x')
    expect(leerModelo(JSON.stringify(fila.modelo))?.nombre).toBe('CMJ')
  })

  it('una clase o un instrumento que no existen degradan, no revientan', () => {
    const t = leerModelo({
      nombre: 'raro', deporte: 'Otro', sueltos: [
        { clave: 'a', clase: 'teletransporte', instrumento: 'parsecs' },
      ], bloques: [], resultados: [],
    })!
    expect(t.sueltos[0].clase).toBe('medida')
    expect(t.sueltos[0].instrumento).toBe('mano')
  })

  it('una función inventada se tira en vez de colarse hasta el cálculo', () => {
    const t = leerModelo({
      nombre: 'x', deporte: 'Otro', sueltos: [], bloques: [],
      resultados: [{ nombre: 'z', unidad: '', formula: [
        { t: 'fn', v: 'invocar', de: 'a' },
        { t: 'fn2', v: 'adivinar', x: 'a', y: 'b' },
        { t: 'num', v: 3 },
      ] }],
    })!
    expect(t.resultados[0].formula).toEqual([{ t: 'num', v: 3 }])
  })

  it('un bloque sin columnas no entra', () => {
    const t = leerModelo({ nombre: 'x', deporte: 'Otro', sueltos: [], bloques: [{ clave: 'b', columnas: [] }], resultados: [] })!
    expect(t.bloques).toEqual([])
  })

  it('un número de repeticiones absurdo se acota', () => {
    const t = leerModelo({
      nombre: 'x', deporte: 'Otro', sueltos: [],
      bloques: [{ clave: 'b', veces: 9999, columnas: [{ clave: 'c' }] }], resultados: [],
    })!
    expect(t.bloques[0].veces).toBe(40)
  })

  it('una columna sin clave no entra, y un resultado sin nombre tampoco', () => {
    const t = leerModelo({
      nombre: 'x', deporte: 'Otro',
      sueltos: [{ clave: '' }, { clave: 'buena' }], bloques: [],
      resultados: [{ nombre: '' }, { nombre: 'vale' }],
    })!
    expect(t.sueltos.map(c => c.clave)).toEqual(['buena'])
    expect(t.resultados.map(r => r.nombre)).toEqual(['vale'])
  })
})

describe('lo que se guarda de una pasada', () => {
  /* El protocolo se copia en CADA medición. Si viviera solo en la definición,
     cambiar el incremento mañana reescribiría en silencio todas las VAM del
     pasado — y nadie sabría por qué se movieron. */
  it('el protocolo viaja con la medición, no se queda en la definición', () => {
    const m = medicionDe({ incremento: '0.5', duracion: '60' }, { '@esc': 9, aguanto: '40' })
    expect(m.incremento).toBe('0.5')
    expect(m['@esc']).toBe(9)
  })

  it('lo de cada uno gana si choca con el protocolo', () => {
    expect(medicionDe({ x: 'protocolo' }, { x: 'suyo' }).x).toBe('suyo')
  })

  it('las mediciones se leen tirando lo que no tiene fecha', () => {
    const m = leerMediciones([
      { fecha: '2026-09-20', datos: { a: 1 } },
      { fecha: '', datos: {} },
      { fecha: '2026-09-21', datos: '{"b":2}' },
      { fecha: '2026-09-22' },
    ])
    expect(m.map(x => x.fecha)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22'])
    expect(m[1].datos).toEqual({ b: 2 })
    expect(m[2].datos).toEqual({})
  })

  it('sin mediciones no revienta', () => {
    expect(leerMediciones(null)).toEqual([])
    expect(leerMediciones(undefined)).toEqual([])
  })
})

describe('la fila que va a la base', () => {
  it('deja campos y resultados viejos vacíos', () => {
    /* Rellenarlos con algo parecido haría que /tests-propios enseñara una
       versión mutilada del test y dejara corregirla allí. */
    const fila = paraGuardar(clon(plantillaPorId('vam')!.test), 'uuid')
    expect(fila.campos).toEqual([])
    expect(fila.resultados).toEqual([])
    expect(fila.id_entrenador).toBe('uuid')
  })

  it('saca el nombre y el deporte fuera del blob, para poder listarlos', () => {
    const t: TestLab = { ...clon(plantillaPorId('una')!.test), nombre: '  CMJ con espacios  ' }
    const fila = paraGuardar(t, 'uuid')
    expect(fila.nombre).toBe('CMJ con espacios')
    expect(fila.deporte).toBe('Fuerza')
    expect(fila.modelo.nombre).toBe('CMJ con espacios')
  })
})
