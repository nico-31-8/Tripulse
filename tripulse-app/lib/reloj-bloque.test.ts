import { describe, it, expect } from 'vitest'
import { faseDeBloque, tieneReloj } from './reloj-bloque'
import { CONFIG_INICIAL, type ConfigBloque } from './bloque-formato'

const cfg = (o: Partial<ConfigBloque> = {}): ConfigBloque => ({ ...CONFIG_INICIAL, ...o })
const min = (n: number) => n * 60_000
const seg = (n: number) => n * 1000

describe('AMRAP', () => {
  const c = cfg({ minutos: 12 })

  it('cuenta hacia atrás desde los minutos que se pusieron', () => {
    expect(faseDeBloque('amrap', c, 0).ms).toBe(min(12))
    expect(faseDeBloque('amrap', c, min(1)).ms).toBe(min(11))
    expect(faseDeBloque('amrap', c, min(11) + seg(30)).ms).toBe(seg(30))
  })

  it('al llegar a cero se acaba, y no se pasa de rosca', () => {
    expect(faseDeBloque('amrap', c, min(12)).terminado).toBe(true)
    expect(faseDeBloque('amrap', c, min(12)).ms).toBe(0)
    /* Pasado el final no cuenta en negativo: un reloj que enseña -0:14 a pie de
       pista es un reloj roto. */
    expect(faseDeBloque('amrap', c, min(20)).ms).toBe(0)
  })

  it('es un solo tramo: no pita por el medio', () => {
    expect(faseDeBloque('amrap', c, min(3)).tramo).toBe(1)
    expect(faseDeBloque('amrap', c, min(9)).tramo).toBe(1)
  })
})

describe('EMOM', () => {
  const c = cfg({ minutos: 10, cada: 60 })

  it('cada minuto es un tramo, y cuenta lo que queda de ESE minuto', () => {
    expect(faseDeBloque('emom', c, 0).ms).toBe(min(1))
    expect(faseDeBloque('emom', c, seg(45)).ms).toBe(seg(15))
    expect(faseDeBloque('emom', c, min(1)).ms).toBe(min(1))
  })

  /* El número de tramo es lo único que hace sonar el pitido: si no subiera en el
     segundo exacto, el EMOM se cantaría tarde. */
  it('el tramo sube justo al cambiar de minuto', () => {
    expect(faseDeBloque('emom', c, seg(59.9)).tramo).toBe(1)
    expect(faseDeBloque('emom', c, min(1)).tramo).toBe(2)
    expect(faseDeBloque('emom', c, min(9)).tramo).toBe(10)
  })

  it('dice en qué minuto va de cuántos', () => {
    expect(faseDeBloque('emom', c, min(2) + seg(10)).etiqueta).toBe('Minuto 3 de 10')
  })

  /* Un «cada 90 segundos» no son minutos: cantarlo como «minuto 3» sería mentir
     en voz alta delante del atleta. */
  it('con otro intervalo no lo llama minuto', () => {
    const c90 = cfg({ minutos: 9, cada: 90 })
    expect(faseDeBloque('emom', c90, 0).etiqueta).toBe('Tramo 1 de 6')
    expect(faseDeBloque('emom', c90, seg(90)).tramo).toBe(2)
  })

  it('al acabar el último tramo, terminado', () => {
    expect(faseDeBloque('emom', c, min(10)).terminado).toBe(true)
    expect(faseDeBloque('emom', c, min(10)).ms).toBe(0)
    expect(faseDeBloque('emom', c, min(9) + seg(59)).terminado).toBe(false)
  })
})

describe('Tabata', () => {
  const c = cfg({ trabajo: 20, pausa: 10, vueltas: 8 })

  it('alterna trabajo y pausa con sus tiempos', () => {
    expect(faseDeBloque('tabata', c, 0).tipo).toBe('trabajo')
    expect(faseDeBloque('tabata', c, 0).ms).toBe(seg(20))
    expect(faseDeBloque('tabata', c, seg(19)).tipo).toBe('trabajo')
    expect(faseDeBloque('tabata', c, seg(20)).tipo).toBe('pausa')
    expect(faseDeBloque('tabata', c, seg(20)).ms).toBe(seg(10))
    expect(faseDeBloque('tabata', c, seg(30)).tipo).toBe('trabajo')
  })

  /* Dos tramos por vuelta: la pantalla tiene que pitar también al empezar a
     descansar, que es la mitad de un Tabata. */
  it('el tramo sube en cada cambio, no solo en cada vuelta', () => {
    expect(faseDeBloque('tabata', c, seg(10)).tramo).toBe(1)
    expect(faseDeBloque('tabata', c, seg(20)).tramo).toBe(2)
    expect(faseDeBloque('tabata', c, seg(30)).tramo).toBe(3)
    expect(faseDeBloque('tabata', c, seg(50)).tramo).toBe(4)
  })

  it('dice por qué vuelta va', () => {
    expect(faseDeBloque('tabata', c, seg(5)).etiqueta).toBe('Trabajo 1/8')
    expect(faseDeBloque('tabata', c, seg(25)).etiqueta).toBe('Descanso 1/8')
    expect(faseDeBloque('tabata', c, seg(60)).etiqueta).toBe('Trabajo 3/8')
  })

  it('a las ocho vueltas se acaba', () => {
    expect(faseDeBloque('tabata', c, seg(30 * 8) - 1).terminado).toBe(false)
    expect(faseDeBloque('tabata', c, seg(30 * 8)).terminado).toBe(true)
    expect(faseDeBloque('tabata', c, seg(600)).ms).toBe(0)
  })

  /* Las vueltas son POR LÍNEA: un 20/10 × 8 con tres ejercicios son 24 vueltas.
     Sin esto, el reloj se paraba a un tercio del bloque. */
  it('con varias líneas, las vueltas se multiplican', () => {
    expect(faseDeBloque('tabata', c, 0, 3).etiqueta).toBe('Trabajo 1/24')
    expect(faseDeBloque('tabata', c, seg(30 * 8), 3).terminado).toBe(false)
    expect(faseDeBloque('tabata', c, seg(30 * 24), 3).terminado).toBe(true)
  })

  it('sin pausa no se rompe: todo es trabajo', () => {
    const sinPausa = cfg({ trabajo: 30, pausa: 0, vueltas: 4 })
    expect(faseDeBloque('tabata', sinPausa, seg(35)).tipo).toBe('trabajo')
    expect(faseDeBloque('tabata', sinPausa, seg(120)).terminado).toBe(true)
  })
})

describe('For time', () => {
  it('sin límite cuenta hacia arriba: es «lo que tardes»', () => {
    const f = faseDeBloque('fortime', cfg({ limite: 0 }), min(4))
    expect(f.tipo).toBe('libre')
    expect(f.atras).toBe(false)
    expect(f.ms).toBe(min(4))
    expect(f.terminado).toBe(false)
  })

  it('con límite cuenta hacia atrás y avisa al llegar', () => {
    const c = cfg({ limite: 10 })
    expect(faseDeBloque('fortime', c, min(3)).ms).toBe(min(7))
    expect(faseDeBloque('fortime', c, min(10)).terminado).toBe(true)
  })
})

describe('Rondas', () => {
  /* Lo que dura una ronda es «lo que tardes», y el descanso lo arranca el
     entrenador cuando la ronda acaba: no hay nada automático que cronometrar. */
  it('van libres, contando hacia arriba', () => {
    const f = faseDeBloque('rondas', cfg(), min(7))
    expect(f.tipo).toBe('libre')
    expect(f.ms).toBe(min(7))
    expect(f.tramos).toBe(0)
  })
})

describe('tieneReloj', () => {
  it('los que se cronometran solos', () => {
    expect(tieneReloj('amrap', cfg())).toBe(true)
    expect(tieneReloj('emom', cfg())).toBe(true)
    expect(tieneReloj('tabata', cfg())).toBe(true)
  })
  it('el for time solo si tiene cap', () => {
    expect(tieneReloj('fortime', cfg({ limite: 10 }))).toBe(true)
    expect(tieneReloj('fortime', cfg({ limite: 0 }))).toBe(false)
  })
  it('las rondas no', () => {
    expect(tieneReloj('rondas', cfg())).toBe(false)
    expect(tieneReloj(null, cfg())).toBe(false)
  })
})

describe('lo que no puede pasar nunca', () => {
  /* Un reloj a pie de pista con un NaN o un número negativo es peor que no
     tenerlo: el entrenador deja de mirarlo y ya no vuelve. */
  it('ni NaN ni negativos, con la configuración que sea', () => {
    const absurdas = [
      cfg({ minutos: 0 }), cfg({ cada: 0 }), cfg({ trabajo: 0, pausa: 0 }),
      cfg({ vueltas: 0 }), cfg({ limite: 0 }),
      { ...CONFIG_INICIAL, minutos: NaN as unknown as number },
    ]
    for (const c of absurdas) {
      for (const f of ['amrap', 'emom', 'tabata', 'fortime', 'rondas'] as const) {
        for (const t of [-5000, 0, 1, seg(37), min(90)]) {
          const r = faseDeBloque(f, c, t)
          expect(Number.isFinite(r.ms), f + ' ' + t).toBe(true)
          expect(r.ms, f + ' ' + t).toBeGreaterThanOrEqual(0)
          expect(r.tramo).toBeGreaterThanOrEqual(1)
          expect(r.etiqueta).not.toMatch(/NaN|undefined/)
        }
      }
    }
  })
})
