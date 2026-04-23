'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

const GRUPOS_MUSCULARES = ['Pectoral','Espalda','Hombro','Biceps','Triceps','Cuadriceps','Isquiotibiales','Gluteos','Gemelos','Core','Otros']

export default function PaginaTests({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
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

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  const rmPreview = calcularRM()

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = `/deportistas/${id}`} className="text-gray-400 hover:text-white text-sm transition">← Perfil deportista</button>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-1">Tests — {deportista.nombre}</h2>
          <p className="text-gray-400 text-sm">Resultados de tests de rendimiento</p>
        </div>
        <div className="flex gap-2 mb-6 flex-wrap">
          {['carrera','natacion','ciclismo','fuerza'].map(t => (
            <button key={t} onClick={() => { setTab(t); setMostrarForm(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {t === 'carrera' ? '🏃 Carrera' : t === 'natacion' ? '🏊 Natacion' : t === 'ciclismo' ? '🚴 Ciclismo' : '🏋️ Fuerza'}
            </button>
          ))}
        </div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">{tab === 'carrera' ? 'Test incremental carrera' : tab === 'natacion' ? 'Test CSS natacion' : tab === 'ciclismo' ? 'Test FTP ciclismo' : 'Test 1RM fuerza'}</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">{mostrarForm ? 'Cancelar' : '+ Nuevo test'}</button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {mostrarForm && tab === 'carrera' && (
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

        {mostrarForm && tab === 'natacion' && (
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

        {mostrarForm && tab === 'ciclismo' && (
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

        {tab === 'carrera' && (tests1.length === 0 ? <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏃</div><p>No hay tests de carrera todavia.</p></div> : <div className="grid gap-4">{tests1.map(t => <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800"><p className="text-gray-400 text-sm">{t.fecha}</p><p className="font-bold text-lg text-orange-400">{t.vam} km/h VAM</p><p className="text-gray-300 text-sm">{formatVAM(t.vam)}</p></div>)}</div>)}
        {tab === 'natacion' && (tests2.length === 0 ? <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏊</div><p>No hay tests de natacion todavia.</p></div> : <div className="grid gap-4">{tests2.map(t => <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800"><p className="text-gray-400 text-sm">{t.fecha}</p><p className="font-bold text-lg text-orange-400">{t.css} m/s CSS</p><p className="text-gray-300 text-sm">{formatCSS(t.css)}</p></div>)}</div>)}
        {tab === 'ciclismo' && (tests3.length === 0 ? <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🚴</div><p>No hay tests de ciclismo todavia.</p></div> : <div className="grid gap-4">{tests3.map(t => <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800"><p className="text-gray-400 text-sm">{t.fecha}</p><p className="font-bold text-lg text-orange-400">{t.ftp} W FTP</p></div>)}</div>)}
        {tab === 'fuerza' && (testsFuerza.length === 0 ? <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏋️</div><p>No hay tests de fuerza todavia.</p></div> : <div className="grid gap-4">{testsFuerza.map(t => <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800"><div className="flex justify-between items-center"><div><p className="font-bold text-lg">{t.ejercicio}</p><p className="text-gray-400 text-sm">{t.grupo_muscular} · {t.fecha}</p><p className="text-gray-300 text-sm">{t.peso_kg} kg × {t.repeticiones} reps</p>{t.notas && <p className="text-gray-400 text-sm mt-1">{t.notas}</p>}</div><div className="text-right"><p className="text-orange-400 font-bold text-2xl">{t.rm_estimado} kg</p><p className="text-gray-400 text-sm">1RM estimado</p></div></div></div>)}</div>)}

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
          {testsLibres.length === 0 ? <div className="text-center py-8 text-gray-500"><p>No hay otros tests registrados todavia.</p></div> : <div className="grid gap-3">{testsLibres.map(t => <div key={t.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800"><div className="flex justify-between items-center"><div><h4 className="font-bold">{t.nombre}</h4><p className="text-gray-400 text-sm">{t.fecha}</p>{t.notas && <p className="text-gray-400 text-sm mt-1">{t.notas}</p>}</div><div className="text-right"><p className="text-orange-400 font-bold text-lg">{t.resultado}</p><p className="text-gray-400 text-sm">{t.unidad}</p></div></div></div>)}</div>}
        </div>
      </div>
    </main>
  )
}
