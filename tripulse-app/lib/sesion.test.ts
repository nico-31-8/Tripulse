import { describe, it, expect, vi, beforeEach } from 'vitest'

// El módulo llama a supabase en cuanto se importa (onAuthStateChange), así que el
// mock tiene que estar antes. `getUser` cuenta cuántas veces la llaman de verdad:
// eso es justo lo que este módulo existe para reducir.
const getUser = vi.fn()
const single = vi.fn()
const maybeSingle = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
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

beforeEach(() => {
  limpiarSesion()
  getUser.mockReset()
  single.mockReset()
  maybeSingle.mockReset()
  getUser.mockResolvedValue({ data: { user: USUARIO }, error: null })
  single.mockResolvedValue({ data: { id: 'u-1', rol: 'deportista' }, error: null })
  maybeSingle.mockResolvedValue({ data: { id: 14 }, error: null })
})

describe('usuarioActual — el motivo de que este módulo exista', () => {
  it('cuatro llamadas SIMULTÁNEAS hacen una sola consulta (es la pelea por el candado)', async () => {
    const [a, b, c, d] = await Promise.all([usuarioActual(), usuarioActual(), usuarioActual(), usuarioActual()])
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(a).toEqual(USUARIO)
    expect(b).toBe(a); expect(c).toBe(a); expect(d).toBe(a)
  })

  it('las llamadas posteriores leen lo guardado, sin volver a la red', async () => {
    await usuarioActual()
    await usuarioActual()
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('sin sesión devuelve null y NO se vuelve a preguntar', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await usuarioActual()).toBeNull()
    expect(await usuarioActual()).toBeNull()
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('un fallo de red NO se guarda: el siguiente reintenta en vez de dar por deslogueado', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('red') })
    expect(await usuarioActual()).toBeNull()
    expect(await usuarioActual()).toEqual(USUARIO)
    expect(getUser).toHaveBeenCalledTimes(2)
  })
})

describe('perfilActual / deportistaActual', () => {
  it('comparten el mismo usuario en vez de pedirlo cada uno', async () => {
    await Promise.all([perfilActual(), deportistaActual()])
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('el perfil tampoco se pide dos veces', async () => {
    await Promise.all([perfilActual(), perfilActual(), perfilActual()])
    expect(single).toHaveBeenCalledTimes(1)
  })

  it('si el usuario no es fiable, el perfil no cachea el null', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('red') })
    expect(await perfilActual()).toBeNull()
    expect(await perfilActual()).toEqual({ id: 'u-1', rol: 'deportista' })
  })

  it('sin sesión de verdad, perfil y deportista son null', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await perfilActual()).toBeNull()
    expect(await deportistaActual()).toBeNull()
    expect(single).not.toHaveBeenCalled()
  })

  it('limpiarSesion obliga a volver a preguntarlo todo (entrar o salir)', async () => {
    await usuarioActual()
    limpiarSesion()
    await usuarioActual()
    expect(getUser).toHaveBeenCalledTimes(2)
  })
})
