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
//   · PlantaMoviles y DosMoviles (22-10-2026): en las seis pruebas que se miran
//     desde dos cámaras, dónde va cada móvil visto desde arriba, y cómo grabarlas
//     con dos móviles o con uno.
//
// El contenido vive en lib/fichas-movimiento.

import { useState, type ReactNode } from 'react'
import { DE_VISTA, type DefBateria, type Prueba, type PruebaDolor, type Vista } from '@/lib/baterias-movimiento'
import {
  FICHAS, MATERIAL, COMO_SE_PASA, DICE_DOLOR, GRABAR_SIEMPRE, grabarDosVistas, type FichaPrueba as Ficha,
} from '@/lib/fichas-movimiento'

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

/** El color de cada vista en las pruebas de dos: de perfil, azul; la otra, rosa. Igual en el visor. */
export const COLOR_VISTA = { perfil: '#38bdf8', otra: '#f472b6' }
export const colorVista = (v: Vista) => (v === 'perfil' ? COLOR_VISTA.perfil : COLOR_VISTA.otra)
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Desde arriba: dónde va cada móvil en una prueba de dos vistas, a unos 3 m (un
 * cuadro es un metro). De pie (perfil y frente) o a cuatro patas (la elevación
 * diagonal: desde atrás y de perfil).
 */
export function PlantaMoviles({ prueba, className = '' }: { prueba: Prueba; className?: string }) {
  if (prueba.vistas.length !== 2) return null
  const aCuatroPatas = prueba.vistas.includes('atras')
  const otra = prueba.vistas.find(v => v !== 'perfil') ?? prueba.vistas[1]
  const rejilla = []
  for (let x = 20; x <= 420; x += 40) rejilla.push(<line key={'x' + x} x1={x} y1={10} x2={x} y2={290} stroke="rgba(255,255,255,.05)" />)
  for (let y = 10; y <= 290; y += 40) rejilla.push(<line key={'y' + y} x1={20} y1={y} x2={420} y2={y} stroke="rgba(255,255,255,.05)" />)
  const cota = { stroke: '#a0aab7', strokeDasharray: '3 4' }
  const texto = { fill: '#d7dce3', fontSize: 12 }
  const num = { fill: '#a0aab7', fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }
  return (
    <svg viewBox="0 0 440 300" className={'w-full h-auto ' + className} role="img"
      aria-label={'Visto desde arriba: un móvil ' + DE_VISTA[prueba.vistas[0]] + ' y otro ' + DE_VISTA[prueba.vistas[1]] + ', a unos 3 metros'}>
      {rejilla}
      {aCuatroPatas ? (
        <>
          <polygon points="344,100 90,40 90,160" fill="rgba(244,114,182,.12)" stroke={COLOR_VISTA.otra} strokeOpacity={0.45} />
          <polygon points="170,214 90,60 250,60" fill="rgba(56,189,248,.12)" stroke={COLOR_VISTA.perfil} strokeOpacity={0.45} />
          <line x1={204} y1={91} x2={228} y2={93} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
          <line x1={204} y1={109} x2={228} y2={107} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={170} cy={100} rx={44} ry={13} fill="#263142" stroke="#cbd5e1" strokeWidth={1.4} />
          <circle cx={118} cy={100} r={8.5} fill="#cbd5e1" />
          <circle cx={134} cy={88} r={4.5} fill="#64748b" />
          <line x1={138} y1={112} x2={84} y2={112} stroke="#f8fafc" strokeWidth={4} strokeLinecap="round" />
          <line x1={200} y1={91} x2={262} y2={91} stroke="#f8fafc" strokeWidth={4} strokeLinecap="round" />
          <line x1={170} y1={118} x2={170} y2={208} {...cota} />
          <text x={178} y={168} {...num}>3 m</text>
          <line x1={232} y1={128} x2={340} y2={128} {...cota} />
          <text x={276} y={142} {...num}>3 m</text>
          <rect x={344} y={88} width={12} height={24} rx={3} fill={COLOR_VISTA.otra} />
          <rect x={158} y={214} width={24} height={12} rx={3} fill={COLOR_VISTA.perfil} />
          <text x={292} y={80} {...texto}>{mayuscula(DE_VISTA[otra])}, bajo</text>
          <text x={190} y={224} {...texto}>De perfil, bajo</text>
        </>
      ) : (
        <>
          <polygon points="170,214 130,64 210,64" fill="rgba(244,114,182,.12)" stroke={COLOR_VISTA.otra} strokeOpacity={0.45} />
          <polygon points="284,100 120,56 120,144" fill="rgba(56,189,248,.12)" stroke={COLOR_VISTA.perfil} strokeOpacity={0.45} />
          <ellipse cx={158} cy={113} rx={5} ry={9} fill="#64748b" />
          <ellipse cx={182} cy={113} rx={5} ry={9} fill="#64748b" />
          <ellipse cx={170} cy={100} rx={24} ry={9} fill="#263142" stroke="#cbd5e1" strokeWidth={1.4} />
          <circle cx={170} cy={99} r={8.5} fill="#cbd5e1" />
          <line x1={170} y1={130} x2={170} y2={208} {...cota} />
          <text x={178} y={172} {...num}>3 m</text>
          <line x1={198} y1={122} x2={282} y2={122} {...cota} />
          <text x={230} y={136} {...num}>3 m</text>
          <rect x={158} y={214} width={24} height={12} rx={3} fill={COLOR_VISTA.otra} />
          <rect x={284} y={88} width={12} height={24} rx={3} fill={COLOR_VISTA.perfil} />
          <text x={190} y={224} {...texto}>{mayuscula(DE_VISTA[otra])}</text>
          <text x={304} y={104} {...texto}>De perfil</text>
        </>
      )}
      <line x1={20} y1={282} x2={60} y2={282} stroke="#a0aab7" />
      <text x={66} y={286} {...num}>1 m</text>
    </svg>
  )
}

/** Cómo grabar una prueba de dos vistas: con dos móviles, a la vez; con uno, moviéndolo entre intentos. */
export function DosMoviles({ prueba, conPlanta = true }: { prueba: Prueba; conPlanta?: boolean }) {
  const g = grabarDosVistas(prueba)
  if (!g) return null
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start">
      {conPlanta && <PlantaMoviles prueba={prueba} className="max-w-[260px] flex-none rounded-lg bg-black/30" />}
      <ul className="flex flex-col gap-1.5 text-[12.5px] text-gray-300 min-w-0">
        <li><b className="text-gray-100">Con dos móviles, lo mejor.</b> {g.conDos}</li>
        <li><b className="text-gray-100">Con uno.</b> {g.conUno}
          <span className="ml-1.5 text-[10.5px] font-semibold px-1.5 py-px rounded-full bg-amber-400/15 text-amber-200 whitespace-nowrap">propuesta</span></li>
        <li className="text-gray-400">{g.palmada}</li>
      </ul>
    </div>
  )
}

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
      {prueba.vistas.length === 2 && (
        <div className="sm:col-span-2"><Bloque titulo="Las dos vistas · con dos móviles o con uno"><DosMoviles prueba={prueba} /></Bloque></div>
      )}
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
      {pestana === 'grabar' && <><Grabar f={f} /><DosMoviles prueba={prueba} /></>}
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
