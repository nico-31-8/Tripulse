'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { vivas } from '@/lib/papelera'
import { hoyISO, semanasEntre, sumarSemanas, sumarDias } from '@/lib/fechas'
import Cargando from '@/components/Cargando'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { cargaZona, ZONAS_RESISTENCIA, ZONAS_FUERZA } from '@/lib/zonas'

// Colores por tipo de mesociclo (hex, para estilos inline)
const C_MESO: Record<string, string> = {
  'Acumulación': '#f97316', 'Acumulacion': '#f97316',
  'Transmutación': '#eab308', 'Transmutacion': '#eab308',
  'Realización': '#ef4444', 'Realizacion': '#ef4444',
  'Recuperación': '#22c55e', 'Recuperacion': '#22c55e',
}
const C_DISC: Record<string, string> = { Natacion: '#3b82f6', Ciclismo: '#eab308', Carrera: '#22c55e', Fuerza: '#ef4444', Brick: '#a855f7' }
const DISC_CORTO: Record<string, string> = { Natacion: 'Nat', Ciclismo: 'Cic', Carrera: 'Car', Fuerza: 'Fue', Brick: 'Brk' }
const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']


export default function VistaCiclo({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()
  const [meso, setMeso] = useState<any>(null)
  // Distingue "todavia no ha llegado" de "ha llegado vacio". Sin esto, una
  // fila que RLS deniega dejaba la pantalla en "Cargando..." para siempre.
  const [noExiste, setNoExiste] = useState(false)
  const [micros, setMicros] = useState<any[]>([])
  const [sesiones, setSesiones] = useState<any[]>([])
  const [tareas, setTareas] = useState<any[]>([])
  const [zonas, setZonas] = useState<any[]>([])
  const [depId, setDepId] = useState<number | null>(null)
  const [sistemaZonas, setSistemaZonas] = useState(1)
  const [zonaTab, setZonaTab] = useState<string>('deportes')
  const [fuente, setFuente] = useState<'tareas' | 'chips'>('tareas')
  const [posicion, setPosicion] = useState<{ n: number; total: number }>({ n: 0, total: 0 })
  // Modo edición del calendario
  const [editMode, setEditMode] = useState(false)
  const [selSes, setSelSes] = useState<number | null>(null)
  const [selPos, setSelPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [clipboard, setClipboard] = useState<any | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => { cargar() }, [id])

  /*
   * De ocho viajes encadenados a cuatro rondas.
   *
   * El macrociclo ya no hace de puente para saber de quién es el bloque:
   * `mesociclo.id_deportista` lo dice. Se sigue pidiendo, pero solo por su
   * `fecha_inicio` —el origen de la numeración de semanas— y ya no bloquea a
   * los demás.
   */
  const cargar = async () => {
    const { data: m } = await supabase.from('mesociclo').select('*').eq('id', id).maybeSingle()
    // Aquí ya había un `return` seco: la consulta terminaba sin resultado y la
    // pantalla se quedaba cargando eternamente sin que nadie lo dijera.
    if (!m) { setNoExiste(true); return }
    setMeso(m)
    setDepId(m.id_deportista)

    // ---- Ronda 2: todo lo que cuelga del mesociclo, a la vez ----
    const [micros, macro, dep, hermanos, borrador] = await Promise.all([
      supabase.from('microciclo').select('*').eq('id_mesociclo', id).order('fecha_inicio', { ascending: true }),
      supabase.from('macrociclo').select('id, fecha_inicio').eq('id', m.id_macrociclo).maybeSingle(),
      supabase.from('deportista').select('sistema_zonas').eq('id', m.id_deportista).maybeSingle(),
      supabase.from('mesociclo').select('id, fecha_inicio').eq('id_macrociclo', m.id_macrociclo).order('fecha_inicio', { ascending: true }),
      supabase.from('dibujo_borrador').select('sesiones_zonas').eq('id_deportista', m.id_deportista).maybeSingle(),
    ])

    const mi = micros.data || []
    setMicros(mi)
    setSistemaZonas(dep.data?.sistema_zonas || 1)

    if (hermanos.data) {
      const idx = hermanos.data.findIndex((h: any) => String(h.id) === String(id))
      setPosicion({ n: idx + 1, total: hermanos.data.length })
    }

    const inicioMacro = macro.data?.fecha_inicio
    if (inicioMacro) {
      const semanasMeso = new Set(mi.map((x: any) => semanasEntre(inicioMacro, x.fecha_inicio)))
      const todasZonas = (borrador.data?.sesiones_zonas || []) as any[]
      setZonas(todasZonas.filter(z => semanasMeso.has(z.semana)))
    }

    // ---- Ronda 3: las sesiones de ESTAS semanas ----
    const microIds = mi.map((x: any) => x.id)
    if (!microIds.length) { setSesiones([]); return }
    const { data: ses } = await vivas(supabase.from('sesion')
      .select('id, disciplina, fecha_sesion, rpe_estimado, rpe_reportado, estado, modo_fuerza, zona_fuerza, id_microciclo, origen')
      .in('id_microciclo', microIds))
    setSesiones(ses || [])

    // ---- Ronda 4: sus bloques ----
    if (ses?.length) {
      const { data: tar } = await supabase.from('tarea')
        .select('id, id_sesion, zona_entrenamiento').in('id_sesion', ses.map((x: any) => x.id))
      setTareas(tar || [])
    }
  }

  // --- Acciones del modo edición ---
  const moverSesion = async (sesId: number, fecha: string, microId: number) => {
    const s = sesiones.find(x => x.id === sesId)
    if (!s || (s.fecha_sesion === fecha && s.id_microciclo === microId)) return
    setSesiones(prev => prev.map(x => x.id === sesId ? { ...x, fecha_sesion: fecha, id_microciclo: microId } : x))
    await supabase.from('sesion').update({ fecha_sesion: fecha, id_microciclo: microId }).eq('id', sesId)
  }

  const eliminarSesion = async (sesId: number) => {
    if (!confirm('¿Mover esta sesión a la papelera?')) return
    setSesiones(prev => prev.filter(x => x.id !== sesId))
    setSelSes(null)
    await supabase.from('sesion').update({ eliminada: true }).eq('id', sesId)
    await cargar()
  }

  const copiarSesion = (s: any) => { setClipboard(s); setSelSes(null) }

  // Reclasifica la sesión: pone todas sus tareas (y zona_fuerza si es Fuerza) en la zona elegida.
  const cambiarZona = async (sesId: number, sigla: string) => {
    const s = sesiones.find(x => x.id === sesId)
    const esFuerza = s?.disciplina === 'Fuerza'
    setTareas(prev => prev.map(t => t.id_sesion === sesId ? { ...t, zona_entrenamiento: sigla } : t))
    if (esFuerza) setSesiones(prev => prev.map(x => x.id === sesId ? { ...x, zona_fuerza: sigla } : x))
    await supabase.from('tarea').update({ zona_entrenamiento: sigla }).eq('id_sesion', sesId)
    if (esFuerza) await supabase.from('sesion').update({ zona_fuerza: sigla }).eq('id', sesId)
  }

  // Copia profunda: clona la sesión + sus tareas + prescripciones (distancia/tiempo/reps) + ejercicios.
  const pegarSesion = async (fecha: string, microId: number) => {
    if (!clipboard || ocupado) return
    setOcupado(true)
    try {
      const { data: src } = await supabase.from('sesion').select('*').eq('id', clipboard.id).single()
      if (!src) { setOcupado(false); return }
      const { id: _sid, created_at: _sc, ...rest } = src as any
      const { data: ins, error } = await supabase.from('sesion').insert({
        ...rest, fecha_sesion: fecha, id_microciclo: microId,
        estado: 'Planificada', rpe_reportado: null, duracion_real: null, eliminada: false,
      }).select('id').single()
      if (error || !ins) { alert('Error al pegar la sesión: ' + (error?.message || '')); setOcupado(false); return }

      const { data: srcTareas } = await supabase.from('tarea').select('*').eq('id_sesion', clipboard.id).order('orden', { ascending: true })
      if (srcTareas?.length) {
        const idMap: Record<number, number> = {}
        for (const t of srcTareas as any[]) {
          const { id: _tid, created_at: _tc, ...trest } = t
          const { data: nt } = await supabase.from('tarea').insert({ ...trest, id_sesion: ins.id }).select('id').single()
          if (nt) idMap[t.id] = nt.id
        }
        const oldIds = (srcTareas as any[]).map(t => t.id)
        const [pd, pdur, pr, ej] = await Promise.all([
          supabase.from('p_distancia').select('*').in('id_tarea', oldIds),
          supabase.from('p_duracion').select('*').in('id_tarea', oldIds),
          supabase.from('p_repeticiones').select('*').in('id_tarea', oldIds),
          supabase.from('ejercicios').select('*').in('id_tarea', oldIds),
        ])
        const clonar = async (res: any, tabla: string) => {
          const filas = (res.data || []).map((r: any) => { const { id: _i, created_at: _c, ...rr } = r; return { ...rr, id_tarea: idMap[r.id_tarea] } }).filter((r: any) => r.id_tarea)
          if (filas.length) await supabase.from(tabla).insert(filas)
        }
        await Promise.all([clonar(pd, 'p_distancia'), clonar(pdur, 'p_duracion'), clonar(pr, 'p_repeticiones'), clonar(ej, 'ejercicios')])
      }
      await cargar()
    } catch (e: any) { alert('Error al pegar: ' + e.message) }
    setOcupado(false)
  }

  if (!meso) return <Cargando noExiste={noExiste} />

  const col = C_MESO[meso.tipo] || '#f97316'
  const fechaFin = sumarSemanas(meso.fecha_inicio, meso.duracion_semanas)
  const hoy = hoyISO()
  const estado = hoy < meso.fecha_inicio ? 'Por venir' : hoy >= fechaFin ? 'Terminado' : 'En curso'

  // --- Stats ---
  const uaSemanas = micros.map((mi, i) => ({ label: 'S' + (i + 1), ua: mi.ua_planificada || 0, tipo: mi.tipo }))
  const uaTotal = uaSemanas.reduce((a, s) => a + s.ua, 0)
  const uaPico = Math.max(1, ...uaSemanas.map(s => s.ua))
  const uaMedia = uaSemanas.length ? Math.round(uaTotal / uaSemanas.length) : 0
  const porDisc = DISCIPLINAS.map(d => ({ disc: d, n: sesiones.filter(s => s.disciplina === d).length }))
  const maxDisc = Math.max(1, ...porDisc.map(d => d.n))
  const totalSes = sesiones.length
  const realizadas = sesiones.filter(s => s.estado === 'Realizada').length
  const pctReal = totalSes ? Math.round((realizadas / totalSes) * 100) : 0
  const rpeEst = sesiones.filter(s => s.rpe_estimado != null)
  const rpeReal = sesiones.filter(s => s.rpe_reportado != null)
  const avg = (arr: any[], k: string) => arr.length ? (arr.reduce((a, s) => a + s[k], 0) / arr.length).toFixed(1) : '—'

  const sesDia = (fecha: string) => sesiones.filter(s => s.fecha_sesion === fecha)

  // Unidades de entrenamiento (tareas) con su zona real → distribución por zonas (opción A).
  const sesById: Record<number, any> = {}
  sesiones.forEach(s => { sesById[s.id] = s })
  const unidades = tareas.map(t => {
    const s = sesById[t.id_sesion]; if (!s) return null
    let zona = t.zona_entrenamiento
    if (!zona && s.disciplina === 'Fuerza') zona = s.zona_fuerza
    if (!zona) return null
    return { disc: s.disciplina as string, zona: zona as string }
  }).filter(Boolean) as { disc: string; zona: string }[]
  // Chips de la canvas de periodización (misma forma disc/zona) → fuente alternativa.
  const chips = zonas.map(z => ({ disc: z.disciplina as string, zona: z.zona as string })).filter(c => c.disc && c.zona)
  // Fuente activa según el toggle.
  const datos = fuente === 'chips' ? chips : unidades
  const totalDatos = datos.length
  const sustantivo = fuente === 'chips' ? 'chips' : 'tareas'
  const modelZonas = (disc: string): string[] =>
    disc === 'Fuerza' ? ZONAS_FUERZA.map(z => z.sigla)
      : sistemaZonas === 2 ? ZONAS_RESISTENCIA.map(z => z.sigla)
        : ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7']

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-3 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm transition">← Volver</button>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: col + '30', color: col }}>{meso.tipo}</span>
          <h1 className="font-bold">{meso.objetivo}</h1>
          <button onClick={() => { setEditMode(e => !e); setSelSes(null); setClipboard(null) }}
            className={'text-sm px-3 py-1 rounded-lg transition ml-2 ' + (editMode ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-800 text-gray-300 hover:text-white')}>
            {editMode ? '✓ Listo' : '✏️ Editar'}
          </button>
          <button onClick={() => depId && router.push('/planificacion-visual/' + depId + '/dibujo?editar=1')} className="text-orange-400 hover:text-orange-300 text-sm transition">← Volver al dibujo</button>
        </div>
      </nav>

      <div className="flex gap-6 px-6 py-6 max-w-[1500px] mx-auto">

        {/* ===== CALENDARIO DEL MESOCICLO (principal) ===== */}
        <div className="flex-1 min-w-0">
          {editMode && (
            <div className="mb-2 flex items-center gap-2 text-xs bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1.5">
              {clipboard
                ? <span className="text-orange-300">📋 Copiada: sesión de {clipboard.disciplina}. Pulsa un día para pegarla.</span>
                : <span className="text-gray-400">Modo edición · <b className="text-gray-300">arrastra</b> una sesión para moverla · <b className="text-gray-300">clic</b> para seleccionar (copiar / eliminar)</span>}
              {clipboard && <button onClick={() => setClipboard(null)} className="ml-auto text-gray-400 hover:text-white">✕ Cancelar</button>}
            </div>
          )}
          {/* Cabecera de días */}
          <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: '3rem repeat(7, 1fr)' }}>
            <div />
            {DIAS.map(d => <div key={d} className="text-center text-gray-500 text-xs font-medium">{d}</div>)}
          </div>

          {micros.length === 0 ? (
            <div className="text-center py-20 text-gray-600 bg-gray-900 rounded-2xl border border-gray-800">
              <div className="text-4xl mb-3">📆</div>
              <p className="text-sm">Este mesociclo aún no tiene semanas.</p>
              <button onClick={() => router.push('/mesociclo/' + id)} className="text-orange-400 hover:text-orange-300 text-sm mt-3">Añadir semanas →</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {micros.map((mi, wi) => {
                const cMi = C_MESO[mi.tipo] || col
                return (
                  <div key={mi.id} className="grid gap-2" style={{ gridTemplateColumns: '3rem repeat(7, 1fr)' }}>
                    {/* Etiqueta de semana */}
                    <div className="flex flex-col items-center justify-center rounded-lg border text-center py-1" style={{ borderColor: cMi + '55', backgroundColor: cMi + '15' }}>
                      <span className="text-white font-bold text-sm leading-none">S{wi + 1}</span>
                      <span className="text-gray-400 leading-none mt-0.5" style={{ fontSize: 9 }}>{mi.tipo?.slice(0, 4)}</span>
                    </div>
                    {/* 7 días */}
                    {DIAS.map((_, di) => {
                      const fecha = sumarDias(mi.fecha_inicio, di)
                      const ses = sesDia(fecha)
                      const esHoy = fecha === hoy
                      const cellClick = () => {
                        if (editMode) { if (clipboard) pegarSesion(fecha, mi.id); return }
                        router.push('/planificacion-visual/' + depId + '/semana/' + mi.fecha_inicio)
                      }
                      return (
                        <div key={di}
                          onClick={cellClick}
                          onDragOver={editMode ? (e => e.preventDefault()) : undefined}
                          onDrop={editMode ? (e => { e.preventDefault(); const sid = Number(e.dataTransfer.getData('text/plain')); if (sid) moverSesion(sid, fecha, mi.id) }) : undefined}
                          className={'rounded-lg border p-1.5 min-h-24 flex flex-col gap-1 transition ' +
                            (editMode
                              ? (clipboard ? 'cursor-pointer hover:border-orange-400 hover:bg-orange-500/5 ' : 'cursor-default ')
                              : 'cursor-pointer hover:border-gray-600 ') +
                            (esHoy ? 'border-orange-500' : 'border-gray-800 bg-gray-900/40')}>
                          <span className={'text-xs ' + (esHoy ? 'text-orange-400 font-bold' : 'text-gray-600')}>{Number(fecha.slice(8, 10))}</span>
                          {ses.map(s => {
                            const isSel = editMode && selSes === s.id
                            const zt = tareas.filter(t => t.id_sesion === s.id && t.zona_entrenamiento).map(t => t.zona_entrenamiento)
                            const zs = zt.length ? [...new Set(zt)] : (s.disciplina === 'Fuerza' && s.zona_fuerza ? [s.zona_fuerza] : [])
                            return (
                              <div key={s.id}
                                draggable={editMode}
                                onDragStart={editMode ? (e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', String(s.id)) }) : undefined}
                                onClick={e => {
                                  e.stopPropagation()
                                  if (editMode) { setSelSes(s.id); setSelPos({ x: e.clientX, y: e.clientY }); return }
                                  router.push('/sesion/' + s.id)
                                }}
                                title={zs.length ? zs.map(z => cargaZona(z).nombre).join(', ') : undefined}
                                className={'rounded px-1.5 py-1 text-white transition ' + (editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:brightness-125')}
                                style={{ backgroundColor: (C_DISC[s.disciplina] || '#6b7280') + (s.estado === 'Realizada' ? 'ff' : '55'), borderLeft: '2px solid ' + (C_DISC[s.disciplina] || '#6b7280'), boxShadow: isSel ? '0 0 0 2px #fb923c' : undefined }}>
                                <div className="flex items-center gap-1">
                                  <span style={{ fontSize: 10 }} className="font-medium truncate">{DISC_CORTO[s.disciplina] || s.disciplina?.slice(0, 3)}</span>
                                  {s.origen === 'deportista' && <span style={{ fontSize: 9 }} title="Añadida por el atleta">🙋</span>}
                                  {s.estado === 'Realizada' && <span className="ml-auto text-green-300" style={{ fontSize: 9 }}>✓</span>}
                                </div>
                                {zs.length > 0 && (
                                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                                    {zs.map((z, i) => { const zi = cargaZona(z); return (
                                      <span key={i} className="rounded px-1 font-bold leading-none" style={{ fontSize: 8, color: zi.color, backgroundColor: 'rgba(0,0,0,0.35)' }}>{z}</span>
                                    )})}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* ===== DISTRIBUCIÓN DE ZONAS (desarrollada, bajo el calendario) ===== */}
          <div className="mt-6 bg-gray-900 rounded-2xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-bold text-lg">Distribución de zonas</h2>
                {/* Toggle de fuente: tareas reales vs chips de la canvas */}
                <div className="flex rounded-lg bg-gray-800 p-0.5 text-xs">
                  {([['tareas', 'Tareas'], ['chips', 'Planificado (chips)']] as [typeof fuente, string][]).map(([k, label]) => (
                    <button key={k} onClick={() => setFuente(k)}
                      className={'px-2.5 py-1 rounded-md transition ' + (fuente === k ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>{label}</button>
                  ))}
                </div>
              </div>
              <span className="text-gray-500 text-xs">
                Zonas {sistemaZonas === 2 ? '2' : '1'} · {fuente === 'chips' ? 'chips de la periodización' : 'tareas programadas'}
              </span>
            </div>
            <div className="flex gap-1.5 mb-5 flex-wrap">
              {([['deportes', 'Entre deportes'], ['Natacion', 'Natación'], ['Ciclismo', 'Ciclismo'], ['Carrera', 'Carrera'], ['Fuerza', 'Fuerza']] as [string, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setZonaTab(k)}
                  className={'px-3 py-1.5 rounded-lg text-sm transition ' + (zonaTab === k ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white')}>{label}</button>
              ))}
            </div>
            {zonaTab === 'deportes' ? (
              totalDatos === 0 ? <p className="text-gray-600 text-sm py-4">{fuente === 'chips' ? 'No hay chips en la periodización de este ciclo.' : 'No hay tareas programadas todavía.'}</p> : (
                <div className="flex flex-col gap-2.5">
                  {DISCIPLINAS.map(d => {
                    const n = datos.filter(u => u.disc === d).length
                    const p = totalDatos ? Math.round(n / totalDatos * 100) : 0
                    return (
                      <div key={d} className="flex items-center gap-3">
                        <span className="text-gray-300 text-sm w-24">{d}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: p + '%', backgroundColor: C_DISC[d] }} /></div>
                        <span className="text-gray-500 text-xs w-16 text-right">{n} {sustantivo}</span>
                        <span className="text-white font-bold text-sm w-12 text-right">{p}%</span>
                      </div>
                    )
                  })}
                  <p className="text-gray-600 text-xs mt-1">{totalDatos} {sustantivo} en el ciclo</p>
                </div>
              )
            ) : (() => {
              const unis = datos.filter(u => u.disc === zonaTab)
              const total = unis.length
              const counts: Record<string, number> = {}
              unis.forEach(u => { counts[u.zona] = (counts[u.zona] || 0) + 1 })
              const setZ = modelZonas(zonaTab)
              const extra = Object.keys(counts).filter(z => !setZ.includes(z))
              const rows = [...setZ, ...extra].map(z => ({ zona: z, count: counts[z] || 0, info: cargaZona(z) })).sort((a, b) => a.info.nivel - b.info.nivel)
              return (
                <>
                  <p className="text-gray-500 text-xs mb-3">
                    {total > 0 ? total + ' ' + sustantivo + ' de ' + zonaTab + ' · las zonas a 0% aún no se han ' + (fuente === 'chips' ? 'dibujado' : 'programado') : 'Aún no hay ' + sustantivo + ' de ' + zonaTab + (fuente === 'chips' ? ' en la periodización' : ' programadas') + '. Estas son las zonas del modelo:'}
                  </p>
                  <div className="flex flex-col gap-2">
                    {rows.map(r => {
                      const p = total ? Math.round(r.count / total * 100) : 0
                      return (
                        <div key={r.zona} className={'flex items-center gap-3 ' + (r.count === 0 ? 'opacity-40' : '')}>
                          <span className="text-xs font-bold w-16 px-2 py-1 rounded text-center flex-shrink-0" style={{ backgroundColor: r.info.color + '30', color: r.info.color }}>{r.zona}</span>
                          <span className="text-gray-400 text-xs w-44 truncate hidden sm:block">{r.info.nombre}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: p + '%', backgroundColor: r.info.color }} /></div>
                          <span className="text-gray-500 text-xs w-12 text-right">{r.count}</span>
                          <span className="text-white font-bold text-sm w-12 text-right">{p}%</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* ===== PANEL LATERAL COMPACTO (derecha) ===== */}
        <aside className="w-64 flex-shrink-0 flex flex-col gap-3 text-xs">
          {/* Cabecera */}
          <div className="rounded-xl p-3 border" style={{ borderColor: col + '55', backgroundColor: col + '12' }}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {posicion.total > 0 && <span className="text-gray-400">Meso {posicion.n}/{posicion.total}</span>}
              <span className={'px-1.5 py-0.5 rounded-full ' + (estado === 'En curso' ? 'bg-green-900 text-green-300' : estado === 'Terminado' ? 'bg-gray-700 text-gray-300' : 'bg-blue-900 text-blue-300')} style={{ fontSize: 10 }}>{estado}</span>
            </div>
            <p className="text-gray-400">{meso.fecha_inicio} → {fechaFin}</p>
            <p className="text-gray-400">{meso.duracion_semanas} sem · Intensidad {meso.intensidad_relativa || '—'}/10</p>
          </div>

          {/* Carga */}
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
            <p className="font-bold text-gray-300 mb-2">Carga del ciclo</p>
            <div className="flex items-end gap-1 mb-2" style={{ height: 44 }}>
              {uaSemanas.map((s, i) => (
                <div key={i} className="flex-1 rounded-t" style={{ height: Math.max(2, (s.ua / uaPico) * 40), backgroundColor: (C_MESO[s.tipo] || col) + 'cc' }} title={s.label + ': ' + s.ua + ' UA'} />
              ))}
            </div>
            <div className="flex justify-between text-gray-500">
              <span><span className="text-white font-bold">{uaTotal.toLocaleString()}</span> total</span>
              <span><span className="text-white font-bold">{uaMedia}</span> media</span>
              <span><span className="text-white font-bold">{uaPico}</span> pico</span>
            </div>
          </div>

          {/* Disciplina */}
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
            <p className="font-bold text-gray-300 mb-2">Por disciplina <span className="text-gray-600 font-normal">· {totalSes} ses.</span></p>
            <div className="flex flex-col gap-1.5">
              {porDisc.map(d => (
                <div key={d.disc} className="flex items-center gap-2">
                  <span className="text-gray-500 w-8" style={{ fontSize: 10 }}>{DISC_CORTO[d.disc]}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: (d.n / maxDisc * 100) + '%', backgroundColor: C_DISC[d.disc] }} />
                  </div>
                  <span className="text-white font-bold w-4 text-right" style={{ fontSize: 10 }}>{d.n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cumplimiento */}
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
            <p className="font-bold text-gray-300 mb-2">Cumplimiento</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-green-400 leading-none">{pctReal}%</p>
                <p className="text-gray-500 mt-0.5" style={{ fontSize: 9 }}>{realizadas}/{totalSes} hechas</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-white leading-none">{totalSes}</p>
                <p className="text-gray-500 mt-0.5" style={{ fontSize: 9 }}>sesiones</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-orange-400 leading-none">{avg(rpeEst, 'rpe_estimado')}</p>
                <p className="text-gray-500 mt-0.5" style={{ fontSize: 9 }}>RPE est.</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-orange-400 leading-none">{avg(rpeReal, 'rpe_reportado')}</p>
                <p className="text-gray-500 mt-0.5" style={{ fontSize: 9 }}>RPE real</p>
              </div>
            </div>
          </div>
        </aside>

      </div>

      {/* ===== POPOVER de sesión seleccionada (modo edición) ===== */}
      {editMode && selSes != null && (() => {
        const s = sesiones.find(x => x.id === selSes)
        if (!s) return null
        const zt = [...new Set(tareas.filter(t => t.id_sesion === s.id && t.zona_entrenamiento).map(t => t.zona_entrenamiento))]
        const zonasActuales = zt.length ? zt : (s.disciplina === 'Fuerza' && s.zona_fuerza ? [s.zona_fuerza] : [])
        const opciones = modelZonas(s.disciplina)
        const sinTareas = zt.length === 0 && !(s.disciplina === 'Fuerza' && s.zona_fuerza)
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800
        return (
          <div className="fixed inset-0 z-50" onClick={() => setSelSes(null)}>
            <div className="absolute bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-3 w-64"
              style={{ left: Math.min(selPos.x, vw - 272), top: Math.min(selPos.y, vh - 240) }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: (C_DISC[s.disciplina] || '#6b7280') + '30', color: C_DISC[s.disciplina] || '#9ca3af' }}>{s.disciplina}</span>
                <button onClick={() => setSelSes(null)} className="text-gray-500 hover:text-white text-sm leading-none">✕</button>
              </div>
              <p className="text-gray-400 text-xs mb-1.5">Cambiar zona{sistemaZonas === 2 && s.disciplina !== 'Fuerza' ? ' (Zonas 2)' : ''}</p>
              {sinTareas ? (
                <p className="text-gray-600 text-xs mb-3">Esta sesión no tiene tareas con zona. Añádelas desde la sesión.</p>
              ) : (
                <div className="flex flex-wrap gap-1 mb-3">
                  {opciones.map(z => {
                    const zi = cargaZona(z); const act = zonasActuales.includes(z)
                    return (
                      <button key={z} onClick={() => cambiarZona(s.id, z)}
                        className="rounded px-1.5 py-1 font-bold border transition hover:brightness-125"
                        style={{ fontSize: 10, color: zi.color, borderColor: act ? zi.color : 'transparent', backgroundColor: zi.color + (act ? '45' : '18') }}
                        title={zi.nombre}>{z}</button>
                    )
                  })}
                </div>
              )}
              <div className="flex gap-2 border-t border-gray-700 pt-2">
                <button onClick={() => copiarSesion(s)} className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 rounded py-1.5 transition">⧉ Copiar</button>
                <button onClick={() => eliminarSesion(s.id)} className="flex-1 text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded py-1.5 transition">🗑 Eliminar</button>
              </div>
            </div>
          </div>
        )
      })()}
    </main>
  )
}
