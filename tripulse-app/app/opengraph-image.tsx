import { ImageResponse } from 'next/og'

// ============================================================
// La imagen que sale al compartir el enlace
// ============================================================
// Cuando alguien pega tripulse.app en WhatsApp, Instagram o un correo, eso
// enseña una tarjeta. Sin esta imagen la tarjeta sale con el recuadro gris del
// enlace roto, que es lo último que quieres que vea un entrenador al que te
// acaban de recomendar.
//
// Se dibuja aquí en vez de subir un JPG: así no hay que mantener una imagen a
// mano cada vez que cambie el nombre o la frase, y pesa una décima parte.

export const alt = 'TRIPULSE — Entrenamiento de triatlón y fuerza'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Imagen() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start', justifyContent: 'center',
          backgroundColor: '#030712', padding: '0 90px',
        }}
      >
        <div style={{ display: 'flex', width: 90, height: 6, backgroundColor: '#F97316', marginBottom: 46 }} />
        <div
          style={{
            display: 'flex', fontSize: 132, fontWeight: 700, color: '#ffffff',
            letterSpacing: -4, lineHeight: 1,
          }}
        >
          TRIPULSE
        </div>
        <div style={{ display: 'flex', fontSize: 38, color: '#fdba74', marginTop: 28, lineHeight: 1.3 }}>
          Entrenamiento de triatlón y fuerza
        </div>
        <div style={{ display: 'flex', fontSize: 27, color: '#9ca3af', marginTop: 20, lineHeight: 1.4 }}>
          Planifica la temporada entera y controla la carga real de cada deportista
        </div>
      </div>
    ),
    { ...size },
  )
}
