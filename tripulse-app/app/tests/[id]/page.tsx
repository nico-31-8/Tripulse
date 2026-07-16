'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import ProtocoloTest from '@/components/ProtocoloTest'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { tablaIntensidades } from '@/lib/zonas'
import { calcularObjetivos, idsConPacing } from '@/lib/pacing'
import { pruebaPorId } from '@/lib/pruebas'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const GRUPOS_MUSCULARES = ['Pectoral','Espalda','Hombro','Biceps','Triceps','Cuadriceps','Isquiotibiales','Gluteos','Gemelos','Core','Otros']

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

function GraficaEvolucion({ datos, dataKey, color, unidad, label }: { datos: any[], dataKey: string, color: string, unidad: string, label: string }) {
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
  const mejora = ultimo && primero ? Math.round((ultimo - primero) * 100) / 100 : null
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-gray-300">📈 Evolución {label}</p>
        {mejora !== null && (
          <span className={'text-xs font-bold px-2 py-1 rounded-lg ' + (mejora > 0 ? 'bg-green-900/50 text-green-400' : mejora < 0 ? 'bg-red-900/50 text-red-400' : 'bg-gray-800 text-gray-400')}>
            {mejora > 0 ? '▲' : mejora < 0 ? '▼' : '='} {Math.abs(mejora)} {unidad}
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
  if (!datos.length) return null
  // Agrupar por ejercicio
  const ejercicios = [...new Set(datos.map(t => t.ejercicio))]
  const [ejercicioSel, setEjercicioSel] = useState(ejercicios[0] || '')
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
  const [tests1, setTests1] = useState<any[]>([])
  const [tests2, setTests2] = useState<any[]>([])
  const [tests3, setTests3] = useState<any[]>([])
  const [testsFuerza, setTestsFuerza] = useState<any[]>([])
  const [testsLibres, setTestsLibres] = useState<any[]>([])
  const [tab, setTab] = useState('carrera')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarFormLibre, setMostrarFormLibre] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fecha, setFecha] = useState('')
  const [velUltimo, setVelUltimo] = useState('')
  const [durTotal, setDurTotal] = useState('')
  const [tiempoAguantado, setTiempoAguantado] = useState('')
  const [incrementoVel, setIncrementoVel] = useState('')
  const [distGrande, setDistGrande] = useState('400')
  const [distPequena, setDistPequena] = useState('200')
  const [tiempoGrande, setTiempoGrande] = useState('')
  const [tiempoPequeno, setTiempoPequeno] = useState('')
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
    const { data: t1 } = await supabase.from('test1_carrera').select('*').eq('id_deportista', id).order('fecha', { ascending: false })
    setTests1(t1 || [])
    const { data: t2 } = await supabase.from('test2_natacion').select('*').eq('id_deportista', id).order('fecha', { ascending: false })
    setTests2(t2 || [])
    const { data: t3 } = await supabase.from('test3_ciclismo').select('*').eq('id_deportista', id).order('fecha', { ascending: false })
    setTests3(t3 || [])
    const { data: tf } = await supabase.from('test_fuerza').select('*').eq('id_deportista', id).order('fecha', { ascending: false })
    setTestsFuerza(tf || [])
    const { data: tl } = await supabase.from('tests_libres').select('*').eq('id_deportista', id).order('fecha', { ascending: false })
    setTestsLibres(tl || [])
  }

  const calcularVAM = () => {
    if (!velUltimo || !durTotal || !tiempoAguantado || !incrementoVel) return null
    return Math.round((Number(velUltimo) - (Number(incrementoVel) * (1 - Number(tiempoAguantado) / Number(durTotal)))) * 10) / 10
  }

  const calcularCSS = () => {
    if (!tiempoGrande || !tiempoPequeno) return null
    return Math.round(((Number(distGrande) - Number(distPequena)) / (Number(tiempoGrande) - Number(tiempoPequeno))) * 1000) / 1000
  }

  const calcularFTP = () => {
    if (!potenciaPico || !durEscalones || !tiempoNoCompletado || !incrementoPot) return null
    return Math.round((Number(potenciaPico) - Number(incrementoPot)) + (Number(incrementoPot) * Number(tiempoNoCompletado) / Number(durEscalones)))
  }

  const calcularRM = () => {
    if (!pesoKg || !reps) return null
    if (Number(reps) === 1) return Number(pesoKg)
    return Math.round(Number(pesoKg) * (1 + Number(reps) / 30))
  }

  const formatCSS = (css: number) => { const s = 100/css; return `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,'0')} /100m` }
  const formatVAM = (vam: number) => { const s = 3600/vam; return `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,'0')} /km` }

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
    const { error } = await supabase.from('test1_carrera').insert({ id_deportista: Number(id), fecha, velocidad_ultimo_escalon: Number(velUltimo), duracion_total_escalon: Number(durTotal), tiempo_aguantado_ultimo: Number(tiempoAguantado), incremento_velocidad: Number(incrementoVel), vam: calcularVAM() })
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
    const { error } = await supabase.from('test3_ciclismo').insert({ id_deportista: Number(id), fecha, potencia_pico: Number(potenciaPico), tiempo_escalon_completado: Number(tiempoCompletado), tiempo_escalon_no_completado: Number(tiempoNoCompletado), duracion_escalones: Number(durEscalones), incremento_potencia: Number(incrementoPot), ftp: calcularFTP() })
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
    if (tab === 'carrera') ({ error: err } = await supabase.from('test1_carrera').insert({ id_deportista: Number(id), fecha, velocidad_ultimo_escalon: Number(velUltimo), duracion_total_escalon: Number(durTotal), tiempo_aguantado_ultimo: Number(tiempoAguantado), incremento_velocidad: Number(incrementoVel), vam: calcularVAM(), mss: calcularMSS() }))
    else if (tab === 'ciclismo') ({ error: err } = await supabase.from('test3_ciclismo').insert({ id_deportista: Number(id), fecha, potencia_pico: Number(potenciaPico), tiempo_escalon_completado: Number(tiempoCompletado), tiempo_escalon_no_completado: Number(tiempoNoCompletado), duracion_escalones: Number(durEscalones), incremento_potencia: Number(incrementoPot), ftp: calcularFTP(), mpp: Number(mppSprint) }))
    else if (tab === 'natacion') ({ error: err } = await supabase.from('test2_natacion').insert({ id_deportista: Number(id), fecha, distancia_grande: Number(distGrande), distancia_pequena: Number(distPequena), tiempo_distancia_grande: Number(tiempoGrande), tiempo_distancia_pequena: Number(tiempoPequeno), css: calcularCSS(), v25: calcularVsprint(t25, 25), v50: calcularVsprint(t50, 50) }))
    if (err) setError('Error: ' + err.message)
    else { setMostrarProtocolo(false); resetSprint(); setFecha(''); cargarDatos() }
    setLoading(false)
  }

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  const rmPreview = calcularRM()

  // Intensidades por zona a partir de los tests más recientes
  const intVals = { vam: tests1[0]?.vam ?? null, css: tests2[0]?.css ?? null, ftp: tests3[0]?.ftp ?? null }
  const hayIntensidades = !!(intVals.vam || intVals.css || intVals.ftp)
  const filasInt = hayIntensidades ? tablaIntensidades(intVals, deportista.fc_maxima) : []
  const objetivos = calcularObjetivos(objPrueba, intVals, Number(velBici) || 32)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push(`/deportistas/${id}`)} className="text-gray-400 hover:text-white text-sm transition">← Perfil deportista</button>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8 flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold mb-1">Tests — {deportista.nombre}</h2>
            <p className="text-gray-400 text-sm">Resultados de tests de rendimiento</p>
          </div>
          {hayIntensidades && (
            <button onClick={() => setMostrarIntensidades(true)}
              className="bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/40 text-orange-300 px-4 py-2 rounded-xl text-sm font-semibold transition flex-shrink-0">
              🎯 Ver intensidades
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {['carrera','natacion','ciclismo','fuerza'].map(t => (
            <button key={t} onClick={() => { setTab(t); setMostrarForm(false) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {t === 'carrera' ? '🏃 Carrera' : t === 'natacion' ? '🏊 Natacion' : t === 'ciclismo' ? '🚴 Ciclismo' : '🏋️ Fuerza'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xl font-bold">{tab === 'carrera' ? 'Carrera' : tab === 'natacion' ? 'Natación' : tab === 'ciclismo' ? 'Ciclismo' : 'Fuerza'}</h3>
            {tab !== 'fuerza' && (
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
                <button onClick={() => { setTestTipo('aerobico'); setMostrarForm(false) }} className={'text-xs px-3 py-1.5 rounded-md transition ' + (testTipo === 'aerobico' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>🫀 Aeróbico</button>
                <button onClick={() => { setTestTipo('sprint'); setMostrarForm(false) }} className={'text-xs px-3 py-1.5 rounded-md transition ' + (testTipo === 'sprint' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>⚡ Sprint</button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {tab !== 'fuerza' && (
              <button onClick={() => setMostrarProtocolo(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition">🔬 Protocolo</button>
            )}
            <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
              {mostrarForm ? 'Cancelar' : '+ Nuevo test'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        <ProtocoloTest tipo={tab} />

        {/* GRÁFICAS DE EVOLUCIÓN */}
        {tab === 'carrera' && <GraficaEvolucion datos={tests1} dataKey="vam" color="#4ade80" unidad="km/h" label="VAM" />}
        {tab === 'natacion' && <GraficaEvolucion datos={tests2} dataKey="css" color="#60a5fa" unidad="m/s" label="CSS" />}
        {tab === 'ciclismo' && <GraficaEvolucion datos={tests3} dataKey="ftp" color="#facc15" unidad="W" label="FTP" />}
        {tab === 'fuerza' && <GraficaFuerza datos={testsFuerza} />}

        {/* FORMULARIOS */}
        {mostrarForm && testTipo === 'aerobico' && tab === 'carrera' && (
          <form onSubmit={guardarTest1} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test incremental de carrera</h4>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <input type="number" step="0.1" placeholder="Velocidad ultimo escalon (km/h)" value={velUltimo} onChange={e => setVelUltimo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="number" placeholder="Duracion total del escalon (segundos)" value={durTotal} onChange={e => setDurTotal(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="number" placeholder="Tiempo aguantado en ultimo escalon (segundos)" value={tiempoAguantado} onChange={e => setTiempoAguantado(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="number" step="0.1" placeholder="Incremento de velocidad por escalon (km/h)" value={incrementoVel} onChange={e => setIncrementoVel(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            {calcularVAM() && <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm"><span className="text-gray-400">VAM calculada: </span><span className="text-orange-400 font-bold">{calcularVAM()} km/h</span><span className="text-gray-400 ml-3">({formatVAM(calcularVAM()!)})</span></div>}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
          </form>
        )}

        {mostrarForm && testTipo === 'aerobico' && tab === 'natacion' && (
          <form onSubmit={guardarTest2} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test CSS natacion</h4>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <div className="grid grid-cols-2 gap-4">
              <input type="number" placeholder="Distancia grande (m)" value={distGrande} onChange={e => setDistGrande(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              <input type="number" placeholder="Distancia pequena (m)" value={distPequena} onChange={e => setDistPequena(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input type="number" placeholder="Tiempo distancia grande (seg)" value={tiempoGrande} onChange={e => setTiempoGrande(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              <input type="number" placeholder="Tiempo distancia pequena (seg)" value={tiempoPequeno} onChange={e => setTiempoPequeno(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            {calcularCSS() && <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm"><span className="text-gray-400">CSS calculada: </span><span className="text-orange-400 font-bold">{calcularCSS()} m/s</span><span className="text-gray-400 ml-3">({formatCSS(calcularCSS()!)})</span></div>}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
          </form>
        )}

        {mostrarForm && testTipo === 'aerobico' && tab === 'ciclismo' && (
          <form onSubmit={guardarTest3} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test FTP ciclismo</h4>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <input type="number" placeholder="Potencia pico (vatios)" value={potenciaPico} onChange={e => setPotenciaPico(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="number" placeholder="Duracion de los escalones (segundos)" value={durEscalones} onChange={e => setDurEscalones(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="number" placeholder="Tiempo aguantado escalon completado (seg)" value={tiempoCompletado} onChange={e => setTiempoCompletado(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="number" placeholder="Tiempo aguantado escalon no completado (seg)" value={tiempoNoCompletado} onChange={e => setTiempoNoCompletado(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="number" placeholder="Incremento de potencia por escalon (vatios)" value={incrementoPot} onChange={e => setIncrementoPot(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            {calcularFTP() && <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm"><span className="text-gray-400">FTP calculado: </span><span className="text-orange-400 font-bold">{calcularFTP()} W</span></div>}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
          </form>
        )}

        {/* FORMULARIOS SPRINT */}
        {mostrarForm && testTipo === 'sprint' && tab === 'carrera' && (
          <form onSubmit={guardarSprint} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test de sprint — Velocidad máxima (MSS)</h4>
            <p className="text-gray-400 text-sm">Sprint lanzado de 30–40m a máxima velocidad (con 10–20m previos de lanzamiento). Introduce la distancia cronometrada y el tiempo.</p>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <div className="grid grid-cols-2 gap-4">
              <input type="number" step="0.5" placeholder="Distancia (m)" value={sprintDist} onChange={e => setSprintDist(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              <input type="number" step="0.01" placeholder="Tiempo (s)" value={sprintTiempo} onChange={e => setSprintTiempo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            {calcularMSS() && <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm"><span className="text-gray-400">MSS: </span><span className="text-orange-400 font-bold">{calcularMSS()} km/h</span>{asrPreview !== null && <span className="text-blue-400 ml-3">· ASR = MSS − VAM: {asrPreview} km/h</span>}</div>}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
          </form>
        )}

        {mostrarForm && testTipo === 'sprint' && tab === 'ciclismo' && (
          <form onSubmit={guardarSprint} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test de sprint — Potencia pico (MPP)</h4>
            <p className="text-gray-400 text-sm">Sprint máximo de 6 segundos (tras calentamiento). Introduce la potencia pico registrada por el potenciómetro.</p>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <input type="number" placeholder="Potencia pico MPP (vatios)" value={mppSprint} onChange={e => setMppSprint(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            {mppSprint && <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm"><span className="text-gray-400">MPP: </span><span className="text-orange-400 font-bold">{mppSprint} W</span>{aprPreview !== null && <span className="text-blue-400 ml-3">· APR = MPP − FTP: {aprPreview} W</span>}</div>}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
          </form>
        )}

        {mostrarForm && testTipo === 'sprint' && tab === 'natacion' && (
          <form onSubmit={guardarSprint} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test de sprint — Velocidades máximas (V25/V50)</h4>
            <p className="text-gray-400 text-sm">Sprints máximos de 25m y 50m (con recuperación completa entre ellos). Introduce los tiempos.</p>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <div className="grid grid-cols-2 gap-4">
              <input type="number" step="0.01" placeholder="Tiempo 25m (s)" value={t25} onChange={e => setT25(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              <input type="number" step="0.01" placeholder="Tiempo 50m (s)" value={t50} onChange={e => setT50(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            {(calcularVsprint(t25, 25) || calcularVsprint(t50, 50)) && <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm"><span className="text-gray-400">V25: </span><span className="text-orange-400 font-bold">{calcularVsprint(t25, 25) || '—'} m/s</span><span className="text-gray-400 ml-3">V50: </span><span className="text-orange-400 font-bold">{calcularVsprint(t50, 50) || '—'} m/s</span></div>}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
          </form>
        )}

        {mostrarForm && tab === 'fuerza' && (
          <form onSubmit={guardarTestFuerza} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Test 1RM — Fuerza maxima</h4>
            <p className="text-gray-400 text-sm">Introduce el peso y las repeticiones realizadas. Si haces 1 repeticion al fallo es el 1RM directo. Si haces mas repeticiones se estima con la formula de Epley.</p>
            <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
            <input type="text" placeholder="Nombre del ejercicio (ej: Sentadilla, Press banca, Peso muerto)" value={ejercicio} onChange={e => setEjercicio(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <select value={grupoMuscular} onChange={e => setGrupoMuscular(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Grupo muscular principal</option>
              {GRUPOS_MUSCULARES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-4">
              <input type="number" step="0.5" placeholder="Peso (kg)" value={pesoKg} onChange={e => setPesoKg(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              <input type="number" placeholder="Repeticiones realizadas" value={reps} onChange={e => setReps(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            {rmPreview && <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm"><span className="text-gray-400">1RM estimado (Epley): </span><span className="text-orange-400 font-bold">{rmPreview} kg</span></div>}
            <textarea placeholder="Notas (opcional)" value={notasFuerza} onChange={e => setNotasFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
          </form>
        )}

        {/* LISTAS DE TESTS */}
        {tab === 'carrera' && (tests1.length === 0 ?
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏃</div><p>No hay tests de carrera todavia.</p></div> :
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
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏊</div><p>No hay tests de natacion todavia.</p></div> :
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
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🚴</div><p>No hay tests de ciclismo todavia.</p></div> :
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
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏋️</div><p>No hay tests de fuerza todavia.</p></div> :
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

        {/* OTROS TESTS */}
        <div className="mt-12 border-t border-gray-800 pt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Otros tests</h3>
            <button onClick={() => setMostrarFormLibre(!mostrarFormLibre)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition">{mostrarFormLibre ? 'Cancelar' : '+ Añadir test'}</button>
          </div>
          {mostrarFormLibre && (
            <form onSubmit={guardarTestLibre} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
              <h4 className="font-bold">Nuevo test libre</h4>
              <input type="text" placeholder="Nombre del test (ej: Test 5km, Cooper, Ruffier)" value={nombreLibre} onChange={e => setNombreLibre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              <div><label className="text-gray-400 text-sm mb-1 block">Fecha</label><input type="date" value={fechaLibre} onChange={e => setFechaLibre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Resultado (ej: 21:30, 120)" value={resultadoLibre} onChange={e => setResultadoLibre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <input type="text" placeholder="Unidad (ej: min:seg, kg, m)" value={unidadLibre} onChange={e => setUnidadLibre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <textarea placeholder="Notas (opcional)" value={notasLibre} onChange={e => setNotasLibre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
              <button type="submit" disabled={loading} className="bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar test'}</button>
            </form>
          )}
          {testsLibres.length === 0 ?
            <div className="text-center py-8 text-gray-500"><p>No hay otros tests registrados todavia.</p></div> :
            <div className="grid gap-3">{testsLibres.map(t => (
              <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold">{t.nombre}</h4>
                    <p className="text-gray-400 text-sm">{t.fecha}</p>
                    {t.notas && <p className="text-gray-400 text-sm mt-1">{t.notas}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-orange-400 font-bold text-lg">{t.resultado}</p>
                    <p className="text-gray-400 text-sm">{t.unidad}</p>
                  </div>
                </div>
              </div>
            ))}</div>
          }
        </div>
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
                    {calcularFTP() && <span className="text-gray-400">FTP: <b className="text-orange-400">{calcularFTP()} W</b></span>}
                    {mppSprint && <span className="text-gray-400">MPP: <b className="text-orange-400">{mppSprint} W</b></span>}
                    {calcularFTP() && mppSprint && <span className="text-blue-400 font-medium">APR: {Number(mppSprint) - calcularFTP()!} W</span>}
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
