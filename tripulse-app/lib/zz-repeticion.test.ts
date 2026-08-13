import { describe, it } from 'vitest'
import { formaDeSemana } from './plan-semana'
import { PLANTILLAS, opcionesDe, plantillasDe } from './plantillas'
import type { Disciplina } from './distribucion-zonas'

/* Cuantas veces repetiria un atleta cada sesion en un bloque de 12 semanas, si
   el planificador reparte el volumen como dice la tabla de zonas. */
describe('repeticion real', () => {
  it('cuenta', () => {
    const SEMANAS = 12
    const e = { horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio' } as any
    const f = formaDeSemana(e)
    console.log('\n' + f.resumen + '\n')
    console.log('ZONA   DISC       min/sem  ses/12sem  opciones  repeticiones')

    const filas: { disc: string; zona: string; ses: number; op: number; rep: number }[] = []
    ;(['Natacion', 'Ciclismo', 'Carrera'] as Disciplina[]).forEach(d => {
      const bloque = f.bloques.find(b => b.bloque === d)!
      if (!bloque.minutos) return
      f.zonas[d].forEach(franja => {
        const pct = (franja.min + franja.max) / 2
        const minSem = bloque.minutos * pct / 100
        const ses = (minSem / bloque.minutosPorSesion) * SEMANAS
        if (ses < 1) return
        // Opciones del catalogo para esa(s) zona(s) en esa disciplina
        const op = plantillasDe(d)
          .filter(p => franja.siglas.includes(p.zona))
          .reduce((a, p) => a + opcionesDe(p).length, 0)
        filas.push({ disc: d, zona: franja.siglas.join('+'), ses, op, rep: op ? ses / op : Infinity })
      })
    })
    filas.sort((a, b) => b.rep - a.rep).forEach(x => {
      console.log(
        x.zona.padEnd(20) + x.disc.padEnd(11) +
        (x.ses / SEMANAS * (f.bloques.find(b => b.bloque === x.disc)!.minutosPorSesion)).toFixed(0).padStart(6) +
        x.ses.toFixed(1).padStart(11) + String(x.op).padStart(10) + x.rep.toFixed(1).padStart(14))
    })
    console.log('\nTOTAL claves del catalogo: ' + PLANTILLAS.reduce((a, p) => a + opcionesDe(p).length, 0))
  })
})
