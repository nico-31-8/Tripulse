import { describe, it, expect } from 'vitest'
import {
  fichaDe, textoRpe, motivoNoUsable, esUsable, usables, siglasDeLaApp,
  buscar, copiaDe, resolverBloque, cargaDe, leerZonas, paraGuardar, rangoDe,
  ZONA_NUEVA, type ZonaEntrenador,
} from './zonas-entrenador'
import { cargaZona } from './zonas'

const z = (extra: Partial<ZonaEntrenador> = {}): ZonaEntrenador => ({
  deporte: 'Carrera', sigla: 'TMP', nombre: 'Tempo largo', pctMin: 82, pctMax: 88,
  rpeMin: 5, rpeMax: 6, color: '#a78bfa', orden: 0, ...extra,
})

const MIAS: ZonaEntrenador[] = [
  z(),
  z({ sigla: 'SPR', nombre: 'Sprint en cuesta', pctMin: 130, pctMax: 160, rpeMin: 10, rpeMax: null, orden: 1 }),
  z({ sigla: 'REG', nombre: 'Regenerativo', pctMin: 50, pctMax: 58, rpeMin: 2, rpeMax: null, orden: 2 }),
]

describe('qué produce una zona', () => {
  it('el RPE es el punto medio del rango', () => {
    expect(fichaDe(z()).rpe).toBe(5.5)
  })

  it('un número suelto es su propio punto medio', () => {
    expect(fichaDe(z({ rpeMin: 4, rpeMax: null })).rpe).toBe(4)
  })

  it('el nivel sale de la escalera real de la app, no de una copia', () => {
    // Tempo largo a RPE 5,5 → nivel 3 (Tempo). Antes del arreglo de la escalera
    // caía en 2, el mismo que un aeróbico suave.
    expect(fichaDe(z()).nivel).toBe(3)
    expect(fichaDe(z({ rpeMin: 10, rpeMax: null })).nivel).toBe(7)
    expect(fichaDe(z({ rpeMin: 2, rpeMax: null })).nivel).toBe(1)
  })

  it('SIN RPE NO SE INVENTA NADA: ni carga ni nivel', () => {
    expect(fichaDe(z({ rpeMin: null }))).toEqual({ rpe: null, nivel: null })
  })

  it('el texto respeta si es rango o número suelto', () => {
    expect(textoRpe(z())).toBe('RPE 5–6')
    expect(textoRpe(z({ rpeMin: 4, rpeMax: null }))).toBe('RPE 4')
    expect(textoRpe(z({ rpeMin: 4, rpeMax: 4 }))).toBe('RPE 4')
  })
})

describe('cuándo una zona se puede usar', () => {
  it('la de ejemplo vale', () => {
    expect(motivoNoUsable(z(), 0, MIAS)).toBeNull()
  })

  it('SIN RPE NO SE OFRECE: no daría carga ni tendría nivel', () => {
    expect(motivoNoUsable(z({ rpeMin: null }), 0, MIAS)).toContain('Sin RPE')
  })

  it('UNA SIGLA DE LA APP NO SE PUEDE REUSAR, o quedaría enterrada', () => {
    // La resolución mira primero las de serie: la tuya no se usaría jamás, y sin
    // error ninguno. Se impide al crearla.
    for (const s of ['AEL', 'PAE', 'Z2', 'FMH']) {
      expect(motivoNoUsable(z({ sigla: s }), 0, MIAS), s).toContain('zona de la app')
    }
  })

  it('da igual en mayúsculas o minúsculas', () => {
    expect(motivoNoUsable(z({ sigla: 'ael' }), 0, MIAS)).toContain('zona de la app')
  })

  it('no se puede repetir una tuya', () => {
    expect(motivoNoUsable(z({ sigla: 'SPR' }), 0, MIAS)).toContain('Repetida')
    // …pero una zona no choca consigo misma al editarla.
    expect(motivoNoUsable(MIAS[1], 1, MIAS)).toBeNull()
  })

  it('sigla y nombre son obligatorios', () => {
    expect(motivoNoUsable(z({ sigla: '' }), 0, MIAS)).toContain('sigla')
    expect(motivoNoUsable(z({ nombre: '' }), 0, MIAS)).toContain('nombre')
    expect(motivoNoUsable(z({ sigla: 'A B' }), 0, MIAS)).toBe('Sin espacios')
  })

  it('los rangos al revés se cazan', () => {
    expect(motivoNoUsable(z({ rpeMin: 8, rpeMax: 5 }), 0, MIAS)).toContain('menor')
    expect(motivoNoUsable(z({ pctMin: 90, pctMax: 70 }), 0, MIAS)).toContain('menor')
  })

  it('un RPE fuera de escala también', () => {
    expect(motivoNoUsable(z({ rpeMin: 12 }), 0, MIAS)).toContain('de 1 a 10')
  })

  it('usables deja fuera las que no lo son', () => {
    const conRota = [...MIAS, z({ sigla: 'ROTA', rpeMin: null, orden: 3 })]
    expect(usables(conRota).map(x => x.sigla)).toEqual(['TMP', 'SPR', 'REG'])
  })

  it('una zona recién creada todavía no vale, y eso es correcto', () => {
    expect(esUsable(ZONA_NUEVA(0), 0, [])).toBe(false)
  })
})

describe('resolver una sigla', () => {
  it('las de la app se encuentran, con su color y su nombre', () => {
    const r = buscar('AEL', MIAS)
    expect(r?.origen).toBe('app')
    expect(r?.nombre).toBe('Aeróbico lipolítico')
  })

  it('COINCIDE CON cargaZona PARA LAS DE LA APP', () => {
    // Si no coincidieran, habría dos verdades sobre la misma zona — que es el
    // fallo que este fichero existe para no repetir.
    for (const s of ['AER', 'AEL', 'AEM', 'PAE', 'PLA']) {
      const mio = buscar(s, MIAS)!
      const suyo = cargaZona(s)
      expect(mio.rpe, s).toBe(suyo.rpe)
      expect(mio.nivel, s).toBe(suyo.nivel)
    }
  })

  it('las mías también', () => {
    const r = buscar('TMP', MIAS)
    expect(r?.origen).toBe('mia')
    expect(r?.nivel).toBe(3)
  })

  it('una mía sin RPE no se encuentra: no está lista para usarse', () => {
    const rota = [z({ sigla: 'XXX', rpeMin: null })]
    expect(buscar('XXX', rota)).toBeNull()
  })

  it('lo que no está en ninguna biblioteca devuelve null', () => {
    expect(buscar('NADA', MIAS)).toBeNull()
    expect(buscar('', MIAS)).toBeNull()
  })
})

describe('la copia congelada', () => {
  it('lleva lo que hace falta para pintar y contar', () => {
    expect(copiaDe('TMP', MIAS)).toEqual({
      sigla: 'TMP', nombre: 'Tempo largo', color: '#a78bfa', rpe: 5.5, nivel: 3,
    })
  })

  it('LA COPIA MANDA SOBRE LA BIBLIOTECA', () => {
    const copia = copiaDe('TMP', MIAS)!
    // Se borra la zona de la biblioteca: la tarea ya prescrita sigue igual.
    const r = resolverBloque('TMP', copia, [])
    expect(r.origen).toBe('copia')
    expect(r.rpe).toBe(5.5)
    expect(r.nivel).toBe(3)
  })

  it('y sobre una zona que cambió después: lo de marzo se mandó con lo de marzo', () => {
    const copia = copiaDe('TMP', MIAS)!
    const cambiada = [z({ rpeMin: 9, rpeMax: 10 })]
    expect(resolverBloque('TMP', copia, cambiada).rpe).toBe(5.5)
  })

  it('sin copia se resuelve en vivo, como las tareas de antes de esto', () => {
    expect(resolverBloque('AEL', null, MIAS).origen).toBe('app')
    expect(resolverBloque('TMP', null, MIAS).origen).toBe('mia')
  })

  it('SIN COPIA Y SIN ZONA, SE DICE QUE NO SE RECONOCE — no se finge un Z2', () => {
    /* Es lo que hace hoy cargaZona(): devuelve nivel 2 y RPE 4,5 sin avisar, y
       un tempo acaba contando como aeróbico suave en la carga, en la curva de
       forma y en el dibujo. Aquí vuelve marcado. */
    const r = resolverBloque('BORRADA', null, MIAS)
    expect(r.origen).toBe('desconocida')
    expect(r.rpe).toBe(0)
    expect(r.nivel).toBe(0)
    expect(cargaDe(r, 30)).toBe(0)
    // Y para que se vea la diferencia con lo de hoy:
    expect(cargaZona('BORRADA').rpe).toBe(4.5)
  })

  it('una copia vacía no cuenta como copia', () => {
    expect(resolverBloque('AEL', { sigla: '', nombre: '', color: '', rpe: 0, nivel: 0 }, MIAS).origen).toBe('app')
  })
})

describe('la carga', () => {
  it('es RPE por minutos, igual que en el resto de la app', () => {
    expect(cargaDe(buscar('TMP', MIAS)!, 20)).toBe(110)
    expect(cargaDe(buscar('AEL', MIAS)!, 30)).toBe(105)
  })

  it('sin minutos no suma nada', () => {
    expect(cargaDe(buscar('TMP', MIAS)!, 0)).toBe(0)
    expect(cargaDe(buscar('TMP', MIAS)!, NaN)).toBe(0)
  })
})

describe('ida y vuelta con la base', () => {
  const filas = [
    { id: 2, sigla: 'SPR', nombre: 'Sprint', pct_min: 130, pct_max: 160, rpe_min: 10, rpe_max: null, color: '#f472b6', orden: 1 },
    { id: 1, sigla: 'TMP', nombre: 'Tempo', pct_min: 82, pct_max: 88, rpe_min: 5, rpe_max: 6, color: '#a78bfa', orden: 0 },
  ]

  it('se leen ordenadas aunque lleguen desordenadas', () => {
    expect(leerZonas(filas).map(z => z.sigla)).toEqual(['TMP', 'SPR'])
  })

  it('un rpe_max nulo se conserva nulo: es «número suelto», no «cero»', () => {
    expect(leerZonas(filas)[1].rpeMax).toBeNull()
    expect(textoRpe(leerZonas(filas)[1])).toBe('RPE 10')
  })

  it('null o basura no revientan', () => {
    expect(leerZonas(null)).toEqual([])
    expect(leerZonas([{}])[0].sigla).toBe('')
  })

  it('LA SIGLA SE GUARDA EN MAYÚSCULAS, siempre', () => {
    // Si no, «tmp» y «TMP» serían dos zonas distintas para la base y la misma
    // para el entrenador.
    expect(paraGuardar(z({ sigla: 'tmp' }), 'u1').sigla).toBe('TMP')
  })

  it('lo que se guarda vuelve igual', () => {
    const fila = paraGuardar(z(), 'u1')
    const vuelta = leerZonas([{ ...fila, id: 1 }])[0]
    expect(vuelta.sigla).toBe('TMP')
    expect(vuelta.rpeMin).toBe(5)
    expect(vuelta.rpeMax).toBe(6)
    expect(fichaDe(vuelta).nivel).toBe(3)
  })
})

describe('el rango para un atleta', () => {
  it('sale de su referencia', () => {
    expect(rangoDe(z(), 16)).toEqual({ min: 16 * 0.82, max: 16 * 0.88 })
  })

  it('sin referencia no hay rango, y no se devuelve cero', () => {
    expect(rangoDe(z(), 0)).toBeNull()
    expect(rangoDe(z(), NaN)).toBeNull()
  })
})

describe('las siglas que ya existen', () => {
  it('incluyen resistencia, fuerza y las clásicas', () => {
    const s = siglasDeLaApp()
    expect(s).toContain('AEL')
    expect(s).toContain('FMH')
    expect(s).toContain('Z1')
    expect(s).toContain('Z7')
  })

  it('no hay ninguna repetida entre los tres sistemas', () => {
    // Si la hubiera, `buscar` encontraría una y taparía la otra.
    const s = siglasDeLaApp()
    expect(new Set(s).size).toBe(s.length)
  })
})

describe('el deporte es parte de la identidad de la zona', () => {
  /* Los % de una zona son de UNA referencia: la VAM, el FTP o el CSS. Y no son
     intercambiables — las de la app ya llevan porcentajes distintos por deporte
     (AEL es 65–75 % de VAM pero 56–75 % de FTP). Un «82–88 %» aplicado al FTP
     de alguien daría unos vatios que nadie prescribió. */
  const DOS: ZonaEntrenador[] = [
    z({ deporte: 'Carrera', sigla: 'TMP', pctMin: 82, pctMax: 88, rpeMin: 5, rpeMax: 6, orden: 0 }),
    z({ deporte: 'Ciclismo', sigla: 'TMP', pctMin: 76, pctMax: 90, rpeMin: 6, rpeMax: 7, orden: 1 }),
  ]

  it('LA MISMA SIGLA PUEDE EXISTIR EN DOS DEPORTES: son dos zonas distintas', () => {
    expect(motivoNoUsable(DOS[0], 0, DOS)).toBeNull()
    expect(motivoNoUsable(DOS[1], 1, DOS)).toBeNull()
  })

  it('pero repetirla DENTRO del mismo deporte, no', () => {
    const chocan = [DOS[0], z({ deporte: 'Carrera', sigla: 'TMP', orden: 1 })]
    expect(motivoNoUsable(chocan[1], 1, chocan)).toContain('Repetida')
  })

  it('sin deporte no está lista', () => {
    expect(motivoNoUsable(z({ deporte: '' }), 0, MIAS)).toContain('deporte')
  })

  it('con el deporte se resuelve la que toca', () => {
    expect(buscar('TMP', DOS, 'Carrera')?.rpe).toBe(5.5)
    expect(buscar('TMP', DOS, 'Ciclismo')?.rpe).toBe(6.5)
  })

  it('SIN DECIR EL DEPORTE Y CON DOS CANDIDATAS, NO SE ELIGE A CIEGAS', () => {
    // Devolver «la primera» sería jugarse a cara o cruz entre un ritmo y unos
    // vatios. Se devuelve null y quien llama se entera.
    expect(buscar('TMP', DOS)).toBeNull()
  })

  it('sin deporte pero con una sola candidata, sí se resuelve', () => {
    expect(buscar('SPR', MIAS)?.origen).toBe('mia')
  })

  it('la copia y el bloque también respetan el deporte', () => {
    expect(copiaDe('TMP', DOS, 'Ciclismo')?.rpe).toBe(6.5)
    expect(resolverBloque('TMP', null, DOS, 'Ciclismo').rpe).toBe(6.5)
    // Y sin deporte, con dos candidatas, cae en desconocida en vez de acertar por suerte.
    expect(resolverBloque('TMP', null, DOS).origen).toBe('desconocida')
  })

  it('el desplegable de una tarea solo ofrece las de su deporte', () => {
    expect(usables(DOS, 'Carrera').map(x => x.deporte)).toEqual(['Carrera'])
    expect(usables(DOS, 'Natacion')).toEqual([])
    expect(usables(DOS)).toHaveLength(2)
  })

  it('el deporte viaja a la base y vuelve', () => {
    expect(paraGuardar(DOS[1], 'u1').deporte).toBe('Ciclismo')
    expect(leerZonas([{ sigla: 'X', deporte: 'Natacion' }])[0].deporte).toBe('Natacion')
    // Una fila vieja sin deporte cae en Carrera, no en vacío.
    expect(leerZonas([{ sigla: 'X' }])[0].deporte).toBe('Carrera')
  })
})
