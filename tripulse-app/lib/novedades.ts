// ============================================================
// TRIPULSE — Leer NOVEDADES.md para enseñarlo dentro de la app
// ============================================================
//
// EL FICHERO ES LA ÚNICA FUENTE. La pantalla de novedades no tiene su propia
// copia del texto: lee `NOVEDADES.md`, que es el mismo que se actualiza en cada
// despliegue. Copiarlo a un fichero de datos habría creado dos versiones que se
// separan a la primera semana que alguien edite una y no la otra —y entonces lo
// que ve el entrenador en la app y lo que tú lees para presentarla ya no serían
// lo mismo—. Es el fallo que este proyecto lleva persiguiendo.
//
// SE PARTE EN BLOQUES, NO SE INTERPRETA MARKDOWN ENTERO. Aquí no hace falta un
// intérprete de markdown de verdad: el fichero lo escribimos nosotros y usa
// cuatro cosas —títulos, párrafos, listas, negrita y código—. Meter una
// librería para eso sería cargar la aplicación con miles de líneas para no usar
// ninguna. Lo que no reconoce se enseña como texto tal cual, que es lo peor que
// puede pasar y no rompe nada.

export type Bloque =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; items: string[] }

export interface Entrada {
  /** El encabezado tal cual: «3 de septiembre de 2026», «24 al 28 de agosto». */
  fecha: string
  cuerpo: Bloque[]
}

export interface Novedades {
  titulo: string
  /** Lo que va antes de la primera fecha: para qué es esto. */
  intro: Bloque[]
  entradas: Entrada[]
}

/** Una línea que solo tiene guiones o asteriscos: un separador, no contenido. */
const esSeparador = (l: string) => /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)

/**
 * Trocea el fichero.
 *
 * El orden es el del fichero, no se reordena: la convención es que lo nuevo va
 * arriba. Ordenar aquí por fecha obligaría a interpretar encabezados como
 * «Antes del 17 de agosto», que no son una fecha, y colocarlos mal sería peor
 * que respetar lo que escribió quien lo editó.
 */
export function parseNovedades(md: string): Novedades {
  const lineas = (md || '').replace(/\r\n/g, '\n').split('\n')

  let titulo = ''
  const intro: Bloque[] = []
  const entradas: Entrada[] = []

  /* Dónde van cayendo los bloques: al principio en la intro, y a partir del
     primer `##` en la última entrada abierta. */
  let destino: Bloque[] = intro

  let parrafo: string[] = []
  let items: string[] = []

  const cerrarParrafo = () => {
    if (parrafo.length) destino.push({ tipo: 'parrafo', texto: parrafo.join(' ').trim() })
    parrafo = []
  }
  const cerrarLista = () => {
    if (items.length) destino.push({ tipo: 'lista', items: [...items] })
    items = []
  }
  const cerrarTodo = () => { cerrarParrafo(); cerrarLista() }

  for (const cruda of lineas) {
    const l = cruda.trimEnd()

    if (esSeparador(l)) { cerrarTodo(); continue }

    if (l.startsWith('# ')) { cerrarTodo(); titulo = l.slice(2).trim(); continue }

    if (l.startsWith('## ')) {
      cerrarTodo()
      entradas.push({ fecha: l.slice(3).trim(), cuerpo: [] })
      destino = entradas[entradas.length - 1].cuerpo
      continue
    }

    if (l.startsWith('### ')) {
      cerrarTodo()
      destino.push({ tipo: 'titulo', texto: l.slice(4).trim() })
      continue
    }

    if (/^\s*[-*]\s+/.test(l)) {
      cerrarParrafo()
      items.push(l.replace(/^\s*[-*]\s+/, '').trim())
      continue
    }

    if (l.trim() === '') { cerrarTodo(); continue }

    /* Una línea suelta dentro de una lista es la continuación del punto
       anterior: en el fichero los puntos largos se parten en varias líneas. */
    if (items.length) { items[items.length - 1] += ' ' + l.trim(); continue }

    parrafo.push(l.trim())
  }
  cerrarTodo()

  return { titulo, intro, entradas }
}

// ── Formato dentro de una línea ─────────────────────────────

export type Trozo =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'fuerte'; texto: string }
  | { tipo: 'codigo'; texto: string }

/**
 * Parte una línea en negrita, código y texto normal.
 *
 * Se devuelve como datos y no como HTML A PROPÓSITO: el fichero lo escribimos
 * nosotros, pero convertir texto en HTML e inyectarlo es una costumbre que
 * acaba mordiendo el día que ese texto venga de otro sitio. Así el navegador
 * nunca ve etiquetas que no haya puesto React.
 */
export function trozos(linea: string): Trozo[] {
  const out: Trozo[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let ultimo = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(linea))) {
    if (m.index > ultimo) out.push({ tipo: 'texto', texto: linea.slice(ultimo, m.index) })
    if (m[1] != null) out.push({ tipo: 'fuerte', texto: m[1] })
    else out.push({ tipo: 'codigo', texto: m[2] })
    ultimo = m.index + m[0].length
  }
  if (ultimo < linea.length) out.push({ tipo: 'texto', texto: linea.slice(ultimo) })
  return out
}

/** La fecha de la entrada más reciente, para la cabecera. */
export function ultimaFecha(n: Novedades): string | null {
  return n.entradas[0]?.fecha ?? null
}
