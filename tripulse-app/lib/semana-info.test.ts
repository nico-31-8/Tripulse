// ============================================================
// Información de la semana
// ============================================================
//
// Lo que se sujeta aquí no es la suma —eso se ve— sino lo que daría un número
// creíble y falso: que las tareas sin zona desaparezcan y dejen los porcentajes
// cuadrando sobre un total incompleto, que «suave» incluya AEM, y que contar
// por sesiones y por minutos se confunda.

import { describe, it, expect } from 'vitest'
import {
  comoTiempo, conLosFijados, porDisciplina, porZona, reparto, resumen, soloResistencia, ZONAS_SUAVES,
  type BloqueSemana,
} from './semana-info'

const b = (zona: string | null, minutos: number, extra: Partial<BloqueSemana> = {}): BloqueSemana =>
  ({ disciplina: 'Carrera', minutos, metros: 0, zona, ...extra })

describe('el tiempo y los metros de cada zona', () => {
  it('se suman por zona, de más a menos', () => {
    const r = porZona([b('AEL', 40), b('PAE', 10), b('AEL', 20)])
    expect(r.map(z => z.zona)).toEqual(['AEL', 'PAE'])
    expect(r[0].minutos).toBe(60)
  })

  it('trae el nombre y el color de verdad, no solo la sigla', () => {
    /* La sigla sola no la lee nadie que no se la sepa. */
    const r = porZona([b('AEL', 10)])
    expect(r[0].nombre).toBe('Aeróbico lipolítico')
    expect(r[0].color).toBe('#38BDF8')
  })

  it('los porcentajes salen sobre el total', () => {
    const r = porZona([b('AEL', 75), b('PAE', 25)])
    expect(r.find(z => z.zona === 'AEL')!.pct).toBe(75)
    expect(r.find(z => z.zona === 'PAE')!.pct).toBe(25)
  })

  it('LO QUE NO TIENE ZONA NO SE TIRA: se junta en «Sin zona»', () => {
    /* Escondiéndolo, los porcentajes sumarían 100 % sobre un total incompleto y
       el entrenador vería un reparto más limpio del que tiene. */
    const r = porZona([b('AEL', 50), b(null, 50), b('  ', 0)])
    expect(r.map(z => z.zona).sort()).toEqual(['AEL', 'Sin zona'])
    expect(r.find(z => z.zona === 'Sin zona')!.minutos).toBe(50)
    expect(r.find(z => z.zona === 'AEL')!.pct).toBe(50)
  })

  it('los metros se suman aparte del tiempo', () => {
    const r = porZona([b('AEL', 30, { metros: 5000 }), b('AEL', 30, { metros: 4000 })])
    expect(r[0].metros).toBe(9000)
  })

  it('sin nada, lista vacía y sin reventar', () => {
    expect(porZona(null)).toEqual([])
    expect(porZona([])).toEqual([])
  })
})

describe('por disciplina', () => {
  it('suma minutos, metros y cuenta SESIONES distintas', () => {
    const r = porDisciplina([
      b('AEL', 30, { disciplina: 'Carrera', metros: 6000, id_sesion: 1 }),
      b('PAE', 20, { disciplina: 'Carrera', metros: 4000, id_sesion: 1 }),
      b('AEL', 60, { disciplina: 'Ciclismo', id_sesion: 2 }),
    ])
    expect(r[0]).toEqual({ disciplina: 'Ciclismo', minutos: 60, metros: 0, sesiones: 1 })
    const carrera = r.find(d => d.disciplina === 'Carrera')!
    expect(carrera.minutos).toBe(50)
    expect(carrera.metros).toBe(10000)
    /* Dos bloques de la MISMA sesión son una sesión, no dos. */
    expect(carrera.sesiones).toBe(1)
  })
})

describe('CUÁNTO VA SUAVE, de las dos maneras', () => {
  /* Del máster (L1.4): «si solo cuentas sesiones te vas a creer más polarizado
     de lo que eres; si solo cuentas minutos vas a infravalorar el coste de las
     duras». Un mismo programa sale polarizado o piramidal según cómo se cuente. */

  it('el corte está en AEM: AER y AEL son suaves, AEM ya no', () => {
    expect(ZONAS_SUAVES).toEqual(['AER', 'AEL'])
    expect(reparto([b('AEM', 100)]).pctMinutos).toBe(0)
    expect(reparto([b('AEL', 100)]).pctMinutos).toBe(100)
    expect(reparto([b('AER', 100)]).pctMinutos).toBe(100)
  })

  it('por minutos es tiempo en zona', () => {
    expect(reparto([b('AEL', 80), b('PAE', 20)]).pctMinutos).toBe(80)
  })

  it('POR SESIONES MANDA SU ZONA MÁS ALTA, y da otro número', () => {
    /* Una sesión de 90 min con 20 de series es una sesión DURA aunque el 78 %
       de sus minutos sean suaves. Contada por minutos parece polarizada; por
       sesiones, no. Las dos cifras juntas describen la semana. */
    const semana = [
      b('AEL', 70, { id_sesion: 1 }), b('PAE', 20, { id_sesion: 1 }),  // sesión dura
      b('AEL', 60, { id_sesion: 2 }),                                   // sesión suave
      b('AER', 50, { id_sesion: 3 }),                                   // sesión suave
    ]
    const r = reparto(semana)
    expect(r.pctMinutos).toBe(90)     // 180 de 200 minutos
    expect(r.pctSesiones).toBe(67)    // 2 de 3 sesiones
  })

  it('«sin zona» no cuenta en ninguna de las dos', () => {
    /* No se sabe qué era, y meterlo en «suave» inflaría el número que el
       entrenador usa para decidir si la semana está bien repartida. */
    const r = reparto([b('AEL', 50, { id_sesion: 1 }), b(null, 50, { id_sesion: 2 })])
    expect(r.pctMinutos).toBe(100)
    expect(r.minutosSuaves + r.minutosDuros).toBe(50)
    expect(r.pctSesiones).toBe(100)
  })

  it('una semana vacía no da NaN', () => {
    const r = reparto([])
    expect(r.pctMinutos).toBe(0)
    expect(r.pctSesiones).toBe(0)
  })
})

describe('el tiempo escrito', () => {
  /* Lo pone `lib/medicion`. Aquí había un formateador propio y lo cazó el test
     que vigila que nadie escriba su «2h05»: estos casos siguen porque lo que
     importa es qué se lee en pantalla, no de qué fichero sale. */
  it('por debajo de una hora, minutos', () => {
    expect(comoTiempo(55)).toBe('55′')
    expect(comoTiempo(0)).toBe('0′')
  })
  it('por encima, horas y minutos', () => {
    expect(comoTiempo(250)).toBe('4h10')
    expect(comoTiempo(120)).toBe('2h')
    expect(comoTiempo(61)).toBe('1h01')
  })
})

describe('la línea de cuando está cerrado', () => {
  const grupos = [{ grupo: 'Glúteo', series: 12 }, { grupo: 'Core', series: 5 }]
  const semana = [b('AEL', 200, { id_sesion: 1 }), b('PAE', 50, { id_sesion: 2 })]

  it('dice series, grupos, tiempo y cuánto va suave', () => {
    expect(resumen(grupos, semana)).toBe('17 series · 2 grupos  ·  4h10 · 80 % suave')
  })

  it('con solo fuerza, no inventa la mitad de resistencia', () => {
    expect(resumen(grupos, [])).toBe('17 series · 2 grupos')
  })

  it('con solo resistencia, igual', () => {
    expect(resumen([], semana)).toBe('4h10 · 80 % suave')
  })

  it('LA SEMANA VACÍA LO DICE, no se queda en blanco', () => {
    /* Una cabecera con un hueco donde debería haber un número se lee como que
       la pantalla falla, no como que no hay nada puesto. */
    expect(resumen([], [])).toBe('nada puesto todavía')
    expect(resumen(null, null)).toBe('nada puesto todavía')
  })
})

describe('LAS ZONAS DE FUERZA NO SE MEZCLAN CON LAS DE RESISTENCIA', () => {
  /* Lo vio el entrenador en su propia pantalla: en el reparto por zona le
     salían FMI y FLEX —que son de gimnasio— entre AEL y PAE. Y lo peor no era
     verlas: al no estar en la lista de suaves, contaban como DURAS. Una semana
     con tres sesiones de fuerza salía más dura de lo que era, y ese porcentaje
     es justo el que se usa para decidir si la semana va polarizada. */
  const semana: BloqueSemana[] = [
    { disciplina: 'Carrera', minutos: 80, metros: 0, zona: 'AEL', id_sesion: 1 },
    { disciplina: 'Fuerza', minutos: 60, metros: 0, zona: 'FMI', id_sesion: 2 },
    { disciplina: 'Hibrido', minutos: 30, metros: 0, zona: 'FLEX', id_sesion: 3 },
  ]

  it('la fuerza se cae del reparto por zona', () => {
    expect(porZona(soloResistencia(semana)).map(z => z.zona)).toEqual(['AEL'])
  })

  it('y deja de contar como DURA', () => {
    expect(reparto(semana).pctMinutos).toBe(47)              // lo que salía antes
    expect(reparto(soloResistencia(semana)).pctMinutos).toBe(100)  // lo que es
  })

  it('el híbrido también es fuerza para esto', () => {
    expect(soloResistencia(semana).map(b => b.disciplina)).toEqual(['Carrera'])
  })

  it('pero por DEPORTE la fuerza sigue saliendo: ahí sí interesa', () => {
    expect(porDisciplina(semana).map(d => d.disciplina).sort()).toEqual(['Carrera', 'Fuerza', 'Hibrido'])
  })
})

describe('LO FIJADO SALE AUNQUE LLEVE CERO', () => {
  /* Es la mitad de para qué sirve fijarlo. Quien marca el glúteo lo marca
     porque quiere saber si le está entrando algo, y la semana que no le entra
     nada es justo la que hay que ver — y era la semana en que desaparecía. */
  const hay = [{ grupo: 'Cuádriceps', series: 9 }, { grupo: 'Core', series: 3 }]

  it('un grupo sin nada esta semana sale a 0', () => {
    expect(conLosFijados(hay, ['Glúteo'])).toEqual([{ grupo: 'Glúteo', series: 0 }])
  })

  it('y el que sí tiene, con lo suyo', () => {
    expect(conLosFijados(hay, ['Glúteo', 'Cuádriceps'])).toEqual([
      { grupo: 'Glúteo', series: 0 },
      { grupo: 'Cuádriceps', series: 9 },
    ])
  })

  it('EN EL ORDEN EN QUE SE FIJARON, no por series', () => {
    /* Es la lista del entrenador. Ordenando por series, un grupo salta de sitio
       justo el día que baja a cero, que es cuando más molesta buscarlo. */
    expect(conLosFijados(hay, ['Core', 'Cuádriceps']).map(g => g.grupo)).toEqual(['Core', 'Cuádriceps'])
  })

  it('con el nombre que fijó el entrenador cuando no hay de dónde sacarlo', () => {
    expect(conLosFijados([], ['Gemelo'])[0].grupo).toBe('Gemelo')
  })

  it('da igual cómo esté escrito', () => {
    expect(conLosFijados(hay, ['  cuádriceps  '])).toEqual([{ grupo: 'Cuádriceps', series: 9 }])
  })

  it('sin repetir, aunque se fije dos veces', () => {
    expect(conLosFijados(hay, ['Core', 'core'])).toHaveLength(1)
  })

  it('sin nada fijado, lista vacía', () => {
    expect(conLosFijados(hay, [])).toEqual([])
    expect(conLosFijados(hay, null)).toEqual([])
  })
})
