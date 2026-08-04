'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const HORAS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)

export default function DisponibilidadPage() {
  const router = useRouter()
  const [deportistaId, setDeportistaId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [draft, setDraft] = useState<Record<string, { inicio: string, fin: string }[]>>({})
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    const { data: dep } = await supabase.from('deportista').select('id').eq('id_usuario', user.id).maybeSingle()
    if (!dep) { setLoading(false); return }
    setDeportistaId(dep.id)
    const { data: disp } = await supabase.from('disponibilidad').select('*').eq('id_deportista', dep.id).order('hora_inicio')
    const d = disp || []
    const initDraft: Record<string, { inicio: string, fin: string }[]> = {}
    DIAS.forEach(dia => {
      initDraft[dia] = d.filter((x: any) => x.dia_semana === dia).map((x: any) => ({
        inicio: x.hora_inicio?.slice(0, 5) || '07:00',
        fin: x.hora_fin?.slice(0, 5) || '08:00',
      }))
    })
    setDraft(initDraft)
    setLoading(false)
  }

  const addFranja = (dia: string) => {
    setDraft(prev => ({ ...prev, [dia]: [...(prev[dia] || []), { inicio: '07:00', fin: '08:00' }] }))
  }

  const removeFranja = (dia: string, idx: number) => {
    setDraft(prev => ({ ...prev, [dia]: prev[dia].filter((_, i) => i !== idx) }))
  }

  const updateFranja = (dia: string, idx: number, campo: 'inicio' | 'fin', valor: string) => {
    setDraft(prev => ({ ...prev, [dia]: prev[dia].map((f, i) => {
      if (i !== idx) return f
      const nueva = { ...f, [campo]: valor }
      // Si el inicio se mueve por detrás del fin, el fin le sigue. Sin esto el
      // <select> del fin se quedaba con un valor que ya no estaba entre sus
      // opciones (se veía vacío) y al guardar la franja se descartaba EN SILENCIO.
      if (campo === 'inicio' && nueva.fin <= nueva.inicio) {
        nueva.fin = HORAS.find(h => h > nueva.inicio) || nueva.inicio
      }
      return nueva
    }) }))
  }

  const guardar = async () => {
    if (!deportistaId) return
    setGuardando(true)
    setError('')

    const filas: any[] = []
    DIAS.forEach(dia => {
      (draft[dia] || []).forEach(f => {
        if (f.inicio && f.fin && f.inicio < f.fin) {
          filas.push({ id_deportista: deportistaId, dia_semana: dia, hora_inicio: f.inicio, hora_fin: f.fin })
        }
      })
    })

    // Se inserta ANTES de borrar, y se borra por id. Antes era al revés: si el
    // insert fallaba después del delete, el atleta se quedaba sin ninguna franja
    // y la pantalla le decía "✓ Guardado". Así el peor caso es que queden franjas
    // repetidas —visible y arreglable— en vez de perderlas todas en silencio.
    const { data: viejas, error: errLeer } = await supabase
      .from('disponibilidad').select('id').eq('id_deportista', deportistaId)
    if (errLeer) { setError('No se ha podido guardar. Inténtalo otra vez.'); setGuardando(false); return }

    if (filas.length) {
      const { error: errInsert } = await supabase.from('disponibilidad').insert(filas)
      if (errInsert) { setError('No se ha podido guardar. Tu disponibilidad anterior sigue intacta.'); setGuardando(false); return }
    }

    const idsViejos = (viejas || []).map((v: any) => v.id)
    if (idsViejos.length) {
      const { error: errBorrar } = await supabase.from('disponibilidad').delete().in('id', idsViejos)
      if (errBorrar) {
        setError('Guardado, pero pueden haber quedado franjas repetidas. Recarga la página y revísalo.')
        setGuardando(false)
        return
      }
    }

    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    setGuardando(false)
  }

  const totalFranjas = Object.values(draft).reduce((acc, franjas) => acc + franjas.length, 0)

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard-deportista')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-1">Mi disponibilidad</h2>
          <p className="text-gray-400 text-sm">Marca los momentos de la semana en los que puedes entrenar. Tu entrenador lo verá al planificar.</p>
        </div>

        {/* La barra de guardar sale SIEMPRE, también con cero franjas. Antes solo
            aparecía con totalFranjas > 0, así que el atleta que borraba todas para
            decir "esta semana no puedo" se quedaba sin botón: se iba creyendo que
            lo había cambiado y el entrenador seguía viendo la disponibilidad vieja. */}
        <div className={'rounded-xl px-5 py-3 mb-6 flex justify-between items-center gap-4 border ' +
          (totalFranjas > 0 ? 'bg-orange-900/20 border-orange-700/50' : 'bg-gray-900 border-gray-800')}>
          <p className={'text-sm ' + (totalFranjas > 0 ? 'text-orange-300' : 'text-gray-400')}>
            {totalFranjas > 0
              ? `${totalFranjas} franja${totalFranjas > 1 ? 's' : ''} marcada${totalFranjas > 1 ? 's' : ''}`
              : 'Sin franjas — guarda para dejar la semana vacía'}
          </p>
          <button onClick={guardar} disabled={guardando}
            className="bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50 flex-shrink-0">
            {guardado ? '✓ Guardado' : guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/25 border border-red-700/50 rounded-xl px-5 py-3 mb-6">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {DIAS.map(dia => {
            const franjas = draft[dia] || []
            return (
              <div key={dia} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="flex justify-between items-center px-5 py-3 border-b border-gray-800">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-white">{dia}</p>
                    {franjas.length > 0 && (
                      <span className="text-xs bg-orange-900/50 text-orange-300 px-2 py-0.5 rounded-full">
                        {franjas.reduce((acc, f) => acc + (parseInt(f.fin) - parseInt(f.inicio)), 0)}h disponible
                      </span>
                    )}
                  </div>
                  <button onClick={() => addFranja(dia)}
                    className="text-orange-400 hover:text-orange-300 text-sm transition flex items-center gap-1">
                    <span className="text-lg leading-none">+</span>
                    <span>Añadir franja</span>
                  </button>
                </div>

                {franjas.length === 0 ? (
                  <div className="px-5 py-4 text-gray-600 text-sm">Sin disponibilidad marcada</div>
                ) : (
                  <div className="px-5 py-3 flex flex-col gap-3">
                    {franjas.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        {/* La última hora no puede ser inicio: no le quedaría ningún
                            fin posible detrás y la franja sería inválida. */}
                        <select value={f.inicio} onChange={e => updateFranja(dia, idx, 'inicio', e.target.value)}
                          className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 flex-1">
                          {HORAS.slice(0, -1).map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <span className="text-gray-500 text-sm flex-shrink-0">→</span>
                        <select value={f.fin} onChange={e => updateFranja(dia, idx, 'fin', e.target.value)}
                          className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 flex-1">
                          {HORAS.filter(h => h > f.inicio).map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <span className="text-gray-500 text-xs bg-gray-800 rounded-lg px-2 py-1 flex-shrink-0">
                          {parseInt(f.fin) - parseInt(f.inicio)}h
                        </span>
                        <button onClick={() => removeFranja(dia, idx)}
                          className="text-gray-600 hover:text-red-400 transition text-xl leading-none flex-shrink-0">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button onClick={guardar} disabled={guardando}
          className="mt-6 w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
          {guardado ? '✓ Guardado' : guardando ? 'Guardando...' : 'Guardar disponibilidad'}
        </button>

        {totalFranjas === 0 && (
          <div className="mt-4 text-center text-gray-600 text-sm">
            <p>Pulsa "Añadir franja" en cualquier día para empezar</p>
          </div>
        )}
      </div>
    </main>
  )
}

