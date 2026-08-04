'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const LOGO = '/gpt-image-2_a_cinematic_photo_of_Minimalist_logo_for_TRIPULSE_triathlon_training_app._Bold_l-0.jpg'

const FEATURES = [
  { icon: '🔬', titulo: 'SICAT', desc: 'El único sistema que calcula el coste energético real de cada disciplina para cada deportista. No valores genéricos — datos reales acumulados de tus atletas.',
    card: 'bg-gray-800 border-orange-500/40 hover:border-orange-500/70 hover:shadow-orange-500/25', icon_bg: 'bg-orange-500/25 ring-1 ring-orange-400/40', glow: 'bg-orange-500' },
  { icon: '📅', titulo: 'Planificación completa', desc: 'Macrociclo → Mesociclo → Microciclo → Sesión → Tarea. Periodización Tradicional, Inversa, ATR y Ondulatoria con gráficas de carga automáticas.',
    card: 'bg-gray-800 border-blue-500/40 hover:border-blue-500/70 hover:shadow-blue-500/25', icon_bg: 'bg-blue-500/25 ring-1 ring-blue-400/40', glow: 'bg-blue-500' },
  { icon: '💚', titulo: 'Wellness y recuperación', desc: 'HRV, fatiga, sueño y estrés diario. El entrenador ve el estado de todos sus atletas en tiempo real y ajusta la carga antes de que sea tarde.',
    card: 'bg-gray-800 border-green-500/40 hover:border-green-500/70 hover:shadow-green-500/25', icon_bg: 'bg-green-500/25 ring-1 ring-green-400/40', glow: 'bg-green-500' },
  { icon: '💪', titulo: 'Fuerza integrada', desc: 'Planificación de fuerza con series, repeticiones, RIR y tonelaje. Volumen muscular por grupo, superseries, drop sets y complex. Todo en una sola app.',
    card: 'bg-gray-800 border-red-500/40 hover:border-red-500/70 hover:shadow-red-500/25', icon_bg: 'bg-red-500/25 ring-1 ring-red-400/40', glow: 'bg-red-500' },
  { icon: '📊', titulo: 'Control de carga científico', desc: 'ATL, CTL, TSB, ACWR, monotonía y strain calculados automáticamente. Zonas de entrenamiento desde VAM, CSS y FTP del propio deportista.',
    card: 'bg-gray-800 border-yellow-500/40 hover:border-yellow-500/70 hover:shadow-yellow-500/25', icon_bg: 'bg-yellow-500/25 ring-1 ring-yellow-400/40', glow: 'bg-yellow-500' },
  { icon: '🎯', titulo: 'Semáforo de doble dimensión', desc: 'Cruza el índice de percepción del atleta con el índice de planificación del entrenador. Detecta riesgos invisibles antes de que se conviertan en lesiones.',
    card: 'bg-gray-800 border-purple-500/40 hover:border-purple-500/70 hover:shadow-purple-500/25', icon_bg: 'bg-purple-500/25 ring-1 ring-purple-400/40', glow: 'bg-purple-500' },
]

const PASOS = [
  { num: '01', titulo: 'Crea tu cuenta de entrenador', desc: 'Regístrate en segundos. Obtienes un código único para vincular a tus deportistas.' },
  { num: '02', titulo: 'Añade tus deportistas', desc: 'Tus atletas se registran con tu código. Tú controlas quién está en tu equipo.' },
  { num: '03', titulo: 'Planifica y analiza', desc: 'Crea la estructura de entrenamiento, registra tests y deja que TRIPULSE calcule el resto.' },
]

const HERO_ICON = '/landing/hero-icon.webp'

export default function Landing() {
  const [scroll, setScroll] = useState(0)
  const [heroH, setHeroH] = useState(900)

  useEffect(() => {
    const handleScroll = () => setScroll(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Alto del hero, para saber cuánto hay que scrollear para que el icono desaparezca del todo
  useEffect(() => {
    const upd = () => setHeroH(window.innerHeight)
    upd()
    window.addEventListener('resize', upd)
    return () => window.removeEventListener('resize', upd)
  }, [])

  // Progreso de scroll dentro del hero (0 = arriba del todo, 1 = ya salió del hero)
  const heroProgress = Math.min(1, scroll / heroH)

  // Aparición al hacer scroll
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <main className="relative min-h-screen bg-[#0a0a0d] text-white overflow-x-clip">
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .floaty { animation: floaty 6s ease-in-out infinite; }
        .reveal { opacity: 0; transform: translateY(30px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); }
        .reveal.visible { opacity: 1; transform: none; }
        @keyframes sparkArrive { 0% { opacity: 0; transform: scale(0.15); } 55% { opacity: 0.9; transform: scale(1.35); } 100% { opacity: 0.3; transform: scale(1); } }
        .spark-glow { opacity: 0; }
        .reveal.visible .spark-glow { animation: sparkArrive 0.9s cubic-bezier(.16,1,.3,1) both; }
      `}</style>

      {/* Ambient background (para las secciones bajo el hero) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[60vh] -right-40 h-[500px] w-[500px] rounded-full bg-orange-600/12 blur-[130px]" />
        <div className="absolute top-[130vh] -left-40 h-[500px] w-[500px] rounded-full bg-blue-600/8 blur-[130px]" />
      </div>

      <div className="relative z-10">

        {/* NAV */}
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scroll > 40 ? 'bg-[#0a0a0d]/80 backdrop-blur-xl border-b border-white/5' : 'bg-transparent'}`}>
          <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Image src={LOGO} alt="TRIPULSE" width={36} height={36} priority className="rounded-lg ring-1 ring-white/10" />
              <span className="font-bold text-lg tracking-tight">TRIPULSE</span>
            </div>
            <div className="flex gap-2 items-center">
              <Link href="/login" className="text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm transition">Entrar</Link>
              <Link href="/registro" className="bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-lg shadow-orange-500/25">Empezar</Link>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 overflow-hidden">
          {/* Icono de fondo — se encoge y se desvanece al bajar, como si "se recogiera" hacia los módulos */}
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
            style={{ transform: `scale(${1 - heroProgress * 0.35}) translateY(${-heroProgress * 40}px)`, opacity: 1 - heroProgress }}>
            <Image src={HERO_ICON} alt="" fill priority className="object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0d]/50 via-transparent to-[#0a0a0d]" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-8 fade-up">
              <div className="floaty rounded-[30px] p-[2px] bg-gradient-to-br from-orange-400/70 via-white/20 to-orange-600/50 shadow-2xl shadow-orange-500/40">
                <div className="rounded-[28px] p-3.5 bg-gradient-to-br from-gray-700/70 to-gray-900/80 border border-white/15 backdrop-blur">
                  {/* `priority`: es la imagen más grande de la portada y está sobre el
                      corte, así que Next la marcaba como LCP y avisaba de que se
                      cargaba en diferido. Es lo primero que ve quien llega. */}
                  <Image src={LOGO} alt="TRIPULSE" width={116} height={116} priority className="rounded-[18px] block ring-1 ring-white/15" />
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-orange-500/40 rounded-full px-4 py-1.5 mb-7 fade-up backdrop-blur-sm" style={{ animationDelay: '0.05s' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-gray-200 text-sm font-medium">SICAT — único en el mercado</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-[1.05] tracking-tight fade-up" style={{ animationDelay: '0.1s' }}>
              Entrena con<br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-amber-500 bg-clip-text text-transparent"> datos reales</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed fade-up" style={{ animationDelay: '0.15s' }}>
              La plataforma de planificación de triatlón y fuerza que individualiza cada decisión de entrenamiento. Para entrenadores que quieren ir más allá de las hojas de cálculo.
            </p>
            <div className="flex gap-4 justify-center flex-wrap fade-up" style={{ animationDelay: '0.2s' }}>
              <Link href="/registro" className="group bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5">
                Empezar <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link href="/login" className="border border-white/15 hover:border-orange-500/60 bg-white/[0.02] hover:bg-white/5 text-gray-200 px-8 py-4 rounded-xl font-medium text-lg transition backdrop-blur-sm">
                Ya tengo cuenta
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-4 md:gap-5 mt-16 max-w-2xl mx-auto fade-up" style={{ animationDelay: '0.3s' }}>
              {[
                { num: '9', label: 'Zonas metabólicas', card: 'border-orange-500/40', glow: 'bg-orange-500', txt: 'from-orange-300 to-orange-600' },
                { num: '4', label: 'Factores SICAT individuales', card: 'border-blue-500/40', glow: 'bg-blue-500', txt: 'from-blue-300 to-blue-600' },
                { num: '3', label: 'Disciplinas + Fuerza', card: 'border-green-500/40', glow: 'bg-green-500', txt: 'from-green-300 to-green-600' },
              ].map(s => (
                <div key={s.label} className={`group relative overflow-hidden rounded-2xl p-5 border bg-gray-800 shadow-xl shadow-black/40 ${s.card}`}>
                  <div className={`pointer-events-none absolute -top-8 -left-8 w-28 h-28 rounded-full blur-3xl opacity-30 group-hover:opacity-50 transition-opacity ${s.glow}`} />
                  <div className="relative text-center">
                    <p className={`text-4xl md:text-5xl font-extrabold bg-gradient-to-b ${s.txt} bg-clip-text text-transparent`}>{s.num}</p>
                    <p className="text-gray-300 text-xs mt-2 leading-tight">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16 reveal">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Todo lo que necesitas en una sola plataforma</h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">Diseñada por un entrenador de triatlón para entrenadores de triatlón. Sin funciones de relleno.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f, i) => (
                <div key={f.titulo} className={`reveal group relative overflow-hidden rounded-2xl p-6 border transition-all duration-300 hover:-translate-y-1.5 shadow-xl shadow-black/40 ${f.card}`} style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                  <div className={`spark-glow pointer-events-none absolute -top-10 -left-10 w-36 h-36 rounded-full blur-3xl group-hover:opacity-50 transition-opacity ${f.glow}`} style={{ animationDelay: `${(i % 3) * 90 + 150}ms` }} />
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 ${f.icon_bg}`}>{f.icon}</div>
                    <h3 className="font-bold text-lg mb-2">{f.titulo}</h3>
                    <p className="text-gray-300 text-sm leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SICAT — nombre */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto text-center reveal">
            <span className="text-orange-400 text-sm font-bold uppercase tracking-widest">Lo que nos diferencia</span>
            <h2 className="mt-4 text-7xl md:text-9xl font-extrabold tracking-tight bg-gradient-to-b from-orange-300 via-orange-500 to-orange-700 bg-clip-text text-transparent">SICAT</h2>
            <p className="text-gray-400 text-lg mt-4">Individualización de la Carga en Triatlón</p>
          </div>
        </section>

        {/* SICAT HIGHLIGHT — desglose */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto relative reveal">
            <div className="absolute inset-0 -z-0 bg-orange-500/5 blur-3xl rounded-full" />
            <div className="relative rounded-3xl border border-orange-500/20 bg-gradient-to-b from-orange-500/[0.07] to-white/[0.02] p-8 md:p-12">
              <div className="text-center mb-12">
                <h3 className="text-2xl md:text-3xl font-bold mb-4 tracking-tight">Los 4 factores que lo hacen posible</h3>
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
                  <div key={f.label} className="rounded-xl p-4 bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/20 text-center hover:border-orange-500/50 transition">
                    <div className="w-11 h-11 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full flex items-center justify-center font-bold mx-auto mb-3 shadow-lg shadow-orange-500/40">{f.label}</div>
                    <p className="font-bold text-sm mb-1">{f.nombre}</p>
                    <p className="text-gray-400 text-xs">{f.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-2xl p-6 bg-orange-500/[0.08] border border-orange-500/25">
                <p className="text-center text-gray-300">
                  El resultado es un <span className="text-orange-400 font-bold">perfil de coste energético individualizado</span> que evoluciona con el deportista a lo largo de la temporada, corregido automáticamente por la HRV del día.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16 reveal">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Empezar es muy sencillo</h2>
              <p className="text-gray-400 text-lg">En menos de 10 minutos tienes la plataforma configurada y lista para usar.</p>
            </div>
            <div className="flex flex-col gap-4">
              {PASOS.map((p, i) => (
                <div key={p.num} className="reveal group flex items-start gap-6 rounded-2xl p-6 bg-gradient-to-r from-orange-500/[0.08] via-white/[0.02] to-transparent border border-orange-500/20 hover:border-orange-500/45 transition" style={{ transitionDelay: `${i * 90}ms` }}>
                  <div className="text-4xl font-bold bg-gradient-to-b from-orange-400 to-orange-600 bg-clip-text text-transparent flex-shrink-0">{p.num}</div>
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
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto text-center relative rounded-3xl border border-orange-500/30 bg-gradient-to-b from-orange-500/[0.12] to-transparent px-8 py-16 overflow-hidden reveal">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-56 w-56 bg-orange-500/30 blur-[100px] rounded-full" />
            <div className="relative">
              <div className="inline-block floaty rounded-[22px] p-[2px] bg-gradient-to-br from-orange-400/60 via-white/10 to-orange-600/40 shadow-xl shadow-orange-500/25 mb-6">
                <Image src={LOGO} alt="TRIPULSE" width={72} height={72} className="rounded-[20px] block" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Listo para entrenar con datos reales</h2>
              <p className="text-gray-400 text-lg mb-8">Únete a los entrenadores que ya usan TRIPULSE para individualizar el entrenamiento de sus deportistas.</p>
              <Link href="/registro" className="group inline-flex items-center gap-2 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white px-10 py-4 rounded-xl font-bold text-lg transition shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5">
                Empezar <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <p className="text-gray-600 text-sm mt-4">Sin tarjeta de crédito. Sin compromisos.</p>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-white/5 py-8 px-6">
          <div className="max-w-6xl mx-auto flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Image src={LOGO} alt="TRIPULSE" width={28} height={28} className="rounded-md ring-1 ring-white/10" />
              <span className="text-gray-500 text-sm">TRIPULSE © 2026 · Rioboó Barral, Nicolás</span>
            </div>
            <div className="flex gap-6">
              <Link href="/privacidad" className="text-gray-500 hover:text-white text-sm transition">Privacidad</Link>
              <Link href="/terminos" className="text-gray-500 hover:text-white text-sm transition">Términos</Link>
              <Link href="/login" className="text-gray-500 hover:text-white text-sm transition">Entrar</Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}
