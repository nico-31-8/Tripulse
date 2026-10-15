import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { borrarTareaEntera, mensajeDeBorrado, vaciarMedicion } from './borrar-tarea'

/* Un cliente que apunta cada borrado y en qué momento termina. Los de dentro
   tardan un poco, para que se vea si la tarea espera a que acaben. */
function sbFalso(falla?: string) {
  const log: string[] = []
  const from = (tabla: string) => ({
    delete: () => ({
      eq: (col: string, v: number) => new Promise(res => {
        log.push('empieza:' + tabla)
        setTimeout(() => {
          log.push('acaba:' + tabla + ':' + col + '=' + v)
          res({ error: falla === tabla ? { message: 'no se pudo en ' + tabla } : null })
        }, tabla === 'tarea' ? 0 : 5)
      }),
    }),
  })
  return { from, log }
}

describe('borrarTareaEntera', () => {
  /* UNA orden: lo de dentro se va en cascada, y una orden es todo o nada. Se
     borraban los hijos primero, y si después la base paraba (series de fuerza
     apuntadas), la tarea se quedaba sin sus metros ni su tiempo. */
  it('borra la tarea con una sola orden, sin tocar sus hijos a mano', async () => {
    const sb = sbFalso()
    expect(await borrarTareaEntera(sb, 7)).toBeNull()
    expect(sb.log).toEqual(['empieza:tarea', 'acaba:tarea:id=7'])
  })

  it('si algo falla, lo dice', async () => {
    expect(await borrarTareaEntera(sbFalso('tarea'), 7)).toMatch(/tarea/)
  })

  it('si el deportista ya apuntó series, lo dice con palabras de entrenador', () => {
    const msg = mensajeDeBorrado({ code: '23503', message: 'update or delete on table "ejercicios" violates foreign key constraint "series_realizadas_id_ejercicio_fkey" on table "series_realizadas"' })
    expect(msg).toMatch(/ya apuntó series/)
    expect(msg).not.toMatch(/foreign key/)
  })
})

describe('vaciarMedicion', () => {
  it('vacía las tres tablas de la medición y no toca la tarea ni sus ejercicios', async () => {
    const sb = sbFalso()
    expect(await vaciarMedicion(sb, 3)).toBeNull()
    const tablas = sb.log.filter(x => x.startsWith('acaba:')).map(x => x.split(':')[1]).sort()
    expect(tablas).toEqual(['p_distancia', 'p_duracion', 'p_repeticiones'])
  })
})

/* Que nadie vuelva a escribirlo a mano: con una copia por pantalla, cada una
   acaba borrando cosas distintas. */
describe('nadie borra tareas a mano', () => {
  const RAIZ = path.resolve(__dirname, '..')
  for (const rel of ['app/sesion/[id]/tareas-tabla.tsx', 'app/sesion/[id]/page.tsx']) {
    it(rel, () => {
      const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8')
      /* Quien borra los metros está borrando la tarea entera o su medición:
         eso pasa por lib/borrar-tarea. (Reescribir un ejercicio de fuerza borra
         otras tablas, y eso sí va aquí.) */
      expect(src).not.toMatch(/from\('p_distancia'\)\.delete\(\)/)
    })
  }
})
