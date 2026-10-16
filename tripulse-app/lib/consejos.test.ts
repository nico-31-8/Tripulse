import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  consejosDelPanel, consejosDeDeportistas, consejosDeLaFicha, consejosDeTests, consejosDeVistas,
  consejosDelLienzo, consejosDelCalendario, consejosDeLaSesion, consejoQueToca, claveConsejo, enReposo,
  pantallaCalladaHoy, consejosActivos, disciplinaPrincipal, nombreCorto, consejoDeLaVisita, ANCLAS_DE_CONSEJOS,
  consejosDelPlanificador, consejosDelWellness, consejosDeCarga, consejosDeComunicacion, consejosDeCobros, HORA_WELLNESS,
  type Consejo, type DatosPanel, type DatosFicha, type DatosTests, type DatosLienzo, type DatosSesion,
} from './consejos'
import { progresoVacio, type MarcaConsejo } from './tutorial'

const HOY = '2026-10-16'   // viernes
const ahora = new Date(HOY + 'T10:00:00')
const haceDias = (n: number) => new Date(ahora.getTime() - n * 86400000).toISOString()
const reglas = (l: Consejo[]) => l.map(c => c.regla)

const panel = (cambios: Partial<DatosPanel> = {}): DatosPanel => ({
  id: 14, nombre: 'Daniel García', hoy: HOY, conCuenta: true, fcMax: 190, disciplinas: ['Carrera'],
  ultimoTest: '2026-10-01', proximas: [{ fecha: '2026-10-18' }], ultimoWellness: '2026-10-15', valoracion: '2026-10-10',
  ...cambios,
})

describe('Panel', () => {
  it('con todo al día no dice nada', () => {
    expect(consejosDelPanel(panel())).toEqual([])
  })

  it('sin ningún test, empieza por su disciplina; y sin FC máxima, avisa del RPE', () => {
    const [c] = consejosDelPanel(panel({ ultimoTest: null, fcMax: null }))
    expect(c.regla).toBe('sin-tests')
    expect(c.titulo).toBe('Daniel no tiene ningún test')
    expect(c.texto).toBe('Sin tests no hay zonas, y sus sesiones van por RPE. Empieza por uno de carrera: con su VAM salen sus ritmos.')
    expect(c.accion).toEqual({ ir: '/tests/14' })
  })

  it('con FC máxima no dice «por RPE»: van por pulso', () => {
    expect(consejosDelPanel(panel({ ultimoTest: null }))[0].texto).toMatch(/^Sin tests, sus zonas solo van por pulso\./)
  })

  it('a quien solo nada le recomienda uno de natación', () => {
    expect(consejosDelPanel(panel({ ultimoTest: null, disciplinas: ['Natacion', 'Fuerza'] }))[0].texto).toContain('uno de natación: con su CSS')
  })

  it('el test viejo, a partir de 6 semanas', () => {
    expect(reglas(consejosDelPanel(panel({ ultimoTest: '2026-09-05' })))).toEqual([])   // 41 días
    const [c] = consejosDelPanel(panel({ ultimoTest: '2026-09-04' }))                    // 42 días
    expect(c.regla).toBe('test-viejo')
    expect(c.titulo).toBe('Su último test es de hace 6 semanas')
  })

  it('la semana vacía mira los próximos siete días; sin la agenda cargada, nada', () => {
    expect(reglas(consejosDelPanel(panel({ proximas: [{ fecha: '2026-10-22' }] })))).toEqual([])
    expect(reglas(consejosDelPanel(panel({ proximas: [{ fecha: '2026-10-23' }] })))).toEqual(['semana-vacia'])
    expect(reglas(consejosDelPanel(panel({ proximas: [] })))).toEqual(['semana-vacia'])
    expect(reglas(consejosDelPanel(panel({ proximas: null })))).toEqual([])
  })

  it('el wellness: desde 3 días, y solo si tiene cuenta para rellenarlo', () => {
    expect(reglas(consejosDelPanel(panel({ ultimoWellness: '2026-10-14' })))).toEqual([])
    const [c] = consejosDelPanel(panel({ ultimoWellness: '2026-10-13' }))
    expect(c.titulo).toBe('Daniel lleva 3 días sin rellenar el wellness')
    expect(c.accion).toEqual({ ir: '/comunicacion?dep=14' })
    expect(consejosDelPanel(panel({ ultimoWellness: '2026-10-01', conCuenta: false }))).toEqual([])
    expect(consejosDelPanel(panel({ ultimoWellness: null }))).toEqual([])
  })

  it('la valoración técnica: a las cuatro semanas, o si no tiene ninguna', () => {
    expect(reglas(consejosDelPanel(panel({ valoracion: '2026-09-19' })))).toEqual([])   // 27 días
    const [c] = consejosDelPanel(panel({ valoracion: '2026-09-18' }))                    // 28 días
    expect(c.titulo).toBe('Toca renovar su valoración técnica')
    expect(c.texto).toBe('La última es de hace 28 días. Conviene renovarla cada cuatro semanas.')
    expect(consejosDelPanel(panel({ valoracion: null }))[0].titulo).toBe('Le falta su valoración técnica')
  })

  it('en el orden del guion', () => {
    const l = consejosDelPanel(panel({ ultimoTest: null, proximas: [], ultimoWellness: '2026-10-01', valoracion: null }))
    expect(reglas(l)).toEqual(['sin-tests', 'semana-vacia', 'sin-wellness', 'valoracion'])
  })
})

describe('Deportistas', () => {
  const lista = [
    { id: 1, nombre: 'Ana Ruiz', conCuenta: true, fcMax: null },
    { id: 2, nombre: 'Luis', conCuenta: false, fcMax: 185 },
    { id: 3, nombre: '', conCuenta: false, fcMax: null },
  ]
  it('primero quien no tiene cuenta, luego a quien le falta la FC máxima, en el orden de la lista', () => {
    const l = consejosDeDeportistas(lista)
    expect(l.map(c => c.regla + ':' + c.sujeto)).toEqual(['sin-cuenta:2', 'sin-cuenta:3', 'sin-fc-max:1', 'sin-fc-max:3'])
    expect(l[0].boton).toBe('Invitar a Luis')
    expect(l[0].accion).toEqual({ pulsar: 'dep.invitar:2' })
    expect(l[2].titulo).toBe('A Ana le falta la FC máxima')
  })
  it('sin nombre no queda un hueco', () => {
    const l = consejosDeDeportistas(lista)
    expect(l[1].titulo).toBe('Tu deportista aún no tiene cuenta')
    expect(l[1].boton).toBe('Invitar a tu deportista')
  })
})

describe('Ficha', () => {
  const ficha = (c: Partial<DatosFicha> = {}): DatosFicha => ({
    id: 14, nombre: 'Dani', conCuenta: true, alertaSalud: false, tieneAnamnesis: true, fcMax: 190, fcReposo: 48, ...c,
  })
  it('con todo al día no dice nada', () => { expect(consejosDeLaFicha(ficha())).toEqual([]) })

  it('los antecedentes llevan a su anamnesis y no vuelven en dos meses si los leyó', () => {
    const [c] = consejosDeLaFicha(ficha({ alertaSalud: true }))
    expect(c.accion).toEqual({ pulsar: 'ficha.pestana-anamnesis' })
    expect(c.vuelveEnDias).toBe(60)
  })

  it('la anamnesis sin rellenar solo se le pide a quien tiene cuenta', () => {
    expect(reglas(consejosDeLaFicha(ficha({ tieneAnamnesis: false })))).toEqual(['sin-anamnesis'])
    expect(consejosDeLaFicha(ficha({ tieneAnamnesis: false, conCuenta: false }))).toEqual([])
  })

  /* «Editar datos» no tiene la FC de reposo: la apunta el deportista. */
  it('la FC de reposo se le pide a él; la máxima se pone en Editar datos', () => {
    const [r] = consejosDeLaFicha(ficha({ fcReposo: 0 }))
    expect(r.regla).toBe('sin-fc-reposo')
    expect(r.accion).toEqual({ ir: '/comunicacion?dep=14' })
    const [m] = consejosDeLaFicha(ficha({ fcMax: null, fcReposo: 0 }))
    expect(m.regla).toBe('sin-fc-max')
    expect(m.accion).toEqual({ pulsar: 'ficha.editar' })
  })

  it('mientras no se sabe su FC de reposo, no se dice nada de ella', () => {
    expect(consejosDeLaFicha(ficha({ fcReposo: null }))).toEqual([])
  })
})

describe('Tests', () => {
  const tests = (c: Partial<DatosTests> = {}): DatosTests => ({
    id: 14, nombre: 'Dani', hoy: HOY, fcMax: 190, disciplinas: ['Carrera', 'Natacion', 'Ciclismo'], pestana: 'carrera',
    algunTest: true, ultimoConZonas: { Carrera: '2026-10-01', Natacion: '2026-10-01', Ciclismo: '2026-10-01' },
    testParaEmpezar: { id: 'umtt', nombre: 'Test de VAM' }, ...c,
  })
  it('sin ningún test: brilla el de su disciplina principal y «Pasar este test» lo abre', () => {
    const [c] = consejosDeTests(tests({ algunTest: false }))
    expect(c.anclas).toEqual(['tests.test:umtt'])
    expect(c.texto).toBe('Empieza por Test de VAM: con él salen sus zonas de carrera.')
    expect(c.accion).toEqual({ hacer: 'pasar-test' })
  })
  it('desde otra pestaña brilla la suya', () => {
    expect(consejosDeTests(tests({ algunTest: false, pestana: 'natacion' }))[0].anclas).toEqual(['tests.tab:carrera'])
  })
  it('la principal: carrera si la hace; si no ciclismo; si no natación; solo fuerza, ninguna', () => {
    expect(disciplinaPrincipal({ disciplinas: ['Natacion', 'Carrera'] })).toBe('Carrera')
    expect(disciplinaPrincipal({ disciplinas: ['Natacion', 'Ciclismo'] })).toBe('Ciclismo')
    expect(disciplinaPrincipal({ disciplinas: ['Natacion'] })).toBe('Natacion')
    expect(disciplinaPrincipal({ disciplinas: ['Fuerza'] })).toBeNull()
    expect(disciplinaPrincipal({ disciplinas: [] })).toBe('Carrera')   // sin elegir son todas
  })
  it('una disciplina que entrena sin test: por pulso con FC máxima, por RPE sin ella', () => {
    const l = consejosDeTests(tests({ ultimoConZonas: { Carrera: '2026-10-01' } }))
    expect(l.map(c => c.titulo)).toEqual(['Entrena natación y no tiene test', 'Entrena ciclismo y no tiene test'])
    expect(l[0].texto).toBe('Sus sesiones de natación van por pulso hasta que lo tenga.')
    expect(consejosDeTests(tests({ fcMax: null, ultimoConZonas: { Carrera: '2026-10-01' } }))[0].texto).toContain('por RPE')
  })
  it('no avisa de la pestaña que ya se está viendo, ni de lo que no entrena', () => {
    expect(consejosDeTests(tests({ pestana: 'natacion', ultimoConZonas: { Carrera: '2026-10-01', Ciclismo: '2026-10-01' } }))).toEqual([])
    expect(consejosDeTests(tests({ disciplinas: ['Carrera'], ultimoConZonas: { Carrera: '2026-10-01' } }))).toEqual([])
  })
  it('el test viejo de una disciplina, a las 6 semanas', () => {
    const [c] = consejosDeTests(tests({ ultimoConZonas: { Carrera: '2026-10-01', Natacion: '2026-09-04', Ciclismo: '2026-10-01' } }))
    expect(c.titulo).toBe('Natación: su último test es de hace 6 semanas')
    expect(c.accion).toEqual({ pulsar: 'tests.tab:natacion' })
  })
})

describe('Planificación, lienzo y calendario', () => {
  it('sin ningún macrociclo: empezar por Periodización (sin saberlo aún, nada)', () => {
    expect(reglas(consejosDeVistas({ id: 14, nombre: 'Dani', macrociclos: 0 }))).toEqual(['sin-temporada'])
    expect(consejosDeVistas({ id: 14, nombre: 'Dani', macrociclos: null })).toEqual([])
    expect(consejosDeVistas({ id: 14, nombre: 'Dani', macrociclos: 2 })).toEqual([])
  })

  const lienzo = (c: Partial<DatosLienzo> = {}): DatosLienzo => ({
    id: 14, semanas: [{ i: 0, lunes: '2026-10-05', imposibles: 0 }, { i: 1, lunes: '2026-10-12', imposibles: 0 }],
    planGenerado: true, cambiosSinPasar: false,
    mesos: [{ id: 'm1', nombre: 'Base', si: 0, sf: 3 }, { id: 'm2', nombre: 'Construcción', si: 4, sf: 7 }],
    semanasConChips: [1, 5], semanaActual: 1, competicionesFuturas: 1, ...c,
  })
  it('el lienzo al día no dice nada', () => { expect(consejosDelLienzo(lienzo())).toEqual([]) })
  it('la semana con una tarea imposible lleva a esa semana', () => {
    const [c] = consejosDelLienzo(lienzo({ semanas: [{ i: 0, lunes: '2026-10-05', imposibles: 0 }, { i: 1, lunes: '2026-10-12', imposibles: 2 }] }))
    expect(c.titulo).toBe('La semana 2 tiene una tarea imposible')
    expect(c.accion).toEqual({ ir: '/planificacion-visual/14/semana/2026-10-12' })
  })
  it('los cambios sin pasar solo si el plan ya se generó (si no, el botón es otro)', () => {
    expect(reglas(consejosDelLienzo(lienzo({ cambiosSinPasar: true })))).toEqual(['sin-pasar'])
    expect(consejosDelLienzo(lienzo({ cambiosSinPasar: true, planGenerado: false }))).toEqual([])
  })
  it('un mesociclo sin chips, pero no uno que ya pasó', () => {
    const [c] = consejosDelLienzo(lienzo({ semanasConChips: [1] }))
    expect(c.titulo).toBe('Construcción no tiene sesiones')
    expect(c.accion).toEqual({ pulsar: 'lienzo.zonas:4' })
    expect(consejosDelLienzo(lienzo({ semanasConChips: [5], semanaActual: 4 }))).toEqual([])
  })
  it('sin ninguna competición por delante', () => {
    expect(reglas(consejosDelLienzo(lienzo({ competicionesFuturas: 0 })))).toEqual(['sin-comp'])
  })

  const ses = (fecha: string, estado = 'Planificada') => ({ fecha_sesion: fecha, estado })
  it('la semana que viene vacía, salvo que esté bloqueada', () => {
    const l = consejosDelCalendario({ id: 14, hoy: HOY, sesiones: [ses('2026-10-17')], bloqueadas: [] })
    expect(l[0].anclas).toEqual(['cal.semana:2026-10-19', 'cal.plantillas'])
    expect(consejosDelCalendario({ id: 14, hoy: HOY, sesiones: [ses('2026-10-25')], bloqueadas: [] })).toEqual([])
    expect(consejosDelCalendario({ id: 14, hoy: HOY, sesiones: [], bloqueadas: ['2026-10-19T00:00:00'] })).toEqual([])
  })
  it('tres o más pasadas sin hacer en las dos últimas semanas (las canceladas no cuentan)', () => {
    const base = [ses('2026-10-20')]
    const sin = (fechas: string[], estado?: string) => fechas.map(f => ses(f, estado))
    expect(consejosDelCalendario({ id: 14, hoy: HOY, bloqueadas: [], sesiones: [...base, ...sin(['2026-10-13', '2026-10-14'])] })).toEqual([])
    const [c] = consejosDelCalendario({ id: 14, hoy: HOY, bloqueadas: [], sesiones: [...base, ...sin(['2026-10-13', '2026-10-14', '2026-10-15'])] })
    expect(c.titulo).toBe('3 sesiones pasadas siguen sin hacer')
    expect(consejosDelCalendario({ id: 14, hoy: HOY, bloqueadas: [], sesiones: [...base, ...sin(['2026-10-13', '2026-10-14']), ses('2026-10-15', 'Cancelada')] })).toEqual([])
    expect(consejosDelCalendario({ id: 14, hoy: HOY, bloqueadas: [], sesiones: [...base, ...sin(['2026-09-01', '2026-09-02', '2026-09-03'])] })).toEqual([])
    expect(consejosDelCalendario({ id: 14, hoy: HOY, bloqueadas: [], sesiones: [...base, ...sin(['2026-10-13', '2026-10-14', '2026-10-15'], 'Realizada')] })).toEqual([])
  })
})

describe('Sesión', () => {
  const sesion = (c: Partial<DatosSesion> = {}): DatosSesion => ({
    idSesion: 880, idDeportista: 14, nombre: 'Dani', disciplina: 'Carrera', hecha: false, fcMax: 190,
    tieneTestDeLaDisciplina: true, duracionAMano: false, usoReferencia: false, tareasSinZona: [], tareasImposibles: [], ...c,
  })
  it('bien montada no dice nada', () => { expect(consejosDeLaSesion(sesion())).toEqual([]) })
  it('en el orden del guion', () => {
    const l = consejosDeLaSesion(sesion({ tareasSinZona: [5], tieneTestDeLaDisciplina: false, fcMax: null, usoReferencia: true, tareasImposibles: [7], hecha: true }))
    expect(reglas(l)).toEqual(['sin-zona', 'sin-tests', 'prestado', 'imposible', 'hecha'])
    expect(l[0].accion).toEqual({ pulsar: 'sesion.editar:5' })
    expect(l[3].anclas).toEqual(['sesion.tarea:7', 'sesion.duracion'])
  })
  it('«van por RPE» solo sin FC máxima: con ella van por pulso', () => {
    expect(consejosDeLaSesion(sesion({ tieneTestDeLaDisciplina: false }))).toEqual([])
    expect(consejosDeLaSesion(sesion({ tieneTestDeLaDisciplina: false, fcMax: null }))[0].texto)
      .toBe('Dani no tiene tests de carrera. Con uno saldrán sus ritmos, y con su FC máxima, su pulso.')
  })
  it('una duración puesta a mano no es prestada', () => {
    expect(consejosDeLaSesion(sesion({ usoReferencia: true, duracionAMano: true }))).toEqual([])
  })
  it('lo del deportista se recuerda por deportista; lo de la tarea, por sesión', () => {
    const l = consejosDeLaSesion(sesion({ tareasSinZona: [5], usoReferencia: true, hecha: true }))
    expect(l.map(c => claveConsejo(c))).toEqual(['c:sesion:sin-zona:880', 'c:sesion:prestado:14', 'c:sesion:hecha:14'])
  })
})

describe('cuál toca enseñar', () => {
  const lista = consejosDelPanel(panel({ ultimoTest: null, proximas: [], valoracion: null }))
  const marcas = (m: Record<string, MarcaConsejo>) => new Map(Object.entries(m))

  it('el primero de la lista', () => {
    expect(consejoQueToca('panel', lista, new Map(), ahora)?.regla).toBe('sin-tests')
  })

  it('con «Ahora no», esa pantalla se calla el resto del día', () => {
    const m = marcas({ 'c:panel:sin-tests:14': { estado: 'saltado', fecha: haceDias(0.05) } })
    expect(consejoQueToca('panel', lista, m, ahora)).toBeNull()
  })

  it('al día siguiente sale el siguiente, y el primero vuelve a los 7 días', () => {
    const m = marcas({ 'c:panel:sin-tests:14': { estado: 'saltado', fecha: haceDias(1) } })
    expect(consejoQueToca('panel', lista, m, ahora)?.regla).toBe('semana-vacia')
    const m7 = marcas({ 'c:panel:sin-tests:14': { estado: 'saltado', fecha: haceDias(7) } })
    expect(consejoQueToca('panel', lista, m7, ahora)?.regla).toBe('sin-tests')
  })

  it('pulsar su botón lo deja en reposo, pero no calla la pantalla', () => {
    const m = marcas({ 'c:panel:sin-tests:14': { estado: 'visto', fecha: haceDias(0.05) } })
    expect(consejoQueToca('panel', lista, m, ahora)?.regla).toBe('semana-vacia')
  })

  it('el «Ahora no» de otra pantalla no calla esta', () => {
    const m = marcas({ 'c:ficha:antecedentes:14': { estado: 'saltado', fecha: haceDias(0.05) } })
    expect(consejoQueToca('panel', lista, m, ahora)?.regla).toBe('sin-tests')
  })

  it('lo que dura el reposo', () => {
    const [c] = consejosDeLaFicha({ id: 14, nombre: 'Dani', conCuenta: true, alertaSalud: true, tieneAnamnesis: true, fcMax: 190, fcReposo: 48 })
    expect(enReposo(c, { estado: 'visto', fecha: haceDias(59) }, ahora)).toBe(true)
    expect(enReposo(c, { estado: 'visto', fecha: haceDias(60) }, ahora)).toBe(false)
    /* «Ahora no» son siempre 7 días: es lo que decidió el usuario. */
    expect(enReposo(c, { estado: 'saltado', fecha: haceDias(7) }, ahora)).toBe(false)
    expect(enReposo(c, { estado: 'saltado', fecha: 'no es una fecha' }, ahora)).toBe(false)
  })

  it('«hoy» es el día de quien mira, no el de Greenwich', () => {
    const anoche = new Date(HOY + 'T00:30:00')
    const m = marcas({ 'c:panel:sin-tests:14': { estado: 'saltado', fecha: new Date(HOY + 'T00:10:00').toISOString() } })
    expect(pantallaCalladaHoy('panel', m, anoche)).toBe(true)
  })

  it('salen a quien le salen los recorridos solos', () => {
    expect(consejosActivos(progresoVacio(true), true)).toBe(true)
    expect(consejosActivos(progresoVacio(true), false)).toBe(false)
    expect(consejosActivos({ ...progresoVacio(true), oferta: 'aceptada' }, false)).toBe(true)
    expect(consejosActivos({ ...progresoVacio(true), pausado: true }, true)).toBe(false)
    expect(consejosActivos(progresoVacio(false), true)).toBe(false)
  })
})

/* Todos los consejos posibles, para mirar sus claves y sus anclas. */
const TODOS: Consejo[] = [
  ...consejosDelPanel(panel({ ultimoTest: null, proximas: [], ultimoWellness: '2026-10-01', valoracion: null })),
  ...consejosDelPanel(panel({ ultimoTest: '2026-01-01', valoracion: '2026-01-01' })),
  ...consejosDeDeportistas([{ id: 9999999999, nombre: 'Ana', conCuenta: false, fcMax: null }]),
  ...consejosDeLaFicha({ id: 9999999999, nombre: 'Ana', conCuenta: true, alertaSalud: true, tieneAnamnesis: false, fcMax: null, fcReposo: 0 }),
  ...consejosDeLaFicha({ id: 9999999999, nombre: 'Ana', conCuenta: true, alertaSalud: false, tieneAnamnesis: true, fcMax: 190, fcReposo: 0 }),
  ...consejosDeTests({ id: 9999999999, nombre: 'Ana', hoy: HOY, fcMax: null, disciplinas: [], pestana: 'carrera', algunTest: false, ultimoConZonas: {}, testParaEmpezar: { id: 'x', nombre: 'X' } }),
  ...consejosDeTests({ id: 9999999999, nombre: 'Ana', hoy: HOY, fcMax: null, disciplinas: [], pestana: 'natacion', algunTest: false, ultimoConZonas: {}, testParaEmpezar: null }),
  ...consejosDeTests({ id: 9999999999, nombre: 'Ana', hoy: HOY, fcMax: null, disciplinas: [], pestana: 'carrera', algunTest: true, ultimoConZonas: { Natacion: '2026-01-01' }, testParaEmpezar: null }),
  ...consejosDeVistas({ id: 9999999999, nombre: 'Ana', macrociclos: 0 }),
  ...consejosDelLienzo({ id: 9999999999, semanas: [{ i: 0, lunes: '2026-10-12', imposibles: 1 }], planGenerado: true, cambiosSinPasar: true, mesos: [{ id: 'm', nombre: '', si: 0, sf: 1 }], semanasConChips: [], semanaActual: 0, competicionesFuturas: 0 }),
  ...consejosDelCalendario({ id: 9999999999, hoy: HOY, bloqueadas: [], sesiones: [{ fecha_sesion: '2026-10-13' }, { fecha_sesion: '2026-10-14' }, { fecha_sesion: '2026-10-15' }] }),
  ...consejosDeLaSesion({ idSesion: 9999999999, idDeportista: 9999999999, nombre: 'Ana', disciplina: 'Natacion', hecha: true, fcMax: null, tieneTestDeLaDisciplina: false, duracionAMano: false, usoReferencia: true, tareasSinZona: [9999999999], tareasImposibles: [9999999999] }),
  ...consejosDelPlanificador({ id: 9999999999, conCuenta: true, conDisponibilidad: false, diasAnamnesis: null }),
  ...consejosDelWellness({ hora: 18, hoy: HOY, equipo: [{ id: 1, nombre: 'Ana', conCuenta: true, ultimoWellness: null }] }),
  ...consejosDeCarga({ id: 9999999999, conCuenta: true, hoy: HOY, sesiones: [{ fecha_sesion: '2026-10-10', estado: 'Realizada', rpe_reportado: null }] }),
  ...consejosDeComunicacion({ hoy: HOY, feedback: [{ idDeportista: 9999999999, nombre: 'Ana', fecha: '2026-10-01', leido: false }] }),
  ...consejosDeCobros({ filas: [{ id: 9999999999, nombre: 'Ana', atrasado: 35, desde: '2026-08-19' }] }),
]

describe('el catálogo de consejos', () => {
  it('están todos los del guion: 31 consejos en 13 pantallas (26 del primer día y 5 de las avanzadas)', () => {
    const unicas = new Set(TODOS.map(c => c.zona + ':' + c.regla))
    expect(unicas.size).toBe(31)
    expect(new Set(TODOS.map(c => c.zona)).size).toBe(13)
  })

  /* La tabla solo acepta claves de hasta 40 caracteres (supabase/tutorial-progreso.sql). */
  it('cada clave cabe en la tabla, incluso con un id de diez cifras', () => {
    for (const c of TODOS) expect(claveConsejo(c).length).toBeLessThanOrEqual(40)
  })

  it('ningún texto deja un hueco ni un «undefined»', () => {
    for (const c of TODOS) {
      for (const s of [c.titulo, c.texto, c.boton]) {
        expect(s.trim()).not.toBe('')
        expect(s).not.toMatch(/undefined|null|NaN|\{|\}/)
      }
    }
  })

  it('las reglas solo usan anclas de la lista', () => {
    for (const c of TODOS) {
      const usadas = [...c.anclas, ...('pulsar' in c.accion ? [c.accion.pulsar] : []), ...('mirar' in c.accion ? [c.accion.mirar] : [])]
      for (const a of usadas) {
        if (a.includes(':')) expect(ANCLAS_DE_CONSEJOS.porElemento).toContain(a.split(':')[0])
        else expect(ANCLAS_DE_CONSEJOS.fijas).toContain(a)
      }
    }
  })

  it('el nombre de pila', () => {
    expect(nombreCorto('  Daniel García ')).toBe('Daniel')
    expect(nombreCorto(null)).toBe('tu deportista')
  })
})

/* EL TEST QUE IMPORTA: si alguien quita un ancla de una pantalla, el consejo
   no tendría dónde salir y se callaría sin avisar. */
describe('las anclas de los consejos existen en las pantallas', () => {
  const raiz = path.resolve(__dirname, '..')
  const fuentes: string[] = []
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (/\.tsx$/.test(e.name)) fuentes.push(fs.readFileSync(p, 'utf8'))
    }
  }
  recorrer(path.join(raiz, 'app'))
  recorrer(path.join(raiz, 'components'))
  const todo = fuentes.join('\n')

  for (const a of ANCLAS_DE_CONSEJOS.fijas) {
    it(a, () => { expect(todo.includes("'" + a + "'") || todo.includes('"' + a + '"')).toBe(true) })
  }
  for (const p of ANCLAS_DE_CONSEJOS.porElemento) {
    it(p + ':…', () => { expect(todo.includes("data-consejo={'" + p + ":' + ")).toBe(true) })
  }
})

describe('uno por visita', () => {
  const lista = consejosDelPanel(panel({ ultimoTest: null, proximas: [] }))
  const pantalla = { zona: 'panel' as const, lista }
  const libre = { mostrado: null, cerrada: false }
  it('en su pantalla sale el primero', () => {
    expect(consejoDeLaVisita(pantalla, 'panel', libre, new Map(), ahora)?.regla).toBe('sin-tests')
  })
  it('en otra pantalla, nada (la lista es de la que se fue)', () => {
    expect(consejoDeLaVisita(pantalla, 'ficha', libre, new Map(), ahora)).toBeNull()
    expect(consejoDeLaVisita(null, 'panel', libre, new Map(), ahora)).toBeNull()
  })
  it('el que ya se enseña sigue; otro distinto espera a la próxima visita', () => {
    expect(consejoDeLaVisita(pantalla, 'panel', { mostrado: 'c:panel:sin-tests:14', cerrada: false }, new Map(), ahora)?.regla).toBe('sin-tests')
    expect(consejoDeLaVisita(pantalla, 'panel', { mostrado: 'c:panel:sin-tests:22', cerrada: false }, new Map(), ahora)).toBeNull()
  })
  it('tras contestar uno, ninguno más en esta visita', () => {
    expect(consejoDeLaVisita(pantalla, 'panel', { mostrado: 'c:panel:sin-tests:14', cerrada: true }, new Map(), ahora)).toBeNull()
  })
})

describe('los consejos de las pantallas avanzadas', () => {
  it('planificador: sin sus días ni su disponibilidad, y solo si puede rellenarlos', () => {
    const base = { id: 14, conCuenta: true, conDisponibilidad: false, diasAnamnesis: null }
    expect(reglas(consejosDelPlanificador(base))).toEqual(['sin-dias'])
    expect(consejosDelPlanificador({ ...base, diasAnamnesis: 4 })).toEqual([])
    expect(consejosDelPlanificador({ ...base, conDisponibilidad: true })).toEqual([])
    expect(consejosDelPlanificador({ ...base, conCuenta: false })).toEqual([])
  })

  it('wellness: quien tiene cuenta y no lo ha rellenado hoy, y solo desde mediodía', () => {
    const equipo = [
      { id: 1, nombre: 'Ana Ruiz', conCuenta: true, ultimoWellness: '2026-10-15' },
      { id: 2, nombre: 'Luis', conCuenta: true, ultimoWellness: HOY },
      { id: 3, nombre: 'Sin cuenta', conCuenta: false, ultimoWellness: null },
    ]
    expect(consejosDelWellness({ hora: HORA_WELLNESS - 1, hoy: HOY, equipo })).toEqual([])
    const [c] = consejosDelWellness({ hora: HORA_WELLNESS, hoy: HOY, equipo })
    expect(c.titulo).toBe('Ana no lo ha rellenado hoy')
    expect(c.texto).toBe('Sin él no ves cómo llega a la sesión. Recuérdaselo por Comunicación.')
    const varios = consejosDelWellness({ hora: 15, hoy: HOY, equipo: [...equipo, { id: 4, nombre: 'Eva', conCuenta: true, ultimoWellness: null }] })
    expect(varios[0].titulo).toBe('2 deportistas no lo han rellenado hoy')
    expect(varios[0].accion).toEqual({ pulsar: 'well.sin-hoy' })
  })

  it('carga: las hechas sin su RPE de las cuatro últimas semanas', () => {
    const s = (f: string, estado = 'Realizada', rpe: number | null = null) => ({ fecha_sesion: f, estado, rpe_reportado: rpe })
    const base = { id: 14, conCuenta: true, hoy: HOY }
    expect(consejosDeCarga({ ...base, sesiones: [s('2026-10-10', 'Realizada', 6), s('2026-10-11', 'Planificada')] })).toEqual([])
    expect(consejosDeCarga({ ...base, sesiones: [s('2026-09-01')] })).toEqual([])
    expect(consejosDeCarga({ ...base, sesiones: [s('2026-10-10')] })[0].titulo).toBe('Una sesión hecha no tiene su RPE')
    expect(consejosDeCarga({ ...base, sesiones: [s('2026-10-10'), s('2026-10-12')] })[0].titulo).toBe('2 sesiones hechas no tienen su RPE')
    expect(consejosDeCarga({ ...base, conCuenta: false, sesiones: [s('2026-10-10')] })).toEqual([])
  })

  it('comunicación: el feedback sin leer de dos días o más, primero quien más lleva esperando', () => {
    const l = consejosDeComunicacion({ hoy: HOY, feedback: [
      { idDeportista: 1, nombre: 'Ana', fecha: '2026-10-15', leido: false },
      { idDeportista: 2, nombre: 'Luis', fecha: '2026-10-12', leido: false },
      { idDeportista: 2, nombre: 'Luis', fecha: '2026-10-10', leido: false },
      { idDeportista: 3, nombre: 'Eva', fecha: '2026-10-01', leido: true },
      { idDeportista: 4, nombre: 'Leo', fecha: '2026-10-13', leido: false },
    ] })
    expect(l.map(c => c.sujeto)).toEqual([2, 4])
    expect(l[0].titulo).toBe('Luis te contó cómo le fue')
    expect(l[0].texto).toBe('Lleva 6 días sin respuesta.')
    expect(l[0].accion).toEqual({ pulsar: 'com.conv:2' })
  })

  it('cobros: lo atrasado, con su importe y desde cuándo', () => {
    const [c] = consejosDeCobros({ filas: [
      { id: 1, nombre: 'Ana', atrasado: 0, desde: null },
      { id: 2, nombre: 'Luis Gil', atrasado: 35.5, desde: '2026-08-19' },
    ] })
    expect(c.titulo).toBe('Luis tiene 35,50 € vencidos')
    expect(c.texto).toBe('Desde el 19 de agosto.')
    expect(c.accion).toEqual({ pulsar: 'cobros.abrir:2' })
    expect(consejosDeCobros({ filas: [{ id: 3, nombre: 'Eva', atrasado: 1, desde: null }] })[0].titulo).toBe('Eva tiene 1 € vencido')
  })
})
