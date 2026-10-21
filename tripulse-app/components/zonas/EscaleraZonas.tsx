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
//
// CON `edicion`, LAS FRONTERAS SE ARRASTRAN (los porcentajes de un deportista,
// lib/zonas-ajuste). Aquí solo se traduce la posición del dedo a un número del
// eje y se avisa: qué % sale, hasta dónde se puede llevar y qué se guarda lo
// decide quien llama. El eje va FIJO mientras tanto (`eje`): si se recalculara
// con cada movimiento, todo bailaría bajo el dedo.
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { escalera, posicionEnEje, type Carril, type Evaluacion } from '@/lib/clasificaciones-zonas'
import { asaHacia } from '@/lib/zonas-ajuste'
import { leerValor } from '@/lib/referencia-propia'
import { MESES_CORTOS } from '@/lib/fechas'

/** Una frontera que se puede arrastrar. */
export interface AsaEscalera {
  clave: string
  /** Dónde está ahora, en el eje del esfuerzo. */
  esfuerzo: number
  /** Dónde la deja la plantilla, si está movida: ahí se pinta una raya discontinua. */
  fantasma: number | null
  /** Los carriles que cruza (los de sus zonas), en el orden de la escalera. */
  carriles: number[]
  nombre: string
  /** Su % ahora, para el lector de pantalla. */
  valor: number
  /** Lo que se lee al cogerla: «AER | TEMPO · 103 % de su VT1 · 5:18 /km». */
  globo: string
  /** Lo mismo, para el lector de pantalla. */
  aria: string
  movida: boolean
}

export interface EdicionEscalera {
  asas: AsaEscalera[]
  /**
   * Se ha arrastrado hasta ese esfuerzo; quien llama decide el %. `gesto`
   * cambia con cada arrastre: un arrastre entero es un solo paso al deshacer.
   * `iman`: cuánto del eje son unos pocos píxeles, para pegarla a lo que tenga
   * al lado.
   */
  onArrastrar: (i: number, esfuerzo: number, gesto: number, iman: number) => void
  /** Se soltó el asa (o se canceló el arrastre). */
  onSoltar?: () => void
  /** Con el teclado: un paso hacia un lado (`grande` con Mayúsculas). */
  onPaso: (i: number, direccion: 1 | -1, grande: boolean) => void
}

/* Las medidas de los carriles: de ahí salen la altura y el sitio de cada asa.
   AL AJUSTAR, MÁS ALTOS Y MÁS SEPARADOS: hay que poder coger cada asa, y con
   los de solo mirar la escalera quedaba apelotonada (lo dijo el usuario). */
const CARRIL = { alto: 18, hueco: 6 }
const CARRIL_AJUSTE = { alto: 26, hueco: 12 }
/* A cuántos píxeles del borde de la zona de al lado se pega una frontera. */
const IMAN_PX = 8

/**
 * Un arrastre en curso. `i` es null mientras no se sepa cuál: si al pulsar
 * había varias asas bajo el dedo, se coge la que va hacia donde se tira
 * (lib/zonas-ajuste, `asaHacia`).
 */
interface Arrastre {
  i: number | null
  bajo: number[]
  /** Dónde se pulsó, en pantalla. */
  x0: number
  /** Dónde estaba el asa al cogerla: se mueve lo que se mueve el dedo, sin saltar a él. */
  desde: number
  gesto: number
  /** El eje y la capa, tal como estaban al pulsar: durante el arrastre no se mueven. */
  eje: { min: number; max: number }
  izq: number
  ancho: number
}

/* El arrastre se escucha en la VENTANA y no en el asa: así sigue aunque el
   dedo se salga de ella, y aunque el navegador no deje capturar el puntero. */
interface Oyentes { mover: (p: PointerEvent) => void; acabar: () => void }
function escuchar(o: Oyentes, si: boolean) {
  if (si) {
    window.addEventListener('pointermove', o.mover)
    window.addEventListener('pointerup', o.acabar)
    window.addEventListener('pointercancel', o.acabar)
  } else {
    window.removeEventListener('pointermove', o.mover)
    window.removeEventListener('pointerup', o.acabar)
    window.removeEventListener('pointercancel', o.acabar)
  }
}

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

export default function EscaleraZonas({ ev, titulo, derecha, pista, eje, edicion, debajo }: {
  ev: Evaluacion
  /** «Cómo le quedan a Ana». */
  titulo: string
  /** Lo que va a la derecha del título: el «Ver con: …». */
  derecha?: React.ReactNode
  /** Cuando a este le faltan los números: con quién sí se podría ver. */
  pista?: React.ReactNode
  /** Un eje fijo, en esfuerzo. Sin él, se ajusta a lo que haya que pintar. */
  eje?: { min: number; max: number } | null
  /** Para arrastrar las fronteras. Sin esto, la escalera solo se mira. */
  edicion?: EdicionEscalera | null
  /** Lo que va debajo de la escalera, antes de los avisos (la leyenda de cómo se arrastra). */
  debajo?: React.ReactNode
}) {
  const e = escalera(ev, eje)
  const capa = useRef<HTMLDivElement | null>(null)
  /* El asa de la que se enseña el globo: la que se arrastra, se señala o tiene el foco. */
  const [activa, setActiva] = useState<number | null>(null)
  const [arrastrando, setArrastrando] = useState<number | null>(null)
  /* El arrastre AL MOMENTO, en un ref: el estado llega con el siguiente pintado
     y el primer movimiento puede llegar antes. */
  const arrastre = useRef<Arrastre | null>(null)
  const gestos = useRef(0)
  const oyentes = useRef<Oyentes | null>(null)
  /* Lo último que mandó quien llama: los oyentes viven lo que dura el arrastre. */
  const ultima = useRef(edicion)
  useEffect(() => { ultima.current = edicion })
  useEffect(() => () => { if (oyentes.current) escuchar(oyentes.current, false) }, [])

  const botones = () => [...(capa.current?.querySelectorAll<HTMLButtonElement>('button[role=slider]') ?? [])]
  /** Las asas bajo un punto de la pantalla, en el orden de la escalera. */
  const asasBajo = (x: number, y: number) => botones().flatMap((b, k) => {
    const r = b.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? [k] : []
  })

  const empezar = (pe: React.PointerEvent<HTMLButtonElement>, i: number) => {
    const r = capa.current?.getBoundingClientRect()
    const asa = edicion?.asas[i]
    if (!e || !asa || !r || r.width <= 0) return
    pe.preventDefault()
    try { pe.currentTarget.setPointerCapture(pe.pointerId) } catch { /* sigue sin ella */ }
    pe.currentTarget.focus()
    if (oyentes.current) escuchar(oyentes.current, false)

    const bajo = [...new Set([i, ...asasBajo(pe.clientX, pe.clientY)])].sort((a, b) => a - b)
    const a: Arrastre = {
      i: bajo.length > 1 ? null : i, bajo, x0: pe.clientX, desde: asa.esfuerzo,
      gesto: ++gestos.current, eje: e.eje, izq: r.left, ancho: r.width,
    }
    arrastre.current = a
    setArrastrando(a.i); setActiva(i)
    const enEje = (x: number) => a.eje.min + Math.min(1, Math.max(0, (x - a.izq) / a.ancho)) * (a.eje.max - a.eje.min)

    const o: Oyentes = {
      mover: p => {
        if (arrastre.current !== a) return
        /* Se soltó el ratón sin que llegara el aviso (fuera de la ventana). */
        if (p.pointerType === 'mouse' && p.buttons === 0) { o.acabar(); return }
        if (a.i === null) {
          const dx = p.clientX - a.x0
          if (Math.abs(dx) < 3) return
          const elegida = asaHacia(a.bajo, dx < 0 ? -1 : 1)
          const suya = elegida !== null ? ultima.current?.asas[elegida] : undefined
          if (elegida === null || !suya) return
          a.i = elegida
          a.desde = suya.esfuerzo
          setArrastrando(elegida); setActiva(elegida)
          botones()[elegida]?.focus()
        }
        const destino = a.desde + enEje(p.clientX) - enEje(a.x0)
        const iman = (IMAN_PX / a.ancho) * (a.eje.max - a.eje.min)
        ultima.current?.onArrastrar(a.i, Math.min(a.eje.max, Math.max(a.eje.min, destino)), a.gesto, iman)
      },
      acabar: () => {
        if (arrastre.current === a) arrastre.current = null
        setArrastrando(null)
        ultima.current?.onSoltar?.()
        escuchar(o, false)
        if (oyentes.current === o) oyentes.current = null
      },
    }
    oyentes.current = o
    escuchar(o, true)
  }
  const medida = edicion ? CARRIL_AJUSTE : CARRIL
  const arriba = (carriles: number[]) => Math.min(...carriles) * (medida.alto + medida.hueco) - 3
  const alto = (carriles: number[]) => carriles.length * medida.alto + (carriles.length - 1) * medida.hueco + 6
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
          <div className={'relative ' + (edicion ? 'mt-10' : 'mt-8')} role="img"
            aria-label={titulo + ': ' + ev.zonas.map(z => z.zona.sigla + ' ' + (z.texto || 'sin dato')).join(', ')}>
            <div className="grid grid-cols-[64px_1fr] sm:grid-cols-[84px_1fr] items-center" style={{ rowGap: medida.hueco }}>
              {e.carriles.map((c, i) => {
                const z = ev.zonas[i]
                return (
                  <div key={i} className="contents">
                    <span className="text-[11.5px] font-semibold truncate pr-1.5"
                      style={{ color: c.estado === 'reves' ? ROJO : c.estado === 'sin-dato' ? '#6b7280' : c.color }}>
                      {c.sigla || '—'}{c.estado === 'reves' ? ' ⚠' : ''}
                    </span>
                    <div className="relative rounded-md bg-white/[0.03]" style={{ height: medida.alto }}>
                      {c.estado === 'sin-dato'
                        ? <span className="absolute inset-0 flex items-center pl-2 text-[10.5px] italic text-gray-600">sin dato</span>
                        : <i className="absolute top-0 bottom-0" style={estiloTramo(c)}
                            title={(c.nombre || c.sigla) + (z?.texto ? ' · ' + z.texto : '')} />}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Los hitos, por encima de todos los carriles. Y, al editar, las
                fronteras que se arrastran. */}
            <div ref={capa} className="absolute top-0 bottom-0 left-[64px] sm:left-[84px] right-0 pointer-events-none">
              {e.marcas.map((m, i) => (
                <i key={m.id} className="absolute -top-1 -bottom-1 w-0 border-l border-dashed"
                  style={{ left: m.pos + '%', borderColor: HITO + 'b3' }}>
                  <span className="absolute -translate-x-1/2 text-[10.5px] font-semibold whitespace-nowrap"
                    style={{ color: HITO, top: pisos[i] ? -32 : -18 }}>{m.corto}</span>
                </i>
              ))}
              {edicion?.asas.map(a => a.fantasma !== null && (
                <i key={'f' + a.clave} aria-hidden="true" className="absolute w-0 border-l-[1.5px] border-dashed border-white/55"
                  style={{ left: posicionEnEje(e.eje, a.fantasma) + '%', top: arriba(a.carriles), height: alto(a.carriles) }} />
              ))}
              {edicion?.asas.map((a, i) => (
                <button key={a.clave} type="button" role="slider" aria-label={'Frontera ' + a.nombre}
                  aria-valuenow={a.valor} aria-valuetext={a.aria}
                  className="group absolute w-[30px] -ml-[15px] cursor-ew-resize touch-none pointer-events-auto focus:outline-none"
                  style={{
                    left: posicionEnEje(e.eje, a.esfuerzo) + '%', top: arriba(a.carriles), height: alto(a.carriles),
                    /* La que se coge, por encima de la que tenga al lado. */
                    zIndex: arrastrando === i ? 3 : activa === i ? 2 : undefined,
                  }}
                  onPointerDown={pe => empezar(pe, i)}
                  onPointerEnter={() => setActiva(i)}
                  onPointerLeave={() => { if (arrastrando === null) setActiva(x => (x === i ? null : x)) }}
                  onFocus={() => setActiva(i)}
                  onBlur={() => setActiva(x => (x === i ? null : x))}
                  onKeyDown={ev2 => {
                    const dir = ev2.key === 'ArrowRight' || ev2.key === 'ArrowUp' ? 1 : ev2.key === 'ArrowLeft' || ev2.key === 'ArrowDown' ? -1 : 0
                    if (!dir) return
                    ev2.preventDefault()
                    edicion.onPaso(i, dir, ev2.shiftKey)
                  }}>
                  <i aria-hidden="true" className={'absolute left-[14px] top-0 bottom-0 w-[2px] rounded ' + (a.movida ? 'bg-[#fdba74]' : 'bg-white/90')} />
                  <span aria-hidden="true"
                    className={'absolute left-1/2 top-1/2 w-[14px] h-[28px] -translate-x-1/2 -translate-y-1/2 rounded-[7px] shadow-[0_0_0_2px_#0e1218,0_2px_8px_rgba(0,0,0,.55)] transition-colors '
                      + 'group-focus-visible:shadow-[0_0_0_2px_#0e1218,0_0_0_4px_#f97316] '
                      + (arrastrando === i ? 'bg-[#ffd2a8]' : 'bg-white group-hover:bg-[#ffd2a8]')} />
                </button>
              ))}
              {edicion && activa !== null && edicion.asas[activa] && (
                <div aria-hidden="true" className="absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/15 bg-[#111823] px-2.5 py-1.5 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,.45)] pointer-events-none"
                  style={{ left: posicionEnEje(e.eje, edicion.asas[activa].esfuerzo) + '%', top: arriba(edicion.asas[activa].carriles) - 8 }}>
                  {edicion.asas[activa].globo}
                </div>
              )}
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
          {debajo}
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
