'use client'
// ============================================================
// Un envío entre entrenadores, por dentro
// ============================================================
// Lo que se ve de un envío antes de aceptarlo (o de lo que mandaste): los
// bloques de la plantilla, los resultados del test, la tabla de zonas y los
// tests de los que salen; y en un traspaso, lo que pasa si se acepta. La usa
// /envios. Ver lib/envios.

import { cargaZona } from '@/lib/zonas'
import { textoBloque } from '@/lib/plantillas'
import { etiquetaDisciplina } from '@/lib/disciplinas'
import {
  nombresDeHitos, resultadosDe, textoZona, textoRpe, zonasDesconocidas, primerNombre, resumenVarios, chipEstado, textoCupo, listaY,
  type Envio, type ContenidoEnvio, type TestEnviado, type TonoEstado,
} from '@/lib/envios'

const DESCANSO = (s?: number) => !s ? '—' : s >= 60 ? (s % 60 ? Math.floor(s / 60) + '′' + String(s % 60).padStart(2, '0') + '″' : s / 60 + '′') : s + '″'

const TONO: Record<TonoEstado, string> = {
  ambar: 'text-amber-200 bg-amber-400/10 border-amber-400/40',
  bien: 'text-emerald-200 bg-emerald-400/10 border-emerald-400/40',
  rojo: 'text-red-200 bg-red-400/10 border-red-400/35',
  neutro: 'text-gray-300 bg-white/[0.05] border-gray-700',
}

/** El estado como chip: lo que pide atención, en ámbar. */
export function ChipEstado({ e, papel }: { e: Envio; papel: 'recibe' | 'manda' }) {
  const { texto, tono } = chipEstado(e, papel)
  return <span className={'text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap self-start ' + TONO[tono]}>{texto}</span>
}

/** Un traspaso: lo que pasa si se acepta, y lo suyo que viaja con él. */
function PreviewTraspaso({ e, papel, cupo }: { e: Envio; papel: 'recibe' | 'manda'; cupo?: { cupo: number | null; tengo: number } | null }) {
  const c: ContenidoEnvio = e.contenido || {}
  const dep = primerNombre(c.deportista?.nombre) || 'El deportista'
  const de = primerNombre(e.de_nombre) || 'su entrenador'
  const para = primerNombre(e.para_nombre) || 'el otro entrenador'
  const tests = c.tests || [], clasificaciones = c.clasificaciones || [], ejercicios = c.ejercicios || []
  const suyo = [
    tests.length ? (tests.length === 1 ? 'el test ' : 'los tests ') + listaY(tests.map(t => '«' + t.nombre + '»')) : '',
    clasificaciones.length ? 'las zonas ' + listaY(clasificaciones.map(z => '«' + z.clasificacion?.nombre + '»')) : '',
    ejercicios.length ? (ejercicios.length === 1 ? 'un ejercicio' : ejercicios.length + ' ejercicios') + ' de ' + (papel === 'recibe' ? 'su biblioteca' : 'tu biblioteca') : '',
  ].filter(Boolean)
  const elCupo = papel === 'recibe' && e.estado === 'pendiente' && !c.deportista?.solo_test ? textoCupo(cupo) : null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className={etiqueta}>{papel === 'recibe' ? 'Lo que pasa si aceptas' : 'Lo que pasa si acepta'}</p>
        <ul className="list-disc pl-5 text-sm text-gray-300 flex flex-col gap-1">
          {c.deportista?.solo_test ? (
            <li>
              {dep} pasa a {papel === 'recibe' ? 'tus Evaluados' : 'los Evaluados de ' + para}, con sus tests: es de solo tests,
              {' '}así que no entra en {papel === 'recibe' ? 'tu' : 'su'} equipo ni gasta {papel === 'recibe' ? 'tu' : 'su'} cupo.
            </li>
          ) : (
            <li>{dep} pasa a {papel === 'recibe' ? 'tu lista' : 'la lista de ' + para}, con su historial, sus tests y su plan.</li>
          )}
          {suyo.length > 0 && (
            <li>
              {papel === 'recibe' ? 'Te llegan' : 'Le llegan'} también, como copias {papel === 'recibe' ? 'tuyas' : 'suyas'}, {listaY(suyo)}:
              {' '}sus mediciones, sus ajustes y sus sesiones pasan a ellas.
              {papel === 'recibe' && ' Si ya tienes algo con el mismo nombre, llega como «Nombre (' + de + ')».'}
            </li>
          )}
          <li>{papel === 'recibe' ? 'Sale de los grupos de ' + de + ', y ' + de + ' deja de ver su ficha.' : 'Sale de tus grupos, y dejas de ver su ficha.'}</li>
          <li>{papel === 'recibe' ? 'No verás sus cobros ni sus mensajes con ' + de + '.' : 'Tus cobros y vuestros mensajes se quedan contigo.'}</li>
          {elCupo && <li className={elCupo.lleno ? 'text-amber-200' : ''}>{elCupo.texto}</li>}
          {e.deportista_usuario
            ? <li>Tiene que aceptarlo también {dep}. Hasta entonces sigue {papel === 'recibe' ? 'con ' + de : 'contigo'}.</li>
            : <li>No tiene cuenta: basta con que {papel === 'recibe' ? 'aceptes tú' : 'acepte ' + para}.</li>}
        </ul>
      </div>
      {clasificaciones.map((z, i) => (
        <PreviewContenido key={'z' + i} papel={papel} sinTests
          e={{ ...e, tipo: 'zonas', contenido: { clasificacion: z.clasificacion, zonas: z.zonas, tests } }} />
      ))}
      {tests.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={etiqueta}>{tests.length === 1 ? 'Su test' : 'Sus tests'}, con sus mediciones</p>
          <PreviewTests tests={tests} />
        </div>
      )}
      {ejercicios.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={etiqueta}>{papel === 'recibe' ? 'Los ejercicios de la biblioteca de ' + de : 'Los ejercicios de tu biblioteca que van'}</p>
          <ul className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2 flex flex-col gap-1 text-sm text-gray-200">
            {ejercicios.map(x => (
              <li key={x.id} className="flex items-center gap-2 min-w-0">
                <span className="truncate">{x.nombre}</span>
                {x.grupo_muscular && <span className="text-gray-500 text-xs flex-shrink-0">· {x.grupo_muscular}</span>}
                {x.url_video && <span className="text-xs text-sky-300/80 flex-shrink-0">· con vídeo</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            {papel === 'recibe'
              ? 'Llegan a tu biblioteca con su vídeo y sus etiquetas. En sus sesiones siguen con el nombre, las series y los kilos de siempre.'
              : 'En sus sesiones siguen con el nombre, las series y los kilos de siempre: la copia es para el vídeo y la técnica.'}
          </p>
        </div>
      )}
    </div>
  )
}

const etiqueta = 'text-[11px] font-semibold uppercase tracking-[0.07em] text-gray-500'

/** Los nombres (y la unidad) de lo que produce un test, venga del modelo que venga. */
function resultadosConUnidad(t: TestEnviado): string[] {
  const lista = (x: unknown) => Array.isArray(x) ? x as { nombre?: string; unidad?: string }[] : []
  const modelo = t.modelo && typeof t.modelo === 'object' ? t.modelo as { resultados?: unknown; sueltos?: unknown; bloques?: unknown } : null
  const res = modelo && (Array.isArray(modelo.sueltos) || Array.isArray(modelo.bloques)) ? lista(modelo.resultados) : lista(t.resultados)
  return res.map((r, i) => (String(r?.nombre ?? '').trim() || resultadosDe(t)[i] || 'resultado ' + (i + 1)) + (r?.unidad ? ' (' + r.unidad + ')' : ''))
}

function camposDe(t: TestEnviado): string[] {
  return Array.isArray(t.campos)
    ? (t.campos as { etiqueta?: string; clave?: string }[]).map(c => String(c?.etiqueta || c?.clave || '').trim()).filter(Boolean)
    : []
}

function PreviewTests({ tests }: { tests: TestEnviado[] }) {
  return (
    <div className="flex flex-col gap-2">
      {tests.map(t => {
        const lab = !!(t.modelo && typeof t.modelo === 'object')
        const campos = camposDe(t)
        const res = resultadosConUnidad(t)
        return (
          <div key={t.id} className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2.5 flex flex-col gap-1">
            <p className="text-sm text-white font-medium">
              {t.nombre} <span className="text-gray-500 font-normal text-xs">· {etiquetaDisciplina(t.deporte)}</span>
              {lab && <span className="ml-2 align-middle text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/12 text-violet-300 border border-violet-400/30">🧪 Laboratorio</span>}
            </p>
            {campos.length > 0 && <p className="text-xs text-gray-400">Se apunta: {campos.join(', ')}</p>}
            <p className="text-xs text-gray-400">Produce: {res.length ? res.join(', ') : '— nada'}</p>
          </div>
        )
      })}
    </div>
  )
}

export function PreviewContenido({ e, papel, sinTests = false, cupo }: {
  e: Envio
  papel: 'recibe' | 'manda'
  /** Dentro de unos «varios», los tests se enseñan una vez, al final. */
  sinTests?: boolean
  /** En un traspaso que te llega: tu cupo, para decir cuántos te quedarían. */
  cupo?: { cupo: number | null; tengo: number } | null
}) {
  const c: ContenidoEnvio = e.contenido || {}
  if (e.tipo === 'deportista') return <PreviewTraspaso e={e} papel={papel} cupo={cupo} />
  /* Unos «varios»: cada parte con su vista de siempre, y los tests al final. */
  if (e.tipo === 'varios') {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-gray-300">{resumenVarios(c)}. Se acepta todo junto.</p>
        {(c.clasificaciones || []).map((z, i) => (
          <PreviewContenido key={'z' + i} papel={papel} sinTests
            e={{ ...e, tipo: 'zonas', contenido: { clasificacion: z.clasificacion, zonas: z.zonas, tests: c.tests } }} />
        ))}
        {(c.plantillas || []).map((p, i) => (
          <PreviewContenido key={'p' + i} papel={papel} e={{ ...e, tipo: 'plantilla', contenido: p }} />
        ))}
        {(c.tests || []).length > 0 && (
          <div className="flex flex-col gap-2">
            <p className={etiqueta}>{(c.tests || []).length === 1 ? 'El test' : 'Los tests'}</p>
            <PreviewTests tests={c.tests || []} />
            <p className="text-xs text-gray-500">Sin las mediciones de nadie: solo cómo se pasa y qué calcula.</p>
          </div>
        )}
      </div>
    )
  }
  if (e.tipo === 'plantilla') {
    const bloques = c.bloques || []
    const desconocidas = zonasDesconocidas(bloques)
    return (
      <div className="flex flex-col gap-2">
        <p className={etiqueta}>La plantilla · {etiquetaDisciplina(c.disciplina)}</p>
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 bg-gray-950/60">
                <th className="px-3 py-1.5 font-semibold">Zona</th>
                <th className="px-3 py-1.5 font-semibold">Bloque</th>
                <th className="px-3 py-1.5 font-semibold">Descanso</th>
                <th className="px-3 py-1.5 font-semibold">Nota</th>
              </tr>
            </thead>
            <tbody>
              {bloques.map((b, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className="px-3 py-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none" style={{ background: cargaZona(b.zona).color, color: '#0a0b0f' }}>{b.zona}</span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-200 tabular-nums whitespace-nowrap">{textoBloque(b)}</td>
                  <td className="px-3 py-1.5 text-gray-400 tabular-nums">{DESCANSO(b.descansoSeg)}</td>
                  <td className="px-3 py-1.5 text-gray-400">{b.nota || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {c.objetivo && <p className="text-xs text-gray-400"><span className="text-gray-500">Objetivo:</span> {c.objetivo}</p>}
        <p className="text-xs text-gray-500">Lleva zonas, no ritmos: a cada deportista le saldrán los suyos con sus tests.</p>
        {desconocidas.length > 0 && (
          <p className="text-amber-200/90 text-xs leading-relaxed bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
            {papel === 'recibe'
              ? 'Usa zonas propias de ' + (primerNombre(e.de_nombre) || 'quien te la manda') + ' (' + desconocidas.join(', ') + ') que tú no tienes: llegan con la sigla, pero la app no sabrá su intensidad.'
              : 'Usa zonas tuyas (' + desconocidas.join(', ') + '): le llegan con la sigla, sin la zona.'}
          </p>
        )}
      </div>
    )
  }
  if (e.tipo === 'test') {
    return (
      <div className="flex flex-col gap-2">
        <p className={etiqueta}>El test</p>
        <PreviewTests tests={c.tests || []} />
        <p className="text-xs text-gray-500">Sin las mediciones de nadie: solo cómo se pasa y qué calcula.</p>
      </div>
    )
  }
  const nombres = nombresDeHitos(c.tests)
  return (
    <div className="flex flex-col gap-2">
      <p className={etiqueta}>Las zonas «{c.clasificacion?.nombre}» · {etiquetaDisciplina(c.clasificacion?.deporte)}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-gray-500 bg-gray-950/60">
              <th className="px-3 py-1.5 font-semibold">Sigla</th>
              <th className="px-3 py-1.5 font-semibold">Nombre</th>
              <th className="px-3 py-1.5 font-semibold">Dónde</th>
              <th className="px-3 py-1.5 font-semibold">RPE</th>
            </tr>
          </thead>
          <tbody>
            {(c.zonas || []).map((z, i) => (
              <tr key={i} className="border-t border-gray-800">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: z.color }} />
                  <span className="font-semibold">{z.sigla}</span>
                </td>
                <td className="px-3 py-1.5 text-gray-200">{z.nombre}</td>
                <td className="px-3 py-1.5 text-gray-300 tabular-nums">{textoZona(z, nombres)}</td>
                <td className="px-3 py-1.5 text-gray-400 tabular-nums">{textoRpe(z)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sinTests && (c.tests || []).length > 0 && (
        <>
          <p className={etiqueta + ' mt-1'}>{(c.tests || []).length === 1 ? 'El test del que salen' : 'Los tests de los que salen'}</p>
          <PreviewTests tests={c.tests || []} />
        </>
      )}
    </div>
  )
}
