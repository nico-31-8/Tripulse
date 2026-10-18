import { describe, it, expect } from 'vitest'
import { semanaDelBloque, textoCompeticion, type BaseBloque, type CompeticionDelPlan } from './plan-bloque'
import { semanasDelMesociclo } from './plan-mesociclo'
import type { SemanaRellena } from './plan-relleno'

/* EL CASO REAL (2026-10-18). Deportista 20: en su ficha, Carrera y Fuerza. Su
   bloque es el mesociclo 122 —«General», 6 semanas desde el 19-10— y compite
   el domingo 22-11 en «Novo Mesoiro» (prioridad B, tipo vacío). «Mi plan» lo
   generó con lo que usa cuando no lee la anamnesis: 8 h, 5 días, olímpico.
   Salieron natación y ciclismo todas las semanas, y una carrera larga de 90′
   el mismo día de la competición. */
const BLOQUE = semanasDelMesociclo({
  tipo: 'General', semanas: 6, horasReferencia: 8, distancia: 'olimpico', lunes: '2026-10-19',
})
const BASE: BaseBloque = {
  diasSemana: 5, distancia: 'olimpico', nivel: 'intermedio', disciplinaDebil: null,
  disciplinas: ['Carrera', 'Fuerza'],
}
const NOVO_MESOIRO: CompeticionDelPlan = { fecha: '2026-11-22', nombre: 'Novo Mesoiro', prioridad: 'B' }
const semana = (lunes: string) => BLOQUE.find(s => s.lunes === lunes)!
const minutos = (r: SemanaRellena) => r.relleno.reduce((a, x) => a + x.minutos, 0)
const dias = (r: SemanaRellena) => new Set(r.relleno.map(x => x.dia))

describe('las disciplinas del deportista', () => {
  it('quien solo hace Carrera y Fuerza no recibe natación ni ciclismo en ninguna semana del bloque', () => {
    BLOQUE.forEach(s => {
      const r = semanaDelBloque(s, BASE, { disponibilidad: [], competiciones: [NOVO_MESOIRO] })
      const ajenas = r.relleno.filter(x => x.hueco.bloque !== 'Carrera' && x.hueco.bloque !== 'Fuerza')
      expect(ajenas.map(x => x.dia + ' ' + x.hueco.bloque), 'semana del ' + s.lunes).toEqual([])
      expect(r.relleno.length, 'semana del ' + s.lunes).toBeGreaterThan(0)
    })
  })

  /* El volumen que declaró es SUYO: si no nada ni pedalea, esas horas no
     desaparecen, van a lo que sí hace. */
  it('y el volumen no se pierde: la carrera se queda con lo que era de los otros dos', () => {
    const s = semana('2026-10-26')
    const r = semanaDelBloque(s, BASE, { disponibilidad: [] })
    const triatlon = semanaDelBloque(s, { ...BASE, disciplinas: null }, { disponibilidad: [] })
    const carrera = (x: SemanaRellena) => x.relleno.filter(y => y.hueco.bloque === 'Carrera').reduce((a, y) => a + y.minutos, 0)
    expect(carrera(r)).toBeGreaterThan(carrera(triatlon) * 2)
    expect(minutos(r)).toBeGreaterThan(s.horasSemana * 60 * 0.8)
  })

  it('sin disciplinas marcadas (null) es el triatlón de siempre', () => {
    const r = semanaDelBloque(semana('2026-10-26'), { ...BASE, disciplinas: null }, { disponibilidad: [] })
    const bloques = new Set(r.relleno.map(x => x.hueco.bloque))
    expect(bloques.has('Natacion')).toBe(true)
    expect(bloques.has('Ciclismo')).toBe(true)
  })
})

describe('los días de competición', () => {
  it('el día de la competición no lleva ninguna sesión', () => {
    const r = semanaDelBloque(semana('2026-11-16'), BASE, { disponibilidad: [], competiciones: [NOVO_MESOIRO] })
    expect(r.relleno.filter(x => x.dia === 'Domingo').map(x => x.nombre)).toEqual([])
  })

  /* B1-02: una carrera B pide 5–7 días de reducción. Lo mínimo de eso es no
     llegar a la salida con la tirada larga o las series del día anterior. */
  it('con prioridad B tampoco la víspera', () => {
    const r = semanaDelBloque(semana('2026-11-16'), BASE, { disponibilidad: [], competiciones: [NOVO_MESOIRO] })
    expect(r.relleno.filter(x => x.dia === 'Sábado').map(x => x.nombre)).toEqual([])
  })

  it('con prioridad A, igual', () => {
    const r = semanaDelBloque(semana('2026-11-16'), BASE,
      { disponibilidad: [], competiciones: [{ ...NOVO_MESOIRO, prioridad: 'A' }] })
    expect([...dias(r)].filter(d => d === 'Sábado' || d === 'Domingo')).toEqual([])
  })

  /* B1-02: una C «se corre como un entrenamiento más; la carga no se toca».
     El día de la carrera sigue siendo la carrera, pero la víspera se entrena. */
  it('con prioridad C se libra solo el día de la carrera', () => {
    const r = semanaDelBloque(semana('2026-11-16'), BASE,
      { disponibilidad: [], competiciones: [{ ...NOVO_MESOIRO, prioridad: 'C' }] })
    expect(dias(r).has('Domingo')).toBe(false)
    expect(dias(r).has('Sábado')).toBe(true)
  })

  it('sin prioridad cuenta como B, que es el defecto de la app', () => {
    const r = semanaDelBloque(semana('2026-11-16'), BASE,
      { disponibilidad: [], competiciones: [{ fecha: '2026-11-22', nombre: 'Novo Mesoiro', prioridad: null }] })
    expect([...dias(r)].filter(d => d === 'Sábado' || d === 'Domingo')).toEqual([])
  })

  /* Lo que tocaba esos días se quita, no se mete en los demás: con cinco días
     de los que se van dos, quedaban tres días con la semana entera encima. */
  it('lo que tocaba esos días no se amontona en los que quedan', () => {
    const s = semana('2026-11-16')
    const con = semanaDelBloque(s, BASE, { disponibilidad: [], competiciones: [NOVO_MESOIRO] })
    const sin = semanaDelBloque(s, BASE, { disponibilidad: [] })
    expect(minutos(con)).toBeLessThan(minutos(sin) * 0.75)
    const porDia = new Map<string, number>()
    con.relleno.forEach(x => porDia.set(x.dia, (porDia.get(x.dia) || 0) + x.minutos))
    expect(Math.max(...porDia.values())).toBeLessThanOrEqual(Math.max(...sin.relleno.map(x => x.minutos)) * 1.5)
  })

  it('una carrera en lunes se lleva el domingo de la semana anterior', () => {
    const base6 = { ...BASE, diasSemana: 6 }   // con seis días, el lunes se entrena
    const lunes: CompeticionDelPlan = { fecha: '2026-11-23', nombre: 'Lunes de carrera', prioridad: 'B' }
    const antes = semanaDelBloque(semana('2026-11-16'), base6, { disponibilidad: [], competiciones: [lunes] })
    const despues = semanaDelBloque(semana('2026-11-23'), base6, { disponibilidad: [], competiciones: [lunes] })
    expect(dias(antes).has('Domingo')).toBe(false)
    expect(dias(despues).has('Lunes')).toBe(false)
  })

  it('con su disponibilidad real, también', () => {
    const disponibilidad = [
      { dia: 'Martes' as const, minutos: 60 }, { dia: 'Jueves' as const, minutos: 60 },
      { dia: 'Sábado' as const, minutos: 120 }, { dia: 'Domingo' as const, minutos: 120 },
    ]
    const r = semanaDelBloque(semana('2026-11-16'), BASE, { disponibilidad, competiciones: [NOVO_MESOIRO] })
    expect([...dias(r)].filter(d => d === 'Sábado' || d === 'Domingo')).toEqual([])
    expect(r.relleno.length).toBeGreaterThan(0)
  })

  it('y lo cuenta en una línea: qué días se libran y cómo queda la semana', () => {
    const r = semanaDelBloque(semana('2026-11-16'), BASE, { disponibilidad: [], competiciones: [NOVO_MESOIRO] })
    expect(textoCompeticion(r.competicion)).toBe('sáb 21 y dom 22 sin sesión por «Novo Mesoiro» · 8,5 → 5 h')
    expect(textoCompeticion(semanaDelBloque(semana('2026-10-26'), BASE, { disponibilidad: [] }).competicion)).toBe('')
  })

  it('una semana sin competiciones sale igual que si no se le pasara ninguna', () => {
    const s = semana('2026-10-26')
    expect(semanaDelBloque(s, BASE, { disponibilidad: [], competiciones: [NOVO_MESOIRO] }))
      .toEqual(semanaDelBloque(s, BASE, { disponibilidad: [] }))
  })
})
