import { describe, it, expect } from 'vitest'
import { atajosDe, aplicarAtajo, type AtajoIntensidad } from './atajos-intensidad'

const etiquetas = (d: string | null | undefined) => atajosDe(d).map(a => a.etiqueta)
const buscar = (d: string, et: string): AtajoIntensidad => {
  const a = atajosDe(d).find(x => x.etiqueta === et)
  if (!a) throw new Error('no hay atajo «' + et + '» en ' + d)
  return a
}

describe('atajosDe — cada deporte ofrece lo suyo', () => {
  it('en carrera, el ritmo por kilómetro y el % de VAM', () => {
    expect(etiquetas('Carrera')).toEqual(['ritmo /km', 'ritmo /…', '% VAM', 'pulso', 'RPE'])
  })

  /* Lo que faltaba: en el vaso el ritmo se cuenta por 100, no por kilómetro. */
  it('en natación, el ritmo por 100 y el % de CSS', () => {
    expect(etiquetas('Natacion')).toEqual(['ritmo /100m', 'ritmo /…', '% CSS', 'RPE'])
  })

  it('«Natación» con tilde es la misma disciplina', () => {
    expect(etiquetas('Natación')).toEqual(etiquetas('Natacion'))
  })

  it('en ciclismo, vatios y % de FTP: ahí no se habla de ritmo', () => {
    expect(etiquetas('Ciclismo')).toEqual(['vatios', '% FTP', 'pulso', 'RPE'])
    expect(etiquetas('Ciclismo')).not.toContain('ritmo /km')
  })

  it('nunca ofrece la referencia de otro deporte', () => {
    expect(etiquetas('Carrera')).not.toContain('% FTP')
    expect(etiquetas('Natacion')).not.toContain('% VAM')
    expect(etiquetas('Ciclismo')).not.toContain('% CSS')
  })

  it('sin disciplina o en un brick, solo lo que vale en todas', () => {
    for (const d of ['', null, undefined, 'Brick']) {
      expect(etiquetas(d as any)).toEqual(['ritmo /…', 'pulso', 'RPE'])
    }
  })

  it('el porcentaje no sale si no se sabe de qué test', () => {
    expect(etiquetas('Brick').some(e => e.startsWith('%'))).toBe(false)
  })

  it('todos llevan ayuda con un ejemplo', () => {
    for (const d of ['Carrera', 'Natacion', 'Ciclismo', 'Brick']) {
      expect(atajosDe(d).every(a => a.ayuda.length > 10)).toBe(true)
    }
  })
})

describe('aplicarAtajo — con la casilla vacía', () => {
  it('deja la unidad y el cursor delante, para escribir el número', () => {
    const r = aplicarAtajo('', buscar('Carrera', 'ritmo /km'))
    expect(r).toEqual({ texto: ' /km', cursor: 0 })
  })

  it('el de natación pone /100m', () => {
    expect(aplicarAtajo('', buscar('Natacion', 'ritmo /100m')).texto).toBe(' /100m')
  })

  it('el «ritmo de…» deja solo la barra, para la distancia que sea', () => {
    expect(aplicarAtajo(null, buscar('Carrera', 'ritmo /…')).texto).toBe(' /')
  })

  it('el RPE va delante, así que el cursor va detrás', () => {
    const r = aplicarAtajo('', buscar('Carrera', 'RPE'))
    expect(r.texto).toBe('RPE ')
    expect(r.cursor).toBe(4)
  })
})

describe('aplicarAtajo — con algo ya escrito', () => {
  /* Lo importante de todo el fichero: escribir «4:30», darse cuenta de que
     falta la unidad y darle al botón. Si eso borrara lo tecleado, el atajo
     sería una trampa. */
  it('añade la unidad sin borrar lo que habías puesto', () => {
    expect(aplicarAtajo('4:30', buscar('Carrera', 'ritmo /km')).texto).toBe('4:30 /km')
  })

  it('y el cursor queda al final, listo para seguir', () => {
    const r = aplicarAtajo('4:30', buscar('Carrera', 'ritmo /km'))
    expect(r.cursor).toBe(r.texto.length)
  })

  it('el RPE se antepone: «6–7» no puede quedar «6–7 RPE»', () => {
    expect(aplicarAtajo('6–7', buscar('Carrera', 'RPE')).texto).toBe('RPE 6–7')
  })

  it('no duplica una unidad que ya estaba', () => {
    expect(aplicarAtajo('4:30 /km', buscar('Carrera', 'ritmo /km')).texto).toBe('4:30 /km')
    expect(aplicarAtajo('90–95% VAM', buscar('Carrera', '% VAM')).texto).toBe('90–95% VAM')
  })

  it('los espacios de los lados no dejan un hueco doble', () => {
    expect(aplicarAtajo('  4:30  ', buscar('Carrera', 'ritmo /km')).texto).toBe('4:30 /km')
  })

  it('cambiar de unidad sí añade la nueva: son distintas', () => {
    expect(aplicarAtajo('90–95% VAM', buscar('Carrera', 'pulso')).texto).toBe('90–95% VAM ppm')
  })
})
