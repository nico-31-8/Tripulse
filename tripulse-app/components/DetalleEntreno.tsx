'use client'
// ============================================================
// TRIPULSE — El detalle de un entreno del reloj, en «Su reloj»
// ============================================================
// Maqueta aprobada el 2026-10-19 («las 4 como propones»):
// https://claude.ai/artifact/YDqsq1JgqUN9b6nn2iPVuG
//
// Cerrado por defecto: la tarjeta del entreno es la de siempre y esto se abre
// con un toque. Dentro, las vueltas que grabó el reloj o las de cada km, y el
// tiempo en cada zona de FC del deportista, con la prescrita marcada si el
// entreno está unido a una sesión. Sin FC máx en su ficha no hay zonas que
// calcular: sale su FC por tramos de 10 ppm, y una franja que dice qué falta.
//
// Lo que se lee viene de `reloj_detalle`, que se rellena al sincronizar desde
// el fichero FIT del reloj (lib/detalle-entreno). Se pide al abrirlo, no antes:
// una página con cuarenta entrenos no tiene por qué traer cuarenta detalles.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { nombreReloj } from '@/lib/relojes-catalogo'
import {
  cumplimiento, distanciaTexto, fcPorTramos, minutosTexto, ritmoDeTrozo, tiempoEnZonas, tiempoTexto,
  type TramoDetalle, type VueltaDetalle, type ZonaFc,
} from '@/lib/detalle-entreno'

/** Lo que hace falta saber de sus zonas para enseñar el tiempo en cada una. */
export interface ZonasDelDeportista {
  zonas: ZonaFc[]
  /** «Zonas 2 · FC máx 188 y reposo 52, con su reserva». */
  nota: string
}

/** Una fila de `reloj_detalle`, la parte que se enseña. */
export interface FilaDetalle {
  vueltas: VueltaDetalle[]
  tramos: TramoDetalle[]
  tramo_m: number | null
  fc_segundos: Record<string, number>
  segundos_con_fc: number
  motivo: string | null
}
type Fila = FilaDetalle

export function DetalleEntreno({ idMedicion, disciplina, proveedor, tiene, zonas, zonaPrescrita, onIrAFicha }: {
  idMedicion: number
  disciplina: string | null
  proveedor: string
  /** 'si' hay detalle; 'pendiente', cuenta y llegará en la próxima sincronización; 'no', nada que enseñar. */
  tiene: 'si' | 'pendiente' | 'no'
  /** null: sin FC máx en su ficha. */
  zonas: ZonasDelDeportista | null
  /** La zona de la sesión a la que está unido, si lo está. */
  zonaPrescrita: string | null
  onIrAFicha: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [fila, setFila] = useState<Fila | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (tiene === 'no') return null
  if (tiene === 'pendiente') {
    return <p className="mt-3 text-[11.5px] text-gray-500">⌚ Su detalle (vueltas y zonas) llega con la próxima sincronización.</p>
  }

  const alternar = async () => {
    const abrir = !abierto
    setAbierto(abrir)
    if (!abrir || fila || cargando) return
    setCargando(true)
    setError(null)
    const { data, error: e } = await supabase.from('reloj_detalle')
      .select('vueltas, tramos, tramo_m, fc_segundos, segundos_con_fc, motivo')
      .eq('id_medicion', idMedicion).maybeSingle()
    setCargando(false)
    if (e || !data) { setError('No se ha podido leer el detalle' + (e ? ': ' + e.message : '.')); return }
    setFila(data as Fila)
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={alternar} aria-expanded={abierto}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.035] hover:bg-white/[0.06] border border-white/[0.06] text-left text-[13px] font-semibold transition">
        <span>Detalle: vueltas y zonas</span>
        <span className="text-[12px] font-medium text-gray-500">{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
      </button>

      {abierto && (
        <div className="mt-3 flex flex-col gap-5">
          {cargando && <p className="text-[12.5px] text-gray-500">Cargando el detalle…</p>}
          {error && <p className="text-[12.5px] text-red-300">{error}</p>}
          {fila && <DetalleEntrenoVista fila={fila} disciplina={disciplina} proveedor={proveedor} zonas={zonas} zonaPrescrita={zonaPrescrita} onIrAFicha={onIrAFicha} />}
        </div>
      )}
    </div>
  )
}

/** Lo de dentro, con el detalle ya leído. Aparte para poder pintarlo sin la base. */
export function DetalleEntrenoVista({ fila, disciplina, proveedor, zonas, zonaPrescrita, onIrAFicha }: {
  fila: FilaDetalle
  disciplina: string | null
  proveedor: string
  zonas: ZonasDelDeportista | null
  zonaPrescrita: string | null
  onIrAFicha: () => void
}) {
  const [pestana, setPestana] = useState<'reloj' | 'tramos' | null>(null)
  /* Sin fichero no hay «del fichero» que decir: solo el porqué. */
  if (fila.motivo) return <p className="text-[12.5px] text-gray-400">{fila.motivo}</p>
  return (
    <>
      <Vueltas fila={fila} disciplina={disciplina} pestana={pestana} onPestana={setPestana} />
      <Zonas fila={fila} zonas={zonas} zonaPrescrita={zonaPrescrita} onIrAFicha={onIrAFicha} />
      <p className="text-[11.5px] text-gray-500">⌚ Del fichero de su {nombreReloj(proveedor)}. El recorrido no se guarda.</p>
    </>
  )
}

// ---------------------------------------------------------------------------

const esCarrera = (d: string | null) => d === 'Carrera'
const esBici = (d: string | null) => d === 'Ciclismo'

/** El total de las vueltas: sumas, y las medias pesadas por el tiempo de cada una. */
function total(vueltas: VueltaDetalle[]): VueltaDetalle {
  const seg = vueltas.reduce((s, v) => s + (v.segundos || 0), 0)
  const media = (k: 'fc_media' | 'cadencia' | 'potencia') => {
    const con = vueltas.filter(v => v[k] != null && (v.segundos || 0) > 0)
    const s = con.reduce((a, v) => a + (v.segundos || 0), 0)
    return s ? Math.round(con.reduce((a, v) => a + (v[k] || 0) * (v.segundos || 0), 0) / s) : null
  }
  const maxFc = vueltas.reduce<number | null>((m, v) => (v.fc_max != null && (m == null || v.fc_max > m) ? v.fc_max : m), null)
  return {
    metros: vueltas.reduce((s, v) => s + (v.metros || 0), 0) || null,
    segundos: seg || null,
    fc_media: media('fc_media'), fc_max: maxFc, cadencia: media('cadencia'), potencia: media('potencia'),
    desnivel: vueltas.reduce((s, v) => s + (v.desnivel || 0), 0) || null,
  }
}

function Vueltas({ fila, disciplina, pestana, onPestana }: {
  fila: Fila; disciplina: string | null; pestana: 'reloj' | 'tramos' | null; onPestana: (p: 'reloj' | 'tramos') => void
}) {
  /* Las del reloj solo si son más de una: una sola vuelta es el entreno entero, que ya está arriba. */
  const hayReloj = fila.vueltas.length > 1
  const hayTramos = fila.tramos.length > 0
  if (!hayReloj && !hayTramos) return null
  const activa = pestana === 'tramos' && hayTramos ? 'tramos' : pestana === 'reloj' && hayReloj ? 'reloj' : hayReloj ? 'reloj' : 'tramos'
  const nombreTramo = fila.tramo_m === 1000 ? 'Por kilómetro' : fila.tramo_m ? 'Cada ' + distanciaTexto(fila.tramo_m) : 'Por tramos'

  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-bold">Vueltas</h3>
        {hayReloj && hayTramos && (
          <div role="tablist" aria-label="Qué vueltas" className="inline-flex gap-1 p-[3px] rounded-[11px] bg-white/[0.04] border border-white/[0.06]">
            {([['reloj', 'Las del reloj · ' + fila.vueltas.length], ['tramos', nombreTramo + ' · ' + fila.tramos.length]] as const).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={activa === k} onClick={() => onPestana(k)}
                className={'text-[12px] font-semibold rounded-lg px-2.5 py-1 transition ' + (activa === k ? 'bg-white/[0.09] text-white' : 'text-gray-400 hover:text-gray-200')}>
                {t}
              </button>
            ))}
          </div>
        )}
        {!(hayReloj && hayTramos) && <span className="text-[12px] text-gray-500">{hayReloj ? 'Las del reloj' : nombreTramo}</span>}
      </div>
      {activa === 'reloj'
        ? <TablaVueltas filas={fila.vueltas} disciplina={disciplina} />
        : <TablaTramos filas={fila.tramos} disciplina={disciplina} tramo={fila.tramo_m} />}
    </section>
  )
}

/* Cada celda lleva UNA alineación: con text-right y text-left a la vez gana la que Tailwind escriba después en su CSS, no la última de la lista. */
const celda = 'px-3 py-1.5 whitespace-nowrap text-right'
const celdaIzq = 'px-3 py-1.5 whitespace-nowrap text-left'
const cabeza = 'px-3 py-1.5 font-bold text-[10px] tracking-[.06em] uppercase text-gray-500 whitespace-nowrap text-right'
const cabezaIzq = 'px-3 py-1.5 font-bold text-[10px] tracking-[.06em] uppercase text-gray-500 whitespace-nowrap text-left'

function TablaVueltas({ filas, disciplina }: { filas: VueltaDetalle[]; disciplina: string | null }) {
  const t = total(filas)
  const conCadencia = (esCarrera(disciplina) || esBici(disciplina)) && filas.some(v => v.cadencia != null)
  const conPotencia = esBici(disciplina) && filas.some(v => v.potencia != null)
  const conDistancia = filas.some(v => (v.metros || 0) > 0)
  /* En carrera el reloj guarda la cadencia de una pierna: lo que se lee son pasos por minuto. */
  const cad = (c: number | null) => (c == null ? '—' : String(esCarrera(disciplina) ? c * 2 : c))
  const fila = (v: VueltaDetalle) => (
    <>
      {conDistancia && <td className={celda}>{distanciaTexto(v.metros)}</td>}
      <td className={celda}>{tiempoTexto(v.segundos)}</td>
      {conDistancia && <td className={celda}>{ritmoDeTrozo(v.metros, v.segundos, disciplina) ?? '—'}</td>}
      <td className={celda}>{v.fc_media ?? '—'}</td>
      <td className={celda + ' text-gray-400'}>{v.fc_max ?? '—'}</td>
      {conPotencia && <td className={celda}>{v.potencia != null ? v.potencia + ' W' : '—'}</td>}
      {conCadencia && <td className={celda + ' text-gray-400'}>{cad(v.cadencia)}</td>}
    </>
  )
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full min-w-[480px] text-[13px] tabular-nums border-collapse">
        <thead className="bg-white/[0.025]">
          <tr>
            <th className={cabezaIzq}>Vuelta</th>
            {conDistancia && <th className={cabeza}>Distancia</th>}
            <th className={cabeza}>Tiempo</th>
            {conDistancia && <th className={cabeza}>{esBici(disciplina) ? 'Velocidad' : 'Ritmo'}</th>}
            <th className={cabeza}>FC media</th>
            <th className={cabeza}>FC máx</th>
            {conPotencia && <th className={cabeza}>Potencia</th>}
            {conCadencia && <th className={cabeza}>{esCarrera(disciplina) ? 'Pasos/min' : 'Cadencia'}</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((v, i) => (
            <tr key={i} className={i ? 'border-t border-white/[0.06]' : ''}>
              <td className={celdaIzq}>{i + 1}</td>
              {fila(v)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/[0.1] font-bold text-[12.5px]">
            <td className={celdaIzq}>Total</td>
            {fila(t)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function TablaTramos({ filas, disciplina, tramo }: { filas: TramoDetalle[]; disciplina: string | null; tramo: number | null }) {
  /* La más rápida, entre los tramos enteros (el trozo final no compite), y solo
     si lo es de verdad: con un empate al segundo no hay «la» más rápida. */
  const enteros = filas.filter(f => tramo && f.metros === tramo && f.segundos > 0)
  const mejor = enteros.length > 1 ? Math.min(...enteros.map(f => Math.round(f.segundos))) : null
  const empatadas = enteros.filter(f => Math.round(f.segundos) === mejor)
  const rapida = empatadas.length === 1 ? empatadas[0] : null
  /* Los metros hechos al acabar cada tramo, para nombrarlo («10,00 km»). */
  const hechos = filas.reduce<number[]>((acc, f) => [...acc, (acc.at(-1) ?? 0) + f.metros], [])
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full min-w-[420px] text-[13px] tabular-nums border-collapse">
        <thead className="bg-white/[0.025]">
          <tr>
            <th className={cabezaIzq}>{tramo === 1000 ? 'Km' : 'Tramo'}</th>
            <th className={cabeza}>Tiempo</th>
            <th className={cabeza}>{esBici(disciplina) ? 'Velocidad' : 'Ritmo'}</th>
            <th className={cabeza}>FC media</th>
            <th className={cabeza}>FC máx</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const etiqueta = tramo && f.metros === tramo
              ? (tramo === 1000 ? String(i + 1) : distanciaTexto(hechos[i]))
              : (tramo === 1000 ? (f.metros / 1000).toFixed(2).replace('.', ',') : distanciaTexto(hechos[i]))
            return (
              <tr key={i} className={i ? 'border-t border-white/[0.06]' : ''}>
                <td className={celdaIzq}>{etiqueta}</td>
                <td className={celda}>{tiempoTexto(f.segundos)}</td>
                <td className={celda}>
                  {ritmoDeTrozo(f.metros, f.segundos, disciplina) ?? '—'}
                  {f === rapida && <span className="ml-1.5 text-[10.5px] font-bold text-green-400">la más rápida</span>}
                </td>
                <td className={celda}>{f.fc_media ?? '—'}</td>
                <td className={celda + ' text-gray-400'}>{f.fc_max ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Zonas({ fila, zonas, zonaPrescrita, onIrAFicha }: {
  fila: Fila; zonas: ZonasDelDeportista | null; zonaPrescrita: string | null; onIrAFicha: () => void
}) {
  if (!fila.segundos_con_fc) {
    return <p className="text-[12.5px] text-gray-500">Este entreno no trae FC: no hay tiempo en zonas que enseñar.</p>
  }

  if (!zonas) {
    const tramos = fcPorTramos(fila.fc_segundos)
    const mayor = Math.max(...tramos.map(t => t.segundos), 1)
    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-bold">Su FC en este entreno</h3>
          <span className="text-[12px] text-gray-500">{minutosTexto(fila.segundos_con_fc)} con FC</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {tramos.map(t => (
            <div key={t.desde} className="grid grid-cols-[84px_1fr_40px] gap-2.5 items-center text-[12.5px] tabular-nums">
              <span>{t.desde}–{t.hasta}</span>
              <span className="h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                <span className="block h-full rounded-full bg-white/45" style={{ width: Math.round(t.segundos * 100 / mayor) + '%' }} />
              </span>
              <span className="text-right text-gray-400">{minutosTexto(t.segundos)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-amber-400/[0.08] border border-amber-400/25 text-[12.5px] text-amber-200">
          <span>Para verlo en sus zonas falta su FC máx (de un test o puesta a mano en su ficha).</span>
          <button type="button" onClick={onIrAFicha}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition">Ir a su ficha</button>
        </div>
      </section>
    )
  }

  const tiempos = tiempoEnZonas(fila.fc_segundos, zonas.zonas)
  const c = cumplimiento(tiempos, zonaPrescrita)
  const rango = (z: { min: number; max: number | null }, i: number) =>
    i === 0 ? '< ' + z.max + ' ppm' : z.max == null ? '> ' + z.min + ' ppm' : z.min + '–' + z.max + ' ppm'

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-bold">Tiempo en sus zonas de FC</h3>
        <span className="text-[12px] text-gray-500">{zonas.nota}</span>
      </div>
      <div className="flex h-3.5 rounded-full overflow-hidden bg-white/[0.05]" role="img"
        aria-label={tiempos.map(t => t.sigla + ' ' + minutosTexto(t.segundos)).join(', ')}>
        {tiempos.filter(t => t.segundos > 0).map(t => (
          <span key={t.sigla} className="block h-full" style={{ width: t.pct + '%', background: t.color }} />
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
        {tiempos.map((t, i) => (
          <div key={t.sigla} className={'flex gap-2 items-start px-2.5 py-2 rounded-[10px] bg-white/[0.03]' + (t.sigla === zonaPrescrita ? ' ring-1 ring-white/30' : '')}>
            <span className="w-2.5 h-2.5 rounded-[3px] mt-1 flex-shrink-0" style={{ background: t.color }} />
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold">{t.sigla}{t.sigla === zonaPrescrita ? ' · la prescrita' : ''}</p>
              <p className="text-[11.5px] text-gray-500 tabular-nums">{rango(t, i)}</p>
              <p className="text-[13px] font-bold tabular-nums">{minutosTexto(t.segundos)}{t.segundos ? ' · ' + Math.round(t.pct) + ' %' : ''}</p>
            </div>
          </div>
        ))}
      </div>
      {c && (
        <p className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[12.5px]">
          <b>Prescrito: {zonaPrescrita}.</b>{' '}
          <span className="text-gray-300">{c.en} % del tiempo en {zonaPrescrita} · {c.encima} % por encima · {c.debajo} % por debajo</span>
        </p>
      )}
    </section>
  )
}
