import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/* Cabeceras de seguridad.
   Antes no había ninguna, y eso significaba tres cosas concretas:

   · Cualquier web podía meter TRIPULSE dentro de un iframe y presentarla como
     suya, con tu formulario de login dentro. Es el clickjacking de manual.
   · El navegador adivinaba el tipo de cada fichero en vez de fiarse del que le
     dices, que es como un .txt acaba ejecutándose como script.
   · La URL completa de la app viajaba como referrer a cualquier enlace externo,
     y aquí las URLs llevan ids de deportista y de sesión.

   La Content-Security-Policy, que es la que de verdad protege, va aparte justo
   debajo: puesta a ciegas rompe media app, y tiene su propia historia. */
/* ============================================================
   La Content-Security-Policy
   ============================================================
   Dice a qué sitios puede pedir cosas la página. Su valor aquí no es tanto
   frenar un XSS —React escapa todo y no hay ni un dangerouslySetInnerHTML—
   como acotar el daño si alguna vez lo hubiera: aunque colaran un script, solo
   podría hablar con Supabase y Sentry, no mandarse los datos a otro sitio.

   BLOQUEA EN PRODUCCIÓN DESDE EL 11/09/2026. Estuvo dos semanas en modo
   informe (avisa pero no bloquea). Antes de activarla se recorrieron 34
   pantallas del entrenador en producción —lienzo, vídeos de YouTube, chat en
   tiempo real incluidos— con un escuchador de `securitypolicyviolation`:
   cero avisos. OJO si hay que repetirlo: la herramienta que lee la consola NO
   enseña estos avisos; el escuchador sí.

   En desarrollo sigue en modo informe: el servidor de pruebas y sus
   herramientas cargan cosas que en producción no existen.

   Lo que bloquee se manda a Sentry (report-uri, abajo). Una CSP que rompe
   algo lo rompe en silencio —las cosas dejan de cargar y ya—, así que sin ese
   aviso nadie se enteraría. Si aparece ahí algo legítimo, se añade su sitio a
   la directiva que diga el aviso.

   SIGUE 'unsafe-inline' EN LOS SCRIPTS, Y HAY QUE SABERLO.
   Next mete scripts en línea para hidratar la página. Quitarlo exige nonces,
   que en App Router necesitan un middleware —que esta app no tiene— y que
   además fueron el objeto de uno de los avisos de seguridad que acabamos de
   parchear. Con 'unsafe-inline' la CSP no es un escudo completo contra XSS; lo
   que sí aporta es todo lo demás de esta lista. */
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_WS = SUPABASE.replace(/^https:/, 'wss:')

/* Dónde avisa el navegador de lo que bloquea: el buzón de seguridad de Sentry.
   Sale del mismo DSN de instrumentation-client.ts, que es público (viaja en el
   navegador de todos). Los avisos salen en Sentry como incidencias «CSP». */
const INFORMES_CSP =
  'https://o4511786618322944.ingest.de.sentry.io/api/4511786635296848/security/?sentry_key=b0cfeb61b855b7a7e23d53749c3b0611'

/* Bloquea solo en producción y solo si sabe dónde está Supabase: sin esa
   variable, connect-src dejaría fuera la base de datos y la app entera se
   quedaría en blanco. Mejor seguir avisando que tumbarla. */
const CSP_BLOQUEA = process.env.NODE_ENV === 'production' && SUPABASE.startsWith('https://')

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  /* Tailwind y Next inyectan estilos en línea. Aquí el riesgo es mucho menor
     que en los scripts: un estilo no ejecuta código. */
  "style-src 'self' 'unsafe-inline'",
  /* Las fuentes las sirve Next desde el propio dominio (next/font las descarga
     en el build), así que no hace falta abrir ningún host de fuentes. */
  "font-src 'self' data:",
  /* Los avatares y los logos de club son URLs que pega la gente, así que no se
     pueden enumerar. `https:` deja pasar cualquier imagen por HTTPS, que para
     una imagen es aceptable: lo que no queremos es que se carguen SCRIPTS de
     cualquier sitio, y eso ya está cerrado arriba. */
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${SUPABASE} ${SUPABASE_WS} https://*.ingest.de.sentry.io`,
  /* Los vídeos de los ejercicios se ven incrustados desde YouTube. */
  "frame-src https://www.youtube.com https://youtube.com",
  /* Que NADIE pueda meter TRIPULSE dentro de su web. Es lo mismo que dice
     X-Frame-Options, pero esta es la versión que entienden los navegadores
     modernos y admite matices. */
  "frame-ancestors 'none'",
  /* Sin plugins y sin poder reescribir la base de las URLs relativas. */
  "object-src 'none'",
  "base-uri 'self'",
  /* Un formulario de la app solo puede enviarse a la app. Si colaran uno, no
     podría mandar lo escrito a otro servidor. */
  "form-action 'self'",
  `report-uri ${INFORMES_CSP}`,
].join('; ')

const CABECERAS = [
  { key: CSP_BLOQUEA ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  /* Ni cámara, ni micrófono, ni ubicación: la app no usa ninguna. Declararlo
     impide que un script de terceros los pida en tu nombre. */
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  /* HSTS lo pone Vercel, pero decirlo aquí también lo deja escrito en el repo
     y cubre cualquier otro sitio donde se despliegue. */
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  images: {
    domains: ["images.unsplash.com"],
  },
  experimental: {
    optimizePackageImports: ['recharts'],
  },
  async headers() {
    return [{ source: '/:path*', headers: CABECERAS }]
  },
};

export default withSentryConfig(nextConfig, {
  org: "tripulse",
  project: "javascript-nextjs",
  // Sin ruido en el build local; los logs solo en CI.
  silent: !process.env.CI,
  // Sube los source maps solo si hay SENTRY_AUTH_TOKEN (para trazas legibles en
  // producción). Sin token, no se suben pero el build no falla.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
