// ============================================================
// Cobros: lo que le corresponde pagar a cada uno y lo que ha pagado
// ============================================================
//
// La libreta del entrenador dentro de TRIPULSE. Es un REGISTRO, no una
// facturación: no emite facturas, no calcula IVA y no cobra. Eso depende de la
// situación fiscal de quien la usa y es otra conversación.
//
// CARGOS Y COBROS, NO UNA CASILLA DE «PAGADO». Esa casilla no aguanta la
// realidad de un mes cualquiera: un pago a medias, un mes en el que además le
// cobras un test, o alguien que te paga dos meses juntos. Con dos listas —lo que
// le corresponde y lo que ha entregado— todo eso sale solo, y el saldo es una
// resta que no puede mentir. Es el mismo modelo que la Libreta de Clases, donde
// lleva un curso funcionando.
//
// SE COBRA POR VENCIDO. La cuota de septiembre se carga el ÚLTIMO día de
// septiembre, no el primero: así es como cobra el usuario, y de eso depende
// cuándo empieza a deber alguien. Está en un solo sitio (`fechaDelCargo`) para
// que cambiarlo algún día sea cambiar una línea.

import { hoyISO, soloDia } from './fechas'

/** Cómo se le cobra a alguien. */
export type TipoTarifa = 'mensual' | 'sesion' | 'unico'
/** Por dónde llegó el dinero. */
export type MedioPago = 'bizum' | 'transferencia' | 'efectivo' | 'otro'

export const MEDIOS: { id: MedioPago; et: string }[] = [
  { id: 'bizum', et: 'Bizum' },
  { id: 'transferencia', et: 'Transferencia' },
  { id: 'efectivo', et: 'Efectivo' },
  { id: 'otro', et: 'Otro' },
]

export interface Tarifa {
  id: number
  id_deportista: number
  tipo: TipoTarifa
  /** Al mes, o por sesión. En los pagos únicos no se usa. */
  importe: number
  /** Desde qué mes se le aplica, en YYYY-MM-DD. */
  desde: string
  /** Hasta cuándo. null = sigue. */
  hasta?: string | null
}

export interface Cargo {
  id: number
  id_deportista: number
  /** Cuándo le corresponde pagarlo. */
  fecha: string
  concepto: string
  importe: number
  /** A qué mes pertenece, YYYY-MM. Lo que agrupa la pantalla. */
  mes: string
  tipo: TipoTarifa
}

export interface Cobro {
  id: number
  id_deportista: number
  fecha: string
  importe: number
  medio: MedioPago
  nota?: string | null
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Redondeo a céntimos: sumar decimales sueltos acaba en 119,99999999. */
const dinero = (n: number): number => Math.round(n * 100) / 100

/** «2026-09» → «2026-09-30». El último día, que es cuando se cobra. */
export function fechaDelCargo(mes: string): string {
  const [a, m] = String(mes).split('-').map(Number)
  if (!a || !m) return ''
  /* El día 0 del mes siguiente es el último del actual, y así no hay que saberse
     cuáles tienen 31 ni acordarse de los bisiestos. */
  const d = new Date(Date.UTC(a, m, 0))
  return d.toISOString().slice(0, 10)
}

/** El mes de una fecha: «2026-09-14» → «2026-09». */
export const mesDe = (fecha: string): string => String(fecha || '').slice(0, 7)

/** El mes de hoy. */
export const mesActual = (hoy: string = hoyISO()): string => mesDe(hoy)

/** «2026-09» → «2026-08», y al revés con +1. */
export function moverMes(mes: string, meses: number): string {
  const [a, m] = String(mes).split('-').map(Number)
  if (!a || !m) return mes
  const d = new Date(Date.UTC(a, m - 1 + meses, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * La tarifa que se le aplicaba a alguien en un mes dado.
 *
 * Se mira contra el ÚLTIMO día del mes, que es cuando se cobra: quien empieza el
 * 20 de septiembre paga septiembre. Y con varias tarifas gana la más reciente
 * que ya había empezado, para que subir un precio no reescriba el pasado.
 */
export function tarifaEn(tarifas: Tarifa[] | null | undefined, mes: string): Tarifa | null {
  const dia = fechaDelCargo(mes)
  if (!dia) return null
  const valen = (tarifas || [])
    .filter(t => soloDia(t.desde) <= dia && (!t.hasta || soloDia(t.hasta) >= dia))
    .sort((a, b) => soloDia(a.desde) < soloDia(b.desde) ? 1 : -1)
  return valen[0] || null
}

/**
 * El cargo de la cuota de un mes, si le toca.
 *
 * Devuelve null cuando no hay tarifa mensual: los que pagan por sesión o por
 * cosas sueltas no tienen cuota que generar, y crearles un cargo de 0 € les
 * dejaría una línea vacía todos los meses.
 */
export function cargoDeCuota(
  tarifas: Tarifa[] | null | undefined,
  mes: string,
  idDeportista: number,
): Omit<Cargo, 'id'> | null {
  const t = tarifaEn(tarifas, mes)
  if (!t || t.tipo !== 'mensual' || num(t.importe) <= 0) return null
  return {
    id_deportista: idDeportista,
    fecha: fechaDelCargo(mes),
    concepto: 'Cuota de ' + mes,
    importe: dinero(num(t.importe)),
    mes,
    tipo: 'mensual',
  }
}

export interface SaldoDe {
  /** Todo lo que se le ha cargado alguna vez. */
  cargado: number
  /** Todo lo que ha pagado. */
  pagado: number
  /** Lo que debe. Negativo = ha pagado de más (va adelantado). */
  saldo: number
  /** Lo que se le cargó en el mes que se está mirando. */
  delMes: number
  /** Lo que pagó dentro de ese mes. */
  pagadoEnElMes: number
  /** Debe algo de meses ANTERIORES al que se mira. */
  atrasado: number
  estado: 'al-dia' | 'previsto' | 'pendiente' | 'atrasado'
}

/**
 * Lo que debe alguien, mirando un mes.
 *
 * El saldo es de SIEMPRE y no del mes: quien te debe agosto sigue debiéndotelo
 * en septiembre, y una pantalla que solo mire el mes en curso lo perdería de
 * vista justo cuando más importa.
 *
 * `previsto` es lo que todavía no se debe: el cargo de este mes existe pero su
 * día no ha llegado. Se cobra por vencido, así que hasta el último día del mes
 * nadie está debiendo nada.
 */
export function saldoDe(
  cargos: Cargo[] | null | undefined,
  cobros: Cobro[] | null | undefined,
  mes: string,
  hoy: string = hoyISO(),
): SaldoDe {
  const cs = cargos || [], ps = cobros || []
  const cargado = dinero(cs.reduce((a, c) => a + num(c.importe), 0))
  const pagado = dinero(ps.reduce((a, p) => a + num(p.importe), 0))
  const saldo = dinero(cargado - pagado)

  const delMes = dinero(cs.filter(c => c.mes === mes).reduce((a, c) => a + num(c.importe), 0))
  const pagadoEnElMes = dinero(ps.filter(p => mesDe(p.fecha) === mes).reduce((a, p) => a + num(p.importe), 0))

  /* Lo de antes de este mes: cargos ya vencidos de meses anteriores menos todo
     lo pagado. Es lo que distingue «aún no ha pagado septiembre» de «me debe
     agosto», que son dos conversaciones muy distintas. */
  const deAntes = dinero(cs.filter(c => c.mes < mes).reduce((a, c) => a + num(c.importe), 0))
  const atrasado = dinero(Math.max(0, deAntes - pagado))

  let estado: SaldoDe['estado'] = 'al-dia'
  if (atrasado > 0) estado = 'atrasado'
  else if (saldo > 0) {
    /* Todo lo que debe es de este mes: ¿ha llegado ya su día? */
    const vencido = cs.some(c => c.mes === mes && soloDia(c.fecha) <= hoy)
    estado = vencido ? 'pendiente' : 'previsto'
  }

  return { cargado, pagado, saldo, delMes, pagadoEnElMes, atrasado, estado }
}

export interface ResumenMes {
  /** La suma de lo cargado ese mes a todo el mundo. */
  delMes: number
  /** Lo que se ha cobrado dentro de ese mes. */
  cobrado: number
  /** Lo que queda por cobrar de ese mes, ya vencido. */
  pendiente: number
  /** Lo que se debe de meses anteriores. */
  atrasado: number
  /** Cuántos deben algo, contando atrasos. */
  deben: number
}

/** Los totales de la cabecera, sumando lo de cada uno. */
export function resumenDelMes(saldos: SaldoDe[] | null | undefined): ResumenMes {
  const l = saldos || []
  const suma = (f: (s: SaldoDe) => number) => dinero(l.reduce((a, s) => a + f(s), 0))
  return {
    delMes: suma(s => s.delMes),
    cobrado: suma(s => s.pagadoEnElMes),
    /* Solo lo que de verdad se debe: lo «previsto» todavía no lo debe nadie, y
       meterlo aquí haría que el total pendiente subiera el día 1 de cada mes sin
       que hubiera pasado nada. */
    pendiente: suma(s => (s.estado === 'pendiente' || s.estado === 'atrasado' ? Math.max(0, s.saldo - s.atrasado) : 0)),
    atrasado: suma(s => s.atrasado),
    deben: l.filter(s => s.saldo > 0 && s.estado !== 'previsto').length,
  }
}

/** Cómo se lee un estado. */
export const TEXTO_ESTADO: Record<SaldoDe['estado'], string> = {
  'al-dia': 'Al día',
  previsto: 'Este mes',
  pendiente: 'Pendiente',
  atrasado: 'Debe',
}
