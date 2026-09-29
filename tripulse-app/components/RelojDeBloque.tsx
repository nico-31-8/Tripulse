'use client'
// ============================================================
// El reloj de un bloque, a pie de pista
// ============================================================
//
// Dirigir un AMRAP con un cronómetro que cuenta hacia arriba es restar de
// cabeza mientras hablas, y dirigir un EMOM así es cantar los minutos a ojo.
// Esto enseña lo que de verdad hace falta: cuánto queda del tramo en curso, de
// qué tramo se trata, y un aviso en cada cambio.
//
// LA CUENTA NO ESTÁ AQUÍ: está en lib/reloj-bloque, con sus pruebas. Aquí solo
// se pinta y se pita, que es lo único que no se puede probar sin un entrenador
// y una pista delante.

import { useEffect, useRef } from 'react'
import { faseDeBloque } from '@/lib/reloj-bloque'
import { leerConfig, type ConfigBloque, type Formato } from '@/lib/bloque-formato'
import { relojMinutos } from '@/lib/dirigir-cronometro'
import { debePitar, avisarEscalon } from '@/lib/pitido'

/** Por debajo de esto el número se pone naranja: quedan segundos. */
const AVISA_BAJO_MS = 10_000

export default function RelojDeBloque({ formato, config, ms, corriendo, lineas = 1 }: {
  formato: Formato | null | undefined
  /** El `formato_config` tal cual viene de la base. */
  config: unknown
  /** Lo que lleva corriendo el bloque, en ms. */
  ms: number
  corriendo: boolean
  /** Cuántas líneas tiene: en un Tabata las vueltas son POR LÍNEA. */
  lineas?: number
}) {
  const cfg: ConfigBloque = leerConfig(config)
  const f = faseDeBloque(formato, cfg, ms, lineas)

  /* EL TRAMO ES LO QUE HACE SONAR EL PITIDO, igual que los escalones de un test
     de campo: la pantalla se queda con el anterior y suena cuando sube. Así no
     hay una segunda manera de decidir cuándo pita. */
  const tramoPrevio = useRef<number | null>(null)
  const finPrevio = useRef(false)

  useEffect(() => {
    if (debePitar(tramoPrevio.current, f.tramo, corriendo)) avisarEscalon()
    tramoPrevio.current = f.tramo
  }, [f.tramo, corriendo])

  useEffect(() => {
    /* El final no siempre cambia de tramo —un AMRAP es un solo tramo de doce
       minutos—, así que se avisa aparte. Tres pitidos: se oye por encima de un
       gimnasio, que es donde pasa esto. */
    if (corriendo && f.terminado && !finPrevio.current) {
      avisarEscalon(); setTimeout(avisarEscalon, 260); setTimeout(avisarEscalon, 520)
    }
    finPrevio.current = f.terminado
  }, [f.terminado, corriendo])

  if (f.tipo === 'libre') return null

  const bajo = !f.terminado && f.ms <= AVISA_BAJO_MS
  const color = f.terminado ? 'text-red-300'
    : f.tipo === 'pausa' ? 'text-amber-300'
    : bajo ? 'text-orange-300'
    : corriendo ? 'text-green-400'
    : 'text-gray-400'

  return (
    <div className={'mx-2.5 mb-2 rounded-xl border px-3 py-2 flex items-center gap-3 transition '
      + (f.terminado ? 'border-red-500/45 bg-red-500/10'
        : f.tipo === 'pausa' ? 'border-amber-500/40 bg-amber-500/10'
        : corriendo ? 'border-green-400/45 bg-green-400/10'
        : 'border-white/[0.09] bg-white/[0.02]')}>
      <span className="text-[11.5px] font-bold uppercase tracking-wider text-gray-400 flex-1 min-w-0 truncate">
        {f.terminado ? 'Se acabó' : f.etiqueta}
      </span>
      {/* Grande y monoespaciado: se lee de reojo, de pie y a dos metros. */}
      <span className={'font-mono tabular-nums tracking-tight text-[30px] leading-none font-bold flex-none ' + color}>
        {relojMinutos(f.ms)}
      </span>
      {f.tramos > 1 && !f.terminado && (
        <span className="text-[11px] text-gray-500 font-mono flex-none tabular-nums">{f.tramo}/{f.tramos}</span>
      )}
    </div>
  )
}
