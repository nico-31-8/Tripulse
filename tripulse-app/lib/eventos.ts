// ============================================================
// Registro de errores de la app
// ============================================================
// Hasta ahora un error del cliente se lo quedaba la consola del navegador de
// quien lo sufría, o sea nadie. Esto los manda a `evento_app` para poder verlos
// desde /admin.
//
// Tres reglas, y las tres son para que esto no se convierta en un problema:
//   1. NUNCA reventar. Si el registro falla, se calla: un error contando un
//      error no puede romper la pantalla.
//   2. NUNCA mandar datos del usuario. Solo mensaje, ruta y pila. Nada de
//      valores de formularios ni de contenido de las sesiones.
//   3. No repetirse. El mismo mensaje desde la misma ruta se manda una vez por
//      carga: un error dentro de un render puede dispararse cien veces seguidas.

import { supabase } from './supabase'

const yaVistos = new Set<string>()

export function registrarEvento(
  nivel: 'error' | 'aviso' | 'info',
  mensaje: string,
  detalle?: Record<string, any>,
) {
  try {
    if (typeof window === 'undefined') return
    const origen = window.location.pathname
    const huella = nivel + '|' + origen + '|' + mensaje
    if (yaVistos.has(huella)) return
    yaVistos.add(huella)

    // Sin await: esto acompaña al fallo, no lo bloquea.
    supabase.rpc('registrar_evento', {
      _nivel: nivel,
      _mensaje: String(mensaje).slice(0, 2000),
      _origen: origen,
      _detalle: detalle ?? null,
      _agente: navigator.userAgent.slice(0, 300),
    }).then(() => {}, () => {})
  } catch {
    /* ver regla 1 */
  }
}

let enganchado = false

/** Engancha los dos sitios por donde se escapa un error no capturado. */
export function engancharErroresGlobales() {
  if (enganchado || typeof window === 'undefined') return
  enganchado = true

  window.addEventListener('error', ev => {
    registrarEvento('error', ev.message || 'Error sin mensaje', {
      fichero: ev.filename, linea: ev.lineno, columna: ev.colno,
      pila: ev.error?.stack?.slice(0, 1200),
    })
  })

  // Una promesa que revienta sin catch no dispara 'error'. Es justo donde caen
  // los fallos de las consultas a supabase.
  window.addEventListener('unhandledrejection', ev => {
    const r: any = ev.reason
    registrarEvento('error', r?.message || String(r) || 'Promesa rechazada', {
      pila: r?.stack?.slice(0, 1200),
    })
  })
}
