import { describe, it, expect } from 'vitest'
import {
  soloDia, fechaValida, aISO, sumarDias, diasEntre, sumarSemanas, semanasEntre,
  indiceDia, lunesDe, proximoLunes, fechaLarga, fechaLargaCompleta, rangoLegible, calcularEdad,
} from './fechas'

/* 2026-08-17 lunes … 2026-08-23 domingo. */
const L = '2026-08-17', X = '2026-08-19', D = '2026-08-23'

describe('lo básico', () => {
  it('recorta la hora', () => {
    expect(soloDia('2026-08-19T10:30:00')).toBe(X)
    expect(soloDia(null)).toBe('')
  })

  it('reconoce lo que es una fecha y lo que no', () => {
    expect(fechaValida(X)).toBe(true)
    expect(fechaValida('2026-08-19T10:00:00')).toBe(true)
    expect(fechaValida('19/08/2026')).toBe(false)
    expect(fechaValida('2026-13-01')).toBe(false)
    expect(fechaValida(null)).toBe(false)
    expect(fechaValida(20260819)).toBe(false)
  })

  it('suma y resta días sin saltarse ninguno', () => {
    expect(sumarDias(X, 1)).toBe('2026-08-20')
    expect(sumarDias(X, -1)).toBe('2026-08-18')
    expect(sumarDias(X, 0)).toBe(X)
  })

  /* Cambio de mes, de año y bisiesto: los tres sitios donde la aritmética de
     fechas escrita a mano se rompe. */
  it('cruza meses, años y el 29 de febrero', () => {
    expect(sumarDias('2026-08-31', 1)).toBe('2026-09-01')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('cuenta los días que hay en medio', () => {
    expect(diasEntre(L, D)).toBe(6)
    expect(diasEntre(D, L)).toBe(-6)
    expect(diasEntre(L, L)).toBe(0)
  })

  /* El cambio de hora es el clásico que descuadra un contador de días: la
     madrugada del 25 de octubre de 2026 dura 25 horas. En UTC no existe. */
  it('el cambio de hora no descuadra la cuenta', () => {
    expect(diasEntre('2026-10-24', '2026-10-26')).toBe(2)
    expect(diasEntre('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('semanas', () => {
    expect(sumarSemanas(L, 2)).toBe('2026-08-31')
    expect(semanasEntre(L, '2026-09-07')).toBe(3)
  })
})

describe('la semana empieza en lunes', () => {
  it('lunes es 0 y domingo es 6', () => {
    expect(indiceDia(L)).toBe(0)
    expect(indiceDia(X)).toBe(2)
    expect(indiceDia(D)).toBe(6)
  })

  it('cualquier día cae en su lunes', () => {
    expect(lunesDe(X)).toBe(L)
    expect(lunesDe(L)).toBe(L)
  })

  /* EL QUE SIEMPRE SE ROMPE. En JavaScript el domingo es el día 0, así que un
     `1 - getDay()` ingenuo lo manda a la semana SIGUIENTE y la sesión del
     domingo desaparece de la vista de esa semana. */
  it('el domingo cierra su semana, no abre la siguiente', () => {
    expect(lunesDe(D)).toBe(L)
    expect(lunesDe('2026-08-24')).toBe('2026-08-24')
  })

  it('el lunes que viene nunca es hoy, aunque hoy sea lunes', () => {
    expect(proximoLunes(L)).toBe('2026-08-24')
    expect(proximoLunes(X)).toBe('2026-08-24')
    expect(proximoLunes(D)).toBe('2026-08-24')
  })
})

describe('para leerlo', () => {
  it('la fecha larga lleva su día de la semana', () => {
    expect(fechaLarga(X)).toBe('Miércoles 19 ago')
    expect(fechaLarga(D)).toBe('Domingo 23 ago')
  })

  /* Un guion en vez de reventar: en una ficha vieja puede no haber fecha, y una
     pantalla en blanco por eso sería absurdo. */
  it('sin fecha no revienta', () => {
    expect(fechaLarga(null)).toBe('')
    expect(fechaLarga('')).toBe('')
    expect(fechaLarga('lo que sea')).toBe('lo que sea')
  })

  /* DOS formatos largos y es a propósito, no un duplicado que se escapó: la
     cabecera del editor va apretada y usa el mes corto; el briefing que lee el
     atleta lo escribe entero porque ahí se lee como una frase. Se comparte la
     maquinaria, no el formato. */
  it('el formato completo escribe el mes entero', () => {
    expect(fechaLargaCompleta(X)).toBe('Miércoles 19 de agosto')
  })

  it('los dos formatos coinciden en el día y difieren en el mes', () => {
    expect(fechaLarga(X).startsWith('Miércoles 19')).toBe(true)
    expect(fechaLargaCompleta(X).startsWith('Miércoles 19')).toBe(true)
    expect(fechaLarga(X)).not.toBe(fechaLargaCompleta(X))
  })

  it('el rango de una semana', () => {
    expect(rangoLegible(L)).toBe('17–23 ago')
  })

  it('y cuando cambia de mes se dice el mes dos veces', () => {
    expect(rangoLegible('2026-08-31')).toBe('31 ago – 6 sep')
  })
})

describe('la edad', () => {
  it('los años cumplidos', () => {
    expect(calcularEdad('1990-01-15', '2026-08-22')).toBe(36)
  })

  /* El caso que la aritmética ingenua falla: aún no ha llegado el cumpleaños. */
  it('no cuenta el año si el cumpleaños no ha llegado', () => {
    expect(calcularEdad('1990-12-15', '2026-08-22')).toBe(35)
  })

  it('el día del cumpleaños ya cuenta', () => {
    expect(calcularEdad('1990-08-22', '2026-08-22')).toBe(36)
    expect(calcularEdad('1990-08-23', '2026-08-22')).toBe(35)
  })

  /* Null, no 0 ni NaN: «no lo sabemos» y «tiene cero años» son cosas distintas,
     y con 0 la ficha diría que el atleta es un recién nacido. */
  it('sin fecha de nacimiento devuelve null, no cero', () => {
    expect(calcularEdad(null)).toBeNull()
    expect(calcularEdad('')).toBeNull()
  })
})

describe('«hoy» es local y el resto es UTC', () => {
  /* LA ÚNICA EXCEPCIÓN DEL FICHERO. A las 00:30 en Madrid, en UTC todavía es
     ayer: si «hoy» saliera de UTC, el atleta abriría la app de madrugada y
     vería el día anterior. Por eso aISO lee el reloj local. */
  it('aISO da el día que marca el reloj de quien está delante', () => {
    const medianoche = new Date(2026, 7, 23, 0, 30)   // 23 de agosto, 00:30 local
    expect(aISO(medianoche)).toBe('2026-08-23')
  })

  it('y también al final del día', () => {
    expect(aISO(new Date(2026, 7, 23, 23, 45))).toBe('2026-08-23')
  })

  /* En cambio la aritmética NO puede depender del huso: es la que decidía en
     qué semana cae una sesión, y ahí un día de más es una sesión que
     desaparece. */
  it('la aritmética da igual desde dónde se mire', () => {
    expect(sumarDias('2026-08-19', 1)).toBe('2026-08-20')
    expect(lunesDe('2026-08-23')).toBe('2026-08-17')
  })
})
