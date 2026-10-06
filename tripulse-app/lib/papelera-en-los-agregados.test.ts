// ============================================================
// Quien suma sesiones de un atleta, quita la papelera
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO.
//
// LO QUE PASÓ (6 de octubre de 2026). El panel «Información de la semana» salió
// con una consulta de sesiones sin filtrar `eliminada`. A un atleta que solo
// hace carrera y fuerza le aparecieron cuatro sesiones de natación y cuatro de
// bici: eran planes viejos que el entrenador ya había tirado a la papelera.
//
// NO FALLÓ NADA. La pantalla enseñó números más grandes y más creíbles, que es
// la peor forma de equivocarse: 19 sesiones donde había 6, la semana inflada, y
// ni un error en ningún sitio. Lo cazó el entrenador preguntando «¿esto no te
// enseña la semana? Si esa semana no tiene esas sesiones, ¿por qué las
// muestra?».
//
// EL CONVENIO YA EXISTÍA —`vivas()` y `FILTRO_VIVAS` en lib/papelera— y lo
// cumplía TODO el resto de la app. Esto no vigila una familia de fallos: vigila
// que no vuelva a aparecer el primero.
//
// QUÉ ENTRA Y QUÉ NO. Solo las consultas que SUMAN las sesiones de alguien:
// `from('sesion')` + `select` + filtrando por `id_deportista`. Abrir UNA sesión
// por su id no entra, y es correcto que no entre — si abres una que está en la
// papelera, quieres verla.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')

/** Todos los .ts/.tsx de lib y app, menos los tests. */
function ficheros(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      ficheros(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

/**
 * Los trozos de consulta que arrancan en `from('sesion')`.
 *
 * Se corta en el siguiente `from(` o en un `await`, que es donde empieza otra
 * cosa. Mirando el fichero entero daba falsos positivos de los buenos: un
 * `id_deportista` que filtraba OTRA tabla contaba como si filtrara sesiones, y
 * un fichero que solo INSERTA sesiones salía marcado por nombrar la columna.
 */
function consultasDeSesion(src: string): string[] {
  const out: string[] = []
  let i = src.indexOf("from('sesion')")
  while (i >= 0) {
    const resto = src.slice(i + 10, i + 700)
    const corte = Math.min(
      ...[resto.indexOf('from('), resto.indexOf('await ')].filter(n => n > 0).concat([resto.length]),
    )
    out.push(resto.slice(0, corte))
    i = src.indexOf("from('sesion')", i + 1)
  }
  return out
}

const CUMPLE = /vivas\s*\(|FILTRO_VIVAS|eliminada|soloPapelera/

describe('la papelera no se cuela en los agregados', () => {
  const malos: string[] = []

  for (const f of ficheros(path.join(RAIZ, 'lib')).concat(ficheros(path.join(RAIZ, 'app')))) {
    const src = fs.readFileSync(f, 'utf8')
    if (!src.includes("from('sesion')")) continue

    const agrega = consultasDeSesion(src).some(q =>
      q.includes('.select(') && /(eq|in)\(['"]id_deportista['"]/.test(q))

    if (agrega && !CUMPLE.test(src)) malos.push(path.relative(RAIZ, f).replace(/\\/g, '/'))
  }

  it('todo el que suma las sesiones de un atleta pasa por lib/papelera', () => {
    expect(malos, 'les falta vivas() o FILTRO_VIVAS: ' + malos.join(', ')).toEqual([])
  })

  it('y el convenio sigue estando donde se dijo', () => {
    /* Si alguien mueve o renombra esto, el test de arriba empezaría a dar por
       buenas consultas que ya no filtran nada. */
    const src = fs.readFileSync(path.join(RAIZ, 'lib', 'papelera.ts'), 'utf8')
    expect(src).toContain('export function vivas')
    expect(src).toContain('export const FILTRO_VIVAS')
    /* Las dos mitades: sin `is.null` desaparecería el histórico anterior a que
       existiera la columna, que es el fallo contrario y peor. */
    expect(src).toContain('eliminada.is.null')
    expect(src).toContain('eliminada.eq.false')
  })
})
