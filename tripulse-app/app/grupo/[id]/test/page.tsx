'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import Cargando from '@/components/Cargando'
import { miembrosDe, type MiembroGrupo } from '@/lib/grupos'
import {
  TESTS_GRUPO, resultadoDe, guardarTestsDelGrupo, resumenTests,
  type ClaveTest, type Valores, type ResultadoGuardado,
} from '@/lib/grupos-test'
import { ritmoDeVam, ritmoDeCss } from '@/lib/tests-formulas'

/* Un test de grupo es UN protocolo y N resultados, que es exactamente como se
   hace en la vida real: el equipo entero hace el mismo test y tú vas anotando
   por quién va cada uno. Por eso el protocolo está arriba una sola vez y debajo
   hay una fila por persona con lo único que cambia.

   Se guarda en las mismas tablas y con las mismas fórmulas que la pantalla de
   un deportista (lib/tests-formulas), así que un test metido aquí recalcula sus
   zonas igual que si lo hubieras metido en su ficha. */

const CLAVES: ClaveTest[] = ['carrera', 'natacion', 'ciclismo']

export default function TestDeGrupo({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  useRequireEntrenador()
  const { id } = use(params)

  const [grupo, setGrupo] = useState<{ id: string; nombre: string } | null>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [miembros, setMiembros] = useState<MiembroGrupo[]>([])

  const [clave, setClave] = useState<ClaveTest>('carrera')
  const [fecha, setFecha] = useState(hoyISO())
  const [protocolo, setProtocolo] = useState<Valores>({})
  // Lo de cada persona, por id. Se guarda por id y no por posición para que
  // reordenar la lista no mezcle los datos de dos atletas.
  const [porPersona, setPorPersona] = useState<Record<number, Valores>>({})

  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [parte, setParte] = useState<ResultadoGuardado[] | null>(null)

  const def = TESTS_GRUPO[clave]

  useEffect(() => { cargar() }, [id])

  // Al cambiar de deporte se reinicia todo: los campos no significan lo mismo y
  // arrastrar «60» de un test a otro sería un dato falso con pinta de bueno.
  useEffect(() => {
    const p: Valores = {}
    for (const c of TESTS_GRUPO[clave].protocolo) p[c.clave] = c.porDefecto
    setProtocolo(p)
    setPorPersona({})
    setParte(null)
    setError('')
  }, [clave])

  const cargar = async () => {
    const { data: g } = await supabase.from('grupo_entreno').select('id, nombre').eq('id', id).maybeSingle()
    if (!g) { setNoExiste(true); return }
    setGrupo(g)
    setMiembros(await miembrosDe(supabase, id))
  }

  const ponProtocolo = (k: string, v: string) => setProtocolo(p => ({ ...p, [k]: v }))
  const ponPersona = (idDep: number, k: string, v: string) =>
    setPorPersona(p => ({ ...p, [idDep]: { ...(p[idDep] || {}), [k]: v } }))

  // Cómo se lee el número que sale. La VAM y el CSS en km/h y m/s no le dicen
  // nada a nadie: al lado va el ritmo, que es lo que el atleta va a ver.
  const legible = (n: number | null) => {
    if (n == null) return null
    if (clave === 'carrera') return n + ' km/h · ' + ritmoDeVam(n)
    if (clave === 'natacion') return n + ' m/s · ' + ritmoDeCss(n)
    return n + ' W'
  }

  const listos = miembros.filter(m => resultadoDe(clave, protocolo, porPersona[m.id_deportista] || {}) != null).length

  const guardar = async () => {
    setOcupado(true); setError(''); setParte(null)
    const r = await guardarTestsDelGrupo(supabase, {
      clave, fecha, protocolo,
      personas: miembros.map(m => ({
        id_deportista: m.id_deportista, nombre: m.nombre, valores: porPersona[m.id_deportista] || {},
      })),
    })
    if (r.error) setError(r.error)
    else setPorPersona({})
    setParte(r.resultados.length ? r.resultados : null)
    setOcupado(false)
  }

  if (noExiste) return <Cargando volverA="/deportistas" noExiste />
  if (!grupo) return <Cargando volverA="/deportistas" />

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/grupo/' + id)} className="text-gray-400 hover:text-white text-sm transition">← {grupo.nombre}</button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold">Test del grupo</h2>
          <p className="text-gray-500 text-sm mt-1">
            Un protocolo, {miembros.length === 1 ? 'un resultado' : miembros.length + ' resultados'}. Se guarda en la ficha de cada uno y le recalcula sus zonas.
          </p>
        </div>

        {error && <div className="bg-red-950/60 border border-red-900 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {CLAVES.map(c => (
              <button key={c} onClick={() => setClave(c)}
                className={'px-4 py-2 rounded-lg text-sm font-medium transition ' +
                  (clave === c ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white')}>
                {TESTS_GRUPO[c].nombre}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-gray-800">
            <label className="flex flex-col gap-1">
              <span className="text-gray-400 text-xs">Qué día</span>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            {def.protocolo.map(c => (
              <label key={c.clave} className="flex flex-col gap-1">
                <span className="text-gray-400 text-xs">{c.etiqueta} {c.sufijo && <span className="text-gray-600">({c.sufijo})</span>}</span>
                <input type="number" inputMode="decimal" value={protocolo[c.clave] ?? ''}
                  onChange={e => ponProtocolo(c.clave, e.target.value)}
                  className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              </label>
            ))}
          </div>
          <p className="text-gray-600 text-xs">
            Esto es igual para todo el grupo: hacéis el mismo test. Abajo solo va lo que cambia de uno a otro.
          </p>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          {miembros.length === 0 ? (
            <p className="text-gray-500 text-sm">El grupo no tiene a nadie todavía.</p>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {miembros.map(m => {
                  const v = porPersona[m.id_deportista] || {}
                  const res = resultadoDe(clave, protocolo, v)
                  return (
                    <div key={m.id_deportista} className="flex flex-wrap items-end gap-3 pb-3 border-b border-gray-800 last:border-0">
                      <span className="font-medium w-full sm:w-40 sm:truncate">{m.nombre}</span>
                      {def.porPersona.map(c => (
                        <label key={c.clave} className="flex flex-col gap-1 flex-1 min-w-[110px]">
                          <span className="text-gray-500 text-[11px]">{c.etiqueta} {c.sufijo && <span className="text-gray-600">({c.sufijo})</span>}</span>
                          <input type="number" inputMode="decimal" value={v[c.clave] ?? ''}
                            onChange={e => ponPersona(m.id_deportista, c.clave, e.target.value)}
                            className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                        </label>
                      ))}
                      {/* El número sale mientras escribes: si te has equivocado de
                          casilla, se ve aquí antes de guardar y no dos semanas
                          después en los ritmos del atleta. */}
                      <div className="flex-1 min-w-[150px] text-right">
                        <span className="text-gray-500 text-[11px] block">{def.resultado}</span>
                        <span className={'text-sm font-semibold tabular-nums ' + (res == null ? 'text-gray-600' : 'text-orange-400')}>
                          {legible(res) || '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-between items-center gap-3 flex-wrap mt-5 pt-5 border-t border-gray-800">
                <p className="text-gray-500 text-xs">
                  {listos === 0
                    ? 'Ve rellenando; se guardan solo los que estén completos.'
                    : listos + ' de ' + miembros.length + ' ' + (listos === 1 ? 'listo' : 'listos') + '. A quien le falte algo no se le guarda nada.'}
                </p>
                <button onClick={guardar} disabled={ocupado || listos === 0}
                  className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40">
                  {ocupado ? 'Guardando…' : 'Guardar ' + listos + (listos === 1 ? ' test' : ' tests')}
                </button>
              </div>
            </>
          )}

          {parte && (
            <div className="mt-5 pt-5 border-t border-gray-800">
              <p className="text-sm font-medium mb-2">{resumenTests(parte, miembros.length)}</p>
              <div className="flex flex-col gap-1">
                {parte.map(r => (
                  <div key={r.id_deportista} className="flex items-center gap-2 text-xs">
                    <span className={r.ok ? 'text-green-500' : 'text-red-400'}>{r.ok ? '✓' : '✕'}</span>
                    <span className="text-gray-300">{r.nombre}</span>
                    {r.error && <span className="text-red-400/80">· {r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
