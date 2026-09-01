'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias, fechaLarga } from '@/lib/fechas'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { vivas } from '@/lib/papelera'
import Cargando from '@/components/Cargando'
import { miembrosDe, type MiembroGrupo } from '@/lib/grupos'
import { cargarReferenciasDeVarios } from '@/lib/referencia-zona'
import { hojaDelDia, hechasDe, detalleDeTarea, type BloqueDia } from '@/lib/grupos-dia'
import { vistaDeTarea } from '@/lib/tarea-vista'

/* La hoja del día: qué toca hoy y, al lado de cada nombre, SUS números.
   Hasta ahora eso eran diez fichas abiertas una a una.

   El entrenamiento se enseña UNA vez —es la misma prescripción repartida— y
   debajo va la tabla de quién lo hace y con qué ritmos. Ver lib/grupos-dia. */

export default function HojaDelDia({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  useRequireEntrenador()
  const { id } = use(params)

  const [grupo, setGrupo] = useState<{ id: string; nombre: string } | null>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [miembros, setMiembros] = useState<MiembroGrupo[]>([])
  const [fecha, setFecha] = useState(hoyISO())
  const [bloques, setBloques] = useState<BloqueDia[] | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => { cargarGrupo() }, [id])
  useEffect(() => { if (miembros.length) cargarDia() }, [fecha, miembros])

  const cargarGrupo = async () => {
    const { data: g } = await supabase.from('grupo_entreno').select('id, nombre').eq('id', id).maybeSingle()
    if (!g) { setNoExiste(true); return }
    setGrupo(g)
    setMiembros(await miembrosDe(supabase, id))
  }

  const cargarDia = async () => {
    setCargando(true)
    const ids = miembros.map(m => m.id_deportista)

    /* Las sesiones del día de TODOS, y las referencias de TODOS, en paralelo.
       Las referencias van por el cargador en lote: una por persona serían
       cuarenta viajes con diez atletas. */
    const [sesQ, refs] = await Promise.all([
      vivas(supabase.from('sesion')
        .select('id, id_deportista, id_emision, disciplina, estado, fecha_sesion')
        .in('id_deportista', ids).eq('fecha_sesion', fecha)),
      cargarReferenciasDeVarios(supabase, ids),
    ])

    const sesiones = sesQ.data || []
    // Las tareas de todas las sesiones del día, de una vez.
    const sesIds = sesiones.map((s: any) => s.id)
    const { data: tareas } = sesIds.length
      ? await supabase.from('tarea')
        .select('id, id_sesion, orden, zona_entrenamiento, disciplina, series, descanso_segundos, tecnica_id')
        .in('id_sesion', sesIds).order('orden')
      : { data: [] as any[] }

    const porSesion = new Map<number, any[]>()
    for (const t of tareas || []) {
      const l = porSesion.get(t.id_sesion)
      if (l) l.push(t); else porSesion.set(t.id_sesion, [t])
    }

    setBloques(hojaDelDia(
      sesiones.map((s: any) => ({ ...s, tareas: porSesion.get(s.id) || [] })),
      miembros.map(m => ({ id_deportista: m.id_deportista, nombre: m.nombre })),
      refs,
    ))
    setCargando(false)
  }

  if (noExiste) return <Cargando volverA="/deportistas" noExiste />
  if (!grupo) return <Cargando volverA="/deportistas" />

  const esHoy = fecha === hoyISO()

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center gap-4 border-b border-gray-800">
        {/* La puerta al reloj común. Solo con alguien a quien cronometrar:
            dirigir un día sin sesiones no es dirigir nada. */}
        {(bloques?.length || 0) > 0 && (
          <button onClick={() => router.push('/grupo/' + id + '/dirigir')}
            title="Cronometrar al grupo a pie de pista"
            className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-orange-500/45 bg-orange-500/12 text-orange-300 hover:bg-orange-500/20 transition">
            ⏱ Dirigir
          </button>
        )}
        <button onClick={() => router.push('/grupo/' + id)} className="text-gray-400 hover:text-white text-sm transition">← {grupo.nombre}</button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">Hoja del día</h2>
            <p className="text-gray-500 text-sm mt-1">
              {fechaLarga(fecha)}{esHoy && <span className="text-orange-400"> · hoy</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setFecha(sumarDias(fecha, -1))}
              className="bg-gray-800 hover:bg-gray-700 w-9 h-9 rounded-lg transition" aria-label="Día anterior">‹</button>
            {!esHoy && (
              <button onClick={() => setFecha(hoyISO())}
                className="bg-gray-800 hover:bg-gray-700 px-3 h-9 rounded-lg text-sm transition">Hoy</button>
            )}
            <button onClick={() => setFecha(sumarDias(fecha, 1))}
              className="bg-gray-800 hover:bg-gray-700 w-9 h-9 rounded-lg transition" aria-label="Día siguiente">›</button>
          </div>
        </div>

        {cargando && <p className="text-gray-500 text-sm">Cargando…</p>}

        {!cargando && bloques?.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-400">Nadie tiene nada este día.</p>
            <p className="text-gray-600 text-sm mt-1">Manda un entrenamiento al grupo o vuelca su plan desde su página.</p>
          </div>
        )}

        {!cargando && bloques?.map(b => {
          const { hechas, total } = hechasDe(b)
          return (
            <section key={b.clave} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{b.disciplina || 'Sesión'}</span>
                  {b.esDelGrupo
                    ? <span className="text-[10px] font-bold uppercase tracking-wider text-orange-300 bg-orange-500/15 px-2 py-0.5 rounded">Del grupo</span>
                    : <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-800 px-2 py-0.5 rounded">Suya</span>}
                  {b.zonas.map(z => (
                    <span key={z} className="text-[11px] bg-black/30 text-gray-300 px-2 py-0.5 rounded-full">{z}</span>
                  ))}
                </div>
                <span className="text-gray-500 text-xs tabular-nums">{hechas}/{total} hecha{total === 1 ? '' : 's'}</span>
              </div>

              {/* El entrenamiento, UNA vez: es la misma prescripción para todos.
                  Lo que cambia de uno a otro son los números de abajo. */}
              {b.tareas.length > 0 && (
                <div className="px-5 py-3 bg-black/20 flex flex-col gap-1 border-b border-gray-800">
                  {b.tareas.map((t: any, i: number) => {
                    const v = vistaDeTarea(t, {}, 0)
                    return (
                      <div key={t.id ?? i} className="flex items-baseline gap-2 text-sm">
                        <span className="text-gray-600 text-xs w-4 tabular-nums">{i + 1}</span>
                        <span className="text-gray-300">{v.titulo}</span>
                        <span className="text-gray-600 text-xs">{detalleDeTarea(v.campos)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="divide-y divide-gray-800/70">
                {b.quien.map(q => (
                  <div key={q.id_deportista} className="px-5 py-3 flex items-center gap-3 flex-wrap hover:bg-gray-800/30 transition">
                    <button onClick={() => router.push('/sesion/' + q.idSesion)}
                      className="w-full sm:w-36 text-left font-medium hover:text-orange-400 transition sm:truncate">
                      {q.nombre}
                    </button>
                    <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1">
                      {q.porZona.map(z => (
                        <span key={z.zona} className="text-sm">
                          <span className="text-gray-600 text-[11px] mr-1">{z.zona}</span>
                          <span className={q.sinTest ? 'text-gray-500' : 'text-orange-400 font-medium tabular-nums'}>
                            {z.ritmo || z.rpe || '—'}
                          </span>
                        </span>
                      ))}
                      {q.porZona.length === 0 && <span className="text-gray-600 text-sm">Sin bloques prescritos</span>}
                    </div>
                    {q.sinTest && (
                      <span className="text-[11px] text-amber-500/80" title="Sin el test que toca no hay con qué calcular su ritmo">
                        sin test
                      </span>
                    )}
                    {q.estado === 'Realizada' && <span className="text-green-500 text-xs">✓</span>}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
