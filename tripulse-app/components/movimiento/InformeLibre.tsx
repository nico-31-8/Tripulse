'use client'
// ============================================================
// El informe de un análisis libre, para descargar o imprimir
// ============================================================
//
// v3 del analizador, paso 3 (17-10-2026). Como el de las baterías, solo para el
// entrenador: es la forma de mandárselo a una persona externa. Lleva sus notas,
// cada fotograma con sus medidas, las gráficas que se elijan al descargarlo (las
// que se estaban mirando salen marcadas) y lo recorrido en el vídeo. Lo que
// dice lo arma lib/analisis-libre; el marco que imprime es el de HojaInforme.
//
// LAS IMÁGENES: las subidas (con permiso), por su enlace; y las de los
// fotogramas guardados en esta sesión sin permiso, por la imagen que se compuso
// en el dispositivo, que nunca se subió: «el informe sí lo puedes descargar al
// momento: se hace en tu dispositivo».

import { useMemo } from 'react'
import { DE_VISTA } from '@/lib/baterias-movimiento'
import {
  graficasDelAnalisis, medidasDelMomento, recorridosDelAnalisis, textoDeFotograma, type AnalisisLibre, type FotogramaLibre,
} from '@/lib/analisis-libre'
import { fechaConAnio } from '@/lib/fechas'
import { GraficaInforme, MarcoInforme, NARANJA, PreguntaGraficas, useElegidas } from './HojaInforme'

export default function InformeLibre({ analisis, nombre, fotogramas, urls, locales, marcadas, cargando, error, onCerrar }: {
  analisis: AnalisisLibre
  nombre: string | null
  /** Con sus medidas (las curvas salen de ahí). */
  fotogramas: FotogramaLibre[]
  /** Los enlaces de las imágenes subidas. */
  urls: Record<string, string>
  /** Las imágenes compuestas en esta sesión, por id de fotograma (las que no se subieron también). */
  locales: Record<number, string>
  /** Las gráficas que salen marcadas. */
  marcadas?: string[]
  cargando?: boolean
  error?: string
  onCerrar: () => void
}) {
  const graficas = useMemo(() => graficasDelAnalisis(fotogramas), [fotogramas])
  const { elegidas, alternar } = useElegidas(marcadas)
  const incluidas = graficas.filter(g => elegidas.has(g.id))
  const recorridos = recorridosDelAnalisis(fotogramas)
  const imagenDe = (f: FotogramaLibre) => (f.imagen && urls[f.imagen]) || locales[f.id] || null

  return (
    <MarcoInforme etiqueta={'Informe de ' + analisis.titulo} onCerrar={onCerrar}
      tituloPdf={['Análisis', analisis.titulo, nombre, analisis.fecha].filter(Boolean).join(' · ')}
      pregunta={
        <PreguntaGraficas graficas={graficas} elegidas={elegidas} onAlternar={alternar} cargando={!!cargando} error={error ?? ''}
          vacio="Ningún fotograma guardado lleva gráfica. Salen al guardar un fotograma analizado de perfil con el esqueleto." />
      }>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-[#16181d] pb-3.5">
        <div className="min-w-0">
          <p className="text-[12px] font-bold tracking-[0.04em]" style={{ color: NARANJA }}>TRIPULSE</p>
          <h2 className="text-[22px] font-bold tracking-tight mt-1 mb-0.5">Análisis · {analisis.titulo}</h2>
          <p className="text-[#5b6170]">{[nombre, fechaConAnio(analisis.fecha), 'grabado ' + DE_VISTA[analisis.vista]].filter(Boolean).join(' · ')}</p>
        </div>
        <p className="font-mono text-[13px] text-[#5b6170]">{fotogramas.length === 1 ? '1 fotograma' : fotogramas.length + ' fotogramas'}</p>
      </header>

      {analisis.notas?.trim() && (
        <section className="sin-cortar">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Notas</h3>
          <p className="m-0 whitespace-pre-wrap">{analisis.notas}</p>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] m-0">Fotogramas</h3>
        {cargando && !fotogramas.length && <p className="m-0 text-[#5b6170]">Cargando los fotogramas…</p>}
        {!cargando && !fotogramas.length && <p className="m-0 text-[#5b6170]">Todavía no hay ningún fotograma guardado.</p>}
        {fotogramas.map((f, i) => {
          const img = imagenDe(f)
          const cuando = textoDeFotograma(f)
          const medidas = medidasDelMomento(f)
          return (
            <figure key={f.id} className="sin-cortar m-0 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={'Fotograma ' + (i + 1)} className="w-full h-auto max-h-[420px] object-contain rounded-md border border-[#e3e5ea] bg-[#0b0f14]" />
              ) : (
                <div className="rounded-md border border-dashed border-[#c9ccd4] p-4 text-[11px] text-[#6b7280] text-center">
                  Sin imagen: no se guardó (falta su permiso) y no se hizo en esta sesión.
                </div>
              )}
              <figcaption className="text-[12px] flex flex-col gap-1.5">
                <b className="text-[13px]">Fotograma {i + 1}{cuando ? <span className="font-normal text-[#5b6170]"> · {cuando}</span> : null}</b>
                {medidas.length ? (
                  <table className="w-full border-collapse text-[11.5px]">
                    <tbody>
                      {medidas.map(m => (
                        <tr key={m.nombre}>
                          <td className="border-b border-[#eceef2] py-1 pr-2 text-[#4b5160]">{m.nombre}</td>
                          <td className="border-b border-[#eceef2] py-1 text-right font-mono">{m.valor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="text-[#6b7280]">Sin medidas en este fotograma.</span>
                )}
              </figcaption>
            </figure>
          )
        })}
      </section>

      {incluidas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] m-0">Gráficas</h3>
          {incluidas.map(g => <GraficaInforme key={g.id} g={g} />)}
        </section>
      )}

      {recorridos.length > 0 && (
        <section className="sin-cortar">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">A lo largo del vídeo</h3>
          <table className="w-full border-collapse text-[11.5px]">
            <tbody>
              {recorridos.map(r => (
                <tr key={r.nombre + r.valor}>
                  <td className="border-b border-[#eceef2] py-1 pr-2 text-[#4b5160]">{r.nombre}</td>
                  <td className="border-b border-[#eceef2] py-1 pr-2 text-right font-mono">{r.valor}</td>
                  <td className="border-b border-[#eceef2] py-1 text-right text-[#8a909c] whitespace-nowrap">{r.fotogramas.includes(' y ') ? 'fotogramas ' : 'fotograma '}{r.fotogramas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="border-t border-[#d4d7de] pt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10.5px] text-[#6b7280]">
        <span className="max-w-[60ch]">
          Las medidas del esqueleto salen de una sola cámara: de perfil, la rodilla, el tronco y la tibia son fiables; la cadera y el fémur van con margen; el tobillo, el hombro y el codo no están comprobados.
        </span>
        <span>tripulse.app</span>
      </footer>
    </MarcoInforme>
  )
}
