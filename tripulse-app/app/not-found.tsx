'use client'
// ============================================================
// La página que sale cuando una dirección no existe
// ============================================================
// Antes salía la de Next: fondo blanco, «404 · This page could not be found»
// en inglés y sin ninguna salida. Aparte de dar el cante en medio de una app en
// español y en oscuro, deja a la persona en un callejón: si llega ahí desde un
// enlace viejo de un correo, no tiene ni idea de a dónde ir.
//
// NO ADIVINA SI ERES ENTRENADOR O DEPORTISTA.
// Podría mirar el perfil y ofrecer el panel que toca, pero eso son dos consultas
// y una espera para una pantalla a la que se llega por error. Se ofrecen las dos
// salidas y que elija: son dos botones, no un examen.
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Sugerencias from '@/components/Sugerencias'

export default function NoEncontrada() {
  const router = useRouter()
  const [ruta, setRuta] = useState('')

  // Qué dirección se pidió. Sirve para el buzón: si alguien reporta el fallo,
  // llega con la URL puesta en vez de «me salió un error».
  useEffect(() => { setRuta(window.location.pathname) }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md flex flex-col gap-6">

        <div className="flex flex-col gap-3">
          <span className="font-mono text-[42px] leading-none text-orange-500/80 tabular-nums">404</span>
          <h1 className="text-2xl font-bold">Aquí no hay nada</h1>
          <p className="text-gray-400 text-[15px] leading-relaxed">
            Esta dirección no existe. Puede que el enlace sea viejo, que se haya
            borrado lo que había, o que se colara una letra por el camino.
          </p>
          {ruta && (
            <p className="text-[12px] text-gray-600 font-mono break-all bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              {ruta}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={() => router.back()}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 rounded-xl transition">
            ← Volver a donde estaba
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => router.push('/dashboard')}
              className="bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white py-2.5 rounded-xl text-[13.5px] transition">
              Panel de entrenador
            </button>
            <button onClick={() => router.push('/dashboard-deportista')}
              className="bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white py-2.5 rounded-xl text-[13.5px] transition">
              Panel de deportista
            </button>
          </div>
        </div>

        {/* Si has llegado aquí desde un enlace de la app, eso es un fallo mío y
            quiero enterarme. El buzón llega con la ruta ya puesta. */}
        <div className="border-t border-gray-800 pt-5 flex flex-col gap-2.5">
          <p className="text-[13px] text-gray-500 leading-relaxed">
            ¿Has llegado desde un botón de la app? Entonces el enlace está roto y
            es cosa mía. Cuéntamelo y lo arreglo.
          </p>
          <Sugerencias
            tipoInicial="error"
            textoInicial={ruta ? 'Llegué a un 404 desde: ' : ''}
            clase="w-full border border-dashed border-gray-700 hover:border-orange-500/60 text-gray-400 hover:text-white py-2.5 rounded-xl text-[13.5px] transition"
            etiqueta="Avisar de este enlace roto"
          />
        </div>

      </div>
    </main>
  )
}
