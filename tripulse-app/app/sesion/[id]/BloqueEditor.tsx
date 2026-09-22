'use client'
// ============================================================
// El editor de un bloque (rondas, AMRAP, EMOM, for time, Tabata)
// ============================================================
// Vive dentro de la tabla de tareas de una sesión de Fuerza o Híbrido, como
// un borrador más: se escribe, se guarda con ✓ y pasa a la tabla de arriba.
// Las líneas se eligen de la biblioteca —grupo, ejercicio o la lupa—, y el
// cardio con las modalidades y zonas de siempre. Qué es un bloque y cómo se
// guarda: lib/bloque-formato y lib/bloque-borrador.
import BuscadorEjercicios from '@/components/BuscadorEjercicios'
import SelectorGrupo from '@/components/SelectorGrupo'
import {
  FORMATOS, MEDIDAS, QUE_SE_APUNTA, duracionBloque, type Formato, type LineaBloque, type MedidaLinea,
} from '@/lib/bloque-formato'
import {
  configDeBorrador, lineaVacia, pideCantidad, faltaEnBloque, filasDeBloque,
  type BloqueBorrador, type LineaBorrador, type EjercicioBib,
} from '@/lib/bloque-borrador'
import { MODALIDADES_CARDIO } from '@/lib/cardio-fuerza'
import { ZONAS_RESISTENCIA, ZONAS_FUERZA } from '@/lib/zonas'

const campo = 'bg-gray-800 text-white text-sm rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-orange-500 min-w-0'
const numero = 'bg-transparent border-0 border-b border-gray-600 text-center font-bold tabular-nums outline-none focus:border-orange-500 py-0.5'
const pastilla = 'inline-flex items-center gap-1.5 bg-gray-800/60 border border-gray-700 rounded-xl px-2.5 py-1.5 text-sm text-gray-300'
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')

export default function BloqueEditor({
  bloque, biblioteca, onCambio, onGuardar, onQuitar, guardando, error, modoCompleja, onBibliotecaCambia,
}: {
  bloque: BloqueBorrador
  biblioteca: (EjercicioBib & { grupo_muscular?: string | null })[]
  onCambio: (b: BloqueBorrador) => void
  onGuardar: () => void
  onQuitar: () => void
  guardando: boolean
  error?: string
  /** Sesión en modo «compleja»: cada tarea lleva su cualidad de fuerza. */
  modoCompleja: boolean
  onBibliotecaCambia?: () => void
}) {
  const cfg = configDeBorrador(bloque)
  const conCantidad = pideCantidad(bloque.formato, cfg)
  const falta = faltaEnBloque(bloque)
  const d = duracionBloque(bloque.formato, cfg,
    filasDeBloque(bloque, biblioteca, { disciplina: '', zona: null }).ejercicios as LineaBloque[])

  const cambia = (p: Partial<BloqueBorrador>) => onCambio({ ...bloque, ...p })
  const cambiaCfg = (p: Partial<BloqueBorrador['config']>) => onCambio({ ...bloque, config: { ...bloque.config, ...p } })
  const cambiaLinea = (i: number, p: Partial<LineaBorrador>) =>
    onCambio({ ...bloque, lineas: bloque.lineas.map((l, k) => k === i ? { ...l, ...p } : l) })
  const n = (v: string) => Math.max(0, Math.round(Number(v) || 0))

  const porRonda = (i: number): string => {
    if (bloque.formato === 'emom') {
      if (!cfg.alternar || bloque.lineas.length < 2) return 'cada minuto'
      return bloque.lineas.length === 2 ? (i === 0 ? 'minutos impares' : 'minutos pares') : 'minuto ' + (i + 1) + ', ' + (i + 1 + bloque.lineas.length) + '…'
    }
    if (bloque.formato === 'fortime') return cfg.esquema.length ? 'las del esquema' : 'por ronda'
    if (bloque.formato === 'tabata') return 'lo que pueda'
    return 'por ronda'
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl mb-4 overflow-hidden">
      {/* Cabecera: qué formato y guardar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-800">
        <span className="font-bold text-pink-300">{bloque.idTarea ? 'Editando bloque' : 'Bloque nuevo'}</span>
        <div className="flex flex-wrap gap-1 bg-gray-800 rounded-xl p-1" role="group" aria-label="Formato del bloque">
          {FORMATOS.map(f => (
            <button key={f.id} type="button" onClick={() => cambia({ formato: f.id as Formato })}
              aria-pressed={bloque.formato === f.id}
              className={'px-2.5 py-1 rounded-lg text-[12.5px] font-semibold transition ' +
                (bloque.formato === f.id ? 'bg-pink-400 text-gray-950' : 'text-gray-400 hover:text-white')}>
              {f.nombre}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onGuardar} disabled={guardando || !!falta}
            title={falta || 'Guardar el bloque'}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3.5 py-1.5 rounded-lg transition disabled:opacity-40">
            ✓ {guardando ? 'Guardando…' : 'Guardar bloque'}
          </button>
          <button type="button" onClick={onQuitar} title="Descartar este borrador" className="text-gray-500 hover:text-red-400 px-2 py-1 rounded transition">✕</button>
        </div>
      </div>

      {/* Cómo se encadena */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-800">
        {bloque.formato === 'rondas' && (<>
          <span className={pastilla}><input className={numero + ' w-12'} inputMode="numeric" value={bloque.config.rondas} onChange={e => cambiaCfg({ rondas: n(e.target.value) })} /> rondas</span>
          <span className={pastilla}>descanso entre rondas <input className={numero + ' w-16'} value={bloque.descansoTexto} onChange={e => cambia({ descansoTexto: e.target.value })} placeholder="2:00" /></span>
        </>)}
        {bloque.formato === 'amrap' && (
          <span className={pastilla}>tantas rondas como pueda en <input className={numero + ' w-12'} inputMode="numeric" value={bloque.config.minutos} onChange={e => cambiaCfg({ minutos: n(e.target.value) })} /> min</span>
        )}
        {bloque.formato === 'emom' && (<>
          <span className={pastilla}>cada <input className={numero + ' w-16'} value={bloque.cadaTexto} onChange={e => cambia({ cadaTexto: e.target.value })} placeholder="1:00" /> durante <input className={numero + ' w-12'} inputMode="numeric" value={bloque.config.minutos} onChange={e => cambiaCfg({ minutos: n(e.target.value) })} /> min</span>
          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={bloque.config.alternar} onChange={e => cambiaCfg({ alternar: e.target.checked })} className="w-4 h-4 accent-pink-400" />
            Alternar líneas (min 1 la primera, min 2 la segunda…)
          </label>
        </>)}
        {bloque.formato === 'fortime' && (<>
          <span className={pastilla}>reps por ronda <input className={numero + ' w-24'} value={bloque.esquemaTexto} onChange={e => cambia({ esquemaTexto: e.target.value })} placeholder="21-15-9" /></span>
          {!cfg.esquema.length && <span className={pastilla}><input className={numero + ' w-12'} inputMode="numeric" value={bloque.config.rondas} onChange={e => cambiaCfg({ rondas: n(e.target.value) })} /> rondas</span>}
          <span className={pastilla}>límite <input className={numero + ' w-12'} inputMode="numeric" value={bloque.config.limite} onChange={e => cambiaCfg({ limite: n(e.target.value) })} /> min</span>
        </>)}
        {bloque.formato === 'tabata' && (
          <span className={pastilla}>
            <input className={numero + ' w-10'} inputMode="numeric" value={bloque.config.trabajo} onChange={e => cambiaCfg({ trabajo: n(e.target.value) })} /> s trabajo
            <span className="text-gray-500">/</span>
            <input className={numero + ' w-10'} inputMode="numeric" value={bloque.config.pausa} onChange={e => cambiaCfg({ pausa: n(e.target.value) })} /> s pausa
            <span className="text-gray-500">×</span>
            <input className={numero + ' w-10'} inputMode="numeric" value={bloque.config.vueltas} onChange={e => cambiaCfg({ vueltas: n(e.target.value) })} /> por línea
          </span>
        )}
        {modoCompleja && (
          <select value={bloque.zonaFuerzaTarea} onChange={e => cambia({ zonaFuerzaTarea: e.target.value })} className={campo + ' w-[110px]'} title="Cualidad de fuerza">
            <option value="">Cualidad…</option>
            {ZONAS_FUERZA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla}</option>)}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {d.segundos > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 text-gray-300 tabular-nums">
              {d.como === 'formato' ? '' : '≈ '}<b className="text-white">{mmss(d.segundos)}</b>{d.como === 'estimada' ? ' (estimada)' : d.como === 'limite' ? ' (el límite)' : ''}
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-green-200">El atleta apunta: <b className="text-white">{QUE_SE_APUNTA[bloque.formato]}</b></span>
        </div>
      </div>

      {/* Las líneas */}
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[34px_120px_minmax(360px,1.5fr)_minmax(300px,1.3fr)_110px_34px] gap-2 px-4 py-2 text-[10.5px] uppercase tracking-wide font-semibold text-gray-500 border-b border-gray-800">
            <span>#</span><span>Tipo</span><span>Ejercicio (biblioteca) · o modalidad y zona</span><span>Cuánto @ carga / ritmo</span><span></span><span></span>
          </div>
          {bloque.lineas.map((l, i) => {
            const cardio = l.tipo === 'Cardio'
            const medidas = MEDIDAS.filter(m => !cardio || m.id !== 'reps')
            return (
              <div key={i} className="grid grid-cols-[34px_120px_minmax(360px,1.5fr)_minmax(300px,1.3fr)_110px_34px] gap-2 items-center px-4 py-2 border-b border-gray-800 last:border-b-0">
                <span className="text-gray-500 font-bold tabular-nums">{i + 1}</span>
                <select value={l.tipo} className={campo + (cardio ? ' text-sky-300' : '')}
                  onChange={e => cambiaLinea(i, e.target.value === 'Cardio'
                    ? { tipo: 'Cardio', medida: 'm', ejercicioId: '', grupo: '' }
                    : { tipo: 'Ejercicio', medida: 'reps', cardioModo: '', cardioZona: '', cardioObjetivo: '' })}>
                  <option value="Ejercicio">Ejercicio</option>
                  <option value="Cardio">Cardio</option>
                </select>

                {cardio ? (
                  <div className="flex gap-1.5 min-w-0">
                    <select value={l.cardioModo} onChange={e => cambiaLinea(i, { cardioModo: e.target.value })} className={campo + ' basis-[58%] text-sky-300'} title="Modalidad">
                      <option value="">Modalidad…</option>
                      {MODALIDADES_CARDIO.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                    <select value={l.cardioZona} onChange={e => cambiaLinea(i, { cardioZona: e.target.value })} className={campo + ' basis-[42%]'} title="Zona">
                      <option value="">Zona…</option>
                      {ZONAS_RESISTENCIA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-1.5 min-w-0 items-center">
                    <SelectorGrupo ejercicios={biblioteca} valor={l.grupo} vacio="Grupo…" title="Grupo"
                      onCambio={v => cambiaLinea(i, { grupo: v, ejercicioId: '' })}
                      className={campo + ' basis-[42%]'} />
                    <select value={l.ejercicioId} onChange={e => cambiaLinea(i, { ejercicioId: e.target.value })} className={campo + ' flex-1'} title="Ejercicio" disabled={!l.grupo}>
                      <option value="">{l.grupo ? 'Ejercicio…' : 'Elige grupo'}</option>
                      {biblioteca.filter(e => e.grupo_muscular === l.grupo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                    <BuscadorEjercicios ejercicios={biblioteca} onBibliotecaCambia={onBibliotecaCambia}
                      onElegir={ej => cambiaLinea(i, { grupo: ej.grupo_muscular || '', ejercicioId: String(ej.id) })} />
                  </div>
                )}

                <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700 rounded-xl px-2.5 py-1.5 min-w-0">
                  {conCantidad ? (
                    <input value={l.cantidad} onChange={e => cambiaLinea(i, { cantidad: e.target.value })}
                      inputMode={l.medida === 'seg' ? 'text' : 'decimal'}
                      placeholder={l.medida === 'seg' ? '1:30' : l.medida === 'm' ? '200' : '15'}
                      className="w-[64px] bg-transparent text-center font-bold tabular-nums outline-none" title="Cuánto por ronda" />
                  ) : (
                    <span className="text-xs text-gray-500 px-1 whitespace-nowrap">{bloque.formato === 'fortime' ? cfg.esquema.join(' · ') : 'máx.'}</span>
                  )}
                  <select value={l.medida} onChange={e => cambiaLinea(i, { medida: e.target.value as MedidaLinea })}
                    className="bg-gray-800 border border-gray-700 rounded-md px-1.5 py-0.5 text-xs text-gray-300" title="Repeticiones, segundos, metros o calorías">
                    {medidas.map(m => <option key={m.id} value={m.id}>{m.corto}</option>)}
                  </select>
                  <span className="text-gray-500 flex-none">@</span>
                  {cardio ? (
                    <input value={l.cardioObjetivo} onChange={e => cambiaLinea(i, { cardioObjetivo: e.target.value })}
                      placeholder="ritmo / W" className="flex-1 min-w-0 bg-transparent outline-none" title="Ritmo, potencia o vatios objetivo" />
                  ) : (<>
                    <input value={l.kg} onChange={e => cambiaLinea(i, { kg: e.target.value })} inputMode="decimal"
                      placeholder="kg" className="w-[64px] bg-transparent text-center font-bold tabular-nums outline-none" title="Carga" />
                    <span className="text-gray-500 text-xs flex-none">kg</span>
                  </>)}
                </div>

                <span className="text-[11px] text-gray-500 whitespace-nowrap">{porRonda(i)}</span>
                <button type="button" onClick={() => onCambio({ ...bloque, lineas: bloque.lineas.filter((_, k) => k !== i) })}
                  title="Quitar la línea" className="text-gray-500 hover:text-red-400 px-1.5 py-1 rounded transition">✕</button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-800">
        <button type="button" onClick={() => onCambio({ ...bloque, lineas: [...bloque.lineas, lineaVacia()] })}
          className="bg-gray-800 border border-dashed border-gray-600 hover:border-orange-500 hover:text-orange-300 text-gray-300 text-sm px-3 py-1.5 rounded-lg transition">
          + Línea al bloque
        </button>
        <input value={bloque.comentario} onChange={e => cambia({ comentario: e.target.value })}
          placeholder="Notas del bloque (opcional)" className={campo + ' flex-1 min-w-[200px]'} />
        {(error || falta) && <span className={'text-xs ' + (error ? 'text-red-400' : 'text-gray-500')}>{error || falta}</span>}
      </div>
    </div>
  )
}
