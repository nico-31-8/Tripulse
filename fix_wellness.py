path = '/workspaces/Tripulse/tripulse-app/app/wellness/[id]/page.tsx'
content = open(path).read()

old = '''function SliderInput({ label, value, onChange, min = 1, max = 7, descripcionInf, descripcionSup }: any) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-white font-medium text-sm">{label}</label>
        <span className="text-orange-400 font-bold text-lg">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-orange-500" />
      <div className="flex justify-between text-gray-500 text-xs mt-1">
        <span>{descripcionInf}</span>
        <span>{descripcionSup}</span>
      </div>
    </div>
  )
}'''

new = '''const EMOJI_CONFIG: Record<string, { label: string; opciones: { emoji: string; texto: string }[] }> = {
  calidad_sueno: { label: 'Calidad del sueno', opciones: [{ emoji: '\U0001F634', texto: 'Perfecta' },{ emoji: '\U0001F60A', texto: 'Muy buena' },{ emoji: '\U0001F642', texto: 'Buena' },{ emoji: '\U0001F610', texto: 'Regular' },{ emoji: '\U0001F62A', texto: 'Mala' },{ emoji: '\U0001F629', texto: 'Muy mala' },{ emoji: '\U0001F480', texto: 'Pesima' }] },
  fatiga: { label: 'Fatiga percibida', opciones: [{ emoji: '\u26A1', texto: 'Sin fatiga' },{ emoji: '\U0001F4AA', texto: 'Muy leve' },{ emoji: '\U0001F642', texto: 'Leve' },{ emoji: '\U0001F610', texto: 'Moderada' },{ emoji: '\U0001F613', texto: 'Alta' },{ emoji: '\U0001F629', texto: 'Muy alta' },{ emoji: '\U0001F480', texto: 'Agotado' }] },
  estres: { label: 'Estres general', opciones: [{ emoji: '\U0001F60C', texto: 'Ninguno' },{ emoji: '\U0001F642', texto: 'Muy bajo' },{ emoji: '\U0001F610', texto: 'Bajo' },{ emoji: '\U0001F624', texto: 'Moderado' },{ emoji: '\U0001F630', texto: 'Alto' },{ emoji: '\U0001F631', texto: 'Muy alto' },{ emoji: '\U0001F92F', texto: 'Extremo' }] },
  dolor_muscular: { label: 'Dolor muscular', opciones: [{ emoji: '\u2705', texto: 'Sin dolor' },{ emoji: '\U0001F7E2', texto: 'Muy leve' },{ emoji: '\U0001F7E1', texto: 'Leve' },{ emoji: '\U0001F7E0', texto: 'Moderado' },{ emoji: '\U0001F534', texto: 'Alto' },{ emoji: '\U0001F623', texto: 'Muy alto' },{ emoji: '\U0001F6A8', texto: 'Intenso' }] },
  animo: { label: 'Estado de animo', opciones: [{ emoji: '\U0001F62D', texto: 'Muy malo' },{ emoji: '\U0001F61E', texto: 'Malo' },{ emoji: '\U0001F615', texto: 'Regular' },{ emoji: '\U0001F610', texto: 'Neutro' },{ emoji: '\U0001F642', texto: 'Bueno' },{ emoji: '\U0001F60A', texto: 'Muy bueno' },{ emoji: '\U0001F929', texto: 'Excelente' }] },
  motivacion: { label: 'Motivacion', opciones: [{ emoji: '\U0001F636', texto: 'Ninguna' },{ emoji: '\U0001F634', texto: 'Muy baja' },{ emoji: '\U0001F615', texto: 'Baja' },{ emoji: '\U0001F610', texto: 'Normal' },{ emoji: '\U0001F642', texto: 'Buena' },{ emoji: '\U0001F4AA', texto: 'Alta' },{ emoji: '\U0001F525', texto: 'Maxima' }] },
  malestar_general: { label: 'Malestar general', opciones: [{ emoji: '\U0001F49A', texto: 'Ninguno' },{ emoji: '\U0001F642', texto: 'Muy leve' },{ emoji: '\U0001F610', texto: 'Leve' },{ emoji: '\U0001F615', texto: 'Moderado' },{ emoji: '\U0001F922', texto: 'Alto' },{ emoji: '\U0001F912', texto: 'Muy alto' },{ emoji: '\U0001F3E5', texto: 'Extremo' }] },
}

function EmojiSelector({ campo, value, onChange }: { campo: string; value: number; onChange: (v: number) => void }) {
  const config = EMOJI_CONFIG[campo]
  if (!config) return null
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <label className="text-white font-medium text-sm">{config.label}</label>
        <span className="text-orange-400 font-bold text-sm">{config.opciones[value - 1]?.texto}</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {config.opciones.map((op, i) => {
          const val = i + 1
          const seleccionado = value === val
          return (
            <button key={val} type="button" onClick={() => onChange(val)}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 px-1 transition-all ${seleccionado ? 'bg-orange-500 ring-2 ring-orange-300 scale-105' : 'bg-gray-700 hover:bg-gray-600'}`}>
              <span className="text-xl leading-none">{op.emoji}</span>
              <span className={`text-xs font-bold leading-none ${seleccionado ? 'text-white' : 'text-gray-400'}`}>{val}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}'''

content = content.replace(old, new)
content = content.replace('<SliderInput label="Calidad del sueno" value={calidadSueno} onChange={setCalidadSueno} descripcionInf="Muy buena" descripcionSup="Muy mala" />', '<EmojiSelector campo="calidad_sueno" value={calidadSueno} onChange={setCalidadSueno} />')
content = content.replace('<SliderInput label="Fatiga percibida" value={fatiga} onChange={setFatiga} descripcionInf="Sin fatiga" descripcionSup="Agotado" />', '<EmojiSelector campo="fatiga" value={fatiga} onChange={setFatiga} />')
content = content.replace('<SliderInput label="Estres general" value={estres} onChange={setEstres} descripcionInf="Sin estres" descripcionSup="Muy estresado" />', '<EmojiSelector campo="estres" value={estres} onChange={setEstres} />')
content = content.replace('<SliderInput label="Dolor muscular" value={dolorMuscular} onChange={setDolorMuscular} descripcionInf="Sin dolor" descripcionSup="Dolor intenso" />', '<EmojiSelector campo="dolor_muscular" value={dolorMuscular} onChange={setDolorMuscular} />')
content = content.replace('<SliderInput label="Animo" value={animo} onChange={setAnimo} descripcionInf="Muy malo" descripcionSup="Muy bueno" />', '<EmojiSelector campo="animo" value={animo} onChange={setAnimo} />')
content = content.replace('<SliderInput label="Motivacion" value={motivacion} onChange={setMotivacion} descripcionInf="Muy baja" descripcionSup="Muy alta" />', '<EmojiSelector campo="motivacion" value={motivacion} onChange={setMotivacion} />')
content = content.replace('<SliderInput label="Malestar general" value={malestarGeneral} onChange={setMalestarGeneral} descripcionInf="Sin malestar" descripcionSup="Mucho malestar" />', '<EmojiSelector campo="malestar_general" value={malestarGeneral} onChange={setMalestarGeneral} />')

open(path, 'w').write(content)
print('OK - hecho')
