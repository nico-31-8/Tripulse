'use client'
// Engancha el registro de errores una sola vez, al cargar la app. No pinta nada:
// vive en el layout solo para tener un sitio donde correr en el cliente.
import { useEffect } from 'react'
import { engancharErroresGlobales } from '@/lib/eventos'

export default function CazaErrores() {
  useEffect(() => { engancharErroresGlobales() }, [])
  return null
}
