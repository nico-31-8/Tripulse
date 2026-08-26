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
const CABECERAS = [
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
