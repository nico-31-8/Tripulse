'use client'
// ============================================================
// Pantalla de carga con salida
// ============================================================
// Doce páginas de la app tenían esto en línea:
//
//   if (!deportista) return <div ...>Cargando...</div>
//
// El problema es que ese `if` no distingue "todavía no ha llegado" de "ha
// llegado vacío". Y llega vacío más a menudo de lo que parece: basta con abrir
// /wellness/14 siendo un entrenador al que ese deportista no le pertenece —
// RLS devuelve cero filas, la consulta termina bien, y la pantalla se queda
// diciendo "Cargando..." PARA SIEMPRE, sin explicación y sin salida.
//
// Esto no adivina cuál de los dos casos es: pasados unos segundos deja de
// prometer que está cargando y ofrece una salida, diciendo la verdad — que no
// se sabe si aquello no existe o no es tuyo. Es una red de seguridad, no un
// diagnóstico; el arreglo exacto sería que cada página marcara "consulta
// terminada sin resultado".
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Cargando({ volverA }: { volverA?: string }) {
  const router = useRouter()
  const [tarda, setTarda] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setTarda(true), 7000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white px-6">
      {!tarda ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🤔</p>
          <p className="font-bold mb-1">Esto está tardando más de lo normal</p>
          <p className="text-gray-500 text-sm mb-5">
            Puede que no exista, o que no sea tuyo. Si acabas de abrir un enlace antiguo, es lo más probable.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => router.back()}
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2.5 rounded-lg text-sm transition">
              ← Volver
            </button>
            <button onClick={() => router.push(volverA || '/dashboard')}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition">
              Ir al panel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
