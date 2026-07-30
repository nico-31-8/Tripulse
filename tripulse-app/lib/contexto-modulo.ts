'use client'
// ============================================================
// Qué está mirando el entrenador ahora mismo
// ============================================================
// El asistente vive en toda la app, no solo en su página. Para que pueda ayudar
// con LO QUE HAY DELANTE, cada módulo declara en una frase qué se está viendo:
// qué pantalla, qué período, qué números. Ese texto se le añade al contexto del
// deportista antes de preguntar.
//
// Es un store diminuto a propósito: si fuera un React context habría que envolver
// el árbol en un provider, y las páginas son todas 'use client' sueltas. Así cada
// una llama a `useDeclararModulo(...)` y se olvida.

import { useEffect, useSyncExternalStore } from 'react'

export interface ContextoModulo {
  /** Nombre del módulo tal y como lo llama el entrenador: "Volumen", "Carga"… */
  modulo: string
  /** Qué se ve en pantalla, en texto plano. Números concretos, no adjetivos. */
  resumen: string
}

let actual: ContextoModulo | null = null
const suscriptores = new Set<() => void>()

export function fijarContextoModulo(c: ContextoModulo | null) {
  actual = c
  suscriptores.forEach(f => f())
}

export function leerContextoModulo(): ContextoModulo | null {
  return actual
}

function suscribir(f: () => void) {
  suscriptores.add(f)
  return () => { suscriptores.delete(f) }
}

/** Para el panel del asistente: se re-renderiza cuando cambia de módulo. */
export function useContextoModulo(): ContextoModulo | null {
  return useSyncExternalStore(suscribir, leerContextoModulo, () => null)
}

/**
 * Para las páginas. Se declara al montar y se limpia al salir, así el asistente
 * nunca arrastra el contexto de una pantalla que ya no se está viendo.
 *
 * El `resumen` se pasa como string ya montado (no como objeto) para que la
 * comparación de dependencias sea trivial y no re-dispare en cada render.
 */
export function useDeclararModulo(modulo: string, resumen: string) {
  useEffect(() => {
    if (!resumen) { fijarContextoModulo(null); return }
    fijarContextoModulo({ modulo, resumen })
    return () => fijarContextoModulo(null)
  }, [modulo, resumen])
}
