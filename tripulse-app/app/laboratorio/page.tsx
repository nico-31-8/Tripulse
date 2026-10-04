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
import { leerModelo, paraGuardar, medicionDe, leerMediciones, leerAtletas, tieneAlgoEscrito, type Medicion } from '@/lib/lab-guardar'
import {
  FUNCIONES, FUNCIONES2, INSTRUMENTOS, MAX_VECES, TEST_VACIO,
  calcular, hechasDe, valorDado, escalonAhora, intervaloRitmo,
  cronosDe, escalonadosDe, cronometradosDe, cronosSueltosDe, contadoresSueltosDe, cuentaAtras,
  parcialesDe, parcialesBloqueDe, acumuladosDe, SOLO_SUELTOS, contadoresDe, repeticionDe, etiquetaInstrumento, restanteDescanso,
  seCorta, cajonAhora, parcialQueCorta,
  todasLasColumnas, buscaCol, clavesRepetidas, duracionDe, tramoEn, columnaDeVelocidad,
  nuevaClave, protoVacio, medVacia, pegasDe, etiquetaFn, etiquetaFn2, col, fnB, esDmax, GRADO_CURVA, previosParaAntes,
  claveDesdeNombre, claveEsAutomatica,
  type Bloq, type Bloque, type Columna, type Datos, type Funcion,
  type Funcion2, type Instrumento, type Resultado, type TestLab,
} from '@/lib/lab-constructor'
import { PLANTILLAS } from '@/lib/lab-plantillas'
import { deshacer, marcaEn, parcialAhora, primeroLibre, type Marcas } from '@/lib/lab-marcar'
import { pantallaDe, mover, moverA, alternar, seccionPorClave, tieneReloj, tienePantalla, type ClaveSeccion, type Pantalla } from '@/lib/lab-pantalla'
import { ANCLAS, ANCLAS_REFERENCIA, DEPORTES_TEST, type Ancla } from '@/lib/test-definicion'
import { etiquetaDisciplina } from '@/lib/disciplinas'
import { mmss } from '@/lib/medicion'
import { esInverso, seriesDe, conAncla, type Serie } from '@/lib/lab-series'
import { puedeFijarLab, propuestaLab, origenDe } from '@/lib/lab-zonas'
import { fijarZonas } from '@/lib/zonas-desde-test'
import { AvisoEnLinea, useAviso } from '@/components/AvisoEnLinea'
import { pitar, avisarEscalon, despertarAudio } from '@/lib/pitido'
import InterruptoresAviso from '@/components/InterruptoresAviso'

const LLAVE = 'tp_laboratorio_v1'
/* LA AYUDA SE RECUERDA APARTE DEL BORRADOR, y a propósito: es de quien usa la
   app, no del test. Quien ya se sabe la pantalla la apaga una vez y no vuelve
   a verla, y al día siguiente sigue apagada aunque monte otro test. */
const LLAVE_AYUDA = 'tp_laboratorio_ayuda'
/**
 * La caja de lo que se teclea PROBANDO, en el paso 4.
 *
 * Va aparte de los deportistas de verdad a propósito: probar el test no puede
 * acabar escribiéndole un dato a nadie, y mezclarlas sería cuestión de tiempo.
 */
/**
 * La caja donde se escribe mientras montas el test, sin tocar a nadie.
 *
 * Es un id NEGATIVO y no una palabra porque la pantalla de pasar el test
 * trabaja con atletas, y así se puede pintar la de verdad en el editor en vez
 * de tener una segunda versión que se queda atrás. Ningún deportista tiene un
 * id negativo.
 */
const PRUEBA = '-1'
const ATLETA_PRUEBA: Atleta[] = [{ id: -1, nombre: 'Probando' }]

interface Atleta { id: number; nombre: string }
interface Guardado { id: number; nombre: string; deporte: string; def: TestLab; mediciones: number }
const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const nEs = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')

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
/* El ancho del móvil que se finge, en UN SOLO SITIO: lo miran el editor y la
   pantalla de pasar el test, y con dos números la previa mentiría en una de
   las dos. Escrito entero y literal porque Tailwind lee el código buscando
   nombres de clase: partido o montado a trozos, la clase no se genera. */
const COMO_EN_EL_MOVIL = 'max-w-[375px] w-full mx-auto'
const REJILLA = { gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' } as const

type Vista = 'plantillas' | 'editor' | 'pasar' | 'historial'
/**
 * EL RELOJ DEL TEST, uno para todo. Antes cada cosa tenía el suyo y llevaba
 * una `clave`, así que solo podía andar uno: arrancar los parciales dejaba
 * parada la cuenta atrás, y un test que es «un minuto contando flexiones
 * mientras marco los pasos» no se podía pasar. Un test ocurre en UNA línea de
 * tiempo, y ahora eso es lo que hay.
 */
interface Reloj { desde: number; acu: number; corre: boolean }
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

/* Las tres clases, dichas por QUIÉN PONE EL NÚMERO y no por su nombre de
   dentro. «Dada / medida / calculada» es como se llaman en el código, y
   enseñarlo así obligaba a aprenderse el vocabulario antes de montar nada. */
const CLASES: Record<string, string> = {
  medida: 'Se mide en el test · una por persona',
  dada: 'La escribes tú antes · igual para todos',
  calculada: 'La saca la app de su misma fila',
}

/** Qué significa cada una, con ejemplo, justo debajo del desplegable. */
const CLASE_PISTA: Record<string, React.ReactNode> = {
  medida: <>Sale <b className="text-gray-300">vacía</b> y se rellena el día del test. Cada uno tiene la suya: el tiempo del 400, los metros del Cooper, el lactato.</>,
  dada: <>Es el <b className="text-gray-300">protocolo</b>: la escribes al montar el test y sale ya puesta para todos. La velocidad del escalón, la pendiente, el peso del cajón.</>,
  calculada: <>No se teclea: la app la saca de las <b className="text-gray-300">otras columnas de su fila</b>. La potencia de cada sprint a partir de su tiempo.</>,
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
  const [atletaHist, setAtletaHist] = useState<number | null>(null)
  const [mediciones, setMediciones] = useState<Medicion[]>([])
  const [cargandoHist, setCargandoHist] = useState(false)
  const [pidiendo, setPidiendo] = useState<Pidiendo | null>(null)
  const [reloj, setReloj] = useState<Reloj | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [cargado, setCargado] = useState(false)
  /* Cómo se está mirando la pantalla del test mientras se monta: ancha como
     en un ordenador, o a 375 px como en el móvil. */
  const [comoSeVe, setComoSeVe] = useState<'ancho' | 'movil'>('ancho')
  /* Empieza encendida: quien llega por primera vez necesita que le cuenten de
     qué va. Apagarla es un clic, y se recuerda. */
  const [ayuda, setAyuda] = useState(true)
  /* EL DESCANSO VA APARTE del reloj del test, que es de lo que se trata: corre
     mientras el del test sigue andando o está parado. */
  const [desc, setDesc] = useState<Reloj | null>(null)
  const descAvisado = useRef(false)

  /* Lo que se pitó la última vez, para pitar solo cuando CAMBIA. En refs y no
     en estado: cambiarlo no tiene que repintar nada. */
  const escPrevio = useRef<Record<string, number>>({})
  const avisado = useRef<Record<string, boolean>>({})
  const ritmoPrevio = useRef<Record<string, number>>({})
  const tramoPrevio = useRef<Record<string, number>>({})
  /* Las marcas absolutas del reloj compartido, por persona y columna. Con un
     reloj para todos, el tiempo de cada repetición es la resta con SU marca
     anterior: restar contra el reloj le daría a todos el del más rápido. */
  /* Los instantes de cada marca, por persona y columna, EN SU REPETICIÓN:
     lo que se guarda son duraciones, y de una duración no se puede sacar
     cuándo pasó. Lleva huecos a propósito —se puede marcar la 4.ª con la 3.ª
     en blanco—, y por eso no es un `number[]` a secas. */
  const marcas = useRef<Record<string, Record<string, Marcas>>>({})

  const atletaActivo = atletas[Math.min(activo, atletas.length - 1)] || null
  /* En el editor se prueba contra la caja de pruebas; al pasar el test, contra
     la de cada deportista. */
  const cajaActiva = vista === 'pasar' && atletaActivo ? String(atletaActivo.id) : PRUEBA
  const nombreActivo = vista === 'pasar' && atletaActivo ? atletaActivo.nombre : 'Probando'
  const datosDe = useCallback(
    (a: string): Datos => ({ ...proto, ...(med[a] || {}) }),
    [proto, med],
  )
  /* El aviso en franja vive ya en components/AvisoEnLinea, que salió de aquí.
     `decir` se queda porque lo llaman veinte sitios de este fichero. */
  const { aviso, ok: decirOk, mal: decirMal } = useAviso()
  const decir = (tipo: 'ok' | 'mal', texto: string) => (tipo === 'ok' ? decirOk : decirMal)(texto)

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
      if (localStorage.getItem(LLAVE_AYUDA) === 'no') setAyuda(false)
      const s = localStorage.getItem(LLAVE)
      const o = s ? JSON.parse(s) : null
      if (o?.test) {
        /* El borrador de antes guardaba la caja de pruebas con otro nombre.
           Se mueve en vez de perderse: alguien puede tener un test a medias. */
        const med = { ...(o.med || {}) }
        if (med._prueba && !med[PRUEBA]) { med[PRUEBA] = med._prueba; delete med._prueba }
        setTest(o.test); setProto(o.proto || {}); setMed(med)
        setAtletas(leerAtletas(o.atletas))
        setVista(o.vista === 'pasar' ? 'pasar' : 'editor')
        setPaso(Math.min(4, Math.max(1, o.paso || 1)))
      }
    } catch { /* ventana privada: se empieza de cero y ya */ }
    setCargado(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!cargado) return
    try { localStorage.setItem(LLAVE, JSON.stringify({ test, proto, med, atletas, vista, paso })) } catch { /* nada */ }
  }, [cargado, test, proto, med, atletas, vista, paso])

  // ---------- el latido del reloj ----------
  useEffect(() => {
    /* También con el descanso: si solo mirara al del test, el descanso se
       quedaría congelado en pantalla mientras corre por dentro. */
    if (!reloj?.corre && !desc?.corre) return
    const id = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(id)
  }, [reloj?.corre, desc?.corre])

  /* El pitido va en un efecto sin lista de dependencias a propósito: corre en
     cada repintado —diez veces por segundo mientras el reloj anda— y es la
     comparación con lo anterior quien decide. Con lista habría que acertar a
     meter ahí el tiempo, y un despiste lo dejaría mudo. */
  useEffect(() => {
    if (!test || !reloj?.corre || vista !== 'pasar') return
    const ms = ahora - reloj.desde + reloj.acu
    const datos = datosDe(cajaActiva)
    for (const bl of escalonadosDe(test)) {
      const dur = duracionDe(bl)
      const n = escalonAhora(bl, ms)
      const dentroMs = ms % (dur * 1000)
      const dentro = Math.floor(dentroMs / 1000)

      // 1. Al CAMBIAR. Nunca en el primero: ese no es un cambio, es la salida.
      const previo = escPrevio.current[bl.clave]
      const cambioEscalon = previo !== undefined && previo !== n
      if (cambioEscalon && bl.pitaCambio !== false) avisarEscalon()
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

    /* LA CUENTA ATRÁS, que pita aparte de los escalones. No es una manía de
       tenerlo separado: el bucle de arriba cuenta con el número RECORTADO al
       tope del protocolo, y con ese número el final de un bloque cerrado no
       ocurre nunca —un Cooper de 12 min volvería a empezar sin pitar—. Aquí se
       cuenta con las repeticiones enteras que lleva, que es lo que sabe
       acabarse. */
    for (const bl of cronometradosDe(test)) {
      const c = cuentaAtras(bl, ms)
      const previo = escPrevio.current[bl.clave]

      /* Suena al acabar cada repetición, incluida la última. Pasado el final no
         vuelve a sonar: el reloj sigue andando solo porque nadie lo ha parado,
         y sin esto cantaría cada doce minutos hasta que alguien se acordara. */
      const cambioRep = previo !== undefined && previo !== c.pasadas
      if (cambioRep && bl.pitaCambio !== false
        && (bl.modo !== 'cerrado' || c.pasadas <= bl.veces)) avisarEscalon()
      escPrevio.current[bl.clave] = c.pasadas

      /* Y al cambiar de tramo, igual que en los escalonados: en un 30-15 esa es
         la señal de dejar de correr. Se calla si la repetición acaba de cambiar,
         porque eso ya ha sonado y si no serían dos pitidos pegados. */
      if (c.tramo && !c.fin) {
        const tr = tramoEn(bl, ms % (duracionDe(bl) * 1000))
        const prevTr = tramoPrevio.current[bl.clave]
        if (tr && !cambioRep && prevTr !== undefined && prevTr !== tr.indice) pitar(1100, 130)
        if (tr) tramoPrevio.current[bl.clave] = tr.indice
      }

      /* El aviso de que queda poco: más agudo y más corto, para no confundirlo
         con el del final. Una vez por cosa que esté corriendo. */
      if ((bl.avisoAntes || 0) > 0 && !c.fin) {
        const llave = bl.clave + ':' + c.pasadas + ':' + c.tramo
        if (c.restante <= (bl.avisoAntes || 0) && c.restante > 0 && !avisado.current[llave]) {
          pitar(1400, 70); avisado.current[llave] = true
        }
      }
    }
  })

  /* EL PITIDO DEL DESCANSO. Suena UNA vez al llegar a cero: sin la bandera
     sonaría diez veces por segundo, que es lo que pasa cuando el aviso se
     cuelga del valor en vez de del cambio. */
  useEffect(() => {
    if (!desc?.corre || !test?.descanso) return
    const ms = ahora - desc.desde + desc.acu
    if (restanteDescanso(test.descanso, ms) > 0) { descAvisado.current = false; return }
    if (!descAvisado.current) { descAvisado.current = true; avisarEscalon() }
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

  /* ---------- VENIR DESDE UNA SESIÓN ----------
     El día de test de una sesión trae aquí su test, su gente y su fecha en la
     dirección: `/laboratorio?test=12&dep=35,36&fecha=2026-10-08`. Sin esto
     había que buscarlo en la lista, añadir a cada uno y corregir la fecha, a
     pie de pista y con gente esperando — que es justo cuando se apunta un test
     con la fecha de hoy en vez de la del día.

     MANDA LA DIRECCIÓN, no el borrador guardado en este navegador: si has
     pulsado «pasar el test» desde una sesión, lo que quieres es ese test.
     Se lee del navegador y no con `useSearchParams` para no envolver la página
     entera en un Suspense solo por esto, como en el resto de la aplicación. */
  const pedido = useRef(false)
  /* La regla del compilador avisa de poner estado desde un efecto, y aquí es
     justo lo que toca: la dirección solo se puede leer ya montados, y esto pasa
     UNA vez —lo sujeta la bandera— en cuanto la lista de tests ha llegado. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (pedido.current || !guardados.length) return
    pedido.current = true
    const p = new URLSearchParams(window.location.search)
    const id = Number(p.get('test'))
    if (!id) return
    const g = guardados.find(x => x.id === id)
    if (!g) { decir('mal', 'Ese test ya no está en tu lista.'); return }

    empezarCon(clon(g.def), 4, g.id)
    setVista('pasar')
    const f = p.get('fecha')
    if (f) setFecha(f)
    const quienes = (p.get('dep') || '').split(',').map(Number).filter(n => n > 0)
    const elegidos = deportistas.filter(d => quienes.includes(d.id))
    if (elegidos.length) { setAtletas(elegidos); setMed(cajasVacias(g.def, elegidos)) }
  }, [guardados, deportistas])
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const conDatos = atletas.filter(a => tieneAlgoEscrito(med[String(a.id)]))
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

  // ---------- LO QUE SE APUNTA, EN UN SOLO SITIO ----------
  /* Las usan las DOS pantallas: las filas por persona —que es lo que sirve
     para un grupo— y la tabla, tocando la casilla. Antes vivían sueltas dentro
     de las props de `Pasar`, así que la tabla no podía marcar nada y hubo que
     poner un botón al lado de cada cosa. */

  /** Lo que lleva el reloj, o null si no corre: marcar sin reloj no es marcar. */
  const msSiCorre = () => (reloj?.corre ? ahora - reloj.desde + reloj.acu : null)

  /* El tiempo de una casilla suelta es el del reloj TAL CUAL, no una resta:
     mide desde la salida, que es lo que significa «el 400». Por eso volver a
     marcar simplemente lo pisa. */
  const marcaSuelto = (c: Columna, k: string) => {
    const ms = msSiCorre(); if (ms === null) return
    const val = c.instrumento === 'crono-min' ? Math.round(ms / 600) / 100 : Math.round(ms / 100) / 10
    ponMed(k, d => { d[c.clave] = String(val) })
  }

  /* EL PARCIAL ES LA RESTA con lo que ya lleva marcado ESA persona, no con la
     marca anterior del reloj: restar contra el reloj le daría a todos el trozo
     del más rápido. */
  const parcial = (c: Columna, k: string) => {
    const ms = msSiCorre(); if (ms === null) return
    const lista = (datosDe(k)[c.clave] as unknown[] | undefined) || []
    const dur = parcialAhora(lista, ms)
    if (dur === null) return
    ponMed(k, d => { d[c.clave] = [...lista, String(dur)] })
  }

  /**
   * UN PARCIAL DENTRO DE UN BLOQUE: va a la casilla de SU repetición.
   *
   * La cuenta se hace contra TODAS las marcas de la columna, no contra las de
   * su fila: el reloj no se para entre serie y serie. Lo decide
   * `parcialAhora`, el mismo sitio que la casilla suelta.
   */
  const parcialEn = (c: Columna, bl: Bloque, k: string, fila: number) => {
    const ms = msSiCorre(); if (ms === null) return
    const todas = (datosDe(k)[c.clave] as unknown[] | undefined) || []
    const dur = parcialAhora(todas.flat(), ms)
    if (dur === null) return
    ponMed(k, d => {
      const l = Array.isArray(d[c.clave])
        ? [...(d[c.clave] as unknown[])]
        : Array.from({ length: bl.veces }, () => [] as string[])
      const suya = Array.isArray(l[fila]) ? [...(l[fila] as string[])] : []
      l[fila] = [...suya, String(dur)]
      d[c.clave] = l
    })
  }

  const quitaParcialEn = (c: Columna, k: string, fila: number) => ponMed(k, d => {
    if (!Array.isArray(d[c.clave])) return
    const l = [...(d[c.clave] as unknown[])]
    const suya = Array.isArray(l[fila]) ? (l[fila] as string[]) : []
    l[fila] = suya.slice(0, -1)
    d[c.clave] = l
  })

  const quitaParcial = (c: Columna, k: string) => ponMed(k, d => {
    const lista = (d[c.clave] as unknown[] | undefined) || []
    d[c.clave] = lista.slice(0, -1)
  })

  /* Nunca por debajo de cero: un contador en negativo no es una corrección, es
     un número que después entra en una fórmula. */
  const cuenta = (c: Columna, k: string, suma: number) => ponMed(k, d => {
    d[c.clave] = String(Math.max(0, (Number(d[c.clave]) || 0) + suma))
  })

  /* En un bloque el número va a SU repetición, no al montón: seis series de
     flexiones son seis números. */
  const cuentaEn = (c: Columna, bl: Bloque, k: string, rep: number, suma: number) => {
    const corta = parcialQueCorta(bl)
    /* SIN PARCIALES, un número por repetición y ya está. */
    if (!seCorta(bl, c) || !corta) {
      ponMed(k, d => {
        const l = Array.isArray(d[c.clave]) ? [...(d[c.clave] as string[])] : Array.from({ length: bl.veces }, () => '')
        l[rep - 1] = String(Math.max(0, (Number(l[rep - 1]) || 0) + suma))
        d[c.clave] = l
      })
      return
    }
    /* CON PARCIALES, la pulsación cae en el cajón del que esté abierto: los
       ciclos de ESTE 25, no los del 100 entero. Cuál es sale de cuántos
       parciales van marcados, así que no hay dos cuentas que puedan
       separarse. */
    const parcialesDeLaFila = ((datosDe(k)[corta.clave] as unknown[] | undefined) || [])[rep - 1]
    const cajon = cajonAhora(parcialesDeLaFila)
    ponMed(k, d => {
      const l = Array.isArray(d[c.clave])
        ? [...(d[c.clave] as unknown[])]
        : Array.from({ length: bl.veces }, () => [] as string[])
      const fila = Array.isArray(l[rep - 1]) ? [...(l[rep - 1] as string[])] : []
      /* Los cajones que se saltó quedan VACÍOS, no a cero: no contar es
         distinto de contar cero, y el recuento de huecos lo dirá. */
      while (fila.length < cajon) fila.push('')
      fila[cajon] = String(Math.max(0, (Number(fila[cajon]) || 0) + suma))
      l[rep - 1] = fila
      d[c.clave] = l
    })
  }

  /**
   * MARCAR UNA REPETICIÓN. `fila` es la casilla que se tocó; con -1 se marca la
   * primera libre, que es lo que hace el botón «Vuelta» de las filas por
   * persona. Las dos puertas, la misma cuenta.
   */
  const marcaVuelta = (c: Columna, bl: Bloque, k: string, fila: number) => {
    const ms = msSiCorre(); if (ms === null) return
    if (!marcas.current[k]) marcas.current[k] = {}
    const abs = marcas.current[k][c.clave] || []
    const i = fila >= 0 ? fila : primeroLibre(abs, bl.veces)
    if (i < 0 || i >= bl.veces) return
    const r = marcaEn(abs, i, ms, c.instrumento === 'crono-min')
    if (!r) return
    marcas.current[k][c.clave] = r.abs
    ponMed(k, d => {
      const l = Array.isArray(d[c.clave]) ? [...(d[c.clave] as string[])] : []
      l[i] = r.valor; d[c.clave] = l
    })
  }

  const deshaceVuelta = (c: Columna, k: string) => {
    const r = deshacer(marcas.current[k]?.[c.clave])
    if (r.k < 0) return
    marcas.current[k][c.clave] = r.abs
    ponMed(k, d => {
      const l = Array.isArray(d[c.clave]) ? [...(d[c.clave] as string[])] : []
      l[r.k] = ''; d[c.clave] = l
    })
  }

  /**
   * VERLO COMO SE VA A VER.
   *
   * El test se pasa casi siempre con el móvil en la mano, y a 375 px todo va
   * en una columna: el orden decide lo que ves sin bajar, con el atleta
   * esperando. Descubrirlo el jueves es tarde.
   *
   * ESTÁ EN LAS DOS PANTALLAS —montando y pasando— y escrito UNA vez. Vivía
   * suelto dentro del editor, y la de pasar el test, que es la que de verdad
   * se mira con el móvil, no lo tenía.
   *
   * En un móvil de verdad no se pinta: ahí ya estás viendo el móvil, y
   * preguntarte cómo quieres verlo sobra.
   */
  const esMovil = comoSeVe === 'movil'
  const cambiarAyuda = () => setAyuda(v => {
    try { localStorage.setItem(LLAVE_AYUDA, v ? 'no' : 'si') } catch { /* ventana privada */ }
    return !v
  })
  const verloComo = (
    <div className="hidden sm:flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Verlo como</span>
      <div className="flex rounded-lg border border-gray-700 overflow-hidden">
        {([['ancho', 'Ordenador'], ['movil', 'Móvil']] as const).map(([k, et]) => (
          <button key={k} onClick={() => setComoSeVe(k)}
            className={'text-[11.5px] px-3 py-1.5 transition ' +
              (comoSeVe === k ? 'bg-gray-800 text-white font-semibold' : 'text-gray-500 hover:text-gray-300')}>
            {et}
          </button>
        ))}
      </div>
      {esMovil && <span className="text-[11px] text-gray-500">375 px, todo en una columna</span>}
    </div>
  )

  const pegas = pegasDe(test)
  const previa = (
    <Previa test={test} proto={proto} med={med[cajaActiva] || {}} nombre={nombreActivo}
      onProto={(k, v) => setProto(p => ({ ...p, [k]: v }))}
      onMed={(k, v, i) => ponMed(cajaActiva, d => {
        if (i === undefined) { d[k] = v; return }
        const l = Array.isArray(d[k]) ? [...(d[k] as string[])] : []
        l[i] = v; d[k] = l
      })}
      onLlego={(bl, n) => ponMed(cajaActiva, d => { d['@' + bl] = Number(d['@' + bl]) === n ? '' : n })}
      ayuda={ayuda}
      /* LA CASILLA ES SU PROPIO BOTÓN. Todo apunta a la persona que está
         puesta arriba: la tabla es de uno, las filas por persona son del
         grupo. */
      toca={{
        corre: !!reloj?.corre,
        marcaBloque: (c, bl, k) => marcaVuelta(c, bl, cajaActiva, k),
        cuentaBloque: (c, bl, k, suma) => cuentaEn(c, bl, cajaActiva, k + 1, suma),
        marcaSuelto: c => marcaSuelto(c, cajaActiva),
        cuentaSuelto: (c, suma) => cuenta(c, cajaActiva, suma),
        parcial: c => parcial(c, cajaActiva),
        quitaParcial: c => quitaParcial(c, cajaActiva),
        parcialBloque: (c, bl, k) => parcialEn(c, bl, cajaActiva, k),
        quitaParcialBloque: (c, k) => quitaParcialEn(c, cajaActiva, k),
      }} />
  )

  /**
   * LA PANTALLA DEL TEST, la misma en los dos sitios.
   *
   * Se pinta al pasarlo de verdad y también mientras lo montas, con una
   * caja de pruebas en vez de gente. Está en una función y no copiada
   * porque una previa que se PARECE a la pantalla se queda atrás a la
   * primera: la de antes ni siquiera enseñaba el reloj, y el paso 4 decía
   * que era «exactamente» lo que te ibas a encontrar.
   */
  const pantallaDelTest = (op: { atletas: Atleta[]; montando?: boolean; anadir?: React.ReactNode }) => (
              <Pasar
                test={test} atletas={op.atletas} activo={op.atletas === atletas ? activo : 0} setActivo={setActivo}
              montando={op.montando} anadir={op.anadir}
                deportistas={deportistas} guardado={editandoId !== null} ayuda={ayuda} onAyuda={cambiarAyuda}
                hayDatos={op.atletas.some(a => tieneAlgoEscrito(med[String(a.id)]))}
                fecha={fecha} setFecha={setFecha} guardando={guardando}
                onGuardarMediciones={guardarMediciones}
                datosDe={datosDe} reloj={reloj} setReloj={setReloj} ahora={ahora}
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
                  const ms = reloj ? (reloj.corre ? ahora - reloj.desde + reloj.acu : reloj.acu) : 0
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
                /* La marca que se guarda es la del RELOJ COMPARTIDO, y el tiempo
                   de cada repetición es la resta con la anterior DE ESA PERSONA:
                   restar contra el reloj le daría a todos el del más rápido. Lo
                   decide `marcaVuelta`, el mismo sitio que la tabla. */
                onVuelta={(c, bl, a) => marcaVuelta(c, bl, String(a.id), -1)}
                onDeshace={(c, a) => deshaceVuelta(c, String(a.id))}
                /* BORRAR LO APUNTADO NO PARA EL RELOJ. Antes sí, porque el
                   reloj era de esa sección; ahora es el del test, y pararlo
                   porque alguien quiere limpiar una columna dejaría la cuenta
                   atrás y los parciales de los demás tirados. El reloj se pone a
                   cero en su propio botón. */
                onReinicia={(c, bl) => {
                  for (const a of atletas) {
                    const k = String(a.id)
                    if (marcas.current[k]) marcas.current[k][c.clave] = []
                    ponMed(k, d => { d[c.clave] = Array.from({ length: bl.veces }, () => '') })
                  }
                }}
                onReiniciaEsc={bl => {
                  escPrevio.current = {}; avisado.current = {}; ritmoPrevio.current = {}
                  for (const a of atletas) ponMed(String(a.id), d => { delete d['@' + bl.clave] })
                }}
                onMarcaSuelto={(c, a) => marcaSuelto(c, String(a.id))}
                onBorraSuelto={(c, a) => ponMed(String(a.id), d => { d[c.clave] = '' })}
                onReiniciaSuelto={c => {
                  /* Una casilla de parciales se vacía como LISTA: dejarla en
                     texto la rompería en la siguiente marca. */
                  const vacio = c.instrumento === 'parciales' ? [] : ''
                  for (const a of atletas) ponMed(String(a.id), d => { d[c.clave] = vacio })
                }}
                onParcial={(c, a) => parcial(c, String(a.id))}
                onParcialEn={(c, bl, a, fila) => parcialEn(c, bl, String(a.id), fila)}
                onQuitaParcialEn={(c, a, fila) => quitaParcialEn(c, String(a.id), fila)}
                onQuitaParcial={(c, a) => quitaParcial(c, String(a.id))}
                /* La pantalla se guarda EN EL ACTO si el test ya existe: pedirle
                   que vuelva al editor y le dé a «Guardar test» para que se
                   recuerde el orden es perder justo lo que esto ahorra. */
                onPantalla={async p => {
                  if (!test) return
                  const nuevo: TestLab = { ...clon(test), pantalla: tienePantalla(p) ? p : undefined }
                  setTest(nuevo)
                  if (editandoId && userId) {
                    const { error } = await supabase.from('test_definicion')
                      .update(paraGuardar(nuevo, userId)).eq('id', editandoId)
                    if (error) decir('mal', 'No se ha podido guardar la pantalla: ' + error.message)
                  }
                }}
                onCuentaEn={(c, bl, a, rep, suma) => cuentaEn(c, bl, String(a.id), rep, suma)}
                onCuenta={(c, a, suma) => cuenta(c, String(a.id), suma)}
                /* Poner a cero el RELOJ, no lo apuntado: son dos cosas, y
                   borrarle a alguien lo que llevaba marcado por querer reiniciar
                   el reloj es de las que no se perdonan. Lo apuntado se borra
                   desde cada sección. */
                onReiniciaReloj={() => {
                  setReloj(null)
                  escPrevio.current = {}; avisado.current = {}; ritmoPrevio.current = {}; tramoPrevio.current = {}
                }}
                desc={desc}
                /* El descanso tiene su propio arrancar: si compartiera el del
                   test, empezar a descansar pararía el reloj de la prueba. */
                onDescanso={accion => {
                  despertarAudio()
                  if (accion === 'cero') { setDesc(null); descAvisado.current = false; return }
                  setDesc(r => {
                    const base = r || { desde: 0, acu: 0, corre: false }
                    return base.corre
                      ? { ...base, acu: base.acu + (Date.now() - base.desde), corre: false }
                      : { ...base, desde: Date.now(), corre: true }
                  })
                  descAvisado.current = false
                  setAhora(Date.now())
                }}
                onArranca={() => {
                  despertarAudio()
                  setReloj(r => {
                    const base = r || { desde: 0, acu: 0, corre: false }
                    return base.corre
                      ? { ...base, acu: base.acu + (Date.now() - base.desde), corre: false }
                      : { ...base, desde: Date.now(), corre: true }
                  })
                  escPrevio.current = {}; avisado.current = {}; ritmoPrevio.current = {}
                  setAhora(Date.now())
                }} />
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {cabecera}
      {/* TODA LA PANTALLA. Esto vivía en 1152 px con el resto en hueco:
          la columna de la izquierda iba apretada —las fórmulas sobre todo— y
          la pantalla de la derecha no cabía entera. El tope está para que en
          un monitor muy ancho el formulario no se estire hasta ser ilegible. */}
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 py-5">
        <AvisoEnLinea aviso={aviso} className="mb-4" />
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
              <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
                <div>
                  {paso === 1 && <Paso1 test={test} mut={mut} />}
                  {paso === 2 && <Paso2 test={test} mut={mut} renombrar={renombrar} proto={proto}
                    setProto={setProto} cajas={Object.keys(med)} setMed={setMed}
                    pidiendo={pidiendo} setPidiendo={setPidiendo} avisar={decirMal} />}
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
                {/* LA DERECHA ES LA PANTALLA, no una previa que se le parece.
                    Antes aquí solo estaba la tabla y el paso 4 decía que era
                    «exactamente» lo que te ibas a encontrar: el reloj, los
                    parciales y el pulsador no estaban. Ahora es la misma, con
                    una caja de pruebas en vez de gente. */}
                <div className="lg:sticky lg:top-4 flex flex-col gap-3">
                  {verloComo}

                  <div className={'flex flex-col gap-4' + (esMovil ? ' ' + COMO_EN_EL_MOVIL : '')}>
                    {pantallaDelTest({
                      atletas: ATLETA_PRUEBA,
                      montando: true,
                      anadir: <BotonesAnadir test={test} mut={mut} setMed={setMed} cajas={Object.keys(med)} compacto />,
                    })}
                    {previa}
                  </div>
                </div>
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
          <div className="flex flex-col gap-3">
            {verloComo}
            {/* El mismo árbol con otras clases, no dos: cambiando de rama se
                reiniciaría lo que esté a medias en la tabla. */}
            <div className={esMovil
              ? 'flex flex-col gap-4 ' + COMO_EN_EL_MOVIL
              : 'grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]'}>
              {pantallaDelTest({ atletas })}
              <div className={esMovil ? '' : 'lg:sticky lg:top-4'}>{previa}</div>
            </div>
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
            {DEPORTES_TEST.map(d => <option key={d} value={d}>{etiquetaDisciplina(d)}</option>)}
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
// Añadir algo al test
// ============================================================
/**
 * Los botones de añadir, en UN sitio y usados en DOS.
 *
 * Se eligen aquí al crear la casilla —antes solo había «+ Casilla suelta» y la
 * forma de rellenarla era un desplegable dentro de la casilla ya creada, así
 * que el cronómetro, el pulsador y los parciales existían y no había manera de
 * encontrarlos—. Y se pintan también DENTRO de la pantalla del test, porque
 * montar un test es colocar la pantalla del jueves: lo que añades tiene que
 * aparecer donde lo vas a usar.
 */
function BotonesAnadir({ test, mut, setMed, cajas, compacto, onCreado }: {
  test: TestLab
  mut: (fn: (t: TestLab) => void) => void
  /* La misma firma que usa Paso2: solo se llama con una función. */
  setMed: (f: (m: Record<string, Datos>) => Record<string, Datos>) => void
  cajas: string[]
  compacto?: boolean
  /** La clave de lo que se acaba de crear, para preguntarle allí qué es. */
  onCreado?: (clave: string) => void
}) {
  const clase = (compacto ? btnSec + ' ' + btnMini : btnSec)
  const nuevaMedida = (clave: string, veces: number) =>
    setMed(m0 => {
      const m = { ...m0 }
      for (const a of cajas) m[a] = { ...(m[a] || {}), [clave]: Array.from({ length: veces }, () => '') }
      return m
    })

  /* DOS PUERTAS, y lo demás se pregunta DESPUÉS, en la casilla ya creada.
     Antes eran seis botones en fila: obligaban a decidir qué clase de cosa
     querías —cronómetro, pulsador, parciales— antes de tener nada delante, y
     con los seis nombres a secas no se sabía en qué se diferencian. */
  return (
    <div className={compacto ? 'flex gap-2 flex-wrap items-center' : 'flex gap-2.5 flex-wrap items-stretch'}>
      {compacto && <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Añadir</span>}

      <button className={clase + (compacto ? '' : ' flex flex-col items-start gap-0.5')} onClick={() => {
        const clave = nuevaClave(test, 'dato')
        mut(t => { t.sueltos.push(col({ clave, etiqueta: 'Nuevo dato' })) })
        setMed(m0 => { const m: Record<string, Datos> = {}; for (const a of Object.keys(m0)) m[a] = { ...m0[a], [clave]: '' }; return m })
        onCreado?.(clave)
      }}>
        <span>+ Una casilla</span>
        {!compacto && <span className="text-[10.5px] font-normal text-gray-500">un dato que se apunta una vez</span>}
      </button>

      <button className={clase + (compacto ? '' : ' flex flex-col items-start gap-0.5')} onClick={() => {
        const clave = nuevaClave(test, 'medida')
        const suya = 'b' + (test.bloques.length + 1)
        mut(t => {
          t.bloques.push({
            clave: suya, etiqueta: 'Repetición', modo: 'cerrado',
            veces: 6, duracion: 0, columnas: [col({ clave, etiqueta: 'Lo que mides' })],
          })
        })
        nuevaMedida(clave, 6)
        onCreado?.(suya)
      }}>
        <span>+ Un bloque</span>
        {!compacto && <span className="text-[10.5px] font-normal text-gray-500">algo que se repite, o que dura</span>}
      </button>
    </div>
  )

}

// ============================================================
// 2 · Qué se apunta
// ============================================================
function Paso2({ test, mut, renombrar, proto, setProto, cajas, setMed, pidiendo, setPidiendo, avisar }: {
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
  /** Para decir que falta algo sin abrir una ventana del navegador. */
  avisar: (texto: string) => void
}) {
  const repes = clavesRepetidas(test)
  /* Lo último que se ha creado: ahí se le pregunta qué es, en vez de pedirlo
     antes de tener nada delante. */
  const [reciente, setReciente] = useState<string | null>(null)

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
            reciente={reciente === c.clave}
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

            {/* LA PREGUNTA DEL BLOQUE. Son dos cosas distintas y antes había
                que saberlo antes de crearlo: uno se repite —6×100— y el otro
                dura —los 12 minutos del Cooper—. Lo que se mide dentro es el
                mismo en los dos. */}
            {reciente === bl.clave && (
              <div className="mb-2.5 flex gap-1.5 flex-wrap items-center">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">¿Qué es este bloque?</span>
                <button onClick={() => mut(t => { const x = t.bloques[bi]; x.veces = 6; x.duracion = 0 })}
                  className={FICHA + ' ' + (!duracionDe(bl)
                    ? 'bg-orange-500/20 border-orange-500/60 text-orange-200'
                    : 'bg-gray-800 border-gray-600 text-gray-300')}>
                  Se repite varias veces
                </button>
                <button onClick={() => mut(t => {
                  const x = t.bloques[bi]
                  x.veces = 1; x.duracion = 60; x.duracionUd = 's'
                  x.pitaCambio = true; x.avisoAntes = 10
                  if (!x.ritmo) x.ritmo = 'no'
                })}
                  className={FICHA + ' ' + (duracionDe(bl)
                    ? 'bg-orange-500/20 border-orange-500/60 text-orange-200'
                    : 'bg-gray-800 border-gray-600 text-gray-300')}>
                  Dura un tiempo fijo
                </button>
              </div>
            )}

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
              }}
              /* EL CRONÓMETRO ES UNA COLUMNA, no un ajuste del bloque: el tiempo
                 que marcas es un dato de cada persona y tiene que caer en su
                 fila. Por eso se pone reaprovechando una columna que ya se mida
                 a mano —ese suele ser el «Tiempo» que acabas de crear— y solo se
                 añade otra si no hay ninguna. */
              onCrono={() => {
                const aprovechable = bl.columnas.find(c => c.clase === 'medida' && c.instrumento === 'mano')
                if (aprovechable) {
                  mut(t => {
                    const c = t.bloques[bi].columnas.find(x => x.clave === aprovechable.clave)
                    if (c) { c.instrumento = 'crono-seg'; if (!c.unidad) c.unidad = 's' }
                  })
                  return
                }
                const clave = nuevaClave(test, 'tiempo')
                mut(t => {
                  t.bloques[bi].columnas.push(col({
                    clave, etiqueta: 'Tiempo', unidad: 's', instrumento: 'crono-seg',
                  }))
                })
                nuevaMedida(clave, bl.veces)
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
                    /* Antes esto no dejaba quitar la última: un bloque sin
                       columnas no medía nada. Desde la cuenta atrás sí tiene
                       sentido —«el minuto» de unas flexiones es solo reloj—,
                       así que se avisa y se deja. */
                    if (bl.columnas.length === 1 && !duracionDe(bl)) {
                      avisar('Este bloque se quedaría sin nada: ni casillas ni reloj. Quita el bloque entero.')
                      return
                    }
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

      {/* EL VACÍO SE DICE. Con el test recién empezado, este paso eran unos
          botones sueltos bajo un título: ni qué hay ni qué falta. */}
      {!test.sueltos.length && !test.bloques.length && (
        <p className="text-gray-500 text-[12.5px] border border-dashed border-gray-800 rounded-xl py-4 px-4 mb-3 leading-snug">
          Todavía no hay nada que apuntar. Lo que elijas aquí aparece <b className="text-gray-300">en la pantalla
          de la derecha</b>, que es la que vas a tener delante el día del test.
        </p>
      )}

      <BotonesAnadir test={test} mut={mut} setMed={setMed} cajas={cajas} onCreado={setReciente} />

      {/* EL DESCANSO NO ES UNA PUERTA MÁS: no apunta nada, es una herramienta
          para cantar el descanso entre series. Por eso va debajo y en pequeño,
          no al lado de «una casilla» y «un bloque». */}
      <div className="mt-3 flex items-center gap-2 flex-wrap text-[12.5px] text-gray-400">
        <button onClick={() => mut(t => { t.descanso = t.descanso ? undefined : 120 })}
          className={'text-[12px] px-2.5 py-1 rounded-lg border transition ' + (test.descanso
            ? 'bg-orange-500/14 border-orange-500/45 text-orange-200'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200')}>
          ☕ Cronómetro de descanso
        </button>
        {!!test.descanso && (
          <>
            de
            <input className={hueco + ' w-[76px] text-center font-mono'} inputMode="numeric"
              value={String(test.descanso)}
              onChange={e => mut(t => { t.descanso = Math.max(1, Math.round(Number(e.target.value) || 0)) })} />
            segundos · <span className="text-gray-500">{mmss(test.descanso)}</span>
          </>
        )}
        <span className="basis-full text-[11px] text-gray-600 mb-0">
          Un reloj aparte para el descanso entre series. No apunta nada: solo cuenta y pita.
        </span>
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
function FilaColumna({ c, bl, indice, test, proto, onCambio, onClase, onRenombra, onQuita, pidiendo, setPidiendo, reciente }: {
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
  /** Se acaba de crear: se le pregunta aquí qué clase de casilla es. */
  reciente?: boolean
}) {
  const dada = c.clase === 'dada'
  const calc = c.clase === 'calculada'
  const [verClave, setVerClave] = useState(false)

  /* EL NOMBRE ARRASTRA LA CLAVE mientras no la hayas tocado. En cuanto la
     cambias a mano dejan de ir juntas: renombrar la casilla no puede
     renombrarte una clave que elegiste tú. Y si la que tocaría ya está
     cogida, se queda la de antes: inventar «tiempo2» a espaldas de nadie es
     peor que no seguir el nombre. */
  const onNombre = (nuevo: string) => {
    const seguia = claveEsAutomatica(c.clave, c.etiqueta)
    onCambio('etiqueta', nuevo)
    if (!seguia) return
    const base = claveDesdeNombre(nuevo)
    if (base !== c.clave && !buscaCol(test, base)) onRenombra(base)
  }
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

      {/* LA CASILLA SE LEE COMO UNA FRASE, no como cinco campos en rejilla.
          Es lo que ya hace el reloj del bloque —«Cada 2 minutos el reloj pasa
          a la siguiente repetición»—, que es lo que mejor funciona de esta
          pantalla. Lo que se teclea está en la frase; lo que necesita más
          sitio (la progresión, la lista, la fórmula) sigue debajo. */}
      <div className={frase}>
        <input id={id + '-e'} className={hueco + ' min-w-[130px]'} value={c.etiqueta}
          placeholder="Cómo se llama" onChange={e => onNombre(e.target.value)} />
        en
        <input id={id + '-u'} className={hueco + ' w-[68px] text-center font-mono'} value={c.unidad}
          placeholder="s, m, kg" onChange={e => onCambio('unidad', e.target.value)} />
        <span className="-ml-1.5">,</span>
        <select id={id + '-c'} className={hueco} value={c.clase} onChange={e => onClase(e.target.value)}>
          <option value="medida">{CLASES.medida}</option>
          <option value="dada">{CLASES.dada}</option>
          {/* Calculada solo dentro de un bloque: fuera, una casilla que sale
              de otras es justo lo que ya es un resultado. */}
          {bl && <option value="calculada">{CLASES.calculada}</option>}
        </select>
        {!dada && !calc && (
          <>
            con
            <select id={id + '-i'} className={hueco} value={c.instrumento}
              onChange={e => onCambio('instrumento', e.target.value as Instrumento)}>
              {/* «Parciales» solo en una casilla suelta: dentro de un bloque la
                  lista ya la forman las repeticiones, y dos formas de hacer lo
                  mismo es cómo se acaba con dos que no hacen lo mismo. */}
              {(Object.keys(INSTRUMENTOS) as Instrumento[])
                /* Dentro de un bloque solo valen los de siempre: ni el pulsador
                   ni los parciales se pintan ahí, y ofrecer algo que luego no
                   aparece es justo el fallo que se arregló en los relojes.
                   Si un test viejo ya lo tiene puesto, se deja para no
                   cambiárselo a su espalda. */
                .filter(k => !SOLO_SUELTOS.includes(k) || !bl || c.instrumento === k)
                .map(k => <option key={k} value={k}>{etiquetaInstrumento(k, !!bl)}</option>)}
            </select>
          </>
        )}
        {/* CUÁNTOS PARCIALES. «Voy a tomar 4» es tan corriente como «los que
            salgan», y sin decirlo había que contarlos de cabeza. */}
        {!dada && !calc && c.instrumento === 'parciales' && (
          <>
            y espero
            <input className={hueco + ' w-[66px] text-center font-mono'} inputMode="numeric"
              placeholder="los que salgan" value={c.esperados ? String(c.esperados) : ''}
              onChange={e => {
                const n = Math.round(Number(e.target.value) || 0)
                onCambio('esperados', n > 0 ? n : undefined)
              }} />
          </>
        )}
        {dada && !bl && (
          <>
            <span className="-ml-1.5">:</span>
            <input id={id + '-v'} className={hueco + ' w-[88px] text-center font-mono'} value={c.valor || ''}
              placeholder="8" onChange={e => onCambio('valor', e.target.value)} />
          </>
        )}
      </div>

      {/* LA PREGUNTA, DESPUÉS Y AQUÍ. Elegir entre cronómetro, pulsador o
          parciales antes de tener la casilla delante era pedir una decisión a
          ciegas; con la casilla creada, es cambiarle una palabra. */}
      {reciente && !dada && !calc && (
        <div className="mt-2 flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">¿Cómo se rellena?</span>
          {(Object.keys(INSTRUMENTOS) as Instrumento[])
            .filter(k => !SOLO_SUELTOS.includes(k) || !bl)
            .map(k => (
              <button key={k} onClick={() => onCambio('instrumento', k)}
                className={FICHA + ' ' + (c.instrumento === k
                  ? 'bg-orange-500/20 border-orange-500/60 text-orange-200'
                  : 'bg-gray-800 border-gray-600 text-gray-300')}>
                {etiquetaInstrumento(k, !!bl)}
              </button>
            ))}
        </div>
      )}

      {/* La clave, pequeña y detrás: no se ve al pasar el test, es solo el
          nombre con el que la llaman las fórmulas. Se propone sola y se
          cambia si no vale. */}
      <p className="text-[10.5px] text-gray-600 mt-1.5 flex items-center gap-1.5 flex-wrap">
        {verClave ? (
          <>
            <span>En las fórmulas:</span>
            <input className={hueco + ' font-mono text-[11px] py-0.5 w-[150px]'} value={c.clave}
              onChange={e => onRenombra(e.target.value)} autoFocus />
            <button onClick={() => setVerClave(false)} className="underline hover:text-gray-400">listo</button>
          </>
        ) : (
          <>
            <span>En las fórmulas se llamará <code className="text-gray-500">{c.clave}</code>.</span>
            <button onClick={() => setVerClave(true)} className="underline hover:text-gray-400">Cambiar</button>
          </>
        )}
      </p>

      <p className="text-gray-500 text-[10.5px] leading-snug mt-1.5">
        {CLASE_PISTA[c.clase]}
        {!bl && <> <span className="text-gray-600">Fuera de un bloque no hay «la calcula la app»: una casilla que sale de otras ya es un resultado (paso 3).</span></>}
      </p>

      <div className={rejilla + ' mt-2.5'} style={REJILLA}>
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
          <MontaFormula nombres={nombresDe(test)}
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
  if (c.instrumento === 'contador') return <>Un <b className="text-white">botón grande por persona</b>: el número es el botón y sube al pulsarlo. Si el test lleva cuenta atrás, se bloquea al acabar.</>
  if (c.instrumento === 'parciales') return (
    <>Un reloj que <b className="text-white">no se para</b> y un botón por persona: cada marca queda apuntada.
      No hay que decir cuántas van a ser. Se guarda el parcial de cada trozo, y en la fórmula se le puede pedir
      la media, el mejor o cuántos hubo.</>
  )
  const u = c.instrumento === 'crono-min' ? 'minutos' : 'segundos'
  return bl
    ? <><b className="text-white">Así se marcan los parciales dentro de un bloque</b>: un botón por persona, cada pulsación
        cierra una repetición y la deja en su fila, en <b className="text-white">{u}</b>. El reloj no se para.</>
    : <>Al pararlo escribe <b className="text-white">{u}</b> aquí — cuéntalo así en la fórmula.</>
}

// ============================================================
// El reloj del bloque, escrito como una frase
// ============================================================
/* ESTO ERA LO QUE NO SE ENCONTRABA. El reloj existía, pero había que deducirlo:
   ponías una duración, luego una columna dada en progresión, y de ahí salía un
   reloj que canta la velocidad. Nadie piensa así. Se piensa «quiero que cada
   dos minutos cambie la velocidad y pite», y eso es lo que hay que poder decir. */
function RelojBloque({ bl, bi, mut, proto, onProgresion, onCrono }: {
  bl: Bloque; bi: number
  mut: (fn: (t: TestLab) => void) => void
  proto: Datos
  onProgresion: () => void
  onCrono: () => void
}) {
  const prog = bl.columnas.find(c => c.clase === 'dada' && c.tipo === 'progresion')
  /* LOS RELOJES DE UN BLOQUE SON DOS, y este sitio solo conocía uno. El otro
     —el cronómetro de toda la vida: empiezas, vas marcando y paras— existía,
     pero se encendía en la columna, en «cómo se rellena». Así que en la sección
     que se llama EL RELOJ ponía «este bloque no lleva reloj» mientras el
     cronómetro estaba puesto dos dedos más arriba. */
  const crono = bl.columnas.find(c => c.clase === 'medida' && c.instrumento.indexOf('crono') === 0)
  const marco = 'mt-3 border-t border-dashed border-gray-800 pt-3'
  const frase = 'flex items-center gap-2 flex-wrap text-[12.5px] text-gray-400 mt-2 pl-3 border-l-2 border-orange-500/35 leading-8'
  const mini = 'bg-gray-800 text-white text-[12.5px] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-orange-500 border border-transparent font-mono text-center w-[72px]'
  const sel = 'bg-gray-800 text-white text-[12.5px] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-orange-500 border border-transparent'
  const chip = (on: boolean) => 'font-mono text-[12px] px-2.5 py-1 rounded-md border transition ' +
    (on ? 'bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200' : 'bg-gray-800 border-gray-700 text-gray-300')

  /* Los dos relojes, dichos siempre los dos: el que manda él y el que mandas
     tú. Elegir entre dos cosas que se ven es una decisión; elegir entre una que
     se ve y otra que está escondida en otra pantalla, no. */
  const ponerCrono = (
    <button onClick={onCrono} className={btnSec + ' ' + btnMini}>
      ⏱ Que lo marques tú, con cronómetro
    </button>
  )
  const quePasaConElCrono = crono ? (
    <p className="text-[12px] text-gray-400 mb-2">
      <b className="text-white">Lleva cronómetro</b>, en «{crono.etiqueta || crono.clave}»: uno para todos y un botón por
      persona, y cada pulsación cierra una repetición. La repetición dura lo que dure.
      {' '}<span className="text-gray-500">Se quita desde esa casilla, en «cómo se rellena».</span>
    </p>
  ) : null

  if (!bl.duracion) {
    return (
      <div className={marco}>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">⏱ El reloj</p>
        {quePasaConElCrono || (
          <p className="text-[12px] text-gray-400 mb-2">
            Este bloque no lleva reloj todavía. Hay dos, y no hacen lo mismo:
            el del <b className="text-white">protocolo</b> pasa solo cada tanto —una VAM, un 30-15—,
            y el <b className="text-white">cronómetro</b> lo llevas tú y cada repetición dura lo que dure —un 6×100—.
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => mut(t => {
            /* Dos minutos y pitido al cambiar: es lo más corriente y es un punto
               de partida, no una ley. Todo se cambia en la frase de al lado. */
            const b = t.bloques[bi]
            b.duracion = 120; b.duracionUd = 'min'; b.pitaCambio = true; b.avisoAntes = 5
            if (!b.ritmo) b.ritmo = 'no'
          })} className={btnSec + ' ' + btnMini}>⏱ Que el reloj lleve el protocolo</button>
          {!crono && ponerCrono}
        </div>
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
          {bl.pitaCambio !== false ? '🔔 Avisa al cambiar' : '🔕 No avisa al cambiar'}
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

      {/* Y el otro reloj, también aquí: se pueden llevar los dos —el protocolo
          marca el escalón y tú cronometras algo dentro—, pero hasta ahora desde
          esta sección no había manera de saberlo ni de ponerlo. */}
      {crono ? (
        <div className={frase}>
          Y lleva <b className="text-white">cronómetro</b> en «{crono.etiqueta || crono.clave}»: un botón por persona, y cada
          pulsación cierra una repetición.
          <span className="text-gray-600">(se quita en su columna)</span>
        </div>
      ) : (
        <button onClick={onCrono} className={btnSec + ' ' + btnMini + ' mt-2.5 ml-0 sm:ml-2'}>
          + Que además puedas cronometrar a mano
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
              <MontaFormula nombres={nombresDe(test)}
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
        /* Y SE DICE DÓNDE SE USA. «Referencia tuya» a secas era una promesa sin
           destino: hasta que los tests del laboratorio entraron en el
           desplegable de referencias, esto no se podía elegir en ningún sitio. */
        : <>◈ Referencia tuya: {v.motivo} Podrás elegirla al prescribir y para colgarle tus zonas.</>}
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

/* La frase de una casilla: lo mismo que ya usa el reloj de un bloque. */
const frase = 'flex items-center gap-2 flex-wrap text-[13px] text-gray-400 leading-9 border-l-2 border-orange-500/35 pl-3'
const hueco = 'bg-gray-800 text-white text-[13px] rounded-lg px-2.5 py-1 outline-none focus:ring-1 focus:ring-orange-500 border border-transparent'

const FICHA = 'font-mono text-[12px] px-2.5 py-1 rounded-md border transition hover:brightness-125'
const colorFicha = (b: Bloq) => b.t === 'fn2' ? 'bg-emerald-500/14 border-emerald-400/40 text-emerald-200'
  : b.t === 'fn' ? 'bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'
  : b.t === 'var' ? 'bg-orange-500/14 border-orange-500/45 text-orange-200'
    : b.t === 'ref' ? 'bg-violet-500/14 border-violet-400/45 text-violet-200'
      : b.t === 'antes' ? 'bg-sky-500/14 border-sky-400/45 text-sky-200'
        : b.t === 'num' ? 'bg-blue-500/14 border-blue-400/40 text-blue-200'
          : 'bg-gray-800 border-gray-600 text-gray-300'

/**
 * Cómo se lee una ficha de la fórmula.
 *
 * CON EL NOMBRE DE LA CASILLA, no con su clave: «media de Tiempo» y no
 * «media(t100)». Con seis casillas había que subir a mirar qué era «t100», y
 * una fórmula que no se puede leer no se puede revisar.
 */
const textoFicha = (b: Bloq, nombres?: Record<string, string>): string =>
  b.t === 'fn' ? etiquetaFn(b, nombres)
    : b.t === 'fn2' ? etiquetaFn2(b, nombres)
      : b.t === 'antes' ? 'antes de ' + b.v
        : b.t === 'var' ? ((nombres && nombres[String(b.v)]) || String(b.v))
          : String(b.v)

/** Cómo se llama cada casilla, para que las fórmulas se lean. */
const nombresDe = (t: TestLab | null): Record<string, string> => {
  const o: Record<string, string> = {}
  for (const c of t?.sueltos || []) if (c.etiqueta) o[c.clave] = c.etiqueta
  for (const x of todasLasColumnas(t)) if (x.c.etiqueta) o[x.c.clave] = x.c.etiqueta
  return o
}

/**
 * El montador de fórmulas, que sirve para las dos.
 *
 * La diferencia entre una y otra es QUÉ VALE UN NOMBRE. En un resultado, el
 * nombre de una columna vale la serie entera y hay que decir qué se le pide; en
 * una columna calculada vale UN número, el de su repetición, y por eso ahí no
 * se ofrecen funciones. Escribir dos montadores habría dejado que uno ofreciera
 * lo que el otro prohíbe.
 */
function MontaFormula({ formula, clave, escalares, series, refs, previos = [], nombres, pidiendo, setPidiendo, onCambio }: {
  formula: Bloq[]
  clave: string
  escalares: string[]
  series: { clave: string; veces: number }[]
  /** Clave → cómo se llama, para que las fichas se puedan leer. */
  nombres?: Record<string, string>
  refs: string[]
  /** Los que se le pueden pedir a `antes()`. Vacío en una columna calculada. */
  previos?: string[]
  pidiendo: Pidiendo | null
  setPidiendo: (p: Pidiendo | null) => void
  onCambio: (f: Bloq[]) => void
}) {
  const mio = pidiendo?.clave === clave ? pidiendo : null
  const pon = (b: Bloq) => { onCambio([...formula, b]); setPidiendo(null) }

  /* LAS PREGUNTAS, AQUÍ DENTRO. Eran cinco `prompt()` —la ventana gris del
     navegador—, y la política de avisos de la aplicación dice que esa ventana
     es para errores de guardado, no para pedir un dato: en el móvil sale como
     un aviso del sistema. Van con su valor de siempre puesto para que lo
     normal sea pulsar y seguir. */
  const [cual, setCual] = useState('2')
  const [desde, setDesde] = useState('2')
  const [hasta, setHasta] = useState('3')
  const [aValor, setAValor] = useState('4')
  const [numero, setNumero] = useState('100')
  /* Qué ficha está abierta. Pulsar una la ABRE en vez de borrarla: antes un
     clic la quitaba, así que cambiar «media» por «mínimo» obligaba a rehacer
     la fórmula entera — y si la ficha estaba en medio de una larga, peor. */
  const [tocada, setTocada] = useState<number | null>(null)
  const entero = (t: string, min = 1) => Math.max(min, Math.round(Number(t) || min))
  const chico = 'bg-gray-800 text-white text-[12px] rounded-md px-2 py-1 w-[52px] text-center font-mono outline-none focus:ring-1 focus:ring-orange-500 border border-gray-600'

  return (
    <>
      <div className="bg-[#0b1220] border border-dashed border-gray-700 rounded-xl px-2.5 py-2 flex flex-wrap gap-1.5 items-center min-h-[44px]">
        {formula.length === 0
          ? <span className="text-gray-600 text-[12.5px] italic">Móntala con los bloques de abajo</span>
          : formula.map((b, n) => (
            <button key={n} title="Tocarla" onClick={() => setTocada(t => (t === n ? null : n))}
              className={FICHA + ' ' + colorFicha(b) + (tocada === n ? ' ring-2 ring-orange-500 ring-offset-2 ring-offset-[#0b1220]' : '')}>
              {textoFicha(b, nombres)}
            </button>
          ))}
      </div>

      {/* LO QUE SE PUEDE HACER CON LA FICHA TOCADA. Cambiar la función y el
          tramo son las dos cosas que se corrigen cada día; quitarla va al
          final y en rojo, para que no sea lo primero que pulsas. */}
      {tocada !== null && formula[tocada] && (() => {
        const b = formula[tocada]
        const cambia = (nuevo: Bloq) => { onCambio(formula.map((x, k) => (k === tocada ? nuevo : x))); setTocada(null) }
        return (
          <div className="mt-2 rounded-xl border border-dashed border-orange-500/40 bg-orange-500/[0.05] p-2.5 flex gap-1.5 flex-wrap items-center">
            <span className="text-[11.5px] text-gray-400 mr-1">{textoFicha(b, nombres)}:</span>
            {b.t === 'fn' && (Object.keys(FUNCIONES) as Funcion[]).filter(f => f !== b.v).map(f => (
              <button key={f} className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
                onClick={() => cambia({ ...b, v: f })}>{f}</button>
            ))}
            {b.t === 'fn' && !(b.d && b.d === b.h) && (
              <>
                <span className="text-[11.5px] text-gray-500 ml-1">de cuáles:</span>
                {([['todas', 0, 0], ['sin la 1.ª', 2, 0], ['sin la última', 0, -1]] as const).map(([et, d, h]) => (
                  <button key={et} className={FICHA + ' bg-gray-800 border-gray-600 text-gray-300'}
                    onClick={() => cambia({ ...b, d: d || undefined, h: h || undefined })}>{et}</button>
                ))}
              </>
            )}
            {b.t === 'num' && (
              <>
                <input className={chico + ' w-[78px]'} inputMode="decimal" defaultValue={String(b.v)}
                  onChange={e => setNumero(e.target.value)} />
                <button className={FICHA + ' bg-blue-500/14 border-blue-400/40 text-blue-200'}
                  onClick={() => { const n = Number(String(numero).replace(',', '.')); if (Number.isFinite(n)) cambia({ t: 'num', v: n }) }}>Cambiarlo</button>
              </>
            )}
            <button className={FICHA + ' bg-gray-800 border-gray-600 text-gray-400 ml-auto'}
              onClick={() => setTocada(null)}>Dejarla</button>
            <button className={FICHA + ' bg-red-500/10 border-red-500/40 text-red-300'}
              onClick={() => { onCambio(formula.filter((_, k) => k !== tocada)); setTocada(null) }}>Quitarla</button>
          </div>
        )
      })()}

      <div className="mt-2.5 flex flex-col gap-2">
        <Grupo et={series.length ? 'Casillas y columnas' : 'Lo que puedes usar aquí'}>
          {escalares.map(k => (
            <button key={k} className={FICHA + ' bg-orange-500/14 border-orange-500/45 text-orange-200'}
              onClick={() => pon({ t: 'var', v: k })}>{(nombres && nombres[k]) || k}</button>
          ))}
          {series.map(s => (
            <button key={s.clave} className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
              onClick={() => setPidiendo({ clave, col: s.clave, fn: null })}>
              {(nombres && nombres[s.clave]) || s.clave} <span className="opacity-60">×{s.veces}</span>
            </button>
          ))}
          {!escalares.length && !series.length && <span className="text-gray-600 text-[12.5px] italic">Nada todavía</span>}
        </Grupo>

        {mio && !mio.fn && (
          <Grupo et={'De «' + ((nombres && nombres[mio.col]) || mio.col) + '», ¿qué quieres?'} escalon>
            {(Object.keys(FUNCIONES) as Funcion[]).map(f => (
              <button key={f} className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
                onClick={() => setPidiendo({ ...mio, fn: f })}>
                {f}() <span className="opacity-60">{FUNCIONES[f]}</span>
              </button>
            ))}
            {/* «Quiero la 2.ª» es una pregunta tan corriente como «quiero la
                media», y no tenía por qué pasar por elegir una función: de una
                sola repetición, la suma y la media son el mismo número. */}
            <span className="flex items-center gap-1.5 text-[12px] text-gray-400">
              o solo la
              <input className={chico} inputMode="numeric" value={cual} onChange={e => setCual(e.target.value)} />
              .ª
              <button className={FICHA + ' bg-orange-500/14 border-orange-500/45 text-orange-200'}
                onClick={() => { const k = entero(cual); pon(fnB('suma', mio.col, k, k)) }}>Ponerla</button>
            </span>
          </Grupo>
        )}

        {mio?.fn && (
          <Grupo et={mio.fn + ' de «' + ((nombres && nombres[mio.col]) || mio.col) + '» ¿de cuáles?'} escalon>
            {([['De todas', 0, 0], ['Sin la primera', 2, 0], ['Sin la última', 0, -1]] as const).map(([n, d, h]) => (
              <button key={n} className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
                onClick={() => pon(fnB(mio.fn!, mio.col, d, h))}>{n}</button>
            ))}
            <span className="flex items-center gap-1.5 text-[12px] text-gray-400">
              de la
              <input className={chico} inputMode="numeric" value={desde} onChange={e => setDesde(e.target.value)} />
              a la
              <input className={chico} inputMode="numeric" value={hasta} onChange={e => setHasta(e.target.value)} />
              <button className={FICHA + ' bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'}
                onClick={() => pon(fnB(mio.fn!, mio.col, entero(desde), entero(hasta, 0)))}>Ponerlo</button>
            </span>
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
                  /* A «interpola» le queda una pregunta —a qué valor—, y se
                     hace aquí dentro como la del Dmax. */
                  if (mio.fn2 === 'interpola') { setPidiendo({ ...mio, y: s.clave }); return }
                  pon({ t: 'fn2', v: mio.fn2!, x: mio.x!, y: s.clave })
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

        {mio?.fn2 === 'interpola' && mio.x && mio.y && (
          <Grupo et={'¿A qué valor de «' + ((nombres && nombres[mio.y]) || mio.y) + '»?'} escalon>
            <input className={chico + ' w-[78px]'} inputMode="decimal" value={aValor}
              onChange={e => setAValor(e.target.value)} autoFocus />
            <button className={FICHA + ' bg-emerald-500/14 border-emerald-400/40 text-emerald-200'}
              onClick={() => {
                const n = Number(String(aValor).replace(',', '.'))
                if (!Number.isFinite(n)) return
                pon({ t: 'fn2', v: 'interpola', x: mio.x!, y: mio.y!, a: n })
              }}>Ponerlo</button>
            <p className="text-gray-500 text-[11px] leading-snug w-full mt-1">
              El umbral de 4 mmol/L es esto: a qué velocidad llega el lactato a 4. Si ese día no llegó,
              no se lo inventa — lo dice.
            </p>
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
            onClick={() => { const n = Number(String(numero).replace(',', '.')); if (Number.isFinite(n)) pon({ t: 'num', v: n }) }}>Poner el número</button>
          <input className={chico + ' w-[78px]'} inputMode="decimal" value={numero}
            onChange={e => setNumero(e.target.value)} />
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
/**
 * LO QUE PUEDE HACER UNA CASILLA DE LA TABLA.
 *
 * La tabla ya dice de qué repeticion y de que columna es cada casilla, asi que
 * tocarla no necesita explicarse. El boton aparte tenia que repetirlo —«vas por
 * la 3 de 6»— y ademas podia contradecirla.
 */
interface Toca {
  corre: boolean
  marcaBloque: (c: Columna, bl: Bloque, k: number) => void
  cuentaBloque: (c: Columna, bl: Bloque, k: number, suma: number) => void
  marcaSuelto: (c: Columna) => void
  cuentaSuelto: (c: Columna, suma: number) => void
  parcial: (c: Columna) => void
  quitaParcial: (c: Columna) => void
  parcialBloque: (c: Columna, bl: Bloque, k: number) => void
  quitaParcialBloque: (c: Columna, k: number) => void
}

/**
 * UNA CASILLA QUE ES SU PROPIO BOTON.
 *
 * Tres comportamientos, porque son tres cosas distintas y fingir que son la
 * misma es lo que hacia falta explicar:
 *
 * - PULSADOR: se toca MUCHAS veces y cada una suma. El «−1» sale solo cuando
 *   hay algo que corregir, pequeno y debajo: corregir no puede ser tan facil
 *   como contar.
 * - CRONOMETRO: se toca UNA vez. Vacia, es un boton que invita; con tiempo
 *   dentro, tocarla la abre para escribir. Volver a tocarla NO la pisa — un
 *   dedo gordo no puede borrar una marca buena.
 * - A MANO: la caja de siempre, que no la pone ningun instrumento.
 */
function Casilla({ v, valor, c, corre, abierta, abre, cierra, onToca, onMenos, onEscribe, alto }: {
  v: string
  /** El dato sin convertir a texto: una casilla de parciales guarda una LISTA. */
  valor?: unknown
  c: Columna
  corre: boolean
  abierta: boolean
  abre: () => void
  cierra: () => void
  onToca?: () => void
  onMenos?: () => void
  onEscribe: (v: string) => void
  alto?: boolean
}) {
  const caja = (
    <input autoFocus={abierta} onBlur={cierra}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
      className={(c.instrumento !== 'mano' ? campoMed : campo) + ' font-mono tabular-nums'} inputMode="decimal"
      value={v} onChange={e => onEscribe(e.target.value)} />
  )
  if (c.instrumento === 'mano' || !onToca) return caja

  /* PARCIALES: la casilla guarda VARIAS marcas, así que no hay nada que
     escribir —se toca y se añade— y lo que se enseña son los acumulados, que
     es lo que se lee a pie de pista: 0:03.0 · 0:06.8. */
  if (c.instrumento === 'parciales') {
    const lista = Array.isArray(valor) ? valor : []
    const acum = acumuladosDe(lista)
    return (
      <div className="flex flex-col gap-0.5">
        <button onClick={onToca} disabled={!corre}
          title={corre ? 'Toca para marcar un parcial' : 'Arranca el reloj y toca aquí'}
          className={'w-full text-left rounded-lg border transition ' + (alto ? 'px-3 py-2.5' : 'px-2 py-2') + ' ' + (corre
            ? 'border-orange-500/55 bg-orange-500/[0.08] hover:bg-orange-500/[0.18] active:bg-orange-500/30'
            : 'border-gray-700 cursor-not-allowed')}>
          <span className="block font-mono text-[12px] text-blue-200 leading-snug">
            {acum.length
              ? acum.map(t => mmss(t)).join(' · ')
              : <span className="text-gray-600 italic">{corre ? 'toca para marcar' : 'sin marcar'}</span>}
          </span>
          {(acum.length > 0 || c.esperados) && (
            <span className="block text-[10.5px] text-gray-500 mt-1">
              {c.esperados
                ? acum.length + ' de ' + c.esperados + (acum.length >= c.esperados ? ' ✓' : '')
                : acum.length + (acum.length === 1 ? ' parcial' : ' parciales')}
            </span>
          )}
        </button>
        {acum.length > 0 && onMenos && (
          <button onClick={onMenos} className="self-end text-[10.5px] text-gray-500 hover:text-gray-200 px-1 transition">deshacer</button>
        )}
      </div>
    )
  }

  if (abierta) return caja

  /* Un pulsador CORTADO con los parciales enseña sus cajones: 6 · 7 · 7 · 8.
     El que crece es el último, que es el 25 que se está nadando. */
  if (c.instrumento === 'contador' && Array.isArray(valor)) {
    const cajones = valor as string[]
    const ultimo = cajones.length - 1
    return (
      <div className="flex flex-col gap-0.5">
        <button onClick={onToca} title="Toca para sumar uno al parcial que va"
          className={'w-full rounded-lg border border-orange-500/45 bg-orange-500/[0.14] hover:bg-orange-500/25 active:bg-orange-500/45 transition ' + (alto ? 'px-3 py-2.5' : 'px-2 py-2')}>
          <span className="block font-mono tabular-nums leading-snug text-orange-300 text-[13px]">
            {cajones.length
              ? cajones.map((x, i) => (
                <span key={i} className={i === ultimo ? 'text-orange-200 font-bold' : ''}>
                  {i ? ' · ' : ''}{x === '' ? '–' : x}
                </span>
              ))
              : <span className="text-gray-500 italic text-[11.5px]">toca para contar</span>}
          </span>
          {cajones.length > 0 && (
            <span className="block text-[10.5px] text-gray-500 mt-1">
              {cajones.length === 1 ? '1 parcial' : cajones.length + ' parciales'}
            </span>
          )}
        </button>
        {cajones.length > 0 && onMenos && (
          <button onClick={onMenos} className="self-end text-[10.5px] text-gray-500 hover:text-gray-200 px-1 transition">−1</button>
        )}
      </div>
    )
  }

  if (c.instrumento === 'contador') {
    const n = Number(v) || 0
    return (
      <div className="flex flex-col gap-0.5">
        <button onClick={onToca} title="Toca para sumar uno"
          className={'w-full rounded-lg border border-orange-500/45 bg-orange-500/[0.14] hover:bg-orange-500/25 active:bg-orange-500/45 transition ' + (alto ? 'px-3 py-3' : 'px-2 py-2')}>
          <span className={'block font-mono tabular-nums leading-none text-orange-300 ' + (alto ? 'text-[26px]' : 'text-[19px]')}>{n}</span>
        </button>
        {n > 0 && onMenos && (
          <button onClick={onMenos} className="self-end text-[10.5px] text-gray-500 hover:text-gray-200 px-1 transition">−1</button>
        )}
      </div>
    )
  }

  /* Cronometro. */
  if (!v) return (
    <button onClick={onToca} disabled={!corre}
      title={corre ? 'Toca para marcar' : 'Arranca el reloj y toca aqui'}
      className={'w-full rounded-lg border border-dashed text-[11.5px] transition ' + (alto ? 'px-3 py-3' : 'px-2 py-2.5') + ' ' + (corre
        ? 'border-orange-500/55 text-orange-300 hover:bg-orange-500/15 active:bg-orange-500/30'
        : 'border-gray-700 text-gray-600 cursor-not-allowed')}>
      {corre ? 'marcar' : 'sin reloj'}
    </button>
  )
  return (
    <button onClick={abre} title="Tocala para corregirla"
      className={'w-full text-left rounded-lg border border-orange-500/50 bg-orange-500/10 font-mono tabular-nums text-white hover:border-orange-400 transition ' + (alto ? 'px-3 py-2.5 text-[15px]' : 'px-2.5 py-2 text-[13px]')}>
      {v}
    </button>
  )
}

function Previa({ test, proto, med, nombre, onProto, onMed, onLlego, toca, ayuda }: {
  test: TestLab
  proto: Datos
  med: Datos
  nombre: string
  onProto: (clave: string, valor: string) => void
  onMed: (clave: string, valor: string, indice?: number) => void
  onLlego: (bloque: string, n: number) => void
  toca?: Toca
  ayuda?: boolean
}) {
  /* Que casilla esta abierta para escribir. Una sola: abrir la siguiente
     cierra la anterior, que es lo que pasa al tocar fuera. */
  const [abierta, setAbierta] = useState('')
  const datos: Datos = { ...proto, ...med }
  const vals = calcular(test, datos)
  const dados = test.sueltos.filter(c => c.clase === 'dada')
  const mios = test.sueltos.filter(c => c.clase !== 'dada')
  const grupo = 'text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5'

  if (!test.sueltos.length && !test.bloques.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 text-[12px] font-bold">La tabla · lo que se apunta</div>
        <div className="p-4 text-gray-600 text-[12.5px] italic">Todavía no hay nada que apuntar. Añade una casilla o un bloque.</div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-bold">La tabla · lo que se apunta</span>
        <span className="text-[10.5px] text-gray-500 ml-auto truncate">{nombre}</span>
        {/* DÓNDE VA ESTO DE VERDAD. En el editor cae debajo del reloj porque
            la columna es estrecha, que es la forma del móvil; al pasarlo en
            un ordenador va AL LADO. Sin decirlo, parece que la pantalla sale
            partida en dos. */}
        <span className={(ayuda === false ? 'hidden ' : '') + 'text-[10.5px] text-gray-500 basis-full leading-snug'}>
          Al pasarlo va <b className="text-gray-400">al lado del reloj</b> en el ordenador, y debajo en el móvil — como aquí.
        </span>
      </div>
      <div className="p-4">
        {/* AQUÍ IBA UN CARTEL que decía «al pasarlo llevará reloj: … no se
            pinta aquí para no tapar la tabla». Era verdad cuando esto era lo
            único de la derecha; ahora el reloj está pintado justo encima y el
            cartel se contradecía con lo que se veía. */}

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
              {/* UN BLOQUE PUEDE SER SOLO UN RELOJ. Desde que existe la cuenta
                  atrás, un bloque sin columnas es legítimo —«el minuto» de unas
                  flexiones— y pintarle una tabla con la cabecera vacía parecía
                  que algo se había roto. */}
              {!bl.columnas.length && (
                <p className="text-gray-600 text-[12px] italic mb-0">Solo lleva reloj: aquí no se apunta nada.</p>
              )}
              <div className={bl.columnas.length ? 'overflow-x-auto' : 'hidden'}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      {bl.columnas.map(c => (
                        <th key={c.clave} className="text-left text-[9.5px] uppercase tracking-wide text-gray-500 font-bold px-1.5 py-1 border-b border-gray-800 align-bottom">
                          {c.etiqueta || c.clave}
                          <span className="block normal-case tracking-normal font-normal text-[10px] text-gray-600">
                            {/* LO QUE HACE LA CASILLA, no quién la rellena. Antes
                                ponía «lo pone el cronómetro», que es verdad pero
                                deja esperando: no decía que para que lo ponga hay
                                que tocarla. */}
                            {c.clase === 'dada' ? 'la pones tú'
                              : c.instrumento === 'mano' ? 'la escribes aquí'
                                : c.instrumento === 'contador' ? (seCorta(bl, c) ? 'tócala y suma al parcial que va' : 'tócala y suma uno')
                                  : c.instrumento === 'parciales' ? 'tócala y añade un parcial'
                                    : 'tócala y marca'}
                            {c.unidad ? ' · ' + c.unidad : ''}
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
                          {bl.columnas.map(c => {
                            const id = bl.clave + '|' + c.clave + '|' + k
                            return (
                            <td key={c.clave} className="px-1.5 py-1 border-b border-gray-800/60">
                              {c.clase === 'dada'
                                ? <span className="font-mono text-[12.5px] text-blue-300 whitespace-nowrap">{String(valorDado(c, k, datos))}</span>
                                : <Casilla
                                  v={String((med[c.clave] as string[] | undefined)?.[k] ?? '')}
                                  valor={(med[c.clave] as unknown[] | undefined)?.[k]}
                                  c={c} corre={!!toca?.corre}
                                  abierta={abierta === id} abre={() => setAbierta(id)} cierra={() => setAbierta('')}
                                  onToca={!toca ? undefined
                                    : c.instrumento === 'contador' ? () => toca.cuentaBloque(c, bl, k, 1)
                                      : c.instrumento === 'parciales' ? () => toca.parcialBloque(c, bl, k)
                                        : () => toca.marcaBloque(c, bl, k)}
                                  onMenos={!toca ? undefined
                                    : c.instrumento === 'contador' ? () => toca.cuentaBloque(c, bl, k, -1)
                                      : c.instrumento === 'parciales' ? () => toca.quitaParcialBloque(c, k)
                                        : undefined}
                                  onEscribe={v => onMed(c.clave, v, k)} />}
                            </td>
                          )})}
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
                  {/* LA MISMA CASILLA QUE EN LA TABLA, a propósito. Aquí había
                      una copia aparte para los parciales —una lista no se
                      teclea— y al poder vivir también dentro de un bloque
                      habrían sido dos que acaban comportándose distinto. */}
                  <Casilla
                    v={String(med[c.clave] ?? '')} valor={med[c.clave]}
                    c={c} corre={!!toca?.corre} alto
                    abierta={abierta === c.clave} abre={() => setAbierta(c.clave)} cierra={() => setAbierta('')}
                    onToca={!toca ? undefined
                      : c.instrumento === 'contador' ? () => toca.cuentaSuelto(c, 1)
                        : c.instrumento === 'parciales' ? () => toca.parcial(c)
                          : () => toca.marcaSuelto(c)}
                    onMenos={!toca ? undefined
                      : c.instrumento === 'contador' ? () => toca.cuentaSuelto(c, -1)
                        : c.instrumento === 'parciales' ? () => toca.quitaParcial(c)
                          : undefined}
                    onEscribe={v => onMed(c.clave, v)} />
                  {/* SE DICE QUÉ HACE AL TOCARLA. Antes esto decía quién la
                      rellenaba —«lo pone el cronómetro»— porque la casilla era
                      una caja vacía y parecía que había que escribirla a mano.
                      Ahora la casilla ES el botón, así que lo que hay que decir
                      es qué pasa al tocarla. */}
                  {c.instrumento !== 'mano' && (
                    <span className="block text-[10.5px] text-gray-500 mt-1">
                      {c.instrumento === 'contador' ? 'tócalo y suma uno'
                        : c.instrumento === 'parciales' ? 'tócalo y añade un parcial'
                          : med[c.clave] ? 'tócalo para corregirlo' : 'tócalo y lo pone el cronómetro'}
                    </span>
                  )}
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
  onGuardarMediciones, datosDe, reloj, ahora,
  onAtleta, onQuitaAtleta, onBajo, onVuelta, onDeshace, onReinicia, onReiniciaEsc, onArranca, onReiniciaReloj,
  ayuda, onAyuda, hayDatos,
  onMarcaSuelto, onBorraSuelto, onReiniciaSuelto, onCuenta, onCuentaEn, onParcial, onQuitaParcial,
  onParcialEn, onQuitaParcialEn, onPantalla,
  desc, onDescanso,
  montando = false, anadir,
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
  onAtleta: (a: Atleta) => void
  onQuitaAtleta: (i: number) => void
  onBajo: (bl: Bloque, a: Atleta) => void
  onVuelta: (c: Columna, bl: Bloque, a: Atleta) => void
  onDeshace: (c: Columna, a: Atleta) => void
  onReinicia: (c: Columna, bl: Bloque) => void
  onReiniciaEsc: (bl: Bloque) => void
  onArranca: () => void
  onReiniciaReloj: () => void
  ayuda: boolean
  onAyuda: () => void
  /** Si alguien tiene ya algo apuntado: con datos en juego, los avisos no se callan. */
  hayDatos: boolean
  onMarcaSuelto: (c: Columna, a: Atleta) => void
  onBorraSuelto: (c: Columna, a: Atleta) => void
  onReiniciaSuelto: (c: Columna) => void
  onCuenta: (c: Columna, a: Atleta, suma: number) => void
  onCuentaEn: (c: Columna, bl: Bloque, a: Atleta, rep: number, suma: number) => void
  onParcial: (c: Columna, a: Atleta) => void
  onParcialEn: (c: Columna, bl: Bloque, a: Atleta, fila: number) => void
  onQuitaParcialEn: (c: Columna, a: Atleta, fila: number) => void
  onQuitaParcial: (c: Columna, a: Atleta) => void
  onPantalla: (p: Pantalla) => void
  /** El reloj del descanso, que va aparte del del test. */
  desc: Reloj | null
  onDescanso: (accion: 'arranca' | 'cero') => void
  /**
   * Se está MONTANDO el test, no pasándolo.
   *
   * Es la misma pantalla —no una previa que se parece— y por eso vive en este
   * componente: una segunda versión se habría quedado atrás a la primera. Lo
   * único que cambia es que aquí no hay gente a la que pasárselo ni mediciones
   * que guardar: se escribe en una caja de pruebas que no es de nadie.
   */
  montando?: boolean
  /** Los botones de añadir, para poder montar el test DESDE la pantalla. */
  anadir?: React.ReactNode
}) {
  const cronos = cronosDe(test)
  const escalonados = escalonadosDe(test)
  /* Las cuatro familias de reloj, cada una de su lista. De estas mismas sale la
     frase de la previa (`relojesDe`), así que lo que se anuncia allí es
     exactamente lo que se pinta aquí. */
  const cronometrados = cronometradosDe(test)
  const sueltosCrono = cronosSueltosDe(test)
  const sueltosCont = contadoresSueltosDe(test)
  const contBloque = contadoresDe(test)
  /* Por qué repetición va cada bloque SIN reloj: lo dice el entrenador, porque
     un contador a cero no se distingue de uno sin empezar. */
  const [repMano, setRepMano] = useState<Record<string, number>>({})

  /* Los botones de marcar, pulsar y «se bajó» salen POR PERSONA. Sin nadie
     añadido, una sección se queda con su título y nada debajo: parece rota.
     Lo dice cada una, no solo el aviso de arriba. */
  const sinGente = !atletas.length && !montando ? (
    <p className="text-[12px] text-amber-300/90 mb-0 mt-1.5 leading-snug">
      Elige arriba a quién se lo pasas y aquí saldrá <b>su botón</b>.
    </p>
  ) : null

  const parciales = parcialesDe(test)
  const parcialesBloque = parcialesBloqueDe(test)
  /* Lo decide `lib/lab-pantalla`, el mismo sitio que mete la sección «El
     reloj» en la lista: contándolo aquí por separado, un test podría tener la
     sección y no el reloj, o al revés. */
  const hayReloj = tieneReloj(test)
  /* HAY SECCIONES QUE NO SE VEN CON UNA PERSONA, y hay que decir que existen:
     si no, la primera vez que lo pases a un grupo te aparece media pantalla
     que no habías visto nunca. */
  const conGrupoSale = montando && (cronos.length > 0 || escalonados.length > 0
    || sueltosCrono.length > 0 || parciales.length > 0 || parcialesBloque.length > 0
    || sueltosCont.length > 0 || contBloque.length > 0) ? (
      <p className={(ayuda ? '' : 'hidden ') + 'text-gray-500 text-[11.5px] leading-snug mt-3 border-t border-gray-800 pt-3'}>
        Con <b className="text-gray-300">dos personas o más</b> aparece además una fila por cada uno con su botón:
        la tabla enseña a quien tengas puesto arriba, y a pie de pista no se puede ir cambiando de atleta a mitad
        de serie. Con uno solo no salen, porque basta tocar la casilla. Puedes ordenarlas igual desde el ⚙.
      </p>
    ) : null
  /* UN SOLO RELOJ: todas las secciones leen el mismo tiempo, así que una
     cuenta atrás puede ir corriendo mientras marcas parciales y pulsas.

     VA EL PRIMERO A PROPÓSITO. Estaba diez líneas más abajo, y `seAcaboElTiempo`
     lo leía desde arriba: eso es una variable usada antes de existir, que
     revienta la pantalla entera. No se veía porque `.some()` no llama a nada
     con la lista vacía, así que solo estallaba en los tests CON cuenta atrás. */
  const ms = reloj ? (reloj.corre ? ahora - reloj.desde + reloj.acu : reloj.acu) : 0
  /* Si una cuenta atrás ya ha terminado, los pulsadores se bloquean: dos
     pulsaciones de más después de la campana entran como repeticiones que no
     ocurrieron, y eso no se distingue luego de las de verdad. */
  const seAcaboElTiempo = cronometrados.some(bl => cuentaAtras(bl, ms).fin)
  /* En qué orden va cada sección y cuáles se esconden. Lo guardado manda, pero
     cuadrado con lo que el test tiene HOY: ver `lib/lab-pantalla`.

     Y CON CUÁNTA GENTE, que decide si hay secciones que no pintan nada: desde
     que la casilla de la tabla se toca, con una sola persona los botones por
     persona son la misma cosa dos veces.

     Y LO QUE SE DIBUJA NO ES LO QUE SE PUEDE ORDENAR: `delTest` son todas las
     que el test puede llegar a enseñar, las dibuje ahora o no. Dibujarlas
     todas al montar para que el engranaje tuviera algo que ordenar devolvía a
     la pantalla justo las filas que se acababan de quitar. */
  const { todas, visibles, delTest } = pantallaDe(
    test, test.pantalla as Pantalla | undefined, atletas.length)
  const ocultas = todas.filter(k => !visibles.includes(k))
  const [ordenando, setOrdenando] = useState(false)
  const [arrastrando, setArrastrando] = useState<ClaveSeccion | null>(null)
  const [sobre, setSobre] = useState<ClaveSeccion | null>(null)
  const corre = !!reloj?.corre
  const arrancado = !!reloj && (reloj.corre || reloj.acu > 0)
  /* TODA LA LETRA PEQUEÑA PASA POR AQUÍ. Son ocho pies de sección que explican
     cómo funciona cada cosa; valen mucho el primer día y estorban el décimo,
     sobre todo en el móvil, donde empujan la tabla fuera de la pantalla. */
  const ayudita = (hijos: React.ReactNode) =>
    ayuda ? <p className="text-gray-400 text-[11.5px] leading-snug mt-2.5">{hijos}</p> : null
  const relojCaja = 'flex gap-4 items-center flex-wrap border border-gray-800 rounded-xl p-3.5 bg-[#0d1420] mt-3'
  const gordo = 'font-mono tabular-nums text-[38px] leading-none text-orange-400 font-medium'
  const pie = 'text-[10px] tracking-widest uppercase text-gray-500 font-bold mt-1.5'
  const filaAt = 'flex items-center gap-2.5 flex-wrap py-2 border-b border-gray-800/60'

  return (
    /* FLEX EN COLUMNA para que `order` signifique algo: así cada sección se
       coloca donde diga la pantalla sin mover el código de sitio. */
    <div className={tarjeta + ' flex flex-col'}>
      <div style={{ order: -1 }}>
      <p className="font-bold text-[15px]">{test.nombre || 'Test'}</p>
      <p className="text-gray-500 text-xs mt-1">
        {test.deporte} · {atletas.length > 1 ? atletas.length + ' personas a la vez' : atletas.length === 1 ? 'una persona' : 'sin nadie todavía'}
      </p>

      {montando && (
        <p className="text-[11.5px] text-gray-500 mt-1 mb-0">
          Esto es <b className="text-gray-300">la pantalla de verdad</b>: el reloj anda y los botones funcionan.
          Lo que escribas aquí es para probar y no se guarda en nadie.
        </p>
      )}

      <div className={'flex gap-1.5 flex-wrap items-center mt-3' + (montando ? ' hidden' : '')}>
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

      {/* EL RELOJ DEL TEST, uno para todo y arriba del todo. Antes cada
          sección traía su «Empezar», y como solo podía andar un reloj, darle a
          uno paraba el otro: no se podía tener la cuenta atrás corriendo
          mientras marcas parciales y pulsas. */}
      {hayReloj && (
        /* SE QUEDA PEGADO ARRIBA. En el móvil todo va en una columna: el reloj,
           las filas y la tabla. Bajando a tocar la casilla de la 4.ª
           repetición el reloj se iba de la pantalla, que es justo cuando hace
           falta mirarlo — y obligaba a subir, mirar y volver a bajar con el
           atleta corriendo.

           El fondo opaco va en el envoltorio y no en la caja: la caja lleva un
           naranja translúcido a propósito, y pegarlo arriba sin nada detrás
           dejaba ver la tabla pasando por debajo de los números. */
        <div style={{ order: todas.indexOf('reloj') }} className="sticky top-0 z-20 bg-gray-950 pt-3 pb-1.5">
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-orange-500/30 bg-orange-500/[0.06] px-3.5 py-2.5">
          <span className="font-mono tabular-nums text-[30px] leading-none text-orange-400 font-medium">{crono(ms)}</span>
          <span className="text-[10px] tracking-widest uppercase text-gray-500 font-bold">
            {corre ? 'corriendo' : arrancado ? 'en pausa' : 'el reloj del test'}
          </span>
          <button onClick={onArranca} className={btn + ' ml-auto min-w-[112px]'}>
            {corre ? 'Pausar' : arrancado ? 'Seguir' : 'Empezar'}
          </button>
          <button onClick={onReiniciaReloj} disabled={!arrancado}
            className="text-[11.5px] text-gray-500 hover:text-gray-300 disabled:opacity-30 px-2 transition">
            Poner a cero
          </button>
        </div>
        </div>
      )}

      {/* ORDENAR LA PANTALLA. Donde de verdad sirve es en el móvil: a pie de
          pista todo va en UNA columna, así que el orden decide lo que ves sin
          hacer scroll con el atleta esperando. */}
      <div style={{ order: -1 }} className="mt-3 flex gap-2 flex-wrap">
        {delTest.length > 1 && (
          <button onClick={() => setOrdenando(o => !o)} className={btnSec + ' ' + btnMini}>
            {ordenando ? 'Listo' : '⚙ Ordenar la pantalla'}
          </button>
        )}
        {/* APAGAR LA LETRA PEQUEÑA. Las explicaciones valen mucho el primer día
            y estorban el décimo: en el móvil son las que empujan la tabla
            fuera de la pantalla. Se recuerda, así que se apaga una vez. */}
        <button onClick={onAyuda} className={btnSec + ' ' + btnMini}
          title={ayuda ? 'Quitar las explicaciones' : 'Volver a enseñar las explicaciones'}>
          {ayuda ? 'ℹ Quitar explicaciones' : 'ℹ Explicaciones'}
        </button>
      </div>
      {ordenando && (
        <div className="mt-2.5 rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-3">
          <p className="text-[11.5px] text-gray-400 mb-2 leading-snug">
            Arriba lo que miras primero. El ojo esconde lo que no uses en este test.
            <b className="text-gray-300"> Se guarda con el test</b>, porque un escalonado y unas flexiones no se miran igual.
            {/* La duda que sale sola al ver el interruptor de móvil. */}
            {' '}Este orden vale <b className="text-gray-300">para el ordenador y para el móvil</b>: es la misma columna.
            {' '}Arrástralas con el ratón, o usa las flechas — que es lo que funciona con el dedo.
          </p>
          {delTest.map((k, i) => {
            const sec = seccionPorClave(k)
            if (!sec) return null
            const oculta = ocultas.includes(k)
            /* Las que el test tiene pero hoy no se dibujan. No se esconden de
               la lista: si no, ordenar la pantalla para un grupo habría que
               hacerlo a ciegas, con medio orden invisible. */
            const soloEnGrupo = !todas.includes(k)
            return (
              /* ARRASTRAR CON EL RATÓN, flechas en todas partes. Lo nativo del
                 navegador —lo mismo que ya usan las tareas y los chips del
                 calendario— NO funciona con el dedo, y esto se configura
                 muchas veces desde el móvil: por eso las flechas se quedan,
                 no son un apaño de mientras. */
              <div key={k} draggable
                onDragStart={() => setArrastrando(k)}
                onDragEnd={() => { setArrastrando(null); setSobre(null) }}
                onDragOver={e => { e.preventDefault(); if (sobre !== k) setSobre(k) }}
                onDrop={e => {
                  e.preventDefault()
                  if (arrastrando && arrastrando !== k) onPantalla({ orden: moverA(delTest, arrastrando, i), ocultas })
                  setArrastrando(null); setSobre(null)
                }}
                className={'flex items-center gap-2 py-1.5 border-b border-gray-800/60 cursor-grab ' +
                  (arrastrando === k ? 'opacity-40 ' : '') +
                  (sobre === k && arrastrando && arrastrando !== k ? 'border-t-2 border-t-orange-500 ' : '')}>
                <span className="text-gray-600 text-[13px] select-none" aria-hidden="true">⠿</span>
                <span className="text-[15px]" aria-hidden="true">{sec.icono}</span>
                <b className={'text-[13px] font-semibold ' + (oculta ? 'text-gray-600 line-through' : '')}>{sec.etiqueta}</b>
                {soloEnGrupo && (
                  <span className="text-[10.5px] text-gray-500 border border-gray-700 rounded-full px-2 py-0.5">
                    solo con 2 o más
                  </span>
                )}
                <span className="flex-1" />
                <button onClick={() => onPantalla({ orden: mover(delTest, k, -1), ocultas })} disabled={i === 0}
                  title="Subir" className={btnSec + ' ' + btnMini + ' disabled:opacity-30'}>↑</button>
                <button onClick={() => onPantalla({ orden: mover(delTest, k, 1), ocultas })} disabled={i === delTest.length - 1}
                  title="Bajar" className={btnSec + ' ' + btnMini + ' disabled:opacity-30'}>↓</button>
                {/* «Guardar lo medido» no se puede esconder: una pantalla desde
                    la que no se puede apuntar no es una pantalla configurada. */}
                <button onClick={() => onPantalla({ orden: delTest, ocultas: alternar(ocultas, k) })}
                  disabled={!sec.prescindible} title={sec.prescindible ? (oculta ? 'Volver a enseñarla' : 'Esconderla') : 'Esta no se puede esconder'}
                  className={btnSec + ' ' + btnMini + ' disabled:opacity-30'}>{oculta ? '🙈' : '👁'}</button>
              </div>
            )
          })}
          <button onClick={() => onPantalla({ orden: [], ocultas: [] })}
            className="mt-2.5 text-[11.5px] text-gray-500 hover:text-gray-300 transition">Volver a la de serie</button>
        </div>
      )}

      {!montando && !atletas.length && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 text-[12px] text-amber-200 leading-snug">
          {deportistas.length
            ? <>Elige a quién se lo pasas. Puedes poner a varios: el reloj es uno solo y cada uno tiene su botón.</>
            : <>No tienes deportistas en tu equipo todavía. El test se puede montar igual, pero para pasarlo hace falta alguien a quien pasárselo.</>}
        </div>
      )}
      {!hayReloj && !sueltosCont.length && ayuda && (
        <div className="mt-3 rounded-lg border border-blue-400/25 bg-blue-500/[0.07] px-3 py-2.5 text-[12px] text-blue-100 leading-snug">
          Este test no lleva reloj: se rellena a mano en la tabla de al lado. Es una opción legítima —
          nueve de los veinticuatro tests de la app son así.
          {/* Y SE DICE CÓMO SE CONSIGUE. Un test que dura —un Cooper, un FTP de
              20— no lleva reloj porque nadie le ha dicho cuánto dura, y eso no
              se adivinaba desde aquí. */}
          <span className="block mt-1.5 text-blue-200/70">
            Si el test dura un tiempo fijo, ponlo como un bloque con duración en el paso 2 y aquí tendrás la cuenta atrás.
          </span>
        </div>
      )}

      {hayReloj && (
        <InterruptoresAviso textoSonido="Suena"
          hayEscalones={escalonados.length > 0 || cronometrados.length > 0} className="mt-3" />
      )}

      </div>

      {visibles.includes('escalones') && (<div style={{ order: todas.indexOf('escalones') }}>
      {escalonados.map(bl => {
        const dur = duracionDe(bl)
        const n = escalonAhora(bl, ms)
        const dentroMs = ms % (dur * 1000)
        const dentro = Math.floor(dentroMs / 1000)
        const tr = tramoEn(bl, dentroMs)
        const cd = columnaDeVelocidad(bl, datosDe(String((atletas[activo] || atletas[0])?.id ?? '')))!
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
                  {mmss(tr ? tr.restante : dentro)}
                </div>
                <div className={pie}>{tr ? tr.nombre + ' · queda' : 'en este escalón'}</div>
              </div>
              <div className="flex gap-2 flex-1 flex-wrap min-w-[200px]">
                <button onClick={() => onReiniciaEsc(bl)} className="text-[11.5px] text-gray-500 hover:text-gray-300 px-2 transition">Borrar lo apuntado</button>
              </div>
            </div>

            {/* UN reloj, y un botón por persona: das una salida y vas marcando
                según se van descolgando. */}
            <div className="mt-3">
              {sinGente}
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
            {ayudita(<>
              Al marcar se guarda el <b className="text-white">último escalón COMPLETO</b> y los segundos del que no
              terminó van a «aguanto». Si lo marcas al revés, la VAM sale un escalón alta.
            </>)}
          </div>
        )
      })}

      </div>)}

      {visibles.includes('cuenta') && (<div style={{ order: todas.indexOf('cuenta') }}>
      {/* LA CUENTA ATRÁS: el reloj normal, el que faltaba. Un bloque que dura y
          no canta velocidad —un Cooper de 12 min, un FTP de 20, una plancha— no
          tenía reloj de ninguna clase y había que sacar el móvil. */}
      {cronometrados.map(bl => {
        const dur = duracionDe(bl)
        /* El mismo cálculo que decide cuándo pita: si lo repitiera aquí, el cero
           de la pantalla y el pitido acabarían en instantes distintos. */
        const c = cuentaAtras(bl, ms)
        return (
          <div key={bl.clave}>
            <div className={relojCaja}>
              <div>
                {/* LO QUE QUEDA, no lo que lleva: a pie de pista lo que hay que
                    cantar es «treinta segundos», y restar mentalmente mientras
                    miras a seis personas es justo lo que sale mal. */}
                <div className={gordo + (c.fin ? ' opacity-40' : '')}>{mmss(c.restante)}</div>
                <div className={pie}>{c.fin ? 'terminado' : c.tramo ? c.tramo + ' · queda' : 'queda'}</div>
              </div>
              {bl.veces > 1 && (
                <div>
                  <div className="font-mono tabular-nums text-[26px] leading-none text-white">
                    {c.rep}<span className="text-gray-600 text-[16px]">/{bl.veces}</span>
                  </div>
                  <div className={pie}>{bl.etiqueta || 'repetición'}</div>
                </div>
              )}
              <div className="flex gap-2 flex-1 flex-wrap min-w-[200px]">
                <button onClick={() => onReiniciaEsc(bl)} className="text-[11.5px] text-gray-500 hover:text-gray-300 px-2 transition">Borrar lo apuntado</button>
              </div>
            </div>
            {ayudita(<>
              {bl.veces > 1 ? <>Cuenta atrás de <b className="text-white">{mmss(dur)}</b> por repetición, {bl.veces} veces.</>
                : <>Cuenta atrás de <b className="text-white">{mmss(dur)}</b>.</>}
              {' '}{bl.pitaCambio !== false ? 'Pita al acabar' : 'No pita al acabar'}
              {bl.tramos?.length ? ' y al cambiar de tramo' : ''}. Lo que se mida se escribe en la tabla de al lado.
            </>)}
          </div>
        )
      })}

      </div>)}

      {visibles.includes('cronos') && (<div style={{ order: todas.indexOf('cronos') }}>
      {cronos.map(({ c, bl }) => {
        return (
          <div key={c.clave}>
            {/* AQUÍ NO SE VUELVE A CANTAR LA HORA. Esta caja enseñaba el reloj
                otra vez, con el mismo número que el de arriba: era de cuando
                cada sección tenía el suyo. Desde que hay UNO SOLO, repetirlo es
                dar a entender que son dos y que miden cosas distintas. Lo único
                de esta sección es de qué columna va y poder borrarla. */}
            <div className="flex items-center gap-2.5 flex-wrap mt-3">
              <span className={pie + ' mt-0'}>{c.etiqueta || c.clave}</span>
              <button onClick={() => onReinicia(c, bl)} className="text-[11.5px] text-gray-500 hover:text-gray-300 transition">Borrar lo apuntado</button>
            </div>
            <div className="mt-1.5">
              {sinGente}
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
            {ayudita(<>
              Un solo reloj para todos y un botón por persona: cada uno cierra SU repetición cuando llega.
              El tiempo que se guarda es el suyo, no el del reloj.
            </>)}
          </div>
        )
      })}

      </div>)}

      {visibles.includes('sueltos') && (<div style={{ order: todas.indexOf('sueltos') }}>
      {/* EL CRONÓMETRO DE UNA CASILLA SUELTA. Se podía elegir en el editor y la
          previa lo prometía, pero no se pintaba en ninguna parte: los relojes
          salían de las columnas DE DENTRO de los bloques. Un CSS —el 400 y el
          200— se quedaba sin cronómetro. */}
      {sueltosCrono.map(c => {
        const u = c.instrumento === 'crono-min' ? 'minutos' : 'segundos'
        return (
          <div key={c.clave} className="mt-3">
            {/* SIN REPETIR EL RELOJ. Desde que hay uno solo para el test, este
                número era el mismo de arriba dos dedos más abajo. */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={pie + ' mt-0'}>{c.etiqueta || c.clave}</span>
              <button onClick={() => onReiniciaSuelto(c)} className="text-[11.5px] text-gray-500 hover:text-gray-300 transition">Borrar lo apuntado</button>
            </div>
            <div className="mt-1.5">
              {sinGente}
              {atletas.map(a => {
                const val = String(datosDe(String(a.id))[c.clave] ?? '')
                return (
                  <div key={a.id} className={filaAt}>
                    <span className="font-semibold text-[13px] min-w-[110px]">{a.nombre}</span>
                    {/* AQUÍ SÍ SE ENSEÑA LO MARCADO, al revés que en las
                        repeticiones: es un solo número por persona, y saber si
                        ya le has cogido el tiempo es media pantalla. */}
                    <span className="font-mono text-[12px] text-blue-300">
                      {val ? val + (c.unidad ? ' ' + c.unidad : '') : 'sin marcar'}
                    </span>
                    <button onClick={() => onBorraSuelto(c, a)} disabled={!val} className={btnSec + ' ' + btnMini + ' ml-auto'}>Borrar</button>
                    <button onClick={() => onMarcaSuelto(c, a)} disabled={!corre} className={btn + ' ' + btnMini}>
                      {val ? 'Otra vez' : 'Marcar'}
                    </button>
                  </div>
                )
              })}
            </div>
            {ayudita(<>
              Un solo reloj para todos y un botón por persona: cada uno cierra el suyo al llegar.
              Cae en su casilla en <b className="text-white">{u}</b>, que es como hay que contarlo en la fórmula.
            </>)}
          </div>
        )
      })}

      </div>)}

      {visibles.includes('parciales') && (<div style={{ order: todas.indexOf('parciales') }}>
      {/* PARCIALES DENTRO DE UN BLOQUE: las marcas van a la casilla de SU
          repetición, así que aquí hay que decir por cuál vamos — igual que en
          el pulsador. En la tabla se toca la casilla y no hace falta; esto es
          para un GRUPO, donde cada uno tiene la suya y no se puede ir
          cambiando de atleta a mitad de serie. */}
      {parcialesBloque.map(({ c, bl }) => {
        const rep = repeticionDe(bl, ms, repMano[bl.clave] || 1)
        const conReloj = duracionDe(bl) > 0
        return (
          <div key={c.clave} className="mt-3 border border-gray-800 rounded-xl p-3.5 bg-[#0d1420]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] tracking-widest uppercase text-gray-500 font-bold">
                {c.etiqueta || c.clave}{c.unidad ? ' · ' + c.unidad : ''}
              </span>
              {conReloj ? (
                <span className="text-[11.5px] text-gray-400">repetición <b className="text-white">{rep}</b> de {bl.veces} · la lleva el reloj</span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
                  vas por la
                  <button onClick={() => setRepMano(p => ({ ...p, [bl.clave]: Math.max(1, rep - 1) }))}
                    disabled={rep <= 1} className={btnSec + ' ' + btnMini + ' disabled:opacity-30'}>−</button>
                  <b className="text-white font-mono">{rep}</b>
                  <button onClick={() => setRepMano(p => ({ ...p, [bl.clave]: Math.min(bl.veces, rep + 1) }))}
                    disabled={rep >= bl.veces} className={btnSec + ' ' + btnMini + ' disabled:opacity-30'}>+</button>
                  de {bl.veces}
                </span>
              )}
            </div>
            {sinGente}
            <div className="mt-1.5">
              {atletas.map(a => {
                const todas2 = (datosDe(String(a.id))[c.clave] as unknown[] | undefined) || []
                const suya = (Array.isArray(todas2[rep - 1]) ? todas2[rep - 1] as string[] : [])
                return (
                  <div key={a.id} className={filaAt}>
                    <span className="font-semibold text-[13px] min-w-[110px]">{a.nombre}</span>
                    <span className="font-mono text-[12px] text-blue-300">
                      {suya.length
                        ? suya.length + (suya.length === 1 ? ' parcial' : ' parciales') + ' en la ' + rep + '.ª'
                        : 'sin marcar la ' + rep + '.ª'}
                    </span>
                    <button onClick={() => onQuitaParcialEn(c, a, rep - 1)} disabled={!suya.length}
                      className={btnSec + ' ' + btnMini + ' ml-auto'}>Deshacer</button>
                    <button onClick={() => onParcialEn(c, bl, a, rep - 1)} disabled={!corre}
                      className={btn + ' ' + btnMini}>Marcar</button>
                    {suya.length > 0 && (
                      <span className="basis-full flex gap-1.5 flex-wrap mt-1.5">
                        {acumuladosDe(suya).map((t, i) => (
                          <span key={i} className="font-mono text-[11.5px] rounded-md px-1.5 py-1 border border-blue-400/30 bg-blue-500/[0.12] text-blue-100">
                            {i + 1} · {mmss(t)}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {ayudita(<>
              Cada marca va a <b className="text-white">la repetición {rep}</b>. El reloj no se para, y el parcial se
              cuenta desde la última marca de esa persona — da igual en qué repetición fuera.
            </>)}
          </div>
        )
      })}

      {/* LOS PARCIALES: se marca y el reloj SIGUE. Un bloque de repeticiones
          ya hacía esto, pero obligaba a decir antes cuántos iban a ser, y lo
          que se quiere es marcar lo que va pasando. */}
      {parciales.map(c => {
        return (
          <div key={c.clave} className="mt-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={pie + ' mt-0'}>{c.etiqueta || c.clave}</span>
              <button onClick={() => onReiniciaSuelto(c)} className="text-[11.5px] text-gray-500 hover:text-gray-300 transition">Borrar lo apuntado</button>
            </div>
            <div className="mt-1.5">
              {sinGente}
              {atletas.map(a => {
                const lista = (datosDe(String(a.id))[c.clave] as unknown[] | undefined) || []
                const acum = acumuladosDe(lista)
                return (
                  <div key={a.id} className={filaAt}>
                    <span className="font-semibold text-[13px] min-w-[110px]">{a.nombre}</span>
                    <span className="font-mono text-[12px] text-blue-300">
                      {/* Con un número esperado se dice «2 de 4»: lo que de
                          verdad quieres saber a pie de pista es cuántos
                          faltan. Si salen más, se marcan igual — lo que
                          esperabas no manda sobre lo que pasó. */}
                      {c.esperados
                        ? lista.length + ' de ' + c.esperados + (lista.length >= c.esperados ? ' ✓' : '')
                        : lista.length ? lista.length + (lista.length === 1 ? ' parcial' : ' parciales') : 'sin marcar'}
                    </span>
                    <button onClick={() => onQuitaParcial(c, a)} disabled={!lista.length}
                      className={btnSec + ' ' + btnMini + ' ml-auto'}>Deshacer</button>
                    <button onClick={() => onParcial(c, a)} disabled={!corre} className={btn + ' ' + btnMini}>Marcar</button>
                    {/* SE VE DÓNDE MARCASTE. Los tiempos de un bloque se van a
                        la tabla; aquí se quedan a la vista, que es la mitad de
                        para qué sirve marcar parciales. */}
                    {lista.length > 0 && (
                      <span className="basis-full flex gap-1.5 flex-wrap mt-1.5">
                        {acum.map((t, i) => (
                          <span key={i} className="font-mono text-[11.5px] rounded-md px-1.5 py-1 border border-blue-400/30 bg-blue-500/[0.12] text-blue-100">
                            {i + 1} · {mmss(t)}
                            <span className="text-gray-500"> (+{mmss(Number(lista[i]) || 0)})</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {ayudita(<>
              Un reloj para todos y un botón por persona: el reloj <b className="text-white">no se para</b>.
              Se guarda el parcial de cada trozo, y el acumulado sale de sumarlos — así la fórmula puede pedir
              la media, el mejor o cuántos hubo.
            </>)}
          </div>
        )
      })}

      </div>)}

      {visibles.includes('pulsadores') && (<div style={{ order: todas.indexOf('pulsadores') }}>
      {/* EL PULSADOR DE UN BLOQUE: un número POR REPETICIÓN. Seis series de
          flexiones al máximo son seis números, no uno. */}
      {contBloque.map(({ c, bl }) => {
        const rep = repeticionDe(bl, ms, repMano[bl.clave] || 1)
        const conReloj = duracionDe(bl) > 0
        return (
          <div key={c.clave} className="mt-3 border border-gray-800 rounded-xl p-3.5 bg-[#0d1420]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] tracking-widest uppercase text-gray-500 font-bold">
                {c.etiqueta || c.clave}{c.unidad ? ' · ' + c.unidad : ''}
              </span>
              {/* Sin reloj, por cuál vamos lo dices tú. Con reloj no se
                  pregunta: ya lo sabe, y preguntarlo sería poder
                  contradecirlo. */}
              {conReloj ? (
                <span className="text-[11.5px] text-gray-400">repetición <b className="text-white">{rep}</b> de {bl.veces} · la lleva el reloj</span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
                  vas por la
                  <button onClick={() => setRepMano(p => ({ ...p, [bl.clave]: Math.max(1, rep - 1) }))}
                    disabled={rep <= 1} className={btnSec + ' ' + btnMini + ' disabled:opacity-30'}>−</button>
                  <b className="text-white font-mono">{rep}</b>
                  <button onClick={() => setRepMano(p => ({ ...p, [bl.clave]: Math.min(bl.veces, rep + 1) }))}
                    disabled={rep >= bl.veces} className={btnSec + ' ' + btnMini + ' disabled:opacity-30'}>+</button>
                  de {bl.veces}
                </span>
              )}
            </div>
            {sinGente}
            <div className="mt-2.5 flex gap-2.5 flex-wrap">
              {atletas.map(a => {
                const lista = (datosDe(String(a.id))[c.clave] as string[] | undefined) || []
                const v = Number(lista[rep - 1] || 0)
                return (
                  <div key={a.id} className="flex flex-col items-center gap-1.5">
                    <button onClick={() => onCuentaEn(c, bl, a, rep, 1)}
                      className="rounded-2xl px-6 py-3.5 border transition min-w-[124px] border-orange-500/45 bg-orange-500/[0.14] hover:bg-orange-500/25 active:bg-orange-500/40">
                      <span className="block font-mono tabular-nums text-[34px] leading-none text-orange-300">{v}</span>
                      <span className="block text-[10.5px] uppercase tracking-widest text-gray-400 mt-1.5">{a.nombre}</span>
                    </button>
                    <button onClick={() => onCuentaEn(c, bl, a, rep, -1)} disabled={v <= 0}
                      className={btnSec + ' ' + btnMini}>−1</button>
                  </div>
                )
              })}
            </div>
            {ayudita(<>
              Cada pulsación suma a <b className="text-white">la repetición {rep}</b>. Lo de las demás se queda donde está.
              {parcialQueCorta(bl) && <> Y como el bloque lleva parciales, se cuenta <b className="text-white">por
              parcial</b>: el número grande es el del que va, y debajo quedan los cerrados.</>}
            </>)}
          </div>
        )
      })}

      {/* EL PULSADOR. El número ES el botón: a pie de pista se pulsa mirando
          al atleta, no a la pantalla. */}
      {sueltosCont.map(c => (
        <div key={c.clave} className="mt-3 border border-gray-800 rounded-xl p-3.5 bg-[#0d1420]">
          <p className="text-[10px] tracking-widest uppercase text-gray-500 font-bold">
            {c.etiqueta || c.clave}{c.unidad ? ' · ' + c.unidad : ''}
            {seAcaboElTiempo && <span className="text-amber-300 normal-case tracking-normal font-semibold"> · se acabó el tiempo</span>}
          </p>
          {sinGente}
          <div className="mt-2.5 flex gap-2.5 flex-wrap">
            {atletas.map(a => {
              const v = Number(datosDe(String(a.id))[c.clave] || 0)
              return (
                <div key={a.id} className="flex flex-col items-center gap-1.5">
                  <button onClick={() => onCuenta(c, a, 1)} disabled={seAcaboElTiempo}
                    className={'rounded-2xl px-6 py-3.5 border transition min-w-[124px] ' + (seAcaboElTiempo
                      ? 'border-gray-700 bg-gray-800 text-gray-500'
                      : 'border-orange-500/45 bg-orange-500/[0.14] hover:bg-orange-500/25 active:bg-orange-500/40')}>
                    <span className="block font-mono tabular-nums text-[34px] leading-none text-orange-300">{v}</span>
                    <span className="block text-[10.5px] uppercase tracking-widest text-gray-400 mt-1.5">{a.nombre}</span>
                  </button>
                  <div className="flex gap-1.5">
                    <button onClick={() => onCuenta(c, a, -1)} disabled={v <= 0} className={btnSec + ' ' + btnMini}>−1</button>
                    {/* EL «+1» DE RESERVA: al acabar el tiempo el botón grande se
                        bloquea para que dos pulsaciones de más no entren como
                        repeticiones que no ocurrieron, pero la que cae justo en
                        la campana tiene que poder apuntarse. */}
                    {seAcaboElTiempo && (
                      <button onClick={() => onCuenta(c, a, 1)} className={btnSec + ' ' + btnMini}>+1</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {ayudita(<>
            Pulsa el número. El <b className="text-white">−1</b> va aparte y pequeño a propósito: corregir no puede ser
            tan fácil como contar.{seAcaboElTiempo ? ' Se acabó el tiempo: queda el «+1» para la última.' : ''}
          </>)}
        </div>
      ))}

      </div>)}

      {/* EL DESCANSO: un reloj aparte, que no apunta nada. Corre mientras el
          del test sigue andando o está parado — que es lo que pasa de verdad
          entre series. */}
      {visibles.includes('descanso') && !!test.descanso && (<div style={{ order: todas.indexOf('descanso') }}>
        {(() => {
          const msD = desc ? (desc.corre ? ahora - desc.desde + desc.acu : desc.acu) : 0
          const queda = restanteDescanso(test.descanso!, msD)
          const seAcabo = !!desc && queda === 0
          return (
            <div className={relojCaja + (seAcabo ? ' border-green-500/40' : '')}>
              <div>
                <div className={gordo + (seAcabo ? ' text-green-400' : '')}>{mmss(queda)}</div>
                <div className={pie}>{seAcabo ? 'descanso cumplido' : 'descanso'}</div>
              </div>
              <div className="flex gap-2 flex-1 flex-wrap min-w-[200px]">
                <button onClick={() => onDescanso('arranca')} className={btnSec + ' flex-1 min-w-[110px]'}>
                  {desc?.corre ? 'Pausar' : desc ? 'Seguir' : 'Empezar el descanso'}
                </button>
                <button onClick={() => onDescanso('cero')} disabled={!desc}
                  className="text-[11.5px] text-gray-500 hover:text-gray-300 disabled:opacity-30 px-2 transition">
                  Otra vez
                </button>
              </div>
              <p className="text-gray-400 text-[11.5px] leading-snug basis-full mb-0">
                {mmss(test.descanso!)} de descanso, con pitido al acabar. Va <b className="text-white">aparte del reloj del test</b>:
                arrancarlo no para la prueba. No se apunta en ningún sitio.
              </p>
            </div>
          )
        })()}
      </div>)}

      {anadir && (
        <div style={{ order: 998 }} className="mt-3 pt-3 border-t border-dashed border-gray-800">
          {anadir}
        </div>
      )}

      {visibles.includes('guardar') && !montando && (<div style={{ order: 999 }}>
      {cronos.length > 0 && (
        <div className={(ayuda ? '' : 'hidden ') + 'mt-4 rounded-lg border border-blue-400/25 bg-blue-500/[0.07] px-3 py-2.5 text-[12px] text-blue-100 leading-snug'}>
          Los tiempos de cada repetición <b>no se enseñan aquí</b>: caen en la fila de cada uno en su tabla,
          que es donde además se corrigen.
        </div>
      )}

      <div className={(!guardado && !ayuda && !hayDatos ? 'hidden ' : '') + 'mt-4 pt-4 border-t border-gray-800'}>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Guardar lo medido</p>
        {/* SE CALLA MIENTRAS NO HAYA NADA QUE PERDER. Con la tabla en blanco
            esto no es un aviso, es una explicación de dónde estás, y ocupa un
            tercio del móvil. En cuanto alguien tiene una marca vuelve solo,
            apagadas las explicaciones o no: entonces ya no cuenta dónde
            estás, cuenta que lo apuntado no se va a poder guardar. */}
        {!guardado ? ((ayuda || hayDatos) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 text-[12px] text-amber-200 leading-snug">
            {hayDatos
              ? <>Hay algo apuntado y <b>este test no está guardado</b>, así que no hay dónde colgarlo.
                Vuelve al editor y dale a <b>Guardar test</b> antes de perderlo.</>
              : <>Este test todavía no está guardado, así que no hay dónde colgar las mediciones.
                Vuelve al editor y dale a <b>Guardar test</b>.</>}
          </div>
        )) : (
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
      </div>)}
      {/* Va con `order` del final para que quede debajo de todo, se ordene la
          pantalla como se ordene. */}
      {conGrupoSale && <div style={{ order: 1000 }}>{conGrupoSale}</div>}
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
  /* Con décimas, y SIN redondear: un cronómetro no adelanta un segundo que no
     ha pasado. De ahí el `floor` antes de dar los segundos al formato. */
  return mmss(Math.floor(t / 1000)) + '.' + Math.floor((t % 1000) / 100)
}
