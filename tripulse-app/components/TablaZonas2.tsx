// Tabla de las 9 zonas de resistencia (Zonas 2: AER, AEL, AEM, AEI, PAE, CLA,
// PLA, CALA, PALA), agrupadas por factor. La intensidad de cada zona sale de
// prescripcion() con los tests del deportista (VAM/CSS/FTP). Compartida entre la
// vista del entrenador (zonas/[id]) y la del deportista (mis-tests).
import { ZONAS_RESISTENCIA, FACTORES_RESISTENCIA, prescripcion } from '@/lib/zonas'

export function TablaZonas2({ disciplina, tests, fcMax }: { disciplina: string; tests: { vam?: number | null; ftp?: number | null; css?: number | null }; fcMax: number }) {
  return (
    <div className="flex flex-col gap-5">
      {FACTORES_RESISTENCIA.map(factor => {
        const zs = ZONAS_RESISTENCIA.filter(z => z.factor === factor)
        if (!zs.length) return null
        return (
          <div key={factor}>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">{factor}</p>
            <div className="grid gap-2">
              {zs.map(z => {
                const fc = (z.fcMin || z.fcMax) && fcMax > 0
                  ? `${z.fcMin ? Math.round(fcMax * z.fcMin / 100) : ''}${z.fcMin && z.fcMax ? '–' : ''}${z.fcMax ? Math.round(fcMax * z.fcMax / 100) : ''} ppm`
                  : null
                return (
                  <div key={z.sigla} className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs px-2 py-1 rounded-full font-bold text-white flex-shrink-0" style={{ backgroundColor: z.color }}>{z.sigla}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{z.nombre}</p>
                        <p className="text-gray-500 text-xs">RPE {z.rpeMin}{z.rpeMax !== z.rpeMin ? `–${z.rpeMax}` : ''} · {z.indicador} · {z.duracion}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-orange-400 text-sm font-medium">{prescripcion(z, disciplina, tests)}</p>
                      {fc && <p className="text-gray-500 text-xs">{fc}</p>}
                      {z.requiereSprint && <p className="text-yellow-500/80 text-xs">⚡ requiere test sprint</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
