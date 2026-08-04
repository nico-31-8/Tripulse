'use client'
// ============================================================
// Panel de plataforma — solo para nosotros
// ============================================================
// La puerta NO es esta pantalla: es cada función SQL, que empieza comprobando
// es_admin_plataforma(auth.uid()). Si alguien llega a /admin sin serlo, la
// página no verá más que errores, porque las tablas están cerradas por RLS y
// aquí no se lee ninguna directamente. Esconder la ruta es cosmética; el
// candado está en la base.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'

type Pestana = 'cuentas' | 'invitaciones' | 'salud' | 'eventos'

const fmtFecha = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
}
const fmtHora = (v: string | null) => {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
// "hace 3 días" dice más de un vistazo que una fecha, que es justo lo que se
// busca aquí: quién lleva tiempo sin aparecer.
const hace = (v: string | null) => {
  if (!v) return 'nunca'
  const dias = Math.floor((Date.now() - new Date(v).getTime()) / 86400000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return 'hace ' + dias + ' d'
  return 'hace ' + Math.floor(dias / 30) + ' mes' + (dias >= 60 ? 'es' : '')
}

/* El mensaje que se le manda a la persona, listo para pegar en WhatsApp o en un
   correo. Lleva la dirección: un código suelto no sirve de nada si no sabes dónde
   se mete, y ese "¿y esto dónde lo pongo?" acaba siendo un mensaje de vuelta. */
function mensajeInvitacion(codigo: string, rol: 'entrenador' | 'deportista') {
  const url = typeof window !== 'undefined' ? window.location.origin : 'https://tripulse.app'
  return `Te he dado de alta en TRIPULSE${rol === 'entrenador' ? ' como entrenador' : ''}.

Entra en ${url}/registro y crea tu cuenta con este código:

${codigo}

El correo y la contraseña los eliges tú.`
}

function Chip({ children, tono = 'gris' }: { children: React.ReactNode; tono?: 'gris' | 'naranja' | 'verde' | 'rojo' | 'azul' }) {
  const tonos = {
    gris: 'bg-gray-800 text-gray-400 border-gray-700',
    naranja: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    verde: 'bg-green-500/15 text-green-300 border-green-500/30',
    rojo: 'bg-red-500/15 text-red-300 border-red-500/30',
    azul: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  }
  return <span className={'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ' + tonos[tono]}>{children}</span>
}

export default function AdminPage() {
  const router = useRouter()
  const [estado, setEstado] = useState<'cargando' | 'fuera' | 'dentro'>('cargando')
  const [pestana, setPestana] = useState<Pestana>('cuentas')
  const [resumen, setResumen] = useState<any>(null)
  const [cuentas, setCuentas] = useState<any[]>([])
  const [invitaciones, setInvitaciones] = useState<any[]>([])
  const [entrenadores, setEntrenadores] = useState<any[]>([])
  const [salud, setSalud] = useState<any[]>([])
  const [eventos, setEventos] = useState<any[]>([])
  const [error, setError] = useState('')

  // Formulario de invitación
  const [fRol, setFRol] = useState<'entrenador' | 'deportista'>('entrenador')
  const [fNota, setFNota] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fCupo, setFCupo] = useState('10')
  const [fEntrenador, setFEntrenador] = useState('')
  const [fUsos, setFUsos] = useState('1')
  const [fDias, setFDias] = useState('30')
  const [creando, setCreando] = useState(false)
  const [codigoNuevo, setCodigoNuevo] = useState('')
  const [copiado, setCopiado] = useState(false)

  const cargarTodo = useCallback(async () => {
    const [r, c, i, e, s, ev] = await Promise.all([
      supabase.rpc('admin_resumen'),
      supabase.rpc('admin_cuentas'),
      supabase.rpc('admin_invitaciones'),
      supabase.rpc('admin_entrenadores'),
      supabase.rpc('admin_salud'),
      supabase.rpc('admin_eventos', { _limite: 100 }),
    ])

    // Los errores se ENSEÑAN. La primera versión hacía `data || []` a secas, así
    // que cuando admin_cuentas() reventó por un tipo mal declarado la pantalla
    // puso "0 entrenadores" tan tranquila, con la cabecera diciendo 9 al lado.
    // Un panel que existe para detectar problemas no puede tragarse los suyos.
    const fallos = [
      ['resumen', r.error], ['cuentas', c.error], ['invitaciones', i.error],
      ['entrenadores', e.error], ['salud', s.error], ['eventos', ev.error],
    ].filter(([, err]) => err) as [string, { message: string }][]
    setError(fallos.length
      ? fallos.map(([q, err]) => q + ': ' + err.message).join(' · ')
      : '')

    setResumen(r.data)
    setCuentas(c.data || [])
    setInvitaciones(i.data || [])
    setEntrenadores(e.data || [])
    setSalud(s.data || [])
    setEventos(ev.data || [])
  }, [])

  useEffect(() => {
    const arrancar = async () => {
      const user = await usuarioActual()
      if (!user) { router.replace('/login'); return }
      const { data: esPlataforma } = await supabase.rpc('soy_plataforma')
      if (!esPlataforma) { setEstado('fuera'); return }
      setEstado('dentro')
      await cargarTodo()
    }
    arrancar()
  }, [router, cargarTodo])

  const crearInvitacion = async () => {
    setCreando(true); setError(''); setCodigoNuevo('')
    const { data, error: err } = await supabase.rpc('crear_invitacion', {
      _rol: fRol,
      _nota: fNota || null,
      _email: fEmail || null,
      _id_entrenador: fRol === 'deportista' ? (fEntrenador || null) : null,
      _cupo_deportistas: fRol === 'entrenador' ? (fCupo ? Number(fCupo) : null) : null,
      _usos_max: Number(fUsos) || 1,
      _dias_validez: Number(fDias) || 30,
    })
    setCreando(false)
    if (err) { setError(err.message); return }
    setCodigoNuevo(data as string)
    setFNota(''); setFEmail('')
    await cargarTodo()
  }

  const revocar = async (codigo: string) => {
    if (!confirm('¿Anular el código ' + codigo + '? Quien lo tenga ya no podrá usarlo.')) return
    const { error: err } = await supabase.rpc('revocar_invitacion', { _codigo: codigo })
    if (err) { setError(err.message); return }
    await cargarTodo()
  }

  const cambiarCupo = async (id: string, nombre: string, actual: number | null) => {
    const v = prompt('Cupo de deportistas para ' + nombre + '.\nDéjalo vacío para "sin límite".', actual == null ? '' : String(actual))
    if (v === null) return
    const { error: err } = await supabase.rpc('admin_fijar_cupo', {
      _id_entrenador: id,
      _cupo: v.trim() === '' ? null : Number(v),
    })
    if (err) { setError(err.message); return }
    await cargarTodo()
  }

  const copiar = (txt: string) => {
    navigator.clipboard.writeText(txt)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (estado === 'cargando') {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Cargando…</div>
  }

  if (estado === 'fuera') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-xl font-bold text-white mb-2">Esta zona no es para tu cuenta</h1>
          <button onClick={() => router.push('/dashboard')} className="text-orange-400 hover:underline text-sm mt-2">← Volver</button>
        </div>
      </main>
    )
  }

  const entrenadoresCuentas = cuentas.filter(c => c.rol === 'entrenador')
  const deportistasCuentas = cuentas.filter(c => c.rol === 'deportista')

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        <span className="font-bold text-sm text-orange-400">Plataforma</span>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <div className="max-w-5xl mx-auto px-5 py-6">
        <h1 className="text-2xl font-bold mb-5">Panel de plataforma</h1>

        {/* Resumen de cabecera */}
        {resumen && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-6">
            {[
              { k: 'Entrenadores', v: resumen.entrenadores },
              { k: 'Deportistas', v: resumen.deportistas },
              { k: 'Activos 7 d', v: resumen.activos_7d },
              { k: 'Sesiones 7 d', v: resumen.sesiones_7d },
              { k: 'Invit. abiertas', v: resumen.inv_abiertas },
              { k: 'Errores 24 h', v: resumen.errores_24h, alerta: resumen.errores_24h > 0 },
            ].map(m => (
              <div key={m.k} className={'rounded-xl border p-3 ' + (m.alerta ? 'bg-red-500/10 border-red-500/40' : 'bg-gray-900 border-gray-800')}>
                <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{m.k}</p>
                <p className={'text-2xl font-extrabold leading-none tabular-nums ' + (m.alerta ? 'text-red-300' : 'text-white')}>{m.v ?? 0}</p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-900/25 border border-red-700/50 rounded-xl px-4 py-3 mb-5">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Pestañas */}
        <div className="flex gap-1 mb-5 border-b border-gray-800 overflow-x-auto">
          {([
            ['cuentas', 'Cuentas'],
            ['invitaciones', 'Invitaciones'],
            ['salud', 'Salud de los datos'],
            ['eventos', 'Errores'],
          ] as [Pestana, string][]).map(([k, txt]) => (
            <button key={k} onClick={() => setPestana(k)}
              className={'px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px whitespace-nowrap ' +
                (pestana === k ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
              {txt}
            </button>
          ))}
        </div>

        {/* ===================== CUENTAS ===================== */}
        {pestana === 'cuentas' && (
          <div className="flex flex-col gap-6">
            <section>
              <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Entrenadores ({entrenadoresCuentas.length})</h2>
              <div className="flex flex-col gap-2">
                {entrenadoresCuentas.map(c => {
                  const lleno = c.cupo_deportistas != null && c.n_deportistas >= c.cupo_deportistas
                  return (
                    <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-bold text-white">{c.nombre || '(sin nombre)'}</p>
                          <p className="text-gray-500 text-xs truncate">{c.email}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Chip tono={lleno ? 'rojo' : 'naranja'}>
                            {c.n_deportistas} / {c.cupo_deportistas == null ? '∞' : c.cupo_deportistas} deportistas
                          </Chip>
                          <button onClick={() => cambiarCupo(c.id, c.nombre || c.email, c.cupo_deportistas)}
                            className="text-gray-500 hover:text-orange-400 text-xs underline transition">cambiar cupo</button>
                        </div>
                      </div>
                      <p className="text-gray-600 text-[11px] mt-2">
                        Alta {fmtFecha(c.alta)} · Último acceso {hace(c.ultimo_acceso)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>

            <section>
              <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Deportistas ({deportistasCuentas.length})</h2>
              <div className="flex flex-col gap-2">
                {deportistasCuentas.length === 0 && <p className="text-gray-600 text-sm">Ninguno todavía.</p>}
                {deportistasCuentas.map(c => (
                  <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-bold text-white">{c.nombre || '(sin nombre)'}</p>
                        <p className="text-gray-500 text-xs truncate">{c.email}</p>
                      </div>
                      {c.entrenador
                        ? <Chip tono="azul">con {c.entrenador}</Chip>
                        : <Chip tono="rojo">sin entrenador</Chip>}
                    </div>
                    <div className="flex gap-4 text-[11px] text-gray-600 mt-2 flex-wrap tabular-nums">
                      <span>{c.n_realizadas}/{c.n_sesiones} sesiones</span>
                      <span>{c.n_wellness} wellness</span>
                      <span>Últ. sesión {c.ultima_sesion ? fmtFecha(c.ultima_sesion) : '—'}</span>
                      <span>Últ. acceso {hace(c.ultimo_acceso)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ===================== INVITACIONES ===================== */}
        {pestana === 'invitaciones' && (
          <div className="flex flex-col gap-6">
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="font-bold text-lg mb-4">Crear invitación</h2>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {(['entrenador', 'deportista'] as const).map(r => (
                  <button key={r} onClick={() => setFRol(r)}
                    className={'py-2.5 rounded-lg text-sm font-medium border-2 transition capitalize ' +
                      (fRol === r ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500')}>
                    {r}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Para quién es (solo para que te acuerdes)</label>
                  <input value={fNota} onChange={e => setFNota(e.target.value)} placeholder="Ej: Marta, del club de Vitoria"
                    className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                </div>

                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Atarla a un email — opcional</label>
                  <input value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="Si lo pones, solo ese correo podrá usarla"
                    className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                </div>

                {fRol === 'entrenador' ? (
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Cuántos deportistas podrá tener</label>
                    <input type="number" min={0} value={fCupo} onChange={e => setFCupo(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                    <p className="text-gray-600 text-[11px] mt-1">Vacío = sin límite. Se puede cambiar después desde Cuentas.</p>
                  </div>
                ) : (
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Se vincula con este entrenador</label>
                    <select value={fEntrenador} onChange={e => setFEntrenador(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full">
                      <option value="">Sin entrenador (se vincula él luego)</option>
                      {entrenadores.map(e2 => (
                        <option key={e2.id} value={e2.id}>
                          {e2.nombre} — {e2.n_deportistas}/{e2.cupo_deportistas == null ? '∞' : e2.cupo_deportistas}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Cuántas personas pueden usarlo</label>
                    <input type="number" min={1} value={fUsos} onChange={e => setFUsos(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Días de validez</label>
                    <input type="number" min={0} value={fDias} onChange={e => setFDias(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                  </div>
                </div>
                <p className="text-gray-600 text-[11px] -mt-1">
                  {Number(fUsos) <= 1
                    ? 'Código personal: en cuanto alguien lo canjee, deja de funcionar.'
                    : `Lo podrán canjear ${fUsos} personas distintas. Un código compartido se puede reenviar, así que baja los días de validez.`}
                </p>

                <button onClick={crearInvitacion} disabled={creando}
                  className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-semibold transition disabled:opacity-50">
                  {creando ? 'Creando…' : 'Crear código'}
                </button>
              </div>

              {codigoNuevo && (
                <div className="mt-4 bg-green-500/10 border border-green-500/40 rounded-xl p-4">
                  <p className="text-green-400 text-xs mb-1">Código creado — pásaselo a quien va a entrar</p>
                  <p className="text-2xl font-extrabold tracking-[0.2em] text-white font-mono mb-3">{codigoNuevo}</p>
                  {/* TRIPULSE no manda emails: los códigos se pasan a mano. Copiar el
                      código suelto obliga a escribir el mensaje cada vez y a acordarse
                      de decir dónde se usa. Esto lo deja listo para pegar. */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => copiar(codigoNuevo)}
                      className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition">
                      {copiado ? '✓ Copiado' : 'Copiar código'}
                    </button>
                    <button onClick={() => copiar(mensajeInvitacion(codigoNuevo, fRol))}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                      Copiar mensaje entero
                    </button>
                  </div>
                  <pre className="mt-3 text-[11px] text-gray-500 bg-gray-950/60 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
{mensajeInvitacion(codigoNuevo, fRol)}
                  </pre>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Códigos ({invitaciones.length})</h2>
              <div className="flex flex-col gap-2">
                {invitaciones.length === 0 && <p className="text-gray-600 text-sm">Todavía no has creado ninguno.</p>}
                {invitaciones.map(i => {
                  const caducada = i.caduca && new Date(i.caduca) < new Date()
                  const agotada = i.usos >= i.usos_max
                  const viva = !i.revocada && !caducada && !agotada
                  return (
                    <div key={i.codigo} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-white tracking-widest">{i.codigo}</p>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {i.nota || 'sin nota'}
                            {i.email && <> · atada a {i.email}</>}
                            {i.entrenador && <> · con {i.entrenador}</>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Chip tono={i.rol === 'entrenador' ? 'naranja' : 'azul'}>{i.rol}</Chip>
                          {i.revocada ? <Chip tono="rojo">anulada</Chip>
                            : agotada ? <Chip tono="verde">usada</Chip>
                            : caducada ? <Chip tono="gris">caducada</Chip>
                            : <Chip tono="verde">activa</Chip>}
                          {viva && (
                            <button onClick={() => revocar(i.codigo)}
                              className="text-gray-600 hover:text-red-400 text-xs underline transition">anular</button>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-600 text-[11px] mt-2 tabular-nums">
                        {i.usos}/{i.usos_max} usos · creada {fmtFecha(i.creada_en)}
                        {i.caduca && <> · caduca {fmtFecha(i.caduca)}</>}
                        {i.usada_por && <> · la usó {i.usada_por}</>}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}

        {/* ===================== SALUD ===================== */}
        {pestana === 'salud' && (
          <div className="flex flex-col gap-2">
            <p className="text-gray-500 text-sm mb-2">
              Las incoherencias que vamos cazando a mano, en una lista. Un cero es buena señal.
            </p>
            {salud.map(s => {
              const hay = Number(s.n) > 0
              const tono = !hay ? 'verde' : s.gravedad === 'error' ? 'rojo' : s.gravedad === 'aviso' ? 'naranja' : 'gris'
              return (
                <div key={s.clave}
                  className={'rounded-xl border p-3.5 flex items-center justify-between gap-4 ' +
                    (hay && s.gravedad === 'error' ? 'bg-red-500/8 border-red-500/40'
                      : hay && s.gravedad === 'aviso' ? 'bg-orange-500/8 border-orange-500/30'
                      : 'bg-gray-900 border-gray-800')}>
                  <p className="text-sm text-gray-300">{s.etiqueta}</p>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className={'text-xl font-extrabold tabular-nums ' +
                      (!hay ? 'text-green-400' : s.gravedad === 'error' ? 'text-red-300' : s.gravedad === 'aviso' ? 'text-orange-300' : 'text-gray-400')}>
                      {s.n}
                    </span>
                    <Chip tono={tono as any}>{!hay ? 'ok' : s.gravedad}</Chip>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ===================== EVENTOS ===================== */}
        {pestana === 'eventos' && (
          <div className="flex flex-col gap-2">
            <p className="text-gray-500 text-sm mb-2">
              Fallos que la app ha ido registrando. Antes se los quedaba la consola del navegador de quien los sufría.
            </p>
            {eventos.length === 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
                <p className="text-gray-500 text-sm">Nada registrado todavía.</p>
              </div>
            )}
            {eventos.map(e => (
              <div key={e.id} className={'rounded-xl border p-3.5 ' +
                (e.nivel === 'error' ? 'bg-red-500/8 border-red-500/30' : 'bg-gray-900 border-gray-800')}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="text-sm text-gray-200 font-medium min-w-0 break-words">{e.mensaje}</p>
                  <Chip tono={e.nivel === 'error' ? 'rojo' : e.nivel === 'aviso' ? 'naranja' : 'gris'}>{e.nivel}</Chip>
                </div>
                <p className="text-gray-600 text-[11px] mt-1.5">
                  {fmtHora(e.ts)}{e.origen && <> · {e.origen}</>}{e.quien && <> · {e.quien}</>}
                </p>
                {e.detalle && (
                  <pre className="mt-2 text-[10px] text-gray-500 bg-gray-950 rounded-lg p-2.5 overflow-x-auto">
                    {JSON.stringify(e.detalle, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
