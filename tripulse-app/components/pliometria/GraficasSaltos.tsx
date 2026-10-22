import type { ReactNode } from 'react'
import { NIVELES_PLIO, peldano } from '@/lib/pliometria'
import { SUBIDA_MAX, CARRERA_MAX, ERROR_TEST, type SemanaSaltos, type Tendencia, type PuntoTest } from '@/lib/pliometria-avance'
import { fechaCorta } from '@/lib/fechas'
import LetraNivel, { COLOR_NIVEL } from './LetraNivel'

/*
 * Las gráficas del avance en los saltos: las mismas en su ficha y en Volumen y
 * carga. SVG a mano, como en la maqueta aprobada: barras por nivel, la raya de
 * hasta dónde podía subir cada semana y, en un hueco más, lo que propone la app.
 * Las anchas no encogen en el móvil: se deslizan de lado dentro de su tarjeta.
 */

const TXT = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, fill: '#7d8796' } as const
const VALOR = { ...TXT, fill: '#d7dce3', fontWeight: 600 } as const
const ALERTA = { ...TXT, fill: '#ffd77a', fontWeight: 600 } as const
const pct = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + ' %'

function Marco({ ancho, alto, etiqueta, children }: { ancho: number; alto: number; etiqueta: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={etiqueta} className="block w-full h-auto" style={{ minWidth: Math.round(ancho * 0.9) }}>
        {children}
      </svg>
    </div>
  )
}

/** Contactos por semana, por nivel, desde la semana `desde`; `propuesta` es el total de la semana que viene. */
export function GraficaContactos({ semanas, desde = 0, propuesta = null, nombre, ancho = 640 }: {
  semanas: SemanaSaltos[]
  desde?: number
  propuesta?: number | null
  nombre: string
  ancho?: number
}) {
  const W = ancho, H = 230, izq = 40, der = 10, arr = 22, abj = 28
  const todas = semanas.map(s => s.pies)
  const guias = todas.map((t, i) => (i && todas[i - 1] > 0 ? todas[i - 1] * (1 + SUBIDA_MAX) : null))
  const idx = semanas.map((_, i) => i).slice(Math.max(0, desde))
  const maxV = Math.max(10, ...idx.map(i => todas[i]), ...idx.map(i => guias[i] ?? 0), propuesta ?? 0)
  const paso = maxV > 240 ? 100 : maxV > 120 ? 50 : 25
  const yMax = Math.ceil(maxV / paso) * paso
  const y = (v: number) => arr + (H - arr - abj) * (1 - v / yMax)
  const banda = (W - izq - der) / (idx.length + (propuesta != null ? 1 : 0))
  const barra = Math.min(38, banda * 0.58)
  const lineas: number[] = []
  for (let v = 0; v <= yMax; v += paso) lineas.push(v)
  return (
    <Marco ancho={W} alto={H} etiqueta={'Contactos por semana de ' + nombre + ', por nivel'}>
      {lineas.map(v => (
        <g key={v}>
          <line x1={izq} x2={W - der} y1={y(v)} y2={y(v)} stroke={v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.18)'} />
          <text x={izq - 6} y={y(v) + 4} textAnchor="end" style={TXT}>{v}</text>
        </g>
      ))}
      {idx.map((i, j) => {
        const s = semanas[i]
        const x = izq + banda * j + (banda - barra) / 2
        let base = 0
        const g = guias[i]
        const pasa = g != null && s.pies > g
        return (
          <g key={s.lunes}>
            {NIVELES_PLIO.map(k => {
              const v = s.porNivel[k]
              if (!v) return null
              const r = <rect key={k} x={x} y={y(base + v)} width={barra} height={y(base) - y(base + v)} fill={COLOR_NIVEL[k]} opacity={0.85} />
              base += v
              return r
            })}
            {/* Lo de un salto propio sin nivel: gris, encima. */}
            {s.pies > base && <rect x={x} y={y(s.pies)} width={barra} height={y(base) - y(s.pies)} fill="#9ca3af" opacity={0.7} />}
            {g != null && <line x1={x - 4} x2={x + barra + 4} y1={y(g)} y2={y(g)} stroke="#f0b429" strokeWidth={2} strokeDasharray="4 3" />}
            {s.pies > 0 && (
              <text x={x + barra / 2} y={Math.min(y(s.pies), g != null ? y(g) : y(s.pies)) - 6} textAnchor="middle" style={pasa ? ALERTA : VALOR}>
                {s.pies}{pasa ? ' ' + pct(s.pies / todas[i - 1] - 1) : ''}
              </text>
            )}
            <text x={x + barra / 2} y={H - 10} textAnchor="middle" style={i === semanas.length - 1 ? { ...TXT, fill: '#d7dce3' } : TXT}>{fechaCorta(s.lunes)}</text>
          </g>
        )
      })}
      {propuesta != null && (() => {
        const x = izq + banda * idx.length + (banda - barra) / 2
        return (
          <g>
            <rect x={x} y={y(propuesta)} width={barra} height={Math.max(0, y(0) - y(propuesta))} fill="rgba(255,255,255,.04)" stroke="#d7dce3" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x + barra / 2} y={y(propuesta) - 6} textAnchor="middle" style={VALOR}>{propuesta}</text>
            <text x={x + barra / 2} y={H - 10} textAnchor="middle" style={{ ...TXT, fill: '#fdba74' }}>próxima</text>
          </g>
        )
      })()}
    </Marco>
  )
}

export function LeyendaContactos({ semanas, desde = 0, conPropuesta }: { semanas: SemanaSaltos[]; desde?: number; conPropuesta: boolean }) {
  const vistas = semanas.slice(Math.max(0, desde))
  const usados = NIVELES_PLIO.filter(k => vistas.some(s => s.porNivel[k]))
  const sinNivel = vistas.some(s => s.pies > NIVELES_PLIO.reduce((a, k) => a + (s.porNivel[k] || 0), 0))
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-gray-400">
      {usados.map(k => (
        <span key={k} className="inline-flex items-center gap-1.5"><LetraNivel nivel={k} pequena />{peldano('inferior', k).anade}</span>
      ))}
      {sinNivel && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-400/70" />Saltos propios sin nivel</span>}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[18px] border-t-2 border-dashed border-[#f0b429]" />Hasta dónde podía subir (+20 % sobre la anterior)</span>
      {conPropuesta && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-[11px] rounded-sm border-[1.5px] border-dashed border-gray-300" />La semana que viene, lo que propone la app</span>}
    </div>
  )
}

/** Saltos y carrera, una encima de la otra: los dos son impacto. En ámbar, las semanas en que suben los dos. */
export function GraficaSaltosCarrera({ semanas, desde = 0, nombre }: { semanas: SemanaSaltos[]; desde?: number; nombre: string }) {
  const W = 560, H = 262, izq = 10, der = 10
  const idx = semanas.map((_, i) => i).slice(Math.max(0, desde))
  const banda = (W - izq - der) / Math.max(1, idx.length)
  const barra = Math.min(30, banda * 0.5)
  const panel = (valor: (s: SemanaSaltos) => number, y0: number, y1: number, color: string) => {
    const max = Math.max(1, ...idx.map(i => valor(semanas[i])))
    return idx.map((i, j) => {
      const v = valor(semanas[i])
      const x = izq + banda * j + (banda - barra) / 2, h = ((y1 - y0) * v) / max
      return (
        <g key={i}>
          {v > 0 && <rect x={x} y={y1 - h} width={barra} height={h} fill={color} opacity={0.8} />}
          <text x={x + barra / 2} y={y1 - h - 5} textAnchor="middle" style={VALOR}>{v}</text>
        </g>
      )
    })
  }
  return (
    <Marco ancho={W} alto={H} etiqueta={'Contactos de saltos y minutos de carrera por semana de ' + nombre}>
      {idx.map((i, j) => {
        const a = semanas[i - 1], s = semanas[i]
        const lasDos = !!a && a.pies > 0 && s.pies > a.pies && a.carrera > 0 && s.carrera / a.carrera - 1 > CARRERA_MAX
        return lasDos ? (
          <g key={'d' + i}>
            <rect x={izq + banda * j + 2} y={22} width={banda - 4} height={206} rx={6} fill="rgba(240,180,41,.10)" stroke="rgba(240,180,41,.45)" />
            <text x={izq + banda * j + banda / 2} y={256} textAnchor="middle" style={ALERTA}>suben las dos</text>
          </g>
        ) : null
      })}
      <text x={izq} y={14} style={{ ...TXT, fill: '#a0aab7' }}>Contactos de saltos</text>
      {panel(s => s.pies, 40, 112, '#d7dce3')}
      <text x={izq} y={132} style={{ ...TXT, fill: '#a0aab7' }}>Carrera, minutos</text>
      {panel(s => s.carrera, 156, 222, '#4ade80')}
      {idx.map((i, j) => (
        <text key={'f' + i} x={izq + banda * j + banda / 2} y={242} textAnchor="middle" style={i === semanas.length - 1 ? { ...TXT, fill: '#d7dce3' } : TXT}>{fechaCorta(semanas[i].lunes)}</text>
      ))}
    </Marco>
  )
}

/** Lanzamientos del tren superior y del tronco por semana: van aparte de los contactos de pie. */
export function GraficaLanzamientos({ semanas, desde = 0, nombre }: { semanas: SemanaSaltos[]; desde?: number; nombre: string }) {
  const W = 560, H = 170, izq = 10, der = 10, arr = 22, abj = 26
  const idx = semanas.map((_, i) => i).slice(Math.max(0, desde))
  const max = Math.max(1, ...idx.map(i => semanas[i].lanzamientos))
  const banda = (W - izq - der) / Math.max(1, idx.length)
  const barra = Math.min(30, banda * 0.5)
  return (
    <Marco ancho={W} alto={H} etiqueta={'Lanzamientos por semana de ' + nombre}>
      {idx.map((i, j) => {
        const v = semanas[i].lanzamientos
        const x = izq + banda * j + (banda - barra) / 2, h = ((H - arr - abj) * v) / max
        return (
          <g key={i}>
            {v > 0 && <rect x={x} y={H - abj - h} width={barra} height={h} fill="#93c5fd" opacity={0.8} />}
            {v > 0 && <text x={x + barra / 2} y={H - abj - h - 5} textAnchor="middle" style={VALOR}>{v}</text>}
            <text x={x + barra / 2} y={H - 8} textAnchor="middle" style={i === semanas.length - 1 ? { ...TXT, fill: '#d7dce3' } : TXT}>{fechaCorta(semanas[i].lunes)}</text>
          </g>
        )
      })}
    </Marco>
  )
}

const LECTURA: Record<Tendencia['estado'], [string, string]> = {
  sin: ['Sin tests', 'bg-white/5 text-gray-400'],
  caducado: ['Caducado', 'bg-amber-400/10 text-amber-200'],
  base: ['Su base', 'bg-white/5 text-gray-400'],
  cae: ['Cae: fatiga', 'bg-red-400/10 text-red-200'],
  mejora: ['Mejora de verdad', 'bg-emerald-400/10 text-emerald-200'],
  apunta: ['Sube, sin confirmar', 'bg-amber-400/10 text-amber-200'],
  estable: ['Estable', 'bg-white/5 text-gray-400'],
}

/** Un test a lo largo del tiempo, con la banda de su base ± el error de medida. */
export function MarcadorTest({ nombre, serie, t, unidad = '', dec = 1, vacio }: {
  nombre: string
  serie: PuntoTest[]
  t: Tendencia
  unidad?: string
  dec?: number
  vacio: string
}) {
  const coma = (v: number) => v.toFixed(dec).replace('.', ',')
  const [lect, clase] = LECTURA[t.estado]
  const etiqueta = t.estado === 'caducado' ? lect + ' · hace ' + Math.floor((t.dias ?? 0) / 7) + ' semanas'
    : t.estado === 'base' || t.estado === 'sin' || t.cambio == null ? lect : lect + ' · ' + pct(t.cambio)
  const cabecera = (
    <div className="flex justify-between items-baseline gap-2 flex-wrap">
      <b className="text-[12.5px]">{nombre}{t.base != null && <span className="font-mono font-normal text-gray-500"> · base {coma(t.base)}{unidad}</span>}</b>
      <span className={'text-[11.5px] font-semibold px-2 py-0.5 rounded-full ' + clase}>{etiqueta}</span>
    </div>
  )
  if (!serie.length) return <div className="flex flex-col gap-1.5">{cabecera}<p className="text-xs text-gray-400 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-dashed border-gray-700">{vacio}</p></div>
  const pts = serie.slice(-8)
  const W = 300, H = 92, izq = 8, der = 36, arr = 12, abj = 18
  const vals = pts.map(p => p.valor)
  const ref = t.base ?? vals[0]
  const lo = Math.min(...vals, ref * (1 - ERROR_TEST)) * 0.985, hi = Math.max(...vals, ref * (1 + ERROR_TEST)) * 1.015
  const x = (i: number) => izq + (W - izq - der) * (pts.length === 1 ? 0.5 : i / (pts.length - 1))
  const y = (v: number) => arr + (H - arr - abj) * (1 - (v - lo) / (hi - lo || 1))
  const color = { cae: '#f2545b', mejora: '#3fd08a', apunta: '#f0b429', caducado: '#7d8796' }[t.estado as string] || '#d7dce3'
  const ult = pts[pts.length - 1]
  return (
    <div className="flex flex-col gap-1.5">
      {cabecera}
      <Marco ancho={W} alto={H} etiqueta={nombre + ' a lo largo de sus tests'}>
        {t.base != null && <rect x={izq} y={y(ref * (1 + ERROR_TEST))} width={W - izq - der} height={y(ref * (1 - ERROR_TEST)) - y(ref * (1 + ERROR_TEST))} fill="rgba(255,255,255,.07)" />}
        {pts.length > 1 && <polyline points={pts.map((p, i) => x(i) + ',' + y(p.valor)).join(' ')} fill="none" stroke="#d7dce3" strokeWidth={1.6} strokeDasharray={t.estado === 'caducado' ? '3 3' : undefined} opacity={t.estado === 'caducado' ? 0.6 : 1} />}
        {pts.map((p, i) => (
          <g key={p.fecha + i}>
            <circle cx={x(i)} cy={y(p.valor)} r={i === pts.length - 1 ? 4.5 : 3} fill={i === pts.length - 1 ? color : '#d7dce3'} />
            <text x={x(i)} y={H - 4} textAnchor={pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} style={TXT}>{fechaCorta(p.fecha)}</text>
          </g>
        ))}
        <text x={W - der + 6} y={y(ult.valor) + 4} style={VALOR}>{coma(ult.valor)}</text>
      </Marco>
    </div>
  )
}
