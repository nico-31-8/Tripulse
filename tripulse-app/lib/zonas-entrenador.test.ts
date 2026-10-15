import { describe, it, expect } from 'vitest'
import {
  fichaDe, textoRpe, motivoNoUsable, esUsable, usables, siglasDeLaApp,
  buscar, copiaDe, resolverBloque, cargaDe, leerZonas, paraGuardar,
  leerClasificaciones, clasificacionParaGuardar, motivoClasificacion, zonaSiguiente, esDeUnHito, leerLimite,
  ZONA_NUEVA, CLASIFICACION_NUEVA, type ZonaEntrenador, type Clasificacion, type Limite,
} from './zonas-entrenador'
import { cargaZona } from './zonas'

/** Un tramo de un solo hito: del `a` al `b` % de su VAM. */
const vam = (a: number, b: number): { desde: Limite; hasta: Limite } =>
  ({ desde: { ref: 'app:vam', pct: a }, hasta: { ref: 'app:vam', pct: b } })

const z = (extra: Partial<ZonaEntrenador> = {}): ZonaEntrenador => ({
  deporte: 'Carrera', sigla: 'TMP', nombre: 'Tempo largo', ...vam(82, 88),
  rpeMin: 5, rpeMax: 6, color: '#a78bfa', orden: 0, ...extra,
})

const MIAS: ZonaEntrenador[] = [
  z(),
  z({ sigla: 'SPR', nombre: 'Sprint en cuesta', ...vam(130, 160), rpeMin: 10, rpeMax: null, orden: 1 }),
  z({ sigla: 'REG', nombre: 'Regenerativo', ...vam(50, 58), rpeMin: 2, rpeMax: null, orden: 2 }),
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
    expect(motivoNoUsable(z(vam(90, 70)), 0, MIAS)).toContain('menor')
  })

  it('CON DOS HITOS DISTINTOS, «AL REVÉS» NO SE PROHÍBE AQUÍ', () => {
    /* Del VT1 + 15 % al VT2 − 5 % está bien para casi todos y al revés para
       alguien con los dos umbrales muy juntos. Eso depende de cada atleta: se
       avisa al verlo con él (lib/clasificaciones-zonas), no se prohíbe. */
    const tempo = z({ desde: { ref: 'propia:9:0', pct: 115 }, hasta: { ref: 'propia:9:1', pct: 95 } })
    expect(motivoNoUsable(tempo, 0, [tempo])).toBeNull()
  })

  it('una zona sin ningún límite no es una zona', () => {
    expect(motivoNoUsable(z({ desde: null, hasta: null }), 0, MIAS)).toContain('límite')
  })

  it('un límite solo, sí: «por debajo de su VT1» es una zona', () => {
    expect(motivoNoUsable(z({ desde: null }), 0, MIAS)).toBeNull()
    expect(motivoNoUsable(z({ hasta: null }), 0, MIAS)).toBeNull()
  })

  it('un límite sin % o con un hito mal escrito se caza', () => {
    expect(motivoNoUsable(z({ desde: { ref: 'app:vam', pct: 0 } }), 0, MIAS)).toContain('%')
    expect(motivoNoUsable(z({ desde: { ref: 'vt1', pct: 90 } }), 0, MIAS)).toContain('hito')
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

  it('SIN COPIA Y SIN ZONA, VUELVE MARCADA — que es lo que antes no pasaba', () => {
    /* Lo que se arregló no es el número, es el silencio. cargaZona() devolvía
       nivel 2 y RPE 4,5 sin decir nada, y un tempo propio acababa contando como
       aeróbico suave en la carga, en la curva de forma y en el dibujo. */
    const r = resolverBloque('BORRADA', null, MIAS)
    expect(r.origen).toBe('desconocida')
    expect(r.nombre).toBe('Zona desconocida')
  })

  it('EL RESPALDO DA NÚMERO, y no cero, a propósito', () => {
    /* Las dos cosas serían suposiciones. La diferencia es que un cero borra de
       la semana una sesión que sí se hizo, y eso se confunde con descanso. Se
       da el número, se marca de dónde viene, y quien suma decide. */
    const r = resolverBloque('BORRADA', null, MIAS)
    expect(r.rpe).toBe(4.5)
    expect(cargaDe(r, 30)).toBe(135)
  })

  it('Y SALE DEL MISMO SITIO QUE cargaZona, para que no puedan discrepar', () => {
    const r = resolverBloque('BORRADA', null, MIAS)
    const c = cargaZona('BORRADA')
    expect(c.origen).toBe('supuesta')
    expect([r.rpe, r.nivel, r.nombre]).toEqual([c.rpe, c.nivel, c.nombre])
  })

  it('UN Z3 YA NO ES UNA ZONA DESCONOCIDA', () => {
    /* Lo era: esta resolución miraba los dos catálogos a mano y se saltaba
       Z1…Z7, así que una sesión que mezclara un Z3 con una zona propia marcaba
       el Z3 como desconocido. Salió al unificar las dos funciones. */
    const r = resolverBloque('Z3', null, MIAS)
    expect(r.origen).toBe('app')
    expect(r.nivel).toBe(3)
    expect(r.rpe).toBe(cargaZona('Z3').rpe)
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
    expect(leerZonas([{}])[0].desde).toBeNull()
  })

  it('un orden que falta no deja la lista sin ordenar', () => {
    // Number(undefined) es NaN, y con NaN el sort no ordena nada.
    expect(leerZonas([{ sigla: 'B' }, { sigla: 'A', orden: 0 }]).map(x => Number.isFinite(x.orden))).toEqual([true, true])
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
    expect(vuelta.desde).toEqual({ ref: 'app:vam', pct: 82 })
    expect(vuelta.hasta).toEqual({ ref: 'app:vam', pct: 88 })
    expect(fichaDe(vuelta).nivel).toBe(3)
  })

  it('la clasificación viaja con la zona', () => {
    expect(paraGuardar(z(), 'u1', 12).id_clasificacion).toBe(12)
    expect(leerZonas([{ ...paraGuardar(z(), 'u1', 12), id: 1 }])[0].idClasificacion).toBe(12)
    expect(paraGuardar(z({ idClasificacion: 4 }), 'u1').id_clasificacion).toBe(4)
    expect(paraGuardar(z(), 'u1').id_clasificacion).toBeNull()
  })

  it('LA ZONA DE DOS HITOS VA CON LAS COLUMNAS DE ANTES VACÍAS', () => {
    /* No tiene «un» porcentaje. La app publicada —que solo lee esas columnas—
       la ve sin terminar y no la ofrece, que es lo correcto: no sabría
       calcularla. */
    const tempo = z({ desde: { ref: 'propia:9:0', pct: 115 }, hasta: { ref: 'propia:9:1', pct: 95 } })
    const fila = paraGuardar(tempo, 'u1', 3)
    expect([fila.pct_min, fila.pct_max, fila.ref_definicion, fila.ref_indice]).toEqual([null, null, null, null])
    expect(fila.desde).toEqual({ ref: 'propia:9:0', pct: 115 })
    expect(leerZonas([fila])[0].hasta).toEqual({ ref: 'propia:9:1', pct: 95 })
  })

  it('LA DE UN HITO LAS SIGUE ESCRIBIENDO, para la app publicada', () => {
    const fila = paraGuardar(z({ ...vam(82, 88) }), 'u1')
    expect([fila.pct_min, fila.pct_max, fila.ref_definicion, fila.ref_indice]).toEqual([82, 88, null, null])
    const propia = paraGuardar(z({ desde: { ref: 'propia:7:1', pct: 90 }, hasta: { ref: 'propia:7:1', pct: 95 } }), 'u1')
    expect([propia.pct_min, propia.pct_max, propia.ref_definicion, propia.ref_indice]).toEqual([90, 95, 7, 1])
  })

  it('EL RESULTADO 0 NO SE PIERDE POR SER CERO', () => {
    // El primer resultado de un test tiene índice 0, que es falsy. Con un
    // `|| null` de más, todas las zonas colgadas del primer resultado
    // volverían apuntando a la referencia de la app, sin avisar.
    const fila = paraGuardar(z({ desde: { ref: 'propia:7:0', pct: 90 }, hasta: { ref: 'propia:7:0', pct: 95 } }), 'u1')
    expect(fila.ref_indice).toBe(0)
    const sinLimites = { ...fila, desde: null, hasta: null }
    expect(leerZonas([sinLimites])[0].desde).toEqual({ ref: 'propia:7:0', pct: 90 })
  })

  it('una referencia de la app que no es la de su deporte no se escribe como «la suya»', () => {
    // La columna vacía significa «la de la app DE SU DEPORTE»: un FTP en una
    // zona de carrera, leído así, saldría como VAM.
    const rara = paraGuardar(z({ desde: { ref: 'app:ftp', pct: 80 }, hasta: { ref: 'app:ftp', pct: 90 } }), 'u1')
    expect([rara.pct_min, rara.pct_max]).toEqual([null, null])
  })

  it('LAS ZONAS DE ANTES SE LEEN COMO DE UN HITO: el de su columna, o el de la app', () => {
    expect(leerZonas(filas).every(x => x.desde?.ref === 'app:vam' && x.hasta?.ref === 'app:vam')).toBe(true)
    expect(leerZonas([{ sigla: 'N', deporte: 'Natacion', pct_min: 90, pct_max: 95 }])[0].desde?.ref).toBe('app:css')
    expect(leerZonas([{ sigla: 'P', pct_min: 88, pct_max: 94, ref_definicion: 2, ref_indice: 0 }])[0].desde)
      .toEqual({ ref: 'propia:2:0', pct: 88 })
  })

  it('media referencia no cuenta como referencia', () => {
    // Un test sin decir qué resultado apuntaría al primero por accidente.
    expect(leerZonas([{ sigla: 'A', pct_min: 80, pct_max: 90, ref_definicion: 7 }])[0].desde?.ref).toBe('app:vam')
    expect(leerZonas([{ sigla: 'A', pct_min: 80, pct_max: 90, ref_indice: 1 }])[0].desde?.ref).toBe('app:vam')
    // Y un nulo explícito tampoco: Number(null) es 0, que es un índice válido.
    expect(leerZonas([{ sigla: 'A', pct_min: 80, pct_max: 90, ref_definicion: 7, ref_indice: null }])[0].desde?.ref).toBe('app:vam')
  })

  it('SI LA APP PUBLICADA CAMBIÓ EL %, MANDA LO QUE CAMBIÓ', () => {
    /* Mientras esto no esté subido, la app publicada solo sabe escribir las
       columnas de antes. Esta las escribe siempre iguales que los límites, así
       que si no cuadran es que la otra tocó el % después. */
    const fila = { ...paraGuardar(z(), 'u1', 1), pct_min: 80 }
    expect(leerZonas([fila])[0].desde).toEqual({ ref: 'app:vam', pct: 80 })
    // Una zona de dos hitos no la puede tocar la app publicada: sus límites mandan.
    const tempo = paraGuardar(z({ desde: { ref: 'propia:9:0', pct: 115 }, hasta: { ref: 'propia:9:1', pct: 95 } }), 'u1', 1)
    expect(leerZonas([tempo])[0].desde).toEqual({ ref: 'propia:9:0', pct: 115 })
  })

  it('un límite con basura vuelve nulo', () => {
    expect(leerLimite(null)).toBeNull()
    expect(leerLimite({ ref: 'app:vam' })).toBeNull()
    expect(leerLimite({ ref: 'app:vam', pct: -5 })).toBeNull()
    expect(leerLimite({ ref: 'vt1', pct: 90 })).toBeNull()
    expect(leerLimite({ ref: 'propia:9:0', pct: '115' })).toEqual({ ref: 'propia:9:0', pct: 115 })
  })
})

describe('los hitos que siguen existiendo', () => {
  const REF = 'propia:7:0'
  const conRef = z({ desde: { ref: REF, pct: 90 }, hasta: { ref: REF, pct: 95 } })

  it('vale si su hito está en la clasificación', () => {
    expect(motivoNoUsable(conRef, 0, [conRef], [REF])).toBeNull()
  })

  it('NO VALE SI EL HITO YA NO ESTÁ', () => {
    /* Pasa de dos formas: archivando el test, o quitando el hito de la
       clasificación después de usarlo. Las dos dejan un % sin nada detrás. */
    expect(motivoNoUsable(conRef, 0, [conRef], [])).toContain('hito')
    expect(motivoNoUsable(conRef, 0, [conRef], ['propia:7:1'])).toContain('hito')
  })

  it('sin la lista no se comprueba, y es a propósito', () => {
    // Quien resuelve una sigla a mitad de una sesión no tiene los tests
    // cargados ni debería. La comprobación vive donde se editan.
    expect(motivoNoUsable(conRef, 0, [conRef])).toBeNull()
  })
})

describe('las clasificaciones', () => {
  const filasC = [
    { id: 2, id_entrenador: 'u1', nombre: '6x100 · Ritmo100', deporte: 'Natacion', hitos: ['propia:2:0'], orden: 1 },
    { id: 1, id_entrenador: 'u1', nombre: 'Zonas sobre el CSS', deporte: 'Natacion', hitos: ['app:css', 'basura'], orden: 0 },
  ]
  const filasZ = [
    { id: 3, id_clasificacion: 2, sigla: 'SUA', nombre: 'Suave', deporte: 'Natacion', rpe_min: 3, orden: 0,
      desde: { ref: 'propia:2:0', pct: 88 }, hasta: { ref: 'propia:2:0', pct: 94 } },
    { id: 4, id_clasificacion: 2, sigla: 'UMB', nombre: 'Umbral', deporte: 'Natacion', rpe_min: 6, orden: 1,
      desde: { ref: 'propia:2:0', pct: 98 }, hasta: { ref: 'propia:2:0', pct: 102 } },
    { id: 6, id_clasificacion: 1, sigla: 'CGL', nombre: 'Glucolítica', deporte: 'Natacion', rpe_min: 9, orden: 0,
      desde: { ref: 'app:css', pct: 90 }, hasta: { ref: 'app:css', pct: 95 } },
    { id: 9, id_clasificacion: 77, sigla: 'HUERF', nombre: 'De una archivada', deporte: 'Natacion', rpe_min: 4,
      desde: { ref: 'app:css', pct: 90 }, hasta: { ref: 'app:css', pct: 95 } },
  ]

  it('cada una con sus zonas, en su orden', () => {
    const cs = leerClasificaciones(filasC, filasZ)
    expect(cs.map(c => c.nombre)).toEqual(['Zonas sobre el CSS', '6x100 · Ritmo100'])
    expect(cs[1].zonas.map(x => x.sigla)).toEqual(['SUA', 'UMB'])
    expect(cs[0].zonas.map(x => x.sigla)).toEqual(['CGL'])
  })

  it('un hito mal escrito no entra', () => {
    expect(leerClasificaciones(filasC, filasZ)[0].hitos).toEqual(['app:css'])
  })

  it('LA ZONA DE UNA CLASIFICACIÓN QUE NO LLEGÓ NO SE ENSEÑA', () => {
    // Su clasificación está archivada: enseñarla suelta la resucitaría.
    const todas = leerClasificaciones(filasC, filasZ).flatMap(c => c.zonas.map(x => x.sigla))
    expect(todas).not.toContain('HUERF')
  })

  it('LAS SUELTAS NO SE PIERDEN: se agrupan como antes, por deporte y referencia', () => {
    /* Las guarda así la app publicada hasta que se suba esta. */
    const sueltas = [
      { id: 20, sigla: 'A1', deporte: 'Ciclismo', pct_min: 80, pct_max: 90, rpe_min: 5 },
      { id: 21, sigla: 'A2', deporte: 'Ciclismo', pct_min: 90, pct_max: 100, rpe_min: 6 },
      { id: 22, sigla: 'B1', deporte: 'Ciclismo', pct_min: 90, pct_max: 100, rpe_min: 6, ref_definicion: 5, ref_indice: 1 },
    ]
    const cs = leerClasificaciones(filasC, sueltas)
    const nuevas = cs.filter(c => c.suelta)
    expect(nuevas).toHaveLength(2)
    expect(nuevas[0]).toMatchObject({ deporte: 'Ciclismo', hitos: ['app:ftp'] })
    // Sin id: no existe en la base hasta que se guarde.
    expect(nuevas[0].id).toBeUndefined()
    expect(nuevas[0].zonas.map(x => x.sigla)).toEqual(['A1', 'A2'])
    expect(nuevas[1].hitos).toEqual(['propia:5:1'])
  })

  it('null no revienta', () => {
    expect(leerClasificaciones(null, null)).toEqual([])
  })

  it('lo que se guarda', () => {
    const c: Clasificacion = { nombre: '  Laboratorio ', deporte: 'Carrera', hitos: ['propia:9:0', 'x'], orden: 2, zonas: [] }
    expect(clasificacionParaGuardar(c, 'u1')).toEqual({
      id_entrenador: 'u1', nombre: 'Laboratorio', deporte: 'Carrera', hitos: ['propia:9:0'], orden: 2,
    })
  })

  it('cuándo una clasificación no se puede guardar', () => {
    const c = (extra: Partial<Clasificacion>): Clasificacion =>
      ({ ...CLASIFICACION_NUEVA(0), nombre: 'Lab', hitos: ['app:vam'], ...extra })
    expect(motivoClasificacion(c({}))).toBeNull()
    expect(motivoClasificacion(c({ nombre: ' ' }))).toContain('nombre')
    expect(motivoClasificacion(c({ hitos: [] }))).toContain('hito')
    expect(motivoClasificacion(c({ hitos: ['app:vam', 'app:vam'] }))).toContain('repetido')
  })

  it('LA MISMA SIGLA EN DOS CLASIFICACIONES ES LEGAL; dentro de una, no', () => {
    const a = z({ idClasificacion: 1, sigla: 'UMB' })
    const b = z({ idClasificacion: 2, sigla: 'UMB' })
    expect(motivoNoUsable(a, 0, [a, b])).toBeNull()
    const c = z({ idClasificacion: 1, sigla: 'umb' })
    expect(motivoNoUsable(c, 1, [a, c])).toContain('Repetida')
  })
})

describe('la zona que viene después', () => {
  const base: Clasificacion = { nombre: 'Lab', deporte: 'Carrera', hitos: ['propia:9:0', 'propia:9:1'], orden: 0, zonas: [] }

  it('la primera es la de abajo del todo: por debajo del primer hito', () => {
    const n = zonaSiguiente(base)
    expect(n.desde).toBeNull()
    expect(n.hasta).toEqual({ ref: 'propia:9:0', pct: 100 })
  })

  it('LAS DEMÁS EMPIEZAN DONDE ACABA LA ANTERIOR', () => {
    const z2 = z({ desde: { ref: 'propia:9:0', pct: 100 }, hasta: { ref: 'propia:9:0', pct: 115 } })
    const n = zonaSiguiente({ ...base, zonas: [z2] })
    expect(n.desde).toEqual({ ref: 'propia:9:0', pct: 115 })
    expect(n.hasta).toEqual({ ref: 'propia:9:0', pct: 125 })
    // Y es una copia: tocar la nueva no mueve la de antes.
    n.desde!.pct = 117
    expect(z2.hasta!.pct).toBe(115)
  })

  it('sin hitos no se inventa ninguno', () => {
    const n = zonaSiguiente({ ...base, hitos: [] })
    expect([n.desde, n.hasta]).toEqual([null, null])
  })

  it('detrás de una sin techo, se deja en el primer hito', () => {
    const max = z({ desde: { ref: 'propia:9:1', pct: 105 }, hasta: null })
    const n = zonaSiguiente({ ...base, zonas: [max] })
    expect(n.desde).toEqual({ ref: 'propia:9:0', pct: 100 })
  })
})

describe('qué zona se puede afinar', () => {
  it('solo la que tiene los dos límites en el mismo hito', () => {
    expect(esDeUnHito(z())).toBe(true)
    expect(esDeUnHito(z({ desde: null }))).toBe(false)
    expect(esDeUnHito(z({ desde: { ref: 'propia:9:0', pct: 115 }, hasta: { ref: 'propia:9:1', pct: 95 } }))).toBe(false)
    expect(esDeUnHito(null)).toBe(false)
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
    z({ deporte: 'Carrera', sigla: 'TMP', ...vam(82, 88), rpeMin: 5, rpeMax: 6, orden: 0 }),
    z({ deporte: 'Ciclismo', sigla: 'TMP', desde: { ref: 'app:ftp', pct: 76 }, hasta: { ref: 'app:ftp', pct: 90 }, rpeMin: 6, rpeMax: 7, orden: 1 }),
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
