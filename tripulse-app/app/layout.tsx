import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '../components/Sidebar'
import AsistenteFlotante from '../components/AsistenteFlotante'
import NavDeportista from '../components/NavDeportista'
import CazaErrores from '../components/CazaErrores'

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

export const metadata: Metadata = {
  title: 'TRIPULSE',
  description: 'Plataforma de entrenamiento para triatlon y fuerza',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950`}>
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
