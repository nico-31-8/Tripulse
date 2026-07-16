'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { DISCIPLINAS_SICAT, calcularSICAT } from '@/lib/sicat'
import { calcularSicatZonas, type SicatZonasResultado, type CeldaZona } from '@/lib/sicat-zonas'
import { cargaZona } from '@/lib/zonas'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'

const DISCIPLINAS = DISCIPLINAS_SICAT

const iconoDisc = (d: string) => d === 'Natacion' ? '🏊 Nat' : d === 'Ciclismo' ? '🚴 Cic' : '🏃 Car'
const nombreDisc = (d: string) => d === 'Natacion' ? 'natación' : d === 'Ciclismo' ? 'ciclismo' : 'carrera'
function colMult(m: number) { return m < 0.8 ? '#22c55e' : m < 1.2 ? '#eab308' : m < 1.8 ? '#f97316' : '#ef4444' }

// Conclusiones automáticas de la matriz de coste por zona (solo celdas fiables, n≥3).
function conclusionesZonas(celdas: CeldaZona[]): { ic: string; texto: string }[] {
  const fiables = celdas.filter(c => c.n >= 3)
  if (!fiables.length) return [{ ic: 'ℹ️', texto: 'Faltan sesiones para conclusiones firmes (mín. 3 por zona y disciplina). Las celdas actuales son orientativas.' }]
  const out: { ic: string; texto: string }[] = []
  const caro = [...fiables].sort((a, b) => b.multiplicador - a.multiplicador)[0]
  if (caro.multiplicador >= 1.3) out.push({ ic: '🔴', texto: `Tu entreno más caro: ${caro.zona} en ${nombreDisc(caro.disciplina)} (${caro.multiplicador.toFixed(1)}×, n=${caro.n}) → programa 48h de recuperación y no lo encadenes con otra sesión dura.` })
  const porZona: Record<string, CeldaZona[]> = {}
  fiables.forEach(c => { (porZona[c.zona] ||= []).push(c) })
  for (const z of Object.keys(porZona)) {
    const arr = porZona[z].sort((a, b) => b.multiplicador - a.multiplicador)
    if (arr.length >= 2 && arr[0].multiplicador - arr[arr.length - 1].multiplicador >= 0.6) {
      out.push({ ic: '🟡', texto: `La misma ${z} te cuesta ${arr[0].multiplicador.toFixed(1)}× en ${nombreDisc(arr[0].disciplina)} pero ${arr[arr.length - 1].multiplicador.toFixed(1)}× en ${nombreDisc(arr[arr.length - 1].disciplina)}: mete calidad por el lado barato cuando quieras dosificar el desgaste.` })
      break
    }
  }
  const baratas = fiables.filter(c => c.multiplicador < 0.8)
  if (baratas.length) out.push({ ic: '🟢', texto: `Zonas de bajo coste (${[...new Set(baratas.map(c => c.zona))].join(', ')}): ideales para recuperación activa y volumen.` })
  return out.slice(0, 3)
}

const TABLA_ECO_ORIGINAL = [
  { factor: 'Dificultad técnica', natacion: 3, ciclismo: 1, carrera: 2 },
  { factor: 'Dolor muscular',     natacion: 1, ciclismo: 1, carrera: 4 },
  { factor: 'Densidad',          natacion: 1, ciclismo: 2, carrera: 3 },
  { factor: 'Coste energético',  natacion: 3, ciclismo: 2, carrera: 3 },
]

function colorPorcentaje(p: number) {
  if (p <= 40) return 'text-green-400'
  if (p <= 70) return 'text-yellow-400'
  if (p <= 90) return 'text-orange-400'
  return 'text-red-400'
}

function bgPorcentaje(p: number) {
  if (p <= 40) return 'bg-green-500'
  if (p <= 70) return 'bg-yellow-500'
  if (p <= 90) return 'bg-orange-500'
  return 'bg-red-500'
}

function ModalExplicacion({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-2xl my-8 shadow-2xl">
        <div className="sticky top-0 bg-gray-900 rounded-t-2xl border-b border-gray-700 px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 className="text-xl font-bold text-white">¿Cómo funciona el SICAT?</h2>
            <p className="text-gray-400 text-xs mt-0.5">Coste Energético individualizado por disciplina</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-6 space-y-8">

          <section>
            <h3 className="text-orange-400 font-bold text-base mb-2">¿Qué es el SICAT?</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              El SICAT (Sistema de Individualización de la Carga en Triatlón) reemplaza los valores poblacionales genéricos de coste energético por datos reales
              del propio deportista. En lugar de asumir que la carrera siempre es más exigente que el ciclismo,
              el sistema construye el perfil real de cada atleta a partir de sus sesiones acumuladas.
            </p>
            <div className="mt-3 bg-gray-800 rounded-lg p-3 border-l-2 border-orange-500">
              <p className="text-gray-400 text-xs">⚠️ Mínimo recomendado: <span className="text-white font-semibold">5–6 sesiones por disciplina</span> antes de que los scores sean representativos.</p>
            </div>
          </section>

          <section>
            <h3 className="text-orange-400 font-bold text-base mb-3">Los 4 Factores (cada uno puntúa de 1 a 4)</h3>
            <div className="space-y-3">
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">F1</span>
                  <span className="font-semibold text-white">Dificultad técnica</span>
                  <span className="text-gray-500 text-xs ml-auto">Escala invertida</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">Promedia la sensación técnica media del atleta en sus sesiones (1–5) con la valoración técnica que el entrenador da en el perfil del deportista para esa disciplina (1–5). No es por sesión — el entrenador no puede estar presente en cada una, así que es una valoración general. A peor técnica, mayor coste.</p>
                <div className="bg-gray-900 rounded-lg p-2 font-mono text-xs text-green-400">
                  <p>media = (sensación_atleta + valoración_entrenador_perfil) / 2</p>
                  <p>F1 = redondear(5 − media)  →  rango 1–4</p>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">F2</span>
                  <span className="font-semibold text-white">Dolor muscular tardío</span>
                  <span className="text-gray-500 text-xs ml-auto">Ponderado en el tiempo</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">Tiene en cuenta el dolor post-sesión con pesos distintos según cuándo aparece, ya que el DOMS máximo ocurre a las 24–48h.</p>
                <div className="bg-gray-900 rounded-lg p-2 font-mono text-xs text-green-400">
                  <p>dolor_ponderado = (d0 × 0,2) + (d24h × 0,4) + (d48h × 0,4)</p>
                  <p>F2 = redondear(media_ponderada × 0,8)  →  rango 1–4</p>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">F3</span>
                  <span className="font-semibold text-white">Densidad soportada</span>
                  <span className="text-gray-500 text-xs ml-auto">Tolerancia a la carga alta</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">Mide cuántas sesiones duras (RPE mayor que 7) generan degradación técnica (sensación menor que 3). Si el atleta se rompe técnicamente al apretar, el coste es mayor.</p>
                <div className="bg-gray-900 rounded-lg p-2 font-mono text-xs text-green-400">
                  <p>degradación = sesiones(RPE&gt;7 Y sensación&lt;3) / sesiones(RPE&gt;7)</p>
                  <p>F3 = 1 + redondear(degradación × 3)  →  rango 1–4</p>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">F4</span>
                  <span className="font-semibold text-white">Coste energético</span>
                  <span className="text-gray-500 text-xs ml-auto">FC relativa + RPE</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">Combina la frecuencia cardíaca relativa al umbral con el RPE medio de las sesiones. Captura tanto el coste fisiológico objetivo como el percibido.</p>
                <div className="bg-gray-900 rounded-lg p-2 font-mono text-xs text-green-400">
                  <p>FC_relativa = FC_media / FC_umbral</p>
                  <p>F4 = redondear((FC_relativa × 2) + (RPE_medio / 10 × 2))  →  rango 1–4</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-orange-400 font-bold text-base mb-3">Score total y porcentaje relativo</h3>
            <p className="text-gray-300 text-sm mb-3">
              Los 4 factores se suman (máximo 16 puntos). La disciplina más exigente para ese atleta vale siempre el 100%,
              y las demás se calculan en relación a ella. Esto hace el perfil completamente individual.
            </p>
            <div className="bg-gray-800 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1">
              <p>total = F1 + F2 + F3 + F4  (máx 16)</p>
              <p>porcentaje = (total_disciplina / MAX(Natación, Ciclismo, Carrera)) × 100</p>
            </div>
          </section>

          <section>
            <h3 className="text-orange-400 font-bold text-base mb-3">Corrector HRV</h3>
            <p className="text-gray-300 text-sm mb-3">
              La HRV es el indicador más objetivo de recuperación. Se toma del registro diario de wellness del atleta
              (el mismo día de la sesión). Si entrena con HRV baja respecto a su basal,
              el sistema aumenta el peso de esa sesión automáticamente porque el cuerpo estaba en peores condiciones.
            </p>
            <div className="bg-gray-800 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1">
              <p>HRV_ratio = HRV_del_día (wellness) / HRV_basal_atleta</p>
              <p>factor_corrector = 1 + (1 − HRV_ratio) × 0,3</p>
              <p>score_corregido = (F1+F2+F3+F4) × factor_corrector</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-center">
              <div className="bg-green-900/40 border border-green-700 rounded-lg p-2">
                <p className="text-green-400 font-bold">HRV normal</p>
                <p className="text-gray-400 mt-1">ratio ≈ 1,0</p>
                <p className="text-gray-400">corrector ≈ ×1,0</p>
              </div>
              <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg p-2">
                <p className="text-yellow-400 font-bold">HRV algo baja</p>
                <p className="text-gray-400 mt-1">ratio ≈ 0,85</p>
                <p className="text-gray-400">corrector ≈ ×1,05</p>
              </div>
              <div className="bg-red-900/40 border border-red-700 rounded-lg p-2">
                <p className="text-red-400 font-bold">HRV muy baja</p>
                <p className="text-gray-400 mt-1">ratio ≈ 0,70</p>
                <p className="text-gray-400">corrector ≈ ×1,09</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-orange-400 font-bold text-base mb-3">Semáforo de doble dimensión</h3>
            <p className="text-gray-300 text-sm mb-3">
              Cruza dos índices: cómo percibe el atleta el esfuerzo respecto a lo que hace su cuerpo (índice de percepción),
              y si la sesión coincidió con lo que planificó el entrenador (índice de planificación).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-white font-semibold text-xs mb-2">Índice de percepción</p>
                <div className="font-mono text-xs text-green-400 mb-3 space-y-1">
                  <p>carga_objetiva = FC_relativa × 10</p>
                  <p>índice = RPE_reportado / carga_objetiva</p>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span><span className="text-gray-300">Menor de 0,85 — Infraperceptor</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span><span className="text-gray-300">0,85 a 1,15 — Calibrado</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span><span className="text-gray-300">Mayor de 1,15 — Sobreperceptor</span></div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-white font-semibold text-xs mb-2">Índice de planificación</p>
                <div className="font-mono text-xs text-green-400 mb-3 space-y-1">
                  <p>carga_objetiva = FC_relativa × 10</p>
                  <p>índice = carga_objetiva / RPE_estimado</p>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span><span className="text-gray-300">Menor de 0,85 — Por debajo del plan</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span><span className="text-gray-300">0,85 a 1,15 — Según el plan</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span><span className="text-gray-300">Mayor de 1,15 — Por encima del plan</span></div>
                </div>
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700 text-gray-300">
                    <th className="py-2 px-3 text-left">Percepción</th>
                    <th className="py-2 px-3 text-left">Planificación</th>
                    <th className="py-2 px-3 text-left">Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { p: '🟡 Calibrado', pl: '🟡 Según plan', txt: 'Sesión perfecta. Continuar.', color: '' },
                    { p: '🔴 Sobreperceptor', pl: '🟡 Según plan', txt: 'Carga correcta, el atleta se frena. Trabajo mental.', color: '' },
                    { p: '🟡 Calibrado', pl: '🔴 Excedido', txt: 'Bien vivida pero se excedió. Ajustar semana siguiente.', color: '' },
                    { p: '🔴 Sobreperceptor', pl: '🔴 Excedido', txt: 'Doble problema. Revisar planificación y gestión mental.', color: '' },
                    { p: '🟢 Infraperceptor', pl: '🟢 Por debajo', txt: 'Atleta con margen, sesión suave. Todo correcto.', color: '' },
                    { p: '🟢 Infraperceptor', pl: '🔴 Excedido', txt: '⚠️ ALERTA: cuerpo aguanta pero carga excedió el plan. Riesgo lesión invisible.', color: 'bg-red-900/30' },
                  ].map((row, i) => (
                    <tr key={i} className={'border-t border-gray-700 ' + row.color}>
                      <td className="py-2 px-3 text-gray-300">{row.p}</td>
                      <td className="py-2 px-3 text-gray-300">{row.pl}</td>
                      <td className="py-2 px-3 text-gray-400">{row.txt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-orange-400 font-bold text-base mb-3">¿Qué datos necesita el sistema?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {[
                { quien: 'Atleta (post-sesión)', datos: ['RPE reportado (1–10)', 'Sensación técnica (1–5)', 'Dolor muscular (1–5)'] },
                { quien: 'Entrenador', datos: ['RPE estimado (1–10, al planificar)'] },
                { quien: 'Wellness diario del atleta', datos: ['HRV del día', 'Dolor muscular a 24h/48h'] },
                { quien: 'Perfil del deportista', datos: ['FC máxima', 'HRV basal (media 7–14 días)', 'Valoración técnica por disciplina (1–5, la da el entrenador)'] },
              ].map(bloque => (
                <div key={bloque.quien} className="bg-gray-800 rounded-xl p-3">
                  <p className="text-gray-400 font-semibold mb-2">{bloque.quien}</p>
                  <ul className="space-y-1">
                    {bloque.datos.map(d => (
                      <li key={d} className="flex items-center gap-2 text-gray-300">
                        <span className="text-orange-400">·</span>{d}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-6 py-2 rounded-lg transition text-sm">
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EcoPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [scores, setScores] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingScores, setLoadingScores] = useState(false)
  const [mostrarExplicacion, setMostrarExplicacion] = useState(false)
  const [zonasRes, setZonasRes] = useState<SicatZonasResultado | null>(null)
  const [pondZona, setPondZona] = useState(false)

  useEffect(() => { setPondZona(typeof window !== 'undefined' && localStorage.getItem('sicat_pond_zona') === '1') }, [])
  const togglePond = () => setPondZona(v => {
    const n = !v
    if (typeof window !== 'undefined') localStorage.setItem('sicat_pond_zona', n ? '1' : '0')
    return n
  })

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(deps || [])
      setLoading(false)
      const act = getAtletaActivo()
      const d0 = (deps || []).find(d => d.id === act)
      if (d0) calcularECO(d0)
    }
    cargar()
  }, [])

  const calcularECO = async (dep: any) => {
    setSeleccionado(dep)
    setAtletaActivo(dep.id)
    setLoadingScores(true)
    setScores(null)
    setZonasRes(null)
    const [resultados, zres] = await Promise.all([calcularSICAT(dep), calcularSicatZonas(dep)])
    setScores(resultados)
    setZonasRes(zres)
    setLoadingScores(false)
  }

  const radarData = scores ? DISCIPLINAS.map(d => ({
    disciplina: d,
    Individual: scores[d]?.porcentaje || 0,
    Poblacional: d === 'Natacion' ? 75 : d === 'Ciclismo' ? 50 : 100,
  })) : []

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {mostrarExplicacion && <ModalExplicacion onClose={() => setMostrarExplicacion(false)} />}

      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-2xl font-bold">SICAT</h2>
          <button
            onClick={() => setMostrarExplicacion(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-orange-500 text-gray-300 hover:text-white text-sm px-4 py-2 rounded-lg transition"
          >
            <span>💡</span>
            <span>¿Cómo funciona?</span>
          </button>
        </div>
        <p className="text-gray-400 mb-6 text-sm">Coste energético individualizado por disciplina · Mínimo 5-6 sesiones por disciplina</p>

        {seleccionado ? (
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <p className="text-sm text-gray-400">Deportista · <span className="text-white font-semibold">{seleccionado.nombre}</span></p>
            <button onClick={() => setSeleccionado(null)} className="text-orange-400 hover:text-orange-300 text-sm font-medium transition">Cambiar deportista</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => calcularECO(d)}
                className={'rounded-xl p-5 border-2 text-left transition ' +
                  (seleccionado?.id === d.id ? 'bg-orange-500 border-orange-400' : 'bg-gray-900 border-gray-700 hover:border-orange-500')}>
                <h3 className="font-bold text-lg">{d.nombre}</h3>
                <p className="text-sm opacity-70">FC máx: {d.fc_maxima || '—'} ppm · HRV basal: {d.hrv_basal || '—'} ms</p>
              </button>
            ))}
          </div>
        )}

        {loadingScores && <div className="text-center py-16 text-gray-400">Calculando scores ECO...</div>}

        {scores && seleccionado && !loadingScores && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {DISCIPLINAS.map(disc => {
                const s = scores[disc]
                const icono = disc === 'Natacion' ? '🏊' : disc === 'Ciclismo' ? '🚴' : '🏃'
                return (
                  <div key={disc} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-2xl">{icono}</span>
                        <h3 className="font-bold text-lg mt-1">{disc}</h3>
                        <p className="text-gray-500 text-xs">{s.sesiones} sesiones analizadas</p>
                      </div>
                      {s.porcentaje !== undefined ? (
                        <div className="text-right">
                          <p className={'text-3xl font-bold ' + colorPorcentaje(s.porcentaje)}>{s.porcentaje}%</p>
                          <p className="text-gray-500 text-xs">del máx individual</p>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">Sin datos</p>
                      )}
                    </div>

                    {s.total !== null ? (
                      <>
                        <div className="w-full bg-gray-800 rounded-full h-2 mb-4">
                          <div className={'h-2 rounded-full ' + bgPorcentaje(s.porcentaje || 0)}
                            style={{ width: (s.porcentaje || 0) + '%' }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'F1 Técnica', val: s.f1, max: 4 },
                            { label: 'F2 Dolor', val: s.f2, max: 4 },
                            { label: 'F3 Densidad', val: s.f3, max: 4 },
                            { label: 'F4 Energético', val: s.f4, max: 4 },
                          ].map(({ label, val, max }) => (
                            <div key={label} className="bg-gray-800 rounded-lg p-2">
                              <p className="text-gray-500 text-xs">{label}</p>
                              <p className="font-bold text-white">{val !== null ? val + '/' + max : '—'}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 bg-gray-800 rounded-lg p-2">
                          <p className="text-gray-500 text-xs">Total corregido HRV</p>
                          <p className="font-bold text-orange-400">{s.total}/16 <span className="text-gray-500 text-xs font-normal">(corrector: ×{s.corrector?.toFixed(2)})</span></p>
                        </div>
                      </>
                    ) : (
                      <div className="bg-gray-800 rounded-lg p-4 text-center">
                        <p className="text-gray-500 text-sm">Faltan datos para calcular</p>
                        <p className="text-gray-600 text-xs mt-1">Necesita sesiones realizadas con RPE, FC y sensación técnica</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {radarData.some(d => d.Individual > 0) && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
                <h3 className="font-bold mb-1">Perfil ECO — Individual vs Poblacional</h3>
                <p className="text-gray-500 text-xs mb-4">Comparación con los valores de referencia de la tabla ECO original</p>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="disciplina" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Radar name="Tu perfil" dataKey="Individual" stroke="#f97316" fill="#f97316" fillOpacity={0.3} />
                    <Radar name="Referencia poblacional" dataKey="Poblacional" stroke="#6b7280" fill="#6b7280" fillOpacity={0.1} strokeDasharray="4 4" />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-bold mb-3">Tabla ECO de referencia poblacional</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-700">
                      <th className="text-left py-2 px-3">Factor</th>
                      <th className="text-center py-2 px-3">🏊 Natación</th>
                      <th className="text-center py-2 px-3">🚴 Ciclismo</th>
                      <th className="text-center py-2 px-3">🏃 Carrera</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TABLA_ECO_ORIGINAL.map(r => (
                      <tr key={r.factor} className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300">{r.factor}</td>
                        <td className="py-2 px-3 text-center">{'★'.repeat(r.natacion)}{'☆'.repeat(4-r.natacion)}</td>
                        <td className="py-2 px-3 text-center">{'★'.repeat(r.ciclismo)}{'☆'.repeat(4-r.ciclismo)}</td>
                        <td className="py-2 px-3 text-center">{'★'.repeat(r.carrera)}{'☆'.repeat(4-r.carrera)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-600">
                      <td className="py-2 px-3 font-bold text-white">TOTAL</td>
                      <td className="py-2 px-3 text-center font-bold text-orange-400">9/16 · 75%</td>
                      <td className="py-2 px-3 text-center font-bold text-orange-400">6/16 · 50%</td>
                      <td className="py-2 px-3 text-center font-bold text-orange-400">12/16 · 100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===== MATRIZ DE COSTE POR ZONA Y DISCIPLINA ===== */}
            {zonasRes && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mt-6">
                <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold">Coste por zona y disciplina</h3>
                    <p className="text-gray-500 text-xs">Cuánto le cuesta cada tipo de entreno (DOMS 48h + caída HRV + RPE). <b className="text-gray-400">1.0× = su coste medio</b> · {zonasRes.nSesiones} sesiones</p>
                  </div>
                  <button onClick={togglePond}
                    className={'text-sm px-3 py-1.5 rounded-lg transition ' + (pondZona ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700')}>
                    {pondZona ? '✓ Ponderación por zona activada' : 'Activar ponderación por zona'}
                  </button>
                </div>

                {zonasRes.celdas.length === 0 ? (
                  <p className="text-gray-500 text-sm py-6">Aún no hay sesiones realizadas con zona y datos post-sesión suficientes para calcular el coste por zona.</p>
                ) : (() => {
                  const zonasOrden = [...new Set(zonasRes.celdas.map(c => c.zona))].sort((a, b) => cargaZona(b).nivel - cargaZona(a).nivel)
                  const cell = (disc: string, zona: string) => zonasRes.celdas.find(c => c.disciplina === disc && c.zona === zona)
                  const cs = conclusionesZonas(zonasRes.celdas)
                  return (
                    <div className={pondZona ? '' : 'opacity-70'}>
                      <div className="grid gap-1.5 mt-4" style={{ gridTemplateColumns: '120px repeat(3, 1fr)' }}>
                        <div />
                        {DISCIPLINAS.map(d => <div key={d} className="text-center text-xs font-bold text-gray-300 pb-1">{iconoDisc(d)}</div>)}
                        {zonasOrden.map(z => (
                          <Fragment key={z}>
                            <div className="flex flex-col justify-center">
                              <span className="text-sm font-bold text-white">{z}</span>
                              <span className="text-gray-600" style={{ fontSize: 9 }}>{cargaZona(z).nombre}</span>
                            </div>
                            {DISCIPLINAS.map(d => {
                              const c = cell(d, z)
                              if (!c) return <div key={d + z} className="rounded-lg border border-dashed border-gray-700 min-h-12 flex items-center justify-center text-gray-600 text-xs">—</div>
                              const col = colMult(c.multiplicador)
                              const border = c.confianza === 'alta' ? ('1.5px solid ' + col) : c.confianza === 'media' ? ('1px solid ' + col + '99') : ('1px dashed ' + col + '99')
                              return (
                                <div key={d + z} className="rounded-lg min-h-12 flex flex-col items-center justify-center" style={{ backgroundColor: col + '1f', border, opacity: c.confianza === 'baja' ? 0.7 : 1 }}>
                                  <span className="font-bold" style={{ color: col, fontSize: 15 }}>{c.multiplicador.toFixed(1)}×</span>
                                  <span className="text-gray-400" style={{ fontSize: 9 }}>n={c.n} · {c.confianza}</span>
                                </div>
                              )
                            })}
                          </Fragment>
                        ))}
                      </div>

                      <div className="flex gap-3 flex-wrap text-xs text-gray-400 mt-3">
                        {([['#22c55e', 'bajo <0.8×'], ['#eab308', 'medio'], ['#f97316', 'alto'], ['#ef4444', 'muy alto >1.8×']] as [string, string][]).map(([c, l]) => (
                          <span key={l} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: c }} />{l}</span>
                        ))}
                        <span className="text-gray-600">punteado = pocos datos (n&lt;3), respaldo al SICAT de disciplina</span>
                      </div>

                      {cs.length > 0 && (
                        <div className="mt-4 border-t border-gray-800 pt-4 flex flex-col gap-2">
                          {cs.map((c, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <span style={{ fontSize: 10 }} className="mt-0.5">{c.ic}</span>
                              <span className="text-gray-300">{c.texto}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-gray-600 text-xs mt-4">
                        {pondZona
                          ? '✓ Con la ponderación activada, la carga (UA) de cada sesión se pesa por el coste de su zona donde hay datos (n≥3), y cae al SICAT de disciplina en el resto.'
                          : 'Ahora mismo es informativo. Actívala para que estos multiplicadores pesen la carga por zona.'}
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

