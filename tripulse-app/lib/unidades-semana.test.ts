// ============================================================
// Lo que se puede hacer con una unidad, y por qué no
// ============================================================
//
// Estas frases las enseñan DOS: la pantalla mientras arrastras o seleccionas
// —para pintar en rojo el sitio que no puede recibirlo y apagar el botón que no
// va a funcionar— y el manejador al soltar o al pulsar, como red. Estos tests
// atan las dos puntas: si discreparan, el botón saldría encendido con el aviso
// puesto, o al revés.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { porQueNoSeFusiona, sePuedeFusionar, porQueNoCabeEnUnDia } from './unidades-semana'
import { porQueNoVuelveAlPool, zonasQueVuelven } from './devolver-al-pool'
import type { ChipZona } from './chips'

const chip = (disciplina: string, extra: Partial<ChipZona> = {}): ChipZona =>
  ({ id: 'c' + Math.random().toString(36).slice(2), semana: 0, disciplina, zona: 'AER', ...extra })

describe('porQueNoSeFusiona', () => {
  it('con menos de dos no dice nada: el botón ya está apagado', () => {
    expect(porQueNoSeFusiona([])).toBeNull()
    expect(porQueNoSeFusiona([chip('Ciclismo')])).toBeNull()
  })

  it('dos de la misma disciplina se fusionan', () => {
    expect(porQueNoSeFusiona([chip('Ciclismo'), chip('Ciclismo')])).toBeNull()
  })

  it('de disciplinas distintas, no', () => {
    expect(porQueNoSeFusiona([chip('Ciclismo'), chip('Carrera')])).toMatch(/misma disciplina/)
  })

  /* EL ORDEN, que es el arreglo. Antes se miraba primero la disciplina, así que
     un brick con un ciclismo te decía «misma disciplina» y te mandaba a buscar
     otro brick — que tampoco habría valido. */
  it('con un brick dentro, el motivo es el BRICK y no la disciplina', () => {
    const falta = porQueNoSeFusiona([chip('Brick'), chip('Ciclismo')]) || ''
    expect(falta).toMatch(/brick ya es una unidad/i)
    expect(falta).not.toMatch(/misma disciplina/)
    /* Y dos bricks tampoco, aunque compartan disciplina. */
    expect(porQueNoSeFusiona([chip('Brick'), chip('Brick')])).toMatch(/brick ya es una unidad/i)
  })

  it('sePuedeFusionar dice exactamente lo mismo', () => {
    const casos: ChipZona[][] = [
      [],
      [chip('Ciclismo')],
      [chip('Ciclismo'), chip('Ciclismo')],
      [chip('Ciclismo'), chip('Carrera')],
      [chip('Brick'), chip('Ciclismo')],
      [chip('Brick'), chip('Brick')],
    ]
    for (const c of casos) {
      expect(sePuedeFusionar(c)).toBe(c.length >= 2 && porQueNoSeFusiona(c) === null)
    }
  })
})

describe('porQueNoCabeEnUnDia', () => {
  const brickLleno = () => chip('Brick', { brick: { bloques: [{ disciplina: 'Ciclismo', minutos: 40, zona: 'AER' }], transiciones: [] } as any })

  it('una unidad normal cabe, sola o agrupada', () => {
    expect(porQueNoCabeEnUnDia([chip('Ciclismo')])).toBeNull()
    expect(porQueNoCabeEnUnDia([chip('Ciclismo'), chip('Ciclismo')])).toBeNull()
  })

  it('un brick con sus bloques cabe, pero solo', () => {
    expect(porQueNoCabeEnUnDia([brickLleno()])).toBeNull()
    expect(porQueNoCabeEnUnDia([brickLleno(), chip('Ciclismo')])).toMatch(/se arrastra solo/)
  })

  /* El aviso de antes rechazaba con «un brick se arrastra solo» también al chip
     que venía SIN bloques —que iba solo—, o sea que mandaba a deshacer un grupo
     que no existía. */
  it('un brick sin bloques habla de los BLOQUES, no del grupo', () => {
    const falta = porQueNoCabeEnUnDia([chip('Brick')]) || ''
    expect(falta).toMatch(/no lleva bloques/)
    expect(falta).not.toMatch(/se arrastra solo/)
  })
})

describe('porQueNoVuelveAlPool', () => {
  const pool = { weekIndex: 0, borradorId: 7 }
  const ses = (extra: any = {}) => ({ id: 1, disciplina: 'Ciclismo', estado: 'Planificada', zona_resistencia: 'AER', ...extra })
  const enlazado = [chip('Ciclismo', { id_sesion: 1, hecho: true })]

  it('una sesión normal vuelve', () => {
    expect(porQueNoVuelveAlPool(ses(), pool, enlazado)).toBeNull()
  })

  /* Estas dos son las que evitan destruir trabajo: sin fila de borrador,
     `persistirZonas` no escribe, así que la sesión se iría a la papelera y la
     unidad no volvería a ninguna parte. */
  it('sin macrociclo no hay pool al que volver', () => {
    expect(porQueNoVuelveAlPool(ses(), { weekIndex: null, borradorId: 7 }, enlazado)).toMatch(/no tiene macrociclo/)
  })
  it('sin lienzo de periodización, tampoco', () => {
    expect(porQueNoVuelveAlPool(ses(), { weekIndex: 0, borradorId: null }, enlazado)).toMatch(/lienzo de periodizaci/i)
  })

  it('una realizada no se des-planifica', () => {
    expect(porQueNoVuelveAlPool(ses({ estado: 'Realizada' }), pool, enlazado)).toMatch(/ya está realizada/)
  })

  it('un brick sin enlace volvería roto, así que no vuelve', () => {
    expect(porQueNoVuelveAlPool(ses({ disciplina: 'Brick' }), pool, [])).toMatch(/no salió del pool/)
    /* Con enlace sí: sus bloques están en el chip. */
    expect(porQueNoVuelveAlPool(ses({ disciplina: 'Brick' }), pool, [chip('Brick', { id_sesion: 1, hecho: true })])).toBeNull()
  })

  it('sin zonas no hay unidad que devolver', () => {
    expect(porQueNoVuelveAlPool(ses({ zona_resistencia: null }), pool, enlazado)).toMatch(/no tiene ninguna zona/)
  })

  /* La cuenta de las zonas la miran los dos: el aviso, para decir que sí, y la
     vuelta, para armar los chips. Con dos cuentas distintas el aviso diría que
     se puede y la vuelta crearía un chip en blanco. */
  it('la zona que mira el aviso es la misma con la que vuelve', () => {
    const conBloques = ses({ _bloques: [{ zona: 'UMB' }, { zona: 'AER' }] })
    expect(zonasQueVuelven(conBloques)).toEqual(['UMB', 'AER'])
    expect(porQueNoVuelveAlPool(conBloques, pool, enlazado)).toBeNull()

    const pelada = ses({ zona_resistencia: null, zona_fuerza: null })
    expect(zonasQueVuelven(pelada)).toEqual([])
    expect(porQueNoVuelveAlPool(pelada, pool, enlazado)).not.toBeNull()
  })
})

// ============================================================
// El alambre: cada frase se escribe UNA vez
// ============================================================
//
// Las ocho salían de un `alert()` escrito a mano dentro del manejador. Ahora las
// decide una función y las enseñan dos sitios —el rótulo de la tarjeta mientras
// arrastras y el aviso al soltar—. Si alguien vuelve a escribir una a mano, los
// dos sitios dejan de decir lo mismo y nadie se entera hasta que lo ve un
// entrenador.
describe('las frases de «no se puede» viven en un solo sitio', () => {
  const RAIZ = path.resolve(__dirname, '..')
  const DUENO: Record<string, string> = {
    'lib/unidades-semana.ts': 'porQueNoSeFusiona / porQueNoCabeEnUnDia',
    'lib/devolver-al-pool.ts': 'porQueNoVuelveAlPool',
  }
  /* Trozos LARGOS a propósito. Los cortos («no tiene macrociclo», «lienzo de
     periodización») salen por toda la app en comentarios y en otros mensajes
     legítimos —el de tanda 9 al crear la semana, el `confirm` de lo que se
     pierde—, así que cada uno es el pedazo que solo tiene SU frase. */
  const FRASES = [
    'brick ya es una unidad',
    'Solo se pueden fusionar zonas',
    'se arrastra solo',
    'no lleva bloques dentro',
    'no cae en ningún plan y no hay pool',
    'que es donde vive el pool',
    'ya está realizada. Si quieres quitarla',
    'no hay bloques que devolver',
    'no hay unidad que devolver al pool',
  ]

  function ficheros(): string[] {
    const out: string[] = []
    const recorre = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) recorre(p); continue }
        if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
      }
    }
    for (const c of ['app', 'lib', 'components']) recorre(path.join(RAIZ, c))
    return out
  }

  it('nadie las vuelve a escribir a mano', () => {
    const copias: string[] = []
    for (const f of ficheros()) {
      const rel = path.relative(RAIZ, f).split(path.sep).join('/')
      if (rel in DUENO) continue
      const texto = fs.readFileSync(f, 'utf8')
      for (const frase of FRASES) if (texto.includes(frase)) copias.push(rel + ' → «' + frase + '»')
    }
    expect(
      copias,
      'Estas frases las decide una función; pídesela en vez de escribirla: ' + copias.join(', '),
    ).toEqual([])
  })

  it('el alambre está bien puesto', () => {
    /* Sin esto, un test que no encuentra nada no distingue «está limpio» de «no
       sé mirar»: se comprueba que las frases existen donde deben. */
    for (const [fichero] of Object.entries(DUENO)) {
      const texto = fs.readFileSync(path.join(RAIZ, fichero), 'utf8')
      expect(FRASES.some(f => texto.includes(f)), fichero + ' no tiene ninguna de las frases').toBe(true)
    }
    const total = Object.keys(DUENO)
      .map(f => fs.readFileSync(path.join(RAIZ, f), 'utf8'))
      .join('\n')
    for (const frase of FRASES) {
      expect(total.includes(frase), 'nadie dice «' + frase + '»: ¿se ha reescrito?').toBe(true)
    }
  })
})
