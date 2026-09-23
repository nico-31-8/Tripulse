import type { Metadata } from 'next'
import { SITIO } from '@/lib/sitio'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '../components/Sidebar'
import AsistenteFlotante from '../components/AsistenteFlotante'
import NavDeportista from '../components/NavDeportista'
import CazaErrores from '../components/CazaErrores'
import AvisoMantenimiento from '../components/AvisoMantenimiento'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

// `preload: false`: la mono solo se usa en sitios puntuales (códigos de invitación,
// el código del entrenador). Precargándola, el navegador la descargaba en todas las
// páginas y avisaba de que la había pedido sin llegar a usarla. Ahora se carga
// cuando de verdad hace falta.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  preload: false,
})

/* Lo que ve Google y lo que sale al compartir el enlace.

   `metadataBase` es la que convierte las rutas relativas de aquí abajo en
   direcciones completas. Sin ella, la imagen de compartir se manda como
   «/opengraph-image» a secas y ni WhatsApp ni Google saben de dónde bajarla.

   El título llevaba «triatlon» sin tilde, y es lo primero que se lee en el
   buscador. */
export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: {
    default: 'TRIPULSE — Entrenamiento de triatlón y fuerza',
    /* Las pantallas de dentro que pongan título saldrán como «Sesión · TRIPULSE». */
    template: '%s · TRIPULSE',
  },
  description: 'Planifica la temporada entera de tus deportistas —natación, ciclismo, carrera y fuerza— y controla su carga real día a día.',
  applicationName: 'TRIPULSE',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: SITIO,
    siteName: 'TRIPULSE',
    title: 'TRIPULSE — Entrenamiento de triatlón y fuerza',
    description: 'Planifica la temporada entera de tus deportistas y controla su carga real día a día.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TRIPULSE — Entrenamiento de triatlón y fuerza',
    description: 'Planifica la temporada entera de tus deportistas y controla su carga real día a día.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950`}>
        {/* Arriba del todo y en TODAS las pantallas, incluida la de entrar: es
            contra la que se choca cuando la app está caída. Se apaga solo. */}
        <AvisoMantenimiento />
        <Sidebar />
        {children}
        {/* El asistente vive en todos los módulos. Él decide si aparece: solo para
            el entrenador y fuera de las pantallas públicas. */}
        <AsistenteFlotante />
        {/* Barra inferior del deportista en móvil. Decide sola si aparece. */}
        <NavDeportista />
        {/* Manda los errores no capturados a evento_app, para verlos en /admin. */}
        <CazaErrores />
      </body>
    </html>
  )
}
