'use client'
// ============================================================
// TRIPULSE — Información de la semana
// ============================================================
//
// El desplegable que el entrenador mira MIENTRAS monta la semana: cuántas
// series lleva cada grupo muscular y cómo está repartido el tiempo por zonas.
//
// CERRADO OCUPA UNA LÍNEA, y es lo que de verdad se mira. Si para saber si la
// semana va bien hubiera que abrirlo, no serviría: se monta una sesión mirando
// la tabla, no un panel.
//
// LAS CUENTAS NO ESTÁN AQUÍ. Están en `lib/semana-info`, que agrupa lo que ya
// calculaban `series-por-grupo` y `atribucion`. Esta pantalla solo pinta.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  cargarSemana, comoTiempo, porDisciplina, porZona, reparto, resumen, soloResistencia,
  type BloqueSemana, type SemanaCargada,
} from '@/lib/semana-info'
import { seriesPorGrupo, cargarObjetivos, SIN_CLASIFICAR } from '@/lib/series-por-grupo'
import { esDeFamilia } from '@/lib/familias-grupo'
import { lunesDe, sumarDias, rangoLegible } from '@/lib/fechas'
import { emojiDisciplina } from '@/lib/disciplinas'

/**
 * LO FIJADO SE GUARDA EN ESTE NAVEGADOR, no en la base.
 *
 * Es una preferencia de pantalla —qué miro yo— y no un dato del atleta ni del
 * test, así que no merece una tabla. El precio es que no viaja de un ordenador
 * a otro; si algún día estorba, se sube a una tabla por entrenador y ya está.
 */
const LLAVE = 'tp_info_semana_fijado'

interface Fijado { grupos: string[]; ejercicios: string[] }
const VACIO: Fijado = { grupos: [], ejercicios: [] }

function leerFijado(): Fijado {
  try {
    const o = JSON.parse(localStorage.getItem(LLAVE) || '{}')
    return {
      grupos: Array.isArray(o?.grupos) ? o.grupos.filter((x: unknown) => typeof x === 'string') : [],
      ejercicios: Array.isArray(o?.ejercicios) ? o.ejercicios.filter((x: unknown) => typeof x === 'string') : [],
    }
  } catch { return VACIO }
}

const caja = 'bg-[#0d1420] border border-gray-800 rounded-xl px-3.5 py-3 mt-3'
const titulo = 'text-[10px] uppercase tracking-[0.1em] text-gray-500 font-bold mb-2.5'
const pie = 'text-gray-500 text-[11.5px] leading-snug mt-2.5'
const chip = (on: boolean) =>
  'text-[12px] px-2.5 py-1 rounded-full border transition mr-1.5 mb-1.5 ' +
  (on ? 'border-orange-500/50 bg-orange-500/[0.12] text-orange-200' : 'border-gray-700 text-gray-400 hover:text-gray-200')

export default function InfoSemana({ idDeportista, fecha }: {
  idDeportista: number | null | undefined
  /** La fecha de la sesión ABIERTA, no la de hoy: es la semana que se monta. */
  fecha: string | null | undefined
}) {
  const [abierto, setAbierto] = useState(false)
  const [pestana, setPestana] = useState<'fuerza' | 'resistencia' | 'ajustes'>('fuerza')
  const [hecho, setHecho] = useState(false)
  const [datos, setDatos] = useState<SemanaCargada | null>(null)
  const [objetivos, setObjetivos] = useState<Record<string, number>>({})
  const [fijado, setFijado] = useState<Fijado>(VACIO)
  const [cargando, setCargando] = useState(false)

  useEffect(() => { setFijado(leerFijado()) }, [])

  const lunes = fecha ? lunesDe(fecha) : null
  const domingo = lunes ? sumarDias(lunes, 6) : null

  const traer = useCallback(async () => {
    if (!idDeportista || !lunes || !domingo) return
    setCargando(true)
    const [d, obj] = await Promise.all([
      cargarSemana(supabase, idDeportista, lunes, domingo, { hecho }),
      cargarObjetivos(supabase, idDeportista).catch(() => ({})),
    ])
    setDatos(d)
    setObjetivos(obj || {})
    setCargando(false)
  }, [idDeportista, lunes, domingo, hecho])

  /* Solo se pide al abrirlo. Montando una sesión el panel está cerrado el 90 %
     del tiempo, y traerlo igualmente sería una consulta por cada visita a una
     pantalla que ya hace varias. */
  useEffect(() => { if (abierto) traer() }, [abierto, traer])

  const bloques: BloqueSemana[] = datos?.bloques || []
  /* Las zonas y el «cuánto va suave» SOLO de resistencia: FMI y FLEX son de
     gimnasio y contaban como duras. Lo de por deporte sí lleva la fuerza. */
  const resistencia = soloResistencia(bloques)
  const grupos = seriesPorGrupo(datos?.ejercicios || [])
  const r = reparto(resistencia)
  const zonas = porZona(resistencia)

  const guardar = (f: Fijado) => {
    setFijado(f)
    try { localStorage.setItem(LLAVE, JSON.stringify(f)) } catch { /* ventana privada */ }
  }
  const alternar = (clave: keyof Fijado, v: string) => {
    const lista = fijado[clave]
    guardar({ ...fijado, [clave]: lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v] })
  }

  /* Lo fijado sube; lo demás NO desaparece. Escondiéndolo dejarías de ver justo
     el grupo que te estás olvidando, que es para lo que sirve esto.

     Y LA MOVILIDAD VA APARTE, como lo funcional. Un estiramiento sostenido dos
     veces no es volumen semanal de un músculo, igual que cuatro series de remo
     no son cuatro series de fuerza —eso ya lo resuelve `seriesPorGrupo`
     tirando el cardio—. Mezclada, se come la lista: en una semana real eran 26
     series de estiramientos contra 11 de fuerza, y el panel decía que lo más
     trabajado de la semana era la movilidad.

     La familia la pone `lib/familias-grupo`, que ya tiene su patrón: así
     entran «Movilidad y flexibilidad» y cualquier grupo que alguien llame
     «Estiramientos» mañana. */
  const esAparte = (g: string) => esDeFamilia('funcional', g) || esDeFamilia('movilidad', g)
  /* La línea de arriba cuenta SOLO lo que se enseña como fuerza: diciendo «37
     series» y luego pintando 11 en la lista de músculos, el número de la
     cabecera no cuadraría con nada de lo que hay debajo. */
  const deFuerza = grupos.filter(g => !esAparte(g.grupo))
  const mios = grupos.filter(g => fijado.grupos.includes(g.grupo))
  const resto = grupos.filter(g => !fijado.grupos.includes(g.grupo) && !esAparte(g.grupo))
  const funcionales = grupos.filter(g => esDeFamilia('funcional', g.grupo))
  const movilidad = grupos.filter(g => esDeFamilia('movilidad', g.grupo))

  const porEjercicio = (() => {
    if (!fijado.ejercicios.length) return []
    const mapa = new Map<string, number>()
    for (const e of datos?.ejercicios || []) {
      const n = (e.nombre || '').trim()
      if (!n || !fijado.ejercicios.includes(n)) continue
      const s = Number(e.series)
      mapa.set(n, (mapa.get(n) || 0) + (Number.isFinite(s) && s > 0 ? s : 0))
    }
    return [...mapa.entries()].map(([nombre, series]) => ({ nombre, series }))
  })()

  const nombresEjercicio = [...new Set((datos?.ejercicios || [])
    .map(e => (e.nombre || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))

  if (!idDeportista || !fecha) return null

  // ---------- una fila de grupo ----------
  /* `tope` es contra qué se mide la barra cuando el grupo no tiene objetivo, y
     lo pone CADA CAJA con su propio máximo. Con un tope único, las 26 series de
     estiramientos dejaban las de fuerza en una rayita de nada aunque estén en
     listas distintas. */
  const fila = (g: { grupo: string; series: number }, fijada: boolean, tope: number) => {
    const obj = objetivos[g.grupo] ?? null
    /* SIN OBJETIVO LA BARRA MIDE CONTRA EL GRUPO MÁS TRABAJADO, no al 100 %.
       Pintarlas todas llenas era lo mismo que no pintarlas: cuatro barras
       grises e idénticas donde una tenía 26 series y otra 3. Con objetivo mide
       lo que le falta, que es otra pregunta y por eso va de otro color. */
    const pct = obj && obj > 0
      ? Math.min(100, Math.round((g.series / obj) * 100))
      : Math.max(4, Math.round((g.series / Math.max(1, tope)) * 100))
    const color = !obj ? 'rgba(255,255,255,.22)' : pct >= 100 ? '#22C55E' : pct >= 60 ? '#EAB308' : '#F97316'
    return (
      <div key={g.grupo} className="flex items-center gap-2.5 py-1.5 border-b border-gray-800/60 last:border-0">
        <span className="text-[13px] min-w-[96px]">
          {fijada && <span className="text-orange-400 text-[10px] mr-1">★</span>}{g.grupo}
        </span>
        <span className="flex-1 h-[7px] rounded-full bg-white/[0.07] overflow-hidden min-w-[50px]">
          <i className="block h-full rounded-full" style={{ width: pct + '%', background: color }} />
        </span>
        <span className="font-mono tabular-nums text-[12.5px] min-w-[58px] text-right">
          {g.series}{obj ? <span className="text-gray-600"> / {obj}</span> : <span className="text-gray-600"> / —</span>}
        </span>
        <span className="text-[11px] text-gray-500 min-w-[66px] text-right">
          {!obj ? 'sin objetivo' : g.series >= obj ? 'cumplido' : 'faltan ' + (obj - g.series)}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3.5 mb-4">
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center gap-2.5 flex-wrap text-left">
        <b className="text-[14px]">📊 Información de la semana</b>
        {!abierto && (
          <span className="text-gray-400 text-[12.5px]">
            {cargando ? 'cargando…' : datos ? resumen(deFuerza, bloques) : rangoLegible(lunes!)}
          </span>
        )}
        {abierto && <span className="text-gray-500 text-[12.5px]">{rangoLegible(lunes!)}</span>}
        <span className={'ml-auto text-gray-600 text-[12px] transition ' + (abierto ? 'rotate-180' : '')}>▾</span>
      </button>

      {abierto && (
        <>
          <div className="flex gap-1.5 mt-3.5 flex-wrap items-center">
            {([['fuerza', 'Fuerza'], ['resistencia', 'Resistencia'], ['ajustes', '⚙ Elegir qué veo']] as const)
              .map(([k, et]) => (
                <button key={k} onClick={() => setPestana(k)}
                  className={'text-[12.5px] px-3 py-1.5 rounded-lg border transition ' + (pestana === k
                    ? 'bg-orange-500/[0.14] border-orange-500/50 text-orange-200 font-semibold'
                    : 'bg-gray-800 border-transparent text-gray-400 hover:text-gray-200')}>
                  {et}
                </button>
              ))}
            {/* PRESCRITO O HECHO cambia las DOS mitades a la vez: con fuerza
                prescrita y resistencia realizada se estarían comparando dos
                semanas distintas sin saberlo. */}
            <button onClick={() => setHecho(h => !h)}
              className={'ml-auto text-[11.5px] px-2.5 py-1.5 rounded-lg border transition ' + (hecho
                ? 'border-green-500/45 bg-green-500/[0.1] text-green-300'
                : 'border-gray-700 text-gray-500 hover:text-gray-300')}>
              {hecho ? '✓ lo que hizo' : 'ver lo que hizo'}
            </button>
          </div>

          {cargando && <p className="text-gray-500 text-[12.5px] mt-3">Cargando la semana…</p>}

          {!cargando && hecho && datos && datos.realizadas === 0 && (
            <p className="text-amber-300/90 text-[12px] mt-3">
              De las {datos.sesiones} sesiones de esta semana no hay ninguna marcada como hecha todavía.
            </p>
          )}

          {!cargando && pestana === 'fuerza' && (
            <>
              {mios.length > 0 && (
                <div className={caja}>
                  <p className={titulo}>★ Lo que vigilo</p>
                  {mios.map(g => fila(g, true, Math.max(...mios.map(x => x.series), 1)))}
                  {porEjercicio.map(e => (
                    <div key={e.nombre} className="flex items-center gap-2.5 py-1.5 border-b border-gray-800/60 last:border-0">
                      <span className="text-[13px] min-w-[96px]"><span className="text-orange-400 text-[10px] mr-1">★</span>{e.nombre}</span>
                      <span className="flex-1 h-[7px] rounded-full bg-white/[0.07] overflow-hidden min-w-[50px]">
                        <i className="block h-full rounded-full bg-sky-400" style={{ width: '100%' }} />
                      </span>
                      <span className="font-mono tabular-nums text-[12.5px] min-w-[58px] text-right">{e.series}</span>
                      <span className="text-[11px] text-gray-500 min-w-[66px] text-right">series</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={caja}>
                <p className={titulo}>{mios.length ? 'El resto' : 'Series por grupo muscular'}</p>
                {resto.length ? resto.map(g => fila(g, false, Math.max(...resto.map(x => x.series), 1)))
                  : <p className="text-gray-600 text-[12.5px] italic">Nada de fuerza esta semana.</p>}
              </div>

              {/* Cada uno solo sale si se ha usado, que es lo que se pidió. */}
              {funcionales.length > 0 && (
                <div className={caja}>
                  <p className={titulo}>Funcional y complejos</p>
                  {funcionales.map(g => fila(g, fijado.grupos.includes(g.grupo),
                    Math.max(...funcionales.map(x => x.series), 1)))}
                  <p className={pie}>
                    No son de un músculo: son el cuerpo entero moviendo una carga, y por eso van aparte.
                  </p>
                </div>
              )}

              {movilidad.length > 0 && (
                <div className={caja}>
                  <p className={titulo}>Movilidad y estiramientos</p>
                  {movilidad.map(g => fila(g, fijado.grupos.includes(g.grupo),
                    Math.max(...movilidad.map(x => x.series), 1)))}
                  <p className={pie}>
                    Van aparte por lo mismo: un estiramiento sostenido dos veces no es volumen de un
                    músculo. Mezclado arriba se come la lista — y lo que quieres saber ahí es cuánta
                    fuerza lleva cada grupo.
                  </p>
                </div>
              )}

              {grupos.some(g => g.grupo === SIN_CLASIFICAR) && (
                <p className={pie}>
                  Hay series en <b className="text-gray-400">«{SIN_CLASIFICAR}»</b>: son ejercicios sin grupo
                  muscular puesto. Se lo pones en la biblioteca y se recolocan solas.
                </p>
              )}
            </>
          )}

          {!cargando && pestana === 'resistencia' && (
            <>
              <div className={caja}>
                <p className={titulo}>Reparto por zona</p>
                {zonas.length === 0
                  ? <p className="text-gray-600 text-[12.5px] italic">Nada de resistencia esta semana.</p>
                  : (
                    <>
                      <div className="flex h-[22px] rounded-lg overflow-hidden mb-3">
                        {zonas.map(z => (
                          <i key={z.zona} style={{ width: z.pct + '%', background: z.color }} title={z.nombre} />
                        ))}
                      </div>
                      {zonas.map(z => (
                        <div key={z.zona} className="flex items-center gap-2.5 py-1.5 border-b border-gray-800/60 last:border-0 text-[13px]">
                          <span className="w-[9px] h-[9px] rounded-[3px] flex-none" style={{ background: z.color }} />
                          <span className="flex-1 min-w-0 truncate">
                            {z.nombre} <span className="font-mono text-[11px] text-gray-500">{z.zona}</span>
                          </span>
                          <span className="font-mono tabular-nums min-w-[44px] text-right">{z.pct} %</span>
                          <span className="font-mono tabular-nums text-sky-300 min-w-[56px] text-right">{comoTiempo(z.minutos)}</span>
                          <span className="font-mono tabular-nums text-sky-300 min-w-[64px] text-right">
                            {z.metros > 0 ? (z.metros / 1000).toFixed(1).replace('.', ',') + ' km' : '—'}
                          </span>
                        </div>
                      ))}
                      {/* LAS DOS CUENTAS, y las dos hacen falta: contando solo
                          sesiones uno se cree más polarizado de lo que es, y
                          contando solo minutos infravalora el coste de las
                          duras (máster, L1.4). */}
                      <p className={pie}>
                        <b className="text-gray-300">{r.pctMinutos} % suave por minutos</b> · {r.pctSesiones} % por sesiones.
                        Los dos números describen la semana: contando solo sesiones te crees más polarizado de
                        lo que eres. El corte está en AEM, y <b className="text-gray-400">la fuerza no cuenta
                        aquí</b>: sus zonas son otras y meterlas haría parecer dura una semana que no lo es.
                      </p>
                    </>
                  )}
              </div>

              {porDisciplina(bloques).length > 0 && (
                <div className={caja}>
                  <p className={titulo}>Por deporte</p>
                  {porDisciplina(bloques).map(d => (
                    <div key={d.disciplina} className="flex items-center gap-2.5 py-1.5 border-b border-gray-800/60 last:border-0 text-[13px]">
                      <span className="flex-1 min-w-0 truncate">{emojiDisciplina(d.disciplina)} {d.disciplina}</span>
                      <span className="text-[11px] text-gray-500">{d.sesiones} {d.sesiones === 1 ? 'sesión' : 'sesiones'}</span>
                      <span className="font-mono tabular-nums text-sky-300 min-w-[56px] text-right">{comoTiempo(d.minutos)}</span>
                      <span className="font-mono tabular-nums text-sky-300 min-w-[72px] text-right">
                        {d.metros > 0 ? (d.metros / 1000).toFixed(1).replace('.', ',') + ' km' : 'tiempo'}
                      </span>
                    </div>
                  ))}
                  <p className={pie}>
                    La bici sale en <b className="text-gray-400">tiempo</b> y no en kilómetros a propósito: por
                    distancia no se puede estimar. Y los kilómetros de carrera dicen más del riesgo de lesión
                    que cualquier puntuación combinada.
                  </p>
                </div>
              )}
            </>
          )}

          {!cargando && pestana === 'ajustes' && (
            <>
              <div className={caja}>
                <p className={titulo}>Grupos musculares</p>
                {grupos.length === 0
                  ? <p className="text-gray-600 text-[12.5px] italic">Todavía no hay ninguno esta semana.</p>
                  : grupos.map(g => (
                    <button key={g.grupo} onClick={() => alternar('grupos', g.grupo)}
                      className={chip(fijado.grupos.includes(g.grupo))}>
                      {fijado.grupos.includes(g.grupo) ? '★ ' : ''}{g.grupo}
                    </button>
                  ))}
                <p className={pie}>
                  Lo marcado sube arriba con ★. <b className="text-gray-400">Lo demás no desaparece</b>: se queda
                  debajo. Escondiéndolo dejarías de ver justo el grupo que te estás olvidando.
                </p>
              </div>

              <div className={caja}>
                <p className={titulo}>Ejercicios concretos</p>
                {nombresEjercicio.length === 0
                  ? <p className="text-gray-600 text-[12.5px] italic">Todavía no hay ninguno esta semana.</p>
                  : nombresEjercicio.map(n => (
                    <button key={n} onClick={() => alternar('ejercicios', n)}
                      className={chip(fijado.ejercicios.includes(n))}>
                      {fijado.ejercicios.includes(n) ? '★ ' : ''}{n}
                    </button>
                  ))}
                <p className={pie}>
                  Para cuando lo que quieres vigilar no es un grupo sino <b className="text-gray-400">un
                  ejercicio</b>: cuántas series de peso muerto lleva esta semana.
                </p>
              </div>

              <p className={pie}>
                Se guarda <b className="text-gray-400">en este navegador</b> y vale para todos tus atletas: lo
                que vigilas es tu manera de entrenar, no la de uno.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
