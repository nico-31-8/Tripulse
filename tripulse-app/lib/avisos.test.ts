import { describe, it, expect } from 'vitest'
import {
  momentoDe, seEnsena, textoDe, avisoVigente,
  queLeFaltaAlMensaje, filaDeSugerencia, mandarSugerencia, type Aviso,
} from './avisos'

const aviso = (desde: string, hasta: string): Aviso => ({ mensaje: 'Actualización', desde, hasta })

const A = aviso('2026-08-28T23:00:00Z', '2026-08-28T23:30:00Z')
const antes = new Date('2026-08-28T18:00:00Z')
const durante = new Date('2026-08-28T23:10:00Z')
const despues = new Date('2026-08-29T09:00:00Z')

describe('los tres momentos de un aviso', () => {
  it('antes de la ventana es un anuncio', () => {
    expect(momentoDe(A, antes)).toBe('anuncio')
  })

  it('dentro de la ventana está en curso', () => {
    expect(momentoDe(A, durante)).toBe('en curso')
  })

  /* Lo importante: se apaga solo. Un cartel de mantenimiento que se queda
     puesto es peor que no ponerlo, porque la próxima vez ya nadie lo cree. */
  it('después ha pasado y deja de enseñarse', () => {
    expect(momentoDe(A, despues)).toBe('pasado')
    expect(seEnsena(A, despues)).toBe(false)
  })

  it('se enseña antes y durante', () => {
    expect(seEnsena(A, antes)).toBe(true)
    expect(seEnsena(A, durante)).toBe(true)
  })

  it('justo al empezar ya está en curso, no anunciándose', () => {
    expect(momentoDe(A, new Date('2026-08-28T23:00:00Z'))).toBe('en curso')
  })

  it('justo al terminar todavía cuenta como en curso', () => {
    expect(momentoDe(A, new Date('2026-08-28T23:30:00Z'))).toBe('en curso')
  })

  it('sin aviso no hay momento, y no revienta', () => {
    expect(momentoDe(null)).toBe(null)
    expect(seEnsena(undefined)).toBe(false)
  })

  it('unas fechas rotas no se enseñan como si fueran válidas', () => {
    expect(momentoDe(aviso('vaya', 'peor'))).toBe(null)
    expect(seEnsena(aviso('vaya', 'peor'))).toBe(false)
  })
})

describe('lo que dice el cartel', () => {
  /* Antes y durante no se dice lo mismo: antes importa cuándo empieza, durante
     importa cuándo vuelve. */
  it('antes anuncia la franja', () => {
    const t = textoDe(A, antes)
    expect(t).toMatch(/mantenimiento/)
    expect(t).toMatch(/ a /)
  })

  it('durante dice cuándo vuelve, no cuándo empezó', () => {
    const t = textoDe(A, durante)
    expect(t).toMatch(/actualizando/i)
    expect(t).toMatch(/vuelve a estar lista/i)
  })

  it('cuando ya pasó no dice nada', () => {
    expect(textoDe(A, despues)).toBe('')
  })
})

describe('cuál de varios avisos manda', () => {
  it('el que empieza antes', () => {
    const tarde = aviso('2026-08-30T23:00:00Z', '2026-08-30T23:30:00Z')
    expect(avisoVigente([tarde, A], antes)!.desde).toBe(A.desde)
  })

  it('los caducados no cuentan', () => {
    const viejo = aviso('2026-08-01T23:00:00Z', '2026-08-01T23:30:00Z')
    expect(avisoVigente([viejo], antes)).toBe(null)
  })

  it('sin ninguno, null', () => {
    expect(avisoVigente([], antes)).toBe(null)
    expect(avisoVigente(null, antes)).toBe(null)
  })
})

describe('el buzón', () => {
  it('un mensaje vacío no se manda', () => {
    expect(queLeFaltaAlMensaje('   ')).toMatch(/qué ha pasado/i)
  })

  it('«no va» no es un mensaje que se pueda contestar', () => {
    expect(queLeFaltaAlMensaje('no va')).toMatch(/un poco más/i)
  })

  it('con algo de detalle, adelante', () => {
    expect(queLeFaltaAlMensaje('El botón de guardar no hace nada')).toBe(null)
  })

  /* La pantalla la pone la app: pedírsela a la persona es pedirle un trabajo
     que se puede hacer solo. */
  it('la fila lleva la pantalla y el remitente', () => {
    const f = filaDeSugerencia({ idPerfil: 'u1', tipo: 'error', texto: '  falla el guardado  ', pantalla: '/apuntar' })
    expect(f).toMatchObject({ id_perfil: 'u1', tipo: 'error', pantalla: '/apuntar' })
    expect(f.texto).toBe('falla el guardado')
  })

  it('un agente kilométrico se recorta', () => {
    const f = filaDeSugerencia({ idPerfil: 'u1', tipo: 'error', texto: 'algo falla aquí', agente: 'x'.repeat(500) })
    expect(f.agente!.length).toBe(200)
  })

  it('sin pantalla ni agente van null, no cadenas vacías', () => {
    const f = filaDeSugerencia({ idPerfil: 'u1', tipo: 'sugerencia', texto: 'estaría bien un modo oscuro' })
    expect(f.pantalla).toBe(null)
    expect(f.agente).toBe(null)
  })

  it('no llega a la base si el texto no vale', async () => {
    let llamado = false
    const sb = { from: () => ({ insert: async () => { llamado = true; return { error: null } } }) }
    expect(await mandarSugerencia(sb, { idPerfil: 'u1', tipo: 'error', texto: 'no' })).toBeTruthy()
    expect(llamado).toBe(false)
  })

  it('si falta la tabla, lo dice en cristiano', async () => {
    const sb = { from: () => ({ insert: async () => ({ error: { message: 'relation "sugerencia" does not exist' } }) }) }
    const r = await mandarSugerencia(sb, { idPerfil: 'u1', tipo: 'error', texto: 'el guardado falla' })
    expect(r).toMatch(/no está preparado/i)
  })

  it('cuando entra, no devuelve error', async () => {
    const sb = { from: () => ({ insert: async () => ({ error: null }) }) }
    expect(await mandarSugerencia(sb, { idPerfil: 'u1', tipo: 'error', texto: 'el guardado falla' })).toBe(null)
  })
})
