import { describe, it, expect } from 'vitest'
import {
  fechaDelCargo, mesDe, moverMes, tarifaEn, cargoDeCuota, saldoDe, resumenDelMes,
  type Tarifa, type Cargo, type Cobro,
} from './cobros'

const tarifa = (o: Partial<Tarifa> = {}): Tarifa =>
  ({ id: 1, id_deportista: 7, tipo: 'mensual', importe: 120, desde: '2026-01-01', ...o })
const cargo = (o: Partial<Cargo> = {}): Cargo =>
  ({ id: 1, id_deportista: 7, fecha: '2026-09-30', concepto: 'Cuota', importe: 120, mes: '2026-09', tipo: 'mensual', ...o })
const cobro = (o: Partial<Cobro> = {}): Cobro =>
  ({ id: 1, id_deportista: 7, fecha: '2026-09-05', importe: 120, medio: 'bizum', ...o })

describe('fechaDelCargo — se cobra por vencido', () => {
  /* La cuota de septiembre se carga el 30, no el 1: es como cobra el usuario, y
     de eso depende cuándo empieza a deber alguien. */
  it('es el último día del mes', () => {
    expect(fechaDelCargo('2026-09')).toBe('2026-09-30')
    expect(fechaDelCargo('2026-01')).toBe('2026-01-31')
    expect(fechaDelCargo('2026-04')).toBe('2026-04-30')
  })

  it('acierta con febrero, incluido el bisiesto', () => {
    expect(fechaDelCargo('2026-02')).toBe('2026-02-28')
    expect(fechaDelCargo('2028-02')).toBe('2028-02-29')
  })

  it('con basura no inventa una fecha', () => {
    expect(fechaDelCargo('')).toBe('')
    expect(fechaDelCargo('pepe')).toBe('')
  })
})

describe('moverMes', () => {
  it('va y viene, y cruza el año', () => {
    expect(moverMes('2026-09', -1)).toBe('2026-08')
    expect(moverMes('2026-01', -1)).toBe('2025-12')
    expect(moverMes('2026-12', 1)).toBe('2027-01')
  })
  it('mesDe recorta la fecha', () => {
    expect(mesDe('2026-09-14')).toBe('2026-09')
  })
})

describe('tarifaEn', () => {
  it('la que estaba vigente ese mes', () => {
    expect(tarifaEn([tarifa()], '2026-09')?.importe).toBe(120)
  })

  /* Subir un precio no puede reescribir el pasado: en agosto cobraba 100. */
  it('con varias, la más reciente que ya había empezado', () => {
    const ts = [tarifa({ id: 1, importe: 100, desde: '2026-01-01' }), tarifa({ id: 2, importe: 120, desde: '2026-09-01' })]
    expect(tarifaEn(ts, '2026-08')?.importe).toBe(100)
    expect(tarifaEn(ts, '2026-09')?.importe).toBe(120)
    expect(tarifaEn(ts, '2026-12')?.importe).toBe(120)
  })

  /* Se mira contra el último día porque es cuando se cobra: quien empieza el 20
     de septiembre paga septiembre entero. */
  it('quien entra a mitad de mes paga ese mes', () => {
    expect(tarifaEn([tarifa({ desde: '2026-09-20' })], '2026-09')?.importe).toBe(120)
    expect(tarifaEn([tarifa({ desde: '2026-09-20' })], '2026-08')).toBeNull()
  })

  it('una tarifa terminada deja de valer', () => {
    const t = [tarifa({ desde: '2026-01-01', hasta: '2026-08-31' })]
    expect(tarifaEn(t, '2026-08')?.importe).toBe(120)
    expect(tarifaEn(t, '2026-09')).toBeNull()
  })

  it('sin tarifas, nada', () => {
    expect(tarifaEn([], '2026-09')).toBeNull()
    expect(tarifaEn(null, '2026-09')).toBeNull()
  })
})

describe('cargoDeCuota', () => {
  it('genera la cuota del mes con su fecha de vencimiento', () => {
    const c = cargoDeCuota([tarifa()], '2026-09', 7)!
    expect(c.importe).toBe(120)
    expect(c.fecha).toBe('2026-09-30')
    expect(c.mes).toBe('2026-09')
    expect(c.tipo).toBe('mensual')
  })

  /* Quien paga por sesión o por cosas sueltas no tiene cuota: crearle un cargo
     de 0 € le dejaría una línea vacía todos los meses. */
  it('quien no tiene cuota mensual no genera nada', () => {
    expect(cargoDeCuota([tarifa({ tipo: 'sesion', importe: 10 })], '2026-09', 7)).toBeNull()
    expect(cargoDeCuota([tarifa({ tipo: 'unico' })], '2026-09', 7)).toBeNull()
    expect(cargoDeCuota([tarifa({ importe: 0 })], '2026-09', 7)).toBeNull()
    expect(cargoDeCuota([], '2026-09', 7)).toBeNull()
  })
})

describe('saldoDe', () => {
  it('lo pagado entero deja al día', () => {
    const s = saldoDe([cargo()], [cobro()], '2026-09', '2026-09-30')
    expect(s.saldo).toBe(0)
    expect(s.estado).toBe('al-dia')
  })

  it('un pago a medias deja lo que falta', () => {
    const s = saldoDe([cargo()], [cobro({ importe: 60 })], '2026-09', '2026-09-30')
    expect(s.saldo).toBe(60)
    expect(s.estado).toBe('pendiente')
  })

  /* Se cobra por vencido: el día 14 nadie debe la cuota de septiembre todavía.
     Sin esto, la pantalla diría que te deben desde el día 1 de cada mes. */
  it('antes de que venza, es «previsto» y no «pendiente»', () => {
    const s = saldoDe([cargo()], [], '2026-09', '2026-09-14')
    expect(s.saldo).toBe(120)
    expect(s.estado).toBe('previsto')
  })

  it('el día que vence, ya es pendiente', () => {
    expect(saldoDe([cargo()], [], '2026-09', '2026-09-30').estado).toBe('pendiente')
  })

  /* Quien te debe agosto sigue debiéndotelo en septiembre: una pantalla que solo
     mire el mes en curso lo pierde de vista justo cuando más importa. */
  it('lo de meses anteriores sale como atrasado', () => {
    const s = saldoDe(
      [cargo({ id: 1, mes: '2026-08', fecha: '2026-08-31', importe: 75 }), cargo({ id: 2 })],
      [], '2026-09', '2026-09-14',
    )
    expect(s.atrasado).toBe(75)
    expect(s.saldo).toBe(195)
    expect(s.estado).toBe('atrasado')
  })

  it('lo que paga va primero a lo más viejo', () => {
    const s = saldoDe(
      [cargo({ id: 1, mes: '2026-08', fecha: '2026-08-31', importe: 75 }), cargo({ id: 2 })],
      [cobro({ importe: 75 })], '2026-09', '2026-09-14',
    )
    expect(s.atrasado).toBe(0)
    expect(s.estado).toBe('previsto')
  })

  it('quien paga de más queda en negativo, no en cero', () => {
    const s = saldoDe([cargo()], [cobro({ importe: 240 })], '2026-09', '2026-09-30')
    expect(s.saldo).toBe(-120)
    expect(s.estado).toBe('al-dia')
  })

  it('separa lo del mes de lo de siempre', () => {
    const s = saldoDe(
      [cargo({ id: 1, mes: '2026-08', fecha: '2026-08-31', importe: 75 }), cargo({ id: 2, importe: 120 })],
      [cobro({ id: 1, fecha: '2026-08-10', importe: 75 }), cobro({ id: 2, fecha: '2026-09-03', importe: 60 })],
      '2026-09', '2026-09-30',
    )
    expect(s.delMes).toBe(120)
    expect(s.pagadoEnElMes).toBe(60)
    expect(s.cargado).toBe(195)
    expect(s.pagado).toBe(135)
    expect(s.saldo).toBe(60)
  })

  /* Sumar decimales sueltos acaba en 119,99999999 y eso se ve en pantalla. */
  it('no deja decimales sueltos', () => {
    const s = saldoDe(
      [cargo({ importe: 33.33 }), cargo({ id: 2, importe: 33.33 }), cargo({ id: 3, importe: 33.34 })],
      [cobro({ importe: 100 })], '2026-09', '2026-09-30',
    )
    expect(s.cargado).toBe(100)
    expect(s.saldo).toBe(0)
  })

  it('sin nada, todo a cero y al día', () => {
    const s = saldoDe([], [], '2026-09')
    expect(s.saldo).toBe(0)
    expect(s.estado).toBe('al-dia')
    expect(s.delMes).toBe(0)
  })
})

describe('resumenDelMes', () => {
  const de = (cargos: Cargo[], cobros: Cobro[]) => saldoDe(cargos, cobros, '2026-09', '2026-09-30')

  it('suma lo de todos', () => {
    const r = resumenDelMes([
      de([cargo()], [cobro()]),
      de([cargo({ id: 2 })], [cobro({ id: 2, importe: 60 })]),
    ])
    expect(r.delMes).toBe(240)
    expect(r.cobrado).toBe(180)
    expect(r.pendiente).toBe(60)
    expect(r.deben).toBe(1)
  })

  /* Lo «previsto» no lo debe nadie todavía: si contara, el total pendiente
     subiría el día 1 de cada mes sin que hubiera pasado nada. */
  it('lo que aún no ha vencido no cuenta como pendiente', () => {
    const r = resumenDelMes([saldoDe([cargo()], [], '2026-09', '2026-09-14')])
    expect(r.pendiente).toBe(0)
    expect(r.deben).toBe(0)
    expect(r.delMes).toBe(120)
  })

  it('el atraso va por su lado', () => {
    const r = resumenDelMes([
      de([cargo({ id: 1, mes: '2026-08', fecha: '2026-08-31', importe: 75 }), cargo({ id: 2 })], []),
    ])
    expect(r.atrasado).toBe(75)
    expect(r.pendiente).toBe(120)
    expect(r.deben).toBe(1)
  })

  it('sin nadie, todo a cero', () => {
    const r = resumenDelMes([])
    expect(r).toEqual({ delMes: 0, cobrado: 0, pendiente: 0, atrasado: 0, deben: 0 })
  })
})
