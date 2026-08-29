'use client'
// ============================================================
// Alta con invitación
// ============================================================
// Antes esta pantalla preguntaba "¿eres entrenador o deportista?" y mandaba esa
// respuesta a `perfiles`. O sea: el rol te lo ponías tú. Cualquiera podía
// declararse entrenador, y ser entrenador da escritura sobre la biblioteca de
// ejercicios compartida.
//
// Ahora el rol sale del CÓDIGO, no del formulario, y lo decide la base de datos
// dentro de registrar_con_invitacion(). Esta pantalla ya no puede elegirlo
// aunque quiera: ni siquiera lo manda.
//
// El código se pide ANTES que nada, para no crear una cuenta de auth huérfana a
// alguien que no iba a poder pasar de aquí.
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import CrearPassword from '@/components/CrearPassword'
import { errorAlEnviar } from '@/lib/password'

export default function Registro() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [nombre, setNombre] = useState('')
  const [aceptoTerminos, setAceptoTerminos] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [aviso, setAviso] = useState('')

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aceptoTerminos) { setMensaje('Debes aceptar la política de privacidad y los términos'); return }
    if (!codigo.trim()) { setMensaje('Necesitas un código de invitación para entrar'); return }
    /* Se comprueba ANTES de tocar Supabase. Si la contraseña está mal escrita,
       lo peor que puede pasar es que la cuenta se cree igualmente con la
       equivocada: signUp no falla por eso. */
    const malPass = errorAlEnviar(password, password2)
    if (malPass) { setMensaje(malPass); return }
    setLoading(true)
    setMensaje('')
    setAviso('')

    // Un alta son DOS pasos (crear la cuenta y crear el perfil) y entre medias se
    // puede quedar colgada: con la confirmación por email activada, signUp no da
    // sesión hasta que el usuario confirma. Antes eso dejaba a la persona
    // atrapada — al volver, el registro fallaba porque su email ya existía, y al
    // entrar por /login se encontraba sin perfil, que es lo que sostiene la app
    // entera. Ahora esta misma pantalla sirve para empezar Y para terminar.
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      // Puede que la cuenta ya exista de un intento anterior. Se prueba a entrar
      // con lo que acaban de escribir; si tampoco, manda el error original, que
      // dice más (contraseña débil, email inválido...).
      const { data: dLogin, error: eLogin } = await supabase.auth.signInWithPassword({ email, password })
      if (eLogin || !dLogin.session) { setMensaje('Error: ' + error.message); setLoading(false); return }
    } else if (!data.session) {
      setAviso('Cuenta creada. Confirma tu email y vuelve a ESTA pantalla con los mismos datos para terminar el alta.')
      setLoading(false)
      return
    }

    // La base decide: valida el código, saca el rol de ahí, crea el perfil (y el
    // deportista si toca) y descuenta el uso. Todo dentro de una transacción.
    const { data: res, error: errRpc } = await supabase.rpc('registrar_con_invitacion', {
      _codigo: codigo.trim().toUpperCase(),
      _nombre: nombre.trim(),
      _acepto_terminos: true,
    })
    if (errRpc) { setMensaje('Error al completar el alta: ' + errRpc.message); setLoading(false); return }
    if (!res?.ok) { setMensaje(res?.error || 'No se ha podido completar el alta.'); setLoading(false); return }

    router.push(res.rol === 'entrenador' ? '/dashboard' : '/dashboard-deportista')
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-1">TRIPULSE</h1>
        <p className="text-gray-400 mb-6">Crea tu cuenta</p>

        <form onSubmit={handleRegistro} className="flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-sm mb-1.5 block">Código de invitación</label>
            <input type="text" placeholder="Ej: K7M4PQXR" value={codigo}
              onChange={e => setCodigo(e.target.value.toUpperCase())}
              className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-mono tracking-widest w-full"
              maxLength={12} required />
            <p className="text-gray-500 text-xs mt-1.5">Vale tanto un código de invitación como el código de tu entrenador. Si no tienes ninguno, pídeselo a quien te haya hablado de la app.</p>
          </div>

          <input type="text" placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />

          <CrearPassword
            valor={password}
            onChange={setPassword}
            repetida={password2}
            onRepetidaChange={setPassword2}
          />

          <label className="flex items-start gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={aceptoTerminos} onChange={e => setAceptoTerminos(e.target.checked)} className="mt-0.5 accent-orange-500" required />
            <span>
              He leído y acepto la <a href="/privacidad" target="_blank" className="text-orange-400 hover:underline">política de privacidad</a> y los <a href="/terminos" target="_blank" className="text-orange-400 hover:underline">términos de uso</a>. Entiendo que se tratarán mis datos de entrenamiento y salud para el seguimiento deportivo.
            </span>
          </label>

          {mensaje && <p className="text-red-400 text-sm">{mensaje}</p>}
          {aviso && <p className="text-green-400 text-sm">{aviso}</p>}

          <button type="submit" disabled={loading || !aceptoTerminos} className="bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50">
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-gray-400 text-sm mt-4 text-center">¿Ya tienes cuenta? <Link href="/login" className="text-orange-500 hover:underline">Entra aquí</Link></p>
      </div>
    </main>
  )
}
