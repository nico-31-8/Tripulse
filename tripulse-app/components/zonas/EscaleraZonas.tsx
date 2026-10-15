'use client'
// ============================================================
// TRIPULSE — La escalera de una clasificación para un deportista
// ============================================================
//
// CADA ZONA EN SU CARRIL, TODAS SOBRE EL MISMO EJE. Así se ve de un vistazo lo
// que en una tabla de números no se ve: que cada zona empieza donde acaba la
// anterior, o que una le queda al revés, o que dos se pisan, o que entre dos
// hay un hueco. Los hitos (VT1, VT2…) van marcados encima.
//
// SOLO PINTA. Qué número sale, qué está al revés y qué se pisa lo decide
// lib/clasificaciones-zonas, con sus tests; aquí no se calcula nada que pueda
// discrepar con lo que se manda en la sesión.
import type React from 'react'
import { escalera, type Carril, type Evaluacion } from '@/lib/clasificaciones-zonas'
import { leerValor } from '@/lib/referencia-propia'
import { MESES_CORTOS } from '@/lib/fechas'

const ROJO = '#f2545b'
const AMBAR = '#f0b429'
const HITO = '#8ecbff'

/** «2026-10-02» → «2 oct». Sin Date: partir la cadena no tiene zona horaria. */
const fechaCorta = (iso: string): string => {
  const p = String(iso || '').split('-')
  return p.length === 3 ? Number(p[2]) + ' ' + (MESES_CORTOS[Number(p[1]) - 1] ?? '') : String(iso || '')
}

/** Cómo se pinta el tramo de una zona en su carril. */
function estiloTramo(c: Carril): React.CSSProperties {
  const base: React.CSSProperties = { left: c.izq + '%', width: c.ancho + '%' }
  if (c.estado === 'reves') {
    /* Rayado y en rojo: no es un tramo, es un aviso. */
    return {
      ...base,
      background: `repeating-linear-gradient(135deg, ${ROJO}8c 0 6px, ${ROJO}2e 6px 12px)`,
      outline: '1px solid ' + ROJO,
    }
  }
  const col = c.color || '#94a3b8'
  /* Lo que no tiene suelo o techo se difumina hacia el borde: sigue. */
  const fondo = c.abiertoIzq && c.abiertoDer
    ? `linear-gradient(90deg, transparent, ${col} 30%, ${col} 70%, transparent)`
    : c.abiertoIzq ? `linear-gradient(90deg, transparent, ${col} 45%)`
    : c.abiertoDer ? `linear-gradient(90deg, ${col} 55%, transparent)`
    : col
  return {
    ...base,
    background: fondo,
    borderTopLeftRadius: c.abiertoIzq ? 0 : 5, borderBottomLeftRadius: c.abiertoIzq ? 0 : 5,
    borderTopRightRadius: c.abiertoDer ? 0 : 5, borderBottomRightRadius: c.abiertoDer ? 0 : 5,
    ...(c.pisada ? { outline: '1.5px solid ' + AMBAR, outlineOffset: 1 } : {}),
  }
}

export default function EscaleraZonas({ ev, titulo, derecha, pista }: {
  ev: Evaluacion
  /** «Cómo le quedan a Ana». */
  titulo: string
  /** Lo que va a la derecha del título: el «Ver con: …». */
  derecha?: React.ReactNode
  /** Cuando a este le faltan los números: con quién sí se podría ver. */
  pista?: React.ReactNode
}) {
  const e = escalera(ev)
  const reves = ev.avisos.filter(a => a.tipo === 'reves').length
  const medidos = ev.hitos.filter(h => h.hito && h.valor !== null)

  /* La línea de los números: «VT1 12 · VT2 15 · VO2máx 17,5 km/h», y de qué día. */
  const fechas = medidos.map(h => h.fecha).filter((f): f is string => !!f).sort()
  const numeros = medidos.map(h => h.hito!.corto + ' ' + leerValor(h.valor!, ev.unidad, true)).join(' · ')
    + (medidos.length && ev.unidad ? ' ' + ev.unidad : '')
  const detalle = [fechas.length ? 'del ' + fechaCorta(fechas[fechas.length - 1]) : '', numeros].filter(Boolean).join(' · ')

  /* El estado, en una pastilla: se lee antes que la escalera. */
  const pastilla = !medidos.length
    ? { texto: 'sin sus números', clase: 'text-gray-300 bg-white/[0.07]' }
    : ev.avisos.length
      ? { texto: ev.avisos.length + (ev.avisos.length === 1 ? ' aviso' : ' avisos'),
          clase: reves ? 'text-[#ff9ca1] bg-[#f2545b]/15' : 'text-[#ffd77a] bg-[#f0b429]/15' }
      : ev.faltan.length
        ? { texto: 'le falta su ' + ev.faltan.join(' y su '), clase: 'text-gray-300 bg-white/[0.07]' }
        : { texto: 'encajan', clase: 'text-[#8ff0bf] bg-[#3fd08a]/15' }

  /* Dos hitos muy juntos no pueden llevar el nombre a la misma altura: el
     segundo sube un piso. */
  const pisos: number[] = []
  if (e) {
    const orden = e.marcas.map((m, i) => ({ m, i })).sort((a, b) => a.m.pos - b.m.pos)
    let ant = -100, piso = 0
    for (const { m, i } of orden) {
      piso = m.pos - ant < 9 ? 1 - piso : 0
      pisos[i] = piso
      ant = m.pos
    }
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/70 px-4 pt-3.5 pb-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <b className="text-[14px]">{titulo}</b>
        {detalle && <span className="text-gray-500 text-[12px] tabular-nums">{detalle}</span>}
        <span className={'text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ' + pastilla.clase}>{pastilla.texto}</span>
        {derecha && <span className="ml-auto">{derecha}</span>}
      </div>

      {!e ? (
        <div className="flex flex-col gap-2.5 py-2">
          <p className="text-gray-500 text-[12.5px]">
            {ev.hitos.length
              ? 'No tiene hecha la prueba de sus hitos, así que no hay números que pintar. Las zonas se le pueden mandar igual: salen sin ritmo.'
              : 'Esta clasificación aún no tiene hitos.'}
          </p>
          {pista}
        </div>
      ) : (
        <>
          <div className="relative mt-8" role="img"
            aria-label={titulo + ': ' + ev.zonas.map(z => z.zona.sigla + ' ' + (z.texto || 'sin dato')).join(', ')}>
            <div className="grid grid-cols-[64px_1fr] sm:grid-cols-[84px_1fr] items-center gap-y-1.5">
              {e.carriles.map((c, i) => {
                const z = ev.zonas[i]
                return (
                  <div key={i} className="contents">
                    <span className="text-[11.5px] font-semibold truncate pr-1.5"
                      style={{ color: c.estado === 'reves' ? ROJO : c.estado === 'sin-dato' ? '#6b7280' : c.color }}>
                      {c.sigla || '—'}{c.estado === 'reves' ? ' ⚠' : ''}
                    </span>
                    <div className="relative h-[18px] rounded-md bg-white/[0.03]">
                      {c.estado === 'sin-dato'
                        ? <span className="absolute inset-0 flex items-center pl-2 text-[10.5px] italic text-gray-600">sin dato</span>
                        : <i className="absolute top-0 bottom-0" style={estiloTramo(c)}
                            title={(c.nombre || c.sigla) + (z?.texto ? ' · ' + z.texto : '')} />}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Los hitos, por encima de todos los carriles. */}
            <div className="absolute top-0 bottom-0 left-[64px] sm:left-[84px] right-0 pointer-events-none">
              {e.marcas.map((m, i) => (
                <i key={m.id} className="absolute -top-1 -bottom-1 w-0 border-l border-dashed"
                  style={{ left: m.pos + '%', borderColor: HITO + 'b3' }}>
                  <span className="absolute -translate-x-1/2 text-[10.5px] font-semibold whitespace-nowrap"
                    style={{ color: HITO, top: pisos[i] ? -32 : -18 }}>{m.corto}</span>
                </i>
              ))}
            </div>
          </div>

          <div className="relative ml-[64px] sm:ml-[84px] h-[30px] border-t border-gray-800">
            {e.ticks.map((t, i) => (
              <span key={i}
                className={'absolute top-1 -translate-x-1/2 text-center font-mono text-[10.5px] leading-tight text-gray-600 whitespace-nowrap tabular-nums '
                  + (i % 2 ? 'hidden sm:block' : '')}
                style={{ left: t.pos + '%' }}>
                <b className="font-medium text-gray-400">{t.arriba}</b>
                {t.abajo && <><br />{t.abajo}</>}
              </span>
            ))}
          </div>
          {e.leyenda && <p className="text-gray-600 text-[11.5px]">{e.leyenda}{ev.avisos.length === 0 && !ev.faltan.length ? ' Cada zona empieza donde acaba la anterior: no hay huecos ni se pisan.' : ''}</p>}
        </>
      )}

      {ev.avisos.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {ev.avisos.map((a, i) => (
            <div key={i} role="note"
              className={'rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-snug ' + (a.tipo === 'reves'
                ? 'border-[#f2545b]/40 bg-[#f2545b]/[0.07] text-[#d9c4c6]'
                : 'border-[#f0b429]/40 bg-[#f0b429]/[0.06] text-[#dcd3bd]')}>
              <b className={a.tipo === 'reves' ? 'text-[#ffb4b8]' : 'text-[#ffd77a]'}>{a.titulo}</b>
              <p>{a.detalle}{a.tipo !== 'hueco' ? ' Al prescribirle sale marcada con ⚠, y se puede mandar igual.' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
