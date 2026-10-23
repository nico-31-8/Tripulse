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
import { type DiaDisponible } from '@/lib/plan-colocacion'
import { nivelDePlantilla } from '@/lib/plan-relleno'
import { semanaDelBloque, textoCompeticion, type SemanaDelBloque, type CompeticionDelPlan } from '@/lib/plan-bloque'
import { aplicarBloques } from '@/lib/plantillas'
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
  const [competis, setCompetis] = useState<(CompeticionDelPlan & { nombre: string })[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [vista, setVista] = useState<'bloque' | 'plan'>('bloque')
  const [cargando, setCargando] = useState(true)

  const [generadas, setGeneradas] = useState<SemanaDelBloque[] | null>(null)
  const [yaHay, setYaHay] = useState<Record<string, number>>({})
  // Se sube después de volcar para volver a contar: el recuento de antes ya no vale.
  const [recuento, setRecuento] = useState(0)
  const [confirmando, setConfirmando] = useState(false)
  const [volcando, setVolcando] = useState<string | null>(null)
  const [parte, setParte] = useState<string[]>([])

  useEffect(() => {
    const cargar = async () => {
      /* A la vez y sin pasar por el macrociclo: `mesociclo.id_deportista` dice
         de quién es (Fase A), como en la cadena del mesociclo. Eran tres
         esperas en fila. */
      /* Las competiciones con `*`: hace falta su prioridad para saber si la
         víspera se entrena, y es una columna que puede no estar en todas las
         bases (nombrarla tumbaría la consulta entera). */
      const [{ data: me }, { data: c }] = await Promise.all([
        supabase.from('mesociclo').select('id, objetivo, tipo, fecha_inicio, duracion_semanas')
          .eq('id_deportista', dep.id).order('fecha_inicio'),
        supabase.from('competicion').select('*')
          .eq('id_deportista', dep.id).order('fecha'),
      ])
      setMesos((me || []) as MesoFila[])
      setSelId((me || [])[0]?.id ?? null)
      setCompetis((c || []).map((x: any) => ({ nombre: x.nombre, fecha: String(x.fecha).slice(0, 10), prioridad: x.prioridad ?? null })))
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

  /* Con lo que el motor no puede adivinar: qué disciplinas hace (su ficha) y
     qué días compite. Sin las dos, a una corredora le salían natación y
     ciclismo, y una tirada larga el día de su carrera. */
  const generar = () => {
    setGeneradas(semanas.map(s => semanaDelBloque(s,
      { ...base, disciplinas: dep.disciplinas ?? null },
      { disponibilidad, competiciones: competis })))
    setParte([])
  }

  // Qué hay ya en el calendario en cada una de esas semanas. Las que tienen
  // algo no se tocan al volcar (lib/plan-volcado), y hay que decirlo antes.
  useEffect(() => {
    if (!generadas || !semanas.length) return
    let vivo = true
    Promise.all(semanas.map(s => loQueYaHay(supabase, dep.id, s.lunes!).then(n => [s.lunes!, n] as const)))
      .then(pares => { if (vivo) setYaHay(Object.fromEntries(pares)) })
      .catch(() => {})
    return () => { vivo = false }
  }, [generadas, semanas, dep.id, recuento])

  const volcarTodo = async () => {
    if (!generadas) return
    setConfirmando(false)
    const nivelP = nivelDePlantilla(base.nivel)
    /* TODAS A LA VEZ (iban semana a semana, varias esperas cada una). El parte
       sale en el orden de las semanas aunque terminen en otro: cada línea va a
       su sitio según cae. */
    const lineas: string[] = generadas.map(() => '')
    setVolcando(generadas.length === 1 ? semanas[0].lunes! : generadas.length + ' semanas')
    await Promise.all(generadas.map(async (g, i) => {
      const lunes = semanas[i].lunes!
      const r = await volcarSemana(supabase, {
        idDeportista: dep.id, lunes, relleno: g.relleno,
        aplicarBloques, nivel: nivelP,
      })
      // Las que no caben en sus minutos sin salirse de lo documentado, por su día.
      const cortas = r.parte.filter(p => p.ok && p.aviso).map(p => p.dia.toLowerCase())
      lineas[i] = 'Semana ' + (i + 1) + ' (' + lunes + '): ' + (r.yaHabia && !r.creadas
        ? 'ya tenía ' + r.yaHabia + ' sesión(es), no se ha tocado'
        : r.creadas + ' sesiones' + (r.error ? ' · ' + r.error : '')
          + (cortas.length ? ' · no caben en sus minutos: ' + cortas.join(', ') : ''))
      setParte(lineas.filter(Boolean))
    }))
    setVolcando(null)
    setRecuento(n => n + 1)
  }

  const totalSesiones = generadas?.reduce((a, g) => a + g.relleno.length, 0) ?? 0
  const yaHayTotal = Object.values(yaHay).reduce((a, n) => a + n, 0)
  const semanasConAlgo = Object.values(yaHay).filter(n => n > 0).length

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
              {/* En la semana de una carrera, las horas que quedan sin los días que se libran. */}
              <span className="text-[13px] font-semibold text-orange-400 w-16 text-right tabular-nums"
                title={g?.competicion ? textoCompeticion(g.competicion) : undefined}>
                {g?.competicion ? g.competicion.horas : s.horasSemana} h
              </span>
              <span className="text-[12px] text-gray-500 w-24 text-right tabular-nums">
                {g ? g.relleno.length + ' sesiones' : '—'}
              </span>
              <span className="text-[11.5px] w-24 text-right">
                {hay ? <span className="text-amber-400" title="Al volcar, esta semana no se toca">{hay} ya puestas</span> : <span className="text-gray-700">vacía</span>}
              </span>
            </div>
          )
        })}
      </div>

      {generadas?.some(g => g.competicion) && (
        <div className="flex flex-col gap-1">
          {generadas.map((g, i) => g.competicion && (
            <p key={i} className="text-[12px] text-gray-400">🏁 S{i + 1} ({semanas[i]?.lunes}): {textoCompeticion(g.competicion)}</p>
          ))}
        </div>
      )}

      {generadas && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-gray-400">
            {totalSesiones} sesiones en {generadas.length} semanas
            {semanasConAlgo > 0 && <span className="text-amber-400"> · {semanasConAlgo} de esas semanas ya tienen sesiones ({yaHayTotal}) y no se tocan</span>}
          </span>
          {!confirmando ? (
            <button onClick={() => setConfirmando(true)} disabled={!!volcando}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
              {volcando ? 'Volcando ' + volcando + '…' : 'Volcar el bloque al calendario'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-amber-300">
                {semanasConAlgo > 0
                  ? 'Se llenan solo las vacías; las que ya tienen sesiones no se tocan. ¿Volcar?'
                  : '¿Volcar las ' + generadas.length + ' semanas?'}
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
