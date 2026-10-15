'use client'
// ============================================================
// TRIPULSE — «¿Para qué sirve?» un resultado de un test propio
// ============================================================
//
// LO USAN /tests-propios Y /laboratorio, y por eso vive aquí: dos copias del
// desplegable acabarían ofreciendo opciones distintas según dónde se creara el
// test. Tres piezas:
//
//   · el desplegable, en grupos: hito para tus zonas propias, sustituir la de
//     la app, o solo seguimiento;
//   · debajo, qué significa lo que está elegido;
//   · y un «¿Qué significa cada opción?» con todas, para cuando no se tiene
//     claro cuál elegir.
//
// Lo que dice cada opción no se escribe aquí: sale de lib/ancla-propia.
import { GRUPOS_ANCLA, type Ancla } from '@/lib/test-definicion'
import {
  etiquetaAncla, explicarAncla, queEsAncla, esHitoPropio, haySustituto, puedeFijar, PARA_QUE_HITO,
} from '@/lib/ancla-propia'

export function SelectParaQueSirve({ id, value, deporte, onChange, className }: {
  id?: string
  value: Ancla | undefined
  deporte: string
  onChange: (a: Ancla) => void
  className?: string
}) {
  return (
    <select id={id} className={className} value={value || 'nada'} onChange={e => onChange(e.target.value as Ancla)}>
      {GRUPOS_ANCLA.map(g => (
        <optgroup key={g.titulo} label={g.titulo}>
          {g.anclas.map(a => (
            <option key={a} value={a} disabled={a === 'app' && !haySustituto(deporte)}>{etiquetaAncla(a, deporte)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/**
 * Lo que significa lo elegido, dicho AL CREARLO. Antes no se decía en ninguna
 * parte y te enterabas meses después, en otra pantalla.
 *
 * Si es «sustituir» y no puede (la unidad no se reconoce), se dice por qué: la
 * casilla de la app espera km/h, W o m/s, y adivinarlo es lo que deja una VAM
 * de 4,3 km/h en la base.
 */
export function ExplicaParaQueSirve({ ancla, deporte, unidad }: {
  ancla: Ancla | undefined
  deporte: string
  unidad: string
}) {
  const a: Ancla = ancla || 'nada'
  const v = a === 'app' && haySustituto(deporte)
    ? puedeFijar(deporte, { nombre: '', unidad, ancla: a, formula: [], graf: false })
    : null
  return (
    <div className="mt-1.5 text-[11px] leading-snug max-w-prose">
      <p className={a === 'app' ? 'text-green-300/85' : a === 'nada' ? 'text-gray-500' : 'text-violet-300/80'}>
        {a === 'app' ? '⚓ ' : a === 'nada' ? '◦ ' : '◈ '}{explicarAncla(a, deporte)}
      </p>
      {v && !v.destino && v.motivo && <p className="text-amber-300/90 mt-1">⚠ {v.motivo}</p>}
    </div>
  )
}

/** Todas las opciones explicadas, una vez por test y no en cada resultado. */
export function GlosarioParaQueSirve({ deporte }: { deporte: string }) {
  return (
    <details className="rounded-xl border border-gray-800 bg-gray-900/40 px-3.5 py-2.5 text-[12px] mb-3">
      <summary className="cursor-pointer select-none text-gray-400 hover:text-gray-200">
        ¿Qué significa cada opción de «¿Para qué sirve?»?
      </summary>
      <div className="mt-3 flex flex-col gap-3.5">
        {GRUPOS_ANCLA.map(g => (
          <div key={g.titulo} className="flex flex-col gap-1.5">
            <p className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold">{g.titulo}</p>
            {g.anclas.map(a => (
              <p key={a} className="text-gray-400 leading-snug max-w-prose">
                <b className="text-gray-200 font-semibold">{etiquetaAncla(a, deporte)}.</b> {queEsAncla(a, deporte)}
              </p>
            ))}
            {g.anclas.some(esHitoPropio) && (
              <p className="text-violet-300/80 leading-snug max-w-prose">◈ {PARA_QUE_HITO} Cuál de estas elijas no cambia ninguna cuenta: es para que sepas qué guardaste.</p>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
