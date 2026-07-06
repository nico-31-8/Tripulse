'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'

const GRUPOS_MUSCULARES = [
  'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Cadera y aductores',
  'Rodilla (fortalecimiento)', 'Tobillo y pie', 'Core y estabilidad',
  'Espalda baja', 'Espalda alta y romboides', 'Pectoral',
  'Hombro y manguito rotador', 'Bíceps', 'Tríceps',
  'Natación — específico', 'Ciclismo — específico', 'Carrera — específico',
]

const CLAVE_ADMIN = 'fuerza25'

export default function FuerzaPage() {
  useRequireEntrenador()
  const [ejercicios, setEjercicios] = useState<any[]>([])
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalAñadir, setModalAñadir] = useState(false)
  const [modalVideo, setModalVideo] = useState<string | null>(null)
  const [claveIntroducida, setClaveIntroducida] = useState('')
  const [claveCorrecta, setClaveCorrecta] = useState(false)
  const [claveError, setClaveError] = useState(false)
  const [nombre, setNombre] = useState('')
  const [ejercicioEditando, setEjercicioEditando] = useState<any>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editGrupo, setEditGrupo] = useState('')
  const [editVideo, setEditVideo] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [grupo, setGrupo] = useState('')
  const [urlVideo, setUrlVideo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)

  useEffect(() => {
    cargar()
  }, [])

  const cargar = async () => {
    const { data } = await supabase.from('ejercicios_biblioteca').select('*').order('grupo_muscular').order('nombre')
    setEjercicios(data || [])
    setLoading(false)
  }

  const verificarClave = () => {
    if (claveIntroducida === CLAVE_ADMIN) {
      setClaveCorrecta(true)
      setClaveError(false)
    } else {
      setClaveError(true)
    }
  }

  const guardarEjercicio = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    await supabase.from('ejercicios_biblioteca').insert({
      nombre, grupo_muscular: grupo, url_video: urlVideo || null, descripcion: descripcion || null
    })
    setNombre(''); setGrupo(''); setUrlVideo(''); setDescripcion('')
    setExito(true)
    setTimeout(() => setExito(false), 2000)
    setGuardando(false)
    cargar()
  }

  const getYoutubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([^&\n?#/]+)/)
    return match ? match[1] : null
  }

  const esYoutubeShort = (url: string) => {
    return /youtube\.com\/shorts\//.test(url)
  }

  const abrirEdicion = (ej: any) => {
    setEjercicioEditando(ej)
    setEditNombre(ej.nombre || '')
    setEditGrupo(ej.grupo_muscular || '')
    setEditVideo(ej.url_video || '')
    setEditDescripcion(ej.descripcion || '')
  }

  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardandoEdit(true)
    await supabase.from('ejercicios_biblioteca').update({
      nombre: editNombre,
      grupo_muscular: editGrupo,
      url_video: editVideo || null,
      descripcion: editDescripcion || null,
    }).eq('id', ejercicioEditando.id)
    const { data } = await supabase.from('ejercicios_biblioteca').select('*').order('grupo_muscular').order('nombre')
    setEjercicios(data || [])
    setEjercicioEditando(null)
    setGuardandoEdit(false)
  }

  const eliminarEjercicio = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este ejercicio?')) return
    await supabase.from('ejercicios_biblioteca').delete().eq('id', id)
    const { data } = await supabase.from('ejercicios_biblioteca').select('*').order('grupo_muscular').order('nombre')
    setEjercicios(data || [])
  }

  const gruposConEjercicios = [...new Set(ejercicios.map(e => e.grupo_muscular))]
  const ejerciciosFiltrados = grupoFiltro ? ejercicios.filter(e => e.grupo_muscular === grupoFiltro) : ejercicios

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">Biblioteca de ejercicios</h2>
            <p className="text-gray-400 text-sm">{ejercicios.length} ejercicios disponibles</p>
          </div>
          <button onClick={() => { setModalAñadir(true); setClaveCorrecta(false); setClaveIntroducida(''); setClaveError(false) }}
            className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            + Añadir ejercicio
          </button>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          <button onClick={() => setGrupoFiltro('')}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (!grupoFiltro ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
            Todos
          </button>
          {gruposConEjercicios.map(g => (
            <button key={g} onClick={() => setGrupoFiltro(g)}
              className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' + (grupoFiltro === g ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
              {g}
            </button>
          ))}
        </div>

        {ejerciciosFiltrados.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">🏋️</div>
            <p>No hay ejercicios todavía.</p>
            <p className="text-sm mt-2">Añade el primero con el botón de arriba.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {gruposConEjercicios.filter(g => !grupoFiltro || g === grupoFiltro).map(grupo => {
              const ejercsGrupo = ejerciciosFiltrados.filter(e => e.grupo_muscular === grupo)
              return (
                <div key={grupo} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-800 bg-gray-800">
                    <h3 className="font-bold text-sm text-orange-400">{grupo}</h3>
                    <p className="text-gray-500 text-xs">{ejercsGrupo.length} ejercicios</p>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {ejercsGrupo.map(ej => (
                      <div key={ej.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800 transition">
                        <div>
                          <div className="flex justify-between items-start">
                            <p className="font-medium text-sm">{ej.nombre}</p>
                            {claveCorrecta && (
                              <div className="flex gap-1 ml-2">
                                <button onClick={() => abrirEdicion(ej)} className="text-gray-500 hover:text-orange-400 text-xs px-2 py-0.5 rounded transition">✏️</button>
                                <button onClick={() => eliminarEjercicio(ej.id)} className="text-gray-500 hover:text-red-400 text-xs px-2 py-0.5 rounded transition">🗑</button>
                              </div>
                            )}
                          </div>
                          {ej.descripcion && <p className="text-gray-500 text-xs mt-0.5">{ej.descripcion}</p>}
                        </div>
                        {ej.url_video && (
                          <button onClick={() => setModalVideo(ej.url_video)}
                            className="flex items-center gap-1.5 bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-xs transition">
                            <span>▶</span> Ver video
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-2xl border border-gray-700">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <p className="font-medium">Video del ejercicio</p>
              <button onClick={() => setModalVideo(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-4">
              {esYoutubeShort(modalVideo) ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <p className="text-gray-400 text-sm text-center">
                    Este vídeo es un Short de YouTube y no se puede mostrar dentro de la app.
                  </p>
                  <a href={modalVideo} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg text-sm font-medium transition">
                    <span>▶</span> Abrir en YouTube
                  </a>
                </div>
              ) : getYoutubeId(modalVideo) ? (
                <iframe
                  width="100%" height="360"
                  src={`https://www.youtube.com/embed/${getYoutubeId(modalVideo)}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="rounded-lg"
                />
              ) : (
                <p className="text-gray-400 text-center py-8">URL de video no válida</p>
              )}
            </div>
          </div>
        </div>
      )}

      {modalAñadir && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md border border-gray-700 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Añadir ejercicio</h3>
              <button onClick={() => setModalAñadir(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            {!claveCorrecta ? (
              <div>
                <p className="text-gray-400 text-sm mb-4">Introduce la clave de administrador para añadir ejercicios.</p>
                <input type="password" placeholder="Clave de administrador" value={claveIntroducida}
                  onChange={e => setClaveIntroducida(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && verificarClave()}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full mb-3" />
                {claveError && <p className="text-red-400 text-sm mb-3">Clave incorrecta</p>}
                <button onClick={verificarClave} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition w-full">
                  Verificar
                </button>
              </div>
            ) : (
              <form onSubmit={guardarEjercicio} className="flex flex-col gap-3">
                <input type="text" placeholder="Nombre del ejercicio" value={nombre} onChange={e => setNombre(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <select value={grupo} onChange={e => setGrupo(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Grupo muscular</option>
                  {GRUPOS_MUSCULARES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <input type="url" placeholder="URL de YouTube (opcional)" value={urlVideo} onChange={e => setUrlVideo(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Descripción (opcional)" value={descripcion} onChange={e => setDescripcion(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                {exito && <p className="text-green-400 text-sm">Ejercicio añadido correctamente</p>}
                <button type="submit" disabled={guardando}
                  className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Guardar ejercicio'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal edición */}
      {ejercicioEditando && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">Editar ejercicio</h3>
              <button onClick={() => setEjercicioEditando(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <form onSubmit={guardarEdicion} className="flex flex-col gap-3">
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Nombre</label>
                <input type="text" value={editNombre} onChange={e => setEditNombre(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Grupo muscular</label>
                <input type="text" value={editGrupo} onChange={e => setEditGrupo(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">URL video (YouTube)</label>
                <input type="text" value={editVideo} onChange={e => setEditVideo(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="https://youtube.com/..." />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Descripción</label>
                <textarea value={editDescripcion} onChange={e => setEditDescripcion(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
              </div>
              <button type="submit" disabled={guardandoEdit}
                className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

