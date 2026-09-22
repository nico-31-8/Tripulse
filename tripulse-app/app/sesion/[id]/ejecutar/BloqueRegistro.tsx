'use client'
// ============================================================
// El atleta haciendo un bloque: su reloj y su resultado
// ============================================================
// Un reloj para cada formato —cuenta atrás en AMRAP, el minuto en EMOM, el
// cronómetro con límite en for time, trabajo/pausa en Tabata, el descanso
// entre rondas— y, sobre todo, dónde apuntar el RESULTADO, que es lo que se
// guarda y lo que se compara con la última vez.
//
// EL RELOJ ES UNA AYUDA, NO LA FUENTE. Muchos harán el WOD con el reloj del
// box y solo apuntarán el resultado: las casillas se pueden rellenar sin haber
// tocado el reloj. Avisa como los tests escalonados (lib/pitido): pita, vibra
// y destella en cada cambio.
import { useEffect, useRef, useState } from 'react'
import InterruptoresAviso from '@/components/InterruptoresAviso'
import { avisarEscalon, despertarAudio } from '@/lib/pitido'
import { CRONO_PARADO, arrancar, pausar, transcurrido, corriendo, type EstadoCrono } from '@/lib/dirigir-cronometro'
import {
  leerConfig, ordenarLineas, textoFormato, textoLinea, textoResultado, comparar, QUE_SE_APUNTA,
  type Formato, type LineaBloque, type ResultadoBloque,
} from '@/lib/bloque-formato'
import type { UltimaVezBloque } from '@/lib/bloque-ultima-vez'

/* Fuera del componente: la regla del compilador no deja llamar a Date.now()
   desde el cuerpo del componente, y aquí se llama desde los botones. */
const reloj = () => Date.now()
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const aSegundos = (t: string): number | null => {
  const txt = String(t || '').trim()
  if (!txt) return null
  const p = txt.split(':')
  return p.length === 2 ? (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0) : (parseInt(txt) || 0)
}
const numOnull = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v) || 0)))

const casilla = 'bg-gray-800 text-white text-center font-bold tabular-nums rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-pink-400 w-24'

export default function BloqueRegistro({ tarea, resultado, onResultado, ultima }: {
  tarea: { id: number; formato?: string | null; formato_config?: unknown; comentario?: string | null; ejercicios?: LineaBloque[] | null }
  resultado: ResultadoBloque | null
  onResultado: (r: ResultadoBloque) => void
  ultima?: UltimaVezBloque | null
}) {
  const formato = tarea.formato as Formato
  const cfg = leerConfig(tarea.formato_config)
  const lineas = ordenarLineas(tarea.ejercicios)
  const r: ResultadoBloque = resultado || {}

  const [crono, setCrono] = useState<EstadoCrono>(CRONO_PARADO)
  const [ahora, setAhora] = useState(() => Date.now())
  const [paso, setPaso] = useState(0)                    // for time: por qué ronda del esquema va
  const [ronda, setRonda] = useState(1)                  // rondas: la que está haciendo
  const [descansoHasta, setDescansoHasta] = useState<number | null>(null)
  const [tiempoTexto, setTiempoTexto] = useState(r.segundos != null ? mmss(r.segundos * 1000) : '')
  const marca = useRef<string | null>(null)

  const va = corriendo(crono)
  const ms = transcurrido(crono, ahora)

  /* Solo repinta mientras corre, como los relojes de los tests. */
  useEffect(() => {
    if (!va && descansoHasta == null) return
    const id = setInterval(() => setAhora(reloj()), 200)
    return () => clearInterval(id)
  }, [va, descansoHasta])

  // ---------- lo que se ve según el formato ----------
  const total = formato === 'amrap' || formato === 'emom' ? cfg.minutos * 60000
    : formato === 'tabata' ? cfg.vueltas * (cfg.trabajo + cfg.pausa) * 1000 * Math.max(1, lineas.length)
    : formato === 'fortime' ? cfg.limite * 60000 : 0
  const esquema = cfg.esquema.length ? cfg.esquema : Array.from({ length: cfg.rondas }, () => 0)
  const cada = cfg.cada * 1000
  const minuto = Math.floor(ms / cada)
  const ciclo = (cfg.trabajo + cfg.pausa) * 1000
  const vuelta = Math.floor(ms / Math.max(1, ciclo))
  const trabajando = ms % Math.max(1, ciclo) < cfg.trabajo * 1000
  const lineaTabata = Math.floor(vuelta / cfg.vueltas)
  const enDescanso = descansoHasta != null && ahora < descansoHasta
  const alLimite = (formato === 'amrap' || formato === 'emom' || formato === 'tabata' || formato === 'fortime') && total > 0 && ms >= total
  const fortimeAcabado = formato === 'fortime' && paso >= esquema.length
  const rondasAcabadas = formato === 'rondas' && ronda > cfg.rondas

  /* Los avisos: un cambio de «marca» es un cambio que hay que avisar. Va en
     un efecto sin lista a propósito, como en InstrumentosTest: corre en cada
     repintado y es la comparación con la marca anterior quien decide. */
  const marcaAhora = !va ? null
    : alLimite ? 'fin'
    : formato === 'emom' ? 'min' + minuto
    : formato === 'tabata' ? 'fase' + vuelta + (trabajando ? 't' : 'p')
    : formato === 'rondas' ? (descansoHasta != null && !enDescanso ? 'vamos' + ronda : 'r' + ronda)
    : 'va'
  useEffect(() => {
    if (marcaAhora && marca.current && marcaAhora !== marca.current) avisarEscalon()
    marca.current = marcaAhora
  })

  // ---------- botones ----------
  const empezar = () => {
    despertarAudio()
    setCrono(c => arrancar(c, reloj()))
    setAhora(reloj())
    if (formato === 'emom' && r.minutos == null) onResultado({ ...r, minutos: cfg.minutos })
  }
  const parar = () => { setCrono(c => pausar(c, reloj())); setAhora(reloj()) }
  const reiniciar = () => { setCrono(CRONO_PARADO); setPaso(0); setRonda(1); setDescansoHasta(null); marca.current = null }
  const terminarCon = (segundos: number) => {
    setCrono(c => pausar(c, reloj()))
    setTiempoTexto(mmss(segundos * 1000))
    onResultado({ ...r, segundos, limite: false })
  }
  const pasoHecho = () => {
    if (paso >= esquema.length - 1) { setPaso(esquema.length); terminarCon(Math.round(transcurrido(crono, reloj()) / 1000)) }
    else setPaso(p => p + 1)
  }
  const rondaHecha = () => {
    if (ronda >= cfg.rondas) { setRonda(cfg.rondas + 1); terminarCon(Math.round(transcurrido(crono, reloj()) / 1000)) }
    else { setRonda(x => x + 1); setDescansoHasta(cfg.descanso > 0 ? reloj() + cfg.descanso * 1000 : null) }
  }

  // ---------- el reloj grande ----------
  let grande = mmss(ms)
  let debajo = ''
  if (formato === 'amrap') { grande = mmss(total - ms); debajo = alLimite ? '¡Tiempo!' : 'queda' }
  if (formato === 'emom') {
    grande = alLimite ? '0:00' : mmss(cada - (ms % cada))
    debajo = alLimite ? '¡Terminado!' : 'Minuto ' + Math.min(minuto + 1, cfg.minutos) + ' de ' + cfg.minutos
  }
  if (formato === 'fortime') debajo = alLimite ? '¡Límite!' : 'límite ' + cfg.limite + ':00'
  if (formato === 'tabata') {
    grande = alLimite ? '0:00' : mmss(trabajando ? cfg.trabajo * 1000 - (ms % ciclo) : ciclo - (ms % ciclo))
    debajo = alLimite ? '¡Terminado!' : (trabajando ? 'A tope' : 'Pausa') + ' · vuelta ' + (vuelta % cfg.vueltas + 1) + ' de ' + cfg.vueltas
  }
  if (formato === 'rondas') {
    if (enDescanso) { grande = mmss((descansoHasta || 0) - ahora); debajo = 'Descanso · después, ronda ' + ronda }
    else debajo = rondasAcabadas ? '¡Terminado!' : 'Ronda ' + Math.min(ronda, cfg.rondas) + ' de ' + cfg.rondas
  }

  const lineaActiva = (i: number) =>
    (formato === 'emom' && cfg.alternar && va && !alLimite && lineas.length > 1 && i === minuto % lineas.length) ||
    (formato === 'tabata' && va && !alLimite && i === lineaTabata)

  const antes = ultima?.resultado ?? null
  const veredicto = comparar(formato, antes, resultado)

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-extrabold tracking-widest uppercase text-pink-300 m-0">{textoFormato(formato, cfg)}</p>
        <p className="text-xs text-gray-500 m-0 mt-0.5">Al terminar apunta {QUE_SE_APUNTA[formato]}.</p>
      </div>

      <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
        {lineas.map((l, i) => (
          <li key={l.id ?? i}
            className={'flex justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ' +
              (lineaActiva(i) ? 'border-pink-400 bg-pink-500/10' : 'border-gray-800 bg-gray-950/60')}>
            <span className="text-white">{textoLinea(l, formato)}</span>
            {formato === 'emom' && cfg.alternar && lineas.length > 1 && (
              <span className="text-xs text-gray-500 whitespace-nowrap">min {i + 1}{lineas.length === 2 ? (i === 0 ? ', 3, 5…' : ', 4, 6…') : '…'}</span>
            )}
          </li>
        ))}
      </ul>

      {formato === 'fortime' && cfg.esquema.length > 0 && (
        <div className="flex justify-center gap-2">
          {cfg.esquema.map((n, k) => (
            <span key={k} className={'min-w-[44px] text-center px-2 py-1 rounded-lg border font-extrabold tabular-nums ' +
              (k < paso ? 'border-gray-800 text-gray-600 line-through' : k === paso && va ? 'border-pink-400 text-pink-300' : 'border-gray-700 text-gray-300')}>
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="text-center">
        <div className={'font-mono tabular-nums text-6xl font-bold leading-none ' + (enDescanso || (formato === 'tabata' && !trabajando && va) ? 'text-sky-300' : 'text-white')}>{grande}</div>
        <div className="text-sm text-gray-400 mt-1.5 min-h-[20px]">{debajo}</div>
      </div>

      {formato === 'amrap' && (
        <>
          <div className="text-center"><b className="text-4xl tabular-nums">{r.rondas ?? 0}</b> <span className="text-gray-500">rondas</span></div>
          <button type="button" disabled={!va || alLimite}
            onClick={() => onResultado({ ...r, rondas: (r.rondas ?? 0) + 1 })}
            className="w-full py-4 rounded-2xl bg-pink-400 text-gray-950 text-lg font-extrabold disabled:opacity-35">+1 ronda</button>
        </>
      )}
      {formato === 'fortime' && !fortimeAcabado && !alLimite && (
        <button type="button" disabled={!va} onClick={pasoHecho}
          className="w-full py-4 rounded-2xl bg-pink-400 text-gray-950 text-lg font-extrabold disabled:opacity-35">
          {paso < esquema.length - 1 ? (cfg.esquema.length ? 'Ronda de ' + esquema[paso] + ' hecha' : 'Ronda ' + (paso + 1) + ' hecha') : 'Terminé'}
        </button>
      )}
      {formato === 'rondas' && !rondasAcabadas && (
        <button type="button" disabled={!va || enDescanso} onClick={rondaHecha}
          className="w-full py-4 rounded-2xl bg-pink-400 text-gray-950 text-lg font-extrabold disabled:opacity-35">
          Ronda {Math.min(ronda, cfg.rondas)} hecha
        </button>
      )}

      <div className="flex gap-2">
        {va
          ? <button type="button" onClick={parar} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl">⏸ Pausar</button>
          : <button type="button" onClick={empezar} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl">▶ {ms > 0 ? 'Seguir' : 'Empezar'}</button>}
        <button type="button" onClick={reiniciar} title="Reiniciar el reloj (el resultado no se borra)" className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 rounded-xl">↺</button>
      </div>
      <InterruptoresAviso />

      {/* EL RESULTADO: lo que se guarda. Se puede escribir sin haber usado el reloj. */}
      <div className="rounded-xl border border-green-500/25 bg-green-500/[0.06] p-3 flex flex-col gap-2.5">
        <p className="text-sm font-semibold text-green-200 m-0">Tu resultado</p>
        {formato === 'amrap' && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
            <label className="flex items-center gap-2">Rondas <input className={casilla} inputMode="numeric" value={r.rondas ?? ''} onChange={e => onResultado({ ...r, rondas: numOnull(e.target.value) })} /></label>
            <label className="flex items-center gap-2">+ reps sueltas <input className={casilla} inputMode="numeric" value={r.reps ?? ''} onChange={e => onResultado({ ...r, reps: numOnull(e.target.value) })} /></label>
          </div>
        )}
        {(formato === 'fortime' || formato === 'rondas') && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
            {!(formato === 'fortime' && r.limite) && (
              <label className="flex items-center gap-2">Tiempo <input className={casilla} value={tiempoTexto} placeholder="7:42"
                onChange={e => { setTiempoTexto(e.target.value); onResultado({ ...r, segundos: aSegundos(e.target.value), limite: false }) }} /></label>
            )}
            {formato === 'fortime' && (
              <label className="flex items-center gap-2">
                <input type="checkbox" className="w-4 h-4 accent-pink-400" checked={!!r.limite || (alLimite && r.segundos == null)}
                  onChange={e => onResultado({ ...r, limite: e.target.checked, segundos: e.target.checked ? null : r.segundos })} />
                Llegué al límite
              </label>
            )}
            {formato === 'fortime' && (r.limite || (alLimite && r.segundos == null)) && (
              <label className="flex items-center gap-2">reps hechas <input className={casilla} inputMode="numeric" value={r.reps ?? ''} onChange={e => onResultado({ ...r, limite: true, reps: numOnull(e.target.value) })} /></label>
            )}
          </div>
        )}
        {formato === 'emom' && (
          <label className="flex items-center gap-2 text-sm text-gray-300">Minutos completados
            <input className={casilla} inputMode="numeric" value={r.minutos ?? ''} placeholder={String(cfg.minutos)} onChange={e => onResultado({ ...r, minutos: numOnull(e.target.value) })} />
            <span className="text-gray-500">de {cfg.minutos}</span>
          </label>
        )}
        {formato === 'tabata' && (
          <label className="flex items-center gap-2 text-sm text-gray-300">Reps de la peor vuelta
            <input className={casilla} inputMode="numeric" value={r.peor ?? ''} onChange={e => onResultado({ ...r, peor: numOnull(e.target.value) })} />
          </label>
        )}
        {ultima && (
          <p className="text-xs text-gray-400 m-0">
            La última vez ({ultima.dias === 0 ? 'hoy' : ultima.dias === 1 ? 'ayer' : 'hace ' + ultima.dias + ' días'}): <b className="text-white">{textoResultado(formato, ultima.resultado, cfg)}</b>
            {veredicto === 'mejor' && <span className="text-green-300 font-semibold"> · ↗ hoy mejor</span>}
            {veredicto === 'igual' && <span className="text-gray-300"> · igual</span>}
            {veredicto === 'peor' && <span className="text-gray-400"> · hoy por debajo</span>}
          </p>
        )}
      </div>
    </div>
  )
}
