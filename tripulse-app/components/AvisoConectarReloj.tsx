'use client'
// ============================================================
// TRIPULSE — «¿Llevas reloj?», donde se paga solo
// ============================================================
// POR QUÉ EXISTE. La conexión del reloj vivía en el perfil del deportista, la
// tercera tarjeta, detrás del menú «Más» de la barra de abajo. Tres niveles. Y
// en toda su aplicación no había una sola línea que le dijera que eso existe:
// si no lo sabes, no entras a tu perfil a buscarlo.
//
// La ironía es que la pantalla donde MÁS se nota tenerlo es justo donde no se
// ofrecía. En el wellness, con un reloj conectado la app deja de preguntarle
// las horas de sueño y la HRV porque ya las tiene — y ahí estaba el atleta,
// todas las mañanas, escribiéndolas a mano.
//
// Se enseña a quien NO tiene reloj y se borra solo en cuanto conecte uno. Un
// aviso que sigue ahí después de hacerle caso enseña a no leerlos.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { datosListos } from '@/lib/relojes-catalogo'

/**
 * Si este deportista tiene un reloj cuyos datos ya valen aquí.
 *
 * `null` mientras se mira: con `false` de partida el aviso parpadearía en la
 * cara de quien SÍ tiene reloj, cada vez que abre la pantalla.
 *
 * Una marca en pruebas cuenta como no conectada, igual que en el resto de la
 * app: conecta, pero lo que manda todavía no se traduce.
 */
export function useRelojConectado(): boolean | null {
  const [conectado, setConectado] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    const mirar = async () => {
      try {
        const { data } = await supabase.from('reloj_conexion').select('proveedor')
          .order('conectado_en', { ascending: false }).limit(1).maybeSingle()
        if (vivo) setConectado(datosListos(data?.proveedor))
      } catch {
        /* Si falla, se queda en `null` y no se pinta nada: ofrecerle conectar un
           reloj a quien ya lo tiene es peor que no ofrecérselo a nadie. */
      }
    }
    mirar()
    return () => { vivo = false }
  }, [])
  return conectado
}

export default function AvisoConectarReloj({ conectado, mensaje, className = '' }: {
  /** `null` mientras no se sabe: entonces no se pinta nada. */
  conectado: boolean | null
  mensaje?: string
  className?: string
}) {
  const router = useRouter()
  if (conectado !== false) return null

  return (
    <div role="status"
      className={'w-full rounded-2xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 flex items-center gap-3 text-left ' + className}>
      <span aria-hidden className="w-9 h-9 rounded-xl bg-sky-500/15 grid place-items-center text-lg flex-shrink-0">⌚</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug">¿Llevas reloj?</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">
          {mensaje || 'Conéctalo y los datos entran solos. Polar y COROS, desde tu perfil.'}
        </p>
      </div>
      <button type="button" onClick={() => router.push('/perfil')}
        className="flex-shrink-0 text-sm font-semibold px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white transition">
        Conectar
      </button>
    </div>
  )
}
