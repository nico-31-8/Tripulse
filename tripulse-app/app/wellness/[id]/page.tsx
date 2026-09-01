'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias } from '@/lib/fechas'
import Cargando from '@/components/Cargando'
import { usuarioActual } from '@/lib/sesion'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { analizarWellness, type MetricaAnalisis } from '@/lib/wellness-analisis'
import { bienestar, colorBienestar, estadoBienestar } from '@/lib/wellness-score'
import { vivas } from '@/lib/papelera'
import { type SesionCruce } from '@/lib/wellness-sesiones'
import CruceWellness from '@/components/CruceWellness'

// Color de la flecha de tendencia según si el cambio es favorable para esa métrica.
function flechaColor(m: MetricaAnalisis): string {
  if (m.flecha === 'flat') return '#6b7280'
  const sube = m.flecha === 'up'
  const bueno = (m.mejor === 'alto' && sube) || (m.mejor === 'bajo' && !sube)
  return bueno ? '#22c55e' : '#ef4444'
}

function scoreWellness(datos: any): number {
  const animoInv = 8 - datos.animo
  const motivacionInv = 8 - datos.motivacion
  const suma = datos.calidad_sueno + datos.fatiga + datos.estres + datos.dolor_muscular + animoInv + motivacionInv
  return Math.round(((suma - 6) / 36) * 100)
}

const EMOJI_CONFIG: Record<string, { label: string; opciones: { emoji: string; texto: string }[] }> = {
  calidad_sueno: { label: 'Calidad del sueno', opciones: [{ emoji: '😴', texto: 'Perfecta' },{ emoji: '😊', texto: 'Muy buena' },{ emoji: '🙂', texto: 'Buena' },{ emoji: '😐', texto: 'Regular' },{ emoji: '😪', texto: 'Mala' },{ emoji: '😩', texto: 'Muy mala' },{ emoji: '💀', texto: 'Pesima' }] },
  fatiga: { label: 'Fatiga percibida', opciones: [{ emoji: '⚡', texto: 'Sin fatiga' },{ emoji: '💪', texto: 'Muy leve' },{ emoji: '🙂', texto: 'Leve' },{ emoji: '😐', texto: 'Moderada' },{ emoji: '😓', texto: 'Alta' },{ emoji: '😩', texto: 'Muy alta' },{ emoji: '💀', texto: 'Agotado' }] },
  estres: { label: 'Estres general', opciones: [{ emoji: '😌', texto: 'Ninguno' },{ emoji: '🙂', texto: 'Muy bajo' },{ emoji: '😐', texto: 'Bajo' },{ emoji: '😤', texto: 'Moderado' },{ emoji: '😰', texto: 'Alto' },{ emoji: '😱', texto: 'Muy alto' },{ emoji: '🤯', texto: 'Extremo' }] },
  dolor_muscular: { label: 'Dolor muscular', opciones: [{ emoji: '✅', texto: 'Sin dolor' },{ emoji: '🟢', texto: 'Muy leve' },{ emoji: '🟡', texto: 'Leve' },{ emoji: '🟠', texto: 'Moderado' },{ emoji: '🔴', texto: 'Alto' },{ emoji: '😣', texto: 'Muy alto' },{ emoji: '🚨', texto: 'Intenso' }] },
  animo: { label: 'Estado de animo', opciones: [{ emoji: '😭', texto: 'Muy malo' },{ emoji: '😞', texto: 'Malo' },{ emoji: '😕', texto: 'Regular' },{ emoji: '😐', texto: 'Neutro' },{ emoji: '🙂', texto: 'Bueno' },{ emoji: '😊', texto: 'Muy bueno' },{ emoji: '🤩', texto: 'Excelente' }] },
  motivacion: { label: 'Motivacion', opciones: [{ emoji: '😶', texto: 'Ninguna' },{ emoji: '😴', texto: 'Muy baja' },{ emoji: '😕', texto: 'Baja' },{ emoji: '😐', texto: 'Normal' },{ emoji: '🙂', texto: 'Buena' },{ emoji: '💪', texto: 'Alta' },{ emoji: '🔥', texto: 'Maxima' }] },
  malestar_general: { label: 'Malestar general', opciones: [{ emoji: '💚', texto: 'Ninguno' },{ emoji: '🙂', texto: 'Muy leve' },{ emoji: '😐', texto: 'Leve' },{ emoji: '😕', texto: 'Moderado' },{ emoji: '🤢', texto: 'Alto' },{ emoji: '🤒', texto: 'Muy alto' },{ emoji: '🏥', texto: 'Extremo' }] },
}

function EmojiSelector({ campo, value, onChange }: { campo: string; value: number; onChange: (v: number) => void }) {
  const config = EMOJI_CONFIG[campo]
  if (!config) return null
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <label className="text-white font-medium text-sm">{config.label}</label>
        <span className="text-orange-400 font-bold text-sm">{config.opciones[value - 1]?.texto}</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {config.opciones.map((op, i) => {
          const val = i + 1
          const seleccionado = value === val
          return (
            <button key={val} type="button" onClick={() => onChange(val)}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 px-1 transition-all ${seleccionado ? 'bg-orange-500 ring-2 ring-orange-300 scale-105' : 'bg-gray-700 hover:bg-gray-600'}`}>
              <span className="text-xl leading-none">{op.emoji}</span>
              <span className={`text-xs font-bold leading-none ${seleccionado ? 'text-white' : 'text-gray-400'}`}>{val}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function WellnessPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  // Distingue "todavia no ha llegado" de "ha llegado vacio". Sin esto, una
  // fila que RLS deniega dejaba la pantalla en "Cargando..." para siempre.
  const [noExiste, setNoExiste] = useState(false)
  const [esDeportista, setEsDeportista] = useState(false)
  const [registros, setRegistros] = useState<any[]>([])
  // Sus sesiones, para cruzarlas con el wellness en la gráfica de abajo.
  const [sesiones, setSesiones] = useState<SesionCruce[]>([])
  // Con ?registrar=1 el formulario se abre solo. Lo usa el aviso del panel del
  // deportista: si el botón dice "Registrar", tiene que registrar, no dejarte en
  // la puerta buscando dónde se hace.
  //
  // SE LEE EN UN EFECTO, NO EN EL ESTADO INICIAL. Antes estaba como inicializador
  // de useState preguntando por `window`, y eso se evalúa TAMBIÉN en el render
  // del servidor, donde `window` no existe: de ahí salía siempre `false`, y lo
  // que llegara después dependía de cómo resolviera React la hidratación. Un
  // efecto corre solo en el cliente y con el componente ya montado, así que lee
  // la URL que el usuario abrió de verdad.
  const [mostrarForm, setMostrarForm] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('registrar') === '1') setMostrarForm(true)
  }, [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [varsActivas, setVarsActivas] = useState<string[]>(['fatiga', 'estres', 'animo', 'motivacion'])
  /* «Hoy» tiene que ser el del reloj del atleta, no el de UTC. Con
     `toISOString()` —que es lo que había— quien abría este formulario a las
     00:30 en España se lo encontraba rellenado con AYER, registraba ahí su
     wellness, y al entrenador le salía que no lo había registrado hoy. */
  const [fecha, setFecha] = useState(hoyISO())
  const [calidadSueno, setCalidadSueno] = useState(4)
  const [horasSueno, setHorasSueno] = useState(7)
  const [fatiga, setFatiga] = useState(4)
  const [estres, setEstres] = useState(4)
  const [dolorMuscular, setDolorMuscular] = useState(4)
  const [animo, setAnimo] = useState(4)
  const [motivacion, setMotivacion] = useState(4)
  const [hrv, setHrv] = useState('')
  const [fcReposo, setFcReposo] = useState('')
  const [malestarGeneral, setMalestarGeneral] = useState(4)
  const [registrosPeso, setRegistrosPeso] = useState<any[]>([])
  const [mostrarFormPeso, setMostrarFormPeso] = useState(false)
  const [pesoKg, setPesoKg] = useState('')
  const [fechaPeso, setFechaPeso] = useState(hoyISO())
  const [guardandoPeso, setGuardandoPeso] = useState(false)

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const user = await usuarioActual()
    // Cinco consultas independientes: el rol de quien mira, el deportista, sus
    // dos historiales y sus sesiones. Iban en serie.
    const [perfil, dep, reg, pesos, ses] = await Promise.all([
      user ? supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('deportista').select('*').eq('id', id).maybeSingle(),
      supabase.from('wellness').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(30),
      supabase.from('registro_peso').select('*').eq('id_deportista', id).order('fecha', { ascending: true }).limit(60),
      /* Sus entrenamientos, para que pueda ver por qué amaneció como amaneció.
         Antes esto solo lo veía el entrenador: el atleta tenía su wellness y sus
         sesiones en pantallas distintas y sin relación, así que rellenaba un
         cuestionario que no le devolvía nada.

         Se piden 40 días para los 30 de wellness: los 3 anteriores al primero
         son los que lo explican, y sobra margen porque la consulta es barata. */
      vivas(supabase.from('sesion')
        .select('id, fecha_sesion, disciplina, duracion_minutos, duracion_real, rpe_estimado, rpe_reportado, estado')
        .eq('id_deportista', id))
        .gte('fecha_sesion', sumarDias(hoyISO(), -40))
        .order('fecha_sesion'),
    ])
    setEsDeportista((perfil as any).data?.rol === 'deportista')
    setDeportista(dep.data)
    if (!dep.data) { setNoExiste(true); return }
    setRegistros(reg.data || [])
    setRegistrosPeso(pesos.data || [])
    setSesiones((ses.data || []) as SesionCruce[])
  }

  const preview = scoreWellness({ calidad_sueno: calidadSueno, fatiga, estres, dolor_muscular: dolorMuscular, animo, motivacion })

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const score = scoreWellness({ calidad_sueno: calidadSueno, fatiga, estres, dolor_muscular: dolorMuscular, animo, motivacion })
    const { error } = await supabase.from('wellness').insert({
      id_deportista: Number(id),
      fecha,
      calidad_sueno: calidadSueno,
      horas_sueno: horasSueno,
      fatiga,
      estres,
      dolor_muscular: dolorMuscular,
      animo,
      motivacion,
      hrv: hrv ? Number(hrv) : null,
      fc_reposo: fcReposo ? Number(fcReposo) : null,
      malestar_general: malestarGeneral,
      score_wellness: score
    })
    if (error) setError('Error: ' + error.message)
    else { setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  const guardarPeso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pesoKg) return
    setGuardandoPeso(true)
    await supabase.from('registro_peso').insert({
      id_deportista: Number(id),
      fecha: fechaPeso,
      peso_kg: Number(pesoKg),
    })
    setPesoKg('')
    setMostrarFormPeso(false)
    const { data: pesos } = await supabase.from('registro_peso').select('*').eq('id_deportista', id).order('fecha', { ascending: true }).limit(60)
    setRegistrosPeso(pesos || [])
    setGuardandoPeso(false)
  }

  if (!deportista) return <Cargando noExiste={noExiste} />

  const analisis = analizarWellness(registros)

  /* El análisis mide unos 700px. Con el formulario abierto va DEBAJO: se llega aquí
     desde el aviso del panel ("Registrar →"), y tenerlo delante significaba pulsar
     un botón que dice "Registrar" y aterrizar en una tabla de medias, con el
     cuestionario fuera de la pantalla. Cuando vienes a consultar, manda él. */
  const panelAnalisis = analisis.readiness && (
    <div className="bg-gray-900 rounded-xl border border-gray-800 mb-8 overflow-hidden">
      {/* Veredicto de disposición */}
      <div className="p-5 flex items-center gap-4 border-b border-gray-800" style={{ borderLeft: '5px solid ' + analisis.readiness.color }}>
        <div className="flex flex-col items-center justify-center rounded-xl px-4 py-3 flex-shrink-0" style={{ backgroundColor: analisis.readiness.color + '22' }}>
          <span className="text-2xl font-black leading-none" style={{ color: analisis.readiness.color }}>{analisis.readiness.label}</span>
          <span className="text-gray-500 mt-1" style={{ fontSize: 10 }}>disposición</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm mb-0.5">🔎 Análisis del deportista <span className="text-gray-600 font-normal">· {analisis.nRegistros} registros</span></p>
          <p className="text-gray-300 text-sm">{analisis.readiness.recomendacion}</p>
        </div>
      </div>

      {/* Conclusiones en lenguaje natural */}
      <div className="p-5 flex flex-col gap-2 border-b border-gray-800">
        {analisis.conclusiones.map((c, i) => {
          const ic = c.tipo === 'rojo' ? '🔴' : c.tipo === 'ambar' ? '🟠' : c.tipo === 'positivo' ? '🟢' : 'ℹ️'
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span style={{ fontSize: 11 }} className="mt-0.5 flex-shrink-0">{ic}</span>
              <span className="text-gray-300">{c.texto}</span>
            </div>
          )
        })}
      </div>

      {/* Métricas: reciente vs línea base */}
      {analisis.metricas.length > 0 && (
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-400 text-xs font-medium">Últimos 7 días vs tu línea base</p>
            {!analisis.baselineFiable && <span className="text-gray-600 text-xs">base provisional</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {analisis.metricas.map(m => (
              <div key={m.key} className={'rounded-lg p-2.5 border ' + (m.fuera ? 'border-orange-500/50 bg-orange-500/5' : 'border-gray-800 bg-gray-800/40')}>
                <p className="text-gray-400 text-xs mb-0.5">{m.label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={'font-bold ' + (m.fuera ? 'text-orange-300' : 'text-white')}>{m.reciente}<span className="text-gray-500 text-xs font-normal">{m.unidad}</span></span>
                  <span style={{ fontSize: 10, color: flechaColor(m) }}>{m.flecha === 'up' ? '▲' : m.flecha === 'down' ? '▼' : '▬'}</span>
                </div>
                {m.base != null && <p className="text-gray-600" style={{ fontSize: 11 }}>base {m.base}{m.unidad}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        {esDeportista ? (
          <button onClick={() => router.push('/dashboard-deportista')} className="text-gray-400 hover:text-white text-sm transition">🏠 Dashboard</button>
        ) : (
          <button onClick={() => router.push(`/deportistas/${id}`)} className="text-gray-400 hover:text-white text-sm transition">← Perfil deportista</button>
        )}
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-1">Wellness — {deportista.nombre}</h2>
          <p className="text-gray-400 text-sm">Registro diario de estado del atleta</p>
        </div>

        {/* Consultando: el análisis manda y va primero. */}
        {!mostrarForm && panelAnalisis}

        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{mostrarForm ? 'Registro de hoy' : 'Registros recientes'}</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nuevo registro'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {mostrarForm && (
          <form onSubmit={guardar} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required />
            </div>
            <EmojiSelector campo="calidad_sueno" value={calidadSueno} onChange={setCalidadSueno} />
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-white font-medium text-sm">Horas de sueno</label>
                <span className="text-orange-400 font-bold text-lg">{horasSueno}h</span>
              </div>
              <input type="range" min={3} max={12} step={0.5} value={horasSueno} onChange={e => setHorasSueno(Number(e.target.value))} className="w-full accent-orange-500" />
              <div className="flex justify-between text-gray-500 text-xs mt-1"><span>3h</span><span>12h</span></div>
            </div>
            <EmojiSelector campo="fatiga" value={fatiga} onChange={setFatiga} />
            <EmojiSelector campo="estres" value={estres} onChange={setEstres} />
            <EmojiSelector campo="dolor_muscular" value={dolorMuscular} onChange={setDolorMuscular} />
            <EmojiSelector campo="animo" value={animo} onChange={setAnimo} />
            <EmojiSelector campo="motivacion" value={motivacion} onChange={setMotivacion} />
            <EmojiSelector campo="malestar_general" value={malestarGeneral} onChange={setMalestarGeneral} />

            {/* Objetivos bloc */}
            <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-white font-medium text-sm mb-1">Datos objetivos del reloj</p>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">HRV matutina (ms) — opcional</label>
                <input type="number" placeholder="Ej: 52" value={hrv} onChange={e => setHrv(e.target.value)} className="bg-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full text-sm" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">FC en reposo (ppm) — opcional</label>
                <input type="number" placeholder="Ej: 48" value={fcReposo} onChange={e => setFcReposo(e.target.value)} className="bg-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full text-sm" />
                <p className="text-gray-600 text-xs mt-1">Una FC en reposo elevada de forma sostenida puede indicar sobreentrenamiento</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-sm mb-1">Bienestar estimado</p>
              <p className="text-3xl font-bold" style={{ color: colorBienestar(100 - preview) }}>{100 - preview}<span className="text-gray-500 text-base font-normal">/100</span></p>
              <p className="text-sm" style={{ color: colorBienestar(100 - preview) }}>{estadoBienestar(100 - preview)}</p>
            </div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar registro'}
            </button>
          </form>
        )}

        {/* Registrando: el análisis se queda detrás del cuestionario, no delante. */}
        {mostrarForm && panelAnalisis}

        {/* GRÁFICAS */}
        {registros.length > 1 && (
          <div className="flex flex-col gap-4 mb-6">
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm font-medium text-green-400 mb-3">Bienestar <span className="text-gray-500 font-normal text-xs">· más alto es mejor</span></p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={registros.slice().reverse().map(r => ({ fecha: r.fecha.slice(5), score: bienestar(r.score_wellness) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                  <ReferenceLine y={75} stroke="#4ade80" strokeDasharray="4 4" />
                  <ReferenceLine y={50} stroke="#facc15" strokeDasharray="4 4" />
                  <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 3 }} name="Bienestar" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* HRV + FC reposo juntas */}
            {registros.some(r => r.hrv || r.fc_reposo) && (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-sm font-medium text-blue-400 mb-3">Datos objetivos — HRV y FC en reposo</p>
                <div className="flex gap-4 mb-2 text-xs">
                  {registros.some(r => r.hrv) && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block"></span> HRV (ms)</span>}
                  {registros.some(r => r.fc_reposo) && <span className="flex items-center gap-1 text-rose-400"><span className="w-3 h-0.5 bg-rose-400 inline-block"></span> FC reposo (ppm)</span>}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={registros.slice().reverse().map(r => ({ fecha: r.fecha.slice(5), hrv: r.hrv || null, fc_reposo: r.fc_reposo || null }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                    {registros.some(r => r.hrv) && <Line type="monotone" dataKey="hrv" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: '#60a5fa', r: 3 }} name="HRV (ms)" connectNulls />}
                    {registros.some(r => r.fc_reposo) && <Line type="monotone" dataKey="fc_reposo" stroke="#fb7185" strokeWidth={2.5} dot={{ fill: '#fb7185', r: 3 }} name="FC reposo (ppm)" connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm font-medium text-gray-200 mb-3">Variables subjetivas</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { key: 'fatiga', label: 'Fatiga', color: '#f87171' },
                  { key: 'estres', label: 'Estrés', color: '#fb923c' },
                  { key: 'animo', label: 'Ánimo', color: '#4ade80' },
                  { key: 'motivacion', label: 'Motivación', color: '#a78bfa' },
                  { key: 'calidad_sueno', label: 'Sueño', color: '#34d399' },
                  { key: 'dolor_muscular', label: 'Dolor', color: '#fbbf24' },
                ].map(v => (
                  <button key={v.key}
                    onClick={() => setVarsActivas(prev => prev.includes(v.key) ? prev.filter(x => x !== v.key) : [...prev, v.key])}
                    className={'px-2 py-1 rounded-lg text-xs font-medium transition border ' +
                      (varsActivas.includes(v.key) ? 'text-gray-900 border-transparent' : 'bg-gray-800 text-gray-400 border-gray-700')}
                    style={varsActivas.includes(v.key) ? { background: v.color, borderColor: v.color } : {}}>
                    {v.label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={registros.slice().reverse().map(r => ({ fecha: r.fecha.slice(5), fatiga: r.fatiga, estres: r.estres, animo: r.animo, motivacion: r.motivacion, calidad_sueno: r.calidad_sueno, dolor_muscular: r.dolor_muscular }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <YAxis domain={[1, 7]} stroke="#9ca3af" tick={{ fontSize: 10 }} ticks={[1,2,3,4,5,6,7]} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                  {[
                    { key: 'fatiga', label: 'Fatiga', color: '#f87171' },
                    { key: 'estres', label: 'Estrés', color: '#fb923c' },
                    { key: 'animo', label: 'Ánimo', color: '#4ade80' },
                    { key: 'motivacion', label: 'Motivación', color: '#a78bfa' },
                    { key: 'calidad_sueno', label: 'Sueño', color: '#34d399' },
                    { key: 'dolor_muscular', label: 'Dolor', color: '#fbbf24' },
                  ].filter(v => varsActivas.includes(v.key)).map(v => (
                    <Line key={v.key} type="monotone" dataKey={v.key} stroke={v.color} strokeWidth={2} dot={{ fill: v.color, r: 3 }} name={v.label} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              {/* Lo mismo que ve su entrenador, y por el mismo motivo: entender
                  por qué amaneció así. Hasta ahora el atleta tenía su wellness y
                  sus sesiones en pantallas distintas y sin relación, o sea que
                  rellenaba un cuestionario que no le devolvía nada — y eso es lo
                  que hace que se deje de rellenar.

                  `reverse()` porque los registros llegan del más nuevo al más
                  viejo y la gráfica los pinta al revés: la banda tiene que ir en
                  el orden de la gráfica o las columnas no caen bajo su día. */}
              <CruceWellness registros={registros.slice().reverse()} sesiones={sesiones} tu margenEje={34} />
            </div>
          </div>
        )}

        {registros.length === 0 ? (
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">💚</div><p>No hay registros de wellness todavia.</p></div>
        ) : (
          <div className="grid gap-3">
            {registros.map(r => (
              <div key={r.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{r.fecha}</p>
                    <p className="text-gray-400 text-sm">Sueno: {r.horas_sueno}h · Fatiga: {r.fatiga}/7 · Estres: {r.estres}/7</p>
                    <div className="flex gap-3 mt-1">
                      {r.hrv && <p className="text-blue-400 text-sm">HRV: {r.hrv} ms</p>}
                      {r.fc_reposo && <p className="text-rose-400 text-sm">FC reposo: {r.fc_reposo} ppm</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: colorBienestar(bienestar(r.score_wellness) ?? 0) }}>{bienestar(r.score_wellness)}</p>
                    <p className="text-xs" style={{ color: colorBienestar(bienestar(r.score_wellness) ?? 0) }}>{estadoBienestar(bienestar(r.score_wellness) ?? 0)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* SECCIÓN PESO */}
        <div className="mt-8 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
            <div>
              <p className="font-bold text-white">⚖️ Control de peso</p>
              <p className="text-gray-500 text-xs mt-0.5">Registro opcional — añade cuando quieras</p>
            </div>
            <button onClick={() => setMostrarFormPeso(!mostrarFormPeso)}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg transition">
              {mostrarFormPeso ? 'Cancelar' : '+ Registrar peso'}
            </button>
          </div>

          {mostrarFormPeso && (
            <form onSubmit={guardarPeso} className="px-5 py-4 border-b border-gray-800 flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Fecha</label>
                <input type="date" value={fechaPeso} onChange={e => setFechaPeso(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Peso (kg)</label>
                <input type="number" step="0.1" placeholder="Ej: 72.5" value={pesoKg} onChange={e => setPesoKg(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  required />
              </div>
              <button type="submit" disabled={guardandoPeso}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                {guardandoPeso ? '...' : 'Guardar'}
              </button>
            </form>
          )}

          {registrosPeso.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">
              No hay registros de peso todavía.
            </div>
          ) : (
            <div className="p-5">
              {/* Último peso y variación */}
              <div className="flex items-center gap-6 mb-4">
                <div>
                  <p className="text-gray-500 text-xs">Último registro</p>
                  <p className="text-2xl font-bold text-white">{registrosPeso[registrosPeso.length-1]?.peso_kg} kg</p>
                  <p className="text-gray-500 text-xs">{registrosPeso[registrosPeso.length-1]?.fecha}</p>
                </div>
                {registrosPeso.length > 1 && (() => {
                  const diff = Math.round((registrosPeso[registrosPeso.length-1].peso_kg - registrosPeso[0].peso_kg) * 10) / 10
                  return (
                    <div>
                      <p className="text-gray-500 text-xs">Variación total</p>
                      <p className={'text-xl font-bold ' + (diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-gray-400')}>
                        {diff > 0 ? '+' : ''}{diff} kg
                      </p>
                      <p className="text-gray-500 text-xs">desde {registrosPeso[0]?.fecha}</p>
                    </div>
                  )
                })()}
              </div>

              {/* Gráfica evolución peso */}
              {registrosPeso.length > 1 && (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={registrosPeso.map(p => ({ fecha: p.fecha.slice(5), peso: p.peso_kg }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" kg" />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }}
                      formatter={(v: any) => [v + ' kg', 'Peso']} />
                    <Line type="monotone" dataKey="peso" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 4 }} name="Peso (kg)" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {/* Lista últimos registros */}
              <div className="mt-4 flex flex-col gap-1 max-h-32 overflow-y-auto">
                {[...registrosPeso].reverse().slice(0, 10).map(p => (
                  <div key={p.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-800">
                    <span className="text-gray-400">{p.fecha}</span>
                    <span className="font-medium text-white">{p.peso_kg} kg</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
