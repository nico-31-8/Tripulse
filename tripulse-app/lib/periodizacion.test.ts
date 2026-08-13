import { describe, it, expect } from 'vitest'
import {
  MODELOS, TIPOS_MESO, CLASES_MESO, modeloDe, tiposDeMeso, colorMeso, tiposEnPlan,
} from './periodizacion'

describe('todo tipo de mesociclo tiene color', () => {
  /* EL FALLO QUE ESTO EVITA, y que estuvo vivo en produccion.
     La lista de tipos dependia del modelo de periodizacion y estaba escrita a
     mano en DOS formularios; los colores, en un TERCER sitio que solo conocia los
     cuatro del modelo ATR. Un plan Tradicional, Inverso u Ondulatorio pintaba el
     calendario ENTERO en gris, y la leyenda seguia enseñando los de ATR. No
     fallaba nada: el calendario dejaba de decir nada. */
  it('ni uno solo se queda sin color, en ningun modelo', () => {
    MODELOS.forEach(m => TIPOS_MESO[m].forEach(t => {
      expect(colorMeso(t.tipo), `${m} · ${t.tipo} se pinta gris`).not.toBeNull()
    }))
  })

  it('cada color trae sus tres opacidades y su hexadecimal', () => {
    Object.entries(CLASES_MESO).forEach(([nombre, c]) => {
      expect(c.suave, nombre).toMatch(/^bg-\w+-500\/20 hover:bg-\w+-500\/30$/)
      expect(c.medio, nombre).toMatch(/^bg-\w+-500\/40 hover:bg-\w+-500\/60$/)
      expect(c.solido, nombre).toMatch(/^bg-\w+-500$/)
      expect(c.hex, nombre).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  /* En Tailwind v4 la clase tiene que aparecer ENTERA en el fichero para que el
     compilador la genere. Si alguien "simplifica" esto componiendo la opacidad en
     runtime, las clases dejan de existir y vuelve el calendario gris — sin que
     nada falle, otra vez. */
  it('las clases son literales completos, no trozos que se peguen luego', () => {
    Object.values(CLASES_MESO).forEach(c => {
      expect(c.medio).not.toContain('${')
      expect(c.medio.split(' ')).toHaveLength(2)
    })
  })

  it('no hay dos modelos que llamen igual a tipos de distinto color', () => {
    // «Recuperación» sale en ATR y en Ondulatoria: tiene que ser verde en los dos,
    // porque el indice de colores es por NOMBRE.
    const porNombre = new Map<string, string>()
    MODELOS.forEach(m => TIPOS_MESO[m].forEach(t => {
      const ya = porNombre.get(t.tipo)
      if (ya) expect(t.color, `${t.tipo} es ${ya} en un modelo y ${t.color} en ${m}`).toBe(ya)
      porNombre.set(t.tipo, t.color)
    }))
  })
})

describe('el modelo de un macrociclo', () => {
  it('reconoce los cuatro', () => {
    expect(modeloDe('Tradicional')).toBe('Tradicional')
    expect(modeloDe('Inversa')).toBe('Inversa')
    expect(modeloDe('Ondulatoria')).toBe('Ondulatoria')
    expect(modeloDe('ATR')).toBe('ATR')
  })

  it('lo que no se reconoce cae en ATR, que es el de la app', () => {
    // Incluye el caso real: macrociclos antiguos sin tipo_periodizacion.
    expect(modeloDe(null)).toBe('ATR')
    expect(modeloDe('')).toBe('ATR')
    expect(modeloDe('ATR (Acumulación-Transmutación-Realización)')).toBe('ATR')
    expect(modeloDe('vete a saber')).toBe('ATR')
  })

  it('da igual como venga escrito en la base', () => {
    expect(modeloDe('tradicional')).toBe('Tradicional')
    expect(modeloDe(' ONDULATORIA ')).toBe('Ondulatoria')
  })
})

describe('los tipos que se ofrecen al crear un mesociclo', () => {
  it('son los del modelo de su macrociclo', () => {
    expect(tiposDeMeso('Tradicional').map(t => t.tipo)).toEqual(['General', 'Específica', 'Competitiva', 'Taper'])
    expect(tiposDeMeso('Ondulatoria').map(t => t.tipo)).toEqual(['Carga alta', 'Carga media', 'Recuperación'])
    expect(tiposDeMeso(null).map(t => t.tipo)).toEqual(['Acumulación', 'Transmutación', 'Realización', 'Recuperación'])
  })

  it('nunca esta vacio: siempre hay algo que elegir', () => {
    MODELOS.forEach(m => expect(TIPOS_MESO[m].length, m).toBeGreaterThan(0))
    expect(tiposDeMeso('lo que sea').length).toBeGreaterThan(0)
  })
})

describe('resolver el color de un tipo guardado', () => {
  it('acierta aunque venga sin tildes o en otra caja', () => {
    // El tipo llega de la base tal y como se guardo. Comparar «Específica» con
    // «Especifica» devolvia gris, que es exactamente no decir nada.
    expect(colorMeso('Específica')?.hex).toBe(colorMeso('Especifica')?.hex)
    expect(colorMeso('CARGA ALTA')?.hex).toBe(colorMeso('Carga alta')?.hex)
    expect(colorMeso(' Taper ')?.hex).toBe(colorMeso('Taper')?.hex)
  })

  it('lo que no existe devuelve null para que la pantalla decida', () => {
    expect(colorMeso('Inventado')).toBeNull()
    expect(colorMeso(null)).toBeNull()
    expect(colorMeso('')).toBeNull()
  })

  it('los tipos de un mismo modelo no comparten color', () => {
    // Si dos bloques seguidos salen del mismo color, el calendario no distingue
    // donde acaba uno y empieza el otro.
    MODELOS.forEach(m => {
      const colores = TIPOS_MESO[m].map(t => t.color)
      expect(new Set(colores).size, m).toBe(colores.length)
    })
  })
})

describe('la leyenda sale del plan, no de una lista fija', () => {
  it('solo enseña los tipos que de verdad hay', () => {
    const l = tiposEnPlan([{ tipo: 'Carga alta' }, { tipo: 'Recuperación' }, { tipo: 'Carga alta' }])
    expect(l.map(x => x.tipo)).toEqual(['Carga alta', 'Recuperación'])
    expect(l[0].hex).toBe(CLASES_MESO.rojo.hex)
    expect(l[1].hex).toBe(CLASES_MESO.verde.hex)
  })

  it('un tipo desconocido sale en gris en vez de desaparecer', () => {
    // Si algun dia hay un tipo viejo en la base, mejor que la leyenda lo nombre
    // en gris a que el calendario tenga un color sin explicar.
    const l = tiposEnPlan([{ tipo: 'De otra epoca' }])
    expect(l).toEqual([{ tipo: 'De otra epoca', hex: '#6b7280' }])
  })

  it('sin plan no inventa nada', () => {
    expect(tiposEnPlan([])).toEqual([])
    expect(tiposEnPlan(null)).toEqual([])
    expect(tiposEnPlan([{ tipo: null }, {}])).toEqual([])
  })
})
