'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { estimarDuraciones, duracionSesionTexto } from '@/lib/duracion-carga'
import type { TestsDeportista } from '@/lib/duracion'
import { analizarWellness } from '@/lib/wellness-analisis'
import { cargaZona } from '@/lib/zonas'
import InvitacionesClub from '@/components/InvitacionesClub'

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DISC_HEX: Record<string, string> = { Natacion: '#3b82f6', 'Natación': '#3b82f6', Ciclismo: '#eab308', Carrera: '#22c55e', Fuerza: '#ef4444', Brick: '#a855f7' }
const fmt = (d: Date) => d.toISOString().split('T')[0]
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const lunesDe = (d: Date) => { const off = (d.getDay() + 6) % 7; return addDays(d, -off) }

export default function DashboardDeportista() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<any>(null)
  const [deportista, setDeportista] = useState<any>(null)
  const [sesionesHoy, setSesionesHoy] = useState<any[]>([])
  const [tareasPorSesion, setTareasPorSesion] = useState<Record<number, any[]>>({})
  const [ultimoWellness, setUltimoWellness] = useState<any>(null)
  const [analisis, setAnalisis] = useState<any>(null)
  const [anamnesisPendiente, setAnamnesisPendiente] = useState(false)
  const [semana, setSemana] = useState<any[]>([])
  const [cumplimiento, setCumplimiento] = useState<{ pct: number; realizadas: number; planificadas: number } | null>(null)
  const [semanaPlan, setSemanaPlan] = useState(0)
  const [proximaComp, setProximaComp] = useState<any>(null)

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(p)
      if (p?.rol !== 'deportista') { router.push('/dashboard'); return }
      const { data: dep } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
      setDeportista(dep)
      if (!dep) return

      const hoy = fmt(new Date())
      const monday = lunesDe(new Date())
      const sunday = addDays(monday, 6)
      const desde = fmt(addDays(new Date(), -27))
      const hasta = fmt(sunday)

      const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
      const macroIds = (macros || []).map((m: any) => m.id)
      const { data: mesos } = macroIds.length ? await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds) : { data: [] }
      const mesoIds = (mesos || []).map((m: any) => m.id)
      const { data: micros } = mesoIds.length ? await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds) : { data: [] }
      const microIds = (micros || []).map((m: any) => m.id)

      const selSes = 'id, disciplina, fecha_sesion, estado, rpe_estimado, duracion_minutos, notas_entrenador'
      let sesiones: any[] = []
      if (microIds.length) {
        const { data } = await supabase.from('sesion').select(selSes)
          .in('id_microciclo', microIds)
          .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
          .or('eliminada.is.null,eliminada.eq.false')
        sesiones = data || []
      }
      // Sesiones libres (sin microciclo): sueltas o añadidas por el propio deportista.
      // Antes no salían en el dashboard; ahora se cargan igual que las del plan.
      const { data: libres } = await supabase.from('sesion').select(selSes)
        .eq('id_deportista', dep.id).is('id_microciclo', null)
        .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
        .or('eliminada.is.null,eliminada.eq.false')
      if (libres?.length) sesiones = [...sesiones, ...libres]

      // Sesiones de hoy + duración estimada + tareas para el preview de series
      const sesHoy = sesiones.filter(s => s.fecha_sesion === hoy)
      const [tc, tn, tci] = await Promise.all([
        supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
        supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
        supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
      ])
      const testsDep: TestsDeportista = { vam: tc.data?.[0]?.vam, css: tn.data?.[0]?.css, ftp: tci.data?.[0]?.ftp }
      const durs = await estimarDuraciones(supabase, sesHoy.map(s => s.id), testsDep)
      setSesionesHoy(sesHoy.map(s => ({ ...s, dur_estimada: durs[s.id] })))

      const idsHoy = sesHoy.map(s => s.id)
      if (idsHoy.length) {
        const { data: tar } = await supabase.from('tarea').select('id, id_sesion, zona_entrenamiento, series, disciplina, orden').in('id_sesion', idsHoy).order('orden')
        const tarIds = (tar || []).map((t: any) => t.id)
        const [pd, pdur] = await Promise.all([
          tarIds.length ? supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tarIds) : { data: [] },
          tarIds.length ? supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tarIds) : { data: [] },
        ])
        const mapa: Record<number, any[]> = {}
        ;(tar || []).forEach((t: any) => {
          const step = { ...t, metros: (pd.data || []).find((x: any) => x.id_tarea === t.id)?.metros_planeados, seg: (pdur.data || []).find((x: any) => x.id_tarea === t.id)?.tiempo_planeado }
          ;(mapa[t.id_sesion] ||= []).push(step)
        })
        setTareasPorSesion(mapa)
      }

      // Semana de un vistazo
      setSemana(LETRAS.map((letra, i) => {
        const f = fmt(addDays(monday, i))
        return { f, letra, esHoy: f === hoy, sesiones: sesiones.filter(s => s.fecha_sesion === f) }
      }))

      // Cumplimiento últimos 28 días (hasta hoy) + sesiones planificadas esta semana
      const ult28 = sesiones.filter(s => s.fecha_sesion >= desde && s.fecha_sesion <= hoy)
      const realizadas = ult28.filter(s => s.estado === 'Realizada').length
      setCumplimiento(ult28.length ? { pct: Math.round(realizadas / ult28.length * 100), realizadas, planificadas: ult28.length } : null)
      setSemanaPlan(sesiones.filter(s => s.fecha_sesion >= fmt(monday) && s.fecha_sesion <= hasta).length)

      // Wellness (14 registros → readiness) + próxima competición
      const { data: wells } = await supabase.from('wellness').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(14)
      setUltimoWellness(wells?.[0] || null)
      setAnalisis(analizarWellness(wells || []))
      const { data: comp } = await supabase.from('competicion').select('nombre, fecha, tipo').eq('id_deportista', dep.id).gte('fecha', hoy).order('fecha').limit(1)
      setProximaComp(comp?.[0] || null)

      if (dep.id_entrenador) {
        const { data: an } = await supabase.from('anamnesis').select('estado').eq('id_deportista', dep.id).maybeSingle()
        setAnamnesisPendiente(!an || an.estado !== 'enviada')
      }
    }
    cargar()
  }, [])

  const cerrarSesion = async () => { await supabase.auth.signOut(); router.push('/') }

  const wellnessHref = deportista ? '/wellness/' + deportista.id : '#'
  const hoyStr = fmt(new Date())
  const wellnessHoy = ultimoWellness?.fecha === hoyStr
  const semanasHastaComp = proximaComp ? Math.max(0, Math.round((new Date(proximaComp.fecha).getTime() - Date.now()) / (7 * 24 * 3600 * 1000))) : null

  const stepTexto = (t: any) => {
    const cant = t.metros ? t.metros + ' m' : t.seg ? (t.seg >= 60 ? Math.round(t.seg / 60) + ' min' : t.seg + ' s') : ''
    const series = t.series && t.series > 1 ? t.series + '× ' : ''
    return (series + cant).trim() || 'Bloque'
  }

  const modulos = [
    { icon: '📅', titulo: 'Sesiones', href: '/mis-sesiones' },
    { icon: '💚', titulo: 'Wellness', href: wellnessHref },
    { icon: '🏋️', titulo: 'Tests', href: '/mis-tests' },
    { icon: '📊', titulo: 'Análisis', href: '/mis-analisis' },
    { icon: '💬', titulo: 'Chat', href: deportista ? '/chat/' + deportista.id : '#' },
    { icon: '🤝', titulo: 'Comunidad', href: '/comunidad' },
    { icon: '🗓', titulo: 'Disponib.', href: '/disponibilidad' },
    { icon: '👤', titulo: 'Perfil', href: '/perfil' },
  ]

  if (!perfil) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="text-gray-400 hover:text-white text-sm transition">Cerrar sesión</button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-2xl font-bold">Hola, {perfil?.nombre} 👋</h2>
          <span className="text-gray-600 text-xs">{new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>

        {/* Invitaciones a un club (fuera del módulo social: se aceptan desde aquí) */}
        <InvitacionesClub />

        {/* Anamnesis pendiente */}
        {anamnesisPendiente && (
          <button onClick={() => router.push('/anamnesis')}
            className="w-full bg-orange-950 border-2 border-orange-500 rounded-xl p-4 mb-4 text-left hover:bg-orange-900 transition flex justify-between items-center">
            <div>
              <p className="text-orange-300 font-bold">📋 Completa tu anamnesis</p>
              <p className="text-orange-400/80 text-sm mt-0.5">Tu entrenador la necesita para planificar tu preparación.</p>
            </div>
            <span className="text-orange-400 text-2xl ml-3">→</span>
          </button>
        )}

        {/* Aviso sin entrenador */}
        {deportista && !deportista.id_entrenador && (
          <div className="bg-yellow-950 border-2 border-yellow-600 rounded-xl p-4 mb-4">
            <p className="font-bold text-yellow-300 mb-1">⚠️ No tienes entrenador asignado</p>
            <p className="text-yellow-400/90 text-sm mb-2">Vincúlate con el código de tu entrenador para recibir tu planificación.</p>
            <button onClick={() => router.push('/perfil')} className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">Ir a Mi perfil →</button>
          </div>
        )}

        {/* ===== BLOQUE SUPERIOR: recordatorio wellness ⇄ disposición ===== */}
        {!wellnessHoy ? (
          <button onClick={() => router.push(wellnessHref)}
            className="w-full flex items-center gap-3 bg-green-500/10 border-[1.5px] border-green-500 rounded-2xl p-3.5 mb-4 text-left hover:bg-green-500/15 transition">
            <div className="w-11 h-11 rounded-full bg-green-500/15 flex items-center justify-center text-2xl flex-shrink-0">💚</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-green-400">Aún no has registrado tu wellness</p>
              <p className="text-gray-400 text-sm mt-0.5">Rellénalo para ver tu disposición de hoy y que tu entrenador ajuste la carga.</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded">⏰ pendiente</span>
              <span className="bg-green-500 text-green-950 text-xs font-extrabold px-2.5 py-1.5 rounded-lg">Registrar →</span>
            </div>
          </button>
        ) : analisis?.readiness ? (
          <button onClick={() => router.push(wellnessHref)}
            className="w-full flex items-center gap-3 rounded-2xl p-3.5 mb-4 text-left transition"
            style={{ backgroundColor: analisis.readiness.color + '14', border: '1px solid ' + analisis.readiness.color + '55' }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: analisis.readiness.color + '22' }}>
              {analisis.readiness.nivel === 'optimo' ? '🟢' : analisis.readiness.nivel === 'vigilar' ? '🟡' : analisis.readiness.nivel === 'fatiga' ? '🟠' : '🔴'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold" style={{ color: analisis.readiness.color }}>{analisis.readiness.label}</p>
              <p className="text-gray-400 text-sm mt-0.5">{analisis.readiness.recomendacion}</p>
            </div>
            <span className="text-[10px] flex-shrink-0" style={{ color: analisis.readiness.color, backgroundColor: analisis.readiness.color + '18', padding: '4px 7px', borderRadius: 8 }}>Wellness ✓</span>
          </button>
        ) : (
          <div className="w-full flex items-center gap-3 bg-green-500/10 border border-green-500/40 rounded-2xl p-3.5 mb-4">
            <span className="text-2xl">💚</span>
            <p className="text-green-300 text-sm flex-1">Wellness de hoy registrado. Sigue registrándolo unos días para ver tu disposición.</p>
          </div>
        )}

        {/* ===== HERO: sesión de hoy ===== */}
        {sesionesHoy.length > 0 ? (
          <div className="flex flex-col gap-3 mb-4">
            {sesionesHoy.map(s => {
              const col = DISC_HEX[s.disciplina] || '#6b7280'
              const steps = tareasPorSesion[s.id] || []
              return (
                <div key={s.id} className="bg-gray-900 rounded-2xl border-[1.5px] border-orange-500 p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full">🔥 HOY</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: col + '33', color: col }}>{s.disciplina}</span>
                    <span className="text-gray-400 text-xs">{duracionSesionTexto(s.duracion_minutos, s.dur_estimada)}</span>
                    <span className="text-gray-400 text-xs">· RPE {s.rpe_estimado || '—'}</span>
                  </div>
                  {s.notas_entrenador && <p className="text-gray-500 text-xs italic mb-3">"{s.notas_entrenador}"</p>}
                  {steps.length > 0 && (
                    <div className="flex flex-col gap-1.5 mb-3">
                      {steps.map((t: any) => {
                        const zi = t.zona_entrenamiento ? cargaZona(t.zona_entrenamiento) : null
                        return (
                          <div key={t.id} className="flex items-center gap-2 text-sm bg-gray-800/50 rounded-lg px-2.5 py-1.5">
                            <span className="text-gray-200 font-medium">{stepTexto(t)}</span>
                            {zi && <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: zi.color, backgroundColor: zi.color + '22' }}>{t.zona_entrenamiento}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <button onClick={() => router.push('/sesion/' + s.id)}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition">
                    Empezar sesión →
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 mb-4 text-center">
            <div className="text-4xl mb-1">😴</div>
            <p className="font-medium text-white">Hoy es día de descanso</p>
            <p className="text-gray-500 text-sm">Recupera bien para la próxima sesión.</p>
          </div>
        )}

        {/* ===== SEMANA DE UN VISTAZO ===== */}
        {semana.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Esta semana</p>
            <div className="grid grid-cols-7 gap-1.5">
              {semana.map(d => (
                <button key={d.f} onClick={() => router.push('/mis-sesiones')}
                  className={'flex flex-col items-center gap-1.5 rounded-xl py-2 border transition ' + (d.esHoy ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900')}>
                  <span className={'text-xs font-bold ' + (d.esHoy ? 'text-orange-400' : 'text-gray-400')}>{d.letra}</span>
                  <div className="flex gap-0.5 items-center h-2">
                    {d.sesiones.length === 0
                      ? <span className="w-1.5 h-1.5 rounded-full border border-gray-700" />
                      : d.sesiones.slice(0, 3).map((s: any, i: number) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DISC_HEX[s.disciplina] || '#6b7280', opacity: s.estado === 'Realizada' ? 1 : 0.5 }} />
                      ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== MINI-TARJETAS ===== */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {proximaComp && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-3.5">
              <p className="text-gray-500 text-[10px] mb-1">🏁 Próxima carrera</p>
              <p className="text-white font-bold text-sm leading-tight">{proximaComp.nombre}</p>
              <p className="text-orange-400 text-xs font-bold mt-1">{semanasHastaComp === 0 ? 'esta semana' : 'en ' + semanasHastaComp + ' sem'}</p>
            </div>
          )}
          <div className={'bg-gray-900 rounded-2xl border border-gray-800 p-3.5 ' + (!proximaComp ? 'col-span-2' : '')}>
            <p className="text-gray-500 text-[10px] mb-1">Cumplimiento (4 sem)</p>
            {cumplimiento ? (
              <>
                <p className="text-green-400 font-extrabold text-xl leading-none">{cumplimiento.pct}%</p>
                <p className="text-gray-500 text-xs mt-1">{cumplimiento.realizadas}/{cumplimiento.planificadas} hechas · {semanaPlan} planif. esta semana</p>
              </>
            ) : <p className="text-gray-600 text-sm">Sin sesiones aún</p>}
          </div>
        </div>

        {/* ===== AÑADIR SESIÓN NO PROGRAMADA (entrada — flujo completo próximamente) ===== */}
        <button onClick={() => router.push('/mis-sesiones')}
          className="w-full border border-dashed border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded-xl py-3 text-sm transition mb-5">
          ＋ Añadir una sesión que vas a hacer
        </button>

        {/* ===== MÓDULOS COMPACTOS ===== */}
        <div className="grid grid-cols-4 gap-2">
          {modulos.map(m => (
            <button key={m.titulo} onClick={() => router.push(m.href)}
              className="flex flex-col items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl py-3 hover:border-gray-600 transition">
              <span className="text-xl">{m.icon}</span>
              <span className="text-gray-400 text-[11px]">{m.titulo}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
