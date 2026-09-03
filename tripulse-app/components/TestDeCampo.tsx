'use client'
// ============================================================
// Un test de la batería, a un solo deportista
// ============================================================
// El bloque que va DENTRO de la ficha de un atleta, debajo de sus tests de
// siempre: eliges cuál de la batería, metes lo que mides y el número sale
// mientras escribes.
//
// POR QUÉ AQUÍ Y NO SOLO EN /tests/dirigir. Son dos momentos distintos y los
// dos existen. A pie de pista, con el grupo delante, vas a /tests/dirigir y los
// pasas a todos. Pero cuando estás mirando la ficha de UNA persona —repasando
// su evolución, decidiendo qué le falta— y quieres apuntarle el salto que hizo
// ayer, no tiene sentido salir a otra pantalla y volver a buscarla.
//
// LO QUE NO SE DUPLICA. Este componente NO sabe calcular ni sabe escribir: pide
// las dos cosas a `catalogo-tests` y `dirigir-tests`, que son los mismos que usa
// la pantalla de grupo. Un test metido aquí y el mismo metido allí dejan
// exactamente las mismas filas.
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'
import {
  CATALOGO, protocoloInicial, camposDeProtocolo, camposPorPersona,
  resultadosDe, principalDe, estaCompleto, avisosDeTesteo, enBanda,
  type Disciplina, type Valores, type Contexto, type CampoBruto, type TestCampo,
} from '@/lib/catalogo-tests'
import { herramientasDe, camposQueRellena, etiquetaDe } from '@/lib/herramientas-test'
import InstrumentosTest from './InstrumentosTest'
import { guardarTestsDeCampo, testsDeHoy, diasHastaCarreraA } from '@/lib/dirigir-tests'
import { propuestaDe, fijarZonas } from '@/lib/zonas-desde-test'

/* Tailwind v4 no ve las clases que se construyen juntando trozos, así que los
   estados de la banda van escritos enteros. */
const BANDA = {
  dentro: 'text-green-400',
  fuera: 'text-amber-400',
  sin: 'text-gray-600',
}

function Casilla({ campo, valor, onChange, rellenada }: {
  campo: CampoBruto
  valor: string
  onChange: (v: string) => void
  /** La ha puesto un instrumento, no el dedo. */
  rellenada?: boolean
}) {
  const cls = 'text-white px-4 py-3 rounded-lg outline-none w-full border transition ' +
    (rellenada
      ? 'bg-orange-500/10 border-orange-500/50 focus:ring-2 focus:ring-orange-500'
      : 'bg-gray-800 border-transparent focus:ring-2 focus:ring-orange-500')

  const dentro = campo.banda ? enBanda(campo, valor === '' ? null : Number(valor)) : null

  return (
    <label className="flex flex-col gap-1">
      <span className="text-gray-400 text-sm">
        {campo.etiqueta}
        {campo.sufijo && <span className="text-gray-600"> ({campo.sufijo})</span>}
      </span>
      {campo.opciones ? (
        <select value={valor} onChange={e => onChange(e.target.value)} className={cls}>
          {campo.opciones.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      ) : (
        <input type="number" step="any" inputMode="decimal" value={valor}
          onChange={e => onChange(e.target.value)} className={cls} />
      )}
      {/* La referencia va DEBAJO de la casilla y se enciende sola. Es lo que
          convierte «242 ms» en «242 ms, y lo de élite son 200-250»: antes había
          que ir al PDF a mirarlo. */}
      {campo.banda && (
        <span className={'text-xs flex items-center gap-1.5 ' +
          (dentro === true ? BANDA.dentro : dentro === false ? BANDA.fuera : BANDA.sin)}>
          <span className={'inline-block w-1.5 h-1.5 rounded-full ' +
            (dentro === true ? 'bg-green-400' : dentro === false ? 'bg-amber-400' : 'bg-gray-600')} />
          {campo.banda.texto}
        </span>
      )}
      {campo.ayuda && <span className="text-gray-600 text-xs">{campo.ayuda}</span>}
    </label>
  )
}

export default function TestDeCampo({ idDeportista, disciplina, contexto, clave, onGuardado }: {
  idDeportista: number
  disciplina: Disciplina
  contexto: Contexto
  /**
   * Cuál enseñar. Lo elige la página, no este componente.
   *
   * Antes esto era un acordeón con su propio selector dentro, y quedaba
   * plegado al fondo de la pestaña: había que saber que estaba ahí y abrirlo.
   * Ahora los tests se eligen arriba, junto a los clásicos, en una sola fila —
   * porque para el entrenador no son dos familias de tests, son sus tests.
   */
  clave: string
  /** Para que la ficha recargue su historial cuando esto escribe. */
  onGuardado?: () => void
}) {
  const delDeporte = CATALOGO.filter(t => t.disciplina === disciplina)
  const [fecha, setFecha] = useState(hoyISO())
  const [valores, setValores] = useState<Valores>({})
  const [notas, setNotas] = useState('')
  const [yaHoy, setYaHoy] = useState<TestCampo[]>([])
  const [diasA, setDiasA] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')

  const test = delDeporte.find(t => t.clave === clave) ?? null

  // Al cambiar de test se reinicia lo medido: las casillas no significan lo
  // mismo y arrastrar un «60» de un test a otro sería un dato falso con pinta
  // de bueno.
  useEffect(() => {
    if (test) setValores(protocoloInicial(test))
    setError(''); setHecho('')
  }, [clave])

  // Los avisos del §9 dependen del día y de a quién, así que se releen cuando
  // cambia cualquiera de los dos (y después de guardar, por `hecho`).
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const [h, d] = await Promise.all([
        testsDeHoy(supabase, [idDeportista], fecha),
        diasHastaCarreraA(supabase, [idDeportista], fecha),
      ])
      if (cancelado) return
      setYaHoy(h[idDeportista] ?? [])
      setDiasA(d[idDeportista] ?? null)
    })()
    return () => { cancelado = true }
  }, [idDeportista, fecha, clave, hecho])

  if (!test) return null

  const res = resultadosDe(test, valores, contexto)
  const princ = principalDe(test, valores, contexto)
  const otros = res.filter(r => r.salida !== princ?.salida)
  const completo = estaCompleto(test, valores, contexto)
  const avisos = avisosDeTesteo({ test, yaHoy, diasHastaCarreraA: diasA })

  // Los instrumentos los pinta y los maneja `InstrumentosTest`. Aquí solo se
  // consulta cuáles hay, para la etiqueta de la cabecera y para marcar en
  // naranja las casillas que rellena una máquina y no un dedo.
  const herramientas = herramientasDe(test.clave)
  const rellenaInstrumento = new Set(camposQueRellena(test.clave))

  /* Fijar las zonas es una acción APARTE de guardar el test, y a propósito.
     Guardar deja constancia de lo que hizo el atleta; fijar cambia los ritmos
     que va a entrenar las próximas semanas. Un test puede salir mal —venía
     tocado, la pista estaba mojada— y que eso reescriba sus zonas en silencio
     sería el peor fallo posible de esta pantalla. */
  const propuesta = propuestaDe(test, valores, contexto)

  const fijar = async () => {
    if (!propuesta) return
    setOcupado(true); setError(''); setHecho('')
    const r = await fijarZonas(supabase, idDeportista, fecha, propuesta, test.clave)
    if (r.error) setError(r.error)
    else {
      setHecho(
        propuesta.destino.nombre + ' actualizado a ' + propuesta.texto + '. Sus zonas de ' +
        disciplina.toLowerCase() + ' ya salen de aquí.' +
        (r.sinOrigen ? ' (No ha quedado apuntado de qué test salió: falta correr origen-del-ancla.sql.)' : ''))
      onGuardado?.()
    }
    setOcupado(false)
  }

  const guardar = async () => {
    setOcupado(true); setError(''); setHecho('')
    const r = await guardarTestsDeCampo(supabase, {
      test, fecha, protocolo: {}, notas,
      contextos: { [idDeportista]: contexto },
      personas: [{ id_deportista: idDeportista, nombre: '', valores }],
    })
    if (r.error) setError(r.error)
    else {
      const n = r.resultados[0]
      if (!n?.ok) setError('No se ha podido guardar.')
      else {
        setHecho(test.nombre + ' guardado · ' + n.filas + (n.filas === 1 ? ' dato' : ' datos'))
        setValores(protocoloInicial(test))
        setNotas('')
        onGuardado?.()
      }
    }
    setOcupado(false)
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 mb-6 overflow-hidden">
      <div className="px-6 py-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm"><span className="text-gray-500">Mide:</span> {test.mide}</p>
              <span className={'shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ' +
                (herramientas.length
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/25'
                  : 'bg-white/5 text-gray-500 border-gray-700')}>
                {etiquetaDe(test.clave)}
              </span>
            </div>
            <p className="text-gray-400 text-sm">{test.protocolo}</p>
            {test.cada && <p className="text-gray-600 text-xs">Cada cuánto: {test.cada}</p>}
          </div>

          {test.ojo && (
            <p className="text-amber-300/80 text-xs bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
              {test.ojo}
            </p>
          )}
          {avisos.map((a, i) => (
            <p key={i} className="text-amber-300/80 text-xs bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
              {a}
            </p>
          ))}

          {error && <div className="bg-red-950/60 border border-red-900 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}
          {hecho && <div className="bg-green-950/50 border border-green-900 text-green-300 rounded-lg px-4 py-3 text-sm">{hecho}</div>}

          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-sm">Fecha</span>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
          </label>

          {/* Los instrumentos van ARRIBA de las casillas: primero se dirige el
              test y después se mira lo que quedó escrito. */}
          <InstrumentosTest claveTest={test.clave} valores={valores}
            setCampo={(k, v) => setValores(x => ({ ...x, [k]: v }))} />

          {/* En la ficha de una persona el protocolo y lo suyo van seguidos: la
              división de arriba/abajo solo tiene sentido cuando son varios. */}
          {[...camposDeProtocolo(test), ...camposPorPersona(test)].map(c => (
            <Casilla key={c.clave} campo={c} valor={valores[c.clave] ?? ''}
              rellenada={rellenaInstrumento.has(c.clave) && !!valores[c.clave]}
              onChange={v => setValores(x => ({ ...x, [c.clave]: v }))} />
          ))}

          {/* Los números salen mientras escribes: un error de casilla se ve
              aquí, no dos semanas después en los ritmos del atleta. */}
          <div className="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-gray-400 text-sm">{princ?.salida.etiqueta}</span>
              <span className={'font-bold ' + (princ?.valor == null ? 'text-gray-600' : 'text-orange-400')}>
                {princ?.texto ?? '—'}
              </span>
            </div>
            {princ?.lectura && <p className="text-gray-400 text-xs">{princ.lectura}</p>}
            {otros.map(r => (
              <div key={r.salida.clave} className="flex flex-wrap items-baseline justify-between gap-2 pt-2 border-t border-gray-700/60">
                <span className="text-gray-500 text-xs">
                  {r.salida.etiqueta}
                  {r.salida.noGuardar && <span className="text-gray-600"> · no se guarda</span>}
                </span>
                <div className="text-right">
                  <span className={'text-sm ' + (r.valor == null ? 'text-gray-600' : 'text-white')}>{r.texto}</span>
                  {r.lectura && <span className="block text-gray-500 text-xs">{r.lectura}</span>}
                </div>
              </div>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-sm">Nota (opcional)</span>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Pista mojada, viento, venía tocado..."
              className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
          </label>

          <button onClick={guardar} disabled={ocupado || !completo}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 py-3 rounded-lg font-medium transition">
            {ocupado ? 'Guardando...' : completo ? 'Guardar test' : 'Rellena el resultado'}
          </button>

          {/* Este test mide lo mismo que el ancla de su disciplina, así que
              puede fijarla. Va en su propio recuadro y no junto al de guardar:
              son dos cosas distintas y confundirlas cambia los ritmos del
              atleta sin querer. */}
          {propuesta && (
            <div className="rounded-xl border border-blue-900/50 bg-blue-950/25 p-4 flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm text-gray-300">
                  Usar como su <span className="font-semibold text-blue-300">{propuesta.destino.nombre}</span>
                  {propuesta.aporte.estimado && <span className="text-gray-500"> (estimado)</span>}
                </span>
                <span className="text-blue-300 font-bold tabular-nums">{propuesta.texto}</span>
              </div>
              <p className="text-gray-400 text-xs leading-snug">{propuesta.aporte.porque}</p>
              <button onClick={fijar} disabled={ocupado}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
                {ocupado ? 'Guardando...' : 'Fijar sus zonas de ' + disciplina.toLowerCase()}
              </button>
              <p className="text-gray-500 text-[11px] leading-snug">
                Cambia los ritmos que va a entrenar. Guardar el test no hace esto solo.
              </p>
            </div>
          )}
          <p className="text-gray-600 text-xs">
            Queda en «Otros tests», a la derecha. Un test que da varios números deja uno por cada uno,
            para poder seguirlos por separado.
          </p>
      </div>
    </div>
  )
}
