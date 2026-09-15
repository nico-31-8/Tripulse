'use client'
// ============================================================
// TRIPULSE — Un test en marcha ocupa la pantalla entera
// ============================================================
// POR QUÉ EXISTE. Dirigiendo un test de grupo se puede salir sin querer: un
// gesto de atrás en el móvil, el botón del navegador, una pulsación en el menú.
// Y salir del test con el reloj corriendo no es un error que se corrige: se ha
// ido el reloj, y con él el escalón en el que iba cada atleta. El test hay que
// repetirlo, con la gente ya cansada.
//
// Así que mientras se dirige, el test tapa el resto de la aplicación y solo se
// sale por un sitio: el botón de arriba, que además pregunta.
//
// LOS TRES CAMINOS DE SALIDA, y los tres tapados:
//   · El botón de atrás del navegador (o el gesto del móvil) ... popstate
//   · Recargar o cerrar la pestaña ............................. beforeunload
//   · Pulsar algo de la aplicación de debajo .................. no se ve: tapado
//
// No se BLOQUEA nada: se pregunta. Un entrenador que quiere salir tiene que
// poder salir; lo que no puede es salirse sin enterarse.

import { useEffect, useState } from 'react'

export default function PantallaDeTest({ titulo, sub, alSalir, aviso, children }: {
  titulo: string
  sub?: string
  /** Qué hacer cuando confirma que sale. */
  alSalir: () => void
  /** Lo que se pierde al salir, dicho en una línea. */
  aviso?: string
  children: React.ReactNode
}) {
  const [preguntando, setPreguntando] = useState(false)

  /* El botón de atrás. Se mete una entrada de más en el historial al abrir, así
     que el primer «atrás» consume esa y no saca de la página; se vuelve a meter
     y se pregunta. Sin el re-push, un segundo «atrás» sí saldría. */
  useEffect(() => {
    window.history.pushState({ testEnMarcha: true }, '')
    const alVolver = () => {
      window.history.pushState({ testEnMarcha: true }, '')
      setPreguntando(true)
    }
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])

  /* Recargar o cerrar. El texto lo pone el navegador —hace años que no dejan
     personalizarlo— pero el aviso sale igual. */
  useEffect(() => {
    const alCerrar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', alCerrar)
    return () => window.removeEventListener('beforeunload', alCerrar)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 overflow-y-auto overscroll-contain">
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 sm:px-6 h-[58px] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold text-[15px] truncate flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" aria-hidden />
            {titulo}
          </p>
          {sub && <p className="text-[11.5px] text-gray-500 truncate">{sub}</p>}
        </div>
        <button onClick={() => setPreguntando(true)}
          className="flex-shrink-0 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] transition">
          Salir del test
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
        {children}
      </div>

      {preguntando && (
        <div className="fixed inset-0 z-20 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-[17px]">¿Salir del test?</h3>
            <p className="text-gray-400 text-[13px] mt-2 leading-snug">
              {aviso || 'Se para el reloj y se pierde lo que no hayas guardado.'}
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setPreguntando(false)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 py-2.5 rounded-lg text-sm font-semibold transition">
                Seguir con el test
              </button>
              <button onClick={() => { setPreguntando(false); alSalir() }}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white transition">
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
