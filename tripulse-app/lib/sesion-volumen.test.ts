import { describe, it, expect } from 'vitest'
import { conVolumen } from './sesion-volumen'

const TESTS = { vam: 18, css: 1.25, ftp: 260 }
const ses = (id: number, extra: any = {}) => ({ id, fecha_sesion: '2026-08-19', disciplina: 'Carrera', ...extra })

describe('el volumen de una sesión', () => {
  /* EL CRITERIO QUE TIENE QUE COINCIDIR CON EL EDITOR: el total es
     valor × series. Si aquí se contara el valor por serie, el calendario diría
     100 m donde la tabla dice 800, y las dos pantallas hablarían de la misma
     sesión con números distintos. */
  it('multiplica por las series', () => {
    const r = conVolumen(
      [ses(1)],
      [{ id: 10, id_sesion: 1, series: 8, zona_entrenamiento: 'AEM', disciplina: 'Natacion' }],
      [{ id_tarea: 10, metros_planeados: 100 }], [], [], TESTS)
    expect(r[0].metros_total).toBe(800)
  })

  it('suma los segundos igual', () => {
    const r = conVolumen(
      [ses(1)],
      [{ id: 10, id_sesion: 1, series: 5, zona_entrenamiento: 'PAE', disciplina: 'Ciclismo' }],
      [], [{ id_tarea: 10, tiempo_planeado: 300 }], [], TESTS)
    expect(r[0].seg_total).toBe(1500)
  })

  it('sin series cuenta una', () => {
    const r = conVolumen(
      [ses(1)],
      [{ id: 10, id_sesion: 1, series: null, zona_entrenamiento: 'AEL', disciplina: 'Carrera' }],
      [{ id_tarea: 10, metros_planeados: 5000 }], [], [], TESTS)
    expect(r[0].metros_total).toBe(5000)
  })

  it('suma todas las tareas de la sesión', () => {
    const r = conVolumen(
      [ses(1)],
      [
        { id: 10, id_sesion: 1, series: 1, zona_entrenamiento: 'AER', disciplina: 'Natacion' },
        { id: 11, id_sesion: 1, series: 4, zona_entrenamiento: 'AEM', disciplina: 'Natacion' },
      ],
      [{ id_tarea: 10, metros_planeados: 400 }, { id_tarea: 11, metros_planeados: 100 }],
      [], [], TESTS)
    expect(r[0].metros_total).toBe(800)
  })

  /* Cada sesión con LO SUYO. Si el agrupado fallara, una sesión se llevaría las
     tareas de otra y el calendario pintaría volúmenes cruzados. */
  it('no mezcla las tareas de dos sesiones', () => {
    const r = conVolumen(
      [ses(1), ses(2)],
      [
        { id: 10, id_sesion: 1, series: 1, zona_entrenamiento: 'AEL', disciplina: 'Carrera' },
        { id: 20, id_sesion: 2, series: 1, zona_entrenamiento: 'AEL', disciplina: 'Carrera' },
      ],
      [{ id_tarea: 10, metros_planeados: 5000 }, { id_tarea: 20, metros_planeados: 12000 }],
      [], [], TESTS)
    expect(r[0].metros_total).toBe(5000)
    expect(r[1].metros_total).toBe(12000)
  })

  it('una sesión sin tareas queda a cero, no a NaN', () => {
    const r = conVolumen([ses(1)], [], [], [], [], TESTS)
    expect(r[0].metros_total).toBe(0)
    expect(r[0].seg_total).toBe(0)
    expect(r[0].zonas).toEqual([])
  })

  it('con las listas a null tampoco revienta', () => {
    const r = conVolumen([ses(1)], null, null, null, null, TESTS)
    expect(r[0].metros_total).toBe(0)
  })

  it('conserva lo que ya traía la sesión', () => {
    const r = conVolumen([ses(1, { estado: 'Realizada', nota: 'x' })], [], [], [], [], TESTS)
    expect(r[0].estado).toBe('Realizada')
    expect(r[0].nota).toBe('x')
  })
})

describe('las zonas de la sesión', () => {
  const conZonas = (zonas: string[]) => conVolumen(
    [ses(1)],
    zonas.map((z, i) => ({ id: 10 + i, id_sesion: 1, series: 1, zona_entrenamiento: z, disciplina: 'Carrera' })),
    [], [], [], TESTS)[0].zonas

  /* De la más dura a la más suave: es lo que dice de un vistazo si el martes es
     una tirada suave o unas series. Al revés, el chip que se lee primero sería
     el calentamiento y todas las sesiones parecerían iguales. */
  it('van de la más dura a la más suave', () => {
    expect(conZonas(['AER', 'PAE', 'AEL'])[0]).toBe('PAE')
  })

  it('sin repetir', () => {
    expect(conZonas(['AEL', 'AEL', 'AEM'])).toHaveLength(2)
  })

  it('las tareas sin zona no dejan huecos', () => {
    const r = conVolumen(
      [ses(1)],
      [
        { id: 10, id_sesion: 1, series: 1, zona_entrenamiento: null, disciplina: 'Carrera' },
        { id: 11, id_sesion: 1, series: 1, zona_entrenamiento: 'AEM', disciplina: 'Carrera' },
      ], [], [], [], TESTS)
    expect(r[0].zonas).toEqual(['AEM'])
  })
})

describe('la duración estimada', () => {
  /* No es un número: `calcularDuracionEstimada` devuelve minutos, segundos y si
     la estimación es fiable. El calendario pinta los minutos, pero el resto va
     con ellos — por eso se pasa el objeto entero y no solo la cifra. */
  it('sale con sus minutos', () => {
    const r = conVolumen(
      [ses(1)],
      [{ id: 10, id_sesion: 1, series: 1, zona_entrenamiento: 'AEL', disciplina: 'Carrera' }],
      [{ id_tarea: 10, metros_planeados: 10000 }], [], [], TESTS)
    expect(r[0].dur_estimada.minutos).toBeGreaterThan(0)
  })

  it('sin tareas, cero minutos', () => {
    expect(conVolumen([ses(1)], [], [], [], [], TESTS)[0].dur_estimada.minutos).toBe(0)
  })
})
