'use client'
// ============================================================
// Dirigir a un grupo — un reloj, muchos nombres
// ============================================================
// Salen juntos y llegan escalonados. El entrenador tiene UN reloj corriendo y va
// tocando el nombre de cada uno según entra. Tocar el nombre es la única acción
// que hay: es lo único que se puede hacer bien mirando a la pista.
//
// LO QUE ESTA PANTALLA REGALA es el descanso individual. Con salida común y
// llegada escalonada, el primero recupera más que el último, y la diferencia es
// exactamente la ventaja que le sacó. Eso no lo apunta nadie hoy y aquí sale sin
// hacer nada más. La cuenta vive en lib/dirigir-grupo.
//
// UNA SESIÓN POR ATLETA, AUNQUE EL ENTRENAMIENTO SEA UNO. Lo que se emite al
// grupo se materializa en una sesión por persona (ver lib/grupos-emision), así
// que al guardar hay que escribir contra la tarea de CADA sesión y no contra una
// común, que no existe.
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, fechaLarga } from '@/lib/fechas'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { vivas } from '@/lib/papelera'
import Cargando from '@/components/Cargando'
import { miembrosDe, type MiembroGrupo } from '@/lib/grupos'
import { cargaZona } from '@/lib/zonas'
import { reloj, relojCorto } from '@/lib/dirigir-sesion'
import {
  estadoGrupoInicial, darSalida, marcar, desmarcar, siguienteSerie, pararGrupo,
  msComun, dentro, filasDeAtleta, horquilla, marcasTotales, type EstadoGrupo,
} from '@/lib/dirigir-grupo'

const COLORES = [['#fbbf24', '#f97316'], ['#60a5fa', '#4f46e5'], ['#4ade80', '#0d9488'], ['#f472b6', '#be185d'], ['#a78bfa', '#7c3aed'], ['#22d3ee', '#0891b2']]
const iniciales = (n: string) => {
  const p = (n || '?').trim().split(/\s+/)
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase()
}

export default function DirigirGrupo({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()

  const [grupo, setGrupo] = useState<{ id: string; nombre: string } | null>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [miembros, setMiembros] = useState<MiembroGrupo[]>([])
  const [fecha, setFecha] = useState(hoyISO())
  /* Una fila por atleta: su sesión de ese día y la tarea contra la que se
     escribe. Sin sesión, no se le puede apuntar nada. */
  const [conSesion, setConSesion] = useState<{ id_deportista: number; nombre: string; idSesion: number; idTarea: number | null }[]>([])
  const [tarea, setTarea] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [e, setE] = useState<EstadoGrupo>(() => estadoGrupoInicial([], 1))
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => { arrancar() }, [id])
  useEffect(() => { if (miembros.length) cargarDia() }, [miembros, fecha])

  useEffect(() => {
    if (e.modo !== 'corriendo') return
    const t = setInterval(() => setAhora(Date.now()), 100)
    return () => clearInterval(t)
  }, [e.modo])

  const arrancar = async () => {
    /* `grupo_entreno`, no `grupo`. La tabla se llama así en todo lib/grupos y
       aquí escribí el nombre corto de memoria: la pantalla decía «no existe»
       siempre y parecía un problema de permisos. */
    const { data: g } = await supabase.from('grupo_entreno').select('id, nombre').eq('id', id).maybeSingle()
    if (!g) { setNoExiste(true); setCargando(false); return }
    setGrupo(g as any)
    setMiembros(await miembrosDe(supabase, id))
    setCargando(false)
  }

  const cargarDia = async () => {
    const ids = miembros.map(m => m.id_deportista)
    const { data: ses } = await vivas(supabase.from('sesion')
      .select('id, id_deportista, disciplina, estado')
      .in('id_deportista', ids).eq('fecha_sesion', fecha))

    const sesIds = (ses || []).map((s: any) => s.id)
    const { data: tareas } = sesIds.length
      ? await supabase.from('tarea')
        .select('id, id_sesion, orden, zona_entrenamiento, disciplina, series, descanso_segundos, p_distancia(*), p_duracion(*)')
        .in('id_sesion', sesIds).order('orden')
      : { data: [] as any[] }

    /* De momento se dirige el PRIMER bloque de cada sesión. Un entrenamiento de
       grupo casi siempre es uno: si más adelante hacen falta varios, la lista de
       bloques va aquí y el resto de la pantalla no se entera. */
    const primeraDe = new Map<number, any>()
    for (const t of tareas || []) if (!primeraDe.has(t.id_sesion)) primeraDe.set(t.id_sesion, t)

    const filas = (ses || []).map((s: any) => {
      const m = miembros.find(x => x.id_deportista === s.id_deportista)
      const t = primeraDe.get(s.id)
      return { id_deportista: s.id_deportista, nombre: m?.nombre || '—', idSesion: s.id, idTarea: t?.id ?? null }
    }).filter(f => f.idTarea != null)

    setConSesion(filas)
    const t0 = filas.length ? primeraDe.get(filas[0].idSesion) : null
    setTarea(t0 || null)
    setE(estadoGrupoInicial(filas.map(f => f.id_deportista), Math.max(1, t0?.series || 1)))
  }

  const nSeries = Math.max(1, tarea?.series || 1)
  const ultimaSerie = e.serie >= nSeries - 1
  const prescrito = (tarea?.descanso_segundos as number | null) ?? null

  const guardar = async () => {
    setGuardando(true)
    const cerrado = e.modo === 'corriendo' ? pararGrupo(e, Date.now()) : e
    setE(cerrado)

    for (const f of conSesion) {
      if (f.idTarea == null) continue
      const filas = filasDeAtleta(cerrado, f.id_deportista, f.idTarea)
      if (!filas.length) continue
      await supabase.from('series_realizadas').delete()
        .eq('id_tarea', f.idTarea).eq('anotado_por', 'entrenador')
      const { error } = await supabase.from('series_realizadas').insert(filas)
      if (error) {
        alert('No se han podido guardar las series de ' + f.nombre + ': ' + error.message
          + '\n\n¿Está corrido supabase/dirigir-sesion.sql?')
        setGuardando(false)
        return
      }
      await supabase.from('sesion').update({ estado: 'Realizada' }).eq('id', f.idSesion)
    }
    setGuardando(false)
    router.push('/grupo/' + id + '/dia')
  }

  /* Igual que en la individual: no se escribe nada hasta «Cerrar», pero eso hay
     que decirlo. Y si hay marcas dentro, se pregunta antes de tirarlas. */
  const salirSinGuardar = () => {
    const marcas = marcasTotales(e)
    if (marcas > 0 && !confirm(
      'Vas a salir sin guardar.\n\nSe pierden ' + marcas
      + (marcas === 1 ? ' marca' : ' marcas') + '.\n\n¿Salir igualmente?')) return
    router.push('/grupo/' + id + '/dia')
  }

  if (cargando) return <Cargando volverA="/comunidad" />
  if (noExiste) return <Cargando volverA="/comunidad" noExiste />

  const ms = msComun(e, ahora)
  const zc = cargaZona(tarea?.zona_entrenamiento).color
  const h = horquilla(e, e.serie)

  return (
    <main className="min-h-screen bg-gray-950 text-white pb-28">
      <nav className="bg-gray-900 pl-16 pr-4 h-[52px] flex justify-between items-center border-b border-gray-800 sticky top-0 z-30">
        <span className="text-[11px] font-bold uppercase tracking-wider text-orange-300 border border-orange-500/45 bg-orange-500/12 px-2 py-1 rounded-md">Apunto yo</span>
        <button onClick={salirSinGuardar}
          title="Se cierra sin guardar nada"
          className="text-gray-400 hover:text-white text-sm transition">Salir sin guardar</button>
      </nav>

      <div className="max-w-lg mx-auto px-3.5 py-4 flex flex-col gap-3">

        <div className="tp-card p-[12px_14px] flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-tight m-0 truncate">{grupo?.nombre} · {conSesion.length} atletas</p>
            <p className="text-[11.5px] text-gray-500 m-0 truncate">
              {tarea ? (tarea.disciplina || '') : ''}{tarea?.series > 1 ? ' · ' + tarea.series + ' series' : ''}
              {prescrito ? ' · ' + prescrito + ' s rec' : ''}
            </p>
          </div>
          <input type="date" value={fecha} onChange={ev => setFecha(ev.target.value)}
            className="bg-gray-800 text-white px-2 py-1.5 rounded-lg text-[12px] outline-none focus:ring-2 focus:ring-orange-500 flex-none" />
        </div>

        {conSesion.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-10 px-6 leading-relaxed">
            Ningún atleta del grupo tiene sesión con bloques ese día.
            Mándales el entrenamiento desde la ficha del grupo y vuelve.
          </p>
        ) : (
          <>
            <div className="tp-card overflow-hidden">
              <div className="px-4 pt-3 pb-3.5 text-center border-b border-white/[0.07] bg-white/[0.02]">
                <p className="text-[11px] uppercase tracking-[.1em] text-gray-500 m-0 flex items-center justify-center gap-1.5">
                  Serie {Math.min(e.serie + 1, nSeries)} de {nSeries}
                  {tarea?.zona_entrenamiento && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: zc, background: `color-mix(in oklab, ${zc} 17%, transparent)` }}>
                      {tarea.zona_entrenamiento}
                    </span>
                  )}
                </p>
                <p className={'font-mono tabular-nums m-0 leading-none tracking-tighter text-[46px] font-bold '
                  + (e.modo === 'corriendo' ? 'text-green-400' : 'text-gray-600')}>
                  {reloj(e.modo === 'corriendo' ? ms : 0)}
                </p>
                <p className="text-[11.5px] text-gray-500 m-0 mt-1 min-h-[17px]">
                  {e.modo === 'corriendo'
                    ? dentro(e) + ' de ' + conSesion.length + ' dentro'
                      + (h != null ? ' · ' + relojCorto(h) + ' entre el primero y el último' : '')
                    : 'Dale a Salida cuando arranquen'}
                </p>
              </div>

              <div className="p-2.5 flex gap-2">
                <button onClick={() => setE(darSalida(e, Date.now()))}
                  disabled={e.modo === 'corriendo'}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[13.5px] bg-green-400 text-green-950 hover:bg-green-300 transition active:scale-[.97] disabled:opacity-30 disabled:hover:bg-green-400">
                  Salida
                </button>
                <button
                  onClick={() => setE(ultimaSerie ? pararGrupo(e, Date.now()) : siguienteSerie(e, Date.now()))}
                  disabled={e.modo !== 'corriendo'}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[13.5px] bg-blue-400 text-slate-900 hover:bg-blue-300 transition active:scale-[.97] disabled:opacity-30 disabled:hover:bg-blue-400">
                  {ultimaSerie ? 'Terminar' : 'Siguiente serie'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {conSesion.map((f, k) => {
                const entrada = e.entradas[f.id_deportista]?.[e.serie] ?? null
                const desc = e.serie > 0 ? e.descansos[f.id_deportista]?.[e.serie - 1] ?? null : null
                const g = COLORES[k % COLORES.length]
                return (
                  <button key={f.id_deportista}
                    onClick={() => setE(marcar(e, f.id_deportista, Date.now()))}
                    onContextMenu={ev => { ev.preventDefault(); setE(desmarcar(e, f.id_deportista)) }}
                    disabled={e.modo !== 'corriendo'}
                    title={entrada != null ? 'Toca para corregir · clic derecho para quitar la marca' : 'Toca cuando entre'}
                    className={'flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[.99] '
                      + (e.modo !== 'corriendo' ? 'opacity-55 cursor-default border-white/[0.07] bg-white/[0.02]'
                        : entrada != null ? 'border-white/[0.14] bg-white/[0.03] hover:border-white/25'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-green-400/45 hover:bg-green-400/[0.06]')}>
                    <span className="w-[34px] h-[34px] rounded-xl flex-none grid place-items-center font-extrabold text-[12px] text-gray-950"
                      style={{ background: `linear-gradient(150deg, ${g[0]}, ${g[1]})` }}>
                      {iniciales(f.nombre)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold tracking-tight truncate">{f.nombre}</span>
                      {desc != null && (
                        <span className="block text-[10.5px] text-gray-500">
                          descansó {relojCorto(desc)}{prescrito ? ' / ' + prescrito + ' s' : ''}
                        </span>
                      )}
                    </span>
                    <span className={'font-mono tabular-nums flex-none '
                      + (entrada != null ? 'text-[19px] font-bold' : 'text-[13px] text-gray-600')}>
                      {entrada != null ? reloj(entrada) : (e.modo === 'corriendo' ? 'toca al entrar' : '—:——')}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {conSesion.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 pt-2.5"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-lg mx-auto">
            <button onClick={guardar} disabled={guardando}
              className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white py-4 rounded-xl text-base font-bold transition disabled:bg-gray-800 disabled:text-gray-400">
              {guardando ? 'Guardando…' : 'Cerrar el entrenamiento'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
