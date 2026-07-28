'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import TareasTabla from './tareas-tabla'
import ResumenBrick from '@/components/ResumenBrick'
import PanelPlantillas from '@/components/PanelPlantillas'
import { bloquesDesdeTareas, zonaPico, guardarPropia } from '@/lib/plantillas-propias'
import { ordenarTareasQuery, moverItem, persistirOrden } from '@/lib/tareas-orden'
import { cargaZona } from '@/lib/zonas'

const EMOJI_POST: Record<string, string> = { Natacion: '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️' }
import DatosReales from './DatosReales'
import SessionLoadChart from '@/components/SessionLoadChart'
import { calcularDuracionEstimada } from '@/lib/duracion'
import { ZONAS_FUERZA, ZONAS_RESISTENCIA, zonaResistencia, prescripcion } from '@/lib/zonas'
import { sugerirNutricion } from '@/lib/nutricion'
import { recomendarRecuperacion } from '@/lib/recuperacion'
import { tablaMedicion, valorCanonico, detectarMedicion, guardarMedicion, type UnidadMedicion } from '@/lib/medicion'

export default function PaginaSesion({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  const [sesion, setSesion] = useState<any>(null)
  // 'Brick' es la etiqueta de la sesión; el deporte real lo pone cada bloque (tarea).
  const esBrick = sesion?.disciplina === 'Brick'
  // Fuerza a TareasTabla a releer de la BD tras aplicar una plantilla (carga sus
  // tareas al montar, así que cambiarle la key es lo que la refresca).
  const [recargaTareas, setRecargaTareas] = useState(0)
  const [tareas, setTareas] = useState<any[]>([])
  const [deportistaId, setDeportistaId] = useState<number | null>(null)
  const [sistemaZonas, setSistemaZonas] = useState(1)
  const [esDeportista, setEsDeportista] = useState(false)
  // Plantillas: solo las monta el entrenador, y solo mientras la sesión no esté hecha
  // (aplicarlas reescribe las tareas). Fuerza y Brick no tienen: la fuerza va por
  // cualidades y un brick se monta con su constructor.
  const mostrarPlantillas = !esDeportista && sesion?.estado !== 'Realizada'
    && ['Natacion', 'Ciclismo', 'Carrera'].includes(sesion?.disciplina)
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [refrescarPropias, setRefrescarPropias] = useState(0)

  // Guarda las tareas de ESTA sesión como una plantilla reutilizable del entrenador.
  // Solo se lleva el molde (zona, series, volumen, descanso): ni RPE, ni fechas, ni
  // nada del atleta.
  const guardarComoPlantilla = async () => {
    // Se leen de la BD, no del estado: la tabla de tareas escribe por su cuenta y
    // aunque ahora avisa (onTareasCambian), guardar una plantilla incompleta es
    // silencioso y difícil de detectar. Aquí la fuente de verdad es la base de datos.
    const { data: frescas } = await supabase.from('tarea')
      .select('orden, zona_entrenamiento, series, descanso_segundos, p_duracion(tiempo_planeado), p_distancia(metros_planeados)')
      .eq('id_sesion', id).order('orden')
    const bloques = bloquesDesdeTareas(frescas || [])
    if (!bloques.length) {
      alert('Esta sesión no tiene tareas con zona y volumen: no hay nada que guardar como plantilla.')
      return
    }
    const nombre = prompt('Nombre de la plantilla:', 'Sesión de ' + cargaZona(zonaPico(bloques)).nombre.toLowerCase())
    if (!nombre?.trim()) return
    setGuardandoPlantilla(true)
    const err = await guardarPropia(supabase, {
      nombre: nombre.trim(),
      disciplina: sesion.disciplina,
      objetivo: sesion.notas_entrenador || null,
      bloques,
    })
    setGuardandoPlantilla(false)
    if (err) { alert('No se ha podido guardar la plantilla.\n\n' + err); return }
    setRefrescarPropias(n => n + 1)
    alert('Plantilla «' + nombre.trim() + '» guardada. La tienes en el panel, en «Propias».')
  }
  const [vistaTabla, setVistaTabla] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarPostSesion, setMostrarPostSesion] = useState(false)
  const [zona, setZona] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [series, setSeries] = useState('')
  const [descanso, setDescanso] = useState('')
  const [comentario, setComentario] = useState('')
  const [tipoMedicion, setTipoMedicion] = useState('')
  const [metros, setMetros] = useState('')
  const [tiempo, setTiempo] = useState('')
  const [tiempoDisplay, setTiempoDisplay] = useState('')
  const [repeticiones, setRepeticiones] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ritmoManual, setRitmoManual] = useState('')
  const [ritmoSugerido, setRitmoSugerido] = useState('')
  const [testsData, setTestsData] = useState<any>(null)
  const [tareaEditando, setTareaEditando] = useState<any>(null)
  const [editZona, setEditZona] = useState('')
  const [editSeries, setEditSeries] = useState('')
  const [editDescanso, setEditDescanso] = useState('')
  const [editMedTipo, setEditMedTipo] = useState<UnidadMedicion>('')
  const [editMedValor, setEditMedValor] = useState('')
  const [editComentario, setEditComentario] = useState('')
  const [cronometroActivo, setCronometroActivo] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [sesionIniciada, setSesionIniciada] = useState(false)
  const intervalRef = useRef<any>(null)
  const [rpeReal, setRpeReal] = useState(5)
  const [fcMedia, setFcMedia] = useState('')
  const [sensacionTecnica, setSensacionTecnica] = useState(3)
  const [dolorMuscular, setDolorMuscular] = useState(1)
  const [notasPost, setNotasPost] = useState('')
  const [hrvDia, setHrvDia] = useState('')
  // Feedback POR BLOQUE de un brick: el esfuerzo y la técnica cambian entre la bici y
  // la carrera, y el SICAT necesita saber de cuál viene el coste. El dolor, la HRV y
  // las notas siguen siendo del día: no se pueden atribuir a un deporte concreto.
  const [postBloques, setPostBloques] = useState<Record<number, { rpe: number; fc: string; sensacion: number }>>({})
  const [ejerciciosBiblioteca, setEjerciciosBiblioteca] = useState<any[]>([])
  const [grupoMuscularSel, setGrupoMuscularSel] = useState('')
  const [tipoSerie, setTipoSerie] = useState('Normal')
  const [grupoMuscular2, setGrupoMuscular2] = useState('')
  const [ejercicioSel2, setEjercicioSel2] = useState<any>(null)
  const [escalonDrop, setEscalonDrop] = useState('')
  const [ejercicioSel, setEjercicioSel] = useState<any>(null)
  const [repsFuerza, setRepsFuerza] = useState('')
  const [seriesFuerza, setSeriesFuerza] = useState('')
  const [descansoFuerza, setDescansoFuerza] = useState('')
  const [rir, setRir] = useState('')
  const [configSerie, setConfigSerie] = useState('')
  const [modalVideoFuerza, setModalVideoFuerza] = useState<string | null>(null)
  const [editandoDuracion, setEditandoDuracion] = useState(false)
  // Arrastrar tareas para reordenarlas. `dragIdx` = la que se arrastra; `sobreIdx` =
  // dónde caería, para pintar la guía. El orden se persiste en tarea.orden.
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [sobreIdx, setSobreIdx] = useState<number | null>(null)

  const reordenarTareas = async (from: number, to: number) => {
    const nuevo = moverItem(tareas, from, to)
    if (nuevo === tareas) return
    setTareas(nuevo)   // optimista: se ve al instante, se persiste detrás
    await persistirOrden(supabase, nuevo)
  }
  const [duracionManualInput, setDuracionManualInput] = useState('')
  const [pesoDeportista, setPesoDeportista] = useState<number | null>(null)
  const [otraSesionHoy, setOtraSesionHoy] = useState(false)
  const [diasHastaComp, setDiasHastaComp] = useState<number | null>(null)
  const [mostrarNutricion, setMostrarNutricion] = useState(false)
  const [nutrCarboGh, setNutrCarboGh] = useState('')
  const [nutrAguaMlh, setNutrAguaMlh] = useState('')
  const [nutrSodioMgh, setNutrSodioMgh] = useState('')
  const [nutrCafeinaMg, setNutrCafeinaMg] = useState('')
  const [nutrCafeinaTiming, setNutrCafeinaTiming] = useState('')
  const [nutrAyuno, setNutrAyuno] = useState(false)
  const [nutrNotas, setNutrNotas] = useState('')
  // Cálculo de ritmo/potencia sugerido por zona
  const VAM_ZONAS: Record<string, number> = { Z1: 0.525, Z2: 0.65, Z3: 0.75, Z4: 0.85, Z5: 0.95, Z6: 1.075, Z7: 1.2 }
  const FTP_ZONAS: Record<string, number> = { Z1: 0.50, Z2: 0.65, Z3: 0.83, Z4: 0.98, Z5: 1.13, Z6: 1.30, Z7: 1.50 }
  const CSS_ZONAS: Record<string, number> = { Z1: 0.65, Z2: 0.75, Z3: 0.85, Z4: 0.95, Z5: 1.03, Z6: 1.12, Z7: 1.20 }

  const calcularRitmo = (zonaKey: string, disc: string, tests: any): string => {
    if (!zonaKey || !disc || !tests) return ''
    // Zonas 2 (resistencia): el catálogo calcula ritmo/vatios/CSS reales de la zona.
    const zr = zonaResistencia(zonaKey)
    if (zr) { const p = prescripcion(zr, disc, tests); return p && p !== '—' ? p : '' }
    // Sistema clásico Z1–Z7.
    const z = zonaKey.toUpperCase()
    if (disc === 'Carrera' && tests.vam) {
      const pct = VAM_ZONAS[z]
      if (!pct) return ''
      const velocidad = tests.vam * pct // km/h
      const ritmoSeg = 3600 / velocidad // seg/km
      const min = Math.floor(ritmoSeg / 60)
      const seg = Math.round(ritmoSeg % 60)
      return min + ':' + String(seg).padStart(2, '0') + ' min/km'
    }
    if (disc === 'Ciclismo' && tests.ftp) {
      const pct = FTP_ZONAS[z]
      if (!pct) return ''
      return Math.round(tests.ftp * pct) + ' W'
    }
    if ((disc === 'Natacion' || disc === 'Natación') && tests.css) {
      const pct = CSS_ZONAS[z]
      if (!pct) return ''
      const velocidad = tests.css * pct // m/s
      const ritmoSeg = 100 / velocidad // seg/100m
      const min = Math.floor(ritmoSeg / 60)
      const seg = Math.round(ritmoSeg % 60)
      return min + ':' + String(seg).padStart(2, '0') + ' min/100m'
    }
    return ''
  }

  const mmssASegundos = (str: string): number => {
    const partes = str.split(':')
    if (partes.length === 2) {
      const min = parseInt(partes[0]) || 0
      const seg = parseInt(partes[1]) || 0
      return min * 60 + seg
    }
    return parseInt(str) || 0
  }

  const formatearMmss = (str: string): string => {
    const limpio = str.replace(/[^0-9:]/g, '')
    if (limpio.includes(':')) return limpio
    if (limpio.length >= 3) {
      const min = limpio.slice(0, -2)
      const seg = limpio.slice(-2)
      return min + ':' + seg
    }
    return limpio
  }

  const mostrarMedicion = (t: any): string => {
    if (t.p_duracion?.[0]?.tiempo_planeado) {
      const seg = t.p_duracion[0].tiempo_planeado
      const min = Math.floor(seg / 60)
      const s = seg % 60
      return s > 0 ? min + ':' + String(s).padStart(2,'0') + ' min' : min + ' min'
    }
    if (t.p_distancia?.[0]?.metros_planeados) {
      const m = t.p_distancia[0].metros_planeados
      return m >= 1000 ? (m/1000).toFixed(1) + ' km' : m + ' m'
    }
    if (t.p_repeticiones?.[0]?.repeticiones_planteadas) {
      return t.p_repeticiones[0].repeticiones_planteadas + ' reps'
    }
    return ''
  }

  useEffect(() => { cargarDatos() }, [id])

  useEffect(() => {
    if (zona && disciplina && testsData) {
      const sugerido = calcularRitmo(zona, disciplina, testsData)
      setRitmoSugerido(sugerido)
    } else {
      setRitmoSugerido('')
    }
  }, [zona, disciplina, testsData])
  useEffect(() => {
    supabase.from('ejercicios_biblioteca').select('*').order('grupo_muscular').order('nombre').then(({ data }) => {
      setEjerciciosBiblioteca(data || [])
    })
  }, [])

  useEffect(() => {
    if (cronometroActivo) {
      intervalRef.current = setInterval(() => setSegundos(s => s + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [cronometroActivo])

  const cargarDatos = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
      setEsDeportista(p?.rol === 'deportista')
    }
    const { data: ses } = await supabase.from('sesion').select('*').eq('id', id).single()
    setSesion(ses)
    const { data: tar } = await ordenarTareasQuery(
      supabase.from('tarea').select('*, p_duracion(*), p_distancia(*), p_repeticiones(*), ejercicios(repeticiones)').eq('id_sesion', id))
    setTareas(tar || [])
    if (ses) {
      let depIdLocal: number | null = ses.id_deportista ?? null
      const { data: micro } = await supabase.from('microciclo').select('id_mesociclo').eq('id', ses.id_microciclo).single()
      if (micro) {
        const { data: meso } = await supabase.from('mesociclo').select('id_macrociclo').eq('id', micro.id_mesociclo).single()
        if (meso) {
          const { data: macro } = await supabase.from('macrociclo').select('id_deportista').eq('id', meso.id_macrociclo).single()
          if (macro) {
            depIdLocal = macro.id_deportista

            // Contexto de recuperación: otras sesiones hoy + días hasta la próxima competición.
            // Se recorre toda la cadena meso→micro del deportista (una vez).
            const { data: mesos } = await supabase.from('mesociclo').select('id').eq('id_macrociclo', meso.id_macrociclo)
            const mesoIds = (mesos || []).map(m => m.id)
            if (mesoIds.length) {
              const { data: micros } = await supabase.from('microciclo').select('id, tipo, fecha_inicio').in('id_mesociclo', mesoIds)
              const microIds = (micros || []).map(m => m.id)

              // Días hasta la próxima competición (semana marcada como 'Competición')
              const fSes = new Date(ses.fecha_sesion)
              let dias: number | null = null
              for (const mi of micros || []) {
                if (mi.tipo === 'Competición' && mi.fecha_inicio) {
                  const d = Math.round((new Date(mi.fecha_inicio).getTime() - fSes.getTime()) / 86400000)
                  if (d >= 0 && (dias === null || d < dias)) dias = d
                }
              }
              setDiasHastaComp(dias)

              // ¿Otra sesión el mismo día (no cancelada)?
              if (microIds.length) {
                const { data: mismasFecha } = await supabase.from('sesion')
                  .select('id, estado').in('id_microciclo', microIds).eq('fecha_sesion', ses.fecha_sesion)
                const otra = (mismasFecha || []).some(s => s.id !== Number(id) && s.estado !== 'Cancelada')
                setOtraSesionHoy(otra)
              }
            }
          }
        }
      }
      // Tests del deportista (VAM/CSS/FTP) + peso. Por depIdLocal: cadena macro o
      // sesión libre por id_deportista → los ritmos sugeridos salen también en libres.
      if (depIdLocal) {
        setDeportistaId(depIdLocal)
        const [t1, t2, t3, an, dep] = await Promise.all([
          supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', depIdLocal).order('fecha', { ascending: false }).limit(1),
          supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', depIdLocal).order('fecha', { ascending: false }).limit(1),
          supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', depIdLocal).order('fecha', { ascending: false }).limit(1),
          supabase.from('anamnesis').select('peso').eq('id_deportista', depIdLocal).maybeSingle(),
          // El modo simple/compleja de resistencia solo se ofrece con Zonas 2.
          supabase.from('deportista').select('sistema_zonas').eq('id', depIdLocal).maybeSingle(),
        ])
        setSistemaZonas(dep.data?.sistema_zonas || 1)
        setTestsData({ vam: t1.data?.[0]?.vam || null, css: t2.data?.[0]?.css || null, ftp: t3.data?.[0]?.ftp || null })
        setPesoDeportista(an.data?.peso || null)
      }
    }
  }

  const formatTiempo = (seg: number) => {
    const h = Math.floor(seg/3600)
    const m = Math.floor((seg%3600)/60)
    const s = seg%60
    if (h > 0) return h+':'+m.toString().padStart(2,'0')+':'+s.toString().padStart(2,'0')
    return m.toString().padStart(2,'0')+':'+s.toString().padStart(2,'0')
  }

  const iniciarSesion = async () => {
    setSesionIniciada(true)
    if (sesion.usar_cronometro) setCronometroActivo(true)
    await supabase.from('sesion').update({ hora_inicio: new Date().toISOString() }).eq('id', id)
  }

  const finalizarSesion = () => {
    setCronometroActivo(false)
    if (esBrick) {
      setPostBloques(Object.fromEntries(tareas.map(t => [t.id, {
        rpe: t.rpe_reportado || 5,
        fc: t.fc_media ? String(t.fc_media) : '',
        sensacion: t.sensacion_tecnica || 3,
      }])))
    }
    setMostrarPostSesion(true)
  }

  const guardarPostSesion = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const duracionReal = sesion.usar_cronometro ? Math.round(segundos/60) : null
    await supabase.from('sesion').update({ estado: 'Realizada', duracion_real: duracionReal }).eq('id', id)

    // Lo que es del DÍA va igual en todos los bloques; el SICAT lo lee así.
    const delDia = {
      dolor_muscular: dolorMuscular,
      notas_post: notasPost,
      hrv_del_dia: hrvDia ? Number(hrvDia) : null,
    }

    if (esBrick) {
      // Cada bloque guarda SU esfuerzo: es lo que permite al SICAT saber si el coste
      // vino de la bici o de la carrera (ver lib/sicat).
      await Promise.all(tareas.map(t => {
        const b = postBloques[t.id]
        return supabase.from('tarea').update({
          ...delDia,
          rpe_reportado: b?.rpe ?? rpeReal,
          fc_media: b?.fc ? Number(b.fc) : null,
          sensacion_tecnica: b?.sensacion ?? sensacionTecnica,
        }).eq('id', t.id)
      }))
    } else {
      await supabase.from('tarea').update({
        ...delDia,
        rpe_reportado: rpeReal,
        fc_media: fcMedia ? Number(fcMedia) : null,
        sensacion_tecnica: sensacionTecnica,
      }).eq('id_sesion', id)
    }
    await cargarDatos()
    setMostrarPostSesion(false)
    setLoading(false)
    if (esDeportista) router.push('/dashboard-deportista')
  }

  const borrarTarea = async (tareaId: number) => {
    if (!confirm('¿Borrar esta tarea?')) return
    await supabase.from('p_distancia').delete().eq('id_tarea', tareaId)
    await supabase.from('p_duracion').delete().eq('id_tarea', tareaId)
    await supabase.from('p_repeticiones').delete().eq('id_tarea', tareaId)
    await supabase.from('ejercicios').delete().eq('id_tarea', tareaId)
    await supabase.from('tarea').delete().eq('id', tareaId)
    setTareas(prev => prev.filter(t => t.id !== tareaId))
  }

  const abrirEditarTarea = (t: any) => {
    setTareaEditando(t)
    setEditZona(t.zona_entrenamiento || '')
    setEditSeries(t.series || '')
    setEditDescanso(t.descanso_segundos || '')
    setEditComentario(t.comentario || '')
    const med = detectarMedicion(t)
    setEditMedTipo(med.tipo)
    setEditMedValor(med.valor)
  }

  const guardarEditarTarea = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await supabase.from('tarea').update({
      zona_entrenamiento: editZona || null,
      series: editSeries ? Number(editSeries) : null,
      descanso_segundos: editDescanso ? Number(editDescanso) : null,
      comentario: editComentario || null,
    }).eq('id', tareaEditando.id)
    await guardarMedicion(supabase, tareaEditando, editMedTipo, editMedValor)
    // La medición cambia filas anidadas; recargar es más simple y fiable que
    // reconstruir el estado a mano.
    await cargarDatos()
    setTareaEditando(null)
    setLoading(false)
  }

  const crearTareaFuerza = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ejercicioSel) return
    setLoading(true)
    setError('')
    const orden = tareas.length + 1
    const { data: tarea, error: errorTarea } = await supabase.from('tarea').insert({
      id_sesion: Number(id),
      zona_entrenamiento: null,
      disciplina: 'Fuerza',
      series: seriesFuerza ? Number(seriesFuerza) : null,
      descanso_segundos: descansoFuerza ? Number(descansoFuerza) : null,
      comentario: configSerie || null,
      orden
    }).select().single()
    if (errorTarea) { setError('Error: ' + errorTarea.message); setLoading(false); return }
    if (tarea) {
      const ejBib2 = ejercicioSel2
      const { error: errorEjercicio } = await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre: ejercicioSel.nombre,
        tipo_serie: tipoSerie,
        ejercicio_encadenado_nombre: ejBib2?.nombre || null,
        ejercicio_encadenado_id: ejBib2?.id || null,
        escalones_drop: escalonDrop || null,
        grupo_muscular: ejercicioSel.grupo_muscular,
        series: seriesFuerza ? Number(seriesFuerza) : null,
        repeticiones: repsFuerza ? Number(repsFuerza) : null,
        descanso_segundos: descansoFuerza ? Number(descansoFuerza) : null,
        notas_ejecucion: (rir ? 'RIR: ' + rir : '') + (configSerie ? ' · ' + configSerie : ''),
        url_video: ejercicioSel.url_video || null
      })
      if (errorEjercicio) { setError('Error al guardar ejercicio: ' + errorEjercicio.message); setLoading(false); return }
    }
    const tareaLocal = {
      ...tarea,
      p_duracion: [],
      p_distancia: [],
      p_repeticiones: repsFuerza ? [{ repeticiones_planteadas: Number(repsFuerza) }] : [],
    }
    setTareas(prev => [...prev, tareaLocal])
    setGrupoMuscularSel(''); setEjercicioSel(null); setRepsFuerza(''); setTipoSerie('Normal'); setGrupoMuscular2(''); setEjercicioSel2(null); setEscalonDrop('')
    setSeriesFuerza(''); setDescansoFuerza(''); setRir(''); setConfigSerie('')
    setMostrarForm(false)
    setLoading(false)
  }

  const crearTarea = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const orden = tareas.length + 1
    const { data: tarea, error: errorTarea } = await supabase.from('tarea').insert({
      id_sesion: Number(id),
      zona_entrenamiento: zona,
      disciplina: disciplina || null,
      series: series ? Number(series) : null,
      descanso_segundos: descanso ? Number(descanso) : null,
      comentario,
      orden
    }).select().single()
    if (errorTarea) { setError('Error: ' + errorTarea.message); setLoading(false); return }
    // La unidad elegida define la tabla y el valor canónico (metros / segundos / reps).
    const _u = tipoMedicion as UnidadMedicion
    const _tabla = tablaMedicion(_u)
    const _valorInput = (_u === 'm' || _u === 'km') ? metros : (_u === 'seg' || _u === 'min') ? tiempo : _u === 'mmss' ? tiempoDisplay : repeticiones
    const _valorC = valorCanonico(_u, _valorInput)
    if (_tabla === 'p_distancia' && tarea) await supabase.from('p_distancia').insert({ id_tarea: tarea.id, metros_planeados: _valorC, ritmo_objetivo: ritmoManual || ritmoSugerido || null })
    else if (_tabla === 'p_duracion' && tarea) await supabase.from('p_duracion').insert({ id_tarea: tarea.id, tiempo_planeado: _valorC })
    else if (_tabla === 'p_repeticiones' && tarea) await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: _valorC })
    setZona(''); setDisciplina(''); setSeries(''); setDescanso(''); setComentario(''); setRitmoManual(''); setRitmoSugerido('')
    setTipoMedicion(''); setMetros(''); setTiempo(''); setTiempoDisplay(''); setRepeticiones('')
    setMostrarForm(false)
    const tareaLocal = {
      ...tarea,
      p_duracion: _tabla === 'p_duracion' ? [{ tiempo_planeado: _valorC }] : [],
      p_distancia: _tabla === 'p_distancia' ? [{ metros_planeados: _valorC }] : [],
      p_repeticiones: _tabla === 'p_repeticiones' ? [{ repeticiones_planteadas: _valorC }] : [],
    }
    setTareas(prev => { const next = [...prev, tareaLocal]; console.log("tareas actualizadas:", next.length); return next; })
    setLoading(false)
  }

  const colorDisciplina = (d: string) => {
    if (!d) return 'bg-gray-700 text-gray-300'
    if (d.includes('Nat')) return 'bg-blue-900 text-blue-300'
    if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
    if (d === 'Carrera') return 'bg-green-900 text-green-300'
    if (d === 'Fuerza') return 'bg-red-900 text-red-300'
    return 'bg-purple-900 text-purple-300'
  }

  const guardarDuracionManual = async () => {
    const val = duracionManualInput ? Number(duracionManualInput) : null
    await supabase.from('sesion').update({ duracion_minutos: val }).eq('id', id)
    setSesion((prev: any) => ({ ...prev, duracion_minutos: val }))
    setEditandoDuracion(false)
  }

  const volverAEstimado = async () => {
    await supabase.from('sesion').update({ duracion_minutos: null }).eq('id', id)
    setSesion((prev: any) => ({ ...prev, duracion_minutos: null }))
    setDuracionManualInput('')
    setEditandoDuracion(false)
  }

  const actualizarFuerza = async (patch: any) => {
    await supabase.from('sesion').update(patch).eq('id', id)
    setSesion((prev: any) => ({ ...prev, ...patch }))
  }

  const nutricionGuardada = (s: any) =>
    s.nutricion_carbo_gh != null || s.nutricion_agua_mlh != null || s.nutricion_sodio_mgh != null ||
    s.nutricion_cafeina_mg != null || s.nutricion_ayuno === true || !!s.nutricion_notas

  const abrirNutricion = () => {
    if (nutricionGuardada(sesion)) {
      setNutrCarboGh(sesion.nutricion_carbo_gh?.toString() || '')
      setNutrAguaMlh(sesion.nutricion_agua_mlh?.toString() || '')
      setNutrSodioMgh(sesion.nutricion_sodio_mgh?.toString() || '')
      setNutrCafeinaMg(sesion.nutricion_cafeina_mg?.toString() || '')
      setNutrCafeinaTiming(sesion.nutricion_cafeina_timing || '')
      setNutrAyuno(!!sesion.nutricion_ayuno)
      setNutrNotas(sesion.nutricion_notas || '')
    } else {
      const s = sugerirNutricion(tareas, testsData || {}, sesion.disciplina, pesoDeportista)
      setNutrCarboGh(s.carboGh?.toString() || '')
      setNutrAguaMlh(s.aguaMlh?.toString() || '')
      setNutrSodioMgh(s.sodioMgh?.toString() || '')
      setNutrCafeinaMg(s.cafeinaMg?.toString() || '')
      setNutrCafeinaTiming(s.cafeinaTiming || '')
      setNutrAyuno(false)
      setNutrNotas(s.notas || '')
    }
    setError('')
    setMostrarNutricion(true)
  }

  const guardarNutricion = async () => {
    const patch = {
      nutricion_carbo_gh: nutrCarboGh ? Number(nutrCarboGh) : null,
      nutricion_agua_mlh: nutrAguaMlh ? Number(nutrAguaMlh) : null,
      nutricion_sodio_mgh: nutrSodioMgh ? Number(nutrSodioMgh) : null,
      nutricion_cafeina_mg: nutrCafeinaMg ? Number(nutrCafeinaMg) : null,
      nutricion_cafeina_timing: nutrCafeinaTiming || null,
      nutricion_ayuno: nutrAyuno,
      nutricion_notas: nutrNotas || null,
    }
    const { data, error: errNutricion } = await supabase.from('sesion').update(patch).eq('id', id).select().single()
    if (errNutricion) {
      setError('Error al guardar nutrición: ' + errNutricion.message)
      return
    }
    setSesion((prev: any) => ({ ...prev, ...data }))
    setError('')
    setMostrarNutricion(false)
  }

  if (!sesion) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  const durEstimada = calcularDuracionEstimada(tareas, testsData || {})

  // Recomendación de recuperación (en vivo, solo para sesiones completadas)
  const rpeReportado = tareas.reduce((max: number | null, t: any) =>
    t.rpe_reportado != null ? Math.max(max ?? 0, t.rpe_reportado) : max, null as number | null)
  const durRecup = sesion.duracion_real || sesion.duracion_minutos || durEstimada.minutos || 0
  const recup = sesion.estado === 'Realizada' && sesion.disciplina !== 'Fuerza'
    ? recomendarRecuperacion({
        duracionMin: durRecup,
        rpeReal: rpeReportado,
        disciplina: sesion.disciplina,
        ayuno: !!sesion.nutricion_ayuno,
        pesoKg: pesoDeportista,
        otraSesionHoy,
        diasHastaComp,
      })
    : null

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <div className="flex items-center gap-3"><button onClick={() => router.push('/planificacion-visual/' + deportistaId + '/calendario')} className="text-gray-400 hover:text-white text-sm transition">← Calendario</button></div>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className={'text-xs px-2 py-1 rounded-full font-medium ' + colorDisciplina(sesion.disciplina)}>{sesion.disciplina}</span>
            <span className={'text-xs px-2 py-1 rounded-full ' + (sesion.estado === 'Realizada' ? 'bg-green-900 text-green-300' : sesion.estado === 'Cancelada' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300')}>{sesion.estado}</span>
            {sesion.usar_cronometro && <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">⏱ Cronometro</span>}
          </div>
          <h2 className="text-2xl font-bold">{sesion.fecha_sesion}</h2>
          <div className="flex items-center gap-2 text-sm mt-1 flex-wrap">
            <span className="text-gray-400">Duración:</span>
            {editandoDuracion ? (
              <span className="flex items-center gap-1.5">
                <input type="number" autoFocus value={duracionManualInput} onChange={e => setDuracionManualInput(e.target.value)}
                  placeholder="min" className="bg-gray-800 text-white w-20 px-2 py-1 rounded outline-none focus:ring-1 focus:ring-orange-500" />
                <span className="text-gray-500 text-xs">min</span>
                <button onClick={guardarDuracionManual} className="text-orange-400 hover:text-orange-300 text-xs px-1.5 py-1 rounded bg-gray-800">Guardar</button>
                <button onClick={() => setEditandoDuracion(false)} className="text-gray-500 hover:text-white text-xs px-1">Cancelar</button>
              </span>
            ) : (
              <>
                {sesion.duracion_minutos ? (
                  <span className="text-white font-medium">{sesion.duracion_minutos} min <span className="text-gray-500 text-xs font-normal">(manual)</span></span>
                ) : durEstimada.estimable ? (
                  <span className="text-white font-medium">~{durEstimada.minutos} min <span className="text-gray-500 text-xs font-normal">(estimada)</span></span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
                {!esDeportista && (
                  <button onClick={() => { setDuracionManualInput(sesion.duracion_minutos || ''); setEditandoDuracion(true) }}
                    className="text-gray-500 hover:text-orange-400 text-xs" title="Ajustar a mano">✏️</button>
                )}
                {!esDeportista && sesion.duracion_minutos && (
                  <button onClick={volverAEstimado} className="text-gray-500 hover:text-blue-400 text-xs" title="Volver a estimado">↺ estimar</button>
                )}
              </>
            )}
            <span className="text-gray-600">·</span>
            <span className="text-gray-400">RPE est: {sesion.rpe_estimado || '—'}</span>
          </div>
          {!sesion.duracion_minutos && durEstimada.avisoCiclismo && (
            <p className="text-yellow-500/80 text-xs mt-1">⚠️ Hay tareas de ciclismo por distancia — la duración no se puede estimar (usa tiempo/potencia o ponla a mano).</p>
          )}
          {!sesion.duracion_minutos && durEstimada.faltanTests && (
            <p className="text-yellow-500/80 text-xs mt-1">⚠️ Faltan tests del deportista para estimar el ritmo de algunas tareas.</p>
          )}
          {sesion.notas_entrenador && <p className="text-gray-300 text-sm mt-2 italic bg-gray-800 rounded-lg px-3 py-2">"{sesion.notas_entrenador}"</p>}

          {!esDeportista && (
            <button onClick={abrirNutricion} className="mt-3 text-xs bg-gray-800 hover:bg-gray-700 text-orange-400 px-3 py-1.5 rounded-lg transition">
              🍽 {nutricionGuardada(sesion) ? 'Editar nutrición' : 'Sugerir nutrición'}
            </button>
          )}

          {nutricionGuardada(sesion) && (
            <div className="mt-3 bg-gray-800 rounded-lg px-3 py-2 flex flex-col gap-1">
              <div className="flex items-center gap-3 flex-wrap text-xs text-gray-300">
                {sesion.nutricion_carbo_gh != null && <span>🥤 {sesion.nutricion_carbo_gh} g/h carbohidrato</span>}
                {sesion.nutricion_agua_mlh != null && <span>💧 {sesion.nutricion_agua_mlh} ml/h</span>}
                {sesion.nutricion_sodio_mgh != null && <span>🧂 {sesion.nutricion_sodio_mgh} mg/h sodio</span>}
                {sesion.nutricion_cafeina_mg != null && <span>☕ {sesion.nutricion_cafeina_mg} mg{sesion.nutricion_cafeina_timing ? ' — ' + sesion.nutricion_cafeina_timing : ''}</span>}
                {sesion.nutricion_ayuno && <span className="text-yellow-400">🌙 En ayunas</span>}
              </div>
              {sesion.nutricion_notas && <p className="text-gray-400 text-xs italic">{sesion.nutricion_notas}</p>}
            </div>
          )}
        </div>

        {sesion.estado !== 'Realizada' && esDeportista && (
          <div className="mb-6 flex flex-col gap-3">
            <button onClick={() => router.push('/sesion/' + id + '/ejecutar')}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition">
              ▶ Modo entreno
            </button>
            {!sesionIniciada ? (
              <button onClick={iniciarSesion} className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-medium text-sm transition">Ver sesión completa</button>
            ) : (
              <div className="bg-gray-900 rounded-xl p-6 border border-green-500">
                {sesion.usar_cronometro && (
                  <div className="text-center mb-4">
                    <p className="text-gray-400 text-sm mb-1">Tiempo transcurrido</p>
                    <p className="text-5xl font-bold text-green-400 font-mono">{formatTiempo(segundos)}</p>
                  </div>
                )}
                <button onClick={finalizarSesion} className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg transition">✓ Finalizar sesion</button>
              </div>
            )}
          </div>
        )}

        {sesion.estado === 'Realizada' && (
          <div className="mb-6">
            <div className="bg-green-900 border border-green-500 rounded-xl p-4 mb-4 text-center">
              <p className="text-green-300 font-bold">✓ Sesion completada</p>
              {sesion.duracion_real && <p className="text-green-400 text-sm">{sesion.duracion_real} min realizados</p>}
            </div>

            {recup && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🍽</span>
                  <h3 className="text-white font-bold text-sm">{recup.titulo}</h3>
                </div>
                <p className="text-gray-300 text-sm mb-2">{recup.mensaje}</p>
                {(recup.carboG != null || recup.proteinaG != null) && (
                  <div className="flex gap-3 flex-wrap text-xs mb-2">
                    {recup.carboG != null && <span className="bg-gray-800 rounded-lg px-2.5 py-1 text-gray-200">🥤 ~{recup.carboG} g carbohidrato</span>}
                    {recup.proteinaG != null && <span className="bg-gray-800 rounded-lg px-2.5 py-1 text-gray-200">🍗 ~{recup.proteinaG} g proteína</span>}
                  </div>
                )}
                {recup.ejemplos && <p className="text-gray-400 text-xs mb-1">{recup.ejemplos}</p>}
                {recup.hidratacion && <p className="text-gray-400 text-xs mb-1">💧 {recup.hidratacion}</p>}
                {recup.extra.map((e, i) => (
                  <p key={i} className="text-yellow-400/90 text-xs mt-1.5">⚠️ {e}</p>
                ))}
              </div>
            )}

            <DatosReales sesionId={Number(id)} disciplina={sesion.disciplina} />
          </div>
        )}

        {mostrarPostSesion && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className={'bg-gray-900 rounded-xl p-6 w-full border border-orange-500 max-h-screen overflow-y-auto ' + (esBrick ? 'max-w-lg' : 'max-w-md')}>
              <h3 className="text-xl font-bold mb-4">Post-sesion — Como fue?</h3>
              {sesion.usar_cronometro && <p className="text-green-400 text-sm mb-4">Duracion: {formatTiempo(segundos)} ({Math.round(segundos/60)} min)</p>}
              <form onSubmit={guardarPostSesion} className="flex flex-col gap-4">
                {/* En un brick, el esfuerzo y la técnica se preguntan POR BLOQUE: correr
                    después de la bici no se parece en nada a la bici, y si se mezclan en
                    un solo número el SICAT no puede saber qué deporte le cuesta. */}
                {esBrick ? (
                  <div className="bg-purple-900/20 border border-purple-800/50 rounded-xl p-4 flex flex-col gap-3">
                    <p className="text-purple-300 text-sm font-semibold">🔀 Cómo fue cada parte del brick</p>
                    {tareas.map((t, i) => {
                      const b = postBloques[t.id] || { rpe: 5, fc: '', sensacion: 3 }
                      const set = (campo: 'rpe' | 'fc' | 'sensacion', v: any) =>
                        setPostBloques(p => ({ ...p, [t.id]: { ...b, [campo]: v } }))
                      return (
                        <div key={t.id} className="bg-gray-800 rounded-lg p-3 flex flex-col gap-2.5">
                          <p className="text-white text-xs font-bold">
                            {EMOJI_POST[t.disciplina] || ''} {i + 1} · {t.disciplina || '—'}
                            {t.zona_entrenamiento && <span className="text-gray-500 font-medium ml-1.5">{t.zona_entrenamiento}</span>}
                          </p>
                          <div>
                            <div className="flex justify-between mb-1"><label className="text-gray-400 text-xs">RPE real</label><span className="text-orange-400 font-bold text-xs">{b.rpe}/10</span></div>
                            <input type="range" min={1} max={10} value={b.rpe} onChange={e => set('rpe', Number(e.target.value))} className="w-full accent-orange-500" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1"><label className="text-gray-400 text-xs">Sensacion tecnica</label><span className="text-orange-400 font-bold text-xs">{b.sensacion}/5</span></div>
                            <input type="range" min={1} max={5} value={b.sensacion} onChange={e => set('sensacion', Number(e.target.value))} className="w-full accent-orange-500" />
                          </div>
                          <input type="number" placeholder="FC media (ppm) — opcional" value={b.fc} onChange={e => set('fc', e.target.value)}
                            className="bg-gray-900 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <>
                    <div className="bg-gray-800 rounded-xl p-4">
                      <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">RPE real</label><span className="text-orange-400 font-bold">{rpeReal}/10</span></div>
                      <input type="range" min={1} max={10} value={rpeReal} onChange={e => setRpeReal(Number(e.target.value))} className="w-full accent-orange-500" />
                      <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Muy facil</span><span>Maximo</span></div>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4">
                      <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">Sensacion tecnica</label><span className="text-orange-400 font-bold">{sensacionTecnica}/5</span></div>
                      <input type="range" min={1} max={5} value={sensacionTecnica} onChange={e => setSensacionTecnica(Number(e.target.value))} className="w-full accent-orange-500" />
                      <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Muy mala</span><span>Excelente</span></div>
                    </div>
                  </>
                )}
                {/* Del DÍA: no se pueden repartir entre deportes. */}
                <div className="bg-gray-800 rounded-xl p-4">
                  <div className="flex justify-between mb-2"><label className="text-white font-medium text-sm">Dolor muscular</label><span className="text-orange-400 font-bold">{dolorMuscular}/5</span></div>
                  <input type="range" min={1} max={5} value={dolorMuscular} onChange={e => setDolorMuscular(Number(e.target.value))} className="w-full accent-orange-500" />
                  <div className="flex justify-between text-gray-500 text-xs mt-1"><span>Sin dolor</span><span>Mucho</span></div>
                </div>
                {!esBrick && <input type="number" placeholder="FC media (ppm) — opcional" value={fcMedia} onChange={e => setFcMedia(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
                <input type="number" placeholder="HRV del dia (ms) — opcional" value={hrvDia} onChange={e => setHrvDia(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Notas (opcional)" value={notasPost} onChange={e => setNotasPost(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={3} />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-bold transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar y finalizar'}</button>
              </form>
            </div>
          </div>
        )}

        {mostrarNutricion && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl p-6 w-full max-w-lg border border-orange-500 max-h-screen overflow-y-auto">
              <h3 className="text-xl font-bold mb-1">🍽 Nutrición para esta sesión</h3>
              <p className="text-gray-500 text-xs mb-4">Sugerencia automática según duración, zona y disciplina — ajusta lo que no te convenza.</p>
              {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs">Carbohidrato (g/h)</span>
                    <input type="number" value={nutrCarboGh} onChange={e => setNutrCarboGh(e.target.value)} placeholder="—"
                      className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs">Agua (ml/h)</span>
                    <input type="number" value={nutrAguaMlh} onChange={e => setNutrAguaMlh(e.target.value)} placeholder="—"
                      className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs">Sodio (mg/h)</span>
                    <input type="number" value={nutrSodioMgh} onChange={e => setNutrSodioMgh(e.target.value)} placeholder="—"
                      className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs">Cafeína (mg)</span>
                    <input type="number" value={nutrCafeinaMg} onChange={e => setNutrCafeinaMg(e.target.value)} placeholder="—"
                      className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Cuándo tomar la cafeína</span>
                  <input type="text" value={nutrCafeinaTiming} onChange={e => setNutrCafeinaTiming(e.target.value)} placeholder="ej. 45-60 min antes"
                    className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={nutrAyuno} onChange={e => setNutrAyuno(e.target.checked)} className="accent-orange-500" />
                  Recomendar hacer esta sesión en ayunas
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Notas</span>
                  <textarea value={nutrNotas} onChange={e => setNutrNotas(e.target.value)} rows={3}
                    className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </label>
                {!pesoDeportista && (
                  <p className="text-yellow-500/80 text-xs">⚠️ El deportista no tiene peso registrado en su anamnesis — no se pudo calcular la dosis de cafeína automáticamente.</p>
                )}
                <div className="flex gap-2">
                  <button onClick={guardarNutricion} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-bold transition">Guardar</button>
                  <button onClick={() => setMostrarNutricion(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg transition">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        

        {/* Columna izquierda: gráfica + tareas. El panel de plantillas es la columna
            derecha y arranca A LA ALTURA DE LA GRÁFICA — si el grid empezara más abajo,
            al aparecer la gráfica el panel se hundiría con la sección y dejaría medio
            lateral vacío. La fila se ensancha 21rem hacia la derecha (el contenedor es
            max-w-5xl centrado) para no encoger la zona de tareas. Por debajo de 1700px
            no cabe ese desbordamiento y el panel se apila debajo. */}
        <div className={mostrarPlantillas
          ? 'flex flex-col gap-4 min-[1700px]:grid min-[1700px]:grid-cols-[1fr_20rem] min-[1700px]:items-start min-[1700px]:w-[calc(100%+21rem)]'
          : ''}>
        <div className="min-w-0">

        <SessionLoadChart tareas={tareas} />

        {sesion.disciplina === 'Fuerza' && !esDeportista && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-gray-400 text-sm">Sesión de fuerza:</span>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
              {['simple', 'compleja'].map(m => (
                <button key={m} onClick={() => actualizarFuerza({ modo_fuerza: m, ...(m === 'compleja' ? { zona_fuerza: null } : {}) })}
                  className={'text-xs px-3 py-1.5 rounded-md transition capitalize ' + ((sesion.modo_fuerza || 'simple') === m ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>{m}</button>
              ))}
            </div>
            {(sesion.modo_fuerza || 'simple') === 'simple' ? (
              <select value={sesion.zona_fuerza || ''} onChange={e => actualizarFuerza({ zona_fuerza: e.target.value || null })}
                className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Zona de fuerza…</option>
                {ZONAS_FUERZA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
              </select>
            ) : (
              <span className="text-gray-500 text-xs">Cada tarea elige su cualidad</span>
            )}
          </div>
        )}

        {/* Mismo control para resistencia. Solo con Zonas 2. */}
        {sistemaZonas === 2 && ['Natacion', 'Ciclismo', 'Carrera'].includes(sesion.disciplina) && !esDeportista && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-gray-400 text-sm">Sesión de resistencia:</span>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
              {['simple', 'compleja'].map(m => (
                <button key={m} onClick={() => actualizarFuerza({ modo_resistencia: m, ...(m === 'compleja' ? { zona_resistencia: null } : {}) })}
                  className={'text-xs px-3 py-1.5 rounded-md transition capitalize ' + ((sesion.modo_resistencia || 'simple') === m ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>{m}</button>
              ))}
            </div>
            {(sesion.modo_resistencia || 'simple') === 'simple' ? (
              <select value={sesion.zona_resistencia || ''} onChange={e => actualizarFuerza({ zona_resistencia: e.target.value || null })}
                className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Zona de la sesión…</option>
                {ZONAS_RESISTENCIA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
              </select>
            ) : (
              <span className="text-gray-500 text-xs">Cada tarea elige su zona</span>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h3 className="text-xl font-bold">Tareas</h3>
          <div className="flex gap-2">
            {/* Guardar como plantilla: reutiliza esta misma pantalla como editor en
                vez de montar un módulo aparte (decidido con el usuario). */}
            {mostrarPlantillas && tareas.length > 0 && (
              <button onClick={guardarComoPlantilla} disabled={guardandoPlantilla}
                className="px-3 py-2 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition disabled:opacity-50">
                {guardandoPlantilla ? 'Guardando…' : '💾 Guardar como plantilla'}
              </button>
            )}
            <button onClick={() => setVistaTabla(false)} className={'px-3 py-2 rounded-lg text-sm transition ' + (!vistaTabla ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>📋 Formulario</button>
            <button onClick={() => setVistaTabla(true)} className={'px-3 py-2 rounded-lg text-sm transition ' + (vistaTabla ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>📊 Tabla</button>
          </div>
        </div>

        {/* Resumen del brick: las transiciones NO son tareas (no deben contar como
            carga de ninguna disciplina), así que no pueden salir en la tabla de abajo.
            Aquí es donde se ven, que para eso son un paso entrenable. */}
        {sesion.disciplina === 'Brick' && <ResumenBrick sesionId={Number(id)} transiciones={sesion.transiciones || []} editable={!esDeportista} depId={deportistaId} />}

        {vistaTabla && deportistaId ? (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 overflow-x-auto">
            <TareasTabla key={recargaTareas} sesionId={Number(id)} deportistaId={deportistaId} disciplinaSesion={sesion.disciplina} esDeportista={esDeportista} modoFuerza={sesion.modo_fuerza || 'simple'} zonaFuerza={sesion.zona_fuerza || ''} modoResistencia={sesion.modo_resistencia || 'simple'} zonaResistencia={sesion.zona_resistencia || ''} onTareasCambian={cargarDatos} />
          </div>
        ) : (
          <div>
            {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
            {sesion.estado !== 'Realizada' && !esDeportista && (
              <div className="mb-4">
                <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
                  {mostrarForm ? 'Cancelar' : '+ Nueva tarea'}
                </button>
              </div>
            )}
            {mostrarForm && !esDeportista && sesion.disciplina === 'Fuerza' && (
              <form onSubmit={crearTareaFuerza} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
                <h4 className="font-bold">Nuevo ejercicio de fuerza</h4>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Tipo de serie</label>
                  <select value={tipoSerie} onChange={e => { setTipoSerie(e.target.value); setGrupoMuscular2(''); setEjercicioSel2(null); setEscalonDrop('') }} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full">
                    <option value="Normal">Normal</option>
                    <option value="Superserie">Superserie</option>
                    <option value="Drop set">Drop set</option>
                    <option value="Complex">Complex</option>
                  </select>
                </div>
                <select value={grupoMuscularSel} onChange={e => { setGrupoMuscularSel(e.target.value); setEjercicioSel(null) }} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Grupo muscular</option>
                  {[...new Set(ejerciciosBiblioteca.map(e => e.grupo_muscular))].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {(tipoSerie === 'Superserie' || tipoSerie === 'Complex') && ejercicioSel && (
                  <div className="bg-gray-800 rounded-xl p-4 border border-orange-500/50">
                    <p className="text-orange-400 text-sm font-medium mb-3">+ Ejercicio encadenado</p>
                    <select value={grupoMuscular2} onChange={e => { setGrupoMuscular2(e.target.value); setEjercicioSel2(null) }} className="bg-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full mb-2">
                      <option value="">Grupo muscular</option>
                      {[...new Set(ejerciciosBiblioteca.map((e: any) => e.grupo_muscular))].map((g: any) => <option key={g as string} value={g as string}>{g as string}</option>)}
                    </select>
                    {grupoMuscular2 && (
                      <select value={ejercicioSel2?.id || ''} onChange={e => setEjercicioSel2(ejerciciosBiblioteca.find((ej: any) => ej.id === Number(e.target.value)) || null)} className="bg-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full">
                        <option value="">Selecciona ejercicio</option>
                        {ejerciciosBiblioteca.filter((ej: any) => ej.grupo_muscular === grupoMuscular2).map((ej: any) => <option key={ej.id} value={ej.id}>{ej.nombre}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {tipoSerie === 'Drop set' && ejercicioSel && (
                  <div className="bg-gray-800 rounded-xl p-4 border border-yellow-500/50">
                    <p className="text-yellow-400 text-sm font-medium mb-2">Escalones de peso (kg)</p>
                    <input type="text" placeholder="ej: 80, 60, 40" value={escalonDrop} onChange={e => setEscalonDrop(e.target.value)} className="bg-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                    <p className="text-gray-500 text-xs mt-1">Separa los pesos con comas</p>
                  </div>
                )}
                {grupoMuscularSel && (
                  <div>
                    <select value={ejercicioSel?.id || ''} onChange={e => setEjercicioSel(ejerciciosBiblioteca.find(ej => ej.id === Number(e.target.value)) || null)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required>
                      <option value="">Selecciona ejercicio</option>
                      {ejerciciosBiblioteca.filter(ej => ej.grupo_muscular === grupoMuscularSel).map(ej => <option key={ej.id} value={ej.id}>{ej.nombre}</option>)}
                    </select>
                    {ejercicioSel?.url_video && (
                      <button type="button" onClick={() => setModalVideoFuerza(ejercicioSel.url_video)} className="mt-2 flex items-center gap-2 text-red-400 hover:text-red-300 text-sm transition">
                        <span>▶</span> Ver video del ejercicio
                      </button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Series" value={seriesFuerza} onChange={e => setSeriesFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                  <input type="number" placeholder="Repeticiones" value={repsFuerza} onChange={e => setRepsFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Descanso (seg)" value={descansoFuerza} onChange={e => setDescansoFuerza(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  <input type="number" placeholder="RIR (0-4)" min="0" max="4" value={rir} onChange={e => setRir(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <input type="text" placeholder="Configuración de serie (ej: 4x8, pirámide, cluster...)" value={configSerie} onChange={e => setConfigSerie(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <button type="submit" disabled={loading || !ejercicioSel} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar ejercicio'}</button>
              </form>
            )}

            {mostrarForm && !esDeportista && sesion.disciplina !== 'Fuerza' && (
              <form onSubmit={crearTarea} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
                <h4 className="font-bold">Nueva tarea</h4>
                <input type="text" placeholder="Zona (ej: Z2, Z4)" value={zona} onChange={e => setZona(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <select value={disciplina} onChange={e => setDisciplina(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Disciplina (opcional)</option>
                  <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option>
                </select>
                <input type="number" placeholder="Series" value={series} onChange={e => setSeries(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <input type="number" placeholder="Descanso (seg)" value={descanso} onChange={e => setDescanso(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <select value={tipoMedicion} onChange={e => setTipoMedicion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Tipo de medición</option>
                  <optgroup label="Distancia">
                    <option value="m">Metros</option>
                    <option value="km">Kilómetros</option>
                  </optgroup>
                  <optgroup label="Tiempo">
                    <option value="seg">Segundos</option>
                    <option value="min">Minutos</option>
                    <option value="mmss">mm:ss</option>
                  </optgroup>
                  <option value="reps">Repeticiones</option>
                </select>
                {(tipoMedicion === 'm' || tipoMedicion === 'km') && <input type="number" placeholder={tipoMedicion === 'km' ? 'Kilómetros' : 'Metros'} value={metros} onChange={e => setMetros(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
                {(tipoMedicion === 'm' || tipoMedicion === 'km') && (
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      Ritmo objetivo
                      {ritmoSugerido && <span className="ml-2 text-orange-400">Sugerido: {ritmoSugerido}</span>}
                    </label>
                    <input type="text"
                      placeholder={ritmoSugerido || 'Ej: 4:30 min/km'}
                      value={ritmoManual}
                      onChange={e => setRitmoManual(e.target.value)}
                      className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                  </div>
                )}
                {(tipoMedicion === 'seg' || tipoMedicion === 'min' || tipoMedicion === 'mmss') && zona && disciplina && ritmoSugerido && (
                  <div className="bg-gray-800 rounded-lg px-4 py-3 flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Referencia {zona}</span>
                    <span className="text-orange-400 font-bold">{ritmoSugerido}</span>
                  </div>
                )}
                {(tipoMedicion === 'seg' || tipoMedicion === 'min') && <input type="number" placeholder={tipoMedicion === 'min' ? 'Minutos' : 'Segundos'} value={tiempo} onChange={e => setTiempo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
                {tipoMedicion === 'mmss' && (
                <div>
                  <input
                    type="text"
                    placeholder="Duración mm:ss (ej: 10:30)"
                    value={tiempoDisplay}
                    onChange={e => {
                      const val = formatearMmss(e.target.value)
                      setTiempoDisplay(val)
                      setTiempo(String(mmssASegundos(val)))
                    }}
                    className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full font-mono"
                    maxLength={6}
                  />
                  {tiempoDisplay && tiempoDisplay.includes(':') && (
                    <p className="text-gray-500 text-xs mt-1">{mmssASegundos(tiempoDisplay)} segundos</p>
                  )}
                </div>
              )}
                {tipoMedicion === 'reps' && <input type="number" placeholder="Repeticiones" value={repeticiones} onChange={e => setRepeticiones(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
                <textarea placeholder="Comentario" value={comentario} onChange={e => setComentario(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar tarea'}</button>
              </form>
            )}
            {tareas.length === 0 ? (
              <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">📋</div><p>No hay tareas todavia.</p></div>
            ) : (
              <div className="grid gap-3">
                {tareas.map((t, i) => (
                  <div key={t.id}
                    draggable={!esDeportista}
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={e => { e.preventDefault(); if (sobreIdx !== i) setSobreIdx(i) }}
                    onDragEnd={() => { setDragIdx(null); setSobreIdx(null) }}
                    onDrop={e => { e.preventDefault(); if (dragIdx !== null) reordenarTareas(dragIdx, i); setDragIdx(null); setSobreIdx(null) }}
                    className={'bg-gray-900 rounded-xl p-5 border transition ' +
                      (dragIdx === i ? 'border-orange-500/60 opacity-40 ' : 'border-gray-800 ') +
                      (sobreIdx === i && dragIdx !== null && dragIdx !== i ? 'ring-2 ring-orange-500/70 ' : '')}>
                    <div className="flex items-start gap-3">
                      {!esDeportista && (
                        <span className="text-gray-500 hover:text-orange-400 cursor-grab active:cursor-grabbing select-none flex-shrink-0 text-2xl leading-none -mt-0.5" title="Arrastra para reordenar">⠿</span>
                      )}
                      <span className="bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{i+1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {t.zona_entrenamiento && <span className="text-orange-400 font-bold text-sm">{t.zona_entrenamiento}</span>}
                            {t.disciplina && <span className={'text-xs px-2 py-0.5 rounded-full ' + colorDisciplina(t.disciplina)}>{t.disciplina}</span>}
                          </div>
                          {!esDeportista && (
                            <div className="flex gap-1">
                              <button onClick={() => abrirEditarTarea(t)} className="text-gray-500 hover:text-orange-400 text-xs px-2 py-1 rounded-lg hover:bg-gray-800 transition">✏️</button>
                              <button onClick={() => borrarTarea(t.id)} className="text-gray-500 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-gray-800 transition">🗑</button>
                            </div>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm">{t.series ? t.series+' series' : ''}{t.series && t.descanso_segundos ? ' · '+t.descanso_segundos+'s' : ''}</p>
                        {mostrarMedicion(t) && <p className="text-blue-400 text-sm font-medium">{mostrarMedicion(t)}</p>}
                        {t.comentario && <p className="text-gray-400 text-sm mt-1">{t.comentario}</p>}
                        {t.rpe_reportado && <p className="text-green-400 text-xs mt-2">✓ RPE: {t.rpe_reportado}/10 · Sensacion: {t.sensacion_tecnica}/5</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </div>{/* /columna izquierda: gráfica + tareas */}

        {mostrarPlantillas && (
          <PanelPlantillas
            sesionId={Number(id)}
            disciplina={sesion.disciplina}
            nTareas={tareas.length}
            refrescar={refrescarPropias}
            onAplicada={async () => { await cargarDatos(); setRecargaTareas(n => n + 1) }}
          />
        )}
        </div>{/* /fila gráfica+tareas | plantillas */}
      </div>
      {tareaEditando && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Editar tarea</h3>
              <button onClick={() => setTareaEditando(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <form onSubmit={guardarEditarTarea} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-gray-400 text-xs">Zona / intensidad</span>
                <input type="text" placeholder="Zona (ej: Z2, AEM)" value={editZona} onChange={e => setEditZona(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              </label>
              {/* Medición: el usuario pedía poder cambiar el tiempo/distancia, no solo
                  la zona. La unidad se puede cambiar (m↔km, seg↔min↔mm:ss). */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Medición</span>
                  <select value={editMedTipo} onChange={e => setEditMedTipo(e.target.value as UnidadMedicion)} className="bg-gray-800 text-white px-3 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Sin medición</option>
                    <optgroup label="Distancia"><option value="m">Metros</option><option value="km">Kilómetros</option></optgroup>
                    <optgroup label="Tiempo"><option value="seg">Segundos</option><option value="min">Minutos</option><option value="mmss">mm:ss</option></optgroup>
                    <option value="reps">Repeticiones</option>
                  </select>
                </label>
                {editMedTipo && (
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs">Valor {editMedTipo === 'mmss' ? '(mm:ss)' : ''}</span>
                    <input type={editMedTipo === 'mmss' ? 'text' : 'number'} placeholder={editMedTipo === 'mmss' ? '2:30' : ''} value={editMedValor} onChange={e => setEditMedValor(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Series</span>
                  <input type="number" placeholder="4" value={editSeries} onChange={e => setEditSeries(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Descanso (seg)</span>
                  <input type="number" placeholder="90" value={editDescanso} onChange={e => setEditDescanso(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </label>
              </div>
              <textarea placeholder="Comentario" value={editComentario} onChange={e => setEditComentario(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
              <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar cambios'}</button>
            </form>
          </div>
        </div>
      )}

      {modalVideoFuerza && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md border border-gray-700 p-6 text-center">
            <div className="flex justify-between items-center mb-4">
              <p className="font-medium">Video del ejercicio</p>
              <button onClick={() => setModalVideoFuerza(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="text-6xl mb-4">▶️</div>
            <a href={modalVideoFuerza} target="_blank" rel="noopener noreferrer"
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition inline-flex items-center gap-2">
              <span>▶</span> Ver en YouTube
            </a>
          </div>
        </div>
      )}
    </main>
  )
}
