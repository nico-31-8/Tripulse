'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO, sumarDias } from '@/lib/fechas'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import Cargando from '@/components/Cargando'
import {
  miembrosDe, meterEnGrupo, sacarDelGrupo, testsQueFaltan, fichaDeGrupo,
  borrarGrupo, renombrarGrupo, sincronizarZonasDelGrupo,
  type MiembroGrupo,
} from '@/lib/grupos'
import { emitirSesion, resumenEmision, microsDeDeportista, microDelDia, type ResultadoMiembro } from '@/lib/grupos-emision'
import {
  sesionesDelGrupo, volcar, resumenVolcado, volcadoPrevio, apartarVolcadoPrevio,
  loQueYaTiene, sesionesQueLeFaltan,
  type SesionDelGrupo, type ResultadoVolcado, type VolcadoPrevio,
} from '@/lib/grupos-volcado'
import { cargarCumplimiento, porcentaje, type Cumplimiento } from '@/lib/grupos-cumplimiento'
import { plantillasDe, bloquesDe, aplicarBloques, textoBloque, opcionesDe, resolverClave, NIVELES, type NivelPlantilla } from '@/lib/plantillas'
import { cargarPropias, type PlantillaPropia } from '@/lib/plantillas-propias'

const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera']
/* Aquí había un `hoyISO` local... en UTC. Mismo nombre que el de lib/fechas y
   la implementación contraria: de madrugada devolvía ayer. Se importa el bueno. */

export default function PaginaGrupo({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  useRequireEntrenador()
  const { id } = use(params)
  const [grupo, setGrupo] = useState<any>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [miembros, setMiembros] = useState<MiembroGrupo[]>([])
  // Tests del atleta, por id. Sin ellos la zona sale sin ritmo ni vatios.
  const [tests, setTests] = useState<Record<string, any>>({})
  const [fuera, setFuera] = useState<any[]>([])
  const [anadiendo, setAnadiendo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  // Mandar entrenamiento
  const [mandando, setMandando] = useState(false)
  const [fecha, setFecha] = useState(hoyISO())
  const [disciplina, setDisciplina] = useState('Natacion')
  const [nivel, setNivel] = useState<NivelPlantilla>('intermedio')
  const [propias, setPropias] = useState<PlantillaPropia[]>([])
  const [elegida, setElegida] = useState('')
  const [parte, setParte] = useState<ResultadoMiembro[] | null>(null)
  // La ficha con la que el grupo se planifica. Para el calendario y el dibujo es un
  // deportista más, así que esas pantallas sirven al grupo sin cambiar nada.
  const [idFicha, setIdFicha] = useState<number | null>(null)
  const [abriendoPlan, setAbriendoPlan] = useState('')
  // Volcar el plan del grupo a los miembros
  const [volcando, setVolcando] = useState(false)
  const [desde, setDesde] = useState(hoyISO())
  const [hasta, setHasta] = useState(() => sumarDias(hoyISO(), 6))
  const [aVolcar, setAVolcar] = useState<SesionDelGrupo[] | null>(null)
  const [parteVolcado, setParteVolcado] = useState<ResultadoVolcado[] | null>(null)
  const [previo, setPrevio] = useState<VolcadoPrevio | null>(null)
  const [reemplazar, setReemplazar] = useState(true)
  // Cumplimiento. Por defecto los últimos 14 días: lo que quieres saber es qué ha
  // pasado con lo que mandaste hace poco, no el histórico entero.
  const [cump, setCump] = useState<Cumplimiento | null>(null)
  const [cDesde, setCDesde] = useState(() => sumarDias(hoyISO(), -13))
  const [cHasta, setCHasta] = useState(hoyISO())
  const [renombrando, setRenombrando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [aviso, setAviso] = useState('')

  const actualizarZonas = async () => {
    setOcupado(true); setError(''); setAviso('')
    const { id: ficha, error: e } = idFicha ? { id: idFicha, error: null } : await fichaDeGrupo(supabase, id)
    if (e || !ficha) { setError(e || 'No se pudo leer la ficha del grupo.'); setOcupado(false); return }
    setIdFicha(ficha)
    const { sistema, error: eZ } = await sincronizarZonasDelGrupo(
      supabase, ficha, miembros.map(m => m.sistema_zonas))
    if (eZ) setError(eZ)
    else setAviso(sistema === 2
      ? 'El grupo pasa a usar las siglas (AER, AEL, AEM…), como la mayoría de sus miembros.'
      : 'El grupo pasa a usar Z1–Z7, como la mayoría de sus miembros.')
    setOcupado(false)
  }

  const guardarNombre = async () => {
    setOcupado(true); setError('')
    const e = await renombrarGrupo(supabase, id, nombreNuevo, idFicha)
    if (e) setError(e)
    else { setRenombrando(false); await cargar() }
    setOcupado(false)
  }

  const eliminar = async () => {
    if (!confirm(
      '¿Borrar el grupo «' + grupo?.nombre + '»?\n\n' +
      'SE BORRA: el grupo, su lista de miembros y su calendario con toda su periodización.\n\n' +
      'SE QUEDA: todo lo que ya volcaste. Esas sesiones son de cada deportista y siguen en su calendario; solo pierden la etiqueta del grupo.\n\n' +
      'Esto no se puede deshacer.')) return
    setOcupado(true)
    const e = await borrarGrupo(supabase, id)
    if (e) { setError(e); setOcupado(false); return }
    router.push('/deportistas')
  }

  useEffect(() => {
    if (!mandando) return
    cargarPropias(supabase, disciplina).then(setPropias)
    setElegida('')
  }, [mandando, disciplina])

  useEffect(() => { cargar() }, [id])

  const cargar = async () => {
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }

    const { data: g } = await supabase.from('grupo_entreno')
      .select('id, nombre, descripcion').eq('id', id).maybeSingle()
    if (!g) { setNoExiste(true); return }
    setGrupo(g)

    const ms = await miembrosDe(supabase, id)
    setMiembros(ms)

    // Los deportistas del entrenador que NO están en el grupo, para poder añadirlos.
    const { data: todos } = await supabase.from('deportista')
      .select('id, nombre').eq('id_entrenador', user.id)
    const dentro = new Set(ms.map(m => String(m.id_deportista)))
    setFuera((todos || []).filter((d: any) => !dentro.has(String(d.id))))

    if (ms.length) {
      const ids = ms.map(m => m.id_deportista)
      // Se queda con el más reciente de cada uno: las listas vienen por fecha
      // descendente, así que el primero que aparece es el bueno.
      const ultimo = (filas: any[] | null, campo: string) => {
        const por: Record<string, number> = {}
        for (const f of filas || []) {
          const k = String(f.id_deportista)
          if (!(k in por) && f[campo]) por[k] = Number(f[campo])
        }
        return por
      }
      const [c, n, b] = await Promise.all([
        supabase.from('test1_carrera').select('id_deportista, vam').in('id_deportista', ids).order('fecha', { ascending: false }),
        supabase.from('test2_natacion').select('id_deportista, css').in('id_deportista', ids).order('fecha', { ascending: false }),
        supabase.from('test3_ciclismo').select('id_deportista, ftp').in('id_deportista', ids).order('fecha', { ascending: false }),
      ])
      const vam = ultimo(c.data, 'vam'), css = ultimo(n.data, 'css'), ftp = ultimo(b.data, 'ftp')
      const mapa: Record<string, any> = {}
      for (const m of ms) {
        const k = String(m.id_deportista)
        mapa[k] = { vam: vam[k], css: css[k], ftp: ftp[k] }
      }
      setTests(mapa)
      setCump(await cargarCumplimiento(supabase, id,
        ms.map(m => ({ id_deportista: m.id_deportista, nombre: m.nombre })), cDesde, cHasta))
    } else { setTests({}); setCump(null) }
  }

  const recargarCumplimiento = async (d: string, h: string) => {
    setCDesde(d); setCHasta(h)
    if (!miembros.length) return
    setCump(await cargarCumplimiento(supabase, id,
      miembros.map(m => ({ id_deportista: m.id_deportista, nombre: m.nombre })), d, h))
  }

  const anadir = async (idDep: number) => {
    setOcupado(true); setError(''); setAviso('')
    const e = await meterEnGrupo(supabase, id, [idDep])
    if (e) setError(e)
    else {
      // Entra limpio: no se le copia nada solo. Pero este es el momento en que hace
      // falta saber que existe el botón, así que se dice aquí y no en un manual.
      const nombre = fuera.find((d: any) => String(d.id) === String(idDep))?.nombre || 'Ya está dentro'
      setAviso(nombre + ' está en el grupo. No recibe nada de lo ya planificado: si quieres dárselo, pulsa «Traer futuras» en su fila.')
    }
    await cargar()
    setOcupado(false)
  }

  // Traerle a una persona lo que el grupo ya tiene planificado de hoy en adelante.
  //
  // Al meter a alguien nuevo NO se le copia nada automáticamente: meter a una
  // persona pasa a ser una acción con consecuencias grandes e invisibles, y podría
  // llenarle el calendario sin querer. Se ofrece y decide el entrenador.
  const traerFuturas = async (m: MiembroGrupo) => {
    setOcupado(true); setError(''); setAviso('')
    const { id: ficha, error: e } = idFicha ? { id: idFicha, error: null } : await fichaDeGrupo(supabase, id)
    if (e || !ficha) { setError(e || 'No se pudo leer el plan del grupo.'); setOcupado(false); return }
    setIdFicha(ficha)

    const hoy = hoyISO()
    // Un año por delante: el horizonte de cualquier planificación real.
    const hasta365 = sumarDias(hoy, 365)

    const delGrupo = await sesionesDelGrupo(supabase, ficha, hoy, hasta365)
    const tiene = await loQueYaTiene(supabase, id, m.id_deportista, hoy, hasta365)
    const faltan = sesionesQueLeFaltan(delGrupo, tiene)

    if (!faltan.length) {
      setAviso(delGrupo.length
        ? m.nombre + ' ya tiene todo lo que el grupo tiene planificado de hoy en adelante.'
        : 'El grupo no tiene nada planificado de hoy en adelante.')
      setOcupado(false); return
    }
    if (!confirm('¿Traerle a ' + m.nombre + ' ' + faltan.length +
      (faltan.length === 1 ? ' sesión' : ' sesiones') + ' del grupo?\n\nSon las que el grupo tiene planificadas de hoy en adelante y que todavía no tiene.')) {
      setOcupado(false); return
    }

    const r = await volcar(supabase, {
      idGrupo: id, nombre: 'Alta de ' + m.nombre, sesiones: faltan,
      miembros: [{ id_deportista: m.id_deportista, nombre: m.nombre }],
      microsDe: (idDep) => microsDeDeportista(supabase, idDep),
      microDelDia,
    })
    if (r.error) setError(r.error)
    else setAviso(resumenVolcado(r.resultados))
    setOcupado(false)
  }

  const sacar = async (m: MiembroGrupo) => {
    if (!confirm('¿Sacar a ' + m.nombre + ' del grupo?\n\nLos entrenamientos que ya tiene en su calendario se quedan: son suyos. Solo dejará de recibir los nuevos.')) return
    setOcupado(true); setError('')
    const e = await sacarDelGrupo(supabase, id, m.id_deportista)
    if (e) setError(e)
    await cargar()
    setOcupado(false)
  }

  // La ficha se crea la primera vez que vas a planificar, no antes: un grupo al que
  // nunca planificas no necesita ninguna.
  const abrirPlan = async (destino: 'calendario' | 'dibujo') => {
    setAbriendoPlan(destino); setError('')
    const { id: ficha, error: e } = idFicha
      ? { id: idFicha, error: null }
      : await fichaDeGrupo(supabase, id)
    setAbriendoPlan('')
    if (e || !ficha) { setError(e || 'No se pudo abrir la planificación del grupo.'); return }
    setIdFicha(ficha)
    router.push('/planificacion-visual/' + ficha + '/' + destino)
  }

  // Se enseña QUÉ se va a volcar antes de volcarlo. Son ocho calendarios y esto no
  // tiene deshacer: mirarlo antes es más barato que limpiarlo después.
  const mirarQueHay = async () => {
    setOcupado(true); setError(''); setParteVolcado(null)
    const { id: ficha, error: e } = idFicha ? { id: idFicha, error: null } : await fichaDeGrupo(supabase, id)
    if (e || !ficha) { setError(e || 'No se pudo leer el plan del grupo.'); setOcupado(false); return }
    setIdFicha(ficha)
    setAVolcar(await sesionesDelGrupo(supabase, ficha, desde, hasta))
    // Y de paso, qué hay ya volcado ahí: repetir el mismo rango es lo normal en
    // cuanto corriges algo, y sin avisar dejaría a todos con las sesiones dobles.
    setPrevio(await volcadoPrevio(supabase, id, miembros.map(m => m.id_deportista), desde, hasta))
    setOcupado(false)
  }

  const hacerVolcado = async () => {
    if (!aVolcar?.length) return
    setOcupado(true); setError('')
    if (reemplazar && previo?.planificadas.length) {
      const e = await apartarVolcadoPrevio(supabase, previo.planificadas)
      if (e) { setError('No se pudieron apartar las anteriores: ' + e); setOcupado(false); return }
    }
    const r = await volcar(supabase, {
      idGrupo: id,
      nombre: 'Del ' + desde.slice(8) + '/' + desde.slice(5, 7) + ' al ' + hasta.slice(8) + '/' + hasta.slice(5, 7),
      sesiones: aVolcar,
      miembros: miembros.map(m => ({ id_deportista: m.id_deportista, nombre: m.nombre })),
      microsDe: (idDep) => microsDeDeportista(supabase, idDep),
      microDelDia,
    })
    if (r.error) setError(r.error)
    setParteVolcado(r.resultados.length ? r.resultados : null)
    setAVolcar(null); setPrevio(null)
    setOcupado(false)
  }

  // Las del sistema y las tuyas, en una sola lista: al mandar da igual de dónde salga.
  const delSistema = plantillasDe(disciplina)

  // La referencia del sistema puede ser una plantilla ('cic-aei') o una de sus
  // variantes ('cic-aei/over-unders'). Se resuelve en un solo sitio para que el
  // desplegable y la vista previa no puedan discrepar.
  const delSistemaPorClave = (clave: string) => {
    const r = resolverClave(clave)
    if (!r) return null
    return {
      nombre: r.variante ? r.plantilla.nombre + ' · ' + r.variante.nombre : r.plantilla.nombre,
      bloques: bloquesDe(r.plantilla, nivel, r.variante?.id),
    }
  }

  const mandar = async () => {
    setOcupado(true); setError(''); setParte(null)
    const [tipo, ref] = elegida.split(':')
    let bloques: any[] = []
    let nombre = 'Sesión de ' + disciplina
    if (tipo === 'sis') {
      const s = delSistemaPorClave(ref)
      if (s) { bloques = s.bloques; nombre = s.nombre }
    } else if (tipo === 'mia') {
      const p = propias.find(x => String(x.id) === ref)
      if (p) { bloques = p.bloques; nombre = p.nombre }
    }
    const r = await emitirSesion(supabase, {
      idGrupo: id, nombre, fecha, disciplina, bloques,
      miembros: miembros.map(m => ({ id_deportista: m.id_deportista, nombre: m.nombre })),
      aplicarBloques,
    })
    if (r.error) setError(r.error)
    setParte(r.resultados.length ? r.resultados : null)
    setOcupado(false)
  }

  if (noExiste) return <Cargando volverA="/deportistas" noExiste />
  if (!grupo) return <Cargando volverA="/deportistas" />

  const sinTests = miembros.filter(m => testsQueFaltan(tests[String(m.id_deportista)]).length === 3)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/deportistas')} className="text-gray-400 hover:text-white text-sm transition">← Deportistas</button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="min-w-0">
            {renombrando ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input type="text" value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') guardarNombre(); if (e.key === 'Escape') setRenombrando(false) }}
                  autoFocus
                  className="bg-gray-800 text-white text-xl font-bold px-3 py-1.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                <button onClick={guardarNombre} disabled={ocupado}
                  className="bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg text-sm transition disabled:opacity-40">Guardar</button>
                <button onClick={() => setRenombrando(false)}
                  className="text-gray-500 hover:text-white text-sm transition">Cancelar</button>
              </div>
            ) : (
              <h2 className="text-2xl font-bold">{grupo.nombre}</h2>
            )}
            <p className="text-gray-500 text-sm mt-1">
              {miembros.length} deportista{miembros.length === 1 ? '' : 's'} · entrenan lo mismo, cada uno a su intensidad
            </p>
          </div>

          <div className="flex items-center gap-2 flex-none">
            {!renombrando && (
              <button onClick={() => { setNombreNuevo(grupo.nombre); setRenombrando(true) }}
                className="text-gray-400 hover:text-white text-xs border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition">
                Editar nombre
              </button>
            )}
            {/* Realinea el sistema de zonas del grupo con el de sus miembros. Hace
                falta un botón porque los miembros cambian: metes a alguien que usa
                otro sistema, o le cambias el suyo, y el grupo se queda hablando el
                idioma de antes sin que nada lo indique. */}
            <button onClick={actualizarZonas} disabled={ocupado || miembros.length === 0}
              title="Vuelve a mirar qué sistema de zonas usan sus miembros y pone el grupo igual"
              className="text-gray-400 hover:text-white text-xs border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
              Actualizar zonas
            </button>
            <button onClick={eliminar} disabled={ocupado}
              className="text-gray-600 hover:text-red-400 text-xs border border-gray-800 hover:border-red-900 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
              Borrar
            </button>
          </div>
        </div>

        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {aviso && <div className="bg-green-950/50 border border-green-800/60 text-green-300 px-4 py-3 rounded-lg text-sm">{aviso}</div>}

        {/* El grupo se planifica como se planifica una persona: mismo calendario y
            mismo dibujo de periodización. Debajo, el grupo tiene su propia ficha de
            planificación, así que su plan no se mezcla con el de nadie. */}
        <section className="grid sm:grid-cols-2 gap-3">
          <button onClick={() => abrirPlan('calendario')} disabled={!!abriendoPlan}
            className="bg-gray-900 border border-gray-800 hover:border-orange-500 rounded-xl p-5 text-left transition disabled:opacity-50">
            <p className="font-bold">{abriendoPlan === 'calendario' ? 'Abriendo…' : 'Calendario del grupo'}</p>
            <p className="text-gray-500 text-xs mt-1">Monta aquí las semanas y las sesiones del grupo.</p>
          </button>
          <button onClick={() => abrirPlan('dibujo')} disabled={!!abriendoPlan}
            className="bg-gray-900 border border-gray-800 hover:border-orange-500 rounded-xl p-5 text-left transition disabled:opacity-50">
            <p className="font-bold">{abriendoPlan === 'dibujo' ? 'Abriendo…' : 'Periodización visual'}</p>
            <p className="text-gray-500 text-xs mt-1">Macrociclo y mesociclos, dibujados.</p>
          </button>
        </section>

        {/* Aquí es donde importa de verdad: la zona es la misma para todos, pero sin
            tests esa persona no ve ritmo ni vatios, solo el porcentaje teórico. En un
            grupo pasa casi seguro, y hoy no hay ninguna pantalla que lo diga. */}
        {sinTests.length > 0 && (
          <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl px-4 py-3">
            <p className="text-amber-300 text-sm font-medium">
              {sinTests.length === 1
                ? sinTests[0].nombre + ' no tiene ningún test'
                : sinTests.length + ' del grupo no tienen ningún test'}
            </p>
            <p className="text-amber-200/70 text-xs mt-1">
              Recibirán el entrenamiento igual, pero verán la zona sin ritmo ni vatios: sin VAM, FTP o CSS no hay
              con qué calcularlos.
            </p>
          </div>
        )}

        <section>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Quién entrena aquí</h3>
            {fuera.length > 0 && (
              <button onClick={() => setAnadiendo(!anadiendo)}
                className="text-gray-400 hover:text-orange-400 text-xs underline transition">
                {anadiendo ? 'Cerrar' : '+ Añadir alguien'}
              </button>
            )}
          </div>

          {anadiendo && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-3 flex flex-col gap-1.5">
              {fuera.map(d => (
                <button key={d.id} onClick={() => anadir(d.id)} disabled={ocupado}
                  className="text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition text-sm disabled:opacity-40">
                  {d.nombre}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-2">
            {miembros.map(m => {
              const faltan = testsQueFaltan(tests[String(m.id_deportista)])
              return (
                <div key={m.id_deportista} className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.nombre}</p>
                    <p className="text-xs mt-0.5">
                      {faltan.length === 0
                        ? <span className="text-green-500">Tests al día</span>
                        : <span className="text-amber-400">Le falta {faltan.join(', ')}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-none">
                    <button onClick={() => traerFuturas(m)} disabled={ocupado}
                      title="Copiarle lo que el grupo tiene planificado de hoy en adelante y él no tenga"
                      className="text-gray-500 hover:text-orange-400 text-xs underline transition disabled:opacity-40">Traer futuras</button>
                    <button onClick={() => router.push('/deportistas/' + m.id_deportista)}
                      className="text-gray-500 hover:text-white text-xs underline transition">Ver ficha</button>
                    <button onClick={() => sacar(m)} disabled={ocupado}
                      className="text-gray-600 hover:text-red-400 text-xs underline transition disabled:opacity-40">Sacar</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* CUMPLIMIENTO. Lo que le faltaba al panel: mandas ocho entrenamientos y
            hasta ahora no había dónde ver qué ha pasado con ellos. */}
        {cump && cump.columnas.length > 0 && (
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
              <div>
                <p className="font-medium">Quién lo está haciendo</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {cump.hechas} de {cump.mandadas} entrenamientos hechos
                  {porcentaje(cump) !== null && <> · <span className="text-white">{porcentaje(cump)}%</span></>}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="date" value={cDesde} onChange={e => recargarCumplimiento(e.target.value, cHasta)}
                  className="bg-gray-800 text-white px-2 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500" />
                <span className="text-gray-600 text-xs">a</span>
                <input type="date" value={cHasta} onChange={e => recargarCumplimiento(cDesde, e.target.value)}
                  className="bg-gray-800 text-white px-2 py-1.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[11px] border-b border-gray-800">
                    <th className="text-left font-medium py-2 pr-3 sticky left-0 bg-gray-900">Deportista</th>
                    {cump.columnas.map(c => (
                      <th key={c.clave} className="font-medium py-2 px-1.5 whitespace-nowrap tabular-nums" title={c.disciplina}>
                        {c.fecha.slice(8)}/{c.fecha.slice(5, 7)}
                        <span className="block text-[9px] text-gray-600 uppercase">{c.disciplina.slice(0, 3)}</span>
                      </th>
                    ))}
                    <th className="font-medium py-2 pl-3 text-right whitespace-nowrap">Hechas</th>
                  </tr>
                </thead>
                <tbody>
                  {cump.filas.map(f => {
                    const pct = porcentaje(f)
                    return (
                      <tr key={f.id_deportista} className="border-b border-gray-800/60">
                        <td className="py-2 pr-3 whitespace-nowrap sticky left-0 bg-gray-900">{f.nombre}</td>
                        {cump.columnas.map(c => {
                          const e = f.porColumna[c.clave]
                          return (
                            <td key={c.clave} className="py-2 px-1.5 text-center">
                              {e === 'Realizada' ? <span className="text-green-500" title="Hecha">✓</span>
                                : e === 'Cancelada' ? <span className="text-red-400" title="Cancelada">✕</span>
                                : e === 'Planificada' ? <span className="text-gray-600" title="Sin hacer">·</span>
                                // Sin sesión: no se la mandaron (entró al grupo después).
                                : <span className="text-gray-800" title="No se le mandó">—</span>}
                            </td>
                          )
                        })}
                        <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
                          <span className={pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}>
                            {f.hechas}/{f.mandadas}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-gray-600 text-[11px] mt-3">
              <span className="text-green-500">✓</span> hecha · <span className="text-gray-500">·</span> sin hacer ·
              <span className="text-red-400"> ✕</span> cancelada · <span className="text-gray-700">—</span> no se le mandó
            </p>
          </section>
        )}

        {/* Volcar: lo que has planificado en el calendario del grupo baja a la gente.
            Hasta que se hace esto, el plan del grupo no está en el calendario de nadie. */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div>
              <p className="font-medium">Volcar el plan del grupo</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Copia lo planificado en el calendario del grupo al de cada miembro.
              </p>
            </div>
            <button onClick={() => { setVolcando(!volcando); setAVolcar(null); setPrevio(null); setParteVolcado(null) }}
              disabled={miembros.length === 0}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40">
              {volcando ? 'Cancelar' : 'Elegir fechas'}
            </button>
          </div>

          {volcando && (
            <div className="flex flex-col gap-4 mt-5 pt-5 border-t border-gray-800">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Desde</span>
                  <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setAVolcar(null); setPrevio(null) }}
                    className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Hasta</span>
                  <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setAVolcar(null); setPrevio(null) }}
                    className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </label>
              </div>

              {aVolcar === null ? (
                <button onClick={mirarQueHay} disabled={ocupado}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {ocupado ? 'Mirando...' : 'Ver qué hay en esas fechas'}
                </button>
              ) : aVolcar.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-2">
                  No hay nada planificado ahí. Móntalo primero en el calendario del grupo.
                </p>
              ) : (
                <>
                  <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3.5 py-3">
                    <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-1.5">
                      {aVolcar.length} {aVolcar.length === 1 ? 'sesión' : 'sesiones'} × {miembros.length} = {aVolcar.length * miembros.length} en total
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {aVolcar.map(s => (
                        <span key={s.id} className="text-sm text-gray-300">
                          <span className="text-gray-500 tabular-nums">{s.fecha_sesion.slice(8)}/{s.fecha_sesion.slice(5, 7)}</span>
                          {' · '}{s.disciplina}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Ya se volcó antes en estas fechas. Se avisa y se deja elegir, en
                      vez de duplicar en silencio o decidir por el entrenador. */}
                  {previo && (previo.planificadas.length > 0 || previo.realizadas > 0) && (
                    <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg px-4 py-3 flex flex-col gap-2.5">
                      <p className="text-amber-300 text-sm font-medium">
                        Estas fechas ya se volcaron
                      </p>
                      <p className="text-amber-200/70 text-xs">
                        Hay {previo.planificadas.length + previo.realizadas} sesiones de este grupo en {previo.personas}
                        {previo.personas === 1 ? ' persona' : ' personas'}
                        {previo.realizadas > 0 && <> · <span className="text-amber-100">{previo.realizadas} ya {previo.realizadas === 1 ? 'entrenada' : 'entrenadas'}</span></>}.
                      </p>
                      {previo.planificadas.length > 0 && (
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={reemplazar} onChange={e => setReemplazar(e.target.checked)}
                            className="accent-orange-500 w-4 h-4 mt-0.5" />
                          <span className="text-xs text-amber-200/90">
                            Quitar antes las {previo.planificadas.length} que siguen planificadas
                            <span className="block text-amber-200/50 mt-0.5">
                              Van a la papelera, no se borran. Si lo dejas sin marcar, se sumarán a las que ya hay.
                            </span>
                          </span>
                        </label>
                      )}
                      {previo.realizadas > 0 && (
                        <p className="text-amber-200/50 text-[11px]">
                          Las {previo.realizadas} ya {previo.realizadas === 1 ? 'entrenada' : 'entrenadas'} no se tocan: reescribir algo que alguien ya hizo
                          sería falsear su historial.
                        </p>
                      )}
                    </div>
                  )}
                  <button onClick={hacerVolcado} disabled={ocupado}
                    className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                    {ocupado ? 'Volcando...' : 'Volcar a ' + miembros.length + (miembros.length === 1 ? ' deportista' : ' deportistas')}
                  </button>
                </>
              )}
            </div>
          )}

          {parteVolcado && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-sm font-medium mb-2">{resumenVolcado(parteVolcado)}</p>
              <div className="flex flex-col gap-1">
                {parteVolcado.map(r => (
                  <div key={r.id_deportista} className="flex items-center gap-2 text-xs">
                    <span className={r.fallos === 0 && r.creadas > 0 ? 'text-green-500' : r.creadas > 0 ? 'text-amber-400' : 'text-red-400'}>
                      {r.fallos === 0 && r.creadas > 0 ? '✓' : r.creadas > 0 ? '!' : '✕'}
                    </span>
                    <span className="text-gray-300">{r.nombre}</span>
                    <span className="text-gray-600">· {r.creadas} creadas{r.fallos ? ', ' + r.fallos + ' fallidas' : ''}</span>
                    {r.creadas > r.enSuPlan && <span className="text-gray-600">· {r.creadas - r.enSuPlan} sin semana planificada</span>}
                    {r.error && <span className="text-red-400/80">· {r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div>
              <p className="font-medium">Mandar un entrenamiento suelto</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Cae en el calendario de {miembros.length === 1 ? 'la persona del grupo' : 'los ' + miembros.length}.
                Se manda la ZONA, así que cada uno verá su ritmo.
              </p>
            </div>
            <button onClick={() => { setMandando(!mandando); setParte(null) }} disabled={miembros.length === 0}
              className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40">
              {mandando ? 'Cancelar' : 'Preparar'}
            </button>
          </div>

          {mandando && (
            <div className="flex flex-col gap-4 mt-5 pt-5 border-t border-gray-800">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Qué día</span>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                    className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-400 text-xs">Deporte</span>
                  <select value={disciplina} onChange={e => setDisciplina(e.target.value)}
                    className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                    {DISCIPLINAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-gray-400 text-xs">Qué entrenamiento</span>
                <select value={elegida} onChange={e => setElegida(e.target.value)}
                  className="bg-gray-800 text-white px-3 py-2.5 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Sesión en blanco (la rellenas luego en cada uno)</option>
                  {propias.length > 0 && (
                    <optgroup label="Tus plantillas">
                      {propias.map(p => <option key={p.id} value={'mia:' + p.id}>{p.nombre}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Del sistema">
                    {delSistema.flatMap(p => opcionesDe(p).map(o => (
                      <option key={o.clave} value={'sis:' + o.clave}>
                        {p.zona} · {o.esBase ? p.nombre : p.nombre + ' · ' + o.nombre}
                      </option>
                    )))}
                  </optgroup>
                </select>
              </label>

              {/* El nivel solo pinta en las del sistema: las tuyas ya tienen su volumen. */}
              {elegida.startsWith('sis:') && (
                <div className="flex gap-1.5">
                  {NIVELES.map(n => (
                    <button key={n.id} onClick={() => setNivel(n.id)}
                      className={'flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition ' +
                        (nivel === n.id
                          ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600')}>
                      {n.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Lo que se va a mandar, antes de mandarlo: son ocho calendarios. */}
              {(() => {
                const sis = elegida.startsWith('sis:') ? delSistemaPorClave(elegida.slice(4)) : null
                const mia = elegida.startsWith('mia:') ? propias.find(x => String(x.id) === elegida.slice(4)) : null
                const bloques = sis ? sis.bloques : mia ? mia.bloques : []
                if (!bloques.length) return null
                return (
                  <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3.5 py-3">
                    <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-1.5">Lo que van a recibir</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {bloques.map((b: any, i: number) => (
                        <span key={i} className="text-sm">
                          <span className="text-orange-400 font-medium">{b.zona}</span>
                          <span className="text-gray-400"> {textoBloque(b)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <button onClick={mandar} disabled={ocupado}
                className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
                {ocupado ? 'Mandando...' : 'Mandar a ' + miembros.length + (miembros.length === 1 ? ' deportista' : ' deportistas')}
              </button>
            </div>
          )}

          {/* El parte, uno a uno. Con ocho personas, "hecho" no basta: hay que poder
              ver a quién NO le llegó y por qué. */}
          {parte && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-sm font-medium mb-2">{resumenEmision(parte)}</p>
              <div className="flex flex-col gap-1">
                {parte.map(r => (
                  <div key={r.id_deportista} className="flex items-center gap-2 text-xs">
                    <span className={r.ok ? 'text-green-500' : 'text-red-400'}>{r.ok ? '✓' : '✕'}</span>
                    <span className="text-gray-300">{r.nombre}</span>
                    {r.ok && !r.enSuPlan && <span className="text-gray-600">· sin semana planificada, entra como sesión libre</span>}
                    {!r.ok && <span className="text-red-400/80">· {r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
