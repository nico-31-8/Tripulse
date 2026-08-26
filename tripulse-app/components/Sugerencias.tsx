'use client'
// ============================================================
// Contar un fallo o pedir algo, sin salir de la app
// ============================================================
// Hasta ahora, si algo fallaba, la única vía era buscarte por WhatsApp. Eso
// significa que la mayoría de los fallos no se cuentan nunca: la gente se
// encoge de hombros y sigue. Y los que se cuentan llegan como «no me va», sin
// pantalla ni contexto, y hay que preguntar tres veces.
//
// LA PANTALLA LA PONE LA APP.
// Se manda la ruta y el navegador solos. Pedirle a alguien que explique dónde
// estaba es pedirle un trabajo que el programa hace mejor y sin equivocarse.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { mandarSugerencia, type TipoSugerencia } from '@/lib/avisos'

interface Props {
  /** El botón se pinta con la clase que le venga bien a cada sitio. */
  clase?: string
  etiqueta?: React.ReactNode
  tipoInicial?: TipoSugerencia
  textoInicial?: string
}

export default function Sugerencias({ clase, etiqueta, tipoInicial = 'error', textoInicial = '' }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoSugerencia>(tipoInicial)
  const [texto, setTexto] = useState(textoInicial)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(false)

  const cerrar = () => {
    setAbierto(false); setError(''); setHecho(false)
    setTexto(textoInicial); setTipo(tipoInicial)
  }

  const enviar = async () => {
    setEnviando(true); setError('')
    const user = await usuarioActual()
    if (!user) {
      setError('Necesitas haber entrado para mandarlo. Si no puedes entrar, eso ya es el fallo: cuéntamelo por WhatsApp.')
      setEnviando(false)
      return
    }

    const err = await mandarSugerencia(supabase, {
      idPerfil: user.id,
      tipo,
      texto,
      pantalla: window.location.pathname,
      agente: navigator.userAgent,
    })
    setEnviando(false)
    if (err) { setError(err); return }
    setHecho(true)
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className={clase ?? 'text-gray-500 hover:text-orange-400 text-[13px] underline transition'}>
        {etiqueta ?? 'Contar un fallo'}
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-end sm:items-center justify-center sm:p-5"
          onClick={ev => { if (ev.target === ev.currentTarget) cerrar() }}>
          <div className="bg-gray-900 border-t sm:border border-gray-700 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92%] flex flex-col overflow-hidden">

            {hecho ? (
              /* No se cierra solo. Ver que ha llegado es la mitad del valor de
                 escribirlo: sin acuse, la próxima vez ya no se molesta nadie. */
              <div className="p-6 flex flex-col gap-4 text-center">
                <span className="text-4xl">📬</span>
                <div className="flex flex-col gap-1.5">
                  <p className="font-bold text-[17px]">Llegó</p>
                  <p className="text-gray-400 text-[13.5px] leading-relaxed">
                    Va con la pantalla en la que estabas, así que no hace falta que
                    me expliques dónde. Gracias — así es como esto mejora.
                  </p>
                </div>
                <button onClick={cerrar}
                  className="bg-gray-800 text-gray-300 hover:text-white py-2.5 rounded-xl text-[13.5px] transition">
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div className="px-5 pt-5 pb-3 border-b border-gray-800">
                  <h3 className="font-bold text-[17px]">Cuéntame</h3>
                  <p className="text-gray-500 text-[12px] mt-0.5 leading-snug">
                    Lo leo yo. Va con la pantalla en la que estás, no hace falta que la digas.
                  </p>
                </div>

                <div className="overflow-y-auto p-5 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2">
                    {([['error', 'Algo falla'], ['sugerencia', 'Se me ocurre algo']] as [TipoSugerencia, string][]).map(([k, l]) => (
                      <button key={k} onClick={() => setTipo(k)} aria-pressed={tipo === k}
                        className={'py-2.5 rounded-xl text-[13.5px] font-medium transition ' + (tipo === k
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white')}>{l}</button>
                    ))}
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-gray-400 text-[12.5px]">
                      {tipo === 'error' ? '¿Qué ha pasado?' : '¿Qué echas de menos?'}
                    </span>
                    <textarea autoFocus value={texto} onChange={e => setTexto(e.target.value)} rows={5}
                      placeholder={tipo === 'error'
                        ? 'Le di a guardar y no pasó nada. Lo probé dos veces.'
                        : 'Estaría bien poder duplicar una semana entera.'}
                      className="bg-gray-800 border border-gray-700 text-white px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 resize-y text-[14.5px]" />
                  </label>

                  {error && (
                    <p className="text-red-300 bg-red-950/60 border border-red-900 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed">
                      {error}
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-800 p-3 flex gap-2">
                  <button onClick={cerrar}
                    className="flex-1 bg-gray-800 text-gray-400 hover:text-white rounded-xl py-2.5 text-[13.5px] transition">
                    Cancelar
                  </button>
                  <button onClick={enviar} disabled={enviando}
                    className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl py-2.5 text-[13.5px] transition disabled:opacity-50">
                    {enviando ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
