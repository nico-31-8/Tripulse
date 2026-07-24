'use client'
// Checklist de "Primeros pasos" del entrenador. Guía el arranque: (1) invitar al primer
// deportista —con el código a mano, que antes vivía enterrado en /perfil— y (2) crear su
// plan (el hueco: hasta ahora nada guiaba este paso tras añadir un atleta). Se oculta solo
// cuando ambos están hechos.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingEntrenador({ perfil, numDeportistas, tienePlan }: { perfil: any; numDeportistas: number; tienePlan: boolean }) {
  const router = useRouter()
  const [copiado, setCopiado] = useState(false)

  const tieneDeportista = numDeportistas > 0
  const pasos = [tieneDeportista, tienePlan]
  const hechos = pasos.filter(Boolean).length
  if (hechos === pasos.length) return null // todo listo → no molestar

  const codigo: string = perfil?.codigo_entrenador || ''
  const copiar = () => {
    if (!codigo) return
    navigator.clipboard.writeText(codigo)
    setCopiado(true); setTimeout(() => setCopiado(false), 1500)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-lg">🚀 Primeros pasos</p>
        <span className="text-xs text-gray-400">{hechos} de {pasos.length}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full mb-4 overflow-hidden">
        <div className="h-full bg-orange-500 transition-all" style={{ width: (hechos / pasos.length * 100) + '%' }} />
      </div>

      {/* Paso 1: invitar al primer deportista */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <span className={tieneDeportista ? 'text-green-400' : 'text-gray-600'}>{tieneDeportista ? '✅' : '⬜'}</span>
          <p className={'font-medium ' + (tieneDeportista ? 'text-gray-500 line-through' : 'text-white')}>Invita a tu primer deportista</p>
        </div>
        {!tieneDeportista && (
          <div className="mt-2 ml-7">
            <p className="text-gray-400 text-sm mb-2">Comparte tu código (lo mete al registrarse) o genera un enlace de invitación en Deportistas.</p>
            {codigo && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-gray-500 text-sm">Tu código:</span>
                <span className="font-mono font-bold text-orange-300 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1">{codigo}</span>
                <button onClick={copiar} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-2.5 py-1.5 transition">{copiado ? '✓ Copiado' : '📋 Copiar'}</button>
              </div>
            )}
            <button onClick={() => router.push('/deportistas')} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Ir a Deportistas →</button>
          </div>
        )}
      </div>

      {/* Paso 2: crear el plan */}
      <div>
        <div className="flex items-center gap-2">
          <span className={tienePlan ? 'text-green-400' : 'text-gray-600'}>{tienePlan ? '✅' : '⬜'}</span>
          <p className={'font-medium ' + (tienePlan ? 'text-gray-500 line-through' : (tieneDeportista ? 'text-white' : 'text-gray-500'))}>Crea el plan de tu deportista</p>
        </div>
        {tieneDeportista && !tienePlan && (
          <div className="mt-2 ml-7">
            <p className="text-gray-400 text-sm mb-2">Diseña su temporada: macrociclo, mesociclos y sus sesiones.</p>
            <button onClick={() => router.push('/deportistas')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Empezar a planificar →</button>
          </div>
        )}
        {!tieneDeportista && <p className="text-gray-600 text-sm ml-7 mt-1">Se desbloquea cuando tengas tu primer deportista.</p>}
      </div>
    </div>
  )
}
