'use client'
import { useState } from 'react'

const PROTOCOLOS: Record<string, { titulo: string, material: string[], calentamiento: string, protocolo: string[], consideraciones: string[] }> = {
  carrera: {
    titulo: 'Test incremental de carrera',
    material: ['Pista o cinta con control de velocidad', 'Pulsometro o reloj GPS', 'Cronometro'],
    calentamiento: '10-15 minutos de carrera suave (Z1-Z2) + 5 minutos de estiramientos dinamicos.',
    protocolo: ['Empieza a velocidad comoda (8-10 km/h segun nivel)', 'Aumenta la velocidad en el incremento definido cada escalon', 'Cada escalon dura el tiempo definido (normalmente 3 minutos)', 'Corre hasta el agotamiento voluntario', 'Anota velocidad del ultimo escalon y tiempo aguantado en el fallido', 'La VAM se calcula automaticamente'],
    consideraciones: ['Minimo 48h sin entreno intenso antes', 'Temperatura ideal 15-20 grados', 'No realizar tras comida copiosa (minimo 2h de ayuno)', 'El atleta debe conocer el protocolo antes de empezar']
  },
  natacion: {
    titulo: 'Test CSS natacion',
    material: ['Piscina de 25m o 50m', 'Cronometro de precision', 'Pulsometro opcional'],
    calentamiento: '400-600m de natacion suave con diferentes estilos y ejercicios tecnicos.',
    protocolo: ['Nada 400m al maximo esfuerzo sostenible', 'Descansa 10-15 minutos de recuperacion activa', 'Nada 200m al maximo esfuerzo', 'Anota los tiempos en segundos', 'CSS = (400-200) / (T400-T200) en m/s', 'El resultado se convierte automaticamente a min/100m'],
    consideraciones: ['Usar el mismo estilo en ambas pruebas (normalmente crol)', 'Atleta descansado (48h sin sesion intensa)', 'Mismas condiciones en ambas pruebas', 'Con experiencia se puede usar 400m y 50m para mayor precision']
  },
  ciclismo: {
    titulo: 'Test FTP ciclismo',
    material: ['Rodillo o bicicleta con potenciometro', 'Pulsometro', 'Ventilador recomendado en rodillo'],
    calentamiento: '20 min progresivos: 10 min suave + 3x1 min al 90% + 5 min suave.',
    protocolo: ['Pedalea a potencia comoda inicial', 'Aumenta la potencia en el incremento definido cada escalon', 'Cada escalon dura el tiempo definido (normalmente 3-5 minutos)', 'Continua hasta agotamiento o imposibilidad de mantener cadencia', 'Anota potencia pico y tiempos aguantados', 'El FTP se calcula automaticamente'],
    consideraciones: ['El rodillo da valores mas fiables que carretera', 'Mantener cadencia constante (85-95 rpm)', 'Tapar el ordenador — el atleta no debe ver su potencia en tiempo real', 'Realizar siempre en las mismas condiciones']
  },
  fuerza: {
    titulo: 'Test 1RM fuerza',
    material: ['Barra y discos calibrados', 'Banco o rack segun ejercicio', 'Observador de seguridad obligatorio'],
    calentamiento: '10 min cardio suave + series especificas: 15 reps al 50%, 8 reps al 70%, 3 reps al 85%.',
    protocolo: ['Opcion A (1RM directo): intenta el maximo peso en 1 repeticion. Descansa 3-5 min entre intentos.', 'Opcion B (estimado, mas seguro): realiza un peso submaximal al fallo tecnico (2-10 reps)', 'Formula de Epley: peso x (1 + repeticiones/30)', 'Ejemplo: 80kg x 5 reps = 1RM estimado 93 kg'],
    consideraciones: ['Nunca sin observador en ejercicios de barra libre', 'La tecnica correcta es prioritaria sobre el peso', 'El estimado con 2-5 reps es mas fiable que con 8-10', 'Minimo 72h tras el ultimo entreno intenso de fuerza']
  }
}

export default function ProtocoloTest({ tipo }: { tipo: string }) {
  const [abierto, setAbierto] = useState(false)
  const protocolo = PROTOCOLOS[tipo]
  if (!protocolo) return null

  return (
    <div className="mb-4">
      <button onClick={() => setAbierto(!abierto)} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition">
        <span>{abierto ? '▼' : '▶'}</span>
        <span>Como se hace este test?</span>
      </button>
      {abierto && (
        <div className="mt-3 bg-gray-800 rounded-xl p-5 border border-gray-700 text-sm">
          <h4 className="font-bold text-white mb-4">{protocolo.titulo}</h4>
          <div className="mb-3"><p className="text-orange-400 font-medium mb-1">Material necesario</p><ul className="list-disc list-inside text-gray-300 space-y-1">{protocolo.material.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
          <div className="mb-3"><p className="text-orange-400 font-medium mb-1">Calentamiento</p><p className="text-gray-300">{protocolo.calentamiento}</p></div>
          <div className="mb-3"><p className="text-orange-400 font-medium mb-1">Protocolo</p><ol className="list-decimal list-inside text-gray-300 space-y-1">{protocolo.protocolo.map((p, i) => <li key={i}>{p}</li>)}</ol></div>
          <div><p className="text-orange-400 font-medium mb-1">Consideraciones</p><ul className="list-disc list-inside text-gray-300 space-y-1">{protocolo.consideraciones.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
        </div>
      )}
    </div>
  )
}
