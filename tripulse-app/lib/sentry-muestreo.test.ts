import { describe, it, expect, vi, afterEach } from 'vitest'

describe('MUESTREO_TRAZAS', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('en producción mide una parte de las visitas, no todas', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { MUESTREO_TRAZAS } = await import('./sentry-muestreo')
    expect(MUESTREO_TRAZAS).toBeGreaterThan(0)
    expect(MUESTREO_TRAZAS).toBeLessThan(1)
  })

  it('en desarrollo no mide nada', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { MUESTREO_TRAZAS } = await import('./sentry-muestreo')
    expect(MUESTREO_TRAZAS).toBe(0)
  })
})
