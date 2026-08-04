import { describe, it, expect, vi, beforeEach } from 'vitest'

// El módulo importa supabase a nivel de módulo (ver el patrón anotado en
// tripulse-analitica-wellness-sicat): sin esto revienta al importarlo sin env vars.
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./sicat-zonas', () => ({ attachZonaPico: async (s: any[]) => s }))

const { construirContextoTexto } = await import('./asistente')

/* Doble de supabase que responde por tabla. Solo `anamnesis` importa aquí; el
   resto devuelve vacío para que las otras secciones del contexto no estorben. */
function fakeSupabase(anamnesis: any) {
  const vacio = { data: [], error: null }
  const cadena = (resultado: any): any => {
    const o: any = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'not', 'in', 'is', 'or']) o[m] = () => o
    o.maybeSingle = async () => resultado
    o.single = async () => resultado
    o.then = (res: any) => res(resultado)
    return o
  }
  return {
    from: (tabla: string) =>
      tabla === 'anamnesis' ? cadena({ data: anamnesis, error: null }) : cadena(vacio),
  }
}

const DEP = { id: 1, nombre: 'Ana' }

const COMPLETA = {
  estado: 'enviada',
  anios_triatlon: 6, nivel_competitivo: 'grupos de edad',
  distancias_completadas: ['olímpico', '70.3'],
  disciplina_fuerte: 'ciclismo', disciplina_debil: 'natación',
  deporte_anterior: 'atletismo',
  volumen_semanal: 10, dias_semana: 5,
  tiene_potenciometro: false, usa_pulsometro: true, mide_hrv: false,
  horas_sueno: 7, nivel_estres: 3,
  prueba_objetivo: 'Triatlón de Vitoria', prueba_fecha: '2026-08-24', prueba_distancia: 'media',
  objetivo_principal: 'bajar de 5 h', mensaje_entrenador: 'vengo de una lumbalgia',
}

describe('El asistente sabe QUIÉN es el atleta, no solo cuánto entrena', () => {
  it('mete el perfil, la capacidad, el objetivo y lo que le dijo al entrenador', async () => {
    const ctx = await construirContextoTexto(fakeSupabase(COMPLETA), DEP)
    expect(ctx).toContain('6 años en triatlón')
    expect(ctx).toContain('flojo en natación')
    expect(ctx).toContain('5 días/semana')
    expect(ctx).toContain('Triatlón de Vitoria')
    expect(ctx).toContain('vengo de una lumbalgia')
  })

  it('dice lo que NO tiene, que es la restricción que de verdad limita el plan', async () => {
    const ctx = await construirContextoTexto(fakeSupabase(COMPLETA), DEP)
    expect(ctx).toMatch(/NO tiene[^\n]*potenciómetro/)
    expect(ctx).toMatch(/tiene pulsómetro/)
  })

  it('sin anamnesis, lo AVISA en vez de callarse', async () => {
    const ctx = await construirContextoTexto(fakeSupabase(null), DEP)
    expect(ctx).toContain('SIN RELLENAR')
  })

  it('enviada pero con la parte de entrenamiento vacía TAMBIÉN avisa', async () => {
    // El caso real que destapó el fallo: estado 'enviada' con todo a null. Si solo
    // se mirase el estado, no habría dato NI aviso: silencio, el peor resultado.
    const ctx = await construirContextoTexto(fakeSupabase({
      estado: 'enviada', anios_triatlon: null, nivel_competitivo: null, dias_semana: null,
      volumen_semanal: null, prueba_objetivo: null, objetivo_principal: null,
      disciplina_debil: null, tiene_potenciometro: null, usa_pulsometro: null,
      distancias_completadas: [],
    }, ), DEP)
    expect(ctx).toContain('SIN la parte de entrenamiento')
    expect(ctx).not.toContain('Perfil del atleta')
  })

  it('en borrador se trata como no rellenada', async () => {
    const ctx = await construirContextoTexto(fakeSupabase({ ...COMPLETA, estado: 'borrador' }), DEP)
    expect(ctx).toMatch(/SIN RELLENAR|SIN la parte de entrenamiento/)
    expect(ctx).not.toContain('6 años en triatlón')
  })

  it('con datos a medias enseña lo que hay y no inventa el resto', async () => {
    const ctx = await construirContextoTexto(fakeSupabase({
      estado: 'enviada', dias_semana: 3, tiene_potenciometro: false,
    }), DEP)
    expect(ctx).toContain('3 días/semana')
    expect(ctx).toMatch(/NO tiene[^\n]*potenciómetro/)
    expect(ctx).not.toContain('Lo que prepara')
  })
})
