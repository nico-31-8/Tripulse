'use client'
// ============================================================
// La tarjeta del reloj en el cuestionario de cierre del DEPORTISTA
// ============================================================
// Pantalla 1 de la maqueta del 2026-10-19. Solo pinta: qué entreno de su reloj
// encaja con la sesión que cierra, y los botones. Lo decide y lo guarda
// BriefingSesion (lib/reloj-sesion y lib/reloj-union).

import { DIAS_SEMANA, indiceDia } from '@/lib/fechas'
import { cifrasDeActividad, type ActividadReloj } from '@/lib/actividades-reloj'
import { emojiDisciplina, etiquetaDisciplina } from '@/lib/disciplinas'

export interface ParteDelReloj { actividad: ActividadReloj; parte: number }

interface Props {
  /** «COROS», «Polar». */
  marca: string
  /** Lo que ya está puesto en el cuestionario, o null. */
  usadas: ParteDelReloj[] | null
  /** Lo puesto lo unió su entrenador (no lo eligió él). */
  deEntrenador: boolean
  sugeridas: ParteDelReloj[]
  /** De otros días de la semana, por si la hizo otro día. */
  otras: ParteDelReloj[]
  vista: 'pregunta' | 'otras' | 'cerrado'
  onUsar: (partes: ParteDelReloj[]) => void
  onNoEsEsta: () => void
  onCerrar: () => void
}

const diaCorto = (f: string) => DIAS_SEMANA[indiceDia(f)].toLowerCase() + ' ' + Number(f.slice(8, 10))

/** Debajo del RPE cuando lo demás viene del reloj: es lo único que el reloj no sabe. */
export function AvisoRpeReloj({ falta, className = 'mt-2' }: { falta: boolean; className?: string }) {
  return (
    <p className={'text-xs ' + className + ' ' + (falta ? 'text-amber-300 font-semibold' : 'text-gray-400')}>
      {falta ? 'Falta tu RPE: mueve la barra, aunque sea para dejarla en 5.' : 'Esto el reloj no lo sabe: sin tu RPE no cuenta para tu carga.'}
    </p>
  )
}

function Linea({ p, conDia = false }: { p: ParteDelReloj; conDia?: boolean }) {
  return (
    <span className="block text-[12.5px] text-gray-300 tabular-nums">
      {emojiDisciplina(p.actividad.disciplina)} {etiquetaDisciplina(p.actividad.disciplina)}
      {conDia ? ' · ' + diaCorto(p.actividad.fecha) : ''} · {cifrasDeActividad(p.actividad)}
    </span>
  )
}

export default function TarjetaRelojCierre({ marca, usadas, deEntrenador, sugeridas, otras, vista, onUsar, onNoEsEsta, onCerrar }: Props) {
  if (vista === 'cerrado' || (!usadas && !sugeridas.length && !otras.length && vista !== 'otras')) return null
  return (
    <div className="rounded-xl border border-sky-400/35 bg-sky-400/10 p-3.5 mb-4 flex flex-col gap-2">
      {usadas ? (
        <>
          <p className="text-[13px] text-white m-0">
            ✓ {deEntrenador ? 'Tu entrenador la ha unido con tu ' + marca : 'Datos de tu ' + marca + ' puestos'}. Puedes cambiarlos.
          </p>
          {usadas.map(p => <Linea key={p.actividad.id} p={p} />)}
          <div><button type="button" onClick={onNoEsEsta} className="text-[12.5px] font-semibold text-gray-400 hover:text-white transition">No es esta</button></div>
        </>
      ) : vista === 'otras' || !sugeridas.length ? (
        <>
          <p className="text-[13px] text-white m-0">
            {vista === 'otras' ? '¿Cuál de tus entrenos fue?' : '⌚ ¿La hiciste otro día? Tu ' + marca + ' tiene entrenos de esta semana sin unir:'}
          </p>
          {otras.map(p => (
            <button key={p.actividad.id} type="button" onClick={() => onUsar([p])}
              className="text-left px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition"><Linea p={p} conDia /></button>
          ))}
          <div>
            <button type="button" onClick={onCerrar} className="text-[12.5px] font-semibold text-gray-400 hover:text-white transition">
              {vista === 'otras' ? 'Ninguno: la cierro a mano' : 'No, la hice el día que tocaba'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-white m-0">⌚ Tu {marca} registró este entreno ese día:</p>
          {sugeridas.map(p => <Linea key={p.actividad.id} p={p} />)}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onUsar(sugeridas)}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-sky-400 text-[#04121b] hover:brightness-110 transition">Es esta: usar sus datos</button>
            <button type="button" onClick={onNoEsEsta}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition">No es esta</button>
          </div>
        </>
      )}
    </div>
  )
}
