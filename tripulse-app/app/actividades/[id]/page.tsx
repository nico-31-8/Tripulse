'use client'
// ============================================================
// TRIPULSE — Lo que manda el reloj, para mirarlo
// ============================================================
// Las actividades que llegan del dispositivo se guardaban en `reloj_medicion` y
// no se enseñaban en ninguna parte: el entrenador sabía que había un reloj
// conectado y cuándo llegó la última noche, pero no qué había llegado.
//
// Esta pantalla las enseña tal como vinieron, con dos cosas al lado:
//   · lo que había PLANIFICADO ese día, para poder comparar a ojo;
//   · lo que mandó el reloj, ya traducido y plegado, para ver qué contiene de
//     verdad.
//
// Y desde el 2026-10-19 (maqueta aprobada, «las 7 como propones»), cómo está
// cada entreno con su sesión: unido, sugerido, para completar o sin sesión
// (components/EstadoDelEntreno, lib/reloj-sesion). La app solo SUGIERE: une el
// deportista al cerrar la sesión, o el entrenador aquí. Unir sin RPE no cierra
// la sesión ni suma carga: hacerlo mal ensuciaría la del atleta.

import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, use } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias, fechaLarga, lunesDe, aISO } from '@/lib/fechas'
import { vivas } from '@/lib/papelera'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { useDeclararModulo } from '@/lib/contexto-modulo'
import { nombreReloj, datosListos } from '@/lib/relojes-catalogo'
import { colorDisciplina, emojiDisciplina, etiquetaConEmoji, etiquetaDisciplina } from '@/lib/disciplinas'
import { NochesDelReloj } from '@/components/NochesDelReloj'
import {
  actividadesDeMediciones, nombreDeporte, distanciaTexto, ritmoTexto, totales,
  type ActividadReloj,
} from '@/lib/actividades-reloj'
import { estadoDeActividad, opcionesDeLaSemana, type EstadoActividad, type UnionReloj } from '@/lib/reloj-sesion'
import { sesionDelReloj, SELECT_SESION_RELOJ, type SesionDelReloj } from '@/lib/reloj-union'
import { EstadoDelEntreno } from '@/components/EstadoDelEntreno'
import { DetalleEntreno, type ZonasDelDeportista } from '@/components/DetalleEntreno'
import { zonasFcDe, DIAS_DETALLE } from '@/lib/detalle-entreno'
import { cargarReferencias } from '@/lib/referencia-zona'


const RANGOS = [
  { label: '4 sem', dias: 28 },
  { label: '8 sem', dias: 56 },
  { label: '16 sem', dias: 112 },
  { label: 'Todo', dias: 3650 },
]

const horas = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'
}

/* Una sesión no tiene título en la base: se nombra por su disciplina y su zona,
   que es como se nombra en el resto de la app. */
interface SesionDelDia { id: number; disciplina: string | null; zona: string | null; estado: string | null; minutos: number | null }
interface FilaSesion {
  id: number; fecha_sesion: string; disciplina: string | null; estado: string | null
  duracion_real: number | null; duracion_minutos: number | null; zona_resistencia: string | null; zona_fuerza: string | null
}

export default function ActividadesDelReloj({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  useRequireEntrenador()

  const [nombre, setNombre] = useState<string | null>(null)
  const [proveedor, setProveedor] = useState<string | null>(null)
  const [ultimaSinc, setUltimaSinc] = useState<string | null>(null)
  const [actividades, setActividades] = useState<ActividadReloj[] | null>(null)
  const [crudo, setCrudo] = useState<Record<number, unknown>>({})
  const [sesiones, setSesiones] = useState<Record<string, SesionDelDia[]>>({})
  const [rango, setRango] = useState(56)
  const [disciplina, setDisciplina] = useState<string>('todas')
  const [abierta, setAbierta] = useState<number | null>(null)
  /* Noches o entrenos. Sin elegir, abre en Noches si su reloj las manda (decidido el 18-10-2026). */
  const [pestana, setPestana] = useState<'noches' | 'entrenos' | null>(null)
  /* Cada entreno con su sesión: las sesiones de esas semanas enteras y las decisiones. */
  const [sesionesUnion, setSesionesUnion] = useState<SesionDelReloj[]>([])
  const [uniones, setUniones] = useState<UnionReloj[]>([])
  const [errorUnion, setErrorUnion] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  /* El detalle de cada entreno (components/DetalleEntreno): cuáles lo tienen ya,
     sus zonas de FC y la zona de cada sesión, para marcar la prescrita. */
  const [conDetalle, setConDetalle] = useState<Set<number>>(new Set())
  const [zonasDep, setZonasDep] = useState<ZonasDelDeportista | null>(null)
  const [zonaDeSesion, setZonaDeSesion] = useState<Map<number, string | null>>(new Map())

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      const desde = sumarDias(hoyISO(), -rango)
      const [dep, con, med, ses, uni, det, refs] = await Promise.all([
        supabase.from('deportista').select('nombre').eq('id', id).maybeSingle(),
        supabase.from('reloj_conexion').select('proveedor, ultima_sincronizacion')
          .eq('id_deportista', id).order('conectado_en', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('reloj_medicion').select('id, proveedor, fecha, id_externo, datos, recibido_en')
          .eq('id_deportista', id).eq('tipo', 'entreno')
          .gte('fecha', desde).order('fecha', { ascending: false }).limit(400),
        /* Lo planificado del mismo periodo, para poder poner las dos cosas al
           lado. La papelera no cuenta: comparar contra una sesión borrada sería
           comparar contra algo que el entrenador ya decidió que no existe. Desde
           el lunes de esa semana: un entreno se puede unir a otro día de la suya. */
        vivas(supabase.from('sesion').select(SELECT_SESION_RELOJ + ', duracion_minutos, zona_resistencia, zona_fuerza')
          .eq('id_deportista', id).gte('fecha_sesion', lunesDe(desde))),
        supabase.from('reloj_union').select('id, id_medicion, id_sesion, parte, decision, antes, decidido_por, decidido_en')
          .eq('id_deportista', id),
        /* Solo cuáles lo tienen: el detalle en sí se pide al abrirlo. */
        supabase.from('reloj_detalle').select('id_medicion').eq('id_deportista', id),
        cargarReferencias(supabase, Number(id)),
      ])
      if (!vivo) return
      /* El select se arma con trozos, así que el cliente no sabe su forma: se dice aquí. */
      const filasSes = (ses.data || []) as unknown as FilaSesion[]
      setSesionesUnion(filasSes.map(sesionDelReloj))
      setUniones((uni.data || []) as UnionReloj[])
      setErrorUnion(ses.error || uni.error ? 'No se ha podido leer qué entreno va con qué sesión: ' + (ses.error || uni.error)!.message : null)
      setNombre(dep.data?.nombre ?? null)
      setProveedor(con.data?.proveedor ?? null)
      setUltimaSinc(con.data?.ultima_sincronizacion ?? null)

      const filas = med.data || []
      setActividades(actividadesDeMediciones(filas))
      setCrudo(Object.fromEntries(filas.map(f => [f.id, f.datos])))

      setConDetalle(new Set((det.data || []).map(d => d.id_medicion as number)))
      setZonaDeSesion(new Map(filasSes.map(s => [s.id, s.zona_resistencia])))
      const z = zonasFcDe(refs.sistema, { fcMax: refs.fcMax, fcReposo: refs.fcReposo })
      setZonasDep(z ? {
        zonas: z.zonas,
        nota: (refs.sistema === 2 ? 'Zonas 2' : 'Clásico') + ' · FC máx ' + refs.fcMax
          + (z.metodo === 'karvonen' ? ' y reposo ' + refs.fcReposo + ', con su reserva' : ', sin su reposo'),
      } : null)

      const porDia: Record<string, SesionDelDia[]> = {}
      for (const s of filasSes) {
        const f = String(s.fecha_sesion).slice(0, 10)
        ;(porDia[f] ||= []).push({
          id: s.id, disciplina: s.disciplina, zona: s.zona_resistencia || s.zona_fuerza || null,
          estado: s.estado, minutos: s.duracion_real || s.duracion_minutos || null,
        })
      }
      setSesiones(porDia)
    }
    cargar()
    return () => { vivo = false }
  }, [id, rango, version])

  /* Cómo está cada entreno con su sesión (lib/reloj-sesion). */
  const estados = useMemo(() => {
    const m = new Map<number, EstadoActividad>()
    for (const a of actividades || []) m.set(a.id, estadoDeActividad(a, sesionesUnion, uniones))
    return m
  }, [actividades, sesionesUnion, uniones])
  const resumenUnion = useMemo(() => {
    const r = { unidas: 0, porConfirmar: 0, sinSesion: 0, noCuentan: 0 }
    for (const e of estados.values()) {
      if (e.k === 'unida' && !e.faltaRpe && e.union.antes) r.unidas++
      else if (e.k === 'sin_sesion') r.sinSesion++
      else if (e.k === 'no_cuenta') r.noCuentan++
      else r.porConfirmar++
    }
    return r
  }, [estados])

  const visibles = useMemo(
    () => (actividades || []).filter(a => disciplina === 'todas' || a.disciplina === disciplina),
    [actividades, disciplina])
  const t = useMemo(() => totales(visibles), [visibles])

  useDeclararModulo('Actividades del reloj', nombre && actividades
    ? nombre + ': ' + t.actividades + ' actividades del reloj en ' + rango + ' días, ' + horas(t.minutos) + '.'
    : '')

  const porDisciplina = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of actividades || []) m[a.disciplina || 'otras'] = (m[a.disciplina || 'otras'] || 0) + 1
    return m
  }, [actividades])

  const dias = useMemo(() => {
    const m = new Map<string, ActividadReloj[]>()
    for (const a of visibles) {
      const l = m.get(a.fecha)
      if (l) l.push(a); else m.set(a.fecha, [a])
    }
    return [...m.entries()]
  }, [visibles])

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-30 pl-44 pr-6 h-[54px] flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <h1 className="text-[17px] font-bold tracking-tight truncate">
          Su reloj
          {nombre && <span className="text-gray-500 font-normal text-[13px] hidden sm:inline"> · {nombre}</span>}
        </h1>
        <button onClick={() => router.push('/deportistas/' + id)}
          className="text-[12.5px] text-gray-400 hover:text-white transition flex-shrink-0">Ver ficha →</button>
      </header>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5">
        {/* De dónde viene lo que hay debajo. Sin esto, una lista vacía no se
            distingue de «no tiene reloj». */}
        <div className="tp-card p-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <p className="text-[9.5px] font-bold tracking-[.07em] uppercase text-gray-500">Reloj</p>
            <p className="text-[15px] font-bold mt-1">{proveedor ? '⌚ ' + nombreReloj(proveedor) : 'Sin conectar'}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-bold tracking-[.07em] uppercase text-gray-500">Última sincronización</p>
            <p className="text-[15px] font-bold mt-1 tabular-nums">
              {ultimaSinc
                ? fechaLarga(aISO(new Date(ultimaSinc))) + ', ' + new Date(ultimaSinc).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </p>
          </div>
          {proveedor && !datosListos(proveedor) && (
            <p className="text-[12px] text-yellow-300/90 flex-1 min-w-[240px]">
              Esta marca está conectada pero sus datos todavía no se traducen. Aquí verás en crudo lo que manda,
              que es justo lo que hace falta para escribir la traducción.
            </p>
          )}
        </div>

        {/* Noches y entrenos. Las noches solo salen si su reloj ya las traduce. */}
        {proveedor && datosListos(proveedor) && (
          <div className="flex gap-1 border-b border-gray-800 mb-4" role="tablist">
            {(['noches', 'entrenos'] as const).map(p => (
              <button key={p} role="tab" aria-selected={(pestana ?? 'noches') === p} onClick={() => setPestana(p)}
                className={'px-3.5 py-2 text-[13.5px] font-semibold border-b-2 -mb-px transition ' + ((pestana ?? 'noches') === p
                  ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-white')}>
                {p === 'noches' ? 'Noches' : 'Entrenos'}
              </button>
            ))}
          </div>
        )}
        {proveedor && datosListos(proveedor) && (pestana ?? 'noches') === 'noches' ? (
          <NochesDelReloj idDeportista={Number(id)} proveedor={proveedor} />
        ) : (<>
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1.5">
            {RANGOS.map(r => (
              <button key={r.dias} onClick={() => setRango(r.dias)}
                className={'text-[11.5px] font-semibold px-3 py-1.5 rounded-full border transition ' + (rango === r.dias
                  ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                  : 'text-gray-400 bg-white/[0.04] border-white/[0.06] hover:text-white')}>{r.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['todas', ...Object.keys(porDisciplina)].map(k => (
              <button key={k} onClick={() => setDisciplina(k)}
                className={'text-[11.5px] font-semibold px-3 py-1.5 rounded-full border transition ' + (disciplina === k
                  ? 'bg-white/[0.1] text-white border-white/20'
                  : 'text-gray-400 bg-white/[0.04] border-white/[0.06] hover:text-white')}>
                {k === 'todas' ? 'Todas' : k === 'otras' ? 'Otros deportes' : etiquetaConEmoji(k)}
                {k !== 'todas' && <span className="text-gray-500 ml-1.5 tabular-nums">{porDisciplina[k]}</span>}
              </button>
            ))}
          </div>
        </div>

        {actividades === null ? (
          <div className="tp-card p-12 text-center text-gray-500 text-[13px]">Cargando…</div>
        ) : !actividades.length ? (
          /* Vacío con motivo: cada caso se arregla de una forma distinta. */
          <div className="tp-card p-12 text-center">
            <p className="text-[15px] font-bold mb-1.5">Todavía no ha llegado ningún entreno</p>
            <p className="text-[13px] text-gray-400 max-w-md mx-auto leading-relaxed">
              {/* Sin «él»: sirve para cualquier deportista. Lo de «después de
                  conectarla» es de Polar; COROS da también las semanas de antes. */}
              {!proveedor
                ? 'No tiene ningún reloj conectado. Se conecta desde su perfil de deportista; tú no puedes hacerlo en su lugar.'
                : 'Su ' + nombreReloj(proveedor) + ' está conectado, pero no ha llegado ninguna actividad en este periodo.'
                  + ' Los entrenos llegan cuando sincroniza su reloj'
                  + (proveedor === 'polar' ? ', y solo los que haya subido a la app de Polar después de conectarla.' : '.')}
            </p>
          </div>
        ) : (
          <>
            {/* Totales de lo que se está mirando */}
            <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
              {[
                { k: 'Actividades', v: String(t.actividades) },
                { k: 'Tiempo', v: horas(t.minutos) },
                { k: 'Distancia', v: t.metros ? distanciaTexto(t.metros) : '—' },
                { k: 'Sin clasificar', v: String(t.sinDisciplina), sub: t.sinDisciplina ? 'su deporte no es de las cuatro' : '' },
              ].map(c => (
                <div key={c.k} className="tp-card p-3.5">
                  <p className="text-[9.5px] font-bold tracking-[.07em] uppercase text-gray-500">{c.k}</p>
                  <p className="text-[19px] font-bold mt-1 tabular-nums tracking-tight">{c.v}</p>
                  {c.sub && <p className="text-[10.5px] text-gray-500 mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Cómo están con sus sesiones, de un vistazo. */}
            <div className="flex flex-wrap gap-2 mb-4 text-[11.5px] font-semibold">
              {resumenUnion.unidas > 0 && <span className="rounded-full px-2.5 py-0.5 bg-green-400/15 text-green-400">{resumenUnion.unidas} {resumenUnion.unidas === 1 ? 'unido' : 'unidos'}</span>}
              {resumenUnion.porConfirmar > 0 && <span className="rounded-full px-2.5 py-0.5 bg-amber-400/15 text-amber-300">{resumenUnion.porConfirmar} por confirmar</span>}
              {resumenUnion.sinSesion > 0 && <span className="rounded-full px-2.5 py-0.5 bg-sky-400/15 text-sky-300">{resumenUnion.sinSesion} sin sesión</span>}
              {resumenUnion.noCuentan > 0 && <span className="rounded-full px-2.5 py-0.5 bg-white/[0.06] text-gray-400">{resumenUnion.noCuentan} no {resumenUnion.noCuentan === 1 ? 'cuenta' : 'cuentan'}</span>}
            </div>
            {errorUnion && <p className="text-[12.5px] text-red-300 mb-4">{errorUnion}</p>}

            <div className="flex flex-col gap-4">
              {dias.map(([fecha, dellDia]) => (
                <div key={fecha}>
                  <p className="text-[11.5px] font-semibold text-gray-500 mb-1.5">{fechaLarga(fecha)}</p>

                  <div className="flex flex-col gap-2">
                    {dellDia.map(a => {
                      const color = colorDisciplina(a.disciplina)
                      const ritmo = ritmoTexto(a)
                      return (
                        <div key={a.id} className="tp-card p-4" style={{ ['--c' as string]: color } as React.CSSProperties}>
                          <div className="flex items-start gap-3">
                            <span className="w-9 h-9 rounded-xl grid place-items-center text-lg flex-shrink-0"
                              style={{ background: color + '1f' }}>{emojiDisciplina(a.disciplina) || '⌚'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <p className="font-bold text-[15px]">{a.disciplina || 'Otro deporte'}</p>
                                {a.deporte && <p className="text-[12px] text-gray-500">{nombreDeporte(a.deporte)}</p>}
                                {a.hora && <p className="text-[12px] text-gray-500 tabular-nums">· {a.hora}</p>}
                              </div>
                              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
                                {[
                                  { k: 'Duración', v: a.minutos != null ? horas(a.minutos) : '—' },
                                  { k: 'Distancia', v: distanciaTexto(a.metros, a.disciplina) },
                                  ...(ritmo ? [{ k: a.disciplina === 'Ciclismo' ? 'Velocidad' : 'Ritmo', v: ritmo }] : []),
                                  { k: 'FC media', v: a.fcMedia != null ? a.fcMedia + ' ppm' : '—' },
                                  { k: 'FC máx', v: a.fcMax != null ? a.fcMax + ' ppm' : '—' },
                                  ...(a.calorias != null ? [{ k: 'Calorías', v: String(a.calorias) }] : []),
                                  ...(a.cargaDelReloj != null ? [{ k: 'Carga del reloj', v: String(a.cargaDelReloj) }] : []),
                                ].map(c => (
                                  <div key={c.k}>
                                    <p className="text-[9.5px] font-bold tracking-[.06em] uppercase text-gray-500">{c.k}</p>
                                    <p className="text-[14px] font-semibold tabular-nums">{c.v}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Lo que había planificado ese día, al lado: solo si el entreno no
                              va ya con una sesión (entonces la nombra su estado, debajo). */}
                          {!['unida', 'sugerida', 'completar', 'varias'].includes(estados.get(a.id)?.k || '') && !!sesiones[fecha]?.length && (
                            <div className="mt-3 pt-3 border-t border-white/[0.06]">
                              <p className="text-[9.5px] font-bold tracking-[.06em] uppercase text-gray-500 mb-1.5">Ese día tenía planificado</p>
                              <div className="flex flex-wrap gap-1.5">
                                {sesiones[fecha].map(s => (
                                  <button key={s.id} onClick={() => router.push('/sesion/' + s.id)}
                                    className="text-[12px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] transition text-left">
                                    {emojiDisciplina(s.disciplina) || '•'} {etiquetaDisciplina(s.disciplina) || 'Sesión'}
                                    {s.zona ? <span className="text-gray-400"> · {s.zona}</span> : null}
                                    {s.minutos ? <span className="text-gray-500"> · {s.minutos} min</span> : null}
                                    {s.estado === 'Realizada' && <span className="text-green-400/90"> · hecha</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {estados.get(a.id) && (
                            <EstadoDelEntreno
                              actividad={a}
                              estado={estados.get(a.id)!}
                              opciones={opcionesDeLaSemana(a, sesionesUnion, uniones)}
                              idDeportista={Number(id)}
                              datos={{ uniones, actividades: actividades || [] }}
                              onCambio={() => setVersion(v => v + 1)}
                              onVerSesion={sid => router.push('/sesion/' + sid)}
                            />
                          )}

                          {(() => {
                            /* Con detalle; o de los que cuentan y recientes, que llegará; si no, nada. */
                            const e = estados.get(a.id)
                            const tiene = conDetalle.has(a.id) ? 'si'
                              : a.disciplina && a.fecha >= sumarDias(hoyISO(), -(DIAS_DETALLE - 1)) && (a.proveedor === 'coros' || a.proveedor === 'polar') ? 'pendiente'
                              : 'no'
                            return (
                              <DetalleEntreno
                                idMedicion={a.id}
                                disciplina={a.disciplina}
                                proveedor={a.proveedor}
                                tiene={tiene}
                                zonas={zonasDep}
                                zonaPrescrita={e?.k === 'unida' && e.union.id_sesion != null ? zonaDeSesion.get(e.union.id_sesion) ?? null : null}
                                onIrAFicha={() => router.push('/deportistas/' + id)}
                              />
                            )
                          })()}

                          <button onClick={() => setAbierta(abierta === a.id ? null : a.id)}
                            className="mt-3 text-[11.5px] text-gray-500 hover:text-gray-300 transition">
                            {abierta === a.id ? '▴ Ocultar lo que mandó el reloj' : '▾ Ver lo que mandó el reloj'}
                          </button>
                          {abierta === a.id && (
                            <pre className="mt-2 text-[11px] text-gray-400 bg-black/40 rounded-lg p-3 overflow-x-auto">
                              {JSON.stringify(crudo[a.id] ?? {}, null, 2)}
                            </pre>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11.5px] text-gray-500 mt-6 leading-relaxed max-w-2xl">
              Cada entreno se une a su sesión cuando el deportista la cierra con su reloj, o cuando lo unes tú
              aquí. Lo que cuenta para la carga sigue siendo la sesión cerrada con su RPE: unir sin RPE no suma.
            </p>
          </>
        )}
        </>)}
      </div>
    </main>
  )
}
