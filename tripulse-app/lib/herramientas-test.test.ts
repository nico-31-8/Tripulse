import { describe, it, expect } from 'vitest'
import {
  HERRAMIENTAS, AVISOS, herramientasDe, avisoDe, camposQueRellena, etiquetaDe, nombreDe,
  valeEnGrupo, seDirigeEnGrupo, sueltosDe,
} from './herramientas-test'
import { CATALOGO } from './catalogo-tests'

/* Los siete clásicos no están en el catálogo —tienen tabla propia— así que sus
   casillas se escriben aquí a mano. Son los nombres que usa /tests/[id]. */
const CAMPOS_CLASICOS: Record<string, string[]> = {
  montreal: ['velUltimo', 'durTotal', 'tiempoAguantado', 'incrementoVel'],
  css: ['distGrande', 'distPequena', 'tiempoGrande', 'tiempoPequeno'],
  rampa: ['potenciaPico', 'tiempoCompletado', 'tiempoNoCompletado', 'durEscalones', 'incrementoPot'],
  'sprint-carrera': ['sprintDist', 'sprintTiempo'],
  'sprint-natacion': ['t25', 't50'],
  'sprint-ciclismo': ['mppSprint'],
  rm: ['ejercicio', 'grupoMuscular', 'pesoKg', 'reps'],
}

const camposDe = (clave: string): string[] | null => {
  const t = CATALOGO.find(x => x.clave === clave)
  if (t) return t.brutos.map(c => c.clave)
  return CAMPOS_CLASICOS[clave] ?? null
}

describe('el mapa cubre los dos mundos', () => {
  it('tiene instrumentos para tests del catálogo Y para clásicos', () => {
    /* ESTA ES LA RAZÓN DE QUE ESTE MÓDULO EXISTA. Los descriptores vivían
       dentro de `catalogo-tests`, y ahí no llegaban al Montreal ni a la rampa,
       que son justo los dos que más falta les hace un secuenciador. */
    expect(herramientasDe('6min').length).toBeGreaterThan(0)   // catálogo
    expect(herramientasDe('montreal').length).toBeGreaterThan(0) // clásico
  })

  it('toda clave del mapa es un test que existe', () => {
    for (const clave of Object.keys(HERRAMIENTAS)) {
      expect(camposDe(clave), clave).not.toBeNull()
    }
  })

  it('todo aviso es de un test que existe', () => {
    for (const clave of Object.keys(AVISOS)) {
      expect(camposDe(clave), clave).not.toBeNull()
    }
  })

  it('un test sin instrumento devuelve lista vacía, no revienta', () => {
    expect(herramientasDe('dropjump')).toEqual([])
    expect(herramientasDe('no-existe')).toEqual([])
    expect(avisoDe('dropjump')).toBeNull()
  })
})

describe('cada instrumento escribe donde puede escribir', () => {
  it('toda casilla que rellena un instrumento EXISTE en su test', () => {
    /* Si la clave está mal escrita no falla nada: el tiempo se guarda donde
       nadie lo lee, la casilla se queda vacía y parece que el cronómetro no
       funciona. */
    for (const clave of Object.keys(HERRAMIENTAS)) {
      const campos = camposDe(clave)!
      for (const c of camposQueRellena(clave)) {
        expect(campos, clave + ' → ' + c).toContain(c)
      }
    }
  })

  it('el secuenciador lee la duración y el incremento de casillas reales', () => {
    for (const clave of Object.keys(HERRAMIENTAS)) {
      const campos = camposDe(clave)!
      for (const h of herramientasDe(clave)) {
        if (h.tipo !== 'secuenciador') continue
        expect(campos, clave).toContain(h.campoDuracion)
        expect(campos, clave).toContain(h.campoIncremento)
      }
    }
  })

  it('ningún instrumento escribe en un desplegable', () => {
    /* El largo de piscina o la unidad del aparato son del protocolo: meterles
       un «58.3» dejaría el desplegable en un valor que no está entre sus
       opciones. */
    for (const t of CATALOGO) {
      const desplegables = t.brutos.filter(c => c.opciones).map(c => c.clave)
      for (const c of camposQueRellena(t.clave)) {
        expect(desplegables, t.clave).not.toContain(c)
      }
    }
  })

  it('dos instrumentos del mismo test no se pisan la casilla', () => {
    /* El SWOLF lleva cronómetro y contador. Si los dos escribieran en el mismo
       sitio, contar una brazada borraría el tiempo. */
    for (const clave of Object.keys(HERRAMIENTAS)) {
      const cs = camposQueRellena(clave)
      expect(new Set(cs).size, clave).toBe(cs.length)
    }
  })
})

describe('qué lleva cada uno', () => {
  it('las cuentas atrás duran lo que dice su nombre', () => {
    const seg = (clave: string) => {
      const h = herramientasDe(clave).find(x => x.tipo === 'cuentaAtras')
      return h && h.tipo === 'cuentaAtras' ? h.segundos : null
    }
    expect(seg('6min')).toBe(6 * 60)
    expect(seg('t30')).toBe(30 * 60)
  })

  it('los dos secuenciadores son el Montreal y la rampa', () => {
    const con = Object.keys(HERRAMIENTAS)
      .filter(c => herramientasDe(c).some(h => h.tipo === 'secuenciador')).sort()
    expect(con).toEqual(['montreal', 'rampa'])
  })

  it('el secuenciador empieza donde empieza el protocolo de verdad', () => {
    const h = herramientasDe('montreal')[0]
    if (h.tipo !== 'secuenciador') throw new Error('no es secuenciador')
    expect(h.inicial).toBe(8)
    expect(h.unidad).toBe('km/h')
    const r = herramientasDe('rampa')[0]
    if (r.tipo !== 'secuenciador') throw new Error('no es secuenciador')
    expect(r.inicial).toBe(150)
    expect(r.unidad).toBe('W')
  })

  it('los doce que se dirigen en vivo', () => {
    expect(Object.keys(HERRAMIENTAS).sort()).toEqual([
      '180m', '6min', 'css', 'milla', 'montreal', 'rampa',
      'rast', 'sprint-carrera', 'sprint-natacion', 'swolf', 't30', 't400',
    ])
  })

  it('los que los mide un aparato NO llevan instrumento', () => {
    /* Una alfombra de saltos y un potenciómetro ya dan el número. Y la escalera
       son ~0,5 s entre fotocélulas: a mano el error es del 40 %, así que
       saldría un número con pinta de dato que no vale nada. */
    for (const c of ['bosco', 'dropjump', 'escalera', 'brick', 'decoupling',
                     'ftp20', 'ftp60', 'sprint-ciclismo', 'rm',
                     'tec-carrera', 'tec-natacion', 'bikefit']) {
      expect(herramientasDe(c), c).toEqual([])
    }
  })

  it('el sprint de carrera avisa de que a mano no es fiable', () => {
    /* Se cronometra igual —lo pidió el usuario— pero con el error escrito al
       lado, porque de ese número sale la ASR. */
    expect(herramientasDe('sprint-carrera')).toHaveLength(1)
    expect(avisoDe('sprint-carrera')).toContain('fotocélulas')
    expect(avisoDe('sprint-carrera')).toContain('6 %')
  })

  it('los dos FTP no llevan cuenta atrás', () => {
    /* El ciclista va mirando su propio potenciómetro, que ya le marca el rato.
       Una cuenta atrás de una hora en el móvil no aporta nada. */
    expect(herramientasDe('ftp20')).toEqual([])
    expect(herramientasDe('ftp60')).toEqual([])
  })
})

describe('cómo se llama en pantalla', () => {
  it('un instrumento, su nombre', () => {
    expect(etiquetaDe('6min')).toBe('Cuenta atrás')
    expect(etiquetaDe('montreal')).toBe('Secuenciador')
  })

  it('dos instrumentos, los dos', () => {
    expect(etiquetaDe('swolf')).toBe('Cronómetro + Contador')
    expect(etiquetaDe('css')).toBe('Cronómetro + Cronómetro')
  })

  it('sin instrumento lo dice claro', () => {
    expect(etiquetaDe('dropjump')).toBe('Lo da el aparato')
  })

  it('todos los tipos tienen nombre', () => {
    const vistos = new Set<string>()
    for (const clave of Object.keys(HERRAMIENTAS)) {
      for (const h of herramientasDe(clave)) {
        expect(nombreDe(h), h.tipo).toBeTruthy()
        vistos.add(h.tipo)
      }
    }
    expect([...vistos].sort()).toEqual(
      ['contador', 'cronometro', 'cuentaAtras', 'secuenciador', 'vueltas'])
  })
})

describe('qué se puede dirigir a un grupo entero', () => {
  it('el reloj común vale para cuenta atrás, cronómetro y secuenciador', () => {
    for (const c of ['6min', 't30', 'milla', 't400', 'rast', 'montreal', 'rampa',
                     'css', 'sprint-carrera', 'sprint-natacion']) {
      expect(seDirigeEnGrupo(c), c).toBe(true)
      expect(sueltosDe(c), c).toEqual([])
    }
  })

  it('los 180 m repetidos NO: cada uno hace SUS repeticiones a su ritmo', () => {
    /* Con un solo reloj no se pueden contar doce series distintas a la vez. */
    expect(seDirigeEnGrupo('180m')).toBe(false)
    expect(sueltosDe('180m')).toHaveLength(1)
  })

  it('el SWOLF tampoco: las brazadas son de cada uno', () => {
    /* Aquí es más fino: el cronómetro del largo SÍ se comparte, pero el contador
       de brazadas no. Como uno de los dos no vale, el test no se dirige entero
       en grupo — y la pantalla tiene que decirlo en vez de enseñar medio
       instrumento. */
    expect(seDirigeEnGrupo('swolf')).toBe(false)
    expect(sueltosDe('swolf')).toHaveLength(1)
    expect(sueltosDe('swolf')[0].tipo).toBe('contador')
    expect(herramientasDe('swolf').filter(valeEnGrupo)).toHaveLength(1)
  })

  it('un test sin instrumento no se dirige en grupo ni en solitario', () => {
    /* `false` y no `true`: no hay nada que dirigir. Si devolviera true, la
       pantalla enseñaría un reloj vacío en el drop jump. */
    expect(seDirigeEnGrupo('dropjump')).toBe(false)
    expect(seDirigeEnGrupo('no-existe')).toBe(false)
  })

  it('diez de los doce se pueden llevar con un reloj común', () => {
    const enGrupo = Object.keys(HERRAMIENTAS).filter(seDirigeEnGrupo)
    expect(enGrupo).toHaveLength(10)
    expect(Object.keys(HERRAMIENTAS)).toHaveLength(12)
  })
})
