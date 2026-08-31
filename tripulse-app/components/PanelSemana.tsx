'use client'
// ============================================================
// La semana, dentro del editor de sesión
// ============================================================
// Montar las tareas de un miércoles con la sesión sola delante es trabajar a
// ciegas: lo que decide si le metes series es lo que llevó el martes y lo que le
// espera el sábado. Eso estaba en el calendario, a dos pantallas de distancia y
// con la vuelta perdiendo el sitio.
//
// LO QUE HACE
//   · Enseña los siete días con sus sesiones (disciplina, duración, zonas).
//   · Abre cualquiera AQUÍ DENTRO, con sus tareas enteras, sin salir de la que
//     estás montando.
//   · Copia una tarea —o todas— a la sesión abierta.
//
// COPIAR NO GUARDA NADA. Deja la tarea como fila nueva del formulario de abajo,
// con todo relleno, y tú la revisas y le das a ✓. Escribir directo en la base
// mete algo que no has mirado, y una tarea de otra semana casi nunca vale tal
// cual. La conversión es la MISMA que usa el botón de editar (lib/copiar-tarea);
// lo único que cambia es que no lleva `idTarea`, así que la sesión de origen no
// se toca.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  lunesDe, diasDeLaSemana, resumenDeSemana, etiquetaDeSemana, puedeCopiarse,
  esDisciplinaDeFuerza, esDelAtleta, vecinasDe, comoSeLlama,
  type SesionSemana, type MicroParaEtiqueta,
} from '@/lib/semana-sesiones'
import { vistaDeTarea, zonasDeSesion } from '@/lib/tarea-vista'
import { cargarReferencias, type Tests } from '@/lib/referencia-zona'
import { sumarDias } from '@/lib/desplazar'
import { ZONAS_RESISTENCIA, ZONAS_FUERZA } from '@/lib/zonas'

/* Los mismos colores de disciplina que el calendario y el panel del deportista. */
const COLOR_DISC: Record<string, string> = {
  Natacion: '#3b82f6', 'Natación': '#3b82f6', Ciclismo: '#eab308',
  Carrera: '#22c55e', Fuerza: '#ef4444', Brick: '#a855f7',
}
const colorDisc = (d?: string | null) => COLOR_DISC[d || ''] || '#6b7280'

const COLOR_ZONA: Record<string, string> = {}
;[...ZONAS_RESISTENCIA, ...ZONAS_FUERZA].forEach(z => { COLOR_ZONA[z.sigla] = z.color })
const colorZona = (z?: string | null) => COLOR_ZONA[z || ''] || '#6b7280'

/* Plegado/desplegado es una preferencia del entrenador, no un dato: vive en el
   navegador. Se lee en un efecto porque esta página también se pinta en el
   servidor, donde no hay localStorage. */
const CLAVE_ABIERTO = 'tp-panel-semana'

interface Props {
  idDeportista: number
  /** La fecha de la sesión que se está editando: ancla la primera semana. */
  fechaSesion: string
  idSesionActual: number
  disciplinaSesion: string
  /** Manda tareas al formulario de abajo. */
  onCopiar: (tareas: any[]) => void
}

const SELECT_TAREA =
  '*, p_duracion(*), p_distancia(*), p_repeticiones(*), ' +
  'ejercicios(nombre, series, repeticiones, tipo_serie, ejercicio_encadenado_nombre, ' +
  'ejercicio_encadenado_id, encadenado_series, encadenado_repeticiones, encadenado_intensidad, ' +
  'escalones_drop, grupo_muscular, intensidad, control_tipo, ' +
  'control_valor, notas_ejecucion)'

export default function PanelSemana({
  idDeportista, fechaSesion, idSesionActual, disciplinaSesion, onCopiar,
}: Props) {
  const miLunes = lunesDe(fechaSesion)
  const [abierto, setAbierto] = useState(true)
  const [lunes, setLunes] = useState(miLunes)
  const [sesiones, setSesiones] = useState<SesionSemana[]>([])
  const [micros, setMicros] = useState<MicroParaEtiqueta[]>([])
  const [tests, setTests] = useState<Tests>({})
  const [fcMax, setFcMax] = useState(0)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [copiada, setCopiada] = useState<string | null>(null)

  const sesionEsDeFuerza = esDisciplinaDeFuerza(disciplinaSesion)

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE_ABIERTO) === '0') setAbierto(false)
    } catch { /* preferencia ilegible: se abre, que es lo útil */ }
  }, [])

  const plegar = () => {
    // El localStorage se escribe FUERA del actualizador: React puede llamarlo dos
    // veces, y un efecto secundario ahí dentro se ejecuta las dos.
    const nuevo = !abierto
    setAbierto(nuevo)
    try { localStorage.setItem(CLAVE_ABIERTO, nuevo ? '1' : '0') } catch { /* da igual */ }
  }

  // Los microciclos solo sirven para PONERLE NOMBRE a la semana. Se cargan una
  // vez: no cambian mientras se edita una sesión.
  useEffect(() => {
    if (!idDeportista) return
    ;(async () => {
      const [{ data: mi }, refs] = await Promise.all([
        supabase.from('microciclo').select('id, fecha_inicio, tipo, id_mesociclo')
          .eq('id_deportista', idDeportista).order('fecha_inicio'),
        cargarReferencias(supabase, idDeportista),
      ])
      setMicros((mi || []) as MicroParaEtiqueta[])
      setTests(refs.tests)
      setFcMax(refs.fcMax)
    })()
  }, [idDeportista])

  /* Las sesiones de la semana, en DOS consultas y no en una anidada. La anidada
     depende de que PostgREST descubra la relación sesión→tarea→mediciones a tres
     niveles; así se usa el mismo camino que ya usa el resto de la app. */
  const cargarSemana = useCallback(async () => {
    if (!idDeportista) return
    setCargando(true)
    const domingo = sumarDias(lunes, 6)
    const { data: ses } = await supabase.from('sesion')
      .select('id, fecha_sesion, disciplina, estado, id_microciclo, duracion_minutos, origen')
      .eq('id_deportista', idDeportista)
      .gte('fecha_sesion', lunes).lte('fecha_sesion', domingo)
      .or('eliminada.is.null,eliminada.eq.false')
      .order('fecha_sesion')

    const ids = (ses || []).map((s: any) => s.id)
    const { data: tar } = ids.length
      ? await supabase.from('tarea').select(SELECT_TAREA).in('id_sesion', ids).order('orden')
      : { data: [] as any[] }

    const porSesion = new Map<number, any[]>()
    ;(tar || []).forEach((t: any) => {
      const lista = porSesion.get(t.id_sesion) || []
      lista.push(t)
      porSesion.set(t.id_sesion, lista)
    })
    setSesiones((ses || []).map((s: any) => ({ ...s, tareas: porSesion.get(s.id) || [] })))
    setCargando(false)
  }, [idDeportista, lunes])

  useEffect(() => { cargarSemana() }, [cargarSemana])

  const dias = diasDeLaSemana(lunes, sesiones)
  const resumen = resumenDeSemana(dias)
  const etiqueta = etiquetaDeSemana(lunes, micros)
  const sesionAbierta = sesiones.find(s => s.id === abierta) || null

  const mover = (n: number) => { setLunes(l => sumarDias(l, n * 7)); setAbierta(null) }

  const copiar = (tareas: any[], marca: string) => {
    if (!tareas.length) return
    onCopiar(tareas)
    setCopiada(marca)
    setTimeout(() => setCopiada(null), 1500)
  }

  const btn = 'text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg border transition'
  /* Las flechas de saltar de sesión. `disabled:` en vez de esconderlas en los
     extremos: si desaparecieran, la cabecera cambiaría de ancho al llegar al
     lunes y el título daría un salto. */
  const flechaBtn = 'text-[15px] leading-none px-2 py-1 rounded-lg border border-gray-700 bg-white/[0.03]'
    + ' text-gray-400 hover:text-orange-300 hover:border-orange-500/60 hover:bg-orange-500/10 transition'
    + ' disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:border-gray-700'
    + ' disabled:hover:bg-white/[0.03] disabled:cursor-default'

  // Con qué sesiones se salta desde la que está abierta. Orden de pantalla.
  const { anterior, siguiente } = vecinasDe(dias, abierta)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-4">
      <div className={'flex items-center justify-between gap-2 pl-4 pr-2.5 py-2 ' + (abierto ? 'border-b border-gray-800' : '')}>
        <button onClick={plegar} aria-expanded={abierto}
          className="flex items-baseline gap-2.5 py-1 px-1 -mx-1 rounded hover:opacity-80 transition">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">La semana</span>
          <span className={'text-gray-500 text-[10px] transition-transform ' + (abierto ? 'rotate-180' : '')}>▼</span>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => mover(-1)} aria-label="Semana anterior"
            className="bg-gray-950/60 border border-gray-800 hover:border-gray-600 hover:text-white text-gray-400 rounded-lg px-2.5 py-1.5 text-[13px] leading-none transition">‹</button>
          <div className="text-center px-1.5 min-w-[168px]">
            <div className="text-[12.5px] font-semibold whitespace-nowrap">{etiqueta.titulo}</div>
            <div className="text-[10.5px] text-gray-500 whitespace-nowrap">
              {etiqueta.tipo}{lunes === miLunes ? (etiqueta.tipo ? ' · ' : '') + 'la de esta sesión' : ''}
            </div>
          </div>
          <button onClick={() => mover(1)} aria-label="Semana siguiente"
            className="bg-gray-950/60 border border-gray-800 hover:border-gray-600 hover:text-white text-gray-400 rounded-lg px-2.5 py-1.5 text-[13px] leading-none transition">›</button>
          {lunes !== miLunes && (
            <button onClick={() => { setLunes(miLunes); setAbierta(null) }}
              className="text-[10.5px] font-semibold bg-orange-500/[0.12] border border-orange-500/35 text-orange-400 rounded-lg px-2.5 py-1.5 ml-1 whitespace-nowrap hover:bg-orange-500/20 transition">
              Volver a la mía
            </button>
          )}
        </div>
      </div>

      {abierto && (
        <div className="p-3">
          <div className="flex gap-3.5 flex-wrap text-[11.5px] text-gray-500 mb-2.5 px-0.5">
            {cargando ? <span>Cargando…</span> : <>
              <span><b className="text-gray-300 font-semibold tabular-nums">{resumen.sesiones}</b> sesiones</span>
              <span><b className="text-gray-300 font-semibold tabular-nums">{resumen.realizadas}</b> hechas</span>
              <span><b className="text-gray-300 font-semibold tabular-nums">{resumen.descanso}</b> {resumen.descanso === 1 ? 'día libre' : 'días libres'}</span>
              {/* Las que se añadió él. Son las que el entrenador no espera, así
                  que se cuentan aparte. */}
              {resumen.delAtleta > 0 && (
                <span className="text-violet-400"><b className="font-semibold tabular-nums">{resumen.delAtleta}</b> {resumen.delAtleta === 1 ? 'añadida' : 'añadidas'} por el atleta</span>
              )}
            </>}
          </div>

          <div className="grid grid-cols-2 min-[460px]:grid-cols-4 min-[820px]:grid-cols-7 gap-1.5">
            {dias.map(d => {
              const esHoy = d.sesiones.some(s => s.id === idSesionActual)
              return (
                <div key={d.fecha}
                  className={'rounded-xl border p-2 min-h-[92px] flex flex-col gap-1.5 ' +
                    (esHoy ? 'border-orange-500/50 bg-orange-500/[0.05]' : 'border-gray-800 bg-gray-950/40')}>
                  <span className={'text-[10px] font-bold uppercase tracking-wide ' + (esHoy ? 'text-orange-400' : 'text-gray-500')}>
                    {d.letra} {d.num}
                  </span>
                  {d.sesiones.length === 0 && <span className="text-[11px] text-gray-600 mt-1">descanso</span>}
                  {d.sesiones.map(s => {
                    const actual = s.id === idSesionActual
                    return (
                      <button key={s.id} disabled={actual}
                        onClick={() => setAbierta(a => a === s.id ? null : s.id)}
                        className={'w-full text-left rounded-lg border px-1.5 py-1.5 flex flex-col gap-0.5 transition ' +
                          (actual ? 'border-orange-500/60 bg-orange-500/10 cursor-default'
                            : abierta === s.id ? 'border-orange-400 bg-gray-950 ring-1 ring-orange-400/30'
                            : 'border-gray-800 bg-gray-950/70 hover:border-gray-600 hover:bg-gray-800/50')}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colorDisc(s.disciplina) }} />
                          <span className="text-[10.5px] font-semibold text-gray-300 truncate">{s.disciplina}</span>
                        </span>
                        {!!s.duracion_minutos && (
                          <span className="text-[10.5px] text-gray-500 tabular-nums">{s.duracion_minutos} min</span>
                        )}
                        <span className="flex flex-wrap gap-0.5">
                          {zonasDeSesion(s.tareas || []).slice(0, 3).map(z => (
                            <span key={z} className="text-[8.5px] font-bold px-1 py-px rounded bg-white/5"
                              style={{ color: colorZona(z) }}>{z}</span>
                          ))}
                        </span>
                        {actual ? <span className="text-[9px] text-orange-400">la que edito</span>
                          : esDelAtleta(s) ? <span className="text-[9px] text-violet-400">🙋 la añadió él</span>
                          : s.estado === 'Realizada' ? <span className="text-[9px] text-green-400">✓ hecha</span> : null}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {sesionAbierta && (() => {
            const tareas = sesionAbierta.tareas || []
            const copiables = tareas.filter(t => puedeCopiarse(t, sesionEsDeFuerza))
            const dia = dias.find(d => d.sesiones.some(s => s.id === sesionAbierta.id))
            return (
              <div className="mt-2.5 rounded-xl border border-gray-700 bg-gray-950/40 overflow-hidden">
                <div className="flex items-center justify-between gap-3 flex-wrap px-3.5 py-2.5 border-b border-gray-800 bg-white/[0.02]">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {/* Las flechas van pegadas al título, no en el grupo de acciones
                        de la derecha: no hacen nada, mueven de sitio. Mezclarlas con
                        «Copiar» —que sí escribe en el formulario— invita a pulsar la
                        que no es. */}
                    <button onClick={() => anterior && setAbierta(anterior.id)}
                      disabled={!anterior}
                      aria-label="Ver la sesión anterior de la semana"
                      title={anterior ? 'Ir a ' + comoSeLlama(dias, anterior) : 'No hay ninguna antes en esta semana'}
                      className={flechaBtn}>‹</button>

                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorDisc(sesionAbierta.disciplina) }} />
                    <strong className="text-[13.5px] font-semibold">
                      {dia?.nombre} {dia?.num} · {sesionAbierta.disciplina}
                    </strong>
                    <span className="text-[11.5px] text-gray-500">
                      {sesionAbierta.duracion_minutos ? sesionAbierta.duracion_minutos + ' min · ' : ''}{sesionAbierta.estado}
                    </span>

                    <button onClick={() => siguiente && setAbierta(siguiente.id)}
                      disabled={!siguiente}
                      aria-label="Ver la sesión siguiente de la semana"
                      title={siguiente ? 'Ir a ' + comoSeLlama(dias, siguiente) : 'No hay ninguna después en esta semana'}
                      className={flechaBtn}>›</button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {copiables.length > 0 && (
                      <button onClick={() => copiar(copiables, 'todo')}
                        className={btn + ' bg-orange-500 border-orange-500 text-white hover:bg-orange-600'}>
                        {copiada === 'todo' ? 'Copiadas ✓' : 'Copiar ' + (copiables.length === 1 ? 'la tarea' : 'las ' + copiables.length + ' tareas')}
                      </button>
                    )}
                    {/* Abre AQUÍ, no en otra pestaña. Moverse por las sesiones de la
                        semana era el motivo de todo esto, y con `target="_blank"` una
                        tarde de montar la semana acababa en seis pestañas.

                        Sigue siendo un <a> con href de verdad, así que ctrl+clic o
                        rueda del ratón siguen abriendo pestaña para quien la quiera.
                        Por eso la flecha pasa de ↗ (que promete pestaña nueva) a →. */}
                    <a href={'/sesion/' + sesionAbierta.id}
                      title="Ir a esta sesión"
                      className={btn + ' border-transparent text-gray-400 hover:text-white hover:bg-white/5'}>Abrir →</a>
                    <button onClick={() => setAbierta(null)} aria-label="Cerrar"
                      className={btn + ' border-transparent text-gray-500 hover:text-white hover:bg-white/5'}>✕</button>
                  </div>
                </div>

                {/* Con las tareas enteras esto se hace alto: scrollea dentro y no
                    echa la tabla de edición fuera de la pantalla. */}
                <div className="max-h-[400px] overflow-y-auto p-2.5">
                  {tareas.length === 0 && (
                    <p className="text-[12px] text-gray-600 px-1.5 py-2.5 m-0">Esta sesión todavía no tiene tareas.</p>
                  )}
                  {tareas.map((t: any, i: number) => {
                    const v = vistaDeTarea(t, tests, fcMax)
                    const cabe = puedeCopiarse(t, sesionEsDeFuerza)
                    return (
                      <div key={t.id ?? i}
                        className={'rounded-xl border border-gray-800 bg-gray-950/70 px-3 py-2.5 hover:border-gray-700 transition' + (i ? ' mt-1.5' : '')}>
                        <div className="flex items-start gap-2.5 mb-2">
                          <span className="w-[3px] self-stretch min-h-[30px] rounded-sm flex-shrink-0" style={{ background: colorZona(v.zona) }} />
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-semibold tracking-tight">{v.titulo}</div>
                            <div className="text-[10.5px] mt-0.5">
                              <b style={{ color: colorZona(v.zona) }}>{v.zona}</b>
                              <span className="text-gray-500"> {v.nombreZona}{v.disciplina ? ' · ' + v.disciplina : ''}</span>
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(94px,1fr))' }}>
                          {v.campos.map(c => (
                            <div key={c.k} className="bg-white/[0.028] rounded-md px-2 py-1 min-w-0">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-500">{c.k}</span>
                              <span className={'text-[12.5px] font-semibold tabular-nums break-words ' + (c.destaca ? 'text-orange-400' : '')}>{c.v}</span>
                            </div>
                          ))}
                        </div>
                        {v.encadenado && (
                          <p className="mt-1.5 text-[11px] text-violet-300">↳ encadenado con {v.encadenado}</p>
                        )}
                        {v.comentario && (
                          <p className="mt-1.5 text-[11.5px] text-gray-400 italic border-l-2 border-gray-700 pl-2.5">{v.comentario}</p>
                        )}
                        <div className="flex justify-end items-center gap-2 mt-2">
                          {cabe ? (
                            <button onClick={() => copiar([t], 't' + i)}
                              className={btn + ' bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'}>
                              {copiada === 't' + i ? 'Copiada ✓' : 'Copiar esta tarea'}
                            </button>
                          ) : (
                            /* No es un capricho: la tabla de abajo pinta el
                               formulario de fuerza O el de resistencia según la
                               disciplina de la sesión. Una tarea del otro tipo no
                               tiene fila donde ir y se perdería al guardar. */
                            <span className="text-[10.5px] text-amber-300/85">
                              No cabe aquí: es {v.esFuerza ? 'fuerza' : 'resistencia'} y esta sesión es {sesionEsDeFuerza ? 'de fuerza' : 'de resistencia'}.
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="px-3.5 py-2 border-t border-gray-800 bg-black/20">
                  <p className="text-[11px] text-gray-500 m-0">
                    Copiar te deja la tarea como fila nueva abajo, sin guardar. La revisas y le das a ✓. Esta sesión no se toca.
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
