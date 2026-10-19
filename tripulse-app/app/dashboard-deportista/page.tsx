'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import AvisoMaterial from '@/components/AvisoMaterial'
import DeTuReloj from '@/components/DeTuReloj'
import AvisosDirector from '@/components/AvisosDirector'
import EtiquetaCambiada from '@/components/EtiquetaCambiada'
import Cargando from '@/components/Cargando'
import { usuarioActual } from '@/lib/sesion'
import { duracionesDe, duracionSesionTexto } from '@/lib/duracion-carga'
import { limpiar } from '@/lib/copiar-sesion'
import type { TestsDeportista } from '@/lib/duracion'
import { analizarWellness } from '@/lib/wellness-analisis'

import { cargaDeTarea } from '@/lib/prescripcion-zona'
import InvitacionesClub from '@/components/InvitacionesClub'
import OnboardingDeportista from '@/components/OnboardingDeportista'
import { altaCompleta } from '@/lib/anamnesis-datos'
import { cargarReferencias } from '@/lib/referencia-zona'
import { vivas } from '@/lib/papelera'
import { hoyISO, lunesDe, sumarDias } from '@/lib/fechas'
import { ResumenDeportista } from '@/components/ResumenSemanal'
import AvisoConectarReloj, { useRelojConectado } from '@/components/AvisoConectarReloj'
import OfertaTutorial from '@/components/tutorial/OfertaTutorial'
import { useTutorial } from '@/components/tutorial/TutorialProvider'
import { useConsejos } from '@/components/tutorial/useConsejos'
import { consejosDeHoy } from '@/lib/consejos'
import { hayBloques, repeticionTexto } from '@/lib/bloques-tarea'
import { colorDisciplina } from '@/lib/disciplinas'
import { leerAnamnesis } from '@/lib/anamnesis-vigente'

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
/* Los días se manejan como CADENAS con lib/fechas, no como `Date`: aquí había
   un `addDays` y un `lunesDe` propios —el tercero de la app, y el mismo nombre
   que el bueno— además del `toISOString()` que de madrugada enseñaba el día de
   ayer como «hoy». `hoyISO` es el único que mira el reloj, y mira el LOCAL,
   que es el día que ve el atleta. */
const CLAVE_PANEL = 'tp-panel-'
/* Lo que llega anidado en cada tarea de hoy: sirve para la duración y no viaja
   a la tarjeta. */
const ANIDADO_EN_TAREA = new Set(['sesion', 'p_distancia', 'p_duracion', 'ejercicios'])

/* Cabecera de un bloque plegable. El título entero es el botón: en móvil se pulsa
   con el pulgar sin tener que apuntar a un icono de 12 px. `resumen` es lo que se
   sigue viendo con el bloque cerrado, para que plegarlo no sea perder el dato. */
function Cabecera({ titulo, resumen, abierto, onClick }: { titulo: string; resumen?: string; abierto: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-3 text-left mb-2">
      <span className="flex items-baseline gap-2 min-w-0">
        <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide flex-shrink-0">{titulo}</span>
        {!abierto && resumen && <span className="text-gray-600 text-[11px] truncate">{resumen}</span>}
      </span>
      <span className={'text-gray-600 text-xs flex-shrink-0 tp-chev' + (abierto ? ' open' : '')}>▼</span>
    </button>
  )
}

export default function DashboardDeportista() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<any>(null)
  /* Si ya tiene reloj. Con `null` mientras se mira, para que el aviso no le
     parpadee en la cara a quien sí lo tiene. */
  const relojConectado = useRelojConectado()
  const [deportista, setDeportista] = useState<any>(null)
  const [sesionesHoy, setSesionesHoy] = useState<any[]>([])
  const [tareasPorSesion, setTareasPorSesion] = useState<Record<number, any[]>>({})
  const [ultimoWellness, setUltimoWellness] = useState<any>(null)
  const [analisis, setAnalisis] = useState<any>(null)
  const [anamnesisPendiente, setAnamnesisPendiente] = useState(false)
  const [altaHecha, setAltaHecha] = useState(false)
  const [tienePlan, setTienePlan] = useState(false)
  const [semana, setSemana] = useState<any[]>([])
  const [cumplimiento, setCumplimiento] = useState<{ pct: number; realizadas: number; planificadas: number } | null>(null)
  const [semanaPlan, setSemanaPlan] = useState(0)
  const [proximaComp, setProximaComp] = useState<any>(null)
  // Qué bloques ha plegado el deportista. Solo los informativos: el wellness y la
  // sesión de hoy son la razón de abrir la app y no se pliegan (además, si escondiera
  // el wellness y dejara de rellenarlo, el entrenador se queda sin su única entrada
  // subjetiva). Vive en el navegador porque es una preferencia, no un dato: al cambiar
  // de móvil vuelve a verlo todo abierto, que es el estado sano por defecto.
  const [plegados, setPlegados] = useState<Record<string, boolean>>({})

  /* Sale del efecto para poder volver a llamarla: el checklist la usa cuando el
     atleta acaba de vincularse con un entrenador. Antes eso era un
     `location.reload()`. */
  const cargar = useCallback(async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      /* El perfil y la ficha solo necesitan saber quién eres: a la vez. */
      const [{ data: p }, { data: dep }] = await Promise.all([
        supabase.from('perfiles').select('*').eq('id', user.id).single(),
        supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle(),
      ])
      setPerfil(p)
      if (p?.rol !== 'deportista') { router.push('/dashboard'); return }
      setDeportista(dep)
      if (!dep) return

      // Se lee aquí y no en el useState inicial porque la página también se renderiza
      // en el servidor, donde no hay localStorage. No hay parpadeo: los bloques
      // plegables no aparecen hasta que estos mismos datos han cargado.
      try {
        const guardado = localStorage.getItem(CLAVE_PANEL + dep.id)
        if (guardado) setPlegados(JSON.parse(guardado))
      } catch { /* preferencia ilegible: se ignora y se ve todo abierto */ }

      const hoy = hoyISO()
      const monday = lunesDe(hoy)
      const desde = sumarDias(hoy, -27)
      const hasta = sumarDias(monday, 6)

      /* Aquí había una cadena de tres saltos —macrociclo → mesociclo →
         microciclo— para acabar preguntando por las sesiones de un rango de
         fechas. Desde la Fase A no hace falta ninguno: la sesión lleva su
         `id_deportista`, así que las del plan y las libres son UNA consulta en
         vez de dos ramas.
         Y con eso desaparece el fallo que ya se parcheó aquí: las libres iban
         por su lado porque las del plan cortaban si no había microciclos. */
      /* TODA LA PORTADA EN UNA RONDA. Eran siete esperas en fila después de
         saber quién eres: las sesiones, la duración de las de hoy (que eran otras
         cuatro consultas encadenadas), sus tareas, sus metros, el wellness, la
         competición y la anamnesis. Es lo primero que ve el atleta al abrir la
         app, y en el móvil cada espera son 200-300 ms. Ninguna necesitaba a la
         anterior: las tareas de hoy se piden por la fecha de su sesión, no por
         sus ids, y traen dentro lo que cuelga de ellas. */
      const selSes = 'id, disciplina, fecha_sesion, estado, rpe_estimado, duracion_minutos, duracion_real, notas_entrenador, cambiada_por'
      const [macros, ses, refs, tarHoy, { data: wells }, { data: comp }, { data: an }] = await Promise.all([
        supabase.from('macrociclo').select('id').eq('id_deportista', dep.id).limit(1),
        // `duracion_real` va en el SELECT o el arreglo no sirve de nada: sin
        // pedirla, duracionSesionTexto sigue enseñando lo planificado.
        vivas(supabase.from('sesion').select(selSes).eq('id_deportista', dep.id)
          .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)),
        cargarReferencias(supabase, dep.id),
        supabase.from('tarea')
          .select('id, id_sesion, zona_entrenamiento, zona_copia, series, disciplina, orden, descanso_segundos, bloques, descanso_bloques_segundos, formato, formato_config, sesion!inner(fecha_sesion), p_distancia(id_tarea, metros_planeados), p_duracion(id_tarea, tiempo_planeado), ejercicios(id_tarea, repeticiones, repeticiones_max, series_detalle, cardio_modo, cardio_medida, cardio_valor, cardio_zona, medida, cantidad, orden)')
          .eq('id_deportista', dep.id).eq('sesion.fecha_sesion', hoy).order('orden'),
        // Wellness (14 registros → readiness) + próxima competición
        supabase.from('wellness').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(14),
        supabase.from('competicion').select('nombre, fecha, tipo').eq('id_deportista', dep.id).gte('fecha', hoy).order('fecha').limit(1),
        // Anamnesis: cargar SIEMPRE (también para el deportista que aún no tiene entrenador),
        // para que el checklist de primeros pasos la muestre como paso pendiente.
        // Antes solo se leía `estado`, que responde a «¿está la anamnesis larga
        // enviada?». El alta corta deja la fila en 'borrador' a propósito, así que
        // por ahí parecía que no había nada. Se traen los campos que de verdad
        // hacen falta y se decide por ellos.
        leerAnamnesis(supabase, dep.id,
          'estado, volumen_semanal, dias_semana, nivel_competitivo, declaracion_responsabilidad'),
      ])

      setTienePlan(!!macros.data?.length)
      const sesiones: any[] = ses.data || []
      const sesHoy = sesiones.filter(s => s.fecha_sesion === hoy)
      const testsDep: TestsDeportista = refs.tests

      /* La duración estimada sale de la MISMA cuenta que estimarDuraciones
         (lib/duracion-carga), con las tareas que ya han llegado. */
      const filasHoy = (tarHoy.data || []) as any[]
      const hijas = (k: string) => filasHoy.flatMap(t => Array.isArray(t[k]) ? t[k] : t[k] ? [t[k]] : [])
      const durs = duracionesDe(sesHoy.map(s => s.id), filasHoy, hijas('p_distancia'), hijas('p_duracion'), hijas('ejercicios'), testsDep)
      setSesionesHoy(sesHoy.map(s => ({ ...s, dur_estimada: durs[s.id] })))

      const mapa: Record<number, any[]> = {}
      const primera = (x: any) => (Array.isArray(x) ? x[0] : x) || null
      filasHoy.forEach(f => {
        const step = { ...limpiar(f, ANIDADO_EN_TAREA), metros: primera(f.p_distancia)?.metros_planeados, seg: primera(f.p_duracion)?.tiempo_planeado }
        ;(mapa[f.id_sesion] ||= []).push(step)
      })
      setTareasPorSesion(mapa)

      // Semana de un vistazo
      setSemana(LETRAS.map((letra, i) => {
        const f = sumarDias(monday, i)
        return { f, letra, esHoy: f === hoy, sesiones: sesiones.filter(s => s.fecha_sesion === f) }
      }))

      // Cumplimiento últimos 28 días (hasta hoy) + sesiones planificadas esta semana
      const ult28 = sesiones.filter(s => s.fecha_sesion >= desde && s.fecha_sesion <= hoy)
      const realizadas = ult28.filter(s => s.estado === 'Realizada').length
      setCumplimiento(ult28.length ? { pct: Math.round(realizadas / ult28.length * 100), realizadas, planificadas: ult28.length } : null)
      setSemanaPlan(sesiones.filter(s => s.fecha_sesion >= monday && s.fecha_sesion <= hasta).length)

      setUltimoWellness(wells?.[0] || null)
      setAnalisis(analizarWellness(wells || []))
      setProximaComp(comp?.[0] || null)
      setAnamnesisPendiente(!an || an.estado !== 'enviada')
      setAltaHecha(altaCompleta(an))
  }, [router])

  useEffect(() => { cargar() }, [cargar])

  const cerrarSesion = async () => { await supabase.auth.signOut(); router.push('/') }

  const abierto = (clave: string) => !plegados[clave]
  const alternar = (clave: string) => setPlegados(prev => {
    const siguiente = { ...prev, [clave]: !prev[clave] }
    if (deportista) {
      try { localStorage.setItem(CLAVE_PANEL + deportista.id, JSON.stringify(siguiente)) } catch { /* sin sitio o modo privado: se pliega igual, solo no se recuerda */ }
    }
    return siguiente
  })

  const wellnessHref = deportista ? '/wellness/' + deportista.id : '#'
  const hoyStr = hoyISO()
  const wellnessHoy = ultimoWellness?.fecha === hoyStr
  const semanasHastaComp = proximaComp ? Math.max(0, Math.round((new Date(proximaComp.fecha).getTime() - Date.now()) / (7 * 24 * 3600 * 1000))) : null

  const stepTexto = (t: any) => {
    const cant = t.metros ? t.metros + ' m' : t.seg ? (t.seg >= 60 ? Math.round(t.seg / 60) + ' min' : t.seg + ' s') : ''
    /* En bloques se lee «3 × (2 × 400 m)»: sin los paréntesis, el atleta vería
       seis 400 seguidos y se saltaría el descanso largo. El texto es de
       lib/bloques-tarea, como la cuenta. */
    if (cant && hayBloques(t)) return repeticionTexto(t, cant)
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

  /* El wellness cambia de sitio según su estado, y es a propósito:
     - PENDIENTE → arriba del todo, porque es una tarea (y es el dato que el
       entrenador necesita para ajustar la carga de hoy).
     - YA REGISTRADO → debajo de la sesión, porque entonces solo es un estado y no
       tiene por qué empujar hacia abajo lo que el deportista ha venido a hacer. */
  const bloqueWellness = !wellnessHoy ? (
    /* Este botón dice "Registrar", así que abre el formulario directamente.
       El de abajo (cuando ya está registrado) solo va a consultar. */
    <button onClick={() => router.push(wellnessHref + '?registrar=1')}
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
  )

  /* El consejo del tutorial (lib/consejos): lo que su entrenador le ha escrito y
     no ha leído. Solo se pregunta si le salen consejos: a quien no, ni una consulta. */
  const conConsejos = !!useTutorial()?.consejosActivos
  const [sinLeer, setSinLeer] = useState(0)
  const depId: number | null = deportista?.id ?? null
  const conEntrenador = !!deportista?.id_entrenador
  useEffect(() => {
    if (!conConsejos || !depId || !conEntrenador) return
    let vivo = true
    supabase.from('mensajes').select('id', { count: 'exact', head: true })
      .eq('id_deportista', depId).eq('autor', 'entrenador').eq('leido', false)
      .then(({ count }) => { if (vivo) setSinLeer(count ?? 0) })
    return () => { vivo = false }
  }, [conConsejos, depId, conEntrenador])
  useConsejos('d-hoy', conConsejos && depId ? consejosDeHoy({ id: depId, sinLeer }) : null)

  if (!perfil) return <Cargando />

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

        {/* Que exista. En su aplicación no había una sola línea que se lo dijera,
            y la conexión vive tres niveles abajo: «Más» → Mi perfil → bajar. */}
        <OfertaTutorial className="mb-4" />

        <div data-guia="dhoy.reloj" className="empty:hidden"><AvisoConectarReloj conectado={relojConectado} className="mb-4" /></div>

        {/* El material que toca cambiar. Solo sale si hay algo que decir: un aviso
            que esta siempre enseña a no leerlos. */}
        <AvisoMaterial idDeportista={deportista?.id} className="mb-4" />

        {/* Lo que su reloj trae y falta por apuntar: un RPE, completar una sesión
            cerrada a mano o un entreno fuera del plan. Solo sale si hay algo. */}
        <DeTuReloj idDeportista={deportista?.id} className="mb-4" />

        {/* Si el director de su entrenador ha cambiado algo de su plan, o su
            entrenador le ha abierto el plan a alguien: se lo decimos aquí, con
            quién lo hizo. Solo sale si hay algo. */}
        <AvisosDirector papel="deportista" className="mb-4" />

        {/* Invitaciones a un club (fuera del módulo social: se aceptan desde aquí) */}
        <InvitacionesClub />

        {/* Primeros pasos. Los pasos que cuentan son los que el atleta puede hacer
            solo (contarme de él, crear su plan); el entrenador va aparte porque
            depende de un tercero y antes dejaba la lista incompleta para siempre. */}
        <div data-guia="dhoy.primeros" className="empty:hidden">
          <OnboardingDeportista deportista={deportista} altaHecha={altaHecha}
            anamnesisPendiente={anamnesisPendiente} tienePlan={tienePlan}
            onVinculado={cargar} />
        </div>

        {/* ===== WELLNESS (solo si está PENDIENTE: es una tarea) ===== */}
        {!wellnessHoy && <div data-guia="dhoy.wellness">{bloqueWellness}</div>}

        {/* ===== HERO: sesión de hoy ===== */}
        {sesionesHoy.length > 0 ? (
          <div className="flex flex-col gap-3 mb-4" data-guia="dhoy.sesion">
            {sesionesHoy.map(s => {
              const col = colorDisciplina(s.disciplina)
              const steps = tareasPorSesion[s.id] || []
              return (
                <div key={s.id} className="bg-gray-900 rounded-2xl border-[1.5px] border-orange-500 p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full">🔥 HOY</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: col + '33', color: col }}>{s.disciplina}</span>
                    <span className="text-gray-400 text-xs">{duracionSesionTexto(s.duracion_minutos, s.dur_estimada)}</span>
                    <span className="text-gray-400 text-xs">· RPE {s.rpe_estimado || '—'}</span>
                    <EtiquetaCambiada por={s.cambiada_por} />
                  </div>
                  {s.notas_entrenador && <p className="text-gray-500 text-xs italic mb-3">"{s.notas_entrenador}"</p>}
                  {steps.length > 0 && (
                    <div className="flex flex-col gap-1.5 mb-3">
                      {steps.map((t: any) => {
                        const zi = t.zona_entrenamiento ? cargaDeTarea(t) : null
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

        {/* ===== WELLNESS (ya registrado: aquí abajo solo informa) ===== */}
        {wellnessHoy && <div data-guia="dhoy.wellness">{bloqueWellness}</div>}

        {/* ===== SEMANA DE UN VISTAZO ===== */}
        {semana.length > 0 && (
          <div className="mb-4" data-guia="dhoy.semana">
            <Cabecera titulo="Esta semana" abierto={abierto('semana')} onClick={() => alternar('semana')}
              resumen={semanaPlan > 0 ? semanaPlan + (semanaPlan === 1 ? ' sesión' : ' sesiones') : undefined} />
            {abierto('semana') && <div className="grid grid-cols-7 gap-1.5">
              {semana.map(d => (
                <button key={d.f} onClick={() => router.push('/mis-sesiones')}
                  className={'flex flex-col items-center gap-1.5 rounded-xl py-2 border transition ' + (d.esHoy ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900')}>
                  <span className={'text-xs font-bold ' + (d.esHoy ? 'text-orange-400' : 'text-gray-400')}>{d.letra}</span>
                  <div className="flex gap-0.5 items-center h-2">
                    {d.sesiones.length === 0
                      ? <span className="w-1.5 h-1.5 rounded-full border border-gray-700" />
                      : d.sesiones.slice(0, 3).map((s: any, i: number) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorDisciplina(s.disciplina), opacity: s.estado === 'Realizada' ? 1 : 0.5 }} />
                      ))}
                  </div>
                </button>
              ))}
            </div>}
          </div>
        )}

        {/* Cómo fue tu semana pasada (cumplimiento, carga y bienestar). Va DESPUÉS de
            hoy: es un retrospectivo, y estaba empujando la sesión del día por debajo
            del corte de la pantalla en un móvil. */}
        {deportista && <ResumenDeportista depId={deportista.id} plegado={!abierto('pasada')} alternar={() => alternar('pasada')} />}

        {/* ===== PRÓXIMA CARRERA + CUMPLIMIENTO ===== */}
        <div className="mb-4" data-guia="dhoy.progreso">
          <Cabecera titulo="Tu progreso" abierto={abierto('progreso')} onClick={() => alternar('progreso')}
            resumen={cumplimiento ? cumplimiento.pct + '% cumplimiento' : undefined} />
          {abierto('progreso') && <div className="grid grid-cols-2 gap-3">
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
          </div>}
        </div>

        {/* ===== APUNTAR UNA SESIÓN =====
            Eran DOS botones —«añadir una sesión que vas a hacer» y «apuntar la
            fuerza que he hecho»— porque eran dos pantallas distintas. Ahora las
            dos llevan a /apuntar, donde lo primero que eliges es justo eso: si
            la vas a hacer o ya la hiciste, y de qué. Dejar los dos sería la
            misma puerta pintada dos veces. */}
        <div className="mb-5">
          <button onClick={() => router.push('/apuntar')} data-guia="dhoy.apuntar"
            className="w-full border border-dashed border-gray-700 text-gray-400 hover:text-white hover:border-orange-500/60 rounded-xl py-3.5 text-sm transition">
            ＋ Apuntar una sesión
            <span className="block text-gray-600 text-[11.5px] mt-0.5">
              La que acabas de hacer o la que vas a hacer, de lo que sea.
            </span>
          </button>
        </div>

        {/* ===== MÓDULOS COMPACTOS =====
            En móvil los lleva la barra inferior (components/NavDeportista): tenerlos
            aquí además sería la misma navegación dos veces, y obligaba a bajar hasta
            el final para cambiar de pantalla. En escritorio no hay barra, así que se
            quedan. */}
        <div className="hidden sm:grid grid-cols-4 gap-2">
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
