'use client'
// ============================================================
// Enviar a otro entrenador: la ventana
// ============================================================
// La abren la sesión («Enviar como plantilla»), el panel de plantillas, Tests
// propios y Zonas propias. Al otro se le busca por su correo EXACTO —la base no
// deja recorrer la lista de entrenadores— y debajo salen aquellos a los que ya
// les has mandado algo. Lo que se manda es una copia (lib/envios).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { cargaZona } from '@/lib/zonas'
import { textoBloque, type BloqueP } from '@/lib/plantillas'
import { etiquetaDisciplina } from '@/lib/disciplinas'
import {
  buscarEntrenador, enviar, correoValido, destinatariosPrevios, queViaja, zonasDesconocidas, plantillaParaEnviar,
} from '@/lib/envios'

export type QueEnviar =
  | {
    tipo: 'plantilla'
    nombre: string
    disciplina: string
    objetivo?: string | null
    bloques: BloqueP[]
    /** Desde una sesión el nombre se elige aquí; una plantilla ya tiene el suyo. */
    nombreEditable?: boolean
  }
  | { tipo: 'test'; id: number; nombre: string; detalle?: string }
  | {
    tipo: 'zonas'; id: number; nombre: string; detalle?: string
    zonas: { sigla: string; nombre: string; color: string }[]
    /** Los tests propios de los que salen: viajan con ellas. */
    tests: string[]
  }

type Busqueda =
  | { correo: string; estado: 'buscando' | 'no' | 'tu' }
  | { correo: string; estado: 'si'; id: string; nombre: string }
  | { correo: string; estado: 'error'; error: string }

const DESCANSO = (s?: number) => !s ? '' : s >= 60 ? (s % 60 ? Math.floor(s / 60) + '′' + String(s % 60).padStart(2, '0') + '″' : s / 60 + '′') : s + '″'

export default function EnviarAEntrenador({ que, onCerrar, onEnviado }: {
  que: QueEnviar
  onCerrar: () => void
  /** Cuando ya está enviado, con el id del envío (la página Envíos lo abre). */
  onEnviado?: (id: number) => void
}) {
  const [correo, setCorreo] = useState('')
  const [miCorreo, setMiCorreo] = useState('')
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null)
  const [previos, setPrevios] = useState<{ id: string; nombre: string; correo: string }[]>([])
  const [mensaje, setMensaje] = useState('')
  const [nombre, setNombre] = useState(que.tipo === 'plantilla' ? que.nombre : '')
  const [enviando, setEnviando] = useState(false)
  const [enviadoA, setEnviadoA] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimo = useRef('')

  /* Tu correo (para decirte «ese es el tuyo») y a quién has mandado algo. Si
     la tabla aún no existe, la lista sale vacía y ya está. */
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const user = await usuarioActual()
      if (!vivo || !user) return
      setMiCorreo(String(user.email || '').trim().toLowerCase())
      const { data } = await supabase.from('envio_entrenador')
        .select('para, para_nombre, para_correo, creado_en')
        .eq('de', user.id).order('creado_en', { ascending: false }).limit(100)
      if (vivo) setPrevios(destinatariosPrevios(data || []))
    })()
    return () => { vivo = false; if (temporizador.current) clearTimeout(temporizador.current) }
  }, [])

  // Escape cierra, como en el resto de ventanas.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar, enviando])

  /* Se busca al dejar de escribir, y solo con algo que parezca un correo. La
     respuesta de una búsqueda vieja no pisa la de lo que hay escrito ahora. */
  const escribirCorreo = (valor: string) => {
    setCorreo(valor)
    if (temporizador.current) clearTimeout(temporizador.current)
    const c = valor.trim().toLowerCase()
    ultimo.current = c
    if (!correoValido(c)) { setBusqueda(null); return }
    if (miCorreo && c === miCorreo) { setBusqueda({ correo: c, estado: 'tu' }); return }
    setBusqueda({ correo: c, estado: 'buscando' })
    temporizador.current = setTimeout(async () => {
      const r = await buscarEntrenador(supabase, c)
      if (ultimo.current !== c) return
      setBusqueda(r.error ? { correo: c, estado: 'error', error: r.error }
        : r.entrenador ? { correo: c, estado: 'si', id: r.entrenador.id, nombre: r.entrenador.nombre }
          : { correo: c, estado: 'no' })
    }, 350)
  }

  const elegirPrevio = (p: { id: string; nombre: string; correo: string }) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    ultimo.current = p.correo
    setCorreo(p.correo)
    setBusqueda({ correo: p.correo, estado: 'si', id: p.id, nombre: p.nombre })
  }

  const destino = busqueda?.estado === 'si' ? busqueda : null
  const faltaNombre = que.tipo === 'plantilla' && !nombre.trim()
  const puede = !!destino && !enviando && !enviadoA && !faltaNombre

  const mandar = async () => {
    if (!puede || !destino) return
    setEnviando(true)
    const r = await enviar(supabase, destino.id,
      que.tipo === 'plantilla'
        ? { tipo: 'plantilla', plantilla: plantillaParaEnviar({ nombre, disciplina: que.disciplina, objetivo: que.objetivo, bloques: que.bloques }) }
        : { tipo: que.tipo, id: que.id },
      mensaje)
    setEnviando(false)
    // Un fallo al enviar va en ventana, como un fallo al guardar (política de avisos).
    if (r.error) { alert('No se ha podido enviar.\n\n' + r.error); return }
    setEnviadoA(destino.nombre)
    if (r.id) onEnviado?.(r.id)
  }

  const { viaja, noViaja } = queViaja(que.tipo)
  const desconocidas = que.tipo === 'plantilla' ? zonasDesconocidas(que.bloques) : []
  const etiqueta = 'text-[11px] font-semibold uppercase tracking-[0.07em] text-gray-500'

  /* Solo se abre con un clic, en el navegador; pero si alguien la pinta en el
     servidor, que no rompa la página: allí no hay document. */
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] px-4 py-6"
      onClick={() => { if (!enviando) onCerrar() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="enviar-titulo"
        className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-xl max-h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3">
          <h3 id="enviar-titulo" className="font-bold text-lg">Enviar a otro entrenador</h3>
          <button type="button" onClick={onCerrar} disabled={enviando} aria-label="Cerrar"
            className="text-gray-500 hover:text-white text-xl leading-none px-1 transition disabled:opacity-40">×</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">
          {/* ── Qué mandas ── */}
          <div className="flex flex-col gap-2">
            <p className={etiqueta}>Qué mandas</p>
            <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3 flex flex-col gap-2">
              {que.tipo === 'plantilla' ? (
                <>
                  {que.nombreEditable ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-gray-400 text-xs">Nombre de la plantilla</span>
                      <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} disabled={!!enviadoA}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-orange-500" />
                    </label>
                  ) : <p className="font-semibold text-[15px]">{que.nombre}</p>}
                  <p className="text-gray-400 text-xs">
                    {etiquetaDisciplina(que.disciplina)} · {que.bloques.length} {que.bloques.length === 1 ? 'bloque' : 'bloques'} · le llega como plantilla
                  </p>
                  <ul className="flex flex-col gap-1">
                    {que.bloques.map((b, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13px]">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none min-w-[2.6rem] text-center"
                          style={{ background: cargaZona(b.zona).color, color: '#0a0b0f' }}>{b.zona}</span>
                        <span className="text-gray-200">{textoBloque(b)}</span>
                        {b.descansoSeg ? <span className="text-gray-500">· descanso {DESCANSO(b.descansoSeg)}</span> : null}
                      </li>
                    ))}
                  </ul>
                  {desconocidas.length > 0 && (
                    <p className="text-amber-200/90 text-xs leading-relaxed bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
                      Usa {desconocidas.length === 1 ? 'una zona tuya' : 'zonas tuyas'} ({desconocidas.join(', ')}): le llega con la sigla,
                      pero sin la zona, así que la app no sabrá su intensidad. Si quieres, mándale también esas zonas desde Zonas propias.
                    </p>
                  )}
                </>
              ) : que.tipo === 'test' ? (
                <>
                  <p className="font-semibold text-[15px]">Test «{que.nombre}»</p>
                  {que.detalle && <p className="text-gray-400 text-xs">{que.detalle}</p>}
                  <p className="text-gray-500 text-xs">Le llega a sus Tests propios.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-[15px]">Zonas «{que.nombre}»</p>
                  {que.detalle && <p className="text-gray-400 text-xs">{que.detalle}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {que.zonas.map((z, i) => (
                      <span key={i} className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                        style={{ color: z.color, borderColor: z.color + '66', background: z.color + '1a' }}>
                        {z.sigla}{z.nombre ? ' · ' + z.nombre : ''}
                      </span>
                    ))}
                  </div>
                  {que.tests.length > 0 && (
                    <p className="text-sky-200/90 text-xs leading-relaxed bg-sky-400/10 border border-sky-400/30 rounded-lg px-3 py-2">
                      <b className="text-white font-semibold">Van con {que.tests.length === 1 ? 'el test' : 'los tests'} {que.tests.map(t => '«' + t + '»').join(' y ')}, del que salen.</b>{' '}
                      Sin {que.tests.length === 1 ? 'él' : 'ellos'} no tendrían de dónde calcularse: le llega una copia, y sus zonas se calculan con ella.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── A quién ── */}
          <div className="flex flex-col gap-2">
            <label htmlFor="enviar-correo" className={etiqueta}>A quién</label>
            <input id="enviar-correo" type="email" value={correo} onChange={e => escribirCorreo(e.target.value)}
              placeholder="El correo con el que entra en TRIPULSE" autoComplete="off" spellCheck={false} disabled={!!enviadoA}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
            <p role="status" className={'text-[13px] min-h-[1.25rem] ' + (
              busqueda?.estado === 'si' ? 'text-emerald-300' : busqueda?.estado === 'buscando' ? 'text-gray-500' : 'text-red-300')}>
              {busqueda?.estado === 'buscando' && 'Buscando…'}
              {busqueda?.estado === 'si' && <>✓ {busqueda.nombre} · entrenador en TRIPULSE</>}
              {busqueda?.estado === 'no' && 'No hay ningún entrenador con ese correo. Revisa que sea el correo con el que entra en TRIPULSE.'}
              {busqueda?.estado === 'tu' && 'Ese es tu correo.'}
              {busqueda?.estado === 'error' && busqueda.error}
            </p>
            {previos.length > 0 && !enviadoA && (
              <>
                <p className={etiqueta}>Ya les has mandado algo</p>
                <div className="flex flex-wrap gap-1.5">
                  {previos.map(p => {
                    const elegido = destino?.id === p.id
                    return (
                      <button key={p.id} type="button" onClick={() => elegirPrevio(p)} aria-pressed={elegido}
                        className={'text-[12.5px] px-3 py-1.5 rounded-full border transition max-w-full truncate ' + (elegido
                          ? 'border-sky-400/60 bg-sky-400/10 text-white'
                          : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500')}>
                        {p.nombre} <span className="text-gray-500 text-[11px]">{p.correo}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Mensaje ── */}
          <div className="flex flex-col gap-2">
            <label htmlFor="enviar-mensaje" className={etiqueta}>Mensaje <span className="normal-case tracking-normal font-normal">(si quieres)</span></label>
            <textarea id="enviar-mensaje" value={mensaje} onChange={e => setMensaje(e.target.value)} maxLength={500} rows={2}
              placeholder="«Te paso la sesión de series que hablamos.»" disabled={!!enviadoA}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 resize-y" />
          </div>

          {/* ── Qué viaja ── */}
          <div className="grid sm:grid-cols-2 gap-2.5 text-[12.5px]">
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2.5 text-emerald-200">
              <b className="font-semibold">Viaja</b>
              <ul className="list-disc pl-4 mt-1 flex flex-col gap-0.5">{viaja.map(v => <li key={v}>{v}</li>)}</ul>
            </div>
            <div className="rounded-lg border border-gray-800 bg-white/[0.02] px-3 py-2.5 text-gray-400">
              <b className="font-semibold text-gray-300">No viaja</b>
              <ul className="list-disc pl-4 mt-1 flex flex-col gap-0.5">{noViaja.map(v => <li key={v}>{v}</li>)}</ul>
            </div>
          </div>
          <p className="text-gray-500 text-xs -mt-2">Es una copia: si después cambias lo tuyo, lo suyo no cambia.</p>
        </div>

        <div className="px-5 py-4 border-t border-gray-800">
          {enviadoA ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p role="status" className="text-emerald-300 text-sm">
                Enviado a {enviadoA}. Le sale en su panel; cuando conteste, lo verás en el tuyo.
              </p>
              <button type="button" onClick={onCerrar} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition">Cerrar</button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3 flex-wrap">
              {faltaNombre && <span className="text-amber-300 text-xs mr-auto">Ponle un nombre a la plantilla.</span>}
              <button type="button" onClick={onCerrar} disabled={enviando}
                className="text-gray-400 hover:text-white text-sm px-3 py-2 transition disabled:opacity-40">Cancelar</button>
              <button type="button" onClick={mandar} disabled={!puede}
                className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-40">
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
