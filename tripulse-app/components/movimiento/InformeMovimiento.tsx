'use client'
// ============================================================
// El informe de una batería de movimiento, para descargar o imprimir
// ============================================================
//
// v3 del analizador, paso 2 (17-10-2026). SOLO PARA EL ENTRENADOR: se abre desde
// la pestaña Movimiento de Tests y no sale en Mis tests del deportista; si se lo
// manda, lo decide el entrenador. Lo que dice lo arma lib/informe-movimiento;
// aquí va la hoja. El marco que imprime y la pregunta de qué gráficas incluir
// (ninguna, de entrada) son los de components/movimiento/HojaInforme.
//
// Las curvas pesan y las listas no las traen: se piden al abrir (cargarMedidas),
// con enlaces nuevos de los fotogramas (los de la pestaña caducan a la hora).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resultadoBateria, type DefBateria } from '@/lib/baterias-movimiento'
import { cargarMedidas, rutasDe, urlsFotogramas, type FilaPrueba, type Medida, type Valoracion } from '@/lib/movimiento-datos'
import {
  cambiosDesde, enLista, faltanDe, filasDelInforme, fotogramasDelInforme, graficasDisponibles, queTrabajar, textoCambios,
  textoDolores, textoTambien,
} from '@/lib/informe-movimiento'
import { fechaConAnio, fechaCorta } from '@/lib/fechas'
import { GraficaInforme, MarcoInforme, NARANJA, PreguntaGraficas, TINTA, useElegidas } from './HojaInforme'

export default function InformeMovimiento({ def, valoracion, registros, previa, nombre, permiso, urls: urlsDeAntes, onCerrar }: {
  def: DefBateria
  valoracion: Valoracion
  /** Sus pruebas. Las medidas se cargan al abrir; las que ya traigan valen mientras tanto (o si no hay en la base). */
  registros: FilaPrueba[]
  /** La anterior completa de la misma batería, para comparar. */
  previa: { valoracion: Valoracion; registros: FilaPrueba[] } | null
  nombre: string | null
  /** Si dio permiso para guardar imágenes: sin él no hay fotogramas, y se dice por qué. */
  permiso: boolean
  /** Los enlaces de los fotogramas que ya se tengan: se enseñan ya y se renuevan al abrir. */
  urls?: Record<string, string>
  onCerrar: () => void
}) {
  const [medidas, setMedidas] = useState<Record<number, Medida[]> | null>(null)
  /** Las de la otra vista, en las pruebas de dos. */
  const [segundas, setSegundas] = useState<Record<number, Medida[]>>({})
  const [urls, setUrls] = useState<Record<string, string>>(() => urlsDeAntes ?? {})
  const [error, setError] = useState('')
  const { elegidas, alternar } = useElegidas()

  const rutas = rutasDe(registros)
  const claveRutas = rutas.join('|')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [m, u] = await Promise.all([cargarMedidas(supabase, valoracion.id), urlsFotogramas(supabase, claveRutas ? claveRutas.split('|') : [])])
      if (!vivo) return
      if (m.error) setError('No se han podido cargar las gráficas: ' + m.error)
      setMedidas(m.medidas)
      setSegundas(m.segundas)
      setUrls(antes => ({ ...antes, ...u }))
    })()
    return () => { vivo = false }
  }, [valoracion.id, claveRutas])

  const conMedidas = useMemo(
    () => (medidas ? registros.map(r => ({
      ...r,
      medidas: medidas[r.id] ?? r.medidas ?? null,
      segunda_vista: r.segunda_vista ? { ...r.segunda_vista, medidas: segundas[r.id] ?? r.segunda_vista.medidas ?? null } : r.segunda_vista,
    })) : registros),
    [registros, medidas, segundas],
  )
  const graficas = useMemo(() => (medidas ? graficasDisponibles(def, conMedidas) : []), [def, conMedidas, medidas])

  const res = resultadoBateria(def, registros)
  const ant = previa ? resultadoBateria(def, previa.registros) : null
  const delta = ant && ant.completa && res.completa ? res.total - ant.total : null
  const trabajo = queTrabajar(def, registros)
  const cambios = cambiosDesde(def, registros, previa?.registros ?? null)
  const filas = filasDelInforme(def, registros, previa?.registros ?? null)
  const faltan = faltanDe(def, registros)
  const fotos = fotogramasDelInforme(def, conMedidas).filter(f => urls[f.ruta])
  const incluidas = graficas.filter(g => elegidas.has(g.id))
  const fechaAntes = previa ? fechaConAnio(previa.valoracion.fecha) : ''

  return (
    <MarcoInforme etiqueta={'Informe del ' + def.nombre} onCerrar={onCerrar}
      tituloPdf={['Informe', def.nombre, nombre, valoracion.fecha].filter(Boolean).join(' · ')}
      pregunta={
        <PreguntaGraficas graficas={graficas} elegidas={elegidas} onAlternar={alternar} cargando={!medidas} error={error}
          vacio={`Ninguna prueba de este ${def.nombre} tiene gráfica. Salen al analizar una prueba de perfil con el esqueleto y guardarla.`} />
      }>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-[#16181d] pb-3.5">
        <div className="min-w-0">
          <p className="text-[12px] font-bold tracking-[0.04em]" style={{ color: NARANJA }}>TRIPULSE</p>
          <h2 className="text-[22px] font-bold tracking-tight mt-1 mb-0.5">Informe · {def.nombre}</h2>
          <p className="text-[#5b6170]">
            {[nombre, fechaConAnio(valoracion.fecha), valoracion.modo === 'video' ? 'analizado en vídeo' : 'apuntado a mano'].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[38px] font-bold leading-none tracking-tight">
            {res.total}<span className="text-[17px] font-medium text-[#6b7280]"> {res.completa ? '/ ' : 'de '}{res.maximo}</span>
          </p>
          {delta != null && (
            <p className={'text-[12px] font-semibold mt-1 ' + (delta > 0 ? 'text-[#15803d]' : delta < 0 ? 'text-[#b91c1c]' : 'text-[#5b6170]')}>
              {delta === 0 ? 'Igual que el ' + fechaAntes : (delta > 0 ? '+' : '') + delta + ' desde el ' + fechaAntes}
            </p>
          )}
        </div>
      </header>

      {faltan.length > 0 && (
        <p className="sin-cortar rounded-md bg-[#fef3c7] text-[#78350f] px-3 py-2">
          <b>A medias:</b> falta{faltan.length > 1 ? 'n' : ''} {enLista(faltan.map(n => n.charAt(0).toLowerCase() + n.slice(1)))}. El total de verdad sale cuando estén todas.
        </p>
      )}

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="sin-cortar">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Lo que hay que trabajar</h3>
          {trabajo.puntos.length === 0 ? (
            <p className="m-0">
              {res.completa ? 'Todas las pruebas a 3: nada por debajo.' : res.hechas ? 'Nada por debajo de 3 en las pruebas hechas.' : 'Todavía no hay ninguna prueba puntuada.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {trabajo.puntos.map(p => (
                <div key={p.prueba} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
                  <span className="w-[22px] h-[22px] rounded-md grid place-items-center font-mono text-[12px] font-bold text-white"
                    style={{ background: TINTA[p.nota] }} aria-label={'Nota ' + p.nota}>{p.nota}</span>
                  <p className="m-0"><b>{p.titulo}.</b> {p.detalle}</p>
                </div>
              ))}
              {trabajo.tambien.length > 0 && <p className="m-0 text-[#5b6170]">{textoTambien(trabajo.tambien)}</p>}
            </div>
          )}
        </div>
        <div className="sin-cortar">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Lo que ha cambiado</h3>
          {!previa ? (
            <p className="m-0">No hay otro {def.nombre} completo anterior con el que comparar.</p>
          ) : !cambios.suben.length && !cambios.bajan.length ? (
            <p className="m-0">Todas las pruebas igual que el {fechaAntes}.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {cambios.suben.length > 0 && <p className="m-0"><b className="text-[#15803d]">Suben</b> desde el {fechaAntes}: {textoCambios(cambios.suben)}.</p>}
              {cambios.bajan.length > 0 && <p className="m-0"><b className="text-[#b91c1c]">Bajan</b>{cambios.suben.length ? '' : ' desde el ' + fechaAntes}: {textoCambios(cambios.bajan)}.</p>}
            </div>
          )}
          <p className="m-0 mt-2 text-[#5b6170]">{textoDolores(def, registros)}</p>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Prueba a prueba</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px] text-[#16181d]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.04em] text-[#5b6170]">
                <th className="text-left font-semibold border-b border-[#d4d7de] px-1 py-1.5">Prueba</th>
                <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-12">Izq</th>
                <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-12">Der</th>
                <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-12">Nota</th>
                {previa && <th className="text-center font-semibold border-b border-[#d4d7de] px-1 py-1.5 w-14 whitespace-nowrap">{fechaCorta(previa.valoracion.fecha)}</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map(x => (
                <tr key={x.prueba} className="sin-cortar">
                  <td className="border-b border-[#eceef2] px-1 py-1.5">
                    {x.nombre}{x.porDolor && <span className="text-[10.5px] text-[#b91c1c] font-semibold"> · duele</span>}
                  </td>
                  {x.bilateral ? (
                    <>
                      <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono font-bold" style={{ color: x.izq != null ? TINTA[x.izq] : '#8a909c' }}>{x.izq ?? '—'}</td>
                      <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono font-bold" style={{ color: x.der != null ? TINTA[x.der] : '#8a909c' }}>{x.der ?? '—'}</td>
                    </>
                  ) : (
                    <td colSpan={2} className="border-b border-[#eceef2] px-1 py-1.5 text-center text-[11px] text-[#8a909c]">un solo lado</td>
                  )}
                  <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono font-bold" style={{ color: x.nota != null ? TINTA[x.nota] : '#8a909c' }}>{x.nota ?? '—'}</td>
                  {previa && <td className="border-b border-[#eceef2] px-1 py-1.5 text-center font-mono text-[#8a909c]">{x.antes ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-1.5 text-[11px] text-[#6b7280]">Cada prueba de 0 a 3. En las de dos lados cuenta el peor; si duele, es un 0.</p>
      </section>

      {incluidas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] m-0">Gráficas</h3>
          {incluidas.map(g => <GraficaInforme key={g.id} g={g} />)}
        </section>
      )}

      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c2410c] mb-2">Fotogramas</h3>
        {fotos.length === 0 && !medidas ? (
          <p className="m-0 text-[#5b6170]">Cargando los fotogramas…</p>
        ) : fotos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fotos.map(f => (
              <figure key={f.ruta} className="sin-cortar m-0 flex flex-col gap-1.5 text-[10.5px] text-[#4b5160]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[f.ruta]} alt={f.titulo} className="w-full h-auto rounded-md border border-[#e3e5ea] bg-[#0b0f14]" />
                <figcaption>
                  <b className="text-[#16181d]">{f.titulo} · {f.nota ?? '—'}</b>
                  {f.texto && <span className="block">{f.texto}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[#5b6170]">
            {rutas.length ? 'No se han podido cargar los fotogramas: cierra el informe y vuelve a abrirlo.'
              : permiso ? 'No se guardó ningún fotograma de este ' + def.nombre + '.'
              : 'Sin fotogramas: para guardarlos hace falta su permiso, que se marca en esta pestaña.'}
          </p>
        )}
      </section>

      <footer className="border-t border-[#d4d7de] pt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10.5px] text-[#6b7280]">
        <span className="max-w-[60ch]">
          Para seguir a la persona consigo misma, no para predecir lesiones: el total sirve para compararla con el mismo evaluador, y que estas baterías prevengan lesiones está sin demostrar
          {def.id === 'fms' ? ' (con el FMS, el corte en 14 deja pasar a tres de cada cuatro futuros lesionados)' : ''}. Criterios: {def.fuente}
        </span>
        <span>tripulse.app</span>
      </footer>
    </MarcoInforme>
  )
}
