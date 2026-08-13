import { describe, it, expect } from 'vitest'
import {
  aplicarRevision, describirSemanaParaIA, opcionesPermitidas, cargaRelativa,
  ESQUEMA_REVISION, INSTRUCCIONES_REVISION, type RevisionIA,
} from './plan-ia'
import { formaDeSemana, type EntradaSemana } from './plan-semana'
import { colocarSemana } from './plan-colocacion'
import { rellenarSemana } from './plan-relleno'
import { cargaZona } from './zonas'
import { resolverClave } from './plantillas'

const base = (p: Partial<EntradaSemana> = {}): EntradaSemana => ({
  horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio', ...p,
})

function semana(p: Partial<EntradaSemana> = {}) {
  const e = base(p)
  const forma = formaDeSemana(e)
  return rellenarSemana({ forma, colocada: colocarSemana(forma, e.diasSemana), nivel: e.nivel, fase: e.fase })
}

/** El indice de la primera sesion que no es de fuerza. */
const primera = (s: ReturnType<typeof semana>) => s.relleno.findIndex(r => !!r.clave)

describe('sin IA, o con una IA que no dice nada, el plan no cambia', () => {
  /* La propiedad que hace que esta capa sea opcional de verdad: sin clave de API,
     con el modelo caido o con una respuesta vacia, la semana determinista se
     queda tal cual. El peor caso de la IA es no aportar. */
  it('null, undefined y una lista vacia dejan la semana intacta', () => {
    const s = semana()
    ;[null, undefined, { cambios: [] } as RevisionIA].forEach(rev => {
      const r = aplicarRevision(s, rev as any)
      expect(r.semana.relleno).toEqual(s.relleno)
      expect(r.aplicados).toEqual([])
      expect(r.rechazados).toEqual([])
    })
  })

  it('nunca muta la semana original', () => {
    const s = semana()
    const antes = JSON.stringify(s.relleno)
    const i = primera(s)
    aplicarRevision(s, { cambios: [{ i, clave: opcionesPermitidas(s.relleno, i)[0], porque: 'x' }] })
    expect(JSON.stringify(s.relleno)).toBe(antes)
  })
})

describe('un cambio valido se aplica y se explica', () => {
  it('cambia la sesion y deja escrito el porque', () => {
    const s = semana()
    const i = primera(s)
    const destino = opcionesPermitidas(s.relleno, i)[0]
    const r = aplicarRevision(s, { cambios: [{ i, clave: destino, porque: 'Lleva la disposicion en Fatiga y el TSB en -28' }] })
    expect(r.aplicados).toHaveLength(1)
    expect(r.rechazados).toEqual([])
    expect(r.semana.relleno[i].clave).toBe(destino)
    expect(r.semana.relleno[i].motivo).toContain('TSB')
    expect(r.semana.relleno[i].motivo).toContain('asistente')
  })

  it('el nombre se rehace desde el catalogo, no se lo inventa el modelo', () => {
    const s = semana()
    const i = primera(s)
    const destino = opcionesPermitidas(s.relleno, i).find(k => k.includes('/'))!
    const r = aplicarRevision(s, { cambios: [{ i, clave: destino, porque: 'x' }] })
    const res = resolverClave(destino)!
    expect(r.semana.relleno[i].nombre).toBe(res.plantilla.nombre + ' · ' + res.variante!.nombre)
  })
})

describe('lo que NO se le acepta', () => {
  const rechazo = (cambio: any) => aplicarRevision(semana(), { cambios: [cambio] })

  it('una clave que no existe', () => {
    const r = rechazo({ i: primera(semana()), clave: 'inventada-total', porque: 'x' })
    expect(r.aplicados).toEqual([])
    expect(r.rechazados[0].motivo).toMatch(/no existe en el cat/i)
  })

  it('una sesion que no esta en la semana', () => {
    expect(rechazo({ i: 999, clave: 'cic-ael', porque: 'x' }).rechazados[0].motivo).toMatch(/no existe en la semana/i)
    expect(rechazo({ i: -1, clave: 'cic-ael', porque: 'x' }).rechazados[0].motivo).toMatch(/no existe en la semana/i)
  })

  it('cambiar una sesion por otra de OTRO deporte', () => {
    const s = semana()
    const i = s.relleno.findIndex(r => r.hueco.bloque === 'Carrera' && !!r.clave)
    const r = aplicarRevision(s, { cambios: [{ i, clave: 'cic-ael', porque: 'x' }] })
    expect(r.rechazados[0].motivo).toMatch(/es de Ciclismo/i)
  })

  it('tocar una sesion de fuerza', () => {
    const s = semana()
    const i = s.relleno.findIndex(r => r.hueco.bloque === 'Fuerza')
    if (i >= 0) {
      const r = aplicarRevision(s, { cambios: [{ i, clave: 'cic-ael', porque: 'x' }] })
      expect(r.rechazados[0].motivo).toMatch(/fase del macrociclo/i)
    }
  })

  it('proponer la que ya tenia', () => {
    const s = semana()
    const i = primera(s)
    const r = aplicarRevision(s, { cambios: [{ i, clave: s.relleno[i].clave, porque: 'x' }] })
    expect(r.rechazados[0].motivo).toMatch(/misma sesi/i)
  })

  it('duplicar una sesion que ya esta en la semana', () => {
    // El par se BUSCA por sus propiedades, no se cogen los dos primeros: los
    // rechazos se comprueban en orden, y si el destino ademas sube de zona salta
    // antes ese. Este test se rompio justo asi al reordenar el relleno por dias.
    const s = semana()
    const con = s.relleno.map((r, i) => ({ r, i })).filter(x => !!x.r.clave)
    const par = con.flatMap(a => con
      .filter(b => b.i !== a.i
        && b.r.hueco.bloque === a.r.hueco.bloque
        && cargaZona(b.r.zona).nivel <= cargaZona(a.r.zona).nivel)
      .map(b => ({ destino: a, fuente: b })))[0]
    expect(par, 'no hay dos sesiones del mismo deporte con las que probar').toBeDefined()
    const r = aplicarRevision(s, { cambios: [{ i: par.destino.i, clave: par.fuente.r.clave, porque: 'x' }] })
    expect(r.rechazados[0].motivo).toMatch(/ya está en la semana/i)
  })

  it('dos cambios para la misma sesion: solo vale el primero', () => {
    const s = semana()
    const i = primera(s)
    const [a, b] = opcionesPermitidas(s.relleno, i)
    const r = aplicarRevision(s, { cambios: [{ i, clave: a, porque: 'x' }, { i, clave: b, porque: 'y' }] })
    expect(r.aplicados).toHaveLength(1)
    expect(r.semana.relleno[i].clave).toBe(a)
    expect(r.rechazados[0].motivo).toMatch(/ya había propuesto/i)
  })
})

describe('la regla asimetrica: bajar si, subir no', () => {
  /* La propiedad de seguridad de toda la capa. Bajar es la decision que toma un
     entrenador cuando el atleta llega tocado, y equivocarse bajando cuesta una
     sesion; equivocarse subiendo cuesta una lesion. */
  it('rechaza cualquier cambio que suba de zona', () => {
    const s = semana()
    const i = s.relleno.findIndex(r => !!r.clave && cargaZona(r.zona).nivel <= 2)
    expect(i, 'no hay ninguna sesion suave en la semana').toBeGreaterThanOrEqual(0)
    const prefijo = s.relleno[i].hueco.bloque === 'Ciclismo' ? 'cic' : s.relleno[i].hueco.bloque === 'Carrera' ? 'car' : 'nat'
    const r = aplicarRevision(s, { cambios: [{ i, clave: prefijo + '-pae', porque: 'quiero meterle mas' }] })
    expect(r.aplicados).toEqual([])
    expect(r.rechazados[0].motivo).toMatch(/subir no/i)
  })

  it('acepta bajar de zona', () => {
    const s = semana()
    const i = s.relleno.findIndex(r => !!r.clave && cargaZona(r.zona).nivel >= 3)
    expect(i, 'no hay ninguna sesion intensa en la semana').toBeGreaterThanOrEqual(0)
    const suave = opcionesPermitidas(s.relleno, i)
      .find(k => cargaZona(resolverClave(k)!.plantilla.zona).nivel < cargaZona(s.relleno[i].zona).nivel)!
    const r = aplicarRevision(s, { cambios: [{ i, clave: suave, porque: 'viene con fatiga acumulada' }] })
    expect(r.aplicados).toHaveLength(1)
    expect(cargaZona(r.semana.relleno[i].zona).nivel).toBeLessThan(cargaZona(s.relleno[i].zona).nivel)
  })
})

describe('lo que se le ensena al modelo', () => {
  it('cada sesion va numerada, con su zona, su porque y sus alternativas', () => {
    const txt = describirSemanaParaIA(semana())
    expect(txt).toMatch(/^0\. /m)
    expect(txt).toMatch(/Puedes cambiarla por:/)
    expect(txt).toMatch(/está:/)
  })

  it('la fuerza se marca como no cambiable', () => {
    const s = semana()
    if (s.relleno.some(r => r.hueco.bloque === 'Fuerza')) {
      expect(describirSemanaParaIA(s)).toMatch(/no se cambia/)
    }
  })

  /* EL TEST QUE ENCONTRO EL FALLO. `opcionesPermitidas` ofrecia sesiones que
     `aplicarRevision` rechazaba despues por estar ya en otra parte de la semana.
     Ofrecer algo y luego rechazarlo hace que el modelo parezca tonto cuando la
     culpa es del prompt: la lista que se le ensena tiene que ser EXACTAMENTE la
     que se le acepta. */
  it('las alternativas que se listan son exactamente las que se aceptarian', () => {
    const s = semana()
    s.relleno.forEach((_, i) => {
      opcionesPermitidas(s.relleno, i).forEach(k => {
        const r = aplicarRevision(s, { cambios: [{ i, clave: k, porque: 'x' }] })
        expect(r.aplicados.length, `se ofrecio ${k} para la ${i} y se rechazo: ${r.rechazados[0]?.motivo}`).toBe(1)
      })
    })
  })

  it('y ninguna de las que se ofrecen sube de zona ni cambia de deporte', () => {
    const s = semana()
    s.relleno.forEach((r, i) => {
      opcionesPermitidas(s.relleno, i).forEach(k => {
        const p = resolverClave(k)!.plantilla
        expect(cargaZona(p.zona).nivel, `${k} por encima de ${r.zona}`).toBeLessThanOrEqual(cargaZona(r.zona).nivel)
        expect(p.disciplina).toBe(r.hueco.bloque)
      })
    })
  })

  it('las instrucciones dicen que la lista vacia es una buena respuesta', () => {
    // Sin esto el modelo cambia cosas por justificar la llamada.
    expect(INSTRUCCIONES_REVISION).toMatch(/VACÍA/)
    expect(INSTRUCCIONES_REVISION).toMatch(/NUNCA subir/)
  })

  it('el esquema obliga a justificar cada cambio', () => {
    const item: any = (ESQUEMA_REVISION.properties.cambios as any).items
    expect(item.required).toContain('porque')
    expect(item.required).toContain('clave')
    expect(item.additionalProperties).toBe(false)
  })
})

describe('lo que ningun cambio suelto puede ver: la semana entera', () => {
  /* EL HUECO QUE ENCONTRO LA PRIMERA LLAMADA REAL AL MODELO. `aplicarRevision`
     valida cada cambio por separado y cada uno puede ser razonable mientras el
     conjunto deja de serlo: cinco cambios a la baja convirtieron un fondo de 93'
     en AEL en un rodaje de recuperacion. Justificado con esa fatiga, pero le
     quitaba a la semana la zona que la sostiene y nadie lo comprobaba.

     No bloquea, informa: bajar carga no es peligroso —lo peligroso es subirla y
     eso ya esta prohibido— pero convertir una semana de carga en una de descarga
     es una decision del entrenador, no un efecto lateral. */
  const bajarTodo = (s: ReturnType<typeof semana>) => ({
    cambios: s.relleno.map((r, i) => {
      if (!r.clave) return null
      const suave = opcionesPermitidas(s.relleno, i)
        .filter(k => cargaZona(resolverClave(k)!.plantilla.zona).nivel < cargaZona(r.zona).nivel)
        .sort((a, b) => cargaZona(resolverClave(a)!.plantilla.zona).nivel - cargaZona(resolverClave(b)!.plantilla.zona).nivel)[0]
      return suave ? { i, clave: suave, porque: 'todo suave' } : null
    }).filter(Boolean) as any[],
  })

  it('avisa cuando la semana pierde carga de verdad', () => {
    const s = semana()
    const r = aplicarRevision(s, bajarTodo(s))
    expect(r.aplicados.length, 'la prueba no vale si no baja nada').toBeGreaterThan(0)
    expect(r.semana.avisos.join(' ')).toMatch(/carga|descarga/i)
  })

  it('dice cuando la semana se ha quedado sin estímulo', () => {
    const s = semana()
    const r = aplicarRevision(s, bajarTodo(s))
    const quedaCalidad = s.relleno.some((x, i) => x.hueco.calidad && cargaZona(r.semana.relleno[i].zona).nivel >= 3)
    if (!quedaCalidad) {
      expect(r.semana.avisos.join(' ')).toMatch(/sin el estímulo/i)
    } else {
      expect(r.semana.avisos.join(' ')).toMatch(/suavizado|carga/i)
    }
  })

  it('un cambio suelto y pequeño no dispara ningún aviso de conjunto', () => {
    // Si saltara con cualquier ajuste seria ruido, y el ruido tapa lo que importa.
    const s = semana()
    const i = primera(s)
    const igual = opcionesPermitidas(s.relleno, i)
      .find(k => cargaZona(resolverClave(k)!.plantilla.zona).nivel === cargaZona(s.relleno[i].zona).nivel)
    if (igual) {
      const r = aplicarRevision(s, { cambios: [{ i, clave: igual, porque: 'variedad' }] })
      expect(r.semana.avisos).toEqual(s.avisos)
    }
  })

  it('la carga relativa baja cuando se suaviza y no cambia cuando no', () => {
    const s = semana()
    expect(cargaRelativa(s.relleno)).toBeGreaterThan(0)
    const r = aplicarRevision(s, bajarTodo(s))
    expect(cargaRelativa(r.semana.relleno)).toBeLessThan(cargaRelativa(s.relleno))
    expect(cargaRelativa(aplicarRevision(s, { cambios: [] }).semana.relleno)).toBe(cargaRelativa(s.relleno))
  })
})

describe('una respuesta absurda entera', () => {
  it('se descarta sin romper nada y la semana sigue siendo valida', () => {
    const s = semana()
    const r = aplicarRevision(s, {
      cambios: [
        { i: 0, clave: '', porque: '' },
        { i: 99, clave: 'cic-ael', porque: 'x' },
        { i: 1, clave: 'no-existe/tampoco', porque: 'x' },
        { i: 2, clave: 'nat-pala', porque: 'a tope' },
      ],
    } as any)
    expect(r.semana.relleno).toHaveLength(s.relleno.length)
    expect(r.rechazados.length).toBeGreaterThan(0)
    expect(r.semana.avisos.join(' ')).toMatch(/descartados/i)
    r.semana.relleno.forEach(x => { if (x.clave) expect(resolverClave(x.clave)).toBeTruthy() })
  })
})
