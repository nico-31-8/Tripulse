'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { cargaZona } from '@/lib/zonas'
import ConstructorBrick from '@/components/ConstructorBrick'
import { BRICK_VACIO, brickValido, rpeBrick, guardarBrick, type BrickValor } from '@/lib/bricks'
import type { ChipZona } from '@/lib/chips'

const DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
const DIAS_CORTO = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

const COLOR_DISC: Record<string, string> = {
  Natacion: 'bg-blue-900 text-blue-300', Natación: 'bg-blue-900 text-blue-300',
  Ciclismo: 'bg-yellow-900 text-yellow-300',
  Carrera: 'bg-green-900 text-green-300',
  Fuerza: 'bg-red-900 text-red-300',
  Brick: 'bg-purple-900 text-purple-300',
}
const DISC_CORTO: Record<string, string> = { Natacion: 'Nat', Natación: 'Nat', Ciclismo: 'Cic', Carrera: 'Car', Fuerza: 'Fue', Brick: 'Brk' }
// Para leer de un vistazo la secuencia de un brick en la tarjeta.
const EMOJI_DISC: Record<string, string> = { Natacion: '🏊', Natación: '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️' }

function fechaStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// Color de texto legible (oscuro/blanco) según la luminancia del fondo del chip.
function txtSobre(hex: string): string {
  const c = (hex || '#888888').replace('#', '')
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0a0b0f' : '#ffffff'
}

function diasDeSemana(lunes: string): { fecha: string; dia: string; diaCorto: string; dayNum: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return { fecha: fechaStr(d), dia: DIAS[i], diaCorto: DIAS_CORTO[i], dayNum: d.getDate() }
  })
}

// Misma fórmula que en el Dibujo: índice de semana (0-based) desde el inicio del macrociclo.
function weeksBetween(f1: string, f2: string): number {
  const d1 = new Date(f1 + 'T12:00:00'); const d2 = new Date(f2 + 'T12:00:00')
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 7))
}


export default function SemanaPage({ params }: { params: Promise<{ id: string; fecha: string }> }) {
  const router = useRouter()
  const { id, fecha } = use(params)
  useRequireEntrenador()
  const [dep, setDep] = useState<any>(null)
  const [microciclo, setMicrociclo] = useState<any>(null)
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<string | null>(null) // fecha seleccionada
  const [disc, setDisc] = useState('')
  const [duracion, setDuracion] = useState('')
  const [rpe, setRpe] = useState('')
  const [notas, setNotas] = useState('')
  const [cronometro, setCronometro] = useState(false)
  const [brick, setBrick] = useState<BrickValor>(BRICK_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [uaProg, setUaProg] = useState(0)
  const [uaReal, setUaReal] = useState(0)
  const [sesZonasAll, setSesZonasAll] = useState<ChipZona[]>([])
  const [borradorId, setBorradorId] = useState<number | null>(null)
  const [weekIndex, setWeekIndex] = useState<number | null>(null)
  const [dragOverDia, setDragOverDia] = useState<string | null>(null)
  const [draggingChip, setDraggingChip] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<string[]>([])

  const dias = diasDeSemana(fecha)
  const hoy = fechaStr(new Date())

  useEffect(() => { cargar() }, [id, fecha])

  const cargar = async () => {
    setLoading(true)
    const { data: depData } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDep(depData)

    // Buscar el microciclo que corresponde a esta semana
    let sesiones_cargadas: any[] = []
    const { data: macs } = await supabase.from('macrociclo').select('id, fecha_inicio').eq('id_deportista', id).order('fecha_inicio')
    if (macs?.length) {
      setWeekIndex(weeksBetween(macs[0].fecha_inicio, fecha))
      const macIds = macs.map((m: any) => m.id)
      const { data: mes } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macIds)
      if (mes?.length) {
        const mesIds = mes.map((m: any) => m.id)
        const { data: micros } = await supabase.from('microciclo').select('*').in('id_mesociclo', mesIds)
        const micro = micros?.find((m: any) => m.fecha_inicio === fecha)
        setMicrociclo(micro || null)
        if (micro) {
          const { data: ses } = await supabase.from('sesion').select('*').eq('id_microciclo', micro.id).eq('eliminada', false).order('fecha_sesion')
          sesiones_cargadas = ses || []
          setSesiones(sesiones_cargadas)
        }
      }
    }

    // Sesiones "libres" (añadidas por el atleta, sin microciclo) que caen en esta semana.
    const domISO = (() => { const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10) })()
    const { data: libres } = await supabase.from('sesion').select('*')
      .eq('id_deportista', Number(id)).is('id_microciclo', null)
      .gte('fecha_sesion', fecha).lte('fecha_sesion', domISO)
      .or('eliminada.is.null,eliminada.eq.false')
    if (libres?.length) { sesiones_cargadas = [...sesiones_cargadas, ...libres]; setSesiones(sesiones_cargadas) }

    // Unidades planificadas (zonas) para esta semana, desde el Dibujo
    const { data: borrador } = await supabase.from('dibujo_borrador').select('id, sesiones_zonas').eq('id_deportista', Number(id)).maybeSingle()
    setBorradorId(borrador?.id ?? null)
    setSesZonasAll(borrador?.sesiones_zonas || [])

    // Calcular UA programada y real
    const sesIds = sesiones_cargadas.map((s: any) => s.id)
    if (sesIds.length > 0) {
      const { data: tareasData } = await supabase.from('tarea').select('id, id_sesion, series, zona_entrenamiento, disciplina, orden').in('id_sesion', sesIds).order('orden')
      const tareaIds = (tareasData || []).map((t: any) => t.id)
      const [{ data: dists }, { data: durs }] = await Promise.all([
        tareaIds.length ? supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : { data: [] },
        tareaIds.length ? supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : { data: [] },
      ])
      let progTotal = 0
      sesiones_cargadas.forEach((s: any) => {
        const tarSes = (tareasData || []).filter((t: any) => t.id_sesion === s.id)
        tarSes.forEach((t: any) => {
          const dist = (dists || []).find((d: any) => d.id_tarea === t.id)
          const dur = (durs || []).find((d: any) => d.id_tarea === t.id)
          const vol = ((dist?.metros_planeados || 0) + (dur?.tiempo_planeado || 0)) * (t.series || 1)
          progTotal += vol
        })
        if (tarSes.length === 0) progTotal += (s.rpe_estimado || 5) * (s.duracion_minutos || 0)
      })
      setUaProg(Math.round(progTotal))
      let realTotal = 0
      sesiones_cargadas.filter((s: any) => s.rpe_reportado).forEach((s: any) => {
        realTotal += (s.rpe_reportado || 0) * (s.duracion_minutos || 0)
      })
      setUaReal(Math.round(realTotal))

      // Bloques de cada sesión, en orden (para la tarjeta: simple/compleja + siglas,
      // y en un brick la secuencia de deportes: 🚴 AEM → 🏃 AEM).
      const bloquesPorSes: Record<number, { zona: string; disciplina: string | null }[]> = {}
      ;(tareasData || []).forEach((t: any) => {
        if (!t.zona_entrenamiento) return
        if (!bloquesPorSes[t.id_sesion]) bloquesPorSes[t.id_sesion] = []
        bloquesPorSes[t.id_sesion].push({ zona: t.zona_entrenamiento, disciplina: t.disciplina })
      })
      setSesiones(sesiones_cargadas.map((s: any) => {
        let bloques = bloquesPorSes[s.id] || []
        if (bloques.length === 0 && s.zona_fuerza) bloques = [{ zona: s.zona_fuerza, disciplina: 'Fuerza' }]
        return { ...s, _bloques: bloques, _zonas: bloques.map(b => b.zona) }
      }))
    } else {
      setUaProg(0)
      setUaReal(0)
    }
    setLoading(false)
  }

  // Obtiene el microciclo de esta semana, creandolo automaticamente si aun no existe.
  const obtenerOcrearMicrociclo = async (): Promise<number | null> => {
    if (microciclo?.id) return microciclo.id
    const { data: macs } = await supabase.from('macrociclo').select('id').eq('id_deportista', id)
    if (!macs?.length) { alert('No hay macrociclo para este deportista'); return null }
    const macIds = macs.map((m: any) => m.id)
    const { data: mes } = await supabase.from('mesociclo').select('id, fecha_inicio, duracion_semanas').in('id_macrociclo', macIds)
    // Encontrar el meso que contiene esta fecha
    const mesoContenedor = mes?.find((me: any) => {
      const ini = new Date(me.fecha_inicio + 'T12:00:00')
      const fin = new Date(ini); fin.setDate(ini.getDate() + me.duracion_semanas * 7)
      const d = new Date(fecha + 'T12:00:00')
      return d >= ini && d < fin
    })
    if (!mesoContenedor) { alert('Esta semana no pertenece a ningun mesociclo. Genera la planificacion primero desde el Dibujo.'); return null }
    const { data: nuevoMicro } = await supabase.from('microciclo').insert({
      id_mesociclo: mesoContenedor.id,
      objetivo: 'Semana del ' + fecha,
      tipo: 'Carga',
      fecha_inicio: fecha,
      duracion_dias: 7,
    }).select().single()
    if (!nuevoMicro) { alert('Error creando semana'); return null }
    setMicrociclo(nuevoMicro)
    return nuevoMicro.id
  }

  const crearSesion = async (fechaDia: string) => {
    if (!disc) { alert('Elige una disciplina'); return }
    const esB = disc === 'Brick'
    if (esB && !brickValido(brick)) { alert('Un brick necesita al menos dos bloques con duración.'); return }
    setGuardando(true)
    const microId = await obtenerOcrearMicrociclo()
    if (!microId) { setGuardando(false); return }

    // El brick manda en duración y RPE: salen de sus bloques, no de los campos manuales.
    const { data: nueva } = await supabase.from('sesion').insert({
      id_microciclo: microId,
      disciplina: disc,
      fecha_sesion: fechaDia,
      duracion_minutos: esB ? brick.bloques.reduce((a, b) => a + b.minutos, 0) : (duracion ? Number(duracion) : null),
      rpe_estimado: esB ? (rpe ? Number(rpe) : rpeBrick(brick)) : (rpe ? Number(rpe) : null),
      notas_entrenador: notas,
      estado: 'Planificada',
      usar_cronometro: cronometro,
    }).select().single()
    if (esB) {
      if (!nueva) { alert('No se ha podido crear la sesión, así que el brick no se ha guardado.'); setGuardando(false); return }
      const err = await guardarBrick(supabase, nueva.id, brick)
      if (err) { alert('Sesión creada, pero los bloques del brick NO se han guardado.\n\n' + err); setGuardando(false); return }
    }

    setDisc(''); setDuracion(''); setRpe(''); setNotas(''); setCronometro(false); setBrick(BRICK_VACIO)
    setModal(null)
    await cargar()
    setGuardando(false)
  }

  const borrarSesion = async (sesId: number) => {
    if (!confirm('Mover esta sesion a la papelera?')) return
    await supabase.from('sesion').update({ eliminada: true }).eq('id', sesId)
    setSesiones(p => p.filter(s => s.id !== sesId))
  }

  // Persiste el array de chips de zona (tras usar uno o marcarlo como hecho) en dibujo_borrador.
  const persistirZonas = async (nuevoArray: ChipZona[]) => {
    setSesZonasAll(nuevoArray)
    if (borradorId) await supabase.from('dibujo_borrador').update({ sesiones_zonas: nuevoArray }).eq('id', borradorId)
  }

  // Arrastrar una unidad a un día → UNA sesión (1 zona = simple, varias = compleja).
  // Cada zona se materializa como una tarea real, así cuenta en la distribución de zonas.
  const crearSesionDesdeUnidad = async (chips: ChipZona[], fechaDia: string) => {
    if (!chips.length) return
    setGuardando(true)
    const microId = await obtenerOcrearMicrociclo()
    if (!microId) { setGuardando(false); return }

    const disciplina = chips[0].disciplina
    const esFuerza = disciplina === 'Fuerza'
    const compleja = chips.length > 1
    // Un chip de brick trae sus bloques del canvas: manda él, no la zona del chip.
    const chipBrick = chips.length === 1 && chips[0].disciplina === 'Brick' ? chips[0].brick : null
    // Red de seguridad: un brick nunca debe caer al camino normal, que crearía tareas
    // con disciplina 'Brick' y dejaría su volumen sin atribuir a ningún deporte.
    if (!chipBrick && chips.some(c => c.disciplina === 'Brick')) {
      alert('Un brick se arrastra solo, no agrupado con otras zonas.'); setGuardando(false); return
    }
    const rpeEstim = chipBrick
      ? rpeBrick(chipBrick)
      : Math.round(chips.reduce((a, c) => a + cargaZona(c.zona).rpe, 0) / chips.length)

    const { data: nuevaSesion, error: errSes } = await supabase.from('sesion').insert({
      id_microciclo: microId,
      disciplina,
      fecha_sesion: fechaDia,
      duracion_minutos: chipBrick ? chipBrick.bloques.reduce((a, b) => a + b.minutos, 0) : null,
      rpe_estimado: rpeEstim,
      estado: 'Planificada',
      modo_fuerza: esFuerza ? (compleja ? 'compleja' : 'simple') : null,
      zona_fuerza: esFuerza && !compleja ? chips[0].zona : null,
      notas_entrenador: null,
    }).select().single()
    if (errSes || !nuevaSesion) { alert('Error creando la sesión: ' + (errSes?.message || '')); setGuardando(false); return }

    if (chipBrick) {
      // El brick materializa una tarea por bloque, cada una con su propio deporte.
      const err = await guardarBrick(supabase, nuevaSesion.id, chipBrick)
      if (err) { alert('Sesión creada, pero los bloques del brick NO se han guardado.\n\n' + err); setGuardando(false); return }
    } else if (!(esFuerza && !compleja)) {
      // Fuerza simple deja la zona a nivel de sesión (zona_fuerza) sin tarea, como en el resto
      // de la app. Resistencia (siempre) y fuerza compleja materializan una tarea por zona.
      const tareas = chips.map((c, i) => ({ id_sesion: nuevaSesion.id, zona_entrenamiento: c.zona, disciplina, orden: i + 1 }))
      const { error: errTar } = await supabase.from('tarea').insert(tareas)
      if (errTar) alert('Sesión creada, pero error al crear las tareas: ' + errTar.message)
    }

    // Los chips usados se marcan como hechos: siguen visibles en el canvas de periodización
    // pero salen del pool de "por arrastrar".
    await persistirZonas(sesZonasAll.map(z => chips.some(c => c.id === z.id) ? { ...z, hecho: true } : z))
    await cargar()
    setGuardando(false)
  }

  const toggleSeleccion = (chipId: string) => setSeleccion(s => s.includes(chipId) ? s.filter(x => x !== chipId) : [...s, chipId])

  // Fusiona todas las zonas seleccionadas (misma disciplina) en una unidad compleja.
  const fusionarSeleccion = async () => {
    const sel = sesZonasAll.filter(z => seleccion.includes(z.id))
    if (sel.length < 2) return
    if (!sel.every(z => z.disciplina === sel[0].disciplina)) { alert('Solo se pueden fusionar zonas de la misma disciplina'); return }
    // Un brick ya ES una unidad de varios bloques: fusionarlo con otro no significa nada
    // y rompería la atribución (acabaría con tareas de disciplina 'Brick').
    if (sel.some(z => z.disciplina === 'Brick')) { alert('Un brick ya es una unidad: edítalo desde el canvas para cambiar sus bloques.'); return }
    // Reutiliza un grupo existente entre las seleccionadas, si lo hay (para ampliar una unidad).
    const grupoId = sel.find(z => z.grupo)?.grupo || ('g' + Math.random().toString(36).slice(2))
    await persistirZonas(sesZonasAll.map(z => seleccion.includes(z.id) ? { ...z, grupo: grupoId } : z))
    setSeleccion([])
  }

  // Marca las zonas seleccionadas como hechas: salen del pool sin crear sesión.
  const marcarSeleccionHechas = async () => {
    await persistirZonas(sesZonasAll.map(z => seleccion.includes(z.id) ? { ...z, hecho: true } : z))
    setSeleccion([])
  }

  // Deshace una unidad fusionada: sus chips vuelven a ser sueltos.
  const separar = async (grupoId: string) => {
    await persistirZonas(sesZonasAll.map(z => z.grupo === grupoId ? { ...z, grupo: undefined } : z))
  }

  // Mueve una sesión ya colocada a otro día de la misma semana (corregir el día).
  const moverSesion = async (sesId: number, fechaDia: string) => {
    const s = sesiones.find(x => x.id === sesId)
    if (!s || s.fecha_sesion === fechaDia) return
    setSesiones(prev => prev.map(x => x.id === sesId ? { ...x, fecha_sesion: fechaDia } : x))
    await supabase.from('sesion').update({ fecha_sesion: fechaDia }).eq('id', sesId)
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  // Pool de esta semana agrupado en unidades: chips con el mismo `grupo` van juntos.
  const chipsSemana = sesZonasAll.filter(z => z.semana === weekIndex && !z.hecho)
  const unidadesPool: { grupo: string | null; chips: ChipZona[] }[] = []
  const grupoPos: Record<string, number> = {}
  chipsSemana.forEach(c => {
    if (c.grupo) {
      if (grupoPos[c.grupo] === undefined) { grupoPos[c.grupo] = unidadesPool.length; unidadesPool.push({ grupo: c.grupo, chips: [] }) }
      unidadesPool[grupoPos[c.grupo]].chips.push(c)
    } else unidadesPool.push({ grupo: null, chips: [c] })
  })
  const selChips = sesZonasAll.filter(z => seleccion.includes(z.id))
  const puedeFusionar = selChips.length >= 2 && selChips.every(z => z.disciplina === selChips[0].disciplina)

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-gray-300 text-sm font-medium">{dep?.nombre} — Semana del {fecha}</span>
          <button onClick={() => router.push(`/planificacion-visual/${id}/dibujo?editar=1`)} className="text-gray-400 hover:text-white text-sm transition">← Volver al Dibujo</button>
          <button onClick={() => router.push('/planificacion-visual/' + id + '/calendario')} className="text-gray-400 hover:text-white text-sm transition">Calendario</button>
        </div>
      </nav>

      <div className="flex-1 p-6">
        {/* Header semana */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Semana del {fecha}</h2>
            {microciclo && (
              <p className="text-gray-400 text-sm mt-0.5">{microciclo.objetivo} · {microciclo.tipo}
                {microciclo.ua_planificada && <span className="text-orange-400 ml-2">{microciclo.ua_planificada} UA planificadas</span>}
              </p>
            )}
          </div>
          {microciclo && (
            <div className="flex gap-2">
              <span className={'text-xs px-3 py-1 rounded-full font-medium ' +
                (microciclo.tipo === 'Carga' ? 'bg-orange-900 text-orange-300' :
                 microciclo.tipo?.includes('Recup') ? 'bg-green-900 text-green-300' :
                 microciclo.tipo === 'Taper' ? 'bg-purple-900 text-purple-300' :
                 'bg-blue-900 text-blue-300')}>
                {microciclo.tipo}
              </span>
            </div>
          )}
        </div>

        {/* Barra UA planificada vs programada */}
        {microciclo && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm font-medium">Carga de la semana {!microciclo.ua_planificada && <span className="text-gray-600 text-xs ml-1">(sin UA planificada)</span>}</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-green-400">■ {uaReal.toLocaleString()} real</span>
                <span className="text-blue-400">■ {uaProg.toLocaleString()} prog</span>
                <span className="text-orange-400">■ {microciclo.ua_planificada ? microciclo.ua_planificada.toLocaleString() : '—'} plan</span>
              </div>
            </div>
            <div className="bg-gray-800 rounded-full h-3 overflow-hidden mb-2">
              {(() => {
                const plan = microciclo.ua_planificada || 0
                const pctProg = plan > 0 ? Math.min(100, Math.round(uaProg / plan * 100)) : 0
                const pctReal = pctProg > 0 ? Math.min(100, Math.round(uaReal / uaProg * pctProg)) : 0
                return (
                  <div className="h-full rounded-full relative" style={{ width: pctProg + '%', backgroundColor: '#3B82F6', transition: 'width 0.4s' }}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: (pctProg > 0 ? (uaReal / Math.max(uaProg, 1) * 100) : 0) + '%', backgroundColor: '#22C55E', transition: 'width 0.4s' }} />
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-between items-center">
              {(() => {
                const plan = microciclo.ua_planificada || 0
                const pct = plan > 0 ? Math.min(100, Math.round(uaProg / plan * 100)) : 0
                const restante = Math.max(0, plan - uaProg)
                return (
                  <>
                    <span className="font-bold text-lg" style={{ color: pct >= 100 ? '#22C55E' : pct >= 70 ? '#EAB308' : '#3B82F6' }}>{pct}%</span>
                    <span className="text-gray-500 text-xs">
                      {pct >= 100 ? '✓ Semana completa' : restante.toLocaleString() + ' UA por programar'}
                    </span>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* Unidades planificadas (zonas) — clic para seleccionar/fusionar; arrastra a un día */}
        {unidadesPool.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-6">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
              <p className="text-gray-400 text-sm font-medium">Unidades planificadas esta semana — arrastra a un día</p>
              {seleccion.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs">{seleccion.length} sel.</span>
                  <button onClick={fusionarSeleccion} disabled={!puedeFusionar}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    title={puedeFusionar ? 'Fusionar en una sesión compleja' : 'Selecciona 2+ zonas de la misma disciplina'}>
                    🔗 Fusionar ({seleccion.length})
                  </button>
                  <button onClick={marcarSeleccionHechas} className="text-xs text-gray-400 hover:text-orange-400 px-2 py-1.5 transition" title="Quitar del pool sin crear sesión">✓ Hechas</button>
                  <button onClick={() => setSeleccion([])} className="text-xs text-gray-500 hover:text-white px-1 transition">✕</button>
                </div>
              )}
            </div>
            <p className="text-gray-600 text-xs mb-3">Haz clic en varias zonas de la <span className="text-gray-400">misma disciplina</span> y pulsa Fusionar para crear una sesión compleja. Arrastra una unidad a un día para programarla.</p>
            <div className="flex flex-wrap gap-2 items-start">
              {unidadesPool.map(u => {
                const disc = u.chips[0].disciplina

                // Unidad suelta (una sola zona) — clic selecciona, arrastre coloca
                if (u.chips.length === 1) {
                  const chip = u.chips[0]
                  const c = cargaZona(chip.zona)
                  const sel = seleccion.includes(chip.id)
                  return (
                    <div key={chip.id}
                      draggable
                      onDragStart={e => { setDraggingChip(chip.id); e.dataTransfer.setData('text/plain', 'chip:' + chip.id) }}
                      onDragEnd={() => setDraggingChip(null)}
                      onClick={() => toggleSeleccion(chip.id)}
                      className="cursor-pointer flex flex-col items-center justify-center rounded-lg border px-3 py-2 select-none transition"
                      style={{ backgroundColor: c.color + '20', borderColor: sel ? '#fb923c' : c.color, opacity: draggingChip === chip.id ? 0.4 : 1, boxShadow: sel ? '0 0 0 2px #fb923c' : undefined }}
                      title={c.nombre + ' · clic para seleccionar · arrástrala a un día'}>
                      <span className="font-bold text-sm" style={{ color: c.color }}>{chip.zona}</span>
                      <span className="text-xs text-gray-400">{DISC_CORTO[chip.disciplina] || chip.disciplina}</span>
                    </div>
                  )
                }

                // Unidad fusionada (sesión compleja)
                const dragId = u.chips[0].id
                return (
                  <div key={u.grupo!}
                    draggable
                    onDragStart={e => { setDraggingChip(dragId); e.dataTransfer.setData('text/plain', 'chip:' + dragId) }}
                    onDragEnd={() => setDraggingChip(null)}
                    className="cursor-grab active:cursor-grabbing relative flex flex-col rounded-lg border-2 border-dashed p-2 select-none"
                    style={{ borderColor: '#f97316', backgroundColor: '#f9731612', opacity: draggingChip === dragId ? 0.4 : 1 }}
                    title="Sesión compleja · arrástrala a un día">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="font-bold text-orange-400 uppercase tracking-wide" style={{ fontSize: 10 }}>Compleja · {DISC_CORTO[disc] || disc}</span>
                      <button onClick={e => { e.stopPropagation(); separar(u.grupo!) }}
                        className="text-gray-500 hover:text-red-400 leading-none" style={{ fontSize: 13 }} title="Separar de nuevo">⊗</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {u.chips.map(ch => {
                        const c = cargaZona(ch.zona)
                        return (
                          <span key={ch.id} className="rounded px-2 py-1 font-bold border" style={{ fontSize: 11, color: c.color, borderColor: c.color, backgroundColor: c.color + '20' }}>{ch.zona}</span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Grid 7 dias */}
        <div className="grid grid-cols-7 gap-3">
          {dias.map(({ fecha: fechaDia, dia, diaCorto, dayNum }) => {
            const sesiones_dia = sesiones.filter(s => s.fecha_sesion === fechaDia)
            const esHoy = fechaDia === hoy
            return (
              <div key={fechaDia}
                onDragOver={e => { e.preventDefault() }}
                onDragEnter={e => { e.preventDefault(); setDragOverDia(fechaDia) }}
                onDragLeave={() => setDragOverDia(d => d === fechaDia ? null : d)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOverDia(null)
                  const raw = e.dataTransfer.getData('text/plain')
                  if (raw.startsWith('sesion:')) { moverSesion(Number(raw.slice(7)), fechaDia); return }
                  const chipId = raw.startsWith('chip:') ? raw.slice(5) : raw
                  const chip = sesZonasAll.find(z => z.id === chipId)
                  if (!chip) return
                  const unidad = chip.grupo ? sesZonasAll.filter(z => z.grupo === chip.grupo && z.semana === weekIndex && !z.hecho) : [chip]
                  crearSesionDesdeUnidad(unidad, fechaDia)
                }}
                className={'rounded-2xl border flex flex-col overflow-hidden transition ' +
                (dragOverDia === fechaDia ? 'border-orange-400 ring-2 ring-orange-400/40' : esHoy ? 'border-orange-500' : 'border-gray-800')}>
                {/* Header dia */}
                <div className={'px-3 py-2.5 border-b ' + (esHoy ? 'bg-orange-500/20 border-orange-500/30' : 'bg-gray-900 border-gray-800')}>
                  <p className={'text-xs font-medium ' + (esHoy ? 'text-orange-400' : 'text-gray-400')}>{diaCorto}</p>
                  <p className={'text-lg font-bold ' + (esHoy ? 'text-orange-300' : 'text-white')}>{dayNum}</p>
                </div>

                {/* Sesiones del dia */}
                <div className="flex-1 p-2 bg-gray-900 flex flex-col gap-1.5 min-h-48">
                  {sesiones_dia.map(s => (
                    <div key={s.id} className="group relative"
                      draggable
                      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', 'sesion:' + s.id) }}>
                      <button
                        onClick={() => router.push('/sesion/' + s.id)}
                        className={'w-full text-left rounded-xl p-2.5 transition hover:opacity-90 cursor-grab active:cursor-grabbing ' + (COLOR_DISC[s.disciplina] || 'bg-gray-700 text-gray-300')}>
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="text-xs font-bold truncate">
                            {s.disciplina === 'Brick' ? '🔀 Brick' : s.disciplina}
                            {s.origen === 'deportista' && <span className="ml-1" title="Añadida por el atleta">🙋</span>}
                          </p>
                          {s._zonas?.length > 0 && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-black/30 flex-shrink-0">
                              {/* En un brick «compleja» no dice nada: lo que importa es cuántos esfuerzos encadena. */}
                              {s.disciplina === 'Brick' ? s._bloques.length + ' bloques' : (s._zonas.length > 1 ? 'Compleja' : 'Simple')}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          {s._bloques?.length > 0
                            ? s._bloques.map((b: any, i: number) => {
                                const col = cargaZona(b.zona).color
                                return (
                                  <span key={i} className="flex items-center gap-1">
                                    {/* La flecha marca la transición: es lo que convierte dos bloques en un brick. */}
                                    {i > 0 && s.disciplina === 'Brick' && <span className="text-[9px] opacity-50">→</span>}
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none" style={{ background: col, color: txtSobre(col) }}>
                                      {s.disciplina === 'Brick' && EMOJI_DISC[b.disciplina] ? EMOJI_DISC[b.disciplina] + ' ' : ''}{b.zona}
                                    </span>
                                  </span>
                                )
                              })
                            : <span className="text-[9px] font-medium px-1.5 py-0.5 rounded leading-none bg-white/10 text-white/50">sin zona</span>}
                        </div>
                        <p className="text-[10px] opacity-70 mt-1.5">{s.duracion_minutos ? s.duracion_minutos + 'min' : '—'} · RPE {s.rpe_estimado || '—'}</p>
                        {s.estado === 'Realizada' && <p className="text-[10px] opacity-60 mt-0.5">✓ Realizada</p>}
                      </button>
                      <button
                        onClick={() => borrarSesion(s.id)}
                        className="absolute top-1 right-1 text-white/0 group-hover:text-white/60 hover:text-white transition text-sm leading-none">
                        x
                      </button>
                    </div>
                  ))}

                  {/* Boton añadir */}
                  <button
                    onClick={() => setModal(fechaDia)}
                    className="w-full mt-auto rounded-xl border border-dashed border-gray-700 hover:border-orange-500/50 hover:bg-orange-500/5 py-2.5 text-gray-600 hover:text-orange-400 text-xs transition text-center">
                    + Sesion
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Resumen semana */}
        {sesiones.length > 0 && (
          <div className="mt-6 bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-bold text-sm mb-3 text-gray-300">Resumen de la semana</h3>
            <div className="flex gap-4 flex-wrap">
              <div>
                <p className="text-2xl font-bold text-white">{sesiones.length}</p>
                <p className="text-gray-500 text-xs">sesiones</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{sesiones.reduce((a, s) => a + (s.duracion_minutos || 0), 0)}min</p>
                <p className="text-gray-500 text-xs">volumen total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{sesiones.filter(s => s.estado === 'Realizada').length}/{sesiones.length}</p>
                <p className="text-gray-500 text-xs">realizadas</p>
              </div>
              {['Natacion','Natación','Ciclismo','Carrera','Fuerza'].map(d => {
                const n = sesiones.filter(s => s.disciplina === d || s.disciplina === d).length
                if (!n) return null
                return (
                  <div key={d} className="flex items-center gap-1.5">
                    <div className={'w-2 h-2 rounded-full ' +
                      (d.includes('Nat') ? 'bg-blue-400' : d === 'Ciclismo' ? 'bg-yellow-400' : d === 'Carrera' ? 'bg-green-400' : 'bg-red-400')} />
                    <span className="text-gray-400 text-xs">{d}: <span className="text-white font-medium">{n}</span></span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva sesion */}
      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="font-bold text-xl">Nueva sesion</h3>
                <p className="text-gray-400 text-sm mt-0.5">{modal}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">x</button>
            </div>
            <div className="flex flex-col gap-4">
              <select value={disc} onChange={e => setDisc(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" required>
                <option value="">Disciplina</option>
                <option>Natacion</option><option>Ciclismo</option><option>Carrera</option><option>Fuerza</option><option>Brick</option>
              </select>
              {disc === 'Brick' && <ConstructorBrick valor={brick} onChange={setBrick} depId={Number(id)} />}
              {disc !== 'Brick' && <input type="number" placeholder="Duracion en minutos (opcional)" value={duracion} onChange={e => setDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />}
              <div>
                <label className="text-gray-400 text-sm mb-1.5 block">RPE estimado (1-10){disc === 'Brick' && <span className="text-gray-600"> — si lo dejas vacío se calcula de las zonas</span>}</label>
                <input type="number" min="1" max="10" value={rpe} onChange={e => setRpe(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 w-full" />
              </div>
              <textarea placeholder="Notas para el atleta (opcional)" value={notas} onChange={e => setNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" rows={2} />
              <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                <input type="checkbox" checked={cronometro} onChange={e => setCronometro(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                <label className="text-white text-sm">Activar cronometro</label>
              </div>
              <button onClick={() => crearSesion(modal)} disabled={guardando || !disc}
                className="bg-orange-500 hover:bg-orange-600 py-3 rounded-xl font-bold text-white transition disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Crear sesion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
