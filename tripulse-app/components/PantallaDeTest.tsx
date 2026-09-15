'use client'
// ============================================================
// TRIPULSE — No se sale de un test sin querer
// ============================================================
// POR QUÉ EXISTE. Dirigiendo un test se puede salir sin querer: un gesto de
// atrás en el móvil, el botón del navegador, una pulsación en el menú. Y salir
// con el reloj corriendo no es un error que se corrija: se ha ido el reloj, y
// con él el escalón en el que iba cada atleta. El test hay que repetirlo, con
// la gente ya cansada.
//
// LOS TRES CAMINOS DE SALIDA, y los tres tapados:
//   · El botón de atrás del navegador, o el gesto del móvil ... popstate
//   · Recargar o cerrar la pestaña ............................ beforeunload
//   · Pulsar algo del menú ................................... lo tapa quien usa esto
//
// NO SE BLOQUEA NADA: SE PREGUNTA. Un entrenador que quiere salir tiene que
// poder salir; lo que no puede es salirse sin enterarse. Encerrar a alguien en
// una pantalla es peor problema que el que resuelve.
//
// Hay dos formas de usarlo, y son dos porque las pantallas son distintas:
//   · `PantallaDeTest` tapa la aplicación entera. Para el test de grupo, que se
//     dirige a pie de pista y donde no hay nada más que mirar.
//   · `useBloqueoDeSalida` + `AvisoDeSalida` solo ponen los candados, sin tapar.
//     Para las pantallas donde el reloj es una parte y alrededor hay cosas que
//     siguen sirviendo.

import { useEffect, useState } from 'react'

/**
 * Los candados de salida, mientras `activo`.
 *
 * El del botón de atrás mete una entrada de más en el historial al activarse,
 * así que el primer «atrás» consume esa y no saca de la página; se vuelve a
 * meter y se pregunta. Sin ese re-push, un segundo «atrás» sí saldría.
 */
export function useBloqueoDeSalida(activo: boolean) {
  const [preguntando, setPreguntando] = useState(false)

  useEffect(() => {
    if (!activo) return
    window.history.pushState({ testEnMarcha: true }, '')
    const alVolver = () => {
      window.history.pushState({ testEnMarcha: true }, '')
      setPreguntando(true)
    }
    /* El texto del aviso de recarga lo pone el navegador: hace años que no
       dejan personalizarlo. Lo que importa es que salga. */
    const alCerrar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('popstate', alVolver)
    window.addEventListener('beforeunload', alCerrar)
    return () => {
      window.removeEventListener('popstate', alVolver)
      window.removeEventListener('beforeunload', alCerrar)
    }
  }, [activo])

  return {
    preguntando,
    preguntar: () => setPreguntando(true),
    cerrar: () => setPreguntando(false),
  }
}

/** La pregunta de salir, con lo que se pierde dicho en una línea. */
export function AvisoDeSalida({ abierto, aviso, onSeguir, onSalir }: {
  abierto: boolean
  aviso?: string
  onSeguir: () => void
  onSalir: () => void
}) {
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-[17px]">¿Salir del test?</h3>
        <p className="text-gray-400 text-[13px] mt-2 leading-snug">
          {aviso || 'Se para el reloj y se pierde lo que no hayas guardado.'}
        </p>
        <div className="flex gap-2 mt-5">
          <button onClick={onSeguir}
            className="flex-1 bg-orange-500 hover:bg-orange-600 py-2.5 rounded-lg text-sm font-semibold transition">
            Seguir con el test
          </button>
          <button onClick={onSalir}
            className="px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white transition">
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}

/** El nombre del test y el único botón que saca de él. */
export function BarraDeTest({ titulo, sub, onSalir }: {
  titulo: string
  sub?: string
  onSalir: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 w-full">
      <div className="min-w-0">
        <p className="font-bold text-[15px] truncate flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" aria-hidden />
          {titulo}
        </p>
        {sub && <p className="text-[11.5px] text-gray-500 truncate">{sub}</p>}
      </div>
      <button onClick={onSalir}
        className="flex-shrink-0 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] transition">
        Salir del test
      </button>
    </div>
  )
}

/** El test ocupando la pantalla entera. */
export default function PantallaDeTest({ titulo, sub, alSalir, aviso, children }: {
  titulo: string
  sub?: string
  /** Qué hacer cuando confirma que sale. */
  alSalir: () => void
  /** Lo que se pierde al salir, dicho en una línea. */
  aviso?: string
  children: React.ReactNode
}) {
  const bloqueo = useBloqueoDeSalida(true)

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 overflow-y-auto overscroll-contain">
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 sm:px-6 h-[58px] flex items-center">
        <BarraDeTest titulo={titulo} sub={sub} onSalir={bloqueo.preguntar} />
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
        {children}
      </div>

      <AvisoDeSalida abierto={bloqueo.preguntando} aviso={aviso}
        onSeguir={bloqueo.cerrar} onSalir={() => { bloqueo.cerrar(); alSalir() }} />
    </div>
  )
}
