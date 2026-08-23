'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { vivas } from '@/lib/papelera'
// El score guardado es de MALESTAR (alto = peor). La lógica de semáforo/frases sigue
// usando esa escala cruda; solo se invierte lo que se PINTA (ver lib/wellness-score).
import { bienestar, colorBienestar, estadoBienestar } from '@/lib/wellness-score'
import { minutosCarga } from '@/lib/duracion-carga'

function getLunesAnterior(): string {
  const hoy = new Date()
  const dia = hoy.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diff - 7)
  return lunes.toISOString().split('T')[0]
}

function getDomingoAnterior(): string {
  const lunes = new Date(getLunesAnterior())
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return domingo.toISOString().split('T')[0]
}

function getLunesActual(): string {
  const hoy = new Date()
  const dia = hoy.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diff)
  return lunes.toISOString().split('T')[0]
}

function getDomingoActual(): string {
  const lunes = new Date(getLunesActual())
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return domingo.toISOString().split('T')[0]
}

function generarFrase(cumplimiento: number, wellness: number | null, desviacion: number | null): string {
  if (cumplimiento >= 0.8) {
    if (wellness !== null && wellness < 25) {
      if (desviacion !== null && Math.abs(desviacion) <= 0.15) return 'Semana perfecta — alta adherencia, carga ajustada y excelente estado.'
      if (desviacion !== null && desviacion > 0.15) return 'Buena adherencia pero carga elevada. Vigilar recuperacion esta semana.'
      return 'Semana solida. Continuar con la progresion planificada.'
    }
    if (wellness !== null && wellness >= 25 && wellness < 50) return 'Buena adherencia pero wellness algo deteriorado. Revisar descanso y estres.'
    if (wellness !== null && wellness >= 50) return 'Semana cumplida pero con senales de fatiga. Considerar reducir carga.'
    if (desviacion !== null && desviacion < -0.15) return 'Semana de descarga bien ejecutada. Buena adherencia.'
    return 'Semana solida. Continuar con la progresion planificada.'
  }
  if (cumplimiento >= 0.6) {
    if (wellness !== null && wellness < 25) return 'Semana irregular pero buen estado fisico. Valorar incremento gradual.'
    return 'Semana con algunas sesiones perdidas. Hablar con el deportista.'
  }
  if (wellness !== null && wellness >= 50) return 'Semana dificil — pocas sesiones y estado deteriorado. Priorizar recuperacion.'
  return 'Semana irregular. Revisar planificacion y comunicacion con el deportista.'
}

function calcularSemaforo(cumplimiento: number, wellness: number | null): 'verde' | 'amarillo' | 'rojo' {
  if (cumplimiento >= 0.8 && (wellness === null || wellness < 50)) return 'verde'
  if (cumplimiento >= 0.6 || (wellness !== null && wellness < 50)) return 'amarillo'
  return 'rojo'
}

const ESTILOS = {
  verde: { bg: 'bg-green-900/30 border-green-700/50', dot: 'bg-green-400', texto: 'text-green-400' },
  amarillo: { bg: 'bg-yellow-900/30 border-yellow-700/50', dot: 'bg-yellow-400', texto: 'text-yellow-400' },
  rojo: { bg: 'bg-red-900/30 border-red-700/50', dot: 'bg-red-400', texto: 'text-red-400' },
}

/* `getMicroIds` vivía aquí: tres consultas encadenadas para acabar acotando las
   sesiones de un atleta. En el resumen del entrenador se llamaba UNA VEZ POR
   ATLETA, así que con diez deportistas eran treinta viajes solo para saber qué
   sesiones mirar. `sesion.id_deportista` lo resuelve sin ninguno. */

// RESUMEN ENTRENADOR
export function ResumenEntrenador({ entrenadorId }: { entrenadorId: string }) {
  const router = useRouter()
  const [resumenes, setResumenes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const lunesAnt = getLunesAnterior()
  const domingoAnt = getDomingoAnterior()

  useEffect(() => { cargar() }, [entrenadorId])

  const cargar = async () => {
    const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', entrenadorId)
    if (!deps?.length) { setLoading(false); return }
    const depIds = deps.map((d: any) => d.id)

    /* Antes esto era un N+1 doble: por cada atleta, tres consultas para la cadena
       más una de sesiones y otra de wellness. Con diez deportistas, cincuenta
       viajes para pintar una tarjeta.

       Ahora son dos consultas para TODOS y el reparto se hace en memoria. Y de
       paso las sesiones se filtran por papelera, que aquí no se hacía: una
       borrada contaba como planificada-y-no-hecha y bajaba el cumplimiento. */
    const [sesQ, wellQ] = await Promise.all([
      vivas(supabase.from('sesion').select('*')
        .in('id_deportista', depIds).gte('fecha_sesion', lunesAnt).lte('fecha_sesion', domingoAnt)),
      supabase.from('wellness').select('id_deportista, score_wellness')
        .in('id_deportista', depIds).gte('fecha', lunesAnt).lte('fecha', domingoAnt),
    ])

    const sesPorDep = new Map<number, any[]>()
    ;(sesQ.data || []).forEach((x: any) => {
      const l = sesPorDep.get(x.id_deportista)
      if (l) l.push(x); else sesPorDep.set(x.id_deportista, [x])
    })
    const wellPorDep = new Map<number, number[]>()
    ;(wellQ.data || []).forEach((w: any) => {
      const l = wellPorDep.get(w.id_deportista)
      if (l) l.push(w.score_wellness || 0); else wellPorDep.set(w.id_deportista, [w.score_wellness || 0])
    })

    const resultados = deps.map((dep) => {
      const sesiones = sesPorDep.get(dep.id) || []
      if (!sesiones.length) return null

      const planificadas = sesiones.length
      const realizadas = sesiones.filter(s => s.estado === 'Realizada').length
      const cumplimiento = planificadas > 0 ? realizadas / planificadas : 0
      // La carga REAL sale del RPE que reportó el atleta y de los minutos que de
      // verdad duró; la PLANIFICADA, del RPE estimado y los minutos previstos. Antes
      // las dos usaban `rpe_estimado * duracion_minutos`, o sea la misma fórmula: la
      // desviación no podía salir positiva ni aunque el atleta se pasara en todas, y
      // la frase «carga elevada» de generarFrase era inalcanzable.
      const cargaReal = sesiones.filter(s => s.estado === 'Realizada')
        .reduce((acc, s) => acc + (s.rpe_reportado || s.rpe_estimado || 5) * minutosCarga(s), 0)
      const cargaPlan = sesiones.reduce((acc, s) => acc + (s.rpe_estimado || 5) * (s.duracion_minutos || 0), 0)
      const desviacion = cargaPlan > 0 ? (cargaReal - cargaPlan) / cargaPlan : null

      const wellness = wellPorDep.get(dep.id) || []
      const wellnessMedio = wellness.length
        ? wellness.reduce((acc, w) => acc + w, 0) / wellness.length
        : null

      const color = calcularSemaforo(cumplimiento, wellnessMedio)
      const frase = generarFrase(cumplimiento, wellnessMedio, desviacion)

      return { dep, planificadas, realizadas, cumplimiento, cargaReal, desviacion, wellnessMedio, color, frase }
    })

    setResumenes(resultados.filter(Boolean))
    setLoading(false)
  }

  if (loading) return <div className="text-center py-4 text-gray-500 text-sm">Calculando resumenes...</div>
  if (!resumenes.length) return (
    <div className="text-center py-6 text-gray-600 text-sm">
      <p>No hay datos de la semana pasada todavia.</p>
      <p className="text-xs mt-1">{lunesAnt} al {domingoAnt}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-gray-500 text-xs">Semana del {lunesAnt} al {domingoAnt}</p>
      {resumenes.map((r: any) => {
        const estilos = ESTILOS[r.color as keyof typeof ESTILOS]
        return (
          <div key={r.dep.id} className={'rounded-xl border p-4 ' + estilos.bg}>
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <div className={'w-2.5 h-2.5 rounded-full ' + estilos.dot} />
                <p className="font-bold text-white">{r.dep.nombre}</p>
              </div>
              <button onClick={() => router.push('/deportistas/' + r.dep.id)}
                className="text-gray-500 hover:text-orange-400 text-xs transition">Ver perfil →</button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Sesiones</p>
                <p className={'text-lg font-bold ' + estilos.texto}>{r.realizadas}/{r.planificadas}</p>
                <p className="text-xs text-gray-600">{Math.round(r.cumplimiento * 100)}%</p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Carga</p>
                <p className="text-lg font-bold text-orange-400">{Math.round(r.cargaReal)} UA</p>
                <p className="text-xs text-gray-600">
                  {r.desviacion !== null ? (r.desviacion > 0 ? '+' : '') + Math.round(r.desviacion * 100) + '% plan' : '—'}
                </p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Bienestar</p>
                <p className="text-lg font-bold" style={{ color: r.wellnessMedio === null ? '#6b7280' : colorBienestar(bienestar(Math.round(r.wellnessMedio))!) }}>
                  {r.wellnessMedio !== null ? bienestar(Math.round(r.wellnessMedio)) : '—'}
                </p>
                <p className="text-xs text-gray-600">{r.wellnessMedio !== null ? estadoBienestar(bienestar(Math.round(r.wellnessMedio))!) : 'Sin datos'}</p>
              </div>
            </div>
            <p className={'text-xs font-medium ' + estilos.texto}>{r.frase}</p>
          </div>
        )
      })}
    </div>
  )
}

// RESUMEN DEPORTISTA
// `plegado`/`alternar` son opcionales: si no se pasan, la tarjeta se comporta como
// siempre (fija, abierta). El panel del deportista sí los pasa, y entonces su propia
// cabecera hace de conmutador — el semáforo se queda visible aunque esté plegada.
export function ResumenDeportista({ depId, plegado, alternar }: { depId: number; plegado?: boolean; alternar?: () => void }) {
  const [datos, setDatos] = useState<any>(null)
  const [sesionesSemActual, setSesionesSemActual] = useState(0)
  const [loading, setLoading] = useState(true)
  const lunesAnt = getLunesAnterior()
  const domingoAnt = getDomingoAnterior()
  const lunesAct = getLunesActual()
  const domingoAct = getDomingoActual()

  useEffect(() => { cargar() }, [depId])

  const cargar = async () => {
    const sel = 'id, estado, duracion_minutos, duracion_real'

    /* Cuatro consultas —las del plan y las libres, de cada una de las dos
       semanas— eran una sola cosa: las sesiones del atleta en ese rango. El
       comentario que había explicaba que las libres tenían que contar «o las dos
       tarjetas dan cifras distintas de la misma semana a cinco centímetros una
       de otra»; ahora no pueden, porque no hay dos consultas que separar. */
    const [a, b] = await Promise.all([
      vivas(supabase.from('sesion').select(sel).eq('id_deportista', depId)
        .gte('fecha_sesion', lunesAnt).lte('fecha_sesion', domingoAnt)),
      vivas(supabase.from('sesion').select('id').eq('id_deportista', depId)
        .gte('fecha_sesion', lunesAct).lte('fecha_sesion', domingoAct)),
    ])
    const sesAnt = a.data || []
    const sesAct = b.data || []

    setSesionesSemActual(sesAct.length)

    if (!sesAnt.length) { setLoading(false); return }

    const planificadas = sesAnt.length
    const realizadas = sesAnt.filter(s => s.estado === 'Realizada').length
    const cumplimiento = planificadas > 0 ? realizadas / planificadas : 0
    // minutosCarga y no `duracion_minutos` a secas: si la sesión se cerró con el
    // cronómetro, lo que hizo de verdad está en `duracion_real`. Sin esto la tarjeta
    // enseña el tiempo PLANIFICADO diciendo "entrenado".
    const minutosTotal = sesAnt.filter(s => s.estado === 'Realizada')
      .reduce((acc, s) => acc + minutosCarga(s), 0)

    const { data: wellness } = await supabase.from('wellness').select('score_wellness')
      .eq('id_deportista', depId).gte('fecha', lunesAnt).lte('fecha', domingoAnt)
    const wellnessMedio = wellness?.length
      ? wellness.reduce((acc, w) => acc + (w.score_wellness || 0), 0) / wellness.length
      : null

    const color = calcularSemaforo(cumplimiento, wellnessMedio)
    setDatos({ planificadas, realizadas, cumplimiento, minutosTotal, wellnessMedio, color })
    setLoading(false)
  }

  if (loading || !datos) return null

  const estilos = ESTILOS[datos.color as keyof typeof ESTILOS]
  const horas = Math.floor(datos.minutosTotal / 60)
  const mins = datos.minutosTotal % 60

  const cabecera = (
    <div className="flex justify-between items-center w-full">
      <div className="text-left">
        <p className="font-bold text-white text-lg">Tu semana pasada</p>
        <p className="text-gray-500 text-xs mt-0.5">{lunesAnt} al {domingoAnt}</p>
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
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Sesiones</p>
          <p className={'text-2xl font-bold ' + estilos.texto}>{datos.realizadas}/{datos.planificadas}</p>
          <p className="text-xs text-gray-600">{Math.round(datos.cumplimiento * 100)}% completado</p>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Tiempo</p>
          <p className="text-2xl font-bold text-orange-400">{horas}h{mins > 0 ? mins + 'm' : ''}</p>
          <p className="text-xs text-gray-600">entrenado</p>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Bienestar</p>
          <p className="text-2xl font-bold" style={{ color: datos.wellnessMedio === null ? '#6b7280' : colorBienestar(bienestar(Math.round(datos.wellnessMedio))!) }}>
            {datos.wellnessMedio !== null ? bienestar(Math.round(datos.wellnessMedio)) : '—'}
          </p>
          <p className="text-xs text-gray-600">{datos.wellnessMedio !== null ? estadoBienestar(bienestar(Math.round(datos.wellnessMedio))!) : 'Sin datos'}</p>
        </div>
      </div>
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
