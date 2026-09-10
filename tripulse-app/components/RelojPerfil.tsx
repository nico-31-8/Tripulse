'use client'
// ============================================================
// TRIPULSE — Conectar el reloj, desde el perfil del deportista
// ============================================================
// Solo lo ve el deportista: el permiso lo da el dueño de la cuenta de Polar.
//
// Enseña lo que ha llegado con sus nombres de verdad —«HRV nocturna (RMSSD)»,
// «FC media nocturna»— y no como si fueran los campos del wellness, porque
// todavía no lo son: esa traducción tiene su propia fase y sus trampas.

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { llamarReloj } from '@/lib/relojes-cliente'
import { textoHoras } from '@/lib/noches-reloj'

interface Conexion {
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

  const [cargando, setCargando] = useState(true)
  const [con, setCon] = useState<Conexion | null>(null)
  const [filas, setFilas] = useState<Fila[]>([])
  const [ocupado, setOcupado] = useState<'' | 'conectar' | 'sincronizar' | 'desconectar'>('')
  const [ahora, setAhora] = useState(0)

  /* La vuelta de Polar llega aquí con ?reloj=… El mensaje sale directamente de
     la dirección al montar, sin pasar por un efecto. */
  const vuelta = params.get('reloj')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(() =>
    vuelta === 'polar-conectado' ? { tipo: 'ok', texto: 'Polar conectado. Trayendo tus últimas noches…' }
      : vuelta === 'polar-error' ? { tipo: 'error', texto: params.get('motivo') || 'No se ha podido conectar Polar.' }
        : null)

  const cargar = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from('reloj_conexion').select('conectado_en, caduca_en, ultima_sincronizacion, ultimo_error')
        .eq('proveedor', 'polar').maybeSingle(),
      supabase.from('reloj_medicion').select('tipo, fecha, id_externo, datos')
        .eq('proveedor', 'polar').order('fecha', { ascending: false }).limit(80),
    ])
    setCon((c.data as Conexion) || null)
    setFilas((m.data as Fila[]) || [])
    setAhora(Date.now())
    setCargando(false)
  }, [])

  const sincronizar = useCallback(async (silencioso = false) => {
    setOcupado('sincronizar')
    const { ok, cuerpo } = await llamarReloj('/api/relojes/polar/sincronizar')
    setOcupado('')
    if (!ok) setAviso({ tipo: 'error', texto: String(cuerpo.error || 'No se ha podido sincronizar.') })
    else if (!silencioso || cuerpo.aviso) {
      const partes = [
        cuerpo.noches + ' noches',
        cuerpo.recargas + ' recargas',
        cuerpo.entrenos + (cuerpo.entrenos === 1 ? ' entreno' : ' entrenos'),
      ]
      setAviso({ tipo: cuerpo.aviso ? 'error' : 'ok', texto: cuerpo.aviso ? String(cuerpo.aviso) : 'Recibido de Polar: ' + partes.join(', ') + '.' })
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
      if (vivo && vuelta === 'polar-conectado') await sincronizar(true)
    }
    if (vuelta) router.replace('/perfil', { scroll: false })
    arrancar()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const conectar = async () => {
    setOcupado('conectar'); setAviso(null)
    const { ok, cuerpo } = await llamarReloj('/api/relojes/polar/conectar')
    if (ok && typeof cuerpo.url === 'string') { window.location.href = cuerpo.url; return }
    setOcupado('')
    setAviso({ tipo: 'error', texto: String(cuerpo.error || 'No se ha podido empezar la conexión.') })
  }

  const desconectar = async () => {
    if (!confirm('¿Desconectar Polar? Dejará de llegar tu sueño y tus entrenos. Lo ya recibido se queda en tu historial.')) return
    setOcupado('desconectar'); setAviso(null)
    const { ok, cuerpo } = await llamarReloj('/api/relojes/polar/desconectar')
    setOcupado('')
    setAviso(ok
      ? { tipo: cuerpo.aviso ? 'error' : 'ok', texto: String(cuerpo.aviso || 'Polar desconectado.') }
      : { tipo: 'error', texto: String(cuerpo.error || 'No se ha podido desconectar.') })
    await cargar()
  }

  /* Noche = sueño + recarga del mismo día, en una sola fila. */
  const noches = Array.from(new Set(filas.filter(f => f.tipo !== 'entreno').map(f => f.fecha)))
    .sort().reverse().slice(0, 7)
    .map(fecha => ({
      fecha,
      sueno: filas.find(f => f.tipo === 'sueno' && f.fecha === fecha)?.datos,
      recarga: filas.find(f => f.tipo === 'recarga' && f.fecha === fecha)?.datos,
    }))
  const entrenos = filas.filter(f => f.tipo === 'entreno').slice(0, 5)

  const caducaPronto = !!con?.caduca_en && ahora > 0 && (new Date(con.caduca_en).getTime() - ahora) < 30 * 86400000

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h3 className="text-xl font-bold">Reloj</h3>
        {con && (
          <span className="text-xs px-3 py-1 rounded-full font-medium bg-emerald-950 text-emerald-300 border border-emerald-900">
            Polar conectado
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
            Conecta tu cuenta de Polar y TRIPULSE traerá tu sueño, tu HRV nocturna y los entrenos
            que subas. Tu entrenador lo verá para ajustar tu plan, y tú tendrás menos que apuntar.
          </p>
          <button onClick={conectar} disabled={!!ocupado}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50">
            {ocupado === 'conectar' ? 'Abriendo Polar…' : 'Conectar Polar'}
          </button>
          <p className="text-gray-500 text-xs mt-3 leading-relaxed">
            Te llevará a Polar para que des permiso. <strong className="text-gray-300">Después, entra en
            account.polar.com y acepta los consentimientos obligatorios</strong>: sin ellos Polar no deja
            leer nada, aunque aquí salga como conectado.
          </p>
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
          {caducaPronto && (
            <p className="text-xs text-amber-300 mt-2">
              La conexión caduca el {new Date(con.caduca_en!).toLocaleDateString('es-ES')}. Polar no la renueva sola:
              ese día habrá que desconectar y volver a conectar.
            </p>
          )}

          <div className="flex gap-2 mt-4 flex-wrap">
            <button onClick={() => sincronizar(false)} disabled={!!ocupado}
              className="flex-1 min-w-[160px] bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white py-2.5 rounded-lg text-sm transition disabled:opacity-50">
              {ocupado === 'sincronizar' ? 'Trayendo…' : '⟳ Sincronizar ahora'}
            </button>
            <button onClick={desconectar} disabled={!!ocupado}
              className="bg-transparent hover:bg-red-950/40 border border-gray-800 hover:border-red-900 text-gray-400 hover:text-red-300 px-4 py-2.5 rounded-lg text-sm transition disabled:opacity-50">
              {ocupado === 'desconectar' ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>

          {/* LO QUE HA LLEGADO. Con sus nombres de verdad: la HRV de Polar es el
              RMSSD de cuatro horas de sueño, no la que se apunta al despertar. */}
          <div className="mt-5">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Últimas noches</p>
            {noches.length === 0 ? (
              <p className="text-gray-600 text-sm">
                Todavía no ha llegado ninguna. Si acabas de conectar, sincroniza tu reloj con la app de Polar y pulsa «Sincronizar ahora».
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
                Ninguno todavía. Polar solo comparte los entrenos que subas a Polar Flow a partir de ahora, no los de antes de conectar.
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
    </div>
  )
}
