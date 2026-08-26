'use client'
// ============================================================
// Cuánta fuerza está haciendo de cada grupo
// ============================================================
// Esto solo existía en las pantallas del entrenador. El atleta apuntaba sus
// series y nunca sabía si iba corto de algo: tenía que preguntar.
//
// Sin Recharts a propósito. Son cuatro o cinco barras horizontales y un número;
// una librería de gráficos aquí serían 100 kB para pintar unos divs, y en un
// móvil se lee mejor una lista que un gráfico apretado.
import { useState, useEffect } from 'react'
import {
  bandaDe, bandasDe, seriesTexto, periodoTexto,
  OBJETIVOS, OBJETIVO_POR_DEFECTO, cargarSeriesDeGrupos, cargarObjetivos,
  conObjetivos, cumplimientoDe,
  type GrupoSeries, type ObjetivoId,
} from '@/lib/series-por-grupo'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias } from '@/lib/fechas'

/* Los mismos cuatro colores que usa /volumen. Si cambian allí, cambian aquí:
   que el atleta y el entrenador vean el mismo verde para lo mismo importa más
   que ahorrarse la repetición. */
const COLOR: Record<string, { texto: string; barra: string }> = {
  'mantenimiento': { texto: 'text-blue-300', barra: 'bg-blue-500' },
  'desarrollo': { texto: 'text-green-300', barra: 'bg-green-500' },
  'carga-alta': { texto: 'text-yellow-300', barra: 'bg-yellow-500' },
  'sobrevolumen': { texto: 'text-red-300', barra: 'bg-red-500' },
}

const DIAS = 28

export default function MiFuerza({ idDeportista }: { idDeportista: number }) {
  const [grupos, setGrupos] = useState<GrupoSeries[] | null>(null)
  const [objetivo, setObjetivo] = useState<ObjetivoId>(OBJETIVO_POR_DEFECTO)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const v = localStorage.getItem('tp_objetivo_fuerza')
    if (v && OBJETIVOS.some(o => o.id === v)) setObjetivo(v as ObjetivoId)
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [g, objs] = await Promise.all([
        cargarSeriesDeGrupos(supabase, idDeportista, DIAS, sumarDias(hoyISO(), -DIAS)),
        cargarObjetivos(supabase, idDeportista).catch(() => ({})),
      ])
      if (vivo) setGrupos(conObjetivos(g, objs))
    })()
    return () => { vivo = false }
  }, [idDeportista])

  const cambiar = (id: ObjetivoId) => {
    setObjetivo(id)
    localStorage.setItem('tp_objetivo_fuerza', id)
  }

  // Mientras carga no se enseña un cero: parecería que no ha entrenado nada.
  if (grupos === null) return null

  /* Vacío NO es desaparecer. Un elemento que no se pinta cuando no hay datos no
     dice «no tienes series apuntadas», dice «esto no existe en la app», y
     entonces te pones a buscarlo. Se queda con su explicación. */
  const vacio = grupos.length === 0

  /* La escala se estira hasta el techo de la banda de desarrollo, no hasta el
     grupo que más tenga. Si se escalara al máximo, el que más trabaja saldría
     siempre lleno aunque hiciera dos series, y la barra diría «vas bien». */
  const bandas = bandasDe(objetivo)
  const tope = Math.max(bandas[1].hasta, ...grupos.map(g => g.porSemana), 1)

  return (
    <section className="tp-card overflow-hidden mb-5">
      <button onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left">
        <span className="text-xl flex-none">💪</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px]">Tu fuerza por grupo</p>
          <p className="text-gray-500 text-[11.5px] mt-0.5">
            {vacio ? 'Sin series apuntadas todavía' : 'Series por semana · ' + periodoTexto(DIAS)}
          </p>
        </div>
        <span className="text-gray-500 text-xs flex-none">{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-white/[0.075] pt-3.5">
          {vacio && (
            <p className="text-[12.5px] text-gray-400 leading-relaxed">
              No has apuntado ejercicios de fuerza en {periodoTexto(DIAS).replace('últimas ', 'las últimas ')}.
              Cuando apuntes una sesión con sus series, aquí verás cuánto llevas de cada grupo muscular y si vas corto de alguno.
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 text-[10.5px] uppercase tracking-wide font-semibold">Objetivo</span>
            <div className="flex gap-1 bg-gray-950 border border-gray-800 rounded-full p-1">
              {OBJETIVOS.map(o => (
                <button key={o.id} onClick={() => cambiar(o.id)} aria-pressed={objetivo === o.id}
                  className={'px-3 py-1 rounded-full text-[11.5px] transition ' + (objetivo === o.id
                    ? 'bg-orange-500 text-white font-semibold'
                    : 'text-gray-400 hover:text-white')}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {grupos.map(g => {
              const banda = bandaDe(g.porSemana, objetivo)
              const c = COLOR[banda.id]
              const cumple = cumplimientoDe(g)
              /* Con objetivo, la barra se llena contra ÉL. Es lo que le han
                 pedido a esta persona; la banda es una tabla general. */
              const ancho = cumple != null
                ? Math.min(100, cumple)
                : Math.min(100, Math.round((g.porSemana / tope) * 100))
              return (
                <div key={g.grupo} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] text-gray-300 truncate">{g.grupo}</span>
                    <span className="flex items-baseline gap-1.5 flex-none">
                      <span className={'text-[10.5px] ' + c.texto}>{cumple != null ? cumple + '% de ' + seriesTexto(g.objetivo!) : banda.label}</span>
                      <span className="text-[13px] font-bold tabular-nums">{seriesTexto(g.porSemana)}</span>
                      <span className="text-[10.5px] text-gray-600">ser/sem</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={'h-full rounded-full ' + c.barra} style={{ width: ancho + '%' }} />
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-600 leading-relaxed border-t border-white/[0.075] pt-2.5">
            Cuenta las series que has apuntado de sesiones ya hechas.
            En <b className="text-gray-500">{OBJETIVOS.find(o => o.id === objetivo)?.label.toLowerCase()}</b>,
            {' '}la zona de trabajo está en {bandas[1].rango.replace(' / semana', '')} series por semana y grupo.
          </p>
        </div>
      )}
    </section>
  )
}
