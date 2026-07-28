'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
// El score guardado es de MALESTAR (alto = peor). La lógica de semáforo/frases sigue
// usando esa escala cruda; solo se invierte lo que se PINTA (ver lib/wellness-score).
import { bienestar, colorBienestar, estadoBienestar } from '@/lib/wellness-score'

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

async function getMicroIds(depId: number): Promise<number[]> {
  const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
  if (!macros?.length) return []
  const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macros.map(m => m.id))
  if (!mesos?.length) return []
  const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesos.map(m => m.id))
  return micros?.map(m => m.id) || []
}

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

    const resultados = await Promise.all(deps.map(async (dep) => {
      const microIds = await getMicroIds(dep.id)
      if (!microIds.length) return null

      const { data: sesiones } = await supabase.from('sesion').select('*')
        .in('id_microciclo', microIds)
        .gte('fecha_sesion', lunesAnt)
        .lte('fecha_sesion', domingoAnt)

      if (!sesiones?.length) return null

      const planificadas = sesiones.length
      const realizadas = sesiones.filter(s => s.estado === 'Realizada').length
      const cumplimiento = planificadas > 0 ? realizadas / planificadas : 0
      const cargaReal = sesiones.filter(s => s.estado === 'Realizada')
        .reduce((acc, s) => acc + (s.rpe_estimado || 5) * (s.duracion_minutos || 0), 0)
      const cargaPlan = sesiones.reduce((acc, s) => acc + (s.rpe_estimado || 5) * (s.duracion_minutos || 0), 0)
      const desviacion = cargaPlan > 0 ? (cargaReal - cargaPlan) / cargaPlan : null

      const { data: wellness } = await supabase.from('wellness').select('score_wellness')
        .eq('id_deportista', dep.id).gte('fecha', lunesAnt).lte('fecha', domingoAnt)
      const wellnessMedio = wellness?.length
        ? wellness.reduce((acc, w) => acc + (w.score_wellness || 0), 0) / wellness.length
        : null

      const color = calcularSemaforo(cumplimiento, wellnessMedio)
      const frase = generarFrase(cumplimiento, wellnessMedio, desviacion)

      return { dep, planificadas, realizadas, cumplimiento, cargaReal, desviacion, wellnessMedio, color, frase }
    }))

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
export function ResumenDeportista({ depId }: { depId: number }) {
  const [datos, setDatos] = useState<any>(null)
  const [sesionesSemActual, setSesionesSemActual] = useState(0)
  const [loading, setLoading] = useState(true)
  const lunesAnt = getLunesAnterior()
  const domingoAnt = getDomingoAnterior()
  const lunesAct = getLunesActual()
  const domingoAct = getDomingoActual()

  useEffect(() => { cargar() }, [depId])

  const cargar = async () => {
    const microIds = await getMicroIds(depId)
    if (!microIds.length) { setLoading(false); return }

    const { data: sesAnt } = await supabase.from('sesion').select('*')
      .in('id_microciclo', microIds).gte('fecha_sesion', lunesAnt).lte('fecha_sesion', domingoAnt)

    const { data: sesAct } = await supabase.from('sesion').select('id')
      .in('id_microciclo', microIds).gte('fecha_sesion', lunesAct).lte('fecha_sesion', domingoAct)

    setSesionesSemActual(sesAct?.length || 0)

    if (!sesAnt?.length) { setLoading(false); return }

    const planificadas = sesAnt.length
    const realizadas = sesAnt.filter(s => s.estado === 'Realizada').length
    const cumplimiento = planificadas > 0 ? realizadas / planificadas : 0
    const minutosTotal = sesAnt.filter(s => s.estado === 'Realizada')
      .reduce((acc, s) => acc + (s.duracion_minutos || 0), 0)

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

  return (
    <div className={'rounded-xl border p-5 mb-6 ' + estilos.bg}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <p className="font-bold text-white text-lg">Tu semana pasada</p>
          <p className="text-gray-500 text-xs mt-0.5">{lunesAnt} al {domingoAnt}</p>
        </div>
        <div className={'w-3 h-3 rounded-full ' + estilos.dot} />
      </div>
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
          <p className="text-orange-400 font-bold">{sesionesSemActual} sesiones planificadas</p>
        </div>
      )}
    </div>
  )
}
