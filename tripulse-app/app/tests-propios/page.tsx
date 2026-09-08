'use client'
// ============================================================
// TRIPULSE — Tests propios del entrenador
// ============================================================
//
// PANTALLA APARTE, Y A PROPÓSITO. No toca `/tests/[id]` ni ninguna otra: vive
// en su carpeta, escribe en dos tablas que no lee nadie más, y si no convence
// se borra la carpeta y no queda rastro. Esa es la condición con la que se
// montó, y es la que decide que esté aquí y no repartida por la app.
//
// LO QUE HACE. Un entrenador se crea un test —unos campos y una o varias
// fórmulas—, se lo pasa a un atleta y ve cómo evoluciona.
//
// LA LÓGICA NO ESTÁ AQUÍ. Evaluar, validar y armar las series vive en
// lib/formula.ts y lib/test-definicion.ts, con sus tests. Aquí solo hay
// pantalla y consultas: si algo calcula, es que está en el sitio equivocado.
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { hoyISO } from '@/lib/fechas'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import {
  ANCLAS, ANCLAS_REFERENCIA, tipoDeAncla, esInverso, leerDefinicion, calcularResultados, pegasDe, pegaDe,
  sePuedeGuardar, seriesDe, referenciasDe, TEST_VACIO,
  type Ancla, type DefinicionTest, type Medicion, type ResultadoTest, type SerieResultado,
} from '@/lib/test-definicion'
import { renombrarEn, dependencias, type Bloque } from '@/lib/formula'
import { puedeFijar, propuestaPropia, origenDe } from '@/lib/ancla-propia'
import { fijarZonas } from '@/lib/zonas-desde-test'

const SIGNO: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', '(': '(', ')': ')' }
const OPS = ['+', '-', '*', '/', '^', '(', ')']
const DEPORTES = ['Carrera', 'Ciclismo', 'Natacion', 'Fuerza', 'Otro']

const nEs = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')
/* hoyISO y no toISOString(): ese da el dia en UTC, asi que una medicion
   guardada a las 23:30 se apuntaria al dia siguiente. Hay un test guardian en
   lib/fechas-sin-reloj que lo impide, y hace bien. */
const hoy = () => hoyISO()

interface FilaTest { id: number; nombre: string; deporte: string; def: DefinicionTest; mediciones: number }

export default function TestsPropiosPage() {
  const router = useRouter()
  useRequireEntrenador()

  const [userId, setUserId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [tests, setTests] = useState<FilaTest[]>([])
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; texto: string } | null>(null)

  /* Una sola pantalla con tres caras, en vez de tres rutas. Así el test que
     acabas de crear ya está en memoria cuando pasas a rellenarlo, sin volver a
     pedirlo, y borrar todo esto sigue siendo borrar una carpeta. */
  const [vista, setVista] = useState<'lista' | 'editor' | 'atleta'>('lista')
  const [editando, setEditando] = useState<number | null>(null)
  const [def, setDef] = useState<DefinicionTest>({ ...TEST_VACIO })

  const [testActivo, setTestActivo] = useState<FilaTest | null>(null)
  const [depActivo, setDepActivo] = useState<number | null>(null)
  const [mediciones, setMediciones] = useState<Medicion[]>([])
  const [entrada, setEntrada] = useState<Record<string, string>>({})
  const [fecha, setFecha] = useState(hoy())
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { arrancar() }, [])

  const arrancar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    const [{ data: defs }, { data: deps }] = await Promise.all([
      supabase.from('test_definicion').select('*').eq('id_entrenador', user.id)
        .eq('archivado', false).order('created_at', { ascending: false }),
      supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id).order('nombre'),
    ])
    const ids = (defs || []).map((d: any) => d.id)
    /* Cuántas mediciones tiene cada uno, en UNA consulta y no una por test:
       con diez tests serían diez viajes para pintar un contador. */
    const { data: meds } = ids.length
      ? await supabase.from('test_medicion').select('id_definicion').in('id_definicion', ids)
      : { data: [] as any[] }
    const cuenta: Record<number, number> = {}
    for (const m of meds || []) cuenta[m.id_definicion] = (cuenta[m.id_definicion] || 0) + 1

    setTests((defs || []).map((d: any) => ({
      id: d.id, nombre: d.nombre, deporte: d.deporte,
      def: leerDefinicion(d), mediciones: cuenta[d.id] || 0,
    })))
    setDeportistas(deps || [])
    setCargando(false)
  }

  const decir = (tipo: 'ok' | 'mal', texto: string) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(null), 4000)
  }

  // ---------- editor ----------

  const nuevoTest = () => {
    setEditando(null)
    setDef({ nombre: '', deporte: 'Carrera', campos: [{ clave: 'campo_1', etiqueta: 'Primer dato' }], resultados: [] })
    setVista('editor')
  }

  const abrirEditor = (t: FilaTest) => { setEditando(t.id); setDef(t.def); setVista('editor') }

  const addCampo = () => setDef(d => ({
    ...d, campos: [...d.campos, { clave: 'campo_' + (d.campos.length + 1), etiqueta: 'Nuevo dato' }],
  }))

  /** Renombrar arrastra las fórmulas: los bloques ya saben a qué apuntan. */
  const renombrarCampo = (i: number, nuevo: string) => setDef(d => {
    const viejo = d.campos[i].clave
    return {
      ...d,
      campos: d.campos.map((c, k) => k === i ? { ...c, clave: nuevo } : c),
      resultados: d.resultados.map((r, k) => ({
        ...r, formula: renombrarEn([r.formula], 'var', viejo, nuevo)[0] ?? r.formula,
      })),
    }
  })

  const renombrarResultado = (i: number, nuevo: string) => setDef(d => {
    const viejo = d.resultados[i].nombre
    const conNombre = d.resultados.map((r, k) => k === i ? { ...r, nombre: nuevo } : r)
    return { ...d, resultados: conNombre.map(r => ({ ...r, formula: renombrarEn([r.formula], 'ref', viejo, nuevo)[0] ?? r.formula })) }
  })

  const addResultado = () => setDef(d => ({
    ...d,
    resultados: [...d.resultados, {
      nombre: 'resultado_' + (d.resultados.length + 1), unidad: '', ancla: 'nada' as Ancla, formula: [], graf: true,
    }],
  }))

  const parcheR = (i: number, cambios: any) => setDef(d => ({
    ...d, resultados: d.resultados.map((r, k) => k === i ? { ...r, ...cambios } : r),
  }))

  const addBloque = (i: number, b: Bloque) => setDef(d => ({
    ...d, resultados: d.resultados.map((r, k) => k === i ? { ...r, formula: [...r.formula, b] } : r),
  }))

  const quitarBloque = (i: number, n: number) => setDef(d => ({
    ...d, resultados: d.resultados.map((r, k) => k === i ? { ...r, formula: r.formula.filter((_, j) => j !== n) } : r),
  }))

  const guardarTest = async () => {
    if (!userId || !sePuedeGuardar(def)) return
    setGuardando(true)
    const fila = {
      id_entrenador: userId, nombre: def.nombre.trim(), deporte: def.deporte,
      campos: def.campos, resultados: def.resultados,
    }
    const { error } = editando
      ? await supabase.from('test_definicion').update(fila).eq('id', editando)
      : await supabase.from('test_definicion').insert(fila)
    setGuardando(false)
    if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return }
    decir('ok', editando ? 'Test actualizado.' : 'Test creado.')
    await arrancar()
    setVista('lista')
  }

  const archivar = async (t: FilaTest) => {
    if (!confirm('¿Archivar «' + t.nombre + '»? Sus mediciones no se borran.')) return
    const { error } = await supabase.from('test_definicion').update({ archivado: true }).eq('id', t.id)
    if (error) { decir('mal', error.message); return }
    decir('ok', 'Archivado.')
    await arrancar()
  }

  // ---------- pasárselo a un atleta ----------

  const abrirAtleta = async (t: FilaTest) => {
    setTestActivo(t)
    setVista('atleta')
    setEntrada(Object.fromEntries(t.def.campos.map(c => [c.clave, ''])))
    setFecha(hoy())
    const dep = depActivo ?? deportistas[0]?.id ?? null
    setDepActivo(dep)
    if (dep) await cargarMediciones(t.id, dep)
  }

  const cargarMediciones = async (idDef: number, idDep: number) => {
    const { data } = await supabase.from('test_medicion')
      .select('fecha, datos').eq('id_definicion', idDef).eq('id_deportista', idDep)
      .order('fecha', { ascending: false })
    setMediciones((data || []).map((m: any) => ({ fecha: m.fecha, datos: m.datos || {} })))
  }

  const cambiarDeportista = async (id: number) => {
    setDepActivo(id)
    if (testActivo) await cargarMediciones(testActivo.id, id)
  }

  const guardarMedicion = async () => {
    if (!testActivo || !depActivo || !fecha) return
    setGuardando(true)
    /* upsert por (test, atleta, fecha): repetir un día es CORREGIR, no apuntar
       dos veces. El índice único de la tabla lo respalda; esto solo evita que
       el intento acabe en un error de clave duplicada. */
    const { error } = await supabase.from('test_medicion').upsert({
      id_definicion: testActivo.id, id_deportista: depActivo, fecha, datos: entrada,
    }, { onConflict: 'id_definicion,id_deportista,fecha' })
    setGuardando(false)
    if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return }
    decir('ok', 'Medición guardada.')
    await cargarMediciones(testActivo.id, depActivo)
    await arrancar()
  }

  // ---------- estilos compartidos ----------
  const campo = 'bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-orange-500 w-full border border-transparent'
  const campoMal = campo.replace('border-transparent', 'border-red-500/60 bg-red-500/5')
  const lab = 'block text-gray-400 text-[11.5px] mb-1'
  const btn = 'bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-40'
  const btnSec = 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition'
  const tarjeta = 'bg-gray-900 border border-gray-800 rounded-2xl p-5'

  /* Verde = además puede ocupar la casilla de la app. Violeta = es una
     referencia tuya igual de buena, solo que sus zonas las cuelgas tú. */
  const chipAncla = (a: Ancla, deporte: string) => {
    if (tipoDeAncla(a) === 'seguimiento') return null
    const puede = puedeFijar(deporte, { nombre: '', unidad: '', ancla: a, formula: [], graf: false }).destino
    return puede
      ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-300">⚓ {ANCLAS[a].nombre}</span>
      : <span className="text-[11px] px-2 py-0.5 rounded bg-violet-500/12 border border-violet-400/40 text-violet-300 font-semibold">◈ Referencia tuya</span>
  }

  if (cargando) return <main className="min-h-screen bg-gray-950 text-gray-500 grid place-items-center">Cargando…</main>

  const pegas = pegasDe(def)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        <span className="text-sm text-gray-500">
          {vista === 'lista' ? 'Tests propios'
            : vista === 'editor' ? (editando ? 'Editar test' : 'Crear test')
            : testActivo?.nombre}
        </span>
        <div className="flex gap-4">
          {vista !== 'lista' && (
            <button onClick={() => setVista('lista')} className="text-gray-400 hover:text-white text-sm transition">← Mis tests</button>
          )}
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">Dashboard</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {aviso && (
          <div className={'mb-5 px-4 py-3 rounded-xl text-sm border ' + (aviso.tipo === 'ok'
            ? 'bg-green-500/8 border-green-500/30 text-green-300'
            : 'bg-red-500/8 border-red-500/30 text-red-300')}>{aviso.texto}</div>
        )}

        {/* ═════════ LISTA ═════════ */}
        {vista === 'lista' && (
          <>
            <div className="flex justify-between items-start gap-4 mb-6 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold mb-1">Tests propios</h2>
                <p className="text-gray-400 text-sm max-w-xl">
                  Los tuyos, además de los que trae la aplicación. Defines qué datos se rellenan y qué
                  sale de ellos, y cada resultado dice para qué sirve.
                </p>
              </div>
              <button onClick={nuevoTest} className={btn}>+ Crear test</button>
            </div>

            {tests.length === 0 ? (
              <div className={tarjeta + ' text-center py-14'}>
                <div className="text-4xl mb-3">🧪</div>
                <p className="text-gray-400 mb-1">Todavía no has creado ninguno.</p>
                <p className="text-gray-600 text-sm">Un test es unos campos que rellenas y una fórmula que sale de ellos.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tests.map(t => {
                  const referencias = referenciasDe(t.def)
                  return (
                    <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex justify-between items-center gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-semibold">{t.nombre}
                          <span className="text-gray-500 text-xs font-normal"> · {t.deporte}</span></div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {t.def.campos.length} campo{t.def.campos.length === 1 ? '' : 's'} ·
                          {' '}produce {t.def.resultados.map(r => r.nombre).join(', ') || '— nada'}
                          {t.mediciones > 0 && ' · ' + t.mediciones + ' medición' + (t.mediciones === 1 ? '' : 'es')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {referencias.map(h => <span key={h.indice}>{chipAncla(h.resultado.ancla, t.deporte)}</span>)}
                        <button onClick={() => abrirAtleta(t)} className={btnSec}>Pasar a un atleta</button>
                        <button onClick={() => abrirEditor(t)} title="Editar"
                          className="text-gray-500 hover:text-orange-400 px-2 py-1 rounded transition">✏️</button>
                        <button onClick={() => archivar(t)} title="Archivar"
                          className="text-gray-500 hover:text-red-400 px-2 py-1 rounded transition">🗄</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ═════════ EDITOR ═════════ */}
        {vista === 'editor' && (
          <div className="flex flex-col gap-4">
            <div className={tarjeta}>
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className={lab}>Nombre del test</label>
                  <input className={campo} value={def.nombre} placeholder="Test de Cooper"
                    onChange={e => setDef(d => ({ ...d, nombre: e.target.value }))} />
                </div>
                <div style={{ maxWidth: 170 }}>
                  <label className={lab}>Deporte</label>
                  <select className={campo} value={def.deporte}
                    onChange={e => setDef(d => ({ ...d, deporte: e.target.value }))}>
                    {DEPORTES.map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* --- campos --- */}
            <div className={tarjeta}>
              <p className="font-bold text-[15px] mb-0.5">1 · Qué datos se rellenan</p>
              <p className="text-gray-500 text-xs mb-4">Cada uno con su clave, que es como lo llamarás en las fórmulas.</p>
              {def.campos.map((c, i) => {
                const mal = pegaDe(pegas, 'campo', i)
                return (
                  <div key={i} className="flex gap-2 items-start mb-2 flex-wrap">
                    <div style={{ maxWidth: 190, flex: 1 }}>
                      <input className={(mal ? campoMal : campo) + ' font-mono'} value={c.clave}
                        onChange={e => renombrarCampo(i, e.target.value)} />
                      {mal && <span className="block text-red-300 text-[10.5px] mt-1">{mal}</span>}
                    </div>
                    <input className={campo + ' flex-1 min-w-[160px]'} value={c.etiqueta} placeholder="Lo que verás al pasarlo"
                      onChange={e => setDef(d => ({ ...d, campos: d.campos.map((x, k) => k === i ? { ...x, etiqueta: e.target.value } : x) }))} />
                    <button onClick={() => setDef(d => ({ ...d, campos: d.campos.filter((_, k) => k !== i) }))}
                      className="text-gray-600 hover:text-red-400 px-2 py-2">×</button>
                  </div>
                )
              })}
              <button onClick={addCampo} className={btnSec + ' mt-2'}>+ Añadir campo</button>
            </div>

            {/* --- resultados --- */}
            <div className={tarjeta}>
              <p className="font-bold text-[15px] mb-0.5">2 · Qué sale de ahí</p>
              <p className="text-gray-500 text-xs mb-4">
                Cada resultado puede usar los <b className="text-gray-300">anteriores</b>. Uno que no usa
                ninguno va por su cuenta: está para verlo avanzar en su gráfica.
              </p>

              {def.resultados.map((r, i) => {
                const mal = pegaDe(pegas, 'resultado', i)
                const previos = def.resultados.slice(0, i).filter(p => p.nombre)
                const dep = dependencias(r.formula)
                return (
                  <div key={i} className="bg-[#161f2e] border border-gray-800 rounded-xl p-4 mb-3">
                    <div className="flex justify-between items-center gap-2 mb-3">
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-gray-800 border border-gray-700 grid place-items-center text-[10.5px] text-gray-400 font-bold">{i + 1}</span>
                        {dep.refs.length > 0
                          ? <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-violet-500/14 border border-violet-400/40 text-violet-300 font-semibold">↳ sobre {dep.refs.join(', ')}</span>
                          : dep.campos.length > 0
                            ? <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/4 border border-gray-700 text-gray-400 font-semibold">suelto · de {dep.campos.join(', ')}</span>
                            : null}
                      </span>
                      <button onClick={() => setDef(d => ({ ...d, resultados: d.resultados.filter((_, k) => k !== i) }))}
                        className="text-gray-600 hover:text-red-400 px-1">×</button>
                    </div>

                    <div className="flex gap-2 flex-wrap items-start mb-3">
                      <div style={{ maxWidth: 150 }}>
                        <label className={lab}>Se llama</label>
                        <input className={(mal ? campoMal : campo) + ' font-mono'} value={r.nombre}
                          onChange={e => renombrarResultado(i, e.target.value)} />
                      </div>
                      <div style={{ maxWidth: 110 }}>
                        <label className={lab}>Unidad</label>
                        <input className={campo} value={r.unidad} placeholder="km/h"
                          onChange={e => parcheR(i, { unidad: e.target.value })} />
                        {/* Se enseña lo que la app ha deducido de la unidad, y se
                            puede corregir. De esto dependen la flecha de la
                            gráfica y hacia dónde va el % de una zona colgada de
                            aquí: el 95 % de 1:13 es más lento, no más rápido. */}
                        <button onClick={() => parcheR(i, { inverso: !esInverso(r) })}
                          title="Hacia dónde va la mejora en esta unidad. Cámbialo si no acierta."
                          className="text-[10.5px] text-gray-500 hover:text-gray-300 mt-1 transition">
                          {esInverso(r) ? '↓ menos es mejor' : '↑ más es mejor'}
                        </button>
                      </div>
                      <div className="flex-1 min-w-[220px]">
                        <label className={lab}>¿Para qué sirve?</label>
                        {/* Agrupado, porque el grupo ES el concepto: todo lo de
                            arriba es un número del que se pueden colgar zonas,
                            sea un umbral o una marca suya. */}
                        <select className={campo} value={r.ancla} onChange={e => parcheR(i, { ancla: e.target.value })}>
                          <optgroup label="Referencias — se les pueden colgar zonas">
                            {ANCLAS_REFERENCIA.map(k => <option key={k} value={k}>{ANCLAS[k].etiqueta}</option>)}
                          </optgroup>
                          <optgroup label="Lo demás">
                            <option value="nada">{ANCLAS.nada.etiqueta}</option>
                          </optgroup>
                        </select>
                        {/* Se dice AQUÍ, al crearlo, y no meses después cuando el
                            entrenador vaya a fijar zonas y descubra que no puede. */}
                        <Cabe deporte={def.deporte} r={r} />
                      </div>
                      <label className="flex items-center gap-2 text-gray-400 text-xs pt-6 cursor-pointer select-none">
                        <input type="checkbox" checked={r.graf} className="accent-orange-500"
                          onChange={e => parcheR(i, { graf: e.target.checked })} /> gráfica
                      </label>
                    </div>

                    {/* la fórmula, en bloques */}
                    <div className="bg-gray-950/60 border border-dashed border-gray-700 rounded-xl px-3 py-2.5 flex items-center gap-2 min-h-[48px]">
                      <div className="flex gap-1.5 flex-wrap flex-1">
                        {r.formula.length === 0
                          ? <span className="text-gray-600 text-sm italic">Móntala con los bloques de abajo</span>
                          : r.formula.map((b, n) => (
                              <button key={n} onClick={() => quitarBloque(i, n)} title="Quitar"
                                className={'font-mono text-[13px] font-semibold px-2.5 py-1.5 rounded-lg border transition hover:brightness-125 ' + (
                                  b.t === 'var' ? 'bg-orange-500/16 border-orange-500/45 text-orange-300'
                                  : b.t === 'ref' ? 'bg-violet-500/16 border-violet-400/45 text-violet-300'
                                  : b.t === 'num' ? 'bg-blue-500/14 border-blue-400/40 text-blue-300'
                                  : 'bg-gray-800 border-gray-600 text-gray-300')}>
                                {b.t === 'op' ? SIGNO[String(b.v)] : String(b.v)}
                              </button>
                            ))}
                      </div>
                      <button onClick={() => setDef(d => ({ ...d, resultados: d.resultados.map((x, k) => k === i ? { ...x, formula: x.formula.slice(0, -1) } : x) }))}
                        className="text-gray-500 hover:text-white bg-gray-800 border border-gray-700 rounded-lg w-8 h-8 shrink-0">⌫</button>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <Paleta etiqueta="Campos del test" vacio="Añade algún campo arriba">
                        {def.campos.filter(c => c.clave).map(c => (
                          <BotonBloque key={c.clave} clase="bg-orange-500/16 border-orange-500/45 text-orange-300"
                            onClick={() => addBloque(i, { t: 'var', v: c.clave })}>{c.clave}</BotonBloque>
                        ))}
                      </Paleta>
                      {previos.length > 0 && (
                        <Paleta etiqueta="Resultados anteriores — encadenar">
                          {previos.map(p => (
                            <BotonBloque key={p.nombre} clase="bg-violet-500/16 border-violet-400/45 text-violet-300"
                              onClick={() => addBloque(i, { t: 'ref', v: p.nombre })}>{p.nombre}</BotonBloque>
                          ))}
                        </Paleta>
                      )}
                      <Paleta etiqueta="Operaciones">
                        {OPS.map(o => (
                          <BotonBloque key={o} clase="bg-gray-800 border-gray-600 text-gray-300"
                            onClick={() => addBloque(i, { t: 'op', v: o })}>{SIGNO[o]}</BotonBloque>
                        ))}
                      </Paleta>
                      <CajaNumero onAdd={n => addBloque(i, { t: 'num', v: n })} />
                    </div>

                    {mal && <p className="text-red-300 text-xs mt-3">{mal}</p>}
                  </div>
                )
              })}

              <button onClick={addResultado} className={btnSec}>+ Añadir resultado</button>
            </div>

            <Prueba def={def} />

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={guardarTest} disabled={!sePuedeGuardar(def) || guardando} className={btn}>
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear test'}
              </button>
              <button onClick={() => setVista('lista')} className={btnSec}>Cancelar</button>
              {pegas.length > 0 && (
                <span className="text-red-300 text-xs">
                  {pegas.filter(p => p.donde === 'test').map(p => p.texto).join(' · ') ||
                    pegas.length + ' cosa' + (pegas.length === 1 ? '' : 's') + ' por arreglar arriba'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ═════════ PASÁRSELO A UN ATLETA ═════════ */}
        {vista === 'atleta' && testActivo && (
          <div className="flex flex-col gap-4">
            <div className={tarjeta}>
              <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
                <div>
                  <p className="font-bold text-[15px]">{testActivo.nombre}</p>
                  <p className="text-gray-500 text-xs">{testActivo.deporte}</p>
                </div>
                <div style={{ minWidth: 190 }}>
                  <label className={lab}>Deportista</label>
                  <select className={campo} value={depActivo ?? ''} onChange={e => cambiarDeportista(Number(e.target.value))}>
                    {deportistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 flex-wrap items-end">
                {testActivo.def.campos.map(c => (
                  <div key={c.clave} style={{ maxWidth: 200, flex: 1 }}>
                    <label className={lab}>{c.etiqueta || c.clave}</label>
                    <input className={campo} type="number" step="any" value={entrada[c.clave] ?? ''}
                      onChange={e => setEntrada(x => ({ ...x, [c.clave]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ maxWidth: 160 }}>
                  <label className={lab}>Fecha</label>
                  <input className={campo} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                </div>
                <button onClick={guardarMedicion} disabled={guardando || !depActivo} className={btn}>
                  {guardando ? 'Guardando…' : 'Guardar medición'}
                </button>
              </div>

              <Sale def={testActivo.def} datos={entrada} />
            </div>

            {depActivo && (
              <FijarConEsto def={testActivo.def} idDefinicion={testActivo.id} idDeportista={depActivo}
                datos={entrada} fecha={fecha} avisar={decir} />
            )}

            <Graficas def={testActivo.def} mediciones={mediciones} />
            <Historial def={testActivo.def} mediciones={mediciones} />
          </div>
        )}
      </div>
    </main>
  )
}

// ============================================================
// Trozos de pantalla
// ============================================================

/**
 * Qué va a poder hacer este resultado, dicho al crearlo y no meses después.
 *
 * SON DOS COSAS DISTINTAS y la línea tiene que dejarlo claro: colgarle TUS
 * zonas lo puede hacer cualquier referencia; ocupar la casilla de la app -la
 * VAM, el FTP, el CSS- solo la que mida esa misma magnitud.
 */
function Cabe({ deporte, r }: { deporte: string; r: ResultadoTest }) {
  /* EL CASO POR DEFECTO TAMBIÉN SE EXPLICA. «Solo seguimiento» es lo que sale
     sin tocar nada, así que el camino más normal -creas un resultado y no bajas
     el desplegable- daba algo que no sirve para colgar zonas sin decirlo en
     ninguna parte: te enterabas en la otra pantalla, al encontrar el hueco
     vacío. Callarse aquí era callarse justo donde había que hablar. */
  if (tipoDeAncla(r.ancla) === 'seguimiento') {
    return (
      <p className="text-gray-500 text-[11px] mt-1.5 leading-snug">
        ◦ Solo para su gráfica. Para colgarle zonas, márcalo como referencia.
      </p>
    )
  }
  const v = puedeFijar(deporte, r)
  return v.destino
    ? <p className="text-green-300/80 text-[11px] mt-1.5 leading-snug">⚓ Podrás colgarle zonas y además fijar su {v.destino.nombre}.</p>
    : <p className="text-violet-300/75 text-[11px] mt-1.5 leading-snug">
        ◈ Podrás colgarle zonas propias. <span className="text-gray-500">{v.motivo}</span>
      </p>
}

/**
 * Que un resultado propio ocupe la casilla de la app: su VAM, su FTP, su CSS.
 *
 * ES EL CAMINO ESTRECHO, no el único. Una referencia que no cabe aquí no es una
 * referencia peor: es que sus zonas las cuelga el entrenador en Zonas propias,
 * y eso no pasa por esta pantalla ni tiene estas restricciones.
 *
 * FIJAR ES UNA ACCIÓN APARTE DE GUARDAR LA MEDICIÓN, igual que en los tests de
 * serie: guardar deja constancia de lo que hizo el atleta; fijar cambia los
 * ritmos que va a entrenar las próximas semanas. Un test puede salir mal —venía
 * tocado, la pista mojada— y que eso reescriba sus zonas en silencio sería el
 * peor fallo posible de esta pantalla.
 *
 * Y ESCRIBE EN LAS TABLAS DE SIEMPRE, no en una suya. Es todo el sentido de
 * esto: el número tiene que llegar a donde ya miran las zonas, la ficha y el
 * editor de sesión. Es lo único de `/tests-propios` que sale de su carpeta, y
 * lo hace añadiendo filas, no cambiando nada.
 */
function FijarConEsto({ def, idDefinicion, idDeportista, datos, fecha, avisar }: {
  def: DefinicionTest
  idDefinicion: number
  idDeportista: number
  datos: Record<string, string>
  fecha: string
  avisar: (tipo: 'ok' | 'mal', texto: string) => void
}) {
  const [ocupado, setOcupado] = useState<number | null>(null)
  const referencias = referenciasDe(def)
  if (!referencias.length) return null

  /* Separadas, y cada grupo con el peso que le toca. Las que pueden ocupar la
     casilla de la app llevan un botón que cambia los ritmos del atleta: eso
     merece su recuadro. Las demás son igual de válidas pero no hay nada que
     pulsar aquí, así que van en una línea y no en tres tarjetas repitiendo lo
     mismo. El porqué de cada una ya se dijo al crear el test. */
  const conCasilla = referencias.filter(h => puedeFijar(def.deporte, h.resultado).destino)
  const soloTuyas = referencias.filter(h => !puedeFijar(def.deporte, h.resultado).destino)

  const fijar = async (indice: number) => {
    const p = propuestaPropia(def, indice, datos)
    if (!p) return
    setOcupado(indice)
    const r = await fijarZonas(supabase, idDeportista, fecha, p, origenDe(idDefinicion))
    setOcupado(null)
    if (r.error) { avisar('mal', r.error); return }
    avisar('ok', p.destino.nombre + ' fijado en ' + p.texto + '. Sus zonas de ' +
      def.deporte.toLowerCase() + ' ya salen de aquí.' +
      (r.sinOrigen ? ' (No ha quedado apuntado de qué test salió.)' : ''))
  }

  return (
    <div className="flex flex-col gap-3">
      {soloTuyas.length > 0 && (
        /* Ni «no se puede» ni un aviso en ámbar: son referencias suyas
           perfectamente buenas y lo único que cambia es de dónde cuelgan sus
           zonas. Escrito como un fallo, el entrenador dejaría de usarlas. */
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-4 py-3 text-[12.5px] leading-snug">
          <span className="text-violet-300">◈ </span>
          {soloTuyas.map((h, k) => (
            <span key={h.indice} title={puedeFijar(def.deporte, h.resultado).motivo ?? ''}>
              {k > 0 && ', '}
              <span className="font-mono text-violet-300">{h.resultado.nombre}</span>
            </span>
          ))}
          <span className="text-gray-400">
            {soloTuyas.length === 1 ? ' es una referencia tuya' : ' son referencias tuyas'}.
            Cuélgales zonas en <span className="text-gray-300">Herramientas → Zonas propias</span>.
          </span>
        </div>
      )}

      {conCasilla.map(h => {
        const v = puedeFijar(def.deporte, h.resultado)
        const p = propuestaPropia(def, h.indice, datos)
        return (
          <div key={h.indice} className="rounded-xl border border-blue-900/50 bg-blue-950/25 p-4 flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-sm text-gray-300">
                Usar <span className="font-mono text-gray-400">{h.resultado.nombre}</span> como su{' '}
                <span className="font-semibold text-blue-300">{v.destino!.nombre}</span>
                <span className="text-gray-500"> (estimado)</span>
              </span>
              {p && <span className="text-blue-300 font-bold tabular-nums">{p.texto}</span>}
            </div>
            {p ? (
              <>
                <button onClick={() => fijar(h.indice)} disabled={ocupado !== null}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
                  {ocupado === h.indice ? 'Guardando…' : 'Fijar sus zonas de ' + def.deporte.toLowerCase()}
                </button>
                <p className="text-gray-500 text-[11px] leading-snug">
                  Cambia los ritmos que va a entrenar. Guardar la medición no hace esto solo.
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-xs leading-snug">
                Rellena los datos de arriba y sale el número que se guardaría.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Paleta({ etiqueta, vacio, children }: { etiqueta: string; vacio?: string; children: React.ReactNode }) {
  const hay = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div>
      <span className="block text-gray-500 text-[10.5px] uppercase tracking-wider mb-1.5">{etiqueta}</span>
      <div className="flex gap-1.5 flex-wrap items-center">
        {hay ? children : <span className="text-gray-600 text-xs">{vacio}</span>}
      </div>
    </div>
  )
}

function BotonBloque({ clase, onClick, children }: { clase: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={'font-mono text-[13px] font-semibold px-2.5 py-1.5 rounded-lg border transition hover:brightness-125 hover:-translate-y-px ' + clase}>
      {children}
    </button>
  )
}

/** Un número cualquiera para la fórmula. */
function CajaNumero({ onAdd }: { onAdd: (n: number) => void }) {
  const [v, setV] = useState('200')
  const meter = () => { const n = Number(v); if (v !== '' && Number.isFinite(n)) onAdd(n) }
  return (
    <Paleta etiqueta="Un número">
      <input className="bg-gray-800 text-white text-xs rounded-lg px-2.5 py-2 w-24 outline-none focus:ring-1 focus:ring-orange-500"
        type="number" step="any" value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') meter() }} />
      <BotonBloque clase="bg-blue-500/14 border-blue-400/40 text-blue-300" onClick={meter}>+ añadir</BotonBloque>
    </Paleta>
  )
}

/** La prueba del editor: se ve el resultado antes de guardar nada. */
function Prueba({ def }: { def: DefinicionTest }) {
  const [datos, setDatos] = useState<Record<string, string>>({})
  if (!def.campos.length || !def.resultados.length) return null
  const vals = calcularResultados(def, datos)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="text-gray-500 text-[11px] uppercase tracking-wider mb-3">Pruébalo antes de guardarlo</p>
      <div className="flex gap-3 flex-wrap mb-4">
        {def.campos.map(c => (
          <div key={c.clave} style={{ maxWidth: 150 }}>
            <label className="block text-gray-400 text-[11.5px] mb-1 font-mono">{c.clave}</label>
            <input className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 w-full outline-none focus:ring-1 focus:ring-orange-500"
              type="number" step="any" value={datos[c.clave] ?? ''}
              onChange={e => setDatos(d => ({ ...d, [c.clave]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {def.resultados.map((r, i) => (
          <div key={i} className="flex justify-between items-baseline gap-3 text-sm">
            <span className="font-mono text-gray-400">{r.nombre}</span>
            <span className={vals[i].error ? 'text-red-300 text-xs' : 'text-green-300 font-semibold tabular-nums'}>
              {vals[i].error ? '⚠ ' + vals[i].error : nEs(vals[i].valor as number) + ' ' + r.unidad}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Lo que sale de lo que acabas de teclear, antes de guardarlo. */
function Sale({ def, datos }: { def: DefinicionTest; datos: Record<string, string> }) {
  const vals = calcularResultados(def, datos)
  const algo = Object.values(datos).some(v => String(v).trim() !== '')
  if (!algo) return null
  return (
    <div className="mt-4 pt-4 border-t border-gray-800 flex gap-6 flex-wrap">
      {def.resultados.map((r, i) => (
        <div key={i}>
          <div className="text-gray-500 text-[11px]">{r.nombre}</div>
          <div className={vals[i].error ? 'text-red-300 text-xs mt-0.5' : 'text-green-300 text-xl font-bold tabular-nums'}>
            {vals[i].error ? '⚠ ' + vals[i].error : nEs(vals[i].valor as number)}
            {!vals[i].error && <span className="text-gray-400 text-sm font-normal"> {r.unidad}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Una gráfica por resultado, y no todas en la misma.
 *
 * La VAM va en km/h y el ritmo en min/km: en un eje común la línea del ritmo
 * sería una raya plana pegada al suelo y no compararía nada.
 */
function Graficas({ def, mediciones }: { def: DefinicionTest; mediciones: Medicion[] }) {
  const series = seriesDe(def, mediciones)
  const conDatos = series.filter(s => s.puntos.length >= 2)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="font-bold text-[15px] mb-0.5">Cómo va con el tiempo</p>
      <p className="text-gray-500 text-xs mb-4">Una por resultado: cada uno tiene su unidad y no se pueden mezclar en un eje.</p>
      {conDatos.length === 0 ? (
        <p className="text-gray-600 text-sm italic">
          {mediciones.length < 2
            ? 'Con una sola medición no hay tendencia que dibujar. Guarda otra con distinta fecha.'
            : 'Ningún resultado está marcado para gráfica.'}
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          {conDatos.map((s, i) => <Grafica key={s.nombre} s={s} idx={i} />)}
        </div>
      )}
    </div>
  )
}

function Grafica({ s, idx }: { s: SerieResultado; idx: number }) {
  const vs = s.puntos.map(p => p.valor)
  let min = Math.min(...vs), max = Math.max(...vs)
  if (max === min) { max = min + 1; min = min - 1 }
  const pad = (max - min) * 0.15; min -= pad; max += pad

  const W = 260, H = 84
  const x = (n: number) => (n / (s.puntos.length - 1)) * (W - 8) + 4
  const y = (v: number) => H - 14 - ((v - min) / (max - min)) * (H - 26)
  const linea = s.puntos.map((p, n) => `${n ? 'L' : 'M'}${x(n).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')
  const area = `${linea} L${x(s.puntos.length - 1).toFixed(1)},${H - 14} L${x(0).toFixed(1)},${H - 14} Z`

  const bien = s.mejora !== false
  const col = s.mejora === null ? '#9ca3af' : bien ? '#4ade80' : '#f87171'
  const ult = s.puntos[s.puntos.length - 1]

  return (
    <div className="bg-[#161f2e] border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-xs font-bold">{s.nombre} <span className="text-gray-500 font-normal">{s.unidad}</span></span>
        <span className="font-mono text-[15px] font-bold tabular-nums">{nEs(ult.valor)}</span>
      </div>
      <div className="text-[11px] tabular-nums" style={{ color: col }}>
        {s.delta === null || s.delta === 0 ? 'igual que la anterior'
          : (s.delta > 0 ? '+' : '') + nEs(s.delta) + ' · ' + (s.mejora ? 'mejor' : 'peor')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block mt-2" style={{ height: 84, overflow: 'visible' }}
        role="img" aria-label={`Evolución de ${s.nombre}: ${s.puntos.map(p => nEs(p.valor)).join(', ')}`}>
        <defs>
          <linearGradient id={'g' + idx} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity=".22" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#g${idx})`} />
        <path d={linea} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {s.puntos.map((p, n) => (
          <circle key={n} cx={x(n).toFixed(1)} cy={y(p.valor).toFixed(1)} r={n === s.puntos.length - 1 ? 3.4 : 2}
            fill={n === s.puntos.length - 1 ? col : '#030712'} stroke={col} strokeWidth="1.4" />
        ))}
        <text x="2" y={H - 2} className="fill-gray-600" style={{ fontSize: 9.5 }}>{s.puntos[0].fecha.slice(5)}</text>
        <text x={W - 2} y={H - 2} textAnchor="end" className="fill-gray-600" style={{ fontSize: 9.5 }}>{ult.fecha.slice(5)}</text>
      </svg>
    </div>
  )
}

/**
 * El historial recalcula los resultados desde los campos guardados.
 *
 * Por eso corregir una fórmula corrige el pasado entero: lo que se guardó fue
 * lo que midió el atleta, no lo que la fórmula de aquel día dijo.
 */
function Historial({ def, mediciones }: { def: DefinicionTest; mediciones: Medicion[] }) {
  if (!mediciones.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <p className="font-bold text-[15px] mb-1">Historial</p>
        <p className="text-gray-600 text-sm italic">Todavía no hay mediciones de este atleta.</p>
      </div>
    )
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="font-bold text-[15px] mb-3">Historial</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-700">
              <th className="text-left py-2 px-2">Fecha</th>
              {def.campos.map(c => <th key={c.clave} className="text-left py-2 px-2 font-mono normal-case">{c.clave}</th>)}
              {def.resultados.map(r => <th key={r.nombre} className="text-left py-2 px-2 font-mono normal-case">{r.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {mediciones.map(m => {
              const vals = calcularResultados(def, m.datos)
              return (
                <tr key={m.fecha} className="border-b border-gray-800/70">
                  <td className="py-2 px-2 text-gray-500 tabular-nums">{m.fecha}</td>
                  {def.campos.map(c => <td key={c.clave} className="py-2 px-2 text-gray-300 tabular-nums">{String(m.datos[c.clave] ?? '—')}</td>)}
                  {vals.map((v, i) => (
                    <td key={i} className="py-2 px-2 font-semibold tabular-nums">
                      {v.error ? <span className="text-red-300/70 font-normal text-xs">—</span>
                        : nEs(v.valor as number) + ' ' + def.resultados[i].unidad}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
