'use client'
// ============================================================
// «Nuevo análisis libre»: de quién es, qué se analiza y desde dónde
// ============================================================
//
// v3 del analizador, paso 3. Lo normal es que sea del deportista de la ficha;
// si es de alguien de fuera, se crea como EVALUADO (ficha solo para tests,
// fuera del equipo, que solo ve su entrenador y no gasta cupo) con su nombre y,
// si lo da, su permiso para guardar imágenes. Desde la portada de Tests solo
// existe esa segunda opción.
//
// Una persona externa es siempre de quien la crea: dentro del espacio de otro
// entrenador no se ofrece (la base no deja crear fichas para otro).

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { crearEvaluados } from '@/lib/grupos'
import { NOMBRE_VISTA, type Vista } from '@/lib/baterias-movimiento'
import { marcarPermiso } from '@/lib/movimiento-datos'
import { crearAnalisisLibre, LARGO_TITULO, type AnalisisLibre } from '@/lib/analisis-libre'

const VISTAS: Vista[] = ['perfil', 'frente', 'espalda', 'atras', 'arriba']

export default function NuevoAnalisisLibre({ deportista, externaPosible, onCreado, onCerrar }: {
  /** La ficha desde la que se abre; null desde la portada de Tests (entonces solo persona externa). */
  deportista: { id: number; nombre: string; permiso: boolean } | null
  /** Si se puede crear una persona externa (no dentro del espacio de otro entrenador). */
  externaPosible: boolean
  onCreado: (r: { analisis: AnalisisLibre; idDeportista: number; nuevaFicha: boolean }) => void
  onCerrar: () => void
}) {
  const [externa, setExterna] = useState(!deportista)
  const [nombre, setNombre] = useState('')
  const [titulo, setTitulo] = useState('')
  const [vista, setVista] = useState<Vista>('perfil')
  const [permiso, setPermiso] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const empezar = async () => {
    setError('')
    if (externa && !nombre.trim()) { setError('Pon su nombre: así la encuentras luego.'); return }
    if (!titulo.trim()) { setError('Pon qué vas a analizar: es el nombre del análisis.'); return }
    setOcupado(true)
    let idDep = deportista?.id ?? null
    if (externa) {
      const yo = await usuarioActual()
      if (!yo?.id) { setOcupado(false); setError('No hay sesión: vuelve a entrar.'); return }
      const r = await crearEvaluados(supabase, yo.id, [nombre.trim()])
      if (r.error || !r.ids[0]) { setOcupado(false); setError('No se ha podido crear su ficha: ' + (r.error || 'sin respuesta')); return }
      idDep = r.ids[0]
      if (permiso) {
        const p = await marcarPermiso(supabase, idDep, true, yo.id)
        if (p.error) { setOcupado(false); setError('Su ficha está creada, pero no se ha podido marcar el permiso: ' + p.error); return }
      }
    }
    if (idDep == null) { setOcupado(false); setError('¿De quién es el vídeo?'); return }
    const a = await crearAnalisisLibre(supabase, { idDeportista: idDep, titulo, vista })
    setOcupado(false)
    if (a.error || !a.analisis) { setError('No se ha podido crear el análisis: ' + (a.error || 'sin respuesta')); return }
    onCreado({ analisis: a.analisis, idDeportista: idDep, nuevaFicha: externa })
  }

  const opcion = (si: boolean, titular: string, texto: string, onElegir: () => void) => (
    <button type="button" onClick={onElegir} aria-pressed={si}
      className={'w-full text-left rounded-xl border px-3.5 py-3 transition flex gap-3 items-start ' + (si
        ? 'border-orange-500/60 bg-orange-500/10' : 'border-gray-700 bg-gray-800/60 hover:border-gray-600')}>
      <span aria-hidden="true" className={'mt-0.5 w-4 h-4 rounded-full border-2 flex-none ' + (si ? 'border-orange-400 bg-orange-400 shadow-[inset_0_0_0_2px_rgb(17,24,39)]' : 'border-gray-500')} />
      <span className="min-w-0">
        <b className="block text-[13.5px]">{titular}</b>
        <span className="block text-[12px] text-gray-400 leading-snug mt-0.5">{texto}</span>
      </span>
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] px-4 py-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget && !ocupado) onCerrar() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nuevo-libre-titulo"
        className="bg-gray-900 rounded-2xl p-5 sm:p-6 border border-gray-700 w-full max-w-md flex flex-col gap-4 my-auto">
        <h3 id="nuevo-libre-titulo" className="font-bold text-lg">{deportista ? 'Nuevo análisis libre' : 'Análisis suelto'}</h3>

        {deportista ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-gray-300">¿De quién es el vídeo?</p>
            {opcion(!externa, deportista.nombre, 'Se guarda en su ficha, con sus otros tests. Es lo normal.', () => setExterna(false))}
            {externaPosible && opcion(externa, 'Una persona externa',
              'Alguien que no es de tu equipo. Queda en tus «Análisis sueltos» y en Evaluados, solo lo ves tú y no gasta cupo.', () => setExterna(true))}
          </div>
        ) : (
          <p className="text-[12.5px] text-gray-400 leading-snug">Para alguien que no es de tu equipo. Queda en tus «Análisis sueltos» y en Evaluados, solo lo ves tú y no gasta cupo.</p>
        )}

        {externa && (
          <label className="flex flex-col gap-1.5 text-[13px] text-gray-300">
            Su nombre
            <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} autoFocus
              placeholder="Como lo vayas a buscar luego"
              className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700 text-[14px]" />
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-[13px] text-gray-300">
          Qué vas a analizar
          <input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={LARGO_TITULO} autoFocus={!externa}
            placeholder="Sentadilla búlgara · pierna derecha"
            className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700 text-[14px]" />
        </label>

        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] text-gray-300">Desde dónde está grabado</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Desde dónde está grabado">
            {VISTAS.map(v => (
              <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                className={'text-[12.5px] px-3 py-1.5 rounded-lg border transition ' + (vista === v
                  ? 'bg-sky-300/15 border-sky-300/50 text-sky-200 font-semibold' : 'border-gray-700 text-gray-400 hover:text-white')}>
                {NOMBRE_VISTA[v]}
              </button>
            ))}
          </div>
          {vista !== 'perfil' && <p className="text-[11px] text-gray-500">El esqueleto solo mide ángulos de perfil: desde aquí mides tú con las herramientas (ángulo, línea, plomada…).</p>}
        </div>

        {externa ? (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={permiso} onChange={e => setPermiso(e.target.checked)} className="mt-0.5 w-4 h-4 accent-orange-500" />
            <span className="text-[12.5px] leading-snug">
              <b>Tengo su permiso para guardar las imágenes</b>
              <span className="block text-[11.5px] text-gray-500 mt-0.5">Sin él se guardan las medidas y tus notas, pero no la imagen. El informe sí lo puedes descargar al momento: se hace en tu dispositivo.</span>
            </span>
          </label>
        ) : deportista && (
          <p className="text-[11.5px] text-gray-500">
            Permiso de imágenes: <b className="text-gray-300">{deportista.permiso ? 'sí' : 'no'}</b>. {deportista.permiso ? '' : 'Sin él se guardan las medidas, no la imagen. '}Se cambia en esta pestaña.
          </p>
        )}

        {error && <p className="text-[12.5px] text-red-300" role="alert">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onCerrar} disabled={ocupado}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm transition disabled:opacity-40">Cancelar</button>
          <button type="button" onClick={empezar} disabled={ocupado}
            className="flex-1 bg-orange-500 hover:bg-orange-400 text-white py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50">
            {ocupado ? 'Creando…' : 'Elegir el vídeo'}
          </button>
        </div>
      </div>
    </div>
  )
}
