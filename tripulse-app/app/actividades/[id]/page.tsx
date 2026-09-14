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
//   · lo que mandó el reloj en crudo, plegado, porque de marcas que todavía no
//     traducimos (COROS) es la única forma de ver qué contiene de verdad.
//
// Lo que NO hace: casar la actividad con la sesión. Eso es harina de otro
// costal —decidir que ESTA carrera es ESA sesión y volcar sus minutos— y
// hacerlo mal ensucia la carga del atleta. Aquí se ponen las dos al lado y
// decide quien mira.

import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, use } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias, fechaLarga } from '@/lib/fechas'
import { vivas } from '@/lib/papelera'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { useDeclararModulo } from '@/lib/contexto-modulo'
import { nombreReloj, datosListos } from '@/lib/relojes-catalogo'
import {
  actividadesDeMediciones, nombreDeporte, distanciaTexto, ritmoTexto, totales,
  type ActividadReloj,
} from '@/lib/actividades-reloj'

const EMOJI: Record<string, string> = { Natacion: '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️' }
const COLOR: Record<string, string> = { Natacion: '#38bdf8', Ciclismo: '#fbbf24', Carrera: '#f87171', Fuerza: '#a78bfa' }

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

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      const desde = sumarDias(hoyISO(), -rango)
      const [dep, con, med, ses] = await Promise.all([
        supabase.from('deportista').select('nombre').eq('id', id).maybeSingle(),
        supabase.from('reloj_conexion').select('proveedor, ultima_sincronizacion')
          .eq('id_deportista', id).order('conectado_en', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('reloj_medicion').select('id, proveedor, fecha, id_externo, datos, recibido_en')
          .eq('id_deportista', id).eq('tipo', 'entreno')
          .gte('fecha', desde).order('fecha', { ascending: false }).limit(400),
        /* Lo planificado del mismo periodo, para poder poner las dos cosas al
           lado. La papelera no cuenta: comparar contra una sesión borrada sería
           comparar contra algo que el entrenador ya decidió que no existe. */
        vivas(supabase.from('sesion').select('id, fecha_sesion, disciplina, estado, duracion_minutos, duracion_real, zona_resistencia, zona_fuerza')
          .eq('id_deportista', id).gte('fecha_sesion', desde)),
      ])
      if (!vivo) return
      setNombre(dep.data?.nombre ?? null)
      setProveedor(con.data?.proveedor ?? null)
      setUltimaSinc(con.data?.ultima_sincronizacion ?? null)

      const filas = med.data || []
      setActividades(actividadesDeMediciones(filas))
      setCrudo(Object.fromEntries(filas.map(f => [f.id, f.datos])))

      const porDia: Record<string, SesionDelDia[]> = {}
      for (const s of ses.data || []) {
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
  }, [id, rango])

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
          Actividades del reloj
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
              {ultimaSinc ? fechaLarga(String(ultimaSinc).slice(0, 10)) : '—'}
            </p>
          </div>
          {proveedor && !datosListos(proveedor) && (
            <p className="text-[12px] text-yellow-300/90 flex-1 min-w-[240px]">
              Esta marca está conectada pero sus datos todavía no se traducen. Aquí verás en crudo lo que manda,
              que es justo lo que hace falta para escribir la traducción.
            </p>
          )}
        </div>

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
                {k === 'todas' ? 'Todas' : k === 'otras' ? 'Otros deportes' : (EMOJI[k] || '') + ' ' + k}
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
              {!proveedor
                ? 'Este deportista no tiene ningún reloj conectado. Lo conecta él desde su perfil; tú no puedes hacerlo por él.'
                : 'Su ' + nombreReloj(proveedor) + ' está conectado, pero no ha llegado ninguna actividad en este periodo.'
                  + ' Los entrenos llegan cuando él sincroniza, y solo los que subió a la app de su marca después de conectarla.'}
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

            <div className="flex flex-col gap-4">
              {dias.map(([fecha, dellDia]) => (
                <div key={fecha}>
                  <p className="text-[11.5px] font-semibold text-gray-500 mb-1.5">{fechaLarga(fecha)}</p>

                  <div className="flex flex-col gap-2">
                    {dellDia.map(a => {
                      const color = COLOR[a.disciplina || ''] || '#6b7280'
                      const ritmo = ritmoTexto(a)
                      return (
                        <div key={a.id} className="tp-card p-4" style={{ ['--c' as string]: color } as React.CSSProperties}>
                          <div className="flex items-start gap-3">
                            <span className="w-9 h-9 rounded-xl grid place-items-center text-lg flex-shrink-0"
                              style={{ background: color + '1f' }}>{EMOJI[a.disciplina || ''] || '⌚'}</span>
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

                          {/* Lo que había planificado ese día, al lado y sin mezclar. */}
                          {!!sesiones[fecha]?.length && (
                            <div className="mt-3 pt-3 border-t border-white/[0.06]">
                              <p className="text-[9.5px] font-bold tracking-[.06em] uppercase text-gray-500 mb-1.5">Ese día tenía planificado</p>
                              <div className="flex flex-wrap gap-1.5">
                                {sesiones[fecha].map(s => (
                                  <button key={s.id} onClick={() => router.push('/sesion/' + s.id)}
                                    className="text-[12px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] transition text-left">
                                    {EMOJI[s.disciplina || ''] || '•'} {s.disciplina || 'Sesión'}
                                    {s.zona ? <span className="text-gray-400"> · {s.zona}</span> : null}
                                    {s.minutos ? <span className="text-gray-500"> · {s.minutos} min</span> : null}
                                    {s.estado === 'Realizada' && <span className="text-green-400/90"> · hecha</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

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
              Estas actividades no están unidas a las sesiones del plan: se enseñan al lado para que puedas
              compararlas tú. Lo que cuenta para la carga sigue siendo lo que el deportista marca como hecho.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
