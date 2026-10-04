// ============================================================
// La biblioteca que ve cada entrenador
// ============================================================
//
// Lo que se sujeta aquí no es el filtro —eso se ve— sino las cuatro cosas que
// se romperían EN SILENCIO: que la copia se sume al original en vez de
// sustituirlo, que esconder uno lo esconda para todos, que la copia de otro
// entrenador tape el común, y que copiar una copia apunte al sitio que no es.

import { describe, it, expect } from 'vitest'
import {
  comoCopia, esComun, esMio, hayQueCopiar, miBiblioteca, type EjercicioBib,
} from './biblioteca-propia'

const YO = 'uuid-mio'
const OTRO = 'uuid-de-otro'

const comun = (id: number, nombre: string): EjercicioBib => ({ id, nombre })
const mio = (id: number, nombre: string, origen?: number): EjercicioBib =>
  ({ id, nombre, id_entrenador: YO, origen_id: origen ?? null })
const deOtro = (id: number, nombre: string, origen?: number): EjercicioBib =>
  ({ id, nombre, id_entrenador: OTRO, origen_id: origen ?? null })
const delAtleta = (id: number, nombre: string): EjercicioBib =>
  ({ id, nombre, id_deportista: 7 })

describe('de quién es cada uno', () => {
  it('el común no es de nadie', () => {
    expect(esComun(comun(1, 'Sentadilla'))).toBe(true)
    expect(esComun(mio(2, 'La mía'))).toBe(false)
    expect(esComun(delAtleta(3, 'Máquina rara'))).toBe(false)
  })

  it('mío es el que lleva mi uuid', () => {
    expect(esMio(mio(2, 'x'), YO)).toBe(true)
    expect(esMio(deOtro(3, 'x'), YO)).toBe(false)
    expect(esMio(comun(1, 'x'), YO)).toBe(false)
  })

  it('sin sesión no es mío nada', () => {
    expect(esMio(mio(2, 'x'), null)).toBe(false)
    expect(esMio(mio(2, 'x'), undefined)).toBe(false)
  })
})

describe('la lista que me toca ver', () => {
  it('el común y lo mío, EN EL ORDEN EN QUE VIENEN', () => {
    /* No reordena a propósito: la biblioteca los pide por nombre y el buscador
       de al prescribir por grupo muscular, porque los agrupa por cabeceras.
       Reordenando aquí se le desharía el agrupado a una de las dos, y no se
       notaría hasta abrirla. */
    const r = miBiblioteca([comun(1, 'Zancada'), mio(2, 'Arrancada'), comun(3, 'Press')], YO, [])
    expect(r.map(e => e.nombre)).toEqual(['Zancada', 'Arrancada', 'Press'])
  })

  it('LA COPIA SUSTITUYE AL ORIGINAL, no se suma', () => {
    /* Con los dos en la lista acabaría eligiendo la que no es la mitad de las
       veces, que es justo lo que venía a resolver tener la suya. */
    const r = miBiblioteca([comun(1, 'Sentadilla'), mio(9, 'Sentadilla búlgara', 1)], YO, [])
    expect(r.map(e => e.id)).toEqual([9])
  })

  it('y si la copia es de OTRO entrenador, el común se queda', () => {
    /* La versión de otro no tiene por qué taparme nada a mí. */
    const r = miBiblioteca([comun(1, 'Sentadilla'), deOtro(9, 'La suya', 1)], YO, [])
    expect(r.map(e => e.id)).toEqual([1])
  })

  it('los de otro entrenador no salen', () => {
    expect(miBiblioteca([deOtro(5, 'Suyo')], YO, []).length).toBe(0)
  })

  it('los del atleta sí: son de alguien que entreno', () => {
    expect(miBiblioteca([delAtleta(5, 'Máquina rara')], YO, []).map(e => e.id)).toEqual([5])
  })
})

describe('esconder', () => {
  it('quita el común de MI lista', () => {
    const r = miBiblioteca([comun(1, 'Sentadilla'), comun(2, 'Press')], YO, [1])
    expect(r.map(e => e.id)).toEqual([2])
  })

  it('ESCONDER NO ES BORRAR: la fila sigue ahí', () => {
    /* Lo comprueba el que importa: con la misma lista y otro entrenador, que
       no la ha escondido, el ejercicio sale. */
    const filas = [comun(1, 'Sentadilla'), comun(2, 'Press')]
    expect(miBiblioteca(filas, YO, [1]).map(e => e.id)).toEqual([2])
    expect(miBiblioteca(filas, OTRO, []).map(e => e.id)).toEqual([1, 2])
  })

  it('también se puede esconder uno mío', () => {
    expect(miBiblioteca([mio(9, 'El mío')], YO, [9]).length).toBe(0)
  })

  it('esconder el original no se lleva por delante mi copia', () => {
    /* Son dos decisiones distintas: «este del común no lo quiero» y «de este
       tengo el mío». Juntarlas dejaría al entrenador sin el suyo por haber
       escondido uno que ya ni le salía. */
    const r = miBiblioteca([comun(1, 'Sentadilla'), mio(9, 'La mía', 1)], YO, [1])
    expect(r.map(e => e.id)).toEqual([9])
  })
})

describe('cuándo hay que copiar en vez de editar', () => {
  it('uno del común se copia', () => {
    expect(hayQueCopiar(comun(1, 'x'), YO)).toBe(true)
  })

  it('el mío se edita y ya está', () => {
    expect(hayQueCopiar(mio(9, 'x'), YO)).toBe(false)
  })

  it('el del atleta se edita, que para eso es de alguien que entreno', () => {
    expect(hayQueCopiar(delAtleta(5, 'x'), YO)).toBe(false)
  })
})

describe('la copia', () => {
  const original = {
    id: 1, nombre: 'Sentadilla', grupo_muscular: 'Pierna',
    url_video: 'https://v/1', tipo: ['Fuerza'], created_at: '2026-01-01',
  } as EjercicioBib & Record<string, unknown>

  it('nace idéntica, para que solo haya que cambiar lo que se quería cambiar', () => {
    const c = comoCopia(original, YO)
    expect(c.nombre).toBe('Sentadilla')
    expect(c.grupo_muscular).toBe('Pierna')
    expect(c.url_video).toBe('https://v/1')
    expect(c.tipo).toEqual(['Fuerza'])
  })

  it('SIN EL ID NI LA FECHA, que los pone la base', () => {
    const c = comoCopia(original, YO)
    expect('id' in c).toBe(false)
    expect('created_at' in c).toBe(false)
  })

  it('es mía y de ningún atleta', () => {
    const c = comoCopia({ ...original, id_deportista: 7 } as EjercicioBib, YO)
    expect(c.id_entrenador).toBe(YO)
    expect(c.id_deportista).toBeNull()
  })

  it('apunta al que sustituye', () => {
    expect(comoCopia(original, YO).origen_id).toBe(1)
  })

  it('COPIAR UNA COPIA APUNTA AL COMÚN, no a la copia', () => {
    /* Encadenando orígenes, sustituir al de en medio dejaría al del común
       saliendo otra vez: dos ejercicios iguales en la lista y ninguno
       sustituido. Lo que sustituye es siempre el del catálogo. */
    const copia = { id: 9, nombre: 'La mía', id_entrenador: YO, origen_id: 1 }
    expect(comoCopia(copia, YO).origen_id).toBe(1)
  })

  it('y la copia resultante sustituye de verdad', () => {
    /* El viaje entero: copio el común, lo guardo con el id que me dé la base, y
       al volver a pintar la lista el común ya no sale. */
    const c = comoCopia(original, YO)
    const guardada = { ...c, id: 50 } as unknown as EjercicioBib
    expect(miBiblioteca([original, guardada], YO, []).map(e => e.id)).toEqual([50])
  })
})

describe('lo que no revienta', () => {
  it('sin filas, sin lista', () => {
    expect(miBiblioteca(null, YO, [])).toEqual([])
    expect(miBiblioteca(undefined, YO, null)).toEqual([])
  })

  it('sin sesión se ve el común, que es lo que no es de nadie', () => {
    const r = miBiblioteca([comun(1, 'Press'), mio(9, 'La mía')], null, [])
    expect(r.map(e => e.id)).toEqual([1])
  })
})

// ============================================================
// ESTE TEST LEE EL CÓDIGO
// ============================================================
//
// La lista de ejercicios la ofrecen TRES pantallas del entrenador: la
// biblioteca de /fuerza, la ficha de la sesión y la tabla de tareas. Si una se
// carga la tabla por su cuenta, se salta las dos reglas de arriba: esconderías
// un ejercicio y te lo encontrarías justo al prescribir, o verías la
// «Sentadilla» del común al lado de la tuya.
//
// /fuerza SÍ la carga a pelo, y es correcto: es la pantalla donde se gestionan,
// así que necesita ver también los escondidos para poder recuperarlos.
//
// Y EL /apuntar DEL DEPORTISTA NO ENTRA AQUÍ. Esta regla es del entrenador —mis
// versiones, lo que yo escondí— y al atleta no le toca: él tiene que ver los
// del común, los suyos y los de SU entrenador. Por eso pide columnas concretas
// y no pasa por `miBiblioteca`, que descartaría los de su entrenador por no
// ser suyos.

import { readFileSync } from 'node:fs'

describe('las pantallas de prescribir usan la misma lista', () => {
  const PANTALLAS = [
    'app/sesion/[id]/page.tsx',
    'app/sesion/[id]/tareas-tabla.tsx',
  ]

  /* Se mira el IMPORT y no el nombre suelto: `/apuntar` tiene una función
     propia llamada `recargarBiblioteca`, y buscando la palabra a secas daba
     por bueno lo que no era. */
  const IMPORT = "import { cargarBiblioteca } from '@/lib/biblioteca-propia'"
  const importa = (src: string) => src.includes(IMPORT)

  for (const f of PANTALLAS) {
    it(f + ' pasa por cargarBiblioteca', () => {
      const src = readFileSync(f, 'utf8')
      expect(importa(src), f + ' ya no importa cargarBiblioteca').toBe(true)
      expect(src, f + ' se carga la biblioteca por su cuenta')
        .not.toMatch(/from\('ejercicios_biblioteca'\)\s*\.\s*select\('\*'\)/)
    })
  }

  it('y el del deportista NO, que es otra regla', () => {
    /* Si algún día alguien «unifica» esto, el atleta dejaría de ver los
       ejercicios que le manda su entrenador: no son suyos. */
    const src = readFileSync('app/apuntar/page.tsx', 'utf8')
    expect(importa(src)).toBe(false)
  })
})
