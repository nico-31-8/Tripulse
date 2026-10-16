// ============================================================
// TRIPULSE — Los consejos del tutorial: lo que dicen sus datos
// ============================================================
// Fase 2 del tutorial guiado (16-10-2026). Cada pantalla del recorrido tiene
// sus consejos, los del guion que aprobó el usuario: salen en ámbar encima de
// lo que hay que tocar, sin oscurecer ni bloquear nada.
//
// Aquí solo hay reglas PURAS. Cada pantalla pasa los datos que ya tiene
// cargados y recibe los consejos que aplican, en el orden del guion. Cuál se
// enseña lo decide `consejoQueToca`:
// - Uno por visita a cada pantalla: el primero que no esté en reposo.
// - «Ahora no»: ese consejo vuelve a los 7 días si sigue igual (decidido el
//   16-10-2026), y esa pantalla ya no enseña ninguno más ese día: «si hay
//   varios, sale solo el primero; los demás, otro día».
// - Pulsar su botón también lo deja en reposo: 7 días, o más en lo que no
//   cambia (los antecedentes médicos).
// Salen al mismo que los recorridos automáticos: a las cuentas nuevas y a
// quien aceptó la tarjeta. A quien dijo «No, gracias» no le sale nada solo.
//
// Donde el guion no casaba con la app, manda la app (y el guion se corrigió):
// - La FC de reposo no se pone en «Editar datos»: la apunta el deportista en
//   su wellness o su anamnesis. Ese consejo es para pedírsela.
// - La FC máxima solo se calcula sola al CREAR el deportista. En la ficha, con
//   la fecha de nacimiento no basta: hay que ponerla.
// - «Van por RPE» solo es verdad sin FC máxima; con ella, van por pulso.

import { diasEntre, fechaValida, soloDia, sumarDias, proximoLunes, aISO, MESES_LARGOS } from './fechas'
import { eur } from './cobros'
import { disciplinasDe } from './disciplinas'
import { DIAS_VALORACION } from './sugerencias-entrenador'
import { guiaAutomatica, type MarcaConsejo, type Progreso } from './tutorial'

export type ZonaConConsejos =
  | 'panel' | 'deportistas' | 'ficha' | 'tests' | 'vistas' | 'lienzo' | 'calendario' | 'sesion'
  /* Las pantallas avanzadas que tienen consejo en el guion (fase 3). */
  | 'planificador' | 'wellness' | 'carga' | 'comunicacion' | 'cobros'
  /* El deportista (fase 4): solo los dos del guion. */
  | 'd-hoy' | 'd-sesiones'

/** Qué hace su botón: ir a otra pantalla, pulsar algo de esta, llevar la vista hasta algo o una acción de la página. */
export type AccionConsejo = { ir: string } | { pulsar: string } | { mirar: string } | { hacer: string }

export interface Consejo {
  zona: ZonaConConsejos
  /** La regla que lo saca. Con la zona y el sujeto forma la clave con la que se recuerda. */
  regla: string
  /** De quién es: el deportista o, en la pantalla de una sesión, a veces la sesión. */
  sujeto: number
  /** Lo que brilla: el primero que esté en pantalla. Con «:» es un `data-consejo`; sin él, un `data-guia`. */
  anclas: string[]
  titulo: string
  texto: string
  boton: string
  accion: AccionConsejo
  /** Días de reposo tras pulsar su botón, cuando no son los de siempre. */
  vuelveEnDias?: number
}

/** Lo de siempre: ni «Ahora no» ni el botón lo hacen volver antes de una semana. */
export const DIAS_DE_REPOSO = 7
/** Un test de más de seis semanas «conviene repetirlo» (es lo que ya dicen el Panel y Tests). */
export const DIAS_TEST_VIEJO = 42

/** Los del deportista hablan de sus propios datos («según tus datos»); los demás, de los de un deportista. */
export const esDelDeportista = (c: Pick<Consejo, 'zona'>): boolean => c.zona.startsWith('d-')

export function claveConsejo(c: Pick<Consejo, 'zona' | 'regla' | 'sujeto'>): string {
  return 'c:' + c.zona + ':' + c.regla + ':' + c.sujeto
}

/** ¿Pueden salir consejos? Al mismo que los recorridos automáticos. */
export function consejosActivos(p: Progreso, esNuevo: boolean): boolean {
  return guiaAutomatica(p, esNuevo)
}

/** ¿Sigue en reposo este consejo? */
export function enReposo(c: Consejo, m: MarcaConsejo | undefined, ahora: Date): boolean {
  if (!m) return false
  const t = Date.parse(m.fecha)
  if (!Number.isFinite(t)) return false
  const dias = m.estado === 'visto' ? (c.vuelveEnDias ?? DIAS_DE_REPOSO) : DIAS_DE_REPOSO
  return ahora.getTime() - t < dias * 86400000
}

/** Tras un «Ahora no», esa pantalla no enseña ningún consejo más ese día. */
export function pantallaCalladaHoy(zona: ZonaConConsejos, marcas: Map<string, MarcaConsejo>, ahora: Date): boolean {
  const hoy = aISO(ahora)
  const prefijo = 'c:' + zona + ':'
  for (const [clave, m] of marcas) {
    if (m.estado !== 'saltado' || !clave.startsWith(prefijo)) continue
    const t = new Date(m.fecha)
    if (!isNaN(t.getTime()) && aISO(t) === hoy) return true
  }
  return false
}

/** El consejo que toca enseñar en esta pantalla, o null. */
export function consejoQueToca(
  zona: ZonaConConsejos, lista: Consejo[], marcas: Map<string, MarcaConsejo>, ahora: Date,
): Consejo | null {
  if (!lista.length || pantallaCalladaHoy(zona, marcas, ahora)) return null
  return lista.find(c => !enReposo(c, marcas.get(claveConsejo(c)), ahora)) ?? null
}

/** Lo que lleva una visita a una pantalla: qué consejo enseñó y si ya se contestó. */
export interface Visita { mostrado: string | null; cerrada: boolean }

/**
 * El consejo que puede salir ahora en la pantalla que se ve, o null. Uno por
 * visita: si ya se enseñó otro (de otro deportista, al cambiar en el Panel),
 * este espera a la próxima; y tras contestar uno, ninguno más.
 */
export function consejoDeLaVisita(
  pantalla: { zona: ZonaConConsejos; lista: Consejo[] } | null,
  zonaAqui: string | null,
  visita: Visita,
  marcas: Map<string, MarcaConsejo>,
  ahora: Date,
): Consejo | null {
  if (!pantalla || visita.cerrada || zonaAqui !== pantalla.zona) return null
  const c = consejoQueToca(pantalla.zona, pantalla.lista, marcas, ahora)
  if (!c || (visita.mostrado && visita.mostrado !== claveConsejo(c))) return null
  return c
}

/**
 * Todas las anclas de los consejos. Las fijas son un `data-guia`; las de un
 * elemento concreto (su fila, su semana…) son un `data-consejo` con «:id».
 * Un test comprueba que las reglas no usan otras y que todas están en las pantallas.
 */
export const ANCLAS_DE_CONSEJOS = {
  fijas: [
    'panel.tests', 'panel.semana', 'panel.wellness', 'panel.ficha',
    'ficha.antecedentes', 'ficha.pestana-anamnesis', 'ficha.editar', 'ficha.fc-maxima',
    'vistas.lienzo', 'lienzo.carga', 'lienzo.generar', 'lienzo.competicion',
    'cal.plantillas', 'cal.vista-lista', 'sesion.intensidad', 'sesion.duracion', 'sesion.lo-que-hizo',
    'plan.deportista', 'well.sin-hoy', 'carga.forma', 'carga.vistas',
    'dnav.mas', 'menu', 'dses.vistas',
  ],
  porElemento: [
    'dep.invitar', 'dep.perfil', 'tests.test', 'tests.tab', 'lienzo.semana', 'lienzo.meso',
    'lienzo.zonas', 'cal.semana', 'sesion.tarea', 'sesion.editar', 'com.conv', 'cobros.dep', 'cobros.abrir',
    'dses.s',
  ],
}

/* ---------------------------------------------------------------
   Piezas comunes
   --------------------------------------------------------------- */

/** El nombre de pila: los consejos hablan de «Dani», no de «Daniel García Pérez». */
export function nombreCorto(nombre: string | null | undefined): string {
  return (nombre || '').trim().split(/\s+/)[0] || 'tu deportista'
}

/** La primera letra en mayúscula, para cuando el nombre abre la frase. */
const frase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const DE_DISCIPLINA = {
  Carrera: { nombre: 'carrera', medida: 'VAM', salen: 'sus ritmos', pestana: 'carrera' },
  Ciclismo: { nombre: 'ciclismo', medida: 'FTP', salen: 'sus vatios', pestana: 'ciclismo' },
  Natacion: { nombre: 'natación', medida: 'CSS', salen: 'sus ritmos', pestana: 'natacion' },
} as const

export type DisciplinaConZonas = keyof typeof DE_DISCIPLINA

/** La pestaña de Tests de una disciplina. */
export const pestanaDeTests = (d: DisciplinaConZonas): string => DE_DISCIPLINA[d].pestana

/** Las de resistencia en el orden de las pestañas de Tests. */
const DE_RESISTENCIA: DisciplinaConZonas[] = ['Carrera', 'Natacion', 'Ciclismo']

/** Por dónde empezar los tests: carrera si la hace (con su VAM salen sus ritmos), si no ciclismo, si no natación. */
export function disciplinaPrincipal(dep: { disciplinas?: string[] | null } | null | undefined): DisciplinaConZonas | null {
  const suyas = disciplinasDe(dep)
  for (const d of ['Carrera', 'Ciclismo', 'Natacion'] as const) if (suyas.includes(d)) return d
  return null
}

const diasDesde = (fecha: string | null | undefined, hoy: string): number | null =>
  fecha && fechaValida(fecha) ? diasEntre(soloDia(fecha), hoy) : null

/* ---------------------------------------------------------------
   2. Panel (el de un deportista)
   --------------------------------------------------------------- */

export interface DatosPanel {
  id: number
  nombre: string | null
  hoy: string
  conCuenta: boolean
  fcMax: number | null
  disciplinas?: string[] | null
  /** El último test de lo que sea; null = ninguno. */
  ultimoTest: string | null
  /** Sus próximas sesiones sin hacer, de hoy en adelante; null = aún no se sabe. */
  proximas: { fecha: string }[] | null
  /** Su último wellness; null = ninguno. */
  ultimoWellness: string | null
  /** Su valoración técnica; null = ninguna. */
  valoracion: string | null
}

export function consejosDelPanel(d: DatosPanel): Consejo[] {
  const n = nombreCorto(d.nombre)
  const de = { zona: 'panel' as const, sujeto: d.id }
  const tests = { ir: '/tests/' + d.id }
  const out: Consejo[] = []

  const diasTest = diasDesde(d.ultimoTest, d.hoy)
  if (diasTest == null) {
    const p = DE_DISCIPLINA[disciplinaPrincipal(d) || 'Carrera']
    out.push({
      ...de, regla: 'sin-tests', anclas: ['panel.tests'],
      titulo: frase(n) + ' no tiene ningún test',
      texto: (d.fcMax ? 'Sin tests, sus zonas solo van por pulso.' : 'Sin tests no hay zonas, y sus sesiones van por RPE.')
        + ' Empieza por uno de ' + p.nombre + ': con su ' + p.medida + ' salen ' + p.salen + '.',
      boton: 'Pasarle un test', accion: tests,
    })
  } else if (diasTest >= DIAS_TEST_VIEJO) {
    out.push({
      ...de, regla: 'test-viejo', anclas: ['panel.tests'],
      titulo: 'Su último test es de hace ' + Math.floor(diasTest / 7) + ' semanas',
      texto: 'Conviene repetirlo cada 6: sus zonas pueden haberse quedado cortas.',
      boton: 'Ver sus tests', accion: tests,
    })
  }

  if (d.proximas) {
    const fin = sumarDias(d.hoy, 6)
    if (!d.proximas.some(s => soloDia(s.fecha) >= d.hoy && soloDia(s.fecha) <= fin)) {
      out.push({
        ...de, regla: 'semana-vacia', anclas: ['panel.semana'],
        titulo: 'Su semana está vacía',
        texto: 'No tiene ninguna sesión en los próximos siete días.',
        boton: 'Planificar su semana', accion: { ir: '/planificacion-visual/' + d.id + '/calendario' },
      })
    }
  }

  /* Sin cuenta no puede rellenarlo: eso lo dice Deportistas. Y sin ningún
     registro no hay «lleva N días» que contar. */
  const diasWell = d.conCuenta ? diasDesde(d.ultimoWellness, d.hoy) : null
  if (diasWell != null && diasWell >= 3) {
    out.push({
      ...de, regla: 'sin-wellness', anclas: ['panel.wellness'],
      titulo: frase(n) + ' lleva ' + diasWell + ' días sin rellenar el wellness',
      texto: 'Sin él no ves cómo llega a las sesiones. Recuérdaselo por Comunicación.',
      boton: 'Escribirle', accion: { ir: '/comunicacion?dep=' + d.id },
    })
  }

  const diasVal = diasDesde(d.valoracion, d.hoy)
  const ficha = { ir: '/deportistas/' + d.id }
  if (diasVal == null) {
    out.push({
      ...de, regla: 'valoracion', anclas: ['panel.ficha'],
      titulo: 'Le falta su valoración técnica',
      texto: 'Se pone en su ficha, con «Editar datos». Conviene renovarla cada cuatro semanas.',
      boton: 'Abrir su ficha', accion: ficha,
    })
  } else if (diasVal >= DIAS_VALORACION) {
    out.push({
      ...de, regla: 'valoracion', anclas: ['panel.ficha'],
      titulo: 'Toca renovar su valoración técnica',
      texto: 'La última es de hace ' + diasVal + ' días. Conviene renovarla cada cuatro semanas.',
      boton: 'Abrir su ficha', accion: ficha,
    })
  }
  return out
}

/* ---------------------------------------------------------------
   3. Deportistas (la lista)
   --------------------------------------------------------------- */

export interface DeportistaDeLaLista { id: number; nombre: string | null; conCuenta: boolean; fcMax: number | null }

export function consejosDeDeportistas(lista: DeportistaDeLaLista[]): Consejo[] {
  const out: Consejo[] = []
  for (const d of lista) {
    if (d.conCuenta) continue
    const n = nombreCorto(d.nombre)
    out.push({
      zona: 'deportistas', regla: 'sin-cuenta', sujeto: d.id, anclas: ['dep.invitar:' + d.id],
      titulo: frase(n) + ' aún no tiene cuenta',
      texto: 'No ve su plan ni puede mandarte el wellness. Mándale la invitación.',
      boton: 'Invitar a ' + n, accion: { pulsar: 'dep.invitar:' + d.id },
    })
  }
  for (const d of lista) {
    if (d.fcMax) continue
    out.push({
      zona: 'deportistas', regla: 'sin-fc-max', sujeto: d.id, anclas: ['dep.perfil:' + d.id],
      titulo: 'A ' + nombreCorto(d.nombre) + ' le falta la FC máxima',
      texto: 'Sin ella no salen sus zonas por pulso. Ponla en su ficha, con «Editar datos».',
      boton: 'Abrir su ficha', accion: { ir: '/deportistas/' + d.id },
    })
  }
  return out
}

/* ---------------------------------------------------------------
   4. Ficha del deportista
   --------------------------------------------------------------- */

export interface DatosFicha {
  id: number
  nombre: string | null
  conCuenta: boolean
  alertaSalud: boolean
  tieneAnamnesis: boolean
  fcMax: number | null
  /** La FC de reposo que se le conoce (lib/frecuencia-cardiaca: 0 = ninguna); null = aún no se sabe. */
  fcReposo: number | null
}

export function consejosDeLaFicha(d: DatosFicha): Consejo[] {
  const n = nombreCorto(d.nombre)
  const de = { zona: 'ficha' as const, sujeto: d.id }
  const escribirle = { ir: '/comunicacion?dep=' + d.id }
  const out: Consejo[] = []
  if (d.alertaSalud) {
    out.push({
      ...de, regla: 'antecedentes', anclas: ['ficha.antecedentes'],
      titulo: frase(n) + ' tiene antecedentes médicos',
      texto: 'Revísalos en su anamnesis antes de planificar.',
      boton: 'Leer su anamnesis', accion: { pulsar: 'ficha.pestana-anamnesis' },
      /* No cambian: una vez leídos, basta con recordarlo de vez en cuando. */
      vuelveEnDias: 60,
    })
  }
  if (d.conCuenta && !d.tieneAnamnesis) {
    out.push({
      ...de, regla: 'sin-anamnesis', anclas: ['ficha.pestana-anamnesis'],
      titulo: frase(n) + ' no ha rellenado la anamnesis',
      texto: 'Sin ella no sabes sus lesiones ni su historial. Pídesela por Comunicación.',
      boton: 'Escribirle', accion: escribirle,
    })
  }
  if (!d.fcMax) {
    out.push({
      ...de, regla: 'sin-fc-max', anclas: ['ficha.editar'],
      titulo: 'Le falta la FC máxima',
      texto: 'Sin ella no salen sus zonas por pulso.',
      boton: 'Editar sus datos', accion: { pulsar: 'ficha.editar' },
    })
  } else if (d.conCuenta && d.fcReposo === 0) {
    out.push({
      ...de, regla: 'sin-fc-reposo', anclas: ['ficha.fc-maxima'],
      titulo: 'Con su FC de reposo, sus zonas salen más justas',
      texto: 'Con las dos, el pulso de cada zona se calcula con su reserva cardíaca. La de reposo sale de su wellness de la mañana o de su anamnesis: pídele que la apunte.',
      boton: 'Escribirle', accion: escribirle,
    })
  }
  return out
}

/* ---------------------------------------------------------------
   5. Tests y zonas
   --------------------------------------------------------------- */

export interface DatosTests {
  id: number
  nombre: string | null
  hoy: string
  fcMax: number | null
  disciplinas?: string[] | null
  /** La pestaña que se ve ahora: 'carrera', 'natacion', 'ciclismo'… */
  pestana: string
  /** ¿Tiene algún test, del tipo que sea? */
  algunTest: boolean
  /** Por disciplina: la fecha del último test que fija sus zonas; null = ninguno. */
  ultimoConZonas: Partial<Record<DisciplinaConZonas, string | null>>
  /** El test con ZONAS por el que empezar, de su disciplina principal. */
  testParaEmpezar: { id: string; nombre: string } | null
}

export function consejosDeTests(d: DatosTests): Consejo[] {
  const n = nombreCorto(d.nombre)
  const de = { zona: 'tests' as const, sujeto: d.id }
  const suyas = disciplinasDe(d)
  const out: Consejo[] = []

  if (!d.algunTest) {
    const prin = disciplinaPrincipal(d)
    if (prin) {
      const p = DE_DISCIPLINA[prin]
      const t = d.testParaEmpezar
      out.push({
        ...de, regla: 'sin-tests',
        /* Si se está viendo otra pestaña, brilla la suya: «Pasar este test» cambia de pestaña y lo abre. */
        anclas: t && d.pestana === p.pestana ? ['tests.test:' + t.id] : ['tests.tab:' + p.pestana],
        titulo: frase(n) + ' no tiene ningún test',
        texto: 'Empieza por ' + (t ? t.nombre : 'uno de ' + p.nombre) + ': con él salen sus zonas de ' + p.nombre + '.',
        boton: 'Pasar este test', accion: { hacer: 'pasar-test' },
      })
    }
    return out
  }

  for (const disc of DE_RESISTENCIA) {
    if (!suyas.includes(disc)) continue
    const p = DE_DISCIPLINA[disc]
    if (d.pestana === p.pestana || d.ultimoConZonas[disc]) continue
    out.push({
      ...de, regla: 'disc-sin-test', anclas: ['tests.tab:' + p.pestana],
      titulo: 'Entrena ' + p.nombre + ' y no tiene test',
      texto: 'Sus sesiones de ' + p.nombre + ' van por ' + (d.fcMax ? 'pulso' : 'RPE') + ' hasta que lo tenga.',
      boton: 'Ir a ' + p.nombre, accion: { pulsar: 'tests.tab:' + p.pestana },
    })
  }
  for (const disc of DE_RESISTENCIA) {
    if (!suyas.includes(disc)) continue
    const p = DE_DISCIPLINA[disc]
    const dias = diasDesde(d.ultimoConZonas[disc], d.hoy)
    if (d.pestana === p.pestana || dias == null || dias < DIAS_TEST_VIEJO) continue
    out.push({
      ...de, regla: 'test-viejo', anclas: ['tests.tab:' + p.pestana],
      titulo: frase(p.nombre) + ': su último test es de hace ' + Math.floor(dias / 7) + ' semanas',
      texto: 'Conviene repetirlo cada 6. Sus zonas pueden haberse quedado cortas.',
      boton: 'Ir a ' + p.nombre, accion: { pulsar: 'tests.tab:' + p.pestana },
    })
  }
  return out
}

/* ---------------------------------------------------------------
   6. Planificación: elegir vista
   --------------------------------------------------------------- */

export function consejosDeVistas(d: { id: number; nombre: string | null; macrociclos: number | null }): Consejo[] {
  if (d.macrociclos !== 0) return []
  return [{
    zona: 'vistas', regla: 'sin-temporada', sujeto: d.id, anclas: ['vistas.lienzo'],
    titulo: frase(nombreCorto(d.nombre)) + ' aún no tiene temporada',
    texto: 'Empieza por Periodización: dibujas los bloques hasta su competición y luego se rellenan las semanas.',
    boton: 'Abrir Periodización', accion: { pulsar: 'vistas.lienzo' },
  }]
}

/* ---------------------------------------------------------------
   7. Lienzo de periodización
   --------------------------------------------------------------- */

export interface DatosLienzo {
  id: number
  /** Cada semana del lienzo: su lunes y cuántas sesiones tienen una tarea imposible. */
  semanas: { i: number; lunes: string | null; imposibles: number }[]
  /** El plan ya se pasó al calendario alguna vez (el botón dice «Actualizar»). */
  planGenerado: boolean
  cambiosSinPasar: boolean
  mesos: { id: string; nombre: string; si: number; sf: number }[]
  /** Las semanas que tienen algún chip. */
  semanasConChips: number[]
  /** La semana de hoy contada desde el inicio del lienzo (negativa si aún no ha empezado). */
  semanaActual: number
  competicionesFuturas: number
}

export function consejosDelLienzo(d: DatosLienzo): Consejo[] {
  const de = { zona: 'lienzo' as const, sujeto: d.id }
  const out: Consejo[] = []
  const mala = d.semanas.find(s => s.imposibles > 0 && s.lunes)
  if (mala) {
    out.push({
      ...de, regla: 'imposible', anclas: ['lienzo.semana:' + mala.i, 'lienzo.carga'],
      titulo: 'La semana ' + (mala.i + 1) + ' tiene una tarea imposible',
      texto: 'Una tarea dura más de un día entero y no se cuenta en la carga. Corrígela en su sesión.',
      boton: 'Ver la semana', accion: { ir: '/planificacion-visual/' + d.id + '/semana/' + mala.lunes },
    })
  }
  if (d.planGenerado && d.cambiosSinPasar) {
    out.push({
      ...de, regla: 'sin-pasar', anclas: ['lienzo.generar'],
      titulo: 'Tienes cambios sin pasar al calendario',
      texto: 'Pásalos para que el calendario los recoja.',
      boton: 'Actualizar', accion: { pulsar: 'lienzo.generar' },
    })
  }
  /* Uno que ya pasó no pide nada: sus semanas son historia. */
  const conChips = new Set(d.semanasConChips)
  const vacio = d.mesos.find(m => m.sf >= d.semanaActual && !Array.from({ length: m.sf - m.si + 1 }, (_, k) => m.si + k).some(w => conChips.has(w)))
  if (vacio) {
    out.push({
      ...de, regla: 'meso-vacio', anclas: ['lienzo.meso:' + vacio.id],
      titulo: frase(vacio.nombre.trim() || 'Este mesociclo') + ' no tiene sesiones',
      texto: 'Añade las zonas de sus semanas para poder colocarlas en días.',
      boton: 'Añadir sesiones', accion: { pulsar: 'lienzo.zonas:' + Math.max(vacio.si, d.semanaActual, 0) },
    })
  }
  if (d.competicionesFuturas === 0) {
    out.push({
      ...de, regla: 'sin-comp', anclas: ['lienzo.competicion'],
      titulo: 'No tiene competición marcada',
      texto: 'Con ella el lienzo sabe hasta dónde llega la temporada y cuándo afinar.',
      boton: 'Añadir competición', accion: { pulsar: 'lienzo.competicion' },
    })
  }
  return out
}

/* ---------------------------------------------------------------
   8. Calendario
   --------------------------------------------------------------- */

export interface DatosCalendario {
  id: number
  hoy: string
  sesiones: { fecha_sesion: string | null; estado?: string | null }[]
  /** Los lunes de las semanas bloqueadas. */
  bloqueadas: string[]
}

/** Las pasadas sin hacer se cuentan en estas dos semanas: lo de antes ya es historia. */
const DIAS_SIN_HACER = 14

export function consejosDelCalendario(d: DatosCalendario): Consejo[] {
  const de = { zona: 'calendario' as const, sujeto: d.id }
  const out: Consejo[] = []
  const lunes = proximoLunes(d.hoy), domingo = sumarDias(lunes, 6)
  const fechas = d.sesiones.map(s => ({ f: soloDia(s.fecha_sesion), estado: s.estado }))
  if (!d.bloqueadas.map(soloDia).includes(lunes) && !fechas.some(s => s.f >= lunes && s.f <= domingo)) {
    out.push({
      ...de, regla: 'semana-vacia', anclas: ['cal.semana:' + lunes, 'cal.plantillas'],
      titulo: 'La semana que viene está vacía',
      texto: 'No tiene ninguna sesión. Copia una semana o usa una plantilla.',
      boton: 'Abrir plantillas', accion: { pulsar: 'cal.plantillas' },
    })
  }
  const desde = sumarDias(d.hoy, -DIAS_SIN_HACER)
  const sinHacer = fechas.filter(s => s.f >= desde && s.f < d.hoy && s.estado !== 'Realizada' && s.estado !== 'Cancelada').length
  if (sinHacer >= 3) {
    out.push({
      ...de, regla: 'sin-hacer', anclas: ['cal.vista-lista'],
      titulo: sinHacer + ' sesiones pasadas siguen sin hacer',
      texto: 'Si las hizo, que las apunte; si no, muévelas o bórralas.',
      boton: 'Ver la lista', accion: { pulsar: 'cal.vista-lista' },
    })
  }
  return out
}

/* ---------------------------------------------------------------
   9. Montar una sesión
   --------------------------------------------------------------- */

export interface DatosSesion {
  idSesion: number
  idDeportista: number
  nombre: string | null
  disciplina: string | null
  hecha: boolean
  fcMax: number | null
  /** ¿Tiene el test que fija las zonas de la disciplina de la sesión? null = no aplica (fuerza…). */
  tieneTestDeLaDisciplina: boolean | null
  /** Tiene la duración puesta a mano: entonces no se estima nada. */
  duracionAMano: boolean
  /** La duración estimada usa un ritmo medio prestado (lib/duracion: usoReferencia). */
  usoReferencia: boolean
  /** Las tareas de resistencia sin zona, en orden. */
  tareasSinZona: number[]
  /** Las tareas que durarían más de un día entero, en orden. */
  tareasImposibles: number[]
}

export function consejosDeLaSesion(d: DatosSesion): Consejo[] {
  const n = nombreCorto(d.nombre)
  const deSesion = { zona: 'sesion' as const, sujeto: d.idSesion }
  /* Lo que es del deportista y no de la sesión se recuerda por deportista: un
     «Ahora no» en una sesión vale para las demás. */
  const delDeportista = { zona: 'sesion' as const, sujeto: d.idDeportista }
  const tests = { ir: '/tests/' + d.idDeportista }
  const out: Consejo[] = []
  const sinZona = d.tareasSinZona[0]
  if (sinZona != null) {
    out.push({
      ...deSesion, regla: 'sin-zona', anclas: ['sesion.tarea:' + sinZona],
      titulo: 'Esta tarea no tiene zona',
      texto: 'Sin zona no cuenta en la carga ni en el reparto de intensidades.',
      boton: 'Ponerle zona', accion: { pulsar: 'sesion.editar:' + sinZona },
    })
  }
  const disc = d.disciplina && d.disciplina in DE_DISCIPLINA ? DE_DISCIPLINA[d.disciplina as DisciplinaConZonas] : null
  if (disc && d.tieneTestDeLaDisciplina === false && !d.fcMax) {
    out.push({
      ...delDeportista, regla: 'sin-tests', anclas: ['sesion.intensidad', 'sesion.duracion'],
      titulo: 'Las intensidades van por RPE',
      texto: frase(n) + ' no tiene tests de ' + disc.nombre + '. Con uno saldrán ' + disc.salen + ', y con su FC máxima, su pulso.',
      boton: 'Ir a sus tests', accion: tests,
    })
  }
  if (!d.duracionAMano && d.usoReferencia) {
    out.push({
      ...delDeportista, regla: 'prestado', anclas: ['sesion.duracion'],
      titulo: 'Esta duración usa un ritmo prestado',
      texto: 'Se calcula con un ritmo medio, no con el suyo, porque no tiene tests. Con un test será más exacta.',
      boton: 'Ir a sus tests', accion: tests,
    })
  }
  const imposible = d.tareasImposibles[0]
  if (imposible != null) {
    out.push({
      ...deSesion, regla: 'imposible', anclas: ['sesion.tarea:' + imposible, 'sesion.duracion'],
      titulo: 'Esta tarea no puede durar tanto',
      texto: 'No cuenta en la duración ni en la carga hasta que la corrijas.',
      boton: 'Corregirla', accion: { pulsar: 'sesion.editar:' + imposible },
    })
  }
  if (d.hecha) {
    out.push({
      ...delDeportista, regla: 'hecha', anclas: ['sesion.lo-que-hizo'],
      titulo: frase(n) + ' ya hizo esta sesión',
      texto: 'Mira lo que hizo frente a lo que prescribiste antes de montar la siguiente.',
      boton: 'Ver lo que hizo', accion: { mirar: 'sesion.lo-que-hizo' },
    })
  }
  return out
}

/* ---------------------------------------------------------------
   Pantallas avanzadas (fase 3). Sus recorridos solo salen con el
   botón ?, pero sus consejos salen como los demás.
   --------------------------------------------------------------- */

/** Planificador: sin sus días ni su disponibilidad, el reparto va a ciegas. */
export function consejosDelPlanificador(d: {
  id: number; conCuenta: boolean; conDisponibilidad: boolean; diasAnamnesis: number | null
}): Consejo[] {
  if (!d.conCuenta || d.conDisponibilidad || d.diasAnamnesis != null) return []
  return [{
    zona: 'planificador', regla: 'sin-dias', sujeto: d.id, anclas: ['plan.deportista'],
    titulo: 'Al planificador le faltan sus días',
    texto: 'Sin sus días y horas, el reparto va a ciegas. Pídele que rellene la anamnesis.',
    boton: 'Escribirle', accion: { ir: '/comunicacion?dep=' + d.id },
  }]
}

/**
 * Desde qué hora se avisa de quien no ha rellenado el wellness. Se rellena al
 * levantarse: a las nueve de la mañana casi nadie lo tiene, y avisar entonces
 * sería avisar todos los días. (No estaba en el guion.)
 */
export const HORA_WELLNESS = 12

export function consejosDelWellness(d: {
  hora: number; hoy: string
  equipo: { id: number; nombre: string | null; conCuenta: boolean; ultimoWellness: string | null }[]
}): Consejo[] {
  if (d.hora < HORA_WELLNESS) return []
  const faltan = d.equipo.filter(x => x.conCuenta && soloDia(x.ultimoWellness) !== d.hoy)
  if (!faltan.length) return []
  const uno = faltan.length === 1
  return [{
    zona: 'wellness', regla: 'sin-hoy', sujeto: 0, anclas: ['well.sin-hoy'],
    titulo: uno ? frase(nombreCorto(faltan[0].nombre)) + ' no lo ha rellenado hoy' : faltan.length + ' deportistas no lo han rellenado hoy',
    texto: 'Sin él no ves cómo ' + (uno ? 'llega' : 'llegan') + ' a la sesión. Recuérdaselo por Comunicación.',
    boton: 'Ver quiénes', accion: { pulsar: 'well.sin-hoy' },
  }]
}

/** Las sesiones hechas sin su RPE se miran en las cuatro últimas semanas. */
const DIAS_SIN_RPE = 28

/**
 * Carga: sesiones hechas sin el RPE del atleta. La app no las deja a cero —
 * usa el RPE previsto—, así que el guion («sin RPE no hay carga») no era
 * verdad, y su botón «Ver cuáles» no tenía adónde llevar: la carga diaria es
 * una gráfica. Se le escribe, que es lo que pide el texto.
 */
export function consejosDeCarga(d: {
  id: number; conCuenta: boolean; hoy: string
  sesiones: { fecha_sesion: string | null; estado?: string | null; rpe_reportado?: number | null }[]
}): Consejo[] {
  if (!d.conCuenta) return []
  const desde = sumarDias(d.hoy, -DIAS_SIN_RPE)
  const n = d.sesiones.filter(s => {
    const f = soloDia(s.fecha_sesion)
    return s.estado === 'Realizada' && !s.rpe_reportado && f >= desde && f <= d.hoy
  }).length
  if (!n) return []
  return [{
    zona: 'carga', regla: 'sin-rpe', sujeto: d.id, anclas: ['carga.forma', 'carga.vistas'],
    titulo: n === 1 ? 'Una sesión hecha no tiene su RPE' : n + ' sesiones hechas no tienen su RPE',
    texto: 'Su carga va con el RPE previsto, no con el que sintió. Pídele que lo apunte al terminar.',
    boton: 'Escribirle', accion: { ir: '/comunicacion?dep=' + d.id },
  }]
}

/** Lo que te contó al cerrar una sesión, sin leer desde hace dos días o más. */
const DIAS_SIN_RESPONDER = 2

export function consejosDeComunicacion(d: {
  hoy: string
  feedback: { idDeportista: number; nombre: string | null; fecha: string; leido: boolean }[]
}): Consejo[] {
  /* El más antiguo de cada uno, y primero quien más lleva esperando. */
  const masViejo = new Map<number, (typeof d.feedback)[number]>()
  for (const f of d.feedback) {
    const dias = diasDesde(f.fecha, d.hoy)
    if (f.leido || dias == null || dias < DIAS_SIN_RESPONDER) continue
    const antes = masViejo.get(f.idDeportista)
    if (!antes || f.fecha < antes.fecha) masViejo.set(f.idDeportista, f)
  }
  return [...masViejo.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(f => ({
    zona: 'comunicacion' as const, regla: 'feedback', sujeto: f.idDeportista, anclas: ['com.conv:' + f.idDeportista],
    titulo: frase(nombreCorto(f.nombre)) + ' te contó cómo le fue',
    texto: 'Lleva ' + diasDesde(f.fecha, d.hoy) + ' días sin respuesta.',
    boton: 'Responder', accion: { pulsar: 'com.conv:' + f.idDeportista },
  }))
}

/** «19 de agosto». */
const diaYMes = (iso: string): string => Number(iso.slice(8, 10)) + ' de ' + MESES_LARGOS[Number(iso.slice(5, 7)) - 1]

/** Cobros: lo que debe de meses anteriores (lib/cobros: saldoDe y vencidoDesde). */
export function consejosDeCobros(d: {
  filas: { id: number; nombre: string | null; atrasado: number; desde: string | null }[]
}): Consejo[] {
  return d.filas.filter(f => f.atrasado > 0).map(f => ({
    zona: 'cobros' as const, regla: 'vencido', sujeto: f.id, anclas: ['cobros.dep:' + f.id],
    titulo: frase(nombreCorto(f.nombre)) + ' tiene ' + eur(f.atrasado) + (f.atrasado === 1 ? ' vencido' : ' vencidos'),
    texto: f.desde && fechaValida(f.desde) ? 'Desde el ' + diaYMes(f.desde) + '.' : 'Es de meses anteriores.',
    boton: 'Ver su libreta', accion: { pulsar: 'cobros.abrir:' + f.id },
  }))
}

/* ---------------------------------------------------------------
   El deportista (fase 4). Solo dos: «Hoy» ya pide el wellness y el
   reloj por su cuenta. Su botón los calla un día y no siete: lo que
   piden se acaba al hacerlo, y si vuelve a pasar (otra sesión sin
   cerrar, otro mensaje) tiene que poder decirlo.
   --------------------------------------------------------------- */

/** Sesiones: las de las dos últimas semanas que siguen sin cerrar (la misma cuenta que el calendario del entrenador). */
export function consejosDeMisSesiones(d: {
  id: number
  hoy: string
  conEntrenador: boolean
  sesiones: { id: number; fecha_sesion: string | null; estado?: string | null }[]
}): Consejo[] {
  const desde = sumarDias(d.hoy, -DIAS_SIN_HACER)
  const sin = d.sesiones
    .map(s => ({ id: s.id, f: soloDia(s.fecha_sesion), estado: s.estado }))
    .filter(s => s.f >= desde && s.f < d.hoy && s.estado !== 'Realizada' && s.estado !== 'Cancelada')
    .sort((a, b) => a.f.localeCompare(b.f) || a.id - b.id)
  if (!sin.length) return []
  const n = sin.length, como = n === 1 ? 'cómo fue' : 'cómo fueron'
  return [{
    zona: 'd-sesiones', regla: 'sin-cerrar', sujeto: d.id,
    /* La lista empieza hoy: si la sesión no está a la vista, brilla el cambio de vista. */
    anclas: ['dses.s:' + sin[0].id, 'dses.vistas'],
    titulo: n === 1 ? 'Tienes 1 sesión sin cerrar' : 'Tienes ' + n + ' sesiones sin cerrar',
    texto: d.conEntrenador
      ? 'Cuéntale a tu entrenador ' + como + ': sin eso no sabe cómo te sienta lo que te manda.'
      : 'Cuenta ' + como + ': sin eso tu plan no sabe cómo te sienta lo que haces.',
    boton: n === 1 ? 'Cerrarla' : 'Cerrar la primera',
    accion: { ir: '/sesion/' + sin[0].id },
    vuelveEnDias: 1,
  }]
}

/** Hoy: lo que su entrenador le ha escrito y no ha leído. */
export function consejosDeHoy(d: { id: number; sinLeer: number }): Consejo[] {
  if (d.sinLeer <= 0) return []
  return [{
    zona: 'd-hoy', regla: 'sin-leer', sujeto: d.id,
    /* El chat está en «Más»; en el ordenador, en el menú. */
    anclas: ['dnav.mas', 'menu'],
    titulo: 'Tu entrenador te ha escrito',
    texto: d.sinLeer === 1 ? 'Tienes 1 mensaje sin leer.' : 'Tienes ' + d.sinLeer + ' mensajes sin leer.',
    boton: d.sinLeer === 1 ? 'Leerlo' : 'Leerlos',
    accion: { ir: '/chat/' + d.id },
    vuelveEnDias: 1,
  }]
}
