'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { fechaCorta } from '@/lib/fechas'
import { NIVELES_PLIO, PARTES_PLIO, peldano, nombreNivel, etiquetaNivel, type NivelPlio, type PartePlio } from '@/lib/pliometria'
import {
  CRITERIOS, recomendar, recomendadoParaGuardar, escalonesActuales, contactosParaEmpezar, rsiDe, limiteDe,
  hayEvaluacion, criteriosEnUnaFrase,
  type Comprobaciones, type CriterioEvaluado, type Criterio, type Recomendacion, type EstadoCriterio,
} from '@/lib/pliometria-escalon'
import { cargarSaltos, ponerEscalon, guardarComprobaciones, type SaltosDeportista as Carga } from '@/lib/pliometria-escalon-datos'
import LetraNivel from './LetraNivel'

/*
 * LA PESTAÑA «SALTOS» DE LA FICHA. El nivel lo pone el entrenador, en cada
 * parte del cuerpo, y lo cambia cuando quiera; la app solo recomienda, con la
 * evaluación que él quiera rellenar (lib/pliometria-escalon). Todo es opcional:
 * sin nivel puesto, el resto de la app funciona como siempre. Se enseña el
 * número (Nivel 1-5) y lo que añade; por dentro se guarda a-e.
 */

/* Tras dos puntos, en minúscula; las siglas (RSI, CMJ) se quedan. */
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const trasDosPuntos = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const coma = (n: number, dec = 1) => n.toFixed(dec).replace('.', ',').replace(/,0+$/, '')
const MARCA: Record<EstadoCriterio, string> = { si: '✓', no: '✕', sin: '·', na: '–' }
const TIPO = { obligatorio: 'Obligatorio', orientativo: 'Orientativo', dato: 'Dato', 'solo si': 'Solo si aplica' } as const

/* Lo que el entrenador sabe de él y la app no. */
const LO_QUE_SABES: { id: 'dolor' | 'creciendo' | 'rodilla' | 'unilateral' | 'fuerzaFuera'; texto: string }[] = [
  { id: 'dolor', texto: 'Ahora le duele un tendón (Aquiles, rotuliano) o tiene una lesión de pierna' },
  { id: 'creciendo', texto: 'Aún está creciendo (placas de crecimiento abiertas)' },
  { id: 'rodilla', texto: 'Máster con la rodilla operada o con desgaste articular' },
  { id: 'unilateral', texto: 'Tuvo una lesión de una sola pierna' },
  { id: 'fuerzaFuera', texto: 'Hace la fuerza fuera de la app' },
]

export default function SaltosDeportista({ idDeportista }: { idDeportista: number }) {
  const [carga, setCarga] = useState<Carga | null>(null)
  const [yo, setYo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<PartePlio | null>(null)
  /* Las evaluaciones se guardan en fila: dos clics seguidos no pueden llegar al revés. */
  const cola = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let vivo = true
    Promise.all([cargarSaltos(supabase, idDeportista), usuarioActual()]).then(([c, u]) => {
      if (!vivo) return
      setCarga(c)
      setYo(u?.id ?? null)
    })
    return () => { vivo = false }
  }, [idDeportista])

  if (!carga) return <div className="text-gray-500 text-sm py-8 text-center">Cargando sus saltos…</div>

  const cambiarEscalon = async (parte: PartePlio, valor: string) => {
    setGuardando(parte)
    const { fila, error } = await ponerEscalon(supabase, idDeportista, parte, valor || null,
      parte === 'inferior' ? recomendadoParaGuardar(recomendar(carga.comprobaciones, carga.datos)) : null)
    setGuardando(null)
    if (error || !fila) { alert(error || 'No se ha podido guardar el nivel.'); return }
    setCarga(x => (x ? { ...x, historial: [fila, ...x.historial] } : x))
  }

  const cambiarComprobaciones = (cambio: (prev: Comprobaciones) => Comprobaciones) => {
    const antes = carga.comprobaciones
    const nuevas = cambio(antes)
    setCarga(x => (x ? { ...x, comprobaciones: nuevas } : x))
    cola.current = cola.current.then(async () => {
      const error = await guardarComprobaciones(supabase, idDeportista, nuevas)
      if (error) {
        alert(error)
        setCarga(x => (x ? { ...x, comprobaciones: antes } : x))
      }
    })
  }

  return <SaltosVista carga={carga} yo={yo} guardando={guardando} idDeportista={idDeportista}
    onEscalon={cambiarEscalon} onComprobaciones={cambiarComprobaciones} />
}

/**
 * Lo que se ve, sin cargar ni guardar nada: recibe los datos y avisa de los
 * cambios. Separado para poder mirarlo con datos de ejemplo.
 */
export function SaltosVista({ carga, yo, guardando, idDeportista, onEscalon, onComprobaciones }: {
  carga: Carga
  yo: string | null
  guardando: PartePlio | null
  idDeportista: number
  onEscalon: (parte: PartePlio, valor: string) => void
  onComprobaciones: (cambio: (prev: Comprobaciones) => Comprobaciones) => void
}) {
  const c = carga.comprobaciones
  const d = carga.datos
  const r = recomendar(c, d)
  const actuales = escalonesActuales(carga.historial)
  const cambiarEscalon = onEscalon
  const cambiarComprobaciones = onComprobaciones

  /** Sí, no o sin mirar: pulsar el que ya está marcado lo deja sin mirar. */
  const marcar = (id: keyof Comprobaciones, v: boolean) => cambiarComprobaciones(prev => {
    const n = { ...prev }
    if (prev[id] === v) delete n[id]
    else (n as Record<string, unknown>)[id] = v
    return n
  })

  return (
    <div className="flex flex-col gap-5">
      {carga.error && (
        <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          No se ha podido leer todo lo de sus saltos: {carga.error}
        </p>
      )}

      {/* ═══ SU ESCALÓN: lo decide el entrenador ═══ */}
      <section className="tp-card p-5 flex flex-col gap-1">
        <h3 className="font-semibold text-[15px]">Su nivel de pliometría</h3>
        <p className="text-gray-500 text-xs mb-2">
          Lo pones tú y lo cambias cuando quieras. La app solo recomienda. Cada nivel incluye los de abajo. Sin nivel puesto, todo funciona como siempre;
          con él, al prescribir se marcan los saltos que están por encima.
        </p>
        {PARTES_PLIO.map(p => {
          const actual = actuales[p.id]
          const rec = p.id === 'inferior' && r.tipo === 'escalon' ? r.escalon : null
          const fila = actual.fila
          return (
            <div key={p.id} className="grid grid-cols-1 md:grid-cols-[120px_minmax(0,350px)_minmax(0,1fr)] gap-x-4 gap-y-2 items-center py-3 border-t border-gray-800 first:border-t-0">
              <span className="font-semibold text-[13.5px]">{p.nombre}</span>
              <select value={actual.escalon ?? ''} disabled={guardando === p.id}
                onChange={e => cambiarEscalon(p.id, e.target.value)}
                aria-label={'Nivel de ' + p.nombre.toLowerCase()}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50">
                <option value="">Sin poner</option>
                {NIVELES_PLIO.map(k => <option key={k} value={k}>{etiquetaNivel(p.id, k)}</option>)}
              </select>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-gray-400 min-w-0">
                {p.id !== 'inferior' ? (
                  <span>Sin recomendación: en esta parte los criterios los compruebas tú.</span>
                ) : r.tipo === 'sin-datos' ? (
                  <span>{hayEvaluacion(c)
                    ? 'A la app le falta mirar algo para recomendar: lo ves en «Lo que recomienda la app».'
                    : 'Sin evaluación, la app no recomienda nada.'}</span>
                ) : r.tipo === 'no-salta' ? (
                  <span>La app recomienda <b className="text-gray-200">no saltar todavía</b>.</span>
                ) : r.tipo === 'aterrizajes' ? (
                  <span>La app recomienda <b className="text-gray-200">empezar por los aterrizajes</b>, antes del nivel 1.</span>
                ) : rec && (
                  <>
                    <span className="inline-flex items-center gap-1.5 flex-wrap">La app recomienda <LetraNivel nivel={rec} /> <b className="text-gray-200">{nombreNivel(rec)}</b> · {peldano('inferior', rec).anade}</span>
                    {actual.escalon === rec
                      ? <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-200">Coincide</span>
                      : <button type="button" onClick={() => cambiarEscalon('inferior', rec)} disabled={guardando === 'inferior'}
                          className="text-xs font-semibold px-3 py-1 rounded-lg border border-orange-500/50 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition disabled:opacity-50">
                          Ponerlo en el {nombreNivel(rec).toLowerCase()}
                        </button>}
                    {actual.escalon && actual.escalon !== rec && (
                      <span className="basis-full text-xs">
                        {NIVELES_PLIO.indexOf(actual.escalon) > NIVELES_PLIO.indexOf(rec)
                          ? 'Lo tienes por encima de lo que recomienda la app. Es decisión tuya; abajo ves lo que la app no ha podido confirmar.'
                          : 'Lo tienes por debajo de lo que recomienda la app. Es decisión tuya; la app no lo cambia.'}
                      </span>
                    )}
                  </>
                )}
                {fila && (
                  <span className="basis-full text-[11.5px] text-gray-500">
                    Último cambio: {fechaCorta(fila.puesto_en)}, {fila.puesto_por && fila.puesto_por === yo ? 'por ti' : 'por otra persona que lo lleva'}
                    {fila.recomendado ? '; la app recomendaba ' + (NIVELES_PLIO.includes(fila.recomendado as NivelPlio) ? 'el ' + nombreNivel(fila.recomendado as NivelPlio).toLowerCase() : fila.recomendado === 'aterrizajes' ? 'los aterrizajes' : 'no saltar') : ''}.
                  </span>
                )}
              </div>
            </div>
          )
        })}
        <details className="mt-1 text-xs text-gray-400">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Qué pide cada nivel</summary>
          <TablaEscalones />
        </details>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-5 items-start">
        {/* ═══ LA EVALUACIÓN: opcional ═══ */}
        <section className="tp-card p-5 flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-[15px]">Evaluación de entrada</h3>
            <p className="text-gray-500 text-xs">Opcional: rellena lo que quieras. Con lo que haya, la app recomienda.</p>
          </div>
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            <p className="text-[11.5px] text-gray-500">Lo que sale solo de la app</p>
            <Dato texto="Peso" valor={d.peso != null ? coma(d.peso) + ' kg' : null} donde="en su anamnesis" />
            <Dato texto="Sentadilla 1RM" valor={d.sentadilla != null ? coma(d.sentadilla) + ' kg' + (d.peso ? ' · ' + coma(d.sentadilla / d.peso, 2) + ' × su peso' : '') : null} fecha={d.fechas?.sentadilla} donde="en sus tests de fuerza" />
            <Dato texto="CMJ" valor={d.cmj != null ? coma(d.cmj) + ' cm' : null} fecha={d.fechas?.cmj} donde="con el test «Saltos: SJ y CMJ»" />
            <Dato texto="Drop jump" valor={d.contacto != null && d.caja != null ? d.caja + ' cm · ' + d.contacto + ' ms' + (rsiDe(d) != null ? ' · RSI ' + coma(rsiDe(d) as number, 2) : '') : null} fecha={d.fechas?.dropjump} donde="con el test «Drop Jump»" />
            <Dato texto="Semanas con fuerza" valor={d.semanasFuerza + ' de las 4 últimas'} />
            <Link href={'/tests/' + idDeportista} className="self-start text-xs text-orange-400 hover:text-orange-300 mt-1">Medir en Tests →</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[11.5px] text-gray-500">Lo que sabes tú y la app no</p>
            {LO_QUE_SABES.map(m => (
              <label key={m.id} className="flex items-start gap-2 text-[12.5px] text-gray-200 cursor-pointer">
                <input type="checkbox" checked={c[m.id] === true} onChange={() => marcar(m.id, true)}
                  className="mt-0.5 accent-orange-500 w-4 h-4 flex-none" />
                {m.texto}
              </label>
            ))}
            {c.unilateral === true && (
              <Asimetria valor={c.asimetria} onCambio={v => cambiarComprobaciones(prev => {
                const n = { ...prev }
                if (v == null) delete n.asimetria
                else n.asimetria = v
                return n
              })} />
            )}
          </div>
          <p className="text-[11.5px] text-gray-500">
            {carga.evaluadaEn ? 'Evaluación guardada el ' + fechaCorta(carga.evaluadaEn) + '. ' : ''}
            Lo que solo puedes ver tú, como cómo aterriza, se marca en cada nivel de la escalera: Sí, No, o nada si no lo has mirado.
          </p>
        </section>

        <div className="flex flex-col gap-5 min-w-0">
          <Resultado r={r} c={c} d={d} />

          {/* ═══ LA ESCALERA ═══ */}
          <section className="tp-card p-5 flex flex-col gap-2.5">
            <h3 className="font-semibold text-[15px]">La escalera del tren inferior</h3>
            {[...NIVELES_PLIO].reverse().map(k => (
              <Escalon key={k} k={k} c={c} d={d}
                puesto={actuales.inferior.escalon === k}
                recomendado={r.tipo === 'escalon' && r.escalon === k}
                fueraDeLimite={!!limiteDe(c) && NIVELES_PLIO.indexOf(k) > NIVELES_PLIO.indexOf(limiteDe(c)!.tope)}
                marcar={marcar} />
            ))}
            <Escalon k="pre" c={c} d={d} puesto={false} recomendado={false} fueraDeLimite={false} marcar={marcar} />
            <p className="text-[11.5px] text-gray-400 bg-black/20 rounded-lg px-3 py-2">
              Para <b className="text-gray-200">subir</b> de nivel: cumplir lo que pide el siguiente y dominar el suyo, es decir,
              <b className="text-gray-200"> cinco repeticiones seguidas sin errores en vídeo de perfil y sin dolor al día siguiente</b>.
              La app lo propone; el cambio lo haces tú.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

function Dato({ texto, valor, fecha, donde }: { texto: string; valor: string | null; fecha?: string; donde?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-gray-400">{texto}</span>
      {valor != null
        ? <span className="text-gray-100 tabular-nums text-right">{valor}{fecha && <span className="text-gray-500"> · {fechaCorta(fecha)}</span>}</span>
        : <span className="text-gray-500 text-right">Sin medir{donde ? ' (' + donde + ')' : ''}</span>}
    </div>
  )
}

function Asimetria({ valor, onCambio }: { valor: number | undefined; onCambio: (v: number | null) => void }) {
  const [texto, setTexto] = useState(valor != null ? String(valor).replace('.', ',') : '')
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-gray-300 pl-6">
      Diferencia entre piernas en el salto horizontal a una pierna:
      <input type="text" inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)}
        onBlur={() => {
          const n = Number(texto.replace(',', '.'))
          onCambio(texto.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n)
        }}
        className="w-16 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm text-white tabular-nums" placeholder="—" />
      %
    </label>
  )
}

function Resultado({ r, c, d }: { r: Recomendacion; c: Comprobaciones; d: Carga['datos'] }) {
  const linea = (x: CriterioEvaluado, extra?: string) => (
    <li key={x.criterio.id}>
      {x.criterio.texto}{x.criterio.dice ? ': ' + trasDosPuntos(x.criterio.dice(c, d)) : x.criterio.ayuda ? '. ' + x.criterio.ayuda : '.'}
      {extra && <span className="text-gray-500"> ({extra})</span>}
    </li>
  )
  const marco = 'rounded-2xl border px-5 py-4 flex flex-col gap-2 '
  if (r.tipo === 'no-salta') return (
    <section className={marco + 'border-red-400/50 bg-red-400/10'} aria-live="polite">
      <p className="text-xs uppercase tracking-wider text-gray-400">Lo que recomienda la app</p>
      <p className="text-xl font-bold">Todavía no salta</p>
      <ul className="list-disc pl-5 text-[12.5px] text-gray-300">{r.no.map(x => linea(x))}</ul>
    </section>
  )
  if (r.tipo === 'sin-datos') return (
    <section className={marco + 'border-dashed border-gray-600 bg-gray-900/60'} aria-live="polite">
      <p className="text-xs uppercase tracking-wider text-gray-400">Lo que recomienda la app</p>
      <p className="text-xl font-bold">Sin recomendación</p>
      <p className="text-[13px] text-gray-300">{hayEvaluacion(c)
        ? 'Le falta mirar algo para poder recomendar; mientras, vale el nivel que le pongas. Falta:'
        : 'No hay evaluación, así que vale el nivel que le pongas. Para que la app recomiende, empieza por mirar:'}</p>
      <ul className="list-disc pl-5 text-[12.5px] text-gray-300">{r.sinMirar.map(x => linea(x))}</ul>
    </section>
  )
  if (r.tipo === 'aterrizajes') return (
    <section className={marco + 'border-amber-400/50 bg-amber-400/10'} aria-live="polite">
      <p className="text-xs uppercase tracking-wider text-gray-400">Lo que recomienda la app</p>
      <p className="text-xl font-bold">Antes del nivel 1: aterrizajes</p>
      <p className="text-[13px] text-gray-200">Caídas controladas a dos pies desde 20–30 cm, sin rebote, en silencio y aguantando dos segundos. Con rebote cuando le salgan cinco limpias seguidas.</p>
      <p className="text-xs font-semibold text-gray-200">Para el nivel 1 le falta</p>
      <ul className="list-disc pl-5 text-[12.5px] text-gray-300">{r.no.map(x => linea(x))}{r.sinMirar.map(x => linea(x, 'sin mirar'))}</ul>
    </section>
  )
  return (
    <section className={marco + 'border-emerald-400/45 bg-emerald-400/10'} aria-live="polite">
      <p className="text-xs uppercase tracking-wider text-gray-400">Lo que recomienda la app</p>
      <p className="text-xl font-bold flex items-center gap-2.5"><LetraNivel nivel={r.escalon} /> {nombreNivel(r.escalon)} · {peldano('inferior', r.escalon).anade}</p>
      <p className="text-[13px] text-gray-200">
        Si lo pones aquí, arranca en el suelo de su rango: <b>{contactosParaEmpezar(r.escalon)} contactos por sesión</b> de este nivel
        {r.escalon === 'c' && d.caja ? ', con el cajón de ' + d.caja + ' cm' : ''}.
      </p>
      {r.limite && (<><p className="text-xs font-semibold text-gray-200">No pasa de aquí</p><p className="text-[12.5px] text-gray-300">{r.limite}</p></>)}
      {r.siguiente && (r.no.length + r.sinMirar.length + r.orientativoSiguiente.length > 0) && (
        <>
          <p className="text-xs font-semibold text-gray-200">{r.no.length ? 'Para el ' + nombreNivel(r.siguiente).toLowerCase() + ' le falta' : 'Para saber si llega al ' + nombreNivel(r.siguiente).toLowerCase() + ', falta mirar'}</p>
          <ul className="list-disc pl-5 text-[12.5px] text-gray-300">
            {r.no.map(x => linea(x))}
            {r.sinMirar.map(x => linea(x, 'sin mirar'))}
            {r.orientativoSiguiente.map(x => linea(x, 'orientativo'))}
          </ul>
        </>
      )}
      {!r.siguiente && !r.limite && <p className="text-xs text-gray-300">Es el último nivel.</p>}
      {r.ojo.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-200">Ojo</p>
          <ul className="list-disc pl-5 text-[12.5px] text-gray-300">
            {r.ojo.map((o, i) => o.criterio ? linea(o.criterio, 'orientativo: no frena') : <li key={'t' + i}>{o.texto}</li>)}
          </ul>
        </>
      )}
    </section>
  )
}

function Escalon({ k, c, d, puesto, recomendado, fueraDeLimite, marcar }: {
  k: 'pre' | NivelPlio
  c: Comprobaciones
  d: Carga['datos']
  puesto: boolean
  recomendado: boolean
  fueraDeLimite: boolean
  marcar: (id: keyof Comprobaciones, v: boolean) => void
}) {
  const p = k === 'pre' ? null : peldano('inferior', k)
  const borde = puesto ? 'border-orange-500 shadow-[inset_0_0_0_1px_rgba(249,115,22,.35)]'
    : recomendado ? 'border-emerald-400/60 border-dashed' : 'border-gray-800'
  return (
    <div className={'rounded-xl border bg-gray-900/60 px-3 py-2.5 flex flex-col gap-1.5 ' + borde + (fueraDeLimite ? ' opacity-60' : '')}>
      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1">
        {k === 'pre'
          ? <span className="inline-grid place-items-center w-[22px] h-[22px] rounded-[7px] bg-gray-800 border border-gray-700 text-gray-300 text-xs">·</span>
          : <LetraNivel nivel={k} />}
        <b className="text-[13.5px]">{p && k !== 'pre' ? <>{nombreNivel(k)} <span className="font-normal text-gray-300">· {p.anade}</span></> : 'Antes de cualquier salto'}</b>
        {puesto && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300">Lo has puesto aquí</span>}
        {recomendado && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-200">Recomienda la app</span>}
        {fueraDeLimite && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-400/10 text-red-200">Fuera de su límite</span>}
        {p?.rango && <span className="ml-auto text-[11px] text-gray-500 tabular-nums">{p.rango[0]}–{p.rango[1]} por sesión</span>}
      </div>
      <ul className="flex flex-col">
        {CRITERIOS[k].map(cr => <FilaCriterio key={cr.id} cr={cr} estado={cr.evaluar(c, d)} c={c} d={d} marcar={marcar} />)}
      </ul>
    </div>
  )
}

function FilaCriterio({ cr, estado, c, d, marcar }: {
  cr: Criterio
  estado: EstadoCriterio
  c: Comprobaciones
  d: Carga['datos']
  marcar: (id: keyof Comprobaciones, v: boolean) => void
}) {
  const color = estado === 'si' ? 'text-emerald-400'
    : estado === 'no' ? (cr.tipo === 'orientativo' ? 'text-amber-300' : 'text-red-400')
    : cr.tipo === 'dato' && estado === 'sin' ? 'text-amber-300' : 'text-gray-500'
  const pie = cr.dice ? cr.dice(c, d) + (cr.ayuda ? ' ' + cr.ayuda : '')
    : (estado === 'sin' && cr.comprobacion ? 'Sin mirar. ' : '') + (cr.ayuda || '')
  const de = cr.de === 'tu' ? 'Lo compruebas tú' : cr.deTexto || 'App'
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] sm:grid-cols-[18px_minmax(0,1fr)_auto] gap-x-2 gap-y-1 py-1.5 border-t border-gray-800 text-[12.5px]">
      <span className={'font-bold text-center ' + color} aria-hidden="true">{MARCA[estado]}</span>
      <span className="text-gray-200 min-w-0">
        {cr.texto}
        {pie && <small className="block text-gray-500 text-[11.5px]">{pie}</small>}
      </span>
      <span className="col-start-2 sm:col-start-3 flex items-center sm:justify-end gap-1.5 flex-wrap self-start">
        {cr.comprobacion && (
          <span className="inline-flex rounded-md border border-gray-700 overflow-hidden" role="group" aria-label={cr.texto}>
            <button type="button" aria-pressed={c[cr.comprobacion] === true} onClick={() => marcar(cr.comprobacion!, true)}
              className={'px-2.5 py-0.5 text-[11.5px] ' + (c[cr.comprobacion] === true ? 'bg-emerald-400/15 text-emerald-200' : 'text-gray-400 hover:text-white')}>Sí</button>
            <button type="button" aria-pressed={c[cr.comprobacion] === false} onClick={() => marcar(cr.comprobacion!, false)}
              className={'px-2.5 py-0.5 text-[11.5px] border-l border-gray-700 ' + (c[cr.comprobacion] === false ? 'bg-red-400/15 text-red-200' : 'text-gray-400 hover:text-white')}>No</button>
          </span>
        )}
        <span className={'text-[10.5px] font-semibold px-2 py-px rounded-full whitespace-nowrap ' +
          (cr.de === 'tu' ? 'bg-orange-500/15 text-orange-300' : cr.de === 'test' ? 'bg-sky-400/10 text-sky-300' : 'bg-white/5 text-gray-400')}>{de}</span>
        <span className="text-[10.5px] text-gray-500">{TIPO[cr.tipo]}</span>
      </span>
    </li>
  )
}

/*
 * Lo que pide cada nivel en las tres partes. El tren inferior sale de los
 * mismos criterios que la escalera (criteriosEnUnaFrase), así que no puede
 * decir otra cosa que lo que se marca abajo. El superior y el tronco son los
 * de la maqueta: ahí la app no recomienda y los comprueba el entrenador.
 */
function TablaEscalones() {
  const filas: [NivelPlio, string, string][] = [
    ['a', 'Sin dolor de hombro ni de codo.', 'Aguanta el puente lateral y los extensores sin perder la alineación.'],
    ['b', 'Lanza el pase sentado a máxima velocidad sin que se le rompa el gesto.', 'Domina el pase rotacional sentado.'],
    ['c', 'Diez flexiones completas seguidas con el cuerpo alineado.', 'El gesto es estable: gira desde la cadera, no desde los brazos.'],
    ['d', 'Domina los de dos manos, con el hombro estable y sin dolor.', 'Domina la rotación de pie, sin dolor lumbar.'],
    ['e', 'Gesto estable en todo lo anterior.', 'Gesto estable en todo lo anterior.'],
  ]
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full min-w-[760px] text-[12px]">
        <thead>
          <tr className="text-gray-500 text-[10.5px] uppercase tracking-wider">
            <th className="text-left font-semibold py-1.5 pr-2">Nivel</th>
            <th className="text-left font-semibold py-1.5 pr-3">Tren inferior: para empezar aquí</th>
            <th className="text-left font-semibold py-1.5 pr-3">Tren superior: para empezar aquí</th>
            <th className="text-left font-semibold py-1.5">Tronco: para empezar aquí</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-800 align-top">
            <td className="py-1.5 pr-2 text-gray-500">Antes</td>
            <td className="py-1.5 pr-3"><b className="text-gray-200">Antes de cualquier salto.</b> {criteriosEnUnaFrase('pre')}</td>
            <td className="py-1.5 pr-3 text-gray-500">—</td>
            <td className="py-1.5 text-gray-500">—</td>
          </tr>
          {filas.map(([k, sup, tro]) => (
            <tr key={k} className="border-t border-gray-800 align-top">
              <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-1.5"><LetraNivel nivel={k} pequena /></span></td>
              <td className="py-1.5 pr-3">
                <b className="text-gray-200">{mayuscula(peldano('inferior', k).anade)}.</b> {criteriosEnUnaFrase(k)}
                <span className="block text-gray-500">{peldano('inferior', k).rango?.[0]}–{peldano('inferior', k).rango?.[1]} contactos por sesión.</span>
              </td>
              <td className="py-1.5 pr-3"><b className="text-gray-200">{mayuscula(peldano('superior', k).anade)}.</b> {sup}</td>
              <td className="py-1.5"><b className="text-gray-200">{mayuscula(peldano('tronco', k).anade)}.</b> {tro}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-gray-500">
        El tren inferior es el único que la app recomienda: cada criterio se marca abajo, en «La escalera del tren inferior».
        Quien aún crece, o es máster con la rodilla operada, no pasa del nivel 2. Para seguir el progreso del tren superior sirve
        el lanzamiento sentado de pecho, pero 20 o 30 cm de mejora son ruido.
      </p>
    </div>
  )
}
