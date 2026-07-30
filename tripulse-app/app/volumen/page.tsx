'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { calcularSICAT, factorSicat, type SicatResultado } from '@/lib/sicat'
import { calcularSicatZonas, factorSicatZona, type SicatZonasResultado } from '@/lib/sicat-zonas'
import { cargaZona } from '@/lib/zonas'
import { expandirEnBloques } from '@/lib/atribucion'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'
import { distribucionTID, veredictoTID, type ModeloTID } from '@/lib/tid'
import { minutosCarga } from '@/lib/duracion-carga'

/** Minutos → "1h20" / "45′". */
function fmtMinutos(min: number): string {
  const m = Math.round(min || 0)
  if (m <= 0) return '0'
  const h = Math.floor(m / 60), r = m % 60
  return h ? h + 'h' + (r ? String(r).padStart(2, '0') : '') : r + '′'
}

const RANGOS = [
  { label: '2 sem', dias: 14 },
  { label: '4 sem', dias: 28 },
  { label: '8 sem', dias: 56 },
  { label: 'Todo', dias: 365 },
]

const DISCS = [
  { key: 'Natacion', label: 'Natación', color: '#60a5fa', unidad: 'm' },
  { key: 'Ciclismo', label: 'Ciclismo', color: '#fbbf24', unidad: 'km' },
  { key: 'Carrera', label: 'Carrera', color: '#4ade80', unidad: 'km' },
  { key: 'Fuerza', label: 'Fuerza', color: '#f87171', unidad: 'UA' },
]

const tooltipStyle = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }

function getSemana(fecha: string) {
  const d = new Date(fecha)
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return lunes.toISOString().split('T')[0]
}

export default function VolumenPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [datosDias, setDatosDias] = useState<any[]>([])
  const [datosSemanas, setDatosSemanas] = useState<any[]>([])
  const [datosMusculo, setDatosMusculo] = useState<any[]>([])
  const [volSesionRaw, setVolSesionRaw] = useState<any[]>([])
  // Bloques (fecha, zona, minutos) para el reparto de intensidad por período,
  // mesociclos para saber qué modelo TID se planificó, y adherencia por semana.
  const [bloquesRaw, setBloquesRaw] = useState<any[]>([])
  const [mesociclos, setMesociclos] = useState<any[]>([])
  const [adherenciaSem, setAdherenciaSem] = useState<Record<string, { plan: number; hechas: number }>>({})
  const [usarSicat, setUsarSicat] = useState(true)
  const [sicat, setSicat] = useState<SicatResultado | null>(null)
  const [zonasRes, setZonasRes] = useState<SicatZonasResultado | null>(null)
  const [pondZona, setPondZona] = useState(false)
  useEffect(() => { setPondZona(typeof window !== 'undefined' && localStorage.getItem('sicat_pond_zona') === '1') }, [])
  const [rango, setRango] = useState(28)
  const [loading, setLoading] = useState(true)
  const [loadingDatos, setLoadingDatos] = useState(false)
  // Volumen y Carga eran dos pestañas: son la misma pregunta medida distinto,
  // así que ahora conviven en "Resistencia" con un conmutador de métrica.
  const [pestana, setPestana] = useState<'resistencia'|'fuerza'>('resistencia')
  const [metrica, setMetrica] = useState<'tiempo'|'carga'>('tiempo')
  const [periodoSel, setPeriodoSel] = useState<string | null>(null)
  const [vista, setVista] = useState<'dias'|'semanas'>('semanas')
  const [agrupCarga, setAgrupCarga] = useState<'sesion'|'semana'|'mes'>('semana')
  const [discsActivas, setDiscsActivas] = useState<string[]>(['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'])
  const [subVista, setSubVista] = useState<'barras'|'evolucion'>('barras')
  const [agrupEvol, setAgrupEvol] = useState<'semanas'|'meses'>('semanas')
  // El desglose por deporte arranca plegado: la gráfica combinada es la que se lee primero
  // y las de cada deporte alargaban mucho la página.
  const [discsAbierto, setDiscsAbierto] = useState(false)
  const [musculoAbierto, setMusculoAbierto] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(deps || [])
      setLoading(false)
      const act = getAtletaActivo()
      const d0 = (deps || []).find(d => d.id === act)
      if (d0) verVolumen(d0, 28)
    }
    cargar()
  }, [])

  const verVolumen = async (dep: any, dias: number) => {
    setSeleccionado(dep)
    setLoadingDatos(true)
    setAtletaActivo(dep.id)
    setSicat(null)
    setZonasRes(null)
    calcularSICAT(dep).then(setSicat)
    calcularSicatZonas(dep).then(setZonasRes)

    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    const desdeStr = desde.toISOString().split('T')[0]

    // La cadena de plan puede estar vacía (atleta sin plan); NO cortar aquí, porque
    // las sesiones libres (id_microciclo null) también cuentan en el volumen/carga.
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
    const macroIds = (macros || []).map((m: any) => m.id)
    let microIds: number[] = []
    // Se traen también fechas y TID objetivo: el veredicto de intensidad compara lo
    // entrenado contra el modelo que el entrenador declaró en ESE mesociclo.
    let mesosPlan: any[] = []
    if (macroIds.length) {
      const { data: mesos } = await supabase.from('mesociclo')
        .select('id, fecha_inicio, duracion_semanas, objetivo, tid_objetivo').in('id_macrociclo', macroIds)
      mesosPlan = mesos || []
      const mesoIds = mesosPlan.map((m: any) => m.id)
      if (mesoIds.length) {
        const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
        microIds = (micros || []).map((m: any) => m.id)
      }
    }
    setMesociclos(mesosPlan)

    const { data: sesChain } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, estado')
      .in('id_microciclo', microIds.length ? microIds : [-1])
      .eq('estado', 'Realizada')
      .gte('fecha_sesion', desdeStr)
      .order('fecha_sesion')
    // Sesiones "libres" del atleta (sin microciclo) también cuentan en el volumen.
    const { data: sesLibres } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, estado')
      .eq('id_deportista', dep.id).is('id_microciclo', null)
      .eq('estado', 'Realizada').gte('fecha_sesion', desdeStr)
    const sesiones = [...(sesChain || []), ...(sesLibres || [])]

    if (!sesiones.length) { setDatosDias([]); setDatosSemanas([]); setVolSesionRaw([]); setLoadingDatos(false); return }

    // Adherencia: planificadas vs realizadas, solo hasta HOY (una sesión futura
    // todavía no es una sesión perdida). Consulta aparte para no tocar el cálculo
    // de volumen/carga, que debe seguir contando solo lo realizado.
    const hoyIso = new Date().toISOString().split('T')[0]
    const { data: planSes } = microIds.length ? await supabase.from('sesion')
      .select('fecha_sesion, estado').in('id_microciclo', microIds)
      .gte('fecha_sesion', desdeStr).lte('fecha_sesion', hoyIso)
      .or('eliminada.is.null,eliminada.eq.false') : { data: [] }
    const adh: Record<string, { plan: number; hechas: number }> = {}
    ;(planSes || []).forEach((s: any) => {
      const k = getSemana(s.fecha_sesion).slice(5)
      if (!adh[k]) adh[k] = { plan: 0, hechas: 0 }
      adh[k].plan++
      if (s.estado === 'Realizada') adh[k].hechas++
    })
    setAdherenciaSem(adh)

    const sesIds = sesiones.map(s => s.id)
    const { data: tareas } = await supabase.from('tarea').select('id, id_sesion, orden, zona_entrenamiento, disciplina, series, descanso_segundos').in('id_sesion', sesIds)
    const tareaIds = tareas?.map(t => t.id) || []

    const { data: distancias } = tareaIds.length ? await supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : { data: [] }
    const { data: duraciones } = tareaIds.length ? await supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : { data: [] }
    const { data: ejercicios } = tareaIds.length ? await supabase.from('ejercicios').select('id_tarea, grupo_muscular, series, repeticiones').in('id_tarea', tareaIds) : { data: [] }

    const distMap: Record<number, number> = {}
    distancias?.forEach((d: any) => { distMap[d.id_tarea] = d.metros_planeados })
    const durMap: Record<number, number> = {}
    duraciones?.forEach((d: any) => { durMap[d.id_tarea] = d.tiempo_planeado })

    // La Fuerza no se mide en metros: su volumen es UA (RPE × minutos), que es de
    // SESIÓN. Los minutos que le tocan salen de la capa de atribución, así una
    // sesión de fuerza con varios ejercicios cuenta una vez (no una por tarea) y
    // un brick con fuerza dentro solo se lleva su parte.
    const bloques = expandirEnBloques(sesiones, (tareas || []).map((t: any) => ({
      id_sesion: t.id_sesion,
      orden: t.orden,
      disciplina: t.disciplina,
      series: t.series,
      descanso_segundos: t.descanso_segundos,
      zona_entrenamiento: t.zona_entrenamiento,
      p_distancia: (distancias || []).filter((d: any) => d.id_tarea === t.id),
      p_duracion: (duraciones || []).filter((d: any) => d.id_tarea === t.id),
      ejercicios: (ejercicios || []).filter((e: any) => e.id_tarea === t.id),
    })), { estimar: false })
    // Los bloques ya traen { fecha, zona, minutos } → se guardan para el reparto por zonas.
    setBloquesRaw(bloques)
    const minFuerza: Record<number, number> = {}
    bloques.filter(b => b.disciplina === 'Fuerza').forEach(b => {
      minFuerza[b.id_sesion] = (minFuerza[b.id_sesion] || 0) + b.minutos
    })
    // UA (RPE×min) por disciplina de BLOQUE, para repartir la carga de un brick entre sus
    // deportes reales. Una sesión normal queda toda bajo su única disciplina (= comportamiento
    // de antes); un brick (disciplina='Brick') se reparte y deja de "perderse" en las barras.
    const uaDiscPorSes: Record<number, Record<string, number>> = {}
    bloques.forEach(b => {
      const ses = sesiones.find(s => s.id === b.id_sesion)
      if (!ses) return
      const rpe = (ses.rpe_reportado || ses.rpe_estimado || 5)
      if (!uaDiscPorSes[b.id_sesion]) uaDiscPorSes[b.id_sesion] = {}
      uaDiscPorSes[b.id_sesion][b.disciplina] = (uaDiscPorSes[b.id_sesion][b.disciplina] || 0) + rpe * b.minutos
    })

    // Volumen por sesión
    const volSesion = sesiones.map(s => {
      const tareasSes = tareas?.filter(t => t.id_sesion === s.id) || []
      let natacion = 0, ciclismo = 0, carrera = 0
      const fuerza = (s.rpe_reportado || s.rpe_estimado || 5) * (minFuerza[s.id] || 0)
      tareasSes.forEach(t => {
        const metros = distMap[t.id]
        const seg = durMap[t.id]
        // El volumen se atribuye a la disciplina del BLOQUE (tarea), no a la de la
        // sesión: así un brick reparte su bici y su carrera en su deporte real.
        const disc = t.disciplina || s.disciplina
        if (disc === 'Natacion' && metros) natacion += metros
        if (disc === 'Ciclismo') {
          if (metros) ciclismo += metros / 1000
          else if (seg) ciclismo += seg / 60 * 0.3
        }
        if (disc === 'Carrera') {
          if (metros) carrera += metros / 1000
          else if (seg) carrera += seg / 60 * 0.2
        }
      })
      if (!tareasSes.length) {
        if (s.disciplina === 'Ciclismo') ciclismo = (s.duracion_minutos || 0) * 0.3
        if (s.disciplina === 'Carrera') carrera = (s.duracion_minutos || 0) * 0.2
      }
      const zs = tareasSes.map((t: any) => t.zona_entrenamiento).filter(Boolean)
      const zonaPico = zs.length ? zs.reduce((b: string, z: string) => (cargaZona(z).nivel > cargaZona(b).nivel ? z : b), zs[0]) : null
      return {
        fecha: s.fecha_sesion,
        disciplina: s.disciplina,
        zonaPico,
        Natacion: Math.round(natacion),
        Ciclismo: Math.round(ciclismo * 10) / 10,
        Carrera: Math.round(carrera * 10) / 10,
        Fuerza: Math.round(fuerza),
        ua: Math.round((s.rpe_reportado || s.rpe_estimado || 5) * minutosCarga(s)),
        uaDisc: uaDiscPorSes[s.id] || null,
        rpe: s.rpe_estimado,
        duracion: s.duracion_minutos,
      }
    })

    // Agrupar por día
    const diasMap: Record<string, any> = {}
    volSesion.forEach(s => {
      const k = s.fecha
      if (!diasMap[k]) diasMap[k] = { fecha: k.slice(5), Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }
      diasMap[k].Natacion += s.Natacion
      diasMap[k].Ciclismo += s.Ciclismo
      diasMap[k].Carrera += s.Carrera
      diasMap[k].Fuerza += s.Fuerza
    })
    setDatosDias(Object.values(diasMap))

    // Agrupar por semana
    const semanasMap: Record<string, any> = {}
    volSesion.forEach(s => {
      const k = getSemana(s.fecha)
      if (!semanasMap[k]) semanasMap[k] = { semana: k.slice(5), Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }
      semanasMap[k].Natacion += s.Natacion
      semanasMap[k].Ciclismo += s.Ciclismo
      semanasMap[k].Carrera += s.Carrera
      semanasMap[k].Fuerza += s.Fuerza
    })
    setDatosSemanas(Object.values(semanasMap))

    // Volumen muscular
    const musculoMap: Record<string, number> = {}
    ejercicios?.forEach((e: any) => {
      if (e.grupo_muscular) musculoMap[e.grupo_muscular] = (musculoMap[e.grupo_muscular] || 0) + (e.series || 0)
    })
    setDatosMusculo(Object.entries(musculoMap).map(([grupo, series]) => ({ grupo, series })).sort((a, b) => b.series - a.series))

    // Carga: guardamos las sesiones en bruto y derivamos sesión/semana/mes vía useMemo
    // (así el toggle SICAT recalcula al vuelo sin volver a consultar la base de datos).
    setVolSesionRaw(volSesion)

    setLoadingDatos(false)
  }

  const factorFn = (s: any) => {
    if (!usarSicat) return 1
    if (pondZona && s?.zonaPico) {
      const fz = factorSicatZona(s.disciplina, s.zonaPico, zonasRes)
      if (fz != null) return fz
    }
    return factorSicat(s.disciplina, sicat)
  }

  const cargaSesiones = useMemo(() =>
    volSesionRaw.map(s => ({ ...s, fecha: s.fecha.slice(5), ua: Math.round(s.ua * factorFn(s)) })),
    [volSesionRaw, usarSicat, sicat, pondZona, zonasRes])

  // Acumula la UA ponderada de una sesión en un bucket por disciplina. Con desglose por bloque
  // (uaDisc) reparte proporcionalmente (un brick va a sus deportes reales); sin él, toda bajo su
  // disciplina (= comportamiento anterior). Antes un brick caía en el bucket 'Brick' y no se pintaba.
  const acumularCargaDisc = (bucket: any, s: any) => {
    const uaPond = s.ua * factorFn(s)
    if (s.uaDisc) {
      const vals = Object.entries(s.uaDisc) as [string, number][]
      const totalRaw = vals.reduce((a, [, u]) => a + u, 0) || 1
      vals.forEach(([d, u]) => { if (bucket[d] !== undefined) bucket[d] += (u / totalRaw) * uaPond })
    } else {
      bucket[s.disciplina] = (bucket[s.disciplina] || 0) + uaPond
    }
    bucket.total += uaPond
  }

  const cargaSemanas = useMemo(() => {
    const map: Record<string, any> = {}
    volSesionRaw.forEach(s => {
      const k = getSemana(s.fecha).slice(5)
      if (!map[k]) map[k] = { periodo: k, Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0, total: 0 }
      acumularCargaDisc(map[k], s)
    })
    return Object.values(map)
  }, [volSesionRaw, usarSicat, sicat, pondZona, zonasRes])

  const cargaMeses = useMemo(() => {
    const map: Record<string, any> = {}
    volSesionRaw.forEach(s => {
      const k = s.fecha.slice(0, 7)
      if (!map[k]) map[k] = { periodo: k, Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0, total: 0 }
      acumularCargaDisc(map[k], s)
    })
    return Object.values(map)
  }, [volSesionRaw, usarSicat, sicat, pondZona, zonasRes])

  const cambiarRango = (dias: number) => {
    setRango(dias)
    if (seleccionado) verVolumen(seleccionado, dias)
  }

  const toggleDisc = (key: string) => {
    setDiscsActivas(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key])
  }

  const datosVol = vista === 'dias' ? datosDias : datosSemanas
  const xKeyVol = vista === 'dias' ? 'fecha' : 'semana'
  const datosCargaVista = agrupCarga === 'sesion' ? cargaSesiones : agrupCarga === 'semana' ? cargaSemanas : cargaMeses
  const xKeyCarga = agrupCarga === 'sesion' ? 'fecha' : 'periodo'

  // En recharts 3 el onClick de <BarChart> ya no entrega activeLabel de forma fiable:
  // se pone en cada <Bar>, que sí recibe el punto de datos.
  const clicPeriodo = (d: any) => {
    const label = d?.payload?.[xKeyVol] ?? d?.[xKeyVol]
    if (!label) return
    setPeriodoSel(p => (p === label ? null : label))
  }

  // ---- Resumen del período: lo primero que se ve, sin tocar controles ----
  // Los minutos salen de los bloques (que ya reparten un brick entre sus deportes).
  const resumen = useMemo(() => {
    if (!bloquesRaw.length) return null
    const porDisc: Record<string, number> = {}
    let minutos = 0
    bloquesRaw.forEach((b: any) => {
      const m = Number(b.minutos) || 0
      if (m <= 0) return
      minutos += m
      porDisc[b.disciplina] = (porDisc[b.disciplina] || 0) + m
    })
    if (!minutos) return null
    const ua = Math.round(volSesionRaw.reduce((a: number, s: any) => a + (Number(s.ua) || 0), 0))
    const semanas = new Set(volSesionRaw.map((s: any) => getSemana(s.fecha)))
    const nSemanas = Math.max(1, semanas.size)
    const dom = Object.entries(porDisc).sort((a, b) => b[1] - a[1])[0]
    const meta = DISCS.find(d => d.key === dom[0])
    // Intensidad media del período = UA por minuto ≈ RPE medio.
    const rpeMedio = minutos ? ua / minutos : 0
    return {
      minutos, porDisc, ua, nSemanas,
      mediaSemanal: Math.round(minutos / nSemanas),
      sesPorSemana: Math.round((volSesionRaw.length / nSemanas) * 10) / 10,
      domLabel: meta?.label || dom[0],
      domColor: meta?.color || '#94a3b8',
      domPct: Math.round((dom[1] / minutos) * 100),
      notaCarga: rpeMedio >= 6.5
        ? 'Intensidad media alta para el volumen acumulado.'
        : rpeMedio >= 5
          ? 'Relación entre carga y volumen dentro de lo normal.'
          : 'Mucho volumen a intensidad baja.',
    }
  }, [bloquesRaw, volSesionRaw])

  // ---- Detalle del período que se pincha en la gráfica ----
  // Las etiquetas del eje X son 'MM-DD' (fecha o lunes de la semana), así que se
  // compara por ese sufijo para no depender del año.
  const detallePeriodo = useMemo(() => {
    if (!periodoSel) return null
    const mismoPeriodo = (fecha: string) =>
      vista === 'semanas' ? getSemana(fecha).slice(5) === periodoSel : fecha.slice(5) === periodoSel

    const bloques = bloquesRaw.filter((b: any) => b.fecha && mismoPeriodo(b.fecha))
    const dist = distribucionTID(bloques.map((b: any) => ({ zona: b.zona, minutos: b.minutos })))

    // Modelo TID declarado en el mesociclo que cubre esa fecha.
    const fechaRef = bloques[0]?.fecha || null
    let objetivo: ModeloTID | null = null
    if (fechaRef) {
      const meso = mesociclos.find((m: any) => {
        if (!m.fecha_inicio || !m.tid_objetivo) return false
        const ini = new Date(m.fecha_inicio)
        const fin = new Date(ini); fin.setDate(ini.getDate() + (Number(m.duracion_semanas) || 4) * 7)
        const f = new Date(fechaRef)
        return f >= ini && f < fin
      })
      objetivo = (meso?.tid_objetivo as ModeloTID) || null
    }

    const adh = vista === 'semanas' ? (adherenciaSem[periodoSel] || null) : null
    return {
      dist,
      ver: veredictoTID(dist, objetivo),
      adh,
      adhPct: adh && adh.plan ? Math.round((adh.hechas / adh.plan) * 100) : 0,
      sesiones: volSesionRaw.filter((s: any) => mismoPeriodo(s.fecha)),
    }
  }, [periodoSel, vista, bloquesRaw, mesociclos, adherenciaSem, volSesionRaw])

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-30 pl-44 pr-6 h-[54px] flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <h1 className="text-[17px] font-bold tracking-tight truncate">Volumen y carga <span className="text-gray-500 font-normal text-[13px] hidden sm:inline">· cuánto entrena y cuánto le cuesta</span></h1>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-[13px] transition flex-shrink-0">← Dashboard</button>
      </header>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-7">
        {seleccionado ? (
          <>
          <div className="flex items-center gap-4 mb-5 flex-wrap">
            <button onClick={() => setSeleccionado(null)} title="Cambiar deportista"
              className="w-9 h-9 rounded-xl grid place-items-center text-gray-400 hover:text-white hover:bg-white/5 transition flex-shrink-0">←</button>
            <span className="w-11 h-11 rounded-[14px] grid place-items-center text-[17px] font-extrabold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(145deg,#fb923c,#ea580c)' }}>{(seleccionado.nombre || '?').trim()[0]?.toUpperCase()}</span>
            <div>
              <h2 className="text-[20px] font-bold tracking-tight leading-none">{seleccionado.nombre}</h2>
              <p className="text-[11.5px] text-gray-500 mt-1">{volSesionRaw.length} {volSesionRaw.length === 1 ? 'sesión realizada' : 'sesiones realizadas'} en el período</p>
            </div>
          </div>

          {/* Resumen del período: responde "¿cómo va?" sin tocar ningún control */}
          {resumen && (
            <div className="grid gap-4 md:grid-cols-4 mb-5">
              <div className="tp-card p-[18px]">
                <p className="text-[11.5px] text-gray-400 font-semibold">Volumen total</p>
                <p className="text-[32px] font-bold leading-none mt-2.5 tabular-nums">{fmtMinutos(resumen.minutos)}</p>
                <div className="flex h-[5px] rounded-full overflow-hidden bg-white/[0.06] mt-3">
                  {DISCS.map(d => resumen.porDisc[d.key] > 0 ? <div key={d.key} style={{ width: (resumen.porDisc[d.key] / resumen.minutos * 100) + '%', background: d.color }} /> : null)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
                  {DISCS.filter(d => resumen.porDisc[d.key] > 0).map(d => (
                    <span key={d.key} className="inline-flex items-center gap-1.5 text-[10.5px] text-gray-500">
                      <i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: d.color }} />{d.label.slice(0, 3)} <b className="text-gray-300 font-semibold">{fmtMinutos(resumen.porDisc[d.key])}</b>
                    </span>
                  ))}
                </div>
              </div>

              <div className="tp-card p-[18px]">
                <p className="text-[11.5px] text-gray-400 font-semibold">Carga total <span className="text-gray-600 font-normal">· UA</span></p>
                <p className="text-[32px] font-bold leading-none mt-2.5 tabular-nums text-orange-400">{resumen.ua.toLocaleString('es-ES')}</p>
                <p className="text-[11px] text-gray-500 mt-2.5 leading-relaxed">{resumen.notaCarga}</p>
              </div>

              <div className="tp-card p-[18px]">
                <p className="text-[11.5px] text-gray-400 font-semibold">Media semanal</p>
                <p className="text-[32px] font-bold leading-none mt-2.5 tabular-nums">{fmtMinutos(resumen.mediaSemanal)}</p>
                <p className="text-[11px] text-gray-500 mt-2.5">{resumen.nSemanas} {resumen.nSemanas === 1 ? 'semana' : 'semanas'} · {resumen.sesPorSemana} sesiones/semana</p>
              </div>

              <div className="tp-card p-[18px]">
                <p className="text-[11.5px] text-gray-400 font-semibold">Disciplina dominante</p>
                <p className="text-[22px] font-bold leading-none mt-3" style={{ color: resumen.domColor }}>{resumen.domLabel}</p>
                <p className="text-[11px] text-gray-500 mt-2.5">{resumen.domPct}% del volumen del período</p>
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => { setRango(28); verVolumen(d, 28) }}
                className={'rounded-xl p-5 border-2 text-left transition ' +
                  (seleccionado?.id === d.id ? 'bg-orange-500 border-orange-400' : 'bg-gray-900 border-gray-700 hover:border-orange-500')}>
                <h3 className="font-bold text-lg">{d.nombre}</h3>
                <p className="text-sm opacity-70">{d.sexo || 'Sin especificar'}</p>
              </button>
            ))}
            {deportistas.length === 0 && (
              <div className="col-span-2 text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">📊</div>
                <p>No tienes deportistas todavía.</p>
              </div>
            )}
          </div>
        )}

        {seleccionado && loadingDatos && (
          <div className="text-center py-16 text-gray-400">Calculando datos...</div>
        )}

        {seleccionado && !loadingDatos && (
          <div className="flex flex-col gap-4">

            {/* Pestañas: Volumen y Carga se fusionaron en Resistencia */}
            <div className="flex gap-1 border-b border-gray-800">
              {([['resistencia', 'Resistencia'], ['fuerza', 'Fuerza muscular']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setPestana(k)}
                  className={'px-4 py-2.5 text-[13.5px] font-semibold transition border-b-2 -mb-px ' +
                    (pestana === k ? 'border-orange-500 text-orange-300' : 'border-transparent text-gray-400 hover:text-white')}>
                  {l}
                </button>
              ))}
            </div>

            {/* Conmutador de métrica: la misma pregunta medida en tiempo o en carga */}
            {pestana === 'resistencia' && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex gap-0.5 bg-white/[0.04] border border-white/[0.075] rounded-xl p-1">
                  {([['tiempo', 'Tiempo'], ['carga', 'Carga (UA)']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setMetrica(k)}
                      className={'text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition ' +
                        (metrica === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white')}>{l}</button>
                  ))}
                </div>
                <p className="text-gray-500 text-[11.5px]">
                  {metrica === 'tiempo' ? 'Metros, kilómetros y minutos por disciplina.' : 'RPE × duración: cuánto costó de verdad.'}
                </p>
              </div>
            )}

            {/* Rango + SICAT: afectan a TODO lo de abajo, así que van juntos y siempre visibles */}
            <div className="flex gap-2 flex-wrap items-center">
              <p className="text-gray-500 text-xs uppercase tracking-wide mr-1">Período</p>
              {RANGOS.map(r => (
                <button key={r.dias} onClick={() => cambiarRango(r.dias)}
                  className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                    (rango === r.dias ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                  {r.label}
                </button>
              ))}
              <button onClick={() => setUsarSicat(v => !v)} title="Pondera la carga por el coste real de cada disciplina para este atleta"
                className={'ml-auto inline-flex items-center gap-2.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border transition ' +
                  (usarSicat ? 'bg-cyan-500/12 border-cyan-500/40 text-cyan-300' : 'bg-white/[0.04] border-white/[0.075] text-gray-400 hover:text-white')}>
                <span className={'w-[26px] h-[15px] rounded-full relative transition ' + (usarSicat ? 'bg-cyan-500' : 'bg-gray-600')}>
                  <span className={'absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white transition-all ' + (usarSicat ? 'left-[13px]' : 'left-[2px]')} />
                </span>
                SICAT
              </button>
            </div>
            {usarSicat && (
              <p className="text-gray-500 text-[11px] -mt-2">Carga ponderada por el coste real de cada disciplina para este atleta.</p>
            )}

            {/* PESTAÑA VOLUMEN */}
            {pestana === 'resistencia' && metrica === 'tiempo' && (
              <div className="flex flex-col gap-4">
                {/* Selector de subvista */}
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => setSubVista('barras')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (subVista === 'barras' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    📊 Volumen total
                  </button>
                  <button onClick={() => setSubVista('evolucion')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (subVista === 'evolucion' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    📈 Evolución
                  </button>
                </div>

                {/* SUBVISTA EVOLUCIÓN */}
                {subVista === 'evolucion' && (() => {
                  const datosEvol = agrupEvol === 'semanas' ? datosSemanas : (() => {
                    const mesesMap: Record<string, any> = {}
                    datosSemanas.forEach(s => {
                      const mes = s.semana ? s.semana.slice(0,5) : s.fecha?.slice(0,5)
                      if (!mes) return
                      if (!mesesMap[mes]) mesesMap[mes] = { periodo: mes, Natacion: 0, Ciclismo: 0, Carrera: 0 }
                      mesesMap[mes].Natacion += s.Natacion || 0
                      mesesMap[mes].Ciclismo += s.Ciclismo || 0
                      mesesMap[mes].Carrera += s.Carrera || 0
                    })
                    return Object.values(mesesMap)
                  })()

                  const calcCambio = (datos: any[], key: string) => {
                    if (datos.length < 2) return null
                    const ultimo = datos[datos.length - 1]?.[key] || 0
                    const anterior = datos[datos.length - 2]?.[key] || 0
                    if (!anterior) return null
                    return Math.round(((ultimo - anterior) / anterior) * 100)
                  }

                  return (
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-2 items-center">
                        <button onClick={() => setAgrupEvol('semanas')}
                          className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (agrupEvol === 'semanas' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                          Por semanas
                        </button>
                        <button onClick={() => setAgrupEvol('meses')}
                          className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (agrupEvol === 'meses' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                          Por meses
                        </button>
                      </div>

                      {/* Tarjetas de % cambio */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { key: 'Natacion', label: 'Natación', color: '#60a5fa', unidad: 'm' },
                          { key: 'Ciclismo', label: 'Ciclismo', color: '#fbbf24', unidad: 'km' },
                          { key: 'Carrera', label: 'Carrera', color: '#4ade80', unidad: 'km' },
                        ].map(d => {
                          const cambio = calcCambio(datosEvol, d.key)
                          const ultimoVal = datosEvol[datosEvol.length - 1]?.[d.key]
                          return (
                            <div key={d.key} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                              <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                              <p className="font-bold text-lg" style={{ color: d.color }}>
                                {ultimoVal ? Math.round(ultimoVal) + ' ' + d.unidad : '—'}
                              </p>
                              {cambio !== null && (
                                <p className={'text-xs font-medium mt-1 ' + (cambio > 0 ? 'text-green-400' : cambio < 0 ? 'text-red-400' : 'text-gray-400')}>
                                  {cambio > 0 ? '▲' : cambio < 0 ? '▼' : '='} {Math.abs(cambio)}% vs {agrupEvol === 'semanas' ? 'sem anterior' : 'mes anterior'}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Gráfica de líneas */}
                      {datosEvol.length > 0 ? (
                        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                          <p className="text-sm font-medium text-gray-300 mb-3">
                            Evolución del volumen por {agrupEvol === 'semanas' ? 'semana' : 'mes'}
                          </p>
                          <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={datosEvol}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis dataKey={agrupEvol === 'semanas' ? 'semana' : 'periodo'} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                              <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                              <Tooltip contentStyle={tooltipStyle} />
                              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                              <Line type="monotone" dataKey="Natacion" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 4 }} name="Natación (m)" connectNulls />
                              <Line type="monotone" dataKey="Ciclismo" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 4 }} name="Ciclismo (km)" connectNulls />
                              <Line type="monotone" dataKey="Carrera" stroke="#4ade80" strokeWidth={2.5} dot={{ r: 4 }} name="Carrera (km)" connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500">No hay datos suficientes para mostrar la evolución.</div>
                      )}
                    </div>
                  )
                })()}

                {/* SUBVISTA BARRAS — vista original */}
                {subVista === 'barras' && (
                <div className="flex flex-col gap-4">
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => setVista('dias')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (vista === 'dias' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    Por días
                  </button>
                  <button onClick={() => setVista('semanas')}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (vista === 'semanas' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    Por semanas
                  </button>
                  <div className="flex gap-2 ml-2">
                    {DISCS.map(d => (
                      <button key={d.key} onClick={() => toggleDisc(d.key)}
                        className={'px-3 py-1 rounded-lg text-xs font-medium transition border ' +
                          (discsActivas.includes(d.key) ? 'text-gray-900 border-transparent' : 'bg-gray-800 text-gray-400 border-gray-700')}
                        style={discsActivas.includes(d.key) ? { background: d.color, borderColor: d.color } : {}}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {datosVol.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No hay sesiones realizadas en este período.</div>
                ) : (
                  <>
                    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                      <p className="text-sm font-medium text-gray-300 mb-3">Volumen combinado por {vista === 'dias' ? 'día' : 'semana'}</p>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={datosVol}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey={xKeyVol} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                          <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                          {DISCS.filter(d => discsActivas.includes(d.key)).map(d => (
                            <Bar key={d.key} dataKey={d.key} fill={d.color} name={d.label} stackId="a" radius={[3,3,0,0]} onClick={clicPeriodo} cursor="pointer" />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {(() => {
                      // Desglose por deporte: una gráfica por disciplina, plegable en bloque.
                      // No usa .tp-collapse (max-height) porque ResponsiveContainer mide 0px
                      // dentro de un contenedor colapsado; se monta y desmonta.
                      const discsConDatos = DISCS.filter(d => discsActivas.includes(d.key) && datosVol.some(r => r[d.key] > 0))
                      if (!discsConDatos.length) return null
                      return (
                        <div className="flex flex-col gap-4">
                          <button onClick={() => setDiscsAbierto(v => !v)}
                            className="w-full flex items-center justify-between gap-3 bg-gray-900 hover:bg-gray-800/80 rounded-xl px-5 py-3.5 border border-gray-800 transition text-left">
                            <div className="flex items-center gap-3 min-w-0">
                              <p className="text-sm font-medium text-gray-300">Desglose por deporte</p>
                              <div className="flex items-center gap-1.5">
                                {discsConDatos.map(d => (
                                  <i key={d.key} className="w-2 h-2 rounded-full" style={{ background: d.color }} title={d.label} />
                                ))}
                              </div>
                              <span className="text-[11px] text-gray-500">
                                {discsConDatos.length} {discsConDatos.length === 1 ? 'gráfica' : 'gráficas'}
                              </span>
                            </div>
                            <span className={'text-gray-500 text-xs tp-chev' + (discsAbierto ? ' open' : '')}>▼</span>
                          </button>

                          {discsAbierto && discsConDatos.map(d => (
                            <div key={d.key} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                              <p className="text-sm font-medium mb-3" style={{ color: d.color }}>{d.label} — {d.unidad} por {vista === 'dias' ? 'día' : 'semana'}</p>
                              <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={datosVol}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                  <XAxis dataKey={xKeyVol} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                                  <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit={d.unidad} />
                                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' ' + d.unidad, d.label]} />
                                  <Bar dataKey={d.key} fill={d.color} radius={[4,4,0,0]} onClick={clicPeriodo} cursor="pointer" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {datosMusculo.length > 0 && (
                      <div className="flex flex-col gap-4">
                        <button onClick={() => setMusculoAbierto(v => !v)}
                          className="w-full flex items-center justify-between gap-3 bg-gray-900 hover:bg-gray-800/80 rounded-xl px-5 py-3.5 border border-gray-800 transition text-left">
                          <div className="flex items-center gap-3 min-w-0">
                            <p className="text-sm font-medium text-red-400">💪 Volumen muscular</p>
                            <span className="text-[11px] text-gray-500">
                              {datosMusculo.length} {datosMusculo.length === 1 ? 'grupo' : 'grupos'} · {datosMusculo.reduce((a, m) => a + (m.series || 0), 0)} series
                            </span>
                          </div>
                          <span className={'text-gray-500 text-xs tp-chev' + (musculoAbierto ? ' open' : '')}>▼</span>
                        </button>

                        {musculoAbierto && (
                          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                            <p className="text-sm font-medium text-red-400 mb-3">Series por grupo</p>
                            <ResponsiveContainer width="100%" height={Math.max(200, datosMusculo.length * 40)}>
                              <BarChart data={datosMusculo} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" series" />
                                <YAxis type="category" dataKey="grupo" stroke="#9ca3af" tick={{ fontSize: 10 }} width={140} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' series', 'Volumen']} />
                                <Bar dataKey="series" fill="#f87171" radius={[0,4,4,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                </div>
                )}
              </div>
            )}

            {/* PESTAÑA FUERZA */}
            {pestana === 'fuerza' && (
              <div className="flex flex-col gap-4">
                {datosMusculo.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">
                    <div className="text-5xl mb-4">💪</div>
                    <p>No hay datos de ejercicios de fuerza todavía.</p>
                    <p className="text-sm mt-2 text-gray-600">Crea sesiones de fuerza con ejercicios para ver el volumen muscular.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Mantenimiento', rango: '< 4 series', color: 'text-blue-400', bg: 'bg-blue-900 border-blue-700' },
                        { label: 'Desarrollo', rango: '4–8 series', color: 'text-green-400', bg: 'bg-green-900 border-green-700' },
                        { label: 'Carga alta', rango: '9–12 series', color: 'text-yellow-400', bg: 'bg-yellow-900 border-yellow-700' },
                        { label: 'Sobrevolumen', rango: '> 12 series', color: 'text-red-400', bg: 'bg-red-900 border-red-700' },
                      ].map(z => (
                        <div key={z.label} className={'rounded-xl p-3 border text-center ' + z.bg}>
                          <p className={'font-bold text-sm ' + z.color}>{z.label}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{z.rango}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                      <p className="text-sm font-medium text-red-400 mb-3">Series por grupo muscular</p>
                      <ResponsiveContainer width="100%" height={Math.max(250, datosMusculo.length * 45)}>
                        <BarChart data={datosMusculo} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" series" />
                          <YAxis type="category" dataKey="grupo" stroke="#9ca3af" tick={{ fontSize: 10 }} width={160} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + ' series', 'Volumen']} />
                          <Bar dataKey="series" radius={[0,4,4,0]} name="Series"
                            fill="#f87171"
                            label={{ position: 'right', fontSize: 11, fill: '#9ca3af', formatter: (v: any) => v + ' series' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid gap-2">
                      {datosMusculo.map(m => {
                        const estado = m.series < 4 ? { label: 'Mantenimiento', color: 'text-blue-400', bg: 'bg-blue-900 border-blue-700' }
                          : m.series <= 8 ? { label: 'Desarrollo', color: 'text-green-400', bg: 'bg-green-900 border-green-700' }
                          : m.series <= 12 ? { label: 'Carga alta', color: 'text-yellow-400', bg: 'bg-yellow-900 border-yellow-700' }
                          : { label: '⚠️ Sobrevolumen', color: 'text-red-400', bg: 'bg-red-900 border-red-700' }
                        return (
                          <div key={m.grupo} className={'flex justify-between items-center rounded-xl px-4 py-3 border ' + estado.bg}>
                            <p className="font-medium text-sm text-white">{m.grupo}</p>
                            <div className="flex items-center gap-3">
                              <p className={'text-xs ' + estado.color}>{estado.label}</p>
                              <p className="font-bold text-white">{m.series} series</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PESTAÑA CARGA */}
            {pestana === 'resistencia' && metrica === 'carga' && (
              <div className="flex flex-col gap-4">
                <div className="flex gap-2 flex-wrap items-center">
                  <p className="text-gray-500 text-xs uppercase tracking-wide mr-1">Agrupar por</p>
                  {[{k:'sesion',l:'Sesión'},{k:'semana',l:'Semana'},{k:'mes',l:'Mes'}].map(a => (
                    <button key={a.k} onClick={() => setAgrupCarga(a.k as any)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                        (agrupCarga === a.k ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                      {a.l}
                    </button>
                  ))}
                </div>

                {datosCargaVista.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No hay datos de carga en este período.</div>
                ) : (
                  <>
                    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                      <p className="text-sm font-medium text-gray-300 mb-1">Carga por {agrupCarga === 'sesion' ? 'sesión' : agrupCarga === 'semana' ? 'semana' : 'mes'}</p>
                      <p className="text-xs text-gray-500 mb-3">UA = RPE × duración en minutos</p>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={datosCargaVista}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey={xKeyCarga} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                          <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" UA" />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                          {agrupCarga === 'sesion' ? (
                            <Bar dataKey="ua" name="Carga UA" fill="#f97316" radius={[4,4,0,0]} />
                          ) : (
                            DISCS.map(d => (
                              <Bar key={d.key} dataKey={d.key} fill={d.color} name={d.label} stackId="a" radius={[3,3,0,0]} />
                            ))
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {agrupCarga === 'sesion' && (
                      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                        <p className="text-sm font-medium text-gray-300 mb-3">Detalle por sesión</p>
                        <div className="grid gap-2">
                          {[...datosCargaVista].reverse().slice(0, 10).map((s: any, i: number) => (
                            <div key={i} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
                              <div className="flex items-center gap-3">
                                <span className="text-gray-400 text-xs w-12">{s.fecha}</span>
                                <span className={'text-xs px-2 py-0.5 rounded-full ' +
                                  (s.disciplina === 'Natacion' ? 'bg-blue-900 text-blue-300' :
                                   s.disciplina === 'Ciclismo' ? 'bg-yellow-900 text-yellow-300' :
                                   s.disciplina === 'Carrera' ? 'bg-green-900 text-green-300' :
                                   'bg-red-900 text-red-300')}>
                                  {s.disciplina}
                                </span>
                                <span className="text-gray-400 text-xs">{s.duracion} min · RPE {s.rpe}</span>
                              </div>
                              <span className="text-orange-400 font-bold text-sm">{s.ua} UA</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

                {/* Detalle del período seleccionado: reparto de intensidad + veredicto */}
                {detallePeriodo && (
                  <div className="tp-card p-5">
                    <div className="flex items-baseline gap-3 flex-wrap mb-4">
                      <p className="text-[15px] font-bold">{vista === 'semanas' ? 'Semana del ' : ''}{periodoSel}</p>
                      <span className="text-[12px] text-gray-500">{fmtMinutos(detallePeriodo.dist.minutos)} con zona asignada</span>
                      <button onClick={() => setPeriodoSel(null)} className="ml-auto text-gray-500 hover:text-white text-lg leading-none">×</button>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <p className="text-[10.5px] font-bold tracking-[.06em] uppercase text-gray-500 mb-2.5">Distribución de intensidad</p>
                        <div className="flex h-2.5 rounded-full overflow-hidden bg-white/[0.06]">
                          {([['baja', detallePeriodo.dist.pctBaja, '#22c55e'], ['media', detallePeriodo.dist.pctMedia, '#eab308'], ['alta', detallePeriodo.dist.pctAlta, '#ef4444']] as const).map(([k, p, c]) =>
                            p > 0 ? <div key={k} style={{ width: p + '%', background: c }} title={k + ' ' + p + '%'} /> : null)}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                          {([['Suave', detallePeriodo.dist.pctBaja, '#22c55e'], ['Media', detallePeriodo.dist.pctMedia, '#eab308'], ['Alta', detallePeriodo.dist.pctAlta, '#ef4444']] as const).map(([l, p, c]) => (
                            <span key={l} className="inline-flex items-center gap-1.5 text-[11.5px] text-gray-400">
                              <i className="w-2 h-2 rounded-sm inline-block" style={{ background: c }} />{l} <b className="text-gray-200 font-semibold">{p}%</b>
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 rounded-xl border p-3.5" style={{
                          borderColor: detallePeriodo.ver.tono === 'ok' ? '#22c55e44' : detallePeriodo.ver.tono === 'aviso' ? '#eab30844' : 'rgba(255,255,255,.07)',
                          background: detallePeriodo.ver.tono === 'ok' ? '#22c55e0d' : detallePeriodo.ver.tono === 'aviso' ? '#eab3080d' : 'rgba(255,255,255,.02)',
                        }}>
                          <p className="text-[13px] font-bold" style={{ color: detallePeriodo.ver.tono === 'ok' ? '#4ade80' : detallePeriodo.ver.tono === 'aviso' ? '#eab308' : '#b0b9c6' }}>
                            {detallePeriodo.ver.titulo}
                          </p>
                          <p className="text-[12px] text-gray-400 mt-1.5 leading-relaxed">{detallePeriodo.ver.texto}</p>
                        </div>
                        {detallePeriodo.dist.sinZona > 0 && (
                          <p className="text-[11px] text-gray-600 mt-2.5">{fmtMinutos(detallePeriodo.dist.sinZona)} sin zona asignada, no entran en el reparto.</p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10.5px] font-bold tracking-[.06em] uppercase text-gray-500 mb-2.5">Adherencia</p>
                        {detallePeriodo.adh ? (
                          <>
                            <div className="flex items-baseline gap-2.5">
                              <span className="text-[30px] font-bold leading-none tabular-nums" style={{ color: detallePeriodo.adhPct >= 85 ? '#4ade80' : detallePeriodo.adhPct >= 65 ? '#f97316' : '#ef4444' }}>{detallePeriodo.adhPct}%</span>
                              <span className="text-[12px] text-gray-500">{detallePeriodo.adh.hechas} de {detallePeriodo.adh.plan} sesiones</span>
                            </div>
                            <div className="flex gap-1 mt-3 flex-wrap">
                              {Array.from({ length: detallePeriodo.adh!.plan }, (_, i) => (
                                <i key={i} className="w-3 h-3 rounded-[3px]" style={{ background: i < detallePeriodo.adh!.hechas ? (detallePeriodo.adhPct >= 85 ? '#4ade80' : '#f97316') : '#3f3f46' }} />
                              ))}
                            </div>
                          </>
                        ) : <p className="text-gray-500 text-[12.5px]">Sin sesiones planificadas en este período.</p>}

                        <p className="text-[10.5px] font-bold tracking-[.06em] uppercase text-gray-500 mt-5 mb-2">Sesiones</p>
                        <div className="flex flex-col max-h-[220px] overflow-y-auto">
                          {detallePeriodo.sesiones.length === 0 ? <p className="text-gray-500 text-[12.5px]">Ninguna.</p> : detallePeriodo.sesiones.map((s: any, i: number) => (
                            <div key={i} className="flex items-center gap-2.5 py-2 border-t border-white/[0.05] first:border-t-0 text-[12px]">
                              <i className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: (DISCS.find(d => d.key === s.disciplina) || { color: '#6b7280' }).color }} />
                              <span className="text-gray-200">{s.disciplina}</span>
                              {s.zonaPico && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: cargaZona(s.zonaPico).color + '26', color: cargaZona(s.zonaPico).color }}>{s.zonaPico}</span>}
                              <span className="ml-auto text-gray-500 text-[11px]">{s.duracion ? fmtMinutos(s.duracion) : '—'}{s.rpe ? ' · RPE ' + s.rpe : ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
          </div>
        )}
      </div>
    </main>
  )
}

