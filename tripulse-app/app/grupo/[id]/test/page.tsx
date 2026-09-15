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
import InstrumentoGrupo from '@/components/InstrumentoGrupo'
import PantallaDeTest from '@/components/PantallaDeTest'
import { seDirigeEnGrupo } from '@/lib/herramientas-test'
import type { ModoTest } from '@/lib/catalogo-tests'

/* Un test de grupo es UN protocolo y N resultados, que es exactamente como se
   hace en la vida real: el equipo entero hace el mismo test y tú vas anotando
   por quién va cada uno. Por eso el protocolo está arriba una sola vez y debajo
   hay una fila por persona con lo único que cambia.

   Se guarda en las mismas tablas y con las mismas fórmulas que la pantalla de
   un deportista (lib/tests-formulas), así que un test metido aquí recalcula sus
   zonas igual que si lo hubieras metido en su ficha. */

const CLAVES: ClaveTest[] = ['carrera', 'natacion', 'ciclismo']

/* El mismo test tiene dos nombres: aquí se llama por el deporte y en los
   instrumentos por el protocolo. Las CASILLAS son las mismas —velUltimo,
   tiempoAguantado, tiempoGrande…— así que lo que capture el reloj cae donde
   este formulario lo espera, sin traducir nada. */
const INSTRUMENTO: Record<ClaveTest, string> = {
  carrera: 'montreal', natacion: 'css', ciclismo: 'rampa',
}

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

  /* Cómo se hace: con un reloj común o metiendo los números después.
     `null` = todavía no lo ha dicho, y entonces se pregunta. */
  const [modo, setModo] = useState<ModoTest | null>(null)
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
    setModo(null)
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

  /* El reloj captura VARIAS casillas de golpe —el escalón y los segundos que
     aguantó— y tienen que entrar juntas: en dos pasos, el segundo leería un
     estado viejo y se perdería el primero. */
  const capturarDe = (idDep: number, campos: Record<string, string>) =>
    setPorPersona(p => ({ ...p, [idDep]: { ...(p[idDep] || {}), ...campos } }))

  /** Ya tiene su número: para tacharlo en la lista del reloj. */
  const yaTiene = (idDep: number) =>
    resultadoDe(clave, protocolo, porPersona[idDep] || {}) != null

  // Cómo se lee el número que sale. La VAM y el CSS en km/h y m/s no le dicen
  // nada a nadie: al lado va el ritmo, que es lo que el atleta va a ver.
  const legible = (n: number | null) => {
    if (n == null) return null
    if (clave === 'carrera') return n + ' km/h · ' + ritmoDeVam(n)
    if (clave === 'natacion') return n + ' m/s · ' + ritmoDeCss(n)
    return n + ' W'
  }

  /* Si este test se puede llevar con un reloj común. Los tres clásicos sí:
     el Montreal y la rampa con secuenciador, el CSS con dos cronómetros. */
  const dirigible = seDirigeEnGrupo(INSTRUMENTO[clave])

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

  /* Los ajustes del protocolo y la lista de personas se usan en los dos modos
     —a mano se quedan en la página, dirigido viven dentro de la pantalla que
     tapa la aplicación— así que se escriben UNA vez. */
  const ajustes = (
    <>
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
    </>
  )

  const listaPersonas = (
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
                      ? (modo === 'campo'
                          ? 'Según vayas pulsando arriba, aquí se rellena solo. Lo puedes corregir.'
                          : 'Ve rellenando; se guardan solo los que estén completos.')
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
)

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

          {modo !== 'campo' && ajustes}
        </section>

        {/* ===== ¿CÓMO LO VAS A HACER? =====
            Igual que en la ficha de un atleta: se pregunta después de elegir el
            test y antes de enseñar nada, y solo se pinta lo elegido. */}
        {dirigible && modo === null && (
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-[13px] font-semibold">¿Cómo vais a hacer el {def.nombre}?</p>
            <p className="text-[11.5px] text-gray-500 mt-0.5 mb-3">Eliges una y solo se enseña esa.</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {([
                { m: 'campo' as const, ic: '⏱️', t: 'Test de campo',
                  d: 'Lo estáis haciendo ahora. Un reloj para todos y un botón por atleta: lo pulsas según va cayendo cada uno.' },
                { m: 'mano' as const, ic: '✍️', t: 'A mano',
                  d: 'Ya está hecho. Metes los números de cada uno y la app calcula el resultado.' },
              ]).map(o => (
                <button key={o.m} onClick={() => setModo(o.m)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-orange-500/40 p-4 text-left transition">
                  <p className="text-[15px] font-bold">{o.ic} {o.t}</p>
                  <p className="text-[12px] text-gray-400 mt-1 leading-snug">{o.d}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {dirigible && modo && (
          <div className="flex items-center gap-2 text-[12px] -mb-3">
            <span className="text-gray-400">{modo === 'campo' ? '⏱️ Test de campo' : '✍️ A mano'}</span>
            <button onClick={() => setModo(null)} className="text-orange-400/90 hover:text-orange-300 transition">cambiar</button>
          </div>
        )}

        {!dirigible && listaPersonas}
        {dirigible && modo === 'mano' && listaPersonas}
      </div>

      {/* ===== EL TEST EN MARCHA TAPA LA APLICACIÓN =====
          Salir con el reloj corriendo no es un error que se corrija: se ha ido
          el reloj y con él el escalón de cada atleta, y el test hay que
          repetirlo con la gente ya cansada. Se sale por un solo sitio, y
          preguntando. */}
      {dirigible && modo === 'campo' && (
        <PantallaDeTest
          titulo={def.nombre + ' · ' + grupo.nombre}
          sub={miembros.length + (miembros.length === 1 ? ' atleta' : ' atletas') + ' · ' + listos + ' con resultado'}
          aviso="Se para el reloj y se pierde lo que no hayas guardado. Si ya tienes resultados, guárdalos antes."
          alSalir={() => setModo(null)}>
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
            {ajustes}
          </section>
          {/* ===== EL RELOJ DE TODOS =====
              Un entrenador no lleva doce cronómetros: lleva uno y va apuntando
              quién se cae. El reloj arranca con la salida y cada botón captura,
              del tiempo que lleve corrido, lo que le toca a esa persona: en el
              Montreal y la rampa el escalón en el que iba y los segundos que
              aguantaba; en el CSS, su tiempo. */}
          {miembros.length > 0 && (
            <InstrumentoGrupo
              claveTest={INSTRUMENTO[clave]}
              protocolo={protocolo}
              atletas={miembros.map(m => ({ id: m.id_deportista, nombre: m.nombre }))}
              capturado={yaTiene}
              onCapturar={capturarDe} />
          )}

          {listaPersonas}
        </PantallaDeTest>
      )}
    </main>
  )
}
