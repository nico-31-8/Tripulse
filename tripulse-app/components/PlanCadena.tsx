'use client'
// ============================================================
// Todo el plan de un tirón, ajustado a cómo llega el atleta
// ============================================================
// La vista de un bloque enseña cuatro semanas. Esta enseña la temporada: los
// mesociclos encadenados, cuántas semanas quedan hasta la carrera, y qué semanas
// hay que recortar porque el atleta no llega como decía el plan.
//
// EL AJUSTE SE APLICA DONDE HAY DATOS. Las métricas de hoy valen para la semana
// que viene, no para la de dentro de dos meses: en esa no ha pasado nada todavía.
// Así que la cadena se ajusta con el estado real en la PRIMERA semana futura y
// desde ahí se arrastra. Pintar toda la temporada como «ajustada» daría una
// precisión que no existe.
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'
import { cadenaDeMesos, ajustarCadena, type EstadoReal, type MesoDeCadena } from '@/lib/plan-cadena'
import { calcularCargas, calcularACWR, estadoTSB, estadoACWR } from '@/lib/panel-metricas'
import { cargaReal, estimarDuraciones } from '@/lib/duracion-carga'
import { sumarDias, diasEntre } from '@/lib/desplazar'
import type { DistanciaTri } from '@/lib/distribucion-zonas'

interface Props {
  dep: any
  mesos: MesoDeCadena[]
  horasReferencia: number
  distancia: DistanciaTri
  competicion?: string | null
}

/** El lunes de la semana de una fecha. */
function lunesDe(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const dow = d.getUTCDay() || 7
  return sumarDias(iso, 1 - dow)
}

export default function PlanCadena({ dep, mesos, horasReferencia, distancia, competicion }: Props) {
  const [estado, setEstado] = useState<EstadoReal | null>(null)
  const [lunesAjuste, setLunesAjuste] = useState<string | null>(null)
  const [cargandoEstado, setCargandoEstado] = useState(true)

  const cadena = cadenaDeMesos(mesos, { horasReferencia, distancia, competicion })

  useEffect(() => {
    const cargar = async () => {
      setCargandoEstado(true)
      const hoy = hoyISO()
      const lunesEsta = lunesDe(hoy)
      // La primera semana del plan que aún no ha empezado: es la única a la que
      // las métricas de hoy le dicen algo.
      const prox = cadena.find(s => s.lunes && diasEntre(lunesEsta, s.lunes) >= 0)
      setLunesAjuste(prox?.lunes ?? null)

      const desde = sumarDias(hoy, -77)   // 11 semanas: suficiente para el ACWR
      const { data: micros } = await supabase.from('microciclo')
        .select('id, fecha_inicio, ua_planificada, mesociclo(macrociclo(id_deportista))')
      const mios = (micros || []).filter((m: any) => m.mesociclo?.macrociclo?.id_deportista === dep.id)

      const sel = 'id, fecha_sesion, duracion_minutos, duracion_real, rpe_estimado, rpe_reportado, estado'
      const [{ data: enPlan }, { data: libres }] = await Promise.all([
        mios.length
          ? supabase.from('sesion').select(sel).in('id_microciclo', mios.map((m: any) => m.id))
              .gte('fecha_sesion', desde).or('eliminada.is.null,eliminada.eq.false')
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('sesion').select(sel).eq('id_deportista', dep.id).is('id_microciclo', null)
          .gte('fecha_sesion', desde).or('eliminada.is.null,eliminada.eq.false'),
      ])
      const ses = [...(enPlan || []), ...(libres || [])]
      const dur = ses.length ? await estimarDuraciones(supabase, ses.map(s => s.id), {}) : {}

      // Serie diaria solo de lo REALIZADO: la carga que no se hizo no fatiga.
      const hechas = ses.filter(s => s.estado === 'Realizada')
        .map(s => ({ fecha_sesion: s.fecha_sesion, carga: cargaReal(s, dur[s.id]) }))
      const porDia: Record<string, number> = {}
      hechas.forEach(h => { porDia[h.fecha_sesion] = (porDia[h.fecha_sesion] || 0) + h.carga })
      const serie = Object.keys(porDia).sort().map(f => ({ carga: porDia[f], fecha_sesion: f }))

      const cargas = calcularCargas(ses.filter(s => s.estado === 'Realizada'))
      const tsb = cargas.length ? cargas[cargas.length - 1].tsb : null
      const acwr = calcularACWR(serie)

      // Cumplimiento de la semana que acaba de terminar: lo que se hizo entre lo
      // que el microciclo tenía planificado.
      const lunesPasada = sumarDias(lunesEsta, -7)
      const micro = mios.find((m: any) => String(m.fecha_inicio).slice(0, 10) === lunesPasada)
      let cumplimiento: number | null = null
      if (micro?.ua_planificada) {
        const real = serie
          .filter(d => diasEntre(lunesPasada, d.fecha_sesion) >= 0 && diasEntre(lunesPasada, d.fecha_sesion) < 7)
          .reduce((a, d) => a + d.carga, 0)
        cumplimiento = Math.round((real / micro.ua_planificada) * 100) / 100
      }

      setEstado({ tsb, acwr, cumplimiento })
      setCargandoEstado(false)
    }
    cargar().catch(() => setCargandoEstado(false))
  }, [dep.id, mesos.length])

  const ajustada = ajustarCadena(cadena, lunesAjuste && estado ? { [lunesAjuste]: estado } : {})
  const tocadas = ajustada.filter(s => s.ajuste.motivos.length)

  return (
    <div className="flex flex-col gap-4">
      {/* Cómo llega el atleta. Son los números que justifican cada recorte. */}
      <div className="rounded-xl bg-gray-950 border border-gray-800 px-3.5 py-3">
        {cargandoEstado ? (
          <p className="text-[12.5px] text-gray-500">Mirando cómo llega {dep.nombre}…</p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 items-baseline">
            <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Cómo llega</span>
            <span className="text-[13px]">
              <span className="text-gray-500">TSB </span>
              {estado?.tsb != null
                ? <b style={{ color: estadoTSB(estado.tsb).color }}>{Math.round(estado.tsb)} · {estadoTSB(estado.tsb).label}</b>
                : <span className="text-gray-600">sin datos</span>}
            </span>
            <span className="text-[13px]">
              <span className="text-gray-500">ACWR </span>
              {estado?.acwr != null
                ? <b className="text-gray-200">{estado.acwr.toFixed(2)} · {estadoACWR(estado.acwr).label}</b>
                : <span className="text-gray-600">hace falta más historia</span>}
            </span>
            <span className="text-[13px]">
              <span className="text-gray-500">Semana pasada </span>
              {estado?.cumplimiento != null
                ? <b className="text-gray-200">{Math.round(estado.cumplimiento * 100)} % de lo previsto</b>
                : <span className="text-gray-600">sin UA planificada</span>}
            </span>
            {lunesAjuste && (
              <span className="text-[11.5px] text-gray-600">
                El ajuste entra en la semana del {lunesAjuste} y se arrastra desde ahí.
              </span>
            )}
          </div>
        )}
      </div>

      {tocadas.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-3 flex flex-col gap-1.5">
          <p className="text-[12.5px] text-amber-100 font-semibold">
            {tocadas.length === 1 ? 'Una semana cambia' : tocadas.length + ' semanas cambian'} respecto al plan dibujado
          </p>
          {tocadas.map(s => (
            <p key={s.global} className="text-[12.5px] text-amber-200/90">
              <b>S{s.global} ({s.lunes})</b> — {s.ajuste.motivos.join(' ')}
            </p>
          ))}
        </div>
      )}

      {/* La temporada entera. Agrupada por bloque, porque es como se piensa. */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        {ajustada.map((s, i) => {
          const nuevoBloque = i === 0 || s.mesoId !== ajustada[i - 1].mesoId
          const cambiada = s.ajuste.cargaAjustada !== s.cargaRelativa
          return (
            <div key={s.global}>
              {nuevoBloque && (
                <div className="flex items-baseline gap-2 px-3.5 pt-2.5 pb-1 bg-gray-900/60 border-t border-gray-800">
                  <span className="text-[12.5px] font-bold text-gray-200">{s.mesoNombre}</span>
                  <span className="text-[11px] text-gray-500">{s.clase}</span>
                </div>
              )}
              <div className={'flex items-center gap-3 px-3.5 py-2 border-t border-gray-800/60 ' +
                (s.esDescarga ? 'bg-green-500/[0.05]' : '') + (cambiada ? ' bg-amber-500/[0.06]' : '')}>
                <span className="text-[12.5px] font-bold text-gray-500 w-8 tabular-nums">S{s.global}</span>
                <span className="text-[12px] text-gray-500 w-[86px] tabular-nums">{s.lunes}</span>
                <span className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden min-w-[50px] relative">
                  {/* El plan dibujado en tenue, lo que se va a pedir encima. */}
                  <span className="absolute inset-y-0 left-0 rounded-full bg-gray-700"
                    style={{ width: Math.min(100, s.cargaRelativa * 90) + '%' }} />
                  <span className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: Math.min(100, s.ajuste.cargaAjustada * 90) + '%', background: s.esDescarga ? '#22c55e' : cambiada ? '#f59e0b' : '#f97316' }} />
                </span>
                <span className="text-[12px] text-gray-400 w-[140px]">{s.etiqueta}</span>
                <span className={'text-[13px] font-semibold w-20 text-right tabular-nums ' + (cambiada ? 'text-amber-400' : 'text-orange-400')}>
                  {s.ajuste.horasAjustadas} h
                  {cambiada && <span className="text-gray-600 line-through ml-1 font-normal">{s.horasSemana}</span>}
                </span>
                <span className="text-[11.5px] text-gray-600 w-24 text-right tabular-nums">
                  {s.hastaMeta != null ? (s.hastaMeta === 0 ? 'semana de carrera' : 'faltan ' + s.hastaMeta) : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11.5px] text-gray-600">
        El plan dibujado va en gris detrás de cada barra. En ámbar, lo que se va a pedir de verdad.
        El ajuste solo puede bajar la carga, nunca subirla: equivocarse bajando cuesta una semana.
      </p>
    </div>
  )
}
