// ============================================================
// Ninguna puerta de la app se cierra con una clave escrita en el código
// ============================================================
//
// LO QUE PASÓ (9 de octubre de 2026). La biblioteca de /fuerza escondía los
// botones de editar y borrar los tests comunes detrás de una clave de
// administrador escrita a mano en el JavaScript. Y detrás de esa clave no
// había nada más: la regla de la base dejaba a cualquier entrenador borrar
// cualquier test común. Con 12 cuentas, cualquiera podía quitarle a todos los
// demás los 26 tests de valoración.
//
// UNA CLAVE EN EL JAVASCRIPT NO ES UNA CERRADURA. La descarga el navegador de
// cualquiera que abra la página, y además el repositorio de GitHub es
// público. Pero aunque nadie la viera daría igual: cualquiera con sesión
// puede hablar con la base sin pasar por la pantalla. Quien decide qué se
// puede hacer es la BASE, con sus reglas (RLS), y la pantalla solo esconde
// botones para no enseñar lo que no va a funcionar.
//
// ESTE TEST LEE EL CÓDIGO y no deja volver a escribirlo así.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')

function ficheros(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      ficheros(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const CODIGO = ['app', 'lib', 'components'].flatMap(d => ficheros(path.join(RAIZ, d)))
const rel = (f: string) => path.relative(RAIZ, f).replace(/\\/g, '/')

describe('ninguna puerta se cierra con una clave en el código', () => {
  it('la clave vieja de /fuerza no vuelve', () => {
    const con = CODIGO.filter(f => fs.readFileSync(f, 'utf8').includes('fuerza25')).map(rel)
    expect(con).toEqual([])
  })

  /* Una constante de contraseña con su valor dentro, que es la forma de
     escribir una cerradura falsa.

     OJO CON «CLAVE»: en castellano también es la llave con la que se guarda
     algo en el navegador. La primera versión de este test cazó cuatro de esas
     —`CLAVE_PANEL = 'tp-panel-'`, `CLAVE = 'tp_pitido_tests'`…— que no
     protegen nada ni pretenden. Por eso «clave» solo cuenta junto a ADMIN, y
     lo que empiece por `tp_`/`tp-` (el prefijo de las llaves de esta app en
     el navegador) no entra. */
  it('no hay constantes de contraseña con su valor escrito', () => {
    const patron = /const\s+([A-Z_]*(PASSWORD|CONTRASE|SECRET)[A-Z_]*|[A-Z_]*CLAVE_?ADMIN[A-Z_]*|[A-Z_]*ADMIN_?CLAVE[A-Z_]*)\s*=\s*['"`](?!tp[_-])[^'"`]+['"`]/
    const malos = CODIGO.filter(f => patron.test(fs.readFileSync(f, 'utf8'))).map(rel)
    expect(malos, 'parece una contraseña escrita en el código: ' + malos.join(', ')).toEqual([])
  })

  /* El patrón tiene que seguir cazando LO QUE HABÍA. Si alguien lo afloja
     para silenciar otro aviso, esto salta. */
  it('el patrón caza la cerradura que hubo y deja pasar las llaves del navegador', () => {
    const patron = /const\s+([A-Z_]*(PASSWORD|CONTRASE|SECRET)[A-Z_]*|[A-Z_]*CLAVE_?ADMIN[A-Z_]*|[A-Z_]*ADMIN_?CLAVE[A-Z_]*)\s*=\s*['"`](?!tp[_-])[^'"`]+['"`]/
    expect(patron.test("const CLAVE_ADMIN = 'fuerza25'")).toBe(true)
    expect(patron.test("const ADMIN_PASSWORD = 'hola1234'")).toBe(true)
    expect(patron.test("const CLAVE_PANEL = 'tp-panel-'")).toBe(false)
    expect(patron.test("const CLAVE = 'tp_pitido_tests'")).toBe(false)
  })

  /* Un input de contraseña que se compara con algo fijo en la propia pantalla
     es exactamente lo que había. El de iniciar sesión no entra: ese se lo
     manda a Supabase y no lo compara nadie aquí. */
  it('ningún campo de contraseña se compara con un valor fijo', () => {
    const malos = CODIGO.filter(f => {
      const src = fs.readFileSync(f, 'utf8')
      return src.includes('type="password"') && /===\s*['"`][^'"`]{3,}['"`]/.test(src) &&
        /clave|password|contrase/i.test(src.slice(src.search(/===\s*['"`]/) - 80, src.search(/===\s*['"`]/)))
    }).map(rel)
    expect(malos).toEqual([])
  })

  it('y la biblioteca de /fuerza pregunta a la base quién es administrador', () => {
    const src = fs.readFileSync(path.join(RAIZ, 'app', 'fuerza', 'page.tsx'), 'utf8')
    expect(src).toContain("rpc('es_admin_plataforma'")
  })
})
