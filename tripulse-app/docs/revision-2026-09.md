# Revisión de la aplicación entera — septiembre de 2026

Tercer repaso completo. Los dos anteriores:

- **2026-07-23** (`tripulse-revision-bugs`): miró las pantallas **una a una**.
  20+ bugs.
- **2026-08-22/24** (`docs/pulido.md`): miró lo que **se repetía entre ellas**.
  9 bugs más, ninguno buscado.

La lección de aquello está escrita y vale aquí: **son dos barridos distintos y
hacen falta los dos.** Este empieza por el segundo, porque desde agosto la app
ha crecido de 51 a 62 páginas y de 93 a 314 ficheros de código.

---

## El método

De `docs/pulido.md`, y no se cambia porque es lo que impide romper cosas:

1. **Una categoría por tanda.** No se mezcla «quitar duplicados» con «arreglar
   fechas»: si algo se rompe, hay que saber qué fue.
2. **Primero se cubre, después se toca.** La lógica sale a `lib/` con tests
   antes de tocar la pantalla. Ninguna pantalla tiene test: `tsc` no ve la
   lógica.
3. **Nada de cambios de comportamiento por el camino.** Si aparece un bug se
   anota en el backlog y se arregla aparte, con su commit.
4. **Verificar**: `tsc` limpio + tests en verde + `next build` OK.
5. **Un commit por tanda**, con el porqué en el mensaje.
6. **Rebarrer con otra consulta** (`rebarrer-con-otra-consulta`): al cerrar una
   categoría, buscarla otra vez de otra forma —por el fragmento corto, por la
   otra punta del patrón, por el nombre de lo que se acaba de crear— y **decir el
   resultado aunque salga vacío**.
7. **Dejar un guardián**, no una promesa: un test que LEE EL CÓDIGO y no deja
   volver a escribirlo mal.

### El límite de este repaso, dicho antes de empezar

**No se puede entrar en la app con una sesión de verdad** (ver
`tripulse-auditoria-movil` y `tripulse-verificacion-navegador`). Así que:

- Lo que se puede comprobar solo: el código, los tests, la base de datos y el
  build.
- Lo que **tiene que comprobar el usuario**: que la pantalla se ve bien y hace
  lo que dice. Con capturas o pulsando él.

Por eso cada tanda dice **qué mirar** cuando se despliegue.

---

## Lo medido (2026-09-26)

| Señal | Agosto | Hoy |
|---|---|---|
| Páginas | 51 | **62** |
| Rutas de API | — | 13 |
| Ficheros de código (`app`+`lib`+`components`) | 93 | **314** |
| Ficheros de test | ~40 | **156** (3.163 tests) |
| `'use client'` | 77 de 93 | 132 de 314 |
| Ficheros > 900 líneas | 6 | **13** |
| Nombres declarados en más de un fichero | 17 | **109** |

Los seis ficheros más gordos (y dónde está el riesgo):

```
3.319  app/planificacion-visual/[id]/dibujo/page.tsx
2.210  app/sesion/[id]/tareas-tabla.tsx
2.201  app/laboratorio/page.tsx
1.922  app/planificacion-visual/[id]/calendario/page.tsx
1.390  app/tests/[id]/page.tsx
1.375  app/sesion/[id]/page.tsx
```

Consultas por módulo (`.from(`) y cascadas (`await` en serie / `Promise.all`):

| Módulo | Consultas | Líneas | await / all |
|---|---|---|---|
| `lib` | 236 | 31.338 | 234 / 19 |
| `app/planificacion-visual` | 127 | 6.995 | 154 / 8 |
| `app/sesion` | 127 | 6.771 | 140 / 10 |
| `components` | 82 | 11.425 | 140 / 14 |
| `app/mesociclo` | 28 | 832 | 23 / 4 |
| `app/deportistas` | 24 | 1.553 | 26 / 4 |

---

## El rebarrido de las familias que ya mordieron

Lo que se buscó y lo que salió. **Las que salen limpias también se dicen**: eso
es información, no relleno.

| Familia | Resultado |
|---|---|
| `eq('eliminada', false)` (mataba las filas con `eliminada` null) | **limpio, 0** |
| `console.log` olvidado | **limpio, 0** |
| «invisible pero pulsable» (`opacity-0 group-hover` sin `sm:`) | **limpio**: los 4 hits son adornos (un resplandor, una flecha, un vídeo de fondo), ningún botón. El del calendario lleva su `hidden sm:flex`. |
| «hoy en UTC» (`toISOString()` recortado a día) | **limpio**: los 7 hits usan el truco del mediodía (`+ 'T12:00:00'`), `'T00:00:00Z'` + `setUTCDate`, o el helper `ymd()` local. El guardián `lib/fechas-sin-reloj.test.ts` sigue verde. |
| `setHours(0,0,0,0)` + serializar | **limpio**: `mis-sesiones` serializa con `ymd()` (local), y el calendario compara objetos `Date`, no cadenas. |
| Cadena `macro→meso→micro` | 11 hits de `in('id_microciclo'`, **pendientes de mirar uno a uno** (la mayoría parecen legítimos: las sesiones DE un plan). |

---

## Backlog, por lo que puede morder

### 1. La lista de disciplinas sigue escrita a mano — y una pantalla se come el híbrido

**Fallo real y visible.** `app/mesociclo/[id]/vista/page.tsx:20`:

```
const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']
```

Lo usan el recuento por disciplina (`:211`) y la tabla (`:379`). Una sesión
**híbrida no aparece en el desglose** del mesociclo: es el mismo fallo que
tuvieron los bricks y que el catálogo existe para evitar. Y no es la única lista:

| Fichero | Lista | Qué se pierde |
|---|---|---|
| `app/mesociclo/[id]/vista:20` | sin Brick ni Híbrido | el desglose del mesociclo |
| `lib/actividades-reloj:73` | sin Híbrido | traducir una actividad del reloj |
| `app/grupo/[id]:25` | solo las 3 de resistencia | (ver si es a propósito) |
| `app/fuerza:11` | `['Natación', …]` **con tilde** | las etiquetas de la biblioteca |
| `app/laboratorio:56` | `['Carrera','Ciclismo','Natación','Fuerza','Otro']` | ver el punto 2 |
| `app/tests-propios:39` | `['Carrera','Ciclismo','Natacion','Fuerza','Otro']` | ver el punto 2 |

Legítimas y documentadas (no se tocan): `DISCIPLINAS_BRICK` (un brick solo
encadena resistencia), `DISCIPLINAS_SICAT` (el coste se midió en tres), y las de
Comunidad (intereses, otro vocabulario).

### 2. La misma columna escrita de dos formas: `test_definicion.deporte`

**Bomba de relojería, todavía sin estallar.** `/laboratorio` y `/tests-propios`
escriben **la misma tabla y la misma columna** con listas distintas: una con
tilde («Natación») y otra sin ella («Natacion»).

En producción hay 2 filas y las dos están sin tilde, así que **aún no hay datos
mezclados**: se arregla ahora y no hace falta migración.

Hoy no rompe porque `lib/ancla-propia.normalizaDeporte` hace
`s.startsWith('Nat')` — que es, además, **la tercera implementación** de la regla
de la tilde en la app (el catálogo tiene `normalizar`; `lib/atajos-intensidad`
tenía la suya, ya delegada). `startsWith('Nat')` también diría que «Natural» es
natación.

### 3. `mmss`: un nombre, tres significados, y un «1:60»

**Nueve declaraciones** de `mmss` y tres comportamientos:

- `lib/duracion-carga.mmss(seg)` — la buena, pero **no redondea**: con 90,5
  segundos escribe `1:30.5`.
- Seis copias locales con `Math.round(s % 60)` — con 119,6 segundos escriben
  **`1:60`**.
- `app/sesion/[id]/ejecutar/BloqueRegistro.mmss(ms)` — **milisegundos**, mismo
  nombre.

Y en la otra dirección, `mmssASeg` / `mmssASegundos` en tres sitios con
`lib/medicion.mmssASegundos` como la buena.

Es exactamente la trampa de agosto («4 copias, 2 comportamientos»), otra vez.

### 4. Dos puertas que no llevan al login

`app/sesion/[id]/ejecutar` (20 consultas) y `app/zonas/[id]` (4) no comprueban
la sesión. **No hay fuga**: las consultas van con la clave pública y las
protege la RLS. Lo que pasa es que sin sesión la pantalla sale **rota en vez de
mandarte a entrar**. `app/asistente` y `app/periodizacion` no consultan nada.

### 5. `lunesDe`, el impostor

Tres implementaciones: la buena (`lib/fechas.lunesDe(iso)`, en UTC y con tests),
otra en `app/dashboard-deportista:29` que recibe un `Date`, y **una tercera en
`components/PlanCadena:35` con el mismo nombre y la misma firma que la buena**.
Es el caso que ya pasó con `hoyISO`: mismo nombre, implementación propia.

### 6. Peso, no fallos (van al final)

- **`select('*')` ×60.** En agosto se decidió: se recortan **de una en una y con
  la pantalla delante**, porque recortar la columna equivocada **rompe en
  silencio**.
- **El avatar duplicado ×5**: `GRADS` + `grad` + `inicial` copiados en
  comunicación, dashboard, ficha del deportista, eco y uno más.
- **`alert()` ×20** en pantalla.
- **Dos recargas duras** (`dashboard-deportista`, `ResumenBrick`).
- **`max-height` a ojo ×4** (`volumen`, `wellness-entrenador`, `PanelSemana`;
  el de `SelectorEjercicio` es un contenedor con scroll, ese está bien). La
  familia que dejó «Tests propios» invisible en septiembre.
- **10 páginas sin estado de carga** (la mitad son estáticas: términos,
  privacidad, portada).

---

## Registro

### Tanda 1 — la lista de disciplinas, al catálogo · CERRADA (2026-09-26)

**Tres fallos reales, dos de ellos con números o datos por medio.**

**1. La vista del mesociclo se comía el híbrido.** `DISCIPLINAS` escrita a mano
con cuatro nombres alimentaba el recuento de sesiones por disciplina y la tabla
de reparto. Ahora es `TODAS`, y la etiqueta sale de `etiquetaDisciplina` (antes
se pintaba la clave: «Natacion» sin tilde). **Se ven dos filas más**, brick e
híbrido, a 0 cuando no hay.

**2. El filtro del dibujo se comía los bricks.** `filtroDisc` arrancaba con los
cinco deportes, y un chip de brick (`disciplina = 'Brick'`, que es lo que pone
`chipsDeSesiones`) **no pasaba el filtro y no se dibujaba nunca** — sin botón
para encenderlo, porque los botones salían de la misma lista. En producción hay
**3 sesiones de brick**. Ahora el filtro y sus botones son `TODAS`, y la
comparación normaliza la tilde (un chip de «Natación» de una sesión vieja
tampoco habría pasado).

**3. `/volumen`: las barras no sumaban el total.** Lo encontró el REBARRIDO, no
la primera búsqueda: la misma lista disfrazada de claves. Cuatro cubos
`{ Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }` y **dos se habían quedado
sin `Hibrido`**. `acumularCargaDisc` descarta lo que no tiene casilla
(`if (bucket[d] !== undefined)`) pero suma al total igual, así que la carga
híbrida **desaparecía de las barras de evolución (semanas y meses) y seguía
contando en el total**. Los cuatro cubos salen ya del catálogo.

**Y una bomba desactivada antes de estallar.** `/laboratorio` y `/tests-propios`
escriben la MISMA columna (`test_definicion.deporte`) y tenían listas distintas:
una con tilde («Natación») y otra sin ella. En producción hay 2 filas y las dos
están sin tilde, así que **no hizo falta migrar**: ahora las dos pantallas usan
`DEPORTES_TEST` (ids del catálogo + «Otro») y enseñan la etiqueta con
`etiquetaDisciplina`, así que se ve «Natación» y se guarda `Natacion`.

**Lo que se ha derivado, en vez de escribirse:**

| Antes | Ahora | Dónde |
|---|---|---|
| `['Natacion','Ciclismo','Carrera']` | `DISCIPLINAS_CON_PLANTILLA` | `lib/plantillas` → el desplegable de la sesión de grupo |
| `['Carrera',…,'Otro']` ×2, con y sin tilde | `DEPORTES_TEST` | `lib/test-definicion` → /laboratorio y /tests-propios |
| 4 nombres a mano | `TODAS` | `mesociclo/vista`, filtro del dibujo, recuento de la semana |
| 5 nombres a mano | `DEPORTES` | leyenda de `mis-sesiones`, disciplinas activas de `/volumen` |
| `startsWith('Nat')` | `normalizar` del catálogo | `lib/ancla-propia` (era la 3.ª copia de la regla de la tilde) |
| 4 nombres a mano | `TODAS` | `lib/actividades-reloj` (qué acepta de un reloj) |

**El guardián**: `lib/listas-disciplina.test.ts`. Salta con una lista de
**cuatro o más** disciplinas escritas a mano, en array **o como claves de un
objeto** (las dos formas, porque la segunda es la que se me escapó en la primera
búsqueda). Dos o tres son un subconjunto con motivo de deporte y no salta; los
ocho sitios con motivo largo están en su lista de permitidos, cada uno con el
porqué.

**Qué mirar al desplegar** (esto no lo puedo comprobar yo):

1. **Vista de un mesociclo** → el desglose «por deportes» ahora lista seis, con
   brick e híbrido a 0 si no hay. ¿Molesta o está bien?
2. **Dibujo** → en el filtro hay un botón más, **Brick**, y si el atleta tiene
   bricks programados sus chips deberían aparecer ya en el lienzo.
3. **/volumen → evolución por semanas y por meses** con un atleta que tenga
   sesiones híbridas: las barras deberían sumar ya el total.
4. **/laboratorio y /tests-propios** → el desplegable «Deporte» dice «Natación»
   con tilde en los dos, y el orden cambia (natación primero, como el catálogo).
5. **Semana de la planificación** → el recuento por deporte de la derecha cuenta
   también los bricks.

Verificado: `tsc` limpio · **3.173 tests en 157 ficheros** · `next build` OK.

### Tanda 2 — `mmss`: un nombre, tres significados · CERRADA (2026-09-27)

**El «3:60» estaba vivo en SIETE pantallas**, y la tanda empezó buscando nueve
declaraciones de `mmss`. Acabó con veintitantos sitios.

**El fallo.** Seis copias hacían `Math.round(seg % 60)`: redondear los segundos
**sin arrastrar el minuto**. Con 239,7 segundos eso escribe `3:60` en vez de
`4:00`, y a los ritmos les llegan siempre segundos con decimales porque
`3600/velocidad` casi nunca es entero. Cae ahí **1 de cada 120** ritmos (5 de
cada 600 décimas). Y la que se daba por buena —la de `lib/duracion-carga`— no
redondeaba nada: escribía `1:30.5`.

Dónde se veía el `3:60`:

| Pantalla | Qué escribía mal |
|---|---|
| `/zonas/[id]` | los ritmos de cada zona del atleta |
| `/mis-tests` | el rango de ritmo por zona |
| `/mis-analisis` | la duración de cada pareja de la sesión |
| el rótulo del «@» (`lib/referencia-zona`) | el ritmo prescrito y su rango |
| las fichas de test (`lib/tests-formulas`) | «4:12 /km» desde la VAM y el CSS |
| `lib/prescripcion-zona` | el tramo escrito del editor |
| `lib/zonas` | el ritmo objetivo |

**Y el mismo nombre para tres cosas**: `mmss(seg)` (segundos), `mmss(ms)` en
`BloqueRegistro` (milisegundos) y, en `/apuntar`, una DIFERENCIA con signo
(«+1:20» si te pasas). Más tres lectores `mmssASegundos` idénticos.

**Ahora**: el formato vive en `lib/medicion`, al lado de su inversa, en un
fichero **que no importa nada** — así lo puede pedir hasta `lib/zonas`, que es
quien escribe los ritmos, sin montar un círculo de importaciones.
`lib/duracion-carga` lo reexporta porque media app lo pide ahí. El redondeo se
hace **una vez y sobre el total**, así que el minuto se lleva el acarreo. Y lo
que no es un número sale `0:00` en vez de `NaN:NaN`.

Lo propio de cada sitio se queda en su sitio, delegando el formato: el `—` del
catálogo de tests (un hueco no es «0:00»), el `null` de la casilla vacía de
`BloqueRegistro`, el signo de `/apuntar`, las décimas de los cronómetros y el
`h:mm:ss` del briefing.

**LO QUE ENSEÑÓ EL REBARRIDO, que es la parte importante.** La primera búsqueda
—por el nombre `mmss`— encontró nueve. El alambre, buscando por la **forma**,
encontró **once más** que lo escribían con plantillas (`${min}:${seg…}`) y no se
llamaban `mmss`: entre ellos, **cinco de los siete `3:60`**. Si me hubiera fiado
del nombre, la tanda se cierra dejando el fallo vivo en las pantallas del
deportista.

El guardián acabó siendo preciso a base de eso: salta con **unos segundos a dos
cifras justo detrás de un dos puntos que se imprime**. Así caza las cuatro
formas y deja fuera lo que no es un m:ss: el «2h05» de horas y minutos (otra
familia, con sus propias copias — ver abajo), las fechas y los `(d: Date)`.

Rebarrido con otras cuatro consultas —el truco viejo `('0'+s).slice(-2)`,
`padStart` sin el cero, `toFixed` sobre los segundos y cualquier `mmss`
declarado— **todo limpio**.

Verificado: `tsc` limpio · **3.185 tests en 158 ficheros** · `next build` OK ·
sin avisos nuevos de lint.

**Qué mirar al desplegar:** los ritmos de `/zonas/[id]` y `/mis-tests`, y la
duración de las parejas en `/mis-analisis`. Si alguna vez viste un «3:60» o un
«1:30.5», era esto.

### Tanda 3 — las primitivas de tiempo que quedaban · CERRADA (2026-09-27)

**Sin ningún fallo vivo, y esa es la noticia.** Las dos familias que quedaban
—«qué lunes es» y «2h05»— daban el mismo resultado en todas sus copias. Se
cierran igual, porque el riesgo no es que hoy discrepen: es que discrepen el día
que alguien cambie la regla en una sola.

**1. «Qué lunes es», escrito CUATRO veces.** Una de ellas en
`components/PlanCadena` **con el mismo nombre y la misma firma** que la buena
—el caso del impostor, que ya costó un bug con `hoyISO` en agosto—, otra en el
panel del deportista con `Date` en vez de cadenas, y otras dos en
`/mis-sesiones` (esas las encontró el alambre, no yo).

Las cuatro daban el mismo lunes. Para no fiarme de mi lectura, el test **compara
las implementaciones viejas con la del catálogo día a día durante 400 días**: si
mañana alguien cambia la regla (un cliente que empiece la semana en domingo), ese
test dice que ya no coinciden, y entonces se borran las viejas en vez de
«arreglar» el test.

De paso, el panel del deportista pasa a manejar los días como **cadenas** con
`lib/fechas`, que es la regla de la casa: tenía su propio `addDays`, su propio
`lunesDe` y el `toISOString()` que de madrugada enseñaba el día de ayer.

**2. «2h05», escrito SEIS veces y con TRES comportamientos.** Cuatro copias sin
el «00» de las horas exactas («2h»), una con él («1h00», que es lo que alinea la
tabla de tiempos de `/pacing`) y otra con espacios («7 h 12», el sueño). Las tres
hacen falta —son decisiones de cada pantalla—, así que ahora son **dos funciones
con nombre propio** en `lib/medicion`, al lado del m:ss:

- `horasMinutos(min, vacio)` → «45′», «2h», «2h05». El `vacio` es lo que sale con
  0, y no es lo mismo en todas: un «0» en un total y un «—» donde un hueco es un
  hueco.
- `horasExactas(min, sep)` → «1h00», y con el separador de cada sitio, «7 h 12».

El guardián: `lib/primitivas-de-tiempo.test.ts`, que salta con las tres formas de
sacar el lunes a mano y con las dos de escribir «2h05».

Rebarrido con tres consultas más —todos los `getDay()`/`getUTCDay()` de la app,
todos los `const lunes =` y todos los `'h' +`—: **limpio**. Solo quedan el
catálogo y un rótulo de hora («14h») que no es una duración.

Verificado: `tsc` limpio · **3.195 tests en 159 ficheros** · `next build` OK ·
sin avisos nuevos de lint.

**Qué mirar al desplegar:** el **panel del deportista** (la semana de un vistazo
y «planificadas esta semana») y la **vista de semana de /mis-sesiones**, que son
las dos pantallas donde el «qué lunes es» ha cambiado de implementación. Y el
volumen en horas de `/volumen` y del panel del entrenador.

### Tanda 4 — las puertas · CERRADA (2026-09-27)

**No había ninguna fuga, y conviene decirlo primero.** En TRIPULSE no hay
`middleware.ts` ni guardia en el layout: **cada página se protege sola**. Eso
funciona hasta que una se olvida — y cuando se olvida no se nota, porque la RLS
hace su trabajo y la pantalla simplemente sale vacía.

Tres pantallas no comprobaban nada:

- **`/sesion/[id]/ejecutar`** (20 consultas). Con la sesión caducada se quedaba
  **cargando para siempre y en blanco**, en medio de un entrenamiento, en vez de
  mandar al login. Ahora pide **sesión, no rol**: esa pantalla la usan el atleta
  y el entrenador.
- **`/zonas/[id]`** (4 consultas). Igual: «Cargando…» para siempre. Se abre desde
  la ficha del deportista, así que es del entrenador.
- **`/asistente`**. Pintaba el copiloto entero para luego no contestar, porque el
  candado de verdad está en `/api/asistente`.

**El rebarrido, y la lección de método.** Buscando «quién comprueba la sesión»
por una lista de nombres —`getUser`, `getSession`, `usuarioActual`— aparecieron
**cinco rutas de reloj con cero coincidencias**, y parecía un agujero grande. No
lo era: todas usan `quienLlama(req)`, que exige un Bearer, lo valida con
`auth.getUser(token)` y devuelve un cliente **atado a ese usuario**, así que la
RLS se aplica como él. Y los dos *callbacks* de OAuth llegan sin sesión a
propósito: quién es sale de un `state` aleatorio **de un solo uso** que gasta la
base. **La consulta era estrecha, no el código.**

El guardián (`lib/puertas-con-sesion.test.ts`) cubre las dos puertas:

1. Toda página que consulte la base comprueba la sesión, o está en la lista de
   públicas con su motivo (login, registro, invitación por token). Las de
   recuperar la contraseña no están: no consultan la base, solo hablan con
   `auth`.
2. Toda ruta de API usa `quienLlama`, salvo los dos *callbacks*, y de esos se
   comprueba que el `state` **viaja a la base** —mirarlo en la ruta y creerse lo
   que dice no sería comprobar nada—.

Verificado: `tsc` limpio · **3.200 tests en 160 ficheros** · `next build` OK ·
sin avisos nuevos de lint.

**Qué mirar al desplegar:** entra en `/sesion/<id>/ejecutar` y en
`/zonas/<id>` **con sesión** y comprueba que siguen funcionando igual; y si
puedes, en una ventana privada, que ahora te manda al login en vez de dejarte
mirando una pantalla en blanco.

### Tanda 5 — el alto escrito a mano · CERRADA (2026-09-27)

La familia estaba **casi** cerrada: los tres desplegables de verdad
(`/dashboard`, la ficha del deportista y `/eco`) ya medían su contenido con
`useAltoDeContenido`. Pero quedaba la bomba en el CSS:

```
.tp-collapse.open { max-height: 460px; }
```

Ese 460 no molestaba porque los tres pasan su alto medido por `style`, que gana
al CSS. Molestaría **el día que alguien escriba un desplegable nuevo y no mida**:
se llevaría el mismo recorte silencioso que dejó «Tests propios» y «Zonas
propias» fuera del panel en septiembre.

Ahora el respaldo es `max-height: none`: quien no mida **pierde la animación**
(de 0 a `none` no se puede interpolar) pero **no pierde contenido**. Perder la
animación se ve; perder media pantalla en silencio, no.

Los cuatro `max-h-[Npx]` que quedan (`/volumen`, `/wellness-entrenador`,
`PanelSemana`, `SelectorEjercicio`) **no son de esta familia**: son cajas con
`overflow-y-auto`, o sea con barra. Ahí el número dice cuánto se ve antes de
hacer scroll, y no se pierde nada.

El guardián: `lib/alto-medido.test.ts` — el CSS no puede volver a llevar un
número, y todo fichero que abra un `.tp-collapse` tiene que medir y pasar el alto
por `style`.

### Tanda 6 — el avatar, un color por nombre · CERRADA (2026-09-27)

**Un fallo pequeño y visible**: en `/volumen` el avatar del atleta era **siempre
naranja**, mientras en el resto de la app es del color de su nombre. La misma
persona, dos colores según la pantalla — y el color es justo lo que hace que la
reconozcas antes de leer.

Las tres piezas (`GRADS`, `grad`, `inicial`) estaban copiadas en **cinco**
pantallas, y en tres de ellas el **mismo componente `Avatar` entero**, línea por
línea. Ahora: `lib/avatar` (`coloresDe`, `inicialDe`, `fondoDe`) y
`components/Avatar`. El panel y la ficha del deportista siguen con su marcado
propio —le ponen una sombra del color— pero piden las piezas en vez de copiarlas.

De paso, `coloresDe` **recorta el nombre** antes de calcular: en esta base hay
nombres con un espacio de sobra, y «Ana» y «Ana » no son dos personas de dos
colores.

El guardián: `lib/avatar-un-solo-sitio.test.ts`. El escudo de un club queda
permitido con su motivo (lleva el naranja de la marca mientras no suban su logo,
y no es una persona).

Verificado (las dos tandas): `tsc` limpio · **3.211 tests en 162 ficheros** ·
`next build` OK · sin avisos nuevos de lint.

**Qué mirar al desplegar:** el avatar del atleta en `/volumen` —ahora del color
de su nombre, no naranja— y que los desplegables del panel, de `/eco` y de la
ficha del deportista siguen abriéndose con su animación y enteros.

### Tanda 7 — la cadena del microciclo, tercera vuelta · CERRADA (2026-09-27)

Esta es **la familia de bugs más caras del proyecto**, y ya van tres vueltas:

- **Julio**: «las sesiones libres no se manejaban bien en muchos sitios».
- **Agosto**: la cadena `macrociclo → mesociclo → microciclo` en **catorce**
  pantallas, «el mismo bug catorce veces, uno por sitio donde alguien copió la
  cadena».
- **Ahora**: quedaban **nueve** sitios pidiendo las sesiones por
  `in('id_microciclo', …)`. Seis eran la pareja «las del plan + las libres»
  —correcta, pero dos viajes— y **dos eran el bug otra vez**:

**Los índices del panel del entrenador.** Pedían las últimas veinte realizadas
**solo de los microciclos del plan**, sin la consulta de las libres que sí tenían
las otras cuatro métricas del mismo fichero. Así que las sesiones que se añade el
atleta no contaban para los índices de percepción, y **un atleta sin plan no
tenía índices en absoluto**.

**La gráfica de periodización.** Tres viajes encadenados
(`macrociclo → mesociclo → microciclo`) para acabar pidiendo las sesiones de esos
microciclos: lo que el atleta se añade **no contaba como «carga real»**, así que
la barra de lo hecho salía por debajo de lo que había entrenado.

Y una consulta que se traía **todos los microciclos de todos sus atletas** —sin
filtro, con dos tablas anidadas— para quedarse en memoria con los de uno
(`components/PlanCadena`). El microciclo lleva su `id_deportista` desde la Fase A.

**La regla, ahora en un test:** para saber qué ha entrenado alguien se pregunta
por `eq('id_deportista', …)`. La sesión lo lleva y su RLS garantiza que está
relleno —una fila sin dueño no la ve nadie—, así que esa única consulta trae las
dos cosas: las del plan y las que se añadió él. Pedirlas por microciclo solo vale
cuando el **alcance es el plan**: borrar sus sesiones, rehacerlo, o mirar un
mesociclo concreto. Esos cuatro están permitidos con su motivo.

Lo que se ha quitado por el camino: **seis viajes a la base** en el panel del
entrenador, tres en la gráfica de periodización, dos en el SICAT y uno en cada
una de las otras. Y `getMicrosDeportista`, que se quedó sin consumidores.

El rebarrido, por otras tres vías —quién pide mesociclos para llegar a sesiones,
los joins anidados que traen el dueño por dentro, y quién filtra el dueño en JS
después de traérselo todo— **limpio**: el join anidado de `PlanCadena` era el
último que quedaba.

Verificado: `tsc` limpio · **3.215 tests en 163 ficheros** · `next build` OK ·
sin avisos nuevos de lint. El test del brick llevaba su maqueta con las sesiones
**sin** `id_deportista` (modelaba la realidad vieja): se ha puesto, porque en la
base lo llevan.

**Qué mirar al desplegar:** los **índices del panel** de un atleta que se añada
sesiones por su cuenta (o que no tenga plan: ahora debería tenerlos) y la
**gráfica de periodización**, donde la barra de carga real puede subir.
