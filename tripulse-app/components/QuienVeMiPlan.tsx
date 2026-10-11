'use client'
// ============================================================
// «Quién puede ver tu plan» (Mi perfil del deportista)
// ============================================================
// Su entrenador y, si su entrenador trabaja con un director y se lo ha
// abierto, ese director. Es la cara visible de una decisión de privacidad: la
// salud y el plan son datos suyos, y tiene derecho a saber quién los ve. Sale de
// quien_ve_mi_plan() (supabase/director-1-base.sql).
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Fila = { id_perfil: string; nombre: string | null; papel: 'entrenador' | 'director'; desde: string | null }

export default function QuienVeMiPlan() {
  const [filas, setFilas] = useState<Fila[] | null>(null)

  useEffect(() => {
    supabase.rpc('quien_ve_mi_plan').then(({ data, error }) => setFilas(error ? null : (data || []) as Fila[]))
  }, [])

  /* Sin entrenador no hay nada que contar, y si la función falla, tampoco: es
     una tarjeta informativa. */
  if (!filas || !filas.length) return null
  const entrenador = filas.find(f => f.papel === 'entrenador')
  const directores = filas.filter(f => f.papel === 'director')

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
      <h3 className="text-xl font-bold mb-1">Quién puede ver tu plan</h3>
      <p className="text-gray-400 text-sm mb-4">Las personas que ven tus sesiones, tus tests y tus datos de salud.</p>
      <ul className="flex flex-col gap-2">
        {entrenador && (
          <li className="bg-gray-800 rounded-xl px-4 py-3">
            <p className="font-semibold text-white">{entrenador.nombre} <span className="text-gray-400 font-normal text-sm">· tu entrenador</span></p>
            <p className="text-gray-400 text-xs mt-0.5">Todo, y vuestro chat.</p>
          </li>
        )}
        {directores.map(d => (
          <li key={d.id_perfil} className="bg-gray-800 rounded-xl px-4 py-3">
            <p className="font-semibold text-white">{d.nombre} <span className="text-gray-400 font-normal text-sm">· dirige a tu entrenador</span></p>
            <p className="text-gray-400 text-xs mt-0.5">Tu plan, tus tests y tu salud, porque tu entrenador se lo ha abierto. Vuestro chat no.</p>
          </li>
        ))}
      </ul>
      {directores.length === 0 && <p className="text-gray-500 text-xs mt-3">Ahora mismo, solo tu entrenador.</p>}
    </div>
  )
}
