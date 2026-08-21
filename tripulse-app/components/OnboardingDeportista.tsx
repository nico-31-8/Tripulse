'use client'
// ============================================================
// Primeros pasos del deportista
// ============================================================
// ANTES ESTA LISTA DABA POR HECHO QUE HABÍA UN ENTRENADOR. Sus dos pasos eran
// «vincúlate con tu entrenador» y «rellena la anamnesis para que tu entrenador
// planifique», y solo desaparecía cuando los dos estaban hechos. Al atleta que
// entrena solo —que es justo el que usa el entrenador de IA— le pedía para
// siempre un código que nadie le iba a dar: la lista no se completaba nunca y
// el primer día de la app era una tarea imposible.
//
// AHORA LOS PASOS SON LOS SUYOS: contarme de él y tener su plan. El entrenador
// es una posibilidad, no un requisito, y va aparte y sin contar para el
// progreso. Quien sí tiene entrenador lo ve igual de fácil que antes.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/* «Entreno solo» es una preferencia, no un dato: vive en el navegador. Si fuera
   una columna habría que migrar la tabla para guardar un «no me lo preguntes
   más», y al cambiar de móvil lo peor que pasa es que se lo pregunten otra vez.
   Se lee en un efecto y no en el useState inicial porque esta página también se
   pinta en el servidor, donde no hay localStorage. */
const CLAVE_SOLO = 'tp-entreno-solo-'

interface Props {
  deportista: any
  /** El alta corta: las respuestas que el planificador necesita. */
  altaHecha: boolean
  /** La anamnesis larga, la clínica. Solo se pide a quien tiene entrenador. */
  anamnesisPendiente: boolean
  /** Si ya tiene una temporada dibujada. */
  tienePlan: boolean
}

export default function OnboardingDeportista({ deportista, altaHecha, anamnesisPendiente, tienePlan }: Props) {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [ocultarEntrenador, setOcultarEntrenador] = useState(false)

  useEffect(() => {
    if (!deportista?.id) return
    try {
      if (localStorage.getItem(CLAVE_SOLO + deportista.id) === '1') setOcultarEntrenador(true)
    } catch { /* preferencia ilegible: se le vuelve a preguntar, que no hace daño */ }
  }, [deportista?.id])

  const entrenoSolo = () => {
    setOcultarEntrenador(true)
    try { localStorage.setItem(CLAVE_SOLO + deportista.id, '1') } catch { /* da igual */ }
  }

  if (!deportista) return null
  const tieneEntrenador = !!deportista.id_entrenador

  /* LOS PASOS QUE CUENTAN son solo los que el atleta puede hacer por su cuenta.
     El entrenador depende de un tercero: meterlo aquí convertía el progreso en
     una barra que no llega al final por algo que no está en su mano. */
  const pasos = [
    {
      hecho: altaHecha,
      titulo: 'Cuéntame cómo entrenas',
      texto: 'Cuatro preguntas de salud y dos de tu semana. Sin esto te escribo un plan para un atleta medio, que no eres tú.',
      cta: 'Empezar →',
      ir: '/alta',
    },
    {
      hecho: tienePlan,
      titulo: 'Ponle fecha a tu objetivo',
      texto: 'Dime a qué te presentas y reparto las semanas que quedan hasta ese día.',
      cta: 'Crear mi plan →',
      ir: '/mi-plan',
      // Sin el alta, el plan saldría con datos inventados. Se enseña apagado
      // para que se vea que existe, no escondido.
      bloqueado: !altaHecha,
    },
  ]
  const hechos = pasos.filter(p => p.hecho).length
  const listo = hechos === pasos.length

  // La anamnesis clínica completa solo se le pide a quien tiene entrenador: es
  // el entrenador quien la lee. A quien va solo no se le pide un historial
  // médico de siete secciones que nadie va a mirar.
  const pedirAnamnesis = tieneEntrenador && anamnesisPendiente

  // Todo hecho y sin nada que ofrecer: fuera. Una lista de tareas terminada que
  // sigue en pantalla deja de leerse.
  if (listo && !pedirAnamnesis && (tieneEntrenador || ocultarEntrenador)) return null

  const vincular = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const cod = codigo.toUpperCase().trim()
    if (!cod) return
    setCargando(true); setError('')
    const { data: ent } = await supabase.rpc('buscar_entrenador', { p_codigo: cod }).maybeSingle() as { data: { id: string; nombre: string } | null }
    if (!ent) { setError('Código no encontrado, revísalo bien.'); setCargando(false); return }
    const { error: errUpd } = await supabase.from('deportista').update({ id_entrenador: ent.id }).eq('id', deportista.id)
    if (errUpd) { setError('No se pudo vincular: ' + errUpd.message); setCargando(false); return }
    location.reload() // que el panel reconozca al entrenador y recalcule el checklist
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
      {!listo && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-lg">🚀 Primeros pasos</p>
            <span className="text-xs text-gray-400">{hechos} de {pasos.length}</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-orange-500 transition-all" style={{ width: (hechos / pasos.length * 100) + '%' }} />
          </div>

          {pasos.map((p, i) => (
            <div key={i} className={i ? 'mt-3' : ''}>
              <div className="flex items-center gap-2">
                <span className={p.hecho ? 'text-green-400' : 'text-gray-600'}>{p.hecho ? '✅' : '⬜'}</span>
                <p className={'font-medium ' + (p.hecho ? 'text-gray-500 line-through' : p.bloqueado ? 'text-gray-500' : 'text-white')}>
                  {p.titulo}
                </p>
              </div>
              {!p.hecho && !p.bloqueado && (
                <div className="mt-2 ml-7">
                  <p className="text-gray-400 text-sm mb-2">{p.texto}</p>
                  <button onClick={() => router.push(p.ir)}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                    {p.cta}
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* La anamnesis completa: solo con entrenador, y como añadido, no como paso. */}
      {pedirAnamnesis && (
        <div className={listo ? '' : 'mt-4 pt-4 border-t border-gray-800'}>
          <p className="font-medium text-white text-sm">Tu entrenador te ha pedido la anamnesis</p>
          <p className="text-gray-400 text-[13px] mt-1 mb-2">
            Salud, lesiones e historial completo. Es más larga, pero es lo que le deja planificarte con seguridad.
          </p>
          <button onClick={() => router.push('/anamnesis')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            Rellenar anamnesis →
          </button>
        </div>
      )}

      {/* El entrenador: opcional de verdad, y se puede quitar de en medio. */}
      {!tieneEntrenador && !ocultarEntrenador && (
        <div className={(listo && !pedirAnamnesis) ? '' : 'mt-4 pt-4 border-t border-gray-800'}>
          <p className="font-medium text-gray-300 text-sm">¿Tienes entrenador?</p>
          <p className="text-gray-500 text-[13px] mt-1 mb-2">
            Si te ha dado un código, méteselo aquí y pasa a planificarte él. Si no, sigue tú:
            esto funciona igual sin entrenador.
          </p>
          <form onSubmit={vincular} className="flex gap-2">
            <input value={codigo} onChange={ev => setCodigo(ev.target.value)} placeholder="Código del entrenador"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 uppercase placeholder:normal-case" />
            <button type="submit" disabled={cargando || !codigo.trim()}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40">
              {cargando ? '…' : 'Vincular'}
            </button>
          </form>
          {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
          <button onClick={entrenoSolo}
            className="text-gray-600 hover:text-gray-400 text-xs mt-2.5 transition">
            Entreno solo, no me lo preguntes más
          </button>
        </div>
      )}
    </div>
  )
}
