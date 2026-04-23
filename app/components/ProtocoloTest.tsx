'use client'
import { useState } from 'react'

const PROTOCOLOS: Record<string, { titulo: string, material: string[], calentamiento: string, protocolo: string[], consideraciones: string[] }> = {
  carrera: {
    titulo: 'Test incremental de carrera — Protocolo',
    material: ['Pista de atletismo o cinta de correr con control de velocidad', 'Pulsometro o reloj GPS', 'Cronometro'],
    calentamiento: '10-15 minutos de carrera suave (Z1-Z2) seguidos de 5 minutos de estiramientos dinamicos.',
    protocolo: ['Empieza a una velocidad comoda (8-10 km/h segun el nivel del atleta)', 'Aumenta la velocidad en el incremento definido (normalmente 1 km/h) cada escalon', 'Cada escalon dura el tiempo definido (normalmente 3 minutos)', 'El atleta corre hasta el agotamiento voluntario o hasta que no puede mantener la velocidad', 'Anota la velocidad del ultimo escalon completado y el tiempo aguantado en el escalon fallido', 'La VAM se calcula automaticamente con estos datos'],
    consideraciones: ['Realizar en condiciones de descanso (minimo 48h sin entreno intenso)', 'Temperatura ideal entre 15-20 grados', 'No realizar tras una comida copiosa (minimo 2h de ayuno)', 'El atleta debe conocer el protocolo antes de empezar']
  },
  natacion: {
    titulo: 'Test CSS natacion — Protocolo',
    material: ['Piscina de 25m o 50m', 'Cronometro de precision', 'Pulsometro opcional'],
    calentamiento: '400-600m de natacion suave con diferentes estilos y ejercicios tecnicos.',
    protocolo: ['Nada 400m al maximo esfuerzo sostenible (no sprint, ritmo de competicion)', 'Descansa 10-15 minutos de recuperacion activa suave', 'Nada 200m al maximo esfuerzo', 'Anota los tiempos de ambas pruebas en segundos', 'La CSS se calcula como: (400-200) / (T400-T200) en m/s', 'El resultado se convierte automaticamente a min/100m'],
    consideraciones: ['Usar el mismo estilo en ambas pruebas (normalmente crol)', 'El atleta debe estar descansado (48h sin sesion intensa)', 'Realizar en las mismas condiciones (misma piscina, misma hora)', 'Con experiencia suficiente se puede hacer con 400m y 50m para mayor precision']
  },
  ciclismo: {
    titulo: 'Test FTP ciclismo — Protocolo',
    material: ['Rodillo o bicicleta con potenciometro', 'Pulsometro', 'Ventilador recomendado en rodillo'],
    calentamiento: '20 minutos progresivos: 10 min suave + 3x1 min al 90% + 5 min suave.',
    protocolo: ['Pedalea a una potencia comoda inicial (segun nivel del atleta)', 'Aumenta la potencia en el incremento definido cada escalon', 'Cada escalon dura el tiempo definido (normalmente 3-5 minutos)', 'Continua hasta el agotamiento voluntario o imposibilidad de mantener la cadencia', 'Anota la potencia pico, el tiempo aguantado en el ultimo escalon completado y en el no completado', 'El FTP se calcula automaticamente con estos datos'],
    consideraciones: ['El test en rodillo da valores mas fiables que en carretera', 'Mantener una cadencia constante (85-95 rpm recomendado)', 'El atleta no debe ver su potencia en tiempo real — tapar el ordenador', 'Realizar siempre en las mismas condiciones para comparar tests']
  },
  fuerza: {
    titulo: 'Test 1RM fuerza — Protocolo',
    material: ['Barra y discos calibrados', 'Banco o rack segun ejercicio', 'Observador de seguridad obligatorio'],
    calentamiento: '10 min cardio suave + series especificas: 15 reps al 50%, 8 reps al 70%, 3 reps al 85%.',
    protocolo: ['Opcion A — 1RM directo: intenta el maximo peso en 1 repeticion. Descansa 3-5 min entre intentos.', 'Opcion B — 1RM estimado (mas seguro): realiza un peso submaximal al fallo tecnico (2-10 reps)', 'Formula de Epley: peso × (1 + repeticiones/30)', 'Ejemplo: 80kg × 5 reps → 1RM estimado = 93 kg'],
    consideraciones: ['Nunca realizar sin observador en ejercicios de barra libre', 'La tecnica correcta es prioritaria sobre el peso', 'El 1RM estimado con 2-5 reps es mas fiable que con 8-10', 'Esperar minimo 72h tras el ultimo entreno intenso de fuerza']
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
