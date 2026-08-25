'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, fechaLarga, diasEntre } from '@/lib/fechas'
import { usuarioActual } from '@/lib/sesion'
import { vivas } from '@/lib/papelera'
import Cargando from '@/components/Cargando'
import BuscadorEjercicios, { type EjercicioBib } from '@/components/BuscadorEjercicios'
import {
  SERIE_VACIA, seriesConDatos, ejerciciosQueCuentan, volumenHoy, resumenRegistro,
  guardarRegistroFuerza, actualizarRegistroFuerza, seMidePorTiempo, ejerciciosDesdeSesion,
  resumenDeEjercicios, type EjercicioRegistro,
} from '@/lib/registro-fuerza'
import {
  resumenUltimaVez, controlUltimaVez, volumenDe, haMejorado, serieAnterior, haceTexto,
} from '@/lib/modo-mejora'
import { controlDe, siguienteControl, type ControlTipo } from '@/lib/control-esfuerzo'
import { microDelDia } from '@/lib/grupos-emision'

/* Aquí el atleta apunta la fuerza que hace por su cuenta.
   Se apunta MIENTRAS se entrena, no se planifica: la sesión nace ya Realizada.

   Lo que hace que esto sirva de algo es el «la última vez»: al añadir un
   ejercicio se le pregunta al histórico qué hizo la vez anterior, se enseña ahí
   mismo y se le rellenan las casillas con esos números. Solo tiene que cambiar
   lo que ha cambiado, que suele ser un kilo o una repetición.

   Con `?sesion=<id>` la misma pantalla CORRIGE una ya guardada en vez de crear
   otra. Es la misma pantalla a propósito: dos sitios donde se apuntan series
   acabarían enseñando cosas distintas de la misma serie. */

type Historial = { dias: number; series: any[] }
type Paso = { fecha: string; series: any[] }
type Resumida = { id: number; fecha: string; nombres: string[]; series: number }

const DESCANSO_POR_DEFECTO = 120

export default function RegistrarFuerza() {
  const router = useRouter()
  const [dep, setDep] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [biblioteca, setBiblioteca] = useState<EjercicioBib[]>([])

  // `?sesion=` se lee del navegador y no con useSearchParams para no obligar a
  // envolver la página en un Suspense solo por esto.
  const [editando, setEditando] = useState<number | null>(null)

  const [fecha, setFecha] = useState(hoyISO())
  const [duracion, setDuracion] = useState('')
  const [rpe, setRpe] = useState('')
  const [notas, setNotas] = useState('')
  const [ejercicios, setEjercicios] = useState<EjercicioRegistro[]>([])
  const [historial, setHistorial] = useState<Record<string, Historial>>({})

  // Progresión: se pide al desplegar, no al cargar. Con seis ejercicios serían
  // veinticuatro consultas por algo que quizá no se mire.
  const [progresion, setProgresion] = useState<Record<string, Paso[]>>({})
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})

  const [sesiones, setSesiones] = useState<Resumida[]>([])
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [trayendo, setTrayendo] = useState(false)

  const [descanso, setDescanso] = useState<{ restante: number; que: string } | null>(null)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState<number | null>(null)

  useEffect(() => { cargar() }, [])

  /* El descanso corre en su propio intervalo y NO se para en cero: sigue en
     positivo. Si te despistas hablando con alguien, saber que llevas 3:40
     importa más que ver un cero fijo. */
  useEffect(() => {
    if (!descanso) return
    const t = setInterval(() => setDescanso(d => d && { ...d, restante: d.restante - 1 }), 1000)
    return () => clearInterval(t)
  }, [!!descanso])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    const { data: d } = await supabase.from('deportista').select('id, nombre').eq('id_usuario', user.id).maybeSingle()
    if (!d) { setCargando(false); return }
    setDep(d)

    const bibQ = supabase.from('ejercicios_biblioteca')
      .select('id, nombre, grupo_muscular, descripcion, url_video').order('nombre')

    /* Las últimas sesiones de fuerza, para poder elegir cuál repetir. Solo la
       cabecera; los ejercicios de cada una se traen al elegirla. */
    const listaQ = vivas(supabase.from('sesion')
      .select('id, fecha_sesion')
      .eq('id_deportista', d.id).eq('disciplina', 'Fuerza').eq('estado', 'Realizada'))
      .order('fecha_sesion', { ascending: false }).limit(12)

    const [bib, lista] = await Promise.all([bibQ, listaQ])
    setBiblioteca(bib.data || [])
    await resumirSesiones(lista.data || [])

    const params = new URLSearchParams(window.location.search)

    /* `?fecha=` viene de quien nos manda desde otra pantalla ya con un día
       elegido — el alta de sesión de /mis-sesiones. Sin esto, cambiar de
       pantalla te devolvía a hoy y había que volver a ponerlo. */
    const dia = params.get('fecha')
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) setFecha(dia)

    // ¿Venimos a corregir una?
    const idSes = Number(params.get('sesion') || 0)
    if (idSes) await abrirParaCorregir(idSes, d.id)

    setCargando(false)
  }

  /** Los nombres de los ejercicios de cada sesión, para que la lista diga cuál es cuál. */
  const resumirSesiones = async (filas: any[]) => {
    if (!filas.length) { setSesiones([]); return }
    const ids = filas.map(s => s.id)
    const { data: tareas } = await supabase.from('tarea').select('id, id_sesion').in('id_sesion', ids)
    const idsTarea = (tareas || []).map((t: any) => t.id)
    const { data: ejs } = idsTarea.length
      ? await supabase.from('ejercicios').select('nombre, series, id_tarea').in('id_tarea', idsTarea)
      : { data: [] as any[] }

    const sesionDe = new Map((tareas || []).map((t: any) => [t.id, t.id_sesion]))
    const porSesion = new Map<number, { nombres: string[]; series: number }>()
    for (const e of ejs || []) {
      const id = sesionDe.get(e.id_tarea)
      if (id == null) continue
      const acc = porSesion.get(id) || { nombres: [], series: 0 }
      if (e.nombre) acc.nombres.push(e.nombre)
      acc.series += Number(e.series) || 0
      porSesion.set(id, acc)
    }
    setSesiones(filas.map(s => ({
      id: s.id, fecha: s.fecha_sesion,
      nombres: porSesion.get(s.id)?.nombres || [],
      series: porSesion.get(s.id)?.series || 0,
    })))
  }

  /** Los ejercicios de una sesión, con lo que se hizo. Sirve para repetir y para corregir. */
  const ejerciciosDe = async (idSesion: number): Promise<EjercicioRegistro[]> => {
    const { data: tareas } = await supabase.from('tarea').select('id').eq('id_sesion', idSesion).order('orden')
    const idsTarea = (tareas || []).map((t: any) => t.id)
    if (!idsTarea.length) return []

    const { data: ejs } = await supabase.from('ejercicios')
      .select('id, nombre, ejercicio_id, grupo_muscular, series, repeticiones, intensidad, control_tipo, id_tarea')
      .in('id_tarea', idsTarea)
    const idsEj = (ejs || []).map((e: any) => e.id)
    const { data: series } = idsEj.length
      ? await supabase.from('series_realizadas')
        .select('id_ejercicio, numero_serie, peso_real, repeticiones_reales, tiempo_real, control_real, control_tipo, ejercicio_numero')
        .in('id_ejercicio', idsEj)
      : { data: [] as any[] }

    const porEj = new Map<number, any[]>()
    for (const x of series || []) {
      const l = porEj.get(Number(x.id_ejercicio))
      if (l) l.push(x); else porEj.set(Number(x.id_ejercicio), [x])
    }
    // En el orden de las tareas, que es el orden en que se entrenó.
    const orden = new Map(idsTarea.map((id: number, i: number) => [id, i]))
    const ordenados = [...(ejs || [])].sort((a, b) => (orden.get(a.id_tarea) ?? 99) - (orden.get(b.id_tarea) ?? 99))
    return ejerciciosDesdeSesion(ordenados, porEj)
  }

  const abrirParaCorregir = async (idSesion: number, idDep: number) => {
    const { data: s } = await supabase.from('sesion')
      .select('id, fecha_sesion, duracion_minutos, rpe_reportado, notas_entrenador, origen, disciplina, id_deportista')
      .eq('id', idSesion).maybeSingle()
    /* Solo las suyas y solo las que se apuntó él. Lo que le prescribe el
       entrenador se corrige en la pantalla de ejecución, no aquí. */
    if (!s || Number(s.id_deportista) !== Number(idDep) || s.origen !== 'deportista' || s.disciplina !== 'Fuerza') {
      setError('Esa sesión no se puede corregir desde aquí.')
      return
    }
    setEditando(s.id)
    setFecha(String(s.fecha_sesion).slice(0, 10))
    setDuracion(s.duracion_minutos != null ? String(s.duracion_minutos) : '')
    setRpe(s.rpe_reportado != null ? String(s.rpe_reportado) : '')
    setNotas(s.notas_entrenador || '')
    setEjercicios(await ejerciciosDe(s.id))
  }

  /* Qué hizo la última vez con este ejercicio. Sale del mismo RPC que usa la
     pantalla de ejecución, así que las dos cuentan la misma historia. */
  const traerHistorial = async (nombre: string, idDep: number) => {
    if (historial[nombre]) return historial[nombre]
    const { data } = await supabase.rpc('ultima_ejecucion_fuerza', { _dep: idDep, _nombre: nombre, _antes: fecha })
    if (!data?.length) return null
    const h: Historial = { dias: Math.max(0, diasEntre(String(data[0].fecha).slice(0, 10), fecha)), series: data }
    setHistorial(prev => ({ ...prev, [nombre]: h }))
    return h
  }

  /* Si cambia el día DESPUÉS de haber añadido ejercicios, «la última vez» ya no
     es la misma. Solo se refresca el cartel, NO las casillas: recalcularlas
     borraría lo que ya ha escrito. */
  useEffect(() => {
    if (!dep || !ejercicios.length) return
    let vivo = true
    ;(async () => {
      const nuevo: Record<string, Historial> = {}
      for (const nombre of [...new Set(ejercicios.map(e => e.nombre))]) {
        const { data } = await supabase.rpc('ultima_ejecucion_fuerza', { _dep: dep.id, _nombre: nombre, _antes: fecha })
        if (data?.length) {
          nuevo[nombre] = { dias: Math.max(0, diasEntre(String(data[0].fecha).slice(0, 10), fecha)), series: data }
        }
      }
      if (vivo) setHistorial(nuevo)
    })()
    return () => { vivo = false }
  }, [fecha, dep])

  const anadirEjercicio = async (e: EjercicioBib) => {
    const h = dep ? await traerHistorial(e.nombre, dep.id) : null
    const previas = h ? h.series.filter((s: any) => (s.ejercicio_numero ?? 1) === 1) : []

    /* Las casillas nacen con lo de la última vez puesto. Y la escala también es
       la de aquel día: si lo anotaba en RPE, no tiene por qué pasarse a RIR. */
    const series = previas.length
      ? previas.map((s: any) => ({
        peso: s.peso_real != null ? String(Number(s.peso_real)) : '',
        reps: s.repeticiones_reales != null ? String(Number(s.repeticiones_reales)) : '',
        tiempo: s.tiempo_real != null ? String(Number(s.tiempo_real)) : '',
        control: s.control_real != null ? String(Number(s.control_real)) : '',
      }))
      : [{ ...SERIE_VACIA }, { ...SERIE_VACIA }, { ...SERIE_VACIA }]

    setEjercicios(prev => [...prev, {
      ejercicioId: e.id,
      nombre: e.nombre,
      grupoMuscular: e.grupo_muscular || null,
      porTiempo: seMidePorTiempo(e.nombre),
      controlTipo: (previas.find((s: any) => s.control_tipo)?.control_tipo || 'rir') as ControlTipo,
      series,
    }])
  }

  const traerSesion = async (idSesion: number) => {
    setTrayendo(true); setError('')
    const traidos = await ejerciciosDe(idSesion)
    if (!traidos.length) setError('Esa sesión no tenía ejercicios que traer.')
    else {
      setEjercicios(prev => [...prev, ...traidos])
      if (dep) for (const t of traidos) await traerHistorial(t.nombre, dep.id)
    }
    setTrayendo(false); setHojaAbierta(false)
  }

  /* La progresión de un ejercicio: las últimas veces que lo hizo, con sus series.
     Se casa por NOMBRE, igual que el «la última vez»: el histórico es de lo que
     se hizo, no de lo que se prescribió. */
  const verProgresion = async (nombre: string) => {
    const abierta = !abiertas[nombre]
    setAbiertas(p => ({ ...p, [nombre]: abierta }))
    if (!abierta || progresion[nombre] || !dep) return

    const { data: ejs } = await supabase.from('ejercicios').select('id, id_tarea').eq('nombre', nombre)
    const idsTarea = [...new Set((ejs || []).map((e: any) => e.id_tarea))]
    if (!idsTarea.length) { setProgresion(p => ({ ...p, [nombre]: [] })); return }

    const { data: tareas } = await supabase.from('tarea').select('id, id_sesion').in('id', idsTarea)
    const idsSes = [...new Set((tareas || []).map((t: any) => t.id_sesion))]
    const { data: ses } = idsSes.length
      ? await vivas(supabase.from('sesion').select('id, fecha_sesion')
        .in('id', idsSes).eq('id_deportista', dep.id).eq('estado', 'Realizada'))
        .order('fecha_sesion', { ascending: false }).limit(6)
      : { data: [] as any[] }

    const fechaDeSesion = new Map((ses || []).map((s: any) => [s.id, String(s.fecha_sesion).slice(0, 10)]))
    const sesionDeTarea = new Map((tareas || []).map((t: any) => [t.id, t.id_sesion]))
    const fechaDeEj = new Map<number, string>()
    for (const e of ejs || []) {
      const f = fechaDeSesion.get(sesionDeTarea.get(e.id_tarea))
      if (f) fechaDeEj.set(Number(e.id), f)
    }

    const idsEj = [...fechaDeEj.keys()]
    const { data: series } = idsEj.length
      ? await supabase.from('series_realizadas')
        .select('id_ejercicio, numero_serie, peso_real, repeticiones_reales, tiempo_real, control_real, control_tipo, ejercicio_numero')
        .in('id_ejercicio', idsEj)
      : { data: [] as any[] }

    const porFecha = new Map<string, any[]>()
    for (const s of series || []) {
      const f = fechaDeEj.get(Number(s.id_ejercicio))
      if (!f) continue
      const l = porFecha.get(f)
      if (l) l.push(s); else porFecha.set(f, [s])
    }
    const pasos = [...porFecha.entries()]
      .map(([f, ss]) => ({ fecha: f, series: ss.slice().sort((a, b) => (a.numero_serie || 0) - (b.numero_serie || 0)) }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    setProgresion(p => ({ ...p, [nombre]: pasos }))
  }

  const cambiarSerie = (iEj: number, iSerie: number, campo: keyof typeof SERIE_VACIA, valor: string) =>
    setEjercicios(prev => prev.map((e, i) => i !== iEj ? e : {
      ...e, series: e.series.map((s, j) => j !== iSerie ? s : { ...s, [campo]: valor }),
    }))
  const anadirSerie = (iEj: number) =>
    setEjercicios(prev => prev.map((e, i) => i !== iEj ? e : { ...e, series: [...e.series, { ...SERIE_VACIA }] }))
  const quitarEjercicio = (iEj: number) => setEjercicios(prev => prev.filter((_, i) => i !== iEj))
  const cambiarPorTiempo = (iEj: number) =>
    setEjercicios(prev => prev.map((e, i) => i !== iEj ? e : { ...e, porTiempo: !e.porTiempo }))
  const cambiarEscala = (iEj: number) =>
    setEjercicios(prev => prev.map((e, i) => i !== iEj ? e : { ...e, controlTipo: siguienteControl(e.controlTipo) }))

  const guardar = async () => {
    if (!dep) return
    setGuardando(true); setError('')

    if (editando) {
      const r = await actualizarRegistroFuerza(supabase, editando, {
        fecha,
        duracionMinutos: duracion ? Number(duracion) : null,
        rpe: rpe ? Number(rpe) : null,
        notas: notas || null,
        ejercicios,
      })
      if (r.error) setError(r.error)
      else setHecho(editando)
      setGuardando(false)
      return
    }

    /* En qué semana del plan cae, si es que tiene plan. Sin esto la sesión queda
       suelta y no suma en la vista de semana del entrenador. */
    const { data: micros } = await supabase.from('microciclo')
      .select('id, fecha_inicio, duracion_dias').eq('id_deportista', dep.id)

    const r = await guardarRegistroFuerza(supabase, {
      idDeportista: dep.id,
      fecha,
      idMicrociclo: microDelDia(micros || [], fecha)?.id ?? null,
      duracionMinutos: duracion ? Number(duracion) : null,
      rpe: rpe ? Number(rpe) : null,
      notas: notas || null,
      ejercicios,
    })
    if (r.error) setError(r.error)
    else setHecho(r.idSesion)
    setGuardando(false)
  }

  if (cargando) return <Cargando volverA="/dashboard-deportista" />
  if (!dep) return <Cargando volverA="/dashboard-deportista" noExiste />

  if (hecho) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">💪</div>
          <p className="text-xl font-bold mb-1">{editando ? 'Corregido' : 'Guardado'}</p>
          <p className="text-gray-500 text-sm mb-6">{resumenRegistro(ejercicios)} · {fechaLarga(fecha)}</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => router.push('/sesion/' + hecho)}
              className="bg-orange-500 hover:bg-orange-600 px-4 py-2.5 rounded-lg text-sm font-medium transition">Ver la sesión</button>
            <button onClick={() => router.push('/dashboard-deportista')}
              className="text-gray-400 hover:text-white text-sm py-2 transition">Volver a mi panel</button>
          </div>
        </div>
      </main>
    )
  }

  const cuentan = ejerciciosQueCuentan(ejercicios)
  const mmss = (seg: number) => {
    const m = Math.floor(Math.abs(seg) / 60), s = Math.abs(seg) % 60
    return (seg < 0 ? '+' : '') + m + ':' + String(s).padStart(2, '0')
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white pb-40">
      <nav className="bg-gray-900 px-5 py-4 flex justify-between items-center border-b border-gray-800">
        <span className="font-semibold">{editando ? 'Corregir fuerza' : 'Apuntar fuerza'}</span>
        <button onClick={() => router.push('/dashboard-deportista')} className="text-gray-400 hover:text-white text-sm transition">Salir</button>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-3.5">
        {error && <div className="bg-red-950/60 border border-red-900 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {editando && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-3.5 py-3 flex items-center gap-2.5 flex-wrap text-[13px]">
            <span className="flex-1 min-w-[170px] leading-snug">
              Estás corrigiendo la sesión del <b className="text-orange-300">{fechaLarga(fecha)}</b>. Al guardar se reemplaza; no se crea otra.
            </span>
            <button onClick={() => router.push('/mis-sesiones')} className="text-gray-400 hover:text-white text-xs underline transition">Descartar</button>
          </div>
        )}

        {/* El día, y solo el día. Los minutos y el RPE se saben AL TERMINAR, así
            que van abajo: pedirlos aquí es pedir que se adivinen. */}
        <div className="tp-card px-3.5 py-3 flex items-center gap-3">
          <span className="text-gray-400 text-[11px] flex-none">Qué día</span>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="flex-1 bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
        </div>

        {ejercicios.length === 0 && (
          <div className="tp-card px-4 py-7 text-center">
            <div className="text-4xl mb-2.5 opacity-90">🏋️</div>
            <p className="text-lg font-bold mb-1.5">¿Qué has hecho hoy?</p>
            <p className="text-gray-500 text-[13px] max-w-[250px] mx-auto leading-relaxed">
              Ve apuntando según entrenas. De cada ejercicio verás lo que hiciste la última vez.
            </p>
          </div>
        )}

        {ejercicios.map((ej, iEj) => {
          const h = historial[ej.nombre]
          const previas = h?.series
          const ctrl = controlDe(ej.controlTipo)
          const ctrlPrev = controlUltimaVez(previas)
          const volPrev = volumenDe(previas, ej.porTiempo)
          const mejorado = !!h && haMejorado(volPrev, volumenHoy(ej))
          const pasos = progresion[ej.nombre]
          const abierta = !!abiertas[ej.nombre]

          return (
            <section key={iEj} className="tp-card overflow-hidden">
              <div className="px-3.5 py-3 flex items-center gap-2 flex-wrap border-b border-white/[0.075]">
                <span className="font-semibold flex-1 min-w-[96px]">{ej.nombre}</span>
                <button onClick={() => cambiarPorTiempo(iEj)} title="Cambiar entre repeticiones y segundos"
                  className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 hover:text-white transition">
                  {ej.porTiempo ? 'por tiempo' : 'por reps'}
                </button>
                {mejorado && <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-green-600 text-white">✓ mejorado</span>}
                <button onClick={() => quitarEjercicio(iEj)} aria-label={'Quitar ' + ej.nombre}
                  className="text-gray-600 hover:text-red-400 text-[15px] px-1 transition">✕</button>
              </div>

              {h ? (
                <div className="px-3.5 py-2 bg-orange-500/[0.07] border-b border-white/[0.075] text-xs flex flex-wrap gap-x-2 items-baseline">
                  <span className="text-orange-300/90 font-medium">La última vez ({haceTexto(h.dias)}):</span>
                  <span className="text-gray-300 tabular-nums">{resumenUltimaVez(previas, ej.porTiempo)}</span>
                  {ctrlPrev.valor && <span className="text-gray-500">· {ctrlPrev.etiqueta} {ctrlPrev.valor}</span>}
                </div>
              ) : (
                <div className="px-3.5 py-2 bg-black/20 border-b border-white/[0.075] text-xs text-gray-600 leading-snug">
                  Primera vez que lo apuntas. A partir de ahora verás aquí lo que hiciste.
                </div>
              )}

              <div className="p-3.5 flex flex-col gap-1.5">
                <div className="grid grid-cols-[18px_1fr_1fr_1fr_38px] gap-1.5 text-[10px] text-gray-600 uppercase tracking-wider">
                  <span />
                  <span className="text-center">kg</span>
                  <span className="text-center">{ej.porTiempo ? 'segundos' : 'reps'}</span>
                  {/* La escala se elige aquí: no todo el mundo entrena por RIR. */}
                  <button onClick={() => cambiarEscala(iEj)} title={ctrl.ayuda}
                    className="text-center text-gray-400 hover:text-white underline decoration-dotted underline-offset-[3px] transition">
                    {ctrl.corto}
                  </button>
                  <span />
                </div>

                {ej.series.map((s, iS) => {
                  const ant = serieAnterior(previas, iS + 1)
                  const casilla = 'bg-gray-800 text-white px-1 py-2 rounded-lg w-full min-w-0 text-center tabular-nums outline-none focus:ring-2 focus:ring-orange-500'
                  return (
                    <div key={iS} className="grid grid-cols-[18px_1fr_1fr_1fr_38px] gap-1.5 items-center">
                      <span className="text-gray-600 text-xs tabular-nums">{iS + 1}</span>
                      <input type="number" inputMode="decimal" value={s.peso} className={casilla}
                        onChange={e => cambiarSerie(iEj, iS, 'peso', e.target.value)}
                        placeholder={ant?.peso_real != null ? String(Number(ant.peso_real)) : 'kg'} />
                      {ej.porTiempo ? (
                        <input type="number" inputMode="numeric" value={s.tiempo} className={casilla}
                          onChange={e => cambiarSerie(iEj, iS, 'tiempo', e.target.value)}
                          placeholder={ant?.tiempo_real != null ? String(Number(ant.tiempo_real)) : 'seg'} />
                      ) : (
                        <input type="number" inputMode="numeric" value={s.reps} className={casilla}
                          onChange={e => cambiarSerie(iEj, iS, 'reps', e.target.value)}
                          placeholder={ant?.repeticiones_reales != null ? String(Number(ant.repeticiones_reales)) : 'reps'} />
                      )}
                      <input type="number" inputMode="decimal" step="any" value={s.control} className={casilla}
                        max={ctrl.max} title={ctrl.ayuda}
                        onChange={e => cambiarSerie(iEj, iS, 'control', e.target.value)}
                        placeholder={ctrl.ph} />
                      {/* El descanso: tenía que verse. Ámbar para no competir con
                          el naranja, que es la acción principal de la pantalla. */}
                      <button onClick={() => setDescanso({ restante: DESCANSO_POR_DEFECTO, que: ej.nombre + ', serie ' + (iS + 1) })}
                        aria-label={'Empezar descanso tras la serie ' + (iS + 1)}
                        className="grid place-items-center h-[38px] rounded-lg text-[15px] text-amber-200/80 bg-amber-500/[0.13] border border-amber-500/30 hover:bg-amber-500/25 transition">
                        ⏱
                      </button>
                    </div>
                  )
                })}
                <button onClick={() => anadirSerie(iEj)}
                  className="text-gray-500 hover:text-orange-400 text-xs py-1.5 transition self-start">＋ otra serie</button>
              </div>

              <button onClick={() => verProgresion(ej.nombre)} aria-expanded={abierta}
                className="w-full text-left px-3.5 py-2.5 border-t border-white/[0.075] text-xs text-gray-500 hover:text-gray-400 flex justify-between items-center transition">
                <span>{abierta ? 'Ocultar progresión' : 'Ver progresión'}</span><span>{abierta ? '▴' : '▾'}</span>
              </button>

              {abierta && (
                <div className="border-t border-white/[0.075] px-3.5 py-3 flex flex-col gap-2.5">
                  {!pasos && <p className="text-gray-600 text-xs">Buscando…</p>}
                  {pasos && pasos.length === 0 && (
                    <p className="text-gray-600 text-xs">Todavía no hay nada anterior de este ejercicio.</p>
                  )}
                  {pasos && pasos.length > 0 && (() => {
                    const vols = pasos.map(p => volumenDe(p.series, ej.porTiempo))
                    const tope = Math.max(...vols, 1)
                    return (
                      <>
                        {pasos.map((p, i) => (
                          <div key={p.fecha} className="grid grid-cols-[50px_1fr] gap-2.5 items-center">
                            <span className="text-[11.5px] text-gray-500 tabular-nums">{p.fecha.slice(8)}/{p.fecha.slice(5, 7)}</span>
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-xs text-gray-300 tabular-nums truncate">
                                {resumenUltimaVez(p.series, ej.porTiempo)}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <i className="h-1.5 rounded-sm bg-orange-500/30 flex-none"
                                  style={{ width: Math.round((vols[i] / tope) * 100) + '%' }} />
                                <span className="text-[10.5px] text-gray-600 tabular-nums flex-none">
                                  {vols[i].toLocaleString('es-ES')}{ej.porTiempo ? ' s' : ' kg'}
                                </span>
                              </span>
                            </div>
                          </div>
                        ))}
                        <p className="text-[11px] text-gray-600 border-t border-white/[0.075] pt-2 leading-relaxed">
                          La barra es el volumen: kilos × repeticiones de las series principales.
                          En los de tiempo, los segundos.
                        </p>
                      </>
                    )
                  })()}
                </div>
              )}
            </section>
          )
        })}

        {/* Los minutos y el RPE, al final: al empezar no se saben. */}
        {ejercicios.length > 0 && (
          <div className="tp-card p-3.5">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2.5">Al terminar</p>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-gray-400 text-[11px]">Cuánto duró</span>
                <input type="number" inputMode="numeric" value={duracion} onChange={e => setDuracion(e.target.value)} placeholder="minutos"
                  className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-gray-400 text-[11px]">Cómo fue (RPE)</span>
                <input type="number" inputMode="numeric" min="1" max="10" value={rpe} onChange={e => setRpe(e.target.value)} placeholder="1-10"
                  className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 mt-2.5">
              <span className="text-gray-400 text-[11px]">Notas (opcional)</span>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                placeholder="Cómo te has sentido, molestias, lo que sea."
                className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 resize-y" />
            </label>
          </div>
        )}

        {sesiones.length > 0 && (
          <button onClick={() => setHojaAbierta(true)} disabled={trayendo}
            className={'w-full rounded-2xl py-4 text-[13.5px] transition disabled:opacity-40 ' + (ejercicios.length === 0
              ? 'border border-orange-500/45 bg-orange-500/[0.09] text-orange-300 hover:bg-orange-500/15'
              : 'border border-dashed border-gray-700 text-gray-400 hover:text-white hover:border-orange-500/60')}>
            {trayendo ? 'Trayendo…' : '↻ Traer una sesión anterior'}
          </button>
        )}

        <BuscadorEjercicios
          ejercicios={biblioteca}
          onElegir={anadirEjercicio}
          etiqueta={ejercicios.length ? '＋ Añadir otro ejercicio' : '＋ Añadir un ejercicio'}
          clase="w-full bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-700 hover:border-orange-500/60 text-gray-400 hover:text-white py-4 rounded-2xl text-[13.5px] transition"
        />
      </div>

      {/* Barras fijas: se apunta con el móvil en la mano y a media sesión la
          lista ya no cabe en la pantalla. */}
      <div className="fixed bottom-0 inset-x-0 z-40">
        {descanso && (
          <div className={'max-w-2xl mx-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-t-2xl border border-b-0 ' +
            (descanso.restante <= 0
              ? 'bg-green-600/20 border-green-500/45'
              : 'bg-amber-500/[0.16] border-amber-500/40')}>
            <span className="text-xl font-bold tabular-nums min-w-[58px]">{mmss(descanso.restante)}</span>
            <span className={'flex-1 text-[11.5px] leading-snug ' + (descanso.restante <= 0 ? 'text-green-300' : 'text-amber-200/90')}>
              {descanso.restante <= 0 ? 'Descanso cumplido · ' : ''}{descanso.que}
            </span>
            <button onClick={() => setDescanso(d => d && { ...d, restante: d.restante - 30 })}
              className="text-[11.5px] text-amber-100/90 border border-amber-500/40 rounded-lg px-2 py-1.5">−30</button>
            <button onClick={() => setDescanso(d => d && { ...d, restante: d.restante + 30 })}
              className="text-[11.5px] text-amber-100/90 border border-amber-500/40 rounded-lg px-2 py-1.5">+30</button>
            <button onClick={() => setDescanso(null)}
              className="text-[11.5px] text-amber-100/90 border border-amber-500/40 rounded-lg px-2 py-1.5">Parar</button>
          </div>
        )}
        <div className="bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <span className="text-gray-500 text-xs">{resumenRegistro(ejercicios)}</span>
            <button onClick={guardar} disabled={guardando || cuentan.length === 0}
              className="bg-orange-500 hover:bg-orange-600 px-5 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40">
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {hojaAbierta && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-end sm:items-center sm:justify-center sm:p-5"
          onClick={e => { if (e.target === e.currentTarget) setHojaAbierta(false) }}>
          <div className="bg-gray-900 border-t sm:border border-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[86%] flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-gray-800">
              <h3 className="font-bold">¿Cuál quieres repetir?</h3>
              <p className="text-gray-500 text-xs mt-0.5 leading-snug">Vienen los ejercicios con los números de aquel día puestos.</p>
            </div>
            <div className="overflow-y-auto">
              {sesiones.map(s => (
                <button key={s.id} onClick={() => traerSesion(s.id)}
                  className="w-full text-left px-4 py-3 flex gap-2.5 items-center border-b border-white/[0.04] hover:bg-white/[0.035] transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold">{fechaLarga(s.fecha)}</p>
                    <p className="text-[12.5px] text-gray-400 truncate">{resumenDeEjercicios(s.nombres)}</p>
                    <p className="text-[11px] text-gray-600 mt-0.5 tabular-nums">
                      {s.nombres.length} {s.nombres.length === 1 ? 'ejercicio' : 'ejercicios'}
                      {s.series > 0 && ' · ' + s.series + ' series'}
                    </p>
                  </div>
                  <span className="text-gray-600 flex-none">→</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-800 text-right">
              <button onClick={() => setHojaAbierta(false)} className="text-gray-400 hover:text-white text-[13.5px] transition">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
