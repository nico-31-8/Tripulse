'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, fechaLarga } from '@/lib/fechas'
import { usuarioActual } from '@/lib/sesion'
import { vivas } from '@/lib/papelera'
import Cargando from '@/components/Cargando'
import BuscadorEjercicios, { type EjercicioBib } from '@/components/BuscadorEjercicios'
import {
  SERIE_VACIA, seriesConDatos, ejerciciosQueCuentan, volumenHoy, resumenRegistro,
  guardarRegistroFuerza, seMidePorTiempo, ejerciciosDesdeSesion, type EjercicioRegistro,
} from '@/lib/registro-fuerza'
import {
  resumenUltimaVez, controlUltimaVez, volumenDe, haMejorado, serieAnterior, haceTexto,
} from '@/lib/modo-mejora'
import { microDelDia } from '@/lib/grupos-emision'
import { diasEntre } from '@/lib/fechas'

/* Aquí el atleta apunta la fuerza que hace por su cuenta.
   Se apunta MIENTRAS se entrena, no se planifica: la sesión nace ya Realizada.

   Lo que hace que esto sirva de algo es el «la última vez»: al añadir un
   ejercicio se le pregunta al histórico qué hizo la vez anterior y se enseña ahí
   mismo, además de rellenarle las casillas con esos números. Así solo tiene que
   cambiar lo que ha cambiado, que suele ser un kilo o una repetición. */

type Historial = { dias: number; series: any[] }

export default function RegistrarFuerza() {
  const router = useRouter()
  const [dep, setDep] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [biblioteca, setBiblioteca] = useState<EjercicioBib[]>([])

  const [fecha, setFecha] = useState(hoyISO())
  const [duracion, setDuracion] = useState('')
  const [rpe, setRpe] = useState('')
  const [notas, setNotas] = useState('')
  const [ejercicios, setEjercicios] = useState<EjercicioRegistro[]>([])
  const [historial, setHistorial] = useState<Record<string, Historial>>({})

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState<number | null>(null)
  const [repitiendo, setRepitiendo] = useState(false)
  const [ultima, setUltima] = useState<{ id: number; fecha: string } | null>(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    const { data: d } = await supabase.from('deportista').select('id, nombre').eq('id_usuario', user.id).maybeSingle()
    if (!d) { setCargando(false); return }
    setDep(d)
    /* ¿Tiene una sesión de fuerza anterior? Solo el encabezado: los ejercicios
       se traen si pulsa, que es lo que no se debe pagar de entrada. */
    const { data: ult } = await vivas(supabase.from('sesion')
      .select('id, fecha_sesion')
      .eq('id_deportista', d.id).eq('disciplina', 'Fuerza').eq('estado', 'Realizada'))
      .order('fecha_sesion', { ascending: false }).limit(1)
    if (ult?.length) setUltima({ id: ult[0].id, fecha: ult[0].fecha_sesion })

    const { data: bib } = await supabase.from('ejercicios_biblioteca')
      .select('id, nombre, grupo_muscular, descripcion, url_video').order('nombre')
    setBiblioteca(bib || [])
    setCargando(false)
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
     es la misma: la que valía para hoy no vale para el martes pasado. Se vuelve
     a preguntar por todos.

     Solo se refresca el cartel, NO las casillas: si se recalcularan, borraría lo
     que el atleta ya ha escrito. Lo prerrellenado se decide al añadir. */
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
    const porTiempo = seMidePorTiempo(e.nombre)
    const h = dep ? await traerHistorial(e.nombre, dep.id) : null

    /* Las casillas nacen con lo de la última vez puesto: así solo tiene que
       cambiar lo que ha cambiado. Si no hay histórico, tres series en blanco. */
    const previas = h ? h.series.filter((s: any) => (s.ejercicio_numero ?? 1) === 1) : []
    const series = previas.length
      ? previas.map((s: any) => ({
        peso: s.peso_real != null ? String(Number(s.peso_real)) : '',
        reps: s.repeticiones_reales != null ? String(Number(s.repeticiones_reales)) : '',
        tiempo: s.tiempo_real != null ? String(Number(s.tiempo_real)) : '',
        control: s.control_real != null ? String(Number(s.control_real)) : '',
      }))
      : [{ ...SERIE_VACIA }, { ...SERIE_VACIA }, { ...SERIE_VACIA }]

    setEjercicios(prev => [...prev, {
      ejercicioId: e.id, nombre: e.nombre, grupoMuscular: e.grupo_muscular || null, porTiempo, series,
    }])
  }

  /* Repetir la última: en un gimnasio se repite la rutina, y añadir cinco
     ejercicios uno a uno cada vez es la fricción que hace que la gente deje de
     apuntar. Vienen con los números de aquel día puestos. */
  const repetirUltima = async () => {
    if (!ultima || !dep) return
    setRepitiendo(true); setError('')
    const { data: tareas } = await supabase.from('tarea').select('id').eq('id_sesion', ultima.id).order('orden')
    const idsTarea = (tareas || []).map((t: any) => t.id)
    const { data: ejs } = idsTarea.length
      ? await supabase.from('ejercicios')
        .select('id, nombre, ejercicio_id, grupo_muscular, series, repeticiones, intensidad, id_tarea')
        .in('id_tarea', idsTarea)
      : { data: [] as any[] }

    const idsEj = (ejs || []).map((e: any) => e.id)
    const { data: series } = idsEj.length
      ? await supabase.from('series_realizadas')
        .select('id_ejercicio, numero_serie, peso_real, repeticiones_reales, tiempo_real, control_real, ejercicio_numero')
        .in('id_ejercicio', idsEj)
      : { data: [] as any[] }

    const porEj = new Map<number, any[]>()
    for (const x of series || []) {
      const l = porEj.get(Number(x.id_ejercicio))
      if (l) l.push(x); else porEj.set(Number(x.id_ejercicio), [x])
    }

    // En el orden de las tareas, que es el orden en que se entrenó.
    const orden = new Map(idsTarea.map((id: number, i: number) => [id, i]))
    const ordenados = [...(ejs || [])].sort((a, b) =>
      (orden.get(a.id_tarea) ?? 99) - (orden.get(b.id_tarea) ?? 99))

    const traidos = ejerciciosDesdeSesion(ordenados, porEj)
    if (!traidos.length) setError('Esa sesión no tenía ejercicios que traer.')
    else setEjercicios(prev => [...prev, ...traidos])
    setRepitiendo(false)
  }

  const cambiarPorTiempo = (iEj: number) =>
    setEjercicios(prev => prev.map((e, i) => i !== iEj ? e : { ...e, porTiempo: !e.porTiempo }))

  const cambiarSerie = (iEj: number, iSerie: number, campo: keyof typeof SERIE_VACIA, valor: string) =>
    setEjercicios(prev => prev.map((e, i) => i !== iEj ? e : {
      ...e, series: e.series.map((s, j) => j !== iSerie ? s : { ...s, [campo]: valor }),
    }))

  const anadirSerie = (iEj: number) =>
    setEjercicios(prev => prev.map((e, i) => i !== iEj ? e : { ...e, series: [...e.series, { ...SERIE_VACIA }] }))

  const quitarEjercicio = (iEj: number) => setEjercicios(prev => prev.filter((_, i) => i !== iEj))

  const guardar = async () => {
    if (!dep) return
    setGuardando(true); setError('')

    /* En qué semana del plan cae, si es que tiene plan. Sin esto la sesión queda
       suelta y no suma en la vista de semana del entrenador. */
    const { data: micros } = await supabase.from('microciclo')
      .select('id, fecha_inicio, duracion_dias').eq('id_deportista', dep.id)
    const micro = microDelDia(micros || [], fecha)

    const r = await guardarRegistroFuerza(supabase, {
      idDeportista: dep.id,
      fecha,
      idMicrociclo: micro?.id ?? null,
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
          <p className="text-xl font-bold mb-1">Guardado</p>
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

  return (
    <main className="min-h-screen bg-gray-950 text-white pb-28">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <span className="font-semibold">Apuntar fuerza</span>
        <button onClick={() => router.push('/dashboard-deportista')} className="text-gray-400 hover:text-white text-sm transition">Salir</button>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        {error && <div className="bg-red-950/60 border border-red-900 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-gray-400 text-xs">Qué día</span>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-xs">Minutos</span>
            <input type="number" inputMode="numeric" value={duracion} onChange={e => setDuracion(e.target.value)} placeholder="50"
              className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-xs">RPE</span>
            <input type="number" inputMode="numeric" min="1" max="10" value={rpe} onChange={e => setRpe(e.target.value)} placeholder="7"
              className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
          </label>
        </section>

        {ejercicios.map((ej, iEj) => {
          const h = historial[ej.nombre]
          const previas = h?.series
          const resumen = resumenUltimaVez(previas, ej.porTiempo)
          const ctrl = controlUltimaVez(previas)
          const volPrev = volumenDe(previas, ej.porTiempo)
          /* `haMejorado` y no `haSuperado`: aquí las casillas nacen RELLENAS con
             lo de la última vez, así que igualar es el punto de partida. Con >=
             la insignia salía encendida nada más añadir el ejercicio, antes de
             haber entrenado. */
          const superado = !!h && haMejorado(volPrev, volumenHoy(ej))

          return (
            <section key={iEj} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-800">
                <span className="font-semibold flex-1">{ej.nombre}</span>
                {/* Si se mide por tiempo o por repeticiones es una SUPOSICIÓN sacada
                    del nombre: la biblioteca no lo guarda. Se puede cambiar, porque
                    pedirle repeticiones a quien ha aguantado 45 segundos es pedirle
                    que se invente un dato. */}
                <button onClick={() => cambiarPorTiempo(iEj)}
                  title="Cambiar entre repeticiones y segundos"
                  className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 hover:text-white transition">
                  {ej.porTiempo ? 'por tiempo' : 'por reps'}
                </button>
                {superado && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-600 text-white">✓ superado</span>}
                <button onClick={() => quitarEjercicio(iEj)} className="text-gray-600 hover:text-red-400 text-sm px-1 transition" aria-label="Quitar">✕</button>
              </div>

              {/* Lo de la última vez. Es lo que convierte apuntar en entrenar:
                  sin esto se escriben números en el vacío. */}
              {h ? (
                <div className="px-4 py-2 bg-orange-500/[0.07] border-b border-gray-800 text-xs flex flex-wrap gap-x-2">
                  <span className="text-orange-300/90 font-medium">La última vez ({haceTexto(h.dias)}):</span>
                  <span className="text-gray-300 tabular-nums">{resumen}</span>
                  {ctrl.valor && <span className="text-gray-500">· {ctrl.etiqueta} {ctrl.valor}</span>}
                </div>
              ) : (
                <div className="px-4 py-2 bg-black/20 border-b border-gray-800 text-xs text-gray-600">
                  Primera vez que lo apuntas. A partir de ahora verás aquí lo que hiciste.
                </div>
              )}

              <div className="p-4 flex flex-col gap-2">
                {ej.series.map((s, iS) => {
                  const ant = serieAnterior(previas, iS + 1)
                  return (
                    <div key={iS} className="flex items-center gap-2">
                      <span className="text-gray-600 text-xs w-5 tabular-nums">{iS + 1}</span>
                      <input type="number" inputMode="decimal" value={s.peso}
                        onChange={e => cambiarSerie(iEj, iS, 'peso', e.target.value)}
                        placeholder={ant?.peso_real != null ? String(Number(ant.peso_real)) : 'kg'}
                        className="bg-gray-800 text-white px-3 py-2 rounded-lg w-full outline-none focus:ring-2 focus:ring-orange-500 text-center" />
                      {ej.porTiempo ? (
                        <input type="number" inputMode="numeric" value={s.tiempo}
                          onChange={e => cambiarSerie(iEj, iS, 'tiempo', e.target.value)}
                          placeholder={ant?.tiempo_real != null ? String(Number(ant.tiempo_real)) + ' s' : 'seg'}
                          className="bg-gray-800 text-white px-3 py-2 rounded-lg w-full outline-none focus:ring-2 focus:ring-orange-500 text-center" />
                      ) : (
                        <input type="number" inputMode="numeric" value={s.reps}
                          onChange={e => cambiarSerie(iEj, iS, 'reps', e.target.value)}
                          placeholder={ant?.repeticiones_reales != null ? String(Number(ant.repeticiones_reales)) : 'reps'}
                          className="bg-gray-800 text-white px-3 py-2 rounded-lg w-full outline-none focus:ring-2 focus:ring-orange-500 text-center" />
                      )}
                      <input type="number" inputMode="numeric" min="0" max="10" value={s.control}
                        onChange={e => cambiarSerie(iEj, iS, 'control', e.target.value)}
                        placeholder="RIR" title="Repeticiones que te quedaban en el depósito"
                        className="bg-gray-800 text-white px-3 py-2 rounded-lg w-full outline-none focus:ring-2 focus:ring-orange-500 text-center" />
                    </div>
                  )
                })}
                <button onClick={() => anadirSerie(iEj)}
                  className="text-gray-500 hover:text-orange-400 text-xs py-2 transition self-start">＋ otra serie</button>
              </div>
            </section>
          )
        })}

        {ultima && ejercicios.length === 0 && (
          <button onClick={repetirUltima} disabled={repitiendo}
            className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-orange-500/60 text-gray-300 hover:text-white py-4 rounded-xl transition disabled:opacity-40">
            {repitiendo ? 'Trayendo…' : '↻ Repetir mi última sesión · ' + fechaLarga(ultima.fecha)}
          </button>
        )}

        <BuscadorEjercicios
          ejercicios={biblioteca}
          onElegir={anadirEjercicio}
          etiqueta={ejercicios.length ? "＋ Añadir otro ejercicio" : "＋ Añadir el primer ejercicio"}
          clase="w-full bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-700 hover:border-orange-500 text-gray-400 hover:text-white py-4 rounded-xl transition"
        />

        {ejercicios.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-xs">Notas (opcional)</span>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Cómo te has sentido, molestias, lo que sea."
              className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 resize-y" />
          </label>
        )}
      </div>

      {/* La barra de guardar se queda fija abajo: se apunta con el móvil en la
          mano y a media sesión la lista ya no cabe en la pantalla. */}
      {ejercicios.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <span className="text-gray-500 text-xs">{resumenRegistro(ejercicios)}</span>
            <button onClick={guardar} disabled={guardando || cuentan.length === 0}
              className="bg-orange-500 hover:bg-orange-600 px-5 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
