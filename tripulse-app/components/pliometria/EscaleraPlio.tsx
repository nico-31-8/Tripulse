import {
  NIVELES_PLIO, PARTES_PLIO, peldano, requisitoDe, type NivelPlio, type PartePlio,
} from '@/lib/pliometria'
import LetraNivel from './LetraNivel'

/**
 * La escalera de la biblioteca: la parte del cuerpo y sus cinco escalones.
 * Pulsar uno enseña solo sus ejercicios; pulsarlo otra vez, todos.
 */
export default function EscaleraPlio({ parte, nivel, cuantos, onParte, onNivel }: {
  parte: PartePlio
  nivel: NivelPlio | null
  cuantos: Partial<Record<NivelPlio, number>>
  onParte: (p: PartePlio) => void
  onNivel: (n: NivelPlio | null) => void
}) {
  return (
    <section aria-label="Escalera de pliometría" className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Parte del cuerpo" className="flex gap-1 bg-gray-900 p-1 rounded-lg border border-gray-800">
          {PARTES_PLIO.map(p => (
            <button key={p.id} type="button" aria-pressed={p.id === parte}
              onClick={() => { onParte(p.id); onNivel(null) }}
              className={'px-3 py-1.5 rounded-md text-xs font-medium transition '
                + (p.id === parte ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
              {p.nombre}
            </button>
          ))}
        </div>
        <p className="m-0 text-xs text-gray-500 max-w-[70ch]">
          Se avanza por <b className="text-gray-300">dominio técnico, no por calendario</b>: primero volumen, luego
          complejidad (de dos pies a uno, de vertical a horizontal) y por último la altura de caída.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        {NIVELES_PLIO.map(n => {
          const p = peldano(parte, n)
          const activo = nivel === n
          const req = requisitoDe(parte, n)
          return (
            <button key={n} type="button" aria-pressed={activo}
              onClick={() => onNivel(activo ? null : n)}
              className={'text-left rounded-xl border px-3 py-2.5 flex flex-col gap-1.5 transition focus-visible:outline-2 focus-visible:outline-orange-500 focus-visible:outline-offset-2 '
                + (activo ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700')}>
              <span className="flex items-center gap-2">
                <LetraNivel nivel={n} parte={parte} />
                <b className="text-[13px] leading-tight">{p.nombre}</b>
              </span>
              {p.rango && (
                <span className="text-[11.5px] text-gray-400">
                  <span className="font-mono text-gray-200 tabular-nums">{p.rango[0]}–{p.rango[1]}</span> contactos por sesión
                </span>
              )}
              <span className="text-[11.5px] text-gray-400">
                {p.exige} · {cuantos[n] || 0} {(cuantos[n] || 0) === 1 ? 'ejercicio' : 'ejercicios'}
              </span>
              {req && <span className="text-[11px] text-gray-500">{req}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** El nivel y la parte del cuerpo de un ejercicio de pliometría, en el formulario. */
export function CamposPlio({ parte, nivel, onParte, onNivel }: {
  parte: PartePlio
  nivel: NivelPlio | null
  onParte: (p: PartePlio) => void
  onNivel: (n: NivelPlio | null) => void
}) {
  const req = nivel ? requisitoDe(parte, nivel) : null
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
      <label className="flex flex-col gap-1 text-gray-400 text-xs uppercase tracking-wide">
        Parte del cuerpo
        <select value={parte} onChange={e => onParte(e.target.value as PartePlio)}
          className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm normal-case tracking-normal">
          {PARTES_PLIO.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-400 text-xs uppercase tracking-wide">
        Nivel
        <select value={nivel ?? ''} onChange={e => onNivel((e.target.value || null) as NivelPlio | null)}
          className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm normal-case tracking-normal">
          <option value="">Sin nivel</option>
          {NIVELES_PLIO.map(n => <option key={n} value={n}>{n} · {peldano(parte, n).nombre}</option>)}
        </select>
      </label>
      <p className="col-span-2 m-0 text-[11.5px] text-gray-400 leading-snug">
        {nivel
          ? <>{peldano(parte, nivel).exige}.{req ? ' ' + req : ''}</>
          : 'Con su nivel sale en su escalón de la escalera y, al prescribirlo, avisa de lo que pide.'}
      </p>
    </div>
  )
}
