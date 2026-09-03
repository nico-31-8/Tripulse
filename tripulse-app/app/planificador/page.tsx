'use client'
// ============================================================
// El planificador — la pantalla
// ============================================================
// Hasta ahora todo el planificador era motor sin volante: cuatro módulos que
// generan una semana y nadie que los llamara. Esto es la puerta.
//
// DOS PUERTAS DE REVISIÓN, NO UNA. Primero se aprueba la FORMA de la semana
// —cuántas horas, cómo se reparten, cuántas de calidad—, que se lee en quince
// segundos. Solo después se ven las sesiones. Volcar una semana entera de golpe
// para que la revises de arriba abajo acaba en sello de goma o en reescribirla, y
// ninguna de las dos aporta.
//
// Y NO ESCRIBE NADA. Genera, enseña y explica. Crear las sesiones es el paso
// siguiente y va aparte: mientras eso no exista, esta pantalla no puede
// estropear el calendario de nadie.
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { proximoLunes, hoyISO } from '@/lib/fechas'
import { contextoDeSemanas, avisoDe, porDefecto, type SemanaCandidata } from '@/lib/semanas-a-planificar'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'
import { useDeclararModulo } from '@/lib/contexto-modulo'
import { cargaZona } from '@/lib/zonas'
import { construirContextoTexto } from '@/lib/asistente'
import { IA_PLANIFICADOR } from '@/lib/flags'
import { formaDeSemana, ETIQUETA_BLOQUE, type EntradaSemana, type FormaSemana, type NivelAtleta } from '@/lib/plan-semana'
import { colocarSemana, type DiaDisponible, type DiaSemana } from '@/lib/plan-colocacion'
import { rellenarSemana, nivelDePlantilla, type SemanaRellena } from '@/lib/plan-relleno'
import { volcarSemana, loQueYaHay, fechaDeDia, domingoDe, type ResultadoVolcado } from '@/lib/plan-volcado'
import CadenaMesociclo from '@/components/CadenaMesociclo'
import PlanificarMesociclo from '@/components/PlanificarMesociclo'
import { aplicarBloques, bloquesPorClave } from '@/lib/plantillas'
import { ETIQUETA_DISTANCIA, DISTRIBUCION_POR_FASE, type DistanciaTri, type FaseMacro } from '@/lib/distribucion-zonas'
import { horasDeAnamnesis, diasDeAnamnesis, nivelDeAnamnesis } from '@/lib/anamnesis-datos'

const DISTANCIAS: DistanciaTri[] = ['sprint', 'olimpico', 'medio', 'largo']
const FASES: FaseMacro[] = ['transicion', 'pg-inicial', 'pg-avanzada', 'pe-inicial', 'pe-avanzada', 'tapering']
const NIVELES: NivelAtleta[] = ['principiante', 'intermedio', 'avanzado', 'elite']

/** La distancia que declara la anamnesis (texto libre), si se reconoce. */
function distanciaDeAnamnesis(txt: string | null | undefined): DistanciaTri | null {
  const t = String(txt ?? '').toLowerCase()
  if (t.includes('sprint') || t.includes('super')) return 'sprint'
  if (t.includes('olím') || t.includes('olim') || t.includes('están') || t.includes('estan')) return 'olimpico'
  if (t.includes('media') || t.includes('70.3') || t.includes('half')) return 'medio'
  if (t.includes('larga') || t.includes('iron') || t.includes('140.6')) return 'largo'
  return null
}

const fmtHoras = (min: number) => (Math.round(min / 6) / 10).toString().replace('.', ',') + ' h'

export default function Planificador() {
  const router = useRouter()
  useRequireEntrenador()

  const [deportistas, setDeportistas] = useState<any[]>([])
  const [dep, setDep] = useState<any>(null)
  const [anamnesis, setAnamnesis] = useState<any>(null)
  const [disponibilidad, setDisponibilidad] = useState<DiaDisponible[]>([])
  const [cargando, setCargando] = useState(true)

  // Los mandos. Se rellenan solos con lo que sabe la app y se pueden tocar: la
  // anamnesis es de cuando se dio de alta y el entrenador sabe más que ella.
  const [distancia, setDistancia] = useState<DistanciaTri>('medio')
  const [fase, setFase] = useState<FaseMacro>('pe-inicial')
  const [nivel, setNivel] = useState<NivelAtleta>('intermedio')
  const [horas, setHoras] = useState(10)
  const [dias, setDias] = useState(6)

  // Qué se planifica: una semana suelta o el bloque entero.
  const [alcance, setAlcance] = useState<'semana' | 'meso'>('semana')
  // Una semana suelta o el mesociclo entero. Son la misma maquinaria: el bloque
  // calcula las horas de cada semana y llama al mismo generador, una vez por semana.
  const [modo, setModo] = useState<'semana' | 'mesociclo'>('semana')
  const [paso, setPaso] = useState<1 | 2>(1)
  const [semana, setSemana] = useState<SemanaRellena | null>(null)
  // De dónde salió la semana que hay en pantalla. Cambia lo que se ofrece
  // después: no tiene sentido pedirle al asistente que revise una semana que
  // acaba de montar él.
  const [origen, setOrigen] = useState<'reglas' | 'ia'>('reglas')
  const [generando, setGenerando] = useState(false)
  const [infoIA, setInfoIA] = useState<{ intentos: number; razonamiento: string; motivo?: string } | null>(null)

  const [revisando, setRevisando] = useState(false)
  const [revision, setRevision] = useState<{ aplicados: any[]; rechazados: any[]; nota: string; motivo?: string } | null>(null)

  // El volcado. Por defecto el lunes que viene: nadie planifica la semana que ya
  // está empezada.
  const [lunes, setLunes] = useState(proximoLunes())
  // Las semanas que se ofrecen, con lo que se sabe de cada una.
  const [candidatas, setCandidatas] = useState<SemanaCandidata[]>([])
  const [yaHay, setYaHay] = useState<number | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [volcando, setVolcando] = useState(false)
  const [volcado, setVolcado] = useState<ResultadoVolcado | null>(null)

  useEffect(() => { (async () => {
    const { data } = await supabase.from('deportista').select('id, nombre, fc_maxima').order('nombre')
    setDeportistas(data || [])
    const activo = (data || []).find(d => d.id === getAtletaActivo())
    if (activo) await elegir(activo, data || [])
    setCargando(false)
  })() }, [])

  async function elegir(d: any, _todos = deportistas) {
    setDep(d); setAtletaActivo(d.id); setPaso(1); setSemana(null); setRevision(null)
    const [{ data: an }, { data: disp }] = await Promise.all([
      supabase.from('anamnesis').select('*').eq('id_deportista', d.id).maybeSingle(),
      supabase.from('disponibilidad').select('dia_semana, hora_inicio, hora_fin').eq('id_deportista', d.id),
    ])
    setAnamnesis(an)
    const h = horasDeAnamnesis(an?.volumen_semanal); if (h !== null) setHoras(h)
    const d2 = diasDeAnamnesis(an?.dias_semana); if (d2 !== null) setDias(d2)
    setNivel(nivelDeAnamnesis(an?.nivel_competitivo))
    const dist = distanciaDeAnamnesis(an?.prueba_distancia)
    if (dist) setDistancia(dist)

    // Minutos reales de cada día a partir de sus franjas horarias.
    const porDia = new Map<string, number>()
    ;(disp || []).forEach((f: any) => {
      const min = (h: string) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0) }
      porDia.set(f.dia_semana, (porDia.get(f.dia_semana) || 0) + Math.max(0, min(f.hora_fin) - min(f.hora_inicio)))
    })
    setDisponibilidad([...porDia].map(([d2, minutos]) => ({ dia: d2 as DiaSemana, minutos })))
  }

  /* Las semanas que se pueden elegir, con su contexto. Se recargan al cambiar
     de atleta —el bloque y las competiciones son suyos— y después de volcar,
     porque entonces esa semana ya tiene sesiones y hay que decirlo.

     La marcada por defecto solo se mueve MIENTRAS EL ENTRENADOR NO HAYA
     ELEGIDO. Si recalculase siempre, elegir una semana y que la pantalla te la
     cambiara de debajo sería peor que no ofrecer nada. */
  const [tocada, setTocada] = useState(false)
  useEffect(() => {
    if (!dep) { setCandidatas([]); return }
    let vivo = true
    contextoDeSemanas(supabase, dep.id, hoyISO())
      .then(cs => {
        if (!vivo) return
        setCandidatas(cs)
        if (!tocada) setLunes(porDefecto(cs))
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [dep, volcado])

  const entrada = (): EntradaSemana => ({
    horasSemana: horas, diasSemana: dias, distancia, fase, nivel,
    disciplinaDebil: anamnesis?.disciplina_debil || null,
  })

  const forma: FormaSemana | null = dep ? formaDeSemana(entrada()) : null

  // Si el atleta tiene la disponibilidad rellena se usa; si no, el reparto por
  // defecto según el número de días.
  const diasParaColocar = () => disponibilidad.length ? disponibilidad : dias

  function generar() {
    if (!forma) return
    const s = rellenarSemana({ forma, colocada: colocarSemana(forma, diasParaColocar()), nivel, fase })
    setSemana(s); setRevision(null); setInfoIA(null); setOrigen('reglas'); setVolcado(null); setPaso(2)
  }

  /**
   * Que la monte el asistente entero.
   *
   * Genera libre del catálogo, se comprueba contra las mismas reglas que usa el
   * motor, y si no pasa se le devuelven los incumplimientos hasta tres veces. Si
   * aun así no cuadra, se cae a la semana de las reglas — que es válida por
   * construcción. El peor caso es tardar medio minuto y acabar donde estabas.
   */
  async function generarConIA() {
    if (!forma || !dep) return
    setGenerando(true); setRevision(null); setInfoIA(null); setVolcado(null)
    const deLasReglas = rellenarSemana({ forma, colocada: colocarSemana(forma, diasParaColocar()), nivel, fase })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const contexto = await construirContextoTexto(supabase, dep)
      const r = await fetch('/api/plan/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ entrada: entrada(), forma, dias: diasParaColocar(), contexto }),
      })
      const j = await r.json()
      if (j?.generada && Array.isArray(j.relleno) && j.relleno.length) {
        setSemana({ relleno: j.relleno, sinLlenar: [], avisos: j.avisos || [] })
        setOrigen('ia')
        setInfoIA({ intentos: j.intentos, razonamiento: j.razonamiento || '' })
      } else {
        setSemana(deLasReglas); setOrigen('reglas')
        setInfoIA({ intentos: j?.intentos ?? 0, razonamiento: '', motivo: j?.motivo || j?.error || 'No se pudo generar.' })
      }
    } catch (e: any) {
      setSemana(deLasReglas); setOrigen('reglas')
      setInfoIA({ intentos: 0, razonamiento: '', motivo: 'No se pudo contactar con el asistente: ' + (e?.message || '') })
    } finally { setGenerando(false); setPaso(2) }
  }

  async function pedirRevision() {
    if (!semana || !dep) return
    setRevisando(true); setRevision(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const contexto = await construirContextoTexto(supabase, dep)
      const r = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ semana, contexto }),
      })
      const j = await r.json()
      if (!r.ok) { setRevision({ aplicados: [], rechazados: [], nota: '', motivo: j?.error || 'No se pudo revisar.' }); return }
      if (j.semana) setSemana(j.semana)
      setRevision({ aplicados: j.aplicados || [], rechazados: j.rechazados || [], nota: j.nota || '', motivo: j.revisada ? undefined : j.motivo })
    } catch (e: any) {
      setRevision({ aplicados: [], rechazados: [], nota: '', motivo: 'No se pudo contactar con el asistente: ' + (e?.message || '') })
    } finally { setRevisando(false) }
  }

  // Qué hay ya esa semana. Se mira al entrar al paso 2 y cada vez que cambia la
  // fecha: volcar sobre una semana que ya tiene sesiones la duplica, y eso hay
  // que saberlo ANTES de pulsar, no después.
  useEffect(() => {
    if (paso !== 2 || !dep) { setYaHay(null); return }
    let vivo = true
    setYaHay(null)
    loQueYaHay(supabase, dep.id, lunes).then(n => { if (vivo) setYaHay(n) }).catch(() => { if (vivo) setYaHay(null) })
    return () => { vivo = false }
  }, [paso, dep, lunes])

  async function volcar() {
    if (!semana || !dep) return
    setVolcando(true); setConfirmando(false)
    const nivelP = nivelDePlantilla(nivel)
    const r = await volcarSemana(supabase, {
      idDeportista: dep.id,
      lunes,
      relleno: semana.relleno,
      aplicarBloques,
      bloquesDe: clave => bloquesPorClave(clave, nivelP) || [],
    })
    setVolcado(r); setVolcando(false)
  }

  useDeclararModulo('Planificador', dep && forma
    ? `Generando una semana para ${dep.nombre}: ${ETIQUETA_DISTANCIA[distancia]}, fase ${DISTRIBUCION_POR_FASE[fase].etiqueta}, ${horas} h en ${dias} días. ${forma.resumen}`
    : '')

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando…</div>

  const porDia = new Map<string, typeof semana extends null ? never : any[]>()
  semana?.relleno.forEach(r => {
    if (!porDia.has(r.dia)) porDia.set(r.dia, [])
    porDia.get(r.dia)!.push(r)
  })

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-44 pr-5 h-[54px] flex justify-between items-center border-b border-gray-800 gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight leading-none">Planificador</h2>
          {dep && (<>
            <span className="text-[12.5px] text-gray-500 truncate min-w-0">{dep.nombre}</span>
            <button onClick={() => { setDep(null); setSemana(null); setPaso(1) }}
              className="text-[12.5px] text-orange-400 hover:text-orange-300 transition flex-none">cambiar</button>
          </>)}
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition flex-none">← Dashboard</button>
      </nav>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <p className="text-gray-400 text-sm mb-6 max-w-2xl">
          Monta una semana a partir de la prueba objetivo y la fase del plan. Primero decides la forma
          —cuánto a cada deporte y cuántas sesiones de calidad—, y después ves qué sesión cae cada día
          y por qué. No se guarda nada: esto propone.
        </p>

        {!dep && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => elegir(d)} className="tp-card tp-tile p-5" style={{ ['--c' as any]: '#f97316' }}>
                <h3 className="font-bold text-[15px] tracking-tight">{d.nombre}</h3>
                <p className="text-[12px] text-gray-500 mt-1">FC máx {d.fc_maxima || '—'}</p>
              </button>
            ))}
            {!deportistas.length && <p className="text-gray-500 text-sm">Todavía no tienes deportistas. Añade el primero desde el panel.</p>}
          </div>
        )}

        {dep && forma && (<>
          {/* ---- Qué se planifica: una semana o el bloque entero ---- */}
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-4 w-fit">
            {([['semana', 'Una semana'], ['meso', 'Un mesociclo']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAlcance(k)}
                className={'px-4 py-2 text-[13.5px] font-medium rounded-lg transition ' +
                  (alcance === k ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>{l}</button>
            ))}
          </div>

          {/* El bloque entero: la progresión y la descarga las pone la periodización
              que el entrenador ya dibujó, no un desplegable de fase. */}
          {alcance === 'meso' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
              <PlanificarMesociclo
                dep={dep}
                base={{ diasSemana: dias, distancia, nivel, disciplinaDebil: anamnesis?.disciplina_debil || null }}
                horasReferencia={horas}
                disponibilidad={disponibilidad}
                onCerrar={() => setAlcance('semana')} />
            </div>
          )}

          {/* ---- Los mandos ---- */}
          {alcance === 'semana' && (<>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <Campo label="Prueba objetivo">
                <select value={distancia} onChange={e => { setDistancia(e.target.value as DistanciaTri); setPaso(1) }} className={selectCls}>
                  {DISTANCIAS.map(d => <option key={d} value={d}>{ETIQUETA_DISTANCIA[d]}</option>)}
                </select>
              </Campo>
              <Campo label="Fase del plan">
                <select value={fase} onChange={e => { setFase(e.target.value as FaseMacro); setPaso(1) }} className={selectCls}>
                  {FASES.map(f => <option key={f} value={f}>{DISTRIBUCION_POR_FASE[f].etiqueta}</option>)}
                </select>
              </Campo>
              <Campo label="Nivel">
                <select value={nivel} onChange={e => { setNivel(e.target.value as NivelAtleta); setPaso(1) }} className={selectCls}>
                  {NIVELES.map(n => <option key={n} value={n}>{n[0].toUpperCase() + n.slice(1)}</option>)}
                </select>
              </Campo>
              <Campo label="Horas/semana">
                <input type="number" min={1} max={30} step={0.5} value={horas}
                  onChange={e => { setHoras(Number(e.target.value)); setPaso(1) }} className={selectCls + ' w-24'} />
              </Campo>
              <Campo label="Días">
                <input type="number" min={1} max={7} value={dias}
                  onChange={e => { setDias(Number(e.target.value)); setPaso(1) }} className={selectCls + ' w-20'} />
              </Campo>
              {disponibilidad.length > 0 && (
                <p className="text-[11.5px] text-gray-500 pb-2">
                  Con su disponibilidad real: {disponibilidad.map(d => d.dia.slice(0, 3)).join(', ')}
                </p>
              )}
            </div>
            {anamnesis?.disciplina_debil && (
              <p className="text-[11.5px] text-gray-500 mt-3">
                Su punto flojo es <span className="text-gray-300">{anamnesis.disciplina_debil}</span>, así que el reparto se inclina hacia ahí sin salirse del rango.
              </p>
            )}
          </div>

          {/* ---- Qué se planifica: una semana o el bloque entero ---- */}
          <div className="flex h-9 rounded-lg overflow-hidden border border-gray-800 mb-5 max-w-md">
            {([['semana', 'Una semana'], ['mesociclo', 'Un mesociclo entero']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setModo(k)}
                className={'flex-1 text-[12.5px] font-medium transition ' +
                  (modo === k ? 'bg-orange-500 text-white' : 'bg-gray-900 text-gray-400 hover:text-white')}>{l}</button>
            ))}
          </div>

          {modo === 'mesociclo' ? (
            <Seccion n={1} titulo="El mesociclo, semana a semana" activo>
              <CadenaMesociclo
                dep={dep}
                distancia={distancia}
                nivel={nivel}
                dias={dias}
                disponibilidad={disponibilidad}
                horasReferencia={horas}
                disciplinaDebil={anamnesis?.disciplina_debil || null} />
            </Seccion>
          ) : (
          <>
          {/* ---- Paso 1: la forma ---- */}
          <Seccion n={1} titulo="La forma de la semana" activo={paso === 1}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <div className="flex h-9 rounded-lg overflow-hidden border border-gray-800 mb-3">
                  {forma.bloques.filter(b => b.minutos > 0).map(b => (
                    <div key={b.bloque} title={`${b.etiqueta} · ${b.pct}%`}
                      className="flex items-center justify-center text-[11px] font-bold text-gray-950"
                      style={{ width: `${b.pct}%`, background: COLOR_BLOQUE[b.bloque] }}>
                      {b.pct >= 12 ? `${b.etiqueta} ${b.pct}%` : ''}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {forma.bloques.filter(b => b.sesiones > 0).map(b => (
                    <div key={b.bloque} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-widest text-gray-500 font-bold">{b.etiqueta}</p>
                      <p className="text-[19px] font-bold tabular-nums leading-tight mt-0.5">{b.sesiones} × {b.minutosPorSesion}′</p>
                      <p className="text-[11.5px] text-gray-500">{fmtHoras(b.minutos)} · {b.pct}%</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-2 justify-center">
                <Dato valor={fmtHoras(forma.minutosTotales)} pie="volumen semanal" />
                <Dato valor={String(forma.sesionesTotales)} pie="sesiones" />
                <Dato valor={String(forma.sesionesCalidad)} pie={forma.sesionesCalidad === 1 ? 'de calidad' : 'de calidad'} />
                <p className="text-[11.5px] text-gray-500 mt-1">Distribución {forma.tid.toLowerCase()}</p>
              </div>
            </div>

            <Avisos lista={forma.avisos} />

            {paso === 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={generar} disabled={generando}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                  Ver las sesiones →
                </button>
                {/* La alternativa: que la monte él entero. Se dice lo que cuesta
                    y lo que tarda, porque lo de al lado es instantáneo y gratis. */}
                {IA_PLANIFICADOR && (
                  <>
                    <button onClick={generarConIA} disabled={generando}
                      className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                      {generando ? 'Montándola…' : '🤖 Que la monte el asistente'}
                    </button>
                    <p className="text-[11.5px] text-gray-600">
                      {generando
                        ? 'Genera, se comprueba contra las reglas y se corrige. Hasta medio minuto.'
                        : 'A la derecha, para semanas raras: pocos días, viajes, material que no tiene.'}
                    </p>
                  </>
                )}
              </div>
            )}
          </Seccion>

          {/* ---- Paso 2: la semana ---- */}
          {paso === 2 && semana && (
            <Seccion n={2} titulo={origen === 'ia' ? 'La semana · montada por el asistente' : 'La semana'} activo>
              {infoIA && (
                <div className={'rounded-xl p-4 mb-3 border ' + (infoIA.motivo
                  ? 'bg-yellow-900/15 border-yellow-700/30'
                  : 'bg-gray-900 border-gray-800')}>
                  {infoIA.motivo ? (
                    <p className="text-[12.5px] text-yellow-300/90">
                      {infoIA.motivo} Abajo tienes la semana que montan las reglas.
                    </p>
                  ) : (<>
                    <p className="text-[11px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">
                      Pasó las reglas {infoIA.intentos > 1 ? `al ${infoIA.intentos}º intento` : 'a la primera'}
                    </p>
                    {infoIA.razonamiento && <p className="text-[12.5px] text-gray-300 leading-relaxed">{infoIA.razonamiento}</p>}
                  </>)}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {[...porDia].map(([dia, sesiones]) => (
                  <div key={dia} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <p className="text-[11px] uppercase tracking-widest text-gray-500 font-bold px-3.5 pt-3 pb-2">{dia}</p>
                    <div className="flex flex-col gap-2 px-3.5 pb-3.5">
                      {sesiones.map((r: any, k: number) => (
                        <div key={k} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3"
                          style={{ borderLeftWidth: 3, borderLeftColor: cargaZona(r.zona).color }}>
                          <div className="flex items-baseline gap-2">
                            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded leading-none flex-none"
                              style={{ background: cargaZona(r.zona).color, color: '#0a0b0f' }}>{r.zona}</span>
                            <span className="text-[13px] font-semibold leading-tight">{r.nombre}</span>
                          </div>
                          <p className="text-[11.5px] text-gray-500 mt-1 tabular-nums">
                            {ETIQUETA_BLOQUE[r.hueco.bloque as keyof typeof ETIQUETA_BLOQUE]} · {r.minutos}′
                            {r.hueco.larga && ' · larga'}{r.hueco.calidad && ' · calidad'}{r.hueco.brick && ' · brick'}
                          </p>
                          <p className="text-[11.5px] text-gray-400 mt-1.5 leading-relaxed">{r.motivo}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Avisos lista={semana.avisos} />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/* Pedirle que revise lo que acaba de montar él no aporta nada. */}
                {IA_PLANIFICADOR && origen === 'reglas' && (
                  <button onClick={pedirRevision} disabled={revisando}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                    {revisando ? 'El asistente la está mirando…' : '🤖 Que la revise el asistente'}
                  </button>
                )}
                {origen === 'ia' && (
                  <button onClick={generar}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition">
                    Ver la de las reglas
                  </button>
                )}
                <button onClick={() => setPaso(1)} className="text-gray-400 hover:text-white text-sm transition">← Cambiar la forma</button>
              </div>

              {revision && (
                <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
                  {revision.motivo ? (
                    <p className="text-[12.5px] text-yellow-300/90">{revision.motivo}</p>
                  ) : revision.aplicados.length ? (
                    <>
                      <p className="text-[11px] uppercase tracking-widest text-gray-500 font-bold mb-2">
                        El asistente cambió {revision.aplicados.length}
                      </p>
                      <ul className="flex flex-col gap-2">
                        {revision.aplicados.map((a, k) => (
                          <li key={k} className="text-[12.5px]">
                            <span className="text-gray-500 line-through">{a.antes}</span>
                            <span className="text-gray-500"> → </span>
                            <span className="text-white font-medium">{a.despues}</span>
                            <p className="text-gray-400 text-[11.5px] mt-0.5 leading-relaxed">{a.porque}</p>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-gray-400">El asistente no cambiaría nada: la semana está bien como está.</p>
                  )}
                  {revision.nota && <p className="text-[12.5px] text-gray-300 mt-3 leading-relaxed border-t border-gray-800 pt-3">{revision.nota}</p>}
                  {!!revision.rechazados.length && (
                    <p className="text-[11.5px] text-gray-600 mt-2">
                      {revision.rechazados.length} propuesta(s) descartada(s) por no pasar el filtro.
                    </p>
                  )}
                </div>
              )}
            </Seccion>
          )}

          {/* ---- Paso 3: al calendario. El único sitio donde esto escribe ---- */}
          {paso === 2 && semana && (
            <Seccion n={3} titulo="Al calendario" activo>
              {volcado ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className={'text-sm font-semibold ' + (volcado.creadas ? 'text-green-400' : 'text-red-400')}>
                    {volcado.creadas
                      ? `${volcado.creadas} sesiones creadas en la semana del ${lunes}`
                      : (volcado.error || 'No se creó nada')}
                  </p>
                  {volcado.parte.some(p => p.ok && !p.enSuPlan) && (
                    <p className="text-[12px] text-gray-400 mt-1.5">
                      {volcado.parte.filter(p => p.ok && !p.enSuPlan).length} entraron como sesión libre: esos días
                      no tenía semana planificada. Se ven igual en su calendario.
                    </p>
                  )}
                  {volcado.parte.some(p => !p.ok) && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {volcado.parte.filter(p => !p.ok).map((p, k) => (
                        <li key={k} className="text-[12px] text-red-300/80">{p.dia} · {p.nombre}: {p.error}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => router.push('/planificacion-visual/' + dep.id + '/calendario')}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                      Ver su calendario →
                    </button>
                    <button onClick={() => { setVolcado(null); setYaHay(null) }}
                      className="text-gray-400 hover:text-white text-sm transition">Volcar otra semana</button>
                  </div>
                </div>
              ) : (<>
                {/* ELEGIR LA SEMANA MIRÁNDOLA, NO RECORDÁNDOLA.
                    Aquí había una casilla de fecha pelada: había que saber que
                    el valor tiene que ser un LUNES —un miércoles dejaba la
                    semana torcida— y abrir un calendario a buscarla. Y una vez
                    elegida no se sabía nada de ella: si era de carga o de
                    descarga, de qué bloque, si había una competición dentro, si
                    ya tenía sesiones puestas.

                    O sea que la decisión más importante de la pantalla se
                    tomaba a ciegas. Ahora las semanas se ofrecen con lo que se
                    sabe de cada una, y las fechas se construyen: no se puede
                    elegir un miércoles. */}
                <p className="text-[12px] font-semibold tracking-wider uppercase text-gray-500 mb-2">
                  Para qué semana
                </p>
                <div className="grid gap-2 sm:grid-cols-2 mb-4">
                  {candidatas.map(s => {
                    const elegida = s.lunes === lunes
                    const aviso = avisoDe(s)
                    const compite = s.competiciones.length > 0
                    return (
                      <button key={s.lunes}
                        onClick={() => { setLunes(s.lunes); setTocada(true); setConfirmando(false) }}
                        className={'text-left rounded-xl border p-3 transition ' + (elegida
                          ? 'border-orange-500/60 bg-orange-500/10'
                          : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]')}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={'text-[13.5px] font-semibold ' + (elegida ? 'text-orange-400' : 'text-gray-200')}>
                            {s.cuando}
                          </span>
                          <span className="text-[11px] text-gray-500">{s.rango}</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          {s.tipo && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.07] text-gray-400">
                              {s.tipo}
                            </span>
                          )}
                          {s.ua != null && <span className="text-[11px] text-gray-500 tabular-nums">{s.ua} UA</span>}
                          {s.bloque && <span className="text-[11px] text-gray-600 truncate">{s.bloque}</span>}
                        </div>

                        {aviso && (
                          <p className={'text-[11px] mt-1.5 leading-snug ' +
                            (compite ? 'text-orange-300/90' : s.sesiones > 0 ? 'text-yellow-300/80' : 'text-gray-500')}>
                            {aviso}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>

                <p className="text-[12px] text-gray-500 mb-3">
                  Del {lunes} al {domingoDe(lunes)}
                  {semana.relleno.length ? ` · ${semana.relleno.length} sesiones` : ''}
                </p>

                {/* Volcar sobre una semana que ya tiene sesiones la duplica, y eso
                    hay que saberlo antes de pulsar, no después. */}
                {yaHay != null && yaHay > 0 && (
                  <p className="text-[12px] text-yellow-300/85 bg-yellow-900/15 border border-yellow-700/25 rounded-lg px-3 py-2 mb-3">
                    Esa semana ya tiene {yaHay} sesión(es) en su calendario. Si vuelcas ahora, se suman: no se
                    reemplaza nada. Revisa antes si es lo que quieres.
                  </p>
                )}

                {!confirmando ? (
                  <button onClick={() => setConfirmando(true)} disabled={volcando}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                    Volcar al calendario →
                  </button>
                ) : (
                  <div className="bg-gray-900 border border-orange-500/40 rounded-xl p-4">
                    <p className="text-sm font-semibold mb-1">
                      Se van a crear {semana.relleno.length} sesiones en el calendario de {dep.nombre}
                    </p>
                    <p className="text-[12px] text-gray-400 mb-3">
                      Del {lunes} al {domingoDe(lunes)}. Quedan como planificadas y se pueden editar o borrar después,
                      una a una, desde su calendario.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={volcar} disabled={volcando}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                        {volcando ? 'Creando…' : 'Sí, crearlas'}
                      </button>
                      <button onClick={() => setConfirmando(false)} className="text-gray-400 hover:text-white text-sm transition">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>)}
            </Seccion>
          )}
          </>)}
        </>)}
          </>
          )}
      </div>
    </main>
  )
}

// ------------------------------------------------------------
// Piezas
// ------------------------------------------------------------
const selectCls = 'bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-orange-500 border border-gray-700'

const COLOR_BLOQUE: Record<string, string> = {
  Natacion: '#3b82f6', Ciclismo: '#eab308', Carrera: '#22c55e', Fuerza: '#a855f7',
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-widest text-gray-500 font-bold">{label}</span>
      {children}
    </label>
  )
}

function Dato({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[22px] font-bold tabular-nums leading-none">{valor}</span>
      <span className="text-[11.5px] text-gray-500">{pie}</span>
    </div>
  )
}

/** Los dos pasos, numerados porque el orden importa de verdad: no se puede ver
    la semana sin haber fijado antes su forma. */
function Seccion({ n, titulo, activo, children }: { n: number; titulo: string; activo: boolean; children: React.ReactNode }) {
  return (
    <section className={'mb-5 ' + (activo ? '' : 'opacity-60')}>
      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="text-[11px] font-bold w-5 h-5 rounded flex items-center justify-center flex-none bg-orange-500/20 text-orange-400 tabular-nums">{n}</span>
        <h3 className="text-[15px] font-bold tracking-tight">{titulo}</h3>
      </div>
      {children}
    </section>
  )
}

function Avisos({ lista }: { lista: string[] }) {
  if (!lista.length) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {lista.map((a, k) => (
        <li key={k} className="text-[12px] text-yellow-300/80 bg-yellow-900/15 border border-yellow-700/25 rounded-lg px-3 py-2 leading-relaxed">{a}</li>
      ))}
    </ul>
  )
}
