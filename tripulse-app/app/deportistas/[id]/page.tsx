'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { bienestar, colorBienestar, estadoBienestar } from '@/lib/wellness-score'
import CargaPorDisciplina from '@/components/CargaPorDisciplina'
import Adherencia from '@/components/Adherencia'
import { minutosCarga, cargaReal } from '@/lib/duracion-carga'
import { estadoTSB as estadoTSBBase } from '@/lib/panel-metricas'
import { useDeclararModulo } from '@/lib/contexto-modulo'

function calcularEdad(fecha: string): number {
  const hoy = new Date()
  const nac = new Date(fecha)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

// Identidad de color estable por nombre (igual que en el resto de la app).
const GRADS = [['#f97316', '#ea580c'], ['#3b82f6', '#4f46e5'], ['#22c55e', '#0d9488'], ['#a855f7', '#7c3aed'], ['#06b6d4', '#2563eb'], ['#ec4899', '#be185d'], ['#eab308', '#d97706'], ['#ef4444', '#b91c1c']]
const grad = (n: string) => GRADS[[...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length]
const inicial = (n: string) => (n || '?').trim()[0]?.toUpperCase() || '?'

// Umbrales y etiquetas de lib/panel-metricas: había cuatro copias de esto.
function estadoTSB(tsb: number) {
  const e = estadoTSBBase(tsb)
  return { label: e.label, color: e.texto }
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
                      <div key={dia+hora} className={'h-6 rounded ' + (ocupado ? 'bg-orange-500/60' : 'bg-gray-800')} />
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
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()
  const [deportista, setDeportista] = useState<any>(null)
  const [pestana, setPestana] = useState<'estado'|'zonas'|'entreno'|'disponibilidad'|'anamnesis'>('estado')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [anamnesis, setAnamnesis] = useState<any>(null)
  const [tests, setTests] = useState<any>({})
  const [zonas, setZonas] = useState<any[]>([])
  const [ultimoWellness, setUltimoWellness] = useState<any>(null)
  const [carga, setCarga] = useState<any>(null)
  const [ecoScores, setEcoScores] = useState<any[]>([])
  const [ultimasSesiones, setUltimasSesiones] = useState<any[]>([])
  const [peso, setPeso] = useState<number | null>(null)
  const [adherencia, setAdherencia] = useState<{ pct: number; hechas: number; total: number; marcas: boolean[] } | null>(null)
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

  // El import de useDeclararModulo estaba puesto y la llamada no: al abrir el
  // asistente desde la ficha no sabía de quién estabas hablando.
  useDeclararModulo('Ficha del deportista', deportista
    ? [
        `Ficha de ${deportista.nombre}${deportista.fc_maxima ? ` · FCmáx ${deportista.fc_maxima} ppm` : ''}.`,
        (() => {
          const t = [
            tests.carrera?.vam && `VAM ${tests.carrera.vam} km/h`,
            tests.ciclismo?.ftp && `FTP ${tests.ciclismo.ftp} W`,
            tests.natacion?.css && `CSS ${tests.natacion.css} m/s`,
          ].filter(Boolean)
          return t.length ? `Tests: ${t.join(', ')}.` : 'Sin tests cargados: no se le pueden prescribir ritmos.'
        })(),
        carga ? `TSB ${carga.tsb > 0 ? '+' : ''}${carga.tsb} → ${estadoTSB(carga.tsb).label}.` : '',
        adherencia ? `Adherencia ${adherencia.pct}% (${adherencia.hechas} de ${adherencia.total}).` : '',
        `Pestaña abierta: ${pestana}.`,
      ].filter(Boolean).join(' ')
    : '')

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    const { data: an } = await supabase.from('anamnesis').select('*').eq('id_deportista', id).maybeSingle()
    setAnamnesis(an || null)

    const [t1, t2, t3, tf] = await Promise.all([
      supabase.from('test1_carrera').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(6),
      supabase.from('test2_natacion').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(6),
      supabase.from('test3_ciclismo').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(6),
      supabase.from('test_fuerza').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(5),
    ])
    // Se cogen los dos registros más recientes CON valor (las filas de sprint dejan
    // vam/css/ftp a null), para poder mostrar la variación respecto al test anterior.
    const conValor = (rows: any[] | null | undefined, key: string) => (rows || []).filter(r => r[key] != null)
    const tc = conValor(t1.data, 'vam'), tn = conValor(t2.data, 'css'), tb = conValor(t3.data, 'ftp')
    setTests({
      carrera: tc[0], carreraPrev: tc[1],
      natacion: tn[0], natacionPrev: tn[1],
      ciclismo: tb[0], ciclismoPrev: tb[1],
      fuerza: tf.data || [],
    })

    // Último peso registrado → permite expresar el FTP en W/kg.
    const { data: pesos } = await supabase.from('registro_peso').select('peso_kg, fecha').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    setPeso(pesos?.[0]?.peso_kg ?? null)

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
          const { data: ses } = await supabase.from('sesion').select('fecha_sesion, rpe_estimado, rpe_reportado, duracion_minutos').in('id_microciclo', microIds).eq('estado', 'Realizada').gte('fecha_sesion', desde.toISOString().split('T')[0]).order('fecha_sesion')
          if (ses?.length) {
            // Agrupar por día y priorizar RPE reportado, igual que lib/panel-metricas,
            // para que este TSB coincida con el del dashboard y /carga (antes usaba
            // rpe_estimado e iteraba por sesión → dos sesiones el mismo día se componían dos veces).
            const porDia: Record<string, number> = {}
            ses.forEach(s => {
              porDia[s.fecha_sesion] = (porDia[s.fecha_sesion] || 0) + cargaReal(s)
            })
            let atl = 0, ctl = 0
            Object.keys(porDia).sort().forEach(f => {
              const c = porDia[f]
              atl = c * (2/8) + atl * (1 - 2/8)
              ctl = c * (2/43) + ctl * (1 - 2/43)
            })
            setCarga({ atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(ctl - atl) })
          }

          // Adherencia 30 días: de lo planificado hasta HOY, ¿cuánto completó?
          // Solo hasta hoy: una sesión futura aún no es una sesión perdida.
          const d30 = new Date(); d30.setDate(d30.getDate() - 30)
          const hoyIso = new Date().toISOString().split('T')[0]
          const { data: ses30 } = await supabase.from('sesion')
            .select('estado, fecha_sesion')
            .in('id_microciclo', microIds)
            .gte('fecha_sesion', d30.toISOString().split('T')[0])
            .lte('fecha_sesion', hoyIso)
            .or('eliminada.is.null,eliminada.eq.false')
          if (ses30?.length) {
            const orden = [...ses30].sort((a, b) => a.fecha_sesion.localeCompare(b.fecha_sesion))
            const hechas = orden.filter(s => s.estado === 'Realizada').length
            setAdherencia({
              pct: Math.round((hechas / orden.length) * 100),
              hechas,
              total: orden.length,
              marcas: orden.slice(-16).map(s => s.estado === 'Realizada'),
            })
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

  const cambiarSistemaZonas = async (v: number) => {
    await supabase.from('deportista').update({ sistema_zonas: v }).eq('id', id)
    setDeportista((prev: any) => ({ ...prev, sistema_zonas: v }))
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>
  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Deportista no encontrado</div>

  const edad = deportista.fecha_nacimiento ? calcularEdad(deportista.fecha_nacimiento) : null
  const fcUmbral = deportista.fc_maxima ? Math.round(deportista.fc_maxima * 0.85) : null
  const [hc1, hc2] = grad(deportista.nombre)
  const diasTecnica = deportista.tec_fecha_actualizacion
    ? Math.floor((Date.now() - new Date(deportista.tec_fecha_actualizacion).getTime()) / 86400000) : null
  // Mismas banderas que ya marcaban la alerta dentro de la anamnesis: se suben a la portada.
  const hayAlertaSalud = !!anamnesis && [
    anamnesis.salud_cardiaca, anamnesis.salud_familia_infarto, anamnesis.salud_tension_alta,
    anamnesis.salud_diabetes, anamnesis.salud_asma, anamnesis.salud_medicacion,
    anamnesis.salud_alergia, anamnesis.salud_razon_medica,
  ].some(v => v === true)

  // Estadísticas rápidas de sesiones
  const totalSesiones = ultimasSesiones.length
  const porDisc = ultimasSesiones.reduce((acc, s) => { acc[s.disciplina] = (acc[s.disciplina] || 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-30 pl-44 pr-6 h-[54px] flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <h1 className="text-[17px] font-bold tracking-tight truncate">Ficha <span className="text-gray-500 font-normal text-[13px] hidden sm:inline">· dossier del deportista</span></h1>
        <button onClick={() => router.push('/deportistas')} className="text-gray-400 hover:text-white text-[13px] transition flex-shrink-0">← Deportistas</button>
      </header>

      <div className="max-w-[1520px] mx-auto px-4 sm:px-6 py-6">
        {/* ===== PORTADA ===== */}
        <div className="tp-card mb-5">
          <div className="relative p-6">
            <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[420px] h-[320px]"
              style={{ background: 'radial-gradient(circle, ' + hc1 + '28, transparent 68%)' }} />
            <div className="relative flex items-start gap-5 flex-wrap">
              {/* La foto abre/cierra todos los datos personales. */}
              <button onClick={() => setAvatarOpen(o => !o)} title="Ver todos los datos personales"
                className="relative w-[92px] h-[92px] rounded-[28px] grid place-items-center text-[38px] font-extrabold text-white flex-shrink-0 transition hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(145deg,' + hc1 + ',' + hc2 + ')', boxShadow: '0 18px 40px -14px ' + hc1 + '99' }}>
                {inicial(deportista.nombre)}
                <span className={'absolute -right-1 -bottom-1 w-[26px] h-[26px] rounded-full grid place-items-center text-[11px] bg-[#11161d] border border-white/20 text-gray-300 transition-transform duration-300 ' + (avatarOpen ? 'rotate-180' : '')}>▾</span>
              </button>

              <div className="flex-1 min-w-[230px]">
                <h2 className="text-[32px] font-extrabold tracking-tight leading-none">{deportista.nombre}</h2>
                <p className="text-[13px] text-gray-400 mt-2">
                  {[edad ? edad + ' años' : null, deportista.sexo, deportista.fecha_nacimiento ? 'nacido el ' + deportista.fecha_nacimiento : null, deportista.experiencia_previa].filter(Boolean).join(' · ')}
                </p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {ultimoWellness && (() => {
                    const b = bienestar(ultimoWellness.score_wellness) ?? 0
                    return <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: colorBienestar(b) + '1f', color: colorBienestar(b) }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorBienestar(b) }} />{estadoBienestar(b)}
                    </span>
                  })()}
                  {carga && <span className="text-[11.5px] text-gray-300 px-2.5 py-1 rounded-full bg-white/5">{estadoTSB(carga.tsb).label} · TSB {carga.tsb > 0 ? '+' : ''}{carga.tsb}</span>}
                  {hayAlertaSalud && <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: '#ef444422', color: '#fca5a5' }}>⚠️ Antecedentes médicos</span>}
                  {!anamnesis && <span className="text-[11.5px] px-2.5 py-1 rounded-full bg-white/5 text-gray-400">Anamnesis pendiente</span>}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={() => router.push('/planificacion-visual/' + id)} className="bg-orange-500 hover:bg-orange-400 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold transition">Planificación</button>
                <button onClick={() => router.push('/planificacion-visual/' + id + '/calendario')} className="bg-white/5 border border-white/[0.075] hover:border-white/20 text-gray-300 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold transition">Calendario</button>
                <button onClick={abrirEdicion} className="bg-white/5 border border-white/[0.075] hover:border-white/20 text-gray-300 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold transition">Editar datos</button>
              </div>
            </div>
          </div>

          {/* Ficha técnica: constantes */}
          <div className="grid border-t border-white/[0.075]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(122px,1fr))' }}>
            {[
              { k: 'FC máxima', v: deportista.fc_maxima ? deportista.fc_maxima : '—', u: deportista.fc_maxima ? 'ppm' : '' },
              { k: 'FC umbral est.', v: fcUmbral || '—', u: fcUmbral ? 'ppm' : '' },
              { k: 'HRV basal', v: deportista.hrv_basal || '—', u: deportista.hrv_basal ? 'ms' : '' },
              { k: 'Sistema de zonas', v: (deportista.sistema_zonas || 1) === 2 ? 'Zonas 2' : 'Clásico', u: '', chico: true },
              { k: 'Valoración técnica', v: diasTecnica != null ? 'Hace ' + diasTecnica + ' d' : 'Sin registrar', u: '', chico: true },
            ].map(s => (
              <div key={s.k} className="px-6 py-3.5 border-r border-white/[0.075] last:border-r-0">
                <p className="text-[9.5px] font-bold tracking-[.07em] uppercase text-gray-500">{s.k}</p>
                <p className={'font-bold mt-1.5 tabular-nums tracking-tight ' + (s.chico ? 'text-[15px]' : 'text-[19px]')}>{s.v}{s.u && <span className="text-[10.5px] text-gray-500 font-normal ml-0.5">{s.u}</span>}</p>
              </div>
            ))}
          </div>

          {/* Datos personales — se despliegan al pulsar la foto */}
          <div className={'tp-collapse ' + (avatarOpen ? 'open' : '')} style={{ maxHeight: avatarOpen ? 420 : 0, marginTop: 0 }}>
            <div className="px-6 py-5 border-t border-white/[0.075]">
              <div className="flex justify-between items-baseline mb-3 flex-wrap gap-2">
                <p className="text-[10.5px] font-bold tracking-[.07em] uppercase text-gray-500">Datos personales</p>
                <button onClick={abrirEdicion} className="bg-white/5 border border-white/[0.075] hover:border-white/20 text-gray-300 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition">✏️ Editar</button>
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
                {[
                  { label: 'Nombre', val: deportista.nombre },
                  { label: 'Edad', val: edad ? edad + ' años' : '—' },
                  { label: 'Sexo', val: deportista.sexo || '—' },
                  { label: 'F. nacimiento', val: deportista.fecha_nacimiento || '—' },
                  { label: 'FC máxima', val: deportista.fc_maxima ? deportista.fc_maxima + ' ppm' : '—' },
                  { label: 'FC umbral est.', val: fcUmbral ? fcUmbral + ' ppm' : '—' },
                  { label: 'HRV basal', val: deportista.hrv_basal ? deportista.hrv_basal + ' ms' : '—' },
                  { label: 'Experiencia', val: deportista.experiencia_previa || '—' },
                  { label: '🏊 Tec. Natación', val: deportista.tec_natacion ? deportista.tec_natacion + '/5' : '—' },
                  { label: '🚴 Tec. Ciclismo', val: deportista.tec_ciclismo ? deportista.tec_ciclismo + '/5' : '—' },
                  { label: '🏃 Tec. Carrera', val: deportista.tec_carrera ? deportista.tec_carrera + '/5' : '—' },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-xl border border-white/[0.055] bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[10px] text-gray-500 font-semibold">{label}</p>
                    <p className="text-[13.5px] font-semibold mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-gray-800 mb-6 flex-wrap">
          {([
            ['estado', 'Estado'],
            ['zonas', 'Zonas y tests'],
            ['entreno', 'Entrenamiento'],
            ['disponibilidad', 'Disponibilidad'],
            ['anamnesis', 'Anamnesis'],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPestana(k)}
              className={'px-4 py-2.5 text-[13.5px] font-semibold transition border-b-2 -mb-px flex items-center gap-1.5 ' +
                (pestana === k ? 'border-orange-500 text-orange-300' : 'border-transparent text-gray-400 hover:text-white')}>
              {l}
              {k === 'anamnesis' && anamnesis?.estado === 'enviada' && pestana !== 'anamnesis' && <span className="w-2 h-2 bg-green-400 rounded-full" />}
              {k === 'anamnesis' && !anamnesis && <span className="text-[10px] bg-white/[0.07] text-gray-400 px-1.5 py-0.5 rounded">Pendiente</span>}
              {k === 'anamnesis' && hayAlertaSalud && <span className="text-[11px]">⚠️</span>}
            </button>
          ))}
        </div>

        {/* PESTAÑA ZONAS Y TESTS */}
        {pestana === 'zonas' && (
          <div className="flex flex-col gap-5">
            <div className="tp-card p-5">
              <h3 className="font-semibold mb-1 text-[15px]">Sistema de zonas</h3>
              <p className="text-gray-500 text-xs mb-4">Define qué zonas de entrenamiento se usan al planificar con este deportista.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                {[
                  { v: 1, t: 'Clásico', d: '7 zonas (Z1–Z7)' },
                  { v: 2, t: 'Zonas 2', d: '9 metabólicas + fuerza' },
                ].map(op => (
                  <button key={op.v} onClick={() => cambiarSistemaZonas(op.v)}
                    className={'flex-1 text-left rounded-xl p-4 border-2 transition ' + ((deportista.sistema_zonas || 1) === op.v ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-500')}>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{op.t}</p>
                      {(deportista.sistema_zonas || 1) === op.v && <span className="text-orange-400 text-xs">✓ activo</span>}
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">{op.d}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => router.push('/zonas/' + id)}
                className="mt-4 w-full bg-white/[0.05] border border-white/[0.075] hover:border-white/20 text-gray-300 py-2.5 rounded-lg text-[12.5px] font-semibold transition">
                Ver tabla completa de zonas con sus ritmos →
              </button>
            </div>

            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold mb-4 text-orange-400">Últimos tests</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { k: '🏃 Carrera — VAM', t: tests.carrera, prev: tests.carreraPrev, campo: 'vam', u: 'km/h', c: '#4ade80' },
                  { k: '🏊 Natación — CSS', t: tests.natacion, prev: tests.natacionPrev, campo: 'css', u: 'm/s', c: '#60a5fa' },
                  { k: '🚴 Ciclismo — FTP', t: tests.ciclismo, prev: tests.ciclismoPrev, campo: 'ftp', u: 'W', c: '#fbbf24' },
                ].map(({ k, t, prev, campo, u, c }) => {
                  // En estas tres métricas MÁS ALTO = MEJOR, por eso subir siempre es verde.
                  const delta = t && prev ? Math.round((t[campo] - prev[campo]) * 100) / 100 : null
                  return (
                    <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <p className="text-[11px] text-gray-500 mb-1.5">{k}</p>
                      {t ? (
                        <div>
                          <p className="text-[24px] font-bold leading-none tabular-nums" style={{ color: c }}>
                            {t[campo]} <span className="text-[13px] font-normal text-gray-500">{u}</span>
                          </p>
                          {campo === 'ftp' && peso ? (
                            <p className="text-[11px] text-gray-400 mt-1.5">{(t.ftp / peso).toFixed(2)} W/kg <span className="text-gray-600">· {peso} kg</span></p>
                          ) : null}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[11px] text-gray-500">{t.fecha}</span>
                            {delta != null && delta !== 0 && (
                              <span className="text-[10.5px] font-bold" style={{ color: delta > 0 ? '#4ade80' : '#f87171' }}>
                                {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} {u}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : <p className="text-gray-600 text-[13px]">Sin test</p>}
                    </div>
                  )
                })}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-[11px] text-gray-500 mb-1.5">🏋️ Fuerza — 1RM</p>
                  {tests.fuerza.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {tests.fuerza.slice(0, 3).map((t: any) => (
                        <p key={t.id} className="text-[13px]"><span className="text-red-400 font-bold tabular-nums">{t.rm_estimado} kg</span> <span className="text-gray-500 text-[11px]">{t.ejercicio}</span></p>
                      ))}
                    </div>
                  ) : <p className="text-gray-600 text-[13px]">Sin test</p>}
                </div>
              </div>
              <button onClick={() => router.push('/tests/' + id)}
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

        {/* PESTAÑA ESTADO */}
        {pestana === 'estado' && (
          <div className="flex flex-col gap-5">
            {/* --- Cómo está hoy --- */}
            <div>
              <p className="text-[10.5px] font-bold tracking-[.07em] uppercase text-gray-500 mb-3">Cómo está hoy</p>
              <div className="grid gap-4 md:grid-cols-3">
                {/* Wellness */}
                <div className="tp-card p-[18px]">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-300">
                    <span className="w-2 h-2 rounded-full bg-green-500" />Último wellness
                    {ultimoWellness && <span className="text-gray-500 font-normal">· {ultimoWellness.fecha}</span>}
                  </div>
                  {ultimoWellness ? (() => {
                    const b = bienestar(ultimoWellness.score_wellness) ?? 0
                    return (
                      <>
                        <p className="text-[36px] font-bold leading-none mt-3 tabular-nums" style={{ color: colorBienestar(b) }}>
                          {b}<span className="text-[14px] text-gray-500 font-medium"> /100 bienestar</span>
                        </p>
                        <p className="text-[11.5px] mt-1.5" style={{ color: colorBienestar(b) }}>{estadoBienestar(b)}</p>
                        <div className="grid grid-cols-3 gap-1.5 mt-3.5">
                          {[
                            { k: 'Fatiga', v: ultimoWellness.fatiga + '/7' },
                            { k: 'Estrés', v: ultimoWellness.estres + '/7' },
                            { k: 'Ánimo', v: ultimoWellness.animo + '/7' },
                            { k: 'Motivación', v: ultimoWellness.motivacion + '/7' },
                            { k: 'Sueño', v: ultimoWellness.horas_sueno + 'h' },
                            { k: 'HRV', v: ultimoWellness.hrv ? ultimoWellness.hrv + ' ms' : '—' },
                          ].map(({ k, v }) => (
                            <div key={k} className="rounded-[10px] border border-white/[0.055] bg-white/[0.02] px-2 py-1.5">
                              <p className="text-[9.5px] text-gray-500">{k}</p>
                              <p className="text-[13px] font-semibold mt-0.5">{v}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )
                  })() : <p className="text-gray-500 text-[13px] mt-4">Sin registros de wellness todavía.</p>}
                </div>

                {/* Carga */}
                <div className="tp-card p-[18px]">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-300">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />Estado de carga
                  </div>
                  {carga ? (
                    <>
                      <p className={'text-[36px] font-bold leading-none mt-3 tabular-nums ' + estadoTSB(carga.tsb).color}>
                        {carga.tsb > 0 ? '+' : ''}{carga.tsb}<span className="text-[14px] text-gray-500 font-medium"> TSB</span>
                      </p>
                      <p className={'text-[11.5px] mt-1.5 ' + estadoTSB(carga.tsb).color}>{estadoTSB(carga.tsb).label}</p>
                      <div className="grid grid-cols-2 gap-1.5 mt-3.5">
                        <div className="rounded-[10px] border border-white/[0.055] bg-white/[0.02] px-2 py-1.5">
                          <p className="text-[9.5px] text-gray-500">CTL · Forma</p>
                          <p className="text-[13px] font-semibold mt-0.5 text-orange-400">{carga.ctl}</p>
                        </div>
                        <div className="rounded-[10px] border border-white/[0.055] bg-white/[0.02] px-2 py-1.5">
                          <p className="text-[9.5px] text-gray-500">ATL · Fatiga</p>
                          <p className="text-[13px] font-semibold mt-0.5 text-red-400">{carga.atl}</p>
                        </div>
                      </div>
                      <button onClick={() => router.push('/carga')} className="text-[11.5px] text-gray-500 hover:text-white transition mt-3.5">Ver análisis completo →</button>
                    </>
                  ) : <p className="text-gray-500 text-[13px] mt-4">Sin sesiones realizadas para calcular la carga.</p>}
                </div>

                {/* Adherencia */}
                <div className="tp-card p-[18px]">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-300">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />Adherencia 30 días
                  </div>
                  {adherencia ? (
                    <>
                      <p className="text-[36px] font-bold leading-none mt-3 tabular-nums" style={{ color: adherencia.pct >= 85 ? '#c084fc' : adherencia.pct >= 65 ? '#f97316' : '#ef4444' }}>
                        {adherencia.pct}<span className="text-[14px] text-gray-500 font-medium"> %</span>
                      </p>
                      <p className="text-[11.5px] text-gray-500 mt-1.5">{adherencia.hechas} de {adherencia.total} sesiones completadas</p>
                      <div className="flex gap-[3px] flex-wrap mt-3.5">
                        {adherencia.marcas.map((ok, i) => (
                          <span key={i} title={ok ? 'Realizada' : 'No realizada'} className="w-[11px] h-[11px] rounded-[3px]" style={{ background: ok ? '#a855f7' : '#3f3f46' }} />
                        ))}
                      </div>
                    </>
                  ) : <p className="text-gray-500 text-[13px] mt-4">Sin sesiones planificadas en los últimos 30 días.</p>}
                </div>
              </div>
            </div>

            {/* --- Valoración técnica + SICAT --- */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="tp-card p-[18px]">
                <p className="text-[10.5px] font-bold tracking-[.07em] uppercase text-gray-500 mb-3">Valoración técnica</p>
                <div className="flex flex-col gap-4">
                  {[
                    { l: '🏊 Natación', v: deportista.tec_natacion, c: '#60a5fa' },
                    { l: '🚴 Ciclismo', v: deportista.tec_ciclismo, c: '#fbbf24' },
                    { l: '🏃 Carrera', v: deportista.tec_carrera, c: '#4ade80' },
                  ].map(({ l, v, c }) => (
                    <div key={l}>
                      <div className="flex justify-between text-[12.5px] mb-1.5">
                        <span>{l}</span>
                        <b>{v ? v : '—'}<span className="text-gray-500 font-normal">{v ? '/5' : ''}</span></b>
                      </div>
                      <div className="h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: ((Number(v) || 0) / 5 * 100) + '%', background: c }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11.5px] text-gray-500 mt-4 pt-3 border-t border-white/[0.06]">
                  {diasTecnica != null ? 'Actualizada hace ' + diasTecnica + ' días' : 'Sin registrar todavía'} · conviene revisarla cada 4 semanas.
                </p>
              </div>

              <div className="tp-card p-[18px]">
                <div className="flex justify-between items-baseline mb-3 flex-wrap gap-2">
                  <p className="text-[10.5px] font-bold tracking-[.07em] uppercase text-gray-500">Coste de entrenamiento (SICAT)</p>
                  <button onClick={() => router.push('/eco')} className="text-[11.5px] text-gray-500 hover:text-white transition">Ver completo →</button>
                </div>
                {ecoScores.length > 0 ? (
                  <>
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-gray-500 text-[9.5px] uppercase tracking-wider">
                          <th className="text-left font-bold pb-2">Disciplina</th>
                          <th className="text-center font-bold pb-2">F1</th>
                          <th className="text-center font-bold pb-2">F2</th>
                          <th className="text-center font-bold pb-2">F3</th>
                          <th className="text-center font-bold pb-2">F4</th>
                          <th className="text-right font-bold pb-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ecoScores.map(e => (
                          <tr key={e.id} className="border-t border-white/[0.05]">
                            <td className="py-2">{e.disciplina === 'Natacion' ? '🏊 Natación' : e.disciplina === 'Ciclismo' ? '🚴 Ciclismo' : '🏃 Carrera'}</td>
                            <td className="py-2 text-center tabular-nums">{e.puntuacion_f1}</td>
                            <td className="py-2 text-center tabular-nums">{e.puntuacion_f2}</td>
                            <td className="py-2 text-center tabular-nums">{e.puntuacion_f3}</td>
                            <td className="py-2 text-center tabular-nums">{e.puntuacion_f4}</td>
                            <td className="py-2 text-right">
                              <b className="text-blue-400">{e.porcentaje}%</b>
                              <span className="text-gray-600 text-[11px]"> {e.total}/16</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-gray-500 mt-3">F1 técnica · F2 dolor · F3 densidad · F4 energético</p>
                  </>
                ) : <p className="text-gray-500 text-[13px]">Sin scores SICAT calculados todavía.</p>}
              </div>
            </div>

            {/* --- Accesos --- */}
            <div>
              <p className="text-[10.5px] font-bold tracking-[.07em] uppercase text-gray-500 mb-3">Ir a</p>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                {[
                  { icon: '🎯', label: 'Índices de sesión', href: '/indices', c: '#eab308' },
                  { icon: '📊', label: 'Volumen', href: '/volumen', c: '#a855f7' },
                  { icon: '💚', label: 'Wellness detallado', href: '/wellness-entrenador', c: '#22c55e' },
                  { icon: '🏋️', label: 'Tests completos', href: '/tests/' + id, c: '#ef4444' },
                  { icon: '🔬', label: 'SICAT completo', href: '/eco', c: '#06b6d4' },
                  { icon: '📈', label: 'Análisis de carga', href: '/carga', c: '#3b82f6' },
                ].map(({ icon, label, href, c }) => (
                  <button key={label} onClick={() => router.push(href)}
                    className="tp-tile flex items-center gap-3 p-3 rounded-2xl border border-white/[0.075] bg-white/[0.02] text-left"
                    style={{ ['--c' as any]: c }}>
                    <span className="tp-chip w-[34px] h-[34px] text-base flex-shrink-0" style={{ ['--c' as any]: c }}>{icon}</span>
                    <span className="text-[12.5px] font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA SESIONES */}
        {pestana === 'entreno' && (
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
                  <button key={s.id} onClick={() => router.push('/sesion/' + s.id)}
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

            <button onClick={() => router.push('/planificacion-visual/' + id + '/calendario')}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl text-sm transition">
              🗓 Ver calendario completo →
            </button>
          </div>
        )}
        {/* PESTAÑA CARGA POR DISCIPLINA */}
        {pestana === 'entreno' && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="font-bold text-orange-400 mb-1">📊 Carga por disciplina</h3>
              <p className="text-gray-500 text-xs mb-4">ATL · CTL · TSB individual por natación, ciclismo, carrera y fuerza · Detecta desequilibrios entre deportes</p>
              <CargaPorDisciplina depId={Number(id)} diasRango={56} />
            </div>
          </div>
        )}

        {/* PESTAÑA ADHERENCIA */}
        {pestana === 'entreno' && (
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

        {pestana === 'anamnesis' && (
          <div className="flex flex-col gap-6">
            {!anamnesis && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-white font-bold mb-1">Anamnesis pendiente</p>
                <p className="text-gray-400 text-sm">El deportista aún no ha completado su ficha inicial.</p>
              </div>
            )}
            {anamnesis && anamnesis.estado === 'borrador' && (
              <div className="bg-yellow-950 border border-yellow-700 rounded-xl p-4 flex items-center gap-3">
                <span className="text-yellow-400 text-xl">⏳</span>
                <p className="text-yellow-300 text-sm">El deportista tiene la anamnesis en borrador — aún no la ha enviado.</p>
              </div>
            )}
            {anamnesis && [anamnesis.salud_cardiaca, anamnesis.salud_familia_infarto, anamnesis.salud_tension_alta, anamnesis.salud_diabetes, anamnesis.salud_asma, anamnesis.salud_medicacion, anamnesis.salud_alergia, anamnesis.salud_razon_medica].some(v => v === true) && (
              <div className="bg-orange-950 border border-orange-600 rounded-xl p-4">
                <p className="text-orange-300 font-bold text-sm">⚠️ Alertas de salud</p>
                <p className="text-orange-400 text-xs mt-1">Este deportista ha indicado antecedentes médicos. Revisa su ficha antes de planificar.</p>
              </div>
            )}
            {anamnesis && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* S1 */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Datos personales</p>
                  {[
                    ['Nombre', anamnesis.nombre_completo],
                    ['F. nacimiento', anamnesis.fecha_nacimiento],
                    ['Sexo', anamnesis.sexo],
                    ['Peso', anamnesis.peso ? anamnesis.peso + ' kg' : null],
                    ['Talla', anamnesis.talla ? anamnesis.talla + ' cm' : null],
                    ['Contacto emergencia', anamnesis.contacto_emergencia_nombre],
                    ['Tel. emergencia', anamnesis.contacto_emergencia_telefono],
                  ].map(([k, v]) => v ? (
                    <div key={k as string} className="flex justify-between py-1.5 border-b border-gray-800 last:border-0">
                      <span className="text-gray-500 text-sm">{k}</span>
                      <span className="text-white text-sm">{v as string}</span>
                    </div>
                  ) : null)}
                </div>
                {/* S4 */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Perfil deportivo</p>
                  {[
                    ['Años triatlón', anamnesis.anios_triatlon],
                    ['Distancias', anamnesis.distancias_completadas?.join(', ')],
                    ['Nivel', anamnesis.nivel_competitivo],
                    ['Disciplina fuerte', anamnesis.disciplina_fuerte],
                    ['Disciplina débil', anamnesis.disciplina_debil],
                    ['Volumen semanal', anamnesis.volumen_semanal],
                    ['Días/semana', anamnesis.dias_semana],
                  ].map(([k, v]) => v ? (
                    <div key={k as string} className="flex justify-between py-1.5 border-b border-gray-800 last:border-0">
                      <span className="text-gray-500 text-sm">{k}</span>
                      <span className="text-white text-sm">{v as string}</span>
                    </div>
                  ) : null)}
                </div>
                {/* S5 */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Parámetros de rendimiento</p>
                  {[
                    ['FC máxima', anamnesis.fc_maxima ? anamnesis.fc_maxima + ' ppm' : null],
                    ['FC reposo', anamnesis.fc_reposo ? anamnesis.fc_reposo + ' ppm' : null],
                    ['FTP', anamnesis.ftp ? anamnesis.ftp + ' W' : null],
                    ['CSS', anamnesis.css],
                    ['Ritmo umbral', anamnesis.ritmo_umbral],
                    ['Potenciómetro', anamnesis.tiene_potenciometro === true ? 'Sí' : anamnesis.tiene_potenciometro === false ? 'No' : null],
                    ['Pulsómetro/GPS', anamnesis.usa_pulsometro === true ? 'Sí' : anamnesis.usa_pulsometro === false ? 'No' : null],
                    ['HRV', anamnesis.mide_hrv === true ? ('Sí' + (anamnesis.hrv_dispositivo ? ' — ' + anamnesis.hrv_dispositivo : '')) : anamnesis.mide_hrv === false ? 'No' : null],
                  ].map(([k, v]) => v ? (
                    <div key={k as string} className="flex justify-between py-1.5 border-b border-gray-800 last:border-0">
                      <span className="text-gray-500 text-sm">{k}</span>
                      <span className="text-white text-sm">{v as string}</span>
                    </div>
                  ) : null)}
                  {!anamnesis.fc_maxima && !anamnesis.ftp && !anamnesis.css && (
                    <p className="text-gray-600 text-sm">Sin parámetros registrados — completar tras los primeros tests.</p>
                  )}
                </div>
                {/* S7 */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Objetivos</p>
                  {[
                    ['Prueba objetivo', anamnesis.prueba_objetivo],
                    ['Fecha prueba', anamnesis.prueba_fecha],
                    ['Distancia', anamnesis.prueba_distancia],
                    ['Objetivo', anamnesis.objetivo_principal],
                  ].map(([k, v]) => v ? (
                    <div key={k as string} className="flex justify-between py-1.5 border-b border-gray-800 last:border-0">
                      <span className="text-gray-500 text-sm">{k}</span>
                      <span className="text-white text-sm">{v as string}</span>
                    </div>
                  ) : null)}
                  {anamnesis.motivacion && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <p className="text-gray-500 text-xs mb-1">Motivación</p>
                      <p className="text-gray-300 text-sm">{anamnesis.motivacion}</p>
                    </div>
                  )}
                  {anamnesis.mensaje_entrenador && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <p className="text-gray-500 text-xs mb-1">Mensaje al entrenador</p>
                      <p className="text-orange-300 text-sm italic">"{anamnesis.mensaje_entrenador}"</p>
                    </div>
                  )}
                </div>
                {/* S2 salud */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 md:col-span-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Salud (PAR-Q)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Cardíaca/cardiovascular', anamnesis.salud_cardiaca, anamnesis.salud_cardiaca_detalle],
                      ['Historia familiar infarto', anamnesis.salud_familia_infarto, null],
                      ['Tensión alta', anamnesis.salud_tension_alta, null],
                      ['Diabetes', anamnesis.salud_diabetes, anamnesis.salud_diabetes_tipo],
                      ['Asma/respiratorio', anamnesis.salud_asma, anamnesis.salud_asma_detalle],
                      ['Medicación habitual', anamnesis.salud_medicacion, anamnesis.salud_medicacion_detalle],
                      ['Alergias', anamnesis.salud_alergia, anamnesis.salud_alergia_detalle],
                      ['Razón médica ejercicio', anamnesis.salud_razon_medica, anamnesis.salud_razon_medica_detalle],
                    ].map(([label, val, det]) => (
                      <div key={label as string} className={'flex items-start gap-2 p-2 rounded-lg ' + (val === true ? 'bg-orange-950 border border-orange-800' : 'bg-gray-800')}>
                        <span className={val === true ? 'text-orange-400' : 'text-gray-600'}>{val === true ? '⚠️' : '✓'}</span>
                        <div>
                          <p className="text-xs text-gray-400">{label as string}</p>
                          <p className={val === true ? 'text-orange-300 text-xs font-medium' : 'text-gray-600 text-xs'}>{val === true ? 'Sí' + (det ? ' — ' + det : '') : val === false ? 'No' : '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* S3 lesiones */}
                {anamnesis.lesiones_recientes && (
                  <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 md:col-span-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Historial de lesiones</p>
                    {anamnesis.lesiones_lista?.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {anamnesis.lesiones_lista.map((l: any, i: number) => (
                          <div key={i} className="flex items-center gap-4 bg-gray-800 rounded-lg px-4 py-2 text-sm">
                            <span className="text-white font-medium">{l.zona}</span>
                            <span className="text-gray-400">{l.tipo}</span>
                            <span className="text-gray-500">{l.anio}</span>
                            <span className={l.recuperado === 'Sí' ? 'text-green-400' : l.recuperado === 'Parcialmente' ? 'text-yellow-400' : 'text-red-400'}>{l.recuperado}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-600 text-sm">No especificó lesiones detalladas.</p>}
                    {anamnesis.lesiones_dolor_cronico && <p className="text-orange-300 text-sm mt-3">⚠️ Dolor crónico: {anamnesis.lesiones_dolor_cronico_detalle}</p>}
                  </div>
                )}
                {/* S6 hábitos */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Hábitos de vida</p>
                  {[
                    ['Sueño', anamnesis.horas_sueno],
                    ['Actividad diaria', anamnesis.actividad_diaria],
                    ['Estrés', anamnesis.nivel_estres],
                    ['Dieta', anamnesis.dieta],
                  ].map(([k, v]) => v ? (
                    <div key={k as string} className="flex justify-between py-1.5 border-b border-gray-800 last:border-0">
                      <span className="text-gray-500 text-sm">{k}</span>
                      <span className="text-white text-sm">{v as string}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal edición */}
      {editando && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
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
