import { describe, it, expect } from 'vitest'
import {
  CATALOGO, testPorClave, porDisciplina,
  camposDeProtocolo, camposPorPersona, protocoloInicial,
  resultadosDe, principalDe, estaCompleto, filasDeTest,
  avisosDeTesteo, mmss, enBanda,
} from './catalogo-tests'

const t = (clave: string) => {
  const x = testPorClave(clave)
  if (!x) throw new Error('no existe el test ' + clave)
  return x
}

const valor = (clave: string, v: Record<string, string>, salida: string, ctx = {}) =>
  resultadosDe(t(clave), v, ctx).find(r => r.salida.clave === salida)?.valor

describe('el catálogo está bien formado', () => {
  it('ninguna clave repetida: se buscan por clave y una repetida taparía a la otra', () => {
    const claves = CATALOGO.map(x => x.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('cada test tiene brutos, salidas y una salida principal', () => {
    for (const x of CATALOGO) {
      expect(x.brutos.length, x.clave).toBeGreaterThan(0)
      expect(x.salidas.length, x.clave).toBeGreaterThan(0)
      expect(principalDe(x, {}), x.clave).not.toBeNull()
    }
  })

  it('todo campo de protocolo trae valor por defecto', () => {
    /* Nadie debería tener que recordar que la caja del drop jump son 40 cm ni
       que la escalera se mide sobre 1,02 m. Si un protocolo sale vacío, el
       resultado sale a null y parece que el test está roto. */
    for (const x of CATALOGO) {
      for (const c of camposDeProtocolo(x)) {
        expect(c.porDefecto, x.clave + '.' + c.clave).toBeTruthy()
      }
    }
  })

  it('el desplegable siempre tiene su valor por defecto entre las opciones', () => {
    for (const x of CATALOGO) {
      for (const c of x.brutos) {
        if (!c.opciones) continue
        expect(c.opciones.map(o => o.valor), x.clave + '.' + c.clave).toContain(c.porDefecto)
      }
    }
  })

  it('sin nada escrito, ningún test dice estar completo', () => {
    for (const x of CATALOGO) {
      expect(estaCompleto(x, protocoloInicial(x)), x.clave).toBe(false)
    }
  })

  it('con el protocolo puesto, todo lo que queda es por persona', () => {
    for (const x of CATALOGO) {
      const p = camposDeProtocolo(x).length + camposPorPersona(x).length
      expect(p, x.clave).toBe(x.brutos.length)
    }
  })

  it('están las cinco disciplinas de la batería', () => {
    expect(porDisciplina().map(g => g.disciplina))
      .toEqual(['Carrera', 'Ciclismo', 'Natación', 'Fuerza', 'Triatlón'])
  })

  it('están los diecisiete tests que la app no tenía ya', () => {
    for (const c of ['6min', 'milla', 't30', '180m', 'ftp20', 'ftp60', 't400', 'swolf',
                     'rast', 'bosco', 'dropjump', 'escalera', 'brick', 'decoupling',
                     'tec-carrera', 'tec-natacion', 'bikefit']) {
      expect(testPorClave(c), c).toBeTruthy()
    }
  })

  it('los seis que la app YA tenía no están aquí duplicados', () => {
    /* ESTE TEST EXISTE PORQUE YA PASÓ. Metí MSS, ASR y 1RM en el catálogo sin
       mirar, y los tres ya estaban en /tests/[id] con su columna:
       test1_carrera.mss, test_fuerza.rm_estimado y la ASR calculada al vuelo.
       El del 1RM era el peor: la app usa Epley y yo guardaba la media de Epley
       y Brzycki, o sea DOS números distintos para el mismo levantamiento en dos
       tablas, y la gráfica solo lee uno.

       Montreal, CSS y rampa nunca llegaron a entrar, pero por la misma razón:
       de ellos salen las zonas. */
    const claves = CATALOGO.map(x => x.clave)
    const nombres = CATALOGO.map(x => x.nombre.toLowerCase()).join(' ')
    for (const c of ['mss', 'asr', 'rm']) expect(claves, c).not.toContain(c)
    for (const n of ['montreal', 'css', 'rampa', '1rm', 'reserva de velocidad']) {
      expect(nombres, n).not.toContain(n)
    }
  })
})

describe('los cálculos, contra los ejemplos de la batería', () => {
  it('6 min: 1500 m son 15 km/h', () => {
    expect(valor('6min', { metros: '1500' }, 'vam')).toBe(15)
  })

  it('el nivel de la VAM depende del sexo y calla si no se sabe', () => {
    expect(resultadosDe(t('6min'), { metros: '1700' }, { sexo: 'Hombre' })[0].lectura).toContain('avanzado')
    expect(resultadosDe(t('6min'), { metros: '1700' }, { sexo: 'Mujer' })[0].lectura).toContain('élite')
    expect(resultadosDe(t('6min'), { metros: '1700' }, { sexo: 'Prefiero no decirlo' })[0].lectura).toBe('')
  })

  it('T30: 9000 m en 30 min dan 3:20 de media y 3:26 de umbral', () => {
    /* 9 km en 1800 s son 200 s/km. El umbral es un 3 % más lento: 206. */
    const v = { metros: '9000' }
    expect(valor('t30', v, 'ritmoMedio')).toBe(200)
    expect(valor('t30', v, 'ritmoUmbral')).toBe(206)
    expect(resultadosDe(t('t30'), v)[0].texto).toBe('3:26 /km')
  })

  it('FTP 20: 300 W de media dan 285 de FTP y 365 de PAM', () => {
    const v = { media: '300' }
    expect(valor('ftp20', v, 'ftp')).toBe(285)
    expect(valor('ftp20', v, 'pam')).toBe(365)
  })

  it('FTP 60 no lleva corrección: una hora al máximo ES el FTP', () => {
    expect(valor('ftp60', { media: '285' }, 'ftp')).toBe(285)
  })

  it('T400: 300 s dan 1:20 /100m', () => {
    expect(valor('t400', { segundos: '300' }, 'ritmoUmbral')).toBe(80)
    expect(resultadosDe(t('t400'), { segundos: '300' })[0].texto).toBe('1:20 /100m')
  })



  it('brick y decoupling dan porcentaje con su lectura', () => {
    const b = resultadosDe(t('brick'), { brick: '260', aislado: '250' })[0]
    expect(b.valor).toBe(4)
    expect(b.lectura).toBe('Bien.')
    const d = resultadosDe(t('decoupling'), { primeros: '140', ultimos: '154' })[0]
    expect(d.valor).toBe(10)
    expect(d.lectura).toContain('Vigilar')
  })
})

describe('los saltos', () => {
  const CM = { unidad: 'cm', sj: '30', cmj: '34' }

  it('en centímetros salen los cinco números', () => {
    expect(valor('bosco', CM, 'cmj')).toBe(34)
    expect(valor('bosco', CM, 'sj')).toBe(30)
    expect(valor('bosco', CM, 'ie')).toBe(13.3)
    expect(valor('bosco', CM, 'eur')).toBe(1.13)
    expect(valor('bosco', CM, 'potenciaCMJ', { pesoKg: 72 })).toBe(3270)
  })

  it('el mismo salto en tiempo de vuelo da la misma altura', () => {
    /* h = 1,226 x t². Para 34 cm hacen falta 526 ms de vuelo. Si el interruptor
       de unidad no se respetase, 526 se leería como 526 cm. */
    const ms = { unidad: 'ms', sj: '495', cmj: '526' }
    expect(valor('bosco', ms, 'cmj')).toBeCloseTo(33.9, 1)
    expect(valor('bosco', ms, 'sj')).toBeCloseTo(30, 0)
  })

  it('sin SJ hay CMJ pero no hay IE ni EUR', () => {
    const v = { unidad: 'cm', cmj: '34' }
    expect(valor('bosco', v, 'cmj')).toBe(34)
    expect(valor('bosco', v, 'ie')).toBeNull()
    expect(valor('bosco', v, 'eur')).toBeNull()
    expect(estaCompleto(t('bosco'), v)).toBe(true)
  })

  it('sin peso no hay potencia, y se dice por qué', () => {
    const r = resultadosDe(t('bosco'), CM).find(x => x.salida.clave === 'potenciaCMJ')!
    expect(r.valor).toBeNull()
    expect(r.lectura).toContain('peso')
  })

  it('drop jump: 40 cm con 200 ms de contacto dan RSI 2', () => {
    const v = { unidad: 'cm', caja: '40', salto: '40', contacto: '200' }
    expect(valor('dropjump', v, 'rsi')).toBe(2)
    expect(resultadosDe(t('dropjump'), v)[0].lectura).toContain('élite')
  })
})


describe('los tests sin fórmula se registran, no se inventan', () => {
  it('180 m repetidos: repeticiones y caída, que es aritmética', () => {
    const v = { repes: '12', mejor: '28', ultimo: '31' }
    expect(valor('180m', v, 'repes')).toBe(12)
    expect(valor('180m', v, 'caida')).toBe(10.7)
  })

  it('RAST: tiempo y lactato tal cual', () => {
    const v = { distancia: '400', segundos: '58', lactato: '14.2' }
    expect(valor('rast', v, 'tiempo')).toBe(58)
    expect(valor('rast', v, 'lactato')).toBe(14.2)
  })
})

describe('filasDeTest — lo que se escribe en tests_libres', () => {
  it('una fila por resultado, con el test delante del nombre', () => {
    const filas = filasDeTest(t('bosco'), 7, '2026-09-02',
      { unidad: 'cm', sj: '30', cmj: '34' }, { pesoKg: 72 })
    expect(filas).toHaveLength(5)
    expect(filas.map(f => f.nombre)).toEqual([
      'Saltos: SJ y CMJ · CMJ',
      'Saltos: SJ y CMJ · Squat Jump',
      'Saltos: SJ y CMJ · Potencia del CMJ',
      'Saltos: SJ y CMJ · Índice de elasticidad',
      'Saltos: SJ y CMJ · EUR',
    ])
    expect(filas.every(f => f.id_deportista === 7 && f.fecha === '2026-09-02')).toBe(true)
  })

  it('lo que no salió no se escribe: nada de filas a null', () => {
    /* Una fila con el resultado vacío aparecería luego en el historial como si
       el test se hubiera hecho. */
    const filas = filasDeTest(t('bosco'), 7, '2026-09-02', { unidad: 'cm', cmj: '34' })
    expect(filas.map(f => f.nombre)).toEqual(['Saltos: SJ y CMJ · CMJ'])
  })

  it('los intermedios marcados noGuardar se quedan fuera', () => {
    /* El ritmo medio del T30 se enseña para entender de dónde sale el umbral,
       pero seguirlo en el tiempo junto al umbral sería tener dos series que
       significan lo mismo. */
    const filas = filasDeTest(t('t30'), 7, '2026-09-02', { metros: '9000' })
    expect(filas).toHaveLength(1)
    expect(filas[0].nombre).toContain('Ritmo umbral')
    expect(filas[0].unidad).toBe('s/km')
  })

  it('las notas van en todas las filas, y vacías quedan a null', () => {
    const v = { unidad: 'cm', cmj: '34' }
    expect(filasDeTest(t('bosco'), 7, '2026-09-02', v, {}, '  ')[0].notas).toBeNull()
    expect(filasDeTest(t('bosco'), 7, '2026-09-02', v, {}, 'con molestia')[0].notas).toBe('con molestia')
  })
})

describe('avisosDeTesteo — las reglas del §9', () => {
  it('avisa en las 3 semanas de tapering', () => {
    expect(avisosDeTesteo({ test: t('6min'), diasHastaCarreraA: 14 })[0]).toContain('tapering')
    expect(avisosDeTesteo({ test: t('6min'), diasHastaCarreraA: 40 })).toEqual([])
  })

  it('avisa de juntar dos disciplinas el mismo día', () => {
    const a = avisosDeTesteo({ test: t('6min'), yaHoy: [t('ftp20')] })
    expect(a[0]).toContain('Ciclismo')
  })

  it('dos tests de la MISMA disciplina no son dos disciplinas', () => {
    expect(avisosDeTesteo({ test: t('6min'), yaHoy: [t('milla')] })).toEqual([])
  })

  it('no sabe si es semana de descarga: calla en vez de avisar en falso', () => {
    expect(avisosDeTesteo({ test: t('6min'), semanaDeDescarga: null })).toEqual([])
    expect(avisosDeTesteo({ test: t('6min'), semanaDeDescarga: true })).toEqual([])
    expect(avisosDeTesteo({ test: t('6min'), semanaDeDescarga: false })[0]).toContain('descarga')
  })
})

describe('mmss', () => {
  it('pasa segundos a minutos:segundos', () => {
    expect(mmss(206)).toBe('3:26')
    expect(mmss(80)).toBe('1:20')
    expect(mmss(null)).toBe('—')
    expect(mmss(0)).toBe('—')
  })
})

describe('barrido: los diecisiete con datos plausibles', () => {
  /* El catálogo es datos con funciones dentro, y la pantalla las llama todas al
     pintar. Una que reviente con un valor raro no la caza el compilador: sale
     como pantalla en blanco. Esto las ejercita todas, las tres —calcular,
     formato y leer— con datos de un test de verdad. */
  const DATOS: Record<string, Record<string, string>> = {
    '6min': { metros: '1620' },
    milla: { minutos: '5.4' },
    t30: { metros: '8700' },
    '180m': { repes: '12', mejor: '28', ultimo: '31' },
    ftp20: { media: '295' },
    ftp60: { media: '272' },
    t400: { segundos: '318' },
    swolf: { largo: '25', brazadas: '17', segundos: '19' },
    rast: { distancia: '400', segundos: '59', lactato: '13.5' },
    bosco: { unidad: 'cm', sj: '29', cmj: '33' },
    dropjump: { unidad: 'cm', caja: '40', salto: '31', contacto: '215' },
    escalera: { altura: '1.02', segundos: '0.48' },
    brick: { brick: '265', aislado: '248' },
    decoupling: { primeros: '142', ultimos: '150' },
    /* Las tres de técnica: valores dentro de banda salvo el contacto, que va a
       propósito fuera para que el barrido pase por las dos ramas. */
    'tec-carrera': { cadencia: '174', contacto: '310', oscilacion: '7.4', inclinacion: '7' },
    'tec-natacion': { frecuencia: '52' },
    bikefit: { rodilla: '31', torso: '23', tobillo: '15', float: '5' },
  }

  it('cada test del catálogo tiene datos en este barrido', () => {
    /* Si mañana se añade un test y no se añade aquí, salta este y no el de
       abajo, que si no pasaría de largo sin probarlo. */
    expect(CATALOGO.map(x => x.clave).sort()).toEqual(Object.keys(DATOS).sort())
  })

  const CTX = { pesoKg: 74, sexo: 'Hombre' }

  for (const x of CATALOGO) {
    it(x.clave + ' calcula, formatea y lee sin reventar', () => {
      const v = { ...protocoloInicial(x), ...DATOS[x.clave] }
      const res = resultadosDe(x, v, CTX)
      expect(res).toHaveLength(x.salidas.length)
      for (const r of res) {
        expect(typeof r.texto, x.clave + '/' + r.salida.clave).toBe('string')
        expect(typeof r.lectura, x.clave + '/' + r.salida.clave).toBe('string')
      }
      // Con datos buenos, el número principal tiene que salir.
      expect(principalDe(x, v, CTX)!.valor, x.clave).not.toBeNull()
      expect(estaCompleto(x, v, CTX), x.clave).toBe(true)
      expect(filasDeTest(x, 1, '2026-09-02', v, CTX).length, x.clave).toBeGreaterThan(0)
    })
  }

  it('y tampoco revientan con basura escrita a mano', () => {
    /* Las casillas son de texto: un guion, una coma o un menos acaban ahí. */
    for (const basura of ['-', 'abc', '-5', '0', '1e400', ',']) {
      for (const x of CATALOGO) {
        const v: Record<string, string> = { ...protocoloInicial(x) }
        for (const c of x.brutos) if (!c.opciones) v[c.clave] = basura
        expect(() => resultadosDe(x, v, CTX), x.clave + ' con ' + basura).not.toThrow()
      }
    }
  })
})

describe('las fichas de técnica y sus bandas de referencia', () => {
  const campo = (clave: string, k: string) =>
    testPorClave(clave)!.brutos.find(c => c.clave === k)!

  it('las bandas son las del documento, §6', () => {
    expect(campo('tec-carrera', 'cadencia').banda).toEqual({ min: 170, max: 180, texto: '170-180 ppm' })
    expect(campo('tec-carrera', 'oscilacion').banda!.max).toBe(8)
    expect(campo('tec-carrera', 'inclinacion').banda).toMatchObject({ min: 5, max: 10 })
    expect(campo('bikefit', 'rodilla').banda).toMatchObject({ min: 25, max: 35 })
    expect(campo('bikefit', 'float').banda).toMatchObject({ min: 4, max: 6 })
    expect(campo('tec-natacion', 'frecuencia').banda).toMatchObject({ min: 45, max: 70 })
  })

  it('el contacto solo tiene techo, no suelo', () => {
    /* Un contacto MÁS corto que el de élite no es un fallo: es mejor todavía.
       Poniéndole un mínimo, un atleta muy reactivo saldría «fuera de rango». */
    const b = campo('tec-carrera', 'contacto').banda!
    expect(b.min).toBeUndefined()
    expect(b.max).toBe(300)
    expect(enBanda(campo('tec-carrera', 'contacto'), 180)).toBe(true)
  })

  it('dice si una medida cae dentro o fuera', () => {
    const cad = campo('tec-carrera', 'cadencia')
    expect(enBanda(cad, 174)).toBe(true)
    expect(enBanda(cad, 170)).toBe(true)      // el borde entra
    expect(enBanda(cad, 180)).toBe(true)
    expect(enBanda(cad, 162)).toBe(false)
    expect(enBanda(cad, 191)).toBe(false)
  })

  it('sin número, ni dentro ni fuera', () => {
    /* Enseñar «fuera de rango» en una casilla vacía sería mentir. */
    expect(enBanda(campo('tec-carrera', 'cadencia'), null)).toBeNull()
    expect(enBanda(campo('tec-carrera', 'cadencia'), NaN)).toBeNull()
  })

  it('un campo sin banda nunca está fuera', () => {
    expect(enBanda(campo('tec-natacion', 'distanciaBrazada'), 2.1)).toBeNull()
    expect(enBanda(campo('tec-carrera', 'overstriding'), 1)).toBeNull()
  })

  it('el resumen cuenta SOLO lo medido, no lo que falta', () => {
    /* Con dos casillas rellenas de cuatro dice «de 2», no «de 4»: lo que no se
       midió no está ni bien ni mal, y contarlo como fallo empujaría a rellenar
       por rellenar. */
    const t = testPorClave('tec-carrera')!
    const dos = principalDe(t, { cadencia: '174', oscilacion: '7.4' }, {})!
    expect(dos.texto).toBe('2 de 2')

    const conUnaMal = principalDe(t, { cadencia: '174', oscilacion: '11' }, {})!
    expect(conUnaMal.texto).toBe('1 de 2')
  })

  it('sin nada medido no hay resumen, y el test no se puede guardar', () => {
    const t = testPorClave('tec-carrera')!
    expect(principalDe(t, {}, {})!.valor).toBeNull()
    expect(estaCompleto(t, {}, {})).toBe(false)
    expect(estaCompleto(t, { cadencia: '174' }, {})).toBe(true)
  })

  it('el overstriding no entra en el recuento aunque esté puesto', () => {
    /* Es un sí o un no, no una medida con rango. */
    const t = testPorClave('tec-carrera')!
    expect(principalDe(t, { cadencia: '174', overstriding: 'si' }, {})!.texto).toBe('1 de 1')
  })

  it('las tres van a la disciplina que les toca', () => {
    expect(testPorClave('tec-carrera')!.disciplina).toBe('Carrera')
    expect(testPorClave('tec-natacion')!.disciplina).toBe('Natación')
    expect(testPorClave('bikefit')!.disciplina).toBe('Ciclismo')
  })
})
