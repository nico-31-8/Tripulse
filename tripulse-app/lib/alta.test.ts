import { describe, it, expect } from 'vitest'
import { PARQ, veredictoSalud, payloadAlta, puedeAvanzar, ALTA_VACIA, type EstadoAlta } from './alta'
import { altaCompleta, OPCIONES_VOLUMEN, OPCIONES_DIAS, OPCIONES_NIVEL } from './anamnesis-datos'

const todoNo = () => Object.fromEntries(PARQ.map(p => [p.campo, false]))

const lleno = (extra: Partial<EstadoAlta> = {}): EstadoAlta => ({
  ...ALTA_VACIA,
  salud: todoNo(),
  declaracion: true,
  nivel: 'Amateur competitivo',
  dias: '5–6 días',
  volumen: '8–12h',
  ...extra,
})

describe('el filtro de salud', () => {
  it('sin contestarlo todo, no está completo', () => {
    expect(veredictoSalud({}).completo).toBe(false)
    expect(veredictoSalud({ salud_cardiaca: false }).completo).toBe(false)
  })

  it('todo «no» pasa limpio', () => {
    const v = veredictoSalud(todoNo())
    expect(v.completo).toBe(true)
    expect(v.banderas).toEqual([])
    expect(v.necesitaConfirmar).toBe(false)
  })

  /* Un «no sé» no existe: `false` es una respuesta y `undefined` es no haber
     contestado. Si se confundieran, quien salta la pregunta pasaría como sano. */
  it('no contestar no es contestar que no', () => {
    expect(veredictoSalud({ salud_cardiaca: undefined }).completo).toBe(false)
  })

  it('cada «sí» levanta su bandera con lo que implica', () => {
    const v = veredictoSalud({ ...todoNo(), salud_cardiaca: true })
    expect(v.banderas).toHaveLength(1)
    expect(v.banderas[0].siEsSi).toBeTruthy()
    expect(v.necesitaConfirmar).toBe(true)
  })

  /* NO SE BLOQUEA, SE AVISA Y SE PIDE CONFIRMACION. Bloquear manda a la gente a
     contestar «no» para pasar de pantalla, y entonces la bandera no se guarda en
     ningún sitio y nadie se ha enterado de nada. Así al menos queda escrita. */
  it('una bandera roja no impide seguir, pero obliga a confirmar', () => {
    const e = lleno({ salud: { ...todoNo(), salud_cardiaca: true } })
    expect(veredictoSalud(e.salud).necesitaConfirmar).toBe(true)
    expect(puedeAvanzar(0, e)).toBe(true)
  })

  it('cada pregunta escribe en una columna distinta', () => {
    expect(new Set(PARQ.map(p => p.campo)).size).toBe(PARQ.length)
  })
})

describe('cuándo se puede pasar de paso', () => {
  it('sin la declaración firmada no se pasa del primero', () => {
    expect(puedeAvanzar(0, lleno({ declaracion: false }))).toBe(false)
    expect(puedeAvanzar(0, lleno())).toBe(true)
  })

  it('el nivel es obligatorio', () => {
    expect(puedeAvanzar(1, lleno({ nivel: '' }))).toBe(false)
  })

  it('días y horas son obligatorios: son el plan entero', () => {
    expect(puedeAvanzar(2, lleno({ dias: '' }))).toBe(false)
    expect(puedeAvanzar(2, lleno({ volumen: '' }))).toBe(false)
    expect(puedeAvanzar(2, lleno())).toBe(true)
  })

  /* Los años y la disciplina fuerte no cambian el plan, solo lo explican. Pedir
     lo que no se usa es alargar el alta a cambio de nada. */
  it('lo que no cambia el plan no se exige', () => {
    expect(puedeAvanzar(3, lleno({ anios: '', fuerte: '', debil: '' }))).toBe(true)
  })
})

describe('lo que se escribe en la base', () => {
  /* EL RIESGO REAL DE ESTA PANTALLA. Puede correr sobre una anamnesis larga ya
     rellena. Un payload con todas las columnas a null borraría el historial
     médico, las lesiones y los contactos de emergencia de alguien por haber
     pasado por aquí. Esta lista es el contrato: si alguien añade un campo, este
     test le obliga a pensarlo. */
  it('solo toca sus propios campos, ni uno más', () => {
    expect(Object.keys(payloadAlta(lleno())).sort()).toEqual([
      'anios_triatlon',
      'declaracion_responsabilidad',
      'dias_semana',
      'disciplina_debil',
      'disciplina_fuerte',
      'lesiones_dolor_cronico',
      'nivel_competitivo',
      'salud_cardiaca',
      'salud_medicacion',
      'salud_razon_medica',
      'updated_at',
      'volumen_semanal',
    ])
  })

  /* 'enviada' significa «anamnesis clínica completa» y el panel de /admin cuenta
     por ese campo. Seis respuestas no son eso. */
  it('no toca `estado`: no se hace pasar por la anamnesis completa', () => {
    expect(payloadAlta(lleno())).not.toHaveProperty('estado')
  })

  it('las banderas de salud se guardan tal cual, también los «sí»', () => {
    const p = payloadAlta(lleno({ salud: { ...todoNo(), salud_cardiaca: true } }))
    expect(p.salud_cardiaca).toBe(true)
    expect(p.salud_medicacion).toBe(false)
  })

  it('lo que no se contestó va a null, no a cadena vacía', () => {
    const p = payloadAlta(ALTA_VACIA)
    expect(p.nivel_competitivo).toBeNull()
    expect(p.salud_cardiaca).toBeNull()
  })
})

describe('el alta y el plan hablan el mismo idioma', () => {
  /* LA JUNTA ENTRE LAS DOS PIEZAS. El alta escribe texto; el planificador lo
     traduce a números. Si una cambiara sin la otra, volveríamos a las 8 horas en
     5 días para todo el mundo, y sin que nada avisara. */
  it('un alta terminada deja al plan listo para dibujarse', () => {
    expect(altaCompleta(payloadAlta(lleno()))).toBe(true)
  })

  it('un alta a medias no cuela como terminada', () => {
    expect(altaCompleta(payloadAlta(lleno({ volumen: '' })))).toBe(false)
    expect(altaCompleta(payloadAlta(lleno({ declaracion: false })))).toBe(false)
  })

  /* Se recorren TODAS las combinaciones que el formulario puede producir: no
     vale con que funcione la que se probó a mano. */
  it('cualquier combinación del formulario vale', () => {
    OPCIONES_NIVEL.forEach(nivel =>
      OPCIONES_DIAS.forEach(dias =>
        OPCIONES_VOLUMEN.forEach(volumen => {
          const p = payloadAlta(lleno({ nivel, dias, volumen }))
          expect(altaCompleta(p), nivel + ' / ' + dias + ' / ' + volumen).toBe(true)
        })))
  })
})
