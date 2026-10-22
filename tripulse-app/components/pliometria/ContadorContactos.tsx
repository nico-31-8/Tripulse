'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { leerAnamnesis } from '@/lib/anamnesis-vigente'
import { nivelDeAnamnesis } from '@/lib/anamnesis-datos'
import type { NivelAtleta } from '@/lib/plan-semana'
import {
  resumenContactos, avisoContactos, nivelesQueSePasan, reglaContactos, peldano,
  RANGO_RESISTENCIA, NIVELES_PLIO, type PiezaPlio, type ClaseAviso,
} from '@/lib/pliometria'
import LetraNivel from './LetraNivel'
import { decidirAvance, type Importancia, type Veredicto } from '@/lib/pliometria-avance'
import { cargarAvance } from '@/lib/pliometria-avance-datos'

const VEREDICTO: Record<ClaseAviso, string> = {
  suave: 'bg-white/5 text-gray-300',
  ok: 'bg-emerald-400/10 text-emerald-200',
  alto: 'bg-amber-400/10 text-amber-200',
  mucho: 'bg-red-400/10 text-red-200',
}

const NOMBRE_NIVEL: Record<NivelAtleta, string> = {
  principiante: 'principiante', intermedio: 'intermedio', avanzado: 'avanzado', elite: 'élite',
}

/**
 * Los contactos de pie de la sesión, sobre una regla: la franja de 60-100 de
 * resistencia, el tope de la NSCA para su nivel y el total. Debajo, cada nivel
 * con su rango. Solo se monta si la sesión lleva pliometría, así que la
 * anamnesis no se pide en las demás.
 */
export default function ContadorContactos({ piezas, deportistaId }: { piezas: PiezaPlio[]; deportistaId: number }) {
  /* null mientras llega: sin su nivel no se sabe su tope, y un aviso que
     cambia de color al cargar despista más que esperar un momento. */
  const [nivel, setNivel] = useState<NivelAtleta | null>(null)
  const [deSuAnamnesis, setDeSuAnamnesis] = useState(false)
  /* Lo que propone la app para la semana que viene y para qué le sirven según
     su deporte: lo mismo que en su ficha, para verlo al prescribir. */
  const [avance, setAvance] = useState<Veredicto | null>(null)

  useEffect(() => {
    let vivo = true
    leerAnamnesis(supabase, deportistaId, 'nivel_competitivo').then(({ data }) => {
      if (!vivo) return
      setNivel(nivelDeAnamnesis(data?.nivel_competitivo))
      setDeSuAnamnesis(!!data?.nivel_competitivo)
    })
    cargarAvance(supabase, deportistaId)
      .then(b => { if (vivo && b) setAvance(decidirAvance(b)) })
      .catch(() => { /* sin avance, el contador de siempre */ })
    return () => { vivo = false }
  }, [deportistaId])

  const lineas = avance && <LineasAvance v={avance} />

  const r = resumenContactos(piezas)
  const [lo, hi] = RANGO_RESISTENCIA
  const quien = nivel ? NOMBRE_NIVEL[nivel] : null
  const extras = (
    <>
      {r.lanzamientos > 0 && <span>{r.lanzamientos} lanzamientos de tren superior y tronco (sin aviso)</span>}
      {r.sinContar > 0 && (
        <span>{r.sinContar === 1 ? '1 ejercicio va' : r.sinContar + ' ejercicios van'} por tiempo o sin repeticiones: no se cuenta{r.sinContar === 1 ? '' : 'n'}</span>
      )}
    </>
  )

  /* Sin contactos de pie no hay nada que medir contra la regla. */
  if (!r.pies) {
    return (
      <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900/60 px-3.5 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        <span className="text-orange-300 font-semibold">Pliometría</span>
        {extras}
        {lineas}
      </div>
    )
  }

  const regla = reglaContactos(r.pies, nivel ?? 'intermedio')
  const aviso = nivel ? avisoContactos(r.pies, nivel) : null
  const sePasan = nivelesQueSePasan(r.porNivel)

  return (
    <section aria-label="Contactos de pliometría de la sesión"
      className="mb-4 rounded-xl border border-gray-800 bg-gray-900/60 px-3.5 py-3 grid gap-x-3.5 gap-y-2 items-center grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <p className="m-0 font-mono text-[26px] font-semibold leading-none tabular-nums text-gray-100">
        {r.pies}<small className="font-sans text-xs text-gray-500 font-medium ml-1">contactos</small>
      </p>

      <div aria-hidden="true">
        <div className="relative h-2.5 rounded-md bg-white/[0.06] overflow-hidden">
          <span className="absolute inset-y-0 bg-emerald-400/20 border-x border-emerald-400/60"
            style={{ left: regla.desde + '%', width: (regla.hasta - regla.desde) + '%' }} />
          {nivel && <span className="absolute inset-y-0 w-0.5 bg-red-400" style={{ left: regla.enTope + '%' }} />}
          <span className="absolute inset-y-0 w-[3px] rounded-sm bg-white -translate-x-1/2 transition-[left] duration-200 motion-reduce:transition-none"
            style={{ left: regla.marca + '%' }} />
        </div>
        <div className="relative h-3.5 mt-0.5 font-mono text-[10.5px] text-gray-500 tabular-nums">
          <span className="absolute left-0">0</span>
          <span className="absolute -translate-x-1/2" style={{ left: regla.desde + '%' }}>{lo}</span>
          {/* Con un tope de 100 (principiante), el rojo ya dice el número. */}
          {regla.tope !== hi && <span className="absolute -translate-x-1/2" style={{ left: regla.hasta + '%' }}>{hi}</span>}
          {nivel && <span className="absolute -translate-x-1/2 text-red-300" style={{ left: regla.enTope + '%' }}>{regla.tope}</span>}
        </div>
      </div>

      <p className={'m-0 text-[12.5px] px-2.5 py-1.5 rounded-lg sm:max-w-[46ch] ' + (aviso ? VEREDICTO[aviso.clase] : 'bg-white/5 text-gray-500')}
        role="status">
        {aviso ? aviso.texto : 'Mirando su nivel…'}
      </p>

      <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-400">
        {NIVELES_PLIO.some(k => r.porNivel[k]) && (
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
            Por nivel:
            {NIVELES_PLIO.filter(k => r.porNivel[k]).map(k => {
              const rango = peldano('inferior', k).rango!
              const pasa = sePasan.includes(k)
              return (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <LetraNivel nivel={k} pequena />
                  <b className={'font-mono font-semibold tabular-nums ' + (pasa ? 'text-amber-300' : 'text-gray-200')}>{r.porNivel[k]}</b>
                  <span>de {rango[0]}–{rango[1]}{pasa ? ' · se pasa' : ''}</span>
                </span>
              )
            })}
          </span>
        )}
        {extras}
        {quien && (
          <span className="text-gray-500">
            Tope de {quien}{deSuAnamnesis ? ', según su anamnesis' : ' (sin nivel en su anamnesis)'}
          </span>
        )}
      </div>
      {lineas}
    </section>
  )
}

const PUNTO: Record<Veredicto['clase'], string> = {
  bien: 'bg-emerald-400', ambar: 'bg-amber-400', rojo: 'bg-red-400', neutro: 'bg-gray-500', 'sin-nivel': 'bg-gray-500',
}

/** Lo que dice su deporte, en una línea. */
function lineaDeporte(imp: Importancia): string {
  if (imp.decidido) return 'Lo has marcado tú: ' + (imp.necesita ? 'los necesita.' : 'no los necesita.')
  if (imp.tipo === 'corre') return 'Su deporte los pide. Cuentan como impacto, igual que correr.'
  if (imp.tipo === 'pedalea') return 'Para su deporte (ciclismo) no hacen falta: si los hace, con una vez por semana basta.'
  if (imp.tipo === 'nada') return 'Para nadar, los de piernas solo sirven para salidas y virajes; los lanzamientos, sí.'
  return 'No sé su deporte: márcalo en su ficha, en «Entrenamiento».'
}

/** La propuesta de la semana que viene (con su nivel puesto) y su deporte, bajo el contador. */
function LineasAvance({ v }: { v: Veredicto }) {
  return (
    <div className="col-span-full basis-full flex flex-col gap-1 border-t border-gray-800 pt-2 mt-0.5 text-[12px]">
      {v.clase !== 'sin-nivel' && v.clase !== 'neutro' && (
        <p className="m-0 flex items-baseline gap-2 text-gray-300">
          <span className={'w-1.5 h-1.5 rounded-full flex-none translate-y-[-1px] ' + PUNTO[v.clase]} aria-hidden="true" />
          <span>La app propone para la semana que viene: <b className="text-gray-100">{v.corto}</b>. El porqué, en su ficha (Saltos).</span>
        </p>
      )}
      <p className="m-0 flex items-baseline gap-2 text-gray-400">
        <span className={'w-1.5 h-1.5 rounded-full flex-none translate-y-[-1px] ' + (v.imp.necesita ? 'bg-emerald-400' : 'bg-gray-500')} aria-hidden="true" />
        <span>{lineaDeporte(v.imp)}</span>
      </p>
    </div>
  )
}
