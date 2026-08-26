'use client'
// ============================================================
// El cartel de «vamos a estar caídos»
// ============================================================
// Una franja arriba del todo, en todas las pantallas, que se enciende y se
// APAGA SOLA. Eso último es lo que la hace fiable: un cartel de mantenimiento
// que alguien tiene que acordarse de quitar acaba quedándose puesto una semana,
// y a partir de ahí nadie se lo cree la próxima vez.
//
// SE VE TAMBIÉN SIN SESIÓN.
// La política de lectura del aviso es abierta a propósito: la pantalla de
// entrar es justo contra la que se choca cuando la app está caída, y es donde
// más falta hace saber por qué.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { avisoVigente, momentoDe, textoDe, type Aviso } from '@/lib/avisos'

export default function AvisoMantenimiento() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [cerrado, setCerrado] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      /* Solo los que aún no han caducado. Si la tabla no existe todavía, `data`
         viene vacío y aquí no pasa nada: el cartel simplemente no sale. */
      const { data } = await supabase.from('aviso_app')
        .select('id, mensaje, desde, hasta')
        .gte('hasta', new Date().toISOString())
        .order('desde').limit(5)
      if (vivo) setAviso(avisoVigente((data as Aviso[]) || []))
    })()
    return () => { vivo = false }
  }, [])

  /* Se repasa cada minuto para que el texto pase solo de «va a estar» a «estamos
     actualizando» y luego desaparezca, sin que nadie recargue nada. */
  const [, refresco] = useState(0)
  useEffect(() => {
    if (!aviso) return
    const t = setInterval(() => refresco(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [aviso])

  if (!aviso || cerrado) return null

  const momento = momentoDe(aviso)
  if (momento !== 'anuncio' && momento !== 'en curso') return null

  const enCurso = momento === 'en curso'

  return (
    <div className={'w-full text-center px-4 py-2 text-[13px] leading-snug flex items-center justify-center gap-3 '
      + (enCurso
        ? 'bg-orange-500 text-white'
        : 'bg-amber-500/15 text-amber-200 border-b border-amber-500/25')}>
      <span className="flex-1 max-w-3xl">
        <b className="font-semibold">{enCurso ? 'Mantenimiento en curso.' : 'Aviso.'}</b>{' '}
        {textoDe(aviso)}
        {aviso.mensaje && <span className="opacity-90"> {aviso.mensaje}</span>}
      </span>
      {/* Se puede cerrar solo cuando es un anuncio. Durante el mantenimiento no:
          si la app va a fallar, esconder el porqué es dejar a la persona
          pensando que el roto es suyo. */}
      {!enCurso && (
        <button onClick={() => setCerrado(true)} aria-label="Cerrar el aviso"
          className="flex-none opacity-70 hover:opacity-100 text-[15px] leading-none transition">×</button>
      )}
    </div>
  )
}
