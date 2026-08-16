import { describe, it, expect } from 'vitest'
import { partirInstrucciones } from './instrucciones'

/* Texto real de la biblioteca: los pasos vienen numerados dentro del propio
   texto y la última línea no es un paso, es el aviso de qué comprobar. */
const PSOAS = [
  '1) Zancada larga, rodilla trasera apoyada en el suelo.',
  '2) METER LA PELVIS EN RETROVERSION: es la clave. Sin esto no se estira el psoas, se arquea la lumbar.',
  '3) Empujar la cadera adelante manteniendo la pelvis metida.',
  '4) Mantener 30-60 s por lado.',
  '',
  'Si notas el estiramiento en la lumbar y no en la ingle, has perdido la retroversion.',
].join('\n')

describe('partir las instrucciones', () => {
  it('separa los pasos del aviso final', () => {
    const r = partirInstrucciones(PSOAS)
    expect(r.pasos).toHaveLength(4)
    expect(r.pasos[1]).toMatch(/RETROVERSION/)
    expect(r.aviso).toMatch(/^Si notas el estiramiento/)
  })

  /* El aviso es lo que evita hacerlo mal. Colado como quinto paso de una lista
     se lee como «y luego haz esto», que es justo lo contrario de lo que dice. */
  it('el aviso no se cuela entre los pasos', () => {
    expect(partirInstrucciones(PSOAS).pasos.join(' ')).not.toMatch(/Si notas/)
  })

  it('tolera saltos de Windows y líneas en blanco', () => {
    const r = partirInstrucciones('1) Uno.\r\n\r\n2) Dos.\r\n')
    expect(r.pasos).toEqual(['1) Uno.', '2) Dos.'])
    expect(r.aviso).toBe('')
  })

  it('un ejercicio sin instrucciones no revienta', () => {
    expect(partirInstrucciones(null)).toEqual({ pasos: [], aviso: '' })
    expect(partirInstrucciones('')).toEqual({ pasos: [], aviso: '' })
  })

  it('con dos dígitos también es un paso', () => {
    // «10)» no puede quedarse fuera por tener una cifra más.
    expect(partirInstrucciones('10) Decimo paso.').pasos).toHaveLength(1)
  })

  it('texto suelto sin numerar entero se trata como aviso', () => {
    const r = partirInstrucciones('Mantener 30 s por lado. Sin rebotes.')
    expect(r.pasos).toEqual([])
    expect(r.aviso).toBe('Mantener 30 s por lado. Sin rebotes.')
  })
})
