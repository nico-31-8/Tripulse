'use client'
// ============================================================
// TRIPULSE — «Su reloj» → Eficiencia: el ritmo a igual FC
// ============================================================
// Maqueta aprobada el 2026-10-20 («las 5 como propones»):
// https://claude.ai/artifact/BTBghmyQYt94pmRm5a3qfP
//
// Arriba, a qué ritmo corre con su FC habitual de rodaje, ahora y hace unas
// semanas, con su gráfica de 12 semanas; debajo, de qué rodajes sale y por qué
// los demás no cuentan; y el desacoplamiento de sus rodajes largos. Con pocos
// rodajes no se enseña ninguna tendencia: se dice cuántos lleva y cuántos
// hacen falta. Las cuentas viven en lib/ritmo-igual-fc; aquí solo se pintan.

import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { mmss } from '@/lib/medicion'
import { fechaCorta, fechaLarga } from '@/lib/fechas'
import { MIN_RODAJES, MIN_MINUTOS_DESACOPLAMIENTO, nivelDesacoplamiento, type AnalisisEficiencia } from '@/lib/ritmo-igual-fc'

const COLOR = '#4ade80'
const CHIP: Record<'bien' | 'medio' | 'mal', string> = {
  bien: 'bg-green-400/15 text-green-400',
  medio: 'bg-amber-400/15 text-amber-300',
  mal: 'bg-red-400/15 text-red-300',
}

export function EficienciaReloj({ analisis, error }: { analisis: AnalisisEficiencia | null; error: string | null }) {
  if (error) return <p className="text-[12.5px] text-red-300">No se ha podido calcular: {error}</p>
  if (!analisis) return <p className="text-[12.5px] text-gray-500">Calculando…</p>
  if (!analisis.rodajes.length) {
    return (
      <div className="tp-card p-12 text-center">
        <p className="text-[15px] font-bold mb-1.5">Ningún rodaje de carrera en las últimas 12 semanas</p>
        <p className="text-[13px] text-gray-400 max-w-md mx-auto leading-relaxed">
          El ritmo a igual FC sale de los rodajes de carrera que manda su reloj, con el detalle de sus km.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <RitmoAIgualFc analisis={analisis} />
      <Desacoplamientos analisis={analisis} />
    </div>
  )
}

function RitmoAIgualFc({ analisis }: { analisis: AnalisisEficiencia }) {
  const { fcRef, puntos, linea, tendencia, rodajes } = analisis
  const cuentan = rodajes.filter(r => r.cuenta)

  return (
    <section className="tp-card p-4 flex flex-col gap-3.5">
      {!tendencia ? (
        <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-white/[0.03] border border-dashed border-white/[0.08]">
          <p className="text-[13.5px] font-bold">
            {cuentan.length ? 'Lleva ' + cuentan.length + (cuentan.length === 1 ? ' rodaje que cuenta' : ' rodajes que cuentan') : 'Todavía no hay ningún rodaje que cuente'}
            ; para ver una tendencia hacen falta {MIN_RODAJES}
          </p>
          <p className="text-[12.5px] text-gray-400">
            Rodajes suaves al aire libre, de 20 min o más y a ritmo regular.
            {cuentan.length > 0 && <> {cuentan.length === 1 ? 'El que hay: ' : 'Los que hay: '}{cuentan.map(r => fechaCorta(r.fecha)).reverse().join(', ')}.</>}
          </p>
          <div className="flex gap-1 mt-1" aria-hidden="true">
            {Array.from({ length: MIN_RODAJES }, (_, i) => (
              <span key={i} className={'w-[26px] h-1.5 rounded-full ' + (i < cuentan.length ? 'bg-green-400' : 'bg-white/[0.08]')} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[9.5px] font-bold tracking-[.07em] uppercase text-gray-500">Ritmo a {fcRef} ppm · carrera</p>
          <p className="text-[24px] font-extrabold tracking-tight tabular-nums">
            {mmss(tendencia.ahora)} /km <span className="text-[15px] font-semibold text-gray-400">ahora</span>
          </p>
          <p className="text-[13px] text-gray-400 max-w-[70ch]">{fraseDeTendencia(tendencia)}</p>
        </div>
      )}

      {/* Sin tendencia, ni gráfica: dos puntos ya parecen una. */}
      {tendencia && <Grafica puntos={puntos} linea={linea} fcRef={fcRef} />}

      <p className="text-[12px] text-gray-500 max-w-[80ch]">
        {tendencia && 'Cada punto es un rodaje suave; la línea, la mediana de cada tres. '}
        {fcRef != null && fcRef + ' ppm es su FC habitual de rodaje: la mediana de sus rodajes suaves de las últimas 12 semanas. '}
        El calor, el viento, las cuestas y el cansancio lo empeoran sin que pierda forma: mira la tendencia, no un día.
      </p>

      <details className="group">
        <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-gray-400 hover:text-gray-200 list-none flex items-center gap-2">
          <span className="text-gray-500 transition group-open:rotate-90">▸</span>
          De qué rodajes sale ({cuentan.length} {cuentan.length === 1 ? 'cuenta' : 'cuentan'} · {rodajes.length - cuentan.length} no)
        </summary>
        <ul className="mt-2.5 flex flex-col gap-1.5 text-[12.5px]">
          {rodajes.map(r => (
            <li key={r.id} className="grid grid-cols-[18px_130px_1fr] max-sm:grid-cols-[18px_1fr] gap-x-2 text-gray-400">
              <span className={r.cuenta ? 'text-green-400' : 'text-gray-600'}>{r.cuenta ? '✓' : '✗'}</span>
              <span className="text-gray-300">{fechaLarga(r.fecha)}</span>
              <span className="max-sm:col-start-2 text-gray-500">
                {r.cuenta && r.ritmo != null && r.fc != null && r.ritmoRef != null
                  ? (r.minutos != null ? Math.round(r.minutos) + ' min · ' : '') + mmss(r.ritmo) + ' /km a ' + r.fc + ' ppm → ' + mmss(r.ritmoRef) + ' a ' + fcRef
                  : r.motivo}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

/** Lo de debajo del titular, según cómo haya ido. */
function fraseDeTendencia(t: NonNullable<AnalisisEficiencia['tendencia']>): string {
  if (t.antes == null || t.cambio == null) return 'La mediana de sus 3 últimos rodajes. Todavía no hay rodajes de hace 5 a 9 semanas con los que comparar.'
  const s = Math.round(Math.abs(t.antes - t.ahora))
  const pct = Math.round(Math.abs(t.cambio) * 100)
  const antes = 'Hace unas seis semanas, ' + mmss(t.antes) + ' /km'
  if (t.veredicto === 'mejor') return antes + ': ' + s + ' s más rápido por km (' + pct + ' %). Con la misma FC va más rápido: su forma aeróbica ha mejorado.'
  if (t.veredicto === 'peor') return antes + ': ' + s + ' s más lento por km (' + pct + ' %). Puede ser cansancio, calor o que ha perdido forma: mira cómo sigue.'
  return antes + ': sin cambios claros (menos del 3 %, lo que varía de un día a otro).'
}

function Grafica({ puntos, linea, fcRef }: { puntos: AnalisisEficiencia['puntos']; linea: AnalisisEficiencia['linea']; fcRef: number | null }) {
  const enLinea = new Map(linea.map(l => [l.fecha, l.ritmo]))
  const datos = puntos.map(p => ({ dia: fechaCorta(p.fecha), punto: p.ritmoRef, linea: enLinea.get(p.fecha) ?? null }))
  const valores = puntos.map(p => p.ritmoRef)
  /* Marcas que se leen como un ritmo: cada 15 s (cada 30 si el rango es grande), no «6:55». */
  const paso = Math.max(...valores) - Math.min(...valores) > 90 ? 30 : 15
  const dominio: [number, number] = [Math.floor((Math.min(...valores) - 5) / paso) * paso, Math.ceil((Math.max(...valores) + 5) / paso) * paso]
  const marcas = Array.from({ length: Math.round((dominio[1] - dominio[0]) / paso) + 1 }, (_, i) => dominio[0] + i * paso)
  return (
    <div className="w-full" role="img" aria-label={'Ritmo a ' + fcRef + ' ppm de cada rodaje suave, de ' + mmss(valores[0]) + ' a ' + mmss(valores[valores.length - 1]) + ' por km'}>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={datos} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="dia" stroke="#6b7280" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
          {/* Al revés: más rápido arriba. */}
          <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} domain={dominio} ticks={marcas} reversed allowDecimals={false} tickFormatter={(v: number) => mmss(v)} width={44} />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: 'white', fontSize: 12 }}
            formatter={(v, nombre) => [mmss(Number(v)) + ' /km', nombre === 'linea' ? 'Mediana de tres' : 'A ' + fcRef + ' ppm']} />
          <Line type="monotone" dataKey="linea" stroke={COLOR} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="punto" stroke="none" isAnimationActive={false}
            dot={{ r: 4, fill: '#0e1218', stroke: COLOR, strokeWidth: 2 }} activeDot={{ r: 5, fill: COLOR }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function Desacoplamientos({ analisis }: { analisis: AnalisisEficiencia }) {
  const largos = analisis.rodajes.filter(r => r.desacoplamiento).slice(0, 6)
  return (
    <section className="tp-card p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-[9.5px] font-bold tracking-[.07em] uppercase text-gray-500">Desacoplamiento</p>
        <p className="text-[13px] text-gray-400">
          En sus rodajes de {MIN_MINUTOS_DESACOPLAMIENTO} min o más: cuánto se le sube la FC en la segunda mitad a ritmo constante. Con las semanas de base debería bajar.
        </p>
      </div>
      {!largos.length ? (
        <div className="flex flex-col gap-1 p-3.5 rounded-xl bg-white/[0.03] border border-dashed border-white/[0.08]">
          <p className="text-[13.5px] font-bold">Ningún rodaje de {MIN_MINUTOS_DESACOPLAMIENTO} min o más todavía</p>
          <p className="text-[12.5px] text-gray-400">Sale de los que, además, cuentan para el ritmo a igual FC.</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {largos.map((r, i) => {
            const d = r.desacoplamiento!
            const n = nivelDesacoplamiento(d.pct)
            return (
              <li key={r.id} className={'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 ' + (i ? 'border-t border-white/[0.06]' : '')}>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{fechaLarga(r.fecha)}</p>
                  <p className="text-[12px] text-gray-500 tabular-nums">
                    {r.minutos != null ? Math.round(r.minutos) + ' min · ' : ''}{r.ritmo != null ? mmss(r.ritmo) + ' /km · ' : ''}FC {d.fc1} → {d.fc2}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 tabular-nums">
                  <span className="text-[15px] font-bold">{Math.round(d.pct)} %</span>
                  <span className={'text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 ' + CHIP[n.nivel]}>{n.texto}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[12px] text-gray-500">Menos del 5 %, bien; del 5 al 10 %, normal en base o con calor; más del 10 %, le falta base para esa duración o iba cansado.</p>
    </section>
  )
}
