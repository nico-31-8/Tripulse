'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, use } from 'react'
import { supabase } from '@/lib/supabase'
import { conVideosEnTareas } from '@/lib/video-ejercicio'
import { fechaLarga } from '@/lib/fechas'
import Cargando from '@/components/Cargando'
import { usuarioActual } from '@/lib/sesion'
import TareasTabla from './tareas-tabla'
import ResumenBrick from '@/components/ResumenBrick'
import PanelPlantillas from '@/components/PanelPlantillas'
import PanelSemana from '@/components/PanelSemana'
import ComoAmanecio from '@/components/ComoAmanecio'
import { bloquesDesdeTareas, zonaPico, guardarPropia } from '@/lib/plantillas-propias'
import { ordenarTareasQuery, moverItem, persistirOrden } from '@/lib/tareas-orden'
import { cargaZona } from '@/lib/zonas'

import DatosReales from './DatosReales'
import BriefingSesion from './BriefingSesion'

// Iniciales para el avatar. Sin nombre cargado, un guion antes que una letra falsa.
function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return '—'
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '—'
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase()
}
import SessionLoadChart from '@/components/SessionLoadChart'
import { calcularDuracionEstimada } from '@/lib/duracion'
import { ZONAS_FUERZA, ZONAS_RESISTENCIA, ritmoObjetivo } from '@/lib/zonas'
import BotonMovilidad from '@/components/BotonMovilidad'
import BuscadorEjercicios from '@/components/BuscadorEjercicios'
import { conTecnica, catalogoTecnica, filtrarDrills } from '@/lib/tecnica'
import { nombreDelGrupo } from '@/lib/grupos-emision'
import { sugerirNutricion } from '@/lib/nutricion'
import { recomendarRecuperacion } from '@/lib/recuperacion'
import { tablaMedicion, valorCanonico, detectarMedicion, guardarMedicion, type UnidadMedicion } from '@/lib/medicion'
import { intensidadGuardada, aGuardar } from '@/lib/intensidad-prescrita'
import { useDeclararModulo } from '@/lib/contexto-modulo'
import {
  posicionEnPlan, diasHastaCompeticion, microsDelPlan, hayOtraSesionEseDia,
} from '@/lib/contexto-sesion'
import { cargarReferencias } from '@/lib/referencia-zona'

export default function PaginaSesion({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  const [sesion, setSesion] = useState<any>(null)
  // Distingue "todavia no ha llegado" de "ha llegado vacio". Sin esto, una
  // fila que RLS deniega dejaba la pantalla en "Cargando..." para siempre.
  const [noExiste, setNoExiste] = useState(false)
  // Fuerza a TareasTabla a releer de la BD tras aplicar una plantilla (carga sus
  // tareas al montar, así que cambiarle la key es lo que la refresca).
  const [recargaTareas, setRecargaTareas] = useState(0)
  /* El puente entre el panel de la semana y el formulario de tareas. El panel no
     escribe en la base: manda las tareas aquí y la tabla las convierte en filas
     nuevas por rellenar. El `token` es un contador y no la propia lista porque
     copiar DOS VECES la misma tarea son dos objetos iguales: sin algo que
     cambie, el efecto de la tabla no volvería a dispararse y la segunda copia se
     perdería en silencio. */
  const [aCopiar, setACopiar] = useState<{ token: number; tareas: any[] } | null>(null)
  const contadorCopia = useRef(0)
  const pedirCopia = (tareas: any[]) => setACopiar({ token: ++contadorCopia.current, tareas })
  const [tareas, setTareas] = useState<any[]>([])
  const [deportistaId, setDeportistaId] = useState<number | null>(null)
  // De quién es la sesión y en qué punto del plan cae: la misma sesión significa una
  // cosa en semana de choque y otra en descarga.
  const [nombreDeportista, setNombreDeportista] = useState<string | null>(null)
  const [ciclo, setCiclo] = useState<{ meso: number | null; semana: number | null; tipo: string | null } | null>(null)

  // El sitio donde más se pregunta «¿esto está bien?», y era donde el asistente
  // llegaba a ciegas. El punto del ciclo va dentro a propósito: la misma sesión
  // significa una cosa en semana de choque y otra en descarga.
  useDeclararModulo('Sesión', sesion
    ? [
        `Editando «${sesion.nombre || 'sesión sin nombre'}» de ${sesion.disciplina}, ${sesion.fecha_sesion}, estado ${sesion.estado}.`,
        nombreDeportista ? `Es de ${nombreDeportista}.` : '',
        ciclo?.semana ? `Semana ${ciclo.semana}${ciclo.tipo ? ` (${ciclo.tipo})` : ''}${ciclo.meso ? ` del mesociclo ${ciclo.meso}` : ''}.` : '',
        tareas.length
          ? `${tareas.length} bloques: ${tareas.map((t: any) => t.zona_entrenamiento).filter(Boolean).join(', ')}.`
          : 'Todavía no tiene bloques.',
        sesion.rpe_estimado ? `RPE estimado ${sesion.rpe_estimado}.` : '',
      ].filter(Boolean).join(' ')
    : '')
  // Nutrición y notas arrancan plegadas: en el editor estorban delante de las tareas.
  const [abreNutricion, setAbreNutricion] = useState(false)
  const [abreNotas, setAbreNotas] = useState(false)
  const [sistemaZonas, setSistemaZonas] = useState(1)
  // Ya venía en cargarReferencias y se tiraba. El briefing la necesita: es el
  // respaldo del objetivo cuando al atleta le falta el test de la disciplina.
  const [fcMaxima, setFcMaxima] = useState(0)
  const [esDeportista, setEsDeportista] = useState(false)
  // Plantillas: solo las monta el entrenador, y solo mientras la sesión no esté hecha
  // (aplicarlas reescribe las tareas). Fuerza y Brick no tienen: la fuerza va por
  // cualidades y un brick se monta con su constructor.
  const mostrarPlantillas = sesion?.estado !== 'Realizada'
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
  // Con id, el formulario de abajo está EDITANDO esa tarea en vez de crear una.
  // Aquí vivía el estado de un modal de edición aparte, que tenía cuatro campos
  // frente a los doce del de crear.
  const [tareaEditandoId, setTareaEditandoId] = useState<number | null>(null)
  const [nombreGrupo, setNombreGrupo] = useState<string | null>(null)
  // La técnica se elige en el MISMO formulario que todo lo demás. Antes solo se
  // podía tocar desde el modal de edición, o sea que una tarea nacía sin técnica
  // y había que editarla justo después para ponérsela.
  const [tecnicaId, setTecnicaId] = useState('')
  const [drillsTecnica, setDrillsTecnica] = useState<any[]>([])
  // El cronómetro y el cuestionario post-sesión viven ahora en BriefingSesion: eran
  // del deportista y el entrenador nunca llegaba a ellos.
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
  // Su wellness, para «cómo amaneció después de esta sesión».
  const [wellness, setWellness] = useState<any[]>([])
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
  // Ritmo/potencia sugerido por zona. Las tablas y los dos sistemas viven en
  // lib/zonas (ritmoObjetivo): el briefing del deportista necesita lo mismo y no
  // tiene sentido mantener dos copias que puedan divergir.
  const calcularRitmo = (zonaKey: string, disc: string, tests: any): string =>
    ritmoObjetivo(zonaKey, disc, tests)

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

  /*
   * DE OCHO VIAJES A DOS.
   *
   * Esto era una cascada: perfiles → sesion → microciclo → mesociclo →
   * macrociclo → mesos → micros → sesiones del día, cada uno esperando al
   * anterior. A ~100 ms el viaje, casi un segundo de pantalla vacía antes de
   * pintar nada.
   *
   * Y TRES DE ESOS VIAJES NO HACÍAN FALTA. La cadena microciclo→mesociclo→
   * macrociclo estaba solo para averiguar de quién era la sesión, y
   * `sesion.id_deportista` ya viene en la primera consulta. No es que suela
   * estar: la política RLS de `sesion` es `id_deportista in
   * (select auth_dep_ids())`, así que una fila con ese campo a null no la ve
   * NADIE. Si la estamos leyendo, está.
   *
   * Los mesos y micros se traen enteros del deportista, de una vez, y el
   * acotado al macrociclo que toca se hace en memoria (lib/contexto-sesion).
   * Un atleta con dos temporadas sigue viendo «semana 2 de 4» de la suya.
   */
  const cargarDatos = async () => {
    // ---- Ronda 1: lo que no depende de nada ----
    const [user, { data: ses }, { data: tar }] = await Promise.all([
      usuarioActual(),
      supabase.from('sesion').select('*').eq('id', id).single(),
      // El nombre del ejercicio vive en `ejercicios`, no en la tarea: sin él,
      // una sesión de fuerza en el briefing diría «4 series» de nada.
      // `intensidad` y el control (tipo + valor) hacen falta para el briefing
      // del atleta: sin ellos leía «4 × 8 reps» y nada más — ni con cuánto peso
      // ni hasta dónde apretar. `notas_ejecucion` es el rescate del RIR de las
      // sesiones anteriores a que el control tuviera columnas propias.
      ordenarTareasQuery(
        supabase.from('tarea').select('*, p_duracion(*), p_distancia(*), p_repeticiones(*), ejercicios(repeticiones, nombre, tipo_serie, ejercicio_id, url_video, ejercicio_encadenado_nombre, ejercicio_encadenado_id, encadenado_series, encadenado_repeticiones, encadenado_intensidad, escalones_drop, grupo_muscular, intensidad, control_tipo, control_valor, notas_ejecucion)').eq('id_sesion', id)),
    ])

    setSesion(ses)
    if (!ses) { setNoExiste(true); return }
    setTareas(await conVideosEnTareas(await conTecnica(tar), supabase))
    // Sin id_emision no se pregunta nada: no cuesta ni una consulta en las
    // sesiones individuales, que son la mayoría.
    nombreDelGrupo(supabase, ses.id_emision).then(setNombreGrupo)

    let depId: number | null = ses.id_deportista ?? null

    /* Red de seguridad, no camino normal. Por RLS esto no debería darse nunca
       (ver arriba), pero si algún día una fila llegara sin `id_deportista` la
       ficha se quedaría sin tareas y sin ritmos, y en silencio. Cuesta tres
       consultas en un caso que no ocurre. */
    if (!depId && ses.id_microciclo) {
      const { data: mi } = await supabase.from('microciclo').select('id_mesociclo').eq('id', ses.id_microciclo).maybeSingle()
      const { data: me } = mi ? await supabase.from('mesociclo').select('id_macrociclo').eq('id', mi.id_mesociclo).maybeSingle() : { data: null }
      const { data: ma } = me ? await supabase.from('macrociclo').select('id_deportista').eq('id', me.id_macrociclo).maybeSingle() : { data: null }
      depId = ma?.id_deportista ?? null
    }

    if (!depId) {
      // Sin dueño no hay contexto que calcular ni tests que traer.
      if (user) {
        const { data: pf } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
        setEsDeportista(pf?.rol === 'deportista')
      }
      return
    }
    setDeportistaId(depId)

    // ---- Ronda 2: todo lo demás, a la vez ----
    const [pf, mesos, micros, mismoDia, refs, an, well] = await Promise.all([
      user ? supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('mesociclo').select('id, fecha_inicio, id_macrociclo').eq('id_deportista', depId),
      supabase.from('microciclo').select('id, fecha_inicio, tipo, id_mesociclo').eq('id_deportista', depId),
      /* Antes esto iba por los microciclos del plan. Ahora va por deportista y
         fecha, que además CAZA LAS SESIONES LIBRES: si el atleta se añadió una
         por su cuenta ese mismo día, antes no contaba y la recomendación de
         recuperación salía como si tuviera el día suelto. */
      supabase.from('sesion').select('id, estado')
        .eq('id_deportista', depId).eq('fecha_sesion', ses.fecha_sesion)
        .or('eliminada.is.null,eliminada.eq.false'),
      /* VAM/CSS/FTP, FC máxima, sistema de zonas y nombre salen de UNA función
         (lib/referencia-zona) y no de cinco consultas escritas aquí a mano. Las
         mismas cinco están también en la tabla de tareas: dos copias de las
         mismas consultas es como empiezan a divergir, y con la tabla de %VAM ya
         pasó — el mismo Z4 daba dos ritmos según por dónde entrases. */
      cargarReferencias(supabase, depId),
      supabase.from('anamnesis').select('peso').eq('id_deportista', depId).maybeSingle(),
      /* Su wellness, para poder decir cómo amaneció DESPUÉS de esta sesión.
         Se piden 60 registros y no solo el día siguiente porque hacen falta dos
         cosas distintas: el registro de después, y su historial para saber qué
         es normal en él. Un «fatiga 4» suelto no dice nada; dice mucho si su
         media es 2,5. */
      supabase.from('wellness').select('*').eq('id_deportista', depId)
        .order('fecha', { ascending: false }).limit(60),
    ])

    setEsDeportista((pf as any).data?.rol === 'deportista')
    setSistemaZonas(refs.sistema)
    setFcMaxima(refs.fcMax || 0)
    setNombreDeportista(refs.nombre)
    setTestsData({ vam: refs.tests.vam ?? null, css: refs.tests.css ?? null, ftp: refs.tests.ftp ?? null })
    setPesoDeportista(an.data?.peso || null)

    // El contexto del plan, ya sin consultas: lógica pura sobre las dos listas.
    const listaMesos = (mesos.data || []) as any[]
    const listaMicros = (micros.data || []) as any[]
    setCiclo(posicionEnPlan(ses.id_microciclo, listaMesos, listaMicros))
    setDiasHastaComp(diasHastaCompeticion(
      ses.fecha_sesion, microsDelPlan(ses.id_microciclo, listaMesos, listaMicros)))
    setOtraSesionHoy(hayOtraSesionEseDia(mismoDia.data || [], Number(id)))
    setWellness(well.data || [])
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

  /**
   * Editar baja la tarea al formulario de abajo, el mismo con el que se creó.
   *
   * Antes abría un modal con cuatro campos: en fuerza no se podía cambiar el
   * ejercicio, ni las repeticiones, ni el tipo de serie; en resistencia, ni la
   * disciplina ni el ritmo. Para tocar cualquiera de esas cosas había que borrar
   * la tarea y volver a escribirla entera.
   */
  const abrirEditarTarea = (t: any) => {
    setTareaEditandoId(t.id)
    setMostrarForm(true)
    setError('')
    if (sesion?.disciplina === 'Fuerza') {
      const ej = t.ejercicios?.[0]
      setGrupoMuscularSel(ej?.grupo_muscular || '')
      setEjercicioSel(ejerciciosBiblioteca.find(e => e.nombre === ej?.nombre) || null)
      setTipoSerie(ej?.tipo_serie || 'Normal')
      setSeriesFuerza(t.series != null ? String(t.series) : '')
      setRepsFuerza(ej?.repeticiones != null ? String(ej.repeticiones) : '')
      setDescansoFuerza(t.descanso_segundos != null ? String(t.descanso_segundos) : '')
      setRir(String(ej?.control_valor || '').replace(/\D/g, ''))
      setConfigSerie(t.comentario || '')
      const ej2 = ej?.ejercicio_encadenado_id
        ? ejerciciosBiblioteca.find(e => e.id === Number(ej.ejercicio_encadenado_id)) : null
      setGrupoMuscular2(ej2?.grupo_muscular || '')
      setEjercicioSel2(ej2 || null)
      setEscalonDrop(ej?.escalones_drop || '')
    } else {
      const med = detectarMedicion(t)
      setZona(t.zona_entrenamiento || '')
      setDisciplina(t.disciplina || '')
      setSeries(t.series != null ? String(t.series) : '')
      setDescanso(t.descanso_segundos != null ? String(t.descanso_segundos) : '')
      setComentario(t.comentario || '')
      setTipoMedicion(med.tipo)
      // El valor vive en una casilla u otra según la unidad, igual que al crear.
      setMetros(med.tipo === 'm' || med.tipo === 'km' ? med.valor : '')
      setTiempo(med.tipo === 'seg' || med.tipo === 'min' || med.tipo === 'mmss' ? med.valor : '')
      setTiempoDisplay(med.tipo === 'mmss' ? med.valor : '')
      setRepeticiones(med.tipo === 'reps' ? med.valor : '')
      // De las DOS tablas: leyendo solo p_distancia, abrir para editar un bloque
      // por tiempo traía la casilla vacía, y al guardar se borraba lo que había.
      setRitmoManual(intensidadGuardada(t) || '')
      setTecnicaId(t.tecnica_id ? String(t.tecnica_id) : '')
      if (!drillsTecnica.length) catalogoTecnica().then(setDrillsTecnica)
    }
  }

  /** Deja el formulario como estaba: ni crea ni cambia nada. */
  const cancelarEdicion = () => {
    setTareaEditandoId(null)
    setMostrarForm(false)
    setZona(''); setDisciplina(''); setSeries(''); setDescanso(''); setComentario('')
    setRitmoManual(''); setRitmoSugerido(''); setTipoMedicion(''); setTecnicaId('')
    setMetros(''); setTiempo(''); setTiempoDisplay(''); setRepeticiones('')
    setGrupoMuscularSel(''); setEjercicioSel(null); setRepsFuerza(''); setTipoSerie('Normal')
    setGrupoMuscular2(''); setEjercicioSel2(null); setEscalonDrop('')
    setSeriesFuerza(''); setDescansoFuerza(''); setRir(''); setConfigSerie('')
  }

  const crearTareaFuerza = async (e: React.FormEvent) => {
    e.preventDefault()
    // Crear exige ejercicio; editar no. Las tareas de fuerza que vienen de una
    // plantilla llevan el ejercicio en el comentario y no tienen fila propia en
    // `ejercicios`: exigirlo aquí impediría editarlas.
    if (!ejercicioSel && !tareaEditandoId) return
    setLoading(true)
    setError('')
    const orden = tareas.length + 1
    const campos = {
      disciplina: 'Fuerza',
      series: seriesFuerza ? Number(seriesFuerza) : null,
      descanso_segundos: descansoFuerza ? Number(descansoFuerza) : null,
      comentario: configSerie || null,
    }
    let tarea: any = null
    if (tareaEditandoId) {
      const { error } = await supabase.from('tarea').update(campos).eq('id', tareaEditandoId)
      if (error) { setError('Error: ' + error.message); setLoading(false); return }
      // El ejercicio se reescribe entero en vez de parchearse: es una fila con
      // doce columnas de las que la mitad dependen del tipo de serie, y
      // actualizar solo algunas deja mezclas imposibles (un drop set con los
      // escalones del superset anterior).
      if (ejercicioSel) {
        await supabase.from('ejercicios').delete().eq('id_tarea', tareaEditandoId)
        await supabase.from('p_repeticiones').delete().eq('id_tarea', tareaEditandoId)
      }
      tarea = { id: tareaEditandoId }
    } else {
      const { data, error: errorTarea } = await supabase.from('tarea').insert({
        id_sesion: Number(id), zona_entrenamiento: null, ...campos, orden,
      }).select().single()
      if (errorTarea) { setError('Error: ' + errorTarea.message); setLoading(false); return }
      tarea = data
    }
    // Sin ejercicio elegido (solo posible editando) se han tocado únicamente los
    // campos de la tarea: no hay nada que reescribir en `ejercicios`.
    if (tarea && ejercicioSel) {
      const ejBib2 = ejercicioSel2
      const { error: errorEjercicio } = await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        // El id de la biblioteca: el vídeo se resuelve con él al leer, no se copia.
        ejercicio_id: ejercicioSel.id,
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
    // Editando hay filas hijas que se han reescrito: releer es más fiable que
    // recomponer el estado a mano.
    if (tareaEditandoId) await cargarDatos()
    else setTareas(prev => [...prev, {
      ...tarea,
      p_duracion: [],
      p_distancia: [],
      p_repeticiones: repsFuerza ? [{ repeticiones_planteadas: Number(repsFuerza) }] : [],
    }])
    cancelarEdicion()
    setLoading(false)
  }

  const crearTarea = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const orden = tareas.length + 1
    const campos = {
      zona_entrenamiento: zona,
      disciplina: disciplina || null,
      series: series ? Number(series) : null,
      descanso_segundos: descanso ? Number(descanso) : null,
      comentario,
      tecnica_id: tecnicaId ? Number(tecnicaId) : null,
    }
    let tarea: any = null
    if (tareaEditandoId) {
      const { error } = await supabase.from('tarea').update(campos).eq('id', tareaEditandoId)
      if (error) { setError('Error: ' + error.message); setLoading(false); return }
      // Las tres tablas de medición: una tarea solo puede tener una, así que se
      // limpian todas antes de escribir. Cambiar de metros a minutos dejando la
      // vieja contaría el volumen dos veces sin que nada se queje.
      await supabase.from('p_distancia').delete().eq('id_tarea', tareaEditandoId)
      await supabase.from('p_duracion').delete().eq('id_tarea', tareaEditandoId)
      await supabase.from('p_repeticiones').delete().eq('id_tarea', tareaEditandoId)
      tarea = { id: tareaEditandoId }
    } else {
      const { data, error: errorTarea } = await supabase.from('tarea').insert({
        id_sesion: Number(id), ...campos, orden,
      }).select().single()
      if (errorTarea) { setError('Error: ' + errorTarea.message); setLoading(false); return }
      tarea = data
    }
    // La unidad elegida define la tabla y el valor canónico (metros / segundos / reps).
    const _u = tipoMedicion as UnidadMedicion
    const _tabla = tablaMedicion(_u)
    const _valorInput = (_u === 'm' || _u === 'km') ? metros : (_u === 'seg' || _u === 'min') ? tiempo : _u === 'mmss' ? tiempoDisplay : repeticiones
    const _valorC = valorCanonico(_u, _valorInput)
    /* El ritmo va en un segundo paso porque `ritmo_objetivo` es `numeric` y
       aquí se le mete TEXTO («4:30 min/km»). Dentro del insert, la fila entera
       se caía: la tarea quedaba SIN DISTANCIA, en silencio, y solo a los atletas
       que tienen el test hecho (sin test no hay ritmo sugerido y el insert
       pasaba). Ver supabase/ritmo-objetivo-a-texto.sql. */
    /* SOLO SE GUARDA LO QUE SE ESCRIBE. Aquí seguía la regla vieja
       —`ritmoManual || ritmoSugerido`—, que con la casilla vacía guardaba la
       sugerencia de la app: la columna acababa conteniendo o lo del entrenador
       o lo de la app sin forma de distinguirlo. La tabla ya se corrigió el 30 de
       agosto y esta vista se quedó atrás, que es cómo dos pantallas del mismo
       editor acaban guardando cosas distintas. */
    const _ritmo = aGuardar(ritmoManual)
    /* El mismo segundo paso que en la tabla: si fuera dentro del insert y la
       columna fallara, se caería la fila entera y la tarea quedaría sin
       distancia ni tiempo. Separado, lo peor que pasa es que no haya ritmo. */
    const _guardarRitmo = async (tablaR: 'p_distancia' | 'p_duracion', idFila: number) => {
      if (!_ritmo) return
      const { error } = await supabase.from(tablaR).update({ ritmo_objetivo: _ritmo }).eq('id', idFila)
      if (error) console.warn('[tripulse] ritmo_objetivo no se guardó en ' + tablaR + ':', error.message)
    }
    if (_tabla === 'p_distancia' && tarea) {
      const { data: pdNueva, error: errPd } = await supabase.from('p_distancia')
        .insert({ id_tarea: tarea.id, metros_planeados: _valorC }).select().single()
      if (errPd) { setError('Error al guardar la distancia: ' + errPd.message); setLoading(false); return }
      if (pdNueva) await _guardarRitmo('p_distancia', pdNueva.id)
    }
    else if (_tabla === 'p_duracion' && tarea) {
      /* Antes se insertaba el tiempo y la intensidad se tiraba: «30 min a
         140-150 ppm» le llegaba al atleta como «30 min». Ni siquiera había
         dónde escribirla —la casilla solo salía en bloques por distancia—. */
      const { data: puNueva, error: errPu } = await supabase.from('p_duracion')
        .insert({ id_tarea: tarea.id, tiempo_planeado: _valorC }).select().single()
      if (errPu) { setError('Error al guardar la duración: ' + errPu.message); setLoading(false); return }
      if (puNueva) await _guardarRitmo('p_duracion', puNueva.id)
    }
    else if (_tabla === 'p_repeticiones' && tarea) await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: _valorC })
    if (tareaEditandoId) await cargarDatos()
    else setTareas(prev => [...prev, {
      ...tarea,
      p_duracion: _tabla === 'p_duracion' ? [{ tiempo_planeado: _valorC }] : [],
      p_distancia: _tabla === 'p_distancia' ? [{ metros_planeados: _valorC }] : [],
      p_repeticiones: _tabla === 'p_repeticiones' ? [{ repeticiones_planteadas: _valorC }] : [],
    }])
    cancelarEdicion()
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

  if (!sesion) return <Cargando noExiste={noExiste} />

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

  // El deportista tiene su propia pantalla: qué le toca y cómo salir a hacerlo, sin
  // los controles del entrenador (que hoy veía apagados o a medias). Misma URL.
  if (esDeportista) {
    return (
      <BriefingSesion
        id={String(id)}
        sesion={sesion}
        tareas={tareas}
        tests={testsData}
        fcMax={fcMaxima}
        durEstimada={durEstimada}
        recup={recup}
        onCambio={cargarDatos}
      />
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-44 pr-5 h-[54px] flex justify-end items-center gap-4 border-b border-gray-800">
        {/* La puerta al modo de pie de pista. Solo tiene sentido con bloques ya
            montados: dirigir una sesión vacía no es dirigir nada. */}
        {tareas.length > 0 && (
          <button onClick={() => router.push('/sesion/' + id + '/dirigir')}
            title="Apuntar tiempos y notas mientras entrena, a pie de pista"
            className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-orange-500/45 bg-orange-500/12 text-orange-300 hover:bg-orange-500/20 transition">
            ⏱ Dirigir
          </button>
        )}
        <button onClick={() => router.push('/planificacion-visual/' + deportistaId + '/calendario')} className="text-gray-400 hover:text-white text-sm transition">← Calendario</button>
      </nav>
      {/* La ficha de sesión usa 1560px. A 1024 la tabla de tareas salía toda a 12px y
          apretada con media pantalla vacía a los lados. Antes esto era solo para
          fuerza porque la de resistencia era más estrecha; ahora las dos llevan la
          prescripción agrupada y piden lo mismo (medido: 1392px la de resistencia). */}
      <div className="mx-auto px-6 py-6 flex flex-col gap-3.5 max-w-[1560px]">

        {/* Cabecera-tira: de quién es, cuándo cae y en qué punto del plan. Antes ocupaba
            media pantalla y no decía ni el nombre del deportista. */}
        {/* `.tp-card` lleva overflow:hidden, así que lo que no cabe NO se ve y no
            deja rastro: ni scroll ni puntos suspensivos. En un móvil esta franja se
            cortaba 102px, o sea que el nombre del deportista y la fecha
            desaparecían sin más. Se apila. */}
        <div className="tp-card p-[14px_18px] flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* El nombre llega en una consulta posterior a la sesión. Mientras tanto se
              enseña la fecha como título en vez de un «Sesión» y unas iniciales falsas
              que parpadearían al cargar. */}
          {nombreDeportista && (
            <span className="w-[42px] h-[42px] rounded-xl flex-none grid place-items-center font-extrabold text-[14px] text-gray-950"
              style={{ background: 'linear-gradient(150deg,#fbbf24,#f97316)' }}>
              {iniciales(nombreDeportista)}
            </span>
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[16.5px] font-bold tracking-tight">
              {nombreDeportista || fechaLarga(sesion.fecha_sesion)}
            </span>
            <span className="text-[12px] text-gray-500 flex items-center gap-1.5 flex-wrap">
              {nombreDeportista ? fechaLarga(sesion.fecha_sesion) : ''}
              {ciclo?.meso && (
                <>
                  <span aria-hidden="true">·</span>
                  Meso {ciclo.meso}{ciclo.semana ? ' · Semana ' + ciclo.semana : ''}
                  {ciclo.tipo ? ' (' + ciclo.tipo + ')' : ''}
                </>
              )}
            </span>
          </div>

          {/* El separador solo tiene sentido cuando todo cabe en una línea. */}
          <div className="hidden sm:block flex-1" />

          <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap min-w-0 w-full sm:w-auto">
            {/* De dónde salió. Sin esto, al deportista le aparece un entrenamiento que
                no ha hablado con nadie y no tiene forma de saber por qué. */}
            {nombreGrupo && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30"
                title="Este entrenamiento se mandó al grupo entero">
                Grupo · {nombreGrupo}
              </span>
            )}
            <span className={'text-xs px-2.5 py-1 rounded-full font-medium ' + colorDisciplina(sesion.disciplina)}>{sesion.disciplina}</span>
            <span className={'text-xs px-2.5 py-1 rounded-full ' + (sesion.estado === 'Realizada' ? 'bg-green-900 text-green-300' : sesion.estado === 'Cancelada' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300')}>{sesion.estado}</span>
            {sesion.usar_cronometro && <span className="text-xs bg-blue-900 text-blue-300 px-2.5 py-1 rounded-full">⏱ Cronómetro</span>}

            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Duración</span>
              {editandoDuracion ? (
                <span className="flex items-center gap-1.5">
                  <input type="number" autoFocus value={duracionManualInput} onChange={e => setDuracionManualInput(e.target.value)}
                    placeholder="min" className="bg-gray-800 text-white w-16 px-2 py-0.5 rounded outline-none focus:ring-1 focus:ring-orange-500 text-sm" />
                  <button onClick={guardarDuracionManual} className="text-orange-400 hover:text-orange-300 text-xs px-1.5 py-0.5 rounded bg-gray-800">Guardar</button>
                  <button onClick={() => setEditandoDuracion(false)} className="text-gray-500 hover:text-white text-xs px-1">Cancelar</button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  {/* En una sesión hecha manda lo que duró de verdad: enseñar aquí la
                      estimación mientras abajo pone «18 min realizados» se contradice. */}
                  <span className="text-[14.5px] font-semibold tabular-nums">
                    {sesion.duracion_real ? sesion.duracion_real
                      : sesion.duracion_minutos ? sesion.duracion_minutos
                      : durEstimada.estimable ? '~' + durEstimada.minutos : '—'}
                    {(sesion.duracion_real || sesion.duracion_minutos || durEstimada.estimable) && (
                      <span className="text-[11px] font-normal text-gray-500">
                        {' min '}{sesion.duracion_real ? '(real)' : sesion.duracion_minutos ? '(manual)' : '(est.)'}
                      </span>
                    )}
                  </span>
                  <button onClick={() => { setDuracionManualInput(sesion.duracion_minutos || ''); setEditandoDuracion(true) }}
                    className="text-gray-500 hover:text-orange-400 text-xs" title="Ajustar a mano">✏️</button>
                  {sesion.duracion_minutos && (
                    <button onClick={volverAEstimado} className="text-gray-500 hover:text-blue-400 text-xs" title="Volver a estimado">↺</button>
                  )}
                </span>
              )}
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">RPE est.</span>
              <span className="text-[14.5px] font-semibold tabular-nums">{sesion.rpe_estimado || '—'}</span>
            </div>

            {/* La configuración de la sesión sube aquí: era una caja propia de 60px que
                solo llevaba un conmutador y un desplegable. */}
            {sesion.disciplina === 'Fuerza' && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
                  {['simple', 'compleja'].map(m => (
                    <button key={m} onClick={() => actualizarFuerza({ modo_fuerza: m, ...(m === 'compleja' ? { zona_fuerza: null } : {}) })}
                      className={'text-[11.5px] px-2.5 py-1 rounded-md transition capitalize ' + ((sesion.modo_fuerza || 'simple') === m ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>{m}</button>
                  ))}
                </div>
                {(sesion.modo_fuerza || 'simple') === 'simple' ? (
                  <select value={sesion.zona_fuerza || ''} onChange={e => actualizarFuerza({ zona_fuerza: e.target.value || null })}
                    className="bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700">
                    <option value="">Zona de fuerza…</option>
                    {ZONAS_FUERZA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                  </select>
                ) : (
                  <span className="text-gray-500 text-[11.5px]">Cada tarea elige su cualidad</span>
                )}
                {!esDeportista && (
                  <BotonMovilidad idSesion={Number(id)} ordenBase={tareas.length} onHecho={cargarDatos} />
                )}
              </div>
            )}
            {/* Mismo control para resistencia. Solo con Zonas 2. */}
            {sistemaZonas === 2 && ['Natacion', 'Ciclismo', 'Carrera'].includes(sesion.disciplina) && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
                  {['simple', 'compleja'].map(m => (
                    <button key={m} onClick={() => actualizarFuerza({ modo_resistencia: m, ...(m === 'compleja' ? { zona_resistencia: null } : {}) })}
                      className={'text-[11.5px] px-2.5 py-1 rounded-md transition capitalize ' + ((sesion.modo_resistencia || 'simple') === m ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>{m}</button>
                  ))}
                </div>
                {(sesion.modo_resistencia || 'simple') === 'simple' ? (
                  <select value={sesion.zona_resistencia || ''} onChange={e => actualizarFuerza({ zona_resistencia: e.target.value || null })}
                    className="bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700">
                    <option value="">Zona de la sesión…</option>
                    {ZONAS_RESISTENCIA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                  </select>
                ) : (
                  <span className="text-gray-500 text-[11.5px]">Cada tarea elige su zona</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Por qué no hay estimación. Sin esto, un «—» parece un fallo de la app. */}
        {!sesion.duracion_minutos && durEstimada.avisoCiclismo && (
          <p className="text-yellow-500/80 text-xs">⚠️ Hay tareas de ciclismo por distancia — la duración no se puede estimar (usa tiempo/potencia o ponla a mano).</p>
        )}
        {!sesion.duracion_minutos && durEstimada.faltanTests && (
          <p className="text-yellow-500/80 text-xs">⚠️ Faltan tests del deportista para estimar el ritmo de algunas tareas.</p>
        )}

        {sesion.estado === 'Realizada' && (
          <div className="flex flex-col gap-3.5">
            <div className="rounded-2xl border border-green-500/40 bg-green-500/[0.08] px-[18px] py-3 flex items-center gap-3.5 flex-wrap">
              <b className="text-green-400 text-sm">✓ Sesión completada</b>
              {sesion.duracion_real && <span className="text-[12.5px] text-gray-400">{sesion.duracion_real} min realizados</span>}
            </div>

            {/* Recuperación y planificado-vs-real, en paralelo: son las dos preguntas
                que se hace el entrenador al abrir una sesión ya hecha. */}
            <div className={recup ? 'grid lg:grid-cols-2 gap-3.5 items-start' : ''}>
              {recup && (
                <div className="tp-card p-[16px_18px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🍽</span>
                    <h3 className="text-white font-bold text-sm">{recup.titulo}</h3>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{recup.mensaje}</p>
                  {(recup.carboG != null || recup.proteinaG != null) && (
                    <div className="flex gap-2 flex-wrap text-xs mb-2">
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
            lateral vacío.
            La fila NO se desborda hacia la derecha. Lo hacía (21rem) para no encoger la
            zona de tareas, y con el contenedor a max-w-5xl colaba; con 1560 ya no: a
            1700px de pantalla el panel se iba 235px FUERA y la página entera cogía
            scroll lateral, así que abrías un panel que no podías ver. Ahora el panel
            vive dentro y con él abierto la tabla dispone de 1142px: se queda 250 corta
            y scrollea dentro de su tarjeta, que para eso lleva overflow-x-auto. */}
        <div className={mostrarPlantillas
          ? 'flex flex-col gap-4 min-[1700px]:grid min-[1700px]:grid-cols-[1fr_20rem] min-[1700px]:items-start'
          : ''}>
        <div className="min-w-0">

        {/* Qué le costó esta sesión, en el wellness del día siguiente. Va ANTES
            del panel de la semana porque es sobre ESTA sesión; la semana es
            contexto de alrededor. Se pinta solo si hay registros después, así
            que en una sesión futura no aparece. */}
        {!esDeportista && sesion.fecha_sesion && (
          <div className="mb-3.5">
            <ComoAmanecio fechaSesion={sesion.fecha_sesion} registros={wellness} />
          </div>
        )}

        {vistaTabla && deportistaId && !esDeportista && sesion.fecha_sesion && (
          <PanelSemana
            idDeportista={deportistaId}
            fechaSesion={String(sesion.fecha_sesion).slice(0, 10)}
            idSesionActual={Number(id)}
            disciplinaSesion={sesion.disciplina}
            onCopiar={pedirCopia} />
        )}

        <SessionLoadChart tareas={tareas} />

        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h3 className="text-xl font-bold">
            Tareas <span className="text-gray-500 font-normal text-base">· {tareas.length}</span>
          </h3>
          <div className="flex gap-2 items-center">
            {/* Guardar como plantilla: reutiliza esta misma pantalla como editor en
                vez de montar un módulo aparte (decidido con el usuario). */}
            {mostrarPlantillas && tareas.length > 0 && (
              <button onClick={guardarComoPlantilla} disabled={guardandoPlantilla}
                className="px-3 py-2 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition disabled:opacity-50">
                {guardandoPlantilla ? 'Guardando…' : '💾 Guardar como plantilla'}
              </button>
            )}
            {/* La Tabla es LA vista; el Formulario deja de competir con ella y queda
                como una salida opcional para quien la prefiera. */}
            <button onClick={() => setVistaTabla(!vistaTabla)}
              className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 transition"
              title={vistaTabla ? 'Ver como fichas' : 'Volver a la tabla'}>
              {vistaTabla ? '⋯ Vista de fichas' : '⋯ Volver a la tabla'}
            </button>
          </div>
        </div>

        {/* Resumen del brick: las transiciones NO son tareas (no deben contar como
            carga de ninguna disciplina), así que no pueden salir en la tabla de abajo.
            Aquí es donde se ven, que para eso son un paso entrenable. */}
        {sesion.disciplina === 'Brick' && <ResumenBrick sesionId={Number(id)} transiciones={sesion.transiciones || []} editable depId={deportistaId}
          onGuardado={() => { cargarDatos(); setRecargaTareas(n => n + 1) }} />}

        {vistaTabla && deportistaId ? (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 overflow-x-auto">
            <TareasTabla key={recargaTareas} sesionId={Number(id)} deportistaId={deportistaId} disciplinaSesion={sesion.disciplina} esDeportista={false} modoFuerza={sesion.modo_fuerza || 'simple'} zonaFuerza={sesion.zona_fuerza || ''} modoResistencia={sesion.modo_resistencia || 'simple'} zonaResistencia={sesion.zona_resistencia || ''} onTareasCambian={cargarDatos} copiar={aCopiar} onCopiado={() => setACopiar(null)} defectosIniciales={sesion.valores_por_defecto} />
          </div>
        ) : (
          <div>
            {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
            {sesion.estado !== 'Realizada' && (
              <div className="mb-4">
                <button onClick={() => {
                  if (mostrarForm) { cancelarEdicion(); return }
                  setMostrarForm(true)
                  // El catálogo de técnica se pide al abrir el formulario, no al
                  // cargar la página: son 18 filas que no hacen falta hasta aquí.
                  if (sesion.disciplina !== 'Fuerza' && !drillsTecnica.length) catalogoTecnica().then(setDrillsTecnica)
                }} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
                  {mostrarForm ? 'Cancelar' : '+ Nueva tarea'}
                </button>
              </div>
            )}
            {mostrarForm && sesion.disciplina === 'Fuerza' && (
              <form onSubmit={crearTareaFuerza} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
                <h4 className="font-bold">{tareaEditandoId ? 'Editar ejercicio de fuerza' : 'Nuevo ejercicio de fuerza'}</h4>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Tipo de serie</label>
                  <select value={tipoSerie} onChange={e => { setTipoSerie(e.target.value); setGrupoMuscular2(''); setEjercicioSel2(null); setEscalonDrop('') }} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full">
                    <option value="Normal">Normal</option>
                    <option value="Superserie">Superserie</option>
                    <option value="Drop set">Drop set</option>
                    <option value="Complex">Complex</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <select value={grupoMuscularSel} onChange={e => { setGrupoMuscularSel(e.target.value); setEjercicioSel(null) }} className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Grupo muscular</option>
                    {[...new Set(ejerciciosBiblioteca.map(e => e.grupo_muscular))].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {/* El grupo se pone también: si no, el desplegable de abajo
                      enseñaría una lista que no contiene lo que acabas de elegir. */}
                  <BuscadorEjercicios
                    ejercicios={ejerciciosBiblioteca}
                    onBibliotecaCambia={cargarDatos}
                    onElegir={ej => { setGrupoMuscularSel(ej.grupo_muscular || ''); setEjercicioSel(ej) }}
                    clase="flex-none bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-orange-500 rounded-lg px-3.5 transition" />
                </div>
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
                    <div className="mt-2">
                      <BuscadorEjercicios
                        ejercicios={ejerciciosBiblioteca}
                        onBibliotecaCambia={cargarDatos}
                        onElegir={ej => { setGrupoMuscular2(ej.grupo_muscular || ''); setEjercicioSel2(ej) }} />
                    </div>
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
                <div className="flex gap-2">
                  <button type="submit" disabled={loading || (!ejercicioSel && !tareaEditandoId)} className="flex-1 bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                    {loading ? 'Guardando...' : tareaEditandoId ? 'Guardar cambios' : 'Guardar ejercicio'}
                  </button>
                  {tareaEditandoId && (
                    <button type="button" onClick={cancelarEdicion} className="px-4 py-3 rounded-lg text-sm text-gray-400 hover:text-white transition">Cancelar</button>
                  )}
                </div>
              </form>
            )}

            {mostrarForm && sesion.disciplina !== 'Fuerza' && (
              <form onSubmit={crearTarea} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
                <h4 className="font-bold">{tareaEditandoId ? 'Editar tarea' : 'Nueva tarea'}</h4>
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
                {/* LA INTENSIDAD, EN CUALQUIER BLOQUE QUE SE PUEDA MEDIR.
                    Esta casilla solo salía en bloques por metros o km. Prescribir
                    por tiempo es lo normal en bici y muy común en carrera, y ahí
                    el entrenador no tenía dónde escribirla: solo veía la
                    referencia de la zona en un recuadro que no se podía tocar.
                    Con reps no aparece porque `p_repeticiones` no tiene dónde
                    guardarla, y una casilla que se traga lo que escribes es peor
                    que no tenerla. */}
                {tablaMedicion(tipoMedicion as UnidadMedicion) !== null && tipoMedicion !== 'reps' && (
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      Intensidad objetivo
                      {ritmoSugerido && <span className="ml-2 text-orange-400">Sugerido: {ritmoSugerido}</span>}
                    </label>
                    <input type="text"
                      placeholder={ritmoSugerido || 'Ej: 4:30 /km · 140-150 ppm · 180-220 W'}
                      value={ritmoManual}
                      onChange={e => setRitmoManual(e.target.value)}
                      className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
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
                {/* Trabajo técnico. Lo que se guarda es `tecnica_id`: la zona sigue
                    siendo AER, que es el volumen suave que un drill realmente es. */}
                {(() => {
                  const drills = filtrarDrills(drillsTecnica, disciplina || sesion.disciplina)
                  if (!drills.length) return null
                  return (
                    <div>
                      <label className="text-gray-400 text-xs mb-1 block">Ejercicio de técnica (opcional)</label>
                      <select value={tecnicaId} onChange={e => setTecnicaId(e.target.value)}
                        className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full">
                        <option value="">No es trabajo técnico</option>
                        {drills.map((d: any) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                      </select>
                    </div>
                  )
                })()}
                <textarea placeholder="Comentario" value={comentario} onChange={e => setComentario(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <div className="flex gap-2">
                  <button type="submit" disabled={loading} className="flex-1 bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                    {loading ? 'Guardando...' : tareaEditandoId ? 'Guardar cambios' : 'Guardar tarea'}
                  </button>
                  {tareaEditandoId && (
                    <button type="button" onClick={cancelarEdicion} className="px-4 py-3 rounded-lg text-sm text-gray-400 hover:text-white transition">Cancelar</button>
                  )}
                </div>
              </form>
            )}
            {tareas.length === 0 ? (
              <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">📋</div><p>No hay tareas todavia.</p></div>
            ) : (
              <div className="grid gap-3">
                {tareas.map((t, i) => t.id === tareaEditandoId ? (
                  // La que se está editando arriba no se pinta aquí: verla en dos
                  // sitios con valores distintos es peor que no poder editarla.
                  <div key={t.id} className="bg-gray-900/50 rounded-xl p-4 border border-dashed border-orange-500/40 text-center">
                    <p className="text-orange-400/80 text-sm">✏️ Editándola arriba</p>
                  </div>
                ) : (
                  <div key={t.id}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={e => { e.preventDefault(); if (sobreIdx !== i) setSobreIdx(i) }}
                    onDragEnd={() => { setDragIdx(null); setSobreIdx(null) }}
                    onDrop={e => { e.preventDefault(); if (dragIdx !== null) reordenarTareas(dragIdx, i); setDragIdx(null); setSobreIdx(null) }}
                    className={'bg-gray-900 rounded-xl p-5 border transition ' +
                      (dragIdx === i ? 'border-orange-500/60 opacity-40 ' : 'border-gray-800 ') +
                      (sobreIdx === i && dragIdx !== null && dragIdx !== i ? 'ring-2 ring-orange-500/70 ' : '')}>
                    <div className="flex items-start gap-3">
                      <span className="text-gray-500 hover:text-orange-400 cursor-grab active:cursor-grabbing select-none flex-shrink-0 text-2xl leading-none -mt-0.5" title="Arrastra para reordenar">⠿</span>
                      <span className="bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{i+1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {t.zona_entrenamiento && <span className="text-orange-400 font-bold text-sm">{t.zona_entrenamiento}</span>}
                            {t.disciplina && <span className={'text-xs px-2 py-0.5 rounded-full ' + colorDisciplina(t.disciplina)}>{t.disciplina}</span>}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => abrirEditarTarea(t)} className="text-gray-500 hover:text-orange-400 text-xs px-2 py-1 rounded-lg hover:bg-gray-800 transition">✏️</button>
                            <button onClick={() => borrarTarea(t.id)} className="text-gray-500 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-gray-800 transition">🗑</button>
                          </div>
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

        {/* Nutrición y notas: plegadas, con el resumen visible en una línea. Estaban
            delante de las tareas y las tareas son a lo que se viene aquí. */}
        <button onClick={() => setAbreNutricion(v => !v)}
          className="tp-card w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition text-left">
          <span className="flex items-center gap-3 flex-wrap min-w-0">
            <strong className="text-[13px] font-semibold">🍽 Nutrición</strong>
            <span className="text-[12.5px] text-gray-500 truncate">
              {nutricionGuardada(sesion) ? [
                sesion.nutricion_carbo_gh != null ? sesion.nutricion_carbo_gh + ' g/h' : null,
                sesion.nutricion_agua_mlh != null ? sesion.nutricion_agua_mlh + ' ml/h' : null,
                sesion.nutricion_sodio_mgh != null ? sesion.nutricion_sodio_mgh + ' mg/h sodio' : null,
                sesion.nutricion_cafeina_mg != null ? sesion.nutricion_cafeina_mg + ' mg cafeína' : null,
                sesion.nutricion_ayuno ? 'en ayunas' : null,
              ].filter(Boolean).join(' · ') : 'Sin definir'}
            </span>
          </span>
          <span className={'text-gray-500 text-xs tp-chev' + (abreNutricion ? ' open' : '')}>▼</span>
        </button>

        {abreNutricion && (
          <div className="tp-card p-[16px_18px] flex flex-col gap-3">
            {nutricionGuardada(sesion) && sesion.nutricion_notas && (
              <p className="text-gray-400 text-xs italic">{sesion.nutricion_notas}</p>
            )}
            <button onClick={abrirNutricion} className="self-start text-xs bg-gray-800 hover:bg-gray-700 text-orange-400 px-3 py-1.5 rounded-lg transition">
              🍽 {nutricionGuardada(sesion) ? 'Editar nutrición' : 'Sugerir nutrición'}
            </button>
          </div>
        )}

        {sesion.notas_entrenador && (
          <>
            <button onClick={() => setAbreNotas(v => !v)}
              className="tp-card w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition text-left">
              <span className="flex items-center gap-3 min-w-0">
                <strong className="text-[13px] font-semibold">📝 Notas{nombreDeportista ? ' para ' + nombreDeportista.split(' ')[0] : ''}</strong>
                <span className="text-[12.5px] text-gray-500 truncate">«{sesion.notas_entrenador}»</span>
              </span>
              <span className={'text-gray-500 text-xs tp-chev' + (abreNotas ? ' open' : '')}>▼</span>
            </button>
            {abreNotas && (
              <div className="tp-card p-[16px_18px]">
                <p className="text-gray-300 text-sm italic leading-relaxed">{sesion.notas_entrenador}</p>
              </div>
            )}
          </>
        )}
      </div>

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
