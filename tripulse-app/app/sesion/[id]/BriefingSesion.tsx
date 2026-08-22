'use client'
// ============================================================
// Briefing de sesión — lo que ve el DEPORTISTA
// ============================================================
// La ficha servía a cuatro escenarios (entrenador/deportista × pendiente/hecha) con
// una sola pantalla llena de condicionales. Aquí vive solo el lado del atleta: qué
// le toca y cómo salir a hacerlo. Misma URL (/sesion/[id]): hay 12 enlaces apuntando
// ahí desde 8 pantallas, así que la ruta no se toca, solo se decide qué montar.
//
// Sus DOS salidas se conservan las dos:
//   ▶ Empezar      → /ejecutar (registro serie a serie, modo mejora en fuerza)
//   Ya la he hecho → cronómetro aquí + cuestionario. Es la única que escribe
//                    duracion_real y la que trae la HRV cuando no hay wellness.
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fechaLargaCompleta as fechaLarga } from '@/lib/fechas'
import { ritmoObjetivo, cargaZona } from '@/lib/zonas'
import { controlDeEjercicio } from '@/lib/control-esfuerzo'
import DatosReales from './DatosReales'
import type { ResultadoDuracion } from '@/lib/duracion'
import { minutosEfectivos } from '@/lib/duracion-carga'

const EMOJI: Record<string, string> = { Natacion: '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️', Brick: '🔀' }

// Qué se le pide en cada tarea: distancia, tiempo o repeticiones, con las series
// delante si son varias («4 × 400 m»).
function objetivoTarea(t: any): string {
  const series = t.series > 1 ? t.series + ' × ' : ''
  const m = t.p_distancia?.[0]?.metros_planeados
  if (m) return series + (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m')
  const seg = t.p_duracion?.[0]?.tiempo_planeado
  if (seg) return series + Math.round(seg / 60) + ' min'
  const reps = t.p_repeticiones?.[0]?.repeticiones_planteadas
  if (reps) return series + reps + ' reps'
  // Fuerza: las repeticiones están en el ejercicio, no en la tarea.
  const repsEj = t.ejercicios?.[0]?.repeticiones
  if (repsEj) return series + repsEj + ' reps'
  return t.series ? t.series + ' series' : '—'
}

// En fuerza lo que el atleta necesita leer es QUÉ ejercicio, no la zona: el nombre
// vive en la tabla `ejercicios`. Con superserie/complex se encadena un segundo.
function ejercicioTarea(t: any): { nombre: string; tipo: string | null } | null {
  // En técnica pasa exactamente lo mismo: lo que hay que leer es QUÉ ejercicio. La
  // zona guardada es AER, que es verdad para la carga pero no dice nada de lo que
  // toca hacer. Sin `tipo`, que la etiqueta «Técnica» ya la lleva el chip de zona.
  if (t.tecnica?.nombre) return { nombre: t.tecnica.nombre, tipo: null }
  const e = t.ejercicios?.[0]
  if (!e?.nombre) return null
  const nombre = e.ejercicio_encadenado_nombre ? e.nombre + ' + ' + e.ejercicio_encadenado_nombre : e.nombre
  return { nombre, tipo: e.tipo_serie && e.tipo_serie !== 'Normal' ? e.tipo_serie : null }
}

interface Props {
  id: string
  sesion: any
  tareas: any[]
  tests: { vam?: number | null; ftp?: number | null; css?: number | null } | null
  durEstimada: ResultadoDuracion
  recup: any
  onCambio: () => Promise<void> | void
}

export default function BriefingSesion({ id, sesion, tareas, tests, durEstimada, recup, onCambio }: Props) {
  const router = useRouter()
  const esBrick = sesion?.disciplina === 'Brick'

  // Registro sin el modo entreno (la salida que antes se llamaba «Ver sesión completa»)
  const [registrando, setRegistrando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const intervalRef = useRef<any>(null)
  const [mostrarPost, setMostrarPost] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Cuestionario post-sesión
  const [rpeReal, setRpeReal] = useState(5)
  const [sensacionTecnica, setSensacionTecnica] = useState(3)
  const [dolorMuscular, setDolorMuscular] = useState(1)
  const [fcMedia, setFcMedia] = useState('')
  const [hrvDia, setHrvDia] = useState('')
  const [notasPost, setNotasPost] = useState('')
  // En un brick el esfuerzo y la técnica se preguntan POR BLOQUE: correr después de
  // la bici no se parece a la bici, y el SICAT necesita saber de cuál viene el coste.
  const [postBloques, setPostBloques] = useState<Record<number, { rpe: number; fc: string; sensacion: number }>>({})

  useEffect(() => {
    if (registrando && sesion?.usar_cronometro) {
      intervalRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [registrando, sesion?.usar_cronometro])

  const formatTiempo = (seg: number) => {
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60
    return (h > 0 ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0')
  }

  const empezarRegistro = async () => {
    setRegistrando(true)
    if (!sesion?.hora_inicio) {
      await supabase.from('sesion').update({ hora_inicio: new Date().toISOString() }).eq('id', id)
    }
  }

  const abrirCuestionario = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (esBrick) {
      setPostBloques(Object.fromEntries(tareas.map(t => [t.id, {
        rpe: t.rpe_reportado || 5,
        fc: t.fc_media ? String(t.fc_media) : '',
        sensacion: t.sensacion_tecnica || 3,
      }])))
    }
    setMostrarPost(true)
  }

  const guardarPost = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const duracionReal = sesion.usar_cronometro && segundos > 0 ? Math.round(segundos / 60) : null
    await supabase.from('sesion').update({
      estado: 'Realizada',
      ...(duracionReal ? { duracion_real: duracionReal } : {}),
    }).eq('id', id)

    // Lo que es del DÍA va igual en todos los bloques; el SICAT lo lee así.
    const delDia = {
      dolor_muscular: dolorMuscular,
      notas_post: notasPost,
      hrv_del_dia: hrvDia ? Number(hrvDia) : null,
    }
    if (esBrick) {
      await Promise.all(tareas.map(t => {
        const b = postBloques[t.id]
        return supabase.from('tarea').update({
          ...delDia,
          rpe_reportado: b?.rpe ?? rpeReal,
          fc_media: b?.fc ? Number(b.fc) : null,
          sensacion_tecnica: b?.sensacion ?? sensacionTecnica,
        }).eq('id', t.id)
      }))
    } else {
      await supabase.from('tarea').update({
        ...delDia,
        rpe_reportado: rpeReal,
        fc_media: fcMedia ? Number(fcMedia) : null,
        sensacion_tecnica: sensacionTecnica,
      }).eq('id_sesion', id)
    }
    await onCambio()
    setMostrarPost(false)
    setGuardando(false)
    router.push('/dashboard-deportista')
  }

  // Si la sesión ya está cerrada, lo que vale es lo que cronometró, no lo que se
  // planificó: si no, al reabrirla se veía la duración del plan como si fuera la suya.
  const minutos = minutosEfectivos(sesion, durEstimada)
  const hayNutricion = sesion.nutricion_carbo_gh != null || sesion.nutricion_agua_mlh != null
    || sesion.nutricion_sodio_mgh != null || sesion.nutricion_cafeina_mg != null || sesion.nutricion_ayuno
  const realizada = sesion.estado === 'Realizada'

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-44 pr-5 h-[54px] flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/mis-sesiones')} className="text-gray-400 hover:text-white text-sm transition">
          Mis sesiones
        </button>
      </nav>

      <div className="max-w-lg mx-auto px-5 py-7 flex flex-col gap-5">

        {/* Qué toca */}
        <div className="flex flex-col items-center text-center gap-1">
          <span className="text-[12.5px] font-bold tracking-[.1em] uppercase text-blue-300">
            {EMOJI[sesion.disciplina] || ''} {sesion.disciplina}
          </span>
          <span className="text-[13px] text-gray-500">{fechaLarga(sesion.fecha_sesion)}</span>
          {minutos ? (
            <span className="text-[46px] font-extrabold tracking-tight leading-none tabular-nums mt-1">
              {minutos} <span className="text-[17px] font-medium text-gray-400">min</span>
            </span>
          ) : null}
          {sesion.rpe_estimado && (
            <span className="text-[11.5px] text-gray-500 mt-0.5">
              RPE estimado <b className="text-gray-300 font-semibold">{sesion.rpe_estimado}</b>
            </span>
          )}
        </div>

        {/* Lo que dice el entrenador: arriba y con peso. Es lo único de la pantalla
            donde una persona le está hablando. */}
        {sesion.notas_entrenador && (
          <div className="rounded-2xl px-4 py-3.5 flex flex-col gap-1.5 border border-orange-500/25 bg-orange-500/[0.07]">
            <p className="text-[14.5px] leading-relaxed text-white">{sesion.notas_entrenador}</p>
            <span className="text-[11.5px] text-gray-500">— tu entrenador</span>
          </div>
        )}

        {/* Registro sin modo entreno: cronómetro + cierre */}
        {!realizada && registrando && (
          <div className="rounded-2xl border border-green-500/35 bg-green-500/[0.07] px-4 py-5 text-center flex flex-col gap-3">
            {sesion.usar_cronometro && (
              <>
                <span className="text-[11px] uppercase tracking-[.1em] text-gray-500">Tiempo transcurrido</span>
                <span className="text-[42px] font-bold text-green-400 font-mono tabular-nums leading-none">{formatTiempo(segundos)}</span>
              </>
            )}
            <button onClick={abrirCuestionario}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold transition">
              ✓ Finalizar sesión
            </button>
          </div>
        )}

        {/* Sesión ya hecha */}
        {realizada && (
          <>
            <div className="bg-green-900/40 border border-green-600/50 rounded-2xl p-4 text-center">
              <p className="text-green-300 font-bold">✓ Sesión completada</p>
              {sesion.duracion_real && <p className="text-green-400/90 text-sm">{sesion.duracion_real} min realizados</p>}
            </div>
            {recup && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🍽</span>
                  <h3 className="text-white font-bold text-sm">{recup.titulo}</h3>
                </div>
                <p className="text-gray-300 text-sm mb-2">{recup.mensaje}</p>
                {(recup.carboG != null || recup.proteinaG != null) && (
                  <div className="flex gap-2.5 flex-wrap text-xs mb-2">
                    {recup.carboG != null && <span className="bg-gray-800 rounded-lg px-2.5 py-1 text-gray-200">🥤 ~{recup.carboG} g carbohidrato</span>}
                    {recup.proteinaG != null && <span className="bg-gray-800 rounded-lg px-2.5 py-1 text-gray-200">🍗 ~{recup.proteinaG} g proteína</span>}
                  </div>
                )}
                {recup.ejemplos && <p className="text-gray-400 text-xs mb-1">{recup.ejemplos}</p>}
                {recup.hidratacion && <p className="text-gray-400 text-xs mb-1">💧 {recup.hidratacion}</p>}
                {recup.extra?.map((e: string, i: number) => <p key={i} className="text-yellow-400/90 text-xs mt-1.5">⚠️ {e}</p>)}
              </div>
            )}
            <DatosReales sesionId={Number(id)} disciplina={sesion.disciplina} />
          </>
        )}

        {/* Lo que toca */}
        {tareas.length > 0 && (
          <div>
            <span className="text-[10.5px] uppercase tracking-[.11em] text-gray-500 font-bold">
              {realizada ? 'Lo que estaba planificado' : 'Lo que toca'}
            </span>
            <div className="flex flex-col gap-2 mt-2.5">
              {tareas.map(t => {
                const zc = cargaZona(t.zona_entrenamiento).color
                const disc = t.disciplina || sesion.disciplina
                const ritmo = ritmoObjetivo(t.zona_entrenamiento, disc, tests)
                // La disciplina de la tarea solo se pinta si difiere de la de la sesión:
                // en una de natación repetirla en cada fila es ruido; en un brick es
                // justo lo que hay que ver.
                const discDistinta = t.disciplina && t.disciplina !== sesion.disciplina
                const ej = ejercicioTarea(t)
                return (
                  <div key={t.id} className="border border-white/[0.075] rounded-[13px] bg-[#0e1218] px-3.5 py-3 flex items-center gap-3">
                    {t.zona_entrenamiento && (
                      <span className="text-[11px] font-bold px-2 py-[3px] rounded-md flex-shrink-0"
                        style={{ color: zc, background: `color-mix(in oklab, ${zc} 17%, transparent)` }}>
                        {t.tecnica ? 'Técnica' : t.zona_entrenamiento}
                      </span>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[15px] font-semibold tracking-tight">
                        {ej ? ej.nombre : objetivoTarea(t)}
                        {discDistinta && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">{t.disciplina}</span>
                        )}
                        {ej?.tipo && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-300 bg-orange-500/15 px-1.5 py-0.5 rounded">{ej.tipo}</span>
                        )}
                      </span>
                      {/* En fuerza el nombre manda y el «4 × 10 reps» pasa debajo.
                          Los kilos y el control van aquí porque sin ellos el atleta
                          leía «4 × 8 reps» y nada más: no sabía con cuánto peso ni
                          hasta dónde apretar, que es justo lo que se le prescribe. */}
                      <span className="text-[11.5px] text-gray-500">
                        {[
                          ej ? objetivoTarea(t) : null,
                          t.ejercicios?.[0]?.intensidad ? t.ejercicios[0].intensidad + ' kg' : null,
                          controlDeEjercicio(t.ejercicios?.[0]) || null,
                          t.descanso_segundos ? t.descanso_segundos + ' s de descanso' : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                      {t.comentario && <span className="text-[11.5px] text-gray-400 italic leading-snug">{t.comentario}</span>}
                    </div>
                    {ritmo && (
                      <span className="text-right font-mono tabular-nums text-[13.5px] font-semibold flex-shrink-0" style={{ color: zc }}>
                        {ritmo}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Sesión sin detallar: sin esto el atleta ve un título y dos botones, y no
            sabe qué tiene que hacer ni por qué la pantalla está vacía. */}
        {tareas.length === 0 && !realizada && (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center flex flex-col gap-1.5">
            <p className="text-[13.5px] text-gray-400">Tu entrenador todavía no ha detallado esta sesión.</p>
            <p className="text-[12px] text-gray-600">Puedes hacerla igual y registrarla al terminar.</p>
          </div>
        )}

        {/* Nutrición para la sesión */}
        {!realizada && hayNutricion && (
          <div className="border border-white/[0.045] rounded-xl bg-[#131820] px-3.5 py-2.5 flex gap-3.5 flex-wrap text-[12.5px] text-gray-300">
            {sesion.nutricion_carbo_gh != null && <span>🥤 {sesion.nutricion_carbo_gh} g/h</span>}
            {sesion.nutricion_agua_mlh != null && <span>💧 {sesion.nutricion_agua_mlh} ml/h</span>}
            {sesion.nutricion_sodio_mgh != null && <span>🧂 {sesion.nutricion_sodio_mgh} mg/h</span>}
            {sesion.nutricion_cafeina_mg != null && <span>☕ {sesion.nutricion_cafeina_mg} mg</span>}
            {sesion.nutricion_ayuno && <span className="text-yellow-400">🌙 En ayunas</span>}
          </div>
        )}

        {/* Las dos salidas */}
        {!realizada && !registrando && (
          <div className="flex flex-col gap-2.5">
            <button onClick={() => router.push('/sesion/' + id + '/ejecutar')}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-[19px] rounded-2xl font-extrabold text-[17px] tracking-wide transition shadow-[0_16px_34px_-16px_rgba(249,115,22,.75)]">
              ▶ &nbsp;EMPEZAR
            </button>
            <button onClick={empezarRegistro}
              className="w-full bg-transparent hover:bg-gray-900 text-gray-300 hover:text-white border border-white/[0.075] py-3.5 rounded-xl text-[13.5px] font-semibold transition">
              Ya la he hecho
              <span className="block text-[11px] font-normal text-gray-500 mt-0.5">Registrar sin el modo entreno</span>
            </button>
          </div>
        )}
      </div>

      {/* Cuestionario post-sesión — el mismo de siempre: alimenta el SICAT */}
      {mostrarPost && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className={'bg-gray-900 rounded-2xl p-6 w-full border border-orange-500 max-h-screen overflow-y-auto ' + (esBrick ? 'max-w-lg' : 'max-w-md')}>
            <h3 className="text-xl font-bold mb-4">¿Cómo fue?</h3>
            {sesion.usar_cronometro && segundos > 0 && (
              <p className="text-green-400 text-sm mb-4">Duración: {formatTiempo(segundos)} ({Math.round(segundos / 60)} min)</p>
            )}
            <form onSubmit={guardarPost} className="flex flex-col gap-4">
              {esBrick ? (
                <div className="bg-purple-900/20 border border-purple-800/50 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-purple-300 text-sm font-semibold">🔀 Cómo fue cada parte del brick</p>
                  {tareas.map((t, i) => {
                    const b = postBloques[t.id] || { rpe: 5, fc: '', sensacion: 3 }
                    const set = (campo: 'rpe' | 'fc' | 'sensacion', v: any) =>
                      setPostBloques(p => ({ ...p, [t.id]: { ...b, [campo]: v } }))
                    return (
                      <div key={t.id} className="bg-gray-800 rounded-lg p-3 flex flex-col gap-2.5">
                        <p className="text-white text-xs font-bold">
                          {EMOJI[t.disciplina] || ''} {i + 1} · {t.disciplina || '—'}
                          {t.zona_entrenamiento && <span className="text-gray-500 font-medium ml-1.5">{t.zona_entrenamiento}</span>}
                        </p>
                        <div>
                          <div className="flex justify-between mb-1"><label className="text-gray-400 text-xs">RPE real</label><span className="text-orange-400 font-bold text-xs">{b.rpe}/10</span></div>
                          <input type="range" min={1} max={10} value={b.rpe} onChange={e => set('rpe', Number(e.target.value))} className="w-full accent-orange-500" />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1"><label className="text-gray-400 text-xs">Sensación técnica</label><span className="text-orange-400 font-bold text-xs">{b.sensacion}/5</span></div>
                          <input type="range" min={1} max={5} value={b.sensacion} onChange={e => set('sensacion', Number(e.target.value))} className="w-full accent-orange-500" />
                        </div>
                        <input type="number" placeholder="FC media (ppm) — opcional" value={b.fc} onChange={e => set('fc', e.target.value)}
                          className="bg-gray-900 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <>
                  <div className="bg-gray-800 rounded-xl p-4">
                    <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">RPE real</label><span className="text-orange-400 font-bold">{rpeReal}/10</span></div>
                    <input type="range" min={1} max={10} value={rpeReal} onChange={e => setRpeReal(Number(e.target.value))} className="w-full accent-orange-500" />
                    <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Muy fácil</span><span>Máximo</span></div>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4">
                    <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">Sensación técnica</label><span className="text-orange-400 font-bold">{sensacionTecnica}/5</span></div>
                    <input type="range" min={1} max={5} value={sensacionTecnica} onChange={e => setSensacionTecnica(Number(e.target.value))} className="w-full accent-orange-500" />
                    <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Muy mala</span><span>Excelente</span></div>
                  </div>
                </>
              )}
              {/* Del DÍA: no se pueden repartir entre deportes. */}
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">Dolor muscular</label><span className="text-orange-400 font-bold">{dolorMuscular}/5</span></div>
                <input type="range" min={1} max={5} value={dolorMuscular} onChange={e => setDolorMuscular(Number(e.target.value))} className="w-full accent-orange-500" />
                <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Sin dolor</span><span>Mucho</span></div>
              </div>
              {!esBrick && <input type="number" placeholder="FC media (ppm) — opcional" value={fcMedia} onChange={e => setFcMedia(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
              <input type="number" placeholder="HRV del día (ms) — opcional" value={hrvDia} onChange={e => setHrvDia(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              <textarea placeholder="Notas (opcional)" value={notasPost} onChange={e => setNotasPost(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={3} />
              <button type="submit" disabled={guardando} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-bold transition disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar y finalizar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
