import { peldano, requisitoDe, type NivelPlio, type PartePlio } from '@/lib/pliometria'

/* La escalera, de menos a más impacto: los colores de la maqueta aprobada. */
const FONDO: Record<NivelPlio, string> = {
  a: 'bg-[#4ade80]',
  b: 'bg-[#a3e635]',
  c: 'bg-[#fb923c]',
  d: 'bg-[#f472b6]',
  e: 'bg-[#ef4444]',
}

/**
 * El nivel de pliometría: su letra en un cuadro de su color. Al pasar por
 * encima dice qué escalón es y cuánto exige.
 */
export default function LetraNivel({ nivel, parte = 'inferior', pequena = false }: {
  nivel: NivelPlio
  parte?: PartePlio
  pequena?: boolean
}) {
  const p = peldano(parte, nivel)
  const texto = `Nivel ${nivel} · ${p.nombre} (${p.exige.toLowerCase()})`
  return (
    <span title={texto} aria-label={texto} role="img"
      className={[
        /* `normal-case`: la letra es el nivel, aunque vaya dentro de un rótulo en mayúsculas. */
        'inline-grid place-items-center flex-none font-mono font-bold text-[#0a0a0a] select-none normal-case tracking-normal',
        pequena ? 'w-4 h-4 rounded-[5px] text-[10px]' : 'w-[22px] h-[22px] rounded-[7px] text-xs',
        FONDO[nivel],
      ].join(' ')}>
      {nivel}
    </span>
  )
}

/**
 * Debajo del ejercicio elegido: su nivel con el escalón y, desde el c, lo que
 * pide antes. Sin nivel (uno propio sin clasificar), solo que es pliometría.
 */
export function PeldanoElegido({ nivel, parte = 'inferior' }: { nivel: NivelPlio | null; parte?: PartePlio }) {
  if (!nivel) return <span className="text-[11px] text-orange-300">Pliometría</span>
  const req = requisitoDe(parte, nivel)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-orange-300">
        <LetraNivel nivel={nivel} parte={parte} pequena />
        Pliometría · {peldano(parte, nivel).nombre.toLowerCase()}
      </span>
      {req && <span className="text-[11px] text-amber-300/90">{req}</span>}
    </div>
  )
}
