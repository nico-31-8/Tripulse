'use client'
// ============================================================
// Guía de zonas — qué es cada una, a qué ritmo y cuánta
// ============================================================
// Un solo componente para las dos pantallas que lo piden (calendario y
// periodización). El texto vive en `lib/zonas-explicacion.ts`, los ritmos los
// calcula `tablaIntensidades()` con los tests del atleta y el % semanal sale de
// `distribucion-zonas.ts`. Aquí no hay ni un número escrito a mano: si lo
// hubiera, sería la copia que se separa de la buena dentro de tres meses.
import { useState, useMemo } from 'react'
import {
  ZONAS_RESISTENCIA, ZONAS_FUERZA, FACTORES_RESISTENCIA, FACTORES_FUERZA,
  rango, tablaIntensidades,
} from '@/lib/zonas'
import {
  EXPLICACION_RESISTENCIA, EXPLICACION_FUERZA, porcentajeSemanal,
  sesionesDeZona, DISTANCIAS,
} from '@/lib/zonas-explicacion'
import { PLANTILLAS_FUERZA } from '@/lib/plantillas-fuerza'
import type { DistanciaTri, Disciplina } from '@/lib/distribucion-zonas'

export interface TestsAtleta { vam?: number | null; css?: number | null; ftp?: number | null }

type Familia = 'resistencia' | 'fuerza'

const DISCIPLINAS: { id: Disciplina; label: string }[] = [
  { id: 'Carrera', label: '🏃 Carrera' },
  { id: 'Ciclismo', label: '🚴 Ciclismo' },
  { id: 'Natacion', label: '🏊 Natación' },
]

interface Props {
  /** Con qué familia abre. Si llega `sigla`, se deduce de ella. */
  familia?: Familia
  /** Zona seleccionada al abrir: se entra por donde importa, no por una lista. */
  sigla?: string | null
  /** Tests del deportista. Sin ellos la tabla de ritmos cae a porcentajes. */
  tests?: TestsAtleta | null
  fcMax?: number | null
  /** La prueba objetivo, si se conoce, para el reparto semanal. */
  distancia?: DistanciaTri | null
  onCerrar: () => void
}

export default function GuiaZonas({ familia, sigla, tests, fcMax, distancia, onCerrar }: Props) {
  const familiaInicial: Familia =
    sigla && ZONAS_FUERZA.some(z => z.sigla === sigla) ? 'fuerza' : (familia ?? 'resistencia')

  const [fam, setFam] = useState<Familia>(familiaInicial)
  const [sel, setSel] = useState<string>(
    sigla || (familiaInicial === 'fuerza' ? ZONAS_FUERZA[0].sigla : ZONAS_RESISTENCIA[1].sigla),
  )
  const [dist, setDist] = useState<DistanciaTri>(distancia ?? 'medio')

  // Los ritmos del atleta. Se calcula una vez para las 9 y se busca la fila:
  // `tablaIntensidades` ya sabe caer al rango en % cuando falta el test.
  const filas = useMemo(
    () => tablaIntensidades(tests ?? {}, fcMax ?? null),
    [tests?.vam, tests?.css, tests?.ftp, fcMax],
  )

  const cambiarFamilia = (f: Familia) => {
    setFam(f)
    setSel(f === 'fuerza' ? ZONAS_FUERZA[0].sigla : ZONAS_RESISTENCIA[1].sigla)
  }

  const zonasFam = fam === 'fuerza' ? ZONAS_FUERZA : ZONAS_RESISTENCIA
  const factores = fam === 'fuerza' ? FACTORES_FUERZA : FACTORES_RESISTENCIA

  return (
    // z-[60]: se abre DESDE dentro de otros modales (el del día en el
    // calendario, el popup de chips en el dibujo), que ya están en z-50.
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onCerrar}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-start gap-4 p-5 pb-3 border-b border-gray-800">
          <div>
            <h3 className="text-xl font-bold">📚 Guía de zonas</h3>
            <p className="text-gray-500 text-xs mt-1">Qué mejora cada zona, a qué ritmo se entrena y cuánta toca.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-950 border border-gray-800 rounded-xl p-0.5">
              {([['resistencia', 'Resistencia'], ['fuerza', 'Fuerza']] as const).map(([k, l]) => (
                <button key={k} onClick={() => cambiarFamilia(k)}
                  className={'px-3 py-1.5 text-[13px] font-medium rounded-lg transition ' +
                    (fam === k ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>{l}</button>
              ))}
            </div>
            <button onClick={onCerrar} className="text-gray-400 hover:text-white text-2xl leading-none flex-shrink-0">×</button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row min-h-0 flex-1">
          {/* Carril de zonas, agrupadas por factor de carga */}
          <div className="sm:w-60 flex-shrink-0 max-h-40 sm:max-h-none overflow-y-auto border-b sm:border-b-0 sm:border-r border-gray-800 p-2">
            {factores.map(f => {
              const dentro = zonasFam.filter(z => z.factor === f)
              if (!dentro.length) return null
              return (
                <div key={f} className="mb-2">
                  <p className="px-2 py-1 text-[10.5px] uppercase tracking-wide text-gray-600 font-semibold">{f}</p>
                  {dentro.map(z => (
                    <button key={z.sigla} onClick={() => setSel(z.sigla)}
                      className={'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition ' +
                        (sel === z.sigla ? 'bg-gray-800' : 'hover:bg-gray-800/50')}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: z.color }} />
                      <span className="min-w-0">
                        <span className={'block text-[13px] font-semibold leading-tight ' + (sel === z.sigla ? 'text-white' : 'text-gray-300')}>{z.sigla}</span>
                        <span className="block text-[11px] text-gray-500 leading-tight truncate">{z.nombre}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {fam === 'resistencia'
              ? <FichaResistencia sigla={sel} filas={filas} dist={dist} setDist={setDist} conTests={!!(tests?.vam || tests?.css || tests?.ftp)} />
              : <FichaFuerza sigla={sel} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Piezas comunes
// ------------------------------------------------------------
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h5 className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-2">{titulo}</h5>
      {children}
    </section>
  )
}

function Hitos({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((h, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] text-gray-300">
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
          <span>{h}</span>
        </li>
      ))}
    </ul>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5">
      <span className="text-sm leading-none mt-0.5">⚠️</span>
      <p className="text-[12.5px] text-amber-200/90">{texto}</p>
    </div>
  )
}

function Cabecera({ sigla, nombre, color, meta }: { sigla: string; nombre: string; color: string; meta: string[] }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-3.5 h-3.5 rounded-full mt-1 flex-shrink-0" style={{ background: color }} />
      <div className="min-w-0">
        <h4 className="text-lg font-bold leading-tight">{sigla} · {nombre}</h4>
        <p className="text-[12px] text-gray-500 mt-1">{meta.filter(Boolean).join('  ·  ')}</p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Resistencia
// ------------------------------------------------------------
function FichaResistencia({ sigla, filas, dist, setDist, conTests }: {
  sigla: string
  filas: ReturnType<typeof tablaIntensidades>
  dist: DistanciaTri
  setDist: (d: DistanciaTri) => void
  conTests: boolean
}) {
  const z = ZONAS_RESISTENCIA.find(x => x.sigla === sigla)
  const e = EXPLICACION_RESISTENCIA[sigla]
  const fila = filas.find(f => f.sigla === sigla)
  const sesiones = useMemo(() => sesionesDeZona(sigla), [sigla])
  if (!z || !e) return null

  const ritmos: [string, string | undefined][] = [
    ['🏃 Carrera', fila?.carrera], ['🚴 Ciclismo', fila?.ciclismo], ['🏊 Natación', fila?.natacion],
    ['❤️ FC', fila?.fc], ['RPE', fila?.rpe],
  ]
  const dosis: [string, string | undefined][] = [
    ['🏃 Carrera', e.dosis?.carrera], ['🚴 Ciclismo', e.dosis?.ciclismo], ['🏊 Natación', e.dosis?.natacion],
  ]

  return (
    <div>
      <Cabecera sigla={z.sigla} nombre={z.nombre} color={z.color} meta={[
        z.factor,
        'Esfuerzo sostenible ' + z.duracion,
        e.equivalencia ?? '',
      ]} />

      <p className="mt-4 text-[14px] text-gray-200 leading-relaxed">{e.paraQue}</p>

      <Seccion titulo="Qué mejora"><Hitos items={e.hitos} /></Seccion>
      <Seccion titulo="Cuándo se usa">
        <p className="text-[13px] text-gray-300 leading-relaxed">{e.cuando}</p>
      </Seccion>
      {e.ojo && <Aviso texto={e.ojo} />}

      <Seccion titulo={conTests ? 'A qué ritmo (con sus tests)' : 'A qué intensidad'}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ritmos.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-gray-950 border border-gray-800 px-3 py-2">
              <p className="text-[10.5px] text-gray-500">{k}</p>
              <p className="text-[13px] text-gray-200 font-medium">{v && v !== '—' ? v : '—'}</p>
            </div>
          ))}
          <div className="rounded-xl bg-gray-950 border border-gray-800 px-3 py-2">
            <p className="text-[10.5px] text-gray-500">Rango</p>
            <p className="text-[13px] text-gray-200 font-medium">{rango(z.vamMin, z.vamMax)} VAM</p>
          </div>
        </div>
        {!conTests && (
          <p className="text-[11px] text-gray-600 mt-2">
            Sin tests del deportista solo se puede dar el porcentaje. Con VAM, FTP o CSS salen los ritmos reales.
          </p>
        )}
        {z.requiereSprint && (
          <p className="text-[11px] text-gray-600 mt-2">
            Esta zona se prescribe por sensación y tiempo: necesita un test de sprint (MSS o MPP), no la VAM.
          </p>
        )}
      </Seccion>

      <Seccion titulo="Cuánto y cómo">
        <div className="flex flex-col gap-1.5">
          {dosis.map(([k, v]) => v && (
            <p key={k} className="text-[13px] text-gray-300 leading-relaxed">
              <span className="text-gray-500">{k}</span>{'  '}{v}
            </p>
          ))}
        </div>
        {e.dosis?.nota && <p className="text-[12px] text-gray-500 mt-2 italic">{e.dosis.nota}</p>}
      </Seccion>

      <Seccion titulo="Cuánta semana ocupa">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {DISTANCIAS.map(d => (
            <button key={d.id} onClick={() => setDist(d.id)}
              className={'px-2.5 py-1 rounded-lg text-[12px] font-medium transition border ' +
                (dist === d.id
                  ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                  : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white')}>{d.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DISCIPLINAS.map(({ id, label }) => {
            const f = porcentajeSemanal(sigla, dist, id)
            return (
              <div key={id} className="rounded-xl bg-gray-950 border border-gray-800 px-3 py-2">
                <p className="text-[10.5px] text-gray-500">{label}</p>
                <p className="text-[13px] text-gray-200 font-medium">{f ? f.min + '–' + f.max + ' %' : '—'}</p>
                {f && f.siglas.length > 1 && (
                  <p className="text-[10px] text-gray-600 leading-tight mt-0.5">
                    compartido con {f.siglas.filter(s => s !== sigla).join(', ')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-600 mt-2">
          % del volumen de esa disciplina en fase específica. Es lo que usa el planificador para repartir la semana.
        </p>
      </Seccion>

      {sesiones.length > 0 && (
        <Seccion titulo={'En el catálogo · ' + sesiones.length + (sesiones.length === 1 ? ' sesión' : ' sesiones')}>
          <div className="flex flex-wrap gap-1.5">
            {sesiones.map(s => (
              <span key={s.clave} className="text-[12px] text-gray-300 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1">
                {s.nombre}
              </span>
            ))}
          </div>
        </Seccion>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Fuerza
// ------------------------------------------------------------
function FichaFuerza({ sigla }: { sigla: string }) {
  const z = ZONAS_FUERZA.find(x => x.sigla === sigla)
  const e = EXPLICACION_FUERZA[sigla]
  if (!z || !e) return null

  // Las plantillas que tocan esta cualidad. Sale del catálogo, no de una lista.
  const plantillas = PLANTILLAS_FUERZA.filter(p => p.bloques.some(b => b.zona === sigla))

  const dosis: [string, string][] = [
    ['Carga', z.rmMin != null && z.rmMax != null ? z.rmMin + '–' + z.rmMax + ' % 1RM' : 'Sin carga externa'],
    ['Series', z.series],
    ['Repeticiones', z.repTiempo],
    ['Descanso', z.descanso],
    ['Duración de serie', z.durSerie],
    ['RPE', z.rpeMin === z.rpeMax ? String(z.rpeMin) : z.rpeMin + '–' + z.rpeMax],
  ]

  return (
    <div>
      <Cabecera sigla={z.sigla} nombre={z.nombre} color={z.color} meta={[z.factor]} />

      <p className="mt-4 text-[14px] text-gray-200 leading-relaxed">{e.paraQue}</p>

      <Seccion titulo="Qué mejora"><Hitos items={e.hitos} /></Seccion>
      <Seccion titulo="Cuándo se usa">
        <p className="text-[13px] text-gray-300 leading-relaxed">{e.cuando}</p>
      </Seccion>
      {e.ojo && <Aviso texto={e.ojo} />}

      <Seccion titulo="Cuánto y cómo">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {dosis.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-gray-950 border border-gray-800 px-3 py-2">
              <p className="text-[10.5px] text-gray-500">{k}</p>
              <p className="text-[13px] text-gray-200 font-medium">{v}</p>
            </div>
          ))}
        </div>
      </Seccion>

      {plantillas.length > 0 && (
        <Seccion titulo="En el catálogo">
          <div className="flex flex-col gap-1.5">
            {plantillas.map(p => (
              <p key={p.id} className="text-[13px] text-gray-300">
                <span className="text-gray-200 font-medium">{p.nombre}</span>
                <span className="text-gray-500"> · {p.sesionesSemana} por semana</span>
              </p>
            ))}
          </div>
        </Seccion>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// El botón, con su estado dentro: engancharlo es una línea
// ------------------------------------------------------------
export function BotonGuiaZonas(props: Omit<Props, 'onCerrar'> & { clase?: string; texto?: string }) {
  const [abierto, setAbierto] = useState(false)
  const { clase, texto, ...guia } = props
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className={clase ?? 'text-gray-400 hover:text-white text-sm transition'}>
        {texto ?? '📚 Guía de zonas'}
      </button>
      {abierto && <GuiaZonas {...guia} onCerrar={() => setAbierto(false)} />}
    </>
  )
}
