'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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

function mmssASeg(str: string): number {
  const p = str.split(':')
  if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0)
  return parseInt(str) || 0
}

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

const ZONAS_REF: Record<number, { ftpPct: [number,number], vamPct: [number,number], cssPct: [number,number] }> = {
  1: { ftpPct: [0,55],    vamPct: [0,65],   cssPct: [0,65]  },
  2: { ftpPct: [56,75],   vamPct: [65,75],  cssPct: [65,75] },
  3: { ftpPct: [76,90],   vamPct: [76,85],  cssPct: [76,85] },
  4: { ftpPct: [91,105],  vamPct: [86,95],  cssPct: [86,95] },
  5: { ftpPct: [106,120], vamPct: [96,105], cssPct: [96,105]},
  6: { ftpPct: [121,150], vamPct: [106,120],cssPct: [106,120]},
  7: { ftpPct: [151,200], vamPct: [121,150],cssPct: [121,150]},
}

function getReferencia(zona: any, disciplina: string, tests: any, fcMax: number) {
  if (!zona) return null
  const ref = ZONAS_REF[zona.num]
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
  } else if (disciplina === 'Natacion') {
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

interface FilaResistencia {
  orden: number
  zona: number | null
  disciplina: string
  series: string
  descanso: string
  tipoMedicion: string
  valorMedicion: string
  intensidadPersonalizada: string
  comentario: string
  guardado?: boolean
}

interface FilaFuerza {
  orden: number
  grupoMuscularSel: string
  ejercicioSelId: string
  series: string
  repsFuerza: string
  kgFuerza: string
  rir: string
  descanso: string
  comentario: string
  guardado?: boolean
}

export default function TareasTabla({ sesionId, deportistaId, disciplinaSesion, esDeportista }: {
  sesionId: number
  deportistaId: number
  disciplinaSesion: string
  esDeportista?: boolean
}) {
  const esFuerza = disciplinaSesion === 'Fuerza'
  const [filasR, setFilasR] = useState<FilaResistencia[]>([])
  const [filasF, setFilasF] = useState<FilaFuerza[]>([])
  const [tests, setTests] = useState<any>({})
  const [fcMax, setFcMax] = useState(0)
  const [loading, setLoading] = useState(false)
  const [tareasGuardadas, setTareasGuardadas] = useState<any[]>([])
  const [ejerciciosBiblioteca, setEjerciciosBiblioteca] = useState<any[]>([])

  useEffect(() => { cargarDatos() }, [deportistaId, sesionId])

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
    setTareasGuardadas(tar || [])
  }

  const nuevaFilaR = (): FilaResistencia => ({
    orden: filasR.length + tareasGuardadas.length + 1,
    zona: null, disciplina: disciplinaSesion || '',
    series: '', descanso: '', tipoMedicion: '', valorMedicion: '',
    intensidadPersonalizada: '', comentario: '',
  })

  const nuevaFilaF = (): FilaFuerza => ({
    orden: filasF.length + tareasGuardadas.length + 1,
    grupoMuscularSel: '', ejercicioSelId: '',
    series: '', repsFuerza: '', kgFuerza: '', rir: '', descanso: '', comentario: '',
  })

  const updateR = (i: number, key: string, val: any) => {
    const n = [...filasR]; (n[i] as any)[key] = val; setFilasR(n)
  }
  const updateF = (i: number, key: string, val: any) => {
    const n = [...filasF]; (n[i] as any)[key] = val; setFilasF(n)
  }

  const guardarFilaR = async (i: number) => {
    const f = filasR[i]
    setLoading(true)
    const { data: tarea } = await supabase.from('tarea').insert({
      id_sesion: sesionId, zona_entrenamiento: f.zona ? 'Z' + f.zona : null,
      disciplina: f.disciplina, series: f.series ? Number(f.series) : null,
      descanso_segundos: f.descanso ? Number(f.descanso) : null,
      comentario: f.comentario || null, orden: f.orden
    }).select().single()
    if (tarea) {
      if (f.tipoMedicion === 'distancia') await supabase.from('p_distancia').insert({ id_tarea: tarea.id, metros_planeados: Number(f.valorMedicion) })
      else if (f.tipoMedicion === 'duracion') await supabase.from('p_duracion').insert({ id_tarea: tarea.id, tiempo_planeado: mmssASeg(f.valorMedicion) })
      else if (f.tipoMedicion === 'repeticiones') await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: Number(f.valorMedicion) })
    }
    const n = [...filasR]; n[i] = { ...n[i], guardado: true }; setFilasR(n)
    await cargarDatos()
    setFilasR(prev => prev.filter((_, idx) => idx !== i))
    setLoading(false)
  }

  const guardarFilaF = async (i: number) => {
    const f = filasF[i]
    if (!f.ejercicioSelId) return
    setLoading(true)
    const ejBib = ejerciciosBiblioteca.find(e => e.id === Number(f.ejercicioSelId))
    const { data: tarea } = await supabase.from('tarea').insert({
      id_sesion: sesionId, disciplina: 'Fuerza',
      series: f.series ? Number(f.series) : null,
      descanso_segundos: f.descanso ? Number(f.descanso) : null,
      comentario: f.comentario || null, orden: f.orden
    }).select().single()
    if (tarea && ejBib) {
      await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre_ejercicio: ejBib.nombre,
        grupo_muscular: ejBib.grupo_muscular,
        series: f.series ? Number(f.series) : null,
        repeticiones: f.repsFuerza ? Number(f.repsFuerza) : null,
        intensidad: f.kgFuerza ? Number(f.kgFuerza) : null,
        descanso: f.descanso ? Number(f.descanso) : null,
        notas_ejecucion: [f.rir ? 'RIR: ' + f.rir : '', f.comentario || ''].filter(Boolean).join(' · '),
        url_video: ejBib.url_video || null
      })
      if (f.repsFuerza) await supabase.from('p_repeticiones').insert({ id_tarea: tarea.id, repeticiones_planteadas: Number(f.repsFuerza) })
    }
    await cargarDatos()
    setFilasF(prev => prev.filter((_, idx) => idx !== i))
    setLoading(false)
  }

  const inputCls = "bg-gray-800 text-white text-xs rounded px-2 py-1 w-full outline-none focus:ring-1 focus:ring-orange-500"

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
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tareasGuardadas.map((t, i) => {
                const zonaObj = ZONAS.find(z => z.num === parseInt(t.zona_entrenamiento?.replace('Z', '') || '0'))
                const ref = getReferencia(zonaObj, t.disciplina, tests, fcMax)
                return (
                  <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800">
                    <td className="py-2 px-2 text-orange-400 font-bold">{i + 1}</td>
                    {esFuerza ? (
                      <>
                        <td className="py-2 px-2 text-white">{t.comentario || '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.series || '—'}</td>
                        <td className="py-2 px-2 text-blue-400">{mostrarValorGuardado(t)}</td>
                        <td className="py-2 px-2 text-gray-300">—</td>
                        <td className="py-2 px-2 text-gray-300">—</td>
                        <td className="py-2 px-2 text-gray-300">{t.descanso_segundos ? t.descanso_segundos + 's' : '—'}</td>
                        <td className="py-2 px-2 text-gray-500 text-xs">{t.notas_post || ''}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 px-2 text-white">{t.zona_entrenamiento || '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.disciplina || '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.series || '—'}</td>
                        <td className="py-2 px-2 text-gray-300">{t.descanso_segundos ? t.descanso_segundos + 's' : '—'}</td>
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
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="text-left py-2 px-1 w-8">#</th>
                <th className="text-left py-2 px-1 w-28">Zona</th>
                <th className="text-left py-2 px-1 w-28">Disciplina</th>
                <th className="text-left py-2 px-1 w-16">Series</th>
                <th className="text-left py-2 px-1 w-20">Descanso</th>
                <th className="text-left py-2 px-1 w-24">Medición</th>
                <th className="text-left py-2 px-1 w-20">Valor</th>
                <th className="text-left py-2 px-1">Ref. zona</th>
                <th className="text-left py-2 px-1 w-28">Intens. propia</th>
                <th className="text-left py-2 px-1 w-28">Comentario</th>
                <th className="py-2 px-1 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filasR.map((f, i) => {
                const zonaObj = ZONAS.find(z => z.num === f.zona)
                const ref = getReferencia(zonaObj, f.disciplina, tests, fcMax)
                return (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-1 px-1 text-orange-400 font-bold">{f.orden}</td>
                    <td className="py-1 px-1">
                      <select value={f.zona || ''} onChange={e => updateR(i, 'zona', e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                        <option value="">—</option>
                        {ZONAS.map(z => <option key={z.num} value={z.num}>Z{z.num}</option>)}
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <select value={f.disciplina} onChange={e => updateR(i, 'disciplina', e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        <option>Natacion</option><option>Ciclismo</option><option>Carrera</option>
                      </select>
                    </td>
                    <td className="py-1 px-1"><input type="number" value={f.series} onChange={e => updateR(i, 'series', e.target.value)} className={inputCls} placeholder="4" /></td>
                    <td className="py-1 px-1"><input type="number" value={f.descanso} onChange={e => updateR(i, 'descanso', e.target.value)} className={inputCls} placeholder="60" /></td>
                    <td className="py-1 px-1">
                      <select value={f.tipoMedicion} onChange={e => updateR(i, 'tipoMedicion', e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        <option value="distancia">m</option>
                        <option value="duracion">min</option>
                        <option value="repeticiones">reps</option>
                      </select>
                    </td>
                    <td className="py-1 px-1"><input type="text" value={f.valorMedicion} onChange={e => updateR(i, 'valorMedicion', e.target.value)} className={inputCls} placeholder="200" /></td>
                    <td className="py-1 px-1 text-xs">
                      {ref?.porcentaje && <p className="text-orange-400">{ref.porcentaje}</p>}
                      {ref?.ritmo && <p className="text-blue-400">{ref.ritmo}</p>}
                      {ref?.fc && <p className="text-gray-400">{ref.fc}</p>}
                      {ref?.rpe && <p className="text-gray-500">{ref.rpe}</p>}
                    </td>
                    <td className="py-1 px-1"><input type="text" value={f.intensidadPersonalizada} onChange={e => updateR(i, 'intensidadPersonalizada', e.target.value)} className={inputCls} placeholder="Intens..." /></td>
                    <td className="py-1 px-1"><input type="text" value={f.comentario} onChange={e => updateR(i, 'comentario', e.target.value)} className={inputCls} placeholder="Notas..." /></td>
                    <td className="py-1 px-1">
                      <div className="flex gap-1">
                        <button onClick={() => guardarFilaR(i)} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition">✓</button>
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
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="text-left py-2 px-1 w-8">#</th>
                <th className="text-left py-2 px-1">Músculo / Ejercicio</th>
                <th className="text-left py-2 px-1 w-16">Series</th>
                <th className="text-left py-2 px-1 w-16">Reps</th>
                <th className="text-left py-2 px-1 w-16">Kg</th>
                <th className="text-left py-2 px-1 w-14">RIR</th>
                <th className="text-left py-2 px-1 w-20">Descanso</th>
                <th className="text-left py-2 px-1">Comentario</th>
                <th className="py-2 px-1 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filasF.map((f, i) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className="py-1 px-1 text-orange-400 font-bold">{f.orden}</td>
                  <td className="py-1 px-1">
                    <div className="flex flex-col gap-1">
                      <select value={f.grupoMuscularSel} onChange={e => updateF(i, 'grupoMuscularSel', e.target.value)} className={inputCls}>
                        <option value="">Grupo muscular</option>
                        {[...new Set(ejerciciosBiblioteca.map(e => e.grupo_muscular))].map(g => <option key={g as string} value={g as string}>{g as string}</option>)}
                      </select>
                      {f.grupoMuscularSel && (
                        <select value={f.ejercicioSelId} onChange={e => updateF(i, 'ejercicioSelId', e.target.value)} className={inputCls}>
                          <option value="">Ejercicio</option>
                          {ejerciciosBiblioteca.filter(e => e.grupo_muscular === f.grupoMuscularSel).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1"><input type="number" value={f.series} onChange={e => updateF(i, 'series', e.target.value)} className={inputCls} placeholder="4" /></td>
                  <td className="py-1 px-1"><input type="number" value={f.repsFuerza} onChange={e => updateF(i, 'repsFuerza', e.target.value)} className={inputCls} placeholder="10" /></td>
                  <td className="py-1 px-1"><input type="number" value={f.kgFuerza} onChange={e => updateF(i, 'kgFuerza', e.target.value)} className={inputCls} placeholder="kg" /></td>
                  <td className="py-1 px-1"><input type="number" min="0" max="4" value={f.rir} onChange={e => updateF(i, 'rir', e.target.value)} className={inputCls} placeholder="0-4" /></td>
                  <td className="py-1 px-1"><input type="number" value={f.descanso} onChange={e => updateF(i, 'descanso', e.target.value)} className={inputCls} placeholder="60" /></td>
                  <td className="py-1 px-1"><input type="text" value={f.comentario} onChange={e => updateF(i, 'comentario', e.target.value)} className={inputCls} placeholder="Notas..." /></td>
                  <td className="py-1 px-1">
                    <div className="flex gap-1">
                      <button onClick={() => guardarFilaF(i)} disabled={loading || !f.ejercicioSelId} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded transition disabled:opacity-40">✓</button>
                      <button onClick={() => setFilasF(prev => prev.filter((_, idx) => idx !== i))} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition">×</button>
                    </div>
                  </td>
                </tr>
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
