import { describe, it, expect, vi } from 'vitest'

// panel-metricas y asistente arrastran modulos que importan supabase al cargarse.
vi.mock('./supabase', () => ({ supabase: {} }))

const { estadoTSB, escalaTSBTexto, UMBRALES_TSB } = await import('./panel-metricas')
const { METODOLOGIA_ASISTENTE } = await import('./asistente')

/* ============================================================
   Un solo sitio por umbral

   La familia de bugs de esta app: el mismo concepto definido en dos sitios.
   Nada revienta — el numero simplemente dice cosas distintas segun donde mires.
   Estos tests no comprueban que los numeros sean «los correctos»: comprueban
   que solo haya UNA fuente y que todo lo demas salga de ella.
   ============================================================ */

describe('el estado de TSB sale de un unico sitio', () => {
  /* Estaba copiado CUATRO veces: lib/panel-metricas, app/carga, la ficha del
     deportista y CargaPorDisciplina. Los umbrales todavia coincidian, pero las
     etiquetas ya no: el mismo TSB salia «Desentrenando» en el panel del
     entrenador y «Desentrenamiento» en la ficha del atleta. */
  it('los cortes son los cuatro de siempre', () => {
    expect(UMBRALES_TSB).toEqual({ sobrecarga: -30, productiva: -10, transicion: 5, optima: 25 })
  })

  it('cada tramo cae en su estado, justo en la frontera', () => {
    // Las fronteras son lo que se rompe al reescribir la funcion en otro sitio:
    // un `<=` en vez de un `<` mueve un dia entero de estado.
    expect(estadoTSB(-31).nivel).toBe('sobrecarga')
    expect(estadoTSB(-30).nivel).toBe('productiva')
    expect(estadoTSB(-11).nivel).toBe('productiva')
    expect(estadoTSB(-10).nivel).toBe('transicion')
    expect(estadoTSB(4).nivel).toBe('transicion')
    expect(estadoTSB(5).nivel).toBe('optima')
    expect(estadoTSB(24).nivel).toBe('optima')
    expect(estadoTSB(25).nivel).toBe('desentrenando')
  })

  it('trae el color en los dos formatos que hacen falta', () => {
    // Hexadecimal para las graficas, clase de Tailwind para el texto. Tenerlos
    // juntos es lo que evita que una pantalla se invente el suyo.
    const e = estadoTSB(-40)
    expect(e.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(e.texto).toMatch(/^text-/)
  })

  it('el nivel es estable aunque cambie la etiqueta', () => {
    // Las pantallas eligen su fondo con `nivel`, no con `label`: si algun dia se
    // reescribe el texto, los colores no se caen.
    const niveles = [-40, -20, 0, 10, 30].map(t => estadoTSB(t).nivel)
    expect(new Set(niveles).size).toBe(5)
  })
})

describe('el prompt del asistente no repite los umbrales, los lee', () => {
  /* El prompt le dice al modelo «usa SIEMPRE estos umbrales, son los que el
     entrenador esta viendo en pantalla». Si estuvieran escritos a mano, el dia
     que se moviera un corte el asistente contradiria a la propia app con toda
     la seguridad del mundo. */
  it('la escala de TSB del prompt es la generada desde el codigo', () => {
    expect(METODOLOGIA_ASISTENTE).toContain(escalaTSBTexto())
  })

  it('la escala generada nombra los cinco estados con su corte', () => {
    const txt = escalaTSBTexto()
    ;['Sobrecarga', 'Carga productiva', 'Transición', 'Forma óptima', 'Desentrenamiento']
      .forEach(l => expect(txt, l).toContain(l))
    ;['-30', '-10', '5', '25'].forEach(n => expect(txt, n).toContain(n))
  })

  it('si se mueve un corte, el prompt se mueve solo', () => {
    // La comprobacion de verdad: el texto se deriva de UMBRALES_TSB, no lo repite.
    expect(escalaTSBTexto()).toContain(`< ${UMBRALES_TSB.sobrecarga} `)
    expect(escalaTSBTexto()).toContain(`> ${UMBRALES_TSB.optima} `)
  })

  it('el prompt sigue trayendo las nueve zonas generadas del catalogo', () => {
    // Esto ya estaba bien y conviene que siga: es el mismo patron.
    ;['AER', 'AEL', 'AEM', 'AEI', 'PAE', 'CLA', 'PLA', 'CALA', 'PALA']
      .forEach(s => expect(METODOLOGIA_ASISTENTE, s).toContain(s))
  })
})
