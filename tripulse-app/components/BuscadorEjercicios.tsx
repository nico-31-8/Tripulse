'use client'
// ============================================================
// Buscar un ejercicio en toda la biblioteca
// ============================================================
// El desplegable de siempre sigue ahí y es el camino rápido: si sabes el grupo
// muscular y el nombre, dos clics. Esto es para cuando NO sabes en qué grupo
// está archivado — que es donde el desplegable no ayuda, porque para llegar a
// la lista de nombres primero tienes que acertar el grupo.
//
// POR QUÉ NO ES UN <select> CON BUSCADOR DENTRO
// Un desplegable nativo lo pinta el navegador: no puede enseñar la descripción,
// ni las instrucciones, ni el enlace del vídeo. Y prescribir un ejercicio sin
// poder leer qué es y cómo se hace es lo que hace falta evitar aquí: la
// biblioteca tiene 162, con pares como «Estiramiento de sóleo (rodilla
// flexionada)» y «Estiramiento de gemelo (rodilla recta)» que solo se
// distinguen leyendo el paréntesis.
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { partirInstrucciones } from '@/lib/instrucciones'

export interface EjercicioBib {
  id: number
  nombre: string
  grupo_muscular?: string | null
  descripcion?: string | null
  instrucciones?: string | null
  url_video?: string | null
}

/* Los filtros salen de cómo la biblioteca YA está ordenada, no de etiquetas
   nuevas: un ejercicio nunca se queda fuera de todos por no estar etiquetado. */
const FILTROS: { id: string; et: string; test: (e: EjercicioBib) => boolean }[] = [
  { id: 'todo', et: 'Todo', test: () => true },
  { id: 'mov', et: 'Movilidad', test: e => /movilidad/i.test(e.grupo_muscular || '') },
  { id: 'core', et: 'Core', test: e => /core/i.test(e.grupo_muscular || '') },
  { id: 'inf', et: 'Tren inferior', test: e => /cuádriceps|cuadriceps|isquio|glúteo|gluteo|cadera|rodilla|tobillo/i.test(e.grupo_muscular || '') },
  { id: 'sup', et: 'Tren superior', test: e => /pectoral|espalda|hombro|bíceps|biceps|tríceps|triceps|cuello/i.test(e.grupo_muscular || '') },
  { id: 'esp', et: 'Específico', test: e => /específico|especifico/i.test(e.grupo_muscular || '') },
]

const sinTildes = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

interface Props {
  ejercicios: EjercicioBib[]
  onElegir: (ej: EjercicioBib) => void
  /** Para que quien nos llama recargue su copia de la biblioteca. */
  onBibliotecaCambia?: () => void
  /** El botón se pinta con la clase que le venga bien a cada sitio. */
  clase?: string
}

export default function BuscadorEjercicios({ ejercicios, onElegir, onBibliotecaCambia, clase }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [filtro, setFiltro] = useState('todo')
  const [consulta, setConsulta] = useState('')
  const [sel, setSel] = useState(0)
  const [videos, setVideos] = useState<Record<number, string | null>>({})
  const [guardando, setGuardando] = useState(false)

  // El vídeo recién pegado se recuerda aquí hasta que el padre recargue: si se
  // leyera solo de `ejercicios`, pegarlo no se vería hasta cambiar de pantalla.
  const videoDe = (e: EjercicioBib) => (e.id in videos ? videos[e.id] : e.url_video) || null

  const resultados = useMemo(() => {
    const f = FILTROS.find(x => x.id === filtro) || FILTROS[0]
    const q = sinTildes(consulta.trim())
    return ejercicios
      .filter(f.test)
      // Se busca también en la descripción: «lordosis» encuentra el psoas
      // aunque la palabra no esté en su nombre.
      .filter(e => !q || sinTildes(e.nombre).includes(q) || sinTildes(e.descripcion || '').includes(q))
  }, [ejercicios, filtro, consulta])

  useEffect(() => { setSel(0) }, [consulta, filtro])

  const elegido = resultados[Math.min(sel, resultados.length - 1)]

  const usar = () => {
    if (!elegido) return
    onElegir(elegido)
    cerrar()
  }

  const cerrar = () => { setAbierto(false); setConsulta(''); setFiltro('todo'); setSel(0) }

  const teclas = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel(i => Math.min(i + 1, resultados.length - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel(i => Math.max(i - 1, 0)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); usar() }
    else if (ev.key === 'Escape') { cerrar() }
  }

  const pedirVideo = async (e: EjercicioBib) => {
    const actual = videoDe(e)
    const url = window.prompt('Enlace del vídeo de «' + e.nombre + '»:', actual || '')
    if (url === null) return
    const limpio = url.trim() || null
    setGuardando(true)
    const { error } = await supabase.from('ejercicios_biblioteca')
      .update({ url_video: limpio }).eq('id', e.id)
    setGuardando(false)
    if (error) { alert('No se pudo guardar el enlace: ' + error.message); return }
    // Vaciarlo lo quita, que es la otra mitad de poder editarlo: si no, una URL
    // mal pegada se quedaría ahí para siempre.
    setVideos(v => ({ ...v, [e.id]: limpio }))
    onBibliotecaCambia?.()
  }

  const ins = partirInstrucciones(elegido?.instrucciones)

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} title="Buscar en toda la biblioteca"
        aria-label="Buscar ejercicio en toda la biblioteca"
        className={clase ?? 'flex-none bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-orange-500 rounded-lg px-2.5 py-2 text-sm transition'}>
        🔍
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={cerrar}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-3xl h-[min(78vh,640px)] flex flex-col overflow-hidden"
            onClick={ev => ev.stopPropagation()}>

            <div className="px-4 pt-4 border-b border-gray-800">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-[17px] font-bold">Buscar ejercicio</h3>
                  <p className="text-gray-500 text-xs mt-0.5">En toda la biblioteca, sin importar el grupo muscular.</p>
                </div>
                <button onClick={cerrar} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
              </div>

              <div className="flex items-center gap-2.5 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 my-3">
                <span className="text-gray-500">🔍</span>
                <input autoFocus value={consulta} onChange={ev => setConsulta(ev.target.value)} onKeyDown={teclas}
                  placeholder="Escribe: gluteo, tobillo, psoas, dominada…"
                  className="flex-1 bg-transparent text-white text-[14.5px] outline-none placeholder:text-gray-600" />
                <span className="hidden sm:inline text-[10.5px] text-gray-600 border border-gray-700 rounded px-1.5 py-px whitespace-nowrap">
                  ↑↓ para moverte · Enter para elegir
                </span>
              </div>

              <div className="flex gap-1.5 flex-wrap pb-3">
                {FILTROS.map(f => (
                  <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
                    className={'rounded-full px-3 py-1 text-xs border transition ' + (filtro === f.id
                      ? 'bg-orange-500/15 border-orange-500/55 text-orange-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>{f.et}</button>
                ))}
              </div>
            </div>

            {/* En estrecho el detalle NO se esconde: se pone debajo. Esconderlo
                quitaría justo lo que este panel viene a resolver. */}
            <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 grid-rows-[minmax(120px,38%)_minmax(0,1fr)] sm:grid-rows-1">
              <div className="overflow-y-auto border-b sm:border-b-0 sm:border-r border-gray-800 py-1.5">
                {resultados.length === 0 && (
                  <p className="text-gray-500 text-[13px] px-4 py-5">
                    Nada con «{consulta}». Prueba con otra palabra, o quita el filtro.
                  </p>
                )}
                {resultados.map((e, i) => {
                  const nuevoGrupo = i === 0 || e.grupo_muscular !== resultados[i - 1].grupo_muscular
                  return (
                    <div key={e.id}>
                      {nuevoGrupo && (
                        <p className="sticky top-0 bg-gray-900 text-[10.5px] uppercase tracking-wide text-gray-600 font-bold px-4 pt-2 pb-1">
                          {e.grupo_muscular}
                        </p>
                      )}
                      <button onClick={() => setSel(i)} onDoubleClick={usar}
                        className={'w-full text-left px-4 py-1.5 text-[13.5px] flex items-center gap-2 transition ' +
                          (i === sel ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800/50')}>
                        <span className="flex-1 min-w-0 truncate">{e.nombre}</span>
                        {videoDe(e) && <span className="text-red-400 text-[10px] flex-none" title="Tiene vídeo">▶</span>}
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="overflow-y-auto p-4">
                {elegido ? (
                  <>
                    <h4 className="text-[17px] font-bold leading-tight">{elegido.nombre}</h4>
                    <p className="text-[11px] text-gray-500 mt-1.5">{elegido.grupo_muscular}</p>
                    {elegido.descripcion && (
                      <p className="text-[13.5px] text-gray-300 mt-3 leading-relaxed">{elegido.descripcion}</p>
                    )}

                    {ins.pasos.length > 0 && (
                      <>
                        <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-bold mt-4 mb-1.5">Cómo se hace</p>
                        <ul className="flex flex-col gap-1">
                          {ins.pasos.map((p, i) => <li key={i} className="text-[13px] text-gray-400">{p}</li>)}
                        </ul>
                      </>
                    )}
                    {ins.aviso && (
                      <p className="mt-2.5 text-[12.5px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                        <b className="text-amber-100">Ojo:</b> {ins.aviso}
                      </p>
                    )}

                    <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-bold mt-4 mb-1.5">Vídeo</p>
                    {videoDe(elegido) ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={videoDe(elegido)!} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-red-300 hover:text-red-200 border border-red-500/40 hover:border-red-500 bg-red-500/10 rounded-xl px-3 py-2 text-[13px] transition">
                          ▶ Acceder al enlace
                        </a>
                        <button onClick={() => pedirVideo(elegido)} disabled={guardando}
                          className="bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-orange-500 rounded-lg px-2.5 py-1 text-[11.5px] transition disabled:opacity-50">
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 border border-dashed border-gray-700 rounded-xl px-3 py-2.5 text-[12.5px] text-gray-500">
                        <span>▶</span>
                        <span>Sin vídeo todavía.</span>
                        <button onClick={() => pedirVideo(elegido)} disabled={guardando}
                          className="ml-auto bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-orange-500 rounded-lg px-2.5 py-1 text-[11.5px] transition disabled:opacity-50">
                          {guardando ? 'Guardando…' : 'Pegar enlace'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-600 text-[13px]">Señala un ejercicio para ver qué es.</p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-800 px-4 py-3 flex justify-between items-center gap-3">
              <span className="text-xs text-gray-600 tabular-nums">
                {resultados.length} de {ejercicios.length} ejercicios
              </span>
              <button onClick={usar} disabled={!elegido}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-[13.5px] font-semibold px-4 py-2 rounded-lg transition">
                Usar este ejercicio
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
