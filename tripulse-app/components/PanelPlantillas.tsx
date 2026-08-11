'use client'
// Panel de plantillas de sesión, al lado de la zona de tareas.
//
// Una plantilla guarda ZONAS, no ritmos: al aplicarla, el ritmo de cada bloque lo
// pone el atleta a partir de sus tests (lib/zonas.ts). La misma plantilla es un
// entrenamiento distinto para cada uno.
//
// El catálogo (lib/plantillas.ts) sale de la base de Obsidian del usuario; ver
// B1-00e para el puente entre las 9 siglas de la app y esa doctrina.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cargaZona } from '@/lib/zonas'
import {
  plantillasDe, bloquesDe, textoBloque, volumenPrincipal, aplicarBloques, opcionesDe, NIVELES,
  type PlantillaSesion, type NivelPlantilla, type BloqueP,
} from '@/lib/plantillas'
import { cargarPropias, borrarPropia, type PlantillaPropia } from '@/lib/plantillas-propias'

type Pestana = 'tipo' | 'propias'

// Resumen del volumen de una lista de bloques (las propias no tienen niveles).
function volumenDe(bloques: BloqueP[]): string {
  const metros = bloques.reduce((a, b) => a + (b.metros || 0) * (b.series || 1), 0)
  if (metros > 0) return metros >= 1000 ? (metros / 1000).toFixed(1).replace('.0', '') + ' km' : metros + ' m'
  const seg = bloques.reduce((a, b) => a + (b.segundos || 0) * (b.series || 1), 0)
  if (!seg) return '—'
  const min = Math.round(seg / 60)
  return min < 60 ? min + '′' : Math.floor(min / 60) + 'h' + (min % 60 ? String(min % 60).padStart(2, '0') : '')
}

interface Props {
  sesionId: number
  disciplina: string
  nTareas: number          // cuántas tareas tiene ya la sesión
  onAplicada: () => void
  refrescar?: number       // cambia al guardar una plantilla nueva → recarga las propias
}

export default function PanelPlantillas({ sesionId, disciplina, nTareas, onAplicada, refrescar = 0 }: Props) {
  const [pestana, setPestana] = useState<Pestana>('tipo')
  const [abierta, setAbierta] = useState<string | null>(null)
  // Clave de la variante elegida dentro de la plantilla abierta. Se olvida al
  // cerrar: si no, abrir otra plantilla heredaría la variante de la anterior y
  // el entrenador vería una sesión que no ha pedido.
  const [variante, setVariante] = useState<string | null>(null)
  const [nivel, setNivel] = useState<NivelPlantilla>('intermedio')
  const [aplicando, setAplicando] = useState(false)
  const [propias, setPropias] = useState<PlantillaPropia[]>([])

  const recargarPropias = useCallback(async () => {
    setPropias(await cargarPropias(supabase, disciplina))
  }, [disciplina])

  useEffect(() => { recargarPropias() }, [recargarPropias, refrescar])

  const plantillas = plantillasDe(disciplina)
  // Fuerza y Brick no tienen plantillas: la fuerza va por cualidades (ZONAS_FUERZA)
  // y un brick se monta con su constructor.
  if (!plantillas.length) return null

  // Escribe los bloques en la sesión. Lo comparten las del sistema y las propias:
  // la única diferencia entre unas y otras es de dónde salen los bloques. La
  // escritura de tareas + parámetros vive en lib/plantillas (la comparte el pegado
  // del calendario).
  const escribir = async (bloques: BloqueP[], reemplazar: boolean) => {
    setAplicando(true)

    if (reemplazar && nTareas > 0) {
      const { data: previas } = await supabase.from('tarea').select('id').eq('id_sesion', sesionId)
      const ids = (previas || []).map((t: any) => t.id)
      if (ids.length) {
        // Los parámetros cuelgan de la tarea: si se borra la tarea sin ellos, quedan huérfanos.
        await supabase.from('p_distancia').delete().in('id_tarea', ids)
        await supabase.from('p_duracion').delete().in('id_tarea', ids)
        await supabase.from('tarea').delete().eq('id_sesion', sesionId)
      }
    }

    const err = await aplicarBloques(supabase, sesionId, disciplina, bloques, reemplazar ? 0 : nTareas)
    if (err) { alert('No se ha podido aplicar la plantilla.\n\n' + err); setAplicando(false); return }

    setAplicando(false)
    setAbierta(null)
    onAplicada()
  }

  const pedirYAplicar = (bloques: BloqueP[]) => {
    if (nTareas === 0) { escribir(bloques, true); return }
    // Reemplazar sin avisar destruiría el trabajo del entrenador.
    const r = confirm(
      'Esta sesión ya tiene ' + nTareas + (nTareas === 1 ? ' tarea' : ' tareas') + '.\n\n' +
      'Aceptar = reemplazarlas por la plantilla\nCancelar = añadir la plantilla al final',
    )
    escribir(bloques, r)
  }

  const eliminar = async (p: PlantillaPropia) => {
    if (!confirm('¿Borrar la plantilla «' + p.nombre + '»?\n\nLas sesiones que ya creaste con ella no se tocan.')) return
    const err = await borrarPropia(supabase, p.id)
    if (err) { alert('No se ha podido borrar.\n\n' + err); return }
    await recargarPropias()
  }

  // Lista de bloques de una plantilla, común a las dos pestañas.
  const ListaBloques = ({ bloques }: { bloques: BloqueP[] }) => (
    <div className="flex flex-col gap-0.5">
      {bloques.map((b, i) => {
        const c = cargaZona(b.zona).color
        return (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
            <span className="text-gray-500 w-9 flex-shrink-0">{b.zona}</span>
            <span className="text-gray-300">{textoBloque(b)}</span>
            {b.descansoSeg ? <span className="text-gray-600">rec {b.descansoSeg >= 60 ? Math.round(b.descansoSeg / 60) + '′' : b.descansoSeg + '″'}</span> : null}
            {b.nota && <span className="text-gray-600 truncate">· {b.nota}</span>}
          </div>
        )
      })}
    </div>
  )

  return (
    // Sin margen negativo: el panel es la columna derecha de una fila que empieza en la
    // gráfica, así que ya nace a su altura (ver app/sesion/[id]/page.tsx).
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <p className="font-semibold text-white text-sm mb-1">📋 Plantillas</p>
      <p className="text-gray-500 text-[11px] mb-3 leading-relaxed">
        Guardan zonas, no ritmos: el ritmo lo pone cada atleta con sus tests.
      </p>

      {/* Tipo vs propias: son cosas distintas (doctrina vs criterio del entrenador),
          así que no se mezclan en una misma lista. */}
      <div className="flex gap-1 mb-2.5 bg-gray-800/60 p-0.5 rounded-lg">
        {([['tipo', 'Tipo'], ['propias', 'Propias']] as [Pestana, string][]).map(([id, label]) => (
          <button key={id} onClick={() => { setPestana(id); setAbierta(null) }}
            className={'flex-1 text-[11px] py-1.5 rounded-md transition ' +
              (pestana === id ? 'bg-gray-700 text-white font-medium' : 'text-gray-500 hover:text-gray-300')}>
            {label}{id === 'propias' && propias.length > 0 ? ' · ' + propias.length : ''}
          </button>
        ))}
      </div>

      {/* El nivel solo aplica a las del sistema: las propias salen de una sesión
          real, que tiene un único volumen. */}
      {pestana === 'tipo' && (
        <div className="flex gap-1 mb-3">
          {NIVELES.map(n => (
            <button key={n.id} onClick={() => setNivel(n.id)}
              className={'flex-1 text-[11px] py-1.5 rounded-lg border transition ' +
                (nivel === n.id
                  ? 'border-orange-500 bg-orange-500/10 text-white font-medium'
                  : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-600')}>
              {n.label}
            </button>
          ))}
        </div>
      )}

      {pestana === 'propias' && (
        <div className="flex flex-col gap-1.5 max-h-[28rem] overflow-y-auto mb-1">
          {propias.length === 0 ? (
            <p className="text-gray-600 text-[11px] leading-relaxed py-3 text-center">
              Aún no tienes plantillas propias.<br />
              Monta una sesión a tu gusto y usa <span className="text-gray-500">«Guardar como plantilla»</span>.
            </p>
          ) : propias.map(p => {
            const col = cargaZona(p.zona).color
            const esta = abierta === 'p' + p.id
            return (
              <div key={p.id} className={'rounded-lg border transition ' + (esta ? 'border-gray-600 bg-gray-800/60' : 'border-gray-800 bg-gray-800/30 hover:border-gray-700')}>
                <button onClick={() => setAbierta(esta ? null : 'p' + p.id)} className="w-full text-left px-2.5 py-2 flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none flex-shrink-0" style={{ background: col, color: '#0a0b0f' }}>
                    {p.zona}
                  </span>
                  <span className="text-xs text-white flex-1 truncate">{p.nombre}</span>
                  <span className="text-gray-600 text-[10px] flex-shrink-0">{volumenDe(p.bloques)}</span>
                </button>
                {esta && (
                  <div className="px-2.5 pb-2.5 flex flex-col gap-2">
                    {p.objetivo && <p className="text-gray-400 text-[11px] leading-relaxed">{p.objetivo}</p>}
                    <ListaBloques bloques={p.bloques} />
                    <div className="flex gap-1.5">
                      <button onClick={() => pedirYAplicar(p.bloques)} disabled={aplicando}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                        {aplicando ? 'Aplicando…' : 'Aplicar a esta sesión'}
                      </button>
                      <button onClick={() => eliminar(p)} title="Borrar plantilla"
                        className="px-2 text-gray-600 hover:text-red-400 text-xs transition">🗑</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className={'flex-col gap-1.5 max-h-[28rem] overflow-y-auto ' + (pestana === 'tipo' ? 'flex' : 'hidden')}>
        {plantillas.map(p => {
          const col = cargaZona(p.zona).color
          const esta = abierta === p.id
          const opciones = opcionesDe(p)
          // Si no hay nada elegido, la base. `opciones[0]` es siempre la base.
          const sel = opciones.find(o => o.clave === variante) ?? opciones[0]
          return (
            <div key={p.id} className={'rounded-lg border transition ' + (esta ? 'border-gray-600 bg-gray-800/60' : 'border-gray-800 bg-gray-800/30 hover:border-gray-700')}>
              <button onClick={() => { setAbierta(esta ? null : p.id); setVariante(null) }} className="w-full text-left px-2.5 py-2 flex items-center gap-2">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none flex-shrink-0" style={{ background: col, color: '#0a0b0f' }}>
                  {p.zona}
                </span>
                <span className="text-xs text-white flex-1 truncate">{p.nombre}</span>
                {/* Cuántas formas distintas hay de hacer esta zona. Se ve sin abrir:
                    si no, nadie descubre que existen. */}
                {opciones.length > 1 && (
                  <span className="text-gray-500 text-[9px] flex-shrink-0" title={`${opciones.length} formas de hacer esta sesión`}>
                    ×{opciones.length}
                  </span>
                )}
                {/* El entrenador tiene derecho a saber si aplica doctrina o criterio nuestro. */}
                {p.origen === 'propuesta' && <span className="text-purple-400 text-[9px]" title="Propuesta: sin respaldo en la literatura">🔵</span>}
                <span className="text-gray-600 text-[10px] flex-shrink-0">{volumenPrincipal(p, nivel, esta ? sel.varianteId : undefined)}</span>
              </button>

              {esta && (
                <div className="px-2.5 pb-2.5 flex flex-col gap-2">
                  {opciones.length > 1 && (
                    <div className="flex flex-wrap gap-1">
                      {opciones.map(o => (
                        <button key={o.clave} onClick={() => setVariante(o.clave)}
                          className={'text-[10px] px-2 py-1 rounded-md border transition ' + (o.clave === sel.clave
                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-300 font-semibold'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600')}>
                          {o.esBase ? 'Estándar' : o.nombre}
                          {o.origen === 'propuesta' && <span className="ml-1 text-purple-400">🔵</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-gray-400 text-[11px] leading-relaxed">{sel.objetivo}</p>

                  <ListaBloques bloques={bloquesDe(p, nivel, sel.varianteId)} />

                  {sel.aviso && (
                    <p className="text-purple-300/70 text-[10px] leading-relaxed bg-purple-900/20 rounded p-1.5">
                      🔵 {sel.aviso}
                    </p>
                  )}
                  <p className="text-gray-600 text-[10px]">Fuente: {sel.fuente}</p>

                  <button onClick={() => pedirYAplicar(bloquesDe(p, nivel, sel.varianteId))} disabled={aplicando}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                    {aplicando ? 'Aplicando…' : 'Aplicar a esta sesión'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
