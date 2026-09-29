'use client'
// ============================================================
// «¿Con qué lo has hecho?» — elegir el material al cerrar un entreno
// ============================================================
//
// Una pieza para las DOS pantallas donde el atleta cierra: la sesión que le pone
// su entrenador (/sesion/[id]/ejecutar) y la que se apunta él (/apuntar). Es la
// misma pregunta, y con dos copias una acabaría enseñando los kilómetros y la
// otra no.
//
// UN GRUPO POR DEPORTE, y no una lista suelta, porque un brick se hace con la
// bici Y con las zapatillas: hay que elegir una cosa de cada. Solo sale el
// material de los deportes de ESA sesión, y sin jubilar.
//
// «NO LO SÉ» TIENE QUE EXISTIR. Sin esa salida, el que no se acuerde elegirá
// cualquiera para quitarse el paso de encima y ensuciará el acumulado, que es
// justo lo que da valor a esto.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  cargarKmDeMateriales, comoSeLlama, siLeSumo, valeParaLaSesion,
  type Material, type KmDeMaterial,
} from '@/lib/material'

const EMOJI: Record<string, string> = { zapatillas: '👟', bicicleta: '🚴', neopreno: '🏊', otro: '🎽' }

export default function ElegirMaterial({ idDeportista, disciplinas, metrosPorDisciplina = {}, elegidos, onCambio }: {
  idDeportista: number | null | undefined
  /** Los deportes de esta sesión. Un brick trae varios. */
  disciplinas: string[]
  /** Los metros de esta sesión por deporte: para avisar antes de guardar. */
  metrosPorDisciplina?: Record<string, number>
  elegidos: number[]
  onCambio: (ids: number[]) => void
}) {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [km, setKm] = useState<Record<number, KmDeMaterial>>({})
  const [cargado, setCargado] = useState(false)

  const cargar = useCallback(async () => {
    if (!idDeportista) { setCargado(true); return }
    const { data } = await supabase.from('material').select('*')
      .eq('id_deportista', idDeportista).eq('jubilado', false)
    const lista = (data || []) as Material[]
    setMateriales(lista)
    setKm(await cargarKmDeMateriales(supabase, lista))
    setCargado(true)
  }, [idDeportista])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  /* Los deportes que de verdad tienen algo que elegir. Sin esto, una sesión de
     natación de alguien que solo tiene zapatillas enseñaría un grupo vacío. */
  const grupos = [...new Set(disciplinas.filter(Boolean))]
    .map(d => ({ disciplina: d, opciones: materiales.filter(m => valeParaLaSesion(m, d)) }))
    .filter(g => g.opciones.length > 0)

  if (!cargado || !grupos.length) return null

  const elegir = (grupo: { opciones: Material[] }, id: number | null) => {
    /* Uno por deporte: al elegir, los de ese mismo grupo se sueltan. En un brick
       eso deja la bici puesta mientras cambias de zapatillas. */
    const delGrupo = new Set(grupo.opciones.map(m => m.id))
    onCambio([...elegidos.filter(x => !delGrupo.has(x)), ...(id ? [id] : [])])
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <p className="font-medium mb-3 mt-0">¿Con qué lo has hecho?</p>

      {grupos.map(g => {
        const elegido = g.opciones.find(m => elegidos.includes(m.id))
        const metros = Number(metrosPorDisciplina[g.disciplina]) || 0
        const k = elegido ? km[elegido.id] : null
        /* El «y si»: cómo quedaría con los kilómetros de hoy dentro. Avisar
           después de guardar llega tarde — ya ha corrido con ellas. */
        const tras = k && metros > 0 ? siLeSumo(k, metros) : null

        return (
          <div key={g.disciplina} className={grupos.length > 1 ? 'mb-4 last:mb-0' : ''}>
            {/* El rótulo del deporte solo cuando hay más de uno: en una sesión
                de carrera, poner «Carrera» encima de unas zapatillas sobra. */}
            {grupos.length > 1 && (
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 mt-0">{g.disciplina}</p>
            )}

            <div className="flex flex-col gap-2">
              {g.opciones.map(m => {
                const sel = elegidos.includes(m.id)
                const suyo = km[m.id]
                return (
                  <button key={m.id} type="button" onClick={() => elegir(g, sel ? null : m.id)}
                    className={'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ' +
                      (sel ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600')}>
                    <span className={'w-4 h-4 rounded-full border-2 flex-none ' +
                      (sel ? 'border-orange-500 bg-orange-500' : 'border-gray-600')} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">
                        {EMOJI[m.tipo] || '🎽'} {comoSeLlama(m)}
                      </span>
                      {m.apodo && <span className="block text-[11.5px] text-gray-500 truncate">{m.nombre}</span>}
                    </span>
                    {suyo && (
                      <span className={'text-[11.5px] tabular-nums flex-none ' +
                        (suyo.estado === 'pasado' ? 'text-red-300' : suyo.estado === 'aviso' ? 'text-amber-300' : 'text-gray-500')}>
                        {suyo.contador.toLocaleString('es-ES')} km
                      </span>
                    )}
                  </button>
                )
              })}

              <button type="button" onClick={() => elegir(g, null)}
                className={'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ' +
                  (!elegido ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600')}>
                <span className={'w-4 h-4 rounded-full border-2 flex-none ' +
                  (!elegido ? 'border-orange-500 bg-orange-500' : 'border-gray-600')} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold">No lo sé / otro</span>
                  <span className="block text-[11.5px] text-gray-500">No cuenta kilómetros</span>
                </span>
              </button>
            </div>

            {tras && tras.limite !== null && (tras.estado === 'aviso' || tras.estado === 'pasado') && (
              <p className={'rounded-xl px-3 py-2 text-[12.5px] mt-2 mb-0 border ' + (tras.estado === 'pasado'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300')}>
                {'⚠ Con estos ' + Math.round(metros / 100) / 10 + ' km, «' + comoSeLlama(elegido!) + '» '}
                {tras.estado === 'pasado'
                  ? 'se pasan de los ' + tras.limite + ' km. Toca cambiarlas.'
                  : 'llegan a ' + tras.contador + ' de ' + tras.limite + '. Quedan ' + tras.restante + ' km.'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
