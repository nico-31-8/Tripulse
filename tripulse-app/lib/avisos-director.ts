// ============================================================
// Los avisos del director, puestos en palabras
// ============================================================
// La base guarda QUÉ pasó (tipo, sesión, día y una lista de cambios: ver
// aviso_director en supabase/director-1-base.sql) y aquí se escribe la frase.
// Un solo sitio para las tres pantallas que los enseñan: el panel del
// entrenador, el del deportista y «Mis entrenadores» del director.
//
// La misma fila se lee distinto según quién la mire: al entrenador se le dice
// «Pedro cambió la sesión del viernes 16 de Ana»; a Ana, «Tu sesión del viernes
// 16 ha cambiado», firmado por quien lo hizo.

export type TipoAviso = 'sesion' | 'plan' | 'test' | 'zonas' | 'ficha' | 'salud' | 'acceso' | 'vinculo'

/** Una fila de mis_avisos_director(). */
export type AvisoDirector = {
  id: number
  tipo: TipoAviso
  de: string | null
  de_nombre: string | null
  sobre: string | null
  sobre_nombre: string | null
  id_deportista: number | null
  deportista_nombre: string | null
  id_sesion: number | null
  fecha: string | null
  cambios: string[] | null
  creado_en: string
  actualizado_en: string
  leido_en: string | null
}

/** Quién lee el aviso. El director recibe los de acceso y relación; esos se
 *  escriben igual para cualquiera, así que no necesita un papel propio. */
export type Papel = 'entrenador' | 'deportista'

export type TextoAviso = { titulo: string; detalle: string[]; firma?: string }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

function enUTC(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
}

/** «hoy», «mañana», «ayer», «el viernes 16» o, si queda lejos, «el viernes 16
 *  de octubre». Devuelve el día SIN artículo cuando se pide (`conArticulo`). */
export function diaDe(fecha: string | null, hoyISO: string, conArticulo = true): string {
  const f = fecha ? enUTC(fecha) : null
  const h = enUTC(hoyISO)
  if (!f || !h) return 'un día'
  const dif = Math.round((f.getTime() - h.getTime()) / 86400000)
  if (dif === 0) return 'hoy'
  if (dif === 1) return 'mañana'
  if (dif === -1) return 'ayer'
  const base = DIAS[f.getUTCDay()] + ' ' + f.getUTCDate()
  const conMes = Math.abs(dif) > 6 || f.getUTCMonth() !== h.getUTCMonth() ? base + ' de ' + MESES[f.getUTCMonth()] : base
  return conArticulo ? 'el ' + conMes : conMes
}

/** «la sesión del viernes 16», «la sesión de hoy». */
function laSesionDel(fecha: string | null, hoyISO: string): string {
  const d = diaDe(fecha, hoyISO)
  return d.startsWith('el ') ? 'la sesión del ' + d.slice(3) : 'la sesión de ' + d
}

/** «tu sesión del viernes 16», «tu sesión de hoy». */
const tuSesionDel = (fecha: string | null, hoyISO: string) => laSesionDel(fecha, hoyISO).replace(/^la sesión/, 'tu sesión')

/** Hacia dónde se movió: «al viernes 16», «para hoy». */
function alDia(fecha: string | null, hoyISO: string): string {
  const d = diaDe(fecha, hoyISO)
  return d.startsWith('el ') ? 'al ' + d.slice(3) : 'para ' + d
}

const nombre = (n: string | null | undefined, porDefecto = 'Alguien') => (n && n.trim()) || porDefecto

const DETALLE_SESION: Record<string, string> = {
  movida: 'La ha movido de día',
  bloques: 'Ha cambiado los bloques',
  ejercicios: 'Ha cambiado los ejercicios',
  datos: 'Ha cambiado los datos de la sesión',
  estado: 'Ha cambiado si está hecha o planificada',
  lo_que_hizo: 'Ha corregido lo que se hizo',
  recuperada: 'La ha sacado de la papelera',
}
const DETALLE_PLAN: Record<string, string> = {
  macrociclo: 'El macrociclo',
  mesociclo: 'Los mesociclos',
  microciclo: 'Las semanas del plan',
  semana_bloqueada: 'Las semanas bloqueadas',
  objetivo_series: 'Los objetivos de series',
  competicion: 'Las competiciones',
}
const DETALLE_FICHA: Record<string, string> = {
  deportista: 'Los datos de la ficha',
  valoracion_tecnica_mesociclo: 'La valoración técnica',
}
const DETALLE_SALUD: Record<string, string> = {
  anamnesis: 'La anamnesis',
  wellness: 'El wellness',
  registro_peso: 'El peso',
}

function detalles(cambios: string[], tabla: Record<string, string>, quitar: string[] = []): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const c of cambios) {
    if (quitar.includes(c) || vistos.has(c)) continue
    vistos.add(c)
    if (tabla[c]) out.push(tabla[c])
  }
  return out
}

export function textoAviso(a: AvisoDirector, papel: Papel, hoyISO: string): TextoAviso {
  const cambios = a.cambios || []
  const de = nombre(a.de_nombre)
  const dep = nombre(a.deportista_nombre, 'tu deportista')
  const firma = papel === 'deportista' && a.tipo !== 'acceso' && a.tipo !== 'vinculo'
    ? 'Lo ha hecho ' + de + ', desde la dirección.'
    : undefined

  switch (a.tipo) {
    case 'sesion': {
      const dia = diaDe(a.fecha, hoyISO)
      if (cambios.includes('borrada')) {
        return papel === 'entrenador'
          ? { titulo: de + ' quitó ' + laSesionDel(a.fecha, hoyISO) + ' de ' + dep, detalle: [] }
          : { titulo: 'Se ha quitado ' + tuSesionDel(a.fecha, hoyISO), detalle: [], firma }
      }
      if (cambios.includes('nueva')) {
        return papel === 'entrenador'
          ? { titulo: de + ' añadió una sesión ' + dia + ' a ' + dep, detalle: [] }
          : { titulo: 'Tienes una sesión nueva ' + dia, detalle: [], firma }
      }
      if (cambios.length === 1 && cambios[0] === 'lo_que_hizo') {
        return papel === 'entrenador'
          ? { titulo: de + ' corrigió lo que hizo ' + dep + ' en ' + laSesionDel(a.fecha, hoyISO), detalle: [] }
          : { titulo: 'Se ha corregido lo que hiciste en ' + tuSesionDel(a.fecha, hoyISO), detalle: [], firma }
      }
      if (cambios.includes('movida')) {
        return papel === 'entrenador'
          ? { titulo: de + ' movió una sesión de ' + dep + ' ' + alDia(a.fecha, hoyISO), detalle: detalles(cambios, DETALLE_SESION, ['movida']) }
          : { titulo: 'Una sesión tuya se ha movido ' + alDia(a.fecha, hoyISO), detalle: detalles(cambios, DETALLE_SESION, ['movida']), firma }
      }
      return papel === 'entrenador'
        ? { titulo: de + ' cambió ' + laSesionDel(a.fecha, hoyISO) + ' de ' + dep, detalle: detalles(cambios, DETALLE_SESION) }
        : { titulo: 'Tu ' + laSesionDel(a.fecha, hoyISO).replace(/^la /, '') + ' ha cambiado', detalle: detalles(cambios, DETALLE_SESION), firma }
    }
    case 'test': {
      const cuando = a.fecha ? ['Del ' + diaDe(a.fecha, hoyISO, false)] : []
      const q = cambios[cambios.length - 1] || 'nuevo'
      if (papel === 'entrenador') {
        const verbo = q === 'borrado' ? ' borró un test de ' : q === 'corregido' ? ' corrigió un test de ' : ' apuntó un test a '
        return { titulo: de + verbo + dep, detalle: cuando }
      }
      const t = q === 'borrado' ? 'Se ha borrado uno de tus tests' : q === 'corregido' ? 'Se ha corregido uno de tus tests' : 'Tienes un test nuevo apuntado'
      return { titulo: t, detalle: cuando, firma }
    }
    case 'zonas':
      return papel === 'entrenador'
        ? { titulo: de + ' cambió las zonas de ' + dep, detalle: [] }
        : { titulo: 'Tus zonas de entrenamiento han cambiado', detalle: [], firma }
    case 'plan':
      return papel === 'entrenador'
        ? { titulo: de + ' cambió la planificación de ' + dep, detalle: detalles(cambios, DETALLE_PLAN) }
        : { titulo: 'Tus competiciones han cambiado', detalle: [], firma }
    case 'ficha':
      return papel === 'entrenador'
        ? { titulo: de + ' cambió la ficha de ' + dep, detalle: detalles(cambios, DETALLE_FICHA) }
        : { titulo: 'Tu ficha ha cambiado', detalle: [], firma }
    case 'salud':
      return papel === 'entrenador'
        ? { titulo: de + ' cambió datos de salud de ' + dep, detalle: detalles(cambios, DETALLE_SALUD) }
        : { titulo: 'Tus datos de salud han cambiado', detalle: detalles(cambios, DETALLE_SALUD), firma }
    case 'acceso': {
      const q = cambios[0]
      /* Con `sobre` puesto, el aviso es para el deportista y habla de un tercero
         (el director). Sin él, es para el director. */
      if (a.sobre) {
        const quien = nombre(a.sobre_nombre, 'Un director')
        return q === 'quitado'
          ? { titulo: quien + ' ya no tiene acceso a tu plan', detalle: [] }
          : { titulo: de + ' ha dado acceso a ' + quien + ' a tu plan', detalle: [
              'Puede ver y cambiar tus sesiones, tus tests y tu salud.',
              'Vuestro chat sigue siendo solo cosa de los dos.'] }
      }
      if (q === 'denegado') return { titulo: de + ' no te ha abierto a ' + dep, detalle: [] }
      if (q === 'quitado') return { titulo: de + ' te ha cerrado a ' + dep, detalle: [] }
      return { titulo: de + ' te ha abierto a ' + dep, detalle: ['Ya puedes ver y cambiar su plan.'] }
    }
    case 'vinculo': {
      const q = cambios[0]
      const t = q === 'alta' ? de + ' se ha registrado con tu invitación: ya trabajáis juntos'
        : q === 'aceptado' ? de + ' ha aceptado trabajar contigo'
        : q === 'rechazado' ? de + ' no ha aceptado trabajar contigo'
        : q === 'retirado' ? de + ' ha retirado su solicitud'
        : de + ' ha dejado de trabajar contigo'
      return { titulo: t, detalle: [] }
    }
  }
  return { titulo: de + ' ha hecho un cambio', detalle: [] }
}

/** Los cambios de un director (lo que se avisa al entrenador y al deportista),
 *  separados de las respuestas de acceso y relación. */
export function esCambio(a: AvisoDirector): boolean {
  return a.tipo !== 'acceso' && a.tipo !== 'vinculo'
}
