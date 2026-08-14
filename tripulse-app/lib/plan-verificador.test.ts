import { describe, it, expect } from 'vitest'
import {
  verificarSemana, deRelleno, resumenVeredicto, textoParaElModelo,
  type SesionAVerificar, type ContextoVerificacion,
} from './plan-verificador'
import { formaDeSemana, type EntradaSemana } from './plan-semana'
import { colocarSemana } from './plan-colocacion'
import { rellenarSemana } from './plan-relleno'

const entrada = (p: Partial<EntradaSemana> = {}): EntradaSemana => ({
  horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio', ...p,
})

/** La semana que generan las reglas, en forma verificable. */
function semanaDeLasReglas(p: Partial<EntradaSemana> = {}) {
  const e = entrada(p)
  const forma = formaDeSemana(e)
  const s = rellenarSemana({ forma, colocada: colocarSemana(forma, e.diasSemana), nivel: e.nivel, fase: e.fase })
  return { sesiones: s.relleno.map(deRelleno), ctx: { entrada: e, forma, dias: e.diasSemana } as ContextoVerificacion }
}

describe('la semana que generan las reglas pasa su propio examen', () => {
  /* LA PRUEBA QUE DE VERDAD IMPORTA. Las reglas estaban escritas como generador y
     esto las usa como juez: si el juez rechazara lo que el generador produce, uno
     de los dos estaria mal y no sabriamos cual. Que coincidan es lo que permite
     confiar en el juez para valorar una semana que venga de fuera. */
  it('sin un solo error, en toda combinacion de distancia, fase, nivel y dias', () => {
    ;(['sprint', 'olimpico', 'medio', 'largo'] as const).forEach(distancia =>
      (['pg-inicial', 'pg-avanzada', 'pe-inicial', 'pe-avanzada', 'tapering'] as const).forEach(fase =>
        [4, 5, 6, 7].forEach(dias => {
          const { sesiones, ctx } = semanaDeLasReglas({ distancia, fase, diasSemana: dias, horasSemana: 12 })
          const v = verificarSemana(sesiones, ctx)
          const errores = v.incumplimientos.filter(x => x.gravedad === 'error')
          expect(errores.map(e => e.texto), `${distancia}/${fase}/${dias} días`).toEqual([])
          expect(v.vale).toBe(true)
        })))
  })

  it('con la disponibilidad real tampoco se sale de los días que tiene', () => {
    const e = entrada({ diasSemana: 3 })
    const forma = formaDeSemana(e)
    const dias = [
      { dia: 'Martes' as const, minutos: null },
      { dia: 'Jueves' as const, minutos: null },
      { dia: 'Sábado' as const, minutos: null },
    ]
    const s = rellenarSemana({ forma, colocada: colocarSemana(forma, dias), nivel: e.nivel, fase: e.fase })
    const v = verificarSemana(s.relleno.map(deRelleno), { entrada: e, forma, dias })
    expect(v.incumplimientos.filter(x => x.gravedad === 'error')).toEqual([])
  })
})

describe('lo que el juez tiene que cazar', () => {
  const base = (): SesionAVerificar[] => semanaDeLasReglas().sesiones
  const ctx = () => semanaDeLasReglas().ctx
  const errores = (s: SesionAVerificar[], c = ctx()) =>
    verificarSemana(s, c).incumplimientos.filter(x => x.gravedad === 'error').map(x => x.regla)

  it('una sesion que no existe en el catalogo', () => {
    const s = base()
    s[0] = { ...s[0], clave: 'inventada-del-todo' }
    expect(errores(s)).toContain('sesion-inexistente')
  })

  it('una clave de otro deporte', () => {
    const s = base()
    const i = s.findIndex(x => x.bloque === 'Carrera' && x.clave)
    s[i] = { ...s[i], clave: 'cic-ael' }
    expect(errores(s)).toContain('disciplina-cruzada')
  })

  it('la zona declarada que no es la de la plantilla', () => {
    const s = base()
    const i = s.findIndex(x => x.clave)
    s[i] = { ...s[i], zona: 'PLA' }
    expect(errores(s)).toContain('zona-cruzada')
  })

  /* La regla mas importante del microciclo. Es la que un modelo se salta primero,
     porque sobre el papel meter calidad siempre parece que suma. */
  it('dos dias duros seguidos', () => {
    const s = base().map(x => ({ ...x, calidad: false }))
    s[0] = { ...s[0], dia: 'Martes', calidad: true }
    s[1] = { ...s[1], dia: 'Miércoles', calidad: true }
    expect(errores(s)).toContain('duro-facil')
  })

  it('dos calidades el mismo dia', () => {
    const s = base().map(x => ({ ...x, calidad: false, dia: 'Martes' as const }))
    s[0] = { ...s[0], calidad: true }
    s[1] = { ...s[1], calidad: true }
    expect(errores(s)).toContain('dos-calidades-mismo-dia')
  })

  it('una disciplina con una sola sesion', () => {
    const s = base().filter(x => x.bloque !== 'Natacion')
    s.push({ ...base().find(x => x.bloque === 'Natacion')! })
    expect(errores(s)).toContain('minimo-sesiones')
  })

  it('el reparto entre deportes fuera del rango de la prueba', () => {
    // Todo el volumen a natacion: en un 70.3 le tocan 15-20 %.
    const s = base().map(x => ({ ...x, bloque: 'Natacion' as const, clave: 'nat-ael', zona: 'AEL', claveFuerza: undefined }))
    expect(errores(s)).toContain('reparto-fuera-de-rango')
  })

  it('el doble del volumen que el atleta maneja', () => {
    const s = base().map(x => ({ ...x, minutos: x.minutos * 2 }))
    expect(errores(s)).toContain('volumen-fuera')
  })

  it('un dia en el que no entrena', () => {
    const dias = [{ dia: 'Martes' as const, minutos: null }, { dia: 'Jueves' as const, minutos: null }]
    const s = base()
    expect(errores(s, { entrada: entrada(), dias })).toContain('dia-no-disponible')
  })

  it('mas minutos de los que tiene ese dia', () => {
    const dias = [{ dia: 'Martes' as const, minutos: 30 }]
    const s = base().map(x => ({ ...x, dia: 'Martes' as const }))
    expect(errores(s, { entrada: entrada(), dias })).toContain('sin-tiempo')
  })

  it('una semana vacia', () => {
    const v = verificarSemana([], ctx())
    expect(v.vale).toBe(false)
    expect(v.incumplimientos[0].regla).toBe('vacia')
  })
})

describe('lo que avisa pero no bloquea', () => {
  /* Un entrenador puede estar haciendo esto a proposito: la larga en miercoles
     porque el atleta compite el domingo. Confundir avisos con errores convierte al
     juez en un cascarrabias al que se deja de escuchar. */
  const avisos = (s: SesionAVerificar[], c: ContextoVerificacion) =>
    verificarSemana(s, c).incumplimientos.filter(x => x.gravedad === 'aviso').map(x => x.regla)

  it('la larga fuera del fin de semana avisa, no bloquea', () => {
    const { sesiones, ctx } = semanaDeLasReglas()
    const s = sesiones.map(x => x.larga ? { ...x, dia: 'Miércoles' as const } : x)
    const v = verificarSemana(s, ctx)
    expect(avisos(s, ctx)).toContain('larga-fuera-del-finde')
    expect(v.vale, 'esto no puede invalidar la semana').toBe(true)
  })

  it('una semana sin calidad es una descarga, y se dice', () => {
    const { sesiones, ctx } = semanaDeLasReglas()
    const s = sesiones.map(x => ({ ...x, calidad: false }))
    expect(avisos(s, ctx)).toContain('sin-calidad')
    expect(verificarSemana(s, ctx).vale).toBe(true)
  })

  it('una recuperacion de mas de una hora', () => {
    const { sesiones, ctx } = semanaDeLasReglas()
    const s = [...sesiones]
    const i = s.findIndex(x => x.zona === 'AER')
    if (i >= 0) {
      s[i] = { ...s[i], minutos: 95 }
      expect(avisos(s, ctx)).toContain('recuperacion-larga')
    }
  })

  /* El fallo que se colaba antes de tener juez: 96 minutos de potencia
     neuromuscular como sesion de calidad de un 70.3. */
  it('una sesion anaerobica larguisima', () => {
    const { sesiones, ctx } = semanaDeLasReglas()
    const s = [...sesiones]
    s[0] = { ...s[0], bloque: 'Ciclismo', clave: 'cic-pla', zona: 'PLA', minutos: 96, calidad: true, claveFuerza: undefined }
    expect(avisos(s, ctx)).toContain('anaerobica-larga')
  })

  it('bici y carrera el mismo dia sin ser brick', () => {
    const { sesiones, ctx } = semanaDeLasReglas()
    const s = sesiones.map(x => x.bloque === 'Ciclismo' || x.bloque === 'Carrera' ? { ...x, dia: 'Martes' as const, brick: false } : x)
    expect(avisos(s, ctx)).toContain('bici-carrera-suelto')
  })
})

describe('el parte que se le devuelve al modelo', () => {
  it('separa lo que hay que arreglar de lo que solo es mejorable', () => {
    // Si se le da todo revuelto se pone a arreglar la larga del miercoles y deja
    // los dos dias duros seguidos, que es lo unico que invalida la semana.
    const txt = textoParaElModelo([
      { regla: 'a', gravedad: 'error', texto: 'Dos duros seguidos', fuente: 'B1-04 P1' },
      { regla: 'b', gravedad: 'aviso', texto: 'Larga en miércoles', fuente: 'B1-04 P2' },
    ])
    expect(txt.indexOf('HAY QUE ARREGLAR')).toBeLessThan(txt.indexOf('mejorable'))
    expect(txt).toContain('B1-04 P1')
  })

  it('cuando todo cumple, lo dice y no inventa trabajo', () => {
    expect(textoParaElModelo([])).toMatch(/cumple todas las reglas/i)
    const { sesiones, ctx } = semanaDeLasReglas()
    expect(verificarSemana(sesiones, ctx).paraElModelo).not.toMatch(/HAY QUE ARREGLAR/)
  })

  it('cada incumplimiento cita su fuente', () => {
    const s = semanaDeLasReglas().sesiones.map(x => ({ ...x, calidad: true }))
    verificarSemana(s, semanaDeLasReglas().ctx).incumplimientos.forEach(x => {
      expect(x.fuente, x.regla).toBeTruthy()
      expect(x.texto, x.regla).toBeTruthy()
    })
  })

  it('el resumen distingue valida de invalida', () => {
    const { sesiones, ctx } = semanaDeLasReglas()
    expect(resumenVeredicto(verificarSemana(sesiones, ctx))).toMatch(/cumple|aviso/i)
    const roto = sesiones.map((x, i) => i === 0 ? { ...x, clave: 'no-existe' } : x)
    expect(resumenVeredicto(verificarSemana(roto, ctx))).toMatch(/error/i)
  })
})
