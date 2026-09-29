'use client'
// ============================================================
// TRIPULSE — Cobros: la libreta del entrenador
// ============================================================
//
// Quién te paga, cuánto, y qué queda pendiente. ES UN REGISTRO, NO UNA
// FACTURACIÓN: no emite facturas, no calcula IVA y no cobra.
//
// SOLO LA VE EL ENTRENADOR, y eso no lo decide esta pantalla: lo impide la
// propia base. Las políticas de `tarifa`, `cargo` y `cobro` miran únicamente
// `id_entrenador`, a diferencia del resto de la aplicación —sus zonas, su
// material o sus sesiones las ven los dos—. Ver supabase/cobros.sql.
//
// LA CUENTA NO ESTÁ AQUÍ: está en lib/cobros con sus pruebas. Aquí se pide, se
// pinta y se escribe. Lo que decide si alguien debe o no es una resta que se
// puede comprobar sin abrir el navegador.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { usuarioActual } from '@/lib/sesion'
import { hoyISO, fechaLarga, MESES_LARGOS } from '@/lib/fechas'
import { AvisoEnLinea, useAviso } from '@/components/AvisoEnLinea'
import { fondoDe, inicialDe } from '@/lib/avatar'
import {
  mesActual, moverMes, fechaDelCargo, tarifaEn, cargoDeCuota, saldoDe, resumenDelMes,
  MEDIOS, TEXTO_ESTADO,
  type Tarifa, type Cargo, type Cobro, type SaldoDe, type TipoTarifa, type MedioPago,
} from '@/lib/cobros'

/** «2026-09» → «septiembre 2026». */
const mesLargo = (mes: string): string => {
  const [a, m] = mes.split('-').map(Number)
  return (MESES_LARGOS[m - 1] || '') + ' ' + a
}

/* Un solo sitio para la moneda, por si algún día lleva a alguien fuera. */
const eur = (n: number): string =>
  (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0 }) + ' €'

const PINTA: Record<SaldoDe['estado'], string> = {
  'al-dia': 'bg-green-500/15 text-green-300',
  previsto: 'bg-gray-800 text-gray-400',
  pendiente: 'bg-amber-500/16 text-amber-300',
  atrasado: 'bg-red-500/15 text-red-300',
}

interface Dep { id: number; nombre: string }

export default function CobrosPage() {
  const router = useRouter()
  useRequireEntrenador()

  const [deportistas, setDeportistas] = useState<Dep[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [cargos, setCargos] = useState<Cargo[]>([])
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [mes, setMes] = useState(mesActual())
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [dirigidas, setDirigidas] = useState<Record<number, number>>({})
  const { aviso, mal, ok } = useAviso(5)

  const cargar = useCallback(async () => {
    const user = await usuarioActual()
    if (!user) return
    const { data: deps } = await supabase.from('deportista')
      .select('id, nombre').eq('id_entrenador', user.id).order('nombre')
    const lista = (deps || []) as Dep[]
    setDeportistas(lista)
    if (!lista.length) { setCargando(false); return }

    const ids = lista.map(d => d.id)
    /* Todo el histórico, no solo el mes: quien te debe agosto sigue debiéndotelo
       en septiembre, y el saldo es de siempre. Son tres tablas pequeñas. */
    const [t, c, p] = await Promise.all([
      supabase.from('tarifa').select('*').in('id_deportista', ids),
      supabase.from('cargo').select('*').in('id_deportista', ids),
      supabase.from('cobro').select('*').in('id_deportista', ids),
    ])
    setTarifas((t.data || []) as Tarifa[])
    setCargos((c.data || []) as Cargo[])
    setCobros((p.data || []) as Cobro[])
    setCargando(false)
  }, [])

  /* La regla ve una llamada que acaba en setState; el estado se pone DESPUES de
     que conteste la base, que es el caso que ella misma admite. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  /* CUÁNTAS SESIONES LE HAS DIRIGIDO TÚ ESTE MES. Sale de las series que
     quedaron firmadas con tu nombre al dirigir a pie de pista, así que solo
     cuenta lo que dirigiste CON la app. Por eso se propone y no se impone. */
  useEffect(() => {
    let vivo = true
    const mirar = async () => {
      if (!deportistas.length) return
      const desde = mes + '-01', hasta = fechaDelCargo(mes)
      const { data } = await supabase
        .from('series_realizadas')
        .select('id_deportista, id_tarea, tarea!inner(id_sesion, sesion!inner(fecha_sesion))')
        .eq('anotado_por', 'entrenador')
        .in('id_deportista', deportistas.map(d => d.id))
        .gte('tarea.sesion.fecha_sesion', desde).lte('tarea.sesion.fecha_sesion', hasta)
      if (!vivo || !data) return
      /* Una sesión cuenta UNA vez aunque tenga veinte series firmadas. */
      const porDep: Record<number, Set<number>> = {}
      /* El anidado de Supabase llega como lista aunque sea uno a uno, asi que
         se normaliza en vez de pelearse con el tipo. */
      for (const r of data as unknown as { id_deportista: number; tarea: { id_sesion: number } | { id_sesion: number }[] | null }[]) {
        const t = Array.isArray(r.tarea) ? r.tarea[0] : r.tarea
        const s = t?.id_sesion
        if (!r.id_deportista || !s) continue
        ;(porDep[r.id_deportista] ||= new Set()).add(s)
      }
      setDirigidas(Object.fromEntries(Object.entries(porDep).map(([k, v]) => [k, v.size])))
    }
    mirar().catch(() => { /* Sin la sugerencia se sigue pudiendo cobrar a mano. */ })
    return () => { vivo = false }
  }, [mes, deportistas])

  const deDep = <T extends { id_deportista: number }>(l: T[], id: number) => l.filter(x => x.id_deportista === id)

  const filas = useMemo(() => deportistas.map(d => {
    const misTarifas = deDep(tarifas, d.id)
    const saldo = saldoDe(deDep(cargos, d.id), deDep(cobros, d.id), mes, hoyISO())
    return { dep: d, tarifa: tarifaEn(misTarifas, mes), saldo, tarifas: misTarifas }
  }), [deportistas, tarifas, cargos, cobros, mes])

  const total = useMemo(() => resumenDelMes(filas.map(f => f.saldo)), [filas])

  /* Las cuotas se generan al pedirlo, no solas: si das de baja a alguien en
     octubre, no le queda un cargo fantasma de noviembre esperando. La base
     impide que se dupliquen (índice único por deportista y mes). */
  const generarCuotas = async () => {
    const nuevos = filas
      .map(f => cargoDeCuota(f.tarifas, mes, f.dep.id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .filter(c => !cargos.some(x => x.id_deportista === c.id_deportista && x.mes === mes && x.tipo === 'mensual'))
    if (!nuevos.length) { ok('Las cuotas de ' + mesLargo(mes) + ' ya estaban puestas.'); return }
    setGuardando(true)
    const { error } = await supabase.from('cargo').insert(nuevos)
    setGuardando(false)
    if (error) { mal('No se han podido generar: ' + error.message); return }
    await cargar()
    ok(nuevos.length === 1 ? 'Una cuota generada.' : nuevos.length + ' cuotas generadas.')
  }

  const anadirCargo = async (id: number, concepto: string, importe: number, tipo: TipoTarifa) => {
    if (!(importe > 0)) { mal('El importe tiene que ser mayor que cero.'); return }
    setGuardando(true)
    const { error } = await supabase.from('cargo')
      .insert({ id_deportista: id, fecha: fechaDelCargo(mes), concepto, importe, mes, tipo })
    setGuardando(false)
    if (error) { mal('No se ha podido añadir: ' + error.message); return }
    await cargar()
  }

  const anadirCobro = async (id: number, importe: number, fecha: string, medio: MedioPago) => {
    if (!(importe > 0)) { mal('El importe tiene que ser mayor que cero.'); return }
    setGuardando(true)
    const { error } = await supabase.from('cobro').insert({ id_deportista: id, importe, fecha, medio })
    setGuardando(false)
    if (error) { mal('No se ha podido guardar: ' + error.message); return }
    await cargar()
    ok('Cobro apuntado.')
  }

  const fijarTarifa = async (id: number, tipo: TipoTarifa, importe: number) => {
    setGuardando(true)
    /* La tarifa nueva empieza este mes y no toca las de antes: así subir un
       precio no reescribe lo que costó en marzo. */
    const { error } = await supabase.from('tarifa')
      .insert({ id_deportista: id, tipo, importe, desde: mes + '-01' })
    setGuardando(false)
    if (error) { mal('No se ha podido guardar: ' + error.message); return }
    await cargar()
    ok('Tarifa guardada desde ' + mesLargo(mes) + '.')
  }

  const borrarLinea = async (tabla: 'cargo' | 'cobro', id: number) => {
    if (!confirm('¿Borrar esta línea?\n\nSe va del histórico y el saldo se recalcula.')) return
    const { error } = await supabase.from(tabla).delete().eq('id', id)
    if (error) { mal('No se ha podido borrar: ' + error.message); return }
    await cargar()
  }

  const campo = 'bg-gray-950 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-orange-500'

  if (cargando) return <main className="min-h-screen bg-gray-950 text-gray-500 grid place-items-center">Cargando…</main>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        <span className="text-sm text-gray-500">Cobros</span>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold mb-0">Cobros</h1>
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-xl px-2 py-1">
            <button onClick={() => setMes(m => moverMes(m, -1))} aria-label="Mes anterior"
              className="text-gray-500 hover:text-white px-2 transition">‹</button>
            <span className="text-[13.5px] font-bold min-w-[118px] text-center">{mesLargo(mes)}</span>
            <button onClick={() => setMes(m => moverMes(m, 1))} aria-label="Mes siguiente"
              className="text-gray-500 hover:text-white px-2 transition">›</button>
          </div>
          <span className="flex-1" />
          <button onClick={generarCuotas} disabled={guardando}
            title="Pone la cuota de este mes a quien tenga tarifa mensual. Repetirlo no cobra dos veces."
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-bold px-4 py-2 rounded-lg transition">
            Generar las cuotas
          </button>
        </div>

        <p className="text-gray-500 text-[12.5px] mb-0">
          Tu libreta. <b className="text-gray-400">El deportista no ve nada de esto.</b> Es un registro, no una facturación:
          no emite facturas ni calcula impuestos. La cuota se carga el último día del mes, que es cuando cobras.
        </p>

        <AvisoEnLinea aviso={aviso} />

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            { et: 'Cobrado', v: eur(total.cobrado), d: 'de ' + eur(total.delMes) + ' del mes', c: 'text-green-300' },
            { et: 'Pendiente', v: eur(total.pendiente), d: total.deben === 1 ? '1 persona' : total.deben + ' personas', c: 'text-amber-300' },
            { et: 'Atrasado', v: eur(total.atrasado), d: 'de meses anteriores', c: 'text-red-300' },
            { et: 'Gente que llevas', v: String(deportistas.length), d: filas.filter(f => f.tarifa).length + ' con tarifa', c: 'text-white' },
          ].map(c => (
            <div key={c.et} className="bg-gray-900 rounded-2xl border border-gray-800 p-3.5">
              <p className="text-[10.5px] uppercase tracking-wider text-gray-500 mb-1 mt-0">{c.et}</p>
              <p className={'text-[25px] font-bold leading-none tabular-nums mb-0 ' + c.c}>{c.v}</p>
              <p className="text-[11.5px] text-gray-500 mt-1.5 mb-0">{c.d}</p>
            </div>
          ))}
        </div>

        {!deportistas.length && (
          <p className="text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl py-6 text-center mb-0">
            Todavía no llevas a nadie. En cuanto tengas deportistas, aquí llevas su cuenta.
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {filas.map(({ dep, tarifa, saldo, tarifas: sus }) => {
            const misCargos = deDep(cargos, dep.id).slice().sort((a, b) => a.fecha < b.fecha ? 1 : -1)
            const misCobros = deDep(cobros, dep.id).slice().sort((a, b) => a.fecha < b.fecha ? 1 : -1)
            const sesiones = dirigidas[dep.id] || 0
            const yaCobradas = misCargos.some(c => c.mes === mes && c.tipo === 'sesion')

            return (
              <div key={dep.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="flex items-center gap-3 p-3.5 flex-wrap">
                  <span className="w-9 h-9 rounded-full grid place-items-center font-bold text-[13px] flex-none"
                    style={{ background: fondoDe(dep.nombre) }}>{inicialDe(dep.nombre)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[14.5px] mb-0 truncate">{dep.nombre}</p>
                    <p className="text-[11.5px] text-gray-500 mb-0 truncate">
                      {tarifa
                        ? (tarifa.tipo === 'mensual' ? 'Cuota mensual · ' + eur(tarifa.importe)
                          : tarifa.tipo === 'sesion' ? 'Por sesión · ' + eur(tarifa.importe)
                          : 'Pagos sueltos')
                        : 'Sin tarifa'}
                    </p>
                  </div>
                  <div className="text-right flex-none">
                    <p className="text-[11px] text-gray-500 mb-0">Del mes</p>
                    <p className="text-[15px] font-bold tabular-nums mb-0">{eur(saldo.delMes)}</p>
                  </div>
                  <div className="text-right flex-none w-[86px]">
                    <p className="text-[11px] text-gray-500 mb-0">Cobrado</p>
                    <p className="text-[15px] font-bold tabular-nums mb-0">{eur(saldo.pagadoEnElMes)}</p>
                  </div>
                  <span className={'text-[11.5px] font-bold rounded-full px-2.5 py-1 flex-none ' + PINTA[saldo.estado]}>
                    {saldo.estado === 'al-dia' ? TEXTO_ESTADO['al-dia']
                      : saldo.estado === 'previsto' ? eur(saldo.saldo)
                      : TEXTO_ESTADO[saldo.estado] + ' ' + eur(saldo.saldo)}
                  </span>
                  <button onClick={() => setAbierto(a => a === dep.id ? null : dep.id)}
                    className="text-[12px] font-bold px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-orange-300 hover:border-orange-500 transition flex-none">
                    {abierto === dep.id ? 'Cerrar' : 'Ver'}
                  </button>
                </div>

                {abierto === dep.id && (
                  <div className="border-t border-gray-800 p-3.5 flex flex-col gap-3">
                    {/* Lo que le has dirigido tú este mes. Se PROPONE: la app solo
                        sabe lo que dirigiste con ella delante, así que el número
                        lo confirmas tú. */}
                    {tarifa?.tipo === 'sesion' && sesiones > 0 && !yaCobradas && (
                      <button onClick={() => anadirCargo(dep.id, sesiones + ' sesiones de ' + mesLargo(mes), sesiones * tarifa.importe, 'sesion')}
                        className="text-left rounded-xl border border-orange-500/35 bg-orange-500/8 px-3 py-2.5 text-[12.5px] text-orange-200 hover:border-orange-500 transition">
                        💡 Le has dirigido <b>{sesiones} {sesiones === 1 ? 'sesión' : 'sesiones'}</b> este mes.
                        A {eur(tarifa.importe)} son <b>{eur(sesiones * tarifa.importe)}</b> — pulsa para cargárselas.
                      </button>
                    )}

                    <FormularioCobro onEnviar={(imp, fecha, medio) => anadirCobro(dep.id, imp, fecha, medio)}
                      onCargo={(concepto, imp) => anadirCargo(dep.id, concepto, imp, 'unico')}
                      onTarifa={(tipo, imp) => fijarTarifa(dep.id, tipo, imp)}
                      guardando={guardando} campo={campo} tarifa={tarifa} />

                    {(misCargos.length > 0 || misCobros.length > 0) ? (
                      <div className="flex flex-col gap-1.5">
                        {[...misCargos.map(c => ({ ...c, es: 'cargo' as const })),
                          ...misCobros.map(c => ({ ...c, es: 'cobro' as const }))]
                          .sort((a, b) => a.fecha < b.fecha ? 1 : -1)
                          .map(l => (
                            <div key={l.es + l.id} className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-white/[0.02] px-3 py-2 text-[13px]">
                              <span className="text-gray-500 text-[11.5px] tabular-nums flex-none w-[74px]">{fechaLarga(l.fecha)}</span>
                              <span className="flex-1 min-w-0 truncate">
                                {l.es === 'cargo' ? (l as Cargo).concepto
                                  : 'Pago · ' + (MEDIOS.find(m => m.id === (l as Cobro).medio)?.et || 'otro')}
                              </span>
                              <span className={'font-bold tabular-nums flex-none ' + (l.es === 'cargo' ? 'text-amber-300' : 'text-green-300')}>
                                {(l.es === 'cargo' ? '+' : '−') + eur(l.importe)}
                              </span>
                              <button onClick={() => borrarLinea(l.es, l.id)} aria-label="Borrar"
                                className="text-gray-600 hover:text-red-400 text-[12px] px-1 transition flex-none">🗑</button>
                            </div>
                          ))}
                        <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-gray-800">
                          <span className="text-[11px] uppercase tracking-wider text-gray-500">
                            {saldo.saldo < 0 ? 'A favor' : 'Pendiente'}
                          </span>
                          <span className={'text-[20px] font-bold tabular-nums ' +
                            (saldo.saldo > 0 ? 'text-amber-300' : saldo.saldo < 0 ? 'text-green-300' : 'text-gray-400')}>
                            {eur(Math.abs(saldo.saldo))}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-[12.5px] mb-0">Todavía no hay nada apuntado de {dep.nombre}.</p>
                    )}

                    {sus.length > 1 && (
                      <p className="text-gray-600 text-[11px] mb-0">
                        Tiene {sus.length} tarifas guardadas: cada una vale desde su fecha, así que los meses viejos
                        conservan lo que costaron.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}

/* ── El formulario de una persona ────────────────────────────────────────────
   Apuntar un pago, cargarle algo suelto y fijar lo que le cobras. Va aparte
   porque tiene estado propio y meterlo en el map de arriba obligaría a llevar
   un objeto de borradores por deportista. */
function FormularioCobro({ onEnviar, onCargo, onTarifa, guardando, campo, tarifa }: {
  onEnviar: (importe: number, fecha: string, medio: MedioPago) => void
  onCargo: (concepto: string, importe: number) => void
  onTarifa: (tipo: TipoTarifa, importe: number) => void
  guardando: boolean
  campo: string
  tarifa: Tarifa | null
}) {
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [medio, setMedio] = useState<MedioPago>('bizum')
  const [concepto, setConcepto] = useState('')
  const [impCargo, setImpCargo] = useState('')
  const [tipoT, setTipoT] = useState<TipoTarifa>(tarifa?.tipo || 'mensual')
  const [impT, setImpT] = useState(tarifa ? String(tarifa.importe) : '')
  const [verTarifa, setVerTarifa] = useState(false)

  const rot = 'block text-[9.5px] uppercase tracking-wider text-gray-500 mb-1'
  const boton = 'text-[13px] font-bold px-3.5 py-2 rounded-lg transition disabled:opacity-40'

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2.5 items-end">
        <div><label className={rot}>Ha pagado</label>
          <input className={campo + ' w-[92px]'} inputMode="decimal" placeholder="0" value={importe}
            onChange={e => setImporte(e.target.value)} /></div>
        <div><label className={rot}>Cuándo</label>
          <input type="date" className={campo} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div><label className={rot}>Cómo</label>
          <select className={campo} value={medio} onChange={e => setMedio(e.target.value as MedioPago)}>
            {MEDIOS.map(m => <option key={m.id} value={m.id}>{m.et}</option>)}
          </select></div>
        <button disabled={guardando} className={boton + ' bg-orange-500 hover:bg-orange-600 text-white'}
          onClick={() => { onEnviar(Number(String(importe).replace(',', '.')), fecha, medio); setImporte('') }}>
          Apuntar el pago
        </button>
        <span className="flex-1" />
        <button onClick={() => setVerTarifa(v => !v)}
          className={boton + ' bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'}>
          {verTarifa ? 'Cerrar' : tarifa ? 'Cambiar la tarifa' : 'Ponerle tarifa'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2.5 items-end">
        <div><label className={rot}>Cargarle algo suelto</label>
          <input className={campo + ' w-[190px]'} placeholder="Valoración de fuerza" value={concepto}
            onChange={e => setConcepto(e.target.value)} /></div>
        <div><label className={rot}>Importe</label>
          <input className={campo + ' w-[92px]'} inputMode="decimal" placeholder="0" value={impCargo}
            onChange={e => setImpCargo(e.target.value)} /></div>
        <button disabled={guardando || !concepto.trim()} className={boton + ' bg-gray-800 border border-gray-700 text-gray-300 hover:text-white'}
          onClick={() => { onCargo(concepto.trim(), Number(String(impCargo).replace(',', '.'))); setConcepto(''); setImpCargo('') }}>
          Añadir el cargo
        </button>
      </div>

      {verTarifa && (
        <div className="flex flex-wrap gap-2.5 items-end rounded-xl border border-gray-700 bg-gray-950/60 p-3">
          <div><label className={rot}>Cómo le cobras</label>
            <select className={campo} value={tipoT} onChange={e => setTipoT(e.target.value as TipoTarifa)}>
              <option value="mensual">Cuota mensual</option>
              <option value="sesion">Por sesión</option>
              <option value="unico">Solo cosas sueltas</option>
            </select></div>
          {tipoT !== 'unico' && (
            <div><label className={rot}>{tipoT === 'mensual' ? 'Al mes' : 'Por sesión'}</label>
              <input className={campo + ' w-[92px]'} inputMode="decimal" placeholder="0" value={impT}
                onChange={e => setImpT(e.target.value)} /></div>
          )}
          <button disabled={guardando} className={boton + ' bg-orange-500 hover:bg-orange-600 text-white'}
            onClick={() => { onTarifa(tipoT, Number(String(impT).replace(',', '.')) || 0); setVerTarifa(false) }}>
            Guardar la tarifa
          </button>
          <p className="text-gray-500 text-[11px] basis-full mb-0 mt-1">
            Vale desde este mes hacia adelante. Los meses anteriores conservan lo que costaron.
          </p>
        </div>
      )}
    </div>
  )
}
