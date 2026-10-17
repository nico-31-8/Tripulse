'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularEdad, fechaLarga } from '@/lib/fechas'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'
import { entrenadorEfectivo, getEspacio } from '@/lib/espacio'
import { DE_VISTA } from '@/lib/baterias-movimiento'
import { cargarSueltos, type Suelto } from '@/lib/analisis-libre'
import NuevoAnalisisLibre from '@/components/movimiento/NuevoAnalisisLibre'

/** Al análisis libre de un evaluado: se entra de nuevo, y la página de sus tests lo abre. */
const irAlSuelto = (idDeportista: number, idAnalisis: number, nuevo = false) =>
  window.location.assign(`/tests/${idDeportista}?pestana=movimiento&libre=${idAnalisis}${nuevo ? '&nuevo=1' : ''}`)

export default function TestsPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  /* Los análisis sueltos (de gente que no es de su equipo: sus evaluados). Dentro
     del espacio de otro entrenador no se enseñan: son de quien ha entrado. */
  const [sueltos, setSueltos] = useState<Suelto[]>([])
  const [conSueltos, setConSueltos] = useState(false)
  const [nuevoSuelto, setNuevoSuelto] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('deportista').select('*').eq('id_entrenador', entrenadorEfectivo(user.id)).eq('solo_test', false)
      setDeportistas(data || [])
      // Si hay un deportista activo, entramos directo a sus tests (sin volver a elegir).
      // Salvo si se viene a por los análisis sueltos.
      const aSueltos = new URLSearchParams(window.location.search).get('sueltos') === '1'
      const act = getAtletaActivo()
      if (!aSueltos && act && (data || []).some(d => d.id === act)) { router.replace('/tests/' + act); return }
      if (getEspacio()) return
      setConSueltos(true)
      const s = await cargarSueltos(supabase, user.id)
      setSueltos(s.sueltos)
    }
    cargar()
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Tests</h2>
        <p className="text-gray-400 mb-6">Elige un deportista para ver o añadir sus tests</p>

        {/* La entrada a la batería de campo. Va aquí arriba y no escondida en la
            ficha de un atleta porque el entrenador que va a testar todavía no ha
            elegido a quién: muchas veces son varios a la vez. */}
        <button onClick={() => router.push('/tests/dirigir')}
          className="w-full mb-3 bg-gray-900 hover:border-orange-500 border border-gray-800 rounded-xl p-5 flex items-center justify-between gap-4 text-left transition">
          <div>
            <h3 className="font-bold">Dirigir tests</h3>
            <p className="text-gray-500 text-sm mt-0.5">
              Los 17 tests de la batería a pie de pista: metes lo que mides y el resultado sale solo. A uno o a varios.
            </p>
          </div>
          <span className="text-orange-400 text-xl shrink-0">→</span>
        </button>

        {/* El análisis en vídeo de alguien de fuera (v3 del analizador): se crea como
            evaluado, que no gasta cupo ni sale en el panel. */}
        {conSueltos && (
          <button onClick={() => setNuevoSuelto(true)}
            className="w-full mb-8 bg-gray-900 hover:border-sky-300/70 border border-dashed border-sky-300/35 rounded-xl p-5 flex items-center justify-between gap-4 text-left transition">
            <div>
              <h3 className="font-bold">🎥 Análisis suelto</h3>
              <p className="text-gray-500 text-sm mt-0.5">
                Analizar en vídeo a alguien que no es de tu equipo: el visor sin criterios ni nota y su informe para mandárselo. No gasta cupo.
              </p>
            </div>
            <span className="text-sky-300 text-xl shrink-0">→</span>
          </button>
        )}
        {!conSueltos && <div className="mb-5" />}

        {sueltos.length > 0 && (
          <section id="sueltos" className="mb-8">
            <p className="text-[13.5px] font-semibold mb-2">Tus análisis sueltos <span className="text-orange-400">{sueltos.length}</span></p>
            <div className="grid gap-2">
              {sueltos.map(s => (
                <button key={s.analisis.id} onClick={() => irAlSuelto(s.analisis.id_deportista, s.analisis.id)}
                  className="bg-gray-900 rounded-xl px-5 py-3.5 border border-gray-800 hover:border-sky-300/60 transition text-left w-full flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14px] truncate">{s.analisis.titulo}</span>
                    <span className="block text-gray-500 text-[12px]">
                      {s.nombre} · {fechaLarga(s.analisis.fecha)} · {DE_VISTA[s.analisis.vista]} · {s.fotogramas === 1 ? '1 fotograma' : s.fotogramas + ' fotogramas'}
                    </span>
                  </span>
                  <span className="text-sky-300 text-sm shrink-0">Abrir →</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {deportistas.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">🏋️</div>
            <p>Todavía no tienes deportistas.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => { setAtletaActivo(d.id); router.push(`/tests/${d.id}`) }} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left w-full">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{d.nombre}</h3>
                    <p className="text-gray-400 text-sm">
                      {d.sexo || 'Sin especificar'} ·
                      {d.fecha_nacimiento ? ` ${calcularEdad(d.fecha_nacimiento)} años · ` : ' '}
                      FC máx: {d.fc_maxima || '—'} ppm
                    </p>
                  </div>
                  <span className="text-orange-500 text-sm">Ver tests →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {nuevoSuelto && (
        <NuevoAnalisisLibre deportista={null} externaPosible
          onCreado={({ analisis, idDeportista }) => irAlSuelto(idDeportista, analisis.id, true)}
          onCerrar={() => setNuevoSuelto(false)} />
      )}
    </main>
  )
}
