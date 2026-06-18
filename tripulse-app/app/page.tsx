'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'

const FEATURES = [
  {
    icon: '🔬',
    titulo: 'SICAT',
    desc: 'El único sistema que calcula el coste energético real de cada disciplina para cada deportista. No valores genéricos — datos reales acumulados de tus atletas.',
    color: 'border-orange-500',
  },
  {
    icon: '📅',
    titulo: 'Planificación completa',
    desc: 'Macrociclo → Mesociclo → Microciclo → Sesión → Tarea. Periodización Tradicional, Inversa, ATR y Ondulatoria con gráficas de carga automáticas.',
    color: 'border-blue-500',
  },
  {
    icon: '💚',
    titulo: 'Wellness y recuperación',
    desc: 'HRV, fatiga, sueño y estrés diario. El entrenador ve el estado de todos sus atletas en tiempo real y ajusta la carga antes de que sea tarde.',
    color: 'border-green-500',
  },
  {
    icon: '💪',
    titulo: 'Fuerza integrada',
    desc: 'Planificación de fuerza con series, repeticiones, RIR y tonelaje. Volumen muscular por grupo, superseries, drop sets y complex. Todo en una sola app.',
    color: 'border-red-500',
  },
  {
    icon: '📊',
    titulo: 'Control de carga científico',
    desc: 'ATL, CTL, TSB, ACWR, monotonía y strain calculados automáticamente. Zonas de entrenamiento desde VAM, CSS y FTP del propio deportista.',
    color: 'border-yellow-500',
  },
  {
    icon: '🎯',
    titulo: 'Semáforo de doble dimensión',
    desc: 'Cruza el índice de percepción del atleta con el índice de planificación del entrenador. Detecta riesgos invisibles antes de que se conviertan en lesiones.',
    color: 'border-purple-500',
  },
]

const PASOS = [
  { num: '01', titulo: 'Crea tu cuenta de entrenador', desc: 'Regístrate en segundos. Obtienes un código único para vincular a tus deportistas.' },
  { num: '02', titulo: 'Añade tus deportistas', desc: 'Tus atletas se registran con tu código. Tú controlas quién está en tu equipo.' },
  { num: '03', titulo: 'Planifica y analiza', desc: 'Crea la estructura de entrenamiento, registra tests y deja que TRIPULSE calcule el resto.' },
]

export default function Landing() {
  const [scroll, setScroll] = useState(0)

  useEffect(() => {
    const handleScroll = () => setScroll(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* NAV */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scroll > 50 ? 'bg-gray-900 border-b border-gray-800 shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image
              src="/gpt-image-2_a_cinematic_photo_of_Minimalist_logo_for_TRIPULSE_triathlon_training_app._Bold_l-0.jpg"
              alt="TRIPULSE"
              width={36}
              height={36}
              className="rounded-lg"
            />
            <span className="font-bold text-lg">TRIPULSE</span>
          </div>
          <div className="flex gap-3">
            <a href="/login" className="text-gray-400 hover:text-white px-4 py-2 rounded-lg text-sm transition">
              Entrar
            </a>
            <a href="/registro" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
              Empezar
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="min-h-screen flex items-center justify-center px-6 pt-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <Image
              src="/gpt-image-2_a_cinematic_photo_of_Minimalist_logo_for_TRIPULSE_triathlon_training_app._Bold_l-0.jpg"
              alt="TRIPULSE"
              width={120}
              height={120}
              className="rounded-2xl shadow-2xl"
            />
          </div>
          <div className="inline-flex items-center gap-2 bg-gray-800 border border-orange-500 rounded-full px-4 py-2 mb-6">
            <span className="text-white text-sm font-medium">🔬 SICAT — único en el mercado</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Entrena con
            <span className="text-orange-500"> datos reales</span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            La plataforma de planificación de triatlón y fuerza que individualiza cada decisión de entrenamiento. Para entrenadores que quieren ir más allá de las hojas de cálculo.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="/registro" className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-orange-500/20">
              Empezar →
            </a>
            <a href="/login" className="border border-gray-600 hover:border-orange-500 text-gray-300 hover:text-white px-8 py-4 rounded-xl font-medium text-lg transition">
              Ya tengo cuenta
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 mt-16 max-w-lg mx-auto">
            {[
              { num: '7', label: 'Zonas de entrenamiento' },
              { num: '4', label: 'Factores SICAT individuales' },
              { num: '3', label: 'Disciplinas + Fuerza' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold text-orange-500">{s.num}</p>
                <p className="text-gray-500 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Todo lo que necesitas en una sola plataforma</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Diseñada por un entrenador de triatlón para entrenadores de triatlón. Sin funciones de relleno.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.titulo} className={`bg-gray-900 rounded-2xl p-6 border-t-2 ${f.color} border-x border-b border-gray-800 hover:bg-gray-800 transition`}>
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-lg mb-2">{f.titulo}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ECO HIGHLIGHT */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-orange-500 text-sm font-bold uppercase tracking-widest">Lo que nos diferencia</span>
            <h2 className="text-4xl font-bold mt-3 mb-4">El SICAT (Sistema de Individualización de la Carga en Triatlón)</h2>
            <p className="text-gray-400 text-lg">
              Mientras otras plataformas usan valores genéricos de población, TRIPULSE construye el perfil real de cada deportista a partir de sus propios datos acumulados.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'F1', nombre: 'Dificultad técnica', desc: 'Sensación atleta + valoración entrenador' },
              { label: 'F2', nombre: 'Dolor muscular', desc: 'DOMS ponderado a 0h, 24h y 48h' },
              { label: 'F3', nombre: 'Densidad soportada', desc: 'Tolerancia a la carga alta por disciplina' },
              { label: 'F4', nombre: 'Coste energético', desc: 'FC relativa + RPE real del deportista' },
            ].map(f => (
              <div key={f.label} className="bg-gray-950 rounded-xl p-4 border border-gray-800 text-center">
                <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center font-bold mx-auto mb-3">{f.label}</div>
                <p className="font-bold text-sm mb-1">{f.nombre}</p>
                <p className="text-gray-500 text-xs">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-gray-950 rounded-2xl p-6 border border-orange-500 border-opacity-30">
            <p className="text-center text-gray-300">
              El resultado es un <span className="text-orange-400 font-bold">perfil de coste energético individualizado</span> que evoluciona con el deportista a lo largo de la temporada, corregido automáticamente por la HRV del día.
            </p>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Empezar es muy sencillo</h2>
            <p className="text-gray-400 text-lg">En menos de 10 minutos tienes la plataforma configurada y lista para usar.</p>
          </div>
          <div className="flex flex-col gap-6">
            {PASOS.map((p, i) => (
              <div key={p.num} className="flex items-start gap-6 bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <div className="text-4xl font-bold text-orange-500 flex-shrink-0">{p.num}</div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{p.titulo}</h3>
                  <p className="text-gray-400">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-2xl mx-auto text-center">
          <Image
            src="/gpt-image-2_a_cinematic_photo_of_Minimalist_logo_for_TRIPULSE_triathlon_training_app._Bold_l-0.jpg"
            alt="TRIPULSE"
            width={80}
            height={80}
            className="rounded-2xl mx-auto mb-6"
          />
          <h2 className="text-4xl font-bold mb-4">Listo para entrenar con datos reales</h2>
          <p className="text-gray-400 text-lg mb-8">Únete a los entrenadores que ya usan TRIPULSE para individualizar el entrenamiento de sus deportistas.</p>
          <a href="/registro" className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-10 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-orange-500/20">
            Empezar →
          </a>
          <p className="text-gray-600 text-sm mt-4">Sin tarjeta de crédito. Sin compromisos.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/gpt-image-2_a_cinematic_photo_of_Minimalist_logo_for_TRIPULSE_triathlon_training_app._Bold_l-0.jpg"
              alt="TRIPULSE"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-gray-400 text-sm">TRIPULSE © 2026 · Rioboó Barral, Nicolás · TFG Ciencias del Deporte</span>
          </div>
          <div className="flex gap-6">
            <a href="/login" className="text-gray-500 hover:text-white text-sm transition">Entrar</a>
            <a href="/registro" className="text-gray-500 hover:text-white text-sm transition">Registrarse</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
