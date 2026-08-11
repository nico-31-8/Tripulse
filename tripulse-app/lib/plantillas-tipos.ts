// ============================================================
// TRIPULSE — Tipos del catálogo de plantillas
// ============================================================
// Viven aparte por una razón concreta: `plantillas.ts` necesita las VARIANTES y
// `plantillas-variantes.ts` necesita los tipos. Si los tipos vivieran en
// cualquiera de los dos, habría un ciclo de importación. Con un tercer módulo
// que no importa a nadie, el flujo es en una sola dirección.
//
// Mismo patrón que `sicat-tipos.ts`.

export type NivelPlantilla = 'principiante' | 'intermedio' | 'avanzado'

// De dónde sale lo que estás aplicando. Se muestra en la interfaz: el entrenador
// tiene derecho a saber si está aplicando doctrina o criterio nuestro.
export type OrigenPlantilla = 'documentado' | 'propuesta'

export interface BloqueP {
  zona: string
  series?: number          // nº de repeticiones (si no, bloque continuo)
  metros?: number          // por repetición
  segundos?: number        // por repetición
  descansoSeg?: number     // entre repeticiones
  nota?: string
}

export interface PlantillaSesion {
  id: string
  nombre: string
  disciplina: 'Natacion' | 'Ciclismo' | 'Carrera'
  zona: string             // zona principal — es por lo que se filtra
  objetivo: string
  origen: OrigenPlantilla
  fuente: string           // nota + tabla de la que sale
  aviso?: string           // solo en 'propuesta': por qué no hay doctrina
  calentamiento: BloqueP[] // igual en los tres niveles
  principal: Record<NivelPlantilla, BloqueP[]>
  vuelta: BloqueP[]
}

/**
 * Otra forma de hacer la misma zona.
 *
 * No es otra plantilla: es el mismo objetivo fisiológico con otra estructura.
 * «Intervalos al FTP» y «over-unders» son los dos la zona AEI, pero no son la
 * misma sesión — y ese es justo el problema que resuelve esto: con una sola
 * estructura por zona, el atleta hace el mismo martes durante tres meses.
 *
 * `calentamiento` y `vuelta` son opcionales: si faltan, se heredan de la
 * plantilla. Solo se declaran cuando la variante los cambia de verdad (una
 * sesión más intensa necesita más calentamiento).
 */
export interface VarianteSesion {
  id: string               // corto; la clave completa es `plantilla/variante`
  nombre: string
  objetivo: string         // qué la hace distinta de la base, no qué zona es
  origen: OrigenPlantilla
  fuente: string
  aviso?: string
  calentamiento?: BloqueP[]
  principal: Record<NivelPlantilla, BloqueP[]>
  vuelta?: BloqueP[]
}
