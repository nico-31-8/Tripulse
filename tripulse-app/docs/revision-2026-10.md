# Revisión dirigida — octubre de 2026

Cuarto repaso, y el primero **dirigido**. Los tres anteriores fueron de la app
entera (ver `revision-2026-09.md`, que tiene el método completo). Este no,
porque los números no lo pedían:

| Desde el 28 de septiembre | |
|---|---|
| Páginas | 62 → **63** (una nueva) |
| Commits | **96** |
| Líneas | **+13.176** en 86 ficheros |

O sea: casi nada de superficie nueva y mucho cambio en profundidad, y muy
concentrado (el laboratorio solo, 35 commits en un fichero). Una cuarta pasada
entera habría repasado 62 páginas que no se han tocado.

Así que dos cosas, en tandas separadas:

1. **Una familia de fallos con nombre nuevo**, que salió tres veces en la misma
   semana sin que ninguna revisión la buscara: *un dato que se guarda a medias
   y se enseña como si estuviera entero*.
2. **Los ficheros que más han cambiado**, con las dos trampas que ya les
   mordieron.

El método no cambia (una categoría por tanda, primero se cubre y después se
toca, nada de cambios de comportamiento por el camino, `tsc` + tests +
`next build`, un commit por tanda, rebarrer con otra consulta, dejar un
guardián).

---

## Tanda 1 · «El primero, enseñado como el de todos»

### Cómo salió la familia

Tres casos en una semana, los tres desplegados ya:

- **La distancia real** de una tarea era la de UNA serie (`2e1689e`).
- **El segundo ejercicio de una superserie** no tenía grupo y sus series no se
  contaban (`43b4054`).
- **Las series de resistencia**: solo se guardaba la primera (`ba18deb`).

### Consulta 1: el primero que TIENE el dato

`.find(x => x.campo)?.campo` — coger el primer elemento que tenga un valor y
enseñarlo como el valor de todos.

| Dónde | Veredicto |
|---|---|
| **Ficha de sesión, tarjeta «Valoración post-sesión»** (`DatosReales`) | **FALLO.** RPE, sensación, dolor, FC media y notas salían de la primera tarea que los tuviera, rotulados como los de la sesión |
| `tests/[id]` — «última VAM / último FTP» | Correcto: la lista va por fecha y se quiere el último con dato |
| `CorregirSesion`, `traer-ultima-vez` — tipo de control | Correcto: todas las series de un ejercicio comparten tipo |
| `semana/[fecha]` — id de grupo al juntar chips | Correcto: busca uno existente |

**Medido en la base antes de tocar**: en **9 de 88** sesiones hechas las
tareas tenían RPE distintos, y en las 9 la tarjeta enseñaba uno que **no era
el de la sesión**. Con el pulso, otras 9. Con la sensación y las notas, 0: se
escriben iguales en todas las tareas, así que el fallo existía pero no se veía.

Y dentro del mismo fallo, otro: `find(t => t.rpe_reportado)` **se saltaba un
RPE de 0**, porque 0 cuenta como falso. La condición de pintar la tarjeta, lo
mismo; y además no veía ni el RPE de la propia sesión ni unas notas solas.

**Arreglo**: `valoracionDeSesion` en `lib/lo-que-hizo`.
- RPE: el de la **sesión** (el que usan carga, forma y ACWR, ver
  `lib/rpe-sesion`). Si no lo tiene, la media de sus tareas, y lo dice.
- Pulso: media **ponderada por lo que duró cada tarea** cuando todas lo dicen
  (diez minutos a 175 no pesan lo que una hora a 140); si no, simple. Si eran
  distintos, la tarjeta pone «media de N tareas».
- Notas: todas las distintas, no solo la primera.

Guardián: en `lib/lo-que-hizo.test.ts`, un test que **lee el código** de la
ficha y no deja volver a escribir `tareas.find(t => t.rpe_reportado)`. Probado
reponiéndolo: salta.

### Consulta 2, para rebarrer: el elemento `[0]` de una lista

`tareas[0]`, `ejercicios[0]`, `bloques[0]`… enseñado como el todo.

| Dónde | Veredicto |
|---|---|
| Tabla de tareas y briefing: el peso sale de `ejercicios[0]` | Correcto: los bloques (las únicas tareas con varios ejercicios) van por otra rama antes de llegar ahí (`esBloque(t)`) |
| `bricks`, `plantillas-propias`: `bloques[0].zona` | Correcto: es el valor INICIAL de un `reduce` que recorre todos |
| Líneas de cardio: `ejercicios[0].cardio_*` | Correcto: una línea de cardio es un ejercicio |
| `volumen`, `zonas-propias`, `dirigir` de grupo | Correcto: referencias de fecha o de plantilla |

### Latente, apuntado y NO tocado

- **`FuerzaRegistro`: el tipo de control de todos los ejercicios sale del
  primero** (`ejercicios[0]?.control_tipo`). Medido: de 374 tareas con
  ejercicios, 10 tienen varios y **ninguna** mezcla controles. Hoy no falla. Se
  apunta y no se toca, porque el protocolo no cambia por el camino algo que
  funciona.

---

## Tanda 2 · Los ficheros que más han cambiado: el vacío no es un cero

Categoría: **`Number()` de una casilla vacía**. `Number('')`, `Number(null)` y
`Number([])` valen 0, y `Number.isFinite(Number(''))` es VERDADERO —0 es
finito—, así que la comprobación que parece protegerte deja pasar el vacío.
Es la trampa que más veces ha mordido este proyecto, y el laboratorio —el
fichero que más cambió, 35 commits— es donde una casilla vacía es lo normal.

65 lecturas en los ficheros calientes, revisadas una a una:

| Dónde | Veredicto |
|---|---|
| **`valorDado`: columna que arranca de otra casilla** | **FALLO.** Con «Empieza en» vacío, la velocidad de una VAM se calculaba entera desde 0. Las plantillas traían el respaldo (`desde: 8`) y el código lo ignoraba en cuanto había casilla de referencia |
| **`columnaDeVelocidad`** | **FALLO.** `isFinite(Number(''))` → una lista con la 1.ª etiqueta en blanco pasaba por lista de velocidades: el reloj cantaba 0 km/h |
| **Editor de fórmulas: «Cambiarlo», «Poner el número», interpolar** | **FALLO** (más visible: el 0 aparece en la fórmula). Con la casilla vacía metían un 0 |
| La regresión (`pendiente`, `corte`, `interpola`) | Correcto: salta el vacío ANTES de convertir |
| `hechasDe`, el marcador «llegó hasta aquí» | Correcto: pide `> 0` |
| Contadores y pulsadores (`|| 0`) | Correcto: un pulsador vacío lleva 0 pulsaciones |
| Duraciones de tramos y relojes (`|| 0`) | Correcto: una duración vacía es 0 s para un reloj |
| `lab-guardar`, `volumen`, `semana-info`, `historial` | Correcto: con su guarda |

**Medido antes de tocar**: hay **0 tests del laboratorio guardados** en la base
(está en pruebas), así que ningún resultado guardado salió mal. Pero 3 de las 10
plantillas arrancan de una casilla —la VAM entre ellas—, o sea que el fallo lo
alcanzaba cualquiera que borrase esa casilla.

**Arreglo**: `deCasillaOFijo` en `lib/lab-constructor` (si la casilla está
vacía o no es un número, el fijo de la columna; un 0 escrito a propósito sigue
siendo 0), `!vacio` antes de `isFinite` en la columna de velocidad, y en el
editor de fórmulas **`numeroONada`, que ya existía** en `lib/corregir-sesion` con
esa misma regla («vacío es `null` y no cero»): no se escribió otro.

Los tests nuevos del motor se escribieron **antes** del arreglo y fallaban
(`expected 0 to be 8`); el de la columna de velocidad, después, y se comprobó
que falla con la comprobación de antes.

Guardián: `lib/vacio-no-es-cero.test.ts`, lee el código del motor y de la
pantalla. Probado reponiendo la lectura vieja: salta.

### Apuntado y no tocado

- `numeroONada` vive en `lib/corregir-sesion` y ahora lo usa también el
  laboratorio. Funciona, pero su sitio natural sería un módulo neutro; moverlo
  es tocar los imports de otro módulo, y eso es otra tanda.

---

## Lo que queda para la próxima

- Las **62 páginas que no se han tocado** desde septiembre siguen revisadas por
  la tercera pasada. La siguiente entera, cuando la app crezca en superficie.
- **`FuerzaRegistro`** y el control del primer ejercicio (latente, tanda 1).
