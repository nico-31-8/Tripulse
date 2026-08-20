'use client'
// ============================================================
// Mi plan — la pantalla del DEPORTISTA
// ============================================================
// El resto del planificador está escrito para un entrenador que decide. Esta no:
// aquí el atleta dice a qué se presenta y cuándo, y el plan sale solo. Por eso
// no hay desplegable de fase, ni de modelo de periodización, ni de nivel — todo
// eso o se deduce de su anamnesis o lo pone la plantilla de B1-02.
//
// Y por eso enseña LO QUE VA A PASAR antes de crear nada: un plan de seis meses
// que aparece sin explicación no se entiende, y lo que no se entiende no se
// sigue.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { planDeTemporada, type Temporada } from '@/lib/plan-macrociclo'
import { crearTemporada, planesExistentes } from '@/lib/plan-macrociclo-volcado'
import { semanasHasta } from '@/lib/plan-mesociclo'
import { PRUEBAS, pruebaPorId } from '@/lib/pruebas'
import { distanciaDePrueba, ETIQUETA_DISTANCIA, DISTRIBUCION_POR_FASE, type DistanciaTri } from '@/lib/distribucion-zonas'
import { PRIORIDADES } from '@/lib/competicion-prioridad'
import MisSemanas from '@/components/MisSemanas'
import ChatEntrenador from '@/components/ChatEntrenador'
import { estadoDelPlan, puedeRehacer, borrarPlan, type EstadoPlan } from '@/lib/plan-rehacer'
import type { DiaDisponible } from '@/lib/plan-colocacion'
import type { NivelAtleta } from '@/lib/plan-semana'

/** El nivel que declara la anamnesis, traducido al del planificador. */
function nivelDeAnamnesis(txt: string | null | undefined): NivelAtleta {
  const t = String(txt ?? '').toLowerCase()
  if (t.includes('elite') || t.includes('élite') || t.includes('profesional')) return 'elite'
  if (t.includes('avanzad')) return 'avanzado'
  if (t.includes('inicia') || t.includes('principi') || t.includes('popular')) return 'principiante'
  return 'intermedio'
}

/** El lunes que viene: los microciclos empiezan en lunes en toda la app. */
function proximoLunes(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

// Solo las pruebas para las que B1-02 da plantilla de cuenta atrás. Ofrecer las
// demás sería prometer un plan que no se sabe dibujar.
const PRUEBAS_CON_PLAN = PRUEBAS.filter(p => !!distanciaDePrueba(p.id))

export default function MiPlan() {
  const router = useRouter()
  const [dep, setDep] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [yaTiene, setYaTiene] = useState(0)
  const [anamnesis, setAnamnesis] = useState<any>(null)
  const [disponibilidad, setDisponibilidad] = useState<DiaDisponible[]>([])
  // Con plan hecho se entra directo a «qué me toca»; el formulario solo aparece
  // si lo pide. Quien ya tiene plan no vuelve aquí a crearse otro.
  const [verFormulario, setVerFormulario] = useState(false)
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null)
  const [rehaciendo, setRehaciendo] = useState(false)
  const [confirmaRehacer, setConfirmaRehacer] = useState(false)

  const [pruebaId, setPruebaId] = useState('tri-olimpico')
  const [fecha, setFecha] = useState('')
  const [desde, setDesde] = useState(proximoLunes())
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState<{ mesos: number; micros: number } | null>(null)

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data: d } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
      setDep(d)
      if (d) {
        setYaTiene(await planesExistentes(supabase, d.id))
        setEstadoPlan(await estadoDelPlan(supabase, d.id))
        const [{ data: an }, { data: disp }] = await Promise.all([
          supabase.from('anamnesis').select('*').eq('id_deportista', d.id).maybeSingle(),
          supabase.from('disponibilidad').select('dia_semana, hora_inicio, hora_fin').eq('id_deportista', d.id),
        ])
        setAnamnesis(an)
        // Minutos reales de cada día a partir de sus franjas horarias.
        const porDia = new Map<string, number>()
        ;(disp || []).forEach((f: any) => {
          const min = (h: string) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0) }
          porDia.set(f.dia_semana, (porDia.get(f.dia_semana) || 0) + Math.max(0, min(f.hora_fin) - min(f.hora_inicio)))
        })
        setDisponibilidad([...porDia].map(([dia, minutos]) => ({ dia: dia as any, minutos })))
      }
      setCargando(false)
    }
    cargar()
  }, [router])

  const distancia: DistanciaTri = distanciaDePrueba(pruebaId) || 'olimpico'
  const prueba = pruebaPorId(pruebaId)

  const temporada: Temporada | null = fecha ? planDeTemporada({ desde, objetivo: fecha, distancia }) : null
  const semanas = fecha ? semanasHasta(desde, fecha) + 1 : 0

  const crear = async () => {
    if (!dep || !temporada) return
    setCreando(true); setError('')
    const r = await crearTemporada(supabase, {
      idDeportista: dep.id, temporada, distancia,
      nombre: (prueba?.nombre || 'Objetivo') + ' · ' + fecha,
    })
    if (r.error) { setError(r.error); setCreando(false); return }

    // La competición A, que es el ancla de todo el plan. Si falla por falta de
    // la columna de prioridad, el plan ya está creado: se avisa y no se pierde.
    const { error: eComp } = await supabase.from('competicion').insert({
      id_deportista: dep.id,
      nombre: prueba?.nombre || 'Competición',
      fecha,
      tipo: prueba?.nombre || null,
      prioridad: 'A',
    })
    if (eComp) setError('El plan está creado, pero no se pudo guardar la competición: ' + eComp.message)

    setHecho({ mesos: r.mesos, micros: r.micros })
    setYaTiene(n => n + 1)
    setCreando(false)
  }

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>

  if (!dep) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <p className="text-gray-400 text-sm">Tu cuenta todavía no tiene ficha de deportista.</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <p className="text-orange-400/90 text-sm font-medium">Mi plan</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1">
          {yaTiene > 0 && !verFormulario && !hecho ? '¿Qué me toca ahora?' : '¿A qué te presentas?'}
        </h1>
        <p className="text-gray-500 text-sm mt-2 max-w-xl">
          {yaTiene > 0 && !verFormulario && !hecho
            ? 'Elige el bloque y te preparo sus semanas. Verás lo que sale antes de que se guarde nada.'
            : 'Dime la prueba y el día. Reparto las semanas que quedan en fases, de atrás hacia adelante desde la carrera, y te digo qué toca en cada una antes de crear nada.'}
        </p>

        {yaTiene > 0 && !hecho && !verFormulario ? (
          <div className="mt-8 flex flex-col gap-6">
            <MisSemanas
              idDeportista={dep.id}
              distancia={distancia}
              nivel={nivelDeAnamnesis(anamnesis?.nivel_competitivo)}
              dias={Number(anamnesis?.dias_semana) || 5}
              disponibilidad={disponibilidad}
              horasReferencia={Number(anamnesis?.volumen_semanal) || 8}
              disciplinaDebil={anamnesis?.disciplina_debil || null} />

            {!anamnesis && (
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
                <span className="text-sm leading-none mt-0.5">⚠️</span>
                <p className="text-[12.5px] text-amber-200/90">
                  No tienes la anamnesis rellena, así que voy con 8 horas en 5 días.
                  <button onClick={() => router.push('/anamnesis')} className="underline ml-1 hover:text-white">Rellénala</button> y las
                  semanas saldrán con tus horas de verdad.
                </p>
              </div>
            )}

            <div className="border-t border-gray-800 pt-6">
              <h2 className="text-lg font-bold tracking-tight">Habla con tu entrenador</h2>
              <p className="text-gray-500 text-[12.5px] mt-1 mb-4">
                Sabe qué te toca, cómo vas y cuánto queda para tu carrera.
              </p>
              <ChatEntrenador />
            </div>

            <div className="border-t border-gray-800 pt-5 flex flex-col gap-3">
              <button onClick={() => setVerFormulario(true)}
                className="text-gray-500 hover:text-white text-[12.5px] transition self-start">
                Preparar otra competición →
              </button>

              {/* Rehacer el plan. El veredicto se calcula con lo que hay: sin
                  semanas generadas es un borrador y sale gratis; con ellas, una
                  cada siete días. Lo entrenado nunca se borra. */}
              {(() => {
                if (!estadoPlan) return null
                const v = puedeRehacer(estadoPlan, new Date().toISOString().slice(0, 10))
                if (!v.puede) {
                  return (
                    <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
                      <p className="text-[12.5px] text-gray-300">{v.motivo}</p>
                      <p className="text-[11.5px] text-gray-500 mt-1">{v.consecuencia}</p>
                    </div>
                  )
                }
                if (!confirmaRehacer) {
                  return (
                    <button onClick={() => setConfirmaRehacer(true)}
                      className="text-gray-600 hover:text-red-400 text-[12.5px] transition self-start">
                      No me convence este plan, quiero rehacerlo
                    </button>
                  )
                }
                return (
                  <div className="rounded-xl bg-gray-900 border border-red-900/50 px-4 py-3 flex flex-col gap-2.5">
                    <p className="text-[13px] text-gray-200">{v.motivo}</p>
                    {v.consecuencia && <p className="text-[12px] text-amber-200/90">{v.consecuencia}</p>}
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        if (!estadoPlan.idMacrociclo) return
                        setRehaciendo(true)
                        const r = await borrarPlan(supabase, dep.id, estadoPlan.idMacrociclo)
                        setRehaciendo(false)
                        if (r.error) { setError(r.error); return }
                        setYaTiene(0); setEstadoPlan(null); setConfirmaRehacer(false); setVerFormulario(true)
                      }} disabled={rehaciendo}
                        className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-[12.5px] font-semibold px-3.5 py-2 rounded-lg transition">
                        {rehaciendo ? 'Borrando…' : 'Sí, empezar de cero'}
                      </button>
                      <button onClick={() => setConfirmaRehacer(false)}
                        className="text-gray-400 hover:text-white text-[12.5px] px-2 transition">Déjalo</button>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        ) : hecho ? (
          <div className="mt-8 rounded-2xl border border-green-600/40 bg-green-500/[0.07] p-6">
            <h2 className="text-xl font-bold text-green-300">Tu plan está creado</h2>
            <p className="text-gray-300 text-sm mt-2">
              {hecho.mesos} bloques y {hecho.micros} semanas, hasta el {fecha}.
            </p>
            {error && <p className="text-amber-300 text-[13px] mt-3">{error}</p>}
            <div className="flex flex-wrap gap-3 mt-5">
              <button onClick={() => router.push('/dashboard-deportista')}
                className="bg-orange-500 hover:bg-orange-600 px-5 py-2.5 rounded-lg text-sm font-semibold transition">
                Ver mi panel
              </button>
              <button onClick={() => router.push('/mis-sesiones')}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-5 py-2.5 rounded-lg text-sm transition">
                Mis sesiones
              </button>
            </div>
            <p className="text-gray-500 text-[12.5px] mt-4">
              Todavía no hay sesiones dentro: el plan es el esqueleto. Las semanas se generan bloque a bloque.
            </p>
          </div>
        ) : (
          <>
            {yaTiene > 0 && (
              <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
                <span className="text-sm leading-none mt-0.5">⚠️</span>
                <p className="text-[12.5px] text-amber-200/90">
                  Ya tienes {yaTiene} {yaTiene === 1 ? 'plan' : 'planes'}. Crear otro no borra el anterior:
                  se quedan los dos y el calendario pintará semanas de ambos.
                </p>
              </div>
            )}

            <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">La prueba</span>
                <select value={pruebaId} onChange={e => setPruebaId(e.target.value)}
                  className="bg-gray-800 text-white text-sm px-3.5 py-2.5 rounded-lg border border-gray-700 outline-none focus:ring-2 focus:ring-orange-500">
                  {PRUEBAS_CON_PLAN.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">El día</span>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className="bg-gray-800 text-white text-sm px-3.5 py-2.5 rounded-lg border border-gray-700 outline-none focus:ring-2 focus:ring-orange-500" />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Empiezo el</span>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="bg-gray-800 text-white text-sm px-3.5 py-2.5 rounded-lg border border-gray-700 outline-none focus:ring-2 focus:ring-orange-500" />
                <span className="text-[11px] text-gray-600">Las semanas empiezan en lunes.</span>
              </label>
            </div>

            {temporada && (
              <div className="mt-8">
                {temporada.imposible ? (
                  <div className="rounded-2xl border border-red-600/40 bg-red-500/[0.07] p-5">
                    <p className="text-red-300 text-sm font-semibold">Así no se puede preparar</p>
                    {temporada.avisos.map((a, i) => (
                      <p key={i} className="text-gray-300 text-[13px] mt-2">{a}</p>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-4">
                      <p className="text-[13.5px] text-gray-300">
                        <b className="text-orange-400 text-lg">{semanas}</b> semanas hasta la carrera
                      </p>
                      <p className="text-[13px] text-gray-500">
                        {temporada.bloques.length} bloques · {ETIQUETA_DISTANCIA[distancia]}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {temporada.bloques.map((b, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
                          <span className="text-[11px] font-bold text-gray-600 w-6 tabular-nums">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-gray-100">{b.nombre}</p>
                            <p className="text-[12px] text-gray-500">
                              {DISTRIBUCION_POR_FASE[b.fase].etiqueta} · desde el {b.lunes}
                            </p>
                          </div>
                          <span className="text-[12.5px] text-gray-400 tabular-nums flex-shrink-0">
                            {b.semanas} {b.semanas === 1 ? 'semana' : 'semanas'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {temporada.avisos.map((a, i) => (
                      <div key={i} className="mt-3 flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
                        <span className="text-sm leading-none mt-0.5">⚠️</span>
                        <p className="text-[12.5px] text-amber-200/90">{a}</p>
                      </div>
                    ))}

                    {error && <p className="text-red-400 text-[13px] mt-3">{error}</p>}

                    <button onClick={crear} disabled={creando}
                      className="mt-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-6 py-3 rounded-xl text-sm font-semibold transition">
                      {creando ? 'Creando tu plan…' : 'Crear mi plan'}
                    </button>
                    <p className="text-[11.5px] text-gray-600 mt-2">
                      Se crea el esqueleto de la temporada y se marca la carrera como objetivo principal
                      ({PRIORIDADES[0].simbolo} {PRIORIDADES[0].etiqueta}).
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
