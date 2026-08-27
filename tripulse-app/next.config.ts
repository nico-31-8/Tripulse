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

   NO ESTÁ LA CONTENT-SECURITY-POLICY, y es a propósito. Es la que de verdad
   protege, pero puesta a ciegas rompe media app: Sentry, Supabase, las fuentes
   y los gráficos cargan cosas que habría que enumerar una a una. Esa merece su
   propio rato midiendo qué pide cada pantalla, no una línea copiada. */
/* ============================================================
   La Content-Security-Policy
   ============================================================
   Dice a qué sitios puede pedir cosas la página. Su valor aquí no es tanto
   frenar un XSS —React escapa todo y no hay ni un dangerouslySetInnerHTML—
   como acotar el daño si alguna vez lo hubiera: aunque colaran un script, solo
   podría hablar con Supabase y Sentry, no mandarse los datos a otro sitio.

   VA EN MODO INFORME (Report-Only) DE MOMENTO.
   El navegador comprueba la política y avisa en la consola de lo que habría
   bloqueado, pero no bloquea nada. Una CSP mal ajustada rompe la app entera y
   además de una forma difícil de diagnosticar: las cosas simplemente dejan de
   cargar. Primero se mira qué se queja, y cuando esté limpia se cambia el
   nombre de la cabecera a la de verdad.

   SIGUE 'unsafe-inline' EN LOS SCRIPTS, Y HAY QUE SABERLO.
   Next mete scripts en línea para hidratar la página. Quitarlo exige nonces,
   que en App Router necesitan un middleware —que esta app no tiene— y que
   además fueron el objeto de uno de los avisos de seguridad que acabamos de
   parchear. Con 'unsafe-inline' la CSP no es un escudo completo contra XSS; lo
   que sí aporta es todo lo demás de esta lista. */
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_WS = SUPABASE.replace(/^https:/, 'wss:')

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
].join('; ')

const CABECERAS = [
  /* Cuando lleve un tiempo sin quejarse, esta clave pasa a
     'Content-Security-Policy' a secas y empieza a bloquear de verdad. */
  { key: 'Content-Security-Policy-Report-Only', value: CSP },
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
