'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'

const TIPOS = ['Fuerza', 'Movilidad', 'Técnica', 'Rehab']
const DISCIPLINAS = ['Natación', 'Ciclismo', 'Carrera']
const REGIONES = [
  'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Cadera y aductores', 'Rodilla',
  'Tobillo y pie', 'Core', 'Espalda baja', 'Espalda alta', 'Pectoral',
  'Hombro', 'Bíceps', 'Tríceps', 'Cuello',
]
const MOMENTOS = ['dinamico', 'estatico']
const LESIONES = [
  'femoropatelar', 'cintilla-iliotibial', 'tendinopatia-aquiles', 'fascia-plantar',
  'periostitis-tibial', 'tendinopatia-rotuliana', 'hombro-nadador', 'lumbalgia-ciclista', 'cervicalgia',
]
const CATEGORIAS_TEST = ['funcional', 'movilidad', 'clinico']

const LBL_MOMENTO: Record<string, string> = { dinamico: 'Dinámico', estatico: 'Estático' }
const LBL_LESION: Record<string, string> = {
  'femoropatelar': 'Femoropatelar', 'cintilla-iliotibial': 'Cintilla iliotibial',
  'tendinopatia-aquiles': 'Tendinopatía Aquiles', 'fascia-plantar': 'Fascitis plantar',
  'periostitis-tibial': 'Periostitis tibial', 'tendinopatia-rotuliana': 'Tendinopatía rotuliana',
  'hombro-nadador': 'Hombro del nadador', 'lumbalgia-ciclista': 'Lumbalgia ciclista', 'cervicalgia': 'Cervicalgia',
}
const lblLesion = (v: string) => LBL_LESION[v] || v
const lblMomento = (v: string) => LBL_MOMENTO[v] || v

const CLASE_TIPO: Record<string, string> = {
  'Fuerza': 'bg-teal-900 text-teal-300',
  'Movilidad': 'bg-purple-900 text-purple-300',
  'Técnica': 'bg-blue-900 text-blue-300',
  'Rehab': 'bg-red-900 text-red-300',
}

const CLAVE_ADMIN = 'fuerza25'

type Filtros = { tipo: string[]; region: string[]; disciplina: string[]; momento: string[]; lesion: string[] }
const FILTROS_VACIOS: Filtros = { tipo: [], region: [], disciplina: [], momento: [], lesion: [] }

export default function FuerzaPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [tab, setTab] = useState<'ejercicios' | 'tests'>('ejercicios')
  const [ejercicios, setEjercicios] = useState<any[]>([])
  const [tests, setTests] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [filtroCatTest, setFiltroCatTest] = useState<string[]>([])
  const [filtroLesionTest, setFiltroLesionTest] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAñadir, setModalAñadir] = useState(false)
  const [modalVideo, setModalVideo] = useState<string | null>(null)
  const [ejercicioDetalle, setEjercicioDetalle] = useState<any>(null)
  const [testDetalle, setTestDetalle] = useState<any>(null)
  const [claveIntroducida, setClaveIntroducida] = useState('')
  const [claveCorrecta, setClaveCorrecta] = useState(false)
  const [claveError, setClaveError] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  // alta
  const [nombre, setNombre] = useState('')
  const [urlVideo, setUrlVideo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ejecucion, setEjecucion] = useState('')
  const [aTipo, setATipo] = useState<string[]>(['Fuerza'])
  const [aRegion, setARegion] = useState<string[]>([])
  const [aDisc, setADisc] = useState<string[]>([])
  const [aMomento, setAMomento] = useState<string[]>([])
  const [aLesion, setALesion] = useState<string[]>([])
  // edición
  const [ejercicioEditando, setEjercicioEditando] = useState<any>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editVideo, setEditVideo] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editEjecucion, setEditEjecucion] = useState('')
  const [eTipo, setETipo] = useState<string[]>([])
  const [eRegion, setERegion] = useState<string[]>([])
  const [eDisc, setEDisc] = useState<string[]>([])
  const [eMomento, setEMomento] = useState<string[]>([])
  const [eLesion, setELesion] = useState<string[]>([])
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  // tests CRUD
  const TEST_VACIO = { nombre: '', descripcion: '', protocolo: '', valor_referencia: '', interpretacion: '', url_video: '', categoria: [] as string[], region: [] as string[], disciplina: [] as string[], lesion: [] as string[] }
  const [modalTest, setModalTest] = useState(false)
  const [testEditando, setTestEditando] = useState<any>(null)
  const [testForm, setTestForm] = useState<any>(TEST_VACIO)
  const [guardandoTest, setGuardandoTest] = useState(false)

  const cargar = async () => {
    const [ej, tv] = await Promise.all([
      supabase.from('ejercicios_biblioteca').select('*').order('nombre'),
      supabase.from('tests_valoracion').select('*').order('nombre'),
    ])
    setEjercicios(ej.data || [])
    setTests(tv.data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const verificarClave = () => {
    if (claveIntroducida === CLAVE_ADMIN) { setClaveCorrecta(true); setClaveError(false) }
    else setClaveError(true)
  }

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  const toggleFiltro = (dim: keyof Filtros, v: string) =>
    setFiltros(f => ({ ...f, [dim]: toggle(f[dim], v) }))
  const limpiarFiltros = () => { setFiltros(FILTROS_VACIOS); setBusqueda('') }
  const nFiltrosActivos = Object.values(filtros).reduce((n, a) => n + a.length, 0)

  const guardarEjercicio = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const grupo = aRegion[0] || (aTipo.includes('Movilidad') ? 'Movilidad y flexibilidad' : 'Otros')
    await supabase.from('ejercicios_biblioteca').insert({
      nombre, grupo_muscular: grupo, url_video: urlVideo || null,
      descripcion: descripcion || null, ejecucion: ejecucion || null,
      tipo: aTipo, region: aRegion, disciplina: aDisc, momento: aMomento, lesion: aLesion,
    })
    setNombre(''); setUrlVideo(''); setDescripcion(''); setEjecucion('')
    setATipo(['Fuerza']); setARegion([]); setADisc([]); setAMomento([]); setALesion([])
    setExito(true)
    setTimeout(() => setExito(false), 2000)
    setGuardando(false)
    cargar()
  }

  const abrirEdicion = (ej: any) => {
    setEjercicioEditando(ej)
    setEditNombre(ej.nombre || ''); setEditVideo(ej.url_video || '')
    setEditDescripcion(ej.descripcion || ''); setEditEjecucion(ej.ejecucion || '')
    setETipo(ej.tipo || []); setERegion(ej.region || []); setEDisc(ej.disciplina || [])
    setEMomento(ej.momento || []); setELesion(ej.lesion || [])
  }

  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardandoEdit(true)
    await supabase.from('ejercicios_biblioteca').update({
      nombre: editNombre, url_video: editVideo || null,
      descripcion: editDescripcion || null, ejecucion: editEjecucion || null,
      tipo: eTipo, region: eRegion, disciplina: eDisc, momento: eMomento, lesion: eLesion,
    }).eq('id', ejercicioEditando.id)
    setEjercicioEditando(null)
    setGuardandoEdit(false)
    cargar()
  }

  const eliminarEjercicio = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este ejercicio?')) return
    await supabase.from('ejercicios_biblioteca').delete().eq('id', id)
    cargar()
  }

  const abrirAñadirTest = () => {
    setTestEditando(null); setTestForm(TEST_VACIO); setModalTest(true)
    setClaveCorrecta(false); setClaveIntroducida(''); setClaveError(false)
  }
  const abrirEdicionTest = (t: any) => {
    setTestEditando(t)
    setTestForm({
      nombre: t.nombre || '', descripcion: t.descripcion || '', protocolo: t.protocolo || '',
      valor_referencia: t.valor_referencia || '', interpretacion: t.interpretacion || '', url_video: t.url_video || '',
      categoria: t.categoria || [], region: t.region || [], disciplina: t.disciplina || [], lesion: t.lesion || [],
    })
    setModalTest(true)
  }
  const tfSet = (campo: string, valor: any) => setTestForm((f: any) => ({ ...f, [campo]: valor }))
  const tfToggle = (campo: string, v: string) => setTestForm((f: any) => ({ ...f, [campo]: toggle(f[campo] || [], v) }))
  const guardarTest = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardandoTest(true)
    const payload = {
      nombre: testForm.nombre, descripcion: testForm.descripcion || null, protocolo: testForm.protocolo || null,
      valor_referencia: testForm.valor_referencia || null, interpretacion: testForm.interpretacion || null,
      url_video: testForm.url_video || null, categoria: testForm.categoria, region: testForm.region,
      disciplina: testForm.disciplina, lesion: testForm.lesion,
    }
    if (testEditando) await supabase.from('tests_valoracion').update(payload).eq('id', testEditando.id)
    else await supabase.from('tests_valoracion').insert(payload)
    setModalTest(false); setTestEditando(null); setTestForm(TEST_VACIO); setGuardandoTest(false); cargar()
  }
  const eliminarTest = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este test?')) return
    await supabase.from('tests_valoracion').delete().eq('id', id)
    cargar()
  }

  const getYoutubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([^&\n?#/]+)/)
    return match ? match[1] : null
  }
  const esYoutubeShort = (url: string) => /youtube\.com\/shorts\//.test(url)

  const arr = (v: any): string[] => Array.isArray(v) ? v : []
  const matchesFiltros = (ej: any) => {
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!(ej.nombre || '').toLowerCase().includes(q) && !(ej.descripcion || '').toLowerCase().includes(q)) return false
    }
    return (['tipo', 'region', 'disciplina', 'momento', 'lesion'] as (keyof Filtros)[])
      .every(d => filtros[d].length === 0 || arr(ej[d]).some(v => filtros[d].includes(v)))
  }
  const ejerciciosFiltrados = ejercicios.filter(matchesFiltros)

  const testsFiltrados = tests.filter(t => {
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!(t.nombre || '').toLowerCase().includes(q) && !(t.descripcion || '').toLowerCase().includes(q)) return false
    }
    if (filtroCatTest.length && !arr(t.categoria).some(c => filtroCatTest.includes(c))) return false
    if (filtroLesionTest.length && !arr(t.lesion).some(l => filtroLesionTest.includes(l))) return false
    return true
  })

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  const Chip = ({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) => (
    <button type="button" onClick={onClick}
      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
        (activo ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
      {children}
    </button>
  )

  const Badge = ({ cls, children }: { cls: string; children: ReactNode }) => (
    <span className={'text-[11px] px-2 py-0.5 rounded-full ' + cls}>{children}</span>
  )

  const badgesEjercicio = (ej: any, todas = false) => (
    <div className="flex gap-1.5 flex-wrap">
      {arr(ej.tipo).map((t: string) => <Badge key={t} cls={CLASE_TIPO[t] || 'bg-gray-800 text-gray-300'}>{t}</Badge>)}
      {arr(ej.disciplina).map((d: string) => <Badge key={d} cls="bg-sky-900 text-sky-300">{d}</Badge>)}
      {arr(ej.lesion).map((l: string) => <Badge key={l} cls="bg-orange-900/70 text-orange-300">{lblLesion(l)}</Badge>)}
      {arr(ej.momento).map((m: string) => <Badge key={m} cls="bg-amber-900 text-amber-300">{lblMomento(m)}</Badge>)}
      {todas && arr(ej.region).map((r: string) => <Badge key={r} cls="bg-gray-800 text-gray-300">{r}</Badge>)}
    </div>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-2xl font-bold mb-1">Biblioteca de fuerza</h2>
            <p className="text-gray-400 text-sm">{ejercicios.length} ejercicios · {tests.length} tests</p>
          </div>
          {tab === 'ejercicios' && (
            <button onClick={() => { setModalAñadir(true); setClaveCorrecta(false); setClaveIntroducida(''); setClaveError(false) }}
              className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
              + Añadir ejercicio
            </button>
          )}
          {tab === 'tests' && (
            <button onClick={abrirAñadirTest}
              className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
              + Añadir test
            </button>
          )}
        </div>

        <div className="flex gap-1 mb-5 bg-gray-900 p-1 rounded-lg w-fit border border-gray-800">
          <button onClick={() => setTab('ejercicios')}
            className={'px-4 py-1.5 rounded-md text-sm font-medium transition ' + (tab === 'ejercicios' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
            Ejercicios
          </button>
          <button onClick={() => setTab('tests')}
            className={'px-4 py-1.5 rounded-md text-sm font-medium transition ' + (tab === 'tests' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
            Tests
          </button>
        </div>

        <input type="text" placeholder="Buscar por nombre o descripción…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="bg-gray-900 text-white px-4 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full mb-4 border border-gray-800 text-sm" />

        {tab === 'ejercicios' ? (
          <>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Tipo</span>
              <div className="flex gap-2 flex-wrap">
                {TIPOS.map(t => <Chip key={t} activo={filtros.tipo.includes(t)} onClick={() => toggleFiltro('tipo', t)}>{t}</Chip>)}
              </div>
            </div>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Disciplina</span>
              <div className="flex gap-2 flex-wrap">
                {DISCIPLINAS.map(d => <Chip key={d} activo={filtros.disciplina.includes(d)} onClick={() => toggleFiltro('disciplina', d)}>{d}</Chip>)}
              </div>
            </div>

            <button onClick={() => setMostrarFiltros(m => !m)} className="text-xs text-gray-400 hover:text-white mb-3 transition">
              {mostrarFiltros ? '▾' : '▸'} Más filtros (región, lesión, momento)
            </button>
            {mostrarFiltros && (
              <div className="flex flex-col gap-3 mb-4 bg-gray-900 rounded-xl border border-gray-800 p-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Región</p>
                  <div className="flex gap-2 flex-wrap">
                    {REGIONES.map(r => <Chip key={r} activo={filtros.region.includes(r)} onClick={() => toggleFiltro('region', r)}>{r}</Chip>)}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Lesión (rehab)</p>
                  <div className="flex gap-2 flex-wrap">
                    {LESIONES.map(l => <Chip key={l} activo={filtros.lesion.includes(l)} onClick={() => toggleFiltro('lesion', l)}>{lblLesion(l)}</Chip>)}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Momento (movilidad)</p>
                  <div className="flex gap-2 flex-wrap">
                    {MOMENTOS.map(m => <Chip key={m} activo={filtros.momento.includes(m)} onClick={() => toggleFiltro('momento', m)}>{lblMomento(m)}</Chip>)}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-xs">{ejerciciosFiltrados.length} resultados</p>
              {(nFiltrosActivos > 0 || busqueda) && (
                <button onClick={limpiarFiltros} className="text-xs text-orange-400 hover:text-orange-300 transition">Limpiar filtros</button>
              )}
            </div>

            {ejerciciosFiltrados.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">🏋️</div>
                <p>Ningún ejercicio coincide con los filtros.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {ejerciciosFiltrados.map(ej => (
                  <div key={ej.id} onClick={() => setEjercicioDetalle(ej)}
                    className="bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition cursor-pointer flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{ej.nombre}</p>
                      {claveCorrecta && (
                        <div className="flex gap-1 shrink-0">
                          <button onClick={e => { e.stopPropagation(); abrirEdicion(ej) }} className="text-gray-500 hover:text-orange-400 text-xs px-1 transition">✏️</button>
                          <button onClick={e => { e.stopPropagation(); eliminarEjercicio(ej.id) }} className="text-gray-500 hover:text-red-400 text-xs px-1 transition">🗑</button>
                        </div>
                      )}
                    </div>
                    {ej.descripcion && <p className="text-gray-500 text-xs line-clamp-2">{ej.descripcion}</p>}
                    {badgesEjercicio(ej)}
                    <div className="flex items-center gap-2 mt-auto pt-1">
                      {ej.ejecucion && <span className="text-gray-600 text-xs">Ver técnica →</span>}
                      {ej.url_video && (
                        <button onClick={e => { e.stopPropagation(); setModalVideo(ej.url_video) }}
                          className="flex items-center gap-1.5 bg-red-900 hover:bg-red-800 text-red-300 px-2.5 py-1 rounded-lg text-xs transition ml-auto">
                          <span>▶</span> Video
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Categoría</span>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIAS_TEST.map(c => (
                  <Chip key={c} activo={filtroCatTest.includes(c)} onClick={() => setFiltroCatTest(a => toggle(a, c))}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="mb-4 flex items-start gap-3">
              <span className="text-xs text-gray-500 uppercase tracking-wide mt-1.5">Lesión</span>
              <div className="flex gap-2 flex-wrap">
                {LESIONES.map(l => (
                  <Chip key={l} activo={filtroLesionTest.includes(l)} onClick={() => setFiltroLesionTest(a => toggle(a, l))}>{lblLesion(l)}</Chip>
                ))}
              </div>
            </div>

            <p className="text-gray-500 text-xs mb-3">{testsFiltrados.length} tests</p>
            {testsFiltrados.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">📋</div>
                <p>Ningún test coincide con los filtros.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {testsFiltrados.map(t => (
                  <div key={t.id} onClick={() => setTestDetalle(t)}
                    className="bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition cursor-pointer flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{t.nombre}</p>
                      {claveCorrecta && (
                        <div className="flex gap-1 shrink-0">
                          <button onClick={e => { e.stopPropagation(); abrirEdicionTest(t) }} className="text-gray-500 hover:text-orange-400 text-xs px-1 transition">✏️</button>
                          <button onClick={e => { e.stopPropagation(); eliminarTest(t.id) }} className="text-gray-500 hover:text-red-400 text-xs px-1 transition">🗑</button>
                        </div>
                      )}
                    </div>
                    {t.descripcion && <p className="text-gray-500 text-xs line-clamp-2">{t.descripcion}</p>}
                    <div className="flex gap-1.5 flex-wrap">
                      {arr(t.categoria).map((c: string) => <Badge key={c} cls="bg-green-900 text-green-300">{c}</Badge>)}
                      {arr(t.disciplina).map((d: string) => <Badge key={d} cls="bg-sky-900 text-sky-300">{d}</Badge>)}
                      {arr(t.lesion).map((l: string) => <Badge key={l} cls="bg-orange-900/70 text-orange-300">{lblLesion(l)}</Badge>)}
                    </div>
                    {t.valor_referencia && (
                      <p className="text-xs text-gray-400 mt-auto pt-1"><span className="text-gray-600">Ref: </span>{t.valor_referencia}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detalle ejercicio */}
      {ejercicioDetalle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-40 p-4" onClick={() => setEjercicioDetalle(null)}>
          <div className="bg-gray-900 rounded-xl w-full max-w-lg border border-gray-700 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-4 p-5 border-b border-gray-800">
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-bold">{ejercicioDetalle.nombre}</h3>
                {badgesEjercicio(ejercicioDetalle, true)}
              </div>
              <button onClick={() => setEjercicioDetalle(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-5 overflow-y-auto flex flex-col gap-5">
              {ejercicioDetalle.descripcion && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1.5">Para qué sirve</p>
                  <p className="text-gray-200 text-sm leading-relaxed">{ejercicioDetalle.descripcion}</p>
                </div>
              )}
              {ejercicioDetalle.ejecucion ? (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1.5">Cómo se hace</p>
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{ejercicioDetalle.ejecucion}</p>
                </div>
              ) : (
                <p className="text-gray-600 text-xs italic">Sin técnica registrada todavía.</p>
              )}
            </div>
            {ejercicioDetalle.url_video && (
              <div className="p-5 border-t border-gray-800">
                <button onClick={() => { setModalVideo(ejercicioDetalle.url_video); setEjercicioDetalle(null) }}
                  className="flex items-center justify-center gap-2 bg-red-900 hover:bg-red-800 text-red-300 w-full py-3 rounded-lg text-sm font-medium transition">
                  <span>▶</span> Ver video
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detalle test */}
      {testDetalle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-40 p-4" onClick={() => setTestDetalle(null)}>
          <div className="bg-gray-900 rounded-xl w-full max-w-lg border border-gray-700 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-4 p-5 border-b border-gray-800">
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-bold">{testDetalle.nombre}</h3>
                <div className="flex gap-1.5 flex-wrap">
                  {arr(testDetalle.categoria).map((c: string) => <Badge key={c} cls="bg-green-900 text-green-300">{c}</Badge>)}
                  {arr(testDetalle.disciplina).map((d: string) => <Badge key={d} cls="bg-sky-900 text-sky-300">{d}</Badge>)}
                  {arr(testDetalle.lesion).map((l: string) => <Badge key={l} cls="bg-orange-900/70 text-orange-300">{lblLesion(l)}</Badge>)}
                </div>
              </div>
              <button onClick={() => setTestDetalle(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-5 overflow-y-auto flex flex-col gap-4">
              {testDetalle.descripcion && <p className="text-gray-200 text-sm leading-relaxed">{testDetalle.descripcion}</p>}
              {testDetalle.protocolo && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1.5">Protocolo</p>
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{testDetalle.protocolo}</p>
                </div>
              )}
              {testDetalle.valor_referencia && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Valor de referencia</p>
                  <p className="text-green-300 text-sm font-medium">{testDetalle.valor_referencia}</p>
                </div>
              )}
              {testDetalle.interpretacion && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1.5">Interpretación</p>
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{testDetalle.interpretacion}</p>
                </div>
              )}
            </div>
            {testDetalle.url_video && (
              <div className="p-5 border-t border-gray-800">
                <button onClick={() => { setModalVideo(testDetalle.url_video); setTestDetalle(null) }}
                  className="flex items-center justify-center gap-2 bg-red-900 hover:bg-red-800 text-red-300 w-full py-3 rounded-lg text-sm font-medium transition">
                  <span>▶</span> Ver video
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video */}
      {modalVideo && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-2xl border border-gray-700">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <p className="font-medium">Video</p>
              <button onClick={() => setModalVideo(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-4">
              {esYoutubeShort(modalVideo) ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <p className="text-gray-400 text-sm text-center">Este vídeo es un Short de YouTube y no se puede mostrar dentro de la app.</p>
                  <a href={modalVideo} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg text-sm font-medium transition">
                    <span>▶</span> Abrir en YouTube
                  </a>
                </div>
              ) : getYoutubeId(modalVideo) ? (
                <iframe width="100%" height="360" src={`https://www.youtube.com/embed/${getYoutubeId(modalVideo)}`}
                  frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen className="rounded-lg" />
              ) : (
                <p className="text-gray-400 text-center py-8">URL de video no válida</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Añadir */}
      {modalAñadir && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md border border-gray-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Añadir ejercicio</h3>
              <button onClick={() => setModalAñadir(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            {!claveCorrecta ? (
              <div>
                <p className="text-gray-400 text-sm mb-4">Introduce la clave de administrador para añadir ejercicios.</p>
                <input type="password" placeholder="Clave de administrador" value={claveIntroducida}
                  onChange={e => setClaveIntroducida(e.target.value)} onKeyDown={e => e.key === 'Enter' && verificarClave()}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full mb-3" />
                {claveError && <p className="text-red-400 text-sm mb-3">Clave incorrecta</p>}
                <button onClick={verificarClave} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition w-full">Verificar</button>
              </div>
            ) : (
              <form onSubmit={guardarEjercicio} className="flex flex-col gap-3">
                <input type="text" placeholder="Nombre del ejercicio" value={nombre} onChange={e => setNombre(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Tipo</label>
                  <div className="flex gap-2 flex-wrap">{TIPOS.map(t => <Chip key={t} activo={aTipo.includes(t)} onClick={() => setATipo(a => toggle(a, t))}>{t}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Región</label>
                  <div className="flex gap-2 flex-wrap">{REGIONES.map(r => <Chip key={r} activo={aRegion.includes(r)} onClick={() => setARegion(a => toggle(a, r))}>{r}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Disciplina</label>
                  <div className="flex gap-2 flex-wrap">{DISCIPLINAS.map(d => <Chip key={d} activo={aDisc.includes(d)} onClick={() => setADisc(a => toggle(a, d))}>{d}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Lesión (rehab) · opcional</label>
                  <div className="flex gap-2 flex-wrap">{LESIONES.map(l => <Chip key={l} activo={aLesion.includes(l)} onClick={() => setALesion(a => toggle(a, l))}>{lblLesion(l)}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Momento (movilidad) · opcional</label>
                  <div className="flex gap-2 flex-wrap">{MOMENTOS.map(m => <Chip key={m} activo={aMomento.includes(m)} onClick={() => setAMomento(a => toggle(a, m))}>{lblMomento(m)}</Chip>)}</div>
                </div>
                <input type="url" placeholder="URL de YouTube (opcional)" value={urlVideo} onChange={e => setUrlVideo(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Para qué sirve (opcional) — una línea, se ve en la lista" value={descripcion} onChange={e => setDescripcion(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <textarea placeholder="Cómo se hace (opcional) — un paso por línea" value={ejecucion} onChange={e => setEjecucion(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={5} />
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

      {/* Editar */}
      {ejercicioEditando && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
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
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Tipo</label>
                <div className="flex gap-2 flex-wrap">{TIPOS.map(t => <Chip key={t} activo={eTipo.includes(t)} onClick={() => setETipo(a => toggle(a, t))}>{t}</Chip>)}</div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Región</label>
                <div className="flex gap-2 flex-wrap">{REGIONES.map(r => <Chip key={r} activo={eRegion.includes(r)} onClick={() => setERegion(a => toggle(a, r))}>{r}</Chip>)}</div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Disciplina</label>
                <div className="flex gap-2 flex-wrap">{DISCIPLINAS.map(d => <Chip key={d} activo={eDisc.includes(d)} onClick={() => setEDisc(a => toggle(a, d))}>{d}</Chip>)}</div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Lesión (rehab)</label>
                <div className="flex gap-2 flex-wrap">{LESIONES.map(l => <Chip key={l} activo={eLesion.includes(l)} onClick={() => setELesion(a => toggle(a, l))}>{lblLesion(l)}</Chip>)}</div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Momento (movilidad)</label>
                <div className="flex gap-2 flex-wrap">{MOMENTOS.map(m => <Chip key={m} activo={eMomento.includes(m)} onClick={() => setEMomento(a => toggle(a, m))}>{lblMomento(m)}</Chip>)}</div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">URL video (YouTube)</label>
                <input type="text" value={editVideo} onChange={e => setEditVideo(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="https://youtube.com/..." />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Para qué sirve</label>
                <textarea value={editDescripcion} onChange={e => setEditDescripcion(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Cómo se hace</label>
                <textarea value={editEjecucion} onChange={e => setEditEjecucion(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={6} />
              </div>
              <button type="submit" disabled={guardandoEdit}
                className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Añadir / editar test */}
      {modalTest && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md border border-gray-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{testEditando ? 'Editar test' : 'Añadir test'}</h3>
              <button onClick={() => setModalTest(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            {!claveCorrecta ? (
              <div>
                <p className="text-gray-400 text-sm mb-4">Introduce la clave de administrador para gestionar tests.</p>
                <input type="password" placeholder="Clave de administrador" value={claveIntroducida}
                  onChange={e => setClaveIntroducida(e.target.value)} onKeyDown={e => e.key === 'Enter' && verificarClave()}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full mb-3" />
                {claveError && <p className="text-red-400 text-sm mb-3">Clave incorrecta</p>}
                <button onClick={verificarClave} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition w-full">Verificar</button>
              </div>
            ) : (
              <form onSubmit={guardarTest} className="flex flex-col gap-3">
                <input type="text" placeholder="Nombre del test" value={testForm.nombre} onChange={e => tfSet('nombre', e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Categoría</label>
                  <div className="flex gap-2 flex-wrap">{CATEGORIAS_TEST.map(c => <Chip key={c} activo={testForm.categoria.includes(c)} onClick={() => tfToggle('categoria', c)}>{c.charAt(0).toUpperCase() + c.slice(1)}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Región</label>
                  <div className="flex gap-2 flex-wrap">{REGIONES.map(r => <Chip key={r} activo={testForm.region.includes(r)} onClick={() => tfToggle('region', r)}>{r}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Disciplina</label>
                  <div className="flex gap-2 flex-wrap">{DISCIPLINAS.map(d => <Chip key={d} activo={testForm.disciplina.includes(d)} onClick={() => tfToggle('disciplina', d)}>{d}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Lesión · opcional</label>
                  <div className="flex gap-2 flex-wrap">{LESIONES.map(l => <Chip key={l} activo={testForm.lesion.includes(l)} onClick={() => tfToggle('lesion', l)}>{lblLesion(l)}</Chip>)}</div>
                </div>
                <input type="url" placeholder="URL de YouTube (opcional)" value={testForm.url_video} onChange={e => tfSet('url_video', e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Qué evalúa / cuándo usarlo" value={testForm.descripcion} onChange={e => tfSet('descripcion', e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <textarea placeholder="Protocolo (cómo se ejecuta)" value={testForm.protocolo} onChange={e => tfSet('protocolo', e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={3} />
                <input type="text" placeholder="Valor de referencia (ej: valgo <10° = correcto)" value={testForm.valor_referencia} onChange={e => tfSet('valor_referencia', e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Interpretación (qué significa un fallo y qué hacer)" value={testForm.interpretacion} onChange={e => tfSet('interpretacion', e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={3} />
                <button type="submit" disabled={guardandoTest}
                  className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                  {guardandoTest ? 'Guardando...' : (testEditando ? 'Guardar cambios' : 'Guardar test')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
