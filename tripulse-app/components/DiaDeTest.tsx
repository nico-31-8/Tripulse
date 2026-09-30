'use client'
// ============================================================
// TRIPULSE — Un día de test, dentro de la sesión
// ============================================================
//
// La banda que dice que este día es un test, y el botón que lo abre MONTADO:
// con esta gente dentro y con la fecha de la sesión puesta. Eso es la mitad del
// valor — elegirlo otra vez a pie de pista es donde se acaba pasando el test
// que no era, o apuntándolo con la fecha de hoy en vez de la del día.
//
// LA MISMA PIEZA SIRVE PARA LOS DOS: el entrenador la toca y el deportista solo
// la lee. Partirla en dos componentes habría dejado dos sitios donde decidir
// qué se enseña, y el de él se habría quedado atrás.
//
// LO QUE EL DEPORTISTA NO VE: ningún sermón. Se decidió así — sabe que tiene
// test y ya. Tampoco los botones, claro.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { porDisciplina } from '@/lib/catalogo-tests'
import { mismoDeporte } from '@/lib/referencia-propia'
import { miembrosDe } from '@/lib/grupos'
import { fechaLarga } from '@/lib/fechas'
import {
  enlaceDelTest, leerTestDeSesion, nombreDelTest, testHecho, ultimaVezDelTest,
  type TestDeSesion,
} from '@/lib/sesion-test'

interface Def { id: number; nombre: string; deporte: string }

export default function DiaDeTest({ sesion, idDeportista, editable, onCambio }: {
  sesion: { id: number | string; fecha_sesion: string; disciplina: string; test?: unknown }
  /** El dueño de la sesión. Si es la ficha de un GRUPO, aquí dentro se resuelve
      a sus miembros: las dos pantallas de pasar tests reciben a varios de una
      vez, así que un día de test de un grupo se abre con todos dentro. */
  idDeportista: number | null
  editable: boolean
  onCambio?: () => void
}) {
  const router = useRouter()
  const puesto = leerTestDeSesion(sesion?.test)

  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mios, setMios] = useState<Def[]>([])
  const [meds, setMeds] = useState<{ id_definicion: number; fecha: string }[]>([])
  const [deportistas, setDeportistas] = useState<number[]>([])
  const [origen, setOrigen] = useState<'bateria' | 'propio'>('bateria')
  const [elegido, setElegido] = useState('')

  /* Los tuyos se piden siempre, también para el deportista: es de donde sale el
     nombre. La base le deja leer los que ya ha hecho y, desde el 2026-09-30,
     también los que tiene PLANIFICADOS —política `test_definicion_dep_planificado`,
     en supabase/deportista-ve-test-planificado.sql—. Si aun así no llega
     ninguno, verá que hay test pero no cuál, y eso también está contemplado.
     Los de la batería no consultan nada: están en el código. */
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('test_definicion')
      .select('id, nombre, deporte').eq('archivado', false).order('nombre')
    setMios((data || []) as Def[])
    if (!editable || !idDeportista) return

    /* ¿Es la ficha de un grupo? Un grupo se planifica como si fuera una persona
       (tiene ficha de `deportista` con `id_grupo`), así que la sesión no se
       distingue de la de nadie: hay que preguntarlo. */
    const { data: d } = await supabase.from('deportista')
      .select('id_grupo').eq('id', idDeportista).maybeSingle()
    const ids = d?.id_grupo
      ? (await miembrosDe(supabase, d.id_grupo)).map(m => Number(m.id_deportista))
      : [idDeportista]
    setDeportistas(ids)

    const { data: m } = ids.length
      ? await supabase.from('test_medicion').select('id_definicion, fecha').in('id_deportista', ids)
      : { data: [] }
    setMeds((m || []) as { id_definicion: number; fecha: string }[])
  }, [editable, idDeportista])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  const guardar = async (t: TestDeSesion | null) => {
    setGuardando(true)
    const { error } = await supabase.from('sesion').update({ test: t }).eq('id', sesion.id)
    setGuardando(false)
    if (error) { alert('No se ha podido guardar el test del día: ' + error.message); return }
    setAbierto(false); setElegido('')
    onCambio?.()
  }

  const nombre = nombreDelTest(puesto, mios)
  const hecho = testHecho(puesto, sesion.fecha_sesion, meds)
  const ultima = ultimaVezDelTest(puesto, sesion.fecha_sesion, meds)

  // ── Ya tiene test ──────────────────────────────────────────
  if (puesto) {
    const verde = hecho === true
    return (
      <div className={'rounded-xl border px-3.5 py-3 flex items-center gap-3 flex-wrap ' +
        (verde ? 'border-green-500/30 bg-green-500/[0.07]' : 'border-violet-400/35 bg-violet-500/[0.07]')}>
        <span className="text-[19px]" aria-hidden="true">{verde ? '✅' : '🧪'}</span>
        <span className="flex-1 min-w-[190px]">
          <b className="block text-[14px]">
            {/* «Un test tuyo» solo vale para el entrenador: el test es suyo, no
                del deportista. Y al deportista puede no llegarle el nombre —la
                base solo le deja leer los tests que ya ha hecho—, así que lo
                que ve entonces es que hay test y ya. */}
            {nombre || (editable ? (puesto.origen === 'propio' ? 'Un test tuyo' : 'Test') : 'Hoy hay test')}
            {verde ? ' · hecho' : ''}
          </b>
          {editable && (
            <span className="text-[12px] text-gray-400">
              {/* Que el test ya no exista se DICE. Una sesión que promete un test
                  que no está hay que poder verla antes del día. */}
              {!nombre && puesto.origen === 'propio'
                ? 'Ese test ya no está en tu lista: ponle otro.'
                : puesto.origen === 'bateria' ? 'De la batería' : 'De los tuyos'}
              {ultima && !verde ? ' · la última fue el ' + fechaLarga(ultima) : ''}
            </span>
          )}
        </span>
        {editable && (
          <>
            <button onClick={() => router.push(enlaceDelTest(puesto, { deportistas, fecha: sesion.fecha_sesion }))}
              className="bg-orange-500 hover:bg-orange-600 text-white text-[12.5px] font-bold px-4 py-2 rounded-lg transition">
              {verde ? 'Ver la medición' : 'Pasar el test →'}
            </button>
            <button onClick={() => guardar(null)} disabled={guardando}
              className="text-[12.5px] text-gray-500 hover:text-red-400 px-2 py-2 transition">Quitar</button>
          </>
        )}
      </div>
    )
  }

  if (!editable) return null

  // ── Todavía no ─────────────────────────────────────────────
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)}
        className="text-[12.5px] text-gray-400 hover:text-violet-300 border border-dashed border-gray-700 hover:border-violet-400/50 rounded-xl px-3.5 py-2 transition">
        🧪 Este día es un test
      </button>
    )
  }

  /* DOS DESPLEGABLES Y NO UNO: son dos catálogos distintos —los de campo y los
     tuyos— y juntarlos en una lista de cuarenta líneas es peor que elegir antes
     de dónde. Dentro, lo del deporte de la sesión va primero. */
  const suyos = mios.filter(d => mismoDeporte(d.deporte, sesion.disciplina))
  const otros = mios.filter(d => !mismoDeporte(d.deporte, sesion.disciplina))
  const grupos = porDisciplina()
  const deLaSesion = grupos.filter(g => mismoDeporte(g.disciplina, sesion.disciplina))
  const resto = grupos.filter(g => !mismoDeporte(g.disciplina, sesion.disciplina))
  const sel = 'bg-gray-800 text-white text-[12.5px] px-2.5 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700'

  return (
    <div className="rounded-xl border border-dashed border-violet-400/35 bg-violet-500/[0.05] px-3.5 py-3 flex gap-2.5 flex-wrap items-end">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">De dónde</span>
        <select className={sel} value={origen}
          onChange={e => { setOrigen(e.target.value as 'bateria' | 'propio'); setElegido('') }}>
          <option value="bateria">De la batería (los de campo)</option>
          <option value="propio">De los tuyos (laboratorio y tests propios)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 min-w-[200px]">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Cuál</span>
        <select className={sel} value={elegido} onChange={e => setElegido(e.target.value)}>
          <option value="">Elige el test…</option>
          {origen === 'bateria' ? (
            [...deLaSesion, ...resto].map(g => (
              <optgroup key={g.disciplina} label={g.disciplina}>
                {g.tests.map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
              </optgroup>
            ))
          ) : (
            <>
              {suyos.length > 0 && (
                <optgroup label={sesion.disciplina}>
                  {suyos.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
                </optgroup>
              )}
              {otros.length > 0 && (
                <optgroup label="Otros deportes">
                  {otros.map(d => <option key={d.id} value={String(d.id)}>{d.nombre} · {d.deporte}</option>)}
                </optgroup>
              )}
            </>
          )}
        </select>
      </label>

      <button disabled={!elegido || guardando}
        onClick={() => guardar(origen === 'bateria'
          ? { origen: 'bateria', clave: elegido }
          : { origen: 'propio', id: Number(elegido) })}
        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[12.5px] font-bold px-4 py-2 rounded-lg transition">
        Ponerlo
      </button>
      <button onClick={() => { setAbierto(false); setElegido('') }}
        className="text-[12.5px] text-gray-500 hover:text-gray-300 px-2 py-2 transition">Cancelar</button>

      {origen === 'propio' && !mios.length && (
        <p className="text-[11.5px] text-amber-300 basis-full mb-0">
          Todavía no tienes tests propios. Se montan en el Laboratorio o en Tests propios.
        </p>
      )}
      <p className="text-[11.5px] text-gray-500 basis-full mb-0">
        {/* Se dice aquí porque es la duda de quien lo pone por primera vez. */}
        La sesión sigue pudiendo llevar sus tareas: el calentamiento no se va a ninguna parte.
        {(deportistas.length > 1) && ' Se lo pondrás a las ' + deportistas.length + ' personas del grupo.'}
      </p>
    </div>
  )
}
