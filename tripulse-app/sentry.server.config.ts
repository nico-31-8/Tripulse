// Inicialización de Sentry en el SERVIDOR (Node runtime). El DSN es público
// (identifica el proyecto, no da acceso), por eso va en claro.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://b0cfeb61b855b7a7e23d53749c3b0611@o4511786618322944.ingest.de.sentry.io/4511786635296848',
  // Muestreo de trazas de rendimiento (1.0 = 100%). Bajar en producción con volumen.
  tracesSampleRate: 1.0,
  // No enviar datos personales (IP, cookies…) por defecto.
  sendDefaultPii: false,
  ignoreErrors: ['Lock was stolen by another request'],
})
