// ============================================================
// Un bloque guardado, leído: «AMRAP 12′» y sus líneas
// ============================================================
// Lo pintan la tabla de la sesión, el briefing del atleta y donde haga falta
// leer un bloque ya escrito. La lógica —qué dice cada formato, cuánto dura—
// es de lib/bloque-formato; aquí solo se pinta.
import {
  leerConfig, ordenarLineas, duracionBloque, textoFormato, textoLinea, leerResultado, textoResultado,
  QUE_SE_APUNTA, type Formato, type LineaBloque,
} from '@/lib/bloque-formato'

const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')

export default function ResumenBloque({ t, conApunta = true }: {
  t: { formato?: string | null; formato_config?: unknown; resultado?: unknown; ejercicios?: LineaBloque[] | null }
  /** En la tabla del entrenador sí; en el briefing del atleta ya lo dice la ejecución. */
  conApunta?: boolean
}) {
  const formato = t.formato as Formato
  const cfg = leerConfig(t.formato_config)
  const lineas = ordenarLineas(t.ejercicios)
  const d = duracionBloque(formato, cfg, lineas)
  const r = leerResultado(t.resultado)
  const alterna = formato === 'emom' && cfg.alternar && lineas.length > 1

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30 whitespace-nowrap">
          {textoFormato(formato, cfg)}
        </span>
        {d.segundos > 0 && (
          <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
            {d.como === 'formato' ? '' : '≈ '}{mmss(d.segundos)}{d.como === 'estimada' ? ' (estimada)' : d.como === 'limite' ? ' (límite)' : ''}
          </span>
        )}
        {conApunta && !r && <span className="text-xs text-gray-500">· apunta {QUE_SE_APUNTA[formato]}</span>}
        {r && <span className="text-xs font-semibold text-green-300 whitespace-nowrap">✓ {textoResultado(formato, r, cfg)}</span>}
      </div>
      <ol className="flex flex-col gap-0.5 m-0 p-0 list-none">
        {lineas.map((l, i) => (
          <li key={l.id ?? i} className="flex gap-2 text-sm text-gray-200 min-w-0">
            <span className="text-gray-500 tabular-nums w-4 flex-none text-right">{i + 1}</span>
            <span className="min-w-0">
              {textoLinea(l, formato)}
              {alterna && <span className="text-gray-500 text-xs"> · minutos {i % lineas.length === 0 && lineas.length === 2 ? 'impares' : i % lineas.length === 1 && lineas.length === 2 ? 'pares' : i + 1 + ', ' + (i + 1 + lineas.length) + '…'}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
