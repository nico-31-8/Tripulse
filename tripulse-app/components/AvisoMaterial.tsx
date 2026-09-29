'use client'
// ============================================================
// «Tus zapatillas están para cambiar», en su panel
// ============================================================
//
// POR QUÉ EXISTE. El aviso de jubilar un material ya salía en dos sitios, y los
// dos exigen ir a buscarlo: su tarjeta en el perfil, y la línea al elegir cuando
// cierra un entreno — que llega cuando ya ha corrido con ellas.
//
// Aquí sale donde entra todos los días. Y sale SOLO cuando hay algo que decir:
// un aviso que está siempre enseña a no leerlos, que es lo que le pasaba al del
// reloj antes de que se borrara al conectarlo.
//
// Se va solo cuando el material se jubila o se reinicia su contador. No hay nada
// que marcar como leído: el aviso ES el kilometraje.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { cargarKmDeMateriales, comoSeLlama, type Material } from '@/lib/material'

export default function AvisoMaterial({ idDeportista, className = '' }: {
  idDeportista: number | null | undefined
  className?: string
}) {
  const router = useRouter()
  const [frases, setFrases] = useState<{ texto: string; grave: boolean }[]>([])

  useEffect(() => {
    let vivo = true
    const mirar = async () => {
      if (!idDeportista) return
      try {
        const { data } = await supabase.from('material').select('*')
          .eq('id_deportista', idDeportista).eq('jubilado', false)
        const lista = (data || []) as Material[]
        if (!lista.length || !vivo) return
        const km = await cargarKmDeMateriales(supabase, lista)
        if (!vivo) return
        setFrases(lista
          .map(m => ({ m, k: km[m.id] }))
          .filter(x => x.k && (x.k.estado === 'aviso' || x.k.estado === 'pasado'))
          .map(({ m, k }) => ({
            grave: k.estado === 'pasado',
            texto: k.estado === 'pasado'
              ? '«' + comoSeLlama(m) + '» llevan ' + k.contador.toLocaleString('es-ES')
                + ' km: ' + k.pasado + ' por encima de lo que te pusiste. Toca cambiarlas.'
              : '«' + comoSeLlama(m) + '» llegan al límite: quedan ' + k.restante + ' km.',
          })))
      } catch {
        /* Si falla, no se pinta nada. Un aviso a medias sobre material que no se
           ha podido contar sería peor que no decir nada. */
      }
    }
    mirar()
    return () => { vivo = false }
  }, [idDeportista])

  if (!frases.length) return null

  return (
    <div className={'flex flex-col gap-2 ' + className}>
      {frases.map((f, i) => (
        <button key={i} type="button" onClick={() => router.push('/perfil')}
          className={'w-full text-left rounded-2xl border px-4 py-3 text-[13px] transition ' + (f.grave
            ? 'bg-red-500/10 border-red-500/35 text-red-200 hover:border-red-400'
            : 'bg-amber-500/10 border-amber-500/35 text-amber-200 hover:border-amber-400')}>
          <span className="mr-1.5" aria-hidden="true">👟</span>
          {f.texto}
          <span className="block text-[11.5px] opacity-70 mt-0.5">Toca para ver tu material →</span>
        </button>
      ))}
    </div>
  )
}
