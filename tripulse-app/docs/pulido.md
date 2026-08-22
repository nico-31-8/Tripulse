# Pase de pulido — módulo a módulo

Repaso completo de la app con cuatro objetivos a la vez: **que cargue más rápido**,
**que no parpadee ni salte**, **que el código sea más fácil de tocar** y **que se
sienta mejor al usarlo**. Empezado el 2026-08-22.

---

## El método (esto es lo que impide romper nada)

Los 911 tests cubren `lib/`. **Ninguna pantalla tiene test.** Así que reordenar
consultas dentro de un `page.tsx` de 1.900 líneas sería una apuesta: `tsc` no ve
la lógica.

Por eso el orden dentro de cada módulo es siempre el mismo:

1. **Sacar la lógica a `lib/` con tests.** Primero se cubre, después se toca.
2. **Solo entonces**, optimizar la pantalla (cascadas, estados, transiciones).
3. **Verificar**: `tsc` limpio + tests en verde + `next build` OK.
4. **Un commit por tanda**, con el porqué en el mensaje.

Reglas duras:

- **Una categoría por tanda.** No se mezcla «quitar duplicados» con «paralelizar
  consultas»: si algo se rompe, hay que saber qué fue.
- **Nada de cambios de comportamiento por el camino.** Si aparece un bug (y van
  apareciendo), se anota abajo y se arregla APARTE, con su propio commit.
- **Si una función se duplica, se consolida hacia `lib/` y se migran TODOS los
  usos en la misma tanda.** Dejar dos vivas es peor que dejar tres.

---

## Lo medido (2026-08-22)

| Señal | Dato |
|---|---|
| Páginas | 51 (`app/**/page.tsx`), 93 ficheros `.tsx` en total |
| Componentes cliente | 77 de 93 llevan `'use client'` |
| Estados de carga | 41 de 51 páginas tienen alguno |
| Recargas duras | 2 (`location.reload()`) |
| Ficheros >1.000 líneas | 6 |
| Funciones duplicadas entre ficheros | 17 nombres |

Consultas y tamaño por módulo:

| Módulo | Consultas | Líneas |
|---|---|---|
| planificacion-visual | 110 | 5.711 |
| sesion | 85 | 4.259 |
| deportistas | 18 | 1.390 |
| dashboard | 13 | 613 |
| dashboard-deportista | 12 | 399 |
| volumen | 11 | 1.008 |
| carga | 9 | 614 |
| comunicacion | 9 | 302 |

Cascadas (consultas en serie / usos de `Promise.all`):
`calendario` 23/0 · `dibujo` 21/2 · `semana` 14/1 · `bloques` 14/0 ·
`deportistas/[id]` 13/1 · `mesociclo/vista` 12/2 · `mis-sesiones` 11/1 ·
`perfil` 11/0 · `dashboard` 10/0

---

## Orden de trabajo

**Tanda 0 — primitivas compartidas** (transversal, sin UI, riesgo mínimo).
Se hace primero porque todos los módulos las usan: arreglarlas una vez mejora
en todas partes, y son justo donde vive la familia de bugs de este proyecto.

**Módulo 1 — Ficha de sesión** (`/sesion/*`, 85 consultas, 4.259 líneas).
Lo más usado por el entrenador y lo más fresco.

**Módulo 2 — Planificación visual** (`/planificacion-visual/*`, 110 consultas,
5.711 líneas). El más grande y el más delicado: aquí vive el dibujo, que ya
provocó una pérdida de datos real (ver `tripulse-autoguardado-dibujo`).

**Módulo 3 — Paneles** (dashboard entrenador + deportista).

**Módulo 4 — Ficha del deportista** (`/deportistas/*`).

**Módulo 5 — Carga, volumen, índices, eco** (las pantallas de análisis).

**Módulo 6 — El resto** (comunicación, comunidad, tests, perfil, papelera…).

---

## Backlog con evidencia

### Duplicados confirmados

- **`getLunesDeSemana` ×3** — `calendario`, `Adherencia`, `GraficaCarga`, con
  **tres formas distintas de tratar la fecha**: una parsea `new Date(fecha)`
  (medianoche UTC), otra `fecha + 'T12:00:00'` (mediodía local), y salen por
  `toISOString()` o por `getFullYear()` local. En España (UTC+1/+2) las tres
  coinciden hoy; en un huso negativo darían lunes distintos. Divergencia
  latente, no activa — pero son tres.
  Y `lib/semana-sesiones.lunesDe` es una CUARTA (esta sí en UTC y con tests).
- **`weeksBetween` ×3** — `mesociclo/vista` sin `T12:00:00`, las otras dos con él.
- **`calcularEdad` ×3** — `deportistas`, `deportistas/[id]`, `tests`. Idénticas.
- **`segAMmss` ×3** — una ya consolidada en `lib/copiar-tarea`; quedan dos.
- **`estadoTSB` ×3** — las tres envuelven `estadoTSBBase` de `lib/panel-metricas`,
  pero devuelven formas distintas. El núcleo ya está compartido; son adaptadores.
- **16 ficheros** reimplementan aritmética de fechas a mano.

### Fluidez

- **2 recargas duras**: `OnboardingDeportista:101` y `ResumenBrick:56`.
- **Cascada de 7 viajes en la ficha de sesión**, de los que **3 sobran**: la
  cadena `microciclo → mesociclo → macrociclo` está para averiguar el
  `id_deportista`, que ya viene en la primera consulta. Desde la Fase A,
  `microciclo` también lo lleva, así que las cinco últimas caben en una.
- **10 páginas sin estado de carga.**
- **21 `select('*')`** sobre `sesion` / `tarea` / `ejercicios_biblioteca`.

### Bugs anotados, a arreglar aparte

- **`intensidadPersonalizada` no se guarda** (`tareas-tabla`, casilla `@`). Se
  escribe, se le da a ✓ y desaparece: `guardarFilaR` calcula `ritmo_objetivo`
  desde la zona y descarta lo escrito, y solo lo guarda en `p_distancia` (en
  tareas por tiempo no se guarda nada). **Falta saber si `p_duracion` tiene
  columna `ritmo_objetivo`.** Pendiente de confirmación del usuario.
- **Los números del ejercicio encadenado** (series/reps/kg del 2º de una
  superserie) se guardan como texto dentro de `notas_ejecucion`, no en columnas.
  Al editar o copiar vuelve el ejercicio pero no sus números.

---

## Registro

### Tanda 0 — primitivas de fecha · en curso

**Hecho (2026-08-22).** `lib/fechas.ts` + 24 tests. Es ahora el único sitio donde
se hace aritmética de fechas.

La regla que fija: **una fecha sin hora es un día del calendario y se opera en
UTC** (lo que ya hacía `desplazar.ts` y por lo que se hizo así); **«hoy» es
local**, porque a las 00:30 en Madrid en UTC todavía es ayer y el atleta vería el
día anterior.

Consolidado y migrado, con todos los usos en la misma tanda:

| Estaba | Copias | Ahora |
|---|---|---|
| `getLunesDeSemana` | 3, con 3 estrategias distintas | `lunesDe` |
| `weeksBetween` | 3 | `semanasEntre` |
| `calcularEdad` | 3 | `calcularEdad` |
| `proximoLunes` | 2 | `proximoLunes` |
| `fechaStr` | 2, una local y otra UTC | `aISO` / `sumarDias` |
| `fechaLarga` | 2 | `fechaLarga` + `fechaLargaCompleta` |
| `sumarDias`/`diasEntre` | en `desplazar` | movidas, re-exportadas desde allí |

Dos cosas que salieron por el camino y se arreglaron:

- **`calcularEdad` devolvía un número siempre.** Ahora devuelve `null` sin fecha
  de nacimiento, y eso destapó que `calcularFCMaxima` hacía `208 - 0.7 * null`
  → **208 ppm para cualquiera sin fecha**. Un número creíble calculado sobre
  nada. Ahora devuelve `null`.
- **`fechaLarga` ×2 NO eran la misma función**: «19 ago» y «19 de agosto». Se
  comparte la maquinaria y se conservan los dos formatos, que son deliberados.

Nota honesta sobre el impacto: las tres versiones de `getLunesDeSemana`
**coinciden en España** (UTC+1/+2). La divergencia era latente, no activa. Lo que
se gana hoy es que no puedan separarse mañana.

Verificado: `tsc` 0 · **935 tests** (eran 911) · `next build` OK.

**Pendiente de la tanda 0** (misma categoría, otra tanda): `segAMmss` ×3,
`colorZona` ×2, `estadoTSB` ×3 (estos tres son adaptadores finos sobre
`estadoTSBBase`, que ya está compartido: valor bajo).

### Módulo 1 — Ficha de sesión · siguiente
