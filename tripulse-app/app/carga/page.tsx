'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import CargaPorDisciplina from '@/components/CargaPorDisciplina'
import { calcularSICAT, factorSicat, type SicatResultado } from '@/lib/sicat'
import { calcularSicatZonas, factorSicatZona, attachZonaPico, type SicatZonasResultado } from '@/lib/sicat-zonas'
import { cargarBloques } from '@/lib/atribucion'
import { estimarDuraciones, minutosCarga } from '@/lib/duracion-carga'
import { estadoTSB as estadoTSBBase, type NivelTSB } from '@/lib/panel-metricas'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'
import { useDeclararModulo } from '@/lib/contexto-modulo'

const RANGOS = [
  { label: '4 sem', dias: 28 },
  { label: '8 sem', dias: 56 },
  { label: '16 sem', dias: 112 },
  { label: 'Todo', dias: 365 },
]

function calcularCargas(sesiones: any[], factorFn: (s: any) => number = () => 1) {
  if (!sesiones.length) return []
  const mapa: Record<string, number> = {}
  sesiones.forEach(s => {
    const fecha = s.fecha_sesion
    const carga = (s.rpe_reportado || s.rpe_estimado || 5) * (s.minutos ?? s.duracion_minutos ?? 0) * factorFn(s)
    mapa[fecha] = (mapa[fecha] || 0) + carga
  })
  const fechas = Object.keys(mapa).sort()
  const resultado: any[] = []
  let atl = 0, ctl = 0
  fechas.forEach(fecha => {
    const carga = mapa[fecha] || 0
    atl = carga * (2 / 8) + atl * (1 - 2 / 8)
    ctl = carga * (2 / 43) + ctl * (1 - 2 / 43)
    const tsb = ctl - atl
    resultado.push({ fecha: fecha.slice(5), fechaFull: fecha, carga: Math.round(carga), atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(tsb) })
  })
  return resultado
}

function calcularACWR(datos: any[]) {
  if (datos.length < 8) return null
  const semanaActual = datos.slice(-7).reduce((s, d) => s + d.carga, 0)
  const cuatroSemanas = datos.slice(-35, -7)
  if (!cuatroSemanas.length) return null
  const mediaCronica = cuatroSemanas.reduce((s, d) => s + d.carga, 0) / 4
  return mediaCronica > 0 ? Math.round((semanaActual / mediaCronica) * 100) / 100 : null
}

// Umbrales y etiquetas de lib/panel-metricas: había cuatro copias de esto. El
// fondo se queda aquí porque esta pantalla lo usa más saturado que las otras.
const BG_TSB: Record<NivelTSB, string> = {
  sobrecarga: 'bg-red-900 border-red-500',
  productiva: 'bg-orange-900 border-orange-500',
  transicion: 'bg-yellow-900 border-yellow-500',
  optima: 'bg-green-900 border-green-500',
  desentrenando: 'bg-blue-900 border-blue-500',
}
function estadoTSB(tsb: number) {
  const e = estadoTSBBase(tsb)
  return { label: e.label, color: e.texto, bg: BG_TSB[e.nivel] }
}

function calcularMonotonia(datos: any[]) {
  const ultimos7 = datos.slice(-7)
  if (ultimos7.length < 3) return null
  const media = ultimos7.reduce((s, d) => s + d.carga, 0) / ultimos7.length
  const varianza = ultimos7.reduce((s, d) => s + Math.pow(d.carga - media, 2), 0) / ultimos7.length
  const desv = Math.sqrt(varianza)
  if (desv === 0) return null
  return Math.round((media / desv) * 100) / 100
}

function calcularStrain(datos: any[]) {
  const ultimos7 = datos.slice(-7)
  if (ultimos7.length < 3) return null
  const cargaTotal = ultimos7.reduce((s, d) => s + d.carga, 0)
  const monotonia = calcularMonotonia(datos)
  if (!monotonia) return null
  return Math.round(cargaTotal * monotonia)
}

function estadoMonotonia(m: number) {
  if (m < 1.5) return { label: 'Buena variación', color: 'text-green-400' }
  if (m <= 2.0) return { label: 'Variación moderada', color: 'text-yellow-400' }
  return { label: 'Alta monotonía', color: 'text-red-400' }
}

function estadoACWR(acwr: number) {
  if (acwr < 0.8)  return { label: 'Subcarga', color: 'text-blue-400' }
  if (acwr <= 1.3) return { label: 'Zona óptima', color: 'text-green-400' }
  if (acwr <= 1.5) return { label: 'Precaución', color: 'text-yellow-400' }
  return { label: 'Peligro', color: 'text-red-400' }
}

export default function CargaPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [sesionesRaw, setSesionesRaw] = useState<any[]>([])
  const [rango, setRango] = useState(56)
  const [loading, setLoading] = useState(true)
  const [loadingDatos, setLoadingDatos] = useState(false)
  const [mostrarCarga, setMostrarCarga] = useState(false)
  const [pestana, setPestana] = useState<'global'|'disciplina'|'diaria'>('global')
  const [diariaRaw, setDiariaRaw] = useState<any[]>([])
  const [usarSicat, setUsarSicat] = useState(true)
  const [sicat, setSicat] = useState<SicatResultado | null>(null)
  const [zonasRes, setZonasRes] = useState<SicatZonasResultado | null>(null)
  const [pondZona, setPondZona] = useState(false)
  const [abreRef, setAbreRef] = useState(false)
  // Ponderación por zona: se activa desde el módulo SICAT (/eco) y se lee aquí.
  useEffect(() => { setPondZona(typeof window !== 'undefined' && localStorage.getItem('sicat_pond_zona') === '1') }, [])
  const factorFn = (s: any) => {
    if (!usarSicat) return 1
    if (pondZona && s?.zonaPico) {
      const fz = factorSicatZona(s.disciplina, s.zonaPico, zonasRes)
      if (fz != null) return fz
    }
    return factorSicat(s.disciplina, sicat)
  }

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(deps || [])
      setLoading(false)
      const act = getAtletaActivo()
      const d0 = (deps || []).find(d => d.id === act)
      if (d0) verCarga(d0, 56)
    }
    cargar()
  }, [])

  const verCarga = async (dep: any, dias: number) => {
    setSeleccionado(dep)
    setAtletaActivo(dep.id)
    setLoadingDatos(true)
    setSicat(null)
    setZonasRes(null)
    calcularSICAT(dep).then(setSicat)
    calcularSicatZonas(dep).then(setZonasRes)
    const desde = new Date()
    desde.setDate(desde.getDate() - dias - 42)
    const { data: micros } = await supabase
      .from('microciclo')
      .select('id, mesociclo(id, macrociclo(id_deportista))')
    const microsDelDep = (micros || []).filter((m: any) =>
      m.mesociclo?.macrociclo?.id_deportista === dep.id
    ).map((m: any) => m.id)
    const desdeStr = desde.toISOString().split('T')[0]
    let baseSes: any[] = []
    if (microsDelDep.length > 0) {
      const { data: ses } = await supabase
        .from('sesion')
        .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real, estado')
        .in('id_microciclo', microsDelDep)
        .eq('estado', 'Realizada')
        .gte('fecha_sesion', desdeStr)
        .order('fecha_sesion')
      baseSes = ses || []
    }
    // Sesiones "libres" del atleta (sin microciclo) también cuentan en la carga.
    const { data: libres } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real, estado')
      .eq('id_deportista', dep.id).is('id_microciclo', null)
      .eq('estado', 'Realizada').gte('fecha_sesion', desdeStr)
    const todasSesiones = await attachZonaPico([...baseSes, ...(libres || [])])
    // Minutos de cada sesión por el criterio único (real > manual > estimada). Antes se
    // leía `duracion_minutos` a pelo y una sesión sin duración manual valía 0 UA: no
    // sumaba a CTL/ATL/TSB aunque tuviera el entreno entero planificado.
    const [t1, t2, t3] = await Promise.all([
      supabase.from('test1_carrera').select('vam').not('vam', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
      supabase.from('test2_natacion').select('css').not('css', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
      supabase.from('test3_ciclismo').select('ftp').not('ftp', 'is', null).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1),
    ])
    const tests = { vam: t1.data?.[0]?.vam || null, css: t2.data?.[0]?.css || null, ftp: t3.data?.[0]?.ftp || null }
    const estimaciones = await estimarDuraciones(supabase, todasSesiones.map(s => s.id), tests)
    setSesionesRaw(todasSesiones.map(s => ({ ...s, minutos: minutosCarga(s, estimaciones[s.id]) })))
    setLoadingDatos(false)
  }

  const cambiarRango = (dias: number) => {
    setRango(dias)
    if (seleccionado) verCarga(seleccionado, dias)
  }

  const datos = useMemo(() => calcularCargas(sesionesRaw, factorFn).slice(-rango), [sesionesRaw, rango, usarSicat, sicat, pondZona, zonasRes])
  const ultimo = datos[datos.length - 1]
  const acwr = calcularACWR(datos)
  const monotonia = calcularMonotonia(datos)
  const strain = calcularStrain(datos)

  // Lo que el asistente ve de esta pantalla (ver lib/contexto-modulo). Se le dan los
  // números Y su lectura según los umbrales de la app, para que no invente otra.
  useDeclararModulo('Carga', seleccionado && ultimo
    ? [
        `Carga de ${seleccionado.nombre}, últimas ${Math.round(rango / 7)} semanas${usarSicat ? ' (ponderada por SICAT)' : ''}:`,
        `CTL ${ultimo.ctl}, ATL ${ultimo.atl}, TSB ${ultimo.tsb > 0 ? '+' : ''}${ultimo.tsb} → ${estadoTSB(ultimo.tsb).label}.`,
        acwr ? `ACWR ${acwr} → ${estadoACWR(acwr).label}.` : 'ACWR sin datos suficientes.',
        monotonia ? `Monotonía ${monotonia} → ${estadoMonotonia(monotonia).label}.` : 'Monotonía sin datos suficientes.',
        strain ? `Strain ${strain}.` : '',
        `Pestaña abierta: ${pestana === 'global' ? 'carga global' : pestana === 'disciplina' ? 'por disciplina' : 'visión diaria'}.`,
      ].filter(Boolean).join(' ')
    : '')

  const cargarDiaria = async (dep: any) => {
    const desde = new Date()
    desde.setDate(desde.getDate() - 30)
    const desdeStr = desde.toISOString().split('T')[0]

    // Cadena de plan opcional: un atleta sin plan igual tiene sesiones libres, que
    // también cuentan en la visión diaria. No cortar si la cadena está vacía.
    const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
    const macroIds = (macros || []).map((m: any) => m.id)
    let microsDelDep: number[] = []
    if (macroIds.length) {
      const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
      const mesoIds = (mesos || []).map((m: any) => m.id)
      if (mesoIds.length) {
        const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
        microsDelDep = (micros || []).map((m: any) => m.id)
      }
    }

    const { data: sesiones } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real, estado')
      .in('id_microciclo', microsDelDep.length ? microsDelDep : [-1])
      .gte('fecha_sesion', desdeStr)
      .order('fecha_sesion')
    const { data: libresD } = await supabase
      .from('sesion')
      .select('id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real, estado')
      .eq('id_deportista', dep.id).is('id_microciclo', null).gte('fecha_sesion', desdeStr)

    const sesDia = [...(sesiones || []), ...(libresD || [])]
    const conZona = await attachZonaPico(sesDia)

    // Reparto de la UA de cada sesión entre los deportes de sus BLOQUES. En una sesión
    // normal es [{su deporte, 1}] → los números de siempre no se mueven. En un brick, la
    // bici y la carrera se llevan su parte; si no, su UA no contaría en ninguna disciplina
    // (sesion.disciplina vale 'Brick', que no es un deporte — ver lib/atribucion).
    // usarRpeDeBloque: la UA de aquí solo sirve de PESO para repartir (la absoluta se
    // calcula abajo). En un brick, el RPE real de cada bloque es lo que reparte bien.
    const bloques = await cargarBloques(supabase, sesDia, { estimar: false, usarRpeDeBloque: true })
    const uaSes: Record<number, number> = {}
    bloques.forEach(b => { uaSes[b.id_sesion] = (uaSes[b.id_sesion] || 0) + b.ua })
    const reparto: Record<number, { disciplina: string; peso: number }[]> = {}
    bloques.forEach(b => {
      const total = uaSes[b.id_sesion]
      if (!total) return
      ;(reparto[b.id_sesion] ||= []).push({ disciplina: b.disciplina, peso: b.ua / total })
    })

    setDiariaRaw(conZona.map(s => ({
      ...s,
      _reparto: reparto[s.id] || [{ disciplina: s.disciplina, peso: 1 }],
    })))
  }

  const datosDiarios = useMemo(() => {
    const dias: any[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const fechaStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })

      const sesDia = diariaRaw.filter(s => s.fecha_sesion === fechaStr)
      const planificadas = sesDia.filter(s => s.estado === 'Planificada')
      const realizadas = sesDia.filter(s => s.estado === 'Realizada')

      const uaPlanificada = planificadas.reduce((acc, s) =>
        acc + (s.rpe_estimado || 5) * (s.minutos ?? s.duracion_minutos ?? 0) * factorFn(s), 0)

      // Por el deporte del BLOQUE, no por sesion.disciplina: un brick reparte su UA
      // entre la bici y la carrera según el peso de cada bloque.
      const uaPorDisc = (disc: string) => realizadas.reduce((acc, s) => {
        const ua = (s.rpe_reportado || s.rpe_estimado || 5) * (s.minutos ?? s.duracion_minutos ?? 0) * factorFn(s)
        const parte = (s._reparto || []).filter((r: any) => r.disciplina === disc)
          .reduce((a: number, r: any) => a + r.peso, 0)
        return acc + ua * parte
      }, 0)
      const uaNatacion = uaPorDisc('Natacion')
      const uaCiclismo = uaPorDisc('Ciclismo')
      const uaCarrera = uaPorDisc('Carrera')
      const uaFuerza = uaPorDisc('Fuerza')

      dias.push({
        fecha: label,
        planificada: Math.round(uaPlanificada),
        Natacion: Math.round(uaNatacion),
        Ciclismo: Math.round(uaCiclismo),
        Carrera: Math.round(uaCarrera),
        Fuerza: Math.round(uaFuerza),
        total: Math.round(uaNatacion + uaCiclismo + uaCarrera + uaFuerza),
      })
    }
    return dias
  }, [diariaRaw, usarSicat, sicat, pondZona, zonasRes])

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-44 pr-5 h-[54px] flex justify-between items-center border-b border-gray-800 gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight leading-none">Carga de entrenamiento</h2>
          {seleccionado && (
            /* El botón va FUERA del truncate. Estando dentro, en móvil el nombre
               se comía el ancho y "cambiar" quedaba recortado fuera de la
               pantalla: no había forma de cambiar de deportista desde el teléfono.
               Ahora se acorta el nombre, que es lo prescindible. */
            <>
              <span className="text-[12.5px] text-gray-500 truncate min-w-0">{seleccionado.nombre}</span>
              <button onClick={() => setSeleccionado(null)}
                className="text-[12.5px] text-orange-400 hover:text-orange-300 transition flex-none">cambiar</button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 flex-none">
          {/* El SICAT era una barra propia de 60px con un párrafo largo: pasa a un
              conmutador con el porqué en el title. */}
          {seleccionado && (
            <button onClick={() => setUsarSicat(v => !v)}
              title={usarSicat
                ? (pondZona
                    ? 'La carga (UA) se pondera por disciplina y por zona de entrenamiento (donde hay datos, n≥3).'
                    : 'La carga (UA) se pondera según el coste real de cada disciplina para este atleta.')
                : 'Carga sin ponderar — 1 min de RPE-X vale igual en cualquier disciplina.'}
              className={'px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold transition ' +
                (usarSicat ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
              🔬 SICAT{usarSicat && pondZona ? ' · zona' : ''}
            </button>
          )}
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
        </div>
      </nav>
      <div className="max-w-[1400px] mx-auto px-6 py-6">

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-gray-800 mb-6">
          <button onClick={() => setPestana('global')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'global' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            📈 Carga global
          </button>
          <button onClick={() => setPestana('disciplina')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'disciplina' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            🏊 Por disciplina
          </button>
          <button onClick={() => { setPestana('diaria'); if (seleccionado) cargarDiaria(seleccionado) }}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' +
              (pestana === 'diaria' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            📅 Visión diaria
          </button>
        </div>

        {/* Selector de deportista: solo cuando no hay uno activo */}
        {!seleccionado && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => { setRango(56); verCarga(d, 56) }}
                className="tp-card tp-tile p-5" style={{ ['--c' as any]: '#f97316' }}>
                <h3 className="font-bold text-[15px] tracking-tight">{d.nombre}</h3>
                <p className="text-[12px] text-gray-500 mt-1">{d.sexo || 'Sin especificar'} · FC máx {d.fc_maxima || '—'} ppm</p>
              </button>
            ))}
            {deportistas.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">📈</div>
                <p>No tienes deportistas todavía.</p>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA VISIÓN DIARIA */}
        {pestana === 'diaria' && (
          <div>
            {!seleccionado ? (
              <div className="text-center py-12 text-gray-500">Selecciona un deportista arriba.</div>
            ) : datosDiarios.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay sesiones en los últimos 30 días.</div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="tp-card p-5">
                  <p className="text-sm font-medium text-gray-300 mb-1">Carga diaria — últimos 30 días</p>
                  <p className="text-xs text-gray-500 mb-4">UA = RPE × duración · Barra transparente = carga planificada</p>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={datosDiarios} barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 9 }} interval={2} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit=" UA" />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                      <Bar dataKey="planificada" fill="#ffffff" fillOpacity={0.08} name="Planificada" radius={[2,2,0,0]} />
                      <Bar dataKey="Natacion" stackId="real" fill="#60a5fa" name="Natación" radius={[0,0,0,0]} />
                      <Bar dataKey="Ciclismo" stackId="real" fill="#fbbf24" name="Ciclismo" radius={[0,0,0,0]} />
                      <Bar dataKey="Carrera" stackId="real" fill="#4ade80" name="Carrera" radius={[0,0,0,0]} />
                      <Bar dataKey="Fuerza" stackId="real" fill="#f87171" name="Fuerza" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Resumen del mes */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: 'Natacion', label: 'Natación', color: 'text-blue-400' },
                    { key: 'Ciclismo', label: 'Ciclismo', color: 'text-yellow-400' },
                    { key: 'Carrera', label: 'Carrera', color: 'text-green-400' },
                    { key: 'Fuerza', label: 'Fuerza', color: 'text-red-400' },
                  ].map(d => {
                    const total = datosDiarios.reduce((acc, dia) => acc + (dia[d.key] || 0), 0)
                    const diasActivos = datosDiarios.filter(dia => dia[d.key] > 0).length
                    return (
                      <div key={d.key} className="tp-card p-4">
                        <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                        <p className={'text-xl font-bold ' + d.color}>{Math.round(total)} UA</p>
                        <p className="text-xs text-gray-600 mt-1">{diasActivos} días activos</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA POR DISCIPLINA */}
        {pestana === 'disciplina' && (
          <div>
            {seleccionado
              ? <CargaPorDisciplina depId={seleccionado.id} diasRango={rango} sicat={usarSicat ? sicat : null} />
              : <div className="text-center py-12 text-gray-500"><p>Selecciona un deportista arriba para ver la carga por disciplina.</p></div>
            }
          </div>
        )}

        {/* PESTAÑA GLOBAL */}
        {pestana === 'global' && seleccionado && (
          <div>
            {loadingDatos ? (
              <div className="text-center py-16 text-gray-400">Calculando cargas...</div>
            ) : datos.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">📊</div>
                <p>No hay sesiones realizadas todavía para {seleccionado.nombre}.</p>
                <p className="text-sm mt-2 text-gray-600">Las sesiones deben estar marcadas como "Realizada".</p>
              </div>
            ) : (
              <div>
                {ultimo && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                    <div className="tp-card p-4">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">CTL — Forma</p>
                      <p className="text-2xl font-bold text-orange-400">{ultimo.ctl}</p>
                      <p className="text-xs text-gray-500 mt-1">Carga crónica 42d</p>
                    </div>
                    <div className="tp-card p-4">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">ATL — Fatiga</p>
                      <p className="text-2xl font-bold text-red-400">{ultimo.atl}</p>
                      <p className="text-xs text-gray-500 mt-1">Carga aguda 7d</p>
                    </div>
                    <div className={'rounded-xl p-4 border ' + estadoTSB(ultimo.tsb).bg}>
                      <p className="text-xs text-gray-300 mb-1 uppercase tracking-wide">TSB — Frescura</p>
                      <p className={'text-2xl font-bold ' + estadoTSB(ultimo.tsb).color}>{ultimo.tsb > 0 ? '+' : ''}{ultimo.tsb}</p>
                      <p className={'text-xs mt-1 ' + estadoTSB(ultimo.tsb).color}>{estadoTSB(ultimo.tsb).label}</p>
                    </div>
                    <div className="tp-card p-4">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">ACWR — Ratio</p>
                      {acwr ? (
                        <>
                          <p className={'text-2xl font-bold ' + estadoACWR(acwr).color}>{acwr}</p>
                          <p className={'text-xs mt-1 ' + estadoACWR(acwr).color}>{estadoACWR(acwr).label}</p>
                        </>
                      ) : <p className="text-gray-500 text-sm mt-2">Sin datos suficientes</p>}
                    </div>
                    <div className="tp-card p-4">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Monotonía</p>
                      {monotonia ? (
                        <>
                          <p className={'text-2xl font-bold ' + estadoMonotonia(monotonia).color}>{monotonia}</p>
                          <p className={'text-xs mt-1 ' + estadoMonotonia(monotonia).color}>{estadoMonotonia(monotonia).label}</p>
                        </>
                      ) : <p className="text-gray-500 text-sm mt-2">Sin datos suficientes</p>}
                    </div>
                    <div className="tp-card p-4">
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Strain</p>
                      {strain ? (
                        <>
                          <p className="text-2xl font-bold text-purple-400">{strain}</p>
                          <p className="text-xs mt-1 text-gray-500">Carga × monotonía semanal</p>
                        </>
                      ) : <p className="text-gray-500 text-sm mt-2">Sin datos suficientes</p>}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mb-4 flex-wrap items-center">
                  <p className="text-gray-500 text-xs uppercase tracking-wide mr-2">Período</p>
                  {RANGOS.map(r => (
                    <button key={r.dias} onClick={() => cambiarRango(r.dias)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                        (rango === r.dias ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                      {r.label}
                    </button>
                  ))}
                  <button onClick={() => setMostrarCarga(!mostrarCarga)}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ml-2 ' +
                      (mostrarCarga ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                    {mostrarCarga ? 'Ocultar carga diaria' : 'Ver carga diaria'}
                  </button>
                </div>

                <div className="tp-card p-4 mb-4">
                  <p className="text-sm font-medium text-gray-300 mb-3">Forma · Fatiga · Frescura</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={datos}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} interval={Math.floor(datos.length / 6)} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                      <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="ctl" stroke="#f97316" strokeWidth={2} dot={false} name="CTL (forma)" />
                      <Line type="monotone" dataKey="atl" stroke="#f87171" strokeWidth={2} dot={false} name="ATL (fatiga)" />
                      <Line type="monotone" dataKey="tsb" stroke="#4ade80" strokeWidth={2} dot={false} name="TSB (frescura)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {mostrarCarga && (
                  <div className="tp-card p-4 mb-4">
                    <p className="text-sm font-medium text-gray-300 mb-3">Carga diaria (UA)</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={datos}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} interval={Math.floor(datos.length / 6)} />
                        <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                        <Line type="monotone" dataKey="carga" stroke="#a78bfa" strokeWidth={2} dot={false} name="Carga (UA)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Las tablas de referencia se consultan de tanto en tanto, no en cada
                    visita: plegadas dejan de competir con las gráficas. */}
                <button onClick={() => setAbreRef(v => !v)}
                  className="tp-card w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition text-left">
                  <span className="flex items-center gap-3 flex-wrap">
                    <strong className="text-[13px] font-semibold">📖 Cómo leer estos números</strong>
                    <span className="text-[12px] text-gray-500">Monotonía · Strain · ACWR</span>
                  </span>
                  <span className={'text-gray-500 text-xs tp-chev' + (abreRef ? ' open' : '')}>▼</span>
                </button>

                {abreRef && (
                  <div className="flex flex-col gap-3 mt-3">
                    <div className="tp-card p-4">
                      <p className="text-sm font-medium text-gray-300 mb-3">Monotonía y Strain</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        {[
                          { rango: '< 1.5', zona: 'Buena variación', color: 'text-green-400', desc: 'Distribución correcta' },
                          { rango: '1.5 – 2.0', zona: 'Moderada', color: 'text-yellow-400', desc: 'Vigilar variación' },
                          { rango: '> 2.0', zona: 'Alta monotonía', color: 'text-red-400', desc: 'Reestructurar semana' },
                        ].map(z => (
                          <div key={z.zona} className="bg-gray-800/60 rounded-lg p-3">
                            <p className={'font-bold mb-0.5 ' + z.color}>{z.rango}</p>
                            <p className="text-gray-300 font-medium">{z.zona}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{z.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="tp-card p-4">
                      <p className="text-sm font-medium text-gray-300 mb-3">ACWR</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {[
                          { rango: '< 0.8', zona: 'Subcarga', color: 'text-blue-400', desc: 'Riesgo pérdida de forma' },
                          { rango: '0.8 – 1.3', zona: 'Óptimo', color: 'text-green-400', desc: 'Incremento coherente' },
                          { rango: '1.3 – 1.5', zona: 'Precaución', color: 'text-yellow-400', desc: 'Vigilar evolución' },
                          { rango: '> 1.5', zona: 'Peligro', color: 'text-red-400', desc: 'Reducir carga' },
                        ].map(z => (
                          <div key={z.zona} className="bg-gray-800/60 rounded-lg p-3">
                            <p className={'font-bold mb-0.5 ' + z.color}>{z.rango}</p>
                            <p className="text-gray-300 font-medium">{z.zona}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{z.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

