'use client'
// ============================================================
// Un campo de contraseña con el ojo para verla
// ============================================================
//
// Todo lo delicado de esto está en dos líneas del JSX:
//
//   type="button"   — sin esto el ojo ENVÍA el formulario. Dentro de un <form>,
//                     un <button> sin type es type="submit". Darle a «ver» te
//                     intentaría crear la cuenta.
//   pr-12           — hueco a la derecha para que la contraseña larga no pase
//                     por debajo del icono.
//
// El autoComplete tampoco es adorno: es lo que distingue «esta es tu contraseña
// de siempre» de «esta es una nueva» para el gestor de contraseñas del móvil.
// Sin él, el navegador ofrece rellenar la vieja en la pantalla de crear una.

import { useState } from 'react'

interface Props {
  valor: string
  onChange: (v: string) => void
  /** `current-password` para entrar, `new-password` para crear. */
  autoComplete: 'current-password' | 'new-password'
  placeholder?: string
  etiqueta?: string
  minLength?: number
  required?: boolean
  autoFocus?: boolean
  id?: string
  /* Las pantallas de esta app no comparten estilo de formulario: /login lleva
     etiquetas en mayúsculas y esquinas de 12px, y /registro, /invitacion y
     /nueva-password las llevan en minúscula y de 8px. En vez de que el campo
     imponga uno y desentone en tres sitios, se elige. El por defecto es el de
     los tres, no el de /login. */
  estiloEtiqueta?: 'normal' | 'mayus'
  redondeo?: 'lg' | 'xl'
}

/* Escritas enteras a propósito. Tailwind busca las clases leyendo el fichero
   como texto: una clase montada al vuelo (`rounded-${x}`) no la ve nadie y el
   CSS no se genera. Aquí colaría de casualidad porque rounded-lg y rounded-xl
   se usan en otras pantallas, pero el día que dejaran de usarse este campo se
   quedaría con las esquinas cuadradas sin que nada fallara. */
const CLASES_REDONDEO = { lg: 'rounded-lg', xl: 'rounded-xl' } as const

const OJO_ABIERTO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const OJO_TACHADO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
      strokeLinecap="round" strokeLinejoin="round" />
    <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
  </svg>
)

export default function CampoPassword({
  valor, onChange, autoComplete, placeholder, etiqueta,
  minLength, required, autoFocus, id,
  estiloEtiqueta = 'normal', redondeo = 'lg',
}: Props) {
  const [visible, setVisible] = useState(false)

  const clasesEtiqueta = estiloEtiqueta === 'mayus'
    ? 'text-gray-400 text-xs uppercase tracking-wide mb-1.5 block'
    : 'text-gray-400 text-sm mb-1.5 block'

  return (
    <div>
      {etiqueta && (
        <label htmlFor={id} className={clasesEtiqueta}>{etiqueta}</label>
      )}
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          autoFocus={autoFocus}
          className={`w-full bg-gray-800 text-white px-4 py-3 pr-12 ${CLASES_REDONDEO[redondeo]} outline-none focus:ring-2 focus:ring-orange-500 transition`}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar la contraseña' : 'Ver la contraseña'}
          aria-pressed={visible}
          title={visible ? 'Ocultar' : 'Ver'}
          /* 44x44 no es un número bonito, es el mínimo para el dedo. Y encaja
             justo: 44 de ancho + los 4 de right-1 son los 48 que reserva el
             pr-12 del campo, así que el botón ocupa todo el hueco sin pisar
             el texto. */
          className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
        >
          {visible ? OJO_TACHADO : OJO_ABIERTO}
        </button>
      </div>
    </div>
  )
}
