// ============================================================
// TRIPULSE — Qué sesión concreta va en cada hueco
// ============================================================
// Tercer escalón. El paso 1 dijo cuántas sesiones y de qué, el paso 2 en qué día
// va cada una, y este dice CUÁL: la zona que le toca y qué plantilla de las 64
// del catálogo la llena.
//
// Y NO LLAMA A LA IA. No porque no vaya a llamarla nunca —irá encima de esto—
// sino porque este fichero es el SUELO: si no hay clave de API, si el modelo se
// cae o si devuelve algo que no vale, el plan se genera igual. Un planificador
// que solo funciona cuando el proveedor está de buenas no es un planificador.
//
// Lo que la IA añadirá encima es criterio con contexto: «esta semana ha dormido
// mal, mejor la variante suave», «su punto flojo es la natación, mete la de
// técnica», «quedan cuatro semanas, toca ritmo de competición». Eso una regla no
// lo sabe. Pero su elección se valida contra la MISMA lista cerrada que usa esto,
// así que su peor caso es elegir regular — nunca inventar una sesión que la app
// no sepa aplicar.
//
// CADA ELECCIÓN LLEVA SU MOTIVO. Un plan que no se puede explicar no se puede
// corregir: el entrenador necesita saber por qué salió eso para saber qué cambiar.
import type { FormaSemana, NivelAtleta, Bloque } from './plan-semana'
import type { SemanaColocada, Hueco, DiaSemana } from './plan-colocacion'
import { plantillasDe, opcionesDe, resolverClave, type NivelPlantilla } from './plantillas'
import { fuerzaDeFase, type PlantillaFuerza } from './plantillas-fuerza'
import type { Disciplina, FaseMacro, FranjaReparto } from './distribucion-zonas'
import { cargaZona } from './zonas'

export interface Relleno {
  dia: DiaSemana
  hueco: Hueco
  /** Clave del catálogo: `cic-aei` o `cic-aei/over-unders`. Vacía en fuerza. */
  clave: string
  /** Id de `plantillas-fuerza` cuando el hueco es de fuerza. */
  claveFuerza?: string
  nombre: string
  zona: string
  nivel: NivelPlantilla
  minutos: number
  /** Por qué esta y no otra. Sin esto el plan no se puede corregir. */
  motivo: string
}

export interface SemanaRellena {
  relleno: Relleno[]
  /** Huecos que no se pudieron llenar, con el porqué. */
  sinLlenar: { hueco: Hueco; dia: DiaSemana; motivo: string }[]
  avisos: string[]
}

/** El nivel del atleta traducido al del catálogo, que solo tiene tres. */
export function nivelDePlantilla(n: NivelAtleta): NivelPlantilla {
  return n === 'principiante' ? 'principiante' : n === 'intermedio' ? 'intermedio' : 'avanzado'
}

// ------------------------------------------------------------
// Qué zona le toca a cada hueco
// ------------------------------------------------------------
// El presupuesto de zonas viene en % del volumen de la disciplina. Aquí se
// convierte en minutos y se reparte entre los huecos de esa disciplina, de más
// exigente a menos: primero las de calidad, que son las que tienen que caer en
// una zona concreta, y el resto rellena lo que queda.

/** Las zonas de una franja, ordenadas de más suave a más dura. */
const intensidadDe = (sigla: string) => cargaZona(sigla).nivel

interface Bolsa { sigla: string; minutos: number }

/**
 * Convierte el presupuesto de la disciplina en una bolsa de minutos por zona.
 *
 * Cuando una franja cubre varias siglas (el cajón anaeróbico), el presupuesto es
 * COMPARTIDO: se le da entero a la más suave de ellas, que es la que de verdad se
 * usa en un plan de triatlón. Repartirlo a partes iguales daría cuatro migajas de
 * las que ninguna llega para una sesión.
 */
function bolsaDeZonas(franjas: FranjaReparto[], minutosDisciplina: number): Bolsa[] {
  return franjas.map(f => {
    const pct = (f.min + f.max) / 2
    const sigla = [...f.siglas].sort((a, b) => intensidadDe(a) - intensidadDe(b))[0]
    return { sigla, minutos: minutosDisciplina * pct / 100 }
  }).sort((a, b) => intensidadDe(a.sigla) - intensidadDe(b.sigla))
}

// Las zonas que sostienen una sesión de calidad en un plan de resistencia. Las
// lácticas y alácticas se quedan fuera A PROPÓSITO: la distribución les da entre
// el 0 y el 1 % —o sea, ninguna— y aun así les quedaba una miga de presupuesto
// con la que se colaban. Así salía «Potencia neuromuscular, 96 minutos» como
// sesión de calidad de un 70.3, cuando PLA son esfuerzos de ocho segundos. Ese
// trabajo existe en el catálogo para que el entrenador lo ponga a mano cuando
// sabe por qué, no para que lo reparta un algoritmo.
const ZONAS_CALIDAD = ['AEM', 'AEI', 'PAE']
const ZONAS_BASE = ['AER', 'AEL', 'AEM']

// Una recuperación más larga que esto ya no es una recuperación. B1-00d da la
// rodadura de recuperación en 30–60 min y el trote suave en 30–60.
const MAX_AER = 60

const saldo = (bolsa: Bolsa[], sigla: string) => bolsa.find(b => b.sigla === sigla)?.minutos ?? -1

/** De las candidatas, la que más presupuesto le queda. `null` si ninguna tiene. */
function conMasSaldo(bolsa: Bolsa[], candidatas: string[]): string | null {
  const vivas = candidatas.filter(s => saldo(bolsa, s) > 0)
  if (!vivas.length) return null
  return vivas.sort((a, b) => saldo(bolsa, b) - saldo(bolsa, a))[0]
}

/**
 * La zona de un hueco.
 *
 * · La LARGA va a la zona base (AEL): una tirada larga en zona alta no es una
 *   tirada larga, es una carrera.
 * · La de CALIDAD va a la zona de calidad con MÁS presupuesto, no a la más dura.
 *   Es lo que hace que la mezcla siga a la distribución en vez de ignorarla: en
 *   un 70.3, que es piramidal, eso da AEM y AEI; en un sprint, más polarizado,
 *   sube a PAE solo. Buscar «la más dura con saldo» convertía cualquier miga en
 *   una sesión.
 * · El BRICK nunca va en recuperación: la carrera detrás de la bici existe para
 *   correr con las piernas del día de la prueba, y eso no se entrena trotando.
 * · El resto coge la base con más saldo, y AER solo si la sesión es corta.
 */
function zonaParaHueco(h: Hueco, bolsa: Bolsa[], calidadYaUsada: Set<string>): string | null {
  if (h.larga) return conMasSaldo(bolsa, ['AEL', 'AEM', 'AER'])
  if (h.calidad) {
    // Las de calidad de la semana no repiten zona ENTRE ELLAS, aunque sean de
    // deportes distintos. Con «la que más presupuesto tiene» a secas, en una
    // distribución piramidal AEM gana siempre y el atleta no pisaba el umbral
    // en toda la semana: el presupuesto de AEI existía y no se usaba nunca.
    const libres = ZONAS_CALIDAD.filter(z => !calidadYaUsada.has(z))
    return conMasSaldo(bolsa, libres)
      || conMasSaldo(bolsa, ZONAS_CALIDAD)
      || conMasSaldo(bolsa, ZONAS_BASE)
  }
  if (h.brick) return conMasSaldo(bolsa, ['AEM', 'AEL'])
  const base = h.minutos > MAX_AER ? ZONAS_BASE.filter(z => z !== 'AER') : ZONAS_BASE
  return conMasSaldo(bolsa, base) || conMasSaldo(bolsa, ZONAS_BASE)
}

// Qué parte de la sesión se pasa DE VERDAD en su zona. Una sesión de intervalos
// es calentamiento, series y recuperaciones: cargarle a la zona los 96 minutos
// enteros vaciaba el presupuesto de golpe y empujaba la siguiente sesión a una
// zona que no tocaba.
const EN_ZONA: Record<string, number> = { AER: 0.9, AEL: 0.9, AEM: 0.7, AEI: 0.5, PAE: 0.35 }

// ------------------------------------------------------------
// Qué plantilla de esa zona
// ------------------------------------------------------------

/**
 * Elige entre las plantillas de esa zona la que hace más que no se usa.
 *
 * `usadas` es lo que el atleta ha hecho hace poco, de más reciente a más
 * antiguo. Sin esto, el catálogo entero da igual: el algoritmo cogería siempre
 * la primera y el atleta vería la misma sesión todas las semanas por muchas
 * variantes que haya.
 */
export function elegirPlantilla(
  disciplina: Disciplina,
  zona: string,
  usadas: string[],
): { clave: string; nombre: string; motivo: string } | null {
  const opciones = plantillasDe(disciplina)
    .filter(p => p.zona === zona)
    .flatMap(p => opcionesDe(p).map(o => ({
      clave: o.clave,
      nombre: o.esBase ? p.nombre : `${p.nombre} · ${o.nombre}`,
    })))
  if (!opciones.length) return null

  // El índice en `usadas` es «hace cuánto»: −1 (no está) es lo más antiguo posible.
  const antiguedad = (clave: string) => {
    const i = usadas.indexOf(clave)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const mejor = [...opciones].sort((a, b) => antiguedad(b.clave) - antiguedad(a.clave))[0]
  const nunca = !usadas.includes(mejor.clave)
  return {
    ...mejor,
    motivo: opciones.length === 1
      ? `Es la única sesión de ${zona} que hay en ${disciplina} — conviene añadirle variantes.`
      : nunca
        ? `${zona}: de las ${opciones.length} opciones, la que no ha hecho.`
        : `${zona}: la que hace más que no repite, de ${opciones.length} opciones.`,
  }
}

// ------------------------------------------------------------
// El relleno completo
// ------------------------------------------------------------

export interface EntradaRelleno {
  forma: FormaSemana
  colocada: SemanaColocada
  nivel: NivelAtleta
  fase: FaseMacro
  /** Claves que el atleta ha hecho hace poco, de más reciente a más antigua. */
  usadas?: string[]
}

export function rellenarSemana(e: EntradaRelleno): SemanaRellena {
  const avisos: string[] = []
  const relleno: Relleno[] = []
  const sinLlenar: SemanaRellena['sinLlenar'] = []
  const nivel = nivelDePlantilla(e.nivel)
  // Las que se van gastando en ESTA semana cuentan como recién usadas, para que
  // dos huecos de la misma zona no se lleven la misma plantilla.
  const usadas = [...(e.usadas || [])]

  // Una bolsa de minutos por disciplina, que se va gastando.
  const bolsas = {} as Record<Disciplina, Bolsa[]>
  ;(['Natacion', 'Ciclismo', 'Carrera'] as Disciplina[]).forEach(d => {
    const bloque = e.forma.bloques.find(b => b.bloque === d)
    bolsas[d] = bloque && bloque.minutos > 0 ? bolsaDeZonas(e.forma.zonas[d], bloque.minutos) : []
  })

  const fuerza: PlantillaFuerza | undefined = fuerzaDeFase(e.fase)[0]
  const calidadYaUsada = new Set<string>()

  // En el mismo orden que se colocaron: primero lo que menos margen tiene.
  const orden = (h: Hueco) => (h.larga ? 0 : h.calidad ? 1 : 2)
  const todos = e.colocada.dias
    .flatMap(d => d.huecos.map(h => ({ dia: d.dia, h })))
    .sort((a, b) => orden(a.h) - orden(b.h))

  for (const { dia, h } of todos) {
    if (h.bloque === 'Fuerza') {
      if (!fuerza) { sinLlenar.push({ hueco: h, dia, motivo: 'En esta fase del macrociclo no toca fuerza.' }); continue }
      relleno.push({
        dia, hueco: h, clave: '', claveFuerza: fuerza.id, nombre: fuerza.nombre,
        zona: fuerza.bloques[0]?.zona || '', nivel, minutos: h.minutos,
        motivo: `La fuerza de esta fase (${fuerza.fuente.split('(')[0].trim()}).`,
      })
      continue
    }

    const disc = h.bloque as Disciplina
    const bolsa = bolsas[disc]
    const zona = zonaParaHueco(h, bolsa, calidadYaUsada)
    if (zona && h.calidad) calidadYaUsada.add(zona)
    if (!zona) { sinLlenar.push({ hueco: h, dia, motivo: `No queda presupuesto de zonas en ${disc}.` }); continue }

    const elegida = elegirPlantilla(disc, zona, usadas)
    if (!elegida) { sinLlenar.push({ hueco: h, dia, motivo: `No hay ninguna plantilla de ${zona} en ${disc}.` }); continue }

    // Se gasta de la bolsa solo el tiempo que se pasa EN la zona, no la sesión
    // entera. Si queda a cero, la siguiente de esa disciplina cogerá otra.
    const b = bolsa.find(x => x.sigla === zona)!
    b.minutos = Math.max(0, b.minutos - h.minutos * (EN_ZONA[zona] ?? 0.5))

    usadas.unshift(elegida.clave)
    const porQue = h.larga ? 'Es la sesión larga de la semana. ' : h.calidad ? 'Es una de las de calidad. ' : ''
    const brick = h.brick ? ' Va encadenada a la bici, sin pausa.' : ''
    relleno.push({
      dia, hueco: h, clave: elegida.clave, nombre: elegida.nombre, zona, nivel,
      minutos: h.minutos, motivo: porQue + elegida.motivo + brick,
    })
  }

  // DE VUELTA AL ORDEN DE LA SEMANA. Arriba se recorre por prioridad —primero la
  // larga y las de calidad, que son las que menos margen tienen— pero eso es un
  // detalle del algoritmo, no algo que deba salir por la puerta: la salida venía
  // en «Sábado, Domingo, Lunes, Miércoles, Martes…». Al modelo lo confunde y en
  // una pantalla estaría directamente mal.
  const ordenDia = new Map(e.colocada.dias.map((d, i) => [d.dia, i]))
  const ordenEnDia = (r: Relleno) =>
    e.colocada.dias.find(d => d.dia === r.dia)?.huecos.indexOf(r.hueco) ?? 0
  relleno.sort((a, b) =>
    (ordenDia.get(a.dia) ?? 0) - (ordenDia.get(b.dia) ?? 0) || ordenEnDia(a) - ordenEnDia(b))

  // Las que solo tienen una opción son las que más van a repetirse: se dice, con
  // nombre y apellidos, para que se sepa dónde hace falta ampliar el catálogo.
  const unicas = [...new Set(relleno.filter(r => r.motivo.includes('la única')).map(r => `${r.zona} en ${r.hueco.bloque}`))]
  if (unicas.length) {
    avisos.push(`Sin alternativa (siempre saldrá la misma sesión): ${unicas.join(', ')}.`)
  }
  if (sinLlenar.length) {
    avisos.push(`${sinLlenar.length} hueco(s) sin llenar.`)
  }
  return { relleno, sinLlenar, avisos }
}

/** Todo lo que la semana pide, en una línea por día. */
export function resumenRelleno(s: SemanaRellena): string {
  const porDia = new Map<string, string[]>()
  s.relleno.forEach(r => {
    if (!porDia.has(r.dia)) porDia.set(r.dia, [])
    porDia.get(r.dia)!.push(`${r.nombre} ${r.minutos}′`)
  })
  return [...porDia].map(([dia, xs]) => `${dia}: ${xs.join(' + ')}`).join(' · ')
}

/** Comprueba que toda clave del relleno existe de verdad en el catálogo. */
export function clavesValidas(s: SemanaRellena): boolean {
  return s.relleno.every(r => !r.clave || !!resolverClave(r.clave))
}
