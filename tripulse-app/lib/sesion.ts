// ============================================================
// Quién ha entrado: una sola respuesta para toda la página
// ============================================================
// Sidebar, AsistenteFlotante, NavDeportista y la propia página preguntaban cada
// uno por su cuenta. Eso son cuatro `auth.getUser()` simultáneos en cada carga, y
// supabase-js serializa esa llamada con un candado del navegador: el que llega
// tarde le ROBA el candado al anterior y el anterior revienta. De ahí el
// NavigatorLockAcquireTimeoutError + AbortError que llenaba la consola.
//
// No rompía nada visible, pero ensuciaba el log (y con él, cualquier error de
// verdad) y hacía tres o cuatro viajes de red para preguntar lo mismo.
//
// Aquí se pregunta UNA vez: las llamadas simultáneas comparten la promesa en
// vuelo y las posteriores leen lo guardado. Se tira todo al entrar o salir, que
// es cuando de verdad cambia.

import { supabase } from './supabase'

type Ranura = { valor: any; lleno: boolean; enVuelo: Promise<any> | null }
const nuevaRanura = (): Ranura => ({ valor: null, lleno: false, enVuelo: null })

const rUsuario = nuevaRanura()
const rPerfil = nuevaRanura()
const rDeportista = nuevaRanura()

export function limpiarSesion() {
  for (const r of [rUsuario, rPerfil, rDeportista]) {
    r.valor = null; r.lleno = false; r.enVuelo = null
  }
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange(evento => {
    // INITIAL_SESSION salta en cada carga y TOKEN_REFRESHED no cambia quién eres:
    // tirar la caché ahí sería vaciarla justo después de llenarla.
    if (evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') return
    limpiarSesion()
  })
}

// Un fallo puntual de red NO se guarda: si guardáramos el null, el usuario
// parecería deslogueado el resto de la página. Se devuelve null y el siguiente
// que pregunte reintenta.
function unaSolaVez(r: Ranura, consulta: () => Promise<any>): Promise<any> {
  if (r.lleno) return Promise.resolve(r.valor)
  if (!r.enVuelo) {
    r.enVuelo = consulta()
      .then(v => { r.valor = v; r.lleno = true; return v })
      .catch(() => null)
      .finally(() => { r.enVuelo = null })
  }
  return r.enVuelo
}

/** El usuario autenticado, o null si no hay sesión. */
export function usuarioActual(): Promise<any> {
  return unaSolaVez(rUsuario, async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    return data.user ?? null
  })
}

/** Su fila de `perfiles` (rol, nombre...), o null. */
export function perfilActual(): Promise<any> {
  return unaSolaVez(rPerfil, async () => {
    const user = await usuarioActual()
    // Sin usuario hay dos casos distintos y no se pueden tratar igual: si la
    // ranura quedó vacía es que la consulta falló, y cachear ese null dejaría la
    // página entera creyendo que no hay nadie. Se propaga para no guardarlo.
    if (!user) {
      if (!rUsuario.lleno) throw new Error('usuario no fiable')
      return null
    }
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (error) throw error
    return data ?? null
  })
}

/** Su fila de `deportista` si el rol es deportista; null si es entrenador o no la tiene. */
export function deportistaActual(): Promise<any> {
  return unaSolaVez(rDeportista, async () => {
    const user = await usuarioActual()
    if (!user) {
      if (!rUsuario.lleno) throw new Error('usuario no fiable')
      return null
    }
    const { data, error } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
    if (error) throw error
    return data ?? null
  })
}
