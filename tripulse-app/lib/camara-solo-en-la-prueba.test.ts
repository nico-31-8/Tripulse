// ============================================================
// La cámara solo se abre en la página de prueba, y solo mientras exista
// ============================================================
//
// POR QUÉ ESTE TEST. `next.config.ts` manda `Permissions-Policy: camera=()` en
// todas las rutas, y eso niega la cámara AL PROPIO DOCUMENTO, no solo a los
// iframes de terceros. Para probar el pulso por cámara hubo que abrir una
// excepción en una ruta: `/ppg-9315c6.html` (el trozo al azar del nombre es a
// propósito: no está enlazada desde ningún sitio y así no se adivina).
//
// LO QUE VIGILA, que son dos cosas distintas:
//
//   1. Que la excepción no se ensanche. Una cabecera que deja la cámara
//      abierta en toda la app no rompe nada, no sale en ningún log y no se ve
//      en ninguna pantalla: es el fallo silencioso de manual. Y hoy el candado
//      de la cámara es lo que compensa que `script-src` lleve 'unsafe-inline'
//      por la hidratación de Next.
//
//   2. Que no quede huérfana. Si mañana se borra `public/ppg-9315c6.html` y se
//      olvida la regla, queda un permiso abierto para una página que ya no
//      existe. Este test falla y dice que hay que quitarla.
//
// Si la prueba del pulso se descarta, se borran el fichero, la regla Y este
// test: los tres a la vez.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import config from '../next.config'

const RAIZ = path.resolve(__dirname, '..')
const PAGINA = 'ppg-9315c6.html'

/** Las rutas cuya Permissions-Policy NO cierra la cámara. */
async function rutasConCamara() {
  const reglas = (await config.headers!()) as Array<{ source: string; headers: Array<{ key: string; value: string }> }>
  return reglas
    .filter(r => r.headers.some(h =>
      h.key.toLowerCase() === 'permissions-policy' && !/camera=\(\)/.test(h.value)))
    .map(r => r.source)
}

describe('la cámara solo está abierta en la página de prueba', () => {
  it('exactamente una ruta la abre, y es esa', async () => {
    expect(await rutasConCamara()).toEqual(['/' + PAGINA])
  })

  it('la regla general sigue cerrándola', async () => {
    const reglas = (await config.headers!()) as Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    const general = reglas.find(r => r.source === '/:path*')
    expect(general, 'ha desaparecido la regla que cubre toda la app').toBeDefined()
    const pp = general!.headers.find(h => h.key === 'Permissions-Policy')
    expect(pp?.value).toContain('camera=()')
  })

  it('y nunca con comodín: solo el propio dominio', async () => {
    const reglas = (await config.headers!()) as Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    for (const r of reglas) {
      const pp = r.headers.find(h => h.key.toLowerCase() === 'permissions-policy')
      /* `camera=*` la abriría también a cualquier iframe incrustado. */
      if (pp) expect(pp.value, r.source).not.toMatch(/camera=\s*\*/)
    }
  })

  it('la excepción no sobrevive al borrado de la página', async () => {
    const abiertas = await rutasConCamara()
    if (!abiertas.length) return // ya se quitó todo: correcto
    expect(
      fs.existsSync(path.join(RAIZ, 'public', PAGINA)),
      'la regla de Permissions-Policy abre la cámara en /' + PAGINA + ', pero ese fichero ya no existe: quita la regla de next.config.ts',
    ).toBe(true)
  })

  it('la página de prueba no toca la app', () => {
    /* Es un fichero estático suelto: ni imports, ni Supabase, ni fetch. Si
       alguien empieza a cablearla, deja de ser desechable. */
    const src = fs.readFileSync(path.join(RAIZ, 'public', PAGINA), 'utf8')
    expect(src).not.toMatch(/\bimport\s|\bfrom\s+['"]|supabase|fetch\(/)
  })
})
