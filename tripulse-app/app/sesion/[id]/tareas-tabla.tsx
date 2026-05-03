'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const ZONAS = [
  { num: 1, nombre: 'Z1 — Recuperacion activa', fcInf: 0, fcSup: 75, rpeInf: 2, rpeSup: 3 },
  { num: 2, nombre: 'Z2 — Resistencia aerobica', fcInf: 75, fcSup: 85, rpeInf: 4, rpeSup: 5 },
  { num: 3, nombre: 'Z3 — Tempo', fcInf: 85, fcSup: 93, rpeInf: 6, rpeSup: 7 },
  { num: 4, nombre: 'Z4 — Umbral', fcInf: 93, fcSup: 100, rpeInf: 7, rpeSup: 8 },
  { num: 5, nombre: 'Z5 — VO2max', fcInf: 100, fcSup: 110, rpeInf: 8, rpeSup: 9 },
  { num: 6, nombre: 'Z6 — Capacidad anaerobica', fcInf: 110, fcSup: 130, rpeInf: 9, rpeSup: 10 },
  { num: 7, nombre: 'Z7 — Potencia neuromuscular', fcInf: 130, fcSup: 150, rpeInf: 10, rpeSup: 10 },
]

function formatRitmoKm(vam: number, pct: number) {
  const vel = vam * pct / 100
  if (vel <= 0) return '—'
  const seg = 3600 / vel
  return Math.floor(seg/60) + ':' + Math.round(seg%60).toString().padStart(2,'0') + '/km'
}

function formatRitmo100m(css: number, pct: number) {
  const vel = css * pct / 100
  if (vel <= 0) return '—'
  const seg = 100 / vel
  return Math.floor(seg/60) + ':' + Math.round(seg%60).toString().padStart(2,'0') + '/100m'
}

function getReferencia(zona: any, disciplina: string, tests: any, fcMax: number) {
  if (disciplina === 'Fuerza') return null
  if (!zona) return null
  const fc = fcMax > 0 ? Math.round(fcMax * zona.fcInf / 100) + '–' + Math.round(fcMax * zona.fcSup / 100) + ' ppm' : null
  if (disciplina === 'Carrera' && tests.vam) {
    return { fc, ritmo: formatRitmoKm(tests.vam, zona.fcInf) + ' – ' + formatRitmoKm(tests.vam, zona.fcSup) }
  }
  if (disciplina === 'Natacion' && tests.css) {
    return { fc, ritmo: formatRitmo100m(tests.css, zona.fcInf) + ' – ' + formatRitmo100m(tests.css, zona.fcSup) }
  }
  if (disciplina === 'Ciclismo' && tests.ftp) {
    const potInf = Math.round(tests.ftp * zona.fcInf / 100)
    const potSup = Math.round(tests.ftp * zona.fcSup / 100)
    return { fc, ritmo: potInf + '–' + potSup + ' W' }
  }
  return { fc, ritmo: null }
}

interface FilaTarea {
  id?: number
  orden: number
  zona: number | null
  disciplina: string
  series: string
  descanso: string
  tipoMedicion: string
  valorMedicion: string
  intensidadPersonalizada: string
  comentario: string
  grupoMuscular: string
  intensidadFuerza: string
  grupoMuscularSel: string
  ejercicioSelId: string
  repsFuerza: string
  rir: string
  kgFuerza: string
  guardado?: boolean
}

function segAMmss(seg: number): string {
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return s > 0 ? min + ':' + String(s).padStart(2,'0') : String(min)
}

function mmssASeg(str: string): number {
  const p = str.split(':')
  if (p.length === 2) return (parseInt(p[0])||0)*60 + (parseInt(p[1])||0)
  return parseInt(str)||0
}

function mostrarTotal(t: any): string {
  const series = t.series || 1
  if (t.p_duracion?.[0]?.tiempo_planeado) {
    const totalSeg = t.p_duracion[0].tiempo_planeado * series
    const min = Math.floor(totalSeg / 60)
    const seg = totalSeg % 60
    return seg > 0 ? min + ':' + String(seg).padStart(2,'0') + ' min' : min + ' min'
  }
  if (t.p_distancia?.[0]?.metros_planeados) {
    const total = t.p_distancia[0].metros_planeados * series
    return total >= 1000 ? (total/1000).toFixed(1) + ' km' : total + ' m'
  }
  if (t.p_repeticiones?.[0]?.repeticiones_planteadas) {
    return (t.p_repeticiones[0].repeticiones_planteadas * series) + ' reps'
  }
  return '—'
}

function mostrarValorGuardado(t: any): string {
  if (t.p_duracion?.[0]?.tiempo_planeado) return segAMmss(t.p_duracion[0].tiempo_planeado) + ' min'
  if (t.p_distancia?.[0]?.metros_planeados) {
    const m = t.p_distancia[0].metros_planeados
    return m >= 1000 ? (m/1000).toFixed(1) + ' km' : m + ' m'
  }
  if (t.p_repeticiones?.[0]?.repeticiones_planteadas) return t.p_repeticiones[0].repeticiones_planteadas + ' reps'
  return '—'
}

export default function TareasTabla({ sesionId, deportistaId, disciplinaSesion, esDeportista }: { sesionId: number, deportistaId: number, disciplinaSesion: string, esDeportista?: boolean }) {
  const [filas, setFilas] = useState<FilaTarea[]>([])
  const [tests, setTests] = useState<any>({})
  const [fcMax, setFcMax] = useState(0)
  const [loading, setLoading] = useState(false)
  const [tareasGuardadas, setTareasGuardadas] = useState<any[]>([])
  const [ejerciciosBiblioteca, setEjerciciosBiblioteca] = useState<any[]>([])

  useEffect(() => {
    cargarDatos()
  }, [deportistaId, sesionId])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('fc_maxima').eq('id', deportistaId).single()
    setFcMax(dep?.fc_maxima || 0)
    const { data: t1 } = await supabase.from('test1_carrera').select('vam').eq('id_deportista', deportistaId).order('fecha', { ascending: false }).limit(1)
    const { data: t2 } = await supabase.from('test2_natacion').select('css').eq('id_deportista', deportistaId).order('fecha', { ascending: false }).limit(1)
    const { data: t3 } = await supabase.from('test3_ciclismo').select('ftp').eq('id_deportista', deportistaId).order('fecha', { ascending: false }).limit(1)
    const { data: tf } = await supabase.from('test_fuerza').select('ejercicio, rm_estimado').eq('id_deportista', deportistaId).order('fecha', { ascending: false })
    setTests({ vam: t1?.[0]?.vam, css: t2?.[0]?.css, ftp: t3?.[0]?.ftp, fuerza: tf || [] })
    const { data: ejBib } = await supabase.from('ejercicios_biblioteca').select('*').order('grupo_muscular').order('nombre')
    setEjerciciosBiblioteca(ejBib || [])
    const { data: tar } = await supabase.from('tarea').select('*, p_distancia(*), p_duracion(*), p_repeticiones(*)').eq('id_sesion', sesionId).order('orden')
    console.log('tareas con join:', JSON.stringify(tar?.[0], null, 2))
    setTareasGuardadas(tar || [])
  }

  const nuevaFila = (): FilaTarea => ({
    orden: filas.length + tareasGuardadas.length + 1,
    zona: null,
    disciplina: disciplinaSesion || '',
    series: '',
    descanso: '',
    tipoMedicion: '',
    valorMedicion: '',
    intensidadPersonalizada: '',
    comentario: '',
    grupoMuscular: '',
    intensidadFuerza: '',
    grupoMuscularSel: '',
    ejercicioSelId: '',
    repsFuerza: '',
    rir: '',
    kgFuerza: '',
  })

  const addFila = () => setFilas([...filas, nuevaFila()])

  const updateFila = (i: number, campo: string, valor: string | number | null) => {
    const nuevas = [...filas]
    nuevas[i] = { ...nuevas[i], [campo]: valor }
    setFilas(nuevas)
  }

  const guardarFila = async (i: number) => {
    const f = filas[i]
    setLoading(true)
    const zonaObj = ZONAS.find(z => z.num === f.zona)
    const ref = getReferencia(zonaObj, f.disciplina, tests, fcMax)
    const zonaTexto = zonaObj ? 'Z' + zonaObj.num : ''
    const refTexto = f.intensidadPersonalizada || (ref ? (ref.ritmo || '') + (ref.fc ? ' · ' + ref.fc : '') : '')

    const { data: tarea } = await supabase.from('tarea').insert({
      id_sesion: sesionId,
      zona_entrenamiento: zonaTexto,
      disciplina: f.disciplina || null,
      series: f.series ? Number(f.series) : null,
      descanso_segundos: f.descanso ? Number(f.descanso) : null,
      comentario: refTexto + (f.comentario ? ' · ' + f.comentario : ''),
      orden: f.orden
    }).select().single()

    if (tarea) {
      if (f.disciplina === 'Fuerza' && f.ejercicioSelId) {
        const ejBib = ejerciciosBiblioteca.find((e: any) => e.id === Number(f.ejercicioSelId))
        if (ejBib) await supabase.from('ejercicios').insert({
          id_tarea: tarea.id,
          nombre_ejercicio: ejBib.nombre,
          grupo_muscular: ejBib.grupo_muscular,
          series: f.series ? Number(f.series) : null,
          repeticiones: f.repsFuerza ? Number(f.repsFuerza) : null,
          descanso: f.descanso ? Number(f.descanso) : null,
          notas_ejecucion: f.rir ? 'RIR: ' + f.rir : null,
          url_video: ejBib.url_video || null
        })
        if (f.repsFuerza) await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: Number(f.repsFuerza) })
      } else if (f.tipoMedicion === 'distancia') await supabase.from('p_distancia').insert({ id_tarea: tarea.id, metros_planeados: Number(f.valorMedicion) })
      else if (f.tipoMedicion === 'duracion') await supabase.from('p_duracion').insert({ id_tarea: tarea.id, tiempo_planeado: mmssASeg(f.valorMedicion) })
      else if (f.tipoMedicion === 'repeticiones') await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: Number(f.valorMedicion) })
    }

    const nuevas = [...filas]
    nuevas[i] = { ...nuevas[i], guardado: true }
    setFilas(nuevas)
    await cargarDatos()
    setLoading(false)
  }

  const eliminarFila = (i: number) => {
    setFilas(filas.filter((_, idx) => idx !== i))
  }

  return (
    <div className="mt-4">
      {tareasGuardadas.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="text-left py-2 px-2 w-8">#</th>
                <th className="text-left py-2 px-2">Zona</th>
                <th className="text-left py-2 px-2">Disciplina</th>
                <th className="text-left py-2 px-2">Series</th>
                <th className="text-left py-2 px-2">Descanso</th>
                <th className="text-left py-2 px-2">Medición</th>
                <th className="text-left py-2 px-2">Total</th>
                <th className="text-left py-2 px-2">Referencia / Intensidad</th>
                <th className="text-left py-2 px-2">Notas</th>
              </tr>
            </thead>
            <tbody>
              {tareasGuardadas.map((t, i) => (
                <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="py-2 px-2 text-orange-400 font-bold">{i+1}</td>
                  <td className="py-2 px-2 text-white">{t.zona_entrenamiento || '—'}</td>
                  <td className="py-2 px-2 text-gray-300">{t.disciplina || '—'}</td>
                  <td className="py-2 px-2 text-gray-300">{t.series || '—'}</td>
                  <td className="py-2 px-2 text-gray-300">{t.descanso_segundos ? t.descanso_segundos+'s' : '—'}</td>
                  <td className="py-2 px-2 text-blue-400 font-medium">{mostrarValorGuardado(t)}</td>
                  <td className="py-2 px-2 text-orange-400 font-medium">{mostrarTotal(t)}</td>
                  <td className="py-2 px-2 text-gray-400 text-xs">{t.comentario || '—'}</td>
                  <td className="py-2 px-2 text-gray-500 text-xs">{t.notas_post || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 0 && disciplinaSesion === 'Fuerza' && (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="text-left py-2 px-1 w-8">#</th>
                <th className="text-left py-2 px-1">Músculo / Ejercicio</th>
                <th className="text-left py-2 px-1 w-16">Series</th>
                <th className="text-left py-2 px-1 w-16">Reps</th>
                <th className="text-left py-2 px-1 w-16">Kg</th>
                <th className="text-left py-2 px-1 w-16">RIR</th>
                <th className="text-left py-2 px-1 w-20">Descanso</th>
                <th className="text-left py-2 px-1">Comentario</th>
                <th className="py-2 px-1 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className="py-1 px-1 text-orange-400 font-bold">{f.orden}</td>
                  <td className="py-1 px-1">
                    <div className="flex flex-col gap-1">
                      <select value={f.grupoMuscularSel || ''} onChange={e => updateFila(i, 'grupoMuscularSel', e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500">
                        <option value="">Grupo muscular</option>
                        {[...new Set(ejerciciosBiblioteca.map((e: any) => e.grupo_muscular))].map((g: any) => <option key={g} value={g}>{g}</option>)}
                      </select>
                      {f.grupoMuscularSel && (
                        <select value={f.ejercicioSelId || ''} onChange={e => updateFila(i, 'ejercicioSelId', e.target.value)}
                          className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500">
                          <option value="">Ejercicio</option>
                          {ejerciciosBiblioteca.filter((e: any) => e.grupo_muscular === f.grupoMuscularSel).map((e: any) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1"><input type="number" value={f.series} onChange={e => updateFila(i, 'series', e.target.value)} className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="4" /></td>
                  <td className="py-1 px-1"><input type="number" value={f.repsFuerza || ''} onChange={e => updateFila(i, 'repsFuerza', e.target.value)} className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="10" /></td>
                  <td className="py-1 px-1"><input type="number" value={f.kgFuerza || ''} onChange={e => updateFila(i, 'kgFuerza', e.target.value)} className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="kg" /></td>
                  <td className="py-1 px-1"><input type="number" min="0" max="4" value={f.rir || ''} onChange={e => updateFila(i, 'rir', e.target.value)} className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="0-4" /></td>
                  <td className="py-1 px-1"><input type="number" value={f.descanso} onChange={e => updateFila(i, 'descanso', e.target.value)} className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="60s" /></td>
                  <td className="py-1 px-1"><input type="text" value={f.comentario} onChange={e => updateFila(i, 'comentario', e.target.value)} className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="Notas..." /></td>
                  <td className="py-1 px-1">
                    <div className="flex gap-1">
                      <button onClick={() => guardarFila(i)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition">✓</button>
                      <button onClick={() => eliminarFila(i)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition">×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 0 && disciplinaSesion !== 'Fuerza' && (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="text-left py-2 px-1 w-8">#</th>
                <th className="text-left py-2 px-1 w-32">Zona</th>
                <th className="text-left py-2 px-1 w-28">Disciplina</th>
                <th className="text-left py-2 px-1 w-16">Series</th>
                <th className="text-left py-2 px-1 w-20">Descanso</th>
                <th className="text-left py-2 px-1 w-24">Medicion</th>
                <th className="text-left py-2 px-1 w-20">Valor</th>
                <th className="text-left py-2 px-1">Referencia zona</th>
                <th className="text-left py-2 px-1 w-32">Intensidad propia</th>
                <th className="text-left py-2 px-1 w-32">Comentario</th>
                <th className="py-2 px-1 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const zonaObj = ZONAS.find(z => z.num === f.zona)
                const ref = getReferencia(zonaObj, f.disciplina, tests, fcMax)
                const esFuerza = f.disciplina === 'Fuerza'
                return (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-1 px-1 text-orange-400 font-bold">{f.orden}</td>
                    <td className="py-1 px-1">
                      {!esFuerza ? (
                        <select value={f.zona || ''} onChange={e => updateFila(i, 'zona', e.target.value ? Number(e.target.value) : null)}
                          className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500">
                          <option value="">—</option>
                          {ZONAS.map(z => <option key={z.num} value={z.num}>Z{z.num}</option>)}
                        </select>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <select value={f.grupoMuscularSel || ''} onChange={e => updateFila(i, 'grupoMuscularSel', e.target.value)}
                            className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500">
                            <option value="">Grupo muscular</option>
                            {[...new Set(ejerciciosBiblioteca.map((e: any) => e.grupo_muscular))].map((g: any) => <option key={g} value={g}>{g}</option>)}
                          </select>
                          {f.grupoMuscularSel && (
                            <select value={f.ejercicioSelId || ''} onChange={e => updateFila(i, 'ejercicioSelId', e.target.value)}
                              className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500">
                              <option value="">Ejercicio</option>
                              {ejerciciosBiblioteca.filter((e: any) => e.grupo_muscular === f.grupoMuscularSel).map((e: any) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-1 px-1">
                      <select value={f.disciplina} onChange={e => updateFila(i, 'disciplina', e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500">
                        <option value="">—</option>
                        <option>Natacion</option>
                        <option>Ciclismo</option>
                        <option>Carrera</option>
                        <option>Fuerza</option>
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <input type="number" value={f.series} onChange={e => updateFila(i, 'series', e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="4" />
                    </td>
                    <td className="py-1 px-1">
                      <input type="number" value={f.descanso} onChange={e => updateFila(i, 'descanso', e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="60s" />
                    </td>
                    <td className="py-1 px-1">
                      {!esFuerza ? (
                        <select value={f.tipoMedicion} onChange={e => updateFila(i, 'tipoMedicion', e.target.value)}
                          className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500">
                          <option value="">—</option>
                          <option value="distancia">m</option>
                          <option value="duracion">min</option>
                          <option value="repeticiones">reps</option>
                        </select>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <input type="number" value={f.repsFuerza || ''} onChange={e => updateFila(i, 'repsFuerza', e.target.value)}
                            className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="Reps" />
                          <input type="number" min="0" max="4" value={f.rir || ''} onChange={e => updateFila(i, 'rir', e.target.value)}
                            className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="RIR 0-4" />
                        </div>
                      )}
                    </td>
                    <td className="py-1 px-1">
                      {!esFuerza && <input type="number" value={f.valorMedicion} onChange={e => updateFila(i, 'valorMedicion', e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="200" />}
                    </td>
                    <td className="py-1 px-1">
                      {!esFuerza && ref ? (
                        <div className="text-xs">
                          {ref.ritmo && <p className="text-blue-400">{ref.ritmo}</p>}
                          {ref.fc && <p className="text-gray-400">{ref.fc}</p>}
                        </div>
                      ) : !esFuerza ? <span className="text-gray-600 text-xs">Sin test</span> : null}
                    </td>
                    <td className="py-1 px-1">
                      <input type="text" value={f.intensidadPersonalizada} onChange={e => updateFila(i, 'intensidadPersonalizada', e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="5:45/km" />
                    </td>
                    <td className="py-1 px-1">
                      <input type="text" value={f.comentario} onChange={e => updateFila(i, 'comentario', e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500" placeholder="Notas..." />
                    </td>
                    <td className="py-1 px-1">
                      <div className="flex gap-1">
                        <button onClick={() => guardarFila(i)} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition">✓</button>
                        <button onClick={() => eliminarFila(i)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!esDeportista && <button onClick={addFila} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-2">
        <span>+</span> Añadir tarea
      </button>}
    </div>
  )
}
