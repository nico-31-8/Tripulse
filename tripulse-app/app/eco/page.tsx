'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { DISCIPLINAS_SICAT, calcularSICAT } from '@/lib/sicat'
import { calcularSicatZonas, type SicatZonasResultado, type CeldaZona } from '@/lib/sicat-zonas'
import { cargaZona } from '@/lib/zonas'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'
import { useDeclararModulo } from '@/lib/contexto-modulo'

const DISCIPLINAS = DISCIPLINAS_SICAT

// Identidad de color estable por nombre (mismo criterio que el resto de la app).
const GRADS = [['#f97316', '#ea580c'], ['#3b82f6', '#4f46e5'], ['#22c55e', '#0d9488'], ['#a855f7', '#7c3aed'], ['#06b6d4', '#2563eb'], ['#ec4899', '#be185d'], ['#eab308', '#d97706'], ['#ef4444', '#b91c1c']]
const grad = (n: string) => GRADS[[...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length]
const inicial = (n: string) => (n || '?').trim()[0]?.toUpperCase() || '?'
const ICONO_SOLO = (d: string) => d === 'Natacion' ? '🏊' : d === 'Ciclismo' ? '🚴' : '🏃'
const COLOR_DISC: Record<string, string> = { Natacion: '#60a5fa', Ciclismo: '#fbbf24', Carrera: '#4ade80' }

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
  const [refOpen, setRefOpen] = useState(false)

  useEffect(() => { setPondZona(typeof window !== 'undefined' && localStorage.getItem('sicat_pond_zona') === '1') }, [])
  const togglePond = () => setPondZona(v => {
    const n = !v
    if (typeof window !== 'undefined') localStorage.setItem('sicat_pond_zona', n ? '1' : '0')
    return n
  })

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
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

  // Lo que el asistente ve de esta pantalla (ver lib/contexto-modulo). El coste por
  // disciplina es justo lo que necesita para no proponer volumen donde más cuesta.
  useDeclararModulo('SICAT', seleccionado && scores
    ? [
        `Coste de entrenamiento (SICAT) de ${seleccionado.nombre}, 100% = la disciplina que más le cuesta:`,
        DISCIPLINAS.map(d => {
          const s = scores[d]
          if (!s || s.porcentaje == null) return `${d} sin datos suficientes`
          return `${d} ${s.porcentaje}% (F1 ${s.f1 ?? '—'}, F2 ${s.f2 ?? '—'}, F3 ${s.f3 ?? '—'}, F4 ${s.f4 ?? '—'}; ${s.sesiones} sesiones)`
        }).join('; ') + '.',
        zonasRes?.celdas?.length
          ? `Coste por zona medido en ${zonasRes.nSesiones} sesiones; celdas fiables (n≥3): ` +
            (zonasRes.celdas.filter(c => c.n >= 3).map(c => `${c.disciplina} ${c.zona} ×${c.multiplicador}`).join(', ') || 'ninguna') + '.'
          : '',
      ].filter(Boolean).join(' ')
    : '')

  const Avatar = ({ nombre, size = 44 }: { nombre: string; size?: number }) => {
    const [c1, c2] = grad(nombre)
    return <span className="rounded-[30%] grid place-items-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(145deg,' + c1 + ',' + c2 + ')' }}>{inicial(nombre)}</span>
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {mostrarExplicacion && <ModalExplicacion onClose={() => setMostrarExplicacion(false)} />}

      <header className="sticky top-0 z-30 pl-44 pr-6 h-[54px] flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <h1 className="text-[17px] font-bold tracking-tight truncate">SICAT <span className="text-gray-500 font-normal text-[13px] hidden sm:inline">· coste de entrenamiento individualizado</span></h1>
        <button onClick={() => setMostrarExplicacion(true)}
          className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] px-3 py-1.5 rounded-lg transition flex-shrink-0">
          💡 ¿Cómo funciona?
        </button>
      </header>

      <div className="max-w-[1700px] mx-auto px-4 sm:px-8 py-7">
        {!seleccionado ? (
          <>
            <p className="text-gray-500 text-[13px] mb-4">Elige un deportista. El cálculo necesita un mínimo de 5-6 sesiones realizadas por disciplina.</p>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
              {deportistas.map(d => (
                <button key={d.id} onClick={() => calcularECO(d)} className="tp-card tp-tile p-4 flex items-center gap-3" style={{ ['--c' as any]: '#06b6d4' }}>
                  <Avatar nombre={d.nombre} />
                  <div className="min-w-0 text-left">
                    <p className="text-[14px] font-semibold truncate">{d.nombre}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">FC máx {d.fc_maxima || '—'} ppm · HRV {d.hrv_basal || '—'} ms</p>
                  </div>
                </button>
              ))}
              {deportistas.length === 0 && <div className="tp-card p-12 text-center text-gray-500 text-[13px]">No tienes deportistas todavía.</div>}
            </div>
          </>
        ) : (
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <button onClick={() => { setSeleccionado(null); setScores(null); setZonasRes(null) }}
              className="w-9 h-9 rounded-xl grid place-items-center text-gray-400 hover:text-white hover:bg-white/5 transition flex-shrink-0" title="Cambiar deportista">←</button>
            <Avatar nombre={seleccionado.nombre} size={48} />
            <div className="min-w-0">
              <h2 className="text-[21px] font-bold tracking-tight truncate">{seleccionado.nombre}</h2>
              <p className="text-[11.5px] text-gray-500 mt-1">FC máx {seleccionado.fc_maxima || '—'} ppm · HRV basal {seleccionado.hrv_basal || '—'} ms</p>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <button onClick={togglePond}
                className={'text-[12px] font-semibold px-3 py-2 rounded-xl transition border ' + (pondZona ? 'bg-orange-500/15 text-orange-300 border-orange-500/35' : 'bg-white/[0.04] text-gray-400 border-white/[0.07] hover:text-white')}>
                {pondZona ? '✓ Ponderación por zona activa' : 'Activar ponderación por zona'}
              </button>
            </div>
          </div>
        )}

        {loadingScores && <div className="text-center py-16 text-gray-400">Calculando scores ECO...</div>}

        {scores && seleccionado && !loadingScores && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
              {DISCIPLINAS.map(disc => {
                const s = scores[disc]
                const col = COLOR_DISC[disc] || '#94a3b8'
                return (
                  <div key={disc} className="tp-card p-6" style={{ ['--c' as any]: col }}>
                    <div className="flex items-center gap-2 mb-5">
                      <span className="text-[15px]">{ICONO_SOLO(disc)}</span>
                      <h3 className="font-semibold text-[15px] truncate">{disc === 'Natacion' ? 'Natación' : disc}</h3>
                      <span className="text-gray-600 text-[11px] ml-auto flex-shrink-0">{s.sesiones} sesiones</span>
                    </div>

                    {s.total !== null ? (
                      <>
                        <div className="flex items-baseline gap-2.5">
                          <span className={'text-[44px] font-bold leading-none tracking-tight ' + colorPorcentaje(s.porcentaje || 0)}>
                            {s.porcentaje}<span className="text-[19px]">%</span>
                          </span>
                          <span className="text-gray-600 text-[11px]">del máx.</span>
                        </div>
                        <div className="w-full bg-white/[0.06] rounded-full h-1 mt-4 overflow-hidden">
                          <div className={'h-1 rounded-full transition-all duration-500 ' + bgPorcentaje(s.porcentaje || 0)}
                            style={{ width: (s.porcentaje || 0) + '%' }} />
                        </div>

                        <div className="mt-7 flex justify-between gap-2">
                          {[
                            { label: 'Técnica', val: s.f1 },
                            { label: 'Dolor', val: s.f2 },
                            { label: 'Densidad', val: s.f3 },
                            { label: 'Energía', val: s.f4 },
                          ].map(({ label, val }) => (
                            <div key={label} className="text-center flex-1 min-w-0">
                              <p className="text-[17px] font-semibold text-gray-200 leading-none">{val !== null ? val : '—'}</p>
                              <p className="text-gray-600 text-[10px] mt-1.5 truncate" title={label}>{label}</p>
                            </div>
                          ))}
                        </div>

                        <p className="text-gray-600 text-[10.5px] mt-6">
                          Total {s.total}/16 · corrector HRV ×{s.corrector?.toFixed(2)}
                        </p>
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/[0.09] p-5 text-center">
                        <p className="text-gray-500 text-[12.5px]">Faltan datos para calcular</p>
                        <p className="text-gray-600 text-[11px] mt-1.5 leading-snug">Necesita sesiones realizadas con RPE, FC y sensación técnica</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>


            {/* ===== MATRIZ DE COSTE POR ZONA Y DISCIPLINA ===== */}
            {zonasRes && (
              <div className="tp-card p-6">
                <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold text-[16px]">Coste por zona y disciplina</h3>
                    <p className="text-gray-600 text-[11.5px] mt-1"><b className="text-gray-400 font-medium">1.0× = su coste medio</b> · {zonasRes.nSesiones} sesiones analizadas</p>
                  </div>
                </div>

                {zonasRes.celdas.length === 0 ? (
                  <p className="text-gray-500 text-sm py-6">Aún no hay sesiones realizadas con zona y datos post-sesión suficientes para calcular el coste por zona.</p>
                ) : (() => {
                  const zonasOrden = [...new Set(zonasRes.celdas.map(c => c.zona))].sort((a, b) => cargaZona(b).nivel - cargaZona(a).nivel)
                  const cell = (disc: string, zona: string) => zonasRes.celdas.find(c => c.disciplina === disc && c.zona === zona)
                  const cs = conclusionesZonas(zonasRes.celdas)
                  return (
                    <div className={pondZona ? '' : 'opacity-70'}>
                      <div className="grid gap-2 mt-5" style={{ gridTemplateColumns: '130px repeat(3, 1fr)' }}>
                        <div />
                        {DISCIPLINAS.map(d => <div key={d} className="text-center text-[11.5px] font-semibold text-gray-400 pb-1.5">{iconoDisc(d)}</div>)}
                        {zonasOrden.map(z => (
                          <Fragment key={z}>
                            <div className="flex flex-col justify-center">
                              <span className="text-[13.5px] font-semibold text-gray-100">{z}</span>
                              <span className="text-gray-600 text-[10px]">{cargaZona(z).nombre}</span>
                            </div>
                            {DISCIPLINAS.map(d => {
                              const c = cell(d, z)
                              if (!c) return <div key={d + z} className="rounded-xl border border-dashed border-white/[0.07] min-h-[58px] flex items-center justify-center text-gray-700 text-xs">—</div>
                              const col = colMult(c.multiplicador)
                              // La confianza ya se lee en el borde (sólido grueso / fino / punteado),
                              // así que en la celda solo va el multiplicador y el nº de sesiones.
                              const border = c.confianza === 'alta' ? ('1.5px solid ' + col + 'cc') : c.confianza === 'media' ? ('1px solid ' + col + '88') : ('1px dashed ' + col + '77')
                              return (
                                <div key={d + z} title={'n=' + c.n + ' · confianza ' + c.confianza} className="rounded-xl min-h-[56px] flex flex-col items-center justify-center gap-1" style={{ backgroundColor: col + '14', border, opacity: c.confianza === 'baja' ? 0.75 : 1 }}>
                                  <span className="font-semibold leading-none" style={{ color: col, fontSize: 18 }}>{c.multiplicador.toFixed(1)}×</span>
                                  <span className="text-gray-600 text-[9.5px]">n={c.n}</span>
                                </div>
                              )
                            })}
                          </Fragment>
                        ))}
                      </div>

                      <div className="flex gap-4 flex-wrap text-[11px] text-gray-500 mt-4">
                        {([['#22c55e', 'bajo <0.8×'], ['#eab308', 'medio'], ['#f97316', 'alto'], ['#ef4444', 'muy alto >1.8×']] as [string, string][]).map(([c, l]) => (
                          <span key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />{l}</span>
                        ))}
                        <span className="text-gray-600">punteado = pocos datos (n&lt;3)</span>
                      </div>

                      {cs.length > 0 && (
                        <div className="mt-5 pt-5 border-t border-white/[0.06] flex flex-col gap-2.5">
                          {cs.map((c, i) => (
                            <div key={i} className="flex items-start gap-2.5 text-[12.5px]">
                              <span style={{ fontSize: 10 }} className="mt-1">{c.ic}</span>
                              <span className="text-gray-300 leading-relaxed">{c.texto}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-gray-600 text-[11px] mt-5 leading-relaxed">
                        {pondZona
                          ? '✓ Con la ponderación activada, la carga (UA) de cada sesión se pesa por el coste de su zona donde hay datos (n≥3), y cae al SICAT de disciplina en el resto.'
                          : 'Ahora mismo es informativo. Actívala arriba para que estos multiplicadores pesen la carga por zona.'}
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ===== Referencia y perfil — secundario, cerrado por defecto ===== */}
            <div className="tp-card mt-4">
              <button onClick={() => setRefOpen(o => !o)} className="w-full flex items-center gap-3 p-4 text-left">
                <span className="tp-chip w-9 h-9 text-base flex-shrink-0" style={{ ['--c' as any]: '#6b7280' }}>📚</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold">Referencia y perfil</p>
                  <p className="text-[11px] text-gray-500">Radar individual vs. poblacional y tabla ECO original</p>
                </div>
                <span className={'tp-chev text-gray-500 ' + (refOpen ? 'open' : '')}>▾</span>
              </button>
              <div className={'tp-collapse px-4 ' + (refOpen ? 'open pb-4' : '')} style={{ maxHeight: refOpen ? 920 : 0 }}>
                <div className="grid gap-4 lg:grid-cols-2">
                  {radarData.some(d => d.Individual > 0) && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <h3 className="font-semibold text-[13px]">Perfil ECO — individual vs. poblacional</h3>
                      <p className="text-gray-500 text-[11px] mt-0.5 mb-2">Comparación con los valores de referencia de la tabla ECO original</p>
                      <ResponsiveContainer width="100%" height={260}>
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="rgba(255,255,255,.09)" />
                          <PolarAngleAxis dataKey="disciplina" stroke="#7f8a99" tick={{ fontSize: 11, fill: '#7f8a99' }} />
                          <Radar name="Tu perfil" dataKey="Individual" stroke="#f97316" fill="#f97316" fillOpacity={0.3} />
                          <Radar name="Referencia poblacional" dataKey="Poblacional" stroke="#6b7280" fill="#6b7280" fillOpacity={0.1} strokeDasharray="4 4" />
                          <Tooltip contentStyle={{ backgroundColor: '#0b0e15', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#f3f5f8', fontSize: 12 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <h3 className="font-semibold text-[13px] mb-3">Tabla ECO de referencia poblacional</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="text-gray-500 text-[11px] border-b border-white/[0.08]">
                            <th className="text-left py-2 px-2 font-semibold">Factor</th>
                            <th className="text-center py-2 px-2 font-semibold">🏊</th>
                            <th className="text-center py-2 px-2 font-semibold">🚴</th>
                            <th className="text-center py-2 px-2 font-semibold">🏃</th>
                          </tr>
                        </thead>
                        <tbody>
                          {TABLA_ECO_ORIGINAL.map(r => (
                            <tr key={r.factor} className="border-b border-white/[0.05]">
                              <td className="py-2 px-2 text-gray-300">{r.factor}</td>
                              <td className="py-2 px-2 text-center text-orange-300/80">{'★'.repeat(r.natacion)}<span className="text-gray-700">{'★'.repeat(4 - r.natacion)}</span></td>
                              <td className="py-2 px-2 text-center text-orange-300/80">{'★'.repeat(r.ciclismo)}<span className="text-gray-700">{'★'.repeat(4 - r.ciclismo)}</span></td>
                              <td className="py-2 px-2 text-center text-orange-300/80">{'★'.repeat(r.carrera)}<span className="text-gray-700">{'★'.repeat(4 - r.carrera)}</span></td>
                            </tr>
                          ))}
                          <tr className="border-t border-white/[0.12]">
                            <td className="py-2 px-2 font-bold text-white">TOTAL</td>
                            <td className="py-2 px-2 text-center font-bold text-orange-400">9/16 · 75%</td>
                            <td className="py-2 px-2 text-center font-bold text-orange-400">6/16 · 50%</td>
                            <td className="py-2 px-2 text-center font-bold text-orange-400">12/16 · 100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

