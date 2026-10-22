'use client'
// ============================================================
// La pestaña «Movimiento» de Tests: el FMS y el Nine Test
// ============================================================
//
// Los tests que se valoran mirando el movimiento. Se eligen igual que los de
// crono: el test, y luego cómo se pasa —analizando el vídeo o a mano—. Después,
// la batería prueba a prueba: cada una se abre en el visor (components/
// movimiento/Analizador) o se puntúa en la propia lista.
//
// Las pruebas se pueden pasar sueltas y en cualquier orden; el total sale
// cuando están todas. Las reglas, en lib/baterias-movimiento.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { BATERIAS, NOMBRE_VISTA, resultadoBateria, textoTotal, type Bateria, type Lado, type Prueba } from '@/lib/baterias-movimiento'
import {
  cargarValoraciones, crearValoracion, guardarPrueba, marcarPermiso, urlsFotogramas,
  type FilaPrueba, type Valoracion,
} from '@/lib/movimiento-datos'
import { fechaLarga, hoyISO } from '@/lib/fechas'
import AnalisisLibres from './AnalisisLibres'
import Analizador from './Analizador'
import InformeMovimiento from './InformeMovimiento'
import ResultadoMovimiento from './ResultadoMovimiento'
import { AntesDeEmpezar, FichaPrueba, MaterialCorto } from './FichaPrueba'

const REGLAS_GRABAR = [
  ['Con la cámara del móvil', 'y el vídeo se elige como archivo. La app no abre la cámara.'],
  ['Móvil quieto y recto', 'en trípode o apoyado, a la altura de la cadera y a unos 3 m. Activa el nivel de la cámara: si sale torcido, se corrige marcando el suelo.'],
  ['El cuerpo entero en el encuadre', 'con los pies y el suelo a la vista.'],
  ['De perfil o de frente', 'según lo que pida cada prueba.'],
  ['Descalzo y con ropa ajustada', 'para ver rodillas y cadera.'],
  ['Tres intentos y vale el mejor.', 'En las de dos lados, primero el izquierdo, y cuenta el peor.'],
  ['Si duele, es un 0', 'y no hace falta vídeo.'],
] as const

export default function PestanaMovimiento({ idDeportista, deportista, onPermiso, abrirLibre }: {
  idDeportista: number
  /** De la ficha solo hace falta su nombre (para el informe) y si dio permiso para guardar la imagen. */
  deportista: { nombre?: string | null; permiso_fotogramas_en?: string | null } | null
  /** El permiso cambiado, para que la ficha lo tenga sin volver a cargar. */
  onPermiso: (en: string | null) => void
  /** Un análisis libre que abrir al llegar (desde «Análisis sueltos» o recién creada una persona externa). */
  abrirLibre?: { id: number; analizar: boolean } | null
}) {
  const [bateria, setBateria] = useState<Bateria | null>(null)
  const [valoraciones, setValoraciones] = useState<Valoracion[]>([])
  const [pruebas, setPruebas] = useState<FilaPrueba[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [activaId, setActivaId] = useState<number | null>(null)
  const [verId, setVerId] = useState<number | null>(null)
  /** La valoración cuyo informe está abierto (components/movimiento/InformeMovimiento). */
  const [informeId, setInformeId] = useState<number | null>(null)
  const [abierta, setAbierta] = useState<{ prueba: Prueba; lado: Lado } | null>(null)
  const [aMano, setAMano] = useState<string | null>(null)
  const [verProtocolo, setVerProtocolo] = useState(false)
  /* Cómo se hace cada prueba (components/movimiento/FichaPrueba): la ficha
     abierta en la lista, y el material en el lateral con la batería en marcha. */
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null)
  const [verMaterial, setVerMaterial] = useState(false)
  /** Cada pulsación de «＋ Análisis libre» de arriba: abre su diálogo (components/movimiento/AnalisisLibres). */
  const [pedirNuevoLibre, setPedirNuevoLibre] = useState(0)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const permiso = !!deportista?.permiso_fotogramas_en

  const cargar = useCallback(async () => {
    const d = await cargarValoraciones(supabase, idDeportista)
    if (d.error) setError('No se han podido cargar sus valoraciones: ' + d.error)
    setValoraciones(d.valoraciones)
    setPruebas(d.pruebas)
    setUrls(await urlsFotogramas(supabase, d.pruebas.map(p => p.fotograma || '')))
  }, [idDeportista])

  /* La regla ve una llamada que acaba en setState; el estado se pone DESPUÉS de
     que conteste la base, que es el caso que ella misma admite. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  const def = bateria ? BATERIAS[bateria] : null
  const deLaBateria = useMemo(() => valoraciones.filter(v => v.bateria === bateria), [valoraciones, bateria])
  const regsDe = useCallback((idVal: number) => pruebas.filter(p => p.id_valoracion === idVal), [pruebas])
  const activa = valoraciones.find(v => v.id === activaId) || null
  const vista = valoraciones.find(v => v.id === verId) || null
  const informe = valoraciones.find(v => v.id === informeId) || null
  const incompleta = def ? deLaBateria.find(v => !resultadoBateria(def, regsDe(v.id)).completa) || null : null
  const ultima = def ? deLaBateria.find(v => resultadoBateria(def, regsDe(v.id)).completa) || null : null

  /** La anterior de la misma batería, para comparar. */
  const previaDe = (v: Valoracion) => {
    const i = deLaBateria.findIndex(x => x.id === v.id)
    const p = i >= 0 ? deLaBateria.slice(i + 1).find(x => def && resultadoBateria(def, regsDe(x.id)).completa) : null
    return p ? { valoracion: p, registros: regsDe(p.id) } : null
  }

  const elegirBateria = (b: Bateria) => {
    setBateria(bateria === b ? null : b)
    setActivaId(null); setVerId(null); setInformeId(null); setAMano(null); setError('')
  }

  /* «＋ Análisis libre»: fuera la batería, y que se abra su diálogo. */
  const nuevoLibre = () => {
    setBateria(null); setActivaId(null); setVerId(null); setInformeId(null); setAMano(null); setError('')
    setPedirNuevoLibre(n => n + 1)
  }

  /* Empezar: si la de hoy ya existe, se sigue; si no, se crea una nueva. */
  const empezar = async (modo: 'video' | 'mano') => {
    if (!bateria) return
    const deHoy = deLaBateria.find(v => v.fecha === hoyISO())
    if (deHoy) {
      /* La de hoy, pero como se ha elegido ahora: empezarla a mano y seguirla
         en vídeo es normal (unas pruebas se graban y otras no). */
      if (deHoy.modo !== modo) {
        await supabase.from('valoracion_movimiento').update({ modo }).eq('id', deHoy.id)
        setValoraciones(vs => vs.map(v => v.id === deHoy.id ? { ...v, modo } : v))
      }
      setActivaId(deHoy.id)
      return
    }
    setOcupado(true); setError('')
    const r = await crearValoracion(supabase, idDeportista, bateria, modo)
    setOcupado(false)
    if (r.error || !r.valoracion) { setError('No se ha podido empezar: ' + (r.error || '')); return }
    setValoraciones(vs => [r.valoracion!, ...vs])
    setActivaId(r.valoracion.id)
  }

  const cambiarPermiso = async (si: boolean) => {
    setOcupado(true)
    const yo = await usuarioActual()
    const r = await marcarPermiso(supabase, idDeportista, si, yo?.id ?? null)
    setOcupado(false)
    if (r.error) { setError('No se ha podido cambiar el permiso: ' + r.error); return }
    onPermiso(si ? new Date().toISOString() : null)
  }

  /* A mano: la nota de un lado (o «duele») se guarda al pulsar. */
  const notaAMano = async (prueba: string, lado: Lado, nota: number | null, dolor: boolean) => {
    if (!activa) return
    setOcupado(true)
    const r = await guardarPrueba(supabase, { idValoracion: activa.id, idDeportista, prueba, lado, nota, dolor })
    setOcupado(false)
    if (r.error) { setError('No se ha podido guardar: ' + r.error); return }
    cargar()
  }

  const regsActiva = activa ? regsDe(activa.id) : []
  const res = def && activa ? resultadoBateria(def, regsActiva) : null

  return (
    <div className="flex flex-col gap-4">
      {/* ── los tests de la pestaña ── */}
      <div>
        <p className="text-[10.5px] font-semibold tracking-widest uppercase text-gray-500 mb-2">
          Tests de movimiento <span className="text-orange-400">2</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(BATERIAS) as Bateria[]).map(b => (
            <button key={b} onClick={() => elegirBateria(b)}
              className={'px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 border ' + (bateria === b
                ? 'bg-orange-500/15 border-orange-500/45 text-orange-400 font-semibold'
                : 'bg-white/[0.035] border-white/[0.075] text-gray-400 hover:text-white hover:bg-white/[0.075]')}>
              <span className={'w-1.5 h-1.5 rounded-full ' + (bateria === b ? 'bg-current' : 'bg-sky-300')} />
              {BATERIAS[b].nombre}
            </button>
          ))}
          <button onClick={nuevoLibre}
            className="px-3 py-2 rounded-lg text-sm font-medium transition border border-dashed border-sky-300/45 bg-sky-300/[0.06] text-sky-300 hover:text-white">
            ＋ Análisis libre
          </button>
        </div>
        <div className="flex gap-4 flex-wrap text-[11.5px] text-gray-500 mt-2">
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />con crono: se dirige en vivo</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-sky-300" />de vídeo: se analiza sobre el fotograma</span>
        </div>
      </div>

      {error && <div className="bg-red-900/60 border border-red-500/60 text-red-200 px-4 py-3 rounded-lg text-sm" role="alert">{error}</div>}

      {!def && (
        <p className="text-[13px] text-gray-500">Elige el FMS o el Nine Test. Las dos baterías se pasan grabando cada prueba con el móvil y puntuándola sobre el fotograma, o a mano si ya la pasaste en directo. O un análisis libre, para mirar lo que quieras sin criterios ni nota.</p>
      )}

      {/* Los análisis libres: su lista se ve sin batería elegida; lo abierto se conserva. */}
      <AnalisisLibres idDeportista={idDeportista} nombre={deportista?.nombre ?? null} permiso={permiso}
        mostrar={!def} pedirNuevo={pedirNuevoLibre} abrir={abrirLibre ?? null} />

      {def && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="flex flex-col gap-4 min-w-0">
            {/* ── antes de empezar: el material de toda la batería y cómo se pasa ── */}
            {!activa && !vista && <AntesDeEmpezar def={def} />}

            {/* ── empezar ── */}
            {!activa && !vista && (
              <div className="tp-card p-4">
                <p className="text-[13.5px] font-semibold">¿Cómo vas a pasar el {def.nombre}?</p>
                <p className="text-[11.5px] text-gray-500 mt-0.5 mb-3">Las pruebas se pueden pasar sueltas y en cualquier orden; el total sale cuando están todas.</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <button onClick={() => empezar('video')} disabled={ocupado}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-orange-500/40 p-4 text-left transition disabled:opacity-50">
                    <p className="text-[15px] font-bold">🎥 Analizar en vídeo</p>
                    <p className="text-[12px] text-gray-400 mt-1 leading-snug">Grabas cada prueba con el móvil, la eliges y la puntúas sobre el fotograma. El vídeo no se guarda.</p>
                  </button>
                  <button onClick={() => empezar('mano')} disabled={ocupado}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-orange-500/40 p-4 text-left transition disabled:opacity-50">
                    <p className="text-[15px] font-bold">✍️ A mano</p>
                    <p className="text-[12px] text-gray-400 mt-1 leading-snug">Ya lo pasaste en directo: metes la nota de cada prueba y la app suma.</p>
                  </button>
                </div>
                {incompleta && incompleta.fecha !== hoyISO() && (
                  <button onClick={() => setActivaId(incompleta.id)} className="mt-3 text-[12.5px] text-orange-300 hover:text-orange-200 underline decoration-dotted underline-offset-4">
                    Seguir la del {fechaLarga(incompleta.fecha).toLowerCase()} ({textoTotal(resultadoBateria(def, regsDe(incompleta.id)))})
                  </button>
                )}
              </div>
            )}

            {/* ── cómo se hace cada prueba, para leerlo antes de empezar ── */}
            {!activa && !vista && (
              <div className="tp-card p-4 flex flex-col gap-2">
                <div>
                  <p className="text-[13.5px] font-semibold">Cómo se hace cada prueba</p>
                  <p className="text-[11.5px] text-gray-500 mt-0.5">Material, preparación, lo que se le dice y cómo se graba. Sale también al pasarla.</p>
                </div>
                {def.pruebas.map((p, i) => (
                  <details key={p.clave} className="group rounded-xl border border-white/[0.07] bg-white/[0.02]">
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-2.5 flex items-center gap-2.5 text-[13px]">
                      <span className="font-mono text-[11.5px] text-gray-500 w-4">{i + 1}</span>
                      <span className="min-w-0 flex-1">{p.nombre}</span>
                      <span className="hidden sm:flex gap-1">
                        {p.vistas.map(v => <span key={v} className="text-[10.5px] px-2 py-0.5 rounded-full bg-sky-300/10 text-sky-300 whitespace-nowrap">{NOMBRE_VISTA[v]}</span>)}
                      </span>
                      <span className="text-[11.5px] text-orange-300 whitespace-nowrap">Cómo se hace <span className="group-open:hidden">▾</span><span className="hidden group-open:inline">▴</span></span>
                    </summary>
                    <div className="px-3 pb-3"><FichaPrueba prueba={p} dolor={def.dolores.find(d => d.clave === p.dolor) ?? null} /></div>
                  </details>
                ))}
              </div>
            )}

            {/* ── la batería, prueba a prueba ── */}
            {activa && res && (
              <div className="tp-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <p className="text-[14px] font-bold">{def.nombre} · {fechaLarga(activa.fecha).toLowerCase()} <span className="text-[12px] font-normal text-gray-500">· {activa.modo === 'video' ? 'en vídeo' : 'a mano'}</span></p>
                  <span className="text-[11.5px] text-gray-500">Cada prueba de 0 a 3. En las de dos lados cuenta la peor; si duele, 0.</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {def.pruebas.map((p, i) => {
                    const n = res.porPrueba[p.clave]
                    const regs = regsActiva.filter(r => r.prueba === p.clave)
                    const conFoto = regs.some(r => r.fotograma)
                    const dolorDe = def.dolores.find(d => d.clave === p.dolor)
                    const abrir = () => {
                      if (activa.modo === 'mano') { setAMano(aMano === p.clave ? null : p.clave); return }
                      const falta: Lado = p.bilateral ? (regs.some(r => r.lado === 'izq') && !regs.some(r => r.lado === 'der') ? 'der' : 'izq') : 'unico'
                      setAbierta({ prueba: p, lado: falta })
                    }
                    return (
                      <div key={p.clave} className="flex flex-col gap-1.5">
                        <button onClick={abrir}
                          className="grid grid-cols-[22px_minmax(0,1fr)_auto_36px] sm:grid-cols-[22px_minmax(0,1fr)_150px_120px_36px] gap-2.5 items-center rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-orange-500/40 px-3 py-2.5 text-left transition">
                          <span className="font-mono text-[11.5px] text-gray-500">{i + 1}</span>
                          <span className="text-[13px] min-w-0">
                            {p.nombre}
                            {conFoto && <span className="text-[11px] text-gray-500"> · fotograma guardado</span>}
                          </span>
                          <span className="hidden sm:flex gap-1 flex-wrap">
                            {p.vistas.map(v => <span key={v} className="text-[10.5px] px-2 py-0.5 rounded-full bg-sky-300/10 text-sky-300 whitespace-nowrap">{NOMBRE_VISTA[v]}</span>)}
                          </span>
                          <span className={'font-mono text-[11.5px] text-right ' + (n.asimetria ? 'text-amber-300' : 'text-gray-500')}>
                            {p.bilateral ? `izq ${n.izq ?? '—'} · der ${n.der ?? '—'}${n.asimetria ? ' ⚠' : ''}` : n.porDolor ? 'duele' : 'un solo lado'}
                          </span>
                          <span className={'justify-self-end min-w-8 h-8 px-1.5 rounded-lg grid place-items-center font-mono font-bold border border-white/[0.12] bg-gray-900 ' + (n.nota == null ? 'text-gray-600 text-[13px] font-medium' : n.nota === 3 ? 'text-green-400' : n.nota === 2 ? 'text-amber-300' : 'text-red-400')}>
                            {n.nota ?? '—'}
                          </span>
                        </button>

                        {/* Cómo se hace: su ficha, aquí mismo, sin abrir el visor. */}
                        <button type="button" onClick={() => setFichaAbierta(fichaAbierta === p.clave ? null : p.clave)}
                          aria-expanded={fichaAbierta === p.clave}
                          className="self-start ml-8 -mt-0.5 text-[11.5px] text-sky-300/90 hover:text-sky-200">
                          Cómo se hace {fichaAbierta === p.clave ? '▴' : '▾'}
                        </button>
                        {fichaAbierta === p.clave && <div className="ml-6"><FichaPrueba prueba={p} dolor={dolorDe ?? null} /></div>}

                        {/* A mano: la nota de cada lado, aquí mismo. */}
                        {activa.modo === 'mano' && aMano === p.clave && (
                          <div className="ml-6 rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-2">
                            {(p.bilateral ? (['izq', 'der'] as Lado[]) : (['unico'] as Lado[])).map(l => {
                              const g = regs.find(r => r.lado === l)
                              const actual = g ? (g.dolor ? 0 : g.nota) : null
                              return (
                                <div key={l} className="flex flex-wrap items-center gap-2">
                                  <span className="text-[12px] text-gray-400 w-20">{l === 'izq' ? 'Izquierda' : l === 'der' ? 'Derecha' : 'Nota'}</span>
                                  {[3, 2, 1, 0].map(x => (
                                    <button key={x} disabled={ocupado} onClick={() => notaAMano(p.clave, l, x === 0 ? null : x, x === 0)}
                                      title={x === 0 ? 'Duele' : p.notas[x as 3 | 2 | 1]}
                                      className={'w-10 h-9 rounded-lg border font-mono font-bold transition disabled:opacity-50 ' + (actual === x
                                        ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>
                                      {x}
                                    </button>
                                  ))}
                                </div>
                              )
                            })}
                            <p className="text-[11px] text-gray-500 leading-snug">3 · {p.notas[3]} 2 · {p.notas[2]} 1 · {p.notas[1]} 0 · Duele.</p>
                          </div>
                        )}

                        {/* La prueba de dolor que la acompaña (FMS): sí o no, sin vídeo. */}
                        {dolorDe && (
                          <div className="ml-6 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-white/[0.1] px-3 py-2">
                            <span className="text-[12.5px] min-w-0 flex-1">
                              {dolorDe.nombre}
                              <span className="block text-[11px] text-gray-500">{dolorDe.como}</span>
                            </span>
                            {(dolorDe.bilateral ? (['izq', 'der'] as Lado[]) : (['unico'] as Lado[])).map(l => {
                              const g = regsActiva.find(r => r.prueba === dolorDe.clave && r.lado === l)
                              return (
                                <span key={l} className="flex items-center gap-1">
                                  {l !== 'unico' && <span className="text-[11px] text-gray-500">{l === 'izq' ? 'izq' : 'der'}</span>}
                                  {[false, true].map(duele => (
                                    <button key={String(duele)} disabled={ocupado} onClick={() => notaAMano(dolorDe.clave, l, null, duele)}
                                      className={'text-[11.5px] px-2.5 py-1.5 rounded-lg border transition disabled:opacity-50 ' + (g && g.dolor === duele
                                        ? duele ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-green-500/15 border-green-500/40 text-green-300'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>
                                      {duele ? 'duele' : 'no duele'}
                                    </button>
                                  ))}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => setActivaId(null)} className="text-[12.5px] px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">Terminar por hoy</button>
                  {res.completa && (
                    <button onClick={() => { setVerId(activa.id); setActivaId(null) }} className="text-[12.5px] px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold transition">Ver el resultado</button>
                  )}
                  {/* A medias también se puede sacar: el informe dice qué falta. */}
                  {regsActiva.length > 0 && (
                    <button onClick={() => setInformeId(activa.id)} className="text-[12.5px] px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">Ver el informe</button>
                  )}
                </div>
              </div>
            )}

            {/* ── un resultado ── */}
            {vista && (
              <div className="flex flex-col gap-2">
                <ResultadoMovimiento def={def} valoracion={vista} registros={regsDe(vista.id)} previa={previaDe(vista)} urls={urls} />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setVerId(null)} className="text-[12.5px] px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">Volver</button>
                  <button onClick={() => { setActivaId(vista.id); setVerId(null) }} className="text-[12.5px] px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">Corregir una prueba</button>
                  <button onClick={() => setInformeId(vista.id)} className="text-[12.5px] px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold transition">Ver el informe</button>
                </div>
              </div>
            )}

            {/* ── el historial ── */}
            {!activa && !vista && deLaBateria.length > 0 && (
              <div className="tp-card p-4">
                <p className="text-[13.5px] font-semibold mb-2">Sus {def.nombre}</p>
                <div className="flex flex-col">
                  {deLaBateria.map(v => {
                    const r = resultadoBateria(def, regsDe(v.id))
                    return (
                      <button key={v.id} onClick={() => (r.completa ? setVerId(v.id) : setActivaId(v.id))}
                        className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.06] last:border-0 text-left hover:text-white transition">
                        <span className="text-[13px] text-gray-300">{fechaLarga(v.fecha)}<span className="text-gray-500"> · {v.modo === 'video' ? 'en vídeo' : 'a mano'}</span></span>
                        <span className={'font-mono text-[13px] ' + (r.completa ? 'text-white' : 'text-amber-300')}>{textoTotal(r)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── al lado: el total, el permiso y el protocolo ── */}
          <aside className="flex flex-col gap-3">
            {res && activa && (
              <div className="tp-card p-4">
                <p className="text-[13px] font-semibold">Este {def.nombre} {!res.completa && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 ml-1">a medias</span>}</p>
                <p className="font-mono text-3xl font-bold mt-1">{res.total} <span className="text-[15px] text-gray-500">/ {res.maximo}</span></p>
                {!res.completa && <p className="text-[11.5px] text-gray-500">Faltan {res.faltan} pruebas. El total de verdad sale cuando estén todas.</p>}
                {res.asimetrias.length > 0 && <p className="text-[11.5px] text-amber-300 mt-1">⚠ Lados distintos: {res.asimetrias.join(', ')}.</p>}
              </div>
            )}
            {!activa && ultima && (
              <div className="tp-card p-4">
                <p className="text-[12px] text-gray-500">Último {def.nombre} completo</p>
                <p className="font-mono text-2xl font-bold">{textoTotal(resultadoBateria(def, regsDe(ultima.id)))}</p>
                <p className="text-[11.5px] text-gray-500">{fechaLarga(ultima.fecha)}</p>
              </div>
            )}

            <div className="tp-card p-4">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={permiso} disabled={ocupado} onChange={e => cambiarPermiso(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-orange-500" />
                <span className="text-[12.5px] leading-snug">
                  <b>Tengo su permiso para guardar fotogramas</b>
                  <span className="block text-[11.5px] text-gray-500 mt-0.5">El fotograma es una imagen de su cuerpo. Sin el permiso se guardan las notas, pero no la imagen. Sus notas y sus fotogramas le salen en Mis tests.</span>
                </span>
              </label>
            </div>

            {/* Con la batería en marcha, el material sigue a mano (antes de empezar va arriba, entero). */}
            {activa && (
              <div className="tp-card p-4">
                <button onClick={() => setVerMaterial(v => !v)} aria-expanded={verMaterial}
                  className="text-[13px] font-semibold w-full text-left flex justify-between items-center">
                  Lo que necesitas <span className="text-gray-500 text-[12px]">{verMaterial ? '▴' : '▾'}</span>
                </button>
                {verMaterial && <div className="mt-2.5"><MaterialCorto def={def} /></div>}
              </div>
            )}

            <div className="tp-card p-4">
              <button onClick={() => setVerProtocolo(v => !v)} className="text-[13px] font-semibold w-full text-left flex justify-between items-center">
                Cómo se graba <span className="text-gray-500 text-[12px]">{verProtocolo ? '▴' : '▾'}</span>
              </button>
              {verProtocolo && (
                <div className="mt-2.5 flex flex-col gap-3">
                  <ul className="flex flex-col gap-1.5 text-[12px] text-gray-400 list-disc pl-4">
                    {REGLAS_GRABAR.map(([b, t]) => <li key={b}><b className="text-gray-200">{b}</b> {t}</li>)}
                  </ul>
                  <div className="flex flex-col">
                    {def.pruebas.map(p => (
                      <div key={p.clave} className="flex justify-between gap-2 py-1.5 border-b border-white/[0.06] last:border-0 text-[12px]">
                        <span className="text-gray-300 min-w-0">{p.nombre}</span>
                        <span className="text-sky-300 whitespace-nowrap">{p.vistas.map(v => NOMBRE_VISTA[v]).join(' + ')}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500">{def.reglas.join(' ')} Criterios: {def.fuente}</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {abierta && activa && def && (
        <Analizador bateria={def} prueba={abierta.prueba} ladoInicial={abierta.lado} idDeportista={idDeportista}
          valoracion={activa} permiso={permiso}
          guardadas={regsActiva.filter(r => r.prueba === abierta.prueba.clave)} urls={urls}
          onGuardado={cargar} onCerrar={() => setAbierta(null)} />
      )}

      {informe && def && informe.bateria === def.id && (
        <InformeMovimiento def={def} valoracion={informe} registros={regsDe(informe.id)} previa={previaDe(informe)}
          nombre={deportista?.nombre ?? null} permiso={permiso} urls={urls} onCerrar={() => setInformeId(null)} />
      )}
    </div>
  )
}
