'use client'
// ============================================================
// Elegir un ejercicio, viendo qué es
// ============================================================
// Era un <select> nativo. Un desplegable nativo no puede enseñar nada más que
// el texto de la opción: el navegador lo pinta él, así que ni descripción, ni
// buscar escribiendo, ni marcar cuál tiene vídeo. Y la biblioteca pasa de 150
// ejercicios — «Estiramiento de sóleo (rodilla flexionada)» y «Estiramiento de
// gemelo (rodilla recta)» son dos líneas seguidas que solo se distinguen
// leyendo el paréntesis.
//
// Por eso es un componente propio: el ratón por encima (o las flechas del
// teclado) enseñan la descripción del ejercicio debajo de la lista, sin cerrarla
// ni cambiar la selección.
import { useState, useRef, useEffect, useMemo } from 'react'

export interface EjercicioBib {
  id: number
  nombre: string
  grupo_muscular?: string | null
  descripcion?: string | null
  instrucciones?: string | null
  url_video?: string | null
}

interface Props {
  ejercicios: EjercicioBib[]
  valor: string
  onCambio: (id: string) => void
  placeholder?: string
  clase?: string
  /** Para el segundo ejercicio de una superserie. */
  compacto?: boolean
}

// Sin tildes y en minúsculas: quien busca «poliarticular» no escribe el acento,
// y «Extensión» no debería quedarse fuera por eso.
const normal = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function SelectorEjercicio({
  ejercicios, valor, onCambio, placeholder = 'Ejercicio', clase = '', compacto,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const caja = useRef<HTMLDivElement>(null)

  const elegido = ejercicios.find(e => String(e.id) === String(valor))

  const lista = useMemo(() => {
    const q = normal(busca.trim())
    if (!q) return ejercicios
    return ejercicios.filter(e => normal(e.nombre).includes(q))
  }, [ejercicios, busca])

  // Cerrar al pulsar fuera. Sin esto se quedan dos listas abiertas a la vez en
  // una tabla con varias filas.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  useEffect(() => { setResaltado(0) }, [busca])

  const elegir = (e: EjercicioBib) => {
    onCambio(String(e.id))
    setAbierto(false)
    setBusca('')
  }

  const teclas = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setResaltado(i => Math.min(i + 1, lista.length - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setResaltado(i => Math.max(i - 1, 0)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (lista[resaltado]) elegir(lista[resaltado]) }
    else if (ev.key === 'Escape') { setAbierto(false); setBusca('') }
  }

  // Lo que se enseña abajo: lo que el ratón o el teclado están señalando.
  const señalado = lista[resaltado]

  return (
    <div ref={caja} className={'relative ' + clase}>
      <button type="button" onClick={() => setAbierto(v => !v)}
        className={'w-full text-left bg-gray-800 text-white text-sm rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-orange-500 flex items-center gap-1.5 ' +
          (abierto ? 'ring-1 ring-orange-500 ' : '')}>
        <span className={'truncate flex-1 ' + (elegido ? '' : 'text-gray-500')}>
          {elegido?.nombre || placeholder}
        </span>
        {elegido?.url_video && <span className="text-red-400 text-[11px] flex-shrink-0" title="Tiene vídeo">▶</span>}
        <span className="text-gray-500 text-[10px] flex-shrink-0">▼</span>
      </button>

      {abierto && (
        <div className={'absolute z-50 mt-1 left-0 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col ' +
          (compacto ? 'w-[280px]' : 'w-[360px] max-w-[85vw]')}>
          <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={teclas}
            placeholder="Buscar…"
            className="bg-gray-950 text-white text-sm px-3 py-2 outline-none border-b border-gray-800" />

          <div className="overflow-y-auto max-h-56">
            {lista.length === 0 && (
              <p className="text-gray-500 text-[12.5px] px-3 py-3">Ningún ejercicio con ese nombre.</p>
            )}
            {lista.map((e, i) => (
              <button type="button" key={e.id}
                onMouseEnter={() => setResaltado(i)}
                onClick={() => elegir(e)}
                className={'w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-1.5 transition ' +
                  (i === resaltado ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800/60')}>
                <span className="truncate flex-1">{e.nombre}</span>
                {e.url_video && <span className="text-red-400 text-[10px] flex-shrink-0">▶</span>}
                {String(e.id) === String(valor) && <span className="text-orange-400 text-[11px] flex-shrink-0">✓</span>}
              </button>
            ))}
          </div>

          {/* La descripción del que estás señalando. Fija abajo y con altura
              propia: si creciera con el texto, la lista bailaría al mover el
              ratón y elegir se volvería un juego de puntería. */}
          <div className="border-t border-gray-800 bg-gray-950/70 px-3 py-2 h-[62px] overflow-y-auto">
            {señalado ? (
              <>
                <p className="text-[11px] text-gray-500 leading-tight">
                  {señalado.grupo_muscular}
                  {señalado.url_video ? ' · con vídeo' : ''}
                </p>
                <p className="text-[12px] text-gray-300 leading-snug mt-0.5">
                  {señalado.descripcion || 'Sin descripción en la biblioteca.'}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-gray-600">Pasa por encima de un ejercicio para ver qué es.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
