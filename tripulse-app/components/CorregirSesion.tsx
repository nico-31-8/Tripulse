'use client'
// ============================================================
// TRIPULSE — Cerrarla por él, corregir lo que apuntó, y deshacerlo
// ============================================================
//
// Tres cosas que son el mismo problema del entrenador: «a veces se equivocan o
// no se acuerdan de dar una sesión por realizada».
//
//   · No la cerró y la hizo    →  la cierras tú, con la duración y el RPE.
//   · La cerró con datos malos →  los corriges, hasta la última serie.
//   · La cerró sin querer      →  la devuelves a planificada, SIN borrar nada.
//
// LO QUE SE PUEDE CORREGIR, que son tres tablas distintas y por eso costó:
//
//   · La sesión: duración, RPE, nota.
//   · Cada bloque: RPE, FC media, sensación, dolor, nota. Y si es de
//     RESISTENCIA, además sus metros, su tiempo y el resumen de sus series
//     —que viven en `p_distancia`, `p_duracion` y un texto en la propia tarea—.
//   · Si es de FUERZA, sus series una a una. Y aquí está lo que se escapó a la
//     primera: las filas de series SOLO EXISTEN si el atleta escribió algo, así
//     que una sesión de fuerza cerrada sin apuntar nada no tenía nada que
//     corregir. Ahora salen las series PRESCRITAS y las que rellenes se crean.
//
// LAS REGLAS NO ESTÁN AQUÍ. Qué es un número imposible, qué se guarda como
// vacío, cuándo el RPE pasa a ser tuyo y qué fila se crea lo decide
// `lib/corregir-sesion`, que es lo único que se puede probar sin base de datos.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'
import { rellenarRpeTareas } from '@/lib/rpe-sesion'
import { controlDe } from '@/lib/control-esfuerzo'
import { esDisciplinaDeFuerza } from '@/lib/disciplinas'
import { AvisoEnLinea, useAviso } from '@/components/AvisoEnLinea'
import {
  comoDarlaPorHecha, filaNuevaDeSerie, parcheDetalle, parcheDistancia, parcheDuracion,
  parcheDeSerie, parcheDeSesion, parcheDeTarea, pegasDeCorreccion, pegasDeResistencia,
  sePuedeDarPorHecha, textoDeSegundos,
  type CamposResistencia, type CamposSerie, type CamposSesion, type CamposTarea,
} from '@/lib/corregir-sesion'

interface Sesion {
  id: number | string
  disciplina?: string | null
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

interface Ejercicio {
  id: number
  id_tarea: number
  nombre: string
  series: number | null
  control_tipo: string | null
}

interface Tarea {
  id: number
  disciplina: string | null
  orden: number | null
  rpe_reportado: number | null
  fc_media: number | null
  sensacion_tecnica: number | null
  dolor_muscular: number | null
  notas_post: string | null
  sensacion_general: string | null
  p_distancia?: { metros_reales: number | null }[] | null
  p_duracion?: { tiempo_real: number | null }[] | null
}

const txt = (v: number | null | undefined): string => (v == null ? '' : String(v))

const vacioTarea = (t: Tarea): CamposTarea => ({
  rpe_reportado: txt(t.rpe_reportado),
  fc_media: txt(t.fc_media),
  sensacion_tecnica: txt(t.sensacion_tecnica),
  dolor_muscular: txt(t.dolor_muscular),
  notas_post: t.notas_post || '',
})

const vacioResistencia = (t: Tarea): CamposResistencia => ({
  metros_reales: txt(t.p_distancia?.[0]?.metros_reales),
  tiempo_real: textoDeSegundos(t.p_duracion?.[0]?.tiempo_real),
  detalle: t.sensacion_general || '',
})

const vacioSerie = (s?: Serie): CamposSerie => ({
  peso_real: txt(s?.peso_real),
  repeticiones_reales: txt(s?.repeticiones_reales),
  tiempo_real: txt(s?.tiempo_real),
  control_real: txt(s?.control_real),
})

/** Una serie se identifica por su ejercicio y su número, exista fila o no. */
const llave = (idEjercicio: number, n: number): string => idEjercicio + ':' + n

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
  const [cRes, setCRes] = useState<Record<number, CamposResistencia>>({})
  const [cSeries, setCSeries] = useState<Record<string, CamposSerie>>({})
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
  const [series, setSeries] = useState<Serie[]>([])

  const hecha = sesion?.estado === 'Realizada'
  const sePuede = sePuedeDarPorHecha(sesion, hoyISO())

  /* Lo de dentro solo se pide al abrir la corrección: la ficha de sesión ya
     hace diez consultas al entrar, y esto no hace falta para pintar un botón. */
  const cargar = useCallback(async () => {
    const { data: tar } = await supabase.from('tarea')
      .select('id, disciplina, orden, rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular, notas_post, sensacion_general, p_distancia(metros_reales), p_duracion(tiempo_real)')
      .eq('id_sesion', sesion.id).order('orden')
    const ts = (tar || []) as unknown as Tarea[]
    setTareas(ts)
    setCTareas(Object.fromEntries(ts.map(t => [t.id, vacioTarea(t)])))
    setCRes(Object.fromEntries(ts.map(t => [t.id, vacioResistencia(t)])))

    const ids = ts.map(t => t.id)
    const { data: ejs } = ids.length
      ? await supabase.from('ejercicios').select('id, id_tarea, nombre, series, control_tipo').in('id_tarea', ids)
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

    /* Una casilla por serie PRESCRITA, no por fila guardada: las filas solo
       existen si el atleta escribió algo, y sin esto una sesión de fuerza sin
       apuntar no tenía nada que corregir. */
    const casillas: Record<string, CamposSerie> = {}
    for (const ej of es) {
      const cuantas = Number(ej.series) > 0 ? Number(ej.series) : 3
      for (let n = 1; n <= cuantas; n++) {
        const fila = ss.find(x => x.id_ejercicio === ej.id && x.numero_serie === n && (x.ejercicio_numero ?? 1) === 1)
        casillas[llave(ej.id, n)] = vacioSerie(fila)
      }
    }
    setCSeries(casillas)
  }, [sesion.id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (modo === 'corregir') cargar() }, [modo, cargar])

  const abrirCerrar = () => {
    setCSesion(comoDarlaPorHecha(sesion, estimadaMin))
    setModo('cerrar')
  }

  const abrirCorregir = () => {
    setCSesion({
      duracion_real: txt(sesion.duracion_real),
      rpe: txt(sesion.rpe_reportado),
      notas_post: sesion.notas_post || '',
    })
    setModo('corregir')
  }

  /** Lo que está mal, dicho ANTES de tocar la base. */
  const revisar = (): boolean => {
    const pegas = [...pegasDeCorreccion(cSesion, cTareas, cSeries), ...pegasDeResistencia(cRes)]
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

  const esFuerzaTarea = (t: Tarea): boolean =>
    esDisciplinaDeFuerza(t.disciplina || '') || esDisciplinaDeFuerza(sesion.disciplina || '')

  const guardarCorreccion = async () => {
    if (!revisar()) return
    setGuardando(true)
    const { error } = await supabase.from('sesion')
      .update(parcheDeSesion(cSesion, sesion.rpe_reportado)).eq('id', sesion.id)
    if (error) { setGuardando(false); alert('No se ha podido guardar: ' + error.message); return }

    for (const t of tareas) {
      const c = cTareas[t.id]
      const r = cRes[t.id]
      /* El detalle de las series va en la tarea, así que se escribe con lo
         demás en vez de en otra consulta. */
      const parche = { ...(c ? parcheDeTarea(c) : {}), ...(r && !esFuerzaTarea(t) ? parcheDetalle(r) : {}) }
      if (Object.keys(parche).length) await supabase.from('tarea').update(parche).eq('id', t.id)

      if (r && !esFuerzaTarea(t)) {
        /* Solo si la tarea TIENE esa medida: crear una fila de prescripción
           que nadie prescribió sería inventarse la sesión. */
        if (t.p_distancia?.length) await supabase.from('p_distancia').update(parcheDistancia(r)).eq('id_tarea', t.id)
        if (t.p_duracion?.length) await supabase.from('p_duracion').update(parcheDuracion(r)).eq('id_tarea', t.id)
      }
    }

    const nuevas: Record<string, unknown>[] = []
    for (const ej of ejercicios) {
      const cuantas = Number(ej.series) > 0 ? Number(ej.series) : 3
      for (let n = 1; n <= cuantas; n++) {
        const c = cSeries[llave(ej.id, n)]
        if (!c) continue
        const fila = series.find(x => x.id_ejercicio === ej.id && x.numero_serie === n && (x.ejercicio_numero ?? 1) === 1)
        if (fila) await supabase.from('series_realizadas').update(parcheDeSerie(c)).eq('id', fila.id)
        else {
          const nueva = filaNuevaDeSerie(ej.id, n, ej.control_tipo, c)
          if (nueva) nuevas.push(nueva)
        }
      }
    }
    if (nuevas.length) {
      const { error: e2 } = await supabase.from('series_realizadas').insert(nuevas)
      if (e2) { setGuardando(false); alert('No se han podido escribir las series nuevas: ' + e2.message); return }
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
  const ponR = (id: number, k: keyof CamposResistencia, v: string) =>
    setCRes(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const ponS = (k: string, campo: keyof CamposSerie, v: string) =>
    setCSeries(p => ({ ...p, [k]: { ...p[k], [campo]: v } }))

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

          {tareas.map(t => {
            const fuerza = esFuerzaTarea(t)
            const suyos = ejercicios.filter(e => e.id_tarea === t.id)
            return (
              <div key={t.id}>
                <p className={rot}>Bloque {t.orden ?? ''}{t.disciplina ? ' · ' + t.disciplina : ''}</p>
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

                {/* RESISTENCIA: lo que hizo de verdad en ese bloque. Era el
                    agujero del «8 m»: se veía y no se podía arreglar. */}
                {!fuerza && (t.p_distancia?.length || t.p_duracion?.length || t.sensacion_general) && (
                  <div className="flex gap-2.5 flex-wrap items-end mt-2">
                    {!!t.p_distancia?.length && (
                      <label><span className={et}>Distancia real (m)</span>
                        <input className={campo + ' w-[110px]'} inputMode="numeric" value={cRes[t.id]?.metros_reales ?? ''}
                          onChange={e => ponR(t.id, 'metros_reales', e.target.value)} /></label>
                    )}
                    {!!t.p_duracion?.length && (
                      <label><span className={et}>Tiempo real (mm:ss)</span>
                        <input className={campo + ' w-[110px]'} placeholder="4:35" value={cRes[t.id]?.tiempo_real ?? ''}
                          onChange={e => ponR(t.id, 'tiempo_real', e.target.value)} /></label>
                    )}
                    {!!t.sensacion_general && (
                      <label className="flex-1 min-w-[220px]"><span className={et}>Detalle por series (tal cual lo apuntó)</span>
                        <input className={campo + ' w-full'} value={cRes[t.id]?.detalle ?? ''}
                          onChange={e => ponR(t.id, 'detalle', e.target.value)} /></label>
                    )}
                  </div>
                )}

                {/* FUERZA: TODAS las series prescritas, existan o no. */}
                {fuerza && suyos.map(ej => {
                  const cuantas = Number(ej.series) > 0 ? Number(ej.series) : 3
                  const suyas = series.filter(s => s.id_ejercicio === ej.id && (s.ejercicio_numero ?? 1) === 1)
                  const porTiempo = suyas.some(s => s.tiempo_real != null)
                  const rotuloControl = controlDe(ej.control_tipo || suyas.find(s => s.control_tipo)?.control_tipo).corto
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
                            {Array.from({ length: cuantas }, (_, i) => {
                              const n = i + 1
                              const k = llave(ej.id, n)
                              return (
                                <tr key={k} className="border-t border-gray-800">
                                  <td className="py-1 px-2 font-mono text-gray-400">{n}</td>
                                  <td className="py-1 px-2 text-center">
                                    <input className={mini} inputMode="decimal" value={cSeries[k]?.peso_real ?? ''}
                                      onChange={e => ponS(k, 'peso_real', e.target.value)} /></td>
                                  <td className="py-1 px-2 text-center">
                                    <input className={mini} inputMode="numeric"
                                      value={(porTiempo ? cSeries[k]?.tiempo_real : cSeries[k]?.repeticiones_reales) ?? ''}
                                      onChange={e => ponS(k, porTiempo ? 'tiempo_real' : 'repeticiones_reales', e.target.value)} /></td>
                                  <td className="py-1 px-2 text-center">
                                    <input className={mini} inputMode="decimal" value={cSeries[k]?.control_real ?? ''}
                                      onChange={e => ponS(k, 'control_real', e.target.value)} /></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          <p className="text-[11.5px] text-amber-300/90 mt-3 mb-0 leading-snug">
            Ojo: esto mueve números que ya estaban. El RPE y la duración alimentan la carga de la semana y el SICAT;
            los kilos, las repeticiones y los metros, el volumen y «lo que hizo vs lo prescrito».
          </p>
        </div>
      )}
    </div>
  )
}
