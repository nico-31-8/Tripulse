'use client'
// ============================================================
// Un entreno del reloj y su sesión — lo que ve el ENTRENADOR
// ============================================================
// Va dentro de cada tarjeta de «Su reloj» → Entrenos. Enseña cómo está ese
// entreno (lib/reloj-sesion: unida, sugerida, completar, varias, sin sesión,
// no cuenta) y deja hacer lo que la maqueta del 2026-10-19 aprobó:
//   · unir lo que la app sugiere, o desunir lo que se unió mal;
//   · poner su RPE si te lo dijo (la sesión se cierra con los datos del reloj);
//   · completar con el reloj una sesión que se cerró a mano;
//   · apuntarla tú si no estaba en el plan; unirla a otro día de esa semana.
// Unir sin RPE NO cierra la sesión: no suma carga hasta que alguien lo ponga.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DIAS_SEMANA, indiceDia, hoyISO, sumarDias } from '@/lib/fechas'
import { esDisciplinaDeFuerza } from '@/lib/disciplinas'
import type { ActividadReloj } from '@/lib/actividades-reloj'
import { DIAS_PANEL_RELOJ, type EstadoActividad, type SesionParaUnir } from '@/lib/reloj-sesion'
import {
  unirSinCerrar, ponerDatosDelReloj, desunir, guardarDecision, quitarDecision, apuntarDesdeReloj,
  type DatosUnion, type SesionDelReloj,
} from '@/lib/reloj-union'

interface Props {
  actividad: ActividadReloj
  estado: EstadoActividad
  /** Las sesiones sin cerrar de esa semana con sitio para este entreno («Unir a…»). */
  opciones: { sesion: SesionParaUnir; parte: number }[]
  idDeportista: number
  datos: Pick<DatosUnion, 'uniones' | 'actividades'>
  onCambio: () => void
  onVerSesion: (id: number) => void
}

const nombreDe = (s: SesionParaUnir) => (s as SesionDelReloj).nombre || s.disciplina || 'Sesión'
const diaDe = (f: string) => DIAS_SEMANA[indiceDia(f)] + ' ' + Number(f.slice(8, 10))

const CHIP = 'text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap'
const AMBAR = CHIP + ' bg-amber-400/15 text-amber-300'
const VERDE = CHIP + ' bg-green-400/15 text-green-400'
const CIELO = CHIP + ' bg-sky-400/15 text-sky-300'
const GRIS = CHIP + ' bg-white/[0.06] text-gray-400'
const BOTON = 'text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.11] transition disabled:opacity-50'
const PRIMARIO = 'text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition disabled:opacity-50'
const FANTASMA = 'text-[12px] font-semibold px-2.5 py-1 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50'

export function EstadoDelEntreno({ actividad: a, estado, opciones, idDeportista, datos, onCambio, onVerSesion }: Props) {
  const [modo, setModo] = useState<'rpe' | 'apuntar' | 'unir-a' | null>(null)
  const [rpe, setRpe] = useState(5)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hacer = async (accion: () => Promise<string | null>) => {
    setOcupado(true); setError(null)
    const err = await accion()
    setOcupado(false)
    if (err) setError(err)
    else { setModo(null); onCambio() }
  }

  /* Su panel solo le pide lo de las dos últimas semanas: de lo anterior no se le dice nada. */
  const enSuPanel = a.fecha >= sumarDias(hoyISO(), -(DIAS_PANEL_RELOJ - 1))

  const unir = (s: SesionParaUnir, parte: number) => hacer(() => s.estado === 'Realizada'
    ? ponerDatosDelReloj(supabase, { idDeportista, sesion: s, datos, nuevas: [{ actividad: a, parte }] })
    : unirSinCerrar(supabase, idDeportista, a.id, s, parte))
  const noEsEsa = (s: SesionParaUnir) => hacer(() => guardarDecision(supabase, { idDeportista, idMedicion: a.id, decision: 'rechazada', idSesion: s.id }))

  /* El deslizador del RPE: el de su sesión unida o el de apuntarla. */
  const deslizador = (guardar: () => void, texto: string) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 basis-full">
      <label htmlFor={'rpe-' + a.id} className="text-[12.5px] text-gray-300">{texto}</label>
      <input id={'rpe-' + a.id} type="range" min={1} max={10} value={rpe} onChange={e => setRpe(Number(e.target.value))}
        className="flex-1 min-w-[140px] accent-orange-500" />
      <span className="text-orange-400 font-bold text-[12.5px] tabular-nums w-10">{rpe}/10</span>
      <button className={PRIMARIO} disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      <button className={FANTASMA} disabled={ocupado} onClick={() => setModo(null)}>Cancelar</button>
    </div>
  )

  let chip = GRIS, chipTexto = '', cuerpo: React.ReactNode = null, botones: React.ReactNode = null
  switch (estado.k) {
    case 'unida': {
      const s = estado.sesion
      if (estado.faltaRpe) {
        chip = AMBAR; chipTexto = 'Unida · falta su RPE'
        cuerpo = <><b>{nombreDe(s)}</b> · sin cerrar<small className="block text-gray-500 text-[12px]">No suma carga hasta que tenga su RPE{enSuPanel ? ': se lo pedimos en su app' : ''}. ¿Te lo dijo? Puedes ponerlo tú.</small></>
        botones = modo === 'rpe'
          ? deslizador(() => hacer(() => ponerDatosDelReloj(supabase, { idDeportista, sesion: s, datos, cierre: { rpe, origen: 'entrenador' } })), 'Su RPE (te lo dijo)')
          : <>
              <button className={PRIMARIO} disabled={ocupado} onClick={() => setModo('rpe')}>Poner su RPE</button>
              <button className={FANTASMA} disabled={ocupado} onClick={() => hacer(() => desunir(supabase, estado.union, s, datos))}>Desunir</button>
            </>
      } else if (!estado.union.antes) {
        chip = AMBAR; chipTexto = 'Unida · sin sus datos'
        cuerpo = <><b>{nombreDe(s)}</b> se cerró sin los datos del reloj<small className="block text-gray-500 text-[12px]">Completarla cambia su duración (y la FC si es de una sola tarea). Su RPE se queda.</small></>
        botones = <>
          <button className={PRIMARIO} disabled={ocupado} onClick={() => hacer(() => ponerDatosDelReloj(supabase, { idDeportista, sesion: s, datos }))}>Completar con el reloj</button>
          <button className={FANTASMA} disabled={ocupado} onClick={() => hacer(() => desunir(supabase, estado.union, s, datos))}>Desunir</button>
        </>
      } else {
        chip = VERDE; chipTexto = 'Unida'
        cuerpo = <><b>{nombreDe(s)}</b>{s.rpe_reportado != null && <> · RPE {s.rpe_reportado}</>}<small className="block text-gray-500 text-[12px]">La duración{esDisciplinaDeFuerza(s.disciplina) ? ' y la FC' : ', la distancia y la FC'} son las del reloj.</small></>
        botones = <>
          <button className={BOTON} onClick={() => onVerSesion(s.id)}>Ver sesión</button>
          <button className={FANTASMA} disabled={ocupado} onClick={() => hacer(() => desunir(supabase, estado.union, s, datos))}>Desunir</button>
        </>
      }
      break
    }
    case 'sugerida':
      chip = AMBAR; chipTexto = 'Sugerida'
      cuerpo = <>¿Es su <b>{nombreDe(estado.sesion)}</b>?<small className="block text-gray-500 text-[12px]">Mismo día y misma disciplina. Aún no la ha cerrado: al unirla no suma carga hasta que ponga su RPE.</small></>
      botones = <>
        <button className={PRIMARIO} disabled={ocupado} onClick={() => unir(estado.sesion, estado.parte)}>Unir</button>
        <button className={FANTASMA} disabled={ocupado} onClick={() => noEsEsa(estado.sesion)}>No es esa</button>
      </>
      break
    case 'completar':
      chip = AMBAR; chipTexto = 'Ya cerrada a mano'
      cuerpo = <>¿Completar su <b>{nombreDe(estado.sesion)}</b> con el reloj?<small className="block text-gray-500 text-[12px]">Cambia la duración (y la FC si es de una sola tarea). Su RPE se queda.</small></>
      botones = <>
        <button className={PRIMARIO} disabled={ocupado} onClick={() => unir(estado.sesion, estado.parte)}>Completar con el reloj</button>
        <button className={FANTASMA} disabled={ocupado} onClick={() => noEsEsa(estado.sesion)}>No es esa</button>
      </>
      break
    case 'varias':
      chip = AMBAR; chipTexto = 'Varias ese día'
      cuerpo = <>¿Con cuál de sus sesiones de ese día va?</>
      botones = <>{estado.opciones.map(o => (
        <button key={o.sesion.id} className={BOTON} disabled={ocupado} onClick={() => unir(o.sesion, o.parte)}>{nombreDe(o.sesion)}</button>
      ))}</>
      break
    case 'sin_sesion':
      chip = CIELO; chipTexto = 'Sin sesión ese día'
      cuerpo = <>No estaba en el plan.<small className="block text-gray-500 text-[12px]">{enSuPanel ? 'En su app le sale «Apuntarla». ' : ''}Si te dijo cómo fue, puedes apuntarla tú.</small></>
      botones = modo === 'apuntar'
        ? deslizador(() => hacer(async () => (await apuntarDesdeReloj(supabase, { idDeportista, actividad: a, rpe, quien: 'entrenador' })).error), 'Su RPE (te lo dijo)')
        : modo === 'unir-a'
          ? <div className="flex flex-wrap gap-1.5 basis-full">
              {opciones.map(o => (
                <button key={o.sesion.id} className={BOTON} disabled={ocupado} onClick={() => unir(o.sesion, o.parte)}>
                  {diaDe(o.sesion.fecha)} · {nombreDe(o.sesion)}
                </button>
              ))}
              <button className={FANTASMA} onClick={() => setModo(null)}>Cancelar</button>
            </div>
          : <>
              <button className={BOTON} disabled={ocupado} onClick={() => setModo('apuntar')}>Apuntarla tú</button>
              {opciones.length > 0 && <button className={FANTASMA} disabled={ocupado} onClick={() => setModo('unir-a')}>Unir a otro día…</button>}
            </>
      break
    case 'no_cuenta':
      chip = GRIS
      if (estado.motivo === 'otro_deporte') {
        chipTexto = 'No cuenta'
        cuerpo = <>No es ninguna de sus disciplinas: no se une ni se pide.</>
      } else {
        chipTexto = 'No contada'
        cuerpo = <>Se decidió no contarla.</>
        const u = estado.union
        if (u) botones = <button className={FANTASMA} disabled={ocupado} onClick={() => hacer(() => quitarDecision(supabase, u))}>Deshacer</button>
      }
      break
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <span className={chip}>{chipTexto}</span>
      <p className="text-[13px] text-gray-300 flex-1 min-w-[220px] m-0">{cuerpo}</p>
      {botones}
      {error && <p className="basis-full text-[12.5px] text-red-300 m-0">{error}</p>}
    </div>
  )
}
