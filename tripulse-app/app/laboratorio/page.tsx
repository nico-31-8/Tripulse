'use client'
// ============================================================
// TRIPULSE — Laboratorio: el constructor de tests (EN PRUEBAS)
// ============================================================
//
// PANTALLA APARTE, PERO YA CON BASE DE DATOS. Nació sin ella —para poder
// juzgar el proceso entero sin arriesgar un dato— y desde que guarda tests,
// mediciones y zonas eso dejó de ser verdad. Lo único que sigue viviendo solo
// en este navegador es el BORRADOR: lo que llevas montado antes de darle a
// «Guardar test».
//
// NO TOCA /tests-propios. Si el modelo convence, lo sustituye; si no, se borra
// esta carpeta, los ficheros `lab-*` de lib y la columna `modelo`, y no queda
// rastro. Sigue en pruebas hasta que se haya usado con atletas de verdad, y
// por eso lleva el distintivo en la cabecera.
//
// LO QUE SE ESTÁ PROBANDO es si un entrenador puede montar cualquier test sin
// que le expliquen el modelo: bloques de repeticiones, columnas dadas y
// medidas, el reloj escrito como una frase, y el mismo test a varias personas.
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { hoyISO } from '@/lib/fechas'
import { leerModelo, paraGuardar, medicionDe, leerMediciones, type Medicion } from '@/lib/lab-guardar'
import {
  FUNCIONES, FUNCIONES2, INSTRUMENTOS, MAX_VECES, TEST_VACIO,
  calcular, hechasDe, valorDado, escalonAhora, intervaloRitmo,
  relojesDe, cronosDe, escalonadosDe, todasLasColumnas, buscaCol, clavesRepetidas, duracionDe, tramoEn, columnaDeVelocidad,
  nuevaClave, protoVacio, medVacia, pegasDe, etiquetaFn, etiquetaFn2, col, fnB, esDmax, GRADO_CURVA, previosParaAntes,
  type Bloq, type Bloque, type Columna, type Datos, type Funcion,
  type Funcion2, type Instrumento, type Resultado, type TestLab,
} from '@/lib/lab-constructor'
import { PLANTILLAS } from '@/lib/lab-plantillas'
import { ANCLAS, ANCLAS_REFERENCIA, type Ancla } from '@/lib/test-definicion'
import { esInverso, seriesDe, conAncla, type Serie } from '@/lib/lab-series'
import { puedeFijarLab, propuestaLab, origenDe } from '@/lib/lab-zonas'
import { fijarZonas } from '@/lib/zonas-desde-test'
import { pitar, despertarAudio, pitidoEncendido, ponPitido } from '@/lib/pitido'

const LLAVE = 'tp_laboratorio_v1'
/**
 * La caja de lo que se teclea PROBANDO, en el paso 4.
 *
 * Va aparte de los deportistas de verdad a propósito: probar el test no puede
 * acabar escribiéndole un dato a nadie, y mezclarlas sería cuestión de tiempo.
 */
const PRUEBA = '_prueba'

interface Atleta { id: number; nombre: string }
interface Guardado { id: number; nombre: string; deporte: string; def: TestLab; mediciones: number }
const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const nEs = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')
const DEPORTES = ['Carrera', 'Ciclismo', 'Natación', 'Fuerza', 'Otro']

const campo = 'bg-gray-800 text-white text-[13px] rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-orange-500 w-full border border-transparent'
const campoAzul = campo.replace('border-transparent', 'border-blue-400/40')
const campoMed = campo.replace('border-transparent', 'border-orange-500/50 bg-orange-500/10')
const lab = 'block text-gray-400 text-[11px] mb-1'
const btn = 'bg-orange-500 hover:bg-orange-600 text-[#1a0d02] text-[13px] font-semibold px-4 py-2 rounded-lg transition disabled:opacity-40'
const btnSec = 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-[13px] px-4 py-2 rounded-lg transition disabled:opacity-40'
const btnMini = 'text-[11.5px] px-2.5 py-1.5 rounded-md'
const tarjeta = 'bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5'
const caja = 'border border-gray-800 rounded-xl p-3 bg-[#0d1420] mb-3'
const rejilla = 'grid gap-2.5 items-end'
const REJILLA = { gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' } as const

type Vista = 'plantillas' | 'editor' | 'pasar' | 'historial'
interface Reloj { clave: string; desde: number; acu: number; corre: boolean }
/**
 * Qué se está preguntando y en qué fórmula.
 *
 * Las de una columna van en dos pasos (cuál → qué se le pide) y las de dos, en
 * tres (qué se quiere → qué va en X → qué va en Y), porque preguntarlo todo de
 * golpe es un formulario, y esto tiene que leerse como una frase. El Dmax lleva
 * un cuarto —sobre los escalones o sobre la curva— porque son dos números
 * distintos y elegirlo por él sería decidirle el umbral a su atleta.
 */
interface Pidiendo { clave: string; col: string; fn: Funcion | null; fn2?: Funcion2; x?: string; y?: string }

const CLASES: Record<string, string> = {
  medida: 'La mides (de cada uno)',
  dada: 'La pones tú (del protocolo)',
  calculada: 'La calcula la app (con las de su fila)',
}

export default function Laboratorio() {
  const router = useRouter()
  useRequireEntrenador()

  const [vista, setVista] = useState<Vista>('plantillas')
  const [paso, setPaso] = useState(1)
  const [test, setTest] = useState<TestLab | null>(null)
  const [proto, setProto] = useState<Datos>({})
  const [atletas, setAtletas] = useState<Atleta[]>([])
  const [med, setMed] = useState<Record<string, Datos>>({})
  const [activo, setActivo] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [guardados, setGuardados] = useState<Guardado[]>([])
  const [deportistas, setDeportistas] = useState<Atleta[]>([])
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [fecha, setFecha] = useState(() => hoyISO())
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; texto: string } | null>(null)
  const [atletaHist, setAtletaHist] = useState<number | null>(null)
  const [mediciones, setMediciones] = useState<Medicion[]>([])
  const [cargandoHist, setCargandoHist] = useState(false)
  const [pidiendo, setPidiendo] = useState<Pidiendo | null>(null)
  const [reloj, setReloj] = useState<Reloj | null>(null)
  const [suena, setSuena] = useState(true)
  const [ahora, setAhora] = useState(() => Date.now())
  const [cargado, setCargado] = useState(false)

  /* Lo que se pitó la última vez, para pitar solo cuando CAMBIA. En refs y no
     en estado: cambiarlo no tiene que repintar nada. */
  const escPrevio = useRef<Record<string, number>>({})
  const avisado = useRef<Record<string, boolean>>({})
  const ritmoPrevio = useRef<Record<string, number>>({})
  const tramoPrevio = useRef<Record<string, number>>({})
  /* Las marcas absolutas del reloj compartido, por persona y columna. Con un
     reloj para todos, el tiempo de cada repetición es la resta con SU marca
     anterior: restar contra el reloj le daría a todos el del más rápido. */
  const marcas = useRef<Record<string, Record<string, number[]>>>({})

  const atletaActivo = atletas[Math.min(activo, atletas.length - 1)] || null
  /* En el editor se prueba contra la caja de pruebas; al pasar el test, contra
     la de cada deportista. */
  const cajaActiva = vista === 'pasar' && atletaActivo ? String(atletaActivo.id) : PRUEBA
  const nombreActivo = vista === 'pasar' && atletaActivo ? atletaActivo.nombre : 'Probando'
  const datosDe = useCallback(
    (a: string): Datos => ({ ...proto, ...(med[a] || {}) }),
    [proto, med],
  )
  const decir = (tipo: 'ok' | 'mal', texto: string) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(null), 4000)
  }

  /* ---------- el BORRADOR, solo en este navegador ----------
     Recargar sin querer y perder el test que llevabas media hora montando no es
     un fallo que se le pueda pedir a nadie que aguante. Y va todo en try/catch:
     en una ventana privada `localStorage` no está o lanza, y la pantalla tiene
     que funcionar igual.

     Lo guardado se lee DESPUÉS de montar, no al crear el estado: en el servidor
     no hay `localStorage`, así que leerlo en el render daría una cosa en el HTML
     y otra al hidratar. La regla del compilador avisa de poner estado en un
     efecto, y aquí es justo lo que toca. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const s = localStorage.getItem(LLAVE)
      const o = s ? JSON.parse(s) : null
      if (o?.test) {
        setTest(o.test); setProto(o.proto || {}); setMed(o.med || {})
        setAtletas(o.atletas?.length ? o.atletas : ['Deportista'])
        setVista(o.vista === 'pasar' ? 'pasar' : 'editor')
        setPaso(Math.min(4, Math.max(1, o.paso || 1)))
      }
    } catch { /* ventana privada: se empieza de cero y ya */ }
    setSuena(pitidoEncendido())
    setCargado(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!cargado) return
    try { localStorage.setItem(LLAVE, JSON.stringify({ test, proto, med, atletas, vista, paso })) } catch { /* nada */ }
  }, [cargado, test, proto, med, atletas, vista, paso])

  // ---------- el latido del reloj ----------
  useEffect(() => {
    if (!reloj?.corre) return
    const id = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(id)
  }, [reloj?.corre])

  /* El pitido va en un efecto sin lista de dependencias a propósito: corre en
     cada repintado —diez veces por segundo mientras el reloj anda— y es la
     comparación con lo anterior quien decide. Con lista habría que acertar a
     meter ahí el tiempo, y un despiste lo dejaría mudo. */
  useEffect(() => {
    if (!test || !reloj?.corre || vista !== 'pasar') return
    const ms = ahora - reloj.desde + reloj.acu
    const datos = datosDe(cajaActiva)
    for (const bl of escalonadosDe(test)) {
      if (reloj.clave !== '@' + bl.clave) continue
      const dur = duracionDe(bl)
      const n = escalonAhora(bl, ms)
      const dentroMs = ms % (dur * 1000)
      const dentro = Math.floor(dentroMs / 1000)

      // 1. Al CAMBIAR. Nunca en el primero: ese no es un cambio, es la salida.
      const previo = escPrevio.current[bl.clave]
      const cambioEscalon = previo !== undefined && previo !== n
      if (cambioEscalon && bl.pitaCambio !== false) pitar(880, 220)
      escPrevio.current[bl.clave] = n

      /* 1b. Y al pasar de un tramo a otro dentro de la repetición: en el 30-15
         es la señal de dejar de correr, que es medio test. Se calla si el
         escalón acaba de cambiar, porque eso ya ha sonado. */
      const tr = tramoEn(bl, dentroMs)
      if (tr) {
        const prevTr = tramoPrevio.current[bl.clave]
        if (!cambioEscalon && prevTr !== undefined && prevTr !== tr.indice) pitar(1100, 130)
        tramoPrevio.current[bl.clave] = tr.indice
      }

      // 2. El aviso de que queda poco: más agudo y más corto, para no confundirlo.
      if ((bl.avisoAntes || 0) > 0) {
        const quedan = dur - dentro
        const llave = bl.clave + ':' + n
        if (quedan <= (bl.avisoAntes || 0) && quedan > 0 && !avisado.current[llave]) {
          pitar(1400, 70); avisado.current[llave] = true
        }
      }

      // 3. El ritmo dentro: es la course navette.
      const iv = intervaloRitmo(bl, n, datos)
      if (iv > 0) {
        const cuantos = Math.floor(dentroMs / iv)
        const lv = bl.clave + ':' + n
        if (ritmoPrevio.current[lv] === undefined) ritmoPrevio.current[lv] = cuantos
        else if (ritmoPrevio.current[lv] !== cuantos) { pitar(660, 60); ritmoPrevio.current[lv] = cuantos }
      }
    }
  })

  // ---------- cambiar cosas ----------
  const mut = (fn: (t: TestLab) => void) => setTest(t0 => { const t = clon(t0!); fn(t); return t })
  const ponMed = (a: string, fn: (d: Datos) => void) =>
    setMed(m0 => { const m = { ...m0 }; const d = { ...(m[a] || {}) }; fn(d); m[a] = d; return m })

  const cajasVacias = (t: TestLab, gente: Atleta[]): Record<string, Datos> => {
    const m: Record<string, Datos> = { [PRUEBA]: medVacia(t) }
    for (const a of gente) m[String(a.id)] = medVacia(t)
    return m
  }

  const empezarCon = (t: TestLab, conPaso: number, id: number | null = null) => {
    setTest(t); setProto(protoVacio(t))
    setAtletas([]); setMed(cajasVacias(t, [])); setActivo(0)
    setEditandoId(id)
    marcas.current = {}; setReloj(null); setPidiendo(null)
    setPaso(conPaso); setVista('editor')
  }

  const vaciarDatos = () => {
    if (!test) return
    setProto(protoVacio(test))
    setMed(cajasVacias(test, atletas)); marcas.current = {}; setReloj(null)
  }

  // ---------- la base ----------
  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) return
    setUserId(user.id)
    const [{ data: defs }, { data: deps }] = await Promise.all([
      /* Se piden TODAS las columnas y no una lista: si la columna «modelo»
         todavía no existe en esta base, pedirla por su nombre daría un error de
         consulta y la pantalla entera se quedaría en blanco. Así, simplemente
         no hay tests del modelo nuevo y el laboratorio sigue sirviendo para
         montar y probar. */
      supabase.from('test_definicion').select('*').eq('id_entrenador', user.id)
        .eq('archivado', false).order('created_at', { ascending: false }),
      supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id)
        .eq('solo_test', false).order('nombre'),
    ])
    const ids: number[] = []
    const mios: Guardado[] = []
    for (const d of (defs || []) as Record<string, unknown>[]) {
      const def = leerModelo(d.modelo, String(d.nombre || ''), String(d.deporte || 'Carrera'))
      /* Sin modelo es un test de /tests-propios: aquí ni se ofrece, para no
         enseñar una versión mutilada de algo que allí está entero. */
      if (!def) continue
      mios.push({ id: Number(d.id), nombre: String(d.nombre || ''), deporte: String(d.deporte || ''), def, mediciones: 0 })
      ids.push(Number(d.id))
    }
    if (ids.length) {
      /* Cuántas mediciones tiene cada uno, en UNA consulta y no una por test. */
      const { data: meds } = await supabase.from('test_medicion').select('id_definicion').in('id_definicion', ids)
      const cuenta: Record<number, number> = {}
      for (const m of (meds || []) as { id_definicion: number }[]) cuenta[m.id_definicion] = (cuenta[m.id_definicion] || 0) + 1
      for (const g of mios) g.mediciones = cuenta[g.id] || 0
    }
    setGuardados(mios)
    setDeportistas(((deps || []) as { id: number; nombre: string }[]).map(d => ({ id: d.id, nombre: d.nombre })))
  }

  /* Se pide al montar y nada más: la lista se refresca a mano después de
     guardar, que es cuando puede haber cambiado.
     La regla del compilador ve una llamada que acaba en `setState` y avisa,
     pero aquí el estado se pone DESPUÉS de que conteste la base — que es
     exactamente el caso que la propia regla admite. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [])

  const verHistorial = async (idAtleta: number) => {
    setAtletaHist(idAtleta)
    if (!editandoId) return
    setCargandoHist(true)
    const { data } = await supabase.from('test_medicion')
      .select('fecha, datos').eq('id_definicion', editandoId).eq('id_deportista', idAtleta)
      .order('fecha', { ascending: true })
    setMediciones(leerMediciones(data))
    setCargandoHist(false)
  }

  /* Escribe la referencia del atleta, de la que salen TODAS las zonas que
     calcula la aplicación. Reusa `fijarZonas`, el mismo camino que usan los
     tests de la batería: un segundo sitio escribiendo en esas columnas acabaría
     guardando cosas distintas. */
  const fijarConEsto = async (indice: number, fechaMed: string) => {
    if (!test || !editandoId || !atletaHist) return
    const orden = [...mediciones].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const ultima = orden[orden.length - 1]
    if (!ultima) return
    /* Con la penúltima detrás, que es lo que ve el entrenador en la tabla: si
       el resultado compara con el test anterior, el número que se fija tiene
       que ser el mismo que está mirando. */
    const p = propuestaLab(test, indice, ultima.datos, orden[orden.length - 2]?.datos ?? null)
    if (!p) { decir('mal', 'Ese resultado no puede fijar la referencia'); return }
    setGuardando(true)
    const r = await fijarZonas(supabase, atletaHist, fechaMed, p, origenDe(editandoId))
    setGuardando(false)
    if (r.error) { decir('mal', 'No se pudo fijar: ' + r.error); return }
    decir('ok', p.destino.nombre + ' fijada en ' + p.texto + (r.sinOrigen ? ' (sin guardar el origen)' : ''))
  }

  const guardarTest = async () => {
    if (!test || !userId) return
    if (pegasDe(test).length) { decir('mal', 'Hay cosas por arreglar antes de guardarlo'); return }
    setGuardando(true)
    const fila = paraGuardar(test, userId)
    const { data, error } = editandoId
      ? await supabase.from('test_definicion').update(fila).eq('id', editandoId).select('id').single()
      : await supabase.from('test_definicion').insert(fila).select('id').single()
    setGuardando(false)
    if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return }
    if (data?.id) setEditandoId(Number(data.id))
    decir('ok', editandoId ? 'Test actualizado.' : 'Test creado.')
    await cargar()
  }

  /* Una fila por persona que tenga algo escrito.
     El protocolo va DENTRO de cada medición: dos tests que arrancaron con
     distinto incremento no son comparables, y si viviera solo en la definición,
     cambiarlo mañana reescribiría en silencio todas las del pasado. */
  const guardarMediciones = async () => {
    if (!test || !editandoId) { decir('mal', 'Guarda antes el test'); return }
    const conDatos = atletas.filter(a => Object.values(med[String(a.id)] || {}).some(v =>
      Array.isArray(v) ? v.some(x => String(x ?? '').trim() !== '') : String(v ?? '').trim() !== ''))
    if (!conDatos.length) { decir('mal', 'Todavía no hay nada que guardar'); return }

    setGuardando(true)
    const filas = conDatos.map(a => ({
      id_definicion: editandoId, id_deportista: a.id, fecha,
      datos: medicionDe(proto, med[String(a.id)] || {}),
    }))
    /* Repetir el mismo día es CORREGIR, no apuntar dos veces: lo respalda el
       índice único de la tabla y esto solo evita que acabe en un error. */
    const { error } = await supabase.from('test_medicion').upsert(filas, { onConflict: 'id_definicion,id_deportista,fecha' })
    setGuardando(false)
    if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return }
    decir('ok', conDatos.length === 1 ? 'Medición guardada.' : conDatos.length + ' mediciones guardadas.')
    await cargar()
  }

  /* Renombrar arrastra las fórmulas, los datos y las referencias de las
     progresiones: dejar el nombre viejo sería romper la cadena a propósito. */
  const renombrar = (c: Columna, nuevo: string, bl: Bloque | null) => {
    const viejo = c.clave
    if (viejo === nuevo) return
    mut(t => {
      const destino = bl
        ? t.bloques.find(b => b.clave === bl.clave)?.columnas.find(x => x.clave === viejo)
        : t.sueltos.find(x => x.clave === viejo)
      if (destino) destino.clave = nuevo
      for (const r of t.resultados) for (const b of r.formula) {
        if (b.t === 'var' && b.v === viejo) b.v = nuevo
        if (b.t === 'fn' && b.de === viejo) b.de = nuevo
      }
      for (const x of todasLasColumnas(t)) {
        if (x.c.desdeRef === viejo) x.c.desdeRef = nuevo
        if (x.c.pasoRef === viejo) x.c.pasoRef = nuevo
      }
    })
    if (c.clase === 'dada' && !bl) {
      setProto(p => { const n = { ...p }; n[nuevo] = n[viejo]; delete n[viejo]; return n })
    }
    setMed(m0 => {
      const m: Record<string, Datos> = {}
      for (const a of Object.keys(m0)) {
        const d = { ...m0[a] }
        if (d[viejo] !== undefined) { d[nuevo] = d[viejo]; delete d[viejo] }
        if (d['@' + viejo] !== undefined) { d['@' + nuevo] = d['@' + viejo]; delete d['@' + viejo] }
        m[a] = d
      }
      return m
    })
  }

  if (!cargado) return <main className="min-h-screen bg-gray-950 text-gray-500 grid place-items-center">Cargando…</main>

  // ============================================================
  // Pantallas
  // ============================================================
  const cabecera = (
    <nav className="bg-gray-900 pl-16 pr-4 sm:pr-6 py-3 flex justify-between items-center border-b border-gray-800 gap-3">
      <span className="text-sm text-gray-500 truncate">
        Laboratorio
        <span className="ml-2 text-[10px] uppercase tracking-wider text-violet-300 border border-violet-400/40 bg-violet-500/10 rounded-full px-2 py-0.5">
          en pruebas
        </span>
      </span>
      <div className="flex gap-2 flex-shrink-0">
        {vista !== 'plantillas' && (
          <button onClick={() => { setVista('plantillas'); setPidiendo(null) }} className={btnSec + ' ' + btnMini}>← Otro test</button>
        )}
        {vista === 'editor' && (
          <button onClick={guardarTest} disabled={guardando} className={btnSec + ' ' + btnMini}>
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Guardar test'}
          </button>
        )}
        {vista === 'editor' && editandoId !== null && (
          <button onClick={() => { setVista('historial'); if (atletaHist) verHistorial(atletaHist) }}
            className={btnSec + ' ' + btnMini}>Cómo va →</button>
        )}
        {vista === 'editor' && <button onClick={() => setVista('pasar')} className={btn + ' ' + btnMini}>Pasar el test →</button>}
        {vista === 'historial' && <button onClick={() => setVista('editor')} className={btnSec + ' ' + btnMini}>← Al editor</button>}
        {vista === 'pasar' && <button onClick={() => setVista('editor')} className={btnSec + ' ' + btnMini}>← Al editor</button>}
        <button onClick={() => router.push('/tests-propios')} className="text-gray-400 hover:text-white text-[13px] transition">Salir</button>
      </div>
    </nav>
  )

  if (vista === 'plantillas' || !test) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        {cabecera}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
          <div className={tarjeta}>
            <p className="font-bold text-[15px]">¿Qué test quieres montar?</p>
            <p className="text-gray-500 text-xs mt-1">
              Elige el que más se parezca y lo cambias, o empieza con la hoja en blanco. Las plantillas
              no encierran: una vez dentro, todo se toca.
            </p>
          </div>
          {guardados.length > 0 && (
            <div className={tarjeta}>
              <p className="font-bold text-[15px]">Tus tests</p>
              <p className="text-gray-500 text-xs mt-1">Los que ya has montado aquí. Se abren para seguir tocándolos o para pasarlos.</p>
              <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
                {guardados.map(g => (
                  <button key={g.id} onClick={() => empezarCon(clon(g.def), 4, g.id)}
                    className="bg-[#0d1420] border border-gray-800 hover:border-orange-500 rounded-xl p-3 text-left flex flex-col gap-1 transition">
                    <span className="font-semibold text-[13.5px]">{g.nombre}</span>
                    <span className="text-[11.5px] text-gray-500">
                      {g.deporte} · {g.mediciones === 0 ? 'sin pasar todavía' : g.mediciones + (g.mediciones === 1 ? ' medición' : ' mediciones')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
            {PLANTILLAS.map(p => (
              <button key={p.id} onClick={() => empezarCon(clon(p.test), 2)}
                className="bg-gray-900 border border-gray-800 hover:border-orange-500 hover:bg-[#141d2b] rounded-xl p-4 text-left flex flex-col gap-1.5 transition">
                <span className="font-semibold text-[14px]">{p.nombre}</span>
                <span className="text-[12px] text-gray-400 leading-snug">{p.descripcion}</span>
                <span className="font-mono text-[11px] text-gray-600 mt-1">{p.distintivo}</span>
              </button>
            ))}
            <button onClick={() => empezarCon(clon(TEST_VACIO), 1)}
              className="bg-gray-900 border border-dashed border-gray-700 hover:border-violet-400 rounded-xl p-4 text-left flex flex-col gap-1.5 transition">
              <span className="font-semibold text-[14px]">Desde cero</span>
              <span className="text-[12px] text-gray-400 leading-snug">
                La hoja en blanco. Tú decides si tiene repeticiones y qué se apunta en cada una.
              </span>
              <span className="font-mono text-[11px] text-gray-600 mt-1">sin nada puesto</span>
            </button>
          </div>
        </div>
      </main>
    )
  }

  const pegas = pegasDe(test)
  const previa = (
    <Previa test={test} proto={proto} med={med[cajaActiva] || {}} nombre={nombreActivo}
      onProto={(k, v) => setProto(p => ({ ...p, [k]: v }))}
      onMed={(k, v, i) => ponMed(cajaActiva, d => {
        if (i === undefined) { d[k] = v; return }
        const l = Array.isArray(d[k]) ? [...(d[k] as string[])] : []
        l[i] = v; d[k] = l
      })}
      onLlego={(bl, n) => ponMed(cajaActiva, d => { d['@' + bl] = Number(d['@' + bl]) === n ? '' : n })} />
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {cabecera}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
        {aviso && (
          <div className={'mb-4 px-4 py-2.5 rounded-xl text-[13px] border ' + (aviso.tipo === 'ok'
            ? 'bg-green-500/10 border-green-500/30 text-green-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300')}>{aviso.texto}</div>
        )}
        {vista === 'editor' ? (
          <>
            <div className="flex gap-1.5 flex-wrap mb-4">
              {['Forma', 'Qué se apunta', 'Qué sale', 'Probarlo'].map((n, i) => {
                const hecho = [!!test.nombre, test.sueltos.length + test.bloques.length > 0, test.resultados.length > 0, false][i]
                const on = paso === i + 1
                return (
                  <button key={n} onClick={() => { setPaso(i + 1); setPidiendo(null) }}
                    className={'flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition border ' +
                      (on ? 'bg-orange-500/14 border-orange-500/50 text-orange-300' : 'bg-gray-800 border-transparent text-gray-400 hover:text-gray-200')}>
                    <span className={'w-[19px] h-[19px] rounded-md grid place-items-center font-mono text-[10.5px] ' +
                      (on ? 'bg-orange-500 text-[#1a0d02]' : hecho ? 'bg-green-500/20 text-green-400' : 'bg-[#0f1724]')}>
                      {hecho && !on ? '✓' : i + 1}
                    </span>
                    {n}
                  </button>
                )
              })}
            </div>

            <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
              <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
                <div>
                  {paso === 1 && <Paso1 test={test} mut={mut} />}
                  {paso === 2 && <Paso2 test={test} mut={mut} renombrar={renombrar} proto={proto}
                    setProto={setProto} cajas={Object.keys(med)} setMed={setMed}
                    pidiendo={pidiendo} setPidiendo={setPidiendo} />}
                  {paso === 3 && <Paso3 test={test} mut={mut} datos={datosDe(cajaActiva)}
                    pidiendo={pidiendo} setPidiendo={setPidiendo} />}
                  {paso === 4 && (
                    <div className={tarjeta}>
                      <p className="font-bold text-[15px]">4 · Pruébalo</p>
                      <p className="text-gray-500 text-xs mt-1">
                        Rellena la tabla de al lado como si estuvieras pasando el test. Los resultados salen mientras escribes.
                      </p>
                      <div className="mt-3 rounded-lg border border-blue-400/25 bg-blue-500/[0.07] px-3 py-2.5 text-[12px] text-blue-100 leading-snug">
                        Lo que ves a la derecha es <b>exactamente</b> lo que te vas a encontrar el día que lo pases,
                        con una persona. Para varias, entra en «Pasar el test».
                      </div>
                      <div className="flex gap-2 flex-wrap mt-3">
                        <button onClick={() => setVista('pasar')} className={btn}>Pasarlo de verdad, con reloj →</button>
                        <button onClick={vaciarDatos} className={btnSec}>Vaciar lo escrito</button>
                      </div>
                    </div>
                  )}
                  {pegas.length > 0 && (
                    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-2.5 text-[12px] text-red-200 leading-snug">
                      {pegas.map((p, i) => <p key={i}>· {p.texto}</p>)}
                    </div>
                  )}
                </div>
                <div className="lg:sticky lg:top-4">{previa}</div>
              </div>
            </div>
          </>
        ) : vista === 'historial' ? (
          <Historial
            test={test} deportistas={deportistas}
            atleta={atletaHist} setAtleta={verHistorial}
            mediciones={mediciones} cargando={cargandoHist} guardando={guardando}
            onFijar={fijarConEsto} />
        ) : (
          <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
            <Pasar
              test={test} atletas={atletas} activo={activo} setActivo={setActivo}
              deportistas={deportistas} guardado={editandoId !== null}
              fecha={fecha} setFecha={setFecha} guardando={guardando}
              onGuardarMediciones={guardarMediciones}
              datosDe={datosDe} reloj={reloj} setReloj={setReloj} ahora={ahora}
              suena={suena}
              onSonido={() => { const v = !suena; setSuena(v); ponPitido(v); if (v) { despertarAudio(); pitar(880, 100) } }}
              onAtleta={a => {
                if (atletas.some(x => x.id === a.id)) return
                setAtletas(l => [...l, a])
                setMed(m => ({ ...m, [String(a.id)]: medVacia(test) }))
                setActivo(atletas.length)
              }}
              onQuitaAtleta={i => {
                const a = atletas[i]
                setAtletas(l => l.filter((_, k) => k !== i))
                setMed(m => { const x = { ...m }; delete x[String(a.id)]; return x })
                setActivo(v => Math.max(0, Math.min(v, atletas.length - 2)))
              }}
              onBajo={(bl, a) => {
                const ms = reloj && reloj.clave === '@' + bl.clave ? (reloj.corre ? ahora - reloj.desde + reloj.acu : reloj.acu) : 0
                const esn = escalonAhora(bl, ms)
                const dentro = Math.floor(ms / 1000) % duracionDe(bl)
                ponMed(String(a.id), d => {
                  /* El último COMPLETO, no el que iba: ese no lo terminó, y sus
                     segundos son justo el otro dato. */
                  d['@' + bl.clave] = Math.max(0, esn - 1)
                  const ag = buscaCol(test, 'aguanto')
                  if (ag && !ag.bl && ag.c.clase !== 'dada') d['aguanto'] = String(dentro)
                })
              }}
              onVuelta={(c, bl, a) => {
                if (!reloj?.corre || reloj.clave !== c.clave) return
                const k = String(a.id)
                const ms = ahora - reloj.desde + reloj.acu
                if (!marcas.current[k]) marcas.current[k] = {}
                const lista = marcas.current[k][c.clave] || (marcas.current[k][c.clave] = [])
                if (lista.length >= bl.veces) return
                /* La marca que se guarda es la del RELOJ COMPARTIDO, y el tiempo
                   de cada repetición es la resta con la anterior DE ESA PERSONA:
                   restar contra el reloj le daría a todos el del más rápido. */
                const previo = lista.length ? lista[lista.length - 1] : 0
                const dur = ms - previo
                if (dur <= 0) return
                lista.push(ms)
                const val = c.instrumento === 'crono-min' ? Math.round(dur / 600) / 100 : Math.round(dur / 100) / 10
                ponMed(k, d => {
                  const l = Array.isArray(d[c.clave]) ? [...(d[c.clave] as string[])] : []
                  l[lista.length - 1] = String(val); d[c.clave] = l
                })
              }}
              onDeshace={(c, a) => {
                const k = String(a.id)
                const lista = marcas.current[k]?.[c.clave]
                if (!lista?.length) return
                lista.pop()
                ponMed(k, d => {
                  const l = Array.isArray(d[c.clave]) ? [...(d[c.clave] as string[])] : []
                  l[lista.length] = ''; d[c.clave] = l
                })
              }}
              onReinicia={(c, bl) => {
                setReloj(null)
                for (const a of atletas) {
                  const k = String(a.id)
                  if (marcas.current[k]) marcas.current[k][c.clave] = []
                  ponMed(k, d => { d[c.clave] = Array.from({ length: bl.veces }, () => '') })
                }
              }}
              onReiniciaEsc={bl => {
                setReloj(null); escPrevio.current = {}; avisado.current = {}; ritmoPrevio.current = {}
                for (const a of atletas) ponMed(String(a.id), d => { delete d['@' + bl.clave] })
              }}
              onArranca={clave => {
                despertarAudio()
                setReloj(r => {
                  const base = r && r.clave === clave ? r : { clave, desde: 0, acu: 0, corre: false }
                  return base.corre
                    ? { ...base, acu: base.acu + (Date.now() - base.desde), corre: false }
                    : { ...base, desde: Date.now(), corre: true }
                })
                escPrevio.current = {}; avisado.current = {}; ritmoPrevio.current = {}
                setAhora(Date.now())
              }} />
            <div className="lg:sticky lg:top-4">{previa}</div>
          </div>
        )}
      </div>
    </main>
  )
}

// ============================================================
// 1 · Cómo es el test
// ============================================================
function Paso1({ test, mut }: { test: TestLab; mut: (fn: (t: TestLab) => void) => void }) {
  const forma = test.bloques.length ? (test.sueltos.length ? 'mixto' : 'reps') : 'una'
  return (
    <div className={tarjeta}>
      <p className="font-bold text-[15px]">1 · Cómo es el test</p>
      <p className="text-gray-500 text-xs mt-1">De aquí sale la forma de todo lo demás.</p>
      <div className={rejilla + ' mt-3'} style={REJILLA}>
        <div>
          <label className={lab} htmlFor="lab-nom">Se llama</label>
          <input id="lab-nom" className={campo} value={test.nombre} placeholder="6×100 crol"
            onChange={e => mut(t => { t.nombre = e.target.value })} />
        </div>
        <div>
          <label className={lab} htmlFor="lab-dep">Deporte</label>
          <select id="lab-dep" className={campo} value={test.deporte} onChange={e => mut(t => { t.deporte = e.target.value })}>
            {DEPORTES.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <p className="text-gray-400 text-[11.5px] leading-snug mt-3 pt-3 border-t border-dashed border-gray-800">
        Ahora mismo este test{' '}
        {forma === 'una' ? <><b className="text-white">se mide de una vez</b>: unas casillas y ya.</>
          : forma === 'reps' ? <><b className="text-white">va por repeticiones</b>: {test.bloques.length} bloque{test.bloques.length === 1 ? '' : 's'}.</>
            : <><b className="text-white">tiene las dos cosas</b>: casillas sueltas y repeticiones.</>}
        {' '}Eso se decide en el paso 2 añadiendo casillas o bloques — no hay que elegirlo antes de tiempo.
      </p>
    </div>
  )
}

// ============================================================
// 2 · Qué se apunta
// ============================================================
function Paso2({ test, mut, renombrar, proto, setProto, cajas, setMed, pidiendo, setPidiendo }: {
  test: TestLab
  mut: (fn: (t: TestLab) => void) => void
  renombrar: (c: Columna, nuevo: string, bl: Bloque | null) => void
  proto: Datos
  setProto: (f: (d: Datos) => Datos) => void
  /** Todas las cajas de datos: la de pruebas y la de cada deportista. */
  cajas: string[]
  setMed: (f: (m: Record<string, Datos>) => Record<string, Datos>) => void
  pidiendo: Pidiendo | null
  setPidiendo: (p: Pidiendo | null) => void
}) {
  const repes = clavesRepetidas(test)

  const nuevaMedida = (clave: string, veces: number) =>
    setMed(m0 => {
      const m = { ...m0 }
      for (const a of cajas) m[a] = { ...(m[a] || {}), [clave]: Array.from({ length: veces }, () => '') }
      return m
    })
  const sinMedida = (clave: string) =>
    setMed(m0 => {
      const m: Record<string, Datos> = {}
      for (const a of Object.keys(m0)) { const d = { ...m0[a] }; delete d[clave]; m[a] = d }
      return m
    })

  return (
    <div className={tarjeta}>
      <p className="font-bold text-[15px]">2 · Qué se apunta</p>
      <p className="text-gray-500 text-xs mt-1 leading-snug">
        Todo es <b className="text-blue-300">dado</b> (lo pones tú, igual para todos) o{' '}
        <b className="text-orange-300">medido</b> (lo tomas, y es de cada uno). Un bloque es algo que se
        repite, y lo de dentro comparte repetición.
      </p>

      <div className="mt-4">
        {test.sueltos.map((c, i) => (
          <FilaColumna key={i} c={c} bl={null} test={test}
            onCambio={(k, v) => mut(t => {
              const x = t.sueltos[i]
              if (k === 'clase') {
                x.clase = v as Columna['clase']
                if (v === 'dada' && !x.valor) x.valor = ''
              } else (x as unknown as Record<string, unknown>)[k] = v
            })}
            onClase={v => {
              /* Cambiar de clase mueve el dato de sitio: lo del protocolo es de
                 todos y lo medido de cada uno. Un valor en la caja equivocada
                 no lo vería nadie, así que se empieza limpio. */
              if (v === 'dada') {
                setMed(m0 => { const m: Record<string, Datos> = {}; for (const a of Object.keys(m0)) { const d = { ...m0[a] }; delete d[c.clave]; m[a] = d } return m })
                setProto(p => ({ ...p, [c.clave]: c.valor || '' }))
              } else {
                setProto(p => { const n = { ...p }; delete n[c.clave]; return n })
                setMed(m0 => { const m: Record<string, Datos> = {}; for (const a of Object.keys(m0)) m[a] = { ...m0[a], [c.clave]: '' }; return m })
              }
            }}
            onRenombra={n => renombrar(c, n, null)}
            onQuita={() => {
              mut(t => { t.sueltos.splice(i, 1) })
              setProto(p => { const n = { ...p }; delete n[c.clave]; return n })
              setMed(m0 => { const m: Record<string, Datos> = {}; for (const a of Object.keys(m0)) { const d = { ...m0[a] }; delete d[c.clave]; m[a] = d } return m })
            }}
            proto={proto} />
        ))}

        {test.bloques.map((bl, bi) => (
          <div key={bi} className={caja}>
            <h4 className="flex items-center gap-2 flex-wrap text-[12.5px] font-bold mb-2.5">
              <Pildora tono="blo">Bloque</Pildora>
              {bl.etiqueta || 'Repetición'}
              <button onClick={() => {
                mut(t => { t.bloques.splice(bi, 1) })
                setMed(m0 => {
                  const m: Record<string, Datos> = {}
                  for (const a of Object.keys(m0)) { const d = { ...m0[a] }; for (const c of bl.columnas) delete d[c.clave]; m[a] = d }
                  return m
                })
              }} className="ml-auto text-gray-600 hover:text-red-400 px-1">×</button>
            </h4>

            <div className={rejilla} style={REJILLA}>
              <div>
                <label className={lab} htmlFor={'b' + bi + 'e'}>Cada repetición es…</label>
                <input id={'b' + bi + 'e'} className={campo} value={bl.etiqueta}
                  onChange={e => mut(t => { t.bloques[bi].etiqueta = e.target.value })} />
              </div>
              <div>
                <label className={lab} htmlFor={'b' + bi + 'm'}>Cuántas hay</label>
                <select id={'b' + bi + 'm'} className={campo} value={bl.modo}
                  onChange={e => mut(t => { t.bloques[bi].modo = e.target.value as Bloque['modo'] })}>
                  <option value="cerrado">Un número fijo</option>
                  <option value="abierto">Hasta que se pare</option>
                </select>
              </div>
              <div>
                <label className={lab} htmlFor={'b' + bi + 'v'}>{bl.modo === 'cerrado' ? 'Repeticiones' : 'Como mucho'}</label>
                <input id={'b' + bi + 'v'} type="number" min={1} max={MAX_VECES} className={campo} value={bl.veces}
                  onChange={e => {
                    const n = Math.max(1, Math.min(MAX_VECES, Math.round(Number(e.target.value) || 1)))
                    mut(t => { t.bloques[bi].veces = n })
                    setMed(m0 => {
                      const m: Record<string, Datos> = {}
                      for (const a of Object.keys(m0)) {
                        const d = { ...m0[a] }
                        for (const c of bl.columnas) {
                          if (c.clase === 'dada') continue
                          const l = (d[c.clave] as string[]) || []
                          d[c.clave] = Array.from({ length: n }, (_, k) => l[k] || '')
                        }
                        m[a] = d
                      }
                      return m
                    })
                  }} />
              </div>
            </div>

            <RelojBloque bl={bl} bi={bi} mut={mut} proto={proto}
              onProgresion={() => {
                const clave = nuevaClave(test, 'intensidad')
                mut(t => {
                  t.bloques[bi].columnas.unshift(col({
                    clave, etiqueta: 'Intensidad', unidad: 'km/h', clase: 'dada',
                    tipo: 'progresion', desde: 8, paso: 0.5,
                  }))
                })
              }} />

            <p className="text-gray-400 text-[11.5px] leading-snug mt-2.5 pt-2.5 border-t border-dashed border-gray-800">
              {bl.modo === 'cerrado'
                ? <>Fijo: si al acabar falta alguna, <b className="text-white">es un fallo de toma de datos</b> y los resultados que la usen no se calculan.</>
                : <>Abierto: se para donde se pare y <b className="text-white">cuántas hubo es un dato</b>. Al pasarlo marcas hasta dónde llegó cada uno.</>}
            </p>

            <div className="mt-3 flex flex-col gap-2.5">
              {bl.columnas.map((c, ci) => (
                <FilaColumna key={ci} c={c} bl={bl} indice={ci} test={test} proto={proto}
                  pidiendo={pidiendo} setPidiendo={setPidiendo}
                  onCambio={(k, v) => mut(t => { (t.bloques[bi].columnas[ci] as unknown as Record<string, unknown>)[k] = v })}
                  onClase={v => {
                    mut(t => {
                      const x = t.bloques[bi].columnas[ci]
                      x.clase = v as Columna['clase']
                      if (v === 'dada' && !x.tipo) x.tipo = 'progresion'
                      if (v === 'calculada' && !x.formula) x.formula = []
                    })
                    /* Solo lo MEDIDO lleva casillas. Una dada sale del protocolo
                       y una calculada de su fila: dejarles una casilla sería
                       invitar a escribir encima de algo que se recalcula. */
                    if (v === 'medida') nuevaMedida(c.clave, bl.veces)
                    else sinMedida(c.clave)
                  }}
                  onRenombra={n => renombrar(c, n, bl)}
                  onQuita={() => {
                    if (bl.columnas.length === 1) { alert('Un bloque sin columnas no mide nada. Quita el bloque entero.'); return }
                    mut(t => { t.bloques[bi].columnas.splice(ci, 1) })
                    setMed(m0 => { const m: Record<string, Datos> = {}; for (const a of Object.keys(m0)) { const d = { ...m0[a] }; delete d[c.clave]; m[a] = d } return m })
                  }} />
              ))}
              <button onClick={() => {
                const clave = nuevaClave(test, 'medida')
                mut(t => { t.bloques[bi].columnas.push(col({ clave, etiqueta: 'Otra cosa' })) })
                nuevaMedida(clave, bl.veces)
              }} className={btnSec + ' ' + btnMini + ' self-start'}>+ Añadir columna a este bloque</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => {
          const clave = nuevaClave(test, 'dato')
          mut(t => { t.sueltos.push(col({ clave, etiqueta: 'Nuevo dato' })) })
          setMed(m0 => { const m: Record<string, Datos> = {}; for (const a of Object.keys(m0)) m[a] = { ...m0[a], [clave]: '' }; return m })
        }} className={btnSec}>+ Casilla suelta</button>
        <button onClick={() => {
          const clave = nuevaClave(test, 'medida')
          mut(t => {
            t.bloques.push({
              clave: 'b' + (t.bloques.length + 1), etiqueta: 'Repetición', modo: 'cerrado',
              veces: 6, duracion: 0, columnas: [col({ clave, etiqueta: 'Lo que mides' })],
            })
          })
          nuevaMedida(clave, 6)
        }} className={btnSec}>+ Bloque de repeticiones</button>
      </div>

      {repes.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-2.5 text-[12px] text-red-200 leading-snug">
          Hay claves repetidas: <b>{repes.join(', ')}</b>. Las fórmulas llaman a cada casilla por su clave,
          así que dos iguales harían que una tapara a la otra.
        </div>
      )}
    </div>
  )
}

function Pildora({ tono, children }: { tono: 'blo' | 'dada' | 'med'; children: React.ReactNode }) {
  const c = tono === 'blo' ? 'text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/10'
    : tono === 'dada' ? 'text-blue-300 border-blue-400/40 bg-blue-500/10'
      : 'text-orange-300 border-orange-500/40 bg-orange-500/10'
  return <span className={'text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ' + c}>{children}</span>
}

/** Una casilla suelta o una columna de un bloque: se editan igual. */
function FilaColumna({ c, bl, indice, test, proto, onCambio, onClase, onRenombra, onQuita, pidiendo, setPidiendo }: {
  c: Columna
  bl: Bloque | null
  /** Qué puesto ocupa en su bloque: una calculada solo ve lo que va antes. */
  indice?: number
  test: TestLab
  proto: Datos
  onCambio: (campo: string, valor: unknown) => void
  onClase: (v: string) => void
  onRenombra: (nuevo: string) => void
  onQuita: () => void
  pidiendo?: Pidiendo | null
  setPidiendo?: (p: Pidiendo | null) => void
}) {
  const dada = c.clase === 'dada'
  const calc = c.clase === 'calculada'
  const id = (bl ? bl.clave : 's') + '-' + c.clave
  const dados = test.sueltos.filter(s => s.clase === 'dada' && s.clave)

  return (
    <div className={bl ? 'border border-gray-800 rounded-lg p-2.5 bg-[#0b1220]' : caja}>
      <h4 className="flex items-center gap-2 flex-wrap text-[12.5px] font-bold mb-2.5">
        <Pildora tono={calc ? 'blo' : dada ? 'dada' : 'med'}>
          {calc ? 'La calcula la app' : dada ? (bl ? 'La pones tú' : 'Del protocolo') : bl ? 'La mides' : 'Se mide'}
        </Pildora>
        {c.etiqueta || c.clave}
        <button onClick={onQuita} className="ml-auto text-gray-600 hover:text-red-400 px-1">×</button>
      </h4>

      <div className={rejilla} style={REJILLA}>
        <div>
          <label className={lab} htmlFor={id + '-k'}>Clave</label>
          <input id={id + '-k'} className={campo + ' font-mono'} value={c.clave} onChange={e => onRenombra(e.target.value)} />
        </div>
        <div>
          <label className={lab} htmlFor={id + '-e'}>Lo que verás</label>
          <input id={id + '-e'} className={campo} value={c.etiqueta} onChange={e => onCambio('etiqueta', e.target.value)} />
        </div>
        <div>
          <label className={lab} htmlFor={id + '-u'}>Unidad</label>
          <input id={id + '-u'} className={campo} value={c.unidad} onChange={e => onCambio('unidad', e.target.value)} />
        </div>
        <div>
          <label className={lab} htmlFor={id + '-c'}>Qué clase es</label>
          <select id={id + '-c'} className={campo} value={c.clase} onChange={e => onClase(e.target.value)}>
            <option value="medida">{CLASES.medida}</option>
            <option value="dada">{CLASES.dada}</option>
            {/* Calculada solo dentro de un bloque: fuera, una casilla que sale
                de otras es justo lo que ya es un resultado. */}
            {bl && <option value="calculada">{CLASES.calculada}</option>}
          </select>
        </div>

        {!dada && !calc && (
          <div>
            <label className={lab} htmlFor={id + '-i'}>Cómo se rellena</label>
            <select id={id + '-i'} className={campo} value={c.instrumento}
              onChange={e => onCambio('instrumento', e.target.value as Instrumento)}>
              {(Object.keys(INSTRUMENTOS) as Instrumento[]).map(k => <option key={k} value={k}>{INSTRUMENTOS[k]}</option>)}
            </select>
          </div>
        )}
        {dada && !bl && (
          <div>
            <label className={lab} htmlFor={id + '-v'}>Valor por defecto</label>
            <input id={id + '-v'} className={campo + ' font-mono'} value={c.valor || ''} onChange={e => onCambio('valor', e.target.value)} />
          </div>
        )}
        {dada && bl && (
          <>
            <div>
              <label className={lab} htmlFor={id + '-t'}>Cómo se generan</label>
              <select id={id + '-t'} className={campo} value={c.tipo || 'progresion'} onChange={e => onCambio('tipo', e.target.value)}>
                <option value="progresion">Empieza en… y sube</option>
                <option value="lista">Una lista que escribo</option>
              </select>
            </div>
            {c.tipo === 'lista' ? (
              <div>
                <label className={lab} htmlFor={id + '-l'}>Separadas por comas</label>
                <input id={id + '-l'} className={campo} value={(c.etiquetas || []).join(', ')}
                  onChange={e => onCambio('etiquetas', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
              </div>
            ) : (
              <>
                <Origen id={id + '-d'} et="Empieza en" campo="desde" c={c} dados={dados} onCambio={onCambio} />
                <Origen id={id + '-p'} et="Y sube" campo="paso" c={c} dados={dados} onCambio={onCambio} />
              </>
            )}
          </>
        )}
      </div>

      {calc && bl && setPidiendo && (
        <div className="mt-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">De qué sale</p>
          {/* Aquí cada nombre vale UN número, el de su repetición, así que no se
              ofrecen funciones de serie: dentro de una fila no hay serie. */}
          <MontaFormula
            formula={c.formula || []} clave={'col:' + bl.clave + ':' + c.clave}
            escalares={test.sueltos.map(x => x.clave)
              .concat(bl.columnas.slice(0, indice ?? bl.columnas.length).map(x => x.clave))}
            series={[]} refs={[]}
            pidiendo={pidiendo ?? null} setPidiendo={setPidiendo}
            onCambio={f => onCambio('formula', f)} />
        </div>
      )}

      <p className="text-gray-400 text-[11.5px] leading-snug mt-2.5 pt-2.5 border-t border-dashed border-gray-800">
        {pistaCol(c, bl, proto)}
      </p>
    </div>
  )
}

/** «Empieza en» / «Y sube»: un número fijo, o el valor de una casilla. */
function Origen({ id, et, campo: cp, c, dados, onCambio }: {
  id: string; et: string; campo: 'desde' | 'paso'; c: Columna; dados: Columna[]
  onCambio: (campo: string, valor: unknown) => void
}) {
  const ref = (c[(cp + 'Ref') as 'desdeRef' | 'pasoRef']) || ''
  return (
    <div>
      <label className={lab} htmlFor={id}>{et}</label>
      <select id={id} className={campo + ' mb-1.5'} value={ref}
        onChange={e => onCambio(cp + 'Ref', e.target.value || undefined)}>
        <option value="">Un número fijo</option>
        {dados.map(s => <option key={s.clave} value={s.clave}>La casilla «{s.clave}»</option>)}
      </select>
      {!ref && (
        <input type="number" step="any" className={campo} value={c[cp] === undefined ? 0 : c[cp]}
          onChange={e => onCambio(cp, Number(e.target.value))} />
      )}
    </div>
  )
}

function pistaCol(c: Columna, bl: Bloque | null, proto: Datos): React.ReactNode {
  const n = bl ? bl.veces : 1
  if (c.clase === 'calculada') {
    return c.formula?.length
      ? <>Sale sola en <b className="text-white">cada repetición</b>, de las columnas de su fila. No hay casilla que rellenar: si escribieras encima, estarías tapando algo que se recalcula.</>
      : <><b className="text-amber-300">Todavía no sale de nada.</b> Móntale la fórmula aquí arriba con las columnas que van antes que ella.</>
  }
  if (c.clase === 'dada') {
    if (!bl) return <>La pones tú antes de empezar y vale <b className="text-white">para todos</b> los que hagan el test a la vez. Se guarda con la medición: dos tests que arrancaron distinto no son comparables, y sin guardarlo nadie sabría por qué.</>
    if (c.tipo === 'lista') return <>Sale ya puesta: <b className="text-white">{(c.etiquetas || []).slice(0, n).join(' · ') || '—'}</b>. No se teclea nada.</>
    const ej = [0, 1, 2].map(k => nEs(Number(valorDado(c, k, proto)))).join(' · ')
    return (
      <>Sale sola: <b className="text-white">{ej} …</b> hasta la {n}.ª. Empieza según {c.desdeRef ? <>la casilla «{c.desdeRef}»</> : 'un número fijo'} y sube según {c.pasoRef ? <>la casilla «{c.pasoRef}»</> : 'un número fijo'}.
        {(c.desdeRef || c.pasoRef) && <> <b className="text-white">Eso se puede cambiar antes de empezar</b> y se guarda con la medición.</>}
      </>
    )
  }
  if (c.instrumento === 'mano') return bl
    ? <>Te salen <b className="text-white">{n} casillas</b> por persona para escribirlas cuando puedas.</>
    : <>Una casilla por persona y la escribes tú.</>
  if (c.instrumento === 'contador') return <>Una pulsación por repetición. El número cae aquí.</>
  const u = c.instrumento === 'crono-min' ? 'minutos' : 'segundos'
  return bl
    ? <>Un botón por persona: cada pulsación cierra una repetición y la deja en su fila, en <b className="text-white">{u}</b>.</>
    : <>Al pararlo escribe <b className="text-white">{u}</b> aquí — cuéntalo así en la fórmula.</>
}

// ============================================================
// El reloj del bloque, escrito como una frase
// ============================================================
/* ESTO ERA LO QUE NO SE ENCONTRABA. El reloj existía, pero había que deducirlo:
   ponías una duración, luego una columna dada en progresión, y de ahí salía un
   reloj que canta la velocidad. Nadie piensa así. Se piensa «quiero que cada
   dos minutos cambie la velocidad y pite», y eso es lo que hay que poder decir. */
function RelojBloque({ bl, bi, mut, proto, onProgresion }: {
  bl: Bloque; bi: number
  mut: (fn: (t: TestLab) => void) => void
  proto: Datos
  onProgresion: () => void
}) {
  const prog = bl.columnas.find(c => c.clase === 'dada' && c.tipo === 'progresion')
  const marco = 'mt-3 border-t border-dashed border-gray-800 pt-3'
  const frase = 'flex items-center gap-2 flex-wrap text-[12.5px] text-gray-400 mt-2 pl-3 border-l-2 border-orange-500/35 leading-8'
  const mini = 'bg-gray-800 text-white text-[12.5px] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-orange-500 border border-transparent font-mono text-center w-[72px]'
  const sel = 'bg-gray-800 text-white text-[12.5px] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-orange-500 border border-transparent'
  const chip = (on: boolean) => 'font-mono text-[12px] px-2.5 py-1 rounded-md border transition ' +
    (on ? 'bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200' : 'bg-gray-800 border-gray-700 text-gray-300')

  if (!bl.duracion) {
    return (
      <div className={marco}>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">⏱ El reloj</p>
        <p className="text-[12px] text-gray-400 mb-2">Este bloque no lleva reloj: las repeticiones las marcas tú a mano.</p>
        <button onClick={() => mut(t => {
          /* Dos minutos y pitido al cambiar: es lo más corriente y es un punto
             de partida, no una ley. Todo se cambia en la frase de al lado. */
          const b = t.bloques[bi]
          b.duracion = 120; b.duracionUd = 'min'; b.pitaCambio = true; b.avisoAntes = 5
          if (!b.ritmo) b.ritmo = 'no'
        })} className={btnSec + ' ' + btnMini}>⏱ Que el reloj lleve el protocolo</button>
      </div>
    )
  }

  const ud = bl.duracionUd === 'min' ? 'min' : 's'
  const val = ud === 'min' ? Math.round(bl.duracion / 60 * 100) / 100 : bl.duracion
  const tramos = bl.tramos || []

  return (
    <div className={marco}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">⏱ El reloj</p>

      {tramos.length === 0 ? (
        <div className={frase}>
          Cada
          <input type="number" step="any" min={0.1} className={mini} value={val}
            onChange={e => mut(t => {
              /* Se escribe en la unidad que se esté enseñando; dentro SIEMPRE son
                 segundos. Guardar minutos a veces y segundos otras acaba en un
                 escalón de 60 minutos sin que nadie sepa por qué. */
              const n = Number(e.target.value) * (bl.duracionUd === 'min' ? 60 : 1)
              t.bloques[bi].duracion = Math.max(1, Math.round(n)) || 1
            })} />
          <select className={sel} value={ud} onChange={e => mut(t => { t.bloques[bi].duracionUd = e.target.value as 's' | 'min' })}>
            <option value="s">segundos</option>
            <option value="min">minutos</option>
          </select>
          el reloj pasa a la siguiente <b className="text-white">{(bl.etiqueta || 'repetición').toLowerCase()}</b>.
        </div>
      ) : (
        <>
          {/* Con tramos, la duración de la repetición es SU SUMA y no hay campo
              aparte: dos sitios diciendo cuánto dura acabarían discrepando. */}
          <div className={frase}>
            Cada <b className="text-white">{(bl.etiqueta || 'repetición').toLowerCase()}</b> son
            <b className="text-white">{duracionDe(bl)} s</b>, repartidos así:
          </div>
          {tramos.map((tr, ti) => (
            <div key={ti} className={frase}>
              <input type="text" className={mini + ' w-[110px] text-left'} value={tr.nombre}
                onChange={e => mut(t => { t.bloques[bi].tramos![ti].nombre = e.target.value })} />
              <input type="number" min={1} className={mini} value={tr.segundos}
                onChange={e => mut(t => { t.bloques[bi].tramos![ti].segundos = Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              segundos
              {tramos.length > 1 && (
                <button onClick={() => mut(t => { t.bloques[bi].tramos!.splice(ti, 1) })}
                  className="text-gray-600 hover:text-red-400 px-1">×</button>
              )}
            </div>
          ))}
          <div className="flex gap-2 flex-wrap mt-2">
            <button onClick={() => mut(t => { t.bloques[bi].tramos!.push({ nombre: 'Otro', segundos: 15 }) })}
              className={btnSec + ' ' + btnMini}>+ Otro tramo</button>
            <button onClick={() => mut(t => { delete t.bloques[bi].tramos })}
              className="text-[11.5px] text-gray-500 hover:text-gray-300 transition px-2">Volver a una sola pieza</button>
          </div>
        </>
      )}

      <div className="flex gap-1.5 flex-wrap mt-2.5">
        <button className={chip(bl.pitaCambio !== false)}
          onClick={() => mut(t => { t.bloques[bi].pitaCambio = t.bloques[bi].pitaCambio === false })}>
          {bl.pitaCambio !== false ? '🔊 Pita al cambiar' : '🔇 No pita al cambiar'}
        </button>
        <button className={chip((bl.avisoAntes || 0) > 0)}
          onClick={() => mut(t => { t.bloques[bi].avisoAntes = (t.bloques[bi].avisoAntes || 0) > 0 ? 0 : 5 })}>
          {(bl.avisoAntes || 0) > 0 ? '🔔 Avisa antes' : '🔕 Sin aviso previo'}
        </button>
        <button className={chip(!!bl.ritmo && bl.ritmo !== 'no')}
          onClick={() => mut(t => {
            const b = t.bloques[bi]
            /* Empieza por METROS porque es el caso que de verdad hacía falta:
               la course navette. Por segundos es el raro. */
            b.ritmo = (!b.ritmo || b.ritmo === 'no') ? 'metros' : 'no'
            if (b.ritmo === 'metros' && !b.ritmoCada) b.ritmoCada = 20
          })}>
          {bl.ritmo === 'metros' ? '🏃 Pita cada X metros' : bl.ritmo === 'segundos' ? '⏲ Pita cada X segundos' : '➕ Marcar el paso dentro'}
        </button>
        {/* El 30-15 son 30 s corriendo y 15 andando: dos trozos dentro de la
            misma repetición. Sin esto el reloj sabía cuándo cambiaba de escalón
            pero no cuándo había que dejar de correr, que es medio test. */}
        <button className={chip(tramos.length > 0)}
          onClick={() => mut(t => {
            const b = t.bloques[bi]
            if (b.tramos?.length) delete b.tramos
            else b.tramos = [{ nombre: 'Correr', segundos: 30 }, { nombre: 'Andar', segundos: 15 }]
          })}>
          {tramos.length ? '🔀 Partida en ' + tramos.length + ' tramos' : '➗ Partir la repetición'}
        </button>
      </div>

      {(bl.avisoAntes || 0) > 0 && (
        <div className={frase}>
          Avisa con un pitido corto
          <input type="number" min={1} max={60} className={mini} value={bl.avisoAntes}
            onChange={e => mut(t => { t.bloques[bi].avisoAntes = Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          segundos antes del cambio.
        </div>
      )}

      {!!bl.ritmo && bl.ritmo !== 'no' && (
        <>
          <div className={frase}>
            Y pita cada
            <input type="number" step="any" min={1} className={mini} value={bl.ritmoCada || 0}
              onChange={e => mut(t => { t.bloques[bi].ritmoCada = Math.max(0, Number(e.target.value) || 0) })} />
            <select className={sel} value={bl.ritmo} onChange={e => mut(t => { t.bloques[bi].ritmo = e.target.value as Bloque['ritmo'] })}>
              <option value="metros">metros</option>
              <option value="segundos">segundos</option>
            </select>
            {bl.ritmo === 'metros' && <><b className="text-white">a la velocidad de cada repetición</b>, así que el hueco se acorta solo.</>}
          </div>
          {bl.ritmo === 'metros' && !prog && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[11.5px] text-amber-200 leading-snug">
              Para pitar por metros hace falta saber la velocidad. Añade abajo la intensidad que sube sola, o cambia a segundos.
            </div>
          )}
        </>
      )}

      {prog ? (
        <div className={frase}>
          Y canta <b className="text-white">{prog.etiqueta || prog.clave}</b>, que va{' '}
          <b className="text-white">{[0, 1, 2].map(k => nEs(Number(valorDado(prog, k, proto)))).join(' · ')} …</b> {prog.unidad}
          <span className="text-gray-600">(se cambia abajo, en su columna)</span>
        </div>
      ) : (
        <button onClick={onProgresion} className={btnSec + ' ' + btnMini + ' mt-2.5'}>
          + Que además cante una intensidad que suba sola
        </button>
      )}

      <button onClick={() => mut(t => { t.bloques[bi].duracion = 0 })}
        className="block mt-2.5 text-[11.5px] text-gray-500 hover:text-gray-300 transition">Quitar el reloj</button>
    </div>
  )
}

// ============================================================
// 3 · Qué sale de ahí
// ============================================================
function Paso3({ test, mut, datos, pidiendo, setPidiendo }: {
  test: TestLab
  mut: (fn: (t: TestLab) => void) => void
  datos: Datos
  pidiendo: Pidiendo | null
  setPidiendo: (p: Pidiendo | null) => void
}) {
  const vals = calcular(test, datos)

  return (
    <div className={tarjeta}>
      <p className="font-bold text-[15px]">3 · Qué sale de ahí</p>
      <p className="text-gray-500 text-xs mt-1 leading-snug">
        Una columna de un bloque no es un número: hay que decir qué le pides y <b className="text-gray-300">de cuáles</b>. Pulsa una y verás.
      </p>

      <div className="mt-4">
        {test.resultados.map((r, i) => (
          <div key={i} className={caja}>
            <h4 className="flex items-center gap-2 text-[12.5px] font-bold mb-2.5">
              <Pildora tono="med">{r.nombre || 'sin nombre'}</Pildora>
              <button onClick={() => { mut(t => { t.resultados.splice(i, 1) }); setPidiendo(null) }}
                className="ml-auto text-gray-600 hover:text-red-400 px-1">×</button>
            </h4>

            <div className={rejilla} style={REJILLA}>
              <div>
                <label className={lab} htmlFor={'r' + i + 'n'}>Se llama</label>
                <input id={'r' + i + 'n'} className={campo + ' font-mono'} value={r.nombre}
                  onChange={e => mut(t => {
                    const viejo = t.resultados[i].nombre
                    t.resultados[i].nombre = e.target.value
                    for (const x of t.resultados) for (const b of x.formula) if (b.t === 'ref' && b.v === viejo) b.v = e.target.value
                  })} />
              </div>
              <div>
                <label className={lab} htmlFor={'r' + i + 'u'}>Unidad</label>
                <input id={'r' + i + 'u'} className={campo} value={r.unidad}
                  onChange={e => mut(t => { t.resultados[i].unidad = e.target.value })} />
                {/* Lo que la app ha deducido de la unidad, y se puede corregir.
                    De esto dependen la flecha de la gráfica y hacia dónde va el
                    porcentaje de una zona colgada de aquí: el 95 % de 1:13 es
                    más LENTO, no más rápido. */}
                <button onClick={() => mut(t => { t.resultados[i].inverso = !esInverso(r) })}
                  title="Hacia dónde va la mejora en esta unidad. Cámbialo si no acierta."
                  className="text-[10.5px] text-gray-500 hover:text-gray-300 mt-1 transition">
                  {esInverso(r) ? '↓ menos es mejor' : '↑ más es mejor'}
                </button>
              </div>
              <div className="min-w-[210px]">
                <label className={lab} htmlFor={'r' + i + 'a'}>¿Para qué sirve?</label>
                {/* Agrupado, porque el grupo ES el concepto: todo lo de arriba
                    es un número del que se pueden colgar zonas, sea un umbral o
                    una marca suya. */}
                <select id={'r' + i + 'a'} className={campo} value={r.ancla || 'nada'}
                  onChange={e => mut(t => { t.resultados[i].ancla = e.target.value as Ancla })}>
                  <optgroup label="Referencias — se les pueden colgar zonas">
                    {ANCLAS_REFERENCIA.map(k => <option key={k} value={k}>{ANCLAS[k].etiqueta}</option>)}
                  </optgroup>
                  <optgroup label="Lo demás">
                    <option value="nada">{ANCLAS.nada.etiqueta}</option>
                  </optgroup>
                </select>
                <Cabe deporte={test.deporte} r={r} />
              </div>
              <label className="flex items-center gap-2 text-gray-400 text-xs pt-5 cursor-pointer select-none">
                <input type="checkbox" checked={r.graf !== false} className="accent-orange-500"
                  onChange={e => mut(t => { t.resultados[i].graf = e.target.checked })} /> gráfica
              </label>
            </div>

            <div className="mt-2.5">
              <MontaFormula
                formula={r.formula} clave={'res:' + i}
                escalares={test.sueltos.map(c => c.clave)}
                series={todasLasColumnas(test).map(x => ({ clave: x.c.clave, veces: x.bl.veces }))}
                refs={test.resultados.slice(0, i).filter(x => x.nombre).map(x => x.nombre)}
                previos={previosParaAntes(test, i)}
                pidiendo={pidiendo} setPidiendo={setPidiendo}
                onCambio={f => mut(t => { t.resultados[i].formula = f })} />
            </div>

            {vals[i]?.error && (
              <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[11.5px] text-amber-200">{vals[i].error}</div>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => mut(t => { t.resultados.push({ nombre: 'resultado' + (t.resultados.length + 1), unidad: '', formula: [] }) })}
        className={btnSec}>+ Añadir resultado</button>
    </div>
  )
}


/**
 * Si este resultado podrá fijar la referencia de la app, dicho AL CREARLO.
 *
 * Antes no se decía en ninguna parte: te enterabas meses después, en la otra
 * pantalla, al ir a fijar zonas y encontrarte con que no se podía.
 */
function Cabe({ deporte, r }: { deporte: string; r: Resultado }) {
  if (!r.ancla || r.ancla === 'nada') return null
  const v = puedeFijarLab(deporte, r)
  return (
    <p className={'text-[10.5px] leading-snug mt-1 ' + (v.destino ? 'text-green-400/80' : 'text-gray-500')}>
      {v.destino
        ? <>⚓ Puede fijar {v.destino.nombre} del atleta.</>
        : <>◈ Referencia tuya: {v.motivo}</>}
    </p>
  )
}

function Grupo({ et, escalon, children }: { et: string; escalon?: boolean; children: React.ReactNode }) {
  return (
    <div className={escalon ? 'border-l-2 border-fuchsia-400/45 pl-3' : ''}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">{et}</p>
      <div className="flex flex-wrap gap-1.5 items-center">{children}</div>
    </div>
  )
}

const FICHA = 'font-mono text-[12px] px-2.5 py-1 rounded-md border transition hover:brightness-125'
const colorFicha = (b: Bloq) => b.t === 'fn2' ? 'bg-emerald-500/14 border-emerald-400/40 text-emerald-200'
  : b.t === 'fn' ? 'bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'
  : b.t === 'var' ? 'bg-orange-500/14 border-orange-500/45 text-orange-200'
    : b.t === 'ref' ? 'bg-violet-500/14 border-violet-400/45 text-violet-200'
      : b.t === 'antes' ? 'bg-sky-500/14 border-sky-400/45 text-sky-200'
        : b.t === 'num' ? 'bg-blue-500/14 border-blue-400/40 text-blue-200'
          : 'bg-gray-800 border-gray-600 text-gray-300'

/** Cómo se lee una ficha de la fórmula. */
const textoFicha = (b: Bloq): string =>
  b.t === 'fn' ? etiquetaFn(b)
    : b.t === 'fn2' ? etiquetaFn2(b)
      : b.t === 'antes' ? 'antes(' + b.v + ')'
        : String(b.v)

/**
 * El montador de fórmulas, que sirve para las dos.
 *
 * La diferencia entre una y otra es QUÉ VALE UN NOMBRE. En un resultado, el
 * nombre de una columna vale la serie entera y hay que decir qué se le pide; en
 * una columna calculada vale UN número, el de su repetición, y por eso ahí no
 * se ofrecen funciones. Escribir dos montadores habría dejado que uno ofreciera
 * lo que el otro prohíbe.
 */
function MontaFormula({ formula, clave, escalares, series, refs, previos = [], pidiendo, setPidiendo, onCambio }: {
  formula: Bloq[]
  clave: string
  escalares: string[]
  series: { clave: string; veces: number }[]
  refs: string[]
  /** Los que se le pueden pedir a `antes()`. Vacío en una columna calculada. */
  previos?: string[]
  pidiendo: Pidiendo | null
  setPidiendo: (p: Pidiendo | null) => void
  onCambio: (f: Bloq[]) => void
}) {
  const mio = pidiendo?.clave === clave ? pidiendo : null
  const pon = (b: Bloq) => { onCambio([...formula, b]); setPidiendo(null) }

  return (
    <>
      <div className="bg-[#0b1220] border border-dashed border-gray-700 rounded-xl px-2.5 py-2 flex flex-wrap gap-1.5 items-center min-h-[44px]">
        {formula.length === 0
          ? <span className="text-gray-600 text-[12.5px] italic">Móntala con los bloques de abajo</span>
          : formula.map((b, n) => (
            <button key={n} title="Quitar" onClick={() => onCambio(formula.filter((_, k) => k !== n))}
              className={FICHA + ' ' + colorFicha(b)}>
              {textoFicha(b)}
            </button>
          ))}
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        <Grupo et={series.length ? 'Casillas y columnas' : 'Lo que puedes usar aquí'}>
          {escalares.map(k => (
            <button key={k} className={FICHA + ' bg-orange-500/14 border-orange-500/45 text-orange-200'}
              onClick={() => pon({ t: 'var', v: k })}>{k}</button>
          ))}
          {series.map(s => (
            <button key={s.clave} className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
              onClick={() => setPidiendo({ clave, col: s.clave, fn: null })}>
              {s.clave} <span className="opacity-60">×{s.veces}</span>
            </button>
          ))}
          {!escalares.length && !series.length && <span className="text-gray-600 text-[12.5px] italic">Nada todavía</span>}
        </Grupo>

        {mio && !mio.fn && (
          <Grupo et={'De «' + mio.col + '», ¿qué quieres?'} escalon>
            {(Object.keys(FUNCIONES) as Funcion[]).map(f => (
              <button key={f} className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
                onClick={() => setPidiendo({ ...mio, fn: f })}>
                {f}() <span className="opacity-60">{FUNCIONES[f]}</span>
              </button>
            ))}
            {/* «Quiero la 2.ª» es una pregunta tan corriente como «quiero la
                media», y no tenía por qué pasar por elegir una función: de una
                sola repetición, la suma y la media son el mismo número. */}
            <button className={FICHA + ' bg-orange-500/14 border-orange-500/45 text-orange-200'}
              onClick={() => {
                const n = prompt('¿Cuál? (1 = la primera)', '2')
                if (n === null) return
                const k = Math.max(1, Math.round(Number(n) || 1))
                pon(fnB('suma', mio.col, k, k))
              }}>una sola <span className="opacity-60">la 2.ª, la 5.ª…</span></button>
          </Grupo>
        )}

        {mio?.fn && (
          <Grupo et={mio.fn + '(' + mio.col + ') ¿de cuáles?'} escalon>
            {([['De todas', 0, 0], ['Sin la primera', 2, 0], ['Sin la última', 0, -1]] as const).map(([n, d, h]) => (
              <button key={n} className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
                onClick={() => pon(fnB(mio.fn!, mio.col, d, h))}>{n}</button>
            ))}
            <button className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
              onClick={() => {
                const a = prompt('¿Desde qué repetición?', '2'); if (a === null) return
                const b = prompt('¿Hasta cuál? (0 = hasta la última)', '3'); if (b === null) return
                pon(fnB(mio.fn!, mio.col, Math.max(1, Math.round(Number(a) || 1)), Math.round(Number(b) || 0)))
              }}>De la X a la Y…</button>
            <p className="text-gray-500 text-[11px] leading-snug w-full mt-1">
              En un 6×100 la primera sale de pared y no compara con las demás. Y el índice de fatiga son dos tramos: 1–3 contra 4–6.
            </p>
          </Grupo>
        )}

        {/* Con dos o más columnas que se repitan aparece lo que las cruza: la
            recta y el punto que cae entre dos escalones. */}
        {series.length >= 2 && !mio?.fn && (
          <Grupo et="Con dos columnas a la vez">
            {(Object.keys(FUNCIONES2) as Funcion2[]).map(f => (
              <button key={f} className={FICHA + ' bg-emerald-500/14 border-emerald-400/40 text-emerald-200'}
                onClick={() => setPidiendo({ clave, col: '', fn: null, fn2: f })}>
                {f}() <span className="opacity-60">{FUNCIONES2[f]}</span>
              </button>
            ))}
          </Grupo>
        )}

        {mio?.fn2 && !mio.x && (
          <Grupo escalon et={
            mio.fn2 === 'interpola' || esDmax(mio.fn2) ? '¿Qué columna quieres que te devuelva?' : '¿Qué va en el eje de abajo?'
          }>
            {series.map(s => (
              <button key={s.clave} className={FICHA + ' bg-emerald-500/14 border-emerald-400/40 text-emerald-200'}
                onClick={() => setPidiendo({ ...mio, x: s.clave })}>{s.clave}</button>
            ))}
          </Grupo>
        )}

        {mio?.fn2 && mio.x && !mio.y && (
          <Grupo escalon et={
            mio.fn2 === 'interpola' ? '¿Y cuál es la que tiene que llegar a un valor?'
              : esDmax(mio.fn2) ? '¿Y cuál es la que se dobla?'
                : '¿Y qué va en el de al lado?'
          }>
            {series.filter(s => s.clave !== mio.x).map(s => (
              <button key={s.clave} className={FICHA + ' bg-emerald-500/14 border-emerald-400/40 text-emerald-200'}
                onClick={() => {
                  /* Al Dmax le queda una pregunta más, así que aquí solo se
                     apunta la columna. */
                  if (esDmax(mio.fn2!)) { setPidiendo({ ...mio, y: s.clave }); return }
                  if (mio.fn2 !== 'interpola') { pon({ t: 'fn2', v: mio.fn2!, x: mio.x!, y: s.clave }); return }
                  const a = prompt('¿A qué valor de «' + s.clave + '»?', '4')
                  if (a === null) return
                  const n = Number(String(a).replace(',', '.'))
                  if (!Number.isFinite(n)) return
                  pon({ t: 'fn2', v: 'interpola', x: mio.x!, y: s.clave, a: n })
                }}>{s.clave}</button>
            ))}
            {mio.fn2 !== 'interpola' && !esDmax(mio.fn2) && (
              <p className="text-gray-500 text-[11px] leading-snug w-full mt-1">
                La recta se ajusta a los puntos de las dos columnas. Si no caen bien en una recta, el número sale igual — pero te lo dice.
              </p>
            )}
            {esDmax(mio.fn2) && (
              <p className="text-gray-500 text-[11px] leading-snug w-full mt-1">
                La que se dobla es el lactato. Se tira una cuerda de su primer punto al último y se busca dónde la curva
                se separa más de ella: ahí está el umbral.
              </p>
            )}
          </Grupo>
        )}

        {/* SOBRE QUÉ SE BUSCA. Son dos números distintos y ninguno es «el
            bueno»: el de los escalones cae siempre en uno de los que se
            midieron, el de la curva cae donde le toque. Elegirlo por el
            entrenador sería decidirle el umbral a su atleta sin decírselo. */}
        {mio?.fn2 && mio.x && mio.y && esDmax(mio.fn2) && (
          <Grupo et="¿Y dónde lo busco?" escalon>
            <button className={FICHA + ' bg-emerald-500/14 border-emerald-400/40 text-emerald-200'}
              onClick={() => pon({ t: 'fn2', v: mio.fn2!, x: mio.x!, y: mio.y!, a: GRADO_CURVA })}>
              sobre la curva <span className="opacity-60">como un laboratorio</span>
            </button>
            <button className={FICHA + ' bg-emerald-500/14 border-emerald-400/40 text-emerald-200'}
              onClick={() => pon({ t: 'fn2', v: mio.fn2!, x: mio.x!, y: mio.y!, a: 0 })}>
              sobre los escalones <span className="opacity-60">cae en uno de los medidos</span>
            </button>
            <p className="text-gray-500 text-[11px] leading-snug w-full mt-1">
              Sobre la curva se ajusta un polinomio a los puntos y se busca en ella, que es lo que hace un laboratorio:
              el umbral puede caer entre dos escalones. Sobre los escalones no se ajusta nada, así que el umbral es
              siempre uno de los que mediste. Si la curva ajusta mal, el número sale igual — y te lo dice.
            </p>
          </Grupo>
        )}

        <Grupo et="Operaciones">
          {['+', '-', '*', '/', '^', '(', ')'].map(o => (
            <button key={o} className={FICHA + ' bg-gray-800 border-gray-600 text-gray-300'}
              onClick={() => pon({ t: 'op', v: o })}>{o}</button>
          ))}
          <button className={FICHA + ' bg-blue-500/14 border-blue-400/40 text-blue-200'}
            onClick={() => { const n = prompt('¿Qué número?', '100'); if (n !== null && Number.isFinite(Number(n))) pon({ t: 'num', v: Number(n) }) }}>123…</button>
        </Grupo>

        {refs.length > 0 && (
          <Grupo et="Resultados anteriores">
            {refs.map(r => (
              <button key={r} className={FICHA + ' bg-violet-500/14 border-violet-400/45 text-violet-200'}
                onClick={() => pon({ t: 'ref', v: r })}>{r}</button>
            ))}
          </Grupo>
        )}

        {/* LO ÚNICO QUE SE SALE DE ESTA MEDICIÓN. Todo lo demás mira los datos
            de la pasada de hoy; esto mira la de antes, que es lo que hace que
            «cuánto ha mejorado» pueda ser un resultado y no solo un número que
            se lee en la gráfica. */}
        {previos.length > 0 && (
          <Grupo et="Del test anterior">
            {previos.map(r => (
              <button key={r} className={FICHA + ' bg-sky-500/14 border-sky-400/45 text-sky-200'}
                onClick={() => pon({ t: 'antes', v: r })}>antes({r})</button>
            ))}
            <p className="text-gray-500 text-[11px] leading-snug w-full mt-1">
              Lo que valió ese resultado la vez anterior, recalculado con la fórmula de hoy. Aquí abajo, en la vista
              previa, dirá que no hay anterior: esto solo tiene con qué comparar cuando el atleta ya lo ha hecho
              alguna vez.
            </p>
          </Grupo>
        )}

        {/* EL ATAJO DE LAS TRES COLUMNAS. Las de dos columnas cruzan dos
            series; para juntar tres cosas de una MISMA repetición no hace
            falta nada nuevo, y sin decirlo aquí el entrenador se queda
            buscando una función que no existe. */}
        {series.length >= 3 && (
          <p className="text-gray-500 text-[11px] leading-snug border-t border-dashed border-gray-800 pt-2">
            ¿Necesitas tres columnas a la vez? Júntalas antes en una <b className="text-gray-400">columna calculada</b> del
            bloque —ahí puedes usar las que quieras de la misma repetición— y luego pídele aquí la media, el máximo o lo
            que sea a esa columna.
          </p>
        )}
      </div>
    </>
  )
}

// ============================================================
// La tabla: lo que se verá el día del test
// ============================================================
function Previa({ test, proto, med, nombre, onProto, onMed, onLlego }: {
  test: TestLab
  proto: Datos
  med: Datos
  nombre: string
  onProto: (clave: string, valor: string) => void
  onMed: (clave: string, valor: string, indice?: number) => void
  onLlego: (bloque: string, n: number) => void
}) {
  const datos: Datos = { ...proto, ...med }
  const vals = calcular(test, datos)
  const relojes = relojesDe(test)
  const dados = test.sueltos.filter(c => c.clase === 'dada')
  const mios = test.sueltos.filter(c => c.clase !== 'dada')
  const grupo = 'text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5'

  if (!test.sueltos.length && !test.bloques.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 text-[12px] font-bold">Así lo verás al pasarlo</div>
        <div className="p-4 text-gray-600 text-[12.5px] italic">Todavía no hay nada que apuntar. Añade una casilla o un bloque en el paso 2.</div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <span className="text-[12px] font-bold">Así lo verás al pasarlo</span>
        <span className="text-[10.5px] text-gray-500 ml-auto truncate">{nombre}</span>
      </div>
      <div className="p-4">
        {/* El reloj NO se pinta aquí a propósito: esta previa es la tabla, que es
            lo que hay que juzgar mientras montas. Pero tiene que quedar claro que
            va a haberlo, o parece que el instrumento elegido no hace nada. */}
        {relojes.length > 0 && (
          <div className="mb-3 rounded-lg border border-blue-400/25 bg-blue-500/[0.07] px-3 py-2 text-[11.5px] text-blue-100 leading-snug">
            ⏱ <b>Al pasarlo llevará reloj</b>: {relojes.join(' · ')}. No se pinta aquí para no tapar la tabla.
          </div>
        )}

        {dados.length > 0 && (
          <>
            <p className={grupo}>Del protocolo · igual para todos</p>
            <div className={rejilla + ' mb-3'} style={REJILLA}>
              {dados.map(c => (
                <div key={c.clave}>
                  <label className={lab}>{c.etiqueta || c.clave}{c.unidad ? ' (' + c.unidad + ')' : ''}</label>
                  <input className={campoAzul + ' font-mono'} inputMode="decimal" value={String(proto[c.clave] ?? '')}
                    onChange={e => onProto(c.clave, e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        {test.bloques.map(bl => {
          const hechas = hechasDe(bl, datos)
          const abierto = bl.modo === 'abierto'
          return (
            <div key={bl.clave} className="mb-3">
              <p className={grupo}>{bl.etiqueta || 'Repetición'} · {abierto ? 'hasta ' + bl.veces : bl.veces + ' fijas'}</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      {bl.columnas.map(c => (
                        <th key={c.clave} className="text-left text-[9.5px] uppercase tracking-wide text-gray-500 font-bold px-1.5 py-1 border-b border-gray-800 align-bottom">
                          {c.etiqueta || c.clave}
                          <span className="block normal-case tracking-normal font-normal text-[10px] text-gray-600">
                            {c.clase === 'dada' ? 'la pones tú' : INSTRUMENTOS[c.instrumento]}{c.unidad ? ' · ' + c.unidad : ''}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: bl.veces }, (_, k) => {
                      const dentro = k < hechas
                      const tope = abierto && k + 1 === hechas
                      return (
                        <tr key={k} className={(abierto && !dentro ? 'opacity-30 ' : '') + (tope ? 'border-b-2 border-orange-500/55' : '')}>
                          <td className="text-right pr-1.5 py-1 border-b border-gray-800/60">
                            {abierto ? (
                              <button title="Llegó hasta aquí" onClick={() => onLlego(bl.clave, k + 1)}
                                className={'font-mono text-[11px] px-1 rounded transition ' + (tope ? 'text-orange-400 font-bold' : 'text-gray-600 hover:text-orange-300')}>
                                {k + 1}
                              </button>
                            ) : <span className="font-mono text-[11px] text-gray-600">{k + 1}</span>}
                          </td>
                          {bl.columnas.map(c => (
                            <td key={c.clave} className="px-1.5 py-1 border-b border-gray-800/60">
                              {c.clase === 'dada'
                                ? <span className="font-mono text-[12.5px] text-blue-300 whitespace-nowrap">{String(valorDado(c, k, datos))}</span>
                                : <input className={(c.instrumento !== 'mano' ? campoMed : campo) + ' font-mono tabular-nums'} inputMode="decimal"
                                  value={String((med[c.clave] as string[] | undefined)?.[k] ?? '')}
                                  onChange={e => onMed(c.clave, e.target.value, k)} />}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {abierto && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {hechas
                    ? <>Llegó hasta la <b className="text-white">{hechas}.ª</b> de {bl.veces}.</>
                    : <><b className="text-amber-300">Marca hasta dónde llegó</b> pulsando el número de la fila.</>}
                </p>
              )}
            </div>
          )
        })}

        {mios.length > 0 && (
          <>
            <p className={grupo}>De esta persona</p>
            <div className={rejilla + ' mb-3'} style={REJILLA}>
              {mios.map(c => (
                <div key={c.clave}>
                  <label className={lab}>{c.etiqueta || c.clave}{c.unidad ? ' (' + c.unidad + ')' : ''}</label>
                  <input className={(c.instrumento !== 'mano' ? campoMed : campo) + ' font-mono'} inputMode="decimal"
                    value={String(med[c.clave] ?? '')} onChange={e => onMed(c.clave, e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        <p className={grupo}>Lo que sale</p>
        {!test.resultados.length && <p className="text-gray-600 text-[12.5px] italic">Ningún resultado todavía.</p>}
        {test.resultados.map((r, i) => (
          <div key={i} className="flex justify-between items-baseline gap-2.5 py-1.5 border-b border-gray-800/60 text-[12.5px]">
            <span className="font-mono text-orange-300">{r.nombre || '—'}</span>
            {vals[i].error
              ? <span className="text-amber-300 text-[11.5px] text-right">{vals[i].error}</span>
              : <span className="font-mono tabular-nums font-bold">{nEs(vals[i].valor as number)} <span className="text-gray-500 font-normal">{r.unidad}</span></span>}
          </div>
        ))}
        {/* Los avisos van SOLOS, sin que el entrenador tenga que acordarse de
            pedir el ajuste: una recta mal ajustada devuelve su número con
            aspecto impecable, y eso es justo lo que hay que romper. */}
        {vals.some(x => x.avisos?.length) && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[11.5px] text-amber-200 leading-snug">
            {vals.flatMap((x, i) => (x.avisos || []).map(a => (
              <p key={i + a}>⚠ <b className="text-amber-100">{test.resultados[i].nombre}</b>: {a}</p>
            )))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Pasar el test: un reloj para todos y un botón por persona
// ============================================================
function Pasar({
  test, atletas, activo, setActivo, deportistas, guardado, fecha, setFecha, guardando,
  onGuardarMediciones, datosDe, reloj, ahora, suena, onSonido,
  onAtleta, onQuitaAtleta, onBajo, onVuelta, onDeshace, onReinicia, onReiniciaEsc, onArranca,
}: {
  test: TestLab
  atletas: Atleta[]
  activo: number
  setActivo: (i: number) => void
  deportistas: Atleta[]
  /** Si el test ya está guardado: sin eso no hay dónde colgar las mediciones. */
  guardado: boolean
  fecha: string
  setFecha: (f: string) => void
  guardando: boolean
  onGuardarMediciones: () => void
  datosDe: (a: string) => Datos
  reloj: Reloj | null
  setReloj: (r: Reloj | null) => void
  ahora: number
  suena: boolean
  onSonido: () => void
  onAtleta: (a: Atleta) => void
  onQuitaAtleta: (i: number) => void
  onBajo: (bl: Bloque, a: Atleta) => void
  onVuelta: (c: Columna, bl: Bloque, a: Atleta) => void
  onDeshace: (c: Columna, a: Atleta) => void
  onReinicia: (c: Columna, bl: Bloque) => void
  onReiniciaEsc: (bl: Bloque) => void
  onArranca: (clave: string) => void
}) {
  const cronos = cronosDe(test)
  const escalonados = escalonadosDe(test)
  const msDe = (clave: string) => reloj && reloj.clave === clave ? (reloj.corre ? ahora - reloj.desde + reloj.acu : reloj.acu) : 0
  const relojCaja = 'flex gap-4 items-center flex-wrap border border-gray-800 rounded-xl p-3.5 bg-[#0d1420] mt-3'
  const gordo = 'font-mono tabular-nums text-[38px] leading-none text-orange-400 font-medium'
  const pie = 'text-[10px] tracking-widest uppercase text-gray-500 font-bold mt-1.5'
  const filaAt = 'flex items-center gap-2.5 flex-wrap py-2 border-b border-gray-800/60'

  return (
    <div className={tarjeta}>
      <p className="font-bold text-[15px]">{test.nombre || 'Test'}</p>
      <p className="text-gray-500 text-xs mt-1">
        {test.deporte} · {atletas.length > 1 ? atletas.length + ' personas a la vez' : atletas.length === 1 ? 'una persona' : 'sin nadie todavía'}
      </p>

      <div className="flex gap-1.5 flex-wrap items-center mt-3">
        {atletas.map((a, i) => (
          <span key={a.id} onClick={() => setActivo(i)}
            className={'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] cursor-pointer border transition ' +
              (i === activo ? 'bg-orange-500/14 border-orange-500/50 text-orange-300 font-semibold' : 'bg-gray-800 border-transparent text-gray-400')}>
            {a.nombre}
            <button onClick={e => { e.stopPropagation(); onQuitaAtleta(i) }} className="text-gray-600 hover:text-red-400">×</button>
          </span>
        ))}
        {/* Los de verdad, de tu equipo: lo que se apunte aquí acaba en su
            ficha, así que no se escriben nombres a mano. */}
        <select className={campo + ' w-auto'} value=""
          onChange={e => { const a = deportistas.find(d => String(d.id) === e.target.value); if (a) onAtleta(a) }}>
          <option value="">+ Añadir deportista…</option>
          {deportistas.filter(d => !atletas.some(a => a.id === d.id)).map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
      </div>

      {!atletas.length && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 text-[12px] text-amber-200 leading-snug">
          {deportistas.length
            ? <>Elige a quién se lo pasas. Puedes poner a varios: el reloj es uno solo y cada uno tiene su botón.</>
            : <>No tienes deportistas en tu equipo todavía. El test se puede montar igual, pero para pasarlo hace falta alguien a quien pasárselo.</>}
        </div>
      )}
      {!cronos.length && !escalonados.length && (
        <div className="mt-3 rounded-lg border border-blue-400/25 bg-blue-500/[0.07] px-3 py-2.5 text-[12px] text-blue-100 leading-snug">
          Este test no lleva reloj: se rellena a mano en la tabla de al lado. Es una opción legítima —
          nueve de los veinticuatro tests de la app son así.
        </div>
      )}

      {(cronos.length > 0 || escalonados.length > 0) && (
        <button onClick={onSonido} className="mt-3 text-[11.5px] text-gray-500 hover:text-gray-300 transition">
          {suena ? '🔊 Suena' : '🔇 Sin sonido'}
        </button>
      )}

      {escalonados.map(bl => {
        const clave = '@' + bl.clave
        const ms = msDe(clave)
        const dur = duracionDe(bl)
        const n = escalonAhora(bl, ms)
        const dentroMs = ms % (dur * 1000)
        const dentro = Math.floor(dentroMs / 1000)
        const tr = tramoEn(bl, dentroMs)
        const cd = columnaDeVelocidad(bl, datosDe(String((atletas[activo] || atletas[0])?.id ?? '')))!
        const corre = reloj?.clave === clave && reloj.corre
        return (
          <div key={bl.clave}>
            <div className={relojCaja}>
              <div>
                <div className={gordo}>{nEs(Number(valorDado(cd, n - 1, datosDe(String((atletas[activo] || atletas[0])?.id ?? '')))))}</div>
                <div className={pie}>{cd.unidad} ahora · escalón {n}</div>
              </div>
              <div>
                {/* Con tramos se canta LO QUE QUEDA DE ESTE TRAMO, no lo que
                    lleva la repetición: al atleta lo que le sirve es cuántos
                    segundos le quedan de correr. */}
                <div className={'font-mono tabular-nums text-[26px] leading-none ' + (tr ? 'text-fuchsia-300' : 'text-white')}>
                  {tr
                    ? Math.floor(tr.restante / 60) + ':' + String(tr.restante % 60).padStart(2, '0')
                    : Math.floor(dentro / 60) + ':' + String(dentro % 60).padStart(2, '0')}
                </div>
                <div className={pie}>{tr ? tr.nombre + ' · queda' : 'en este escalón'}</div>
              </div>
              <div className="flex gap-2 flex-1 flex-wrap min-w-[200px]">
                <button onClick={() => onArranca(clave)} className={btnSec + ' flex-1 min-w-[110px]'}>
                  {corre ? 'Pausar' : reloj?.clave === clave && reloj.acu ? 'Seguir' : 'Empezar'}
                </button>
                <button onClick={() => onReiniciaEsc(bl)} className="text-[11.5px] text-gray-500 hover:text-gray-300 px-2 transition">Reiniciar</button>
              </div>
            </div>

            {/* UN reloj, y un botón por persona: das una salida y vas marcando
                según se van descolgando. */}
            <div className="mt-3">
              {atletas.map(a => {
                const hechas = hechasDe(bl, datosDe(String(a.id)))
                return (
                  <div key={a.id} className={filaAt}>
                    <span className="font-semibold text-[13px] min-w-[110px]">{a.nombre}</span>
                    <span className="font-mono text-[12px] text-blue-300">
                      {hechas ? 'escalón ' + hechas + ' · ' + nEs(Number(valorDado(cd, hechas - 1, datosDe(String(a.id))))) + ' ' + cd.unidad : 'sin marcar'}
                    </span>
                    <button onClick={() => onBajo(bl, a)} className={btn + ' ' + btnMini + ' ml-auto'}>Se bajó</button>
                  </div>
                )
              })}
            </div>
            <p className="text-gray-400 text-[11.5px] leading-snug mt-2.5">
              Al marcar se guarda el <b className="text-white">último escalón COMPLETO</b> y los segundos del que no
              terminó van a «aguanto». Si lo marcas al revés, la VAM sale un escalón alta.
            </p>
          </div>
        )
      })}

      {cronos.map(({ c, bl }) => {
        const ms = msDe(c.clave)
        const corre = reloj?.clave === c.clave && reloj.corre
        return (
          <div key={c.clave}>
            <div className={relojCaja}>
              <div>
                <div className={gordo}>{crono(ms)}</div>
                <div className={pie}>{c.etiqueta || c.clave}</div>
              </div>
              <div className="flex gap-2 flex-1 flex-wrap min-w-[200px]">
                <button onClick={() => onArranca(c.clave)} className={btnSec + ' flex-1 min-w-[110px]'}>
                  {corre ? 'Pausar' : reloj?.clave === c.clave && reloj.acu ? 'Seguir' : 'Empezar'}
                </button>
                <button onClick={() => onReinicia(c, bl)} className="text-[11.5px] text-gray-500 hover:text-gray-300 px-2 transition">Reiniciar</button>
              </div>
            </div>
            <div className="mt-3">
              {atletas.map(a => {
                const hechas = ((datosDe(String(a.id))[c.clave] as string[] | undefined) || []).filter(x => x !== '' && x != null).length
                const completa = hechas >= bl.veces
                return (
                  <div key={a.id} className={filaAt}>
                    <span className="font-semibold text-[13px] min-w-[110px]">{a.nombre}</span>
                    <span className="font-mono text-[12px] text-blue-300">
                      {completa ? 'completa' : 'va por la ' + (hechas + 1) + '.ª de ' + bl.veces}
                    </span>
                    <span className="flex gap-0.5 flex-1 min-w-[70px]">
                      {Array.from({ length: bl.veces }, (_, k) => (
                        <i key={k} className={'h-1.5 flex-1 rounded-full ' + (k < hechas ? 'bg-orange-500' : 'bg-white/10')} />
                      ))}
                    </span>
                    <button onClick={() => onDeshace(c, a)} disabled={!hechas} className={btnSec + ' ' + btnMini}>Deshacer</button>
                    <button onClick={() => onVuelta(c, bl, a)} disabled={!corre || completa} className={btn + ' ' + btnMini}>
                      {completa ? 'Completa' : 'Vuelta'}
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="text-gray-400 text-[11.5px] leading-snug mt-2.5">
              Un solo reloj para todos y un botón por persona: cada uno cierra SU repetición cuando llega.
              El tiempo que se guarda es el suyo, no el del reloj.
            </p>
          </div>
        )
      })}

      <div className="mt-4 rounded-lg border border-blue-400/25 bg-blue-500/[0.07] px-3 py-2.5 text-[12px] text-blue-100 leading-snug">
        Los tiempos <b>no se enseñan aquí</b>: caen en la fila de cada uno en su tabla, que es donde además se corrigen.
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Guardar lo medido</p>
        {!guardado ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 text-[12px] text-amber-200 leading-snug">
            Este test todavía no está guardado, así que no hay dónde colgar las mediciones.
            Vuelve al editor y dale a <b>Guardar test</b>.
          </div>
        ) : (
          <div className="flex gap-2.5 flex-wrap items-end">
            <div style={{ maxWidth: 170 }}>
              <label className={lab} htmlFor="lab-fecha">Fecha</label>
              <input id="lab-fecha" type="date" className={campo} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <button onClick={onGuardarMediciones} disabled={guardando || !atletas.length} className={btn}>
              {guardando ? 'Guardando…' : atletas.length > 1 ? 'Guardar las ' + atletas.length + ' mediciones' : 'Guardar la medición'}
            </button>
            <p className="text-[11.5px] text-gray-500 leading-snug basis-full">
              Se guarda una por persona con algo escrito, y <b className="text-gray-300">con el protocolo dentro</b>:
              dos tests que arrancaron distinto no son comparables, y así cambiarlo mañana no reescribe lo de ayer.
              Repetir el mismo día es corregir, no apuntar dos veces.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Cómo va este test con el tiempo
// ============================================================
function Historial({
  test, deportistas, atleta, setAtleta, mediciones, cargando,
  guardando, onFijar,
}: {
  test: TestLab
  deportistas: Atleta[]
  atleta: number | null
  setAtleta: (id: number) => void
  mediciones: Medicion[]
  cargando: boolean
  guardando: boolean
  onFijar: (indice: number, fecha: string) => void
}) {
  const series = seriesDe(test, mediciones)
  const conDatos = series.filter(s => s.puntos.length >= 2)
  const anclas = conAncla(test)
  /* En orden de fecha UNA VEZ, y de aquí salen la última y el «anterior» de
     cada fila: si cada sitio lo ordenara por su cuenta, un día la tabla
     compararía con una medición y la gráfica con otra. */
  const orden = [...mediciones].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultima = orden[orden.length - 1]
  const previaDe = (k: number) => (k > 0 ? orden[k - 1].datos : null)

  return (
    <div className="flex flex-col gap-4">
      <div className={tarjeta}>
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div>
            <p className="font-bold text-[15px]">{test.nombre}</p>
            <p className="text-gray-500 text-xs mt-1">{test.deporte} · cómo ha ido con el tiempo</p>
          </div>
          <div style={{ minWidth: 190 }}>
            <label className={lab} htmlFor="hist-dep">Deportista</label>
            <select id="hist-dep" className={campo} value={atleta ?? ''}
              onChange={e => setAtleta(Number(e.target.value))}>
              <option value="">Elige a quién miras…</option>
              {deportistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!atleta ? (
        <div className={tarjeta}><p className="text-gray-600 text-[13px] italic">Elige un deportista para ver cómo le ha ido.</p></div>
      ) : cargando ? (
        <div className={tarjeta}><p className="text-gray-600 text-[13px] italic">Cargando…</p></div>
      ) : !mediciones.length ? (
        <div className={tarjeta}>
          <p className="text-gray-600 text-[13px] italic">Todavía no le has pasado este test.</p>
        </div>
      ) : (
        <>
          <div className={tarjeta}>
            <p className="font-bold text-[15px]">Cómo va</p>
            <p className="text-gray-500 text-xs mt-1">
              Una gráfica por resultado: cada uno tiene su unidad y no se pueden mezclar en un eje.
            </p>
            {conDatos.length === 0 ? (
              <p className="text-gray-600 text-[13px] italic mt-3">
                {mediciones.length < 2
                  ? 'Con una sola medición no hay tendencia que dibujar. Guarda otra con distinta fecha.'
                  : 'Ningún resultado está marcado para gráfica.'}
              </p>
            ) : (
              <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
                {conDatos.map((s, i) => <Grafica key={s.nombre} s={s} idx={i} />)}
              </div>
            )}
          </div>

          {anclas.length > 0 && ultima && (
            <div className={tarjeta}>
              <p className="font-bold text-[15px]">Fijar sus zonas con esto</p>
              <p className="text-gray-500 text-xs mt-1">
                De la última medición ({ultima.fecha}). Escribe la referencia del atleta, que es de donde
                salen todas las zonas que calcula la aplicación.
              </p>
              <div className="flex flex-col gap-2 mt-3">
                {anclas.map(({ indice, r }) => {
                  const p = propuestaLab(test, indice, ultima.datos, previaDe(orden.length - 1))
                  const v = puedeFijarLab(test.deporte, r)
                  return (
                    <div key={indice} className="flex items-center gap-3 flex-wrap border border-gray-800 rounded-xl p-3 bg-[#0d1420]">
                      <span className="font-mono text-[12.5px] text-orange-300 min-w-[90px]">{r.nombre}</span>
                      {p ? (
                        <>
                          <span className="text-[12.5px] text-gray-300">
                            → {v.destino?.nombre}: <b className="font-mono text-white">{p.texto}</b>
                          </span>
                          <button onClick={() => onFijar(indice, ultima.fecha)} disabled={guardando}
                            className={btn + ' ' + btnMini + ' ml-auto'}>
                            {guardando ? 'Guardando…' : 'Fijar'}
                          </button>
                        </>
                      ) : (
                        <span className="text-[11.5px] text-gray-500 leading-snug">
                          {v.motivo || 'Todavía no hay número en la última medición.'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-gray-500 text-[11px] leading-snug mt-3">
                Se guarda como estimado y con el test dentro del origen: una fórmula que te has montado tú
                no tiene detrás la validación que tienen los tests del catálogo, y dentro de dos meses hay
                que poder saber de dónde salió el número.
              </p>
            </div>
          )}

          <div className={tarjeta}>
            <p className="font-bold text-[15px]">Cada vez que lo pasó</p>
            <p className="text-gray-500 text-xs mt-1">
              Los resultados se recalculan desde lo que se midió, así que corregir una fórmula corrige
              el historial entero.
            </p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-gray-500 text-[10px] uppercase tracking-wide border-b border-gray-700">
                    <th className="text-left py-2 px-2">Fecha</th>
                    {test.resultados.map(r => (
                      <th key={r.nombre} className="text-left py-2 px-2 font-mono normal-case">{r.nombre}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orden.map((m, k) => ({ m, k })).reverse().map(({ m, k }) => {
                    const vals = calcular(test, m.datos, previaDe(k))
                    return (
                      <tr key={m.fecha} className="border-b border-gray-800/70">
                        <td className="py-2 px-2 text-gray-500 tabular-nums">{m.fecha}</td>
                        {vals.map((v, i) => (
                          <td key={i} className="py-2 px-2 font-semibold tabular-nums">
                            {v.error
                              ? <span className="text-gray-600 font-normal text-[11px]" title={v.error}>—</span>
                              : nEs(v.valor as number) + ' ' + test.resultados[i].unidad}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Una línea por resultado, con su flecha sabiendo hacia dónde se mejora. */
function Grafica({ s, idx }: { s: Serie; idx: number }) {
  const vs = s.puntos.map(p => p.valor)
  let min = Math.min(...vs), max = Math.max(...vs)
  if (max === min) { max = min + 1; min = min - 1 }
  const pad = (max - min) * 0.15; min -= pad; max += pad

  const W = 260, H = 84
  const x = (n: number) => (n / (s.puntos.length - 1)) * (W - 8) + 4
  const y = (v: number) => H - 14 - ((v - min) / (max - min)) * (H - 26)
  const linea = s.puntos.map((p, n) => `${n ? 'L' : 'M'}${x(n).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')
  const area = `${linea} L${x(s.puntos.length - 1).toFixed(1)},${H - 14} L${x(0).toFixed(1)},${H - 14} Z`

  const col = s.mejora === null ? '#9ca3af' : s.mejora ? '#4ade80' : '#f87171'
  const ult = s.puntos[s.puntos.length - 1]

  return (
    <div className="bg-[#161f2e] border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-xs font-bold">{s.nombre} <span className="text-gray-500 font-normal">{s.unidad}</span></span>
        <span className="font-mono text-[15px] font-bold tabular-nums">{nEs(ult.valor)}</span>
      </div>
      <div className="text-[11px] tabular-nums" style={{ color: col }}>
        {s.delta === null || s.delta === 0 ? 'igual que la anterior'
          : (s.delta > 0 ? '+' : '') + nEs(s.delta) + ' · ' + (s.mejora ? 'mejor' : 'peor')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block mt-2"
        style={{ height: 84, overflow: 'visible' }} role="img"
        aria-label={`Evolución de ${s.nombre}: ${s.puntos.map(p => nEs(p.valor)).join(', ')}`}>
        <defs>
          <linearGradient id={'lab-g' + idx} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity=".22" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#lab-g${idx})`} />
        <path d={linea} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(s.puntos.length - 1)} cy={y(ult.valor)} r="3" fill={col} />
      </svg>
      {/* Si la recta de un perfil no ajustaba, eso tiene que seguir dicho junto
          al punto: el número ya está dibujado y con aspecto de dato firme. */}
      {s.avisos.length > 0 && (
        <p className="text-[10.5px] text-amber-300/90 leading-snug mt-1.5">⚠ {s.avisos.join(' · ')}</p>
      )}
    </div>
  )
}

function crono(ms: number): string {
  const t = Math.max(0, ms)
  return Math.floor(t / 60000) + ':' + String(Math.floor((t % 60000) / 1000)).padStart(2, '0') + '.' + Math.floor((t % 1000) / 100)
}
