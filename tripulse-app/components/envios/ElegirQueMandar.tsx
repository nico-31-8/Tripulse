'use client'
// ============================================================
// Envíos: elegir qué mandar
// ============================================================
// Desde la página Envíos («📨 Mandar algo»): una de tus plantillas, uno de tus
// tests o unas zonas tuyas. Al elegirlo se abre la ventana de siempre
// (EnviarAEntrenador). Solo lo tuyo: lo que te comparte un director se usa,
// pero no se manda.
//
// Las sesiones sueltas no salen aquí: una sesión es de un deportista y de un
// día. Se mandan con su botón, o guardándolas como plantilla.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { cargaZona } from '@/lib/zonas'
import { etiquetaDisciplina } from '@/lib/disciplinas'
import type { BloqueP } from '@/lib/plantillas'
import type { QueEnviar } from '@/components/EnviarAEntrenador'
import { motivoNoSeManda, testsDeHitos, resultadosDe, casaConBusqueda } from '@/lib/envios'

type Pestana = 'plantilla' | 'test' | 'zonas'

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
}

const PESTANAS: { id: Pestana; titulo: string; vacio: string }[] = [
  { id: 'plantilla', titulo: 'Plantillas', vacio: 'Aún no tienes plantillas propias. Se guardan desde una sesión con «Guardar como plantilla».' },
  { id: 'test', titulo: 'Tests', vacio: 'Aún no tienes tests propios. Se crean en Tests propios o en el Laboratorio.' },
  { id: 'zonas', titulo: 'Zonas', vacio: 'Aún no tienes zonas propias. Se crean en Zonas propias.' },
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
      const [pl, ts, cs] = await Promise.all([
        supabase.from('plantilla_sesion').select('id, nombre, disciplina, zona, objetivo, bloques')
          .eq('id_entrenador', user.id).order('created_at', { ascending: false }),
        supabase.from('test_definicion').select('id, nombre, deporte, resultados, modelo')
          .eq('id_entrenador', user.id).eq('archivado', false).order('created_at', { ascending: false }),
        supabase.from('zona_clasificacion').select('id, nombre, deporte, hitos')
          .eq('id_entrenador', user.id).eq('archivada', false).order('orden'),
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

      const deTests: Opcion[] = tests.map(t => {
        const lab = !!(t.modelo && typeof t.modelo === 'object')
        const produce = resultadosDe(t).filter(Boolean)
        const detalle = etiquetaDisciplina(t.deporte) + (lab ? ' · del Laboratorio' : '') + ' · produce ' + (produce.join(', ') || 'nada')
        return {
          clave: 't' + t.id, nombre: t.nombre, marca: '🧪', color: '#a78bfa', detalle,
          motivo: motivoNoSeManda({ tipo: 'test' }),
          que: { tipo: 'test', id: t.id, nombre: t.nombre, detalle },
        }
      })

      const deZonas: Opcion[] = clasifs.map(c => {
        const suyas = zonas.filter(z => z.id_clasificacion === c.id)
        const { nombres, ajenos } = testsDeHitos(c.hitos, tests)
        const detalle = etiquetaDisciplina(c.deporte) + ' · ' + suyas.length + (suyas.length === 1 ? ' zona' : ' zonas')
          + (nombres.length ? ' · con ' + (nombres.length === 1 ? 'el test ' : 'los tests ') + nombres.map(n => '«' + n + '»').join(' y ') : '')
        return {
          clave: 'z' + c.id, nombre: c.nombre, marca: suyas[0]?.sigla || '—', color: suyas[0]?.color || '#6b7280', detalle,
          motivo: motivoNoSeManda({ tipo: 'zonas', zonas: suyas.length, testsAjenos: ajenos }),
          que: {
            tipo: 'zonas', id: c.id, nombre: c.nombre, detalle: etiquetaDisciplina(c.deporte) + ' · ' + suyas.length + (suyas.length === 1 ? ' zona' : ' zonas'),
            zonas: suyas.map(z => ({ sigla: z.sigla, nombre: z.nombre, color: z.color })), tests: nombres,
          },
        }
      })

      setOpciones({ plantilla: plantillas, test: deTests, zonas: deZonas })
    })()
    return () => { vivo = false }
  }, [])

  return <ElegirQueMandarVista opciones={opciones} onElegir={onElegir} onCerrar={onCerrar} />
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
  const pestana: Pestana = elegida
    ?? (opciones ? (['plantilla', 'test', 'zonas'] as Pestana[]).find(p => opciones[p].length) : null)
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
  const info = PESTANAS.find(p => p.id === pestana)!

  /* En el servidor no hay document (y esta ventana solo se abre con un clic). */
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] px-4 py-6" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="elegir-titulo"
        className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-xl max-h-full flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3">
          <h3 id="elegir-titulo" className="font-bold text-lg">¿Qué quieres mandar?</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-500 hover:text-white text-xl leading-none px-1 transition">×</button>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-3">
          <div role="tablist" aria-label="Qué mandas" className="inline-flex gap-1 p-1 rounded-lg bg-gray-950 border border-gray-800 self-start">
            {PESTANAS.map(p => (
              <button key={p.id} role="tab" aria-selected={pestana === p.id} onClick={() => setElegida(p.id)}
                className={'text-[13px] px-3 py-1.5 rounded-md transition ' + (pestana === p.id
                  ? 'bg-orange-500/15 text-orange-200 font-semibold shadow-[inset_0_0_0_1px_rgba(249,115,22,.4)]'
                  : 'text-gray-400 hover:text-white')}>
                {p.titulo}{opciones && opciones[p.id].length ? ' · ' + opciones[p.id].length : ''}
              </button>
            ))}
          </div>
          <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por el nombre"
            aria-label="Buscar por el nombre"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
        </div>

        <ul className="px-5 py-3 flex flex-col gap-1.5 overflow-y-auto min-h-[12rem]">
          {!opciones ? (
            <li className="text-sm text-gray-500 py-6 text-center">Cargando…</li>
          ) : !opciones[pestana].length ? (
            <li className="text-sm text-gray-500 py-6 leading-relaxed">{info.vacio}</li>
          ) : !lista.length ? (
            <li className="text-sm text-gray-500 py-6">Ninguna se llama así.</li>
          ) : lista.map(o => (
            <li key={o.clave}>
              <button type="button" onClick={() => onElegir(o.que)} disabled={!!o.motivo}
                className="w-full text-left rounded-lg border border-gray-800 bg-gray-800/30 hover:border-gray-600 hover:bg-gray-800/60 px-3 py-2.5 flex items-center gap-3 transition disabled:opacity-60 disabled:hover:border-gray-800 disabled:hover:bg-gray-800/30 disabled:cursor-not-allowed">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none min-w-[2.6rem] text-center flex-shrink-0"
                  style={{ background: o.color, color: '#0a0b0f' }}>{o.marca}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-white truncate">{o.nombre}</span>
                  <span className="block text-xs text-gray-400 truncate">{o.detalle}</span>
                  {o.motivo && <span className="block text-xs text-amber-300/90 mt-0.5">{o.motivo}</span>}
                </span>
                {!o.motivo && <span className="text-gray-500 text-sm flex-shrink-0" aria-hidden>→</span>}
              </button>
            </li>
          ))}
        </ul>

        <p className="px-5 py-3 border-t border-gray-800 text-xs text-gray-500 leading-relaxed">
          Solo lo tuyo. Una sesión suelta se manda desde la propia sesión (📨 Enviar como plantilla).
        </p>
      </div>
    </div>,
    document.body,
  )
}
