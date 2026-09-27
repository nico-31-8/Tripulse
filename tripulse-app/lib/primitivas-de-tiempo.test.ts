// ============================================================
// Las primitivas de tiempo viven en un sitio cada una
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO. Cierra las dos que quedaban después del m:ss
// (ver mmss-un-solo-sitio.test.ts):
//
// 1. «QUÉ LUNES ES», escrito TRES veces. Una de ellas en
//    `components/PlanCadena` con **el mismo nombre y la misma firma** que la
//    buena, y otra en el panel del deportista con `Date` en vez de cadenas.
//    Las tres daban el mismo lunes —no había fallo vivo— y eso es justo lo que
//    las hacía peligrosas: el día que alguien cambie la regla en una (un cliente
//    que empiece la semana en domingo), las otras dos se quedan como estaban y
//    dos pantallas discrepan sin que nada falle. Ya pasó con `hoyISO`: un
//    impostor del mismo nombre, en UTC, que de madrugada devolvía ayer.
//
// 2. «2h05», escrito SEIS veces y con TRES comportamientos: cuatro sin el «00»
//    de las horas exactas («2h»), una con él («1h00», que es lo que alinea la
//    tabla de tiempos de /pacing) y otra con espacios («7 h 12», el sueño). Las
//    tres hacen falta; lo que no hacía falta era que cada una se escribiera
//    entera en su fichero.
//
// LA REGLA. El lunes lo decide `lib/fechas.lunesDe`. Las duraciones largas las
// escriben `horasMinutos` y `horasExactas` de `lib/medicion`.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { lunesDe, sumarDias, hoyISO } from './fechas'
import { horasMinutos, horasExactas } from './medicion'

describe('el lunes de una semana', () => {
  /* El domingo pertenece a la semana que ACABA. Es la trampa de JavaScript
     (domingo = día 0) y la razón de que esto viva en un solo sitio. */
  it('el domingo cae en la semana que acaba', () => {
    expect(lunesDe('2026-09-27')).toBe('2026-09-21')  // domingo
    expect(lunesDe('2026-09-21')).toBe('2026-09-21')  // lunes
    expect(lunesDe('2026-09-26')).toBe('2026-09-21')  // sábado
  })

  it('da lo mismo que daban las tres implementaciones que había', () => {
    /* Las dos que se han quitado, tal como estaban escritas. Si mañana alguien
       cambia la regla del catálogo, este test dirá que ya no coinciden — y
       entonces se borran estas dos, no se «arregla» el test. */
    const comoPlanCadena = (iso: string) => {
      const d = new Date(iso + 'T00:00:00Z')
      const dow = d.getUTCDay() || 7
      return sumarDias(iso, 1 - dow)
    }
    const comoPanelDeportista = (iso: string) => {
      const d = new Date(iso + 'T12:00:00')
      const off = (d.getDay() + 6) % 7
      const x = new Date(d)
      x.setDate(d.getDate() - off)
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
    }
    for (let i = 0; i < 400; i++) {
      const dia = sumarDias('2026-01-01', i)
      expect(comoPlanCadena(dia), dia).toBe(lunesDe(dia))
      expect(comoPanelDeportista(dia), dia).toBe(lunesDe(dia))
    }
  })

  it('y el lunes de hoy es un lunes', () => {
    const l = lunesDe(hoyISO())
    expect(lunesDe(l)).toBe(l)
  })
})

describe('las duraciones largas', () => {
  it('horasMinutos: «45′», «2h», «2h05»', () => {
    expect(horasMinutos(45)).toBe('45′')
    expect(horasMinutos(120)).toBe('2h')
    expect(horasMinutos(125)).toBe('2h05')
    expect(horasMinutos(59)).toBe('59′')
    expect(horasMinutos(60)).toBe('1h')
  })

  it('con 0 sale lo que diga la pantalla, que no es lo mismo en todas', () => {
    expect(horasMinutos(0)).toBe('0')
    expect(horasMinutos(0, '—')).toBe('—')
    expect(horasMinutos(null, '—')).toBe('—')
    expect(horasMinutos(-5)).toBe('0')
    expect(horasMinutos(NaN)).toBe('0')
  })

  it('horasExactas: las horas siempre, y el separador de cada sitio', () => {
    expect(horasExactas(65)).toBe('1h05')
    expect(horasExactas(60)).toBe('1h00')
    expect(horasExactas(45)).toBe('0h45')
    expect(horasExactas(432, ' h ')).toBe('7 h 12')
    expect(horasExactas(0, ' h ')).toBe('0 h 00')
  })

  it('y no se cuela un minuto de 60', () => {
    for (let m = 0; m <= 600; m++) {
      expect(horasMinutos(m), String(m)).not.toMatch(/h60/)
      expect(horasExactas(m), String(m)).not.toMatch(/60$/)
    }
  })
})

// ============================================================
// El guardián
// ============================================================

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/** Donde SÍ viven. */
const PUEDEN: Record<string, string> = {
  'lib/fechas.ts': 'Es la casa del calendario: aquí vive `lunesDe`.',
  'lib/medicion.ts': 'Es la casa de las duraciones: aquí viven `horasMinutos` y `horasExactas`.',
}

/**
 * Sacar el lunes a mano. Las tres formas que había de preguntarle a JavaScript
 * qué día de la semana es, corrigiendo que el domingo sea el 0.
 */
const LUNES_A_MANO = /get(?:UTC)?Day\(\)\s*(?:\|\|\s*7|\+\s*6)|1\s*-\s*(?:dow|diaSemana)/

/** Escribir «2h05» a mano: pegar los minutos a dos cifras detrás de una «h». */
const HORAS_A_MANO = /['"`]\s*h\s*['"`]\s*\+[^\n]{0,40}padStart\(\s*2\s*,\s*['"]0['"]\s*\)|\}\s*h\s*\$\{[^\n]{0,40}padStart\(\s*2\s*,\s*['"]0['"]\s*\)/

function ficheros(): string[] {
  const out: string[] = []
  const recorre = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) recorre(p); continue }
      if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  for (const c of CARPETAS) recorre(path.join(RAIZ, c))
  return out
}

describe('las primitivas de tiempo no se copian', () => {
  const lunes: string[] = []
  const horas: string[] = []

  for (const f of ficheros()) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/')
    const src = fs.readFileSync(f, 'utf8')
    if (LUNES_A_MANO.test(src) && !(rel in PUEDEN)) lunes.push(rel)
    if (HORAS_A_MANO.test(src) && !(rel in PUEDEN)) horas.push(rel)
  }

  it('nadie saca el lunes por su cuenta', () => {
    expect(lunes, 'Usa lunesDe de lib/fechas en: ' + lunes.join(', ')).toEqual([])
  })

  it('nadie escribe su propio «2h05»', () => {
    expect(horas, 'Usa horasMinutos / horasExactas de lib/medicion en: ' + horas.join(', ')).toEqual([])
  })

  it('el alambre está bien puesto', () => {
    /* Las tres formas de sacar el lunes que había. */
    expect(LUNES_A_MANO.test('const dow = d.getUTCDay() || 7')).toBe(true)
    expect(LUNES_A_MANO.test('const off = (d.getDay() + 6) % 7')).toBe(true)
    expect(LUNES_A_MANO.test('return sumarDias(iso, 1 - dow)')).toBe(true)
    /* Y las dos de escribir «2h05». */
    expect(HORAS_A_MANO.test("return h + 'h' + (m ? String(m).padStart(2, '0') : '')")).toBe(true)
    expect(HORAS_A_MANO.test('return `${h}h${String(m).padStart(2, "0")}`')).toBe(true)
    /* Lo que no es esto no salta: un m:ss (ese tiene su propio test) ni una fecha. */
    expect(HORAS_A_MANO.test("return min + ':' + String(s).padStart(2, '0')")).toBe(false)
    expect(LUNES_A_MANO.test('const dia = d.getDay()')).toBe(false)
  })
})
