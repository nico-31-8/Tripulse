'use client'
// Pestaña de Retos de la comunidad.
//
// Privacidad: apuntarse = consentir compartir UN número agregado (sesiones/minutos/
// carga del periodo). El cálculo lo hace la BD sobre las sesiones PROPIAS de cada uno
// (actualizar_mi_marcador); nadie ve el entrenamiento de otro ni puede falsear su marca.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'

const METRICAS: Record<string, { label: string; unidad: string }> = {
  sesiones: { label: 'Nº de sesiones', unidad: 'sesiones' },
  tiempo: { label: 'Minutos entrenados', unidad: 'min' },
  carga: { label: 'Carga (UA)', unidad: 'UA' },
}
const DEPORTES = [
  { id: 'natacion', label: '🏊 Natación' }, { id: 'ciclismo', label: '🚴 Ciclismo' },
  { id: 'carrera', label: '🏃 Carrera' },
]

interface Reto {
  id: string; titulo: string; descripcion: string | null; metrica: string
  disciplina: string | null; ambito: string; fecha_inicio: string; fecha_fin: string
}

export default function ComunidadRetos({ yoId }: { yoId: string | null }) {
  const [retos, setRetos] = useState<Reto[]>([])
  const [mios, setMios] = useState<Set<string>>(new Set())
  const [marcadores, setMarcadores] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [actualizando, setActualizando] = useState<string | null>(null)
  const hoy = hoyISO()
  const [nuevo, setNuevo] = useState({ titulo: '', metrica: 'sesiones', disciplina: '', fecha_inicio: hoy, fecha_fin: '' })

  const cargar = useCallback(async () => {
    const [r, rp, m] = await Promise.all([
      supabase.from('reto').select('*').order('fecha_fin', { ascending: false }),
      supabase.from('reto_participante').select('id_reto').eq('id_perfil', yoId),
      supabase.from('reto_marcador_v').select('*'),
    ])
    setRetos(r.data || [])
    setMios(new Set((rp.data || []).map((x: any) => x.id_reto)))
    setMarcadores(m.data || [])
    setCargando(false)
  }, [yoId])

  useEffect(() => { cargar() }, [cargar])

  const crearReto = async () => {
    if (!nuevo.titulo.trim() || !nuevo.fecha_fin) return
    const { error } = await supabase.from('reto').insert({
      titulo: nuevo.titulo.trim(), metrica: nuevo.metrica, disciplina: nuevo.disciplina || null,
      ambito: 'abierto', fecha_inicio: nuevo.fecha_inicio, fecha_fin: nuevo.fecha_fin, creado_por: yoId,
    })
    if (error) { alert('No se ha podido crear el reto.\n\n' + error.message); return }
    setCreando(false); setNuevo({ titulo: '', metrica: 'sesiones', disciplina: '', fecha_inicio: hoy, fecha_fin: '' }); await cargar()
  }

  const apuntarse = async (idReto: string) => {
    const { error } = await supabase.from('reto_participante').insert({ id_reto: idReto, id_perfil: yoId })
    if (error) { alert('No se ha podido apuntar.\n\n' + error.message); return }
    await supabase.rpc('actualizar_mi_marcador', { _reto: idReto })  // marca inicial
    await cargar()
  }
  const salirse = async (idReto: string) => {
    const { error } = await supabase.from('reto_participante').delete().eq('id_reto', idReto).eq('id_perfil', yoId)
    if (error) { alert('No se ha podido salir.\n\n' + error.message); return }
    await cargar()
  }
  const actualizarMarca = async (idReto: string) => {
    setActualizando(idReto)
    await supabase.rpc('actualizar_mi_marcador', { _reto: idReto })
    setActualizando(null)
    await cargar()
  }

  const inputCls = 'bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500'
  const fmtDia = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })
  const estadoReto = (r: Reto) => r.fecha_fin < hoy ? 'terminado' : r.fecha_inicio > hoy ? 'próximo' : 'en curso'

  if (cargando) return <p className="text-gray-500 text-sm py-8">Cargando…</p>

  const misRetos = retos.filter(r => mios.has(r.id))
  const otros = retos.filter(r => !mios.has(r.id))
  const medalla = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.'

  const tarjeta = (r: Reto) => {
    const soy = mios.has(r.id)
    const esta = abierto === r.id
    const est = estadoReto(r)
    const ranking = marcadores.filter(m => m.id_reto === r.id).sort((a, b) => b.valor - a.valor)
    const met = METRICAS[r.metrica]
    return (
      <div key={r.id} className={'rounded-2xl border transition ' + (esta ? 'border-gray-600 bg-gray-800/50' : 'border-gray-800 bg-gray-900')}>
        <button onClick={() => setAbierto(esta ? null : r.id)} className="w-full text-left p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">🏆</div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white truncate">{r.titulo}</p>
            <p className="text-gray-500 text-xs">{met?.label} · {fmtDia(r.fecha_inicio)}–{fmtDia(r.fecha_fin)}</p>
          </div>
          <span className={'text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ' +
            (est === 'en curso' ? 'bg-green-500/15 text-green-300 border-green-500/30'
              : est === 'próximo' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
              : 'bg-gray-700/40 text-gray-400 border-gray-700')}>{est}</span>
        </button>
        {esta && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {soy ? (
              <>
                {/* Ranking */}
                <div className="flex flex-col gap-1">
                  {ranking.length === 0 ? <p className="text-gray-600 text-xs">Nadie ha actualizado su marca aún.</p> : ranking.map((m, i) => (
                    <div key={m.id_perfil} className={'flex items-center gap-2 rounded-lg px-2.5 py-1.5 ' + (m.id_perfil === yoId ? 'bg-orange-500/10' : 'bg-gray-900/50')}>
                      <span className="w-6 text-center text-sm">{medalla(i)}</span>
                      <span className="text-sm text-white flex-1 truncate">{m.nombre}{m.id_perfil === yoId && <span className="text-gray-500 text-xs"> · tú</span>}</span>
                      <span className="text-sm font-bold text-orange-400">{Math.round(m.valor)} <span className="text-gray-500 font-normal text-xs">{met?.unidad}</span></span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => actualizarMarca(r.id)} disabled={actualizando === r.id}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-4 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                    {actualizando === r.id ? 'Calculando…' : '↻ Actualizar mi marca'}
                  </button>
                  <button onClick={() => salirse(r.id)} className="text-gray-500 hover:text-red-400 text-xs transition">Salir del reto</button>
                </div>
                <p className="text-gray-600 text-[11px]">Tu marca se calcula desde tus sesiones. Solo se comparte el número, nunca tus sesiones.</p>
              </>
            ) : (
              <button onClick={() => apuntarse(r.id)} className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition self-start">Apuntarme al reto</button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        {!creando ? (
          <button onClick={() => setCreando(true)} className="text-orange-400 hover:text-orange-300 text-sm font-medium transition">+ Crear un reto</button>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
            <p className="font-semibold text-sm">Nuevo reto</p>
            <input value={nuevo.titulo} onChange={e => setNuevo({ ...nuevo, titulo: e.target.value })} placeholder="Título (ej. Reto de agosto: más km)" className={inputCls} />
            <div className="flex gap-2 flex-wrap">
              <select value={nuevo.metrica} onChange={e => setNuevo({ ...nuevo, metrica: e.target.value })} className={inputCls}>
                {Object.entries(METRICAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={nuevo.disciplina} onChange={e => setNuevo({ ...nuevo, disciplina: e.target.value })} className={inputCls}>
                <option value="">Todos los deportes</option>
                {DEPORTES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <label className="text-gray-400 text-xs">Del</label>
              <input type="date" value={nuevo.fecha_inicio} onChange={e => setNuevo({ ...nuevo, fecha_inicio: e.target.value })} className={inputCls} />
              <label className="text-gray-400 text-xs">al</label>
              <input type="date" value={nuevo.fecha_fin} onChange={e => setNuevo({ ...nuevo, fecha_fin: e.target.value })} className={inputCls} />
            </div>
            <p className="text-gray-600 text-[11px]">Reto abierto: cualquiera de la comunidad puede apuntarse.</p>
            <div className="flex gap-2">
              <button onClick={crearReto} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">Crear reto</button>
              <button onClick={() => setCreando(false)} className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm transition">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {misRetos.length > 0 && (
        <div>
          <p className="text-gray-400 text-sm font-semibold mb-2">Tus retos</p>
          <div className="grid sm:grid-cols-2 gap-3">{misRetos.map(r => tarjeta(r))}</div>
        </div>
      )}

      <div>
        <p className="text-gray-400 text-sm font-semibold mb-2">Descubrir retos</p>
        {otros.length === 0 ? (
          <p className="text-gray-600 text-sm py-6 text-center">{retos.length === 0 ? 'Aún no hay retos. Crea el primero.' : 'Estás en todos los retos que hay.'}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">{otros.map(r => tarjeta(r))}</div>
        )}
      </div>
    </div>
  )
}
