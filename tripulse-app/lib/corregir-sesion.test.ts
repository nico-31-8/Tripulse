// ============================================================
// Cerrar una sesión por él y corregir lo que apuntó
// ============================================================
//
// Lo que se sujeta aquí es lo que puede mentir en silencio: que un número
// imposible no entre en la carga, que vacío siga siendo «no lo sé» y no cero,
// y sobre todo QUE EL RPE NO CAMBIE DE DUEÑO sin que alguien lo haya cambiado.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  comoDarlaPorHecha, numeroONada, parcheDeSerie, parcheDeSesion, parcheDeTarea,
  pegasDeCorreccion, sePuedeDarPorHecha,
  filaNuevaDeSerie, parcheDetalle, parcheDistancia, parcheDuracion, pegasDeResistencia,
  segundosDeTexto, textoDeSegundos,
  type CamposResistencia, type CamposSerie, type CamposSesion,
} from './corregir-sesion'

const ses = (x: Partial<CamposSesion> = {}): CamposSesion =>
  ({ duracion_real: '', rpe: '', notas_post: '', ...x })

describe('vacío es «no lo sé», no cero', () => {
  it('lo vacío no se convierte en cero', () => {
    /* Un cero en la FC media se promedia con los demás y hunde la media del
       día. Un null se queda fuera, que es lo correcto. */
    expect(numeroONada('')).toBeNull()
    expect(numeroONada('   ')).toBeNull()
    expect(numeroONada(null)).toBeNull()
    expect(numeroONada('x')).toBeNull()
    expect(numeroONada('0')).toBe(0)
  })

  it('la coma decimal vale, que es como se escribe aquí', () => {
    expect(numeroONada('72,5')).toBe(72.5)
  })

  it('un bloque sin tocar se guarda como vacío, no como ceros', () => {
    expect(parcheDeTarea({ rpe_reportado: '', fc_media: '', sensacion_tecnica: '', dolor_muscular: '', notas_post: '' }))
      .toEqual({ rpe_reportado: null, fc_media: null, sensacion_tecnica: null, dolor_muscular: null, notas_post: null })
  })
})

describe('un número imposible no entra en la carga', () => {
  it('el RPE va de 1 a 10', () => {
    expect(pegasDeCorreccion(ses({ rpe: '12' }))).toHaveLength(1)
    expect(pegasDeCorreccion(ses({ rpe: '0' }))).toHaveLength(1)
    expect(pegasDeCorreccion(ses({ rpe: '9' }))).toEqual([])
  })

  it('una duración de 6000 minutos es un dedo que resbaló', () => {
    expect(pegasDeCorreccion(ses({ duracion_real: '6000' }))).toHaveLength(1)
    expect(pegasDeCorreccion(ses({ duracion_real: '90' }))).toEqual([])
  })

  it('y lo dice de cada sitio, no en general', () => {
    const p = pegasDeCorreccion(
      ses({ rpe: '11' }),
      { 7: { rpe_reportado: '', fc_media: '400', sensacion_tecnica: '', dolor_muscular: '', notas_post: '' } },
      { 3: { peso_real: '', repeticiones_reales: '', tiempo_real: '', control_real: '99' } },
    )
    expect(p.map(x => x.donde).sort()).toEqual(['serie:3', 'sesion', 'tarea:7'])
  })

  it('lo vacío nunca es una pega: no rellenar no es equivocarse', () => {
    expect(pegasDeCorreccion(
      ses(),
      { 7: { rpe_reportado: '', fc_media: '', sensacion_tecnica: '', dolor_muscular: '', notas_post: '' } },
      { 3: { peso_real: '', repeticiones_reales: '', tiempo_real: '', control_real: '' } },
    )).toEqual([])
  })
})

describe('EL RPE NO CAMBIA DE DUEÑO SOLO', () => {
  it('cambiarlo lo firma el entrenador', () => {
    /* La carga y el SICAT se calculan con ese número: no es lo mismo «me dijo
       que un 9» que «le puse un 9 mirándolo». */
    expect(parcheDeSesion(ses({ rpe: '7' }), 9).rpe_origen).toBe('entrenador')
  })

  it('NO tocarlo deja el dueño como estaba', () => {
    /* Abrir la corrección, cambiar la duración y guardar no puede convertir en
       suyo lo que dijo el atleta. */
    const p = parcheDeSesion(ses({ rpe: '9', duracion_real: '95' }), 9)
    expect('rpe_origen' in p).toBe(false)
    expect(p.duracion_real).toBe(95)
  })

  it('borrarlo deja también el origen vacío', () => {
    /* Un origen «atleta» sin número es una firma de nada. */
    expect(parcheDeSesion(ses({ rpe: '' }), 9)).toMatchObject({ rpe_reportado: null, rpe_origen: null })
  })

  it('ponerlo donde no había también lo firma', () => {
    expect(parcheDeSesion(ses({ rpe: '6' }), null).rpe_origen).toBe('entrenador')
  })
})

describe('una serie con algo escrito está hecha', () => {
  it('con peso, está hecha', () => {
    expect(parcheDeSerie({ peso_real: '70', repeticiones_reales: '', tiempo_real: '', control_real: '' }))
      .toMatchObject({ peso_real: 70, completada: true })
  })

  it('con solo el RIR, también', () => {
    expect(parcheDeSerie({ peso_real: '', repeticiones_reales: '', tiempo_real: '', control_real: '2' }).completada).toBe(true)
  })

  it('vacía del todo, no', () => {
    expect(parcheDeSerie({ peso_real: '', repeticiones_reales: '', tiempo_real: '', control_real: '' }))
      .toMatchObject({ completada: false, peso_real: null })
  })

  it('un cero es un dato: cero repeticiones es haberlo intentado', () => {
    expect(parcheDeSerie({ peso_real: '', repeticiones_reales: '0', tiempo_real: '', control_real: '' }).completada).toBe(true)
  })

  it('NO se firma quién la tocó', () => {
    /* Decisión del usuario («con corregirlo llega») y además hay un motivo:
       el modo dirigir BORRA las series firmadas como del entrenador antes de
       reescribirlas, así que firmarlas haría desaparecer la corrección. */
    expect('anotado_por' in parcheDeSerie({ peso_real: '70', repeticiones_reales: '8', tiempo_real: '', control_real: '2' })).toBe(false)
  })
})

describe('darla por hecha', () => {
  const hoy = '2026-10-08'

  it('solo si el día ya pasó', () => {
    expect(sePuedeDarPorHecha({ estado: 'Planificada', fecha_sesion: '2026-10-06' }, hoy)).toBe(true)
    expect(sePuedeDarPorHecha({ estado: 'Planificada', fecha_sesion: hoy }, hoy)).toBe(true)
    /* Cerrar por adelantado algo que no ha ocurrido es lo que ensucia la carga. */
    expect(sePuedeDarPorHecha({ estado: 'Planificada', fecha_sesion: '2026-10-09' }, hoy)).toBe(false)
  })

  it('y solo si no está ya cerrada', () => {
    expect(sePuedeDarPorHecha({ estado: 'Realizada', fecha_sesion: '2026-10-06' }, hoy)).toBe(false)
    expect(sePuedeDarPorHecha({ estado: 'Cancelada', fecha_sesion: '2026-10-06' }, hoy)).toBe(false)
    expect(sePuedeDarPorHecha(null, hoy)).toBe(false)
  })

  it('empieza con lo que ya se sabe, no en blanco', () => {
    expect(comoDarlaPorHecha({ duracion_minutos: 60, rpe_estimado: 7 })).toEqual({
      duracion_real: '60', rpe: '7', notas_post: '',
    })
  })

  it('y si no se puso a mano, con la estimada', () => {
    expect(comoDarlaPorHecha({ rpe_estimado: 5 }, 48).duracion_real).toBe('48')
  })

  it('sin nada que saber, en blanco y sin inventar', () => {
    expect(comoDarlaPorHecha({})).toEqual({ duracion_real: '', rpe: '', notas_post: '' })
  })

  it('y NO se lleva por delante la nota que ya hubiera', () => {
    /* El parche escribe ese campo tal cual: empezar en blanco lo borraría sin
       que nadie lo hubiera pedido. */
    expect(comoDarlaPorHecha({ notas_post: 'Le dolía el gemelo' }).notas_post).toBe('Le dolía el gemelo')
  })
})

describe('los bloques de resistencia también se corrigen', () => {
  /* El caso que lo destapó: una tarea con «Distancia real 8 m» —el atleta
     escribió 8 queriendo decir otra cosa— y no había forma de arreglarlo. */
  const c = (x: Partial<CamposResistencia> = {}): CamposResistencia =>
    ({ metros_reales: '', tiempo_real: '', detalle: '', ...x })

  it('los metros van a su tabla', () => {
    expect(parcheDistancia(c({ metros_reales: '8000' }))).toEqual({ metros_reales: 8000 })
  })

  it('el tiempo se escribe mm:ss y se guarda en segundos', () => {
    expect(parcheDuracion(c({ tiempo_real: '4:35' }))).toEqual({ tiempo_real: 275 })
  })

  it('y también vale escribirlo en segundos a secas', () => {
    expect(segundosDeTexto('275')).toBe(275)
    expect(textoDeSegundos(275)).toBe('4:35')
    expect(textoDeSegundos(null)).toBe('')
  })

  it('un tiempo que no existe se rechaza, no se redondea', () => {
    /* «4:75» no es un número fuera de rango: es un tiempo que no existe. */
    expect(segundosDeTexto('4:75')).toBeNull()
    expect(pegasDeResistencia({ 4: c({ tiempo_real: '4:75' }) })).toHaveLength(1)
    expect(pegasDeResistencia({ 4: c({ tiempo_real: '4:35' }) })).toEqual([])
  })

  it('EL DETALLE SE PUEDE ARREGLAR, porque si no la pantalla se contradice', () => {
    /* Corriges los metros de 8 a 8000 y el resumen sigue diciendo «8m»: dos
       números distintos de lo mismo y ninguno creíble. */
    expect(parcheDetalle(c({ detalle: 'S1[8000m 4:35 S:2/5]' })))
      .toEqual({ sensacion_general: 'S1[8000m 4:35 S:2/5]' })
    expect(parcheDetalle(c({ detalle: '   ' }))).toEqual({ sensacion_general: null })
  })
})

describe('una sesión de fuerza sin series apuntadas', () => {
  const s = (x: Partial<CamposSerie> = {}): CamposSerie =>
    ({ peso_real: '', repeticiones_reales: '', tiempo_real: '', control_real: '', ...x })

  it('se puede escribir la serie que no existía', () => {
    /* Las filas se crean solo cuando el atleta escribe algo, así que una
       sesión de fuerza cerrada sin apuntar nada no tenía NADA que corregir. */
    expect(filaNuevaDeSerie(12, 2, 'rir', s({ peso_real: '70', repeticiones_reales: '8', control_real: '2' })))
      .toEqual({
        id_ejercicio: 12, numero_serie: 2, ejercicio_numero: 1,
        peso_real: 70, repeticiones_reales: 8, tiempo_real: null, control_real: 2,
        completada: true, control_tipo: 'rir',
      })
  })

  it('una serie vacía NO se crea', () => {
    /* Una fila de nulos no es un dato: es ruido que luego hay que distinguir
       de lo que sí se hizo. */
    expect(filaNuevaDeSerie(12, 3, 'rir', s())).toBeNull()
  })

  it('sin control anotado no se inventa la escala', () => {
    const f = filaNuevaDeSerie(12, 1, 'rpe', s({ peso_real: '60' }))
    expect(f!.control_tipo).toBeNull()
  })

  it('y el id_deportista NO se pone a mano: lo rellena la base', () => {
    /* Hay un disparador que lo sella. Ponerlo aquí sería un segundo sitio
       decidiendo de quién es una serie. */
    const f = filaNuevaDeSerie(12, 1, 'rir', s({ peso_real: '60' }))!
    expect('id_deportista' in f).toBe(false)
    expect('anotado_por' in f).toBe(false)
  })
})

// ------------------------------------------------------------
// EL ALAMBRE
// ------------------------------------------------------------

describe('un solo sitio decide qué se guarda al corregir', () => {
  it('la pantalla no arma sus propios parches', () => {
    /* Lo que hace daño aquí no es un fallo visible: es un 0 donde debía haber
       un vacío, o un RPE que cambia de dueño sin que nadie lo cambie. Si la
       pantalla escribe los campos a mano, esas reglas dejan de aplicarse sin
       que falle nada. */
    const RAIZ = path.resolve(__dirname, '..')
    const f = path.join(RAIZ, 'components', 'CorregirSesion.tsx')
    expect(fs.existsSync(f), 'falta components/CorregirSesion.tsx').toBe(true)
    const src = fs.readFileSync(f, 'utf8')
    for (const n of [
      'parcheDeSesion', 'parcheDeTarea', 'parcheDeSerie', 'pegasDeCorreccion',
      /* Y las tres capas que se escaparon a la primera: la resistencia y las
         series que todavía no existen. */
      'parcheDistancia', 'parcheDuracion', 'parcheDetalle', 'pegasDeResistencia', 'filaNuevaDeSerie',
    ]) {
      expect(src, 'la pantalla no usa ' + n).toContain(n)
    }
    /* Y no escribe rpe_origen por su cuenta: eso lo decide el parche. */
    expect(/rpe_origen/.test(src.replace(/parcheDeSesion/g, '')), 'la pantalla toca rpe_origen a mano').toBe(false)
  })
})
