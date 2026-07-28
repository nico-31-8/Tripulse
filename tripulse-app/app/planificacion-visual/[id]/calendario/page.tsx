'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import GraficaCarga from '@/components/GraficaCarga'
import GraficaPeriodizacion from '@/components/GraficaPeriodizacion'
import PlanPeriodizacion from '@/components/PlanPeriodizacion'
import { calcularDuracionEstimada, type TestsDeportista } from '@/lib/duracion'
import { PRUEBAS, CATEGORIAS_PRUEBA, pruebaPorId, resumenSegmentos } from '@/lib/pruebas'
import { plantillasDe, bloquesDe, aplicarBloques, volumenPrincipal, NIVELES, type PlantillaSesion, type NivelPlantilla } from '@/lib/plantillas'
import { cargarPropias, type PlantillaPropia } from '@/lib/plantillas-propias'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { ZONAS_FUERZA, ZONAS_RESISTENCIA, cargaZona } from '@/lib/zonas'

const DISC_RESISTENCIA = ['Natacion', 'Ciclismo', 'Carrera']
import ConstructorBrick from '@/components/ConstructorBrick'
import { BRICK_VACIO, brickValido, rpeBrick, guardarBrick, cargarBrick, type BrickValor } from '@/lib/bricks'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['L','M','X','J','V','S','D']

const COLOR_MESO: Record<string, string> = {
  'Acumulación': 'bg-orange-500', 'Acumulacion': 'bg-orange-500',
  'Transmutación': 'bg-yellow-500', 'Transmutacion': 'bg-yellow-500',
  'Realización': 'bg-red-500', 'Realizacion': 'bg-red-500',
  'Recuperación': 'bg-green-500', 'Recuperacion': 'bg-green-500',
}

// Variantes translúcidas del color de meso. En Tailwind v4 la opacidad va en la
// propia clase (bg-color/N), y debe ser un literal completo para que el compilador
// la detecte — por eso mapas dedicados en vez de concatenar la opacidad en runtime.
const COLOR_MESO_20: Record<string, string> = {
  'Acumulación': 'bg-orange-500/20 hover:bg-orange-500/30', 'Acumulacion': 'bg-orange-500/20 hover:bg-orange-500/30',
  'Transmutación': 'bg-yellow-500/20 hover:bg-yellow-500/30', 'Transmutacion': 'bg-yellow-500/20 hover:bg-yellow-500/30',
  'Realización': 'bg-red-500/20 hover:bg-red-500/30', 'Realizacion': 'bg-red-500/20 hover:bg-red-500/30',
  'Recuperación': 'bg-green-500/20 hover:bg-green-500/30', 'Recuperacion': 'bg-green-500/20 hover:bg-green-500/30',
}
const COLOR_MESO_40: Record<string, string> = {
  'Acumulación': 'bg-orange-500/40 hover:bg-orange-500/60', 'Acumulacion': 'bg-orange-500/40 hover:bg-orange-500/60',
  'Transmutación': 'bg-yellow-500/40 hover:bg-yellow-500/60', 'Transmutacion': 'bg-yellow-500/40 hover:bg-yellow-500/60',
  'Realización': 'bg-red-500/40 hover:bg-red-500/60', 'Realizacion': 'bg-red-500/40 hover:bg-red-500/60',
  'Recuperación': 'bg-green-500/40 hover:bg-green-500/60', 'Recuperacion': 'bg-green-500/40 hover:bg-green-500/60',
}

const COLOR_DISC: Record<string, string> = {
  'Natacion': 'bg-blue-500', 'Natación': 'bg-blue-500',
  'Ciclismo': 'bg-yellow-400', 'Carrera': 'bg-green-500',
  'Fuerza': 'bg-red-500', 'Brick': 'bg-purple-500',
}

const COLOR_DISC_FULL: Record<string, string> = {
  'Natacion': 'bg-blue-800 text-blue-200 hover:bg-blue-700',
  'Ciclismo': 'bg-yellow-800 text-yellow-200 hover:bg-yellow-700',
  'Carrera': 'bg-green-800 text-green-200 hover:bg-green-700',
  'Fuerza': 'bg-red-800 text-red-200 hover:bg-red-700',
  'Brick': 'bg-purple-800 text-purple-200 hover:bg-purple-700',
}

function getDiasDelMes(año: number, mes: number) {
  const primerDia = new Date(año, mes, 1)
  const ultimoDia = new Date(año, mes + 1, 0)
  const dias: (Date | null)[] = []
  let diaSemana = primerDia.getDay()
  diaSemana = diaSemana === 0 ? 6 : diaSemana - 1
  for (let i = 0; i < diaSemana; i++) dias.push(null)
  for (let d = 1; d <= ultimoDia.getDate(); d++) dias.push(new Date(año, mes, d))
  return dias
}

function getVolumenSesion(sesion: any): string {
  const disc = sesion.disciplina
  const min = sesion.duracion_minutos ? sesion.duracion_minutos + 'm' : ''
  const metros = sesion.metros_total || 0
  const seg = sesion.seg_total || 0
  if (disc === 'Fuerza') return min
  if (disc === 'Ciclismo') { if (seg > 0) return Math.floor(seg/60) + 'm'; return min }
  if (disc === 'Natacion' || disc === 'Carrera') {
    if (metros > 0) { const vol = metros >= 1000 ? (metros/1000).toFixed(1) + 'km' : metros + 'm'; return min ? min + ' · ' + vol : vol }
    if (seg > 0) return Math.floor(seg/60) + 'm'
    return min
  }
  return min
}

// Duración efectiva de una sesión: manual si existe, si no la estimada.
// Devuelve el texto a mostrar ('' si no hay nada que mostrar).
function getDuracionSesion(sesion: any): string {
  if (sesion.duracion_minutos) return sesion.duracion_minutos + ' min'
  const est = sesion.dur_estimada
  if (est?.estimable && est.minutos > 0) return '~' + est.minutos + ' min'
  return ''
}

function fechaStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return y+'-'+m+'-'+dd
}

function getLunesDeSemana(fecha: string): string {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  return fechaStr(d)
}

function semanasHasta(fecha: string): number {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const f = new Date(fecha); f.setHours(0,0,0,0)
  return Math.ceil((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24 * 7))
}

function colorSemanas(semanas: number) {
  if (semanas < 0) return 'text-gray-500'
  if (semanas <= 2) return 'text-red-400'
  if (semanas <= 6) return 'text-yellow-400'
  return 'text-green-400'
}

export default function CalendarioPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()
  const [deportista, setDeportista] = useState<any>(null)
  const [macros, setMacros] = useState<any[]>([])
  const [mesos, setMesos] = useState<any[]>([])
  const [micros, setMicros] = useState<any[]>([])
  const [sesiones, setSesiones] = useState<any[]>([])
  const [competiciones, setCompeticiones] = useState<any[]>([])
  const [semanasBloqueadas, setSemanasBloqueadas] = useState<any[]>([])
  const [tests, setTests] = useState<TestsDeportista>({})
  const [rango, setRango] = useState(6)
  const [vista, setVista] = useState<'calendario'|'semanas'>('calendario')
  const [capaCalendario, setCapaCalendario] = useState<'mesos'|'semanas'>('mesos')
  const [mesInicio, setMesInicio] = useState(() => { const hoy = new Date(); return { año: hoy.getFullYear(), mes: hoy.getMonth() } })
  const [vistaDetalle, setVistaDetalle] = useState<'multi'|'mes'>('multi')
  const [modalTipo, setModalTipo] = useState<'macro'|'meso'|'micro'|'sesion'|'editarSesion'|'competicion'|'verCompeticion'|'bloquear'|'verBloqueo'|'pegarSemana'|null>(null)
  const [sesionEditando, setSesionEditando] = useState<any>(null)
  const [fechaSel, setFechaSel] = useState('')
  const [macroSel, setMacroSel] = useState<any>(null)
  const [mesoSel, setMesoSel] = useState<any>(null)
  const [microSel, setMicroSel] = useState<any>(null)
  // Sesión suelta: se crea sin microciclo cuando el día no tiene planificación montada.
  const [sesionLibre, setSesionLibre] = useState(false)
  // Zonas 2 activa el modo simple/compleja también en resistencia.
  const zonas2 = (deportista?.sistema_zonas || 1) === 2
  const [compSel, setCompSel] = useState<any>(null)
  const [bloqueoSel, setBloqueoSel] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Estados formularios
  const [macroObj, setMacroObj] = useState('')
  const [macroDuracion, setMacroDuracion] = useState('')
  const [mesoObj, setMesoObj] = useState('')
  const [mesoTipo, setMesoTipo] = useState('')
  const [mesoDuracion, setMesoDuracion] = useState('')
  const [mesoIntensidad, setMesoIntensidad] = useState('')
  const [mesoTid, setMesoTid] = useState('')
  const [microObj, setMicroObj] = useState('')
  const [microTipo, setMicroTipo] = useState('')
  const [sesionDisc, setSesionDisc] = useState('')
  const [sesionModoFuerza, setSesionModoFuerza] = useState('simple')
  // Mismo concepto que en fuerza pero para resistencia. Solo aplica con Zonas 2.
  const [sesionModoRes, setSesionModoRes] = useState('simple')
  const [sesionZonaRes, setSesionZonaRes] = useState('')
  const [brick, setBrick] = useState<BrickValor>(BRICK_VACIO)
  const [sesionZonaFuerza, setSesionZonaFuerza] = useState('')
  const [sesionDuracion, setSesionDuracion] = useState('')
  const [sesionRpe, setSesionRpe] = useState('')
  const [sesionNotas, setSesionNotas] = useState('')
  const [compNombre, setCompNombre] = useState('')
  const [tipoPeriodizacion, setTipoPeriodizacion] = useState('')
  const [compTipo, setCompTipo] = useState('')
  const [compNotas, setCompNotas] = useState('')
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false)
  const [bloqueoMotivo, setBloqueoMotivo] = useState('')
  const [mostrarGrafica, setMostrarGrafica] = useState(false)
  const [mostrarPlan, setMostrarPlan] = useState(false)

  // Copiar/pegar
  const [sesionCopiada, setSesionCopiada] = useState<any>(null)
  // Plantilla "en la mano": elegida en el panel, se aplica al pulsar un día (mismo
  // patrón que copiar/pegar sesión). Guarda ya sus bloques resueltos + un texto para
  // el banner, así el pegado no depende de si es del sistema o propia.
  const [plantillaEnMano, setPlantillaEnMano] = useState<{ nombre: string; disciplina: string; bloques: any[] } | null>(null)
  const [panelPlantillas, setPanelPlantillas] = useState(false)
  const [plantDisc, setPlantDisc] = useState<'Natacion' | 'Ciclismo' | 'Carrera'>('Natacion')
  const [plantNivel, setPlantNivel] = useState<NivelPlantilla>('intermedio')
  const [plantPestana, setPlantPestana] = useState<'tipo' | 'propias'>('tipo')
  const [plantPropias, setPlantPropias] = useState<PlantillaPropia[]>([])
  const [semanaCopiada, setSemanaCopiada] = useState<string|null>(null) // lunes de la semana copiada
  const [semanaDestino, setSemanaDestino] = useState<string|null>(null)
  const [mostrarToast, setMostrarToast] = useState('')

  useEffect(() => { cargarDatos() }, [id])
  // Las plantillas propias del panel del calendario, por disciplina (sin migración → lista vacía).
  useEffect(() => { if (panelPlantillas) cargarPropias(supabase, plantDisc).then(setPlantPropias) }, [panelPlantillas, plantDisc])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    // Tests más recientes para estimar ritmos por zona
    const { data: tCarr } = await supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    const { data: tNat } = await supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    const { data: tCic } = await supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    const testsDep: TestsDeportista = { vam: tCarr?.[0]?.vam, css: tNat?.[0]?.css, ftp: tCic?.[0]?.ftp }
    setTests(testsDep)
    const { data: mac } = await supabase.from('macrociclo').select('*').eq('id_deportista', id).order('fecha_inicio')
    setMacros(mac || [])
    const { data: comps } = await supabase.from('competicion').select('*').eq('id_deportista', Number(id)).order('fecha')
    setCompeticiones(comps || [])
    const { data: bloqs } = await supabase.from('semana_bloqueada').select('*').eq('id_deportista', Number(id))
    setSemanasBloqueadas(bloqs || [])
    if (!mac?.length) return
    const macIds = mac.map(m => m.id)
    const { data: me } = await supabase.from('mesociclo').select('*').in('id_macrociclo', macIds).order('fecha_inicio')
    setMesos(me || [])
    if (!me?.length) return
    const meIds = me.map(m => m.id)
    const { data: mi } = await supabase.from('microciclo').select('*').in('id_mesociclo', meIds).order('fecha_inicio')
    setMicros(mi || [])
    if (!mi?.length) return
    const miIds = mi.map(m => m.id)
    const { data: sesChain } = await supabase.from('sesion').select('*').in('id_microciclo', miIds).or('eliminada.is.null,eliminada.eq.false').order('fecha_sesion')
    // Sesiones "libres" añadidas por el atleta (sin microciclo)
    const { data: sesLibres } = await supabase.from('sesion').select('*').eq('id_deportista', Number(id)).is('id_microciclo', null).or('eliminada.is.null,eliminada.eq.false')
    const ses = [...(sesChain || []), ...(sesLibres || [])]
    if (ses.length) {
      const sesIds = ses.map(s => s.id)
      const { data: tareas } = await supabase.from('tarea').select('id, id_sesion, series, disciplina, zona_entrenamiento, descanso_segundos').in('id_sesion', sesIds)
      const tareaIds = tareas?.map(t => t.id) || []
      const { data: dists } = tareaIds.length ? await supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : { data: [] }
      const { data: durs } = tareaIds.length ? await supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : { data: [] }
      const { data: ejs } = tareaIds.length ? await supabase.from('ejercicios').select('id_tarea, repeticiones').in('id_tarea', tareaIds) : { data: [] }
      const sesConVolumen = ses.map(s => {
        const tarSes = tareas?.filter(t => t.id_sesion === s.id) || []
        const metros = tarSes.reduce((acc, t) => { const d = dists?.find(d => d.id_tarea === t.id); return acc + (d ? d.metros_planeados * (t.series || 1) : 0) }, 0)
        const seg = tarSes.reduce((acc, t) => { const d = durs?.find(d => d.id_tarea === t.id); return acc + (d ? d.tiempo_planeado * (t.series || 1) : 0) }, 0)
        // Duración estimada: reconstruye las tareas con sus parámetros hijo
        const tareasDur = tarSes.map(t => ({
          disciplina: t.disciplina,
          series: t.series,
          descanso_segundos: t.descanso_segundos,
          zona_entrenamiento: t.zona_entrenamiento,
          p_distancia: dists?.filter(d => d.id_tarea === t.id) || [],
          p_duracion: durs?.filter(d => d.id_tarea === t.id) || [],
          ejercicios: ejs?.filter(e => e.id_tarea === t.id) || [],
        }))
        const dur_estimada = calcularDuracionEstimada(tareasDur, testsDep)
        return { ...s, metros_total: metros, seg_total: seg, dur_estimada }
      })
      setSesiones(sesConVolumen)
    } else { setSesiones([]) }
  }

  const mesesAMostrar = Array.from({ length: rango }, (_, i) => {
    const mes = (mesInicio.mes + i) % 12
    const año = mesInicio.año + Math.floor((mesInicio.mes + i) / 12)
    return { mes, año }
  })

  const getMesoDelDia = (f: string) => mesos.find(m => { if (!m.fecha_inicio) return false; const ini = new Date(m.fecha_inicio); const fin = new Date(ini); fin.setDate(ini.getDate() + (m.duracion_semanas || 4) * 7); const d = new Date(f); return d >= ini && d < fin })
  const getMacroDelDia = (f: string) => macros.find(m => { if (!m.fecha_inicio) return false; const ini = new Date(m.fecha_inicio); const fin = new Date(ini); fin.setDate(ini.getDate() + (m.duracion_semanas || 16) * 7); const d = new Date(f); return d >= ini && d < fin })
  const getMicroDelDia = (f: string) => micros.find(m => { if (!m.fecha_inicio) return false; const ini = new Date(m.fecha_inicio); const fin = new Date(ini); fin.setDate(ini.getDate() + 7); const d = new Date(f); return d >= ini && d < fin })
  const getSesionesDia = (f: string) => sesiones.filter(s => s.fecha_sesion === f)
  const getCompeticionDia = (f: string) => competiciones.find(c => c.fecha?.slice(0,10) === f)
  const getBloqueoSemana = (f: string) => {
    const lunes = getLunesDeSemana(f)
    return semanasBloqueadas.find(b => b.fecha_inicio?.slice(0,10) === lunes)
  }
  const esSemanaCopiada = (f: string) => !!semanaCopiada && getLunesDeSemana(f) === semanaCopiada

  const proximaCompeticion = competiciones.filter(c => new Date(c.fecha) >= new Date()).sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0]

  const toast = (msg: string) => { setMostrarToast(msg); setTimeout(() => setMostrarToast(''), 2500) }

  // COPIAR SESIÓN
  const copiarTareasASesion = async (idOrigen: number, idDestino: number) => {
    const { data: tareas } = await supabase
      .from('tarea')
      .select('*, p_distancia(*), p_duracion(*), p_repeticiones(*), ejercicios(*)')
      .eq('id_sesion', idOrigen)
      .order('orden', { ascending: true })
    if (!tareas || tareas.length === 0) return
    for (const tarea of tareas) {
      const { data: t } = await supabase.from('tarea').insert({
        id_sesion: idDestino,
        zona_entrenamiento: tarea.zona_entrenamiento,
        disciplina: tarea.disciplina,
        series: tarea.series,
        descanso_segundos: tarea.descanso_segundos,
        comentario: tarea.comentario,
        orden: tarea.orden,
      }).select().single()
      if (!t) continue
      const pd = Array.isArray(tarea.p_distancia) ? tarea.p_distancia[0] : tarea.p_distancia
      if (pd) await supabase.from('p_distancia').insert({ id_tarea: t.id, metros_planeados: pd.metros_planeados, ritmo_objetivo: pd.ritmo_objetivo ?? null })
      const pu = Array.isArray(tarea.p_duracion) ? tarea.p_duracion[0] : tarea.p_duracion
      if (pu) await supabase.from('p_duracion').insert({ id_tarea: t.id, tiempo_planeado: pu.tiempo_planeado, potencia_objetivo: pu.potencia_objetivo ?? null })
      const pr = Array.isArray(tarea.p_repeticiones) ? tarea.p_repeticiones[0] : tarea.p_repeticiones
      if (pr) await supabase.from('p_repeticiones').insert({ id_tarea: t.id, repeticiones_planteadas: pr.repeticiones_planteadas })
      // Ejercicios de fuerza de la tarea (antes se perdían al copiar → tarea vacía).
      const ejs = Array.isArray(tarea.ejercicios) ? tarea.ejercicios : (tarea.ejercicios ? [tarea.ejercicios] : [])
      if (ejs.length) {
        await supabase.from('ejercicios').insert(ejs.map((e: any) => {
          const { id: _i, created_at: _c, id_tarea: _t, ...rr } = e
          return { ...rr, id_tarea: t.id }
        }))
      }
    }
  }

  const copiarSesion = (ses: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setSesionCopiada(ses)
    toast('Sesión copiada — pulsa un día para pegar')
  }

  // PEGAR SESIÓN en un día
  // Crea una sesión en el día `f` a partir de la plantilla en la mano. La plantilla
  // guarda ZONAS: el ritmo lo pondrá el atleta con sus tests. La duración y el RPE
  // los deriva la app de las tareas, así que no se fijan aquí.
  const pegarPlantilla = async (f: string) => {
    if (!plantillaEnMano) return
    const micro = getMicroDelDia(f)
    if (!micro) { toast('Ese día no tiene semana asignada'); return }
    setLoading(true)
    const { data: nueva } = await supabase.from('sesion').insert({
      id_microciclo: micro.id,
      disciplina: plantillaEnMano.disciplina,
      fecha_sesion: f,
      estado: 'Planificada',
    }).select().single()
    if (nueva) {
      const err = await aplicarBloques(supabase, nueva.id, plantillaEnMano.disciplina, plantillaEnMano.bloques)
      if (err) { toast('Sesión creada, pero error al aplicar la plantilla'); }
    }
    // La plantilla NO se suelta: así se puede pegar en varios días seguidos.
    await cargarDatos()
    toast('«' + plantillaEnMano.nombre + '» aplicada al ' + f.slice(8) + '/' + f.slice(5, 7))
    setLoading(false)
  }

  const pegarSesion = async (f: string) => {
    if (!sesionCopiada) return
    const micro = getMicroDelDia(f)
    if (!micro) { toast('Ese día no tiene semana asignada'); return }
    setLoading(true)
    const { data: sesNueva } = await supabase.from('sesion').insert({
      id_microciclo: micro.id,
      disciplina: sesionCopiada.disciplina,
      fecha_sesion: f,
      duracion_minutos: sesionCopiada.duracion_minutos,
      rpe_estimado: sesionCopiada.rpe_estimado,
      notas_entrenador: sesionCopiada.notas_entrenador,
      zona_fuerza: sesionCopiada.zona_fuerza ?? null,
      modo_fuerza: sesionCopiada.modo_fuerza ?? null,
      zona_resistencia: sesionCopiada.zona_resistencia ?? null,
      modo_resistencia: sesionCopiada.modo_resistencia ?? null,
      usar_cronometro: sesionCopiada.usar_cronometro ?? null,
      estado: 'Planificada'
    }).select().single()
    if (sesNueva) await copiarTareasASesion(sesionCopiada.id, sesNueva.id)
    setSesionCopiada(null)
    await cargarDatos()
    toast('Sesión pegada con todas sus tareas')
    setLoading(false)
  }

  // COPIAR SEMANA
  const copiarSemana = (f: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const lunes = getLunesDeSemana(f)
    setSemanaCopiada(lunes)
    setSesionCopiada(null)
    toast('Semana copiada — pulsa otra semana para pegar')
  }

  // PEGAR SEMANA
  const pegarSemana = async (lunesDestino: string) => {
    if (!semanaCopiada) return
    setLoading(true)
    // Obtener sesiones de la semana origen
    const sesionesSemana = sesiones.filter(s => getLunesDeSemana(s.fecha_sesion) === semanaCopiada)
    if (!sesionesSemana.length) { toast('La semana copiada no tiene sesiones'); setLoading(false); return }
    const lunesOrigen = new Date(semanaCopiada)
    const lunesDest = new Date(lunesDestino)
    const diffDias = Math.round((lunesDest.getTime() - lunesOrigen.getTime()) / (1000 * 60 * 60 * 24))
    for (const s of sesionesSemana) {
      const fechaOrigen = new Date(s.fecha_sesion)
      fechaOrigen.setDate(fechaOrigen.getDate() + diffDias)
      const nuevaFecha = fechaStr(fechaOrigen)
      const micro = getMicroDelDia(nuevaFecha)
      if (!micro) continue
      const { data: sesNueva2 } = await supabase.from('sesion').insert({
        id_microciclo: micro.id,
        disciplina: s.disciplina,
        fecha_sesion: nuevaFecha,
        duracion_minutos: s.duracion_minutos,
        rpe_estimado: s.rpe_estimado,
        notas_entrenador: s.notas_entrenador,
        // Al pegar la semana se conserva el tipo de sesión (antes se perdía).
        modo_fuerza: s.modo_fuerza ?? null,
        zona_fuerza: s.zona_fuerza ?? null,
        modo_resistencia: s.modo_resistencia ?? null,
        zona_resistencia: s.zona_resistencia ?? null,
        estado: 'Planificada'
      }).select().single()
      if (sesNueva2) await copiarTareasASesion(s.id, sesNueva2.id)
    }
    setSemanaCopiada(null)
    await cargarDatos()
    toast(`${sesionesSemana.length} sesiones pegadas con sus tareas`)
    setLoading(false)
  }

  const abrirModal = (f: string) => {
    // Si hay una plantilla en la mano, crear la sesión con ella
    if (plantillaEnMano) { pegarPlantilla(f); return }
    // Si hay sesión copiada, pegar
    if (sesionCopiada) { pegarSesion(f); return }
    // Si hay semana copiada, confirmar pegado
    if (semanaCopiada) {
      const lunes = getLunesDeSemana(f)
      if (lunes === semanaCopiada) { toast('Elige una semana diferente'); return }
      setSemanaDestino(lunes)
      setFechaSel(f)
      setModalTipo('pegarSemana')
      return
    }
    setFechaSel(f)
    const macro = getMacroDelDia(f); const meso = getMesoDelDia(f); const micro = getMicroDelDia(f)
    const ses = getSesionesDia(f); const comp = getCompeticionDia(f)
    const bloqueoF = getBloqueoSemana(f)
    if (bloqueoF) { setBloqueoSel(bloqueoF); setModalTipo('verBloqueo'); return }
    if (comp) { setCompSel(comp); setModalTipo('verCompeticion'); return }
    if (ses.length > 0) { router.push('/sesion/' + ses[0].id); return }
    if (micro) { setMicroSel(micro); setMesoSel(meso); setMacroSel(macro); setModalTipo('sesion'); return }
    if (meso) { setMesoSel(meso); setMacroSel(macro); setModalTipo('micro'); return }
    if (macro) { setMacroSel(macro); setModalTipo('meso'); return }
    setModalTipo('macro')
  }

  const abrirModalNuevaSesion = (f: string) => {
    if (sesionCopiada) { pegarSesion(f); return }
    if (semanaCopiada) {
      const lunes = getLunesDeSemana(f)
      if (lunes === semanaCopiada) { toast('Elige una semana diferente'); return }
      setSemanaDestino(lunes); setFechaSel(f); setModalTipo('pegarSemana'); return
    }
    setFechaSel(f)
    const macro = getMacroDelDia(f); const meso = getMesoDelDia(f); const micro = getMicroDelDia(f)
    const comp = getCompeticionDia(f)
    const bloqueoF = getBloqueoSemana(f)
    if (bloqueoF) { setBloqueoSel(bloqueoF); setModalTipo('verBloqueo'); return }
    if (comp) { setCompSel(comp); setModalTipo('verCompeticion'); return }
    if (micro) { setMicroSel(micro); setMesoSel(meso); setMacroSel(macro); setModalTipo('sesion'); return }
    if (meso) { setMesoSel(meso); setMacroSel(macro); setModalTipo('micro'); return }
    if (macro) { setMacroSel(macro); setModalTipo('meso'); return }
    setModalTipo('macro')
  }

  const editarSesion = async (ses: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setSesionEditando(ses); setSesionDisc(ses.disciplina || ''); setSesionDuracion(ses.duracion_minutos || '')
    setSesionRpe(ses.rpe_estimado || ''); setSesionNotas(ses.notas_entrenador || '')
    setSesionModoFuerza(ses.modo_fuerza || 'simple'); setSesionZonaFuerza(ses.zona_fuerza || '')
    setSesionModoRes(ses.modo_resistencia || 'simple'); setSesionZonaRes(ses.zona_resistencia || '')
    // Un brick se edita con sus bloques delante: hay que reconstruirlo de la BD.
    setBrick(ses.disciplina === 'Brick' ? await cargarBrick(supabase, ses.id) : BRICK_VACIO)
    setModalTipo('editarSesion')
  }
  const borrarSesion = async (sesId: number, e: React.MouseEvent) => { e.stopPropagation(); if (!confirm('¿Mover esta sesión a la papelera?')) return; await supabase.from('sesion').update({ eliminada: true }).eq('id', sesId); await cargarDatos() }

  const guardarEdicionSesion = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const esF = sesionDisc === 'Fuerza'
    const esB = sesionDisc === 'Brick'
    // El modo de resistencia solo tiene sentido con Zonas 2 (con Z1–Z7 no se usa).
    const esRes = zonas2 && DISC_RESISTENCIA.includes(sesionDisc)
    if (esB && !brickValido(brick)) { alert('Un brick necesita al menos dos bloques con duración.'); setLoading(false); return }
    await supabase.from('sesion').update({
      disciplina: sesionDisc,
      duracion_minutos: esB ? brick.bloques.reduce((a, b) => a + b.minutos, 0) : (sesionDuracion ? Number(sesionDuracion) : null),
      rpe_estimado: esB ? (sesionRpe ? Number(sesionRpe) : rpeBrick(brick)) : (sesionRpe ? Number(sesionRpe) : null),
      notas_entrenador: sesionNotas,
      modo_fuerza: esF ? sesionModoFuerza : null,
      zona_fuerza: (esF && sesionModoFuerza === 'simple') ? (sesionZonaFuerza || null) : null,
      modo_resistencia: esRes ? sesionModoRes : null,
      zona_resistencia: (esRes && sesionModoRes === 'simple') ? (sesionZonaRes || null) : null,
    }).eq('id', sesionEditando.id)
    if (esB) {
      const err = await guardarBrick(supabase, sesionEditando.id, brick)
      if (err) { alert('Los bloques del brick NO se han guardado.\n\n' + err); setLoading(false); return }
    }
    setSesionEditando(null); setBrick(BRICK_VACIO); setModalTipo(null); await cargarDatos(); setLoading(false)
  }
  const guardarMacro = async (e: React.FormEvent) => { e.preventDefault(); setLoading(true); await supabase.from('macrociclo').insert({ id_deportista: Number(id), objetivo: macroObj, fecha_inicio: fechaSel, duracion_semanas: Number(macroDuracion), tipo_periodizacion: tipoPeriodizacion || null }); setMacroObj(''); setMacroDuracion(''); setTipoPeriodizacion(''); setModalTipo(null); await cargarDatos(); setLoading(false) }
  const guardarMeso = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('mesociclo').insert({
      id_macrociclo: macroSel.id,
      objetivo: mesoObj,
      tipo: mesoTipo,
      fecha_inicio: fechaSel,
      tid_objetivo: mesoTid || null,
      duracion_semanas: Number(mesoDuracion),
      intensidad_relativa: mesoIntensidad ? Number(mesoIntensidad) : null
    })
    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    setMesoObj(''); setMesoTipo(''); setMesoDuracion(''); setMesoIntensidad(''); setMesoTid('')
    setModalTipo(null)
    await cargarDatos()
    setLoading(false)
  }
  const guardarMicro = async (e: React.FormEvent) => { e.preventDefault(); setLoading(true); await supabase.from('microciclo').insert({ id_mesociclo: mesoSel.id, objetivo: microObj, tipo: microTipo, fecha_inicio: fechaSel, duracion_dias: 7 }); setMicroObj(''); setMicroTipo(''); setModalTipo(null); await cargarDatos(); setLoading(false) }
  const guardarSesion = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const esF = sesionDisc === 'Fuerza'
    const esB = sesionDisc === 'Brick'
    // El modo de resistencia solo tiene sentido con Zonas 2 (con Z1–Z7 no se usa).
    const esRes = zonas2 && DISC_RESISTENCIA.includes(sesionDisc)
    if (esB && !brickValido(brick)) { alert('Un brick necesita al menos dos bloques con duración.'); setLoading(false); return }
    // El brick manda en duración y RPE: salen de sus bloques, no de los campos manuales.
    // Si es libre no hay microciclo al que colgarla: se guarda suelta contra el deportista.
    // Aun así se comprueba si alguna semana cubre esa fecha; si la hay, se engancha
    // (igual que hace el deportista desde "Mis sesiones") para que cuente en el plan.
    const microDeLaFecha = sesionLibre ? getMicroDelDia(fechaSel) : microSel
    const { data: nueva } = await supabase.from('sesion').insert({
      id_microciclo: microDeLaFecha ? microDeLaFecha.id : null,
      ...(microDeLaFecha ? {} : { id_deportista: Number(id), origen: 'entrenador' }),
      disciplina: sesionDisc, fecha_sesion: fechaSel,
      duracion_minutos: esB ? brick.bloques.reduce((a, b) => a + b.minutos, 0) : (sesionDuracion ? Number(sesionDuracion) : null),
      rpe_estimado: esB ? (sesionRpe ? Number(sesionRpe) : rpeBrick(brick)) : (sesionRpe ? Number(sesionRpe) : null),
      notas_entrenador: sesionNotas, estado: 'Planificada',
      modo_fuerza: esF ? sesionModoFuerza : null,
      zona_fuerza: (esF && sesionModoFuerza === 'simple') ? (sesionZonaFuerza || null) : null,
      modo_resistencia: esRes ? sesionModoRes : null,
      zona_resistencia: (esRes && sesionModoRes === 'simple') ? (sesionZonaRes || null) : null,
    }).select().single()
    if (esB) {
      if (!nueva) { alert('No se ha podido crear la sesión, así que el brick no se ha guardado.'); setLoading(false); return }
      const err = await guardarBrick(supabase, nueva.id, brick)
      if (err) { alert('Sesión creada, pero los bloques del brick NO se han guardado.\n\n' + err); setLoading(false); return }
    }
    setSesionDisc(''); setSesionDuracion(''); setSesionRpe(''); setSesionNotas('')
    setSesionModoFuerza('simple'); setSesionZonaFuerza(''); setBrick(BRICK_VACIO)
    setSesionModoRes('simple'); setSesionZonaRes('')
    setSesionLibre(false)
    setModalTipo(null); await cargarDatos(); setLoading(false)
  }

  const guardarCompeticion = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const tipoNombre = pruebaPorId(compTipo)?.nombre ?? (compTipo === 'otro' ? 'Otro' : compTipo)
    await supabase.from('competicion').insert({ id_deportista: Number(id), nombre: compNombre, fecha: fechaSel, tipo: tipoNombre, notas: compNotas })
    setCompNombre(''); setCompTipo(''); setCompNotas(''); setModalTipo(null)
    await cargarDatos(); setLoading(false)
  }

  const borrarCompeticion = async (compId: number) => {
    if (!confirm('¿Borrar esta competición?')) return
    await supabase.from('competicion').delete().eq('id', compId)
    setModalTipo(null); await cargarDatos()
  }

  const guardarBloqueo = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const lunes = getLunesDeSemana(fechaSel)
    await supabase.from('semana_bloqueada').insert({ id_deportista: Number(id), fecha_inicio: lunes, motivo: bloqueoMotivo })
    setBloqueoMotivo(''); setModalTipo(null)
    await cargarDatos(); setLoading(false)
    toast('Semana bloqueada')
  }

  const borrarBloqueo = async (bloqId: number) => {
    await supabase.from('semana_bloqueada').delete().eq('id', bloqId)
    setModalTipo(null); await cargarDatos()
    toast('Bloqueo eliminado')
  }

  const hoy = new Date().toISOString().split('T')[0]
  const modoActivo = sesionCopiada ? 'pegar-sesion' : semanaCopiada ? 'pegar-semana' : null

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/planificacion-visual/' + id)} className="text-gray-400 hover:text-white text-sm transition">← Bloques</button>
          <button onClick={() => router.push('/deportistas/' + id)} className="text-gray-400 hover:text-white text-sm transition">← Perfil</button>
        </div>
      </nav>

      {/* Toast */}
      {mostrarToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg">
          {mostrarToast}
        </div>
      )}

      {/* Banner: plantilla en la mano */}
      {plantillaEnMano && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl flex items-center gap-3 border bg-orange-900 border-orange-500 text-orange-100">
          <span>📋 «{plantillaEnMano.nombre}» — pulsa un día para crear la sesión</span>
          <button onClick={() => setPlantillaEnMano(null)} className="text-orange-300 hover:text-white ml-2">✕ Soltar</button>
        </div>
      )}

      {/* Banner modo copiar */}
      {modoActivo && (
        <div className={'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl flex items-center gap-3 border ' +
          (modoActivo === 'pegar-sesion' ? 'bg-blue-900 border-blue-500 text-blue-200' : 'bg-purple-900 border-purple-500 text-purple-200')}>
          {modoActivo === 'pegar-sesion' ? (
            <>
              <span>📋 Sesión copiada — pulsa un día para pegar</span>
              <button onClick={() => setSesionCopiada(null)} className="text-blue-400 hover:text-white ml-2">✕ Cancelar</button>
            </>
          ) : (
            <>
              <span>📋 Semana copiada — pulsa otro día para pegar</span>
              <button onClick={() => setSemanaCopiada(null)} className="text-purple-400 hover:text-white ml-2">✕ Cancelar</button>
            </>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-end gap-2 mb-2">
          {macros.some((m: any) => m.tipo_periodizacion) && (
            <button
              onClick={() => setMostrarPlan(v => !v)}
              className={"flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition font-medium " +
                (mostrarPlan
                  ? "bg-green-600 border-green-500 text-white"
                  : "bg-gray-800 border-gray-700 hover:border-green-500 text-gray-300 hover:text-white")}>
              <span>📋</span>
              <span>{mostrarPlan ? "Ocultar plan" : "Ver plan"}</span>
            </button>
          )}
          <button
            onClick={() => setMostrarGrafica(v => !v)}
            className={"flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition font-medium " +
              (mostrarGrafica
                ? "bg-orange-500 border-orange-400 text-white"
                : "bg-gray-800 border-gray-700 hover:border-orange-500 text-gray-300 hover:text-white")}>
            <span>📊</span>
            <span>{mostrarGrafica ? "Ocultar carga" : "Ver carga"}</span>
          </button>
        </div>

        {mostrarPlan && macros.find((m: any) => m.tipo_periodizacion) && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-white">📋 Plan — {macros.find((m: any) => m.tipo_periodizacion)?.tipo_periodizacion}</h3>
                <p className="text-gray-500 text-xs mt-0.5">{deportista?.nombre} · {macros.find((m: any) => m.tipo_periodizacion)?.duracion_semanas} semanas</p>
              </div>
              <button onClick={() => setMostrarPlan(false)} className="text-gray-500 hover:text-white text-xl leading-none">x</button>
            </div>
            <PlanPeriodizacion
              depId={Number(id)}
              macroId={macros.find((m: any) => m.tipo_periodizacion)?.id}
              tipoPeriodizacion={macros.find((m: any) => m.tipo_periodizacion)?.tipo_periodizacion || ""}
              fechaInicio={macros.find((m: any) => m.tipo_periodizacion)?.fecha_inicio || ""}
              duracionSemanas={macros.find((m: any) => m.tipo_periodizacion)?.duracion_semanas || 12}
              competiciones={competiciones}
              vistaDetalle={vistaDetalle}
              mesActual={vistaDetalle === "mes" ? mesesAMostrar[0] : undefined}
            />
          </div>
        )}

        {mostrarGrafica && deportista && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-white">📊 Carga real — {deportista.nombre}</h3>
                <p className="text-gray-500 text-xs mt-0.5">
                  {vistaDetalle === "mes" ? "Vista diaria" : "Vista semanal"} · Solo sesiones con RPE reportado
                </p>
              </div>
              <button onClick={() => setMostrarGrafica(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <GraficaCarga
              depId={Number(id)}
              fcUmbral={deportista.fc_maxima ? Math.round(deportista.fc_maxima * 0.85) : 150}
              modo={vistaDetalle === "mes" ? "dia" : "semana"}
              fechaInicio={mesesAMostrar[0] ? mesesAMostrar[0].año + "-" + String(mesesAMostrar[0].mes+1).padStart(2,"0") + "-01" : undefined}
              altura={300}
            />
          </div>
        )}

        {/* Panel de plantillas: elige una y luego pulsa el día donde crearla. */}
        {panelPlantillas && (() => {
          const delSistema = plantillasDe(plantDisc)
          const lista: { key: string; nombre: string; zona: string; vol: string; bloques: any[] }[] =
            plantPestana === 'tipo'
              ? delSistema.map(p => ({ key: p.id, nombre: p.nombre, zona: p.zona, vol: volumenPrincipal(p, plantNivel), bloques: bloquesDe(p, plantNivel) }))
              : plantPropias.map(p => ({ key: 'p' + p.id, nombre: p.nombre, zona: p.zona, vol: '', bloques: p.bloques }))
          return (
            <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="font-semibold text-white text-sm">📋 Plantillas — elige una y pulsa el día</p>
                <p className="text-gray-500 text-[11px]">Guardan zonas, no ritmos: el ritmo lo pone el atleta con sus tests.</p>
              </div>
              {/* Disciplina */}
              <div className="flex gap-1.5 mb-2">
                {(['Natacion', 'Ciclismo', 'Carrera'] as const).map(d => (
                  <button key={d} onClick={() => setPlantDisc(d)}
                    className={'text-xs px-3 py-1.5 rounded-lg border transition ' +
                      (plantDisc === d ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600')}>
                    {d === 'Natacion' ? '🏊 Natación' : d === 'Ciclismo' ? '🚴 Ciclismo' : '🏃 Carrera'}
                  </button>
                ))}
                <div className="ml-auto flex gap-1 bg-gray-800/60 p-0.5 rounded-lg">
                  {([['tipo', 'Tipo'], ['propias', 'Propias']] as [typeof plantPestana, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setPlantPestana(id)}
                      className={'text-[11px] px-2.5 py-1 rounded-md transition ' + (plantPestana === id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300')}>
                      {label}{id === 'propias' && plantPropias.length > 0 ? ' · ' + plantPropias.length : ''}
                    </button>
                  ))}
                </div>
              </div>
              {/* Nivel (solo del sistema) */}
              {plantPestana === 'tipo' && (
                <div className="flex gap-1 mb-3">
                  {NIVELES.map(n => (
                    <button key={n.id} onClick={() => setPlantNivel(n.id)}
                      className={'text-[11px] px-2.5 py-1 rounded-lg border transition ' +
                        (plantNivel === n.id ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-600')}>
                      {n.label}
                    </button>
                  ))}
                </div>
              )}
              {/* Rejilla de plantillas */}
              {lista.length === 0 ? (
                <p className="text-gray-600 text-xs py-3 text-center">
                  {plantPestana === 'propias' ? 'Aún no tienes plantillas propias. Guárdalas desde una sesión.' : 'Sin plantillas.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {lista.map(p => {
                    const col = cargaZona(p.zona).color
                    const activa = plantillaEnMano?.nombre === p.nombre
                    return (
                      <button key={p.key}
                        onClick={() => setPlantillaEnMano(activa ? null : { nombre: p.nombre, disciplina: plantDisc, bloques: p.bloques })}
                        className={'flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition ' +
                          (activa ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-800/40 hover:border-gray-700')}>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none flex-shrink-0" style={{ background: col, color: '#0a0b0f' }}>{p.zona}</span>
                        <span className="text-xs text-white truncate flex-1">{p.nombre}</span>
                        {p.vol && <span className="text-gray-600 text-[10px]">{p.vol}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* Banner próxima competición */}
        {proximaCompeticion && (
          <div className="mb-6 bg-yellow-900/30 border border-yellow-600/50 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <div>
                <p className="font-bold text-yellow-300">{proximaCompeticion.nombre}</p>
                <p className="text-yellow-500 text-xs">{proximaCompeticion.tipo} · {proximaCompeticion.fecha}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${colorSemanas(semanasHasta(proximaCompeticion.fecha))}`}>
                {Math.max(0, semanasHasta(proximaCompeticion.fecha))}
              </p>
              <p className="text-yellow-600 text-xs">semanas</p>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold">Calendario — {deportista.nombre}</h2>
            <p className="text-gray-400 text-sm">Pulsa un día para planificar</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={() => { setFechaSel(hoy); setModalTipo('competicion') }}
              className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-sm px-3 py-2 rounded-lg transition font-medium">
              🏆 <span>+ Competición</span>
            </button>
            <button onClick={() => setMostrarCatalogo(true)}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm px-3 py-2 rounded-lg transition">
              ℹ️ <span>Tipos de prueba</span>
            </button>
            <button onClick={() => { setFechaSel(hoy); setModalTipo('bloquear') }}
              className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm px-3 py-2 rounded-lg transition">
              🚫 <span>Bloquear semana</span>
            </button>
            <button onClick={() => setPanelPlantillas(v => !v)}
              className={'flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg transition border ' +
                (panelPlantillas ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300 hover:text-white')}>
              📋 <span>Plantillas</span>
            </button>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              <button onClick={() => setVistaDetalle(v => v === 'multi' ? 'mes' : 'multi')}
                className={'px-3 py-1.5 rounded-md text-xs font-medium transition ' + (vistaDetalle === 'mes' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                📅 1 mes
              </button>
              <button onClick={() => { setVista('calendario'); setCapaCalendario('mesos') }}
                className={'px-3 py-1.5 rounded-md text-xs font-medium transition ' + (vista === 'calendario' && capaCalendario === 'mesos' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                📅 Mesociclos
              </button>
              <button onClick={() => { setVista('calendario'); setCapaCalendario('semanas') }}
                className={'px-3 py-1.5 rounded-md text-xs font-medium transition ' + (vista === 'calendario' && capaCalendario === 'semanas' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                📋 Semanas
              </button>
              <button onClick={() => setVista('semanas')}
                className={'px-3 py-1.5 rounded-md text-xs font-medium transition ' + (vista === 'semanas' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white')}>
                📝 Lista
              </button>
            </div>
            {vista === 'calendario' && (
              <>
                <div className="flex gap-1">
                  <button onClick={() => setMesInicio(p => { const m = p.mes === 0 ? 11 : p.mes-1; const a = p.mes === 0 ? p.año-1 : p.año; return {mes:m,año:a} })} className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition">◀</button>
                  <button onClick={() => setMesInicio({año: new Date().getFullYear(), mes: new Date().getMonth()})} className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition">Hoy</button>
                  <button onClick={() => setMesInicio(p => { const m = (p.mes+1)%12; const a = p.mes===11 ? p.año+1 : p.año; return {mes:m,año:a} })} className="bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition">▶</button>
                </div>
                <div className="flex gap-1">
                  {[3,6,12].map(r => (
                    <button key={r} onClick={() => setRango(r)} className={'px-3 py-2 rounded-lg text-xs font-medium transition ' + (rango===r ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>{r} meses</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex gap-4 flex-wrap mb-5 text-xs">
          {capaCalendario === 'mesos' ? (
            <>{[['bg-orange-500','Acumulación'],['bg-yellow-500','Transmutación'],['bg-red-500','Realización'],['bg-green-500','Recuperación']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5"><div className={'w-3 h-3 rounded-sm '+c}/><span className="text-gray-400">{l}</span></div>
            ))}</>
          ) : (
            <>{[['bg-orange-400','Carga'],['bg-green-400','Recuperación'],['bg-blue-400','Competición']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5"><div className={'w-3 h-3 rounded-sm '+c}/><span className="text-gray-400">{l}</span></div>
            ))}</>
          )}
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-white opacity-70"/><span className="text-gray-400">Sesión</span></div>
          <div className="flex items-center gap-1.5"><span>🏆</span><span className="text-gray-400">Competición</span></div>
          <div className="flex items-center gap-1.5"><span>🚫</span><span className="text-gray-400">Semana bloqueada</span></div>
        </div>

        {/* VISTA 1 MES */}
        {vistaDetalle === 'mes' && vista === 'calendario' && (() => {
          const { mes, año } = mesesAMostrar[0]
          const diasMes = getDiasDelMes(año, mes)
          const compsDelMes = competiciones.filter(c => { const f = new Date(c.fecha); return f.getFullYear() === año && f.getMonth() === mes })
          return (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 bg-gray-800 flex justify-between items-center">
                <p className="font-bold text-lg">{MESES[mes]} {año}</p>
                <div className="flex items-center gap-3">
                  {compsDelMes.map(c => (
                    <span key={c.id} className="text-yellow-400 text-xs flex items-center gap-1">
                      🏆 {c.nombre}
                      <span className={`font-bold ml-1 ${colorSemanas(semanasHasta(c.fecha))}`}>
                        {semanasHasta(c.fecha) > 0 ? `${semanasHasta(c.fecha)}sem` : 'Esta semana'}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                    <div key={d} className="text-center text-xs text-gray-500 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {diasMes.map((dia, i) => {
                    if (!dia) return <div key={i} />
                    const f = fechaStr(dia)
                    const meso = getMesoDelDia(f)
                    const micro = getMicroDelDia(f)
                    const sesDia = getSesionesDia(f)
                    const comp = getCompeticionDia(f)
                    const bloqueo = getBloqueoSemana(f)
                    const esHoy = f === hoy
                    const esCopiadaSemana = esSemanaCopiada(f)
                    return (
                      <div key={f}
                        onClick={() => abrirModalNuevaSesion(f)}
                        className={'min-h-20 rounded-xl border p-1.5 cursor-pointer transition ' +
                          (bloqueo ? 'bg-gray-800 border-red-900 opacity-60 ' :
                           comp ? 'ring-2 ring-yellow-500 bg-yellow-900/20 border-yellow-700 ' :
                           esCopiadaSemana ? 'ring-2 ring-purple-500 border-purple-700 bg-purple-900/20 ' :
                           esHoy ? 'ring-2 ring-orange-500 ' : '') +
                          (!bloqueo && !comp && !esCopiadaSemana ? (meso ? (COLOR_MESO_20[meso.tipo] || 'bg-gray-800/20 hover:bg-gray-800/30') + ' border-gray-700 ' : 'bg-gray-800 border-gray-700 hover:bg-gray-700 ') : '')}>
                        <div className="flex justify-between items-start mb-1">
                          <span className={'text-xs font-medium ' + (esHoy ? 'text-orange-400' : comp ? 'text-yellow-400' : bloqueo ? 'text-red-400' : 'text-gray-400')}>{dia.getDate()}</span>
                          {comp ? <span className="text-sm">🏆</span> : bloqueo ? <span className="text-sm">🚫</span> : micro && <span className="text-xs text-gray-600">{micro.tipo?.slice(0,3)}</span>}
                        </div>
                        {bloqueo && <p className="text-red-400 text-xs truncate">{bloqueo.motivo || 'Bloqueada'}</p>}
                        {comp && <p className="text-yellow-400 text-xs font-medium truncate mb-1">{comp.nombre}</p>}
                        {!bloqueo && (
                          <div className="flex flex-col gap-0.5">
                            {sesDia.map(s => (
                              <div key={s.id}
                                onClick={e => { e.stopPropagation(); router.push('/sesion/' + s.id)}}
                                className={'rounded px-1 py-0.5 flex justify-between items-center group cursor-pointer ' + (COLOR_DISC_FULL[s.disciplina] || 'bg-gray-700 text-gray-200 hover:bg-gray-600')}>
                                <span className="text-xs truncate">{s.disciplina?.slice(0,3)} {getVolumenSesion(s)}{getDuracionSesion(s) ? ' · ' + getDuracionSesion(s) : ''}</span>
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                                  <button onClick={e => { e.stopPropagation(); copiarSesion(s, e) }} className="text-white hover:text-blue-300 text-xs" title="Copiar">📋</button>
                                  <button onClick={e => editarSesion(s, e)} className="text-white hover:text-orange-300 text-xs">✏️</button>
                                  <button onClick={e => borrarSesion(s.id, e)} className="text-white hover:text-red-300 text-xs">🗑</button>
                                </div>
                              </div>
                            ))}
                            <div className="text-center py-0.5 flex justify-between items-center px-1">
                              <span className="text-gray-700 text-xs">+</span>
                              {sesDia.length > 0 && (
                                <button onClick={e => copiarSemana(f, e)} className="text-gray-600 hover:text-purple-400 text-xs transition" title="Copiar semana">📋sem</button>
                              )}
                            </div>
                          </div>
                        )}
                        {bloqueo && (
                          <button onClick={e => { e.stopPropagation(); setBloqueoSel(bloqueo); setModalTipo('verBloqueo') }}
                            className="text-xs text-red-400 hover:text-red-300 mt-1">Ver →</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })()}

        {/* VISTA MULTI MES */}
        {vistaDetalle === 'multi' && vista === 'calendario' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mesesAMostrar.map(({ mes, año }) => (
              <div key={`${año}-${mes}`} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 bg-gray-800 flex justify-between items-center">
                  <p className="font-bold">{MESES[mes]} {año}</p>
                  {competiciones.filter(c => { const f = new Date(c.fecha); return f.getFullYear() === año && f.getMonth() === mes }).map(c => (
                    <span key={c.id} className="text-yellow-400 text-xs">🏆 {semanasHasta(c.fecha) > 0 ? semanasHasta(c.fecha) + 'sem' : 'Ya'}</span>
                  ))}
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {DIAS_SEMANA.map(d => <div key={d} className="text-center text-xs text-gray-600 py-1">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {getDiasDelMes(año, mes).map((dia, i) => {
                      if (!dia) return <div key={i} />
                      const f = fechaStr(dia)
                      const meso = getMesoDelDia(f)
                      const micro = getMicroDelDia(f)
                      const ses = getSesionesDia(f)
                      const comp = getCompeticionDia(f)
                      const bloqueo = getBloqueoSemana(f)
                      const esCopiadaSemana = esSemanaCopiada(f)
                      const esHoy = f === hoy
                      return (
                        <button key={f} onClick={() => abrirModal(f)}
                          className={'relative rounded text-xs py-1.5 text-center transition flex flex-col items-center justify-center min-h-8 ' +
                            (bloqueo ? 'bg-red-900/30 text-red-400 ' :
                             comp ? 'bg-yellow-500/30 ring-1 ring-yellow-500 text-yellow-300 ' :
                             esCopiadaSemana ? 'bg-purple-500/30 ring-1 ring-purple-500 text-purple-300 ' :
                             esHoy ? 'ring-2 ring-orange-500 font-bold ' : '') +
                            (!bloqueo && !comp && !esCopiadaSemana ? (capaCalendario === 'semanas' && micro ?
                              (micro.tipo === 'Carga' ? 'bg-orange-400/40 hover:bg-orange-400/60 text-white ' :
                               micro.tipo?.includes('Recup') ? 'bg-green-400/40 hover:bg-green-400/60 text-white ' :
                               'bg-blue-400/40 hover:bg-blue-400/60 text-white ') :
                              capaCalendario === 'mesos' && meso ? (COLOR_MESO_40[meso.tipo] || 'bg-gray-700/40 hover:bg-gray-700/60') + ' text-white ' :
                              'text-gray-400 hover:bg-gray-800 ') : '')}>
                          <span>{bloqueo ? '🚫' : comp ? '🏆' : dia.getDate()}</span>
                          {ses.length > 0 && !comp && !bloqueo && (
                            <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                              {ses.slice(0,3).map((s, i) => (
                                <div key={i} className={'w-1.5 h-1.5 rounded-full ' + (COLOR_DISC[s.disciplina] || 'bg-gray-400')} />
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VISTA SEMANAS */}
        {vista === 'semanas' && (
          <div className="flex flex-col gap-4">
            {competiciones.length > 0 && (
              <div className="bg-gray-900 rounded-xl border border-yellow-700/50 overflow-hidden">
                <div className="px-5 py-3 bg-yellow-900/20 border-b border-yellow-700/30"><p className="font-bold text-yellow-400">🏆 Competiciones</p></div>
                <div className="divide-y divide-gray-800">
                  {competiciones.map(c => {
                    const sem = semanasHasta(c.fecha)
                    return (
                      <div key={c.id} className="flex justify-between items-center px-5 py-3">
                        <div>
                          <p className="font-medium text-white">{c.nombre}</p>
                          <p className="text-gray-500 text-xs">{c.tipo} · {c.fecha}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-xl font-bold ${colorSemanas(sem)}`}>{Math.max(0, sem)}</p>
                            <p className="text-gray-600 text-xs">semanas</p>
                          </div>
                          <button onClick={() => borrarCompeticion(c.id)} className="text-gray-600 hover:text-red-400 transition text-sm">🗑</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {semanasBloqueadas.length > 0 && (
              <div className="bg-gray-900 rounded-xl border border-red-900/50 overflow-hidden">
                <div className="px-5 py-3 bg-red-900/20 border-b border-red-900/30"><p className="font-bold text-red-400">🚫 Semanas bloqueadas</p></div>
                <div className="divide-y divide-gray-800">
                  {semanasBloqueadas.map(b => (
                    <div key={b.id} className="flex justify-between items-center px-5 py-3">
                      <div>
                        <p className="font-medium text-white">Semana del {b.fecha_inicio?.slice(0,10)}</p>
                        {b.motivo && <p className="text-gray-500 text-xs">{b.motivo}</p>}
                      </div>
                      <button onClick={() => borrarBloqueo(b.id)} className="text-gray-600 hover:text-red-400 transition text-sm">🗑</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {macros.length === 0 ? (
              <div className="text-center py-16 text-gray-500"><div className="text-5xl mb-4">📋</div><p>No hay macrociclos todavía.</p></div>
            ) : macros.map(mac => {
              const mesosMac = mesos.filter(m => m.id_macrociclo === mac.id)
              return (
                <div key={mac.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-800 border-b border-gray-700"><p className="font-bold text-orange-400">{mac.objetivo}</p><p className="text-gray-400 text-xs">{mac.fecha_inicio} · {mac.duracion_semanas} semanas</p></div>
                  {mesosMac.map(meso => {
                    const microsMeso = micros.filter(m => m.id_mesociclo === meso.id)
                    return (
                      <div key={meso.id} className="border-b border-gray-800">
                        <div className={'px-5 py-2.5 flex justify-between items-center ' + (meso.tipo?.includes('Acum') ? 'bg-orange-900/20' : meso.tipo?.includes('Trans') ? 'bg-yellow-900/20' : meso.tipo?.includes('Real') ? 'bg-red-900/20' : 'bg-green-900/20')}>
                          <div><p className="font-medium text-sm">{meso.objetivo}</p><p className="text-gray-400 text-xs">{meso.tipo} · {meso.duracion_semanas} sem · {meso.fecha_inicio}</p></div>
                          <button onClick={() => { setMacroSel(mac); setMesoSel(meso); setFechaSel(meso.fecha_inicio || ''); setModalTipo('micro') }} className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-1.5 rounded-lg transition">+ Semana</button>
                        </div>
                        {microsMeso.map((micro, idx) => {
                          const sesMicro = sesiones.filter(s => s.id_microciclo === micro.id)
                          const bloqueada = micro.fecha_inicio ? getBloqueoSemana(micro.fecha_inicio) : null
                          return (
                            <div key={micro.id} className={'flex justify-between items-center px-6 py-2 transition border-t border-gray-800 ' + (bloqueada ? 'bg-red-900/10' : 'hover:bg-gray-800')}>
                              <div className="flex items-center gap-3">
                                <span className={'text-xs px-2 py-0.5 rounded-full ' + (micro.tipo === 'Carga' ? 'bg-orange-900 text-orange-300' : micro.tipo?.includes('Recup') ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300')}>Sem {idx+1}</span>
                                <div>
                                  <p className="text-sm text-white">{micro.objetivo} {bloqueada ? '🚫' : ''}</p>
                                  <p className="text-gray-500 text-xs">{micro.fecha_inicio} · {micro.tipo}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex gap-1">{sesMicro.map(s => <div key={s.id} className={'w-2 h-2 rounded-full ' + (COLOR_DISC[s.disciplina] || 'bg-gray-500')} title={s.disciplina} />)}</div>
                                {sesMicro.length > 0 && (
                                  <button onClick={e => { if (micro.fecha_inicio) copiarSemana(micro.fecha_inicio, e) }} className="bg-purple-900/50 hover:bg-purple-800 text-purple-300 text-xs px-2 py-1 rounded-lg transition" title="Copiar semana">📋</button>
                                )}
                                <button onClick={() => { setMicroSel(micro); setMesoSel(meso); setMacroSel(mac); setFechaSel(micro.fecha_inicio || ''); setModalTipo('sesion') }} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded-lg transition">+ Sesión</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODALES */}
      {modalTipo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold">
                  {modalTipo === 'macro' ? '+ Nuevo macrociclo' :
                   modalTipo === 'meso' ? '+ Nuevo mesociclo' :
                   modalTipo === 'micro' ? '+ Nueva semana' :
                   modalTipo === 'editarSesion' ? '✏️ Editar sesión' :
                   modalTipo === 'competicion' ? '🏆 Nueva competición' :
                   modalTipo === 'verCompeticion' ? '🏆 Competición' :
                   modalTipo === 'bloquear' ? '🚫 Bloquear semana' :
                   modalTipo === 'verBloqueo' ? '🚫 Semana bloqueada' :
                   modalTipo === 'pegarSemana' ? '📋 Pegar semana' : '+ Nueva sesión'}
                </h3>
                <p className="text-gray-400 text-sm">{fechaSel}</p>
                {modalTipo === 'meso' && <p className="text-orange-400 text-xs mt-0.5">Macro: {macroSel?.objetivo}</p>}
                {modalTipo === 'micro' && <p className="text-orange-400 text-xs mt-0.5">Meso: {mesoSel?.objetivo}</p>}
                {modalTipo === 'sesion' && !sesionLibre && <p className="text-orange-400 text-xs mt-0.5">Semana: {microSel?.objetivo}</p>}
                {modalTipo === 'sesion' && sesionLibre && (
                  <p className="text-xs mt-0.5" style={{ color: '#a78bfa' }}>
                    {getMicroDelDia(fechaSel) ? 'Se guardará en la semana de esa fecha' : 'Sesión suelta · sin planificación'}
                  </p>
                )}
              </div>
              <button onClick={() => { setModalTipo(null); setSesionLibre(false) }} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            {modalTipo === 'pegarSemana' && (
              <div className="flex flex-col gap-4">
                <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                  <p className="text-purple-300 text-sm font-medium mb-1">Pegar semana copiada</p>
                  <p className="text-gray-400 text-xs">Las sesiones de la semana del <span className="text-white font-medium">{semanaCopiada}</span> se copiarán en la semana del <span className="text-white font-medium">{semanaDestino}</span>.</p>
                  <p className="text-gray-500 text-xs mt-2">Las sesiones existentes en el destino no se borran.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { if(semanaDestino) pegarSemana(semanaDestino); setModalTipo(null) }}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 py-3 rounded-lg font-medium transition text-sm">
                    Pegar semana
                  </button>
                  <button onClick={() => setModalTipo(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-lg text-sm transition">Cancelar</button>
                </div>
              </div>
            )}

            {modalTipo === 'bloquear' && (
              <form onSubmit={guardarBloqueo} className="flex flex-col gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Día de la semana a bloquear</label>
                  <input type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-red-500 w-full" required />
                  <p className="text-gray-600 text-xs mt-1">Se bloqueará toda la semana que contiene ese día</p>
                </div>
                <input type="text" placeholder="Motivo (viaje, enfermedad, exámenes...)" value={bloqueoMotivo} onChange={e => setBloqueoMotivo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-red-500" />
                <button type="submit" disabled={loading} className="bg-red-700 hover:bg-red-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                  {loading ? 'Guardando...' : '🚫 Bloquear semana'}
                </button>
              </form>
            )}

            {modalTipo === 'verBloqueo' && bloqueoSel && (
              <div className="flex flex-col gap-4">
                <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 text-center">
                  <p className="text-3xl mb-2">🚫</p>
                  <p className="font-bold text-red-300">Semana bloqueada</p>
                  <p className="text-gray-400 text-sm mt-1">Del {bloqueoSel.fecha_inicio?.slice(0,10)}</p>
                  {bloqueoSel.motivo && <p className="text-gray-300 text-sm mt-2">{bloqueoSel.motivo}</p>}
                </div>
                <button onClick={() => borrarBloqueo(bloqueoSel.id)} className="text-red-400 hover:text-red-300 text-sm transition text-center">Eliminar bloqueo</button>
              </div>
            )}

            {modalTipo === 'competicion' && (
              <form onSubmit={guardarCompeticion} className="flex flex-col gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Fecha</label>
                  <input type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-500 w-full" required />
                </div>
                <input type="text" placeholder="Nombre de la competición" value={compNombre} onChange={e => setCompNombre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-500" required />
                <select value={compTipo} onChange={e => setCompTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-500">
                  <option value="">Tipo de prueba (opcional)</option>
                  {CATEGORIAS_PRUEBA.map(cat => (
                    <optgroup key={cat} label={cat}>
                      {PRUEBAS.filter(p => p.categoria === cat).map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="otro">Otro</option>
                </select>
                {pruebaPorId(compTipo) && (
                  <p className="text-xs text-gray-400 -mt-1 px-1">
                    {resumenSegmentos(pruebaPorId(compTipo)!)}{pruebaPorId(compTipo)!.aprox ? ' · distancias aprox.' : ''}
                  </p>
                )}
                <textarea placeholder="Notas (opcional)" value={compNotas} onChange={e => setCompNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-500" rows={2} />
                <button type="submit" disabled={loading} className="bg-yellow-600 hover:bg-yellow-500 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : '🏆 Guardar competición'}</button>
              </form>
            )}

            {modalTipo === 'verCompeticion' && compSel && (
              <div className="flex flex-col gap-4">
                <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 text-center">
                  <p className="text-3xl mb-2">🏆</p>
                  <p className="font-bold text-yellow-300 text-lg">{compSel.nombre}</p>
                  {compSel.tipo && <p className="text-yellow-600 text-sm">{compSel.tipo}</p>}
                  <p className="text-gray-400 text-sm mt-1">{compSel.fecha}</p>
                  {compSel.notas && <p className="text-gray-500 text-xs mt-2">{compSel.notas}</p>}
                </div>
                <div className="text-center">
                  <p className={`text-5xl font-bold ${colorSemanas(semanasHasta(compSel.fecha))}`}>{Math.max(0, semanasHasta(compSel.fecha))}</p>
                  <p className="text-gray-400 text-sm mt-1">{semanasHasta(compSel.fecha) > 0 ? 'semanas restantes' : '¡Esta semana!'}</p>
                </div>
                <button onClick={() => borrarCompeticion(compSel.id)} className="text-red-400 hover:text-red-300 text-sm transition text-center">Eliminar competición</button>
              </div>
            )}

            {modalTipo === 'macro' && (
              <form onSubmit={guardarMacro} className="flex flex-col gap-3">
                <input type="text" placeholder="Objetivo del macrociclo" value={macroObj} onChange={e => setMacroObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <input type="number" placeholder="Duración en semanas" value={macroDuracion} onChange={e => setMacroDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-gray-400 text-xs">Tipo de periodizacion</label>
                    <button type="button" onClick={() => window.open('/periodizacion', '_blank')} className="text-orange-400 hover:text-orange-300 text-xs transition">📖 ¿Como elegir?</button>
                  </div>
                  <select value={tipoPeriodizacion} onChange={e => setTipoPeriodizacion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full">
                    <option value="">Sin especificar</option>
                    <option value="Tradicional">Tradicional</option>
                    <option value="Inversa">Inversa</option>
                    <option value="ATR">ATR (Acumulación-Transmutación-Realización)</option>
                    <option value="Ondulatoria">Ondulatoria</option>
                  </select>
                </div>
                {tipoPeriodizacion && (
                  <GraficaPeriodizacion modelo={tipoPeriodizacion} mostrarInfo={true} />
                )}
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear macrociclo'}</button>
              </form>
            )}
            {modalTipo === 'meso' && (
              <form onSubmit={guardarMeso} className="flex flex-col gap-3">
                <input type="text" placeholder="Objetivo del mesociclo" value={mesoObj} onChange={e => setMesoObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <select value={mesoTipo} onChange={e => setMesoTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Tipo</option>
                  {macroSel?.tipo_periodizacion === 'Tradicional' ? (<>
                    <option value="General">General</option>
                    <option value="Específica">Específica</option>
                    <option value="Competitiva">Competitiva</option>
                    <option value="Taper">Taper</option>
                  </>) : macroSel?.tipo_periodizacion === 'Inversa' ? (<>
                    <option value="Intensidad">Intensidad</option>
                    <option value="Desarrollo">Desarrollo</option>
                    <option value="Resistencia específica">Resistencia específica</option>
                    <option value="Taper">Taper</option>
                  </>) : macroSel?.tipo_periodizacion === 'Ondulatoria' ? (<>
                    <option value="Carga alta">Carga alta</option>
                    <option value="Carga media">Carga media</option>
                    <option value="Recuperación">Recuperación</option>
                  </>) : (<>
                    <option value="Acumulación">Acumulación</option>
                    <option value="Transmutación">Transmutación</option>
                    <option value="Realización">Realización</option>
                    <option value="Recuperación">Recuperación</option>
                  </>)}
                </select>
                <input type="number" placeholder="Duración en semanas" value={mesoDuracion} onChange={e => setMesoDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <input type="number" min="1" max="10" placeholder="Intensidad relativa (1-10)" value={mesoIntensidad} onChange={e => setMesoIntensidad(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />

                {/* Distribución de intensidad objetivo del bloque. Volumen la usa para
                    comparar lo que se entrenó de verdad contra lo que se planificó. */}
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col gap-2">
                  <p className="text-gray-400 text-xs">Distribución de intensidad objetivo <span className="text-gray-600">· opcional</span></p>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { v: 'piramidal', t: 'Piramidal', d: '75–80 · 10–20 · 5–10' },
                      { v: 'polarizado', t: 'Polarizada', d: '75–80 · <10 · 15–20' },
                      { v: 'umbral', t: 'De umbral', d: '40–55 · 35–50 · 5–15' },
                    ] as const).map(o => (
                      <button type="button" key={o.v} onClick={() => setMesoTid(mesoTid === o.v ? '' : o.v)}
                        className={'flex-1 min-w-[110px] rounded-lg px-3 py-2 text-xs border transition text-left ' + (mesoTid === o.v ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500')}>
                        <span className="font-bold block">{o.t}</span>
                        <span className="text-[10px] text-gray-500">{o.d}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-600 text-[10.5px] leading-snug">
                    % de tiempo en suave · media · alta. Suele ser piramidal en preparación general y polarizada en la específica y el taper.
                  </p>
                </div>

                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear mesociclo'}</button>
              </form>
            )}
            {modalTipo === 'micro' && (
              <form onSubmit={guardarMicro} className="flex flex-col gap-3">
                <input type="text" placeholder="Objetivo de la semana" value={microObj} onChange={e => setMicroObj(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
                <select value={microTipo} onChange={e => setMicroTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Tipo</option>
                  <option value="Carga">Carga</option>
                  <option value="Recuperación">Recuperación</option>
                  <option value="Competición">Competición</option>
                </select>
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear semana'}</button>
              </form>
            )}

            {/* Salida rápida: si no quieres montar la estructura, apunta la sesión y listo. */}
            {(modalTipo === 'macro' || modalTipo === 'meso' || modalTipo === 'micro') && (
              <div className="mt-5 pt-4 border-t border-gray-800">
                <p className="text-gray-500 text-xs mb-2.5">¿Solo quieres apuntar un entrenamiento en este día?</p>
                <button onClick={() => { setSesionLibre(true); setModalTipo('sesion') }}
                  className="w-full flex items-center justify-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/35 text-purple-300 py-2.5 rounded-lg text-sm font-semibold transition">
                  + Añadir sesión libre
                </button>
              </div>
            )}

            {modalTipo === 'editarSesion' && (
              <form onSubmit={guardarEdicionSesion} className="flex flex-col gap-3">
                <select value={sesionDisc} onChange={e => setSesionDisc(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Disciplina</option>
                  <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option><option>Brick</option>
                </select>
                {sesionDisc === 'Fuerza' && (
                  <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col gap-2">
                    <p className="text-gray-400 text-xs">Tipo de sesión de fuerza</p>
                    <div className="flex gap-2">
                      {[{ v: 'simple', t: 'Simple', d: 'una cualidad' }, { v: 'compleja', t: 'Compleja', d: 'varias por tarea' }].map(o => (
                        <button type="button" key={o.v} onClick={() => setSesionModoFuerza(o.v)}
                          className={'flex-1 rounded-lg px-3 py-2 text-xs border transition text-left ' + (sesionModoFuerza === o.v ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500')}>
                          <span className="font-bold block">{o.t}</span><span className="text-[10px] text-gray-500">{o.d}</span>
                        </button>
                      ))}
                    </div>
                    {sesionModoFuerza === 'simple' && (
                      <select value={sesionZonaFuerza} onChange={e => setSesionZonaFuerza(e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                        <option value="">Zona de fuerza de la sesión…</option>
                        {ZONAS_FUERZA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {/* Mismo concepto en resistencia. Solo con Zonas 2: con Z1–Z7 no aplica. */}
                {zonas2 && DISC_RESISTENCIA.includes(sesionDisc) && (
                  <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col gap-2">
                    <p className="text-gray-400 text-xs">Tipo de sesión de resistencia</p>
                    <div className="flex gap-2">
                      {[{ v: 'simple', t: 'Simple', d: 'una zona' }, { v: 'compleja', t: 'Compleja', d: 'varias por tarea' }].map(o => (
                        <button type="button" key={o.v} onClick={() => setSesionModoRes(o.v)}
                          className={'flex-1 rounded-lg px-3 py-2 text-xs border transition text-left ' + (sesionModoRes === o.v ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500')}>
                          <span className="font-bold block">{o.t}</span><span className="text-[10px] text-gray-500">{o.d}</span>
                        </button>
                      ))}
                    </div>
                    {sesionModoRes === 'simple' && (
                      <select value={sesionZonaRes} onChange={e => setSesionZonaRes(e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                        <option value="">Zona de la sesión…</option>
                        {ZONAS_RESISTENCIA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {sesionDisc === 'Brick' && <ConstructorBrick valor={brick} onChange={setBrick} depId={Number(id)} />}
                {sesionDisc !== 'Brick' && <input type="number" placeholder="Duración manual en min (opcional — si vacío, se estima)" value={sesionDuracion} onChange={e => setSesionDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />}
                <input type="number" min="1" max="10" placeholder={sesionDisc === 'Brick' ? 'RPE estimado (opcional — si vacío, se calcula de las zonas)' : 'RPE estimado'} value={sesionRpe} onChange={e => setSesionRpe(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Notas para el atleta" value={sesionNotas} onChange={e => setSesionNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar cambios'}</button>
              </form>
            )}
            {modalTipo === 'sesion' && (
              <form onSubmit={guardarSesion} className="flex flex-col gap-3">
                <select value={sesionDisc} onChange={e => setSesionDisc(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
                  <option value="">Disciplina</option>
                  <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option><option>Brick</option>
                </select>
                {sesionDisc === 'Fuerza' && (
                  <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col gap-2">
                    <p className="text-gray-400 text-xs">Tipo de sesión de fuerza</p>
                    <div className="flex gap-2">
                      {[{ v: 'simple', t: 'Simple', d: 'una cualidad' }, { v: 'compleja', t: 'Compleja', d: 'varias por tarea' }].map(o => (
                        <button type="button" key={o.v} onClick={() => setSesionModoFuerza(o.v)}
                          className={'flex-1 rounded-lg px-3 py-2 text-xs border transition text-left ' + (sesionModoFuerza === o.v ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500')}>
                          <span className="font-bold block">{o.t}</span><span className="text-[10px] text-gray-500">{o.d}</span>
                        </button>
                      ))}
                    </div>
                    {sesionModoFuerza === 'simple' && (
                      <select value={sesionZonaFuerza} onChange={e => setSesionZonaFuerza(e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                        <option value="">Zona de fuerza de la sesión…</option>
                        {ZONAS_FUERZA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {/* Mismo concepto en resistencia. Solo con Zonas 2: con Z1–Z7 no aplica. */}
                {zonas2 && DISC_RESISTENCIA.includes(sesionDisc) && (
                  <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col gap-2">
                    <p className="text-gray-400 text-xs">Tipo de sesión de resistencia</p>
                    <div className="flex gap-2">
                      {[{ v: 'simple', t: 'Simple', d: 'una zona' }, { v: 'compleja', t: 'Compleja', d: 'varias por tarea' }].map(o => (
                        <button type="button" key={o.v} onClick={() => setSesionModoRes(o.v)}
                          className={'flex-1 rounded-lg px-3 py-2 text-xs border transition text-left ' + (sesionModoRes === o.v ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500')}>
                          <span className="font-bold block">{o.t}</span><span className="text-[10px] text-gray-500">{o.d}</span>
                        </button>
                      ))}
                    </div>
                    {sesionModoRes === 'simple' && (
                      <select value={sesionZonaRes} onChange={e => setSesionZonaRes(e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                        <option value="">Zona de la sesión…</option>
                        {ZONAS_RESISTENCIA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {sesionDisc === 'Brick' && <ConstructorBrick valor={brick} onChange={setBrick} depId={Number(id)} />}
                {sesionDisc !== 'Brick' && <p className="text-gray-500 text-xs px-1 -mb-1">La duración se estima automáticamente a partir de las tareas. Podrás ajustarla a mano después.</p>}
                <input type="number" min="1" max="10" placeholder={sesionDisc === 'Brick' ? 'RPE estimado (opcional — si vacío, se calcula de las zonas)' : 'RPE estimado (1-10)'} value={sesionRpe} onChange={e => setSesionRpe(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <textarea placeholder="Notas para el atleta" value={sesionNotas} onChange={e => setSesionNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
                <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Crear sesión'}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: catálogo de tipos de prueba */}
      {mostrarCatalogo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setMostrarCatalogo(false)}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-4 p-5 border-b border-gray-800">
              <div>
                <h3 className="text-xl font-bold">🏁 Tipos de prueba</h3>
                <p className="text-gray-500 text-xs mt-1">Formatos de competición y sus distancias de referencia</p>
              </div>
              <button onClick={() => setMostrarCatalogo(false)} className="text-gray-400 hover:text-white text-2xl leading-none flex-shrink-0">×</button>
            </div>
            <div className="overflow-auto p-4 flex flex-col gap-5">
              {CATEGORIAS_PRUEBA.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">{cat}</p>
                  <div className="flex flex-col divide-y divide-gray-800/70">
                    {PRUEBAS.filter(p => p.categoria === cat).map(p => (
                      <div key={p.id} className="flex justify-between items-baseline gap-4 py-2">
                        <span className="text-sm font-medium text-gray-200 flex-shrink-0">{p.nombre}</span>
                        <span className="text-xs text-gray-400 text-right">{resumenSegmentos(p)}{p.aprox ? ' · aprox.' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
