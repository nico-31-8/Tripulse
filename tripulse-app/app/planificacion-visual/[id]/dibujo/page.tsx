'use client'
import { useRouter } from 'next/navigation'
import { seriesPorGrupo, totalSeries as sumaSeries } from '@/lib/series-por-grupo'
import { useState, useEffect, use, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { semanasEntre } from '@/lib/fechas'
import { vivas } from '@/lib/papelera'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { ZONAS_RESISTENCIA, ZONAS_FUERZA } from '@/lib/zonas'
import ConstructorBrick from '@/components/ConstructorBrick'
import { BRICK_VACIO, brickValido, zonaPicoBrick, type BrickValor } from '@/lib/bricks'
import type { ChipZona } from '@/lib/chips'
import { BotonGuiaZonas, type TestsAtleta } from '@/components/GuiaZonas'
import { diasEntre, sumarDias, aplicarDesplazamiento, aplicarDuracion } from '@/lib/desplazar'
import { estimarDuraciones, cargaPlanificada, cargaReal } from '@/lib/duracion-carga'
import type { ResultadoDuracion } from '@/lib/duracion'
import { chipsDeSesiones, fusionarChips } from '@/lib/chips-desde-sesiones'
import { TIPOS_MICROCICLO, tipoMicrociclo } from '@/lib/microciclo-tipos'
import { PRIORIDADES, prioridadDe, defDe, type Prioridad } from '@/lib/competicion-prioridad'

// Zonas clásicas Z1–Z7 (sistema 1) con su color.
const ZONAS_CLASICAS = [
  { sigla: 'Z1', color: '#6B7280' }, { sigla: 'Z2', color: '#3B82F6' }, { sigla: 'Z3', color: '#EAB308' },
  { sigla: 'Z4', color: '#F97316' }, { sigla: 'Z5', color: '#EF4444' }, { sigla: 'Z6', color: '#7C3AED' },
  { sigla: 'Z7', color: '#EC4899' },
]
// Mapa sigla → color válido para ambos sistemas (Z1–Z7 + siglas Zonas 2 resistencia y fuerza).
const COLOR_ZONA: Record<string, string> = {
  ...Object.fromEntries(ZONAS_CLASICAS.map(z => [z.sigla, z.color])),
  ...Object.fromEntries(ZONAS_RESISTENCIA.map(z => [z.sigla, z.color])),
  ...Object.fromEntries(ZONAS_FUERZA.map(z => [z.sigla, z.color])),
}
// Nombre completo de una zona (para tooltip), busca en resistencia y fuerza.
const NOMBRE_ZONA = (sigla: string): string =>
  ZONAS_RESISTENCIA.find(z => z.sigla === sigla)?.nombre ||
  ZONAS_FUERZA.find(z => z.sigla === sigla)?.nombre || ''

const SEMANA_W_DEFAULT = 90
const SEMANA_W_MIN = 40
const SEMANA_W_MAX = 160
const UA_H = 180
// Ancho de la columna de etiquetas (MACRO/MESO/MICRO/ZONAS). Es un margen real
// reservado antes de la semana 1, no una superposición — así la semana 1 nunca
// queda tapada ni encogida detrás de la etiqueta.
const LABEL_W = 56

interface MacroD { id: string; si: number; sf: number; nombre: string; tipo: string; dbId?: number }
interface MesoD { id: string; macroId: string; si: number; sf: number; nombre: string; tipo: string; intensidad: number; dbId?: number }
interface SemanaD { i: number; ua: number | null; tipo: string; comp: string }
interface Preview { band: string; si: number; sf: number }

function uid() { return Math.random().toString(36).slice(2) }

function hexToRgb(hex: string) {
  const h = (hex || '#EA580C').replace('#', '')
  return { r: parseInt(h.slice(0,2),16) || 234, g: parseInt(h.slice(2,4),16) || 88, b: parseInt(h.slice(4,6),16) || 12 }
}

const C_MACRO: Record<string, string> = {
  Tradicional: '#EA580C', Inversa: '#7C3AED', ATR: '#0D9488', Ondulatoria: '#B45309',
}
const C_MESO: Record<string, string> = {
  'Acumulacion': '#EA580C', 'Acumulación': '#EA580C', 'Transmutacion': '#EAB308', 'Transmutación': '#EAB308',
  'Realizacion': '#EF4444', 'Realización': '#EF4444', 'Recuperacion': '#22C55E', 'Recuperación': '#22C55E',
  General: '#F97316', 'Especifica': '#FB923C', 'Específica': '#FB923C', Competitiva: '#DC2626',
  Taper: '#6B7280', Intensidad: '#7C3AED', Desarrollo: '#A855F7',
  'Resistencia especifica': '#EC4899', 'Resistencia específica': '#EC4899',
  'Carga alta': '#F59E0B', 'Carga media': '#FBBF24',
}
const C_TIPO: Record<string, string> = {
  Carga: '#EA580C', 'Recuperacion': '#22C55E', 'Recuperación': '#22C55E',
  'Competicion': '#3B82F6', 'Competición': '#3B82F6', Taper: '#A855F7',
}
// Los tres que admite el CHECK de `microciclo.tipo`. Aquí había un cuarto,
// «Taper», que la base RECHAZA: elegirlo y darle a generar reventaba el guardado
// con un error de Postgres en crudo. Ahora la lista viene de un solo sitio.
const TIPOS: string[] = [...TIPOS_MICROCICLO]

function mesoOpts(tipo: string): string[] {
  if (tipo === 'Tradicional') return ['General', 'Específica', 'Competitiva', 'Taper']
  if (tipo === 'Inversa') return ['Intensidad', 'Desarrollo', 'Resistencia específica', 'Taper']
  if (tipo === 'Ondulatoria') return ['Carga alta', 'Carga media', 'Recuperación']
  return ['Acumulación', 'Transmutación', 'Realización', 'Recuperación']
}
function semLabel(fi: string, i: number): string {
  if (!fi) return 'S' + (i + 1)
  try { const d = new Date(fi + 'T12:00:00'); d.setDate(d.getDate() + i * 7); return d.getDate() + '/' + (d.getMonth() + 1) } catch { return 'S' + (i + 1) }
}
function semFecha(fi: string, i: number): string {
  if (!fi) return ''
  try { const d = new Date(fi + 'T12:00:00'); d.setDate(d.getDate() + i * 7); return d.toISOString().split('T')[0] } catch { return '' }
}

export default function DibujoPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  useRequireEntrenador()
  const [dep, setDep] = useState<any>(null)
  const [tests, setTests] = useState<TestsAtleta | null>(null)
  /**
   * Las competiciones de la tabla `competicion`, las mismas que el calendario.
   *
   * Antes el lienzo guardaba la suya como TEXTO en la semana, dentro del
   * borrador: marcar una aqui no creaba nada en el calendario y al reves
   * tampoco. Dos listas de carreras para el mismo atleta, y ninguna de las dos
   * sabia de la otra.
   */
  const [compsReales, setCompsReales] = useState<any[]>([])
  const [fCompFecha, setFCompFecha] = useState('')
  const [fCompPrio, setFCompPrio] = useState<Prioridad>('A')
  const testsRef = useRef<TestsAtleta>({})
  // Duración estimada de cada sesión, por id. Es lo que convierte «no tiene
  // duración escrita» en volumen de verdad para la capa de programado.
  const [duraciones, setDuraciones] = useState<Record<number, ResultadoDuracion>>({})
  const [reconstruyendo, setReconstruyendo] = useState(false)
  const [pantalla, setPantalla] = useState<'cargando'|'elegir'|'setup'|'canvas'>('cargando')
  const [macrosExistentes, setMacrosExistentes] = useState<any[]>([])
  const [modoEdicion, setModoEdicion] = useState(false)
  const [fechaInicio, setFechaInicio] = useState('')
  const [totalSem, setTotalSem] = useState(24)
  const [macros, setMacros] = useState<MacroD[]>([])
  const [mesos, setMesos] = useState<MesoD[]>([])
  const [sems, setSems] = useState<SemanaD[]>([])
  const [dragWk, setDragWk] = useState<number | null>(null)
  const [dragY0, setDragY0] = useState(0)
  const [dragUA0, setDragUA0] = useState(0)
  const [dragMaxUA0, setDragMaxUA0] = useState(200)
  const [editWk, setEditWk] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [modal, setModal] = useState<string | null>(null)
  const [mIdx, setMIdx] = useState(0)
  const [mMacId, setMMacId] = useState('')
  const [fNom, setFNom] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fIni, setFIni] = useState(0)
  const [fDur, setFDur] = useState(4)
  const [fInt, setFInt] = useState(7)
  const [fComp, setFComp] = useState('')
  const [taperSug, setTaperSug] = useState<number[]>([])
  const [panelTab, setPanelTab] = useState('plan')
  const [generando, setGenerando] = useState(false)
  const [generado, setGenerado] = useState(false)
  const [dragPreview, setDragPreview] = useState<Preview | null>(null)
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [guardandoBorrador, setGuardandoBorrador] = useState(false)
  const [ultimoGuardado, setUltimoGuardado] = useState<string | null>(null)
  const guardadoTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [sesionesProg, setSesionesProg] = useState<any[]>([])
  const [capas, setCapas] = useState<Set<string>>(new Set(['plan']))
  const [semSelIdx, setSemSelIdx] = useState<number | null>(null)
  const [popupBarra, setPopupBarra] = useState<number | null>(null)
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null)
  const [detalleSem, setDetalleSem] = useState<any>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const toggleCapa = (k: string) => setCapas(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [modalEditar, setModalEditar] = useState<{tipo: 'macro'|'meso', item: MacroD|MesoD} | null>(null)
  const [editNom, setEditNom] = useState('')
  const [editTipo, setEditTipo] = useState('')
  const [editDur, setEditDur] = useState(4)
  const [editInt, setEditInt] = useState(7)
  const [sesZonas, setSesZonas] = useState<ChipZona[]>([])
  const [zonaSelBrick, setZonaSelBrick] = useState<BrickValor>(BRICK_VACIO)
  const [popupZona, setPopupZona] = useState<{semana:number;x:number;y:number}|null>(null)
  const [popupMeso, setPopupMeso] = useState<{ me: MesoD; x: number; y: number } | null>(null)
  const [zonaSelDisc, setZonaSelDisc] = useState('Natacion')
  const [zonaSelZona, setZonaSelZona] = useState('Z1')
  const [filtroDisc, setFiltroDisc] = useState<string[]>(['Natacion','Ciclismo','Carrera','Fuerza'])
  const [semanaW, setSemanaW] = useState(SEMANA_W_DEFAULT)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [exportando, setExportando] = useState(false)
  const dragBandRef = useRef<'macro' | 'meso' | null>(null)
  const movingBlockRef = useRef<{tipo: 'macro'|'meso', id: string, offsetSem: number} | null>(null)
  const [movePreview, setMovePreview] = useState<{tipo: string, si: number, sf: number, id: string} | null>(null)
  const [mostrarCurva, setMostrarCurva] = useState(true)
  const [mostrarTendencia, setMostrarTendencia] = useState(false)
  const dragSiRef = useRef(0)
  const dragSfRef = useRef(0)
  const macrosRef = useRef<MacroD[]>([])
  const mesosRef = useRef<MesoD[]>([])
  // Distinguir clic corto (abre popup) de arrastre (mueve) en la barra de meso
  const mesoClickRef = useRef<{ x: number; y: number; me: MesoD } | null>(null)
  const mesoMovedRef = useRef(false)
  const mesoClickTimerRef = useRef<any>(null)
  const movePreviewRef = useRef<{tipo: string, si: number, sf: number, id: string} | null>(null)
  const sesZonasRef = useRef<ChipZona[]>([])
  // Copia viva de todo lo autoguardable, para poder volcar el borrador al salir.
  const flushDataRef = useRef<{ macros: MacroD[]; mesos: MesoD[]; sems: SemanaD[]; fechaInicio: string; totalSem: number; sesZonas: any[] }>({ macros: [], mesos: [], sems: [], fechaInicio: '', totalSem: 24, sesZonas: [] })

  /**
   * NADA se autoguarda hasta que el borrador se ha terminado de leer.
   *
   * ESTO COSTÓ LOS CHIPS DE UN ATLETA. El cargador hace `setMacros`, `setMesos`
   * y `setSems`, y cada uno dispara su efecto de autoguardado. Los chips de
   * zonas se leen del borrador AL FINAL de ese mismo cargador, así que durante
   * un rato el estado tiene macros y semanas pero `sesZonas` vacío — y si algo
   * corta el cargador antes de llegar al final, ese vacío es lo que se guarda:
   * el autoguardado escribe `sesiones_zonas: []` encima de los buenos y no hay
   * forma de recuperarlos.
   *
   * O sea que la ventana no la abrió el fallo de aquel día: ya estaba abierta,
   * y cualquier error en mitad del cargador la habría disparado igual.
   *
   * El guardián es la bandera, no comprobar si `sesZonas` viene vacío: vaciarlos
   * a propósito es legítimo, y confundir «no cargado» con «vacío» es justo la
   * confusión que hay que quitar de en medio.
   */
  const borradorCargadoRef = useRef(false)
  const puedeGuardar = () => borradorCargadoRef.current && macros.length > 0 && !!fechaInicio

  useEffect(() => {
    macrosRef.current = macros
    if (puedeGuardar()) dispararGuardado(macros, mesos, sems, fechaInicio, totalSem, sesZonas)
  }, [macros])
  useEffect(() => {
    mesosRef.current = mesos
    if (puedeGuardar()) dispararGuardado(macros, mesos, sems, fechaInicio, totalSem, sesZonas)
  }, [mesos])

  /**
   * Las duraciones estimadas, APARTE del cargador.
   *
   * Estaban dentro de `cargarExistente`, con su `await` en mitad de la función.
   * Los chips de zonas se leen del borrador AL FINAL de esa misma función, así
   * que cualquier fallo aquí —cuatro consultas más— se llevaba por delante todo
   * lo que venía después: la fila de ZONAS se quedaba vacía y no había ni un
   * error en pantalla que lo explicara.
   *
   * Esto es un extra para que la capa «Programado» tenga volumen. Si falla, se
   * queda corta; no puede tumbar el dibujo.
   */
  useEffect(() => {
    if (!sesionesProg.length) { setDuraciones({}); return }
    let vivo = true
    estimarDuraciones(supabase, sesionesProg.map((s: any) => s.id), testsRef.current)
      .then(d => { if (vivo) setDuraciones(d) })
      .catch(() => {})
    return () => { vivo = false }
  }, [sesionesProg])

  // Carga inicial — detecta si hay ciclos existentes
  useEffect(() => {
    const init = async () => {
      const { data: depData } = await supabase.from('deportista').select('*').eq('id', id).single()
      setDep(depData)
      // Los tests son solo para la guía de zonas: sin ellos enseña porcentajes,
      // con ellos los ritmos reales de este atleta. Que falten no rompe nada.
      const [tCarr, tNat, tCic] = await Promise.all([
        supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', id).order('fecha', { ascending: false }).limit(1),
        supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', id).order('fecha', { ascending: false }).limit(1),
        supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', id).order('fecha', { ascending: false }).limit(1),
      ])
      const t = { vam: tCarr.data?.[0]?.vam, css: tNat.data?.[0]?.css, ftp: tCic.data?.[0]?.ftp }
      setTests(t)
      // En una ref además del estado: `cargarExistente` corre justo después y
      // necesita los tests para estimar duraciones. Leerlos del estado ahí sería
      // leerlos antes de que React lo haya aplicado.
      testsRef.current = t
      const { data: macs } = await supabase.from('macrociclo').select('*').eq('id_deportista', id).order('fecha_inicio')
      if (macs && macs.length > 0) {
        setMacrosExistentes(macs)
        const autoEditar = new URLSearchParams(window.location.search).get('editar') === '1'
        if (autoEditar) {
          await cargarExistente()
        } else {
          setPantalla('elegir')
        }
      } else {
        setPantalla('setup')
      }
    }
    init()
  }, [id])

  useEffect(() => {
    if (puedeGuardar()) dispararGuardado(macros, mesos, sems, fechaInicio, totalSem, sesZonas)
  }, [sems])
  useEffect(() => {
    sesZonasRef.current = sesZonas
    if (puedeGuardar()) dispararGuardado(macros, mesos, sems, fechaInicio, totalSem, sesZonas)
  }, [sesZonas])

  // Mantener flushDataRef al día en cada render.
  useEffect(() => { flushDataRef.current = { macros, mesos, sems, fechaInicio, totalSem, sesZonas } })

  // Volcar el borrador de inmediato al salir de la página (navegación / cierre / recarga),
  // por si el autoguardado (1,5s) aún no había disparado. Solo si hay algo pendiente.
  useEffect(() => {
    const flush = () => {
      if (!guardadoTimerRef.current) return
      clearTimeout(guardadoTimerRef.current); guardadoTimerRef.current = null
      const d = flushDataRef.current
      if (d.fechaInicio && d.macros.length) guardarBorrador(d.macros, d.mesos, d.sems, d.fechaInicio, d.totalSem, d.sesZonas)
    }
    window.addEventListener('beforeunload', flush)
    return () => { window.removeEventListener('beforeunload', flush); flush() }
  }, [])

  useEffect(() => {
    if (pantalla !== 'canvas') return
    setSems(prev => Array.from({ length: totalSem }, (_, i) => prev.find(s => s.i === i) || { i, ua: null, tipo: 'Carga', comp: '' }))
  }, [totalSem, pantalla])

  // Carga planificacion existente al canvas
  /*
   * DE SEIS VIAJES EN SERIE A UNO.
   *
   * Encadenaba macrociclo → mesociclo → microciclo → sesiones del plan →
   * sesiones libres → borrador. Ahora todo va por `id_deportista` en una sola
   * ronda: mesociclos y microciclos ya lo llevan desde la Fase A, y las
   * sesiones lo llevan siempre (lo garantiza la política RLS de `sesion`).
   *
   * Y ESTO ES MÁS SEGURO, no solo más rápido. El autoguardado de esta pantalla
   * llegó a borrar los chips de zonas de un atleta: entre los `setMacros` /
   * `setMesos` / `setSems` de la carga y la lectura del borrador había awaits,
   * y cada setState dispara su efecto. Con una sola ronda, TODOS los setState
   * caen seguidos y sin un solo await entre medias, así que esa ventana ya no
   * existe. El guardián (`borradorCargadoRef`) se queda igual: es la red, no el
   * arreglo.
   *
   * Las sesiones libres se cargan SIEMPRE. Antes estaban dentro del
   * `if (microIds.length)`, así que a quien no tenía microciclos no se le
   * contaban ni en Programado ni en Realizado — el mismo fallo que había en el
   * calendario.
   */
  const cargarExistente = async () => {
    setCargandoDatos(true)
    try {
      const depId = Number(id)
      const selProg = 'id, disciplina, fecha_sesion, duracion_minutos, duracion_real, rpe_estimado, rpe_reportado, estado, id_microciclo'

      const [macs, mesosQ, microsQ, sesQ, borr] = await Promise.all([
        supabase.from('macrociclo').select('*').eq('id_deportista', depId).order('fecha_inicio'),
        supabase.from('mesociclo').select('*').eq('id_deportista', depId),
        supabase.from('microciclo').select('*').eq('id_deportista', depId),
        // `duracion_real` va en el select: sin ella, una sesión cerrada con el
        // cronómetro contaba por lo planificado (o por nada, si no había
        // duración manual).
        vivas(supabase.from('sesion').select(selProg).eq('id_deportista', depId)),
        supabase.from('dibujo_borrador').select('*').eq('id_deportista', depId).maybeSingle(),
      ])

      const macsData = macs.data
      if (!macsData?.length) { setPantalla('setup'); setCargandoDatos(false); return }

      const fi = macsData[0].fecha_inicio
      const totalW = Math.max(12, macsData.reduce((max: number, m: any) => {
        return Math.max(max, semanasEntre(fi, m.fecha_inicio) + m.duracion_semanas)
      }, 12))

      const macrosD: MacroD[] = macsData.map((m: any) => ({
        id: uid(), dbId: m.id,
        si: semanasEntre(fi, m.fecha_inicio),
        sf: semanasEntre(fi, m.fecha_inicio) + m.duracion_semanas - 1,
        nombre: m.objetivo,
        tipo: m.tipo_periodizacion || 'Tradicional',
      }))

      const mesosData = mesosQ.data || []
      const mesosD: MesoD[] = mesosData.map((me: any) => {
        const parentMacroD = macrosD.find(m => m.dbId === me.id_macrociclo)
        return {
          id: uid(), dbId: me.id, macroId: parentMacroD?.id || '',
          si: semanasEntre(fi, me.fecha_inicio),
          sf: semanasEntre(fi, me.fecha_inicio) + me.duracion_semanas - 1,
          nombre: me.objetivo, tipo: me.tipo, intensidad: me.intensidad_relativa || 5,
        }
      })

      const microsData = microsQ.data || []
      const semsD = microsData.length
        ? Array.from({ length: totalW }, (_, k) => {
            const micro = microsData.find((mi: any) => semanasEntre(fi, mi.fecha_inicio) === k)
            return { i: k, ua: micro?.ua_planificada || null, tipo: micro?.tipo || 'Carga', comp: '' }
          })
        : null

      /* El borrador MANDA sobre lo reconstruido de las tablas: es el último
         estado que dibujó el entrenador, y la carga o las semanas que aún no ha
         «Generado» no están en las tablas confirmadas. Reconstruir solo desde
         ellas borraría lo dibujado. */
      const bz = borr.data

      // Desde aquí, todos los setState seguidos y sin ningún await en medio.
      setFechaInicio(fi)
      setTotalSem(bz?.total_semanas || totalW)
      setMacros(bz?.macros?.length ? bz.macros : macrosD)
      if (bz?.mesos?.length) setMesos(bz.mesos)
      else if (mesosD.length) setMesos(mesosD)
      if (bz?.semanas?.length) setSems(bz.semanas)
      else if (semsD) setSems(semsD)
      if (bz?.sesiones_zonas?.length) setSesZonas(bz.sesiones_zonas)
      setSesionesProg(sesQ.data || [])
      setModoEdicion(true)

      /* Y SOLO AQUÍ se abre el autoguardado. Si el cargador se cae antes, la
         bandera se queda en false y no se escribe nada: no guardar es un
         incordio, pero guardar un estado a medias borra lo que había y eso no
         se deshace. */
      borradorCargadoRef.current = true
      setPantalla('canvas')
    } catch (e: any) { alert('Error al cargar: ' + e.message) }
    setCargandoDatos(false)
  }

  const cargarBorrador = async () => {
    const { data } = await supabase.from('dibujo_borrador').select('*').eq('id_deportista', Number(id)).single()
    if (!data) return null
    if (data.sesiones_zonas) setSesZonas(data.sesiones_zonas)
    return data
  }

  /**
   * Rehacer los chips de lo ya programado leyendo el calendario.
   *
   * Existe porque el autoguardado llegó a escribir `sesiones_zonas: []` encima
   * de los buenos, y `dibujo_borrador` se actualiza en su sitio: no hay
   * histórico. Un chip es semana + disciplina + zona, y una sesión programada
   * tiene las tres, así que se reconstruyen enteros.
   *
   * Los chips que aún NO se han bajado al calendario se conservan: son los
   * únicos que no están en ninguna otra tabla.
   */
  const reconstruirChips = async () => {
    if (!fechaInicio) { alert('El lienzo no tiene fecha de inicio.'); return }
    setReconstruyendo(true)
    try {
      const ses = sesionesProg
      if (!ses.length) { alert('No hay sesiones en el calendario de este atleta.'); return }

      const { data: tareas } = await supabase.from('tarea')
        .select('id_sesion, zona_entrenamiento').in('id_sesion', ses.map((s: any) => s.id))

      const nuevos = chipsDeSesiones(ses.map((s: any) => ({
        id: s.id,
        fecha_sesion: String(s.fecha_sesion).slice(0, 10),
        disciplina: s.disciplina,
        zonas: (tareas || []).filter((t: any) => t.id_sesion === s.id).map((t: any) => t.zona_entrenamiento),
      })), fechaInicio, totalSem)

      const fusion = fusionarChips(sesZonas, nuevos)
      setSesZonas(fusion)
      // Se guarda ya, sin esperar al autoguardado: lo que se acaba de recuperar
      // no puede depender de que no se cierre la pestaña en los próximos 1,5 s.
      await guardarBorrador(macros, mesos, sems, fechaInicio, totalSem, fusion)

      const sinZona = ses.length - nuevos.length
      alert('Recuperados ' + nuevos.length + ' chips de sesiones ya programadas.' +
        (sinZona > 0 ? '\n\n' + sinZona + ' sesiones no han dado chip: o no tienen zona en sus tareas, o caen fuera de las semanas del lienzo.' : ''))
    } catch (e: any) {
      alert('No se han podido rehacer: ' + e.message)
    }
    setReconstruyendo(false)
  }

  const iniciarNuevo = () => {
    if (!fechaInicio) { alert('Elige una fecha de inicio'); return }
    setSems(Array.from({ length: totalSem }, (_, i) => ({ i, ua: null, tipo: 'Carga', comp: '' })))
    setMacros([]); setMesos([])
    setModoEdicion(false)
    // Empezar de cero también es un estado deliberado del entrenador, así que
    // desde aquí sí se autoguarda: lo que hay en pantalla es lo que quiere.
    borradorCargadoRef.current = true
    setPantalla('canvas')
  }

  const getWeekFromClientX = (clientX: number): number => {
    const container = scrollRef.current; if (!container) return 0
    const rect = container.getBoundingClientRect()
    const x = clientX - rect.left + container.scrollLeft - LABEL_W
    return Math.max(0, Math.min(totalSem - 1, Math.floor(x / semanaW)))
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Mover bloque existente
      if (movingBlockRef.current) {
        const { tipo, id, offsetSem } = movingBlockRef.current
        if (tipo === 'meso' && mesoClickRef.current && Math.abs(e.clientX - mesoClickRef.current.x) > 4) mesoMovedRef.current = true
        const wi = getWeekFromClientX(e.clientX)
        const newSi = Math.max(0, wi - offsetSem)
        if (tipo === 'macro') {
          const mac = macrosRef.current.find(m => m.id === id)
          if (mac) {
            const dur = mac.sf - mac.si
            const newSf = Math.min(newSi + dur, totalSem - 1)
            movePreviewRef.current = { tipo: 'macro', si: newSi, sf: newSf, id }
        setMovePreview({ tipo: 'macro', si: newSi, sf: newSf, id })
          }
        } else {
          const me = mesosRef.current.find(m => m.id === id)
          if (me) {
            const mac = macrosRef.current.find(m => m.id === me.macroId)
            const dur = me.sf - me.si
            const safeSi = mac ? Math.max(mac.si, newSi) : newSi
            const safeSf = mac ? Math.min(mac.sf, safeSi + dur) : safeSi + dur
            movePreviewRef.current = { tipo: 'meso', si: safeSi, sf: safeSf, id }
        setMovePreview({ tipo: 'meso', si: safeSi, sf: safeSf, id })
          }
        }
        return
      }
      if (!dragBandRef.current) return
      const wi = getWeekFromClientX(e.clientX)
      dragSfRef.current = wi
      const si = Math.min(dragSiRef.current, wi); const sf = Math.max(dragSiRef.current, wi)
      setDragPreview({ band: dragBandRef.current, si, sf })
    }
    const onUp = () => {
      // Confirmar movimiento de bloque
      if (movingBlockRef.current) {
        const { tipo, id } = movingBlockRef.current
        // Clic corto sobre un meso (sin arrastrar) → abrir popup en vez de mover.
        // Se retrasa 220ms para que un doble clic (editar) pueda cancelarlo.
        if (tipo === 'meso' && !mesoMovedRef.current && mesoClickRef.current) {
          const c = mesoClickRef.current
          movingBlockRef.current = null; movePreviewRef.current = null; setMovePreview(null); mesoClickRef.current = null
          clearTimeout(mesoClickTimerRef.current)
          mesoClickTimerRef.current = setTimeout(() => setPopupMeso({ me: c.me, x: c.x, y: c.y }), 220)
          return
        }
        const preview = movePreviewRef.current
        if (preview) {
          if (tipo === 'macro') {
            const oldMac = macrosRef.current.find(m => m.id === id)
            if (oldMac) {
              const delta = preview.si - oldMac.si
              setMacros(p => p.map(m => m.id === id ? { ...m, si: preview.si, sf: preview.sf } : m))
              setMesos(p => p.map(me => {
                if (me.macroId !== id) return me
                const dur = me.sf - me.si
                const newSi = Math.max(preview.si, Math.min(preview.sf - dur, me.si + delta))
                const newSf = newSi + dur
                return { ...me, si: newSi, sf: newSf }
              }))
            }
          } else {
            setMesos(p => p.map(m => m.id === id ? { ...m, si: preview.si, sf: preview.sf } : m))
          }
        }
        movingBlockRef.current = null
        movePreviewRef.current = null
        setMovePreview(null)
        return
      }
      movingBlockRef.current = null
      setMovePreview(null)
      if (!dragBandRef.current) return
      const band = dragBandRef.current
      const si = Math.min(dragSiRef.current, dragSfRef.current)
      const sf = Math.max(dragSiRef.current, dragSfRef.current)
      dragBandRef.current = null; setDragPreview(null)
      if (band === 'macro') {
        if (macrosRef.current.some(m => si <= m.sf && sf >= m.si)) return
        setFNom(''); setFTipo('Tradicional'); setFIni(si); setFDur(sf - si + 1); setModal('macro')
      } else if (band === 'meso') {
        const mac = macrosRef.current.find(m => si >= m.si && si <= m.sf); if (!mac) return
        const safeSf = Math.min(sf, mac.sf)
        if (mesosRef.current.filter(m => m.macroId === mac.id).some(m => si <= m.sf && safeSf >= m.si)) return
        setFNom(''); setFTipo(mesoOpts(mac.tipo)[0]); setFIni(si); setFDur(safeSf - si + 1); setFInt(7)
        setMMacId(mac.id); setModal('meso')
      }
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [totalSem])

  useEffect(() => {
    if (dragWk === null) return
    const onMove = (e: MouseEvent) => {
      const dy = dragY0 - e.clientY
      setSems(prev => prev.map(s => s.i === dragWk ? { ...s, ua: Math.max(0, Math.round((dragUA0 + dy * dragMaxUA0 / UA_H) / 25) * 25) } : s))
    }
    const onUp = () => setDragWk(null)
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragWk, dragY0, dragUA0, dragMaxUA0])

  const macAt = (wi: number) => macros.find(m => wi >= m.si && wi <= m.sf)
  const mesoAt = (wi: number) => mesos.find(m => wi >= m.si && wi <= m.sf)
  const maxUA = Math.max(200, ...sems.map(s => s.ua || 0))
  const uaTotal = sems.reduce((a, s) => a + (s.ua || 0), 0)
  const barH = (ua: number | null) => ua && ua > 0 ? Math.max(3, Math.round((ua / maxUA) * UA_H)) : 0

  const saveMacro = () => {
    if (!fNom.trim()) { alert('Escribe un nombre'); return }
    const sf = Math.min(fIni + fDur - 1, totalSem - 1)
    if (macros.some(m => fIni <= m.sf && sf >= m.si)) { alert('Se solapa con otro macrociclo'); return }
    setMacros(p => [...p, { id: uid(), si: fIni, sf, nombre: fNom.trim(), tipo: fTipo }]); setModal(null)
  }

  const saveMeso = () => {
    if (!fNom.trim()) { alert('Escribe un nombre'); return }
    if (!mMacId) return
    const mac = macros.find(m => m.id === mMacId); if (!mac) return
    const sf = Math.min(fIni + fDur - 1, mac.sf)
    if (mesos.filter(m => m.macroId === mMacId).some(m => fIni <= m.sf && sf >= m.si)) { alert('Se solapa con otro mesociclo'); return }
    setMesos(p => [...p, { id: uid(), macroId: mMacId, si: fIni, sf, nombre: fNom.trim(), tipo: fTipo, intensidad: fInt }]); setModal(null)
  }

  const recargarComps = async () => {
    const { data } = await supabase.from('competicion')
      .select('*').eq('id_deportista', Number(id)).order('fecha')
    setCompsReales((data || []).map((c: any) => ({ ...c, fecha: String(c.fecha).slice(0, 10) })))
  }

  /** La competicion que cae en esa semana del lienzo, si la hay. */
  const compDeSemana = (wi: number) => {
    if (!fechaInicio) return null
    const ini = semFecha(fechaInicio, wi)
    const fin = semFecha(fechaInicio, wi + 1)
    return compsReales.find(c => c.fecha >= ini && c.fecha < fin) || null
  }

  const guardarCompReal = async (taper: boolean) => {
    if (!fCompFecha) { alert('Ponle fecha a la competicion'); return }
    const { error } = await supabase.from('competicion').insert({
      id_deportista: Number(id),
      nombre: fComp.trim() || 'Competicion',
      fecha: fCompFecha,
      prioridad: fCompPrio,
    })
    if (error) {
      alert(/prioridad|column/i.test(error.message)
        ? 'Falta ejecutar supabase/competicion-prioridad.sql en la base de datos.'
        : 'No se pudo guardar: ' + error.message)
      return
    }
    // El taper sigue siendo del lienzo: es como se dibuja la temporada, no un
    // dato de la carrera.
    if (taper) setSems(prev => prev.map(x => taperSug.includes(x.i) ? { ...x, tipo: 'Taper' } : x))
    await recargarComps()
    setModal(null)
  }

  const borrarCompReal = async (compId: number) => {
    if (!confirm('Borrar esta competicion? Desaparece tambien del calendario.')) return
    await supabase.from('competicion').delete().eq('id', compId)
    await recargarComps()
  }

  const openCompModal = (wi: number) => {
    setMIdx(wi); setFComp(''); setFCompPrio('A')
    // El domingo de esa semana, que es cuando se corre casi todo. OJO:
    // semFecha(fi, wi+1) seria el lunes SIGUIENTE, ya fuera de la semana.
    setFCompFecha(fechaInicio ? sumarDias(semFecha(fechaInicio, wi), 6) : '')
    setTaperSug([wi - 1, wi - 2].filter(x => x >= 0))
    setModal('comp')
  }
  // Aqui vivia saveComp, que escribia la competicion como TEXTO en la semana
  // del borrador. Ahora la crea guardarCompReal en la tabla `competicion`, la
  // misma que lee el calendario: una carrera, una fila, dos pantallas.
  const toggleTipo = (wi: number) => {
    setSems(prev => prev.map(s => { if (s.i !== wi) return s; const idx = TIPOS.indexOf(s.tipo); return { ...s, tipo: TIPOS[(idx + 1) % TIPOS.length] } }))
  }

  const generar = async () => {
    if (!fechaInicio || macros.length === 0) { alert('Necesitas fecha de inicio y al menos un macrociclo'); return }
    setGenerando(true)
    // Acortar un bloque saca sesiones del plan. Se cuentan para decirlo al
    // final: es un cambio en los datos del atleta, no un detalle de dibujo.
    let sueltas = 0
    try {
      for (const mac of macros) {
        const fechaMac = semFecha(fechaInicio, mac.si)
        const durMac = mac.sf - mac.si + 1
        let macDbId = mac.dbId

        if (macDbId) {
          // Actualizar macro existente sin tocar sesiones
          await supabase.from('macrociclo').update({
            objetivo: mac.nombre, fecha_inicio: fechaMac,
            duracion_semanas: durMac, tipo_periodizacion: mac.tipo || null
          }).eq('id', macDbId)
        } else {
          // Crear macro nuevo
          const { data: md } = await supabase.from('macrociclo').insert({
            id_deportista: Number(id), objetivo: mac.nombre,
            fecha_inicio: fechaMac, duracion_semanas: durMac, tipo_periodizacion: mac.tipo || null
          }).select().single()
          if (!md) continue
          macDbId = md.id
          setMacros(p => p.map(m => m.id === mac.id ? { ...m, dbId: md.id } : m))
        }

        for (const me of mesos.filter(m => m.macroId === mac.id)) {
          const fechaMe = semFecha(fechaInicio, me.si)
          const durMe = me.sf - me.si + 1
          let meDbId = me.dbId

          if (meDbId) {
            /* ANTES DE TOCAR LA FILA: si el bloque se ha movido o ha cambiado de
               tamaño en el lienzo, hay que ARRASTRAR lo que tiene dentro.

               Aquí vivía el fallo. Se actualizaba `fecha_inicio` del mesociclo y
               luego se buscaban sus microciclos POR FECHA (más abajo). Como el
               meso se había movido, ninguno coincidía: se creaban microciclos
               nuevos y vacíos en las fechas nuevas y los viejos —con todas sus
               sesiones— se quedaban donde estaban, colgando del mismo mesociclo
               pero fuera de su rango. Mover un bloque te duplicaba las semanas y
               te dejaba las sesiones atrás, sin un solo error por pantalla.

               Se arregla reusando las dos operaciones que ya saben hacerlo bien.
               `arrastrar: false` en el cambio de duración porque el lienzo coloca
               cada mesociclo en su sitio de forma absoluta: si además dejáramos
               que la función empujase a los posteriores, se moverían dos veces. */
            const { data: enBd } = await supabase.from('mesociclo')
              .select('fecha_inicio, duracion_semanas').eq('id', meDbId).single()
            if (enBd) {
              const delta = diasEntre(String(enBd.fecha_inicio).slice(0, 10), fechaMe)
              if (delta !== 0) {
                const err = await aplicarDesplazamiento(supabase, 'mesociclo', meDbId, delta)
                if (err) throw new Error(err)
              }
              if ((enBd.duracion_semanas || 4) !== durMe) {
                const r = await aplicarDuracion(supabase, meDbId, durMe, false, 'liberar')
                if (r.error) throw new Error(r.error)
                sueltas += r.sesiones
              }
            }
            // La fecha y la duración ya las han dejado bien las funciones de
            // arriba; esto es el nombre, el tipo y la intensidad.
            await supabase.from('mesociclo').update({
              objetivo: me.nombre, tipo: me.tipo,
              fecha_inicio: fechaMe, duracion_semanas: durMe, intensidad_relativa: me.intensidad
            }).eq('id', meDbId)
          } else {
            // Crear meso nuevo
            const { data: med } = await supabase.from('mesociclo').insert({
              id_macrociclo: macDbId, objetivo: me.nombre, tipo: me.tipo,
              fecha_inicio: fechaMe, duracion_semanas: durMe, intensidad_relativa: me.intensidad
            }).select().single()
            if (!med) continue
            meDbId = med.id
            setMesos(p => p.map(m => m.id === me.id ? { ...m, dbId: med.id } : m))
          }

          // Actualizar microciclos — NUNCA borrar sesiones ni tareas
          for (let wi = me.si; wi <= me.sf; wi++) {
            const sem = sems.find(s => s.i === wi)
            const fechaMicro = semFecha(fechaInicio, wi)
            // Buscar si ya existe un microciclo para esta fecha
            const { data: microExist } = await supabase.from('microciclo')
              .select('id').eq('id_mesociclo', meDbId).eq('fecha_inicio', fechaMicro).single()
            if (microExist) {
              // Solo actualizar UA y tipo — no tocar sesiones
              await supabase.from('microciclo').update({
                objetivo: 'Semana ' + (wi - me.si + 1) + ' — ' + me.nombre,
                tipo: tipoMicrociclo(sem?.tipo),
                ua_planificada: sem?.ua || null
              }).eq('id', microExist.id)
            } else {
              // Crear microciclo nuevo sin sesiones
              await supabase.from('microciclo').insert({
                id_mesociclo: meDbId,
                objetivo: 'Semana ' + (wi - me.si + 1) + ' — ' + me.nombre,
                tipo: tipoMicrociclo(sem?.tipo),
                fecha_inicio: fechaMicro,
                duracion_dias: 7,
                ua_planificada: sem?.ua || null
              })
            }
          }
        }
      }
      setGenerado(true)
      setModoEdicion(true)
      const aviso = sueltas
        ? '\n\n' + sueltas + (sueltas === 1
          ? ' sesión estaba en una semana que ya no cabe: sigue en el calendario, pero fuera del plan.'
          : ' sesiones estaban en semanas que ya no caben: siguen en el calendario, pero fuera del plan.')
        : ''
      alert((modoEdicion
        ? 'Planificacion actualizada. Las sesiones existentes se han conservado.'
        : 'Planificacion generada correctamente.') + aviso)
    } catch (e: any) { alert('Error: ' + e.message) }
    setGenerando(false)
  }

  const borrarMacro = async (macId: string) => {
    const mac = macros.find(m => m.id === macId)
    // Si ya existe en BD (dbId), borrarlo en cascada. Es DESTRUCTIVO (se lleva mesos, semanas
    // y SESIONES), así que se confirma. Antes solo se quitaba del canvas y reaparecía al recargar.
    if (mac?.dbId) {
      if (!confirm('¿Borrar este macrociclo y TODO su contenido (mesociclos, semanas y sesiones)? No se puede deshacer.')) return
      const { data: mesosDb } = await supabase.from('mesociclo').select('id').eq('id_macrociclo', mac.dbId)
      if (mesosDb?.length) {
        const { data: microsDb } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesosDb.map(m => m.id))
        if (microsDb?.length) {
          await supabase.from('sesion').delete().in('id_microciclo', microsDb.map(m => m.id))
          await supabase.from('microciclo').delete().in('id_mesociclo', mesosDb.map(m => m.id))
        }
        await supabase.from('mesociclo').delete().eq('id_macrociclo', mac.dbId)
      }
      await supabase.from('macrociclo').delete().eq('id', mac.dbId)
    }
    setMacros(p => p.filter(m => m.id !== macId))
    setMesos(p => p.filter(m => m.macroId !== macId))
  }
  const borrarMeso = async (mesoId: string) => {
    const me = mesos.find(m => m.id === mesoId)
    if (me?.dbId) {
      if (!confirm('¿Borrar este mesociclo y sus semanas y sesiones? No se puede deshacer.')) return
      const { data: microsDb } = await supabase.from('microciclo').select('id').eq('id_mesociclo', me.dbId)
      if (microsDb?.length) {
        await supabase.from('sesion').delete().in('id_microciclo', microsDb.map(m => m.id))
        await supabase.from('microciclo').delete().eq('id_mesociclo', me.dbId)
      }
      await supabase.from('mesociclo').delete().eq('id', me.dbId)
    }
    setMesos(p => p.filter(m => m.id !== mesoId))
  }

  const abrirEditarMacro = (mac: MacroD, e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    setEditNom(mac.nombre); setEditTipo(mac.tipo); setEditDur(mac.sf - mac.si + 1)
    setModalEditar({ tipo: 'macro', item: mac })
  }
  const abrirEditarMeso = (me: MesoD, e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    setEditNom(me.nombre); setEditTipo(me.tipo); setEditDur(me.sf - me.si + 1); setEditInt(me.intensidad)
    setModalEditar({ tipo: 'meso', item: me })
  }
  const guardarEdicion = () => {
    if (!editNom.trim()) { alert('Escribe un nombre'); return }
    if (!modalEditar) return
    if (modalEditar.tipo === 'macro') {
      const mac = modalEditar.item as MacroD
      const newSf = Math.min(mac.si + editDur - 1, totalSem - 1)
      setMacros(p => p.map(m => m.id === mac.id ? { ...m, nombre: editNom.trim(), tipo: editTipo, sf: newSf } : m))
      setMesos(p => p.map(me => me.macroId === mac.id ? { ...me, sf: Math.min(me.sf, newSf) } : me))
    } else {
      const me = modalEditar.item as MesoD
      const mac = macros.find(m => m.id === me.macroId)
      const newSf = mac ? Math.min(me.si + editDur - 1, mac.sf) : me.sf
      setMesos(p => p.map(m => m.id === me.id ? { ...m, nombre: editNom.trim(), tipo: editTipo, sf: newSf, intensidad: editInt } : m))
    }
    setModalEditar(null)
  }

  const guardarBorrador = async (macrosData: MacroD[], mesosData: MesoD[], semsData: SemanaD[], fi: string, total: number, zonasData: any[] = []) => {
    if (!fi || macrosData.length === 0) return
    setGuardandoBorrador(true)
    try {
      const { data: existing } = await supabase.from('dibujo_borrador').select('id').eq('id_deportista', Number(id)).single()
      const payload = {
        id_deportista: Number(id),
        fecha_inicio: fi,
        total_semanas: total,
        macros: macrosData,
        mesos: mesosData,
        semanas: semsData,
        sesiones_zonas: zonasData,
        updated_at: new Date().toISOString(),
      }
      if (existing) {
        await supabase.from('dibujo_borrador').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('dibujo_borrador').insert(payload)
      }
      setUltimoGuardado(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) { console.error('Error guardando borrador', e) }
    setGuardandoBorrador(false)
  }

  const dispararGuardado = (macrosData: MacroD[], mesosData: MesoD[], semsData: SemanaD[], fi: string, total: number, zonasData: any[] = []) => {
    if (guardadoTimerRef.current) clearTimeout(guardadoTimerRef.current)
    guardadoTimerRef.current = setTimeout(() => {
      guardarBorrador(macrosData, mesosData, semsData, fi, total, zonasData)
    }, 1500)
  }

  const cargarDetalleSemana = async (wi: number) => {
    if (semSelIdx === wi) { setSemSelIdx(null); setDetalleSem(null); return }
    setPanelTab('prog')
    setSemSelIdx(wi); setLoadingDetalle(true)
    const fechaSem = semFecha(fechaInicio, wi)
    if (!fechaSem) { setLoadingDetalle(false); return }
    const lunes = new Date(fechaSem + 'T12:00:00')
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
    const sessSem = sesionesProg.filter(se => {
      if (!se.fecha_sesion) return false
      const d = new Date(se.fecha_sesion + 'T12:00:00')
      return d >= lunes && d <= domingo
    })
    if (!sessSem.length) { setDetalleSem({ sesiones: [], tareas: [], distancias: [], duraciones: [], ejercicios: [] }); setLoadingDetalle(false); return }
    const sesIds = sessSem.map((s: any) => s.id)
    const { data: tareas } = await supabase.from('tarea').select('id, id_sesion, zona_entrenamiento, disciplina, series').in('id_sesion', sesIds)
    const tareaIds = (tareas || []).map((t: any) => t.id)
    const [{ data: dists }, { data: durs }, { data: ejers }] = await Promise.all([
      tareaIds.length ? supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : { data: [] },
      tareaIds.length ? supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : { data: [] },
      tareaIds.length ? supabase.from('ejercicios').select('id_tarea, grupo_muscular, series').in('id_tarea', tareaIds) : { data: [] },
    ])
    setDetalleSem({ sesiones: sessSem, tareas: tareas || [], distancias: dists || [], duraciones: durs || [], ejercicios: ejers || [] })
    setLoadingDetalle(false)
  }

  const calcularCurvaTeoria = (mac: MacroD): number[] => {
    const n = mac.sf - mac.si + 1
    const modelo = mac.tipo
    return Array.from({ length: n }, (_, i) => {
      const t = i / Math.max(n - 1, 1) // 0 a 1
      if (modelo === 'Tradicional') {
        // Sube al 80% las primeras 2/3, baja al 60% y sube al 100% al final, cae en taper
        if (t < 0.15) return 0.5 + t * 2
        if (t < 0.65) return 0.7 + Math.sin(t * Math.PI) * 0.25
        if (t < 0.85) return 0.9 - (t - 0.65) * 1.5
        return 0.6 - (t - 0.85) * 2
      }
      if (modelo === 'Inversa') {
        // Empieza alta intensidad (barra alta), baja a mitad, sube volumen final
        if (t < 0.3) return 0.9 - t * 0.5
        if (t < 0.7) return 0.6 + (t - 0.3) * 0.8
        return 0.9 + Math.sin((t - 0.7) * Math.PI) * 0.1 - (t - 0.7) * 0.5
      }
      if (modelo === 'ATR') {
        // Tres bloques — acumulacion alta, transmutacion media, realizacion baja
        if (t < 0.45) return 0.6 + t * 0.8
        if (t < 0.75) return 0.85 - (t - 0.45) * 1.2
        return 0.5 - (t - 0.75) * 1.5
      }
      if (modelo === 'Ondulatoria') {
        // Onda sinusoidal con tendencia ascendente
        return 0.5 + Math.sin(t * Math.PI * 4) * 0.25 + t * 0.3
      }
      return 0.7
    }).map(v => Math.max(0.1, Math.min(1, v)))
  }

  const uaPorSemana = sems.map(s => {
    const fechaSem = semFecha(fechaInicio, s.i)
    if (!fechaSem) return { plan: s.ua || 0, prog: 0, real: 0 }
    const lunes = new Date(fechaSem + 'T12:00:00')
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
    const sessSem = sesionesProg.filter(se => {
      if (!se.fecha_sesion) return false
      const d = new Date(se.fecha_sesion + 'T12:00:00')
      return d >= lunes && d <= domingo
    })
    // La misma fórmula que el resto de la app (lib/duracion-carga). Aquí se
    // hacía `(rpe||0) * (duracion_minutos||0)`, así que una sesión sin RPE
    // escrito y sin duración a mano valía CERO: la capa «Programado» salía a 0
    // teniendo el calendario lleno, y nada avisaba de que el número mentía.
    const prog = sessSem.reduce((a, se) => a + cargaPlanificada(se, duraciones[se.id]), 0)
    const real = sessSem.filter(se => se.rpe_reportado)
      .reduce((a, se) => a + cargaReal(se, duraciones[se.id]), 0)
    return { plan: s.ua || 0, prog, real }
  })

  const allMaxUA = Math.max(200,
    ...(capas.has('plan') ? sems.map(s => s.ua || 0) : [0]),
    ...(capas.has('prog') ? uaPorSemana.map(u => u.prog) : [0]),
    ...(capas.has('real') ? uaPorSemana.map(u => u.real) : [0]),
  )
  const ghostH = (val: number) => val > 0 ? Math.max(2, Math.round((val / allMaxUA) * UA_H)) : 0

  const uaMeso = mesos.map(m => ({ ...m, ua: sems.filter(s => s.i >= m.si && s.i <= m.sf).reduce((a, s) => a + (s.ua || 0), 0) }))

  // Línea 2 — Tendencia del entrenador: media móvil de 3 semanas sobre las UA dibujadas
  const tendencia = sems.map((s, i) => {
    if (!s.ua || s.ua <= 0) return null
    const vecinos = [sems[i - 1], sems[i], sems[i + 1]].filter(x => x && x.ua && x.ua > 0) as SemanaD[]
    const avg = vecinos.reduce((a, x) => a + (x.ua || 0), 0) / vecinos.length
    return { i, val: avg }
  }).filter(Boolean) as { i: number; val: number }[]

  const fechaDeSemana = (i: number): string => {
    if (!fechaInicio) return ''
    const d = new Date(fechaInicio); d.setDate(d.getDate() + i * 7)
    return d.toLocaleDateString('es-ES')
  }

  // Exportar el canvas como imagen PNG
  const exportarImagen = async () => {
    if (!contentRef.current) return
    setExportando(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(contentRef.current, { pixelRatio: 2, backgroundColor: '#0b1220', cacheBust: true })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `periodizacion-${(dep?.nombre || 'deportista').replace(/\s+/g, '_')}.png`
      a.click()
    } catch (e: any) { alert('Error al exportar imagen: ' + e.message) }
    setExportando(false)
  }

  // Exportar informe PDF apaisado: pág.1 dibujo, pág.2 resumen
  const exportarPDF = async () => {
    if (!contentRef.current) return
    setExportando(true)
    try {
      const { toPng } = await import('html-to-image')
      const { jsPDF } = await import('jspdf')
      const dataUrl = await toPng(contentRef.current, { pixelRatio: 2, backgroundColor: '#0b1220', cacheBust: true })
      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl })

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const margin = 12
      const hoy = new Date().toLocaleDateString('es-ES')

      // ---- Página 1: cabecera + dibujo ----
      pdf.setFillColor(11, 18, 32); pdf.rect(0, 0, pw, ph, 'F')
      pdf.setTextColor(234, 88, 12); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20)
      pdf.text('TRIPULSE', margin, 16)
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(13)
      pdf.text('Plan de periodización', margin, 24)
      pdf.setTextColor(180, 180, 190); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
      pdf.text(`Deportista: ${dep?.nombre || '—'}    ·    ${totalSem} semanas    ·    Generado: ${hoy}`, margin, 31)

      const availW = pw - margin * 2
      const availH = ph - 40 - margin
      const ratio = Math.min(availW / img.width, availH / img.height)
      pdf.addImage(dataUrl, 'PNG', margin, 38, img.width * ratio, img.height * ratio)

      // ---- Página 2: resumen ----
      pdf.addPage()
      pdf.setFillColor(11, 18, 32); pdf.rect(0, 0, pw, ph, 'F')
      pdf.setTextColor(234, 88, 12); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16)
      pdf.text('Resumen de la periodización', margin, 18)

      let y = 30
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
      pdf.text('Datos generales', margin, y); y += 7
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
      const modelos = [...new Set(macros.map(m => m.tipo).filter(Boolean))].join(', ') || '—'
      const generales: [string, string][] = [
        ['Deportista', dep?.nombre || '—'],
        ['Modelo(s) de periodización', modelos],
        ['Duración', `${totalSem} semanas`],
        ['Macrociclos', String(macros.length)],
        ['Mesociclos', String(mesos.length)],
        ['UA total planificada', uaTotal.toLocaleString()],
      ]
      for (const [k, v] of generales) {
        pdf.setTextColor(200, 200, 210); pdf.text(`${k}:`, margin, y)
        pdf.setTextColor(255, 255, 255); pdf.text(v, margin + 75, y); y += 6
      }

      y += 6
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
      pdf.text('Distribución por fase (UA por tipo de mesociclo)', margin, y); y += 7
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
      const porFase: Record<string, number> = {}
      for (const m of uaMeso) porFase[m.tipo] = (porFase[m.tipo] || 0) + m.ua
      const totalFase = Object.values(porFase).reduce((a, b) => a + b, 0) || 1
      for (const [fase, ua] of Object.entries(porFase)) {
        const pct = Math.round(ua / totalFase * 100)
        const col = hexToRgb(C_MESO[fase] || '#EA580C')
        pdf.setFillColor(col.r, col.g, col.b); pdf.rect(margin, y - 3, 3.5, 3.5, 'F')
        pdf.setTextColor(200, 200, 210)
        pdf.text(`${fase}: ${ua.toLocaleString()} UA (${pct}%)`, margin + 6, y); y += 6
      }

      y += 6
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
      pdf.text('Competiciones', margin, y); y += 7
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(200, 200, 210)
      if (compsReales.length === 0) pdf.text('Sin competiciones.', margin, y)
      else for (const c of compsReales) {
        const wi = fechaInicio ? semanasEntre(fechaInicio, c.fecha) : null
        const sem = wi != null && wi >= 0 ? 'S' + (wi + 1) + '   ·   ' : ''
        pdf.text(`${sem}${c.nombre}   ·   ${c.fecha}   ·   ${defDe(prioridadDe(c)).etiqueta}`, margin, y); y += 6
      }

      pdf.save(`periodizacion-${(dep?.nombre || 'deportista').replace(/\s+/g, '_')}.pdf`)
    } catch (e: any) { alert('Error al exportar PDF: ' + e.message) }
    setExportando(false)
  }

  if (pantalla === 'cargando' || !dep) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
      <div className="text-center"><div className="text-4xl mb-3">⏳</div><p className="text-gray-400">Cargando...</p></div>
    </div>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-gray-300 text-sm font-medium">Dibujo — {dep.nombre}</span>
          <BotonGuiaZonas tests={tests} fcMax={dep?.fc_maxima} />
          <button onClick={() => router.push('/planificacion-visual/' + id)} className="text-gray-400 hover:text-white text-sm transition">Bloques</button>
          <button onClick={() => router.push('/planificacion-visual/' + id + '/calendario')} className="text-gray-400 hover:text-white text-sm transition">Calendario</button>
        </div>
      </nav>

      {/* PANTALLA ELEGIR */}
      {pantalla === 'elegir' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">✏️</div>
              <h2 className="text-2xl font-bold mb-1">Dibujo de Periodizacion</h2>
              <p className="text-gray-400 text-sm">{dep.nombre} ya tiene una planificacion creada</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <button onClick={cargarExistente} disabled={cargandoDatos}
                className="bg-gray-900 hover:bg-gray-800 border border-orange-500/50 hover:border-orange-500 rounded-2xl p-6 text-left transition group">
                <div className="flex items-start gap-4">
                  <div className="text-3xl">📂</div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-white mb-1">{cargandoDatos ? 'Cargando...' : 'Editar planificacion existente'}</p>
                    <p className="text-gray-400 text-sm">Carga los ciclos actuales en el canvas para modificarlos</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {macrosExistentes.map(m => (
                        <span key={m.id} className="bg-orange-900/40 border border-orange-700/50 text-orange-300 text-xs px-2.5 py-1 rounded-lg">
                          {m.objetivo} · {m.duracion_semanas} sem
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-orange-400 group-hover:translate-x-1 transition-transform text-lg">→</span>
                </div>
              </button>
              <button onClick={() => setPantalla('setup')}
                className="bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-2xl p-6 text-left transition group">
                <div className="flex items-start gap-4">
                  <div className="text-3xl">🆕</div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-white mb-1">Crear planificacion nueva</p>
                    <p className="text-gray-400 text-sm">Empieza desde cero con un nuevo dibujo de temporada</p>
                  </div>
                  <span className="text-gray-500 group-hover:translate-x-1 transition-transform text-lg">→</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PANTALLA SETUP */}
      {pantalla === 'setup' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 w-full max-w-md text-center">
            <div className="text-5xl mb-4">✏️</div>
            <h2 className="text-2xl font-bold mb-2">Nueva planificacion</h2>
            <p className="text-gray-400 text-sm mb-8">Configura el punto de partida. Luego dibujas arrastrando en el canvas.</p>
            <div className="flex flex-col gap-4 text-left">
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Fecha de inicio</label>
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 w-full" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Total de semanas</label>
                <div className="grid grid-cols-4 gap-2">
                  {[12, 24, 36, 52].map(n => (
                    <button key={n} onClick={() => setTotalSem(n)} className={'py-2.5 rounded-xl text-sm font-medium transition ' + (totalSem === n ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>{n}</button>
                  ))}
                </div>
                <p className="text-gray-600 text-xs mt-1.5 text-center">{totalSem} semanas · {Math.round(totalSem / 4.33)} meses</p>
              </div>
              <div className="flex gap-2 mt-2">
                {macrosExistentes.length > 0 && (
                  <button onClick={() => setPantalla('elegir')} className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm text-gray-400 transition">← Volver</button>
                )}
                <button onClick={iniciarNuevo} className="flex-1 bg-orange-500 hover:bg-orange-600 py-3 rounded-xl font-bold text-white transition">Empezar a dibujar →</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CANVAS */}
      {pantalla === 'canvas' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3 text-xs flex-wrap flex-1 min-w-0">
                {modoEdicion && <span className="bg-blue-900/50 border border-blue-700/50 text-blue-300 px-2 py-0.5 rounded-lg text-xs font-medium flex-shrink-0">Editando</span>}
                <span className="text-gray-400 flex-shrink-0">Desde <span className="text-white font-medium">{fechaInicio}</span></span>
                <span className="text-gray-700 flex-shrink-0">·</span>
                {/* Barra de progreso planificado vs programado */}
                <div className="flex items-center gap-2 flex-1 min-w-0 max-w-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-gray-500" style={{ fontSize: 10 }}>Programado</span>
                      <span style={{ fontSize: 10 }}>
                        <span className="text-blue-400 font-bold">{uaPorSemana.reduce((a, u) => a + u.prog, 0).toLocaleString()}</span>
                        <span className="text-gray-600"> / </span>
                        <span className="text-orange-400 font-bold">{uaTotal.toLocaleString()}</span>
                        <span className="text-gray-600"> UA</span>
                      </span>
                    </div>
                    <div className="bg-gray-800 rounded-full h-2 w-full overflow-hidden">
                      {(() => {
                        const prog = uaPorSemana.reduce((a, u) => a + u.prog, 0)
                        const pct = uaTotal > 0 ? Math.min(100, Math.round(prog / uaTotal * 100)) : 0
                        const real = uaPorSemana.reduce((a, u) => a + u.real, 0)
                        const pctReal = uaTotal > 0 ? Math.min(100, Math.round(real / uaTotal * 100)) : 0
                        return (
                          <div className="h-full rounded-full relative" style={{ width: pct + '%', backgroundColor: '#3B82F6', transition: 'width 0.3s' }}>
                            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct > 0 ? (pctReal / pct * 100) + '%' : '0%', backgroundColor: '#22C55E' }} />
                          </div>
                        )
                      })()}
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-green-400" style={{ fontSize: 9 }}>■ {uaPorSemana.reduce((a, u) => a + u.real, 0).toLocaleString()} realizado</span>
                      <span className="text-blue-400" style={{ fontSize: 9 }}>■ {uaPorSemana.reduce((a, u) => a + u.prog, 0).toLocaleString()} programado</span>
                      <span className="text-orange-400" style={{ fontSize: 9 }}>■ {uaTotal.toLocaleString()} planificado</span>
                    </div>
                  </div>
                  {uaTotal > 0 && (() => {
                    const prog = uaPorSemana.reduce((a, u) => a + u.prog, 0)
                    const pct = Math.min(100, Math.round(prog / uaTotal * 100))
                    return <span className="font-bold flex-shrink-0" style={{ fontSize: 11, color: pct >= 100 ? '#22C55E' : pct >= 60 ? '#EAB308' : '#3B82F6' }}>{pct}%</span>
                  })()}
                </div>
                {/* Indicador borrador */}
                {guardandoBorrador ? (
                  <span className="text-gray-600 text-xs flex-shrink-0 hidden lg:flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />
                    Guardando...
                  </span>
                ) : ultimoGuardado ? (
                  <span className="text-gray-600 text-xs flex-shrink-0 hidden lg:flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Guardado {ultimoGuardado}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-1 py-0.5 border border-gray-700" title="Zoom del canvas">
                  <button onClick={() => setSemanaW(w => Math.max(SEMANA_W_MIN, w - 10))} className="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded transition font-bold text-base">−</button>
                  <span className="text-gray-400 text-xs select-none" style={{ minWidth: 20, textAlign: 'center' }}>🔍</span>
                  <button onClick={() => setSemanaW(w => Math.min(SEMANA_W_MAX, w + 10))} className="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded transition font-bold text-base">+</button>
                </div>
                <button onClick={() => setMostrarCurva(v => !v)}
                  className={'text-xs px-2 py-1.5 rounded-lg transition border ' + (mostrarCurva ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300')}
                  title="Mostrar/ocultar curva de periodizacion teorica">
                  ~ Curva
                </button>
                <button onClick={() => setMostrarTendencia(v => !v)}
                  className={'text-xs px-2 py-1.5 rounded-lg transition border ' + (mostrarTendencia ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300')}
                  title="Línea de tendencia: patrón de carga que estás planificando (media móvil 3 semanas)">
                  ∿ Tendencia
                </button>
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-1 py-0.5 border border-gray-700" title="Exportar">
                  <button onClick={exportarImagen} disabled={exportando || macros.length === 0}
                    className="text-gray-400 hover:text-white px-2 h-6 flex items-center rounded transition text-xs disabled:opacity-40" title="Descargar imagen PNG">🖼️</button>
                  <button onClick={exportarPDF} disabled={exportando || macros.length === 0}
                    className="text-gray-400 hover:text-white px-2 h-6 flex items-center rounded transition text-xs disabled:opacity-40" title="Descargar informe PDF">{exportando ? '⏳' : '📄 PDF'}</button>
                </div>
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-1 py-0.5 border border-gray-700">
                  <button onClick={() => setTotalSem(s => Math.max(s - 1, macros.reduce((a, m) => Math.max(a, m.sf + 1), 4)))} className="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded transition text-sm font-bold">−</button>
                  <span className="text-white text-xs font-medium px-1 min-w-8 text-center">{totalSem}s</span>
                  <button onClick={() => setTotalSem(s => s + 1)} className="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded transition text-sm font-bold">+</button>
                </div>
                <button onClick={() => setPantalla('elegir')} className="text-gray-500 hover:text-gray-300 text-xs transition px-2 py-1 rounded-lg hover:bg-gray-800">← Cambiar</button>
                <button onClick={generado ? () => router.push('/planificacion-visual/' + id) : generar}
                  disabled={generando || (!generado && macros.length === 0)}
                  className={'px-5 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50 ' + (generado ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white')}>
                  {generando ? 'Guardando...' : generado ? 'Ver planificacion →' : modoEdicion ? 'Actualizar planificacion' : 'Generar planificacion'}
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto bg-gray-950">
              <div ref={contentRef} style={{ width: Math.max(totalSem * semanaW + LABEL_W, 600) + 'px' }} className="select-none pb-4 bg-gray-950">

                {/* MACRO */}
                <div className="relative border-b border-gray-800 cursor-crosshair" style={{ height: 52 }}
                  onMouseDown={e => {
                    if (e.button !== 0) return
                    const wi = getWeekFromClientX(e.clientX)
                    if (macrosRef.current.some(m => wi >= m.si && wi <= m.sf)) return
                    dragBandRef.current = 'macro'; dragSiRef.current = wi; dragSfRef.current = wi
                    setDragPreview({ band: 'macro', si: wi, sf: wi }); e.preventDefault()
                  }}>
                  <div className="absolute left-0 top-0 bottom-0 w-14 flex items-center pl-2 z-20 pointer-events-none bg-gray-950">
                    <span className="text-gray-500 text-xs font-bold tracking-widest">MACRO</span>
                  </div>
                  {sems.map(s => <div key={s.i} className="absolute inset-y-0 border-r border-gray-800/20 pointer-events-none" style={{ left: LABEL_W + s.i * semanaW, width: semanaW }} />)}
                  {macros.map(mac => (
                    <div key={mac.id}
                      className="absolute inset-y-2 rounded-xl flex items-center px-3 z-10 overflow-hidden group/mac cursor-pointer"
                      style={{ left: LABEL_W + mac.si * semanaW + 1, width: (mac.sf - mac.si + 1) * semanaW - 2, backgroundColor: C_MACRO[mac.tipo] || '#EA580C' }}
                      onDoubleClick={e => abrirEditarMacro(mac, e)}
                      onMouseDown={e => {
                        if (e.detail === 2) return // doble clic — no mover
                        e.stopPropagation(); e.preventDefault()
                        const wi = getWeekFromClientX(e.clientX)
                        const offset = wi - mac.si
                        movingBlockRef.current = { tipo: 'macro', id: mac.id, offsetSem: offset }
                        setMovePreview({ tipo: 'macro', si: mac.si, sf: mac.sf, id: mac.id })
                      }}>
                      <span className="text-white text-xs font-bold truncate mr-2">{mac.nombre}</span>
                      <span className="text-white/50 text-xs flex-shrink-0 hidden lg:inline">{mac.tipo} · {mac.sf - mac.si + 1}s</span>
                      <button onClick={e => { e.stopPropagation(); borrarMacro(mac.id) }}
                        className="ml-auto flex-shrink-0 text-white/0 group-hover/mac:text-white/80 hover:text-white transition text-base leading-none pl-2">x</button>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover/mac:block z-50 pointer-events-none">
                        <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-xl p-3 text-left min-w-48">
                          <p className="text-white text-xs font-bold mb-1">{mac.nombre}</p>
                          <p className="text-gray-400 text-xs">{mac.tipo}</p>
                          <p className="text-gray-400 text-xs">S{mac.si + 1} → S{mac.sf + 1} · {mac.sf - mac.si + 1} semanas</p>
                          {(() => { const ua = sems.filter(s => s.i >= mac.si && s.i <= mac.sf).reduce((a, s) => a + (s.ua || 0), 0); return ua > 0 ? <p className="text-orange-400 text-xs font-bold mt-1">{ua.toLocaleString()} UA</p> : null })()}
                          <p className="text-gray-600 text-xs mt-1">Doble clic para editar</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {movePreview?.tipo === 'macro' && movePreview.id && (
                    <div className="absolute inset-y-2 rounded-xl z-40 pointer-events-none"
                      style={{ left: LABEL_W + movePreview.si * semanaW + 1, width: (movePreview.sf - movePreview.si + 1) * semanaW - 2, backgroundColor: '#EA580C40', border: '2px dashed #EA580C', opacity: 0.8 }} />
                  )}
                  {dragPreview?.band === 'macro' && (
                    <div className="absolute inset-y-2 rounded-xl z-30 pointer-events-none flex items-center justify-center"
                      style={{ left: LABEL_W + dragPreview.si * semanaW + 1, width: (dragPreview.sf - dragPreview.si + 1) * semanaW - 2, backgroundColor: '#EA580C30', border: '2px dashed #EA580C' }}>
                      <span className="text-orange-300 text-xs font-bold">{dragPreview.sf - dragPreview.si + 1} sem</span>
                    </div>
                  )}
                </div>

                {/* MESO */}
                <div className="relative border-b border-gray-800 cursor-crosshair" style={{ height: 44 }}
                  onMouseDown={e => {
                    if (e.button !== 0) return
                    const wi = getWeekFromClientX(e.clientX)
                    const mac = macrosRef.current.find(m => wi >= m.si && wi <= m.sf); if (!mac) return
                    if (mesosRef.current.some(m => wi >= m.si && wi <= m.sf)) return
                    dragBandRef.current = 'meso'; dragSiRef.current = wi; dragSfRef.current = wi
                    setDragPreview({ band: 'meso', si: wi, sf: wi }); e.preventDefault()
                  }}>
                  <div className="absolute left-0 top-0 bottom-0 w-14 flex items-center pl-2 z-20 pointer-events-none bg-gray-950">
                    <span className="text-gray-500 text-xs font-bold tracking-widest">MESO</span>
                  </div>
                  {sems.map(s => <div key={s.i} className="absolute inset-y-0 border-r border-gray-800/20 pointer-events-none" style={{ left: LABEL_W + s.i * semanaW, width: semanaW }} />)}
                  {macros.map(mac => (
                    <div key={mac.id} className="absolute inset-y-0 pointer-events-none opacity-10"
                      style={{ left: LABEL_W + mac.si * semanaW, width: (mac.sf - mac.si + 1) * semanaW, backgroundColor: C_MACRO[mac.tipo] || '#EA580C' }} />
                  ))}
                  {mesos.map(me => {
                    const col = C_MESO[me.tipo] || '#EA580C'
                    return (
                      <div key={me.id}
                        className="absolute inset-y-1.5 rounded-lg flex items-center px-2 z-10 border overflow-hidden group/meso cursor-pointer"
                        style={{ left: LABEL_W + me.si * semanaW + 1, width: (me.sf - me.si + 1) * semanaW - 2, backgroundColor: col + '25', borderColor: col }}
                        onDoubleClick={e => { clearTimeout(mesoClickTimerRef.current); abrirEditarMeso(me, e) }}
                        onMouseDown={e => {
                          if (e.detail === 2) return
                          e.stopPropagation(); e.preventDefault()
                          const wi = getWeekFromClientX(e.clientX)
                          const offset = wi - me.si
                          movingBlockRef.current = { tipo: 'meso', id: me.id, offsetSem: offset }
                          setMovePreview({ tipo: 'meso', si: me.si, sf: me.sf, id: me.id })
                          mesoClickRef.current = { x: e.clientX, y: e.clientY, me }
                          mesoMovedRef.current = false
                        }}>
                        <span className="text-white text-xs font-medium truncate mr-2">{me.nombre}</span>
                        <span className="text-white/40 text-xs flex-shrink-0">{me.sf - me.si + 1}s</span>
                        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); borrarMeso(me.id) }}
                          className="ml-auto flex-shrink-0 text-white/0 group-hover/meso:text-white/70 hover:text-white transition text-base leading-none pl-2">x</button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover/meso:block z-50 pointer-events-none">
                          <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-xl p-3 text-left min-w-48">
                            <p className="text-white text-xs font-bold mb-1">{me.nombre}</p>
                            <p className="text-xs mb-1" style={{ color: C_MESO[me.tipo] || '#EA580C' }}>{me.tipo}</p>
                            <p className="text-gray-400 text-xs">S{me.si + 1} → S{me.sf + 1} · {me.sf - me.si + 1} semanas</p>
                            <p className="text-gray-400 text-xs">Intensidad: {me.intensidad}/10</p>
                            {(() => { const ua = sems.filter(s => s.i >= me.si && s.i <= me.sf).reduce((a, s) => a + (s.ua || 0), 0); return ua > 0 ? <p className="text-orange-400 text-xs font-bold mt-1">{ua.toLocaleString()} UA</p> : null })()}
                            <p className="text-gray-600 text-xs mt-1">Doble clic para editar</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {movePreview?.tipo === 'meso' && movePreview.id && (() => {
                    const me = mesos.find(m => m.id === movePreview.id)
                    const col = me ? (C_MESO[me.tipo] || '#EA580C') : '#EA580C'
                    return (
                      <div className="absolute inset-y-1.5 rounded-lg z-40 pointer-events-none"
                        style={{ left: LABEL_W + movePreview.si * semanaW + 1, width: (movePreview.sf - movePreview.si + 1) * semanaW - 2, backgroundColor: col + '30', border: '2px dashed ' + col }} />
                    )
                  })()}
                  {dragPreview?.band === 'meso' && (() => {
                    const mac = macros.find(m => dragPreview.si >= m.si && dragPreview.si <= m.sf)
                    const col = mac ? (C_MACRO[mac.tipo] || '#EA580C') : '#EA580C'
                    return (
                      <div className="absolute inset-y-1.5 rounded-lg z-30 pointer-events-none flex items-center justify-center"
                        style={{ left: LABEL_W + dragPreview.si * semanaW + 1, width: (dragPreview.sf - dragPreview.si + 1) * semanaW - 2, backgroundColor: col + '20', border: '2px dashed ' + col }}>
                        <span className="text-white/70 text-xs font-bold">{dragPreview.sf - dragPreview.si + 1} sem</span>
                      </div>
                    )
                  })()}
                </div>

                {/* MICRO */}
                <div className="relative border-b border-gray-800" style={{ height: 44 }}>
                  <div className="absolute left-0 top-0 bottom-0 w-14 flex items-center pl-2 z-20 pointer-events-none bg-gray-950">
                    <span className="text-gray-500 text-xs font-bold tracking-widest">MICRO</span>
                  </div>
                  {sems.map(s => {
                    const col = C_TIPO[s.tipo] || '#EA580C'
                    return (
                      <div key={s.i} className="absolute top-0 bottom-0 border-r border-gray-800 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:bg-gray-800/40 transition"
                        style={{ left: LABEL_W + s.i * semanaW, width: semanaW, outline: semSelIdx === s.i && capas.has('prog') ? '2px solid #3B82F6' : 'none' }}
                        onClick={() => capas.has('prog') ? cargarDetalleSemana(s.i) : toggleTipo(s.i)}>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 text-xs">S{s.i + 1}</span>
                          {(() => { const c = compDeSemana(s.i); return c
                            ? <span className="text-sm leading-none" title={c.nombre + ' · ' + defDe(prioridadDe(c)).etiqueta}>{defDe(prioridadDe(c)).simbolo}</span>
                            : null })()}
                        </div>
                        <div className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: col + '25', color: col, fontSize: 10 }}>
                          {s.tipo.slice(0, 3)}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* UA BARS */}
                <div className="flex items-end bg-gray-950 border-b border-gray-800 relative" style={{ height: UA_H + 36 }}>
                  <div className="flex-shrink-0 w-14" />
                  {[25, 50, 75].map(pct => (
                    <div key={pct} className="absolute border-t border-gray-800/40 pointer-events-none"
                      style={{ left: LABEL_W, right: 0, bottom: 36 + Math.round(pct / 100 * UA_H) }}>
                      <span className="text-gray-700 pl-1" style={{ fontSize: 9 }}>{Math.round(maxUA * pct / 100)}</span>
                    </div>
                  ))}
                  {sems.map(s => {
                    const entry = uaPorSemana[s.i] || { plan: 0, prog: 0, real: 0 }
                    const planH = capas.has('plan') && s.ua && s.ua > 0 ? Math.max(3, Math.round((s.ua / allMaxUA) * UA_H)) : 0
                    const prgH = ghostH(entry.prog)
                    const rlH = ghostH(entry.real)
                    const isDragging = dragWk === s.i
                    const isEditing = editWk === s.i
                    const canDrag = capas.has('plan')
                    const mac = macAt(s.i)
                    const barColor = C_TIPO[s.tipo] || (mac ? C_MACRO[mac.tipo] : '#EA580C') || '#EA580C'
                    return (
                      <div key={s.i}
                        className="flex-shrink-0 border-r border-gray-800/30 flex flex-col items-center justify-end group relative"
                        style={{ width: semanaW, height: '100%' }}
                        onMouseEnter={() => setHoveredWeek(s.i)}
                        onMouseLeave={() => setHoveredWeek(null)}>

                        {/* Ghost — Realizado */}
                        {capas.has('real') && rlH > 0 && (
                          <div className="absolute pointer-events-none rounded-t"
                            style={{ bottom: 36, left: '7%', right: '7%', height: rlH + 'px', backgroundColor: '#22C55E', opacity: 0.20 }} />
                        )}
                        {/* Ghost — Programado */}
                        {capas.has('prog') && prgH > 0 && (
                          <div className="absolute pointer-events-none rounded-t"
                            style={{ bottom: 36, left: '11%', right: '11%', height: prgH + 'px', backgroundColor: '#3B82F6', opacity: 0.28 }} />
                        )}

                        {/* Boton flotante en hover */}
                        {hoveredWeek === s.i && capas.has('plan') && popupBarra !== s.i && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
                            <button
                              onClick={e => { e.stopPropagation(); setPopupBarra(s.i); setPanelTab('plan') }}
                              className="bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-orange-500 text-gray-300 hover:text-orange-400 rounded-lg px-2 py-1 transition whitespace-nowrap shadow-lg"
                              style={{ fontSize: 10 }}>
                              S{s.i + 1} {s.ua ? '· ' + s.ua + ' UA' : ''}
                            </button>
                          </div>
                        )}

                        {/* Popup barra */}
                        {popupBarra === s.i && capas.has('plan') && s.ua && (
                          <div className="absolute z-50 bg-gray-800 border border-orange-500/50 rounded-xl shadow-xl p-3 pointer-events-auto"
                            style={{ bottom: planH + 50, left: '50%', transform: 'translateX(-50%)', minWidth: 160 }}>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-white text-xs font-bold">S{s.i + 1} — {semLabel(fechaInicio, s.i)}</span>
                              <button onClick={e => { e.stopPropagation(); setPopupBarra(null) }} className="text-gray-500 hover:text-white text-sm leading-none ml-2">x</button>
                            </div>
                            <p className="text-orange-400 text-xs font-bold mb-1">{s.ua} UA planificadas</p>
                            <p className="text-gray-500 text-xs mb-3">{s.tipo}</p>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                const fechaSem = semFecha(fechaInicio, s.i)
                                router.push('/planificacion-visual/' + id + '/semana/' + fechaSem)
                              }}
                              className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 rounded-lg transition">
                              + Añadir sesiones →
                            </button>
                          </div>
                        )}

                        {/* Valor sobre barra plan */}
                        {capas.has('plan') && s.ua !== null && s.ua > 0 && (
                          <div className="absolute text-xs font-bold pointer-events-none z-10" style={{ bottom: planH + 40, color: barColor, fontSize: 10 }}>{s.ua}</div>
                        )}

                        {/* Barra plan — arrastrable */}
                        {capas.has('plan') && (
                          <div className="rounded-t z-10"
                            style={{ width: '68%', height: Math.max(planH, 3) + 'px', backgroundColor: barColor, opacity: isDragging ? 1 : (s.ua ? 0.85 : 0.12), marginBottom: 36, transition: isDragging ? 'none' : 'height 0.08s', cursor: canDrag ? 'ns-resize' : 'default' }}
                            onMouseDown={e => { if (!canDrag) return; e.preventDefault(); setDragWk(s.i); setDragY0(e.clientY); setDragUA0(s.ua || 0); setDragMaxUA0(allMaxUA); setEditWk(null) }}
                            onDoubleClick={() => { if (canDrag) { setEditWk(s.i); setEditVal(s.ua?.toString() || '') } }}
                            onClick={e => { if (!isDragging && canDrag && s.ua) { e.stopPropagation(); setPopupBarra(popupBarra === s.i ? null : s.i); setPanelTab('plan') } }}
                            title="Arrastra hacia arriba para cambiar UA · Clic para opciones" />
                        )}

                        {/* Spacer si plan no visible */}
                        {!capas.has('plan') && <div style={{ height: 3, width: '68%', marginBottom: 36 }} />}

                        {/* Controles inferiores */}
                        <div className="absolute bottom-0 left-0 right-0 h-9 flex items-center justify-center px-0.5">
                          {capas.has('plan') && (isEditing ? (
                            <input autoFocus type="number" value={editVal} onChange={e => setEditVal(e.target.value)}
                              onBlur={() => { setSems(p => p.map(x => x.i === s.i ? { ...x, ua: editVal ? Number(editVal) : null } : x)); setEditWk(null) }}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { setSems(p => p.map(x => x.i === s.i ? { ...x, ua: editVal ? Number(editVal) : null } : x)); setEditWk(null) } }}
                              className="w-full text-center bg-gray-700 text-white rounded outline-none border border-orange-500 py-0.5" style={{ fontSize: 10 }} />
                          ) : (
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={e => { e.stopPropagation(); setEditWk(s.i); setEditVal(s.ua?.toString() || '') }}
                                className="hover:text-orange-400 transition" style={{ fontSize: s.ua === null ? 11 : 10, color: s.ua === null ? '#4B5563' : '#9CA3AF' }}>
                                {s.ua === null ? '+ UA' : s.ua}
                              </button>
                              {s.ua !== null && (
                                <button
                                  onClick={e => { e.stopPropagation(); setSems(p => p.map(x => x.i === s.i ? { ...x, ua: null } : x)); setPopupBarra(null) }}
                                  /* Visible en móvil: invisible + clicable es la peor
                                     combinación posible para un botón de borrar. */
                                  className="text-gray-700 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition rounded-full w-3.5 h-3.5 flex items-center justify-center bg-gray-800 hover:bg-red-900/30 flex-shrink-0"
                                  style={{ fontSize: 9 }} title="Borrar UA">
                                  x
                                </button>
                              )}
                            </div>
                          ))}
                          {!capas.has('plan') && (prgH > 0 || rlH > 0) && (
                            <div className="flex gap-1 items-center justify-center flex-wrap">
                              {capas.has('prog') && entry.prog > 0 && <span className="text-blue-400 font-medium" style={{ fontSize: 9 }}>{Math.round(entry.prog)}</span>}
                              {capas.has('real') && entry.real > 0 && <span className="text-green-400 font-medium" style={{ fontSize: 9 }}>{Math.round(entry.real)}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* CURVA SVG TEORIA */}
                {mostrarCurva && macros.length > 0 && allMaxUA > 0 && (
                  <div className="relative pointer-events-none" style={{ height: 0 }}>
                    <svg
                      className="absolute pointer-events-none"
                      style={{ bottom: 36, left: 0, zIndex: 20 }}
                      width={totalSem * semanaW + LABEL_W}
                      height={UA_H + 10}
                      viewBox={'0 0 ' + (totalSem * semanaW + LABEL_W) + ' ' + (UA_H + 10)}>
                      {macros.map(mac => {
                        const curva = calcularCurvaTeoria(mac)
                        const col = C_MACRO[mac.tipo] || '#EA580C'
                        const uaMaxMac = Math.max(allMaxUA, 1)
                        // Calcular puntos de la curva
                        const puntos = curva.map((v, i) => {
                          const semIdx = mac.si + i
                          const x = LABEL_W + semIdx * semanaW + semanaW / 2
                          const uaRef = sems.filter(s => s.i >= mac.si && s.i <= mac.sf).reduce((a, s) => Math.max(a, s.ua || 0), 0)
                          const refUA = uaRef > 0 ? uaRef : uaMaxMac * 0.7
                          const y = UA_H - Math.round(v * Math.min(refUA, uaMaxMac) / uaMaxMac * UA_H)
                          return x + ',' + y
                        })
                        const pathD = puntos.reduce((acc, p, i) => {
                          if (i === 0) return 'M ' + p
                          const prev = puntos[i - 1].split(',')
                          const curr = p.split(',')
                          const cpx = (Number(prev[0]) + Number(curr[0])) / 2
                          return acc + ' C ' + cpx + ',' + prev[1] + ' ' + cpx + ',' + curr[1] + ' ' + p
                        }, '')
                        return (
                          <g key={mac.id}>
                            {/* Sombra */}
                            <path d={pathD} fill="none" stroke={col} strokeWidth="3" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                            {/* Linea principal */}
                            <path d={pathD} fill="none" stroke={col} strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
                            {/* Puntos en cada semana */}
                            {curva.map((v, i) => {
                              const semIdx = mac.si + i
                              const x = LABEL_W + semIdx * semanaW + semanaW / 2
                              const uaRef = sems.filter(s => s.i >= mac.si && s.i <= mac.sf).reduce((a, s) => Math.max(a, s.ua || 0), 0)
                              const refUA = uaRef > 0 ? uaRef : uaMaxMac * 0.7
                              const y = UA_H - Math.round(v * Math.min(refUA, uaMaxMac) / uaMaxMac * UA_H)
                              return <circle key={i} cx={x} cy={y} r="2.5" fill={col} fillOpacity="0.7" />
                            })}
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                )}

                {/* LINEA 2 — TENDENCIA DEL ENTRENADOR */}
                {mostrarTendencia && capas.has('plan') && tendencia.length > 1 && allMaxUA > 0 && (
                  <div className="relative pointer-events-none" style={{ height: 0 }}>
                    <svg className="absolute pointer-events-none"
                      style={{ bottom: 36, left: 0, zIndex: 21 }}
                      width={totalSem * semanaW + LABEL_W} height={UA_H + 10}
                      viewBox={'0 0 ' + (totalSem * semanaW + LABEL_W) + ' ' + (UA_H + 10)}>
                      {(() => {
                        const pts = tendencia.map(t => (LABEL_W + t.i * semanaW + semanaW / 2) + ',' + (UA_H - Math.round(t.val / allMaxUA * UA_H)))
                        const pathD = pts.reduce((acc, p, i) => {
                          if (i === 0) return 'M ' + p
                          const prev = pts[i - 1].split(','); const curr = p.split(',')
                          const cpx = (Number(prev[0]) + Number(curr[0])) / 2
                          return acc + ' C ' + cpx + ',' + prev[1] + ' ' + cpx + ',' + curr[1] + ' ' + p
                        }, '')
                        return (
                          <g>
                            <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="4" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                            <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2" strokeOpacity="0.9" strokeLinecap="round" strokeLinejoin="round" />
                            {tendencia.map(t => (
                              <circle key={t.i} cx={LABEL_W + t.i * semanaW + semanaW / 2} cy={UA_H - Math.round(t.val / allMaxUA * UA_H)} r="2.5" fill="#3B82F6" />
                            ))}
                          </g>
                        )
                      })()}
                    </svg>
                  </div>
                )}

                {/* GRAFICA ZONAS */}
                <div className="border-t border-gray-800">
                  {(() => {
                    // Altura de la fila de ZONAS dinámica: crece con la semana que más chips
                    // tiene (hasta un tope), y a partir de ahí los chips se encogen para que
                    // quepan todos sin solaparse con la gráfica de arriba ni obligar a scroll.
                    const CHIP_MAX = 28, CHIP_MIN = 13, GAP = 3, PAD = 8, ROW_MIN = 120, ROW_MAX = 300
                    const maxChips = Math.max(1, ...sems.map(s => sesZonas.filter(sz => sz.semana === s.i && filtroDisc.includes(sz.disciplina)).length))
                    const idealH = maxChips * (CHIP_MAX + GAP) + PAD
                    const rowH = Math.min(ROW_MAX, Math.max(ROW_MIN, idealH))
                    const chipH = Math.max(CHIP_MIN, Math.min(CHIP_MAX, Math.floor((rowH - PAD) / maxChips) - GAP))
                    const showDisc = chipH >= 22   // solo cabe la sub-etiqueta de disciplina si el chip es alto
                    return (
                  <div className="relative" style={{ height: rowH }}>
                    <div className="absolute left-0 top-0 bottom-0 w-14 flex items-center justify-center z-20 pointer-events-none bg-gray-950">
                      <span className="text-gray-500 text-xs font-bold tracking-widest" style={{writingMode:'vertical-rl',transform:'rotate(180deg)'}}>ZONAS</span>
                    </div>
                    {sems.map(s => {
                      const sesEsta = sesZonas.filter(sz => sz.semana === s.i && filtroDisc.includes(sz.disciplina))
                      const C_ZONA = COLOR_ZONA
                      const DISC_LABEL: Record<string,string> = { Natacion:'Nat', Natación:'Nat', Ciclismo:'Cic', Carrera:'Car', Fuerza:'Fue', Brick:'Brk' }
                      return (
                        <div key={s.i} className="absolute top-0 bottom-0 border-r border-gray-800/30 flex flex-col-reverse items-center gap-0.5 py-1 cursor-pointer hover:bg-gray-900/50 group/zona"
                          style={{ left: LABEL_W + s.i * semanaW, width: semanaW }}
                          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPopupZona({ semana: s.i, x: r.left, y: r.top }); setZonaSelDisc('Natacion'); setZonaSelZona(dep?.sistema_zonas === 2 ? 'AER' : 'Z1') }}>
                          {sesEsta.map(sz => (
                            <div key={sz.id}
                              className="flex-shrink-0 flex flex-col items-center justify-center rounded text-white font-bold border relative group/sq overflow-hidden"
                              style={{ width: semanaW - 6, height: chipH, backgroundColor: (C_ZONA[sz.zona] || '#888') + '30', borderColor: C_ZONA[sz.zona] || '#888', fontSize: 8, opacity: sz.hecho ? 0.55 : 1, lineHeight: 1 }}
                              title={sz.hecho ? 'Ya programada en el calendario' : (showDisc ? '' : (DISC_LABEL[sz.disciplina] || sz.disciplina))}
                              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSesZonas(prev => prev.filter(x => x.id !== sz.id)) }}>
                              {sz.hecho && <span className="absolute -top-1 -right-1 text-green-400 leading-none" style={{ fontSize: 9 }}>✓</span>}
                              <span style={{ fontSize: showDisc ? 9 : 8, fontWeight: 700 }}>{sz.zona}</span>
                              {showDisc && <span style={{ fontSize: 7, color: C_ZONA[sz.zona] || '#888', fontWeight: 600 }}>{DISC_LABEL[sz.disciplina] || sz.disciplina}</span>}
                              <span className="absolute inset-0 bg-red-500/0 group-hover/sq:bg-red-500/10 rounded transition pointer-events-none" />
                            </div>
                          ))}
                          {sesEsta.length === 0 && (
                            <span className="text-gray-800 text-xs group-hover/zona:text-gray-600 transition absolute bottom-2">+</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                    )
                  })()}
                  {/* Totales por semana */}
                  <div className="relative border-t border-gray-800/50" style={{ height: 18 }}>
                    <div className="absolute left-0 top-0 bottom-0 w-14 bg-gray-950" />
                    {sems.map(s => {
                      const n = sesZonas.filter(sz => sz.semana === s.i).length
                      return (
                        <div key={s.i} className="absolute top-0 flex items-center justify-center" style={{ left: LABEL_W + s.i * semanaW, width: semanaW, height: 18 }}>
                          {n > 0 && <span className="text-gray-500 font-medium" style={{ fontSize: 9 }}>{n}</span>}
                        </div>
                      )
                    })}
                  </div>
                  {/* Leyenda disciplinas con filtro */}
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-800/50 flex-wrap">
                    <span className="text-gray-600 text-xs mr-1">Filtro:</span>
                    {[{l:'Natación',k:'Natacion',c:'#3B82F6'},{l:'Ciclismo',k:'Ciclismo',c:'#EAB308'},{l:'Carrera',k:'Carrera',c:'#22C55E'},{l:'Fuerza',k:'Fuerza',c:'#EF4444'}].map(d => {
                      const act = filtroDisc.includes(d.k)
                      return (
                        <button key={d.k} onClick={() => setFiltroDisc(prev => prev.includes(d.k) ? prev.filter(x => x !== d.k) : [...prev, d.k])}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition"
                          style={act ? {backgroundColor:d.c+'30',borderColor:d.c,color:'white'} : {backgroundColor:'#1f2937',borderColor:'#374151',color:'#4b5563'}}>
                          <span className="w-2.5 h-2.5 rounded-sm inline-block border" style={{backgroundColor:act?d.c+'50':'transparent',borderColor:act?d.c:'#374151'}}/>
                          {d.l}
                        </button>
                      )
                    })}
                    <button onClick={reconstruirChips} disabled={reconstruyendo}
                      title="Vuelve a crear los chips de lo que ya está en el calendario. Los que aún no has bajado se quedan como están."
                      className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-orange-500 transition disabled:opacity-50">
                      {reconstruyendo ? 'Rehaciendo…' : '⟳ Rehacer desde el calendario'}
                    </button>
                    <span className="text-gray-700 text-xs">{sesZonas.length} sesiones total</span>
                  </div>
                </div>
                {/* POPUP AÑADIR ZONA */}
                {popupMeso && (
                  <div className="fixed inset-0 z-50" onClick={() => setPopupMeso(null)}>
                    <div className="absolute bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-2 min-w-52"
                      style={{ left: Math.min(popupMeso.x, window.innerWidth - 230), top: Math.min(popupMeso.y, window.innerHeight - 120) }}
                      onClick={e => e.stopPropagation()}>
                      <p className="text-white text-xs font-bold px-2 py-1 truncate">{popupMeso.me.nombre}</p>
                      <p className="text-xs px-2 pb-1.5" style={{ color: C_MESO[popupMeso.me.tipo] || '#EA580C' }}>{popupMeso.me.tipo} · {popupMeso.me.sf - popupMeso.me.si + 1} sem</p>
                      {popupMeso.me.dbId ? (
                        <button onClick={() => { const d = popupMeso.me.dbId; setPopupMeso(null); router.push('/mesociclo/' + d + '/vista') }}
                          className="w-full text-left text-sm text-gray-200 hover:bg-gray-700 rounded-lg px-3 py-2 transition">🔍 Vista de ciclo</button>
                      ) : (
                        <p className="text-gray-500 text-xs px-3 py-2">Guarda la planificación primero para ver el ciclo</p>
                      )}
                    </div>
                  </div>
                )}
                {popupZona && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPopupZona(null)}>
                    <div className={'bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto ' + (zonaSelDisc === 'Brick' ? 'w-[28rem]' : 'w-72')} onClick={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white font-bold text-sm">Añadir sesión — Semana {popupZona.semana + 1}</h3>
                        <button onClick={() => setPopupZona(null)} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
                      </div>
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-gray-400 text-xs mb-1.5 block">Disciplina</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {['Natacion','Ciclismo','Carrera','Fuerza','Brick'].map(d => {
                              const C: Record<string,string> = {Natacion:'#3B82F6',Ciclismo:'#EAB308',Carrera:'#22C55E',Fuerza:'#EF4444',Brick:'#A855F7'}
                              const sel = zonaSelDisc === d
                              return (
                                <button key={d} onClick={() => { setZonaSelDisc(d); if (dep?.sistema_zonas === 2) setZonaSelZona(d === 'Fuerza' ? 'AFG' : 'AER') }}
                                  className={'py-2 rounded-lg text-xs font-medium transition border ' + (d === 'Brick' ? 'col-span-2' : '')}
                                  style={sel ? {backgroundColor:C[d]+'40',borderColor:C[d],color:'white'} : {backgroundColor:'#1f2937',borderColor:'#374151',color:'#9ca3af'}}>
                                  {d === 'Natacion' ? 'Natación' : d === 'Brick' ? '🔀 Brick' : d}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {/* Un brick no cabe en un par zona+deporte: se monta con su constructor
                            y el chip se lleva los bloques encima. */}
                        {zonaSelDisc === 'Brick' && <ConstructorBrick valor={zonaSelBrick} onChange={setZonaSelBrick} depId={Number(id)} />}
                        {zonaSelDisc !== 'Brick' && (() => {
                          const esFuerza = zonaSelDisc === 'Fuerza'
                          const z2 = dep?.sistema_zonas === 2
                          const zonaList = z2
                            ? (esFuerza ? ZONAS_FUERZA.map(z => z.sigla) : ZONAS_RESISTENCIA.map(z => z.sigla))
                            : ['Z1','Z2','Z3','Z4','Z5','Z6','Z7']
                          const etiqueta = z2 ? (esFuerza ? '(Zonas 2 — fuerza)' : '(Zonas 2 — resistencia)') : ''
                          return (
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <label className="text-gray-400 text-xs">{esFuerza && z2 ? 'Cualidad de fuerza' : 'Zona'} {etiqueta}</label>
                                {/* Solo con Zonas 2: la guía habla en siglas, y a un atleta
                                    de Z1–Z7 le enseñaría zonas que no está eligiendo. */}
                                {z2 && (
                                  <BotonGuiaZonas familia={esFuerza ? 'fuerza' : 'resistencia'} sigla={zonaSelZona || null}
                                    tests={tests} fcMax={dep?.fc_maxima}
                                    clase="text-[11px] text-gray-500 hover:text-orange-400 transition flex-shrink-0" texto="📚 ¿Qué es?" />
                                )}
                              </div>
                              <div className={'grid gap-1.5 ' + (z2 ? 'grid-cols-3' : 'grid-cols-4')}>
                                {zonaList.map(z => {
                                  const sel = zonaSelZona === z
                                  const col = COLOR_ZONA[z] || '#F97316'
                                  return (
                                    <button key={z} onClick={() => setZonaSelZona(z)} title={z2 ? NOMBRE_ZONA(z) : ''}
                                      className="py-2 rounded-lg text-xs font-bold transition border"
                                      style={sel ? { backgroundColor: col + '40', borderColor: col, color: 'white' } : { backgroundColor: '#1f2937', borderColor: '#374151', color: '#9ca3af' }}>
                                      {z}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => {
                            const esB = zonaSelDisc === 'Brick'
                            if (esB && !brickValido(zonaSelBrick)) { alert('Un brick necesita al menos dos bloques con duración.'); return }
                            setSesZonas(prev => [...prev, {
                              id: Math.random().toString(36).slice(2),
                              semana: popupZona.semana,
                              disciplina: zonaSelDisc,
                              // El chip enseña la zona más dura del brick, que es la que marca el día.
                              zona: esB ? zonaPicoBrick(zonaSelBrick) : zonaSelZona,
                              ...(esB ? { brick: zonaSelBrick } : {}),
                            }])
                            setZonaSelBrick(BRICK_VACIO)
                            setPopupZona(null)
                          }} className="flex-1 bg-orange-500 hover:bg-orange-600 py-2.5 rounded-xl text-sm font-bold text-white transition">
                            Añadir
                          </button>
                          <button onClick={() => setPopupZona(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-sm text-gray-400 transition">
                            Cancelar
                          </button>
                        </div>
                        {sesZonas.filter(sz => sz.semana === popupZona.semana).length > 0 && (
                          <div className="border-t border-gray-800 pt-3">
                            <p className="text-gray-500 text-xs mb-2">Sesiones esta semana:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {sesZonas.filter(sz => sz.semana === popupZona.semana).map(sz => {
                                const CZ = COLOR_ZONA
                                const DL: Record<string,string> = {Natacion:'Nat',Natación:'Nat',Ciclismo:'Cic',Carrera:'Car',Fuerza:'Fue',Brick:'Brk'}
                                return (
                                  <div key={sz.id} className="flex items-center gap-1 rounded-lg px-2 py-1 border text-xs"
                                    style={{backgroundColor:(CZ[sz.zona]||'#888')+'20',borderColor:CZ[sz.zona]||'#888'}}>
                                    <span className="text-white font-bold">{sz.zona}</span>
                                    <span className="text-gray-400">{DL[sz.disciplina] || sz.disciplina}</span>
                                    <button onClick={() => setSesZonas(prev => prev.filter(x => x.id !== sz.id))} className="text-gray-600 hover:text-red-400 transition ml-0.5">×</button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* FECHAS */}
                <div className="flex" style={{ height: 24 }}>
                  <div className="flex-shrink-0 w-14 bg-gray-950" />
                  {sems.map(s => (
                    <div key={s.i} className="flex-shrink-0 border-r border-gray-800/30 flex items-center justify-center" style={{ width: semanaW }}>
                      <span className="text-gray-700" style={{ fontSize: 10 }}>{semLabel(fechaInicio, s.i)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* DETALLE SEMANA */}
            {semSelIdx !== null && capas.has('prog') && (
              <div className="border-t border-gray-800 bg-gray-900 px-4 py-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm">Semana {semSelIdx + 1}</span>
                    <span className="text-gray-500 text-xs">{semLabel(fechaInicio, semSelIdx)}</span>
                    {loadingDetalle && <span className="text-blue-400 text-xs">Cargando...</span>}
                  </div>
                  <button onClick={() => { setSemSelIdx(null); setDetalleSem(null) }} className="text-gray-500 hover:text-white text-xl leading-none transition">x</button>
                </div>
                {!loadingDetalle && detalleSem && (
                  detalleSem.sesiones.length === 0 ? (
                    <p className="text-gray-600 text-sm">Sin sesiones programadas esta semana</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-3">
                      {([
                        { discs: ['Natacion', 'Natación'], label: 'Natacion', color: '#3B82F6', icon: '🏊' },
                        { discs: ['Ciclismo'], label: 'Ciclismo', color: '#EAB308', icon: '🚴' },
                        { discs: ['Carrera'], label: 'Carrera', color: '#22C55E', icon: '🏃' },
                        { discs: ['Fuerza'], label: 'Fuerza', color: '#EF4444', icon: '💪' },
                      ] as { discs: string[]; label: string; color: string; icon: string }[]).map(({ discs, label, color, icon }) => {
                        const sesDisc = detalleSem.sesiones.filter((s: any) => discs.includes(s.disciplina))
                        const tareasDisc = detalleSem.tareas.filter((t: any) => sesDisc.some((s: any) => s.id === t.id_sesion))
                        const minutos = sesDisc.reduce((a: number, s: any) => a + (s.duracion_minutos || 0), 0)

                        if (label === 'Fuerza') {
                          /* La cuenta la hace lib/series-por-grupo, que es la
                             misma que usa /volumen. Estaban escritas dos veces
                             y no coincidían: aquí una fila sin número de series
                             contaba 1 y allí 0. */
                          const porGrupo = seriesPorGrupo(
                            detalleSem.ejercicios.filter((e: any) => tareasDisc.some((t: any) => t.id === e.id_tarea)))
                          const topGrupos: [string, number][] = porGrupo.slice(0, 4).map(g => [g.grupo, g.series])
                          const totalSeries = sumaSeries(porGrupo)
                          return (
                            <div key={label} className="bg-gray-800 rounded-xl p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span>{icon}</span>
                                <span className="text-white text-xs font-bold">{label}</span>
                              </div>
                              {sesDisc.length === 0 ? <p className="text-gray-600 text-xs">Sin sesiones</p> : (
                                <>
                                  <p className="text-gray-400 text-xs mb-2">{minutos}min · {sesDisc.length} ses</p>
                                  {topGrupos.length === 0 ? <p className="text-gray-600 text-xs">Sin ejercicios</p> : topGrupos.map(([g, series]: [string, any]) => {
                                    const pct = totalSeries > 0 ? Math.round(series / totalSeries * 100) : 0
                                    return (
                                      <div key={g} className="mb-1.5">
                                        <div className="flex justify-between text-xs mb-0.5">
                                          <span className="text-gray-400 truncate" style={{ maxWidth: '65%' }}>{g}</span>
                                          <span className="text-red-400 font-bold">{pct}%</span>
                                        </div>
                                        <div className="bg-gray-700 rounded-full h-1">
                                          <div className="h-1 rounded-full bg-red-500" style={{ width: pct + '%' }} />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </>
                              )}
                            </div>
                          )
                        }

                        const ZONA_COL = COLOR_ZONA
                        const zonas: Record<string, number> = {}
                        let totalVol = 0
                        tareasDisc.forEach((t: any) => {
                          const zona = t.zona_entrenamiento || 'Sin zona'
                          const dist = detalleSem.distancias.find((d: any) => d.id_tarea === t.id)
                          const dur = detalleSem.duraciones.find((d: any) => d.id_tarea === t.id)
                          const vol = ((dist?.metros_planeados || 0) + (dur?.tiempo_planeado || 0)) * (t.series || 1)
                          zonas[zona] = (zonas[zona] || 0) + vol; totalVol += vol
                        })
                        const zonasOrdenadas = Object.entries(zonas).sort((a: any, b: any) => b[1] - a[1])

                        return (
                          <div key={label} className="bg-gray-800 rounded-xl p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <span>{icon}</span>
                              <span className="text-white text-xs font-bold">{label}</span>
                            </div>
                            {sesDisc.length === 0 ? <p className="text-gray-600 text-xs">Sin sesiones</p> :
                            totalVol === 0 ? <p className="text-gray-500 text-xs">{sesDisc.length} ses · sin tareas con volumen</p> : (
                              <div className="flex flex-col gap-1.5">
                                {zonasOrdenadas.map(([zona, vol]: [string, any]) => {
                                  const pct = Math.round(vol / totalVol * 100)
                                  const zonaKey = Object.keys(ZONA_COL).find(k => zona.includes(k))
                                  const col2 = zonaKey ? ZONA_COL[zonaKey] : color
                                  return (
                                    <div key={zona}>
                                      <div className="flex justify-between text-xs mb-0.5">
                                        <span className="text-gray-400 truncate" style={{ maxWidth: '65%' }}>{zona}</span>
                                        <span className="font-bold" style={{ color: col2 }}>{pct}%</span>
                                      </div>
                                      <div className="bg-gray-700 rounded-full h-1.5">
                                        <div className="h-1.5 rounded-full" style={{ width: pct + '%', backgroundColor: col2 }} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Competiciones */}
            <div className="bg-gray-900 border-t border-gray-800 px-4 py-2 flex items-center gap-3 flex-shrink-0 overflow-x-auto">
              <button onClick={() => openCompModal(sems.find(s => !compDeSemana(s.i))?.i ?? 0)}
                className="bg-yellow-900/40 hover:bg-yellow-900/60 border border-yellow-700/50 text-yellow-400 text-xs px-3 py-1.5 rounded-lg transition flex-shrink-0 font-medium">
                🏆 + Competicion
              </button>
              {compsReales.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5"
                  style={{ background: defDe(prioridadDe(c)).hex + '1f', border: '1px solid ' + defDe(prioridadDe(c)).hex + '55' }}>
                  <span className="text-[11px]">{defDe(prioridadDe(c)).simbolo}</span>
                  <span className="text-xs" style={{ color: defDe(prioridadDe(c)).hex }}>{c.nombre}</span>
                  <span className="text-[10px] text-gray-500">{c.fecha.slice(5)}</span>
                  <button onClick={() => borrarCompReal(c.id)} className="text-gray-600 hover:text-red-400 text-xs ml-0.5">x</button>
                </span>
              ))}
              {compsReales.length === 0 && <span className="text-gray-700 text-xs">Sin competiciones todavia</span>}
            </div>
          </div>

          {/* PANEL DERECHO */}
          <div className="w-72 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">

            {/* CAPAS VISIBLES */}
            <div className="flex-shrink-0 border-b border-gray-800 p-3">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Capas visibles en el canvas</p>
              <div className="flex gap-1 mb-3">
                {([['plan', 'Planificado', '#EA580C'], ['prog', 'Programado', '#3B82F6'], ['real', 'Realizado', '#22C55E']] as [string, string, string][]).map(([k, label, col]) => (
                  <button key={k} onClick={() => toggleCapa(k)}
                    className={'flex-1 py-2 rounded-lg text-xs font-bold transition border ' + (capas.has(k) ? 'text-white' : 'text-gray-600 border-gray-700 hover:text-gray-400')}
                    style={capas.has(k) ? { backgroundColor: col, borderColor: col } : {}}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {([['plan', '#EA580C'], ['prog', '#3B82F6'], ['real', '#22C55E']] as [string, string][]).map(([k, col]) => {
                  const total = uaPorSemana.reduce((a, u) => a + (u as any)[k], 0)
                  return (
                    <div key={k} className={'flex-1 rounded-lg p-2 text-center transition ' + (capas.has(k) ? 'opacity-100' : 'opacity-30')}
                      style={{ backgroundColor: col + '15', border: '1px solid ' + col + '40' }}>
                      <p className="font-bold text-xs" style={{ color: col }}>{total > 0 ? total.toLocaleString() : '—'}</p>
                      <p className="text-gray-600" style={{ fontSize: 9 }}>{k === 'plan' ? 'Plan' : k === 'prog' ? 'Prog' : 'Real'} UA</p>
                    </div>
                  )
                })}
              </div>
              {!capas.has('plan') && (capas.has('prog') || capas.has('real')) && (
                <div className="mt-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-yellow-400 text-xs font-medium">Modo comparacion</p>
                  <p className="text-yellow-600 text-xs">Edicion de UA desactivada</p>
                </div>
              )}
            </div>

            <div className="flex border-b border-gray-800 flex-shrink-0">
              {[['plan', 'Planificado'], ['prog', 'Programado'], ['real', 'Realizado']].map(([k, label]) => (
                <button key={k} onClick={() => setPanelTab(k)}
                  className={'flex-1 py-3 text-xs font-medium transition border-b-2 ' + (panelTab === k ? 'text-orange-400 border-orange-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {panelTab === 'plan' && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2">
                    {[{ v: String(totalSem), l: 'semanas' }, { v: uaTotal.toLocaleString(), l: 'UA total' }, { v: String(macros.length), l: 'macrociclos' }, { v: String(mesos.length), l: 'mesociclos' }].map(({ v, l }) => (
                      <div key={l} className="bg-gray-800 rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-orange-400">{v}</p>
                        <p className="text-gray-500 text-xs">{l}</p>
                      </div>
                    ))}
                  </div>
                  {macros.length === 0 && (
                    <div className="bg-gray-800 rounded-xl p-4 text-center">
                      <p className="text-2xl mb-2">✏️</p>
                      <p className="text-gray-400 text-sm mb-1">Arrastra en la banda MACRO</p>
                      <p className="text-gray-600 text-xs">Pulsa y arrastra para dibujar el bloque</p>
                    </div>
                  )}
                  {macros.map(mac => {
                    const uaMac = sems.filter(s => s.i >= mac.si && s.i <= mac.sf).reduce((a, s) => a + (s.ua || 0), 0)
                    return (
                      <div key={mac.id} className="bg-gray-800 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: C_MACRO[mac.tipo] || '#EA580C' }} />
                          <span className="text-white text-sm font-bold truncate">{mac.nombre}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mb-2">
                          <span>{mac.tipo}</span><span>S{mac.si + 1}–S{mac.sf + 1} · {mac.sf - mac.si + 1} sem</span>
                        </div>
                        {uaMac > 0 ? (
                          <>
                            <div className="flex justify-between text-xs mb-1"><span className="text-gray-500">UA</span><span className="text-orange-400 font-bold">{uaMac.toLocaleString()}</span></div>
                            <div className="bg-gray-700 rounded-full h-1.5 mb-2"><div className="h-1.5 rounded-full bg-orange-500" style={{ width: uaTotal > 0 ? (uaMac / uaTotal * 100) + '%' : '0%' }} /></div>
                          </>
                        ) : <p className="text-gray-600 text-xs italic mb-2">Sin UA — arrastra las barras</p>}
                        {uaMeso.filter(m => m.macroId === mac.id).map(me => (
                          <div key={me.id} className="flex items-center gap-2 py-1 border-t border-gray-700">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C_MESO[me.tipo] || '#EA580C' }} />
                            <span className="text-gray-300 text-xs truncate flex-1">{me.nombre}</span>
                            <span className="text-gray-500 text-xs">{me.sf - me.si + 1}s</span>
                            {me.ua > 0 && <span className="text-gray-400 text-xs font-medium">{me.ua}</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {compsReales.length > 0 && (
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Competiciones</p>
                      {compsReales.map(c => {
                        const wi = fechaInicio ? semanasEntre(fechaInicio, c.fecha) : -1
                        const d = defDe(prioridadDe(c))
                        return (
                          <div key={c.id} className="flex items-center gap-2 rounded-lg px-3 py-2 mb-1"
                            style={{ background: d.hex + '18', border: '1px solid ' + d.hex + '4d' }}>
                            <span>{d.simbolo}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: d.hex }}>{c.nombre}</p>
                              <p className="text-gray-500 text-xs">
                                {wi >= 0 ? 'Semana ' + (wi + 1) + ' · ' : ''}{c.fecha} · {d.etiqueta}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <button onClick={generado ? () => router.push('/planificacion-visual/' + id) : generar}
                    disabled={generando || (!generado && macros.length === 0)}
                    className={'w-full py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 ' + (generado ? 'bg-green-600 hover:bg-green-500 text-white' : macros.length === 0 ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-white')}>
                    {generando ? 'Guardando...' : generado ? 'Ver planificacion →' : modoEdicion ? 'Actualizar planificacion' : 'Generar planificacion'}
                  </button>
                </div>
              )}
              {panelTab === 'prog' && (
                <div className="flex flex-col gap-3">
                  <p className="text-gray-300 text-sm font-medium">Volumen programado</p>
                  {(!generado && !modoEdicion) ? (
                    <div className="bg-gray-800 rounded-xl p-5 text-center mt-2">
                      <p className="text-3xl mb-2">📅</p>
                      <p className="text-gray-500 text-xs">Genera la planificacion primero</p>
                    </div>
                  ) : sesionesProg.length === 0 ? (
                    <div className="bg-gray-800 rounded-xl p-5 text-center">
                      <p className="text-3xl mb-2">📋</p>
                      <p className="text-gray-500 text-xs mb-2">No hay sesiones programadas todavia</p>
                      <button onClick={() => router.push('/planificacion-visual/' + id)} className="text-orange-400 hover:text-orange-300 text-xs transition">Ir a planificar sesiones →</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {/* Resumen por disciplina */}
                      {(() => {
                        const discs = ['Natacion', 'Natación', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick']
                        const colores: Record<string, string> = { 'Natacion': '#3B82F6', 'Natación': '#3B82F6', Ciclismo: '#EAB308', Carrera: '#22C55E', Fuerza: '#EF4444', Brick: '#A855F7' }
                        const grupos: Record<string, any[]> = {}
                        sesionesProg.forEach(s => { const d = s.disciplina || 'Otro'; if (!grupos[d]) grupos[d] = []; grupos[d].push(s) })
                        return (
                          <div className="flex flex-col gap-2">
                            <p className="text-gray-500 text-xs uppercase tracking-wide">Por disciplina</p>
                            {Object.entries(grupos).map(([disc, sess]) => {
                                const minutos = sess.reduce((a, s) => a + (s.duracion_minutos || 0), 0)
                                const realizadas = sess.filter(s => s.estado === 'Realizada' || s.rpe_reportado).length
                                const col = colores[disc] || '#6B7280'
                                return (
                                  <div key={disc} className="bg-gray-800 rounded-xl p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col }} />
                                      <span className="text-white text-xs font-bold">{disc}</span>
                                      <span className="text-gray-500 text-xs ml-auto">{sess.length} sesiones</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                      <span>{minutos > 0 ? Math.round(minutos / 60) + 'h ' + (minutos % 60) + 'min' : '— min'}</span>
                                      <span className="text-green-400">{realizadas}/{sess.length} hechas</span>
                                    </div>
                                    <div className="bg-gray-700 rounded-full h-1 mt-2">
                                      <div className="h-1 rounded-full" style={{ width: (realizadas / sess.length * 100) + '%', backgroundColor: col }} />
                                    </div>
                                  </div>
                                )
                            })}
                          </div>
                        )
                      })()}
                      {/* UA planificada vs programada por semana */}
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">UA planificada vs sesiones</p>
                        {macros.map(mac => (
                          <div key={mac.id} className="mb-3">
                            <p className="text-orange-400 text-xs font-medium mb-1">{mac.nombre}</p>
                            {sems.filter(s => s.i >= mac.si && s.i <= mac.sf && (s.ua || 0) > 0).slice(0, 8).map(s => {
                              const fechaSem = semFecha(fechaInicio, s.i)
                              const sessSem = sesionesProg.filter(se => {
                                if (!se.fecha_sesion) return false
                                const d = new Date(se.fecha_sesion + 'T12:00:00')
                                const lunes = new Date(fechaSem + 'T12:00:00')
                                const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
                                return d >= lunes && d <= domingo
                              })
                              const tieneRPE = sessSem.some(se => se.rpe_reportado)
                              return (
                                <div key={s.i} className="flex items-center gap-2 py-1 border-t border-gray-800">
                                  <span className="text-gray-600 text-xs w-6">S{s.i + 1}</span>
                                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-orange-500/50" style={{ width: '100%' }} />
                                  </div>
                                  <span className="text-orange-400 text-xs font-medium">{s.ua}</span>
                                  <span className="text-gray-600 text-xs">{sessSem.length > 0 ? sessSem.length + 'ses' : '—'}</span>
                                  {tieneRPE && <span className="text-green-400 text-xs">✓</span>}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => router.push('/planificacion-visual/' + id)} className="w-full bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-xs text-gray-400 hover:text-white transition">
                        Ver planificacion completa →
                      </button>
                    </div>
                  )}
                </div>
              )}
              {panelTab === 'real' && (
                <div className="flex flex-col gap-3">
                  <p className="text-gray-300 text-sm font-medium">Carga ejecutada real</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Carga real de {dep.nombre} basada en sesiones completadas con RPE y FC reportados.</p>
                  <div className="bg-gray-800 rounded-xl p-5 text-center mt-2"><p className="text-3xl mb-2">📊</p><p className="text-gray-500 text-xs">Disponible cuando el deportista complete sesiones</p></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR */}
      {modalEditar && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setModalEditar(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="font-bold text-xl">Editar {modalEditar.tipo === 'macro' ? 'macrociclo' : 'mesociclo'}</h3>
                <p className="text-gray-500 text-xs mt-0.5">{modalEditar.item.nombre}</p>
              </div>
              <button onClick={() => setModalEditar(null)} className="text-gray-400 hover:text-white text-2xl leading-none">x</button>
            </div>
            <div className="flex flex-col gap-4">
              <input type="text" placeholder="Nombre" value={editNom} onChange={e => setEditNom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && guardarEdicion()} autoFocus
                className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Tipo</label>
                <select value={editTipo} onChange={e => setEditTipo(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 w-full">
                  {modalEditar.tipo === 'macro' ? (
                    <>{['Tradicional','Inversa','ATR','Ondulatoria'].map(o => <option key={o} value={o}>{o}</option>)}</>
                  ) : (
                    <>{mesoOpts(macros.find(m => m.id === (modalEditar.item as MesoD).macroId)?.tipo || '').map(o => <option key={o} value={o}>{o}</option>)}</>
                  )}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Duracion: <span className="text-orange-400 font-bold">{editDur} semanas</span></label>
                <input type="range" min={1}
                  max={modalEditar.tipo === 'macro' ? totalSem - (modalEditar.item as MacroD).si : (() => { const me = modalEditar.item as MesoD; const mac = macros.find(m => m.id === me.macroId); return mac ? mac.sf - me.si + 1 : 8 })()}
                  value={editDur} onChange={e => setEditDur(Number(e.target.value))} className="w-full accent-orange-500" />
              </div>
              {modalEditar.tipo === 'meso' && (
                <div>
                  <label className="text-gray-400 text-sm mb-1.5 block">Intensidad relativa: <span className="text-orange-400 font-bold">{editInt}/10</span></label>
                  <input type="range" min={1} max={10} value={editInt} onChange={e => setEditInt(Number(e.target.value))} className="w-full accent-orange-500" />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={guardarEdicion} className="flex-1 bg-orange-500 hover:bg-orange-600 py-3 rounded-xl font-bold text-white transition">Guardar cambios</button>
                <button onClick={() => { if (modalEditar.tipo === 'macro') borrarMacro((modalEditar.item as MacroD).id); else borrarMeso((modalEditar.item as MesoD).id); setModalEditar(null) }}
                  className="bg-red-900/50 hover:bg-red-900 border border-red-700/50 text-red-400 hover:text-red-300 px-4 py-3 rounded-xl text-sm transition">
                  Borrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MACRO */}
      {modal === 'macro' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <div><h3 className="font-bold text-xl">Nuevo macrociclo</h3><p className="text-gray-500 text-xs mt-0.5">S{fIni + 1} → S{fIni + fDur} · {fDur} semanas</p></div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">x</button>
            </div>
            <div className="flex flex-col gap-4">
              <input type="text" placeholder="Nombre (ej: Temporada 2026)" value={fNom} onChange={e => setFNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveMacro()} autoFocus
                className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Tipo de periodizacion</label>
                <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 w-full">
                  <option value="Tradicional">Tradicional</option><option value="Inversa">Inversa</option>
                  <option value="ATR">ATR</option><option value="Ondulatoria">Ondulatoria</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Duracion: <span className="text-orange-400 font-bold">{fDur} semanas</span></label>
                <input type="range" min={1} max={totalSem - fIni} value={fDur} onChange={e => setFDur(Number(e.target.value))} className="w-full accent-orange-500" />
              </div>
              <button onClick={saveMacro} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-xl font-bold text-white transition">Crear macrociclo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MESO */}
      {modal === 'meso' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <div><h3 className="font-bold text-xl">Nuevo mesociclo</h3><p className="text-orange-400 text-xs mt-0.5">{macros.find(m => m.id === mMacId)?.nombre} · S{fIni + 1}–S{fIni + fDur} · {fDur} sem</p></div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">x</button>
            </div>
            <div className="flex flex-col gap-4">
              <input type="text" placeholder="Nombre del bloque" value={fNom} onChange={e => setFNom(e.target.value)} autoFocus className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Tipo</label>
                <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 w-full">
                  {mesoOpts(macros.find(m => m.id === mMacId)?.tipo || '').map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Duracion: <span className="text-orange-400 font-bold">{fDur} semanas</span></label>
                <input type="range" min={1} max={(() => { const mac = macros.find(m => m.id === mMacId); return mac ? mac.sf - fIni + 1 : 8 })()} value={fDur}
                  onChange={e => setFDur(Number(e.target.value))} className="w-full accent-orange-500" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Intensidad relativa: <span className="text-orange-400 font-bold">{fInt}/10</span></label>
                <input type="range" min={1} max={10} value={fInt} onChange={e => setFInt(Number(e.target.value))} className="w-full accent-orange-500" />
              </div>
              <button onClick={saveMeso} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-xl font-bold text-white transition">Crear mesociclo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COMPETICION */}
      {modal === 'comp' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5"><h3 className="font-bold text-xl">Nueva competicion</h3><button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">x</button></div>
            <div className="flex flex-col gap-4">
              <div>
                {/* Fecha, no semana: la competicion se guarda en la tabla que
                    comparte con el calendario, y ahi lo que hay es un dia. La
                    semana del lienzo se deduce de ella. */}
                <label className="text-gray-400 text-sm mb-1.5 block">Fecha</label>
                <input type="date" value={fCompFecha}
                  onChange={e => {
                    setFCompFecha(e.target.value)
                    const wi = fechaInicio && e.target.value ? semanasEntre(fechaInicio, e.target.value) : 0
                    setMIdx(wi); setTaperSug([wi - 1, wi - 2].filter(x => x >= 0))
                  }}
                  className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-yellow-500 w-full" />
                {fechaInicio && fCompFecha && (
                  <p className="text-gray-500 text-xs mt-1">Cae en la semana {semanasEntre(fechaInicio, fCompFecha) + 1} del lienzo.</p>
                )}
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">Importancia</label>
                <div className="flex gap-1.5">
                  {PRIORIDADES.map(pr => (
                    <button type="button" key={pr.id} onClick={() => setFCompPrio(pr.id)}
                      className={'flex-1 rounded-lg border px-2 py-2 text-[12px] transition ' +
                        (fCompPrio === pr.id ? 'text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white')}
                      style={fCompPrio === pr.id ? { borderColor: pr.hex, background: pr.hex + '22' } : undefined}>
                      {pr.simbolo} {pr.etiqueta}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-1.5">{defDe(fCompPrio).taperTexto}</p>
              </div>
              <input type="text" placeholder="Nombre de la competicion" value={fComp} onChange={e => setFComp(e.target.value)} onKeyDown={e => e.key === 'Enter' && guardarCompReal(false)} autoFocus className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-yellow-500" />
              {taperSug.length > 0 ? (
                <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                  <p className="text-purple-300 text-sm font-bold mb-1">Taper recomendado</p>
                  <p className="text-gray-400 text-xs mb-3">Reducir carga en S{taperSug.map(i => i + 1).reverse().join(' y S')} antes de la competicion.</p>
                  <div className="flex gap-2">
                    <button onClick={() => guardarCompReal(true)} className="flex-1 bg-purple-600 hover:bg-purple-500 py-2.5 rounded-xl text-sm font-bold transition">Aplicar taper</button>
                    <button onClick={() => guardarCompReal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-sm transition">Sin taper</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => guardarCompReal(false)} className="bg-yellow-600 hover:bg-yellow-500 py-3 rounded-xl font-bold text-white transition">Guardar competicion</button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
