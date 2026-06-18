path = "/workspaces/Tripulse/tripulse-app/app/fuerza/page.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Añadir función helper para detectar Shorts, justo después de getYoutubeId
old_func_end = """  const getYoutubeId = (url: string) => {
    const match = url.match(/(?:youtube\\.com\\/(?:watch\\?v=|shorts\\/|embed\\/|live\\/|v\\/)|youtu\\.be\\/)([^&\\n?#/]+)/)
    return match ? match[1] : null
  }"""

new_func_end = """  const getYoutubeId = (url: string) => {
    const match = url.match(/(?:youtube\\.com\\/(?:watch\\?v=|shorts\\/|embed\\/|live\\/|v\\/)|youtu\\.be\\/)([^&\\n?#/]+)/)
    return match ? match[1] : null
  }

  const esYoutubeShort = (url: string) => {
    return /youtube\\.com\\/shorts\\//.test(url)
  }"""

if old_func_end not in content:
    print("⚠️ NOT FOUND: función getYoutubeId")
else:
    content = content.replace(old_func_end, new_func_end, 1)
    print("✅ helper esYoutubeShort añadido")

# 2. Modificar el render del modal para mostrar botón si es Short
old_render = """              {getYoutubeId(modalVideo) ? (
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
              )}"""

new_render = """              {esYoutubeShort(modalVideo) ? (
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
              )}"""

if old_render not in content:
    print("⚠️ NOT FOUND: bloque render iframe")
else:
    content = content.replace(old_render, new_render, 1)
    print("✅ render modal actualizado")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
