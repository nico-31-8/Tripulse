'use client'
// ============================================================
// Dirigir la sesión — el entrenador a pie de pista
// ============================================================
// La misma sesión que ve el atleta en /ejecutar, pero puesta para QUIEN APUNTA
// DESDE FUERA: de pie, con una mano, mirando al agua y no a la pantalla.
//
// POR QUÉ NO SIRVE /ejecutar TAL CUAL. Existe y ni siquiera tiene guardia de
// rol, así que un entrenador puede entrar hoy mismo. Pero está montada como la
// vive el que entrena: fases bloque a bloque en orden, un cronómetro global que
// arranca al entrar, y un cuestionario final en primera persona. Nada de eso
// encaja con estar tú apuntando lo suyo mientras habláis.
//
// LAS TRES DIFERENCIAS QUE IMPORTAN
//   · Un cronómetro POR SERIE, y el descanso arranca solo al parar una.
//   · Todo a la vista y en cualquier orden: cronometras la tercera y rellenas
//     la segunda después. Un flujo que obliga a ir en orden se abandona.
//   · Se guarda QUIÉN lo apuntó. El RPE puesto a ojo por el entrenador no es el
//     esfuerzo percibido del atleta, y el SICAT calcula con ese número.
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { fechaLargaCompleta } from '@/lib/fechas'
import { cargaZona } from '@/lib/zonas'
import Cargando from '@/components/Cargando'
import {
  estadoInicial, pulsar, parar, msDeSerie, msDeDescanso, descansoPasado,
  reloj, relojCorto, filasDe, hechas, notasDe, avisoAlSalir, conNota, type Estado,
} from '@/lib/dirigir-sesion'

const EMOJI: Record<string, string> = { Natacion: '🏊', 'Natación': '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️', Brick: '🔀' }

/** Qué se le pidió a esta tarea, para leerlo de un vistazo. */
function objetivoDe(t: any): string {
  const series = t.series > 1 ? t.series + ' × ' : ''
  const m = t.p_distancia?.[0]?.metros_planeados
  if (m) return series + (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m')
  const seg = t.p_duracion?.[0]?.tiempo_planeado
  if (seg) return series + Math.round(seg / 60) + ' min'
  const reps = t.ejercicios?.[0]?.repeticiones
  if (reps) return series + reps + ' reps'
  return t.series ? t.series + ' series' : '—'
}

export default function DirigirSesion({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()

  const [sesion, setSesion] = useState<any>(null)
  const [tareas, setTareas] = useState<any[]>([])
  const [nombre, setNombre] = useState('')
  const [cargando, setCargando] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [guardando, setGuardando] = useState(false)

  /* Un cronómetro por TAREA: cada bloque tiene sus series y su propio ciclo.
     Indexado por id de tarea y no por posición, que al reordenar bailaría. */
  const [relojes, setRelojes] = useState<Record<number, Estado>>({})
  const [ahora, setAhora] = useState(() => Date.now())

  const [rpe, setRpe] = useState<number | null>(null)
  /* De dónde sale ese RPE. Por defecto «se lo he preguntado», que es lo que
     debería pasar: el número es suyo y el entrenador solo lo transcribe. */
  const [rpeOrigen, setRpeOrigen] = useState<'atleta' | 'entrenador'>('atleta')
  const [notaSesion, setNotaSesion] = useState('')

  useEffect(() => { cargar() }, [id])

  /* Un solo intervalo para toda la pantalla. Cada décima se repinta lo que esté
     corriendo; si no corre nada, no se programa nada. */
  const algoCorriendo = Object.values(relojes).some(e => e.modo !== 'parado')
  useEffect(() => {
    if (!algoCorriendo) return
    const t = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(t)
  }, [algoCorriendo])

  const cargar = async () => {
    const { data: ses } = await supabase.from('sesion').select('*').eq('id', id).single()
    if (!ses) { setNoExiste(true); setCargando(false); return }
    setSesion(ses)
    setRpe(ses.rpe_reportado ?? null)

    const [{ data: tar }, { data: dep }] = await Promise.all([
      supabase.from('tarea')
        .select('*, p_distancia(*), p_duracion(*), p_repeticiones(*), ejercicios(*)')
        .eq('id_sesion', id).order('orden'),
      ses.id_deportista
        ? supabase.from('deportista').select('nombre').eq('id', ses.id_deportista).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setNombre((dep as any)?.nombre || '')

    const lista = tar || []
    setTareas(lista)
    /* Un reloj por tarea, con tantas series como se prescribieron. Mínimo una:
       un bloque continuo también se cronometra, solo que tiene una sola. */
    const iniciales: Record<number, Estado> = {}
    lista.forEach((t: any) => { iniciales[t.id] = estadoInicial(Math.max(1, t.series || 1)) })
    setRelojes(iniciales)
    setCargando(false)
  }

  const tocar = (idTarea: number, i: number) =>
    setRelojes(r => ({ ...r, [idTarea]: pulsar(r[idTarea], i, Date.now()) }))

  const ponerNota = (idTarea: number, i: number) => {
    const actual = relojes[idTarea]?.series[i]?.nota || ''
    const txt = prompt('Nota de la serie ' + (i + 1), actual)
    if (txt === null) return
    setRelojes(r => {
      const e = r[idTarea]
      const series = e.series.map((s, k) => k === i ? { ...s, nota: txt.trim() } : s)
      return { ...r, [idTarea]: { ...e, series } }
    })
  }

  const guardar = async () => {
    setGuardando(true)
    const ahoraMs = Date.now()

    /* Se cierra lo que estuviera corriendo antes de guardar. Sin esto, la serie
       en marcha al pulsar «Guardar» se perdería — y es justo la última, la que
       acaba de terminar el atleta. */
    const cerrados: Record<number, Estado> = {}
    for (const [k, e] of Object.entries(relojes)) cerrados[Number(k)] = parar(e, ahoraMs)
    setRelojes(cerrados)

    for (const t of tareas) {
      const e = cerrados[t.id]
      if (!e) continue
      const filas = filasDe(e.series, t.id)

      /* Se borran las de este mismo anotador antes de reinsertar: si el
         entrenador corrige y vuelve a guardar, no se duplican. Las del atleta
         NO se tocan aquí — eso lo decide el aviso de más abajo. */
      if (filas.length) {
        await supabase.from('series_realizadas').delete()
          .eq('id_tarea', t.id).eq('anotado_por', 'entrenador')
        const { error } = await supabase.from('series_realizadas').insert(filas)
        if (error) {
          alert('No se han podido guardar las series: ' + error.message
            + '\n\n¿Está corrido supabase/dirigir-sesion.sql?')
          setGuardando(false)
          return
        }
      }

      const notas = notasDe(e.series)
      if (notas) await supabase.from('tarea').update({ notas_ejecucion: notas }).eq('id', t.id)
    }

    /* El RPE va con su origen. Es la diferencia entre «me dijo que un 9» y
       «le puse un 9 mirándolo», y el SICAT calcula la carga con ese número. */
    await supabase.from('sesion').update({
      estado: 'Realizada',
      ...(rpe != null ? { rpe_reportado: rpe, rpe_origen: rpeOrigen } : {}),
      ...(notaSesion.trim() ? { notas_post: notaSesion.trim() } : {}),
    }).eq('id', id)

    setGuardando(false)
    router.push('/sesion/' + id)
  }

  /* Salir SIN guardar nada. Es lo que pasa hoy con cualquier salida —no se
     escribe una sola fila hasta «Cerrar la sesión»— pero eso el entrenador no
     lo sabe mirando un botón que pone «Salir», así que se dice.

     Y si hay trabajo dentro, se pregunta. Cronometrar cuatro series y perderlas
     por pulsar «Salir» pensando en «cerrar la pantalla» sería peor que el
     problema que esto arregla. */
  const salirSinGuardar = () => {
    const series = tareas.reduce((a, t) => a + hechas(relojes[t.id]?.series || []), 0)
    const notas = tareas.reduce((a, t) => a + conNota(relojes[t.id]?.series || []), 0)
    const aviso = avisoAlSalir(series, notas, rpe != null)
    if (aviso && !confirm(aviso + '\n\n¿Salir igualmente?')) return
    router.push('/sesion/' + id)
  }

  if (cargando) return <Cargando volverA="/dashboard" />
  if (noExiste) return <Cargando volverA="/dashboard" noExiste />

  const totalHechas = tareas.reduce((a, t) => a + hechas(relojes[t.id]?.series || []), 0)
  const totalSeries = tareas.reduce((a, t) => a + (relojes[t.id]?.series.length || 0), 0)

  return (
    <main className="min-h-screen bg-gray-950 text-white pb-28">
      <nav className="bg-gray-900 pl-16 pr-4 h-[52px] flex justify-between items-center border-b border-gray-800 sticky top-0 z-30">
        <span className="text-[11px] font-bold uppercase tracking-wider text-orange-300 border border-orange-500/45 bg-orange-500/12 px-2 py-1 rounded-md">
          Apunto yo
        </span>
        <button onClick={salirSinGuardar}
          title="Se cierra sin guardar nada"
          className="text-gray-400 hover:text-white text-sm transition">Salir sin guardar</button>
      </nav>

      <div className="max-w-lg mx-auto px-3.5 py-4 flex flex-col gap-3">

        <div className="tp-card p-[13px_15px] flex items-center gap-3">
          <span className="text-2xl leading-none flex-none">{EMOJI[sesion.disciplina] || '🏃'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-tight m-0 truncate">{nombre || 'Sesión'}</p>
            <p className="text-[11.5px] text-gray-500 m-0">
              {sesion.disciplina} · {fechaLargaCompleta(sesion.fecha_sesion)}
            </p>
          </div>
          {totalSeries > 0 && (
            <span className="text-[12px] font-mono tabular-nums text-gray-400 flex-none">
              {totalHechas}/{totalSeries}
            </span>
          )}
        </div>

        {tareas.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-10">
            Esta sesión no tiene bloques. Añádelos desde la ficha antes de dirigirla.
          </p>
        )}

        {tareas.map(t => {
          const e = relojes[t.id]
          if (!e) return null
          const zc = cargaZona(t.zona_entrenamiento).color
          const prescrito = t.descanso_segundos as number | null
          const ej = t.ejercicios?.[0]

          return (
            <div key={t.id} className="tp-card overflow-hidden">
              <div className="px-3.5 pt-3 pb-2 flex items-baseline gap-2 flex-wrap">
                <strong className="text-[14.5px] tracking-tight">{ej?.nombre || objetivoDe(t)}</strong>
                {t.zona_entrenamiento && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: zc, background: `color-mix(in oklab, ${zc} 17%, transparent)` }}>
                    {t.zona_entrenamiento}
                  </span>
                )}
                <span className="text-[11.5px] text-gray-500 font-mono">
                  {ej ? objetivoDe(t) : ''}{prescrito ? (ej ? ' · ' : '') + prescrito + ' s rec' : ''}
                </span>
              </div>

              <div className="px-2.5 pb-2.5 flex flex-col gap-1.5">
                {e.series.map((s, i) => {
                  const ms = msDeSerie(e, i, ahora)
                  const corriendo = e.modo === 'serie' && e.indice === i
                  const msDesc = msDeDescanso(e, i, ahora)
                  const descCorriendo = e.modo === 'descanso' && e.indice === i
                  const pasado = descansoPasado(msDesc, prescrito)

                  return (
                    <div key={i}>
                      <div className={'flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition '
                        + (corriendo ? 'border-green-400 bg-green-400/10'
                          : s.ms != null ? 'border-white/[0.13] bg-white/[0.02]'
                          : 'border-white/[0.07] bg-white/[0.02]')}>
                        <span className={'font-mono text-[12px] w-4 flex-none ' + (corriendo ? 'text-green-400 font-bold' : 'text-gray-500')}>
                          {i + 1}
                        </span>

                        {/* 52px: se pulsa de pie, con una mano y sin mirar. */}
                        <button onClick={() => tocar(t.id, i)}
                          aria-label={corriendo ? 'Parar la serie ' + (i + 1)
                            : s.ms != null ? 'Repetir la serie ' + (i + 1)
                            : 'Empezar la serie ' + (i + 1)}
                          className={'w-[52px] h-[52px] rounded-2xl flex-none grid place-items-center text-[19px] leading-none transition active:scale-95 '
                            + (corriendo ? 'bg-red-400 text-red-950 hover:bg-red-300'
                              : s.ms != null ? 'bg-gray-800 text-gray-400 text-[15px] hover:bg-gray-700 hover:text-white'
                              : 'bg-green-400 text-green-950 hover:bg-green-300')}>
                          {corriendo ? '■' : s.ms != null ? '↻' : '▶'}
                        </button>

                        <span className={'flex-1 text-right font-mono tabular-nums tracking-tight '
                          + (ms == null ? 'text-[19px] text-gray-600'
                            : corriendo ? 'text-[22px] font-bold text-green-400'
                            : 'text-[22px] font-bold')}>
                          {reloj(ms)}
                        </span>

                        <button onClick={() => ponerNota(t.id, i)}
                          aria-label={'Nota de la serie ' + (i + 1)}
                          className={'text-[12px] px-2.5 py-2 rounded-lg border flex-none transition '
                            + (s.nota ? 'text-amber-300 border-amber-500/50 bg-amber-500/12'
                              : 'text-gray-500 border-gray-700 bg-white/[0.03] hover:text-orange-300 hover:border-orange-500/50')}>
                          ✎
                        </button>
                      </div>

                      {s.nota && (
                        <p className="ml-[46px] mt-1 mb-0 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] text-[12px] text-amber-100/90">
                          {s.nota}
                        </p>
                      )}

                      {(descCorriendo || s.descansoMs != null) && (
                        <div className={'flex items-center gap-2 pl-[46px] pr-1 pt-1.5 text-[11.5px] '
                          + (pasado ? 'text-amber-400' : descCorriendo ? 'text-blue-400' : 'text-gray-600')}>
                          <span>descanso</span>
                          <span className={'flex-1 h-px ' + (descCorriendo ? 'bg-blue-400/30' : 'bg-white/[0.07]')} />
                          <span className={'font-mono tabular-nums ' + (descCorriendo ? 'text-[15px] font-bold' : '')}>
                            {relojCorto(msDesc)}
                          </span>
                          {prescrito ? <span className="opacity-70 text-[10.5px]">/ {prescrito} s</span> : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {tareas.length > 0 && (
          <div className="tp-card p-[13px_15px] flex flex-col gap-3">
            <div>
              <p className="text-[11.5px] text-gray-400 mb-1.5 m-0">RPE de la sesión</p>
              <div className="flex gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setRpe(n)}
                    aria-pressed={rpe === n}
                    className={'flex-1 h-9 rounded-lg border font-mono text-[12px] font-semibold transition '
                      + (rpe === n ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white/[0.03] border-gray-700 text-gray-400 hover:border-orange-500/50 hover:text-white')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Un toque, y evita que dentro de seis meses nadie sepa si aquel 9
                lo dijo el atleta o lo puso el entrenador mirándolo. */}
            <div className="flex gap-1.5">
              {([['atleta', 'Se lo he preguntado'], ['entrenador', 'Lo estimo yo']] as const).map(([v, txt]) => (
                <button key={v} onClick={() => setRpeOrigen(v)}
                  aria-pressed={rpeOrigen === v}
                  className={'flex-1 text-[11.5px] font-semibold py-2 rounded-lg border transition '
                    + (rpeOrigen === v ? 'border-orange-500/55 bg-orange-500/12 text-orange-300'
                      : 'border-gray-700 bg-white/[0.03] text-gray-500 hover:text-white')}>
                  {txt}
                </button>
              ))}
            </div>

            <textarea value={notaSesion} onChange={ev => setNotaSesion(ev.target.value)}
              placeholder="Nota de la sesión (opcional)" rows={2}
              className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-[13px] outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
          </div>
        )}
      </div>

      {tareas.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 pt-2.5"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-lg mx-auto">
            <button onClick={guardar} disabled={guardando}
              className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white py-4 rounded-xl text-base font-bold transition disabled:bg-gray-800 disabled:text-gray-400">
              {guardando ? 'Guardando…' : 'Cerrar la sesión'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
