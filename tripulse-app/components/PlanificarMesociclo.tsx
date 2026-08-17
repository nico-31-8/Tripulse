'use client'
// ============================================================
// Planificar un mesociclo entero
// ============================================================
// El planificador de semanas genera una semana aislada. Esto genera el BLOQUE:
// cuatro semanas que suben y descargan, o las que tenga el mesociclo que el
// entrenador ya dibujó.
//
// Lee los mesociclos del atleta de la base en vez de pedir otra vez la
// estructura. Si ya hay un plan, la periodización es esa; preguntar por ella de
// nuevo abriría la puerta a dos periodizaciones distintas para el mismo atleta.
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import PlanCadena from '@/components/PlanCadena'
import {
  semanasDelMesociclo, claseDeMeso, semanasHasta, pisaElTapering,
  type SemanaDelMeso,
} from '@/lib/plan-mesociclo'
import { formaDeSemana, type EntradaSemana } from '@/lib/plan-semana'
import { colocarSemana, type DiaDisponible } from '@/lib/plan-colocacion'
import { rellenarSemana, nivelDePlantilla, type SemanaRellena } from '@/lib/plan-relleno'
import { bloquesPorClave, aplicarBloques } from '@/lib/plantillas'
import { volcarSemana, loQueYaHay } from '@/lib/plan-volcado'
import { sumarDias } from '@/lib/desplazar'
import type { DistanciaTri } from '@/lib/distribucion-zonas'
import type { NivelAtleta } from '@/lib/plan-semana'

interface MesoFila {
  id: number
  objetivo: string | null
  tipo: string | null
  fecha_inicio: string
  duracion_semanas: number | null
}

interface Props {
  dep: any
  /** Lo que no cambia de una semana a otra dentro del bloque. */
  base: { diasSemana: number; distancia: DistanciaTri; nivel: NivelAtleta; disciplinaDebil?: string | null }
  /** Horas de una semana PLENA. La carga relativa las escala. */
  horasReferencia: number
  disponibilidad: DiaDisponible[]
  onCerrar: () => void
}

export default function PlanificarMesociclo({ dep, base, horasReferencia, disponibilidad, onCerrar }: Props) {
  const [mesos, setMesos] = useState<MesoFila[]>([])
  const [competis, setCompetis] = useState<{ nombre: string; fecha: string }[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [vista, setVista] = useState<'bloque' | 'plan'>('bloque')
  const [cargando, setCargando] = useState(true)

  const [generadas, setGeneradas] = useState<SemanaRellena[] | null>(null)
  const [yaHay, setYaHay] = useState<Record<string, number>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [volcando, setVolcando] = useState<string | null>(null)
  const [parte, setParte] = useState<string[]>([])

  useEffect(() => {
    const cargar = async () => {
      const { data: macs } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
      const ids = (macs || []).map((m: any) => m.id)
      const { data: me } = ids.length
        ? await supabase.from('mesociclo').select('id, objetivo, tipo, fecha_inicio, duracion_semanas')
            .in('id_macrociclo', ids).order('fecha_inicio')
        : { data: [] }
      setMesos((me || []) as MesoFila[])
      setSelId((me || [])[0]?.id ?? null)
      const { data: c } = await supabase.from('competicion').select('nombre, fecha')
        .eq('id_deportista', dep.id).order('fecha')
      setCompetis((c || []).map((x: any) => ({ nombre: x.nombre, fecha: String(x.fecha).slice(0, 10) })))
      setCargando(false)
    }
    cargar()
  }, [dep.id])

  const meso = mesos.find(m => m.id === selId) || null

  const semanas: SemanaDelMeso[] = useMemo(() => meso ? semanasDelMesociclo({
    tipo: meso.tipo,
    semanas: meso.duracion_semanas || 4,
    horasReferencia,
    distancia: base.distancia,
    lunes: String(meso.fecha_inicio).slice(0, 10),
  }) : [], [meso, horasReferencia, base.distancia])

  const entradaDe = (s: SemanaDelMeso): EntradaSemana => ({
    horasSemana: s.horasSemana, diasSemana: base.diasSemana, distancia: base.distancia,
    fase: s.fase, nivel: base.nivel, disciplinaDebil: base.disciplinaDebil,
  })

  const generar = () => {
    const dias = disponibilidad.length ? disponibilidad : base.diasSemana
    setGeneradas(semanas.map(s => {
      const e = entradaDe(s)
      const forma = formaDeSemana(e)
      return rellenarSemana({ forma, colocada: colocarSemana(forma, dias), nivel: base.nivel, fase: s.fase })
    }))
    setParte([])
  }

  // Qué hay ya en el calendario en cada una de esas semanas. Volcar encima
  // duplica sin avisar, y con cuatro semanas de golpe eso se multiplica.
  useEffect(() => {
    if (!generadas || !semanas.length) return
    let vivo = true
    Promise.all(semanas.map(s => loQueYaHay(supabase, dep.id, s.lunes!).then(n => [s.lunes!, n] as const)))
      .then(pares => { if (vivo) setYaHay(Object.fromEntries(pares)) })
      .catch(() => {})
    return () => { vivo = false }
  }, [generadas, semanas, dep.id])

  const volcarTodo = async () => {
    if (!generadas) return
    setConfirmando(false)
    const nivelP = nivelDePlantilla(base.nivel)
    const lineas: string[] = []
    for (let i = 0; i < generadas.length; i++) {
      const lunes = semanas[i].lunes!
      setVolcando(lunes)
      const r = await volcarSemana(supabase, {
        idDeportista: dep.id, lunes, relleno: generadas[i].relleno,
        aplicarBloques, bloquesDe: clave => bloquesPorClave(clave, nivelP) || [],
      })
      lineas.push('Semana ' + (i + 1) + ' (' + lunes + '): ' + r.creadas + ' sesiones' +
        (r.error ? ' · ' + r.error : ''))
      setParte([...lineas])
    }
    setVolcando(null)
  }

  const totalSesiones = generadas?.reduce((a, g) => a + g.relleno.length, 0) ?? 0
  const yaHayTotal = Object.values(yaHay).reduce((a, n) => a + n, 0)

  // La competición más cercana por delante del bloque, para avisar del tapering.
  const finBloque = semanas.length ? semanas[semanas.length - 1].lunes! : null
  const compAviso = finBloque
    ? competis.find(c => pisaElTapering(sumarDias(finBloque, 7), c.fecha, base.distancia))
    : null

  if (cargando) return <p className="text-gray-500 text-sm">Buscando los mesociclos de {dep.nombre}…</p>

  if (!mesos.length) return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <p className="text-[13.5px] text-gray-300">{dep.nombre} no tiene mesociclos todavía.</p>
      <p className="text-[12.5px] text-gray-500 mt-1.5">
        La periodización se dibuja en Planificación → Periodización. Esta pantalla la lee de ahí en
        vez de pedirte la estructura otra vez: con dos sitios donde definirla, una de las dos mentiría.
      </p>
      <button onClick={onCerrar} className="mt-3 text-[13px] text-orange-400 hover:text-orange-300">← Volver a la semana suelta</button>
    </div>
  )

  if (vista === 'plan') return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setVista('bloque')} className="text-[13px] text-orange-400 hover:text-orange-300">← Un bloque</button>
        <span className="text-[12.5px] text-gray-500">
          Los {mesos.length} mesociclos de {dep.nombre}, encadenados.
        </span>
      </div>
      <PlanCadena dep={dep} mesos={mesos} horasReferencia={horasReferencia}
        distancia={base.distancia} competicion={competis[0]?.fecha ?? null} />
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Mesociclo</span>
          <select value={selId ?? ''} onChange={e => { setSelId(Number(e.target.value)); setGeneradas(null) }}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-orange-500 min-w-[280px]">
            {mesos.map(m => (
              <option key={m.id} value={m.id}>
                {(m.objetivo || 'Sin nombre') + ' · ' + (m.tipo || '—') + ' · ' + (m.duracion_semanas || 4) + ' sem · desde ' + String(m.fecha_inicio).slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        <button onClick={generar} disabled={!meso}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
          Ver las {semanas.length} semanas →
        </button>
        {mesos.length > 1 && (
          <button onClick={() => setVista('plan')}
            className="text-[13px] text-orange-400 hover:text-orange-300 transition">
            Ver todo el plan encadenado →
          </button>
        )}
        <button onClick={onCerrar} className="text-gray-400 hover:text-white text-sm transition">← Una semana suelta</button>
      </div>

      {meso && (
        <p className="text-[12.5px] text-gray-500">
          Bloque de <b className="text-gray-300">{claseDeMeso(meso.tipo)}</b>, {semanas.length} semanas
          desde el {String(meso.fecha_inicio).slice(0, 10)}. Las horas salen de {horasReferencia} h
          de referencia escaladas por la carga de cada semana.
        </p>
      )}

      {compAviso && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5">
          <span className="text-sm leading-none mt-0.5">⚠️</span>
          <p className="text-[12.5px] text-amber-200/90">
            El bloque termina dentro del tapering de «{compAviso.nombre}» ({compAviso.fecha}). Cargar
            ahí deja fatiga que ya no da tiempo a soltar antes de la carrera.
          </p>
        </div>
      )}

      {/* La forma del bloque: es lo que no existía hasta ahora. */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        {semanas.map((s, i) => {
          const g = generadas?.[i]
          const hay = s.lunes ? yaHay[s.lunes] : 0
          return (
            <div key={s.n} className={'flex items-center gap-3 px-3.5 py-2.5 ' + (i ? 'border-t border-gray-800 ' : '') +
              (s.esDescarga ? 'bg-green-500/[0.05]' : '')}>
              <span className="text-[13px] font-bold text-gray-400 w-7 tabular-nums">S{s.n}</span>
              <span className="text-[12px] text-gray-500 w-[86px] tabular-nums">{s.lunes}</span>
              {/* Barra de carga relativa: la forma se ve antes de leer los números. */}
              <span className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden min-w-[60px]">
                <span className="block h-full rounded-full"
                  style={{ width: Math.min(100, s.cargaRelativa * 90) + '%', background: s.esDescarga ? '#22c55e' : '#f97316' }} />
              </span>
              <span className="text-[12.5px] text-gray-300 w-[150px]">{s.etiqueta}</span>
              <span className="text-[13px] font-semibold text-orange-400 w-16 text-right tabular-nums">{s.horasSemana} h</span>
              <span className="text-[12px] text-gray-500 w-24 text-right tabular-nums">
                {g ? g.relleno.length + ' sesiones' : '—'}
              </span>
              <span className="text-[11.5px] w-24 text-right">
                {hay ? <span className="text-amber-400">{hay} ya puestas</span> : <span className="text-gray-700">vacía</span>}
              </span>
            </div>
          )
        })}
      </div>

      {generadas && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-gray-400">
            {totalSesiones} sesiones en {generadas.length} semanas
            {yaHayTotal > 0 && <span className="text-amber-400"> · el calendario ya tiene {yaHayTotal} en esas fechas</span>}
          </span>
          {!confirmando ? (
            <button onClick={() => setConfirmando(true)} disabled={!!volcando}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
              {volcando ? 'Volcando ' + volcando + '…' : 'Volcar el bloque al calendario'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-amber-300">
                {yaHayTotal > 0 ? 'Se SUMAN a las que ya hay, no las reemplazan. ¿Seguro?' : '¿Volcar las ' + generadas.length + ' semanas?'}
              </span>
              <button onClick={volcarTodo} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">Sí, volcar</button>
              <button onClick={() => setConfirmando(false)} className="text-gray-400 hover:text-white text-sm">Cancelar</button>
            </div>
          )}
        </div>
      )}

      {parte.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3.5 flex flex-col gap-1">
          {parte.map((l, i) => <p key={i} className="text-[12.5px] text-gray-300">{l}</p>)}
        </div>
      )}
    </div>
  )
}
