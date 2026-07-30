'use client'
// ============================================================
// El markdown que escribe el asistente, renderizado
// ============================================================
// Claude responde con **negritas**, listas y títulos. Antes se pintaba con
// whitespace-pre-wrap y el entrenador veía los asteriscos en crudo: la estructura
// que el modelo se molesta en dar se perdía entera.
//
// Es un subconjunto a mano y no una librería por dos razones: son ~60 líneas
// frente a una dependencia nueva, y sobre todo porque construye ELEMENTOS DE
// REACT, no HTML. La salida de un modelo nunca debería pasar por
// dangerouslySetInnerHTML, aunque venga de nuestra propia API.
import { Fragment, type ReactNode } from 'react'

/** **negrita**, `código` y *cursiva* dentro de una línea. */
function enLinea(texto: string, k: string): ReactNode[] {
  const partes: ReactNode[] = []
  // Un solo pase: cada alternativa captura su contenido en un grupo distinto.
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|(?<![*\w])\*([^*\n]+)\*(?!\*)/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    if (m[1] != null) partes.push(<strong key={k + 'b' + i} className="font-semibold text-white">{m[1]}</strong>)
    else if (m[2] != null) partes.push(
      <code key={k + 'c' + i} className="font-mono text-[12.5px] bg-gray-800 text-orange-300 rounded px-1 py-0.5">{m[2]}</code>,
    )
    else if (m[3] != null) partes.push(<em key={k + 'i' + i} className="italic text-gray-300">{m[3]}</em>)
    ultimo = m.index + m[0].length
    i++
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

export default function TextoAsistente({ texto }: { texto: string }) {
  const lineas = texto.split('\n')
  const bloques: ReactNode[] = []
  let lista: string[] = []
  let listaNumerada = false

  const cerrarLista = (k: string) => {
    if (!lista.length) return
    const Etiqueta = listaNumerada ? 'ol' : 'ul'
    bloques.push(
      <Etiqueta key={k} className={'flex flex-col gap-1 my-1.5 ' + (listaNumerada ? 'list-decimal' : 'list-disc') + ' pl-5 marker:text-gray-600'}>
        {lista.map((li, j) => <li key={j} className="pl-0.5">{enLinea(li, k + j)}</li>)}
      </Etiqueta>,
    )
    lista = []
  }

  lineas.forEach((cruda, i) => {
    const l = cruda.trimEnd()
    const k = 'l' + i

    const vinieta = l.match(/^\s*[-*•]\s+(.*)$/)
    const numerada = l.match(/^\s*\d+[.)]\s+(.*)$/)
    if (vinieta || numerada) {
      const esNum = !!numerada
      if (lista.length && esNum !== listaNumerada) cerrarLista(k + 'pre')
      listaNumerada = esNum
      lista.push((vinieta ? vinieta[1] : numerada![1]))
      return
    }
    cerrarLista(k + 'fin')

    if (!l.trim()) return

    const titulo = l.match(/^(#{1,4})\s+(.*)$/)
    if (titulo) {
      bloques.push(
        <p key={k} className={'font-semibold text-white mt-2.5 first:mt-0 ' + (titulo[1].length <= 2 ? 'text-[15px]' : 'text-[13.5px]')}>
          {enLinea(titulo[2], k)}
        </p>,
      )
      return
    }

    // Una línea que es toda negrita hace de encabezado de facto: el modelo la usa
    // así ("**Recomendación**") y merece el mismo aire que un título.
    const soloNegrita = l.match(/^\*\*([^*]+)\*\*:?\s*$/)
    if (soloNegrita) {
      bloques.push(<p key={k} className="font-semibold text-white text-[13.5px] mt-2.5 first:mt-0">{soloNegrita[1]}</p>)
      return
    }

    bloques.push(<p key={k} className="my-1 first:mt-0">{enLinea(l, k)}</p>)
  })
  cerrarLista('final')

  return <Fragment>{bloques}</Fragment>
}
