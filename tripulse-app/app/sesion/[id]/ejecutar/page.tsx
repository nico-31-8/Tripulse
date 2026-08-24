'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { ritmoObjetivoTexto } from '@/lib/referencia-zona'
import { diasHastaCompeticion, microsDelPlan, hayOtraSesionEseDia } from '@/lib/contexto-sesion'
import FuerzaRegistro from './FuerzaRegistro'
import { zonaResistencia, prescripcion, cargaZona, zonaClasica } from '@/lib/zonas'
import { conTecnica } from '@/lib/tecnica'
import { calcularDuracionEstimada, medirDuracion, type DuracionMedida } from '@/lib/duracion'

const EMOJI_BLOQUE: Record<string, string> = { Natacion: '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️' }
import { recomendarRecuperacion } from '@/lib/recuperacion'

function segAMmss(seg: number): string {
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return min + ':' + String(s).padStart(2, '0')
}

function mmssASeg(str: string): number {
  if (!str) return 0
  const p = str.split(':')
  if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0)
  return parseInt(str) || 0
}

const COLOR_ZONA: Record<string, string> = {
  'Z1': 'bg-gray-700 border-gray-500',
  'Z2': 'bg-blue-900 border-blue-600',
  'Z3': 'bg-green-900 border-green-600',
  'Z4': 'bg-yellow-900 border-yellow-600',
  'Z5': 'bg-orange-900 border-orange-600',
  'Z6': 'bg-red-900 border-red-600',
  'Z7': 'bg-purple-900 border-purple-600',
}

// Clase de color de la tarjeta según zona (Z1–Z7 directo; siglas Zonas 2 por nivel equivalente).
function claseZona(zona: string): string {
  if (!zona) return 'bg-gray-900 border-gray-700'
  return COLOR_ZONA[zona] || COLOR_ZONA['Z' + cargaZona(zona).nivel] || 'bg-gray-900 border-gray-700'
}

// Los tres rangos del sistema clásico salían de tres tablas escritas aquí. La de
// VAM se había separado de la de la ficha de sesión y prescribía otro ritmo para
// la misma zona. Ahora las tres vienen de ZONAS_CLASICAS (lib/zonas.ts).
function calcularRango(zona: string, disciplina: string, tests: any): string {
  if (!zona || !disciplina || !tests) return ''
  // Zonas 2 (resistencia): el catálogo da el rango real de ritmo/vatios/CSS.
  const zr = zonaResistencia(zona)
  if (zr) { const p = prescripcion(zr, disciplina, tests); return p && p !== '—' ? p : '' }
  // Sistema clásico Z1–Z7.
  const zc = zonaClasica(zona)
  if (!zc) return ''
  if (disciplina === 'Carrera' && tests.vam) {
    const [p1, p2] = zc.vamPct
    const v1 = tests.vam * p1 / 100, v2 = tests.vam * p2 / 100
    const fmt = (v: number) => { const s = 3600/v; return Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0') }
    return fmt(v2) + '–' + fmt(v1) + ' /km'
  }
  if (disciplina === 'Ciclismo' && tests.ftp) {
    const [p1, p2] = zc.ftpPct
    return Math.round(tests.ftp*p1/100) + '–' + Math.round(tests.ftp*p2/100) + ' W'
  }
  if ((disciplina === 'Natacion' || disciplina === 'Natación') && tests.css) {
    const [p1, p2] = zc.cssPct
    const fmt = (p: number) => { const s = 100/(tests.css * p / 100); return Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0') }
    return fmt(p2) + '–' + fmt(p1) + ' /100m'
  }
  return ''
}
export default function EjecutarSesion({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  const [sesion, setSesion] = useState<any>(null)
  const [tareas, setTareas] = useState<any[]>([])
  // 'Brick' es la etiqueta de la sesión; el deporte real lo pone cada bloque (tarea).
  const esBrick = sesion?.disciplina === 'Brick'
  // Feedback por bloque de un brick (el dolor y las notas siguen siendo del día).
  const [postBloques, setPostBloques] = useState<Record<number, { rpe: number; sensacion: number }>>({})
  // Se entra directo a entrenar: el plan ya lo ha visto en el briefing de la ficha,
  // que es ahora la única puerta (antes se pintaba dos veces, con dos botones de
  // empezar seguidos). La vista previa se conserva, pero solo de vuelta: el botón
  // «← Plan» de aquí dentro, para consultarla a media sesión.
  const [fase, setFase] = useState<'preview'|'ejecutar'|'post'|'resumen'>('ejecutar')
  const [tareaActual, setTareaActual] = useState(0)
  const [resultados, setResultados] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(true)
  const [ejerciciosPorTarea, setEjerciciosPorTarea] = useState<Record<number, any[]>>({})
  const [guardando, setGuardando] = useState(false)
  const [tests, setTests] = useState<any>(null)
  const [pesoDeportista, setPesoDeportista] = useState<number | null>(null)
  const [otraSesionHoy, setOtraSesionHoy] = useState(false)
  const [diasHastaComp, setDiasHastaComp] = useState<number | null>(null)
  // Modo mejora: última ejecución de cada ejercicio de fuerza, indexada por nombre.
  const [historialFuerza, setHistorialFuerza] = useState<Record<string, { dias: number; series: any[] }>>({})

  // Post sesión
  const [rpe, setRpe] = useState(5)
  const [sensacion, setSensacion] = useState(3)
  const [dolor, setDolor] = useState(1)
  const [notasPost, setNotasPost] = useState('')
  const [fcMedia, setFcMedia] = useState('')
  // La HRV del día la preguntaba la ficha pero no el modo entreno, así que quien
  // siempre entrena por aquí y no rellena el wellness dejaba el corrector del SICAT
  // clavado en neutro (ver calcularCorrectorHRV en lib/sicat).
  const [hrvDia, setHrvDia] = useState('')
  // Reloj de la sesión: el modo entreno no tenía ninguno y por eso nunca escribía
  // duracion_real (la recomendación de recuperación se calculaba con la planificada).
  // Se guarda en sesion.hora_inicio para que sobreviva a recargar la página.
  const [inicioMs, setInicioMs] = useState<number | null>(null)
  const [duracionRealInput, setDuracionRealInput] = useState('')
  const [medida, setMedida] = useState<DuracionMedida | null>(null)

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: ses } = await supabase.from('sesion').select('*').eq('id', id).single()
    setSesion(ses)
    // El reloj arranca al ENTRAR, porque ahora se entra directo a entrenar (antes lo
    // arrancaba el botón de la vista previa). Si ya venía arrancado y se recargó la
    // página, se retoma aquel instante en vez de empezar de cero.
    if (ses && ses.estado !== 'Realizada') {
      const previo = ses.hora_inicio ? new Date(ses.hora_inicio).getTime() : NaN
      if (!isNaN(previo)) {
        setInicioMs(previo)
      } else {
        const ahora = Date.now()
        setInicioMs(ahora)
        await supabase.from('sesion').update({ hora_inicio: new Date(ahora).toISOString() }).eq('id', id)
      }
    }
    /* De siete viajes encadenados a uno.
     *
     * Aquí había la misma cascada que en la ficha —microciclo → mesociclo →
     * macrociclo → mesos → micros → sesiones del día— y por el mismo motivo:
     * averiguar de quién era la sesión. `ses.id_deportista` ya lo dice, y la
     * política RLS de `sesion` garantiza que está: una fila con ese campo a
     * null no la ve nadie.
     *
     * Y esto es la pantalla del ATLETA mientras entrena, muchas veces con el
     * móvil y mala cobertura. Es donde más se nota. */
    const depIdLocal: number | null = ses?.id_deportista ?? null

    const [mesos, micros, mismoDia, t1, t2, t3, an, tar] = await Promise.all([
      depIdLocal ? supabase.from('mesociclo').select('id, fecha_inicio, id_macrociclo').eq('id_deportista', depIdLocal) : Promise.resolve({ data: [] }),
      depIdLocal ? supabase.from('microciclo').select('id, fecha_inicio, tipo, id_mesociclo').eq('id_deportista', depIdLocal) : Promise.resolve({ data: [] }),
      /* Por deportista y fecha, no por los microciclos del plan: así cuenta
         también la sesión que el atleta se haya añadido él ese día. */
      depIdLocal ? supabase.from('sesion').select('id, estado').eq('id_deportista', depIdLocal)
        .eq('fecha_sesion', ses.fecha_sesion).or('eliminada.is.null,eliminada.eq.false') : Promise.resolve({ data: [] }),
      depIdLocal ? supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', depIdLocal).order('fecha', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      depIdLocal ? supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', depIdLocal).order('fecha', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      depIdLocal ? supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', depIdLocal).order('fecha', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      depIdLocal ? supabase.from('anamnesis').select('peso').eq('id_deportista', depIdLocal).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('tarea').select('*, p_distancia(*), p_duracion(*), p_repeticiones(*), ejercicios(*)').eq('id_sesion', id).order('orden'),
    ])

    if (depIdLocal) {
      // Los ritmos objetivo por zona: salen siempre que haya test, planificada o libre.
      setTests({ vam: (t1.data as any)?.[0]?.vam || null, css: (t2.data as any)?.[0]?.css || null, ftp: (t3.data as any)?.[0]?.ftp || null })
      setPesoDeportista((an.data as any)?.peso || null)

      // Contexto de recuperación, ya sin consultas: lógica pura sobre las listas.
      const listaMesos = (mesos.data || []) as any[]
      const listaMicros = (micros.data || []) as any[]
      setDiasHastaComp(diasHastaCompeticion(
        ses.fecha_sesion, microsDelPlan(ses.id_microciclo, listaMesos, listaMicros)))
      setOtraSesionHoy(hayOtraSesionEseDia((mismoDia.data || []) as any[], Number(id)))
    }
    // Si el entrenador manda un drill, el deportista tiene que ver cuál es y cómo se
    // hace: «AER 4 × 50 m» a secas no es prescribir técnica.
    const tarConTecnica = await conTecnica(tar.data)
    setTareas(tarConTecnica)
    // Se entra directo a entrenar, pero si no hay nada que registrar eso sería una
    // pantalla vacía: en ese caso se abre por el plan, que sí explica que está vacío.
    if (!tar.data || !tar.data.length) setFase('preview')
    // Cargar ejercicios de todas las tareas
    if (tar.data && tar.data.length > 0) {
      const tareaIds = (tar.data as any[]).map((t: any) => t.id)
      const { data: ejs } = await supabase.from('ejercicios').select('*').in('id_tarea', tareaIds)
      const ejMap: Record<number, any[]> = {}
      tareaIds.forEach((tid: number) => { ejMap[tid] = [] })
      ejs?.forEach((e: any) => {
        if (!ejMap[e.id_tarea]) ejMap[e.id_tarea] = []
        ejMap[e.id_tarea].push(e)
      })
      setEjerciciosPorTarea(ejMap)

      // Modo mejora: la última vez que se hizo cada ejercicio (por nombre + deportista).
      if (depIdLocal && ejs && ejs.length) {
        const nombres = [...new Set(ejs.map((e: any) => e.nombre).filter(Boolean))] as string[]
        const hist: Record<string, { dias: number; series: any[] }> = {}
        await Promise.all(nombres.map(async (nombre) => {
          const { data } = await supabase.rpc('ultima_ejecucion_fuerza', { _dep: depIdLocal, _nombre: nombre, _antes: ses.fecha_sesion })
          if (data && data.length) {
            const dias = Math.max(0, Math.round((new Date(ses.fecha_sesion).getTime() - new Date(data[0].fecha).getTime()) / 86400000))
            hist[nombre] = { dias, series: data }
          }
        }))
        setHistorialFuerza(hist)
      }
    }
    setLoading(false)
  }

  const [seriesFuerza, setSeriesFuerza] = useState<Record<number, any[]>>({})

  const updateSerieFuerza = (ejercicioId: number, numSerie: number, ejNum: number, campo: string, valor: any) => {
    setSeriesFuerza(prev => {
      const key = ejercicioId
      const arr = prev[key] ? [...prev[key]] : []
      const idx = arr.findIndex(s => s.numero_serie === numSerie && s.ejercicio_numero === ejNum)
      if (idx >= 0) arr[idx] = { ...arr[idx], [campo]: valor }
      else arr.push({ numero_serie: numSerie, ejercicio_numero: ejNum, [campo]: valor })
      return { ...prev, [key]: arr }
    })
  }

  const getSerieFuerza = (ejercicioId: number, numSerie: number, ejNum: number) => {
    return seriesFuerza[ejercicioId]?.find(s => s.numero_serie === numSerie && s.ejercicio_numero === ejNum) || {}
  }

  const updateResultado = (tareaId: number, campo: string, valor: string) => {
    setResultados(prev => ({ ...prev, [tareaId]: { ...prev[tareaId], [campo]: valor } }))
  }

  const guardarYCerrar = async () => {
    setGuardando(true)
    // Guardar series de fuerza
    // Lookup de ejercicios para recuperar el kg planificado de cada escalón de un drop set.
    const ejById: Record<number, any> = {}
    Object.values(ejerciciosPorTarea).flat().forEach((e: any) => { ejById[e.id] = e })

    const ejIdsTocados = Object.keys(seriesFuerza).map(Number)
    if (ejIdsTocados.length) {
      // Se BORRA lo anterior de esos ejercicios antes de insertar. Esta tabla solo
      // se insertaba, nunca se limpiaba: volver a entrar en la sesión y guardar otra
      // vez apilaba un segundo juego de series encima del primero. DatosReales las
      // enseñaba duplicadas y la referencia del modo mejora ("la última vez que
      // hiciste este ejercicio") quedaba corrupta. Solo se tocan los ejercicios que
      // el atleta ha rellenado ahora; lo que no ha tocado se queda como estaba.
      await supabase.from('series_realizadas').delete().in('id_ejercicio', ejIdsTocados)
    }

    // Un solo insert en vez de uno por serie: una sesión de fuerza de 4 ejercicios
    // × 4 series eran 16 viajes de red seguidos.
    const filasSeries: any[] = []
    for (const [ejId, series] of Object.entries(seriesFuerza)) {
      const rawDrop = ejById[Number(ejId)]?.escalones_drop
      const escalonesDrop = rawDrop ? String(rawDrop).split(',').map((s: string) => s.trim()) : null
      for (const serie of series) {
        // En un drop set el atleta solo registra reps+RIR: el peso de cada escalón es el
        // planificado. Volcarlo como peso_real (antes se guardaba null y se perdía para el análisis).
        let pesoReal: number | null = serie.peso_real ? Number(serie.peso_real) : null
        if (pesoReal == null && escalonesDrop) {
          const kg = Number(escalonesDrop[(serie.ejercicio_numero || 1) - 1])
          if (kg > 0) pesoReal = kg
        }
        filasSeries.push({
          id_ejercicio: Number(ejId),
          numero_serie: serie.numero_serie,
          peso_real: pesoReal,
          repeticiones_reales: serie.repeticiones_reales ? Number(serie.repeticiones_reales) : null,
          // Los segundos van en SU columna, no metidos en repeticiones_reales:
          // un campo que significa dos cosas es lo que hace que luego una media
          // mezcle reps con segundos sin que nadie se entere.
          tiempo_real: serie.tiempo_real ? Number(serie.tiempo_real) : null,
          // `control_real` + `control_tipo` sustituyen a `rir_real`, que solo sabía
          // hablar de RIR. El tipo se guarda TAMBIÉN aquí, no solo en el ejercicio:
          // si mañana el entrenador cambia la prescripción de RIR a RPE, estos
          // registros seguirían diciendo la verdad sobre en qué escala se anotaron.
          control_real: serie.control_real ? Number(serie.control_real) : null,
          control_tipo: serie.control_real ? (ejById[Number(ejId)]?.control_tipo || 'rir') : null,
          completada: serie.completada || false,
          ejercicio_numero: serie.ejercicio_numero || 1,
        })
      }
    }
    if (filasSeries.length) await supabase.from('series_realizadas').insert(filasSeries)

    // Guardar resultados de cada tarea con detalle por series
    for (const tarea of tareas) {
      const r = resultados[tarea.id]
      if (!r) continue
      // Construir resumen de series
      const seriesData = Object.keys(r)
        .filter(k => k.startsWith('serie_'))
        .map((k, i) => {
          const s = r[k]
          const parts = []
          if (s.tiempo) parts.push('T:' + s.tiempo)
          if (s.metros) parts.push(s.metros + 'm')
          if (s.ritmo) parts.push(s.ritmo)
          if (s.sensacion) parts.push('S:' + s.sensacion + '/5')
          return 'S' + (i+1) + '[' + parts.join(' ') + ']'
        }).join(' | ')
      if (seriesData) {
        await supabase.from('tarea').update({
          sensacion_general: seriesData
        }).eq('id', tarea.id)
      }
      // Guardar métricas agregadas de la primera serie si existen
      const s0 = r['serie_0']
      if (s0) {
        if (tarea.p_distancia?.[0] && s0.metros) await supabase.from('p_distancia').update({ metros_reales: Number(s0.metros) }).eq('id_tarea', tarea.id)
        if (tarea.p_duracion?.[0] && s0.tiempo) await supabase.from('p_duracion').update({ tiempo_real: mmssASeg(s0.tiempo) }).eq('id_tarea', tarea.id)
      }
    }
    // Marcar sesión como realizada y guardar post-sesión.
    // duracion_real solo se escribe si hay un número: si el atleta dejó la casilla
    // vacía se conserva lo que hubiera, en vez de machacarlo con un null.
    const durReal = Number(duracionRealInput)
    await supabase.from('sesion').update({
      estado: 'Realizada',
      ...(durReal > 0 ? { duracion_real: Math.round(durReal) } : {}),
    }).eq('id', id)
    if (tareas.length > 0) {
      // El dolor, las notas y la HRV son del DÍA: van igual en todos los bloques.
      const delDia = {
        dolor_muscular: dolor,
        notas_post: notasPost,
        hrv_del_dia: hrvDia ? Number(hrvDia) : null,
      }
      if (esBrick) {
        // Cada bloque guarda SU esfuerzo, que es lo que deja al SICAT distinguir
        // si el coste vino de la bici o de la carrera.
        await Promise.all(tareas.map((t: any) => supabase.from('tarea').update({
          ...delDia,
          rpe_reportado: postBloques[t.id]?.rpe ?? rpe,
          sensacion_tecnica: postBloques[t.id]?.sensacion ?? sensacion,
          fc_media: fcMedia ? Number(fcMedia) : null,
        }).eq('id', t.id)))
      } else {
        await supabase.from('tarea').update({
          ...delDia,
          rpe_reportado: rpe,
          sensacion_tecnica: sensacion,
          fc_media: fcMedia ? Number(fcMedia) : null,
        }).eq('id_sesion', Number(id))
      }
    }
    setFase('resumen')
    setGuardando(false)
  }

  // Arranca el reloj de la sesión. Si se vuelve al plan y se entra otra vez, se
  // respeta el primer instante: el atleta lleva entrenando desde entonces.
  const arrancarEntreno = async () => {
    setFase('ejecutar')
    if (inicioMs) return
    const ahora = Date.now()
    setInicioMs(ahora)
    if (!sesion?.hora_inicio) {
      await supabase.from('sesion').update({ hora_inicio: new Date(ahora).toISOString() }).eq('id', id)
    }
  }

  // Al entrar en el cuestionario se congela lo que marcó el reloj y se propone
  // como duración, salvo que sea desproporcionado (ver medirDuracion).
  const irAPost = () => {
    const minutosPlan = sesion?.duracion_minutos || calcularDuracionEstimada(tareas, tests || {}).minutos || 0
    const m = medirDuracion(inicioMs, Date.now(), minutosPlan)
    setMedida(m)
    setDuracionRealInput(m.minutos != null ? String(m.minutos) : '')
    setFase('post')
  }

  const completarSinDatos = async () => {
    setGuardando(true)
    await supabase.from('sesion').update({ estado: 'Realizada' }).eq('id', id)
    irAPost()   // sin reloj arrancado la casilla sale vacía y la rellena él
    setGuardando(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>
  if (!sesion) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Sesión no encontrada</div>

  const colorDisciplina = (d: string) => {
    if (d?.includes('Nat')) return 'bg-blue-600'
    if (d === 'Ciclismo') return 'bg-yellow-600'
    if (d === 'Carrera') return 'bg-green-600'
    return 'bg-orange-600'
  }

  const getTipoMedicion = (tarea: any) => {
    if (tarea.p_duracion?.[0]) return 'duracion'
    if (tarea.p_distancia?.[0]) return 'distancia'
    if (tarea.p_repeticiones?.[0]) return 'repeticiones'
    return null
  }

  const getObjetivo = (tarea: any) => {
    if (tarea.p_duracion?.[0]) return segAMmss(tarea.p_duracion[0].tiempo_planeado) + ' min'
    if (tarea.p_distancia?.[0]) {
      const m = tarea.p_distancia[0].metros_planeados
      return m >= 1000 ? (m/1000).toFixed(1) + ' km' : m + ' m'
    }
    if (tarea.p_repeticiones?.[0]) return tarea.p_repeticiones[0].repeticiones_planteadas + ' reps'
    return '—'
  }

  // VISTA PREVIA
  if (fase === 'preview') return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 px-4 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => router.back()} className="text-gray-400 text-sm">← Volver</button>
        <div className="w-16" />
      </nav>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <div className="mb-6">
          <span className={'text-xs px-3 py-1 rounded-full text-white font-medium ' + colorDisciplina(sesion.disciplina)}>{sesion.disciplina}</span>
          <h2 className="text-2xl font-bold mt-2">{sesion.fecha_sesion}</h2>
          <div className="flex gap-4 text-gray-400 text-sm mt-1">
            {sesion.duracion_minutos && <span>⏱ {sesion.duracion_minutos} min</span>}
            {sesion.rpe_estimado && <span>💪 RPE est: {sesion.rpe_estimado}</span>}
          </div>
          {sesion.notas_entrenador && (
            <div className="bg-gray-900 rounded-xl p-4 mt-3 border border-gray-700">
              <p className="text-xs text-gray-500 mb-1">Notas del entrenador</p>
              <p className="text-gray-300 text-sm italic">"{sesion.notas_entrenador}"</p>
            </div>
          )}
        </div>

        <h3 className="font-bold text-lg mb-3">Plan de entrenamiento</h3>
        <div className="flex flex-col gap-3 mb-8">
          {tareas.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay tareas planificadas.</p>
          ) : tareas.map((t, i) => (
            <div key={t.id} className={'rounded-xl p-4 border ' + claseZona(t.zona_entrenamiento)}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-orange-400 font-bold text-sm">#{i+1}</span>
                  {t.zona_entrenamiento && <span className="text-xs bg-black/30 px-2 py-0.5 rounded-full">{t.zona_entrenamiento}</span>}
                </div>
                <span className="text-xs text-gray-400">{t.disciplina}</span>
              </div>
              <div className="flex gap-4 text-sm">
                {t.series && <span>🔁 {t.series} series</span>}
                <span>🎯 {getObjetivo(t)}</span>
                {t.descanso_segundos && <span>⏸ {segAMmss(t.descanso_segundos)}</span>}
              </div>
              {t.comentario && <p className="text-gray-400 text-xs mt-2">{t.comentario}</p>}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <button onClick={arrancarEntreno}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition">
            ▶ Iniciar entreno con registro
          </button>
          <button onClick={completarSinDatos} disabled={guardando}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-medium transition disabled:opacity-50">
            ✓ Entreno completado (sin registro)
          </button>
        </div>
      </div>
    </main>
  )

  // MODO EJECUCIÓN
  if (fase === 'ejecutar') {
    const tarea = tareas[tareaActual]
    // Red de seguridad: sin tarea que pintar esto devolvía null y dejaba la pantalla
    // en blanco. Pasa si la sesión no tiene tareas o si el índice se va de rango.
    if (!tarea) return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">📋</div>
        <p className="text-gray-400">Esta sesión no tiene tareas que registrar.</p>
        <div className="flex gap-3">
          <button onClick={() => setFase('preview')} className="bg-gray-800 hover:bg-gray-700 px-4 py-2.5 rounded-xl text-sm transition">Ver el plan</button>
          <button onClick={irAPost} className="bg-orange-500 hover:bg-orange-600 px-4 py-2.5 rounded-xl text-sm font-medium transition">Marcarla como hecha</button>
        </div>
      </main>
    )
    const tipo = getTipoMedicion(tarea)
    const r = resultados[tarea?.id] || {}
    const esUltima = tareaActual === tareas.length - 1

    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col">
        <nav className="bg-gray-900 px-4 py-4 flex justify-between items-center border-b border-gray-800">
          <button onClick={() => setFase('preview')} className="text-gray-400 text-sm">← Plan</button>
          <span className="text-orange-500 font-bold text-sm">{tareaActual + 1} / {tareas.length}</span>
          <button onClick={irAPost} className="text-gray-400 text-sm">Finalizar</button>
        </nav>

        {/* Barra de progreso */}
        <div className="h-1 bg-gray-800">
          <div className="h-1 bg-orange-500 transition-all" style={{ width: ((tareaActual + 1) / tareas.length * 100) + '%' }} />
        </div>

        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col">
          {/* Tarea actual */}
          <div className={'rounded-xl p-5 border mb-6 ' + claseZona(tarea?.zona_entrenamiento)}>
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-orange-400">Tarea {tareaActual + 1}</span>
              {/* Se guardó AER para que la carga saliera bien, pero lo que le mandaron
                  fue técnica: eso es lo que tiene que leer. */}
              {tarea?.tecnica
                ? <span className="text-sm bg-black/40 px-3 py-1 rounded-full">Técnica</span>
                : tarea?.zona_entrenamiento && <span className="text-sm bg-black/40 px-3 py-1 rounded-full">{tarea.zona_entrenamiento}</span>}
            </div>
            {tarea?.tecnica && (
              <div className="mb-3 bg-black/30 rounded-lg px-4 py-3">
                <p className="font-bold text-white">{tarea.tecnica.nombre}</p>
                {tarea.tecnica.descripcion && <p className="text-xs text-gray-400 mt-0.5">{tarea.tecnica.descripcion}</p>}
                {tarea.tecnica.ejecucion && (
                  <p className="text-sm text-gray-300 mt-2 whitespace-pre-line">{tarea.tecnica.ejecucion}</p>
                )}
                {tarea.tecnica.url_video && (
                  <a href={tarea.tecnica.url_video} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 text-orange-400 hover:text-orange-300 text-sm underline">Ver vídeo</a>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 text-center">
              {tarea?.series && (
                <div className="bg-black/30 rounded-lg p-2">
                  <p className="text-xs text-gray-400">Series</p>
                  <p className="font-bold text-lg">{tarea.series}</p>
                </div>
              )}
              <div className="bg-black/30 rounded-lg p-2">
                <p className="text-xs text-gray-400">Objetivo</p>
                <p className="font-bold text-lg">{getObjetivo(tarea)}</p>
              </div>
              {tarea?.descanso_segundos && (
                <div className="bg-black/30 rounded-lg p-2">
                  <p className="text-xs text-gray-400">Descanso</p>
                  <p className="font-bold text-lg">{segAMmss(tarea.descanso_segundos)}</p>
                </div>
              )}
            </div>
            {/* Ritmo / Potencia objetivo */}
            {(() => {
              /* Solo p_distancia: `p_duracion` NO tiene columna `ritmo_objetivo`,
                 comprobado contra la base. Leerla de ahí era código muerto que
                 hacía creer que una tarea por tiempo podía traer ritmo guardado.
                 Para esas, el ritmo sale del cálculo de la zona, abajo. */
              const ritmoGuardado = tarea?.p_distancia?.[0]?.ritmo_objetivo
              const ritmoCalculado = calcularRango(tarea?.zona_entrenamiento || '', tarea?.disciplina || sesion?.disciplina || '', tests)
              const ritmoMostrar = ritmoGuardado || ritmoCalculado
              if (!ritmoMostrar) return null
              return (
                <div className="mt-3 bg-black/30 rounded-lg px-4 py-2 flex justify-between items-center">
                  <p className="text-xs text-gray-400">
                    {(tarea?.disciplina || sesion?.disciplina) === 'Carrera' ? 'Ritmo objetivo' :
                     (tarea?.disciplina || sesion?.disciplina) === 'Ciclismo' ? 'Potencia objetivo' :
                     (tarea?.disciplina || sesion?.disciplina) === 'Natacion' ? 'Ritmo obj /100m' : 'Referencia'}
                  </p>
                  <p className="font-bold text-orange-300 text-lg">{ritmoMostrar}</p>
                </div>
              )
            })()}
            {tarea?.comentario && <p className="text-gray-300 text-sm mt-3 italic">{tarea.comentario}</p>}
          </div>

          {/* FUERZA: Registro por ejercicio y serie */}
          {tarea && (tarea.disciplina === 'Fuerza' || sesion.disciplina === 'Fuerza') && (
            <div className="flex flex-col gap-4 mb-6">
              <FuerzaRegistro
                tarea={tarea}
                ejercicios={ejerciciosPorTarea[tarea?.id] || []}
                seriesFuerza={seriesFuerza}
                updateSerieFuerza={updateSerieFuerza}
                getSerieFuerza={getSerieFuerza}
                historial={historialFuerza}
              />
            </div>
          )}

          {/* RESISTENCIA: Registro por series */}
          {tarea && tarea.disciplina !== 'Fuerza' && sesion.disciplina !== 'Fuerza' && (
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-6">
            <div className="flex justify-between items-center mb-4">
              <p className="font-medium text-gray-300">Registro por serie (opcional)</p>
              <span className="text-xs text-gray-500">{tarea?.series || 1} series</span>
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: tarea?.series || 1 }, (_, serieIdx) => {
                const serieKey = 'serie_' + serieIdx
                const serieData = r[serieKey] || {}
                const completada = serieData.completada
                return (
                  <div key={serieIdx} className={'rounded-xl p-4 border transition ' + (completada ? 'bg-green-900 border-green-600' : 'bg-gray-800 border-gray-700')}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-sm">Serie {serieIdx + 1}</span>
                      <button onClick={() => updateResultado(tarea.id, serieKey, { ...serieData, completada: !completada })}
                        className={'text-xs px-3 py-1 rounded-full transition ' + (completada ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
                        {completada ? '✓ Hecha' : 'Marcar'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {tipo === 'duracion' && (
                        <div>
                          <label className="text-gray-400 text-xs mb-1 block">Tiempo (mm:ss)</label>
                          <input type="text" placeholder={tarea?.p_duracion?.[0] ? segAMmss(tarea.p_duracion[0].tiempo_planeado) : '—'}
                            value={serieData.tiempo || ''}
                            onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, tiempo: e.target.value })}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm text-center outline-none focus:ring-1 focus:ring-orange-500" />
                        </div>
                      )}
                      {tipo === 'distancia' && (
                        <div>
                          <label className="text-gray-400 text-xs mb-1 block">Metros</label>
                          <input type="number" placeholder={tarea?.p_distancia?.[0]?.metros_planeados}
                            value={serieData.metros || ''}
                            onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, metros: e.target.value })}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm text-center outline-none focus:ring-1 focus:ring-orange-500" />
                        </div>
                      )}
                      <div>
                        <label className="text-gray-400 text-xs mb-1 flex justify-between">
                          <span>Ritmo / Potencia</span>
                          {tarea?.p_distancia?.[0]?.ritmo_objetivo && (
                            <span className="text-orange-400 font-medium">Objetivo: {tarea.p_distancia[0].ritmo_objetivo}</span>
                          )}
                        </label>
                        <input type="text" placeholder={tarea?.p_distancia?.[0]?.ritmo_objetivo || "Ritmo real"}
                          value={serieData.ritmo || ''}
                          onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, ritmo: e.target.value })}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-orange-500" />
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs mb-1 block">Sensación (1-5)</label>
                        <input type="number" min="1" max="5" placeholder="3"
                          value={serieData.sensacion || ''}
                          onChange={e => updateResultado(tarea.id, serieKey, { ...serieData, sensacion: e.target.value })}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm text-center outline-none focus:ring-1 focus:ring-orange-500" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Resumen rápido */}
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-500">
                {Object.keys(r).filter(k => k.startsWith('serie_') && r[k]?.completada).length} / {tarea?.series || 1} series completadas
              </p>
            </div>
          </div>

          )}

          {/* Navegación tareas */}
          <div className="flex gap-3 mt-auto">
            {tareaActual > 0 && (
              <button onClick={() => setTareaActual(prev => prev - 1)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-xl font-medium transition">
                ← Anterior
              </button>
            )}
            {!esUltima ? (
              <button onClick={() => setTareaActual(prev => prev + 1)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold transition">
                Siguiente →
              </button>
            ) : (
              <button onClick={irAPost}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold transition">
                ✓ Finalizar entreno
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  // RESUMEN POST-SESIÓN
  if (fase === 'resumen') return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 px-4 py-4 flex items-center border-b border-gray-800">
        <h1 className="text-orange-500 font-bold mx-auto">Resumen de sesión</h1>
      </nav>
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {/* Cabecera */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-bold text-lg">¡Sesión completada!</p>
              <p className="text-gray-400 text-sm">{sesion.disciplina} · {sesion.fecha_sesion}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">RPE planificado</p>
              <p className="font-bold text-lg text-gray-300">{sesion.rpe_estimado || '—'}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">RPE real</p>
              <p className={'font-bold text-lg ' + (rpe > (sesion.rpe_estimado || 5) ? 'text-red-400' : rpe < (sesion.rpe_estimado || 5) ? 'text-green-400' : 'text-orange-400')}>{rpe}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">Sensación técnica</p>
              <p className="font-bold text-lg text-blue-400">{sensacion}/5</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-gray-500 text-xs mb-1">FC media</p>
              <p className="font-bold text-lg text-red-400">{fcMedia || '—'} ppm</p>
            </div>
          </div>
          {notasPost && (
            <div className="mt-3 bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-1">Tus notas</p>
              <p className="text-gray-300 text-sm italic">"{notasPost}"</p>
            </div>
          )}
        </div>

        {/* Recomendación de recuperación */}
        {sesion.disciplina !== 'Fuerza' && (() => {
          const durMin = sesion.duracion_real || sesion.duracion_minutos || calcularDuracionEstimada(tareas, tests || {}).minutos || 0
          const recup = recomendarRecuperacion({
            duracionMin: durMin,
            rpeReal: rpe,
            disciplina: sesion.disciplina,
            ayuno: !!sesion.nutricion_ayuno,
            pesoKg: pesoDeportista,
            otraSesionHoy,
            diasHastaComp,
          })
          return (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🍽</span>
                <h3 className="text-white font-bold text-sm">{recup.titulo}</h3>
              </div>
              <p className="text-gray-300 text-sm mb-2">{recup.mensaje}</p>
              {(recup.carboG != null || recup.proteinaG != null) && (
                <div className="flex gap-3 flex-wrap text-xs mb-2">
                  {recup.carboG != null && <span className="bg-gray-800 rounded-lg px-2.5 py-1 text-gray-200">🥤 ~{recup.carboG} g carbohidrato</span>}
                  {recup.proteinaG != null && <span className="bg-gray-800 rounded-lg px-2.5 py-1 text-gray-200">🍗 ~{recup.proteinaG} g proteína</span>}
                </div>
              )}
              {recup.ejemplos && <p className="text-gray-400 text-xs mb-1">{recup.ejemplos}</p>}
              {recup.hidratacion && <p className="text-gray-400 text-xs mb-1">💧 {recup.hidratacion}</p>}
              {recup.extra.map((e, i) => (
                <p key={i} className="text-yellow-400/90 text-xs mt-1.5">⚠️ {e}</p>
              ))}
            </div>
          )
        })()}

        {/* Tareas planificado vs real */}
        <h3 className="font-bold mb-3 text-gray-300">Tareas — Planificado vs Real</h3>
        <div className="flex flex-col gap-3 mb-6">
          {tareas.map((t, i) => {
            const r = resultados[t.id] || {}
            const pd = t.p_distancia?.[0]
            const pu = t.p_duracion?.[0]
            const pr = t.p_repeticiones?.[0]
            const s0 = r['serie_0'] || {}
            const ritmoObj = ritmoObjetivoTexto(pd?.ritmo_objetivo, t.disciplina || sesion?.disciplina)
            const seriesCompletadas = Object.keys(r).filter(k => k.startsWith('serie_') && r[k]?.completada).length
            const totalSeries = t.series || 1

            return (
              <div key={t.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-3 bg-gray-800 flex items-center gap-2">
                  <span className="text-orange-400 font-bold text-sm">#{i+1}</span>
                  {t.zona_entrenamiento && <span className="text-xs bg-black/30 px-2 py-0.5 rounded-full">{t.zona_entrenamiento}</span>}
                  <span className="text-gray-400 text-xs">{t.disciplina}</span>
                  {seriesCompletadas > 0 && (
                    <span className="ml-auto text-xs text-green-400">{seriesCompletadas}/{totalSeries} series ✓</span>
                  )}
                </div>
                <div className="p-4 grid grid-cols-2 gap-3">
                  {pd && (
                    <>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Distancia plan</p>
                        <p className="font-bold text-sm">{pd.metros_planeados ? pd.metros_planeados + 'm' : '—'}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Distancia real</p>
                        <p className={'font-bold text-sm ' + (s0.metros ? 'text-green-400' : 'text-gray-500')}>{s0.metros ? s0.metros + 'm' : '—'}</p>
                      </div>
                    </>
                  )}
                  {ritmoObj && (
                    <>
                      <div className="bg-orange-950 border border-orange-800 rounded-lg p-2 text-center">
                        <p className="text-orange-400 text-xs">Ritmo objetivo</p>
                        <p className="font-bold text-sm text-white">{ritmoObj}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Ritmo real</p>
                        <p className={'font-bold text-sm ' + (s0.ritmo ? 'text-green-400' : 'text-gray-500')}>{s0.ritmo || '—'}</p>
                      </div>
                    </>
                  )}
                  {pu && (
                    <>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Duración plan</p>
                        <p className="font-bold text-sm">{pu.tiempo_planeado ? Math.floor(pu.tiempo_planeado/60)+':'+String(pu.tiempo_planeado%60).padStart(2,'0') : '—'}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Duración real</p>
                        <p className={'font-bold text-sm ' + (s0.tiempo ? 'text-green-400' : 'text-gray-500')}>{s0.tiempo || '—'}</p>
                      </div>
                    </>
                  )}
                  {pr && (
                    <>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Reps plan</p>
                        <p className="font-bold text-sm">{pr.repeticiones_planteadas || '—'}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-2 text-center">
                        <p className="text-gray-500 text-xs">Series completadas</p>
                        <p className={'font-bold text-sm ' + (seriesCompletadas > 0 ? 'text-green-400' : 'text-gray-500')}>{seriesCompletadas}/{totalSeries}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={() => router.push('/dashboard-deportista')}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition">
          Volver al panel →
        </button>
      </div>
    </main>
  )

  // POST SESIÓN
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 px-4 py-4 flex items-center border-b border-gray-800">
        <h1 className="text-orange-500 font-bold mx-auto">Post sesión</h1>
      </nav>
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <p className="text-gray-400 text-sm mb-6">¡Bien hecho! Registra cómo te has sentido.</p>

        <div className="flex flex-col gap-5">
          {/* En un brick el esfuerzo se pregunta POR BLOQUE: correr después de la bici no
              se parece a la bici, y un solo número impide al SICAT saber qué deporte le
              cuesta (ver lib/sicat). El dolor y las notas siguen siendo del día. */}
          {esBrick ? (
            <div className="bg-purple-900/20 border border-purple-800/50 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-purple-300 text-sm font-semibold">🔀 ¿Cómo fue cada parte?</p>
              {tareas.map((t: any, i: number) => {
                const b = postBloques[t.id] || { rpe: 5, sensacion: 3 }
                const set = (campo: 'rpe' | 'sensacion', v: number) =>
                  setPostBloques(p => ({ ...p, [t.id]: { ...b, [campo]: v } }))
                return (
                  <div key={t.id} className="bg-gray-900 rounded-lg p-4 flex flex-col gap-3">
                    <p className="text-white text-sm font-bold">
                      {EMOJI_BLOQUE[t.disciplina] || ''} {i + 1} · {t.disciplina || '—'}
                      {t.zona_entrenamiento && <span className="text-gray-500 font-medium ml-1.5 text-xs">{t.zona_entrenamiento}</span>}
                    </p>
                    <div>
                      <div className="flex justify-between items-center mb-1"><label className="text-gray-400 text-xs">RPE — Esfuerzo percibido</label><span className="text-orange-400 font-bold">{b.rpe}</span></div>
                      <input type="range" min="1" max="10" value={b.rpe} onChange={e => set('rpe', Number(e.target.value))} className="w-full accent-orange-500" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1"><label className="text-gray-400 text-xs">Sensación técnica</label><span className="text-blue-400 font-bold">{b.sensacion}/5</span></div>
                      <input type="range" min="1" max="5" value={b.sensacion} onChange={e => set('sensacion', Number(e.target.value))} className="w-full accent-blue-500" />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-medium">RPE — Esfuerzo percibido</label>
                  <span className="text-orange-400 font-bold text-xl">{rpe}</span>
                </div>
                <input type="range" min="1" max="10" value={rpe} onChange={e => setRpe(Number(e.target.value))} className="w-full accent-orange-500" />
                <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Muy fácil</span><span>Máximo</span></div>
              </div>

              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-medium">Sensación técnica</label>
                  <span className="text-blue-400 font-bold text-xl">{sensacion}/5</span>
                </div>
                <input type="range" min="1" max="5" value={sensacion} onChange={e => setSensacion(Number(e.target.value))} className="w-full accent-blue-500" />
                <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Muy mala</span><span>Perfecta</span></div>
              </div>
            </>
          )}

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">Dolor muscular</label>
              <span className="text-yellow-400 font-bold text-xl">{dolor}/5</span>
            </div>
            <input type="range" min="1" max="5" value={dolor} onChange={e => setDolor(Number(e.target.value))} className="w-full accent-yellow-500" />
            <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Sin dolor</span><span>Mucho</span></div>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">FC media de la sesión (ppm)</label>
              <span className="text-red-400 font-bold text-xl">{fcMedia || '—'}</span>
            </div>
            <p className="text-gray-500 text-xs mb-3">Consulta tu reloj Garmin — dato necesario para calcular la carga real</p>
            <input
              type="number"
              placeholder="Ej: 148"
              value={fcMedia}
              onChange={e => setFcMedia(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500"
              min="40" max="220"
            />
          </div>
          {/* Duración real: el reloj propone, el atleta manda. Si se dejó la sesión
              abierta no se propone nada y se le pide a mano (ver medirDuracion). */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">¿Cuánto duró?</label>
              <span className="text-green-400 font-bold text-xl">{duracionRealInput || '—'} <span className="text-gray-500 text-sm font-normal">min</span></span>
            </div>
            {medida?.fiable ? (
              <p className="text-gray-500 text-xs mb-3">Medido desde que pulsaste Empezar. Cámbialo si no cuadra.</p>
            ) : medida && medida.medidos > 0 ? (
              <p className="text-yellow-500/90 text-xs mb-3">
                ⚠️ Han pasado {Math.floor(medida.medidos / 60)} h {medida.medidos % 60} min desde que empezaste —
                parece que la sesión se quedó abierta. Escribe a ojo cuánto duró.
              </p>
            ) : (
              <p className="text-gray-500 text-xs mb-3">Ponlo a ojo si no lo sabes exacto.</p>
            )}
            <input
              type="number"
              placeholder="Ej: 52"
              value={duracionRealInput}
              onChange={e => setDuracionRealInput(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
              min="1" max="720"
            />
          </div>

          {/* HRV del día: respaldo del wellness para el corrector del SICAT. */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium">HRV del día (ms)</label>
              <span className="text-blue-400 font-bold text-xl">{hrvDia || '—'}</span>
            </div>
            <p className="text-gray-500 text-xs mb-3">Opcional. Si ya la registraste en el wellness de hoy, puedes saltártelo.</p>
            <input
              type="number"
              placeholder="Ej: 62"
              value={hrvDia}
              onChange={e => setHrvDia(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              min="1" max="300"
            />
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <label className="font-medium block mb-2">Notas (opcional)</label>
            <textarea value={notasPost} onChange={e => setNotasPost(e.target.value)} rows={3}
              placeholder="¿Cómo fue el entreno? ¿Algo que destacar?"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

          <button onClick={guardarYCerrar} disabled={guardando}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition disabled:opacity-50">
            {guardando ? 'Guardando...' : '✓ Guardar y finalizar'}
          </button>
        </div>
      </div>
    </main>
  )
}
