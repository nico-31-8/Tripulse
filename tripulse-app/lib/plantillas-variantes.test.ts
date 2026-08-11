import { describe, it, expect } from 'vitest'
import {
  PLANTILLAS, NIVELES, plantillaPorId, variantesDe, opcionesDe, bloquesDe,
  claveDe, resolverClave, bloquesPorClave, todasLasClaves, volumenPrincipal,
  type PlantillaSesion, type NivelPlantilla,
} from './plantillas'
import { VARIANTES } from './plantillas-variantes'
import { ZONAS_RESISTENCIA } from './zonas'

const SIGLAS = ZONAS_RESISTENCIA.map(z => z.sigla)
const NIVEL_IDS = NIVELES.map(n => n.id)

/* Recorre cada variante con su plantilla, para no repetir el doble bucle. */
function cadaVariante(fn: (p: PlantillaSesion, v: ReturnType<typeof variantesDe>[number]) => void) {
  PLANTILLAS.forEach(p => variantesDe(p).forEach(v => fn(p, v)))
}

describe('el catálogo de variantes está bien formado', () => {
  it('toda clave del mapa apunta a una plantilla que existe', () => {
    // Un id mal escrito aquí no rompe nada: la variante simplemente no aparece
    // nunca. Es el fallo silencioso de siempre.
    Object.keys(VARIANTES).forEach(id => {
      expect(plantillaPorId(id), `VARIANTES tiene '${id}' y no hay plantilla con ese id`).toBeDefined()
    })
  })

  it('no hay dos variantes con el mismo id dentro de una plantilla', () => {
    PLANTILLAS.forEach(p => {
      const ids = variantesDe(p).map(v => v.id)
      expect(new Set(ids).size, `ids repetidos en ${p.id}`).toBe(ids.length)
    })
  })

  it('no hay dos claves iguales en todo el catálogo', () => {
    const claves = todasLasClaves()
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('cada variante trae los tres niveles y ninguno vacío', () => {
    cadaVariante((p, v) => {
      NIVEL_IDS.forEach(n => {
        expect(v.principal[n], `${p.id}/${v.id} · ${n}`).toBeDefined()
        expect(v.principal[n].length, `${p.id}/${v.id} · ${n} está vacío`).toBeGreaterThan(0)
      })
    })
  })

  it('todas las zonas existen en el catálogo real', () => {
    cadaVariante((p, v) => {
      NIVEL_IDS.forEach(n => v.principal[n].forEach(b => {
        expect(SIGLAS, `zona '${b.zona}' en ${p.id}/${v.id}`).toContain(b.zona)
      }))
      ;(v.calentamiento || []).concat(v.vuelta || []).forEach(b => {
        expect(SIGLAS, `zona '${b.zona}' en ${p.id}/${v.id}`).toContain(b.zona)
      })
    })
  })

  /* El fallo que esto evita está anotado en propuesta-sesion.ts: un bloque sin
     metros ni segundos se crea igual, pero sin duración. No revienta nada — la
     sesión sale con un bloque que no vale nada y nadie se entera. */
  it('ningún bloque se queda sin volumen', () => {
    cadaVariante((p, v) => {
      NIVEL_IDS.forEach(n => v.principal[n].forEach((b, i) => {
        expect(!!b.metros || !!b.segundos, `${p.id}/${v.id} · ${n} · bloque ${i + 1} sin metros ni segundos`).toBe(true)
      }))
    })
  })

  /* La regla del catálogo: si la estructura la hemos puesto nosotros, se dice.
     Es lo que separa este catálogo de una lista de sesiones inventadas. */
  it('toda variante marcada como propuesta explica qué parte es nuestra', () => {
    cadaVariante((p, v) => {
      if (v.origen === 'propuesta') {
        expect(v.aviso, `${p.id}/${v.id} es propuesta y no tiene aviso`).toBeTruthy()
      }
    })
  })

  it('cada variante cita su fuente', () => {
    cadaVariante((p, v) => {
      expect(v.fuente, `${p.id}/${v.id} sin fuente`).toBeTruthy()
      expect(v.objetivo, `${p.id}/${v.id} sin objetivo`).toBeTruthy()
    })
  })

  /* B1-00e §4 y la cabecera del catálogo: el ciclismo se prescribe por TIEMPO
     porque lib/duracion.ts no lo estima por distancia. Una variante de bici en
     metros produciría una sesión sin duración estimada. */
  it('el ciclismo va por tiempo y la natación por distancia', () => {
    cadaVariante((p, v) => {
      NIVEL_IDS.forEach(n => v.principal[n].forEach(b => {
        if (p.disciplina === 'Ciclismo') {
          expect(b.metros, `${p.id}/${v.id}: el ciclismo no se prescribe en metros`).toBeFalsy()
        }
        if (p.disciplina === 'Natacion') {
          expect(b.segundos, `${p.id}/${v.id}: la natación se prescribe en metros`).toBeFalsy()
        }
      }))
    })
  })
})

describe('resolver una sesión por su clave', () => {
  it('la clave de una base es su id a secas', () => {
    expect(claveDe('cic-aei')).toBe('cic-aei')
    expect(resolverClave('cic-aei')?.plantilla.id).toBe('cic-aei')
    expect(resolverClave('cic-aei')?.variante).toBeUndefined()
  })

  it('la clave de una variante lleva la barra', () => {
    expect(claveDe('cic-aei', 'over-unders')).toBe('cic-aei/over-unders')
    const r = resolverClave('cic-aei/over-unders')
    expect(r?.plantilla.id).toBe('cic-aei')
    expect(r?.variante?.id).toBe('over-unders')
  })

  /* Lo importante de este par: una variante que no existe NO cae a la base.
     Quien escribió la clave creía estar pidiendo otra sesión; devolverle la
     base sin decir nada es darle un dato que miente. */
  it('una plantilla que no existe no resuelve', () => {
    expect(resolverClave('no-existe')).toBeUndefined()
  })

  it('una variante que no existe tampoco resuelve, en vez de caer a la base', () => {
    expect(resolverClave('cic-aei/inventada')).toBeUndefined()
    expect(bloquesPorClave('cic-aei/inventada', 'intermedio')).toBeUndefined()
  })

  it('todas las claves del catálogo resuelven y dan bloques', () => {
    todasLasClaves().forEach(clave => {
      expect(resolverClave(clave), clave).toBeDefined()
      NIVEL_IDS.forEach(n => {
        const bloques = bloquesPorClave(clave, n)
        expect(bloques?.length, `${clave} · ${n}`).toBeGreaterThan(0)
      })
    })
  })
})

describe('las variantes no cambian el comportamiento de antes', () => {
  /* Los tres consumidores actuales llaman bloquesDe(p, nivel) sin variante.
     Este test es el que garantiza que ampliar la firma no les tocó nada. */
  it('sin varianteId sigue devolviendo calentamiento + principal + vuelta', () => {
    PLANTILLAS.forEach(p => NIVEL_IDS.forEach(n => {
      expect(bloquesDe(p, n)).toEqual([...p.calentamiento, ...p.principal[n], ...p.vuelta])
    }))
  })

  it('una variante inexistente en bloquesDe cae a la base, que es lo seguro aquí', () => {
    // Ojo a la asimetría con resolverClave, y es a propósito: resolverClave
    // valida una clave (puede fallar), bloquesDe ya tiene la plantilla en la
    // mano y devolver una sesión vacía sería peor que devolver la base.
    const p = plantillaPorId('cic-aei')!
    expect(bloquesDe(p, 'intermedio', 'inventada')).toEqual(bloquesDe(p, 'intermedio'))
  })

  it('volumenPrincipal sigue midiendo la base cuando no se pide variante', () => {
    const p = plantillaPorId('nat-aei')!
    expect(volumenPrincipal(p, 'intermedio')).toBe('1 km')          // 10 × 100m
    expect(volumenPrincipal(p, 'intermedio', 'largas')).toBe('1.5 km') // 5 × 300m
  })
})

describe('las opciones que ve el entrenador', () => {
  it('la base va siempre la primera', () => {
    const op = opcionesDe(plantillaPorId('cic-pae')!)
    expect(op[0].esBase).toBe(true)
    expect(op[0].clave).toBe('cic-pae')
    expect(op.slice(1).every(o => !o.esBase)).toBe(true)
  })

  it('una plantilla sin variantes devuelve solo su base', () => {
    const op = opcionesDe(plantillaPorId('car-pala')!)
    expect(op).toHaveLength(1)
    expect(op[0].esBase).toBe(true)
  })

  it('filtrar por disciplina no mezcla deportes', () => {
    expect(todasLasClaves('Natacion').every(c => c.startsWith('nat-'))).toBe(true)
    expect(todasLasClaves('Ciclismo').every(c => c.startsWith('cic-'))).toBe(true)
    expect(todasLasClaves('Carrera').every(c => c.startsWith('car-'))).toBe(true)
  })
})

describe('cuánta variedad hay de verdad', () => {
  /* El número que importa no es «cuántas plantillas hay» sino cuántas sesiones
     distintas puede ver un atleta. Si este test baja, hemos perdido variedad. */
  it('el catálogo pasa de 28 sesiones a más del doble', () => {
    expect(PLANTILLAS.length).toBe(28)
    expect(todasLasClaves().length).toBeGreaterThan(56)
  })

  it('las zonas donde se pasa el tiempo tienen alternativas en las tres disciplinas', () => {
    // AEL/AEM/AEI/PAE son el 90 % del volumen de un plan. Ahí es donde la
    // monotonía muerde, y por eso son las que no pueden quedarse con una sola.
    ;['cic-ael', 'cic-aem', 'cic-aei', 'cic-pae',
      'nat-ael', 'nat-aem', 'nat-aei', 'nat-pae',
      'car-aem', 'car-aei', 'car-pae'].forEach(id => {
      expect(variantesDe(plantillaPorId(id)!).length, `${id} se quedó sin variantes`).toBeGreaterThan(0)
    })
  })
})
