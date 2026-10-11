'use client'
// ============================================================
// ¿Quién cambió esta sesión? El nombre, para la etiqueta «cambiada por»
// ============================================================
// La base marca cada sesión que cambia un director (sesion.cambiada_por, lo
// pone el disparador de supabase/director-1-base.sql). Aquí se resuelve el
// NOMBRE de ese director, que ni el entrenador ni el deportista pueden leer
// directamente en perfiles: lo da nombres_cambiada_por(), y solo para sesiones
// que quien pregunta puede ver.
//
// UNA LLAMADA POR PANTALLA. Un calendario puede tener veinte sesiones marcadas:
// cada etiqueta pide su nombre, las peticiones del mismo instante se juntan en
// un lote y los nombres se guardan para el resto de la visita.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const nombres = new Map<string, string | null>()
let enCola = new Set<string>()
let lote: Promise<void> | null = null

function pedirLote(): Promise<void> {
  if (!lote) {
    lote = new Promise<void>(r => setTimeout(r, 0)).then(async () => {
      const ids = [...enCola]
      enCola = new Set()
      lote = null
      if (!ids.length) return
      const { data } = await supabase.rpc('nombres_cambiada_por', { _ids: ids })
      /* Los que no vuelven (sin permiso, o falla la red) quedan como «sin
         nombre» para no preguntar otra vez en cada pintado. */
      for (const id of ids) if (!nombres.has(id)) nombres.set(id, null)
      for (const f of (data || []) as { id: string; nombre: string | null }[]) nombres.set(f.id, f.nombre)
    })
  }
  return lote
}

/** El nombre de quien cambió la sesión; null mientras llega o si no se sabe. */
export function useNombreCambiadaPor(id?: string | null): string | null {
  const [nombre, setNombre] = useState<string | null>(id ? nombres.get(id) ?? null : null)
  useEffect(() => {
    if (!id) { setNombre(null); return }
    if (nombres.has(id)) { setNombre(nombres.get(id) ?? null); return }
    enCola.add(id)
    let vivo = true
    pedirLote().then(() => { if (vivo) setNombre(nombres.get(id) ?? null) })
    return () => { vivo = false }
  }, [id])
  return nombre
}
