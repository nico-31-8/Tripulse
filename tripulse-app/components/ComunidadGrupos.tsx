'use client'
// Pestaña de Grupos de la comunidad.
//
// Un grupo lo crea cualquiera que esté en la comunidad (B2C). Puede ser 'abierto'
// (cualquiera se une) o de 'club' (solo miembros del club). Las quedadas (eventos)
// se añaden en un tramo posterior.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const DEPORTES = [
  { id: 'triatlon', label: 'Triatlón', emoji: '🔺' },
  { id: 'natacion', label: 'Natación', emoji: '🏊' },
  { id: 'ciclismo', label: 'Ciclismo', emoji: '🚴' },
  { id: 'carrera', label: 'Carrera', emoji: '🏃' },
  { id: 'trail', label: 'Trail', emoji: '⛰️' },
  { id: 'duatlon', label: 'Duatlón', emoji: '🏅' },
]
const depMeta = (id?: string | null) => DEPORTES.find(d => d.id === id)

interface Grupo {
  id: string
  nombre: string
  descripcion: string | null
  ambito: string
  id_club: string | null
  disciplina: string | null
  creado_por: string | null
}

export default function ComunidadGrupos({ yoId }: { yoId: string | null }) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [mios, setMios] = useState<Set<string>>(new Set())
  const [roster, setRoster] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)  // grupo desplegado
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', disciplina: '', descripcion: '' })
  // Quedadas
  const [eventos, setEventos] = useState<any[]>([])
  const [asist, setAsist] = useState<any[]>([])
  const [nuevoEvento, setNuevoEvento] = useState<{ grupo: string; titulo: string; dia: string; hora: string; lugar: string } | null>(null)

  const cargar = useCallback(async () => {
    // Cinco consultas independientes en fila. Nada dependía de nada.
    const [g, gm, r, ev, as] = await Promise.all([
      supabase.from('grupo').select('*').order('created_at', { ascending: false }),
      supabase.from('grupo_miembro').select('id_grupo').eq('id_perfil', yoId),
      supabase.from('grupo_roster').select('*'),
      supabase.from('evento').select('*').order('fecha'),
      supabase.from('evento_asistentes_v').select('*'),
    ])
    setGrupos(g.data || [])
    setMios(new Set((gm.data || []).map((x: any) => x.id_grupo)))
    setRoster(r.data || [])
    setEventos(ev.data || [])
    setAsist(as.data || [])
    setCargando(false)
  }, [yoId])

  useEffect(() => { cargar() }, [cargar])

  const crearGrupo = async () => {
    if (!nuevo.nombre.trim()) return
    const { data: nuevoId, error } = await supabase.rpc('crear_grupo', {
      _nombre: nuevo.nombre.trim(), _ambito: 'abierto', _id_club: null, _disciplina: nuevo.disciplina || null,
    })
    if (error) { alert('No se ha podido crear el grupo.\n\n' + error.message); return }
    // La RPC no acepta descripción; se guarda con un update aparte (RLS: el creador ya es
    // admin del grupo → puede actualizarlo). Antes se descartaba y quedaba siempre null.
    const desc = nuevo.descripcion?.trim()
    if (nuevoId && desc) await supabase.from('grupo').update({ descripcion: desc }).eq('id', nuevoId)
    setCreando(false); setNuevo({ nombre: '', disciplina: '', descripcion: '' }); await cargar()
  }

  const unirse = async (idGrupo: string) => {
    const { error } = await supabase.from('grupo_miembro').insert({ id_grupo: idGrupo, id_perfil: yoId, rol: 'miembro' })
    if (error) { alert('No se ha podido unir.\n\n' + error.message); return }
    await cargar()
  }
  const salir = async (idGrupo: string) => {
    const { error } = await supabase.from('grupo_miembro').delete().eq('id_grupo', idGrupo).eq('id_perfil', yoId)
    if (error) { alert('No se ha podido salir.\n\n' + error.message); return }
    await cargar()
  }

  const crearEvento = async () => {
    if (!nuevoEvento?.titulo.trim() || !nuevoEvento.dia) return
    // Día + hora → un instante concreto (hora local). Si no marca hora, 09:00 por defecto.
    const fechaIso = new Date(nuevoEvento.dia + 'T' + (nuevoEvento.hora || '09:00')).toISOString()
    const { error } = await supabase.from('evento').insert({
      id_grupo: nuevoEvento.grupo, titulo: nuevoEvento.titulo.trim(),
      fecha: fechaIso, lugar: nuevoEvento.lugar || null, creado_por: yoId,
    })
    if (error) { alert('No se ha podido crear la quedada.\n\n' + error.message); return }
    setNuevoEvento(null); await cargar()
  }

  const rsvp = async (idEvento: string, estado: string) => {
    const { error } = await supabase.from('evento_asistente').upsert({ id_evento: idEvento, id_perfil: yoId, estado })
    if (error) { alert('No se ha podido responder.\n\n' + error.message); return }
    await cargar()
  }

  const fmtFecha = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  const inputCls = 'bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500'

  if (cargando) return <p className="text-gray-500 text-sm py-8">Cargando…</p>

  const misGrupos = grupos.filter(g => mios.has(g.id))
  const otros = grupos.filter(g => !mios.has(g.id))

  // Función que devuelve JSX (NO componente): si fuera un componente definido aquí
  // dentro, React lo remontaría en cada tecla y el input perdería el foco.
  const tarjeta = (g: Grupo) => {
    const soyMiembro = mios.has(g.id)
    const dep = depMeta(g.disciplina)
    const miembros = roster.filter(r => r.id_grupo === g.id)
    const esta = abierto === g.id
    return (
      <div key={g.id} className={'rounded-2xl border transition ' + (esta ? 'border-gray-600 bg-gray-800/50' : 'border-gray-800 bg-gray-900')}>
        <button onClick={() => setAbierto(esta ? null : g.id)} className="w-full text-left p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">{dep ? dep.emoji : '👥'}</div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white truncate">{g.nombre}</p>
            <p className="text-gray-500 text-xs">{miembros.length || '—'} {miembros.length === 1 ? 'miembro' : 'miembros'}{dep ? ' · ' + dep.label : ''}</p>
          </div>
          {soyMiembro && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30 flex-shrink-0">Miembro</span>}
        </button>
        {esta && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {g.descripcion && <p className="text-gray-400 text-sm">{g.descripcion}</p>}
            {soyMiembro && miembros.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {miembros.map(m => (
                  <span key={m.id_perfil} className="text-[11px] bg-gray-800 text-gray-300 rounded-full px-2.5 py-1">
                    {m.nombre}{m.rol === 'admin' ? ' · admin' : ''}
                  </span>
                ))}
              </div>
            )}
            {/* Quedadas: solo para miembros del grupo */}
            {soyMiembro && (() => {
              const evs = eventos.filter(e => e.id_grupo === g.id)
              const creandoAqui = nuevoEvento?.grupo === g.id
              return (
                <div className="border-t border-gray-800 pt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-gray-300 text-sm font-semibold">📅 Quedadas</p>
                    {!creandoAqui && <button onClick={() => setNuevoEvento({ grupo: g.id, titulo: '', dia: '', hora: '09:00', lugar: '' })} className="text-orange-400 hover:text-orange-300 text-xs transition">+ Nueva quedada</button>}
                  </div>

                  {creandoAqui && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-2">
                      <input value={nuevoEvento!.titulo} onChange={e => setNuevoEvento({ ...nuevoEvento!, titulo: e.target.value })} placeholder="Título (ej. Rodaje suave por el río)" className={inputCls} />
                      <div className="flex gap-2 flex-wrap items-center">
                        <label className="flex flex-col gap-1">
                          <span className="text-gray-500 text-[10px]">Día</span>
                          <input type="date" value={nuevoEvento!.dia} onChange={e => setNuevoEvento({ ...nuevoEvento!, dia: e.target.value })} className={inputCls} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-gray-500 text-[10px]">Hora</span>
                          <input type="time" value={nuevoEvento!.hora} onChange={e => setNuevoEvento({ ...nuevoEvento!, hora: e.target.value })} className={inputCls} />
                        </label>
                      </div>
                      <input value={nuevoEvento!.lugar} onChange={e => setNuevoEvento({ ...nuevoEvento!, lugar: e.target.value })} placeholder="Lugar (opcional)" className={inputCls} />
                      <div className="flex gap-2">
                        <button onClick={crearEvento} className="bg-orange-500 hover:bg-orange-600 px-4 py-1.5 rounded-lg text-sm font-medium transition">Crear</button>
                        <button onClick={() => setNuevoEvento(null)} className="text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg text-sm transition">Cancelar</button>
                      </div>
                    </div>
                  )}

                  {evs.length === 0 && !creandoAqui && <p className="text-gray-600 text-xs">Aún no hay quedadas. Propón una.</p>}

                  {evs.map(e => {
                    const van = asist.filter(a => a.id_evento === e.id && a.estado === 'voy')
                    const miEstado = asist.find(a => a.id_evento === e.id && a.id_perfil === yoId)?.estado
                    return (
                      <div key={e.id} className="bg-gray-900 rounded-xl p-3 flex flex-col gap-2">
                        <div>
                          <p className="text-white text-sm font-medium">{e.titulo}</p>
                          <p className="text-gray-500 text-xs mt-0.5">🕐 {fmtFecha(e.fecha)}{e.lugar ? ' · 📍 ' + e.lugar : ''}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[['voy', 'Voy'], ['quiza', 'Quizá'], ['no', 'No']].map(([v, l]) => (
                            <button key={v} onClick={() => rsvp(e.id, v)}
                              className={'text-xs px-3 py-1 rounded-full border transition ' + (miEstado === v ? 'border-orange-500 bg-orange-500/15 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600')}>
                              {l}
                            </button>
                          ))}
                          <span className="text-gray-500 text-xs ml-1">{van.length > 0 ? van.length + (van.length === 1 ? ' va' : ' van') : 'nadie aún'}</span>
                        </div>
                        {van.length > 0 && <p className="text-gray-600 text-[11px]">{van.map(a => a.nombre).join(', ')}</p>}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {soyMiembro
              ? <button onClick={() => salir(g.id)} className="text-gray-500 hover:text-red-400 text-sm transition self-start">Salir del grupo</button>
              : <button onClick={() => unirse(g.id)} className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition self-start">Unirme al grupo</button>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Crear grupo */}
      <div>
        {!creando ? (
          <button onClick={() => setCreando(true)} className="text-orange-400 hover:text-orange-300 text-sm font-medium transition">+ Crear un grupo</button>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
            <p className="font-semibold text-sm">Nuevo grupo</p>
            <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre (ej. Rodajes domingueros Madrid)" className={inputCls} />
            <div className="flex gap-2 flex-wrap items-center">
              <select value={nuevo.disciplina} onChange={e => setNuevo({ ...nuevo, disciplina: e.target.value })} className={inputCls}>
                <option value="">Deporte (opcional)</option>
                {DEPORTES.map(d => <option key={d.id} value={d.id}>{d.emoji} {d.label}</option>)}
              </select>
            </div>
            <textarea value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} placeholder="Descripción (opcional)" rows={2} className={inputCls} />
            <p className="text-gray-600 text-[11px]">Será un grupo abierto: cualquiera de la comunidad podrá unirse. Serás el admin.</p>
            <div className="flex gap-2">
              <button onClick={crearGrupo} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">Crear grupo</button>
              <button onClick={() => setCreando(false)} className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm transition">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {misGrupos.length > 0 && (
        <div>
          <p className="text-gray-400 text-sm font-semibold mb-2">Tus grupos</p>
          <div className="grid sm:grid-cols-2 gap-3">{misGrupos.map(g => tarjeta(g))}</div>
        </div>
      )}

      <div>
        <p className="text-gray-400 text-sm font-semibold mb-2">Descubrir grupos</p>
        {otros.length === 0 ? (
          <p className="text-gray-600 text-sm py-6 text-center">{grupos.length === 0 ? 'Aún no hay grupos. Crea el primero.' : 'Estás en todos los grupos que hay.'}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">{otros.map(g => tarjeta(g))}</div>
        )}
      </div>
    </div>
  )
}
