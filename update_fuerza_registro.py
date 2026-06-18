path = "/workspaces/Tripulse/tripulse-app/app/sesion/[id]/ejecutar/FuerzaRegistro.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Header: añadir useState import y helpers de YouTube
old_header = """'use client'

function segAMmss(seg: number): string {
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return min + ':' + String(s).padStart(2, '0')
}"""

new_header = """'use client'
import { useState } from 'react'

function segAMmss(seg: number): string {
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return min + ':' + String(s).padStart(2, '0')
}

function getYoutubeId(url: string) {
  const match = url.match(/(?:youtube\\.com\\/(?:watch\\?v=|shorts\\/|embed\\/|live\\/|v\\/)|youtu\\.be\\/)([^&\\n?#/]+)/)
  return match ? match[1] : null
}

function esYoutubeShort(url: string) {
  return /youtube\\.com\\/shorts\\//.test(url)
}"""

if old_header not in content:
    print("⚠️ NOT FOUND: header")
else:
    content = content.replace(old_header, new_header, 1)
    print("✅ 1/4 header actualizado")

# 2. Añadir estado modalVideo al inicio del componente
old_body_start = """}) {
  if (!ejercicios.length) return ("""

new_body_start = """}) {
  const [modalVideo, setModalVideo] = useState<string | null>(null)

  if (!ejercicios.length) return ("""

if old_body_start not in content:
    print("⚠️ NOT FOUND: inicio body")
else:
    content = content.replace(old_body_start, new_body_start, 1)
    print("✅ 2/4 estado modalVideo añadido")

# 3. Reemplazar el botón <a> por botón que abre el modal
old_button = """              {ej.url_video && (
                <a href={ej.url_video} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 bg-red-900 hover:bg-red-800 text-red-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                  <span>▶</span> Ver vídeo
                </a>
              )}"""

new_button = """              {ej.url_video && (
                <button onClick={() => setModalVideo(ej.url_video)}
                  className="inline-flex items-center gap-1.5 mt-2 bg-red-900 hover:bg-red-800 text-red-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                  <span>▶</span> Ver vídeo
                </button>
              )}"""

if old_button not in content:
    print("⚠️ NOT FOUND: botón ver vídeo")
else:
    content = content.replace(old_button, new_button, 1)
    print("✅ 3/4 botón actualizado")

# 4. Añadir el modal justo antes del cierre final del componente
old_end = """      })}
    </div>
  )
}"""

new_end = """      })}

      {modalVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-2xl border border-gray-700">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <p className="font-medium">Video del ejercicio</p>
              <button onClick={() => setModalVideo(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-4">
              {esYoutubeShort(modalVideo) ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <p className="text-gray-400 text-sm text-center">
                    Este vídeo es un Short de YouTube y no se puede mostrar dentro de la app.
                  </p>
                  <a href={modalVideo} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg text-sm font-medium transition">
                    <span>▶</span> Abrir en YouTube
                  </a>
                </div>
              ) : getYoutubeId(modalVideo) ? (
                <iframe
                  width="100%" height="360"
                  src={`https://www.youtube.com/embed/${getYoutubeId(modalVideo)}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="rounded-lg"
                />
              ) : (
                <p className="text-gray-400 text-center py-8">URL de video no válida</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}"""

if old_end not in content:
    print("⚠️ NOT FOUND: cierre componente")
else:
    content = content.replace(old_end, new_end, 1)
    print("✅ 4/4 modal añadido")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
