import { describe, it, expect } from 'vitest'
import { FILTRO_VIVAS } from './papelera'
import { calcularFactorBrick, factorPersonalizado, clavePar } from './sicat-brick'

// ------------------------------------------------------------
// Doble de Supabase que SÍ filtra. Es importante que aplique eq/in/is de verdad:
// calcularFactorBrick consulta `sesion` dos veces (las de microciclo y las libres)
// y un doble que devolviera siempre la misma tabla las contaría dos veces, dando
// tests verdes sobre datos duplicados.
// ------------------------------------------------------------
function fakeSupabase(tablas: Record<string, any[]>) {
  return {
    from(tabla: string) {
      let filas = [...(tablas[tabla] ?? [])]
      const q: any = {
        select: () => q,
        eq: (col: string, val: any) => { filas = filas.filter(f => f[col] === val); return q },
        in: (col: string, vals: any[]) => { filas = filas.filter(f => vals.includes(f[col])); return q },
        is: (col: string, val: any) => { filas = filas.filter(f => (f[col] ?? null) === val); return q },
        not: (col: string, _op: string, val: any) => { filas = filas.filter(f => (f[col] ?? null) !== val); return q },
        /* Lo que está en la papelera no cuenta (lib/papelera). El doble lo
           implementa de verdad y no como un paso vacío: si se ignorara, estos
           tests seguirían en verde con una sesión borrada dentro del cálculo,
           que es justo lo que se viene a impedir. */
        or: (filtro: string) => {
          if (filtro === FILTRO_VIVAS) filas = filas.filter(f => !f.eliminada)
          return q
        },
        order: (col: string) => { filas = [...filas].sort((a, b) => (a[col] ?? 0) - (b[col] ?? 0)); return q },
        then: (resolve: any) => resolve({ data: filas, error: null }),
      }
      return q
    },
  }
}

const DEP = 7
/* El microciclo lleva `id_deportista` desde la Fase A, y es por ahí por donde se
   busca ahora (antes se llegaba encadenando macrociclo → mesociclo → microciclo,
   tres viajes para lo mismo). La maqueta lo refleja porque en la base está: si
   se dejara fuera, el test pasaría con una estructura que no existe. */
const estructura = {
  macrociclo: [{ id: 1, id_deportista: DEP }],
  mesociclo: [{ id: 10, id_macrociclo: 1, id_deportista: DEP }],
  microciclo: [{ id: 100, id_mesociclo: 10, id_deportista: DEP }],
}

const sesNormal = (id: number, disciplina = 'Carrera') =>
  ({ id, disciplina, estado: 'Realizada', id_microciclo: 100, transiciones: [] })
const sesBrick = (id: number) =>
  ({ id, disciplina: 'Brick', estado: 'Realizada', id_microciclo: 100, transiciones: [{ despues_de: 1, segundos: 90 }] })

const bloque = (id_sesion: number, orden: number, disciplina: string, zona: string, rpe: number | null) =>
  ({ id_sesion, orden, disciplina, zona_entrenamiento: zona, rpe_reportado: rpe })

// Un escenario completo: N carreras sueltas en AEM a `rpeFresco`, y N bricks
// bici→carrera cuyo bloque de carrera (misma zona AEM) va a `rpeBrick`.
function escenario(n: number, rpeFresco: number, rpeBrick: number) {
  const sesion: any[] = []
  const tarea: any[] = []
  for (let i = 0; i < n; i++) {
    const idN = 100 + i
    sesion.push(sesNormal(idN))
    tarea.push(bloque(idN, 1, 'Carrera', 'AEM', rpeFresco))

    const idB = 200 + i
    sesion.push(sesBrick(idB))
    tarea.push(bloque(idB, 1, 'Ciclismo', 'AEL', 6))
    tarea.push(bloque(idB, 2, 'Carrera', 'AEM', rpeBrick))
  }
  return fakeSupabase({ ...estructura, sesion, tarea })
}

describe('calcularFactorBrick — aprender la concatenación del atleta', () => {
  it('sin sesiones no inventa nada', async () => {
    const res = await calcularFactorBrick(fakeSupabase({ ...estructura, sesion: [], tarea: [] }), DEP)
    expect(res).toEqual({})
  })

  it('aprende el factor real comparando post-transición contra el mismo deporte y zona en fresco', async () => {
    // corre AEM a RPE 6 en fresco y a RPE 8 tras la bici → 8/6 = 1,33
    const res = await calcularFactorBrick(escenario(3, 6, 8), DEP)
    const par = res[clavePar('Ciclismo', 'Carrera')]
    expect(par).toBeDefined()
    expect(par.aprendido).toBe(true)
    expect(par.factor).toBeCloseTo(1.333, 2)
    expect(par.rpeBrick).toBe(8)
    expect(par.rpeFresco).toBe(6)
  })

  it('con menos de 3 muestras usa el valor de B1-04 y lo dice', async () => {
    const res = await calcularFactorBrick(escenario(2, 6, 8), DEP)
    const par = res[clavePar('Ciclismo', 'Carrera')]
    expect(par.aprendido).toBe(false)
    expect(par.factor).toBe(1.15)       // bici→carrera, interferencia 'alta'
    expect(par.porDefecto).toBe(1.15)
    expect(par.nBrick).toBe(2)
  })

  it('un atleta que sufre muchísimo queda acotado en 1,40 (fuera de ahí es ruido)', async () => {
    const res = await calcularFactorBrick(escenario(3, 2, 10), DEP)   // ratio 5
    expect(res[clavePar('Ciclismo', 'Carrera')].factor).toBe(1.4)
  })

  it('un atleta muy rodado no baja de 1: la concatenación nunca abarata', async () => {
    const res = await calcularFactorBrick(escenario(3, 8, 4), DEP)    // ratio 0,5
    expect(res[clavePar('Ciclismo', 'Carrera')].factor).toBe(1)
  })

  it('el factor aprendido conserva el de B1-04 al lado, para poder contrastarlos', async () => {
    const par = (await calcularFactorBrick(escenario(3, 6, 8), DEP))[clavePar('Ciclismo', 'Carrera')]
    expect(par.aprendido).toBe(true)
    expect(par.porDefecto).toBe(1.15)
    expect(par.factor).not.toBe(par.porDefecto)
  })
})

describe('calcularFactorBrick — qué NO debe contar', () => {
  it('sin referencia en fresco de la MISMA zona no aprende nada', async () => {
    // el fresco es AEL y el bloque post-transición es AEM: un RPE alto podría ser
    // de la zona, no de venir de la bici. Sin comparación válida, no hay par.
    const sb = fakeSupabase({
      ...estructura,
      sesion: [sesNormal(100), sesNormal(101), sesNormal(102), sesBrick(200), sesBrick(201), sesBrick(202)],
      tarea: [
        bloque(100, 1, 'Carrera', 'AEL', 6), bloque(101, 1, 'Carrera', 'AEL', 6), bloque(102, 1, 'Carrera', 'AEL', 6),
        bloque(200, 1, 'Ciclismo', 'AEL', 6), bloque(200, 2, 'Carrera', 'AEM', 8),
        bloque(201, 1, 'Ciclismo', 'AEL', 6), bloque(201, 2, 'Carrera', 'AEM', 8),
        bloque(202, 1, 'Ciclismo', 'AEL', 6), bloque(202, 2, 'Carrera', 'AEM', 8),
      ],
    })
    expect(await calcularFactorBrick(sb, DEP)).toEqual({})
  })

  it('sin transición declarada no es concatenación: dos bloques seguidos no bastan', async () => {
    const sinTrans = { id: 200, disciplina: 'Brick', estado: 'Realizada', id_microciclo: 100, transiciones: [] }
    const sb = fakeSupabase({
      ...estructura,
      sesion: [sesNormal(100), sesNormal(101), sesNormal(102), sinTrans],
      tarea: [
        bloque(100, 1, 'Carrera', 'AEM', 6), bloque(101, 1, 'Carrera', 'AEM', 6), bloque(102, 1, 'Carrera', 'AEM', 6),
        bloque(200, 1, 'Ciclismo', 'AEL', 6), bloque(200, 2, 'Carrera', 'AEM', 9),
      ],
    })
    expect(await calcularFactorBrick(sb, DEP)).toEqual({})
  })

  /* LO QUE ESTA EN LA PAPELERA NO CUENTA. Este calculo aprende cuanto le cuesta
     al atleta correr despues de la bici comparando RPEs reales. Una sesion que el
     entrenador borro sigue en la tabla con eliminada = true, y hasta ahora entraba
     en la media: el factor personalizado del atleta salia de datos que alguien
     habia decidido tirar. */
  it('una sesion en la papelera no entra en el aprendizaje', async () => {
    const conBasura = escenario(3, 6, 8)
    // El mismo escenario, pero con un brick borrado y absurdo dentro.
    const sb = fakeSupabase({
      ...estructura,
      sesion: [
        sesNormal(100), sesNormal(101), sesNormal(102),
        sesBrick(200), sesBrick(201), sesBrick(202),
        { ...sesBrick(299), eliminada: true },
      ],
      tarea: [
        bloque(100, 1, 'Carrera', 'AEM', 6), bloque(101, 1, 'Carrera', 'AEM', 6), bloque(102, 1, 'Carrera', 'AEM', 6),
        bloque(200, 1, 'Ciclismo', 'AEL', 6), bloque(200, 2, 'Carrera', 'AEM', 8),
        bloque(201, 1, 'Ciclismo', 'AEL', 6), bloque(201, 2, 'Carrera', 'AEM', 8),
        bloque(202, 1, 'Ciclismo', 'AEL', 6), bloque(202, 2, 'Carrera', 'AEM', 8),
        bloque(299, 1, 'Ciclismo', 'AEL', 6), bloque(299, 2, 'Carrera', 'AEM', 10),
      ],
    })
    const conPapelera = (await calcularFactorBrick(sb, DEP))[clavePar('Ciclismo', 'Carrera')]
    const sinPapelera = (await calcularFactorBrick(conBasura, DEP))[clavePar('Ciclismo', 'Carrera')]
    expect(conPapelera.nBrick).toBe(3)
    expect(conPapelera.factor).toBe(sinPapelera.factor)
  })
  it('el PRIMER bloque de un brick nunca cuenta como post-transición', async () => {
    // la transición está tras el bloque 1, así que solo el bloque 2 es "post".
    // Si el primero contara, aparecería también el par Carrera→Ciclismo.
    const res = await calcularFactorBrick(escenario(3, 6, 8), DEP)
    expect(Object.keys(res)).toEqual([clavePar('Ciclismo', 'Carrera')])
  })

  it('las sesiones libres (sin microciclo) también entran en el aprendizaje', async () => {
    const libre = (id: number, extra: any) =>
      ({ id, estado: 'Realizada', id_deportista: DEP, ...extra })
    const sb = fakeSupabase({
      ...estructura,
      sesion: [
        libre(100, { disciplina: 'Carrera', transiciones: [] }),
        libre(101, { disciplina: 'Carrera', transiciones: [] }),
        libre(102, { disciplina: 'Carrera', transiciones: [] }),
        libre(200, { disciplina: 'Brick', transiciones: [{ despues_de: 1, segundos: 90 }] }),
        libre(201, { disciplina: 'Brick', transiciones: [{ despues_de: 1, segundos: 90 }] }),
        libre(202, { disciplina: 'Brick', transiciones: [{ despues_de: 1, segundos: 90 }] }),
      ],
      tarea: [
        bloque(100, 1, 'Carrera', 'AEM', 6), bloque(101, 1, 'Carrera', 'AEM', 6), bloque(102, 1, 'Carrera', 'AEM', 6),
        bloque(200, 1, 'Ciclismo', 'AEL', 6), bloque(200, 2, 'Carrera', 'AEM', 8),
        bloque(201, 1, 'Ciclismo', 'AEL', 6), bloque(201, 2, 'Carrera', 'AEM', 8),
        bloque(202, 1, 'Ciclismo', 'AEL', 6), bloque(202, 2, 'Carrera', 'AEM', 8),
      ],
    })
    const par = (await calcularFactorBrick(sb, DEP))[clavePar('Ciclismo', 'Carrera')]
    expect(par.aprendido).toBe(true)
    expect(par.nBrick).toBe(3)
  })

  it('no cuenta dos veces una sesión de microciclo (se consulta en dos queries distintas)', async () => {
    const par = (await calcularFactorBrick(escenario(3, 6, 8), DEP))[clavePar('Ciclismo', 'Carrera')]
    expect(par.nBrick).toBe(3)
  })
})

describe('factorPersonalizado — el resolver que consume la atribución', () => {
  it('devuelve el factor del atleta para un par conocido', async () => {
    const res = await calcularFactorBrick(escenario(3, 6, 8), DEP)
    expect(factorPersonalizado(res)('Ciclismo', 'Carrera')).toBeCloseTo(1.333, 2)
  })
  it('null para un par sin datos → el consumidor cae al factor de B1-04', async () => {
    const res = await calcularFactorBrick(escenario(3, 6, 8), DEP)
    expect(factorPersonalizado(res)('Natacion', 'Ciclismo')).toBeNull()
  })
  it('null sin resultado, sin reventar', () => {
    expect(factorPersonalizado(null)('Ciclismo', 'Carrera')).toBeNull()
  })
})
