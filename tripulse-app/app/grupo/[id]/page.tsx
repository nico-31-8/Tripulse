'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import Cargando from '@/components/Cargando'
import {
  miembrosDe, meterEnGrupo, sacarDelGrupo, testsQueFaltan,
  type MiembroGrupo,
} from '@/lib/grupos'

export default function PaginaGrupo({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  useRequireEntrenador()
  const { id } = use(params)
  const [grupo, setGrupo] = useState<any>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [miembros, setMiembros] = useState<MiembroGrupo[]>([])
  // Tests del atleta, por id. Sin ellos la zona sale sin ritmo ni vatios.
  const [tests, setTests] = useState<Record<string, any>>({})
  const [fuera, setFuera] = useState<any[]>([])
  const [anadiendo, setAnadiendo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [id])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }

    const { data: g } = await supabase.from('grupo_entreno')
      .select('id, nombre, descripcion').eq('id', id).maybeSingle()
    if (!g) { setNoExiste(true); return }
    setGrupo(g)

    const ms = await miembrosDe(supabase, id)
    setMiembros(ms)

    // Los deportistas del entrenador que NO están en el grupo, para poder añadirlos.
    const { data: todos } = await supabase.from('deportista')
      .select('id, nombre').eq('id_entrenador', user.id)
    const dentro = new Set(ms.map(m => String(m.id_deportista)))
    setFuera((todos || []).filter((d: any) => !dentro.has(String(d.id))))

    if (ms.length) {
      const ids = ms.map(m => m.id_deportista)
      // Se queda con el más reciente de cada uno: las listas vienen por fecha
      // descendente, así que el primero que aparece es el bueno.
      const ultimo = (filas: any[] | null, campo: string) => {
        const por: Record<string, number> = {}
        for (const f of filas || []) {
          const k = String(f.id_deportista)
          if (!(k in por) && f[campo]) por[k] = Number(f[campo])
        }
        return por
      }
      const [c, n, b] = await Promise.all([
        supabase.from('test1_carrera').select('id_deportista, vam').in('id_deportista', ids).order('fecha', { ascending: false }),
        supabase.from('test2_natacion').select('id_deportista, css').in('id_deportista', ids).order('fecha', { ascending: false }),
        supabase.from('test3_ciclismo').select('id_deportista, ftp').in('id_deportista', ids).order('fecha', { ascending: false }),
      ])
      const vam = ultimo(c.data, 'vam'), css = ultimo(n.data, 'css'), ftp = ultimo(b.data, 'ftp')
      const mapa: Record<string, any> = {}
      for (const m of ms) {
        const k = String(m.id_deportista)
        mapa[k] = { vam: vam[k], css: css[k], ftp: ftp[k] }
      }
      setTests(mapa)
    } else setTests({})
  }

  const anadir = async (idDep: number) => {
    setOcupado(true); setError('')
    const e = await meterEnGrupo(supabase, id, [idDep])
    if (e) setError(e)
    await cargar()
    setOcupado(false)
  }

  const sacar = async (m: MiembroGrupo) => {
    if (!confirm('¿Sacar a ' + m.nombre + ' del grupo?\n\nLos entrenamientos que ya tiene en su calendario se quedan: son suyos. Solo dejará de recibir los nuevos.')) return
    setOcupado(true); setError('')
    const e = await sacarDelGrupo(supabase, id, m.id_deportista)
    if (e) setError(e)
    await cargar()
    setOcupado(false)
  }

  if (noExiste) return <Cargando volverA="/deportistas" noExiste />
  if (!grupo) return <Cargando volverA="/deportistas" />

  const sinTests = miembros.filter(m => testsQueFaltan(tests[String(m.id_deportista)]).length === 3)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/deportistas')} className="text-gray-400 hover:text-white text-sm transition">← Deportistas</button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold">{grupo.nombre}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {miembros.length} deportista{miembros.length === 1 ? '' : 's'} · entrenan lo mismo, cada uno a su intensidad
          </p>
        </div>

        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}

        {/* Aquí es donde importa de verdad: la zona es la misma para todos, pero sin
            tests esa persona no ve ritmo ni vatios, solo el porcentaje teórico. En un
            grupo pasa casi seguro, y hoy no hay ninguna pantalla que lo diga. */}
        {sinTests.length > 0 && (
          <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl px-4 py-3">
            <p className="text-amber-300 text-sm font-medium">
              {sinTests.length === 1
                ? sinTests[0].nombre + ' no tiene ningún test'
                : sinTests.length + ' del grupo no tienen ningún test'}
            </p>
            <p className="text-amber-200/70 text-xs mt-1">
              Recibirán el entrenamiento igual, pero verán la zona sin ritmo ni vatios: sin VAM, FTP o CSS no hay
              con qué calcularlos.
            </p>
          </div>
        )}

        <section>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Quién entrena aquí</h3>
            {fuera.length > 0 && (
              <button onClick={() => setAnadiendo(!anadiendo)}
                className="text-gray-400 hover:text-orange-400 text-xs underline transition">
                {anadiendo ? 'Cerrar' : '+ Añadir alguien'}
              </button>
            )}
          </div>

          {anadiendo && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-3 flex flex-col gap-1.5">
              {fuera.map(d => (
                <button key={d.id} onClick={() => anadir(d.id)} disabled={ocupado}
                  className="text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition text-sm disabled:opacity-40">
                  {d.nombre}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-2">
            {miembros.map(m => {
              const faltan = testsQueFaltan(tests[String(m.id_deportista)])
              return (
                <div key={m.id_deportista} className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.nombre}</p>
                    <p className="text-xs mt-0.5">
                      {faltan.length === 0
                        ? <span className="text-green-500">Tests al día</span>
                        : <span className="text-amber-400">Le falta {faltan.join(', ')}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-none">
                    <button onClick={() => router.push('/deportistas/' + m.id_deportista)}
                      className="text-gray-500 hover:text-white text-xs underline transition">Ver ficha</button>
                    <button onClick={() => sacar(m)} disabled={ocupado}
                      className="text-gray-600 hover:text-red-400 text-xs underline transition disabled:opacity-40">Sacar</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Lo siguiente. Se dice en vez de dejar la pantalla a medias sin explicación. */}
        <section className="bg-gray-900/50 border border-dashed border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm font-medium">Mandar entrenamientos al grupo</p>
          <p className="text-gray-600 text-xs mt-1.5 max-w-md mx-auto">
            Todavía no. Cuando esté, la sesión que montes aquí caerá en el calendario de cada miembro,
            con el ritmo de cada uno calculado con sus tests.
          </p>
        </section>
      </div>
    </main>
  )
}
