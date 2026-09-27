// ============================================================
// Una pantalla que pide datos comprueba quién entra
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO. No hay `middleware.ts` ni guardia en el layout: en
// TRIPULSE cada página se protege sola. Eso funciona hasta que alguien escribe
// una página nueva y se olvida, y no se nota, porque la RLS hace su trabajo y la
// pantalla simplemente sale vacía.
//
// LO QUE HABÍA. `/sesion/[id]/ejecutar` (20 consultas) y `/zonas/[id]` (4) no
// comprobaban nada. **No era una fuga** —las consultas van con la clave pública
// y la RLS no devuelve lo que no es tuyo— pero con la sesión caducada la
// pantalla se quedaba **cargando para siempre y en blanco**, en vez de mandar al
// login. Y `/asistente` pintaba el copiloto entero para luego no contestar,
// porque el candado de verdad está en `/api/asistente`.
//
// LA REGLA. Una página que consulta la base pide la sesión: `usuarioActual()` +
// `router.push('/login')` si no hay (las del deportista y las compartidas), o
// `useRequireEntrenador()` (las del entrenador). Si de verdad tiene que ser
// pública, se apunta abajo con el motivo.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')

/** Las que consultan la base SIN pedir sesión, y por qué pueden. */
const PUEDEN: Record<string, string> = {
  'app/login/page.tsx': 'Es la puerta: pedir sesión aquí sería pedirla para poder pedirla.',
  'app/registro/page.tsx': 'Se crea la cuenta; todavía no hay quien entre.',
  /* Las de recuperar la contraseña NO están aquí: no consultan la base, solo
     hablan con `auth`, así que este test no las mira. */
  'app/invitacion/[token]/page.tsx': 'El TOKEN es la credencial: el entrenador manda el enlace a alguien que aún no tiene cuenta.',
}

function paginas(): string[] {
  const out: string[] = []
  const recorre = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (!e.name.startsWith('.')) recorre(p); continue }
      if (e.name === 'page.tsx') out.push(p)
    }
  }
  recorre(path.join(RAIZ, 'app'))
  return out
}

/** Pide datos a la base. */
const CONSULTA = /supabase\s*\n?\s*\.from\(|supabase\.from\(|\.rpc\(/
/** Comprueba quién entra. */
const COMPRUEBA = /useRequireEntrenador|usuarioActual|auth\.getSession|auth\.getUser/

describe('las puertas de la app', () => {
  const sinGuardia: string[] = []
  const permitidosSinUsar = new Set(Object.keys(PUEDEN))

  for (const f of paginas()) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/')
    const src = fs.readFileSync(f, 'utf8')
    if (!CONSULTA.test(src)) continue
    if (COMPRUEBA.test(src)) { permitidosSinUsar.delete(rel); continue }
    permitidosSinUsar.delete(rel)
    if (rel in PUEDEN) continue
    sinGuardia.push(rel)
  }

  it('la que pide datos comprueba la sesión', () => {
    expect(
      sinGuardia,
      'Falta usuarioActual() o useRequireEntrenador() en: ' + sinGuardia.join(', '),
    ).toEqual([])
  })

  it('la lista de públicas no se queda con fantasmas', () => {
    /* Si una de estas deja de consultar —o le ponen guardia—, sobra el permiso.
       Un permiso de sobra es una puerta abierta para el siguiente. */
    expect([...permitidosSinUsar]).toEqual([])
  })

  it('el alambre está bien puesto', () => {
    expect(CONSULTA.test("const { data } = await supabase.from('sesion').select('*')")).toBe(true)
    expect(CONSULTA.test('await supabase.rpc(\'ultima_ejecucion_fuerza\', { p: 1 })')).toBe(true)
    expect(COMPRUEBA.test('  useRequireEntrenador()')).toBe(true)
    expect(COMPRUEBA.test('const user = await usuarioActual()')).toBe(true)
    expect(COMPRUEBA.test('const { data: { session } } = await supabase.auth.getSession()')).toBe(true)
    /* Una página de solo contenido no consulta y no hace falta mirarla. */
    expect(CONSULTA.test('export default function Terminos() { return <main>…</main> }')).toBe(false)
  })
})

// ============================================================
// Y la otra puerta: las rutas de API
// ============================================================
// Esto lo añadió el REBARRIDO de la tanda. Buscando «quién comprueba la sesión»
// con una lista de nombres —`getUser`, `getSession`, `usuarioActual`— salieron
// CINCO rutas de reloj con cero coincidencias, y parecía un agujero grande.
// No lo era: todas usan `quienLlama(req)`, que pide un Bearer, lo valida con
// `auth.getUser(token)` y devuelve un cliente atado a ESE usuario, así que la RLS
// se aplica como él. La consulta era estrecha, no el código.
//
// Lo que sí hacía falta era este test: una ruta de API nueva que se olvide de
// `quienLlama` no la caza nada más, porque el `service_role` de una ruta se salta
// la RLS por definición.
describe('las rutas de API comprueban quién llama', () => {
  const rutas: string[] = []
  const recorre = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { recorre(p); continue }
      if (e.name === 'route.ts') rutas.push(p)
    }
  }
  recorre(path.join(RAIZ, 'app', 'api'))

  /** Las que se identifican de otra manera, y cuál. */
  const OTRA_PUERTA: Record<string, string> = {
    'app/api/relojes/polar/callback/route.ts': 'La vuelta del proveedor llega SIN sesión: quién es sale del `state` aleatorio de un solo uso que se generó al pulsar Conectar.',
    'app/api/relojes/coros/callback/route.ts': 'Lo mismo que la de Polar: el `state` de un solo uso.',
  }

  const COMPRUEBA_API = /quienLlama|auth\.getUser|auth\.getSession/

  it('ninguna ruta atiende a cualquiera', () => {
    const sinPuerta = rutas
      .map(f => path.relative(RAIZ, f).split(path.sep).join('/'))
      .filter(rel => !(rel in OTRA_PUERTA))
      .filter(rel => !COMPRUEBA_API.test(fs.readFileSync(path.join(RAIZ, rel), 'utf8')))
    expect(sinPuerta, 'Usa quienLlama(req) en: ' + sinPuerta.join(', ')).toEqual([])
  })

  it('y las que se identifican por el `state` lo comprueban de verdad', () => {
    for (const rel of Object.keys(OTRA_PUERTA)) {
      const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8')
      /* El `state` tiene que VIAJAR a la base, que es quien lo gasta: mirarlo
         aquí y creerse lo que dice sería no comprobar nada. */
      expect(src, rel).toMatch(/searchParams\.get\(\s*['"]state['"]\s*\)/)
      expect(src, rel).toMatch(/reloj_(?:canjear|guardar|token)|rpc\(/)
    }
  })
})
