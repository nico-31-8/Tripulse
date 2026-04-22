export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-2">TRIPULSE</h1>
        <p className="text-gray-400 text-lg mb-8">Plataforma de entrenamiento para triatlón y fuerza</p>
        <div className="flex gap-4 justify-center">
          <a href="/login" className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium transition">
            Entrar
          </a>
          <a href="/registro" className="border border-gray-600 text-gray-300 hover:border-orange-500 px-6 py-3 rounded-lg font-medium transition">
            Registrarse
          </a>
        </div>
      </div>
    </main>
  )
}
