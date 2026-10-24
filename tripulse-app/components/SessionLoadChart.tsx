'use client'
import { useRef, useEffect, useState, useCallback, useId } from 'react'
import { cargaDeTarea } from '@/lib/prescripcion-zona'
import { vecesDe, seriesTarea, hayBloques, repeticionTexto } from '@/lib/bloques-tarea'
import { tramosDeSesion, type TramoSesion, type TestsDeportista } from '@/lib/duracion'
import { mmss } from '@/lib/medicion'

// La sesión en el tiempo: cada serie con su zona y cada descanso en su sitio.
//
// EL EJE ES TIEMPO, Y ES EL DE LA CABECERA. Antes el ancho de cada barra iba
// por metros (50 m = un trozo) mientras el eje contaba minutos, así que no
// casaban: en una sesión de carrera el 3.000 ocupaba media gráfica y eran 10 de
// 26 minutos. Y la duración de aquí contaba una sola serie de cada tarea, a un
// ritmo de tabla, sin descansos. Ahora todo sale de tramosDeSesion
// (lib/duracion), que es la misma cuenta que calcularDuracionEstimada.
//
// LOS DESCANSOS, una franja rayada abajo con su tiempo encima (24-10-2026, la
// opción A de la maqueta): se lee como pausa y no se confunde con el trote de Z1.

/* La medida de una repetición, para decir de qué es un descanso: «400 m», «8:00». */
function unidadDe(t: any): string {
  const metros = Number(t.p_distancia?.[0]?.metros_planeados)
  if (metros > 0) return metros.toLocaleString('es-ES') + ' m'
  const seg = Number(t.p_duracion?.[0]?.tiempo_planeado)
  if (seg > 0) return mmss(seg)
  return 'serie'
}

/* El volumen de la tarea entera, para su etiqueta: «1.2km», «24min». Sin medida, nada. */
function volumenTexto(t: any): string | null {
  const veces = vecesDe(t)
  const seg = Number(t.p_duracion?.[0]?.tiempo_planeado)
  if (seg > 0) return Math.round((seg * veces) / 60) + 'min'
  const metros = Number(t.p_distancia?.[0]?.metros_planeados)
  if (metros > 0) {
    const total = metros * veces
    return total >= 1000 ? (total / 1000).toFixed(1) + 'km' : total + 'm'
  }
  return null
}

/* Si no cabe «2:00», un «2'» (solo con minutos enteros); si tampoco, nada. */
function cifraDescanso(seg: number, ancho: number): string | null {
  if (ancho >= 26) return mmss(seg)
  if (seg % 60 === 0 && ancho >= 12) return seg / 60 + "'"
  return null
}

function dondeVa(tr: TramoSesion, t: any): string {
  const que = repeticionTexto(t, unidadDe(t))
  if (tr.cual === 'cambio') return 'Cambio de ejercicio: montar la máquina, cargar discos'
  if (tr.cual === 'bloque') return 'Entre bloques de ' + que
  if (tr.cual === 'final') {
    return (seriesTarea(t) > 1 || hayBloques(t) ? 'Después de la última serie' : 'Después del ' + unidadDe(t))
      + ', antes de la tarea siguiente'
  }
  return 'Entre la ' + (tr.serie + 1) + '.ª y la ' + (tr.serie + 2) + '.ª serie de ' + que
}

interface Pieza {
  tr: TramoSesion
  x: number
  w: number
}

export default function SessionLoadChart({ tareas, tests }: { tareas: any[]; tests?: TestsDeportista }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [svgW, setSvgW] = useState(600)
  const [tip, setTip] = useState<{ visible: boolean; x: number; y: number; idx: number }>({ visible: false, x: 0, y: 0, idx: -1 })

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(e => {
      const w = e[0]?.contentRect.width
      if (w > 0) setSvgW(Math.floor(w))
    })
    obs.observe(wrapRef.current)
    setSvgW(wrapRef.current.clientWidth || 600)
    return () => obs.disconnect()
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const bar = (e.target as Element).closest('rect[data-idx]') as SVGRectElement | null
    if (!bar) { setTip(p => ({ ...p, visible: false })); return }
    const idx = parseInt(bar.getAttribute('data-idx') ?? '-1')
    if (idx < 0) return
    const wrap = wrapRef.current!
    const r = wrap.getBoundingClientRect()
    let lx = e.clientX - r.left + 12
    let ty = e.clientY - r.top - 85
    if (ty < 0) ty = 4
    if (lx + 180 > wrap.clientWidth) lx = e.clientX - r.left - 188
    setTip({ visible: true, x: lx, y: ty, idx })
  }, [])

  const onMouseLeave = useCallback(() => setTip(p => ({ ...p, visible: false })), [])

  // Early return DESPUÉS de todos los hooks
  if (!tareas.length) return null

  const tramos = tramosDeSesion(tareas, tests || {})
  const total = tramos.reduce((s, tr) => s + tr.segundos, 0)
  if (total <= 0) return null

  const H = 180, PL = 36, PR = 8, PT = 10, PB = 4
  const chartW = svgW - PL - PR
  const chartH = H - PT - PB
  const base = PT + chartH
  const px = chartW / total

  const cargas = tareas.map(t => cargaDeTarea(t))
  const piezas: Pieza[] = []
  let cursor = PL
  for (const tr of tramos) {
    piezas.push({ tr, x: cursor, w: tr.segundos * px })
    cursor += tr.segundos * px
  }

  /* Los números, solo con lo que se pudo estimar: lo mismo que suma la cabecera. */
  const contados = tramos.filter(tr => !tr.supuesto)
  const trabajo = contados.filter(tr => tr.tipo === 'trabajo')
  const segTrabajo = trabajo.reduce((s, tr) => s + tr.segundos, 0)
  const segDescanso = contados.reduce((s, tr) => s + (tr.tipo === 'descanso' ? tr.segundos : 0), 0)
  const segContados = segTrabajo + segDescanso
  const uaDe = (lista: TramoSesion[]) => lista.reduce((s, tr) => s + cargas[tr.tarea].rpe * tr.segundos / 60, 0)
  const totalUA = Math.round(uaDe(trabajo))
  const zonaMedia = segTrabajo > 0 ? (trabajo.reduce((s, tr) => s + cargas[tr.tarea].nivel * tr.segundos, 0) / segTrabajo).toFixed(1) : null
  const zonaMax = Math.max(...cargas.map(c => c.nivel))
  const hayDescansos = tramos.some(tr => tr.tipo === 'descanso')
  const haySupuestos = tramos.some(tr => tr.supuesto)
  const duracionTxt = segContados > 0 ? Math.round(segContados / 60) + ' min' : '—'
  // Zonas realmente usadas (por etiqueta real: sigla Zonas 2 o Z1–Z7), con su color.
  const zonasUsadas = Array.from(
    new Map(tareas.map((t, i) => {
      const label = t.zona_entrenamiento || `Z${cargas[i].nivel}`
      return [label, { label, color: cargas[i].color }]
    })).values()
  )

  /* La etiqueta de cada tarea va en su barra más cercana al centro: en un
     2 × 400 el centro cae en el descanso. Si no cabe, no se pone. */
  const etiquetas: { x: number; y: number; texto: string }[] = []
  tareas.forEach((t, i) => {
    const texto = volumenTexto(t)
    const suyas = piezas.filter(p => p.tr.tarea === i && p.tr.tipo === 'trabajo')
    if (!texto || !suyas.length) return
    const ultimaPieza = suyas[suyas.length - 1]
    const centro = (suyas[0].x + ultimaPieza.x + ultimaPieza.w) / 2
    /* Con un empate (dos barras a la misma distancia), la primera: el redondeo no decide. */
    const p = suyas.reduce((m, x) => (Math.abs(x.x + x.w / 2 - centro) < Math.abs(m.x + m.w / 2 - centro) - 1 ? x : m))
    if (p.w - 2 < texto.length * 5 + 2) return
    const bH = Math.round((cargas[i].nivel / 7) * chartH)
    etiquetas.push({ x: p.x + (p.w - 2) / 2, y: base - bH + 13, texto })
  })

  const ivs = [5, 10, 15, 20, 30, 60]
  const totalMin = total / 60
  const iv = ivs.find(i => totalMin / i <= 7) || 60
  const marcasX = Array.from({ length: Math.floor(totalMin / iv) }, (_, i) => (i + 1) * iv).filter(m => m <= totalMin)

  const tipPieza = tip.idx >= 0 ? piezas[tip.idx] : null

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-medium">Carga planificada</p>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Duración', val: duracionTxt, sub: segDescanso > 0 ? mmss(segDescanso) + ' de descanso' : null },
          { label: 'Carga (UA)', val: totalUA, sub: null },
          { label: 'Zona media', val: zonaMedia ? `Z${zonaMedia}` : '—', sub: null },
          { label: 'Zona máx.', val: `Z${zonaMax}`, sub: null },
        ].map(({ label, val, sub }) => (
          <div key={label} className="bg-gray-800 rounded-lg px-3 py-2 min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className="text-base font-bold text-white">{val}</p>
            {sub && <p className="text-[11px] leading-tight text-gray-400">{sub}</p>}
          </div>
        ))}
      </div>

      {/* pb-4: los minutos del eje van debajo del dibujo, y sin hueco los pisaba la leyenda */}
      <div ref={wrapRef} className="relative pb-4">
        <svg
          width="100%" height={H}
          viewBox={`0 0 ${svgW} ${H}`}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="block overflow-visible"
          role="img"
          aria-label={`Carga planificada: ${duracionTxt}, ${totalUA} UA`}
        >
          <defs>
            <pattern id={'descanso-' + uid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="rgba(153,161,175,0.10)" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(153,161,175,0.6)" strokeWidth="1.6" />
            </pattern>
          </defs>

          {[1,2,3,4,5,6,7].map(z => {
            const y = Math.round(PT + chartH - (z/7)*chartH)
            return (
              <g key={z}>
                <line x1={PL} x2={svgW-PR} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                <text x={PL-5} y={y+3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="system-ui,sans-serif">Z{z}</text>
              </g>
            )
          })}

          {piezas.map((p, idx) => {
            const t = tareas[p.tr.tarea]
            const c = cargas[p.tr.tarea]
            if (p.tr.tipo === 'descanso') {
              const cifra = cifraDescanso(p.tr.segundos, p.w)
              return (
                <g key={'d' + idx}>
                  <rect x={p.x + 1} y={base - 9} width={Math.max(1, p.w - 3)} height={9} rx={1.5}
                    fill={`url(#descanso-${uid})`} opacity={p.tr.supuesto ? 0.5 : 1} />
                  {cifra && (
                    <text x={p.x + p.w / 2 - 1} y={base - 14} textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,0.62)"
                      fontFamily="system-ui,sans-serif" fontWeight="500" pointerEvents="none">{cifra}</text>
                  )}
                  {/* Para el ratón: un descanso estrecho también se puede señalar */}
                  <rect data-idx={idx} x={p.x} y={PT} width={Math.max(6, p.w)} height={chartH} fill="transparent" style={{ cursor: 'pointer' }} />
                </g>
              )
            }
            const bH = Math.round((c.nivel / 7) * chartH)
            /* El tono alterno separa series pegadas; con descanso entre ellas ya las separa él. */
            const alterna = !(Number(t.descanso_segundos) > 0) && p.tr.serie % 2 === 1
            return (
              <rect key={'t' + idx} data-idx={idx}
                x={Math.round(p.x)} y={base - bH} width={Math.round(Math.max(1, p.w - 2))} height={bH} rx={2}
                fill={c.color} opacity={p.tr.supuesto ? 0.4 : alterna ? 0.65 : 0.85}
                stroke={p.tr.supuesto ? c.color : undefined} strokeDasharray={p.tr.supuesto ? '3 2' : undefined}
                style={{ cursor: 'pointer' }} />
            )
          })}

          {etiquetas.map((e, k) => (
            <text key={k} x={e.x} y={e.y} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,0.75)" fontFamily="system-ui,sans-serif" pointerEvents="none" fontWeight="500">{e.texto}</text>
          ))}

          {marcasX.map(m => {
            const xp = PL + (m/totalMin)*chartW
            return (
              <g key={m}>
                <line x1={xp} x2={xp} y1={base+2} y2={base+6} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
                <text x={xp} y={base+16} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="system-ui,sans-serif">{m}&apos;</text>
              </g>
            )
          })}
        </svg>

        {tip.visible && tipPieza && (() => {
          const t = tareas[tipPieza.tr.tarea]
          const c = cargas[tipPieza.tr.tarea]
          if (tipPieza.tr.tipo === 'descanso') {
            return (
              <div className="absolute z-10 pointer-events-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs max-w-56" style={{ left: tip.x, top: tip.y, minWidth: 150 }}>
                <p className="font-medium text-white mb-1">Descanso · {mmss(tipPieza.tr.segundos)}</p>
                <p className="text-gray-400">{dondeVa(tipPieza.tr, t)}</p>
              </div>
            )
          }
          const suyos = tramos.filter(tr => tr.tarea === tipPieza.tr.tarea && tr.tipo === 'trabajo' && !tr.supuesto)
          const vol = volumenTexto(t)
          return (
            <div className="absolute z-10 pointer-events-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs max-w-56" style={{ left: tip.x, top: tip.y, minWidth: 150 }}>
              <p className="font-medium text-white mb-1">{t.zona_entrenamiento || `Z${c.nivel}`}</p>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ background: c.color }} />
                <span className="text-gray-400">Z{c.nivel} — {c.nombre}</span>
              </div>
              {tipPieza.tr.supuesto
                ? <p className="text-amber-300">No se puede pasar a minutos: el ancho es orientativo y no suma.</p>
                : <p className="text-gray-400">Por serie: <span className="text-white font-medium">{mmss(tipPieza.tr.segundos)}</span></p>}
              {vol && <p className="text-gray-400">Volumen total: <span className="text-orange-400 font-medium">{vol.replace(/(km|min|m)$/, ' $1')}</span></p>}
              {suyos.length > 0 && <p className="text-gray-400">Carga: <span className="text-white font-medium">{Math.round(uaDe(suyos))} UA</span></p>}
              {t.comentario && <p className="text-gray-500 mt-1 truncate max-w-36">{t.comentario}</p>}
            </div>
          )
        })()}
      </div>

      <div className="flex flex-wrap gap-3 mt-2">
        {zonasUsadas.map(z => (
          <span key={z.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-sm inline-block opacity-80" style={{ background: z.color }} />
            {z.label}
          </span>
        ))}
        {hayDescansos && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg width="18" height="9" aria-hidden="true">
              <rect width="18" height="9" rx="1.5" fill={`url(#descanso-${uid})`} />
            </svg>
            Descanso
          </span>
        )}
      </div>
      {haySupuestos && (
        <p className="text-xs text-amber-300/80 mt-2">
          Hay tareas que no se pueden pasar a minutos (bici por distancia o sin medida): se ven con un ancho orientativo y no cuentan en la duración.
        </p>
      )}
    </div>
  )
}
