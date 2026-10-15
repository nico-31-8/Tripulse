import { describe, it, expect } from 'vitest'
import { objetivoDeTarea, deDondeSaleTarea } from './objetivo-tarea'
import { objetivoDeZona } from './referencia-zona'
import type { TestConMediciones } from './referencia-propia'

const PRUEBA: TestConMediciones[] = [{
  id: 9, nombre: 'Prueba de esfuerzo', deporte: 'Carrera',
  def: {
    nombre: 'Prueba de esfuerzo', deporte: 'Carrera',
    campos: [{ clave: 'vt1', etiqueta: 'VT1' }, { clave: 'vt2', etiqueta: 'VT2' }],
    resultados: [
      { nombre: 'VT1', unidad: 'km/h', ancla: 'umbral_aer', formula: [{ t: 'var', v: 'vt1' }], graf: true },
      { nombre: 'VT2', unidad: 'km/h', ancla: 'umbral', formula: [{ t: 'var', v: 'vt2' }], graf: true },
    ],
  },
  mediciones: [{ fecha: '2026-10-02', datos: { vt1: 12, vt2: 15 } }],
}]

/* Una TEMPO del VT1 + 15 % al VT2 − 5 %, tal como queda congelada en la tarea. */
const TEMPO = {
  zona_entrenamiento: 'TEMPO',
  zona_copia: {
    sigla: 'TEMPO', nombre: 'Tempo', color: '#facc15', rpe: 5.5, nivel: 3, pctMin: 0, pctMax: 0, refId: '', refEtiqueta: '',
    fuente: 'clasif:1', clasificacion: 'Laboratorio',
    desde: { ref: 'propia:9:0', pct: 115, corto: 'VT1' }, hasta: { ref: 'propia:9:1', pct: 95, corto: 'VT2' },
  },
}

describe('a cuánto tiene que ir el atleta', () => {
  it('UNA ZONA DE UNA CLASIFICACIÓN SALE CON SU RITMO, en el briefing y al entrenar', () => {
    expect(objetivoDeTarea(TEMPO, 'Carrera', {}, PRUEBA, 190)).toEqual({ texto: '4:13–4:21 /km', de: 'copia' })
  })

  it('SIN SUS NÚMEROS, SU RPE, y no el de otra zona del catálogo', () => {
    expect(objetivoDeTarea(TEMPO, 'Carrera', {}, [], 190)).toEqual({ texto: 'RPE 5,5', de: 'esfuerzo' })
  })

  it('UN AEL AFINADO AL 70 % SALE AL 70, no al 65–75 del catálogo', () => {
    const ael = {
      zona_entrenamiento: 'AEL',
      zona_copia: { sigla: 'AEL', nombre: 'x', color: '#fff', rpe: 3, nivel: 2, pctMin: 70, pctMax: 70, refId: 'app:vam', refEtiqueta: 'Su VAM' },
    }
    expect(objetivoDeTarea(ael, 'Carrera', { vam: 16 }, [], 190)?.texto).toBe('5:21 /km')
  })

  it('SIN COPIA, EXACTAMENTE LO DE SIEMPRE', () => {
    const t = { zona_entrenamiento: 'AEL' }
    expect(objetivoDeTarea(t, 'Carrera', { vam: 16 }, [], 190)).toEqual(objetivoDeZona('AEL', 'Carrera', { vam: 16 }, 190))
    expect(objetivoDeTarea(null, 'Carrera', {}, [], 0)).toBeNull()
  })

  it('y se dice de dónde sale', () => {
    expect(deDondeSaleTarea('copia')).toContain('prescribió')
    expect(deDondeSaleTarea('fc')).toContain('frecuencia')
  })
})
