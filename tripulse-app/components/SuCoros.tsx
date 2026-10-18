'use client'
// ============================================================
// «⌚ Su COROS»: mandar las sesiones al reloj COROS del deportista
// ============================================================
// Lo usa SU ENTRENADOR (no el director) y solo si el deportista tiene COROS
// conectado. Tres piezas que leen la misma ruta (/api/relojes/coros/envios) y
// la misma regla (lib/coros-envio), así que dicen lo mismo:
//
//   · BotonSuCoros: el botón de la cabecera del calendario y su ventana, con
//     la semana, lo que va, lo que ya está y lo que no puede ir.
//   · useCorosDelCalendario + MarcaCoros: ⌚ (en su COROS), ⌚! (cambió o se
//     movió después de mandarla) y lo que SIGUE en su COROS en un día que ya
//     no es el de su sesión.
//   · FranjaSuCoros: la franja de la ficha de sesión.
//
// COROS no deja mover ni borrar desde fuera. Por eso nada se manda solo, y lo
// que se queda en su COROS se enseña hasta que el entrenador dice que ya no
// está («Ya la ha borrado»). Avisarle por el chat lleva el mensaje escrito, y
// lo manda el entrenador.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { llamarReloj } from '@/lib/relojes-cliente'
import { lunesDe, sumarDias, hoyISO } from '@/lib/fechas'
import {
  NOMBRE_SECCION, textoObjetivo, textoIntensidad, DIAS_POR_DELANTE_COROS,
  type CursoCoros, type PasoCoros,
} from '@/lib/coros-envio'
import { etiquetaDisciplina, chipDisciplina } from '@/lib/disciplinas'
import { AvisoEnLinea, useAviso } from '@/components/AvisoEnLinea'

const RUTA = '/api/relojes/coros/envios'

type K = 'va' | 'ya' | 'cambia' | 'movida' | 'no' | 'hecha' | 'pasada' | 'lejos'
export interface EstadoSesionCoros {
  id: number
  fecha: string
  disciplina: string | null
  estado: { k: K; motivo?: string; de?: string[]; enviadoEn?: string | null }
  entrenos: { parte: number; curso: CursoCoros }[]
  /** Lo que ya tiene ese día en su COROS y no mandó su entrenador (solo si se leyó su calendario). */
  ajenos?: { nombre: string; dePlan: boolean }[]
}
export interface SigueEnCoros { id: number; fecha: string; nombre: string; idSesion: number | null }
interface RespuestaEstado {
  hoy: string
  ultimaSincronizacion: string | null
  /** Si se pidió su calendario de COROS y no se pudo leer. */
  avisoCoros?: string | null
  sesiones: EstadoSesionCoros[]
  siguen: SigueEnCoros[]
}
interface ResultadoEnvio { id: number; ok: boolean; motivo?: string; partes: { parte: number; ok: boolean; error?: string; sinId?: boolean }[] }

const MANDABLES: K[] = ['va', 'cambia', 'movida']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const dia = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00')
/** «martes 20» */
export const diaLargo = (iso: string) => DIAS[dia(iso).getDay()] + ' ' + dia(iso).getDate()
const diaCorto = (iso: string) => DIAS_C[dia(iso).getDay()] + ' ' + dia(iso).getDate()
const semanaTexto = (lunes: string) => {
  const fin = sumarDias(lunes, 6)
  const m1 = MESES[dia(lunes).getMonth()], m2 = MESES[dia(fin).getMonth()]
  return 'Semana del ' + dia(lunes).getDate() + (m1 !== m2 ? ' de ' + m1 : '') + ' al ' + dia(fin).getDate() + ' de ' + m2
}
const nombreCorto = (n: string | null | undefined) => String(n || '').trim().split(/\s+/)[0] || ''
/* Sin entreno (natación, fuerza…) no hay más nombre que la disciplina, que ya va en su etiqueta. */
const nombreDeFila = (s: EstadoSesionCoros) => {
  if (!s.entrenos.length) return ''
  if (s.entrenos.length === 1) return s.entrenos[0].curso.courseName
  return 'Brick · ' + s.entrenos.map(e => e.curso.courseName.replace(/^Brick \d+\/\d+ · /, '')).join(' + ')
}

/** `conCoros`: leer también su calendario de COROS (la ventana, para una semana; el calendario no, que es un trimestre). */
async function pedirEstado(idDeportista: number, desde: string, hasta: string, conCoros = false): Promise<RespuestaEstado | null> {
  const { ok, cuerpo } = await llamarReloj(RUTA, { accion: 'estado', idDeportista, desde, hasta, ...(conCoros ? { conCoros: true } : {}) })
  return ok ? (cuerpo as unknown as RespuestaEstado) : null
}

/** Si quien mira es su entrenador y el deportista tiene COROS conectado. */
export function usePuedeMandarACoros(idDeportista: number | null | undefined) {
  const [estado, setEstado] = useState<{ puede: boolean; nombre: string | null }>({ puede: false, nombre: null })
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!idDeportista) return
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const [{ data: dep }, { data: con }] = await Promise.all([
        supabase.from('deportista').select('id_entrenador, nombre').eq('id', idDeportista).maybeSingle(),
        supabase.from('reloj_conexion').select('id').eq('id_deportista', idDeportista).eq('proveedor', 'coros').maybeSingle(),
      ])
      if (vivo) setEstado({ puede: !!con && dep?.id_entrenador === uid, nombre: dep?.nombre ?? null })
    })()
    return () => { vivo = false }
  }, [idDeportista])
  return idDeportista ? estado : { puede: false, nombre: null }
}

/**
 * Las marcas del calendario: el estado de cada sesión de hoy a 90 días y lo que
 * sigue en su COROS. Se vuelve a pedir cuando cambia `version` (las sesiones).
 */
export function useCorosDelCalendario(idDeportista: number | null | undefined, version: unknown) {
  const { puede, nombre } = usePuedeMandarACoros(idDeportista)
  const [datos, setDatos] = useState<RespuestaEstado | null>(null)
  const recargar = useCallback(async () => {
    if (!puede || !idDeportista) return
    const hoy = hoyISO()
    const r = await pedirEstado(idDeportista, hoy, sumarDias(hoy, DIAS_POR_DELANTE_COROS))
    if (r) setDatos(r)
  }, [puede, idDeportista])
  /* La regla ve una llamada que acaba en setState; el estado se pone DESPUES de
     que conteste la ruta, que es el caso que ella misma admite. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recargar() }, [recargar, version])
  const porSesion = useMemo(() => {
    const m: Record<number, EstadoSesionCoros> = {}
    for (const s of datos?.sesiones || []) m[s.id] = s
    return m
  }, [datos])
  return { puede, nombre, porSesion, siguen: datos?.siguen || [], recargar }
}

/** ⌚ si está en su COROS; ⌚! si cambió o se movió después de mandarla. Nada si no se mandó. */
export function MarcaCoros({ e }: { e: EstadoSesionCoros | undefined }) {
  if (!e) return null
  if (e.estado.k === 'ya') return <span className="flex-none text-[11px]" title="En su COROS">⌚</span>
  if (e.estado.k === 'cambia') return <span className="flex-none text-[11px] font-bold text-amber-300" title="Ha cambiado después de mandarla a su COROS">⌚!</span>
  if (e.estado.k === 'movida') return <span className="flex-none text-[11px] font-bold text-amber-300" title="La moviste después de mandarla: sigue en su COROS el día de antes">⌚!</span>
  return null
}

// ------------------------------------------------------------
// Así le llegará
// ------------------------------------------------------------

function Paso({ p }: { p: PasoCoros }) {
  if ('intervalGroup' in p) {
    return (
      <li className="rounded-lg border border-gray-700 p-1.5">
        <span className="text-[12px] font-bold text-orange-400 px-1">Repetir × {p.repeats}</span>
        <ol className="flex flex-col gap-1 mt-1">{p.sets.map((s, i) => <Paso key={i} p={s} />)}</ol>
      </li>
    )
  }
  const intensidad = textoIntensidad(p)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 bg-white/[0.035] rounded-lg px-2.5 py-1.5">
      <span className="text-[12.5px] font-semibold">{NOMBRE_SECCION[p.sectionType]}</span>
      <span className="font-mono text-[12.5px] text-gray-300 text-right tabular-nums">{textoObjetivo(p)}</span>
      <span className={'col-span-2 text-[12px] ' + (intensidad ? 'font-mono text-gray-300 tabular-nums' : 'text-gray-500')}>
        {intensidad || 'Sin objetivo: a gusto'}
      </span>
    </li>
  )
}

export function AsiLeLlegara({ entrenos, yaMandado = false }: { entrenos: { parte: number; curso: CursoCoros }[]; yaMandado?: boolean }) {
  if (!entrenos.length) return null
  return (
    <div className="flex flex-col gap-2">
      {entrenos.map(e => (
        <div key={e.parte} className="rounded-xl border border-gray-700 bg-black/30 p-3 flex flex-col gap-1.5">
          <div className="flex justify-between gap-2 text-[10.5px] uppercase tracking-wider text-gray-500">
            <span>⌚ {yaMandado ? 'Así le llegó' : 'Así le llegará'}{entrenos.length > 1 ? ' · entreno ' + e.parte + ' de ' + entrenos.length : ''}</span>
            <span>{e.curso.sportType === 2 ? 'Ciclismo' : 'Carrera'}</span>
          </div>
          <p className="font-semibold text-[13.5px] break-words">{e.curso.courseName}</p>
          <p className="text-[12.5px] text-gray-300 max-w-[64ch]">{e.curso.courseDescription}</p>
          <ol className="flex flex-col gap-1">{e.curso.sections.map((p, i) => <Paso key={i} p={p} />)}</ol>
        </div>
      ))}
      <p className="text-[11.5px] text-gray-500">
        {entrenos.length > 1 ? 'En COROS, un brick son dos entrenos el mismo día: la transición no va. ' : ''}
        El reloj avisa si se sale del rango. El nombre y la descripción los lee tal cual.
      </p>
    </div>
  )
}

// ------------------------------------------------------------
// Avisarle por el chat
// ------------------------------------------------------------

function AvisarPorChat({ idDeportista, textoInicial, onCerrar, onEnviado }: {
  idDeportista: number; textoInicial: string; onCerrar: () => void; onEnviado: () => void
}) {
  const [texto, setTexto] = useState(textoInicial)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const enviar = async () => {
    if (!texto.trim()) { setError('Escribe algo antes de mandarlo.'); return }
    setEnviando(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { error: e } = await supabase.from('mensajes').insert({
      id_entrenador: session?.user?.id, id_deportista: idDeportista, contenido: texto.trim(), autor: 'entrenador', leido: false,
    })
    setEnviando(false)
    if (e) { setError('No se ha podido mandar: ' + e.message); return }
    onEnviado()
  }
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4" onClick={onCerrar}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="t-avisar-chat">
        <div className="flex justify-between items-start gap-4 p-5 pb-3 border-b border-gray-800">
          <div>
            <h3 id="t-avisar-chat" className="text-lg font-bold">Avisarle por el chat</h3>
            <p className="text-gray-500 text-xs mt-1">El mensaje va escrito: cámbialo si quieres y mándalo tú.</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-white text-2xl leading-none" aria-label="Cerrar">×</button>
        </div>
        <div className="p-5 flex flex-col gap-2">
          <textarea id="coros-chat" value={texto} onChange={e => setTexto(e.target.value)} rows={5}
            className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700 outline-none focus:ring-2 focus:ring-orange-500" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onCerrar} className="text-gray-400 hover:text-white text-sm px-3 py-2 transition">Cancelar</button>
          <button onClick={enviar} disabled={enviando}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            {enviando ? 'Mandando…' : 'Enviar por el chat'}
          </button>
        </div>
      </div>
    </div>
  )
}

const textoMovida = (nombre: string | null, entreno: string, viejo: string, nuevo: string) =>
  'Hola' + (nombreCorto(nombre) ? ', ' + nombreCorto(nombre) : '') + '. He movido «' + entreno + '» del ' + diaLargo(viejo) + ' al ' + diaLargo(nuevo) +
  '. En tu app de COROS borra la del ' + diaLargo(viejo) + ', para que no te salga dos veces.'
const textoSigue = (nombre: string | null, entreno: string, fecha: string) =>
  'Hola' + (nombreCorto(nombre) ? ', ' + nombreCorto(nombre) : '') + '. En tu app de COROS borra «' + entreno + '» del ' + diaLargo(fecha) +
  ': ya no lo tienes que hacer.'

// ------------------------------------------------------------
// El botón del calendario y su ventana
// ------------------------------------------------------------

const PILDORA: Record<K, string> = {
  va: 'bg-green-500/15 text-green-400', ya: 'bg-gray-800 text-gray-300',
  cambia: 'bg-amber-400/15 text-amber-300', movida: 'bg-amber-400/15 text-amber-300',
  no: 'border border-gray-700 text-gray-500', hecha: 'border border-gray-700 text-gray-500',
  pasada: 'border border-gray-700 text-gray-500', lejos: 'border border-gray-700 text-gray-500',
}
function textoPildora(s: EstadoSesionCoros): string {
  switch (s.estado.k) {
    case 'va': return s.entrenos.length > 1 ? 'Va como ' + s.entrenos.length + ' entrenos' : 'Va'
    case 'ya': return 'Ya está'
    case 'cambia': return 'Se reemplaza'
    case 'movida': return 'Va al ' + diaLargo(s.fecha)
    case 'hecha': return 'Ya la hizo'
    case 'pasada': return 'Ya pasó'
    case 'lejos': return 'Demasiado lejos'
    default: return 'No va'
  }
}

/** Cuántas sesiones de esta semana y la que viene están por mandar (el número del botón). */
export function cuantasPorMandar(porSesion: Record<number, EstadoSesionCoros>): number {
  const semanaQueViene = lunesDe(sumarDias(hoyISO(), 7))
  return Object.values(porSesion).filter(s => MANDABLES.includes(s.estado.k) && lunesDe(s.fecha) <= semanaQueViene).length
}

/** El botón de la cabecera del calendario. La ventana va aparte (VentanaSuCoros) para poder abrirla también desde el móvil. */
export function BotonSuCoros({ porSesion, onClick }: { porSesion: Record<number, EstadoSesionCoros>; onClick: () => void }) {
  const n = cuantasPorMandar(porSesion)
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-orange-500/50 text-white text-sm px-3 py-2 rounded-lg transition"
      title="Mandar sus sesiones de carrera y de bici a su reloj COROS">
      ⌚ <span>Su COROS</span>
      {n > 0 && (
        <span className="bg-orange-500 text-white rounded-full text-[11px] font-bold px-1.5 leading-[18px] tabular-nums"
          title="Sesiones de esta semana y la que viene por mandar">{n}</span>
      )}
    </button>
  )
}

/** La ventana de la semana. Abre en la primera semana con algo por mandar; si no hay nada, en la que viene. */
export function VentanaSuCoros({ idDeportista, nombre, porSesion, onCerrar, onCambio }: {
  idDeportista: number
  nombre: string | null
  /** El estado de hoy a 90 días (useCorosDelCalendario). */
  porSesion: Record<number, EstadoSesionCoros>
  onCerrar: () => void
  onCambio: () => void
}) {
  const hoy = hoyISO()
  const primero = lunesDe(hoy)
  const ultimo = lunesDe(sumarDias(hoy, DIAS_POR_DELANTE_COROS))
  const [lunes, setLunes] = useState(() => {
    const fechas = Object.values(porSesion).filter(s => MANDABLES.includes(s.estado.k)).map(s => s.fecha).sort()
    const inicial = fechas.length ? lunesDe(fechas[0]) : lunesDe(sumarDias(hoy, 7))
    return inicial < primero ? primero : inicial > ultimo ? ultimo : inicial
  })
  /* Lo leído, con la semana a la que pertenece: si no es la que se enseña, está cargando. */
  const [leido, setLeido] = useState<{ lunes: string; r: RespuestaEstado | null } | null>(null)
  const [marcadas, setMarcadas] = useState<Record<number, boolean>>({})
  const [abiertas, setAbiertas] = useState<Record<number, boolean>>({})
  const [mandando, setMandando] = useState(false)
  const [resultados, setResultados] = useState<Record<number, ResultadoEnvio> | null>(null)
  const [resumen, setResumen] = useState('')
  const [chat, setChat] = useState<string | null>(null)
  const { aviso, ok: avisarOk, mal: avisarMal } = useAviso(5)

  const cargar = useCallback(async () => {
    const desde = lunes < hoy ? hoy : lunes
    const r = await pedirEstado(idDeportista, desde, sumarDias(lunes, 6), true)
    setLeido({ lunes, r })
  }, [idDeportista, lunes, hoy])
  /* El estado se pone DESPUES de que conteste la ruta (el caso que la regla admite). */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])
  const cargando = leido?.lunes !== lunes
  const datos = cargando ? null : leido?.r ?? null
  const error = !cargando && !leido?.r ? 'No se ha podido leer cómo está su COROS. Prueba otra vez.' : ''

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !mandando && !chat) onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [mandando, chat, onCerrar])

  const sesiones = (datos?.sesiones || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha))
  const conAccion = sesiones.filter(s => MANDABLES.includes(s.estado.k))
  const elegidas = conAccion.filter(s => marcadas[s.id] !== false)
  const entrenosAMandar = elegidas.reduce((n, s) => n + s.entrenos.length, 0)
  const yaEstan = sesiones.filter(s => s.estado.k === 'ya').length
  const noVan = sesiones.filter(s => !MANDABLES.includes(s.estado.k) && s.estado.k !== 'ya').length
  const siguen = datos?.siguen || []

  const cambiarSemana = (n: number) => {
    const otro = sumarDias(lunes, 7 * n)
    if (otro < primero || otro > ultimo) return
    setLunes(otro); setResultados(null); setResumen(''); setMarcadas({}); setAbiertas({})
  }

  const mandar = async () => {
    if (!elegidas.length) return
    setMandando(true)
    const { ok, cuerpo } = await llamarReloj(RUTA, { accion: 'mandar', idDeportista, sesiones: elegidas.map(s => s.id) })
    setMandando(false)
    if (!ok) { avisarMal(String(cuerpo.error || 'No se ha podido mandar a su COROS.')); return }
    const lista = (cuerpo.resultados || []) as ResultadoEnvio[]
    const porId: Record<number, ResultadoEnvio> = {}
    for (const r of lista) porId[r.id] = r
    setResultados(porId)
    const bien = lista.filter(r => r.ok).reduce((n, r) => n + r.partes.length, 0)
    const mal = lista.filter(r => !r.ok).length
    const movidas = elegidas.filter(s => s.estado.k === 'movida' && porId[s.id]?.ok).length
    setResumen(
      (bien ? 'Mandados ' + bien + ' ' + (bien === 1 ? 'entreno' : 'entrenos') + ' a su COROS. Los verá cuando sincronice el reloj.' : '') +
      (movidas ? ' ' + (movidas === 1 ? 'La que moviste sigue también en el día de antes' : 'Las que moviste siguen también en el día de antes') + ': avísale para que ' + (movidas === 1 ? 'la borre.' : 'las borre.') : '') +
      (mal ? ' ' + mal + ' no ' + (mal === 1 ? 'ha ido' : 'han ido') + ': mira el motivo en su fila.' : ''),
    )
    setMarcadas({})
    await cargar()
    onCambio()
  }

  const olvidar = async (g: SigueEnCoros) => {
    const { ok, cuerpo } = await llamarReloj(RUTA, { accion: 'olvidar', idDeportista, idEnvio: g.id })
    if (!ok) { avisarMal(String(cuerpo.error || 'No se ha podido quitar.')); return }
    await cargar()
    onCambio()
  }

  const motivoApagado = mandando ? '' : entrenosAMandar ? '' : conAccion.length ? 'Marca al menos una para mandarla.' : 'No hay nada que mandar esta semana.'

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-[60] sm:p-4" onClick={() => { if (!mandando) onCerrar() }}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="t-su-coros">

        <div className="flex justify-between items-start gap-4 p-5 pb-3 border-b border-gray-800">
          <div className="min-w-0">
            <h3 id="t-su-coros" className="text-xl font-bold">⌚ Mandar a su COROS</h3>
            <p className="text-gray-500 text-xs mt-1">
              {[nombre, 'COROS conectado', datos?.ultimaSincronizacion ? 'sincronizó el ' + diaLargo(datos.ultimaSincronizacion) : ''].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onCerrar} disabled={mandando} className="text-gray-400 hover:text-white text-2xl leading-none flex-shrink-0" aria-label="Cerrar">×</button>
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => cambiarSemana(-1)} disabled={lunes <= primero || mandando} aria-label="Semana anterior"
              className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 disabled:opacity-35">◀</button>
            <button onClick={() => cambiarSemana(1)} disabled={lunes >= ultimo || mandando} aria-label="Semana siguiente"
              className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 disabled:opacity-35">▶</button>
            <b className="text-sm">{semanaTexto(lunes)}</b>
          </div>

          {lunes === primero && <p className="text-[12.5px] text-gray-400">Los días que ya pasaron no se mandan.</p>}
          {cargando ? <p className="text-sm text-gray-500">Mirando su COROS…</p> : error ? <p className="text-sm text-red-400">{error}</p> : (
            <>
              <p className="text-[13px] text-gray-300">
                {!sesiones.length ? 'Esta semana no tiene sesiones.' : [
                  conAccion.length ? conAccion.length + ' por mandar' : 'Nada por mandar',
                  yaEstan ? yaEstan + ' ya ' + (yaEstan === 1 ? 'está' : 'están') : '',
                  noVan ? noVan + ' no ' + (noVan === 1 ? 'puede' : 'pueden') + ' ir' : '',
                ].filter(Boolean).join(' · ')}
              </p>

              {resumen && <div role="status" className="px-4 py-2.5 rounded-xl text-[13px] border border-green-500/30 bg-green-500/10 text-green-200">✓ {resumen}</div>}
              {datos?.avisoCoros && <p className="text-[12.5px] text-amber-300">{datos.avisoCoros}</p>}

              {siguen.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">Siguen en su COROS</p>
                  {siguen.map(g => (
                    <div key={g.id} className="rounded-xl border border-dashed border-gray-600 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="text-[13px] flex-1 min-w-[220px]">
                        «{g.nombre}», el {diaLargo(g.fecha)}.{' '}
                        <span className="text-gray-400">La {g.idSesion ? 'moviste' : 'borraste'} después de mandarla, y COROS no deja quitarla desde aquí: la tiene que borrar en su app.</span>
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setChat(textoSigue(nombre, g.nombre, g.fecha))} className="text-[12px] bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-2.5 py-1">Avisarle por el chat</button>
                        <button onClick={() => olvidar(g)} className="text-[12px] bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-2.5 py-1">Ya la ha borrado</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {sesiones.map(s => {
                  const mandable = MANDABLES.includes(s.estado.k)
                  const r = resultados?.[s.id]
                  const apagada = !mandable && s.estado.k !== 'ya'
                  return (
                    <div key={s.id} className={'rounded-xl border border-gray-800 bg-white/[0.015] ' + (apagada ? 'opacity-60' : '')}>
                      <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] sm:grid-cols-[22px_56px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center px-3 py-2.5">
                        {mandable && !r ? (
                          <input type="checkbox" id={'coros-' + s.id} checked={marcadas[s.id] !== false} disabled={mandando}
                            onChange={e => setMarcadas(m => ({ ...m, [s.id]: e.target.checked }))}
                            className="w-[17px] h-[17px] accent-orange-500" aria-label={'Mandar ' + nombreDeFila(s)} />
                        ) : <span />}
                        <span className="text-[13px] font-semibold tabular-nums">{diaCorto(s.fecha)}</span>
                        <span className="min-w-0 col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto col-start-2 sm:col-start-auto text-[13.5px] font-semibold break-words">
                          <span className={'inline-block text-[10.5px] font-semibold rounded-md px-1.5 mr-1.5 align-[1px] border ' + chipDisciplina(s.disciplina)}>{etiquetaDisciplina(s.disciplina)}</span>
                          {nombreDeFila(s)}
                        </span>
                        <span className={'justify-self-end text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap ' +
                          (r ? (r.ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-300') : PILDORA[s.estado.k])}>
                          {r ? (r.ok ? '✓ Mandado' : '✕ No ha ido') : textoPildora(s)}
                        </span>
                      </div>
                      <div className="px-3 pb-2.5 sm:pl-[112px] flex flex-col gap-1.5">
                        {r && !r.ok && <p className="text-[12.5px] text-red-300">{r.motivo || r.partes.find(p => p.error)?.error || 'COROS no lo ha aceptado.'}</p>}
                        {r?.ok && r.partes.some(p => p.sinId) && <p className="text-[12.5px] text-amber-300">Mandado, pero COROS no ha dicho su número: si la cambias, la de antes habrá que borrarla en su app.</p>}
                        {!r && s.estado.motivo && <p className="text-[12.5px] text-gray-400">{s.estado.motivo}</p>}
                        {!r && s.estado.k === 'cambia' && <p className="text-[12.5px] text-amber-300">Ha cambiado desde que la mandaste: en su reloj sigue la de antes.</p>}
                        {!r && s.estado.k === 'ya' && <p className="text-[12.5px] text-gray-400">Sin cambios desde que la mandaste{s.estado.enviadoEn ? ' el ' + diaLargo(s.estado.enviadoEn) : ''}.</p>}
                        {!r && !!s.ajenos?.length && (
                          <p className="text-[12.5px] text-amber-300">
                            Ese día ya tiene en su COROS {s.ajenos.map(a => a.nombre ? '«' + a.nombre + '»' : 'un entreno de su biblioteca').join(', ')}
                            {s.ajenos.some(a => a.dePlan) ? ', de su plan de COROS,' : ','} que no mandaste tú
                            {MANDABLES.includes(s.estado.k) ? ': si la mandas, le saldrán los dos.' : s.estado.k === 'ya' ? ': le salen los dos.' : '.'}
                          </p>
                        )}
                        {!r && s.estado.k === 'movida' && s.estado.de?.[0] && (
                          <div className="flex flex-wrap gap-x-3 gap-y-2 items-center bg-amber-400/10 border border-amber-400/35 rounded-lg px-2.5 py-2 text-[12.5px] text-amber-100">
                            <p className="flex-1 min-w-[220px]">
                              La mandaste al {diaLargo(s.estado.de[0])} y ahora está el {diaLargo(s.fecha)}. COROS no deja moverla desde aquí: se manda al {diaLargo(s.fecha)}, y la del {diaLargo(s.estado.de[0])} la tiene que borrar en su app.
                            </p>
                            <button onClick={() => setChat(textoMovida(nombre, nombreDeFila(s), s.estado.de![0], s.fecha))}
                              className="text-[12px] bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-2.5 py-1">Avisarle por el chat</button>
                          </div>
                        )}
                        {s.entrenos.length > 0 && (
                          <>
                            <button onClick={() => setAbiertas(a => ({ ...a, [s.id]: !a[s.id] }))} aria-expanded={!!abiertas[s.id]}
                              className="self-start text-[12.5px] font-semibold text-orange-400 hover:underline">
                              {abiertas[s.id] ? 'Ocultar ▴' : (s.estado.k === 'ya' ? 'Así le llegó ▾' : 'Así le llegará ▾')}
                            </button>
                            {abiertas[s.id] && <AsiLeLlegara entrenos={s.entrenos} yaMandado={s.estado.k === 'ya'} />}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-5 pt-3 pb-5 border-t border-gray-800 flex flex-col gap-2">
          <AvisoEnLinea aviso={aviso} />
          <div className="flex justify-end gap-2">
            <button onClick={onCerrar} disabled={mandando} className="text-gray-400 hover:text-white text-sm px-3 py-2 transition">{resumen ? 'Cerrar' : 'Cancelar'}</button>
            <button onClick={mandar} disabled={!entrenosAMandar || mandando}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              {mandando ? 'Mandando…' : entrenosAMandar ? 'Mandar ' + entrenosAMandar + ' ' + (entrenosAMandar === 1 ? 'entreno' : 'entrenos') : 'Mandar'}
            </button>
          </div>
          {motivoApagado && <p className="text-[12px] text-gray-400 text-right">{motivoApagado}</p>}
          <p className="text-[12px] text-gray-400">Le llegan al reloj cuando lo sincronice. Desde aquí no se pueden mover ni borrar después: eso lo hace en su app de COROS.</p>
        </div>
      </div>
      {chat !== null && (
        <AvisarPorChat idDeportista={idDeportista} textoInicial={chat} onCerrar={() => setChat(null)}
          onEnviado={() => { setChat(null); avisarOk('Enviado por el chat.') }} />
      )}
    </div>
  )
}

// ------------------------------------------------------------
// La franja de la ficha de sesión
// ------------------------------------------------------------

export function FranjaSuCoros({ idDeportista, idSesion, fecha, version }: {
  idDeportista: number | null | undefined
  idSesion: number
  fecha: string | null | undefined
  /** Cambia cuando se guarda algo de la sesión (sus tareas): vuelve a mirar si sigue igual que en su COROS. */
  version?: unknown
}) {
  const { puede, nombre } = usePuedeMandarACoros(idDeportista)
  const [s, setS] = useState<EstadoSesionCoros | null>(null)
  const [ver, setVer] = useState(false)
  const [mandando, setMandando] = useState(false)
  const [chat, setChat] = useState<string | null>(null)
  const { aviso, ok: avisarOk, mal: avisarMal } = useAviso(5)
  const dia10 = String(fecha || '').slice(0, 10)

  const cargar = useCallback(async () => {
    if (!puede || !idDeportista || !dia10) return
    const r = await pedirEstado(idDeportista, dia10, dia10)
    setS(r?.sesiones.find(x => x.id === idSesion) ?? null)
  }, [puede, idDeportista, idSesion, dia10])
  /* El estado se pone DESPUES de que conteste la ruta (el caso que la regla admite). */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar, version])

  if (!puede || !s || !idDeportista) return null

  const mandar = async () => {
    setMandando(true)
    const { ok, cuerpo } = await llamarReloj(RUTA, { accion: 'mandar', idDeportista, sesiones: [idSesion] })
    setMandando(false)
    const r = ((cuerpo.resultados || []) as ResultadoEnvio[])[0]
    if (!ok || !r?.ok) { avisarMal(String(cuerpo.error || r?.motivo || r?.partes.find(p => p.error)?.error || 'No se ha podido mandar a su COROS.')); return }
    avisarOk(s.estado.k === 'cambia' ? 'Reenviada: en su reloj ya está la nueva.' : 'Mandada a su COROS. La verá cuando sincronice el reloj.')
    await cargar()
  }

  const k = s.estado.k
  const gris = ['no', 'hecha', 'pasada', 'lejos'].includes(k)
  const ambar = k === 'cambia' || k === 'movida'
  const viejo = s.estado.de?.[0]
  return (
    <div className="mb-3.5 flex flex-col gap-2">
      <div className={'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3.5 py-2.5 text-[13px] ' +
        (ambar ? 'bg-amber-400/10 border-amber-400/35 text-amber-100' : gris ? 'border-gray-800 text-gray-400' : 'border-gray-700 bg-white/[0.025]')}>
        <p className="flex-1 min-w-[240px]">
          ⌚{' '}
          {k === 'va' && 'No está en su COROS.'}
          {k === 'ya' && 'En su COROS' + (s.estado.enviadoEn ? ' desde el ' + diaLargo(s.estado.enviadoEn) : '') + ', sin cambios.'}
          {k === 'cambia' && 'Ha cambiado desde que la mandaste: en su reloj sigue la de antes.'}
          {k === 'movida' && viejo && 'Está en su COROS el ' + diaLargo(viejo) + '. Desde aquí no se puede mover allí: se manda al ' + diaLargo(s.fecha) + ' y la del ' + diaLargo(viejo) + ' la borra en su app.'}
          {gris && (k === 'no' ? etiquetaDisciplina(s.disciplina) + ': ' + (s.estado.motivo || '') : s.estado.motivo)}
        </p>
        {!gris && (
          <div className="flex flex-wrap gap-2">
            {k !== 'ya' && (
              <button onClick={mandar} disabled={mandando}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition">
                {mandando ? 'Mandando…' : k === 'cambia' ? 'Reenviar' : k === 'movida' ? 'Mandarla al ' + diaLargo(s.fecha) : 'Mandar a su COROS'}
              </button>
            )}
            {k === 'movida' && viejo && (
              <button onClick={() => setChat(textoMovida(nombre, nombreDeFila(s), viejo, s.fecha))}
                className="text-[12.5px] bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-1.5">Avisarle por el chat</button>
            )}
            {s.entrenos.length > 0 && (
              <button onClick={() => setVer(v => !v)} aria-expanded={ver}
                className="text-[12.5px] font-semibold text-orange-400 hover:underline px-1">
                {ver ? 'Ocultar ▴' : k === 'ya' ? 'Así le llegó ▾' : 'Así le llegará ▾'}
              </button>
            )}
          </div>
        )}
      </div>
      <AvisoEnLinea aviso={aviso} />
      {ver && <AsiLeLlegara entrenos={s.entrenos} yaMandado={k === 'ya'} />}
      {chat !== null && (
        <AvisarPorChat idDeportista={idDeportista} textoInicial={chat} onCerrar={() => setChat(null)}
          onEnviado={() => { setChat(null); avisarOk('Enviado por el chat.') }} />
      )}
    </div>
  )
}
