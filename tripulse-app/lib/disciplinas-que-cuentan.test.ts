// ============================================================
// «¿Es fuerza?» se pregunta en un solo sitio
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, no lo ejecuta. Al añadir Híbrido (fuerza con
// cardio) había unas sesenta comprobaciones `=== 'Fuerza'` repartidas por la
// app decidiendo qué editor abrir, qué zonas ofrecer o cómo estimar la
// duración. Cada una que se quedara con la vieja abría una sesión híbrida como
// si fuera de carrera. Ninguna daba error: simplemente hacían lo que no era.
//
// LA REGLA. Para preguntar si algo se programa con la tabla de fuerza se usa
// `esDisciplinaDeFuerza` (lib/disciplinas). Una comparación nueva con 'Fuerza'
// hace saltar este test. Si de verdad tiene que ser solo Fuerza —y no
// Híbrido—, se añade el fichero abajo con el motivo.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/** Los ficheros donde comparar con 'Fuerza' es a propósito, y por qué. */
const PUEDEN: Record<string, string> = {
  'app/apuntar/page.tsx': 'El formulario del deportista: él no crea sesiones híbridas, las programa el entrenador.',
  'app/sesion/[id]/page.tsx': 'La recuperación, que SÍ vale para un híbrido: un HYROX de una hora vacía los depósitos.',
  'app/sesion/[id]/ejecutar/page.tsx': 'La recomendación de recuperación, que SÍ vale para un híbrido.',
  'app/volumen/page.tsx': 'Los minutos de fuerza, aparte: el híbrido tiene su propia columna para no inflar la fuerza.',
  'lib/nutricion.ts': 'Híbrido tiene su propia rama antes de la de fuerza.',
  'lib/editar-semana.ts': 'El planificador de semanas: trabaja con los cuatro deportes y no genera híbridos.',
  'lib/plan-colocacion.ts': 'El planificador de semanas: trabaja con los cuatro deportes y no genera híbridos.',
  'lib/plan-relleno.ts': 'El planificador de semanas: trabaja con los cuatro deportes y no genera híbridos.',
  'lib/plan-semana.ts': 'El planificador de semanas: trabaja con los cuatro deportes y no genera híbridos.',
  'lib/plan-verificador.ts': 'El planificador de semanas: trabaja con los cuatro deportes y no genera híbridos.',
  'lib/disciplinas.ts': 'Es donde vive la regla: solo lo nombra en un comentario.',
}

const COMPARA = /(?:===|!==)\s*'Fuerza'|'Fuerza'\s*(?:===|!==)|eq\(\s*'disciplina'\s*,\s*'Fuerza'\s*\)/

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

/** Fichero → las líneas que comparan con 'Fuerza'. */
function comparaciones(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of ficheros()) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/')
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (COMPARA.test(l)) (out[rel] ||= []).push((i + 1) + ': ' + l.trim())
    })
  }
  return out
}

describe('«¿es fuerza?» se pregunta con esDisciplinaDeFuerza', () => {
  const todas = comparaciones()

  it('ninguna comparación nueva con Fuerza fuera de las justificadas', () => {
    const nuevas = Object.entries(todas).filter(([f]) => !(f in PUEDEN))
    expect(nuevas, 'Usa esDisciplinaDeFuerza (lib/disciplinas), o justifica el fichero en PUEDEN:\n'
      + nuevas.map(([f, ls]) => f + '\n  ' + ls.join('\n  ')).join('\n')).toEqual([])
  })

  /* Una excepción que ya no hace falta es una puerta abierta: el próximo que
     escriba ahí `=== 'Fuerza'` pasaría sin que nadie lo mire. */
  it('la lista de excepciones no tiene ficheros de sobra', () => {
    const sobran = Object.keys(PUEDEN).filter(f => !todas[f])
    expect(sobran, 'Ya no comparan con Fuerza: quítalos de PUEDEN').toEqual([])
  })
})
