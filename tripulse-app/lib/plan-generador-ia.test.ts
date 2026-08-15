import { describe, it, expect } from 'vitest'
import {
  catalogoParaIA, encargoParaIA, aVerificables, aRelleno, encargoDeArreglo,
  ESQUEMA_SEMANA, INSTRUCCIONES_GENERACION, type SemanaIA,
} from './plan-generador-ia'
import { verificarSemana, deRelleno } from './plan-verificador'
import { formaDeSemana, type EntradaSemana } from './plan-semana'
import { colocarSemana } from './plan-colocacion'
import { rellenarSemana } from './plan-relleno'
import { todasLasClaves, resolverClave } from './plantillas'
import { PLANTILLAS_FUERZA } from './plantillas-fuerza'
import { DIAS } from './plan-colocacion'

const entrada = (p: Partial<EntradaSemana> = {}): EntradaSemana => ({
  horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio', ...p,
})

describe('el catalogo que se le enseña', () => {
  /* Es lo que convierte «inventarse una sesion» en algo IMPOSIBLE en vez de algo
     que hay que detectar despues. Si una clave no esta aqui, el modelo no puede
     elegirla; si esta y no existe, se la ofreceriamos y luego la rechazariamos. */
  it('lista todas las claves de resistencia, ni una menos', () => {
    const txt = catalogoParaIA('intermedio')
    todasLasClaves().forEach(k => expect(txt, `falta ${k}`).toContain(k))
  })

  it('y las de fuerza', () => {
    const txt = catalogoParaIA('intermedio')
    PLANTILLAS_FUERZA.forEach(p => expect(txt, `falta ${p.id}`).toContain(p.id))
  })

  it('cada clave va con su nombre y su zona, para que pueda elegir con criterio', () => {
    const txt = catalogoParaIA('intermedio')
    expect(txt).toMatch(/cic-aei\/over-unders\s+·\s+Intervalos al FTP · Over-unders\s+\(AEI/)
  })
})

describe('el encargo', () => {
  const e = entrada()
  const forma = formaDeSemana(e)
  const txt = encargoParaIA({ entrada: e, forma, dias: 6, contexto: 'Marta, viene con fatiga.' })

  it('lleva los limites con numeros, no con adjetivos', () => {
    expect(txt).toMatch(/Ciclismo 45–52 %/)   // el rango de 70.3 en B1-04
    expect(txt).toMatch(/mínimo 2/)
    expect(txt).toMatch(/20 %/)               // el margen de volumen
  })

  it('lleva el contexto del deportista y la fase', () => {
    expect(txt).toContain('Marta, viene con fatiga.')
    expect(txt).toMatch(/Media \(70\.3\)/)
    expect(txt).toMatch(/piramidal/i)
  })

  it('dice que plantilla de fuerza toca en esa fase', () => {
    expect(txt).toMatch(/fue-potencia/)
    expect(encargoParaIA({ entrada: entrada({ fase: 'transicion' }), forma, dias: 6 })).toMatch(/no toca fuerza/)
  })

  it('con disponibilidad real da los dias y sus minutos', () => {
    const con = encargoParaIA({
      entrada: e, forma,
      dias: [{ dia: 'Martes', minutos: 90 }, { dia: 'Sábado', minutos: null }],
    })
    expect(con).toMatch(/Martes \(90′\)/)
    expect(con).toMatch(/Sábado/)
  })
})

describe('las instrucciones', () => {
  it('dicen lo que se espera de el Y lo que no', () => {
    // Sin esto el modelo se dedica a imitar lo que haria una tabla, que es
    // justo lo que no hace falta que haga.
    expect(INSTRUCCIONES_GENERACION).toMatch(/no se negocian/i)
    expect(INSTRUCCIONES_GENERACION).toMatch(/36–48 h/)
    expect(INSTRUCCIONES_GENERACION).toMatch(/lo que él no puede|no de una tabla/i)
  })

  it('el esquema no le pregunta la zona', () => {
    // La zona sale de la clave. Preguntarsela abriria la puerta a que dijera una
    // zona y eligiera una plantilla de otra: lo que no se pregunta no se puede
    // contestar mal.
    const props = (ESQUEMA_SEMANA.properties.sesiones as any).items.properties
    expect(Object.keys(props)).not.toContain('zona')
    expect(Object.keys(props).sort()).toEqual(['brick', 'calidad', 'clave', 'dia', 'larga', 'minutos'])
  })

  it('el dia solo puede ser uno de los siete', () => {
    const dia = (ESQUEMA_SEMANA.properties.sesiones as any).items.properties.dia
    expect(dia.enum).toEqual(DIAS)
  })
})

describe('interpretar lo que devuelve el modelo', () => {
  it('una clave valida se convierte, y la zona sale de la plantilla', () => {
    const { sesiones, descartadas } = aVerificables({
      sesiones: [{ dia: 'Martes', clave: 'cic-aei/over-unders', minutos: 90, calidad: true }],
    })
    expect(descartadas).toEqual([])
    expect(sesiones[0].bloque).toBe('Ciclismo')
    expect(sesiones[0].zona).toBe(resolverClave('cic-aei/over-unders')!.plantilla.zona)
    expect(sesiones[0].calidad).toBe(true)
  })

  it('las de fuerza se reconocen por el prefijo', () => {
    const { sesiones } = aVerificables({ sesiones: [{ dia: 'Jueves', clave: 'fue-fm', minutos: 45 }] })
    expect(sesiones[0].bloque).toBe('Fuerza')
    expect(sesiones[0].claveFuerza).toBe('fue-fm')
    expect(sesiones[0].clave).toBe('')
  })

  /* Llegar al verificador con basura haria que sus mensajes hablaran de otra
     cosa: se limpia aqui y se cuenta lo que se cayo. */
  it('lo que no se puede interpretar se descarta y se dice', () => {
    const { sesiones, descartadas } = aVerificables({
      sesiones: [
        { dia: 'Martes', clave: 'inventada', minutos: 60 },
        { dia: 'Nosedia' as any, clave: 'cic-ael', minutos: 60 },
        { dia: 'Jueves', clave: 'fue-inventada', minutos: 45 },
        { dia: 'Jueves', clave: '', minutos: 45 },
      ],
    })
    expect(sesiones).toEqual([])
    expect(descartadas).toHaveLength(4)
    expect(descartadas.join(' ')).toMatch(/no existe en el catálogo/)
    expect(descartadas.join(' ')).toMatch(/no es una plantilla de fuerza/)
  })

  it('null y vacio no revientan', () => {
    expect(aVerificables(null).sesiones).toEqual([])
    expect(aVerificables({ sesiones: [] }).sesiones).toEqual([])
  })
})

describe('la vuelta al formato de la app', () => {
  /* A partir de aqui da igual quien monto la semana: la pinta la misma pantalla
     y la vuelca el mismo codigo. */
  it('produce Relleno con nombre resuelto del catalogo', () => {
    const { sesiones } = aVerificables({
      sesiones: [{ dia: 'Martes', clave: 'cic-aei/over-unders', minutos: 90, calidad: true }],
      razonamiento: 'Porque viene fresco.',
    })
    const r = aRelleno(sesiones, 'intermedio', 'Porque viene fresco.')
    expect(r[0].nombre).toBe('Intervalos al FTP · Over-unders')
    expect(r[0].hueco.calidad).toBe(true)
    expect(r[0].motivo).toContain('Porque viene fresco.')
    expect(r[0].motivo).toContain('asistente')
  })

  it('la fuerza tambien', () => {
    const { sesiones } = aVerificables({ sesiones: [{ dia: 'Jueves', clave: 'fue-fm', minutos: 45 }] })
    expect(aRelleno(sesiones, 'intermedio')[0].nombre).toBe('Fuerza máxima')
  })
})

describe('el ciclo completo, sin llamar a nadie', () => {
  /* La semana de las reglas, pasada por el mismo camino que la del modelo, tiene
     que salir intacta y aprobada. Si no, el puente entre los dos formatos estaria
     perdiendo algo y no lo sabriamos hasta verlo en pantalla. */
  it('la semana determinista sobrevive al viaje de ida y vuelta', () => {
    const e = entrada()
    const forma = formaDeSemana(e)
    const s = rellenarSemana({ forma, colocada: colocarSemana(forma, e.diasSemana), nivel: e.nivel, fase: e.fase })

    // Se convierte a lo que devolveria el modelo...
    const comoIA: SemanaIA = {
      sesiones: s.relleno.map(r => ({
        dia: r.dia,
        clave: r.claveFuerza || r.clave,
        minutos: r.minutos,
        calidad: r.hueco.calidad, larga: r.hueco.larga, brick: r.hueco.brick,
      })),
    }
    const { sesiones, descartadas } = aVerificables(comoIA)
    expect(descartadas).toEqual([])
    expect(sesiones).toHaveLength(s.relleno.length)
    expect(verificarSemana(sesiones, { entrada: e, forma, dias: e.diasSemana }).vale).toBe(true)

    // ...y las zonas coinciden con las originales.
    sesiones.forEach((x, i) => expect(x.zona, x.clave).toBe(s.relleno[i].zona))
  })

  it('una semana rota genera un encargo de arreglo que dice que arreglar', () => {
    const e = entrada()
    const forma = formaDeSemana(e)
    const mala: SemanaIA = {
      sesiones: [
        { dia: 'Martes', clave: 'cic-aei', minutos: 90, calidad: true },
        { dia: 'Miércoles', clave: 'car-aei', minutos: 60, calidad: true },
      ],
    }
    const { sesiones, descartadas } = aVerificables(mala)
    const v = verificarSemana(sesiones, { entrada: e, forma, dias: 6 })
    expect(v.vale).toBe(false)
    const txt = encargoDeArreglo(mala, v.paraElModelo, descartadas)
    expect(txt).toMatch(/HAY QUE ARREGLAR/)
    expect(txt).toMatch(/36–48 h/)              // el duro-facil
    expect(txt).toMatch(/semana ENTERA corregida/)
    expect(txt).toContain('cic-aei')            // lo que devolvio, para que se vea
  })
})
