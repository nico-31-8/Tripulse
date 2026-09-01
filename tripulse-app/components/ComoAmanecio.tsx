'use client'
// ============================================================
// Después de esta sesión, cómo amaneció
// ============================================================
// El cruce del wellness contesta «veo un pico, ¿qué lo causó?». Esto contesta la
// que hace aprender a un entrenador: «esta sesión que le puse, ¿costó lo que yo
// creía?». Sin esto, calibrar es de memoria.
//
// MIRA AL DÍA SIGUIENTE. El wellness se rellena por la mañana, así que la
// factura de la sesión del martes aparece en el registro del miércoles. Ver
// lib/wellness-sesiones.
//
// LO QUE SE ENSEÑA ES LO QUE SE SALIÓ DE SU NORMAL, no los siete números. Un
// «fatiga 4» no dice nada suelto: dice mucho si su media es 2,5. La comparación
// la hace `compararDia`, que vive en lib/wellness-analisis con la definición de
// «normal» que ya usa el resto de la app — no una segunda.
import { mananasTras, wellnessPorDia, despuesTexto } from '@/lib/wellness-sesiones'
import { compararDia, loQueFueMal, type MetricaDia } from '@/lib/wellness-analisis'

interface Props {
  fechaSesion: string
  /** El historial de wellness del atleta. Sirve de base y de fuente. */
  registros: any[]
}

const flecha = (m: MetricaDia) => {
  if (m.base == null) return ''
  if (m.valor > m.base) return '↑'
  if (m.valor < m.base) return '↓'
  return ''
}

export default function ComoAmanecio({ fechaSesion, registros }: Props) {
  const porDia = wellnessPorDia(registros || [])
  const mananas = mananasTras(fechaSesion, porDia)

  /* Sin registros después no se enseña la tarjeta. Un «no hay datos» permanente
     en la ficha de cada sesión futura sería ruido en todas: la sesión de dentro
     de tres semanas nunca va a tener el wellness de después. */
  if (!mananas.length) return null

  return (
    <div className="tp-card p-[14px_16px] flex flex-col gap-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-[13px] font-semibold m-0">Después de esta sesión</p>
        <span className="text-[11px] text-gray-500">cómo amaneció</span>
      </div>

      {mananas.map(({ dia, despues, registro }) => {
        const todas = compararDia(registro, registros)
        const mal = loQueFueMal(todas)
        return (
          <div key={dia} className="flex items-start gap-3 flex-wrap">
            <span className="text-[11px] text-gray-500 w-[118px] flex-none pt-0.5">
              {despuesTexto(despues)}
              <span className="block text-[10px] text-gray-600 tabular-nums">{dia}</span>
            </span>

            {mal.length === 0 ? (
              /* Que no se saliera nada TAMBIÉN es información, y de la buena:
                 significa que la sesión le costó lo que tenía que costarle. */
              <span className="text-[12.5px] text-green-400/90 pt-0.5">
                Nada fuera de su normal.
              </span>
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {mal.map(m => (
                  <span key={m.key}
                    className="text-[11.5px] px-2 py-1 rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-200"
                    title={m.base != null ? 'Su normal: ' + m.base + ' ' + m.unidad : 'Sin línea base todavía'}>
                    <b className="font-semibold">{m.label}</b>{' '}
                    <span className="font-mono tabular-nums">{m.valor}{m.unidad === '/7' ? '' : ' ' + m.unidad}</span>
                    {m.base != null && (
                      <span className="text-amber-200/60"> {flecha(m)} de {m.base}</span>
                    )}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}

      <p className="text-[11px] text-gray-600 m-0 leading-snug">
        Se compara cada día con la media de ese atleta, no con una tabla general.
        El wellness se rellena por la mañana, así que lo que costó esta sesión sale al día siguiente.
      </p>
    </div>
  )
}
