// ============================================================
// TRIPULSE — Colocar la semana en días
// ============================================================
// Segundo escalón del planificador, y sigue sin haber IA. El primero decidió
// CUÁNTAS sesiones y de qué; este decide QUÉ DÍA va cada una.
//
// Parece lo fácil y es donde se estropea un plan. Las sesiones pueden ser
// perfectas y la semana no valer nada: dos días duros seguidos no dan dos
// adaptaciones, dan una adaptación y una sesión hecha con fatiga. Por eso esto
// es código y no prompt.
//
// LAS REGLAS SON DATOS, NO `if` SUELTOS
// `REGLAS` lleva cada regla con su peso y su fuente. Sirve para tres cosas: se
// puede enseñar en pantalla («esta sesión está aquí porque…»), se puede decir
// cuál hubo que doblegar cuando no había sitio, y se puede cambiar el criterio
// sin tocar el algoritmo.
//
// FUENTES
//   · B1-04 Principio 1 — duro-fácil: 36–48 h entre sesiones de calidad
//   · B1-04 Principio 3 — interferencia entre disciplinas
//   · B1-04 Parte 2 — semanas tipo (el fin de semana es de la sesión clave y la larga)
import type { FormaSemana, Bloque } from './plan-semana'
import { ETIQUETA_BLOQUE } from './plan-semana'

export type DiaSemana = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo'

export const DIAS: DiaSemana[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const FIN_DE_SEMANA: DiaSemana[] = ['Sábado', 'Domingo']

/**
 * Qué días coge un atleta que no ha rellenado su disponibilidad.
 *
 * No es «los N primeros»: se reparten para que quepa el duro-fácil. Con tres
 * días, martes-jueves-sábado deja un día libre entre cada uno; lunes-martes-
 * miércoles no dejaría ninguno.
 */
const DIAS_POR_DEFECTO: Record<number, DiaSemana[]> = {
  1: ['Sábado'],
  2: ['Miércoles', 'Sábado'],
  3: ['Martes', 'Jueves', 'Sábado'],
  4: ['Martes', 'Jueves', 'Sábado', 'Domingo'],
  5: ['Martes', 'Miércoles', 'Jueves', 'Sábado', 'Domingo'],
  6: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Sábado', 'Domingo'],
  7: [...DIAS],
}

export function diasPorDefecto(cuantos: number): DiaSemana[] {
  const n = Math.max(1, Math.min(7, Math.round(cuantos || 0)))
  return DIAS_POR_DEFECTO[n]
}

/** Lo que sale de la tabla `disponibilidad`, ya sumado por día. */
export interface DiaDisponible {
  dia: DiaSemana
  /** Minutos que dan sus franjas horarias. `null` = disponible sin límite conocido. */
  minutos: number | null
}

export interface Hueco {
  bloque: Bloque
  minutos: number
  /** Z4–Z5: la que produce la adaptación y pide 36–48 h de margen. */
  calidad: boolean
  /** La más larga de su disciplina en la semana. */
  larga: boolean
  /** Si va encadenada con la anterior sin pausa (bici→carrera). */
  brick: boolean
}

export interface DiaPlan {
  dia: DiaSemana
  huecos: Hueco[]
  minutos: number
}

export interface SemanaColocada {
  dias: DiaPlan[]
  /** Lo que no cupo en ningún día. Vacío = entró todo. */
  sinColocar: Hueco[]
  /** Reglas que hubo que doblegar, con su porqué. */
  compromisos: string[]
  avisos: string[]
}

// ------------------------------------------------------------
// Las reglas
// ------------------------------------------------------------
// El peso ordena las prioridades cuando no caben todas: cuanto más alto, más
// caro romperla. No son minutos ni nada físico, son solo un orden.
export interface Regla {
  id: string
  peso: number
  texto: string
  fuente: string
}

export const REGLAS: Regla[] = [
  {
    id: 'calidad-mismo-dia', peso: 200,
    texto: 'Dos sesiones de calidad el mismo día',
    fuente: 'B1-04 Principio 1',
  },
  {
    id: 'calidad-seguida', peso: 100,
    texto: 'Dos sesiones de calidad en días consecutivos: una sesión dura necesita 36–48 h antes de que otra produzca adaptación',
    fuente: 'B1-04 Principio 1',
  },
  {
    id: 'sin-tiempo', peso: 70,
    texto: 'El día no tiene tiempo disponible para esa sesión',
    fuente: 'disponibilidad del atleta',
  },
  {
    id: 'misma-disciplina-repetida', peso: 80,
    texto: 'Dos sesiones del mismo deporte en el mismo día. La natación es la excepción: se dobla sin coste porque no carga el tren inferior',
    fuente: 'B1-04 Principio 3',
  },
  {
    id: 'carrera-dura-antes-de-bici', peso: 40,
    texto: 'Ciclismo el día después de una carrera intensa: el daño excéntrico limita la producción de potencia',
    fuente: 'B1-04 Principio 3 (interferencia medio-alta)',
  },
  {
    // Por encima de la interferencia de abajo, y a propósito: las semanas tipo de
    // B1-04 ponen el brick el sábado y la tirada larga el domingo, o sea que la
    // fuente ACEPTA esa interferencia a cambio de anclar el fin de semana. Con el
    // peso al revés, la tirada larga se iba al lunes.
    id: 'larga-fuera-del-finde', peso: 35,
    texto: 'La sesión larga fuera del fin de semana',
    fuente: 'B1-04 Parte 2 (semanas tipo)',
  },
  {
    id: 'bici-carrera-suelto', peso: 30,
    texto: 'Ciclismo y carrera el mismo día sin encadenarlas: si van juntas, que sea un brick',
    fuente: 'B1-04 Principio 3 (interferencia alta) y Principio 4',
  },
  {
    id: 'bici-larga-antes-de-carrera', peso: 25,
    texto: 'Carrera el día después de un ciclismo largo: glucógeno vacío y fatiga neuromuscular residual',
    fuente: 'B1-04 Principio 3 (interferencia media)',
  },
  {
    id: 'segunda-sesion-del-dia', peso: 20,
    texto: 'Más de una sesión en el mismo día',
    fuente: 'B1-04 Parte 2 (las semanas tipo doblan poco)',
  },
  {
    id: 'fuerza-antes-de-calidad', peso: 10,
    texto: 'Fuerza el día antes de una sesión de calidad',
    fuente: 'B1-04 Principio 1 (la fuerza también deja fatiga)',
  },
]

const regla = (id: string) => REGLAS.find(r => r.id === id)!

/** Por debajo de esto una regla no es un compromiso, es la vida normal. */
const UMBRAL_COMPROMISO = 25

/** Orden de las sesiones dentro de un día: el del triatlón. */
const ORDEN_DIA: Bloque[] = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']

// ------------------------------------------------------------
// De la forma de la semana a la lista de huecos
// ------------------------------------------------------------

/**
 * Convierte el reparto en sesiones concretas todavía sin día.
 *
 * Reparte la calidad entre las disciplinas con más sesiones, una a cada una y
 * dando la vuelta: concentrar las tres calidades en el mismo deporte deja los
 * otros dos sin estímulo y carga una sola estructura.
 */
export function huecosDe(forma: FormaSemana): Hueco[] {
  const huecos: Hueco[] = []
  const conVolumen = forma.bloques.filter(b => b.sesiones > 0)

  conVolumen.forEach(b => {
    for (let i = 0; i < b.sesiones; i++) {
      huecos.push({
        bloque: b.bloque,
        minutos: b.minutosPorSesion,
        calidad: false,
        // La larga solo tiene sentido en bici y carrera: es la que sostiene el
        // volumen. En natación la sesión larga no cambia la semana.
        larga: i === 0 && (b.bloque === 'Ciclismo' || b.bloque === 'Carrera'),
        brick: false,
      })
    }
  })

  // La calidad va a las disciplinas de resistencia con más sesiones, rotando.
  const candidatas = conVolumen
    .filter(b => b.bloque !== 'Fuerza')
    .sort((a, b) => b.sesiones - a.sesiones)
    .map(b => b.bloque)

  let puestas = 0
  for (let vuelta = 0; puestas < forma.sesionesCalidad && vuelta < 5; vuelta++) {
    for (const disc of candidatas) {
      if (puestas >= forma.sesionesCalidad) break
      // Nunca sobre la larga: una sesión larga ya es la carga de ese día.
      const libre = huecos.find(h => h.bloque === disc && !h.calidad && !h.larga)
      if (libre) { libre.calidad = true; puestas++ }
    }
  }
  return huecos
}

// ------------------------------------------------------------
// La colocación
// ------------------------------------------------------------

interface Estado { dias: DiaPlan[]; capacidad: Map<DiaSemana, number | null> }

function tiene(d: DiaPlan | undefined, f: (h: Hueco) => boolean): boolean {
  return !!d && d.huecos.some(f)
}

/** Cuánto cuesta meter este hueco en este día. Cada penalización, con su regla. */
function coste(est: Estado, idx: number, h: Hueco): { total: number; rotas: Regla[] } {
  const dia = est.dias[idx]
  // AYER Y MAÑANA SON DEL CALENDARIO, NO DEL ARRAY.
  //
  // Aquí había un fallo que solo se veía con días no consecutivos: se miraba
  // `est.dias[idx - 1]`, que es el día ANTERIOR DE LA LISTA de días disponibles.
  // Con martes-jueves-sábado, el algoritmo creía que martes y jueves eran días
  // seguidos, así que ninguna sesión de calidad cabía en ninguna parte sin
  // romper el duro-fácil y las tiraba. Con seis o siete días no se notaba,
  // porque ahí los días de la lista sí son consecutivos.
  const vecino = (salto: number) =>
    est.dias.find(d => DIAS.indexOf(d.dia) === DIAS.indexOf(dia.dia) + salto)
  const ayer = vecino(-1)
  const manana = vecino(1)
  const rotas: Regla[] = []
  const romper = (id: string) => { rotas.push(regla(id)) }

  if (h.calidad) {
    if (tiene(dia, x => x.calidad)) romper('calidad-mismo-dia')
    if (tiene(ayer, x => x.calidad) || tiene(manana, x => x.calidad)) romper('calidad-seguida')
    if (tiene(ayer, x => x.bloque === 'Fuerza')) romper('fuerza-antes-de-calidad')
  }
  if (h.bloque === 'Fuerza' && tiene(manana, x => x.calidad)) romper('fuerza-antes-de-calidad')

  if (h.bloque === 'Ciclismo') {
    if (tiene(ayer, x => x.bloque === 'Carrera' && x.calidad)) romper('carrera-dura-antes-de-bici')
    if (tiene(dia, x => x.bloque === 'Carrera') && !h.brick) romper('bici-carrera-suelto')
  }
  if (h.bloque === 'Carrera') {
    if (tiene(ayer, x => x.bloque === 'Ciclismo' && x.larga)) romper('bici-larga-antes-de-carrera')
    if (tiene(dia, x => x.bloque === 'Ciclismo') && !h.brick) romper('bici-carrera-suelto')
  }

  if (h.larga && !FIN_DE_SEMANA.includes(dia.dia)) romper('larga-fuera-del-finde')

  // Sin esto, cuando hay más sesiones que días el algoritmo las amontona todas en
  // el día que no rompe ninguna otra regla: llegó a poner cuatro carreras el mismo
  // lunes. Doblar es normal en triatlón, pero reparte antes de apilar. La natación
  // queda fuera porque la fuente dice explícitamente que se dobla sin coste.
  if (h.bloque !== 'Natacion' && dia.huecos.length > 0) {
    if (tiene(dia, x => x.bloque === h.bloque)) romper('misma-disciplina-repetida')
    romper('segunda-sesion-del-dia')
  }

  const cap = est.capacidad.get(dia.dia)
  if (cap != null && dia.minutos + h.minutos > cap) romper('sin-tiempo')

  // A igualdad de reglas: el día menos cargado, y repartiendo el mismo deporte.
  // Son desempates, no reglas —pesan poquísimo para no competir nunca con las de
  // arriba—, pero hacen falta: sin el segundo, los dos nados de la semana caían
  // el mismo día teniendo otro libre. Doblar natación no tiene coste fisiológico
  // (B1-04 Principio 3), pero si hay sitio para separarlos, mejor separados.
  const mismoDeporte = dia.huecos.filter(x => x.bloque === h.bloque).length
  const desempate = dia.minutos / 1000 + mismoDeporte * 0.5
  return { total: rotas.reduce((a, r) => a + r.peso, 0) + desempate, rotas }
}

/**
 * Reparte los huecos por los días disponibles.
 *
 * Es voraz y en un orden concreto: primero lo que menos sitio tiene (las largas
 * y las de calidad), y al final la natación, que es la que cabe en cualquier
 * parte sin coste (B1-04 Principio 3: no carga el tren inferior). Meter primero
 * lo flexible deja lo rígido sin sitio.
 */
export function colocarSemana(
  forma: FormaSemana,
  disponibles: DiaDisponible[] | number,
): SemanaColocada {
  const avisos: string[] = []
  const lista: DiaDisponible[] = typeof disponibles === 'number'
    ? diasPorDefecto(disponibles).map(d => ({ dia: d, minutos: null }))
    : [...disponibles]

  if (!lista.length) {
    return { dias: [], sinColocar: huecosDe(forma), compromisos: [], avisos: ['No hay ningún día disponible: no se puede colocar nada.'] }
  }
  if (typeof disponibles !== 'number') {
    avisos.push(`Colocado sobre la disponibilidad real del atleta (${lista.length} día(s)).`)
  }

  // En orden de la semana, no en el que vengan.
  lista.sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia))
  const est: Estado = {
    dias: lista.map(d => ({ dia: d.dia, huecos: [], minutos: 0 })),
    capacidad: new Map(lista.map(d => [d.dia, d.minutos])),
  }

  const prioridad = (h: Hueco) =>
    (h.larga ? 0 : h.calidad ? 1 : h.bloque === 'Natacion' ? 4 : h.bloque === 'Fuerza' ? 3 : 2)

  const pendientes = huecosDe(forma).sort((a, b) => prioridad(a) - prioridad(b) || b.minutos - a.minutos)
  const sinColocar: Hueco[] = []
  const compromisos: string[] = []

  // EL BRICK, COLOCADO A MANO Y ANTES QUE NADA.
  //
  // B1-04 Principio 4 se titula «El Brick es una Sesión Específica, No un
  // Accidente», y dejar que emerja de que la bici y la carrera caigan el mismo
  // día es exactamente convertirlo en un accidente: salían tres a la semana, sin
  // que ninguno fuera la sesión clave. Se monta uno, deliberado, con la bici
  // larga y una carrera corta detrás, en el primer día de fin de semana que haya.
  // Así el domingo queda para la tirada larga, que es la semana tipo de B1-04.
  const bici = pendientes.find(h => h.bloque === 'Ciclismo' && h.larga) || pendientes.find(h => h.bloque === 'Ciclismo')
  const carreraBrick = [...pendientes].reverse().find(h => h.bloque === 'Carrera' && !h.larga && !h.calidad)
  const diaBrick = est.dias.find(d => FIN_DE_SEMANA.includes(d.dia)) || est.dias[est.dias.length - 1]
  if (bici && carreraBrick && diaBrick) {
    carreraBrick.brick = true
    ;[bici, carreraBrick].forEach(h => {
      diaBrick.huecos.push(h)
      diaBrick.minutos += h.minutos
      pendientes.splice(pendientes.indexOf(h), 1)
    })
  }

  for (const h of pendientes) {
    let mejor = -1
    let mejorCoste = Infinity
    let mejorRotas: Regla[] = []
    for (let i = 0; i < est.dias.length; i++) {
      const c = coste(est, i, h)
      if (c.total < mejorCoste) { mejorCoste = c.total; mejor = i; mejorRotas = c.rotas }
    }
    if (mejor < 0) { sinColocar.push(h); continue }

    // Si la única forma de meterla es rompiendo el duro-fácil, no se mete: esa
    // sesión no produciría adaptación y sí fatiga. Mejor una semana con un hueco
    // que una semana que miente.
    const rompeCalidad = mejorRotas.some(r => r.id === 'calidad-mismo-dia' || r.id === 'calidad-seguida')
    if (rompeCalidad && h.calidad) {
      sinColocar.push(h)
      compromisos.push(`No cabe otra sesión de calidad sin ponerla pegada a la anterior. Se deja fuera: ${regla('calidad-seguida').texto} (${regla('calidad-seguida').fuente}).`)
      continue
    }

    est.dias[mejor].huecos.push(h)
    est.dias[mejor].minutos += h.minutos
    // Solo se reporta lo que de verdad es un compromiso. Doblar un día
    // (`segunda-sesion-del-dia`, peso 20) pasa en casi toda semana de triatlón:
    // sacarlo como aviso lo convertiría en ruido y taparía lo que sí importa.
    mejorRotas.filter(r => r.peso >= UMBRAL_COMPROMISO).forEach(r => {
      compromisos.push(`${ETIQUETA_BLOQUE[h.bloque]} el ${est.dias[mejor].dia.toLowerCase()}: ${r.texto} (${r.fuente}).`)
    })
  }

  // Dentro de un día, la bici antes que la carrera: es el orden del triatlón, y
  // si van encadenadas es lo que hace que la segunda se corra con las piernas
  // como el día de la prueba.
  est.dias.forEach(d => {
    d.huecos.sort((a, b) => ORDEN_DIA.indexOf(a.bloque) - ORDEN_DIA.indexOf(b.bloque))
  })

  if (sinColocar.length) {
    avisos.push(`${sinColocar.length} sesión(es) no caben en la semana tal y como está: ${sinColocar.map(h => ETIQUETA_BLOQUE[h.bloque]).join(', ')}.`)
  }
  return { dias: est.dias, sinColocar, compromisos: [...new Set(compromisos)], avisos }
}

/** Resumen legible de la semana colocada, para revisarla de un vistazo. */
export function resumenColocacion(s: SemanaColocada): string {
  return s.dias.map(d => {
    if (!d.huecos.length) return `${d.dia}: descanso`
    const txt = d.huecos.map(h => {
      const marcas = [h.larga && 'larga', h.calidad && 'calidad', h.brick && 'brick'].filter(Boolean).join('/')
      return `${ETIQUETA_BLOQUE[h.bloque]} ${h.minutos}′${marcas ? ` (${marcas})` : ''}`
    }).join(' + ')
    return `${d.dia}: ${txt}`
  }).join(' · ')
}
