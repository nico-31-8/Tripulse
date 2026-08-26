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
//
// LA LISTA MANDA
// La primera versión tenía el buscador, dos filas de filtros y el detalle
// siempre en pantalla. En un móvil eso dejaba la lista con dos resultados
// visibles. Ahora los filtros se pliegan y el detalle sube en una hoja solo
// cuando lo pides con el ⓘ, así que la lista se lleva toda la altura.
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { partirInstrucciones } from '@/lib/instrucciones'
import {
  EJERCICIO_NUEVO_VACIO, TIPOS_EJERCICIO, gruposExistentes, crearEjercicioPropio,
  editarEjercicioPropio, borrarEjercicioPropio, esMio, type EjercicioNuevo,
} from '@/lib/ejercicio-propio'

export interface EjercicioBib {
  id: number
  nombre: string
  grupo_muscular?: string | null
  descripcion?: string | null
  instrucciones?: string | null
  url_video?: string | null
  /** Con valor = se lo creó ese deportista. NULL = catálogo común. */
  id_deportista?: number | null
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
  /**
   * Qué pone en el botón. Por defecto una lupa, que es lo que necesita la
   * tabla del entrenador (va apretada al lado de un desplegable). Donde el
   * botón es la acción principal —el atleta apuntando su fuerza— una lupa sola
   * no dice qué hace.
   */
  etiqueta?: React.ReactNode
  /**
   * Si viene, quien busca puede además CREARSE un ejercicio que no esté.
   *
   * Es el id del deportista dueño. Sin él no se ofrece: la tabla exige dueño
   * para las filas privadas y crear una sin él la rechaza la base.
   */
  idDeportista?: number | null
}

export default function BuscadorEjercicios({ ejercicios, onElegir, onBibliotecaCambia, clase, etiqueta, idDeportista }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [creando, setCreando] = useState<EjercicioNuevo | null>(null)
  /* Cuando se está CORRIGIENDO uno, aquí va el id. Es el mismo formulario:
     dos sitios distintos para lo mismo acabarían pidiendo campos distintos. */
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [nombreAntes, setNombreAntes] = useState<string | null>(null)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo] = useState('')
  const [errorDetalle, setErrorDetalle] = useState('')
  const [filtro, setFiltro] = useState('todo')
  const [verFiltros, setVerFiltros] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [sel, setSel] = useState(0)
  const [detalle, setDetalle] = useState<EjercicioBib | null>(null)
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
      /* Por grupo y luego por nombre. La biblioteca llega ordenada por nombre, y
         así las cabeceras de grupo salían una por fila —«Core», «Cadera»,
         «Movilidad»…— comiéndose la mitad de la altura para agrupar de uno en
         uno. Agrupadas de verdad, una cabecera cubre diez ejercicios. */
      .sort((a, b) => {
        const ga = a.grupo_muscular || 'zzz', gb = b.grupo_muscular || 'zzz'
        if (ga !== gb) return ga.localeCompare(gb, 'es')
        return a.nombre.localeCompare(b.nombre, 'es')
      })
  }, [ejercicios, filtro, consulta])

  useEffect(() => { setSel(0) }, [consulta, filtro])

  const cerrar = () => {
    setAbierto(false); setConsulta(''); setFiltro('todo')
    setSel(0); setDetalle(null); setVerFiltros(false)
    setCreando(null); setErrorNuevo(''); setEditandoId(null); setNombreAntes(null)
  }

  /* Se abre con lo que ya habías escrito puesto de nombre: si has buscado
     «prensa inclinada» y no está, eso es justo como se llama. */
  const abrirAlta = () => {
    setErrorNuevo(''); setEditandoId(null); setNombreAntes(null)
    setCreando({ ...EJERCICIO_NUEVO_VACIO, nombre: consulta.trim() })
  }

  /** Corregir uno propio: el mismo formulario, relleno con lo que ya tenía. */
  const abrirEdicion = (e: EjercicioBib) => {
    setErrorNuevo(''); setDetalle(null)
    setEditandoId(e.id); setNombreAntes(e.nombre)
    setCreando({
      nombre: e.nombre,
      descripcion: e.descripcion || '',
      grupoMuscular: e.grupo_muscular || '',
      tipo: EJERCICIO_NUEVO_VACIO.tipo,
    })
  }

  const borrar = async (e: EjercicioBib) => {
    if (!confirm('¿Borrar «' + e.nombre + '» de tu biblioteca?')) return
    setGuardandoNuevo(true)
    const r = await borrarEjercicioPropio(supabase, e.id)
    setGuardandoNuevo(false)
    /* Si se ha usado no se borra, y el motivo se dice en el sitio donde se
       pidió: un alert suelto se cierra y no queda nada. */
    if (r.error) { setDetalle(e); setErrorDetalle(r.error); return }
    setDetalle(null)
    onBibliotecaCambia?.()
  }

  const guardarNuevo = async () => {
    if (!creando || !idDeportista) return
    setGuardandoNuevo(true); setErrorNuevo('')
    const nombres = ejercicios.map(e => e.nombre)
    const r = editandoId
      ? await editarEjercicioPropio(supabase, editandoId, creando, nombres, nombreAntes)
      : await crearEjercicioPropio(supabase, creando, idDeportista, nombres)
    setGuardandoNuevo(false)
    /* Al corregir puede volver ejercicio Y error a la vez: el cambio entró pero
       el histórico no se renombró. Se avisa sin cerrar el formulario. */
    if (r.error) { setErrorNuevo(r.error); if (!r.ejercicio) return }

    /* Se elige solo. Quien viene aquí a crear un ejercicio es porque lo está
       haciendo AHORA: obligarle a buscarlo después sería un paso de más. */
    onBibliotecaCambia?.()
    /* Al crear se elige solo: quien viene a crear un ejercicio lo está haciendo
       AHORA. Al corregir NO, que puede ser solo una errata. */
    if (editandoId) { if (!r.error) { setCreando(null); setEditandoId(null); setNombreAntes(null) } }
    else usar(r.ejercicio as EjercicioBib)
  }

  /* Un toque lo añade y cierra. El doble clic de antes no existe en un móvil, y
     obligar a «seleccionar y luego confirmar» son dos toques para lo que se
     quiere el 95% de las veces. */
  const usar = (e: EjercicioBib | null) => {
    if (!e) return
    onElegir(e)
    cerrar()
  }

  const teclas = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel(i => Math.min(i + 1, resultados.length - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel(i => Math.max(i - 1, 0)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); usar(resultados[sel] || null) }
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

  const filtroActivo = FILTROS.find(f => f.id === filtro) || FILTROS[0]
  const ins = partirInstrucciones(detalle?.instrucciones)

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} title="Buscar en toda la biblioteca"
        aria-label="Buscar ejercicio en toda la biblioteca"
        className={clase ?? 'flex-none bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-orange-500 rounded-lg px-2.5 py-2 text-sm transition'}>
        {etiqueta ?? '🔍'}
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-stretch sm:items-center justify-center sm:p-4" onClick={cerrar}>
          <div className="bg-gray-900 border-gray-700 w-full sm:max-w-2xl sm:rounded-2xl sm:border h-full sm:h-[min(85vh,700px)] flex flex-col overflow-hidden relative"
            onClick={ev => ev.stopPropagation()}>

            <div className="px-4 pt-4 pb-3 border-b border-gray-800 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <h3 className="text-[17px] font-bold flex-1">Añadir ejercicio</h3>
                <button onClick={cerrar} aria-label="Cerrar" className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2.5 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2">
                  <span className="text-gray-500">🔍</span>
                  <input autoFocus value={consulta} onChange={ev => setConsulta(ev.target.value)} onKeyDown={teclas}
                    placeholder="Escribe: glúteo, dominada, plancha…"
                    className="flex-1 min-w-0 bg-transparent text-white text-[14.5px] outline-none placeholder:text-gray-600" />
                </div>
                {/* Los filtros ocupaban dos filas fijas. Ahora se abren solo si
                    hacen falta, y el botón dice cuál está puesto. */}
                <button onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros}
                  className={'flex-none rounded-xl px-3 py-2 text-[12.5px] border transition whitespace-nowrap ' + (filtro !== 'todo'
                    ? 'bg-orange-500/15 border-orange-500/55 text-orange-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>
                  {filtro === 'todo' ? 'Filtros' : filtroActivo.et}
                </button>
              </div>

              {verFiltros && (
                <div className="flex gap-1.5 flex-wrap">
                  {FILTROS.map(f => (
                    <button key={f.id} onClick={() => { setFiltro(f.id); setVerFiltros(false) }} aria-pressed={filtro === f.id}
                      className={'rounded-full px-3 py-1 text-xs border transition ' + (filtro === f.id
                        ? 'bg-orange-500/15 border-orange-500/55 text-orange-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>{f.et}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              {resultados.length === 0 && (
                <div className="px-4 py-5 flex flex-col gap-3 items-start">
                  <p className="text-gray-500 text-[13px]">
                    Nada con «{consulta}». Prueba con otra palabra, o quita el filtro.
                  </p>
                  {/* Aquí es donde te enteras de que el ejercicio no está, así
                      que aquí es donde tiene que estar el botón de crearlo. */}
                  {idDeportista != null && (
                    <button onClick={abrirAlta}
                      className="text-left border border-orange-500/45 bg-orange-500/[0.09] hover:bg-orange-500/15 rounded-xl px-3.5 py-2.5 transition">
                      <span className="block text-orange-300 font-medium text-[13.5px]">
                        ＋ Crear {consulta.trim() ? '«' + consulta.trim() + '»' : 'un ejercicio mío'}
                      </span>
                      <span className="block text-gray-500 text-[11.5px] mt-0.5">
                        Le pones nombre, para qué te sirve y de qué es. Solo lo ves tú.
                      </span>
                    </button>
                  )}
                </div>
              )}
              {resultados.map((e, i) => {
                const nuevoGrupo = i === 0 || e.grupo_muscular !== resultados[i - 1].grupo_muscular
                return (
                  <div key={e.id}>
                    {nuevoGrupo && (
                      <p className="sticky top-0 bg-gray-900 text-[10.5px] uppercase tracking-wide text-gray-600 font-bold px-4 pt-2.5 pb-1 z-[1]">
                        {e.grupo_muscular}
                      </p>
                    )}
                    <div className={'w-full flex items-center gap-2 border-b border-white/[0.04] transition ' +
                      (i === sel ? 'bg-gray-800' : 'hover:bg-gray-800/50')}>
                      <button onClick={() => usar(e)} onMouseEnter={() => setSel(i)}
                        className="flex-1 min-w-0 text-left pl-4 pr-1 py-3 text-[14px] flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate">{e.nombre}</span>
                        {videoDe(e) && <span className="text-red-400 text-[10px] flex-none" title="Tiene vídeo">▶</span>}
                      </button>
                      <button onClick={() => { setErrorDetalle(''); setDetalle(e) }} aria-label={'Ver qué es ' + e.nombre}
                        className="flex-none mr-3 w-8 h-8 grid place-items-center rounded-lg border border-gray-700 text-gray-600 hover:text-gray-300 hover:border-gray-600 text-[12px] transition">
                        ⓘ
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-gray-800 px-4 py-2.5 flex justify-between items-center gap-3 text-[11.5px] text-gray-600">
              <span className="tabular-nums">{resultados.length} de {ejercicios.length} ejercicios</span>
              {idDeportista != null && resultados.length > 0 ? (
                <button onClick={abrirAlta} className="text-gray-500 hover:text-orange-400 underline transition flex-none">
                  ＋ crear uno mío
                </button>
              ) : (
                <span className="text-right">Toca uno para añadirlo · ⓘ para verlo</span>
              )}
            </div>

            {/* Crear uno propio. Sube por encima de la lista como el detalle,
                para no llevarte a otra pantalla a mitad de una búsqueda. */}
            {creando && (
              <div className="absolute inset-0 bg-black/75 flex items-end z-20" onClick={() => setCreando(null)}>
                <div className="bg-gray-900 border-t border-gray-700 w-full rounded-t-2xl max-h-[92%] flex flex-col overflow-hidden"
                  onClick={ev => ev.stopPropagation()}>
                  <div className="px-4 pt-4 pb-3 border-b border-gray-800">
                    <h4 className="text-[16px] font-bold">{editandoId ? 'Corregir tu ejercicio' : 'Un ejercicio tuyo'}</h4>
                    <p className="text-gray-500 text-[11.5px] mt-0.5 leading-snug">
                      {editandoId
                        ? 'Si le cambias el nombre, se cambia también en las sesiones que ya apuntaste, para que su progresión no salga partida en dos.'
                        : 'Se guarda solo para ti. Tu entrenador lo verá en lo que apuntes, pero no se mete en el catálogo de todos.'}
                    </p>
                  </div>

                  <div className="overflow-y-auto p-4 flex flex-col gap-3.5">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-gray-400 text-[12.5px]">Cómo se llama</span>
                      <input autoFocus value={creando.nombre}
                        onChange={ev => setCreando({ ...creando, nombre: ev.target.value })}
                        placeholder="Prensa inclinada a una pierna"
                        className="bg-gray-800 border border-gray-700 text-white px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-gray-400 text-[12.5px]">Para qué te sirve</span>
                      <textarea value={creando.descripcion} rows={2}
                        onChange={ev => setCreando({ ...creando, descripcion: ev.target.value })}
                        placeholder="Lo que quieras acordarte dentro de tres meses."
                        className="bg-gray-800 border border-gray-700 text-white px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 resize-y" />
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-gray-400 text-[12.5px]">De qué es</span>
                      <select value={creando.grupoMuscular}
                        onChange={ev => setCreando({ ...creando, grupoMuscular: ev.target.value })}
                        className="bg-gray-800 border border-gray-700 text-white px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500">
                        <option value="">Sin clasificar</option>
                        {gruposExistentes(ejercicios).map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      {/* Este campo no es adorno: el reparto de series de la
                          semana que mira el entrenador agrupa por esta cadena. */}
                      <span className="text-gray-600 text-[11px] leading-snug">
                        Es lo que hace que estas series cuenten en el reparto por grupo muscular de tu semana. Si lo dejas sin clasificar, salen en su propio montón.
                      </span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-gray-400 text-[12.5px]">Tipo</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {TIPOS_EJERCICIO.map(t => (
                          <button key={t} onClick={() => setCreando({ ...creando, tipo: t })}
                            aria-pressed={creando.tipo === t}
                            className={'rounded-full px-3 py-1.5 text-xs border transition ' + (creando.tipo === t
                              ? 'bg-orange-500/15 border-orange-500/55 text-orange-300'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}>{t}</button>
                        ))}
                      </div>
                    </label>

                    {errorNuevo && (
                      <p className="text-red-300 bg-red-950/60 border border-red-900 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed">
                        {errorNuevo}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-gray-800 p-3 flex gap-2">
                    <button onClick={() => setCreando(null)}
                      className="flex-1 bg-gray-800 text-gray-400 hover:text-white rounded-xl py-2.5 text-[13.5px] transition">
                      Volver
                    </button>
                    <button onClick={guardarNuevo} disabled={guardandoNuevo}
                      className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl py-2.5 text-[13.5px] transition disabled:opacity-50">
                      {guardandoNuevo ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Crear y usarlo'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* El detalle, bajo demanda. Antes vivía siempre en pantalla y en un
                móvil se comía la mitad de la lista. */}
            {detalle && (
              <div className="absolute inset-0 bg-black/75 flex items-end z-10" onClick={() => setDetalle(null)}>
                <div className="bg-gray-900 border-t border-gray-700 w-full rounded-t-2xl max-h-[80%] flex flex-col overflow-hidden"
                  onClick={ev => ev.stopPropagation()}>
                  <div className="overflow-y-auto p-4">
                    <h4 className="text-[17px] font-bold leading-tight">{detalle.nombre}</h4>
                    <p className="text-[11px] text-gray-500 mt-1.5">{detalle.grupo_muscular}</p>
                    {detalle.descripcion && (
                      <p className="text-[13.5px] text-gray-300 mt-3 leading-relaxed">{detalle.descripcion}</p>
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
                    {videoDe(detalle) ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={videoDe(detalle)!} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-red-300 hover:text-red-200 border border-red-500/40 hover:border-red-500 bg-red-500/10 rounded-xl px-3 py-2 text-[13px] transition">
                          ▶ Acceder al enlace
                        </a>
                        <button onClick={() => pedirVideo(detalle)} disabled={guardando}
                          className="bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-orange-500 rounded-lg px-2.5 py-1 text-[11.5px] transition disabled:opacity-50">
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 border border-dashed border-gray-700 rounded-xl px-3 py-2.5 text-[12.5px] text-gray-500">
                        <span>▶</span>
                        <span>Sin vídeo todavía.</span>
                        <button onClick={() => pedirVideo(detalle)} disabled={guardando}
                          className="ml-auto bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-orange-500 rounded-lg px-2.5 py-1 text-[11.5px] transition disabled:opacity-50">
                          {guardando ? 'Guardando…' : 'Pegar enlace'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Corregir y borrar, SOLO en los suyos. Sin esto podía
                      crearse un ejercicio y no tenía forma de deshacerlo: una
                      errata en el nombre se quedaba en su biblioteca para
                      siempre. */}
                  {esMio(detalle, idDeportista) && (
                    <div className="border-t border-gray-800 px-3 py-2.5 flex items-center gap-2">
                      <span className="text-[10.5px] uppercase tracking-wide text-orange-300/70 font-semibold flex-1">Tuyo</span>
                      <button onClick={() => abrirEdicion(detalle)}
                        className="text-[12px] text-gray-400 hover:text-white border border-gray-700 rounded-lg px-2.5 py-1 transition">
                        Corregir
                      </button>
                      <button onClick={() => borrar(detalle)} disabled={guardandoNuevo}
                        className="text-[12px] text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-500/50 rounded-lg px-2.5 py-1 transition disabled:opacity-50">
                        Borrar
                      </button>
                    </div>
                  )}

                  {errorDetalle && (
                    <p className="mx-3 mb-1 text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed">
                      {errorDetalle}
                    </p>
                  )}

                  <div className="border-t border-gray-800 p-3 flex gap-2">
                    <button onClick={() => setDetalle(null)}
                      className="flex-1 bg-gray-800 text-gray-400 hover:text-white rounded-xl py-2.5 text-[13.5px] transition">
                      Volver
                    </button>
                    <button onClick={() => usar(detalle)}
                      className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl py-2.5 text-[13.5px] transition">
                      Usar este ejercicio
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
