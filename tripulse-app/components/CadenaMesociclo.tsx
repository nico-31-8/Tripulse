'use client'
// ============================================================
// Encadenar las semanas de un mesociclo
// ============================================================
// El planificador generaba UNA semana con la fase elegida a mano. Esto genera el
// BLOQUE entero: cada semana con su carga, la descarga donde toca, y todas de
// una vez al calendario.
//
// No decide la periodización: la LEE. Los mesociclos, sus fechas y su duración
// salen del plan que el entrenador ya dibujó, y si además dibujó la UA semana a
// semana, esa forma manda sobre el patrón del libro (ver lib/plan-mesociclo).
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  semanasDelMesociclo, semanasHasta, pisaElTapering,
  type SemanaDelMeso,
} from '@/lib/plan-mesociclo'
import { type NivelAtleta } from '@/lib/plan-semana'
import { type DiaDisponible } from '@/lib/plan-colocacion'
import { nivelDePlantilla } from '@/lib/plan-relleno'
import { semanaDelBloque, textoCompeticion, type SemanaDelBloque, type CompeticionDelPlan } from '@/lib/plan-bloque'
import { volcarSemana, loQueYaHay } from '@/lib/plan-volcado'
import { aplicarBloques } from '@/lib/plantillas'
import { sumarDias } from '@/lib/desplazar'
import type { DistanciaTri } from '@/lib/distribucion-zonas'

interface MesoFila {
  id: number
  objetivo: string | null
  tipo: string | null
  fecha_inicio: string
  duracion_semanas: number | null
}

interface Props {
  dep: any
  distancia: DistanciaTri
  nivel: NivelAtleta
  dias: number
  disponibilidad: DiaDisponible[]
  /** Horas de una semana PLENA: las de la anamnesis. La carga relativa escala. */
  horasReferencia: number
  disciplinaDebil?: string | null
}

interface SemanaGenerada extends SemanaDelMeso {
  plan: SemanaDelBloque
  yaHay: number | null
  /** `cortas`: las que no caben en sus minutos sin salirse de lo documentado, con el porqué. */
  volcada?: { creadas: number; error: string | null; yaHabia: number; cortas?: string[] }
}

export default function CadenaMesociclo({
  dep, distancia, nivel, dias, disponibilidad, horasReferencia, disciplinaDebil,
}: Props) {
  const [mesos, setMesos] = useState<MesoFila[]>([])
  const [uaPorMeso, setUaPorMeso] = useState<Record<number, (number | null)[]>>({})
  const [competiciones, setCompeticiones] = useState<(CompeticionDelPlan & { nombre: string })[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [generadas, setGeneradas] = useState<SemanaGenerada[] | null>(null)
  const [generando, setGenerando] = useState(false)
  const [volcando, setVolcando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      setCargando(true)
      /* El macrociclo estaba solo para acotar los mesociclos, y
         `mesociclo.id_deportista` ya lo hace. Los mesociclos y las
         competiciones tampoco dependen unos de otros. */
      /* Y los microciclos también a la vez: llevan su deportista, así que no
         hace falta esperar a los mesociclos para pedirlos. */
      // La UA que el entrenador dibujó, semana a semana. Es lo que hace que la
      // forma del bloque sea la suya y no la del libro. Se busca por FECHA y no
      // por posición: un microciclo que falte dejaría el resto desplazado.
      const [ms, comps, { data: micros }] = await Promise.all([
        supabase.from('mesociclo')
          .select('id, objetivo, tipo, fecha_inicio, duracion_semanas')
          .eq('id_deportista', dep.id).order('fecha_inicio'),
        // Con `*`: la prioridad decide si la víspera se entrena, y es una
        // columna que puede no estar (nombrarla tumbaría la consulta entera).
        supabase.from('competicion')
          .select('*').eq('id_deportista', Number(dep.id)).order('fecha'),
        supabase.from('microciclo').select('id_mesociclo, fecha_inicio, ua_planificada').eq('id_deportista', dep.id),
      ])
      const lista: MesoFila[] = (ms.data || []).map((m: any) => ({ ...m, fecha_inicio: String(m.fecha_inicio).slice(0, 10) }))

      const ua: Record<number, (number | null)[]> = {}
      lista.forEach(m => {
        const suyos = (micros || []).filter((mi: any) => mi.id_mesociclo === m.id)
        ua[m.id] = Array.from({ length: m.duracion_semanas || 1 }, (_, i) => {
          const objetivo = sumarDias(m.fecha_inicio, i * 7)
          const mi = suyos.find((x: any) => String(x.fecha_inicio).slice(0, 10) === objetivo)
          return mi?.ua_planificada ?? null
        })
      })

      if (!vivo) return
      setMesos(lista)
      setUaPorMeso(ua)
      setCompeticiones((comps.data || []).map((c: any) => ({ nombre: c.nombre, fecha: String(c.fecha).slice(0, 10), prioridad: c.prioridad ?? null })))
      setSelId(lista[0]?.id ?? null)
      setCargando(false)
    }
    cargar()
    return () => { vivo = false }
  }, [dep.id])

  const meso = mesos.find(m => m.id === selId) || null

  const semanas = useMemo(() => meso ? semanasDelMesociclo({
    tipo: meso.tipo,
    semanas: meso.duracion_semanas || 4,
    horasReferencia,
    distancia,
    lunes: meso.fecha_inicio,
    uaPorSemana: uaPorMeso[meso.id],
  }) : [], [meso, horasReferencia, distancia, uaPorMeso])

  const conUA = !!(meso && (uaPorMeso[meso.id] || []).filter(u => typeof u === 'number' && u > 0).length >= 2)

  // El aviso que más caro sale: meter carga dentro del tapering de una carrera.
  const avisoTaper = useMemo(() => {
    const fin = semanas[semanas.length - 1]?.lunes
    if (!fin) return null
    const c = competiciones.find(x => pisaElTapering(fin, x.fecha, distancia))
    return c
      ? 'Este bloque acaba dentro del tapering de «' + c.nombre + '» (' + c.fecha + '). Llegarías a la carrera con fatiga que ya no da tiempo a soltar.'
      : null
  }, [semanas, competiciones, distancia])

  const proxima = useMemo(() => {
    if (!meso) return null
    const c = competiciones.find(x => semanasHasta(meso.fecha_inicio, x.fecha) >= 0)
    return c ? { nombre: c.nombre, semanas: semanasHasta(meso.fecha_inicio, c.fecha) } : null
  }, [meso, competiciones])

  const generar = async () => {
    if (!meso) return
    setGenerando(true)
    // Las disciplinas de su ficha y sus competiciones: sin ellas, el motor
    // planificaba un triatlón y no sabía qué días corría.
    const base = { diasSemana: dias, distancia, nivel, disciplinaDebil, disciplinas: dep.disciplinas ?? null }
    /* Las semanas a la vez: lo que ya hay en cada una se pregunta en paralelo
       (era una espera por semana, una detrás de otra). */
    const out: SemanaGenerada[] = await Promise.all(semanas.map(async s => {
      const plan = semanaDelBloque(s, base, { disponibilidad, competiciones })
      // Qué hay ya esa semana. Una semana con sesiones no se toca al volcar, y
      // eso hay que saberlo antes.
      const yaHay = s.lunes ? await loQueYaHay(supabase, dep.id, s.lunes).catch(() => null) : null
      return { ...s, plan, yaHay }
    }))
    setGeneradas(out)
    setConfirmando(false)
    setGenerando(false)
  }

  const volcar = async () => {
    if (!generadas) return
    setVolcando(true); setConfirmando(false)
    const nivelP = nivelDePlantilla(nivel)
    const out = [...generadas]
    // Actualizando la tabla según van cayendo: si algo falla, se ve exactamente
    // en qué semana en vez de un error suelto. Y TODAS A LA VEZ: iban semana a
    // semana, y cada una son varias esperas; cada semana es independiente de
    // las demás y cada fila se pinta cuando termina la suya.
    await Promise.all(out.map(async (s, i) => {
      if (!s.lunes) return
      const r = await volcarSemana(supabase, {
        idDeportista: dep.id,
        lunes: s.lunes,
        relleno: s.plan.relleno,
        aplicarBloques,
        nivel: nivelP,
      })
      out[i] = { ...s, volcada: {
        creadas: r.creadas, error: r.yaHabia && !r.creadas ? null : r.error, yaHabia: r.yaHabia,
        cortas: r.parte.filter(p => p.ok && p.aviso).map(p => p.dia + ' · ' + p.nombre + ': ' + p.aviso),
      } }
      setGeneradas([...out])
    }))
    setVolcando(false)
  }

  if (cargando) return <p className="text-gray-500 text-sm">Buscando el plan de {dep.nombre}…</p>

  if (!mesos.length) return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <p className="text-[13.5px] text-gray-300">{dep.nombre} todavía no tiene mesociclos dibujados.</p>
      <p className="text-[12px] text-gray-500 mt-1">
        Esta pantalla no inventa la periodización: la lee del plan. Dibújala en Planificación → Periodización y vuelve.
      </p>
    </div>
  )

  const hecho = !!generadas?.length && generadas.every(s => s.volcada)
  const totalCreadas = (generadas || []).reduce((a, s) => a + (s.volcada?.creadas || 0), 0)
  const yaHayTotal = (generadas || []).reduce((a, s) => a + (s.yaHay || 0), 0)
  const semanasConAlgo = (generadas || []).filter(s => (s.yaHay || 0) > 0).length
  const totalSesiones = (generadas || []).reduce((a, s) => a + s.plan.relleno.length, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Mesociclo</span>
          <select value={selId ?? ''} onChange={e => { setSelId(Number(e.target.value)); setGeneradas(null) }}
            className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none focus:ring-2 focus:ring-orange-500 min-w-[280px]">
            {mesos.map(m => (
              <option key={m.id} value={m.id}>
                {(m.objetivo || 'Sin nombre') + ' · ' + (m.tipo || '—') + ' · ' + (m.duracion_semanas || 4) + ' sem · ' + m.fecha_inicio}
              </option>
            ))}
          </select>
        </label>
        {proxima && (
          <p className="text-[12.5px] text-gray-400 pb-2">
            🏆 {proxima.nombre}: quedan <b className="text-orange-400">{proxima.semanas} semanas</b> desde el inicio del bloque.
          </p>
        )}
      </div>

      <p className="text-[12px] text-gray-500">
        {conUA
          ? 'La forma del bloque sale de la UA que dibujaste en el lienzo, no del patrón.'
          : 'Este bloque no tiene UA dibujada, así que la forma sale del patrón de B1-03. Rellena la UA de sus semanas en el lienzo si prefieres la tuya.'}
      </p>

      {avisoTaper && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5">
          <span className="text-sm leading-none mt-0.5">⚠️</span>
          <p className="text-[12.5px] text-amber-200/90">{avisoTaper}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-800">
              <th className="text-left py-2 px-2 w-10">#</th>
              <th className="text-left py-2 px-2">Lunes</th>
              <th className="text-left py-2 px-2">Carga</th>
              <th className="text-left py-2 px-2">Horas</th>
              <th className="text-left py-2 px-2">Qué es</th>
              <th className="text-left py-2 px-2">Sesiones</th>
              <th className="text-left py-2 px-2">En el calendario</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s, i) => {
              const g = generadas?.[i]
              return (
                <tr key={s.n} className={'border-b border-gray-800/70 ' + (s.esDescarga ? 'bg-green-500/[0.05]' : '')}>
                  <td className="py-2 px-2 text-orange-400 font-bold">{s.n}</td>
                  <td className="py-2 px-2 text-gray-300 tabular-nums">{s.lunes || '—'}</td>
                  <td className="py-2 px-2 text-gray-300 tabular-nums">{Math.round(s.cargaRelativa * 100)} %</td>
                  {/* La semana de una carrera pierde las horas de los días que se libran. */}
                  <td className="py-2 px-2 text-gray-100 font-semibold tabular-nums"
                    title={g?.plan.competicion ? textoCompeticion(g.plan.competicion) : undefined}>
                    {g?.plan.competicion ? g.plan.competicion.horas : s.horasSemana} h
                  </td>
                  <td className="py-2 px-2">
                    <span className={'text-[11.5px] px-2 py-0.5 rounded-md ' + (s.esDescarga
                      ? 'bg-green-500/15 text-green-300' : 'bg-gray-800 text-gray-400')}>{s.etiqueta}</span>
                  </td>
                  <td className="py-2 px-2 text-gray-400 tabular-nums">{g ? g.plan.relleno.length : '—'}</td>
                  <td className="py-2 px-2 text-[12px]">
                    {g?.volcada
                      ? (g.volcada.error
                        ? <span className="text-red-400">{g.volcada.error}</span>
                        : g.volcada.yaHabia && !g.volcada.creadas
                          ? <span className="text-amber-300">ya tenía {g.volcada.yaHabia}: no se ha tocado</span>
                          : <span className="text-green-400">✓ {g.volcada.creadas} creadas
                            {/* Las que no llegan a sus minutos (o se pasan) sin
                                salirse de lo documentado: el detalle, al pasar por encima. */}
                            {!!g.volcada.cortas?.length && (
                              <span className="text-amber-300" title={g.volcada.cortas.join('\n')}>
                                {' · '}{g.volcada.cortas.length} no caben en sus minutos
                              </span>
                            )}
                          </span>)
                      : g?.yaHay
                        ? <span className="text-amber-300">ya hay {g.yaHay}: no se toca</span>
                        : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {generadas && !hecho && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-3.5 py-3">
          <p className="text-[13px] text-gray-200">{totalSesiones} sesiones en {generadas.length} semanas.</p>
          {semanasConAlgo > 0 && (
            <p className="text-[12.5px] text-amber-200/90 mt-1">
              {semanasConAlgo} de esas semanas ya tienen sesiones ({yaHayTotal} en total): esas no se tocan, solo se llenan las vacías.
            </p>
          )}
          {generadas.map((g, i) => g.plan.competicion && (
            <p key={i} className="text-[12px] text-gray-400 mt-1">🏁 S{g.n} ({g.lunes}): {textoCompeticion(g.plan.competicion)}</p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={generar} disabled={!meso || generando || volcando}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
          {generando ? 'Generando…' : generadas ? 'Volver a generar' : 'Generar las ' + semanas.length + ' semanas'}
        </button>

        {generadas && !hecho && (confirmando ? (
          <>
            <button onClick={volcar} disabled={volcando}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
              {volcando ? 'Volcando…' : 'Sí, volcar al calendario'}
            </button>
            <button onClick={() => setConfirmando(false)} className="text-gray-400 hover:text-white text-sm px-2 transition">Cancelar</button>
          </>
        ) : (
          <button onClick={() => setConfirmando(true)} disabled={volcando}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
            Volcar al calendario →
          </button>
        ))}

        {hecho && (
          <p className="text-green-400 text-sm">✓ {totalCreadas} sesiones creadas en el calendario de {dep.nombre}.</p>
        )}
      </div>
    </div>
  )
}
