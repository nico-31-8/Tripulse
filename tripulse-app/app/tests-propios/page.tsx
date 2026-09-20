'use client'
// ============================================================
// TRIPULSE — Tests propios del entrenador
// ============================================================
//
// PANTALLA APARTE, Y A PROPÓSITO. No toca `/tests/[id]` ni ninguna otra: vive
// en su carpeta, escribe en dos tablas que no lee nadie más, y si no convence
// se borra la carpeta y no queda rastro. Esa es la condición con la que se
// montó, y es la que decide que esté aquí y no repartida por la app.
//
// LO QUE HACE. Un entrenador se crea un test —unos campos y una o varias
// fórmulas—, se lo pasa a un atleta y ve cómo evoluciona.
//
// LA LÓGICA NO ESTÁ AQUÍ. Evaluar, validar y armar las series vive en
// lib/formula.ts y lib/test-definicion.ts, con sus tests. Aquí solo hay
// pantalla y consultas: si algo calcula, es que está en el sitio equivocado.
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { hoyISO } from '@/lib/fechas'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import {
  ANCLAS, ANCLAS_REFERENCIA, tipoDeAncla, esInverso, leerDefinicion, calcularResultados, pegasDe, pegaDe,
  sePuedeGuardar, seriesDe, referenciasDe, TEST_VACIO,
  esSerie, vecesDe, serieDeDatos, faltanDe, MAX_VECES,
  type Ancla, type CampoTest, type DefinicionTest, type InstrumentoCampo,
  type Medicion, type ResultadoTest, type SerieResultado,
} from '@/lib/test-definicion'
import { renombrarEn, dependencias, FUNCIONES, type Bloque, type Funcion } from '@/lib/formula'
import { herramientasPropias, seTomaConReloj } from '@/lib/herramientas-propias'
import InstrumentosTest from '@/components/InstrumentosTest'
import { useBloqueoDeSalida, AvisoDeSalida, BarraDeTest } from '@/components/PantallaDeTest'
import { puedeFijar, propuestaPropia, origenDe } from '@/lib/ancla-propia'
import { fijarZonas } from '@/lib/zonas-desde-test'

const SIGNO: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', '(': '(', ')': ')' }
const OPS = ['+', '-', '*', '/', '^', '(', ')']
const DEPORTES = ['Carrera', 'Ciclismo', 'Natacion', 'Fuerza', 'Otro']

/* El desplegable maneja textos y el test guarda objetos, así que la traducción
   va en un solo sitio y en los dos sentidos. */
const COMO_OPCIONES = [
  { valor: 'mano', texto: 'A mano' },
  { valor: 'crono-seg', texto: 'Cronómetro · segundos' },
  { valor: 'crono-min', texto: 'Cronómetro · minutos' },
  { valor: 'contador', texto: 'Contador' },
  { valor: 'cuenta', texto: 'Cuenta atrás' },
]

const comoDe = (c: CampoTest): string => {
  const i = c.instrumento
  if (!i) return 'mano'
  if (i.tipo === 'cronometro') return i.unidad === 'min' ? 'crono-min' : 'crono-seg'
  return i.tipo === 'contador' ? 'contador' : 'cuenta'
}

const instrumentoDe = (valor: string, antes?: InstrumentoCampo): InstrumentoCampo | undefined => {
  if (valor === 'crono-seg') return { tipo: 'cronometro', unidad: 'seg' }
  if (valor === 'crono-min') return { tipo: 'cronometro', unidad: 'min' }
  if (valor === 'contador') return { tipo: 'contador' }
  /* Seis minutos por defecto, que es el test de duración fija más corriente.
     Si ya había una cuenta atrás puesta se respeta su duración. */
  if (valor === 'cuenta') return { tipo: 'cuentaAtras', segundos: antes?.tipo === 'cuentaAtras' ? antes.segundos : 360 }
  return undefined
}

/** Qué va a pasar con esta casilla, dicho antes de que pase. */
function pistaDeCampo(c: CampoTest): string {
  const serie = esSerie(c), n = vecesDe(c)
  const i = c.instrumento
  if (!i) {
    return serie
      ? 'Te salen ' + n + ' casillas para escribirlas cuando puedas: es lo que te canta otra persona.'
      : 'Una casilla y la escribes tú.'
  }
  if (i.tipo === 'cronometro') {
    const u = i.unidad === 'min' ? 'minutos' : 'segundos'
    return serie
      ? 'Un botón: cada pulsación cierra una repetición y la deja en su fila, en ' + u + '. Al cerrar la ' + n + '.ª, el reloj para.'
      : 'Al pararlo escribe ' + u + ' aquí — cuéntalo así en la fórmula.'
  }
  if (i.tipo === 'contador') {
    return serie
      ? 'Un contador no se puede llevar a la vez que el reloj: déjalo a mano y lo escribes después.'
      : 'Una pulsación por brazada. El número cae aquí.'
  }
  return 'La cuenta atrás manda el tiempo y NO rellena nada: lo que se teclea aquí es lo que hayas medido durante ese rato.'
}

/** Lo que hay escrito, tal cual se guarda: un texto, o una lista si es serie. */
export type Entrada = Record<string, string | string[]>

const entradaVacia = (def: DefinicionTest): Entrada =>
  Object.fromEntries((def.campos || []).map(c =>
    [c.clave, esSerie(c) ? Array.from({ length: vecesDe(c) }, () => '') : '']))

/**
 * Solo las casillas de un número suelto.
 *
 * `InstrumentosTest` lee de aquí para el contador y el secuenciador, y espera
 * textos. Colarle una lista haría que `Number(...)` de una serie de una sola
 * repetición devolviera su valor y el de seis un NaN — la misma trampa que ya
 * está tapada en el motor de fórmulas.
 */
const sueltosDe = (e: Entrada): Record<string, string> =>
  Object.fromEntries(Object.entries(e).filter(([, v]) => typeof v === 'string')) as Record<string, string>

const nEs = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')
/* hoyISO y no toISOString(): ese da el dia en UTC, asi que una medicion
   guardada a las 23:30 se apuntaria al dia siguiente. Hay un test guardian en
   lib/fechas-sin-reloj que lo impide, y hace bien. */
const hoy = () => hoyISO()

interface FilaTest { id: number; nombre: string; deporte: string; def: DefinicionTest; mediciones: number }

export default function TestsPropiosPage() {
  const router = useRouter()
  useRequireEntrenador()

  const [userId, setUserId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [tests, setTests] = useState<FilaTest[]>([])
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; texto: string } | null>(null)

  /* Una sola pantalla con tres caras, en vez de tres rutas. Así el test que
     acabas de crear ya está en memoria cuando pasas a rellenarlo, sin volver a
     pedirlo, y borrar todo esto sigue siendo borrar una carpeta. */
  const [vista, setVista] = useState<'lista' | 'editor' | 'atleta'>('lista')
  const [editando, setEditando] = useState<number | null>(null)
  const [def, setDef] = useState<DefinicionTest>({ ...TEST_VACIO })

  /* Qué serie está esperando a que se diga qué se le pide. Va por resultado
     porque la paleta es de un resultado concreto. */
  const [pidiendo, setPidiendo] = useState<{ res: number; campo: string } | null>(null)

  const [testActivo, setTestActivo] = useState<FilaTest | null>(null)
  const [depActivo, setDepActivo] = useState<number | null>(null)
  const [mediciones, setMediciones] = useState<Medicion[]>([])
  /* Una casilla normal guarda un texto; una serie guarda una lista de la
     longitud que diga el test. Lo que se manda a la base es esto tal cual:
     jsonb acepta las dos formas, así que no hizo falta tocar la tabla. */
  const [entrada, setEntrada] = useState<Record<string, string | string[]>>({})
  /* A mano o con reloj. Solo se pregunta si el test lleva algún instrumento:
     un selector de una sola opción es un toque de más cada vez. */
  const [modoTest, setModoTest] = useState<'mano' | 'campo'>('mano')
  const [relojEnMarcha, setRelojEnMarcha] = useState(false)
  const [fecha, setFecha] = useState(hoy())
  const [guardando, setGuardando] = useState(false)

  /* Con un reloj en marcha, salir de aquí no es un error que se corrija: se ha
     ido el reloj y con él las repeticiones que llevara, y el test hay que
     repetirlo con el atleta ya cansado. No se bloquea nada, se PREGUNTA. */
  const bloqueo = useBloqueoDeSalida(relojEnMarcha)

  useEffect(() => { arrancar() }, [])

  const arrancar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    const [{ data: defs }, { data: deps }] = await Promise.all([
      supabase.from('test_definicion').select('*').eq('id_entrenador', user.id)
        .eq('archivado', false).order('created_at', { ascending: false }),
      supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id).eq('solo_test', false).order('nombre'),
    ])
    const ids = (defs || []).map((d: any) => d.id)
    /* Cuántas mediciones tiene cada uno, en UNA consulta y no una por test:
       con diez tests serían diez viajes para pintar un contador. */
    const { data: meds } = ids.length
      ? await supabase.from('test_medicion').select('id_definicion').in('id_definicion', ids)
      : { data: [] as any[] }
    const cuenta: Record<number, number> = {}
    for (const m of meds || []) cuenta[m.id_definicion] = (cuenta[m.id_definicion] || 0) + 1

    /* Los del LABORATORIO se quedan fuera. Un test del modelo nuevo guarda su
       definición en la columna `modelo` y deja `campos` y `resultados`
       vacíos, así que aquí saldría como un test sin nada dentro: el entrenador
       lo abriría, lo vería vacío y acabaría "arreglando" algo que no está roto.
       Mientras los dos modelos convivan, cada uno enseña los suyos. */
    setTests((defs || []).filter(d => !(d as { modelo?: unknown }).modelo).map((d: any) => ({
      id: d.id, nombre: d.nombre, deporte: d.deporte,
      def: leerDefinicion(d), mediciones: cuenta[d.id] || 0,
    })))
    setDeportistas(deps || [])
    setCargando(false)
  }

  const decir = (tipo: 'ok' | 'mal', texto: string) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(null), 4000)
  }

  // ---------- editor ----------

  const nuevoTest = () => {
    setEditando(null)
    setDef({ nombre: '', deporte: 'Carrera', campos: [{ clave: 'campo_1', etiqueta: 'Primer dato' }], resultados: [] })
    setVista('editor')
  }

  const abrirEditor = (t: FilaTest) => { setEditando(t.id); setDef(t.def); setVista('editor') }

  const addCampo = () => setDef(d => ({
    ...d, campos: [...d.campos, { clave: 'campo_' + (d.campos.length + 1), etiqueta: 'Nuevo dato' }],
  }))

  /** Renombrar arrastra las fórmulas: los bloques ya saben a qué apuntan. */
  const renombrarCampo = (i: number, nuevo: string) => setDef(d => {
    const viejo = d.campos[i].clave
    return {
      ...d,
      campos: d.campos.map((c, k) => k === i ? { ...c, clave: nuevo } : c),
      resultados: d.resultados.map((r, k) => ({
        ...r, formula: renombrarEn([r.formula], 'var', viejo, nuevo)[0] ?? r.formula,
      })),
    }
  })

  const renombrarResultado = (i: number, nuevo: string) => setDef(d => {
    const viejo = d.resultados[i].nombre
    const conNombre = d.resultados.map((r, k) => k === i ? { ...r, nombre: nuevo } : r)
    return { ...d, resultados: conNombre.map(r => ({ ...r, formula: renombrarEn([r.formula], 'ref', viejo, nuevo)[0] ?? r.formula })) }
  })

  const addResultado = () => setDef(d => ({
    ...d,
    resultados: [...d.resultados, {
      nombre: 'resultado_' + (d.resultados.length + 1), unidad: '', ancla: 'nada' as Ancla, formula: [], graf: true,
    }],
  }))

  const parcheR = (i: number, cambios: any) => setDef(d => ({
    ...d, resultados: d.resultados.map((r, k) => k === i ? { ...r, ...cambios } : r),
  }))

  /** Cambia una casilla. `veces` e `instrumento` se quitan cuando no aplican. */
  const parcheC = (i: number, cambios: Partial<CampoTest>) => setDef(d => ({
    ...d,
    campos: d.campos.map((c, k) => {
      if (k !== i) return c
      const nuevo: CampoTest = { ...c, ...cambios }
      if (vecesDe(nuevo) === 1) delete nuevo.veces
      if (!nuevo.instrumento) delete nuevo.instrumento
      return nuevo
    }),
  }))

  const addBloque = (i: number, b: Bloque) => setDef(d => ({
    ...d, resultados: d.resultados.map((r, k) => k === i ? { ...r, formula: [...r.formula, b] } : r),
  }))

  const quitarBloque = (i: number, n: number) => setDef(d => ({
    ...d, resultados: d.resultados.map((r, k) => k === i ? { ...r, formula: r.formula.filter((_, j) => j !== n) } : r),
  }))

  const guardarTest = async () => {
    if (!userId || !sePuedeGuardar(def)) return
    setGuardando(true)
    const fila = {
      id_entrenador: userId, nombre: def.nombre.trim(), deporte: def.deporte,
      campos: def.campos, resultados: def.resultados,
    }
    const { error } = editando
      ? await supabase.from('test_definicion').update(fila).eq('id', editando)
      : await supabase.from('test_definicion').insert(fila)
    setGuardando(false)
    if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return }
    decir('ok', editando ? 'Test actualizado.' : 'Test creado.')
    await arrancar()
    setVista('lista')
  }

  const archivar = async (t: FilaTest) => {
    if (!confirm('¿Archivar «' + t.nombre + '»? Sus mediciones no se borran.')) return
    const { error } = await supabase.from('test_definicion').update({ archivado: true }).eq('id', t.id)
    if (error) { decir('mal', error.message); return }
    decir('ok', 'Archivado.')
    await arrancar()
  }

  // ---------- pasárselo a un atleta ----------

  const abrirAtleta = async (t: FilaTest) => {
    setTestActivo(t)
    setVista('atleta')
    setEntrada(entradaVacia(t.def))
    setModoTest(seTomaConReloj(t.def) ? 'campo' : 'mano')
    setFecha(hoy())
    const dep = depActivo ?? deportistas[0]?.id ?? null
    setDepActivo(dep)
    if (dep) await cargarMediciones(t.id, dep)
  }

  const cargarMediciones = async (idDef: number, idDep: number) => {
    const { data } = await supabase.from('test_medicion')
      .select('fecha, datos').eq('id_definicion', idDef).eq('id_deportista', idDep)
      .order('fecha', { ascending: false })
    setMediciones((data || []).map((m: any) => ({ fecha: m.fecha, datos: m.datos || {} })))
  }

  /**
   * Escribe UNA repetición de una serie.
   *
   * Se escribe la repetición y no la lista entera a propósito: el cronómetro
   * rehaciendo la lista de golpe se cargaría lo que el entrenador hubiera
   * corregido a mano en otra fila, que es justo lo que va a hacer cuando falle
   * una pulsación.
   */
  const ponVuelta = (clave: string, indice: number, valor: string) => setEntrada(x => {
    const campo = (testActivo?.def.campos || []).find(c => c.clave === clave)
    const largo = campo ? vecesDe(campo) : indice + 1
    const previo = x[clave]
    const lista = Array.from({ length: largo }, (_, k) =>
      (Array.isArray(previo) ? previo[k] : undefined) ?? '')
    if (indice < 0 || indice >= largo) return x
    lista[indice] = valor
    return { ...x, [clave]: lista }
  })

  const cambiarDeportista = async (id: number) => {
    setDepActivo(id)
    /* Y SE VACÍA LO ESCRITO. Sin esto, los tiempos del anterior siguen en
       pantalla y el siguiente «Guardar medición» se los apunta a otra persona:
       un dato falso con pinta de bueno, que además nadie va a notar porque los
       números son plausibles. Los relojes también se tiran, porque el `id` que
       recibe el instrumento lleva el deportista. */
    if (testActivo) {
      setEntrada(entradaVacia(testActivo.def))
      await cargarMediciones(testActivo.id, id)
    }
  }

  const guardarMedicion = async () => {
    if (!testActivo || !depActivo || !fecha) return
    setGuardando(true)
    /* upsert por (test, atleta, fecha): repetir un día es CORREGIR, no apuntar
       dos veces. El índice único de la tabla lo respalda; esto solo evita que
       el intento acabe en un error de clave duplicada. */
    const { error } = await supabase.from('test_medicion').upsert({
      id_definicion: testActivo.id, id_deportista: depActivo, fecha, datos: entrada,
    }, { onConflict: 'id_definicion,id_deportista,fecha' })
    setGuardando(false)
    if (error) { decir('mal', 'No se pudo guardar: ' + error.message); return }
    decir('ok', 'Medición guardada.')
    await cargarMediciones(testActivo.id, depActivo)
    await arrancar()
  }

  // ---------- estilos compartidos ----------
  const campo = 'bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-orange-500 w-full border border-transparent'
  const campoMal = campo.replace('border-transparent', 'border-red-500/60 bg-red-500/5')
  /* Se REEMPLAZA el borde, no se añade detrás: `border-transparent` y
     `border-orange-500/50` fijan la misma propiedad, y quién gana lo decide el
     orden de la hoja de estilos, no el de la cadena. Añadiéndolo, el naranja
     que dice «esto lo ha puesto el reloj» podía no verse. */
  const campoMedido = campo.replace('border-transparent', 'border-orange-500/50 bg-orange-500/10')
  const lab = 'block text-gray-400 text-[11.5px] mb-1'
  const btn = 'bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-40'
  const btnSec = 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition'
  const tarjeta = 'bg-gray-900 border border-gray-800 rounded-2xl p-5'

  /* Verde = además puede ocupar la casilla de la app. Violeta = es una
     referencia tuya igual de buena, solo que sus zonas las cuelgas tú. */
  const chipAncla = (a: Ancla, deporte: string) => {
    if (tipoDeAncla(a) === 'seguimiento') return null
    const puede = puedeFijar(deporte, { nombre: '', unidad: '', ancla: a, formula: [], graf: false }).destino
    return puede
      ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-300">⚓ {ANCLAS[a].nombre}</span>
      : <span className="text-[11px] px-2 py-0.5 rounded bg-violet-500/12 border border-violet-400/40 text-violet-300 font-semibold">◈ Referencia tuya</span>
  }

  if (cargando) return <main className="min-h-screen bg-gray-950 text-gray-500 grid place-items-center">Cargando…</main>

  const pegas = pegasDe(def)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        {relojEnMarcha ? (
          <BarraDeTest titulo={(testActivo?.nombre ?? 'Test') + ' en marcha'}
            sub={deportistas.find(d => d.id === depActivo)?.nombre}
            onSalir={bloqueo.preguntar} />
        ) : (<>
        <span className="text-sm text-gray-500">
          {vista === 'lista' ? 'Tests propios'
            : vista === 'editor' ? (editando ? 'Editar test' : 'Crear test')
            : testActivo?.nombre}
        </span>
        <div className="flex gap-4">
          {vista !== 'lista' && (
            <button onClick={() => setVista('lista')} className="text-gray-400 hover:text-white text-sm transition">← Mis tests</button>
          )}
          {/* La puerta al laboratorio. Una línea, para que quitarlo sea quitar
              una línea. Lo de dentro sigue EN PRUEBAS, pero YA ESCRIBE en la
              base: sus tests van en `test_definicion` con la columna `modelo`
              puesta, y esta pantalla filtra los suyos. */}
          <button onClick={() => router.push('/laboratorio')}
            className="text-violet-300/90 hover:text-violet-200 text-sm transition">🧪 Laboratorio</button>
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">Dashboard</button>
        </div>
        </>)}
      </nav>

      <AvisoDeSalida abierto={bloqueo.preguntando}
        aviso="Se para el reloj y se pierden las repeticiones que no hayas guardado."
        onSeguir={bloqueo.cerrar}
        onSalir={() => { bloqueo.cerrar(); setRelojEnMarcha(false); setVista('lista') }} />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {aviso && (
          <div className={'mb-5 px-4 py-3 rounded-xl text-sm border ' + (aviso.tipo === 'ok'
            ? 'bg-green-500/8 border-green-500/30 text-green-300'
            : 'bg-red-500/8 border-red-500/30 text-red-300')}>{aviso.texto}</div>
        )}

        {/* ═════════ LISTA ═════════ */}
        {vista === 'lista' && (
          <>
            <div className="flex justify-between items-start gap-4 mb-6 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold mb-1">Tests propios</h2>
                <p className="text-gray-400 text-sm max-w-xl">
                  Los tuyos, además de los que trae la aplicación. Defines qué datos se rellenan y qué
                  sale de ellos, y cada resultado dice para qué sirve.
                </p>
              </div>
              <button onClick={nuevoTest} className={btn}>+ Crear test</button>
            </div>

            {tests.length === 0 ? (
              <div className={tarjeta + ' text-center py-14'}>
                <div className="text-4xl mb-3">🧪</div>
                <p className="text-gray-400 mb-1">Todavía no has creado ninguno.</p>
                <p className="text-gray-600 text-sm">Un test es unos campos que rellenas y una fórmula que sale de ellos.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tests.map(t => {
                  const referencias = referenciasDe(t.def)
                  return (
                    <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex justify-between items-center gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-semibold">{t.nombre}
                          <span className="text-gray-500 text-xs font-normal"> · {t.deporte}</span></div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {t.def.campos.length} campo{t.def.campos.length === 1 ? '' : 's'} ·
                          {' '}produce {t.def.resultados.map(r => r.nombre).join(', ') || '— nada'}
                          {t.mediciones > 0 && ' · ' + t.mediciones + ' medición' + (t.mediciones === 1 ? '' : 'es')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {referencias.map(h => <span key={h.indice}>{chipAncla(h.resultado.ancla, t.deporte)}</span>)}
                        <button onClick={() => abrirAtleta(t)} className={btnSec}>Pasar a un atleta</button>
                        <button onClick={() => abrirEditor(t)} title="Editar"
                          className="text-gray-500 hover:text-orange-400 px-2 py-1 rounded transition">✏️</button>
                        <button onClick={() => archivar(t)} title="Archivar"
                          className="text-gray-500 hover:text-red-400 px-2 py-1 rounded transition">🗄</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ═════════ EDITOR ═════════ */}
        {vista === 'editor' && (
          <div className="flex flex-col gap-4">
            <div className={tarjeta}>
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className={lab}>Nombre del test</label>
                  <input className={campo} value={def.nombre} placeholder="Test de Cooper"
                    onChange={e => setDef(d => ({ ...d, nombre: e.target.value }))} />
                </div>
                <div style={{ maxWidth: 170 }}>
                  <label className={lab}>Deporte</label>
                  <select className={campo} value={def.deporte}
                    onChange={e => setDef(d => ({ ...d, deporte: e.target.value }))}>
                    {DEPORTES.map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* --- campos --- */}
            <div className={tarjeta}>
              <p className="font-bold text-[15px] mb-0.5">1 · Qué datos se rellenan</p>
              <p className="text-gray-500 text-xs mb-4">
                Cada uno con su clave, que es como lo llamarás en las fórmulas. Y si se mide
                varias veces —los seis 100 de un 6×100—, dilo aquí: guardará una lista.
              </p>
              {def.campos.map((c, i) => {
                const mal = pegaDe(pegas, 'campo', i)
                const ins = c.instrumento
                return (
                  <div key={i} className="border border-gray-800 rounded-xl p-3 mb-3 bg-[#0d1420]">
                    <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
                      <div>
                        <label className={lab}>Clave</label>
                        <input className={(mal ? campoMal : campo) + ' font-mono'} value={c.clave}
                          onChange={e => renombrarCampo(i, e.target.value)} />
                      </div>
                      <div>
                        <label className={lab}>Lo que verás al pasarlo</label>
                        <input className={campo} value={c.etiqueta} placeholder="Cada 100"
                          onChange={e => parcheC(i, { etiqueta: e.target.value })} />
                      </div>
                      <div>
                        {/* VA FIJO EN EL TEST, no se elige al pasarlo: un 6×100
                            no es un 8×100, y si pudiera cambiarse sobre la
                            marcha la gráfica del total compararía dos
                            protocolos distintos sin decirlo. */}
                        <label className={lab}>Cuántas veces</label>
                        <select className={campo} value={vecesDe(c)}
                          onChange={e => parcheC(i, { veces: Number(e.target.value) })}>
                          <option value={1}>Una vez</option>
                          {Array.from({ length: MAX_VECES - 1 }, (_, k) => k + 2).map(n => (
                            <option key={n} value={n}>Serie de {n}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={lab}>Cómo se rellena</label>
                        <select className={campo} value={comoDe(c)}
                          onChange={e => parcheC(i, { instrumento: instrumentoDe(e.target.value, ins) })}>
                          {COMO_OPCIONES.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                        </select>
                      </div>
                      {ins?.tipo === 'cuentaAtras' && (
                        <div>
                          <label className={lab}>Dura (minutos)</label>
                          <input className={campo} type="number" step="any" min="0"
                            value={ins.segundos ? String(ins.segundos / 60) : ''}
                            onChange={e => parcheC(i, {
                              instrumento: { tipo: 'cuentaAtras', segundos: Math.round(Number(e.target.value) * 60) },
                            })} />
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-start gap-3 mt-2.5 pt-2.5 border-t border-dashed border-gray-800">
                      {/* Qué va a pasar exactamente con esta casilla, dicho
                          mientras se monta la fórmula: si el cronómetro escribe
                          segundos y la fórmula está pensada en minutos, el
                          resultado sale mal y NADA falla. */}
                      <p className="text-gray-400 text-[11.5px] leading-snug">{pistaDeCampo(c)}</p>
                      <button onClick={() => setDef(d => ({ ...d, campos: d.campos.filter((_, k) => k !== i) }))}
                        className="text-gray-600 hover:text-red-400 px-2 shrink-0">×</button>
                    </div>
                    {mal && <p className="text-red-300 text-[11px] mt-2">{mal}</p>}
                  </div>
                )
              })}
              <button onClick={addCampo} className={btnSec + ' mt-2'}>+ Añadir campo</button>
            </div>

            {/* --- resultados --- */}
            <div className={tarjeta}>
              <p className="font-bold text-[15px] mb-0.5">2 · Qué sale de ahí</p>
              <p className="text-gray-500 text-xs mb-4">
                Cada resultado puede usar los <b className="text-gray-300">anteriores</b>. Uno que no usa
                ninguno va por su cuenta: está para verlo avanzar en su gráfica.
              </p>

              {def.resultados.map((r, i) => {
                const mal = pegaDe(pegas, 'resultado', i)
                const previos = def.resultados.slice(0, i).filter(p => p.nombre)
                const dep = dependencias(r.formula)
                return (
                  <div key={i} className="bg-[#161f2e] border border-gray-800 rounded-xl p-4 mb-3">
                    <div className="flex justify-between items-center gap-2 mb-3">
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-gray-800 border border-gray-700 grid place-items-center text-[10.5px] text-gray-400 font-bold">{i + 1}</span>
                        {dep.refs.length > 0
                          ? <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-violet-500/14 border border-violet-400/40 text-violet-300 font-semibold">↳ sobre {dep.refs.join(', ')}</span>
                          : dep.campos.length > 0
                            ? <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/4 border border-gray-700 text-gray-400 font-semibold">suelto · de {dep.campos.join(', ')}</span>
                            : null}
                      </span>
                      <button onClick={() => setDef(d => ({ ...d, resultados: d.resultados.filter((_, k) => k !== i) }))}
                        className="text-gray-600 hover:text-red-400 px-1">×</button>
                    </div>

                    <div className="flex gap-2 flex-wrap items-start mb-3">
                      <div style={{ maxWidth: 150 }}>
                        <label className={lab}>Se llama</label>
                        <input className={(mal ? campoMal : campo) + ' font-mono'} value={r.nombre}
                          onChange={e => renombrarResultado(i, e.target.value)} />
                      </div>
                      <div style={{ maxWidth: 110 }}>
                        <label className={lab}>Unidad</label>
                        <input className={campo} value={r.unidad} placeholder="km/h"
                          onChange={e => parcheR(i, { unidad: e.target.value })} />
                        {/* Se enseña lo que la app ha deducido de la unidad, y se
                            puede corregir. De esto dependen la flecha de la
                            gráfica y hacia dónde va el % de una zona colgada de
                            aquí: el 95 % de 1:13 es más lento, no más rápido. */}
                        <button onClick={() => parcheR(i, { inverso: !esInverso(r) })}
                          title="Hacia dónde va la mejora en esta unidad. Cámbialo si no acierta."
                          className="text-[10.5px] text-gray-500 hover:text-gray-300 mt-1 transition">
                          {esInverso(r) ? '↓ menos es mejor' : '↑ más es mejor'}
                        </button>
                      </div>
                      <div className="flex-1 min-w-[220px]">
                        <label className={lab}>¿Para qué sirve?</label>
                        {/* Agrupado, porque el grupo ES el concepto: todo lo de
                            arriba es un número del que se pueden colgar zonas,
                            sea un umbral o una marca suya. */}
                        <select className={campo} value={r.ancla} onChange={e => parcheR(i, { ancla: e.target.value })}>
                          <optgroup label="Referencias — se les pueden colgar zonas">
                            {ANCLAS_REFERENCIA.map(k => <option key={k} value={k}>{ANCLAS[k].etiqueta}</option>)}
                          </optgroup>
                          <optgroup label="Lo demás">
                            <option value="nada">{ANCLAS.nada.etiqueta}</option>
                          </optgroup>
                        </select>
                        {/* Se dice AQUÍ, al crearlo, y no meses después cuando el
                            entrenador vaya a fijar zonas y descubra que no puede. */}
                        <Cabe deporte={def.deporte} r={r} />
                      </div>
                      <label className="flex items-center gap-2 text-gray-400 text-xs pt-6 cursor-pointer select-none">
                        <input type="checkbox" checked={r.graf} className="accent-orange-500"
                          onChange={e => parcheR(i, { graf: e.target.checked })} /> gráfica
                      </label>
                    </div>

                    {/* la fórmula, en bloques */}
                    <div className="bg-gray-950/60 border border-dashed border-gray-700 rounded-xl px-3 py-2.5 flex items-center gap-2 min-h-[48px]">
                      <div className="flex gap-1.5 flex-wrap flex-1">
                        {r.formula.length === 0
                          ? <span className="text-gray-600 text-sm italic">Móntala con los bloques de abajo</span>
                          : r.formula.map((b, n) => (
                              <button key={n} onClick={() => quitarBloque(i, n)} title="Quitar"
                                className={'font-mono text-[13px] font-semibold px-2.5 py-1.5 rounded-lg border transition hover:brightness-125 ' + (
                                  b.t === 'var' ? 'bg-orange-500/16 border-orange-500/45 text-orange-300'
                                  : b.t === 'fn' ? 'bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200'
                                  : b.t === 'ref' ? 'bg-violet-500/16 border-violet-400/45 text-violet-300'
                                  : b.t === 'num' ? 'bg-blue-500/14 border-blue-400/40 text-blue-300'
                                  : 'bg-gray-800 border-gray-600 text-gray-300')}>
                                {b.t === 'op' ? SIGNO[String(b.v)] : b.t === 'fn' ? b.v + '(' + b.de + ')' : String(b.v)}
                              </button>
                            ))}
                      </div>
                      <button onClick={() => setDef(d => ({ ...d, resultados: d.resultados.map((x, k) => k === i ? { ...x, formula: x.formula.slice(0, -1) } : x) }))}
                        className="text-gray-500 hover:text-white bg-gray-800 border border-gray-700 rounded-lg w-8 h-8 shrink-0">⌫</button>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <Paleta etiqueta="Campos del test" vacio="Añade algún campo arriba">
                        {def.campos.filter(c => c.clave).map(c => (
                          esSerie(c)
                            /* Una serie no es un número: pulsarla NO la mete en
                               la fórmula, pregunta qué se le quiere pedir. Dos
                               toques en vez de uno, y a cambio no hay forma de
                               escribir algo que no signifique nada. */
                            ? <BotonBloque key={c.clave} clase="bg-fuchsia-500/14 border-fuchsia-400/40 text-fuchsia-200"
                                onClick={() => setPidiendo(p => p?.res === i && p.campo === c.clave ? null : { res: i, campo: c.clave })}>
                                {c.clave} <span className="opacity-60">×{vecesDe(c)}</span>
                              </BotonBloque>
                            : <BotonBloque key={c.clave} clase="bg-orange-500/16 border-orange-500/45 text-orange-300"
                                onClick={() => addBloque(i, { t: 'var', v: c.clave })}>{c.clave}</BotonBloque>
                        ))}
                      </Paleta>
                      {/* Se comprueba que la serie siga existiendo: si se borra
                          o se pasa a «Una vez» con la pregunta abierta, el
                          desplegable quedaría ofreciendo funciones de un campo
                          que ya no las admite. */}
                      {pidiendo?.res === i && def.campos.some(c => c.clave === pidiendo.campo && esSerie(c)) && (
                        <Paleta etiqueta={'De «' + pidiendo.campo + '», ¿qué quieres?'}>
                          {(Object.keys(FUNCIONES) as Funcion[]).map(f => (
                            <BotonBloque key={f} clase="bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-100"
                              onClick={() => { addBloque(i, { t: 'fn', v: f, de: pidiendo.campo }); setPidiendo(null) }}>
                              {f}() <span className="opacity-60">{FUNCIONES[f]}</span>
                            </BotonBloque>
                          ))}
                        </Paleta>
                      )}
                      {previos.length > 0 && (
                        <Paleta etiqueta="Resultados anteriores — encadenar">
                          {previos.map(p => (
                            <BotonBloque key={p.nombre} clase="bg-violet-500/16 border-violet-400/45 text-violet-300"
                              onClick={() => addBloque(i, { t: 'ref', v: p.nombre })}>{p.nombre}</BotonBloque>
                          ))}
                        </Paleta>
                      )}
                      <Paleta etiqueta="Operaciones">
                        {OPS.map(o => (
                          <BotonBloque key={o} clase="bg-gray-800 border-gray-600 text-gray-300"
                            onClick={() => addBloque(i, { t: 'op', v: o })}>{SIGNO[o]}</BotonBloque>
                        ))}
                      </Paleta>
                      <CajaNumero onAdd={n => addBloque(i, { t: 'num', v: n })} />
                    </div>

                    {mal && <p className="text-red-300 text-xs mt-3">{mal}</p>}
                  </div>
                )
              })}

              <button onClick={addResultado} className={btnSec}>+ Añadir resultado</button>
            </div>

            <Prueba def={def} />

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={guardarTest} disabled={!sePuedeGuardar(def) || guardando} className={btn}>
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear test'}
              </button>
              <button onClick={() => setVista('lista')} className={btnSec}>Cancelar</button>
              {pegas.length > 0 && (
                <span className="text-red-300 text-xs">
                  {pegas.filter(p => p.donde === 'test').map(p => p.texto).join(' · ') ||
                    pegas.length + ' cosa' + (pegas.length === 1 ? '' : 's') + ' por arreglar arriba'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ═════════ PASÁRSELO A UN ATLETA ═════════ */}
        {vista === 'atleta' && testActivo && (
          <div className="flex flex-col gap-4">
            <div className={tarjeta}>
              <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
                <div>
                  <p className="font-bold text-[15px]">{testActivo.nombre}</p>
                  <p className="text-gray-500 text-xs">{testActivo.deporte}</p>
                </div>
                <div style={{ minWidth: 190 }}>
                  <label className={lab}>Deportista</label>
                  {/* No se cambia de atleta con el reloj andando: cambiar vacía
                      lo escrito, y con una serie a medias eso son cuatro 100
                      que ya no se pueden repetir. */}
                  <select className={campo} value={depActivo ?? ''} disabled={relojEnMarcha}
                    onChange={e => cambiarDeportista(Number(e.target.value))}>
                    {deportistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                  </select>
                </div>
              </div>

              {seTomaConReloj(testActivo.def) && (
                <div className="flex gap-2 mb-4">
                  {([['campo', '⏱ Test de campo'], ['mano', '✍ A mano']] as const).map(([k, t]) => (
                    <button key={k} onClick={() => setModoTest(k)}
                      className={'text-[12.5px] font-semibold px-3.5 py-2 rounded-lg border transition ' +
                        (modoTest === k
                          ? 'bg-orange-500/16 border-orange-500/50 text-orange-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200')}>
                      {t}
                    </button>
                  ))}
                </div>
              )}

              {modoTest === 'campo' && seTomaConReloj(testActivo.def) && (
                <div className="mb-4">
                  <InstrumentosTest
                    id={'propio:' + testActivo.id + ':' + depActivo}
                    herramientas={herramientasPropias(testActivo.def)}
                    valores={sueltosDe(entrada)}
                    setCampo={(clave, valor) => setEntrada(x => ({ ...x, [clave]: valor }))}
                    setVuelta={ponVuelta}
                    onEnMarcha={setRelojEnMarcha} />
                </div>
              )}

              {/* Las series, alineadas por repetición: el 100 nº 3 y sus
                  brazadas, en la misma fila. Con una columna por serie y las
                  repeticiones sueltas no habría forma de saber cuál va con
                  cuál — y esa es la mitad de la información. */}
              <TablaSeries def={testActivo.def} entrada={entrada} ponRep={ponVuelta}
                clase={campo} claseMedido={campoMedido} />

              <div className="flex gap-3 flex-wrap items-end mt-4">
                {testActivo.def.campos.filter(c => !esSerie(c)).map(c => (
                  <div key={c.clave} style={{ maxWidth: 200, flex: 1 }}>
                    <label className={lab}>{c.etiqueta || c.clave}</label>
                    <input className={c.instrumento ? campoMedido : campo}
                      type="number" step="any" value={String(entrada[c.clave] ?? '')}
                      onChange={e => setEntrada(x => ({ ...x, [c.clave]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ maxWidth: 160 }}>
                  <label className={lab}>Fecha</label>
                  <input className={campo} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                </div>
                <button onClick={guardarMedicion} disabled={guardando || !depActivo} className={btn}>
                  {guardando ? 'Guardando…' : 'Guardar medición'}
                </button>
              </div>

              {/* Lo que falta, contado antes de guardar. Se guarda igual —el dato
                  en bruto no se pierde nunca— pero los resultados no saldrán. */}
              <Incompletas def={testActivo.def} entrada={entrada} />

              <Sale def={testActivo.def} datos={entrada} />
            </div>

            {depActivo && (
              <FijarConEsto def={testActivo.def} idDefinicion={testActivo.id} idDeportista={depActivo}
                datos={entrada} fecha={fecha} avisar={decir} />
            )}

            <Graficas def={testActivo.def} mediciones={mediciones} />
            <Historial def={testActivo.def} mediciones={mediciones} />
          </div>
        )}
      </div>
    </main>
  )
}

// ============================================================
// Trozos de pantalla
// ============================================================

/**
 * Qué va a poder hacer este resultado, dicho al crearlo y no meses después.
 *
 * SON DOS COSAS DISTINTAS y la línea tiene que dejarlo claro: colgarle TUS
 * zonas lo puede hacer cualquier referencia; ocupar la casilla de la app -la
 * VAM, el FTP, el CSS- solo la que mida esa misma magnitud.
 */
function Cabe({ deporte, r }: { deporte: string; r: ResultadoTest }) {
  /* EL CASO POR DEFECTO TAMBIÉN SE EXPLICA. «Solo seguimiento» es lo que sale
     sin tocar nada, así que el camino más normal -creas un resultado y no bajas
     el desplegable- daba algo que no sirve para colgar zonas sin decirlo en
     ninguna parte: te enterabas en la otra pantalla, al encontrar el hueco
     vacío. Callarse aquí era callarse justo donde había que hablar. */
  if (tipoDeAncla(r.ancla) === 'seguimiento') {
    return (
      <p className="text-gray-500 text-[11px] mt-1.5 leading-snug">
        ◦ Solo para su gráfica. Para colgarle zonas, márcalo como referencia.
      </p>
    )
  }
  const v = puedeFijar(deporte, r)
  return v.destino
    ? <p className="text-green-300/80 text-[11px] mt-1.5 leading-snug">⚓ Podrás colgarle zonas y además fijar su {v.destino.nombre}.</p>
    : <p className="text-violet-300/75 text-[11px] mt-1.5 leading-snug">
        ◈ Podrás colgarle zonas propias. <span className="text-gray-500">{v.motivo}</span>
      </p>
}

/**
 * Que un resultado propio ocupe la casilla de la app: su VAM, su FTP, su CSS.
 *
 * ES EL CAMINO ESTRECHO, no el único. Una referencia que no cabe aquí no es una
 * referencia peor: es que sus zonas las cuelga el entrenador en Zonas propias,
 * y eso no pasa por esta pantalla ni tiene estas restricciones.
 *
 * FIJAR ES UNA ACCIÓN APARTE DE GUARDAR LA MEDICIÓN, igual que en los tests de
 * serie: guardar deja constancia de lo que hizo el atleta; fijar cambia los
 * ritmos que va a entrenar las próximas semanas. Un test puede salir mal —venía
 * tocado, la pista mojada— y que eso reescriba sus zonas en silencio sería el
 * peor fallo posible de esta pantalla.
 *
 * Y ESCRIBE EN LAS TABLAS DE SIEMPRE, no en una suya. Es todo el sentido de
 * esto: el número tiene que llegar a donde ya miran las zonas, la ficha y el
 * editor de sesión. Es lo único de `/tests-propios` que sale de su carpeta, y
 * lo hace añadiendo filas, no cambiando nada.
 */
function FijarConEsto({ def, idDefinicion, idDeportista, datos, fecha, avisar }: {
  def: DefinicionTest
  idDefinicion: number
  idDeportista: number
  datos: Entrada
  fecha: string
  avisar: (tipo: 'ok' | 'mal', texto: string) => void
}) {
  const [ocupado, setOcupado] = useState<number | null>(null)
  const referencias = referenciasDe(def)
  if (!referencias.length) return null

  /* Separadas, y cada grupo con el peso que le toca. Las que pueden ocupar la
     casilla de la app llevan un botón que cambia los ritmos del atleta: eso
     merece su recuadro. Las demás son igual de válidas pero no hay nada que
     pulsar aquí, así que van en una línea y no en tres tarjetas repitiendo lo
     mismo. El porqué de cada una ya se dijo al crear el test. */
  const conCasilla = referencias.filter(h => puedeFijar(def.deporte, h.resultado).destino)
  const soloTuyas = referencias.filter(h => !puedeFijar(def.deporte, h.resultado).destino)

  const fijar = async (indice: number) => {
    const p = propuestaPropia(def, indice, datos)
    if (!p) return
    setOcupado(indice)
    const r = await fijarZonas(supabase, idDeportista, fecha, p, origenDe(idDefinicion))
    setOcupado(null)
    if (r.error) { avisar('mal', r.error); return }
    avisar('ok', p.destino.nombre + ' fijado en ' + p.texto + '. Sus zonas de ' +
      def.deporte.toLowerCase() + ' ya salen de aquí.' +
      (r.sinOrigen ? ' (No ha quedado apuntado de qué test salió.)' : ''))
  }

  return (
    <div className="flex flex-col gap-3">
      {soloTuyas.length > 0 && (
        /* Ni «no se puede» ni un aviso en ámbar: son referencias suyas
           perfectamente buenas y lo único que cambia es de dónde cuelgan sus
           zonas. Escrito como un fallo, el entrenador dejaría de usarlas. */
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-4 py-3 text-[12.5px] leading-snug">
          <span className="text-violet-300">◈ </span>
          {soloTuyas.map((h, k) => (
            <span key={h.indice} title={puedeFijar(def.deporte, h.resultado).motivo ?? ''}>
              {k > 0 && ', '}
              <span className="font-mono text-violet-300">{h.resultado.nombre}</span>
            </span>
          ))}
          <span className="text-gray-400">
            {soloTuyas.length === 1 ? ' es una referencia tuya' : ' son referencias tuyas'}.
            Cuélgales zonas en <span className="text-gray-300">Herramientas → Zonas propias</span>.
          </span>
        </div>
      )}

      {conCasilla.map(h => {
        const v = puedeFijar(def.deporte, h.resultado)
        const p = propuestaPropia(def, h.indice, datos)
        return (
          <div key={h.indice} className="rounded-xl border border-blue-900/50 bg-blue-950/25 p-4 flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-sm text-gray-300">
                Usar <span className="font-mono text-gray-400">{h.resultado.nombre}</span> como su{' '}
                <span className="font-semibold text-blue-300">{v.destino!.nombre}</span>
                <span className="text-gray-500"> (estimado)</span>
              </span>
              {p && <span className="text-blue-300 font-bold tabular-nums">{p.texto}</span>}
            </div>
            {p ? (
              <>
                <button onClick={() => fijar(h.indice)} disabled={ocupado !== null}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
                  {ocupado === h.indice ? 'Guardando…' : 'Fijar sus zonas de ' + def.deporte.toLowerCase()}
                </button>
                <p className="text-gray-500 text-[11px] leading-snug">
                  Cambia los ritmos que va a entrenar. Guardar la medición no hace esto solo.
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-xs leading-snug">
                Rellena los datos de arriba y sale el número que se guardaría.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Paleta({ etiqueta, vacio, children }: { etiqueta: string; vacio?: string; children: React.ReactNode }) {
  const hay = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div>
      <span className="block text-gray-500 text-[10.5px] uppercase tracking-wider mb-1.5">{etiqueta}</span>
      <div className="flex gap-1.5 flex-wrap items-center">
        {hay ? children : <span className="text-gray-600 text-xs">{vacio}</span>}
      </div>
    </div>
  )
}

function BotonBloque({ clase, onClick, children }: { clase: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={'font-mono text-[13px] font-semibold px-2.5 py-1.5 rounded-lg border transition hover:brightness-125 hover:-translate-y-px ' + clase}>
      {children}
    </button>
  )
}

/** Un número cualquiera para la fórmula. */
function CajaNumero({ onAdd }: { onAdd: (n: number) => void }) {
  const [v, setV] = useState('200')
  const meter = () => { const n = Number(v); if (v !== '' && Number.isFinite(n)) onAdd(n) }
  return (
    <Paleta etiqueta="Un número">
      <input className="bg-gray-800 text-white text-xs rounded-lg px-2.5 py-2 w-24 outline-none focus:ring-1 focus:ring-orange-500"
        type="number" step="any" value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') meter() }} />
      <BotonBloque clase="bg-blue-500/14 border-blue-400/40 text-blue-300" onClick={meter}>+ añadir</BotonBloque>
    </Paleta>
  )
}

/** La prueba del editor: se ve el resultado antes de guardar nada. */
function Prueba({ def }: { def: DefinicionTest }) {
  const [datos, setDatos] = useState<Entrada>({})
  if (!def.campos.length || !def.resultados.length) return null
  const vals = calcularResultados(def, datos)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="text-gray-500 text-[11px] uppercase tracking-wider mb-3">Pruébalo antes de guardarlo</p>
      <div className="flex gap-3 flex-wrap mb-4">
        {def.campos.map(c => (
          <div key={c.clave} style={{ maxWidth: esSerie(c) ? 230 : 150 }}>
            <label className="block text-gray-400 text-[11.5px] mb-1 font-mono">
              {c.clave}{esSerie(c) && <span className="text-gray-600"> ×{vecesDe(c)}</span>}
            </label>
            {/* Para probar, la serie entera en una casilla separada por espacios:
                montar aquí seis recuadros sería pedirle al entrenador que pase el
                test de verdad solo para ver si la fórmula sale. */}
            <input className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 w-full outline-none focus:ring-1 focus:ring-orange-500"
              type={esSerie(c) ? 'text' : 'number'} step="any"
              placeholder={esSerie(c) ? '74,2 75 76,1…' : ''}
              value={Array.isArray(datos[c.clave]) ? (datos[c.clave] as string[]).join(' ') : String(datos[c.clave] ?? '')}
              onChange={e => setDatos(d => ({
                ...d,
                [c.clave]: esSerie(c)
                  ? e.target.value.replace(/,/g, '.').split(/[\s;]+/).filter(x => x !== '')
                  : e.target.value,
              }))} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {def.resultados.map((r, i) => (
          <div key={i} className="flex justify-between items-baseline gap-3 text-sm">
            <span className="font-mono text-gray-400">{r.nombre}</span>
            <span className={vals[i].error ? 'text-red-300 text-xs' : 'text-green-300 font-semibold tabular-nums'}>
              {vals[i].error ? '⚠ ' + vals[i].error : nEs(vals[i].valor as number) + ' ' + r.unidad}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Las series, una columna cada una y una fila por repetición.
 *
 * ALINEADAS POR REPETICIÓN, que es la decisión de diseño de toda esta pantalla:
 * el 100 nº 3 y sus brazadas tienen que estar en la misma fila. Cada serie en
 * su propio bloque daría más aire y perdería la mitad de la información.
 *
 * Y TODAS LAS CASILLAS SE PUEDEN ESCRIBIR, también las que llena el reloj. El
 * cronómetro propone; con seis repeticiones se falla pulsando, y un tiempo mal
 * cogido tiene que poder corregirse sin repetir el test.
 */
function TablaSeries({ def, entrada, ponRep, clase, claseMedido }: {
  def: DefinicionTest
  entrada: Entrada
  ponRep: (clave: string, indice: number, valor: string) => void
  clase: string
  /** La misma casilla, marcada como puesta por un instrumento. */
  claseMedido: string
}) {
  const series = (def.campos || []).filter(esSerie)
  if (series.length === 0) return null
  const filas = Math.max(...series.map(vecesDe))

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full border-collapse" style={{ minWidth: 260 }}>
        <thead>
          <tr>
            <th className="text-left text-[10px] uppercase tracking-wider text-gray-600 font-semibold py-2 pr-2 w-10">Rep.</th>
            {series.map(c => (
              <th key={c.clave} className="text-left text-[11px] text-gray-400 font-semibold py-2 px-1.5 align-bottom">
                {c.etiqueta || c.clave}
                <span className="block text-[10px] text-gray-600 font-normal">
                  {c.instrumento ? COMO_OPCIONES.find(o => o.valor === comoDe(c))?.texto : 'A mano'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: filas }, (_, f) => (
            <tr key={f}>
              <td className="font-mono text-[12px] text-gray-600 tabular-nums pr-2">{f + 1}</td>
              {series.map(c => {
                const fuera = f >= vecesDe(c)
                const v = serieDeDatos(entrada, c)[f]
                return (
                  <td key={c.clave} className="px-1.5 py-1">
                    {fuera ? <span className="text-gray-700 text-sm">—</span> : (
                      <input className={(c.instrumento ? claseMedido : clase) + ' font-mono tabular-nums'}
                        type="number" step="any" inputMode="decimal"
                        value={String(v ?? '')}
                        onChange={e => ponRep(c.clave, f, e.target.value)} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Qué series están a medias, dicho antes de guardar. */
function Incompletas({ def, entrada }: { def: DefinicionTest; entrada: Entrada }) {
  const medias = (def.campos || []).filter(esSerie).map(c => {
    const faltan = faltanDe(serieDeDatos(entrada, c))
    return { c, faltan }
  }).filter(x => x.faltan > 0 && x.faltan < vecesDe(x.c))

  if (medias.length === 0) return null
  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[12px] leading-snug text-amber-200/90">
      {medias.map(({ c, faltan }) => (
        <p key={c.clave}>
          <b className="text-amber-100">{c.etiqueta || c.clave}: faltan {faltan} de {vecesDe(c)}.</b>
        </p>
      ))}
      <p className="text-amber-200/70 mt-1">
        Se guarda igual —lo medido no se pierde—, pero los resultados que usen esa serie no se
        calculan: llamar «total» a la suma de las que sí están sería un número que miente.
      </p>
    </div>
  )
}

/** Lo que sale de lo que acabas de teclear, antes de guardarlo. */
function Sale({ def, datos }: { def: DefinicionTest; datos: Entrada }) {
  const vals = calcularResultados(def, datos)
  const algo = Object.values(datos).flat().some(v => String(v ?? '').trim() !== '')
  if (!algo) return null
  return (
    <div className="mt-4 pt-4 border-t border-gray-800 flex gap-6 flex-wrap">
      {def.resultados.map((r, i) => (
        <div key={i}>
          <div className="text-gray-500 text-[11px]">{r.nombre}</div>
          <div className={vals[i].error ? 'text-red-300 text-xs mt-0.5' : 'text-green-300 text-xl font-bold tabular-nums'}>
            {vals[i].error ? '⚠ ' + vals[i].error : nEs(vals[i].valor as number)}
            {!vals[i].error && <span className="text-gray-400 text-sm font-normal"> {r.unidad}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Una gráfica por resultado, y no todas en la misma.
 *
 * La VAM va en km/h y el ritmo en min/km: en un eje común la línea del ritmo
 * sería una raya plana pegada al suelo y no compararía nada.
 */
function Graficas({ def, mediciones }: { def: DefinicionTest; mediciones: Medicion[] }) {
  const series = seriesDe(def, mediciones)
  const conDatos = series.filter(s => s.puntos.length >= 2)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="font-bold text-[15px] mb-0.5">Cómo va con el tiempo</p>
      <p className="text-gray-500 text-xs mb-4">Una por resultado: cada uno tiene su unidad y no se pueden mezclar en un eje.</p>
      {conDatos.length === 0 ? (
        <p className="text-gray-600 text-sm italic">
          {mediciones.length < 2
            ? 'Con una sola medición no hay tendencia que dibujar. Guarda otra con distinta fecha.'
            : 'Ningún resultado está marcado para gráfica.'}
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          {conDatos.map((s, i) => <Grafica key={s.nombre} s={s} idx={i} />)}
        </div>
      )}
    </div>
  )
}

function Grafica({ s, idx }: { s: SerieResultado; idx: number }) {
  const vs = s.puntos.map(p => p.valor)
  let min = Math.min(...vs), max = Math.max(...vs)
  if (max === min) { max = min + 1; min = min - 1 }
  const pad = (max - min) * 0.15; min -= pad; max += pad

  const W = 260, H = 84
  const x = (n: number) => (n / (s.puntos.length - 1)) * (W - 8) + 4
  const y = (v: number) => H - 14 - ((v - min) / (max - min)) * (H - 26)
  const linea = s.puntos.map((p, n) => `${n ? 'L' : 'M'}${x(n).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')
  const area = `${linea} L${x(s.puntos.length - 1).toFixed(1)},${H - 14} L${x(0).toFixed(1)},${H - 14} Z`

  const bien = s.mejora !== false
  const col = s.mejora === null ? '#9ca3af' : bien ? '#4ade80' : '#f87171'
  const ult = s.puntos[s.puntos.length - 1]

  return (
    <div className="bg-[#161f2e] border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-xs font-bold">{s.nombre} <span className="text-gray-500 font-normal">{s.unidad}</span></span>
        <span className="font-mono text-[15px] font-bold tabular-nums">{nEs(ult.valor)}</span>
      </div>
      <div className="text-[11px] tabular-nums" style={{ color: col }}>
        {s.delta === null || s.delta === 0 ? 'igual que la anterior'
          : (s.delta > 0 ? '+' : '') + nEs(s.delta) + ' · ' + (s.mejora ? 'mejor' : 'peor')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block mt-2" style={{ height: 84, overflow: 'visible' }}
        role="img" aria-label={`Evolución de ${s.nombre}: ${s.puntos.map(p => nEs(p.valor)).join(', ')}`}>
        <defs>
          <linearGradient id={'g' + idx} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity=".22" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#g${idx})`} />
        <path d={linea} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {s.puntos.map((p, n) => (
          <circle key={n} cx={x(n).toFixed(1)} cy={y(p.valor).toFixed(1)} r={n === s.puntos.length - 1 ? 3.4 : 2}
            fill={n === s.puntos.length - 1 ? col : '#030712'} stroke={col} strokeWidth="1.4" />
        ))}
        <text x="2" y={H - 2} className="fill-gray-600" style={{ fontSize: 9.5 }}>{s.puntos[0].fecha.slice(5)}</text>
        <text x={W - 2} y={H - 2} textAnchor="end" className="fill-gray-600" style={{ fontSize: 9.5 }}>{ult.fecha.slice(5)}</text>
      </svg>
    </div>
  )
}

/**
 * El historial recalcula los resultados desde los campos guardados.
 *
 * Por eso corregir una fórmula corrige el pasado entero: lo que se guardó fue
 * lo que midió el atleta, no lo que la fórmula de aquel día dijo.
 */
function Historial({ def, mediciones }: { def: DefinicionTest; mediciones: Medicion[] }) {
  if (!mediciones.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <p className="font-bold text-[15px] mb-1">Historial</p>
        <p className="text-gray-600 text-sm italic">Todavía no hay mediciones de este atleta.</p>
      </div>
    )
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="font-bold text-[15px] mb-3">Historial</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-700">
              <th className="text-left py-2 px-2">Fecha</th>
              {def.campos.map(c => <th key={c.clave} className="text-left py-2 px-2 font-mono normal-case">{c.clave}</th>)}
              {def.resultados.map(r => <th key={r.nombre} className="text-left py-2 px-2 font-mono normal-case">{r.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {mediciones.map(m => {
              const vals = calcularResultados(def, m.datos)
              return (
                <tr key={m.fecha} className="border-b border-gray-800/70">
                  <td className="py-2 px-2 text-gray-500 tabular-nums">{m.fecha}</td>
                  {def.campos.map(c => (
                    <td key={c.clave} className="py-2 px-2 text-gray-300 tabular-nums">
                      {esSerie(c)
                        ? serieDeDatos(m.datos, c).map(x => (x === '' || x == null ? '—' : String(x))).join(' · ')
                        : String(m.datos[c.clave] ?? '—')}
                    </td>
                  ))}
                  {vals.map((v, i) => (
                    <td key={i} className="py-2 px-2 font-semibold tabular-nums">
                      {v.error ? <span className="text-red-300/70 font-normal text-xs">—</span>
                        : nEs(v.valor as number) + ' ' + def.resultados[i].unidad}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
