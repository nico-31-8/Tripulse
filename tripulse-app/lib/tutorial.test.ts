import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CAMINO, ZONAS, pasosDeRecorrido, guiaAutomatica, arrancaSola, zonaDeRuta, zonaAlEntrar,
  mostrarOferta, siguienteDelCamino, rutaDeZona, esCuentaNueva, rellenar, siguienteParada,
  progresoVacio, queArrancaAlEntrar, pendienteAlSeguir, AVANZADAS, GRUPOS_AVANZADOS, esAvanzada, opcionesDeAyuda,
  type Progreso, type ZonaTutorial,
} from './tutorial'
import { ANCLAS_DE_CONSEJOS } from './consejos'

const prog = (cambios: Partial<Progreso> = {}): Progreso => ({ ...progresoVacio(true), ...cambios })

describe('el catálogo', () => {
  it('cada parada del camino tiene sus pasos, con título y texto', () => {
    for (const z of CAMINO) {
      expect(ZONAS[z].id).toBe(z)
      expect(ZONAS[z].pasos.length).toBeGreaterThan(0)
      for (const p of [...ZONAS[z].pasos, ...(ZONAS[z].salida || [])]) {
        expect(p.titulo.trim()).not.toBe('')
        expect(p.texto.trim()).not.toBe('')
      }
    }
  })

  /* La salida de cada parada tiene que acabar cambiando de pantalla (o cerrar,
     en la última): si no, el recorrido se quedaría a medias. */
  it('cada salida acaba en un paso que cambia de pantalla, menos la última, que cierra', () => {
    for (const z of CAMINO) {
      const salida = ZONAS[z].salida
      if (z === 'bienvenida') { expect(salida).toBeUndefined(); continue }
      expect(salida && salida.length).toBeTruthy()
      const ultimo = salida![salida!.length - 1]
      if (siguienteParada(z)) expect(ultimo.accion && ultimo.sale).toBe(true)
      else expect(ultimo.accion).toBeFalsy()
    }
  })

  it('solo pueden quedar los huecos que se rellenan: {nombre} y {deportista}', () => {
    for (const z of CAMINO) {
      for (const p of [...ZONAS[z].pasos, ...(ZONAS[z].salida || [])]) {
        const huecos = (p.titulo + ' ' + p.texto).match(/\{[^}]*\}/g) || []
        for (const h of huecos) expect(['{nombre}', '{deportista}']).toContain(h)
      }
    }
  })
})

/* EL TEST QUE IMPORTA: cada ancla del catálogo tiene que existir en el código.
   Si alguien quita o renombra un `data-guia`, el paso se saltaría en silencio. */
describe('las anclas existen en las pantallas', () => {
  const raiz = path.resolve(__dirname, '..')
  const fuentes: string[] = []
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (/\.tsx$/.test(e.name)) fuentes.push(fs.readFileSync(p, 'utf8'))
    }
  }
  recorrer(path.join(raiz, 'app'))
  recorrer(path.join(raiz, 'components'))
  const todo = fuentes.join('\n')

  const anclas = new Set<string>()
  for (const z of [...CAMINO, ...AVANZADAS]) for (const p of [...ZONAS[z].pasos, ...(ZONAS[z].salida || [])]) if (p.ancla) anclas.add(p.ancla)

  for (const a of anclas) {
    it(a, () => {
      expect(todo.includes("'" + a + "'") || todo.includes('"' + a + '"')).toBe(true)
    })
  }

  /* Un data-guia que no está ni en el recorrido ni en los consejos (lib/consejos) es una errata. */
  it('las de más de un sitio solo están donde deben (ninguna sobrante con otro nombre)', () => {
    const usadas = new Set((todo.match(/data-guia="[a-z][a-z.-]*"/g) || []).map(m => m.slice(11, -1)))
    for (const u of usadas) expect(anclas.has(u) || ANCLAS_DE_CONSEJOS.fijas.includes(u)).toBe(true)
  })
})

describe('qué pasos lleva un recorrido', () => {
  it('la primera vez (por el camino) lleva la salida a la siguiente parada', () => {
    const pasos = pasosDeRecorrido('deportistas', { camino: true, vistos: new Set() })
    expect(pasos).toHaveLength(ZONAS.deportistas.pasos.length + ZONAS.deportistas.salida!.length)
    expect(pasos.at(-1)!.sale).toBe(true)
  })

  it('repetido con el botón ? no lleva a ningún sitio', () => {
    expect(pasosDeRecorrido('deportistas', { camino: false, vistos: new Set() })).toHaveLength(ZONAS.deportistas.pasos.length)
  })

  it('a una parada ya vista no se lleva a nadie de vuelta', () => {
    const pasos = pasosDeRecorrido('deportistas', { camino: true, vistos: new Set(['ficha']) })
    expect(pasos).toHaveLength(ZONAS.deportistas.pasos.length)
  })

  it('la última parada cierra el recorrido aunque no haya siguiente', () => {
    const pasos = pasosDeRecorrido('sesion', { camino: true, vistos: new Set() })
    expect(pasos.at(-1)!.titulo).toBe('Ya conoces lo básico')
  })
})

describe('quién lo ve solo', () => {
  it('a una cuenta nueva le sale solo', () => {
    expect(guiaAutomatica(prog(), true)).toBe(true)
  })

  /* Decidido el 16-10-2026: a quien ya usaba la app se le ofrece, no le salta. */
  it('a quien ya usaba la app no le sale nada solo hasta que acepte la tarjeta', () => {
    expect(guiaAutomatica(prog(), false)).toBe(false)
    expect(guiaAutomatica(prog({ oferta: 'rechazada' }), false)).toBe(false)
    expect(guiaAutomatica(prog({ oferta: 'aceptada' }), false)).toBe(true)
  })

  it('con «Ahora no» ya no sale nada solo, sea nuevo o no', () => {
    expect(guiaAutomatica(prog({ pausado: true }), true)).toBe(false)
    expect(guiaAutomatica(prog({ pausado: true, oferta: 'aceptada' }), false)).toBe(false)
  })

  it('sin la tabla no sale nada solo: no podría recordar que ya lo vio', () => {
    expect(guiaAutomatica(progresoVacio(false), true)).toBe(false)
  })

  it('una zona vista o saltada no vuelve a salir sola', () => {
    expect(arrancaSola('panel', prog({ vistos: new Set(['panel']) }), true)).toBe(false)
    expect(arrancaSola('panel', prog({ saltados: new Set(['panel']) }), true)).toBe(false)
    expect(arrancaSola('panel', prog(), true)).toBe(true)
  })

  it('la tarjeta solo para quien ya estaba y no ha contestado', () => {
    expect(mostrarOferta(prog(), false)).toBe(true)
    expect(mostrarOferta(prog(), true)).toBe(false)
    expect(mostrarOferta(prog({ oferta: 'rechazada' }), false)).toBe(false)
    expect(mostrarOferta(progresoVacio(false), false)).toBe(false)
  })
})

describe('qué pantalla es cada zona', () => {
  it('las nueve rutas del recorrido', () => {
    expect(zonaDeRuta('/dashboard')).toBe('panel')
    expect(zonaDeRuta('/deportistas')).toBe('deportistas')
    expect(zonaDeRuta('/deportistas/14')).toBe('ficha')
    expect(zonaDeRuta('/tests/14')).toBe('tests')
    expect(zonaDeRuta('/planificacion-visual/14')).toBe('vistas')
    expect(zonaDeRuta('/planificacion-visual/14/dibujo')).toBe('lienzo')
    expect(zonaDeRuta('/planificacion-visual/14/calendario')).toBe('calendario')
    expect(zonaDeRuta('/sesion/880')).toBe('sesion')
  })

  /* Dirigir en vivo no es momento de tutoriales, y la lista de Tests no es la ficha de tests. */
  it('ni dirigir en vivo ni las pantallas sin recorrido', () => {
    expect(zonaDeRuta('/sesion/880/dirigir')).toBeNull()
    expect(zonaDeRuta('/sesion/880/ejecutar')).toBeNull()
    expect(zonaDeRuta('/tests/dirigir')).toBeNull()
    expect(zonaDeRuta('/tests')).toBeNull()
    expect(zonaDeRuta('/planificacion-visual')).toBeNull()
    expect(zonaDeRuta('/grupo/abc/dirigir')).toBeNull()
    expect(zonaDeRuta('/grupo/abc/dia')).toBeNull()
    expect(zonaDeRuta('/grupo/abc/test')).toBeNull()
    expect(zonaDeRuta('/laboratorio')).toBeNull()
  })

  it('en el Panel, la bienvenida va antes que el propio Panel', () => {
    expect(zonaAlEntrar('/dashboard', prog(), true)).toBe('bienvenida')
    expect(zonaAlEntrar('/dashboard', prog({ vistos: new Set(['bienvenida']) }), true)).toBe('panel')
    expect(zonaAlEntrar('/dashboard', prog({ vistos: new Set(['bienvenida', 'panel']) }), true)).toBeNull()
  })

  it('dónde se abre cada zona desde la lista', () => {
    expect(rutaDeZona('bienvenida', null)).toBe('/dashboard')
    expect(rutaDeZona('deportistas', null)).toBe('/deportistas')
    expect(rutaDeZona('ficha', null)).toBeNull()
    expect(rutaDeZona('ficha', 14)).toBe('/deportistas/14')
    expect(rutaDeZona('lienzo', 14)).toBe('/planificacion-visual/14/dibujo')
    expect(rutaDeZona('sesion', 14)).toBeNull()
  })

  it('la siguiente parada pendiente', () => {
    expect(siguienteDelCamino(prog())).toBe('bienvenida')
    expect(siguienteDelCamino(prog({ vistos: new Set(['bienvenida', 'panel']) }))).toBe('deportistas')
    expect(siguienteDelCamino(prog({ vistos: new Set(CAMINO) }))).toBeNull()
  })
})

describe('cuenta nueva o de antes', () => {
  it('se decide por la fecha de creación de la cuenta', () => {
    expect(esCuentaNueva('2026-10-20T10:00:00Z', '2026-10-16T00:00:00Z')).toBe(true)
    expect(esCuentaNueva('2026-09-01T10:00:00Z', '2026-10-16T00:00:00Z')).toBe(false)
  })
  it('sin fecha, como de antes: mejor ofrecer que saltar', () => {
    expect(esCuentaNueva(undefined)).toBe(false)
    expect(esCuentaNueva('no es una fecha')).toBe(false)
  })
})

describe('poner los nombres', () => {
  it('con nombre', () => {
    expect(rellenar('Te damos la bienvenida, {nombre}', { nombre: 'Nicolás' })).toBe('Te damos la bienvenida, Nicolás')
  })
  it('sin nombre no queda una coma colgando', () => {
    expect(rellenar('Te damos la bienvenida, {nombre}', {})).toBe('Te damos la bienvenida')
  })
  it('sin deportista dice «tu deportista»', () => {
    expect(rellenar('Abre el panel de {deportista}', {})).toBe('Abre el panel de tu deportista')
    expect(rellenar('Abre el panel de {deportista}', { deportista: 'Dani' })).toBe('Abre el panel de Dani')
  })
})

/* El fallo del 16-10-2026: quien dijo «No, gracias» y luego pulsó «Seguir →»
   veía una parada y en la siguiente no arrancaba nada. */
describe('seguir el camino a mano', () => {
  const rechazo = prog({ oferta: 'rechazada' })

  it('al pulsar lo que lleva a la siguiente parada, esa queda pedida', () => {
    expect(pendienteAlSeguir('panel')).toEqual({ zona: 'deportistas', camino: true })
    expect(pendienteAlSeguir('tests')).toEqual({ zona: 'vistas', camino: true })
    expect(pendienteAlSeguir('sesion')).toBeNull()
  })

  it('quien rechazó la tarjeta y sigue el camino: la siguiente parada arranca', () => {
    const r = queArrancaAlEntrar('/deportistas', pendienteAlSeguir('panel'), rechazo, false)
    expect(r).toEqual({ zona: 'deportistas', camino: true, pendiente: null })
  })

  it('sin pedirlo, a quien rechazó no le sale nada', () => {
    expect(queArrancaAlEntrar('/deportistas', null, rechazo, false).zona).toBeNull()
  })

  it('por una pantalla de paso (elegir deportista) se sigue esperando', () => {
    const r = queArrancaAlEntrar('/planificacion-visual', pendienteAlSeguir('tests'), rechazo, false)
    expect(r.zona).toBeNull()
    expect(r.pendiente).toEqual({ zona: 'vistas', camino: true })
    expect(queArrancaAlEntrar('/planificacion-visual/14', r.pendiente, rechazo, false).zona).toBe('vistas')
  })

  it('si se va a otra pantalla con recorrido, lo pedido se olvida', () => {
    const r = queArrancaAlEntrar('/dashboard', pendienteAlSeguir('tests'), rechazo, false)
    expect(r.pendiente).toBeNull()
    expect(r.zona).toBeNull()
  })

  it('la bienvenida pedida desde la lista se cumple en el Panel', () => {
    expect(queArrancaAlEntrar('/dashboard', { zona: 'bienvenida', camino: true }, rechazo, false).zona).toBe('bienvenida')
  })

  it('a una cuenta nueva le sigue saliendo solo lo que no ha visto', () => {
    expect(queArrancaAlEntrar('/deportistas', null, prog(), true).zona).toBe('deportistas')
  })
})

describe('las zonas avanzadas (fase 3)', () => {
  it('cada zona está en el camino o entre las avanzadas, y solo una vez', () => {
    const todas = Object.keys(ZONAS) as ZonaTutorial[]
    for (const z of todas) expect(CAMINO.includes(z) !== AVANZADAS.includes(z)).toBe(true)
    expect(new Set(AVANZADAS).size).toBe(AVANZADAS.length)
    expect(GRUPOS_AVANZADOS.flatMap(g => g.zonas)).toEqual(AVANZADAS)
  })

  it('tienen pasos con título, texto y ancla, y ninguna salida', () => {
    for (const z of AVANZADAS) {
      expect(ZONAS[z].id).toBe(z)
      expect(ZONAS[z].salida).toBeUndefined()
      for (const p of ZONAS[z].pasos) {
        expect(p.ancla).toBeTruthy()
        expect(p.titulo.trim() && p.texto.trim()).toBeTruthy()
        expect(p.accion).toBeFalsy()
      }
    }
  })

  /* Decidido el 15-10-2026: las avanzadas, solo con el botón ?. */
  it('nunca arrancan solas, ni a una cuenta nueva', () => {
    for (const z of AVANZADAS) expect(arrancaSola(z, prog(), true)).toBe(false)
    expect(zonaAlEntrar('/carga', prog(), true)).toBeNull()
    expect(zonaAlEntrar('/planificacion-visual/14/bloques', prog(), true)).toBeNull()
    expect(esAvanzada('carga')).toBe(true)
    expect(esAvanzada('sesion')).toBe(false)
  })

  it('pedidas desde la lista, sí arrancan al llegar', () => {
    expect(queArrancaAlEntrar('/carga', { zona: 'carga', camino: false }, prog(), false).zona).toBe('carga')
  })

  it('qué pantalla es cada una', () => {
    expect(zonaDeRuta('/planificacion-visual/14/bloques')).toBe('bloques')
    expect(zonaDeRuta('/planificacion-visual/14/semana/2026-10-12')).toBe('semana')
    expect(zonaDeRuta('/grupo/7b0d')).toBe('grupo')
    expect(zonaDeRuta('/eco')).toBe('sicat')
    expect(zonaDeRuta('/fuerza')).toBe('biblioteca')
    expect(zonaDeRuta('/wellness-entrenador')).toBe('wellness')
    expect(zonaDeRuta('/wellness/14')).toBeNull()
  })

  it('el botón ? de la sesión ofrece lo básico y las herramientas', () => {
    expect(opcionesDeAyuda('/sesion/880')).toEqual(['sesion', 'herramientas'])
    expect(opcionesDeAyuda('/carga')).toEqual(['carga'])
    expect(opcionesDeAyuda('/tests')).toEqual([])
  })

  it('dónde se abre cada una desde la lista', () => {
    expect(rutaDeZona('carga', null)).toBe('/carga')
    expect(rutaDeZona('sicat', null)).toBe('/eco')
    expect(rutaDeZona('bloques', null)).toBeNull()
    expect(rutaDeZona('bloques', 14)).toBe('/planificacion-visual/14/bloques')
    expect(rutaDeZona('semana', 14)).toMatch(/^\/planificacion-visual\/14\/semana\/\d{4}-\d{2}-\d{2}$/)
    expect(rutaDeZona('herramientas', 14)).toBeNull()
    expect(rutaDeZona('grupo', 14)).toBeNull()
  })

  it('la vista de semana se abre por su lunes', () => {
    const fecha = rutaDeZona('semana', 14)!.split('/').pop()!
    expect(new Date(fecha + 'T12:00:00').getDay()).toBe(1)
  })
})
