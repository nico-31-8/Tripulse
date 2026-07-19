'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { analizarWellness } from '@/lib/wellness-analisis'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'
import { cargarMetricasPanel, fmtMin, type MetricasPanel } from '@/lib/panel-metricas'

// Identidad de color estable por nombre (degradado del avatar, sin consultas extra).
const GRADS = [['#f97316', '#ea580c'], ['#3b82f6', '#4f46e5'], ['#22c55e', '#0d9488'], ['#a855f7', '#7c3aed'], ['#06b6d4', '#2563eb'], ['#ec4899', '#be185d'], ['#eab308', '#d97706'], ['#ef4444', '#b91c1c']]
const grad = (n: string) => GRADS[[...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length]
const inicial = (n: string) => (n || '?').trim()[0]?.toUpperCase() || '?'

export default function Dashboard() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [activo, setActivo] = useState<any>(null)
  const [tareas, setTareas] = useState<any[]>([])
  const [sugerencias, setSugerencias] = useState<string[]>([])
  const [readiness, setReadiness] = useState<any>(null)
  const [wellHoy, setWellHoy] = useState<{ hoy: boolean; score: number | null }>({ hoy: false, score: null })
  const [wellSpark, setWellSpark] = useState<number[]>([])
  const [metricas, setMetricas] = useState<MetricasPanel | null>(null)
  const [proximaComp, setProximaComp] = useState<any>(null)
  const [nuevaTarea, setNuevaTarea] = useState('')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(p)
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id).order('nombre')
      setDeportistas(deps || [])
      setCargando(false)
      // Si venimos de un módulo con un atleta activo, abrimos su panel directamente.
      // (En un login fresco el activo está vacío → se muestra el selector.)
      const act = getAtletaActivo()
      const d0 = (deps || []).find(d => d.id === act)
      if (d0) seleccionar(d0)
    }
    init()
  }, [])

  const seleccionar = async (dep: any) => {
    setSwitcherOpen(false)
    setActivo(dep)
    setAtletaActivo(dep.id)
    setMetricas(null)
    cargarMetricasPanel(supabase, dep).then(setMetricas)
    const { data: ts } = await supabase.from('tarea_entrenador').select('*').eq('id_deportista', dep.id).order('hecho').order('created_at', { ascending: false })
    setTareas(ts || [])
    const { data: wells } = await supabase.from('wellness').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(14)
    setReadiness(analizarWellness(wells || []).readiness)
    const w0 = (wells || [])[0]
    const hoyISO = new Date().toISOString().split('T')[0]
    setWellHoy({ hoy: w0?.fecha === hoyISO, score: w0?.score_wellness ?? null })
    setWellSpark((wells || []).slice(0, 8).reverse().map((w: any) => w.score_wellness || 0))
    const hoyStr = new Date().toISOString().split('T')[0]
    const { data: comp } = await supabase.from('competicion').select('nombre, fecha').eq('id_deportista', dep.id).gte('fecha', hoyStr).order('fecha').limit(1)
    setProximaComp(comp?.[0] || null)

    const sug: string[] = []
    const hoy = new Date()
    if (!dep.tec_fecha_actualizacion) sug.push('Registrar la valoración técnica')
    else {
      const dias = Math.floor((hoy.getTime() - new Date(dep.tec_fecha_actualizacion).getTime()) / 86400000)
      if (dias >= 28) sug.push('Actualizar la valoración técnica (' + Math.floor(dias / 7) + ' semanas sin tocar)')
    }
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
    if (macros?.length) {
      const { data: mesos } = await supabase.from('mesociclo').select('fecha_inicio, objetivo').in('id_macrociclo', macros.map((m: any) => m.id))
      for (const meso of (mesos || [])) {
        if (!meso.fecha_inicio) continue
        const d = Math.floor((new Date(meso.fecha_inicio).getTime() - hoy.getTime()) / 86400000)
        if (d >= 0 && d <= 5) sug.push('Revisar el mesociclo "' + meso.objetivo + '" (empieza ' + (d === 0 ? 'hoy' : 'en ' + d + ' días') + ')')
      }
    }
    const { data: an } = await supabase.from('anamnesis').select('estado').eq('id_deportista', dep.id).maybeSingle()
    if (an?.estado === 'enviada') sug.push('Revisar la anamnesis que envió ' + dep.nombre)
    setSugerencias(sug)
  }

  const addTarea = async (texto?: string) => {
    const t = (texto ?? nuevaTarea).trim()
    if (!t || !activo || !userId) return
    const { data } = await supabase.from('tarea_entrenador').insert({ id_entrenador: userId, id_deportista: activo.id, texto: t }).select().single()
    if (data) setTareas(prev => [data, ...prev])
    if (!texto) setNuevaTarea('')
    if (texto) setSugerencias(prev => prev.filter(s => s !== texto))
  }
  const toggleTarea = async (t: any) => {
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, hecho: !x.hecho } : x))
    await supabase.from('tarea_entrenador').update({ hecho: !t.hecho }).eq('id', t.id)
  }
  const borrarTarea = async (id: number) => {
    setTareas(prev => prev.filter(x => x.id !== id))
    await supabase.from('tarea_entrenador').delete().eq('id', id)
  }
  const cerrarSesion = async () => { setAtletaActivo(null); await supabase.auth.signOut(); router.push('/') }

  const pendientes = tareas.filter(t => !t.hecho).length
  const hechas = tareas.length - pendientes
  const rc = readiness?.color || '#6b7280'
  const [hc1, hc2] = activo ? grad(activo.nombre) : ['#f97316', '#ea580c']
  const semComp = proximaComp ? Math.max(0, Math.round((new Date(proximaComp.fecha).getTime() - Date.now()) / 604800000)) : 0

  const diasComp = proximaComp ? Math.max(0, Math.ceil((new Date(proximaComp.fecha).getTime() - Date.now()) / 86400000)) : null
  const diasFicha = activo?.tec_fecha_actualizacion ? Math.floor((Date.now() - new Date(activo.tec_fecha_actualizacion).getTime()) / 86400000) : null
  const diasTest = metricas?.tests?.ultima ? Math.floor((Date.now() - new Date(metricas.tests.ultima).getTime()) / 86400000) : null
  const nSemana = (metricas?.semana || []).reduce((a: number, d: any) => a + d.sesiones.length, 0)
  const hoyStr = new Date().toISOString().split('T')[0]

  const bhead = (ic: string, label: string, color: string) => (
    <div className="flex items-center gap-2">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: color + '20', color }}>{ic}</span>
      <span className="text-[12.5px] font-semibold text-gray-200">{label}</span>
    </div>
  )
  const BentoBtn = ({ href, className = '', children }: { href: string; className?: string; children: React.ReactNode }) => (
    <button onClick={() => router.push(href)}
      className={'group relative text-left rounded-2xl border border-gray-800 bg-gray-900/50 p-3 flex flex-col justify-between overflow-hidden transition-all duration-200 hover:border-gray-600 hover:-translate-y-0.5 focus-visible:outline-none ' + className}>
      {children}
      <span className="absolute top-3 right-3 text-gray-600 text-xs opacity-0 group-hover:opacity-100 transition">↗</span>
    </button>
  )
  const Spark = ({ data, color, w = 72, h = 24 }: { data: number[]; color: string; w?: number; h?: number }) => {
    if (!data || data.length < 2) return null
    const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1
    const pts = data.map((v, i) => (i / (data.length - 1)) * w + ',' + (h - ((v - min) / rng) * h).toFixed(1))
    return (
      <svg width={w} height={h} viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" className="flex-shrink-0">
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={w} cy={(h - ((data[data.length - 1] - min) / rng) * h).toFixed(1)} r="2" fill={color} />
      </svg>
    )
  }
  const AreaTSB = ({ data, color }: { data: number[]; color: string }) => {
    if (!data || data.length < 2) return null
    const w = 700, h = 120, pad = 12
    const min = Math.min(...data, 0), max = Math.max(...data, 0), rng = (max - min) || 1
    const X = (i: number) => (i / (data.length - 1)) * w
    const Y = (v: number) => h - pad - ((v - min) / rng) * (h - 2 * pad)
    const line = data.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ')
    const area = 'M0,' + Y(data[0]).toFixed(1) + ' ' + data.map((v, i) => 'L' + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + ' L' + w + ',' + h + ' L0,' + h + ' Z'
    const zeroY = Y(0).toFixed(1)
    return (
      <svg viewBox={'0 0 ' + w + ' ' + h} width="100%" height="120" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tsbfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#4b5563" strokeWidth="1" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#tsbfill)" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }
  const wsMax = Math.max(1, ...wellSpark)

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{ background: 'radial-gradient(70% 100% at 50% 0%, ' + (activo ? hc1 : '#f97316') + '14, transparent 70%)' }} />

      <nav className="relative bg-gray-900/70 backdrop-blur-sm pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="text-gray-500 hover:text-white text-sm transition">Cerrar sesión</button>
        </div>
      </nav>

      <div className={'relative mx-auto px-6 py-8 ' + (activo ? 'max-w-7xl' : 'max-w-3xl')}>
        {deportistas.length === 0 ? (
          <>
            <h2 className="text-2xl font-bold tracking-tight mb-4">Hola, {perfil?.nombre} 👋</h2>
            <div className="rounded-2xl border border-orange-500/40 bg-orange-500/[0.06] p-7 text-center">
              <div className="text-4xl mb-2">🚀</div>
              <p className="font-bold text-lg mb-1">Empieza añadiendo tu primer deportista</p>
              <p className="text-gray-400 text-sm mb-5 max-w-md mx-auto">Crea su perfil, envíale la invitación y planifica su temporada.</p>
              <button onClick={() => router.push('/deportistas')} className="bg-orange-500 hover:bg-orange-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition">Ir a Deportistas →</button>
            </div>
          </>
        ) : !activo ? (
          /* ===== ENTRADA: elegir deportista ===== */
          <div className="min-h-[74vh] flex flex-col items-center justify-center text-center">
            <p className="fade-up text-sm font-medium text-orange-400/90 mb-2">Hola, {perfil?.nombre} 👋</p>
            <h2 className="fade-up text-3xl sm:text-[34px] font-bold tracking-tight mb-2" style={{ animationDelay: '60ms' }}>¿Con quién trabajamos hoy?</h2>
            <p className="fade-up text-gray-500 text-sm mb-10" style={{ animationDelay: '110ms' }}>Elige un deportista para abrir su panel.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8 w-full max-w-lg">
              {deportistas.map((d, i) => {
                const [c1, c2] = grad(d.nombre)
                return (
                  <button key={d.id} onClick={() => seleccionar(d)}
                    className="fade-up group flex flex-col items-center gap-3.5 rounded-2xl py-4 transition-transform duration-300 ease-out hover:-translate-y-1.5 focus-visible:outline-none"
                    style={{ animationDelay: (160 + i * 70) + 'ms' }}>
                    <span className="relative w-[86px] h-[86px] rounded-[26px] flex items-center justify-center text-[34px] font-bold text-white transition-all duration-300 ease-out group-hover:scale-105 group-hover:rounded-[30px]"
                      style={{ background: 'linear-gradient(145deg, ' + c1 + ', ' + c2 + ')', boxShadow: '0 12px 30px -6px ' + c1 + '66' }}>
                      {inicial(d.nombre)}
                      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ borderRadius: 'inherit', boxShadow: 'inset 0 0 0 2px #ffffff40' }} />
                    </span>
                    <span className="font-semibold text-[15px] text-gray-400 group-hover:text-white transition-colors duration-200">{d.nombre}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            {/* ===== Cabecera: nombre + selector de deportista ===== */}
            <div className="flex items-center justify-between gap-4 mb-8">
              <div className="relative">
                <button onClick={() => setSwitcherOpen(o => !o)}
                  className="group flex items-center gap-3.5 rounded-2xl -m-1.5 p-1.5 transition hover:bg-white/[0.04]">
                  <div className="relative w-14 h-14 rounded-[20px] flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(145deg, ' + hc1 + ', ' + hc2 + ')', boxShadow: '0 8px 22px -8px ' + hc1 + '77' }}>
                    {inicial(activo.nombre)}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold tracking-tight leading-none truncate">{activo.nombre}</h2>
                      <span className={'text-gray-500 transition-transform duration-200 ' + (switcherOpen ? 'rotate-180' : '')}>▾</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {readiness
                        ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: rc + '1f', color: rc }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: rc }} />{readiness.label}
                          </span>
                        : <span className="text-xs text-gray-500 px-2.5 py-1 rounded-full bg-white/5">Sin wellness reciente</span>}
                      {proximaComp && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 px-2.5 py-1 rounded-full bg-white/5">🏁 {proximaComp.nombre} · {semComp} sem</span>
                      )}
                    </div>
                  </div>
                </button>

                {switcherOpen && (
                  <>
                    <button aria-hidden onClick={() => setSwitcherOpen(false)} className="fixed inset-0 z-10 cursor-default" />
                    <div className="absolute left-0 top-full mt-2 z-20 w-72 rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl shadow-black/50 p-1.5">
                      <p className="text-[11px] font-medium text-gray-500 px-3 pt-1.5 pb-1">Cambiar de deportista</p>
                      {deportistas.map(d => {
                        const [g1, g2] = grad(d.nombre)
                        const sel = d.id === activo.id
                        return (
                          <button key={d.id} onClick={() => seleccionar(d)}
                            className={'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition ' + (sel ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]')}>
                            <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                              style={{ background: 'linear-gradient(145deg, ' + g1 + ', ' + g2 + ')' }}>{inicial(d.nombre)}</span>
                            <span className={'flex-1 text-sm truncate ' + (sel ? 'text-white font-semibold' : 'text-gray-300')}>{d.nombre}</span>
                            {sel && <span className="text-orange-400 text-xs flex-shrink-0">●</span>}
                          </button>
                        )
                      })}
                      <div className="border-t border-gray-800 my-1" />
                      <button onClick={() => { setSwitcherOpen(false); setActivo(null); setAtletaActivo(null) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm text-gray-400 hover:bg-white/[0.04] hover:text-white transition">
                        <span className="text-base leading-none">↩</span> Pantalla de inicio
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button onClick={() => router.push('/deportistas/' + activo.id)}
                className="text-sm text-gray-400 hover:text-white font-medium transition flex-shrink-0">Ficha →</button>
            </div>

            {/* ===== Dos columnas: módulos (principal) + tareas (panel derecho) ===== */}
            <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
              {/* Zona principal: módulos */}
              <div>
                <div className="flex items-baseline gap-2 mb-2.5">
                  <h3 className="text-sm font-semibold text-gray-200">Sus datos</h3>
                  <span className="text-gray-600 text-xs">ya filtrados por {activo.nombre}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7" style={{ gridAutoRows: '96px' }}>

                  {/* Planificación — protagonista */}
                  <BentoBtn href={'/planificacion-visual/' + activo.id} className="col-span-2 row-span-2">
                    {bhead('📅', 'Planificación', '#f97316')}
                    <div>
                      {diasComp != null ? (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[38px] font-bold leading-none tracking-tight">{diasComp}</span>
                            <span className="text-sm text-gray-400">{diasComp === 1 ? 'día para' : 'días para'}</span>
                          </div>
                          {proximaComp && <p className="text-[13px] text-orange-300/90 font-medium truncate mt-1">🏁 {proximaComp.nombre}</p>}
                        </>
                      ) : metricas?.proxima ? (
                        <div>
                          <p className="text-[10px] text-gray-500">Próxima sesión</p>
                          <p className="text-base font-bold flex items-center gap-2 mt-0.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: metricas.proxima.color }} />
                            {metricas.proxima.disciplina} · {metricas.proxima.dow}
                          </p>
                        </div>
                      ) : <span className="text-sm text-gray-500">Sin sesiones próximas</span>}
                    </div>
                    <div>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <p className="text-[10px] text-gray-500">Esta semana</p>
                        <p className="text-[10px] text-gray-400 font-medium">{nSemana} {nSemana === 1 ? 'sesión' : 'sesiones'}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {(metricas?.semana || Array.from({ length: 7 }, (_, i) => ({ dow: ['L','M','X','J','V','S','D'][i], sesiones: [], fecha: '' }))).map((d: any, i: number) => {
                          const esHoy = d.fecha === hoyStr
                          return (
                            <div key={i} className={'flex-1 h-[52px] rounded-lg flex flex-col items-center justify-between py-1.5 border ' + (esHoy ? 'bg-white/[0.06] border-orange-500/40' : 'bg-white/[0.03] border-white/5')}>
                              <div className="flex flex-wrap gap-1 justify-center items-center flex-1 px-1 content-center">
                                {d.sesiones.slice(0, 4).map((s: any, j: number) => (
                                  <span key={j} className="w-[7px] h-[7px] rounded-full" style={{ background: s.color }} />
                                ))}
                              </div>
                              <span className={'text-[9px] leading-none ' + (esHoy ? 'text-orange-400 font-semibold' : 'text-gray-500')}>{d.dow}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </BentoBtn>

                  {/* Wellness */}
                  <BentoBtn href={'/wellness/' + activo.id}>
                    {bhead('💚', 'Wellness', '#22c55e')}
                    {readiness ? (
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[24px] font-bold leading-none" style={{ color: rc }}>{wellHoy.score || '—'}</span>
                            <span className="text-[11px] font-semibold" style={{ color: rc }}>{readiness.label}</span>
                          </div>
                          <p className="text-[10px] mt-1" style={{ color: wellHoy.hoy ? '#22c55e' : '#9ca3af' }}>{wellHoy.hoy ? '✓ registrado hoy' : 'sin registrar hoy'}</p>
                        </div>
                        {wellSpark.length > 1 && (
                          <div className="flex items-end gap-[3px] h-7">
                            {wellSpark.map((v, i) => (
                              <span key={i} className="w-[5px] rounded-full" style={{ height: Math.max(12, (v / wsMax) * 100) + '%', background: rc, opacity: 0.35 + 0.65 * (i + 1) / wellSpark.length }} />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : <span className="text-xs text-gray-500">Sin wellness</span>}
                  </BentoBtn>

                  {/* Carga — frescura */}
                  <BentoBtn href="/carga">
                    {bhead('📈', 'Carga', '#3b82f6')}
                    {metricas?.carga ? (
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <span className="text-[24px] font-bold leading-none" style={{ color: metricas.carga.color }}>{metricas.carga.tsb > 0 ? '+' : ''}{metricas.carga.tsb}</span>
                          <p className="text-[11px] font-medium leading-tight mt-1" style={{ color: metricas.carga.color }}>{metricas.carga.label}</p>
                          <p className="text-[9px] text-gray-500">frescura (TSB)</p>
                        </div>
                        <Spark data={metricas.carga.spark} color={metricas.carga.color} />
                      </div>
                    ) : <span className="text-xs text-gray-500">Sin datos</span>}
                  </BentoBtn>

                  {/* Volumen — por disciplina */}
                  <BentoBtn href="/volumen" className="col-span-2">
                    {bhead('📊', 'Volumen', '#a855f7')}
                    {metricas?.volumen ? (
                      <div>
                        <div className="flex items-baseline gap-1.5 mb-1.5">
                          <span className="text-xl font-bold leading-none">{metricas.volumen.modo === 'tiempo' ? fmtMin(metricas.volumen.total) : metricas.volumen.nSesiones}</span>
                          <span className="text-[11px] text-gray-500">{metricas.volumen.modo === 'tiempo' ? 'planificado esta semana' : (metricas.volumen.nSesiones === 1 ? 'sesión esta semana' : 'sesiones esta semana')}</span>
                        </div>
                        {metricas.volumen.modo === 'tiempo' && (
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5 mb-1.5">
                            {metricas.volumen.porDisc.map(d => (
                              <div key={d.key} style={{ width: (d.min / metricas!.volumen!.total * 100) + '%', background: d.color }} />
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {metricas.volumen.porDisc.map(d => (
                            <span key={d.key} className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />{d.label} <b className="text-gray-200 font-semibold">{metricas.volumen!.modo === 'tiempo' ? fmtMin(d.min) : d.n}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : <span className="text-xs text-gray-500">Sin sesiones esta semana</span>}
                  </BentoBtn>

                  {/* Índices */}
                  <BentoBtn href="/indices">
                    {bhead('🎯', 'Índices', '#eab308')}
                    {metricas?.indices ? (
                      <div>
                        <p className="text-[13px] font-semibold leading-tight" style={{ color: metricas.indices.perColor }}>{metricas.indices.perTexto}</p>
                        <p className="text-[10px] leading-tight mt-1" style={{ color: metricas.indices.planColor }}>{metricas.indices.planTexto}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] text-gray-500">Percepción vs plan</p>
                        <p className="text-sm font-semibold text-gray-400">Sin datos aún</p>
                      </div>
                    )}
                  </BentoBtn>

                  {/* SICAT — solo navegación */}
                  <BentoBtn href="/eco">
                    {bhead('🔬', 'SICAT', '#06b6d4')}
                    <div>
                      <p className="text-[10px] text-gray-500">Coste de entrenamiento</p>
                      <p className="text-sm font-semibold text-gray-300">Individualizado por zona</p>
                    </div>
                  </BentoBtn>

                  {/* Ficha */}
                  <BentoBtn href={'/deportistas/' + activo.id}>
                    {bhead('📋', 'Ficha', '#94a3b8')}
                    <div>
                      <p className="text-[10px] text-gray-500">Valoración técnica</p>
                      <p className="text-sm font-semibold text-gray-200">{diasFicha != null ? 'Hace ' + diasFicha + ' días' : 'Sin registrar'}</p>
                    </div>
                  </BentoBtn>

                  {/* Tests */}
                  <BentoBtn href="/tests">
                    {bhead('🏋️', 'Tests', '#ef4444')}
                    <div>
                      <p className="text-[10px] text-gray-500">Último test</p>
                      <p className="text-sm font-semibold text-gray-200">{diasTest != null ? 'Hace ' + diasTest + ' días' : 'Sin registrar'}</p>
                    </div>
                  </BentoBtn>

                </div>

                {/* Banda de tendencia: carga y frescura */}
                <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4 mb-7">
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="font-semibold text-sm">Carga y frescura</p>
                    <span className="text-xs text-gray-500">
                      {metricas?.carga ? <>hoy <b style={{ color: metricas.carga.color }}>{metricas.carga.tsb > 0 ? '+' : ''}{metricas.carga.tsb}</b> · {metricas.carga.label}</> : 'últimas semanas'}
                    </span>
                  </div>
                  {metricas?.tendencia && metricas.tendencia.length > 1 ? (
                    <>
                      <AreaTSB data={metricas.tendencia} color={metricas.carga?.color || '#3b82f6'} />
                      <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                        <span>hace ~6 semanas</span>
                        <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-gray-500" />línea 0 = equilibrio</span>
                        <span>hoy</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-600 text-sm py-8 text-center">Aún no hay suficientes sesiones realizadas para la curva de forma.</p>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-gray-200 mb-2.5">General</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ gridAutoRows: '92px' }}>
                  <BentoBtn href="/deportistas">
                    {bhead('👥', 'Deportistas', '#f97316')}
                    <div>
                      <p className="text-[10px] text-gray-500">En tu equipo</p>
                      <p className="text-sm font-semibold text-gray-200">{deportistas.length} {deportistas.length === 1 ? 'deportista' : 'deportistas'}</p>
                    </div>
                  </BentoBtn>
                  <BentoBtn href="/comunicacion">
                    {bhead('💬', 'Comunicación', '#ec4899')}
                    <div>
                      <p className="text-[10px] text-gray-500">Mensajes de {activo.nombre?.split(' ')[0]}</p>
                      {metricas?.general?.comunicacion ? (
                        <p className="text-sm font-semibold text-pink-400">{metricas.general.comunicacion} sin leer</p>
                      ) : <p className="text-sm font-semibold text-gray-300">Al día</p>}
                    </div>
                  </BentoBtn>
                  <BentoBtn href="/fuerza">
                    {bhead('💪', 'Bibl. Fuerza', '#ef4444')}
                    <div>
                      <p className="text-[10px] text-gray-500">Ejercicios</p>
                      <p className="text-sm font-semibold text-gray-200">{metricas?.general ? metricas.general.ejercicios : '—'} en biblioteca</p>
                    </div>
                  </BentoBtn>
                  <BentoBtn href="/papelera">
                    {bhead('🗑', 'Papelera', '#6b7280')}
                    <div>
                      <p className="text-[10px] text-gray-500">Sesiones eliminadas</p>
                      {metricas?.general?.papelera ? (
                        <p className="text-sm font-semibold text-gray-300">{metricas.general.papelera} en papelera</p>
                      ) : <p className="text-sm font-semibold text-gray-500">Vacía</p>}
                    </div>
                  </BentoBtn>
                  {/* Comunidad no depende del atleta activo: es tu acceso personal. */}
                  <BentoBtn href="/comunidad">
                    {bhead('🤝', 'Comunidad', '#22c55e')}
                    <div>
                      <p className="text-[10px] text-gray-500">Gente, grupos y retos</p>
                      <p className="text-sm font-semibold text-gray-300">Descubre y conecta</p>
                    </div>
                  </BentoBtn>
                </div>
              </div>

              {/* Columna derecha: tareas + próximas sesiones */}
              <div className="flex flex-col gap-4">
              <aside className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4">
                <div className="flex justify-between items-center mb-3">
                  <p className="font-semibold text-sm">Tareas</p>
                  {tareas.length > 0 && (
                    <span className="text-xs text-gray-500">{hechas}/{tareas.length}</span>
                  )}
                </div>

                <div className="flex flex-col divide-y divide-gray-800/70">
                  {sugerencias.map((s, i) => (
                    <div key={'sug' + i} className="flex items-start gap-2.5 py-2.5 text-sm">
                      <span className="w-[18px] h-[18px] mt-0.5 rounded-md border border-dashed border-blue-500/60 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 leading-snug">{s}</p>
                        <button onClick={() => addTarea(s)} className="text-blue-400 hover:text-blue-300 text-xs font-medium mt-0.5 transition">＋ añadir</button>
                      </div>
                    </div>
                  ))}
                  {tareas.map(t => (
                    <div key={t.id} className="group flex items-start gap-2.5 py-2.5 text-sm">
                      <button onClick={() => toggleTarea(t)}
                        className={'w-[18px] h-[18px] mt-0.5 rounded-md flex items-center justify-center flex-shrink-0 border transition ' + (t.hecho ? 'bg-green-500 border-green-500 text-green-950' : 'border-gray-600 hover:border-gray-400')}
                        style={{ fontSize: 11, fontWeight: 900 }}>{t.hecho ? '✓' : ''}</button>
                      <span className={'flex-1 leading-snug ' + (t.hecho ? 'text-gray-600 line-through' : 'text-gray-200')}>{t.texto}</span>
                      <button onClick={() => borrarTarea(t.id)} className="text-gray-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition text-xs flex-shrink-0 mt-0.5">✕</button>
                    </div>
                  ))}
                </div>

                {sugerencias.length === 0 && tareas.length === 0 && (
                  <p className="text-gray-600 text-sm py-3 leading-snug">Todo al día. Añade lo que tengas que hacer con {activo.nombre}.</p>
                )}

                <div className="mt-3.5 pt-3.5 border-t border-gray-800/70">
                  <input value={nuevaTarea} onChange={e => setNuevaTarea(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTarea() }}
                    placeholder="Añadir una tarea…"
                    className="w-full bg-gray-800/70 text-white text-sm px-3.5 py-2 rounded-xl outline-none placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-orange-500/60 transition" />
                  <button onClick={() => addTarea()} disabled={!nuevaTarea.trim()}
                    className="w-full mt-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:hover:bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">Añadir tarea</button>
                </div>
              </aside>

              {/* Próximas sesiones */}
              <aside className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-semibold text-sm">Próximas sesiones</p>
                  <button onClick={() => router.push('/planificacion-visual/' + activo.id)} className="text-xs text-gray-500 hover:text-white transition">Ver plan →</button>
                </div>
                {metricas?.agenda && metricas.agenda.length > 0 ? (
                  <div className="flex flex-col">
                    {metricas.agenda.map((s, i) => (
                      <button key={i} onClick={() => router.push('/planificacion-visual/' + activo.id)}
                        className="group flex items-center gap-3 py-2.5 border-b border-gray-800/60 last:border-0 text-left transition">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-200 truncate group-hover:text-white transition">{s.disciplina}{s.zona ? ' · ' + s.zona : ''}</p>
                          <p className="text-[11px] text-gray-500">{s.etiqueta}{s.min ? ' · ~' + fmtMin(s.min) : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm py-3 leading-snug">Sin sesiones programadas próximamente.</p>
                )}
              </aside>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
