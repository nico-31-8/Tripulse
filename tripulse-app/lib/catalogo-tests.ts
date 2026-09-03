// ============================================================
// TRIPULSE — El catálogo de tests de campo
// ============================================================
//
// QUÉ ES ESTO. La descripción, en datos, de cada test de la batería: qué se
// mide a pie de pista, qué sale de ahí y cómo se lee. Una pantalla sola los
// recorre todos, así que añadir un test es añadir una entrada aquí y no
// escribir una página.
//
// POR QUÉ ASÍ Y NO UNA PANTALLA POR TEST. Son diecisiete, y cada pantalla suya
// tendría su propia copia de «coge lo escrito, calcula, guarda». Diecisiete
// copias de eso son diecisiete sitios donde el mismo test puede acabar dando
// números distintos según por dónde se metió — que es exactamente el fallo que
// este proyecto lleva persiguiendo. Las fórmulas viven en `tests-campo` y aquí
// solo se dice cuál usar.
//
// LA DIVISIÓN PROTOCOLO / PERSONA es la misma que en `grupos-test`, y sale del
// test real: el grupo hace UN test con UN protocolo y salen N resultados. Lo
// del protocolo se pregunta una vez arriba; lo de la persona, una vez por
// persona. En individual da igual, pero así las dos pantallas leen lo mismo.
//
// DÓNDE SE GUARDA. En `tests_libres` (nombre + resultado + unidad + notas), que
// ya existe, ya tiene su RLS, ya entra en el borrado de RGPD y ya la lee el
// panel de métricas.
//
// LO QUE NO ESTÁ AQUÍ, AUNQUE SALGA EN LA BATERÍA, Y POR QUÉ. Seis tests del
// documento YA existen en la app con su columna propia. Meterlos aquí crearía
// una segunda definición del mismo número, guardada en otro sitio:
//
//   · Montreal (VAM) ....... test1_carrera.vam     · de ahí salen las zonas
//   · CSS .................. test2_natacion.css    · de ahí salen las zonas
//   · Rampa (FTP/PAM) ...... test3_ciclismo.ftp    · de ahí salen las zonas
//   · MSS .................. test1_carrera.mss     · formulario de sprint
//   · 1RM .................. test_fuerza.rm_estimado · con su gráfica
//   · ASR .................. NO SE GUARDA, y está bien: es MSS − VAM. Guardar
//     una foto de una resta se queda vieja en cuanto se repite cualquiera de
//     los dos tests. Se calcula al vuelo donde haga falta.
//
// Si alguna vez parece que «falta» uno de esos seis, lo que falta es enseñarlo
// mejor donde ya vive, no añadirlo aquí.
//
// CON QUÉ SE DIRIGE CADA TEST NO ESTÁ AQUÍ: está en `herramientas-test`. Ese
// módulo no sabe dónde se guarda nada, y por eso puede cubrir también los siete
// tests clásicos, que no están en este catálogo. Si los descriptores vivieran
// aquí, esos siete se quedarían sin instrumento.
//
// FUENTE: BATERIA-DE-TESTS.pdf del proyecto, §1 a §9. La escalera de
// Margaria-Kalamen viene de fukuda-02-tests-potencia-fuerza.md.

import {
  vamDe6Min, vamDeMilla, umbralDeT30,
  ftpDe20Min, pamDeFtp,
  umbralDeT400, swolf, leeSWOLF, nivelCSS,
  alturaDeVuelo, potenciaCMJ, indiceElasticidad, leeIE, eur, leeEUR, rsi, leeRSI,
  potenciaEscalera,
  deterioroBrick, leeDeterioro, decoupling, leeDecoupling,
  nivelVAM,
  type Sexo,
} from './tests-campo'

export type Disciplina = 'Carrera' | 'Ciclismo' | 'Natación' | 'Fuerza' | 'Triatlón'

/** Lo que se escribe en las casillas. Todo texto: se convierte al calcular. */
export type Valores = Record<string, string>

/** Lo que hace falta del deportista y no se mide en el test. */
export interface Contexto {
  pesoKg?: number | null
  sexo?: Sexo
}

export interface CampoBruto {
  clave: string
  etiqueta: string
  sufijo?: string
  ayuda?: string
  /** Igual para todos: se pregunta una vez arriba, no una por persona. */
  delGrupo?: boolean
  porDefecto?: string
  /** Si lo trae, es un desplegable y no una casilla de número. */
  opciones?: { valor: string; texto: string }[]
  /**
   * El rango de referencia del documento, para las medidas de técnica.
   *
   * Tener esto DENTRO de la casilla es la diferencia entre medir y saber si lo
   * medido está bien: 174 ppm de cadencia no dice nada por sí solo, y «174,
   * dentro de 170-180» sí. Antes había que ir al PDF a mirarlo.
   */
  banda?: { min?: number; max?: number; texto: string }
}

/** Si una medida cae dentro de su banda. `null` si no hay banda o no hay número. */
export function enBanda(c: CampoBruto, valor: number | null | undefined): boolean | null {
  if (!c.banda || valor == null || !isFinite(valor)) return null
  if (c.banda.min != null && valor < c.banda.min) return false
  if (c.banda.max != null && valor > c.banda.max) return false
  return true
}

export interface Salida {
  clave: string
  etiqueta: string
  unidad: string
  /**
   * El número que sale. `null` mientras falte algo: la pantalla enseña una raya
   * y no medio resultado.
   */
  calcular: (v: Valores, ctx: Contexto) => number | null
  /** La frase que lo interpreta, si la hay. */
  leer?: (n: number | null, ctx: Contexto) => string
  /** Cómo se enseña cuando no es un número pelado (un ritmo, un rango). */
  formato?: (n: number | null, v: Valores, ctx: Contexto) => string
  /** El principal del test: es el que encabeza la columna en la vista de grupo. */
  principal?: boolean
  /** Si NO se guarda en tests_libres (intermedios que solo ayudan a entender). */
  noGuardar?: boolean
}

export interface TestCampo {
  clave: string
  nombre: string
  disciplina: Disciplina
  /** Qué mide, en una línea. */
  mide: string
  /** Cómo se hace, tal como lo dice la batería. */
  protocolo: string
  /** Cada cuánto repetirlo (§9). */
  cada?: string
  brutos: CampoBruto[]
  salidas: Salida[]
  /** Datos del deportista sin los cuales algún resultado sale a null. */
  necesita?: ('peso' | 'sexo')[]
  /** Aviso propio del test, cuando el protocolo tiene una trampa conocida. */
  ojo?: string
}

// ── Utilidades de formato ───────────────────────────────────

const num = (v: string | undefined) => (v == null || v === '' ? NaN : Number(v))

/** 258 segundos → «4:18». */
export function mmss(segundos: number | null): string {
  if (segundos == null || !isFinite(segundos) || segundos <= 0) return '—'
  const s = Math.round(segundos)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/**
 * La altura de un salto, venga en centímetros o en tiempo de vuelo.
 *
 * El aparato se elige UNA vez arriba (`unidad`) porque es del aparato, no del
 * atleta: en un grupo no hay medio equipo saltando sobre alfombra y medio sobre
 * app. Y mezclarlos sin darse cuenta daría un índice de elasticidad calculado
 * con un salto en centímetros y otro en milisegundos.
 */
function altura(v: Valores, clave: string): number | null {
  const x = num(v[clave])
  if (!isFinite(x) || x <= 0) return null
  return v.unidad === 'ms' ? alturaDeVuelo(x / 1000) : Math.round(x * 10) / 10
}

const CAMPO_UNIDAD: CampoBruto = {
  clave: 'unidad',
  etiqueta: 'Tu aparato da',
  delGrupo: true,
  porDefecto: 'cm',
  opciones: [
    { valor: 'cm', texto: 'Altura en cm (app, My Jump 2)' },
    { valor: 'ms', texto: 'Tiempo de vuelo en ms (alfombra, plataforma)' },
  ],
}

/**
 * El resumen de una ficha de técnica: cuántas medidas caen en su banda.
 *
 * Se cuenta solo lo MEDIDO, no lo que falta. Una ficha con tres casillas
 * rellenas de cuatro dice «2 de 3», no «2 de 4»: lo que no se midió no está
 * ni bien ni mal, y contarlo como fallo empujaría a rellenar por rellenar.
 */
function cuantasDentro(campos: CampoBruto[]): Salida {
  const conBanda = campos.filter(c => c.banda)
  const medidas = (v: Valores) => conBanda.filter(c => isFinite(num(v[c.clave])))
  return {
    clave: 'dentro',
    etiqueta: 'Dentro de referencia',
    unidad: '',
    principal: true,
    calcular: v => {
      const m = medidas(v)
      if (m.length === 0) return null
      return m.filter(c => enBanda(c, num(v[c.clave]))).length
    },
    formato: (n, v) => (n == null ? '—' : n + ' de ' + medidas(v).length),
    leer: (n, _ctx) => (n == null ? '' : ''),
  }
}


/* Las bandas son literalmente las de §6 del documento. Si alguna vez se
   discuten, se discuten aquí y cambian en toda la app a la vez. */
const PROTOCOLO_VIDEO = "Grabar a ritmo Z2-Z3, 2 min por ángulo (lateral, trasera y frontal). Se mide en Kinovea."

const CAMPOS_TEC_CARRERA: CampoBruto[] = [
  { clave: 'cadencia', etiqueta: 'Cadencia', sufijo: 'ppm',
    banda: { min: 170, max: 180, texto: '170-180 ppm' } },
  { clave: 'contacto', etiqueta: 'Tiempo de contacto', sufijo: 'ms',
    banda: { max: 300, texto: '200-250 ms élite · menos de 300 recreativo' } },
  { clave: 'oscilacion', etiqueta: 'Oscilación vertical', sufijo: 'cm',
    banda: { max: 8, texto: 'menos de 8 cm' } },
  { clave: 'inclinacion', etiqueta: 'Inclinación', sufijo: 'grados',
    banda: { min: 5, max: 10, texto: '5-10°' } },
  /* Overstriding es un sí o un no, no un número: se mira si el pie cae por
     delante del centro de masas. Por eso no lleva banda y no cuenta en el
     recuento. */
  { clave: 'overstriding', etiqueta: 'Overstriding', porDefecto: '',
    ayuda: 'El pie no debe caer por delante del centro de masas',
    opciones: [
      { valor: '', texto: 'Sin valorar' },
      { valor: 'no', texto: 'No: el pie cae bajo el cuerpo' },
      { valor: 'si', texto: 'Sí: el pie cae por delante' },
    ] },
]

const CAMPOS_TEC_NATACION: CampoBruto[] = [
  { clave: 'frecuencia', etiqueta: 'Frecuencia de brazada', sufijo: 'ciclos/min',
    banda: { min: 45, max: 70, texto: 'sprint 55-70 · distancia 45-55 ciclos/min' } },
  { clave: 'distanciaBrazada', etiqueta: 'Distancia por brazada', sufijo: 'm',
    ayuda: 'Opcional, si tu vídeo permite medirla' },
]

const CAMPOS_BIKEFIT: CampoBruto[] = [
  { clave: 'rodilla', etiqueta: 'Rodilla en el punto muerto inferior', sufijo: 'grados',
    banda: { min: 25, max: 35, texto: '25-35° · en triatlón 30-32°' } },
  { clave: 'torso', etiqueta: 'Torso en posición de cabra', sufijo: 'grados',
    banda: { min: 20, max: 25, texto: '20-25°' } },
  { clave: 'tobillo', etiqueta: 'Tobillo en el punto muerto inferior', sufijo: 'grados',
    banda: { min: 10, max: 20, texto: '10-20° de flexión plantar' } },
  { clave: 'float', etiqueta: 'Float de la cala', sufijo: 'grados',
    banda: { min: 4, max: 6, texto: '4-6°' } },
]

// ── El catálogo ─────────────────────────────────────────────

export const CATALOGO: TestCampo[] = [
  // ---------- §1 Carrera ----------
  {
    clave: '6min',
    nombre: 'Test de 6 minutos',
    disciplina: 'Carrera',
    mide: 'VAM',
    protocolo: '15 min de calentamiento y máximos metros en 6 minutos.',
    cada: 'Al inicio y cada 6-8 semanas',
    ojo: 'Seis minutos exactos. En uno más largo la velocidad media cae por debajo de la VAM y la cuenta deja de valer.',
    necesita: ['sexo'],
    brutos: [{ clave: 'metros', etiqueta: 'Metros recorridos', sufijo: 'm' }],
    salidas: [{
      clave: 'vam', etiqueta: 'VAM', unidad: 'km/h', principal: true,
      calcular: v => vamDe6Min(num(v.metros)),
      leer: (n, ctx) => {
        const niv = nivelVAM(n, ctx.sexo)
        return niv ? 'Nivel ' + niv + '.' : ''
      },
    }],
  },
  {
    clave: 'milla',
    nombre: 'Milla',
    disciplina: 'Carrera',
    mide: 'VAM estimada',
    protocolo: '1.609 m al máximo.',
    cada: 'Cuando no hay pista donde medir metros',
    necesita: ['sexo'],
    brutos: [{ clave: 'minutos', etiqueta: 'Tiempo', sufijo: 'min', ayuda: 'En minutos con decimales: 5:30 son 5,5' }],
    salidas: [{
      clave: 'vam', etiqueta: 'VAM estimada', unidad: 'km/h', principal: true,
      calcular: v => vamDeMilla(num(v.minutos)),
      leer: (n, ctx) => {
        const niv = nivelVAM(n, ctx.sexo)
        return niv ? 'Nivel ' + niv + '.' : ''
      },
    }],
  },
  {
    clave: 't30',
    nombre: 'T30 (umbral)',
    disciplina: 'Carrera',
    mide: 'Ritmo umbral',
    protocolo: '30 minutos al máximo sostenido.',
    cada: 'Cada 6-8 semanas',
    ojo: 'Treinta minutos al máximo se sostienen un poco POR ENCIMA del umbral. Por eso el umbral sale un 3 % más lento que lo que hizo.',
    brutos: [{ clave: 'metros', etiqueta: 'Metros en 30 min', sufijo: 'm' }],
    salidas: [
      {
        clave: 'ritmoUmbral', etiqueta: 'Ritmo umbral', unidad: 's/km', principal: true,
        calcular: v => {
          const m = num(v.metros)
          if (!isFinite(m) || m <= 0) return null
          return umbralDeT30(1800 / (m / 1000))
        },
        formato: n => (n == null ? '—' : mmss(n) + ' /km'),
      },
      {
        clave: 'ritmoMedio', etiqueta: 'Ritmo medio del test', unidad: 's/km', noGuardar: true,
        calcular: v => {
          const m = num(v.metros)
          if (!isFinite(m) || m <= 0) return null
          return Math.round(1800 / (m / 1000))
        },
        formato: n => (n == null ? '—' : mmss(n) + ' /km'),
      },
    ],
  },
  {
    clave: '180m',
    nombre: '180 m repetidos',
    disciplina: 'Carrera',
    mide: 'MAS específica de medio fondo',
    protocolo: '180 m con 20 m de recuperación, hasta el agotamiento.',
    cada: 'Específico de 800-5000',
    ojo: 'LA BATERÍA NO DA FÓRMULA PARA ESTE TEST: la casilla de cálculo pone una raya. Se guarda lo medido y la caída entre la mejor y la última, que es aritmética y no una estimación inventada.',
    brutos: [
      { clave: 'repes', etiqueta: 'Repeticiones completadas', sufijo: 'rep' },
      { clave: 'mejor', etiqueta: 'Mejor tiempo', sufijo: 'seg' },
      { clave: 'ultimo', etiqueta: 'Último tiempo', sufijo: 'seg' },
    ],
    salidas: [
      {
        clave: 'repes', etiqueta: 'Repeticiones', unidad: 'rep', principal: true,
        calcular: v => (isFinite(num(v.repes)) && num(v.repes) > 0 ? num(v.repes) : null),
      },
      {
        clave: 'caida', etiqueta: 'Caída del último respecto al mejor', unidad: '%',
        calcular: v => {
          const a = num(v.mejor), b = num(v.ultimo)
          if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null
          return Math.round((b - a) / a * 1000) / 10
        },
      },
    ],
  },

  // ---------- §2 Ciclismo ----------
  {
    clave: 'ftp20',
    nombre: 'FTP 20 minutos',
    disciplina: 'Ciclismo',
    mide: 'FTP y PAM estimada',
    protocolo: 'Calentamiento con 5 min en Z4 y 20 min al máximo.',
    cada: 'Cada 6-8 semanas',
    ojo: 'Tiene que llegar parecido a la rampa. Si los dos números se separan mucho, uno de los dos tests se hizo mal.',
    brutos: [{ clave: 'media', etiqueta: 'Media de los 20 min', sufijo: 'W' }],
    salidas: [
      { clave: 'ftp', etiqueta: 'FTP', unidad: 'W', principal: true, calcular: v => ftpDe20Min(num(v.media)) },
      {
        clave: 'pam', etiqueta: 'PAM estimada', unidad: 'W',
        calcular: v => pamDeFtp(ftpDe20Min(num(v.media))),
        leer: n => (n == null ? '' : 'Estimada, no medida: si hay rampa, manda la PAM de la rampa.'),
      },
    ],
  },
  {
    clave: 'ftp60',
    nombre: 'FTP de 60 minutos',
    disciplina: 'Ciclismo',
    mide: 'FTP (gold standard)',
    protocolo: '60 minutos al máximo.',
    cada: 'El de referencia, cuando se puede',
    ojo: 'Aquí no hay corrección: una hora al máximo ES el FTP, por definición. Los otros dos tests de ciclismo son atajos a este número.',
    brutos: [{ clave: 'media', etiqueta: 'Media de los 60 min', sufijo: 'W' }],
    salidas: [{
      clave: 'ftp', etiqueta: 'FTP', unidad: 'W', principal: true,
      calcular: v => (isFinite(num(v.media)) && num(v.media) > 0 ? Math.round(num(v.media)) : null),
    }],
  },

  // ---------- §3 Natación ----------
  {
    clave: 't400',
    nombre: 'T400',
    disciplina: 'Natación',
    mide: 'Ritmo umbral estimado',
    protocolo: '400 m al máximo.',
    cada: 'Cada 4-6 semanas',
    necesita: ['sexo'],
    ojo: 'Es la alternativa al CSS cuando solo se puede hacer una distancia. El CSS, con dos, mide mejor.',
    brutos: [{ clave: 'segundos', etiqueta: 'Tiempo del 400', sufijo: 'seg' }],
    salidas: [{
      clave: 'ritmoUmbral', etiqueta: 'Ritmo umbral', unidad: 's/100m', principal: true,
      calcular: v => umbralDeT400(num(v.segundos)),
      formato: n => (n == null ? '—' : mmss(n) + ' /100m'),
      leer: (n, ctx) => {
        const niv = nivelCSS(n, ctx.sexo)
        return niv ? 'Nivel ' + niv + '.' : ''
      },
    }],
  },
  {
    clave: 'swolf',
    nombre: 'SWOLF',
    disciplina: 'Natación',
    mide: 'Eficiencia técnica',
    protocolo: 'Brazadas más segundos de un largo.',
    ojo: 'Suma dos cosas con unidades distintas, y ahí está la gracia: si baja brazadas alargando cada una pero tarda más, el SWOLF no mejora.',
    brutos: [
      {
        clave: 'largo', etiqueta: 'Largo de piscina', delGrupo: true, porDefecto: '25',
        opciones: [{ valor: '25', texto: '25 m' }, { valor: '50', texto: '50 m' }],
      },
      { clave: 'brazadas', etiqueta: 'Brazadas', sufijo: 'br' },
      { clave: 'segundos', etiqueta: 'Tiempo del largo', sufijo: 'seg' },
    ],
    salidas: [{
      clave: 'swolf', etiqueta: 'SWOLF', unidad: '', principal: true,
      calcular: v => swolf(num(v.brazadas), num(v.segundos)),
      leer: (n, _ctx) => leeSWOLF(n, 25),
    }],
  },

  // ---------- §4 Velocidad, fuerza y anaeróbico ----------
  {
    clave: 'rast',
    nombre: 'RAST / 300-400 m',
    disciplina: 'Carrera',
    mide: 'Producción y tolerancia al lactato',
    protocolo: 'Test de 300 o 400 m con lactato al final.',
    ojo: 'LA BATERÍA NO DA FÓRMULA: se registra lo medido. El lactato final es el dato, no un número derivado de él.',
    brutos: [
      {
        clave: 'distancia', etiqueta: 'Distancia', delGrupo: true, porDefecto: '400',
        opciones: [{ valor: '300', texto: '300 m' }, { valor: '400', texto: '400 m' }],
      },
      { clave: 'segundos', etiqueta: 'Tiempo', sufijo: 'seg' },
      { clave: 'lactato', etiqueta: 'Lactato final', sufijo: 'mmol/L' },
    ],
    salidas: [
      {
        clave: 'tiempo', etiqueta: 'Tiempo', unidad: 'seg', principal: true,
        calcular: v => (isFinite(num(v.segundos)) && num(v.segundos) > 0 ? num(v.segundos) : null),
      },
      {
        clave: 'lactato', etiqueta: 'Lactato final', unidad: 'mmol/L',
        calcular: v => (isFinite(num(v.lactato)) && num(v.lactato) > 0 ? num(v.lactato) : null),
      },
    ],
  },

  // ---------- §5 Saltos (Bosco) ----------
  {
    clave: 'bosco',
    nombre: 'Saltos: SJ y CMJ',
    disciplina: 'Fuerza',
    mide: 'Fuerza explosiva y muelle del tendón',
    protocolo: 'SJ desde semisentadilla, sin rebote ni brazos. CMJ de pie, bajando rápido a 90 grados y saltando de inmediato, manos en cadera.',
    necesita: ['peso'],
    ojo: 'El SJ es opcional: sin él salen la altura y la potencia del CMJ, pero no el índice de elasticidad ni el EUR, que necesitan los dos saltos.',
    brutos: [
      CAMPO_UNIDAD,
      { clave: 'sj', etiqueta: 'Squat Jump', ayuda: 'Opcional: sin él no hay IE ni EUR' },
      { clave: 'cmj', etiqueta: 'CMJ' },
    ],
    salidas: [
      { clave: 'cmj', etiqueta: 'CMJ', unidad: 'cm', principal: true, calcular: v => altura(v, 'cmj') },
      { clave: 'sj', etiqueta: 'Squat Jump', unidad: 'cm', calcular: v => altura(v, 'sj') },
      {
        clave: 'potenciaCMJ', etiqueta: 'Potencia del CMJ', unidad: 'W',
        calcular: (v, ctx) => potenciaCMJ(altura(v, 'cmj'), ctx.pesoKg),
        leer: (n, ctx) => (n == null && ctx.pesoKg == null
          ? 'Falta el peso corporal: mover 60 kg y 90 kg los mismos centímetros no es la misma potencia.'
          : ''),
      },
      {
        clave: 'ie', etiqueta: 'Índice de elasticidad', unidad: '%',
        calcular: v => indiceElasticidad(altura(v, 'cmj'), altura(v, 'sj')),
        leer: n => leeIE(n),
      },
      {
        clave: 'eur', etiqueta: 'EUR', unidad: '',
        calcular: v => eur(altura(v, 'cmj'), altura(v, 'sj')),
        leer: n => leeEUR(n),
      },
    ],
  },
  {
    clave: 'dropjump',
    nombre: 'Drop Jump',
    disciplina: 'Fuerza',
    mide: 'Reactividad del ciclo estiramiento-acortamiento',
    protocolo: 'Caja de 30-45 cm, caer y rebotar: máxima altura con mínimo contacto.',
    ojo: 'Mide lo rápido que devuelve el suelo, no lo alto que salta. Saltar mucho apoyando medio segundo no es reactividad, es fuerza.',
    brutos: [
      CAMPO_UNIDAD,
      { clave: 'caja', etiqueta: 'Altura de la caja', sufijo: 'cm', delGrupo: true, porDefecto: '40' },
      { clave: 'salto', etiqueta: 'Salto' },
      { clave: 'contacto', etiqueta: 'Tiempo de contacto', sufijo: 'ms' },
    ],
    salidas: [
      {
        clave: 'rsi', etiqueta: 'RSI', unidad: '', principal: true,
        calcular: v => rsi(altura(v, 'salto'), num(v.contacto)),
        leer: n => leeRSI(n),
      },
      { clave: 'salto', etiqueta: 'Altura del salto', unidad: 'cm', calcular: v => altura(v, 'salto') },
    ],
  },
  {
    clave: 'escalera',
    nombre: 'Escalera (Margaria-Kalamen)',
    disciplina: 'Fuerza',
    mide: 'Potencia anaeróbica aláctica',
    protocolo: 'Subida a la escalera cronometrando entre el escalón 3 y el 9.',
    necesita: ['peso'],
    ojo: 'La altura es la que se sube DE VERDAD entre los dos escalones cronometrados, no la del tramo entero.',
    brutos: [
      { clave: 'altura', etiqueta: 'Altura vertical entre sensores', sufijo: 'm', delGrupo: true, porDefecto: '1.02' },
      { clave: 'segundos', etiqueta: 'Tiempo', sufijo: 'seg' },
    ],
    salidas: [{
      clave: 'potencia', etiqueta: 'Potencia', unidad: 'W', principal: true,
      calcular: (v, ctx) => potenciaEscalera(ctx.pesoKg, num(v.altura), num(v.segundos)),
      leer: (n, ctx) => (n == null && ctx.pesoKg == null ? 'Falta el peso corporal en la anamnesis.' : ''),
    }],
  },

  // ---------- §7 Funcionales de triatlón ----------
  {
    clave: 'brick',
    nombre: 'Brick',
    disciplina: 'Triatlón',
    mide: 'Cuánto se le cae la carrera al bajar de la bici',
    protocolo: '40 min de bici al 80 % del FTP, transición y 15 min de carrera al máximo.',
    ojo: 'Los ritmos van en segundos por kilómetro, así que un porcentaje positivo es ir más lento, que es lo normal.',
    brutos: [
      { clave: 'brick', etiqueta: 'Ritmo tras la bici', sufijo: 'seg/km' },
      { clave: 'aislado', etiqueta: 'Ritmo aislado de referencia', sufijo: 'seg/km' },
    ],
    salidas: [{
      clave: 'deterioro', etiqueta: 'Deterioro', unidad: '%', principal: true,
      calcular: v => deterioroBrick(num(v.brick), num(v.aislado)),
      leer: n => leeDeterioro(n)?.texto ?? '',
    }],
  },
  {
    clave: 'decoupling',
    nombre: 'Decoupling (deriva cardiaca)',
    disciplina: 'Triatlón',
    mide: 'Eficiencia aeróbica',
    protocolo: '90 minutos a ritmo o potencia CONSTANTE.',
    ojo: 'A ritmo constante. Si aflojó, la deriva no mide eficiencia aeróbica: mide que aflojó, y entonces el número no dice nada.',
    brutos: [
      { clave: 'primeros', etiqueta: 'FC media de los primeros 20 min', sufijo: 'ppm' },
      { clave: 'ultimos', etiqueta: 'FC media de los últimos 20 min', sufijo: 'ppm' },
    ],
    salidas: [{
      clave: 'deriva', etiqueta: 'Deriva', unidad: '%', principal: true,
      calcular: v => decoupling(num(v.primeros), num(v.ultimos)),
      leer: n => leeDecoupling(n)?.texto ?? '',
    }],
  },

  // ---------- §6 Técnica ----------
  /* Estas tres no se cronometran: salen de MEDIR UN VÍDEO después, con el
     protocolo que da el propio documento. Van juntas por disciplina y no como
     diez tests sueltos porque así es como se hace el trabajo: grabas una vez y
     de ese vídeo sacas las cuatro medidas.

     Lo que las hace útiles no es guardar el número, es la banda al lado. Un
     tiempo de contacto de 260 ms no dice nada solo; «260, y lo de élite son
     200-250» sí. */
  {
    clave: 'tec-carrera',
    nombre: 'Técnica de carrera',
    disciplina: 'Carrera',
    mide: 'Cadencia, contacto, oscilación e inclinación',
    protocolo: PROTOCOLO_VIDEO,
    cada: 'Al inicio de cada bloque, y tras cambiar algo de la técnica',
    brutos: CAMPOS_TEC_CARRERA,
    salidas: [cuantasDentro(CAMPOS_TEC_CARRERA)],
  },
  {
    clave: 'tec-natacion',
    nombre: 'Técnica de natación',
    disciplina: 'Natación',
    mide: 'Frecuencia de brazada',
    protocolo: 'Vídeo de superficie y subacuático. Se cuentan los ciclos por minuto en Kinovea.',
    cada: 'Cada 4-6 semanas: la natación mejora rápido',
    ojo: 'La frecuencia buena depende de la distancia: en sprint se nada más rápido de brazos que en fondo. La banda cubre las dos, así que mírala junto a lo que estaba nadando.',
    brutos: CAMPOS_TEC_NATACION,
    salidas: [cuantasDentro(CAMPOS_TEC_NATACION)],
  },
  {
    clave: 'bikefit',
    nombre: 'Bike fit',
    disciplina: 'Ciclismo',
    mide: 'Ángulos de la posición sobre la bici',
    protocolo: 'Vídeo lateral y frontal pedaleando en Z2. Se miden los ángulos en Kinovea.',
    cada: 'Al cambiar de bici o de posición, y una vez por temporada',
    ojo: 'Los ángulos son de la posición de triatlón. En bici de carretera con manillar normal los rangos son otros.',
    brutos: CAMPOS_BIKEFIT,
    salidas: [cuantasDentro(CAMPOS_BIKEFIT)],
  },
]
/** El test por su clave. */
export function testPorClave(clave: string): TestCampo | undefined {
  return CATALOGO.find(t => t.clave === clave)
}

export const ORDEN_DISCIPLINAS: Disciplina[] = ['Carrera', 'Ciclismo', 'Natación', 'Fuerza', 'Triatlón']

/** Agrupados por disciplina, en el orden de la batería. */
export function porDisciplina(): { disciplina: Disciplina; tests: TestCampo[] }[] {
  return ORDEN_DISCIPLINAS
    .map(d => ({ disciplina: d, tests: CATALOGO.filter(t => t.disciplina === d) }))
    .filter(g => g.tests.length > 0)
}

/** Los campos que se preguntan una sola vez arriba. */
export function camposDeProtocolo(t: TestCampo): CampoBruto[] {
  return t.brutos.filter(c => c.delGrupo)
}

/** Los que cambian de una persona a otra. */
export function camposPorPersona(t: TestCampo): CampoBruto[] {
  return t.brutos.filter(c => !c.delGrupo)
}

/** El protocolo arranca con sus valores por defecto puestos. */
export function protocoloInicial(t: TestCampo): Valores {
  const v: Valores = {}
  for (const c of camposDeProtocolo(t)) v[c.clave] = c.porDefecto ?? ''
  return v
}

export interface Resultado {
  salida: Salida
  valor: number | null
  /** Ya formateado para enseñar. */
  texto: string
  /** La frase que lo interpreta, si la hay. */
  lectura: string
}

/**
 * Todo lo que sale de un test, calculado.
 *
 * Se calcula SIEMPRE que se pide y no se guarda en el estado: así no puede
 * pasar que en pantalla se vea un número y se escriba otro.
 */
export function resultadosDe(t: TestCampo, v: Valores, ctx: Contexto = {}): Resultado[] {
  return t.salidas.map(s => {
    const valor = s.calcular(v, ctx)
    const texto = s.formato
      ? s.formato(valor, v, ctx)
      : valor == null ? '—' : String(valor) + (s.unidad ? ' ' + s.unidad : '')
    return { salida: s, valor, texto, lectura: s.leer?.(valor, ctx) ?? '' }
  })
}

/** El número que encabeza la columna en la vista de grupo. */
export function principalDe(t: TestCampo, v: Valores, ctx: Contexto = {}): Resultado | null {
  const r = resultadosDe(t, v, ctx)
  return r.find(x => x.salida.principal) ?? r[0] ?? null
}

/** ¿Hay algo que guardar? Un test sin ningún resultado no se escribe. */
export function estaCompleto(t: TestCampo, v: Valores, ctx: Contexto = {}): boolean {
  return resultadosDe(t, v, ctx).some(r => r.valor != null && !r.salida.noGuardar)
}

export interface FilaLibre {
  id_deportista: number
  nombre: string
  fecha: string
  resultado: number
  unidad: string
  notas: string | null
}

/**
 * Las filas de `tests_libres` que deja un test.
 *
 * UNA FILA POR RESULTADO, no una por test: la tabla guarda un número con su
 * nombre y su unidad, y un Bosco da cinco números que interesan por separado
 * —la altura del CMJ y el EUR se siguen en el tiempo cada uno por su lado—. El
 * nombre lleva delante el del test para que en el historial se vea de dónde
 * salió cada uno.
 *
 * Los `noGuardar` se quedan fuera: son intermedios que se enseñan para entender
 * el resultado, no cosas que se sigan en el tiempo.
 */
export function filasDeTest(
  t: TestCampo,
  idDeportista: number,
  fecha: string,
  v: Valores,
  ctx: Contexto = {},
  notas?: string,
): FilaLibre[] {
  return resultadosDe(t, v, ctx)
    .filter(r => r.valor != null && !r.salida.noGuardar)
    .map(r => ({
      id_deportista: idDeportista,
      nombre: t.nombre + ' · ' + r.salida.etiqueta,
      fecha,
      resultado: r.valor as number,
      unidad: r.salida.unidad,
      notas: notas?.trim() || null,
    }))
}

// ============================================================
// §9 — Reglas y calendario de testeo
// ============================================================
//
// La batería dedica una sección entera a CUÁNDO testar, y son reglas que se
// incumplen sin darse cuenta: nadie se va a acordar de que quedan dos semanas
// para la carrera A justo cuando está montando un test. Se AVISA, no se impide:
// el entrenador sabrá por qué lo hace.

export interface SituacionDeTesteo {
  /** El test que se va a hacer. */
  test: TestCampo
  /** Qué otros tests ya se le han hecho hoy a esta persona. */
  yaHoy?: TestCampo[]
  /** Días hasta la próxima competición de prioridad A, si se sabe. */
  diasHastaCarreraA?: number | null
  /** Si la semana en curso es de descarga. `null` cuando no se sabe. */
  semanaDeDescarga?: boolean | null
}

export function avisosDeTesteo(s: SituacionDeTesteo): string[] {
  const avisos: string[] = []

  /* «Ningún test máximo en las 3 semanas de tapering.» Todos los de la batería
     son máximos, así que el aviso vale para cualquiera de ellos. */
  if (s.diasHastaCarreraA != null && s.diasHastaCarreraA >= 0 && s.diasHastaCarreraA <= 21) {
    avisos.push(
      'Quedan ' + s.diasHastaCarreraA + ' días para la carrera A: la batería no recomienda tests máximos en las 3 semanas de tapering.',
    )
  }

  /* «No dos disciplinas el mismo día (salvo CSS 400+200).» La excepción es de
     natación, y son dos tramos del mismo test, no dos tests. */
  const otras = Array.from(new Set(
    (s.yaHoy ?? []).map(t => t.disciplina).filter(d => d !== s.test.disciplina),
  ))
  if (otras.length > 0) {
    avisos.push(
      'Hoy ya se ha testado ' + otras.join(' y ') + '. La batería pide no juntar dos disciplinas el mismo día.',
    )
  }

  if (s.semanaDeDescarga === false) {
    avisos.push('Los tests van en semana de descarga, con 24-48 h sin trabajo intenso antes.')
  }

  return avisos
}
