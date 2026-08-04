'use client'
// ============================================================
// Barra inferior del deportista (solo móvil)
// ============================================================
// El entrenador puede vivir en el ordenador; el deportista solo tiene el móvil:
// abre la app de camino a la piscina o entre series. Con los ocho accesos en una
// rejilla al final del panel había que bajar hasta abajo para cambiar de sitio.
//
// Ocho no caben en una barra: caben cuatro y un «Más». Los cuatro son los de
// diario; detrás de «Más» va lo que se abre de vez en cuando.
//
// Se monta una sola vez en el layout y decide ella sola si aparece: solo para el
// rol deportista, solo en móvil y fuera de las pantallas donde estorbaría.
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/* Donde la barra estorba: públicas, y el modo entreno, que se usa a pantalla
   completa y con el móvil en la mano entre series. */
const RUTAS_SIN_BARRA = ['/', '/login', '/registro', '/privacidad', '/terminos', '/nueva-password', '/reset-password']
const esModoEntreno = (p: string) => /^\/sesion\/[^/]+\/ejecutar/.test(p)

export default function NavDeportista() {
  const pathname = usePathname()
  const router = useRouter()
  const [esDeportista, setEsDeportista] = useState(false)
  const [depId, setDepId] = useState<number | null>(null)
  const [masAbierto, setMasAbierto] = useState(false)

  useEffect(() => {
    let vivo = true
    const comprobar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (vivo) setEsDeportista(false); return }
      const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
      if (!vivo) return
      const lo_es = p?.rol === 'deportista'
      setEsDeportista(lo_es)
      if (lo_es) {
        const { data: d } = await supabase.from('deportista').select('id').eq('id_usuario', user.id).maybeSingle()
        if (vivo) setDepId(d?.id ?? null)
      }
    }
    comprobar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { if (!s && vivo) setEsDeportista(false) })
    return () => { vivo = false; subscription.unsubscribe() }
  }, [])

  const visible = esDeportista && !RUTAS_SIN_BARRA.includes(pathname) && !esModoEntreno(pathname)

  /* La barra es fixed: sin este hueco, el último elemento de cada pantalla queda
     debajo y no se puede pulsar. Se pone en el body para no tener que tocar las
     ocho páginas una a una (la regla vive en globals.css). */
  useEffect(() => {
    document.body.classList.toggle('con-nav-deportista', visible)
    return () => document.body.classList.remove('con-nav-deportista')
  }, [visible])

  /* Al cambiar de pantalla, el desplegable se cierra solo. */
  useEffect(() => { setMasAbierto(false) }, [pathname])

  if (!visible) return null

  // Wellness y Chat necesitan el id del deportista. Mientras no ha cargado, su
  // destino es null y el botón se ve apagado: antes caían a /dashboard-deportista,
  // lo que daba DOS entradas con el mismo href (clave duplicada en React) y dejaba
  // dos pestañas encendidas a la vez.
  const principales = [
    { icono: '🏠', texto: 'Hoy', href: '/dashboard-deportista' as string | null },
    { icono: '📅', texto: 'Sesiones', href: '/mis-sesiones' as string | null },
    { icono: '💚', texto: 'Wellness', href: depId ? '/wellness/' + depId : null },
    { icono: '📊', texto: 'Análisis', href: '/mis-analisis' as string | null },
  ]
  const secundarias = [
    { icono: '🏋️', texto: 'Mis tests', href: '/mis-tests' as string | null },
    { icono: '💬', texto: 'Chat', href: depId ? '/chat/' + depId : null },
    { icono: '🤝', texto: 'Comunidad', href: '/comunidad' as string | null },
    { icono: '🗓', texto: 'Disponibilidad', href: '/disponibilidad' as string | null },
    { icono: '👤', texto: 'Mi perfil', href: '/perfil' as string | null },
  ]

  const activa = (href: string | null) => !!href && (pathname === href || pathname.startsWith(href + '/'))
  const enSecundarias = secundarias.some(s => activa(s.href))

  const ir = (href: string | null) => { if (!href) return; setMasAbierto(false); router.push(href) }

  return (
    <>
      {masAbierto && (
        <>
          <div onClick={() => setMasAbierto(false)} className="fixed inset-0 bg-black/50 z-40 sm:hidden" />
          <div className="fixed bottom-[62px] left-0 right-0 z-50 sm:hidden bg-gray-900 border-t border-gray-800 px-3 py-2.5 flex flex-col gap-1 rounded-t-2xl">
            {secundarias.map(s => (
              /* La clave va por el texto, que es único siempre; el href puede ser
                 null mientras carga el id del deportista. */
              <button key={s.texto} onClick={() => ir(s.href)} disabled={!s.href}
                className={'flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] text-left transition disabled:opacity-40 ' +
                  (activa(s.href) ? 'bg-orange-500/15 text-orange-400' : 'text-gray-300 hover:bg-gray-800')}>
                <span className="text-lg leading-none">{s.icono}</span>{s.texto}
              </button>
            ))}
          </div>
        </>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-gray-900 border-t border-gray-800 grid grid-cols-5">
        {principales.map(p => (
          <button key={p.texto} onClick={() => ir(p.href)} disabled={!p.href}
            className={'flex flex-col items-center justify-center gap-[3px] min-h-[62px] px-1 pb-1 text-[9.5px] transition disabled:opacity-40 ' +
              (activa(p.href) ? 'text-orange-400' : 'text-gray-500 hover:text-gray-300')}>
            <span className="text-[18px] leading-none">{p.icono}</span>{p.texto}
          </button>
        ))}
        <button onClick={() => setMasAbierto(v => !v)}
          className={'flex flex-col items-center justify-center gap-[3px] min-h-[62px] px-1 pb-1 text-[9.5px] transition ' +
            (masAbierto || enSecundarias ? 'text-orange-400' : 'text-gray-500 hover:text-gray-300')}>
          <span className="text-[18px] leading-none">⋯</span>Más
        </button>
      </nav>
    </>
  )
}
