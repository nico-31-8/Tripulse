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
  ZONAS, pasosDeRecorrido, zonaDeRuta, mostrarOferta as hayQueOfrecer, esCuentaNueva,
  rutaDeZona, progresoVacio, queArrancaAlEntrar, pendienteAlSeguir, esAvanzada, opcionesDeAyuda,
  type Progreso, type PasoTutorial, type ZonaTutorial, type Pendiente,
} from '@/lib/tutorial'
import { cargarProgreso, guardarMarca, quitarMarca, CLAVE_OFERTA, CLAVE_PAUSA } from '@/lib/tutorial-progreso'
import { claveConsejo, consejoDeLaVisita, consejosActivos, type Consejo, type ZonaConConsejos } from '@/lib/consejos'
import Recorrido, { type FinDelRecorrido } from './Recorrido'
import ListaTutoriales from './ListaTutoriales'
import EleccionDeAyuda from './EleccionDeAyuda'
import ConsejoEnPantalla from './Consejo'
import { buscarAncla, elementoDeConsejo } from './posicion'

/** Lo que una pantalla le pasa al tutorial: sus consejos de ahora (lib/consejos). */
export interface PantallaConConsejos {
  zona: ZonaConConsejos
  lista: Consejo[]
  /** Sus acciones propias (`accion: { hacer }`), por referencia: siempre las de su último pintado. */
  acciones?: { current: Record<string, () => void> | undefined }
}

/** Lo que tarda en salir un consejo: que la pantalla haya terminado de cargar y de moverse. */
const ESPERA_CONSEJO_MS = 1200

/* Las avanzadas se quedan con los pasos que están en pantalla. Abiertas desde
   la lista, la página aún se está pintando: se espera a que lo que hay a la
   vista deje de cambiar (como mucho, lo que espera el primer paso). */
const ESTABLE_MS = 500
const ESPERA_AVANZADA_MS = 3000

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
  /** Si salen consejos: las pantallas solo los calculan entonces. */
  consejosActivos: boolean
  ponerConsejos: (p: PantallaConConsejos) => void
  quitarConsejos: (zona: ZonaConConsejos) => void
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
  /* El botón ? de una pantalla con dos recorridos (la sesión): cuál quiere. */
  const [eleccion, setEleccion] = useState<ZonaTutorial[] | null>(null)
  const esperaAvanzada = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aviso, setAviso] = useState('')
  /* Una zona pedida (desde la lista, o siguiendo el camino) que espera a que cargue su pantalla. */
  const pendiente = useRef<Pendiente | null>(null)
  const rutaDelRecorrido = useRef<string | null>(null)
  /* Los consejos de la pantalla que se ve, y lo que lleva enseñado en esta
     visita: uno por visita, y ninguno más tras contestarlo. */
  const [pantalla, setPantalla] = useState<PantallaConConsejos | null>(null)
  const [visita, setVisita] = useState<{ ruta: string; mostrado: string | null; cerrada: boolean }>({ ruta: '', mostrado: null, cerrada: false })

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
      if (clave.startsWith('c:')) {
        if (estado === 'visto' || estado === 'saltado') {
          n.consejos = new Map(p.consejos)
          n.consejos.set(clave, { estado, fecha: new Date().toISOString() })
        }
        return n
      }
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

  const empezarAvanzada = useCallback((zona: ZonaTutorial, esperar: boolean) => {
    if (esperaAvanzada.current) clearTimeout(esperaAvanzada.current)
    const ruta = window.location.pathname
    const todos = ZONAS[zona].pasos
    const t0 = Date.now()
    let vistos = -1, desde = t0
    const intentar = () => {
      esperaAvanzada.current = null
      if (window.location.pathname !== ruta) return
      const presentes = todos.filter(p => !p.ancla || buscarAncla(p.ancla))
      if (presentes.length !== vistos) { vistos = presentes.length; desde = Date.now() }
      const listo = presentes.length > 0 && (!esperar || Date.now() - desde >= ESTABLE_MS)
      if (!listo && Date.now() - t0 < ESPERA_AVANZADA_MS) { esperaAvanzada.current = setTimeout(intentar, 120); return }
      const pasos = presentes.length ? presentes : todos
      setEnCurso(prev => {
        if (prev) return prev
        rutaDelRecorrido.current = ruta
        return { zona, pasos, numInfo: pasos.length }
      })
    }
    intentar()
  }, [])
  useEffect(() => () => { if (esperaAvanzada.current) clearTimeout(esperaAvanzada.current) }, [])

  const empezar = useCallback((zona: ZonaTutorial, camino: boolean, esperar = false) => {
    setLista(false)
    setEleccion(null)
    if (esAvanzada(zona)) { empezarAvanzada(zona, esperar); return }
    setEnCurso(prev => {
      if (prev) return prev
      const pasos = pasosDeRecorrido(zona, { camino, vistos: progreso.vistos })
      rutaDelRecorrido.current = window.location.pathname
      return { zona, pasos, numInfo: ZONAS[zona].pasos.length }
    })
  }, [progreso.vistos, empezarAvanzada])

  /* Al entrar en una pantalla: lo pedido desde la lista, o lo que toque solo. */
  useEffect(() => {
    if (!cargado || !esEntrenador) return
    /* Cambiar de pantalla a mitad de un recorrido lo cierra sin marcarlo: saldrá otra vez. */
    if (enCurso) {
      if (rutaDelRecorrido.current && rutaDelRecorrido.current !== pathname) setEnCurso(null)
      return
    }
    const r = queArrancaAlEntrar(pathname, pendiente.current, progreso, esNuevo)
    if (!r.zona) { pendiente.current = r.pendiente; return }
    /* Lo pedido se gasta al arrancar, no antes: si la pantalla se repinta en
       estos 700 ms, sigue pedido. */
    const z = r.zona, c = r.camino, resto = r.pendiente
    const t = setTimeout(() => { pendiente.current = resto; empezar(z, c, true) }, 700)
    return () => clearTimeout(t)
  }, [pathname, cargado, esEntrenador, enCurso, progreso, esNuevo, empezar])

  const alTerminar = useCallback((r: FinDelRecorrido) => {
    const actual = enCurso
    setEnCurso(null)
    setModal(false)
    if (!actual) return
    const zona = actual.zona
    if (r === 'visto' || r === 'sigue' || r === 'salida') {
      marcar(zona, 'visto')
      if (r === 'sigue') pendiente.current = pendienteAlSeguir(zona)
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
    const opciones = opcionesDeAyuda(pathname)
    if (opciones.length === 0) setLista(true)
    else if (opciones.length === 1) empezar(opciones[0], false)
    else setEleccion(opciones)
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

  /* ---- Los consejos ---- */

  const conConsejos = esEntrenador && cargado && consejosActivos(progreso, esNuevo)
  const ponerConsejos = useCallback((p: PantallaConConsejos) => setPantalla(p), [])
  const quitarConsejos = useCallback((zona: ZonaConConsejos) => setPantalla(p => (p && p.zona === zona ? null : p)), [])

  /* La visita es la de esta pantalla: al cambiar de ruta empieza otra. */
  const visitaAqui = visita.ruta === pathname ? visita : { ruta: pathname, mostrado: null, cerrada: false }
  /* «Ahora» cambia cuando cambia lo que se mira: basta para los días de reposo. */
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setTimeout(() => setAhora(Date.now()), 0)
    return () => clearTimeout(t)
  }, [pathname, pantalla])

  /* Nunca a la vez que un recorrido o que la lista de tutoriales. */
  const candidato = useMemo(() => (!conConsejos || enCurso || lista ? null
    : eleccion ? null
    : consejoDeLaVisita(pantalla, zonaDeRuta(pathname), { mostrado: visitaAqui.mostrado, cerrada: visitaAqui.cerrada }, progreso.consejos, new Date(ahora))),
  [conConsejos, enCurso, lista, eleccion, pantalla, visitaAqui.cerrada, visitaAqui.mostrado, pathname, progreso.consejos, ahora])
  const claveCandidato = candidato ? claveConsejo(candidato) : null

  /* No sale de golpe: espera a que la pantalla acabe de cargar y de moverse. */
  useEffect(() => {
    if (!claveCandidato || visitaAqui.mostrado === claveCandidato) return
    const ruta = pathname
    const t = setTimeout(() => setVisita(v => ({
      ruta, mostrado: claveCandidato, cerrada: v.ruta === ruta ? v.cerrada : false,
    })), ESPERA_CONSEJO_MS)
    return () => clearTimeout(t)
  }, [claveCandidato, visitaAqui.mostrado, pathname])
  const consejoVisible = candidato && visitaAqui.mostrado === claveCandidato ? candidato : null

  const cerrarVisita = useCallback(() => {
    const ruta = window.location.pathname
    setVisita(v => ({ ruta, mostrado: v.ruta === ruta ? v.mostrado : null, cerrada: true }))
  }, [])

  const consejoAhoraNo = useCallback((c: Consejo) => {
    marcar(claveConsejo(c), 'saltado')
    cerrarVisita()
    avisar('Vale. Si sigue igual, te lo recordamos en unos días.')
  }, [marcar, cerrarVisita, avisar])

  /* Las acciones se leen al pulsar: las de la pantalla tal como está en ese momento. */
  const pantallaRef = useRef(pantalla)
  useEffect(() => { pantallaRef.current = pantalla })
  const consejoHacer = useCallback((c: Consejo) => {
    marcar(claveConsejo(c), 'visto')
    cerrarVisita()
    const a = c.accion
    if ('ir' in a) { router.push(a.ir); return }
    if ('hacer' in a) { pantallaRef.current?.acciones?.current?.[a.hacer]?.(); return }
    const el = elementoDeConsejo('pulsar' in a ? a.pulsar : a.mirar)
    if (!el) return
    if ('pulsar' in a) el.click()
    else el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [marcar, cerrarVisita, router])

  const api = useMemo<Api>(() => ({
    activo: esEntrenador && cargado,
    progreso,
    ofrecer: esEntrenador && cargado && hayQueOfrecer(progreso, esNuevo),
    ayuda,
    abrirLista: () => setLista(true),
    aceptarOferta,
    rechazarOferta,
    irA,
    consejosActivos: conConsejos,
    ponerConsejos,
    quitarConsejos,
  }), [esEntrenador, cargado, progreso, esNuevo, ayuda, aceptarOferta, rechazarOferta, irA, conConsejos, ponerConsejos, quitarConsejos])

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
      {eleccion && <EleccionDeAyuda opciones={eleccion} onElegir={z => empezar(z, false)} onCerrar={() => setEleccion(null)} />}
      {consejoVisible && (
        <ConsejoEnPantalla key={claveCandidato} consejo={consejoVisible}
          onAhoraNo={() => consejoAhoraNo(consejoVisible)} onHacer={() => consejoHacer(consejoVisible)} />
      )}
      {aviso && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 max-w-[min(440px,calc(100vw-32px))] bg-gray-800 border border-gray-700 text-white text-[13px] leading-snug px-4 py-2.5 rounded-xl shadow-2xl shadow-black/60"
          style={{ zIndex: 950 }}>
          {aviso}
        </div>
      )}
    </Ctx.Provider>
  )
}
