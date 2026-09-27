'use client'
// ============================================================
// El aviso en franja: dentro de la pantalla, no en una ventana del navegador
// ============================================================
//
// ESTA PIEZA YA EXISTÍA, en /laboratorio: una franja con borde, verde cuando sale
// bien y roja cuando no, que se va sola a los cuatro segundos. Aquí solo se saca
// del fichero donde vivía para poder usarla en las demás pantallas.
//
// POR QUÉ IMPORTA. El resto de la app avisaba con `alert()`, que es la ventana
// gris DEL NAVEGADOR: no se parece a TRIPULSE, tapa la pantalla y en el móvil sale
// como un aviso del sistema. Para «no se ha podido guardar» hasta viene bien que
// bloquee —si se te escapa, te vas creyendo que quedó guardado—, pero para «te
// falta un dato» es un mazazo: lo que quieres es leerlo y seguir rellenando.
//
// LO QUE NO ES: un aviso flotante que se apila. Es una franja en el sitio donde
// se pone, dentro del flujo de la página.

import { useCallback, useEffect, useRef, useState } from 'react'

export type Aviso = { tipo: 'ok' | 'mal'; texto: string } | null

export function AvisoEnLinea({ aviso, className = '' }: { aviso: Aviso; className?: string }) {
  if (!aviso) return null
  return (
    <div
      /* `polite` y no `assertive`: se lee cuando el lector de pantalla termine lo
         que está diciendo, que es lo que quiere quien acaba de pulsar un botón. */
      role="status" aria-live="polite"
      className={'px-4 py-2.5 rounded-xl text-[13px] border ' + (aviso.tipo === 'ok'
        ? 'bg-green-500/10 border-green-500/30 text-green-300'
        : 'bg-red-500/10 border-red-500/30 text-red-300') + ' ' + className}>
      {aviso.texto}
    </div>
  )
}

/**
 * El estado del aviso y el «se va solo», que es como se usa siempre.
 *
 * EL TEMPORIZADOR SE CANCELA, y no es un detalle: la versión que había en
 * /laboratorio pedía un `setTimeout` nuevo en cada aviso sin cancelar el
 * anterior, así que dos avisos seguidos se comían el uno al otro — el reloj del
 * primero borraba el segundo a mitad de su tiempo.
 */
export function useAviso(segundos = 4) {
  const [aviso, setAviso] = useState<Aviso>(null)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)

  const avisar = useCallback((tipo: 'ok' | 'mal', texto: string) => {
    if (reloj.current) clearTimeout(reloj.current)
    setAviso({ tipo, texto })
    reloj.current = setTimeout(() => setAviso(null), segundos * 1000)
  }, [segundos])

  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current) }, [])

  return {
    aviso,
    /** Salió bien. */
    ok: useCallback((texto: string) => avisar('ok', texto), [avisar]),
    /** Falta algo, o no se puede. */
    mal: useCallback((texto: string) => avisar('mal', texto), [avisar]),
    limpiar: useCallback(() => {
      if (reloj.current) clearTimeout(reloj.current)
      setAviso(null)
    }, []),
  }
}
