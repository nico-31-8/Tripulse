// ============================================================
// El botón que se queda en «Guardando…» para siempre
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, con el parser de TypeScript y no con una expresión
// regular: hay que distinguir un `return` que sale de la función de uno que está
// dentro de un `.map(x => { … return … })`, y eso una regex no lo sabe.
//
// EL FALLO. Así estaba escrito «⟳ Rehacer desde el calendario» en el lienzo:
//
//     setReconstruyendo(true)
//     try {
//       if (!ses.length) { alert('No hay sesiones…'); return }   ← sale de la función
//       …
//     } catch (e) { alert(…) }
//     setReconstruyendo(false)                                   ← nunca se ejecuta
//
// Un `return` dentro del `try` se salta lo que hay DETRÁS del try. A un atleta
// sin sesiones en el calendario, el botón se quedaba desactivado poniendo
// «Rehaciendo…» hasta recargar la página, y el aviso solo lo decía una vez.
//
// LA REGLA. Si una función enciende una bandera, entra en un `try` del que se
// puede salir con `return`, y la apaga DETRÁS del try, hay que apagarla también
// en ese camino: o con `finally`, o llamando al `setX(false)` junto al `return`.
// Las dos valen, y este test acepta las dos.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const RAIZ = path.resolve(__dirname, '..')

/** Frontera de función: un `return` de dentro no sale de la de fuera. */
const esFuncion = (n: ts.Node) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) || ts.isMethodDeclaration(n)

/** `setLoading(false)`, `setGuardando(false)`… Devuelve el nombre, o null. */
function apagaBandera(n: ts.Node): string | null {
  const e = ts.isExpressionStatement(n) ? n.expression : n
  if (!ts.isCallExpression(e) || !ts.isIdentifier(e.expression)) return null
  if (!/^set[A-Z]/.test(e.expression.text)) return null
  if (e.arguments.length !== 1 || e.arguments[0].kind !== ts.SyntaxKind.FalseKeyword) return null
  return e.expression.text
}

/** ¿Hay en este nodo un `setX(false)` de esta bandera? (sin cruzar funciones) */
function apagaAqui(n: ts.Node, bandera: string): boolean {
  let si = false
  const mira = (x: ts.Node) => {
    if (si) return
    if (x !== n && esFuncion(x)) return
    if (apagaBandera(x) === bandera) { si = true; return }
    ts.forEachChild(x, mira)
  }
  mira(n)
  return si
}

/**
 * ¿Hay en el `try` un `return` que sale de la función SIN apagar la bandera?
 *
 * Se mira la sentencia que envuelve al `return` —el `if (…) { …; return }` del
 * que suele colgar— porque apagarla justo al lado es la otra forma correcta de
 * escribirlo, y la que ya usan cuatro sitios de la app.
 */
function escapaSinApagar(tryBlock: ts.Block, bandera: string): boolean {
  let escapa = false
  const mira = (n: ts.Node, envoltorio: ts.Node) => {
    if (escapa) return
    if (esFuncion(n)) return
    if (ts.isReturnStatement(n)) {
      if (!apagaAqui(envoltorio, bandera)) escapa = true
      return
    }
    // Una sentencia de bloque (if, for, switch…) pasa a ser el envoltorio de lo suyo.
    const siguiente = ts.isStatement(n) && !ts.isBlock(n) ? n : envoltorio
    ts.forEachChild(n, c => mira(c, siguiente))
  }
  ts.forEachChild(tryBlock, c => mira(c, c))
  return escapa
}

type Hallazgo = { sitio: string; bandera: string }

/** Busca el patrón en un fichero ya leído. Separado para poder probarlo. */
export function banderasQueSeQuedanEncendidas(texto: string, nombre = 'x.tsx'): Hallazgo[] {
  const src = ts.createSourceFile(nombre, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: Hallazgo[] = []
  const mira = (n: ts.Node) => {
    if (ts.isBlock(n) || ts.isSourceFile(n)) {
      const sts = n.statements
      for (let i = 0; i < sts.length - 1; i++) {
        const s = sts[i]
        if (!ts.isTryStatement(s)) continue
        if (s.finallyBlock) continue              // con `finally` está a salvo
        const bandera = apagaBandera(sts[i + 1])
        if (!bandera) continue
        if (!escapaSinApagar(s.tryBlock, bandera)) continue
        const { line } = src.getLineAndCharacterOfPosition(sts[i + 1].getStart())
        out.push({ sitio: nombre + ':' + (line + 1), bandera })
      }
    }
    ts.forEachChild(n, mira)
  }
  mira(src)
  return out
}

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

describe('la bandera que se queda encendida', () => {
  it('ningún botón se queda en «Guardando…» para siempre', () => {
    const culpables: string[] = []
    for (const f of ficheros()) {
      const rel = path.relative(RAIZ, f).split(path.sep).join('/')
      for (const h of banderasQueSeQuedanEncendidas(fs.readFileSync(f, 'utf8'), rel)) {
        culpables.push(h.sitio + ' (' + h.bandera + ')')
      }
    }
    expect(
      culpables,
      'Un `return` dentro del try se salta el apagado de detrás: pon `finally`, o apaga la bandera junto al return. En: ' + culpables.join(', '),
    ).toEqual([])
  })

  /* Sin esto, un test que no encuentra nada no distingue «está limpio» de «no sé
     mirar». Los tres casos son los que hay de verdad en la app. */
  it('el alambre está bien puesto', () => {
    const roto = `
      const f = async () => {
        setCargando(true)
        try {
          if (!hay) { avisar('nada'); return }
          await algo()
        } catch (e) { alert(e) }
        setCargando(false)
      }`
    expect(banderasQueSeQuedanEncendidas(roto)).toHaveLength(1)
    expect(banderasQueSeQuedanEncendidas(roto)[0].bandera).toBe('setCargando')

    const conFinally = roto.replace('} catch (e) { alert(e) }\n        setCargando(false)',
      '} catch (e) { alert(e) } finally { setCargando(false) }')
    expect(banderasQueSeQuedanEncendidas(conFinally)).toEqual([])

    const apagadaAlSalir = roto.replace(`avisar('nada'); return`, `avisar('nada'); setCargando(false); return`)
    expect(banderasQueSeQuedanEncendidas(apagadaAlSalir)).toEqual([])

    /* Y un `return` que NO sale de la función no cuenta. */
    const returnDeOtro = `
      const f = async () => {
        setCargando(true)
        try {
          const xs = ys.map(y => { return y * 2 })
          await algo(xs)
        } catch (e) { alert(e) }
        setCargando(false)
      }`
    expect(banderasQueSeQuedanEncendidas(returnDeOtro)).toEqual([])
  })
})
