'use client'
import { useRef, useEffect, useState, useCallback } from 'react'

const ZONAS = [
  { n: 1, nombre: 'Recuperación',  color: '#94a3b8', rpe: 2.5 },
  { n: 2, nombre: 'Aeróbica',      color: '#34d399', rpe: 4.5 },
  { n: 3, nombre: 'Tempo',         color: '#a3e635', rpe: 6.5 },
  { n: 4, nombre: 'Umbral',        color: '#fbbf24', rpe: 7.5 },
  { n: 5, nombre: 'VO₂máx',        color: '#fb923c', rpe: 8.5 },
  { n: 6, nombre: 'Anaeróbica',    color: '#f87171', rpe: 9.5 },
  { n: 7, nombre: 'Neuromuscular', color: '#c084fc', rpe: 10  },
]

function parseZonaNum(str: string): number {
  if (!str) return 2
  const m = str.match(/[Zz]\s*(\d)/)
  return m ? Math.min(Math.max(parseInt(m[1]), 1), 7) : 2
}

function estimarDurMin(t: any): number {
  const pd = t.p_duracion?.[0]?.tiempo_planeado
  if (pd && pd > 0) return Math.max(1, Math.round(pd / 60))
  const metros = t.p_distancia?.[0]?.metros_planeados
  if (metros && metros > 0) {
    const pace = [6, 5.5, 5, 4.5, 4, 3.5, 3][parseZonaNum(t.zona_entrenamiento || '') - 1] || 5
    return Math.max(1, Math.round((metros / 1000) * pace))
  }
  return Math.max(1, (t.series || 1) * 3)
}

function calcularVolumenTotal(t: any): { valor: number, unidad: string } {
  const series = t.series || 1
  const pd = t.p_duracion?.[0]?.tiempo_planeado
  if (pd && pd > 0) return { valor: Math.round((pd * series) / 60), unidad: 'min' }
  const metros = t.p_distancia?.[0]?.metros_planeados
  if (metros && metros > 0) {
    const total = metros * series
    return { valor: total, unidad: total >= 1000 ? 'km' : 'm' }
  }
  return { valor: series * 3, unidad: 'min' }
}

function volumenParaAncho(t: any): number {
  const series = t.series || 1
  const pd = t.p_duracion?.[0]?.tiempo_planeado
  if (pd && pd > 0) return Math.max(1, Math.round((pd * series) / 60))
  const metros = t.p_distancia?.[0]?.metros_planeados
  if (metros && metros > 0) return Math.max(1, Math.round((metros * series) / 50))
  return Math.max(1, series * 3)
}

function getUA(zonaNum: number, durMin: number): number {
  return Math.round((ZONAS[zonaNum - 1]?.rpe ?? 5) * durMin)
}

export default function SessionLoadChart({ tareas }: { tareas: any[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
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
    if (lx + 160 > wrap.clientWidth) lx = e.clientX - r.left - 168
    setTip({ visible: true, x: lx, y: ty, idx })
  }, [])

  const onMouseLeave = useCallback(() => setTip(p => ({ ...p, visible: false })), [])

  // Early return DESPUÉS de todos los hooks
  if (!tareas.length) return null

  const H = 180, PL = 36, PR = 8, PT = 10, PB = 4
  const chartW = svgW - PL - PR
  const chartH = H - PT - PB

  const bars = tareas.map(t => ({
    t,
    zonaNum: parseZonaNum(t.zona_entrenamiento || ''),
    durMin: estimarDurMin(t),
    volumen: volumenParaAncho(t),
  }))

  const totalVol = bars.reduce((s, b) => s + b.volumen, 0)
  const totalMin = bars.reduce((s, b) => s + b.durMin, 0)
  const pxPerMin = totalVol > 0 ? chartW / totalVol : 0

  let cursor = PL
  const rects: any[] = []
  bars.forEach((b, idx) => {
    const zona = ZONAS[b.zonaNum - 1]
    const series = b.t.series && b.t.series > 1 ? b.t.series : 1
    const totalBW = b.volumen * pxPerMin
    const serieW = totalBW / series
    const bH = Math.round((b.zonaNum / 7) * chartH)
    for (let s = 0; s < series; s++) {
      const bW = Math.max(1, serieW - 2)
      const bX = Math.round(cursor + s * serieW)
      const bY = PT + chartH - bH
      rects.push({ ...b, zona, bW: Math.round(bW), bH, bX, bY, idx, serieIdx: s, series })
    }
    cursor += totalBW
  })

  const totalUA = bars.reduce((s, b) => s + getUA(b.zonaNum, b.durMin), 0)
  const zonaMedia = totalMin > 0 ? (bars.reduce((s, b) => s + b.zonaNum * b.durMin, 0) / totalMin).toFixed(1) : '0'
  const zonaMax = Math.max(...bars.map(b => b.zonaNum))
  const zonasUsadas = [...new Set(bars.map(b => b.zonaNum))].sort()

  const ivs = [5, 10, 15, 20, 30, 60]
  const iv = ivs.find(i => totalMin / i <= 7) || 60
  const marcasX = Array.from({ length: Math.floor(totalMin / iv) }, (_, i) => (i + 1) * iv).filter(t => t <= totalMin)

  const tipBar = tip.idx >= 0 ? rects[tip.idx] : null

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-medium">Carga planificada</p>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Duración', val: `${totalMin} min` },
          { label: 'Carga (UA)', val: totalUA },
          { label: 'Zona media', val: `Z${zonaMedia}` },
          { label: 'Zona máx.', val: `Z${zonaMax}` },
        ].map(({ label, val }) => (
          <div key={label} className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className="text-base font-bold text-white">{val}</p>
          </div>
        ))}
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          width="100%" height={H}
          viewBox={`0 0 ${svgW} ${H}`}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="block overflow-visible"
          role="img"
          aria-label={`Carga planificada: ${totalMin} min, ${totalUA} UA`}
        >
          {[1,2,3,4,5,6,7].map(z => {
            const y = Math.round(PT + chartH - (z/7)*chartH)
            return (
              <g key={z}>
                <line x1={PL} x2={svgW-PR} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                <text x={PL-5} y={y+3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="system-ui,sans-serif">Z{z}</text>
              </g>
            )
          })}

          {rects.map(({ t, zona, bW, bH, bX, bY, idx, durMin, serieIdx, series }) => (
            <g key={t.id + '-' + serieIdx}>
              <rect x={bX} y={bY} width={bW} height={bH} fill={zona.color} rx={2} opacity={serieIdx % 2 === 0 ? 0.85 : 0.65} data-idx={idx} style={{ cursor: 'pointer' }} />
              {serieIdx === 0 && bW * series > 40 && (
                <text x={bX + (bW * series / 2) - bW/2} y={bY+13} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,0.75)" fontFamily="system-ui,sans-serif" pointerEvents="none" fontWeight="500">{(() => { const v = calcularVolumenTotal(t); return v.unidad === 'km' ? (v.valor/1000).toFixed(1)+'km' : v.valor+v.unidad })()}</text>
              )}
            </g>
          ))}

          {marcasX.map(t => {
            const xp = PL + (t/totalMin)*chartW
            return (
              <g key={t}>
                <line x1={xp} x2={xp} y1={PT+chartH+2} y2={PT+chartH+6} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
                <text x={xp} y={PT+chartH+16} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="system-ui,sans-serif">{t}'</text>
              </g>
            )
          })}
        </svg>

        {tip.visible && tipBar && (
          <div className="absolute z-10 pointer-events-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs" style={{ left: tip.x, top: tip.y, minWidth: 150 }}>
            <p className="font-medium text-white mb-1">{tipBar.t.zona_entrenamiento || `Z${tipBar.zonaNum}`}</p>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: tipBar.zona.color }} />
              <span className="text-gray-400">Z{tipBar.zonaNum} — {tipBar.zona.nombre}</span>
            </div>
            <p className="text-gray-400">Por serie: <span className="text-white font-medium">{tipBar.durMin} min</span></p>
            {(() => { const v = calcularVolumenTotal(tipBar.t); return <p className="text-gray-400">Volumen total: <span className="text-orange-400 font-medium">{v.unidad === 'km' ? (v.valor/1000).toFixed(1) + ' km' : v.valor + ' ' + v.unidad}</span></p> })()}
            <p className="text-gray-400">Carga: <span className="text-white font-medium">{getUA(tipBar.zonaNum, tipBar.durMin)} UA</span></p>
            {tipBar.t.comentario && <p className="text-gray-500 mt-1 truncate max-w-36">{tipBar.t.comentario}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mt-2">
        {zonasUsadas.map(n => {
          const z = ZONAS[n-1]
          return (
            <span key={n} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-sm inline-block opacity-80" style={{ background: z.color }} />
              Z{z.n} {z.nombre}
            </span>
          )
        })}
      </div>
    </div>
  )
}
