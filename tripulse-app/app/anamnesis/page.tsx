'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'

const SECCIONES = [
  'Datos personales',
  'Salud',
  'Lesiones',
  'Perfil deportivo',
  'Rendimiento',
  'Hábitos',
  'Objetivos',
]

const ZONAS_CUERPO = ['Hombro', 'Rodilla', 'Cadera', 'Tobillo', 'Espalda', 'Otro']
const TIPOS_LESION = ['Muscular', 'Tendinosa', 'Articular', 'Fractura', 'Otra']

type Lesion = {
  zona: string
  tipo: string
  anio: string
  recuperado: string
}

export default function PaginaAnamnesis() {
  const router = useRouter()
  const [deportistaId, setDeportistaId] = useState<number | null>(null)
  const [anamnesisId, setAnamnesisId] = useState<number | null>(null)
  const [seccion, setSeccion] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [ultimoGuardado, setUltimoGuardado] = useState<string | null>(null)
  const [yaEnviada, setYaEnviada] = useState(false)
  const guardadoTimer = useRef<NodeJS.Timeout | null>(null)

  // Sección 1
  const [nombreCompleto, setNombreCompleto] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [sexo, setSexo] = useState('')
  const [peso, setPeso] = useState('')
  const [talla, setTalla] = useState('')
  const [contactoNombre, setContactoNombre] = useState('')
  const [contactoTelefono, setContactoTelefono] = useState('')

  // Sección 2
  const [saludCardiaca, setSaludCardiaca] = useState<boolean | null>(null)
  const [saludCardiacaDetalle, setSaludCardiacaDetalle] = useState('')
  const [saludFamilia, setSaludFamilia] = useState<boolean | null>(null)
  const [saludTension, setSaludTension] = useState<boolean | null>(null)
  const [saludDiabetes, setSaludDiabetes] = useState<boolean | null>(null)
  const [saludDiabetesTipo, setSaludDiabetesTipo] = useState('')
  const [saludAsma, setSaludAsma] = useState<boolean | null>(null)
  const [saludAsmaDetalle, setSaludAsmaDetalle] = useState('')
  const [saludMedicacion, setSaludMedicacion] = useState<boolean | null>(null)
  const [saludMedicacionDetalle, setSaludMedicacionDetalle] = useState('')
  const [saludAlergia, setSaludAlergia] = useState<boolean | null>(null)
  const [saludAlergiaDetalle, setSaludAlergiaDetalle] = useState('')
  const [saludRazon, setSaludRazon] = useState<boolean | null>(null)
  const [saludRazonDetalle, setSaludRazonDetalle] = useState('')
  const [declaracion, setDeclaracion] = useState(false)

  // Sección 3
  const [lesionesRecientes, setLesionesRecientes] = useState<boolean | null>(null)
  const [lesionesRecuperado, setLesionesRecuperado] = useState('')
  const [dolorcronico, setDolorCronico] = useState<boolean | null>(null)
  const [dolorcronicoDet, setDolorCronicoDet] = useState('')
  const [sinEntrenar, setSinEntrenar] = useState<boolean | null>(null)
  const [sinEntrenarDet, setSinEntrenarDet] = useState('')
  const [lesiones, setLesiones] = useState<Lesion[]>([])

  // Sección 4
  const [aniosTriatlon, setAniosTriatlon] = useState('')
  const [distancias, setDistancias] = useState<string[]>([])
  const [nivelCompetitivo, setNivelCompetitivo] = useState('')
  const [disciplinaFuerte, setDisciplinaFuerte] = useState('')
  const [disciplinaDebil, setDisciplinaDebil] = useState('')
  const [deporteAnterior, setDeporteAnterior] = useState<boolean | null>(null)
  const [deporteAnteriorDet, setDeporteAnteriorDet] = useState('')
  const [volumenSemanal, setVolumenSemanal] = useState('')
  const [diasSemana, setDiasSemana] = useState('')

  // Sección 5
  const [fcMaxima, setFcMaxima] = useState('')
  const [fcReposo, setFcReposo] = useState('')
  const [ftpVal, setFtpVal] = useState('')
  const [cssVal, setCssVal] = useState('')
  const [ritmoUmbral, setRitmoUmbral] = useState('')
  const [tienePotenciometro, setTienePotenciometro] = useState<boolean | null>(null)
  const [usaPulsometro, setUsaPulsometro] = useState<boolean | null>(null)
  const [mideHrv, setMideHrv] = useState<boolean | null>(null)
  const [hrvDispositivo, setHrvDispositivo] = useState('')

  // Sección 6
  const [horasSueno, setHorasSueno] = useState('')
  const [actividadDiaria, setActividadDiaria] = useState('')
  const [nivelEstres, setNivelEstres] = useState('')
  const [dieta, setDieta] = useState('')

  // Sección 7
  const [pruebaObjetivo, setPruebaObjetivo] = useState('')
  const [pruebaFecha, setPruebaFecha] = useState('')
  const [pruebaDistancia, setPruebaDistancia] = useState('')
  const [objetivoPrincipal, setObjetivoPrincipal] = useState('')
  const [motivacion, setMotivacion] = useState('')
  const [mensajeEntrenador, setMensajeEntrenador] = useState('')

  useEffect(() => {
    const init = async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data: dep } = await supabase.from('deportista').select('id').eq('id_usuario', user.id).single()
      if (!dep) { router.push('/dashboard-deportista'); return }
      setDeportistaId(dep.id)

      const { data: an } = await supabase.from('anamnesis').select('*').eq('id_deportista', dep.id).maybeSingle()
      if (an) {
        if (an.estado === 'enviada') { setYaEnviada(true); return }
        setAnamnesisId(an.id)
        cargarDatos(an)
      }
    }
    init()
  }, [])

  const cargarDatos = (an: any) => {
    setNombreCompleto(an.nombre_completo || '')
    setFechaNacimiento(an.fecha_nacimiento || '')
    setSexo(an.sexo || '')
    setPeso(an.peso?.toString() || '')
    setTalla(an.talla?.toString() || '')
    setContactoNombre(an.contacto_emergencia_nombre || '')
    setContactoTelefono(an.contacto_emergencia_telefono || '')
    setSaludCardiaca(an.salud_cardiaca)
    setSaludCardiacaDetalle(an.salud_cardiaca_detalle || '')
    setSaludFamilia(an.salud_familia_infarto)
    setSaludTension(an.salud_tension_alta)
    setSaludDiabetes(an.salud_diabetes)
    setSaludDiabetesTipo(an.salud_diabetes_tipo || '')
    setSaludAsma(an.salud_asma)
    setSaludAsmaDetalle(an.salud_asma_detalle || '')
    setSaludMedicacion(an.salud_medicacion)
    setSaludMedicacionDetalle(an.salud_medicacion_detalle || '')
    setSaludAlergia(an.salud_alergia)
    setSaludAlergiaDetalle(an.salud_alergia_detalle || '')
    setSaludRazon(an.salud_razon_medica)
    setSaludRazonDetalle(an.salud_razon_medica_detalle || '')
    setDeclaracion(an.declaracion_responsabilidad || false)
    setLesionesRecientes(an.lesiones_recientes)
    setLesionesRecuperado(an.lesiones_recuperado || '')
    setDolorCronico(an.lesiones_dolor_cronico)
    setDolorCronicoDet(an.lesiones_dolor_cronico_detalle || '')
    setSinEntrenar(an.lesiones_sin_entrenar)
    setSinEntrenarDet(an.lesiones_sin_entrenar_detalle || '')
    setLesiones(an.lesiones_lista || [])
    setAniosTriatlon(an.anios_triatlon || '')
    setDistancias(an.distancias_completadas || [])
    setNivelCompetitivo(an.nivel_competitivo || '')
    setDisciplinaFuerte(an.disciplina_fuerte || '')
    setDisciplinaDebil(an.disciplina_debil || '')
    setDeporteAnterior(an.deporte_anterior)
    setDeporteAnteriorDet(an.deporte_anterior_detalle || '')
    setVolumenSemanal(an.volumen_semanal || '')
    setDiasSemana(an.dias_semana || '')
    setFcMaxima(an.fc_maxima?.toString() || '')
    setFcReposo(an.fc_reposo?.toString() || '')
    setFtpVal(an.ftp?.toString() || '')
    setCssVal(an.css || '')
    setRitmoUmbral(an.ritmo_umbral || '')
    setTienePotenciometro(an.tiene_potenciometro)
    setUsaPulsometro(an.usa_pulsometro)
    setMideHrv(an.mide_hrv)
    setHrvDispositivo(an.hrv_dispositivo || '')
    setHorasSueno(an.horas_sueno || '')
    setActividadDiaria(an.actividad_diaria || '')
    setNivelEstres(an.nivel_estres || '')
    setDieta(an.dieta || '')
    setPruebaObjetivo(an.prueba_objetivo || '')
    setPruebaFecha(an.prueba_fecha || '')
    setPruebaDistancia(an.prueba_distancia || '')
    setObjetivoPrincipal(an.objetivo_principal || '')
    setMotivacion(an.motivacion || '')
    setMensajeEntrenador(an.mensaje_entrenador || '')
  }

  const buildPayload = useCallback(() => ({
    nombre_completo: nombreCompleto || null,
    fecha_nacimiento: fechaNacimiento || null,
    sexo: sexo || null,
    peso: peso ? parseFloat(peso) : null,
    talla: talla ? parseInt(talla) : null,
    contacto_emergencia_nombre: contactoNombre || null,
    contacto_emergencia_telefono: contactoTelefono || null,
    salud_cardiaca: saludCardiaca,
    salud_cardiaca_detalle: saludCardiacaDetalle || null,
    salud_familia_infarto: saludFamilia,
    salud_tension_alta: saludTension,
    salud_diabetes: saludDiabetes,
    salud_diabetes_tipo: saludDiabetesTipo || null,
    salud_asma: saludAsma,
    salud_asma_detalle: saludAsmaDetalle || null,
    salud_medicacion: saludMedicacion,
    salud_medicacion_detalle: saludMedicacionDetalle || null,
    salud_alergia: saludAlergia,
    salud_alergia_detalle: saludAlergiaDetalle || null,
    salud_razon_medica: saludRazon,
    salud_razon_medica_detalle: saludRazonDetalle || null,
    declaracion_responsabilidad: declaracion,
    lesiones_recientes: lesionesRecientes,
    lesiones_recuperado: lesionesRecuperado || null,
    lesiones_dolor_cronico: dolorcronico,
    lesiones_dolor_cronico_detalle: dolorcronicoDet || null,
    lesiones_sin_entrenar: sinEntrenar,
    lesiones_sin_entrenar_detalle: sinEntrenarDet || null,
    lesiones_lista: lesiones,
    anios_triatlon: aniosTriatlon || null,
    distancias_completadas: distancias,
    nivel_competitivo: nivelCompetitivo || null,
    disciplina_fuerte: disciplinaFuerte || null,
    disciplina_debil: disciplinaDebil || null,
    deporte_anterior: deporteAnterior,
    deporte_anterior_detalle: deporteAnteriorDet || null,
    volumen_semanal: volumenSemanal || null,
    dias_semana: diasSemana || null,
    fc_maxima: fcMaxima ? parseInt(fcMaxima) : null,
    fc_reposo: fcReposo ? parseInt(fcReposo) : null,
    ftp: ftpVal ? parseInt(ftpVal) : null,
    css: cssVal || null,
    ritmo_umbral: ritmoUmbral || null,
    tiene_potenciometro: tienePotenciometro,
    usa_pulsometro: usaPulsometro,
    mide_hrv: mideHrv,
    hrv_dispositivo: hrvDispositivo || null,
    horas_sueno: horasSueno || null,
    actividad_diaria: actividadDiaria || null,
    nivel_estres: nivelEstres || null,
    dieta: dieta || null,
    prueba_objetivo: pruebaObjetivo || null,
    prueba_fecha: pruebaFecha || null,
    prueba_distancia: pruebaDistancia || null,
    objetivo_principal: objetivoPrincipal || null,
    motivacion: motivacion || null,
    mensaje_entrenador: mensajeEntrenador || null,
    updated_at: new Date().toISOString(),
  }), [nombreCompleto, fechaNacimiento, sexo, peso, talla, contactoNombre, contactoTelefono,
    saludCardiaca, saludCardiacaDetalle, saludFamilia, saludTension, saludDiabetes, saludDiabetesTipo,
    saludAsma, saludAsmaDetalle, saludMedicacion, saludMedicacionDetalle, saludAlergia, saludAlergiaDetalle,
    saludRazon, saludRazonDetalle, declaracion, lesionesRecientes, lesionesRecuperado, dolorcronico,
    dolorcronicoDet, sinEntrenar, sinEntrenarDet, lesiones, aniosTriatlon, distancias, nivelCompetitivo,
    disciplinaFuerte, disciplinaDebil, deporteAnterior, deporteAnteriorDet, volumenSemanal, diasSemana,
    fcMaxima, fcReposo, ftpVal, cssVal, ritmoUmbral, tienePotenciometro, usaPulsometro, mideHrv,
    hrvDispositivo, horasSueno, actividadDiaria, nivelEstres, dieta, pruebaObjetivo, pruebaFecha,
    pruebaDistancia, objetivoPrincipal, motivacion, mensajeEntrenador])

  const autoguardar = useCallback(() => {
    if (!deportistaId) return
    if (guardadoTimer.current) clearTimeout(guardadoTimer.current)
    guardadoTimer.current = setTimeout(async () => {
      setGuardando(true)
      const payload = buildPayload()
      if (anamnesisId) {
        await supabase.from('anamnesis').update(payload).eq('id', anamnesisId)
      } else {
        const { data } = await supabase.from('anamnesis').insert({ ...payload, id_deportista: deportistaId, estado: 'borrador' }).select('id').single()
        if (data) setAnamnesisId(data.id)
      }
      setGuardando(false)
      setUltimoGuardado(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    }, 1500)
  }, [deportistaId, anamnesisId, buildPayload])

  useEffect(() => { autoguardar() }, [
    nombreCompleto, fechaNacimiento, sexo, peso, talla, contactoNombre, contactoTelefono,
    saludCardiaca, saludCardiacaDetalle, saludFamilia, saludTension, saludDiabetes, saludDiabetesTipo,
    saludAsma, saludAsmaDetalle, saludMedicacion, saludMedicacionDetalle, saludAlergia, saludAlergiaDetalle,
    saludRazon, saludRazonDetalle, declaracion, lesionesRecientes, lesionesRecuperado, dolorcronico,
    dolorcronicoDet, sinEntrenar, sinEntrenarDet, lesiones, aniosTriatlon, distancias, nivelCompetitivo,
    disciplinaFuerte, disciplinaDebil, deporteAnterior, deporteAnteriorDet, volumenSemanal, diasSemana,
    fcMaxima, fcReposo, ftpVal, cssVal, ritmoUmbral, tienePotenciometro, usaPulsometro, mideHrv,
    hrvDispositivo, horasSueno, actividadDiaria, nivelEstres, dieta, pruebaObjetivo, pruebaFecha,
    pruebaDistancia, objetivoPrincipal, motivacion, mensajeEntrenador,
  ])

  const enviar = async () => {
    if (!declaracion) { alert('Debes aceptar la declaración de responsabilidad en la sección de Salud.'); return }
    // Cancelar el autoguardado pendiente: si dispara después del envío con anamnesisId
    // aún null, crearía una 2ª fila y la próxima carga (maybeSingle) fallaría por duplicados.
    if (guardadoTimer.current) clearTimeout(guardadoTimer.current)
    setEnviando(true)
    const payload = { ...buildPayload(), estado: 'enviada', fecha_envio: new Date().toISOString() }
    if (anamnesisId) {
      await supabase.from('anamnesis').update(payload).eq('id', anamnesisId)
    } else if (deportistaId) {
      await supabase.from('anamnesis').insert({ ...payload, id_deportista: deportistaId })
    }
    // Propagar la FC máx declarada a deportista.fc_maxima (de donde leen las tablas de zonas).
    const fcm = Number(fcMaxima)
    if (deportistaId && fcm > 0) await supabase.from('deportista').update({ fc_maxima: fcm }).eq('id', deportistaId)
    setEnviando(false)
    setYaEnviada(true)
  }

  const toggleDistancia = (d: string) => {
    setDistancias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  const addLesion = () => setLesiones(prev => [...prev, { zona: '', tipo: '', anio: '', recuperado: '' }])
  const updateLesion = (i: number, key: keyof Lesion, val: string) => {
    setLesiones(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l))
  }
  const removeLesion = (i: number) => setLesiones(prev => prev.filter((_, idx) => idx !== i))

  const inputCls = "w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700"
  const selectCls = "w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700"
  const labelCls = "block text-gray-300 text-sm font-medium mb-1"

  const BoolBtn = ({ value, onChange, label }: { value: boolean | null, onChange: (v: boolean) => void, label?: string }) => (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)}
        className={'px-5 py-2 rounded-lg text-sm font-medium transition border ' + (value === true ? 'bg-orange-500 border-orange-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-orange-500')}>
        Sí
      </button>
      <button type="button" onClick={() => onChange(false)}
        className={'px-5 py-2 rounded-lg text-sm font-medium transition border ' + (value === false ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500')}>
        No
      </button>
    </div>
  )

  if (yaEnviada) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-10 border border-green-600 max-w-md w-full text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-white mb-2">¡Anamnesis enviada!</h2>
        <p className="text-gray-400 text-sm mb-6">Tu entrenador ya puede ver tu ficha completa y preparar tu planificación.</p>
        <button onClick={() => router.push('/dashboard-deportista')}
          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-bold transition">
          Ir a mi panel →
        </button>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
          <p className="text-gray-500 text-xs">Ficha inicial del deportista</p>
        </div>
        <div className="text-right">
          {guardando && <p className="text-gray-500 text-xs">Guardando...</p>}
          {!guardando && ultimoGuardado && <p className="text-gray-500 text-xs">Guardado a las {ultimoGuardado}</p>}
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-white">Sección {seccion + 1} de {SECCIONES.length}: <span className="text-orange-400">{SECCIONES[seccion]}</span></p>
            <p className="text-gray-500 text-xs">{Math.round(((seccion + 1) / SECCIONES.length) * 100)}%</p>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div className="bg-orange-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${((seccion + 1) / SECCIONES.length) * 100}%` }} />
          </div>
          <div className="flex gap-1 mt-2 overflow-x-auto">
            {SECCIONES.map((s, i) => (
              <button key={i} onClick={() => setSeccion(i)}
                className={'text-xs px-2 py-0.5 rounded transition flex-shrink-0 ' + (i === seccion ? 'text-orange-400 font-medium' : 'text-gray-600 hover:text-gray-400')}>
                {i + 1}. {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* SECCIÓN 1 */}
        {seccion === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-bold mb-1">Datos personales</h2>
              <p className="text-gray-500 text-sm">Información básica para tu perfil deportivo.</p>
            </div>
            <div>
              <label className={labelCls}>Nombre completo *</label>
              <input className={inputCls} value={nombreCompleto} onChange={e => setNombreCompleto(e.target.value)} placeholder="Tu nombre completo" />
            </div>
            <div>
              <label className={labelCls}>Fecha de nacimiento *</label>
              <input type="date" className={inputCls} value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Sexo *</label>
              <select className={selectCls} value={sexo} onChange={e => setSexo(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Hombre</option>
                <option>Mujer</option>
                <option>Prefiero no decirlo</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Peso (kg) *</label>
                <input type="number" step="0.1" className={inputCls} value={peso} onChange={e => setPeso(e.target.value)} placeholder="70.5" />
              </div>
              <div>
                <label className={labelCls}>Talla (cm) *</label>
                <input type="number" className={inputCls} value={talla} onChange={e => setTalla(e.target.value)} placeholder="175" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-sm font-medium text-gray-300 mb-3">Contacto de emergencia *</p>
              <div className="flex flex-col gap-3">
                <input className={inputCls} value={contactoNombre} onChange={e => setContactoNombre(e.target.value)} placeholder="Nombre del contacto" />
                <input type="tel" className={inputCls} value={contactoTelefono} onChange={e => setContactoTelefono(e.target.value)} placeholder="Teléfono" />
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 2 */}
        {seccion === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Salud y contraindicaciones</h2>
              <p className="text-gray-500 text-sm">Basado en el cuestionario PAR-Q. Tu entrenador revisará esta información.</p>
            </div>
            {[
              { label: '¿Tienes o has tenido alguna enfermedad cardíaca o cardiovascular?', value: saludCardiaca, set: setSaludCardiaca, detalle: saludCardiacaDetalle, setDetalle: setSaludCardiacaDetalle, placeholder: 'Descríbela brevemente' },
              { label: '¿Alguien en tu familia directa ha sufrido un infarto o muerte súbita antes de los 50 años?', value: saludFamilia, set: setSaludFamilia },
              { label: '¿Tienes tensión arterial alta diagnosticada?', value: saludTension, set: setSaludTension },
              { label: '¿Tienes diabetes?', value: saludDiabetes, set: setSaludDiabetes },
              { label: '¿Tienes asma u otra enfermedad respiratoria?', value: saludAsma, set: setSaludAsma, detalle: saludAsmaDetalle, setDetalle: setSaludAsmaDetalle, placeholder: 'Descríbela' },
              { label: '¿Tomas algún medicamento de forma habitual?', value: saludMedicacion, set: setSaludMedicacion, detalle: saludMedicacionDetalle, setDetalle: setSaludMedicacionDetalle, placeholder: '¿Cuál?' },
              { label: '¿Tienes alguna alergia relevante?', value: saludAlergia, set: setSaludAlergia, detalle: saludAlergiaDetalle, setDetalle: setSaludAlergiaDetalle, placeholder: '¿A qué?' },
              { label: '¿Existe alguna razón médica por la que no deberías hacer ejercicio intenso?', value: saludRazon, set: setSaludRazon, detalle: saludRazonDetalle, setDetalle: setSaludRazonDetalle, placeholder: 'Explícala' },
            ].map((item, i) => (
              <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-sm text-gray-200 mb-3">{item.label}</p>
                <BoolBtn value={item.value ?? null} onChange={v => item.set(v)} />
                {item.value === true && item.setDetalle && (
                  <input className={inputCls + ' mt-3'} value={item.detalle} onChange={e => item.setDetalle!(e.target.value)} placeholder={item.placeholder} />
                )}
                {item.value === true && i === 3 && (
                  <select className={selectCls + ' mt-3'} value={saludDiabetesTipo} onChange={e => setSaludDiabetesTipo(e.target.value)}>
                    <option value="">Tipo...</option>
                    <option>Tipo 1</option>
                    <option>Tipo 2</option>
                  </select>
                )}
              </div>
            ))}

            <div className="bg-orange-950 border border-orange-700 rounded-xl p-4">
              <p className="text-orange-200 text-sm font-medium mb-1">⚠️ Declaración de responsabilidad</p>
              <p className="text-orange-300 text-xs mb-3">Declaro que la información proporcionada es veraz y que soy consciente de que el entrenamiento intenso puede conllevar riesgos para la salud. En caso de haber indicado antecedentes de salud, me comprometo a obtener autorización médica antes de comenzar.</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={declaracion} onChange={e => setDeclaracion(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                <span className="text-orange-200 text-sm font-medium">Acepto y confirmo esta declaración *</span>
              </label>
            </div>
          </div>
        )}

        {/* SECCIÓN 3 */}
        {seccion === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Historial de lesiones</h2>
              <p className="text-gray-500 text-sm">Para que tu entrenador pueda adaptar la carga desde el primer día.</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm text-gray-200 mb-3">¿Has tenido alguna lesión importante en los últimos 2 años?</p>
              <BoolBtn value={lesionesRecientes} onChange={setLesionesRecientes} />
            </div>
            {lesionesRecientes === true && (
              <>
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-sm text-gray-200 mb-3">¿Estás recuperado al 100% de todas ellas?</p>
                  <div className="flex gap-2 flex-wrap">
                    {['Sí', 'No', 'Parcialmente'].map(op => (
                      <button key={op} type="button" onClick={() => setLesionesRecuperado(op)}
                        className={'px-4 py-2 rounded-lg text-sm font-medium transition border ' + (lesionesRecuperado === op ? 'bg-orange-500 border-orange-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-orange-500')}>
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-300">Lista de lesiones</p>
                    <button type="button" onClick={addLesion} className="text-orange-400 hover:text-orange-300 text-sm transition">+ Añadir lesión</button>
                  </div>
                  {lesiones.length === 0 && <p className="text-gray-600 text-sm">Pulsa "Añadir lesión" para registrar cada una.</p>}
                  {lesiones.map((l, i) => (
                    <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-3">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Lesión {i + 1}</p>
                        <button type="button" onClick={() => removeLesion(i)} className="text-gray-600 hover:text-red-400 text-xs transition">Eliminar</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Zona</label>
                          <select className={selectCls} value={l.zona} onChange={e => updateLesion(i, 'zona', e.target.value)}>
                            <option value="">—</option>
                            {ZONAS_CUERPO.map(z => <option key={z}>{z}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Tipo</label>
                          <select className={selectCls} value={l.tipo} onChange={e => updateLesion(i, 'tipo', e.target.value)}>
                            <option value="">—</option>
                            {TIPOS_LESION.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">Año aprox.</label>
                          <input className={inputCls} value={l.anio} onChange={e => updateLesion(i, 'anio', e.target.value)} placeholder="2023" />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs mb-1 block">¿Recuperado?</label>
                          <select className={selectCls} value={l.recuperado} onChange={e => updateLesion(i, 'recuperado', e.target.value)}>
                            <option value="">—</option>
                            <option>Sí</option>
                            <option>No</option>
                            <option>Parcialmente</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm text-gray-200 mb-3">¿Tienes alguna molestia o dolor crónico actualmente?</p>
              <BoolBtn value={dolorcronico} onChange={setDolorCronico} />
              {dolorcronico === true && (
                <input className={inputCls + ' mt-3'} value={dolorcronicoDet} onChange={e => setDolorCronicoDet(e.target.value)} placeholder="¿Dónde y desde cuándo?" />
              )}
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm text-gray-200 mb-3">¿Llevas más de 3 meses sin entrenar por lesión o enfermedad?</p>
              <BoolBtn value={sinEntrenar} onChange={setSinEntrenar} />
              {sinEntrenar === true && (
                <input className={inputCls + ' mt-3'} value={sinEntrenarDet} onChange={e => setSinEntrenarDet(e.target.value)} placeholder="¿Por qué?" />
              )}
            </div>
          </div>
        )}

        {/* SECCIÓN 4 */}
        {seccion === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-bold mb-1">Perfil deportivo</h2>
              <p className="text-gray-500 text-sm">Tu experiencia y nivel actual en triatlón.</p>
            </div>
            <div>
              <label className={labelCls}>¿Cuántos años llevas practicando triatlón?</label>
              <select className={selectCls} value={aniosTriatlon} onChange={e => setAniosTriatlon(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Menos de 1 año</option>
                <option>1–3 años</option>
                <option>3–5 años</option>
                <option>Más de 5 años</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>¿Qué distancias has completado? (puedes marcar varias)</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {['Sprint', 'Olímpico', '70.3', 'Ironman', 'Ninguna todavía'].map(d => (
                  <button key={d} type="button" onClick={() => toggleDistancia(d)}
                    className={'px-4 py-2 rounded-lg text-sm font-medium transition border ' + (distancias.includes(d) ? 'bg-orange-500 border-orange-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-orange-500')}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Nivel competitivo</label>
              <select className={selectCls} value={nivelCompetitivo} onChange={e => setNivelCompetitivo(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Popular / Recreativo</option>
                <option>Amateur competitivo</option>
                <option>Élite</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Disciplina más fuerte</label>
                <select className={selectCls} value={disciplinaFuerte} onChange={e => setDisciplinaFuerte(e.target.value)}>
                  <option value="">—</option>
                  <option>Natación</option>
                  <option>Ciclismo</option>
                  <option>Carrera</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Disciplina más débil</label>
                <select className={selectCls} value={disciplinaDebil} onChange={e => setDisciplinaDebil(e.target.value)}>
                  <option value="">—</option>
                  <option>Natación</option>
                  <option>Ciclismo</option>
                  <option>Carrera</option>
                </select>
              </div>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm text-gray-200 mb-3">¿Practicabas otro deporte antes del triatlón?</p>
              <BoolBtn value={deporteAnterior} onChange={setDeporteAnterior} />
              {deporteAnterior === true && (
                <input className={inputCls + ' mt-3'} value={deporteAnteriorDet} onChange={e => setDeporteAnteriorDet(e.target.value)} placeholder="¿Cuál y cuántos años?" />
              )}
            </div>
            <div>
              <label className={labelCls}>Volumen semanal habitual</label>
              <select className={selectCls} value={volumenSemanal} onChange={e => setVolumenSemanal(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Menos de 5h</option>
                <option>5–8h</option>
                <option>8–12h</option>
                <option>Más de 12h</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Días de entrenamiento por semana</label>
              <select className={selectCls} value={diasSemana} onChange={e => setDiasSemana(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>1–2 días</option>
                <option>3–4 días</option>
                <option>5–6 días</option>
                <option>Todos los días</option>
              </select>
            </div>
          </div>
        )}

        {/* SECCIÓN 5 */}
        {seccion === 4 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-bold mb-1">Parámetros de rendimiento</h2>
              <div className="bg-blue-950 border border-blue-700 rounded-xl p-3 mt-2">
                <p className="text-blue-300 text-sm">Sección opcional — Si no tienes estos datos, no pasa nada. Tu entrenador los completará tras los primeros tests.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>FC máxima (ppm)</label>
                <input type="number" className={inputCls} value={fcMaxima} onChange={e => setFcMaxima(e.target.value)} placeholder="185" />
              </div>
              <div>
                <label className={labelCls}>FC de reposo (ppm)</label>
                <input type="number" className={inputCls} value={fcReposo} onChange={e => setFcReposo(e.target.value)} placeholder="48" />
              </div>
              <div>
                <label className={labelCls}>FTP ciclismo (W)</label>
                <input type="number" className={inputCls} value={ftpVal} onChange={e => setFtpVal(e.target.value)} placeholder="250" />
              </div>
              <div>
                <label className={labelCls}>CSS natación (min:seg/100m)</label>
                <input className={inputCls} value={cssVal} onChange={e => setCssVal(e.target.value)} placeholder="1:35" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Ritmo de umbral carrera (min:seg/km)</label>
              <input className={inputCls} value={ritmoUmbral} onChange={e => setRitmoUmbral(e.target.value)} placeholder="4:30" />
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: '¿Tienes potenciómetro en la bici?', value: tienePotenciometro, set: setTienePotenciometro },
                { label: '¿Usas pulsómetro o GPS?', value: usaPulsometro, set: setUsaPulsometro },
                { label: '¿Mides el HRV?', value: mideHrv, set: setMideHrv },
              ].map((item, i) => (
                <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-sm text-gray-200 mb-3">{item.label}</p>
                  <BoolBtn value={item.value} onChange={item.set} />
                  {i === 2 && mideHrv === true && (
                    <input className={inputCls + ' mt-3'} value={hrvDispositivo} onChange={e => setHrvDispositivo(e.target.value)} placeholder="¿Con qué dispositivo?" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECCIÓN 6 */}
        {seccion === 5 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-bold mb-1">Hábitos de vida</h2>
              <p className="text-gray-500 text-sm">Contexto que ayuda a interpretar tu bienestar diario.</p>
            </div>
            <div>
              <label className={labelCls}>¿Cuántas horas duermes habitualmente?</label>
              <select className={selectCls} value={horasSueno} onChange={e => setHorasSueno(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Menos de 6h</option>
                <option>6–7h</option>
                <option>7–8h</option>
                <option>Más de 8h</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>¿Cómo es tu actividad diaria?</label>
              <select className={selectCls} value={actividadDiaria} onChange={e => setActividadDiaria(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Sedentario (oficina / estudio)</option>
                <option>Activo (de pie o caminando)</option>
                <option>Físicamente exigente</option>
                <option>Trabajo en turnos de noche</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Nivel de estrés en el día a día</label>
              <div className="flex gap-2">
                {['Bajo', 'Moderado', 'Alto'].map(op => (
                  <button key={op} type="button" onClick={() => setNivelEstres(op)}
                    className={'flex-1 py-3 rounded-lg text-sm font-medium transition border ' + (nivelEstres === op ? 'bg-orange-500 border-orange-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-orange-500')}>
                    {op}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>¿Sigues alguna dieta específica?</label>
              <select className={selectCls} value={dieta} onChange={e => setDieta(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Ninguna en especial</option>
                <option>Vegetariana</option>
                <option>Vegana</option>
                <option>Sin gluten</option>
                <option>Otra</option>
              </select>
            </div>
          </div>
        )}

        {/* SECCIÓN 7 */}
        {seccion === 6 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-bold mb-1">Objetivos</h2>
              <p className="text-gray-500 text-sm">Tu entrenador usará esto para diseñar toda la temporada.</p>
            </div>
            <div>
              <label className={labelCls}>¿Cuál es tu prueba objetivo de esta temporada?</label>
              <input className={inputCls} value={pruebaObjetivo} onChange={e => setPruebaObjetivo(e.target.value)} placeholder="Ej: Ironman 70.3 Vitoria" />
            </div>
            <div>
              <label className={labelCls}>¿Cuándo es esa prueba?</label>
              <input type="date" className={inputCls} value={pruebaFecha} onChange={e => setPruebaFecha(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>¿Qué distancia es?</label>
              <select className={selectCls} value={pruebaDistancia} onChange={e => setPruebaDistancia(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Sprint</option>
                <option>Olímpico</option>
                <option>70.3</option>
                <option>Ironman</option>
                <option>Otra</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>¿Cuál es tu objetivo principal en esa prueba?</label>
              <select className={selectCls} value={objetivoPrincipal} onChange={e => setObjetivoPrincipal(e.target.value)}>
                <option value="">Selecciona...</option>
                <option>Completarla</option>
                <option>Mejorar mi marca</option>
                <option>Clasificarme</option>
                <option>Ganar mi grupo de edad</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>¿Por qué haces triatlón?</label>
              <textarea className={inputCls} rows={3} value={motivacion} onChange={e => setMotivacion(e.target.value)} placeholder="En 1-2 frases, cuéntanos tu motivación..." />
            </div>
            <div>
              <label className={labelCls}>¿Hay algo que quieras que tu entrenador sepa antes de empezar?</label>
              <textarea className={inputCls} rows={3} value={mensajeEntrenador} onChange={e => setMensajeEntrenador(e.target.value)} placeholder="Campo abierto — solo lo verá tu entrenador." />
            </div>

            {/* Resumen de alertas de salud */}
            {[saludCardiaca, saludFamilia, saludTension, saludDiabetes, saludAsma, saludMedicacion, saludAlergia, saludRazon].some(v => v === true) && (
              <div className="bg-orange-950 border border-orange-700 rounded-xl p-4">
                <p className="text-orange-300 text-sm font-medium">⚠️ Tu entrenador recibirá un aviso de salud</p>
                <p className="text-orange-400 text-xs mt-1">Has indicado antecedentes médicos. Tu entrenador revisará tu ficha antes de planificar la carga.</p>
              </div>
            )}

            <button onClick={enviar} disabled={enviando || !declaracion}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white py-4 rounded-xl font-bold text-lg transition mt-2">
              {enviando ? 'Enviando...' : '✓ Enviar al entrenador'}
            </button>
            {!declaracion && (
              <p className="text-red-400 text-xs text-center">Debes aceptar la declaración de responsabilidad en la sección Salud para poder enviar.</p>
            )}
          </div>
        )}

        {/* Navegación */}
        <div className="flex justify-between mt-10 pt-6 border-t border-gray-800">
          <button onClick={() => setSeccion(s => Math.max(0, s - 1))} disabled={seccion === 0}
            className="px-6 py-3 rounded-lg text-sm font-medium transition border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-30">
            ← Anterior
          </button>
          {seccion < SECCIONES.length - 1 && (
            <button onClick={() => setSeccion(s => Math.min(SECCIONES.length - 1, s + 1))}
              className="px-6 py-3 rounded-lg text-sm font-medium transition bg-orange-500 hover:bg-orange-600 text-white">
              Siguiente →
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
