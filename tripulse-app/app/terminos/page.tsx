'use client'

export default function Terminos() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="text-orange-400 hover:underline text-sm">← Volver</a>
        <h1 className="text-3xl font-bold text-white mt-4 mb-2">Términos de uso</h1>
        <p className="text-gray-500 text-sm mb-8">Última actualización: julio de 2026 · Versión v1-2026-07</p>

        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-xl p-4 mb-8 text-yellow-300/90 text-sm">
          ⚠️ Documento base pendiente de revisión legal profesional. Completa los campos marcados con [ ] antes de publicar.
        </div>

        <div className="flex flex-col gap-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white mb-2">1. Objeto</h2>
            <p>TRIPULSE es una plataforma para la planificación y el seguimiento del entrenamiento de triatlón y fuerza. Estos términos regulan el uso del servicio prestado por <strong>Nicolás Rioboó Barral</strong> (NIF 79346432C), con domicilio en Calle Curros Enríquez, Portal 15, 4E, Cambre (A Coruña), y contacto en nicolasrioboobarral@gmail.com.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">2. Tu cuenta</h2>
            <p>Eres responsable de la veracidad de los datos que facilitas y de mantener la confidencialidad de tu contraseña. Debes notificarnos cualquier uso no autorizado de tu cuenta.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">3. Uso adecuado</h2>
            <p>Te comprometes a usar la plataforma de forma lícita y a no intentar acceder a datos de otros usuarios, alterar el funcionamiento del servicio ni introducir contenido dañino.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">4. No es consejo médico</h2>
            <p>TRIPULSE es una herramienta de apoyo al entrenamiento. La información y planificación que ofrece <strong>no constituye consejo médico</strong> ni sustituye la valoración de un profesional sanitario. Ante cualquier problema de salud, consulta con un médico.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">5. Relación entrenador–deportista</h2>
            <p>Cuando un deportista se vincula a un entrenador mediante código o invitación, autoriza a dicho entrenador a acceder a sus datos de entrenamiento y salud dentro de la plataforma. El deportista puede desvincularse en cualquier momento desde su perfil.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">6. Disponibilidad</h2>
            <p>Nos esforzamos por mantener el servicio disponible, pero no garantizamos su funcionamiento ininterrumpido. Podemos realizar tareas de mantenimiento o actualización.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">7. Limitación de responsabilidad</h2>
            <p>En la medida permitida por la ley, no nos hacemos responsables de daños derivados del uso o la imposibilidad de uso del servicio, ni de decisiones tomadas en base a la información de la plataforma.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">8. Modificaciones</h2>
            <p>Podemos actualizar estos términos. Si el cambio es sustancial, te lo comunicaremos. El uso continuado del servicio implica la aceptación de la versión vigente.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">9. Legislación aplicable</h2>
            <p>Estos términos se rigen por la legislación española. Para cualquier controversia, y salvo que la normativa de consumo disponga otro fuero imperativo, las partes se someten a los juzgados y tribunales de <strong>A Coruña</strong>.</p>
          </section>
        </div>

        <div className="mt-10 flex gap-4 text-sm">
          <a href="/privacidad" className="text-orange-400 hover:underline">Política de privacidad</a>
          <a href="/" className="text-gray-500 hover:text-white">Inicio</a>
        </div>
      </div>
    </main>
  )
}
