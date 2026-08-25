'use client'
// ============================================================
// Los bloques de una sesión de nadar, rodar o correr
// ============================================================
// «8 × 100 m a 1:38 con 20 s» es un bloque. Es la unidad con la que un
// entrenador escribe una sesión y con la que un atleta la cuenta, así que es la
// unidad con la que se apunta.
//
// LA ZONA LLEVA SU RITMO DEBAJO
// En cuanto se elige la zona, el cartel dice a qué ritmo va ESE atleta en esa
// zona, sacado de sus tests. Sin eso hay que apuntar a ciegas o preguntar. Si no
// tiene el test que toca no se inventa un número: se dice que falta.
import { type BloqueRegistro, seriesDe } from '@/lib/registro-resistencia'
import { referenciaDeZona, ZONAS_UI, type Tests } from '@/lib/referencia-zona'
import { ZONAS_RESISTENCIA } from '@/lib/zonas'

interface Props {
  bloques: BloqueRegistro[]
  onCambiar: (i: number, campo: keyof BloqueRegistro, valor: string) => void
  onQuitar: (i: number) => void
  disciplina: string
  tests: Tests
  fcMax: number
  /** 2 = siglas (AER, AEL…). Cualquier otro = las siete clásicas (Z1…Z7). */
  sistema: number
}

export default function BloquesResistencia({
  bloques, onCambiar, onQuitar, disciplina, tests, fcMax, sistema,
}: Props) {
  const zonas = sistema === 2
    ? ZONAS_RESISTENCIA.map(z => ({ v: z.sigla, et: z.sigla + ' · ' + z.nombre }))
    : ZONAS_UI.map(z => ({ v: 'Z' + z.num, et: z.nombre }))

  const esNatacion = (disciplina || '').startsWith('Nat')
  const unidadRitmo = esNatacion ? '/100m' : '/km'
  const casilla = 'bg-gray-800 text-white px-2 py-2.5 rounded-lg w-full min-w-0 text-center tabular-nums outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <>
      {bloques.map((b, i) => {
        const ref = referenciaDeZona(b.zona, disciplina, tests, fcMax)
        const porTiempo = b.unidad === 'min'

        return (
          <section key={i} className="tp-card overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center gap-2 border-b border-white/[0.075]">
              <span className="text-gray-600 text-[11px] tabular-nums flex-none">{i + 1}</span>
              <select value={b.zona} onChange={e => onCambiar(i, 'zona', e.target.value)}
                aria-label={'Zona del bloque ' + (i + 1)}
                className="flex-1 min-w-0 bg-gray-800 text-white px-2.5 py-2 rounded-lg text-[13.5px] outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Sin zona</option>
                {zonas.map(z => <option key={z.v} value={z.v}>{z.et}</option>)}
              </select>
              <button onClick={() => onQuitar(i)} aria-label={'Quitar el bloque ' + (i + 1)}
                className="text-gray-600 hover:text-red-400 text-[15px] px-1 flex-none transition">✕</button>
            </div>

            <div className="p-3.5 flex flex-col gap-2">
              <div className="grid grid-cols-[62px_14px_1fr_78px] gap-1.5 items-center">
                <input type="number" inputMode="numeric" value={b.series} className={casilla}
                  onChange={e => onCambiar(i, 'series', e.target.value)}
                  aria-label="Series" placeholder="series" />
                <span className="text-gray-600 text-center text-[13px]">×</span>
                <input type="number" inputMode="decimal" value={b.cantidad} className={casilla}
                  onChange={e => onCambiar(i, 'cantidad', e.target.value)}
                  aria-label="Cuánto" placeholder={porTiempo ? 'minutos' : 'metros'} />
                <select value={b.unidad} onChange={e => onCambiar(i, 'unidad', e.target.value)}
                  aria-label="Unidad"
                  className="bg-gray-800 text-white px-2 py-2.5 rounded-lg text-[13px] text-center outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="m">m</option>
                  <option value="min">min</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* Un bloque medido en minutos no tiene ritmo sin saber la
                    distancia, así que no se pregunta. */}
                {!porTiempo && (
                  <input value={b.ritmo} onChange={e => onCambiar(i, 'ritmo', e.target.value)}
                    className={casilla} aria-label={'Ritmo ' + unidadRitmo}
                    placeholder={'ritmo ' + unidadRitmo} />
                )}
                <input type="number" inputMode="numeric" value={b.descanso}
                  onChange={e => onCambiar(i, 'descanso', e.target.value)}
                  className={casilla} aria-label="Descanso en segundos" placeholder="descanso s" />
              </div>

              {ref && (
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {ref.ritmo
                    ? <>Tu <b className="text-orange-300 font-semibold">{b.zona}</b> son <b className="text-orange-300 font-semibold">{ref.ritmo}</b>.</>
                    : <>Sin el test que toca no se puede decir tu ritmo de <b className="text-gray-300 font-semibold">{b.zona}</b>. Va por sensación: {ref.rpe}.</>}
                  {seriesDe(b) > 1 && b.cantidad && !porTiempo && (
                    <span className="text-gray-600"> · {(seriesDe(b) * Number(b.cantidad || 0)).toLocaleString('es-ES')} m en total</span>
                  )}
                </p>
              )}
            </div>
          </section>
        )
      })}
    </>
  )
}
