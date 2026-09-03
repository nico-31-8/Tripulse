'use client'
// ============================================================
// Dirigir tests — el entrenador a pie de pista
// ============================================================
// El equivalente de /sesion/[id]/dirigir para la batería de tests: se mete lo
// que se MIDE —metros, repeticiones, centímetros— y el número que sirve sale
// solo, mientras escribes.
//
// POR QUÉ IMPORTA QUE SALGA MIENTRAS ESCRIBES. Hoy el entrenador apunta el dato
// bruto en el móvil y hace la cuenta luego, en casa. Si se equivocó de casilla
// —el tiempo del último escalón donde iba la velocidad— no se entera hasta que
// dos semanas después los ritmos del atleta salen raros. Aquí el número aparece
// al lado: un error de tecleo se ve al momento.
//
// UNA PANTALLA PARA LOS DIECISIETE. Los tests se describen en datos
// (lib/catalogo-tests) y esta página los recorre. Añadir uno es añadir una
// entrada allí, no escribir otra página con su propia copia de «coge lo
// escrito, calcula, guarda» — que serían diecisiete sitios donde el mismo test
// puede acabar dando números distintos.
//
// UNO O VARIOS ES EL MISMO SITIO. Con una persona seleccionada se ve la ficha
// entera del test; con varias, una fila por cada una y el resultado principal a
// la derecha. No son dos pantallas porque no son dos cosas: es el mismo test.
//
// LOS TRES CLÁSICOS NO ESTÁN AQUÍ. Montreal, CSS y la rampa tienen tabla propia
// y de ellos salen las zonas: se hacen en /tests/[id] y en /grupo/[id]/test. Se
// enlaza a ellos desde arriba en vez de duplicar su escritura.
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { usuarioActual } from '@/lib/sesion'
import { hoyISO } from '@/lib/fechas'
import InstrumentoGrupo from '@/components/InstrumentoGrupo'
import { camposQueRellena } from '@/lib/herramientas-test'
import Cargando from '@/components/Cargando'
import {
  CATALOGO, porDisciplina, testPorClave, protocoloInicial,
  camposDeProtocolo, camposPorPersona, resultadosDe, principalDe, estaCompleto,
  avisosDeTesteo,
  type TestCampo, type Valores, type Disciplina, type CampoBruto,
} from '@/lib/catalogo-tests'
import {
  contextosDe, guardarTestsDeCampo, resumenDeTests, testsDeHoy, diasHastaCarreraA,
  type Contextos, type ResultadoGuardado,
} from '@/lib/dirigir-tests'

const EMOJI: Record<Disciplina, string> = {
  Carrera: '🏃', Ciclismo: '🚴', 'Natación': '🏊', Fuerza: '🏋️', 'Triatlón': '🔀',
}

interface Deportista { id: number; nombre: string }

/** Una casilla del test: número, o desplegable si trae opciones. */
function Casilla({ campo, valor, onChange, compacta }: {
  campo: CampoBruto
  valor: string
  onChange: (v: string) => void
  compacta?: boolean
}) {
  const base = 'bg-gray-800 text-white rounded-lg outline-none focus:ring-2 focus:ring-orange-500 ' +
    (compacta ? 'px-3 py-2 text-sm' : 'px-3 py-2.5')
  return (
    <label className={'flex flex-col gap-1 ' + (compacta ? 'flex-1 min-w-[110px]' : '')}>
      <span className={compacta ? 'text-gray-500 text-[11px]' : 'text-gray-400 text-xs'}>
        {campo.etiqueta}
        {campo.sufijo && <span className="text-gray-600"> ({campo.sufijo})</span>}
      </span>
      {campo.opciones ? (
        <select value={valor} onChange={e => onChange(e.target.value)} className={base}>
          {campo.opciones.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      ) : (
        <input type="number" inputMode="decimal" value={valor} onChange={e => onChange(e.target.value)} className={base} />
      )}
      {campo.ayuda && !compacta && <span className="text-gray-600 text-[11px]">{campo.ayuda}</span>}
    </label>
  )
}

export default function DirigirTests() {
  useRequireEntrenador()
  const router = useRouter()

  const [deportistas, setDeportistas] = useState<Deportista[] | null>(null)
  const [contextos, setContextos] = useState<Contextos>({})

  const [clave, setClave] = useState<string>('6min')
  const [disciplina, setDisciplina] = useState<Disciplina>('Carrera')
  const [fecha, setFecha] = useState(hoyISO())
  const [protocolo, setProtocolo] = useState<Valores>(() => protocoloInicial(testPorClave('6min')!))
  const [elegidos, setElegidos] = useState<number[]>([])
  // Por id y no por posición: reordenar la lista no puede mezclar los datos de
  // dos atletas.
  const [porPersona, setPorPersona] = useState<Record<number, Valores>>({})
  const [notas, setNotas] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)

  // Lo que hace falta para los avisos del §9, y que depende de a quién y de qué
  // día: qué se le ha testado ya hoy y cuánto falta para su carrera A.
  const [yaHoy, setYaHoy] = useState<Record<number, TestCampo[]>>({})
  const [diasA, setDiasA] = useState<Record<number, number | null>>({})

  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [parte, setParte] = useState<ResultadoGuardado[] | null>(null)

  const test = testPorClave(clave)!
  const grupos = useMemo(() => porDisciplina(), [])

  useEffect(() => { cargar() }, [])

  // Al cambiar de test se reinicia todo lo medido: las casillas no significan
  // lo mismo y arrastrar un «60» de un test a otro sería un dato falso con
  // pinta de bueno.
  useEffect(() => {
    setProtocolo(protocoloInicial(test))
    setPorPersona({})
    setParte(null)
    setError('')
  }, [clave])

  // Al cambiar a quién o qué día, se vuelve a mirar qué se le ha testado ya y
  // cuánto le falta para competir. `parte` fuera de las dependencias a
  // propósito: se relee después de guardar, que es justo cuando cambia.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      if (elegidos.length === 0) { setYaHoy({}); setDiasA({}); return }
      const [h, d] = await Promise.all([
        testsDeHoy(supabase, elegidos, fecha),
        diasHastaCarreraA(supabase, elegidos, fecha),
      ])
      if (cancelado) return
      setYaHoy(h); setDiasA(d)
    })()
    return () => { cancelado = true }
  }, [elegidos, fecha, parte])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) return
    const { data } = await supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id).order('nombre')
    const lista = (data || []) as Deportista[]
    setDeportistas(lista)
    if (lista.length) setContextos(await contextosDe(supabase, lista.map(d => d.id)))
  }

  const ponProtocolo = (k: string, v: string) => setProtocolo(p => ({ ...p, [k]: v }))
  const ponPersona = (id: number, k: string, v: string) =>
    setPorPersona(p => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }))

  const alternar = (id: number) =>
    setElegidos(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]))

  /** Lo escrito de una persona, ya con el protocolo mezclado. */
  const valoresDe = (id: number): Valores => ({ ...protocolo, ...(porPersona[id] || {}) })

  const seleccionados = (deportistas || []).filter(d => elegidos.includes(d.id))
  const listos = seleccionados.filter(d => estaCompleto(test, valoresDe(d.id), contextos[d.id] || {})).length
  const uno = seleccionados.length === 1

  /**
   * Los avisos del §9 para una persona.
   *
   * Salen por persona y no arriba porque no son iguales para todos: a uno le
   * quedan diez días para su carrera A y al de al lado tres meses. Un aviso que
   * no es para ti se aprende a ignorar, y con él se ignoran los demás.
   *
   * La semana de descarga no se pasa: la app todavía no sabe decir si la semana
   * en curso lo es, y avisar en falso es peor que no avisar.
   */
  const avisosDe = (id: number) => avisosDeTesteo({
    test,
    yaHoy: yaHoy[id] ?? [],
    diasHastaCarreraA: diasA[id] ?? null,
  })

  const guardar = async () => {
    setOcupado(true); setError(''); setParte(null)
    const r = await guardarTestsDeCampo(supabase, {
      test, fecha, protocolo, contextos, notas,
      personas: seleccionados.map(d => ({ id_deportista: d.id, nombre: d.nombre, valores: porPersona[d.id] || {} })),
    })
    if (r.error) setError(r.error)
    else { setPorPersona({}); setNotas('') }
    setParte(r.resultados.length ? r.resultados : null)
    setOcupado(false)
  }

  if (!deportistas) return <Cargando volverA="/dashboard" />

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Panel</button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold">Dirigir tests</h2>
          <p className="text-gray-500 text-sm mt-1">
            Metes lo que mides y el resultado sale solo. A uno o a varios a la vez.
          </p>
        </div>

        {error && <div className="bg-red-950/60 border border-red-900 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {/* ---------- Qué test ---------- */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {grupos.map(g => (
              <button key={g.disciplina} onClick={() => setDisciplina(g.disciplina)}
                className={'px-3 py-1.5 rounded-lg text-sm font-medium transition ' +
                  (disciplina === g.disciplina ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-500 hover:text-white')}>
                {EMOJI[g.disciplina]} {g.disciplina}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {CATALOGO.filter(t => t.disciplina === disciplina).map(t => (
              <button key={t.clave} onClick={() => setClave(t.clave)}
                className={'px-4 py-2 rounded-lg text-sm font-medium transition ' +
                  (clave === t.clave ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white')}>
                {t.nombre}
              </button>
            ))}
          </div>

          <div className="pt-4 border-t border-gray-800 flex flex-col gap-2">
            <p className="text-sm"><span className="text-gray-500">Mide:</span> {test.mide}</p>
            <p className="text-gray-400 text-sm">{test.protocolo}</p>
            {test.cada && <p className="text-gray-600 text-xs">Cada cuánto: {test.cada}</p>}
            {test.ojo && (
              <p className="text-amber-300/80 text-xs bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
                {test.ojo}
              </p>
            )}
          </div>
        </section>

        {/* ---------- Cuándo y con qué protocolo ---------- */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-gray-400 text-xs">Qué día</span>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            {camposDeProtocolo(test).map(c => (
              <Casilla key={c.clave} campo={c} valor={protocolo[c.clave] ?? ''} onChange={v => ponProtocolo(c.clave, v)} />
            ))}
          </div>
          {camposDeProtocolo(test).length > 0 && (
            <p className="text-gray-600 text-xs">
              Esto es igual para todos: hacéis el mismo test. Abajo solo va lo que cambia de uno a otro.
            </p>
          )}
        </section>

        {/* ---------- El reloj, uno para todo el grupo ----------
            Va DESPUÉS del protocolo porque de ahí lee la duración del escalón y
            el incremento, y ANTES de la lista de atletas porque es lo que se
            mira mientras el test corre. Solo sale con alguien elegido: un
            cronómetro sin nadie a quien apuntarle la marca no sirve de nada. */}
        {elegidos.length > 0 && (
          <InstrumentoGrupo
            claveTest={test.clave}
            protocolo={protocolo}
            atletas={elegidos.map(id => ({
              id,
              nombre: deportistas.find(d => d.id === id)?.nombre ?? 'Sin nombre',
            }))}
            capturado={id => camposQueRellena(test.clave).some(k => !!porPersona[id]?.[k])}
            onCapturar={(id, campos) => {
              /* Se abre su ficha al capturar: así el entrenador VE el número que
                 acaba de caer y puede corregirlo si cogió mal el momento. */
              setPorPersona(p => ({ ...p, [id]: { ...(p[id] ?? {}), ...campos } }))
              setAbierto(id)
            }}
          />
        )}

        {/* ---------- A quién ---------- */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">A quién</h3>
            <span className="text-gray-500 text-xs">
              {elegidos.length === 0 ? 'Nadie elegido' : elegidos.length + (elegidos.length === 1 ? ' persona' : ' personas')}
            </span>
          </div>

          {deportistas.length === 0 ? (
            <p className="text-gray-500 text-sm">Todavía no tienes deportistas.</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {deportistas.map(d => (
                <button key={d.id} onClick={() => alternar(d.id)}
                  className={'px-3 py-1.5 rounded-lg text-sm transition ' +
                    (elegidos.includes(d.id) ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white')}>
                  {d.nombre}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Lo que se mide ---------- */}
        {seleccionados.length > 0 && (
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
            {seleccionados.map(d => {
              const v = valoresDe(d.id)
              const ctx = contextos[d.id] || {}
              const res = resultadosDe(test, v, ctx)
              const princ = principalDe(test, v, ctx)
              const verDetalle = uno || abierto === d.id
              const otros = res.filter(r => r.salida !== princ?.salida)

              return (
                <div key={d.id} className="pb-4 border-b border-gray-800 last:border-0 last:pb-0 flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="font-medium w-full sm:w-36 sm:truncate">{d.nombre}</span>
                    {camposPorPersona(test).map(c => (
                      <Casilla key={c.clave} campo={c} compacta
                        valor={porPersona[d.id]?.[c.clave] ?? ''}
                        onChange={x => ponPersona(d.id, c.clave, x)} />
                    ))}
                    {/* El número sale mientras escribes: un error de casilla se
                        ve aquí y no dos semanas después en los ritmos. */}
                    <div className="flex-1 min-w-[130px] text-right">
                      <span className="text-gray-500 text-[11px] block">{princ?.salida.etiqueta}</span>
                      <span className={'text-lg font-semibold tabular-nums ' + (princ?.valor == null ? 'text-gray-600' : 'text-orange-400')}>
                        {princ?.texto ?? '—'}
                      </span>
                    </div>
                  </div>

                  {princ?.lectura && <p className="text-gray-400 text-xs">{princ.lectura}</p>}

                  {avisosDe(d.id).map((a, i) => (
                    <p key={i} className="text-amber-300/80 text-xs bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
                      {a}
                    </p>
                  ))}

                  {otros.length > 0 && (
                    verDetalle ? (
                      <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-4 py-3 flex flex-col gap-2">
                        {otros.map(r => (
                          <div key={r.salida.clave} className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-gray-500 text-xs">
                              {r.salida.etiqueta}
                              {r.salida.noGuardar && <span className="text-gray-700"> · no se guarda</span>}
                            </span>
                            <div className="text-right">
                              <span className={'text-sm font-medium tabular-nums ' + (r.valor == null ? 'text-gray-700' : 'text-white')}>
                                {r.texto}
                              </span>
                              {r.lectura && <span className="block text-gray-500 text-[11px]">{r.lectura}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button onClick={() => setAbierto(d.id)} className="text-gray-500 hover:text-white text-xs text-left transition">
                        Ver los otros {otros.length} números de este test ↓
                      </button>
                    )
                  )}
                  {otros.length > 0 && verDetalle && !uno && (
                    <button onClick={() => setAbierto(null)} className="text-gray-600 hover:text-white text-xs text-left transition">
                      Cerrar ↑
                    </button>
                  )}
                </div>
              )
            })}

            <label className="flex flex-col gap-1 pt-2 border-t border-gray-800">
              <span className="text-gray-400 text-xs">Nota del test (opcional)</span>
              <input value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Pista mojada, viento en contra, venía tocado..."
                className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
              <span className="text-gray-600 text-[11px]">Se guarda igual en todos: son las condiciones del test, no de una persona.</span>
            </label>

            <button onClick={guardar} disabled={ocupado || listos === 0}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-4 rounded-xl transition">
              {ocupado ? 'Guardando...' : listos === 0 ? 'Rellena algún resultado' : 'Guardar ' + listos + (listos === 1 ? ' test' : ' tests')}
            </button>
            {listos < seleccionados.length && listos > 0 && (
              <p className="text-gray-600 text-xs text-center">
                A {seleccionados.length - listos} le falta algo: se le salta en vez de guardarle un test vacío.
              </p>
            )}
          </section>
        )}

        {/* ---------- El parte ---------- */}
        {parte && (
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-2">
            <p className="font-medium text-sm">{resumenDeTests(parte, seleccionados.length)}</p>
            {parte.map(r => (
              <div key={r.id_deportista} className="flex items-center gap-2 text-xs">
                <span className={r.ok ? 'text-green-400' : 'text-red-400'}>{r.ok ? '✓' : '✕'}</span>
                <span className="text-gray-400">{r.nombre}</span>
                {r.ok && <span className="text-gray-600">{r.filas} {r.filas === 1 ? 'dato' : 'datos'}</span>}
              </div>
            ))}
            <p className="text-gray-600 text-xs pt-1">
              Quedan en el historial de cada uno, en su ficha de tests.
            </p>
          </section>
        )}

        {/* ---------- Los tres que viven en otro sitio ---------- */}
        <section className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-400">Montreal, CSS y rampa</h3>
          <p className="text-gray-500 text-xs">
            Esos tres no están aquí porque de ellos salen las zonas del atleta: se guardan en su
            tabla y recalculan sus ritmos. Se hacen en la ficha de tests de cada uno, o de una
            sentada en la de grupo.
          </p>
          <button onClick={() => router.push('/tests')}
            className="self-start text-orange-400 hover:text-orange-300 text-sm transition">
            Ir a la ficha de tests →
          </button>
        </section>
      </div>
    </main>
  )
}
