'use client'
// ============================================================
// «Noches»: lo que manda el reloj de cada noche, para su entrenador
// ============================================================
// La pestaña de la página del reloj (/actividades/[id]), junto a «Entrenos».
// Hasta ahora el entrenador solo veía la última noche (la casilla «Reloj» de la
// ficha) y lo que se guarda con cada wellness; las noches enteras solo las veía
// el deportista, en su perfil. Decidido con el usuario el 18-10-2026:
//   · su semana frente a lo suyo, nunca la noche suelta (lib/noches-del-reloj);
//   · 4 semanas de entrada, y 8 y 16 cuando las haya;
//   · su bienestar del wellness de esa mañana, al lado;
//   · lo común a las dos marcas en las mismas columnas, y lo propio de cada una
//     en la última y en el detalle;
//   · solo para el entrenador.
//
// NochesDelReloj carga; VistaNoches solo pinta (y se puede ver con datos de
// ejemplo sin sesión).

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, Cell,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias, indiceDia, DIAS_SEMANA } from '@/lib/fechas'
import { textoHoras } from '@/lib/noches-reloj'
import { bienestar } from '@/lib/wellness-score'
import { nochesDeMediciones, resumenDeNoches, RECARGA_POLAR, type NocheDelReloj, type Comparacion } from '@/lib/noches-del-reloj'

const RANGOS = [{ label: '4 sem', dias: 28 }, { label: '8 sem', dias: 56 }, { label: '16 sem', dias: 112 }]
const diaCorto = (f: string) => DIAS_SEMANA[indiceDia(f)].slice(0, 3).toLowerCase() + ' ' + Number(f.slice(8, 10))
const ddmm = (f: string) => f.slice(8, 10) + '/' + f.slice(5, 7)
const hora = (s: string | null) => (s && /T\d{2}:\d{2}/.test(s) ? s.slice(11, 16) : s && /^\d{2}:\d{2}/.test(s) ? s.slice(0, 5) : null)
const signo = (n: number, unidad: string) => (Math.round(n) === 0 ? 'igual' : (n > 0 ? '+' : '−') + Math.abs(Math.round(n)) + unidad)

/** Carga sus noches (de la marca que tiene ahora) y su bienestar de esas mañanas. */
export function NochesDelReloj({ idDeportista, proveedor }: { idDeportista: number; proveedor: string }) {
  const [datos, setDatos] = useState<{ noches: NocheDelReloj[]; bienestar: Record<string, number> } | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const desde = sumarDias(hoyISO(), -RANGOS[RANGOS.length - 1].dias)
      const [med, wel] = await Promise.all([
        supabase.from('reloj_medicion').select('tipo, fecha, proveedor, datos')
          .eq('id_deportista', idDeportista).eq('proveedor', proveedor).in('tipo', ['sueno', 'recarga']).gte('fecha', desde),
        supabase.from('wellness').select('fecha, score_wellness').eq('id_deportista', idDeportista).gte('fecha', desde),
      ])
      if (!vivo) return
      const b: Record<string, number> = {}
      for (const w of (wel.data || []) as { fecha: string; score_wellness: number | null }[]) {
        const v = bienestar(w.score_wellness)
        if (v != null) b[String(w.fecha).slice(0, 10)] = v
      }
      setDatos({ noches: nochesDeMediciones(med.data, proveedor), bienestar: b })
    })()
    return () => { vivo = false }
  }, [idDeportista, proveedor])
  if (!datos) return <div className="tp-card p-12 text-center text-gray-500 text-[13px]">Cargando…</div>
  return <VistaNoches noches={datos.noches} bienestarPorFecha={datos.bienestar} hoy={hoyISO()} />
}

const CHIP: Record<Comparacion['estado'], string> = {
  dentro: 'bg-green-500/15 text-green-400', peor: 'bg-amber-400/15 text-amber-300', mejor: 'bg-sky-400/15 text-sky-300',
  sinBase: 'bg-gray-800 text-gray-300', sinDatos: 'bg-gray-800 text-gray-400',
}

function Bloque({ etiqueta, valor, unidad, comparacion, estado }: { etiqueta: string; valor: string; unidad?: string; comparacion: string; estado: { k: Comparacion['estado']; texto: string } }) {
  return (
    <div className="tp-card p-4 flex flex-col gap-1.5 min-w-0">
      <span className="text-[9.5px] font-bold tracking-[.07em] uppercase text-gray-500">{etiqueta}</span>
      <span className="text-[26px] font-bold leading-tight tabular-nums">{valor}{unidad && <span className="text-[13px] font-medium text-gray-400"> {unidad}</span>}</span>
      <span className="text-[12.5px] text-gray-300">{comparacion}</span>
      <span className={'self-start text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 ' + CHIP[estado.k]}>{estado.texto}</span>
    </div>
  )
}

const TEXTO_ESTADO = (k: Comparacion['estado'], peor: string, mejor: string) =>
  k === 'dentro' ? 'Dentro de lo suyo' : k === 'peor' ? peor : k === 'mejor' ? mejor : k === 'sinBase' ? 'Aún sin base' : 'Sin noches esta semana'

/** Solo pinta: sus noches, de la más reciente a la más antigua. */
export function VistaNoches({ noches, bienestarPorFecha, hoy }: { noches: NocheDelReloj[]; bienestarPorFecha: Record<string, number>; hoy: string }) {
  const [rango, setRango] = useState(28)
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const resumen = useMemo(() => resumenDeNoches(noches, hoy), [noches, hoy])
  const desde = sumarDias(hoy, -(rango - 1))
  const masAntigua = noches.length ? noches[noches.length - 1].fecha : hoy
  const conCoros = noches.some(n => n.despertares != null || n.hrvEstado != null || n.fcTipo === 'reposo')
  const fcEsReposo = noches.find(n => n.fcTipo)?.fcTipo === 'reposo'

  /* Todos los días del rango, también los que no trajeron noche: el hueco se ve. */
  const dias = useMemo(() => {
    const porFecha = new Map(noches.map(n => [n.fecha, n]))
    const out: { fecha: string; n: NocheDelReloj | null }[] = []
    for (let f = hoy; f >= desde; f = sumarDias(f, -1)) {
      if (f < masAntigua) break
      out.push({ fecha: f, n: porFecha.get(f) ?? null })
    }
    return out
  }, [noches, hoy, desde, masAntigua])
  const serie = useMemo(() => dias.slice().reverse().map(d => ({
    dia: ddmm(d.fecha), fecha: d.fecha,
    horas: d.n?.dormidoMin != null ? Math.round(d.n.dormidoMin / 6) / 10 : null,
    hrv: d.n?.hrv ?? null,
    reciente: d.fecha >= sumarDias(hoy, -6),
  })), [dias, hoy])

  if (!noches.length) {
    return (
      <div className="tp-card p-12 text-center">
        <p className="text-[15px] font-bold mb-1.5">Todavía no ha llegado ninguna noche</p>
        <p className="text-[13px] text-gray-400 max-w-md mx-auto leading-relaxed">
          Llegan solas cada mañana y cada noche, y al momento si abre su wellness o pulsa «Sincronizar ahora» en su perfil. Tiene que dormir con el reloj puesto.
        </p>
      </div>
    )
  }

  const { sueno, hrv, fc } = resumen
  const bandaHrv: [number, number] | null = hrv.rango ?? (hrv.base != null && hrv.margen != null ? [Math.round(hrv.base - hrv.margen), Math.round(hrv.base + hrv.margen)] : null)
  /* El eje de la HRV en múltiplos de 5, con la franja dentro: «28, 35, 42…» no se lee. */
  const valoresHrv = [...serie.map(d => d.hrv).filter((v): v is number => v != null), ...(bandaHrv || [])]
  const dominioHrv: [number, number] = valoresHrv.length
    ? [Math.max(0, Math.floor((Math.min(...valoresHrv) - 3) / 5) * 5), Math.ceil((Math.max(...valoresHrv) + 3) / 5) * 5]
    : [0, 100]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {RANGOS.map(r => {
          const hay = r.dias === 28 || masAntigua < sumarDias(hoy, -(r.dias / 2))
          return (
            <button key={r.dias} onClick={() => setRango(r.dias)} disabled={!hay} title={hay ? undefined : 'Todavía no hay tantas noches'}
              className={'text-[11.5px] font-semibold px-3 py-1.5 rounded-full border transition disabled:opacity-40 disabled:cursor-not-allowed ' + (rango === r.dias
                ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                : 'text-gray-400 bg-white/[0.04] border-white/[0.06] hover:text-white')}>{r.label}</button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Bloque etiqueta="Sueño · media de 7 noches" valor={sueno.reciente != null ? textoHoras(Math.round(sueno.reciente)) : '—'}
          comparacion={sueno.base != null && sueno.reciente != null ? 'Lo suyo: ' + textoHoras(Math.round(sueno.base)) + ' · ' + signo(sueno.reciente - sueno.base, ' min') : 'Hacen falta tres semanas de noches para saber lo suyo.'}
          estado={{ k: sueno.estado, texto: TEXTO_ESTADO(sueno.estado, 'Duerme menos de lo suyo', 'Duerme más de lo suyo') }} />
        <Bloque etiqueta="HRV del sueño · media de 7 días" valor={hrv.reciente != null ? String(Math.round(hrv.reciente)) : '—'} unidad={hrv.reciente != null ? 'ms' : undefined}
          comparacion={hrv.rango ? 'Su rango normal según COROS: ' + hrv.rango[0] + '–' + hrv.rango[1] + ' ms'
            : hrv.base != null && hrv.reciente != null ? 'Lo suyo: ' + Math.round(hrv.base) + ' ms · ' + signo(hrv.reciente - hrv.base, '') : 'Hacen falta tres semanas de noches para saber lo suyo.'}
          estado={{ k: hrv.estado, texto: TEXTO_ESTADO(hrv.estado, 'Por debajo de lo suyo', 'Por encima de lo suyo') }} />
        <Bloque etiqueta={(fcEsReposo ? 'FC en reposo' : 'FC media nocturna') + ' · media de 7 días'} valor={fc.reciente != null ? String(Math.round(fc.reciente)) : '—'} unidad={fc.reciente != null ? 'ppm' : undefined}
          comparacion={fc.base != null && fc.reciente != null ? 'Lo suyo: ' + Math.round(fc.base) + ' ppm · ' + signo(fc.reciente - fc.base, '') : 'Hacen falta tres semanas de noches para saber lo suyo.'}
          estado={{ k: fc.estado, texto: TEXTO_ESTADO(fc.estado, 'Más alta de lo suyo', 'Más baja de lo suyo') }} />
      </div>
      <p className="text-[12.5px] text-gray-400 -mt-1">
        Se mira la media de su última semana contra sus tres semanas anteriores, no la noche suelta: una noche mala no dice nada. Con menos de tres semanas de noches sale «Aún sin base».
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="tp-card p-4 min-w-0">
          <p className="text-[13.5px] font-semibold">Horas de sueño</p>
          <p className="text-[12px] text-gray-400 mb-2">Su última semana, en azul fuerte. La línea, lo suyo.</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
              <XAxis dataKey="dia" stroke="#6b7280" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} unit=" h" />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: 'white', fontSize: 12 }}
                formatter={(v) => [typeof v === 'number' ? textoHoras(Math.round(v * 60)) : '—', 'Sueño']} />
              <Bar dataKey="horas" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {serie.map(d => <Cell key={d.fecha} fill={d.reciente ? '#60a5fa' : 'rgba(96,165,250,.45)'} />)}
              </Bar>
              {sueno.base != null && <ReferenceLine y={Math.round(sueno.base / 6) / 10} stroke="#f97316" strokeDasharray="5 4" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="tp-card p-4 min-w-0">
          <p className="text-[13.5px] font-semibold">HRV del sueño</p>
          <p className="text-[12px] text-gray-400 mb-2">
            {hrv.rango ? 'La franja verde es su rango normal según COROS.' : bandaHrv ? 'La franja verde es lo suyo.' : 'Su franja normal saldrá con tres semanas de noches.'} En ámbar, las noches por debajo.
          </p>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
              <XAxis dataKey="dia" stroke="#6b7280" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} domain={dominioHrv} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: 'white', fontSize: 12 }}
                formatter={(v) => [typeof v === 'number' ? v + ' ms' : '—', 'HRV']} />
              {bandaHrv && <ReferenceArea y1={bandaHrv[0]} y2={bandaHrv[1]} fill="#4ade80" fillOpacity={0.09} strokeOpacity={0} />}
              <Line type="monotone" dataKey="hrv" stroke="#38bdf8" strokeWidth={2} connectNulls={false} isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; value?: number | null; index?: number }) => {
                  if (p.cx == null || p.cy == null || p.value == null) return <g key={'d' + p.index} />
                  const bajo = !!bandaHrv && p.value < bandaHrv[0]
                  return <circle key={'d' + p.index} cx={p.cx} cy={p.cy} r={bajo ? 3.6 : 2.6} fill={bajo ? '#fbbf24' : '#38bdf8'} />
                }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tp-card p-1.5 overflow-x-auto">
        <table className="w-full min-w-[780px] text-[13px] text-white tabular-nums">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-gray-500 text-left">
              <th className="font-semibold px-2.5 py-2.5">Noche</th>
              <th className="font-semibold px-2.5 py-2.5">Sueño</th>
              <th className="font-semibold px-2.5 py-2.5" title="La puntuación que da el reloj">Puntuación</th>
              <th className="font-semibold px-2.5 py-2.5">Fases</th>
              <th className="font-semibold px-2.5 py-2.5">{conCoros ? 'Despertares' : 'Interrupciones'}</th>
              <th className="font-semibold px-2.5 py-2.5">HRV</th>
              <th className="font-semibold px-2.5 py-2.5">{fcEsReposo ? 'FC en reposo' : 'FC media'}</th>
              <th className="font-semibold px-2.5 py-2.5">{conCoros ? 'Siesta' : 'Respiración'}</th>
              <th className="font-semibold px-2.5 py-2.5" title="Su bienestar del wellness de esa mañana">Su wellness</th>
            </tr>
          </thead>
          <tbody>
            {dias.map(({ fecha, n }) => {
              if (!n) return (
                <tr key={fecha} className="border-t border-white/[0.045]">
                  <td className="px-2.5 py-2 text-gray-500 whitespace-nowrap">{diaCorto(fecha)}</td>
                  <td colSpan={8} className="px-2.5 py-2 text-gray-500 italic">Sin noche: no llegó nada del reloj.</td>
                </tr>
              )
              const abierta = !!abiertas[fecha]
              const alternar = () => setAbiertas(a => ({ ...a, [fecha]: !a[fecha] }))
              return [
                <tr key={fecha} tabIndex={0} aria-expanded={abierta} onClick={alternar}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar() } }}
                  className="border-t border-white/[0.045] cursor-pointer hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
                  <td className="px-2.5 py-2 font-semibold whitespace-nowrap">{diaCorto(fecha)}</td>
                  <td className="px-2.5 py-2">{textoHoras(n.dormidoMin)}</td>
                  <td className="px-2.5 py-2">{n.puntuacion ?? <span className="text-gray-500">—</span>}</td>
                  <td className="px-2.5 py-2">
                    {n.fases ? (
                      <span className="flex h-2 w-[110px] rounded overflow-hidden bg-gray-800" title={'Profundo ' + n.fases.profundo + '% · Ligero ' + n.fases.ligero + '% · REM ' + n.fases.rem + '%'}>
                        <i className="block h-full bg-blue-500" style={{ width: n.fases.profundo + '%' }} />
                        <i className="block h-full bg-sky-300" style={{ width: n.fases.ligero + '%' }} />
                        <i className="block h-full bg-violet-400" style={{ width: n.fases.rem + '%' }} />
                      </span>
                    ) : <span className="text-gray-500">—</span>}
                  </td>
                  <td className="px-2.5 py-2">{conCoros ? (n.despertares ?? '—') : (n.interrupcionesMin != null ? n.interrupcionesMin + ' min' : '—')}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    {n.hrv != null ? n.hrv + ' ms' : <span className="text-gray-500">—</span>}
                    {n.hrvEstado && (
                      <span title={'La valoración de COROS frente a su rango normal' + (n.hrvRango ? ' (' + n.hrvRango[0] + '–' + n.hrvRango[1] + ' ms)' : '')}
                        className={'ml-1.5 text-[11px] font-semibold rounded-full px-2 py-px ' + (n.hrvEstado === 'por_debajo' ? 'bg-amber-400/15 text-amber-300' : n.hrvEstado === 'por_encima' ? 'bg-sky-400/15 text-sky-300' : 'bg-green-500/15 text-green-400')}>
                        {n.hrvEstado === 'por_debajo' ? 'por debajo' : n.hrvEstado === 'por_encima' ? 'por encima' : 'normal'}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2">{n.fc != null ? Math.round(n.fc) + ' ppm' : <span className="text-gray-500">—</span>}</td>
                  <td className="px-2.5 py-2">{conCoros ? (n.siestaMin ? n.siestaMin + ' min' : <span className="text-gray-500">—</span>) : (n.respiracion != null ? n.respiracion + ' rpm' : <span className="text-gray-500">—</span>)}</td>
                  <td className="px-2.5 py-2">{bienestarPorFecha[fecha] ?? <span className="text-gray-500">sin wellness</span>}</td>
                </tr>,
                abierta && (
                  <tr key={fecha + '-detalle'} className="bg-white/[0.02]">
                    <td colSpan={9} className="px-2.5 py-3">
                      <div className="flex flex-wrap gap-x-7 gap-y-2.5 text-[13px]">
                        {(hora(n.inicio) || hora(n.fin)) && <Dato k="Se durmió / se levantó" v={(hora(n.inicio) || '—') + ' – ' + (hora(n.fin) || '—')} />}
                        {n.enCamaMin != null && <Dato k="En la cama" v={textoHoras(n.enCamaMin)} />}
                        {n.interrupcionesMin != null && <Dato k={conCoros ? 'Despierto dentro' : 'Interrupciones'} v={n.interrupcionesMin + ' min'} />}
                        {n.fases && <Dato k={n.profundoMin != null ? 'Profundo · REM' : 'Profundo · ligero · REM'}
                          v={n.profundoMin != null ? n.profundoMin + ' min · ' + n.remMin + ' min' : n.fases.profundo + ' % · ' + n.fases.ligero + ' % · ' + n.fases.rem + ' %'} />}
                        {n.hrvRango && <Dato k="Su rango normal de HRV (COROS)" v={n.hrvRango[0] + '–' + n.hrvRango[1] + ' ms'} />}
                        {n.hrvLineaBase != null && <Dato k="Su línea base de HRV (COROS)" v={n.hrvLineaBase + ' ms'} />}
                        {n.respiracion != null && <Dato k="Respiración" v={n.respiracion + ' rpm'} />}
                        {n.recarga != null && <Dato k="Recarga nocturna (Polar)" v={RECARGA_POLAR[n.recarga] || String(n.recarga)} />}
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-gray-400">
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500 mr-1 align-[-1px]" />Profundo</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-300 mr-1 align-[-1px]" />Ligero</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-400 mr-1 align-[-1px]" />REM</span>
        <span className="text-gray-500">Pulsa una noche para ver el detalle. La fecha es la del día en que se despierta.</span>
      </div>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-[120px]">
      <span className="block text-[10.5px] uppercase tracking-wider text-gray-500">{k}</span>
      <b className="font-semibold">{v}</b>
    </div>
  )
}
