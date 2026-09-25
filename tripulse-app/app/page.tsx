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
  /* Las tres de abajo son de lo construido este año y no se veía en ninguna
     parte. La rejilla es de tres columnas: con seis quedaban dos filas y con
     nueve quedan tres, cuadradas. */
  { icon: '⚡', titulo: 'Híbrido y HYROX', desc: 'Fuerza con cardio en la misma sesión, y bloques de verdad: rondas, AMRAP, EMOM, for time y Tabata. El atleta los hace con su reloj en pantalla.',
    card: 'bg-gray-800 border-pink-500/40 hover:border-pink-500/70 hover:shadow-pink-500/25', icon_bg: 'bg-pink-500/25 ring-1 ring-pink-400/40', glow: 'bg-pink-500' },
  { icon: '🤖', titulo: 'Un copiloto que lee a tu atleta', desc: 'Pregúntale por un deportista y responde con sus tests, su carga y su wellness. Si quieres, te reparte la semana entera y luego la revisa.',
    card: 'bg-gray-800 border-cyan-500/40 hover:border-cyan-500/70 hover:shadow-cyan-500/25', icon_bg: 'bg-cyan-500/25 ring-1 ring-cyan-400/40', glow: 'bg-cyan-500' },
  { icon: '⌚', titulo: 'Polar y COROS', desc: 'El sueño, la variabilidad y el pulso de reposo llegan solos del reloj de tu deportista. Sin copiar un número a mano.',
    card: 'bg-gray-800 border-indigo-500/40 hover:border-indigo-500/70 hover:shadow-indigo-500/25', icon_bg: 'bg-indigo-500/25 ring-1 ring-indigo-400/40', glow: 'bg-indigo-500' },
  { icon: '📚', titulo: 'Biblioteca de ejercicios', desc: '238 ejercicios con su descripción y, en muchos, el vídeo. El deportista lo ve desde su móvil mientras entrena, así que no hay que explicarlo dos veces.',
    card: 'bg-gray-800 border-teal-500/40 hover:border-teal-500/70 hover:shadow-teal-500/25', icon_bg: 'bg-teal-500/25 ring-1 ring-teal-400/40', glow: 'bg-teal-500' },
  { icon: '🧪', titulo: 'Tests y zonas propias', desc: '28 tests de campo y laboratorio que fijan las zonas de cada disciplina. Y si usas uno que no está, te lo creas tú y prescribes con él.',
    card: 'bg-gray-800 border-emerald-500/40 hover:border-emerald-500/70 hover:shadow-emerald-500/25', icon_bg: 'bg-emerald-500/25 ring-1 ring-emerald-400/40', glow: 'bg-emerald-500' },
  { icon: '👥', titulo: 'Grupos y pie de pista', desc: 'Programa una vez y le llega a todo el grupo, cada uno con sus ritmos. Y en el entrenamiento, la sesión en pantalla con el cronómetro y los descansos.',
    card: 'bg-gray-800 border-violet-500/40 hover:border-violet-500/70 hover:shadow-violet-500/25', icon_bg: 'bg-violet-500/25 ring-1 ring-violet-400/40', glow: 'bg-violet-500' },
]

/* Números de la app, no de un folleto: salen de la base y del catálogo, y por
   eso se pueden comprobar. Si algún día dejan de ser ciertos, hay que
   cambiarlos aquí — es el precio de dar cifras concretas. */
const NUMEROS = [
  { n: '238+', label: 'ejercicios, y los que añadas tú' },
  { n: '28+', label: 'tests, o créate el tuyo' },
  { n: '47', label: 'tipos de prueba, con sus distancias' },
  { n: '19+', label: 'zonas, incluidas las tuyas' },
]

const PREGUNTAS = [
  { q: '¿Qué pasa con los datos de mis deportistas?',
    a: 'Son tuyos y suyos. Se guardan en servidores de la Unión Europea, en Irlanda, y cada persona puede borrar su cuenta y todo lo que hay dentro desde su propio perfil, sin pedírselo a nadie.' },
  { q: '¿Me sirve si no entreno triatletas?',
    a: 'Sí. Puedes usar solo lo que necesites: corredores, ciclistas, nadadores, gente de gimnasio o de híbrido. La fuerza y el trabajo de HYROX funcionan igual de bien sin las otras disciplinas.' },
  { q: '¿Tengo que meter yo los entrenamientos hechos?',
    a: 'No. El deportista apunta desde su móvil lo que ha hecho, y si tiene un Polar o un COROS conectado, el sueño, la variabilidad y el pulso de reposo llegan solos.' },
  { q: '¿Y si no sé por dónde empezar con la planificación?',
    a: 'El asistente te propone la semana entera con tus datos y tú la corriges. También puedes partir de una plantilla y cambiar lo que no te encaje.' },
  { q: '¿Qué pasa cuando acabe la beta?',
    a: 'Te avisaremos con tiempo y con las condiciones por delante. Lo que hayas creado seguirá siendo tuyo, y podrás llevártelo.' },
]

/* ── LO QUE SE ENSEÑA EN MOVIMIENTO ──────────────────────────
   Los tres vídeos ya estaban grabados y solo se usaban dentro de la app, en el
   selector de planificación. Pesan 430 KB entre los tres, así que se pueden
   poner a reproducirse solos sin castigar la carga de la portada. */
const VIDEOS = [
  { src: '/planificacion/canvas.mp4', titulo: 'Dibuja la temporada',
    desc: 'Macrociclo, mesos y semanas, arrastrando. Las carreras, plantadas en su día.', color: 'border-purple-500/40' },
  { src: '/planificacion/calendario.mp4', titulo: 'Baja al día concreto',
    desc: 'Lo que dibujaste arriba se convierte en sesiones en el calendario.', color: 'border-blue-500/40' },
  { src: '/planificacion/bloques.mp4', titulo: 'Escribe la sesión',
    desc: 'Hasta la última serie, con sus zonas y sus ritmos.', color: 'border-orange-500/40' },
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
            {/* ARRIBA SE PIDE ACCESO, NO SE CREA CUENTA.
                Decía «Empezar» y llevaba directo al registro. En una beta en la
                que se abren cuentas poco a poco, eso deja al entrenador dentro
                de una app vacía sin haber hablado con nadie. Escribir un correo
                filtra mejor y de paso sabes quién llega. La opción de crear
                cuenta sigue existiendo, abajo del todo, para el que entra
                decidido. */}
            <div className="flex gap-4 justify-center flex-wrap fade-up" style={{ animationDelay: '0.2s' }}>
              <a href="mailto:hola@tripulse.app?subject=Quiero%20probar%20TRIPULSE&body=Hola%20Nicol%C3%A1s%2C%20soy%20entrenador%20de..."
                className="group bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5">
                Hablemos <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </a>
              <Link href="/login" className="border border-white/15 hover:border-orange-500/60 bg-white/[0.02] hover:bg-white/5 text-gray-200 px-8 py-4 rounded-xl font-medium text-lg transition backdrop-blur-sm">
                Ya tengo cuenta
              </Link>
            </div>
            <p className="text-gray-500 text-sm mt-4 fade-up" style={{ animationDelay: '0.25s' }}>
              Estamos en beta: cuéntame a quién entrenas y te abro una cuenta.
            </p>

            <div className="grid grid-cols-3 gap-4 md:gap-5 mt-16 max-w-2xl mx-auto fade-up" style={{ animationDelay: '0.3s' }}>
              {[
                /* EL «+» NO ES ADORNO y no hay que quitarlo. Estas cifras decían
                   «9 zonas» y «3 disciplinas», de cuando no existían las zonas de
                   fuerza ni el híbrido, y envejecieron mal. El «+» dice el SUELO,
                   no el techo: las zonas las amplía el propio entrenador con las
                   suyas, y los deportes han crecido dos veces este año. Así la
                   portada no miente ni hoy ni cuando entre el siguiente. */
                { num: '19+', label: 'Zonas, y las que te crees tú', card: 'border-orange-500/40', glow: 'bg-orange-500', txt: 'from-orange-300 to-orange-600' },
                { num: '4', label: 'Factores SICAT individuales', card: 'border-blue-500/40', glow: 'bg-blue-500', txt: 'from-blue-300 to-blue-600' },
                { num: '6', label: 'Deportes, y los que vengan', card: 'border-green-500/40', glow: 'bg-green-500', txt: 'from-green-300 to-green-600' },
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

        {/* LA PRESENTACIÓN, en minuto y cuarto.

            NO se reproduce sola: lleva música y voz en rótulos, y un vídeo que
            arranca solo al entrar en una web es de las cosas que hacen cerrar
            la pestaña. `preload="none"` además: así los 9 MB no se bajan hasta
            que alguien decide verlo, y quien solo viene a leer no los paga.

            La imagen de portada es un fotograma del propio vídeo —el de las
            cuatro pantallas con «Todos los datos, individualizados»— en vez del
            primero, que es una planilla de papel: antes de darle al play hay
            que ver el producto. */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10 reveal">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Ve de qué va en minuto y cuarto</h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">De la planilla de papel a la temporada entera planificada.</p>
            </div>
            <div className="reveal rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-gray-900">
              <video controls preload="none" poster="/promo/presentacion.jpg" className="w-full block aspect-video bg-black">
                <source src="/promo/presentacion.mp4" type="video/mp4" />
              </video>
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

        {/* MÍRALO POR DENTRO — los vídeos que ya existían en el proyecto.

            Las tarjetas de arriba lo CUENTAN; esto lo ENSEÑA, que es lo que
            faltaba: hasta hoy no se veía ni una pantalla de la aplicación. */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14 reveal">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Míralo por dentro</h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">Del año entero a la última serie, en tres pasos.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {VIDEOS.map((v, i) => (
                <div key={v.src} className={`reveal group rounded-2xl border overflow-hidden bg-gray-800 shadow-xl shadow-black/40 transition-all duration-300 hover:-translate-y-1.5 ${v.color}`} style={{ transitionDelay: `${i * 90}ms` }}>
                  {/* `muted` y `playsInline` no son adorno: sin los dos, el móvil
                      se niega a reproducir solo y quedaría un recuadro negro. */}
                  <video src={v.src} autoPlay muted loop playsInline preload="metadata"
                    className="w-full aspect-[16/10] object-cover bg-gray-900" />
                  <div className="p-5 border-t border-white/5">
                    <h3 className="font-bold text-[15.5px] mb-1">{v.titulo}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* LOS NÚMEROS. Concretos y comprobables: es lo que distingue una
            portada de un folleto. */}
        <section className="py-16 px-6 border-y border-white/5 bg-white/[0.015]">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {NUMEROS.map((x, i) => (
              <div key={x.label} className="reveal" style={{ transitionDelay: `${i * 70}ms` }}>
                <p className="text-4xl md:text-5xl font-extrabold bg-gradient-to-b from-orange-300 to-orange-600 bg-clip-text text-transparent">{x.n}</p>
                <p className="text-gray-400 text-[13px] mt-2 leading-tight">{x.label}</p>
              </div>
            ))}
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

        {/* ¿ERES DEPORTISTA? — la portada hablaba solo al entrenador, y a la
            app entra mucha más gente invitada que registrada por su cuenta. */}
        <section className="py-24 px-6 bg-gradient-to-b from-blue-500/[0.04] to-transparent">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 reveal">
              <span className="text-blue-400 text-sm font-bold uppercase tracking-widest">¿Eres deportista?</span>
              <h2 className="mt-4 text-3xl md:text-4xl font-bold mb-4 tracking-tight">Tu entrenamiento, sin perseguir a nadie por WhatsApp</h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">Tu entrenador te invita y ya está. Ves lo que toca hoy, lo apuntas, y él lo ve al momento.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { icon: '📅', titulo: 'Tu calendario', desc: 'Lo de hoy, lo de la semana y tus competiciones, con los ritmos que te tocan a ti.', card: 'border-blue-500/40', bg: 'bg-blue-500/25 ring-1 ring-blue-400/40' },
                { icon: '✍️', titulo: 'Apunta lo que hiciste', desc: 'Series, pesos y sensaciones. Y también lo que hiciste por tu cuenta.', card: 'border-green-500/40', bg: 'bg-green-500/25 ring-1 ring-green-400/40' },
                { icon: '💤', titulo: 'Cómo amaneciste', desc: 'Medio minuto por la mañana: sueño, fatiga y dolor. Con eso tu entrenador ajusta el día.', card: 'border-pink-500/40', bg: 'bg-pink-500/25 ring-1 ring-pink-400/40' },
              ].map((c, i) => (
                <div key={c.titulo} className={`reveal rounded-2xl p-6 border bg-gray-800 shadow-xl shadow-black/40 ${c.card}`} style={{ transitionDelay: `${i * 90}ms` }}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 ${c.bg}`}>{c.icon}</div>
                  <h3 className="font-bold text-lg mb-2">{c.titulo}</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-gray-500 text-sm mt-8 reveal">
              ¿Sin entrenador? La app también te genera un plan y lo va ajustando a lo que haces.
            </p>
          </div>
        </section>

        {/* QUIÉN HAY DETRÁS. En una beta, saber que hay una persona —y no un
            departamento de soporte— es lo que hace que alguien escriba. */}
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto reveal">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8 md:p-10">
              <span className="text-orange-400 text-sm font-bold uppercase tracking-widest">Quién hay detrás</span>
              <p className="text-gray-300 text-lg leading-relaxed mt-5">
                Me llamo <strong className="text-white">Nicolás Rioboó</strong> y soy entrenador. TRIPULSE empezó
                porque mi hoja de cálculo no daba más de sí: no sabía a qué ritmo iba cada atleta, no me avisaba
                de nada y no se enteraba de lo que se hacía de verdad.
              </p>
              <p className="text-gray-400 leading-relaxed mt-4">
                Así que la app está hecha desde el otro lado de la mesa, con los problemas de programar de verdad a
                gente de verdad. La uso cada semana con mis propios deportistas, y lo que no me sirve a mí no entra.
              </p>
              <p className="text-gray-500 text-sm mt-6">
                Si quieres preguntarme algo antes de probarla, escríbeme a{' '}
                <a href="mailto:nicolas@tripulse.app" className="text-orange-400 hover:text-orange-300 transition">nicolas@tripulse.app</a>.
              </p>
            </div>
          </div>
        </section>

        {/* PREGUNTAS FRECUENTES — las dudas que frenan a alguien antes de
            escribir. Mejor contestadas aquí que no contestadas. */}
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12 reveal">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Preguntas que nos hacéis</h2>
            </div>
            <div className="flex flex-col gap-3">
              {PREGUNTAS.map((p, i) => (
                <details key={p.q} className="reveal group rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5 open:border-orange-500/30 transition" style={{ transitionDelay: `${i * 60}ms` }}>
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-semibold text-[16.5px]">
                    {p.q}
                    <span className="text-orange-400 text-xl leading-none flex-shrink-0 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="text-gray-400 leading-relaxed mt-3 text-[15px]">{p.a}</p>
                </details>
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
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Pruébalo con tus deportistas</h2>
              <p className="text-gray-400 text-lg mb-8">
                Estamos en beta y abrimos cuentas poco a poco, para atender bien a cada entrenador que entra.
                Cuéntanos a quién entrenas y te damos acceso.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                {/* Un correo y no un formulario: el formulario habría que
                    construirlo, guardarlo y vigilarlo, y hoy lo que hace falta
                    es que alguien pueda escribir. */}
                <a href="mailto:hola@tripulse.app?subject=Quiero%20probar%20TRIPULSE&body=Hola%2C%20soy%20entrenador%20de..."
                  className="group inline-flex items-center gap-2 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white px-10 py-4 rounded-xl font-bold text-lg transition shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5">
                  Pedir acceso <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </a>
                <Link href="/registro" className="inline-flex items-center border border-white/15 hover:border-orange-500/60 bg-white/[0.02] hover:bg-white/5 text-gray-200 px-8 py-4 rounded-xl font-medium text-lg transition">
                  Crear cuenta
                </Link>
              </div>
              <p className="text-gray-500 text-sm mt-5">
                O escríbenos a <a href="mailto:hola@tripulse.app" className="text-orange-400 hover:text-orange-300 transition">hola@tripulse.app</a>
              </p>
              <p className="text-gray-600 text-sm mt-2">Durante la beta no se paga nada.</p>
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
