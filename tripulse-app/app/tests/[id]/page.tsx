'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import ProtocoloTest from '@/components/ProtocoloTest'
import { supabase } from '@/lib/supabase'
import { vamDeMontreal, cssDeDosDistancias, ftpDeRampa, pamDeRampa, ritmoDeVam, ritmoDeCss } from '@/lib/tests-formulas'
import Cargando from '@/components/Cargando'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { tablaIntensidades } from '@/lib/zonas'
import { calcularObjetivos, idsConPacing } from '@/lib/pacing'
import { pruebaPorId } from '@/lib/pruebas'
import TestDeCampo from '@/components/TestDeCampo'
import InstrumentosTest from '@/components/InstrumentosTest'
import { useBloqueoDeSalida, AvisoDeSalida, BarraDeTest } from '@/components/PantallaDeTest'
import { contextosDe } from '@/lib/dirigir-tests'
import { herramientasDe, avisoDe } from '@/lib/herramientas-test'
import { CATALOGO, type Contexto, type Disciplina, type ModoTest } from '@/lib/catalogo-tests'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const GRUPOS_MUSCULARES = ['Pectoral','Espalda','Hombro','Biceps','Triceps','Cuadriceps','Isquiotibiales','Gluteos','Gemelos','Core','Otros']

/* Las pestañas. «triatlon» es nueva y no tiene test clásico detrás: existe
   porque el brick y el decoupling son de la batería y no son de un deporte
   suelto. Todo lo que hay bajo esa pestaña sale del catálogo. */
const TABS = ['carrera', 'natacion', 'ciclismo', 'fuerza', 'triatlon'] as const
const ETIQUETA_TAB: Record<string, string> = {
  carrera: '🏃 Carrera', natacion: '🏊 Natación', ciclismo: '🚴 Ciclismo',
  fuerza: '🏋️ Fuerza', triatlon: '🔀 Triatlón',
}
const TITULO_TAB: Record<string, string> = {
  carrera: 'Carrera', natacion: 'Natación', ciclismo: 'Ciclismo',
  fuerza: 'Fuerza', triatlon: 'Triatlón',
}
/** De la pestaña a la disciplina del catálogo de tests de campo. */
const DISCIPLINA_TAB: Record<string, Disciplina> = {
  carrera: 'Carrera', natacion: 'Natación', ciclismo: 'Ciclismo',
  fuerza: 'Fuerza', triatlon: 'Triatlón',
}

/**
 * Los tests CLÁSICOS de cada pestaña.
 *
 * No están en el catálogo a propósito —tienen tabla propia y de ellos salen las
 * zonas— así que para poder enseñarlos junto a los de la batería hay que
 * nombrarlos aquí. `tipo` es a qué formulario de los de siempre corresponden.
 */
interface TestClasico {
  id: string
  nombre: string
  tipo: 'aerobico' | 'sprint' | 'fuerza'
  /** De este test salen las zonas de su disciplina. */
  zonas?: boolean
}
const CLASICOS_TAB: Record<string, TestClasico[]> = {
  carrera: [
    { id: 'montreal', nombre: 'Montreal', tipo: 'aerobico', zonas: true },
    { id: 'sprint-carrera', nombre: 'Sprint (MSS)', tipo: 'sprint' },
  ],
  natacion: [
    { id: 'css', nombre: 'CSS (400 + 200)', tipo: 'aerobico', zonas: true },
    { id: 'sprint-natacion', nombre: 'Sprint (V25/V50)', tipo: 'sprint' },
  ],
  ciclismo: [
    { id: 'rampa', nombre: 'Rampa', tipo: 'aerobico', zonas: true },
    { id: 'sprint-ciclismo', nombre: 'Sprint (MPP)', tipo: 'sprint' },
  ],
  fuerza: [{ id: 'rm', nombre: '1RM', tipo: 'fuerza' }],
  triatlon: [],
}

// Protocolos combinados (sprint + aeróbico en una sesión). Orden: anaeróbico primero.
const PROTOCOLO_COMBINADO: Record<string, { titulo: string; pasos: string[]; nota: string }> = {
  carrera: {
    titulo: 'Carrera — Sprint (MSS) + VAM',
    pasos: [
      'Calentamiento 10–15 min + movilidad + 3–4 aceleraciones progresivas.',
      'SPRINT (fresco): 2–3 × sprint lanzado 30–40m a máxima velocidad, recuperación completa 3–5 min entre repeticiones. Registra el mejor.',
      'Recuperación 10–15 min de trote muy suave.',
      'TEST VAM: protocolo incremental hasta agotamiento voluntario.',
    ],
    nota: 'El sprint va primero para medirlo fresco; con recuperación adecuada apenas afecta al test de VAM posterior.',
  },
  ciclismo: {
    titulo: 'Ciclismo — Wingate 6s (MPP) + FTP',
    pasos: [
      'Calentamiento 15–20 min con alguna aceleración.',
      'SPRINT (fresco): 2–3 × sprint máximo de 6 s, recuperación completa 3–5 min. Registra la potencia pico.',
      'Recuperación 10–15 min de rodaje suave.',
      'TEST FTP: 20 min máximos (o test rampa).',
    ],
    nota: 'El sprint de 6 s es aláctico y se recupera en minutos; hecho primero no compromete el FTP posterior.',
  },
  natacion: {
    titulo: 'Natación — Sprints (V25/V50) + CSS',
    pasos: [
      'Calentamiento 400–600m + técnica.',
      'SPRINTS (fresco): 25m y 50m máximos con recuperación completa 3–5 min. Registra los tiempos.',
      'Recuperación 10–15 min de nado suave.',
      'TEST CSS: 400m máximo (el 50m del sprint puede servir como distancia corta).',
    ],
    nota: 'Los sprints van primero para medirlos frescos; el 400m del CSS al final por ser el más fatigante.',
  },
}


/** La caja de siempre de esta pantalla, sin repetir la clase treinta veces. */
function Campo({ etiqueta, ...props }: { etiqueta?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      {etiqueta && <span className="text-gray-400 text-sm">{etiqueta}</span>}
      <input {...props}
        className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
    </label>
  )
}

/**
 * Una de las tres zonas de un test dirigido.
 *
 * Los ajustes del protocolo, el instrumento y lo que queda apuntado son tres
 * momentos distintos —antes, durante y después— y antes se veían como una lista
 * plana de casillas donde no se sabía cuál tocabas ni cuándo.
 */
function Zona({ titulo, pie, children }: { titulo: string; pie?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-3">
      <div>
        <p className="text-[10.5px] font-bold tracking-[.07em] uppercase text-gray-500">{titulo}</p>
        {pie && <p className="text-[11.5px] text-gray-500 mt-0.5">{pie}</p>}
      </div>
      {children}
    </div>
  )
}

/** El resultado que se está calculando mientras escribes. */
function Salida({ children }: { children: React.ReactNode }) {
  return <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm flex gap-4 flex-wrap">{children}</div>
}

const BOTON_GUARDAR = 'bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50'

/** Una fila de `test_campo`, con lo que esta pantalla necesita de ella. */
interface FilaTestCampo {
  id: number
  clave: string
  fecha: string
  resultados: Record<string, number> | null
  principal: number | null
  unidad: string | null
  modo: string | null
}

function GraficaEvolucion({ datos, dataKey, color, unidad, label, mejor = 'alto' }: { datos: any[], dataKey: string, color: string, unidad: string, label: string, mejor?: 'alto' | 'bajo' }) {
  if (datos.length < 2) return (
    <div className="bg-gray-800 rounded-xl p-4 text-center text-gray-600 text-sm mb-4">
      Necesitas al menos 2 tests para ver la evolución
    </div>
  )
  const datosGrafica = datos.slice().reverse().map(t => ({
    fecha: t.fecha?.slice(5),
    valor: t[dataKey],
  }))
  const ultimo = datosGrafica[datosGrafica.length - 1]?.valor
  const primero = datosGrafica[0]?.valor
  const cambio = ultimo && primero ? Math.round((ultimo - primero) * 100) / 100 : null
  /* Subir no siempre es mejorar: en un ritmo o en un SWOLF, subir es ir a peor.
     Sin esto la gráfica pintaría de verde quince segundos más lento por km. */
  const mejora = cambio === null ? null : (mejor === 'bajo' ? -cambio : cambio)
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-gray-300">📈 Evolución {label}</p>
        {mejora !== null && (
          <span className={'text-xs font-bold px-2 py-1 rounded-lg ' + (mejora > 0 ? 'bg-green-900/50 text-green-400' : mejora < 0 ? 'bg-red-900/50 text-red-400' : 'bg-gray-800 text-gray-400')}>
            {cambio! > 0 ? '▲' : cambio! < 0 ? '▼' : '='} {Math.abs(cambio!)} {unidad}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={datosGrafica}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }}
            formatter={(val: any) => [val + ' ' + unidad, label]}
          />
          <Line type="monotone" dataKey="valor" stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 4 }} name={label} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function GraficaFuerza({ datos }: { datos: any[] }) {
  // Agrupar por ejercicio. Los hooks van SIEMPRE antes de cualquier return
  // condicional (regla de hooks de React): si no, al pasar de "sin datos" a
  // "con datos" React lanza "rendered more hooks than during the previous render".
  const ejercicios = [...new Set(datos.map(t => t.ejercicio))]
  const [ejercicioSel, setEjercicioSel] = useState(ejercicios[0] || '')
  if (!datos.length) return null
  const datosFiltrados = datos.filter(t => t.ejercicio === ejercicioSel).slice().reverse()

  if (datosFiltrados.length < 2) return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
      <div className="flex gap-2 flex-wrap mb-3">
        {ejercicios.map(e => (
          <button key={e} onClick={() => setEjercicioSel(e)}
            className={'text-xs px-3 py-1.5 rounded-lg transition ' + (ejercicioSel === e ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
            {e}
          </button>
        ))}
      </div>
      <p className="text-gray-600 text-sm text-center py-4">Necesitas al menos 2 tests de {ejercicioSel} para ver la evolución</p>
    </div>
  )

  const datosGrafica = datosFiltrados.map(t => ({ fecha: t.fecha?.slice(5), rm: t.rm_estimado }))
  const mejora = datosGrafica[datosGrafica.length-1]?.rm - datosGrafica[0]?.rm

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-gray-300">📈 Evolución 1RM</p>
        {mejora !== 0 && (
          <span className={'text-xs font-bold px-2 py-1 rounded-lg ' + (mejora > 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400')}>
            {mejora > 0 ? '▲' : '▼'} {Math.abs(Math.round(mejora))} kg
          </span>
        )}
      </div>
      <div className="flex gap-2 flex-wrap mb-3">
        {ejercicios.map(e => (
          <button key={e} onClick={() => setEjercicioSel(e)}
            className={'text-xs px-3 py-1.5 rounded-lg transition ' + (ejercicioSel === e ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
            {e}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={datosGrafica}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }}
            formatter={(val: any) => [val + ' kg', '1RM']}
          />
          <Line type="monotone" dataKey="rm" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 4 }} name="1RM" connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function PaginaTests({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()
  const [deportista, setDeportista] = useState<any>(null)
  // Distingue "todavía no ha llegado" de "ha llegado vacío". Sin esto, una fila
  // que RLS deniega dejaba la pantalla en "Cargando..." para siempre.
  const [noExiste, setNoExiste] = useState(false)
  const [tests1, setTests1] = useState<any[]>([])
  const [tests2, setTests2] = useState<any[]>([])
  const [tests3, setTests3] = useState<any[]>([])
  const [testsFuerza, setTestsFuerza] = useState<any[]>([])
  const [testsLibres, setTestsLibres] = useState<any[]>([])
  /* Los de la batería, ya con su número de verdad: antes vivían mezclados con
     los apuntados a mano y guardados como texto, y por eso no tenían ni
     evolución ni récords. */
  const [testsCampo, setTestsCampo] = useState<FilaTestCampo[]>([])
  // El peso y el sexo, que los tests de campo necesitan para la potencia del
  // salto y para el nivel de referencia. Se piden con el mismo helper que la
  // pantalla de grupo para no tener dos formas de sacar el último pesaje.
  const [contexto, setContexto] = useState<Contexto>({})
  const [tab, setTab] = useState('carrera')
  // Qué test de la pestaña está abierto. Puede ser un clásico o uno de la batería.
  const [testSel, setTestSel] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  /* Cómo se va a hacer el test que está abierto.
     `null` = todavía no lo ha dicho, y entonces la pantalla pregunta. Antes se
     enseñaban las dos formas a la vez —el cronómetro encima y las casillas
     debajo— y no había manera de saber cuál era el camino. */
  const [modo, setModo] = useState<ModoTest | null>(null)
  /* Si hay un reloj corriendo. El candado se ata a esa ventana y no a entrar en
     modo campo: aquí alrededor hay récords y gráficas que siguen sirviendo
     mientras no se esté midiendo. */
  const [enMarcha, setEnMarcha] = useState(false)
  const [mostrarFormLibre, setMostrarFormLibre] = useState(false)
  /* «Otros tests» se queda, pero guardado: ocupaba un cuarto de la pantalla
     permanentemente para algo que casi nadie usa. Quien lo necesite, lo abre. */
  const [mostrarOtros, setMostrarOtros] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fecha, setFecha] = useState('')
  const [velInicial, setVelInicial] = useState('')
  const [velUltimo, setVelUltimo] = useState('')
  const [durTotal, setDurTotal] = useState('')
  const [tiempoAguantado, setTiempoAguantado] = useState('')
  const [incrementoVel, setIncrementoVel] = useState('')
  const [distGrande, setDistGrande] = useState('400')
  const [distPequena, setDistPequena] = useState('200')
  const [tiempoGrande, setTiempoGrande] = useState('')
  const [tiempoPequeno, setTiempoPequeno] = useState('')
  const [potInicial, setPotInicial] = useState('')
  const [potenciaPico, setPotenciaPico] = useState('')
  const [tiempoCompletado, setTiempoCompletado] = useState('')
  const [tiempoNoCompletado, setTiempoNoCompletado] = useState('')
  const [durEscalones, setDurEscalones] = useState('')
  const [incrementoPot, setIncrementoPot] = useState('')
  const [ejercicio, setEjercicio] = useState('')
  const [grupoMuscular, setGrupoMuscular] = useState('')
  const [pesoKg, setPesoKg] = useState('')
  const [reps, setReps] = useState('')
  const [notasFuerza, setNotasFuerza] = useState('')
  const [nombreLibre, setNombreLibre] = useState('')
  const [fechaLibre, setFechaLibre] = useState('')
  const [resultadoLibre, setResultadoLibre] = useState('')
  const [unidadLibre, setUnidadLibre] = useState('')
  const [notasLibre, setNotasLibre] = useState('')
  // Tests de sprint (ASR/APR)
  const [testTipo, setTestTipo] = useState<'aerobico'|'sprint'>('aerobico')
  const [mostrarProtocolo, setMostrarProtocolo] = useState(false)
  const [mostrarIntensidades, setMostrarIntensidades] = useState(false)
  const [intTab, setIntTab] = useState<'zonas' | 'objetivos'>('zonas')
  const [objPrueba, setObjPrueba] = useState('tri-olimpico')
  const [velBici, setVelBici] = useState('32')
  const [sprintDist, setSprintDist] = useState('40')   // carrera: metros del sprint lanzado
  const [sprintTiempo, setSprintTiempo] = useState('') // carrera: segundos
  const [mppSprint, setMppSprint] = useState('')        // ciclismo: W potencia pico
  const [t25, setT25] = useState('')                    // natacion: seg 25m
  const [t50, setT50] = useState('')                    // natacion: seg 50m

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    if (!dep) { setNoExiste(true); return }
    // Seis tablas distintas, ninguna depende de otra: iban en fila por costumbre.
    const [t1, t2, t3, tf, tl, tc] = await Promise.all([
      supabase.from('test1_carrera').select('*').eq('id_deportista', id).order('fecha', { ascending: false }),
      supabase.from('test2_natacion').select('*').eq('id_deportista', id).order('fecha', { ascending: false }),
      supabase.from('test3_ciclismo').select('*').eq('id_deportista', id).order('fecha', { ascending: false }),
      supabase.from('test_fuerza').select('*').eq('id_deportista', id).order('fecha', { ascending: false }),
      supabase.from('tests_libres').select('*').eq('id_deportista', id).order('fecha', { ascending: false }),
      supabase.from('test_campo').select('*').eq('id_deportista', id).order('fecha', { ascending: false }),
    ])
    setTests1(t1.data || [])
    setTests2(t2.data || [])
    setTests3(t3.data || [])
    setTestsFuerza(tf.data || [])
    setTestsLibres(tl.data || [])
    setTestsCampo(tc.data || [])
    const ctxs = await contextosDe(supabase, [Number(id)])
    setContexto(ctxs[Number(id)] ?? {})
  }

  /* Las tres fórmulas viven en lib/tests-formulas: el test de GRUPO usa las
     mismas. Estaban aquí dentro, y escribirlas otra vez allí habría sido
     tener dos VAM que pueden acabar diciendo cosas distintas.

     El CSS además cambia un poco: antes, con los dos tiempos iguales la
     división era entre cero y salía `Infinity`, y con el corto más lento que
     el largo salía negativo. Ahora eso devuelve null, que es lo que es: un
     dato mal metido, no un CSS. */
  const calcularVAM = () => vamDeMontreal({ velUltimo, durTotal, tiempoAguantado, incrementoVel })
  const calcularCSS = () => cssDeDosDistancias({
    distanciaGrande: distGrande, distanciaPequena: distPequena,
    tiempoGrande, tiempoPequeno,
  })
  const calcularFTP = () => ftpDeRampa({ potenciaPico, incrementoPot, tiempoNoCompletado, durEscalones })
  /* La PAM es el último escalón; el FTP es su 75 %. Se enseñan las dos porque
     son cosas distintas y la tabla ya tenía columna para cada una. */
  const calcularPAM = () => pamDeRampa({ potenciaPico, incrementoPot, tiempoNoCompletado, durEscalones })

  /* ── El puente de los instrumentos ────────────────────────
     Los descriptores de `herramientas-test` nombran las casillas por su clave.
     Los formularios clásicos de esta página no guardan un objeto de valores:
     cada casilla tiene su propio useState desde que se escribieron. Así que
     aquí se traduce de una cosa a la otra.

     Es fea, pero es la parte fea MÁS PEQUEÑA: la alternativa era reescribir los
     cinco formularios a un objeto de valores, y son los que escriben en las
     tablas de las que salen las zonas. No se tocan sin necesidad. */
  const SETTERS: Record<string, (v: string) => void> = {
    velInicial: setVelInicial, potInicial: setPotInicial,
    velUltimo: setVelUltimo, durTotal: setDurTotal,
    tiempoAguantado: setTiempoAguantado, incrementoVel: setIncrementoVel,
    tiempoGrande: setTiempoGrande, tiempoPequeno: setTiempoPequeno,
    potenciaPico: setPotenciaPico, tiempoNoCompletado: setTiempoNoCompletado,
    durEscalones: setDurEscalones, incrementoPot: setIncrementoPot,
    sprintTiempo: setSprintTiempo, t25: setT25, t50: setT50,
  }
  const VALORES: Record<string, string> = {
    velInicial, potInicial,
    velUltimo, durTotal, tiempoAguantado, incrementoVel,
    tiempoGrande, tiempoPequeno,
    potenciaPico, tiempoNoCompletado, durEscalones, incrementoPot,
    sprintTiempo, t25, t50,
  }
  const ponCampo = (clave: string, valor: string) => SETTERS[clave]?.(valor)

  /* ── Los tests de esta pestaña, clásicos y de batería en la misma fila ──
     El entrenador no distingue «clásico» de «de la batería» —eso es fontanería
     de dónde se guarda cada uno— y no tiene por qué. Lo que sí distingue es
     cuál marca las zonas, y eso sí se dice. */
  const testsDelTab = [
    ...(CLASICOS_TAB[tab] ?? []).map(c => ({
      id: c.id, nombre: c.nombre, zonas: !!c.zonas,
      conCrono: herramientasDe(c.id).length > 0,
      clasico: c as TestClasico,
    })),
    ...CATALOGO.filter(t => t.disciplina === DISCIPLINA_TAB[tab]).map(t => ({
      id: t.clave, nombre: t.nombre, zonas: false,
      conCrono: herramientasDe(t.clave).length > 0,
      clasico: null,
    })),
  ]

  const elegirTest = (t: (typeof testsDelTab)[number]) => {
    // Volver a pulsar el mismo lo cierra: es lo que sustituye al «Cancelar» que
    // tenía el botón de «+ Nuevo test».
    if (testSel === t.id) { setTestSel(null); setMostrarForm(false); setModo(null); return }
    setTestSel(t.id)
    /* Sin instrumentos no hay dos formas de hacerlo: se entra directo a mano.
       Preguntar «¿cómo lo haces?» cuando solo hay una respuesta es ruido. */
    setModo(t.conCrono ? null : 'mano')
    if (t.clasico) { setTestTipo(t.clasico.tipo === 'fuerza' ? 'aerobico' : t.clasico.tipo); setMostrarForm(true) }
    else setMostrarForm(false)
  }

  /* ── De qué test salen ahora sus zonas ──
     La distinción que le importa al entrenador no es «clásico o de batería»
     —eso es fontanería— sino QUÉ TEST MANDA sobre los ritmos del atleta. Con
     `origen` puesto, además, se puede decir de cuál salió. */
  const ANCLA_TAB: Record<string, { filas: any[]; col: string; nombre: string; unidad: string }> = {
    carrera: { filas: tests1, col: 'vam', nombre: 'VAM', unidad: 'km/h' },
    natacion: { filas: tests2, col: 'css', nombre: 'CSS', unidad: 'm/s' },
    ciclismo: { filas: tests3, col: 'ftp', nombre: 'FTP', unidad: 'W' },
  }
  const anclaDef = ANCLA_TAB[tab]
  const anclaFila = anclaDef?.filas.find(f => f[anclaDef.col] != null) ?? null

  /** El test que está abierto, sea clásico o de la batería. */
  const testSelObj = testsDelTab.find(t => t.id === testSel) ?? null

  const bloqueo = useBloqueoDeSalida(enMarcha)

  /** Lo que ha hecho de la batería en esta disciplina, y de este test. */
  const campoDelTab = testsCampo.filter(r => CATALOGO.find(x => x.clave === r.clave)?.disciplina === DISCIPLINA_TAB[tab])

  /** Lo que ha hecho de ESTE test de la batería, para su evolución. */
  const campoDelTest = testSel ? testsCampo.filter(r => r.clave === testSel) : []

  /** El test de la batería que toca abrir, o null si el elegido es clásico. */
  const claveBateria = testsDelTab.find(t => t.id === testSel && !t.clasico)?.id ?? null

  const calcularRM = () => {
    if (!pesoKg || !reps) return null
    if (Number(reps) === 1) return Number(pesoKg)
    return Math.round(Number(pesoKg) * (1 + Number(reps) / 30))
  }

  const formatCSS = ritmoDeCss
  const formatVAM = ritmoDeVam

  // Sprint: MSS (km/h) desde distancia + tiempo; V25/V50 (m/s) desde tiempo
  const calcularMSS = () => (sprintDist && sprintTiempo && Number(sprintTiempo) > 0) ? Math.round((Number(sprintDist) / Number(sprintTiempo)) * 3.6 * 10) / 10 : null
  const calcularVsprint = (t: string, d: number) => (t && Number(t) > 0) ? Math.round((d / Number(t)) * 1000) / 1000 : null
  // Reservas anaeróbicas (sobre el último test aeróbico disponible)
  const ultimaVAM = tests1.find(t => t.vam)?.vam
  const ultimoFTP = tests3.find(t => t.ftp)?.ftp
  const asrPreview = (calcularMSS() && ultimaVAM) ? Math.round((calcularMSS()! - ultimaVAM) * 10) / 10 : null
  const aprPreview = (mppSprint && ultimoFTP) ? (Number(mppSprint) - ultimoFTP) : null

  const guardarTest1 = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.from('test1_carrera').insert({ id_deportista: Number(id), fecha, velocidad_inicial: velInicial ? Number(velInicial) : null, velocidad_ultimo_escalon: Number(velUltimo), duracion_total_escalon: Number(durTotal), tiempo_aguantado_ultimo: Number(tiempoAguantado), incremento_velocidad: Number(incrementoVel), vam: calcularVAM() })
    if (error) setError('Error: ' + error.message)
    else { setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  const guardarTest2 = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.from('test2_natacion').insert({ id_deportista: Number(id), fecha, distancia_grande: Number(distGrande), distancia_pequena: Number(distPequena), tiempo_distancia_grande: Number(tiempoGrande), tiempo_distancia_pequena: Number(tiempoPequeno), css: calcularCSS() })
    if (error) setError('Error: ' + error.message)
    else { setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  const guardarTest3 = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.from('test3_ciclismo').insert({ id_deportista: Number(id), fecha, potencia_inicial: potInicial ? Number(potInicial) : null, potencia_pico: Number(potenciaPico), tiempo_escalon_completado: Number(tiempoCompletado), tiempo_escalon_no_completado: Number(tiempoNoCompletado), duracion_escalones: Number(durEscalones), incremento_potencia: Number(incrementoPot), ftp: calcularFTP() })
    if (error) setError('Error: ' + error.message)
    else { setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  const guardarTestFuerza = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const rm = calcularRM()
    const { error } = await supabase.from('test_fuerza').insert({ id_deportista: Number(id), fecha, ejercicio, grupo_muscular: grupoMuscular, peso_kg: Number(pesoKg), repeticiones: Number(reps), rm_estimado: rm, notas: notasFuerza })
    if (error) setError('Error: ' + error.message)
    else { setEjercicio(''); setGrupoMuscular(''); setPesoKg(''); setReps(''); setNotasFuerza(''); setFecha(''); setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  const guardarTestLibre = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.from('tests_libres').insert({ id_deportista: Number(id), nombre: nombreLibre, fecha: fechaLibre, resultado: resultadoLibre, unidad: unidadLibre, notas: notasLibre })
    if (error) setError('Error: ' + error.message)
    else { setNombreLibre(''); setFechaLibre(''); setResultadoLibre(''); setUnidadLibre(''); setNotasLibre(''); setMostrarFormLibre(false); cargarDatos() }
    setLoading(false)
  }

  const resetSprint = () => { setSprintDist('40'); setSprintTiempo(''); setMppSprint(''); setT25(''); setT50('') }

  // Guardar test de SPRINT suelto
  const guardarSprint = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    let err: any = null
    if (tab === 'carrera') ({ error: err } = await supabase.from('test1_carrera').insert({ id_deportista: Number(id), fecha, mss: calcularMSS() }))
    else if (tab === 'ciclismo') ({ error: err } = await supabase.from('test3_ciclismo').insert({ id_deportista: Number(id), fecha, mpp: Number(mppSprint) }))
    else if (tab === 'natacion') ({ error: err } = await supabase.from('test2_natacion').insert({ id_deportista: Number(id), fecha, v25: calcularVsprint(t25, 25), v50: calcularVsprint(t50, 50) }))
    if (err) setError('Error: ' + err.message)
    else { resetSprint(); setFecha(''); setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  // Guardar PROTOCOLO combinado (aeróbico + sprint en una sesión, un solo registro)
  const guardarProtocolo = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    let err: any = null
    if (tab === 'carrera') ({ error: err } = await supabase.from('test1_carrera').insert({ id_deportista: Number(id), fecha, velocidad_inicial: velInicial ? Number(velInicial) : null, velocidad_ultimo_escalon: Number(velUltimo), duracion_total_escalon: Number(durTotal), tiempo_aguantado_ultimo: Number(tiempoAguantado), incremento_velocidad: Number(incrementoVel), vam: calcularVAM(), mss: calcularMSS() }))
    else if (tab === 'ciclismo') ({ error: err } = await supabase.from('test3_ciclismo').insert({ id_deportista: Number(id), fecha, potencia_inicial: potInicial ? Number(potInicial) : null, potencia_pico: Number(potenciaPico), tiempo_escalon_completado: Number(tiempoCompletado), tiempo_escalon_no_completado: Number(tiempoNoCompletado), duracion_escalones: Number(durEscalones), incremento_potencia: Number(incrementoPot), ftp: calcularFTP(), mpp: Number(mppSprint) }))
    else if (tab === 'natacion') ({ error: err } = await supabase.from('test2_natacion').insert({ id_deportista: Number(id), fecha, distancia_grande: Number(distGrande), distancia_pequena: Number(distPequena), tiempo_distancia_grande: Number(tiempoGrande), tiempo_distancia_pequena: Number(tiempoPequeno), css: calcularCSS(), v25: calcularVsprint(t25, 25), v50: calcularVsprint(t50, 50) }))
    if (err) setError('Error: ' + err.message)
    else { setMostrarProtocolo(false); resetSprint(); setFecha(''); cargarDatos() }
    setLoading(false)
  }

  if (!deportista) return <Cargando noExiste={noExiste} />

  const rmPreview = calcularRM()

  // Intensidades por zona a partir de los tests más recientes
  const intVals = { vam: tests1[0]?.vam ?? null, css: tests2[0]?.css ?? null, ftp: tests3[0]?.ftp ?? null }
  const hayIntensidades = !!(intVals.vam || intVals.css || intVals.ftp)
  const filasInt = hayIntensidades ? tablaIntensidades(intVals, deportista.fc_maxima) : []
  const objetivos = calcularObjetivos(objPrueba, intVals, Number(velBici) || 32)

  // ---- Estado actual: último valor de cada test + variación respecto al anterior ----
  // Las listas vienen ordenadas por fecha descendente, así que [0] es el más reciente.
  // En todas estas métricas MÁS ALTO = MEJOR, por eso la flecha arriba siempre es verde.
  const ultimoDe = (arr: any[], key: string) => {
    const vals = (arr || []).filter(t => t[key] != null)
    if (!vals.length) return null
    const delta = vals[1] != null ? Math.round((vals[0][key] - vals[1][key]) * 100) / 100 : null
    return { valor: vals[0][key], fecha: vals[0].fecha, delta }
  }
  const RECORDS: any[] = [
    { k: 'VAM', u: 'km/h', c: '#4ade80', d: ultimoDe(tests1, 'vam'), sub: (v: number) => formatVAM(v) },
    { k: 'MSS', u: 'km/h', c: '#86efac', d: ultimoDe(tests1, 'mss') },
    { k: 'CSS', u: 'm/s', c: '#60a5fa', d: ultimoDe(tests2, 'css'), sub: (v: number) => formatCSS(v) },
    { k: 'V25', u: 'm/s', c: '#93c5fd', d: ultimoDe(tests2, 'v25') },
    { k: 'V50', u: 'm/s', c: '#93c5fd', d: ultimoDe(tests2, 'v50') },
    { k: 'FTP', u: 'W', c: '#facc15', d: ultimoDe(tests3, 'ftp') },
    { k: 'MPP', u: 'W', c: '#fbbf24', d: ultimoDe(tests3, 'mpp') },
  ].filter(r => r.d)
  // 1RM: el registro más reciente de cada ejercicio.
  const rmPorEjercicio: any[] = Object.values((testsFuerza || []).reduce((acc: any, t: any) => {
    if (!acc[t.ejercicio]) acc[t.ejercicio] = t
    return acc
  }, {}))
  // Días desde el último test de cualquier tipo.
  const fechasTest = [tests1[0]?.fecha, tests2[0]?.fecha, tests3[0]?.fecha, testsFuerza[0]?.fecha, testsLibres[0]?.fecha].filter(Boolean).sort()
  const ultimaFecha = fechasTest[fechasTest.length - 1]
  const diasUltimo = ultimaFecha ? Math.floor((Date.now() - new Date(ultimaFecha).getTime()) / 86400000) : null

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-30 pl-44 pr-6 h-[54px] flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        {enMarcha ? (
          <BarraDeTest titulo={(testSelObj?.nombre ?? "Test") + " en marcha"}
            sub={deportista?.nombre} onSalir={bloqueo.preguntar} />
        ) : (<>
          <h1 className="text-[17px] font-bold tracking-tight truncate">Tests <span className="text-gray-500 font-normal text-[13px] hidden sm:inline">· rendimiento y récords</span></h1>
          <button onClick={() => router.push(`/deportistas/${id}`)} className="text-gray-400 hover:text-white text-[13px] transition flex-shrink-0">← Perfil deportista</button>
        </>)}
      </header>

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-5">

        {/* ===== FILA SUPERIOR: cabecera (1/3) + estado actual (2/3) ===== */}
        <div className="grid gap-4 lg:grid-cols-3 mb-4 items-stretch">
          <div className="tp-card p-5 flex flex-col justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-bold tracking-tight leading-tight">Tests — {deportista.nombre}</h2>
              <p className="text-gray-500 text-[13px] mt-1">Resultados de tests de rendimiento</p>
              {diasUltimo != null && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-[12px] text-gray-400">Último test hace <b className="text-gray-200">{diasUltimo} días</b></span>
                  {diasUltimo >= 42 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#eab30822', color: '#eab308' }}>Conviene repetir</span>}
                </div>
              )}
            </div>
            {hayIntensidades && (
              <button onClick={() => setMostrarIntensidades(true)}
                className="bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/40 text-orange-300 px-4 py-2.5 rounded-xl text-sm font-semibold transition w-full">
                🎯 Ver intensidades
              </button>
            )}
          </div>

          <div className="lg:col-span-2 tp-card p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
              <p className="text-[13px] font-semibold">Estado actual</p>
              <span className="text-[11px] text-gray-500">último valor de cada test · variación vs. el anterior</span>
            </div>
            {RECORDS.length === 0 && rmPorEjercicio.length === 0 ? (
              <p className="text-gray-500 text-[13px] py-8 text-center">Aún no hay tests registrados para este deportista.</p>
            ) : (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(122px,1fr))' }}>
                {RECORDS.map(r => (
                  <div key={r.k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <p className="text-[10.5px] text-gray-400 font-semibold tracking-wide">{r.k}</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-[21px] font-bold leading-none" style={{ color: r.c }}>{r.d.valor}</span>
                      <span className="text-[10px] text-gray-500">{r.u}</span>
                    </div>
                    {r.sub && <p className="text-[10px] text-gray-500 mt-1">{r.sub(r.d.valor)}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      {r.d.delta != null && r.d.delta !== 0 && (
                        <span className="text-[10px] font-bold" style={{ color: r.d.delta > 0 ? '#4ade80' : '#f87171' }}>
                          {r.d.delta > 0 ? '▲' : '▼'} {Math.abs(r.d.delta)}
                        </span>
                      )}
                      <span className="text-[9.5px] text-gray-600">{r.d.fecha}</span>
                    </div>
                  </div>
                ))}
                {rmPorEjercicio.slice(0, 4).map((t: any) => (
                  <div key={t.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <p className="text-[10.5px] text-gray-400 font-semibold truncate" title={t.ejercicio}>{t.ejercicio}</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-[21px] font-bold leading-none text-orange-400">{t.rm_estimado}</span>
                      <span className="text-[10px] text-gray-500">kg</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">1RM</p>
                    <span className="text-[9.5px] text-gray-600">{t.fecha}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ===== LOS TESTS ===== */}
        <div>
        <div className="min-w-0">

        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setMostrarForm(false); setTestSel(null); setModo(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {ETIQUETA_TAB[t]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h3 className="text-xl font-bold">{TITULO_TAB[tab]}</h3>
          {tab !== 'fuerza' && tab !== 'triatlon' && (
            <button onClick={() => setMostrarProtocolo(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition">🔬 Protocolo</button>
          )}
        </div>

        {/* ===== DE AQUÍ SALEN SUS ZONAS =====
            Va lo primero porque es el número del que cuelga todo lo demás: los
            ritmos, las potencias y las intensidades que se le prescriben. */}
        {anclaDef && (
          <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/[0.07] px-4 py-3 flex items-center gap-4 flex-wrap">
            {anclaFila ? (
              <>
                <span className="font-mono tabular-nums text-2xl font-bold text-blue-400 leading-none">
                  {anclaFila[anclaDef.col]} <span className="text-sm font-normal">{anclaDef.unidad}</span>
                </span>
                <span className="text-[12.5px] text-gray-400 flex-1 min-w-[220px]">
                  <b className="text-gray-100">De aquí salen sus zonas de {TITULO_TAB[tab].toLowerCase()}.</b>{' '}
                  Es el {anclaDef.nombre} que usa toda la app para calcular sus ritmos.
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {anclaFila.origen
                      ? testsDelTab.find(t => t.id === anclaFila.origen)?.nombre ?? anclaFila.origen
                      : CLASICOS_TAB[tab]?.find(c => c.zonas)?.nombre ?? 'Test clásico'}
                    {anclaFila.fecha ? ' · ' + anclaFila.fecha : ''}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[12.5px] text-gray-400">
                Todavía no tiene <b className="text-gray-100">{anclaDef.nombre}</b>: sus zonas de{' '}
                {TITULO_TAB[tab].toLowerCase()} no se pueden calcular hasta que haga uno de los tests
                marcados <span className="text-blue-400 font-semibold">ZONAS</span>.
              </span>
            )}
          </div>
        )}

        {/* ===== TODOS LOS TESTS DE LA DISCIPLINA, A LA VISTA =====
            Antes esto eran dos subpestañas —«Aeróbico» y «Sprint»— más un botón
            «+ Nuevo test», y el resto de la batería vivía plegado al fondo. Con
            ocho tests de carrera eso ya no daba: había que saberse de memoria
            cuál estaba detrás de qué botón.

            Ahora se ven todos con su nombre y se pulsa el que toca. El punto
            naranja dice cuáles se pueden dirigir en vivo con cronómetro. */}
        <div className="mb-4">
          <p className="text-[10.5px] font-semibold tracking-widest uppercase text-gray-500 mb-2">
            Tests de {TITULO_TAB[tab].toLowerCase()} <span className="text-orange-400">{testsDelTab.length}</span>
          </p>
          <div className="flex gap-2 flex-wrap">
            {testsDelTab.map(t => (
              <button key={t.id} onClick={() => elegirTest(t)}
                className={'px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 border ' +
                  (testSel === t.id
                    ? 'bg-orange-500/15 border-orange-500/45 text-orange-400 font-semibold'
                    : 'bg-white/[0.035] border-white/[0.075] text-gray-400 hover:text-white hover:bg-white/[0.075]')}>
                <span className={'w-1.5 h-1.5 rounded-full ' +
                  (testSel === t.id ? 'bg-current' : t.conCrono ? 'bg-orange-500' : 'bg-gray-600')} />
                {t.nombre}
                {t.zonas && <span className="text-[9.5px] text-blue-400 font-semibold">ZONAS</span>}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        <ProtocoloTest tipo={tab} />

        {/* GRÁFICAS DE EVOLUCIÓN */}
        {tab === 'carrera' && <GraficaEvolucion datos={tests1} dataKey="vam" color="#4ade80" unidad="km/h" label="VAM" />}
        {tab === 'natacion' && <GraficaEvolucion datos={tests2} dataKey="css" color="#60a5fa" unidad="m/s" label="CSS" />}
        {tab === 'ciclismo' && <GraficaEvolucion datos={tests3} dataKey="ftp" color="#facc15" unidad="W" label="FTP" />}
        {tab === 'fuerza' && <GraficaFuerza datos={testsFuerza} />}

        {/* ===== ¿CÓMO LO VAS A HACER? =====
            La pregunta va DESPUÉS de elegir el test y ANTES de ver nada, que es
            el orden en que se decide de verdad. Solo sale si el test tiene
            instrumentos: donde solo hay una forma, preguntar es ruido. */}
        {testSel && testSelObj?.conCrono && modo === null && (
          <div className="tp-card p-4 mb-4">
            <p className="text-[13px] font-semibold">¿Cómo vas a hacer el {testSelObj.nombre}?</p>
            <p className="text-[11.5px] text-gray-500 mt-0.5 mb-3">Eliges una y solo se enseña esa.</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {([
                { m: 'campo' as const, ic: '⏱️', t: 'Test de campo',
                  d: 'Lo estoy haciendo ahora. Cronómetro, secuenciador y contador, y el número sale mientras mides.' },
                { m: 'mano' as const, ic: '✍️', t: 'A mano',
                  d: 'Ya está hecho. Meto los números que apunté y la app calcula el resultado.' },
              ]).map(o => (
                <button key={o.m} onClick={() => setModo(o.m)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-orange-500/40 p-4 text-left transition">
                  <p className="text-[15px] font-bold">{o.ic} {o.t}</p>
                  <p className="text-[12px] text-gray-400 mt-1 leading-snug">{o.d}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ya elegido: se dice cuál es y se puede cambiar sin cerrar el test. */}
        {testSel && modo && testSelObj?.conCrono && (
          <div className="flex items-center gap-2 mb-3 text-[12px]">
            <span className="text-gray-400">{modo === 'campo' ? '⏱️ Test de campo' : '✍️ A mano'}</span>
            <button onClick={() => setModo(null)} className="text-orange-400/90 hover:text-orange-300 transition">cambiar</button>
          </div>
        )}

        {/* La ficha del test de la batería que esté elegido arriba. */}
        {claveBateria && modo && (
          <TestDeCampo idDeportista={Number(id)} disciplina={DISCIPLINA_TAB[tab]}
            clave={claveBateria} contexto={contexto} modo={modo} onGuardado={cargarDatos} />
        )}

        {/* La evolución de ese test. Hasta ahora la batería no podía tener
            ninguna: su resultado se guardaba como texto. */}
        {claveBateria && campoDelTest.length > 1 && (
          <GraficaEvolucion datos={campoDelTest} dataKey="principal" color="#fb923c"
            unidad={campoDelTest[0].unidad ?? ''} label={testSelObj?.nombre ?? ''}
            mejor={CATALOGO.find(x => x.clave === claveBateria)?.salidas.find(o => o.principal)?.mejor ?? 'alto'} />
        )}

        {/* ===== MONTREAL ===== */}
        {mostrarForm && modo && testTipo === 'aerobico' && tab === 'carrera' && (
          <form onSubmit={guardarTest1} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test incremental de carrera</h4>
            <Campo etiqueta="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />

            {modo === 'campo' ? (<>
              <Zona titulo="Ajustes del protocolo" pie="Se cambian antes de arrancar y se guardan con el test: dos Montreal que empiezan a distinta velocidad no se pueden comparar.">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Campo etiqueta="Empieza en (km/h)" type="number" step="0.1" value={velInicial}
                    onChange={e => setVelInicial(e.target.value)} placeholder="8" />
                  <Campo etiqueta="Sube cada escalón (km/h)" type="number" step="0.1" value={incrementoVel}
                    onChange={e => setIncrementoVel(e.target.value)} required />
                  <Campo etiqueta="Dura cada escalón (seg)" type="number" value={durTotal}
                    onChange={e => setDurTotal(e.target.value)} required />
                </div>
              </Zona>
              <InstrumentosTest id="montreal" herramientas={herramientasDe('montreal')} aviso={avisoDe('montreal')}
                valores={VALORES} setCampo={ponCampo} onEnMarcha={setEnMarcha} />
              <Zona titulo="Lo que ha cogido el secuenciador" pie="Se rellena solo cuando el atleta se baja, y de ahí sale la VAM de abajo. Solo hay que tocarlo si cogiste mal el momento.">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Campo etiqueta="Velocidad del último escalón (km/h)" type="number" step="0.1" value={velUltimo}
                    onChange={e => setVelUltimo(e.target.value)} required />
                  <Campo etiqueta="Segundos aguantados en él" type="number" value={tiempoAguantado}
                    onChange={e => setTiempoAguantado(e.target.value)} required />
                </div>
              </Zona>
            </>) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo etiqueta="Empezó en (km/h)" type="number" step="0.1" value={velInicial}
                  onChange={e => setVelInicial(e.target.value)} placeholder="8" />
                <Campo etiqueta="Velocidad del último escalón (km/h)" type="number" step="0.1" value={velUltimo}
                  onChange={e => setVelUltimo(e.target.value)} required />
                <Campo etiqueta="Duración total del escalón (seg)" type="number" value={durTotal}
                  onChange={e => setDurTotal(e.target.value)} required />
                <Campo etiqueta="Tiempo aguantado en el último (seg)" type="number" value={tiempoAguantado}
                  onChange={e => setTiempoAguantado(e.target.value)} required />
                <Campo etiqueta="Incremento por escalón (km/h)" type="number" step="0.1" value={incrementoVel}
                  onChange={e => setIncrementoVel(e.target.value)} required />
              </div>
            )}

            {calcularVAM() && <Salida><span><span className="text-gray-400">VAM calculada: </span><span className="text-orange-400 font-bold">{calcularVAM()} km/h</span><span className="text-gray-400 ml-3">({formatVAM(calcularVAM()!)})</span></span></Salida>}
            <button type="submit" disabled={loading} className={BOTON_GUARDAR}>{loading ? 'Guardando…' : 'Guardar test'}</button>
          </form>
        )}

        {/* ===== CSS ===== */}
        {mostrarForm && modo && testTipo === 'aerobico' && tab === 'natacion' && (
          <form onSubmit={guardarTest2} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test CSS de natación</h4>
            <Campo etiqueta="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />

            {modo === 'campo' ? (<>
              <Zona titulo="Ajustes del protocolo" pie="Las dos distancias del test.">
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Distancia grande (m)" type="number" value={distGrande} onChange={e => setDistGrande(e.target.value)} required />
                  <Campo etiqueta="Distancia pequeña (m)" type="number" value={distPequena} onChange={e => setDistPequena(e.target.value)} required />
                </div>
              </Zona>
              <InstrumentosTest id="css" herramientas={herramientasDe('css')} aviso={avisoDe('css')}
                valores={VALORES} setCampo={ponCampo} onEnMarcha={setEnMarcha} />
              <Zona titulo="Lo que han cogido los cronómetros" pie="Se rellena solo al pararlos, y de ahí sale la CSS de abajo.">
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Tiempo de la grande (seg)" type="number" value={tiempoGrande} onChange={e => setTiempoGrande(e.target.value)} required />
                  <Campo etiqueta="Tiempo de la pequeña (seg)" type="number" value={tiempoPequeno} onChange={e => setTiempoPequeno(e.target.value)} required />
                </div>
              </Zona>
            </>) : (
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Distancia grande (m)" type="number" value={distGrande} onChange={e => setDistGrande(e.target.value)} required />
                <Campo etiqueta="Distancia pequeña (m)" type="number" value={distPequena} onChange={e => setDistPequena(e.target.value)} required />
                <Campo etiqueta="Tiempo de la grande (seg)" type="number" value={tiempoGrande} onChange={e => setTiempoGrande(e.target.value)} required />
                <Campo etiqueta="Tiempo de la pequeña (seg)" type="number" value={tiempoPequeno} onChange={e => setTiempoPequeno(e.target.value)} required />
              </div>
            )}

            {calcularCSS() && <Salida><span><span className="text-gray-400">CSS calculada: </span><span className="text-orange-400 font-bold">{calcularCSS()} m/s</span><span className="text-gray-400 ml-3">({formatCSS(calcularCSS()!)})</span></span></Salida>}
            <button type="submit" disabled={loading} className={BOTON_GUARDAR}>{loading ? 'Guardando…' : 'Guardar test'}</button>
          </form>
        )}

        {/* ===== RAMPA ===== */}
        {mostrarForm && modo && testTipo === 'aerobico' && tab === 'ciclismo' && (
          <form onSubmit={guardarTest3} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test de rampa en ciclismo</h4>
            <Campo etiqueta="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />

            {modo === 'campo' ? (<>
              <Zona titulo="Ajustes del protocolo" pie="Se cambian antes de arrancar y se guardan con el test.">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Campo etiqueta="Empieza en (W)" type="number" value={potInicial} onChange={e => setPotInicial(e.target.value)} placeholder="150" />
                  <Campo etiqueta="Sube cada escalón (W)" type="number" value={incrementoPot} onChange={e => setIncrementoPot(e.target.value)} required />
                  <Campo etiqueta="Dura cada escalón (seg)" type="number" value={durEscalones} onChange={e => setDurEscalones(e.target.value)} required />
                </div>
              </Zona>
              <InstrumentosTest id="rampa" herramientas={herramientasDe('rampa')} aviso={avisoDe('rampa')}
                valores={VALORES} setCampo={ponCampo} onEnMarcha={setEnMarcha} />
              <Zona titulo="Lo que ha cogido el secuenciador" pie="La potencia y los segundos del escalón en el que se bajó se rellenan solos; de ahí salen la PAM y el FTP de abajo.">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Campo etiqueta="Potencia pico (W)" type="number" value={potenciaPico} onChange={e => setPotenciaPico(e.target.value)} required />
                  <Campo etiqueta="Segundos del escalón no completado" type="number" value={tiempoNoCompletado} onChange={e => setTiempoNoCompletado(e.target.value)} required />
                  <Campo etiqueta="Segundos del último completado" type="number" value={tiempoCompletado} onChange={e => setTiempoCompletado(e.target.value)} required />
                </div>
              </Zona>
            </>) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo etiqueta="Empezó en (W)" type="number" value={potInicial} onChange={e => setPotInicial(e.target.value)} placeholder="150" />
                <Campo etiqueta="Potencia pico (W)" type="number" value={potenciaPico} onChange={e => setPotenciaPico(e.target.value)} required />
                <Campo etiqueta="Duración de los escalones (seg)" type="number" value={durEscalones} onChange={e => setDurEscalones(e.target.value)} required />
                <Campo etiqueta="Tiempo del escalón completado (seg)" type="number" value={tiempoCompletado} onChange={e => setTiempoCompletado(e.target.value)} required />
                <Campo etiqueta="Tiempo del escalón no completado (seg)" type="number" value={tiempoNoCompletado} onChange={e => setTiempoNoCompletado(e.target.value)} required />
                <Campo etiqueta="Incremento por escalón (W)" type="number" value={incrementoPot} onChange={e => setIncrementoPot(e.target.value)} required />
              </div>
            )}

            {calcularFTP() && <Salida>
              <span><span className="text-gray-400">PAM: </span><span className="text-orange-400 font-bold">{calcularPAM()} W</span></span>
              <span><span className="text-gray-400">FTP (75 %): </span><span className="text-orange-400 font-bold">{calcularFTP()} W</span></span>
            </Salida>}
            <button type="submit" disabled={loading} className={BOTON_GUARDAR}>{loading ? 'Guardando…' : 'Guardar test'}</button>
          </form>
        )}

        {/* ===== SPRINTS ===== */}
        {mostrarForm && modo && testTipo === 'sprint' && tab === 'carrera' && (
          <form onSubmit={guardarSprint} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Sprint — velocidad máxima (MSS)</h4>
            <p className="text-gray-400 text-sm">Sprint lanzado de 30–40 m a máxima velocidad, con 10–20 m previos de lanzamiento.</p>
            <Campo etiqueta="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />

            {modo === 'campo' ? (<>
              <Zona titulo="Ajustes del protocolo">
                <Campo etiqueta="Distancia cronometrada (m)" type="number" step="0.5" value={sprintDist} onChange={e => setSprintDist(e.target.value)} required />
              </Zona>
              <InstrumentosTest id="sprint-carrera" herramientas={herramientasDe('sprint-carrera')} aviso={avisoDe('sprint-carrera')}
                valores={VALORES} setCampo={ponCampo} onEnMarcha={setEnMarcha} />
              <Zona titulo="Lo que ha cogido el cronómetro" pie="Se rellena solo al pararlo, y de ahí sale la MSS de abajo.">
                <Campo etiqueta="Tiempo (seg)" type="number" step="0.01" value={sprintTiempo} onChange={e => setSprintTiempo(e.target.value)} required />
              </Zona>
            </>) : (
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Distancia (m)" type="number" step="0.5" value={sprintDist} onChange={e => setSprintDist(e.target.value)} required />
                <Campo etiqueta="Tiempo (seg)" type="number" step="0.01" value={sprintTiempo} onChange={e => setSprintTiempo(e.target.value)} required />
              </div>
            )}

            {calcularMSS() && <Salida><span><span className="text-gray-400">MSS: </span><span className="text-orange-400 font-bold">{calcularMSS()} km/h</span>{asrPreview !== null && <span className="text-blue-400 ml-3">· ASR = MSS − VAM: {asrPreview} km/h</span>}</span></Salida>}
            <button type="submit" disabled={loading} className={BOTON_GUARDAR}>{loading ? 'Guardando…' : 'Guardar test'}</button>
          </form>
        )}

        {mostrarForm && modo && testTipo === 'sprint' && tab === 'ciclismo' && (
          <form onSubmit={guardarSprint} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Sprint — potencia pico (MPP)</h4>
            <p className="text-gray-400 text-sm">Sprint máximo de 6 segundos tras calentar. El número lo da el potenciómetro.</p>
            <Campo etiqueta="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
            <Campo etiqueta="Potencia pico (W)" type="number" value={mppSprint} onChange={e => setMppSprint(e.target.value)} required />
            {mppSprint && <Salida><span><span className="text-gray-400">MPP: </span><span className="text-orange-400 font-bold">{mppSprint} W</span>{aprPreview !== null && <span className="text-blue-400 ml-3">· APR = MPP − PAM: {aprPreview} W</span>}</span></Salida>}
            <button type="submit" disabled={loading} className={BOTON_GUARDAR}>{loading ? 'Guardando…' : 'Guardar test'}</button>
          </form>
        )}

        {mostrarForm && modo && testTipo === 'sprint' && tab === 'natacion' && (
          <form onSubmit={guardarSprint} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Sprints — velocidades máximas (V25 / V50)</h4>
            <p className="text-gray-400 text-sm">Sprints máximos de 25 m y 50 m, con recuperación completa entre ellos.</p>
            <Campo etiqueta="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />

            {modo === 'campo' && <InstrumentosTest id="sprint-natacion" herramientas={herramientasDe('sprint-natacion')} aviso={avisoDe('sprint-natacion')}
                valores={VALORES} setCampo={ponCampo} onEnMarcha={setEnMarcha} />}
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Tiempo 25 m (seg)" type="number" step="0.01" value={t25} onChange={e => setT25(e.target.value)} required />
              <Campo etiqueta="Tiempo 50 m (seg)" type="number" step="0.01" value={t50} onChange={e => setT50(e.target.value)} required />
            </div>

            {(calcularVsprint(t25, 25) || calcularVsprint(t50, 50)) && <Salida>
              <span><span className="text-gray-400">V25: </span><span className="text-orange-400 font-bold">{calcularVsprint(t25, 25) || '—'} m/s</span></span>
              <span><span className="text-gray-400">V50: </span><span className="text-orange-400 font-bold">{calcularVsprint(t50, 50) || '—'} m/s</span></span>
            </Salida>}
            <button type="submit" disabled={loading} className={BOTON_GUARDAR}>{loading ? 'Guardando…' : 'Guardar test'}</button>
          </form>
        )}

        {/* ===== 1RM ===== */}
        {mostrarForm && modo && tab === 'fuerza' && (
          <form onSubmit={guardarTestFuerza} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test de 1RM — fuerza máxima</h4>
            <p className="text-gray-400 text-sm">Una repetición al fallo es el 1RM directo. Con más repeticiones se estima con la fórmula de Epley.</p>
            <Campo etiqueta="Fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
            <Campo etiqueta="Ejercicio" type="text" placeholder="Sentadilla, press banca, peso muerto…" value={ejercicio} onChange={e => setEjercicio(e.target.value)} required />
            <label className="flex flex-col gap-1">
              <span className="text-gray-400 text-sm">Grupo muscular principal</span>
              <select value={grupoMuscular} onChange={e => setGrupoMuscular(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Sin especificar</option>
                {GRUPOS_MUSCULARES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Peso (kg)" type="number" step="0.5" value={pesoKg} onChange={e => setPesoKg(e.target.value)} required />
              <Campo etiqueta="Repeticiones" type="number" value={reps} onChange={e => setReps(e.target.value)} required />
            </div>
            {rmPreview && <Salida><span><span className="text-gray-400">1RM estimado (Epley): </span><span className="text-orange-400 font-bold">{rmPreview} kg</span></span></Salida>}
            <textarea placeholder="Notas (opcional)" value={notasFuerza} onChange={e => setNotasFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
            <button type="submit" disabled={loading} className={BOTON_GUARDAR}>{loading ? 'Guardando…' : 'Guardar test'}</button>
          </form>
        )}

        {/* LISTAS DE TESTS */}
        {tab === 'carrera' && (tests1.length === 0 ?
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏃</div><p>Todavía no hay tests de carrera.</p></div> :
          <div className="grid gap-4">{tests1.map(t => (
            <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-gray-400 text-sm">{t.fecha}</p>
                  <p className="text-gray-300 text-sm mt-1">{formatVAM(t.vam)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-2xl text-green-400">{t.vam}</p>
                  <p className="text-gray-500 text-xs">km/h VAM</p>
                </div>
              </div>
            </div>
          ))}</div>
        )}

        {tab === 'natacion' && (tests2.length === 0 ?
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏊</div><p>Todavía no hay tests de natación.</p></div> :
          <div className="grid gap-4">{tests2.map(t => (
            <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-gray-400 text-sm">{t.fecha}</p>
                  <p className="text-gray-300 text-sm mt-1">{formatCSS(t.css)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-2xl text-blue-400">{t.css}</p>
                  <p className="text-gray-500 text-xs">m/s CSS</p>
                </div>
              </div>
            </div>
          ))}</div>
        )}

        {tab === 'ciclismo' && (tests3.length === 0 ?
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🚴</div><p>Todavía no hay tests de ciclismo.</p></div> :
          <div className="grid gap-4">{tests3.map(t => (
            <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex justify-between items-center">
                <div><p className="text-gray-400 text-sm">{t.fecha}</p></div>
                <div className="text-right">
                  <p className="font-bold text-2xl text-yellow-400">{t.ftp}</p>
                  <p className="text-gray-500 text-xs">W FTP</p>
                </div>
              </div>
            </div>
          ))}</div>
        )}

        {tab === 'fuerza' && (testsFuerza.length === 0 ?
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏋️</div><p>Todavía no hay tests de fuerza.</p></div> :
          <div className="grid gap-4">{testsFuerza.map(t => (
            <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-lg">{t.ejercicio}</p>
                  <p className="text-gray-400 text-sm">{t.grupo_muscular} · {t.fecha}</p>
                  <p className="text-gray-300 text-sm">{t.peso_kg} kg × {t.repeticiones} reps</p>
                  {t.notas && <p className="text-gray-400 text-sm mt-1">{t.notas}</p>}
                </div>
                <div className="text-right">
                  <p className="text-orange-400 font-bold text-2xl">{t.rm_estimado} kg</p>
                  <p className="text-gray-400 text-sm">1RM estimado</p>
                </div>
              </div>
            </div>
          ))}</div>
        )}

        {/* ===== LO QUE HA HECHO DE LA BATERÍA =====
            Antes esto no se veía en ningún sitio de la disciplina: caía en el
            panel de «Otros tests», mezclado con lo apuntado a mano y guardado
            como texto. Ahora son números, así que tienen su lista y su
            evolución igual que los clásicos. */}
        {!!campoDelTab.length && (
          <div className="mt-6">
            <p className="text-[10.5px] font-semibold tracking-widest uppercase text-gray-500 mb-2">
              De la batería <span className="text-orange-400">{campoDelTab.length}</span>
            </p>
            <div className="grid gap-2">
              {campoDelTab.map(r => {
                const def = CATALOGO.find(x => x.clave === r.clave)
                return (
                  <button key={r.id} onClick={() => { setTestSel(r.clave); setModo('mano'); setMostrarForm(false) }}
                    className="tp-card p-3.5 flex items-center justify-between gap-3 text-left hover:border-white/20 transition">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold truncate">{def?.nombre ?? r.clave}</p>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        {r.fecha}
                        {r.modo && <span> · {r.modo === 'campo' ? 'dirigido' : 'a mano'}</span>}
                        {Object.keys(r.resultados ?? {}).length > 1 &&
                          <span> · {Object.keys(r.resultados ?? {}).length} datos</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-orange-400 font-bold text-[17px] leading-none tabular-nums">
                        {r.principal ?? '—'}
                      </p>
                      <p className="text-gray-500 text-[10px] mt-0.5">{r.unidad}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        </div>{/* /columna de los tests */}

        {/* ===== OTROS TESTS — los que no son del catálogo, guardados ===== */}
        <button onClick={() => setMostrarOtros(o => !o)}
          className="mt-2 mb-3 text-[12.5px] text-gray-500 hover:text-gray-300 transition">
          {mostrarOtros ? "▴ Ocultar otros tests" : "▾ Otros tests"}
          <span className="text-gray-600"> · los que apuntas a mano</span>
        </button>
        {mostrarOtros && (
        <div className="tp-card p-4 max-w-md">
          <div className="flex justify-between items-center gap-2 mb-1">
            <h3 className="text-[15px] font-bold">Otros tests</h3>
            <button onClick={() => setMostrarFormLibre(!mostrarFormLibre)} className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition flex-shrink-0">{mostrarFormLibre ? 'Cancelar' : '+ Añadir'}</button>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">Los de la batería y los que apuntes a mano</p>
          {mostrarFormLibre && (
            <form onSubmit={guardarTestLibre} className="rounded-xl p-3 mb-3 border border-white/[0.07] bg-white/[0.02] flex flex-col gap-2.5">
              <input type="text" placeholder="Nombre (ej: Cooper, Ruffier)" value={nombreLibre} onChange={e => setNombreLibre(e.target.value)} className="bg-white/[0.05] border border-white/[0.075] text-white text-[12.5px] px-3 py-2 rounded-lg outline-none focus:border-orange-500/50" required />
              <input type="date" value={fechaLibre} onChange={e => setFechaLibre(e.target.value)} className="bg-white/[0.05] border border-white/[0.075] text-white text-[12.5px] px-3 py-2 rounded-lg outline-none focus:border-orange-500/50 w-full" required />
              <input type="text" placeholder="Resultado (ej: 21:30)" value={resultadoLibre} onChange={e => setResultadoLibre(e.target.value)} className="bg-white/[0.05] border border-white/[0.075] text-white text-[12.5px] px-3 py-2 rounded-lg outline-none focus:border-orange-500/50" required />
              <input type="text" placeholder="Unidad (min:seg, kg…)" value={unidadLibre} onChange={e => setUnidadLibre(e.target.value)} className="bg-white/[0.05] border border-white/[0.075] text-white text-[12.5px] px-3 py-2 rounded-lg outline-none focus:border-orange-500/50" />
              <textarea placeholder="Notas (opcional)" value={notasLibre} onChange={e => setNotasLibre(e.target.value)} className="bg-white/[0.05] border border-white/[0.075] text-white text-[12.5px] px-3 py-2 rounded-lg outline-none focus:border-orange-500/50" rows={2} />
              <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-400 text-white text-[12.5px] font-semibold py-2 rounded-lg transition disabled:opacity-50">{loading ? 'Guardando…' : 'Guardar test'}</button>
            </form>
          )}
          {testsLibres.length === 0 ?
            <p className="text-center py-8 text-gray-500 text-[12.5px]">Todavía ninguno.</p> :
            <div className="flex flex-col">{testsLibres.map(t => (
              <div key={t.id} className="py-2.5 border-b border-gray-800/60 last:border-0">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h4 className="text-[12.5px] font-semibold text-gray-100 truncate">{t.nombre}</h4>
                    <p className="text-gray-500 text-[10.5px] mt-0.5">{t.fecha}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-orange-400 font-bold text-[15px] leading-none">{t.resultado}</p>
                    <p className="text-gray-500 text-[10px] mt-0.5">{t.unidad}</p>
                  </div>
                </div>
                {t.notas && <p className="text-gray-500 text-[10.5px] mt-1 leading-snug">{t.notas}</p>}
              </div>
            ))}</div>
          }
        </div>
        )}{/* /otros tests */}
        </div>{/* /los tests */}
      </div>

      {/* MODAL PROTOCOLO COMBINADO */}
      {mostrarProtocolo && tab !== 'fuerza' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
              <h3 className="text-lg font-bold">🔬 {PROTOCOLO_COMBINADO[tab].titulo}</h3>
              <button onClick={() => setMostrarProtocolo(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-6">
              <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4 mb-6 text-sm">
                <p className="text-blue-300 font-bold mb-2">Orden: sprint fresco primero, aeróbico al final</p>
                <ol className="list-decimal list-inside text-gray-300 space-y-1">
                  {PROTOCOLO_COMBINADO[tab].pasos.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
                <p className="text-gray-500 text-xs mt-3">{PROTOCOLO_COMBINADO[tab].nota}</p>
              </div>

              {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

              <form onSubmit={guardarProtocolo} className="flex flex-col gap-4">
                <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>

                <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700">
                  <p className="text-orange-400 font-medium mb-3">⚡ 1 · Sprint (fresco)</p>
                  {tab === 'carrera' && (
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" step="0.5" placeholder="Distancia (m)" value={sprintDist} onChange={e => setSprintDist(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                      <input type="number" step="0.01" placeholder="Tiempo (s)" value={sprintTiempo} onChange={e => setSprintTiempo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    </div>
                  )}
                  {tab === 'ciclismo' && (
                    <input type="number" placeholder="Potencia pico MPP (W)" value={mppSprint} onChange={e => setMppSprint(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm w-full" required />
                  )}
                  {tab === 'natacion' && (
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" step="0.01" placeholder="Tiempo 25m (s)" value={t25} onChange={e => setT25(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                      <input type="number" step="0.01" placeholder="Tiempo 50m (s)" value={t50} onChange={e => setT50(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    </div>
                  )}
                </div>

                <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700 flex flex-col gap-3">
                  <p className="text-orange-400 font-medium">🫀 2 · Test aeróbico (tras recuperar)</p>
                  {tab === 'carrera' && (<>
                    <input type="number" step="0.1" placeholder="Velocidad último escalón (km/h)" value={velUltimo} onChange={e => setVelUltimo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    <input type="number" placeholder="Duración total del escalón (s)" value={durTotal} onChange={e => setDurTotal(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    <input type="number" placeholder="Tiempo aguantado último escalón (s)" value={tiempoAguantado} onChange={e => setTiempoAguantado(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    <input type="number" step="0.1" placeholder="Incremento velocidad por escalón (km/h)" value={incrementoVel} onChange={e => setIncrementoVel(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                  </>)}
                  {tab === 'ciclismo' && (<>
                    <input type="number" placeholder="Potencia pico test incremental (W)" value={potenciaPico} onChange={e => setPotenciaPico(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    <input type="number" placeholder="Duración de los escalones (s)" value={durEscalones} onChange={e => setDurEscalones(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    <input type="number" placeholder="Tiempo escalón completado (s)" value={tiempoCompletado} onChange={e => setTiempoCompletado(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    <input type="number" placeholder="Tiempo escalón no completado (s)" value={tiempoNoCompletado} onChange={e => setTiempoNoCompletado(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    <input type="number" placeholder="Incremento potencia por escalón (W)" value={incrementoPot} onChange={e => setIncrementoPot(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                  </>)}
                  {tab === 'natacion' && (<>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" placeholder="Distancia grande (m)" value={distGrande} onChange={e => setDistGrande(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                      <input type="number" placeholder="Distancia pequeña (m)" value={distPequena} onChange={e => setDistPequena(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" placeholder="Tiempo dist. grande (s)" value={tiempoGrande} onChange={e => setTiempoGrande(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                      <input type="number" placeholder="Tiempo dist. pequeña (s)" value={tiempoPequeno} onChange={e => setTiempoPequeno(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" required />
                    </div>
                  </>)}
                </div>

                <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
                  {tab === 'carrera' && (<>
                    {calcularVAM() && <span className="text-gray-400">VAM: <b className="text-orange-400">{calcularVAM()} km/h</b></span>}
                    {calcularMSS() && <span className="text-gray-400">MSS: <b className="text-orange-400">{calcularMSS()} km/h</b></span>}
                    {calcularVAM() && calcularMSS() && <span className="text-blue-400 font-medium">ASR: {Math.round((calcularMSS()! - calcularVAM()!) * 10) / 10} km/h</span>}
                  </>)}
                  {tab === 'ciclismo' && (<>
                    {calcularPAM() && <span className="text-gray-400">PAM: <b className="text-orange-400">{calcularPAM()} W</b></span>}
                    {calcularFTP() && <span className="text-gray-400">FTP: <b className="text-orange-400">{calcularFTP()} W</b></span>}
                    {mppSprint && <span className="text-gray-400">MPP: <b className="text-orange-400">{mppSprint} W</b></span>}
                    {/* La reserva anaeróbica se mide contra la PAM, no contra el
                        FTP — es el equivalente en vatios del ASR de carrera, que
                        ahí arriba va contra la VAM y no contra el umbral.

                        Esto DABA BIEN POR ACCIDENTE: restaba `calcularFTP()`,
                        que devolvía la PAM porque a la rampa le faltaba el
                        0,75. Al arreglar el FTP, esta línea se habría quedado
                        restando lo que no es sin que nada avisara. */}
                    {calcularPAM() && mppSprint && <span className="text-blue-400 font-medium">APR: {Number(mppSprint) - calcularPAM()!} W</span>}
                  </>)}
                  {tab === 'natacion' && (<>
                    {calcularCSS() && <span className="text-gray-400">CSS: <b className="text-orange-400">{calcularCSS()} m/s</b></span>}
                    {calcularVsprint(t25, 25) && <span className="text-gray-400">V25: <b className="text-orange-400">{calcularVsprint(t25, 25)} m/s</b></span>}
                    {calcularVsprint(t50, 50) && <span className="text-gray-400">V50: <b className="text-orange-400">{calcularVsprint(t50, 50)} m/s</b></span>}
                  </>)}
                </div>

                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-bold transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar protocolo completo'}</button>
              </form>
            </div>
          </div>
        </div>
      )}

      <AvisoDeSalida abierto={bloqueo.preguntando}
        aviso="Se para el reloj y se pierde lo que no hayas guardado."
        onSeguir={bloqueo.cerrar}
        onSalir={() => { bloqueo.cerrar(); setModo(null); setTestSel(null) }} />

      {/* Modal: tabla de intensidades por zona */}
      {mostrarIntensidades && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setMostrarIntensidades(false)}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-4 p-5 pb-0">
              <div>
                <h3 className="text-xl font-bold">🎯 Intensidades y objetivos — {deportista.nombre}</h3>
                <p className="text-gray-500 text-xs mt-1">
                  {intVals.vam && <>VAM <b className="text-gray-300">{intVals.vam} km/h</b> · </>}
                  {intVals.css && <>CSS <b className="text-gray-300">{intVals.css} m/s</b> · </>}
                  {intVals.ftp && <>FTP <b className="text-gray-300">{intVals.ftp} W</b> · </>}
                  {deportista.fc_maxima && <>FC máx <b className="text-gray-300">{deportista.fc_maxima} ppm</b></>}
                </p>
              </div>
              <button onClick={() => setMostrarIntensidades(false)} className="text-gray-400 hover:text-white text-2xl leading-none flex-shrink-0">×</button>
            </div>

            <div className="flex gap-1 px-5 pt-3 border-b border-gray-800">
              {([['zonas', 'Zonas de entrenamiento'], ['objetivos', 'Objetivos de carrera']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setIntTab(k)}
                  className={'px-3 py-2 text-sm font-medium transition border-b-2 -mb-px ' + (intTab === k ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>{l}</button>
              ))}
            </div>

            {intTab === 'zonas' ? (
              <div className="overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr className="text-left text-gray-500 text-xs">
                      <th className="px-4 py-2.5 font-medium">Zona</th>
                      <th className="px-4 py-2.5 font-medium">🏃 Carrera</th>
                      <th className="px-4 py-2.5 font-medium">🚴 Ciclismo</th>
                      <th className="px-4 py-2.5 font-medium">🏊 Natación</th>
                      <th className="px-4 py-2.5 font-medium">FC</th>
                      <th className="px-4 py-2.5 font-medium">RPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasInt.map(f => (
                      <tr key={f.sigla} className="border-t border-gray-800/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.color }} />
                            <div>
                              <p className="font-semibold text-gray-200 leading-tight">{f.sigla}</p>
                              <p className="text-[11px] text-gray-500 leading-tight">{f.nombre}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{f.carrera}</td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{f.ciclismo}</td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{f.natacion}</td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{f.fc}</td>
                        <td className="px-4 py-3 text-gray-400">{f.rpe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3 border-t border-gray-800 text-[11px] text-gray-600">
                  Calculado desde los tests más recientes. Donde falta el test, se muestra el rango en % (VAM/FTP) o el offset de CSS.
                </div>
              </div>
            ) : (
              <div className="p-5 overflow-auto">
                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Tipo de prueba</label>
                    <select value={objPrueba} onChange={e => setObjPrueba(e.target.value)} className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60">
                      {idsConPacing().map(id => <option key={id} value={id}>{pruebaPorId(id)?.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Vel. media bici (km/h)</label>
                    <input type="number" value={velBici} onChange={e => setVelBici(e.target.value)} className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none w-28 focus-visible:ring-2 focus-visible:ring-orange-500/60" />
                  </div>
                </div>
                {objetivos ? (
                  <>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-gray-500 text-xs">
                          <th className="px-3 py-2 font-medium">Segmento</th>
                          <th className="px-3 py-2 font-medium">Zona</th>
                          <th className="px-3 py-2 font-medium">Objetivo</th>
                          <th className="px-3 py-2 font-medium">Tiempo est.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {objetivos.filas.map((f, i) => (
                          <tr key={i} className="border-t border-gray-800/70">
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="font-semibold text-gray-200">{f.disc === 'Natación' ? '🏊' : f.disc === 'Ciclismo' ? '🚴' : '🏃'} {f.disc}</span>
                              {f.km != null && <span className="text-gray-500 text-xs"> · {f.km} km</span>}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: f.zonaColor + '22', color: f.zonaColor }}>{f.zona}</span>
                              <span className="text-[11px] text-gray-500 ml-1.5">{f.zonaNombre}</span>
                            </td>
                            <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{f.intensidad}</td>
                            <td className="px-3 py-3 text-gray-200 font-semibold whitespace-nowrap">{f.tiempo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-800">
                      <span className="text-sm text-gray-400">Tiempo total estimado</span>
                      <span className="text-lg font-bold text-orange-400">{objetivos.total}</span>
                    </div>
                    {objetivos.faltanTests && <p className="text-[11px] text-yellow-500/80 mt-2">Falta algún test (VAM/CSS/FTP): ese segmento muestra el % objetivo en vez del ritmo.</p>}
                    <p className="text-[11px] text-gray-600 mt-2">Intensidades de triatlón según B1-13 (Friel). La bici usa la velocidad media que introduzcas; nado y carrera salen de los tests. No incluye transiciones (~2–4 min).</p>
                  </>
                ) : <p className="text-gray-500 text-sm py-4">Esta prueba no tiene pacing definido todavía.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
