'use client'
// ============================================================
// TRIPULSE — Cerrarla por él, corregir lo que apuntó, y deshacerlo
// ============================================================
//
// Tres cosas que son el mismo problema del entrenador: «a veces se equivocan o
// no se acuerdan de dar una sesión por realizada».
//
//   · No la cerró y la hizo   →  la cierras tú, con la duración y el RPE.
//   · La cerró con datos malos →  los corriges, hasta las series.
//   · La cerró sin querer      →  la devuelves a planificada, SIN borrar nada.
//
// LAS REGLAS NO ESTÁN AQUÍ. Qué es un número imposible, qué se guarda como
// vacío y cuándo el RPE pasa a ser tuyo lo decide `lib/corregir-sesion`, que es
// lo único que se puede probar sin base de datos. Aquí solo se pinta y se
// escribe lo que diga.
//
// SOLO EL ENTRENADOR llega a esto: la pantalla del deportista es otra
// (BriefingSesion), y esto se pinta en la del entrenador.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'
import { rellenarRpeTareas } from '@/lib/rpe-sesion'
import { controlDe } from '@/lib/control-esfuerzo'
import { AvisoEnLinea, useAviso } from '@/components/AvisoEnLinea'
import {
  comoDarlaPorHecha, parcheDeSerie, parcheDeSesion, parcheDeTarea, pegasDeCorreccion,
  sePuedeDarPorHecha,
  type CamposSerie, type CamposSesion, type CamposTarea,
} from '@/lib/corregir-sesion'

interface Sesion {
  id: number | string
  estado?: string | null
  fecha_sesion?: string | null
  duracion_real?: number | null
  duracion_minutos?: number | null
  rpe_estimado?: number | null
  rpe_reportado?: number | null
  notas_post?: string | null
}

interface Serie {
  id: number
  id_ejercicio: number
  numero_serie: number
  ejercicio_numero: number | null
  peso_real: number | null
  repeticiones_reales: number | null
  tiempo_real: number | null
  control_real: number | null
  control_tipo: string | null
}

interface Ejercicio { id: number; id_tarea: number; nombre: string }

interface Tarea {
  id: number
  disciplina: string | null
  orden: number | null
  rpe_reportado: number | null
  fc_media: number | null
  sensacion_tecnica: number | null
  dolor_muscular: number | null
  notas_post: string | null
}

const vacioTarea = (t: Tarea): CamposTarea => ({
  rpe_reportado: t.rpe_reportado != null ? String(t.rpe_reportado) : '',
  fc_media: t.fc_media != null ? String(t.fc_media) : '',
  sensacion_tecnica: t.sensacion_tecnica != null ? String(t.sensacion_tecnica) : '',
  dolor_muscular: t.dolor_muscular != null ? String(t.dolor_muscular) : '',
  notas_post: t.notas_post || '',
})

const vacioSerie = (s: Serie): CamposSerie => ({
  peso_real: s.peso_real != null ? String(s.peso_real) : '',
  repeticiones_reales: s.repeticiones_reales != null ? String(s.repeticiones_reales) : '',
  tiempo_real: s.tiempo_real != null ? String(s.tiempo_real) : '',
  control_real: s.control_real != null ? String(s.control_real) : '',
})

const campo = 'bg-gray-800 text-white text-[12.5px] px-2.5 py-1.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700 font-mono tabular-nums'
const mini = campo + ' w-[62px] text-center'
const et = 'text-[10px] uppercase tracking-wider text-gray-500 font-bold block mb-1'
const rot = 'text-[10px] uppercase tracking-wider text-gray-500 font-bold mt-4 mb-2'
const btn = 'bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[12.5px] font-bold px-4 py-2 rounded-lg transition'
const btnSec = 'bg-gray-800 hover:bg-gray-700 text-gray-300 text-[12.5px] font-bold px-3.5 py-2 rounded-lg border border-gray-700 transition'

export default function CorregirSesion({ sesion, estimadaMin, onCambio }: {
  sesion: Sesion
  /** La duración estimada de lo planificado, para no empezar en blanco. */
  estimadaMin?: number | null
  onCambio?: () => void
}) {
  const { aviso, mal, ok } = useAviso(6)
  const [modo, setModo] = useState<'no' | 'cerrar' | 'corregir'>('no')
  const [guardando, setGuardando] = useState(false)

  const [cSesion, setCSesion] = useState<CamposSesion>({ duracion_real: '', rpe: '', notas_post: '' })
  const [cTareas, setCTareas] = useState<Record<number, CamposTarea>>({})
  const [cSeries, setCSeries] = useState<Record<number, CamposSerie>>({})
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
  const [series, setSeries] = useState<Serie[]>([])

  const hecha = sesion?.estado === 'Realizada'
  const sePuede = sePuedeDarPorHecha(sesion, hoyISO())

  /* Lo de dentro solo se pide al abrir la corrección: la ficha de sesión ya
     hace diez consultas al entrar, y esto no hace falta para pintar un botón. */
  const cargar = useCallback(async () => {
    const { data: tar } = await supabase.from('tarea')
      .select('id, disciplina, orden, rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular, notas_post')
      .eq('id_sesion', sesion.id).order('orden')
    const ts = (tar || []) as Tarea[]
    setTareas(ts)
    setCTareas(Object.fromEntries(ts.map(t => [t.id, vacioTarea(t)])))

    const ids = ts.map(t => t.id)
    const { data: ejs } = ids.length
      ? await supabase.from('ejercicios').select('id, id_tarea, nombre').in('id_tarea', ids)
      : { data: [] }
    const es = (ejs || []) as Ejercicio[]
    setEjercicios(es)

    const idsEj = es.map(e => e.id)
    const { data: srs } = idsEj.length
      ? await supabase.from('series_realizadas')
        .select('id, id_ejercicio, numero_serie, ejercicio_numero, peso_real, repeticiones_reales, tiempo_real, control_real, control_tipo')
        .in('id_ejercicio', idsEj).order('numero_serie')
      : { data: [] }
    const ss = (srs || []) as Serie[]
    setSeries(ss)
    setCSeries(Object.fromEntries(ss.map(s => [s.id, vacioSerie(s)])))
  }, [sesion.id])

  /* La regla del compilador ve una llamada que acaba en `setState` y avisa,
     pero el estado se pone DESPUÉS de que conteste la base, que es el caso que
     ella misma admite. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (modo === 'corregir') cargar() }, [modo, cargar])

  const abrirCerrar = () => {
    setCSesion(comoDarlaPorHecha(sesion, estimadaMin))
    setModo('cerrar')
  }

  const abrirCorregir = () => {
    setCSesion({
      duracion_real: sesion.duracion_real != null ? String(sesion.duracion_real) : '',
      rpe: sesion.rpe_reportado != null ? String(sesion.rpe_reportado) : '',
      notas_post: sesion.notas_post || '',
    })
    setModo('corregir')
  }

  /** Lo que está mal, dicho ANTES de tocar la base. */
  const revisar = (): boolean => {
    const pegas = pegasDeCorreccion(cSesion, cTareas, cSeries)
    if (!pegas.length) return true
    mal(pegas.length === 1 ? pegas[0].texto : pegas.length + ' cosas por revisar: ' + pegas[0].texto)
    return false
  }

  const darPorHecha = async () => {
    if (!revisar()) return
    setGuardando(true)
    const parche = parcheDeSesion(cSesion, sesion.rpe_reportado)
    const { error } = await supabase.from('sesion')
      .update({ ...parche, estado: 'Realizada' }).eq('id', sesion.id)
    if (error) { setGuardando(false); alert('No se ha podido cerrar la sesión: ' + error.message); return }
    /* El RPE va TAMBIÉN en sus bloques, que es donde lo leen el SICAT y los
       índices de percepción. Solo rellena los que estén vacíos. */
    await rellenarRpeTareas(supabase, Number(sesion.id), parche.rpe_reportado)
    setGuardando(false)
    setModo('no')
    ok('Sesión cerrada.')
    onCambio?.()
  }

  const guardarCorreccion = async () => {
    if (!revisar()) return
    setGuardando(true)
    const { error } = await supabase.from('sesion')
      .update(parcheDeSesion(cSesion, sesion.rpe_reportado)).eq('id', sesion.id)
    if (error) { setGuardando(false); alert('No se ha podido guardar: ' + error.message); return }

    for (const t of tareas) {
      const c = cTareas[t.id]
      if (c) await supabase.from('tarea').update(parcheDeTarea(c)).eq('id', t.id)
    }
    for (const s of series) {
      const c = cSeries[s.id]
      if (c) await supabase.from('series_realizadas').update(parcheDeSerie(c)).eq('id', s.id)
    }
    setGuardando(false)
    setModo('no')
    ok('Corregido.')
    onCambio?.()
  }

  /* DEVOLVER NO BORRA. Quitar el estado y llevarse por delante sus kilos sería
     irreversible, y nadie lo espera de un botón que dice «devolver». */
  const devolver = async () => {
    if (!confirm('¿Devolver esta sesión a planificada?\n\nLo que apuntó NO se borra: si vuelve a cerrarla, sigue estando.')) return
    setGuardando(true)
    const { error } = await supabase.from('sesion').update({ estado: 'Planificada' }).eq('id', sesion.id)
    setGuardando(false)
    if (error) { alert('No se ha podido devolver: ' + error.message); return }
    ok('Vuelve a estar planificada.')
    onCambio?.()
  }

  const ponT = (id: number, k: keyof CamposTarea, v: string) =>
    setCTareas(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const ponS = (id: number, k: keyof CamposSerie, v: string) =>
    setCSeries(p => ({ ...p, [id]: { ...p[id], [k]: v } }))

  // ── Ni cerrada ni cerrable: no hay nada que ofrecer ────────
  if (!hecha && !sePuede && modo === 'no') return null

  return (
    <div className="flex flex-col gap-3">
      <AvisoEnLinea aviso={aviso} />

      {/* ── No la cerró ─────────────────────────────────────── */}
      {modo === 'no' && !hecha && sePuede && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-[19px]" aria-hidden="true">🕗</span>
          <span className="flex-1 min-w-[220px]">
            <b className="block text-[14px]">Esta sesión sigue sin cerrar, y ya pasó.</b>
            <span className="text-[12px] text-gray-400">
              Si la hizo, ciérrala tú. Si no la hizo, déjala: una sesión planificada que no se hizo también es un dato.
            </span>
          </span>
          <button onClick={abrirCerrar} className={btn}>Darla por hecha</button>
        </div>
      )}

      {/* ── Cerrarla por él ─────────────────────────────────── */}
      {modo === 'cerrar' && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.07] px-3.5 py-3">
          <p className="font-bold text-[14px] mb-2">Darla por hecha</p>
          <div className="flex gap-2.5 flex-wrap items-end">
            <label><span className={et}>Duración (min)</span>
              <input className={campo + ' w-[92px]'} inputMode="numeric" value={cSesion.duracion_real}
                onChange={e => setCSesion(c => ({ ...c, duracion_real: e.target.value }))} /></label>
            <label><span className={et}>RPE</span>
              <input className={campo + ' w-[72px]'} inputMode="numeric" value={cSesion.rpe}
                onChange={e => setCSesion(c => ({ ...c, rpe: e.target.value }))} /></label>
            <label className="flex-1 min-w-[200px]"><span className={et}>Nota (opcional)</span>
              <input className={campo + ' w-full font-sans'} value={cSesion.notas_post}
                onChange={e => setCSesion(c => ({ ...c, notas_post: e.target.value }))} /></label>
            <button onClick={darPorHecha} disabled={guardando} className={btn}>
              {guardando ? 'Cerrando…' : 'Darla por hecha'}
            </button>
            <button onClick={() => setModo('no')} className={btnSec}>Cancelar</button>
          </div>
          <p className="text-[11.5px] text-gray-500 mt-2.5 mb-0">
            La duración y el RPE vienen de lo que planificaste: cámbialos si sabes lo que fue.
            {' '}<b className="text-gray-400">Queda escrito que el RPE lo pusiste tú</b>, porque la carga se calcula con ese número
            y no es lo mismo que te lo diga él.
          </p>
        </div>
      )}

      {/* ── Ya está cerrada ─────────────────────────────────── */}
      {modo === 'no' && hecha && (
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={abrirCorregir} className={btnSec}>✏️ Corregir lo que apuntó</button>
          <button onClick={devolver} disabled={guardando}
            className="text-[12.5px] text-gray-500 hover:text-red-400 px-2 py-2 transition">
            Devolver a planificada
          </button>
        </div>
      )}

      {/* ── Corregir ────────────────────────────────────────── */}
      {modo === 'corregir' && (
        <div className="rounded-xl border border-gray-700 bg-gray-900/70 px-3.5 py-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="font-bold text-[14px] flex-1 mb-0">✏️ Corrigiendo lo que apuntó</p>
            <button onClick={guardarCorreccion} disabled={guardando} className={btn}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => setModo('no')} className={btnSec}>Cancelar</button>
          </div>

          <p className={rot}>De la sesión</p>
          <div className="flex gap-2.5 flex-wrap items-end">
            <label><span className={et}>Duración (min)</span>
              <input className={campo + ' w-[92px]'} inputMode="numeric" value={cSesion.duracion_real}
                onChange={e => setCSesion(c => ({ ...c, duracion_real: e.target.value }))} /></label>
            <label><span className={et}>RPE</span>
              <input className={campo + ' w-[72px]'} inputMode="numeric" value={cSesion.rpe}
                onChange={e => setCSesion(c => ({ ...c, rpe: e.target.value }))} /></label>
            <label className="flex-1 min-w-[200px]"><span className={et}>Nota</span>
              <input className={campo + ' w-full font-sans'} value={cSesion.notas_post}
                onChange={e => setCSesion(c => ({ ...c, notas_post: e.target.value }))} /></label>
          </div>

          {tareas.map(t => (
            <div key={t.id}>
              <p className={rot}>
                Bloque {t.orden ?? ''}{t.disciplina ? ' · ' + t.disciplina : ''}
              </p>
              <div className="flex gap-2.5 flex-wrap items-end">
                <label><span className={et}>RPE</span>
                  <input className={mini} inputMode="numeric" value={cTareas[t.id]?.rpe_reportado ?? ''}
                    onChange={e => ponT(t.id, 'rpe_reportado', e.target.value)} /></label>
                <label><span className={et}>FC media</span>
                  <input className={mini} inputMode="numeric" value={cTareas[t.id]?.fc_media ?? ''}
                    onChange={e => ponT(t.id, 'fc_media', e.target.value)} /></label>
                <label><span className={et}>Sensación</span>
                  <input className={mini} inputMode="numeric" value={cTareas[t.id]?.sensacion_tecnica ?? ''}
                    onChange={e => ponT(t.id, 'sensacion_tecnica', e.target.value)} /></label>
                <label><span className={et}>Dolor</span>
                  <input className={mini} inputMode="numeric" value={cTareas[t.id]?.dolor_muscular ?? ''}
                    onChange={e => ponT(t.id, 'dolor_muscular', e.target.value)} /></label>
                <label className="flex-1 min-w-[180px]"><span className={et}>Nota</span>
                  <input className={campo + ' w-full font-sans'} value={cTareas[t.id]?.notas_post ?? ''}
                    onChange={e => ponT(t.id, 'notas_post', e.target.value)} /></label>
              </div>

              {ejercicios.filter(e => e.id_tarea === t.id).map(ej => {
                /* Solo las del primer escalón: en un drop set las demás son
                   escalones de la misma serie y se corrigen desde la ejecución. */
                const suyas = series.filter(s => s.id_ejercicio === ej.id && (s.ejercicio_numero ?? 1) === 1)
                if (!suyas.length) return null
                const porTiempo = suyas.some(s => s.tiempo_real != null)
                const rotuloControl = controlDe(suyas.find(s => s.control_tipo)?.control_tipo).corto
                return (
                  <div key={ej.id} className="mt-2.5">
                    <p className="text-[12px] font-semibold text-orange-400 mb-1.5">{ej.nombre}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left font-semibold py-1 px-2 w-10">Serie</th>
                            <th className="font-semibold py-1 px-2">Kg</th>
                            <th className="font-semibold py-1 px-2">{porTiempo ? 'Seg' : 'Reps'}</th>
                            <th className="font-semibold py-1 px-2">{rotuloControl}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {suyas.map(s => (
                            <tr key={s.id} className="border-t border-gray-800">
                              <td className="py-1 px-2 font-mono text-gray-400">{s.numero_serie}</td>
                              <td className="py-1 px-2 text-center">
                                <input className={mini} inputMode="decimal" value={cSeries[s.id]?.peso_real ?? ''}
                                  onChange={e => ponS(s.id, 'peso_real', e.target.value)} /></td>
                              <td className="py-1 px-2 text-center">
                                <input className={mini} inputMode="numeric"
                                  value={(porTiempo ? cSeries[s.id]?.tiempo_real : cSeries[s.id]?.repeticiones_reales) ?? ''}
                                  onChange={e => ponS(s.id, porTiempo ? 'tiempo_real' : 'repeticiones_reales', e.target.value)} /></td>
                              <td className="py-1 px-2 text-center">
                                <input className={mini} inputMode="decimal" value={cSeries[s.id]?.control_real ?? ''}
                                  onChange={e => ponS(s.id, 'control_real', e.target.value)} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* Cuando no anotó NINGUNA serie no hay filas que corregir, y eso hay
              que decirlo: si no, parece que la corrección está rota. */}
          {!series.length && tareas.length > 0 && (
            <p className="text-[11.5px] text-gray-500 mt-3 mb-0">
              No hay series apuntadas en esta sesión. Si quieres escribirlas tú, se hace desde <b className="text-gray-400">⏱ Dirigir</b>.
            </p>
          )}

          <p className="text-[11.5px] text-amber-300/90 mt-3 mb-0 leading-snug">
            Ojo: esto mueve números que ya estaban. El RPE y la duración alimentan la carga de la semana y el SICAT;
            los kilos y las repeticiones, el volumen de fuerza y «lo que hizo vs lo prescrito».
          </p>
        </div>
      )}
    </div>
  )
}
