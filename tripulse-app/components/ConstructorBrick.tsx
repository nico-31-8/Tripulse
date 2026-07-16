'use client'
// Constructor de bricks. Componente controlado y compartido: el modal de crear
// sesión está copiado en varios sitios (bloques, calendario, semana), así que el
// brick vive aquí una sola vez y allí solo se enchufa.
//
// Flujo (decidido con el usuario): eliges las disciplinas en orden → el sistema
// te ofrece los ejemplos de B1-04 que encajan con ESA secuencia → o vas libre.
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ZONAS_RESISTENCIA } from '@/lib/zonas'
import {
  DISCIPLINAS_BRICK, plantillasPara, interferencia, factorConcatenacion,
  type BrickBloque, type BrickValor,
} from '@/lib/bricks'
import { calcularFactorBrick, clavePar, type FactorBrickResultado } from '@/lib/sicat-brick'

const EMOJI: Record<string, string> = { Natacion: '🏊', Ciclismo: '🚴', Carrera: '🏃' }
const NOMBRE: Record<string, string> = { Natacion: 'Natación', Ciclismo: 'Ciclismo', Carrera: 'Carrera' }

// Transiciones para N bloques: una entre cada par consecutivo (eso ES el brick).
function transicionesPara(bloques: BrickBloque[], previas: BrickValor['transiciones']): BrickValor['transiciones'] {
  return bloques.slice(0, -1).map((_, i) => {
    const orden = i + 1
    const ya = previas.find(t => t.despues_de === orden)
    return { despues_de: orden, segundos: ya?.segundos ?? 90, nota: ya?.nota ?? null }
  })
}

interface Props {
  valor: BrickValor
  onChange: (v: BrickValor) => void
  // Si se pasa, el sobrecoste que se muestra es el APRENDIDO de ese atleta en vez del
  // estándar de B1-04 (que la propia fuente dice que es «en atletas sin entrenamiento brick»).
  depId?: number | null
}

export default function ConstructorBrick({ valor, onChange, depId = null }: Props) {
  const [plantillaUsada, setPlantillaUsada] = useState<string | null>(null)
  const [factores, setFactores] = useState<FactorBrickResultado | null>(null)

  useEffect(() => {
    if (!depId) { setFactores(null); return }
    calcularFactorBrick(supabase, depId).then(setFactores).catch(() => setFactores(null))
  }, [depId])

  const set = (bloques: BrickBloque[], transiciones?: BrickValor['transiciones']) =>
    onChange({ bloques, transiciones: transicionesPara(bloques, transiciones ?? valor.transiciones) })

  const añadir = (disc: string) => {
    setPlantillaUsada(null)
    set([...valor.bloques, { disciplina: disc, minutos: 30, zona: 'AEL' }])
  }
  const quitar = (i: number) => {
    setPlantillaUsada(null)
    set(valor.bloques.filter((_, x) => x !== i))
  }
  const editar = (i: number, campo: keyof BrickBloque, v: any) => {
    setPlantillaUsada(null)
    set(valor.bloques.map((b, x) => (x === i ? { ...b, [campo]: v } : b)))
  }
  const editarTransicion = (orden: number, segundos: number) =>
    onChange({ ...valor, transiciones: valor.transiciones.map(t => (t.despues_de === orden ? { ...t, segundos } : t)) })

  const secuencia = valor.bloques.map(b => b.disciplina)
  const ejemplos = plantillasPara(secuencia)

  const aplicar = (id: string) => {
    const p = ejemplos.find(e => e.id === id)
    if (!p) return
    setPlantillaUsada(id)
    onChange({
      bloques: p.bloques.map(b => ({ ...b })),
      transiciones: p.bloques.slice(0, -1).map((_, i) => ({ despues_de: i + 1, segundos: p.transicionSeg, nota: null })),
    })
  }

  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col gap-3">

      {/* ---- 1. Disciplinas en orden ---- */}
      <div>
        <p className="text-gray-400 text-xs mb-2">Disciplinas, en el orden en que se encadenan</p>
        <div className="flex gap-2 flex-wrap items-center">
          {valor.bloques.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5 bg-gray-800 border border-gray-600 rounded-lg pl-2 pr-1 py-1.5 text-xs text-white">
              <span className="text-gray-500 font-bold">{i + 1}</span>
              <span>{EMOJI[b.disciplina]} {NOMBRE[b.disciplina] || b.disciplina}</span>
              <button type="button" onClick={() => quitar(i)} className="text-gray-500 hover:text-red-400 px-1 leading-none" aria-label="Quitar bloque">×</button>
            </span>
          ))}
          {DISCIPLINAS_BRICK.map(d => (
            <button type="button" key={d} onClick={() => añadir(d)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-gray-600 text-gray-400 hover:border-orange-500 hover:text-orange-400 transition">
              + {EMOJI[d]} {NOMBRE[d]}
            </button>
          ))}
        </div>
        {valor.bloques.length === 1 && (
          <p className="text-gray-500 text-[11px] mt-2">Añade al menos una disciplina más: un brick son dos esfuerzos encadenados.</p>
        )}
      </div>

      {/* ---- 2. Ejemplos que encajan con esa secuencia ---- */}
      {valor.bloques.length >= 2 && (
        <div className="border-t border-gray-700 pt-3">
          {ejemplos.length > 0 ? (
            <>
              <p className="text-gray-400 text-xs mb-2">
                Ejemplos para {secuencia.map(d => NOMBRE[d]).join(' → ').toLowerCase()} · o edítalo libremente
              </p>
              <div className="flex gap-2 flex-wrap">
                {ejemplos.map(p => (
                  <button type="button" key={p.id} onClick={() => aplicar(p.id)}
                    className={'text-xs px-2.5 py-1.5 rounded-lg border transition text-left ' +
                      (plantillaUsada === p.id
                        ? 'border-orange-500 bg-orange-500/10 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500')}>
                    {p.nombre}
                  </button>
                ))}
              </div>
              {plantillaUsada && (() => {
                const p = ejemplos.find(e => e.id === plantillaUsada)!
                return (
                  <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                    <p><span className="text-gray-400">{p.formato}</span> · {p.objetivo}</p>
                    <p className="text-gray-600">Fase: {p.fase}</p>
                    {p.nota && <p className="text-gray-600 italic mt-0.5">{p.nota}</p>}
                  </div>
                )
              })()}
            </>
          ) : (
            <p className="text-gray-500 text-[11px]">
              No hay ejemplo de B1-04 para esta combinación: móntalo libremente abajo.
            </p>
          )}
        </div>
      )}

      {/* ---- 3. Bloques y transiciones ---- */}
      {valor.bloques.length > 0 && (
        <div className="border-t border-gray-700 pt-3 flex flex-col gap-1.5">
          {valor.bloques.map((b, i) => {
            const previo = valor.bloques[i - 1]
            const trans = valor.transiciones.find(t => t.despues_de === i)
            const inter = previo ? interferencia(previo.disciplina, b.disciplina) : null
            // El factor del atleta si lo hemos aprendido de su historial; si no, el de B1-04.
            const suyo = previo ? factores?.[clavePar(previo.disciplina, b.disciplina)] : null
            const aprendido = !!suyo?.aprendido
            const factor = previo
              ? (aprendido ? suyo!.factor : factorConcatenacion(previo.disciplina, b.disciplina))
              : 1
            return (
              <div key={i}>
                {/* Transición antes de este bloque */}
                {trans && (
                  <div className="flex items-center gap-2 pl-3 py-1 text-[11px]">
                    <span className="text-gray-600">⇄</span>
                    <span className="text-gray-500">Transición</span>
                    <input type="number" min={0} value={trans.segundos}
                      onChange={e => editarTransicion(trans.despues_de, Number(e.target.value))}
                      className="w-14 bg-gray-800 text-white px-1.5 py-0.5 rounded border border-gray-700 outline-none focus:border-orange-500 text-[11px]" />
                    <span className="text-gray-600">s</span>
                    {factor > 1 && (
                      <span className={aprendido ? 'text-purple-300' : 'text-orange-400/80'}
                        title={aprendido
                          ? `Aprendido de ${suyo!.nBrick} bloques suyos post-transición (RPE medio ${suyo!.rpeBrick?.toFixed(1)}) frente a ${suyo!.nFresco} en fresco (RPE medio ${suyo!.rpeFresco?.toFixed(1)}). El estándar de B1-04 es ×${suyo!.porDefecto.toFixed(2)}.`
                          : inter?.porque}>
                        · el bloque siguiente cuesta ×{factor.toFixed(2).replace('.', ',')}
                        {aprendido ? ' (medido en él)' : ` (${inter?.nivel})`}
                      </span>
                    )}
                    {factor === 1 && inter && (
                      <span className="text-gray-600" title={inter.porque}>· interferencia {inter.nivel}, sin sobrecoste</span>
                    )}
                  </div>
                )}
                {/* Bloque */}
                <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-2.5 py-2 border border-gray-700">
                  <span className="text-gray-500 text-xs font-bold w-3">{i + 1}</span>
                  <span className="text-sm">{EMOJI[b.disciplina]}</span>
                  <span className="text-white text-xs flex-1 truncate">{NOMBRE[b.disciplina] || b.disciplina}</span>
                  <input type="number" min={1} value={b.minutos}
                    onChange={e => editar(i, 'minutos', Number(e.target.value))}
                    className="w-14 bg-gray-900 text-white px-1.5 py-1 rounded border border-gray-700 outline-none focus:border-orange-500 text-xs" />
                  <span className="text-gray-500 text-[11px]">min</span>
                  <select value={b.zona} onChange={e => editar(i, 'zona', e.target.value)}
                    className="bg-gray-900 text-white px-1.5 py-1 rounded border border-gray-700 outline-none focus:border-orange-500 text-xs">
                    {ZONAS_RESISTENCIA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla}</option>)}
                  </select>
                </div>
              </div>
            )
          })}
          {valor.bloques.length >= 2 && (
            <p className="text-gray-600 text-[11px] mt-1">
              Total {valor.bloques.reduce((a, b) => a + (b.minutos || 0), 0)} min ·
              el volumen se reparte en cada deporte, no en «Brick».
            </p>
          )}
        </div>
      )}
    </div>
  )
}
