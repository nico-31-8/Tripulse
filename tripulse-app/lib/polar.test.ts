import { describe, it, expect } from 'vitest'
import {
  POLAR, REDIRECT_PRODUCCION, redirectPolar, urlAutorizacion, basicAuth, num, leerToken,
  minutosDeDuracion, disciplinaDePolar, medicionDeSueno, medicionDeRecarga, medicionDeEntreno,
  medicionesDePolar, motivoDeError,
} from './polar'

/* Los ejemplos de respuesta son los de la documentación de Polar
   (https://www.polar.com/accesslink-api/), recortados. */
const NOCHE = {
  polar_user: 'https://www.polaraccesslink/v3/users/1', date: '2020-01-01',
  sleep_start_time: '2020-01-01T00:39:07+03:00', sleep_end_time: '2020-01-01T09:19:37+03:00',
  device_id: '1111AAAA', continuity: 2.1, continuity_class: 2,
  light_sleep: 1000, deep_sleep: 1000, rem_sleep: 1000, unrecognized_sleep_stage: 1000,
  sleep_score: 80, total_interruption_duration: 1000, sleep_charge: 3, sleep_goal: 28800,
}
const RECARGA = {
  polar_user: 'https://www.polaraccesslink/v3/users/1', date: '2020-01-01',
  heart_rate_avg: 70, beat_to_beat_avg: 816, heart_rate_variability_avg: 28,
  breathing_rate_avg: 14.1, nightly_recharge_status: 3, ans_charge: 0, ans_charge_status: 3,
}
const ENTRENO = {
  id: 123, device: 'Polar M400', device_id: '1111AAAA',
  start_time: '2008-10-13T10:40:02', start_time_utc_offset: 180, duration: 'PT2H44M',
  calories: 530, distance: 1600, heart_rate: { average: 129, maximum: 147 },
  training_load: 143.22, sport: 'OTHER', detailed_sport_info: 'WATERSPORTS_WATERSKI',
}

describe('redirectPolar', () => {
  it('en producción usa SIEMPRE la registrada, entre por el dominio que entre', () => {
    expect(redirectPolar('https://tripulse-eight.vercel.app')).toBe(REDIRECT_PRODUCCION)
    expect(redirectPolar('https://otro-dominio.example.com')).toBe(REDIRECT_PRODUCCION)
  })
  it('en local, la de localhost con su puerto', () => {
    expect(redirectPolar('http://localhost:3000')).toBe('http://localhost:3000/api/relojes/polar/callback')
  })
  it('una forzada por variable de entorno manda sobre todo', () => {
    expect(redirectPolar('http://localhost:3000', ' https://x.test/cb ')).toBe('https://x.test/cb')
  })
  it('un origen roto no tumba la conexión', () => {
    expect(redirectPolar('esto no es una url')).toBe(REDIRECT_PRODUCCION)
  })
  it('la de producción no lleva barra al final: Polar compara carácter a carácter', () => {
    expect(REDIRECT_PRODUCCION.endsWith('/')).toBe(false)
  })
})

describe('urlAutorizacion', () => {
  const u = new URL(urlAutorizacion('mi-cliente', REDIRECT_PRODUCCION, 'abc123'))
  it('apunta a Polar Flow', () => expect(u.origin + u.pathname).toBe(POLAR.autorizar))
  it('lleva todo lo que pide el flujo de código', () => {
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('client_id')).toBe('mi-cliente')
    expect(u.searchParams.get('redirect_uri')).toBe(REDIRECT_PRODUCCION)
    expect(u.searchParams.get('scope')).toBe('accesslink.read_all')
  })
  it('lleva el estado, que es lo que impide que otro cuele su cuenta en la tuya', () => {
    expect(u.searchParams.get('state')).toBe('abc123')
  })
})

describe('basicAuth', () => {
  it('es el ejemplo exacto de la documentación de Polar', () => {
    expect(basicAuth('12345', 'verySecret')).toBe('Basic MTIzNDU6dmVyeVNlY3JldA==')
  })
})

describe('num', () => {
  /* EL CLÁSICO DE ESTE PROYECTO: Number(null) es 0, y una HRV de 0 es un dato
     falso que el motor leería como el peor día del atleta. */
  it('null, undefined y vacío NO son cero', () => {
    expect(num(null)).toBeNull()
    expect(num(undefined)).toBeNull()
    expect(num('')).toBeNull()
  })
  it('un cero de verdad sí es cero', () => expect(num(0)).toBe(0))
  it('acepta números en texto', () => expect(num('14.1')).toBe(14.1))
  it('lo que no es un número es null', () => {
    expect(num('abc')).toBeNull()
    expect(num(NaN)).toBeNull()
    expect(num(Infinity)).toBeNull()
    expect(num(true)).toBeNull()
  })
})

describe('leerToken', () => {
  const ahora = new Date('2026-09-10T10:00:00Z')
  it('saca el token, el usuario de Polar y cuándo caduca', () => {
    const t = leerToken({ access_token: 'tok', token_type: 'bearer', expires_in: 3600, x_user_id: 10523 }, ahora)
    expect(t).toEqual({ accessToken: 'tok', idExterno: '10523', caducaEn: '2026-09-10T11:00:00.000Z' })
  })
  it('un token de un año caduca dentro de un año', () => {
    const t = leerToken({ access_token: 'tok', expires_in: 31535999, x_user_id: 1 }, ahora)!
    expect(t.caducaEn!.slice(0, 10)).toBe('2027-09-10')
  })
  it('sin caducidad, no se inventa una', () => {
    expect(leerToken({ access_token: 'tok', x_user_id: 1 }, ahora)!.caducaEn).toBeNull()
  })
  it('sin token o sin usuario no hay nada que guardar', () => {
    expect(leerToken({ x_user_id: 1 })).toBeNull()
    expect(leerToken({ access_token: 'tok' })).toBeNull()
    expect(leerToken({ error: 'invalid_grant' })).toBeNull()
    expect(leerToken(null)).toBeNull()
  })
})

describe('minutosDeDuracion', () => {
  it('lee las duraciones de Polar', () => {
    expect(minutosDeDuracion('PT2H44M')).toBe(164)
    expect(minutosDeDuracion('PT1H')).toBe(60)
    expect(minutosDeDuracion('PT45M')).toBe(45)
  })
  it('redondea al minuto, como se guarda la duración real', () => {
    expect(minutosDeDuracion('PT45M30S')).toBe(46)
    expect(minutosDeDuracion('PT45M29S')).toBe(45)
    expect(minutosDeDuracion('PT1H2M3.5S')).toBe(62)
  })
  it('entiende días, por si un ultra los trae', () => {
    expect(minutosDeDuracion('P1DT2H')).toBe(1560)
  })
  it('lo que no es una duración es null, no cero', () => {
    for (const x of [null, undefined, '', 'P', 'PT', '2H44M', 'hola', 164]) expect(minutosDeDuracion(x)).toBeNull()
  })
})

describe('disciplinaDePolar', () => {
  it('carrera, en todas sus formas', () => {
    for (const d of ['RUNNING', 'TRAIL_RUNNING', 'TREADMILL_RUNNING', 'ROAD_RUNNING']) expect(disciplinaDePolar(null, d)).toBe('Carrera')
  })
  it('ciclismo, en todas sus formas', () => {
    for (const d of ['CYCLING', 'ROAD_BIKING', 'MOUNTAIN_BIKING', 'INDOOR_CYCLING']) expect(disciplinaDePolar(null, d)).toBe('Ciclismo')
  })
  it('natación, de piscina y de aguas abiertas', () => {
    expect(disciplinaDePolar(null, 'POOL_SWIMMING')).toBe('Natacion')
    expect(disciplinaDePolar(null, 'OPEN_WATER_SWIMMING')).toBe('Natacion')
  })
  it('fuerza', () => expect(disciplinaDePolar(null, 'STRENGTH_TRAINING')).toBe('Fuerza'))
  it('el detalle manda sobre el deporte general', () => {
    expect(disciplinaDePolar('OTHER', 'ROAD_BIKING')).toBe('Ciclismo')
  })
  it('sin detalle, se mira el deporte', () => {
    expect(disciplinaDePolar('RUNNING', null)).toBe('Carrera')
  })
  /* Lo que no es ninguna de las cuatro NO se mete en la que se parezca: un
     triatlón contado como carrera ensuciaría la carga de carrera. */
  it('lo que no reconoce devuelve null en vez de adivinar', () => {
    for (const d of ['OTHER', 'WATERSPORTS_WATERSKI', 'TRIATHLON', 'CROSS_COUNTRY_SKIING', 'YOGA']) {
      expect(disciplinaDePolar(d, d)).toBeNull()
    }
    expect(disciplinaDePolar(null, null)).toBeNull()
  })
  it('las disciplinas salen escritas como en la base (Natacion, sin tilde)', () => {
    expect(['Carrera', 'Ciclismo', 'Natacion', 'Fuerza']).toContain(disciplinaDePolar(null, 'POOL_SWIMMING'))
  })
})

describe('medicionDeSueno', () => {
  const m = medicionDeSueno(NOCHE)!
  it('va al día de la noche, y ese día es su identificador', () => {
    expect(m.tipo).toBe('sueno')
    expect(m.fecha).toBe('2020-01-01')
    expect(m.id_externo).toBe('2020-01-01')
  })
  /* Las fases vienen en SEGUNDOS: 4 × 1000 s = 4000 s ≈ 67 min. */
  it('el sueño real es la suma de las fases, sin las interrupciones', () => {
    expect(m.datos.dormido_min).toBe(67)
    expect(m.datos.interrupciones_min).toBe(17)
  })
  it('guarda la puntuación y las horas de acostarse y levantarse', () => {
    expect(m.datos.puntuacion).toBe(80)
    expect(m.datos.inicio).toBe('2020-01-01T00:39:07+03:00')
  })
  it('sin fases, el sueño real es null y no cero', () => {
    const s = medicionDeSueno({ date: '2020-01-01' })!
    expect(s.datos.dormido_min).toBeNull()
  })
  it('sin fecha válida no se guarda', () => {
    expect(medicionDeSueno({ ...NOCHE, date: '01/01/2020' })).toBeNull()
    expect(medicionDeSueno(null)).toBeNull()
  })
})

describe('medicionDeRecarga', () => {
  const m = medicionDeRecarga(RECARGA)!
  it('la HRV se guarda con su nombre de verdad: RMSSD en milisegundos', () => {
    expect(m.datos.rmssd_ms).toBe(28)
    expect('hrv' in m.datos).toBe(false)
  })
  it('la FC es la media nocturna, y se llama así, no «reposo»', () => {
    expect(m.datos.fc_media).toBe(70)
    expect('fc_reposo' in m.datos).toBe(false)
  })
  it('una noche sin HRV no se convierte en HRV cero', () => {
    const s = medicionDeRecarga({ date: '2020-01-01', heart_rate_avg: 55 })!
    expect(s.datos.rmssd_ms).toBeNull()
    expect(s.datos.fc_media).toBe(55)
  })
  it('un carga del sistema nervioso de 0 es un 0 de verdad', () => {
    expect(m.datos.carga_sna).toBe(0)
  })
})

describe('medicionDeEntreno', () => {
  const m = medicionDeEntreno(ENTRENO)!
  it('su identificador es el id de Polar, en texto', () => expect(m.id_externo).toBe('123'))
  it('la duración en minutos', () => expect(m.datos.duracion_min).toBe(164))
  it('la FC media y máxima', () => {
    expect(m.datos.fc_media).toBe(129)
    expect(m.datos.fc_max).toBe(147)
  })
  it('un deporte que no es de los nuestros queda sin disciplina, pero se guarda', () => {
    expect(m.datos.disciplina).toBeNull()
    expect(m.datos.deporte_detalle).toBe('WATERSPORTS_WATERSKI')
  })
  /* La hora llega en LOCAL. Un entreno a las 23:30 es de ese día para el
     atleta; pasarlo a UTC lo mandaría al siguiente. */
  it('la fecha es la del día local en que se entrenó', () => {
    const noche = medicionDeEntreno({ ...ENTRENO, start_time: '2026-09-09T23:30:00', start_time_utc_offset: 120 })!
    expect(noche.fecha).toBe('2026-09-09')
  })
  it('sin id o sin hora de inicio no se guarda', () => {
    expect(medicionDeEntreno({ ...ENTRENO, id: undefined })).toBeNull()
    expect(medicionDeEntreno({ ...ENTRENO, start_time: undefined })).toBeNull()
  })
  it('sin frecuencia cardiaca, nulls y no ceros', () => {
    const s = medicionDeEntreno({ ...ENTRENO, heart_rate: undefined })!
    expect(s.datos.fc_media).toBeNull()
    expect(s.datos.fc_max).toBeNull()
  })
})

describe('medicionesDePolar', () => {
  it('junta las tres respuestas con la forma que tiene cada una', () => {
    const r = medicionesDePolar({
      sueno: { nights: [NOCHE] },
      recarga: { recharges: [RECARGA] },
      entrenos: [ENTRENO],
    })
    expect(r.map(x => x.tipo)).toEqual(['sueno', 'recarga', 'entreno'])
  })
  it('una respuesta vacía (Polar contesta 204) no rompe nada', () => {
    expect(medicionesDePolar({ sueno: {}, recarga: undefined, entrenos: null })).toEqual([])
  })
  it('lo que no se entiende se descarta sin tumbar lo demás', () => {
    const r = medicionesDePolar({ sueno: { nights: [NOCHE, { date: 'mal' }, null] } })
    expect(r).toHaveLength(1)
  })
})

describe('motivoDeError', () => {
  /* El que importa: permiso dado pero consentimientos sin aceptar. Sin este
     mensaje la app diría «conectado» y nunca llegaría nada. */
  it('el 403 manda a aceptar los consentimientos', () => {
    expect(motivoDeError(403)).toMatch(/account\.polar\.com/)
  })
  it('el 401 pide volver a conectar', () => expect(motivoDeError(401)).toMatch(/vuelve a conectar/))
  it('cualquier otro dice el código, no se lo calla', () => expect(motivoDeError(418)).toMatch(/418/))
})
