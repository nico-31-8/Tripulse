'use client'
// ============================================================
// El tutorial guiado: quién lo ve, cuándo arranca y qué recuerda
// ============================================================
// Envuelve toda la app (app/layout.tsx). Solo hace algo para el ENTRENADOR:
// - Carga una vez lo que ya ha visto (lib/tutorial-progreso).
// - Al entrar en una pantalla con recorrido, lo arranca si toca
//   (lib/tutorial: solo a cuentas nuevas o a quien aceptó la tarjeta, y solo
//   la primera vez). En el Panel, la bienvenida va antes.
// - El botón ? (en el menú) repite el de la pantalla, o abre la lista.
// - Mientras un paso tapa la app, la app queda inerte (ni clic ni teclado).
// Lo que se pinta está en Recorrido; la lista, en ListaTutoriales.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { perfilActual, usuarioActual } from '@/lib/sesion'
import { getAtletaActivo } from '@/lib/atletaActivo'
import {
  ZONAS, pasosDeRecorrido, zonaAlEntrar, zonaDeRuta, mostrarOferta as hayQueOfrecer, esCuentaNueva,
  rutaDeZona, progresoVacio, type Progreso, type PasoTutorial, type ZonaTutorial,
} from '@/lib/tutorial'
import { cargarProgreso, guardarMarca, quitarMarca, CLAVE_OFERTA, CLAVE_PAUSA } from '@/lib/tutorial-progreso'
import Recorrido, { type FinDelRecorrido } from './Recorrido'
import ListaTutoriales from './ListaTutoriales'

interface Api {
  /** Es un entrenador y el tutorial está montado. */
  activo: boolean
  progreso: Progreso
  /** La tarjeta del Panel para quien ya usaba la app. */
  ofrecer: boolean
  /** El botón ?: el recorrido de esta pantalla o, si no tiene, la lista. */
  ayuda: () => void
  abrirLista: () => void
  aceptarOferta: () => void
  rechazarOferta: () => void
  /** Ir a la pantalla de una zona y enseñarla (camino = con salida a la siguiente). */
  irA: (zona: ZonaTutorial, camino: boolean) => void
}

const Ctx = createContext<Api | null>(null)

/** El tutorial, o null fuera del proveedor. */
export function useTutorial(): Api | null {
  return useContext(Ctx)
}

interface EnCurso { zona: ZonaTutorial; pasos: PasoTutorial[]; numInfo: number }

export default function TutorialProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [esEntrenador, setEsEntrenador] = useState(false)
  const [idUsuario, setIdUsuario] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [esNuevo, setEsNuevo] = useState(false)
  const [progreso, setProgreso] = useState<Progreso>(() => progresoVacio(false))
  const [cargado, setCargado] = useState(false)
  const [enCurso, setEnCurso] = useState<EnCurso | null>(null)
  const [modal, setModal] = useState(false)
  const [lista, setLista] = useState(false)
  const [aviso, setAviso] = useState('')
  /* Una zona pedida desde la lista que espera a que cargue su pantalla. */
  const pendiente = useRef<{ zona: ZonaTutorial; camino: boolean } | null>(null)
  const rutaDelRecorrido = useRef<string | null>(null)

  /* Quién es y qué ha visto. */
  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      try {
        const user = await usuarioActual()
        if (!user) { if (vivo) { setEsEntrenador(false); setCargado(false) } return }
        const p = await perfilActual()
        if (!vivo || p?.rol !== 'entrenador') { if (vivo) setEsEntrenador(false); return }
        const prog = await cargarProgreso(supabase, user.id)
        if (!vivo) return
        setIdUsuario(user.id)
        setNombre((p?.nombre || '').trim().split(/\s+/)[0] || '')
        setEsNuevo(esCuentaNueva(user.created_at))
        setProgreso(prog)
        setEsEntrenador(true)
        setCargado(true)
      } catch {
        /* Sin poder saber quién es, el tutorial no se monta: no molesta a nadie. */
      }
    }
    cargar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, s) => {
      if (!s) { setEsEntrenador(false); setCargado(false); setEnCurso(null); return }
      if (evento === 'SIGNED_IN') cargar()
    })
    return () => { vivo = false; subscription.unsubscribe() }
  }, [])

  const avisar = useCallback((t: string) => {
    setAviso(t)
    setTimeout(() => setAviso(a => (a === t ? '' : a)), 3600)
  }, [])

  const marcar = useCallback((clave: string, estado: 'visto' | 'saltado' | 'pausado' | 'aceptada' | 'rechazada') => {
    setProgreso(p => {
      const n: Progreso = { ...p, vistos: new Set(p.vistos), saltados: new Set(p.saltados) }
      if (clave === CLAVE_PAUSA) n.pausado = estado === 'pausado'
      else if (clave === CLAVE_OFERTA) n.oferta = estado === 'aceptada' || estado === 'rechazada' ? estado : null
      else if (estado === 'visto') { n.vistos.add(clave); n.saltados.delete(clave) }
      else if (estado === 'saltado' && !n.vistos.has(clave)) n.saltados.add(clave)
      return n
    })
    if (idUsuario) guardarMarca(supabase, idUsuario, clave, estado).then(err => { if (err) console.warn('Tutorial: no se guardó', clave, err) })
  }, [idUsuario])

  const quitarPausa = useCallback(() => {
    setProgreso(p => ({ ...p, pausado: false }))
    if (idUsuario) quitarMarca(supabase, idUsuario, CLAVE_PAUSA)
  }, [idUsuario])

  const empezar = useCallback((zona: ZonaTutorial, camino: boolean) => {
    setLista(false)
    setEnCurso(prev => {
      if (prev) return prev
      const pasos = pasosDeRecorrido(zona, { camino, vistos: progreso.vistos })
      rutaDelRecorrido.current = window.location.pathname
      return { zona, pasos, numInfo: ZONAS[zona].pasos.length }
    })
  }, [progreso.vistos])

  /* Al entrar en una pantalla: lo pedido desde la lista, o lo que toque solo. */
  useEffect(() => {
    if (!cargado || !esEntrenador) return
    /* Cambiar de pantalla a mitad de un recorrido lo cierra sin marcarlo: saldrá otra vez. */
    if (enCurso) {
      if (rutaDelRecorrido.current && rutaDelRecorrido.current !== pathname) setEnCurso(null)
      return
    }
    const p = pendiente.current
    const zonaAqui = zonaDeRuta(pathname)
    let zona: ZonaTutorial | null = null
    let camino = true
    if (p && (zonaAqui === p.zona || (p.zona === 'bienvenida' && zonaAqui === 'panel'))) {
      zona = p.zona; camino = p.camino
      pendiente.current = null
    } else {
      zona = zonaAlEntrar(pathname, progreso, esNuevo)
    }
    if (!zona) return
    const z = zona, c = camino
    const t = setTimeout(() => empezar(z, c), 700)
    return () => clearTimeout(t)
  }, [pathname, cargado, esEntrenador, enCurso, progreso, esNuevo, empezar])

  const alTerminar = useCallback((r: FinDelRecorrido) => {
    const actual = enCurso
    setEnCurso(null)
    setModal(false)
    if (!actual) return
    const zona = actual.zona
    if (r === 'visto' || r === 'salida') {
      marcar(zona, 'visto')
      if (r === 'salida') avisar('Cuando quieras seguir, está en 🎓 Tutoriales, abajo del menú.')
      const despues = ZONAS[zona].despues
      if (r === 'visto' && despues && !progreso.vistos.has(despues)) {
        setTimeout(() => empezar(despues, true), 350)
      }
    } else if (r === 'pausa') {
      marcar(zona, 'saltado')
      marcar(CLAVE_PAUSA, 'pausado')
      avisar('Vale. Cuando quieras, el botón ? te enseña la pantalla en la que estés.')
    } else {
      marcar(zona, 'saltado')
      avisar('Puedes repetirlo cuando quieras con el botón ?.')
    }
  }, [enCurso, marcar, avisar, progreso.vistos, empezar])

  const irA = useCallback((zona: ZonaTutorial, camino: boolean) => {
    setLista(false)
    if (camino) quitarPausa()
    const ruta = rutaDeZona(zona, getAtletaActivo())
    if (!ruta) return
    if (zonaDeRuta(pathname) === zona || (zona === 'bienvenida' && pathname === '/dashboard')) {
      empezar(zona, camino)
      return
    }
    pendiente.current = { zona, camino }
    router.push(ruta)
  }, [pathname, router, empezar, quitarPausa])

  const ayuda = useCallback(() => {
    if (enCurso) return
    const zona = zonaDeRuta(pathname)
    if (zona) empezar(zona, false)
    else setLista(true)
  }, [enCurso, pathname, empezar])

  const aceptarOferta = useCallback(() => {
    marcar(CLAVE_OFERTA, 'aceptada')
    quitarPausa()
    pendiente.current = null
    if (zonaDeRuta(pathname) === 'panel') empezar('bienvenida', true)
    else irA('bienvenida', true)
  }, [marcar, quitarPausa, pathname, empezar, irA])

  const rechazarOferta = useCallback(() => {
    marcar(CLAVE_OFERTA, 'rechazada')
    marcar(CLAVE_PAUSA, 'pausado')
    avisar('Vale. Lo tienes cuando quieras en 🎓 Tutoriales, abajo del menú.')
  }, [marcar, avisar])

  const api = useMemo<Api>(() => ({
    activo: esEntrenador && cargado,
    progreso,
    ofrecer: esEntrenador && cargado && hayQueOfrecer(progreso, esNuevo),
    ayuda,
    abrirLista: () => setLista(true),
    aceptarOferta,
    rechazarOferta,
    irA,
  }), [esEntrenador, cargado, progreso, esNuevo, ayuda, aceptarOferta, rechazarOferta, irA])

  return (
    <Ctx.Provider value={api}>
      {/* `display: contents` no cambia nada de la maquetación: solo deja volver inerte la app. */}
      <div style={{ display: 'contents' }} inert={modal || undefined}>
        {children}
      </div>
      {enCurso && (
        <Recorrido key={enCurso.zona + ':' + enCurso.pasos.length} zona={enCurso.zona} pasos={enCurso.pasos}
          numInfo={enCurso.numInfo} nombre={nombre} onFin={alTerminar} onModal={setModal} />
      )}
      {lista && <ListaTutoriales progreso={progreso} onCerrar={() => setLista(false)} onVer={irA} />}
      {aviso && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 max-w-[min(440px,calc(100vw-32px))] bg-gray-800 border border-gray-700 text-white text-[13px] leading-snug px-4 py-2.5 rounded-xl shadow-2xl shadow-black/60"
          style={{ zIndex: 950 }}>
          {aviso}
        </div>
      )}
    </Ctx.Provider>
  )
}
