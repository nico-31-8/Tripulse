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

type Pestana = 'cuentas' | 'invitaciones' | 'buzon' | 'salud' | 'eventos'

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

  /* Cambiar un código ya enviado. Antes, quedarse corto de usos o de plazo
     obligaba a anularlo y mandar otro — y mandar un segundo código a quien ya
     tiene el primero es la mejor forma de que use el que no toca. */
  const [editando, setEditando] = useState<any>(null)
  const [eUsos, setEUsos] = useState('')
  const [eDias, setEDias] = useState('')
  const [eSinCaduca, setESinCaduca] = useState(false)
  const [eCupo, setECupo] = useState('')
  const [eCupoSinLimite, setECupoSinLimite] = useState(false)
  const [eNota, setENota] = useState('')
  const [eReactivar, setEReactivar] = useState(false)
  const [eGuardando, setEGuardando] = useState(false)
  const [eAviso, setEAviso] = useState('')

  /* El buzón: lo que manda la gente desde la app, y el aviso de mantenimiento
     programado. Los dos viven aquí porque los dos son «hablar con quien usa
     esto», y los dos son cosa de plataforma. */
  const [sugerencias, setSugerencias] = useState<any[]>([])
  const [avisos, setAvisos] = useState<any[]>([])
  const [avMensaje, setAvMensaje] = useState('Volvemos enseguida.')
  const [avDesde, setAvDesde] = useState('')
  const [avHasta, setAvHasta] = useState('')
  const [avGuardando, setAvGuardando] = useState(false)

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

    /* El buzón y los avisos se leen directo de sus tablas, no por RPC: la
       política ya deja pasar solo a la plataforma, así que no hace falta una
       función que vuelva a comprobar lo mismo. */
    const [sug, av] = await Promise.all([
      supabase.from('sugerencia').select('*').order('creada_en', { ascending: false }).limit(100),
      supabase.from('aviso_app').select('*').order('desde', { ascending: false }).limit(10),
    ])
    setSugerencias(sug.data || [])
    setAvisos(av.data || [])
  }, [])

  const marcarSugerencia = async (id: number, estado: string) => {
    const { error: err } = await supabase.from('sugerencia').update({ estado }).eq('id', id)
    if (err) { setError(err.message); return }
    await cargarTodo()
  }

  const programarAviso = async () => {
    if (!avDesde || !avHasta) { setError('Pon las dos horas: desde cuándo y hasta cuándo.'); return }
    const desde = new Date(avDesde), hasta = new Date(avHasta)
    if (!(hasta > desde)) { setError('El final tiene que ser posterior al principio.'); return }

    setAvGuardando(true); setError('')
    const { error: err } = await supabase.from('aviso_app').insert({
      mensaje: avMensaje.trim(), desde: desde.toISOString(), hasta: hasta.toISOString(),
    })
    setAvGuardando(false)
    if (err) {
      setError(/relation|does not exist/i.test(err.message)
        ? 'Falta correr supabase/avisos-y-sugerencias.sql.'
        : err.message)
      return
    }
    setAvDesde(''); setAvHasta('')
    await cargarTodo()
  }

  /* Quitarlo es ponerle fin AHORA, no borrar la fila: así queda constancia de
     qué se anunció y cuándo, que es lo que se pregunta después de una caída. */
  const quitarAviso = async (id: number) => {
    const { error: err } = await supabase.from('aviso_app')
      .update({ hasta: new Date(Date.now() - 1000).toISOString() }).eq('id', id)
    if (err) { setError(err.message); return }
    await cargarTodo()
  }

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
    // Dejar el cupo en blanco creaba un entrenador SIN LÍMITE: su código público
    // admitía altas para siempre. La ausencia de decisión no puede dar el permiso
    // máximo. Para quitar el tope hay que ir a su ficha y decirlo a propósito.
    if (fRol === 'entrenador') {
      const n = Number(fCupo)
      if (fCupo.trim() === '') {
        setError('Pon cuántos deportistas puede tener. Si quieres que no tenga tope, créalo con un número y luego quítaselo desde su ficha, en «cambiar cupo».')
        return
      }
      /* Cero no es «poco cupo», es un entrenador muerto al nacer: el trigger
         comprueba `n_deportistas >= cupo`, y con cero salta desde el primero.
         Entraría a una app en la que no puede dar de alta a nadie por ninguna
         de las tres puertas. Si de verdad quieres congelar a un entrenador, se
         le pone el cero desde su ficha, cuando ya existe. */
      if (!Number.isInteger(n) || n < 1) {
        setError('El cupo tiene que ser 1 o más. Con 0 el entrenador no podría dar de alta a nadie.')
        return
      }
    }
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

  /** Cuántos días le quedan de aquí a que caduque. Null si no caduca. */
  const diasQueQuedan = (caduca: string | null): number | null => {
    if (!caduca) return null
    return Math.max(0, Math.ceil((new Date(caduca).getTime() - Date.now()) / 86400000))
  }

  const abrirEdicion = (i: any) => {
    setError(''); setEAviso('')
    setEditando(i)
    setEUsos(String(i.usos_max))
    /* Los días se enseñan como «cuántos le quedan», que es la pregunta que uno
       se hace, no como la fecha. Volver a mandar el mismo número lo deja donde
       estaba. */
    /* Vacío cuando no caduca o cuando ya caducó: en los dos casos no hay un
       número que reproponer, hay que decir cuántos días se quieren. Y el 0 no
       se ofrece porque aquí se leería como «que caduque hoy», justo lo
       contrario de lo que significa en crear_invitacion. */
    const quedan = diasQueQuedan(i.caduca)
    setEDias(!quedan ? '' : String(quedan))
    setESinCaduca(false)
    setECupo(i.cupo_deportistas == null ? '' : String(i.cupo_deportistas))
    setECupoSinLimite(false)
    setENota(i.nota || '')
    setEReactivar(false)
  }

  const guardarEdicion = async () => {
    if (!editando) return
    setEGuardando(true); setError(''); setEAviso('')

    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const esEntrenador = editando.rol === 'entrenador'

    const { data, error: err } = await supabase.rpc('editar_invitacion', {
      _codigo: editando.codigo,
      _usos_max: num(eUsos),
      _dias_validez: eSinCaduca ? null : num(eDias),
      _sin_caducidad: eSinCaduca,
      _cupo_deportistas: esEntrenador && !eCupoSinLimite ? num(eCupo) : null,
      _cupo_sin_limite: esEntrenador && eCupoSinLimite,
      _nota: eNota || null,
      _reactivar: eReactivar,
    })
    setEGuardando(false)

    if (err) { setError(err.message); return }
    if (data && (data as any).ok === false) { setError((data as any).error); return }

    /* El aviso no es un fallo: el cambio se hizo, pero no llega a quien ya
       entró con el código. Se queda en pantalla en vez de cerrar el modal. */
    const aviso = (data as any)?.aviso
    await cargarTodo()
    if (aviso) { setEAviso(aviso); return }
    setEditando(null)
  }

  const cambiarCupo = async (id: string, nombre: string, actual: number | null) => {
    // Antes, dejarlo vacío significaba "sin límite". Un resbalón en el teclado le
    // quitaba el tope a un entrenador y nada lo decía. Ahora vacío es no tocar
    // nada, y para quitar el tope hay que escribirlo con todas las letras.
    const v = prompt(
      'Cupo de deportistas para ' + nombre + '.\n\n' +
      'Un número, o escribe SIN LIMITE para quitarle el tope.\n' +
      'Vacío = dejarlo como está.',
      actual == null ? 'SIN LIMITE' : String(actual))
    if (v === null || v.trim() === '') return

    const limpio = v.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const sinLimite = limpio === 'sin limite'
    const n = Number(v)
    if (!sinLimite && (!Number.isInteger(n) || n < 0)) {
      setError('Escribe un número entero de 0 en adelante, o SIN LIMITE.')
      return
    }
    if (sinLimite && !confirm(nombre + ' podrá dar de alta deportistas sin ningún tope, y su código público quedará abierto.\n\n¿Seguro?')) return

    const { error: err } = await supabase.rpc('admin_fijar_cupo', {
      _id_entrenador: id,
      _cupo: sinLimite ? null : n,
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
            ['buzon', 'Buzón'],
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
                  // Sin tope no es un dato neutro, es una puerta abierta: se ve en rojo
                  // y con la palabra escrita. El «∞» de antes se leía como un detalle.
                  const sinTope = c.cupo_deportistas == null
                  return (
                    <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-bold text-white">{c.nombre || '(sin nombre)'}</p>
                          <p className="text-gray-500 text-xs truncate">{c.email}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Chip tono={lleno || sinTope ? 'rojo' : 'naranja'}>
                            {sinTope
                              ? c.n_deportistas + ' deportistas · SIN TOPE'
                              : c.n_deportistas + ' / ' + c.cupo_deportistas + ' deportistas'}
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
                    <input type="number" min={1} value={fCupo} onChange={e => setFCupo(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                    {/* Decía «Vacío = sin límite» y era mentira desde que se
                        endureció la validación: el vacío se rechaza. */}
                    <p className="text-gray-600 text-[11px] mt-1">De 1 en adelante. Se cambia después aquí mismo, en «cambiar», o desde Cuentas.</p>
                  </div>
                ) : (
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Se vincula con este entrenador</label>
                    <select value={fEntrenador} onChange={e => setFEntrenador(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 w-full">
                      <option value="">Sin entrenador (se vincula él luego)</option>
                      {entrenadores.map(e2 => (
                        <option key={e2.id} value={e2.id}>
                          {e2.nombre} — {e2.cupo_deportistas == null
                            ? e2.n_deportistas + ' · sin tope'
                            : e2.n_deportistas + '/' + e2.cupo_deportistas}
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
                          {/* Se puede cambiar aunque esté agotada o caducada:
                              son justo los dos casos en los que quieres darle
                              más usos o más plazo en vez de mandar otro. */}
                          <button onClick={() => abrirEdicion(i)}
                            className="text-gray-500 hover:text-orange-400 text-xs underline transition">cambiar</button>
                          {viva && (
                            <button onClick={() => revocar(i.codigo)}
                              className="text-gray-600 hover:text-red-400 text-xs underline transition">anular</button>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-600 text-[11px] mt-2 tabular-nums">
                        {i.usos}/{i.usos_max} usos · creada {fmtFecha(i.creada_en)}
                        {i.caduca && <> · caduca {fmtFecha(i.caduca)}</>}
                        {i.rol === 'entrenador' && (
                          <> · cupo {i.cupo_deportistas == null ? 'sin límite' : i.cupo_deportistas}</>
                        )}
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
        {/* ===================== BUZÓN ===================== */}
        {pestana === 'buzon' && (
          <div className="flex flex-col gap-8">

            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Aviso de mantenimiento</h2>
                <p className="text-gray-600 text-[12px] mt-0.5 leading-snug">
                  Sale arriba en todas las pantallas, también en la de entrar. Se apaga solo cuando pasa la hora.
                </p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-gray-400 text-xs">Desde</span>
                    <input type="datetime-local" value={avDesde} onChange={e => setAvDesde(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-gray-400 text-xs">Hasta</span>
                    <input type="datetime-local" value={avHasta} onChange={e => setAvHasta(e.target.value)}
                      className="bg-gray-800 text-white px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-gray-400 text-xs">Coletilla (opcional)</span>
                  <input value={avMensaje} onChange={e => setAvMensaje(e.target.value)}
                    placeholder="Volvemos enseguida."
                    className="bg-gray-800 text-white px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                  <span className="text-gray-600 text-[11px] leading-snug">
                    Las fechas y las horas las escribe la app sola. Esto es lo que quieras añadir detrás.
                  </span>
                </label>
                <button onClick={programarAviso} disabled={avGuardando}
                  className="bg-orange-500 hover:bg-orange-600 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-50">
                  {avGuardando ? 'Programando…' : 'Programar el aviso'}
                </button>
              </div>

              {avisos.length > 0 && (
                <div className="flex flex-col gap-2">
                  {avisos.map(a => {
                    const fin = new Date(a.hasta)
                    const vivo = fin > new Date()
                    return (
                      <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <p className="text-sm">{fmtHora(a.desde)} → {fmtHora(a.hasta)}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{a.mensaje}</p>
                        </div>
                        {vivo ? <Chip tono="naranja">activo</Chip> : <Chip>pasado</Chip>}
                        {vivo && (
                          <button onClick={() => quitarAviso(a.id)}
                            className="text-gray-600 hover:text-red-400 text-xs underline transition">quitar</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">
                  Lo que manda la gente ({sugerencias.filter(s => s.estado === 'nueva').length} sin ver)
                </h2>
                <p className="text-gray-600 text-[12px] mt-0.5 leading-snug">
                  Cada mensaje llega con la pantalla en la que estaba esa persona, así que no hace falta preguntar dónde.
                </p>
              </div>

              {sugerencias.length === 0 && (
                <p className="text-gray-600 text-sm">Todavía no ha escrito nadie.</p>
              )}

              <div className="flex flex-col gap-2">
                {sugerencias.map(s => (
                  <div key={s.id} className={'border rounded-xl p-3.5 flex flex-col gap-2 '
                    + (s.estado === 'nueva' ? 'bg-gray-900 border-orange-500/30' : 'bg-gray-900/50 border-gray-800')}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip tono={s.tipo === 'error' ? 'rojo' : 'azul'}>{s.tipo}</Chip>
                      {s.estado === 'nueva' && <Chip tono="naranja">nueva</Chip>}
                      {s.estado === 'resuelta' && <Chip tono="verde">resuelta</Chip>}
                      <span className="text-gray-600 text-[11px] ml-auto">{fmtHora(s.creada_en)}</span>
                    </div>
                    <p className="text-[14px] text-gray-200 leading-relaxed whitespace-pre-wrap">{s.texto}</p>
                    <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-600">
                      {s.pantalla && <span className="font-mono">{s.pantalla}</span>}
                      <div className="ml-auto flex gap-2.5">
                        {s.estado !== 'vista' && (
                          <button onClick={() => marcarSugerencia(s.id, 'vista')}
                            className="hover:text-gray-300 underline transition">marcar vista</button>
                        )}
                        {s.estado !== 'resuelta' && (
                          <button onClick={() => marcarSugerencia(s.id, 'resuelta')}
                            className="hover:text-green-400 underline transition">resuelta</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

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

      {editando && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center sm:p-5"
          onClick={ev => { if (ev.target === ev.currentTarget) setEditando(null) }}>
          <div className="bg-gray-900 border-t sm:border border-gray-700 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92%] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono font-bold tracking-widest">{editando.codigo}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {editando.rol} · {editando.usos}/{editando.usos_max} usos
                  {editando.caduca
                    ? ' · caduca ' + fmtFecha(editando.caduca)
                    : ' · sin caducidad'}
                </p>
              </div>
              <button onClick={() => setEditando(null)} aria-label="Cerrar"
                className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-gray-400 text-sm">Para cuántas personas vale</span>
                <input type="number" min={Math.max(1, editando.usos)} value={eUsos} onChange={ev => setEUsos(ev.target.value)}
                  className="bg-gray-800 text-white px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 tabular-nums" />
                <span className="text-gray-600 text-[11px] leading-snug">
                  {editando.usos > 0
                    ? 'Ya lo han usado ' + editando.usos + '. No se puede dejar por debajo de ahí.'
                    : 'Todavía no lo ha usado nadie.'}
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-gray-400 text-sm">Caduca dentro de</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={eDias} onChange={ev => setEDias(ev.target.value)}
                    disabled={eSinCaduca} placeholder={editando.caduca ? 'ya caducó — pon los días' : 'días'}
                    className="flex-1 bg-gray-800 text-white px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 tabular-nums disabled:opacity-40" />
                  <span className="text-gray-500 text-sm flex-none">días desde hoy</span>
                </div>
                <label className="flex items-center gap-2 text-gray-400 text-[12.5px] mt-0.5 cursor-pointer">
                  <input type="checkbox" checked={eSinCaduca} onChange={ev => setESinCaduca(ev.target.checked)}
                    className="accent-orange-500" />
                  Que no caduque nunca
                </label>
                <span className="text-gray-600 text-[11px] leading-snug">
                  Se cuenta desde hoy, no desde la fecha que tuviera: si ya caducó, «15» le da quince días buenos.
                </span>
              </label>

              {editando.rol === 'entrenador' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-gray-400 text-sm">Deportistas que podrá tener</span>
                  <input type="number" min={1} value={eCupo} onChange={ev => setECupo(ev.target.value)}
                    disabled={eCupoSinLimite} placeholder="cupo"
                    className="bg-gray-800 text-white px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 tabular-nums disabled:opacity-40" />
                  <label className="flex items-center gap-2 text-gray-400 text-[12.5px] mt-0.5 cursor-pointer">
                    <input type="checkbox" checked={eCupoSinLimite} onChange={ev => setECupoSinLimite(ev.target.checked)}
                      className="accent-orange-500" />
                    Sin límite
                  </label>
                  {editando.usos > 0 && (
                    <span className="text-amber-200/80 text-[11px] leading-snug">
                      Este código ya se usó. El cupo de quien entró con él no cambia desde aquí: se le cambia en su ficha.
                    </span>
                  )}
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-gray-400 text-sm">Nota</span>
                <input value={eNota} onChange={ev => setENota(ev.target.value)} placeholder="Para acordarte de a quién se lo diste"
                  className="bg-gray-800 text-white px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              </label>

              {editando.revocada && (
                <label className="flex items-center gap-2.5 text-[13px] cursor-pointer border border-green-500/30 bg-green-500/[0.07] rounded-xl px-3.5 py-3">
                  <input type="checkbox" checked={eReactivar} onChange={ev => setEReactivar(ev.target.checked)}
                    className="accent-green-500" />
                  <span className="text-green-300">Volver a activarlo</span>
                </label>
              )}

              {eAviso && (
                <p className="text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed">
                  Guardado. {eAviso}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-800 flex gap-2.5">
              <button onClick={() => setEditando(null)}
                className="flex-1 bg-gray-800 text-gray-400 hover:text-white py-2.5 rounded-xl text-sm transition">
                {eAviso ? 'Cerrar' : 'Cancelar'}
              </button>
              <button onClick={guardarEdicion} disabled={eGuardando}
                className="flex-1 bg-orange-500 hover:bg-orange-600 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-50">
                {eGuardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
