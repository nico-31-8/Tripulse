'use client'
// ============================================================
// Cómo se pasa cada prueba: la ficha, el material y cómo se pasa la batería
// ============================================================
//
// Pedido el 22-10-2026 («no sé ni qué material, ni qué hay que utilizar, ni
// cómo») y aprobado con su maqueta. Las piezas:
//
//   · AntesDeEmpezar: el material de TODA la batería, para tenerlo listo antes
//     de empezar, y cómo se pasa. Las casillas son solo para quien lo prepara:
//     no se guardan.
//   · FichaPrueba: la ficha entera de una prueba (material, preparación, lo que
//     se le dice y cómo se graba), en la lista de la batería.
//   · FichaCorta: la misma ficha en pestañas, para el visor, al lado del vídeo.
//   · MaterialCorto: el material en una lista corta, para el lateral cuando la
//     batería ya está en marcha.
//
// El contenido vive en lib/fichas-movimiento.

import { useState, type ReactNode } from 'react'
import type { DefBateria, Prueba, PruebaDolor } from '@/lib/baterias-movimiento'
import { FICHAS, MATERIAL, COMO_SE_PASA, DICE_DOLOR, GRABAR_SIEMPRE, type FichaPrueba as Ficha } from '@/lib/fichas-movimiento'

const TITULO = 'text-[10.5px] font-semibold uppercase tracking-wider text-gray-500'

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3 flex flex-col gap-1.5 min-w-0">
      <p className={TITULO}>{titulo}</p>
      {children}
    </div>
  )
}

const Lista = ({ cosas }: { cosas: string[] }) => (
  <ul className="flex flex-col gap-1 text-[12.5px] text-gray-200 list-disc pl-4">
    {cosas.map(c => <li key={c}>{c}</li>)}
  </ul>
)

const Pasos = ({ f }: { f: Ficha }) => (
  <>
    <ol className="flex flex-col gap-1 text-[12.5px] text-gray-100 list-decimal pl-4 marker:text-orange-300 marker:font-mono">
      {f.pasos.map(p => <li key={p}>«{p}»</li>)}
    </ol>
    <p className="text-[11.5px] text-gray-400">{f.intentos}</p>
  </>
)

const Grabar = ({ f }: { f: Ficha }) => (
  <>
    <Lista cosas={f.grabar} />
    <p className="text-[11.5px] text-gray-500">{GRABAR_SIEMPRE}</p>
  </>
)

/** La prueba de dolor que la acompaña (FMS), con lo que se le dice. */
function Dolor({ prueba, dolor }: { prueba: Prueba; dolor: PruebaDolor }) {
  return (
    <p className="sm:col-span-2 rounded-xl border border-dashed border-white/[0.12] px-3.5 py-2.5 text-[12px] text-gray-400">
      <b className="text-gray-200">{dolor.nombre}:</b> «{DICE_DOLOR[dolor.clave] || dolor.como}» Sin vídeo
      {dolor.bilateral ? ', con los dos lados' : ''}. Si duele, {prueba.nombre.toLowerCase()} vale 0.
    </p>
  )
}

/** De dónde sale lo que no es de la fuente: las fotos del artículo y las vistas nuevas. */
function Procedencia({ f }: { f: Ficha }) {
  if (!f.deLaFoto && !f.vistaNueva) return null
  return (
    <p className="sm:col-span-2 text-[11px] text-gray-500 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {f.deLaFoto && <><span className="px-1.5 py-px rounded-full bg-white/[0.06] text-gray-400 font-semibold">de la foto del artículo</span>
        <span>Las posiciones salen de las fotos del artículo: la descripción completa está en otro, de pago.</span></>}
      {f.vistaNueva && <><span className="px-1.5 py-px rounded-full bg-amber-400/10 text-amber-200 font-semibold">vista nueva</span><span>{f.vistaNueva}</span></>}
    </p>
  )
}

/** La ficha entera de una prueba. */
export function FichaPrueba({ prueba, dolor = null }: { prueba: Prueba; dolor?: PruebaDolor | null }) {
  const f = FICHAS[prueba.clave]
  if (!f) return null
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <Bloque titulo="Material"><Lista cosas={f.material} /></Bloque>
      <Bloque titulo="Preparación"><Lista cosas={f.preparacion} /></Bloque>
      <Bloque titulo="Cómo se hace · lo que le dices"><Pasos f={f} /></Bloque>
      <Bloque titulo="Cómo se graba"><Grabar f={f} /></Bloque>
      {f.ojo && (
        <p className="sm:col-span-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-2.5 text-[12px] text-amber-200">
          <b className="text-amber-100">Ojo:</b> {f.ojo}
          {f.ojoPropio && <span className="ml-2 text-[10.5px] font-semibold px-1.5 py-px rounded-full bg-amber-400/15 text-amber-200">propuesta</span>}
        </p>
      )}
      {dolor && <Dolor prueba={prueba} dolor={dolor} />}
      <Procedencia f={f} />
    </div>
  )
}

type Pestana = 'pasos' | 'material' | 'grabar'

/** La misma ficha, en pestañas, para el visor. */
export function FichaCorta({ prueba }: { prueba: Prueba }) {
  const [pestana, setPestana] = useState<Pestana>('pasos')
  const f = FICHAS[prueba.clave]
  if (!f) return <p className="text-[12.5px] text-gray-400">{prueba.montaje}</p>
  const boton = (k: Pestana, t: string) => (
    <button key={k} type="button" aria-pressed={pestana === k} onClick={() => setPestana(k)}
      className={'text-[11.5px] px-2.5 py-1 rounded-lg border transition ' + (pestana === k
        ? 'bg-sky-300/10 border-sky-300/45 text-white' : 'border-white/[0.1] text-gray-400 hover:text-white')}>
      {t}
    </button>
  )
  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Qué ver de la prueba">
        {boton('pasos', 'Cómo se hace')}{boton('material', 'Material')}{boton('grabar', 'Cómo se graba')}
      </div>
      {pestana === 'pasos' && <Pasos f={f} />}
      {pestana === 'material' && <><Lista cosas={f.material} /><Lista cosas={f.preparacion} /></>}
      {pestana === 'grabar' && <Grabar f={f} />}
      {f.ojo && pestana === 'pasos' && <p className="text-[11.5px] text-amber-200">Ojo: {f.ojo}</p>}
    </div>
  )
}

/** Antes de empezar: el material de toda la batería, para tenerlo listo, y cómo se pasa. */
export function AntesDeEmpezar({ def }: { def: DefBateria }) {
  const material = MATERIAL[def.id]
  const como = COMO_SE_PASA[def.id]
  const [listo, setListo] = useState<Set<number>>(new Set())
  const marcar = (i: number) => setListo(s => {
    const n = new Set(s)
    if (n.has(i)) n.delete(i); else n.add(i)
    return n
  })
  const grupos = [...new Set(material.map(m => m.grupo))]
  return (
    <section className="rounded-2xl border border-sky-300/35 bg-sky-300/[0.05] p-4 flex flex-col gap-3" aria-labelledby={'antes-' + def.id}>
      <div>
        <p id={'antes-' + def.id} className="text-[11px] font-semibold uppercase tracking-wider text-sky-200">Antes de empezar · lo que necesitas</p>
        <p className="text-[12px] text-gray-400 mt-0.5">
          Todo esto vale para las {def.pruebas.length} pruebas. Lo que solo usa una prueba lo dice al lado.
        </p>
      </div>
      {grupos.map(g => (
        <div key={g} className="flex flex-col gap-1.5">
          <p className={TITULO}>{g}</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {material.map((m, i) => m.grupo !== g ? null : (
              <li key={m.cosa}>
                <label className={'h-full flex gap-2.5 items-start rounded-xl border px-3 py-2.5 cursor-pointer transition ' + (listo.has(i)
                  ? 'border-green-500/35 bg-green-500/[0.05]' : 'border-white/[0.07] bg-black/20 hover:border-white/[0.14]')}>
                  <input type="checkbox" checked={listo.has(i)} onChange={() => marcar(i)} className="mt-0.5 w-4 h-4 accent-sky-400 flex-none" />
                  <span className="min-w-0">
                    <b className={'block text-[13px] ' + (listo.has(i) ? 'text-gray-400 line-through decoration-white/30' : 'text-gray-100')}>{m.cosa}</b>
                    <span className="block text-[12px] text-gray-400">{m.medida}</span>
                    <span className="block text-[11.5px] text-gray-500 mt-0.5"><b className="text-gray-400 font-semibold">Para:</b> {m.para}</span>
                    {m.casera && <span className="block text-[11.5px] text-green-300/90 mt-0.5">{m.casera}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-[11.5px] text-gray-500">
        {listo.size === material.length ? 'Todo listo.' : 'Llevas ' + listo.size + ' de ' + material.length + '. Marcarlo es opcional: es para ti, y no se guarda.'}
      </p>
      <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
        <p className="text-[13px] font-semibold mb-1.5">Cómo se pasa el {def.nombre}</p>
        <ul className="flex flex-col gap-1 text-[12.5px] text-gray-400 list-disc pl-4">
          {como.reglas.map(r => <li key={r.regla}><b className="text-gray-200">{r.regla}</b>{r.detalle ? ' ' + r.detalle : ''}</li>)}
        </ul>
        <p className="text-[11px] text-gray-500 mt-1.5">Según {como.fuente}</p>
      </div>
    </section>
  )
}

/** El material en corto, para el lateral cuando la batería ya está en marcha. */
export function MaterialCorto({ def }: { def: DefBateria }) {
  return (
    <ul className="flex flex-col gap-1.5 text-[12px]">
      {MATERIAL[def.id].map(m => (
        <li key={m.cosa} className="text-gray-300">
          {m.cosa}<span className="block text-[11px] text-gray-500">{m.medida}</span>
        </li>
      ))}
    </ul>
  )
}
