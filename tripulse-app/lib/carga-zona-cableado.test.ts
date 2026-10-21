import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// CON «PONDERAR POR ZONA», LA MISMA SESIÓN PESA LO MISMO EN LAS TRES PANTALLAS
// (21-10-2026). Las tres ponderan con la zona con la que el SICAT midió su coste:
// la pico de la sesión (en un brick, la de cada bloque). Las cuentas están en
// lib/sicat-zonas.test; esto vigila que las pantallas las sigan usando. El
// desglose por disciplina ponderaba cada bloque con la zona de su tarea, y una
// sesión de 45′ AEL + 15′ PLA pesaba allí 342 y en /carga 504.
const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('las pantallas de carga ponderan con la misma zona', () => {
  it('el desglose por disciplina, con la zona de coste y no con la de cada tarea', () => {
    const src = leer('components/CargaPorDisciplina.tsx')
    expect(src).toMatch(/zonaDeCoste\(/)
    expect(src).not.toMatch(/factorSicatZona\([^)]*b\.zona/)
  })

  it('/carga y /volumen, con la zona pico de la sesión', () => {
    for (const f of ['app/carga/page.tsx', 'app/volumen/page.tsx']) {
      expect(leer(f)).toMatch(/factorSicatZona\(s\.disciplina, s\.zonaPico/)
    }
  })
})
