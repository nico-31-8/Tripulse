// Inicialización de Sentry en el EDGE runtime (middleware, rutas edge).
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://b0cfeb61b855b7a7e23d53749c3b0611@o4511786618322944.ingest.de.sentry.io/4511786635296848',
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
})
