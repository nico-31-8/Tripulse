'use client'
// ============================================================
// TRIPULSE — Conectar un reloj, desde el perfil del deportista
// ============================================================
// Solo lo ve el deportista: el permiso lo da el dueño de la cuenta del reloj.
//
// Sin conectar, «Conectar un reloj» despliega las marcas que hay, y al elegir
// una salen sus pasos. Las marcas, sus pasos y si sus datos ya llegan salen de
// lib/relojes-catalogo.ts: aquí no se escribe el nombre de ninguna.
//
// Conectado, enseña lo que ha llegado con sus nombres de verdad —«HRV
// nocturna (RMSSD)», «FC media nocturna»— y no como si fueran los campos del
// wellness, porque no lo son: esa traducción vive en lib/noches-reloj.
//
// Un reloj a la vez: la base no deja conectar el segundo sin quitar el primero.

import { useEffect, useState, useCallback, useId } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { llamarReloj } from '@/lib/relojes-cliente'
import { textoHoras } from '@/lib/noches-reloj'
import {
  RELOJES, relojPorId, nombreReloj, datosListos, sePuedeConectar, leerVuelta, type Proveedor,
} from '@/lib/relojes-catalogo'

interface Conexion {
  proveedor: Proveedor
  conectado_en: string
  caduca_en: string | null
  ultima_sincronizacion: string | null
  ultimo_error: string | null
}

interface Fila {
  tipo: 'sueno' | 'recarga' | 'entreno'
  fecha: string
  id_externo: string
  datos: Record<string, string | number | null>
}

const DIA = (f: string) =>
  new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })


/* LO QUE LLEGA, Y CON QUÉ APARATO. Se enseña antes de conectar (para que
   nadie espere lo que no va a llegar) y otra vez en «¿No llega nada?».

   La regla que lo explica todo: manda DÓNDE SE GRABA la sesión, no la marca
   del sensor. */
function QueLlega({ lineas }: { lineas: [string, string][] }) {
  return (
    <ul className="flex flex-col gap-2 text-xs text-gray-400 leading-relaxed">
      {lineas.map(([fuerte, resto], i) => (
        <li key={i}><strong className="text-gray-200">{fuerte}</strong> {resto}</li>
      ))}
    </ul>
  )
}

/* `ahora` llega de fuera y no se lee aquí: leer el reloj mientras se pinta
   da un resultado distinto en cada repintado. */
function hace(iso: string | null, ahora: number): string {
  if (!iso) return 'nunca'
  const min = Math.round((ahora - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return 'hace ' + min + ' min'
  const h = Math.round(min / 60)
  if (h < 24) return 'hace ' + h + ' h'
  const d = Math.round(h / 24)
  return 'hace ' + d + (d === 1 ? ' día' : ' días')
}


export default function RelojPerfil() {
  const router = useRouter()
  const params = useSearchParams()
  const idLista = useId()

  const [cargando, setCargando] = useState(true)
  const [con, setCon] = useState<Conexion | null>(null)
  const [filas, setFilas] = useState<Fila[]>([])
  const [ocupado, setOcupado] = useState<'' | 'conectar' | 'sincronizar' | 'desconectar'>('')
  const [ahora, setAhora] = useState(0)

  /* La vuelta de la marca llega aquí con ?reloj=polar-conectado, coros-error…
     El mensaje sale directamente de la dirección al montar, sin pasar por un
     efecto. Si salió mal, la marca queda elegida para reintentar sin buscarla. */
  const vuelta = leerVuelta(params.get('reloj'))
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(() =>
    !vuelta ? null
      : vuelta.ok ? { tipo: 'ok', texto: nombreReloj(vuelta.proveedor) + ' conectado.' + (datosListos(vuelta.proveedor) ? ' Trayendo tus últimas noches…' : '') }
        : { tipo: 'error', texto: params.get('motivo') || 'No se ha podido conectar ' + nombreReloj(vuelta.proveedor) + '.' })
  const [elegido, setElegido] = useState<Proveedor | null>(() => (vuelta && !vuelta.ok ? vuelta.proveedor : null))
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    const c = await supabase.from('reloj_conexion')
      .select('proveedor, conectado_en, caduca_en, ultima_sincronizacion, ultimo_error')
      .order('conectado_en', { ascending: false }).limit(1).maybeSingle()
    const conexion = (c.data as Conexion) || null
    /* Solo lo de la marca conectada: si antes tuvo otra, lo suyo se queda en su
       historial, pero no se mezcla aquí con lo de la de ahora. */
    const m = conexion
      ? await supabase.from('reloj_medicion').select('tipo, fecha, id_externo, datos')
        .eq('proveedor', conexion.proveedor).order('fecha', { ascending: false }).limit(80)
      : { data: [] }
    setCon(conexion)
    setFilas((m.data as Fila[]) || [])
    setAhora(Date.now())
    setCargando(false)
  }, [])

  const sincronizar = useCallback(async (p: Proveedor, silencioso = false) => {
    setOcupado('sincronizar')
    const { ok, cuerpo } = await llamarReloj('/api/relojes/' + p + '/sincronizar')
    setOcupado('')
    const nombre = nombreReloj(p)
    if (!ok) setAviso({ tipo: 'error', texto: String(cuerpo.error || 'No se ha podido sincronizar.') })
    else if (cuerpo.pendiente) {
      /* Marca en pruebas: contesta, pero lo que manda todavía no se convierte en nada. */
      if (!silencioso) setAviso({ tipo: 'ok', texto: nombre + ' ha contestado. Tus datos saldrán aquí en cuanto terminemos de prepararlos.' })
    } else if (!silencioso || cuerpo.aviso) {
      const partes = [
        cuerpo.noches + ' noches',
        cuerpo.recargas + ' recargas',
        cuerpo.entrenos + (cuerpo.entrenos === 1 ? ' entreno' : ' entrenos'),
      ]
      setAviso({ tipo: cuerpo.aviso ? 'error' : 'ok', texto: cuerpo.aviso ? String(cuerpo.aviso) : 'Recibido de ' + nombre + ': ' + partes.join(', ') + '.' })
    }
    await cargar()
  }, [cargar])

  /* Se limpia la dirección para que un recargar no repita el mensaje y, si
     acaba de conectar, se sincroniza en el acto: recién conectado, lo primero
     que quiere ver es que llega algo. */
  useEffect(() => {
    let vivo = true
    const arrancar = async () => {
      await cargar()
      if (vivo && vuelta?.ok) await sincronizar(vuelta.proveedor, true)
    }
    if (params.get('reloj')) router.replace('/perfil', { scroll: false })
    arrancar()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const conectar = async (p: Proveedor) => {
    setOcupado('conectar'); setAviso(null)
    const { ok, cuerpo } = await llamarReloj('/api/relojes/' + p + '/conectar')
    if (ok && typeof cuerpo.url === 'string') { window.location.href = cuerpo.url; return }
    setOcupado('')
    setAviso({ tipo: 'error', texto: String(cuerpo.error || 'No se ha podido empezar la conexión.') })
  }

  const desconectar = async () => {
    if (!con) return
    const nombre = nombreReloj(con.proveedor)
    if (!confirm('¿Desconectar ' + nombre + '? Dejará de llegar tu sueño y tus entrenos. Lo ya recibido se queda en tu historial.')) return
    setOcupado('desconectar'); setAviso(null)
    const { ok, cuerpo } = await llamarReloj('/api/relojes/' + con.proveedor + '/desconectar')
    setOcupado('')
    setAviso(ok
      ? { tipo: cuerpo.aviso ? 'error' : 'ok', texto: String(cuerpo.aviso || nombre + ' desconectado.') }
      : { tipo: 'error', texto: String(cuerpo.error || 'No se ha podido desconectar.') })
    setElegido(null)
    await cargar()
  }

  const elegir = (p: Proveedor) => { setElegido(p); setAbierto(false); setAviso(null) }

  /* Noche = sueño + recarga del mismo día, en una sola fila. */
  const noches = Array.from(new Set(filas.filter(f => f.tipo !== 'entreno').map(f => f.fecha)))
    .sort().reverse().slice(0, 7)
    .map(fecha => ({
      fecha,
      sueno: filas.find(f => f.tipo === 'sueno' && f.fecha === fecha)?.datos,
      recarga: filas.find(f => f.tipo === 'recarga' && f.fecha === fecha)?.datos,
    }))
  const entrenos = filas.filter(f => f.tipo === 'entreno').slice(0, 5)

  const rc = con ? relojPorId(con.proveedor) : undefined
  const nombreCon = con ? nombreReloj(con.proveedor) : ''
  const listos = !!con && datosListos(con.proveedor)
  /* Solo donde la conexión caduca de verdad: la de COROS «caduca» cada hora
     y se renueva sola, y avisar de eso sería avisar siempre. */
  const caducaPronto = !!rc?.caducaAlAno && !!con?.caduca_en && ahora > 0 && (new Date(con.caduca_en).getTime() - ahora) < 30 * 86400000

  const r = elegido ? relojPorId(elegido) : undefined

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h3 className="text-xl font-bold">Reloj</h3>
        {con && (
          <span className="text-xs px-3 py-1 rounded-full font-medium bg-emerald-950 text-emerald-300 border border-emerald-900">
            {nombreCon} conectado
          </span>
        )}
      </div>

      {aviso && (
        <p className={'text-sm rounded-lg px-3 py-2 mb-4 ' + (aviso.tipo === 'ok'
          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-900'
          : 'bg-amber-950/60 text-amber-200 border border-amber-900')}>
          {aviso.texto}
        </p>
      )}

      {cargando ? (
        <p className="text-gray-500 text-sm">Cargando…</p>
      ) : !con ? (
        <>
          <p className="text-gray-400 text-sm mb-4">
            Conecta tu reloj y TRIPULSE traerá tu sueño, tu HRV nocturna y los entrenos
            que subas. Tu entrenador lo verá para ajustar tu plan, y tú tendrás menos que apuntar.
          </p>

          {/* EL DESPLEGABLE. En línea, empujando lo de abajo, y no flotando: así
              no lo recorta ninguna tarjeta y en el móvil se lee entero. */}
          {(!r || abierto) && (
            <>
              <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-controls={idLista}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition">
                Conectar un reloj
                <span aria-hidden className={'text-sm transition-transform duration-200 ' + (abierto ? 'rotate-180' : '')}>▾</span>
              </button>

              {abierto && (
                <ul id={idLista} className="mt-2 rounded-lg border border-gray-800 divide-y divide-gray-800 overflow-hidden"
                  onKeyDown={e => { if (e.key === 'Escape') setAbierto(false) }}>
                  {RELOJES.map(x => {
                    const se = sePuedeConectar(x.id)
                    return (
                      <li key={x.id}>
                        <button type="button" disabled={!se} onClick={() => elegir(x.id)}
                          className={'w-full text-left px-4 py-3 flex items-center gap-3 transition '
                            + (se ? 'hover:bg-gray-800/70 focus-visible:bg-gray-800/70 outline-none' : 'cursor-not-allowed')
                            + (x.id === elegido ? ' bg-gray-800/50' : '')}>
                          <span className="flex-1 min-w-0">
                            <span className={'block font-medium ' + (se ? 'text-gray-100' : 'text-gray-500')}>{x.nombre}</span>
                            <span className={'block text-xs mt-0.5 leading-snug ' + (se ? 'text-gray-400' : 'text-gray-600')}>
                              {se ? x.trae : x.nota}
                            </span>
                          </span>
                          {x.estado === 'pruebas' && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-900">Nuevo</span>
                          )}
                          {x.estado === 'proximamente' && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">Próximamente</span>
                          )}
                          {se && <span aria-hidden className="shrink-0 text-gray-600">›</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {r && !abierto && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/40 px-4 py-2.5 mb-4">
                <span className="text-sm">
                  <span className="text-gray-500">Vas a conectar </span>
                  <span className="text-gray-100 font-medium">{r.nombre}</span>
                </span>
                <button type="button" onClick={() => setAbierto(true)}
                  className="text-xs text-gray-400 hover:text-gray-200 underline-offset-2 hover:underline">
                  Cambiar
                </button>
              </div>

              {r.nota && (
                <p className="text-xs text-gray-300 leading-relaxed rounded-lg px-3 py-2.5 mb-4 bg-gray-800/60 border border-gray-700">
                  {r.nota}
                </p>
              )}

              {/* LOS PASOS, NUMERADOS PORQUE LO SON: van en este orden. En Polar
                  el 3 es el que se salta todo el mundo, y sin él la app dice
                  «conectado» y no llega nada, sin ningún error a la vista. */}
              <ol className="flex flex-col gap-2.5 mb-5">
                {r.pasos.map(([t, d], i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 text-orange-400 text-xs font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
                    <span className="text-sm leading-snug">
                      <span className="text-gray-200 font-medium">{t}</span>
                      <span className="block text-gray-500 text-xs mt-0.5">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <button type="button" onClick={() => conectar(r.id)} disabled={!!ocupado}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50">
                {ocupado === 'conectar' ? 'Abriendo ' + r.nombre + '…' : 'Conectar ' + r.nombre}
              </button>

              <details className="mt-4 group">
                <summary className="text-gray-400 hover:text-gray-200 text-xs cursor-pointer select-none">
                  ¿Qué llega, y con qué aparatos?
                </summary>
                <div className="mt-3"><QueLlega lineas={r.queLlega} /></div>
              </details>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-gray-400 text-sm">
            Desde el {new Date(con.conectado_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}última sincronización {hace(con.ultima_sincronizacion, ahora)}
          </p>

          {con.ultimo_error && (
            <p className="text-sm rounded-lg px-3 py-2 mt-3 bg-amber-950/60 text-amber-200 border border-amber-900">
              {con.ultimo_error}
            </p>
          )}

          {/* Marca en pruebas: conectada de verdad, pero lo suyo aún no llega.
              Se dice claro para que nadie busque unas noches que no van a salir. */}
          {!listos && rc?.nota && (
            <p className="text-xs text-gray-300 leading-relaxed rounded-lg px-3 py-2.5 mt-3 bg-gray-800/60 border border-gray-700">
              {rc.nota}
            </p>
          )}

          {/* ¿NO LLEGA NADA? Lo que hay que revisar, en el orden en que suele
              fallar. Plegado: si todo llega, estorba. */}
          {listos && rc && (
            <details className="mt-3">
              <summary className="text-gray-400 hover:text-gray-200 text-xs cursor-pointer select-none">
                ¿No llega nada?
              </summary>
              <ol className="mt-3 flex flex-col gap-2 text-xs text-gray-400 leading-relaxed list-decimal pl-4">
                {rc.siNoLlega.map(([fuerte, resto], i) => (
                  <li key={i}><strong className="text-gray-200">{fuerte}</strong> {resto}</li>
                ))}
              </ol>
              <p className="text-gray-500 text-xs mt-3 mb-2">Y lo que es normal que no llegue:</p>
              <QueLlega lineas={rc.queLlega} />
            </details>
          )}

          {caducaPronto && (
            <p className="text-xs text-amber-300 mt-2">
              La conexión caduca el {new Date(con.caduca_en!).toLocaleDateString('es-ES')}. {nombreCon} no la renueva sola:
              ese día habrá que desconectar y volver a conectar.
            </p>
          )}

          <div className="flex gap-2 mt-4 flex-wrap">
            <button type="button" onClick={() => sincronizar(con.proveedor, false)} disabled={!!ocupado}
              className="flex-1 min-w-[160px] bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white py-2.5 rounded-lg text-sm transition disabled:opacity-50">
              {ocupado === 'sincronizar' ? 'Trayendo…' : '⟳ Sincronizar ahora'}
            </button>
            <button type="button" onClick={desconectar} disabled={!!ocupado}
              className="bg-transparent hover:bg-red-950/40 border border-gray-800 hover:border-red-900 text-gray-400 hover:text-red-300 px-4 py-2.5 rounded-lg text-sm transition disabled:opacity-50">
              {ocupado === 'desconectar' ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>

          {/* LO QUE HA LLEGADO. Con sus nombres de verdad: la HRV de Polar es el
              RMSSD de cuatro horas de sueño, no la que se apunta al despertar. */}
          {listos && (
            <>
              <div className="mt-5">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Últimas noches</p>
                {noches.length === 0 ? (
                  <p className="text-gray-600 text-sm">
                    Todavía no ha llegado ninguna. Si acabas de conectar, sincroniza tu reloj con la app de {nombreCon} y pulsa «Sincronizar ahora».
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm tabular-nums">
                      <thead>
                        <tr className="text-gray-500 text-[11px] text-left">
                          <th className="font-normal py-1.5 pr-3">Noche</th>
                          <th className="font-normal py-1.5 pr-3">Sueño</th>
                          <th className="font-normal py-1.5 pr-3" title="RMSSD medio de 4 h de sueño, en milisegundos">HRV nocturna</th>
                          <th className="font-normal py-1.5" title="Media de esas mismas 4 h de sueño">FC nocturna</th>
                        </tr>
                      </thead>
                      <tbody>
                        {noches.map(n => (
                          <tr key={n.fecha} className="border-t border-gray-800">
                            <td className="py-2 pr-3 text-gray-300 capitalize">{DIA(n.fecha)}</td>
                            <td className="py-2 pr-3">{textoHoras(typeof n.sueno?.dormido_min === 'number' ? n.sueno.dormido_min : null)}</td>
                            <td className="py-2 pr-3">{n.recarga?.rmssd_ms != null ? n.recarga.rmssd_ms + ' ms' : '—'}</td>
                            <td className="py-2">{n.recarga?.fc_media != null ? n.recarga.fc_media + ' ppm' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Últimos entrenos</p>
                {entrenos.length === 0 ? (
                  <p className="text-gray-600 text-sm">
                    Ninguno todavía. {nombreCon} solo comparte los entrenos que subas a {rc?.cuenta || 'tu cuenta'} a partir de ahora, no los de antes de conectar.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {entrenos.map(e => (
                      <li key={e.id_externo} className="flex items-center gap-3 text-sm border-t border-gray-800 pt-1.5">
                        <span className="text-gray-300 capitalize w-24 shrink-0">{DIA(e.fecha)}</span>
                        <span className="flex-1 truncate">{String(e.datos.disciplina || e.datos.deporte_detalle || e.datos.deporte || 'Entreno')}</span>
                        <span className="tabular-nums text-gray-400">{e.datos.duracion_min != null ? e.datos.duracion_min + ' min' : '—'}</span>
                        <span className="tabular-nums text-gray-500 w-16 text-right">{e.datos.fc_media != null ? e.datos.fc_media + ' ppm' : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
