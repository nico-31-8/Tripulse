'use client'
// ============================================================
// Desplazar un ciclo en el tiempo
// ============================================================
// El caso que lo trae: empezar la periodización un jueves cuando querías
// empezarla el lunes siguiente. Sin esto, la única salida es rehacer el plan o
// arrastrar las sesiones una a una — y las sesiones son la parte fácil: lo que
// hay que mover con ellas son los microciclos y los mesociclos que las
// contienen, o quedan descolgadas.
//
// Enseña la previsualización ANTES de aplicar porque es una operación grande y
// silenciosa: al terminar, el calendario simplemente tiene otro aspecto y no hay
// forma de saber qué se movió.
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  previsualizar, aplicarDesplazamiento, sumarDias, ETIQUETA_NIVEL,
  type NivelCiclo, type CicloFila, type SesionFila, type CompeticionFila,
} from '@/lib/desplazar'

interface Props {
  macros: CicloFila[]
  mesos: CicloFila[]
  micros: CicloFila[]
  sesiones: SesionFila[]
  competiciones?: CompeticionFila[]
  /** Día desde el que se abre: preselecciona el ciclo que lo contiene. */
  fecha?: string | null
  hoy: string
  onCerrar: () => void
  onHecho: () => void
}

const NIVELES: NivelCiclo[] = ['macrociclo', 'mesociclo', 'microciclo']

/** El ciclo de cada nivel que contiene ese día. */
function cicloDelDia(nivel: NivelCiclo, f: string, macros: CicloFila[], mesos: CicloFila[], micros: CicloFila[]) {
  const lista = nivel === 'macrociclo' ? macros : nivel === 'mesociclo' ? mesos : micros
  const semanasDe = (c: CicloFila) => nivel === 'microciclo' ? 1 : (c.duracion_semanas || 4)
  return lista.find(c => {
    if (!c.fecha_inicio) return false
    const ini = String(c.fecha_inicio).slice(0, 10)
    return f >= ini && f < sumarDias(ini, semanasDe(c) * 7)
  })
}

export default function DesplazarCiclo({
  macros, mesos, micros, sesiones, competiciones, fecha, hoy, onCerrar, onHecho,
}: Props) {
  const dia = (fecha || hoy).slice(0, 10)

  // Qué ciclo de cada nivel contiene el día del que se abrió. Sin día útil, el
  // primer macrociclo: es el caso de «mover todo».
  const candidatos = useMemo(() => {
    const r = {} as Record<NivelCiclo, CicloFila | undefined>
    NIVELES.forEach(n => { r[n] = cicloDelDia(n, dia, macros, mesos, micros) })
    if (!r.macrociclo) r.macrociclo = macros[0]
    return r
  }, [dia, macros, mesos, micros])

  const primerNivel = NIVELES.find(n => candidatos[n]) || 'macrociclo'
  const [nivel, setNivel] = useState<NivelCiclo>(primerNivel)
  const ciclo = candidatos[nivel]

  const inicioActual = ciclo?.fecha_inicio ? String(ciclo.fecha_inicio).slice(0, 10) : ''
  const [nuevaFecha, setNuevaFecha] = useState(inicioActual)
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState('')

  // Cambiar de nivel cambia el ciclo, y con él la fecha de partida.
  const cambiarNivel = (n: NivelCiclo) => {
    setNivel(n)
    const c = candidatos[n]
    setNuevaFecha(c?.fecha_inicio ? String(c.fecha_inicio).slice(0, 10) : '')
    setError('')
  }

  const p = useMemo(() => ciclo ? previsualizar({
    nivel, id: ciclo.id, nuevaFecha: nuevaFecha || inicioActual,
    macros, mesos, micros, sesiones, competiciones, hoy,
  }) : null, [nivel, ciclo, nuevaFecha, inicioActual, macros, mesos, micros, sesiones, competiciones, hoy])

  const aplicar = async () => {
    if (!ciclo || !p || p.vacio) return
    setAplicando(true); setError('')
    const err = await aplicarDesplazamiento(supabase, nivel, ciclo.id, p.dias)
    setAplicando(false)
    if (err) { setError(err); return }
    onHecho()
    onCerrar()
  }

  const saltos = [-7, -3, -1, 1, 3, 7]

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onCerrar}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-start gap-4 p-5 pb-3 border-b border-gray-800">
          <div>
            <h3 className="text-xl font-bold">🔀 Mover en el tiempo</h3>
            <p className="text-gray-500 text-xs mt-1">El ciclo se lleva consigo todo lo que tiene dentro.</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-white text-2xl leading-none flex-shrink-0">×</button>
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">Qué se mueve</label>
            <div className="flex flex-col gap-1.5">
              {NIVELES.map(n => {
                const c = candidatos[n]
                return (
                  <button key={n} onClick={() => cambiarNivel(n)} disabled={!c}
                    className={'w-full text-left rounded-xl border px-3.5 py-2.5 transition disabled:opacity-35 ' +
                      (nivel === n ? 'bg-orange-500/15 border-orange-500/60' : 'bg-gray-950 border-gray-800 hover:border-gray-600')}>
                    <span className="text-[13.5px] font-semibold text-gray-100 capitalize">{ETIQUETA_NIVEL[n]}</span>
                    <span className="block text-[11.5px] text-gray-500">
                      {c ? (c.objetivo || 'Sin nombre') + ' · empieza el ' + String(c.fecha_inicio).slice(0, 10)
                        : 'No hay ' + n + ' en este día'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {ciclo && (
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Que empiece el</label>
              <input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)}
                className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {saltos.map(s => (
                  <button key={s} onClick={() => setNuevaFecha(sumarDias(inicioActual, s))}
                    className="px-2.5 py-1 rounded-lg text-[12px] font-medium bg-gray-950 border border-gray-800 text-gray-400 hover:text-white transition">
                    {s > 0 ? '+' + s : s} d
                  </button>
                ))}
                <button onClick={() => setNuevaFecha(inicioActual)}
                  className="px-2.5 py-1 rounded-lg text-[12px] font-medium bg-gray-950 border border-gray-800 text-gray-500 hover:text-white transition">
                  ↺
                </button>
              </div>
            </div>
          )}

          {p && !p.vacio && (
            <div className="rounded-xl bg-gray-950 border border-gray-800 px-3.5 py-3">
              <p className="text-[13px] text-gray-200">
                <b className="text-orange-400">{p.dias > 0 ? '+' + p.dias : p.dias} días</b>
                {' · '}{p.sesiones.length} {p.sesiones.length === 1 ? 'sesión' : 'sesiones'}
                {p.micros > 0 && ', ' + p.micros + (p.micros === 1 ? ' semana' : ' semanas')}
                {p.mesos > 0 && ', ' + p.mesos + (p.mesos === 1 ? ' mesociclo' : ' mesociclos')}
              </p>
              <p className="text-[11.5px] text-gray-500 mt-1">
                Del {p.de} al {p.a}. Las competiciones y las semanas bloqueadas no se mueven.
              </p>
            </div>
          )}

          {p?.competiciones.map(c => (
            <div key={c.nombre + c.fecha} className="rounded-xl bg-gray-950 border border-gray-800 px-3.5 py-2.5">
              <p className="text-[12.5px] text-gray-200">🏆 {c.nombre} · {c.fecha}</p>
              <p className="text-[11.5px] text-gray-500 mt-0.5">
                El plan acababa {c.margenAntes} días antes; pasará a acabar {c.margenDespues}
                {c.margenDespues < 0 ? ' días DESPUÉS de la carrera.' : ' días antes.'}
              </p>
            </div>
          ))}

          {p?.avisos.map((a, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5">
              <span className="text-sm leading-none mt-0.5">⚠️</span>
              <p className="text-[12.5px] text-amber-200/90">{a}</p>
            </div>
          ))}

          {error && <p className="text-red-400 text-[12.5px]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-800">
          <button onClick={onCerrar} className="text-gray-400 hover:text-white text-sm px-3 py-2 transition">Cancelar</button>
          <button onClick={aplicar} disabled={!p || p.vacio || aplicando}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            {aplicando ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  )
}
