'use client'
// Directorio de la comunidad (vista de quien está social='activo').
//
// Pestañas:
//   · Descubrir → gente de la comunidad, desde `perfil_publico` (paso 2).
//   · Mi club   → compañeros de tus clubes, desde `club_roster` (paso 3). Si eres
//     PLATAFORMA puedes crear clubes; si eres ADMIN de un club, añadir miembros.
//
// Incluye un editor del propio perfil público (ciudad + deportes).
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import ComunidadGrupos from './ComunidadGrupos'
import ComunidadRetos from './ComunidadRetos'

const DEPORTES = [
  { id: 'triatlon', label: 'Triatlón', emoji: '🔺' },
  { id: 'natacion', label: 'Natación', emoji: '🏊' },
  { id: 'ciclismo', label: 'Ciclismo', emoji: '🚴' },
  { id: 'carrera', label: 'Carrera', emoji: '🏃' },
  { id: 'trail', label: 'Trail', emoji: '⛰️' },
  { id: 'duatlon', label: 'Duatlón', emoji: '🏅' },
]
const depMeta = (id: string) => DEPORTES.find(d => d.id === id)

const rolBadge = (rol: string) =>
  rol === 'entrenador' || rol === 'admin'
    ? { txt: rol === 'admin' ? 'Admin' : 'Entrenador', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' }
    : { txt: 'Deportista', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' }

interface Persona {
  id: string
  nombre: string
  rol: string
  ciudad: string | null
  deportes: string[] | null
  avatar_url: string | null
}

function Ficha({ p, esYo }: { p: Persona; esYo: boolean }) {
  const badge = rolBadge(p.rol)
  const inicial = (p.nombre || '?').trim().charAt(0).toUpperCase()
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex gap-3">
      <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-300 flex-shrink-0 overflow-hidden">
        {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : inicial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-white truncate">{p.nombre}{esYo && <span className="text-gray-500 font-normal text-xs"> · tú</span>}</p>
          <span className={'text-[10px] px-1.5 py-0.5 rounded-full border ' + badge.cls}>{badge.txt}</span>
        </div>
        {p.ciudad && <p className="text-gray-400 text-xs mt-0.5">📍 {p.ciudad}</p>}
        {p.deportes && p.deportes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {p.deportes.map(d => {
              const m = depMeta(d)
              return <span key={d} className="text-[11px] bg-gray-800 text-gray-300 rounded-full px-2 py-0.5">{m ? m.emoji + ' ' + m.label : d}</span>
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const TIPOS_CLUB = [
  { id: 'club', label: 'Club' },
  { id: 'federacion', label: 'Federación' },
  { id: 'escuela', label: 'Escuela' },
  { id: 'equipo', label: 'Equipo' },
]
const tipoLabel = (t: string) => TIPOS_CLUB.find(x => x.id === t)?.label || t

interface Club {
  id: string
  nombre: string
  descripcion: string | null
  tipo: string
  ciudad: string | null
  logo_url: string | null
}
// Orden del roster: administradores, luego entrenadores, luego deportistas.
const ORDEN_ROL: Record<string, number> = { admin: 0, entrenador: 1, deportista: 2 }

export default function ComunidadDirectorio({ onSalir }: { onSalir: () => void }) {
  const [tab, setTab] = useState<'descubrir' | 'grupos' | 'retos' | 'club'>('descubrir')
  const [yoId, setYoId] = useState<string | null>(null)
  const [gente, setGente] = useState<Persona[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [clubs, setClubs] = useState<Record<string, Club>>({})
  const [busca, setBusca] = useState('')
  const [cargando, setCargando] = useState(true)

  // Editor del propio perfil público
  const [editando, setEditando] = useState(false)
  const [miCiudad, setMiCiudad] = useState('')
  const [misDeportes, setMisDeportes] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  // Gestión de club
  const [esPlataforma, setEsPlataforma] = useState(false)
  const [creandoClub, setCreandoClub] = useState(false)
  const [nClub, setNClub] = useState({ nombre: '', tipo: 'club', ciudad: '' })
  const [addA, setAddA] = useState<{ club: string; email: string; rol: string } | null>(null)
  const [addMsg, setAddMsg] = useState('')
  // Edición de la identidad del club (solo admin). RLS `club_update` lo permite.
  const [editClub, setEditClub] = useState<{ id: string; descripcion: string; ciudad: string; logo_url: string } | null>(null)
  const [guardandoClub, setGuardandoClub] = useState(false)
  const [invitaciones, setInvitaciones] = useState<{ id: string; id_club: string; nombre_club: string; rol_club: string }[]>([])
  const [invPend, setInvPend] = useState<{ id: string; id_club: string; email: string; rol_club: string }[]>([])

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setYoId(user?.id ?? null)

    const { data: g } = await supabase.from('perfil_publico').select('*').order('nombre')
    setGente(g || [])

    const { data: r } = await supabase.from('club_roster').select('*')
    setRoster(r || [])
    const idsClub = [...new Set((r || []).map((x: any) => x.id_club))]
    if (idsClub.length) {
      const { data: c } = await supabase.from('club').select('id, nombre, descripcion, tipo, ciudad, logo_url').in('id', idsClub)
      setClubs(Object.fromEntries((c || []).map((x: any) => [x.id, x as Club])))
    } else setClubs({})

    const { data: pl } = await supabase.rpc('soy_plataforma')
    setEsPlataforma(!!pl)

    const { data: inv } = await supabase.rpc('mis_invitaciones')
    setInvitaciones(inv || [])

    // Invitaciones que he mandado y siguen pendientes (el RLS me deja verlas como admin
    // del club). Para que el admin sepa que se enviaron y a quién.
    const { data: ip } = await supabase.from('invitacion_club').select('id, id_club, email, rol_club').eq('estado', 'pendiente')
    setInvPend(ip || [])

    if (user) {
      const { data: mio } = await supabase.from('perfiles').select('ciudad, deportes').eq('id', user.id).single()
      setMiCiudad(mio?.ciudad || '')
      setMisDeportes(mio?.deportes || [])
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const guardarPerfil = async () => {
    setGuardando(true)
    const { error } = await supabase.rpc('actualizar_perfil_publico', {
      _ciudad: miCiudad || null, _deportes: misDeportes.length ? misDeportes : null, _bio: null, _avatar_url: null,
    })
    setGuardando(false)
    if (error) { alert('No se ha podido guardar el perfil.'); return }
    setEditando(false); await cargar()
  }

  const crearClub = async () => {
    if (!nClub.nombre.trim() || !yoId) return
    const { error } = await supabase.rpc('crear_club', {
      _nombre: nClub.nombre.trim(), _id_admin: yoId, _tipo: nClub.tipo, _ciudad: nClub.ciudad || null,
    })
    if (error) { alert('No se ha podido crear el club.\n\n' + error.message); return }
    setCreandoClub(false); setNClub({ nombre: '', tipo: 'club', ciudad: '' }); await cargar()
  }

  // Guardar la identidad del club (descripción, ciudad, escudo). Update directo sobre
  // `club`: la política RLS `club_update` solo deja hacerlo a un admin del club.
  const guardarClub = async () => {
    if (!editClub) return
    setGuardandoClub(true)
    const { error } = await supabase.from('club').update({
      descripcion: editClub.descripcion.trim() || null,
      ciudad: editClub.ciudad.trim() || null,
      logo_url: editClub.logo_url.trim() || null,
    }).eq('id', editClub.id)
    setGuardandoClub(false)
    if (error) { alert('No se ha podido guardar el club.\n\n' + error.message); return }
    setEditClub(null); await cargar()
  }

  const enviarInvitacion = async () => {
    if (!addA?.email.trim()) return
    const { error } = await supabase.rpc('invitar_a_club', {
      _id_club: addA.club, _email: addA.email.trim(), _rol_club: addA.rol,
    })
    if (error) { alert('No se ha podido invitar.\n\n' + error.message); return }
    // No se une todavía: queda pendiente hasta que la persona acepte.
    setAddMsg('✉️ Invitación enviada a ' + addA.email.trim() + '. Entrará al club cuando la acepte.')
    setAddA(null); await cargar()
  }

  const responderInvitacion = async (id: string, aceptar: boolean) => {
    const { error } = await supabase.rpc('responder_invitacion', { _id_invitacion: id, _aceptar: aceptar })
    if (error) { alert('No se ha podido responder.\n\n' + error.message); return }
    await cargar()
  }

  // Cambiar el rol de un miembro. El RLS deja hacerlo al admin; el trigger de la BD
  // impide dejar el club sin ningún administrador.
  const cambiarRol = async (idClub: string, idPerfil: string, rol: string) => {
    if (!confirm('¿Cambiar el rol de este miembro del club a «' + rol + '»?')) return
    const { error } = await supabase.from('club_miembro').update({ rol_club: rol }).eq('id_club', idClub).eq('id_perfil', idPerfil)
    if (error) { alert('No se ha podido cambiar el rol.\n\n' + error.message); return }
    await cargar()
  }

  const quitarMiembro = async (idClub: string, idPerfil: string, nombre: string) => {
    if (!confirm('¿Quitar a ' + nombre + ' del club?')) return
    const { error } = await supabase.from('club_miembro').delete().eq('id_club', idClub).eq('id_perfil', idPerfil)
    if (error) { alert('No se ha podido quitar.\n\n' + error.message); return }
    await cargar()
  }

  const toggleDep = (id: string) => setMisDeportes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const q = busca.trim().toLowerCase()
  const genteFiltrada = gente.filter(p =>
    !q || (p.nombre || '').toLowerCase().includes(q) || (p.ciudad || '').toLowerCase().includes(q)
    || (p.deportes || []).some(d => (depMeta(d)?.label || d).toLowerCase().includes(q)))

  const yo = gente.find(p => p.id === yoId)
  const perfilVacio = yo && !yo.ciudad && (!yo.deportes || yo.deportes.length === 0)
  const clubesAdmin = new Set(roster.filter(r => r.id_perfil === yoId && r.rol_club === 'admin').map(r => r.id_club))

  const inputCls = 'bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <main className="min-h-screen text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Comunidad</h1>
            <p className="text-gray-400 text-sm mt-1">Estás dentro. Descubre gente y conecta.</p>
          </div>
          <button onClick={onSalir} className="text-gray-500 hover:text-gray-300 text-sm transition">Salir de la comunidad</button>
        </div>

        <div className="flex gap-1 mb-5 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {([['descubrir', '🌍 Descubrir'], ['grupos', '👥 Grupos'], ['retos', '🏆 Retos'], ['club', '🏛️ Mi club']] as [typeof tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={'text-sm px-4 py-1.5 rounded-lg transition ' + (tab === id ? 'bg-gray-700 text-white font-medium' : 'text-gray-400 hover:text-gray-200')}>
              {label}
            </button>
          ))}
        </div>

        {cargando ? (
          <p className="text-gray-500 text-sm py-8">Cargando…</p>
        ) : tab === 'grupos' ? (
          <ComunidadGrupos yoId={yoId} />
        ) : tab === 'retos' ? (
          <ComunidadRetos yoId={yoId} />
        ) : tab === 'descubrir' ? (
          <>
            {perfilVacio && !editando && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-orange-200 text-sm">Tu perfil está vacío. Añade tu ciudad y deportes para que te encuentren.</p>
                <button onClick={() => setEditando(true)} className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2 rounded-lg transition">Completar perfil</button>
              </div>
            )}
            {editando && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 flex flex-col gap-4">
                <p className="font-semibold">Tu perfil público</p>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Ciudad</span>
                  <input value={miCiudad} onChange={e => setMiCiudad(e.target.value)} placeholder="ej. Madrid" className={inputCls} />
                </label>
                <div>
                  <span className="text-gray-400 text-xs">Deportes</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {DEPORTES.map(d => (
                      <button key={d.id} onClick={() => toggleDep(d.id)}
                        className={'text-xs px-3 py-1.5 rounded-full border transition ' + (misDeportes.includes(d.id) ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600')}>
                        {d.emoji} {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={guardarPerfil} disabled={guardando} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
                  <button onClick={() => setEditando(false)} className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm transition">Cancelar</button>
                </div>
              </div>
            )}
            {!perfilVacio && !editando && (
              <button onClick={() => setEditando(true)} className="text-gray-500 hover:text-gray-300 text-xs mb-4 transition">✏️ Editar mi perfil</button>
            )}
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre, ciudad o deporte…" className="w-full bg-gray-900 border border-gray-800 text-white px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 mb-4 text-sm" />
            {genteFiltrada.length === 0 ? (
              <p className="text-gray-600 text-sm py-8 text-center">
                {gente.length === 0 ? 'Aún no hay nadie más en la comunidad. Serás de los primeros.' : 'Nadie coincide con la búsqueda.'}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {genteFiltrada.map(p => <Ficha key={p.id} p={p} esYo={p.id === yoId} />)}
              </div>
            )}
          </>
        ) : (
          // ---- Mi club ----
          <div className="flex flex-col gap-6">
            {/* Invitaciones recibidas: aceptar o rechazar (consentimiento) */}
            {invitaciones.length > 0 && (
              <div className="bg-sky-500/10 border border-sky-500/30 rounded-2xl p-4 flex flex-col gap-3">
                <p className="text-sky-200 text-sm font-semibold">✉️ Te han invitado a {invitaciones.length === 1 ? 'un club' : invitaciones.length + ' clubes'}</p>
                {invitaciones.map(iv => (
                  <div key={iv.id} className="flex items-center justify-between gap-3 flex-wrap bg-gray-900/50 rounded-lg px-3 py-2">
                    <p className="text-sm text-white"><span className="font-medium">{iv.nombre_club}</span> <span className="text-gray-500">· como {iv.rol_club}</span></p>
                    <div className="flex gap-2">
                      <button onClick={() => responderInvitacion(iv.id, true)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg transition">Aceptar</button>
                      <button onClick={() => responderInvitacion(iv.id, false)} className="text-gray-400 hover:text-gray-200 text-xs px-3 py-1.5 rounded-lg transition">Rechazar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Confirmación de invitación enviada */}
            {addMsg && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-green-300 text-sm">{addMsg}</p>
                <button onClick={() => setAddMsg('')} className="text-green-500/70 hover:text-green-300 text-sm">✕</button>
              </div>
            )}
            {/* Crear club: solo plataforma */}
            {esPlataforma && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                {!creandoClub ? (
                  <button onClick={() => setCreandoClub(true)} className="text-orange-400 hover:text-orange-300 text-sm font-medium transition">
                    + Crear un club <span className="text-gray-600 font-normal">(plataforma)</span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="font-semibold text-sm">Nuevo club</p>
                    <input value={nClub.nombre} onChange={e => setNClub({ ...nClub, nombre: e.target.value })} placeholder="Nombre del club" className={inputCls} />
                    <div className="flex gap-2 flex-wrap">
                      <select value={nClub.tipo} onChange={e => setNClub({ ...nClub, tipo: e.target.value })} className={inputCls}>
                        {TIPOS_CLUB.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      <input value={nClub.ciudad} onChange={e => setNClub({ ...nClub, ciudad: e.target.value })} placeholder="Ciudad (opcional)" className={inputCls + ' flex-1'} />
                    </div>
                    <p className="text-gray-600 text-xs">Serás el administrador del club. Podrás añadir entrenadores y deportistas después.</p>
                    <div className="flex gap-2">
                      <button onClick={crearClub} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">Crear club</button>
                      <button onClick={() => setCreandoClub(false)} className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm transition">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {roster.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🏛️</p>
                <p className="text-gray-300 font-medium">{esPlataforma ? 'Aún no hay ningún club' : 'No perteneces a ningún club todavía'}</p>
                <p className="text-gray-500 text-sm mt-1">{esPlataforma ? 'Crea uno arriba para empezar.' : 'Cuando un club te añada, aquí verás a tus compañeros.'}</p>
              </div>
            ) : (
              Object.values(clubs).map((c) => {
                const idClub = c.id
                const esAdmin = clubesAdmin.has(idClub)
                const miembros = roster.filter(r => r.id_club === idClub)
                const nDep = miembros.filter(r => r.rol_club === 'deportista').length
                const nEnt = miembros.filter(r => r.rol_club === 'entrenador').length
                const editando = editClub?.id === idClub
                return (
                <div key={idClub}>
                  {/* Casa del club: escudo + identidad + contadores (editar/invitar si soy admin) */}
                  <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4 mb-3">
                    <div className="flex items-start gap-3.5">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white flex-shrink-0 overflow-hidden"
                        style={{ background: 'linear-gradient(145deg,#f97316,#ea580c)' }}>
                        {c.logo_url ? <img src={c.logo_url} alt="" className="w-full h-full object-cover" /> : (c.nombre || '?').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-bold text-white truncate">{c.nombre}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800 text-gray-400">{tipoLabel(c.tipo)}</span>
                        </div>
                        <div className="flex items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1 flex-wrap">
                          {c.ciudad && <span>📍 {c.ciudad}</span>}
                          <span>{nDep} {nDep === 1 ? 'deportista' : 'deportistas'}</span>
                          <span>{nEnt} {nEnt === 1 ? 'entrenador' : 'entrenadores'}</span>
                        </div>
                        {c.descripcion && <p className="text-gray-400 text-sm mt-2 leading-snug whitespace-pre-line">{c.descripcion}</p>}
                      </div>
                      {esAdmin && !editando && (
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <button onClick={() => setEditClub({ id: idClub, descripcion: c.descripcion || '', ciudad: c.ciudad || '', logo_url: c.logo_url || '' })}
                            className="text-gray-500 hover:text-gray-300 text-xs transition">✏️ Editar</button>
                          {addA?.club !== idClub && (
                            <button onClick={() => { setAddMsg(''); setAddA({ club: idClub, email: '', rol: 'deportista' }) }}
                              className="text-orange-400 hover:text-orange-300 text-xs transition">✉️ Invitar</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Editor de la identidad del club (solo admin) */}
                    {editando && editClub && (
                      <div className="mt-4 pt-4 border-t border-gray-800 flex flex-col gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-gray-400 text-xs">Descripción</span>
                          <textarea value={editClub.descripcion} onChange={e => setEditClub({ ...editClub, descripcion: e.target.value })}
                            rows={3} placeholder="Presenta el club: quiénes sois, dónde entrenáis, qué ofrecéis…"
                            className={inputCls + ' resize-y'} />
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
                            <span className="text-gray-400 text-xs">Ciudad</span>
                            <input value={editClub.ciudad} onChange={e => setEditClub({ ...editClub, ciudad: e.target.value })} placeholder="ej. Madrid" className={inputCls} />
                          </label>
                          <label className="flex flex-col gap-1 flex-[2] min-w-[200px]">
                            <span className="text-gray-400 text-xs">Escudo (URL de imagen, opcional)</span>
                            <input value={editClub.logo_url} onChange={e => setEditClub({ ...editClub, logo_url: e.target.value })} placeholder="https://…" className={inputCls} />
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={guardarClub} disabled={guardandoClub}
                            className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">{guardandoClub ? 'Guardando…' : 'Guardar'}</button>
                          <button onClick={() => setEditClub(null)} className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm transition">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {addA?.club === idClub && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-3 flex flex-col gap-2">
                      <input value={addA.email} onChange={e => setAddA({ ...addA, email: e.target.value })} placeholder="Email de la persona a invitar" className={inputCls} />
                      <div className="flex gap-2 flex-wrap">
                        <select value={addA.rol} onChange={e => setAddA({ ...addA, rol: e.target.value })} className={inputCls}>
                          <option value="deportista">Deportista</option>
                          <option value="entrenador">Entrenador</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button onClick={enviarInvitacion} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">Enviar invitación</button>
                        <button onClick={() => setAddA(null)} className="text-gray-400 hover:text-gray-200 px-3 py-2 rounded-lg text-sm transition">Cancelar</button>
                      </div>
                      <p className="text-gray-600 text-[11px]">La persona recibirá la invitación y entrará al club solo si la acepta.</p>
                    </div>
                  )}
                  {/* Invitaciones enviadas y pendientes de aceptar (verificación para el admin) */}
                  {clubesAdmin.has(idClub) && invPend.filter(x => x.id_club === idClub).length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {invPend.filter(x => x.id_club === idClub).map(x => (
                        <span key={x.id} className="text-[11px] bg-gray-800 border border-gray-700 text-gray-400 rounded-full px-2.5 py-1">
                          ⏳ {x.email} <span className="text-gray-600">· {x.rol_club} · pendiente</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {miembros.slice().sort((a, b) => (ORDEN_ROL[a.rol_club] ?? 9) - (ORDEN_ROL[b.rol_club] ?? 9) || (a.nombre || '').localeCompare(b.nombre || '')).map(r => (
                      <div key={r.id_perfil} className="flex flex-col gap-1.5">
                        <Ficha esYo={r.id_perfil === yoId}
                          p={{ id: r.id_perfil, nombre: r.nombre, rol: r.rol_club, ciudad: r.ciudad, deportes: null, avatar_url: r.avatar_url }} />
                        {/* Controles del admin: cambiar rol y quitar. Solo si soy admin de este club. */}
                        {clubesAdmin.has(idClub) && (
                          <div className="flex items-center gap-2 px-1">
                            <select value={r.rol_club} onChange={e => cambiarRol(idClub, r.id_perfil, e.target.value)}
                              className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500">
                              <option value="deportista">Deportista</option>
                              <option value="entrenador">Entrenador</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => quitarMiembro(idClub, r.id_perfil, r.nombre)}
                              className="text-gray-500 hover:text-red-400 text-xs transition">Quitar</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )})
            )}
          </div>
        )}
      </div>
    </main>
  )
}
