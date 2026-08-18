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
  semanasDelMesociclo, entradaDeSemana, semanasHasta, pisaElTapering,
  type SemanaDelMeso,
} from '@/lib/plan-mesociclo'
import { formaDeSemana, type EntradaSemana, type NivelAtleta } from '@/lib/plan-semana'
import { colocarSemana, type DiaDisponible } from '@/lib/plan-colocacion'
import { rellenarSemana, nivelDePlantilla, type SemanaRellena } from '@/lib/plan-relleno'
import { volcarSemana, loQueYaHay } from '@/lib/plan-volcado'
import { aplicarBloques, bloquesPorClave } from '@/lib/plantillas'
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
  plan: SemanaRellena
  yaHay: number | null
  volcada?: { creadas: number; error: string | null }
}

export default function CadenaMesociclo({
  dep, distancia, nivel, dias, disponibilidad, horasReferencia, disciplinaDebil,
}: Props) {
  const [mesos, setMesos] = useState<MesoFila[]>([])
  const [uaPorMeso, setUaPorMeso] = useState<Record<number, (number | null)[]>>({})
  const [competiciones, setCompeticiones] = useState<{ nombre: string; fecha: string }[]>([])
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
      const { data: macs } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
      const ids = (macs || []).map((m: any) => m.id)
      if (!ids.length) { if (vivo) { setMesos([]); setCargando(false) } return }

      const { data: ms } = await supabase.from('mesociclo')
        .select('id, objetivo, tipo, fecha_inicio, duracion_semanas')
        .in('id_macrociclo', ids).order('fecha_inicio')
      const lista: MesoFila[] = (ms || []).map((m: any) => ({ ...m, fecha_inicio: String(m.fecha_inicio).slice(0, 10) }))

      // La UA que el entrenador dibujó, semana a semana. Es lo que hace que la
      // forma del bloque sea la suya y no la del libro. Se busca por FECHA y no
      // por posición: un microciclo que falte dejaría el resto desplazado.
      const { data: micros } = lista.length
        ? await supabase.from('microciclo').select('id_mesociclo, fecha_inicio, ua_planificada').in('id_mesociclo', lista.map(m => m.id))
        : { data: [] as any[] }

      const ua: Record<number, (number | null)[]> = {}
      lista.forEach(m => {
        const suyos = (micros || []).filter((mi: any) => mi.id_mesociclo === m.id)
        ua[m.id] = Array.from({ length: m.duracion_semanas || 1 }, (_, i) => {
          const objetivo = sumarDias(m.fecha_inicio, i * 7)
          const mi = suyos.find((x: any) => String(x.fecha_inicio).slice(0, 10) === objetivo)
          return mi?.ua_planificada ?? null
        })
      })

      const { data: comps } = await supabase.from('competicion')
        .select('nombre, fecha').eq('id_deportista', Number(dep.id)).order('fecha')

      if (!vivo) return
      setMesos(lista)
      setUaPorMeso(ua)
      setCompeticiones((comps || []).map((c: any) => ({ nombre: c.nombre, fecha: String(c.fecha).slice(0, 10) })))
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
    const base = { diasSemana: dias, distancia, nivel, disciplinaDebil }
    const out: SemanaGenerada[] = []
    for (const s of semanas) {
      const e: EntradaSemana = entradaDeSemana(s, base)
      const forma = formaDeSemana(e)
      const plan = rellenarSemana({
        forma,
        colocada: colocarSemana(forma, disponibilidad.length ? disponibilidad : dias),
        nivel,
        fase: s.fase,
      })
      // Qué hay ya esa semana. Volcar SUMA, y eso hay que saberlo antes.
      const yaHay = s.lunes ? await loQueYaHay(supabase, dep.id, s.lunes).catch(() => null) : null
      out.push({ ...s, plan, yaHay })
    }
    setGeneradas(out)
    setConfirmando(false)
    setGenerando(false)
  }

  const volcar = async () => {
    if (!generadas) return
    setVolcando(true); setConfirmando(false)
    const nivelP = nivelDePlantilla(nivel)
    const out = [...generadas]
    // Semana a semana, actualizando la tabla según van cayendo: si algo falla a
    // la mitad, se ve exactamente dónde se quedó en vez de un error suelto.
    for (let i = 0; i < out.length; i++) {
      const s = out[i]
      if (!s.lunes) continue
      const r = await volcarSemana(supabase, {
        idDeportista: dep.id,
        lunes: s.lunes,
        relleno: s.plan.relleno,
        aplicarBloques,
        bloquesDe: clave => bloquesPorClave(clave, nivelP) || [],
      })
      out[i] = { ...s, volcada: { creadas: r.creadas, error: r.error } }
      setGeneradas([...out])
    }
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
                  <td className="py-2 px-2 text-gray-100 font-semibold tabular-nums">{s.horasSemana} h</td>
                  <td className="py-2 px-2">
                    <span className={'text-[11.5px] px-2 py-0.5 rounded-md ' + (s.esDescarga
                      ? 'bg-green-500/15 text-green-300' : 'bg-gray-800 text-gray-400')}>{s.etiqueta}</span>
                  </td>
                  <td className="py-2 px-2 text-gray-400 tabular-nums">{g ? g.plan.relleno.length : '—'}</td>
                  <td className="py-2 px-2 text-[12px]">
                    {g?.volcada
                      ? (g.volcada.error
                        ? <span className="text-red-400">{g.volcada.error}</span>
                        : <span className="text-green-400">✓ {g.volcada.creadas} creadas</span>)
                      : g?.yaHay
                        ? <span className="text-amber-300">ya hay {g.yaHay}</span>
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
          {yaHayTotal > 0 && (
            <p className="text-[12.5px] text-amber-200/90 mt-1">
              Ojo: esas semanas ya tienen {yaHayTotal} sesiones. Volcar SUMA, no reemplaza — te quedarían las dos.
            </p>
          )}
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
