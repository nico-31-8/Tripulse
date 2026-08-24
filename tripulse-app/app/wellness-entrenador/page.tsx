'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { sumarDias, hoyISO } from '@/lib/fechas'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { analizarWellness } from '@/lib/wellness-analisis'
import { bienestar, colorBienestar, estadoBienestar } from '@/lib/wellness-score'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'
import { useDeclararModulo } from '@/lib/contexto-modulo'

const GRADS = [['#f97316', '#ea580c'], ['#3b82f6', '#4f46e5'], ['#22c55e', '#0d9488'], ['#a855f7', '#7c3aed'], ['#06b6d4', '#2563eb'], ['#ec4899', '#be185d'], ['#eab308', '#d97706'], ['#ef4444', '#b91c1c']]
const grad = (n: string) => GRADS[[...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length]
const inicial = (n: string) => (n || '?').trim()[0]?.toUpperCase() || '?'

const VARS_SUBJETIVAS = [
  { key: 'fatiga', label: 'Fatiga', color: '#f87171' },
  { key: 'estres', label: 'Estrés', color: '#fb923c' },
  { key: 'animo', label: 'Ánimo', color: '#4ade80' },
  { key: 'motivacion', label: 'Motivación', color: '#a78bfa' },
  { key: 'calidad_sueno', label: 'Calidad sueño', color: '#34d399' },
  { key: 'horas_sueno', label: 'Horas sueño', color: '#38bdf8' },
  { key: 'dolor_muscular', label: 'Dolor muscular', color: '#fbbf24' },
]

const RANGOS = [{ label: '7 días', dias: 7 }, { label: '14 días', dias: 14 }, { label: '30 días', dias: 30 }, { label: 'Todo', dias: 365 }]

// Orden de triaje: lo más preocupante primero.
const SEVERIDAD: Record<string, number> = { alerta: 0, fatiga: 1, vigilar: 2, optimo: 3 }

const tooltipStyle = { backgroundColor: '#0b0e15', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#f3f5f8', fontSize: 12, boxShadow: '0 14px 34px -12px #000' }
const ejeStyle = { stroke: '#7f8a99', tick: { fontSize: 10, fill: '#7f8a99' } }

export default function WellnessEntrenador() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState(14)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [usarFechasCustom, setUsarFechasCustom] = useState(false)
  const [varsActivas, setVarsActivas] = useState<string[]>(['fatiga', 'estres', 'animo', 'motivacion'])
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'atencion' | 'sin_hoy'>('todos')

  const hoyStr = hoyISO()

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      if (deps) {
        /* Esto era una consulta POR ATLETA: con veinte deportistas, veinte
           viajes para pintar la lista. Ahora es uno para todos y se reparte en
           memoria.

           SE PIDEN LAS DOS ÚLTIMAS SEMANAS EN VEZ DE «LAS 14 ÚLTIMAS FILAS» de
           cada uno, porque un `limit` global cortaría por el atleta más
           constante y dejaría sin datos a los demás. Es la misma ventana que
           analizaba antes —catorce registros diarios son catorce días— pero
           expresada en lo que de verdad se quiere: los últimos catorce días. */
        const { data: todos } = await supabase.from('wellness')
          .select('*').in('id_deportista', deps.map((d: any) => d.id))
          .gte('fecha', sumarDias(hoyStr, -14))
          .order('fecha', { ascending: false })

        const porDep = new Map<number, any[]>()
        ;(todos || []).forEach((w: any) => {
          const l = porDep.get(w.id_deportista)
          if (l) l.push(w); else porDep.set(w.id_deportista, [w])
        })

        const conWellness = deps.map((d: any) => {
          const recientes = porDep.get(d.id) || []
          return {
            ...d,
            ultimoWellness: recientes[0] || null,
            readiness: analizarWellness(recientes).readiness,
            spark: recientes.slice(0, 10).reverse().map((r: any) => bienestar(r.score_wellness) ?? 0),
          }
        })
        setDeportistas(conWellness)
        const act = getAtletaActivo()
        const d0 = conWellness.find(d => d.id === act)
        if (d0) verDetalle(d0)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const cargarRegistros = async (depId: number, dias: number, desde: string, hasta: string, custom: boolean) => {
    let query = supabase.from('wellness').select('*').eq('id_deportista', depId).order('fecha', { ascending: true })
    if (custom && desde) query = query.gte('fecha', desde)
    if (custom && hasta) query = query.lte('fecha', hasta)
    if (!custom) {
      query = query.gte('fecha', sumarDias(hoyISO(), -dias))
    }
    const { data } = await query
    setRegistros(data || [])
  }

  const verDetalle = async (dep: any) => {
    setSeleccionado(dep); setAtletaActivo(dep.id)
    await cargarRegistros(dep.id, rango, fechaDesde, fechaHasta, usarFechasCustom)
  }
  const cambiarRango = async (dias: number) => {
    setRango(dias); setUsarFechasCustom(false)
    if (seleccionado) await cargarRegistros(seleccionado.id, dias, '', '', false)
  }
  const aplicarFechas = async () => {
    setUsarFechasCustom(true)
    if (seleccionado) await cargarRegistros(seleccionado.id, rango, fechaDesde, fechaHasta, true)
  }
  const toggleVar = (key: string) => setVarsActivas(prev => prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key])

  // Las gráficas pintan BIENESTAR (invertido), no el malestar guardado.
  const datos = registros.map(r => ({ ...r, fecha: r.fecha.slice(5), bienestar: bienestar(r.score_wellness) }))

  // Lo que el asistente ve de esta pantalla (ver lib/contexto-modulo). Con un atleta
  // abierto, sus números; sin él, quién del equipo necesita atención.
  const bAct = seleccionado ? bienestar(seleccionado.ultimoWellness?.score_wellness) : null
  useDeclararModulo('Wellness', seleccionado
    ? [
        `Wellness de ${seleccionado.nombre}, ${registros.length} registros en el rango elegido.`,
        bAct != null ? `Último bienestar ${bAct}/100 → ${estadoBienestar(bAct)} (recuerda: más alto es mejor).` : 'Sin registro reciente.',
        seleccionado.readiness ? `Disposición: ${seleccionado.readiness.label} — ${seleccionado.readiness.recomendacion}.` : '',
      ].filter(Boolean).join(' ')
    : deportistas.length
      ? `Vista de equipo en Wellness: ${deportistas.length} deportistas. Necesitan atención: ` +
        (deportistas.filter((d: any) => d.readiness && (d.readiness.nivel === 'alerta' || d.readiness.nivel === 'fatiga'))
          .map((d: any) => `${d.nombre} (${d.readiness.label})`).join(', ') || 'ninguno') + '.'
      : '')

  const q = query.trim().toLowerCase()
  const lista = deportistas
    .filter(d => {
      if (q && !(d.nombre || '').toLowerCase().includes(q)) return false
      if (filtro === 'atencion' && !(d.readiness && (d.readiness.nivel === 'alerta' || d.readiness.nivel === 'fatiga'))) return false
      if (filtro === 'sin_hoy' && d.ultimoWellness?.fecha === hoyStr) return false
      return true
    })
    .sort((a, b) => {
      const sa = a.readiness ? SEVERIDAD[a.readiness.nivel] : 4
      const sb = b.readiness ? SEVERIDAD[b.readiness.nivel] : 4
      if (sa !== sb) return sa - sb
      return (bienestar(a.ultimoWellness?.score_wellness) ?? 999) - (bienestar(b.ultimoWellness?.score_wellness) ?? 999)
    })

  const nAtencion = deportistas.filter(d => d.readiness && (d.readiness.nivel === 'alerta' || d.readiness.nivel === 'fatiga')).length
  const analisis = registros.length ? analizarWellness(registros) : null

  const Avatar = ({ nombre, size = 44 }: { nombre: string; size?: number }) => {
    const [c1, c2] = grad(nombre)
    return <span className="rounded-[30%] grid place-items-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(145deg,' + c1 + ',' + c2 + ')' }}>{inicial(nombre)}</span>
  }

  const Spark = ({ data, color, w = 62, h = 22 }: { data: number[]; color: string; w?: number; h?: number }) => {
    if (!data || data.length < 2) return null
    const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1
    const pts = data.map((v, i) => (i / (data.length - 1)) * w + ',' + (h - ((v - min) / rng) * h).toFixed(1))
    return (
      <svg width={w} height={h} viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" className="flex-shrink-0">
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-30 pl-44 pr-6 h-[54px] flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <h1 className="text-[17px] font-bold tracking-tight truncate">Wellness <span className="text-gray-500 font-normal text-[13px] hidden sm:inline">· estado diario de tu equipo</span></h1>
        {nAtencion > 0 && !seleccionado && (
          <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: '#ef444418', color: '#fca5a5', border: '1px solid #ef444433' }}>
            {nAtencion} {nAtencion === 1 ? 'necesita atención' : 'necesitan atención'}
          </span>
        )}
      </header>

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-5">
        {!seleccionado ? (
          /* ================= EQUIPO (sin deportista elegido) ================= */
          <>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div className="flex items-center gap-2.5 bg-white/[0.045] border border-white/[0.075] rounded-xl px-3 py-2.5 w-full sm:w-72">
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar deportista…" className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-gray-500 min-w-0" />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {([['todos', 'Todos'], ['atencion', 'Atención'], ['sin_hoy', 'Sin registrar hoy']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFiltro(k)}
                    className={'text-[11.5px] font-semibold px-3 py-1.5 rounded-full border transition ' + (filtro === k ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'text-gray-400 bg-white/[0.04] border-white/[0.06] hover:text-white')}>{l}</button>
                ))}
              </div>
              <span className="text-[11.5px] text-gray-500 ml-auto">Ordenado por prioridad · peor primero</span>
            </div>

            {lista.length === 0 ? (
              <div className="tp-card p-12 text-center text-gray-500 text-[13px]">Nadie coincide con el filtro.</div>
            ) : (
              <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))' }}>
                {lista.map(d => {
                  const b = bienestar(d.ultimoWellness?.score_wellness)
                  const col = b != null ? colorBienestar(b) : '#6b7280'
                  const sinHoy = d.ultimoWellness?.fecha !== hoyStr
                  return (
                    <button key={d.id} onClick={() => verDetalle(d)} className="tp-card tp-tile p-4 flex flex-col gap-3" style={{ ['--c' as any]: d.readiness?.color || '#6b7280' }}>
                      <div className="flex items-center gap-3">
                        <Avatar nombre={d.nombre} />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[14px] font-semibold truncate">{d.nombre}</p>
                          {d.readiness
                            ? <span className="inline-block text-[10.5px] font-bold px-2 py-0.5 rounded-full mt-1" style={{ background: d.readiness.color + '22', color: d.readiness.color }}>{d.readiness.label}</span>
                            : <span className="text-[11px] text-gray-500">Sin datos suficientes</span>}
                        </div>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <div className="text-left">
                          {b != null ? (
                            <>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[26px] font-bold leading-none" style={{ color: col }}>{b}</span>
                                <span className="text-[10.5px] text-gray-500">bienestar</span>
                              </div>
                              <p className="text-[11px] mt-1" style={{ color: sinHoy ? '#9ca3af' : '#22c55e' }}>{sinHoy ? (d.ultimoWellness ? 'sin registrar hoy · últ. ' + d.ultimoWellness.fecha : 'sin registros') : '✓ registrado hoy'}</p>
                            </>
                          ) : <span className="text-[12px] text-gray-500">Sin registros</span>}
                        </div>
                        <Spark data={d.spark} color={col} />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          /* ================= DETALLE (pantalla completa) ================= */
          <>
            {/* Cabecera del deportista */}
            <div className="tp-card p-4 mb-4 flex flex-wrap items-center gap-4">
              <button onClick={() => { setSeleccionado(null); setAtletaActivo(null) }}
                className="w-9 h-9 rounded-xl grid place-items-center text-gray-400 hover:text-white hover:bg-white/5 transition flex-shrink-0" title="Volver al equipo">←</button>
              <Avatar nombre={seleccionado.nombre} size={48} />
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-[21px] font-bold tracking-tight truncate">{seleccionado.nombre}</h2>
                  {analisis?.readiness && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: analisis.readiness.color + '22', color: analisis.readiness.color }}>{analisis.readiness.label}</span>}
                </div>
                <p className="text-[11.5px] text-gray-500 mt-1">{registros.length} {registros.length === 1 ? 'registro' : 'registros'} en el período</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap ml-auto">
                {RANGOS.map(r => (
                  <button key={r.dias} onClick={() => cambiarRango(r.dias)}
                    className={'px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition border ' + (!usarFechasCustom && rango === r.dias ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'bg-white/[0.04] text-gray-400 border-white/[0.06] hover:text-white')}>{r.label}</button>
                ))}
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="bg-white/[0.05] border border-white/[0.075] text-[11.5px] px-2.5 py-1.5 rounded-lg outline-none focus:border-orange-500/50" />
                <span className="text-gray-600 text-xs">—</span>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="bg-white/[0.05] border border-white/[0.075] text-[11.5px] px-2.5 py-1.5 rounded-lg outline-none focus:border-orange-500/50" />
                <button onClick={aplicarFechas} className="bg-orange-500 hover:bg-orange-400 text-white text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition">Aplicar</button>
                <button onClick={() => router.push('/wellness/' + seleccionado.id)} className="text-[12.5px] text-gray-400 hover:text-white transition ml-1">Ficha completa →</button>
              </div>
            </div>

            {registros.length === 0 ? (
              <div className="tp-card p-12 text-center text-gray-500 text-[13px]">No hay registros en este período.</div>
            ) : (
              /* Izquierda: resumen + registros · Derecha: gráficas + (reservado) */
              <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <div className="grid gap-4 items-start lg:grid-cols-[minmax(340px,30%)_1fr]">

                  {/* ---- IZQUIERDA ---- */}
                  <div className="flex flex-col gap-4">
                    {/* Resumen */}
                    {analisis?.readiness && (
                      <div className="tp-card overflow-hidden" style={{ borderColor: analisis.readiness.color + '44' }}>
                        <div className="p-4" style={{ borderLeft: '3px solid ' + analisis.readiness.color, background: analisis.readiness.color + '0d' }}>
                          <p className="text-[20px] font-bold leading-none" style={{ color: analisis.readiness.color }}>{analisis.readiness.label}</p>
                          <p className="text-gray-300 text-[13px] mt-2 leading-snug">{analisis.readiness.recomendacion}</p>
                        </div>
                        <div className="px-4 py-3 flex flex-col gap-1.5 border-t border-gray-800/70">
                          {analisis.conclusiones.map((c, i) => {
                            const col = c.tipo === 'rojo' ? '#ef4444' : c.tipo === 'ambar' ? '#f97316' : c.tipo === 'positivo' ? '#22c55e' : '#6b7280'
                            return (
                              <div key={i} className="flex items-start gap-2.5 text-[12.5px]">
                                <span className="w-1.5 h-1.5 rounded-full mt-[6px] flex-shrink-0" style={{ background: col }} />
                                <span className="text-gray-300 leading-snug">{c.texto}</span>
                              </div>
                            )
                          })}
                        </div>
                        {analisis.metricas.length > 0 && (
                          <div className="px-4 pb-4 pt-1 border-t border-gray-800/70">
                            <div className="flex items-center justify-between my-3">
                              <p className="text-[12px] font-semibold text-gray-300">Últimos 7 días vs su línea base</p>
                              {!analisis.baselineFiable && <span className="text-[10.5px] text-gray-500">base provisional</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {analisis.metricas.map(m => (
                                <div key={m.key} className={'rounded-xl p-2.5 border ' + (m.fuera ? 'border-orange-500/40 bg-orange-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02]')}>
                                  <p className="text-gray-400 text-[11px] mb-1">{m.label}</p>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className={'font-bold text-[15px] ' + (m.fuera ? 'text-orange-300' : 'text-white')}>{m.reciente}<span className="text-gray-500 text-[10px] font-normal ml-0.5">{m.unidad}</span></span>
                                    <span style={{ fontSize: 9, color: m.fuera ? '#fb923c' : '#6b7280' }}>{m.flecha === 'up' ? '▲' : m.flecha === 'down' ? '▼' : '▬'}</span>
                                  </div>
                                  {m.base != null && <p className="text-gray-600 text-[10.5px] mt-0.5">base {m.base}{m.unidad}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Registros antiguos */}
                    <div className="tp-card p-4">
                      <div className="flex items-baseline justify-between mb-2">
                        <p className="text-[13px] font-semibold">Registros anteriores</p>
                        <span className="text-[11px] text-gray-500">{registros.length} en el período</span>
                      </div>
                      <div className="flex flex-col max-h-[420px] overflow-y-auto -mx-1 px-1">
                        {registros.slice().reverse().map(r => {
                          const b = bienestar(r.score_wellness)
                          const col = b != null ? colorBienestar(b) : '#6b7280'
                          return (
                            <div key={r.id} className="flex justify-between items-center gap-3 py-2.5 border-b border-gray-800/60 last:border-0">
                              <div className="min-w-0">
                                <p className="text-[12.5px] font-medium text-gray-200">{r.fecha}</p>
                                <p className="text-gray-500 text-[11px] truncate">Sueño {r.horas_sueno}h · Fatiga {r.fatiga}/7 · Estrés {r.estres}/7{r.hrv ? ' · HRV ' + r.hrv : ''}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-[15px] leading-none" style={{ color: col }}>{b}</p>
                                <p className="text-[10px] mt-0.5" style={{ color: col }}>{b != null ? estadoBienestar(b) : ''}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* ---- DERECHA ---- */}
                  <div className="flex flex-col gap-4 min-w-0">
                    {/* Bienestar */}
                    <div className="tp-card p-4">
                      <div className="flex justify-between items-baseline mb-3">
                        <p className="text-[13px] font-semibold">Bienestar</p>
                        <span className="text-[11px] text-gray-500">0–100 · más alto es mejor</span>
                      </div>
                      <ResponsiveContainer width="100%" height={230}>
                        <AreaChart data={datos}>
                          <defs>
                            <linearGradient id="gradBien" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
                          <XAxis dataKey="fecha" {...ejeStyle} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 100]} {...ejeStyle} axisLine={false} tickLine={false} width={30} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + '/100', 'Bienestar']} />
                          <ReferenceLine y={75} stroke="#22c55e" strokeOpacity={0.45} strokeDasharray="4 4" label={{ value: 'Óptimo', fill: '#22c55e', fontSize: 9, position: 'insideTopLeft' }} />
                          <ReferenceLine y={50} stroke="#eab308" strokeOpacity={0.35} strokeDasharray="4 4" />
                          <ReferenceLine y={25} stroke="#ef4444" strokeOpacity={0.35} strokeDasharray="4 4" label={{ value: 'Crítico', fill: '#ef4444', fontSize: 9, position: 'insideBottomLeft' }} />
                          <Area type="monotone" dataKey="bienestar" stroke="#22c55e" strokeWidth={2.4} fill="url(#gradBien)" dot={{ fill: '#22c55e', r: 3 }} name="Bienestar" connectNulls />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* HRV / FC reposo */}
                    {registros.some(r => r.hrv || r.fc_reposo) && (
                      <div className="tp-card p-4">
                        <div className="flex justify-between items-baseline mb-3">
                          <p className="text-[13px] font-semibold">Datos objetivos</p>
                          <span className="text-[11px] text-gray-500">HRV (ms) · FC reposo (ppm)</span>
                        </div>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={datos}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
                            <XAxis dataKey="fecha" {...ejeStyle} axisLine={false} tickLine={false} />
                            <YAxis {...ejeStyle} axisLine={false} tickLine={false} width={30} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#7f8a99' }} />
                            {registros.some(r => r.hrv) && <Line type="monotone" dataKey="hrv" stroke="#60a5fa" strokeWidth={2.2} dot={{ fill: '#60a5fa', r: 3 }} name="HRV (ms)" connectNulls />}
                            {registros.some(r => r.fc_reposo) && <Line type="monotone" dataKey="fc_reposo" stroke="#fb7185" strokeWidth={2.2} dot={{ fill: '#fb7185', r: 3 }} name="FC reposo (ppm)" connectNulls />}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Variables subjetivas */}
                    <div className="tp-card p-4">
                      <div className="flex justify-between items-baseline mb-3">
                        <p className="text-[13px] font-semibold">Variables subjetivas</p>
                        <span className="text-[11px] text-gray-500">escala 1–7</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {VARS_SUBJETIVAS.map(v => {
                          const on = varsActivas.includes(v.key)
                          return (
                            <button key={v.key} onClick={() => toggleVar(v.key)}
                              className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition border"
                              style={on ? { background: v.color + '26', color: v.color, borderColor: v.color + '55' } : { background: 'rgba(255,255,255,.04)', color: '#7f8a99', borderColor: 'rgba(255,255,255,.06)' }}>
                              {v.label}
                            </button>
                          )
                        })}
                      </div>
                      {varsActivas.length === 0 ? (
                        <p className="text-gray-500 text-[13px] text-center py-8">Selecciona al menos una variable.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={datos}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
                            <XAxis dataKey="fecha" {...ejeStyle} axisLine={false} tickLine={false} />
                            <YAxis domain={[1, 7]} ticks={[1, 3, 5, 7]} {...ejeStyle} axisLine={false} tickLine={false} width={30} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#7f8a99' }} />
                            {VARS_SUBJETIVAS.filter(v => varsActivas.includes(v.key)).map(v => (
                              <Line key={v.key} type="monotone" dataKey={v.key} stroke={v.color} strokeWidth={2} dot={{ fill: v.color, r: 2.5 }} name={v.label} connectNulls />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
