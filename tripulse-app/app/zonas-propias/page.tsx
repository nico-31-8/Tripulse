'use client'
// ============================================================
// TRIPULSE — Zonas propias del entrenador
// ============================================================
//
// PANTALLA APARTE, igual que los tests propios y por lo mismo: escribe en una
// tabla que no lee nadie más y no toca ninguna pantalla existente. Borrar la
// carpeta y la tabla lo deshace entero.
//
// DE QUÉ NÚMERO ES EL PORCENTAJE. Una zona puede colgar de la referencia de la
// app -la VAM, el FTP, el CSS- o de una referencia del propio entrenador: un
// resultado de un test suyo. El caso que lo pide es un 6×100 del que sale «1:13
// el 100»: no es un CSS, no se le parece, y aun así es de donde ese entrenador
// quiere colgar las zonas de ese nadador.
//
// Y EL PORCENTAJE TIENE SENTIDO, no es una multiplicación: el 95 % de 1:13 es
// más LENTO. Eso lo resuelve lib/referencia-propia, en un solo sitio.
//
// LO QUE FALTA PARA QUE SIRVAN DE VERDAD. Estas zonas todavía NO salen en el
// desplegable del editor de sesión. Eso es lo siguiente, y es lo primero de
// todo esto que sí toca una pantalla que se usa a diario, así que se hace
// aparte y hablándolo. Aquí se crean, se validan y se ve qué ritmos le salen a
// cada atleta.
//
// LA LÓGICA NO ESTÁ AQUÍ, está en lib/zonas-entrenador.ts con sus tests: qué
// produce una zona, cuándo se puede usar, y cómo se resuelve una sigla contra
// las dos bibliotecas.
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { cargarReferencias } from '@/lib/referencia-zona'
import {
  fichaDe, textoRpe, motivoNoUsable, usables, leerZonas, paraGuardar,
  rangoDe, cargaDe, buscar, ZONA_NUEVA, COLORES_ZONA, DEPORTES_ZONA,
  type ZonaEntrenador,
} from '@/lib/zonas-entrenador'
import { ZONAS_RESISTENCIA } from '@/lib/zonas'
import { leerDefinicion } from '@/lib/test-definicion'
import {
  opcionesDeRef, buscarOpcion, valorDe, tramoDe, leerValor,
  type TestConMediciones,
} from '@/lib/referencia-propia'
import { MESES_CORTOS } from '@/lib/fechas'

const nEs = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')

/** «2026-09-01» → «1 sep». Sin Date: partir la cadena no tiene zona horaria. */
const fechaCorta = (iso: string): string => {
  const p = String(iso || '').split('-')
  return p.length === 3 ? Number(p[2]) + ' ' + (MESES_CORTOS[Number(p[1]) - 1] ?? '') : String(iso || '')
}

/** km/h → «4:30 /km». Solo tiene sentido con una velocidad. */
const aRitmo = (kmh: number) => {
  if (!Number.isFinite(kmh) || kmh <= 0) return '—'
  const s = Math.round(3600 / kmh)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' /km'
}

interface FilaDefinicion { id: number; nombre: string; deporte: string }
interface FilaMedicion { id_definicion: number; fecha: string; datos: Record<string, unknown> | null }

export default function ZonasPropiasPage() {
  const router = useRouter()
  useRequireEntrenador()

  const [userId, setUserId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [zonas, setZonas] = useState<ZonaEntrenador[]>([])
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; texto: string } | null>(null)

  const [deportistas, setDeportistas] = useState<any[]>([])
  const [depActivo, setDepActivo] = useState<number | null>(null)
  /* Una referencia por deporte, no una sola: los % de una zona de bici son del
     FTP y los de una de carrera de la VAM. Guardarlas juntas y usar «la
     referencia» daria vatios donde toca un ritmo. */
  const [refs, setRefs] = useState<{ vam: number; ftp: number; css: number }>({ vam: 0, ftp: 0, css: 0 })
  /* Los tests del entrenador con las mediciones DEL ATLETA ELEGIDO. Se recargan
     al cambiar de atleta, como las otras referencias.
     NULL MIENTRAS NO HAN LLEGADO, y no una lista vacía: con una lista vacía,
     entre que se pintan las zonas y responde la consulta, cada zona colgada de
     una referencia propia se marcaría en rojo un instante como si su referencia
     hubiera desaparecido. */
  const [tests, setTests] = useState<TestConMediciones[] | null>(null)

  useEffect(() => { arrancar() }, [])

  const arrancar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    const [{ data: zs }, { data: deps }] = await Promise.all([
      supabase.from('zona_entrenador').select('*').eq('id_entrenador', user.id)
        .eq('archivada', false).order('orden'),
      supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id).order('nombre'),
    ])
    setZonas(leerZonas(zs))
    setDeportistas(deps || [])
    /* Se ESPERA a tener sus referencias antes de quitar el «Cargando…». Si no,
       las zonas colgadas de una referencia propia se pintan un instante como
       «le falta el test», que es mentira y encima asusta. */
    if ((deps || []).length && depActivo == null) await elegirDeportista(deps![0].id)
    setCargando(false)
  }

  /** Las referencias del atleta: las de la app y las de los tests propios. */
  const elegirDeportista = async (id: number) => {
    setDepActivo(id)
    const user = await usuarioActual()
    const [r, { data: defs }] = await Promise.all([
      cargarReferencias(supabase, id),
      user
        ? supabase.from('test_definicion').select('*').eq('id_entrenador', user.id).eq('archivado', false)
        : Promise.resolve({ data: [] as FilaDefinicion[] }),
    ])
    setRefs({
      vam: Number(r.tests?.vam) || 0,
      ftp: Number(r.tests?.ftp) || 0,
      css: Number(r.tests?.css) || 0,
    })

    const filas: FilaDefinicion[] = defs || []
    const ids = filas.map(d => d.id)
    /* Todas las mediciones de ese atleta en UNA consulta, no una por test. */
    const { data: meds } = ids.length
      ? await supabase.from('test_medicion').select('id_definicion, fecha, datos')
          .eq('id_deportista', id).in('id_definicion', ids)
      : { data: [] as FilaMedicion[] }
    const porTest: Record<number, { fecha: string; datos: Record<string, unknown> }[]> = {}
    for (const m of (meds || []) as FilaMedicion[]) {
      (porTest[m.id_definicion] ||= []).push({ fecha: m.fecha, datos: m.datos || {} })
    }

    setTests(filas.map(d => ({
      id: d.id, nombre: d.nombre, deporte: d.deporte,
      def: leerDefinicion(d), mediciones: porTest[d.id] || [],
    })))
  }

  const decir = (tipo: 'ok' | 'mal', texto: string) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(null), 4000)
  }

  const parche = (i: number, cambios: Partial<ZonaEntrenador>) =>
    setZonas(zs => zs.map((z, k) => k === i ? { ...z, ...cambios } : z))

  const anadir = () => setZonas(zs => [...zs, ZONA_NUEVA(zs.length, zs[zs.length - 1]?.deporte)])

  /** La referencia del atleta para ESE deporte. 0 si no tiene ese test. */
  const refDe = (deporte: string): number =>
    deporte === 'Ciclismo' ? refs.ftp : (deporte || '').startsWith('Nat') ? refs.css : refs.vam

  /** Como se lee ese numero: un ritmo en carrera, vatios en bici. */
  const comoSeLee = (deporte: string, v: number): string =>
    deporte === 'Ciclismo' ? Math.round(v) + ' W' : aRitmo(v)

  /** Cómo se llama la referencia que la app trae para ese deporte. */
  const refApp = (deporte: string): string =>
    deporte === 'Ciclismo' ? 'FTP' : (deporte || '').startsWith('Nat') ? 'CSS' : 'VAM'

  /** Las referencias propias que puede usar una zona de ese deporte. */
  const opciones = (deporte: string) => (tests ? opcionesDeRef(tests, deporte) : [])

  /**
   * Lo que le sale a este atleta en esa zona, venga de donde venga el %.
   *
   * SE ORDENA POR EL NÚMERO QUE SE ENSEÑA, no por el porcentaje. Es una sola
   * regla que vale para los tres casos: en vatios el % bajo da el número bajo,
   * y en un ritmo lo da alto. Antes había un caso especial para el ciclismo
   * escrito dos veces; esto lo sustituye.
   */
  const saleDe = (z: ZonaEntrenador): { texto: string; nota: string | null } | null => {
    if (z.ref) {
      const o = buscarOpcion(opciones(z.deporte), z.ref)
      if (!o) return null
      const v = valorDe(o.test, z.ref.indice)
      if (!v) return null
      const t = tramoDe(v, z.pctMin, z.pctMax)
      if (!t) return null
      const [a, b] = [t.desde, t.hasta].sort((p, q) => p - q)
      return {
        texto: leerValor(a, '') + ' – ' + leerValor(b, v.unidad),
        nota: o.etiqueta + ' = ' + leerValor(v.valor, v.unidad) + ' · ' + fechaCorta(v.fecha),
      }
    }
    const rango = rangoDe(z, refDe(z.deporte))
    if (!rango) return null
    const [a, b] = [rango.min, rango.max]
      .map(n => ({ n, txt: comoSeLee(z.deporte, n) }))
      .sort((p, q) => (z.deporte === 'Ciclismo' ? p.n - q.n : q.n - p.n))
    return { texto: a.txt + ' – ' + b.txt, nota: null }
  }

  /** Cambia entre un rango y un número suelto, sin perder lo escrito. */
  /* La referencia se comprueba AQUÍ y no dentro de usables(): es donde están
     los tests cargados y donde el entrenador puede arreglarlo. */
  const pegaDeZona = (z: ZonaEntrenador, i: number) =>
    motivoNoUsable(z, i, zonas, tests ? opciones(z.deporte).map(o => o.ref) : undefined)

  const alternarRpe = (i: number) => parche(i, {
    rpeMax: zonas[i].rpeMax == null ? Math.min(10, (Number(zonas[i].rpeMin) || 0) + 1) : null,
  })

  const quitar = async (i: number) => {
    const z = zonas[i]
    if (z.id && !confirm('¿Quitar «' + z.sigla + '»? Las sesiones que ya la usen no se tocan.')) return
    if (z.id) {
      /* Se archiva, no se borra. Una tarea prescrita con ella guarda su propia
         copia, así que borrarla no rompería nada — pero archivar deja rastro de
         que existió, y recuperarla es un clic si fue un descuido. */
      const { error } = await supabase.from('zona_entrenador').update({ archivada: true }).eq('id', z.id)
      if (error) { decir('mal', error.message); return }
    }
    setZonas(zs => zs.filter((_, k) => k !== i))
    decir('ok', 'Quitada.')
  }

  const guardar = async () => {
    if (!userId) return
    const malas = zonas.filter((z, i) => pegaDeZona(z, i) !== null)
    if (malas.length) { decir('mal', 'Hay ' + malas.length + ' zona(s) sin terminar. Míralas en rojo.'); return }
    setGuardando(true)
    /* Se manda todo de una: son pocas filas y así el orden queda consistente.
       `id` viaja cuando la zona ya existía, para que el upsert actualice en vez
       de crear otra con la misma sigla —que el índice único rechazaría—. */
    const filas = zonas.map((z, i) => ({
      ...(z.id ? { id: z.id } : {}),
      ...paraGuardar({ ...z, orden: i }, userId),
    }))
    const { error } = await supabase.from('zona_entrenador').upsert(filas).select()
    setGuardando(false)
    if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return }
    decir('ok', 'Zonas guardadas.')
    await arrancar()
  }

  const campo = 'bg-gray-800 text-white text-sm rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-orange-500 w-full border border-transparent'
  const campoMal = campo.replace('border-transparent', 'border-red-500/60 bg-red-500/5')
  const btn = 'bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-40'
  const btnSec = 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition'
  const tarjeta = 'bg-gray-900 border border-gray-800 rounded-2xl p-5'
  const lab = 'block text-gray-500 text-[10px] uppercase tracking-wider mb-1'

  if (cargando) return <main className="min-h-screen bg-gray-950 text-gray-500 grid place-items-center">Cargando…</main>

  const listas = zonas.filter((z, i) => pegaDeZona(z, i) === null)
  const sinTerminar = zonas.length - listas.length

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        <span className="text-sm text-gray-500">Zonas propias</span>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-4">
        {aviso && (
          <div className={'px-4 py-3 rounded-xl text-sm border ' + (aviso.tipo === 'ok'
            ? 'bg-green-500/8 border-green-500/30 text-green-300'
            : 'bg-red-500/8 border-red-500/30 text-red-300')}>{aviso.texto}</div>
        )}

        <div>
          <h2 className="text-2xl font-bold mb-1">Zonas propias</h2>
          <p className="text-gray-400 text-sm max-w-2xl">
            Tuyas, además de las que trae la aplicación. <b className="text-gray-300">No las sustituyen</b>:
            la idea es que en una misma sesión puedas poner un bloque en AEL y el siguiente en una
            zona que te inventaste tú. El porcentaje de cada zona puede ser de la referencia de la
            aplicación <span className="text-gray-500">(su VAM, su FTP, su CSS)</span> o de
            <b className="text-gray-300"> una referencia tuya</b>: cualquier resultado de un test que
            te hayas creado.
          </p>
        </div>

        <div className="bg-orange-500/6 border-l-2 border-orange-500/50 rounded-r-xl px-4 py-3 text-[12.5px] text-orange-200/90 leading-relaxed">
          <b>El RPE es obligatorio, y no es un capricho.</b> De él salen la <b>carga</b> (RPE × minutos)
          y el <b>nivel 1–7</b>, que decide la altura de la barra del dibujo, la duración estimada y qué
          zona representa a una sesión de varios bloques. Una zona sin RPE no calcularía mal la carga:
          es que no existiría para media aplicación.
        </div>

        {/* ---- el editor ---- */}
        <div className={tarjeta}>
          <div className="hidden md:grid gap-2 mb-2 text-gray-500 text-[10px] uppercase tracking-wider"
            style={{ gridTemplateColumns: '104px 86px minmax(110px,1.3fr) 146px 164px minmax(120px,1fr) 28px' }}>
            <span>Deporte</span><span>Sigla</span><span>Nombre</span><span>% de su referencia</span>
            <span>RPE</span><span>Sale de ahí</span><span />
          </div>

          {zonas.length === 0 && (
            <p className="text-gray-600 text-sm italic py-3">
              Todavía no tienes ninguna. Añade una y ponle sigla, nombre, su rango de % y su RPE.
            </p>
          )}

          {zonas.map((z, i) => {
            const pega = pegaDeZona(z, i)
            const f = fichaDe(z)
            const sale = saleDe(z)
            const ops = opciones(z.deporte)
            return (
              <div key={i}
                className={'grid gap-2 items-center rounded-xl border p-2.5 mb-2 ' +
                  (pega ? 'border-red-500/40 bg-red-500/[0.04]' : 'border-gray-800 bg-[#161f2e]')}
                style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <div className="grid gap-2 items-center"
                  style={{ gridTemplateColumns: '104px 86px minmax(110px,1.3fr) 146px 164px minmax(120px,1fr) 28px' }}>
                  {/* Cambiar de deporte suelta la referencia: una zona de bici
                      colgada de un número de natación no significa nada. */}
                  <select className={campo} value={z.deporte}
                    onChange={e => parche(i, { deporte: e.target.value, ref: null })}>
                    {DEPORTES_ZONA.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button title="Cambiar color" onClick={() => parche(i, {
                      color: COLORES_ZONA[(COLORES_ZONA.indexOf(z.color) + 1) % COLORES_ZONA.length],
                    })} className="w-3 h-3 rounded shrink-0 border border-white/20" style={{ background: z.color }} />
                    <input className={(pega ? campoMal : campo) + ' font-mono uppercase'} value={z.sigla}
                      maxLength={8} placeholder="TMP"
                      onChange={e => parche(i, { sigla: e.target.value.toUpperCase() })} />
                  </div>
                  <input className={campo} value={z.nombre} placeholder="Tempo largo"
                    onChange={e => parche(i, { nombre: e.target.value })} />
                  <div className="flex gap-1 items-center">
                    <input className={campo} type="number" value={z.pctMin}
                      onChange={e => parche(i, { pctMin: Number(e.target.value) })} />
                    <span className="text-gray-600 text-xs shrink-0">–</span>
                    <input className={campo} type="number" value={z.pctMax}
                      onChange={e => parche(i, { pctMax: Number(e.target.value) })} />
                    <span className="text-gray-600 text-xs shrink-0">%</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <input className={campo} type="number" step="0.5" placeholder="obligatorio"
                      value={z.rpeMin ?? ''} onChange={e => parche(i, { rpeMin: e.target.value === '' ? null : Number(e.target.value) })} />
                    {z.rpeMax != null && (<>
                      <span className="text-gray-600 text-xs shrink-0">–</span>
                      <input className={campo} type="number" step="0.5" value={z.rpeMax}
                        onChange={e => parche(i, { rpeMax: e.target.value === '' ? null : Number(e.target.value) })} />
                    </>)}
                    <button onClick={() => alternarRpe(i)} className="shrink-0 bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-md text-[10.5px] px-1.5 py-1"
                      title={z.rpeMax == null ? 'Pasar a un rango' : 'Pasar a un número suelto'}>
                      {z.rpeMax == null ? 'nº' : '↔'}
                    </button>
                  </div>
                  <div className="text-[11.5px] leading-snug tabular-nums">
                    {pega
                      ? <span className="text-red-300">⚠ {pega}</span>
                      : <>
                          <span className="text-gray-400">RPE <b className="text-white">{nEs(f.rpe!)}</b> · nivel <b className="text-white">{f.nivel}</b></span>
                          {sale && <div className="text-gray-500">{sale.texto}</div>}
                        </>}
                  </div>
                  <button onClick={() => quitar(i)} className="text-gray-600 hover:text-red-400 px-1">×</button>
                </div>

                {/* DE QUÉ NÚMERO ES ESE PORCENTAJE. En su propia línea y no en
                    la rejilla de arriba: casi siempre se deja como está, pero
                    cuando se cambia, cambia el significado de la zona entera. */}
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <span className="text-gray-500 text-[10px] uppercase tracking-wider shrink-0">El % es de</span>
                  <select
                    className={campo + ' text-[12px]'} style={{ maxWidth: 260 }}
                    value={z.ref ? z.ref.idDefinicion + ':' + z.ref.indice : ''}
                    onChange={e => {
                      const v = e.target.value
                      if (!v) { parche(i, { ref: null }); return }
                      const [d, n] = v.split(':')
                      parche(i, { ref: { idDefinicion: Number(d), indice: Number(n) } })
                    }}>
                    <option value="">Su {refApp(z.deporte)} — la referencia de la app</option>
                    {ops.map(o => (
                      <option key={o.ref.idDefinicion + ':' + o.ref.indice}
                        value={o.ref.idDefinicion + ':' + o.ref.indice}>{o.etiqueta}</option>
                    ))}
                  </select>
                  {sale?.nota && <span className="text-gray-600 text-[11px] truncate">{sale.nota}</span>}
                  {!ops.length && (
                    <span className="text-gray-700 text-[11px]">
                      (no tienes tests de {z.deporte.toLowerCase()} con referencias)
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          <div className="flex items-center gap-3 flex-wrap mt-3">
            <button onClick={anadir} className={btnSec}>+ Añadir zona</button>
            <button onClick={guardar} disabled={guardando || zonas.length === 0} className={btn}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            {sinTerminar > 0 && (
              <span className="text-red-300 text-xs">{sinTerminar} sin terminar; no se pueden usar todavía</span>
            )}
          </div>
        </div>

        {/* ---- cómo le quedan a un atleta ---- */}
        <div className={tarjeta}>
          <div className="flex justify-between items-start gap-3 flex-wrap mb-3">
            <div>
              <p className="font-bold text-[15px]">Cómo le quedan a un atleta</p>
              <p className="text-gray-500 text-xs">Cada zona usa la referencia que le pusiste: la de la app —VAM, FTP, CSS— o una tuya. Debajo de cada número pone de dónde sale y de qué día.</p>
            </div>
            <div style={{ minWidth: 180 }}>
              <label className={lab}>Deportista</label>
              <select className={campo} value={depActivo ?? ''} onChange={e => elegirDeportista(Number(e.target.value))}>
                {deportistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
          </div>

          {listas.length === 0 ? (
            <p className="text-gray-600 text-sm italic">Ninguna zona lista todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-700">
                    <th className="text-left py-2 px-2">Zona</th><th className="text-left py-2 px-2">Deporte</th>
                    <th className="text-left py-2 px-2">%</th>
                    <th className="text-left py-2 px-2">Le sale</th><th className="text-left py-2 px-2">RPE</th>
                    <th className="text-left py-2 px-2">Nivel</th>
                  </tr>
                </thead>
                <tbody>
                  {listas.map(z => {
                    const f = fichaDe(z), sale = saleDe(z)
                    return (
                      <tr key={z.sigla} className="border-b border-gray-800/70">
                        <td className="py-2 px-2">
                          <span className="font-bold text-xs" style={{ color: z.color }}>{z.sigla}</span>
                          <span className="text-gray-500 text-xs"> {z.nombre}</span>
                        </td>
                        <td className="py-2 px-2 text-gray-500 text-xs">{z.deporte}</td>
                        <td className="py-2 px-2 text-gray-500 tabular-nums">
                          {z.pctMin}–{z.pctMax} %
                          {z.ref && <div className="text-violet-300/60 text-[10.5px]">◈ tuya</div>}
                        </td>
                        <td className="py-2 px-2 tabular-nums">
                          {sale
                            ? <>
                                {sale.texto}
                                {/* De dónde sale y DE QUÉ DÍA. Sin la fecha, un
                                    número de julio se lee como el de hoy. */}
                                <div className="text-gray-600 text-[10.5px]">{sale.nota ?? 'su ' + refApp(z.deporte)}</div>
                              </>
                            : <span className="text-amber-300/70 text-xs">le falta el test</span>}
                        </td>
                        <td className="py-2 px-2 tabular-nums text-gray-400">{textoRpe(z)}</td>
                        <td className="py-2 px-2 tabular-nums font-semibold">{f.nivel}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---- mezcladas con las de la app ---- */}
        {listas.length > 0 && <Mezcla mias={zonas} />}

        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl px-5 py-4 text-[12.5px] text-gray-400 leading-relaxed">
          <b className="text-gray-300">Lo que falta.</b> Estas zonas todavía <b>no salen en el desplegable
          de una tarea</b>: aquí se crean y se comprueba qué le salen a cada atleta, pero prescribir con
          ellas es el paso siguiente. Es el primero de todo esto que toca una pantalla que usas a diario,
          así que se hace aparte y hablándolo antes.
        </div>
      </div>
    </main>
  )
}

/**
 * Una sesión de mentira con zonas de las dos bibliotecas.
 *
 * Está aquí porque es lo único que enseña de verdad para qué sirve todo esto:
 * un bloque en AEL y el siguiente en una zona tuya, sumando a la misma carga.
 */
function Mezcla({ mias }: { mias: ZonaEntrenador[] }) {
  /* Una sesion es de UN deporte, asi que el desplegable solo ofrece las de ese
     deporte — igual que hara el editor de verdad. */
  const [deporte, setDeporte] = useState('Carrera')
  const listas = usables(mias, deporte)
  const [bloques, setBloques] = useState<{ zona: string; min: number }[]>([
    { zona: 'AEL', min: 30 },
    { zona: listas[0]?.sigla ?? 'AEM', min: 20 },
  ])

  const campo = 'bg-gray-800 text-white text-sm rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-orange-500 w-full'
  let total = 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="font-bold text-[15px] mb-0.5">Mezcladas en una sesión</p>
      <div className="flex justify-between items-end gap-3 flex-wrap mb-4">
        <p className="text-gray-500 text-xs max-w-md">
          Un bloque de la app y otro tuyo, sumando a la misma carga. Es lo que se podrá hacer en el
          editor cuando demos el paso siguiente.
        </p>
        <select className={campo + ' max-w-[150px]'} value={deporte} onChange={e => setDeporte(e.target.value)}>
          {DEPORTES_ZONA.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {bloques.map((b, i) => {
        const r = buscar(b.zona, mias, deporte)
        const carga = r ? cargaDe(r, b.min) : 0
        total += carga
        return (
          <div key={i} className="grid gap-2 items-center mb-2"
            style={{ gridTemplateColumns: 'minmax(150px,1.6fr) 88px 56px 52px 70px 26px' }}>
            <select className={campo} value={b.zona}
              onChange={e => setBloques(bs => bs.map((x, k) => k === i ? { ...x, zona: e.target.value } : x))}>
              {/* Las de la app valen en los tres deportes: su porcentaje ya esta
                  definido por deporte dentro del catalogo. Las mias no, y por eso
                  esas si van filtradas. */}
              <optgroup label="De la app">
                {ZONAS_RESISTENCIA.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
              </optgroup>
              {listas.length > 0 && (
                <optgroup label="Mías">
                  {listas.map(z => <option key={z.sigla} value={z.sigla}>{z.sigla} · {z.nombre}</option>)}
                </optgroup>
              )}
            </select>
            <input className={campo} type="number" value={b.min}
              onChange={e => setBloques(bs => bs.map((x, k) => k === i ? { ...x, min: Number(e.target.value) } : x))} />
            <span className="text-gray-300 text-xs tabular-nums">{r ? nEs(r.rpe) : '—'}</span>
            <span className="text-gray-300 text-xs tabular-nums flex items-center gap-1.5">
              {r && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />}{r?.nivel ?? '—'}
            </span>
            <span className="text-white text-xs font-bold tabular-nums">{carga}</span>
            <button onClick={() => setBloques(bs => bs.filter((_, k) => k !== i))}
              className="text-gray-600 hover:text-red-400">×</button>
          </div>
        )
      })}

      <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-gray-700">
        <button onClick={() => setBloques(bs => [...bs, { zona: 'AER', min: 10 }])}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition">
          + Bloque
        </button>
        <span className="text-gray-400 text-xs">Carga de la sesión
          <b className="text-orange-400 text-xl ml-2 tabular-nums">{total} UA</b></span>
      </div>
    </div>
  )
}
