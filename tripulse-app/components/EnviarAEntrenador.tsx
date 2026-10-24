'use client'
// ============================================================
// Enviar a otro entrenador: la ventana
// ============================================================
// La abren la sesión («Enviar como plantilla»), el panel de plantillas, Tests
// propios y Zonas propias. Al otro se le busca por su correo EXACTO —la base no
// deja recorrer la lista de entrenadores— y debajo salen aquellos a los que ya
// les has mandado algo. Lo que se manda es una copia (lib/envios).
//
// Puede llevar VARIAS cosas («varios»: lo arma «Mandar algo» en Envíos), y un
// test puede llevarse las zonas que salen de él: a quien lo recibe le llega
// todo en un solo envío, y lo acepta todo junto.
//
// Y un DEPORTISTA («Pasar a otro entrenador»): no es una copia, es un traspaso
// (supabase/envios-traspaso.sql). Se dice antes si el otro tiene sitio en su
// cupo, y se ofrece mandarle también lo tuyo que usa ese deportista.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { cargaZona } from '@/lib/zonas'
import { textoBloque, type BloqueP } from '@/lib/plantillas'
import { etiquetaDisciplina } from '@/lib/disciplinas'
import {
  buscarEntrenador, enviar, enviarVarios, correoValido, destinatariosPrevios, queViaja, zonasDesconocidas, plantillaParaEnviar,
  resumenVarios, zonasDeTest, testsDeHitos, motivoNoSeManda, pedirTraspaso, entrenadorTieneSitio, cargarLoQueUsa, textoLoQueUsa,
  sinLoSuyo, primerNombre, type LoQueUsa,
} from '@/lib/envios'

export interface ChipZona { sigla: string; nombre: string; color: string }
export interface PlantillaQueEnviar { nombre: string; disciplina: string; objetivo?: string | null; bloques: BloqueP[] }
export interface TestQueEnviar { id: number; nombre: string; detalle?: string }
export interface ZonasQueEnviar {
  id: number; nombre: string; detalle?: string
  zonas: ChipZona[]
  /** Los tests propios de los que salen: viajan con ellas. */
  tests: string[]
}

/** Un deportista tuyo, para pasárselo a otro entrenador. */
export interface DeportistaQueEnviar {
  id: number
  nombre: string
  tieneCuenta: boolean
  /** Un evaluado (solo tests): no gasta cupo, y al otro le llega también como evaluado. */
  soloTest?: boolean
  detalle?: string
}

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
  | ({ tipo: 'test' } & TestQueEnviar)
  | ({ tipo: 'zonas' } & ZonasQueEnviar)
  | { tipo: 'varios'; plantillas: PlantillaQueEnviar[]; tests: TestQueEnviar[]; zonas: ZonasQueEnviar[] }
  | ({ tipo: 'deportista' } & DeportistaQueEnviar)

/** Unas zonas que salen del test que se manda, para llevárselas con él. */
interface Anclada { id: number; nombre: string; zonas: ChipZona[]; otros: string[]; motivo: string | null }

type Busqueda =
  | { correo: string; estado: 'buscando' | 'no' | 'tu' }
  | { correo: string; estado: 'si'; id: string; nombre: string }
  | { correo: string; estado: 'error'; error: string }

const DESCANSO = (s?: number) => !s ? '' : s >= 60 ? (s % 60 ? Math.floor(s / 60) + '′' + String(s % 60).padStart(2, '0') + '″' : s / 60 + '′') : s + '″'

/**
 * Lo que dice la ventana al pasar un deportista: que es un traspaso, si el otro
 * tiene sitio, lo tuyo que usa (con la casilla) y si tiene que aceptarlo él
 * también. Solo pinta: los datos se los da la ventana.
 */
export function AvisoTraspaso({ suNombre, tieneCuenta, soloTest = false, destino, otro, hayHueco, loSuyo, conLoSuyo, onConLoSuyo, bloqueado = false }: {
  suNombre: string
  tieneCuenta: boolean
  /** Un evaluado: no se mira el cupo, y al otro le llega a sus Evaluados. */
  soloTest?: boolean
  /** El nombre de quien lo recibe, cuando ya se ha encontrado. */
  destino: string | null
  /** Su primer nombre, o «el otro entrenador». */
  otro: string
  /** undefined mientras se mira; false con el cupo lleno; null si no se sabe. */
  hayHueco: boolean | null | undefined
  loSuyo: LoQueUsa | null
  conLoSuyo: boolean
  onConLoSuyo: (v: boolean) => void
  bloqueado?: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs leading-relaxed bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2.5 text-amber-100/90 flex flex-col gap-1">
        <b className="text-white font-semibold text-[13px]">
          Es un traspaso: {suNombre} pasa a {soloTest ? 'los Evaluados' : 'la lista'} de {destino || 'otro entrenador'} y dejas de ver su ficha.
        </b>
        <span>{soloTest ? 'Sus tests van' : 'Su historial, sus tests y su plan van'} con {suNombre}. Sale de tus grupos.</span>
        {destino && (
          soloTest ? <span className="text-emerald-300">No gasta cupo: a {otro} le llega a sus Evaluados, como lo tienes tú.</span>
            : hayHueco === undefined ? <span className="text-gray-400">Mirando si tiene sitio…</span>
            : hayHueco === false ? <span className="text-amber-200 font-semibold">{destino} tiene el cupo lleno: ahora no puede recibir a nadie.</span>
              : hayHueco === true ? <span className="text-emerald-300">{destino} tiene sitio.</span> : null
        )}
      </div>
      {loSuyo && loSuyo.tests.length + loSuyo.zonas.length + loSuyo.ejercicios.length > 0 && (
        <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
          <input type="checkbox" checked={conLoSuyo} onChange={e => onConLoSuyo(e.target.checked)} disabled={bloqueado}
            className="mt-0.5 w-4 h-4 accent-orange-500 flex-shrink-0" />
          <span className="flex flex-col gap-0.5 min-w-0">
            <span>Mandarle también lo tuyo que usa {suNombre}</span>
            <span className="text-gray-400 text-xs leading-relaxed">
              {textoLoQueUsa(loSuyo)}: le llegan como copias suyas, y lo de {suNombre} pasa a ellas. {sinLoSuyo(loSuyo, otro)}
            </span>
          </span>
        </label>
      )}
      <p className="text-xs leading-relaxed bg-sky-400/10 border border-sky-400/30 rounded-lg px-3 py-2 text-sky-100/90">
        {tieneCuenta
          ? suNombre + ' tiene cuenta: también tendrá que aceptarlo. Hasta entonces sigue contigo.'
          : 'Es una ficha sin cuenta: basta con que acepte ' + otro + '.'}
      </p>
    </div>
  )
}

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
  /* Al mandar un test: las zonas que salen de él, y las que se llevan. */
  const [ancladas, setAncladas] = useState<Anclada[]>([])
  const [marcadas, setMarcadas] = useState<number[]>([])
  const idTest = que.tipo === 'test' ? que.id : null
  /* Al pasar un deportista: lo tuyo que usa (null mientras se mira), si se
     manda con él, y si quien lo recibe tiene sitio en su cupo. */
  const idDeportista = que.tipo === 'deportista' ? que.id : null
  const [loSuyo, setLoSuyo] = useState<LoQueUsa | null>(null)
  const [conLoSuyo, setConLoSuyo] = useState(true)
  const [sitio, setSitio] = useState<{ para: string; hay: boolean | null } | null>(null)

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

  /* Las zonas que salen del test: las clasificaciones TUYAS que lo usan de hito.
     Si alguna sale también de otro test tuyo, ese va con ellas (lo añade la
     base); si sale de uno que no es tuyo, no se puede mandar y se dice. */
  useEffect(() => {
    if (idTest == null) return
    let vivo = true
    ;(async () => {
      const user = await usuarioActual()
      if (!vivo || !user) return
      const [{ data: cs }, { data: ts }] = await Promise.all([
        supabase.from('zona_clasificacion').select('id, nombre, hitos').eq('id_entrenador', user.id).eq('archivada', false).order('orden'),
        supabase.from('test_definicion').select('id, nombre').eq('id_entrenador', user.id).eq('archivado', false),
      ])
      const suyas = zonasDeTest(idTest, (cs || []) as { id: number; nombre: string; hitos: string[] | null }[])
      if (!vivo || !suyas.length) return
      const { data: zs } = await supabase.from('zona_entrenador').select('id_clasificacion, sigla, nombre, color, orden')
        .in('id_clasificacion', suyas.map(c => c.id)).eq('archivada', false).order('orden')
      if (!vivo) return
      const zonas = (zs || []) as ({ id_clasificacion: number } & ChipZona)[]
      const misTests = (ts || []) as { id: number; nombre: string }[]
      setAncladas(suyas.map(c => {
        const chips = zonas.filter(z => z.id_clasificacion === c.id).map(z => ({ sigla: z.sigla, nombre: z.nombre, color: z.color }))
        const { nombres, ajenos } = testsDeHitos(c.hitos, misTests)
        const este = misTests.find(x => x.id === idTest)?.nombre
        return {
          id: c.id, nombre: c.nombre, zonas: chips, otros: nombres.filter(n => n !== este),
          motivo: motivoNoSeManda({ tipo: 'zonas', zonas: chips.length, testsAjenos: ajenos }),
        }
      }))
    })()
    return () => { vivo = false }
  }, [idTest])

  /* Lo tuyo que usa el deportista que pasas: lo mismo que mirará la base al
     pedirlo (lib/envios, loQueUsa). */
  useEffect(() => {
    if (idDeportista == null) return
    let vivo = true
    ;(async () => {
      const user = await usuarioActual()
      if (!vivo || !user) return
      const l = await cargarLoQueUsa(supabase, user.id, idDeportista)
      if (vivo) setLoSuyo(l)
    })()
    return () => { vivo = false }
  }, [idDeportista])

  // Escape cierra, como en el resto de ventanas.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar, enviando])

  /* Si quien lo recibe tiene sitio en su cupo. La respuesta se guarda con a
     quién se preguntó: la de una búsqueda vieja no vale para la de ahora. */
  const idDestino = busqueda?.estado === 'si' ? busqueda.id : null
  /* Un evaluado no gasta cupo: ni se pregunta. */
  const soloTest = que.tipo === 'deportista' && !!que.soloTest
  useEffect(() => {
    if (idDeportista == null || soloTest || !idDestino) return
    let vivo = true
    entrenadorTieneSitio(supabase, idDestino).then(hay => { if (vivo) setSitio({ para: idDestino, hay }) })
    return () => { vivo = false }
  }, [idDeportista, soloTest, idDestino])

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
  /* En un traspaso: undefined mientras se mira, false con el cupo lleno, y
     null si no se ha podido saber (lo vuelve a mirar la base al pedirlo). */
  const esTraspaso = que.tipo === 'deportista'
  const hayHueco = esTraspaso && destino && !soloTest ? (sitio && sitio.para === destino.id ? sitio.hay : undefined) : null
  const puede = !!destino && !enviando && !enviadoA && !faltaNombre && !(esTraspaso && (hayHueco === false || hayHueco === undefined))

  /* Un test con zonas marcadas va como «varios»: todo en un solo envío. */
  const conZonas = que.tipo === 'test' && marcadas.length > 0

  const mandar = async () => {
    if (!puede || !destino) return
    setEnviando(true)
    const r = que.tipo === 'deportista'
      ? await pedirTraspaso(supabase, destino.id, que.id, conLoSuyo, mensaje)
      : que.tipo === 'varios'
      ? await enviarVarios(supabase, destino.id, {
        plantillas: que.plantillas.map(p => plantillaParaEnviar(p)),
        tests: que.tests.map(x => x.id),
        clasificaciones: que.zonas.map(z => z.id),
      }, mensaje)
      : conZonas && que.tipo === 'test'
        ? await enviarVarios(supabase, destino.id, { plantillas: [], tests: [que.id], clasificaciones: marcadas }, mensaje)
        : await enviar(supabase, destino.id,
          que.tipo === 'plantilla'
            ? { tipo: 'plantilla', plantilla: plantillaParaEnviar({ nombre, disciplina: que.disciplina, objetivo: que.objetivo, bloques: que.bloques }) }
            : { tipo: que.tipo, id: que.id },
          mensaje)
    setEnviando(false)
    // Un fallo al enviar va en ventana, como un fallo al guardar (política de avisos).
    if (r.error) { alert((esTraspaso ? 'No se ha podido pedir el traspaso.' : 'No se ha podido enviar.') + '\n\n' + r.error); return }
    setEnviadoA(destino.nombre)
    if (r.id) onEnviado?.(r.id)
  }

  const { viaja, noViaja } = queViaja(que.tipo === 'varios' || conZonas ? 'varios' : que.tipo, destino?.nombre)
  /* En un traspaso, cómo se llaman los dos. */
  const suNombre = que.tipo === 'deportista' ? (primerNombre(que.nombre) || 'tu deportista') : ''
  const otro = primerNombre(destino?.nombre || enviadoA) || 'el otro entrenador'
  const desconocidas = que.tipo === 'plantilla' ? zonasDesconocidas(que.bloques)
    : que.tipo === 'varios' ? zonasDesconocidas(que.plantillas.flatMap(p => p.bloques)) : []
  const chips = (zs: ChipZona[]) => (
    <div className="flex flex-wrap gap-1.5">
      {zs.map((z, i) => (
        <span key={i} className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
          style={{ color: z.color, borderColor: z.color + '66', background: z.color + '1a' }}>
          {z.sigla}{z.nombre ? ' · ' + z.nombre : ''}
        </span>
      ))}
    </div>
  )
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
          <h3 id="enviar-titulo" className="font-bold text-lg">{esTraspaso ? 'Pasar a otro entrenador' : 'Enviar a otro entrenador'}</h3>
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
                  {ancladas.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2 mt-1 border-t border-gray-800">
                      <p className="text-gray-400 text-xs">Zonas que salen de este test (si las marcas, le llega todo junto):</p>
                      {ancladas.map(a => (
                        <label key={a.id} className={'flex items-start gap-2.5 text-[13px] ' + (a.motivo ? 'opacity-60' : 'cursor-pointer')}>
                          <input type="checkbox" disabled={!!a.motivo || !!enviadoA} checked={marcadas.includes(a.id)}
                            onChange={e => setMarcadas(m => e.target.checked ? [...m, a.id] : m.filter(x => x !== a.id))}
                            className="mt-0.5 w-4 h-4 accent-orange-500 flex-shrink-0" />
                          <span className="flex flex-col gap-1 min-w-0">
                            <span>Mandar también «{a.nombre}»
                              <span className="text-gray-500"> · {a.zonas.length} {a.zonas.length === 1 ? 'zona' : 'zonas'}
                                {a.otros.length ? ' · va también ' + a.otros.map(o => '«' + o + '»').join(' y ') : ''}</span>
                            </span>
                            {chips(a.zonas)}
                            {a.motivo && <span className="text-amber-300/90 text-xs">{a.motivo}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              ) : que.tipo === 'varios' ? (
                <>
                  <p className="font-semibold text-[15px]">{resumenVarios({ tests: que.tests, clasificaciones: que.zonas, plantillas: que.plantillas })}</p>
                  <p className="text-gray-400 text-xs">Le llega todo en un solo envío, y lo acepta todo junto.</p>
                  <ul className="flex flex-col gap-2.5 pt-1">
                    {que.tests.map(x => (
                      <li key={'t' + x.id} className="flex flex-col gap-0.5">
                        <span className="text-[13.5px]">🧪 Test «{x.nombre}»</span>
                        {x.detalle && <span className="text-gray-500 text-xs">{x.detalle}</span>}
                      </li>
                    ))}
                    {que.zonas.map(z => (
                      <li key={'z' + z.id} className="flex flex-col gap-1">
                        <span className="text-[13.5px]">Zonas «{z.nombre}»{z.detalle ? <span className="text-gray-500 text-xs"> · {z.detalle}</span> : null}</span>
                        {chips(z.zonas)}
                        {z.tests.length > 0 && <span className="text-sky-200/80 text-xs">Van con {z.tests.length === 1 ? 'su test' : 'sus tests'} {z.tests.map(n => '«' + n + '»').join(' y ')}.</span>}
                      </li>
                    ))}
                    {que.plantillas.map((p, i) => (
                      <li key={'p' + i} className="flex flex-col gap-1">
                        <span className="text-[13.5px]">Plantilla «{p.nombre}» <span className="text-gray-500 text-xs">· {etiquetaDisciplina(p.disciplina)} · {p.bloques.length} {p.bloques.length === 1 ? 'bloque' : 'bloques'}</span></span>
                        <span className="flex flex-wrap gap-1">
                          {p.bloques.map((b, j) => (
                            <span key={j} className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none"
                              style={{ background: cargaZona(b.zona).color, color: '#0a0b0f' }}>{b.zona} {textoBloque(b)}</span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {desconocidas.length > 0 && (
                    <p className="text-amber-200/90 text-xs leading-relaxed bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
                      Alguna plantilla usa {desconocidas.length === 1 ? 'una zona tuya' : 'zonas tuyas'} ({desconocidas.join(', ')}): le llega con la sigla,
                      pero sin la zona, así que la app no sabrá su intensidad.
                    </p>
                  )}
                </>
              ) : que.tipo === 'deportista' ? (
                <>
                  <p className="font-semibold text-[15px]">{que.nombre}</p>
                  <p className="text-gray-400 text-xs">
                    {que.detalle || ((que.soloTest ? 'Evaluado (solo tests) · ' : '') + (que.tieneCuenta ? 'Con cuenta en TRIPULSE' : 'Ficha sin cuenta'))}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-[15px]">Zonas «{que.nombre}»</p>
                  {que.detalle && <p className="text-gray-400 text-xs">{que.detalle}</p>}
                  {chips(que.zonas)}
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
              placeholder={esTraspaso ? '«Se muda a tu ciudad.»' : '«Te paso la sesión de series que hablamos.»'} disabled={!!enviadoA}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 resize-y" />
          </div>

          {/* ── Un traspaso: qué es, el cupo del otro y lo tuyo que usa ── */}
          {que.tipo === 'deportista' && (
            <AvisoTraspaso suNombre={suNombre} tieneCuenta={que.tieneCuenta} soloTest={soloTest} destino={destino?.nombre ?? null} otro={otro}
              hayHueco={enviadoA ? null : hayHueco} loSuyo={loSuyo} conLoSuyo={conLoSuyo} onConLoSuyo={setConLoSuyo} bloqueado={!!enviadoA} />
          )}

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
          <p className="text-gray-500 text-xs -mt-2">
            {esTraspaso
              ? 'No es una copia: cuando acepten, ' + suNombre + ' sale de tu' + (soloTest ? 's evaluados.' : ' lista.')
              : 'Es una copia: si después cambias lo tuyo, lo suyo no cambia.'}
          </p>
        </div>

        <div className="px-5 py-4 border-t border-gray-800">
          {enviadoA ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p role="status" className="text-emerald-300 text-sm">
                {que.tipo === 'deportista'
                  ? 'Pedido. Te avisaremos en tu panel cuando ' + (que.tieneCuenta ? 'contesten ' + otro + ' y ' + suNombre : 'conteste ' + otro) + '.'
                  : 'Enviado a ' + enviadoA + '. Le sale en su panel; cuando conteste, lo verás en el tuyo.'}
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
                {esTraspaso ? (enviando ? 'Pidiendo…' : 'Pedir el traspaso') : (enviando ? 'Enviando…' : 'Enviar')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
