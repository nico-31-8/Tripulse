'use client'
// ============================================================
// El wellness cruzado con lo que se entrenó
// ============================================================
// Una banda de sesiones bajo la gráfica y, al pulsar un día, qué lo precede.
//
// ESTÁ EN UN COMPONENTE Y NO COPIADO EN LAS DOS PANTALLAS. Lo usan el panel del
// entrenador (/wellness-entrenador) y el del propio atleta (/wellness/[id]), y
// son la misma pregunta hecha por dos personas distintas. Con una copia en cada
// sitio, el día que se afine la ventana o cambie la unidad de carga se afinaría
// en uno solo y las dos pantallas dirían cosas distintas del mismo día — que es
// la forma de fallo que más veces ha aparecido en este proyecto.
//
// LO QUE CAMBIA SEGÚN QUIÉN MIRA es solo el tono de los textos: al entrenador se
// le habla de «el atleta» y al atleta de «tú». Eso entra por `tu`.
import { useState } from 'react'
import {
  sesionesPorDia, cruceDe, cargaDe, haceTexto, DIAS_VENTANA, type SesionCruce,
} from '@/lib/wellness-sesiones'

/* Los mismos colores de disciplina que el calendario y el panel de la semana.
   Un color que hay que traducir no sirve de nada. */
const COLOR_DISC: Record<string, string> = {
  Natacion: '#3b82f6', 'Natación': '#3b82f6', Ciclismo: '#eab308',
  Carrera: '#22c55e', Fuerza: '#ef4444', Brick: '#a855f7',
}
const colorDisc = (d?: string | null) => COLOR_DISC[d || ''] || '#6b7280'

const minutosDe = (s: SesionCruce) => s.duracion_real ?? s.duracion_minutos ?? null
const rpeDe = (s: SesionCruce) => s.rpe_reportado ?? s.rpe_estimado ?? null

interface Props {
  /** Los registros de wellness que pinta la gráfica, en el mismo orden. */
  registros: { fecha: string }[]
  /** Las sesiones del tramo, incluidos los 3 días previos al primero. */
  sesiones: SesionCruce[]
  /** true = lo mira el propio deportista. Solo cambia cómo se le habla. */
  tu?: boolean
  /** Cuánto le reserva la gráfica al eje Y, para que las columnas cuadren. */
  margenEje?: number
}

export default function CruceWellness({ registros, sesiones, tu = false, margenEje = 30 }: Props) {
  const [dia, setDia] = useState<string | null>(null)

  const porDia = sesionesPorDia(sesiones)
  const cruce = dia ? cruceDe(dia, porDia) : null
  if (!registros.length) return null

  const fila = (s: SesionCruce, etiqueta?: string, apagada = false) => (
    <a key={s.id} href={'/sesion/' + s.id}
      className={'flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 transition hover:border-orange-500/50 hover:bg-orange-500/[0.07]'
        + (apagada ? ' opacity-55 hover:opacity-100' : '')}>
      <span className="w-[3px] self-stretch min-h-[24px] rounded-sm flex-none" style={{ background: colorDisc(s.disciplina) }} />
      {etiqueta && <span className="text-[10.5px] text-gray-500 w-[62px] flex-none">{etiqueta}</span>}
      <span className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold block truncate">{s.disciplina || 'Sesión'}</span>
        <span className="text-[11px] text-gray-500">
          {minutosDe(s) ? minutosDe(s) + ' min' : 'sin duración'} · RPE {rpeDe(s) ?? '—'}
        </span>
      </span>
      {cargaDe(s) > 0 && (
        <span className="text-right flex-none">
          <span className="block text-[12px] font-mono tabular-nums">{cargaDe(s)}</span>
          <span className="block text-[9.5px] text-gray-600">carga</span>
        </span>
      )}
      <span className="text-gray-600 flex-none">→</span>
    </a>
  )

  return (
    <>
      {/* La banda: una columna por día, un punto por sesión con el color de su
          deporte. Se lee la relación SIN pulsar nada — dónde se acumuló carga y
          dónde hubo hueco. El padding izquierdo son los píxeles que la gráfica
          le reserva al eje Y, para que las columnas caigan bajo sus días. */}
      <div className="mt-1" style={{ paddingLeft: margenEje }}>
        <p className="text-[10px] uppercase tracking-[.1em] text-gray-600 mb-1">Sesiones de cada día</p>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${registros.length}, minmax(0, 1fr))` }}>
          {registros.map(r => {
            const d = r.fecha.slice(0, 10)
            const delDia = porDia[d] || []
            const sel = dia === d
            return (
              <button key={d} onClick={() => setDia(x => x === d ? null : d)} aria-pressed={sel}
                title={delDia.length
                  ? delDia.length + (delDia.length > 1 ? ' sesiones' : ' sesión') + ' · ' + delDia.map(x => x.disciplina).join(', ')
                  : 'Descanso'}
                className={'rounded-md py-1 flex flex-col items-center gap-1 border transition '
                  + (sel ? 'border-orange-500 bg-orange-500/15'
                         : 'border-transparent bg-white/[0.02] hover:border-orange-500/40 hover:bg-orange-500/10')}>
                <span className="flex gap-[2px] items-center min-h-[6px]">
                  {delDia.length > 0
                    ? delDia.slice(0, 4).map(x => (
                        <span key={x.id} className="w-[5px] h-[5px] rounded-full" style={{ background: colorDisc(x.disciplina) }} />
                      ))
                    : <span className="w-2 h-[2px] rounded-sm bg-white/15" />}
                </span>
                <span className={'text-[8.5px] tabular-nums ' + (sel ? 'text-orange-300' : 'text-gray-600')}>{d.slice(8)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* LA VENTANA MIRA HACIA ATRÁS, y es lo único importante de todo esto. El
          wellness se rellena por la mañana, así que cuando se registró ese día
          las sesiones de ESE día aún no habían pasado. Ver lib/wellness-sesiones. */}
      {cruce && (
        <div className="mt-3 rounded-xl border border-gray-700 bg-black/30 overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-white/[0.07] bg-white/[0.02] flex items-baseline gap-2.5 flex-wrap">
            <strong className="text-[13.5px]">{dia}</strong>
            <span className="text-[11.5px] text-gray-500">registro de la mañana</span>
            <span className="flex-1" />
            <button onClick={() => setDia(null)} aria-label="Cerrar"
              className="text-[11.5px] text-gray-500 hover:text-white px-1.5 py-0.5 rounded transition">✕</button>
          </div>

          <div className="px-3.5 py-3 flex flex-col gap-3.5">
            <div>
              <p className="text-[10px] uppercase tracking-[.1em] text-gray-600 mb-1.5">
                {tu ? 'Lo que llevabas encima' : 'Lo que le precede'} · {DIAS_VENTANA * 24} h
                {cruce.carga > 0 && <span className="text-gray-500 normal-case tracking-normal"> · carga {cruce.carga}</span>}
              </p>
              {cruce.antes.length === 0 ? (
                <p className="text-[12.5px] text-gray-600 italic m-0">
                  {tu ? 'No entrenaste' : 'Sin entrenar'} en los {DIAS_VENTANA} días anteriores.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {cruce.antes.map(({ sesion, hace }) => fila(sesion, haceTexto(hace)))}
                </div>
              )}
            </div>

            {/* Apagadas y con la etiqueta que dice por qué: no explican este
                registro, pero sí el del día siguiente, y verlas ahorra un clic. */}
            <div>
              <p className="text-[10px] uppercase tracking-[.1em] text-gray-600 mb-1.5">
                Ese mismo día · aún no había pasado cuando {tu ? 'lo rellenaste' : 'rellenó'}
              </p>
              {cruce.eseDia.length === 0 ? (
                <p className="text-[12.5px] text-gray-600 italic m-0">Día de descanso.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {cruce.eseDia.map(s => fila(s, undefined, true))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
