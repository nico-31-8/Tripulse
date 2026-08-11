'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ordenarTareasQuery, moverItem, persistirOrden } from '@/lib/tareas-orden'
import { ZONAS_RESISTENCIA, ZONAS_FUERZA, FACTORES_RESISTENCIA, ZONAS_CLASICAS, zonaResistencia, prescripcion, type ZonaResistencia } from '@/lib/zonas'
import { tablaMedicion, valorCanonico, detectarMedicion, guardarMedicion, mmssASegundos, type UnidadMedicion } from '@/lib/medicion'
import { filtrarDrills } from '@/lib/tecnica'

// Referencia de una zona del sistema Zonas 2 (misma forma que getReferencia)
function refZona2(z: ZonaResistencia, disciplina: string, tests: any, fcMax: number) {
  const fc = (z.fcMin || z.fcMax) && fcMax > 0
    ? `${z.fcMin ? Math.round(fcMax * z.fcMin / 100) : ''}${z.fcMin && z.fcMax ? '–' : ''}${z.fcMax ? Math.round(fcMax * z.fcMax / 100) : ''} ppm`
    : null
  const rpe = 'RPE ' + z.rpeMin + (z.rpeMax !== z.rpeMin ? '–' + z.rpeMax : '')
  return { fc, rpe, porcentaje: z.sigla + ' · ' + z.factor, ritmo: prescripcion(z, disciplina, tests) }
}

const ZONAS = [
  { num: 1, nombre: 'Z1 Recuperación',   pct: [0, 75],    rpe: [2,3] },
  { num: 2, nombre: 'Z2 Aeróbica',       pct: [75, 85],   rpe: [4,5] },
  { num: 3, nombre: 'Z3 Tempo',          pct: [86, 93],   rpe: [6,7] },
  { num: 4, nombre: 'Z4 Umbral',         pct: [94, 100],  rpe: [7,8] },
  { num: 5, nombre: 'Z5 VO2máx',         pct: [101, 110], rpe: [8,9] },
  { num: 6, nombre: 'Z6 Anaeróbica',     pct: [0, 0],     rpe: [9,10] },
  { num: 7, nombre: 'Z7 Neuromuscular',  pct: [0, 0],     rpe: [10,10] },
]

function segAMmss(seg: number): string {
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return s > 0 ? min + ':' + String(s).padStart(2, '0') : String(min)
}

// mmssASeg vivía aquí duplicando letra por letra a mmssASegundos de lib/medicion.
// Dos funciones para lo mismo es como empiezan las divergencias: se arregla una y
// la otra se queda contando distinto.

// Texto corto de una duración: «45 s» o «2:30 min». segAMmss devuelve solo los
// minutos cuando no hay segundos sueltos («2»), que sin unidad no se entiende.
function duracionTexto(seg: number): string {
  return seg < 60 ? seg + ' s' : segAMmss(seg) + ' min'
}

// ------------------------------------------------------------
// Cómo se controla el esfuerzo de una serie de fuerza
// ------------------------------------------------------------
// Los tres primeros miden lo cerca del fallo que se queda la serie, de más
// subjetivo a más objetivo. El cuarto es otra cosa: cuánto pesa la barra
// respecto a su máximo. Se ofrecen juntos porque es donde el entrenador espera
// encontrarlos, pero no significan lo mismo.
export type ControlTipo = 'rir' | 'rpe' | 'vel' | 'pct1rm'

export const CONTROLES: { id: ControlTipo; corto: string; ph: string; ayuda: string }[] = [
  { id: 'rir',    corto: 'RIR', ph: '0-2',  ayuda: 'Repeticiones en reserva: cuántas podría hacer aún' },
  { id: 'rpe',    corto: 'RPE', ph: '7-8',  ayuda: 'Esfuerzo percibido de 1 a 10' },
  { id: 'vel',    corto: '%vel', ph: '20',  ayuda: 'Pérdida de velocidad (VBT): corta la serie al perder ese % — necesita encoder' },
  { id: 'pct1rm', corto: '%1RM', ph: '75',  ayuda: 'Porcentaje de su 1RM en ese ejercicio' },
]

export const controlDe = (t: ControlTipo) => CONTROLES.find(c => c.id === t) || CONTROLES[0]
const siguienteControl = (t: ControlTipo): ControlTipo =>
  CONTROLES[(CONTROLES.findIndex(c => c.id === t) + 1) % CONTROLES.length].id

function mostrarValorGuardado(t: any): string {
  if (t.p_duracion?.[0]?.tiempo_planeado) return segAMmss(t.p_duracion[0].tiempo_planeado) + ' min'
  if (t.p_distancia?.[0]?.metros_planeados) {
    const m = t.p_distancia[0].metros_planeados
    return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m'
  }
  if (t.p_repeticiones?.[0]?.repeticiones_planteadas) return t.p_repeticiones[0].repeticiones_planteadas + ' reps'
  return '—'
}

function mostrarTotal(t: any): string {
  const series = t.series || 1
  if (t.p_duracion?.[0]?.tiempo_planeado) {
    const totalSeg = t.p_duracion[0].tiempo_planeado * series
    const min = Math.floor(totalSeg / 60)
    const seg = totalSeg % 60
    return seg > 0 ? min + ':' + String(seg).padStart(2, '0') + ' min' : min + ' min'
  }
  if (t.p_distancia?.[0]?.metros_planeados) {
    const total = t.p_distancia[0].metros_planeados * series
    return total >= 1000 ? (total / 1000).toFixed(1) + ' km' : total + ' m'
  }
  if (t.p_repeticiones?.[0]?.repeticiones_planteadas) return (t.p_repeticiones[0].repeticiones_planteadas * series) + ' reps'
  return '—'
}

// La tabla de %FTP/%VAM/%CSS del sistema clásico vive en lib/zonas.ts
// (ZONAS_CLASICAS). Aquí había una copia con la columna de VAM desplazada 5–10
// puntos respecto a la de la pantalla de ejecución: el mismo Z4 daba dos ritmos
// distintos según por dónde entrases.
function getReferencia(zona: any, disciplina: string, tests: any, fcMax: number) {
  if (!zona) return null
  const ref = ZONAS_CLASICAS[zona.num]
  const fcUmbral = fcMax ? fcMax * 0.85 : 0
  const fcMin = fcUmbral > 0 && zona.pct[0] > 0 ? Math.round(fcUmbral * zona.pct[0] / 100) : null
  const fcMax2 = fcUmbral > 0 && zona.pct[1] > 0 ? Math.round(fcUmbral * zona.pct[1] / 100) : null
  const fc = fcMin && fcMax2 ? fcMin + '–' + fcMax2 + ' ppm' : null
  const rpe = 'RPE ' + zona.rpe[0] + '–' + zona.rpe[1]
  let ritmo = null
  let porcentaje = null

  if (disciplina === 'Ciclismo') {
    porcentaje = ref.ftpPct[0] + '–' + ref.ftpPct[1] + '% FTP'
    if (tests.ftp) {
      const wMin = Math.round(tests.ftp * ref.ftpPct[0] / 100)
      const wMax = Math.round(tests.ftp * ref.ftpPct[1] / 100)
      ritmo = wMin + '–' + wMax + ' W'
    }
  } else if (disciplina === 'Carrera') {
    porcentaje = ref.vamPct[0] + '–' + ref.vamPct[1] + '% VAM'
    if (tests.vam) {
      const velMin = tests.vam * ref.vamPct[0] / 100
      const velMax = tests.vam * ref.vamPct[1] / 100
      const pMin = velMin > 0 ? Math.floor(60/velMin) + ':' + String(Math.round((60/velMin % 1)*60)).padStart(2,'0') : null
      const pMax = velMax > 0 ? Math.floor(60/velMax) + ':' + String(Math.round((60/velMax % 1)*60)).padStart(2,'0') : null
      if (pMin && pMax) ritmo = pMin + '–' + pMax + ' /km'
    }
  } else if (disciplina === 'Natacion' || disciplina === 'Natación') {
    porcentaje = ref.cssPct[0] + '–' + ref.cssPct[1] + '% CSS'
    if (tests.css) {
      const velMin = tests.css * ref.cssPct[0] / 100
      const velMax = tests.css * ref.cssPct[1] / 100
      const p100Min = velMin > 0 ? Math.round(100/velMin) : null
      const p100Max = velMax > 0 ? Math.round(100/velMax) : null
      if (p100Min && p100Max) ritmo = p100Min + '–' + p100Max + ' s/100m'
    }
  }

  return { fc, rpe, porcentaje, ritmo }
}

// La técnica NO es una zona, pero se elige como si lo fuera: está en el mismo
// desplegable porque es donde va la mano. Por debajo la tarea guarda AER, así que
// carga, SICAT, calendario y mesociclo no se enteran de nada y no cambia una línea
// de todo eso. Ver supabase/tecnica-en-resistencia.sql.
export const VALOR_TECNICA = '__tecnica'
export const ZONA_DE_TECNICA = 'AER'

interface FilaResistencia {
  orden: number
  zona: string
  disciplina: string
  series: string
  descanso: string
  tipoMedicion: string
  valorMedicion: string
  intensidadPersonalizada: string
  comentario: string
  // Solo del formulario. Lo que queda guardado es tecnica_id: si tiene valor, la
  // tarea es trabajo técnico. Un booleano aparte en la BD sería una segunda verdad
  // sobre lo mismo, y ahí es donde se pudren los datos.
  esTecnica: boolean
  tecnicaId: string
  guardado?: boolean
}

interface FilaFuerza {
  orden: number
  grupoMuscularSel: string
  ejercicioSelId: string
  tipoSerie: string
  series: string
  // Qué se le pide al atleta en cada serie: repeticiones o tiempo. Antes esto
  // dependía del tipo de serie (solo «Isométrico» iba en segundos), pero hay
  // muchos ejercicios de tiempo que no son isométricos: paseos del granjero,
  // remo, saltos a la comba, un bloque de core. Ahora se elige por fila.
  medida: 'reps' | 'tiempo'
  // Con qué se controla el esfuerzo de la serie. El RIR es solo una de las
  // formas: según el contexto se usa RPE, el % de pérdida de velocidad (VBT) o
  // el % del 1RM. Antes solo cabía RIR, y encima como texto dentro de las notas.
  controlTipo: ControlTipo
  repsFuerza: string
  kgFuerza: string
  rir: string
  descanso: string
  comentario: string
  grupoMuscular2: string
  ejercicioSelId2: string
  series2: string
  repsFuerza2: string
  kgFuerza2: string
  escalonDrop: string
  zonaFuerzaTarea: string
  guardado?: boolean
}

export default function TareasTabla({ sesionId, deportistaId, disciplinaSesion, esDeportista, modoFuerza = 'simple', zonaFuerza = '', modoResistencia = 'simple', zonaResistencia: zonaResSesion = '', onTareasCambian }: {
  sesionId: number
  deportistaId: number
  disciplinaSesion: string
  esDeportista?: boolean
  modoFuerza?: string
  zonaFuerza?: string
  modoResistencia?: string
  zonaResistencia?: string
  // Esta tabla escribe las tareas en la BD por su cuenta. Sin avisar al padre, su
  // lista de tareas se quedaba congelada desde que cargó la página: la gráfica de
  // carga y "Guardar como plantilla" se perdían todo lo añadido aquí.
  onTareasCambian?: () => void
}) {
  const esFuerza = disciplinaSesion === 'Fuerza'
  const [filasR, setFilasR] = useState<FilaResistencia[]>([])
  const [filasF, setFilasF] = useState<FilaFuerza[]>([])
  const [tests, setTests] = useState<any>({})
  const [fcMax, setFcMax] = useState(0)
  const [sistema, setSistema] = useState(1)
  const [loading, setLoading] = useState(false)
  const [tareasGuardadas, setTareasGuardadas] = useState<any[]>([])
  const [tareaEditando, setTareaEditando] = useState<any>(null)
  const [editZona, setEditZona] = useState('')
  const [editSeries, setEditSeries] = useState('')
  const [editDescanso, setEditDescanso] = useState('')
  const [editComentario, setEditComentario] = useState('')
  const [editMedTipo, setEditMedTipo] = useState<UnidadMedicion>('')
  const [editMedValor, setEditMedValor] = useState('')
  const [editTecnicaId, setEditTecnicaId] = useState('')
  const [ejerciciosBiblioteca, setEjerciciosBiblioteca] = useState<any[]>([])
  // 1RM más reciente por ejercicio (clave en minúsculas), para el fantasma del %1RM.
  const [rmPorEjercicio, setRmPorEjercicio] = useState<Record<string, { rm: number; fecha: string }>>({})
  // Arrastrar filas para reordenarlas (mismo criterio que la vista Formulario).
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [sobreIdx, setSobreIdx] = useState<number | null>(null)

  const reordenarTareas = async (from: number, to: number) => {
    const nuevo = moverItem(tareasGuardadas, from, to)
    if (nuevo === tareasGuardadas) return
    setTareasGuardadas(nuevo)
    await persistirOrden(supabase, nuevo)
    onTareasCambian?.()
  }

  useEffect(() => { cargarDatos() }, [deportistaId, sesionId])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('fc_maxima, sistema_zonas').eq('id', deportistaId).single()
    setFcMax(dep?.fc_maxima || 0)
    setSistema(dep?.sistema_zonas || 1)
    const { data: t1 } = await supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', deportistaId).order('fecha', { ascending: false }).limit(1)
    const { data: t2 } = await supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', deportistaId).order('fecha', { ascending: false }).limit(1)
    const { data: t3 } = await supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', deportistaId).order('fecha', { ascending: false }).limit(1)
    setTests({ vam: t1?.[0]?.vam, css: t2?.[0]?.css, ftp: t3?.[0]?.ftp, fuerza: [] })
    const { data: ejBib } = await supabase.from('ejercicios_biblioteca').select('*').order('grupo_muscular').order('nombre')
    setEjerciciosBiblioteca(ejBib || [])
    // 1RM por ejercicio, para poder enseñar el kilo cuando se prescribe en %.
    // Se queda solo con el más reciente de cada uno: la lista viene ordenada por
    // fecha descendente, así que el primero que aparece es el bueno.
    const { data: tf } = await supabase.from('test_fuerza')
      .select('ejercicio, rm_estimado, fecha').eq('id_deportista', deportistaId)
      .not('rm_estimado', 'is', null).order('fecha', { ascending: false })
    const porEjercicio: Record<string, { rm: number; fecha: string }> = {}
    for (const t of tf || []) {
      const clave = String(t.ejercicio || '').trim().toLowerCase()
      if (clave && !porEjercicio[clave]) porEjercicio[clave] = { rm: Number(t.rm_estimado), fecha: t.fecha }
    }
    setRmPorEjercicio(porEjercicio)
    const { data: tar, error: errTar } = await ordenarTareasQuery(
      supabase.from('tarea').select('*, p_distancia(*), p_duracion(*), p_repeticiones(*)').eq('id_sesion', sesionId))
    if (tar && tar.length > 0) {
      const tareaIds = tar.map((t: any) => t.id)
      const { data: ejs } = await supabase.from('ejercicios').select('*').in('id_tarea', tareaIds)
      const tarConEjs = tar.map((t: any) => ({
        ...t,
        ejercicios: ejs?.filter((e: any) => e.id_tarea === t.id) || []
      }))
      setTareasGuardadas(tarConEjs)
    } else {
      setTareasGuardadas([])
    }
  }

  const borrarTarea = async (tareaId: number) => {
    if (!confirm('Borrar esta tarea?')) return
    await supabase.from('p_distancia').delete().eq('id_tarea', tareaId)
    await supabase.from('p_duracion').delete().eq('id_tarea', tareaId)
    await supabase.from('p_repeticiones').delete().eq('id_tarea', tareaId)
    await supabase.from('ejercicios').delete().eq('id_tarea', tareaId)
    await supabase.from('tarea').delete().eq('id', tareaId)
    setTareasGuardadas(prev => prev.filter(t => t.id !== tareaId))
    onTareasCambian?.()
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
    setEditTecnicaId(t.tecnica_id ? String(t.tecnica_id) : '')
  }

  const guardarEditarTarea = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await supabase.from('tarea').update({
      zona_entrenamiento: editZona || null,
      series: editSeries ? Number(editSeries) : null,
      descanso_segundos: editDescanso ? Number(editDescanso) : null,
      comentario: editComentario || null,
      // Solo en resistencia. En una sesión de fuerza esto siempre va vacío, y
      // escribirlo a null es lo correcto: una tarea de fuerza no es trabajo técnico.
      tecnica_id: esFuerza ? null : (editTecnicaId ? Number(editTecnicaId) : null),
    }).eq('id', tareaEditando.id)
    if (!esFuerza) await guardarMedicion(supabase, tareaEditando, editMedTipo, editMedValor)
    setTareaEditando(null)
    setLoading(false)
    await cargarDatos()   // la medición toca filas anidadas: releer es lo fiable
    onTareasCambian?.()
  }

  // Referencia de una zona por su código: sistema 2 (siglas) o clásico ('Zn')
  const getRef = (codigo: string | null | undefined, disciplina: string) => {
    if (!codigo) return null
    const z2 = zonaResistencia(codigo)
    if (z2) return refZona2(z2, disciplina, tests, fcMax)
    const zonaObj = ZONAS.find(z => 'Z' + z.num === codigo)
    return getReferencia(zonaObj, disciplina, tests, fcMax)
  }

  const nuevaFilaR = (): FilaResistencia => ({
    orden: filasR.length + tareasGuardadas.length + 1,
    // En un brick, 'Brick' NO es un deporte: cada bloque tiene el suyo, así que se
    // deja vacío para que se elija (si no, el volumen del bloque no iría a ningún
    // deporte real — ver lib/atribucion).
    // Si la sesión es de resistencia "simple", la tarea nace ya con la zona de la
    // sesión puesta (se puede cambiar a mano).
    zona: modoResistencia === 'simple' ? (zonaResSesion || '') : '',
    disciplina: disciplinaSesion === 'Brick' ? '' : (disciplinaSesion || ''),
    series: '', descanso: '', tipoMedicion: '', valorMedicion: '',
    intensidadPersonalizada: '', comentario: '',
    esTecnica: false, tecnicaId: '',
  })

  const nuevaFilaF = (): FilaFuerza => ({
    orden: filasF.length + tareasGuardadas.length + 1,
    grupoMuscularSel: '', ejercicioSelId: '',
    tipoSerie: 'Normal',
    medida: 'reps',
    controlTipo: 'rir',
    series: '', repsFuerza: '', kgFuerza: '', rir: '', descanso: '', comentario: '',
    grupoMuscular2: '', ejercicioSelId2: '', series2: '', repsFuerza2: '', kgFuerza2: '', escalonDrop: '',
    zonaFuerzaTarea: '',
  })

  // Cambian varias casillas de una fila a la vez. Antes esto se hacía llamando dos
  // veces seguidas al de una sola clave, y solo funcionaba porque mutaba el objeto
  // en su sitio: la segunda llamada copiaba el array otra vez desde el mismo render
  // y habría borrado el primer cambio si no fuera por la mutación. Funcionaba por
  // accidente. Con la forma funcional no hay que confiar en eso.
  const parcheR = (i: number, cambios: Partial<FilaResistencia>) =>
    setFilasR(prev => prev.map((f, idx) => idx === i ? { ...f, ...cambios } : f))
  const parcheF = (i: number, cambios: Partial<FilaFuerza>) =>
    setFilasF(prev => prev.map((f, idx) => idx === i ? { ...f, ...cambios } : f))

  const updateR = (i: number, key: string, val: any) => parcheR(i, { [key]: val } as any)
  const updateF = (i: number, key: string, val: any) => parcheF(i, { [key]: val } as any)

  const guardarFilaR = async (i: number) => {
    const f = filasR[i]
    setLoading(true)
    try {
      const { data: tarea, error: errTarea } = await supabase.from('tarea').insert({
        id_sesion: sesionId, zona_entrenamiento: f.zona || null,
        disciplina: f.disciplina, series: f.series ? Number(f.series) : null,
        descanso_segundos: f.descanso ? mmssASegundos(f.descanso) : null,
        comentario: f.comentario || null,
        // La zona que se guarda es AER, no «técnica»: eso es lo que hace que el
        // trabajo técnico cuente como el volumen suave que realmente es.
        tecnica_id: f.tecnicaId ? Number(f.tecnicaId) : null,
        // Sin esto las tareas creadas aquí quedaban con orden nulo → las dos vistas
        // se ordenaban distinto (ver lib/tareas-orden).
        orden: tareasGuardadas.length + i + 1,
      }).select().single()
      if (errTarea) { alert('Error al guardar tarea: ' + errTarea.message); setLoading(false); return }
      if (tarea) {
        const _ref = getRef(f.zona, f.disciplina)
        const _tabla = tablaMedicion(f.tipoMedicion as UnidadMedicion)
        const _valor = valorCanonico(f.tipoMedicion as UnidadMedicion, f.valorMedicion)
        if (_tabla === 'p_distancia') { const { data: pd } = await supabase.from('p_distancia').insert({ id_tarea: tarea.id, metros_planeados: _valor }).select().single(); if (pd && _ref?.ritmo) { await supabase.from('p_distancia').update({ ritmo_objetivo: _ref.ritmo }).eq('id', pd.id) } }
        else if (_tabla === 'p_duracion') await supabase.from('p_duracion').insert({ id_tarea: tarea.id, tiempo_planeado: _valor })
        else if (_tabla === 'p_repeticiones') await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: _valor })
      }
      await cargarDatos()
      setFilasR(prev => prev.filter((_, idx) => idx !== i))
      onTareasCambian?.()
    } catch (e: any) {
      alert('Error inesperado: ' + e.message)
    }
    setLoading(false)
  }

  const guardarFilaF = async (i: number) => {
    const f = filasF[i]
    if (!f.ejercicioSelId) return
    setLoading(true)
    try {
    const ejBib = ejerciciosBiblioteca.find(e => e.id === Number(f.ejercicioSelId))
    // `medida` manda: antes esto lo decidía el tipo de serie, así que un paseo del
    // granjero de 40 s había que declararlo «Isométrico» para que se guardara como
    // tiempo, mintiendo sobre el tipo de serie para arreglar la unidad.
    const esTiempo = f.medida === 'tiempo'
    // Acepta «45» y «1:30»: mmssASegundos ya distingue por los dos puntos.
    const segundos = esTiempo ? mmssASegundos(f.repsFuerza) : 0
    const zonaF = (modoFuerza === 'compleja' ? f.zonaFuerzaTarea : zonaFuerza) || null
    const { data: tarea, error: errTarea } = await supabase.from('tarea').insert({
      id_sesion: sesionId, disciplina: 'Fuerza',
      zona_entrenamiento: zonaF,
      series: f.series ? Number(f.series) : null,
      descanso_segundos: f.descanso ? mmssASegundos(f.descanso) : null,
      comentario: f.comentario || null,
    }).select().single()
    if (errTarea) { alert('Error al guardar ejercicio: ' + errTarea.message); setLoading(false); return }
    if (tarea && ejBib) {
      const ejBib2 = f.ejercicioSelId2 ? ejerciciosBiblioteca.find((e: any) => e.id === Number(f.ejercicioSelId2)) : null
      // Si hay ejercicio 2, añadirlo como nota en notas_ejecucion
      const notasEj2 = ejBib2 ? ' | EJ2: ' + ejBib2.nombre + (f.series2 ? ' ' + f.series2 + 'x' : '') + (f.repsFuerza2 ? f.repsFuerza2 : '') + (f.kgFuerza2 ? ' @' + f.kgFuerza2 + 'kg' : '') : ''
      await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre: ejBib.nombre,
        grupo_muscular: ejBib.grupo_muscular,
        series: f.series ? Number(f.series) : null,
        repeticiones: (!esTiempo && f.repsFuerza) ? Number(f.repsFuerza) : null,
        intensidad: f.kgFuerza ? Number(f.kgFuerza) : null,
        descanso_segundos: f.descanso ? mmssASegundos(f.descanso) : null,
        // El control ya NO va concatenado en las notas: tiene sus columnas. Antes
        // se escribía «RIR: 2» aquí dentro y no había forma de compararlo con lo
        // que el atleta registraba, que sí era un número.
        control_tipo: f.rir ? f.controlTipo : null,
        control_valor: f.rir || null,
        notas_ejecucion: [
          esTiempo && segundos > 0 ? duracionTexto(segundos) + (f.tipoSerie === 'Isométrico' ? ' isométrico' : ' por serie') : '',
          f.comentario || '',
        ].filter(Boolean).join(' · ') + notasEj2,
        tipo_serie: f.tipoSerie || 'Normal',
        ejercicio_encadenado_nombre: ejBib2?.nombre || null,
        ejercicio_encadenado_id: ejBib2?.id || null,
        escalones_drop: f.escalonDrop || null,
        url_video: ejBib.url_video || null,
      })
      // Una tarea tiene UNA medición: o segundos o repeticiones, nunca las dos.
      if (esTiempo) {
        if (segundos > 0) await supabase.from('p_duracion').insert({ id_tarea: tarea.id, tiempo_planeado: segundos })
      } else if (f.repsFuerza) {
        await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: Number(f.repsFuerza) })
      }
    }
    await cargarDatos()
    setFilasF(prev => prev.filter((_, idx) => idx !== i))
    onTareasCambian?.()
    } catch (e: any) {
      alert('Error inesperado: ' + e.message)
    }
    setLoading(false)
  }

  // Los campos suben de 12px/24px de alto a 14px/36px: a la medida vieja había que
  // apuntar para acertar y costaba leer de un vistazo, con media pantalla vacía a
  // los lados. Las dos tablas —fuerza y resistencia— usan ya la misma medida.
  // OJO con el `w-full`: cualquier campo que lleve su propio ancho (w-[92px],
  // basis-[42%]...) NO puede heredarlo, porque las dos reglas se pisan, gana
  // w-full y el campo se sale de su celda. Con `flex-none` encima ni siquiera
  // puede encoger: se mete literalmente sobre el campo de al lado.
  // Por eso el ancho vive aparte de la base. Misma regla para `flex-none`.
  const campoBase = "bg-gray-800 text-white text-sm rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-orange-500"
  const inputCls = campoBase + ' w-full'

  // Los campos DENTRO del bloque de prescripción. La base NO lleva flex: casi todos
  // van a ancho fijo (inputBloque), pero el último se estira, y si `flex-none`
  // viviera en la base las dos reglas volverían a pelearse.
  const campoBloque = "bg-gray-950/60 text-white text-sm rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-orange-500"
  const inputBloque = campoBloque + ' flex-none'

  // Los conmutadores del bloque: gris cuando están en su valor por defecto, naranja
  // cuando el entrenador ha elegido algo. Mismo lenguaje que el reps/seg de fuerza.
  const botonBloque = (activo: boolean) =>
    'flex-none px-2 py-1.5 rounded-md text-[11.5px] font-bold border transition outline-none ' +
    (activo
      ? 'bg-orange-500/20 border-orange-500/50 text-orange-300 hover:bg-orange-500/30'
      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600')

  const chipCls = 'text-[11px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 whitespace-nowrap'

  const nombreDeBiblioteca = (id: any) =>
    ejerciciosBiblioteca.find((e: any) => e.id === Number(id))?.nombre || '—'

  const drillsDe = (disciplina: string) => filtrarDrills(ejerciciosBiblioteca, disciplina)

  // Kilo sugerido cuando se prescribe en % del 1RM. Devuelve null si falta algo:
  // sin test de ese ejercicio no se enseña nada, que es lo acordado.
  // El «≈» no es adorno: rm_estimado sale de Epley sobre una serie submáxima, así
  // que esto es un porcentaje de una estimación. Redondear a 2,5 kg porque eso es
  // lo que se puede montar en una barra.
  const kgDesde1RM = (f: FilaFuerza): string | null => {
    if (f.controlTipo !== 'pct1rm') return null
    const pct = parseFloat(String(f.rir).replace(',', '.'))
    if (!pct || pct <= 0) return null
    const ej = ejerciciosBiblioteca.find(e => e.id === Number(f.ejercicioSelId))
    if (!ej) return null
    const dato = rmPorEjercicio[String(ej.nombre).trim().toLowerCase()]
    if (!dato?.rm) return null
    return '≈ ' + (Math.round(dato.rm * pct / 100 / 2.5) * 2.5) + ' kg'
  }

  return (
    <div>
      {/* TAREAS GUARDADAS */}
      {tareasGuardadas.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="text-left py-2 px-2 w-8">#</th>
                {esFuerza ? (
                  <>
                    <th className="text-left py-2 px-2">Ejercicio</th>
                    <th className="text-left py-2 px-2">Series</th>
                    <th className="text-left py-2 px-2">Reps</th>
                    <th className="text-left py-2 px-2">Kg</th>
                    <th className="text-left py-2 px-2">RIR</th>
                    <th className="text-left py-2 px-2">Descanso</th>
                    <th className="text-left py-2 px-2">Notas</th>
                    {!esDeportista && <th className="py-2 px-2 w-16"></th>}
                  </>
                ) : (
                  <>
                    <th className="text-left py-2 px-2">Zona</th>
                    <th className="text-left py-2 px-2">Disciplina</th>
                    <th className="text-left py-2 px-2">Series</th>
                    <th className="text-left py-2 px-2">Descanso</th>
                    <th className="text-left py-2 px-2">Medición</th>
                    <th className="text-left py-2 px-2">Total</th>
                    <th className="text-left py-2 px-2">Referencia / Intensidad</th>
                    <th className="text-left py-2 px-2">Notas</th>
                    {!esDeportista && <th className="py-2 px-2 w-16"></th>}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tareasGuardadas.map((t, i) => {
                const ref = getRef(t.zona_entrenamiento, t.disciplina)
                return (
                  <tr key={t.id}
                    draggable={!esDeportista}
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={e => { e.preventDefault(); if (sobreIdx !== i) setSobreIdx(i) }}
                    onDragEnd={() => { setDragIdx(null); setSobreIdx(null) }}
                    onDrop={e => { e.preventDefault(); if (dragIdx !== null) reordenarTareas(dragIdx, i); setDragIdx(null); setSobreIdx(null) }}
                    className={'border-b border-gray-800 hover:bg-gray-800 transition ' +
                      (dragIdx === i ? 'opacity-40 ' : '') +
                      (sobreIdx === i && dragIdx !== null && dragIdx !== i ? 'border-t-2 border-t-orange-500 ' : '')}>
                    <td className="py-2 px-2 text-orange-400 font-bold whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {!esDeportista && <span className="text-gray-500 hover:text-orange-400 text-xl leading-none cursor-grab active:cursor-grabbing select-none" title="Arrastra para reordenar">⠿</span>}
                        {i + 1}
                      </span>
                    </td>
                    {esFuerza ? (
                      <>
                        <td className="py-2 px-2 text-white">
                          {t.ejercicios?.[0] ? (
                            <div className="flex flex-col gap-0.5">
                              {t.ejercicios.map((ej: any) => (
                                <div key={ej.id} className="flex items-center gap-1.5">
                                  {ej.tipo_serie && ej.tipo_serie !== 'Normal' && <span className="text-xs bg-orange-900 text-orange-300 px-1.5 rounded">{ej.tipo_serie}</span>}
                                  <span className="text-sm">{ej.nombre}</span>
                                  {ej.ejercicio_encadenado_nombre && <span className="text-orange-400 text-xs">+ {ej.ejercicio_encadenado_nombre}</span>}
                                </div>
                              ))}
                            </div>
                          ) : t.comentario || '—'}
                        </td>
                        <td className="py-2 px-2 text-gray-300">{t.ejercicios?.[0]?.series || t.series || '—'}</td>
                        <td className="py-2 px-2 text-blue-400">{t.ejercicios?.[0]?.repeticiones ? t.ejercicios[0].repeticiones + ' reps' : mostrarValorGuardado(t)}</td>
                        <td className="py-2 px-2 text-yellow-400">{t.ejercicios?.[0]?.intensidad ? t.ejercicios[0].intensidad + ' kg' : '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.ejercicios?.[0]?.notas_ejecucion?.includes('RIR') ? t.ejercicios[0].notas_ejecucion.match(/RIR: (\d)/)?.[1] || '—' : '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.descanso_segundos ? segAMmss(t.descanso_segundos) : '—'}</td>
                        <td className="py-2 px-2 text-gray-500 text-xs">{t.notas_post || ''}</td>
                        {!esDeportista && (
                          <td className="py-2 px-2">
                            <div className="flex gap-1">
                              <button onClick={() => abrirEditarTarea(t)} className="text-gray-500 hover:text-orange-400 text-xs px-1.5 py-1 rounded transition">✏️</button>
                              <button onClick={() => borrarTarea(t.id)} className="text-gray-500 hover:text-red-400 text-xs px-1.5 py-1 rounded transition">🗑</button>
                            </div>
                          </td>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Guardada pone AER, pero lo que el entrenador mandó fue
                            técnica: se enseña lo que quiso decir, no lo que hizo falta
                            escribir para que la carga saliera bien. */}
                        <td className="py-2 px-2 text-white">
                          {t.tecnica_id ? (
                            <div className="flex flex-col">
                              <span className="text-orange-300">Técnica</span>
                              <span className="text-gray-400 text-xs">{nombreDeBiblioteca(t.tecnica_id)}</span>
                            </div>
                          ) : (t.zona_entrenamiento || '—')}
                        </td>
                        <td className="py-2 px-2 text-gray-300">{t.disciplina || '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.series || '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.descanso_segundos ? segAMmss(t.descanso_segundos) : '—'}</td>
                        <td className="py-2 px-2 text-blue-400 font-medium">{mostrarValorGuardado(t)}</td>
                        <td className="py-2 px-2 text-orange-400 font-medium">{mostrarTotal(t)}</td>
                        <td className="py-2 px-2 text-xs">
                          {ref?.porcentaje && <p className="text-orange-400">{ref.porcentaje}</p>}
                          {ref?.ritmo && <p className="text-blue-400">{ref.ritmo}</p>}
                          {ref?.fc && <p className="text-gray-400">{ref.fc}</p>}
                          {ref?.rpe && <p className="text-gray-500">{ref.rpe}</p>}
                          {!ref && <span className="text-gray-600">—</span>}
                        </td>
                        <td className="py-2 px-2 text-gray-400 text-xs">{t.comentario || '—'}</td>
                        {!esDeportista && (
                          <td className="py-2 px-2">
                            <div className="flex gap-1">
                              <button onClick={() => abrirEditarTarea(t)} className="text-gray-500 hover:text-orange-400 text-xs px-1.5 py-1 rounded transition">✏️</button>
                              <button onClick={() => borrarTarea(t.id)} className="text-gray-500 hover:text-red-400 text-xs px-1.5 py-1 rounded transition">🗑</button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TABLA RESISTENCIA — nuevas filas */}
      {filasR.length > 0 && !esFuerza && (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              {/* Mismo reparto que la tabla de fuerza: las casillas que forman la
                  prescripción van bajo UNA cabecera, porque juntas se leen como lo
                  escribe un entrenador — 4 × 1000 m @ 4:12–4:41 /km — y sueltas hay
                  que ir columna por columna para saber qué has mandado. */}
              <tr className="text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-700">
                <th className="text-left py-2 px-1.5 w-9">#</th>
                <th className="text-left py-2 px-1.5 w-[300px]">Zona · disciplina</th>
                <th className="text-left py-2 px-1.5 min-w-[430px]">Prescripción</th>
                <th className="text-left py-2 px-1.5 w-[104px]">Descanso</th>
                <th className="text-left py-2 px-1.5 min-w-[210px]">Ref. de la zona</th>
                <th className="text-left py-2 px-1.5 min-w-[180px]">Notas</th>
                <th className="py-2 px-1.5 w-[78px]"></th>
              </tr>
            </thead>
            <tbody>
              {filasR.map((f, i) => {
                const ref = getRef(f.zona, f.disciplina)
                return (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-1.5 px-1.5 text-orange-400 font-bold tabular-nums">{f.orden}</td>
                    {/* Zona y disciplina en horizontal, no apiladas: apiladas hacen la
                        fila de dos pisos y descolocan la alineación de todo lo demás. */}
                    <td className="py-1.5 px-1.5">
                      <div className="flex gap-1.5">
                        {/* «Técnica» vive aquí porque es donde va la mano, pero no es
                            una zona: al elegirla la fila guarda AER. Lo que se ve se
                            calcula del estado, no se guarda por duplicado. */}
                        <select value={f.esTecnica ? VALOR_TECNICA : f.zona}
                          onChange={e => parcheR(i, e.target.value === VALOR_TECNICA
                            ? { esTecnica: true, zona: ZONA_DE_TECNICA }
                            : { esTecnica: false, tecnicaId: '', zona: e.target.value })}
                          className={campoBase + ' flex-1 min-w-[150px]'}>
                          <option value="">Zona</option>
                          <optgroup label="Sin intensidad">
                            <option value={VALOR_TECNICA}>Técnica</option>
                          </optgroup>
                          {sistema === 2
                            ? FACTORES_RESISTENCIA.map(factor => (
                                <optgroup key={factor} label={factor}>
                                  {ZONAS_RESISTENCIA.filter(z => z.factor === factor).map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                                </optgroup>
                              ))
                            : ZONAS.map(z => <option key={z.num} value={'Z' + z.num}>Z{z.num}</option>)}
                        </select>
                        <select value={f.disciplina} onChange={e => updateR(i, 'disciplina', e.target.value)} className={campoBase + ' flex-none w-[124px]'}>
                          <option value="">Deporte</option>
                          <option>Natacion</option><option>Ciclismo</option><option>Carrera</option>
                        </select>
                      </div>
                    </td>
                    {/* LA PRESCRIPCIÓN, EN UN BLOQUE — igual que en fuerza.
                        La unidad va DENTRO, pegada al número que modifica. Aquí es un
                        desplegable y no un botón que cicla como el reps/seg de fuerza:
                        son seis unidades en dos familias, y pulsar cinco veces para
                        llegar a «reps» es peor que abrir una lista. */}
                    <td className="py-1.5 px-1.5">
                      <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700 rounded-xl px-2.5 py-1.5">
                        <input type="number" value={f.series} onChange={e => updateR(i, 'series', e.target.value)}
                          className={inputBloque + ' w-[56px]'} placeholder="4" title="Series" />
                        <span className="text-gray-500 flex-none select-none">×</span>
                        <input type="text" value={f.valorMedicion} onChange={e => updateR(i, 'valorMedicion', e.target.value)}
                          className={inputBloque + ' w-[76px]'} placeholder="1000" title="Cuánto en cada serie" />
                        <select value={f.tipoMedicion} onChange={e => updateR(i, 'tipoMedicion', e.target.value)}
                          className={botonBloque(!!f.tipoMedicion)} title="Unidad de la serie">
                          <option value="">und.</option>
                          <optgroup label="Distancia">
                            <option value="m">m</option>
                            <option value="km">km</option>
                          </optgroup>
                          <optgroup label="Tiempo">
                            <option value="seg">seg</option>
                            <option value="min">min</option>
                            <option value="mmss">mm:ss</option>
                          </optgroup>
                          <option value="reps">reps</option>
                        </select>
                        <span className="text-gray-500 flex-none select-none">@</span>
                        {/* El ritmo/vatios de la zona sale de fantasma, igual que el
                            «≈ 82,5 kg» del %1RM en fuerza. getRef solo devuelve `ritmo`
                            si el atleta tiene hecho el test que toca (VAM, FTP o CSS):
                            sin test no se propone nada, que es lo acordado. Escribir
                            encima manda. */}
                        <input type="text" value={f.intensidadPersonalizada} onChange={e => updateR(i, 'intensidadPersonalizada', e.target.value)}
                          className={campoBloque + ' flex-1 min-w-[130px]'}
                          placeholder={ref?.ritmo || 'Intensidad'}
                          title={ref?.ritmo ? 'Intensidad propia — en gris, lo que sale de sus tests' : 'Intensidad propia'} />
                      </div>
                      {/* El ejercicio de técnica va en una segunda línea y solo aparece
                          cuando toca, así que no le quita ancho a nada el resto del
                          tiempo. Mismo sitio que el «encadenar» de fuerza. */}
                      {f.esTecnica && (() => {
                        const drills = drillsDe(f.disciplina)
                        return (
                          <div className="flex items-center gap-1.5 mt-1.5 pl-1">
                            <span className="text-orange-400 text-xs flex-none">↳ Técnica</span>
                            {drills.length > 0 ? (
                              <select value={f.tecnicaId} onChange={e => updateR(i, 'tecnicaId', e.target.value)}
                                className={campoBase + ' flex-1 min-w-[180px]'}>
                                <option value="">Elige el ejercicio…</option>
                                {drills.map((e: any) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                              </select>
                            ) : (
                              // Mejor decir por qué está vacío que enseñar una lista sin nada
                              // y dejar que parezca que la app está rota.
                              <span className="text-gray-500 text-xs">
                                No hay ejercicios de técnica{f.disciplina ? ' de ' + f.disciplina : ''} en la biblioteca todavía.
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="py-1.5 px-1.5"><input type="text" value={f.descanso} onChange={e => updateR(i, 'descanso', e.target.value)} className={inputCls} placeholder="1:30" /></td>
                    {/* La referencia en chips y no en cuatro líneas de colores: así deja
                        de ser el elemento más alto de la fila y de marcar la altura de
                        todos los demás. */}
                    <td className="py-1.5 px-1.5">
                      <div className="flex flex-wrap gap-1">
                        {ref?.porcentaje && <span className={chipCls + ' text-orange-300'}>{ref.porcentaje}</span>}
                        {ref?.ritmo && <span className={chipCls + ' text-blue-400'}>{ref.ritmo}</span>}
                        {ref?.fc && <span className={chipCls + ' text-gray-400'}>{ref.fc}</span>}
                        {ref?.rpe && <span className={chipCls + ' text-gray-500'}>{ref.rpe}</span>}
                        {!ref && <span className="text-gray-600 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="py-1.5 px-1.5"><input type="text" value={f.comentario} onChange={e => updateR(i, 'comentario', e.target.value)} className={inputCls} placeholder="Notas..." /></td>
                    <td className="py-1.5 px-1.5">
                      <div className="flex gap-1">
                        {/* Con «Técnica» elegida hay que decir CUÁL, si no lo guardado
                            sería un AER suelto y el trabajo técnico se perdería sin
                            avisar. Mismo criterio que fuerza, que tampoco guarda sin
                            ejercicio. */}
                        <button onClick={() => guardarFilaR(i)} disabled={loading || (f.esTecnica && !f.tecnicaId)}
                          title={f.esTecnica && !f.tecnicaId ? 'Elige el ejercicio de técnica' : 'Guardar'}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition disabled:opacity-40">✓</button>
                        <button onClick={() => setFilasR(prev => prev.filter((_, idx) => idx !== i))} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition">×</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TABLA FUERZA — nuevas filas */}
      {filasF.length > 0 && esFuerza && (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              {/* Las cuatro casillas de la prescripción van bajo UNA cabecera: se leen
                  como lo escribiría un entrenador — 4 × 8 @ 75% · RIR 2 — y los
                  separadores × y @ son lo que convierte cuatro huecos sueltos en una
                  frase. */}
              <tr className="text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-700">
                <th className="text-left py-2 px-1.5 w-9">#</th>
                <th className="text-left py-2 px-1.5 w-[236px]">Tipo · cualidad</th>
                <th className="text-left py-2 px-1.5 min-w-[380px]">Músculo / Ejercicio</th>
                <th className="text-left py-2 px-1.5 min-w-[430px]">Prescripción</th>
                <th className="text-left py-2 px-1.5 w-[104px]">Descanso</th>
                <th className="text-left py-2 px-1.5 min-w-[180px]">Notas</th>
                <th className="py-2 px-1.5 w-[82px]"></th>
              </tr>
            </thead>
            <tbody>
              {filasF.map((f, i) => (
                <React.Fragment key={i}>
                <tr className="border-b border-gray-800">
                  <td className="py-1.5 px-1.5 text-orange-400 font-bold tabular-nums">{f.orden}</td>
                  {/* Tipo y cualidad EN HORIZONTAL. Apilados hacían que la fila tuviera
                      dos pisos y descolocaban la alineación de todo lo demás.
                      Los mínimos van con número, no con min-w-0: poner 0 es justo lo
                      que le da permiso a un flex item para encogerse por debajo de su
                      contenido, y era lo que cortaba «Isométrico» por mucho que se
                      ensanchara la columna. Medido: «Isométrico» pide 102px y
                      «RFMIX1» 84. */}
                  <td className="py-1.5 px-1.5">
                    <div className="flex gap-1.5">
                      {/* Un isométrico es tiempo por definición, así que al elegirlo se
                          propone tiempo. Sigue siendo una propuesta: el conmutador
                          manda, por si alguien cuenta un isométrico en reps. */}
                      <select value={f.tipoSerie}
                        onChange={e => parcheF(i, e.target.value === 'Isométrico' && f.medida !== 'tiempo'
                          ? { tipoSerie: e.target.value, medida: 'tiempo' }
                          : { tipoSerie: e.target.value })}
                        className={campoBase + ' flex-1 min-w-[110px]'}>
                        <option value="Normal">Normal</option>
                        <option value="Superserie">Superserie</option>
                        <option value="Drop set">Drop set</option>
                        <option value="Complex">Complex</option>
                        <option value="Isométrico">Isométrico</option>
                      </select>
                      {modoFuerza === 'compleja' && (
                        <select value={f.zonaFuerzaTarea} onChange={e => updateF(i, 'zonaFuerzaTarea', e.target.value)} className={campoBase + ' flex-none w-[92px]'} title="Cualidad de fuerza">
                          <option value="">Cual…</option>
                          {ZONAS_FUERZA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-1.5">
                    <div className="flex flex-col gap-1.5">
                      {/* El ejercicio manda sobre el grupo muscular: es lo que se lee
                          para saber qué es. El grupo es un filtro para encontrarlo y
                          puede recortarse sin perder nada. */}
                      <div className="flex gap-1.5">
                        <select value={f.grupoMuscularSel} onChange={e => updateF(i, 'grupoMuscularSel', e.target.value)} className={campoBase + ' basis-[42%] min-w-[120px]'}>
                          <option value="">Grupo muscular</option>
                          {[...new Set(ejerciciosBiblioteca.map(e => e.grupo_muscular))].map(g => <option key={g as string} value={g as string}>{g as string}</option>)}
                        </select>
                        {f.grupoMuscularSel && (
                          <select value={f.ejercicioSelId} onChange={e => updateF(i, 'ejercicioSelId', e.target.value)} className={campoBase + ' basis-[58%] min-w-[190px]'}>
                            <option value="">Ejercicio</option>
                            {ejerciciosBiblioteca.filter(e => e.grupo_muscular === f.grupoMuscularSel).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                          </select>
                        )}
                      </div>
                      {(f.tipoSerie === 'Superserie' || f.tipoSerie === 'Complex') && (
                        <div className="border-t border-orange-800 pt-1 mt-1">
                          <p className="text-orange-400 text-xs mb-1">+ Encadenar:</p>
                          <select value={f.grupoMuscular2} onChange={e => updateF(i, 'grupoMuscular2', e.target.value)} className={inputCls}>
                            <option value="">Grupo muscular</option>
                            {[...new Set(ejerciciosBiblioteca.map(e => e.grupo_muscular))].map(g => <option key={g as string} value={g as string}>{g as string}</option>)}
                          </select>
                          {f.grupoMuscular2 && (
                            <select value={f.ejercicioSelId2} onChange={e => updateF(i, 'ejercicioSelId2', e.target.value)} className={inputCls + ' mt-1'}>
                              <option value="">Ejercicio 2</option>
                              {ejerciciosBiblioteca.filter(e => e.grupo_muscular === f.grupoMuscular2).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                            </select>
                          )}

                        </div>
                      )}
                      {f.tipoSerie === 'Drop set' && (
                        <div className="border-t border-yellow-800 pt-1 mt-1">
                          <p className="text-yellow-400 text-xs mb-1">Escalones kg:</p>
                          <input type="text" value={f.escalonDrop} onChange={e => updateF(i, 'escalonDrop', e.target.value)} className={inputCls} placeholder="80,60,40" />
                        </div>
                      )}
                    </div>
                  </td>
                  {/* LA PRESCRIPCIÓN, EN UN BLOQUE.
                      Las cuatro casillas eran cuatro columnas sueltas y había que
                      leerlas una a una para saber qué habías mandado. Juntas y con los
                      separadores × y @ se leen como lo escribe un entrenador:
                          4 × 8 @ 75% · RIR 2
                      Los dos conmutadores viven DENTRO, pegados a lo que modifican.
                      El botón enseña la unidad/escala ACTUAL y al pulsarlo pasa a la
                      siguiente: un <select> por fila serían seis desplegables de ruido
                      en una sesión de seis ejercicios. */}
                  <td className="py-1.5 px-1.5">
                    <div className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700 rounded-xl px-2.5 py-1.5">
                      <input type="number" value={f.series} onChange={e => updateF(i, 'series', e.target.value)}
                        className={inputBloque + ' w-[58px]'} placeholder="4" title="Series" />
                      <span className="text-gray-500 flex-none select-none">×</span>
                      {/* En tiempo el campo pasa a texto: acepta «45» y «1:30». */}
                      <input type={f.medida === 'tiempo' ? 'text' : 'number'} value={f.repsFuerza}
                        onChange={e => updateF(i, 'repsFuerza', e.target.value)}
                        className={inputBloque + ' w-[74px]'}
                        placeholder={f.medida === 'tiempo' ? '1:30' : '10'}
                        title={f.medida === 'tiempo' ? 'Tiempo por serie — segundos o mm:ss' : 'Repeticiones por serie'} />
                      <button type="button"
                        onClick={() => updateF(i, 'medida', f.medida === 'tiempo' ? 'reps' : 'tiempo')}
                        title={f.medida === 'tiempo' ? 'Ahora va por tiempo — pulsa para pasar a repeticiones' : 'Ahora va por repeticiones — pulsa para pasar a tiempo'}
                        className={botonBloque(f.medida === 'tiempo')}>
                        {f.medida === 'tiempo' ? 'seg' : 'reps'}
                      </button>
                      <span className="text-gray-500 flex-none select-none">@</span>
                      {/* Con %1RM el kilo sale solo del test del atleta y se enseña de
                          fantasma. Si no tiene ese test, no aparece nada. */}
                      <input type="number" value={f.kgFuerza} onChange={e => updateF(i, 'kgFuerza', e.target.value)}
                        className={inputBloque + ' w-[96px]'}
                        placeholder={f.controlTipo === 'pct1rm' ? (kgDesde1RM(f) ?? 'kg') : 'kg'}
                        title={f.controlTipo === 'pct1rm' && kgDesde1RM(f) ? 'Calculado con su 1RM más reciente de este ejercicio' : 'Peso'} />
                      <span className="text-gray-500 flex-none select-none">·</span>
                      <input type="text" value={f.rir} onChange={e => updateF(i, 'rir', e.target.value)}
                        className={inputBloque + ' w-[62px]'}
                        placeholder={controlDe(f.controlTipo).ph}
                        title={controlDe(f.controlTipo).ayuda} />
                      <button type="button"
                        onClick={() => updateF(i, 'controlTipo', siguienteControl(f.controlTipo))}
                        title={controlDe(f.controlTipo).ayuda + ' — pulsa para cambiar de escala'}
                        className={botonBloque(f.controlTipo !== 'rir')}>
                        {controlDe(f.controlTipo).corto}
                      </button>
                    </div>
                  </td>
                  <td className="py-1.5 px-1.5"><input type="text" value={f.descanso} onChange={e => updateF(i, 'descanso', e.target.value)} className={inputCls} placeholder="2:00" /></td>
                  <td className="py-1 px-1"><input type="text" value={f.comentario} onChange={e => updateF(i, 'comentario', e.target.value)} className={inputCls} placeholder="Notas..." /></td>
                  <td className="py-1 px-1">
                    <div className="flex gap-1">
                      <button onClick={() => guardarFilaF(i)} disabled={loading || !f.ejercicioSelId} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition disabled:opacity-40">✓</button>
                      <button onClick={() => setFilasF(prev => prev.filter((_, idx) => idx !== i))} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition">×</button>
                    </div>
                  </td>
                </tr>
                {/* El ejercicio encadenado sigue el MISMO reparto de columnas que la
                    fila de arriba: son 7, no las 10 de antes. Su prescripción va en el
                    mismo bloque para que se lea igual. */}
                {(f.tipoSerie === 'Superserie' || f.tipoSerie === 'Complex') && f.ejercicioSelId2 && (
                  <tr className="border-b border-orange-900 bg-orange-950/20">
                    <td className="py-1.5 px-1.5"></td>
                    <td className="py-1.5 px-1.5">
                      <span className="text-orange-400 text-xs font-medium">↳ Encadenado</span>
                    </td>
                    <td className="py-1.5 px-1.5">
                      <p className="text-orange-300 text-sm px-2 py-1.5 truncate">
                        {ejerciciosBiblioteca.find((e: any) => e.id === Number(f.ejercicioSelId2))?.nombre || '—'}
                      </p>
                    </td>
                    <td className="py-1.5 px-1.5">
                      <div className="flex items-center gap-1.5 bg-gray-800/40 border border-orange-900/60 rounded-xl px-2.5 py-1.5">
                        <input type="number" value={f.series2} onChange={e => updateF(i, 'series2', e.target.value)}
                          className={inputBloque + ' w-[58px]'} placeholder="4" title="Series" />
                        <span className="text-gray-500 flex-none select-none">×</span>
                        <input type="number" value={f.repsFuerza2} onChange={e => updateF(i, 'repsFuerza2', e.target.value)}
                          className={inputBloque + ' w-[74px]'} placeholder="10" title="Repeticiones" />
                        <span className="text-gray-500 flex-none select-none">@</span>
                        <input type="number" value={f.kgFuerza2} onChange={e => updateF(i, 'kgFuerza2', e.target.value)}
                          className={inputBloque + ' w-[96px]'} placeholder="kg" title="Peso" />
                      </div>
                    </td>
                    <td className="py-1.5 px-1.5"></td>
                    <td className="py-1.5 px-1.5"></td>
                    <td className="py-1.5 px-1.5"></td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!esDeportista && (
        <button onClick={() => esFuerza ? setFilasF(prev => [...prev, nuevaFilaF()]) : setFilasR(prev => [...prev, nuevaFilaR()])}
          className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-2">
          <span>+</span> Añadir {esFuerza ? 'ejercicio' : 'tarea'}
        </button>
      )}

      {tareaEditando && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Editar tarea</h3>
              <button onClick={() => setTareaEditando(null)} className="text-gray-400 hover:text-white text-2xl leading-none">x</button>
            </div>
            <form onSubmit={guardarEditarTarea} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-gray-400 text-xs">Zona / intensidad</span>
                <input type="text" placeholder="Zona (ej: Z2, AEM)" value={editZona} onChange={e => setEditZona(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
              </label>
              {/* Cambiar o quitar el ejercicio de técnica. Sin esto, equivocarse de
                  drill obligaba a borrar la tarea entera y volver a escribirla. */}
              {!esFuerza && (() => {
                const drills = drillsDe(tareaEditando.disciplina)
                // El drill que tiene puesto va en la lista SIEMPRE, aunque el filtro por
                // disciplina no lo alcance (si a la tarea le cambiaron el deporte, por
                // ejemplo). Si no, el desplegable saldría en blanco y al guardar se
                // borraría el ejercicio sin que nadie lo hubiera pedido.
                const puesto = editTecnicaId
                  ? ejerciciosBiblioteca.find((e: any) => String(e.id) === String(editTecnicaId))
                  : null
                const lista = puesto && !drills.some((d: any) => String(d.id) === String(puesto.id))
                  ? [puesto, ...drills] : drills
                return (
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-400 text-xs">Ejercicio de técnica</span>
                    <select value={editTecnicaId}
                      onChange={e => {
                        setEditTecnicaId(e.target.value)
                        // Al convertirla en técnica, si no tenía zona se le pone AER, que
                        // es lo que hace que cuente como el volumen suave que es. Si ya
                        // tenía una escrita, no se le toca: será por algo.
                        if (e.target.value && !editZona) setEditZona(ZONA_DE_TECNICA)
                      }}
                      className="bg-gray-800 text-white px-3 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                      <option value="">Sin técnica — tarea de intensidad normal</option>
                      {lista.map((e: any) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                    {lista.length === 0 && (
                      <span className="text-gray-500 text-xs">
                        No hay ejercicios de técnica{tareaEditando.disciplina ? ' de ' + tareaEditando.disciplina : ''} en la biblioteca todavía.
                      </span>
                    )}
                  </label>
                )
              })()}
              {/* La medición (tiempo/distancia/reps) solo en resistencia: la fuerza se
                  mide por ejercicios, no por estas tablas. */}
              {!esFuerza && (
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
              )}
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
    </div>
  )
}
