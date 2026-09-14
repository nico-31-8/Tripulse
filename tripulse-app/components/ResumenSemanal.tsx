'use client'
// ============================================================
// TRIPULSE — El informe de la semana pasada
// ============================================================
// Dos tarjetas, un solo motor (`lib/informe-semanal`): la del entrenador, con
// todo su equipo, y la del atleta, con lo suyo. Antes cada una hacía su propio
// cálculo y escribía sus propias frases, así que podían contar cosas distintas
// de la misma semana; y las frases eran adjetivos («carga elevada») en vez de
// números que se puedan discutir.
//
// Lo que se pinta aquí sale entero del informe. Esta capa solo decide colores y
// disposición: si hay que cambiar QUÉ se dice, se cambia en el motor, que está
// probado.

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { vivas } from '@/lib/papelera'
import { hoyISO, lunesDe, sumarDias, rangoLegible } from '@/lib/fechas'
import { colorBienestar } from '@/lib/wellness-score'
import { cargarInforme, lunesDelInforme } from '@/lib/informe-datos'
import { duracionLarga, type Informe, type NivelSemana } from '@/lib/informe-semanal'

const ESTILOS: Record<NivelSemana, { bg: string; dot: string; texto: string }> = {
  ok: { bg: 'bg-green-900/30 border-green-700/50', dot: 'bg-green-400', texto: 'text-green-400' },
  ambar: { bg: 'bg-yellow-900/30 border-yellow-700/50', dot: 'bg-yellow-400', texto: 'text-yellow-400' },
  roja: { bg: 'bg-red-900/30 border-red-700/50', dot: 'bg-red-400', texto: 'text-red-400' },
}

const pct = (x: number) => (x > 0 ? '+' : '') + Math.round(x * 100) + ' %'

/** Un dato con su rótulo y su letra pequeña. Los tres de arriba de cada tarjeta. */
function Casilla({ rotulo, valor, pie, color, grande }: {
  rotulo: string; valor: string; pie: string; color?: string; grande?: boolean
}) {
  return (
    /* Las clases van enteras y no concatenadas («rounded-» + «xl»): Tailwind
       busca cadenas completas en el código, y una partida no la genera. */
    <div className={'bg-gray-900/50 text-center ' + (grande ? 'rounded-xl p-3' : 'rounded-lg p-2')}>
      <p className="text-xs text-gray-500 mb-0.5">{rotulo}</p>
      <p className={(grande ? 'text-2xl' : 'text-lg') + ' font-bold tabular-nums'}
        style={color ? { color } : undefined}>{valor}</p>
      <p className="text-xs text-gray-600">{pie}</p>
    </div>
  )
}

/** Las tres casillas comunes: lo que hizo, cuánto costó y cómo se encontró. */
function Casillas({ inf, grande }: { inf: Informe; grande?: boolean }) {
  const { hecho, bienestar: bien, comparado } = inf
  return (
    <div className={'grid grid-cols-3 ' + (grande ? 'gap-3 mb-4' : 'gap-2 mb-3')}>
      <Casilla grande={grande} rotulo="Sesiones"
        valor={hecho.realizadas + '/' + hecho.planificadas}
        pie={hecho.cumplimiento != null ? Math.round(hecho.cumplimiento * 100) + ' %' : '—'} />
      <Casilla grande={grande} rotulo="Tiempo" color="#fb923c"
        valor={duracionLarga(hecho.minutos)}
        /* La carga va de pie porque es el número que menos se entiende solo;
           el tiempo lo entiende cualquiera. */
        pie={Math.round(hecho.carga).toLocaleString('es-ES') + ' UA'
          + (comparado ? ' · ' + pct(comparado.variacion) : '')} />
      <Casilla grande={grande} rotulo="Bienestar"
        color={bien.medio == null ? '#6b7280' : colorBienestar(bien.medio)}
        valor={bien.medio != null ? String(bien.medio) : '—'}
        pie={bien.medio == null ? (bien.dias ? 'Sin datos' : 'No lo rellenó')
          : bien.base != null ? 'su normal, ' + bien.base : bien.dias + (bien.dias === 1 ? ' día' : ' días')} />
    </div>
  )
}

// ============================================================
// La del entrenador: todo el equipo
// ============================================================
// Recibe los informes ya calculados en vez de pedirlos: el panel los necesita
// también para las señales de la entrada, y son las mismas consultas. Si no se
// los pasan, no pinta nada en vez de inventarse una segunda carga.
export function ResumenEntrenador({ informes, deportistas, cargando }: {
  informes: Map<number, Informe> | null
  deportistas: { id: number; nombre?: string | null }[]
  cargando?: boolean
}) {
  const router = useRouter()
  const lunes = lunesDelInforme()

  if (cargando || !informes) return <div className="text-center py-4 text-gray-500 text-sm">Calculando la semana…</div>

  /* Solo quien tenía algo planificado. El resto no es que fuera mal: es que esa
     semana no existió para él, y una tarjeta que dice «0/0» es ruido. */
  const filas = deportistas
    .map(d => ({ dep: d, inf: informes.get(d.id) }))
    .filter((f): f is { dep: typeof f.dep; inf: Informe } => !!f.inf && f.inf.hecho.planificadas > 0)

  if (!filas.length) return (
    <div className="text-center py-6 text-gray-600 text-sm">
      <p>No hay nada planificado de la semana pasada todavía.</p>
      <p className="text-xs mt-1">{rangoLegible(lunes)}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-gray-500 text-xs">Semana del {rangoLegible(lunes)}</p>
      {filas.map(({ dep, inf }) => {
        const estilos = ESTILOS[inf.nivel]
        return (
          <div key={dep.id} className={'rounded-xl border p-4 ' + estilos.bg}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className={'w-2.5 h-2.5 rounded-full ' + estilos.dot} />
                <p className="font-bold text-white">{dep.nombre}</p>
              </div>
              <button onClick={() => router.push('/deportistas/' + dep.id)}
                className="text-gray-500 hover:text-orange-400 text-xs transition flex-shrink-0">Ver perfil →</button>
            </div>
            <p className="text-sm text-gray-300 mb-3 leading-snug">{inf.titular}</p>
            <Casillas inf={inf} />
            <p className={'text-xs font-medium ' + estilos.texto}>
              <span className="text-gray-500 font-normal">Para esta semana: </span>{inf.proxima}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// La del atleta: la suya
// ============================================================
// `plegado`/`alternar` son opcionales: si no se pasan, la tarjeta se comporta
// como siempre (fija, abierta). El panel del deportista sí los pasa, y entonces
// su propia cabecera hace de conmutador — el semáforo se queda visible aunque
// esté plegada.
export function ResumenDeportista({ depId, plegado, alternar }: {
  depId: number; plegado?: boolean; alternar?: () => void
}) {
  const [inf, setInf] = useState<Informe | null>(null)
  const [sesionesSemActual, setSesionesSemActual] = useState(0)

  useEffect(() => {
    let vivo = true
    const hoy = hoyISO()
    cargarInforme(supabase, depId, hoy).then(r => { if (vivo) setInf(r) }).catch(() => {})
    /* Lo único que no sale del informe: lo que tiene POR DELANTE esta semana. */
    const lunesAct = lunesDe(hoy)
    const pendientes = async () => {
      const { data } = await vivas(supabase.from('sesion').select('id').eq('id_deportista', depId)
        .gte('fecha_sesion', lunesAct).lte('fecha_sesion', sumarDias(lunesAct, 6)))
      if (vivo) setSesionesSemActual((data || []).length)
    }
    pendientes().catch(() => {})
    return () => { vivo = false }
  }, [depId])

  // Sin nada planificado esa semana no se pinta: es la primera semana del atleta.
  if (!inf || !inf.hecho.planificadas) return null

  const estilos = ESTILOS[inf.nivel]

  const cabecera = (
    <div className="flex justify-between items-center w-full">
      <div className="text-left">
        <p className="font-bold text-white text-lg">Tu semana pasada</p>
        <p className="text-gray-500 text-xs mt-0.5">{rangoLegible(inf.lunes)}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className={'w-3 h-3 rounded-full ' + estilos.dot} />
        {alternar && <span className={'text-gray-500 text-xs tp-chev' + (plegado ? '' : ' open')}>▼</span>}
      </div>
    </div>
  )

  return (
    <div className={'rounded-xl border p-5 ' + (plegado ? 'mb-4 ' : 'mb-6 ') + estilos.bg}>
      {alternar
        ? <button onClick={alternar} className={'w-full' + (plegado ? '' : ' mb-4')}>{cabecera}</button>
        : <div className="mb-4">{cabecera}</div>}
      {plegado ? null : <>
        <Casillas inf={inf} grande />
        <p className="text-sm text-gray-300 leading-snug mb-4">{inf.paraElAtleta}</p>
        {sesionesSemActual > 0 && (
          <div className="bg-gray-900/50 rounded-xl px-4 py-3 flex justify-between items-center">
            <p className="text-gray-400 text-sm">Esta semana tienes</p>
            <p className="text-orange-400 font-bold">{sesionesSemActual} {sesionesSemActual === 1 ? 'sesión planificada' : 'sesiones planificadas'}</p>
          </div>
        )}
      </>}
    </div>
  )
}
