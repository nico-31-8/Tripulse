import { leerNivel, leerParte, peldano, PARA_LA_SERIE } from '@/lib/pliometria'
import LetraNivel from './LetraNivel'

/**
 * Lo que ve el deportista en una tarea de pliometría: el escalón, el
 * ejercicio, cómo se hace (los mismos puntos de la biblioteca), el vídeo y
 * cuándo parar la serie.
 */
export default function TareaPlio({ ejercicio }: {
  ejercicio: {
    nombre: string
    descripcion?: string | null
    ejecucion?: string | null
    url_video?: string | null
    nivel_pliometria?: string | null
    parte_pliometria?: string | null
  }
}) {
  const nivel = leerNivel(ejercicio.nivel_pliometria)
  const parte = leerParte(ejercicio.parte_pliometria) ?? 'inferior'
  return (
    <div className="mb-3 bg-black/30 rounded-lg px-4 py-3 flex flex-col gap-2">
      <p className="m-0 flex items-center gap-2 text-[11px] uppercase tracking-wider text-orange-300">
        {nivel && <LetraNivel nivel={nivel} parte={parte} />}
        Pliometría{nivel ? ' · ' + peldano(parte, nivel).nombre.toLowerCase() : ''}
      </p>
      <p className="m-0 font-bold text-white text-lg leading-tight">{ejercicio.nombre}</p>
      {ejercicio.descripcion && <p className="m-0 text-xs text-gray-400">{ejercicio.descripcion}</p>}
      {ejercicio.ejecucion && <p className="m-0 text-sm text-gray-300 whitespace-pre-line">{ejercicio.ejecucion}</p>}
      <p className="m-0 text-xs text-amber-200 bg-amber-400/10 rounded-lg px-3 py-2">{PARA_LA_SERIE}</p>
      {ejercicio.url_video && (
        <a href={ejercicio.url_video} target="_blank" rel="noopener noreferrer"
          className="self-start text-orange-400 hover:text-orange-300 text-sm underline">Ver vídeo</a>
      )}
    </div>
  )
}
