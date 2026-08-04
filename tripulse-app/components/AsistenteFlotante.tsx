'use client'
// ============================================================
// El asistente, en todos los módulos
// ============================================================
// Botón flotante + panel lateral montado una sola vez en el layout. Solo aparece
// para el ENTRENADOR (gasta créditos y es su herramienta) y nunca en las pantallas
// públicas ni en las del deportista.
//
// Lo que lo hace útil de verdad es `useContextoModulo`: cada pantalla declara qué
// se está viendo (ver lib/contexto-modulo), y eso viaja con la pregunta. Así el
// asistente ayuda con lo que el entrenador tiene delante, no en abstracto.
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { perfilActual } from '@/lib/sesion'
import { getAtletaActivo } from '@/lib/atletaActivo'
import { construirContextoTexto } from '@/lib/asistente'
import { useContextoModulo } from '@/lib/contexto-modulo'
import AsistenteChat from './AsistenteChat'

/* En su propia página ya está el asistente entero: no hace falta el botón. */
const RUTAS_SIN_BOTON = ['/', '/login', '/registro', '/privacidad', '/terminos', '/asistente', '/nueva-password', '/reset-password']

/* Preguntas de arranque según el módulo. Las genéricas van al final. */
const SUGERENCIAS_MODULO: Record<string, string[]> = {
  Volumen: ['¿El reparto por deportes tiene sentido para su objetivo?', '¿Está subiendo el volumen demasiado rápido?'],
  Carga: ['¿Qué me dice esta frescura?', '¿Le toca descargar esta semana?'],
  Wellness: ['¿Hay algo preocupante en su wellness?', '¿Ajusto la carga por cómo viene durmiendo?'],
  SICAT: ['¿Qué disciplina le cuesta más y qué hago con eso?'],
  Índices: ['¿Se está pasando sin darse cuenta?'],
  Tests: ['¿Le toca repetir algún test?'],
  Calendario: ['Propón la sesión que falta esta semana', '¿La semana está bien repartida?'],
  Sesión: ['¿Esta sesión encaja con cómo viene?'],
  Ficha: ['Resúmeme cómo está este deportista'],
}
const SUGERENCIAS_BASE = ['Resúmeme la semana', '¿Cómo está de frescura y qué le pondría hoy?']

export default function AsistenteFlotante() {
  const pathname = usePathname()
  const modulo = useContextoModulo()
  const [abierto, setAbierto] = useState(false)
  const [esEntrenador, setEsEntrenador] = useState(false)
  const [dep, setDep] = useState<any>(null)
  const [contexto, setContexto] = useState('')
  const [cargandoCtx, setCargandoCtx] = useState(false)

  useEffect(() => {
    let vivo = true
    const comprobar = async () => {
      const p = await perfilActual()
      if (vivo) setEsEntrenador(p?.rol === 'entrenador')
    }
    comprobar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { if (!s && vivo) setEsEntrenador(false) })
    return () => { vivo = false; subscription.unsubscribe() }
  }, [])

  /* El contexto se arma al ABRIR, no al montar: son varias consultas y no tiene
     sentido pagarlas en cada pantalla por si acaso.
     `dep` NO puede ir en las dependencias: al hacer setDep se dispararía la limpieza
     de este mismo efecto, la ejecución en vuelo quedaría con vivo=false y el
     `setCargandoCtx(false)` final no llegaría nunca (spinner eterno). Se usa una ref
     para no repetir la carga. */
  const yaCargado = useRef(false)
  useEffect(() => {
    if (!abierto || yaCargado.current) return
    yaCargado.current = true
    let vivo = true
    const cargar = async () => {
      setCargandoCtx(true)
      try {
        const id = getAtletaActivo()
        if (!id) return
        const { data: d } = await supabase.from('deportista').select('*').eq('id', id).single()
        if (!d || !vivo) return
        setDep(d)
        const c = await construirContextoTexto(supabase, d)
        if (vivo) setContexto(c)
      } catch {
        /* Sin contexto se puede seguir: el chat responde de forma general. */
      } finally {
        if (vivo) setCargandoCtx(false)
      }
    }
    cargar()
    return () => { vivo = false }
  }, [abierto])

  if (!esEntrenador) return null
  if (RUTAS_SIN_BOTON.some(r => pathname === r)) return null

  const sugerencias = [
    ...(modulo ? (SUGERENCIAS_MODULO[modulo.modulo] || []) : []),
    ...SUGERENCIAS_BASE,
  ].slice(0, 4)

  return (
    <>
      {!abierto && (
        <button onClick={() => setAbierto(true)}
          title="Asistente del entrenador"
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white text-xl shadow-[0_12px_30px_-10px_rgba(249,115,22,.85)] transition flex items-center justify-center">
          🤖
        </button>
      )}

      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} className="fixed inset-0 bg-black/40 z-40" />
          <aside className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[400px] bg-gray-950 border-l border-gray-800 flex flex-col shadow-2xl">
            <header className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-800 flex-shrink-0">
              <span className="w-8 h-8 rounded-xl bg-orange-500/15 grid place-items-center text-base flex-shrink-0">🤖</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[13.5px] leading-tight">Asistente</p>
                <p className="text-gray-500 text-[11px] truncate">
                  {dep ? dep.nombre : 'sin deportista activo'}{modulo ? ' · ' + modulo.modulo : ''}
                </p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-gray-500 hover:text-white text-xl leading-none px-1 flex-shrink-0">×</button>
            </header>

            {cargandoCtx ? (
              <div className="flex-1 grid place-items-center text-gray-500 text-sm">Preparando el contexto…</div>
            ) : !dep ? (
              <div className="flex-1 grid place-items-center px-6 text-center">
                <div>
                  <p className="text-gray-300 text-sm font-medium mb-1">Sin deportista activo</p>
                  <p className="text-gray-500 text-xs">Elige uno en el dashboard y vuelve; así puedo mirar sus datos.</p>
                </div>
              </div>
            ) : (
              <AsistenteChat nombre={dep.nombre} contexto={contexto} modulo={modulo} sugerencias={sugerencias} depId={dep.id} onAplicar={() => setAbierto(false)} compacto />
            )}
          </aside>
        </>
      )}
    </>
  )
}
