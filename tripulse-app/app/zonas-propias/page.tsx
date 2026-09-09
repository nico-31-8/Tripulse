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
import { fichaDe, textoRpe, motivoNoUsable, leerZonas, paraGuardar, rangoDe, ZONA_NUEVA, COLORES_ZONA, DEPORTES_ZONA, type ZonaEntrenador } from '@/lib/zonas-entrenador'

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
       «le falta el test», que es mentira y encima asusta.

       Y SE RECARGAN LOS TESTS AUNQUE YA HUBIERA UN ATLETA ELEGIDO. Antes esto
       solo pasaba la primera vez, así que después de guardar unas zonas la
       lista de referencias se quedaba con la foto de al abrir la pantalla: te
       ibas a crear un test, volvías, y el desplegable seguía vacío sin que nada
       fallara. */
    const dep = depActivo ?? (deps || [])[0]?.id ?? null
    if (dep != null) await elegirDeportista(dep)
    setCargando(false)
  }

  /** Las referencias del atleta: las de la app y las de los tests propios. */
  const elegirDeportista = async (id: number) => {
    setDepActivo(id)
    const r = await cargarReferencias(supabase, id)
    setRefs({
      vam: Number(r.tests?.vam) || 0,
      ftp: Number(r.tests?.ftp) || 0,
      css: Number(r.tests?.css) || 0,
    })
    await recargarTests(id)
  }

  /** Los tests del entrenador con las mediciones de ese atleta. */
  const recargarTests = async (id: number) => {
    const user = await usuarioActual()
    const { data: defs } = user
      ? await supabase.from('test_definicion').select('*').eq('id_entrenador', user.id).eq('archivado', false)
      : { data: [] as FilaDefinicion[] }

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

  /* Al volver a esta pestaña se vuelven a pedir los tests. El camino normal es
     justo ese: te vas a Tests propios, marcas un resultado como referencia y
     vuelves. Sin esto, el desplegable te enseña la lista de hace diez minutos y
     no hay forma de saber que está vieja. */
  useEffect(() => {
    if (depActivo == null) return
    const alVolver = () => { if (document.visibilityState === 'visible') recargarTests(depActivo) }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [depActivo])

  const decir = (tipo: 'ok' | 'mal', texto: string) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(null), 4000)
  }

  const parche = (i: number, cambios: Partial<ZonaEntrenador>) =>
    setZonas(zs => zs.map((z, k) => k === i ? { ...z, ...cambios } : z))

  /* Qué deportes están plegados. TODOS ABIERTOS AL ENTRAR, y se pliega lo que
     estorbe: al revés, un entrenador con zonas creadas abriría la pantalla y
     no vería ninguna, que es peor problema que verlas todas. */
  const [plegado, setPlegado] = useState<Record<string, boolean>>({})
  const plegar = (d: string) => setPlegado(p => ({ ...p, [d]: !p[d] }))

  /** Una zona nueva ya en su sitio: el deporte y la referencia del grupo. */
  const anadirEn = (deporte: string, ref: ZonaEntrenador['ref']) =>
    setZonas(zs => [...zs, { ...ZONA_NUEVA(zs.length, deporte), ref }])

  /**
   * Las zonas por deporte y, dentro, por la referencia de la que cuelgan.
   *
   * SE CONSERVA EL ÍNDICE ORIGINAL en cada fila, y no es un detalle: editar,
   * borrar y validar una zona van por su posición en la lista. Agrupando sin
   * llevárselo, tocar una fila editaría otra.
   */
  const agrupado = () => {
    const conIndice = zonas.map((z, i) => ({ z, i }))
    /* SE AGRUPA POR LOS DEPORTES QUE HAY, no por la lista de los tres. Si una
       zona tuviera un deporte fuera de esa lista, agrupando solo por ella se
       quedaría fuera de la pantalla: invisible, pero guardada y contando. Un
       dato que existe y no se ve es peor que uno que falta. */
    const deportes = [...DEPORTES_ZONA]
    for (const { z } of conIndice) if (z.deporte && !deportes.includes(z.deporte)) deportes.push(z.deporte)

    return deportes.map(deporte => {
      const suyas = conIndice.filter(x => x.z.deporte === deporte)
      const grupos: { clave: string; etiqueta: string; nota: string; ref: ZonaEntrenador['ref']; filas: typeof suyas }[] = []
      for (const x of suyas) {
        const clave = x.z.ref ? x.z.ref.idDefinicion + ':' + x.z.ref.indice : ''
        let g = grupos.find(y => y.clave === clave)
        if (!g) {
          const o = x.z.ref ? buscarOpcion(opciones(deporte), x.z.ref) : null
          g = {
            clave, ref: x.z.ref, filas: [],
            etiqueta: x.z.ref ? (o?.etiqueta ?? 'una referencia que ya no existe') : 'su ' + refApp(deporte),
            nota: '',
          }
          grupos.push(g)
        }
        g.filas.push(x)
      }
      /* La nota —«= 76 s/100 · 8 sep»— se dice UNA VEZ por grupo. Repetirla en
         cada fila es lo que hacía que veinte zonas parecieran un amasijo. */
      for (const g of grupos) g.nota = saleDe(g.filas[0].z)?.nota ?? ''
      return { deporte, grupos, cuantas: suyas.length }
    }).filter(d => d.cuantas > 0)
  }

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

          {zonas.length === 0 && (
            <p className="text-gray-600 text-sm italic py-3">
              Todavía no tienes ninguna. Añade una y ponle sigla, nombre, su rango de % y su RPE.
            </p>
          )}

          {/* AGRUPADO POR DEPORTE Y, DENTRO, POR REFERENCIA.

              Con tres deportes, varias referencias por deporte y una escalera de
              zonas colgando de cada una, una lista plana son treinta filas que se
              leen todas igual — y con «6x100 · Ritmo100 = 76 s/100 · 8 sep»
              repetido idéntico debajo de cada una.

              Así la referencia se dice UNA VEZ, como cabecera de las zonas que
              cuelgan de ella, y cada deporte se pliega cuando no lo estás
              tocando. */}
          {agrupado().map(d => {
            const cerrado = !!plegado[d.deporte]
            return (
              <div key={d.deporte} className="mb-3 rounded-xl border border-gray-800 overflow-hidden">
                <button onClick={() => plegar(d.deporte)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition text-left">
                  <span className={'text-gray-500 text-xs transition-transform ' + (cerrado ? '' : 'rotate-90')}>▶</span>
                  <span className="font-semibold text-[13.5px]">{d.deporte}</span>
                  <span className="text-gray-600 text-[11.5px]">{d.cuantas} {d.cuantas === 1 ? 'zona' : 'zonas'}</span>
                  {/* Plegado, las siglas siguen viéndose: es lo que te dice si lo
                      que buscas está ahí dentro sin tener que abrirlo. */}
                  <span className="flex gap-1 flex-wrap ml-auto">
                    {d.grupos.flatMap(g => g.filas).map(({ z, i }) => (
                      <span key={i} className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ color: z.color, background: z.color + '1f' }}>{z.sigla || '—'}</span>
                    ))}
                  </span>
                </button>

                {!cerrado && (
                  <div className="p-2.5">
                    {d.grupos.map(g => (
                      <div key={g.clave} className="mb-3 last:mb-0">
                        <div className="flex items-baseline gap-2 flex-wrap mb-1.5 pl-0.5">
                          <span className="text-gray-500 text-[10px] uppercase tracking-wider">El % es de</span>
                          <span className={'text-[12.5px] ' + (g.ref ? 'text-violet-300' : 'text-gray-300')}>
                            {g.ref ? '◈ ' : ''}{g.etiqueta}
                          </span>
                          {g.nota && <span className="text-gray-600 text-[11px]">{g.nota}</span>}
                        </div>

                        {/* Los rótulos, dentro del grupo: es donde cuadran con las
                            filas. Uno solo arriba del todo dejó de alinear en cuanto
                            las filas pasaron a vivir dentro de dos niveles. */}
                        <div className="hidden md:grid gap-2 mb-1 px-2.5 text-gray-600 text-[9.5px] uppercase tracking-wider"
                          style={{ gridTemplateColumns: '86px minmax(110px,1.3fr) 146px 164px minmax(120px,1fr) 28px' }}>
                          <span>Sigla</span><span>Nombre</span><span>% de la referencia</span>
                          <span>RPE</span><span>Le sale</span><span />
                        </div>

                        {g.filas.map(({ z, i }) => {
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
                                style={{ gridTemplateColumns: '86px minmax(110px,1.3fr) 146px 164px minmax(120px,1fr) 28px' }}>
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

                              {/* MOVERLA DE SITIO. El deporte y la referencia ya los
                                  dice el grupo, así que aquí no informan: son los dos
                                  controles con los que se cambia de grupo, y por eso
                                  siguen estando. Apagados hasta que se tocan. */}
                              <details className="group">
                                <summary className="text-gray-600 hover:text-gray-400 text-[11px] cursor-pointer select-none list-none">
                                  ⇄ Mover a otro deporte o referencia
                                </summary>
                                <div className="flex items-center gap-2 flex-wrap pt-2">
                                  <select className={campo + ' text-[12px]'} style={{ maxWidth: 130 }} value={z.deporte}
                                    onChange={e => parche(i, { deporte: e.target.value, ref: null })}>
                                    {DEPORTES_ZONA.map(dd => <option key={dd} value={dd}>{dd}</option>)}
                                  </select>
                                  <select
                                    className={campo + ' text-[12px]'} style={{ maxWidth: 260 }}
                                    value={z.ref ? z.ref.idDefinicion + ':' + z.ref.indice : ''}
                                    onChange={e => {
                                      const v = e.target.value
                                      if (!v) { parche(i, { ref: null }); return }
                                      const [dd, nn] = v.split(':')
                                      parche(i, { ref: { idDefinicion: Number(dd), indice: Number(nn) } })
                                    }}>
                                    <option value="">Su {refApp(z.deporte)} — la referencia de la app</option>
                                    {ops.map(o => (
                                      <option key={o.ref.idDefinicion + ':' + o.ref.indice}
                                        value={o.ref.idDefinicion + ':' + o.ref.indice}>{o.etiqueta}</option>
                                    ))}
                                  </select>
                                  {!ops.length && (
                                    <span className="text-gray-700 text-[11px]">
                                      (no tienes tests de {z.deporte.toLowerCase()} con referencias)
                                    </span>
                                  )}
                                </div>
                              </details>
                            </div>
                          )
                        })}

                        <button onClick={() => anadirEn(d.deporte, g.ref)}
                          className="text-gray-500 hover:text-orange-400 text-[11.5px] transition pl-0.5">
                          + Añadir zona a esta referencia
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

        {/* Aquí vivían una sesión de mentira que mezclaba zonas de las dos
            bibliotecas y un recuadro de «lo que falta». Los dos prometían un paso
            siguiente —poder prescribir con estas zonas— que ya está hecho, así que
            el segundo había pasado de ser una advertencia a ser mentira. Lo que
            enseña para qué sirven ahora es el editor de sesión, con datos de
            verdad; una maqueta al lado solo compite con él. */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl px-5 py-4 text-[12.5px] text-gray-400 leading-relaxed">
          <b className="text-gray-300">Ya se prescriben.</b> Estas zonas salen en el desplegable de una
          tarea, junto a las de la aplicación: en la ficha de sesión eliges el deporte, la referencia y
          la zona. Aquí las creas y compruebas qué ritmos le salen a cada atleta.
        </div>
      </div>
    </main>
  )
}
