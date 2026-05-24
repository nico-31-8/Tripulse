'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import CargaPorDisciplina from '@/components/CargaPorDisciplina'
import Adherencia from '@/components/Adherencia'

function calcularEdad(fecha: string): number {
  const hoy = new Date()
  const nac = new Date(fecha)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

function colorScore(s: number) {
  if (s <= 25) return 'text-green-400'
  if (s <= 50) return 'text-yellow-400'
  if (s <= 75) return 'text-orange-400'
  return 'text-red-400'
}

function estadoTSB(tsb: number) {
  if (tsb < -30) return { label: 'Sobrecarga', color: 'text-red-400' }
  if (tsb < -10) return { label: 'Carga productiva', color: 'text-orange-400' }
  if (tsb < 5)   return { label: 'Transición', color: 'text-yellow-400' }
  if (tsb < 25)  return { label: 'Forma óptima', color: 'text-green-400' }
  return { label: 'Desentrenamiento', color: 'text-blue-400' }
}

const COLOR_DISC: Record<string, string> = {
  'Natacion': 'bg-blue-900 text-blue-300 border-blue-700',
  'Ciclismo': 'bg-yellow-900 text-yellow-300 border-yellow-700',
  'Carrera': 'bg-green-900 text-green-300 border-green-700',
  'Fuerza': 'bg-red-900 text-red-300 border-red-700',
  'Brick': 'bg-purple-900 text-purple-300 border-purple-700',
}

const ICONO_DISC: Record<string, string> = {
  'Natacion': '🏊', 'Ciclismo': '🚴', 'Carrera': '🏃', 'Fuerza': '🏋️', 'Brick': '🔀'
}


const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function DisponibilidadDeportista({ depId }: { depId: number }) {
  const [disponibilidad, setDisponibilidad] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from('disponibilidad').select('*').eq('id_deportista', depId).order('hora_inicio')
      setDisponibilidad(data || [])
      setLoading(false)
    }
    cargar()
  }, [depId])

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando disponibilidad...</div>

  const hayDatos = disponibilidad.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-orange-400">🗓 Disponibilidad semanal</h3>
            <p className="text-gray-500 text-xs mt-0.5">Franjas horarias en las que el deportista puede entrenar</p>
          </div>
        </div>
        {!hayDatos ? (
          <div className="px-5 py-8 text-center text-gray-600 text-sm">
            El deportista aún no ha marcado su disponibilidad.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {DIAS.map(dia => {
              const franjas = disponibilidad.filter(d => d.dia_semana === dia)
              if (!franjas.length) return (
                <div key={dia} className="flex justify-between items-center px-5 py-3">
                  <p className="text-gray-600 text-sm">{dia}</p>
                  <p className="text-gray-700 text-xs">Sin disponibilidad</p>
                </div>
              )
              const totalHoras = franjas.reduce((acc, f) => {
                const ini = parseInt(f.hora_inicio); const fin = parseInt(f.hora_fin)
                return acc + (fin - ini)
              }, 0)
              return (
                <div key={dia} className="px-5 py-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-white text-sm">{dia}</p>
                    <span className="text-xs text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded-full">{totalHoras}h disponible</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {franjas.map((f, i) => (
                      <span key={i} className="bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-gray-700">
                        {f.hora_inicio?.slice(0,5)} → {f.hora_fin?.slice(0,5)}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Vista visual de semana */}
      {hayDatos && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="font-bold text-sm text-gray-300">Vista semanal</h3>
          </div>
          <div className="p-4 overflow-x-auto">
            <div className="grid grid-cols-8 gap-1 min-w-max">
              <div className="text-xs text-gray-600 py-1"></div>
              {DIAS.map(d => (
                <div key={d} className="text-xs text-gray-400 text-center py-1 px-2 font-medium">{d.slice(0,3)}</div>
              ))}
              {Array.from({ length: 17 }, (_, i) => i + 6).map(hora => (
                <>
                  <div key={'h'+hora} className="text-xs text-gray-600 text-right pr-2 py-1">{String(hora).padStart(2,'0')}h</div>
                  {DIAS.map(dia => {
                    const ocupado = disponibilidad.some(f => {
                      if (f.dia_semana !== dia) return false
                      const ini = parseInt(f.hora_inicio); const fin = parseInt(f.hora_fin)
                      return hora >= ini && hora < fin
                    })
                    return (
                      <div key={dia+hora} className={'h-6 rounded ' + (ocupado ? 'bg-orange-500 bg-opacity-60' : 'bg-gray-800')} />
                    )
                  })}
                </>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PerfilDeportista({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  const [pestana, setPestana] = useState<'perfil'|'resumen'|'sesiones'|'disponibilidad'|'cargadisc'|'adherencia'>('perfil')
  const [tests, setTests] = useState<any>({})
  const [zonas, setZonas] = useState<any[]>([])
  const [ultimoWellness, setUltimoWellness] = useState<any>(null)
  const [carga, setCarga] = useState<any>(null)
  const [ecoScores, setEcoScores] = useState<any[]>([])
  const [ultimasSesiones, setUltimasSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editFecha, setEditFecha] = useState('')
  const [editSexo, setEditSexo] = useState('')
  const [editFcMaxima, setEditFcMaxima] = useState('')
  const [editHrvBasal, setEditHrvBasal] = useState('')
  const [editTecNatacion, setEditTecNatacion] = useState('')
  const [editTecCiclismo, setEditTecCiclismo] = useState('')
  const [editTecCarrera, setEditTecCarrera] = useState('')
  const [editExperiencia, setEditExperiencia] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)

    const [t1, t2, t3, tf] = await Promise.all([
      supabase.from('test1_carrera').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1),
      supabase.from('test2_natacion').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1),
      supabase.from('test3_ciclismo').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1),
      supabase.from('test_fuerza').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(5),
    ])
    setTests({ carrera: t1.data?.[0], natacion: t2.data?.[0], ciclismo: t3.data?.[0], fuerza: tf.data || [] })

    const { data: z } = await supabase.from('zonas_entrenamiento').select('*').eq('id_deportista', id).order('disciplina').order('numero_zona')
    setZonas(z || [])

    const { data: w } = await supabase.from('wellness').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    setUltimoWellness(w?.[0] || null)

    const { data: eco } = await supabase.from('puntuacion_eco').select('*').eq('id_deportista', id).order('fecha_calculo', { ascending: false }).limit(3)
    setEcoScores(eco || [])

    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', id)
    if (macros?.length) {
      const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macros.map(m => m.id))
      if (mesos?.length) {
        const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesos.map(m => m.id))
        if (micros?.length) {
          const microIds = micros.map(m => m.id)

          // Carga ATL/CTL
          const desde = new Date(); desde.setDate(desde.getDate() - 42)
          const { data: ses } = await supabase.from('sesion').select('fecha_sesion, rpe_estimado, duracion_minutos').in('id_microciclo', microIds).eq('estado', 'Realizada').gte('fecha_sesion', desde.toISOString().split('T')[0]).order('fecha_sesion')
          if (ses?.length) {
            let atl = 0, ctl = 0
            ses.forEach(s => {
              const c = (s.rpe_estimado || 5) * (s.duracion_minutos || 0)
              atl = c * (2/8) + atl * (1 - 2/8)
              ctl = c * (2/43) + ctl * (1 - 2/43)
            })
            setCarga({ atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(ctl - atl) })
          }

          // Últimas sesiones realizadas
          const { data: ultimas } = await supabase
            .from('sesion')
            .select('*')
            .in('id_microciclo', microIds)
            .eq('estado', 'Realizada')
            .order('fecha_sesion', { ascending: false })
            .limit(10)
          setUltimasSesiones(ultimas || [])
        }
      }
    }
    setLoading(false)
  }

  const abrirEdicion = () => {
    setEditNombre(deportista.nombre || '')
    setEditFecha(deportista.fecha_nacimiento || '')
    setEditSexo(deportista.sexo || '')
    setEditFcMaxima(deportista.fc_maxima || '')
    setEditHrvBasal(deportista.hrv_basal || '')
    setEditTecNatacion(deportista.tec_natacion || '')
    setEditTecCiclismo(deportista.tec_ciclismo || '')
    setEditTecCarrera(deportista.tec_carrera || '')
    setEditExperiencia(deportista.experiencia_previa || '')
    setEditando(true)
  }

  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardandoEdit(true)
    await supabase.from('deportista').update({
      nombre: editNombre,
      fecha_nacimiento: editFecha || null,
      sexo: editSexo || null,
      fc_maxima: editFcMaxima ? Number(editFcMaxima) : null,
      hrv_basal: editHrvBasal ? Number(editHrvBasal) : null,
      experiencia_previa: editExperiencia || null,
      tec_natacion: editTecNatacion ? Number(editTecNatacion) : null,
      tec_ciclismo: editTecCiclismo ? Number(editTecCiclismo) : null,
      tec_carrera: editTecCarrera ? Number(editTecCarrera) : null,
      tec_fecha_actualizacion: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    await cargarDatos()
    setEditando(false)
    setGuardandoEdit(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>
  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Deportista no encontrado</div>

  const edad = deportista.fecha_nacimiento ? calcularEdad(deportista.fecha_nacimiento) : null
  const fcUmbral = deportista.fc_maxima ? Math.round(deportista.fc_maxima * 0.85) : null

  // Estadísticas rápidas de sesiones
  const totalSesiones = ultimasSesiones.length
  const porDisc = ultimasSesiones.reduce((acc, s) => { acc[s.disciplina] = (acc[s.disciplina] || 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/deportistas'} className="text-gray-400 hover:text-white text-sm transition">← Deportistas</button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-bold mb-1">{deportista.nombre}</h2>
              <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                {edad && <span>🎂 {edad} años</span>}
                {deportista.sexo && <span>👤 {deportista.sexo}</span>}
                {deportista.fc_maxima && <span>❤️ FC máx: {deportista.fc_maxima} ppm</span>}
                {fcUmbral && <span>🎯 FC umbral est: {fcUmbral} ppm</span>}
                {deportista.hrv_basal && <span>📊 HRV basal: {deportista.hrv_basal} ms</span>}
              </div>
              {deportista.experiencia_previa && <p className="text-gray-500 text-sm mt-2">Historial: {deportista.experiencia_previa}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => window.location.href = '/planificacion-visual/' + id}
                className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
                📅 Planificación
              </button>
              <button onClick={() => window.location.href = '/planificacion-visual/' + id + '/calendario'}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition">
                🗓 Calendario
              </button>
            </div>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-gray-800 mb-6">
          <button onClick={() => setPestana('perfil')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'perfil' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            👤 Perfil y tests
          </button>
          <button onClick={() => setPestana('resumen')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'resumen' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            📊 Resumen analítico
          </button>
          <button onClick={() => setPestana('sesiones')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'sesiones' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            🏅 Últimas sesiones
          </button>
          <button onClick={() => setPestana('cargadisc')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'cargadisc' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            📊 Carga por disciplina
          </button>
          <button onClick={() => setPestana('adherencia')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'adherencia' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            📋 Adherencia
          </button>
          <button onClick={() => setPestana('disponibilidad')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'disponibilidad' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            🗓 Disponibilidad
          </button>
        </div>

        {/* PESTAÑA PERFIL */}
        {pestana === 'perfil' && (
          <div className="flex flex-col gap-6">
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-orange-400">Datos personales</h3>
                <button onClick={abrirEdicion} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition">✏️ Editar</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Nombre', val: deportista.nombre },
                  { label: 'Edad', val: edad ? edad + ' años' : '—' },
                  { label: 'Sexo', val: deportista.sexo || '—' },
                  { label: 'FC máxima', val: deportista.fc_maxima ? deportista.fc_maxima + ' ppm' : '—' },
                  { label: 'FC umbral est.', val: fcUmbral ? fcUmbral + ' ppm' : '—' },
                  { label: 'HRV basal', val: deportista.hrv_basal ? deportista.hrv_basal + ' ms' : '—' },
                  { label: 'F. nacimiento', val: deportista.fecha_nacimiento || '—' },
                  { label: 'Experiencia', val: deportista.experiencia_previa || '—' },
                  { label: '🏊 Tec. Natación', val: deportista.tec_natacion ? deportista.tec_natacion + '/5' : '—' },
                  { label: '🚴 Tec. Ciclismo', val: deportista.tec_ciclismo ? deportista.tec_ciclismo + '/5' : '—' },
                  { label: '🏃 Tec. Carrera', val: deportista.tec_carrera ? deportista.tec_carrera + '/5' : '—' },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">{label}</p>
                    <p className="font-medium text-sm">{val}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold mb-4 text-orange-400">Últimos tests</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">🏃 Carrera — VAM</p>
                  {tests.carrera ? (
                    <div>
                      <p className="text-2xl font-bold text-green-400">{tests.carrera.vam} <span className="text-sm font-normal text-gray-400">km/h</span></p>
                      <p className="text-gray-500 text-xs">{tests.carrera.fecha}</p>
                    </div>
                  ) : <p className="text-gray-600 text-sm">Sin test</p>}
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">🏊 Natación — CSS</p>
                  {tests.natacion ? (
                    <div>
                      <p className="text-2xl font-bold text-blue-400">{tests.natacion.velocidad_critica_natacion} <span className="text-sm font-normal text-gray-400">m/s</span></p>
                      <p className="text-gray-500 text-xs">{tests.natacion.fecha}</p>
                    </div>
                  ) : <p className="text-gray-600 text-sm">Sin test</p>}
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">🚴 Ciclismo — FTP</p>
                  {tests.ciclismo ? (
                    <div>
                      <p className="text-2xl font-bold text-yellow-400">{tests.ciclismo.ftp} <span className="text-sm font-normal text-gray-400">W</span></p>
                      <p className="text-gray-500 text-xs">{tests.ciclismo.fecha}</p>
                    </div>
                  ) : <p className="text-gray-600 text-sm">Sin test</p>}
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">🏋️ Fuerza — 1RM</p>
                  {tests.fuerza.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {tests.fuerza.slice(0,3).map((t: any) => (
                        <p key={t.id} className="text-sm"><span className="text-red-400 font-bold">{t.rm_estimado}kg</span> <span className="text-gray-400 text-xs">{t.ejercicio}</span></p>
                      ))}
                    </div>
                  ) : <p className="text-gray-600 text-sm">Sin test</p>}
                </div>
              </div>
              <button onClick={() => window.location.href = '/tests/' + id}
                className="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm transition">
                Ver todos los tests →
              </button>
            </div>

            {zonas.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <h3 className="font-bold mb-4 text-orange-400">Zonas de entrenamiento activas</h3>
                {['Carrera','Natacion','Ciclismo'].map(disc => {
                  const zonasDisc = zonas.filter(z => z.disciplina === disc)
                  if (!zonasDisc.length) return null
                  return (
                    <div key={disc} className="mb-4">
                      <p className="text-sm font-medium text-gray-300 mb-2">{disc === 'Natacion' ? '🏊 Natación' : disc === 'Ciclismo' ? '🚴 Ciclismo' : '🏃 Carrera'}</p>
                      <div className="grid gap-1">
                        {zonasDisc.map(z => (
                          <div key={z.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-3 py-2 text-xs">
                            <span className="font-medium">Z{z.numero_zona} {z.nombre_zona}</span>
                            <span className="text-gray-400">{z.limite_inferior_fc && z.limite_superior_fc ? z.limite_inferior_fc + '–' + z.limite_superior_fc + ' ppm' : 'RPE ' + z.rpe_inferior + '–' + z.rpe_superior}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA RESUMEN */}
        {pestana === 'resumen' && (
          <div className="flex flex-col gap-6">
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold mb-4 text-green-400">💚 Último Wellness</h3>
              {ultimoWellness ? (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">{ultimoWellness.fecha}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[
                        { label: 'Fatiga', val: ultimoWellness.fatiga + '/7' },
                        { label: 'Estrés', val: ultimoWellness.estres + '/7' },
                        { label: 'Ánimo', val: ultimoWellness.animo + '/7' },
                        { label: 'Motivación', val: ultimoWellness.motivacion + '/7' },
                        { label: 'Sueño', val: ultimoWellness.horas_sueno + 'h' },
                        { label: 'HRV', val: ultimoWellness.hrv ? ultimoWellness.hrv + ' ms' : '—' },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-gray-800 rounded p-2">
                          <p className="text-gray-500 text-xs">{label}</p>
                          <p className="font-medium">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-center ml-6">
                    <p className={'text-5xl font-black ' + colorScore(ultimoWellness.score_wellness)}>{ultimoWellness.score_wellness}</p>
                    <p className={'text-xs mt-1 ' + colorScore(ultimoWellness.score_wellness)}>Score wellness</p>
                  </div>
                </div>
              ) : <p className="text-gray-500 text-sm">Sin registros de wellness todavía.</p>}
            </div>

            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold mb-4 text-orange-400">📈 Estado de carga</h3>
              {carga ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">CTL — Forma</p>
                    <p className="text-3xl font-bold text-orange-400">{carga.ctl}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">ATL — Fatiga</p>
                    <p className="text-3xl font-bold text-red-400">{carga.atl}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">TSB — Frescura</p>
                    <p className={'text-3xl font-bold ' + estadoTSB(carga.tsb).color}>{carga.tsb > 0 ? '+' : ''}{carga.tsb}</p>
                    <p className={'text-xs mt-1 ' + estadoTSB(carga.tsb).color}>{estadoTSB(carga.tsb).label}</p>
                  </div>
                </div>
              ) : <p className="text-gray-500 text-sm">Sin sesiones realizadas para calcular la carga.</p>}
              <button onClick={() => window.location.href = '/carga'}
                className="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm transition">
                Ver análisis completo de carga →
              </button>
            </div>

            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold mb-4 text-blue-400">🔬 Sistema ECO Individual</h3>
              {ecoScores.length > 0 ? (
                <div className="grid gap-2">
                  {ecoScores.map(e => (
                    <div key={e.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3">
                      <div>
                        <p className="font-medium">{e.disciplina}</p>
                        <p className="text-gray-500 text-xs">F1:{e.puntuacion_f1} F2:{e.puntuacion_f2} F3:{e.puntuacion_f3} F4:{e.puntuacion_f4}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-blue-400">{e.porcentaje}%</p>
                        <p className="text-gray-500 text-xs">Total: {e.total}/16</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-gray-500 text-sm">Sin scores ECO calculados todavía.</p>}
              <button onClick={() => window.location.href = '/eco'}
                className="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm transition">
                Ver análisis ECO completo →
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '🎯', label: 'Índices de sesión', href: '/indices' },
                { icon: '📊', label: 'Volumen', href: '/volumen' },
                { icon: '💚', label: 'Wellness detallado', href: '/wellness-entrenador' },
                { icon: '🏋️', label: 'Tests completos', href: '/tests/' + id },
              ].map(({ icon, label, href }) => (
                <button key={label} onClick={() => window.location.href = href}
                  className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-orange-500 transition text-left flex items-center gap-3">
                  <span className="text-2xl">{icon}</span>
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA SESIONES */}
        {pestana === 'sesiones' && (
          <div className="flex flex-col gap-4">

            {/* Resumen rápido */}
            {ultimasSesiones.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
                  <p className="text-3xl font-bold text-orange-400">{totalSesiones}</p>
                  <p className="text-gray-500 text-xs mt-1">Últimas sesiones</p>
                </div>
                {Object.entries(porDisc).map(([disc, count]) => (
                  <div key={disc} className={'rounded-xl p-4 border text-center ' + (COLOR_DISC[disc] || 'bg-gray-900 border-gray-800')}>
                    <p className="text-2xl font-bold">{count as number}</p>
                    <p className="text-xs mt-1 opacity-70">{ICONO_DISC[disc]} {disc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Lista de sesiones */}
            {ultimasSesiones.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-3">🏅</div>
                <p>No hay sesiones realizadas todavía.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {ultimasSesiones.map(s => (
                  <button key={s.id} onClick={() => window.location.href = '/sesion/' + s.id}
                    className="bg-gray-900 rounded-xl p-5 border border-gray-800 hover:border-orange-500 transition text-left w-full">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{ICONO_DISC[s.disciplina] || '🏃'}</span>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={'text-xs px-2 py-0.5 rounded-full border ' + (COLOR_DISC[s.disciplina] || 'bg-gray-800 border-gray-700 text-gray-300')}>
                              {s.disciplina}
                            </span>
                            <span className="text-gray-500 text-xs">{s.fecha_sesion}</span>
                          </div>
                          {s.notas_entrenador && <p className="text-gray-400 text-xs truncate max-w-xs">{s.notas_entrenador}</p>}
                        </div>
                      </div>
                      <div className="text-right flex flex-col gap-1 items-end">
                        {s.duracion_minutos && (
                          <span className="text-white font-semibold text-sm">{s.duracion_minutos} min</span>
                        )}
                        {s.rpe_estimado && (
                          <span className="text-gray-400 text-xs">RPE {s.rpe_estimado}/10</span>
                        )}
                        <span className="text-orange-500 text-xs">Ver sesión →</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => window.location.href = '/planificacion-visual/' + id + '/calendario'}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl text-sm transition">
              🗓 Ver calendario completo →
            </button>
          </div>
        )}
        {/* PESTAÑA CARGA POR DISCIPLINA */}
        {pestana === 'cargadisc' && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold text-orange-400 mb-1">📊 Carga por disciplina</h3>
              <p className="text-gray-500 text-xs mb-4">ATL · CTL · TSB individual por natación, ciclismo, carrera y fuerza · Detecta desequilibrios entre deportes</p>
              <CargaPorDisciplina depId={Number(id)} diasRango={56} />
            </div>
          </div>
        )}

        {/* PESTAÑA ADHERENCIA */}
        {pestana === 'adherencia' && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold text-orange-400 mb-1">📋 Adherencia de sesiones</h3>
              <p className="text-gray-500 text-xs mb-4">Porcentaje de sesiones planificadas completadas por semana</p>
              <Adherencia depId={Number(id)} />
            </div>
          </div>
        )}

        {/* PESTAÑA DISPONIBILIDAD */}
        {pestana === 'disponibilidad' && (
          <DisponibilidadDeportista depId={Number(id)} />
        )}
      </div>

      {/* Modal edición */}
      {editando && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">Editar datos personales</h3>
              <button onClick={() => setEditando(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <form onSubmit={guardarEdicion} className="flex flex-col gap-3">
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Nombre</label>
                <input type="text" value={editNombre} onChange={e => setEditNombre(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Fecha de nacimiento</label>
                <input type="date" value={editFecha} onChange={e => setEditFecha(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Sexo</label>
                <select value={editSexo} onChange={e => setEditSexo(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Sin especificar</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">FC máxima (ppm)</label>
                <input type="number" value={editFcMaxima} onChange={e => setEditFcMaxima(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="ej: 185" />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">HRV basal (ms)</label>
                <input type="number" value={editHrvBasal} onChange={e => setEditHrvBasal(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="ej: 65" />
              </div>
              <div className="col-span-2">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-3 mt-2 border-t border-gray-700 pt-3">Valoración técnica (1–5)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">🏊 Natación</label>
                    <input type="number" min="1" max="5" step="0.1" value={editTecNatacion} onChange={e => setEditTecNatacion(e.target.value)}
                      className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="1–5" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">🚴 Ciclismo</label>
                    <input type="number" min="1" max="5" step="0.1" value={editTecCiclismo} onChange={e => setEditTecCiclismo(e.target.value)}
                      className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="1–5" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">🏃 Carrera</label>
                    <input type="number" min="1" max="5" step="0.1" value={editTecCarrera} onChange={e => setEditTecCarrera(e.target.value)}
                      className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="1–5" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Experiencia previa</label>
                <input type="text" value={editExperiencia} onChange={e => setEditExperiencia(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="ej: Natación de base, 5 años" />
              </div>
              <button type="submit" disabled={guardandoEdit}
                className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50 mt-2">
                {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
