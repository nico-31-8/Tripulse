'use client'
// ============================================================
// El resultado de una batería de movimiento (FMS o Nine Test)
// ============================================================
//
// Lo usan el entrenador (pestaña Movimiento de Tests) y el deportista (Mis
// tests). Lo que se lee primero es qué prueba baja y de qué lado, porque eso es
// lo que se entrena; el total va arriba, pero es lo que menos dice: sirve para
// seguir a la persona consigo misma, no para predecir lesiones.

import { useState } from 'react'
import { resultadoBateria, textoTotal, type DefBateria } from '@/lib/baterias-movimiento'
import type { FilaPrueba, Valoracion } from '@/lib/movimiento-datos'
import { fechaLarga } from '@/lib/fechas'

const COLOR_NOTA: Record<number, string> = { 3: '#3fd08a', 2: '#f0b429', 1: '#f2545b', 0: '#f2545b' }

export default function ResultadoMovimiento({ def, valoracion, registros, previa, urls }: {
  def: DefBateria
  valoracion: Valoracion
  registros: FilaPrueba[]
  /** La anterior de la misma batería, para la raya gris de cada barra. */
  previa?: { valoracion: Valoracion; registros: FilaPrueba[] } | null
  urls: Record<string, string>
}) {
  const [grande, setGrande] = useState<string | null>(null)
  const res = resultadoBateria(def, registros)
  const ant = previa ? resultadoBateria(def, previa.registros) : null
  const delta = ant && ant.completa && res.completa ? res.total - ant.total : null

  /* Lo más bajo, para «lo que mirar»: la nota mínima y quién la tiene. */
  const notas = def.pruebas.map(p => ({ p, n: res.porPrueba[p.clave] })).filter(x => x.n.nota != null)
  const minima = notas.length ? Math.min(...notas.map(x => x.n.nota as number)) : null
  const masBajas = minima != null && minima < 3 ? notas.filter(x => x.n.nota === minima) : []

  const fotos = registros.filter(r => r.fotograma && urls[r.fotograma])

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold">{def.nombre} · {fechaLarga(valoracion.fecha).toLowerCase()}</p>
            <p className="text-[11.5px] text-gray-500">{def.pruebas.length} pruebas de 0 a 3 · en las de dos lados cuenta el peor{valoracion.modo === 'mano' ? ' · apuntado a mano' : ''}</p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums">{res.total}</span>
            <span className="font-mono text-[15px] text-gray-500">/ {res.maximo}</span>
            {!res.completa && <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">faltan {res.faltan}</span>}
            {delta != null && delta !== 0 && (
              <span className={'text-[11.5px] px-2 py-0.5 rounded-full ' + (delta > 0 ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300')}>
                {delta > 0 ? '+' : ''}{delta} desde el {fechaLarga(previa!.valoracion.fecha).toLowerCase()}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {def.pruebas.map(p => {
            const n = res.porPrueba[p.clave]
            const a = ant?.porPrueba[p.clave]
            const ancho = n.nota != null ? (n.nota / 3) * 100 : 0
            return (
              <div key={p.clave} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto_28px] gap-3 items-center text-[12.5px]">
                <span className="truncate" title={p.nombre}>{p.nombre}</span>
                <span className="relative h-2.5 rounded-full bg-white/[0.06]">
                  <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: ancho + '%', background: n.nota != null ? COLOR_NOTA[n.nota] : 'transparent' }} />
                  {a?.nota != null && (
                    <span className="absolute -top-1 w-0.5 h-[18px] rounded bg-slate-300/60" style={{ left: `calc(${(a.nota / 3) * 100}% - 1px)` }}
                      title={'El ' + fechaLarga(previa!.valoracion.fecha).toLowerCase() + ': ' + a.nota} />
                  )}
                </span>
                <span className={'font-mono text-[11px] text-right whitespace-nowrap ' + (n.asimetria ? 'text-amber-300' : 'text-gray-500')}>
                  {p.bilateral
                    ? `izq ${n.izq ?? '—'} · der ${n.der ?? '—'}${n.asimetria ? ' ⚠' : ''}`
                    : n.porDolor ? 'duele' : ''}
                </span>
                <span className="font-mono font-bold text-right" style={{ color: n.nota != null ? COLOR_NOTA[n.nota] : '#6b7280' }}>
                  {n.nota ?? '—'}
                </span>
              </div>
            )
          })}
        </div>
        {ant && <p className="text-[11px] text-gray-500">La raya gris de cada barra es el {fechaLarga(previa!.valoracion.fecha).toLowerCase()}.</p>}
      </div>

      {(masBajas.length > 0 || res.asimetrias.length > 0 || fotos.length > 0) && (
        <div className="border-t border-gray-800 p-4 flex flex-col gap-3 bg-black/20">
          {(masBajas.length > 0 || res.asimetrias.length > 0) && (
            <div className="text-[12.5px] text-gray-400 flex flex-col gap-1">
              {masBajas.length > 0 && (
                <p><b className="text-gray-200">Lo más bajo ({minima}):</b> {masBajas.map(x => x.p.nombre + (x.n.porDolor ? ' (duele)' : '')).join(', ')}.</p>
              )}
              {res.asimetrias.length > 0 && <p><b className="text-amber-300">⚠ Lados distintos:</b> {res.asimetrias.join(', ')}.</p>}
            </div>
          )}
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {fotos.map(r => {
                const p = def.pruebas.find(x => x.clave === r.prueba)
                const lado = r.lado === 'izq' ? ' · izq' : r.lado === 'der' ? ' · der' : ''
                return (
                  <button key={r.id} onClick={() => setGrande(r.fotograma)} className="relative rounded-lg overflow-hidden border border-gray-800 hover:border-orange-500/60 transition text-left"
                    title={'Ver ' + (p?.nombre || r.prueba) + lado}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[r.fotograma!]} alt={(p?.nombre || r.prueba) + lado} className="w-full aspect-[3/4] object-cover bg-black" />
                    <span className="absolute left-1 right-1 bottom-1 text-[10px] bg-black/65 rounded px-1.5 py-0.5 truncate">
                      {(p?.nombre || r.prueba) + lado} · {r.dolor ? 0 : r.nota}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-gray-500 border border-dashed border-gray-700 rounded-lg px-3 py-2">
            <b className="text-gray-300">Para seguirle a él, no para predecir.</b> El total sirve para comparar a la misma persona con el mismo evaluador.
            Que estas baterías sirvan para prevenir lesiones está sin demostrar: con el FMS, el corte en 14 deja pasar a tres de cada cuatro futuros lesionados.
          </p>
        </div>
      )}

      {grande && urls[grande] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setGrande(null)} role="dialog" aria-modal="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[grande]} alt="Fotograma guardado" className="max-w-full max-h-full rounded-lg" />
          <button onClick={() => setGrande(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none" aria-label="Cerrar">×</button>
        </div>
      )}
    </div>
  )
}

/** «15 / 21» o «12 de 21 · faltan 2», para listas. */
export function totalDe(def: DefBateria, registros: FilaPrueba[]): string {
  return textoTotal(resultadoBateria(def, registros))
}
