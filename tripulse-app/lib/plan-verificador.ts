// ============================================================
// TRIPULSE — Juzgar una semana, venga de donde venga
// ============================================================
// Las reglas del planificador estaban escritas como GENERADOR. Este módulo las
// usa como JUEZ: coge una semana cualquiera —la que montaron las reglas, la que
// proponga un modelo, o una que el entrenador haya editado a mano— y dice qué
// incumple y de dónde sale cada regla.
//
// POR QUÉ ES LA PIEZA QUE LO CAMBIA TODO
// Mientras las reglas solo generaban, dejar que un modelo planificara era
// apostar: no había forma de saber si lo que devolvía valía. Con un juez, sí se
// puede — genera libre, se comprueba estricto, y si falla se le devuelven los
// incumplimientos para que lo arregle. Y si no lo arregla, se cae a la semana
// determinista, que es válida por construcción.
//
// El fallo de «96 minutos de potencia neuromuscular como sesión de calidad» que
// se colaba antes lo caza esto en una línea.
//
// ERRORES Y AVISOS NO SON LO MISMO
// Un ERROR hace la semana inválida: dos días duros seguidos no producen dos
// adaptaciones, y una sesión que no existe en el catálogo no se puede aplicar.
// Un AVISO es algo que un entrenador puede estar haciendo a propósito — la
// sesión larga en miércoles porque el atleta compite el domingo. Confundirlos
// convierte al juez en un cascarrabias al que se deja de escuchar.
import { DIAS, type DiaSemana, type DiaDisponible } from './plan-colocacion'
import { rangoDisciplina, LIMITES_SESIONES, ETIQUETA_BLOQUE, RESISTENCIA, type Bloque, type EntradaSemana, type FormaSemana } from './plan-semana'
import { resolverClave } from './plantillas'
import { plantillaFuerzaPorId } from './plantillas-fuerza'
import { cargaZona } from './zonas'
import { ETIQUETA_DISTANCIA } from './distribucion-zonas'
import type { Relleno } from './plan-relleno'

export type Gravedad = 'error' | 'aviso'

export interface Incumplimiento {
  regla: string
  gravedad: Gravedad
  texto: string
  fuente: string
  /** Índices de las sesiones implicadas, para poder señalarlas en pantalla. */
  sesiones?: number[]
}

export interface Veredicto {
  /** Sin errores. Puede tener avisos y seguir valiendo. */
  vale: boolean
  incumplimientos: Incumplimiento[]
  /** Compacto, para devolvérselo al modelo y que lo corrija. */
  paraElModelo: string
}

/** La forma mínima que hace falta para juzgar una sesión. */
export interface SesionAVerificar {
  dia: DiaSemana
  bloque: Bloque
  /** Clave del catálogo de resistencia. Vacía en fuerza. */
  clave: string
  claveFuerza?: string
  zona: string
  minutos: number
  calidad: boolean
  larga: boolean
  brick: boolean
}

export const deRelleno = (r: Relleno): SesionAVerificar => ({
  dia: r.dia, bloque: r.hueco.bloque, clave: r.clave, claveFuerza: r.claveFuerza,
  zona: r.zona, minutos: r.minutos,
  calidad: r.hueco.calidad, larga: r.hueco.larga, brick: r.hueco.brick,
})

export interface ContextoVerificacion {
  entrada: EntradaSemana
  /** Lo que las reglas habrían pedido. Sirve de vara para el volumen. */
  forma?: FormaSemana
  dias?: DiaDisponible[] | number
}

const FIN_DE_SEMANA: DiaSemana[] = ['Sábado', 'Domingo']
const idxDia = (d: DiaSemana) => DIAS.indexOf(d)
const nivelDe = (z: string) => cargaZona(z).nivel

export function verificarSemana(sesiones: SesionAVerificar[], ctx: ContextoVerificacion): Veredicto {
  const inc: Incumplimiento[] = []
  const mal = (regla: string, texto: string, fuente: string, sesiones?: number[]) =>
    inc.push({ regla, gravedad: 'error', texto, fuente, sesiones })
  const ojo = (regla: string, texto: string, fuente: string, sesiones?: number[]) =>
    inc.push({ regla, gravedad: 'aviso', texto, fuente, sesiones })

  if (!sesiones.length) {
    mal('vacia', 'La semana no tiene ninguna sesión.', 'sentido común')
    return { vale: false, incumplimientos: inc, paraElModelo: textoParaElModelo(inc) }
  }

  // ---- 1. Toda sesión tiene que existir de verdad ----
  // Es la barandilla que hace posible dejar generar a un modelo: si la clave no
  // resuelve, la app no sabría qué aplicar y la sesión llegaría vacía.
  sesiones.forEach((s, i) => {
    if (s.bloque === 'Fuerza') {
      if (!s.claveFuerza || !plantillaFuerzaPorId(s.claveFuerza)) {
        mal('sesion-inexistente', `La ${i} (fuerza) no apunta a ninguna plantilla del catálogo.`, 'catálogo de fuerza', [i])
      }
      return
    }
    const r = s.clave ? resolverClave(s.clave) : undefined
    if (!r) { mal('sesion-inexistente', `La ${i} usa «${s.clave}», que no existe en el catálogo.`, 'catálogo de plantillas', [i]); return }
    if (r.plantilla.disciplina !== s.bloque) {
      mal('disciplina-cruzada', `La ${i} dice ser de ${s.bloque} y «${s.clave}» es de ${r.plantilla.disciplina}.`, 'catálogo de plantillas', [i])
    }
    if (r.plantilla.zona !== s.zona) {
      mal('zona-cruzada', `La ${i} dice zona ${s.zona} y «${s.clave}» es de ${r.plantilla.zona}.`, 'catálogo de plantillas', [i])
    }
    if (s.minutos <= 0) mal('sin-volumen', `La ${i} no tiene minutos.`, 'sentido común', [i])
  })

  // ---- 2. Duro-fácil ----
  // La regla más importante del microciclo: dos sesiones duras seguidas no dan
  // dos adaptaciones, dan una adaptación y una sesión hecha con fatiga.
  const diasConCalidad = [...new Set(sesiones.filter(s => s.calidad).map(s => s.dia))]
    .sort((a, b) => idxDia(a) - idxDia(b))
  for (let k = 1; k < diasConCalidad.length; k++) {
    if (idxDia(diasConCalidad[k]) - idxDia(diasConCalidad[k - 1]) <= 1) {
      mal('duro-facil', `Hay calidad el ${diasConCalidad[k - 1].toLowerCase()} y el ${diasConCalidad[k].toLowerCase()}, días seguidos. Una sesión dura necesita 36–48 h antes de que otra produzca adaptación.`,
        'B1-04 Principio 1', sesiones.map((s, i) => s.calidad && (s.dia === diasConCalidad[k] || s.dia === diasConCalidad[k - 1]) ? i : -1).filter(i => i >= 0))
    }
  }
  sesiones.forEach((s, i) => {
    const otras = sesiones.filter((o, k) => k !== i && o.dia === s.dia && o.calidad)
    if (s.calidad && otras.length) {
      mal('dos-calidades-mismo-dia', `El ${s.dia.toLowerCase()} tiene más de una sesión de calidad.`, 'B1-04 Principio 1', [i])
    }
  })

  // ---- 3. Mínimo de sesiones por disciplina ----
  RESISTENCIA.forEach(b => {
    const n = sesiones.filter(s => s.bloque === b).length
    if (n > 0 && n < LIMITES_SESIONES.min) {
      mal('minimo-sesiones', `${ETIQUETA_BLOQUE[b]} tiene ${n} sesión(es): por debajo de ${LIMITES_SESIONES.min} una disciplina no se sostiene.`, 'B1-04 Principio 5')
    }
    if (n > LIMITES_SESIONES.max) {
      ojo('demasiadas-sesiones', `${ETIQUETA_BLOQUE[b]} tiene ${n} sesiones, más de las ${LIMITES_SESIONES.max} que se consideran útiles.`, 'B1-04 Principio 5')
    }
    if (n === 0) ojo('disciplina-ausente', `No hay ninguna sesión de ${ETIQUETA_BLOQUE[b]} esta semana.`, 'B1-04 Principio 5')
  })

  // ---- 4. El reparto entre disciplinas ----
  const total = sesiones.reduce((a, s) => a + s.minutos, 0)
  if (total > 0) {
    const rango = rangoDisciplina(ctx.entrada.distancia)
    ;([...RESISTENCIA, 'Fuerza'] as Bloque[]).forEach(b => {
      const min = sesiones.filter(s => s.bloque === b).reduce((a, s) => a + s.minutos, 0)
      const pct = min / total * 100
      if (min === 0) return
      const r = rango[b]
      // Margen de dos puntos: el reparto sale de sesiones enteras y no puede
      // cuadrar al decimal. Fuera de eso, ya no es el reparto de esa prueba.
      if (pct < r.min - 2 || pct > r.max + 2) {
        mal('reparto-fuera-de-rango', `${ETIQUETA_BLOQUE[b]} se lleva el ${pct.toFixed(0)} % del volumen y en ${ETIQUETA_DISTANCIA[ctx.entrada.distancia]} le toca ${r.min}–${r.max} %.`, 'B1-04 Principio 5')
      }
    })
  }

  // ---- 5. Volumen total ----
  const objetivo = ctx.forma?.minutosTotales ?? (ctx.entrada.horasSemana || 0) * 60
  if (objetivo > 0 && total > 0) {
    const desvio = Math.round((total / objetivo - 1) * 100)
    if (Math.abs(desvio) > 20) {
      mal('volumen-fuera', `La semana suma ${Math.round(total / 6) / 10} h y el atleta maneja ${Math.round(objetivo / 6) / 10} h: un ${Math.abs(desvio)} % ${desvio > 0 ? 'más' : 'menos'}. Saltar por encima de su volumen habitual es la forma más rápida de lesionarlo.`, 'B1-04 · B1-11')
    } else if (Math.abs(desvio) > 10) {
      ojo('volumen-desviado', `La semana se desvía un ${Math.abs(desvio)} % del volumen habitual del atleta.`, 'B1-11')
    }
  }

  // ---- 6. Interferencia entre disciplinas ----
  const porDia = new Map<DiaSemana, SesionAVerificar[]>()
  sesiones.forEach(s => porDia.set(s.dia, [...(porDia.get(s.dia) || []), s]))
  DIAS.forEach((d, k) => {
    const hoy = porDia.get(d) || []
    const ayer = porDia.get(DIAS[k - 1]) || []
    if (hoy.some(s => s.bloque === 'Ciclismo') && ayer.some(s => s.bloque === 'Carrera' && s.calidad)) {
      ojo('carrera-dura-antes-de-bici', `Ciclismo el ${d.toLowerCase()} después de una carrera intensa: el daño excéntrico limita la producción de potencia.`, 'B1-04 Principio 3')
    }
    if (hoy.some(s => s.bloque === 'Carrera') && ayer.some(s => s.bloque === 'Ciclismo' && s.larga)) {
      ojo('bici-larga-antes-de-carrera', `Carrera el ${d.toLowerCase()} después de un ciclismo largo: glucógeno vacío y fatiga residual.`, 'B1-04 Principio 3')
    }
    const bici = hoy.find(s => s.bloque === 'Ciclismo')
    const carrera = hoy.find(s => s.bloque === 'Carrera')
    if (bici && carrera && !carrera.brick) {
      ojo('bici-carrera-suelto', `Ciclismo y carrera el ${d.toLowerCase()} sin encadenarlas: si van juntas, que sea un brick.`, 'B1-04 Principios 3 y 4')
    }
  })

  // ---- 7. Los días y las horas que tiene ----
  const disp = ctx.dias
  if (Array.isArray(disp) && disp.length) {
    const permitidos = new Set(disp.map(d => d.dia))
    ;[...porDia.keys()].forEach(d => {
      if (!permitidos.has(d)) mal('dia-no-disponible', `Hay sesión el ${d.toLowerCase()} y el atleta no entrena ese día.`, 'disponibilidad del atleta')
    })
    disp.forEach(d => {
      const min = (porDia.get(d.dia) || []).reduce((a, s) => a + s.minutos, 0)
      if (d.minutos != null && min > d.minutos) {
        mal('sin-tiempo', `El ${d.dia.toLowerCase()} suma ${min}′ y solo tiene ${d.minutos}′ disponibles.`, 'disponibilidad del atleta')
      }
    })
  } else if (typeof disp === 'number' && disp > 0 && porDia.size > disp) {
    mal('demasiados-dias', `La semana usa ${porDia.size} días y el atleta entrena ${disp}.`, 'disponibilidad del atleta')
  }

  // ---- 8. Cosas que un entrenador podría hacer a propósito ----
  const largas = sesiones.filter(s => s.larga)
  if (largas.length && !largas.some(s => FIN_DE_SEMANA.includes(s.dia))) {
    ojo('larga-fuera-del-finde', 'Ninguna sesión larga cae en fin de semana.', 'B1-04 Parte 2')
  }
  if (!sesiones.some(s => s.calidad)) {
    ojo('sin-calidad', 'La semana no tiene ninguna sesión de calidad: es una semana de descarga.', 'B1-04 Principio 2')
  }
  sesiones.forEach((s, i) => {
    if (s.calidad && nivelDe(s.zona) < 3) {
      ojo('calidad-suave', `La ${i} está marcada como calidad y va en ${s.zona}, que es zona base.`, 'B1-04 Principio 2', [i])
    }
    if (s.zona === 'AER' && s.minutos > 60) {
      ojo('recuperacion-larga', `La ${i} es recuperación (AER) y dura ${s.minutos}′: por encima de una hora ya no recupera.`, 'B1-00d Z1', [i])
    }
    if (nivelDe(s.zona) >= 6 && s.minutos > 75) {
      ojo('anaerobica-larga', `La ${i} va en ${s.zona} y dura ${s.minutos}′, que no es una sesión de esa zona.`, 'lib/zonas · duración de zona', [i])
    }
  })

  const vale = !inc.some(x => x.gravedad === 'error')
  return { vale, incumplimientos: inc, paraElModelo: textoParaElModelo(inc) }
}

/**
 * Los incumplimientos en texto, para devolvérselos al modelo.
 *
 * Los errores van primero y separados de los avisos: si se le da todo revuelto
 * se pone a arreglar la sesión larga del miércoles y deja los dos días duros
 * seguidos, que es lo único que de verdad invalida la semana.
 */
export function textoParaElModelo(inc: Incumplimiento[]): string {
  const errores = inc.filter(x => x.gravedad === 'error')
  const avisos = inc.filter(x => x.gravedad === 'aviso')
  if (!errores.length && !avisos.length) return 'La semana cumple todas las reglas.'
  return [
    errores.length ? 'HAY QUE ARREGLAR ESTO (la semana no vale así):\n' + errores.map(x => `- ${x.texto} [${x.fuente}]`).join('\n') : '',
    avisos.length ? 'Y esto es mejorable, pero no bloquea:\n' + avisos.map(x => `- ${x.texto} [${x.fuente}]`).join('\n') : '',
  ].filter(Boolean).join('\n\n')
}

/** Resumen de una línea, para pantalla. */
export function resumenVeredicto(v: Veredicto): string {
  const e = v.incumplimientos.filter(x => x.gravedad === 'error').length
  const a = v.incumplimientos.filter(x => x.gravedad === 'aviso').length
  if (!e && !a) return 'Cumple todas las reglas.'
  if (!e) return `Válida, con ${a} aviso(s).`
  return `${e} error(es)${a ? ` y ${a} aviso(s)` : ''}.`
}
