'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { setAtletaActivo } from '@/lib/atletaActivo'
import { fechaCorta, hoyISO } from '@/lib/fechas'
import { nombreNivel, type NivelPlio } from '@/lib/pliometria'
import type { Comprobaciones } from '@/lib/pliometria-escalon'
import { decidirAvance, type EntradaAvance, type Veredicto, type Importancia, type AvisoMedir, type Condicion, type Variable } from '@/lib/pliometria-avance'
import { cargarAvance } from '@/lib/pliometria-avance-datos'
import { GraficaContactos, LeyendaContactos, MarcadorTest } from './GraficasSaltos'

/*
 * EL AVANCE EN LOS SALTOS, en su ficha (fase 2, maqueta validada el
 * 22-10-2026). Va debajo de «Su nivel de pliometría»: su nivel y lo que marca
 * el entrenador llegan de ahí, vivos, para que al cambiarlos la propuesta
 * cambie sin recargar. Lo demás (sus semanas, sus tests, su wellness) se pide
 * una vez (lib/pliometria-avance-datos). El motor, en lib/pliometria-avance.
 */

export default function AvanceSaltos({ idDeportista, nivel, puestoEn, comprobaciones, onComprobaciones, onNivel, guardandoNivel }: {
  idDeportista: number
  nivel: NivelPlio | null
  puestoEn: string | null
  comprobaciones: Comprobaciones
  onComprobaciones: (cambio: (prev: Comprobaciones) => Comprobaciones) => void
  onNivel: (k: NivelPlio) => void
  guardandoNivel: boolean
}) {
  const [base, setBase] = useState<EntradaAvance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let vivo = true
    cargarAvance(supabase, idDeportista)
      .then(b => { if (vivo) setBase(b) })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : String(e)) })
    return () => { vivo = false }
  }, [idDeportista])

  if (error) return <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">No se ha podido leer su avance en los saltos: {error}</p>
  if (!base) return <div className="text-gray-500 text-sm py-6 text-center">Mirando su avance…</div>

  return <AvanceSaltosVista base={base} idDeportista={idDeportista} nivel={nivel} puestoEn={puestoEn} comprobaciones={comprobaciones}
    onComprobaciones={onComprobaciones} onNivel={onNivel} guardandoNivel={guardandoNivel}
    onVolumen={() => { setAtletaActivo(idDeportista); router.push('/volumen?pestana=saltos') }} />
}

/**
 * Lo que se ve, sin leer ni guardar nada: recibe lo pedido a la base y avisa de
 * los cambios. Separado para poder mirarlo con datos de ejemplo.
 */
export function AvanceSaltosVista({ base, idDeportista, nivel, puestoEn, comprobaciones, onComprobaciones, onNivel, guardandoNivel, onVolumen }: {
  base: EntradaAvance
  idDeportista: number
  nivel: NivelPlio | null
  puestoEn: string | null
  comprobaciones: Comprobaciones
  onComprobaciones: (cambio: (prev: Comprobaciones) => Comprobaciones) => void
  onNivel: (k: NivelPlio) => void
  guardandoNivel: boolean
  onVolumen: () => void
}) {
  const v = decidirAvance({ ...base, nivel, puestoEn, comprobaciones })
  const irAVolumen = onVolumen
  const propuesta = v.prox != null && v.clase !== 'neutro' && v.clase !== 'sin-nivel' ? v.prox * v.sesionesSemana : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap -mb-2">
        <h3 className="font-semibold text-[15px]">Su avance en los saltos</h3>
        <button type="button" onClick={irAVolumen} className="text-xs font-semibold text-orange-400 hover:text-orange-300">
          Ver semana a semana en Volumen y carga →
        </button>
      </div>

      <BandaDeporte imp={v.imp} onCambio={valor => onComprobaciones(prev => {
        const n = { ...prev }
        if (valor == null) delete n.necesita
        else n.necesita = valor
        return n
      })} />

      {v.medir.length > 0 && <BandaMedir avisos={v.medir} idDeportista={idDeportista} proxima={base.proximaSaltos} />}

      <TarjetaVeredicto v={v} nivel={nivel} guardandoNivel={guardandoNivel} onNivel={onNivel}
        onDomina={si => onComprobaciones(prev => {
          const n = { ...prev }
          if (si && nivel) n.domina = nivel
          else delete n.domina
          return n
        })} />

      {nivel && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-5 items-start">
          <section className="tp-card p-5 flex flex-col gap-3 min-w-0">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h3 className="font-semibold text-[15px]">Contactos por semana</h3>
              <span className="text-xs text-gray-500">de pie, por nivel; de esta semana, lo que lleva prescrito</span>
            </div>
            <GraficaContactos semanas={base.semanas} propuesta={propuesta} nombre="este deportista" />
            <LeyendaContactos semanas={base.semanas} conPropuesta={propuesta != null} />
          </section>
          <div className="flex flex-col gap-5 min-w-0">
            <Condiciones cond={v.cond} />
            <section className="tp-card p-5 flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-[15px]">Sus tests de salto</h3>
                <Link href={'/tests/' + idDeportista} className="text-xs text-orange-400 hover:text-orange-300">Sus tests →</Link>
              </div>
              <MarcadorTest nombre="CMJ" serie={base.cmj} t={v.cmj} unidad=" cm" dec={1}
                vacio="El test «Saltos: SJ y CMJ» le da su base. Con repetirlo cada 2–4 semanas se ve si mejora de verdad o si acumula fatiga." />
              <MarcadorTest nombre="RSI" serie={base.rsi} t={v.rsi} dec={2}
                vacio="El «Drop Jump» da su RSI y su tiempo de contacto. Hace falta desde el nivel 3: decide la altura de caída." />
              <p className="text-[11.5px] text-gray-500">
                La banda gris es su base (la mediana de sus tests anteriores) ± el error de medida, un 3 %. Es mejora de verdad si sus dos
                últimos tests pasan de ella, y fatiga si el último cae por debajo. Un test de hace más de 4 semanas ya no cuenta.
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Para su deporte
// ------------------------------------------------------------

const PUNTOS: Record<Importancia['tipo'], string[]> = {
  corre: [
    '**Le sirven para correr:** mejoran la economía de carrera, sobre todo a ritmos más lentos de 5:00 min/km (12 km/h), y la rigidez del tendón.',
    '**Pero son impacto, como los kilómetros.** Si una semana sube mucho su carrera, los saltos esperan.',
    '**Lo habitual:** 60–100 contactos por sesión, una o dos veces por semana, antes de la fatiga.',
  ],
  pedalea: [
    '**Para pedalear no aportan:** en ciclistas la evidencia es pobre y no mejoran la economía. La potencia se la da la fuerza pesada, que además no tiene impacto.',
    '**Salvo si esprinta** (pista, criterium, BTT): ahí sí mejoran los arranques. Si es su caso, marca «Sí, los necesita».',
    '**Si los hace igual,** que sea poco: 60–100 contactos, una vez por semana. La app no propone subir.',
  ],
  nada: [
    '**Los saltos de piernas solo cuentan en las salidas y los virajes de piscina,** que son un salto. En aguas abiertas no hay virajes.',
    '**Los lanzamientos con balón medicinal sí le sirven:** dan potencia al tren superior y a la salida.',
    '**Si nada en piscina y quieres trabajar las salidas,** marca «Sí, los necesita».',
  ],
  'sin-saber': [
    'No tiene disciplinas marcadas en su ficha ni sesiones en las últimas semanas. Márcalas en «Entrenamiento», o decide aquí.',
    'Mientras tanto, la app hace como si los necesitara.',
  ],
}

const TITULO: Record<Importancia['tipo'], [string, string, string]> = {
  corre: ['Para su deporte, los saltos son importantes', 'Importantes', 'bg-emerald-400/10 text-emerald-200'],
  pedalea: ['Para su deporte, los saltos no hacen falta', 'No le hacen falta', 'bg-white/5 text-gray-300'],
  nada: ['Para nadar, los de piernas no hacen falta; los lanzamientos, sí', 'Solo el tren superior', 'bg-amber-400/10 text-amber-200'],
  'sin-saber': ['No sé su deporte', 'Sin saber su deporte', 'bg-white/5 text-gray-300'],
}

/** «**negrita** resto»: el principio de cada punto, en negrita. */
function Punto({ texto }: { texto: string }) {
  const m = /^\*\*(.+?)\*\*(.*)$/.exec(texto)
  return <li className="pl-3.5 relative before:absolute before:left-0 before:top-[0.6em] before:w-[5px] before:h-[5px] before:rounded-full before:bg-gray-500">
    {m ? <><b className="text-gray-100 font-semibold">{m[1]}</b>{m[2]}</> : texto}
  </li>
}

function BandaDeporte({ imp, onCambio }: { imp: Importancia; onCambio: (v: boolean | null) => void }) {
  const [titulo, chip, colorChip] = TITULO[imp.tipo]
  const contraLaApp = imp.decidido && imp.necesita !== imp.segunApp
  const segun = imp.fuente === 'disciplinas' ? 'Según sus disciplinas de la ficha'
    : imp.fuente === 'sesiones' ? 'Según sus sesiones de las últimas semanas (no tiene disciplinas marcadas)'
    : 'Sin disciplinas marcadas ni sesiones recientes'
  const valor = imp.decidido ? (imp.necesita ? 'si' : 'no') : 'app'
  const borde = imp.necesita ? (imp.tipo === 'nada' && !imp.decidido ? 'border-amber-400/35' : 'border-emerald-400/40') : 'border-white/15'
  const opcion = (k: 'app' | 'si' | 'no', t: string, v: boolean | null) => (
    <button key={k} type="button" aria-pressed={valor === k} onClick={() => onCambio(v)}
      className={'px-3 py-1.5 rounded-lg text-[12.5px] transition ' + (valor === k ? 'bg-orange-500/15 text-white shadow-[inset_0_0_0_1px_rgba(249,115,22,.5)]' : 'text-gray-400 hover:text-white')}>
      {t}
    </button>
  )
  return (
    <section className={'rounded-2xl border bg-gray-900/70 px-5 py-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-3 items-start ' + borde}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[16px] font-bold tracking-tight">
            {contraLaApp ? (imp.necesita ? 'Los necesita: lo has decidido tú' : 'No los necesita: lo has decidido tú') : titulo}
          </span>
          <span className={'text-[11.5px] font-semibold px-2 py-0.5 rounded-full ' + (imp.decidido ? (imp.necesita ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/5 text-gray-300') : colorChip)}>
            {imp.decidido ? (imp.necesita ? 'Los necesita' : 'No los necesita') + ' · lo has decidido tú' : chip}
          </span>
        </div>
        <p className="text-[12.5px] text-gray-400 mt-0.5">{segun}{contraLaApp ? '. Por su deporte, la app diría:' : ''}</p>
        <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px] text-gray-400 max-w-[86ch]">
          {PUNTOS[imp.tipo].map(p => <Punto key={p} texto={p} />)}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5 items-start">
        <span className="text-xs text-gray-500" id="eti-necesita">¿Los necesita?</span>
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-gray-950/60 border border-white/10" role="group" aria-labelledby="eti-necesita">
          {opcion('app', 'Según su deporte', null)}
          {opcion('si', 'Sí, los necesita', true)}
          {opcion('no', 'No los necesita', false)}
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------
// Toca medir
// ------------------------------------------------------------

function BandaMedir({ avisos, idDeportista, proxima }: { avisos: AvisoMedir[]; idDeportista: number; proxima: string | null }) {
  const fecha = proxima ?? hoyISO()
  return (
    <section className="rounded-2xl border border-amber-400/45 bg-amber-400/[0.08] px-5 py-4 flex flex-col gap-2.5" aria-live="polite">
      <p className="text-xs uppercase tracking-wider font-semibold text-amber-200">Toca medir</p>
      <ul className="flex flex-col gap-1">
        {avisos.map(a => <li key={a.test} className="text-[13px] text-gray-100">{a.texto} <span className="text-gray-400">{a.porque}</span></li>)}
      </ul>
      <p className="text-[12.5px] text-gray-400 max-w-[90ch]">
        <b className="text-gray-200">Cuándo y cómo:</b> al principio de su próxima sesión de saltos{proxima ? ' (el ' + fechaCorta(proxima) + ')' : ''}, en
        fresco, a la misma hora y con el mismo aparato que la vez anterior. Con repetirlo cada 2–4 semanas basta: no hace falta cada semana.
      </p>
      <div className="flex flex-wrap gap-2">
        {avisos.map(a => (
          <Link key={a.test} href={'/tests/dirigir?test=' + a.test + '&dep=' + idDeportista + '&fecha=' + fecha}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-orange-500/55 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition">
            Medir {a.nombre}{proxima ? ' el ' + fechaCorta(proxima) : ''} →
          </Link>
        ))}
      </div>
    </section>
  )
}

// ------------------------------------------------------------
// La semana que viene
// ------------------------------------------------------------

const MARCO: Record<Veredicto['clase'], string> = {
  bien: 'border-emerald-400/45 bg-emerald-400/[0.08]',
  ambar: 'border-amber-400/45 bg-amber-400/[0.08]',
  rojo: 'border-red-400/50 bg-red-400/[0.08]',
  neutro: 'border-white/15 bg-gray-900/70',
  'sin-nivel': 'border-dashed border-gray-600 bg-gray-900/60',
}
const CHIP: Record<Variable['e'], string> = {
  sube: 'bg-emerald-400/10 text-emerald-200',
  espera: 'bg-amber-400/10 text-amber-200',
  no: 'bg-red-400/10 text-red-200',
  gris: 'bg-white/5 text-gray-400',
}
const MARCA_REQ = { si: ['✓', 'text-emerald-400'], no: ['✕', 'text-red-400'], sin: ['·', 'text-gray-500'], na: ['–', 'text-gray-500'] } as const

function TarjetaVeredicto({ v, nivel, guardandoNivel, onNivel, onDomina }: {
  v: Veredicto
  nivel: NivelPlio | null
  guardandoNivel: boolean
  onNivel: (k: NivelPlio) => void
  onDomina: (si: boolean) => void
}) {
  const domina = v.pide.find(r => r.id === 'domina')
  return (
    <section className={'rounded-2xl border px-5 py-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-3 items-center ' + MARCO[v.clase]} aria-live="polite">
      <div className="min-w-0 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wider text-gray-400">La semana que viene</p>
        <p className="text-xl font-bold tracking-tight">{v.accion}</p>
        <p className="text-[13.5px] text-gray-200">{v.detalle}</p>
        <p className="text-[12.5px] text-gray-400">{v.porque}</p>
        {v.pasarA && (
          <div className="mt-1.5">
            <button type="button" onClick={() => onNivel(v.pasarA as NivelPlio)} disabled={guardandoNivel}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-orange-500/55 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition disabled:opacity-50">
              Ponerlo en el {nombreNivel(v.pasarA).toLowerCase()}
            </button>
          </div>
        )}
        {nivel && v.siguiente && v.pide.length > 0 && !v.pasarA && (
          <div className="mt-2 rounded-xl bg-black/20 px-3.5 py-2.5 flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-gray-200">Para el {nombreNivel(v.siguiente).toLowerCase()}</p>
            <ul className="flex flex-col gap-1">
              {v.pide.filter(r => r.id !== 'domina').map(r => (
                <li key={r.id} className="text-[12.5px] text-gray-300 flex gap-2">
                  <span className={'w-3.5 text-center font-bold flex-none ' + MARCA_REQ[r.estado][1]} aria-hidden="true">{MARCA_REQ[r.estado][0]}</span>
                  <span>{r.texto}{!r.obliga && <span className="text-gray-500"> (orientativo)</span>}{r.estado === 'sin' && r.tuyo && <span className="text-gray-500"> · sin mirar</span>}</span>
                </li>
              ))}
            </ul>
            {domina && (
              <label className="flex items-start gap-2 text-[12.5px] text-gray-200 cursor-pointer mt-0.5">
                <input type="checkbox" checked={domina.estado === 'si'} onChange={e => onDomina(e.target.checked)}
                  className="mt-0.5 accent-orange-500 w-4 h-4 flex-none" />
                <span>{domina.texto}. <span className="text-gray-500">Lo confirmas tú: la app no lo ve.</span></span>
              </label>
            )}
            <p className="text-[11.5px] text-gray-500">Lo demás se marca en «La escalera del tren inferior», más abajo.</p>
          </div>
        )}
        {v.limite && <p className="text-[12px] text-gray-400 mt-1">{v.limite}</p>}
      </div>
      {v.clase !== 'sin-nivel' && (
        <div className="flex flex-col gap-1.5 md:min-w-[220px]" aria-label="Las tres cosas que pueden subir">
          {([['Volumen', v.vars.volumen], ['Nivel', v.vars.nivel], ['Altura de caída', v.vars.altura]] as const).map(([n, x]) => (
            <div key={n} className="flex items-center justify-between gap-2.5 text-[12.5px] px-2.5 py-1.5 rounded-lg bg-black/25">
              <span>{n}</span>
              <span className={'text-[11.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ' + CHIP[x.e]}>{x.t}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ------------------------------------------------------------
// Las condiciones
// ------------------------------------------------------------

const MARCA: Record<Condicion['m'], [string, string]> = {
  si: ['✓', 'text-emerald-400'], no: ['✕', 'text-red-400'], falta: ['!', 'text-amber-300'], nada: ['–', 'text-gray-500'],
}

function Condiciones({ cond }: { cond: Condicion[] }) {
  return (
    <section className="tp-card p-5 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="font-semibold text-[15px]">Las condiciones</h3>
        <span className="text-xs text-gray-500">de su última semana</span>
      </div>
      <ul className="flex flex-col">
        {cond.map(c => (
          <li key={c.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 py-2 border-t border-gray-800 first:border-t-0">
            <span className={'text-center font-bold ' + MARCA[c.m][1]} aria-hidden="true">{MARCA[c.m][0]}</span>
            <div className="min-w-0">
              <b className="text-[12.5px] font-semibold text-gray-200">{c.titulo}</b>
              {c.propuesta && <span className="ml-1.5 text-[10.5px] font-semibold px-1.5 py-px rounded-full bg-orange-500/15 text-orange-300">propuesta</span>}
              <p className="text-xs text-gray-400 mt-0.5">{c.texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
