'use client'
// ============================================================
// La tarjeta que ofrece el tutorial a quien ya usaba la app
// ============================================================
// Decidido el 16-10-2026: a los entrenadores que ya estaban no les salta nada
// solo, se les ofrece. Sale una sola vez en el Panel; contesten lo que
// contesten, no vuelve (y con «No, gracias» tampoco arranca nada solo).

import { useTutorial } from './TutorialProvider'

export default function OfertaTutorial({ className = '' }: { className?: string }) {
  const t = useTutorial()
  if (!t?.ofrecer) return null
  return (
    <div className={'bg-gray-900 border border-orange-500/30 rounded-2xl p-5 ' + className}>
      <p className="font-bold text-lg">🎓 Novedad: ya hay un recorrido guiado</p>
      <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">
        Te enseña cada parte de la app en unos minutos: el panel, tus deportistas, sus tests y la planificación.
        Puedes verlo ahora o cuando quieras desde 🎓 Tutoriales, abajo del menú.
      </p>
      <div className="flex gap-2 mt-4 flex-wrap">
        <button type="button" onClick={t.aceptarOferta}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">Verlo ahora</button>
        <button type="button" onClick={t.rechazarOferta}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">No, gracias</button>
      </div>
    </div>
  )
}
