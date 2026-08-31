'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { textoEncadenado } from '@/lib/tarea-vista'
import { ordenarTareasQuery, moverItem, persistirOrden } from '@/lib/tareas-orden'
import { ZONAS_RESISTENCIA, ZONAS_FUERZA, FACTORES_RESISTENCIA, ZONAS_CLASICAS, zonaResistencia, prescripcion, type ZonaResistencia } from '@/lib/zonas'
import { tablaMedicion, valorCanonico, detectarMedicion, mmssASegundos, type UnidadMedicion } from '@/lib/medicion'
import { CONTROLES, controlDe, siguienteControl, controlDeEjercicio, type ControlTipo } from '@/lib/control-esfuerzo'
import BuscadorEjercicios from '@/components/BuscadorEjercicios'
import { filtrarDrills } from '@/lib/tecnica'
import {
  segAMmss, filaResistenciaDesde, filaFuerzaDesde, avisaOtraDisciplina,
  type FilaResistencia, type FilaFuerza,
} from '@/lib/copiar-tarea'
import { referenciaDeZona, cargarReferencias, ZONAS_UI as ZONAS } from '@/lib/referencia-zona'
import { aGuardar } from '@/lib/intensidad-prescrita'
import { atajosDe, aplicarAtajo, type AtajoIntensidad } from '@/lib/atajos-intensidad'

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
// El catálogo vive en lib/control-esfuerzo.ts: lo comparten esta tabla, el
// briefing del atleta, la pantalla de ejecución y la de datos reales. Se
// re-exporta para no tocar a quien ya lo importaba de aquí.
export { CONTROLES, controlDe }
export type { ControlTipo }

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

// La técnica NO es una zona, pero se elige como si lo fuera: está en el mismo
// desplegable porque es donde va la mano. Por debajo la tarea guarda AER, así que
// carga, SICAT, calendario y mesociclo no se enteran de nada y no cambia una línea
// de todo eso. Ver supabase/tecnica-en-resistencia.sql.
export const VALOR_TECNICA = '__tecnica'
export const ZONA_DE_TECNICA = 'AER'

/* FilaResistencia y FilaFuerza vivían aquí. Se han movido a lib/copiar-tarea
   junto con la conversión que las rellena desde una tarea guardada: tener la
   forma en un sitio y quien la construye en otro es como empiezan a divergir. */
export type { FilaResistencia, FilaFuerza }

export default function TareasTabla({ sesionId, deportistaId, disciplinaSesion, esDeportista, modoFuerza = 'simple', zonaFuerza = '', modoResistencia = 'simple', zonaResistencia: zonaResSesion = '', onTareasCambian, copiar, onCopiado }: {
  sesionId: number
  deportistaId: number
  disciplinaSesion: string
  esDeportista?: boolean
  /* Tareas que llegan del panel de la semana para copiarse aquí. El `token`
     hace de disparador: dos copias seguidas de la MISMA tarea son dos objetos
     iguales, y sin algo que cambie el efecto no volvería a saltar. */
  copiar?: { token: number; tareas: any[] } | null
  onCopiado?: () => void
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
  /* Qué fila tiene el foco en su casilla de intensidad, para enseñar ahí los
     atajos de unidad y solo ahí. null = ninguna. */
  const [atajosEn, setAtajosEn] = useState<number | null>(null)
  const [filasF, setFilasF] = useState<FilaFuerza[]>([])
  const [tests, setTests] = useState<any>({})
  const [fcMax, setFcMax] = useState(0)
  const [sistema, setSistema] = useState(1)
  const [loading, setLoading] = useState(false)
  const [tareasGuardadas, setTareasGuardadas] = useState<any[]>([])
  // Aquí vivía el estado del modal de edición (zona, series, descanso, comentario,
  // medición y técnica). Ya no hace falta: editar reabre la tarea en la fila de
  // abajo, que es el mismo formulario con el que se creó y tiene todos los campos.
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

  /*
   * Esto eran OCHO consultas en serie. Ahora son dos rondas.
   *
   * Las cuatro primeras —FC máxima, sistema de zonas y los tres tests— son
   * ademas EXACTAMENTE las mismas que la pagina de la sesion acaba de hacer
   * para su cabecera. Se pedian dos veces por cada apertura. Ahora al menos
   * salen de la misma funcion (lib/referencia-zona), asi que no pueden
   * divergir; quitar la segunda peticion del todo pide bajar los datos por
   * props, y eso es otra tanda.
   */
  const cargarDatos = async () => {
    const [refs, ejBib, tf, tar] = await Promise.all([
      cargarReferencias(supabase, deportistaId),
      supabase.from('ejercicios_biblioteca').select('*').order('grupo_muscular').order('nombre'),
      // 1RM por ejercicio, para poder enseñar el kilo cuando se prescribe en %.
      supabase.from('test_fuerza')
        .select('ejercicio, rm_estimado, fecha').eq('id_deportista', deportistaId)
        .not('rm_estimado', 'is', null).order('fecha', { ascending: false }),
      ordenarTareasQuery(
        supabase.from('tarea').select('*, p_distancia(*), p_duracion(*), p_repeticiones(*)').eq('id_sesion', sesionId)),
    ])

    setFcMax(refs.fcMax)
    setSistema(refs.sistema)
    setTests({ ...refs.tests, fuerza: [] })
    setEjerciciosBiblioteca(ejBib.data || [])

    // Se queda solo con el 1RM más reciente de cada ejercicio: la lista viene
    // ordenada por fecha descendente, así que el primero que aparece es el bueno.
    const porEjercicio: Record<string, { rm: number; fecha: string }> = {}
    for (const t of tf.data || []) {
      const clave = String(t.ejercicio || '').trim().toLowerCase()
      if (clave && !porEjercicio[clave]) porEjercicio[clave] = { rm: Number(t.rm_estimado), fecha: t.fecha }
    }
    setRmPorEjercicio(porEjercicio)

    // Los ejercicios cuelgan de las tareas, así que esta sí espera.
    const filas = tar.data as any[] | null
    if (filas && filas.length > 0) {
      const { data: ejs } = await supabase.from('ejercicios').select('*').in('id_tarea', filas.map(t => t.id))
      setTareasGuardadas(filas.map(t => ({
        ...t,
        ejercicios: ejs?.filter((e: any) => e.id_tarea === t.id) || [],
      })))
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

  /**
   * Editar = volver a bajar la tarea al formulario donde se creó.
   *
   * Antes esto abría un modal con cuatro campos, así que media prescripción no
   * se podía tocar. Ahora la tarea se convierte en una fila del mismo editor de
   * abajo, con todo lo que tenía dentro, y al guardar se actualiza en vez de
   * crear otra. Mientras se edita desaparece de la tabla de arriba: verla en dos
   * sitios a la vez, con valores distintos, es peor que no poder editarla.
   */
  /* Editar y copiar son la MISMA conversión (lib/copiar-tarea), y solo cambia
     una cosa: editar lleva `idTarea` y copiar no. Con él, guardar hace UPDATE
     sobre la tarea de origen; sin él, INSERT en esta sesión — que es lo que
     hace que copiar desde el panel de la semana no toque la otra sesión.
     Antes esta función tenía el mapeo entero escrito a mano; ahora hay uno. */
  const abrirEditarTarea = (t: any) => {
    if (esFuerza) {
      setFilasF(prev => prev.some(f => f.idTarea === t.id) ? prev : [...prev,
        filaFuerzaDesde(t, {
          base: nuevaFilaF(), orden: t.orden ?? prev.length + 1,
          copia: false, ejerciciosBiblioteca,
        })])
      return
    }
    setFilasR(prev => prev.some(f => f.idTarea === t.id) ? prev : [...prev,
      filaResistenciaDesde(t, { base: nuevaFilaR(), orden: t.orden ?? prev.length + 1, copia: false })])
  }

  /* Lo que manda el panel de la semana. Cae en filas NUEVAS del formulario, no
     en la base: una tarea de otra semana casi nunca vale tal cual, así que se
     revisa y se le da a ✓, igual que a cualquier tarea escrita a mano. */
  useEffect(() => {
    if (!copiar?.tareas?.length) return
    // Sin biblioteca cargada, los ejercicios de fuerza no se pueden resolver por
    // id y la fila saldría con el desplegable vacío. Se espera: el efecto vuelve
    // a dispararse cuando llega.
    if (esFuerza && !ejerciciosBiblioteca.length) return
    const base = tareasGuardadas.length
    if (esFuerza) {
      setFilasF(prev => [...prev, ...copiar.tareas.map((t, k) =>
        filaFuerzaDesde(t, {
          base: nuevaFilaF(), orden: base + prev.length + k + 1,
          copia: true, ejerciciosBiblioteca,
        }))])
    } else {
      setFilasR(prev => [...prev, ...copiar.tareas.map((t, k) =>
        filaResistenciaDesde(t, { base: nuevaFilaR(), orden: base + prev.length + k + 1, copia: true }))])
    }
    onCopiado?.()
  }, [copiar?.token, ejerciciosBiblioteca.length])

  /** Las que están abiertas abajo no se pintan arriba. */
  const editandose = new Set<number>([
    ...filasR.map(f => f.idTarea), ...filasF.map(f => f.idTarea),
  ].filter((x): x is number => x != null))

  /* Traducir zona → ritmo/vatios/pulsaciones vive en lib/referencia-zona: lo
     necesitan también el panel de la semana y el briefing. Aquí ya pasó una vez
     que la copia local de la tabla de %VAM iba desplazada 5–10 puntos y el mismo
     Z4 daba dos ritmos distintos según por dónde entrases. */
  const getRef = (codigo: string | null | undefined, disciplina: string) =>
    referenciaDeZona(codigo, disciplina, tests, fcMax)

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

  /* Pulsar un atajo de unidad en la fila `i`.
     El cursor se coloca a mano DESPUÉS de que React repinte: si se pone antes,
     el repintado escribe el value nuevo y el navegador manda el cursor al final,
     que es justo donde no sirve —lo que quieres es teclear el número DELANTE
     de « /km». */
  const aplicarAtajoEn = (i: number, valorActual: string, at: AtajoIntensidad) => {
    const r = aplicarAtajo(valorActual, at)
    updateR(i, 'intensidadPersonalizada', r.texto)
    requestAnimationFrame(() => {
      const el = document.getElementById('intensidad-' + i) as HTMLInputElement | null
      if (!el) return
      el.focus()
      el.setSelectionRange(r.cursor, r.cursor)
    })
  }

  const guardarFilaR = async (i: number) => {
    const f = filasR[i]
    setLoading(true)
    try {
      const campos = {
        zona_entrenamiento: f.zona || null,
        disciplina: f.disciplina,
        series: f.series ? Number(f.series) : null,
        descanso_segundos: f.descanso ? mmssASegundos(f.descanso) : null,
        comentario: f.comentario || null,
        // La zona que se guarda es AER, no «técnica»: eso es lo que hace que el
        // trabajo técnico cuente como el volumen suave que realmente es.
        tecnica_id: f.tecnicaId ? Number(f.tecnicaId) : null,
      }
      let idTarea = f.idTarea ?? null
      if (idTarea) {
        const { error } = await supabase.from('tarea').update(campos).eq('id', idTarea)
        if (error) { alert('Error al guardar tarea: ' + error.message); setLoading(false); return }
        // La medición vive en TRES tablas y una tarea solo puede tener una. Al
        // editar se limpian las tres antes de escribir: si solo se tocara la
        // nueva, cambiar de metros a minutos dejaría las dos, y el volumen se
        // contaría por partida doble sin que nada se queje.
        await supabase.from('p_distancia').delete().eq('id_tarea', idTarea)
        await supabase.from('p_duracion').delete().eq('id_tarea', idTarea)
        await supabase.from('p_repeticiones').delete().eq('id_tarea', idTarea)
      } else {
        const { data: tarea, error: errTarea } = await supabase.from('tarea').insert({
          id_sesion: sesionId, ...campos,
          // Sin esto las tareas creadas aquí quedaban con orden nulo → las dos vistas
          // se ordenaban distinto (ver lib/tareas-orden).
          orden: tareasGuardadas.length + i + 1,
        }).select().single()
        if (errTarea) { alert('Error al guardar tarea: ' + errTarea.message); setLoading(false); return }
        idTarea = tarea?.id ?? null
      }
      if (idTarea) {
        const _ref = getRef(f.zona, f.disciplina)
        const _tabla = tablaMedicion(f.tipoMedicion as UnidadMedicion)
        const _valor = valorCanonico(f.tipoMedicion as UnidadMedicion, f.valorMedicion)
        /* SOLO SE GUARDA LO QUE EL ENTRENADOR ESCRIBE.
           Antes era `f.intensidadPersonalizada.trim() || _ref?.ritmo || null`:
           con la casilla vacía se guardaba la sugerencia de la app. Así la
           columna acababa conteniendo o lo suyo o lo de la app sin forma de
           distinguirlo, y al releerla había que adivinarlo comparándola otra
           vez con el cálculo; si coincidían se borraba la casilla, con lo cual
           prescribir a propósito el mismo valor que proponía la app era
           imposible: desaparecía al recargar.

           De las cuatro filas que había en la base con ritmo, TRES eran ese
           fantasma («< 65% VAM», «65–75% VAM», «95–105% VAM»): la propia app
           guardándose a sí misma. Lo calculado se calcula al enseñarlo, que
           para eso es calculado. */
        const _intensidad = aGuardar(f.intensidadPersonalizada)

        /* LA INTENSIDAD SE ESCRIBE EN UN SEGUNDO PASO, Y NO ES UN DESCUIDO.
           Si fuera dentro del insert y la columna no estuviera, se caería la
           fila entera y la tarea se quedaría SIN DISTANCIA NI TIEMPO: se
           perdería el dato importante por no poder guardar el accesorio.
           Separada, lo peor que pasa es que no haya intensidad.

           Sigue haciendo falta aunque `p_distancia.ritmo_objetivo` ya sea text:
           la de `p_duracion` la añade supabase/intensidad-en-bloques-por-tiempo.sql,
           y hasta que se corra en cada base, esta escritura es la que puede fallar. */
        const guardarIntensidad = async (tabla: 'p_distancia' | 'p_duracion', idFila: number) => {
          if (!_intensidad) return
          const { error } = await supabase.from(tabla).update({ ritmo_objetivo: _intensidad }).eq('id', idFila)
          // No se avisa al entrenador: la tarea está guardada y esto no lo
          // puede arreglar él. Pero tampoco se calla, que es como llegó aquí.
          if (error) console.warn('[tripulse] ritmo_objetivo no se guardó en ' + tabla + ':', error.message)
        }

        if (_tabla === 'p_distancia') {
          const { data: pd, error: errD } = await supabase.from('p_distancia')
            .insert({ id_tarea: idTarea, metros_planeados: _valor }).select().single()
          if (errD) { alert('Error al guardar la distancia: ' + errD.message); setLoading(false); return }
          if (pd) await guardarIntensidad('p_distancia', pd.id)
        }
        else if (_tabla === 'p_duracion') {
          /* Aquí estaba el agujero: se insertaba el tiempo y la intensidad se
             tiraba. «30 min a 4:30/km» le llegaba al deportista como «30 min». */
          const { data: pu, error: errU } = await supabase.from('p_duracion')
            .insert({ id_tarea: idTarea, tiempo_planeado: _valor }).select().single()
          if (errU) { alert('Error al guardar la duración: ' + errU.message); setLoading(false); return }
          if (pu) await guardarIntensidad('p_duracion', pu.id)
        }
        else if (_tabla === 'p_repeticiones') await supabase.from('p_repeticiones').insert({ id_tarea: idTarea, repeticiones_planteadas: _valor })
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
    // Crear exige ejercicio. EDITAR no: las tareas de fuerza que vienen de una
    // plantilla o del planificador llevan el ejercicio en el comentario y no
    // tienen fila en `ejercicios`, y antes esas sí se podían editar. Exigirlo
    // aquí sería quitar algo que ya se podía hacer.
    if (!f.ejercicioSelId && !f.idTarea) return
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
    const campos = {
      disciplina: 'Fuerza',
      zona_entrenamiento: zonaF,
      series: f.series ? Number(f.series) : null,
      descanso_segundos: f.descanso ? mmssASegundos(f.descanso) : null,
      comentario: f.comentario || null,
    }
    let tarea: any = null
    if (f.idTarea) {
      const { error } = await supabase.from('tarea').update(campos).eq('id', f.idTarea)
      if (error) { alert('Error al guardar ejercicio: ' + error.message); setLoading(false); return }
      // El ejercicio y la medición se reescriben enteros, pero SOLO si hay
      // ejercicio con el que reescribirlos. Es más simple y más fiable que
      // parchear campo a campo: cambiar de reps a tiempo mueve el dato de
      // p_repeticiones a p_duracion, y dejar la vieja sin borrar duplicaría el
      // volumen de la sesión en silencio. Sin ejercicio se tocan solo los campos
      // de la tarea, para no vaciar lo que ya había.
      if (ejBib) {
        await supabase.from('ejercicios').delete().eq('id_tarea', f.idTarea)
        await supabase.from('p_duracion').delete().eq('id_tarea', f.idTarea)
        await supabase.from('p_repeticiones').delete().eq('id_tarea', f.idTarea)
      }
      tarea = { id: f.idTarea }
    } else {
      const { data, error: errTarea } = await supabase.from('tarea').insert({
        id_sesion: sesionId, ...campos,
        orden: tareasGuardadas.length + i + 1,
      }).select().single()
      if (errTarea) { alert('Error al guardar ejercicio: ' + errTarea.message); setLoading(false); return }
      tarea = data
    }
    if (tarea && ejBib) {
      const ejBib2 = f.ejercicioSelId2 ? ejerciciosBiblioteca.find((e: any) => e.id === Number(f.ejercicioSelId2)) : null
      /* Los números del encadenado van a SUS columnas, y ya no se pegan también
         dentro de `notas_ejecucion` como « | EJ2: Nombre 3x10 @40kg ». Escribir
         las dos cosas dejaría el mismo dato en dos sitios, y con el tiempo
         dirían cosas distintas: es el fallo que este pase lleva persiguiendo.
         Lo que el atleta lee lo arma `textoEncadenado` en lib/tarea-vista. */
      const { error: errEj } = await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        /* El id de la biblioteca, para poder resolver el vídeo EN VIVO al leer.
           El nombre se sigue guardando: es la prescripción y tiene que quedar
           congelada aunque el ejercicio se renombre después. */
        ejercicio_id: ejBib.id,
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
        ].filter(Boolean).join(' · '),
        tipo_serie: f.tipoSerie || 'Normal',
        ejercicio_encadenado_nombre: ejBib2?.nombre || null,
        ejercicio_encadenado_id: ejBib2?.id || null,
        encadenado_series: ejBib2 && f.series2 ? Number(f.series2) : null,
        encadenado_repeticiones: ejBib2 && f.repsFuerza2 ? Number(f.repsFuerza2) : null,
        encadenado_intensidad: ejBib2 && f.kgFuerza2 ? Number(f.kgFuerza2) : null,
        escalones_drop: f.escalonDrop || null,
        url_video: ejBib.url_video || null,
      })
      /* Este insert no miraba su error. Si fallaba, la tarea se guardaba y el
         EJERCICIO se perdía sin decir nada — y una tarea de fuerza sin ejercicio
         no es nada. Se avisa. */
      if (errEj) { alert('Error al guardar el ejercicio: ' + errEj.message); setLoading(false); return }
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
                    {/* «Control», no «RIR»: el RIR es uno de los cuatro. Con la
                        cabecera fija, prescribir por RPE o por %1RM enseñaba el
                        número bajo la etiqueta equivocada — cuando lo enseñaba. */}
                    <th className="text-left py-2 px-2">Control</th>
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
                // La que se está editando abajo no se pinta aquí: verla en dos
                // sitios con valores distintos es peor que no poder editarla.
                // Se salta dentro del map y no filtrando el array, porque el
                // índice es el que usa el reordenado por arrastre.
                if (editandose.has(t.id)) return null
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
                                  {textoEncadenado(ej) && <span className="text-orange-400 text-xs">+ {textoEncadenado(ej)}</span>}
                                </div>
                              ))}
                            </div>
                          ) : t.comentario || '—'}
                        </td>
                        <td className="py-2 px-2 text-gray-300">{t.ejercicios?.[0]?.series || t.series || '—'}</td>
                        <td className="py-2 px-2 text-blue-400">{t.ejercicios?.[0]?.repeticiones ? t.ejercicios[0].repeticiones + ' reps' : mostrarValorGuardado(t)}</td>
                        <td className="py-2 px-2 text-yellow-400">{t.ejercicios?.[0]?.intensidad ? t.ejercicios[0].intensidad + ' kg' : '—'}</td>
                        {/* El valor se guarda en `control_valor` + `control_tipo`.
                            Aquí se leía con una expresión regular sobre el texto de
                            las notas —«RIR: 2»—, que es donde vivía ANTES de que
                            existieran esas columnas. O sea que desde entonces la
                            columna salía vacía siempre, y con RPE o %1RM no había
                            forma de que saliera nada. `controlDeEjercicio` lee la
                            columna y, si está vacía, rescata el texto viejo. */}
                        <td className="py-2 px-2 text-gray-300">{controlDeEjercicio(t.ejercicios?.[0]) || '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.descanso_segundos ? segAMmss(t.descanso_segundos) : '—'}</td>
                        {/* El comentario del ENTRENADOR, que es lo que se prescribe.
                            Aquí se pintaba `notas_post`, que es lo que escribe el
                            ATLETA al terminar: la nota del entrenador se guardaba y
                            no se veía en ningún sitio de esta tabla. Lo del atleta
                            tiene su sitio en Datos reales y en Comunicación. */}
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
                  <React.Fragment key={i}>
                  <tr className="border-b border-gray-800">
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
                        <input type="text" id={'intensidad-' + i}
                          value={f.intensidadPersonalizada} onChange={e => updateR(i, 'intensidadPersonalizada', e.target.value)}
                          onFocus={() => setAtajosEn(i)}
                          onBlur={() => setAtajosEn(a => a === i ? null : a)}
                          className={campoBloque + ' flex-1 min-w-[130px]'}
                          placeholder={ref?.ritmo || 'Intensidad'}
                          title={ref?.ritmo ? 'Intensidad propia — en gris, lo que sale de sus tests' : 'Intensidad propia'} />
                      </div>

                      {/* Los atajos de unidad, solo en la fila que se está escribiendo.
                          Siempre visibles serían seis filas de botones en una sesión de
                          seis bloques: justo el ruido que esta tabla no puede permitirse.
                          Y aparecen en el momento en que hacen falta, que es al pinchar
                          la casilla y encontrártela en blanco. */}
                      {atajosEn === i && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 pl-1">
                          {atajosDe(f.disciplina).map(at => (
                            <button key={at.etiqueta} type="button" title={at.ayuda}
                              /* SIN ESTO EL BOTÓN NO FUNCIONA. Al pulsarlo, el campo
                                 pierde el foco, `atajosEn` se pone a null y los botones
                                 desaparecen ANTES de que el clic llegue a soltarse.
                                 preventDefault en mousedown impide que el foco se mueva. */
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => aplicarAtajoEn(i, f.intensidadPersonalizada, at)}
                              className="text-[11px] font-medium px-2 py-1 rounded-full border border-gray-700 bg-white/[0.03] text-gray-400 hover:text-orange-300 hover:border-orange-500/50 hover:bg-orange-500/10 transition">
                              {at.etiqueta}
                            </button>
                          ))}
                        </div>
                      )}
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
                          title={f.esTecnica && !f.tecnicaId ? 'Elige el ejercicio de técnica' : f.idTarea ? 'Guardar los cambios' : 'Guardar'}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition disabled:opacity-40">✓</button>
                        <button onClick={() => setFilasR(prev => prev.filter((_, idx) => idx !== i))}
                          title={f.idTarea ? 'Dejarla como estaba' : 'Quitar la fila'}
                          className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition">×</button>
                      </div>
                    </td>
                  </tr>
                  {/* Traer una tarea de otro deporte es legítimo —un cambio de plan,
                      un bloque que se repite—, pero el objetivo y los chips de la
                      derecha se calculan con la disciplina de la FILA: «285–310 W»
                      no significa nada corriendo. Se avisa en vez de convertirlo a
                      ciegas o de borrarlo. En un brick no sale: ahí mezclar deportes
                      es lo normal y el aviso saldría en todas las filas. */}
                  {avisaOtraDisciplina(f, disciplinaSesion) && (
                    <tr className="border-b border-gray-800">
                      <td></td>
                      <td colSpan={6} className="pt-0 pb-2 px-1.5">
                        <p className="text-[11.5px] text-amber-300 bg-amber-500/[0.08] border border-amber-500/25 rounded-lg px-2.5 py-1.5">
                          Es de {f.disciplina} y esta sesión es de {disciplinaSesion}: la referencia de la
                          derecha está en las unidades de {f.disciplina}. Cambia el deporte o repasa la
                          intensidad antes de guardar.
                        </p>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
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
                        {/* El grupo se pone JUNTO al ejercicio y en un solo parche:
                            si se eligiera uno de otro grupo sin mover el desplegable
                            de arriba, el de abajo quedaría enseñando una lista que
                            no contiene lo elegido. Y en dos llamadas seguidas la
                            segunda pisaría a la primera (ver `parcheF`). */}
                        <BuscadorEjercicios
                          ejercicios={ejerciciosBiblioteca}
                          onBibliotecaCambia={cargarDatos}
                          onElegir={ej => parcheF(i, {
                            grupoMuscularSel: ej.grupo_muscular || '',
                            ejercicioSelId: String(ej.id),
                          })} />
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
                          <div className="mt-1">
                            <BuscadorEjercicios
                              ejercicios={ejerciciosBiblioteca}
                              onBibliotecaCambia={cargarDatos}
                              onElegir={ej => parcheF(i, {
                                grupoMuscular2: ej.grupo_muscular || '',
                                ejercicioSelId2: String(ej.id),
                              })} />
                          </div>

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
                      <button onClick={() => guardarFilaF(i)} disabled={loading || (!f.ejercicioSelId && !f.idTarea)}
                        title={f.idTarea ? 'Guardar los cambios' : 'Guardar'}
                        className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition disabled:opacity-40">✓</button>
                      <button onClick={() => setFilasF(prev => prev.filter((_, idx) => idx !== i))}
                        title={f.idTarea ? 'Dejarlo como estaba' : 'Quitar la fila'}
                        className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition">×</button>
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

    </div>
  )
}
