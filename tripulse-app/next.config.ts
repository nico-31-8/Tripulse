import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    domains: ["images.unsplash.com"],
  },
  experimental: {
    optimizePackageImports: ['recharts'],
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
