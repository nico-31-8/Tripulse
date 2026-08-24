import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/*
  ESTE TEST NO PRUEBA CÓDIGO: VIGILA UNA FORMA DE ESCRIBIRLO.

  El fallo aparece así:

      const d = new Date()          // instante LOCAL
      d.setDate(d.getDate() - 7)
      const dia = d.toISOString().split('T')[0]   // ...convertido a UTC

  `toISOString()` pasa el instante a UTC antes de recortar el día. En España
  (UTC+1/+2) eso significa que entre medianoche y las 02:00 el día que sale es
  el de AYER. No rompe nada, no avisa: solo devuelve el día equivocado unas
  horas al día, que es justo cuando nadie está mirando.

  Ya se barrió una vez y volvió: la primera búsqueda fue por
  `toISOString().split`, y la mitad estaba escrita `.slice(0, 10)`. La segunda
  vuelta encontró trece sitios más, entre ellos el panel del atleta y la fecha
  que se le dice al modelo de IA. Por eso ahora hay un test en vez de una
  búsqueda: para que la tercera no dependa de que a alguien se le ocurra mirar.

  Lo que SÍ vale, y por eso el test no lo marca:

    · `new Date().toISOString()` entero, sin recortar → es un INSTANTE
      (`updated_at`, `hora_inicio`). Ahí UTC es lo correcto.
    · `new Date(fecha + 'T12:00:00')` → el truco del mediodía: doce horas de
      margen a cada lado, así que ningún huso lo mueve de día.
    · `new Date(fecha + 'T00:00:00Z')` con `setUTCDate` → UTC de principio a fin.

  El único que se marca es el `new Date()` a secas, sin argumentos: el reloj de
  quien está delante. Para eso está `hoyISO()`, y para lo demás `aISO`,
  `sumarDias` y `lunesDe` de lib/fechas.
*/

const RAIZ = process.cwd()
const CARPETAS = ['app', 'lib', 'components']
const EXENTOS = ['lib/fechas.ts']
const DIA = /toISOString\(\)\s*\.\s*(split\('T'\)\[0\]|slice\(0,\s*10\))/
const RELOJ = /new Date\(\s*\)/
const VENTANA = 3

function ficheros(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      out.push(...ficheros(p))
    } else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) {
      out.push(p)
    }
  }
  return out
}

describe('un día de calendario no se saca del reloj', () => {
  it('nadie recorta un toISOString() de un new Date() a secas', () => {
    const culpables: string[] = []

    for (const carpeta of CARPETAS) {
      const dir = path.join(RAIZ, carpeta)
      if (!fs.existsSync(dir)) continue

      for (const fichero of ficheros(dir)) {
        const rel = path.relative(RAIZ, fichero).split(path.sep).join('/')
        if (EXENTOS.includes(rel)) continue

        const lineas = fs.readFileSync(fichero, 'utf8').split('\n')
        lineas.forEach((linea, i) => {
          if (!DIA.test(linea)) return
          // El `new Date()` puede estar en la misma línea o unas pocas arriba.
          const contexto = lineas.slice(Math.max(0, i - VENTANA), i + 1).join('\n')
          if (RELOJ.test(contexto)) culpables.push(`${rel}:${i + 1} → ${linea.trim()}`)
        })
      }
    }

    expect(culpables, 'Usa hoyISO() / aISO() / sumarDias() de lib/fechas:\n' + culpables.join('\n')).toEqual([])
  })

  it('el test se entera de verdad (control sobre un caso inventado)', () => {
    const malo = ['const d = new Date()', 'd.setDate(d.getDate() - 7)', "const x = d.toISOString().split('T')[0]"]
    const bueno = ["const d = new Date(f + 'T12:00:00')", "const x = d.toISOString().split('T')[0]"]

    const pilla = (ls: string[]) => ls.some((l, i) =>
      DIA.test(l) && RELOJ.test(ls.slice(Math.max(0, i - VENTANA), i + 1).join('\n')))

    expect(pilla(malo)).toBe(true)
    expect(pilla(bueno)).toBe(false)
  })
})
