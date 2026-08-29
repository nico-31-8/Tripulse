'use client'
// ============================================================
// Elegir contraseña: dos veces, y viéndola si quieres
// ============================================================
//
// POR QUÉ SIGUE HABIENDO SEGUNDO CAMPO SI YA PUEDES VERLA
// Porque casi nadie le da al ojo. El ojo sirve cuando ya sospechas que te has
// equivocado; la repetición pilla el error del que NO sospecha nada. Son dos
// redes distintas y la barata es tener las dos.
//
// El aviso aparece mientras se escribe, no al enviar: enterarte de que no
// coinciden después de rellenar el formulario entero es enterarte tarde.
// Eso sí, callado hasta que hay algo escrito en el segundo campo — marcar en
// rojo un campo que aún no has terminado es lo que hace que la gente odie los
// formularios.

import CampoPassword from './CampoPassword'
import { revisarPassword, MINIMO } from '@/lib/password'

interface Props {
  valor: string
  onChange: (v: string) => void
  repetida: string
  onRepetidaChange: (v: string) => void
  etiqueta?: string
  etiquetaRepetir?: string
  estiloEtiqueta?: 'normal' | 'mayus'
  redondeo?: 'lg' | 'xl'
}

export default function CrearPassword({
  valor, onChange, repetida, onRepetidaChange,
  etiqueta = 'Elige una contraseña',
  etiquetaRepetir = 'Escríbela otra vez',
  estiloEtiqueta, redondeo,
}: Props) {
  const estado = revisarPassword(valor, repetida)

  return (
    <div className="flex flex-col gap-3">
      <CampoPassword
        id="password-nueva"
        etiqueta={etiqueta}
        placeholder={`Mínimo ${MINIMO} caracteres`}
        valor={valor}
        onChange={onChange}
        autoComplete="new-password"
        minLength={MINIMO}
        required
        estiloEtiqueta={estiloEtiqueta}
        redondeo={redondeo}
      />
      <CampoPassword
        id="password-repetir"
        etiqueta={etiquetaRepetir}
        placeholder="La misma de arriba"
        valor={repetida}
        onChange={onRepetidaChange}
        autoComplete="new-password"
        required
        estiloEtiqueta={estiloEtiqueta}
        redondeo={redondeo}
      />

      {estado.error && (
        <p className="text-amber-400 text-xs leading-relaxed">{estado.error}</p>
      )}
      {estado.valida && (
        <p className="text-green-400 text-xs">Las dos coinciden.</p>
      )}
    </div>
  )
}
