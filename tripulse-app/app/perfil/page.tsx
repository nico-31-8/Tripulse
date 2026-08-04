'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Cargando from '@/components/Cargando'
import { usuarioActual } from '@/lib/sesion'

function DeportistasVinculados({ entrenadorId }: { entrenadorId: string }) {
  const router = useRouter()
  const [deportistas, setDeportistas] = useState<any[]>([])
  useEffect(() => {
    supabase.from('deportista').select('*').eq('id_entrenador', entrenadorId).then(({ data }) => setDeportistas(data || []))
  }, [entrenadorId])
  if (deportistas.length === 0) return <p className="text-gray-400 text-sm">No tienes deportistas vinculados todavia.</p>
  return (
    <div className="grid gap-3">
      {deportistas.map(d => (
        <div key={d.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3">
          <p className="font-medium">{d.nombre}</p>
          <button onClick={() => router.push('/deportistas/' + d.id)} className="text-orange-500 text-sm hover:underline">Ver perfil →</button>
        </div>
      ))}
    </div>
  )
}

function SeccionEntrenador({ perfil, entrenador, onDesvincularse }: { perfil: any, entrenador: any, onDesvincularse: () => void }) {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const vincularseEntrenador = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMensaje('')
    const codigoLimpio = codigo.toUpperCase().trim()
    const { data: entrenadorEncontrado } = await supabase.rpc('buscar_entrenador', { p_codigo: codigoLimpio }).maybeSingle() as { data: { id: string; nombre: string } | null }
    if (!entrenadorEncontrado) { setMensaje('Codigo no encontrado, revisa que este bien escrito'); setLoading(false); return }
    let { data: dep } = await supabase.from('deportista').select('id').eq('id_usuario', perfil.id).single()
    if (!dep) {
      const { data: nuevo, error: errInsert } = await supabase.from('deportista').insert({ id_usuario: perfil.id, nombre: perfil.nombre, id_entrenador: entrenadorEncontrado.id }).select('id').single()
      if (!nuevo) { setMensaje('Error: ' + (errInsert?.message || 'desconocido')); setLoading(false); return }
      dep = nuevo
    }
    const { error } = await supabase.from('deportista').update({ id_entrenador: entrenadorEncontrado.id }).eq('id', dep!.id)
    if (error) { setMensaje('Error al vincularse: ' + error.message); setLoading(false); return }
    setMensaje('Vinculado correctamente con ' + entrenadorEncontrado.nombre + '. Te llevamos a tu anamnesis...')
    setLoading(false)
    // Al vincularse, el entrenador necesita la anamnesis → la mostramos
    setTimeout(() => router.push('/anamnesis'), 1200)
  }

  const desvincularse = async () => {
    if (!confirm('¿Seguro que quieres desvincularte de tu entrenador?')) return
    const { data: dep } = await supabase.from('deportista').select('id').eq('id_usuario', perfil.id).single()
    if (!dep) return
    await supabase.from('deportista').update({ id_entrenador: null }).eq('id', dep.id)
    onDesvincularse()
  }

  if (entrenador) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
        <h3 className="text-xl font-bold mb-4">Mi entrenador</h3>
        <div className="flex items-center justify-between bg-gray-800 rounded-xl p-4">
          <div>
            <p className="font-bold text-white">{entrenador.nombre}</p>
            <p className="text-gray-400 text-sm">{entrenador.email}</p>
          </div>
          <span className="text-xs bg-green-900 text-green-300 px-3 py-1 rounded-full font-medium">Vinculado</span>
        </div>
        <button onClick={desvincularse} className="mt-4 w-full bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 py-2 rounded-lg text-sm transition border border-gray-700 hover:border-red-700">
          Desvincularse del entrenador
        </button>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
      <h3 className="text-xl font-bold mb-2">Unirse a un entrenador</h3>
      <p className="text-gray-400 text-sm mb-4">Introduce el codigo de tu entrenador para vincularte y que pueda ver y planificar tus sesiones.</p>
      <form onSubmit={vincularseEntrenador} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Codigo del entrenador (ej: NICO27)"
          value={codigo}
          onChange={e => setCodigo(e.target.value.toUpperCase())}
          className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-mono tracking-wider"
          maxLength={12}
          required
        />
        {mensaje && <p className={mensaje.includes('correctamente') ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>{mensaje}</p>}
        <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
          {loading ? 'Buscando...' : 'Vincularme'}
        </button>
      </form>
    </div>
  )
}

export default function PerfilPage() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<any>(null)
  const [entrenador, setEntrenador] = useState<any>(null)
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)
    setCodigo(p?.codigo_entrenador || '')

    if (p?.rol === 'deportista') {
      const { data: dep } = await supabase.from('deportista').select('id_entrenador').eq('id_usuario', user.id).maybeSingle()
      if (dep?.id_entrenador) {
        const { data: ent } = await supabase.from('perfiles').select('nombre, email').eq('id', dep.id_entrenador).single()
        setEntrenador(ent)
      }
    }
  }

  const guardarCodigo = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMensaje('')
    const codigoLimpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (codigoLimpio.length < 4) { setMensaje('El codigo debe tener al menos 4 caracteres'); setLoading(false); return }
    const { error } = await supabase.from('perfiles').update({ codigo_entrenador: codigoLimpio }).eq('id', perfil.id)
    if (error) {
      if (error.message.includes('unique')) setMensaje('Este codigo ya esta en uso, elige otro')
      else setMensaje('Error: ' + error.message)
    } else {
      setPerfil({ ...perfil, codigo_entrenador: codigoLimpio })
      setCodigo(codigoLimpio)
      setMensaje('Codigo guardado correctamente')
    }
    setLoading(false)
  }

  const copiar = () => {
    navigator.clipboard.writeText(perfil?.codigo_entrenador || '')
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const [exportando, setExportando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  // RGPD — Portabilidad: descarga los datos del usuario (RLS los limita a lo suyo).
  // El deportista exporta TODO lo suyo (incluida salud). El entrenador exporta su
  // perfil y su estructura de trabajo, NO los datos de salud de sus atletas (que
  // son datos personales de ellos y los exporta cada uno).
  const exportarDatos = async () => {
    setExportando(true)
    const tablas = perfil.rol === 'deportista'
      ? ['perfiles','deportista','wellness','test1_carrera','test2_natacion','test3_ciclismo',
         'test_fuerza','tests_libres','anamnesis','disponibilidad','competicion','registro_peso',
         'macrociclo','mesociclo','microciclo','sesion','tarea','mensajes']
      : ['perfiles','deportista','macrociclo','mesociclo','microciclo','sesion','tarea','mensajes']
    const out: any = { _exportado: new Date().toISOString(), _usuario: perfil.email, _rol: perfil.rol }
    for (const t of tablas) {
      const { data } = await supabase.from(t).select('*')
      if (data && data.length) out[t] = data
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'mis-datos-tripulse.json'
    document.body.appendChild(a); a.click(); a.remove()
    setExportando(false)
  }

  // RGPD — Derecho al olvido: elimina cuenta y todos los datos
  const eliminarCuenta = async () => {
    const confirmacion = prompt('Esta acción borra tu cuenta y TODOS tus datos de forma permanente e irreversible.\n\nEscribe ELIMINAR para confirmar:')
    if (confirmacion !== 'ELIMINAR') return
    setEliminando(true)
    const { error } = await supabase.rpc('eliminar_mi_cuenta')
    if (error) { alert('Error al eliminar la cuenta: ' + error.message); setEliminando(false); return }
    await supabase.auth.signOut()
    alert('Tu cuenta y tus datos han sido eliminados.')
    router.push('/')
  }

  if (!perfil) return <Cargando />

  const esDeportista = perfil.rol === 'deportista'

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push(esDeportista ? '/dashboard-deportista' : '/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8">

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <h2 className="text-2xl font-bold mb-1">Mi perfil</h2>
          <p className="text-gray-400 text-sm">{perfil.nombre} · {perfil.email}</p>
          <span className={'mt-2 inline-block text-xs px-3 py-1 rounded-full font-medium ' + (esDeportista ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300')}>
            {esDeportista ? 'Deportista' : 'Entrenador'}
          </span>
        </div>

        {esDeportista ? (
          <SeccionEntrenador perfil={perfil} entrenador={entrenador} onDesvincularse={() => { setEntrenador(null) }} />
        ) : (
          <>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
              <h3 className="text-xl font-bold mb-2">Codigo de entrenador</h3>
              <p className="text-gray-400 text-sm mb-4">Comparte este codigo con tus deportistas para que puedan vincularse contigo.</p>
              {perfil.codigo_entrenador && (
                <div className="flex items-center gap-3 bg-gray-800 rounded-xl p-4 mb-4">
                  <span className="text-3xl font-bold text-orange-400 tracking-widest flex-1">{perfil.codigo_entrenador}</span>
                  <button onClick={copiar} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition">{copiado ? 'Copiado!' : 'Copiar'}</button>
                </div>
              )}
              <form onSubmit={guardarCodigo} className="flex flex-col gap-3">
                <input type="text" placeholder="Ej: NICO2026, TRICLUB" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-mono tracking-wider" maxLength={12} required />
                <p className="text-gray-500 text-xs">Solo letras y numeros, entre 4 y 12 caracteres</p>
                {mensaje && <p className={mensaje.includes('correctamente') ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>{mensaje}</p>}
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : perfil.codigo_entrenador ? 'Actualizar codigo' : 'Crear codigo'}</button>
              </form>
            </div>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="text-xl font-bold mb-4">Deportistas vinculados</h3>
              <DeportistasVinculados entrenadorId={perfil.id} />
            </div>
          </>
        )}

        {/* RGPD — Privacidad y datos */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mt-6">
          <h3 className="text-xl font-bold mb-2">Privacidad y datos</h3>
          <p className="text-gray-400 text-sm mb-4">Gestiona tus datos personales según tus derechos (RGPD).</p>

          <button onClick={exportarDatos} disabled={exportando}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-lg text-sm transition border border-gray-700 mb-3 disabled:opacity-50">
            {exportando ? 'Preparando...' : '⬇ Descargar todos mis datos (JSON)'}
          </button>

          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
            <Link href="/privacidad" className="hover:text-orange-400 transition underline">Política de privacidad</Link>
            <Link href="/terminos" className="hover:text-orange-400 transition underline">Términos de uso</Link>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <p className="text-red-400 text-sm font-medium mb-1">Zona peligrosa</p>
            <p className="text-gray-500 text-xs mb-3">
              {esDeportista
                ? 'Al eliminar tu cuenta se borran permanentemente todos tus datos de entrenamiento, salud y wellness.'
                : 'Al eliminar tu cuenta tus deportistas quedarán desvinculados (sus datos se conservan). Se borra tu perfil y tu código.'}
            </p>
            <button onClick={eliminarCuenta} disabled={eliminando}
              className="w-full bg-red-950 hover:bg-red-900 text-red-300 py-3 rounded-lg text-sm transition border border-red-900 disabled:opacity-50">
              {eliminando ? 'Eliminando...' : '🗑 Eliminar mi cuenta y mis datos'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

