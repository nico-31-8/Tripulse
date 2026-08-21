import { describe, it, expect } from 'vitest'
import { horasDeAnamnesis, diasDeAnamnesis, nivelDeAnamnesis, altaCompleta, OPCIONES_VOLUMEN, OPCIONES_DIAS, OPCIONES_NIVEL } from './anamnesis-datos'

/* Se recorren las listas DE VERDAD, las que pintan los dos formularios. Añadir
   una opción sin que sepa traducirse rompe el test aquí y no en producción. */
const OPCIONES_HORAS = OPCIONES_VOLUMEN

describe('las horas que declara el atleta', () => {
  /* EL FALLO QUE ARREGLA ESTE FICHERO. `Number('8–12h')` es NaN, y el `|| 8` de
     detrás lo convertía en 8 sin que nadie se enterara. */
  it('ninguna opción del formulario se queda en null', () => {
    OPCIONES_HORAS.forEach(o => expect(horasDeAnamnesis(o), o).not.toBeNull())
  })

  it('un rango se resuelve por el medio', () => {
    expect(horasDeAnamnesis('5–8h')).toBe(6.5)
    expect(horasDeAnamnesis('8–12h')).toBe(10)
  })

  it('los extremos abiertos ceden un escalón hacia dentro', () => {
    expect(horasDeAnamnesis('Menos de 5h')).toBe(4)
    expect(horasDeAnamnesis('Más de 12h')).toBe(13)
  })

  /* El desplegable pone guion largo (–). A mano sale el corto (-). No se mira
     el separador, solo las cifras. */
  it('da igual el guion', () => {
    expect(horasDeAnamnesis('5-8h')).toBe(horasDeAnamnesis('5–8h'))
  })

  it('un número sigue siendo ese número', () => {
    expect(horasDeAnamnesis(10)).toBe(10)
    expect(horasDeAnamnesis('10')).toBe(10)
  })

  it('sin dato devuelve null, no un número inventado', () => {
    expect(horasDeAnamnesis(null)).toBeNull()
    expect(horasDeAnamnesis('')).toBeNull()
    expect(horasDeAnamnesis('no lo sé')).toBeNull()
  })
})

describe('los días que declara el atleta', () => {
  it('ninguna opción del formulario se queda en null', () => {
    OPCIONES_DIAS.forEach(o => expect(diasDeAnamnesis(o), o).not.toBeNull())
  })

  /* LA ASIMETRÍA, Y ES A PROPÓSITO. «3–4 días» es «tres seguro, cuatro si
     puedo». Colocar cuatro sesiones a quien tiene tres garantizadas crea una
     sesión imposible, y saltársela dispara el recorte de volumen: el error se
     realimenta. Con las horas no pasa, porque la adaptación las corrige en los
     dos sentidos. */
  it('un rango se resuelve por el extremo BAJO', () => {
    expect(diasDeAnamnesis('3–4 días')).toBe(3)
    expect(diasDeAnamnesis('5–6 días')).toBe(5)
    expect(diasDeAnamnesis('1–2 días')).toBe(1)
  })

  it('todos los días son siete', () => {
    expect(diasDeAnamnesis('Todos los días')).toBe(7)
  })

  it('nunca sale un día partido', () => {
    OPCIONES_DIAS.forEach(o => expect(Number.isInteger(diasDeAnamnesis(o)!), o).toBe(true))
  })

  it('sin dato devuelve null', () => {
    expect(diasDeAnamnesis(null)).toBeNull()
    expect(diasDeAnamnesis('cuando puedo')).toBeNull()
  })
})

describe('el nivel', () => {
  it('traduce las tres opciones del formulario', () => {
    expect(nivelDeAnamnesis('Popular / Recreativo')).toBe('principiante')
    expect(nivelDeAnamnesis('Amateur competitivo')).toBe('intermedio')
    expect(nivelDeAnamnesis('Élite')).toBe('elite')
  })

  /* 'intermedio' es el resultado por defecto, así que un nivel que no se
     reconociera pasaría desapercibido. Se comprueba que cada opción cae en un
     sitio distinto: si dos coincidieran, una de ellas no se estaría leyendo. */
  it('cada opción da un nivel distinto: ninguna cae en el por defecto sin querer', () => {
    const vistos = OPCIONES_NIVEL.map(o => nivelDeAnamnesis(o))
    expect(new Set(vistos).size).toBe(OPCIONES_NIVEL.length)
  })

  it('aguanta sin tilde y sin dato', () => {
    expect(nivelDeAnamnesis('Elite')).toBe('elite')
    expect(nivelDeAnamnesis(null)).toBe('intermedio')
  })
})

describe('cuándo hay bastante para dibujar un plan', () => {
  const ok = {
    volumen_semanal: '8–12h', dias_semana: '5–6 días',
    nivel_competitivo: 'Amateur competitivo', declaracion_responsabilidad: true,
  }

  it('con las cuatro respuestas, sí', () => {
    expect(altaCompleta(ok)).toBe(true)
  })

  it('sin anamnesis, no', () => {
    expect(altaCompleta(null)).toBe(false)
  })

  /* Sin declaración firmada no se le genera entrenamiento a nadie, aunque el
     resto esté. Es la única de las cuatro que no es un dato: es un permiso. */
  it('sin la declaración de salud, no', () => {
    expect(altaCompleta({ ...ok, declaracion_responsabilidad: false })).toBe(false)
  })

  it('faltando cualquier dato, no', () => {
    expect(altaCompleta({ ...ok, volumen_semanal: null })).toBe(false)
    expect(altaCompleta({ ...ok, dias_semana: null })).toBe(false)
    expect(altaCompleta({ ...ok, nivel_competitivo: '' })).toBe(false)
  })

  /* NO se mira `estado`. El alta corta deja la fila en 'borrador' a propósito:
     'enviada' significa «anamnesis clínica completa» y el entrenador la lee así. */
  it('una fila en borrador con los datos vale igual', () => {
    expect(altaCompleta({ ...ok, estado: 'borrador' })).toBe(true)
  })
})
