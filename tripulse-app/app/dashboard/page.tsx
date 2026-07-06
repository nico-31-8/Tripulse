'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ResumenEntrenador } from '@/components/ResumenSemanal'

export default function Dashboard() {
  const [perfil, setPerfil] = useState<any>(null)
  const [numDeportistas, setNumDeportistas] = useState<number | null>(null)
  const [pasosOmitidos, setPasosOmitidos] = useState<number[]>(() => {
    if (typeof window === 'undefined') return []
    const saved = localStorage.getItem('tripulse_pasos_omitidos')
    return saved ? JSON.parse(saved) : []
  })
  const [avisos, setAvisos] = useState<string[]>([])
  const [anamnesisNuevas, setAnamnesisNuevas] = useState<{nombre: string, id: number}[]>([])

  useEffect(() => {
    const cargarPerfil = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(data)
      const { data: deps, count } = await supabase.from('deportista').select('id, nombre', { count: 'exact' }).eq('id_entrenador', user.id)
      setNumDeportistas(count || 0)
      if (deps?.length) {
        const depIds = deps.map((d: any) => d.id)
        const { data: ans } = await supabase.from('anamnesis').select('id_deportista, estado').in('id_deportista', depIds).eq('estado', 'enviada')
        if (ans?.length) {
          const nuevas = ans.map((a: any) => {
            const dep = deps.find((d: any) => d.id === a.id_deportista)
            return { nombre: dep?.nombre || '', id: a.id_deportista }
          })
          setAnamnesisNuevas(nuevas)
        }
      }
      if (user) await comprobarAvisos(user.id)
    }
    cargarPerfil()
  }, [])

  const comprobarAvisos = async (userId: string) => {
    const mensajes: string[] = []
    const hoy = new Date()
    const hoyStr = hoy.toISOString().split('T')[0]

    // Cargar deportistas del entrenador
    const { data: deps } = await supabase.from('deportista').select('id, nombre, tec_fecha_actualizacion').eq('id_entrenador', userId)
    if (!deps?.length) return

    for (const dep of deps) {
      // Aviso 1: valoración técnica sin rellenar o con más de 4 semanas
      const fechaTec = dep.tec_fecha_actualizacion
      if (!fechaTec) {
        mensajes.push(`${dep.nombre} no tiene valoración técnica registrada — recomendado antes del próximo mesociclo`)
      } else {
        const diasDesde = Math.floor((hoy.getTime() - new Date(fechaTec).getTime()) / (1000 * 60 * 60 * 24))
        if (diasDesde >= 28) {
          mensajes.push(`${dep.nombre} lleva ${Math.floor(diasDesde/7)} semanas sin valoración técnica actualizada`)
        }
      }

      // Aviso 2: mesociclo que empieza hoy o en los próximos 2 días
      const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
      if (!macros?.length) continue
      const { data: mesos } = await supabase.from('mesociclo').select('fecha_inicio, objetivo').in('id_macrociclo', macros.map((m:any) => m.id))
      for (const meso of (mesos || [])) {
        if (!meso.fecha_inicio) continue
        const diasHasta = Math.floor((new Date(meso.fecha_inicio).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
        if (diasHasta >= 0 && diasHasta <= 2) {
          mensajes.push(`${dep.nombre} empieza mesociclo "${meso.objetivo}" en ${diasHasta === 0 ? 'hoy' : diasHasta + ' días'} — revisa la valoración técnica`)
        }
      }
    }
    setAvisos(mensajes)
  }

  const [verInfo, setVerInfo] = useState(false)
  const [verResumenes, setVerResumenes] = useState(false)
  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const ir = (ruta: string) => { window.location.href = ruta }

  const omitirPaso = (num: number) => {
    const nuevos = [...pasosOmitidos, num]
    setPasosOmitidos(nuevos)
    localStorage.setItem('tripulse_pasos_omitidos', JSON.stringify(nuevos))
  }

  const modulos = [
    { icon: '👥', titulo: 'Deportistas', descripcion: 'Añade y gestiona tus atletas. Accede a su perfil, tests y zonas de entrenamiento.', href: '/deportistas' },
    { icon: '📅', titulo: 'Planificación', descripcion: 'Diseña macrociclos, mesociclos, microciclos y sesiones. Planifica tareas por zona y disciplina.', href: '/planificacion-visual' },
    { icon: '💚', titulo: 'Wellness', descripcion: 'Consulta el estado diario de tus atletas. Score, HRV, fatiga, estrés y evolución gráfica.', href: '/wellness-entrenador' },
    { icon: '📈', titulo: 'Carga', descripcion: 'Monitoriza ATL, CTL, TSB, ACWR, monotonía y strain. Control del estrés de entrenamiento.', href: '/carga' },
    { icon: '📊', titulo: 'Volumen', descripcion: 'Visualiza el volumen de entrenamiento por disciplina. Metros, minutos y carga UA por semana.', href: '/volumen' },
    { icon: '🔬', titulo: 'SICAT', descripcion: 'Análisis individualizado del coste energético por disciplina. Factores F1-F4 y corrector HRV.', href: '/eco' },
    { icon: '🎯', titulo: 'Análisis de Índices', descripcion: 'Índice de percepción y planificación por sesión. Semáforo de doble dimensión.', href: '/indices' },
    { icon: '🏋️', titulo: 'Tests', descripcion: 'Registra FTP, CSS, VAM y 1RM. Genera zonas de entrenamiento automáticas.', href: '/tests' },
    { icon: '💪', titulo: 'Biblioteca Fuerza', descripcion: 'Gestiona ejercicios por grupo muscular con video de referencia. Acceso con clave de admin.', href: '/fuerza' },
    { icon: '💬', titulo: 'Comunicacion', descripcion: 'Comentarios post-sesion de tus deportistas. Marca como leido cuando los hayas revisado.', href: '/comunicacion' },
    { icon: '🗑', titulo: 'Papelera', descripcion: 'Sesiones eliminadas. Recupéralas o bórralas definitivamente.', href: '/papelera' },
  ]

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="text-gray-400 hover:text-white text-sm transition">Cerrar sesion</button>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-center gap-4 mb-2">
          <h2 className="text-2xl font-bold">Bienvenido, {perfil?.nombre} 👋</h2>
          <div className="flex gap-2">
            <button onClick={() => setVerResumenes(!verResumenes)}
              className={'px-4 py-2 rounded-lg text-sm font-medium transition border ' +
                (verResumenes ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500')}>
              {verResumenes ? '📋 Ocultar resumenes' : '📋 Resumenes'}
            </button>
            <button onClick={() => setVerInfo(!verInfo)}
              className={'px-4 py-2 rounded-lg text-sm font-medium transition border ' +
                (verInfo ? 'bg-orange-500 border-orange-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500')}>
              {verInfo ? '📖 Ocultar info' : 'ℹ️ Ver info'}
            </button>
          </div>
        </div>
        <p className="text-gray-400 mb-4">Panel del entrenador</p>

        {anamnesisNuevas.length > 0 && (
          <div className="mb-4 bg-blue-950 border border-blue-600 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📋</span>
              <p className="font-bold text-blue-300">Anamnesis completadas</p>
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{anamnesisNuevas.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {anamnesisNuevas.map(a => (
                <div key={a.id} className="flex items-center justify-between bg-blue-900 bg-opacity-30 rounded-lg px-3 py-2">
                  <p className="text-blue-200 text-sm font-medium">{a.nombre}</p>
                  <button onClick={() => window.location.href = `/deportistas/${a.id}?tab=anamnesis`}
                    className="text-blue-400 hover:text-blue-200 text-xs transition">
                    Ver ficha →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {avisos.length > 0 && (
          <div className="mb-6 bg-orange-950 border border-orange-600 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔔</span>
              <p className="font-bold text-orange-400">Recomendaciones técnicas</p>
            </div>
            <div className="flex flex-col gap-2">
              {avisos.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-orange-200">
                  <span className="text-orange-500 mt-0.5">·</span>
                  <p>{a}</p>
                </div>
              ))}
            </div>
            <button onClick={() => window.location.href = '/deportistas'}
              className="mt-3 text-xs text-orange-400 hover:text-orange-300 transition underline">
              Ir a perfiles de deportistas →
            </button>
          </div>
        )}

        {verResumenes && perfil && (
          <div className="mb-8 bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h3 className="font-bold text-white mb-4">Resumen semanal de deportistas</h3>
            <ResumenEntrenador entrenadorId={perfil.id} />
          </div>
        )}
        {/* ONBOARDING — solo si no tiene deportistas */}
        {numDeportistas === 0 && (
          <div className="mb-8 bg-gray-900 rounded-xl border border-orange-500 border-opacity-50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🚀</span>
              <div>
                <p className="font-bold text-lg">Primeros pasos</p>
                <p className="text-gray-400 text-sm">Sigue esta guía para empezar a usar TRIPULSE</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { num: 1, titulo: 'Añade tu primer deportista', desc: 'Crea el perfil de tu atleta con sus datos básicos.', href: '/deportistas', omitible: false },
                { num: 2, titulo: 'Envíale el enlace de invitación', desc: 'Desde la lista de deportistas pulsa 🔗 Invitar y mándale el enlace.', href: '/deportistas', omitible: false },
                { num: 3, titulo: 'Registra sus tests', desc: 'VAM, CSS y FTP para calcular zonas y ritmos automáticamente.', href: '/tests', omitible: true },
                { num: 4, titulo: 'Crea su primer macrociclo', desc: 'La estructura base de toda la planificación de la temporada.', href: '/planificacion-visual', omitible: false },
                { num: 5, titulo: 'Planifica la primera semana', desc: 'Añade sesiones con disciplina, zona y tareas detalladas.', href: '/planificacion-visual', omitible: false },
              ].map(paso => {
                const omitido = pasosOmitidos.includes(paso.num)
                return (
                  <div key={paso.num} className={'flex items-start gap-4 p-4 rounded-xl border transition ' + (omitido ? 'border-gray-800 bg-gray-800 opacity-50' : 'border-gray-800 bg-gray-800 hover:border-orange-500')}>
                    <div className={'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ' + (omitido ? 'bg-gray-600 text-gray-400' : 'bg-orange-500 text-white')}>
                      {omitido ? '⏭' : paso.num}
                    </div>
                    <div className="flex-1">
                      <p className={'font-medium text-sm ' + (omitido ? 'text-gray-500 line-through' : 'text-white')}>{paso.titulo}</p>
                      {!omitido && <p className="text-gray-500 text-xs mt-0.5">{paso.desc}</p>}
                    </div>
                    {!omitido && (
                      <div className="flex gap-2 flex-shrink-0">
                        {paso.omitible && (
                          <button onClick={() => omitirPaso(paso.num)} className="text-xs text-gray-500 hover:text-gray-300 transition px-2 py-1 rounded-lg hover:bg-gray-700">
                            Saltar
                          </button>
                        )}
                        <button onClick={() => ir(paso.href)} className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition font-medium">
                          Ir →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className={'grid gap-4 ' + (verInfo ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3')}>
          {modulos.map(m => (
            <button key={m.titulo} onClick={() => ir(m.href)} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left w-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{m.icon}</span>
                <h3 className={'font-bold ' + (verInfo ? 'text-lg' : 'text-sm')}>{m.titulo}</h3>
              </div>
              {verInfo && <p className="text-gray-400 text-sm mt-2">{m.descripcion}</p>}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

