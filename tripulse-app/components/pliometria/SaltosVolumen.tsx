'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fechaCorta } from '@/lib/fechas'
import { NIVELES_PLIO, peldano, nombreNivel, TOPE_NSCA } from '@/lib/pliometria'
import { decidirAvance, type EntradaAvance, type Veredicto } from '@/lib/pliometria-avance'
import { cargarAvance } from '@/lib/pliometria-avance-datos'
import { GraficaContactos, LeyendaContactos, GraficaSaltosCarrera, GraficaLanzamientos } from './GraficasSaltos'
import LetraNivel, { COLOR_NIVEL } from './LetraNivel'

/*
 * LA PESTAÑA «SALTOS» DE VOLUMEN Y CARGA: la película entera de sus saltos,
 * con el período de la página, junto a su carrera y sus lanzamientos. Lo que
 * decide (su nivel, las condiciones, sus tests) está en su ficha: el botón
 * «Ir a su ficha» lleva a su pestaña Saltos (pedido el 22-10-2026).
 */

const COLOR_CLASE: Record<Veredicto['clase'], string> = {
  bien: 'bg-emerald-400', ambar: 'bg-amber-400', rojo: 'bg-red-400', neutro: 'bg-gray-500', 'sin-nivel': 'bg-gray-500',
}

export default function SaltosVolumen({ deportista, rango }: { deportista: { id: number; nombre?: string | null }; rango: number }) {
  const router = useRouter()
  /* El período de la página, en semanas; «Todo», medio año. El motor mira siempre las 8 últimas. */
  const verSemanas = rango >= 365 ? 26 : Math.max(2, Math.round(rango / 7))
  const [carga, setCarga] = useState<{ clave: string; base: EntradaAvance | null; error?: string } | null>(null)
  const clave = deportista.id + ':' + verSemanas

  useEffect(() => {
    let vivo = true
    cargarAvance(supabase, deportista.id, { semanas: Math.max(8, verSemanas) })
      .then(base => { if (vivo) setCarga({ clave, base }) })
      .catch(e => { if (vivo) setCarga({ clave, base: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => { vivo = false }
  }, [deportista.id, verSemanas, clave])

  if (!carga || carga.clave !== clave) return <div className="text-center py-16 text-gray-400">Contando sus saltos…</div>
  if (carga.error || !carga.base) {
    return <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">No se han podido leer sus saltos{carga.error ? ': ' + carga.error : '.'}</p>
  }
  return <SaltosVolumenVista base={carga.base} deportista={deportista} verSemanas={verSemanas}
    onFicha={() => router.push('/deportistas/' + deportista.id + '?pestana=saltos')} />
}

/**
 * Lo que se ve, sin leer nada: recibe lo pedido a la base. Separado para poder
 * mirarlo con datos de ejemplo.
 */
export function SaltosVolumenVista({ base: b, deportista, verSemanas, onFicha }: {
  base: EntradaAvance
  deportista: { id: number; nombre?: string | null }
  verSemanas: number
  onFicha: () => void
}) {
  const boton = (
    <button type="button" onClick={onFicha}
      className="text-[12.5px] font-semibold px-3.5 py-2 rounded-lg border border-orange-500/55 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition flex-none">
      Ir a su ficha de saltos →
    </button>
  )
  const v = decidirAvance(b)
  const nombre = (deportista.nombre || '').split(' ')[0] || 'este deportista'
  const desde = Math.max(0, b.semanas.length - verSemanas)
  const vistas = b.semanas.slice(desde)
  const contactos = vistas.reduce((a, s) => a + s.pies, 0)
  const sesiones = vistas.reduce((a, s) => a + s.sesiones, 0)
  const lanzamientos = vistas.reduce((a, s) => a + s.lanzamientos, 0)
  const porNivel = NIVELES_PLIO.map(k => [k, vistas.reduce((a, s) => a + (s.porNivel[k] || 0), 0)] as const).filter(([, n]) => n > 0)
  const propuesta = v.prox != null && v.clase !== 'neutro' && v.clase !== 'sin-nivel' ? v.prox * v.sesionesSemana : null
  const corre = v.imp.tipo === 'corre' || vistas.some(s => s.carrera > 0)

  const franja = v.clase === 'sin-nivel'
    ? <>Sin nivel de pliometría puesto: pónselo en su ficha y la app propondrá cada semana qué puede subir.</>
    : v.clase === 'neutro'
      ? <>{v.imp.decidido ? 'Has decidido que no los necesita' : 'Para su deporte no hacen falta'}: la app no propone subir.</>
      : <>La semana que viene: <b className="text-white">{v.corto}</b>.</>

  return (
    <div className="flex flex-col gap-4">
      {/* Lo que hay en el período, de un vistazo: como las tarjetas de arriba de esta página. */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <div className="tp-card p-[18px]">
          <p className="text-[11.5px] text-gray-400 font-semibold">Contactos en el período</p>
          <p className="text-[32px] font-bold leading-none mt-2.5 tabular-nums">{contactos}</p>
          {contactos > 0 && (
            <div className="flex h-[5px] rounded-full overflow-hidden bg-white/[0.06] mt-3">
              {porNivel.map(([k, n]) => <div key={k} style={{ width: (n / contactos * 100) + '%', background: COLOR_NIVEL[k] }} />)}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
            {porNivel.map(([k, n]) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[10.5px] text-gray-500">
                <LetraNivel nivel={k} pequena /><b className="text-gray-300 font-semibold tabular-nums">{n}</b>
              </span>
            ))}
            {lanzamientos > 0 && <span className="text-[10.5px] text-gray-500">+ {lanzamientos} lanzamientos</span>}
          </div>
        </div>
        <div className="tp-card p-[18px]">
          <p className="text-[11.5px] text-gray-400 font-semibold">Por sesión, su última semana</p>
          <p className="text-[32px] font-bold leading-none mt-2.5 tabular-nums">{v.porSesion || '—'}</p>
          <p className="text-[11px] text-gray-500 mt-2.5">
            {b.nivel ? 'Los de su nivel, ' + (peldano('inferior', b.nivel).rango ?? []).join('–') + ' por sesión · ' : ''}
            su tope, {TOPE_NSCA[b.experiencia ?? 'intermedio']}
          </p>
        </div>
        <div className="tp-card p-[18px]">
          <p className="text-[11.5px] text-gray-400 font-semibold">Sesiones de saltos</p>
          <p className="text-[32px] font-bold leading-none mt-2.5 tabular-nums">
            {(Math.round((sesiones / Math.max(1, vistas.length)) * 10) / 10).toString().replace('.', ',')}
            <span className="text-[14px] text-gray-500 font-medium ml-1.5">por semana</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-2.5">
            {b.separacionDias != null ? 'La menor separación reciente: ' + (b.separacionDias === 0 ? 'el mismo día' : b.separacionDias === 1 ? '1 día' : b.separacionDias + ' días') : 'Sin dos sesiones seguidas que comparar'}
          </p>
        </div>
        <div className="tp-card p-[18px]">
          <p className="text-[11.5px] text-gray-400 font-semibold">Su nivel</p>
          {b.nivel ? (
            <>
              <p className="text-[24px] font-bold leading-none mt-3 flex items-center gap-2" style={{ color: COLOR_NIVEL[b.nivel] }}>
                <LetraNivel nivel={b.nivel} /> {nombreNivel(b.nivel)}
              </p>
              <p className="text-[11px] text-gray-500 mt-2.5">{peldano('inferior', b.nivel).anade}{b.puestoEn ? ' · desde el ' + fechaCorta(b.puestoEn) : ''}</p>
            </>
          ) : <p className="text-[13px] text-gray-400 mt-3">Sin poner</p>}
        </div>
      </div>

      {/* La propuesta, y el camino a su ficha, que es donde se decide. */}
      <div className="rounded-xl border border-white/10 bg-gray-900/70 px-4 py-3 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
        <p className="text-[13.5px] text-gray-300 flex items-baseline gap-2 min-w-0">
          <span className={'w-2 h-2 rounded-full flex-none translate-y-[-1px] ' + COLOR_CLASE[v.clase]} aria-hidden="true" />
          <span>{franja}{v.medir.length > 0 && <span className="text-amber-300"> Toca medir {v.medir.map(m => m.nombre).join(' y ')}.</span>}</span>
        </p>
        {boton}
      </div>

      <section className="tp-card p-5 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-[15px]">Contactos por semana, por nivel</h3>
          <span className="text-xs text-gray-500">{verSemanas >= b.semanas.length ? 'las últimas ' + b.semanas.length + ' semanas' : 'las últimas ' + verSemanas + ' semanas'} · de esta semana, lo que lleva prescrito</span>
        </div>
        <GraficaContactos semanas={b.semanas} desde={desde} propuesta={propuesta} nombre={nombre} ancho={1000} />
        <LeyendaContactos semanas={b.semanas} desde={desde} conPropuesta={propuesta != null} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <section className="tp-card p-5 flex flex-col gap-3 min-w-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-[15px]">Saltos y carrera, semana a semana</h3>
            <span className="text-xs text-gray-500">los dos son impacto</span>
          </div>
          {corre ? (
            <>
              <GraficaSaltosCarrera semanas={b.semanas} desde={desde} nombre={nombre} />
              <p className="text-[11.5px] text-gray-500">
                Los saltos son impacto, igual que correr: mejor que no suban las dos cosas la misma semana. En ámbar, las semanas en que
                su carrera sube más de un 10 % y los saltos también suben. La carrera, en minutos de sus sesiones de carrera.
              </p>
            </>
          ) : <p className="text-xs text-gray-400 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-dashed border-gray-700">No corre: aquí no hay carrera con la que sumar el impacto de los saltos.</p>}
        </section>
        <section className="tp-card p-5 flex flex-col gap-3 min-w-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-[15px]">Lanzamientos por semana</h3>
            <span className="text-xs text-gray-500">tren superior y tronco</span>
          </div>
          {lanzamientos > 0 ? (
            <>
              <GraficaLanzamientos semanas={b.semanas} desde={desde} nombre={nombre} />
              <p className="text-[11.5px] text-gray-500">No cuentan como contactos de pie: van aparte, igual que en la sesión. Su avance, de momento, lo llevas tú.</p>
            </>
          ) : <p className="text-xs text-gray-400 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-dashed border-gray-700">Sin lanzamientos en el período.</p>}
        </section>
      </div>

      <p className="text-[11.5px] text-gray-500">
        En su ficha se queda lo necesario para decidir: su nivel, las condiciones de la semana y sus tests. Aquí, la película entera, con el
        período que elijas arriba.
      </p>
    </div>
  )
}
