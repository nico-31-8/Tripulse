import { peldano, requisitoDe, numeroNivel, nombreNivel, etiquetaNivel, type NivelPlio, type PartePlio } from '@/lib/pliometria'
import { porEncimaDeSuEscalon } from '@/lib/pliometria-escalon'

/* La escalera, de menos a más impacto: los colores de la maqueta aprobada. */
const FONDO: Record<NivelPlio, string> = {
  a: 'bg-[#4ade80]',
  b: 'bg-[#a3e635]',
  c: 'bg-[#fb923c]',
  d: 'bg-[#f472b6]',
  e: 'bg-[#ef4444]',
}

/**
 * El nivel de pliometría: su número (1-5) en un cuadro de su color. Por dentro
 * sigue siendo a-e (lib/pliometria); se enseña el número desde el 22-10-2026.
 * Al pasar por encima dice qué añade ese nivel y cuánto exige.
 */
export default function LetraNivel({ nivel, parte = 'inferior', pequena = false }: {
  nivel: NivelPlio
  parte?: PartePlio
  pequena?: boolean
}) {
  const p = peldano(parte, nivel)
  const texto = `${etiquetaNivel(parte, nivel)} (${p.exige.toLowerCase()})`
  return (
    <span title={texto} aria-label={texto} role="img"
      className={[
        'inline-grid place-items-center flex-none font-mono font-bold text-[#0a0a0a] select-none normal-case tracking-normal',
        pequena ? 'w-4 h-4 rounded-[5px] text-[10px]' : 'w-[22px] h-[22px] rounded-[7px] text-xs',
        FONDO[nivel],
      ].join(' ')}>
      {numeroNivel(nivel)}
    </span>
  )
}

/**
 * Debajo del ejercicio elegido: su nivel y lo que añade y, desde el 3, lo que
 * pide antes. Sin nivel (uno propio sin clasificar), solo que es pliometría.
 * Si el deportista tiene nivel puesto en esa parte y el ejercicio está por
 * encima, se dice; no impide nada (lo decide el entrenador).
 */
export function PeldanoElegido({ nivel, parte = 'inferior', escalonDeportista = null }: {
  nivel: NivelPlio | null
  parte?: PartePlio
  escalonDeportista?: NivelPlio | null
}) {
  if (!nivel) return <span className="text-[11px] text-orange-300">Pliometría</span>
  const req = requisitoDe(parte, nivel)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-orange-300">
        <LetraNivel nivel={nivel} parte={parte} pequena />
        Pliometría · {etiquetaNivel(parte, nivel).toLowerCase()}
      </span>
      {escalonDeportista && porEncimaDeSuEscalon(nivel, escalonDeportista) && (
        <span className="text-[11px] text-amber-300">
          Está en el {nombreNivel(escalonDeportista).toLowerCase()}: este es del {nombreNivel(nivel).toLowerCase()}. Puedes mandarlo igual.
        </span>
      )}
      {req && <span className="text-[11px] text-amber-300/90">{req}</span>}
    </div>
  )
}
