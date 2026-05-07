'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

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

export default function PerfilDeportista({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  const [pestana, setPestana] = useState<'perfil'|'resumen'>('perfil')
  const [tests, setTests] = useState<any>({})
  const [zonas, setZonas] = useState<any[]>([])
  const [ultimoWellness, setUltimoWellness] = useState<any>(null)
  const [carga, setCarga] = useState<any>(null)
  const [ecoScores, setEcoScores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editFecha, setEditFecha] = useState('')
  const [editSexo, setEditSexo] = useState('')
  const [editFcMaxima, setEditFcMaxima] = useState('')
  const [editHrvBasal, setEditHrvBasal] = useState('')
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

    const { data: z } = await supabase.from('zonas_entrenamiento').select('*').eq('id_deportista', id).eq('activa', 'Sí').order('disciplina').order('numero_zona')
    setZonas(z || [])

    const { data: w } = await supabase.from('wellness').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    setUltimoWellness(w?.[0] || null)

    const { data: eco } = await supabase.from('puntuacion_eco').select('*').eq('id_deportista', id).order('fecha_calculo', { ascending: false }).limit(3)
    setEcoScores(eco || [])

    // Calcular carga desde sesiones
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', id)
    if (macros?.length) {
      const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macros.map(m => m.id))
      if (mesos?.length) {
        const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesos.map(m => m.id))
        if (micros?.length) {
          const desde = new Date(); desde.setDate(desde.getDate() - 42)
          const { data: ses } = await supabase.from('sesion').select('fecha_sesion, rpe_estimado, duracion_minutos').in('id_microciclo', micros.map(m => m.id)).eq('estado', 'Realizada').gte('fecha_sesion', desde.toISOString().split('T')[0]).order('fecha_sesion')
          if (ses?.length) {
            let atl = 0, ctl = 0
            ses.forEach(s => {
              const c = (s.rpe_estimado || 5) * (s.duracion_minutos || 0)
              atl = c * (2/8) + atl * (1 - 2/8)
              ctl = c * (2/43) + ctl * (1 - 2/43)
            })
            setCarga({ atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(ctl - atl) })
          }
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
    }).eq('id', id)
    await cargarDatos()
    setEditando(false)
    setGuardandoEdit(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>
  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Deportista no encontrado</div>

  const edad = deportista.fecha_nacimiento ? calcularEdad(deportista.fecha_nacimiento) : null
  const fcUmbral = deportista.fc_maxima ? Math.round(deportista.fc_maxima * 0.85) : null

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
        </div>

        {/* PESTAÑA PERFIL */}
        {pestana === 'perfil' && (
          <div className="flex flex-col gap-6">

            {/* Datos personales */}
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
                ].map(({ label, val }) => (
                  <div key={label} className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">{label}</p>
                    <p className="font-medium text-sm">{val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tests */}
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold mb-4 text-orange-400">Últimos tests</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">🏃 Carrera — VAM</p>
                  {tests.carrera ? (
                    <div>
                      <p className="text-2xl font-bold text-green-400">{tests.carrera.vam} km/h</p>
                      <p className="text-gray-500 text-xs">{tests.carrera.fecha}</p>
                    </div>
                  ) : <p className="text-gray-600 text-sm">Sin test</p>}
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">🏊 Natación — CSS</p>
                  {tests.natacion ? (
                    <div>
                      <p className="text-2xl font-bold text-blue-400">{tests.natacion.css ? (tests.natacion.css * 100).toFixed(1) + 's/100m' : '—'}</p>
                      <p className="text-gray-500 text-xs">{tests.natacion.fecha}</p>
                    </div>
                  ) : <p className="text-gray-600 text-sm">Sin test</p>}
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">🚴 Ciclismo — FTP</p>
                  {tests.ciclismo ? (
                    <div>
                      <p className="text-2xl font-bold text-yellow-400">{tests.ciclismo.ftp} W</p>
                      <p className="text-gray-500 text-xs">{tests.ciclismo.fecha}</p>
                    </div>
                  ) : <p className="text-gray-600 text-sm">Sin test</p>}
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">💪 Fuerza — 1RM</p>
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

            {/* Zonas */}
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

            {/* Wellness */}
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

            {/* Carga */}
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

            {/* ECO */}
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

            {/* Accesos rápidos */}
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
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="ej: 185" />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">HRV basal (ms)</label>
                <input type="number" value={editHrvBasal} onChange={e => setEditHrvBasal(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="ej: 65" />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide mb-1 block">Experiencia previa</label>
                <input type="text" value={editExperiencia} onChange={e => setEditExperiencia(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="ej: Natación de base, 5 años" />
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
