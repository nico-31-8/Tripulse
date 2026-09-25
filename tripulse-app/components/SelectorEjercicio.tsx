'use client'
// ============================================================
// Elegir el ejercicio: el grupo, y un campo que además se escribe
// ============================================================
// EL GRUPO NO SE TOCA. Sigue siendo el desplegable de siempre
// (components/SelectorGrupo), con sus familias, y con el grupo elegido y sin
// escribir nada sale la lista de ese grupo igual que antes: dos clics.
//
// LO QUE SE AÑADE es que el segundo campo se puede escribir. Hacía falta porque
// el grupo había que adivinarlo: «Sentadilla» vive en tres grupos distintos y el
// «Paseo del granjero» está en Core y estabilidad. Si te equivocabas de cajón,
// el ejercicio no aparecía por ningún lado.
//
// Y SI TE EQUIVOCAS, LO ENSEÑA IGUAL: lo que casa pero está en otro grupo sale
// aparte, bajo «también en otros grupos». Al elegirlo se rellena el grupo solo.
// Lo que se busca y cómo se ordena vive en lib/buscar-ejercicio, con tests.
//
// LA LISTA VA EN UN PORTAL, y no es capricho: la tabla de fuerza está dentro de
// un `overflow-x-auto`, así que una lista posicionada dentro se vería cortada
// por la mitad. Sale por encima de todo, anclada a la posición del campo.

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SelectorGrupo from '@/components/SelectorGrupo'
import { buscarEjercicios, ejercicioDe, normalizar, type EjercicioBuscable } from '@/lib/buscar-ejercicio'

export interface CambioEjercicio {
  grupo: string
  ejercicioId: string
}

export default function SelectorEjercicio({
  ejercicios, grupo, ejercicioId, onCambio,
  claseGrupo, claseCaja, claseEjercicio, vacioGrupo,
}: {
  ejercicios: EjercicioBuscable[]
  grupo: string
  ejercicioId: string
  /** Los dos a la vez, SIEMPRE: elegir un ejercicio de otro grupo cambia los dos,
      y en dos llamadas seguidas la segunda pisaría a la primera. */
  onCambio: (c: CambioEjercicio) => void
  claseGrupo?: string
  claseCaja?: string
  claseEjercicio?: string
  vacioGrupo?: string
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [sel, setSel] = useState(0)
  const [caja, setCaja] = useState<{ left: number; top: number; width: number } | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  /* El lector de pantalla necesita saber qué lista abre este campo, y con
     varias filas en la tabla el id tiene que ser distinto en cada una. */
  const idLista = useId()

  const elegido = ejercicioDe(ejercicios, ejercicioId)
  const { enGrupo, enOtros } = buscarEjercicios(ejercicios, { grupo, texto })
  const todos = [...enGrupo, ...enOtros]

  const medir = () => {
    const r = campo.current?.getBoundingClientRect()
    if (r) setCaja({ left: r.left, top: r.bottom + 4, width: r.width })
  }

  /* Mientras está abierta hay que seguir al campo: la tabla se desplaza a lo
     ancho y la página a lo alto. */
  useEffect(() => {
    if (!abierto) return
    medir()
    const mover = () => medir()
    window.addEventListener('scroll', mover, true)
    window.addEventListener('resize', mover)
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!campo.current?.contains(t) && !lista.current?.contains(t)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => {
      window.removeEventListener('scroll', mover, true)
      window.removeEventListener('resize', mover)
      document.removeEventListener('mousedown', fuera)
    }
  }, [abierto])

  const elegir = (e: EjercicioBuscable | undefined) => {
    if (!e) return
    onCambio({ grupo: (e.grupo_muscular || '').trim(), ejercicioId: String(e.id) })
    setTexto(''); setAbierto(false); setSel(0)
  }

  const teclas = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown') { setAbierto(true); setSel(s => Math.min(s + 1, todos.length - 1)); ev.preventDefault() }
    else if (ev.key === 'ArrowUp') { setSel(s => Math.max(s - 1, 0)); ev.preventDefault() }
    else if (ev.key === 'Enter') { if (todos.length) { elegir(todos[sel]); ev.preventDefault() } }
    else if (ev.key === 'Escape') { setAbierto(false) }
  }

  /* Lo que se ve escrito: lo que estás buscando, o el ejercicio ya elegido. */
  const valor = texto || (abierto ? '' : (elegido?.nombre || ''))

  const resaltar = (nombre: string) => {
    const t = normalizar(texto)
    if (!t) return nombre
    const i = normalizar(nombre).indexOf(t)
    if (i < 0) return nombre
    const largo = texto.trim().length
    return (<>
      {nombre.slice(0, i)}
      <mark className="bg-transparent text-orange-300 font-bold">{nombre.slice(i, i + largo)}</mark>
      {nombre.slice(i + largo)}
    </>)
  }

  const fila = (e: EjercicioBuscable, i: number) => (
    <div key={e.id}
      onMouseDown={ev => ev.preventDefault()}
      onClick={() => elegir(e)}
      onMouseEnter={() => setSel(i)}
      role="option" aria-selected={i === sel}
      className={'flex items-center gap-2 px-3 py-2 cursor-pointer text-[13px] ' + (i === sel ? 'bg-orange-500/15' : 'hover:bg-white/5')}>
      <span className="flex-1 text-gray-100 truncate">{resaltar(e.nombre || '')}</span>
      {(e.grupo_muscular || '') !== grupo && (
        <span className="text-[11px] text-gray-500 flex-shrink-0 truncate max-w-[45%]">{e.grupo_muscular}</span>
      )}
    </div>
  )

  return (
    <>
      <SelectorGrupo ejercicios={ejercicios} valor={grupo} vacio={vacioGrupo}
        className={claseGrupo}
        /* Cambiar de grupo suelta el ejercicio, como hacía el desplegable. */
        onCambio={g => { setTexto(''); onCambio({ grupo: g, ejercicioId: '' }) }} />

      <div className={claseCaja}>
        <input ref={campo} type="text" value={valor} autoComplete="off"
          className={claseEjercicio}
          placeholder={grupo ? 'Elige o escribe…' : 'Escribe el ejercicio…'}
          title={elegido?.nombre || ''}
          role="combobox" aria-expanded={abierto} aria-autocomplete="list" aria-controls={idLista}
          onFocus={() => { setAbierto(true); setSel(0) }}
          onChange={ev => { setTexto(ev.target.value); setAbierto(true); setSel(0) }}
          onKeyDown={teclas} />

        {abierto && caja && createPortal(
          <div ref={lista} id={idLista} role="listbox"
            style={{ position: 'fixed', left: caja.left, top: caja.top, width: Math.max(caja.width, 230), zIndex: 60 }}
            className="rounded-xl border border-gray-700 bg-gray-900 shadow-2xl shadow-black/60 overflow-hidden max-h-[320px] overflow-y-auto">
            {enGrupo.map((e, i) => fila(e, i))}

            {enOtros.length > 0 && (
              <div className="px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-gray-500 bg-gray-950/70 border-y border-gray-800">
                También en otros grupos
              </div>
            )}
            {enOtros.map((e, i) => fila(e, enGrupo.length + i))}

            {todos.length === 0 && (
              <div className="px-3 py-2.5 text-[12.5px] text-gray-500">
                {texto
                  ? 'Nada con «' + texto.trim() + '»' + (grupo ? ' ni en el resto de la biblioteca' : '')
                  : 'Escribe para buscar en toda la biblioteca, o elige un grupo.'}
              </div>
            )}
          </div>,
          document.body,
        )}
      </div>
    </>
  )
}
