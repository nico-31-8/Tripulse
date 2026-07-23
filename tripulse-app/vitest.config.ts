import { defineConfig } from 'vitest/config'

// Tests unitarios de la lógica pura de lib/ (cálculos de zonas, ritmos, pacing).
// Entorno node: no tocan React ni el DOM ni Supabase.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
