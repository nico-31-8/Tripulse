import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { leerReps, textoReps, repsParaCalcular, textoRepsTotal } from './repeticiones'

describe('leerReps', () => {
  it('un número suelto son repeticiones exactas', () => {
    expect(leerReps('10')).toEqual({ min: 10, max: null })
    expect(leerReps(10)).toEqual({ min: 10, max: null })
    expect(leerReps(' 10 ')).toEqual({ min: 10, max: null })
  })

  it('con guion, un rango', () => {
    expect(leerReps('8-10')).toEqual({ min: 8, max: 10 })
    expect(leerReps('8 - 10')).toEqual({ min: 8, max: 10 })
  })

  /* El guion largo sale solo al pegar desde Word o desde una web, y quien lo
     pega no tiene por qué saber que es otro carácter. */
  it('el guion largo vale igual que el corto', () => {
    expect(leerReps('8–10')).toEqual({ min: 8, max: 10 })
  })

  it('al revés se ordena, en vez de cantarlo', () => {
    expect(leerReps('10-8')).toEqual({ min: 8, max: 10 })
  })

  it('un rango de uno son repeticiones exactas', () => {
    expect(leerReps('8-8')).toEqual({ min: 8, max: null })
  })

  it('vacío es vacío, no un cero', () => {
    expect(leerReps('')).toBeNull()
    expect(leerReps('   ')).toBeNull()
    expect(leerReps(null)).toBeNull()
    expect(leerReps(undefined)).toBeNull()
  })

  /* Lo que se guardaba antes era `Number('8-10')`, o sea NaN, y NaN en una
     columna integer revienta la escritura. Nada de lo que salga de aquí puede
     ser NaN. */
  it('lo ilegible es null y nunca NaN', () => {
    for (const basura of ['abc', '8-', '-10', '8-10-12', '0', '-3', '8,10', 'ocho']) {
      const r = leerReps(basura)
      expect(r === null || (Number.isFinite(r.min) && (r.max === null || Number.isFinite(r.max))), basura).toBe(true)
    }
    expect(leerReps('abc')).toBeNull()
    expect(leerReps('0')).toBeNull()
  })

  it('un decimal se redondea, que media repetición no existe', () => {
    expect(leerReps('8.4')).toEqual({ min: 8, max: null })
  })
})

describe('textoReps', () => {
  it('escribe lo que se lee', () => {
    expect(textoReps(10, null)).toBe('10')
    expect(textoReps(8, 10)).toBe('8-10')
    expect(textoReps(10)).toBe('10')
  })

  it('un tope que no es tope no se enseña', () => {
    expect(textoReps(10, 10)).toBe('10')
    expect(textoReps(10, 8)).toBe('10')
  })

  it('sin mínimo no hay nada que decir', () => {
    expect(textoReps(null)).toBe('')
    expect(textoReps(0, 10)).toBe('')
  })

  /* La ida y la vuelta: lo que el entrenador escribe es lo que vuelve a ver. */
  it('leer y escribir son lo contrario', () => {
    for (const t of ['10', '8-10', '3', '12-15']) {
      const r = leerReps(t)!
      expect(textoReps(r.min, r.max)).toBe(t)
    }
  })
})

describe('repsParaCalcular', () => {
  /* Con repeticiones exactas tiene que dar EXACTAMENTE lo de siempre: ninguna
     sesión que ya existe puede cambiar de duración por este cambio. */
  it('con exactas, el número de siempre', () => {
    expect(repsParaCalcular(10, null)).toBe(10)
    expect(repsParaCalcular(10)).toBe(10)
    expect(repsParaCalcular(10, 10)).toBe(10)
  })

  it('con rango, el centro y no el mínimo', () => {
    expect(repsParaCalcular(8, 10)).toBe(9)
    expect(repsParaCalcular(8, 12)).toBe(10)
    /* Impar: se redondea, y hacia arriba, que es lo que suele hacer el atleta. */
    expect(repsParaCalcular(8, 11)).toBe(10)
  })

  it('sin nada, cero', () => {
    expect(repsParaCalcular(null)).toBe(0)
    expect(repsParaCalcular(0, 10)).toBe(0)
  })

  it('el valor para calcular cae siempre dentro del rango', () => {
    for (let min = 1; min <= 20; min++) {
      for (const max of [null, min, min + 1, min + 5, min + 12]) {
        const v = repsParaCalcular(min, max)
        expect(v).toBeGreaterThanOrEqual(min)
        expect(v).toBeLessThanOrEqual(max && max > min ? max : min)
      }
    }
  })
})

describe('textoRepsTotal', () => {
  it('multiplica las dos puntas', () => {
    expect(textoRepsTotal(8, 10, 3)).toBe('24-30')
    expect(textoRepsTotal(10, null, 3)).toBe('30')
    expect(textoRepsTotal(10, null, 1)).toBe('10')
  })

  it('sin mínimo no hay total', () => {
    expect(textoRepsTotal(null, null, 3)).toBe('')
  })
})

// ============================================================
// El alambre: el tope no se escribe a mano en ningún sitio
// ============================================================
//
// El mínimo y el tope son DOS columnas. Cada sitio que escriba uno sin el otro
// es un rango al revés esperando a pasar: prescribes «8-10», lo cambias a «12»,
// y si nadie toca el tope queda min=12 max=10. La base lo rechaza (hay un CHECK)
// y la sesión se queda sin guardar, con el entrenador mirando un error raro.
//
// Por eso las dos columnas se arman siempre juntas, en lib/repeticiones, y fuera
// de ahí el nombre del tope solo puede aparecer DECLARANDO UN TIPO.
describe('las columnas del tope viven en un solo sitio', () => {
  const RAIZ = path.resolve(__dirname, '..')
  /* Declarar el campo en un tipo es legítimo: no escribe nada. Sin anclar al
     principio de la línea, porque un cast en línea declara el campo a media
     frase (`f.ejercicio as { cantidad?: number | null; repeticiones_max?:
     number | null }`) y eso también es declarar. Lo que separa una cosa de la
     otra es lo que hay a la derecha: `number | null` es un tipo; `null`, `10` o
     `r?.max` son un valor. */
  const ES_UN_TIPO = /(?:repeticiones_max|encadenado_repeticiones_max|repeticiones_planteadas_max)\??\s*:\s*number\s*\|\s*null/
  const NOMBRES = /repeticiones_max|encadenado_repeticiones_max|repeticiones_planteadas_max/

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

  it('nadie escribe el tope fuera de lib/repeticiones', () => {
    const culpables: string[] = []
    for (const f of ficheros()) {
      const rel = path.relative(RAIZ, f).split(path.sep).join('/')
      if (rel === 'lib/repeticiones.ts') continue
      fs.readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
        if (!NOMBRES.test(linea)) return
        if (ES_UN_TIPO.test(linea)) return
        culpables.push(rel + ':' + (i + 1))
      })
    }
    expect(
      culpables,
      'El mínimo y el tope se arman juntos (columnasEjercicio / columnasEncadenado / columnasPrescripcion) y se leen juntos (repsDeEjercicio / repsDePrescripcion). En: ' + culpables.join(', '),
    ).toEqual([])
  })

  it('el alambre está bien puesto', () => {
    /* Declarar, sí. */
    expect(ES_UN_TIPO.test('  repeticiones_max?: number | null')).toBe(true)
    expect(ES_UN_TIPO.test('  repeticiones_planteadas_max: number | null')).toBe(true)
    /* Escribir o leer, no. */
    expect(ES_UN_TIPO.test("  await sb.insert({ repeticiones_max: 10 })")).toBe(false)
    expect(ES_UN_TIPO.test('  const t = ej.repeticiones_max ?? null')).toBe(false)
    /* Y el cast en línea, que es el caso que hay de verdad en tareas-tabla. */
    expect(ES_UN_TIPO.test('  const ej = f.ejercicio as { cantidad?: number | null; repeticiones_max?: number | null }')).toBe(true)
    expect(ES_UN_TIPO.test("  repeticiones_max: r?.max ?? null,")).toBe(false)
    /* Y que la biblioteca sí las tiene, por si alguien la vacía. */
    const lib = fs.readFileSync(path.join(RAIZ, 'lib/repeticiones.ts'), 'utf8')
    for (const col of ['repeticiones_max', 'encadenado_repeticiones_max', 'repeticiones_planteadas_max']) {
      expect(lib.includes(col), 'lib/repeticiones ya no arma ' + col).toBe(true)
    }
  })
})
