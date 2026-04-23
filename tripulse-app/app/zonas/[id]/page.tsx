'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

function formatRitmoKm(velocidadKmh: number): string {
  const segPorKm = 3600 / velocidadKmh
  const min = Math.floor(segPorKm / 60)
  const seg = Math.round(segPorKm % 60)
  return `${min}:${seg.toString().padStart(2, '0')} /km`
}

function formatRitmo100m(velocidadMs: number): string {
  const segPor100m = 100 / velocidadMs
  const min = Math.floor(segPor100m / 60)
  const seg = Math.round(segPor100m % 60)
  return `${min}:${seg.toString().padStart(2, '0')} /100m`
}

const colorZona = (n: number) => {
  const colores = ['','bg-blue-900 text-blue-300','bg-green-900 text-green-300','bg-yellow-900 text-yellow-300','bg-orange-900 text-orange-300','bg-red-900 text-red-300','bg-purple-900 text-purple-300','bg-pink-900 text-pink-300']
  return colores[n] || 'bg-gray-700 text-gray-300'
}

function zonasCarrera(vam: number, fcMax: number) {
  const zonas = [
    { numero: 1, nombre: 'Recuperacion activa', fcInf: 0, fcSup: 75, rpeInf: 2, rpeSup: 3 },
    { numero: 2, nombre: 'Resistencia aerobica', fcInf: 75, fcSup: 85, rpeInf: 4, rpeSup: 5 },
    { numero: 3, nombre: 'Tempo', fcInf: 85, fcSup: 93, rpeInf: 6, rpeSup: 7 },
    { numero: 4, nombre: 'Umbral', fcInf: 93, fcSup: 100, rpeInf: 7, rpeSup: 8 },
    { numero: 5, nombre: 'VO2max', fcInf: 100, fcSup: 110, rpeInf: 8, rpeSup: 9 },
    { numero: 6, nombre: 'Capacidad anaerobica', fcInf: 110, fcSup: 130, rpeInf: 9, rpeSup: 10 },
    { numero: 7, nombre: 'Potencia neuromuscular', fcInf: 130, fcSup: 150, rpeInf: 10, rpeSup: 10 },
  ]
  return zonas.map(z => {
    const velInf = vam * (z.fcInf / 100)
    const velSup = vam * (z.fcSup / 100)
    return {
      ...z,
      ritmoInf: velInf > 0 ? formatRitmoKm(velInf) : '—',
      ritmoSup: velSup > 0 ? formatRitmoKm(velSup) : '—',
      fcAbsInf: fcMax > 0 ? Math.round(fcMax * z.fcInf / 100) : 0,
      fcAbsSup: fcMax > 0 ? Math.round(fcMax * z.fcSup / 100) : 0,
    }
  })
}

function zonasNatacion(css: number, fcMax: number) {
  const zonas = [
    { numero: 1, nombre: 'Recuperacion activa', fcInf: 0, fcSup: 75, rpeInf: 2, rpeSup: 3 },
    { numero: 2, nombre: 'Resistencia aerobica', fcInf: 75, fcSup: 85, rpeInf: 4, rpeSup: 5 },
    { numero: 3, nombre: 'Tempo', fcInf: 85, fcSup: 93, rpeInf: 6, rpeSup: 7 },
    { numero: 4, nombre: 'Umbral', fcInf: 93, fcSup: 100, rpeInf: 7, rpeSup: 8 },
    { numero: 5, nombre: 'VO2max', fcInf: 100, fcSup: 110, rpeInf: 8, rpeSup: 9 },
    { numero: 6, nombre: 'Capacidad anaerobica', fcInf: 110, fcSup: 130, rpeInf: 9, rpeSup: 10 },
    { numero: 7, nombre: 'Potencia neuromuscular', fcInf: 130, fcSup: 150, rpeInf: 10, rpeSup: 10 },
  ]
  return zonas.map(z => {
    const velInf = css * (z.fcInf / 100)
    const velSup = css * (z.fcSup / 100)
    return {
      ...z,
      ritmoInf: velInf > 0 ? formatRitmo100m(velInf) : '—',
      ritmoSup: velSup > 0 ? formatRitmo100m(velSup) : '—',
      fcAbsInf: fcMax > 0 ? Math.round(fcMax * z.fcInf / 100) : 0,
      fcAbsSup: fcMax > 0 ? Math.round(fcMax * z.fcSup / 100) : 0,
    }
  })
}

function zonasCiclismo(ftp: number, fcMax: number) {
  const zonas = [
    { numero: 1, nombre: 'Recuperacion activa', fcInf: 0, fcSup: 75, potInf: 0, potSup: Math.round(ftp * 0.55), rpeInf: 2, rpeSup: 3 },
    { numero: 2, nombre: 'Resistencia aerobica', fcInf: 75, fcSup: 85, potInf: Math.round(ftp * 0.55), potSup: Math.round(ftp * 0.75), rpeInf: 4, rpeSup: 5 },
    { numero: 3, nombre: 'Tempo', fcInf: 85, fcSup: 93, potInf: Math.round(ftp * 0.75), potSup: Math.round(ftp * 0.90), rpeInf: 6, rpeSup: 7 },
    { numero: 4, nombre: 'Umbral', fcInf: 93, fcSup: 100, potInf: Math.round(ftp * 0.90), potSup: Math.round(ftp * 1.05), rpeInf: 7, rpeSup: 8 },
    { numero: 5, nombre: 'VO2max', fcInf: 100, fcSup: 110, potInf: Math.round(ftp * 1.05), potSup: Math.round(ftp * 1.20), rpeInf: 8, rpeSup: 9 },
    { numero: 6, nombre: 'Capacidad anaerobica', fcInf: 110, fcSup: 130, potInf: Math.round(ftp * 1.20), potSup: Math.round(ftp * 1.50), rpeInf: 9, rpeSup: 10 },
    { numero: 7, nombre: 'Potencia neuromuscular', fcInf: 130, fcSup: 150, potInf: Math.round(ftp * 1.50), potSup: 9999, rpeInf: 10, rpeSup: 10 },
  ]
  return zonas.map(z => ({
    ...z,
    fcAbsInf: fcMax > 0 ? Math.round(fcMax * z.fcInf / 100) : 0,
    fcAbsSup: fcMax > 0 ? Math.round(fcMax * z.fcSup / 100) : 0,
  }))
}

function TablaZonas({ zonas, tipo, fcMax }: { zonas: any[], tipo: string, fcMax: number }) {
  return (
    <div className="grid gap-3">
      {zonas.map(z => (
        <div key={z.numero} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${colorZona(z.numero)}`}>Z{z.numero}</span>
              <div>
                <p className="font-medium">{z.nombre}</p>
                <p className="text-gray-400 text-xs">RPE {z.rpeInf}–{z.rpeSup}</p>
              </div>
            </div>
            <div className="text-right">
              {fcMax > 0 && z.fcAbsInf > 0 && <p className="text-sm font-medium">{z.fcAbsInf}–{z.fcAbsSup} ppm</p>}
              {tipo === 'ciclismo' ? (
                <p className="text-orange-400 text-sm">{z.potInf}–{z.potSup === 9999 ? 'max' : z.potSup} W</p>
              ) : (
                <p className="text-orange-400 text-sm">{z.ritmoInf} – {z.ritmoSup}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PaginaZonas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  const [tab, setTab] = useState('carrera')
  const [testCarrera, setTestCarrera] = useState<any>(null)
  const [testNatacion, setTestNatacion] = useState<any>(null)
  const [testCiclismo, setTestCiclismo] = useState<any>(null)

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    const { data: t1 } = await supabase.from('test1_carrera').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    setTestCarrera(t1?.[0] || null)
    const { data: t2 } = await supabase.from('test2_natacion').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    setTestNatacion(t2?.[0] || null)
    const { data: t3 } = await supabase.from('test3_ciclismo').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(1)
    setTestCiclismo(t3?.[0] || null)
  }

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  const fcMax = deportista.fc_maxima || 0

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = `/deportistas/${id}`} className="text-gray-400 hover:text-white text-sm transition">← Perfil deportista</button>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-1">Zonas de entrenamiento — {deportista.nombre}</h2>
          <p className="text-gray-400 text-sm">Calculadas a partir de los tests mas recientes · FC max: {fcMax || '—'} ppm</p>
        </div>
        <div className="flex gap-2 mb-6">
          {['carrera','natacion','ciclismo'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {t === 'carrera' ? '🏃 Carrera' : t === 'natacion' ? '🏊 Natacion' : '🚴 Ciclismo'}
            </button>
          ))}
        </div>
        {tab === 'carrera' && (!testCarrera ? <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏃</div><p>No hay test de carrera. <button onClick={() => window.location.href = `/tests/${id}`} className="text-orange-500 hover:underline">Hacer test →</button></p></div> : <div><p className="text-gray-400 text-sm mb-4">Basado en VAM: <span className="text-orange-400 font-bold">{testCarrera.vam} km/h</span> · Test del {testCarrera.fecha}</p><TablaZonas zonas={zonasCarrera(testCarrera.vam, fcMax)} tipo="carrera" fcMax={fcMax} /></div>)}
        {tab === 'natacion' && (!testNatacion ? <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🏊</div><p>No hay test de natacion. <button onClick={() => window.location.href = `/tests/${id}`} className="text-orange-500 hover:underline">Hacer test →</button></p></div> : <div><p className="text-gray-400 text-sm mb-4">Basado en CSS: <span className="text-orange-400 font-bold">{testNatacion.css} m/s</span> · Test del {testNatacion.fecha}</p><TablaZonas zonas={zonasNatacion(testNatacion.css, fcMax)} tipo="natacion" fcMax={fcMax} /></div>)}
        {tab === 'ciclismo' && (!testCiclismo ? <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">🚴</div><p>No hay test de ciclismo. <button onClick={() => window.location.href = `/tests/${id}`} className="text-orange-500 hover:underline">Hacer test →</button></p></div> : <div><p className="text-gray-400 text-sm mb-4">Basado en FTP: <span className="text-orange-400 font-bold">{testCiclismo.ftp} W</span> · Test del {testCiclismo.fecha}</p><TablaZonas zonas={zonasCiclismo(testCiclismo.ftp, fcMax)} tipo="ciclismo" fcMax={fcMax} /></div>)}
      </div>
    </main>
  )
}
