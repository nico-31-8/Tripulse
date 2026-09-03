'use client'
// ============================================================
// Los instrumentos con los que se dirige un test en vivo
// ============================================================
//
// POR QUÉ ES UN COMPONENTE SUYO Y NO ESTÁ DENTRO DE LA FICHA. Los tests de la
// app viven en dos sitios: los diecisiete de la batería los recorre
// `TestDeCampo` desde el catálogo, y los siete clásicos —Montreal, CSS, rampa,
// los tres sprints y el 1RM— son formularios escritos a mano en /tests/[id],
// porque escriben en sus propias tablas y de ellos salen las zonas.
//
// Los dos necesitan los mismos cronómetros. Y es más: el SECUENCIADOR, que es
// el instrumento que más falta hace, es del Montreal y de la rampa, o sea de
// los clásicos. Si el cronómetro viviera dentro de la ficha de la batería, ese
// no lo tendría nadie, o habría que escribirlo dos veces —y entonces el reloj
// del Montreal y el del test de 6 minutos podrían acabar contando distinto.
//
// LO QUE NO SABE ESTE COMPONENTE. Ni dónde se guarda el test, ni qué fórmula
// usa, ni si es del catálogo. Recibe la clave, lee sus instrumentos de
// `herramientas-test` y avisa por `setCampo` cuando tiene un número. Quien lo
// use decide qué hacer con él: en la batería va a un objeto de valores, en los
// clásicos va a un `useState`.
import { useState, useEffect } from 'react'
import {
  CRONO_PARADO, corriendo, intacto, transcurrido, arrancar, pausar, reiniciar, vuelta,
  resumenVueltas, restante, terminada, progreso, relojMinutos, relojDecimas,
  enSegundos, enMinutos, escalonEn, type EstadoCrono,
} from '@/lib/dirigir-cronometro'
import { herramientasDe, avisoDe, type Herramienta } from '@/lib/herramientas-test'

/** Un reloj grande: es lo que se mira a tres metros, con el atleta corriendo. */
function Reloj({ texto, pie, estado }: { texto: string; pie: string; estado?: 'corre' | 'fin' }) {
  return (
    <div className={'text-center font-mono tabular-nums text-5xl leading-none font-medium ' +
      (estado === 'fin' ? 'text-green-400' : estado === 'corre' ? 'text-orange-400' : 'text-white')}>
      {texto}
      <span className="block font-sans text-[11px] font-semibold tracking-widest uppercase text-gray-500 mt-2">
        {pie}
      </span>
    </div>
  )
}

const BTN = 'py-4 rounded-lg font-semibold transition'
const SEC = 'bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 rounded-lg text-sm transition'

export default function InstrumentosTest({ claveTest, valores, setCampo }: {
  claveTest: string
  /** Lo que hay escrito ahora, para el contador y para el secuenciador. */
  valores: Record<string, string>
  setCampo: (clave: string, valor: string) => void
}) {
  const herramientas = herramientasDe(claveTest)
  const aviso = avisoDe(claveTest)

  // Un cronómetro por instrumento: el SWOLF tiene dos —el largo y las
  // brazadas— y no pueden compartir estado.
  const [cronos, setCronos] = useState<Record<number, EstadoCrono>>({})
  const [ahora, setAhora] = useState(() => Date.now())

  // Al cambiar de test se tiran los relojes: un tiempo arrastrado de otro test
  // sería un dato falso con pinta de bueno.
  useEffect(() => { setCronos({}) }, [claveTest])

  /* Solo repinta MIENTRAS algo corre. Un intervalo permanente re-renderizaría
     diez veces por segundo para siempre, también con todo parado. */
  const algoCorre = Object.values(cronos).some(corriendo)
  useEffect(() => {
    if (!algoCorre) return
    const t = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(t)
  }, [algoCorre])

  if (herramientas.length === 0) return null

  const crono = (i: number) => cronos[i] ?? CRONO_PARADO
  const ponCrono = (i: number, e: EstadoCrono) => setCronos(c => ({ ...c, [i]: e }))
  const alArrancar = (i: number) => { const t = Date.now(); setAhora(t); ponCrono(i, arrancar(crono(i), t)) }

  /* Parar ES apuntar: es lo que uno hace al cruzar la meta. La casilla se queda
     editable, así que un tiempo mal cogido se corrige a mano. */
  const alParar = (i: number, h: Herramienta) => {
    const t = Date.now()
    const e = pausar(crono(i), t)
    ponCrono(i, e); setAhora(t)
    if (h.tipo === 'cronometro') {
      const ms = transcurrido(e, t)
      if (ms > 0) setCampo(h.campo, String(h.unidad === 'min' ? enMinutos(ms) : enSegundos(ms)))
    }
  }

  const alReiniciar = (i: number, h: Herramienta) => {
    ponCrono(i, reiniciar())
    if (h.tipo === 'vueltas') { setCampo(h.repes, ''); setCampo(h.mejor, ''); setCampo(h.ultima, '') }
  }

  const alVuelta = (i: number, h: Herramienta) => {
    if (h.tipo !== 'vueltas') return
    const t = Date.now()
    const e = vuelta(crono(i), t)
    ponCrono(i, e); setAhora(t)
    const r = resumenVueltas(e.vueltas)
    setCampo(h.repes, String(r.repes))
    setCampo(h.mejor, r.mejor == null ? '' : String(r.mejor))
    setCampo(h.ultima, r.ultima == null ? '' : String(r.ultima))
  }

  const contar = (campo: string, delta: number) => {
    const n = Math.max(0, (Number(valores[campo]) || 0) + delta)
    setCampo(campo, n === 0 ? '' : String(n))
  }

  /* El cálculo del escalón vive en `dirigir-cronometro`, no aquí: la vista de
     grupo pasa el mismo protocolo a diez atletas a la vez y tiene que contar
     exactamente igual. Duplicarlo sería que el mismo test dijera «escalón 9» en
     una pantalla y «escalón 10» en la otra, y de ahí sale la VAM.

     La duración y el incremento se leen de SUS CASILLAS: si el entrenador monta
     escalones de 30 s, el reloj va con él, y son las mismas casillas que luego
     usa la fórmula. */
  const escalon = (h: Herramienta, i: number) => {
    if (h.tipo !== 'secuenciador') return { numero: 1, intensidad: 0, dentro: 0, duracion: 60 }
    const duracion = Number(valores[h.campoDuracion]) || 60
    return {
      ...escalonEn(transcurrido(crono(i), ahora), h.inicial, duracion,
                   Number(valores[h.campoIncremento]) || 0),
      duracion,
    }
  }

  /* Congela dónde iba y rellena las dos casillas de golpe. Es el gesto del
     test: el atleta se baja y no hay tiempo de apuntar dos números. */
  const capturar = (h: Herramienta, i: number) => {
    if (h.tipo !== 'secuenciador') return
    const s = escalon(h, i)
    alParar(i, h)
    setCampo(h.campoIntensidad, String(s.intensidad))
    setCampo(h.campoAguanto, String(Math.round(s.dentro)))
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <p className="text-amber-300/80 text-xs bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
          {aviso}
        </p>
      )}

      {herramientas.map((h, i) => (
        <div key={i} className="rounded-xl border border-gray-700/70 bg-gray-950/60 p-5 flex flex-col gap-3">

          {h.tipo === 'cuentaAtras' && (() => {
            const e = crono(i)
            const queda = restante(e, h.segundos, ahora)
            const fin = terminada(e, h.segundos, ahora)
            return (<>
              <Reloj texto={relojMinutos(queda)} pie={fin ? 'Se acabó' : 'Quedan'}
                estado={fin ? 'fin' : corriendo(e) ? 'corre' : undefined} />
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={'h-full rounded-full transition-all ' + (fin ? 'bg-green-400' : 'bg-orange-500')}
                  style={{ width: (progreso(e, h.segundos, ahora) * 100) + '%' }} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => corriendo(e) ? alParar(i, h) : alArrancar(i)} disabled={fin}
                  className={'flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 ' + BTN}>
                  {fin ? 'Terminado' : corriendo(e) ? 'Pausar' : intacto(e) ? 'Empezar' : 'Seguir'}
                </button>
                <button type="button" onClick={() => alReiniciar(i, h)} className={SEC}>Reiniciar</button>
              </div>
            </>)
          })()}

          {h.tipo === 'cronometro' && (() => {
            const e = crono(i)
            return (<>
              <Reloj texto={relojDecimas(transcurrido(e, ahora))} pie={h.que}
                estado={corriendo(e) ? 'corre' : undefined} />
              <div className="flex gap-2">
                <button type="button" onClick={() => corriendo(e) ? alParar(i, h) : alArrancar(i)}
                  className={'flex-1 bg-orange-500 hover:bg-orange-600 ' + BTN}>
                  {corriendo(e) ? 'Parar y apuntar' : intacto(e) ? 'Empezar' : 'Seguir'}
                </button>
                <button type="button" onClick={() => alReiniciar(i, h)} className={SEC}>Reiniciar</button>
              </div>
            </>)
          })()}

          {h.tipo === 'vueltas' && (() => {
            const e = crono(i)
            const mejor = e.vueltas.length ? Math.min(...e.vueltas) : null
            return (<>
              <Reloj texto={relojDecimas(transcurrido(e, ahora))} pie="Repetición en curso"
                estado={corriendo(e) ? 'corre' : undefined} />
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => alVuelta(i, h)} disabled={!corriendo(e)}
                  className={'flex-[2] min-w-[150px] bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 ' + BTN}>
                  + Repetición
                </button>
                <button type="button" onClick={() => corriendo(e) ? alParar(i, h) : alArrancar(i)}
                  className={'flex-1 bg-gray-800 hover:bg-gray-700 ' + BTN}>
                  {corriendo(e) ? 'Pausar' : intacto(e) ? 'Empezar' : 'Seguir'}
                </button>
                <button type="button" onClick={() => alReiniciar(i, h)} className={SEC}>Reiniciar</button>
              </div>
              {e.vueltas.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {e.vueltas.map((ms, k) => (
                    <span key={k} className={'font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border ' +
                      (ms === mejor
                        ? 'border-green-500/40 bg-green-500/10 text-green-400'
                        : 'border-gray-700 bg-white/5 text-gray-400')}>
                      {k + 1} · {Math.round(ms / 100) / 10} s
                    </span>
                  ))}
                </div>
              )}
            </>)
          })()}

          {h.tipo === 'contador' && (
            <>
              <Reloj texto={String(Number(valores[h.campo]) || 0)} pie={h.que} />
              <div className="flex gap-2">
                <button type="button" onClick={() => contar(h.campo, 1)}
                  className={'flex-1 bg-orange-500 hover:bg-orange-600 ' + BTN}>+ 1</button>
                {/* Contar brazadas se falla: hace falta poder restar. */}
                <button type="button" onClick={() => contar(h.campo, -1)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-5 rounded-lg text-sm transition">− 1</button>
              </div>
            </>
          )}

          {h.tipo === 'secuenciador' && (() => {
            const e = crono(i)
            const s = escalon(h, i)
            return (<>
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
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: (s.dentro / s.duracion * 100) + '%' }} />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => capturar(h, i)} disabled={intacto(e)}
                  className={'flex-[2] min-w-[170px] bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 ' + BTN}>
                  Se bajó — capturar
                </button>
                <button type="button" onClick={() => corriendo(e) ? alParar(i, h) : alArrancar(i)}
                  className={'flex-1 bg-gray-800 hover:bg-gray-700 ' + BTN}>
                  {corriendo(e) ? 'Pausar' : intacto(e) ? 'Empezar' : 'Seguir'}
                </button>
                <button type="button" onClick={() => alReiniciar(i, h)} className={SEC}>Reiniciar</button>
              </div>
            </>)
          })()}
        </div>
      ))}
    </div>
  )
}
