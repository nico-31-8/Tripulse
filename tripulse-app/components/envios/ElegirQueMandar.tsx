'use client'
// ============================================================
// Envíos: elegir qué mandar
// ============================================================
// Desde la página Envíos («📨 Mandar algo»): tus plantillas, tus tests y tus
// zonas, y se puede elegir VARIAS, también de pestañas distintas. Con una se
// abre la ventana de siempre; con varias, la misma ventana con todo, y a quien
// lo recibe le llega en un solo envío («varios», supabase/envios-varios.sql).
// Solo lo tuyo: lo que te comparte un director se usa, pero no se manda.
//
// Un test elegido dice qué zonas salen de él, para añadirlas con un toque; unas
// zonas llevan solas el test del que salen.
//
// Las sesiones sueltas no salen aquí: una sesión es de un deportista y de un
// día. Se mandan con su botón, o guardándolas como plantilla.
//
// Un DEPORTISTA va solo: es un traspaso (pasa a la lista del otro), no una
// copia, así que no se junta con nada. Elegirlo quita lo demás, y al revés.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { cargaZona } from '@/lib/zonas'
import { etiquetaDisciplina } from '@/lib/disciplinas'
import type { BloqueP } from '@/lib/plantillas'
import type { QueEnviar, PlantillaQueEnviar, TestQueEnviar, ZonasQueEnviar } from '@/components/EnviarAEntrenador'
import { motivoNoSeManda, testsDeHitos, resultadosDe, casaConBusqueda, zonasDeTest, primerNombre, MAX_VARIOS } from '@/lib/envios'

type Pestana = 'plantilla' | 'test' | 'zonas' | 'deportista'

export interface Opcion {
  clave: string
  nombre: string
  detalle: string
  /** Por qué no se puede mandar; null si se puede. */
  motivo: string | null
  /** El color de la marca de la izquierda: la zona pico, o la primera zona. */
  color: string
  marca: string
  que: QueEnviar
  /** En un test: las zonas que salen de él (sus claves), para ofrecerlas. */
  relacionadas?: { clave: string; nombre: string }[]
  /** Va solo: elegirlo quita lo demás (un deportista). */
  solo?: boolean
}

const PESTANAS: { id: Pestana; titulo: string; vacio: string }[] = [
  { id: 'plantilla', titulo: 'Plantillas', vacio: 'Aún no tienes plantillas propias. Se guardan desde una sesión con «Guardar como plantilla».' },
  { id: 'test', titulo: 'Tests', vacio: 'Aún no tienes tests propios. Se crean en Tests propios o en el Laboratorio.' },
  { id: 'zonas', titulo: 'Zonas', vacio: 'Aún no tienes zonas propias. Se crean en Zonas propias.' },
  { id: 'deportista', titulo: 'Deportistas', vacio: 'Aún no tienes deportistas.' },
]

export type OpcionesQueMandar = Record<Pestana, Opcion[]>

export default function ElegirQueMandar({ onElegir, onCerrar }: { onElegir: (q: QueEnviar) => void; onCerrar: () => void }) {
  const [opciones, setOpciones] = useState<OpcionesQueMandar | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const user = await usuarioActual()
      if (!vivo || !user) return
      /* Solo lo tuyo (id_entrenador = tú): la base deja leer también lo que te
         comparte la dirección, y eso no se manda. */
      /* Los deportistas: los de tu equipo (no los evaluados ni la ficha de un
         grupo), y los traspasos que ya tienes pedidos, para no pedirlos dos veces. */
      const [pl, ts, cs, ds, ps] = await Promise.all([
        supabase.from('plantilla_sesion').select('id, nombre, disciplina, zona, objetivo, bloques')
          .eq('id_entrenador', user.id).order('created_at', { ascending: false }),
        supabase.from('test_definicion').select('id, nombre, deporte, resultados, modelo')
          .eq('id_entrenador', user.id).eq('archivado', false).order('created_at', { ascending: false }),
        supabase.from('zona_clasificacion').select('id, nombre, deporte, hitos')
          .eq('id_entrenador', user.id).eq('archivada', false).order('orden'),
        supabase.from('deportista').select('id, nombre, id_usuario')
          .eq('id_entrenador', user.id).eq('solo_test', false).is('id_grupo', null).order('nombre'),
        supabase.from('envio_entrenador').select('id_deportista, para_nombre')
          .eq('de', user.id).eq('tipo', 'deportista').eq('estado', 'pendiente'),
      ])
      const clasifs = (cs.data || []) as { id: number; nombre: string; deporte: string; hitos: string[] | null }[]
      const { data: zs } = clasifs.length
        ? await supabase.from('zona_entrenador').select('id_clasificacion, sigla, nombre, color, orden')
          .in('id_clasificacion', clasifs.map(c => c.id)).eq('archivada', false).order('orden')
        : { data: [] }
      if (!vivo) return

      const tests = (ts.data || []) as { id: number; nombre: string; deporte: string; resultados: unknown; modelo: unknown }[]
      const zonas = (zs || []) as { id_clasificacion: number; sigla: string; nombre: string; color: string }[]

      const plantillas: Opcion[] = ((pl.data || []) as { id: number; nombre: string; disciplina: string; zona: string; objetivo: string | null; bloques: BloqueP[] }[])
        .map(p => {
          const bloques = Array.isArray(p.bloques) ? p.bloques : []
          return {
            clave: 'p' + p.id, nombre: p.nombre, marca: p.zona, color: cargaZona(p.zona).color,
            detalle: etiquetaDisciplina(p.disciplina) + ' · ' + bloques.length + (bloques.length === 1 ? ' bloque' : ' bloques'),
            motivo: motivoNoSeManda({ tipo: 'plantilla', disciplina: p.disciplina, bloques }),
            que: { tipo: 'plantilla', nombre: p.nombre, disciplina: p.disciplina, objetivo: p.objetivo, bloques },
          }
        })

      const deZonas: Opcion[] = clasifs.map(c => {
        const suyas = zonas.filter(z => z.id_clasificacion === c.id)
        const { nombres, ajenos } = testsDeHitos(c.hitos, tests)
        const cuantas = etiquetaDisciplina(c.deporte) + ' · ' + suyas.length + (suyas.length === 1 ? ' zona' : ' zonas')
        return {
          clave: 'z' + c.id, nombre: c.nombre, marca: suyas[0]?.sigla || '—', color: suyas[0]?.color || '#6b7280',
          detalle: cuantas + (nombres.length ? ' · con ' + (nombres.length === 1 ? 'el test ' : 'los tests ') + nombres.map(n => '«' + n + '»').join(' y ') : ''),
          motivo: motivoNoSeManda({ tipo: 'zonas', zonas: suyas.length, testsAjenos: ajenos }),
          que: {
            tipo: 'zonas', id: c.id, nombre: c.nombre, detalle: cuantas,
            zonas: suyas.map(z => ({ sigla: z.sigla, nombre: z.nombre, color: z.color })), tests: nombres,
          },
        }
      })

      const deTests: Opcion[] = tests.map(t => {
        const lab = !!(t.modelo && typeof t.modelo === 'object')
        const produce = resultadosDe(t).filter(Boolean)
        const detalle = etiquetaDisciplina(t.deporte) + (lab ? ' · del Laboratorio' : '') + ' · produce ' + (produce.join(', ') || 'nada')
        /* Las zonas que salen de él y se pueden mandar. */
        const relacionadas = zonasDeTest(t.id, clasifs)
          .map(c => deZonas.find(o => o.clave === 'z' + c.id))
          .filter((o): o is Opcion => !!o && !o.motivo)
          .map(o => ({ clave: o.clave, nombre: o.nombre }))
        return {
          clave: 't' + t.id, nombre: t.nombre, marca: '🧪', color: '#a78bfa', detalle, relacionadas,
          motivo: motivoNoSeManda({ tipo: 'test' }),
          que: { tipo: 'test', id: t.id, nombre: t.nombre, detalle },
        }
      })

      const pedidos = new Map(((ps.data || []) as { id_deportista: number; para_nombre: string | null }[])
        .map(p => [Number(p.id_deportista), p.para_nombre]))
      const deportistas: Opcion[] = ((ds.data || []) as { id: number; nombre: string; id_usuario: string | null }[]).map(d => {
        const detalle = d.id_usuario ? 'Con cuenta: también tendrá que aceptarlo' : 'Ficha sin cuenta: basta con que acepte el otro'
        return {
          clave: 'd' + d.id, nombre: d.nombre, marca: '👤', color: '#7dd3fc', detalle, solo: true,
          motivo: pedidos.has(d.id) ? 'Ya has pedido su traspaso a ' + (primerNombre(pedidos.get(d.id)) || 'otro entrenador') + ': lo ves en Enviados' : null,
          que: { tipo: 'deportista', id: d.id, nombre: d.nombre, tieneCuenta: !!d.id_usuario, detalle: d.id_usuario ? 'Con cuenta en TRIPULSE' : 'Ficha sin cuenta' },
        }
      })

      setOpciones({ plantilla: plantillas, test: deTests, zonas: deZonas, deportista: deportistas })
    })()
    return () => { vivo = false }
  }, [])

  return <ElegirQueMandarVista opciones={opciones} onElegir={onElegir} onCerrar={onCerrar} />
}

/** Con una elegida, esa; con varias, unos «varios» con todas. Un deportista va solo. */
export function queDeLasElegidas(elegidas: Opcion[]): QueEnviar | null {
  if (!elegidas.length) return null
  const solo = elegidas.find(o => o.solo)
  if (solo) return solo.que
  if (elegidas.length === 1) return elegidas[0].que
  const plantillas: PlantillaQueEnviar[] = [], tests: TestQueEnviar[] = [], zonas: ZonasQueEnviar[] = []
  for (const { que } of elegidas) {
    if (que.tipo === 'plantilla') plantillas.push({ nombre: que.nombre, disciplina: que.disciplina, objetivo: que.objetivo, bloques: que.bloques })
    else if (que.tipo === 'test') tests.push({ id: que.id, nombre: que.nombre, detalle: que.detalle })
    else if (que.tipo === 'zonas') zonas.push({ id: que.id, nombre: que.nombre, detalle: que.detalle, zonas: que.zonas, tests: que.tests })
  }
  return { tipo: 'varios', plantillas, tests, zonas }
}

/** La ventana en sí, con las opciones que le den (null = cargando). */
export function ElegirQueMandarVista({ opciones, onElegir, onCerrar }: {
  opciones: OpcionesQueMandar | null
  onElegir: (q: QueEnviar) => void
  onCerrar: () => void
}) {
  /* Mientras no se elija una, la primera pestaña que tenga algo. */
  const [elegida, setElegida] = useState<Pestana | null>(null)
  const [busqueda, setBusqueda] = useState('')
  /* Lo marcado, en el orden en que se marcó. */
  const [marcadas, setMarcadas] = useState<string[]>([])
  const pestana: Pestana = elegida
    ?? (opciones ? (['plantilla', 'test', 'zonas', 'deportista'] as Pestana[]).find(p => opciones[p].length) : null)
    ?? 'plantilla'

  // Escape cierra, como en el resto de ventanas.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const lista = useMemo(
    () => (opciones?.[pestana] || []).filter(o => casaConBusqueda(o.nombre, busqueda)),
    [opciones, pestana, busqueda])
  const todas = useMemo(() => opciones ? [...opciones.plantilla, ...opciones.test, ...opciones.zonas, ...opciones.deportista] : [], [opciones])
  const info = PESTANAS.find(p => p.id === pestana)!
  const elegidas = marcadas.map(c => todas.find(o => o.clave === c)).filter((o): o is Opcion => !!o)
  const demasiadas = elegidas.length > MAX_VARIOS
  /* Lo que va solo (un deportista) no se junta con nada. */
  const esSolo = (clave: string) => !!todas.find(o => o.clave === clave)?.solo

  const alternar = (o: Opcion) => {
    if (o.motivo) return
    setMarcadas(m => m.includes(o.clave) ? m.filter(c => c !== o.clave)
      : o.solo ? [o.clave] : [...m.filter(c => !esSolo(c)), o.clave])
  }
  const anadir = (clave: string) => setMarcadas(m => m.includes(clave) ? m : [...m.filter(c => !esSolo(c)), clave])
  const siguiente = () => {
    const q = queDeLasElegidas(elegidas)
    if (q && !demasiadas) onElegir(q)
  }

  /* En el servidor no hay document (y esta ventana solo se abre con un clic). */
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] px-4 py-6" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="elegir-titulo"
        className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-xl max-h-full flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 id="elegir-titulo" className="font-bold text-lg">¿Qué quieres mandar?</h3>
            <p className="text-xs text-gray-500">Puedes elegir varias, también de pestañas distintas: le llega todo junto. Un deportista va solo.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-500 hover:text-white text-xl leading-none px-1 transition">×</button>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-3">
          <div role="tablist" aria-label="Qué mandas" className="inline-flex gap-1 p-1 rounded-lg bg-gray-950 border border-gray-800 self-start max-w-full overflow-x-auto">
            {PESTANAS.map(p => {
              const marcadasAqui = opciones ? opciones[p.id].filter(o => marcadas.includes(o.clave)).length : 0
              return (
                <button key={p.id} role="tab" aria-selected={pestana === p.id} onClick={() => setElegida(p.id)}
                  className={'text-[13px] px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap transition ' + (pestana === p.id
                    ? 'bg-orange-500/15 text-orange-200 font-semibold shadow-[inset_0_0_0_1px_rgba(249,115,22,.4)]'
                    : 'text-gray-400 hover:text-white')}>
                  {p.titulo}
                  {opciones && opciones[p.id].length > 0 && <span className="ml-1 font-normal opacity-70 hidden sm:inline">{opciones[p.id].length}</span>}
                  {marcadasAqui > 0 && <span className="ml-1.5 text-[11px] font-bold px-1.5 py-px rounded-full bg-orange-500 text-white">✓{marcadasAqui}</span>}
                </button>
              )
            })}
          </div>
          <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por el nombre"
            aria-label="Buscar por el nombre"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
        </div>

        <ul className="px-5 py-3 flex flex-col gap-1.5 overflow-y-auto min-h-[12rem]">
          {pestana === 'deportista' && opciones && opciones.deportista.length > 0 && (
            <li className="text-xs text-sky-100/90 bg-sky-400/10 border border-sky-400/30 rounded-lg px-3 py-2 leading-relaxed">
              Pasar un deportista no es una copia: pasa a la lista del otro entrenador con su historial, y tú dejas de ver su ficha.
              Va solo, sin nada más.
            </li>
          )}
          {!opciones ? (
            <li className="text-sm text-gray-500 py-6 text-center">Cargando…</li>
          ) : !opciones[pestana].length ? (
            <li className="text-sm text-gray-500 py-6 leading-relaxed">{info.vacio}</li>
          ) : !lista.length ? (
            <li className="text-sm text-gray-500 py-6">Ninguna se llama así.</li>
          ) : lista.map(o => {
            const marcada = marcadas.includes(o.clave)
            const porAnadir = marcada ? (o.relacionadas || []).filter(r => !marcadas.includes(r.clave)) : []
            const conSuTest = marcada && o.que.tipo === 'zonas' ? o.que.tests : []
            return (
              <li key={o.clave} className={'rounded-lg border transition ' + (marcada
                ? 'border-orange-500/50 bg-orange-500/[0.07]'
                : 'border-gray-800 bg-gray-800/30 hover:border-gray-600')}>
                <button type="button" role="checkbox" aria-checked={marcada} onClick={() => alternar(o)} disabled={!!o.motivo}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed">
                  <span aria-hidden className={'w-[18px] h-[18px] rounded-[5px] border grid place-items-center text-[11px] font-bold flex-shrink-0 ' + (marcada
                    ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-600 text-transparent')}>✓</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none min-w-[2.6rem] text-center flex-shrink-0"
                    style={{ background: o.color, color: '#0a0b0f' }}>{o.marca}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-white truncate">{o.nombre}</span>
                    <span className="block text-xs text-gray-400 truncate">{o.detalle}</span>
                    {o.motivo && <span className="block text-xs text-amber-300/90 mt-0.5">{o.motivo}</span>}
                  </span>
                </button>
                {porAnadir.length > 0 && (
                  <div className="px-3 pb-2.5 -mt-1 pl-[3.6rem] flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                    <span>Salen de él:</span>
                    {porAnadir.map(r => (
                      <button key={r.clave} type="button" onClick={() => anadir(r.clave)}
                        className="text-sky-200 hover:text-white border border-sky-400/40 hover:border-sky-300 rounded-full px-2 py-0.5 transition">
                        «{r.nombre}» + añadir
                      </button>
                    ))}
                  </div>
                )}
                {conSuTest.length > 0 && (
                  <p className="px-3 pb-2.5 -mt-1 pl-[3.6rem] text-xs text-sky-200/80">
                    Van con {conSuTest.length === 1 ? 'su test' : 'sus tests'} {conSuTest.map(n => '«' + n + '»').join(' y ')}: no hace falta elegirlo.
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        <div className="px-5 py-3 border-t border-gray-800 flex flex-col gap-2.5">
          <p className="text-xs text-gray-500 leading-relaxed">
            Solo lo tuyo. Una sesión suelta se manda desde la propia sesión (📨 Enviar como plantilla).
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-300 mr-auto">
              {elegidas.length === 0 ? 'Marca lo que quieras mandar' : elegidas.length === 1 ? '1 elegida' : elegidas.length + ' elegidas'}
              {demasiadas && <span className="block text-xs text-amber-300">Como mucho {MAX_VARIOS} en un mismo envío.</span>}
            </span>
            {elegidas.length > 0 && (
              <button type="button" onClick={() => setMarcadas([])} className="text-gray-400 hover:text-white text-sm px-2 py-1.5 transition">Quitar todas</button>
            )}
            <button type="button" onClick={siguiente} disabled={!elegidas.length || demasiadas}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-40">
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
