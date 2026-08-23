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

**Hecho (2026-08-22) — la cascada de la ficha de sesión.**

`lib/contexto-sesion.ts` + 21 tests: `posicionEnPlan`, `diasHastaCompeticion`,
`microsDelPlan`, `hayOtraSesionEseDia`. Era lógica enterrada dentro de la
cascada; ahora es lógica pura sobre listas, probada.

Con eso cubierto, `cargarDatos` pasa de **ocho viajes encadenados a dos rondas**:

    antes: perfiles → sesion → microciclo → mesociclo → macrociclo → mesos
           → micros → sesiones del día    (y luego un Promise.all)
    ahora: [usuario, sesion, tareas]  →  [perfil, mesos, micros, sesiones del
           día, 3 tests, anamnesis, deportista]

**Tres de esos viajes no hacían falta.** La cadena microciclo→mesociclo→
macrociclo estaba solo para averiguar de quién era la sesión, y
`sesion.id_deportista` ya venía en la primera consulta. No es que «suela» estar:
la política RLS de `sesion` es `id_deportista in (select auth_dep_ids())`, así
que una fila con ese campo a null **no la ve nadie**. Si la estamos leyendo, está.
Se deja igual una red de seguridad de tres consultas para el caso imposible.

Los mesos y micros se traen enteros del deportista y el acotado al macrociclo se
hace en memoria, así que un atleta con dos temporadas sigue viendo «semana 2 de
4» de la suya.

**Un cambio de comportamiento, a propósito y anotado**: «¿otra sesión hoy?» iba
por los microciclos del plan; ahora va por deportista y fecha, así que **caza
también las sesiones libres**. Antes, si el atleta se añadía una por su cuenta
ese día, no contaba y la recomendación de recuperación salía como si tuviera el
día suelto.

**Fuera la recarga dura de `ResumenBrick`.** Guardar los bloques de un brick
hacía `window.location.reload()`: pantalla en blanco y la app entera de cero para
reflejar un cambio de dos campos. Ahora avisa al padre, que relee lo suyo y
remonta la tabla. Queda **una** recarga dura en la app (`OnboardingDeportista`,
va en el Módulo 3).

Verificado: `tsc` 0 · **956 tests** (eran 935) · `next build` OK.

**Queda del Módulo 1**: las consultas de `tareas-tabla` (carga la biblioteca
entera de ejercicios al montar), la pantalla `ejecutar`, y los `select('*')`.

**Hecho (2026-08-22) — el resto de la carga del módulo.**

`tareas-tabla`: de **8 consultas en serie a 2 rondas**. Y algo peor que la
serialización: las cuatro primeras (FC máxima, sistema de zonas y los tres
tests) son **exactamente las mismas que la página acaba de hacer** para su
cabecera. Se pedían dos veces por apertura. Ahora al menos salen de la misma
función (`cargarReferencias`), así que no pueden divergir; quitar la segunda
petición del todo pide bajar los datos por props — otra tanda.

`ejecutar`: de **7 viajes encadenados a 1 ronda**. Tenía la misma cascada
`microciclo→mesociclo→macrociclo→mesos→micros→sesiones del día`, por el mismo
motivo, y con la misma respuesta. Es **la pantalla del atleta mientras entrena**,
muchas veces con el móvil y mala cobertura: es donde más se nota.

Los `await` que quedan en el módulo están casi todos en los caminos de GUARDADO
(borrar tarea, guardar fila), que son secuenciales por necesidad —borrar y
después insertar— y ocurren tras un clic, no antes de ver nada.

Verificado: `tsc` 0 · **956 tests** · `next build` OK.

**Queda del Módulo 1**: bajar tests/FC por props para matar la doble petición,
los `select('*')`, y los estados de carga.

---

## Verificación en navegador (2026-08-22)

Primera vez que se ejecuta la app en este pase. El usuario abrió sesión y se
recorrieron las pantallas tocadas. **Dos bugs encontrados que ni `tsc` ni los
tests podían ver**, los dos de la misma familia.

### 1. La semana del panel del entrenador empezaba en DOMINGO · ACTIVO en producción

`lib/panel-metricas.ts` hacía:

    const l = new Date(hoy); l.setDate(...); l.setHours(0,0,0,0)
    const lunesStr = l.toISOString().split('T')[0]

`setHours(0,0,0,0)` pone medianoche **local**; `toISOString()` la pasa a UTC, que
en España son las **22:00 del día anterior**. Reproducido:

    lunes en local : Mon Aug 17 2026 00:00:00
    lunes en UTC   : 2026-08-16T22:00:00.000Z
    lunesStr       : 2026-08-16   ← domingo

En pantalla: la columna «L» enseñaba el domingo y el **sábado salía marcado como
«D · HOY»**. Y no era solo la etiqueta — ese lunes alimenta las consultas de la
semana, así que el recuento de sesiones y el volumen salían contados sobre
**domingo→sábado**.

Arreglado con `lib/fechas`. Test de regresión que recorre **los 365 días de
2026** comprobando que la semana empieza en lunes y contiene el día de hoy; se
verificó que la lógica vieja lo suspende. Confirmado en pantalla: **`S · HOY`**.

### 2. «Añadida por el atleta»: dos definiciones · lo introduje yo hoy

El panel de la semana marcaba las sesiones del atleta por `id_microciclo == null`.
Toda la app las marca por **`origen === 'deportista'`** (`mis-sesiones`, la vista
de mesociclo y la de semana). No es lo mismo: una sesión que se añade el atleta
puede acabar colgada de un microciclo y sigue siendo suya.

Se veía a simple vista: la vista de semana marcaba dos con 🙋 y el panel, ninguna.
Corregido a `origen`, con tests para los dos casos que las distinguen. Confirmado
en pantalla: **«2 añadidas por el atleta»**.

### Lo que sí quedó verificado funcionando

- Ficha de sesión con la cascada nueva: **`Meso 1 · Semana 1 (Carga)`** sale bien
  → **`id_deportista` SÍ está relleno** en `mesociclo` y `microciclo`. Era la
  suposición de la que colgaba todo el pase.
- Panel de la semana: 10 sesiones, 4 hechas, zonas, días y marcas, cuadrando con
  la vista de semana.
- Calendario: agosto 2026 empieza en sábado (correcto), hoy recuadrado el 22.
- Vista de semana: Lun 17 … Dom 23, «Semana 1 · Carga».
- Lista de deportistas y ficha: edades correctas.

### Anotado para mirar

- El panel del entrenador dice **11 sesiones** esta semana y la vista de semana
  **10**. El panel consulta por todos los microciclos del plan + fecha; la vista
  de semana, solo por el microciclo de esa semana. Probablemente una sesión de
  otro microciclo con fecha dentro del rango. Pendiente de confirmar; es previo
  a este pase.

---

## Tanda 1 — Lo que está en la papelera no cuenta (2026-08-23)

Salió tirando del hilo del «11 sesiones» del panel contra el «10» de la vista de
semana. **Veinte consultas de lectura sobre `sesion` no filtraban `eliminada`.**

Borrar en esta app es `eliminada = true`. El convenio estaba bien aplicado al
ESCRIBIR y mal al LEER, así que una sesión en la papelera seguía:

- sumando a la **carga y al TSB** (la curva de forma del atleta),
- contando en el **volumen** y en las sesiones de la semana,
- bajando el **porcentaje de adherencia**,
- saliendo en **«próximas sesiones»**,
- entrando en el **contexto que se manda al asistente de IA**,
- y falseando el **factor de brick personalizado**, que aprende de RPEs reales.

No rompía nada: hacía que los números fueran mentira. El entrenador ve
«Sobrecarga» y afloja el plan por sesiones que él mismo borró.

`lib/papelera.ts` fija el criterio: `vivas(query)` y `FILTRO_VIVAS`. Hacía falta
una función porque **ya había dos copias del filtro escritas a mano** (una local
en `ResumenSemanal`, otra que acababa de escribir yo en `panel-metricas`) y la
tercera era cuestión de tiempo.

Migradas 20 consultas en 16 ficheros: `carga`, `volumen`, `indices`,
`deportistas/[id]`, `mis-analisis`, `microciclo`, `bloques`, `comunicacion`,
`Adherencia`, `CargaPorDisciplina`, `GraficaCarga`, `PlanPeriodizacion`,
`ResumenSemanal`, `panel-metricas`, `asistente`, `sicat-brick`.

**Deliberadamente sin tocar** (no son agregados): abrir una sesión por su id
—desde la papelera se abre a propósito—, la gestión de la propia papelera
(`plan-rehacer`), copiar sesiones por id (`grupos-volcado`) y los `update` por id.

`is.null` además de `eq.false`: la columna se añadió después y las filas
anteriores la tienen a null. Con `eq.false` a secas desaparecería el histórico,
que es el fallo contrario y peor.

Los tests cazaron el cambio: el doble de Supabase de `sicat-brick` no
implementaba `.or()`. Se le añadió **filtrando de verdad**, y con un test nuevo
que mete una sesión borrada en el escenario y comprueba que el factor no se
mueve — si el doble lo ignorara, el test pasaría con la sesión dentro.

Verificado en pantalla: el panel pasa de **11 a 10 sesiones**, que es lo que
dice la vista de semana.

Verificado: `tsc` 0 · **963 tests** · `next build` OK.

---

## Módulo 2 — Planificación visual · en curso

### Calendario (2026-08-23) — de catorce viajes a tres rondas

Era la peor cascada de la app: `deportista → test1 → test2 → test3 →
macrociclo → competición → semana bloqueada → sesiones libres → mesociclo →
microciclo → sesiones del plan → tareas → distancias → duraciones → ejercicios`.
Catorce esperas encadenadas en la pantalla más pesada que hay.

Ahora son tres rondas: todo lo que solo depende del deportista a la vez, después
las tareas de esas sesiones, y después los tres tipos de parámetro juntos.

**La simplificación de fondo**: las sesiones se piden **una** vez por deportista,
no dos (las del plan por microciclo + las libres por separado). `id_deportista`
está en todas las filas —lo garantiza la propia política RLS de `sesion`— así que
una sola consulta las cubre. Y con eso desaparece la clase de fallo que ya mordió
aquí: las libres iban detrás de tres `return` que cortaban si faltaba plan, así
que a quien no tenía macrociclo **no se le cargaban nunca**.

Mesociclos y microciclos también por deportista, que es lo mismo que salía de
encadenar macro → meso → micro.

`lib/sesion-volumen.ts` + 13 tests saca el cálculo de metros, segundos, duración
estimada y zonas. Iba dentro de la pantalla, mezclado con la cascada que lo
alimentaba. De paso deja de hacer `find`/`filter` sobre las listas completas por
cada tarea de cada sesión —con 200 sesiones y 600 tareas eso son cientos de miles
de recorridos por repintado— y usa mapas: una pasada para agrupar y otra para
montar.

Un test fija el criterio que **tiene que coincidir con el editor**: el total es
valor × series. Si aquí se contara el valor por serie, el calendario diría 100 m
donde la tabla dice 800.

Verificado en pantalla: agosto empieza en sábado, puntos de sesión, colores de
mesociclo y competiciones, todo igual que antes.

Verificado: `tsc` 0 · **976 tests** · `next build` OK.

**Queda del Módulo 2**: `dibujo` (2.331 líneas, 21 consultas), `bloques` y
`semana`.

### Dibujo (2026-08-23) — de seis viajes a uno, y con menos riesgo

El fichero más grande del proyecto (2.331 líneas) y el que **ya provocó una
pérdida de datos real**: el autoguardado escribió `sesiones_zonas: []` encima de
los chips buenos de un atleta (ver `tripulse-autoguardado-dibujo`).

Encadenaba `macrociclo → mesociclo → microciclo → sesiones del plan → sesiones
libres → borrador`. Ahora todo por `id_deportista` en **una sola ronda**.

**Y esto es más seguro, no solo más rápido.** La ventana que costó aquellos chips
era ésta: entre los `setMacros`/`setMesos`/`setSems` de la carga y la lectura del
borrador había `await`s, y cada `setState` dispara el efecto de autoguardado. Si
algo cortaba el cargador en medio, se guardaba el estado a medias. Con una sola
ronda, **todos los `setState` caen seguidos y sin un solo `await` entre medias**:
esa ventana ya no existe.

El guardián (`borradorCargadoRef`) se queda **igual**. Es la red, no el arreglo, y
quitarla sería confundir «ahora no hace falta» con «no puede volver a hacer
falta».

Las sesiones libres se cargan **siempre**. Estaban dentro del
`if (microIds.length)`, así que a quien no tenía microciclos no se le contaban ni
en Programado ni en Realizado — el mismo fallo que había en el calendario.

**Verificado en pantalla, que aquí no era opcional**: se abrió el lienzo, se dejó
autoguardar, se recargó y se contó lo que quedaba. Idéntico a antes: **16 chips**
(AEI, AEL, AER, FEA, FLEX, FMH, FMI, PAE), 16 sesiones, 625 UA, 4 mesociclos, 12
semanas.

Verificado: `tsc` 0 · **976 tests** · `next build` OK.

### Bloques y semana (2026-08-23) — módulo 2 cerrado

**Bloques**: cada tarjeta de macrociclo lanzaba **su propia consulta** al montarse
para pintar sus bloques. Con cinco macrociclos, cinco viajes — el N+1 de manual.
Ahora el padre trae todos los mesociclos del deportista de una vez y reparte. De
paso la tarjeta deja de ser un componente que hace red: se puede leer sin
preguntarse cuándo consulta.

**Semana**: de ocho viajes en serie a dos rondas. Dos cosas desaparecen:

- El **mesociclo era solo un puente** para llegar a los microciclos. Con
  `microciclo.id_deportista` sobra.
- **`p_distancia` y `p_duracion` se pedían y no se usaban.** Restos de cuando la
  UA programada sumaba metros + segundos como si fueran la misma unidad; eso se
  arregló (ahora es RPE × min) pero las dos consultas se quedaron trayendo datos
  que nadie leía.

**Un cambio de comportamiento, a propósito**: las sesiones se piden por **fecha**
y no por microciclo. La pantalla se titula «Semana del …» y pinta siete columnas
de lunes a domingo: una sesión de ese microciclo fechada fuera se contaba en el
resumen **y no se podía ver en ninguna columna**, y una de otro microciclo
fechada dentro no salía.

Con esto, la discrepancia del recuento queda **del todo cerrada**: panel,
calendario y vista de semana dicen los tres **10**. El culpable era la papelera,
no la forma de la consulta.

Verificado en pantalla: la semana sale igual (275 UA, 10 sesiones, 4/10
realizadas, Lun…Dom) y las tarjetas de bloques pintan sus 4 mesociclos.

Verificado: `tsc` 0 · **976 tests** · `next build` OK.

---

## Módulo 3 — Paneles (2026-08-23) · cerrado

**Panel del entrenador**: seis consultas que no dependen unas de otras iban en
serie. Y el mesociclo pasaba antes por el macrociclo solo para acotar — con
`mesociclo.id_deportista` sobra ese salto. Ahora es una ronda.

`lib/sugerencias-entrenador.ts` + 16 tests saca el bloque «Necesita tu atención»:
qué tiene pendiente el entrenador con el atleta que mira. Estaba dentro de la
pantalla, entre las consultas que lo alimentaban y con aritmética de fechas a
mano. Un test fija el umbral: **justo al cumplirse los 28 días ya avisa** — un
`>` en vez de `>=` deja el aviso mudo el día que toca, de esos que nadie
reporta. Y ahora dice «empieza mañana» en vez de «empieza en 1 días».

**Panel del deportista**: fuera la cadena de tres saltos `macrociclo →
mesociclo → microciclo` que solo servía para acabar preguntando por un rango de
fechas. Las del plan y las libres pasan a ser **una** consulta, y con eso
desaparece otra vez el mismo parche: las libres iban por su lado porque las del
plan cortaban si no había microciclos.

**Fuera la última recarga dura de la app.** Vincularse con un entrenador hacía
`location.reload()`. Para quitarla hubo que sacar `cargar` del `useEffect` a un
`useCallback`, y ahora el checklist avisa y el panel relee lo suyo.

    grep -rn "location.reload()" app components lib   →   0

Verificado en pantalla el del entrenador: 10 sesiones, `D · HOY` y las cuatro
sugerencias. **El del deportista NO se ha podido ver** —requiere entrar como
atleta— así que ahí solo hay `tsc` y build.

Verificado: `tsc` 0 · **992 tests** · `next build` OK.

---

## Módulo 4 — Ficha del deportista (2026-08-23) · cerrado

Trece consultas en serie, con la cadena de tres saltos otra vez. Ahora las tres
consultas de sesiones van juntas y por `id_deportista`.

**Y con eso entran las sesiones libres.** Las que el atleta se añade por su
cuenta no contaban ni en la curva de forma, ni en la adherencia, ni en «últimas
sesiones»: quien entrenaba por libre salía en su ficha **como si no entrenara**.

### La curva de forma estaba escrita cuatro veces

Al tocar la ficha apareció que reimplementaba la EWMA a mano. Y no era la única:
estaba en `panel-metricas`, en `/carga`, en `CargaPorDisciplina` y aquí — cada
una con sus constantes copiadas.

El comentario de `panel-metricas` decía que se habían unificado, pero **lo
unificado fueron las etiquetas** (`estadoTSB`); el cálculo seguía repetido. Un
cambio de tau en una copia habría dado dos curvas distintas para el mismo atleta.

`serieForma(porDia)` + `TAU_ATL` / `TAU_CTL` son ahora el núcleo, con tests que
fijan las constantes y la propiedad que hace que el modelo signifique algo: la
fatiga se mueve **cinco veces más rápido** que la condición, y por eso el TSB se
vuelve positivo tras unos días de descanso.

Lo que **no** se comparte es de dónde sale la carga de cada día: una pantalla
pondera por disciplina, otra por brick, otra no pondera. Eso es de cada una.

    grep "2/43" app components lib   →   solo serieForma

Verificado en pantalla (sesión de atleta abierta por el usuario): el panel del
deportista con su checklist «1 de 2» y la semana correcta, y `/mis-analisis` con
sus 20 sesiones y sus UA.

Verificado: `tsc` 0 · **1.003 tests** · `next build` OK.

---

## Módulo 5 — Análisis (2026-08-23) · cerrado

| Pantalla | Antes | Ahora |
|---|---:|---:|
| `/carga` | 9 consultas en serie | 1 |
| `/volumen` | 11 | 2 |
| `/indices` | 6 (+ N+1 de 20) | 2 |
| `/eco` | ya iba en paralelo | — |

**Lo peor que ha aparecido en todo el pase** estaba en `/carga`:

```
supabase.from('microciclo').select('id, mesociclo(id, macrociclo(id_deportista))')
```

Sin un solo `.eq()`. Traía **la tabla entera de microciclos** con dos joins
anidados y filtraba el deportista **después, en JavaScript**. RLS lo acotaba a
los atletas del entrenador, así que no era un agujero — pero traía los de todos
para quedarse con los de uno, y eso empeora con cada alta.

Y en la misma pantalla, **dos criterios distintos de papelera**: las sesiones del
plan la filtraban y las libres no, así que una sesión borrada del atleta contaba
en la visión diaria y no en la curva.

`/indices` tenía un **N+1 de veinte consultas**: una de tareas por cada sesión.
Ahora es una con `in` y se reparte en memoria. Y entran las sesiones libres, que
también tienen RPE reportado y también dicen si percibe más duro de lo previsto
— que es de lo que va esa pantalla.

**La adherencia de `/volumen` se queda como estaba, a propósito**: mide lo que
cumplió de lo que le PLANIFICARON, así que las que se añade el atleta no entran
ni arriba ni abajo de la fracción. Antes eso salía de acotar por microciclo;
ahora se dice explícito con `not is null`, que significa lo mismo pero se lee.

**Sin verificar en pantalla**: las tres son pantallas de entrenador y la sesión
abierta es de atleta. Solo `tsc`, tests y build.

Verificado: `tsc` 0 · **1.003 tests** · `next build` OK.

---

## Módulo 6 — El resto · en curso

### Los componentes del plan (2026-08-23)

`Adherencia`, `GraficaCarga` y `CargaPorDisciplina` tenían **la misma cadena
idéntica** de cuatro consultas —macrociclo → mesociclo → microciclo → sesión—
para acabar pidiendo las sesiones de un atleta. Una consulta cada uno.

Y con eso **entran las sesiones libres** en la adherencia y en las dos curvas de
carga: antes se quedaban fuera por colgar de ningún microciclo.

### La papelera tenía un bug, no solo una cascada

Se llenaba recorriendo la cadena y pidiendo lo borrado **de esos microciclos**.
O sea que **una sesión libre borrada no aparecía nunca**: el atleta que se añade
un entrenamiento por su cuenta y luego lo borra se lo encontraba en la papelera…
que no lo enseñaba. **Irrecuperable, y sin ningún error.**

Toda la cadena existía además solo para averiguar de quién era cada sesión, y
`sesion.id_deportista` lo dice directamente.

### `mis-sesiones`

Las del plan y las libres, en una consulta. Antes eran dos ramas y una cadena de
tres saltos, con las libres colgando de un `if` que solo se evaluaba después por
casualidad.

Verificado en pantalla: `/mis-sesiones` con «Dom 23 Agosto · Hoy» y los días
siguientes correctos. **La papelera no se ha podido ver** (es pantalla de
entrenador y la sesión abierta es de atleta).

Verificado: `tsc` 0 · **1.003 tests** · `next build` OK.
