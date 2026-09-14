'use client'
// ============================================================
// TRIPULSE — «Quién necesita que le mires hoy», en la entrada del panel
// ============================================================
// Las señales (lib/senales) se calculaban solo del atleta abierto, y al entrar
// no hay ninguno abierto. O sea que para enterarse de que a alguien le está
// costando más de lo previsto había que sospecharlo primero y abrirlo. Esto le
// da la vuelta: la app dice el nombre y lo primero que le pasa, y con un clic se
// abre su panel, que es donde está el porqué y la acción.
//
// Sin nadie con señales no se pinta nada: un aviso que siempre está deja de
// verse (mismo criterio que AvisoComunicacion).

import { textoEquipo, COLOR_SENAL, type AtletaConSenales } from '@/lib/senales'

/** Cuántos nombres caben antes de que esto deje de leerse de un vistazo. */
const MAX_NOMBRES = 6

export default function AvisoSenales({ atletas, onAbrir, className = '' }: {
  atletas: AtletaConSenales[]
  onAbrir: (id: number) => void
  className?: string
}) {
  const texto = textoEquipo(atletas)
  if (!texto) return null

  const visibles = atletas.slice(0, MAX_NOMBRES)
  const resto = atletas.length - visibles.length
  // El color del aviso es el del caso más grave: si hay una roja, se ve roja.
  const tono = COLOR_SENAL[atletas[0].nivel]

  return (
    <div role="status" className={'w-full rounded-2xl border px-4 py-3 text-left ' + className}
      style={{ borderColor: tono + '40', background: tono + '12' }}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="w-9 h-9 rounded-xl grid place-items-center text-lg flex-shrink-0"
          style={{ background: tono + '26' }}>📡</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{texto}</p>
          <p className="text-xs text-gray-400 mt-0.5">Abre su panel para ver el dato y qué hacer.</p>
        </div>
      </div>

      <ul className="mt-2.5 flex flex-col gap-1">
        {visibles.map(a => (
          <li key={a.id}>
            <button type="button" onClick={() => onAbrir(a.id)}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-lg text-left transition hover:bg-white/[0.05]">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: COLOR_SENAL[a.nivel] }} />
              <span className="text-[13px] font-semibold text-gray-200 flex-shrink-0">{a.nombre.split(' ')[0]}</span>
              <span className="text-[13px] text-gray-400 truncate">{a.titular}</span>
              {a.n > 1 && (
                <span className="ml-auto flex-shrink-0 text-[11px] text-gray-500 tabular-nums"
                  title={a.n + ' señales'}>+{a.n - 1}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {resto > 0 && (
        <p className="text-xs text-gray-500 mt-1 px-2">y {resto} más</p>
      )}
    </div>
  )
}
