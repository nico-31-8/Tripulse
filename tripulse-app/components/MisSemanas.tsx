'use client'
// ============================================================
// Generar las semanas de un bloque — versión del DEPORTISTA
// ============================================================
// Es la misma maquinaria que usa el entrenador en `CadenaMesociclo`, pero
// contada al revés. Allí se decide y se vuelca; aquí se pregunta «¿qué me toca
// ahora?» y se responde. Nada de «volcar al calendario», ni de avisos sobre lo
// que ya hay: para el atleta esas son palabras de otro oficio.
//
// Lo que SÍ se conserva es lo que le afecta: si ya tiene sesiones esas semanas
// no se le crean encima sin decírselo.
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { semanasDelMesociclo, entradaDeSemana, type SemanaDelMeso } from '@/lib/plan-mesociclo'
import { formaDeSemana, type EntradaSemana, type NivelAtleta } from '@/lib/plan-semana'
import { colocarSemana, type DiaDisponible } from '@/lib/plan-colocacion'
import { rellenarSemana, nivelDePlantilla, type SemanaRellena } from '@/lib/plan-relleno'
import { volcarSemana, loQueYaHay } from '@/lib/plan-volcado'
import { aplicarBloques, bloquesPorClave } from '@/lib/plantillas'
import { sumarDias } from '@/lib/desplazar'
import { testsDelPlan, type EncargoTests } from '@/lib/plan-tests'
import { adaptar, horasAdaptadas, type Adaptacion } from '@/lib/plan-adaptacion'
import type { DistanciaTri } from '@/lib/distribucion-zonas'

interface MesoFila {
  id: number
  objetivo: string | null
  tipo: string | null
  fecha_inicio: string
  duracion_semanas: number | null
}

interface Props {
  idDeportista: number
  distancia: DistanciaTri
  nivel: NivelAtleta
  dias: number
  disponibilidad: DiaDisponible[]
  horasReferencia: number
  disciplinaDebil?: string | null
  onCambio?: () => void
}

interface Generada extends SemanaDelMeso {
  plan: SemanaRellena
  yaHay: number | null
  creadas?: number
  error?: string | null
}

const totalCreadasCalc = (g: Generada[] | null) => (g || []).reduce((a, s) => a + (s.creadas || 0), 0)

export default function MisSemanas({
  idDeportista, distancia, nivel, dias, disponibilidad, horasReferencia, disciplinaDebil, onCambio,
}: Props) {
  const [mesos, setMesos] = useState<MesoFila[]>([])
  const [uaPorMeso, setUaPorMeso] = useState<Record<number, (number | null)[]>>({})
  const [selId, setSelId] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [generadas, setGeneradas] = useState<Generada[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [competicion, setCompeticion] = useState<string | null>(null)
  const [adap, setAdap] = useState<Adaptacion | null>(null)

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      const { data: ms } = await supabase.from('mesociclo')
        .select('id, objetivo, tipo, fecha_inicio, duracion_semanas')
        .eq('id_deportista', idDeportista).order('fecha_inicio')
      const lista: MesoFila[] = (ms || []).map((m: any) => ({ ...m, fecha_inicio: String(m.fecha_inicio).slice(0, 10) }))

      const { data: micros } = lista.length
        ? await supabase.from('microciclo').select('id_mesociclo, fecha_inicio, ua_planificada').in('id_mesociclo', lista.map(m => m.id))
        : { data: [] as any[] }
      const ua: Record<number, (number | null)[]> = {}
      lista.forEach(m => {
        const suyos = (micros || []).filter((mi: any) => mi.id_mesociclo === m.id)
        ua[m.id] = Array.from({ length: m.duracion_semanas || 1 }, (_, i) => {
          const obj = sumarDias(m.fecha_inicio, i * 7)
          return suyos.find((x: any) => String(x.fecha_inicio).slice(0, 10) === obj)?.ua_planificada ?? null
        })
      })

      const { data: comps } = await supabase.from('competicion')
        .select('fecha').eq('id_deportista', idDeportista).order('fecha')

      /* Lo que ha hecho de verdad en las últimas cuatro semanas. Es lo que
         hace que el plan reaccione en vez de repetirse. */
      const hoy = new Date().toISOString().slice(0, 10)
      const { data: hechas } = await supabase.from('sesion')
        .select('fecha_sesion, estado, rpe_estimado, rpe_reportado')
        .eq('id_deportista', idDeportista)
        .gte('fecha_sesion', sumarDias(hoy, -28)).lt('fecha_sesion', hoy)
        .or('eliminada.is.null,eliminada.eq.false')

      if (!vivo) return
      setMesos(lista); setUaPorMeso(ua)
      setCompeticion(comps?.length ? String(comps[comps.length - 1].fecha).slice(0, 10) : null)
      setAdap(adaptar((hechas || []).map((x: any) => ({
        fecha: String(x.fecha_sesion).slice(0, 10),
        estado: x.estado,
        rpeEsperado: x.rpe_estimado,
        rpeReportado: x.rpe_reportado,
      })), dias))
      // Arranca en el bloque en el que está HOY, que es lo que quiere ver: el
      // primero cuyo final aún no ha pasado.
      const actual = lista.find(m => sumarDias(m.fecha_inicio, (m.duracion_semanas || 4) * 7) > hoy)
      setSelId((actual || lista[0])?.id ?? null)
      setCargando(false)
    }
    cargar()
    return () => { vivo = false }
  }, [idDeportista])

  const meso = mesos.find(m => m.id === selId) || null

  /* Las horas con las que se generan las semanas: las suyas, corregidas por lo
     que de verdad está haciendo. Sin adaptación, las mismas de siempre. */
  const horasUsadas = adap ? horasAdaptadas(horasReferencia, adap) : horasReferencia
  const diasUsados = adap?.diasSugeridos ?? dias

  const semanas = useMemo(() => meso ? semanasDelMesociclo({
    tipo: meso.tipo, semanas: meso.duracion_semanas || 4,
    horasReferencia: horasUsadas, distancia, lunes: meso.fecha_inicio, uaPorSemana: uaPorMeso[meso.id],
  }) : [], [meso, horasReferencia, distancia, uaPorMeso])

  /**
   * Los tests que caen en este bloque.
   *
   * Se calculan sobre TODO el plan y no solo sobre el bloque: «la primera
   * semana de la temporada» y «seis antes de la carrera» son posiciones dentro
   * del plan entero, y mirando un bloque suelto no se sabe cuál es cuál.
   */
  const tests = useMemo<EncargoTests[]>(() => {
    if (!mesos.length) return []
    const todas = mesos.flatMap(m => semanasDelMesociclo({
      tipo: m.tipo, semanas: m.duracion_semanas || 4,
      horasReferencia: horasUsadas, distancia, lunes: m.fecha_inicio, uaPorSemana: uaPorMeso[m.id],
    }).map(x => ({
      lunes: x.lunes || '', n: 0, tipoMeso: m.tipo,
      esDescarga: x.esDescarga, primeraDelBloque: x.n === 1,
    })))
    todas.sort((a, b) => a.lunes.localeCompare(b.lunes)).forEach((x, i) => { x.n = i })
    return testsDelPlan(todas, competicion)
  }, [mesos, uaPorMeso, horasReferencia, distancia, competicion])

  const testDeLaSemana = (lunes?: string) => tests.find(t => t.lunes === lunes)

  const generar = async () => {
    if (!meso) return
    setTrabajando(true)
    const base = { diasSemana: diasUsados, distancia, nivel, disciplinaDebil }
    const out: Generada[] = []
    for (const s of semanas) {
      const e: EntradaSemana = entradaDeSemana(s, base)
      const forma = formaDeSemana(e)
      const plan = rellenarSemana({
        forma,
        colocada: colocarSemana(forma, disponibilidad.length ? disponibilidad : diasUsados),
        nivel, fase: s.fase,
      })
      const yaHay = s.lunes ? await loQueYaHay(supabase, idDeportista, s.lunes).catch(() => null) : null
      out.push({ ...s, plan, yaHay })
    }
    setGeneradas(out); setConfirmando(false); setTrabajando(false)
  }

  /**
   * HORIZONTE RODANTE: las próximas semanas se generan solas.
   *
   * Ni un extremo ni el otro. Generar toda la temporada al crear el plan la
   * deja escrita en piedra: seis meses de sesiones que ya no reaccionan a nada
   * de lo que pase. Y obligar al atleta a pulsar un botón cada cuatro semanas
   * termina con él abriendo la app y encontrándose el calendario vacío el lunes
   * por la mañana.
   *
   * En medio: se mantienen llenas las próximas TRES semanas. Suficiente para no
   * ver nunca un hueco, corto para que lo que venga después todavía pueda
   * cambiar.
   *
   * Solo rellena huecos: una semana que ya tiene sesiones no se toca. Y no
   * pisa la pantalla — si el atleta está mirando una previsualización, se
   * espera.
   */
  const [rodando, setRodando] = useState(false)
  const [rodado, setRodado] = useState<number | null>(null)

  useEffect(() => {
    if (cargando || generadas || rodando || rodado != null || !mesos.length) return
    let vivo = true

    const rellenar = async () => {
      const hoy = new Date().toISOString().slice(0, 10)
      // Las semanas del plan entero que caen en las próximas tres.
      const horizonte = sumarDias(hoy, 21)
      const candidatas = mesos.flatMap(m => semanasDelMesociclo({
        tipo: m.tipo, semanas: m.duracion_semanas || 4,
        horasReferencia: horasUsadas, distancia, lunes: m.fecha_inicio, uaPorSemana: uaPorMeso[m.id],
      }).map(x => ({ s: x, meso: m })))
        .filter(({ s: x }) => x.lunes && x.lunes >= sumarDias(hoy, -6) && x.lunes <= horizonte)
        .sort((a, b) => (a.s.lunes || '').localeCompare(b.s.lunes || ''))

      if (!candidatas.length) { if (vivo) setRodado(0) ; return }

      setRodando(true)
      const base = { diasSemana: diasUsados, distancia, nivel, disciplinaDebil }
      let puestas = 0
      for (const { s: x } of candidatas) {
        if (!vivo || !x.lunes) break
        const yaHay = await loQueYaHay(supabase, idDeportista, x.lunes).catch(() => 1)
        if (yaHay) continue          // esa semana ya tiene algo: no se toca
        const e: EntradaSemana = entradaDeSemana(x, base)
        const forma = formaDeSemana(e)
        const plan = rellenarSemana({
          forma,
          colocada: colocarSemana(forma, disponibilidad.length ? disponibilidad : diasUsados),
          nivel, fase: x.fase,
        })
        const r = await volcarSemana(supabase, {
          idDeportista, lunes: x.lunes, relleno: plan.relleno,
          aplicarBloques, bloquesDe: clave => bloquesPorClave(clave, nivelDePlantilla(nivel)) || [],
        })
        if (!r.error) puestas += r.creadas
      }
      if (!vivo) return
      setRodando(false)
      setRodado(puestas)
      if (puestas) onCambio?.()
    }

    rellenar()
    return () => { vivo = false }
  }, [cargando, mesos, generadas])

  const [detalle, setDetalle] = useState<string[]>([])

  const guardar = async () => {
    if (!generadas) return
    setTrabajando(true); setConfirmando(false)
    const nivelP = nivelDePlantilla(nivel)
    const out = [...generadas]
    for (let i = 0; i < out.length; i++) {
      const s = out[i]
      if (!s.lunes) continue
      const r = await volcarSemana(supabase, {
        idDeportista, lunes: s.lunes, relleno: s.plan.relleno,
        aplicarBloques, bloquesDe: clave => bloquesPorClave(clave, nivelP) || [],
      })
      out[i] = { ...s, creadas: r.creadas, error: r.error }
      setGeneradas([...out])
      // El porqué de cada sesión que no entró. Sin esto, un fallo de permisos
      // y uno de datos se ven exactamente igual: nada.
      const fallos = (r.parte || []).filter((x: any) => !x.ok && x.error)
      if (fallos.length) {
        setDetalle(d => [...d, ...fallos.slice(0, 3).map((x: any) => x.dia + ': ' + x.error)])
      }
    }
    setTrabajando(false)
    onCambio?.()
  }

  if (cargando) return <p className="text-gray-500 text-sm">Buscando tu plan…</p>
  if (!mesos.length) return null

  // «Hecho» es que se haya creado algo, no que se haya intentado: con
  // `creadas != null` un volcado rechazado entero contaba como terminado.
  const hecho = !!generadas?.length && generadas.every(s => s.creadas != null) && totalCreadasCalc(generadas) > 0
  const totalCreadas = totalCreadasCalc(generadas)
  const yaHayTotal = (generadas || []).reduce((a, s) => a + (s.yaHay || 0), 0)
  const totalSesiones = (generadas || []).reduce((a, s) => a + s.plan.relleno.length, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Por qué le ha cambiado el plan.
          Adaptar en silencio es lo peor que puede hacer esto: el atleta abre la
          app, ve menos horas que la semana pasada y no sabe si es un fallo, un
          castigo o qué. Si algo cambia, se dice, y se dice con el dato que lo
          justifica. */}
      {adap && (adap.aplicado.length > 0 || adap.propuesto.length > 0) && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
            He ajustado tu plan
          </p>
          {adap.aplicado.map((t, i) => (
            <p key={'a' + i} className="text-[12.5px] text-gray-300 leading-relaxed">{t}</p>
          ))}
          {adap.propuesto.map((t, i) => (
            <p key={'p' + i} className="text-[12.5px] text-orange-300 leading-relaxed">{t}</p>
          ))}
          {adap.aplicado.length > 0 && (
            <p className="text-[11.5px] text-gray-600">
              Tus {horasReferencia} h pasan a {horasUsadas} h esta vez. Cuando vuelvas a llevarlo al día, suben solas.
            </p>
          )}
        </div>
      )}

      {detalle.length > 0 && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
          <p className="text-[12.5px] text-red-300 font-semibold">No se han podido crear algunas sesiones</p>
          {detalle.slice(0, 6).map((t, i) => (
            <p key={i} className="text-[11.5px] text-red-200/80 mt-0.5">{t}</p>
          ))}
        </div>
      )}

      {rodando && (
        <p className="text-[12.5px] text-gray-500">Preparando tus próximas semanas…</p>
      )}
      {!rodando && !!rodado && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
          <p className="text-[13px] text-gray-200">He puesto {rodado} sesiones en tus próximas semanas.</p>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Se van generando solas unas tres semanas por delante. Más allá no, para que el plan
            todavía pueda cambiar según te vaya yendo.
          </p>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Generar otro bloque a mano</span>
        <select value={selId ?? ''} onChange={e => { setSelId(Number(e.target.value)); setGeneradas(null) }}
          className="bg-gray-800 text-white text-sm px-3.5 py-2.5 rounded-lg border border-gray-700 outline-none focus:ring-2 focus:ring-orange-500">
          {mesos.map(m => (
            <option key={m.id} value={m.id}>
              {(m.objetivo || 'Bloque') + ' · ' + (m.duracion_semanas || 4) + ' semanas · desde el ' + m.fecha_inicio}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        {semanas.map((s, i) => {
          const g = generadas?.[i]
          return (
            <div key={s.n} className={'flex items-center gap-3 rounded-xl border px-4 py-2.5 ' +
              (s.esDescarga ? 'bg-green-500/[0.06] border-green-700/40' : 'bg-gray-900 border-gray-800')}>
              <span className="text-[11px] font-bold text-gray-600 w-5 tabular-nums">{s.n}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] text-gray-200">
                  Semana del {s.lunes} · <b className="text-gray-100">{s.horasSemana} h</b>
                </p>
                <p className={'text-[11.5px] ' + (s.esDescarga ? 'text-green-400' : 'text-gray-500')}>
                  {s.esDescarga ? 'Semana suave: aquí es donde se asimila lo anterior' : s.etiqueta}
                </p>
                {/* El test va en semana suave a propósito: testar cansado mide el
                    cansancio, no la forma, y encima recorta las zonas. */}
                {(() => {
                  const t = testDeLaSemana(s.lunes)
                  if (!t) return null
                  return (
                    <p className="text-[11.5px] text-blue-300 mt-0.5">
                      📏 Toca medirse: {t.tests.map(x => x.protocolo).join(' · ')}
                      <span className="block text-[11px] text-gray-500">{t.motivo}</span>
                    </p>
                  )
                })()}
              </div>
              <span className="text-[12px] tabular-nums flex-shrink-0 text-right max-w-[45%]">
                {/* Un fallo NO puede salir como «✓ 0». Antes, si el volcado se
                    rechazaba, la fila decía «✓ 0» y el error se quedaba en una
                    variable que nadie pintaba: el atleta veía un tick verde y
                    ninguna sesión en su calendario. */}
                {g?.error
                  ? <span className="text-red-400">{g.error}</span>
                  : g?.creadas
                    ? <span className="text-green-400">✓ {g.creadas}</span>
                    : g?.creadas === 0
                      ? <span className="text-amber-300">no se creó ninguna</span>
                      : g
                        ? <span className="text-gray-500">{g.plan.relleno.length} sesiones</span>
                        : null}
              </span>
            </div>
          )
        })}
      </div>

      {generadas && !hecho && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
          <p className="text-[13px] text-gray-200">Te salen {totalSesiones} sesiones en {generadas.length} semanas.</p>
          {yaHayTotal > 0 && (
            <p className="text-[12.5px] text-amber-200/90 mt-1">
              Ya tienes {yaHayTotal} sesiones en esas semanas. Estas se añaden a las que hay, no las sustituyen.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* El botón dice lo que hace. «Ver qué me tocaría» sonaba a que no iba a
            pasar nada, y lo que hace es montar las semanas enteras. */}
        <button onClick={generar} disabled={trabajando || !meso}
          className={'px-5 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-40 ' +
            (generadas
              ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white'
              : 'bg-orange-500 hover:bg-orange-600 text-white')}>
          {trabajando && !generadas ? 'Generando…' : generadas ? 'Generar otras' : 'Generar mis sesiones'}
        </button>

        {/* La previsualización YA es la confirmación: has visto las horas de cada
            semana y cuántas sesiones salen. Pedir un «¿seguro?» encima es
            fricción sin nada que aporte... salvo que haya algo que perder, y
            entonces sí: volcar sobre semanas que ya tienen sesiones las duplica. */}
        {generadas && !hecho && (yaHayTotal > 0 && !confirmando ? (
          <button onClick={() => setConfirmando(true)} disabled={trabajando}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
            Guardar en mi calendario →
          </button>
        ) : (
          <>
            <button onClick={guardar} disabled={trabajando}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
              {trabajando ? 'Guardando…' : yaHayTotal > 0 ? 'Sí, añádelas igualmente' : 'Guardar en mi calendario'}
            </button>
            {confirmando && (
              <button onClick={() => setConfirmando(false)} className="text-gray-400 hover:text-white text-sm px-2 transition">Ahora no</button>
            )}
          </>
        ))}

        {hecho && <p className="text-green-400 text-sm">✓ {totalCreadas} sesiones en tu calendario.</p>}
      </div>
    </div>
  )
}
