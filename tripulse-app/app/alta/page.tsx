'use client'
// ============================================================
// El alta — las seis preguntas que hacen que el plan sea tuyo
// ============================================================
// Esta pantalla existe porque /anamnesis es una historia clínica de siete
// secciones, y eso está bien cuando te la pide tu entrenador pero es un muro
// cuando acabas de instalarte la app. Sin pasar ese muro, el planificador no
// sabía tus horas ni tus días y se inventaba un atleta medio.
//
// Se guarda en las MISMAS columnas de `anamnesis`: quien luego rellene la larga
// se encuentra esto puesto, y el entrenador lo lee donde siempre.
//
// La lógica —qué se pregunta, cuándo se puede avanzar, qué se escribe— vive en
// lib/alta.ts y está cubierta por tests. Aquí solo está la pantalla.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import {
  PARQ, veredictoSalud, payloadAlta, puedeAvanzar, PASOS, ALTA_VACIA, type EstadoAlta,
} from '@/lib/alta'
import {
  OPCIONES_VOLUMEN, OPCIONES_DIAS, OPCIONES_NIVEL, OPCIONES_DISCIPLINA, OPCIONES_ANIOS,
  diasDeAnamnesis,
} from '@/lib/anamnesis-datos'

/** Botón de opción a lo ancho: en el móvil se pulsa con el pulgar sin apuntar. */
function Opcion({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={'w-full text-left px-4 py-3.5 rounded-xl border text-[14px] transition ' + (activo
        ? 'bg-orange-500/15 border-orange-500 text-white font-semibold'
        : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600')}>
      {children}
    </button>
  )
}

function SiNo({ valor, onChange }: { valor: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2 mt-2.5">
      {[true, false].map(v => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={'px-6 py-2 rounded-lg text-[13px] font-semibold border transition ' + (valor === v
            ? (v ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-gray-700 border-gray-500 text-white')
            : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600')}>
          {v ? 'Sí' : 'No'}
        </button>
      ))}
    </div>
  )
}

export default function Alta() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [dep, setDep] = useState<any>(null)
  const [idAnamnesis, setIdAnamnesis] = useState<number | null>(null)
  const [paso, setPaso] = useState(0)
  const [e, setE] = useState<EstadoAlta>(ALTA_VACIA)
  const [asumo, setAsumo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data: d } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
      setDep(d)
      if (d) {
        // Si ya hay anamnesis (larga o de un alta anterior), se rellena con lo
        // que haya. Volver aquí a cambiar las horas no debe obligar a contestar
        // otra vez lo que ya está contestado.
        const { data: an } = await supabase.from('anamnesis').select('*').eq('id_deportista', d.id).maybeSingle()
        if (an) {
          setIdAnamnesis(an.id)
          setE({
            salud: Object.fromEntries(PARQ.map(p => [p.campo, an[p.campo] ?? undefined])) as any,
            declaracion: an.declaracion_responsabilidad === true,
            nivel: an.nivel_competitivo || '',
            anios: an.anios_triatlon || '',
            dias: an.dias_semana || '',
            volumen: an.volumen_semanal || '',
            fuerte: an.disciplina_fuerte || '',
            debil: an.disciplina_debil || '',
          })
        }
      }
      setCargando(false)
    })()
  }, [router])

  const v = veredictoSalud(e.salud)
  const puede = puedeAvanzar(paso, e) && (paso !== 0 || !v.necesitaConfirmar || asumo)

  const guardar = async () => {
    if (!dep) return
    setGuardando(true); setError('')
    const payload = payloadAlta(e)
    const { error: err } = idAnamnesis
      ? await supabase.from('anamnesis').update(payload).eq('id', idAnamnesis)
      // `estado: 'borrador'` a propósito: seis respuestas no son la anamnesis
      // completa, y el panel del entrenador cuenta por ese campo.
      : await supabase.from('anamnesis').insert({ ...payload, id_deportista: dep.id, estado: 'borrador' })
    if (err) { setError('No se ha podido guardar: ' + err.message); setGuardando(false); return }
    router.push('/mi-plan')
  }

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>

  if (!dep) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-gray-300 text-sm">Tu cuenta todavía no tiene ficha de deportista.</p>
        <p className="text-gray-500 text-[12.5px] mt-2">
          Escríbenos y lo arreglamos: es un fallo nuestro, no tuyo.
        </p>
      </div>
    </main>
  )

  const dias = diasDeAnamnesis(e.dias)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-5 py-9">
        <p className="text-orange-400/90 text-sm font-medium">Vamos a empezar</p>
        <h1 className="text-[26px] font-bold tracking-tight mt-1 leading-tight">{PASOS[paso]}</h1>

        <div className="flex gap-1.5 mt-5 mb-7">
          {PASOS.map((_, i) => (
            <div key={i} className={'h-1 flex-1 rounded-full transition ' + (i <= paso ? 'bg-orange-500' : 'bg-gray-800')} />
          ))}
        </div>

        {/* ---------- 1. Salud ---------- */}
        {paso === 0 && (
          <div className="flex flex-col gap-5">
            <p className="text-gray-400 text-[13px] leading-relaxed">
              Cuatro preguntas antes de escribirte nada. No es burocracia: hay respuestas que
              cambian el plan, y una que lo para.
            </p>

            {PARQ.map(p => (
              <div key={p.campo} className="border-b border-gray-900 pb-4">
                <p className="text-[14px] text-gray-100 leading-snug">{p.pregunta}</p>
                <SiNo valor={e.salud[p.campo]} onChange={val => setE(s => ({ ...s, salud: { ...s.salud, [p.campo]: val } }))} />
                {e.salud[p.campo] === true && (
                  <p className="text-[12px] text-amber-300/90 mt-2.5">{p.siEsSi}</p>
                )}
              </div>
            ))}

            {v.necesitaConfirmar && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3.5">
                <p className="text-[13px] text-amber-100 font-semibold">Pasa por el médico antes de empezar</p>
                <p className="text-[12.5px] text-amber-200/85 mt-1.5 leading-relaxed">
                  Has marcado {v.banderas.length === 1 ? 'una cosa' : v.banderas.length + ' cosas'} que
                  conviene que vea un profesional. Puedes seguir y tener tu plan preparado, pero no empieces
                  a entrenarlo sin ese visto bueno. Yo no puedo dártelo.
                </p>
                <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                  <input type="checkbox" checked={asumo} onChange={ev => setAsumo(ev.target.checked)} className="mt-0.5 accent-amber-500" />
                  <span className="text-[12px] text-amber-100/90">Lo he leído y sigo bajo mi responsabilidad.</span>
                </label>
              </div>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={e.declaracion} onChange={ev => setE(s => ({ ...s, declaracion: ev.target.checked }))} className="mt-0.5 accent-orange-500" />
              <span className="text-[12.5px] text-gray-400 leading-relaxed">
                Declaro que lo que he contestado es cierto y que entreno bajo mi propia responsabilidad.
                Este plan es orientativo y no sustituye a un diagnóstico médico.
              </span>
            </label>
          </div>
        )}

        {/* ---------- 2. Nivel ---------- */}
        {paso === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[14px] text-gray-100 mb-3">¿Cómo compites?</p>
              <div className="flex flex-col gap-2">
                {OPCIONES_NIVEL.map(o => (
                  <Opcion key={o} activo={e.nivel === o} onClick={() => setE(s => ({ ...s, nivel: o }))}>{o}</Opcion>
                ))}
              </div>
              <p className="text-[11.5px] text-gray-600 mt-2.5">
                De aquí salen tus zonas de partida y cuánto puede subir la carga de una semana a otra.
              </p>
            </div>

            <div>
              <p className="text-[14px] text-gray-100 mb-3">¿Cuánto llevas en esto? <span className="text-gray-600 text-[12px] font-normal">(opcional)</span></p>
              <div className="flex flex-col gap-2">
                {OPCIONES_ANIOS.map(o => (
                  <Opcion key={o} activo={e.anios === o} onClick={() => setE(s => ({ ...s, anios: s.anios === o ? '' : o }))}>{o}</Opcion>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------- 3. Semana ---------- */}
        {paso === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[14px] text-gray-100 mb-3">¿Cuántos días puedes entrenar a la semana?</p>
              <div className="flex flex-col gap-2">
                {OPCIONES_DIAS.map(o => (
                  <Opcion key={o} activo={e.dias === o} onClick={() => setE(s => ({ ...s, dias: o }))}>{o}</Opcion>
                ))}
              </div>
              {/* Se cuenta el extremo BAJO del rango a propósito, y se dice. Una
                  sesión colocada en un día que no existe se salta, y saltarse
                  sesiones dispara el recorte de volumen: el error se realimenta. */}
              {dias !== null && (
                <p className="text-[11.5px] text-gray-600 mt-2.5">
                  Cuento con {dias} {dias === 1 ? 'día' : 'días'} seguros. Si un día te sobra tiempo,
                  mejor: prefiero quedarme corto que ponerte una sesión que no puedas hacer.
                </p>
              )}
              {dias !== null && dias < 3 && (
                <p className="text-[12px] text-amber-300/90 mt-2">
                  Con menos de tres días se puede entrenar, pero no preparar un triatlón con garantías.
                  Te haré un plan honesto con lo que hay.
                </p>
              )}
            </div>

            <div>
              <p className="text-[14px] text-gray-100 mb-3">¿Y cuántas horas en total?</p>
              <div className="flex flex-col gap-2">
                {OPCIONES_VOLUMEN.map(o => (
                  <Opcion key={o} activo={e.volumen === o} onClick={() => setE(s => ({ ...s, volumen: o }))}>{o}</Opcion>
                ))}
              </div>
              <p className="text-[11.5px] text-gray-600 mt-2.5">
                Lo que de verdad haces, no lo que te gustaría. Si luego no llegas, lo bajo yo solo.
              </p>
            </div>
          </div>
        )}

        {/* ---------- 4. Disciplinas ---------- */}
        {paso === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[14px] text-gray-100 mb-1">¿Cuál se te da peor?</p>
              <p className="text-[11.5px] text-gray-600 mb-3">Le daré una sesión más en las semanas de carga.</p>
              <div className="flex flex-col gap-2">
                {OPCIONES_DISCIPLINA.map(o => (
                  <Opcion key={o} activo={e.debil === o} onClick={() => setE(s => ({ ...s, debil: s.debil === o ? '' : o }))}>{o}</Opcion>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[14px] text-gray-100 mb-3">¿Y cuál mejor? <span className="text-gray-600 text-[12px] font-normal">(opcional)</span></p>
              <div className="flex flex-col gap-2">
                {OPCIONES_DISCIPLINA.filter(o => o !== e.debil).map(o => (
                  <Opcion key={o} activo={e.fuerte === o} onClick={() => setE(s => ({ ...s, fuerte: s.fuerte === o ? '' : o }))}>{o}</Opcion>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-[13px] mt-5">{error}</p>}

        <div className="flex items-center gap-3 mt-9">
          {paso > 0 && (
            <button onClick={() => setPaso(p => p - 1)}
              className="text-gray-500 hover:text-white text-[13px] px-2 py-2.5 transition">Atrás</button>
          )}
          <button
            onClick={() => paso === PASOS.length - 1 ? guardar() : setPaso(p => p + 1)}
            disabled={!puede || guardando}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:hover:bg-orange-500 text-white py-3.5 rounded-xl text-[14px] font-semibold transition">
            {guardando ? 'Guardando…' : paso === PASOS.length - 1 ? 'Listo, dame mi plan' : 'Siguiente'}
          </button>
        </div>

        {paso === 0 && !puede && (
          <p className="text-[11.5px] text-gray-600 mt-3 text-center">
            {!v.completo ? 'Contesta las cuatro para seguir.'
              : !e.declaracion ? 'Falta la declaración de abajo.'
              : 'Marca que lo has leído para seguir.'}
          </p>
        )}
      </div>
    </main>
  )
}
