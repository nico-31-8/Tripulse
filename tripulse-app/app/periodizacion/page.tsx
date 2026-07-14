'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import GraficaPeriodizacion from '@/components/GraficaPeriodizacion'

const MODELOS = [
  {
    key: 'Tradicional',
    emoji: '📈',
    color: 'border-orange-500',
    colorTexto: 'text-orange-400',
    colorBg: 'bg-orange-900/20',
    resumen: 'El modelo clásico de Matveyev. Volumen alto al principio que va bajando progresivamente mientras la intensidad sube hacia la competición.',
    ideal: 'Deportistas con poca base aeróbica o temporadas largas de más de 20 semanas.',
    cuando: 'Primera temporada de triatlón, regreso tras lesión larga, o cuando el deportista necesita construir base desde cero.',
    fases: [
      { nombre: 'Fase General', porcentaje: '40-50%', zonas: 'Z1-Z2', descripcion: 'Volumen máximo. Fuerza de base. Trabajo técnico de natación. Rodajes largos suaves.' },
      { nombre: 'Fase Específica', porcentaje: '30-40%', zonas: 'Z3-Z4', descripcion: 'Volumen medio. Series de umbral. Trabajo específico por disciplina. Intensidad media-alta.' },
      { nombre: 'Fase Competitiva', porcentaje: '15-20%', zonas: 'Z4-Z5', descripcion: 'Volumen bajo. Simulaciones de carrera. Intensidad alta. Ritmos de competición.' },
      { nombre: 'Taper', porcentaje: '1-2 semanas', zonas: 'Z1-Z2', descripcion: 'Reducción drástica de volumen. Mantener algo de intensidad para no perder la forma.' },
    ]
  },
  {
    key: 'Inversa',
    emoji: '🔄',
    color: 'border-blue-500',
    colorTexto: 'text-blue-400',
    colorBg: 'bg-blue-900/20',
    resumen: 'El modelo opuesto al tradicional. Empieza con alta intensidad y bajo volumen, y progresivamente aumenta el volumen mientras reduce la intensidad.',
    ideal: 'Deportistas con buena base aeróbica o temporadas cortas de menos de 16 semanas.',
    cuando: 'Deportista con años de experiencia que ya tiene base aeróbica sólida y necesita desarrollar velocidad específica.',
    fases: [
      { nombre: 'Fase de Intensidad', porcentaje: '25-35%', zonas: 'Z4-Z6', descripcion: 'Alta intensidad desde el inicio. Series cortas y potentes. Fuerza máxima. Poco volumen total.' },
      { nombre: 'Fase de Desarrollo', porcentaje: '35-45%', zonas: 'Z3-Z4', descripcion: 'El volumen empieza a subir. Umbral sostenido. Sesiones más largas. Intensidad moderada.' },
      { nombre: 'Resistencia Específica', porcentaje: '20-25%', zonas: 'Z2-Z3', descripcion: 'Volumen máximo. Se aplica la velocidad desarrollada en sesiones largas.' },
      { nombre: 'Taper', porcentaje: '1-2 semanas', zonas: 'Z1-Z2', descripcion: 'Reducción drástica. Mantener activación sin acumular fatiga.' },
    ]
  },
  {
    key: 'ATR',
    emoji: '🔁',
    color: 'border-green-500',
    colorTexto: 'text-green-400',
    colorBg: 'bg-green-900/20',
    resumen: 'Acumulación-Transmutación-Realización. Desarrollado por Issurin. Bloques cortos encadenados con objetivos específicos. El modelo más usado en triatlón de alto rendimiento.',
    ideal: 'Deportistas con experiencia y temporadas con varias competiciones.',
    cuando: 'Deportista que ya conoce su cuerpo, tiene buena base y necesita peaking para varias competiciones durante la temporada.',
    fases: [
      { nombre: 'Acumulación', porcentaje: '3-6 semanas', zonas: 'Z1-Z3', descripcion: 'Volumen alto. Base aeróbica. Fuerza resistencia. Técnica. El bloque más largo de los tres.' },
      { nombre: 'Transmutación', porcentaje: '2-4 semanas', zonas: 'Z3-Z5', descripcion: 'Transforma la base en velocidad específica. Series de umbral. Trabajo por disciplina.' },
      { nombre: 'Realización', porcentaje: '1-2 semanas', zonas: 'Z4-Z6', descripcion: 'Puesta a punto. Volumen bajo, intensidad máxima. Simulaciones de carrera.' },
      { nombre: 'Taper', porcentaje: '1 semana', zonas: 'Z1-Z2', descripcion: 'Descarga total. Frescura máxima para la competición.' },
    ]
  },
  {
    key: 'Ondulatoria',
    emoji: '〰️',
    color: 'border-purple-500',
    colorTexto: 'text-purple-400',
    colorBg: 'bg-purple-900/20',
    resumen: 'La carga oscila cada semana con un patrón 3:1 — tres semanas de carga progresiva y una de recuperación. El techo de cada ola sube gradualmente.',
    ideal: 'Deportistas que compiten frecuentemente o que no toleran bien las cargas mantenidas durante semanas.',
    cuando: 'Temporadas con muchas competiciones, deportistas que se recuperan lento o que necesitan variedad para mantener la motivación.',
    fases: [
      { nombre: 'Semana de Carga Alta', porcentaje: 'Semanas 1, 2 y 3 de cada ciclo', zonas: 'Z2-Z4', descripcion: 'Volumen e intensidad crecientes. Sesiones largas con bloques de calidad.' },
      { nombre: 'Semana de Recuperación', porcentaje: 'Semana 4 de cada ciclo', zonas: 'Z1-Z2', descripcion: 'Volumen muy reducido. Intensidad baja. El cuerpo asimila y supera la carga anterior.' },
    ]
  },
]

export default function PeriodizacionPage() {
  const router = useRouter()
  const [modeloActivo, setModeloActivo] = useState('Tradicional')
  const modelo = MODELOS.find(m => m.key === modeloActivo)!

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm transition">← Volver</button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Modelos de periodización</h2>
        <p className="text-gray-400 text-sm mb-8">Guía para elegir el modelo más adecuado para cada deportista y temporada</p>

        {/* Selector de modelos */}
        <div className="flex gap-2 flex-wrap mb-8">
          {MODELOS.map(m => (
            <button key={m.key} onClick={() => setModeloActivo(m.key)}
              className={'px-5 py-2.5 rounded-xl text-sm font-medium transition border-2 ' +
                (modeloActivo === m.key ? m.color + ' ' + m.colorBg + ' ' + m.colorTexto : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white')}>
              {m.emoji} {m.key}
            </button>
          ))}
        </div>

        {/* Contenido del modelo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Columna izquierda */}
          <div className="flex flex-col gap-4">
            <div className={'rounded-xl p-5 border-l-4 bg-gray-900 ' + modelo.color}>
              <h3 className={'text-xl font-bold mb-2 ' + modelo.colorTexto}>{modelo.emoji} {modelo.key}</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{modelo.resumen}</p>
            </div>

            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Ideal para</p>
              <p className="text-white text-sm">✓ {modelo.ideal}</p>
            </div>

            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Cuándo usarlo</p>
              <p className="text-gray-300 text-sm leading-relaxed">{modelo.cuando}</p>
            </div>

            {/* Gráfica */}
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Curva de carga teórica</p>
              <GraficaPeriodizacion modelo={modelo.key} mostrarInfo={false} />
            </div>
          </div>

          {/* Columna derecha — fases */}
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Fases del modelo</p>
            {modelo.fases.map((fase, i) => (
              <div key={i} className={'rounded-xl p-4 border bg-gray-900 border-l-4 ' + modelo.color}>
                <div className="flex justify-between items-start mb-2">
                  <p className={'font-bold text-sm ' + modelo.colorTexto}>{fase.nombre}</p>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{fase.porcentaje}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500">Zonas:</span>
                  <span className={'text-xs font-medium ' + modelo.colorTexto}>{fase.zonas}</span>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed">{fase.descripcion}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabla comparativa */}
        <div className="mt-8 bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="font-bold text-white mb-4">Comparativa rápida</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 px-3">Modelo</th>
                  <th className="text-center py-2 px-3">Duración ideal</th>
                  <th className="text-center py-2 px-3">Experiencia</th>
                  <th className="text-center py-2 px-3">Competiciones</th>
                  <th className="text-center py-2 px-3">Complejidad</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { modelo: '📈 Tradicional', duracion: '+20 semanas', exp: 'Baja-Media', comp: '1 principal', complejidad: '⭐⭐' },
                  { modelo: '🔄 Inversa', duracion: '-16 semanas', exp: 'Media-Alta', comp: '1 principal', complejidad: '⭐⭐⭐' },
                  { modelo: '🔁 ATR', duracion: '12-24 semanas', exp: 'Alta', comp: 'Varias', complejidad: '⭐⭐⭐⭐' },
                  { modelo: '〰️ Ondulatoria', duracion: 'Flexible', exp: 'Cualquiera', comp: 'Muchas', complejidad: '⭐⭐⭐' },
                ].map((r, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                    <td className="py-2.5 px-3 font-medium text-white">{r.modelo}</td>
                    <td className="py-2.5 px-3 text-center text-gray-400">{r.duracion}</td>
                    <td className="py-2.5 px-3 text-center text-gray-400">{r.exp}</td>
                    <td className="py-2.5 px-3 text-center text-gray-400">{r.comp}</td>
                    <td className="py-2.5 px-3 text-center text-gray-400">{r.complejidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}

