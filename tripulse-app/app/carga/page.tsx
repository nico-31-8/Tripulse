'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import CargaPorDisciplina from '@/components/CargaPorDisciplina'
import { calcularSICAT, factorSicat, type SicatResultado } from '@/lib/sicat'
import { calcularSicatZonas, factorSicatZona, attachZonaPico, type SicatZonasResultado } from '@/lib/sicat-zonas'

const RANGOS = [
  { label: '4 sem', dias: 28 },
  { label: '8 sem', dias: 56 },
  { label: '16 sem', dias: 112 },
  { label: 'Todo', dias: 365 },
]

function calcularCargas(sesiones: any[], factorFn: (s: any) => number = () => 1) {
  if (!sesiones.length) return []
  const mapa: Record<string, number> = {}
  sesiones.forEach(s => {
    const fecha = s.fecha_sesion
    const carga = (s.rpe_reportado || s.rpe_estimado || 5) * (s.duracion_minutos || 0) * factorFn(s)
    mapa[fecha] = (mapa[fecha] || 0) + carga
  })
  const fechas = Object.keys(mapa).sort()
  const resultado: any[] = []
  let atl = 0, ctl = 0
  fechas.forEach(fecha => {
    const carga = mapa[fecha] || 0
    atl = carga * (2 / 8) + atl * (1 - 2 / 8)
    ctl = carga * (2 / 43) + ctl * (1 - 2 / 43)
    const tsb = ctl - atl
    resultado.push({ fecha: fecha.slice(5), fechaFull: fecha, carga: Math.round(carga), atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(tsb) })
  })
  return resultado
}

function calcularACWR(datos: any[]) {
  if (datos.length < 8) return null
  const semanaActual = datos.slice(-7).reduce((s, d) => s + d.carga, 0)
  const cuatroSemanas = datos.slice(-35, -7)
  if (!cuatroSemanas.length) return null
  const mediaCronica = cuatroSemanas.reduce((s, d) => s + d.carga, 0) / 4
  return mediaCronica > 0 ? Math.round((semanaActual / mediaCronica) * 100) / 100 : null
}

function estadoTSB(tsb: number) {
  if (tsb < -30) return { label: 'Sobrecarga', color: 'text-red-400', bg: 'bg-red-900 border-red-500' }
  if (tsb < -10) return { label: 'Carga productiva', color: 'text-orange-400', bg: 'bg-orange-900 border-orange-500' }
  if (tsb < 5)   return { label: 'Transición', color: 'text-yellow-400', bg: 'bg-yellow-900 border-yellow-500' }
  if (tsb < 25)  return { label: 'Forma óptima', color: 'text-green-400', bg: 'bg-green-900 border-green-500' }
  return { label: 'Desentrenamiento', color: 'text-blue-400', bg: 'bg-blue-900 border-blue-500' }
}

function calcularMonotonia(datos: any[]) {
  const ultimos7 = datos.slice(-7)
  if (ultimos7.length < 3) return null
  const media = ultimos7.reduce((s, d) => s + d.carga, 0) / ultimos7.length
  const varianza = ultimos7.reduce((s, d) => s + Math.pow(d.carga - media, 2), 0) / ultimos7.length
  const desv = Math.sqrt(varianza)
  if (desv === 0) return null
  return Math.round((media / desv) * 100) / 100
}

function calcularStrain(datos: any[]) {
  const ultimos7 = datos.slice(-7)
  if (ultimos7.length < 3) return null
  const cargaTotal = ultimos7.reduce((s, d) => s + d.carga, 0)
  const monotonia = calcularMonotonia(datos)
  if (!monotonia) return null
  return Math.round(cargaTotal * monotonia)
}

function estadoMonotonia(m: number) {
  if (m < 1.5) return { label: 'Buena variación', color: 'text-green-400' }
  if (m <= 2.0) return { label: 'Variación moderada', color: 'text-yellow-400' }
  return { label: 'Alta monotonía', color: 'text-red-400' }
}

function estadoACWR(acwr: number) {
  if (acwr < 0.8)  return { label: 'Subcarga', color: 'text-blue-400' }
  if (acwr <= 1.3) return { label: 'Zona óptima', color: 'text-green-400' }
  if (acwr <= 1.5) return { label: 'Precaución', color: 'text-yellow-400' }
  return { label: 'Peligro', color: 'text-red-400' }
}

export default function CargaPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [sesionesRaw, setSesionesRaw] = useState<any[]>([])
  const [rango, setRango] = useState(56)
  const [loading, setLoading] = useState(true)
  const [loadingDatos, setLoadingDatos] = useState(false)
  const [mostrarCarga, setMostrarCarga] = useState(false)
  const [pestana, setPestana] = useState<'global'|'disciplina'|'diaria'>('global')
  const [diariaRaw, setDiariaRaw] = useState<any[]>([])
  const [usarSicat, setUsarSicat] = useState(true)
  const [sicat, setSicat] = useState<SicatResultado | null>(null)
  const [zonasRes, setZonasRes] = useState<SicatZonasResultado | null>(null)
  const [pondZona, setPondZona] = useState(false)
  // Ponderación por zona: se activa desde el módulo SICAT (/eco) y se lee aquí.
  useEffect(() => { setPondZona(typeof window !== 'undefined' && localStorage.getItem('sicat_pond_zona') === '1') }, [])
  const factorFn = (s: any) => {
    if (!usarSicat) return 1
    if (pondZona && s?.zonaPico) {
      const fz = factorSicatZona(s.disciplina, s.zonaPico, zonasRes)
      if (fz != null) return fz
    }
    return factorSicat(s.disciplina, sicat)
  }

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(deps || [])
      setLoading(false)
    }
    cargar()
  }, [])

  const verCarga = async (dep: any, dias: number) => {
    setSeleccionado(dep)
    setLoadingDatos(true)
    setSicat(null)
    setZonasRes(null)
    calcularSICAT(dep).then(setSicat)
    calcularSicatZonas(dep).then(setZonasRes)
    const desde = new Date()
    desde.setDate(desde.getDate() - dias - 42)
    const { data: micros } = await supabase
      .from('microciclo')
      .select('id, mesociclo(id, macrociclo(id_deportista))')
    const microsDelDep = (micros || []).filter((m: any) =>
      m.mesociclo?.macrociclo?.id_deportista === dep.id
    ).map((m: any) => m.id)
    let todasSesiones: any[] = []
    if (microsDelDep.length > 0) {
      const { data: ses } = await supabase
        .from('sesion')
        .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, estado')
        .in('id_microciclo', microsDelDep)
        .eq('estado', 'Realizada')
        .gte('fecha_sesion', desde.toISOString().split('T')[0])
        .order('fecha_sesion')
      todasSesiones = await attachZonaPico(ses || [])
    }
    setSesionesRaw(todasSesiones)
    setLoadingDatos(false)
  }

  const cambiarRango = (dias: number) => {
    setRango(dias)
    if (seleccionado) verCarga(seleccionado, dias)
  }

  const datos = useMemo(() => calcularCargas(sesionesRaw, factorFn).slice(-rango), [sesionesRaw, rango, usarSicat, sicat, pondZona, zonasRes])
  const ultimo = datos[datos.length - 1]
  const acwr = calcularACWR(datos)
  const monotonia = calcularMonotonia(datos)
  const strain = calcularStrain(datos)

  const cargarDiaria = async (dep: any) => {
    const desde = new Date()
    desde.setDate(desde.getDate() - 30)
    const desdeStr = desde.toISOString().split('T')[0]

    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
    const macroIds = (macros || []).map((m: any) => m.id)
    if (!macroIds.length) { setDiariaRaw([]); return }
    const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
    const mesoIds = (mesos || []).map((m: any) => m.id)
    if (!mesoIds.length) { setDiariaRaw([]); return }
    const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
    const microsDelDep = (micros || []).map((m: any) => m.id)
    if (!microsDelDep.length) { setDiariaRaw([]); return }

    const { data: sesiones } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, estado')
      .in('id_microciclo', microsDelDep)
      .gte('fecha_sesion', desdeStr)
      .order('fecha_sesion')

    setDiariaRaw(await attachZonaPico(sesiones || []))
  }

  const datosDiarios = useMemo(() => {
    const dias: any[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const fechaStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })

      const sesDia = diariaRaw.filter(s => s.fecha_sesion === fechaStr)
      const planificadas = sesDia.filter(s => s.estado === 'Planificada')
      const realizadas = sesDia.filter(s => s.estado === 'Realizada')

      const uaPlanificada = planificadas.reduce((acc, s) =>
        acc + (s.rpe_estimado || 5) * (s.duracion_minutos || 0) * factorFn(s), 0)

      const uaPorDisc = (disc: string) => realizadas.filter(s => s.disciplina === disc)
        .reduce((acc, s) => acc + (s.rpe_reportado || s.rpe_estimado || 5) * (s.duracion_minutos || 0) * factorFn(s), 0)
      const uaNatacion = uaPorDisc('Natacion')
      const uaCiclismo = uaPorDisc('Ciclismo')
      const uaCarrera = uaPorDisc('Carrera')
      const uaFuerza = uaPorDisc('Fuerza')

      dias.push({
        fecha: label,
        planificada: Math.round(uaPlanificada),
        Natacion: Math.round(uaNatacion),
        Ciclismo: Math.round(uaCiclismo),
        Carrera: Math.round(uaCarrera),
        Fuerza: Math.round(uaFuerza),
        total: Math.round(uaNatacion + uaCiclismo + uaCarrera + uaFuerza),
      })
    }
    return dias
  }, [diariaRaw, usarSicat, sicat, pondZona, zonasRes])

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Carga de entrenamiento</h2>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-gray-800 mb-6">
          <button onClick={() => setPestana('global')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'global' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            📈 Carga global
          </button>
          <button onClick={() => setPestana('disciplina')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'disciplina' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            🏊 Por disciplina
          </button>
          <button onClick={() => { setPestana('diaria'); if (seleccionado) cargarDiaria(seleccionado) }}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'diaria' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            📅 Visión diaria
          </button>
        </div>

        {/* Selector deportista — común a las dos pestañas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {deportistas.map(d => (
            <button key={d.id} onClick={() => { setRango(56); verCarga(d, 56) }}
              className={'rounded-xl p-5 border-2 text-left transition ' +
                (seleccionado?.id === d.id ? 'bg-orange-500 border-orange-400' : 'bg-gray-900 border-gray-700 hover:border-orange-500')}>
              <h3 className="font-bold text-lg">{d.nombre}</h3>
              <p className="text-sm opacity-70">{d.sexo || 'Sin especificar'} · FC máx: {d.fc_maxima || '—'} ppm</p>
            </button>
          ))}
          {deportistas.length === 0 && (
            <div className="col-span-2 text-center py-12 text-gray-500">
              <div className="text-5xl mb-4">📈</div>
              <p>No tienes deportistas todavía.</p>
            </div>
          )}
        </div>

        {seleccionado && (
          <div className="flex items-center gap-3 mb-6 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <button onClick={() => setUsarSicat(v => !v)}
              className={'px-3 py-1.5 rounded-lg text-xs font-bold transition ' +
                (usarSicat ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
              🔬 SICAT {usarSicat ? 'activado' : 'desactivado'}
            </button>
            <p className="text-gray-500 text-xs">
              {usarSicat
                ? (pondZona
                    ? 'La carga (UA) se pondera por disciplina y por zona de entrenamiento (donde hay datos, n≥3). Ponderación por zona activada desde SICAT.'
                    : 'La carga (UA) se pondera según el coste real de cada disciplina para este atleta.')
                : 'Carga sin ponderar — 1 min de RPE-X vale igual en cualquier disciplina.'}
            </p>
            {usarSicat && pondZona && <span className="text-orange-400 text-xs font-bold ml-auto">· por zona</span>}
          </div>
        )}

        {/* PESTAÑA VISIÓN DIARIA */}
        {pestana === 'diaria' && (
          <div>
            {!seleccionado ? (
              <div className="text-center py-12 text-gray-500">Selecciona un deportista arriba.</div>
            ) : datosDiarios.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay sesiones en los últimos 30 días.</div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <p className="text-sm font-medium text-gray-300 mb-1">Carga diaria — últimos 30 días</p>
                  <p className="text-xs text-gray-500 mb-4">UA = RPE × duración · Barra transparente = carga planificada</p>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={datosDiarios} barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 9 }} interval={2} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" UA" />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                      <Bar dataKey="planificada" fill="#ffffff" fillOpacity={0.08} name="Planificada" radius={[2,2,0,0]} />
                      <Bar dataKey="Natacion" stackId="real" fill="#60a5fa" name="Natación" radius={[0,0,0,0]} />
                      <Bar dataKey="Ciclismo" stackId="real" fill="#fbbf24" name="Ciclismo" radius={[0,0,0,0]} />
                      <Bar dataKey="Carrera" stackId="real" fill="#4ade80" name="Carrera" radius={[0,0,0,0]} />
                      <Bar dataKey="Fuerza" stackId="real" fill="#f87171" name="Fuerza" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Resumen del mes */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: 'Natacion', label: 'Natación', color: 'text-blue-400' },
                    { key: 'Ciclismo', label: 'Ciclismo', color: 'text-yellow-400' },
                    { key: 'Carrera', label: 'Carrera', color: 'text-green-400' },
                    { key: 'Fuerza', label: 'Fuerza', color: 'text-red-400' },
                  ].map(d => {
                    const total = datosDiarios.reduce((acc, dia) => acc + (dia[d.key] || 0), 0)
                    const diasActivos = datosDiarios.filter(dia => dia[d.key] > 0).length
                    return (
                      <div key={d.key} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                        <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                        <p className={'text-xl font-bold ' + d.color}>{Math.round(total)} UA</p>
                        <p className="text-xs text-gray-600 mt-1">{diasActivos} días activos</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA POR DISCIPLINA */}
        {pestana === 'disciplina' && (
          <div>
            {seleccionado
              ? <CargaPorDisciplina depId={seleccionado.id} diasRango={rango} sicat={usarSicat ? sicat : null} />
              : <div className="text-center py-12 text-gray-500"><p>Selecciona un deportista arriba para ver la carga por disciplina.</p></div>
            }
          </div>
        )}

        {/* PESTAÑA GLOBAL */}
        {pestana === 'global' && seleccionado && (
          <div>
            {loadingDatos ? (
              <div className="text-center py-16 text-gray-400">Calculando cargas...</div>
            ) : datos.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">📊</div>
                <p>No hay sesiones realizadas todavía para {seleccionado.nombre}.</p>
                <p className="text-sm mt-2 text-gray-600">Las sesiones deben estar marcadas como "Realizada".</p>
              </div>
            ) : (
              <div>
                {ultimo && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">CTL — Forma</p>
                      <p className="text-2xl font-bold text-orange-400">{ultimo.ctl}</p>
                      <p className="text-xs text-gray-500 mt-1">Carga crónica 42d</p>
                    </div>
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">ATL — Fatiga</p>
                      <p className="text-2xl font-bold text-red-400">{ultimo.atl}</p>
                      <p className="text-xs text-gray-500 mt-1">Carga aguda 7d</p>
                    </div>
                    <div className={'rounded-xl p-4 border ' + estadoTSB(ultimo.tsb).bg}>
                      <p className="text-xs text-gray-300 mb-1 uppercase tracking-wide">TSB — Frescura</p>
                      <p className={'text-2xl font-bold ' + estadoTSB(ultimo.tsb).color}>{ultimo.tsb > 0 ? '+' : ''}{ultimo.tsb}</p>
                      <p className={'text-xs mt-1 ' + estadoTSB(ultimo.tsb).color}>{estadoTSB(ultimo.tsb).label}</p>
                    </div>
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">ACWR — Ratio</p>
                      {acwr ? (
                        <>
                          <p className={'text-2xl font-bold ' + estadoACWR(acwr).color}>{acwr}</p>
                          <p className={'text-xs mt-1 ' + estadoACWR(acwr).color}>{estadoACWR(acwr).label}</p>
                        </>
                      ) : <p className="text-gray-500 text-sm mt-2">Sin datos suficientes</p>}
                    </div>
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Monotonía</p>
                      {monotonia ? (
                        <>
                          <p className={'text-2xl font-bold ' + estadoMonotonia(monotonia).color}>{monotonia}</p>
                          <p className={'text-xs mt-1 ' + estadoMonotonia(monotonia).color}>{estadoMonotonia(monotonia).label}</p>
                        </>
                      ) : <p className="text-gray-500 text-sm mt-2">Sin datos suficientes</p>}
                    </div>
                    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Strain</p>
                      {strain ? (
                        <>
                          <p className="text-2xl font-bold text-purple-400">{strain}</p>
                          <p className="text-xs mt-1 text-gray-500">Carga × monotonía semanal</p>
                        </>
                      ) : <p className="text-gray-500 text-sm mt-2">Sin datos suficientes</p>}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mb-4 flex-wrap items-center">
                  <p className="text-gray-500 text-xs uppercase tracking-wide mr-2">Período</p>
                  {RANGOS.map(r => (
                    <button key={r.dias} onClick={() => cambiarRango(r.dias)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                        (rango === r.dias ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                      {r.label}
                    </button>
                  ))}
                  <button onClick={() => setMostrarCarga(!mostrarCarga)}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ml-2 ' +
                      (mostrarCarga ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    {mostrarCarga ? 'Ocultar carga diaria' : 'Ver carga diaria'}
                  </button>
                </div>

                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4">
                  <p className="text-sm font-medium text-gray-300 mb-3">Forma · Fatiga · Frescura</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={datos}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} interval={Math.floor(datos.length / 6)} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                      <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="ctl" stroke="#f97316" strokeWidth={2} dot={false} name="CTL (forma)" />
                      <Line type="monotone" dataKey="atl" stroke="#f87171" strokeWidth={2} dot={false} name="ATL (fatiga)" />
                      <Line type="monotone" dataKey="tsb" stroke="#4ade80" strokeWidth={2} dot={false} name="TSB (frescura)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {mostrarCarga && (
                  <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4">
                    <p className="text-sm font-medium text-gray-300 mb-3">Carga diaria (UA)</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={datos}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} interval={Math.floor(datos.length / 6)} />
                        <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                        <Line type="monotone" dataKey="carga" stroke="#a78bfa" strokeWidth={2} dot={false} name="Carga (UA)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4">
                  <p className="text-sm font-medium text-gray-300 mb-3">Referencia Monotonía y Strain</p>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    {[
                      { rango: '< 1.5', zona: 'Buena variación', color: 'text-green-400', desc: 'Distribución correcta' },
                      { rango: '1.5 – 2.0', zona: 'Moderada', color: 'text-yellow-400', desc: 'Vigilar variación' },
                      { rango: '> 2.0', zona: 'Alta monotonía', color: 'text-red-400', desc: 'Reestructurar semana' },
                    ].map(z => (
                      <div key={z.zona} className="bg-gray-800 rounded-lg p-3">
                        <p className={'font-bold mb-0.5 ' + z.color}>{z.rango}</p>
                        <p className="text-gray-300 font-medium">{z.zona}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{z.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-sm font-medium text-gray-300 mb-3">Referencia ACWR</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {[
                      { rango: '< 0.8', zona: 'Subcarga', color: 'text-blue-400', desc: 'Riesgo pérdida de forma' },
                      { rango: '0.8 – 1.3', zona: 'Óptimo', color: 'text-green-400', desc: 'Incremento coherente' },
                      { rango: '1.3 – 1.5', zona: 'Precaución', color: 'text-yellow-400', desc: 'Vigilar evolución' },
                      { rango: '> 1.5', zona: 'Peligro', color: 'text-red-400', desc: 'Reducir carga' },
                    ].map(z => (
                      <div key={z.zona} className="bg-gray-800 rounded-lg p-3">
                        <p className={'font-bold mb-0.5 ' + z.color}>{z.rango}</p>
                        <p className="text-gray-300 font-medium">{z.zona}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{z.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

