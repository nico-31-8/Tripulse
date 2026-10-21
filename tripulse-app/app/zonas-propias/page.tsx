'use client'
// ============================================================
// TRIPULSE — Zonas propias del entrenador: sus clasificaciones
// ============================================================
//
// UNA CLASIFICACIÓN ES UNA FORMA DE PARTIR UN DEPORTE. La del laboratorio
// (VT1, VT2, VO2máx), la de pista, la de técnica… Cada una dice de qué hitos
// tira y tiene sus zonas, y cada zona tiene DOS límites que eligen su hito y
// su %: una zona puede ir del VT1 + 15 % al VT2 − 5 %.
//
// LAS DE LA APP SIGUEN AHÍ Y NO SE TOCAN: estas se suman. En la ficha de sesión
// se elige el deporte, luego la clasificación (o las de la app) y luego la zona.
//
// ABAJO, LA ESCALERA: cómo le queda la clasificación a un deportista concreto,
// con sus números. Es donde se ve que a alguien con el VT1 y el VT2 muy juntos
// una zona le queda al revés, o que dos se pisan. La app avisa y no arregla
// nada sola.
//
// LA LÓGICA NO ESTÁ AQUÍ: está en lib/zonas-entrenador (validar, ida y vuelta
// con la base), lib/hitos (qué hitos hay y cuánto valen) y
// lib/clasificaciones-zonas (la escalera y los avisos), con sus tests.
import { useRouter } from 'next/navigation'
import { useState, useEffect, useReducer } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { cargarReferencias } from '@/lib/referencia-zona'
import {
  fichaDe, motivoNoUsable, motivoClasificacion, leerClasificaciones, paraGuardar, clasificacionParaGuardar,
  zonaSiguiente, CLASIFICACION_NUEVA, COLORES_ZONA, DEPORTES_ZONA,
  type Clasificacion, type Limite, type ZonaEntrenador,
} from '@/lib/zonas-entrenador'
import { hitosDisponibles, buscarHito, mismaUnidad, leerIdApp, leerIdPropia, type HitoDisponible, type TestsApp } from '@/lib/hitos'
import { evaluar, explicarLimites, ejeParaAjustar, type Evaluacion } from '@/lib/clasificaciones-zonas'
import { testDeFila, unidadCanonica, type TestConMediciones } from '@/lib/referencia-propia'
import { sociosDeDireccion, duenosCompartidos, deQuien } from '@/lib/compartido-direccion'
import { textoPunto } from '@/lib/prescripcion-zona'
import {
  leerAjustes, borradorDe, ajustesDeBorrador, mismoBorrador, fronterasDe, pctDe, fronteraMovida,
  esfuerzoDeFrontera, zonaALaPlantilla, ajustesParaGuardar, clasificacionAjustada,
  arrastrarFrontera, pasoFrontera, escribirLimite, pegarZonas, separarZonas, historial, puedeDeshacer, HISTORIAL_VACIO,
  type AjusteZona, type Borrador, type Frontera, type Lado,
} from '@/lib/zonas-ajuste'
import EscaleraZonas, { type AsaEscalera, type EdicionEscalera } from '@/components/zonas/EscaleraZonas'

const HITO = '#8ecbff'
/* Si la lista de clasificaciones está plegada, en este navegador. */
const LLAVE_LISTA = 'tripulse.zonas-propias.lista'
const nEs = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')

interface FilaDefinicion { id: number; nombre: string; deporte: string }
interface FilaMedicion { id_definicion: number; fecha: string; datos: Record<string, unknown> | null }

/** Qué clasificación se está viendo: una tuya o una que te comparten. */
type Seleccion = { de: 'mia'; i: number } | { de: 'ajena'; g: number; i: number }

/** Cómo se leen las zonas de una clasificación, por la unidad de sus hitos. */
const textoUnidad = (h: HitoDisponible | null): string => {
  /* Con la unidad como la entiende la app: «Km/h» también es un ritmo. */
  const u = h ? unidadCanonica(h.unidad) : ''
  return !h ? 'sin hitos'
    : u === 'km/h' ? 'en ritmo (min/km)'
    : u === 'W' ? 'en vatios'
    : u === 's/100' ? 'en ritmo (/100)'
    : 'en ' + h.unidad
}

const NOMBRE_DE_LA_APP: Record<string, string> = {
  vam: 'Zonas sobre la VAM', ftp: 'Zonas sobre el FTP', css: 'Zonas sobre el CSS',
}

/**
 * Un % que se escribe a mano. Mientras se escribe enseña lo tecleado y no el
 * valor: de lo contrario, camino de «102», el «1» y el «10» moverían la
 * frontera (o la devolverían a su sitio) con cada tecla. Lo que no es un % con
 * sentido no mueve nada; al salir, enseña el que se quedó.
 */
function CampoPct({ valor, onCambio, etiqueta, cambiado, desactivado }: {
  valor: number
  onCambio: (n: number) => void
  etiqueta: string
  cambiado: boolean
  desactivado?: boolean
}) {
  const [texto, setTexto] = useState<string | null>(null)
  return (
    /* `data-pct`: aquí Ctrl+Z deshace el cambio entero, no la última cifra. */
    <input type="text" inputMode="decimal" aria-label={etiqueta} disabled={desactivado} data-pct="1"
      value={texto ?? nEs(valor)}
      onFocus={() => setTexto(nEs(valor))}
      onChange={e => {
        setTexto(e.target.value)
        const n = Number(e.target.value.replace(',', '.'))
        if (Number.isFinite(n) && n >= 40 && n <= 400) onCambio(n)
      }}
      onBlur={() => setTexto(null)}
      className={'w-[62px] rounded-lg px-2 py-1 text-right font-mono text-[13px] tabular-nums outline-none border focus:border-orange-500 disabled:opacity-50 '
        + (cambiado ? 'border-orange-500/55 bg-orange-500/[0.08] text-white' : 'border-transparent bg-gray-800 text-white')} />
  )
}

export default function ZonasPropiasPage() {
  const router = useRouter()
  useRequireEntrenador()

  const [userId, setUserId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [clasifs, setClasifs] = useState<Clasificacion[]>([])
  /* Las que te comparte la dirección (tu director, o los entrenadores que
     diriges). APARTE y de solo lectura: Guardar escribe las tuyas, y no puede
     llevar dentro las de otro. */
  const [ajenas, setAjenas] = useState<{ de: string; clasifs: Clasificacion[] }[]>([])
  const [sel, setSel] = useState<Seleccion | null>(null)
  const [cambios, setCambios] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; texto: string } | null>(null)
  /* LA LISTA DE LA IZQUIERDA SE PUEDE PLEGAR, para dejarle sitio a la escalera
     y a sus porcentajes al lado (lo pidió el usuario el 20-10-2026). Se acuerda
     en este navegador; si no se puede leer, abierta. */
  const [listaAbierta, setListaAbierta] = useState<boolean>(() => {
    try { return localStorage.getItem(LLAVE_LISTA) !== 'cerrada' } catch { return true }
  })
  const alternarLista = () => {
    const abierta = !listaAbierta
    setListaAbierta(abierta)
    try { localStorage.setItem(LLAVE_LISTA, abierta ? 'abierta' : 'cerrada') } catch { /* sin recordarlo */ }
  }

  const [deportistas, setDeportistas] = useState<{ id: number; nombre: string }[]>([])
  const [depActivo, setDepActivo] = useState<number | null>(null)
  /* Una referencia de la app por deporte: la VAM, el FTP y el CSS del elegido. */
  const [refs, setRefs] = useState<TestsApp>({})
  /* Los tests del entrenador con las mediciones DEL ATLETA ELEGIDO. De sus
     definiciones salen los hitos; de sus mediciones, lo que valen.
     NULL MIENTRAS NO HAN LLEGADO, y no una lista vacía: con una lista vacía,
     entre que se pintan las zonas y responde la consulta, cada hito de un test
     se marcaría un instante como «ya no existe». */
  const [tests, setTests] = useState<TestConMediciones[] | null>(null)
  /* Qué deportistas tienen hecho cada test (id del test → ids de deportista). */
  const [medidoPor, setMedidoPor] = useState<Record<number, number[]>>({})

  /* SUS PORCENTAJES (lib/zonas-ajuste): lo guardado del deportista elegido y lo
     que se está moviendo. `null` en el borrador = igual que lo guardado, y así
     no hay que tenerlos sincronizados a mano. */
  const [ajustes, setAjustes] = useState<Map<number, AjusteZona>>(new Map())
  /* Con su historia, para «Deshacer» y Ctrl+Z (lib/zonas-ajuste, `historial`). */
  const [hist, cambiarHist] = useReducer(historial, HISTORIAL_VACIO)
  const borrador = hist.borrador
  const [guardandoAj, setGuardandoAj] = useState(false)
  /* A quién se quería pasar con cambios sin guardar: antes se pregunta. */
  const [pendienteDep, setPendienteDep] = useState<number | null>(null)
  /* MIENTRAS SE ARRASTRA, las fronteras son las de cuando se cogió el asa: si
     dos se juntaran a mitad del gesto, el asa cambiaría bajo el dedo, y así la
     que se arrastra puede pasar por encima de otra sin quedarse pegada. Al
     soltar, si quedaron en el mismo punto, ya son una (lib/zonas-ajuste). */
  const [congeladas, setCongeladas] = useState<{ clasif: number; fronteras: Frontera[] } | null>(null)
  /* Quién tiene porcentajes propios en cada zona (id de zona → ids de deportista). */
  const [conAjustes, setConAjustes] = useState<Record<number, number[]>>({})

  useEffect(() => { arrancar() }, [])

  /* Lo de este deportista sin guardar: se mira en cada pintada (es barato). */
  const todasLasClasifs = [...clasifs, ...ajenas.flatMap(g => g.clasifs)]
  const guardado = borradorDe(todasLasClasifs, ajustes)
  const efectivo: Borrador = borrador ?? guardado
  const sinGuardarAj = borrador !== null && !mismoBorrador(borrador, guardado)
  const actual: Clasificacion | null = sel
    ? (sel.de === 'mia' ? clasifs[sel.i] : ajenas[sel.g]?.clasifs[sel.i]) ?? null
    : null
  const sePuedeDeshacer = puedeDeshacer(hist, actual?.id)

  /* Salir con cambios sin guardar los perdería sin decir nada. */
  useEffect(() => {
    if (!cambios && !sinGuardarAj) return
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [cambios, sinGuardarAj])

  /* Ctrl+Z (⌘Z en el Mac) deshace lo último de sus porcentajes. Escribiendo en
     otra casilla (la plantilla, un nombre) se deja el deshacer de siempre. */
  const idActual = actual?.id ?? null
  useEffect(() => {
    if (!sePuedeDeshacer || cambios || idActual == null) return
    const alTeclear = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const el = e.target instanceof HTMLElement ? e.target : null
      const escribe = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      if (escribe && !el.dataset.pct) return
      e.preventDefault()
      /* En la casilla de un %: al salir enseña el que vuelve. */
      if (escribe) el.blur()
      cambiarHist({ tipo: 'deshacer', clasif: idActual })
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [sePuedeDeshacer, cambios, idActual])

  const arrancar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    /* TRES RONDAS en vez de seis. Los socios de la dirección se preguntan ya en
       la primera (no dependen de nada), y luego las zonas de los socios, las
       referencias del atleta y los tests van a la vez. */
    const [{ data: cs }, { data: zs }, { data: deps }, socios] = await Promise.all([
      supabase.from('zona_clasificacion').select('*').eq('id_entrenador', user.id).eq('archivada', false).order('orden'),
      supabase.from('zona_entrenador').select('*').eq('id_entrenador', user.id).eq('archivada', false).order('orden'),
      supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id).eq('solo_test', false).order('nombre'),
      sociosDeDireccion(),
      cargarQuienTieneAjustes(),
    ])
    const mias = leerClasificaciones(cs, zs)
    setDeportistas(deps || [])

    const cargarAjenas = async () => {
      if (!socios.length) { setAjenas([]); return }
      const ids = socios.map(s => s.id)
      const [{ data: ocs }, { data: ozs }] = await Promise.all([
        supabase.from('zona_clasificacion').select('*').in('id_entrenador', ids).eq('archivada', false).order('orden'),
        supabase.from('zona_entrenador').select('*').in('id_entrenador', ids).eq('archivada', false).order('orden'),
      ])
      setAjenas(ids.map(id => ({
        de: deQuien(id, user.id, socios) || 'otro entrenador',
        clasifs: leerClasificaciones(
          (ocs || []).filter((c: { id_entrenador: string }) => c.id_entrenador === id),
          (ozs || []).filter((z: { id_entrenador: string }) => z.id_entrenador === id),
        ).filter(c => !c.suelta),
      })).filter(g => g.clasifs.length > 0))
    }

    /* SE ESPERA A TENER LOS TESTS antes de quitar el «Cargando…»: de sus
       definiciones salen los nombres de los hitos. Y se recargan aunque ya
       hubiera un atleta elegido: si no, después de guardar la lista de hitos se
       quedaba con la foto de al abrir la pantalla. */
    const dep = depActivo ?? (deps || [])[0]?.id ?? null
    const [t] = await Promise.all([
      /* Si ya había uno elegido, lo que estuviera moviendo se conserva: aquí se
         llega también al guardar la plantilla. */
      dep != null ? elegirDeportista(dep, dep === depActivo) : recargarTests(null),
      cargarAjenas(),
    ])

    /* Las sueltas (las que guardó la app publicada sin clasificación) llegan
       sin nombre: se les pone el de la cabecera que tenían. */
    setClasifs(mias.map(c => c.suelta && !c.nombre ? { ...c, nombre: nombreDeSuelta(c, t) } : c))
    setSel(s => s ?? (mias.length ? { de: 'mia', i: 0 } : null))
    setCambios(mias.some(c => c.suelta))
    setCargando(false)
  }

  const nombreDeSuelta = (c: Clasificacion, t: TestConMediciones[]): string => {
    const app = leerIdApp(c.hitos[0] || '')
    if (app) return NOMBRE_DE_LA_APP[app]
    return buscarHito(hitosDisponibles(c.deporte, t), c.hitos[0])?.largo || 'Zonas sin clasificar'
  }

  /** Los números del atleta: los de la app, los de los tests propios y sus porcentajes. */
  const elegirDeportista = async (id: number, conservarBorrador = false): Promise<TestConMediciones[]> => {
    setDepActivo(id)
    setPendienteDep(null)
    if (!conservarBorrador) cambiarHist({ tipo: 'empezar' })
    setCongeladas(null)
    /* Sus referencias, sus tests y sus ajustes a la vez: no dependen unos de otros. */
    const [r, t, a] = await Promise.all([
      cargarReferencias(supabase, id),
      recargarTests(id),
      supabase.from('zona_ajuste').select('id_zona, desde, hasta').eq('id_deportista', id),
    ])
    setRefs({ vam: Number(r.tests?.vam) || 0, ftp: Number(r.tests?.ftp) || 0, css: Number(r.tests?.css) || 0 })
    setAjustes(leerAjustes(a.data))
    return t
  }

  /** Cambiar de deportista, pero sin perder en silencio lo que se estaba moviendo. */
  const cambiarDeportista = (id: number) => {
    if (id === depActivo) return
    if (sinGuardarAj) { setPendienteDep(id); return }
    elegirDeportista(id)
  }

  /** Quién tiene porcentajes propios en cada zona. La RLS ya deja solo los de tus deportistas. */
  const cargarQuienTieneAjustes = async () => {
    const { data } = await supabase.from('zona_ajuste').select('id_zona, id_deportista')
    const porZona: Record<number, number[]> = {}
    for (const f of (data || []) as { id_zona: number; id_deportista: number }[]) {
      const l = (porZona[f.id_zona] ||= [])
      if (!l.includes(f.id_deportista)) l.push(f.id_deportista)
    }
    setConAjustes(porZona)
  }

  /** Guarda lo movido para el deportista elegido. Devuelve si salió bien. */
  const guardarAjustes = async (): Promise<boolean> => {
    if (depActivo == null) return false
    const { filas, borrar } = ajustesParaGuardar(todasLasClasifs, efectivo, depActivo, ajustes.keys(), new Date().toISOString())
    setGuardandoAj(true)
    try {
      /* Las dos cosas a la vez: tocan zonas distintas. */
      const [up, del] = await Promise.all([
        filas.length ? supabase.from('zona_ajuste').upsert(filas, { onConflict: 'id_zona,id_deportista' }) : Promise.resolve({ error: null }),
        borrar.length ? supabase.from('zona_ajuste').delete().eq('id_deportista', depActivo).in('id_zona', borrar) : Promise.resolve({ error: null }),
      ])
      const error = up.error || del.error
      if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return false }
    } finally {
      setGuardandoAj(false)
    }
    const { data } = await supabase.from('zona_ajuste').select('id_zona, desde, hasta').eq('id_deportista', depActivo)
    setAjustes(leerAjustes(data))
    cambiarHist({ tipo: 'guardado' })
    cargarQuienTieneAjustes()
    const quien = deportistas.find(d => d.id === depActivo)?.nombre.split(' ')[0] || 'este deportista'
    decir('ok', filas.length
      ? 'Guardado para ' + quien + '. Lo que le mandes desde ahora sale con sus porcentajes; lo ya mandado no cambia.'
      : quien + ' vuelve a la plantilla general.')
    return true
  }

  /** Los tests del entrenador (y de su dirección) con las mediciones de ese atleta. */
  const recargarTests = async (id: number | null): Promise<TestConMediciones[]> => {
    const user = await usuarioActual()
    const { data: defs } = user
      ? await supabase.from('test_definicion').select('*').in('id_entrenador', await duenosCompartidos(user.id)).eq('archivado', false)
      : { data: [] as FilaDefinicion[] }
    const filas: FilaDefinicion[] = defs || []
    const ids = filas.map(d => d.id)
    /* Todas las mediciones de ese atleta en UNA consulta, no una por test. Y
       aparte, sin los datos, QUIÉN tiene hecho cada test: es lo que permite
       decir «Bruno no la tiene hecha, Nico sí» en vez de dejar la escalera en
       blanco sin explicar por qué. */
    const [{ data: meds }, { data: quienes }] = await Promise.all([
      id != null && ids.length
        ? supabase.from('test_medicion').select('id_definicion, fecha, datos').eq('id_deportista', id).in('id_definicion', ids)
        : Promise.resolve({ data: [] as FilaMedicion[] }),
      ids.length
        ? supabase.from('test_medicion').select('id_definicion, id_deportista').in('id_definicion', ids)
        : Promise.resolve({ data: [] as { id_definicion: number; id_deportista: number }[] }),
    ])
    const porTest: Record<number, { fecha: string; datos: Record<string, unknown> }[]> = {}
    for (const m of (meds || []) as FilaMedicion[]) (porTest[m.id_definicion] ||= []).push({ fecha: m.fecha, datos: m.datos || {} })
    const medidos: Record<number, number[]> = {}
    for (const q of (quienes || []) as { id_definicion: number; id_deportista: number }[]) {
      const l = (medidos[q.id_definicion] ||= [])
      if (!l.includes(q.id_deportista)) l.push(q.id_deportista)
    }
    setMedidoPor(medidos)
    /* La fila la lee «testDeFila», que entiende los DOS modelos de test. */
    const lista = filas.map(d => testDeFila(d, porTest[d.id] || []))
    setTests(lista)
    return lista
  }

  /* Al volver a esta pestaña se vuelven a pedir los tests. El camino normal es
     justo ese: te vas a crear la prueba de esfuerzo y vuelves a por sus hitos. */
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') recargarTests(depActivo) }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [depActivo])

  const decir = (tipo: 'ok' | 'mal', texto: string) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(null), 5000)
  }

  // ------------------------------------------------------------
  // Editar
  // ------------------------------------------------------------

  const parcheC = (i: number, c: Partial<Clasificacion>) => {
    setClasifs(cs => cs.map((x, k) => k === i ? { ...x, ...c } : x))
    setCambios(true)
  }
  const parcheZ = (i: number, j: number, c: Partial<ZonaEntrenador>) => {
    setClasifs(cs => cs.map((x, k) => k === i ? { ...x, zonas: x.zonas.map((z, m) => m === j ? { ...z, ...c } : z) } : x))
    setCambios(true)
  }

  const disponibles = (deporte: string): HitoDisponible[] => (tests ? hitosDisponibles(deporte, tests) : [])

  /** Los hitos de la clasificación que siguen existiendo. Sin tests cargados, no se sabe. */
  const hitosValidos = (c: Clasificacion): string[] | undefined =>
    tests ? c.hitos.filter(h => buscarHito(disponibles(c.deporte), h)) : undefined

  const motivoZona = (c: Clasificacion, j: number): string | null =>
    motivoNoUsable({ ...c.zonas[j], deporte: c.deporte }, j, c.zonas, hitosValidos(c))

  /** Por qué una clasificación no se puede guardar: lo suyo o lo de sus hitos. */
  const motivoDe = (c: Clasificacion): string | null => {
    const m = motivoClasificacion(c)
    if (m) return m
    const hs = c.hitos.map(h => buscarHito(disponibles(c.deporte), h)).filter((h): h is HitoDisponible => !!h)
    if (hs.some(h => !mismaUnidad(h, hs[0]))) return 'Sus hitos van en unidades distintas'
    return null
  }

  const nuevaClasificacion = (deporte = 'Carrera') => {
    const i = clasifs.length
    setClasifs(cs => [...cs, CLASIFICACION_NUEVA(cs.length, deporte)])
    setSel({ de: 'mia', i })
    setCambios(true)
  }

  const anadirHito = (i: number, id: string) => {
    if (!id) return
    const c = clasifs[i]
    const nuevo = buscarHito(disponibles(c.deporte), id)
    const primero = c.hitos.map(h => buscarHito(disponibles(c.deporte), h)).find(Boolean)
    if (nuevo && primero && !mismaUnidad(nuevo, primero)) {
      decir('mal', 'Una clasificación, una unidad: ' + nuevo.corto + ' va en ' + nuevo.unidad + ' y esta en '
        + primero.unidad + '. Para ' + nuevo.unidad + ', crea otra clasificación.')
      return
    }
    parcheC(i, { hitos: [...c.hitos, id] })
  }

  const quitarHito = (i: number, id: string) => {
    const c = clasifs[i]
    const usan = c.zonas.filter(z => z.desde?.ref === id || z.hasta?.ref === id).map(z => z.sigla || 'una sin sigla')
    if (usan.length) {
      decir('mal', 'Lo usa' + (usan.length > 1 ? 'n ' : ' ') + usan.join(', ') + ': cámbiales el hito antes de quitarlo.')
      return
    }
    parcheC(i, { hitos: c.hitos.filter(h => h !== id) })
  }

  const anadirZona = (i: number) => parcheC(i, { zonas: [...clasifs[i].zonas, zonaSiguiente(clasifs[i])] })

  /** Pone un límite: con hito (y % 100 si no tenía) o sin límite. */
  const ponerLimite = (i: number, j: number, cual: 'desde' | 'hasta', ref: string) => {
    const antes = clasifs[i].zonas[j][cual]
    parcheZ(i, j, { [cual]: ref ? { ref, pct: antes?.pct ?? 100 } : null })
  }
  const ponerPct = (i: number, j: number, cual: 'desde' | 'hasta', pct: number) => {
    const antes = clasifs[i].zonas[j][cual]
    if (antes) parcheZ(i, j, { [cual]: { ...antes, pct } })
  }

  const alternarRpe = (i: number, j: number) => {
    const z = clasifs[i].zonas[j]
    parcheZ(i, j, { rpeMax: z.rpeMax == null ? Math.min(10, (Number(z.rpeMin) || 0) + 1) : null })
  }

  const quitarZona = async (i: number, j: number) => {
    const z = clasifs[i].zonas[j]
    if (z.id && !confirm('¿Quitar «' + (z.sigla || 'esta zona') + '»? Las sesiones que ya la usen no se tocan.')) return
    if (z.id) {
      /* Se archiva, no se borra: cada tarea prescrita guarda su propia copia,
         y archivar deja rastro de que existió. */
      const { error } = await supabase.from('zona_entrenador').update({ archivada: true }).eq('id', z.id)
      if (error) { decir('mal', error.message); return }
    }
    setClasifs(cs => cs.map((x, k) => k === i ? { ...x, zonas: x.zonas.filter((_, m) => m !== j) } : x))
    decir('ok', 'Quitada.')
  }

  const archivarClasificacion = async (i: number) => {
    const c = clasifs[i]
    if (!confirm('¿Archivar «' + (c.nombre || 'esta clasificación') + '»? Sus zonas dejan de salir al prescribir. Las sesiones ya mandadas no cambian.')) return
    const zonasIds = c.zonas.map(z => z.id).filter((x): x is number => !!x)
    if (c.id) {
      const { error } = await supabase.from('zona_clasificacion').update({ archivada: true }).eq('id', c.id)
      if (error) { decir('mal', error.message); return }
    }
    if (zonasIds.length) {
      const { error } = await supabase.from('zona_entrenador').update({ archivada: true }).in('id', zonasIds)
      if (error) { decir('mal', error.message); return }
    }
    setClasifs(cs => cs.filter((_, k) => k !== i))
    setSel(clasifs.length > 1 ? { de: 'mia', i: 0 } : null)
    decir('ok', 'Archivada.')
  }

  const guardar = async () => {
    if (!userId) return
    for (let k = 0; k < clasifs.length; k++) {
      const c = clasifs[k]
      const m = motivoDe(c)
      const malas = c.zonas.filter((_, j) => motivoZona(c, j) !== null).length
      if (m || malas) {
        setSel({ de: 'mia', i: k })
        decir('mal', '«' + (c.nombre || 'Sin nombre') + '»: ' + (m || malas + (malas === 1 ? ' zona sin terminar' : ' zonas sin terminar') + '. Míralas en rojo.'))
        return
      }
    }
    setGuardando(true)
    try {
      /* LAS CLASIFICACIONES A LA VEZ, cada una por su lado: iban una detrás de
         otra, tres esperas cada una. Se puede porque la sigla solo tiene que ser
         única DENTRO de su clasificación (el índice va por id_clasificacion):
         lo que escribe una no choca con lo de otra. Dentro de cada una, el
         orden sigue: ella, después sus zonas viejas y al final las nuevas. */
      await Promise.all(clasifs.map(async (c, k) => {
        const fila = clasificacionParaGuardar({ ...c, orden: k }, userId)
        let id = c.id
        if (id) {
          const { error } = await supabase.from('zona_clasificacion').update(fila).eq('id', id)
          if (error) throw error
        } else {
          const { data, error } = await supabase.from('zona_clasificacion').insert(fila).select('id').single()
          if (error) throw error
          id = Number(data.id)
        }
        /* Las que ya existían van por su id (para actualizar en vez de crear
           otra con la misma sigla, que el índice único rechazaría) y las nuevas
           aparte: mezcladas en una sola llamada, las nuevas viajarían con id
           nulo. Y las viejas PRIMERO: si una cede su sigla a una nueva, la nueva
           solo cabe cuando la vieja ya la ha soltado. */
        const filas = c.zonas.map((z, j) => ({ id: z.id, fila: paraGuardar({ ...z, orden: j, deporte: c.deporte }, userId, id) }))
        const viejas = filas.filter(f => f.id).map(f => ({ id: f.id, ...f.fila }))
        const nuevas = filas.filter(f => !f.id).map(f => f.fila)
        if (viejas.length) {
          const { error } = await supabase.from('zona_entrenador').upsert(viejas)
          if (error) throw error
        }
        if (nuevas.length) {
          const { error } = await supabase.from('zona_entrenador').insert(nuevas)
          if (error) throw error
        }
      }))
    } catch (e) {
      setGuardando(false)
      decir('mal', 'No se pudo guardar: ' + ((e as { message?: string })?.message || String(e)))
      return
    }
    setGuardando(false)
    setCambios(false)
    decir('ok', 'Guardado.')
    await arrancar()
  }

  // ------------------------------------------------------------
  // Pintar
  // ------------------------------------------------------------

  const campo = 'bg-gray-800 text-white text-[13px] rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-orange-500 border border-transparent disabled:opacity-60'
  const campoMal = campo.replace('border-transparent', 'border-red-500/60 bg-red-500/5')
  const btn = 'bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-40'
  const btn2 = 'border border-white/15 hover:border-white/30 text-gray-200 text-[13px] px-3.5 py-2 rounded-lg transition disabled:opacity-40'
  const etiqueta = 'text-[10.5px] uppercase tracking-[0.08em] text-gray-500'

  if (cargando) return <main className="min-h-screen bg-gray-950 text-gray-500 grid place-items-center">Cargando…</main>

  const soloLectura = sel?.de === 'ajena'
  const iActual = sel?.de === 'mia' ? sel.i : -1
  const atleta = deportistas.find(d => d.id === depActivo)
  const nombreAtleta = atleta?.nombre.trim().split(' ')[0] || 'este deportista'
  /* La plantilla con SUS porcentajes: la escalera, «le sale» y los avisos son de
     esa persona. El eje sale de la plantilla, que no se mueve mientras se
     arrastra: así no baila nada bajo el dedo. */
  const evPlantilla: Evaluacion | null = actual && tests ? evaluar(actual, disponibles(actual.deporte), refs, tests) : null
  const actualSuya = actual ? clasificacionAjustada(actual, ajustesDeBorrador(efectivo, [actual])) : null
  const ev: Evaluacion | null = actualSuya && tests ? evaluar(actualSuya, disponibles(actualSuya.deporte), refs, tests) : null

  /* SE AJUSTA A UNA PERSONA LA PLANTILLA GUARDADA. Con la plantilla a medias,
     una frontera podría apuntar a una zona que aún no existe en la base; y una
     zona nueva no tiene id al que colgarle nada. */
  const conNumeros = !!ev && ev.hitos.some(h => h.hito && h.valor !== null)
  const puedeAjustar = !!actual && !!actual.id && !actual.suelta && !cambios && depActivo != null && conNumeros
  const zonaAjustadaAqui = (idZona?: number) => !!idZona && !!efectivo[idZona]
  const nAjustadas = actual ? actual.zonas.filter(z => zonaAjustadaAqui(z.id)).length : 0

  /* Las fronteras que se arrastran, las de esta persona: dos zonas que ha juntado son una sola. */
  const fronteras: Frontera[] = puedeAjustar && actual && ev
    ? (congeladas && congeladas.clasif === actual.id ? congeladas.fronteras : fronterasDe(actual, efectivo, ev))
    : []
  const visibles = actual && ev
    ? fronteras.map(f => ({ f, esf: esfuerzoDeFrontera(actual, efectivo, f, ev) })).filter((x): x is { f: Frontera; esf: number } => x.esf !== null)
    : []
  const asas: AsaEscalera[] = actual && ev ? visibles.map(({ f, esf }) => {
    const p = pctDe(actual, efectivo, f.claves[0]) ?? 0
    const corto = buscarHito(disponibles(actual.deporte), f.ref)?.corto || 'hito'
    const punto = textoPunto(ev.inverso ? 1 / esf : esf, ev.unidad)
    const movida = fronteraMovida(efectivo, f)
    const dePlantilla = pctDe(actual, {}, f.claves[0])
    return {
      clave: f.claves.map(k => k.idZona + k.lado).join('-'),
      esfuerzo: esf,
      fantasma: movida ? esfuerzoDeFrontera(actual, {}, f, ev) : null,
      carriles: f.claves.map(k => actual.zonas.findIndex(z => z.id === k.idZona)).filter(i => i >= 0).sort((a, b) => a - b),
      nombre: f.nombre,
      valor: p,
      globo: f.nombre + ' · ' + nEs(p) + ' % de su ' + corto + (punto ? ' · ' + punto : '')
        + (movida && dePlantilla !== null ? ' (plantilla ' + nEs(dePlantilla) + ' %)' : ''),
      aria: nEs(p) + ' % de su ' + corto + (punto ? ', ' + punto : ''),
      movida,
    }
  }) : []
  /** Un cambio en sus porcentajes, apuntado para poder deshacerlo. Los del mismo `grupo` son un solo paso; sin grupo, cada uno es el suyo. */
  const cambiar = (hacer: (b: Borrador) => Borrador, grupo: string | null = null) => {
    if (actual?.id) cambiarHist({ tipo: 'cambiar', hacer, base: guardado, grupo, clasif: actual.id })
  }

  const edicion: EdicionEscalera | null = puedeAjustar && actual && ev ? {
    asas,
    onArrastrar: (i, esf, gesto, iman) => {
      const f = visibles[i]?.f
      if (!f || !actual.id) return
      if (!congeladas) setCongeladas({ clasif: actual.id, fronteras })
      /* Cerca del borde de la zona de al lado, se pega: así se juntan. */
      cambiar(b => arrastrarFrontera(actual, f, esf, b, ev, iman), 'arrastre-' + gesto)
    },
    onSoltar: () => setCongeladas(null),
    onPaso: (i, dir, grande) => {
      const f = visibles[i]?.f
      if (f) cambiar(b => pasoFrontera(actual, f, dir, grande, b, ev))
    },
  } : null

  /** Escribir un % a mano: mueve su frontera, igual que arrastrarla. Lo de una casilla es un paso, aunque se teclee cifra a cifra. */
  const escribirPct = (idZona: number, lado: Lado, n: number) => {
    if (!actual || !ev) return
    const f = fronteras.find(x => x.claves.some(k => k.idZona === idZona && k.lado === lado))
    if (!f) return
    cambiar(b => escribirLimite(actual, f, { idZona, lado }, n, b, ev), 'casilla-' + idZona + lado)
  }
  /** Esta clasificación entera a la plantilla (las demás no se tocan). */
  const todoALaPlantilla = () => {
    if (!actual) return
    cambiar(b => Object.fromEntries(Object.entries(b).filter(([id]) => !actual.zonas.some(z => z.id === Number(id)))))
  }

  /** El primer hito que existe: de él salen la unidad y el sentido de toda la clasificación. */
  const hitoGuia = (c: Clasificacion) => c.hitos.map(h => buscarHito(disponibles(c.deporte), h)).find(Boolean) ?? null
  const corto = (c: Clasificacion, ref: string) => buscarHito(disponibles(c.deporte), ref)?.corto ?? 'hito que ya no existe'

  /** La lista de la izquierda: las tuyas por deporte y las compartidas. */
  const deportesConClasif = [...DEPORTES_ZONA]
  for (const c of clasifs) if (c.deporte && !deportesConClasif.includes(c.deporte)) deportesConClasif.push(c.deporte)

  const itemLista = (c: Clasificacion, activa: boolean, alPulsar: () => void, clave: string) => (
    <button key={clave} onClick={alPulsar}
      className={'w-full text-left rounded-xl border px-2.5 py-2 flex flex-col gap-1.5 transition '
        + (activa ? 'bg-[#151b24] border-white/15' : 'border-transparent hover:bg-white/[0.03]')}>
      <span className="text-[13.5px] font-semibold leading-snug">{c.nombre || 'Sin nombre'}</span>
      <span className="text-[11.5px] text-gray-400">
        {c.zonas.length} {c.zonas.length === 1 ? 'zona' : 'zonas'} · {textoUnidad(hitoGuia(c))}
        {c.suelta && <span className="text-amber-300/80"> · sin guardar</span>}
      </span>
      {c.zonas.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {c.zonas.map((z, k) => <i key={k} className="w-2.5 h-2.5 rounded-[3px]" style={{ background: z.color }} />)}
        </span>
      )}
    </button>
  )

  /** El editor de un límite: su hito (o «sin límite») y su %. */
  const editorLimite = (c: Clasificacion, j: number, cual: 'desde' | 'hasta', mal: boolean) => {
    const l: Limite | null = c.zonas[j][cual]
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="min-[1380px]:hidden w-11 shrink-0 text-[10px] uppercase tracking-wider text-gray-500">{cual}</span>
        <select value={l?.ref ?? ''} disabled={soloLectura}
          onChange={e => ponerLimite(iActual, j, cual, e.target.value)}
          className={(mal ? campoMal : campo) + ' flex-1 min-w-0'} style={l ? { color: HITO } : undefined}>
          <option value="">— sin límite</option>
          {c.hitos.map(h => <option key={h} value={h}>{corto(c, h)}</option>)}
          {l && !c.hitos.includes(l.ref) && <option value={l.ref}>{corto(c, l.ref)} (ya no está)</option>}
        </select>
        {l && (
          <>
            <input type="number" inputMode="decimal" value={l.pct || ''} disabled={soloLectura}
              onChange={e => ponerPct(iActual, j, cual, Number(e.target.value))}
              aria-label={'% del ' + cual}
              className={campo + ' w-[64px] text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'} />
            <span className="text-gray-600 text-xs">%</span>
          </>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        <span className="text-sm text-gray-500">Herramientas › <b className="text-gray-300 font-semibold">Zonas propias</b></span>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">
        <div data-guia="zp.inicio">
          <h2 className="text-2xl font-bold mb-1">Zonas propias</h2>
          <p className="text-gray-400 text-sm max-w-3xl">
            Tus clasificaciones, además de las de la aplicación (que siguen ahí y no se tocan). Cada una tira
            de unos <b className="text-[#8ecbff] font-semibold">hitos</b> —el VT1, el VT2 y el VO2máx de tu prueba
            de esfuerzo, o la VAM, el FTP o el CSS de la app— y <b className="text-gray-200">cada límite de cada
            zona sale del hito que le toque</b>: una zona puede empezar en el VT1 + 15 % y acabar en el VT2 − 5 %.
          </p>
        </div>

        {aviso && (
          <div role="status" className={'px-4 py-3 rounded-xl text-sm border ' + (aviso.tipo === 'ok'
            ? 'bg-green-500/8 border-green-500/30 text-green-300'
            : 'bg-red-500/8 border-red-500/30 text-red-300')}>{aviso.texto}</div>
        )}

        <div className="rounded-2xl border border-white/10 overflow-hidden bg-[#0a0a0a]">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/[0.08] bg-[#0c0f14]">
            <button type="button" onClick={alternarLista} aria-expanded={listaAbierta} aria-controls="zp-lista"
              title={listaAbierta ? 'Plegar la lista para dejar más sitio' : 'Ver la lista de clasificaciones'}
              className="hidden md:inline-flex items-center gap-1.5 text-[12.5px] text-gray-400 hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-2.5 py-1.5 transition">
              <span aria-hidden="true">{listaAbierta ? '«' : '»'}</span>{listaAbierta ? 'Ocultar lista' : 'Ver lista'}
            </button>
            {/* En el móvil la lista de la izquierda no cabe: un desplegable. Y en el
                ordenador, con la lista plegada. */}
            <select className={campo + (listaAbierta ? ' md:hidden' : '') + ' max-w-[60vw]'}
              value={sel ? (sel.de === 'mia' ? 'm' + sel.i : 'a' + sel.g + ':' + sel.i) : ''}
              onChange={e => {
                const v = e.target.value
                if (v === 'nueva') { nuevaClasificacion(); return }
                if (v.startsWith('m')) setSel({ de: 'mia', i: Number(v.slice(1)) })
                else if (v.startsWith('a')) { const [g, i] = v.slice(1).split(':').map(Number); setSel({ de: 'ajena', g, i }) }
              }}>
              {!sel && <option value="">Elige una clasificación</option>}
              {clasifs.map((c, i) => <option key={'m' + i} value={'m' + i}>{c.nombre || 'Sin nombre'} · {c.deporte}</option>)}
              {ajenas.map((g, gi) => g.clasifs.map((c, i) => <option key={'a' + gi + ':' + i} value={'a' + gi + ':' + i}>{c.nombre} · de {g.de}</option>))}
              <option value="nueva">+ Nueva clasificación</option>
            </select>
            <span className="flex-1" />
            {cambios && <span className="text-amber-300/90 text-xs">Hay cambios sin guardar</span>}
            <button onClick={guardar} disabled={guardando || !cambios} className={btn}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>

          <div className={'grid min-h-[560px] ' + (listaAbierta ? 'md:grid-cols-[260px_1fr]' : '')}>
            {/* ---- la lista ---- */}
            <aside id="zp-lista" aria-label="Tus clasificaciones"
              className={(listaAbierta ? 'hidden md:flex' : 'hidden') + ' flex-col gap-4 border-r border-white/[0.08] bg-[#0c0f14] px-3 py-4'}>
              {deportesConClasif.map(d => {
                const suyas = clasifs.map((c, i) => ({ c, i })).filter(x => x.c.deporte === d)
                if (!suyas.length) return null
                return (
                  <div key={d} className="flex flex-col gap-1">
                    <span className={etiqueta + ' px-1.5'}>{d === 'Natacion' ? 'Natación' : d}</span>
                    {suyas.map(({ c, i }) => itemLista(c, sel?.de === 'mia' && sel.i === i, () => setSel({ de: 'mia', i }), 'm' + i))}
                  </div>
                )
              })}
              <button onClick={() => nuevaClasificacion(actual?.deporte || 'Carrera')}
                className="text-left text-gray-400 hover:text-orange-400 text-[12.5px] px-2 transition">+ Nueva clasificación</button>
              {ajenas.map((g, gi) => (
                <div key={g.de} className="flex flex-col gap-1 pt-1 border-t border-white/[0.06]">
                  <span className={etiqueta + ' px-1.5 pt-2'}>De {g.de} · solo ver</span>
                  {g.clasifs.map((c, i) => itemLista(c, sel?.de === 'ajena' && sel.g === gi && sel.i === i, () => setSel({ de: 'ajena', g: gi, i }), 'a' + gi + ':' + i))}
                </div>
              ))}
              <p className="text-[11.5px] text-gray-600 px-1.5 leading-relaxed">
                Las de la app (Clásico Z1–Z7 y Zonas 2) siguen ahí y no se tocan: estas se suman.
              </p>
            </aside>

            {/* ---- el editor ---- */}
            <section className="px-4 sm:px-6 py-5 flex flex-col gap-5 min-w-0">
              {!actual ? (
                <div className="py-10 text-center flex flex-col items-center gap-3">
                  <p className="text-gray-400 text-sm max-w-md">
                    Todavía no tienes ninguna. Empieza por una: ponle un nombre, elige sus hitos (los de tu prueba de
                    esfuerzo, o la VAM de la app) y ve añadiendo zonas.
                  </p>
                  <button onClick={() => nuevaClasificacion()} className={btn}>+ Nueva clasificación</button>
                </div>
              ) : (() => {
                const c = actual
                const mc = motivoDe(c)
                const guia = hitoGuia(c)
                const libres = disponibles(c.deporte).filter(h => !c.hitos.includes(h.id))
                return (
                  <>
                    {/* La cabecera: nombre, deporte y en qué se leen sus zonas. */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <input value={c.nombre} disabled={soloLectura} placeholder="Laboratorio · VT1–VT2–VO2máx"
                        onChange={e => parcheC(iActual, { nombre: e.target.value })} maxLength={80}
                        aria-label="Nombre de la clasificación"
                        className={(mc === 'Ponle un nombre' ? campoMal : campo) + ' text-[16px] font-semibold py-2 w-full sm:w-auto sm:min-w-[320px] flex-1'} />
                      {/* EL DEPORTE SOLO SE CAMBIA SIN HITOS: los hitos son de un
                          deporte, y cambiarlo con ellos dentro dejaría unas zonas
                          de natación colgadas de una velocidad de carrera. */}
                      <select value={c.deporte} disabled={soloLectura || c.hitos.length > 0}
                        title={c.hitos.length ? 'Quita sus hitos para cambiarla de deporte' : undefined}
                        onChange={e => parcheC(iActual, { deporte: e.target.value, zonas: c.zonas.map(z => ({ ...z, deporte: e.target.value })) })}
                        className={campo + ' py-2'}>
                        {DEPORTES_ZONA.map(d => <option key={d} value={d}>{d === 'Natacion' ? 'Natación' : d}</option>)}
                      </select>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-gray-300 bg-white/[0.07]">{textoUnidad(guia)}</span>
                      {c.suelta && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-amber-200 bg-amber-400/10">sin guardar: guárdala para poder usarla</span>}
                      {!soloLectura && (
                        <button onClick={() => archivarClasificacion(iActual)} className="ml-auto text-gray-500 hover:text-red-400 text-xs transition">Archivar</button>
                      )}
                    </div>
                    {mc && mc !== 'Ponle un nombre' && <p className="text-red-300 text-xs -mt-3">⚠ {mc}</p>}

                    {/* Sus hitos. */}
                    <div className="flex flex-col gap-2">
                      <span className={etiqueta}>Sus hitos</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.hitos.map(h => {
                          const hd = buscarHito(disponibles(c.deporte), h)
                          return (
                            <span key={h} className={'inline-flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[13px] border '
                              + (hd ? 'border-[#8ecbff]/35 bg-[#8ecbff]/10' : 'border-red-500/40 bg-red-500/5')}>
                              <b style={{ color: hd ? HITO : '#fca5a5' }}>{hd ? hd.corto : 'Ya no existe'}</b>
                              <small className="text-gray-400 text-[11.5px]">{hd ? hd.largo + ' · ' + hd.unidad : 'su test se archivó'}</small>
                              {!soloLectura && (
                                <button onClick={() => quitarHito(iActual, h)} aria-label={'Quitar ' + (hd?.corto || 'hito')}
                                  className="text-gray-500 hover:text-red-400 leading-none">×</button>
                              )}
                            </span>
                          )
                        })}
                        {!soloLectura && (
                          libres.length ? (
                            <select value="" onChange={e => anadirHito(iActual, e.target.value)}
                              className="bg-transparent text-gray-400 hover:text-gray-200 text-[12.5px] border border-dashed border-white/20 rounded-[10px] px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-orange-500">
                              <option value="">+ Añadir hito</option>
                              {libres.map(h => {
                                const otra = guia && !mismaUnidad(h, guia)
                                return <option key={h.id} value={h.id} disabled={!!otra}>{h.largo} · {h.unidad}{otra ? ' (otra unidad)' : ''}</option>
                              })}
                            </select>
                          ) : (
                            <span className="text-gray-600 text-[12px]">
                              {c.hitos.length ? 'No hay más hitos de ' + c.deporte.toLowerCase() + '.' : 'No hay hitos de ' + c.deporte.toLowerCase() + '.'}
                              {' '}Los tuyos salen de los tests que creas: un resultado marcado como referencia.
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Sus zonas: DESDE y HASTA, cada uno con su hito. */}
                    <div className="flex flex-col gap-2">
                      {/* LAS MISMAS COLUMNAS QUE LAS FILAS, con el mismo hueco y el
                          mismo margen (los 10 px de la fila más su borde): con otros
                          los títulos se desplazan y no se sabe qué casilla es cuál.
                          En una fila caben a partir de 1380 px; por debajo, cada zona
                          va en varias líneas en vez de cortar «Le sale» por la derecha. */}
                      <div className="hidden min-[1380px]:grid min-[1380px]:grid-cols-[14px_76px_minmax(100px,1fr)_minmax(200px,1.2fr)_minmax(200px,1.2fr)_116px_minmax(210px,1.3fr)_22px] gap-2 px-[11px] text-[10px] uppercase tracking-[0.08em] text-gray-500">
                        <span /><span>Sigla</span><span>Nombre</span><span>Desde</span><span>Hasta</span><span>RPE</span>
                        <span>{atleta ? 'A ' + atleta.nombre.split(' ')[0] + ' le sale' : 'Le sale'}</span><span />
                      </div>

                      {c.zonas.length === 0 && (
                        <p className="text-gray-600 text-sm italic px-1 py-2">Sin zonas todavía. La primera que añadas empieza por abajo del todo: por debajo de su primer hito.</p>
                      )}

                      {c.zonas.map((z, j) => {
                        const pega = motivoZona(c, j)
                        const f = fichaDe(z)
                        const ez = ev?.zonas[j]
                        const limitesMal = !!pega && /límite|hito|%/.test(pega)
                        const desde = z.desde ? { ...z.desde, corto: corto(c, z.desde.ref) } : null
                        const hasta = z.hasta ? { ...z.hasta, corto: corto(c, z.hasta.ref) } : null
                        return (
                          <div key={z.id ?? 'n' + j}
                            className={'rounded-xl border p-2.5 grid gap-2 items-center grid-cols-[14px_76px_minmax(0,1fr)_22px] min-[1380px]:grid-cols-[14px_76px_minmax(100px,1fr)_minmax(200px,1.2fr)_minmax(200px,1.2fr)_116px_minmax(210px,1.3fr)_22px] '
                              + (pega ? 'border-red-500/40 bg-red-500/[0.04]' : ez?.estado === 'reves' ? 'border-[#f2545b]/45 bg-[#0e1218]' : 'border-gray-800 bg-[#0e1218]')}>
                            <button title="Cambiar color" disabled={soloLectura} aria-label="Cambiar color"
                              onClick={() => parcheZ(iActual, j, { color: COLORES_ZONA[(COLORES_ZONA.indexOf(z.color) + 1) % COLORES_ZONA.length] })}
                              className="w-3.5 h-3.5 rounded-[4px] border border-white/20" style={{ background: z.color }} />
                            <input className={(pega && /sigla|Sin espacios|larga|app|Repetida/.test(pega) ? campoMal : campo) + ' font-mono uppercase w-full'}
                              value={z.sigla} maxLength={8} placeholder="UMB" disabled={soloLectura} aria-label="Sigla"
                              onChange={e => parcheZ(iActual, j, { sigla: e.target.value.toUpperCase() })} />
                            <input className={campo + ' w-full min-w-0'} value={z.nombre} placeholder="Umbral" disabled={soloLectura} aria-label="Nombre"
                              onChange={e => parcheZ(iActual, j, { nombre: e.target.value })} />
                            {!soloLectura
                              ? <button onClick={() => quitarZona(iActual, j)} aria-label={'Quitar ' + (z.sigla || 'zona')}
                                  className="min-[1380px]:order-last text-gray-600 hover:text-red-400 text-lg leading-none">×</button>
                              : <span className="min-[1380px]:order-last" />}

                            <div className="col-span-4 min-[1380px]:col-span-1 min-w-0">{editorLimite(c, j, 'desde', limitesMal)}</div>
                            <div className="col-span-4 min-[1380px]:col-span-1 min-w-0">{editorLimite(c, j, 'hasta', limitesMal)}</div>

                            <div className="col-span-2 min-[1380px]:col-span-1 flex gap-1 items-center min-w-0">
                              <span className="min-[1380px]:hidden w-11 shrink-0 text-[10px] uppercase tracking-wider text-gray-500">RPE</span>
                              <input className={(pega?.includes('RPE') ? campoMal : campo) + ' w-[46px] text-center tabular-nums'} type="number" step="0.5"
                                placeholder="—" value={z.rpeMin ?? ''} disabled={soloLectura} aria-label="RPE"
                                onChange={e => parcheZ(iActual, j, { rpeMin: e.target.value === '' ? null : Number(e.target.value) })} />
                              {z.rpeMax != null && (<>
                                <span className="text-gray-600 text-xs">–</span>
                                <input className={campo + ' w-[46px] text-center tabular-nums'} type="number" step="0.5" value={z.rpeMax}
                                  disabled={soloLectura} aria-label="RPE de arriba"
                                  onChange={e => parcheZ(iActual, j, { rpeMax: e.target.value === '' ? null : Number(e.target.value) })} />
                              </>)}
                              {!soloLectura && (
                                <button onClick={() => alternarRpe(iActual, j)} className="shrink-0 text-gray-500 hover:text-white text-[10.5px] px-1"
                                  title={z.rpeMax == null ? 'Pasar a un rango' : 'Pasar a un número suelto'}>{z.rpeMax == null ? '↔' : '·'}</button>
                              )}
                            </div>

                            <div className="col-span-2 min-[1380px]:col-span-1 text-[12px] leading-snug min-w-0">
                              {pega ? <span className="text-red-300">⚠ {pega}</span> : (
                                <>
                                  {ez?.estado === 'reves'
                                    ? <b className="text-[#ff9ca1] font-semibold">⚠ al revés: {ez.texto}</b>
                                    : ez?.texto
                                      ? <b className="font-mono font-semibold tabular-nums">{ez.texto}{zonaAjustadaAqui(z.id) && <span className="font-sans font-normal text-[11px] text-[#fdba74]"> · con sus %</span>}</b>
                                      : <span className="text-amber-300/70">{atleta
                                          ? 'le falta su ' + ([ez?.desde, ez?.hasta].filter(x => x && x.numero === null).map(x => x!.corto).join(' y su ') || 'dato')
                                          : 'elige un deportista'}</span>}
                                  <span className="block text-gray-500 text-[11px]">
                                    {explicarLimites(desde, hasta)} · RPE {nEs(f.rpe!)} · nivel {f.nivel}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {!soloLectura && (
                        <button onClick={() => anadirZona(iActual)} disabled={!c.hitos.length}
                          title={!c.hitos.length ? 'Añade antes algún hito' : undefined}
                          className="self-start text-gray-400 hover:text-orange-400 disabled:opacity-40 disabled:hover:text-gray-400 text-[12.5px] px-1 transition">
                          + Añadir zona
                        </button>
                      )}
                    </div>

                    {/* La escalera, con un deportista concreto: y ahí se le
                        ajustan SUS porcentajes (lib/zonas-ajuste). */}
                    {deportistas.length === 0 ? (
                      <p className="text-gray-500 text-[12.5px]">Cuando tengas deportistas, aquí verás cómo le quedan a cada uno: sus números, y si alguna zona le queda al revés.</p>
                    ) : ev && (
                      <div className="@container flex flex-col gap-3">
                        {pendienteDep != null && (
                          <div role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/[0.07] px-3.5 py-2.5 flex flex-wrap items-center gap-2 text-[13px] text-[#e8dcc0]">
                            <span>Tienes cambios sin guardar para <b>{nombreAtleta}</b>.</span>
                            <button className={btn} disabled={guardandoAj}
                              onClick={async () => { const id = pendienteDep; if (await guardarAjustes()) elegirDeportista(id) }}>
                              Guardar y pasar a {deportistas.find(d => d.id === pendienteDep)?.nombre.trim().split(' ')[0]}
                            </button>
                            <button className={btn2} onClick={() => elegirDeportista(pendienteDep)}>Descartarlos</button>
                            <button className={btn2} onClick={() => setPendienteDep(null)}>Seguir con {nombreAtleta}</button>
                          </div>
                        )}

                        {/* LA ESCALERA Y, AL LADO, SUS PORCENTAJES: para ver los números mientras se
                            arrastra (lo pidió el usuario el 20-10-2026). Se mira el ancho del bloque
                            y no el de la ventana: con la lista de la izquierda plegada cabe mucho antes.
                            Si no cabe, sus porcentajes van debajo. */}
                        <div className={'grid gap-4 items-start ' + (puedeAjustar ? '@min-[1000px]:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]' : '')}>
                          <EscaleraZonas ev={ev} titulo={'Cómo le quedan a ' + (atleta?.nombre || 'este deportista')}
                            eje={puedeAjustar && evPlantilla ? ejeParaAjustar(evPlantilla) : null}
                            edicion={edicion}
                            debajo={puedeAjustar && (
                              <p className="text-gray-500 text-[11.5px] leading-relaxed">
                                Arrastra las fronteras (las asas blancas) para ajustar <b className="text-gray-300">sus</b> porcentajes. Cada frontera la
                                comparten dos zonas: al moverla, una acaba justo donde empieza la otra. La raya discontinua marca dónde la deja la
                                plantilla. Suelta un borde cerca del de la zona de al lado y se pegan: donde acaba una empieza la otra, y desde entonces
                                se mueven juntas; para separarlas, «Separar» en sus porcentajes. Si dos asas quedan una encima de otra, tira hacia
                                donde quieras llevarla: se coge la que puede ir hacia ese lado. Con el teclado: Tab hasta un asa y las flechas (con
                                Mayúsculas, de 2,5 en 2,5). Ctrl+Z deshace.
                              </p>
                            )}
                            /* SI ESTE NO LA TIENE HECHA, QUIÉN SÍ. La escalera sale
                               con los números de uno: sin ellos se queda en blanco, y
                               sin esto no había forma de saber con quién mirarla. */
                            pista={(() => {
                              const conPrueba = deportistas.filter(d => d.id !== depActivo && c.hitos.some(h => {
                                const p = leerIdPropia(h)
                                return !!p && (medidoPor[p.idDefinicion] || []).includes(d.id)
                              }))
                              return conPrueba.length > 0 && (
                                <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-gray-400">
                                  {conPrueba.length === 1 ? 'La tiene hecha' : 'La tienen hecha'}:
                                  {conPrueba.map(d => (
                                    <button key={d.id} onClick={() => cambiarDeportista(d.id)}
                                      className="text-[12px] px-2.5 py-1 rounded-full bg-[#8ecbff]/10 text-[#8ecbff] border border-[#8ecbff]/30 hover:bg-[#8ecbff]/20 transition">
                                      Ver con {d.nombre.trim()}
                                    </button>
                                  ))}
                                </span>
                              )
                            })()}
                            derecha={
                              <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
                                Ver con
                                <select className={campo + ' text-[12.5px] py-1'} value={depActivo ?? ''}
                                  onChange={e => cambiarDeportista(Number(e.target.value))}>
                                  {deportistas.map(d => {
                                    const propios = c.zonas.some(z => !!z.id && (conAjustes[z.id] || []).includes(d.id))
                                    return <option key={d.id} value={d.id}>{d.nombre}{propios ? ' · con % propios' : ''}</option>
                                  })}
                                </select>
                              </label>
                            } />

                          {/* Al lado: en qué porcentajes y ritmos le quedan, y se pueden escribir. */}
                          {puedeAjustar && (
                            <div className="@container rounded-2xl border border-gray-800 bg-gray-900/70 px-4 pt-3.5 pb-2 flex flex-col min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <b className="text-[14px]">Sus porcentajes</b>
                                {nAjustadas > 0 && (
                                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full text-[#fdba74] bg-orange-500/15">
                                    {nAjustadas} {nAjustadas === 1 ? 'zona ajustada' : 'zonas ajustadas'}
                                  </span>
                                )}
                              </div>
                              {/* Al lado, una columna; debajo, a lo ancho, dos o tres. */}
                              <div className="grid gap-x-8 @min-[720px]:grid-cols-2 @min-[1080px]:grid-cols-3">
                              {c.zonas.map((z, j) => {
                                const ez = ev.zonas[j]
                                const aj = zonaAjustadaAqui(z.id)
                                /* PEGADA O NO A LA ANTERIOR: dónde empieza respecto a donde acaba la de
                                   antes. Arrastrando se pegan; separarlas pide su botón (lib/zonas-ajuste). */
                                const ant = j > 0 ? c.zonas[j - 1] : null
                                const idAnt = ant?.hasta && z.desde ? ant.id : undefined
                                const idEsta = z.id
                                const pegada = !!idAnt && !!idEsta && fronteras.some(f => f.claves.length === 2
                                  && f.claves[0].idZona === idAnt && f.claves[1].idZona === idEsta)
                                const union = !idAnt || !idEsta || !ant ? null : pegada ? (
                                  <span className="inline-flex items-center gap-1.5 text-[11.5px]">
                                    <span className="text-[#8ecbff]" title={'Empieza justo donde acaba ' + ant.sigla + ', y se mueven juntas'}>🔗 pegada a {ant.sigla}</span>
                                    <button type="button" onClick={() => cambiar(b => separarZonas(c, b, ev, idAnt, idEsta))}
                                      title={'Para mover por separado el final de ' + ant.sigla + ' y el principio de ' + z.sigla}
                                      className="text-gray-400 hover:text-white underline-offset-2 hover:underline">Separar</button>
                                  </span>
                                ) : (
                                  <button type="button" onClick={() => cambiar(b => pegarZonas(c, b, ev, idAnt, idEsta))}
                                    title={'Que empiece justo donde acaba ' + ant.sigla + ', y se muevan juntas'}
                                    className="text-[11.5px] px-2 py-0.5 rounded-full border border-white/15 text-gray-300 hover:text-white hover:border-white/30 transition">
                                    🔗 Pegar a {ant.sigla}
                                  </button>
                                )
                                const limite = (lado: Lado) => {
                                  const lp = z[lado]
                                  if (!lp) return <span className="text-gray-600 text-[12px] italic">{lado === 'desde' ? 'sin límite por abajo' : 'sin límite por arriba'}</span>
                                  const p = z.id ? pctDe(c, efectivo, { idZona: z.id, lado }) ?? lp.pct : lp.pct
                                  return (
                                    <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-400">
                                      <CampoPct valor={p} cambiado={!!z.id && efectivo[z.id]?.[lado] !== undefined} desactivado={!z.id}
                                        etiqueta={(lado === 'desde' ? 'Desde' : 'Hasta') + ', % de su ' + corto(c, lp.ref) + ' para ' + nombreAtleta + ' (' + z.sigla + ')'}
                                        onCambio={n => z.id && escribirPct(z.id, lado, n)} />
                                      <span>% de su <b className="font-semibold" style={{ color: HITO }}>{corto(c, lp.ref)}</b></span>
                                    </label>
                                  )
                                }
                                return (
                                  <div key={z.id ?? 'n' + j} className="grid grid-cols-[12px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 items-center py-2.5 border-t border-white/[0.06]">
                                    <i className="w-3 h-3 rounded-[4px]" style={{ background: z.color }} />
                                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                      <b className="font-mono text-[13px]">{z.sigla || '—'}</b>
                                      <span className="text-gray-400 text-[12.5px] truncate">{z.nombre}</span>
                                      {aj && <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full text-[#fdba74] bg-orange-500/15">ajustada</span>}
                                    </div>
                                    {aj && z.id
                                      ? <button onClick={() => cambiar(b => zonaALaPlantilla(c, b, z.id!, ev))}
                                          title="Vuelven a la plantilla sus fronteras, también en las zonas vecinas que las comparten"
                                          className="text-gray-500 hover:text-orange-300 text-[12px] px-1 transition">↺ General</button>
                                      : <span />}
                                    {union && <div className="col-start-2 col-span-2">{union}</div>}
                                    <div className="col-start-2 col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      {limite('desde')}
                                      <span className="text-gray-600" aria-hidden="true">→</span>
                                      {limite('hasta')}
                                    </div>
                                    <div className="col-start-2 col-span-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                                      <span className="font-mono text-[12.5px] font-semibold tabular-nums">
                                        {ez?.estado === 'reves' ? <span className="text-[#ff9ca1]">⚠ al revés</span> : ez?.texto || '—'}
                                      </span>
                                      {aj && <span className="text-gray-500 text-[11.5px]">plantilla: {explicarLimites(
                                        c.zonas[j].desde ? { ...c.zonas[j].desde!, corto: corto(c, c.zonas[j].desde!.ref) } : null,
                                        c.zonas[j].hasta ? { ...c.zonas[j].hasta!, corto: corto(c, c.zonas[j].hasta!.ref) } : null)}</span>}
                                      {!z.id && <span className="text-gray-500 text-[11.5px]">guarda la plantilla para poder ajustarla</span>}
                                    </div>
                                  </div>
                                )
                              })}
                              </div>
                            </div>
                          )}
                        </div>

                        {puedeAjustar ? (
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button onClick={guardarAjustes} disabled={!sinGuardarAj || guardandoAj} className={btn}>
                              {guardandoAj ? 'Guardando…' : 'Guardar para ' + nombreAtleta}
                            </button>
                            <button onClick={() => { if (actual?.id) cambiarHist({ tipo: 'deshacer', clasif: actual.id }) }}
                              disabled={!sePuedeDeshacer || guardandoAj} title="Deshacer el último cambio (Ctrl+Z)" className={btn2}>
                              <span aria-hidden="true">↶ </span>Deshacer
                            </button>
                            <button onClick={() => cambiar(() => guardado)} disabled={!sinGuardarAj || guardandoAj} className={btn2}>Descartar cambios</button>
                            <button onClick={todoALaPlantilla} disabled={!nAjustadas || guardandoAj} className={btn2}>Volver todo a la general</button>
                            <span className={'text-[12.5px] ' + (sinGuardarAj ? 'text-[#ffd77a]' : 'text-gray-500')}>
                              {sinGuardarAj ? 'Cambios sin guardar'
                                : Object.keys(guardado).length ? nombreAtleta + ' tiene porcentajes propios' : nombreAtleta + ' usa la plantilla general'}
                            </span>
                            <p className="basis-full text-[12px] text-gray-500">
                              <b className="text-gray-400">Las sesiones que ya le mandaste no cambian.</b> Lo que le mandes desde que guardes sale con sus
                              porcentajes: en la ficha de la sesión, en su modo entreno y en sus ritmos.
                            </p>
                          </div>
                        ) : cambios && depActivo != null && conNumeros && (
                          <p className="text-gray-500 text-[12px]">Guarda la plantilla para poder ajustarle los porcentajes a {nombreAtleta}.</p>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
            </section>
          </div>
        </div>

        <div className="bg-orange-500/[0.06] border border-orange-500/25 rounded-xl px-4 py-3 text-[12.5px] text-orange-200/90 leading-relaxed">
          <b>El RPE es obligatorio, y no es un capricho.</b> De él salen la <b>carga</b> (RPE × minutos) y el
          <b> nivel 1–7</b>, que decide la altura de la barra del dibujo, la duración estimada y qué zona representa a
          una sesión de varios bloques.
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl px-5 py-4 text-[12.5px] text-gray-400 leading-relaxed">
          <b className="text-gray-300">Se prescriben en la ficha de sesión:</b> eliges el deporte, la clasificación y la
          zona. Las de un solo hito (como «95–105 % de su VT2») se pueden afinar; las que van de un hito a otro se
          mandan enteras. Si a alguien una zona no le encaja, sale marcada con ⚠ y se puede mandar igual.
        </div>
      </div>
    </main>
  )
}
