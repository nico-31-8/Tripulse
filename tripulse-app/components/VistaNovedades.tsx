'use client'
// ============================================================
// La pantalla de novedades
// ============================================================
// Solo pinta. El fichero lo lee el componente de servidor y el troceado vive en
// `lib/novedades`, que es donde se puede probar.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { trozos, ultimaFecha, type Novedades, type Bloque } from '@/lib/novedades'

/** Una línea con su negrita y su código, sin inyectar HTML en ningún momento. */
function Linea({ texto }: { texto: string }) {
  return (
    <>
      {trozos(texto).map((t, i) =>
        t.tipo === 'fuerte' ? <strong key={i} className="font-semibold text-white">{t.texto}</strong>
        : t.tipo === 'codigo' ? <code key={i} className="font-mono text-[0.9em] text-orange-300 bg-white/[0.06] px-1.5 py-0.5 rounded">{t.texto}</code>
        : <span key={i}>{t.texto}</span>,
      )}
    </>
  )
}

function Cuerpo({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="flex flex-col gap-3">
      {bloques.map((b, i) =>
        b.tipo === 'titulo' ? (
          <h3 key={i} className="text-[15px] font-semibold text-white mt-3 first:mt-0">{b.texto}</h3>
        ) : b.tipo === 'lista' ? (
          <ul key={i} className="flex flex-col gap-2">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5 text-[13.5px] text-gray-400 leading-relaxed">
                <span className="text-orange-500/70 select-none mt-[7px] w-1 h-1 rounded-full bg-orange-500/70 shrink-0" />
                <span><Linea texto={it} /></span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-[13.5px] text-gray-400 leading-relaxed"><Linea texto={b.texto} /></p>
        ),
      )}
    </div>
  )
}

export default function VistaNovedades({ novedades }: { novedades: Novedades }) {
  const router = useRouter()
  const [listo, setListo] = useState(false)

  /* Cualquiera que haya entrado puede verla, entrenador o deportista: es lo que
     ha cambiado en la aplicación que los dos usan. Pero no se enseña sin
     sesión, como el resto. */
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelado) return
      if (!session?.user) { router.replace('/login'); return }
      setListo(true)
    })()
    return () => { cancelado = true }
  }, [router])

  if (!listo) return null

  const ultima = ultimaFecha(novedades)
  const vacio = novedades.entradas.length === 0

  return (
    <div className="min-h-screen bg-[#080b10] text-white">
      <div className="max-w-3xl mx-auto px-5 py-10">

        <button onClick={() => router.back()}
          className="text-gray-500 hover:text-white text-sm transition mb-6">
          ← Volver
        </button>

        <h1 className="text-3xl font-bold tracking-tight">{novedades.titulo || 'Novedades'}</h1>
        {ultima && (
          <p className="text-gray-500 text-sm mt-2">Última actualización: {ultima}</p>
        )}

        {novedades.intro.length > 0 && (
          <div className="mt-6 rounded-xl border border-white/[0.075] bg-white/[0.02] p-5">
            <Cuerpo bloques={novedades.intro} />
          </div>
        )}

        {vacio ? (
          /* Un hueco mudo se leería como «no hay novedades», que sería falso: lo
             que pasa es que no se ha podido leer el fichero. */
          <p className="mt-10 text-gray-500 text-sm">
            No se ha podido cargar la lista de novedades. El historial completo sigue
            estando en el repositorio.
          </p>
        ) : (
          <div className="mt-10 flex flex-col gap-8">
            {novedades.entradas.map((e, i) => (
              <section key={i} className="relative pl-6">
                {/* La línea de tiempo: un hilo con un punto por entrada. */}
                <span className="absolute left-0 top-2 w-2 h-2 rounded-full bg-orange-500" />
                {i < novedades.entradas.length - 1 && (
                  <span className="absolute left-[3.5px] top-5 bottom-[-32px] w-px bg-white/[0.08]" />
                )}

                <h2 className={'font-semibold tracking-tight ' +
                  (i === 0 ? 'text-orange-400 text-lg' : 'text-gray-300 text-[15px]')}>
                  {e.fecha}
                </h2>
                <div className="mt-3">
                  <Cuerpo bloques={e.cuerpo} />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
