import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '../components/Sidebar'
import AsistenteFlotante from '../components/AsistenteFlotante'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
      </body>
    </html>
  )
}
