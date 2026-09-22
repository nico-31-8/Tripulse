'use client'
// Las disciplinas que programa un deportista, para las pantallas que no cargan
// su ficha entera (el microciclo, por ejemplo). Las que ya la tienen leen
// `deportista.disciplinas` directamente.
//
// Mientras llega, o si la columna aún no existe, devuelve null: con null,
// `paraProgramar` enseña todas, que es lo que se veía antes de existir esto.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useDisciplinasDeportista(idDeportista: number | null | undefined): string[] | null {
  const [leido, setLeido] = useState<{ id: number; lista: string[] | null } | null>(null)

  useEffect(() => {
    if (!idDeportista) return
    let vivo = true
    supabase.from('deportista').select('disciplinas').eq('id', idDeportista).maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return
        const fila = data as { disciplinas?: string[] | null } | null
        setLeido({ id: idDeportista, lista: error ? null : (fila?.disciplinas ?? null) })
      })
    return () => { vivo = false }
  }, [idDeportista])

  return leido && leido.id === idDeportista ? leido.lista : null
}
