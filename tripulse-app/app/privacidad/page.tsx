'use client'

export default function Privacidad() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="text-orange-400 hover:underline text-sm">← Volver</a>
        <h1 className="text-3xl font-bold text-white mt-4 mb-2">Política de privacidad</h1>
        <p className="text-gray-500 text-sm mb-8">Última actualización: julio de 2026 · Versión v1-2026-07</p>

        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-xl p-4 mb-8 text-yellow-300/90 text-sm">
          ⚠️ Documento base conforme al RGPD y la LOPDGDD, pendiente de completar los campos [ ] y de revisión legal profesional antes de su publicación.
        </div>

        <div className="flex flex-col gap-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white mb-2">1. Responsable del tratamiento</h2>
            <p>De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), el responsable del tratamiento de tus datos es:</p>
            <ul className="list-none pl-0 mt-2 flex flex-col gap-0.5 text-gray-400">
              <li><strong className="text-gray-300">Titular:</strong> Nicolás Rioboó Barral</li>
              <li><strong className="text-gray-300">NIF:</strong> 79346432C</li>
              <li><strong className="text-gray-300">Domicilio:</strong> Calle Curros Enríquez, Portal 15, 4E — Cambre (A Coruña)</li>
              <li><strong className="text-gray-300">Contacto:</strong> nicolasrioboobarral@gmail.com</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">2. Datos que tratamos</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li><strong>Datos identificativos y de cuenta:</strong> nombre, email, contraseña (cifrada) y rol (entrenador o deportista).</li>
              <li><strong>Datos de entrenamiento:</strong> planificación (macrociclos, mesociclos, microciclos, sesiones y tareas), tests de rendimiento (VAM, CSS, FTP, fuerza), zonas y volúmenes.</li>
              <li><strong>Datos de categoría especial — salud</strong> (art. 9 RGPD): anamnesis (antecedentes, lesiones, hábitos), wellness diario (sueño, fatiga, estrés, HRV, dolor muscular), frecuencia cardíaca, peso y sensaciones.</li>
              <li><strong>Datos técnicos:</strong> registros mínimos necesarios para el funcionamiento y la seguridad del servicio.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">3. Finalidades y bases jurídicas</h2>
            <div className="flex flex-col gap-2 mt-1">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-white font-medium">Prestar el servicio de planificación y seguimiento del entrenamiento</p>
                <p className="text-gray-400 text-xs mt-0.5">Base jurídica: ejecución de la relación de servicio y tu consentimiento (art. 6.1.a y 6.1.b RGPD).</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-white font-medium">Tratar tus datos de salud para adaptar el entrenamiento</p>
                <p className="text-gray-400 text-xs mt-0.5">Base jurídica: tu <strong>consentimiento explícito</strong> (art. 9.2.a RGPD), que otorgas al registrarte y puedes retirar en cualquier momento.</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-white font-medium">Permitir que tu entrenador vinculado planifique y analice tu progreso</p>
                <p className="text-gray-400 text-xs mt-0.5">Base jurídica: tu consentimiento al vincularte mediante código o invitación.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">4. Destinatarios y encargados del tratamiento</h2>
            <p>Si eres deportista, tu <strong>entrenador vinculado</strong> accede a tus datos de entrenamiento y salud con la finalidad de planificar tu preparación. Ningún otro usuario puede acceder a tus datos.</p>
            <p className="mt-2">Para prestar el servicio utilizamos <strong>Supabase Inc.</strong> como encargado del tratamiento (alojamiento y base de datos), con las debidas garantías contractuales (art. 28 RGPD). No cedemos tus datos a terceros salvo obligación legal, ni los usamos con fines publicitarios.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">5. Ubicación de los datos</h2>
            <p>Tus datos se alojan en servidores ubicados dentro de la Unión Europea, por lo que no se realizan transferencias internacionales fuera del Espacio Económico Europeo. Si en el futuro cambiara la ubicación, se aplicarían las garantías previstas en el RGPD y te informaríamos.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">6. Plazos de conservación</h2>
            <p>Conservamos tus datos mientras tu cuenta permanezca activa y sean necesarios para la finalidad. Cuando eliminas tu cuenta, tus datos se suprimen de forma permanente e irreversible, salvo aquellos que debamos conservar por obligación legal.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">7. Tus derechos</h2>
            <p>Puedes ejercer tus derechos de <strong>acceso, rectificación, supresión, portabilidad, limitación y oposición</strong>, así como retirar tu consentimiento:</p>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
              <li><strong>Acceso y portabilidad:</strong> descarga todos tus datos en formato JSON desde <em>Mi perfil → Privacidad y datos</em>.</li>
              <li><strong>Supresión y retirada del consentimiento:</strong> elimina tu cuenta y todos tus datos desde <em>Mi perfil → Zona peligrosa</em>.</li>
              <li><strong>Rectificación:</strong> edita tus datos en la aplicación o escríbenos a nicolasrioboobarral@gmail.com.</li>
            </ul>
            <p className="mt-2">Si consideras que no hemos atendido correctamente tus derechos, puedes reclamar ante la <strong>Agencia Española de Protección de Datos</strong> (<a href="https://www.aepd.es" target="_blank" className="text-orange-400 hover:underline">aepd.es</a>).</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">8. Medidas de seguridad</h2>
            <p>Aplicamos medidas técnicas y organizativas apropiadas, incluyendo el aislamiento de datos por usuario a nivel de base de datos (Row Level Security), cifrado de credenciales y control de acceso por roles, de modo que cada persona solo accede a los datos que le corresponden.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">9. Almacenamiento en tu dispositivo</h2>
            <p>Utilizamos almacenamiento local del navegador exclusivamente para mantener tu sesión iniciada (token de autenticación). No empleamos cookies de seguimiento ni herramientas publicitarias o de analítica de terceros.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">10. Menores de edad</h2>
            <p>Si el deportista es menor de edad, el registro y el consentimiento —incluido el relativo a datos de salud— deben ser otorgados y gestionados por su padre, madre o tutor legal.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2">11. Cambios en esta política</h2>
            <p>Podemos actualizar esta política. Si el cambio es sustancial, te lo comunicaremos y, cuando proceda, recabaremos de nuevo tu consentimiento.</p>
          </section>
        </div>

        <div className="mt-10 flex gap-4 text-sm">
          <a href="/terminos" className="text-orange-400 hover:underline">Términos de uso</a>
          <a href="/" className="text-gray-500 hover:text-white">Inicio</a>
        </div>
      </div>
    </main>
  )
}
