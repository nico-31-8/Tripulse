'use client'
// ============================================================
// El armario de un deportista: zapatillas, bicicletas y sus kilómetros
// ============================================================
//
// UNA SOLA PANTALLA PARA LOS DOS. La usa el entrenador desde la ficha del
// deportista y el propio deportista desde su perfil, porque son exactamente la
// misma lista: escribirla dos veces acabaría con las dos diciendo cosas
// distintas del mismo par de zapatillas. Lo único que cambia es el `soyYo`, que
// mueve los textos de «su» a «mi».
//
// Los kilómetros NO se leen de ninguna columna: se calculan sumando las sesiones
// donde se usó cada material, y el reparto por deporte lo hace la capa de
// atribución (ver lib/material.ts). Un contador guardado se quedaría mintiendo
// en cuanto se corrige la distancia de una sesión.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, fechaLarga } from '@/lib/fechas'
import { AvisoEnLinea, useAviso } from '@/components/AvisoEnLinea'
import {
  kmDeMaterial, cargarKmDeMateriales, comoSeLlama,
  type Material, type KmDeMaterial,
} from '@/lib/material'

/* El icono es lo único que decide el tipo. El deporte decide los kilómetros. */
const TIPOS = [
  { id: 'zapatillas', et: 'Zapatillas', emoji: '👟', disciplina: 'Carrera' },
  { id: 'bicicleta', et: 'Bicicleta', emoji: '🚴', disciplina: 'Ciclismo' },
  { id: 'neopreno', et: 'Neopreno', emoji: '🏊', disciplina: 'Natacion' },
  { id: 'otro', et: 'Otro', emoji: '🎽', disciplina: 'Carrera' },
]
const DISCIPLINAS = ['Carrera', 'Ciclismo', 'Natacion']
const emojiDe = (tipo: string) => TIPOS.find(t => t.id === tipo)?.emoji || '🎽'

/* Los colores de cada estado, escritos enteros: el escáner de Tailwind lee el
   código fuente y una clase compuesta a trozos no llega nunca al CSS. */
const PINTA: Record<string, { borde: string; texto: string; barra: string }> = {
  ok: { borde: 'border-gray-800', texto: 'text-green-300', barra: 'bg-green-500' },
  aviso: { borde: 'border-amber-500/45', texto: 'text-amber-300', barra: 'bg-amber-500' },
  pasado: { borde: 'border-red-500/45', texto: 'text-red-300', barra: 'bg-red-500' },
  'sin-limite': { borde: 'border-gray-800', texto: 'text-white', barra: 'bg-gray-600' },
}

type Formulario = { tipo: string; disciplina: string; nombre: string; apodo: string; km_inicial: string; km_limite: string }
const VACIO: Formulario = { tipo: 'zapatillas', disciplina: 'Carrera', nombre: '', apodo: '', km_inicial: '', km_limite: '' }

export default function MaterialDeportista({ idDeportista, soyYo = false }: {
  idDeportista: number
  /** true en el perfil del propio deportista: cambia «su» por «mi». */
  soyYo?: boolean
}) {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [km, setKm] = useState<Record<number, KmDeMaterial>>({})
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState<Formulario>(VACIO)
  const [editando, setEditando] = useState<number | null>(null)
  const [edicion, setEdicion] = useState<Formulario>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const { aviso, mal, ok } = useAviso(5)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('material').select('*').eq('id_deportista', idDeportista)
      .order('jubilado').order('tipo').order('nombre')
    const lista = (data || []) as Material[]
    setMateriales(lista)
    /* Los kilómetros van en su propio viaje: la lista se pinta antes y el
       número aparece cuando llega, en vez de dejar la pestaña en blanco. */
    setKm(await cargarKmDeMateriales(supabase, lista))
    setCargando(false)
  }, [idDeportista])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  const nuevoTipo = (tipo: string) => {
    const t = TIPOS.find(x => x.id === tipo)
    /* El deporte se propone desde el tipo —unas zapatillas son de correr— pero
       se puede cambiar: hay quien pedalea con zapatillas de correr. */
    setForm(f => ({ ...f, tipo, disciplina: t?.disciplina || f.disciplina }))
  }

  const aFila = (f: Formulario) => ({
    tipo: f.tipo,
    disciplina: f.disciplina,
    nombre: f.nombre.trim(),
    apodo: f.apodo.trim() || null,
    km_inicial: Number(f.km_inicial) || 0,
    km_limite: Number(f.km_limite) > 0 ? Number(f.km_limite) : null,
  })

  const anadir = async () => {
    if (!form.nombre.trim()) { mal('Ponle nombre: la marca y el modelo, o lo que sea que lo distinga.'); return }
    setGuardando(true)
    const { error } = await supabase.from('material').insert({
      ...aFila(form), id_deportista: idDeportista, creado_por: soyYo ? 'deportista' : 'entrenador',
    })
    setGuardando(false)
    if (error) { mal('No se ha podido guardar: ' + error.message); return }
    setForm(VACIO)
    await cargar()
    ok('Añadido.')
  }

  const guardarEdicion = async (id: number) => {
    if (!edicion.nombre.trim()) { mal('Ponle nombre.'); return }
    setGuardando(true)
    const { error } = await supabase.from('material').update(aFila(edicion)).eq('id', id)
    setGuardando(false)
    if (error) { mal('No se ha podido guardar: ' + error.message); return }
    setEditando(null)
    await cargar()
  }

  const cambiar = async (m: Material, cambios: Partial<Material>, frase?: string) => {
    const { error } = await supabase.from('material').update(cambios).eq('id', m.id)
    if (error) { mal('No se ha podido guardar: ' + error.message); return }
    await cargar()
    if (frase) ok(frase)
  }

  /* REINICIAR NO ES PONER A CERO. Se guarda la fecha y el total que llevaba, así
     que el límite vuelve a empezar y el material conserva sus kilómetros: es el
     caso de la cadena de la bici. */
  const reiniciar = async (m: Material) => {
    const k = km[m.id] || kmDeMaterial(m, [])
    await cambiar(m, { reinicio_fecha: hoyISO(), reinicio_km: k.total },
      'Contador reiniciado. Sigue teniendo sus ' + k.total + ' km.')
  }

  const borrar = async (m: Material) => {
    if (!confirm('¿Borrar «' + comoSeLlama(m) + '»?\n\nSe va con su historia: las sesiones en las que se usó dejarán de tenerlo apuntado. Si lo que quieres es dejar de usarlo, júbilalo.')) return
    const { error } = await supabase.from('material').delete().eq('id', m.id)
    if (error) { mal('No se ha podido borrar: ' + error.message); return }
    await cargar()
  }

  const enUso = materiales.filter(m => !m.jubilado)
  const jubilados = materiales.filter(m => m.jubilado)
  const conAviso = enUso.filter(m => ['aviso', 'pasado'].includes(km[m.id]?.estado || '')).length

  const campo = 'bg-gray-950 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-orange-500'
  const rotulo = 'block text-[9.5px] uppercase tracking-wider text-gray-500 mb-1'

  const tarjeta = (m: Material) => {
    const k = km[m.id] || kmDeMaterial(m, [])
    const p = PINTA[k.estado]
    if (editando === m.id) {
      return (
        <div key={m.id} className="bg-gray-900 rounded-2xl border border-orange-500/45 p-3.5">
          <div className="flex flex-wrap gap-2.5 items-end">
            <div><label className={rotulo}>Nombre</label><input className={campo + ' w-[180px]'} value={edicion.nombre} onChange={e => setEdicion(v => ({ ...v, nombre: e.target.value }))} /></div>
            <div><label className={rotulo}>Apodo</label><input className={campo + ' w-[120px]'} value={edicion.apodo} onChange={e => setEdicion(v => ({ ...v, apodo: e.target.value }))} /></div>
            <div><label className={rotulo}>Deporte</label><select className={campo} value={edicion.disciplina} onChange={e => setEdicion(v => ({ ...v, disciplina: e.target.value }))}>{DISCIPLINAS.map(d => <option key={d}>{d}</option>)}</select></div>
            <div><label className={rotulo}>Km que traía</label><input className={campo + ' w-[88px]'} inputMode="numeric" value={edicion.km_inicial} onChange={e => setEdicion(v => ({ ...v, km_inicial: e.target.value }))} /></div>
            <div><label className={rotulo}>Avisar a los</label><input className={campo + ' w-[88px]'} inputMode="numeric" placeholder="sin límite" value={edicion.km_limite} onChange={e => setEdicion(v => ({ ...v, km_limite: e.target.value }))} /></div>
            <button onClick={() => guardarEdicion(m.id)} disabled={guardando} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-bold px-3.5 py-2 rounded-lg transition">Guardar</button>
            <button onClick={() => setEditando(null)} className="text-gray-500 hover:text-white text-[13px] px-2 py-2 transition">Cancelar</button>
          </div>
        </div>
      )
    }
    return (
      <div key={m.id} className={'bg-gray-900 rounded-2xl border p-3.5 ' + p.borde + (m.jubilado ? ' opacity-55' : '')}>
        <div className="flex items-start gap-2.5">
          <span className="text-[19px] leading-tight">{emojiDe(m.tipo)}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[14.5px] leading-tight mb-0 truncate">{comoSeLlama(m)}</p>
            {m.apodo && <p className="text-gray-500 text-[12px] mb-0 truncate">{m.nombre}</p>}
            <span className="inline-block text-[10.5px] font-bold rounded-full px-2 py-0.5 mt-1 bg-gray-800 text-gray-400">{m.disciplina}</span>
          </div>
          <div className="flex gap-1 flex-none text-[12px]">
            <button onClick={() => { setEditando(m.id); setEdicion({ tipo: m.tipo, disciplina: m.disciplina, nombre: m.nombre, apodo: m.apodo || '', km_inicial: String(m.km_inicial || ''), km_limite: String(m.km_limite || '') }) }}
              title="Editar" className="text-gray-500 hover:text-orange-400 px-1 transition">✏️</button>
            <button onClick={() => cambiar(m, { jubilado: !m.jubilado }, m.jubilado ? 'De vuelta al armario.' : 'Jubilado. Ya no sale al elegir.')}
              title={m.jubilado ? 'Devolver al armario' : 'Jubilar: sigue con su historia, pero ya no sale al elegir'}
              className="text-gray-500 hover:text-orange-400 px-1 transition">{m.jubilado ? '↩' : '⏏'}</button>
            <button onClick={() => borrar(m)} title="Borrar" className="text-gray-500 hover:text-red-400 px-1 transition">🗑</button>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mt-2.5 mb-1.5">
          <span className={'text-[24px] font-bold tabular-nums leading-none ' + p.texto}>{k.contador.toLocaleString('es-ES')}</span>
          <span className="text-gray-500 text-[12.5px]">{k.limite ? 'de ' + k.limite.toLocaleString('es-ES') + ' km' : 'km'}</span>
        </div>
        <div className="bg-gray-800 rounded-full h-[7px] overflow-hidden">
          <div className={'h-full rounded-full transition-all ' + p.barra} style={{ width: (k.limite ? Math.round(k.fraccion * 100) : 100) + '%' }} />
        </div>
        <div className="flex justify-between gap-2 mt-1.5 text-[11.5px] flex-wrap">
          {/* Con un reinicio por medio hay DOS números y hay que decir cuál es
              cuál: el de arriba cuenta para el límite, este es lo que lleva
              encima el material desde que existe. */}
          <span className="text-gray-500">
            {k.reiniciado
              ? k.total.toLocaleString('es-ES') + ' km en total · reiniciado el ' + fechaLarga(m.reinicio_fecha || '')
              : (m.km_inicial ? 'incluye ' + m.km_inicial + ' km que ya traía' : '')}
          </span>
          {k.estado === 'aviso' && <span className="font-bold text-amber-300">⚠ Quedan {k.restante} km</span>}
          {k.estado === 'pasado' && <span className="font-bold text-red-300">Pasado de {k.pasado} km</span>}
          {k.estado === 'ok' && k.limite && <span className="text-gray-500">Le quedan {k.restante} km</span>}
        </div>
        {!m.jubilado && (
          <button onClick={() => reiniciar(m)}
            title="Para cuando se cambia una pieza: el límite vuelve a empezar y el material conserva sus kilómetros"
            className="mt-2.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-orange-300 hover:border-orange-500 transition">
            ↺ Reiniciar el contador
          </button>
        )}
      </div>
    )
  }

  if (cargando) return <p className="text-gray-500 text-sm">Cargando el material…</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h3 className="font-bold text-lg text-white mb-0">{soyYo ? 'Mi material' : 'Material'}</h3>
        {conAviso > 0 && (
          <span className="bg-amber-500/18 text-amber-300 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold">
            {conAviso === 1 ? '1 para cambiar' : conAviso + ' para cambiar'}
          </span>
        )}
        <span className="text-gray-500 text-[12.5px]">
          {soyYo
            ? 'Al cerrar un entreno eliges con qué lo has hecho y se van sumando los kilómetros.'
            : 'Los kilómetros salen de las sesiones en las que se eligió cada uno.'}
        </span>
      </div>

      <AvisoEnLinea aviso={aviso} />

      {enUso.length > 0
        ? <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(288px, 1fr))' }}>{enUso.map(tarjeta)}</div>
        : <p className="text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl py-5 text-center mb-0">
            Todavía no hay material. {soyYo ? 'Añade tus zapatillas' : 'Añade sus zapatillas'} o su bici aquí abajo.
          </p>}

      <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/60 p-3.5">
        <p className="text-sm font-semibold text-white mb-2.5 mt-0">Añadir material</p>
        <div className="flex flex-wrap gap-2.5 items-end">
          <div><label className={rotulo}>Tipo</label>
            <select className={campo} value={form.tipo} onChange={e => nuevoTipo(e.target.value)}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.et}</option>)}
            </select></div>
          <div><label className={rotulo}>Deporte</label>
            <select className={campo} value={form.disciplina} onChange={e => setForm(f => ({ ...f, disciplina: e.target.value }))}>
              {DISCIPLINAS.map(d => <option key={d}>{d}</option>)}
            </select></div>
          <div><label className={rotulo}>Nombre</label>
            <input className={campo + ' w-[200px]'} placeholder="Nike Pegasus 41" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
          <div><label className={rotulo}>Apodo</label>
            <input className={campo + ' w-[140px]'} placeholder="las de rodar" value={form.apodo}
              onChange={e => setForm(f => ({ ...f, apodo: e.target.value }))} /></div>
          <div><label className={rotulo}>Km que ya traía</label>
            <input className={campo + ' w-[92px]'} inputMode="numeric" placeholder="0" value={form.km_inicial}
              onChange={e => setForm(f => ({ ...f, km_inicial: e.target.value }))} /></div>
          <div><label className={rotulo}>Avisar a los</label>
            <input className={campo + ' w-[92px]'} inputMode="numeric" placeholder="sin límite" value={form.km_limite}
              onChange={e => setForm(f => ({ ...f, km_limite: e.target.value }))} /></div>
          <button onClick={anadir} disabled={guardando}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-bold px-4 py-2 rounded-lg transition">
            + Añadir
          </button>
        </div>
        <p className="text-gray-500 text-[11.5px] mt-2.5 mb-0">
          El apodo es lo que se lee al elegir en la sesión: «las de placa» se reconoce antes que «Adizero Adios Pro 3».
          Y los kilómetros que ya traía importan — casi ninguna zapatilla entra en la aplicación a cero.
        </p>
      </div>

      {jubilados.length > 0 && (
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-2.5">Jubilado</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(288px, 1fr))' }}>{jubilados.map(tarjeta)}</div>
        </div>
      )}
    </div>
  )
}
