'use client'
// ============================================================
// «De tu reloj» — lo que el panel del DEPORTISTA le pide
// ============================================================
// Pantalla 2 de la maqueta del 2026-10-19. Una franja que SOLO sale si hay
// algo pendiente de sus últimas dos semanas:
//   · falta tu RPE: su entrenador unió una sesión con su reloj y no está cerrada;
//   · completar: la cerró a mano (o por el modo entreno) y su reloj la tiene;
//   · sin apuntar: un entreno de sus disciplinas que no estaba en el plan.
// Caminar y los demás deportes no se piden (decisión 5). Lo sugerido tampoco:
// eso se cierra desde la propia sesión, con «Ya la he hecho».

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias, DIAS_SEMANA, indiceDia } from '@/lib/fechas'
import { nombreReloj } from '@/lib/relojes-catalogo'
import { cifrasDeActividad, type ActividadReloj } from '@/lib/actividades-reloj'
import { emojiDisciplina, etiquetaDisciplina } from '@/lib/disciplinas'
import { pendientesDelDeportista, DIAS_PANEL_RELOJ, type Pendiente } from '@/lib/reloj-sesion'
import {
  cargarDatosUnion, ponerDatosDelReloj, guardarDecision, apuntarDesdeReloj,
  type DatosUnion, type SesionDelReloj,
} from '@/lib/reloj-union'

const diaDe = (f: string) => DIAS_SEMANA[indiceDia(f)] + ' ' + Number(f.slice(8, 10))

const CHIP = 'text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap'
const PRIMARIO = 'text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition disabled:opacity-50'
const FANTASMA = 'text-[12.5px] font-semibold px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50'

export default function DeTuReloj({ idDeportista, className = '' }: { idDeportista: number | null | undefined; className?: string }) {
  const [datos, setDatos] = useState<DatosUnion | null>(null)
  const [marca, setMarca] = useState('tu reloj')

  useEffect(() => {
    if (!idDeportista) return
    let vivo = true
    const hoy = hoyISO()
    Promise.all([
      cargarDatosUnion(supabase, idDeportista, sumarDias(hoy, -(DIAS_PANEL_RELOJ - 1)), hoy),
      supabase.from('reloj_conexion').select('proveedor').eq('id_deportista', idDeportista)
        .order('conectado_en', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([d, c]) => {
      if (!vivo) return
      setDatos(d)
      if (c.data?.proveedor) setMarca('tu ' + nombreReloj(c.data.proveedor))
    })
    return () => { vivo = false }
  }, [idDeportista])

  if (!idDeportista || !datos || datos.error) return null
  /* Se calcula una vez al cargar: lo que se resuelve se queda en pantalla con su
     «hecho», en vez de desaparecer de golpe. */
  const pendientes = pendientesDelDeportista(datos.actividades, datos.sesiones, datos.uniones)
  return <ListaDeTuReloj pendientes={pendientes} idDeportista={idDeportista} datos={datos} marca={marca} className={className} />
}

/** La franja, ya con lo pendiente: solo pinta (y guarda al pulsar). Sin nada pendiente, nada. */
export function ListaDeTuReloj({ pendientes, idDeportista, datos, marca, className = '' }: {
  pendientes: Pendiente<ActividadReloj>[]
  idDeportista: number
  datos: DatosUnion
  marca: string
  className?: string
}) {
  if (!pendientes.length) return null
  return (
    <div className={'tp-card overflow-hidden ' + className}>
      <p className="px-4 pt-3 pb-2 text-[11px] font-bold tracking-[.06em] uppercase text-gray-500">⌚ De {marca}</p>
      {pendientes.map(p => (
        <Fila key={p.k + p.actividad.id} p={p} idDeportista={idDeportista} datos={datos} marca={marca} />
      ))}
    </div>
  )
}

function Fila({ p, idDeportista, datos, marca }: { p: Pendiente<ActividadReloj>; idDeportista: number; datos: DatosUnion; marca: string }) {
  const [abierta, setAbierta] = useState(false)
  const [rpe, setRpe] = useState(5)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const a = p.actividad

  const hacer = async (accion: () => Promise<string | null>, ok: string) => {
    setOcupado(true); setError(null)
    const err = await accion()
    setOcupado(false)
    if (err) setError(err)
    else setHecho(ok)
  }

  const titulo = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {p.k === 'falta_rpe' && <span className={CHIP + ' bg-amber-400/15 text-amber-300'}>Falta tu RPE</span>}
      {p.k === 'completar' && <span className={CHIP + ' bg-amber-400/15 text-amber-300'}>Ya la cerraste</span>}
      {p.k === 'sin_apuntar' && <span className={CHIP + ' bg-sky-400/15 text-sky-300'}>Sin apuntar</span>}
      <b className="text-[13.5px]">{diaDe(a.fecha)} · {emojiDisciplina(a.disciplina)} {etiquetaDisciplina(a.disciplina)}</b>
    </div>
  )
  const nombre = p.k === 'sin_apuntar' ? null : (p.sesion as SesionDelReloj).nombre

  const deslizador = (guardar: () => void, texto: string) => (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <label htmlFor={'rpe-dtr-' + a.id} className="text-[12.5px] text-gray-300">¿Cómo de dura fue?</label>
        <span className="text-orange-400 font-bold text-[12.5px] tabular-nums">{rpe}/10</span>
      </div>
      <input id={'rpe-dtr-' + a.id} type="range" min={1} max={10} value={rpe} onChange={e => setRpe(Number(e.target.value))} className="w-full accent-orange-500" />
      <div className="flex gap-2">
        <button className={PRIMARIO} disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : texto}</button>
        <button className={FANTASMA} disabled={ocupado} onClick={() => setAbierta(false)}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div className="border-t border-white/[0.06] px-4 py-3 flex flex-col gap-2">
      {titulo}
      {p.k === 'falta_rpe' && (
        <p className="text-[12.5px] text-gray-400 m-0">{nombre} · tu entrenador la ha unido con {marca}: <span className="tabular-nums">{cifrasDeActividad(a)}</span></p>
      )}
      {p.k === 'completar' && (
        <p className="text-[12.5px] text-gray-400 m-0">{nombre}: {marca} registró <span className="tabular-nums">{cifrasDeActividad(a)}</span>. ¿La completas con estos datos? Tu RPE se queda.</p>
      )}
      {p.k === 'sin_apuntar' && <p className="text-[12.5px] text-gray-400 m-0 tabular-nums">{cifrasDeActividad(a)}</p>}

      {hecho ? (
        <p className="text-[12.5px] text-green-400 m-0">✓ {hecho}</p>
      ) : p.k === 'falta_rpe' ? (
        abierta
          ? deslizador(() => hacer(() => ponerDatosDelReloj(supabase, { idDeportista, sesion: p.sesion, datos, cierre: { rpe, origen: 'atleta' } }),
              'Guardado: ya cuenta para tu carga.'), 'Guardar')
          : <div><button className={PRIMARIO} onClick={() => setAbierta(true)}>Poner mi RPE</button></div>
      ) : p.k === 'completar' ? (
        <div className="flex gap-2">
          <button className={PRIMARIO} disabled={ocupado}
            onClick={() => hacer(() => ponerDatosDelReloj(supabase, { idDeportista, sesion: p.sesion, datos, nuevas: [{ actividad: a, parte: p.parte }] }),
              'Completada con ' + marca + '.')}>Completar con el reloj</button>
          <button className={FANTASMA} disabled={ocupado}
            onClick={() => hacer(() => guardarDecision(supabase, { idDeportista, idMedicion: a.id, decision: 'rechazada', idSesion: p.sesion.id }),
              'De acuerdo: no era esa.')}>No es esa</button>
        </div>
      ) : abierta ? (
        deslizador(() => hacer(async () => (await apuntarDesdeReloj(supabase, { idDeportista, actividad: a, rpe, quien: 'atleta' })).error,
          'Apuntada como sesión hecha: cuenta para tu carga, y tu entrenador la ve en tu calendario.'), 'Guardar como hecha')
      ) : (
        <div className="flex gap-2">
          <button className={PRIMARIO} onClick={() => setAbierta(true)}>Apuntarla</button>
          <button className={FANTASMA} disabled={ocupado}
            onClick={() => hacer(() => guardarDecision(supabase, { idDeportista, idMedicion: a.id, decision: 'no_cuenta' }),
              'No cuenta para tu carga.')}>No contarla</button>
        </div>
      )}
      {error && <p className="text-[12.5px] text-red-300 m-0">{error}</p>}
    </div>
  )
}
