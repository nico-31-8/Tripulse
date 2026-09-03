'use client'
// ============================================================
// Dirigir un test a varios atletas con un solo reloj
// ============================================================
//
// LA FORMA SALE DEL TEST REAL, no de la pantalla individual. Un grupo hace UN
// test: una salida, un protocolo, un reloj. Lo que cambia de una persona a otra
// es CUÁNDO se baja. Así que aquí hay un reloj arriba y un botón por atleta.
//
// Es la misma idea que ya se usó para dirigir sesiones de grupo, y sale de
// mirar qué hace el entrenador de verdad: no lleva doce cronómetros, lleva uno
// y va apuntando quién se cae.
//
// QUÉ SE PUEDE Y QUÉ NO. No todo instrumento vale en grupo:
//
//   · Cuenta atrás ..... sí. Un reloj para todos; los metros los teclea cada uno.
//   · Cronómetro ....... sí. Una salida, y un botón «llegó» por atleta.
//   · Secuenciador ..... sí, y es donde más se nota: el protocolo va cantando y
//                        cada atleta se baja en su escalón.
//   · Vueltas .......... NO. Cada atleta hace SUS repeticiones a su ritmo; con
//                        un solo reloj no se pueden contar doce series a la vez.
//   · Contador ......... NO, por lo mismo: las brazadas son de cada uno.
//
// Los dos que no se pueden se dicen en pantalla en vez de desaparecer sin
// explicación: el entrenador tiene que saber que ahí hay que ir de uno en uno.
import { useState, useEffect } from 'react'
import {
  CRONO_PARADO, corriendo, intacto, transcurrido, arrancar, pausar, reiniciar,
  restante, terminada, progreso, relojMinutos, relojDecimas,
  enSegundos, enMinutos, escalonEn, type EstadoCrono,
} from '@/lib/dirigir-cronometro'
import { herramientasDe, avisoDe, valeEnGrupo, sueltosDe, type Herramienta } from '@/lib/herramientas-test'

export interface Atleta {
  id: number
  nombre: string
}

const BTN = 'py-4 rounded-lg font-semibold transition'

export default function InstrumentoGrupo({ claveTest, protocolo, atletas, capturado, onCapturar }: {
  claveTest: string
  /** El protocolo del grupo: de aquí salen la duración y el incremento. */
  protocolo: Record<string, string>
  atletas: Atleta[]
  /** Quién tiene ya su número, para tacharlo de la lista. */
  capturado: (id: number) => boolean
  /** Lo que se ha medido de este atleta: {clave de casilla: valor}. */
  onCapturar: (id: number, campos: Record<string, string>) => void
}) {
  const herramientas = herramientasDe(claveTest)
  const aviso = avisoDe(claveTest)
  const utiles = herramientas.filter(valeEnGrupo)
  const sueltos = sueltosDe(claveTest)

  const [cronos, setCronos] = useState<Record<number, EstadoCrono>>({})
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => { setCronos({}) }, [claveTest])

  const algoCorre = Object.values(cronos).some(corriendo)
  useEffect(() => {
    if (!algoCorre) return
    const t = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(t)
  }, [algoCorre])

  if (herramientas.length === 0) return null

  const crono = (i: number) => cronos[i] ?? CRONO_PARADO
  const ponCrono = (i: number, e: EstadoCrono) => setCronos(c => ({ ...c, [i]: e }))
  const darSalida = (i: number) => { const t = Date.now(); setAhora(t); ponCrono(i, arrancar(crono(i), t)) }
  const parar = (i: number) => { const t = Date.now(); setAhora(t); ponCrono(i, pausar(crono(i), t)) }

  const escalon = (h: Herramienta, i: number, ms?: number) => {
    if (h.tipo !== 'secuenciador') return { numero: 1, intensidad: 0, dentro: 0, duracion: 60 }
    const duracion = Number(protocolo[h.campoDuracion]) || 60
    return {
      ...escalonEn(ms ?? transcurrido(crono(i), ahora), h.inicial, duracion,
                   Number(protocolo[h.campoIncremento]) || 0),
      duracion,
    }
  }

  /**
   * Coge el tiempo de ESTE atleta sin parar el reloj.
   *
   * No se para porque los demás siguen. Es la diferencia entre un cronómetro y
   * dirigir un grupo: el reloj es del test, no de la persona.
   */
  const capturar = (h: Herramienta, i: number, id: number) => {
    const ms = transcurrido(crono(i), Date.now())
    if (ms <= 0) return
    if (h.tipo === 'cronometro') {
      onCapturar(id, { [h.campo]: String(h.unidad === 'min' ? enMinutos(ms) : enSegundos(ms)) })
    } else if (h.tipo === 'secuenciador') {
      const s = escalon(h, i, ms)
      onCapturar(id, {
        [h.campoIntensidad]: String(s.intensidad),
        [h.campoAguanto]: String(Math.round(s.dentro)),
      })
    }
  }

  const pendientes = atletas.filter(a => !capturado(a.id))
  const hechos = atletas.filter(a => capturado(a.id))

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <p className="text-amber-300/80 text-xs bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
          {aviso}
        </p>
      )}

      {sueltos.length > 0 && (
        <p className="text-gray-400 text-xs bg-white/[0.03] border border-gray-700 rounded-lg px-3 py-2">
          Este test se cuenta por repeticiones o por brazadas de cada uno, así que esa parte
          no se puede llevar con un reloj común: ábrele la ficha a cada atleta y dirígesela
          desde ahí.
        </p>
      )}

      {utiles.map((h, i) => (
        <div key={i} className="rounded-xl border border-gray-700/70 bg-gray-950/60 p-5 flex flex-col gap-4">

          {/* ── El reloj, uno para todos ── */}
          {h.tipo === 'cuentaAtras' && (() => {
            const e = crono(i)
            const queda = restante(e, h.segundos, ahora)
            const fin = terminada(e, h.segundos, ahora)
            return (<>
              <div className={'text-center font-mono tabular-nums text-5xl leading-none font-medium ' +
                (fin ? 'text-green-400' : corriendo(e) ? 'text-orange-400' : 'text-white')}>
                {relojMinutos(queda)}
                <span className="block font-sans text-[11px] font-semibold tracking-widest uppercase text-gray-500 mt-2">
                  {fin ? 'Se acabó' : 'Quedan'} · {h.que}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={'h-full rounded-full transition-all ' + (fin ? 'bg-green-400' : 'bg-orange-500')}
                  style={{ width: (progreso(e, h.segundos, ahora) * 100) + '%' }} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => corriendo(e) ? parar(i) : darSalida(i)} disabled={fin}
                  className={'flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 ' + BTN}>
                  {fin ? 'Terminado' : corriendo(e) ? 'Pausar' : intacto(e) ? 'Dar la salida' : 'Seguir'}
                </button>
                <button type="button" onClick={() => ponCrono(i, reiniciar())}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 rounded-lg text-sm transition">
                  Reiniciar
                </button>
              </div>
              <p className="text-gray-500 text-xs text-center">
                Al acabar, cada uno apunta sus metros en su ficha.
              </p>
            </>)
          })()}

          {(h.tipo === 'cronometro' || h.tipo === 'secuenciador') && (() => {
            const e = crono(i)
            const s = h.tipo === 'secuenciador' ? escalon(h, i) : null
            return (<>
              {s ? (
                <div className="flex items-center justify-center gap-7 flex-wrap">
                  <div className="text-center">
                    <div className="font-mono tabular-nums text-4xl font-semibold leading-none">{s.numero}</div>
                    <div className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mt-2">Escalón</div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono tabular-nums text-4xl font-semibold leading-none text-orange-400">
                      {String(s.intensidad).replace('.', ',')}
                    </div>
                    <div className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mt-2">
                      {h.unidad} ahora
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono tabular-nums text-4xl font-semibold leading-none">
                      {relojMinutos(s.dentro * 1000)}
                    </div>
                    <div className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mt-2">
                      En este escalón
                    </div>
                  </div>
                </div>
              ) : (
                <div className={'text-center font-mono tabular-nums text-5xl leading-none font-medium ' +
                  (corriendo(e) ? 'text-orange-400' : 'text-white')}>
                  {relojDecimas(transcurrido(e, ahora))}
                  <span className="block font-sans text-[11px] font-semibold tracking-widest uppercase text-gray-500 mt-2">
                    {h.que}
                  </span>
                </div>
              )}

              {s && (
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: (s.dentro / s.duracion * 100) + '%' }} />
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => corriendo(e) ? parar(i) : darSalida(i)}
                  className={'flex-1 bg-orange-500 hover:bg-orange-600 ' + BTN}>
                  {corriendo(e) ? 'Pausar' : intacto(e) ? 'Dar la salida' : 'Seguir'}
                </button>
                <button type="button" onClick={() => ponCrono(i, reiniciar())}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 rounded-lg text-sm transition">
                  Reiniciar
                </button>
              </div>

              {/* ── Un botón por atleta ──
                  El reloj NO se para al pulsar: los demás siguen corriendo. Esa
                  es toda la diferencia entre un cronómetro y dirigir un grupo. */}
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500">
                  {h.tipo === 'secuenciador' ? 'Quién se baja' : 'Quién llega'}
                  {pendientes.length > 0 && <span className="text-gray-600"> · faltan {pendientes.length}</span>}
                </p>

                {pendientes.length === 0 ? (
                  <p className="text-green-400 text-sm">Ya están todos.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {pendientes.map(a => (
                      <button key={a.id} type="button" disabled={intacto(e)}
                        onClick={() => capturar(h, i, a.id)}
                        className="bg-gray-800 hover:bg-orange-500 hover:text-black disabled:opacity-40 disabled:hover:bg-gray-800 disabled:hover:text-white text-left px-4 py-3 rounded-lg text-sm font-medium transition">
                        {a.nombre}
                      </button>
                    ))}
                  </div>
                )}

                {hechos.length > 0 && (
                  <p className="text-gray-500 text-xs">
                    Ya tienen su marca: {hechos.map(a => a.nombre).join(' · ')}
                  </p>
                )}
              </div>
            </>)
          })()}
        </div>
      ))}
    </div>
  )
}
