'use client'
// ============================================================
// Lo que ve el deportista de sus tests de movimiento
// ============================================================
//
// Sus FMS y sus Nine Test, en «Mis tests»: la nota de cada prueba y los
// fotogramas que su entrenador guardó (si le dio permiso). Solo lectura: la
// base no le deja cambiar su nota (supabase/valoracion-movimiento.sql). El vídeo
// no aparece porque no se guarda.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BATERIAS, resultadoBateria } from '@/lib/baterias-movimiento'
import { cargarValoraciones, rutasDe, urlsFotogramas, type FilaPrueba, type Valoracion } from '@/lib/movimiento-datos'
import ResultadoMovimiento from './ResultadoMovimiento'

export default function MovimientoDeportista({ idDeportista }: { idDeportista: number }) {
  const [valoraciones, setValoraciones] = useState<Valoracion[] | null>(null)
  const [pruebas, setPruebas] = useState<FilaPrueba[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let vivo = true
    cargarValoraciones(supabase, idDeportista).then(async d => {
      const u = await urlsFotogramas(supabase, rutasDe(d.pruebas))
      if (!vivo) return
      setValoraciones(d.valoraciones); setPruebas(d.pruebas); setUrls(u)
    })
    return () => { vivo = false }
  }, [idDeportista])

  if (!valoraciones) return <p className="text-gray-500 text-sm py-8 text-center">Cargando…</p>
  if (!valoraciones.length) return (
    <div className="text-center py-12 text-gray-500">
      <div className="text-5xl mb-4">🎥</div>
      <p>Tu entrenador todavía no te ha pasado el FMS ni el Nine Test.</p>
      <p className="text-[12.5px] mt-1">Son pruebas de movimiento que se graban y se puntúan sobre el vídeo.</p>
    </div>
  )

  const regsDe = (id: number) => pruebas.filter(p => p.id_valoracion === id)

  return (
    <div className="flex flex-col gap-4">
      {valoraciones.map(v => {
        const def = BATERIAS[v.bateria]
        /* La anterior completa de la misma batería, para la raya gris. */
        const previa = valoraciones.filter(x => x.bateria === v.bateria && x.fecha < v.fecha)
          .find(x => resultadoBateria(def, regsDe(x.id)).completa)
        return (
          <ResultadoMovimiento key={v.id} def={def} valoracion={v} registros={regsDe(v.id)}
            previa={previa ? { valoracion: previa, registros: regsDe(previa.id) } : null} urls={urls} />
        )
      })}
    </div>
  )
}
