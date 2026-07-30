'use client'
// ============================================================
// La sesión que propone el asistente, para aceptarla o corregirla
// ============================================================
// No es un mensaje más: es algo que se puede aplicar. Por eso se pinta como una
// ficha con sus bloques y no como texto.
//
// «Usarla» NO escribe en la base de datos: deja la propuesta preparada y lleva al
// calendario, donde el entrenador pulsa el día. Ese último clic es suyo siempre.
import { useRouter } from 'next/navigation'
import { cargaZona } from '@/lib/zonas'
import {
  minutosPropuesta, metrosPropuesta, rpePropuesta, avisosPropuesta,
  type PropuestaSesion,
} from '@/lib/propuesta-sesion'

const EMOJI: Record<string, string> = { Natacion: '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️' }

/** Donde se deja la propuesta para que la recoja el calendario. */
export const LLAVE_PROPUESTA = 'tripulse_propuesta_ia'

interface Props {
  propuesta: PropuestaSesion
  depId: number | null
  /** Pide un cambio: rellena el cuadro de texto con el arranque de la corrección. */
  onCambiar: (texto: string) => void
  onDescartar: () => void
}

export default function TarjetaPropuesta({ propuesta, depId, onCambiar, onDescartar }: Props) {
  const router = useRouter()
  const avisos = avisosPropuesta(propuesta)
  const min = minutosPropuesta(propuesta)
  const met = metrosPropuesta(propuesta)
  const rpe = rpePropuesta(propuesta)

  const usar = () => {
    try {
      localStorage.setItem(LLAVE_PROPUESTA, JSON.stringify(propuesta))
    } catch { /* sin localStorage no se puede pasar; el botón no promete más */ }
    if (depId) router.push('/planificacion-visual/' + depId + '/calendario')
  }

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.05] overflow-hidden mt-1">
      <div className="px-3.5 py-2.5 border-b border-orange-500/15 flex items-start gap-2.5">
        <span className="text-base leading-none mt-0.5">{EMOJI[propuesta.disciplina] || '📋'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold tracking-tight leading-snug">{propuesta.nombre}</p>
          <p className="text-[11px] text-gray-500 tabular-nums">
            {propuesta.disciplina}
            {met > 0 && <> · {met >= 1000 ? (met / 1000).toFixed(1) + ' km' : met + ' m'}</>}
            {min > 0 && <> · {min} min</>}
            {' · RPE ~' + rpe}
          </p>
        </div>
      </div>

      <div className="px-3.5 py-2.5 flex flex-col gap-1.5">
        {propuesta.bloques.map((b, i) => {
          const c = cargaZona(b.zona).color
          const vol = b.metros
            ? (b.metros >= 1000 ? (b.metros / 1000).toFixed(1) + ' km' : b.metros + ' m')
            : b.minutos ? b.minutos + ' min' : '—'
          return (
            <div key={i} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="font-bold px-1.5 py-0.5 rounded text-[10.5px] flex-shrink-0"
                style={{ color: c, background: `color-mix(in oklab, ${c} 17%, transparent)` }}>
                {b.zona}
              </span>
              <span className="text-gray-200 flex-1 min-w-0">
                {b.series && b.series > 1 ? b.series + ' × ' : ''}{vol}
                {b.descansoSeg ? <span className="text-gray-500"> · desc {b.descansoSeg}s</span> : null}
                {b.nota ? <span className="text-gray-500 italic"> · {b.nota}</span> : null}
              </span>
            </div>
          )
        })}
      </div>

      {propuesta.porque && (
        <p className="px-3.5 pb-2.5 text-[11.5px] text-gray-400 leading-relaxed italic">{propuesta.porque}</p>
      )}

      {/* Avisos de la red de seguridad: el modelo cumple el esquema, el sentido
          común no lo garantiza nadie. */}
      {avisos.length > 0 && (
        <div className="px-3.5 pb-2.5 flex flex-col gap-1">
          {avisos.map((a, i) => <p key={i} className="text-[11px] text-yellow-500/90">⚠️ {a}</p>)}
        </div>
      )}

      <div className="px-3 py-2.5 border-t border-orange-500/15 flex items-center gap-2">
        <button onClick={usar} disabled={!depId}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-[12.5px] font-semibold px-3 py-2 rounded-lg transition">
          Usarla →
        </button>
        <button onClick={() => onCambiar('Cámbiala: ')}
          className="text-[12.5px] text-gray-400 hover:text-white px-2.5 py-2 rounded-lg hover:bg-gray-800 transition">
          Cambiar algo
        </button>
        <button onClick={onDescartar}
          className="text-[12.5px] text-gray-600 hover:text-gray-300 px-2 py-2 transition ml-auto">
          Descartar
        </button>
      </div>
    </div>
  )
}
