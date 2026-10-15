import { describe, it, expect, vi, beforeEach } from 'vitest'

// El módulo llama a supabase en cuanto se importa (onAuthStateChange), así que el
// mock tiene que estar antes. `getSession` cuenta cuántas veces la llaman de verdad:
// eso es justo lo que este módulo existe para reducir. `getUser` está para comprobar
// que NO se llama: es un viaje al servidor al abrir cada pantalla.
const getSession = vi.fn()
const getUser = vi.fn()
const single = vi.fn()
const maybeSingle = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      getUser: () => getUser(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => single(),
          maybeSingle: () => maybeSingle(),
        }),
      }),
    }),
  },
}))

const { usuarioActual, perfilActual, deportistaActual, limpiarSesion } = await import('./sesion')

const USUARIO = { id: 'u-1' }
const conSesion = (user: any, error: any = null) => ({ data: { session: user ? { user } : null }, error })

beforeEach(() => {
  limpiarSesion()
  getSession.mockReset()
  getUser.mockReset()
  single.mockReset()
  maybeSingle.mockReset()
  getSession.mockResolvedValue(conSesion(USUARIO))
  single.mockResolvedValue({ data: { id: 'u-1', rol: 'deportista' }, error: null })
  maybeSingle.mockResolvedValue({ data: { id: 14 }, error: null })
})

describe('usuarioActual — el motivo de que este módulo exista', () => {
  /* Lee la sesión guardada: preguntar al servidor era un viaje entero antes de
     que la pantalla pudiera pedir nada. La RLS valida el token en cada consulta. */
  it('no pregunta al servidor quién eres', async () => {
    expect(await usuarioActual()).toEqual(USUARIO)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('cuatro llamadas SIMULTÁNEAS hacen una sola consulta (es la pelea por el candado)', async () => {
    const [a, b, c, d] = await Promise.all([usuarioActual(), usuarioActual(), usuarioActual(), usuarioActual()])
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(a).toEqual(USUARIO)
    expect(b).toBe(a); expect(c).toBe(a); expect(d).toBe(a)
  })

  it('las llamadas posteriores leen lo guardado, sin volver a la red', async () => {
    await usuarioActual()
    await usuarioActual()
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('sin sesión devuelve null y NO se vuelve a preguntar', async () => {
    getSession.mockResolvedValue(conSesion(null))
    expect(await usuarioActual()).toBeNull()
    expect(await usuarioActual()).toBeNull()
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('un fallo de red NO se guarda: el siguiente reintenta en vez de dar por deslogueado', async () => {
    getSession.mockResolvedValueOnce(conSesion(null, new Error('red')))
    expect(await usuarioActual()).toBeNull()
    expect(await usuarioActual()).toEqual(USUARIO)
    expect(getSession).toHaveBeenCalledTimes(2)
  })
})

describe('perfilActual / deportistaActual', () => {
  it('comparten el mismo usuario en vez de pedirlo cada uno', async () => {
    await Promise.all([perfilActual(), deportistaActual()])
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('el perfil tampoco se pide dos veces', async () => {
    await Promise.all([perfilActual(), perfilActual(), perfilActual()])
    expect(single).toHaveBeenCalledTimes(1)
  })

  it('si el usuario no es fiable, el perfil no cachea el null', async () => {
    getSession.mockResolvedValueOnce(conSesion(null, new Error('red')))
    expect(await perfilActual()).toBeNull()
    expect(await perfilActual()).toEqual({ id: 'u-1', rol: 'deportista' })
  })

  it('sin sesión de verdad, perfil y deportista son null', async () => {
    getSession.mockResolvedValue(conSesion(null))
    expect(await perfilActual()).toBeNull()
    expect(await deportistaActual()).toBeNull()
    expect(single).not.toHaveBeenCalled()
  })

  it('limpiarSesion obliga a volver a preguntarlo todo (entrar o salir)', async () => {
    await usuarioActual()
    limpiarSesion()
    await usuarioActual()
    expect(getSession).toHaveBeenCalledTimes(2)
  })
})
