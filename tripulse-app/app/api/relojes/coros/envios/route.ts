// Mandar entrenos al COROS de un deportista, desde su ENTRENADOR.
//
//   { accion: 'estado', idDeportista, desde, hasta, conCoros? }
//     Cómo está cada sesión de esas fechas frente a su COROS (va, ya está, se
//     reemplaza, movida, no va…), con el entreno que le llegaría, y lo que
//     sigue en su COROS en días que ya no son los de su sesión. Sin `conCoros`
//     solo lee la base (el calendario lo pide así, para todo el trimestre).
//     Con `conCoros` (la ventana, para una semana) lee además SU CALENDARIO DE
//     COROS: recupera el número de lo que se quedó con el provisional, quita
//     de «sigue en su COROS» lo que ya ha borrado allí, y dice qué tiene ese
//     día que no mandó su entrenador (un plan de COROS, por ejemplo).
//   { accion: 'mandar', idDeportista, sesiones: [id…] }
//     Las pone en su calendario de COROS (o reemplaza las que cambiaron) y lo
//     apunta en reloj_envio.
//   { accion: 'olvidar', idDeportista, idEnvio }
//     «Ya no está en su COROS»: quita esa fila de lo que sigue allí.
//
// QUIÉN: solo su entrenador (deportista.id_entrenador). El token del
// deportista lo da la base solo con la llave del servidor
// (RELOJ_LLAVE_SERVIDOR), así que no sale nunca de aquí.
//
// Lo que se manda lo decide lib/coros-envio a partir de la sesión guardada,
// nunca de lo que mande el navegador.

import { json, quienLlama, ESPERA_MS } from '@/lib/relojes-servidor'
import { emisorCoros, hayQueRenovar, leerRenovacionCoros, motivoDeErrorCoros } from '@/lib/coros'
import { clienteMcpCoros } from '@/lib/coros-mcp'
import {
  entrenosDeSesion, estadoEnCoros, siguenEnSuCoros, fechaCoros, idEnPlanDe, esIdProvisional,
  esCalendarioCoros, leerCalendarioCoros, ajenosDelDia, idDeCalendario,
  ID_PROVISIONAL, MANDABLE, DIAS_POR_DELANTE_COROS,
  type EnvioCoros, type EntrenoCoros, type EstadoCoros, type ContextoCoros, type TareaParaCoros,
  type EntradaCalendarioCoros,
} from '@/lib/coros-envio'
import { cargarReferencias } from '@/lib/referencia-zona'
import { cargarTestsDeTareas } from '@/lib/objetivo-tarea'
import { vivas } from '@/lib/papelera'
import { hoyISO, sumarDias } from '@/lib/fechas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/* Una llamada a COROS por entreno, una detrás de otra. */
export const maxDuration = 60

const MAX_SESIONES = 30

interface FilaSesion {
  id: number
  fecha_sesion: string
  disciplina: string | null
  estado: string | null
  notas_entrenador: string | null
  tarea: TareaParaCoros[] | null
}
interface FilaToken {
  id_externo: string | null; access_token: string | null; refresh_token: string | null
  extra: { cliente?: string; emisor?: string } | null; caduca_en: string | null
}

const esFecha = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)

/** Lo que se le enseña del estado: sin las filas internas. */
function resumen(e: EstadoCoros) {
  if ('motivo' in e) return { k: e.k, motivo: e.motivo }
  if (e.k === 'movida') return { k: e.k, de: e.viejos.map(v => v.fecha) }
  if (e.k === 'ya' || e.k === 'cambia') return { k: e.k, enviadoEn: e.envios.map(v => v.enviado_en).sort().pop() ?? null }
  return { k: e.k }
}

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const accion = cuerpo?.accion
  const idDep = Number(cuerpo?.idDeportista)
  if (!Number.isInteger(idDep) || idDep <= 0) return json({ error: 'Falta el deportista.' }, 400)

  /* Solo su entrenador. El director ve sus sesiones, pero mandar a su reloj no entra. */
  const { data: dep } = await q.sb.from('deportista').select('id, id_entrenador').eq('id', idDep).maybeSingle()
  if (!dep) return json({ error: 'No se encuentra ese deportista.' }, 404)
  if (dep.id_entrenador !== q.uid) return json({ error: 'Solo su entrenador puede mandarle entrenos al reloj.' }, 403)

  const { data: con } = await q.sb.from('reloj_conexion').select('ultima_sincronizacion')
    .eq('id_deportista', idDep).eq('proveedor', 'coros').maybeSingle()
  if (!con) return json({ error: 'No tiene COROS conectado.' }, 409)

  const hoy = hoyISO()

  // ---- Olvidar lo que ya no está en su COROS ----
  if (accion === 'olvidar') {
    const idEnvio = Number(cuerpo?.idEnvio)
    if (!Number.isInteger(idEnvio) || idEnvio <= 0) return json({ error: 'Falta cuál.' }, 400)
    const { error } = await q.sb.from('reloj_envio').delete().eq('id', idEnvio).eq('id_deportista', idDep)
    if (error) return json({ error: 'No se ha podido quitar: ' + error.message }, 500)
    return json({ ok: true })
  }

  // ---- Hablar con su COROS (solo cuando hace falta) ----
  /** Su token, renovado si toca, y el MCP abierto. O la frase de por qué no. */
  const abrirCoros = async (): Promise<{ mcp: ReturnType<typeof clienteMcpCoros> } | { error: string; status: number }> => {
    const llave = process.env.RELOJ_LLAVE_SERVIDOR
    if (!llave) return { error: 'Falta configurar la llave del servidor (RELOJ_LLAVE_SERVIDOR): sin ella no se puede usar su conexión.', status: 500 }
    const { data: filasTok, error: eTok } = await q.sb.rpc('reloj_token_de', { p_llave: llave, p_deportista: idDep, p_proveedor: 'coros' })
    const t = Array.isArray(filasTok) ? (filasTok[0] as FilaToken | undefined) : undefined
    if (eTok || !t?.access_token) return { error: 'No se ha podido usar su conexión de COROS.', status: 409 }

    const emisor = emisorCoros(t.extra?.emisor)
    let access = t.access_token
    if (hayQueRenovar(t.caduca_en)) {
      const caducada = 'Su conexión con COROS ha caducado: que la vuelva a conectar en su perfil.'
      if (!t.refresh_token || !t.extra?.cliente) return { error: caducada, status: 409 }
      try {
        const r = await fetch(emisor + '/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: t.extra.cliente, refresh_token: t.refresh_token }),
          signal: AbortSignal.timeout(ESPERA_MS),
          cache: 'no-store',
        })
        const nuevo = r.ok ? leerRenovacionCoros(await r.json().catch(() => null), t.refresh_token) : null
        if (!nuevo) return { error: caducada, status: 409 }
        const { error } = await q.sb.rpc('reloj_renovar_de', {
          p_llave: llave, p_deportista: idDep, p_proveedor: 'coros',
          p_access_token: nuevo.accessToken, p_refresh_token: nuevo.refreshToken, p_caduca_en: nuevo.caducaEn,
        })
        if (error) return { error: 'No se ha podido guardar su conexión renovada con COROS.', status: 500 }
        access = nuevo.accessToken
      } catch {
        return { error: 'No se ha podido hablar con COROS. Prueba más tarde.', status: 502 }
      }
    }
    const mcp = clienteMcpCoros(emisor, access)
    try {
      const fallo = await mcp.abrir()
      if (fallo) return { error: motivoDeErrorCoros(fallo), status: 502 }
    } catch {
      return { error: 'No se ha podido hablar con COROS. Prueba más tarde.', status: 502 }
    }
    return { mcp }
  }

  /** Su calendario de COROS de esas fechas, leído. null si no se ha podido (y no se concluye nada). */
  const leerCalendario = async (mcp: ReturnType<typeof clienteMcpCoros>, de: string, a: string): Promise<EntradaCalendarioCoros[] | null> => {
    try {
      const r = await mcp.herramienta('queryTrainingSchedule', { startDate: fechaCoros(de), endDate: fechaCoros(a) })
      return r.texto && esCalendarioCoros(r.texto) ? leerCalendarioCoros(r.texto) : null
    } catch {
      return null
    }
  }

  // ---- Las sesiones ----
  let consulta = vivas(q.sb.from('sesion').select(
    'id, fecha_sesion, disciplina, estado, notas_entrenador, tarea(id, orden, disciplina, zona_entrenamiento, series, descanso_segundos, bloques, descanso_bloques_segundos, comentario, zona_copia, formato, p_distancia(metros_planeados, ritmo_objetivo), p_duracion(tiempo_planeado, ritmo_objetivo))',
  ).eq('id_deportista', idDep))
  let desde = hoy, hasta = sumarDias(hoy, DIAS_POR_DELANTE_COROS)
  if (accion === 'estado') {
    if (esFecha(cuerpo?.desde) && cuerpo.desde > desde) desde = cuerpo.desde
    if (esFecha(cuerpo?.hasta) && cuerpo.hasta < hasta) hasta = cuerpo.hasta
    if (hasta < desde) return json({ hoy, sesiones: [], siguen: [], ultimaSincronizacion: con.ultima_sincronizacion })
    consulta = consulta.gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
  } else if (accion === 'mandar') {
    const lista = Array.isArray(cuerpo?.sesiones) ? cuerpo.sesiones : []
    const ids = [...new Set(lista.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    if (!ids.length) return json({ error: 'No hay ninguna sesión que mandar.' }, 400)
    if (ids.length > MAX_SESIONES) return json({ error: 'De una vez se pueden mandar ' + MAX_SESIONES + ' sesiones como mucho.' }, 400)
    consulta = consulta.in('id', ids)
  } else {
    return json({ error: 'No sé qué hacer con eso.' }, 400)
  }
  const { data: dataSes, error: eSes } = await consulta.order('fecha_sesion')
  if (eSes) return json({ error: 'No se han podido leer sus sesiones: ' + eSes.message }, 500)
  const sesiones = (dataSes || []) as FilaSesion[]

  const todasLasTareas = sesiones.flatMap(s => s.tarea || [])
  const [refs, propios, envQ] = await Promise.all([
    cargarReferencias(q.sb, idDep),
    cargarTestsDeTareas(q.sb, idDep, todasLasTareas),
    q.sb.from('reloj_envio').select('id, id_sesion, parte, fecha, id_externo, huella, nombre, enviado_en')
      .eq('id_deportista', idDep).eq('proveedor', 'coros').gte('fecha', hoy),
  ])
  if (envQ.error) return json({ error: 'No se ha podido leer lo que ya se mandó: ' + envQ.error.message }, 500)
  const ctx: ContextoCoros = { tests: refs.tests, propios, fcMax: refs.fcMax, fcReposo: refs.fcReposo }
  let envios = (envQ.data || []) as EnvioCoros[]

  /**
   * Lo que dice su calendario de COROS sobre lo apuntado: el número de lo que se
   * quedó con el provisional y, en días por venir, lo que ya ha borrado allí.
   */
  const conciliar = async (calendario: EntradaCalendarioCoros[], de: string, a: string) => {
    const enRango = (e: EnvioCoros) => e.fecha >= de && e.fecha <= a
    const usados = envios.filter(e => !esIdProvisional(e.id_externo)).map(e => e.id_externo)
    for (const e of envios.filter(x => enRango(x) && esIdProvisional(x.id_externo))) {
      const id = idDeCalendario(calendario, e, usados)
      if (!id) continue
      const { error } = await q.sb.from('reloj_envio').update({ id_externo: id, enviado_por: q.uid }).eq('id', e.id)
      if (!error) { e.id_externo = id; usados.push(id) }
    }
    /* Solo días que aún no han llegado: lo de hoy o ya pasado puede salir del
       calendario por estar hecho, no por estar borrado. */
    const borradas = envios.filter(e => enRango(e) && e.fecha > hoy && !esIdProvisional(e.id_externo)
      && !calendario.some(c => c.fecha === e.fecha && c.idInPlan === e.id_externo))
    for (const e of borradas) await q.sb.from('reloj_envio').delete().eq('id', e.id)
    envios = envios.filter(e => !borradas.includes(e))
  }

  const calcular = (s: FilaSesion) => {
    const tareas = s.tarea || []
    const entrenos = entrenosDeSesion(s, tareas, ctx)
    const estado = estadoEnCoros(s, tareas, entrenos, envios.filter(e => e.id_sesion === s.id), hoy)
    return { s, entrenos, estado }
  }

  // ---- El estado ----
  if (accion === 'estado') {
    let calendario: EntradaCalendarioCoros[] | null = null
    let avisoCoros: string | null = null
    if (cuerpo?.conCoros === true) {
      const c = await abrirCoros()
      if ('error' in c) avisoCoros = 'No se ha podido leer su calendario de COROS: ' + c.error
      else {
        calendario = await leerCalendario(c.mcp, desde, hasta)
        if (calendario) await conciliar(calendario, desde, hasta)
        else avisoCoros = 'No se ha podido leer su calendario de COROS: no se sabe qué tiene ya esos días.'
      }
    }

    const filas = sesiones.map(calcular)
    /* Para saber si lo mandado sigue siendo de su día hace falta la fecha de
       sesiones que quizá caen fuera del rango, o que se borraron. */
    const fechas: Record<number, string> = {}
    for (const s of sesiones) fechas[s.id] = s.fecha_sesion
    const fuera = [...new Set(envios.map(e => e.id_sesion).filter((x): x is number => x != null && !(x in fechas)))]
    if (fuera.length) {
      const { data: otras } = await vivas(q.sb.from('sesion').select('id, fecha_sesion').in('id', fuera))
      for (const o of (otras || []) as { id: number; fecha_sesion: string }[]) fechas[o.id] = o.fecha_sesion
    }
    const siguen = siguenEnSuCoros(envios.filter(e => e.fecha >= desde && e.fecha <= hasta), id => fechas[id] ?? null)
    return json({
      hoy,
      ultimaSincronizacion: con.ultima_sincronizacion,
      avisoCoros,
      sesiones: filas.map(f => {
        const fecha = String(f.s.fecha_sesion).slice(0, 10)
        return {
          id: f.s.id, fecha, disciplina: f.s.disciplina,
          estado: resumen(f.estado),
          entrenos: f.entrenos.map(e => ({ parte: e.parte, curso: e.curso })),
          ...(calendario ? { ajenos: ajenosDelDia(calendario, fecha, envios).map(c => ({ nombre: c.nombre, dePlan: c.dePlan })) } : {}),
        }
      }),
      siguen: siguen.map(e => ({ id: e.id, fecha: e.fecha, nombre: e.nombre, idSesion: e.id_sesion })),
    })
  }

  // ---- Mandar ----
  const abierto = await abrirCoros()
  if ('error' in abierto) return json({ error: abierto.error }, abierto.status)
  const { mcp } = abierto

  /* Antes de nada, el número de lo que se quedó con el provisional en esos días:
     así se reemplaza en vez de mandar otro igual. */
  const fechasSel = sesiones.map(s => String(s.fecha_sesion).slice(0, 10)).sort()
  if (fechasSel.length && envios.some(e => esIdProvisional(e.id_externo) && e.fecha >= fechasSel[0] && e.fecha <= fechasSel[fechasSel.length - 1])) {
    const cal = await leerCalendario(mcp, fechasSel[0], fechasSel[fechasSel.length - 1])
    if (cal) await conciliar(cal, fechasSel[0], fechasSel[fechasSel.length - 1])
  }

  interface Parte { parte: number; ok: boolean; error?: string; sinId?: boolean; texto?: string | null }
  const resultados: { id: number; ok: boolean; motivo?: string; partes: Parte[] }[] = []
  const ahora = () => new Date().toISOString()
  const usados = envios.filter(e => !esIdProvisional(e.id_externo)).map(e => e.id_externo)

  for (const f of sesiones.map(calcular)) {
    if (!MANDABLE.includes(f.estado.k)) {
      resultados.push({ id: f.s.id, ok: false, motivo: 'motivo' in f.estado ? f.estado.motivo : 'Ya está en su COROS, sin cambios.', partes: [] })
      continue
    }
    const fecha = String(f.s.fecha_sesion).slice(0, 10)
    const deEseDia = envios.filter(e => e.id_sesion === f.s.id && e.fecha === fecha)
    const partes: Parte[] = []

    for (const en of f.entrenos as EntrenoCoros[]) {
      const previo = deEseDia.find(e => e.parte === en.parte)
      if (previo && previo.huella === en.huella) { partes.push({ parte: en.parte, ok: true }); continue }

      try {
        if (previo && !esIdProvisional(previo.id_externo)) {
          /* Ya está ese día: se reemplaza entero (COROS no deja moverlo). */
          const r = await mcp.herramienta('updateScheduledWorkout', { date: fechaCoros(fecha), idInPlan: previo.id_externo, course: en.curso })
          if (!r.ok) { partes.push({ parte: en.parte, ok: false, error: r.error || undefined, texto: r.texto }); continue }
          const { error } = await q.sb.from('reloj_envio').update({
            huella: en.huella, nombre: en.curso.courseName, id_externo: idEnPlanDe(r.texto) || previo.id_externo,
            enviado_en: ahora(), enviado_por: q.uid,
          }).eq('id', previo.id)
          partes.push({ parte: en.parte, ok: true, texto: r.texto, ...(error ? { error: 'Reemplazada en su COROS, pero no se ha podido apuntar: ' + error.message } : {}) })
          continue
        }
        if (previo) {
          /* Sin su número de COROS no se puede reemplazar: va otra, y la de
             antes queda como «sigue en su COROS» para que la borre. */
          await q.sb.from('reloj_envio').update({ id_sesion: null, enviado_por: q.uid }).eq('id', previo.id)
        }
        const r = await mcp.herramienta('createScheduledWorkout', { date: fechaCoros(fecha), course: en.curso })
        let idCoros = idEnPlanDe(r.texto)
        /* Si COROS da su número, se ha puesto aunque el texto parezca un aviso. */
        if (!r.ok && !idCoros) { partes.push({ parte: en.parte, ok: false, error: r.error || undefined, texto: r.texto }); continue }
        if (!idCoros) {
          /* Sin número en la respuesta: se busca en su calendario de ese día, por el nombre. */
          const cal = await leerCalendario(mcp, fecha, fecha)
          if (cal) idCoros = idDeCalendario(cal, { fecha, nombre: en.curso.courseName }, usados)
        }
        if (idCoros) usados.push(idCoros)
        const { error } = await q.sb.from('reloj_envio').insert({
          id_deportista: idDep, proveedor: 'coros', id_sesion: f.s.id, parte: en.parte, fecha,
          id_externo: idCoros || ID_PROVISIONAL + f.s.id + ':' + en.parte + ':' + Date.now(),
          huella: en.huella, nombre: en.curso.courseName, enviado_por: q.uid,
        })
        partes.push({
          parte: en.parte, ok: true, sinId: !idCoros, texto: r.texto,
          ...(error ? { error: 'Puesta en su COROS, pero no se ha podido apuntar: ' + error.message } : {}),
        })
      } catch (e) {
        const agotado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
        partes.push({ parte: en.parte, ok: false, error: agotado ? 'COROS ha tardado demasiado en contestar.' : 'No se ha podido hablar con COROS.' })
      }
    }
    resultados.push({ id: f.s.id, ok: partes.length > 0 && partes.every(p => p.ok && !p.error), partes })
  }

  return json({ resultados })
}
