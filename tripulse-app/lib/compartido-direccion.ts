'use client'
// ============================================================
// Lo que se comparte entre un director y sus entrenadores
// ============================================================
// Los tests propios (laboratorio), las zonas propias y las plantillas de
// sesión se comparten EN LOS DOS SENTIDOS entre un director y cada entrenador
// con el que trabaja (supabase/director-3-compartido.sql): el entrenador usa los
// del director y el director los del entrenador. USAR, no cambiar: cada test,
// zona o plantilla solo lo edita o lo borra quien lo creó, y la base lo impide
// aunque la pantalla se equivocara.
//
// Aquí se sabe QUIÉNES son esos «socios» (tu director, o los entrenadores que
// diriges) y cómo se llaman, para poner «de Pedro» en lo que no es tuyo.

import { supabase } from './supabase'

export type Socio = { id: string; nombre: string | null; papel: 'director' | 'entrenador' }

/* Una consulta por minuto como mucho: la lista cambia solo cuando alguien
   acepta o corta una relación, y varias pantallas la piden a la vez. */
let enCache: { hasta: number; p: Promise<Socio[]> } | null = null

export function sociosDeDireccion(): Promise<Socio[]> {
  const ahora = Date.now()
  if (!enCache || enCache.hasta < ahora) {
    const p: Promise<Socio[]> = Promise.resolve(supabase.rpc('mis_socios_de_direccion'))
      .then(({ data, error }) => (error ? [] : ((data || []) as Socio[])))
      .catch(() => [] as Socio[])
    enCache = { hasta: ahora + 60_000, p }
  }
  return enCache.p
}

/** Los dueños cuyos tests, zonas y plantillas puede USAR quien ha entrado: él
 *  mismo y sus socios de dirección. Va en `.in('id_entrenador', …)`. */
export async function duenosCompartidos(miId: string): Promise<string[]> {
  const socios = await sociosDeDireccion()
  return [miId, ...socios.map(s => s.id).filter(id => id !== miId)]
}

/** «Pedro (tu director)», «Laura»: de quién es algo que no es tuyo. null si es tuyo. */
export function deQuien(idDueno: string | null | undefined, miId: string | null, socios: Socio[]): string | null {
  if (!idDueno || idDueno === miId) return null
  const s = socios.find(x => x.id === idDueno)
  if (!s) return 'otro entrenador'
  const pila = (s.nombre || '').trim().split(' ')[0] || (s.papel === 'director' ? 'tu director' : 'tu entrenador')
  return s.papel === 'director' ? pila + ' (tu director)' : pila
}
