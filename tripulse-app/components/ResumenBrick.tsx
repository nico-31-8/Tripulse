'use client'
// Tira de resumen de un brick en la ficha de la sesión: la secuencia de bloques
// con sus transiciones entre medias.
//
// Existe porque las transiciones NO son tareas a propósito (contarían como carga
// y volumen de alguna disciplina, ver lib/atribucion), así que no aparecen en la
// tabla de tareas. Este es el único sitio donde el atleta las ve.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cargaZona } from '@/lib/zonas'
import ConstructorBrick from './ConstructorBrick'
import {
  interferencia, factorConcatenacion, cargarBrick, guardarBrick, brickValido, rpeBrick,
  BRICK_VACIO, type BrickValor,
} from '@/lib/bricks'

const EMOJI: Record<string, string> = { Natacion: '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️' }
const NOMBRE: Record<string, string> = { Natacion: 'Natación', Ciclismo: 'Ciclismo', Carrera: 'Carrera', Fuerza: 'Fuerza' }

interface Props {
  sesionId: number
  transiciones: BrickValor['transiciones']
  editable?: boolean
  depId?: number | null
  /** Guardar cambia la duración y el RPE de la sesión: el padre tiene que releer. */
  onGuardado?: () => void
}

export default function ResumenBrick({ sesionId, transiciones, editable = false, depId = null, onGuardado }: Props) {
  const [valor, setValor] = useState<BrickValor>(BRICK_VACIO)
  const [minutos, setMinutos] = useState<number[]>([])
  const [editando, setEditando] = useState<BrickValor | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const v = await cargarBrick(supabase, sesionId)
    setValor(v)
    setMinutos(v.bloques.map(b => b.minutos))
  }, [sesionId])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!editando) return
    if (!brickValido(editando)) { alert('Un brick necesita al menos dos bloques con duración.'); return }
    setGuardando(true)
    const err = await guardarBrick(supabase, sesionId, editando)
    if (err) { alert('No se han podido guardar los bloques.\n\n' + err); setGuardando(false); return }
    // La duración y el RPE de la sesión salen de sus bloques: si cambian, se recalculan.
    await supabase.from('sesion').update({
      duracion_minutos: editando.bloques.reduce((a, b) => a + b.minutos, 0),
      rpe_estimado: rpeBrick(editando),
    }).eq('id', sesionId)
    setEditando(null)
    setGuardando(false)
    await cargar()
    /* Aquí había un `window.location.reload()`. La razón era buena —la tabla
       de tareas y la cabecera leen de la BD al montar, y la duración de la
       sesión acaba de cambiar— pero la solución era la más bruta posible:
       pantalla en blanco y la app entera de cero para reflejar un cambio.
       Ahora se avisa al padre, que ya sabe releer lo suyo y remontar la tabla. */
    onGuardado?.()
  }

  const bloques = valor.bloques
  if (bloques.length < 2 && !editando) return null

  const total = minutos.reduce((a, b) => a + b, 0)

  if (editando) {
    return (
      <div className="bg-purple-900/20 border border-purple-800/50 rounded-xl p-4 mb-4">
        <p className="text-purple-300 font-semibold text-sm mb-3">🔀 Editando el brick</p>
        <ConstructorBrick valor={editando} onChange={setEditando} depId={depId} />
        <div className="flex gap-2 mt-3">
          <button onClick={guardar} disabled={guardando}
            className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar bloques'}
          </button>
          <button onClick={() => setEditando(null)} disabled={guardando}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm text-gray-400 transition">
            Cancelar
          </button>
        </div>
        <p className="text-gray-600 text-[11px] mt-2">Al guardar se reescriben las tareas de la sesión.</p>
      </div>
    )
  }

  return (
    <div className="bg-purple-900/20 border border-purple-800/50 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-purple-300 font-semibold text-sm">🔀 Brick · {bloques.length} esfuerzos encadenados</p>
        <div className="flex items-center gap-3">
          {total > 0 && <p className="text-gray-500 text-xs">{total} min en total</p>}
          {editable && (
            <button onClick={() => setEditando({ bloques: bloques.map(b => ({ ...b })), transiciones: valor.transiciones })}
              className="text-orange-400 hover:text-orange-300 text-xs transition">
              Editar bloques
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {bloques.map((b, i) => {
          const previo = bloques[i - 1]
          const trans = (valor.transiciones.length ? valor.transiciones : transiciones).find(t => t.despues_de === i)
          const factor = previo ? factorConcatenacion(previo.disciplina, b.disciplina) : 1
          const inter = previo ? interferencia(previo.disciplina, b.disciplina) : null
          const col = cargaZona(b.zona).color
          return (
            <div key={i}>
              {trans && (
                <div className="flex items-center gap-2 pl-4 py-1 text-xs">
                  <span className="text-purple-400">⇄</span>
                  <span className="text-gray-400">Transición {trans.segundos}s</span>
                  {trans.nota && <span className="text-gray-500 italic">· {trans.nota}</span>}
                </div>
              )}
              <div className="flex items-center gap-2.5 bg-gray-900/60 rounded-lg px-3 py-2">
                <span className="text-gray-600 text-xs font-bold">{i + 1}</span>
                <span>{EMOJI[b.disciplina]}</span>
                <span className="text-white text-sm flex-1">{NOMBRE[b.disciplina] || b.disciplina}</span>
                {b.minutos > 0 && <span className="text-gray-400 text-xs">{b.minutos} min</span>}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: col, color: '#0a0b0f' }}>{b.zona}</span>
              </div>
              {trans && factor > 1 && inter && (
                <p className="text-[11px] text-orange-400/70 pl-4 pt-1">
                  Cuesta ×{factor.toFixed(2).replace('.', ',')} por venir después de {NOMBRE[previo.disciplina].toLowerCase()} · {inter.porque}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
